// =============================================================================
// schema.ts -- the interchange data contract (INTERCHANGE.md).
//
// The static TypeScript types ARE the contract (ADR-0002); validate.ts is the runtime
// seatbelt. Everything is expressed in the CANONICAL, unnormalized mathematical convention;
// each app converts to/from its internal convention at its own edge, and every payload tags
// the convention it is in, so a mis-conversion is loud rather than silent (ADR-0006).
//
// Start MINIMAL: the initial version carries only what the first hand-off (a single-valued
// Schwarz reflection, QD -> CD) needs, plus the obvious neighbours (map, quadrature-domain,
// view). Correspondence / parameter-slice payloads are added — with a version bump — when the
// correspondence tool lands.
// =============================================================================

/** The schema discriminator every envelope carries. */
export const SCHEMA_ID = "complex-analysis-suite/interchange" as const;

/** Current schema version (semver). A MAJOR bump is a breaking change consumers must reject. */
export const VERSION = "1.0.0" as const;

/** Cartesian complex number — the shared wire representation across the suite. */
export interface Complex {
  re: number;
  im: number;
}

/** Which mathematical convention a payload's quantities are expressed in (ADR-0006). */
export interface Conventions {
  /** Area measure. "standard" = dA = dx dy. QD-internal "normalized" = dx dy / pi. */
  area: "standard" | "normalized";
  /** Contour-integral normalization. "standard" keeps the literal contour; QD suppresses 1/(2pi i). */
  contour: "standard" | "suppressed-2pii";
}

/** The interchange canonical convention. Producers convert TO this; consumers convert FROM it. */
export const CANONICAL: Conventions = { area: "standard", contour: "standard" };

// --- Maps -------------------------------------------------------------------------------------
// A map is described structurally when its shape is known (rational / Laurent) or as an
// expression otherwise; the consuming tool compiles either through `expr`.

/** phi = P(z)/Q(z), coefficients low-order-first. */
export interface RationalMap {
  form: "rational";
  num: Complex[];
  den: Complex[];
  /** true => acts on conj(z) (an anti-rational map). */
  antiholomorphic?: boolean;
}

/** phi = c*z + sum_{l>=0} F_l / z^l  (Laurent at infinity; the deltoid's phi = z + 1/(2 z^2)). */
export interface LaurentMap {
  form: "laurent";
  c: Complex;
  F: Complex[]; // F[0] = F_0, F[1] = F_1, ...
  antiholomorphic?: boolean;
}

/** Arbitrary map as an expression string in the `expr` language (compiles to GLSL + JS). */
export interface ExprMap {
  form: "expr";
  expr: string; // e.g. "conj(z)^2 + c"
  vars: ("z" | "c" | "a")[];
  antiholomorphic?: boolean;
}

export type MapSpec = RationalMap | LaurentMap | ExprMap;
export type MapForm = MapSpec["form"];

// --- Payloads (initial set) -------------------------------------------------------------------

/** A (log-weighted) quadrature domain, described by its uniformizing map and/or data. */
export interface QuadratureDomain {
  phi: MapSpec; // Riemann map phi : D -> Omega (or D* -> Omega for unbounded)
  bounded: boolean;
  weight?: "unweighted" | "log" | "power";
  hData?: MapSpec; // the quadrature function h, when known
  boundarySamples?: Complex[]; // optional cached boundary samples
  conventions: Conventions; // MUST be present; canonical on the wire
}

/**
 * A single-valued Schwarz reflection sigma = f . eta . f^{-1}. The payload behind the first
 * hand-off (QD -> CD): sigma is single-valued, so it compiles through `expr` as-is.
 */
export interface SchwarzReflection {
  sourceDomain?: QuadratureDomain; // provenance of sigma, when available
  sigma: MapSpec; // the reflection as a compilable map
  escape?: { predicate: "in-omega-complement" | "abs-gt"; R?: number };
  tilingSetHint?: { fundamentalTile?: Complex[] };
  conventions: Conventions;
}

/** Full-precision (double-double) center for deep-zoom reproduction past the float64 limit. */
export interface HiPrecCenter {
  reHi: number;
  reLo: number;
  imHi: number;
  imLo: number;
}

export interface Viewport {
  center: Complex;
  zoom: number; // decades of magnification, or app-defined scale
  centerHiPrec?: HiPrecCenter;
}

/** A saved view: which map/params, where the camera is, how it's colored. */
export interface View {
  map: MapSpec; // the f(z,c) being viewed
  c?: Complex;
  viewport: Viewport;
  coloring?: string; // app-specific coloring id (kept loose on purpose)
}

// --- Envelope ---------------------------------------------------------------------------------

/** Maps each payload kind to its payload type. Grows (with a version bump) as kinds are added. */
export interface PayloadByKind {
  map: MapSpec;
  "quadrature-domain": QuadratureDomain;
  "schwarz-reflection": SchwarzReflection;
  view: View;
}

export type PayloadKind = keyof PayloadByKind;
export type PayloadFor<K extends PayloadKind> = PayloadByKind[K];

export interface Provenance {
  app: "complex-dynamics" | "quadrature-domains" | "correspondences" | (string & {});
  appVersion: string;
  createdAt: string; // ISO-8601
  note?: string; // optional human label
}

/** Top-level wrapper for any hand-off payload. */
export interface Envelope<K extends PayloadKind = PayloadKind> {
  schema: typeof SCHEMA_ID;
  version: string; // semver; major bump = breaking
  kind: K;
  payload: PayloadFor<K>;
  provenance: Provenance;
}
