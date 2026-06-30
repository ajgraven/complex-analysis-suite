/**
 * projection.ts — coordinate remaps for the projection view modes (log-polar + Poincaré disk).
 *
 * A projection replaces the plain linear screen→plot map (plot = centre + (uv·2−1)/zoom) with a
 * non-linear one. The shader needs the INVERSE map (screen/view coordinate → the plot z it shows);
 * the FORWARD map (plot → view) is used for pointer hit-testing and overlays. This module is the
 * single source of truth for both, mirrored exactly by the GLSL in shaderBuilder so the picture and
 * the cursor agree.
 *
 *   • Poincaré disk (user's law): the screen shows the unit disk; a disk point w maps to the plot
 *     point z = projCentre + 2·atanh(|w|)·ŵ, i.e. forward w = tanh(|z−c*|/2)·(z−c*)/|z−c*|. Treats
 *     |z−c*| as a hyperbolic distance, so the whole plane compresses into the disk (boundary = ∞),
 *     a flat counterpart to the Riemann-sphere snapshot. Off-disk pixels (|w| ≥ 1) are background.
 *   • Log-polar (exponential map): the screen's x ∈ [−1,1] is the angle φ ∈ [−π,π] about projCentre
 *     and y ∈ [−1,1] is the log-radius ρ ∈ [−π,π]; the plot point is z = projCentre + e^{ρ+iφ}.
 *     Panning y slides ρ → a constant-rate exponential zoom toward projCentre (the zoom-video).
 *
 * The view coordinate is the same (uv·2−1)/zoom + centre the linear path uses, but interpreted in
 * PROJECTED space (the disk, or the φ–ρ rectangle); projCentre is the plot-space anchor. Pure module
 * — no DOM / GL; single precision only (df64 / perturbation keep the linear map). See the 8a plan.
 */
import type { Vec2 } from "../arrays";

export type ProjectionMode = "linear" | "logpolar" | "poincare";

/** uProjection uniform values, shared with the GLSL coordinate template. */
export const PROJECTIONS: Record<ProjectionMode, number> = {
  linear: 0,
  logpolar: 1,
  poincare: 2,
};

const PI = Math.PI;

/**
 * Inverse projection: a view-square coordinate (the linear `centre + (uv·2−1)/zoom`, reinterpreted in
 * projected space) → the plot coordinate it represents, or null when the pixel is off the projected
 * domain (outside the Poincaré unit disk). For "linear" it is the identity (the projection path is
 * not taken).
 */
export function inverseProject(view: Vec2, projCentre: Vec2, mode: ProjectionMode): Vec2 | null {
  if (mode === "poincare") {
    const r = Math.hypot(view[0], view[1]);
    if (r >= 1) return null; // outside the unit disk ⇒ background
    if (r === 0) return [projCentre[0], projCentre[1]];
    const k = (2 * Math.atanh(r)) / r; // |z − c*| = 2·atanh(|w|), direction preserved
    return [projCentre[0] + view[0] * k, projCentre[1] + view[1] * k];
  }
  if (mode === "logpolar") {
    const phi = view[0] * PI; // screen x ∈ [−1,1] ↦ angle [−π,π]
    const rho = view[1] * PI; // screen y ∈ [−1,1] ↦ log-radius [−π,π]
    const rad = Math.exp(rho);
    return [projCentre[0] + rad * Math.cos(phi), projCentre[1] + rad * Math.sin(phi)];
  }
  return [view[0], view[1]]; // linear (identity; unused on the projection path)
}

/**
 * Forward projection: a plot coordinate → its view-square coordinate, for pointer hit-testing and
 * overlay placement. The inverse of {@link inverseProject} on its domain.
 */
export function forwardProject(plot: Vec2, projCentre: Vec2, mode: ProjectionMode): Vec2 {
  const dx = plot[0] - projCentre[0];
  const dy = plot[1] - projCentre[1];
  if (mode === "poincare") {
    const r = Math.hypot(dx, dy);
    if (r === 0) return [0, 0];
    const k = Math.tanh(r / 2) / r; // |w| = tanh(|z − c*|/2)
    return [dx * k, dy * k];
  }
  if (mode === "logpolar") {
    const r = Math.hypot(dx, dy) || Number.MIN_VALUE;
    return [Math.atan2(dy, dx) / PI, Math.log(r) / PI];
  }
  return [plot[0], plot[1]];
}
