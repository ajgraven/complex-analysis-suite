// @cas/schwarz — public surface. The Schwarz-reflection σ engine for classical quadrature domains,
// shared by Correspondences and Complex Dynamics (ADR-0007). σ(w) = conj(F(φ⁻¹(w))) is reconstructed
// from a closed-form φ via a numerical inverse — it has no closed-form MapSpec, which is why the QD → CD
// hand-off carries φ + this engine rather than a compiled σ (docs/design/SIGMA-HANDOFF.md). Two families
// are reconstructed: the classical UNBOUNDED-Laurent map (exterior branch, `makeUnboundedLaurentSchwarz`)
// and the classical BOUNDED map (interior branch, `makeBoundedSchwarz`, S5-C2). The remaining weighted
// families (LQD, PQD) follow as the QD app's σ machinery is lifted here.
export { makeUnboundedLaurentSchwarz, pointInPolygon, escapeTime } from "./unbounded-laurent.js";
export type {
  Complex,
  SchwarzBranch,
  UnboundedLaurentSchwarz,
  EscapeKind,
  EscapeResult,
  EscapeOptions,
} from "./unbounded-laurent.js";
// Bounded-QD family (S5-C2): φ: {|z|<1} → Ω onto a bounded domain, the interior-branch Schwarz reflection.
export { makeBoundedSchwarz } from "./bounded.js";
export type { BoundedSchwarz } from "./bounded.js";
// The fundamental-domain tiling tree (F3b): iterate σ⁻¹ from a seed. Family-agnostic — a free function over
// the minimal `sigmaInverse` surface both engines expose.
export { buildPreimageTree } from "./preimage-tree.js";
export type { SchwarzInverse, PreimageTree, PreimageTreeOptions, PreimageEdge } from "./preimage-tree.js";
// The σ limit set (F4a): the chaos game on σ⁻¹ + its box-counting dimension. Also σ⁻¹-based, family-agnostic.
export { sampleLimitSet, boxCountingDimension } from "./limit-set.js";
export type { LimitSetOptions, BoxDimensionResult, BBox } from "./limit-set.js";
// σ level curves (F4b): iso-magnitude |σ| + iso-phase arg σ lines by marching squares. Forward-only, family-
// agnostic (a free function over the minimal `sigma` surface).
export { computeSigmaLevelCurves } from "./level-curves.js";
export type { SchwarzSigma, LevelCurveOptions, LevelSegment, SigmaLevelCurves } from "./level-curves.js";
// Forward σ-dynamics (F4d cycle finder + F4f forward-curve image): free functions over a {sigma, isInOmega}
// surface. Both `≈` (σ is numerical); the cycle finder is a coarse, advisory global search.
export { iterateCurveForward, findCycles } from "./forward.js";
export type { SchwarzForward, CycleOptions, SchwarzCycle } from "./forward.js";
// σ-singularities (F4h): σ-poles (finite map-pole reflection) + branch points (zeros of φ′). Forward-only.
export { findSigmaSingularities } from "./singularities.js";
export type {
  SchwarzMap,
  SigmaPole,
  SigmaBranchPoint,
  SigmaSingularities,
  SingularityOptions,
} from "./singularities.js";
