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
| [0011](#adr-0011-casexpr-named-parameters)                                          | `@cas/expr` named parameters                                          | Accepted |
| [0012](#adr-0012-the-shared-3d-slice--extract-the-mat4--quaternion-core-keep-the-app-specific-3d-local) | The shared 3D slice — extract the `mat4` + quaternion core            | Accepted |
| [0013](#adr-0013-the-riemann-map-tool-is-a-new-app-not-a-mode-in-an-existing-one)  | The Riemann-map tool is a new app (not a mode in an existing tool)    | Accepted |
| [0014](#adr-0014-extract-casdynamics-on-the-second-consumer-rule-riemann-map)       | Extract `@cas/dynamics` (Böttcher exterior maps); Riemann Map is the second consumer | Accepted |
| [0015](#adr-0015-extract-cascorepoly--format-float-only-exact-stays-in-casexact)   | Extract `@cas/core/poly` + `format`; float-only, exact stays in `@cas/exact` | Accepted |
| [0016](#adr-0016-extract-casexport--shared-png-text-metadata--shared-glsl-snippets) | Extract `@cas/export` — shared PNG `tEXt` metadata (+ shared GLSL snippets) | Accepted |
| [0017](#adr-0017-the-complex-dynamics--riemann-map-hand-off-riemann-map-becomes-a-pure-2d-conformal-consumer) | CD → Riemann-Map hand-off; Riemann Map becomes a pure-2D conformal consumer | Accepted |

> **Status legend:** Proposed → Accepted (once you sign off) → Superseded/Deprecated.
> All seventeen are **Accepted**. ADRs 0001–0007 are the up-front decisions (recorded in
> [`CLAUDE.md`](../CLAUDE.md) and [RISKS §Decisions](RISKS.md#open-questions-decisions-needed-from-you));
> **0008 is the first _follow-on_** — a decision made during the build, which
> [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) explicitly asked to be recorded
> this way. Expect more of that shape than of the original seven. **0009 is another follow-on**, of a
> different kind — a UI/product decision (σ becomes a first-class peer _view_ in Complex Dynamics), not an
> extraction. **0010 is a third follow-on** — the suite's fourth app (the Complex Function Plotting Tool),
> a product/topology decision made when the tool was requested. **0011 is a fourth follow-on** — the
> `@cas/expr` named-parameter generalization that [ADR-0010](#adr-0010-complex-function-plotting-tool-as-a-separate-app)
> itself anticipated (its first follow-on), the one non-trivial shared-package change in the plotter plan.
> **0012 is a fifth follow-on** — an *extraction* (the plotter's `mat4` + quaternion 3D core becomes a shared
> subpath, the [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) rule again). **0013 is a sixth
> follow-on** — a topology decision from the fifth app's own build: the Riemann-map studio is a *new app*, not a
> mode (the mirror image of 0009's call). **0014 is a seventh follow-on** — another *extraction*: the Riemann-map
> tool is the second consumer of Complex Dynamics' inverse-Böttcher machinery, so it moves into a new
> `@cas/dynamics` package (ADR-0007 once more). **0015 is an eighth follow-on** — one more *extraction*:
> the shared dense-polynomial kernel and label formatting move into `@cas/core/poly` + `format` (float-only;
> exact stays in `@cas/exact`), the ADR-0007 rule again, with `@cas/schwarz` and the Quadrature app as the
> two consumers. **0016 is a ninth follow-on** — one more *extraction*: the PNG `tEXt` reproducibility-metadata
> code (three byte-equivalent copies) becomes `@cas/export`, plus three shared GLSL snippets fold into
> `@cas/gpu/glsl` — the ADR-0007 rule once more. **0017 is a tenth follow-on** — a *product/topology* decision
> (like 0009/0010/0013): Complex Dynamics hands a filled Julia set's Böttcher map to the Riemann-map studio
> over `@cas/interchange`, and Riemann Map sheds its whole dynamics + GPU stack to become a pure-2D conformal
> consumer — it **supersedes ADR-0014's premise** that RM is a live `@cas/dynamics` consumer and **narrows
> ADR-0013**. Supersede rather than rewrite if any change later.
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

### Addendum (2026-08-10): σ as a multi-view standalone explorer (Phase F)

The σ-view polish arc (LOG.md, Phases A–E) completed the peer view this ADR promised and, in doing so,
settled σ's identity: it is a **standalone explorer that shares CD's chrome but not its z²+c math**. Phase F
([`refactor/PHASE-F.md`](refactor/PHASE-F.md)) extends — does **not** reverse — this ADR from a single
w-plane view into a **multi-view explorer with σ-native instruments**: additional coordinate views (the
uniformizing z-disk via forward φ, and the Riemann sphere), the σ⁻¹ preimage/tiling tree, and σ-analytic
cards (level curves, cycles, limit set, singularities, …), ported from the Quadrature Domains app. This
addendum records three standing decisions so F's increments do not each re-litigate them:

1. **The `(≈)` honesty rule is absolute.** σ is a numerical reconstruction (φ⁻¹ by Newton / Durand–Kerner),
   so every F artifact — each view, curve, cycle, dimension, limit set — is `(≈)`-labeled and never reads as
   certified (RISKS §3–4). This is the guardrail, not a nicety.
2. **σ's instruments are σ-native, and the z²+c boundary from item 4 above still holds.** F adds σ's *own*
   depth (reflection tiling, σ level curves, σ-orbit families); it does **not** import the map-specific
   instruments (external rays / Böttcher / matings / Yoccoz / laminations), which remain out of scope for σ.
3. **Extraction is opportunistic and math-first (ADR-0007).** Pure σ kernels F needs (σ⁻¹, preimage tree,
   chaos-game limit set, level curves, cycle finder) move into `@cas/schwarz` as each item lands — the
   second-consumer bar is already met (CD + QD + `apps/correspondences` all consume σ). Merging the three
   apps' σ **shaders** into one `@cas/schwarz/gpu` is genuine duplication paydown but a large cross-app
   refactor, and is deferred to its **own** future ADR rather than smuggled in under a Phase F item.

Phase F is a **menu**, not a runbook: each item ships and reviews on its own gate, nothing here blocks the
completed A–E arc, and the phase may stop at any depth.

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
  one non-trivial shared-package change, backward-compatible with CD — **now written as
  [ADR-0011](#adr-0011-casexpr-named-parameters)**; (ii) a **shared 3D slice** (mat4 / mesh / camera) — Phase 5,
  on the [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) second-consumer rule. Each gets its
  own record when it lands.
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
4. [x] Phase 3 — parameters & families; opened with the `@cas/expr` named-parameter follow-on ADR
       ([ADR-0011](#adr-0011-casexpr-named-parameters)). Shipped (G1/G2/G4 + B5).
5. [x] Publish (flipped the launcher card + added the `deploy-pages.yml` `cp`) at the Phase-6 gate; merged in #247.

---

## ADR-0011: `@cas/expr` named parameters

**Status:** Accepted **Date:** 2026-08 **Deciders:** Andrew

_The follow-on that [ADR-0010](#adr-0010-complex-function-plotting-tool-as-a-separate-app) anticipated
(consequence (i)): the one non-trivial shared-package change in the plotter plan. `@cas/expr` is shared with
Complex Dynamics, so the generalization is strictly backward-compatible. Build detail in
[the plan §1.4 / Phase 3](design/complex-function-plotter-plan.md)._

### Context

`@cas/expr` compiles one AST to two backends that must agree — the **dual-backend guarantee**
([RISKS](RISKS.md)): a JS interpreter/closure (`makeComplexFn`) and a GLSL string (`compileF`). Its
free-variable scope is **hardcoded to `z, c, a`**. `z` and `c` are the two formal arguments of
`fFn(cvec z, cvec c)`; `a` is a single **live parameter** — the JS side binds it to a value, and the GLSL side
aliases it from a uniform (`cvec a = vec_(uA.x, uA.y);`) whenever the program reads it. That one parameter is
what Complex Dynamics animates (its parameter-plane point / slider), wired through `uA` in
`shaderBuilder` / `glPlot`.

The plotter's Phase 3 (**G1**) needs **more than one** parameter, and named: type `a*z*(1-z) + b`, get an
auto-detected control for `a` and one for `b`; type `k`, get a `k` control. Each must bind to a **uniform** so
dragging it is a re-uniform, not a recompile (the CD live-parameter pattern). So the single hardcoded `a` has
to generalize to an **arbitrary set of named parameters**.

`@cas/expr` is depended on by Complex Dynamics, whose `a` / `uA` path must not shift by one ulp. So this is a
**backward-compatibility problem first** and a feature second — the single risk on the whole plotter plan
([RISKS §_`@cas/expr` param change regresses Complex Dynamics_](RISKS.md)).

### Decision

Generalize the free-variable scope to **arbitrary named parameters**, backward-compatibly, across three files:

1. **Enumeration (`ast.ts`).** Add a pure `freeParameters(ast): string[]` — the variables referenced but never
   locally assigned, minus the reserved formals `z` / `c`. This is what the host reads to build one control per
   parameter. (`isFreeParameter` / `referencesVar` already existed for the single-`a` case; this is their
   set-valued generalization.)
2. **JS backend (`evaluate.ts`).** Parameters become a **name→value map** seeded into the evaluation scope, and
   carried into `f(...)` recursion so JS ≡ GLSL holds even inside self-reference. The legacy **`Complex`-positional**
   argument is kept as a calling convention: `makeComplexFn(ast, [3,0])` normalizes to `{ a: [3,0] }`, so every
   existing CD call (and `rational.ts`, and `getComplexFn`) is unchanged. `a` stops being a language keyword —
   it is just the conventional first name.
3. **GLSL backend (`glsl.ts`).** `compileF` / `compileEscape` take an optional `CompileOptions { params?: string[] }`.
   **Absent (the default) → legacy:** exactly one alias, `a → uA`, emitted byte-for-byte as before. **Present →
   general:** each referenced parameter `p` aliases to `uParam_<p>` via the df64-safe
   `vec_(uParam_<p>.x, uParam_<p>.y)` constructor. The host declares and sets those uniforms.

Reserved formals stay `z`, `c`. The `a → uA` binding survives **only as the zero-config default**, which is
exactly what keeps Complex Dynamics untouched; the plotter opts into the general path and binds every parameter
(including `a`, if used) uniformly through `uParam_<name>`.

### Options Considered

- **A — Backward-compatible generalization (this ADR).** _Pros:_ CD's `a` / `uA` path is literally the default
  codepath — byte-identical GLSL, identical JS results — guarded by its `expr` / `glslCodegen` suites; the plotter
  gets real named parameters through the **same compiler**, so the dual-backend guarantee extends to them for free;
  `t` (animation, G2) and family sweeps (G4) become "just more named parameters." _Cons:_ two JS calling
  conventions (positional `Complex` legacy + name→map); the `a → uA` default is a small special case that lives on
  for CD.
- **B — Leave `@cas/expr` alone; substitute parameters in the app.** Bake parameter values into the AST/source
  before compiling. _Cons:_ parameters would live **outside** the compiler, so JS ≡ GLSL would not cover them; and
  baking values in forces a **recompile per frame** while dragging a control, instead of a uniform update — the
  opposite of the CD live-parameter pattern. Rejected.
- **C — Break the scope open** — make all identifiers parameters and drop the `a → uA` special case. _Cons:_ forces
  a Complex-Dynamics migration (its `shaderBuilder` declares and sets `uA` every frame) for zero user benefit,
  violating "working software at every step." Rejected.

### Trade-off Analysis

The entire risk is regressing Complex Dynamics, and the design collapses that risk to one question — _is the
default path unchanged?_ — which the existing suites answer: `compileF(parse("z*z+a"))` still emits
`cvec a = vec_(uA.x, uA.y);`; `makeComplexFn(parse("z+a"), [3,0])` still binds `a = 3` and defaults to `0`; the
equality / df64 codegen is untouched. The new surface (`freeParameters`, the param map, `params`) is **purely
additive** — reached only when a caller opts in — so CD exercises none of it. Carrying the param map into `f(...)`
recursion is the one place the generalization had to be more than cosmetic: without it, a named parameter used
inside a self-referential `f(...)` call would resolve on the GPU (the alias re-emits at the top of `fFn`) but
throw on the CPU — a silent dual-backend split; with it, both agree.

### Consequences

- **Easier:** the plotter auto-detects parameters (`freeParameters`) and binds each to a `uParam_<name>` uniform;
  the animation variable `t` (G2) and parameter sweeps (G4) are named parameters with a driver, not new machinery;
  every parameterized map is still one compiled program per formula, re-uniformed as controls move.
- **Harder:** the JS side now has two calling conventions — documented (`Complex` = legacy `a`, object = named
  map); a parameter the host forgets to include in `params` compiles to an undeclared GLSL identifier — by design,
  since the host passes `freeParameters(ast)`, which lists exactly them.
- **Unchanged:** convention-neutrality ([ADR-0006](#adr-0006-convention-neutral-core-packages)) — parameters are
  values, no π / 2πi normalization enters a package; and the reserved formals `z`, `c`.
- **Watch for:** mixing the two uniform schemes in one program — the `a → uA` alias is legacy-only; the plotter
  names every parameter `uParam_<name>` (never `uA`).

### Action Items

1. [x] `freeParameters(ast)` in `ast.ts`; the named-parameter map + legacy `Complex`-positional `a` in
       `evaluate.ts` (scope seed + `f(...)` recursion); `CompileOptions { params }` + general `uParam_<name>`
       aliases (legacy `a → uA` default) in `glsl.ts`. Guarded by CD's `expr` / `glslCodegen` and expr's `paramA`
       suites green before & after. _(the commit introducing this ADR)_
2. [x] Plotter **G1** — auto-detected parameter controls (real slider on a segment; complex as a draggable ℂ-pad),
       each bound to a `uParam_<name>` uniform, refreshed without a recompile.
3. [x] Plotter **G2 / G4** — the reserved animation variable `t` (scrub / play / loop / speed) and parameter
       sweeps, as named parameters with a driver.
4. [x] Complex literals & extra constants — `2i`, `tau`, `phi`, `γ` (**B5**) — the small additive lexer / const
       growth that rides alongside.

---

## ADR-0012: The shared 3D slice — extract the `mat4` + quaternion core; keep the app-specific 3D local

**Status:** Accepted **Date:** 2026-08 **Deciders:** Andrew

_The follow-on that [ADR-0010](#adr-0010-complex-function-plotting-tool-as-a-separate-app) anticipated
(consequence (ii)): the **shared 3D slice**, decided now that Phase 5 has proven the API. On the
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) rule — with a **third** consumer, the rule
is unambiguously met — and mirroring [ADR-0008](#adr-0008-extract-casexact-leave-qds-sym-core-separate)'s
"extract the shared core, deliberately leave the app-specific piece local" posture. Build detail in
[the plan §1.6 / §4 / Phase 5](design/complex-function-plotter-plan.md)._

### Context

Three apps now carry 3D-math code. **Quadrature Domains** has `sphere-common.mjs` — a column-major `mat4`
kit plus `buildSphereMesh` for a **rendered mesh**. **Complex Dynamics** has `sphereView.ts` — a
**quaternion arcball** driving a **per-fragment ray-cast** sphere. The **plotter** (Phase 5) built
`render3d/` app-local per ADR-0007, deliberately **adapting QD's `mat4` kit + CD's arcball** rather than
importing (apps can't import apps): `mat4.ts` (ported from QD `sphere-common`), `camera.ts` (an orbit
camera), `mesh.ts`, `height.ts`, `surfaceShader.ts`, `sphere.ts` (quaternion + arcball, ported from CD
`sphereView`), and `sphereShader.ts`.

So the ADR-0007 second-consumer trigger is not just met but exceeded (three consumers). But the three kits
are **not one shape**: QD wants a mesh, CD a ray-cast, the plotter both plus a height/surface/orbit-camera
layer. What is genuinely **identical** across them — the part the plotter literally copied — is the
**linear-algebra + rotation core**: the column-major `mat4` / `vec3` ops and the quaternion + arcball
primitives. Everything above that (mesh builders, the height law, the surface / sphere fragment shaders, the
orbit-camera framing) is **app-specific display code**, not shared math.

### Decision

1. **Extract the stable core** — the column-major `mat4` / `vec3` kit and the quaternion + arcball primitives
   — **into `@cas/gpu`** (the GL substrate; the natural, convention-neutral home its index already reserves,
   per ADR-0010), as a new subpath (e.g. `@cas/gpu/mat4`). This is pure, dependency-free math with a golden
   corpus; the three consumers migrate to it.
2. **Keep app-local** the app-specific 3D: QD's `buildSphereMesh`, CD's ray-cast specifics, and the
   plotter's `mesh` / `height` / `camera` / `surfaceShader` / `sphereShader`. These diverge by design
   (mesh vs ray-cast vs surface); merging them would be a lowest-common-denominator kit with per-app
   branches — the symmetric half of ADR-0007 ("two engines are not merged without one needing it"). This is
   exactly ADR-0008's move: extract the shared core, leave the app-specific piece separate.
3. **Migrate incrementally, and DEFER the physical move** — do it test-guarded, **one consumer at a time**,
   as a dedicated follow-up, **not** in this commit. No consumer is currently blocked (each has a working
   app-local copy), so a big-bang three-app refactor mid-Phase-6 is an unwarranted speculative change
   ("working software at every step"; "ask before large refactors"). This ADR records **what** / **where** /
   **how**; the code moves when a consumer next touches its 3D path or on a focused extraction pass.

### Options Considered

- **A — Extract the `mat4` + quaternion core to `@cas/gpu`, keep app-specific 3D local, defer the physical
  migration (this ADR).** _Pros:_ removes the one genuine duplication (identical math the plotter copied);
  honours the ADR-0007 trigger without over-reaching into code that legitimately differs; keeps every app
  shippable throughout. _Cons:_ the duplication lives on until the deferred migration lands — a tracked debt,
  not a silent one.
- **B — Extract the _entire_ 3D slice** (mesh + camera + shaders too) into one package. _Cons:_ the apps'
  needs diverge (ray-cast vs mesh vs surface), so the package becomes a lowest-common-denominator with
  app-specific flags — coupling three apps to one another's display choices for no shared benefit. Rejected
  on the ADR-0007 symmetric rule.
- **C — Never extract; keep three copies.** _Cons:_ the `mat4` / quaternion math is byte-for-byte the same
  (the plotter ported it verbatim); three copies is exactly the drift the second-consumer rule exists to
  stop. Rejected — but the _timing_ is what's deferred, not the decision.
- **D — Do the physical extraction now.** _Cons:_ touches all three apps at once while none is blocked;
  a large, speculative, mid-phase refactor. Rejected on working-software grounds.

### Trade-off Analysis

The tension is ADR-0007's "extract on the second consumer" versus "don't over-reach / working software at
every step." The resolution is to **split the slice**: the part that is genuinely one thing (the `mat4` /
quaternion math) gets a decided home in `@cas/gpu`; the parts that are three things (mesh / ray-cast /
surface) stay where they are. That keeps the extraction **small, pure, and low-risk** when it happens, and
avoids inventing a shared abstraction over code that isn't actually shared. Deferring the physical move
trades a little living duplication for zero mid-phase churn across three shipping apps — the debt is explicit
(this ADR + its action items), so it is tracked, not silent.

### Consequences

- **Easier (once migrated):** one audited `mat4` / quaternion implementation with a golden corpus; new 3D
  work in any app builds on it; the plotter's `render3d/mat4.ts` and the quaternion half of `sphere.ts`
  collapse to imports.
- **Harder / watch for:** until the migration lands, the `mat4` / quaternion code exists in QD, CD, and the
  plotter — keep them in sync by hand (a change to the rotation math must touch all three), and treat any
  divergence as a bug the extraction will fix. Convention-neutrality holds: this is display / geometry math,
  no π / 2πi enters a package ([ADR-0006](#adr-0006-convention-neutral-core-packages)).
- **Unchanged:** the app-specific 3D (mesh, height, camera, shaders) stays app-local by design; no app
  imports another.

### Action Items

1. [x] Record the decision (this ADR): extract the `mat4` + quaternion / arcball core to `@cas/gpu`; keep
       app-specific 3D local; migrate incrementally, physical move deferred. _(the Phase-6 6D commit)_
2. [ ] Add `@cas/gpu/mat4` (column-major `mat4` / `vec3`) + a quaternion / arcball module, with a golden
       corpus, without touching any consumer yet.
3. [ ] Migrate the plotter's `render3d/mat4.ts` and the quaternion half of `render3d/sphere.ts` to the new
       subpath — test-guarded (`render3d` / `sphere` suites green before & after).
4. [ ] Migrate QD's `sphere-common.mjs` `mat4` kit and CD's `sphereView` quaternion core, one at a time,
       each behind its existing tests. Leave the mesh / ray-cast / surface code app-local.

---

## ADR-0013: The Riemann-map tool is a new app, not a mode in an existing one

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*A follow-on of the kind [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)
anticipated — a topology decision, occasioned by the first substantive build of a **new** tool
(the research-grade Riemann-map / conformal-mapping studio). It is the mirror image of
[ADR-0009](#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics): 0009 kept a
conformal-map feature *inside* Complex Dynamics; this one puts a broader conformal-map tool in its
*own* app. The two are consistent, for the reason spelled out below.*

### Context
The suite already touches Riemann maps in two places. Complex Dynamics builds a Riemann map φ
(presets + a custom unbounded-Laurent form) and reflects it into the σ **peer view**
([ADR-0009](#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics)); Quadrature
Domains carries closed-form parametric conformal maps (Faber / inverse-problem data) and its own
Schwarz machinery. So a fair question is whether a new Riemann-map tool should be **(A)** a new app,
**(B)** a peer view inside Complex Dynamics (as σ is), or **(C)** a mode inside Quadrature Domains.

The deciding fact is *scope*. The new tool's headline is a broad, **new** capability neither existing
app has: multiple **numerical construction engines** — lightning/rational (AAA + Vandermonde–Arnoldi),
Schwarz–Christoffel, the zipper/geodesic algorithm, kernel / integral-equation methods, and Böttcher
uniformization — plus a large visualization, conformal-invariant, and publication-export surface. None
of that numerical-construction machinery exists anywhere in the suite yet: there is (as the research
phase confirmed) essentially **no research-grade JS/TS conformal-mapping code** to reuse. CD's φ is a
narrow *recipe* (a Laurent form it reflects into σ), not a general constructor; QD's maps are
closed-form solutions of the *inverse quadrature-domain* problem, not a boundary→map solver. The new
tool is a from-scratch construction studio that happens to render and analyze conformal maps — not a
reflection of a map an existing app already owns.

### Decision
Build it as a **separate app, `apps/riemann-map`**, a peer to the three existing apps, on the shared
`@cas/*` packages, listed on the launcher — consistent with
[CLAUDE.md decision #8](../CLAUDE.md) (separate apps + a unified menu; **no** unified single-page
shell). It **imports** a φ handed off from Complex Dynamics, and can hand maps back, via
[`@cas/interchange`](INTERCHANGE.md); but it **owns** the general construction engines CD and QD lack.
It is **not** a mode inside CD or QD.

### Options Considered

#### Option A: A new standalone app `apps/riemann-map` (this ADR)
| Dimension | Assessment |
|---|---|
| Fit with scope | High — room for many construction engines + analysis + export without bloating a host app |
| Reuse | High — pulls the `@cas/*` stack *downward*; adds only genuinely new numerics |
| Suite shape | Matches decision #8 (separate apps + launcher); the north-star "each new tool builds fewer primitives from scratch" |

**Pros:** the broad new surface has a natural home; independent build/deploy; the CD/QD hand-off stays
a clean **data contract** (interchange), not a code coupling; keeps each app simple and shippable.
**Cons:** a fourth app to maintain; "conformal map" now appears in two apps (CD's φ/σ and this one),
so the boundary between them must be kept honest.

#### Option B: A peer view inside Complex Dynamics (like σ, ADR-0009)
**Pros:** reuses CD's engine/coloring/interaction directly; σ already validated the peer-view shape.
**Cons — and why rejected:** σ earned its place *inside* CD precisely because it **shares CD's
foundation** — it is a thin reflection of a φ CD already builds, with the map-specific instruments
(rays, Böttcher, matings) explicitly out of scope (ADR-0009). The Riemann-map tool is the opposite: its
value is a large body of **new construction/analysis/export** machinery that CD's `f(z,c)` escape-time
pipeline does not provide and that would swell CD's already ~5k-line `main.ts`. A view is the right
shape for something that *reuses* a host app's engine; an app is the right shape for something that
*brings its own*.

#### Option C: A mode inside Quadrature Domains
**Pros:** QD is the suite's closest existing conformal-map surface (Faber, Schwarz function).
**Cons:** QD's maps are closed-form solutions of the inverse *quadrature-domain* problem in a
gradually-typed JS codebase; grafting a general numerical boundary→map studio (in strict TS, on the
shared packages) onto it couples two very different tools and inherits QD's conventions
([ADR-0006](#adr-0006-convention-neutral-core-packages) territory). Rejected for the same
scope/foundation reason as B.

### Trade-off Analysis
This is **not** in tension with [ADR-0009](#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics);
it applies the same test and gets the opposite answer because the input is opposite. ADR-0009's own
rule: a feature that **shares** a host app's engine, coloring, interaction, and import path belongs
*inside* that app as a view; one that would **re-duplicate** primitives or bring a large independent
surface belongs in its own app (that ADR rejected a *separate* σ app for exactly that reuse reason).
σ shares CD's foundation, so it is a view; the Riemann-map studio brings its own construction engines
and reuses only the **packages** (downward), so it is an app. Decision #8 is the standing suite
topology, and a genuinely new tool of this breadth is precisely what it is for. The honest cost —
a fourth app, and "conformal map" living in two apps — is bounded by keeping CD's φ narrow (its σ
recipe) and letting the new app own general construction, with the interchange hand-off as the seam.

### Consequences
- **Easier:** giving the tool's broad engine/analysis/export surface a home without bloating CD;
  reusing `@cas/*` downward (north-star); independent deploy; a clean CD↔riemann-map (and QD)
  hand-off as a versioned **data contract** rather than a cross-app import (which the dependency rule
  forbids anyway — [ARCHITECTURE §4](ARCHITECTURE.md#4-the-dependency-rule)).
- **Harder:** a fourth app to maintain; two homes for "conformal map" (CD's φ/σ and this app) whose
  boundary must be kept honest; a shared **numeric-linear-algebra** seam (QR/Arnoldi/FFT/quadrature)
  will likely want extraction once a second consumer appears — its own follow-on ADR
  ([ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)), with QD's in-app
  `houseQR`/`condEst`/Newton as the standing candidate.
- **Watch for:** duplication drift between CD's φ builder and the new app's map input. Keep CD's φ to
  its σ recipe; let the new app own general construction; the interchange hand-off is the seam, not
  copied code.
- **Revisit if:** the new app and CD's φ/σ converge enough that one should consume the other — then
  extract the shared piece into a package (ADR-0007), rather than merging the apps.

### Action Items
1. [x] Scaffold `apps/riemann-map` on the shared packages — P0 Genesis: the empty, tested, deployable
       shell (Vite/TS, the single serializable view-state over `@cas/interchange`, node parity-seed
       tests, launcher "Coming soon" card; local `lint`/`typecheck`/`test`/`build` gate green).
2. [ ] Wire the Complex-Dynamics → riemann-map φ hand-off through `@cas/interchange` (plan Phase 2).
3. [ ] Record the **numeric-linear-algebra seam** and the **`@cas/interchange` extension** (new
       `MapSpec` variants, minor version bump) as their own follow-on ADRs when they materialize
       (plan Phases 2–3).

---

## ADR-0014: Extract `@cas/dynamics` on the second-consumer rule (Riemann Map)

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*An *extraction* follow-on in the mould of [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate),
and the genesis of the long-planned `@cas/dynamics` domain package
([ARCHITECTURE §3](ARCHITECTURE.md#3-what-each-package-owns), previously "never built"). It is
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) working exactly as designed: a package
comes into being the moment a **second consumer** needs it — here, the Riemann-map app's P2 (Böttcher /
dynamics Riemann maps).*

### Context
Complex Dynamics' `src/render/uniformize.ts` is the suite's inverse-Böttcher engine: the Laurent
coefficients ψ(w) = γ₁·w + Σ b_k w^{-k} that uniformize the **complement of a filled Julia set** for the
z^d + c / general-polynomial / rational families (and the exterior map of the multibrot connectedness
locus), plus the capacity γ₁ (leading coefficient), a connectivity test, and boundary reconstruction.

The Riemann-map app's P2 needs exactly this — capacity, the exterior-map coefficients, the boundary
overlay, and the Complex-Dynamics ↔ Riemann-map hand-off (emit a Julia exterior as an interchange
`LaurentMap`). That is a **second consumer**. The [dependency rule](ARCHITECTURE.md#4-the-dependency-rule)
forbids an app importing another app, so reuse means *extract to a package* — and `uniformize.ts` is
already package-shaped: **pure** (depends only on `@cas/core` + `@cas/expr`, no DOM/GL/CD-internal
coupling), and already covered by 31 unit tests.

### Decision
Extract `uniformize.ts` and its two test files into a new **`@cas/dynamics`** package (its genesis),
consumed by Complex Dynamics (behavior unchanged) and Riemann Map. Moved with `git mv` (history
preserved, per the provenance guardrail); the **only** code change is the type import
`../complex` → `@cas/expr` (the identical `[re, im]` tuple). **Scope it minimally:** only the
exterior-Böttcher machinery moves now. **External-ray tracing (`rays.ts`) stays in Complex Dynamics**
until the Riemann-map app actually draws external rays (P2c) — at which point it is the second consumer
of *that* module and the extraction is recorded as a follow-on. Escape-time, cycle classification, and
the Tricorn model space likewise stay app-local until a second consumer forces them.

### Options Considered

#### Option A: Extract `@cas/dynamics` (this ADR)
**Pros:** the code is already pure, tested, and downward-only, so the move is mechanical and
behavior-preserving; a fix lands once for both apps; unlocks capacity / coefficients / boundary / the
interchange hand-off in Riemann Map; realizes the planned domain package on real evidence rather than
up-front speculation. **Cons:** "the Böttcher engine" now lives outside the app that authored it (a reader
of CD follows one import); a sixth `@cas/*` package.

#### Option B: Reimplement the inverse-Böttcher series in the Riemann-map app
**Pros:** no change to Complex Dynamics. **Cons:** duplicates ~370 lines of the most delicate,
correctness-critical math in the suite (a triangular series recursion whose every capacity/coefficient
claim depends on it); a bug would be fixed once and survive once — precisely the drift the monorepo
exists to prevent. Rejected against the north star.

#### Option C: Import Complex Dynamics from the Riemann-map app
**Pros:** none beyond "no new package". **Cons:** violates the one graph rule the architecture actively
enforces (no app imports another app — ESLint + dependency-cruiser). Rejected on principle.

### Trade-off Analysis
This is the cheapest possible extraction (a pure, already-tested module with one type-import edit) against
the highest-value seam (the exterior Riemann map is *the* object both apps share). The only real cost —
a sixth package and a moved file — is exactly the cost ADR-0007 accepts in exchange for single-sourcing
shared mathematics. Keeping `rays.ts` and the rest of the dynamics surface app-local for now honors the
same rule symmetrically: don't extract what has only one consumer yet.

### Consequences
- **Easier:** Riemann Map builds capacity / coefficient / boundary readouts and the CD hand-off on a
  shared, tested kernel; a Böttcher-math fix lands once; the domain package finally exists to grow into.
- **Harder:** the inverse-Böttcher engine is one hop from Complex Dynamics now (mitigated: `@cas/dynamics`
  is small and its README/exports name the surface); a sixth package to hold in mind (the suite ships
  **six** shared packages now, not five).
- **Watch for:** `rays.ts` — the obvious next extraction, gated on Riemann Map drawing external rays
  (P2c). Record it as a follow-on then, not before.
- **Revisit if:** a third consumer or the rest of the planned dynamics surface (escape-time, ray tracing,
  cycle/multiplier classification, the Tricorn model space) is needed — grow `@cas/dynamics` accordingly.

### Action Items
1. [x] `git mv` `uniformize.ts` + its two tests into `packages/dynamics`; retarget the `../complex`
       type import to `@cas/expr`. Verified: `@cas/dynamics` typecheck + 31 tests + lint green.
2. [x] Rewire Complex Dynamics (`main.ts`, `render/juliaProperties.ts`, `render/overlay.ts`) to
       `@cas/dynamics`; add the dependency to Complex Dynamics and Riemann Map; register the package in
       `vitest.workspace.ts` and the test-census gate. Verified: full workspace lint / typecheck / test
       (288 files across 11 projects) / build green — behavior-preserving.
3. [ ] Build Riemann Map's capacity / exterior-coefficient / boundary-overlay readouts on it (P2b).
4. [x] Extract the **external-ray tracing** from `rays.ts` to `@cas/dynamics` when Riemann Map draws
       external rays (P2c). Done as a clean split: the pure z²+c ray-tracing (`parameterRay`, `dynamicRay`,
       `rayDepthForZoom`, `parseAngle`) moved to the package; CD's `render/rays.ts` became a re-export
       shim keeping only `bulbRayAngles` (which needs CD's orbit-portrait combinatorics). Verified
       behavior-preserving — CD's `rays.test.ts` + `yoccozCritical.test.ts` pass unchanged through the shim.

---

## ADR-0015: Extract `@cas/core/poly` + `format`; float-only, exact stays in `@cas/exact`

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*A follow-on extraction ADR, as [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) asks for
notable ones — the latest, after [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate), [ADR-0012](#adr-0012-the-shared-3d-slice--extract-the-mat4--quaternion-core-keep-the-app-specific-3d-local), and [ADR-0014](#adr-0014-extract-casdynamics-on-the-second-consumer-rule-riemann-map).*

### Context
The Quadrature app's `app/core/poly-helpers.mjs` bundles two unrelated things (its own header admits the
second only co-locates for load-order): **`QD.Poly`**, dense polynomial arithmetic over complex coefficients
(ascending-power `Complex[]`: zero/one/variable/trim/add/neg/mul/scale/pow/linearPower), and **`QD.Format`**,
Unicode sub/superscript label rendering. A consumer sweep found the drift [ADR-0001](#adr-0001-monorepo-over-multi-repo)
named ("multiple root-finders") in full flower: **five** codebases besides QD each re-roll dense-poly
coefficient arithmetic — `@cas/schwarz` (the σ⁻¹ cleared-polynomial build), `@cas/expr` (`rational.ts`, a
near-complete duplicate that feeds three CD sites), `apps/correspondences`, and `apps/complex-dynamics`
(matingEngine / critical / perturbation / uniformize / dynatomic). The generic **root-finder is already
shared** (`@cas/core`'s `makeDurandKerner(alg)` takes an eval closure); what every site still re-rolls is the
**coefficient-array layer around it** — build, Horner-eval, monic-normalize, trim. The `QD.Format` copy had
likewise drifted into `@cas/schwarz` (`singularities.ts`) and Complex Dynamics (`schwarzExplicitForm.ts`).
Both primitives clear the second-consumer bar many times over.

### Decision
**Extract to `@cas/core`**: `poly.ts` — `makePoly<C>(alg: ComplexAlgebra<C>)`, written once against the
representation-genericity keystone (so QD's `objAlgebra {re,im}` and CD/schwarz's `tupleAlgebra [re,im]`
share one implementation, exactly as `durand-kerner.ts` / `series.ts` are) — plus `eval` (Horner) and
`monic`, the coefficient-array glue the non-QD consumers wrapped around the solver; and `format.ts` —
`subscript` / `superscript`. The degree-**preserving** trimming convention is carried verbatim (add/mul/scale
do NOT trim; `trim` is separate — the σ⁻¹ root count is the degree; silently trimming would drop roots).

**Scope boundary — float only.** `@cas/core/poly` is `Complex[]`-over-`ComplexAlgebra`. The **exact**-ring
polynomial consumers (`@cas/exact`'s `qiPoly`/`biPoly`, `correspondences`' exact curve/deltoid) stay in
`@cas/exact` — a different ring and shape, the same "two engines for two shapes" call
[ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) made for `sym-core`, and symmetric with
ADR-0007's don't-merge-without-a-consumer rule (nothing needs one poly type spanning both fields).

**Incremental, need-driven.** P1 (this commit) lands the two modules with a golden corpus, converts QD's
`poly-helpers.mjs` to a **byte-identical shim** over `makePoly(objAlgebra)` (the frozen classic `.js` twin,
still vm-loaded in the legacy suite, is a live parity check of exactly that), and refactors `@cas/schwarz` as
the **proving second consumer** (its σ⁻¹ cleared-polynomial build now uses `poly.eval`/`trim`/`monic`;
`singularities.ts` uses `format.subscript`). The remaining float consumers (`@cas/expr/rational`, then the CD
matingEngine/critical/perturbation and correspondence sites) peel onto `poly` one test-guarded PR at a time,
as ADR-0008 grew `@cas/exact` — **not** in a speculative big-bang.

### Options Considered
- **A — float `@cas/core/poly` + `format`, incremental (this ADR).** *Pros:* generic over the existing
  keystone; kills the most-duplicated numeric primitive in the suite; each consumer converts test-guarded and
  shippable alone. *Cons:* a temporarily heterogeneous set of consumers (some on `poly`, some still rolling
  their own) until the later phases land.
- **B — a ring-generic poly to absorb the exact consumers too.** *Rejected:* speculative abstraction over a
  general ring for a job the float and exact sides don't share; trades a real guarantee (the exactness engine
  is correctness-critical) for a tidier diagram — the same reasoning that rejected merging `sym-core` in
  ADR-0008.
- **C — leave the copies.** *Rejected:* it is precisely the drift the monorepo exists to end.

### Consequences
- **Easier:** one dense-poly kernel behind the shared solver; a bug fixed once; new σ / correspondence math
  reaches for `@cas/core/poly` instead of re-rolling a Horner loop.
- **Harder:** the mixed-state interval while consumers convert; two poly worlds (float in `@cas/core`, exact
  in `@cas/exact`) that a reader must keep straight — named here rather than explained away.
- **Revisit:** if a genuine need ever arises for one polynomial type over both fields (none does today).

### Action Items
1. [x] `poly.ts` + `format.ts` in `@cas/core` with a golden corpus; QD shim (bit-identical); `@cas/schwarz`
   converted as the proving consumer (**P1**).
2. [ ] Peel `@cas/expr/rational` and the CD / correspondences float consumers onto `poly`, one test-guarded
   PR each (**P2–P3**, need-driven).
3. [ ] `uniformize.ts`'s truncated `Series` is a cousin of `@cas/core/series.ts` — a related but separate
   consolidation, scoped on its own.

---

## ADR-0016: Extract `@cas/export` — shared PNG `tEXt` metadata (+ shared GLSL snippets)

**Status:** Accepted

### Context
Three apps — Complex Dynamics, the Complex-Function Plotter, and the Riemann-map studio — each carried
their own copy of the "a figure carries its own recipe" mechanism: after a canvas is encoded to PNG, splice
a `tEXt` chunk (the permalink / parameters) in front of `IEND` with a correct CRC-32, without touching a
pixel. CD's and CFP's copies were byte-for-byte equivalent (a `Record<string,string>` API); RM's was a
near-twin with a different single-pair API (`injectPngText(png, keyword, text)`) and `& 0xff` Latin-1
wrapping instead of `?`-coercion. Three independent copies of the same byte-manipulation is well past the
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) second-consumer bar. Separately, a shader
sweep found three GLSL strings re-declared verbatim across renderers: the trivial fullscreen-triangle
vertex program (**7** copies), the HSV→RGB helper (**2**), and the fragment-coord → complex-plane viewport
map (**4**).

### Decision
**Extract `@cas/export`** (an eighth `@cas/*` package): PNG `tEXt` metadata as a canonical Record API —
`crc32`, `pngChunk`, `injectPngText(png, entries)`, `readPngText(png)`, `PNG_SIGNATURE`. CD's version is
promoted as canonical (keyword truncation to 79 bytes, `?`-coercion for non-Latin-1); RM is migrated onto
it (its two nested single-pair calls collapse to one Record call per export path). Convention-neutral per
[ADR-0006](#adr-0006-convention-neutral-core-packages) — this is byte manipulation, no `π`/`2πi`, indeed no
mathematics. Consumers: Complex Dynamics, Complex-Function Plotter, Riemann Map.

**Companion (same rule, existing package):** the three shared GLSL snippets move into the
`@cas/gpu/glsl` barrel — `FULLSCREEN_VERTEX_GLSL` (with `layout(location = 0)`, harmless for the
`getAttribLocation` consumers and required by CD's explicit-index bind), `HSV2RGB_GLSL`, and
`PLANE_FROM_FRAG_GLSL` (a `planeFromFrag()` function, concatenated after `COMPLEX_SINGLE_GLSL` which defines
the `cvec`/`vec_` aliases it uses). Centralising the viewport map is load-bearing: it is the one convention
("which pixel is which complex number") the plane renderers must agree on.

### Options Considered
- **A — extract `@cas/export` + fold the GLSL snippets into `@cas/gpu` (this ADR).** *Pros:* one PNG-metadata
  kernel; one fullscreen-vertex/viewport-map source of truth; each is pure and node/GPU-tested. *Cons:* an
  eighth package for a small surface.
- **B — the never-built `@cas/ui` bundle** ([ARCHITECTURE §3](ARCHITECTURE.md)) that would have carried PNG
  metadata *and* the KaTeX/inspector/theming helpers. *Rejected:* only the PNG-metadata and GLSL halves have
  proven (multi-consumer) demand; the UI helpers still do not. Extract the part with consumers, not the bundle.
- **C — leave the copies.** *Rejected:* three drifting copies of a CRC-bearing byte format is exactly the
  drift the monorepo exists to end.

### Consequences
- **Easier:** a PNG-metadata bug fixed once; a new export reaches for `@cas/export`; the fullscreen vertex and
  the pixel→plane convention live in one place. `@cas/export` is also the natural home for the medium-term
  high-res / SVG export goal.
- **Harder:** one more package in the graph. The [ARCHITECTURE.md](ARCHITECTURE.md) "`@cas/ui` never built"
  note is now only half-true — its PNG-metadata half shipped here.

### Action Items
1. [x] `@cas/export` with `png.ts` + golden test; census / workspace / dep wiring; CD / CFP / RM migrated.
2. [x] `FULLSCREEN_VERTEX_GLSL` / `HSV2RGB_GLSL` / `PLANE_FROM_FRAG_GLSL` added to `@cas/gpu/glsl`; all 7 / 2 / 4
   consumers migrated; a real-WebGL2 compile of the assembled shaders confirms the extraction.

## ADR-0017: The Complex-Dynamics → Riemann-Map hand-off; Riemann Map becomes a pure-2D conformal consumer

**Status:** Accepted — **supersedes the RM-consumer premise of [ADR-0014](#adr-0014-extract-casdynamics-on-the-second-consumer-rule-riemann-map), narrows [ADR-0013](#adr-0013-the-riemann-map-tool-is-a-new-app-not-a-mode-in-an-existing-one)**

### Context
[ADR-0013](#adr-0013-the-riemann-map-tool-is-a-new-app-not-a-mode-in-an-existing-one) gave the Riemann-map
studio its own identity; [ADR-0014](#adr-0014-extract-casdynamics-on-the-second-consumer-rule-riemann-map)
made it the second consumer of Complex Dynamics' inverse-Böttcher machinery (`@cas/dynamics`) so it could
compute a filled Julia set's exterior map, capacity, external rays, and render an escape-time Green's-function
field. In practice this made RM a jack-of-all-trades that **re-computed dynamics Complex Dynamics already
owns**, and carried a generic phase / distortion / checker domain-coloring render pipeline that overlaps the
Complex-Function Plotter's job. Crucially, the exterior Böttcher map ψ(w) = γ₁·w + Σ bₖ·w⁻ᵏ is **exactly** the
interchange `LaurentMap` shape, so it can be handed between tools with **no schema change**.

### Decision
Make **one tool own dynamics**. Complex Dynamics gains its first interchange **producer** (`exportMap.ts`, the
app's first `encodeLink` use): a "Riemann Map ↗" action exports the current Julia set's Böttcher map as a
`kind:"map"` `LaurentMap` deep link. Riemann Map gains a **consumer** (`importMap.ts`) and an "import"
disk-image source that renders the received ψ as an ext(𝔻) → ext(·) pushforward. RM then **sheds its whole
dynamics + GPU stack**: the escape-time Julia render mode, the dynamics analysis panel, external rays, the
Green's function, its own local Böttcher computation and interchange *producer*, the generic domain-coloring
render modes, and the entire WebGL fragment pipeline. RM is now **pure-2D** and consumes only `@cas/core`,
`@cas/export`, `@cas/expr`, and `@cas/interchange`. A cross-app golden `CD_TO_RM_BOTTCHER_LINK` (in
`@cas/interchange`) pins the producer and consumer to the same bytes. Honest labeling is preserved: the
capacity γ₁ is exact, the tail bₖ are `≈` truncated-series estimates, carried in the payload's provenance note.

This **supersedes** ADR-0014's premise that RM is a live `@cas/dynamics` consumer (RM dropped the dependency;
`@cas/dynamics` is now a single-consumer package — Complex Dynamics — which per
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) does not *force* a re-merge, but is recorded
here), and **narrows** ADR-0013: RM no longer owns dynamics or domain-coloring — it owns *images of regions
under conformal maps, and the construction of those maps*.

### Options Considered
- **A — hand-off + full cut (this ADR).** *Pros:* one owner for dynamics; RM's identity sharpens to the
  conformal tool; RM drops `@cas/dynamics`, `@cas/schwarz`, and `@cas/gpu`; no schema change (the format
  already carried the map). *Cons:* a researcher can no longer compute a Julia set's Böttcher map *inside* RM
  — they round-trip through Complex Dynamics (typing a plain exterior map still works via the expression source).
- **B — keep RM computing dynamics locally alongside the import.** *Rejected:* duplicates Complex Dynamics,
  blurs the two tools' identity, and keeps `@cas/dynamics` in RM for a job another tool already does.
- **C — keep the generic domain-coloring modes (retain the GPU pipeline).** *Rejected:* phase / distortion /
  checker portraits are the Complex-Function Plotter's domain (independent code, a clean product cut, not a
  dedup), and those modes are the *only* consumer of RM's fragment shader — keeping them orphans nothing, but
  removing them orphans the whole GPU stack, so it goes too. The domain-coloring shader is not reusable for a
  future conformal-image GPU render (that would be a different shader).

### Consequences
- **Easier:** RM is a lean, pure-2D studio (source region + its conformal image in linked canvas panes); no
  WebGL, so the "WebGL2 unavailable" failure mode is gone; the suite has a worked example of the interchange
  keystone carrying a map *between* two tools in the CD → RM direction (the mirror of QD → CD).
- **Harder:** `@cas/dynamics` is now single-consumer (a weaker extraction rationale, recorded not reversed);
  the exterior-map *authoring* that used to live in RM now requires Complex Dynamics.
- **Revisit:** if a second `@cas/dynamics` consumer never re-materialises and the package becomes maintenance
  drag, ADR-0007's symmetric "don't split without two" would invite folding it back into Complex Dynamics —
  not done now (it is small, correct, and green).

### Action Items
1. [x] **B1** — CD producer (`exportMap.ts` + "Riemann Map ↗" deep-link button); cross-app golden.
2. [x] **B2** — RM consumer (`importMap.ts`) + the "import" disk-image source (deep-link on boot + paste).
3. [x] **B4** — RM sheds the Julia render mode, dynamics analysis, rays, local Böttcher + its producer; drops
   `@cas/dynamics` and the dead `@cas/schwarz`.
4. [x] **C** — RM drops the generic domain-coloring modes and the whole GPU fragment pipeline; drops `@cas/gpu`;
   renders pure-2D.
