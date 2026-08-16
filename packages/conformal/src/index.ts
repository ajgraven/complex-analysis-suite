// @cas/conformal — public surface. The conformal-map BUILDER: given a Jordan domain's boundary, fit the
// Riemann map to (and from) the unit disk; plus the Schwarz–Christoffel engine for polygons.
//   - vandermondeArnoldi : the numerically-stable polynomial basis (Brubeck–Nakatsukasa–Trefethen 2021)
//                          the fits are expressed in — replaces the ill-conditioned Vandermonde matrix.
//   - lightning          : f: Ω → 𝔻 by the lightning least-squares method (Gopal–Trefethen 2019), with
//                          corner-clustered poles resolving algebraic boundary singularities.
//   - forwardMap         : g: 𝔻 → Ω, the forward map fit directly from f's boundary correspondence.
//   - Schwarz–Christoffel: fitSchwarzChristoffel — the SC map of a bounded polygon (roadmap step E). Two
//                          modes: fast (= the lightning fit) and precise (the parameter-problem solve).
//                          Built on gaussJacobi (quadrature), scQuadrature (compound rule),
//                          schwarzChristoffel (forward map), scParameterProblem (the nonlinear solve).
// Extracted from the Riemann-map app as an extract-ahead-of-demand (ADR-0018); SC is its second consumer
// (ADR-0020). Stands on @cas/core's Householder-QR least squares; convention-neutral (ADR-0006).
export { arnoldiBasis, evalArnoldi, evalExpansion, cabs } from "./vandermondeArnoldi.js";
export type { ArnoldiBasis, C } from "./vandermondeArnoldi.js";
export { fitConformalMap, fitSmoothConformalMap } from "./lightning.js";
export type { ConformalMap } from "./lightning.js";
export { fitForwardMap } from "./forwardMap.js";
export type { ForwardMap } from "./forwardMap.js";

// Schwarz–Christoffel (roadmap step E)
export { fitSchwarzChristoffel } from "./scMap.js";
export type { Polygon, SCMap, SCOptions } from "./scMap.js";
export { buildForwardMap, sideIntegrals } from "./schwarzChristoffel.js";
export type { SCForwardMap, SCForwardOptions, SCQuadratureOptions } from "./schwarzChristoffel.js";
export { buildExteriorForwardMap, exteriorSideIntegrals } from "./exteriorSchwarzChristoffel.js";
export type { ExteriorSCForwardMap, ExteriorSCForwardOptions } from "./exteriorSchwarzChristoffel.js";
export { solveParameterProblem, interiorAngles } from "./scParameterProblem.js";
export type { SCSolveResult, SCSolveOptions } from "./scParameterProblem.js";
export { gaussJacobi, gaussLegendre } from "./gaussJacobi.js";
export { integrateSegment } from "./scQuadrature.js";
export type { SegmentIntegrand, QuadratureOptions } from "./scQuadrature.js";
