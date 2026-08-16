// @cas/faber — the exterior Faber transform engine, extracted from the Quadrature Domains app
// (ADR-0007 second-consumer rule: QD + the Faber-transform visualizer). Given an exterior conformal
// map φ: 𝔻* → Ω by its Laurent expansion at ∞ (the {c, laurent} contract in types.ts), it provides:
//   - faberPolynomials / faberPolynomial : the Faber polynomials F_n of the bounded complement K=ℂ∖Ω,
//     via the three-term recurrence (recurrence.ts).
//   - faberTransform                     : the forward transform Φφ(f)=Σ b_n F_n from f's Taylor
//     coefficients on the unit disk (transform.ts) — NEW; not present in either app before.
//   - polynomialRoots                    : Durand–Kerner + Newton polish over @cas/core (roots.ts).
//   - formatFaberPoly                    : a readable ζ-expression (format.ts).
//   - faberConvergence                   : per-order roots + residual report (convergence.ts).
// Convention-neutral (ADR-0006); stands only on @cas/core.
export type { ExteriorMap, FaberPolynomials } from "./types.js";
export { faberPolynomials, faberPolynomial } from "./recurrence.js";
export { faberTransform } from "./transform.js";
export { exteriorMapJet, faberImageOfPole, evalRationalImage } from "./exteriorMap.js";
export type { RationalImage } from "./exteriorMap.js";
export { polynomialRoots } from "./roots.js";
export type { PolynomialRootsOptions, PolynomialRootsResult } from "./roots.js";
export { formatFaberPoly } from "./format.js";
export type { FormatFaberOptions } from "./format.js";
export { faberConvergence } from "./convergence.js";
export type { FaberConvergenceEntry } from "./convergence.js";
