// =============================================================================
// durand-kerner.ts -- generic Durand-Kerner (Weierstrass) simultaneous root-finding.
//
// The shared iteration skeleton behind the FOUR near-duplicate copies flagged in the
// runbook (CD render/critical.ts + QD faber-analysis / direct-common / worker paths). Each
// copy differs only in peripheral heuristics — how initial guesses are seeded, Jacobi vs
// Gauss-Seidel update order, the tolerance, and what to do when two estimates coincide — NOT
// in the core update
//     z_i <- z_i - p(z_i) / prod_{j != i} (z_i - z_j).
// Those differences are exposed as options so each caller reproduces its exact prior
// behavior (bit-for-bit on every non-degenerate input): the extraction is a de-duplication,
// not a numerics change. Callers own seeding / monic-normalization / polish / degree-1,2
// closed forms; this owns the iteration.
//
// Representation-generic (option (c)): parameterized over a ComplexAlgebra<C>, so QD's
// {re,im} solver and CD's [re,im] evaluator share one tested kernel without either giving up
// its native complex type.
// =============================================================================

import type { ComplexAlgebra } from "./algebra.js";

export interface DurandKernerOptions {
  /** Stop when the largest per-root update |delta| falls below this. Default 1e-12. */
  tol?: number;
  /** Iteration cap before giving up (returns the current estimates, converged=false). Default 200. */
  maxIter?: number;
  /**
   * Update order:
   *   "jacobi" (default) — all roots updated from the previous iterate (QD's copies).
   *   "seidel"           — each root updated in place, so later roots in the same sweep see
   *                        the already-updated earlier ones (CD's copy).
   */
  mode?: "jacobi" | "seidel";
  /**
   * What to do when prod_{j!=i}(z_i - z_j) ~ 0 (two estimates collided):
   *   "skip"  (default) — leave this estimate unchanged this sweep (CD + faber).
   *   "nudge"           — perturb it by (nudgeEps, nudgeEps) to break the tie (direct-common).
   */
  onCoincident?: "skip" | "nudge";
  /** Perturbation magnitude for onCoincident="nudge". Default 1e-7. */
  nudgeEps?: number;
  /**
   * If true, abort and return null the moment any iterate becomes non-finite (CD's copy,
   * which then falls back to an image-based estimate). Default false.
   */
  bailOnNonFinite?: boolean;
}

export interface DurandKernerResult<C> {
  /** The degree-many root estimates (converged or not — inspect `converged`). */
  roots: C[];
  /** Whether the largest update fell below `tol` before hitting `maxIter`. */
  converged: boolean;
  /** Iterations actually run. */
  iterations: number;
}

// Below this squared-modulus a product-of-differences counts as a coincidence. The exact
// threshold is immaterial to every tested input (a genuine collision drives the product to
// ~0; a well-separated set keeps it O(1)); it only selects the onCoincident branch.
const COINCIDENT_EPS2 = 1e-300;

/**
 * Build a Durand-Kerner root-finder over the given complex algebra. The returned function
 * takes a closure that evaluates the MONIC polynomial at a point and the initial guesses
 * (one per root — the caller seeds them), and returns the root estimates.
 *
 * Returns `null` only when `bailOnNonFinite` is set and an iterate diverged; otherwise always
 * returns a result (with `converged` reporting whether `tol` was met).
 */
export function makeDurandKerner<C>(alg: ComplexAlgebra<C>) {
  const ONE = alg.make(1, 0);

  return function durandKerner(
    evalMonic: (z: C) => C,
    initialGuesses: readonly C[],
    opts: DurandKernerOptions = {},
  ): DurandKernerResult<C> | null {
    const tol = opts.tol ?? 1e-12;
    const maxIter = opts.maxIter ?? 200;
    const seidel = opts.mode === "seidel";
    const nudge = opts.onCoincident === "nudge";
    const nudgeEps = opts.nudgeEps ?? 1e-7;
    const bail = opts.bailOnNonFinite ?? false;

    const n = initialGuesses.length;
    let z: C[] = initialGuesses.slice();
    let iterations = 0;
    let converged = false;

    for (; iterations < maxIter; iterations++) {
      let maxDelta = 0;
      let skipped = false; // set when a coincident root is left unrefined this sweep (can't be "converged")
      // Jacobi writes into a fresh array (all reads see the previous sweep); Seidel writes in
      // place, so `next === z` and later i's read the just-updated earlier ones.
      const next: C[] = seidel ? z : new Array<C>(n);
      for (let i = 0; i < n; i++) {
        const zi = z[i];
        // denom = prod_{j != i} (z_i - z_j), starting from the multiplicative identity so a
        // degree-1 problem (empty product) divides by 1 — matching every source copy.
        let denom = ONE;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          denom = alg.mul(denom, alg.sub(zi, z[j]));
        }

        let ziNext: C;
        if (alg.abs2(denom) < COINCIDENT_EPS2) {
          if (nudge) {
            ziNext = alg.add(zi, alg.make(nudgeEps, nudgeEps));
            if (nudgeEps > maxDelta) maxDelta = nudgeEps;
          } else {
            ziNext = zi; // leave unchanged this sweep
            skipped = true; // unresolved coincidence ⇒ this root wasn't refined ⇒ block false convergence
          }
        } else {
          const delta = alg.div(evalMonic(zi), denom);
          ziNext = alg.sub(zi, delta);
          const dm = alg.abs(delta);
          if (dm > maxDelta) maxDelta = dm;
        }

        if (bail && !alg.isFinite(ziNext)) return null;
        next[i] = ziNext;
      }
      if (!seidel) z = next;
      if (maxDelta < tol && !skipped) { // a skipped (unresolved-coincident) root can't count as converged
        converged = true;
        iterations++; // count this converging sweep — `break` skips the for-loop's own i++, so this is
        break; //        NOT an off-by-one: converge-on-first-sweep correctly reports iterations === 1.
      }
    }

    return { roots: z, converged, iterations };
  };
}
