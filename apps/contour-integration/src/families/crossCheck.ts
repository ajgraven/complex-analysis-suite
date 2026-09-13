// The differential check every exact coefficient walk is held to.
//
// `exactConstant` walks a coefficient into ℚ(i), `exactBasisConstant` into `Σ cₖe^{βₖ}`, and
// `exactPiConstant` into ℚ(i)(π). All three then ask `@cas/expr`'s float64 evaluator for the same
// number and compare. The point is not precision — it is that the two share NO arithmetic, one being
// BigInt rationals and the other float64, so agreement is evidence of a correct walk rather than a
// restatement of it. The residue theorem and the quadrature are held to the same discipline.
//
// It lives here because it was written three times otherwise, and a check that drifts between its
// copies is worse than no check: the one that is wrong is the one nobody reads.
import { evaluate, type Node } from "@cas/expr";
import type { Bindings } from "./schema.js";

/**
 * How far the exact walk and the numeric evaluator may differ before the disagreement is reported.
 *
 * RELATIVE, not absolute. The check exists to catch a coding error in the exact walker — which would
 * be a gross disagreement, not a rounding one — and an absolute bound would report a large
 * coefficient as "disagreeing" purely because float64 cannot hold it to 1e-9.
 */
export const CROSS_CHECK_TOL = 1e-9;

/**
 * A family's numeric parameters, in the form `@cas/expr`'s evaluator takes.
 *
 * Not `runFamily.numericBindings`, which answers a different question — that one keeps the reals a
 * slider can carry, this one packs every binding into a complex pair for the evaluator.
 */
export function evaluatorBindings(bindings: Bindings): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (typeof v === "number") out[k] = [v, 0];
    else if (typeof v === "string" && Number.isFinite(Number(v))) out[k] = [Number(v), 0];
  }
  return out;
}

/**
 * The disagreement between an exact walk and the numeric evaluator, as a reason — or `null`.
 *
 * A `boolean` from the evaluator (a comparison expression, which a coefficient never is) is not a
 * number to compare against, so there is nothing to check and nothing to report.
 */
export function crossCheckNumeric(
  ast: Node,
  bindings: Bindings,
  exact: readonly [number, number],
): string | null {
  const got = evaluate(ast, [0, 0], [0, 0], undefined, evaluatorBindings(bindings));
  if (typeof got === "boolean") return null;
  const [re, im] = exact;
  const scale = Math.max(1, Math.abs(re), Math.abs(im));
  if (
    Math.abs(got[0] - re) > CROSS_CHECK_TOL * scale ||
    Math.abs(got[1] - im) > CROSS_CHECK_TOL * scale
  ) {
    return `the exact and numeric evaluations of the coefficient disagree (${re}+${im}i vs ${got[0]}+${got[1]}i)`;
  }
  return null;
}
