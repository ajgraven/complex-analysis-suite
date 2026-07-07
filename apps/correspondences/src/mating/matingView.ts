// The mating explorer — M3 (three static panels) + M4 (interactivity). Three synchronized panels of the
// deltoid mating (LLMM 1811.04979):
//   A  z̄²            — the MAP side: 0-basin rays/equipotentials, the Julia circle (equator), cube-root fixed pts
//   B  ideal △ group — the GROUP side: Γ tessellating 𝔻, the fundamental triangle, the equator circle
//   C  σ  (deltoid)  — the MATING: the deltoid curve (equator), the group tessellation via Ψ = φ∘η (glue.ts),
//                       AND the map-side Böttcher grid — equipotentials {G=const} + external rays {arg B=const}
//                       transported in (mapSide). Both structures coexist in the exterior Ω: that IS the mating.
// The equator is the same object in three coordinates (unit circle ↔ unit circle ↔ deltoid curve). M4 makes
// it live: the shared angle θ. Hover any panel → the corresponding equator point lights up in all three; the
// degree-2 equator map θ ↦ −2θ (which BOTH z̄² and the group's Nielsen map realise on the circle) is traced
// as an orbit on all three at once. All geometry comes from the tested M0/M1 modules; this file only draws.
import { DELTOID, deltoidBoundary, type Complex } from "../deltoid.js";
import { fundamentalEdges, IDEAL_VERTICES, tessellate } from "../models/idealTriangleGroup.js";
import { glue, glueTilePolylines } from "./glue.js";
import { greenSigma, sigmaExternalRay } from "./mapSide.js";

export type Space = "map" | "group" | "sigma";
interface View {
  cx: number;
  cy: number;
  half: number;
}
export const PANELS: Record<Space, View> = {
  map: { cx: 0, cy: 0, half: 1.24 },
  group: { cx: 0, cy: 0, half: 1.12 },
  sigma: { cx: 0.2, cy: 0, half: 2.7 },
};

const EQUATOR = "#e8c07a";
const MARK = ["#ff6b63", "#57c76a", "#6a9bff"]; // cusp k = ideal vertex k = z̄² fixed point k
const TEAL = ["#4a8078", "#6fb7ad", "#a6e6d9"];
const FUND = "#cdeee6";
const MUTED = "#3a4457";
const RAY = "rgba(120,150,205,0.5)"; // σ external rays (map-side Böttcher grid), same blue as the equipotentials
const RAY_HILITE = "#bcd0ff";

// The σ external-ray fan (mapSide.sigmaExternalRay), traced once and cached: the map-side external angles
// {arg B = 2πk/N} carried into the σ-plane. N is a multiple of 3 so the three cusp rays sit at k = 0, N/3, 2N/3.
const RAY_COUNT = 24;
const rayFanCache = new Map<number, Complex[][]>();
function sigmaRayFan(count = RAY_COUNT): Complex[][] {
  let fan = rayFanCache.get(count);
  if (!fan) {
    fan = [];
    for (let k = 0; k < count; k++) fan.push(sigmaExternalRay((2 * Math.PI * k) / count, { gFloor: 0.01, step: 0.04 }));
    rayFanCache.set(count, fan);
  }
  return fan;
}
function nearestRayIndex(theta: number): number {
  const t = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round((t / (2 * Math.PI)) * RAY_COUNT) % RAY_COUNT;
}

function w2p(p: Complex, v: View, size: number): [number, number] {
  return [size / 2 + ((p[0] - v.cx) / (2 * v.half)) * size, size / 2 - ((p[1] - v.cy) / (2 * v.half)) * size];
}

/** Pixel → world for a panel (inverse of w2p). */
export function pixelToWorld(px: number, py: number, space: Space, size: number): Complex {
  const v = PANELS[space];
  return [v.cx + (px / size - 0.5) * 2 * v.half, v.cy + (0.5 - py / size) * 2 * v.half];
}

function stroke(
  ctx: CanvasRenderingContext2D,
  pts: readonly Complex[],
  v: View,
  size: number,
  color: string,
  width: number,
  close = false,
): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const q = w2p(pts[i], v, size);
    if (i === 0) ctx.moveTo(q[0], q[1]);
    else ctx.lineTo(q[0], q[1]);
  }
  if (close) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, p: Complex, v: View, size: number, color: string, r = 5): void {
  const q = w2p(p, v, size);
  ctx.beginPath();
  ctx.arc(q[0], q[1], r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function circle(ctx: CanvasRenderingContext2D, r: number, v: View, size: number, color: string, width: number): void {
  const pts: Complex[] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  stroke(ctx, pts, v, size, color, width);
}

function drawMap(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.map;
  for (const rr of [0.4, 0.7, 1.12]) circle(ctx, rr, v, size, MUTED, 1); // equipotentials (Böttcher = id)
  for (let a = 0; a < 12; a++) {
    const th = (a * Math.PI) / 6;
    const root = a % 4 === 0; // a = 0, 4, 8 → the cube-root fixed rays θ = 0, 2π/3, 4π/3
    const rr = root ? 1.15 : 1;
    stroke(ctx, [[0, 0], [rr * Math.cos(th), rr * Math.sin(th)]], v, size, root ? MARK[a / 4] : MUTED, root ? 1.4 : 0.8);
  }
  circle(ctx, 1, v, size, EQUATOR, 2.4);
  dot(ctx, [0, 0], v, size, "#7b8aa0", 2.5);
  for (let k = 0; k < 3; k++) dot(ctx, IDEAL_VERTICES[k], v, size, MARK[k], 5);
}

// σ's ∞-basin equipotentials (the Böttcher modulus): a faint low-res raster of the Green's function,
// banded by G, drawn behind the tessellation. Off-basin (G = 0, inside the tiling toward K) stays clear.
function drawSigmaEquipotentials(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.sigma;
  const LOW = 132;
  const off = document.createElement("canvas");
  off.width = LOW;
  off.height = LOW;
  const octx = off.getContext("2d");
  if (!octx) return;
  const img = octx.createImageData(LOW, LOW);
  for (let py = 0; py < LOW; py++) {
    for (let px = 0; px < LOW; px++) {
      const g = greenSigma(
        [v.cx + (px / LOW - 0.5) * 2 * v.half, v.cy + (0.5 - py / LOW) * 2 * v.half],
        { maxIter: 40, escapeR: 1e4 },
      );
      const o = (py * LOW + px) * 4;
      if (g > 0) {
        const band = 0.5 + 0.5 * Math.cos(2 * Math.PI * g * 1.4);
        img.data[o] = 70;
        img.data[o + 1] = 110;
        img.data[o + 2] = 165;
        img.data[o + 3] = 20 + 46 * band;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0, size, size);
}

function drawGroup(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.group;
  const edges = fundamentalEdges(20);
  const tiles = tessellate(4);
  circle(ctx, 1, v, size, EQUATOR, 2.4);
  for (let d = 4; d >= 1; d--) {
    for (const t of tiles) {
      if (t.depth !== d) continue;
      for (const e of edges) stroke(ctx, e.map(t.apply), v, size, TEAL[Math.min(d, 2)], 1);
    }
  }
  for (const e of edges) stroke(ctx, e, v, size, FUND, 1.8);
  for (let k = 0; k < 3; k++) dot(ctx, IDEAL_VERTICES[k], v, size, MARK[k], 5);
}

// The σ external rays: the map-side external angles {arg B = 2πk/N} transported into the σ-plane by the
// Böttcher structure (gradient lines of G, traced in mapSide). Faint blue for the fan, the three cusp rays
// in the cusp colours — they land at the three cusps, exactly where the equipotentials pinch to G = 0.
function drawSigmaRays(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.sigma;
  const fan = sigmaRayFan();
  const per = RAY_COUNT / 3;
  for (let k = 0; k < fan.length; k++) {
    if (k % per === 0) continue; // cusp rays drawn on top, below
    stroke(ctx, fan[k], v, size, RAY, 0.7);
  }
  for (let k = 0; k < 3; k++) stroke(ctx, fan[k * per], v, size, MARK[k], 1.3);
}

function drawSigma(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.sigma;
  drawSigmaEquipotentials(ctx, size); // the map-side Böttcher modulus, behind the group tessellation
  drawSigmaRays(ctx, size); // the map-side external angles, transported in
  const edges = fundamentalEdges(20);
  const tiles = tessellate(3);
  for (let d = 3; d >= 1; d--) {
    for (const t of tiles) {
      if (t.depth !== d) continue;
      for (const e of glueTilePolylines(t, edges)) stroke(ctx, e, v, size, TEAL[Math.min(d, 2)], 1);
    }
  }
  stroke(ctx, deltoidBoundary(180), v, size, EQUATOR, 2.4, true);
  const cusps: Complex[] = IDEAL_VERTICES.map((p) => [1.5 * p[0], 1.5 * p[1]]);
  for (let k = 0; k < 3; k++) dot(ctx, cusps[k], v, size, MARK[k], 5.5);
}

/** Draw a panel's base layer (static; cache it and blit before overlaying). */
export function drawPanel(ctx: CanvasRenderingContext2D, size: number, space: Space): void {
  if (space === "map") drawMap(ctx, size);
  else if (space === "group") drawGroup(ctx, size);
  else drawSigma(ctx, size);
}

/** The equator point at angle θ in a panel's coordinate: e^{iθ} on the disk panels, φ(e^{iθ}) on σ. */
export function equatorPoint(space: Space, theta: number): Complex {
  const c: Complex = [Math.cos(theta), Math.sin(theta)];
  return space === "sigma" ? DELTOID.evalPhi(c) : c;
}

/** Map a world point in a panel to the nearest equator angle θ. */
export function pointerToTheta(space: Space, pw: Complex): number {
  if (space !== "sigma") return Math.atan2(pw[1], pw[0]);
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < 360; i++) {
    const th = (i / 360) * 2 * Math.PI;
    const q = DELTOID.evalPhi([Math.cos(th), Math.sin(th)]);
    const d = (q[0] - pw[0]) * (q[0] - pw[0]) + (q[1] - pw[1]) * (q[1] - pw[1]);
    if (d < bd) {
      bd = d;
      best = th;
    }
  }
  return best;
}

export interface MatingState {
  /** Highlighted equator angle (hover), or null. */
  theta: number | null;
  /** Angle-doubling orbit (θ, −2θ, 4θ, …), or null. */
  orbit: number[] | null;
}

/** Draw the interactive overlay for a panel: the hover marker and/or the shared doubling orbit. */
export function overlay(ctx: CanvasRenderingContext2D, size: number, space: Space, state: MatingState): void {
  const v = PANELS[space];
  // In σ, light up the transported external ray(s) under the marker/orbit — the map-side angle made visible.
  if (space === "sigma") {
    const fan = sigmaRayFan();
    if (state.orbit) for (const a of state.orbit) stroke(ctx, fan[nearestRayIndex(a)], v, size, "rgba(255,214,130,0.6)", 1.4);
    if (state.theta !== null) stroke(ctx, fan[nearestRayIndex(state.theta)], v, size, RAY_HILITE, 1.6);
  }
  if (state.orbit && state.orbit.length) {
    const n = state.orbit.length;
    for (let i = 0; i < n; i++) {
      const p = equatorPoint(space, state.orbit[i]);
      if (i > 0) stroke(ctx, [equatorPoint(space, state.orbit[i - 1]), p], v, size, "rgba(255,214,130,0.4)", 1);
      const age = (n - 1 - i) / Math.max(1, n - 1); // 0 = newest
      dot(ctx, p, v, size, `rgba(255,225,150,${(1 - 0.72 * age).toFixed(3)})`, 5 - 2 * age);
    }
  }
  if (state.theta !== null) {
    const p = equatorPoint(space, state.theta);
    if (space !== "sigma") stroke(ctx, [[0, 0], p], v, size, "rgba(255,255,255,0.4)", 1);
    const q = w2p(p, v, size);
    ctx.beginPath();
    ctx.arc(q[0], q[1], 7, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    dot(ctx, p, v, size, "#ffffff", 3);
  }
}

// ── M5: the unmating / folding animation ────────────────────────────────────────────────────────────
// A homotopy from the two flat dynamical disks (t=0, "unmated") to the σ mating (t=1). Both ENDPOINTS use
// the exact maps: the unit-circle equator ↦ the deltoid curve (equatorPoint); the group interior 𝔻 ↦ Ω
// (glue = φ∘η — the η = 1/z̄ inversion everts the disk through the equator); the radial z̄² external rays ↦
// σ's external rays (sigmaExternalRay). The straight-line path BETWEEN the endpoints is a schematic — an
// ≈ illustration of the welding, not a conformal map. Watch the equator circle grow three cusps as it
// welds (the θ↦−2θ fixed points) and the group tessellation turn inside-out to tile the exterior.

const lerpC = (a: Complex, b: Complex, t: number): Complex => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Resample a polyline to exactly n points by fractional index (endpoints preserved). */
export function resample(poly: readonly Complex[], n: number): Complex[] {
  const out: Complex[] = [];
  const last = poly.length - 1;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * last;
    const j = Math.min(Math.floor(f), last - 1);
    const g = f - j;
    out.push([poly[j][0] + (poly[j + 1][0] - poly[j][0]) * g, poly[j][1] + (poly[j + 1][1] - poly[j][1]) * g]);
  }
  return out;
}

const FOLD_RAY_N = 40;
// Precomputed fold endpoints (the expensive parts: the traced ray fan and the glued tessellation), built once.
let foldRibbons: { flat: Complex[]; curved: Complex[]; k: number }[] | null = null;
let foldTessels: { flat: Complex[]; curved: Complex[]; depth: number }[] | null = null;

function getFoldRibbons(): { flat: Complex[]; curved: Complex[]; k: number }[] {
  if (foldRibbons) return foldRibbons;
  foldRibbons = sigmaRayFan().map((ray, k) => {
    const curved = resample(ray, FOLD_RAY_N); // σ external ray, ∞ → ∂K
    const rOuter = Math.hypot(ray[0][0], ray[0][1]); // ≈ the tracer's start radius
    const th = (2 * Math.PI * k) / RAY_COUNT;
    const flat: Complex[] = []; // the flat z̄² external ray: radial, rOuter → the equator (r = 1)
    for (let i = 0; i < FOLD_RAY_N; i++) {
      const r = rOuter + (1 - rOuter) * (i / (FOLD_RAY_N - 1));
      flat.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    return { flat, curved, k };
  });
  return foldRibbons;
}

function getFoldTessels(): { flat: Complex[]; curved: Complex[]; depth: number }[] {
  if (foldTessels) return foldTessels;
  const edges = fundamentalEdges(18);
  const out: { flat: Complex[]; curved: Complex[]; depth: number }[] = [];
  for (const tile of tessellate(3)) {
    for (const e of edges) {
      const flat = e.map(tile.apply); // the flat tessellation edge in 𝔻
      out.push({ flat, curved: flat.map(glue), depth: tile.depth }); // its image Ψ(edge) in Ω
    }
  }
  out.sort((a, b) => b.depth - a.depth); // deep tiles first, so shallow draw on top
  foldTessels = out;
  return foldTessels;
}

/** Draw the unmating/folding homotopy at t ∈ [0,1]: the two flat disks (0) weld into the σ mating (1). */
export function drawFold(ctx: CanvasRenderingContext2D, size: number, t: number): void {
  const v: View = { cx: 0.2 * t, cy: 0, half: 1.6 + 1.1 * t }; // zoom out from the disk to the σ view as it folds
  const per = RAY_COUNT / 3;
  // group side: the interior tessellation everting through the equator to tile Ω
  for (const ts of getFoldTessels()) {
    stroke(ctx, ts.flat.map((p, i) => lerpC(p, ts.curved[i], t)), v, size, TEAL[Math.min(ts.depth, 2)], 1);
  }
  // map side: the radial z̄² rays bending into σ's external rays (cusp rays coloured)
  for (const rb of getFoldRibbons()) {
    const isCusp = rb.k % per === 0;
    stroke(ctx, rb.flat.map((p, i) => lerpC(p, rb.curved[i], t)), v, size, isCusp ? MARK[rb.k / per] : RAY, isCusp ? 1.3 : 0.7);
  }
  // the equator: unit circle welding into the deltoid curve
  const eq: Complex[] = [];
  for (let i = 0; i <= 180; i++) {
    const th = (i / 180) * 2 * Math.PI;
    eq.push(lerpC([Math.cos(th), Math.sin(th)], equatorPoint("sigma", th), t));
  }
  stroke(ctx, eq, v, size, EQUATOR, 2.4, true);
  // the three pinch points: cube roots on the circle → the three cusps 1.5·root
  for (let k = 0; k < 3; k++) {
    const root = IDEAL_VERTICES[k];
    dot(ctx, lerpC(root, [1.5 * root[0], 1.5 * root[1]], t), v, size, MARK[k], 5);
  }
}
