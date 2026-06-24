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
import { makeComplexFn, makeEscapeFn } from "../expr/evaluate";

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

/** First `nplot` iterates of `f` from `z0` (stops on escape) — the drawn orbit. */
export function computeOrbit(
  fAst: Node,
  escapeAst: Node,
  z0: Vec2,
  cc: Complex,
  nplot: number,
  a: Complex = [0, 0],
): Complex[] {
  const f = makeComplexFn(fAst, a);
  const esc = makeEscapeFn(escapeAst, fAst, a);
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

export type OrbitFate = "escaped" | "converged" | "periodic" | "bounded";

export interface OrbitInfo {
  fate: OrbitFate;
  /** Cycle length for converged (1 = fixed point) / periodic orbits; 0 otherwise. */
  period: number;
  /** Iterations until escape for escaped orbits; 0 otherwise. */
  escapeIter: number;
}

/**
 * Classify the long-run fate of the orbit of `z0` under `f` (parameter `cc`):
 * escaped, converged to a fixed point, settled into a period-p cycle, or bounded
 * (none of those within `maxIter`). Cycles are detected by the orbit returning
 * within EPS of one of the last {@link MAX_PERIOD} points.
 */
export function classifyOrbit(
  fAst: Node,
  escapeAst: Node,
  z0: Vec2,
  cc: Complex,
  a: Complex = [0, 0],
  maxIter = 512,
): OrbitInfo {
  const f = makeComplexFn(fAst, a);
  const esc = makeEscapeFn(escapeAst, fAst, a);
  const EPS = 1e-6; // tolerance for "returned near an earlier point"
  const CONV_EPS = 1e-4; // window-collapse tolerance (fixed point vs genuine cycle)
  const MAX_PERIOD = 64;
  const history: Complex[] = [];
  let z: Complex = [z0[0], z0[1]];
  for (let k = 0; k < maxIter; k++) {
    if (esc(z, cc)) return { fate: "escaped", period: 0, escapeIter: k };
    for (let pd = 1; pd <= history.length; pd++) {
      const prev = history[history.length - pd];
      if (Math.abs(z[0] - prev[0]) < EPS && Math.abs(z[1] - prev[1]) < EPS) {
        // Returned near z_{k-pd}. It's a genuine period-pd cycle only if those pd
        // points are spread out; a collapsed window means the orbit converged to a
        // fixed point (e.g. a negative multiplier makes it return at pd=2 first).
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
        if (spread < CONV_EPS) return { fate: "converged", period: 1, escapeIter: 0 };
        return { fate: "periodic", period: pd, escapeIter: 0 };
      }
    }
    history.push(z);
    if (history.length > MAX_PERIOD) history.shift();
    z = f(z, cc);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) {
      return { fate: "escaped", period: 0, escapeIter: k + 1 };
    }
  }
  return { fate: "bounded", period: 0, escapeIter: 0 };
}

const FATE_COLOR: Record<OrbitFate, string> = {
  escaped: "#ff6b6b",
  converged: "#63e6a4",
  periodic: "#5cc8ff",
  bounded: "#ffd166",
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
    case "bounded":
      return "bounded";
  }
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
  /** Overlay backing-store size in px. */
  size: number;
  /** Live parameter `a`, bound in f / escape when used as a free variable. */
  a?: Complex;
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

/** Render the orbit polyline, white point, and label onto `ctx`. */
export function drawOverlay(ctx: CanvasRenderingContext2D, p: OverlayParams): void {
  const { size } = p;
  ctx.clearRect(0, 0, size, size);
  const s = size / OVERLAY_BASE;
  const cc: Complex = p.fractType === "param" ? [p.z0[0], p.z0[1]] : p.c;
  const a = p.a ?? [0, 0];
  const orbit = computeOrbit(p.fAst, p.escapeAst, p.z0, cc, p.nplot, a);
  const info = classifyOrbit(p.fAst, p.escapeAst, p.z0, cc, a);
  const fateColor = FATE_COLOR[info.fate];

  // Orbit polyline, coloured by the orbit's long-run fate.
  ctx.strokeStyle = fateColor;
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  orbit.forEach((pt, k) => {
    const [px, py] = plotToPx(pt, p.center, p.zoom, size);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // A dot at each iterate, same fate colour.
  ctx.fillStyle = fateColor;
  orbit.forEach((pt) => {
    const [dx, dy] = plotToPx(pt, p.center, p.zoom, size);
    ctx.beginPath();
    ctx.arc(dx, dy, 2 * s, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Optional critical orbit (from the critical point, default 0), drawn dashed so it
  // reads apart from the white-point orbit. Bounded → Julia set connected.
  if (p.critical) {
    const crit = p.criticalPoint ?? [0, 0];
    const critOrbit = computeOrbit(p.fAst, p.escapeAst, crit, cc, p.nplot, a);
    const critColor = FATE_COLOR[classifyOrbit(p.fAst, p.escapeAst, crit, cc, a).fate];
    ctx.strokeStyle = critColor;
    ctx.lineWidth = 1.4 * s;
    ctx.setLineDash([5 * s, 4 * s]);
    ctx.beginPath();
    critOrbit.forEach((pt, k) => {
      const [qx, qy] = plotToPx(pt, p.center, p.zoom, size);
      if (k === 0) ctx.moveTo(qx, qy);
      else ctx.lineTo(qx, qy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const [cx, cy] = plotToPx(crit, p.center, p.zoom, size);
    ctx.fillStyle = critColor;
    ctx.fillRect(cx - 3 * s, cy - 3 * s, 6 * s, 6 * s);
  }

  // White point + coordinate / fate label.
  const [px, py] = plotToPx(p.z0, p.center, p.zoom, size);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(px, py, 3 * s, 0, 2 * Math.PI);
  ctx.fill();

  const label = p.fractType === "param" ? "c=" : "z0=";
  ctx.font = `${15 * s}px sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.fillText(
    `${label}${formatComplex(truncateComplex([p.z0[0], p.z0[1]]))} · ${fateLabel(info)}`,
    px + 6 * s,
    py - 6 * s,
  );
}
