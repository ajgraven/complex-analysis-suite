// @cas/core — the pure numeric kernel shared across the suite (Phase 3, MIGRATION.md).
// Convention-neutral (ADR-0006): no pi / 2pi-i normalization constants live here; those stay
// at each app's domain edge.
//
// First extraction (this commit): the object-representation complex arithmetic ({re,im}),
// TS-ported from the Quadrature app's complex.mjs. Still to come in later commits:
//   - the tuple representation ([re,im], from Complex Dynamics),
//   - the generic `ComplexAlgebra<C>` contract both representations satisfy, and
//   - the generic algorithms over it (Durand-Kerner root-finding, formal series, Newton) —
//     which are the genuine cross-app "fix a bug once" surface.
export { Complex, default } from "./complex.js";
export type { Cx } from "./complex.js";
