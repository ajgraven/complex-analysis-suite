# Interchange Format

`@cas/interchange` is the **data contract** that lets tools hand objects off
to one another. It is one half of the [map-representation keystone](ARCHITECTURE.md#5-the-keystone-map-representation)
(the other half is `expr`, the executable form). This document specifies the schema.

> **✅ As implemented.** The schema shipped as **`@cas/interchange` v1.0.0** and matches this
> spec — the `Envelope`, `Conventions` / `CANONICAL`, the `MapSpec` union (`rational` /
> `laurent` / `expr`), the `schwarz-reflection` / `quadrature-domain` / `view` payloads,
> `validateEnvelope` + `InterchangeError`, and the `encodeLink` / `decodeLink` codec. Two
> deviations from the sketch below: the **`correspondence` and `parameter-slice` kinds (§5)
> remain unimplemented** (no hand-off has needed them yet — `PayloadKind` is `"map" |
> "quadrature-domain" | "schwarz-reflection" | "view"`), and the deep-link codec encodes
> **uncompressed** URL-safe base64 JSON (see §6). Exact exports:
> [`@cas/interchange` README](../packages/interchange/README.md).

**Design stance.** Start **minimal** — only what the first hand-off (a single-valued
Schwarz reflection, QD → CD) needs — then **grow the schema with explicit versioning**.
Do *not* try to specify every future object up front; that is how interchange formats
ossify wrong. Every type below is illustrative TypeScript for the *initial* version;
treat it as a starting point to refine against the real code.

## 1. Principles

1. **Static types are the contract; runtime validation is the seatbelt.** The
   TypeScript interfaces give compile-time safety on both ends
   ([ADR-0002](DECISIONS.md#adr-0002-typescript-as-the-common-language)); a lightweight
   runtime validator (hand-written or Zod) checks payloads at the boundary, because a
   payload can arrive from an old deep link or a hand-edited JSON.
2. **One canonical convention, explicitly tagged.** The interchange format is defined in
   **standard, unnormalized** mathematical conventions. Each app converts to/from its
   internal conventions *at its own edge*, and every payload **tags** the convention it
   is in, so a mis-conversion is loud rather than silent
   ([ADR-0006](DECISIONS.md#adr-0006-convention-neutral-core-packages),
   [RISKS §2](RISKS.md#risk-convention-collision-silent-numerical-error)).
3. **Versioned and forward-compatible.** Every payload carries a `version`. Consumers
   reject unknown *major* versions loudly and ignore unknown *optional* fields
   gracefully.
4. **Self-describing provenance.** Every payload records which app/version produced it
   and when — for reproducibility and debugging.

## 2. The envelope

Everything handed off is wrapped in a versioned envelope:

```ts
/** Top-level wrapper for any hand-off payload. */
export interface Envelope<K extends PayloadKind = PayloadKind> {
  schema: "complex-analysis-suite/interchange";
  version: string;                 // semver, e.g. "1.0.0"; major bump = breaking
  kind: K;                         // discriminant for `payload`
  payload: PayloadFor<K>;
  provenance: Provenance;
}

export interface Provenance {
  app: "complex-dynamics" | "quadrature-domains" | "correspondences" | string;
  appVersion: string;
  createdAt: string;               // ISO-8601
  note?: string;                   // optional human label
}

export type PayloadKind =
  | "map"
  | "quadrature-domain"
  | "schwarz-reflection"
  | "correspondence"               // added when the correspondence tool lands
  | "parameter-slice"
  | "view";
```

## 3. Numbers, maps, and conventions

```ts
/** Cartesian complex number — the shared representation across the suite. */
export interface Complex { re: number; im: number; }

/** Which mathematical convention a payload's quantities are expressed in. */
export interface Conventions {
  /** Area measure. "standard" = dA = dx dy. QD-internal "normalized" = dx dy / π. */
  area: "standard" | "normalized";
  /** Contour-integral normalization. "standard" keeps the literal ∮; QD suppresses 1/(2πi). */
  contour: "standard" | "suppressed-2pii";
}
/** The interchange canonical convention. Producers convert TO this; consumers convert FROM it. */
export const CANONICAL: Conventions = { area: "standard", contour: "standard" };
```

A **map** can be described structurally (preferred when the shape is known — e.g. a
rational or Laurent map) or as an **expression** (for arbitrary maps), because the
consuming tool compiles either through `expr`:

```ts
export type MapSpec = RationalMap | LaurentMap | ExprMap;

/** φ = P(z)/Q(z), coefficients low-order-first. */
export interface RationalMap {
  form: "rational";
  num: Complex[];
  den: Complex[];
  antiholomorphic?: boolean;       // true ⇒ acts on conj(z) (e.g. anti-rational)
}

/** φ = c·z + Σ_{l≥0} F_l / z^l  (Laurent at ∞; the deltoid's φ = ζ + 1/(2ζ²) lives here). */
export interface LaurentMap {
  form: "laurent";
  c: Complex;
  F: Complex[];                    // F[0] = F_0, F[1] = F_1, …
  antiholomorphic?: boolean;
}

/** Arbitrary map as an expression string in the `expr` language (compiles to GLSL + JS). */
export interface ExprMap {
  form: "expr";
  expr: string;                    // e.g. "conj(z)^2 + c"
  vars: ("z" | "c" | "a")[];       // free variables the expression uses
  antiholomorphic?: boolean;
}
```

## 4. Domain and dynamics payloads (initial set)

```ts
/** A (log-weighted) quadrature domain, described by its uniformizing map and/or data. */
export interface QuadratureDomain {
  phi: MapSpec;                    // Riemann map φ : 𝔻 → Ω (or 𝔻* → Ω for unbounded)
  bounded: boolean;
  weight?: "unweighted" | "log" | "power";
  hData?: MapSpec;                 // the quadrature function h, when known
  boundarySamples?: Complex[];     // optional cached ∂Ω samples
  conventions: Conventions;        // MUST be present; canonical on the wire
}

/**
 * A single-valued Schwarz reflection σ = f ∘ η ∘ f⁻¹.
 * This is the payload behind the first hand-off (QD → CD). σ is single-valued, so it
 * compiles through `expr` as-is — no multivalued support required.
 */
export interface SchwarzReflection {
  sourceDomain?: QuadratureDomain; // provenance of σ, when available
  sigma: MapSpec;                  // the reflection as a compilable map
  escape?: { predicate: "in-omega-complement" | "abs-gt"; R?: number };
  tilingSetHint?: { fundamentalTile?: Complex[] };
  conventions: Conventions;
}

/** A saved view: which family/params, where the camera is, how it's colored. */
export interface View {
  map: MapSpec;                    // the f(z,c) being viewed
  c?: Complex;
  viewport: Viewport;
  coloring?: string;               // app-specific coloring id (kept loose on purpose)
}

export interface Viewport {
  center: Complex;
  zoom: number;                    // decades of magnification, or app-defined scale
  /** Full-precision center for deep-zoom reproduction (double-double), when applicable. */
  centerHiPrec?: { reHi: number; reLo: number; imHi: number; imLo: number };
}
```

## 5. Grows later: correspondence and parameter-slice

These are **sketched, not finalized** — they are added when the correspondence tool
lands (and are the multivalued extension of the keystone):

```ts
/** Anti-holomorphic correspondence: the deleted correspondence of a degree-(d+1) φ. */
export interface CorrespondenceSpec {
  f: MapSpec;                      // degree d+1, univalent on 𝔻
  eta: "unit-circle";             // reflection η(z) = 1/conj(z)
  deleted: true;                   // divide out the trivial branch
  degree: number;                  // d (the correspondence is d:d)
  conventions: Conventions;
}

/** A parameter-space sweep description (family + which parameter + window + coloring). */
export interface ParameterSlice {
  family: string;                  // registered family id
  paramRef: string;                // which parameter is swept (a ParamRef in the QD engine)
  viewport: Viewport;
  classification?: Record<string, string>; // outcome → color, app-defined
}
```

The multivalued/branch-aware representation that `CorrespondenceSpec` implies is
designed **against the real correspondence math when Phase 6 begins**, not speculatively
now — see [MIGRATION Phase 5–6](MIGRATION.md#phase-5--extract-gpu-and-promote-expr) and
[ADR-0005](DECISIONS.md#adr-0005-expr--interchange-as-the-map-representation-keystone).

## 6. Deep-link codec

Both apps already serialize view state into share-link hashes. The suite unifies this so
a link produced by one tool can be *opened* by another (when the payload kind is one the
opener understands).

```ts
/** Encode an envelope into a URL-safe hash fragment. */
export function encodeLink(env: Envelope): string;   // → "#s=<url-safe-compressed-json>"
/** Decode a hash fragment back into an envelope (validates schema/version). */
export function decodeLink(hash: string): Envelope;  // throws on bad/incompatible payloads
```

Implementation notes:

- The payload is JSON, URL-safe-base64-encoded into a `#s=…` fragment. *(As implemented in
  v1.0.0 the JSON is **not** compressed — links stay short enough without it; gzip/deflate
  remains an option if boundary-sample arrays ever make links unwieldy.)*
- **Preserve backward compatibility** of each app's *existing* share-link format, or
  ship a migration: you (and possibly a paper or notebook) may already have saved links
  in the old format. ⚠ Verify the current formats in each repo before unifying.
- Deep-zoom centers travel at **full double-double precision** (CD already does this) so
  views past the float64 zoom limit reproduce exactly.

## 7. The first hand-off, end to end

The concrete flow the schema exists to enable (also in
[MIGRATION Phase 4](MIGRATION.md#phase-4--interchange-and-the-first-hand-off)):

```
Quadrature Domains app                          Complex Dynamics app
──────────────────────                          ────────────────────
1. User builds σ in the Schwarz tab
   (QD.Schwarz.buildSchwarzFromPhi)
2. "Export map":
   • convert QD-normalized → CANONICAL          4. "Import map" (paste JSON or open link):
   • wrap in Envelope<"schwarz-reflection">         • decodeLink / validate envelope
   • produce JSON + encodeLink(...)                 • convert CANONICAL → CD-internal
3. Copy JSON / copy deep link  ───────────────►     • compile payload.sigma via `expr`
                                                     • render σ's dynamical plane
                                                       (escape time, sphere, Böttcher, rays)
```

Because `σ` is single-valued, step 4's `expr` compile needs **no** multivalued support —
which is exactly why this is the *first* interop milestone and why it can land before the
hard extraction work. It exercises the keystone on the easy case, so the correspondence
tool later inherits a proven path.

## 8. Validation & versioning rules

- On decode: reject a mismatched `schema`; reject an unknown **major** `version` with a
  clear error; accept unknown **optional** fields silently (forward-compat).
- On encode: always stamp `provenance` and the current `version`, and always emit the
  **canonical** convention (never an app-internal one) on the wire.
- Add a runtime validator so a hand-edited or stale payload fails loudly at the boundary
  rather than producing a subtly wrong picture downstream.
