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
 * bump adds backward-compatible vocabulary. 1.1.0 (S3a) added the `schwarz` MapSpec form; 1.2.0 added
 * optional finite-pole `branches` on `LaurentMap` (pole-bearing unbounded QDs); 1.3.0 (S5-C2) added the
 * `bounded` φ form for a `schwarz` map (bounded QDs — φ: 𝔻 → Ω, `disk: "D"`); 1.4.0 (M2.4c, ADR-0035)
 * added the `conformal` MapSpec form — a Schwarz–Christoffel / lightning conformal map of a polygon,
 * reconstructed via @cas/conformal exactly as `schwarz` is via @cas/schwarz. Each MINOR bump moves
 * every `version: VERSION`-stamped export to the new label — a payload that uses none of the new
 * vocabulary is byte-identical bar that label, and consumers gate on MAJOR = 1 so it decodes unchanged.
 * Bump this whenever the type vocabulary below grows, never silently.
 */
export const VERSION = "1.4.0" as const;

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

/**
 * A finite-pole branch of a pole-bearing unbounded-Laurent φ (a single exterior pole, a cardioid, …).
 * φ gains Σ_k conj(A[k-1])·u_j(z)^k with u_j(z) = z/(1 − conj(z_j)·z), z_j = `z` ∈ 𝔻; its Schwarz
 * extension gains the reflected principal part Σ_k A[k-1]/(w − z_j)^k. A[k-1] = A_{j,k} (k = 1..m_j).
 */
export interface BranchSpec {
  z: Complex; // reflected pole location z_j ∈ 𝔻
  A: Complex[]; // principal-part coefficients, low order first: A[k-1] = A_{j,k}
}

/** phi = c*z + sum_{l>=0} F_l / z^l ( + finite-pole branches )  (Laurent at infinity; the deltoid's phi = z + 1/(2 z^2)). */
export interface LaurentMap {
  form: "laurent";
  c: Complex;
  F: Complex[]; // F[0] = F_0, F[1] = F_1, ...
  /** Finite-pole branch terms of a pole-bearing unbounded QD. Omitted/empty ⇒ the pole-free classical
   *  Laurent map (the deltoid). Added in schema 1.2.0; older consumers gate on MAJOR=1 and ignore it. */
  branches?: BranchSpec[];
  antiholomorphic?: boolean;
}

/**
 * phi = w₀ + Σ_j Σ_k conj(A_{j,k})·u_j(z)^k  (a BOUNDED QD — φ: 𝔻 → Ω onto a bounded domain; S5-C2). No
 * leading c·z term and no Laurent tail: a bounded φ is w₀ plus finite-pole branch terms only. Its Schwarz
 * extension is F(z) = conj(w₀) + Σ_j Σ_k A_{j,k}/(z − z_j)^k (meromorphic on 𝔻), and φ⁻¹ is the INTERIOR
 * branch. Only valid as a `schwarz` map's `phi` (with `disk: "D"`) — @cas/schwarz's `makeBoundedSchwarz`
 * reads these coefficients. Added in schema 1.3.0.
 */
export interface BoundedMap {
  form: "bounded";
  w0: Complex; // domain centre, φ(0) = w₀
  /** Finite-pole branch terms (bounded QDs are branch-only). Omitted/empty ⇒ a disk of radius |conj(A)|. */
  branches?: BranchSpec[];
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
 * pipeline. (S3a first case: the deltoid, `phi` = its Laurent map, `disk` = "D*".) As of 1.2.0 a Laurent
 * `phi` may carry finite-pole `branches` (pole-bearing unbounded QDs); 1.3.0 adds the `bounded` φ form
 * (bounded QDs, `disk: "D"`). The remaining non-Laurent families (LQD, PQD) are a later addition.
 */
export interface SchwarzMap {
  form: "schwarz";
  /** The closed-form uniformizing map φ this reflects; its coefficients are what the σ engine reads. */
  phi: LaurentMap | RationalMap | BoundedMap;
  /** Which disk φ uniformizes: "D" = the unit disk (bounded Ω), "D*" = its exterior (unbounded Ω). */
  disk: "D" | "D*";
  /** How φ⁻¹ is taken. "newton-dk" = cold-seeded Newton with an exact Durand–Kerner fallback (@cas/schwarz). */
  inverse: "newton-dk";
  /** A Schwarz reflection is anti-holomorphic (σ = conj(…)); definitionally true, carried explicitly. */
  antiholomorphic: true;
}

/**
 * A conformal map of a polygon, given by its Schwarz–Christoffel data — enough for a consumer to rebuild
 * the map via @cas/conformal (exactly as `form:"schwarz"` is rebuilt via @cas/schwarz), without having to
 * re-derive the shape. `engine` names the @cas/conformal builder: "sc-interior" (f: 𝔻 → the bounded
 * polygon), "sc-exterior" (Ψ: 𝔻* → the exterior of the polygon — the flow-past-a-polygon map), or
 * "lightning" (a smooth-boundary least-squares fit, which carries no prevertices/angles). The `polygon`
 * corners are the canonical geometry a consumer can always re-fit from; the recorded `prevertices` wₖ,
 * interior angles `angles` (αₖ / π), accessory `constant` C, and `capacity` let it rebuild the exact
 * fitted map. Fit quality is carried honestly (guardrail): `converged`, and — when the fit reports them —
 * `degraded` / `residual`. Added in schema 1.4.0 (ADR-0035); like `schwarz`, NOT expr-compilable.
 */
export interface ConformalMap {
  form: "conformal";
  engine: "sc-interior" | "sc-exterior" | "lightning";
  /** The polygon corners (Ω-plane vertices), counter-clockwise. */
  polygon: Complex[];
  /** Interior angles αₖ / π, corner order. Omitted for a lightning (smooth-boundary) fit. */
  angles?: number[];
  /** Prevertices wₖ (on ∂𝔻 for sc-interior, on the 1/z reciprocal disk for sc-exterior), corner order. */
  prevertices?: Complex[];
  /** Accessory constant C: f′(0) for sc-interior, the ∞-leading coefficient for sc-exterior. */
  constant?: Complex;
  /** Logarithmic capacity |C| (meaningful for the exterior map). */
  capacity?: number;
  /** The fit reached its tolerance. */
  converged: boolean;
  /** The crowding wall was hit — accuracy honestly reduced (when the fit reports it). */
  degraded?: boolean;
  /** The fit's honest ≈ error tag (when reported). */
  residual?: number;
}

export type MapSpec = RationalMap | LaurentMap | ExprMap | SchwarzMap | ConformalMap;
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
