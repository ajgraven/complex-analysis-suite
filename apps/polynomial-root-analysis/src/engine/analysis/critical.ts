// Critical points: the roots of p′, found and certified exactly as the roots of p are (DESIGN §4.1
// step 4), and checked against Gauss–Lucas in exact arithmetic.
import { QiPoly, gaussOfDoubles, type Gauss } from "@cas/exact";
import type { Polynomial } from "../polynomial.js";
import type { Cx } from "../types.js";
import { discsFor, type DiscReport } from "../roots/discs.js";
import { solveAndRefine } from "../roots/solve.js";
import { convexHull, inHull, type Hull } from "./hull.js";

export interface CriticalReport {
  readonly points: readonly Cx[];
  readonly discs: DiscReport;
  readonly hull: Hull;
  /** Every plotted critical point lies in the closed hull of the plotted roots (exact test). */
  readonly inHull: boolean;
}

export function criticalPoints(p: Polynomial): CriticalReport | null {
  if (p.degree < 2) return null;
  const exact: Gauss[] = p.exact
    ? Array.from({ length: p.degree + 1 }, (_, k) => (p.exact as QiPoly).coeff(k))
    : p.coeffs.map(([a, b]) => gaussOfDoubles(a, b));
  const dExact = QiPoly.fromCoeffs(exact).derivative();
  const dc: Gauss[] = Array.from({ length: dExact.degree() + 1 }, (_, k) =>
    dExact.coeff(k),
  );
  const dFloat: Cx[] = dc.map((g) => g.toTuple());
  const points = solveAndRefine(dFloat, dc).roots;
  const discs = discsFor(dFloat, dc, points);
  const hull = convexHull(p.roots);
  return { points, discs, hull, inHull: points.every((c) => inHull(hull, c)) };
}
