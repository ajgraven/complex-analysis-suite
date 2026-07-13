// Exact correspondence-curve engine (roadmap #16) — a self-contained ℚ(i) polynomial layer that computes
// the deleted anti-holomorphic correspondence as an exact bivariate curve C(w, z̄) = 0, plus its cusp
// locus. Kept deliberately dependency-free (no @cas/* import) so it can be promoted to a shared package
// verbatim if a third consumer (CD dynatomic/Gleason, #17) ever needs the same exact primitives.
export { bigGcd, Frac, Gauss } from "./gaussian.js";
export { QiPoly } from "./qiPoly.js";
export { correspondenceCurve, cuspLocus } from "./correspondenceCurve.js";
export type { ExactCorrespondenceCurve } from "./correspondenceCurve.js";
