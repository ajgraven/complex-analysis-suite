// @cas/exact — the exact-arithmetic kernel shared across the suite (roadmap #17, extracted per ADR-0007
// when CD became the third consumer). The exact analogue of @cas/core's numeric kernel; convention-neutral
// (ADR-0006).
//
// Contents:
//   - gaussian.ts : Frac (ℚ over BigInt) + Gauss (ℚ(i)); a field, so division is exact.
//   - qiPoly.ts   : exact univariate polynomials over ℚ(i) (divmod, exact division, Horner) — the variable
//                   is abstract (z̄ for a correspondence curve, c for a Gleason polynomial).
//   - biPoly.ts   : exact bivariate polynomials — a polynomial in an outer variable over QiPoly (inner)
//                   coefficients, with monic division; the layer CD's dynatomic Φ_n(z,c) needs.
//   - resultant.ts: Sylvester resultant / discriminant (fraction-free Bareiss over ℚ(i)[inner]) and
//                   content-clearing — eliminate a variable between two curves (correspondence cusp locus;
//                   CD's multiplier-specialization).
//   - render.ts   : shared coefficient/polynomial string formatting.
// Consumers: apps/correspondences (deleted-correspondence curve + cusp locus, #16) and — from #17 —
// apps/complex-dynamics (dynatomic / Gleason / multiplier component data).
export { bigGcd, Frac, Gauss } from "./gaussian.js";
export { QiPoly } from "./qiPoly.js";
export { BiPoly } from "./biPoly.js";
export { bareissDet, discriminant, integerPrimitive, primitivePoly, resultant } from "./resultant.js";
export { renderBiPolyText, renderGaussMag, renderQiPolyText } from "./render.js";
