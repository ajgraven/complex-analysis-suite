# Architecture Decision Records

Each record captures one decision: its context, the options considered, the trade-off,
and the consequences. ADRs are **append-only** — when a decision changes, add a new ADR
that _supersedes_ the old one; do not silently rewrite an accepted record. This is how
the "why" survives for future-you.

Format follows Michael Nygard's ADR convention.

| #                                                                                   | Decision                                                              | Status   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| [0001](#adr-0001-monorepo-over-multi-repo)                                          | Monorepo over multi-repo                                              | Accepted |
| [0002](#adr-0002-typescript-as-the-common-language)                                 | TypeScript as the common language                                     | Accepted |
| [0003](#adr-0003-give-quadrature-domains-a-build-step-vite)                         | Give Quadrature Domains a build step (Vite)                           | Accepted |
| [0004](#adr-0004-package-manager-pnpm-workspaces)                                   | Package manager: pnpm workspaces                                      | Accepted |
| [0005](#adr-0005-expr--interchange-as-the-map-representation-keystone)              | `expr` + `interchange` as the map-representation keystone             | Accepted |
| [0006](#adr-0006-convention-neutral-core-packages)                                  | Convention-neutral core packages                                      | Accepted |
| [0007](#adr-0007-incremental-extraction-driven-by-real-need)                        | Incremental extraction driven by real need                            | Accepted |
| [0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate)                       | Extract `@cas/exact`; keep QD's `sym-core` separate                   | Accepted |
| [0009](#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics) | Schwarz reflection (σ) is a first-class peer view in Complex Dynamics | Accepted |
| [0010](#adr-0010-complex-function-plotting-tool-as-a-separate-app)                  | Complex Function Plotting Tool as a separate app                      | Accepted |

> **Status legend:** Proposed → Accepted (once you sign off) → Superseded/Deprecated.
> All ten are **Accepted**. ADRs 0001–0007 are the up-front decisions (recorded in
> [`CLAUDE.md`](../CLAUDE.md) and [RISKS §Decisions](RISKS.md#open-questions-decisions-needed-from-you));
> **0008 is the first _follow-on_** — a decision made during the build, which
> [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) explicitly asked to be recorded
> this way. Expect more of that shape than of the original seven. **0009 is another follow-on**, of a
> different kind — a UI/product decision (σ becomes a first-class peer _view_ in Complex Dynamics), not an
> extraction. **0010 is a third follow-on** — the suite's fourth app (the Complex Function Plotting Tool),
> a product/topology decision made when the tool was requested.
> Supersede rather than rewrite if any change later.
>
> **✅ Executed.** The seven up-front decisions were carried out — the
> [migration runbook](MIGRATION.md) ran to completion — with two conscious deviations recorded
> inline in the Action Items below:
> (1) **ADR-0005's _multivalued_ `expr` / `interchange` extension was not built** — the
> Correspondences app enumerates correspondence branches with its own engine, so no second
> consumer ever forced a shared branch-aware representation (which is precisely the
> [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) rule at work); the keystone
> shipped through the single-valued case. (2) **ADR-0006's convention-neutrality is enforced by
> construction** (the kernel simply carries no normalization constants) rather than by a
> dedicated CI guard test.

---

## ADR-0001: Monorepo over multi-repo

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

### Context

Two mature apps (Complex Dynamics, Quadrature Domains) share substantial _conceptual_
surface that is currently duplicated across two repos: complex arithmetic, Durand–Kerner
root-finding (in several places), formal-series recurrences, WebGL escape-time kernels,
Riemann-sphere renderers. A third app (correspondences) is imminent and needs pieces
from _both_ existing apps. The goal is a suite where each new tool reuses shared code
and tools can hand data off to one another.

### Decision

Host all apps and shared packages in a **single monorepo** (`packages/*` + `apps/*`)
with workspace-linked internal dependencies.

### Options Considered

#### Option A: Monorepo (workspaces)

| Dimension    | Assessment                                       |
| ------------ | ------------------------------------------------ |
| Complexity   | Medium (one build/test config to learn)          |
| Cost         | Migration of QD into the workspace               |
| Scalability  | High — new tools drop in as apps                 |
| Solo-dev fit | High — one committer, no cross-repo coordination |

**Pros:** single source of truth for shared code; atomic cross-cutting changes (fix a
primitive and all consumers update in one commit); trivial internal deps
(`workspace:*`, no publishing); one place to run tests/lint/build. **Cons:** one large
repo; shared tooling must accommodate two currently-different build setups.

#### Option B: Multi-repo + published shared library

| Dimension    | Assessment                                                 |
| ------------ | ---------------------------------------------------------- |
| Complexity   | High (versioning + release across repos)                   |
| Cost         | Per-package build + publish + version-pin in each consumer |
| Scalability  | Low for a solo dev — coordination tax per change           |
| Solo-dev fit | Low — version churn dominates                              |

**Pros:** apps stay fully independent; shared lib could be independently useful.
**Cons:** every shared-code change becomes publish-a-version-then-bump-consumers; a
cross-cutting change spans multiple PRs across repos; heavy tax for one developer.

#### Option C: Status quo (two repos, copy-paste)

**Pros:** zero coordination. **Cons:** the duplication _drifts_ — the failure mode we
already have (two complex libs, multiple root-finders). Rejected.

### Trade-off Analysis

For a **solo** project, coordination overhead — the main cost of a monorepo relative to
multi-repo — is nearly zero, while the versioning overhead of multi-repo is pure tax.
The atomic-cross-cutting-change property is exactly what a "shared foundation" needs.
Monorepo wins decisively in this context.

### Consequences

- **Easier:** shared code, cross-cutting refactors, one CI, adding new tools.
- **Harder:** initial reconciliation of two build setups (addressed by
  [ADR-0003](#adr-0003-give-quadrature-domains-a-build-step-vite)); the repo is bigger.
- **Revisit if:** a package becomes broadly useful to outside projects (then publish it
  from the monorepo — additive, not a reversal).

### Action Items

1. [x] Stand up the workspace skeleton ([MIGRATION Phase 0](MIGRATION.md#phase-0--genesis-the-workspace-skeleton)).
2. [x] Bring both apps in with **history preserved** (`git subtree`).

---

## ADR-0002: TypeScript as the common language

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

### Context

The suite's value depends on tools agreeing on hand-off formats and on shared packages
guaranteeing their consumers agree with them. The Dynamics app is already TypeScript;
the Quadrature app is JavaScript. The characteristic failure mode of a multi-tool suite
is **untyped boundaries**: a field renamed in one tool silently breaks another months
later.

### Decision

Adopt **TypeScript as the common language** of the suite. Shared packages are authored
in strict TypeScript. App internals migrate to TypeScript **incrementally**
(leaves-first), and may remain gradually-typed JS indefinitely where the cost/benefit
doesn't justify full typing.

### Options Considered

#### Option A: TypeScript everywhere (strict in packages, gradual in app glue)

**Pros:** hand-off contracts are compiler-enforced on both ends; refactors across the
package boundary are safe; the Dynamics app is already here. **Cons:** the Quadrature
app needs migration (mitigated by doing it incrementally, and by not requiring 100%
coverage).

#### Option B: Stay JavaScript, use JSDoc + `checkJs` for types

**Pros:** no `.ts` conversion. **Cons:** JSDoc types are second-class for complex
generic interfaces (the `interchange` schema); the Dynamics app would have to _drop_ to
JS or straddle two type systems. Weaker guarantees at exactly the boundaries that
matter most. Rejected as the primary path.

#### Option C: JavaScript with runtime schema validation only (e.g. Zod) and no static types

**Pros:** runtime safety at hand-off. **Cons:** no compile-time safety inside/across
packages; you learn about breakage at runtime, not at build. (Note: runtime validation
of the `interchange` payload is still _worth adding on top_ — see INTERCHANGE.md — but
not as a substitute for static types.)

### Trade-off Analysis

The suite's core promise is safe reuse and safe hand-off. Static types are the direct
mechanism for both, and one app is already TS. The only real cost is migrating the
other app — and that cost is bounded because full typing of app-internal UI glue is
_not required_ for the contracts to be sound; only the shared packages and the
`interchange` schema must be strictly typed.

### Consequences

- **Easier:** every cross-package and cross-tool boundary; onboarding; catching
  breakage at build time.
- **Harder:** the Quadrature migration (bounded, incremental — [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)).
- **Revisit:** the strictness level per directory; you may keep some QD modules
  `// @ts-nocheck` permanently, which is fine.

### Action Items

1. [x] Shared `tsconfig.base.json` with `strict: true`.
2. [x] Package tsconfigs extend base with `strict`; app tsconfigs allow `allowJs` during transition.
3. [x] CI runs `tsc --noEmit` across the workspace.

---

## ADR-0003: Give Quadrature Domains a build step (Vite)

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

### Context

The Quadrature app is deliberately **no-build**: vanilla JS, runs from `file://` with
graceful degradation, a service worker, Web Workers bundled at runtime from source, and
a hand-rolled content-hash cache-buster (`version:sync`). That no-build property is a
genuine feature (zero-friction distribution, offline, drop-on-Pages). But it _blocks
code sharing_: a no-build app can only consume shared code as a pre-built artifact it
version-pins, which reintroduces exactly the multi-repo versioning tax
([ADR-0001](#adr-0001-monorepo-over-multi-repo)). The Dynamics app already uses Vite.

### Decision

Move the Quadrature app onto **Vite** (matching the Dynamics app). Do this as a
**bundler swap first, with the code still 100% JavaScript** (`allowJs`), and only
_then_ migrate to TypeScript incrementally ([ADR-0002](#adr-0002-typescript-as-the-common-language),
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)).

### Options Considered

#### Option A: Vite, adopted as a bundler-swap first (code stays JS), TS later

| Dimension  | Assessment                                              |
| ---------- | ------------------------------------------------------- |
| Complexity | Medium (ESM-ify the `QD.*` namespace / factory modules) |
| Risk       | Low-medium — app keeps working; tests guard each step   |
| Payoff     | Unblocks direct workspace imports; one build per app    |

**Pros:** collapses the awkward "pre-built ESM + version-pin" scheme into plain
`workspace:*` imports; replaces two hand-rolled systems with first-class ones (Vite
Web Workers via `new Worker(new URL(...), {type:'module'})`; `vite-plugin-pwa` for the
service worker + cache-busting); keeps static/offline/Pages deployability
(`base:"./"`). **Cons:** loses the `file://`-no-server dev convenience; requires
ESM-ifying the module system (the real work — see
[RISKS Hard Part 1](RISKS.md#hard-part-1-esm-ification-is-the-real-cost)).

#### Option B: Keep no-build; share code via a pre-built ESM artifact with SRI/version pins

**Pros:** preserves `file://`. **Cons:** reinstates per-package build + version pinning

- artifact juggling — the multi-repo tax inside a monorepo. Self-defeating for the
  sharing goal. Rejected.

#### Option C: A different bundler (esbuild/Rollup/webpack) for QD

**Pros:** possible. **Cons:** the Dynamics app is on Vite; using the _same_ tool halves
the configuration surface and lets both apps share Vite config, plugins, and mental
model. No reason to diverge. Rejected in favor of Vite.

### Trade-off Analysis

The only meaningful thing given up is `file://`-without-a-server during development —
an acceptable trade for HMR, real tooling, and (decisively) the ability to import
shared packages directly. The static-hosting/offline properties that made no-build
attractive are _preserved_ by Vite + `vite-plugin-pwa`, arguably more robustly than the
hand-rolled versions.

### Consequences

- **Easier:** sharing code; workers; cache-busting; using one toolchain across apps.
- **Harder:** the one-time ESM-ification of QD's namespace/load-order module system.
- **Revisit:** never expected; this is a prerequisite for everything downstream.

### Action Items

1. [x] Wrap QD in a Vite app with `allowJs`, keep it running ([MIGRATION Phase 2](MIGRATION.md#phase-2--quadrature-domains-onto-vite-still-all-javascript)).
2. [x] Replace runtime worker-bundling with Vite module workers.
3. [x] Replace `version:sync` with `vite-plugin-pwa`.

---

## ADR-0004: Package manager: pnpm workspaces

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

### Context

The monorepo needs a workspace-capable package manager. Both existing apps currently
use npm. This decision is **low-stakes and reversible** (switching managers is
mechanical), but it should be made deliberately.

### Decision

Use **pnpm workspaces**, pinned via Corepack.

### Options Considered

#### Option A: pnpm workspaces

| Dimension          | Assessment                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Speed / disk       | Fast; content-addressed store, hard-linked — big win with two WebGL apps' heavy dep trees                      |
| Strictness         | Strict by default — forbids phantom (undeclared) dependencies, which keeps the dependency-layering rule honest |
| Workspace protocol | First-class `workspace:*`                                                                                      |

**Pros:** fastest installs, least disk, and — most relevant here — **strict
node_modules** that surfaces accidental cross-package/phantom deps, directly supporting
the [dependency rule](ARCHITECTURE.md#4-the-dependency-rule). **Cons:** a different tool
than the apps use today (minor); occasional friction with packages that assume a flat
`node_modules` (rare, and configurable via hoisting).

#### Option B: npm workspaces

**Pros:** least change (both apps already use npm); zero new tooling. **Cons:** slower,
more disk; **non-strict** — phantom dependencies pass silently, which is exactly the
discipline a layered monorepo wants enforced.

#### Option C: Yarn (Berry) workspaces

**Pros:** capable; PnP is strict. **Cons:** PnP can be rough with some tooling; more
configuration surface than pnpm for the same benefit. Not worth it here.

### Trade-off Analysis

The tie-breaker is **strictness**: pnpm's refusal of undeclared dependencies actively
enforces the architecture's layering rule, catching a whole class of "app accidentally
reached into a package's transitive dep" bugs at install time. Its speed/disk edge is a
bonus given two GPU apps with non-trivial dep trees. The cost — a tool switch from npm —
is small and one-time.

### Consequences

- **Easier:** enforcing clean dependency boundaries; fast installs.
- **Harder:** a one-time learning curve vs. npm (small); pin via Corepack so CI and
  local match.
- **Revisit:** trivially — if pnpm ever causes disproportionate friction, npm
  workspaces are a drop-in fallback.

### Action Items

1. [x] `corepack enable`; pin pnpm in `package.json` `packageManager`.
2. [x] Root `pnpm-workspace.yaml` listing `packages/*` and `apps/*`.

---

## ADR-0005: `expr` + `interchange` as the map-representation keystone

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

### Context

Three otherwise-separate goals — code sharing, tool hand-off, and building the
correspondence tool — all converge on one artifact: a shared way to **represent and
evaluate a map**. The Dynamics app already has the executable half (its `src/expr`
compiler: one AST → GLSL + JS). No shared _serializable_ representation exists.

### Decision

Treat map representation as **the** keystone, in two coordinated packages: **`expr`**
(the executable form — promoted from the Dynamics compiler) and **`interchange`** (the
serializable form). An `interchange` `MapSpec` compiles, via `expr`, into an executable
map. Extend both in stages: **single-valued now**, **multivalued/branch-aware later**.

### Options Considered

#### Option A: Promote `expr` + define `interchange`, staged single→multi-valued

**Pros:** the single-valued Schwarz-reflection hand-off works with today's `expr`
(early win, no new math); the multivalued extension is _the same_ work that both hosts
the correspondence tool and later enables correspondence hand-off; one source of truth
for GLSL+JS evaluation across all tools. **Cons:** `expr` is deeply woven into the
Dynamics app (extraction is delicate); multivalued support is genuinely new design.

#### Option B: Each tool keeps its own map evaluation; hand-off via ad-hoc JSON

**Pros:** no extraction. **Cons:** every tool re-invents GLSL+JS evaluation; hand-off
formats drift; the correspondence tool starts from zero on the exact machinery that
already exists. Rejected — it forfeits the suite's whole point at its most valuable seam.

#### Option C: Serializable form only (`interchange`), no shared executable form

**Pros:** enables hand-off. **Cons:** each consumer still writes its own compiler to
_execute_ a received `MapSpec` — duplicated GLSL/JS backends, the very thing `expr`
exists to prevent. Partial; rejected as insufficient.

### Trade-off Analysis

This is the highest-leverage extraction in the plan and also among the more delicate,
so it is sequenced _after_ the easy `core` extraction and gated by the correspondence
tool's needs. The staging (single-valued proven before multivalued depends on it) is
what makes the delicacy manageable.

### Consequences

- **Easier:** hand-off; the correspondence tool's map layer; consistent evaluation
  everywhere.
- **Harder:** extracting `expr` cleanly from the Dynamics app; designing the
  branch-aware multivalued representation; keeping GLSL and JS backends in sync at
  suite scale (now a tested invariant — [RISKS Hard Part 2](RISKS.md#hard-part-2-the-dualbackend-glsljs-sync-invariant-at-suite-scale)).
- **Revisit:** the multivalued design once the correspondence math is concrete.

### Action Items

1. [x] Define the minimal `interchange` `MapSpec` + `SchwarzReflection` schema ([INTERCHANGE.md](INTERCHANGE.md)).
2. [x] Ship the single-valued `σ` hand-off as the first interop milestone.
3. [ ] Design the branch-aware `expr` extension when the correspondence engine begins. — **not built**: the Correspondences app enumerates branches internally, so no shared multivalued extension was forced (see the Executed note above).

---

## ADR-0006: Convention-neutral core packages

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

### Context

The Quadrature app uses non-standard, deliberate conventions: normalized area
(`dA = dx dy/π`, unit-disk area = 1) and `1/(2πi)`-suppressed contour integrals. The
Dynamics app uses standard conventions. If shared code mixes these, results are
**silently wrong** by a factor of `π` or `2πi` — a correctness landmine, not a style nit.

### Decision

**Core (and foundation) packages are convention-neutral.** Mathematical conventions
live in the app or domain-package boundary. The `interchange` format is defined in one
canonical (standard, unnormalized) convention, and each app converts to/from its
internal convention at its edge, with the convention **explicitly tagged** in the
payload for defense in depth.

### Options Considered

#### Option A: Convention-free core; convert at app boundaries; tag conventions in interchange

**Pros:** shared numerics are reusable by any tool regardless of convention; the
factor-of-π/2πi error class is structurally prevented; the tag catches mistakes early.
**Cons:** requires discipline and explicit conversion shims at edges.

#### Option B: Core adopts one app's conventions (e.g. QD's normalization)

**Pros:** less conversion for that app. **Cons:** the _other_ app must convert on every
call, and any code that forgets is silently wrong; couples the kernel to one tool's
mathematics. Rejected.

#### Option C: Core is convention-free but conventions are _untagged_ in interchange

**Pros:** simpler payloads. **Cons:** loses the defense-in-depth; a mis-converted
hand-off produces a plausible-looking but wrong picture with no signal. Rejected in
favor of tagging.

### Trade-off Analysis

The cost of Option A (conversion shims + discipline) is small and localized; the cost of
getting conventions wrong is a _silent_ numerical error that could corrupt a research
figure. For a mathematics research tool, silent wrongness is the worst failure mode, so
we pay the small structural cost to prevent it, and add tagging so any residual mistake
is loud.

### Consequences

- **Easier:** trusting shared numerics; reusing `core` in any future tool.
- **Harder:** a small amount of explicit conversion at app/domain edges; a lint/test to
  catch convention leakage into `core`.
- **Revisit:** if a _third_ convention appears (e.g. a future tool), the tag set grows;
  the principle holds.

### Action Items

1. [x] Document the canonical interchange convention in [INTERCHANGE.md](INTERCHANGE.md).
2. [ ] Add a test asserting `core` contains no `π`/`2πi` normalization constants. — enforced **by construction** (the kernel carries no normalization constants) rather than by a dedicated guard test.
3. [x] Implement per-app conversion shims at the interchange boundary.

---

## ADR-0007: Incremental extraction driven by real need

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

### Context

Two failure modes bracket this project: (a) migrate/abstract everything up front (weeks
with no new mathematics; speculative seams baked into a large codebase), or (b) build
the new tool on the about-to-be-replaced foundation and migrate its code too. We want
neither.

### Decision

**Front-load only the cheap infrastructure** that unblocks sharing (workspace skeleton,
unified tooling, Quadrature-onto-Vite-all-JS). Then **build the correspondence tool in
parallel** with the more expensive extraction (full TS-ification of app internals, the
GPU-core extraction), and **extract a package only when a second consumer actually needs
it** — letting the correspondence tool's real requirements pull exactly the right seams.

### Options Considered

#### Option A: Incremental, need-driven extraction (this ADR)

**Pros:** working suite at every step; motivating wins early (σ hand-off, deltoid
reproduction); extraction seams are validated by a real second consumer rather than
guessed; research and infrastructure proceed together. **Cons:** requires judgment
about _when_ to extract; the codebase is temporarily heterogeneous (some TS, some JS;
some shared, some not).

#### Option B: Full migration first, then the tool

**Pros:** cleanest foundation before new work. **Cons:** long research drought;
speculative abstraction over a mature, dozens-of-modules codebase; highest risk of the
"never ships" trap for a solo dev. Rejected.

#### Option C: Tool first in current JS, migrate later

**Pros:** fastest first result. **Cons:** builds on the foundation being replaced; you
migrate the new tool's code afterward; the hand-off/keystone benefits arrive late.
Rejected.

### Trade-off Analysis

Option A's only real cost is _judgment_ (when to extract) and _heterogeneity_ (a
mixed-state repo mid-transition). Both are manageable for one developer with good docs,
and are far cheaper than a research drought (B) or building-then-re-migrating (C). The
need-driven rule also directly serves principle #2 (extract on evidence).

### Consequences

- **Easier:** sustaining momentum; validating each seam with a real consumer.
- **Harder:** living with a temporarily heterogeneous repo; deciding extraction timing
  (guided by "a second consumer needs it").
- **Revisit:** each extraction is its own small decision; record notable ones as
  follow-on ADRs. _(First one: [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate),
  `@cas/exact`.)_

### Action Items

1. [x] Sequence per the [migration runbook](MIGRATION.md) (Phases 0–6, overlapping 5–6).
2. [x] Gate each package extraction on a concrete second consumer.

---

## ADR-0008: Extract `@cas/exact`; keep QD's `sym-core` separate

**Status:** Accepted **Date:** 2026-07 **Deciders:** Andrew

_The first follow-on ADR that [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)
asked for ("record notable [extractions] as follow-on ADRs"). It records two decisions: one
extraction that happened, and one that deliberately did not._

### Context

The Correspondences app needed **exact** arithmetic — not floating point — to locate the deltoid
correspondence curve's cusps. A cusp is a _decision_ ("the discriminant vanishes here"), and a
decision computed in floating point is an estimate wearing a decision's clothing. It grew an
in-app engine at `apps/correspondences/src/exact/`: ℚ over `BigInt`, ℚ(i) on top, and exact
univariate polynomials over that field.

Complex Dynamics then needed the same field for **Gleason polynomials** (Mandelbrot period-_n_
centers) and, later, dynatomic Φ<sub>n</sub>(z, c). That is a second consumer, which under
ADR-0007 is the trigger to extract.

Two facts make this worth its own record rather than a line in a changelog:

1. **`exact` was not in the phase plan.** [MIGRATION.md](MIGRATION.md) Phases 3–5 named `core`,
   `interchange`, `expr`, `gpu`. Nobody predicted a fifth package. It was pulled into existence
   by a real requirement — which is ADR-0007 working exactly as intended, not a plan overrun.
   The suite therefore has **five** packages, not the four the phase plan implies; several
   documents said four for some time afterwards.
2. **The suite already had an exact engine, and we did not use it.** The Quadrature app's
   `app/sym-core.mjs` is 5,805 lines of exact ℚ(i) — `Rational`, `Gaussian`, multivariate
   `MPoly`, Gröbner/FGLM, Hermite forms, and a full factorizer. The obvious move was to extract
   _that_ and have everyone share it. We didn't.

### Decision

**Extract the Correspondences engine to `@cas/exact`** (`d62e439`, PR #57, 2026-07-13), moving
`gaussian.ts` and `qiPoly.ts` out of the app and adding shared `render.ts`. Grow it from there:
`biPoly.ts` and `resultant.ts` followed as CD's dynatomic and multiplier-specialization work
needed them.

**Leave `sym-core.mjs` where it is**, un-extracted and unconsolidated. The suite runs two exact
engines, on purpose.

### Options Considered

#### Option A: Extract the Correspondences engine (this ADR)

**Pros:** the code already existed, was already tested, and was already the right shape for CD's
need (univariate over ℚ(i), abstract variable — `z̄` for a correspondence curve, `c` for a
Gleason polynomial). Small: ~370 lines moved. **Cons:** creates a fifth package the phase plan
never mentioned, and a second exact implementation in the repo.

#### Option B: Have Complex Dynamics import from `apps/correspondences`

**Pros:** no new package. **Cons:** violates the one dependency rule the architecture actually
enforces — no app imports another app ([§4](ARCHITECTURE.md#4-the-dependency-rule), lint-guarded).
Rejected on principle, not taste.

#### Option C: Copy the primitives into Complex Dynamics

**Pros:** fastest. **Cons:** two divergent copies of the field arithmetic that every exactness
claim in two apps rests on. Bugs would be fixed once and survive once. Rejected.

#### Option D: Extract `sym-core` instead, and have everyone share it

**Pros:** one exact engine for the suite; no duplicated ℚ(i). **Cons, and why it was rejected:**

- **Shape mismatch.** `sym-core` is _multivariate_ (`MPoly` over a variable-name map) and built
  for ideal-theoretic work — Gröbner bases, elimination, real-root counting. CD and
  Correspondences need _univariate and bivariate_ polynomials with a single abstract variable.
  Sharing would mean either using a heavyweight representation for a lightweight job, or adding
  a second representation to `sym-core` — i.e. building `@cas/exact` inside it anyway.
- **Risk concentration.** `sym-core` is the most correctness-critical code in the repo: the
  project's honest-labeling guarantee (`=` exact / `≤` bound / `≈` estimate) is only meaningful
  because that engine can actually decide things. Refactoring 5,805 lines of it to serve two
  consumers that don't need its capabilities trades a real guarantee for a tidier diagram.
- **No demand.** ADR-0007's rule is symmetric: don't extract without a second consumer, and don't
  _merge_ without one either. Nothing needs `sym-core`'s multivariate machinery outside QD.
- **It is deliberately self-contained.** `sym-core.mjs` imports only `./solver.mjs`, which is
  what lets it run unchanged in a module worker and in the headless Node suite.

### Trade-off Analysis

The honest cost of A + not-D is **duplication of the same mathematics**: ℚ over `BigInt` and
ℚ(i) are implemented twice, in `sym-core.mjs` and in `packages/exact/src/gaussian.ts`. That is
real debt and should be named as such rather than explained away.

It is accepted because the two implementations serve different shapes, are independently tested,
and — crucially — a bug in one does not silently corrupt the other's claims. The alternative
(Option D) concentrates risk in the one module whose correctness the project's central guarantee
depends on, in exchange for removing a duplication that is not currently causing errors. For a
solo developer that is a bad trade. It stops being a bad trade under the conditions in _Revisit_.

### Consequences

- **Easier:** CD and Correspondences share one tested exact kernel; a fix lands once. `@cas/exact`
  is small enough to read in a sitting, and convention-neutral per
  [ADR-0006](#adr-0006-convention-neutral-core-packages).
- **Harder:** two ℚ(i) implementations to keep correct. Anyone reading the repo must learn that
  "the exact engine" is ambiguous — hence the explicit note in
  [`packages/exact/README.md`](../packages/exact/README.md) that QD does _not_ use this package.
- **Watch for:** a third consumer wanting multivariate exact work outside QD. That is the point
  at which the two engines stop being different-shaped and start being redundant.
- **Revisit if** any of: (a) a second consumer needs `sym-core`'s multivariate/Gröbner layer;
  (b) the two ℚ(i) implementations are found to disagree on any input (a differential test
  between them is the cheap early-warning, and does not exist yet); or (c) `@cas/exact` grows a
  multivariate representation of its own — at which point it is reimplementing `sym-core` and
  the merge argument becomes real.

### Action Items

1. [x] Extract `gaussian`/`qiPoly` into `packages/exact` with its own tests (`d62e439`, PR #57).
2. [x] Grow `biPoly` + `resultant` as CD's dynatomic and multiplier work required them.
3. [x] Give the package a README that states the `sym-core` boundary explicitly (#119).
4. [x] Add a differential test asserting `@cas/exact`'s `Gauss` and `sym-core`'s `Gaussian`
       agree on a shared corpus — the guard against the duplication in _Trade-off Analysis_
       drifting silently. Shipped as
       `apps/quadrature-domains/vitest/exact-symcore-differential.test.ts`: 43 assertions
       comparing **canonical `(n, d)` BigInt tuples**, never `toNumber()`, over a corpus aimed
       at normalization (negative denominators, unreduced inputs, values past 2⁵³, and the gcd
       fast paths `sym-core` has that `@cas/exact` does not). Verified by mutation in **both**
       directions: breaking `sym-core`'s `d === -1n` fast path produces 105 disagreements;
       breaking `@cas/exact`'s complex-multiply sign produces 200. This required adding
       `@cas/exact` to the QD app's **devDependencies** — the app's runtime still does not use
       it, and the boundary this ADR draws is unchanged.

---

## ADR-0009: Schwarz reflection (σ) is a first-class peer view in Complex Dynamics

**Status:** Accepted **Date:** 2026-08 **Deciders:** Andrew

_A follow-on ADR of the kind [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) anticipated —
but a UI/product decision rather than an extraction. It records the target shape of the Schwarz-reflection
feature in Complex Dynamics and supersedes the MVP "transient overlay" shape that shipped first._

### Context

The QD → CD Schwarz-reflection (σ) hand-off shipped as a **transient overlay**: σ(w) = conj(F(φ⁻¹(w))) is
reconstructed from an imported — or natively built — Riemann map φ and painted onto a dedicated canvas
(`#JCSSchwarz`) layered _over_ the Dynamical plane, shown for one map and dismissed by Esc or by any control
change (S4a → S4b, `render/schwarzView.ts` / `render/schwarzGL.ts` / `main.ts`). That was the right minimal
shape for the milestone: reproduce the deltoid σ as ground truth, then make it a live, interactive,
GPU-rendered view with a native φ builder — without yet building UI chrome.

σ is now a full interactive render (pan/zoom, presets + custom φ, CPU-parity-proven GPU engine). A
feature-parity review — against CD's own Dynamical plane and against QD's _mature_ σ tool
(`app/schwarz/schwarz-ui.mjs`, which already ships colormaps + scale modes, hover/click orbit tracing, a
preimage tree, a boundary overlay, and z-disk / Riemann-sphere views of σ) — found that CD's power features
split cleanly into **generic** (operate on any escape-time field → reusable for σ: colormaps + scale modes,
legend, scale bar, hover readout, iteration controls, share links / saved views, PNG export, keyboard/pinch
nav) and **map-specific** (bound to the `f(z,c)` pipeline: rays, Böttcher, matings, Julia-set properties,
Yoccoz, laminations, the inspector's period/multiplier/nucleus math — inapplicable to σ by nature). The
finding that forces this ADR: the generic parity features integrate _cleanly_ only if σ has **its own
persistent controls and lifecycle**. An overlay dismissed on any control change has nowhere to host a
controls panel, cannot be serialized into a share link / saved view, and makes legend/scale-bar placement
awkward. CD's topology already has two coexisting **peer planes** — Parameter Space and Dynamical Plane, each
a `<section>` with its own canvas + controls — which is exactly the shape σ needs.

### Decision

Promote σ from a transient overlay to a **first-class peer view** in Complex Dynamics: a Schwarz-reflection
pane alongside Parameter Space and Dynamical Plane, with its **own canvas, its own controls section, and its
own persistent lifecycle** (entered and left as a mode, not dismissed by unrelated control changes). σ-view
state — the φ recipe + view + coloring — becomes **serializable** (share links, saved views, PNG metadata)
like the other planes. This **supersedes the S4a "transient overlay" shape** (a milestone choice, not a prior
ADR).

This does **not** conflict with [CLAUDE.md decision #8](../CLAUDE.md) ("separate apps + a unified menu; **no**
unified single-page shell"): that decision governs the _suite_ topology (each tool is a separate app under a
launcher). σ is **not** a separate app — it is a _view within_ the Complex Dynamics app, sharing CD's engine,
coloring, interaction, and import path. A peer view inside one app is not a cross-app single-page shell.

### Options Considered

#### Option A: First-class peer view within Complex Dynamics (this ADR)

| Dimension  | Assessment                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Parity fit | High — every generic feature (controls panel, permalink, saved views, legend, PNG) has a natural home   |
| Reuse      | High — shares CD's engine / coloring / nav; QD's σ tool is a proven reference for the shape             |
| Cost       | Medium — a one-time refactor (lifecycle, a controls section, mode-switch + layout, state serialization) |

**Pros:** the parity features land cleanly; σ becomes a real mode users navigate to, share, and save; matches
the existing peer-plane structure; QD already validated this shape for σ. **Cons:** a bounded architectural
refactor — σ's lifecycle out of "overlay dismissed on any change", a new controls section, layout/mode wiring,
and state serialization; the QD → CD import path must keep working through the new mode.

#### Option B: Keep σ as a transient overlay; bolt features onto it

**Pros:** no refactor. **Cons:** every parity feature fights the overlay model — no home for σ controls, no
way to serialize a dismiss-on-any-change overlay, awkward legend/scale-bar placement. It accrues exactly the
"features bolted onto an overlay" debt the review flagged; the "no refactor" saving is paid back with interest
per feature. Rejected.

#### Option C: A separate σ app (like `apps/correspondences`)

**Pros:** total isolation; its own everything. **Cons:** σ _shares_ CD's engine, coloring, interaction, and
the QD → CD import path; a separate app would re-duplicate them (against the suite's north star — "each new
tool builds fewer primitives from scratch than the last") and split the hand-off across an extra app boundary.
The stated goal was explicitly "the CD app natively supports σ." Rejected.

### Trade-off Analysis

Option A's cost is a bounded, one-time refactor; its payoff is that every Tier-1/2 parity feature lands
cleanly and σ stops being a second-class citizen in its own app. Option B's "no refactor" is illusory — it is
repaid, with interest, as each feature works around the overlay. Option C forfeits the reuse that motivated
putting σ in CD at all, and duplicates primitives the suite exists to share. The peer-view shape is also the
one QD already validated for σ, so it is low-risk in design even though it is real work.

### Consequences

- **Easier:** hosting σ's own controls (coloring, iteration, inspection); serializing σ into share links /
  saved views / PNG metadata; a legible mode switch; giving future σ features (orbit inspection, z-disk /
  sphere views) a home.
- **Harder:** the one-time refactor — σ lifecycle, a controls section, mode-switch + layout wiring, state
  serialization; keeping the QD → CD import path working through the new mode.
- **Watch for:** σ's controls _duplicating_ the Dynamical-plane controls. Reuse the generic coloring/nav
  machinery the feature review identified as field-agnostic; do not fork it.
- **Revisit if:** σ grows enough genuinely distinct surface to warrant its own app after all — unlikely, since
  it shares CD's foundation, and Option C's reuse cost would still apply.

### Action Items

1. [x] Refactor σ from a transient overlay into a peer view/mode — its own pane + controls section + a
       persistent lifecycle (not dismissed by unrelated control changes). Done: a third `#schwarz-plot`
       `.plot` section inside `main.plots`, entered/left via a `.workspace.schwarz-active` mode class
       (modeled on the per-plot `expand` layout); the σ canvas + φ builder moved into it; the
       control-apply dismissal coupling removed. Verified in the built app (Playwright mode switch).
2. [x] Serialize σ-view state (φ recipe + view + coloring) into share links / saved views / PNG metadata.
       **Done** — layered onto the `AppState` as a single `_sigma` key (like `_z0` / `_grad` / `_proj`), so
       one hook in `readFullState` / `applyFullState` lights up permalinks AND saved views (both flow
       through it); the PNG "Save PNG" export embeds the same permalink as a `cdjs:state` tEXt (+ a
       `cdjs:sigma` summary). The `_sigma` codec (`state/schwarzState.ts`) is hostile-link hard (rejects
       non-finite/malformed input, caps lists, enforces `|z_j| < 1`, clamps zoom). Verified in the built
       app (Playwright): a σ view round-trips through a permalink, a saved view, and a PNG's embedded
       permalink — pixel-identical restore.
3. [x] Bring the generic parity features into the σ controls section (colormaps + scale modes, orbit
       inspection, legend + scale bar, precise nav), reusing CD's field-agnostic machinery. **Done** —
       all four sub-features below.
   - [x] **Colormaps + scale modes.** The σ pane gets a colormap picker (7 perceptually-uniform ramps +
         Turbo + grayscale) and an escape-time scale mode (linear / log / sqrt / discrete / cyclic),
         wired through the shared `@cas/gpu` colormap texture — NOT CD's byte-frozen procedural-palette
         GLSL (the review's "reuse the field-agnostic machinery, do not fork it"). Palette DATA is
         app-local (`render/schwarzColormaps.ts`), matching QD's σ and the `@cas/gpu/colormap` header's
         stop-table-vs-fit split. Proven in real WebGL2 (colormap-aware `schwarzGL.browser.test.ts`:
         the K-interior base tracks the ramp's t=0 end; grayscale renders achromatic) and by a Playwright
         mode switch in the built app.
   - [x] **Orbit inspection.** Clicking the σ canvas traces that point's σ-orbit (w₀ → σ(w₀) → …) and
         draws it over the field — a polyline + per-iterate dots + a ringed w₀ marker, coloured by fate
         (green enters K, orange escapes, violet lingers, gray inverse-failed) in CD's own orbit-preview
         idiom — with a σ-pane readout of the classification (honest `≈`). Click is disambiguated from the
         pan-drag by a travel threshold; a "clear" removes the trace. The tracer (`schwarzOrbitAt`) shares
         the field's escape budget and is pinned to `escapeTime` by a parity test.
   - [x] **Legend + scale bar.** A σ legend chip (top-right) shows the current colormap ramp + the flat
         classification swatches (escapes → ∞ / non-escaping / off-branch), reusing the standard plots'
         `legend-*` CSS so it reads consistently; the scale bar REUSES CD's own `drawScaleBar` overlay
         directly (the σ view shares the center/zoom convention). The flat colours are exported from
         `render/schwarzView.ts` as the single source the shader + CPU render + legend all share.
   - [x] **Precise nav.** Centre-re / centre-im / zoom fields + apply/reset in the σ controls (parity
         with the standard plots' centre/zoom inputs); the fields mirror the live view as you drag/zoom
         and apply back to it. Parse/format is a pure, unit-tested pair (`parseSchwarzViewInput` /
         `formatSchwarzViewFields`) sharing the wheel gesture's zoom clamp.
4. [x] Update [SIGMA-HANDOFF.md](design/SIGMA-HANDOFF.md) so the peer-view is the target shape (superseding
       the S4a overlay), and keep the map-specific instruments explicitly out of scope for σ. **Done** — its
       "Target shape — ADR-0009" section now reads REALIZED (the peer view supersedes the S4a `#JCSSchwarz`
       overlay), the map-specific instruments (rays / Böttcher / matings / Yoccoz / laminations / the
       inspector's period-multiplier-nucleus math) are called out explicitly out of scope for σ, and the
       "Deferred enhancements" list moves items 1–3 to done, leaving only S5 (non-Laurent families,
       branch-aware continuation, df64 σ, PQD GPU) deferred.

**ALL FOUR ACTION ITEMS COMPLETE (2026-08-08).** σ is a first-class peer view with its own pane + controls

- persistent lifecycle (item 1), full generic-parity coloring/inspection/legend/nav (item 3), and
  serializable state across share links / saved views / PNG metadata (item 2); the design doc records the
  peer view as the realized target shape (item 4). Deferred beyond this ADR: S5 (SIGMA-HANDOFF.md) — more
  families, branch-aware continuation, df64.

---

## ADR-0010: Complex Function Plotting Tool as a separate app

**Status:** Accepted **Date:** 2026-08 **Deciders:** Andrew

_The fourth app joins the suite. Recorded because adding a tool is exactly the event
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) and the north star are measured against —
"does each new tool build fewer primitives than the last?" — and because it draws two follow-on ADRs
(the `@cas/expr` parameter-model change and a shared 3D slice). The full build runbook lives in
[`design/complex-function-plotter-plan.md`](design/complex-function-plotter-plan.md)._

### Context

A fourth tool was requested: a research-grade **complex-function plotter** — domain coloring of a single
map `w = f(z)`, with 2D and (later) 3D views, custom-function input, and a wide range of
coloring / interaction / analysis options. Domain coloring is a **different rendering paradigm** from the
suite's dynamics tools: those iterate `f(z, c)` and colour by escape-time; the plotter colours a _single_
evaluation of `f` per pixel by phase and modulus, and its instruments are the **argument principle**, level
sets, and (later) residues — not external rays or Böttcher coordinates. But its needs map cleanly onto the
shared foundation: custom input **is** `@cas/expr` (parse → GLSL + JS, plus the symbolic derivative); the
WebGL2 substrate + complex-GLSL stdlib **is** `@cas/gpu`; share-links + suite hand-off **are**
`@cas/interchange`. So it is a direct test of the north star.

### Decision

Build it as a **separate app** `apps/complex-function-plotter` — the same topology as the other three
([CLAUDE.md decision #8](../CLAUDE.md): separate apps + a unified menu, **no** single-page shell) — riding
`@cas/expr` + `@cas/gpu` + `@cas/interchange`. Ship it **built-but-unpublished** (a launcher "Coming soon"
card, exactly as `apps/correspondences` was) until a quality gate, then flip to published (one `cp` in
`deploy-pages.yml`). Execute against the phase-gated plan.

### Options Considered

- **A — Separate app (this ADR).** _Pros:_ matches the suite topology; a thin app over shared packages; the
  coloring/instrument surface is genuinely its own product with its own controls and lifecycle; publishes
  independently. _Cons:_ some UI scaffolding is re-created per app (no `@cas/ui` — never extracted, ADR-0007).
- **B — A mode/view inside Complex Dynamics** (like σ, [ADR-0009](#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics)).
  _Cons:_ domain coloring is a _different paradigm_ from escape-time — different coloring, different
  instruments, different meaning of a pixel — and it would bloat CD's already-large `main.ts` and couple two
  unrelated products. σ earned a peer view because it **shares CD's escape-time engine**; the plotter shares
  _packages_, not CD's pipeline. Rejected.
- **C — A standalone tool outside the suite.** _Cons:_ forfeits the `@cas/expr` / `@cas/gpu` /
  `@cas/interchange` reuse that is the whole point. Rejected.

### Trade-off Analysis

The plotter validated the north star: through Phase 2 it built on `@cas/expr` (input + derivative),
`@cas/gpu` (GLSL stdlib, shader compile/link, the colormap-machinery reuse pattern), and `@cas/interchange`
(share-links), reimplementing none of them. Its **only** shared-package _change_ so far was **additive** —
hyperbolic / inverse-hyperbolic / reciprocal-trig builtins into `@cas/expr` (B3), now available suite-wide.
That is the demand-driven rule working as intended: the new consumer grew the shared library rather than
forking it.

### Consequences

- **Easier:** a fourth tool shipped mostly by composition; the coloring/instrument product has its own home;
  suite interop is one `@cas/interchange` import away (planned Phase 6).
- **Harder:** UI chrome is app-local (no `@cas/ui`); display conventions (phase→hue, modulus→height) stay
  app-local and tagged ([ADR-0006](#adr-0006-convention-neutral-core-packages)), never baked into packages.
- **Follow-on ADRs this anticipates:** (i) a **named-parameter generalization of `@cas/expr`** — Phase 3, the
  one non-trivial shared-package change, backward-compatible with CD; (ii) a **shared 3D slice** (mat4 / mesh /
  camera) — Phase 5, on the [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) second-consumer
  rule. Each gets its own record when it lands.
- **Watch for:** the app drifting into CD's escape-time territory (dynamics belong to CD); and the coloring
  shader growing bespoke per-mode branches instead of the layered `colorAt` composition.

### Action Items

1. [x] Scaffold `apps/complex-function-plotter` from the `correspondences` template; register it
       (`vitest.workspace.ts`, eslint `APP_NAMES`, `assert-test-census.mjs`, a launcher "Coming soon" card). (`d47e815`)
2. [x] Phase 1 — live 2D domain coloring: expression input + typeset preview + errors, the layered `colorAt`
       (phase LUT × modulus transfer), pan/zoom/reset, axes/grid/legends, the cursor probe, share-links, PNG.
       (`1f98005`, `d98c57d`)
3. [x] Phase 2 — enhanced portraits (rings / sectors / conformal grid / chessboards / Re-Im grid, `fwidth` AA),
       colormap library + colorblind-safe + CVD preview, the zero/pole instrument (argument principle) + level
       sets, and the honest-labeling / uncertainty layer. (`cfca14d`, `f3eb87b`, `2b72e63`, `e894be1`)
4. [ ] Phase 3 — parameters & families; **opens with the `@cas/expr` named-parameter follow-on ADR**.
5. [ ] Publish (flip the launcher card + add the `deploy-pages.yml` `cp`) at the plan's quality gate (Phase 6).
