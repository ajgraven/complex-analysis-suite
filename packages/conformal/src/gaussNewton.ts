// gaussNewton.ts — the damped Gauss–Newton driver shared by the interior and exterior Schwarz–Christoffel
// parameter solves. Both pose the same problem: drive a residual F(y) → 0 over free parameters y by
// finite-difference Jacobian + one @cas/core `lstsqHouseholder` least-squares step, damped by a halving
// line search, stopping on tolerance or a stall. The two solvers differ only in how y maps to prevertices
// and what F measures, so that mapping stays in each solver and the loop lives here once. Pure.
import { lstsqHouseholder } from "@cas/core";

const normInf = (F: readonly number[]): number => F.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

export interface GaussNewtonResult {
  /** The final free-parameter vector. */
  readonly y: number[];
  /** The final residual vector F(y). */
  readonly residual: number[];
  /** Iterations taken (a step that failed to reduce ‖F‖∞ ends the loop without counting further). */
  readonly iterations: number;
}

export interface GaussNewtonOptions {
  /** Stop when ‖F‖∞ < tol. */
  readonly tol: number;
  /** Iteration cap. */
  readonly maxIter: number;
  /** Forward-difference step for the Jacobian (default 1e-6). */
  readonly fdStep?: number;
}

/**
 * Minimize ‖`residual`(y)‖∞ from the seed `y0` by damped Gauss–Newton: each iteration builds the
 * forward-difference Jacobian, takes the least-squares step `δ = −J⁺F`, and halves the step until ‖F‖∞
 * decreases (down to a 1e-4 floor); a step that can't decrease it ends the loop. Returns the best y, its
 * residual, and the iteration count.
 */
export function dampedGaussNewton(
  residual: (y: readonly number[]) => number[],
  y0: readonly number[],
  opts: GaussNewtonOptions,
): GaussNewtonResult {
  const h = opts.fdStep ?? 1e-6;
  const nFree = y0.length;
  let y = y0.slice();
  let F = residual(y);
  let iter = 0;
  for (; iter < opts.maxIter && normInf(F) >= opts.tol; iter++) {
    const m = F.length;
    const J: number[][] = Array.from({ length: m }, () => new Array<number>(nFree).fill(0));
    for (let j = 0; j < nFree; j++) {
      const yj = y.slice();
      yj[j] += h;
      const Fj = residual(yj);
      for (let i = 0; i < m; i++) J[i][j] = (Fj[i] - F[i]) / h;
    }
    const delta = lstsqHouseholder(J, F.map((v) => -v));
    let lam = 1;
    let yTry = y.map((v, j) => v + lam * delta[j]);
    let FTry = residual(yTry);
    while (normInf(FTry) >= normInf(F) && lam > 1e-4) {
      lam /= 2;
      yTry = y.map((v, j) => v + lam * delta[j]);
      FTry = residual(yTry);
    }
    if (normInf(FTry) >= normInf(F)) break; // stalled — no further descent
    y = yTry;
    F = FTry;
  }
  return { y, residual: F, iterations: iter };
}
