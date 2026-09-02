// @cas/flow — public surface. The conformal-transplant flow kernel shared by the 2D Electrostatics,
// Hele-Shaw Flow, and Potential Theory apps (ADR-0036), extracted whole from the pre-split
// apps/2d-electrostatics so the three carved-out apps consume ONE copy of it (ADR-0007: the split
// created the second consumer).
//   - transplant : the closed-form REFERENCE flows — past the unit disk (uniform + circulation, exact
//                  W_ref inversion) and inside it (boundary source–sink ports, Möbius level curves) —
//                  plus the flow-net level curves and the forward pushforward onto a target plane.
//   - polygonMap : the @cas/conformal glue — fit the EXTERIOR (Ψ: 𝔻* → ext K) and INTERIOR (f: 𝔻 → K)
//                  Schwarz–Christoffel maps of a bounded polygon and expose cheap forward evaluators,
//                  with the honest converged/degraded/residual tier (fitHonestyTier).
//   - transplantPresets : the counter-clockwise bounded-polygon presets K the transplant pages offer.
//   - net2d      : a small 2D-canvas line-art drawer for the transplant panes (world→pixel, y up).
// Strict TypeScript on @cas/conformal; convention-neutral (ADR-0006).
export {
  refPotential,
  refVelocity,
  invertToExterior,
  flowNet,
  pushforward,
  unitCircle,
  inletPorts,
  sourceSinkNet,
} from "./transplant.js";
export type { Complex, Pt, RefFlow, NetCurve, FlowNetOptions } from "./transplant.js";

export { fitPolygonFlow, fitPolygonInterior, fitHonestyTier } from "./polygonMap.js";
export type { PolygonFlowMap, PolygonInteriorMap } from "./polygonMap.js";

export { POLYGON_PRESETS, DEFAULT_PRESET } from "./transplantPresets.js";
export type { PolygonPreset } from "./transplantPresets.js";

export { EXTERIOR_MAP_PRESETS } from "./exteriorPresets.js";
export type { ExteriorMapPreset } from "./exteriorPresets.js";

export { boundsOf, Net2D } from "./net2d.js";
export type { Box } from "./net2d.js";
