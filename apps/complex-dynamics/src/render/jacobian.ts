/**
 * Real 2×2 Jacobian methods for NON-holomorphic maps f: ℝ²→ℝ² (Burning Ship, tricorn, abs-maps),
 * where the scalar complex derivative f′ does not exist. The Jacobian
 *   J = [[∂u/∂x, ∂u/∂y], [∂v/∂x, ∂v/∂y]]   (f = u + i·v)
 * plays its role: the cycle multiplier |λ| is the spectral radius of the product of J around the
 * cycle, and the maximal Lyapunov exponent is the renormalized growth of a tangent vector
 * (Benettin). For a holomorphic f these reduce EXACTLY to |∏ f′| and (1/n)·Σ log|f′|, since J is
 * then conformal ([[u,−w],[w,u]] with f′ = u + i·w, both singular values |f′|) — the
 * holomorphic-reduction oracle the tests pin down.
 *
 * Central finite differences with step h = ε^{1/3}·max(|coord|, 1); when a difference would
 * straddle a coordinate axis (|coord| < h, where abs-maps have a kink) it switches to a one-sided
 * difference to avoid the false-zero derivative there. Results for a non-holomorphic f are therefore
 * estimates (callers label them "≈").
 */

import type { Complex } from "../complex";

const EPS_CBRT = Math.cbrt(2.220446049250313e-16); // ≈ 6.06e-6 — optimal central-difference step

/** 2×2 real matrix stored row-major: [a, b, c, d] = [[a, b], [c, d]]. */
export type Mat2 = [number, number, number, number];

/**
 * Real Jacobian of f at z (with parameter c), by central differences, switching to a one-sided
 * difference near a coordinate axis so an abs-map kink doesn't produce a false zero.
 */
export function realJacobian(
  f: (z: Complex, c: Complex) => Complex,
  z: Complex,
  c: Complex,
): Mat2 {
  const x = z[0];
  const y = z[1];
  const hx = EPS_CBRT * Math.max(Math.abs(x), 1);
  const hy = EPS_CBRT * Math.max(Math.abs(y), 1);

  let dudx: number;
  let dvdx: number;
  if (Math.abs(x) < hx) {
    const f0 = f(z, c); // straddles x = 0 (abs kink) ⇒ one-sided
    const fp = f([x + hx, y], c);
    dudx = (fp[0] - f0[0]) / hx;
    dvdx = (fp[1] - f0[1]) / hx;
  } else {
    const fp = f([x + hx, y], c);
    const fm = f([x - hx, y], c);
    dudx = (fp[0] - fm[0]) / (2 * hx);
    dvdx = (fp[1] - fm[1]) / (2 * hx);
  }

  let dudy: number;
  let dvdy: number;
  if (Math.abs(y) < hy) {
    const f0 = f(z, c);
    const fp = f([x, y + hy], c);
    dudy = (fp[0] - f0[0]) / hy;
    dvdy = (fp[1] - f0[1]) / hy;
  } else {
    const fp = f([x, y + hy], c);
    const fm = f([x, y - hy], c);
    dudy = (fp[0] - fm[0]) / (2 * hy);
    dvdy = (fp[1] - fm[1]) / (2 * hy);
  }
  return [dudx, dudy, dvdx, dvdy];
}

/** Spectral radius (largest |eigenvalue|) of a real 2×2 matrix. */
export function spectralRadius(m: Mat2): number {
  const [a, b, c, d] = m;
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return Math.max(Math.abs((tr + s) / 2), Math.abs((tr - s) / 2));
  }
  return Math.sqrt(Math.abs(det)); // complex-conjugate eigenpair: |λ| = √det
}

/** 2×2 matrix product A·B. */
function matMul(A: Mat2, B: Mat2): Mat2 {
  return [
    A[0] * B[0] + A[1] * B[2],
    A[0] * B[1] + A[1] * B[3],
    A[2] * B[0] + A[3] * B[2],
    A[2] * B[1] + A[3] * B[3],
  ];
}

/**
 * |λ| of an attracting cycle for a non-holomorphic f: the spectral radius of the product of the
 * real Jacobians around the cycle, ρ(∏ J(z_k)). Attracting ⟺ |λ| < 1, base-point invariant.
 * Reduces to |∏ f′| when f is holomorphic. Returns null if a Jacobian is non-finite.
 */
export function cycleMultiplierMag(
  f: (z: Complex, c: Complex) => Complex,
  cycle: Complex[],
  c: Complex,
): number | null {
  let m: Mat2 = [1, 0, 0, 1];
  for (const w of cycle) {
    const j = realJacobian(f, w, c);
    if (!j.every((v) => Number.isFinite(v))) return null;
    m = matMul(j, m);
  }
  const r = spectralRadius(m);
  return Number.isFinite(r) ? r : null;
}

/**
 * Maximal Lyapunov exponent (nats/iter) of the orbit of z0 for a non-holomorphic f, via the
 * Benettin renormalized-tangent method: carry a unit tangent v, grow it by the real Jacobian each
 * step, accumulate log of the growth, renormalize. Returns `escapes: true` if the orbit leaves the
 * set, and value −∞ if the tangent collapses (a superattracting / critical hit). Reduces to
 * (1/n)·Σ log|f′| for a holomorphic f.
 */
export function lyapunovJacobian(
  f: (z: Complex, c: Complex) => Complex,
  esc: (z: Complex, c: Complex) => boolean,
  z0: Complex,
  c: Complex,
  n: number,
): { value: number | null; escapes: boolean } {
  let z: Complex = [z0[0], z0[1]];
  let vx = 1;
  let vy = 0;
  let sum = 0;
  let count = 0;
  for (let k = 0; k < n; k++) {
    if (esc(z, c)) return { value: null, escapes: true };
    const [a, b, cc, d] = realJacobian(f, z, c);
    const nx = a * vx + b * vy;
    const ny = cc * vx + d * vy;
    const r = Math.hypot(nx, ny);
    if (!Number.isFinite(r)) return { value: null, escapes: true };
    if (r === 0) return { value: -Infinity, escapes: false }; // tangent collapse ⇒ superattracting
    sum += Math.log(r);
    count++;
    vx = nx / r;
    vy = ny / r;
    z = f(z, c);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return { value: null, escapes: true };
  }
  return { value: count > 0 ? sum / count : null, escapes: false };
}
