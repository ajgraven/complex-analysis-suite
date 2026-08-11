// @cas/conformal — public surface. The conformal-map BUILDER: given a Jordan domain's boundary, fit the
// Riemann map to (and from) the unit disk. Three layers, each pure and node-tested:
//   - vandermondeArnoldi : the numerically-stable polynomial basis (Brubeck–Nakatsukasa–Trefethen 2021)
//                          the fits are expressed in — replaces the ill-conditioned Vandermonde matrix.
//   - lightning          : f: Ω → 𝔻 by the lightning least-squares method (Gopal–Trefethen 2019), with
//                          corner-clustered poles resolving algebraic boundary singularities.
//   - forwardMap         : g: 𝔻 → Ω, the forward map fit directly from f's boundary correspondence.
// Extracted from the Riemann-map app as a deliberate extract-ahead-of-demand (ADR-0018): Schwarz–Christoffel
// (roadmap step E) and the other Tier-3 conformal engines are the anticipated second consumers. Stands on
// @cas/core's Householder-QR least squares; convention-neutral (ADR-0006).
export { arnoldiBasis, evalArnoldi, evalExpansion, cabs } from "./vandermondeArnoldi.js";
export type { ArnoldiBasis, C } from "./vandermondeArnoldi.js";
export { fitConformalMap, fitSmoothConformalMap } from "./lightning.js";
export type { ConformalMap } from "./lightning.js";
export { fitForwardMap } from "./forwardMap.js";
export type { ForwardMap } from "./forwardMap.js";
