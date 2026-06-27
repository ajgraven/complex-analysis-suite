/**
 * A tiny critical-orbit preview for parameter-plane hover: the orbit of the critical point
 * for the hovered c, framed to a fixed z-window. Green = the orbit stays bounded (the Julia
 * set there is connected); orange = it escapes (a Cantor dust). It's a cheap, CPU-only hint
 * at "what the dynamical plane looks like here" — no extra GL context. Pure draw (takes a
 * 2D ctx + points), so the geometry helper is unit-tested and it's cheap to call on hover.
 */

import type { Vec2 } from "../arrays";

/** Half-width of the z-window the preview frames (the z²+c critical orbit lives in |z| ≲ 2). */
export const PREVIEW_HALF = 2.2;

/** Map a z-plane point into preview pixels (origin centre, y up). */
export function previewToPx(p: Vec2, size: number): Vec2 {
  const u = (p[0] / PREVIEW_HALF) * 0.5 + 0.5;
  const v = (p[1] / PREVIEW_HALF) * 0.5 + 0.5;
  return [u * size, (1 - v) * size];
}

/** Draw the critical orbit polyline + dots, coloured by whether it stays bounded. */
export function drawOrbitPreview(
  ctx: CanvasRenderingContext2D,
  orbit: Vec2[],
  bounded: boolean,
  size: number,
): void {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, size, size);
  const color = bounded ? "#5ad1a0" : "#e8843b";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  orbit.forEach((p, i) => {
    const [x, y] = previewToPx(p, size);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = color;
  for (const p of orbit) {
    const [x, y] = previewToPx(p, size);
    if (x >= 0 && x <= size && y >= 0 && y <= size) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
