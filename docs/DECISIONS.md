# Architecture Decision Records

Each record captures one decision: its context, the options considered, the trade-off,
and the consequences. ADRs are **append-only** — when a decision changes, add a new ADR
that *supersedes* the old one; do not silently rewrite an accepted record. This is how
the "why" survives for future-you.

Format follows Michael Nygard's ADR convention.

| # | Decision | Status |
|---|---|---|
| [0001](#adr-0001-monorepo-over-multi-repo) | Monorepo over multi-repo | Accepted |
| [0002](#adr-0002-typescript-as-the-common-language) | TypeScript as the common language | Accepted |
| [0003](#adr-0003-give-quadrature-domains-a-build-step-vite) | Give Quadrature Domains a build step (Vite) | Accepted |
| [0004](#adr-0004-package-manager-pnpm-workspaces) | Package manager: pnpm workspaces | Accepted |
| [0005](#adr-0005-expr--interchange-as-the-map-representation-keystone) | `expr` + `interchange` as the map-representation keystone | Accepted |
| [0006](#adr-0006-convention-neutral-core-packages) | Convention-neutral core packages | Accepted |
| [0007](#adr-0007-incremental-extraction-driven-by-real-need) | Incremental extraction driven by real need | Accepted |
| [0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) | Extract `@cas/exact`; keep QD's `sym-core` separate | Accepted |
| [0009](#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics) | Schwarz reflection (σ) is a first-class peer view in Complex Dynamics | Accepted |

> **Status legend:** Proposed → Accepted (once you sign off) → Superseded/Deprecated.
> All nine are **Accepted**. ADRs 0001–0007 are the up-front decisions (recorded in
> [`CLAUDE.md`](../CLAUDE.md) and [RISKS §Decisions](RISKS.md#open-questions-decisions-needed-from-you));
> **0008 is the first *follow-on*** — a decision made during the build, which
> [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) explicitly asked to be recorded
> this way. Expect more of that shape than of the original seven. **0009 is another follow-on**, of a
> different kind — a UI/product decision (σ becomes a first-class peer *view* in Complex Dynamics), not an
> extraction.
> Supersede rather than rewrite if any change later.
>
> **✅ Executed.** The seven up-front decisions were carried out — the
> [migration runbook](MIGRATION.md) ran to completion — with two conscious deviations recorded
> inline in the Action Items below:
> (1) **ADR-0005's *multivalued* `expr` / `interchange` extension was not built** — the
> Correspondences app enumerates correspondence branches with its own engine, so no second
> consumer ever forced a shared branch-aware representation (which is precisely the
> [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) rule at work); the keystone
> shipped through the single-valued case. (2) **ADR-0006's convention-neutrality is enforced by
> construction** (the kernel simply carries no normalization constants) rather than by a
> dedicated CI guard test.

---

## ADR-0001: Monorepo over multi-repo

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

### Context
Two mature apps (Complex Dynamics, Quadrature Domains) share substantial *conceptual*
surface that is currently duplicated across two repos: complex arithmetic, Durand–Kerner
root-finding (in several places), formal-series recurrences, WebGL escape-time kernels,
Riemann-sphere renderers. A third app (correspondences) is imminent and needs pieces
from *both* existing apps. The goal is a suite where each new tool reuses shared code
and tools can hand data off to one another.

### Decision
Host all apps and shared packages in a **single monorepo** (`packages/*` + `apps/*`)
with workspace-linked internal dependencies.

### Options Considered

#### Option A: Monorepo (workspaces)
| Dimension | Assessment |
|---|---|
| Complexity | Medium (one build/test config to learn) |
| Cost | Migration of QD into the workspace |
| Scalability | High — new tools drop in as apps |
| Solo-dev fit | High — one committer, no cross-repo coordination |

**Pros:** single source of truth for shared code; atomic cross-cutting changes (fix a
primitive and all consumers update in one commit); trivial internal deps
(`workspace:*`, no publishing); one place to run tests/lint/build. **Cons:** one large
repo; shared tooling must accommodate two currently-different build setups.

#### Option B: Multi-repo + published shared library
| Dimension | Assessment |
|---|---|
| Complexity | High (versioning + release across repos) |
| Cost | Per-package build + publish + version-pin in each consumer |
| Scalability | Low for a solo dev — coordination tax per change |
| Solo-dev fit | Low — version churn dominates |

**Pros:** apps stay fully independent; shared lib could be independently useful.
**Cons:** every shared-code change becomes publish-a-version-then-bump-consumers; a
cross-cutting change spans multiple PRs across repos; heavy tax for one developer.

#### Option C: Status quo (two repos, copy-paste)
**Pros:** zero coordination. **Cons:** the duplication *drifts* — the failure mode we
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

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

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
generic interfaces (the `interchange` schema); the Dynamics app would have to *drop* to
JS or straddle two type systems. Weaker guarantees at exactly the boundaries that
matter most. Rejected as the primary path.

#### Option C: JavaScript with runtime schema validation only (e.g. Zod) and no static types
**Pros:** runtime safety at hand-off. **Cons:** no compile-time safety inside/across
packages; you learn about breakage at runtime, not at build. (Note: runtime validation
of the `interchange` payload is still *worth adding on top* — see INTERCHANGE.md — but
not as a substitute for static types.)

### Trade-off Analysis
The suite's core promise is safe reuse and safe hand-off. Static types are the direct
mechanism for both, and one app is already TS. The only real cost is migrating the
other app — and that cost is bounded because full typing of app-internal UI glue is
*not required* for the contracts to be sound; only the shared packages and the
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

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

### Context
The Quadrature app is deliberately **no-build**: vanilla JS, runs from `file://` with
graceful degradation, a service worker, Web Workers bundled at runtime from source, and
a hand-rolled content-hash cache-buster (`version:sync`). That no-build property is a
genuine feature (zero-friction distribution, offline, drop-on-Pages). But it *blocks
code sharing*: a no-build app can only consume shared code as a pre-built artifact it
version-pins, which reintroduces exactly the multi-repo versioning tax
([ADR-0001](#adr-0001-monorepo-over-multi-repo)). The Dynamics app already uses Vite.

### Decision
Move the Quadrature app onto **Vite** (matching the Dynamics app). Do this as a
**bundler swap first, with the code still 100% JavaScript** (`allowJs`), and only
*then* migrate to TypeScript incrementally ([ADR-0002](#adr-0002-typescript-as-the-common-language),
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)).

### Options Considered

#### Option A: Vite, adopted as a bundler-swap first (code stays JS), TS later
| Dimension | Assessment |
|---|---|
| Complexity | Medium (ESM-ify the `QD.*` namespace / factory modules) |
| Risk | Low-medium — app keeps working; tests guard each step |
| Payoff | Unblocks direct workspace imports; one build per app |

**Pros:** collapses the awkward "pre-built ESM + version-pin" scheme into plain
`workspace:*` imports; replaces two hand-rolled systems with first-class ones (Vite
Web Workers via `new Worker(new URL(...), {type:'module'})`; `vite-plugin-pwa` for the
service worker + cache-busting); keeps static/offline/Pages deployability
(`base:"./"`). **Cons:** loses the `file://`-no-server dev convenience; requires
ESM-ifying the module system (the real work — see
[RISKS Hard Part 1](RISKS.md#hard-part-1-esm-ification-is-the-real-cost)).

#### Option B: Keep no-build; share code via a pre-built ESM artifact with SRI/version pins
**Pros:** preserves `file://`. **Cons:** reinstates per-package build + version pinning
+ artifact juggling — the multi-repo tax inside a monorepo. Self-defeating for the
sharing goal. Rejected.

#### Option C: A different bundler (esbuild/Rollup/webpack) for QD
**Pros:** possible. **Cons:** the Dynamics app is on Vite; using the *same* tool halves
the configuration surface and lets both apps share Vite config, plugins, and mental
model. No reason to diverge. Rejected in favor of Vite.

### Trade-off Analysis
The only meaningful thing given up is `file://`-without-a-server during development —
an acceptable trade for HMR, real tooling, and (decisively) the ability to import
shared packages directly. The static-hosting/offline properties that made no-build
attractive are *preserved* by Vite + `vite-plugin-pwa`, arguably more robustly than the
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

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

### Context
The monorepo needs a workspace-capable package manager. Both existing apps currently
use npm. This decision is **low-stakes and reversible** (switching managers is
mechanical), but it should be made deliberately.

### Decision
Use **pnpm workspaces**, pinned via Corepack.

### Options Considered

#### Option A: pnpm workspaces
| Dimension | Assessment |
|---|---|
| Speed / disk | Fast; content-addressed store, hard-linked — big win with two WebGL apps' heavy dep trees |
| Strictness | Strict by default — forbids phantom (undeclared) dependencies, which keeps the dependency-layering rule honest |
| Workspace protocol | First-class `workspace:*` |

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

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

### Context
Three otherwise-separate goals — code sharing, tool hand-off, and building the
correspondence tool — all converge on one artifact: a shared way to **represent and
evaluate a map**. The Dynamics app already has the executable half (its `src/expr`
compiler: one AST → GLSL + JS). No shared *serializable* representation exists.

### Decision
Treat map representation as **the** keystone, in two coordinated packages: **`expr`**
(the executable form — promoted from the Dynamics compiler) and **`interchange`** (the
serializable form). An `interchange` `MapSpec` compiles, via `expr`, into an executable
map. Extend both in stages: **single-valued now**, **multivalued/branch-aware later**.

### Options Considered

#### Option A: Promote `expr` + define `interchange`, staged single→multi-valued
**Pros:** the single-valued Schwarz-reflection hand-off works with today's `expr`
(early win, no new math); the multivalued extension is *the same* work that both hosts
the correspondence tool and later enables correspondence hand-off; one source of truth
for GLSL+JS evaluation across all tools. **Cons:** `expr` is deeply woven into the
Dynamics app (extraction is delicate); multivalued support is genuinely new design.

#### Option B: Each tool keeps its own map evaluation; hand-off via ad-hoc JSON
**Pros:** no extraction. **Cons:** every tool re-invents GLSL+JS evaluation; hand-off
formats drift; the correspondence tool starts from zero on the exact machinery that
already exists. Rejected — it forfeits the suite's whole point at its most valuable seam.

#### Option C: Serializable form only (`interchange`), no shared executable form
**Pros:** enables hand-off. **Cons:** each consumer still writes its own compiler to
*execute* a received `MapSpec` — duplicated GLSL/JS backends, the very thing `expr`
exists to prevent. Partial; rejected as insufficient.

### Trade-off Analysis
This is the highest-leverage extraction in the plan and also among the more delicate,
so it is sequenced *after* the easy `core` extraction and gated by the correspondence
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

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

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
**Pros:** less conversion for that app. **Cons:** the *other* app must convert on every
call, and any code that forgets is silently wrong; couples the kernel to one tool's
mathematics. Rejected.

#### Option C: Core is convention-free but conventions are *untagged* in interchange
**Pros:** simpler payloads. **Cons:** loses the defense-in-depth; a mis-converted
hand-off produces a plausible-looking but wrong picture with no signal. Rejected in
favor of tagging.

### Trade-off Analysis
The cost of Option A (conversion shims + discipline) is small and localized; the cost of
getting conventions wrong is a *silent* numerical error that could corrupt a research
figure. For a mathematics research tool, silent wrongness is the worst failure mode, so
we pay the small structural cost to prevent it, and add tagging so any residual mistake
is loud.

### Consequences
- **Easier:** trusting shared numerics; reusing `core` in any future tool.
- **Harder:** a small amount of explicit conversion at app/domain edges; a lint/test to
  catch convention leakage into `core`.
- **Revisit:** if a *third* convention appears (e.g. a future tool), the tag set grows;
  the principle holds.

### Action Items
1. [x] Document the canonical interchange convention in [INTERCHANGE.md](INTERCHANGE.md).
2. [ ] Add a test asserting `core` contains no `π`/`2πi` normalization constants. — enforced **by construction** (the kernel carries no normalization constants) rather than by a dedicated guard test.
3. [x] Implement per-app conversion shims at the interchange boundary.

---

## ADR-0007: Incremental extraction driven by real need

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

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
about *when* to extract; the codebase is temporarily heterogeneous (some TS, some JS;
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
Option A's only real cost is *judgment* (when to extract) and *heterogeneity* (a
mixed-state repo mid-transition). Both are manageable for one developer with good docs,
and are far cheaper than a research drought (B) or building-then-re-migrating (C). The
need-driven rule also directly serves principle #2 (extract on evidence).

### Consequences
- **Easier:** sustaining momentum; validating each seam with a real consumer.
- **Harder:** living with a temporarily heterogeneous repo; deciding extraction timing
  (guided by "a second consumer needs it").
- **Revisit:** each extraction is its own small decision; record notable ones as
  follow-on ADRs. *(First one: [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate),
  `@cas/exact`.)*

### Action Items
1. [x] Sequence per the [migration runbook](MIGRATION.md) (Phases 0–6, overlapping 5–6).
2. [x] Gate each package extraction on a concrete second consumer.

---

## ADR-0008: Extract `@cas/exact`; keep QD's `sym-core` separate

**Status:** Accepted  **Date:** 2026-07  **Deciders:** Andrew

*The first follow-on ADR that [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)
asked for ("record notable [extractions] as follow-on ADRs"). It records two decisions: one
extraction that happened, and one that deliberately did not.*

### Context
The Correspondences app needed **exact** arithmetic — not floating point — to locate the deltoid
correspondence curve's cusps. A cusp is a *decision* ("the discriminant vanishes here"), and a
decision computed in floating point is an estimate wearing a decision's clothing. It grew an
in-app engine at `apps/correspondences/src/exact/`: ℚ over `BigInt`, ℚ(i) on top, and exact
univariate polynomials over that field.

Complex Dynamics then needed the same field for **Gleason polynomials** (Mandelbrot period-*n*
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
   *that* and have everyone share it. We didn't.

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
- **Shape mismatch.** `sym-core` is *multivariate* (`MPoly` over a variable-name map) and built
  for ideal-theoretic work — Gröbner bases, elimination, real-root counting. CD and
  Correspondences need *univariate and bivariate* polynomials with a single abstract variable.
  Sharing would mean either using a heavyweight representation for a lightweight job, or adding
  a second representation to `sym-core` — i.e. building `@cas/exact` inside it anyway.
- **Risk concentration.** `sym-core` is the most correctness-critical code in the repo: the
  project's honest-labeling guarantee (`=` exact / `≤` bound / `≈` estimate) is only meaningful
  because that engine can actually decide things. Refactoring 5,805 lines of it to serve two
  consumers that don't need its capabilities trades a real guarantee for a tidier diagram.
- **No demand.** ADR-0007's rule is symmetric: don't extract without a second consumer, and don't
  *merge* without one either. Nothing needs `sym-core`'s multivariate machinery outside QD.
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
solo developer that is a bad trade. It stops being a bad trade under the conditions in *Revisit*.

### Consequences
- **Easier:** CD and Correspondences share one tested exact kernel; a fix lands once. `@cas/exact`
  is small enough to read in a sitting, and convention-neutral per
  [ADR-0006](#adr-0006-convention-neutral-core-packages).
- **Harder:** two ℚ(i) implementations to keep correct. Anyone reading the repo must learn that
  "the exact engine" is ambiguous — hence the explicit note in
  [`packages/exact/README.md`](../packages/exact/README.md) that QD does *not* use this package.
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
       agree on a shared corpus — the guard against the duplication in *Trade-off Analysis*
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

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*A follow-on ADR of the kind [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) anticipated —
but a UI/product decision rather than an extraction. It records the target shape of the Schwarz-reflection
feature in Complex Dynamics and supersedes the MVP "transient overlay" shape that shipped first.*

### Context
The QD → CD Schwarz-reflection (σ) hand-off shipped as a **transient overlay**: σ(w) = conj(F(φ⁻¹(w))) is
reconstructed from an imported — or natively built — Riemann map φ and painted onto a dedicated canvas
(`#JCSSchwarz`) layered *over* the Dynamical plane, shown for one map and dismissed by Esc or by any control
change (S4a → S4b, `render/schwarzView.ts` / `render/schwarzGL.ts` / `main.ts`). That was the right minimal
shape for the milestone: reproduce the deltoid σ as ground truth, then make it a live, interactive,
GPU-rendered view with a native φ builder — without yet building UI chrome.

σ is now a full interactive render (pan/zoom, presets + custom φ, CPU-parity-proven GPU engine). A
feature-parity review — against CD's own Dynamical plane and against QD's *mature* σ tool
(`app/schwarz/schwarz-ui.mjs`, which already ships colormaps + scale modes, hover/click orbit tracing, a
preimage tree, a boundary overlay, and z-disk / Riemann-sphere views of σ) — found that CD's power features
split cleanly into **generic** (operate on any escape-time field → reusable for σ: colormaps + scale modes,
legend, scale bar, hover readout, iteration controls, share links / saved views, PNG export, keyboard/pinch
nav) and **map-specific** (bound to the `f(z,c)` pipeline: rays, Böttcher, matings, Julia-set properties,
Yoccoz, laminations, the inspector's period/multiplier/nucleus math — inapplicable to σ by nature). The
finding that forces this ADR: the generic parity features integrate *cleanly* only if σ has **its own
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
unified single-page shell"): that decision governs the *suite* topology (each tool is a separate app under a
launcher). σ is **not** a separate app — it is a *view within* the Complex Dynamics app, sharing CD's engine,
coloring, interaction, and import path. A peer view inside one app is not a cross-app single-page shell.

### Options Considered

#### Option A: First-class peer view within Complex Dynamics (this ADR)
| Dimension | Assessment |
|---|---|
| Parity fit | High — every generic feature (controls panel, permalink, saved views, legend, PNG) has a natural home |
| Reuse | High — shares CD's engine / coloring / nav; QD's σ tool is a proven reference for the shape |
| Cost | Medium — a one-time refactor (lifecycle, a controls section, mode-switch + layout, state serialization) |

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
**Pros:** total isolation; its own everything. **Cons:** σ *shares* CD's engine, coloring, interaction, and
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
- **Watch for:** σ's controls *duplicating* the Dynamical-plane controls. Reuse the generic coloring/nav
  machinery the feature review identified as field-agnostic; do not fork it.
- **Revisit if:** σ grows enough genuinely distinct surface to warrant its own app after all — unlikely, since
  it shares CD's foundation, and Option C's reuse cost would still apply.

### Action Items
1. [x] Refactor σ from a transient overlay into a peer view/mode — its own pane + controls section + a
       persistent lifecycle (not dismissed by unrelated control changes). Done: a third `#schwarz-plot`
       `.plot` section inside `main.plots`, entered/left via a `.workspace.schwarz-active` mode class
       (modeled on the per-plot `expand` layout); the σ canvas + φ builder moved into it; the
       control-apply dismissal coupling removed. Verified in the built app (Playwright mode switch).
2. [ ] Serialize σ-view state (φ recipe + view + coloring) into share links / saved views / PNG metadata.
3. [ ] Bring the generic parity features into the σ controls section (colormaps + scale modes, orbit
       inspection, legend + scale bar, precise nav), reusing CD's field-agnostic machinery.
4. [ ] Update [SIGMA-HANDOFF.md](design/SIGMA-HANDOFF.md) so the peer-view is the target shape (superseding
       the S4a overlay), and keep the map-specific instruments explicitly out of scope for σ.
