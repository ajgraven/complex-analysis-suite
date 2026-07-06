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
// Still to come (Phase 5/6): the rest of formal series, Newton + deflation, mat4/camera.
export { Complex, default } from "./complex.js";
export type { Cx } from "./complex.js";
export { objAlgebra, tupleAlgebra } from "./algebra.js";
export type { ComplexAlgebra, ComplexTuple } from "./algebra.js";
export { makeDurandKerner } from "./durand-kerner.js";
export type { DurandKernerOptions, DurandKernerResult } from "./durand-kerner.js";
export { makeSeries } from "./series.js";
export type { Series } from "./series.js";
