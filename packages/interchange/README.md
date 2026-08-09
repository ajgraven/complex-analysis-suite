# @cas/interchange

The suite's **data contract**: the versioned, typed schema tools use to hand objects off to
one another, a runtime validator, and a deep-link codec. It is one half of the
[map-representation keystone](../../docs/ARCHITECTURE.md#5-the-keystone-map-representation)
(the executable half is [`@cas/expr`](../expr)) — an `interchange` `MapSpec` is what one tool
serializes and another compiles through `expr` and renders.

Extracted in [Phase 4](../../docs/MIGRATION.md#phase-4--interchange-and-the-first-hand-off)
to carry the first hand-off: export a single-valued Schwarz reflection σ from the Quadrature
app, open it in Complex Dynamics. Full design rationale in
[docs/INTERCHANGE.md](../../docs/INTERCHANGE.md).

## Install

```jsonc
"dependencies": { "@cas/interchange": "workspace:*" }
```

Built to `dist/`; depends on nothing (validation is pure TypeScript).

## API

```ts
import {
  SCHEMA_ID,
  VERSION,
  CANONICAL,
  validateEnvelope,
  encodeLink,
  decodeLink,
  encodeViewState,
  decodeViewState,
  VIEWSTATE_VERSION,
  InterchangeError,
  isComplex,
  isConventions,
  isMapSpec,
  isEnvelopeOfKind,
} from "@cas/interchange";
import type {
  Envelope,
  PayloadKind,
  Provenance,
  MapSpec,
  RationalMap,
  LaurentMap,
  ExprMap,
  SchwarzReflection,
  QuadratureDomain,
  View,
  Viewport,
  Conventions,
  ViewStateEnvelope,
} from "@cas/interchange";
```

**Envelope.** Everything on the wire is wrapped: `Envelope<K>` = `{ schema, version, kind,
payload, provenance }`, where `schema === SCHEMA_ID` (`"complex-analysis-suite/interchange"`)
and `version === VERSION` (currently `"1.3.0"`; consumers gate on MAJOR = 1, so every 1.x link
decodes). `PayloadKind` is `"map" | "quadrature-domain" | "schwarz-reflection" | "view"`.

**Maps** (`MapSpec`) — a map is described structurally when its shape is known, or as an
expression otherwise (the consumer compiles any of them through `@cas/expr`):

- `RationalMap` — `P(z)/Q(z)` by coefficient arrays
- `LaurentMap` — `c·z + Σ F_l/z^l` at ∞ (the deltoid's `φ = ζ + 1/(2ζ²)` lives here); may carry
  optional finite-pole `branches` (pole-bearing unbounded QDs, since 1.2.0)
- `ExprMap` — an `expr`-language string plus its free `vars`
- `SchwarzMap` — `form:"schwarz"` (since 1.1.0): a σ reflection by its recipe (a closed-form `phi` +
  `disk` + `inverse`); `phi` may be a `laurent`/`rational` map or, since 1.3.0, the σ-only
  `bounded` form (a bounded QD, φ: 𝔻 → Ω). Not `@cas/expr`-compilable — a consumer rebuilds σ via
  `@cas/schwarz`.

Each carries an optional `antiholomorphic` flag.

**Payloads** — `SchwarzReflection` (the σ hand-off), `QuadratureDomain`, and `View`
(`{ map, c?, viewport }`, with a double-double `centerHiPrec` on `Viewport` so deep-zoom
centers reproduce exactly past the float64 limit).

**Conventions.** Every payload is expressed in the **canonical** convention (`CANONICAL =
{ area: "standard", contour: "standard" }`) and tags it, so a mis-conversion at a boundary
is loud rather than a silent factor-of-π/2πi error
([ADR-0006](../../docs/DECISIONS.md#adr-0006-convention-neutral-core-packages)). Producers
convert **to** canonical; consumers convert **from** it, each at its own edge.

**Validation & codec.** `validateEnvelope(value)` strictly checks an untrusted object and
throws `InterchangeError` with a clear message (payloads can arrive from an old link or
hand-edited JSON); the `is*` type guards are the building blocks. `encodeLink(env)` produces
a URL-safe `#s=…` hash fragment (**base64url**-encoded JSON) and `decodeLink(hash)` parses **and
validates** it.

**View-state codec.** A second, lighter codec for shareable UI view-state (each app owns its own
`state` schema): `encodeViewState(app, state)` → a `#vs=…` fragment (a **distinct** hash key from
the map codec's `#s=`, so the two never collide), `decodeViewState(hash)` → a validated
`ViewStateEnvelope` `{ v, app, state }` or `null`, versioned by `VIEWSTATE_VERSION`. Both apps
adopted it (it retired Complex-Dynamics' old `#s=` map/view-state disambiguation hack).

## Growing the schema

`CorrespondenceSpec` and `ParameterSlice` are **sketched** in
[docs/INTERCHANGE.md §5](../../docs/INTERCHANGE.md#5-grows-later-correspondence-and-parameter-slice)
but **not yet implemented** — they are the multivalued extension of the keystone, to be
designed against the real correspondence math when a hand-off actually needs them. Bump the
**major** `VERSION` for a breaking change; consumers reject unknown majors loudly and ignore
unknown optional fields gracefully.

## Tests

`test/interchange.test.ts` — round-trips the codec and exercises the validator's accept/reject
paths. `test/viewstate.test.ts` — covers the view-state codec documented above.
