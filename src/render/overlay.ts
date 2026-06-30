/**
 * Draws the 2D overlay for a plot — the orbit polyline, the draggable white
 * point, and its coordinate label — onto a canvas stacked over the WebGL one.
 * The orbit is computed on the CPU with the expression evaluator (a handful of
 * iterates), so it costs nothing to redraw during interaction.
 *
 * Overlay sizes mirror the old CindyScript (`size->1.8` line, `size->15` text)
 * scaled by `size/500`, so the on-screen look matches and high-res export stays
 * proportional.
 */

import type { Vec2 } from "../arrays";
import { formatComplex, truncateComplex, type Complex } from "../complex";
import type { Node } from "../expr/ast";
import { getComplexFn, getEscapeFn } from "../expr/evaluate";
import { fareyLabels } from "./farey";
import { inverseJuliaCloud } from "./inverseJulia";
import { bulbRayAngles, dynamicRay, parameterRay, rayDepthForZoom } from "./rays";
import { siegelInvariantCurves } from "./siegelCurves";
import { reconstructBoundary } from "./uniformize";

const OVERLAY_BASE = 500;

/** Map a plot coordinate to overlay pixel coordinates (y flipped for 2D canvas). */
export function plotToPx(pt: Vec2, center: Vec2, zoom: number, size: number): Vec2 {
  const ux = ((pt[0] - center[0]) * zoom + 1) / 2;
  const uy = ((pt[1] - center[1]) * zoom + 1) / 2;
  return [ux * size, (1 - uy) * size];
}

/** Map overlay pixel coordinates (y down) back to a plot coordinate. */
export function pxToPlot([px, py]: Vec2, center: Vec2, zoom: number, size: number): Vec2 {
  const ux = px / size;
  const uy = 1 - py / size;
  return [center[0] + (ux * 2 - 1) / zoom, center[1] + (uy * 2 - 1) / zoom];
}

type ComplexFn = (z: Complex, c: Complex) => Complex;
type EscapeFn = (z: Complex, c: Complex) => boolean;

/** Walk the orbit polyline from compiled closures (stops on escape / non-finite). */
function orbitWalk(f: ComplexFn, esc: EscapeFn, z0: Vec2, cc: Complex, nplot: number): Complex[] {
  const points: Complex[] = [[z0[0], z0[1]]];
  let z: Complex = [z0[0], z0[1]];
  for (let k = 0; k < nplot; k++) {
    if (esc(z, cc)) break;
    z = f(z, cc);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) break;
    points.push(z);
  }
  return points;
}

/** First `nplot` iterates of `f` from `z0` (stops on escape) — the drawn orbit. */
export function computeOrbit(
  fAst: Node,
  escapeAst: Node,
  z0: Vec2,
  cc: Complex,
  nplot: number,
  a: Complex = [0, 0],
): Complex[] {
  return orbitWalk(getComplexFn(fAst, a), getEscapeFn(escapeAst, fAst, a), z0, cc, nplot);
}

export type OrbitFate = "escaped" | "converged" | "periodic" | "undetermined";

export interface OrbitInfo {
  fate: OrbitFate;
  /** Cycle length for converged (1 = fixed point) / periodic orbits; 0 otherwise. */
  period: number;
  /** Iterations until escape for escaped orbits; 0 otherwise. */
  escapeIter: number;
  /** The detected periodic points (period-many; one for a fixed point); null if escaped/undetermined. */
  cyclePoints: Complex[] | null;
}

const CLASSIFY_EPS = 1e-6; // tolerance for "returned near an earlier point" (relative to |z|)
const CLASSIFY_CONV_EPS = 1e-4; // window-collapse tolerance (fixed point vs cycle, relative to |z|)
const CLASSIFY_MAX_PERIOD = 64;

/** Classify the orbit's fate from compiled closures (shared by the public wrappers). */
function classifyWalk(
  f: ComplexFn,
  esc: EscapeFn,
  z0: Vec2,
  cc: Complex,
  maxIter: number,
): OrbitInfo {
  const history: Complex[] = [];
  let z: Complex = [z0[0], z0[1]];
  for (let k = 0; k < maxIter; k++) {
    if (esc(z, cc)) return { fate: "escaped", period: 0, escapeIter: k, cyclePoints: null };
    // Tolerances scale with |z|: cycles of large-modulus attractors (exp / lambertw, whose
    // iterates sit far from the origin) never came within an absolute 1e-6 box, so they were
    // mis-reported as "bounded". Euclidean distance, relative to the current scale.
    const scale = Math.max(1, Math.hypot(z[0], z[1]));
    for (let pd = 1; pd <= history.length; pd++) {
      const prev = history[history.length - pd];
      if (Math.hypot(z[0] - prev[0], z[1] - prev[1]) < CLASSIFY_EPS * scale) {
        // Returned near z_{k-pd}. It's a genuine period-pd cycle only if those pd points are
        // spread out; a collapsed window means the orbit converged to a fixed point (e.g. a
        // negative multiplier makes it return at pd=2 first).
        let minRe = z[0],
          maxRe = z[0],
          minIm = z[1],
          maxIm = z[1];
        for (let i = 1; i <= pd; i++) {
          const q = history[history.length - i];
          minRe = Math.min(minRe, q[0]);
          maxRe = Math.max(maxRe, q[0]);
          minIm = Math.min(minIm, q[1]);
          maxIm = Math.max(maxIm, q[1]);
        }
        const spread = Math.max(maxRe - minRe, maxIm - minIm);
        if (spread < CLASSIFY_CONV_EPS * scale) {
          return { fate: "converged", period: 1, escapeIter: 0, cyclePoints: [[z[0], z[1]]] };
        }
        const cyclePoints = history.slice(history.length - pd).map((q): Complex => [q[0], q[1]]);
        return { fate: "periodic", period: pd, escapeIter: 0, cyclePoints };
      }
    }
    history.push(z);
    if (history.length > CLASSIFY_MAX_PERIOD) history.shift();
    z = f(z, cc);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) {
      return { fate: "escaped", period: 0, escapeIter: k + 1, cyclePoints: null };
    }
  }
  // Neither escaped nor settled onto a cycle within `maxIter`: "undetermined", NOT a claim of
  // boundedness — it may be a slow escaper, an irrational/Siegel orbit, or a cycle longer than the
  // CLASSIFY_MAX_PERIOD cap. Surfaced as iteration-limited rather than as a definitive class.
  return { fate: "undetermined", period: 0, escapeIter: 0, cyclePoints: null };
}

/**
 * Classify the long-run fate of the orbit of `z0` under `f` (parameter `cc`):
 * escaped, converged to a fixed point, settled into a period-p cycle, or bounded
 * (none within `maxIter`). The detected cycle's points are returned in `cyclePoints`.
 */
export function classifyOrbit(
  fAst: Node,
  escapeAst: Node,
  z0: Vec2,
  cc: Complex,
  a: Complex = [0, 0],
  maxIter = 512,
): OrbitInfo {
  return classifyWalk(getComplexFn(fAst, a), getEscapeFn(escapeAst, fAst, a), z0, cc, maxIter);
}

/**
 * Orbit polyline + fate classification together, compiling f / escape ONCE and reusing
 * the closure pair for both walks (the common overlay + hover case). `orbit` matches
 * {@link computeOrbit} and `info` matches {@link classifyOrbit}.
 */
export function orbitAndClassify(
  fAst: Node,
  escapeAst: Node,
  z0: Vec2,
  cc: Complex,
  nplot: number,
  a: Complex = [0, 0],
  maxIter = 512,
): { orbit: Complex[]; info: OrbitInfo } {
  const f = getComplexFn(fAst, a);
  const esc = getEscapeFn(escapeAst, fAst, a);
  return {
    orbit: orbitWalk(f, esc, z0, cc, nplot),
    info: classifyWalk(f, esc, z0, cc, maxIter),
  };
}

const FATE_COLOR: Record<OrbitFate, string> = {
  escaped: "#ff6b6b",
  converged: "#63e6a4",
  periodic: "#5cc8ff",
  undetermined: "#ffd166",
};

/** Short human label for an orbit's fate (shown next to the white-point coordinate). */
export function fateLabel(info: OrbitInfo): string {
  switch (info.fate) {
    case "escaped":
      return `escapes (n=${info.escapeIter})`;
    case "converged":
      return "fixed point";
    case "periodic":
      return `period ${info.period}`;
    case "undetermined":
      return "undetermined";
  }
}

/** A user annotation: a gold pin + text label at a plot-coordinate point. */
export interface Annotation {
  x: number;
  y: number;
  text: string;
}

export interface OverlayParams {
  fAst: Node;
  escapeAst: Node;
  /** White-point plot coordinate (parameter `c` for param plots, orbit start for dyn). */
  z0: Vec2;
  /** Fixed parameter `c` (dynamical plots). Parameter plots iterate with `c = z0`. */
  c: Complex;
  center: Vec2;
  zoom: number;
  nplot: number;
  fractType: "dyn" | "param";
  /** Also draw the orbit of the critical point (`criticalPoint`, default 0) dashed. */
  critical?: boolean;
  criticalPoint?: Vec2;
  /** Label the Farey bulbs of the main cardioid (parameter plane, z²+c). */
  farey?: boolean;
  /** External-ray angle in turns to trace (parameter + dynamical, z²+c), or null for none. */
  rayAngle?: number | null;
  /** Draw both landing rays for every visible Farey bulb (parameter plane, z²+c). */
  rayPairs?: boolean;
  /** Orbit-portrait rays: external angles (turns) landing at the α fixed point (dynamical plane). */
  orbitPortrait?: number[] | null;
  /** Draw the inverse-iteration Julia point cloud (dynamical plane, z²+c). */
  inverseJulia?: boolean;
  /** Draw the Siegel-disc invariant curves (dynamical plane, z²+c). */
  siegelCurves?: boolean;
  /** Reconstructed exterior-map boundary to draw (ψ on |w| = r); coeffs in plot space. */
  laurentBoundary?: { coeffs: Vec2[]; r: number; lead?: Vec2 };
  /**
   * Attracting-cycle points (z-plane) to highlight, from the click-to-inspect result.
   * Drawn on the dynamical plane only — they are z-values, meaningless on the c-plane.
   */
  cyclePoints?: Vec2[];
  /** Overlay backing-store size in px. */
  size: number;
  /** Live parameter `a`, bound in f / escape when used as a free variable. */
  a?: Complex;
  /** User-pinned annotations (gold marker + label) at plot-coordinate points. */
  annotations?: Annotation[];
}

/**
 * Draw a scale bar (bottom-left) labelled with its width in plot coordinates. `size` is
 * the square canvas size and `zoom` the plot zoom (the view spans 2/zoom in plot units
 * across the width). All metrics scale with `size`, so it reads correctly on
 * high-resolution exports.
 */
export function drawScaleBar(ctx: CanvasRenderingContext2D, size: number, zoom: number): void {
  const viewSpan = 2 / zoom; // plot units across the full canvas width
  const exp = Math.floor(Math.log10(0.22 * viewSpan)); // aim for ~22% of the width
  const frac = (0.22 * viewSpan) / Math.pow(10, exp);
  const niceFrac = frac >= 5 ? 5 : frac >= 2 ? 2 : 1; // round down to 1 / 2 / 5
  const niceLen = niceFrac * Math.pow(10, exp);
  const barPx = (niceLen / viewSpan) * size;
  const m = Math.round(size * 0.045);
  const font = Math.max(9, Math.round(size * 0.024));
  const tick = Math.max(3, size * 0.012);
  const lw = Math.max(1.5, size * 0.0035);
  const pad = font * 0.5;
  const label =
    exp >= -3 && exp < 4 ? String(Number(niceLen.toPrecision(2))) : `${niceFrac}e${exp}`;
  const x0 = m;
  const y = size - m;
  ctx.save();
  ctx.font = `${font}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "alphabetic";
  const contentW = Math.max(barPx, ctx.measureText(label).width);
  // translucent backing so the bar stays legible over any colour
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(x0 - pad, y - tick - font - pad, contentW + pad * 2, tick + font + pad * 1.8);
  // white bar with end ticks
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + barPx, y);
  ctx.moveTo(x0, y - tick);
  ctx.lineTo(x0, y);
  ctx.moveTo(x0 + barPx, y - tick);
  ctx.lineTo(x0 + barPx, y);
  ctx.stroke();
  // width label (in plot coordinates) above the bar
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x0, y - tick - pad * 0.6);
  ctx.restore();
}

/**
 * Label the Farey bulbs on the main cardioid (parameter plane). Labels whose pixel
 * positions would collide with an already-placed one are skipped; the visible set grows
 * with zoom, so finer fractions appear as you zoom in.
 */
function drawFareyLabels(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  zoom: number,
  size: number,
): void {
  const s = size / OVERLAY_BASE;
  const maxQ = Math.min(16, Math.max(4, Math.round(4 + Math.log2(Math.max(1, zoom)))));
  const labels = fareyLabels(center, zoom, maxQ);
  const placed: Vec2[] = [];
  const minSep = 26 * s;
  ctx.save();
  ctx.font = `${12 * s}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const lab of labels) {
    const [px, py] = plotToPx(lab.c, center, zoom, size);
    const off = 16 * s;
    const ax = px + lab.normal[0] * off;
    const ay = py - lab.normal[1] * off; // canvas y is flipped
    if (placed.some(([qx, qy]) => Math.hypot(qx - ax, qy - ay) < minSep)) continue;
    placed.push([ax, ay]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const w = ctx.measureText(lab.text).width;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(ax - w / 2 - 3 * s, ay - 8 * s, w + 6 * s, 16 * s);
    ctx.fillStyle = "#fff";
    ctx.fillText(lab.text, ax, ay);
  }
  ctx.restore();
}

/**
 * Draw an external-ray polyline (parameter or dynamical plane). Far-field points beyond a
 * few view-widths are dropped so deep-zoom pixel coordinates stay finite — the dense
 * near-landing points are what is visible anyway.
 */
// One cached ray polyline per plane. The traced points depend only on the angle (and c,
// for dynamical rays) and the zoom-derived depth — not on pan or zoom within a depth step —
// so this skips re-tracing on the frequent overlay redraws (e.g. while panning).
const rayCache = new Map<"dyn" | "param", { key: string; pts: Vec2[] }>();
function cachedRay(plane: "dyn" | "param", angle: number, c: Complex, depth: number): Vec2[] {
  const key = `${angle}:${depth}:${plane === "dyn" ? `${c[0]},${c[1]}` : ""}`;
  const slot = rayCache.get(plane);
  if (slot && slot.key === key) return slot.pts;
  const pts = plane === "param" ? parameterRay(angle, { depth }) : dynamicRay(angle, c, { depth });
  rayCache.set(plane, { key, pts });
  return pts;
}

function drawRays(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  center: Vec2,
  zoom: number,
  size: number,
  color = "rgba(120, 220, 255, 0.95)",
): void {
  const s = size / OVERLAY_BASE;
  // Clip in plot space, relative to the view, so the kept span scales with zoom: at deep
  // zoom the near-landing points stay connected through the view (a fixed pixel clip would
  // drop the segments before they reached it), while the far-field tail is still dropped.
  const margin = 40 / zoom;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  let started = false;
  for (const pt of pts) {
    if (Math.abs(pt[0] - center[0]) > margin || Math.abs(pt[1] - center[1]) > margin) {
      started = false; // far-field point — break the line; resume when the ray re-enters
      continue;
    }
    const [px, py] = plotToPx(pt, center, zoom, size);
    if (started) ctx.lineTo(px, py);
    else {
      ctx.moveTo(px, py);
      started = true;
    }
  }
  ctx.stroke();
  ctx.restore();
}

// Keyed cache of parameter rays for the bulb-pair overlay — unlike the single-slot
// `rayCache`, many rays are drawn per frame. Parameter rays depend only on angle + depth,
// so the cache is reused across pans/zooms within a depth step; it is cleared when the
// zoom-derived depth changes.
const rayPairCache = new Map<string, Vec2[]>();
let rayPairDepth = -1;
function cachedPairRay(angle: number, depth: number): Vec2[] {
  if (depth !== rayPairDepth) {
    rayPairCache.clear();
    rayPairDepth = depth;
  }
  const key = String(angle);
  let pts = rayPairCache.get(key);
  if (!pts) {
    pts = parameterRay(angle, { depth });
    rayPairCache.set(key, pts);
  }
  return pts;
}

/**
 * Draw the two external parameter rays landing at the root of every visible Farey bulb
 * (parameter plane, z²+c). Uses the same visible-bulb set (and maxQ) as the Farey labels,
 * so the rays line up 1:1 with them.
 */
function drawBulbRayPairs(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  zoom: number,
  size: number,
): void {
  const maxQ = Math.min(16, Math.max(4, Math.round(4 + Math.log2(Math.max(1, zoom)))));
  const depth = rayDepthForZoom(zoom);
  for (const lab of fareyLabels(center, zoom, maxQ)) {
    const angles = bulbRayAngles(lab.p, lab.q);
    if (!angles) continue;
    drawRays(ctx, cachedPairRay(angles[0], depth), center, zoom, size);
    drawRays(ctx, cachedPairRay(angles[1], depth), center, zoom, size);
  }
}

// Cache of dynamic rays for the orbit-portrait overlay (several rays per frame). Dynamic rays
// depend on angle + c + depth, so the cache is cleared when c or the zoom-derived depth changes.
const portraitRayCache = new Map<string, Vec2[]>();
let portraitRayKey = "";
function cachedPortraitRay(angle: number, c: Complex, depth: number): Vec2[] {
  const ck = `${c[0]},${c[1]}:${depth}`;
  if (ck !== portraitRayKey) {
    portraitRayCache.clear();
    portraitRayKey = ck;
  }
  let pts = portraitRayCache.get(String(angle));
  if (!pts) {
    pts = dynamicRay(angle, c, { depth });
    portraitRayCache.set(String(angle), pts);
  }
  return pts;
}

/**
 * Draw the orbit-portrait rays — the external rays landing at the α fixed point of K_c — on the
 * dynamical plane, in a distinct gold so they read against the cyan single ray.
 */
function drawOrbitPortrait(
  ctx: CanvasRenderingContext2D,
  angles: number[],
  c: Complex,
  center: Vec2,
  zoom: number,
  size: number,
): void {
  const depth = rayDepthForZoom(zoom);
  for (const a of angles) {
    drawRays(ctx, cachedPortraitRay(a, c, depth), center, zoom, size, "rgba(255, 200, 90, 0.95)");
  }
}

// Cache of the inverse-iteration Julia cloud — view-independent (depends only on c), so it is
// recomputed only when c changes and merely re-projected on pans / zooms.
const invJuliaCache = { key: "", pts: [] as Vec2[] };
function cachedInverseJulia(c: Complex): Vec2[] {
  const key = `${c[0]},${c[1]}`;
  if (invJuliaCache.key !== key) {
    invJuliaCache.key = key;
    invJuliaCache.pts = inverseJuliaCloud(c, 12000, 30, 1);
  }
  return invJuliaCache.pts;
}

/** Draw the inverse-iteration Julia point cloud (dynamical plane, z²+c) as a soft base layer. */
function drawInverseJulia(
  ctx: CanvasRenderingContext2D,
  c: Complex,
  center: Vec2,
  zoom: number,
  size: number,
): void {
  const pts = cachedInverseJulia(c);
  const r = Math.max(0.6, 0.8 * (size / OVERLAY_BASE));
  const d = 2 * r;
  ctx.save();
  ctx.fillStyle = "rgba(255, 236, 160, 0.5)";
  for (const pt of pts) {
    const [px, py] = plotToPx(pt, center, zoom, size);
    if (px < -d || py < -d || px > size + d || py > size + d) continue;
    ctx.fillRect(px - r, py - r, d, d);
  }
  ctx.restore();
}

// Cache of the Siegel-disc invariant curves — view-independent (depends only on c).
const siegelCache = { key: "", curves: [] as Vec2[][] };
function cachedSiegelCurves(c: Complex): Vec2[][] {
  const key = `${c[0]},${c[1]}`;
  if (siegelCache.key !== key) {
    siegelCache.key = key;
    const r = siegelInvariantCurves(c);
    siegelCache.curves = r ? r.curves : [];
  }
  return siegelCache.curves;
}

/** Draw the Siegel-disc invariant curves (dynamical plane, z²+c) as nested point sets. */
function drawSiegelCurves(
  ctx: CanvasRenderingContext2D,
  c: Complex,
  center: Vec2,
  zoom: number,
  size: number,
): void {
  const curves = cachedSiegelCurves(c);
  const rdot = Math.max(0.5, 0.7 * (size / OVERLAY_BASE));
  const d = 2 * rdot;
  ctx.save();
  ctx.fillStyle = "rgba(130, 200, 255, 0.6)";
  for (const curve of curves) {
    for (const pt of curve) {
      const [px, py] = plotToPx(pt, center, zoom, size);
      if (px < -d || py < -d || px > size + d || py > size + d) continue;
      ctx.fillRect(px - rdot, py - rdot, d, d);
    }
  }
  ctx.restore();
}

// Reconstructed-boundary cache (per plane). The points are ψ(r·e^{2πiθ}) in plot space —
// independent of centre/zoom — so pan/zoom reuse them and only re-project. Keyed by the coeffs
// array identity (main replaces it only on a c / f / order / radius change) and r.
const BOUNDARY_SAMPLES = 512;
const boundaryCache = new Map<
  "dyn" | "param",
  { coeffs: Vec2[]; r: number; lead: Vec2; pts: Vec2[] }
>();
function cachedBoundary(plane: "dyn" | "param", coeffs: Vec2[], r: number, lead: Vec2): Vec2[] {
  const slot = boundaryCache.get(plane);
  if (
    slot &&
    slot.coeffs === coeffs &&
    slot.r === r &&
    slot.lead[0] === lead[0] &&
    slot.lead[1] === lead[1]
  )
    return slot.pts;
  const pts = reconstructBoundary(coeffs, r, BOUNDARY_SAMPLES, lead);
  boundaryCache.set(plane, { coeffs, r, lead, pts });
  return pts;
}

/**
 * Draw the reconstructed exterior-map boundary (a closed polyline of ψ on |w| = r). Clipped in
 * plot space like the rays, so at deep zoom only the visible arc is drawn.
 */
function drawLaurentBoundary(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  center: Vec2,
  zoom: number,
  size: number,
): void {
  const s = size / OVERLAY_BASE;
  const margin = 40 / zoom;
  ctx.save();
  ctx.strokeStyle = "rgba(200, 140, 255, 0.95)";
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= pts.length; i++) {
    const pt = pts[i % pts.length]; // wrap once to close the loop
    if (Math.abs(pt[0] - center[0]) > margin || Math.abs(pt[1] - center[1]) > margin) {
      started = false;
      continue;
    }
    const [px, py] = plotToPx(pt, center, zoom, size);
    if (started) ctx.lineTo(px, py);
    else {
      ctx.moveTo(px, py);
      started = true;
    }
  }
  ctx.stroke();
  ctx.restore();
}

interface OrbitCacheEntry {
  fAst: Node;
  escapeAst: Node;
  key: string;
  orbit: Complex[];
  info: OrbitInfo;
  critOrbit: Complex[] | null;
  critInfo: OrbitInfo | null;
}

/**
 * Per-plane cache of the orbit polyline + fate classification (and the critical orbit).
 * These depend only on f / escape / z₀ / c / a / nplot — NOT on centre or zoom — so pan
 * and zoom reuse them and `drawOverlay` only re-projects the points. ASTs are compared by
 * identity (they're replaced wholesale on an f/escape edit). The CPU orbit walk uses the
 * tree-walking evaluator, so skipping it on every pan/zoom frame is a real saving.
 */
const orbitCache = new Map<"dyn" | "param", OrbitCacheEntry>();

function orbitData(p: OverlayParams, cc: Complex, a: Complex): OrbitCacheEntry {
  const crit = p.criticalPoint ?? [0, 0];
  const key = `${p.z0[0]},${p.z0[1]};${cc[0]},${cc[1]};${a[0]},${a[1]};${p.nplot};${p.critical ? 1 : 0};${crit[0]},${crit[1]}`;
  const hit = orbitCache.get(p.fractType);
  if (hit && hit.fAst === p.fAst && hit.escapeAst === p.escapeAst && hit.key === key) {
    return hit;
  }
  const { orbit, info } = orbitAndClassify(p.fAst, p.escapeAst, p.z0, cc, p.nplot, a);
  let critOrbit: Complex[] | null = null;
  let critInfo: OrbitInfo | null = null;
  if (p.critical) {
    const cr = orbitAndClassify(p.fAst, p.escapeAst, crit, cc, p.nplot, a);
    critOrbit = cr.orbit;
    critInfo = cr.info;
  }
  const entry: OrbitCacheEntry = {
    fAst: p.fAst,
    escapeAst: p.escapeAst,
    key,
    orbit,
    info,
    critOrbit,
    critInfo,
  };
  orbitCache.set(p.fractType, entry);
  return entry;
}

/** Dark casing drawn under the bright overlay strokes so they stay legible over any palette. */
const HALO = "rgba(0, 0, 0, 0.6)";

/** Render the orbit polyline, white point, and label onto `ctx`. */
export function drawOverlay(ctx: CanvasRenderingContext2D, p: OverlayParams): void {
  const { size } = p;
  ctx.clearRect(0, 0, size, size);
  const s = size / OVERLAY_BASE;
  const cc: Complex = p.fractType === "param" ? [p.z0[0], p.z0[1]] : p.c;
  const a = p.a ?? [0, 0];
  const { orbit, info, critOrbit, critInfo } = orbitData(p, cc, a);
  const fateColor = FATE_COLOR[info.fate];

  // Inverse-iteration Julia cloud (dynamical plane, z²+c): the base layer, under the orbit/markers.
  if (p.inverseJulia && p.fractType === "dyn") drawInverseJulia(ctx, p.c, p.center, p.zoom, size);

  // Siegel-disc invariant curves (dynamical plane, z²+c).
  if (p.siegelCurves && p.fractType === "dyn") drawSiegelCurves(ctx, p.c, p.center, p.zoom, size);

  // Orbit polyline, coloured by the orbit's long-run fate. A dark casing under the colour
  // keeps it legible over any palette (the fate colours are all bright).
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  orbit.forEach((pt, k) => {
    const [px, py] = plotToPx(pt, p.center, p.zoom, size);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 1.8 * s + 2.4 * s;
  ctx.stroke();
  ctx.strokeStyle = fateColor;
  ctx.lineWidth = 1.8 * s;
  ctx.stroke();

  // A dot at each iterate: dark ring behind, then the fate colour.
  orbit.forEach((pt) => {
    const [dx, dy] = plotToPx(pt, p.center, p.zoom, size);
    ctx.beginPath();
    ctx.arc(dx, dy, 3.1 * s, 0, 2 * Math.PI);
    ctx.fillStyle = HALO;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dx, dy, 2 * s, 0, 2 * Math.PI);
    ctx.fillStyle = fateColor;
    ctx.fill();
  });

  // Optional critical orbit (from the critical point, default 0), drawn dashed so it
  // reads apart from the white-point orbit. Bounded → Julia set connected.
  if (p.critical && critOrbit && critInfo) {
    const crit = p.criticalPoint ?? [0, 0];
    const critColor = FATE_COLOR[critInfo.fate];
    ctx.setLineDash([5 * s, 4 * s]);
    ctx.beginPath();
    critOrbit.forEach((pt, k) => {
      const [qx, qy] = plotToPx(pt, p.center, p.zoom, size);
      if (k === 0) ctx.moveTo(qx, qy);
      else ctx.lineTo(qx, qy);
    });
    ctx.strokeStyle = HALO;
    ctx.lineWidth = 1.4 * s + 2.2 * s;
    ctx.stroke();
    ctx.strokeStyle = critColor;
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
    ctx.setLineDash([]);
    const [cx, cy] = plotToPx(crit, p.center, p.zoom, size);
    ctx.fillStyle = HALO;
    ctx.fillRect(cx - 4 * s, cy - 4 * s, 8 * s, 8 * s);
    ctx.fillStyle = critColor;
    ctx.fillRect(cx - 3 * s, cy - 3 * s, 6 * s, 6 * s);
  }

  // Farey bulb labels on the main cardioid (parameter plane only).
  if (p.farey && p.fractType === "param") drawFareyLabels(ctx, p.center, p.zoom, size);

  // External rays: parameter rays on the param plane, dynamic rays (for c = cc) on the dyn plane.
  if (typeof p.rayAngle === "number") {
    const rayPts = cachedRay(p.fractType, p.rayAngle, cc, rayDepthForZoom(p.zoom));
    drawRays(ctx, rayPts, p.center, p.zoom, size);
  }

  // Landing-ray pair for every visible Farey bulb (parameter plane only).
  if (p.rayPairs && p.fractType === "param") drawBulbRayPairs(ctx, p.center, p.zoom, size);

  // Orbit-portrait rays landing at the α fixed point (dynamical plane only).
  if (p.orbitPortrait && p.orbitPortrait.length > 0 && p.fractType === "dyn") {
    drawOrbitPortrait(ctx, p.orbitPortrait, cc, p.center, p.zoom, size);
  }

  // Attracting cycle located by the inspector, joined in orbit order and marked with
  // ringed dots (dark backing ring keeps them legible over any fill). Dynamical plane
  // only: these are z-plane values, so they have no meaning on the parameter (c) plane.
  if (p.fractType === "dyn" && p.cyclePoints && p.cyclePoints.length > 0) {
    const cyc = p.cyclePoints;
    const cycColor = "#ffd166";
    if (cyc.length > 1) {
      ctx.strokeStyle = cycColor;
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      cyc.forEach((pt, k) => {
        const [qx, qy] = plotToPx(pt, p.center, p.zoom, size);
        if (k === 0) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      });
      ctx.closePath();
      ctx.stroke();
    }
    cyc.forEach((pt) => {
      const [qx, qy] = plotToPx(pt, p.center, p.zoom, size);
      ctx.beginPath();
      ctx.arc(qx, qy, 4.5 * s, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fill();
      ctx.lineWidth = 1.8 * s;
      ctx.strokeStyle = cycColor;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(qx, qy, 2 * s, 0, 2 * Math.PI);
      ctx.fillStyle = cycColor;
      ctx.fill();
    });
  }

  // Reconstructed exterior-map boundary (ψ on |w| = r) — both planes.
  if (p.laurentBoundary && p.laurentBoundary.coeffs.length > 0) {
    const bpts = cachedBoundary(
      p.fractType,
      p.laurentBoundary.coeffs,
      p.laurentBoundary.r,
      p.laurentBoundary.lead ?? [1, 0],
    );
    drawLaurentBoundary(ctx, bpts, p.center, p.zoom, size);
  }

  // User annotations: a gold pin + text label at each pinned point (HALO casing for contrast).
  if (p.annotations && p.annotations.length > 0) {
    ctx.font = `${13 * s}px sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    for (const note of p.annotations) {
      const [nx, ny] = plotToPx([note.x, note.y], p.center, p.zoom, size);
      ctx.beginPath();
      ctx.arc(nx, ny, 4.0 * s, 0, 2 * Math.PI);
      ctx.fillStyle = HALO;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(nx, ny, 2.6 * s, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffd24a";
      ctx.fill();
      if (note.text) {
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = HALO;
        ctx.strokeText(note.text, nx + 6 * s, ny - 6 * s);
        ctx.fillStyle = "#ffd24a";
        ctx.fillText(note.text, nx + 6 * s, ny - 6 * s);
      }
    }
  }

  // White point (dark ring behind so it shows on light palettes) + coordinate / fate label.
  const [px, py] = plotToPx(p.z0, p.center, p.zoom, size);
  ctx.beginPath();
  ctx.arc(px, py, 4.2 * s, 0, 2 * Math.PI);
  ctx.fillStyle = HALO;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, 3 * s, 0, 2 * Math.PI);
  ctx.fillStyle = "white";
  ctx.fill();

  const label = p.fractType === "param" ? "c=" : "z0=";
  const text = `${label}${formatComplex(truncateComplex([p.z0[0], p.z0[1]]))} · ${fateLabel(info)}`;
  ctx.font = `${15 * s}px sans-serif`;
  ctx.textBaseline = "bottom";
  // Dark casing under the white text so it reads over any palette.
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = HALO;
  ctx.strokeText(text, px + 6 * s, py - 6 * s);
  ctx.fillStyle = "white";
  ctx.fillText(text, px + 6 * s, py - 6 * s);
}
