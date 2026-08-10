// schwarzBoundaryOverlay.ts — stroke the domain boundary ∂Ω = φ(unit circle) over the σ field (Phase F1),
// plus its z-disk image (the unit circle |z|=1, Phase F2c).
//
// The boundary polygon is ALREADY computed for the in-Ω mask (schwarzBoundaryPoly, stored on the live
// session as `poly`), so this overlay is nearly free: map that same array to canvas pixels with plotToPixel
// and stroke it as a closed loop, in the casing+colour idiom of the σ-orbit overlay (render/
// schwarzOrbitOverlay.ts). Ω is the EXTERIOR of this curve for the unbounded-Laurent family and its INTERIOR
// for a bounded QD — the stroke is identical either way; it just says "here is ∂Ω". An orientation aid only:
// it draws over the field and never changes the field bytes.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import { planeToScreenUv, type SphereCamera } from "./sphereView";
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

/**
 * Stroke ∂Ω onto the rendered Riemann sphere (F2d-ii). Each boundary point w is projected to its pixel on
 * the ball via planeToScreenUv; a point on the occluded far hemisphere returns null and LIFTS the pen, so
 * only the front arc of the curve is drawn (it visibly runs over the horizon). `cam` is the σ sphere camera;
 * `size` the square backing. Same casing+colour idiom as drawSchwarzBoundary. No-op for a degenerate polygon.
 */
export function drawSchwarzBoundarySphere(
  ctx: CanvasRenderingContext2D,
  poly: readonly Complex[],
  cam: SphereCamera,
  size: number,
): void {
  if (poly.length < 2) return;
  const pts = poly.map((w) => {
    const uv = planeToScreenUv(w, cam);
    return uv ? ([uv[0] * size - 0.5, uv[1] * size - 0.5] as [number, number]) : null;
  });
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // One path with breaks at the horizon; the closed loop is handled by the wrap-around pen logic (the last
  // visible run reconnects to the first only if both ends are visible — otherwise it simply stops at the rim).
  ctx.beginPath();
  let penDown = false;
  for (const pt of pts) {
    if (!pt) {
      penDown = false;
      continue;
    }
    if (penDown) ctx.lineTo(pt[0], pt[1]);
    else {
      ctx.moveTo(pt[0], pt[1]);
      penDown = true;
    }
  }
  ctx.strokeStyle = CASING;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = BOUNDARY;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

/**
 * Stroke the unit circle |z| = 1 — the z-disk image of ∂Ω (F2c). In the uniformizing coordinate z the
 * domain boundary ∂Ω = φ(unit circle) IS the unit circle, so the z-disk boundary overlay is this fixed
 * curve, independent of φ. `view` is the z-disk window; plotToPixel is a uniform-scale affine map (the
 * same 1/zoom half-width on both axes), so the circle stays a circle — drawn exactly with `arc` about
 * z = 0's pixel, radius = size·zoom/2. Same casing+colour idiom as drawSchwarzBoundary.
 */
export function drawSchwarzUnitCircle(
  ctx: CanvasRenderingContext2D,
  view: SchwarzView,
  size: number,
): void {
  const [cx, cy] = plotToPixel(view, [0, 0], size);
  const rPix = (size * view.zoom) / 2; // |z|=1 under plotToPixel's uniform scale
  if (!(rPix > 0)) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rPix, 0, 2 * Math.PI);
  ctx.strokeStyle = CASING;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = BOUNDARY;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}
