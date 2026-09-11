// @cas/exact — the exact-arithmetic kernel shared across the suite (roadmap #17, extracted per ADR-0007
// when CD became the third consumer). The exact analogue of @cas/core's numeric kernel; convention-neutral
// (ADR-0006).
//
// Contents:
//   - gaussian.ts : Frac (ℚ over BigInt) + Gauss (ℚ(i)); a field, so division is exact.
//   - qiPoly.ts   : exact univariate polynomials over ℚ(i) (divmod, exact division, Horner, Taylor
//                   shift, extended gcd / modular inverse) — the variable is abstract (z̄ for a
//                   correspondence curve, c for a Gleason polynomial).
//   - qiSeries.ts : truncated formal power series over ℚ(i) (multiply, invert, order at the origin) —
//                   the Laurent machinery behind exact residues of any order.
//   - squarefree.ts: Yun's squarefree decomposition, so multiplicity is COMPUTED rather than inferred
//                   from a cluster of nearly coincident floating roots.
//   - sqrtExt.ts  : the quadratic extension ℚ(i)(√d) — one rung above ℚ(i), which is what an
//                   algebraic pole's residue needs (the residues of 1/(1+z⁴) are not in ℚ(i)).
//   - piBounds.ts : certified rational brackets on π and arctan (Machin + the alternating-series
//                   bound), so an arc-length bound never rests on a floating constant.
//   - biPoly.ts   : exact bivariate polynomials — a polynomial in an outer variable over QiPoly (inner)
//                   coefficients, with monic division; the layer CD's dynatomic Φ_n(z,c) needs.
//   - resultant.ts: Sylvester resultant / discriminant (fraction-free Bareiss over ℚ(i)[inner]) and
//                   content-clearing — eliminate a variable between two curves (correspondence cusp locus;
//                   CD's multiplier-specialization).
//   - render.ts   : shared coefficient/polynomial string formatting.
// Consumers: apps/correspondences (deleted-correspondence curve + cusp locus, #16) and — from #17 —
// apps/complex-dynamics (dynatomic / Gleason / multiplier component data).
export { bigGcd, Frac, Gauss } from "./gaussian.js";
export { QiPoly, extendedGcd, invMod } from "./qiPoly.js";
export {
  seriesFromPoly,
  seriesInverse,
  seriesMul,
  splitOrder,
  type QiSeries,
} from "./qiSeries.js";
export { multiplicityAt, yunSquarefree, type SquarefreeFactor } from "./squarefree.js";
export { SqrtExt, sqrtOfFrac, sqrtOfGauss, squarefreeSplit } from "./sqrtExt.js";
export { arctanBounds, piBounds, piLower, piUpper, type RationalInterval } from "./piBounds.js";
export { BiPoly } from "./biPoly.js";
export { bareissDet, discriminant, integerPrimitive, primitivePoly, resultant } from "./resultant.js";
export { renderBiPolyText, renderGaussMag, renderQiPolyText } from "./render.js";
