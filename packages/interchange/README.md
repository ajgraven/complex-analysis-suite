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
  InterchangeError,
  isComplex,
  isConventions,
  isMapSpec,
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
} from "@cas/interchange";
```

**Envelope.** Everything on the wire is wrapped: `Envelope<K>` = `{ schema, version, kind,
payload, provenance }`, where `schema === SCHEMA_ID` (`"complex-analysis-suite/interchange"`)
and `version === VERSION` (`"1.0.0"`). `PayloadKind` is `"map" | "quadrature-domain" |
"schwarz-reflection" | "view"`.

**Maps** (`MapSpec`) — a map is described structurally when its shape is known, or as an
expression otherwise (the consumer compiles any of them through `@cas/expr`):

- `RationalMap` — `P(z)/Q(z)` by coefficient arrays
- `LaurentMap` — `c·z + Σ F_l/z^l` at ∞ (the deltoid's `φ = ζ + 1/(2ζ²)` lives here)
- `ExprMap` — an `expr`-language string plus its free `vars`

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
a URL-safe `#s=…` hash fragment (base64-encoded JSON) and `decodeLink(hash)` parses **and
validates** it.

## Growing the schema

`CorrespondenceSpec` and `ParameterSlice` are **sketched** in
[docs/INTERCHANGE.md §5](../../docs/INTERCHANGE.md#5-grows-later-correspondence-and-parameter-slice)
but **not yet implemented** — they are the multivalued extension of the keystone, to be
designed against the real correspondence math when a hand-off actually needs them. Bump the
**major** `VERSION` for a breaking change; consumers reject unknown majors loudly and ignore
unknown optional fields gracefully.

## Tests

`test/interchange.test.ts` — round-trips the codec and exercises the validator's accept/reject
paths.
