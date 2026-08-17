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
