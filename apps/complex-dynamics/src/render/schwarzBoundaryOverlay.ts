// schwarzBoundaryOverlay.ts — stroke the domain boundary ∂Ω = φ(unit circle) over the σ field (Phase F1).
//
// The boundary polygon is ALREADY computed for the in-Ω mask (schwarzBoundaryPoly, stored on the live
// session as `poly`), so this overlay is nearly free: map that same array to canvas pixels with plotToPixel
// and stroke it as a closed loop, in the casing+colour idiom of the σ-orbit overlay (render/
// schwarzOrbitOverlay.ts). Ω is the EXTERIOR of this curve for the unbounded-Laurent family and its INTERIOR
// for a bounded QD — the stroke is identical either way; it just says "here is ∂Ω". An orientation aid only:
// it draws over the field and never changes the field bytes.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import type { Complex } from "@cas/schwarz";

const CASING = "rgba(0, 0, 0, 0.72)"; // dark halo so the line reads over both dark K and a bright Ω ramp
const BOUNDARY = "#8fb7ff"; // a light blue that stays visible over the deep-navy K interior AND the ramp

/**
 * Stroke `poly` (the ∂Ω polygon, plane coordinates) onto `ctx` (a size×size 2D context showing the σ field
 * for `view`). Points map with plotToPixel; the path is closed (φ(unit circle) is a loop). No-op for a
 * degenerate polygon. Casing-under-colour so it never disappears against the field.
 */
export function drawSchwarzBoundary(
  ctx: CanvasRenderingContext2D,
  poly: readonly Complex[],
  view: SchwarzView,
  size: number,
): void {
  if (poly.length < 2) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const [x, y] = plotToPixel(view, poly[i], size);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = CASING;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = BOUNDARY;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}
