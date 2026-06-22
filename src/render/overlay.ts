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
): Complex[] {
  const f = makeComplexFn(fAst);
  const esc = makeEscapeFn(escapeAst, fAst);
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
  /** Overlay backing-store size in px. */
  size: number;
}

/** Render the orbit polyline, white point, and label onto `ctx`. */
export function drawOverlay(ctx: CanvasRenderingContext2D, p: OverlayParams): void {
  const { size } = p;
  ctx.clearRect(0, 0, size, size);
  const s = size / OVERLAY_BASE;
  const cc: Complex = p.fractType === "param" ? [p.z0[0], p.z0[1]] : p.c;
  const orbit = computeOrbit(p.fAst, p.escapeAst, p.z0, cc, p.nplot);

  // Orbit polyline.
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  orbit.forEach((pt, k) => {
    const [px, py] = plotToPx(pt, p.center, p.zoom, size);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // White point + coordinate label.
  const [px, py] = plotToPx(p.z0, p.center, p.zoom, size);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(px, py, 3 * s, 0, 2 * Math.PI);
  ctx.fill();

  const label = p.fractType === "param" ? "c=" : "z0=";
  ctx.font = `${15 * s}px sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.fillText(
    `${label}${formatComplex(truncateComplex([p.z0[0], p.z0[1]]))}`,
    px + 6 * s,
    py - 6 * s,
  );
}
