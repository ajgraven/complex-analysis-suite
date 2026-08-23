// @cas/interchange — the suite's data contract (Phase 4, MIGRATION.md). One half of the
// map-representation keystone (expr is the other). Canonical + convention-tagged (ADR-0006).
//
//   - schema.ts   : the versioned types (Envelope, Conventions/CANONICAL, MapSpec, payloads).
//   - validate.ts : the runtime seatbelt (validateEnvelope + type guards + InterchangeError).
//   - codec.ts    : the deep-link codec (encodeLink / decodeLink).
//   - goldens.ts  : the cross-app golden corpus — wire artifacts BOTH apps pin against, since the
//                   dependency rule forbids a producer->consumer test living in either app.
//
// Initial version carries what the first hand-off needs (a single-valued Schwarz reflection,
// QD -> CD) plus its obvious neighbours. Correspondence / parameter-slice payloads arrive, with
// a version bump, when the correspondence tool lands.
export * from "./schema.js";
export { InterchangeError, isComplex, isConventions, isMapSpec, isEnvelopeOfKind, validateEnvelope } from "./validate.js";
export { encodeLink, decodeLink } from "./codec.js";
export {
  coeffExpr,
  polyExpr,
  rationalExpr,
  laurentExpr,
  mapSpecToExpr,
  envelopeToMapSpec,
} from "./mapSpecToExpr.js";
export { encodeViewState, decodeViewState, VIEWSTATE_VERSION } from "./viewstate.js";
export type { ViewStateEnvelope } from "./viewstate.js";
export {
  GOLDEN_CREATED_AT,
  QD_TO_CD_DELTOID_LINK,
  QD_TO_CD_DELTOID_PHI_AT_2,
  QD_TO_CD_DELTOID_SIGMA_LINK,
  QD_TO_CD_DELTOID_SIGMA_W0,
  QD_TO_CD_DELTOID_SIGMA_AT_W0,
  QD_TO_CD_SINGLE_POLE_SIGMA_LINK,
  QD_TO_CD_SINGLE_POLE_SIGMA_W0,
  QD_TO_CD_SINGLE_POLE_SIGMA_AT_W0,
  QD_TO_CD_BOUNDED_LOBE_SIGMA_LINK,
  QD_TO_CD_BOUNDED_LOBE_SIGMA_W0,
  QD_TO_CD_BOUNDED_LOBE_SIGMA_AT_W0,
  CD_TO_RM_BOTTCHER_LINK,
  CD_TO_RM_BOTTCHER_PSI_AT_2,
} from "./goldens.js";
