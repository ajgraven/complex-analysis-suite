// @cas/schwarz — public surface. The Schwarz-reflection σ engine for classical unbounded-Laurent
// quadrature domains, shared by Correspondences and Complex Dynamics (ADR-0007). σ(w) = conj(F(φ⁻¹(w)))
// is reconstructed from a closed-form φ via a numerical exterior-branch inverse — it has no closed-form
// MapSpec, which is why the QD → CD hand-off carries φ + this engine rather than a compiled σ
// (docs/design/SIGMA-HANDOFF.md). More families (bounded, LQD, PQD) follow as the QD app's σ machinery
// is lifted here (S2b+).
export { makeUnboundedLaurentSchwarz, pointInPolygon, escapeTime } from "./unbounded-laurent.js";
export type {
  Complex,
  UnboundedLaurentSchwarz,
  EscapeKind,
  EscapeResult,
  EscapeOptions,
} from "./unbounded-laurent.js";
