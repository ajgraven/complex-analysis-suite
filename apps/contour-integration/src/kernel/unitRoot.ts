// `e^{i(k/m)π}` as an exact element of ℚ(i)(√d) — for the five `m` where that is possible.
//
// Extracted from `branchResidue.ts` on the second-consumer rule (ADR-0007), and by the time it moved
// there were three: `branchResidue.ts` reads a pole's argument against a candidate root of unity,
// `cyclotomic.ts` verifies `−b₀/b_n = e^{iψπ}` with it, and `exponent.ts` folds one out of an
// exponent. Nothing about it is specific to a branch factor; it is arithmetic on roots of unity, and
// having it in three places under one name is the point.
//
// It lives BELOW all three because it imports nothing from them — the direction that makes the
// extraction a move rather than a cycle.
import { Gauss, SqrtExt } from "@cas/exact";

/**
 * `e^{iπ/m}` for the five `m` whose primitive root lives in one quadratic extension of ℚ(i).
 *
 * These are not a convenient subset — they are all of them. `ℚ(i)(ζ)` for `ζ = e^{iπ/m}` is a
 * quadratic extension exactly when `m ∈ {1, 2, 3, 4, 6}`; `m = 5` needs degree 4 and `m = 7` degree 6.
 */
const PRIMITIVE: Readonly<Record<number, SqrtExt>> = {
  1: SqrtExt.fromGauss(Gauss.ONE.neg()),
  2: SqrtExt.fromGauss(Gauss.I),
  3: SqrtExt.of(Gauss.rat(1n, 2n), Gauss.rat(0n, 1n, 1n, 2n), 3n),
  4: SqrtExt.of(Gauss.ZERO, Gauss.rat(1n, 2n, 1n, 2n), 2n),
  6: SqrtExt.of(Gauss.rat(0n, 1n, 1n, 2n), Gauss.rat(1n, 2n), 3n),
};

/**
 * `e^{i(k/m)π}` exactly, or null when `m` is outside the representable set.
 *
 * The `catch` is DEFENSIVE and a mutation sweep says so: every power of one primitive root stays in
 * that root's own extension (`ℚ(i)(√d)` is closed under multiplication), so `mul` cannot throw here
 * and returning a partial product instead of null is an equivalent mutant. It is kept because the
 * claim it guards — that a collision produces NOTHING rather than a wrong number — is one a future
 * primitive with a different radicand would need, and the cost is a branch that never runs.
 */
export function unitRoot(k: bigint, m: bigint): SqrtExt | null {
  const base = PRIMITIVE[Number(m)];
  if (base === undefined) return null;
  // `e^{iπ/m}` has order `2m`, so reduce the exponent first: it keeps the intermediate products
  // small and makes a negative `k` no different from a positive one.
  const period = 2n * m;
  const e = ((k % period) + period) % period;
  let acc = SqrtExt.ONE;
  for (let j = 0n; j < e; j++) {
    try {
      acc = acc.mul(base);
    } catch {
      return null;
    }
  }
  return acc;
}

/**
 * The denominators to try, smallest first — READ OFF {@link PRIMITIVE} rather than written again.
 *
 * A second list would be a second source of truth, and the kind that fails silently: adding a
 * denominator to it without a primitive root just makes every candidate at that denominator fail to
 * verify, so the list would look load-bearing while doing nothing.
 */
export const DENOMINATORS: readonly bigint[] = Object.keys(PRIMITIVE)
  .map((k) => BigInt(k))
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
