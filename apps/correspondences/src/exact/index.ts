// The app's exact correspondence-curve layer. The generic exact-poly primitives (ℚ(i), univariate
// polynomials, rendering) were extracted to the shared @cas/exact package (roadmap #17, ADR-0007); this
// folder keeps the correspondence-SPECIFIC domain logic (the deleted-correspondence deflation + cusp
// locus) built on top of it. Re-export the shared primitives here too so app code and tests have one
// import point.
export { bigGcd, Frac, Gauss, QiPoly, renderQiPolyText } from "@cas/exact";
export { correspondenceCurve, cuspLocus } from "./correspondenceCurve.js";
export type { ExactCorrespondenceCurve } from "./correspondenceCurve.js";
