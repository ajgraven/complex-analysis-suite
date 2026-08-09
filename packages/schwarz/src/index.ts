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
