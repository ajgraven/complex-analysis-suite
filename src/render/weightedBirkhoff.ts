/**
 * weightedBirkhoff.ts — the Das–Saiki–Sander–Yorke weighted Birkhoff average, a
 * super-convergent way to read rotation numbers (and test quasiperiodicity) off a finite
 * orbit.
 *
 * For a smooth quasiperiodic orbit, weighting the Birkhoff sum by the C^∞ bump
 *
 *     w(t) = exp(−1 / (t^p (1−t)^p)),   t ∈ (0,1),   w = 0 at/outside the ends,
 *
 * makes the average converge faster than any power of N — ~10–30 digits from a few
 * thousand iterates, versus the O(1/N) of a plain Birkhoff average. The convergence is
 * itself a quasiperiodicity test: on a chaotic orbit the weighted average still only
 * converges O(1/N), so comparing the estimate over half the orbit against the full orbit
 * separates quasiperiodic (Siegel/Herman) motion from everything else.
 *
 * Used to label rotation domains: the rotation number is the weighted average of the
 * per-step angle the orbit sweeps about its centre (the indifferent fixed point for a
 * Siegel disc, the orbit centroid for a Herman ring).
 *
 * Pure module — no DOM / GL. Complex = [re, im]. See FEATURE_RESEARCH.md §1.2 / §5.
 */
import type { Complex } from "../complex";

const TAU = 2 * Math.PI;

/** C^∞ bump weight on (0,1); 0 at and outside the endpoints. Symmetric about ½. */
export function bumpWeight(t: number, p = 1): number {
  if (t <= 0 || t >= 1) return 0;
  const d = Math.pow(t * (1 - t), p);
  return Math.exp(-1 / d);
}

/** Weighted Birkhoff average of samples g(z₀…z_{N−1}), weights ŵₙ = w((n+½)/N). */
export function weightedBirkhoffAverage(values: number[], p = 1): number {
  const N = values.length;
  if (N === 0) return NaN;
  let num = 0;
  let den = 0;
  for (let n = 0; n < N; n++) {
    const w = bumpWeight((n + 0.5) / N, p);
    num += w * values[n];
    den += w;
  }
  return den > 0 ? num / den : NaN;
}

/** Signed per-step angles (radians, in (−π, π]) the orbit sweeps about `center`. */
export function stepAngles(orbit: Complex[], center: Complex): number[] {
  const angles: number[] = [];
  for (let n = 0; n + 1 < orbit.length; n++) {
    const a = Math.atan2(orbit[n][1] - center[1], orbit[n][0] - center[0]);
    const b = Math.atan2(orbit[n + 1][1] - center[1], orbit[n + 1][0] - center[0]);
    let d = b - a; // = arg((z_{n+1}−c)/(z_n−c))
    while (d > Math.PI) d -= TAU;
    while (d <= -Math.PI) d += TAU;
    angles.push(d);
  }
  return angles;
}

/** A rotation-number estimate plus a quasiperiodicity confidence. */
export interface RotationEstimate {
  /** Rotation number α ∈ [0, 1). */
  alpha: number;
  /** |WB(full) − WB(first half)| of the per-step angle / 2π — small ⇒ converged. */
  residual: number;
  /** True when the weighted average has converged (residual < `tol`) ⇒ quasiperiodic. */
  quasiperiodic: boolean;
}

/**
 * Rotation number α ∈ [0,1) about `center`, via the weighted Birkhoff average of the
 * per-step swept angle. (Bare value; use {@link estimateRotation} for the convergence test.)
 */
export function rotationNumber(orbit: Complex[], center: Complex, p = 1): number {
  const a = weightedBirkhoffAverage(stepAngles(orbit, center), p) / TAU;
  return a - Math.floor(a);
}

/**
 * Rotation number with a quasiperiodicity verdict. The residual compares the weighted
 * average over the first half of the orbit against the full orbit; for smooth quasiperiodic
 * motion both super-converge to the same α (tiny residual), whereas a chaotic / escaping
 * orbit gives an O(1/N) discrepancy. `tol` should be loosened for short orbits.
 */
export function estimateRotation(
  orbit: Complex[],
  center: Complex,
  p = 1,
  tol = 1e-6,
): RotationEstimate {
  const angles = stepAngles(orbit, center);
  const full = weightedBirkhoffAverage(angles, p) / TAU;
  const half = weightedBirkhoffAverage(angles.slice(0, angles.length >> 1), p) / TAU;
  const residual = Math.abs(full - half);
  const alpha = full - Math.floor(full);
  return { alpha, residual, quasiperiodic: Number.isFinite(residual) && residual < tol };
}
