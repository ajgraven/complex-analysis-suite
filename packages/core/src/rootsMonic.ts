// rootsMonic.ts — monic-polynomial root finding: the app-facing plumbing around makeDurandKerner.
//
// Complex-Dynamics (render/critical.ts) and Argument-Principle (singularities.ts) each carried a
// VERBATIM copy of the same wrapper around the shared @cas/core Durand–Kerner kernel: a monic-Horner
// evaluator, a trailing-near-zero trim, the classic (0.4 + 0.9i)^i geometric-spiral seed, and the
// Gauss–Seidel / bail-on-non-finite kernel options. Consolidated here on the ADR-0007 second-consumer
// rule (2026-08 review, finding 10; AP's header literally said "mirrors complex-dynamics/…/critical.ts").
//
// What legitimately varies stays caller-side, exactly as ADR-0018 kept the lstsq rank policy caller-side:
//   - the residual CERTIFICATION policy (CD rejects the whole set if any residual is O(1); AP filters
//     per root) — so the low-level `rootsMonicClosure` returns the raw iterates and the convenience
//     `rootsMonic` applies the filter-and-return policy;
//   - app-specific seeding / deflation (Correspondences seeds from a roots-of-unity ring and deflates a
//     known root before a d ≥ 3 fallback solve — a genuinely divergent third consumer, left as-is).
//
// Arithmetic note: this uses @cas/core's tupleAlgebra, whose add/mul are bit-identical to the
// @cas/expr/complexJs ops the apps used, and whose div takes the same fast (naive) path whenever the
// divisor is O(1) — always true here, since the divisor is the leading coefficient of a trimmed
// polynomial. So the extraction reproduces both apps bit-for-bit on every non-pathological input.

import { tupleAlgebra, type ComplexTuple } from "./algebra.js";
import { makeDurandKerner, type DurandKernerOptions } from "./durand-kerner.js";

const dk = makeDurandKerner(tupleAlgebra);

/** Horner evaluation of an ascending-coefficient polynomial `p` (`p[i]` = coeff of zⁱ) at `z`. */
export function evalPolyHorner(p: readonly ComplexTuple[], z: ComplexTuple): ComplexTuple {
  let acc: ComplexTuple = [0, 0];
  for (let i = p.length - 1; i >= 0; i--) acc = tupleAlgebra.add(tupleAlgebra.mul(acc, z), p[i]);
  return acc;
}

/** Drop near-zero high-order coefficients (`|c| < tol`) so a polynomial reports its true degree. */
export function trimPoly(p: readonly ComplexTuple[], tol = 1e-12): ComplexTuple[] {
  let n = p.length;
  while (n > 1 && tupleAlgebra.abs(p[n - 1]) < tol) n--;
  return p.slice(0, n);
}

/** The classic off-axis geometric-spiral seed set (0.4 + 0.9i)^i for i = 0…m−1. */
function spiralSeeds(m: number): ComplexTuple[] {
  const seeds: ComplexTuple[] = [];
  let pw: ComplexTuple = [1, 0];
  const seed: ComplexTuple = [0.4, 0.9];
  for (let i = 0; i < m; i++) {
    seeds.push([pw[0], pw[1]]);
    pw = tupleAlgebra.mul(pw, seed);
  }
  return seeds;
}

/**
 * Durand–Kerner roots of a degree-`m` monic polynomial evaluated through the closure `pMonic`, seeded
 * from the (0.4 + 0.9i)^i spiral. Returns the `m` iterates (converged or not — the caller certifies
 * them by residual) or `null` if an iterate diverged to a non-finite value (`bailOnNonFinite`). The
 * default kernel options (Gauss–Seidel, and the kernel's own tol 1e-12 / 200 iterations) are what both
 * apps used; override via `opts`.
 */
export function rootsMonicClosure(
  pMonic: (z: ComplexTuple) => ComplexTuple,
  m: number,
  opts: DurandKernerOptions = { mode: "seidel", bailOnNonFinite: true },
): ComplexTuple[] | null {
  const res = dk(pMonic, spiralSeeds(m), opts);
  return res ? res.roots : null;
}

/**
 * Roots of an ascending-coefficient polynomial `coeffs`: trim to the true degree, solve the monic
 * form via {@link rootsMonicClosure}, and return the estimates certified by residual
 * `|p(root)| ≤ residualTol`. A diverged solve, a degree < 1, or an exactly-zero leading coefficient
 * yields `[]`. This is the Argument-Principle `polyRoots` shape; a caller wanting a different residual
 * policy (e.g. reject-all, like CD's critical points) should call {@link rootsMonicClosure} directly.
 */
export function rootsMonic(coeffs: readonly ComplexTuple[], residualTol = 1e-6): ComplexTuple[] {
  const p = trimPoly(coeffs);
  const m = p.length - 1;
  if (m < 1) return [];
  const lead = p[m];
  if (tupleAlgebra.abs(lead) === 0) return [];
  const pMonic = (z: ComplexTuple): ComplexTuple => tupleAlgebra.div(evalPolyHorner(p, z), lead);
  const roots = rootsMonicClosure(pMonic, m);
  if (!roots) return [];
  return roots.filter((r) => tupleAlgebra.abs(pMonic(r)) <= residualTol);
}

/**
 * Cauchy's root bound: every root of `p` (ascending coefficients) satisfies `|z| ≤ 1 + max_{k<n} |a_k/a_n|`.
 * A zero leading coefficient returns 1 (no bound is claimed; callers seed on the unit circle).
 *
 * Lifted on the ADR-0007 second-consumer rule from the two private copies in `@cas/faber`'s
 * `polynomialRoots` and Contour Integration's `kernel/poles.ts` (ADR-0047, PRA-1), with Polynomial
 * Root Analysis the third. `@cas/faber` passes its monic form, where `|a_n| = 1` and the bound is
 * bit-identical to the one it computed inline.
 */
export function cauchyBound(p: readonly ComplexTuple[]): number {
  const n = p.length - 1;
  const lead = n >= 0 ? tupleAlgebra.abs(p[n]) : 0;
  if (lead === 0) return 1;
  let m = 0;
  for (let k = 0; k < n; k++) m = Math.max(m, tupleAlgebra.abs(p[k]) / lead);
  return 1 + m;
}

export interface PolishOptions {
  /** Newton steps at most. Default 8. */
  readonly steps?: number;
  /** Stop once a step's modulus falls below this. Default 1e-15; 0 never stops early. */
  readonly stopBelow?: number;
  /** Stop when `|p′(z)|²` is at or below this (the step would be meaningless). Default 1e-300. */
  readonly derivativeFloor?: number;
}

/**
 * Newton-polish one root estimate `z0` of `p` (ascending coefficients). A step that would leave the
 * finite numbers is not taken, so a polish never turns a finite estimate into NaN. The arithmetic is
 * the naive complex quotient `v·conj(d)/|d|²` both lifted copies used, so each reproduces bit for bit
 * (`@cas/faber`: the defaults; Contour Integration: `{ steps: 3, stopBelow: 0, derivativeFloor: 0 }`).
 */
export function polishRoot(
  p: readonly ComplexTuple[],
  z0: ComplexTuple,
  opts: PolishOptions = {},
): ComplexTuple {
  const steps = opts.steps ?? 8;
  const stopBelow = opts.stopBelow ?? 1e-15;
  const floor = opts.derivativeFloor ?? 1e-300;
  const dp: ComplexTuple[] = [];
  for (let k = 1; k < p.length; k++) dp.push([p[k][0] * k, p[k][1] * k]);
  if (dp.length === 0) return z0;

  let z = z0;
  for (let s = 0; s < steps; s++) {
    const v = evalPolyHorner(p, z);
    const d = evalPolyHorner(dp, z);
    const d2 = d[0] * d[0] + d[1] * d[1];
    if (d2 <= floor) break;
    const step: ComplexTuple = [(v[0] * d[0] + v[1] * d[1]) / d2, (v[1] * d[0] - v[0] * d[1]) / d2];
    const next: ComplexTuple = [z[0] - step[0], z[1] - step[1]];
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) break;
    z = next;
    if (Math.hypot(step[0], step[1]) < stopBelow) break;
  }
  return z;
}

/** {@link polishRoot} applied to every estimate. */
export function polishRoots(
  p: readonly ComplexTuple[],
  roots: readonly ComplexTuple[],
  opts: PolishOptions = {},
): ComplexTuple[] {
  return roots.map((r) => polishRoot(p, r, opts));
}
