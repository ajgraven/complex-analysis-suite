// @cas/interchange — the suite's data contract (Phase 4, MIGRATION.md). One half of the
// map-representation keystone (expr is the other). Canonical + convention-tagged (ADR-0006).
//
//   - schema.ts   : the versioned types (Envelope, Conventions/CANONICAL, MapSpec, payloads).
//   - validate.ts : the runtime seatbelt (validateEnvelope + type guards + InterchangeError).
//   - codec.ts    : the deep-link codec (encodeLink / decodeLink).
//
// Initial version carries what the first hand-off needs (a single-valued Schwarz reflection,
// QD -> CD) plus its obvious neighbours. Correspondence / parameter-slice payloads arrive, with
// a version bump, when the correspondence tool lands.
export * from "./schema.js";
export { InterchangeError, isComplex, isConventions, isMapSpec, isEnvelopeOfKind, validateEnvelope } from "./validate.js";
export { encodeLink, decodeLink } from "./codec.js";
export { encodeViewState, decodeViewState, VIEWSTATE_VERSION } from "./viewstate.js";
export type { ViewStateEnvelope } from "./viewstate.js";
