// @cas/core — the pure numeric kernel shared across the suite (Phase 3, MIGRATION.md).
// Convention-neutral (ADR-0006): no pi / 2pi-i normalization constants live here; those stay
// at each app's domain edge.
//
// Contents:
//   - complex.ts     : object-representation complex arithmetic ({re,im}), TS-ported from QD.
//   - algebra.ts     : the ComplexAlgebra<C> contract + its two reference instances
//                      (objAlgebra {re,im}, tupleAlgebra [re,im]) — representation-genericity.
//   - durand-kerner  : generic Durand-Kerner root-finding over any ComplexAlgebra.
//   - series         : truncated formal power-series multiply (the shared workhorse).
//   - poly           : dense polynomial coefficient arithmetic over any ComplexAlgebra (the
//                      float coefficient-array layer around Durand-Kerner; TS port of QD.Poly).
//   - format         : Unicode sub/superscript label rendering (a display leaf; the display half
//                      of the poly-helpers extraction).
//   - sphere         : stereographic projection C∪{∞} ↔ the Riemann sphere (cancellation-safe
//                      inverse), shared by both apps' sphere views.
//   - lstsq          : real overdetermined least squares by (backward-stable) Householder QR — the
//                      numeric workhorse under overdetermined fits (the @cas/conformal builder; QD).
//   - geometry       : convention-neutral 2D geometry (pointInPolygon even-odd test; signedArea /
//                      orientCCW shoelace orientation), the single home for the copies @cas/schwarz +
//                      @cas/conformal + the Riemann-map, Argument-Principle & Faber apps each carried
//                      (ADR-0007).
//   - rootsMonic     : app-facing monic-polynomial root finding (Horner eval, trim, spiral-seeded
//                      Durand-Kerner) — the wrapper Complex-Dynamics + Argument-Principle mirrored
//                      around makeDurandKerner (ADR-0007). Residual policy stays caller-side.
export { Complex, default } from "./complex.js";
export type { Cx } from "./complex.js";
export { objAlgebra, tupleAlgebra } from "./algebra.js";
export type { ComplexAlgebra, ComplexTuple } from "./algebra.js";
export { makeDurandKerner } from "./durand-kerner.js";
export type { DurandKernerOptions, DurandKernerResult } from "./durand-kerner.js";
export { makeSeries } from "./series.js";
export type { Series } from "./series.js";
export { makePoly } from "./poly.js";
export type { Poly, PolyOps } from "./poly.js";
export { subscript, superscript } from "./format.js";
export { planeToSphere, sphereToPlane } from "./sphere.js";
export { lstsqHouseholder } from "./lstsq.js";
export { pointInPolygon, signedArea, orientCCW } from "./geometry.js";
export type { Point2 } from "./geometry.js";
export { evalPolyHorner, trimPoly, rootsMonicClosure, rootsMonic } from "./rootsMonic.js";
