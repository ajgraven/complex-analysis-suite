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

/**
 * Current schema version (semver). A MAJOR bump is a breaking change consumers must reject; a MINOR
 * bump adds backward-compatible vocabulary. 1.1.0 (S3a) added the `schwarz` MapSpec form — the wire
 * gained a variant, so the version reflects it, and every `version: VERSION`-stamped export moves to
 * 1.1.0 (a plain-φ export is byte-identical bar the version label; consumers gate on MAJOR = 1, so it
 * decodes unchanged). Bump this whenever the type vocabulary below grows, never silently.
 */
export const VERSION = "1.1.0" as const;

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
  expr: string; // e.g. "conjugate(z)^2 + c" (the `expr` language spells it `conjugate`, not `conj`)
  vars: ("z" | "c" | "a")[];
  antiholomorphic?: boolean;
}

/**
 * A Schwarz reflection given by its RECIPE, not a closed form. σ(w) = conj(F(φ⁻¹(w))), where φ is the
 * closed-form uniformizing map (`phi`), F its Schwarz extension, and φ⁻¹ a NUMERICAL branch of the
 * inverse. Because that inverse is iterative, σ is NOT expr-compilable — a consumer rebuilds the σ
 * evaluator from `phi` via @cas/schwarz's `makeUnboundedLaurentSchwarz`, not through the `expr`
 * pipeline. (S3a first case: the deltoid, `phi` = its Laurent map, `disk` = "D*".) Full multi-branch
 * `PhiData` for the non-Laurent families is a later, separately-versioned addition.
 */
export interface SchwarzMap {
  form: "schwarz";
  /** The closed-form uniformizing map φ this reflects; its coefficients are what the σ engine reads. */
  phi: LaurentMap | RationalMap;
  /** Which disk φ uniformizes: "D" = the unit disk (bounded Ω), "D*" = its exterior (unbounded Ω). */
  disk: "D" | "D*";
  /** How φ⁻¹ is taken. "newton-dk" = cold-seeded Newton with an exact Durand–Kerner fallback (@cas/schwarz). */
  inverse: "newton-dk";
  /** A Schwarz reflection is anti-holomorphic (σ = conj(…)); definitionally true, carried explicitly. */
  antiholomorphic: true;
}

export type MapSpec = RationalMap | LaurentMap | ExprMap | SchwarzMap;
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
