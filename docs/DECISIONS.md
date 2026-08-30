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
| [0018](#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore) | Extract `@cas/conformal` ahead of demand; lift `lstsq` into `@cas/core` | Accepted |
| [0019](#adr-0019-argument-principle-as-a-separate-app) | Argument Principle as a separate app | Accepted |
| [0020](#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode) | Schwarz-Christoffel engine: lightning-seeded, disk-canonical, two-mode | Accepted |
| [0021](#adr-0021-argument-principle-pedagogy-arc--generalize-to-f--w-and-the-pin-interaction-model) | Argument Principle pedagogy arc — generalize to f = w₀, and the pin interaction model | Accepted |
| [0022](#adr-0022-explicit-contour-input-modes-touch-first) | Explicit contour input modes (touch-first) | Accepted |
| [0023](#adr-0023-accessible-marks-validated-palette-shape-encoding-and-a-non-rainbow-ramp) | Accessible marks — validated palette, shape encoding, and a non-rainbow ramp | Accepted |
| [0024](#adr-0024-faber-transform-app--casfaber--polygonal-k-via-the-exterior-sc-engine) | Faber Transform app + `@cas/faber` + polygonal K via the exterior SC engine | Accepted |
| [0025](#adr-0025-defer-the-winding--singularity-primitive-extraction-second-consumer-noted) | Defer the winding / singularity primitive extraction (renumbered from a duplicate 0020) | Accepted |
| [0026](#adr-0026-defer-consolidating-qds-schwarz-engine-with-casschwarz-classical-subset-duplication) | Defer consolidating QD's Schwarz engine with `@cas/schwarz` (classical-subset duplication) | Accepted |
| [0027](#adr-0027-extract-mapspectoexpr-into-casinterchange) | Extract the `MapSpec` → `@cas/expr` converter into `@cas/interchange` | Accepted |
| [0028](#adr-0028-riemann-surface-mode-in-the-plotter--parametrize-by-w-branch-machinery-in-app) | Riemann-surface mode in the plotter — parametrize-by-w, branch machinery in-app | Accepted |
| [0029](#adr-0029-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing) | Algebraic-curve Riemann surfaces (M2a single-radical, NPP proximity gluing) | Accepted |
| [0030](#adr-0030-riemann-surface-exploration-tools-m3--hover-pick-linked-base-plane-monodromy) | Riemann-surface exploration tools (M3 — hover-pick, linked base-plane, monodromy) | Accepted |
| [0031](#adr-0031-implicit-fwz0-algebraic-riemann-surfaces-m2c--the-plotters-first-cascore--casexact-consumer) | Implicit `F(w,z)=0` algebraic Riemann surfaces (M2c) — the plotter's first `@cas/core` + `@cas/exact` consumer | Accepted |
| [0032](#adr-0032-extract-casui-ahead-of-adoption-port-cds-product-shell) | Extract `@cas/ui` ahead of adoption; port CD's product shell | Accepted |

> **Status legend:** Proposed → Accepted (once you sign off) → Superseded/Deprecated.
> All thirty-two are **Accepted**. ADRs 0001–0007 are the up-front decisions (recorded in
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
> ADR-0013**. **0018 is an eleventh follow-on** — an *extraction*, but the first that deliberately **breaks** the
> ADR-0007 second-consumer rule: `@cas/conformal` (the lightning + forward-map conformal builder) is carved out
> of the Riemann-map app *ahead* of its second consumer (Schwarz–Christoffel, roadmap step E), and the
> `lstsqHouseholder` primitive beneath it is lifted into `@cas/core`; the near-twin least-squares solver in
> Quadrature Domains is recorded as the *deferred* consumer (the two have diverged on rank-deficiency policy),
> not force-merged. Supersede rather than rewrite if any change later.
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
2. [x] Add a test asserting `core` contains no `π`/`2πi` normalization constants. — `packages/core/test/convention-neutral.test.ts` (a source scan banning `Math.PI` / bare `π` / π-derived normalization literals, with a `convention-ok` escape hatch for genuine geometric π). Previously "by construction"; now a red build. Makes RISKS.md §2 mitigation #1 ("a CI test asserts…") true rather than aspirational.
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

**Status:** Accepted — narrowed in part by ADR-0017 (RM went pure-2D)  **Date:** 2026-08  **Deciders:** Andrew

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

**Status:** Accepted — RM-consumer premise superseded by ADR-0017 (RM shed `@cas/dynamics`)  **Date:** 2026-08  **Deciders:** Andrew

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

## ADR-0018: Extract `@cas/conformal` ahead of demand; lift `lstsq` into `@cas/core`

**Status:** Accepted — a **deliberate exception** to [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) (extract *ahead* of a proven second consumer); the lifted primitive lands in [ADR-0006](#adr-0006-convention-neutral-core)-neutral `@cas/core`

### Context
Roadmap step D. The Riemann-map studio's numerical region map 𝔻 → Ω is produced by a self-contained conformal-map
**builder** that lived in `apps/riemann-map/src/solve/`: the Vandermonde–Arnoldi stable polynomial basis
(Brubeck–Nakatsukasa–Trefethen 2021), the lightning Riemann-map solver f: Ω → 𝔻 (Gopal–Trefethen 2019) with
corner-clustered poles, the forward map g: 𝔻 → Ω, and beneath all three a real Householder-QR least-squares
solver `lstsqHouseholder`. The roadmap's **next** step (E) is Schwarz–Christoffel — a *new* conformal engine that
will want the same basis + least-squares substrate and the same `corners?` hook. Two placement questions follow:
where should the **builder** live, and where should the **least-squares primitive** live.

Every prior `@cas/*` package waited for a proven **second consumer** before extraction
([ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)). Here there is none yet for the *builder* — RM
is its only consumer today. For the *least-squares* primitive an investigation found a genuine near-twin in
**Quadrature Domains** (`app/solvers/solver.mjs`: `houseQR` / `solveLeastSquares` / `leastSquaresWithCond`), used
load-bearingly in QD's near-cusp Newton solver — but the two have **diverged**: RM zero-fills a rank-deficient
column (tol `1e-300`, never throws) while QD **throws** `"singular"` (tol `1e-13`) and is genuinely richer
(a reusable factorization handle, numerical rank, and a `condEst`-driven iterative refinement its Newton recovery
path depends on). They are **not drop-in interchangeable** — which refutes the roadmap note's "RM ≡ QD" wording
(the "QD's is richer" half is true; the "≡" is false).

### Decision
Two moves, both recorded here:

1. **Extract `@cas/conformal` ahead of demand.** The builder (Vandermonde–Arnoldi + lightning + forward map)
   becomes the **ninth** `@cas/*` package now, *before* a second consumer exists — a deliberate exception to
   ADR-0007. Rationale: step E (Schwarz–Christoffel) is a genuinely new engine, and it is cheaper and cleaner to
   give it a package to be **born into** than to build it inside the app and re-seam afterward (the
   build-then-migrate waste [VISION §5](VISION.md#5-the-strategic-thesis) rejects). The exception is safe because
   the seam is drawn where the mathematics already is — the builder is pure, self-contained, and node-tested — so
   the "premature/wrong seam" risk ADR-0007 guards against is low. Source-exports model (like
   [ADR-0014](#adr-0014-extract-casdynamics-on-the-second-consumer-rule-riemann-map)'s `@cas/dynamics`), on `@cas/core`.

2. **Lift `lstsqHouseholder` into `@cas/core`** (not into `@cas/conformal`). Real Householder-QR least squares is
   foundational, general-purpose linear algebra — nothing conformal-specific about it — and QD independently
   implementing the same routine *proves* it is a shared primitive. `@cas/core` (ADR-0006-neutral, and already
   `dist`-built so QD's headless `node` suite could import it) is the right home. **But do not rewire QD's solver
   in this step.** QD's variant has diverged (rank policy) and is cusp-critical; forcing it onto RM's zero-fill
   contract would regress it, and merging the two properly is its own risk-bearing consolidation ("ask before
   large speculative refactors"). So `@cas/core`'s `lstsqHouseholder` is, today, consumed only by
   `@cas/conformal` — an extract-ahead like the builder — with **QD documented as the anticipated second
   consumer** whose adoption is deferred. This mirrors
   [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate)'s precedent of deliberately leaving QD's
   mature numerics in place.

### Options Considered
- **A — extract `@cas/conformal` + lift lstsq→core, defer QD (this ADR).** *Pros:* gives step E a home to build
  into; `@cas/core` gains the honest foundational primitive; touches **no** mature app math. *Cons:* two
  extract-aheads in one step (softens ADR-0007 twice — recorded, not hidden).
- **B — keep the builder in RM; extract only when Schwarz–Christoffel lands.** *Rejected:* builds a new engine
  inside an app and then re-seams it — the exact build-then-migrate waste VISION §5 rejects, and the seam is
  already clean today.
- **C — lift a *superset* LSQ (QD's `houseQR` + a selectable rank policy) into core and rewire BOTH RM and QD
  now.** *Rejected for this step:* a large, risky rewrite of QD's most numerically sensitive (near-cusp) code.
  It remains available as a future opt-in consolidation (Action Item 5).
- **D — keep `lstsq` inside `@cas/conformal`, not core.** *Rejected:* least squares is not conformal-specific;
  hiding a general primitive inside a domain package is the wrong seam, and QD's twin shows the primitive recurs.

### Consequences
- **Easier:** Schwarz–Christoffel (step E) has a package + a `corners?` hook to build into; `@cas/core` now owns
  the suite's least-squares primitive; Riemann Map shrinks (its whole `solve/` directory is gone — four fewer app
  files — and it gains one more `@cas/*` dependency instead).
- **Harder / owed:** two single-consumer extractions to be retro-justified by future work (step E for the builder;
  a QD consolidation for core-`lstsq`). If step E is abandoned, ADR-0007's symmetric "don't split without two"
  would invite folding `@cas/conformal` back into RM.
- **Documented divergence:** the RM/QD least-squares split (zero-fill @ `1e-300` vs throw @ `1e-13`, plus QD's
  `condEst`/refinement/reusable-handle machinery) is now on record, so a future merge is informed rather than
  surprised.
- **Revisit:** when Schwarz–Christoffel lands (the builder's second consumer) the ahead-of-demand exception
  retro-justifies; when/if QD's `solver.mjs` least squares is consolidated onto `@cas/core` (with a selectable
  rank-deficiency policy) the core primitive gets its honest second consumer.

### Action Items
1. [x] Add `lstsqHouseholder` to `@cas/core` (moved from RM; plus rank-deficient-column and underdetermined-throw coverage).
2. [x] Create `@cas/conformal` (Vandermonde–Arnoldi + lightning + forward map) on `@cas/core`; source-exports model.
3. [x] Rewire Riemann Map onto `@cas/conformal`; delete `apps/riemann-map/src/solve/`; keep RM's forward-map
   integration test over its domain-preset library.
4. [x] Register the package in `vitest.workspace.ts` + the test-census `PROJECTS` (a `conformal` bucket).
5. [ ] **Deferred:** consolidate QD's `solver.mjs` least squares onto `@cas/core` — needs a selectable
   rank-deficiency policy to reconcile the `1e-300`/`1e-13` + zero-fill/throw divergence, and to preserve QD's
   `condEst`/refinement. QD is the anticipated second consumer.
6. [x] **Done:** build Schwarz–Christoffel (roadmap step E) into `@cas/conformal` — the builder's second consumer
   (its method-choice record is [ADR-0020](#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode)).

---

## ADR-0019: Argument Principle as a separate app

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*The sixth app joins the suite, and the direct sequel to [ADR-0010](#adr-0010-complex-function-plotting-tool-as-a-separate-app)
(plotter) and [ADR-0013](#adr-0013-the-riemann-map-tool-is-a-new-app-not-a-mode-in-an-existing-one) (Riemann map).
It is the event [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) and the north star are measured
against — "does each new tool build fewer primitives than the last?" — and it is the tool
[VISION §6/§7](VISION.md#6-what-success-looks-like) named in advance (the "argument-principle applet," folded in
opportunistically once the packages it reuses exist). The full runbook lives in
[`design/argument-principle-plan.md`](design/argument-principle-plan.md).*

### Context

A sixth tool is requested: an **educational visualizer for the argument principle** — the theorem that the
**winding number** of `f(γ)` about the origin equals the number of **zeros minus poles** of `f` enclosed by `γ`.
Its headline is a **dual `z`-plane / `w`-plane view** with a draggable/drawable contour and a live
`N − P = winding` readout that makes the equality visible. This is a *pedagogical* product: its value is the
interaction (a contour the user moves and draws, a point that can traverse `γ ↔ f(γ)`) and the honest
demonstration of a theorem, not a new rendering paradigm.

The awkward fact to confront head-on: **the plotter already contains an "argument principle" instrument.**
`apps/complex-function-plotter/src/analysis/singularities.ts` (ADR-0010, Phase 2) locates and counts zeros/poles
by grid search → Newton refine (symbolic `f'`) → winding classification. So the fair question is whether the new
tool should be **(A)** a new app, **(B)** an expanded mode/view *inside* the plotter (reusing that instrument), or
**(C)** a peer view inside Complex Dynamics.

The deciding fact is the same one ADR-0009/0010/0013 turned on: **what does the feature share, and what does it
bring?** The new tool shares only *packages* (`@cas/expr` for `f`/`f'`, `@cas/core` Durand–Kerner for exact
roots, `@cas/interchange`, `@cas/export`), pulled *downward*. It brings a distinct product surface the plotter
does not have — a dual-plane contour-interaction UI whose meaning is winding, not phase color. The plotter's
instrument is a **single quantitative readout on a domain-colored field**; this tool is a **dedicated dual-view
theorem explorer**. They overlap in exactly one primitive (the winding classifier), which is an
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) *extraction* question, not a reason to merge two
products.

### Decision

Build it as a **separate app, `apps/argument-principle`**, a peer to the five existing apps, riding
`@cas/expr` + `@cas/core` + `@cas/interchange` + `@cas/export` — **pure-2D, no `@cas/gpu`** (like
`apps/riemann-map`), listed on the launcher. Consistent with
[CLAUDE.md decision #8](../CLAUDE.md) (separate apps + a unified menu; **no** unified single-page shell). It
**imports** an `f(z)` handed off from the plotter or Complex Dynamics via
[`@cas/interchange`](INTERCHANGE.md) (`mapSpecToExpr`); it is **not** a mode inside the plotter or a view inside
CD. Ship it **built-but-unpublished** (a launcher "Coming soon" card, as `correspondences` / the plotter were)
until the Phase-2 quality gate, then flip to published (one `cp` in `deploy-pages.yml`). Execute against the
phase-gated plan.

### Options Considered

#### Option A: A new standalone app `apps/argument-principle` (this ADR)
**Pros:** matches the suite topology (decision #8); a thin app over shared packages; the dual-plane
contour-interaction surface is genuinely its own product with its own controls and lifecycle; publishes
independently; the one shared primitive (winding) becomes a clean extraction (ADR-0025) rather than copied code.
**Cons:** a sixth app to maintain; "argument principle" now names both a plotter instrument and an app, so the
boundary must be kept honest; some UI scaffolding re-created per app (no `@cas/ui` — never extracted, ADR-0007).

#### Option B: An expanded mode/view inside the Complex Function Plotter
**Pros:** reuses the plotter's existing `singularities.ts` instrument, coloring, and input directly.
**Cons — and why rejected:** the plotter's headline is **domain coloring** of a single `w = f(z)`; its
argument-principle instrument is one small readout on that field. This tool's headline is a **dual `z`/`w`
contour explorer** — a different paradigm (two linked planes, a user-manipulated contour, an animated traversal),
with a *teaching* purpose rather than a *research-plot* one. Grafting it into the plotter would bloat the
plotter's `main.ts`, couple two products with different audiences and interactions, and blur the plotter's clear
"domain-coloring studio" identity. σ earned a peer view in CD because it **shares CD's escape-time engine**
(ADR-0009); this tool shares *packages*, not the plotter's pipeline. Rejected — the same reasoning that made the
plotter and Riemann map their own apps rather than CD modes.

#### Option C: A peer view inside Complex Dynamics
**Pros:** CD has mature 2D/GPU rendering and instruments.
**Cons:** CD's paradigm is escape-time iteration of `f(z, c)`; the argument principle is a static
single-evaluation instrument with no dynamics. No shared engine, a swelled `main.ts`, coupled audiences.
Rejected for the same share-vs-bring reason as B.

### Trade-off Analysis

This applies the ADR-0009/0010/0013 test and gets the same answer they did: a feature that would **share** a host
app's engine belongs *inside* it as a view; one that **brings its own** product surface and reuses only the
**packages** (downward) belongs in its own app. The new tool reimplements **none** of the shared foundation — it
composes `@cas/expr` (`parse` / `makeComplexFn` / `differentiate` / `fToRational`), `@cas/core`
(`makeDurandKerner`), `@cas/interchange`, and `@cas/export` — so it is a **direct, favorable test of the north
star**: measurably fewer new primitives than the Riemann map or the plotter, because its only genuinely new code
is the pedagogical instrument (dual-plane UI, contour interaction, image-curve winding, point-in-contour count).
The honest cost — a sixth app, and "argument principle" living in two places — is bounded by keeping the plotter's
instrument to its one readout and letting this app own the dual-view exploration, with the winding primitive
slated for extraction on the second-consumer rule (ADR-0025), not duplication.

### Consequences

- **Easier:** a sixth tool shipped mostly by composition (north-star confirmed); the dual-view teaching product
  has its own home; suite interop is one `@cas/interchange` import away; pure-2D keeps it out of the WebGL
  `browser` CI job entirely.
- **Harder:** a sixth app to maintain; two homes for "argument principle" (the plotter's instrument and this app)
  whose boundary must be kept honest; UI chrome is app-local (no `@cas/ui`); the `1/(2πi)` framing and any
  phase→hue shading stay app-local and convention-tagged
  ([ADR-0006](#adr-0006-convention-neutral-core)), never baked into packages.
- **Follow-on ADR this anticipates:** **ADR-0025 — extract the winding / singularity primitive** on the
  [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) second-consumer rule (the plotter's
  `singularities.ts` is the first consumer; this app the second), with the plotter refactored to consume it.
  Recorded when it lands (plan Phase 4).
- **Watch for:** the app drifting into the plotter's domain-coloring territory (that belongs to the plotter — keep
  this tool's backgrounds plain/grid, a phase tint at most); and the winding classifier being *copied* rather than
  extracted once both apps carry it.
- **Revisit if:** this app and the plotter's instrument converge enough that one should consume the other — then
  extract the shared piece into a package (ADR-0007 / ADR-0025), rather than merging the apps.

### Action Items

1. [x] Scaffold `apps/argument-principle` on the shared packages — Phase 0 Genesis: the tested, deployable
       shell (Vite/TS, the single serializable `#vs=` view-state over `@cas/interchange` namespace `"ap"`, node
       parity-seed tests, launcher "Coming soon" card; local `lint`/`typecheck`/`test`/`build` gate green).
       Registered in `vitest.workspace.ts`, the test-census `PROJECTS`, and eslint `APP_NAMES`. The walking
       skeleton already draws the dual z/w view + f(γ) image and reads off the winding number, seeding the
       `winding.ts` / `contour.ts` primitives with unit tests.
2. [x] Build the dual-view instrument through the phase gates (winding → zeros/poles → `N − P = winding`), per
       [`design/argument-principle-plan.md`](design/argument-principle-plan.md). (Phases 1–2.)
3. [x] Wire the plotter/CD → argument-principle `f(z)` hand-off through `@cas/interchange` (`mapSpecToExpr`),
       mirroring the plotter's `importMap.ts` (plan Phase 3a).
4. [x] Record **ADR-0025** (the winding / singularity primitive extraction decision) at the Phase-4 gate — see
       [ADR-0025](#adr-0025-defer-the-winding--singularity-primitive-extraction-second-consumer-noted) below.
       The finding: the second consumer is real, but the two implementations **diverged**, so the extraction is
       **deferred**, not taken.
5. [x] Publish (flip the launcher card to a link + add the `deploy-pages.yml` `cp`) at the Phase-4 gate.

---

## ADR-0025: Defer the winding / singularity primitive extraction (second consumer noted)

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

> **Renumbering note:** this ADR was originally recorded as a second `ADR-0020`, duplicating the
> Schwarz–Christoffel engine ADR-0020 below. Renumbered to **0025** (the next free number) so every ADR
> ID is unique. It is kept here beside its parent [ADR-0019](#adr-0019-argument-principle-as-a-separate-app)
> — both are Argument-Principle decisions — so the number, not the file position, is authoritative.

*An [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) **deferral**, in the mould of
[ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) (keep QD's `sym-core` separate) and
[ADR-0018](#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore) Action Item 5 (defer QD's
least-squares consolidation): the suite's pattern of **not** force-merging diverged, mature code. Anticipated
by [ADR-0019](#adr-0019-argument-principle-as-a-separate-app) (its follow-on ADR) and the
[argument-principle plan §4](design/argument-principle-plan.md).*

### Context
The Complex-Function-Plotter's `src/analysis/singularities.ts` (ADR-0010, Phase 2) was the suite's first
zero/pole finder — grid-sample `|f|`, Newton-refine with the symbolic `f′`, classify by the winding of
`arg f` around a small circle. Building the Argument-Principle tool produced a **second** consumer of that
machinery (`apps/argument-principle/src/singularities.ts` + `winding.ts`). ADR-0007's rule is to extract a
shared package the moment a second consumer needs it — so the extraction was evaluated here. The finding is
that the two have **diverged**, in two ways:

1. **The finder is not the same finder.** The Argument-Principle version is a *superset*: it added an **exact
   rational path** (`@cas/expr` `fToRational` → `@cas/core` Durand–Kerner on numerator/denominator, labelled
   `=`), **critical points** (`f′` roots), and an **AST + Region** interface returning
   `{zeros, poles, critical, differentiable, exact}`. The plotter's takes compiled `(f, f′)` closures + a
   `ViewBox` + aspect, is **grid-only**, and returns `{zeros, poles, differentiable}`.
2. **The winding accumulator looks shared but its semantics diverged.** The plotter's inline `winding()`
   returns **0** when a sample lands on a singularity (`|w| = 0`) — a deliberate robustness choice *for its
   classifier*. The Argument-Principle `windingNumber()` accumulates unconditionally and exposes
   trustworthiness **separately** (`windingReliable`), because it must report the true winding of a
   user-drawn contour, not silently zero it. Forcing the plotter onto the AP primitive would change its
   classifier's behavior at singular samples.

### Decision
**Defer the extraction.** Record the second consumer; keep both finders **app-local**. Do not extract a
shared finder or a shared winding primitive in this step.

### Options Considered
- **A — Defer (this ADR).** *Pros:* no risk to the mature, shipped plotter; the Argument-Principle publish
  stays a clean, isolated change; honest under ADR-0007 (extract on *real, low-risk* need). *Cons:* the
  winding-accumulator logic now exists in two apps — a known, bounded duplication (recorded, watched).
- **B — Extract a lowest-common `windingNumber(points)` primitive and rewire the plotter.** *Rejected now:*
  the two winding uses have **different singular-sample semantics** (§Context.2); reconciling them means
  giving the plotter's tuned classifier a new dependency and a behavior change, for a ~30-line dedup — risk
  outweighs reward. It becomes attractive if a *third* consumer appears or the semantics are unified behind a
  `windingNumber(points, { onSingular })` policy argument.
- **C — Extract the superset finder to a package.** *Rejected:* it would burden the plotter with the
  rational-exact / critical-point machinery it does not use, and is the premature-abstraction ADR-0007 guards
  against. (Symmetric rule: "two engines are not *merged* without one either.")

### Consequences
- **Easier:** the publish is decoupled from a risk-bearing refactor of a shipped app; each finder stays tuned
  to its own tool (the plotter's escape-time-adjacent instrument; the AP tool's exact-when-rational counter).
- **Harder / owed:** the winding accumulator is duplicated across the plotter and the Argument-Principle tool
  — a bounded, recorded cost. If either changes materially, keep them in sync by hand until extraction.
- **Convention-safety note (ADR-0006):** a future extracted `windingNumber` *is* convention-neutral (an
  integer count from a point list, no `π`/`2πi`), so the deferral is about *interface divergence and consumer
  risk*, not about conventions — the primitive would be safe to share once the semantics are unified.
- **Revisit if:** a **third** consumer needs winding / zero-pole location, **or** the plotter and AP finders
  are deliberately unified behind a single interface (a `windingNumber(points, { onSingular })` with a
  selectable singular-sample policy; a finder that offers both the grid and rational paths) — at which point
  extract, with **both** apps' test suites green before and after (the standing test-guard rule).

### Action Items
1. [x] Record the second consumer and the deferral (this ADR).
2. [ ] **Deferred:** extract a `windingNumber(points, { onSingular })` primitive (with a selectable
       singular-sample policy) into `@cas/core` when a third consumer appears or the plotter/AP finders are
       unified — plotter tests green before & after.
3. [ ] **Watch:** if either app's winding accumulator changes materially, mirror the change in the other until
       the primitive is extracted.

---

## ADR-0020: Schwarz-Christoffel engine: lightning-seeded, disk-canonical, two-mode

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*The method-choice record for the Schwarz–Christoffel (SC) engine (roadmap step E), built into
[`@cas/conformal`](../packages/conformal) — the **second consumer** that retro-justifies the
ahead-of-demand extraction of [ADR-0018](#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore).
Grounded in a four-thread literature + implementation survey; the full runbook and ground-truth corpus are in
[`design/schwarz-christoffel-plan.md`](design/schwarz-christoffel-plan.md) and its research-notes companion.*

### Context
The suite already maps polygons numerically (the lightning engine in `@cas/conformal`). So SC's value is not a
better *map* but the exact analytic *record* — prevertices, exact corner exponents, accessory constants — plus
robustness. Four sub-decisions follow: the canonical domain, the numerical method, the two-mode structure, and
where the one new primitive lives.

### Decision
1. **Lightning-seeded SC, disk-canonical.** Map from the unit disk 𝔻 (matches `@cas/conformal`'s existing
   `f: Ω→𝔻` / `g: 𝔻→Ω` API and the cleanest golden cases). For `|t| ≤ 1` every factor `(1 − t/wₖ)` stays in the
   right half-plane, so the disk needs none of the half-plane's branch bookkeeping.
2. **Two modes, one result type (Option A).** `fast` = the lightning fit (instant, warm-startable, the SC
   prevertices read off `f(vₖ)` for free); `precise` = the classical parameter-problem solve (softmax gap
   parametrization + damped Gauss–Newton, each step a `@cas/core` `lstsqHouseholder`), seeded via `warmStart` by
   a fast/prior solve — the "drag with lightning, release to refine" path. Precise reaches machine precision on
   convex **and** reentrant polygons.
3. **Gauss–Jacobi quadrature stays in `@cas/conformal`** (SC's only new primitive) — **not** lifted to
   `@cas/core`, per [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need): SC is its only consumer
   (contrast `lstsq`, which QD's near-twin justified lifting in ADR-0018).
4. **Forward-only v1.** The inverse map, CRDT, exterior/unbounded/circular-arc variants, and interchange
   serialization are deferred.

### Options Considered
- **A (chosen) — lightning-seeded SC reusing the substrate.** Reuses the built lightning fit + Arnoldi + `lstsq`;
  adds only Gauss–Jacobi. Fast mode is genuinely instant; precise is machine-precision.
- **B — one SC engine at two tolerances (loose vs tight).** *Rejected:* spends effort making a nonlinear solve
  do the linear lightning solve's job; heavier per-frame; a worse fit for a real-time fast mode.
- **C — skip SC, rely on lightning + AAA-LS.** *Rejected:* forfeits the exact analytic record and the meaningful
  prevertices — the whole reason to build SC.

### Consequences
- **Delivered:** SC retro-justifies ADR-0018 (its promised second consumer); `@cas/conformal` gains its second
  engine; the public `fitSchwarzChristoffel` exposes prevertices, `C`, `A`, the quadrilateral conformal modulus,
  and an honest `residual`. Precise mode is the robust all-polygon workhorse (machine precision).
- **Known limitation (honest, not hidden):** the polygon *lightning* fit (fast mode) is reliable for convex/mild
  corners but fails on strongly **reentrant** corners — fast mode sets `degraded:true` there, and precise mode is
  the path for reentrant polygons. Proper Gopal–Trefethen reentrant pole handling is deferred tuning.
- **Revisit:** when the deferred roadmap lands (inverse map → CRDT → variants → interchange), and if a second
  consumer of Gauss–Jacobi appears (then it earns a place in `@cas/core`, per ADR-0007).

### Action Items
1. [x] Gauss–Jacobi quadrature primitive (Golub–Welsch) + the compound rule (Phase 0).
2. [x] Forward SC map for given prevertices (Phase 1); golden n-gon / square validation.
3. [x] The parameter-problem solver (Phase 2); triangle / pentagon / L-shape to ≥10 digits.
4. [x] The two-mode `fitSchwarzChristoffel` API + invariants + warm start (Phase 3).
5. [x] **Done:** the inverse map (polygon → 𝔻) by the ODE + Newton hybrid (the Phase-F fast-follow).
6. [x] **Done:** wire the SC engine into the Riemann-map app — a polygon region source (`fitRegion` in
       `apps/riemann-map/src/main.ts` uses `fitSchwarzChristoffel` for domains with `corners`; the region
       picker offers the polygon presets; the info panel reports the SC method + residual).
7. [~] **Partly done:** the **exterior** SC variant (𝔻* → Ω, bounded simple polygon) shipped for the Faber
       Transform app — `exteriorSchwarzChristoffel.ts` + `exteriorScParameterProblem.ts` (see
       [ADR-0024](#adr-0024-faber-transform-app--casfaber--polygonal-k-via-the-exterior-sc-engine)). Still
       **deferred:** CRDT (crowding), unbounded/circular-arc variants, `@cas/interchange` serialization, and a
       robust reentrant lightning fast-mode.

---

## ADR-0021: Argument Principle pedagogy arc — generalize to f = w₀, and the pin interaction model

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*A within-app product decision for `apps/argument-principle`, layered on the shipped tool
([ADR-0019](#adr-0019-argument-principle-as-a-separate-app)) after its pedagogy enhancement arc
([plan §11](design/argument-principle-plan.md#11-pedagogy-enhancement-arc-a--b--c--d8--f13-shipped)). It records
two decisions that change what the tool teaches and how it is operated; it changes **no** shared package and
**no** interchange schema.*

### Context
The shipped tool demonstrated the classic argument principle: winding of `f(γ)` about `0` = zeros − poles
enclosed. A second construction arc added surfaces that teach the *mechanism* (an argument strip-chart, a
swept wedge, the `∮ f′/f` integral, per-root decomposition), interaction that teaches the *discreteness* of
the count (hover tooltips, boundary-crossing pulses, click-to-isolate), and one genuine *generalization*.
Two of these needed a recorded decision.

### Decision
1. **Generalize the counted quantity from "zeros of f" to "solutions of f(z) = w₀."** A draggable **target
   w₀** in the image plane makes the winding of `f(γ)` measured about `w₀`, counting **preimages of w₀**
   inside γ (poles and critical points are target-independent). `w₀ = 0` is the classic zero-counting case,
   reproduced exactly; dragging near the origin **snaps** back to it. This is the argument principle for level
   sets — a route to the open-mapping theorem — and it is nearly free given the dual-plane layout: the finder
   roots `num − w₀·den` (rational, `=`) or `|f − w₀|` (grid, `≈`), and the winding/strip/wedge/integral all
   read the same plumbed `about = w₀` point.
2. **Adopt a click-to-pin interaction model for isolating a root.** Clicking a marked root pins a small
   isolating circle around it (radius = 0.4× the distance to the nearest other root) so the winding equals the
   root's order; the contour then **does not** follow the cursor until **released** (the "Clear drawn curve"
   button becomes **"Release γ"**; clicking empty space, or typing a new `f`, also releases). This resolves
   the tension between "the circle follows the cursor" (the reference applet's default) and "hold a
   configuration to study it."
   > **Superseded in part by [ADR-0022](#adr-0022-explicit-contour-input-modes-touch-first).** The
   > *cursor-follow* premise here is gone: there is no follow to suspend, and isolating a root is now a
   > **tap in the explicit "Isolate" tool**, not a click on the default-follow circle. What survives: the
   > **"Release γ"** relabel and the release-on-empty-space / release-on-new-`f` behavior.

### Options Considered
- **Target generalization — A (chosen):** a draggable w₀ that generalizes the count. *Pros:* a real
  conceptual payoff (`f = w₀`, level sets, open-mapping) for a small delta; `w₀ = 0` is a strict special case
  so nothing regresses. *Cons:* the readouts must relabel ("solutions" vs "zeros"), and the crossing detector
  had to key off the `(expr, target)` the roots reflect, not the live target (else a target drag fakes
  crossings across the debounced finder's lag). — **B (rejected):** keep zeros-only; simpler, but forgoes the
  one generalization the layout makes cheap.
- **Isolate interaction — A (chosen):** click-to-pin, explicit release. — **B (rejected):** an always-visible
  "Pin contour" toggle; more chrome for the same effect. — **C (rejected):** no pin (cursor-follow only);
  makes "isolate a root" impossible to hold.

### Consequences
- **App-local only.** The whole arc is `apps/argument-principle` code: no new `@cas/*` package (the ADR-0019
  deferral stands — the finder/winding are still app-local, now a superset), no interchange schema change.
- **Convention-safety (ADR-0006).** The new `1/2πi` normalization for the `∮ f′/f` readout lives at the app
  edge; `@cas/core` still carries no `π`/`2πi`. The winding integer and preimage positions are
  convention-free.
- **Honest labelling holds.** Preimage counts are `=` (rational) / `≈` (grid) exactly as zeros were; the
  `∮ f′/f` quadrature is `≈` even for a rational `f` (a Riemann sum that rounds to the exact count) — the
  pedagogy is precisely that the estimates agree with the count.
- **State compatibility.** `target` and the pedagogy toggles are optional-with-default and back-filled on
  decode; older `#vs=` permalinks keep opening (the share-link-compat guardrail).

### Action Items
1. [x] Ship the pedagogy arc (Stages 0–4) and this ADR (Stage 5).
2. [ ] **Deferred / exploratory:** a Rouché companion, a Nyquist (D-contour) mode, and a phase-tint
       background remain optional backlog (plan §11 lists the full menu); none is taken now.

---

## ADR-0022: Explicit contour input modes (touch-first)

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*A `apps/argument-principle` interaction-model decision for the UX/accessibility redesign
([plan §12](design/argument-principle-plan.md#12-ux--accessibility-redesign-touch--colour-blind--organization--shipped)).
App-local; no shared package or schema change.*

### Context
The tool's input is mouse-only and gesture-overloaded: a plain **hover** places the circular contour γ,
**right-drag** pans, **wheel** zooms, **left-drag** draws a freehand γ, a **click** pins/isolates a root, and
**hover** shows a marker tooltip. On touch this collapses — there is no hover without a press, no right-click,
and no wheel — so the *primary* interaction (place γ) is impossible on a phone/tablet/Chromebook, the devices
an educational tool most needs. The gesture modes are also undiscoverable (documented only in a text tip) and
the right-drag-pan / left-drag-draw split is unintuitive on the desktop too.

### Decision
Introduce an explicit, labelled **contour-mode segmented control `[ Move γ · Draw · Isolate ]`** and **retire
right-drag-pan and hover-follow**. Move = tap/click to place the circle; Draw = drag to sketch a freehand γ;
Isolate = tap/click a root to pin it. Pan becomes **one-finger / left-drag** in Move mode; zoom is **wheel +
pinch**; `touch-action: none` keeps the browser from stealing the gesture. Interaction is **pointer-type
aware** — hover tooltips on mouse, tap-to-reveal (into the persistent legend/readout) on touch — and touch
targets are ≥ 44px, including a labelled draggable w₀ handle.

### Options Considered
- **A — explicit modes (chosen).** The single-pointer alternative WCAG 2.5.1 wants; identical on mouse and
  touch; makes three hidden features visible. *Cons:* a mode is state the user must set (mitigated: Move is
  the default and covers the common case).
- **B — keep gestures, add touch fallbacks.** Rejected: preserves the desktop mode-overload and the
  discoverability gap, and touch gesture-disambiguation (tap-place vs drag-draw vs drag-pan) is fragile.
- **C — a "pin contour" toggle only.** Rejected: solves isolate but not draw or touch-place.

### Consequences
- Touch/classroom devices become first-class; the desktop interaction gets simpler and discoverable.
- `render/nav.ts` gains a mode-aware pointer layer and pinch handling; the change is app-local, pure-2D.
- The freehand-draw and isolate features move from hidden gestures to visible modes (no capability lost).
- **Revisit if:** a genuine stylus/precision workflow wants raw gestures back behind a preference.

### Action Items
1. [x] Record the decision (this ADR); publish the wireframe.
2. [x] Implemented in redesign **Phase 2** (#269) — mode control + pinch + target sizes, Playwright
       touch-emulation smokes green.

---

## ADR-0023: Accessible marks — validated palette, shape encoding, and a non-rainbow ramp

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*A `apps/argument-principle` visualization-accessibility decision
([plan §12](design/argument-principle-plan.md#12-ux--accessibility-redesign-touch--colour-blind--organization--shipped)).
App-local; the palette lands as design tokens (a candidate to share later, not now).*

### Context
Identity in the z-plane is carried largely by hue: **zeros and poles use the identical ✕ glyph**, separated
only by colour (teal vs rose). The house CVD validator rates that pair at **ΔE ≈ 7.3–7.7 under deuteranopia**
— the 6–8 band that is legal *only with a secondary (non-colour) encoding*, which is absent — and the
light-theme teal falls below the chroma floor (reads gray). The rainbow parameter-`t` ramp on γ / f(γ) / the
strip is neither CVD-safe nor perceptually ordered, and the verdict leans on green-vs-rose. This violates
WCAG 1.4.1 (use of colour) and 1.4.11 (non-text contrast).

### Decision
1. **Double-encode identity by shape:** **○ zero · ✕ pole · ◆ f′=0 · ● target w₀** — four distinct shapes, so
   identity never depends on colour.
2. **Adopt a validator-checked categorical mark palette** as tokens, snapped per light/dark mode. The
   z-plane trio (zero/pole/f′=0) — the real adjacency set — clears **ΔE ≥ 8.3** both modes (light
   `#2160c4 / #c9551f / #0f8f5f`; dark `#4585e0 / #cf7b30 / #26a86f`); the target `w₀` lives in the w-plane
   (a separate adjacency context) as a rose `●`. The UI accent (teal) and traversal (violet) stay distinct
   from the marks.
3. **Replace the rainbow `t`-ramp** with a colour-blind-friendly, perceptually-ordered map, and
   **double-encode direction** with periodic arrowheads along γ and f(γ) (the coupling still holds — same
   `t`, same colour, both planes).
4. **Verdict = icon + words, not colour alone;** an **ARIA live region** announces the equality and a root
   table gives a text alternative; marks/lines meet ≥ 3:1; `prefers-reduced-motion` is honoured.

### Options Considered
- **A — shape + validated palette + non-rainbow ramp (chosen).** Clears every WCAG check and the validator;
  keeps the coupling story. *Cons:* the rainbow is the app's signature look — an accepted aesthetic change.
- **B — re-hue only (keep the ✕/✕ glyphs).** Rejected: a 6–8 ΔE pair is illegal without secondary encoding,
  and re-hueing alone can't clear it robustly across both themes.
- **C — texture/pattern instead of shape.** Rejected: noisier on small glyphs than distinct shapes.

### Consequences
- Colour-blind readers can tell a zero from a pole by shape *and* by a ΔE-≥-8 palette; the core result is
  reachable by screen reader.
- The palette is a token set (validated in CI); ADR-0006 is untouched — these are app-edge presentation
  colours, not core constants.
- **Convention-safety:** none — colours and shapes carry no mathematical convention.
- **Revisit if:** a second app needs the same accessible mark set — then extract the tokens (ADR-0007 rule).

### Action Items
1. [x] Record the decision (this ADR); lock the validated hexes.
2. [x] **Phase 1:** shapes + palette tokens + ARIA live + verdict icon + reduced-motion (#266).
3. [x] **Phase 4:** the non-rainbow ramp (viridis, monotonic-lightness) + periodic direction arrowheads.
4. [x] Add a CI palette-validator check over the mark token set — `apps/argument-principle/test/palette.test.ts`
   (+ `palette-validator.ts`): reads the ○/✕/◆ tokens from `main.css` and gates, in both themes, the OKLab
   ΔE CVD separation (≥ 8 under Machado protan+deutan; the trio measures 8.31 dark / 8.87 light), the
   normal-vision ΔE floor (≥ 15), the OKLCH lightness band + chroma floor, and ≥ 3:1 contrast on the plane
   surface. Runs under `pnpm test`, so a token edit that regresses colour-blind safety fails CI.

---

## ADR-0024: Faber Transform app + `@cas/faber` + polygonal K via the exterior SC engine

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*Records, retroactively, the suite's **seventh** app — `apps/faber-transform` — its engine package
**`@cas/faber`** (the tenth `@cas/*` package), and the **polygonal-domain** extension that gives
[`@cas/conformal`](../packages/conformal) its second Schwarz–Christoffel family. Research context + the
prioritized extension list: [`design/faber-transform-research-features.md`](design/faber-transform-research-features.md);
the polygonal-SC runbook (with the M0 de-risk spike) is
[`design/faber-polygonal-sc-plan.md`](design/faber-polygonal-sc-plan.md).*

### Context
The paper (Graven & Makarov, arXiv:2509.03777) makes the exterior Faber transform Φφ: 𝒜(𝔻) → 𝒜(K) the natural
bridge between the unit disk and a bounded complement `K = ℂ∖Ω`. A separate visualizer app (per
[decision 8](../CLAUDE.md) / [ADR-0004](#adr-0004-monorepo-topology), mirroring the Argument-Principle app of
[ADR-0019](#adr-0019-argument-principle-as-a-separate-app)) is the right home, riding the shared packages. The
Faber machinery itself (Faber-polynomial recurrence, exact rational images of poles/monomials, the exterior
map's Laurent jet) is app-agnostic numerics — a package, not app glue. And the single biggest domain-class win
(T2.3) is **polygonal K**, which needs an **exterior** Schwarz–Christoffel map (𝔻* → Ω) — a variant the interior
SC engine of [ADR-0020](#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode) had
deferred (its Action Item 7).

### Decision
1. **Faber Transform is a separate app** (`apps/faber-transform`), not a mode of another tool — the same
   separate-apps-with-hand-off topology every other tool follows (ADR-0004/ADR-0008/ADR-0019).
2. **The Faber engine is a package, `@cas/faber`** (the tenth). Everything downstream consumes one struct —
   `ExteriorMap = { c, laurent }`, the map's Laurent-at-∞ — so the recurrence, exact images, and render are
   blind to *how* φ was produced (a curated closed form, or a solved SC map).
3. **Polygonal K rides `@cas/conformal`'s exterior SC engine**, not a new package. The exterior variant
   (`exteriorSchwarzChristoffel.ts` forward map + `exteriorScParameterProblem.ts` parameter solve) is added
   **in-package**, sharing the extracted `gaussNewton.ts` damped-Gauss–Newton driver with the interior solver.
   Faber Transform is its **sole** consumer, so per [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)
   it stays inside `@cas/conformal` — a **second SC family** beside ADR-0020's interior/bounded builders, and a
   second delivered consumer of the ahead-of-demand extraction of
   [ADR-0018](#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore).
4. **Honest labeling (guardrail).** Closed-form domains (ellipse/deltoid/finite-Laurent, regular polygons) are
   exact `=`; solved-polygon domains are `≈`; a degenerate/self-intersecting/non-converged fit renders `⚠` with
   blank panels rather than NaN garbage.

### Options Considered
- **A (chosen) — separate app + `@cas/faber` + exterior SC inside `@cas/conformal`.** Reuses the SC substrate;
  adds only the exterior integrand + closure condition; keeps the one-struct contract clean.
- **B — a new `@cas/schwarz-christoffel` (or `@cas/exterior-sc`) package.** Rejected: one consumer, so ADR-0007
  says in-package; the exterior map shares the interior solver's machinery (softmax gaps, GN driver, quadrature).
- **C — fold Faber into the Riemann-map or QD app.** Rejected: violates the separate-apps topology and muddies
  two mature apps with a third tool's UI.

### Consequences
- The domain class expands from curved (ellipse/deltoid/finite-Laurent) to **arbitrary polygons** — convex and
  reentrant — the single biggest coverage gain, with the corner theory (`Λₖ = max{αₖ, 2−αₖ}`) made visible.
- **Exterior SC math (recorded, not hidden):** the reciprocal `u = 1/z` gives `Ψ(u) = φ(1/u): 𝔻 → Ω` with a
  `u⁻²` pole, so the D&T §4.2 integrand is `Ψ'(u)/C = u⁻²∏(1−u/uⱼ)^{1−αⱼ}` (exponent **`1−αₖ`**, the exterior
  region angle — sign-flipped from the interior; validated in the M0 spike). The polygon no longer closes
  automatically: closure ⇔ `Σ(1−αₖ)/uₖ = 0` (the no-log-at-∞ condition), appended to the residual. A single
  cold start stalled on some cyclic vertex orderings, so the solve tries multiple seeds and keeps the best.
- **Convention-safety (ADR-0006):** none — the Faber transform is convention-neutral (no π / 2πi); the app
  still carries a `normalization:"standard"` provenance tag for parity with its siblings.
- **Revisit if:** a second consumer of the exterior SC engine appears (then extract per ADR-0007), or an
  interchange `form` for the exterior map is needed (deferred — gate on a receiving tool, as ADR-0020 did).

### Action Items
1. [x] `@cas/faber` engine: Faber recurrence, exact rational images, exterior-map Laurent jets.
2. [x] **M0** de-risk spike (exterior integrand + exponent sign + capacity goldens: `Γ(1/4)` to 5 decimals).
3. [x] **M1a** regular-polygon presets (closed-form exterior map) through the unchanged Faber pipeline.
4. [x] **M1b** exterior SC engine (forward map + parameter solve + Laurent-at-∞ extractor) + app wiring for
       arbitrary convex/reentrant polygons.
5. [x] **M2** adaptive truncation + corner-norm `Λₖ` annotations + draggable-vertex polygon editor +
       honest `≈`/`⚠` labeling.
6. [x] **M3 — corner-suppressing weighted Faber `Q_{n,m}`:** `@cas/faber` `weightedFaberPolynomial`
       (`Q_{n,m} = Σⱼ gⱼ F_{n−j}`, weight `G_m = ∏(1−w_k/φ)^{1/m}` over the SC prevertex images `w_k = 1/u_k`;
       no new numerics — a linear combination of the existing `F_n`), an app toggle + strength slider, and a
       before/after `|Fₙ|` vs `|Q_{n,m}|` boundary profile (paper Fig. 2). De-risked by an M0-style spike.
7. [ ] **Still deferred:** an optional lightning fast-mode for the polygon solve; a `@cas/interchange` form
       for the exterior map (gate on a receiving tool).

---

## ADR-0026: Defer consolidating QD's Schwarz engine with `@cas/schwarz` (classical-subset duplication)

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*A follow-on ADR in the [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) /
[ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) shape, recording a deliberate DEFERRAL of a
duplication surfaced by the 2026-08 suite review: QD's `app/schwarz/schwarz-common.mjs` and `@cas/schwarz`
implement the same classical Schwarz-reflection σ on the bounded + unbounded-Laurent families. Unlike
[ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate)'s `sym-core` (a genuine shape-mismatch
non-merge), this subset is the SAME shape — so the merge is **deferred, not declined**.*

### Context

`@cas/schwarz` was extracted for the QD → CD σ hand-off
([ADR-0009](#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics)): Complex Dynamics and
Correspondences reconstruct σ(w) = conj(F(φ⁻¹(w))) from a closed-form φ recipe to render its escape-time
field. It reconstructs two families — the classical UNBOUNDED-Laurent (`makeUnboundedLaurentSchwarz`) and
BOUNDED (`makeBoundedSchwarz`) maps — plus the family-agnostic σ⁻¹ machinery (`buildPreimageTree`,
`sampleLimitSet`, `iterateCurveForward`/`findCycles`, `findSigmaSingularities`).

QD's own `app/schwarz/schwarz-common.mjs` builds σ for the SAME classical families — its `boundedQD` /
`unboundedQD` adapters and `branchSchwarzContribution` are the byte-for-byte same kernel
`F(z) = conj(w₀) + Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ` — AND for the four weighted families the package does not have:
`boundedLQD`, `boundedLQD_singular`, `unboundedLQD`, `unboundedLQD_singular` (plus `boundedQDRational`). It is a
**superset**. And QD **does not depend on `@cas/schwarz`** (not in its `package.json`), so the classical subset
is genuinely implemented twice, with no record of why.

The review flagged this as reading like **forgotten duplication**. But `@cas/schwarz`'s own header already
states the intended direction: *"The remaining weighted families (LQD, PQD) follow as the QD app's σ machinery
is lifted here."* The intended end-state was always **consolidation** — the package grows to family parity,
then QD consumes it — not a permanent two-engine split.

### Decision

**Defer the consolidation; do not partial-rewire now.** Keep `schwarz-common.mjs` as the QD-side σ engine for
the present, and record the boundary explicitly so it is a *deliberate* deferral. When consolidation does
happen it goes in the direction the package header names — **lift QD's weighted-family σ machinery into
`@cas/schwarz` to reach family parity, then rewire QD to consume the complete package wholesale** — NOT a
partial rewire of only the two classical families onto today's incomplete package.

### Options Considered

#### Option A: Partial rewire now — QD's `boundedQD` + `unboundedQD` onto today's `@cas/schwarz` (the review's first suggestion)
**Pros:** kills the classical-subset duplication immediately; `@cas/schwarz` is a real, tested
[ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) second consumer. **Cons, and why rejected:**
it leaves QD with a **split σ engine** — two of seven families reconstructed from the TS package, the other
five (the weighted LQD/PQD/singular families) still in `schwarz-common.mjs` — with the
[ADR-0006](#adr-0006-convention-neutral-core-packages) convention boundary running through the middle of the
solver's own σ code. That is harder to reason about than either pure state, and couples QD's vanilla-JS
(`allowJs`, [ADR-0002](#adr-0002-typescript-as-the-common-language)) edge — which runs unchanged in module
workers and the headless node suite — to the package graph for only a partial win.

#### Option B: Lift QD's full σ machinery into `@cas/schwarz` NOW (reach parity, then QD consumes it)
**Pros:** the coherent end-state; one σ engine for the suite. **Cons, and why deferred not done:** there is
**no second consumer for the weighted families yet** — CD and Correspondences use only the unbounded-Laurent +
bounded reconstructions. [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) is symmetric: don't
merge without a second consumer any more than you extract without one. Lifting ~500 lines of solver-critical
weighted-family σ (`schwarz-common.mjs:459–987`) from vanilla JS to strict TS, across the convention edge, with
only ONE consumer (QD itself) is exactly the speculative, ahead-of-demand refactor the guardrails caution
against — and unlike [ADR-0018](#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore)'s
deliberate extract-ahead, nothing here is blocked on it.

#### Option C: Keep two engines permanently ([ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) `sym-core` style)
**Pros:** no coupling; each side evolves freely. **Cons:** unlike `sym-core` (multivariate vs univariate — a
real shape mismatch that may never merge), the classical subset here is the **same shape**, genuinely
redundant. Declaring it permanent would be dishonest — `@cas/schwarz` was built anticipating the lift. So this
is a *deferral*, not a decline.

### Trade-off Analysis

The honest cost is **duplication of the classical Schwarz kernel**: the bounded + unbounded-Laurent σ is
implemented in both `schwarz-common.mjs` and `@cas/schwarz`, and a σ fix in one does not reach the other (drift
risk). That is real debt.

It is accepted *for now* because the coherent fix (Option B) has no demand yet, the cheap fix (Option A) makes
the solver harder to reason about, and the debt is bounded and — once Action Item 2 lands — guarded: a
differential test turns silent drift into a red build, exactly as
[ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) did for the two ℚ(i) engines. The suite's
north-star ("each tool builds fewer primitives than the last") is served by *recording the path to
consolidation and guarding the interim*, not by a partial rewire that trades one kind of complexity for
another.

### Consequences

- **Easier:** QD's σ engine stays self-contained vanilla JS; no convention-boundary seam inside the solver; no
  new cross-package edge added under demand-less pressure.
- **Harder:** two classical-σ implementations to keep correct; a reader must learn (from the header notes,
  Action Item 1) that "the Schwarz engine" is — like "the exact engine" in
  [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) — ambiguous.
- **Watch for:** a second consumer wanting the weighted (LQD/PQD) σ families outside QD. That is the
  [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) trigger to execute Option B.
- **Revisit if** any of: (a) a second consumer needs the weighted-family σ (⇒ Option B); (b) the drift-guard
  differential test fires (the two classical engines disagree ⇒ fix + reconsider urgency); or (c)
  `schwarz-common.mjs` needs a substantial change to the *classical* subset (do it once, in the package, and
  consume it — cheaper than editing both).

### Action Items
1. [x] Note the boundary on both sides — a header line in `app/schwarz/schwarz-common.mjs` and in
       `@cas/schwarz`'s `index.ts` — stating the classical-subset duplication is a *deliberate deferral* (this
       ADR), and that the intended consolidation direction is lift-to-parity-then-consume.
2. [x] Add the **differential drift-guard**: `apps/quadrature-domains/vitest/schwarz-differential.test.ts`
       feeds three classical φ — the deltoid `ζ + 1/(2ζ²)` (unbounded pole-free), a single-exterior-pole
       unbounded QD, and a finite-pole bounded QD — to both `schwarz-common.mjs`'s
       `buildSchwarzFromPhi(...).sigma` and `@cas/schwarz`'s `makeUnboundedLaurentSchwarz`/`makeBoundedSchwarz`
       `.sigma`, reconciling the `{re,im}`↔`[re,im]` layouts. Branch/seed ambiguity is sidestepped by
       generating each grid `w = φ(z)` from a known preimage z (exterior for unbounded, interior for
       bounded), the branch each engine's accept-z predicate selects. Because σ is float Newton on both
       sides (so a pure A-vs-B check would pass on JOINT drift), every point is a three-way comparison
       against an INDEPENDENT `@cas/core` reference σ, itself pinned to the hand-derived
       `interchange/goldens.ts` (w₀, σ(w₀)) values. Adds `@cas/schwarz` to QD's devDependencies (the
       [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate) Action-Item-4 pattern);
       mutation-verified red on a perturbation to either engine. This lands the "guarded interim" the
       Trade-off Analysis above promised.
3. [ ] When a second consumer of the weighted families appears, execute Option B (lift `schwarz-common`'s
       weighted-family σ into `@cas/schwarz` to family parity, then rewire QD to consume the package) and
       supersede this ADR.

---

## ADR-0027: Extract `mapSpecToExpr` into `@cas/interchange`

**Status:** Accepted (2026-08-23) · a follow-on decision, of the [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)
"extract on a second consumer" kind (here the second and third consumers were already present — and drifting).

**Context.** The import side of every map hand-off turns an `@cas/interchange` `MapSpec` / `Envelope` into a
source string in the `@cas/expr` grammar (imaginary unit `i`, powers `^`), which the receiving app then
compiles through the shared `expr` pipeline. Six functions do this — `coeffExpr`, `polyExpr`, `rationalExpr`,
`laurentExpr`, `mapSpecToExpr`, `envelopeToMapSpec` — and they had been **copy-ported into three apps**
(Complex Dynamics, the Complex-Function Plotter, Argument Principle), because the dependency rule
(ARCHITECTURE §4) forbids one app importing another. Each app's header openly noted the copy.

The 2026-08-23 suite review found the three copies had **already diverged in a correctness-relevant way**:
the plotter and Argument-Principle copies had grown two guards — a refusal of a rational map with an
empty / identically-zero denominator (a 0/0 map), and a refusal of a pole-bearing Laurent map (finite-pole
`branches`) — that Complex Dynamics' ancestor copy never received. So the *same* interchange payload
imported into CD produced a `NaN` (0/0) or a silently-wrong map (the finite-pole branches dropped) where
the other two failed loudly. This is exactly the drift ADR-0007 exists to prevent: three consumers of one
identical bridge, maintained in parallel, one now behind on a correctness fix — and it violates the
honest-labeling guardrail (fail loudly, never emit a subtly-wrong map).

**Decision.** Extract the six functions into a single `@cas/interchange` module (`mapSpecToExpr.ts`,
exported from the package index), **unifying the two guards** so every consumer gets the loud-failure
behavior. The three apps delegate: CD re-exports it beside its CD-specific `@cas/schwarz` σ-reconstruction
helpers (which stay local); the plotter and AP keep their app-specific outer glue (`importEnvelopeText`) and
re-export the shared converter as their interchange-import facade.

`@cas/interchange` is the home (not `@cas/expr`) because it already **owns** `MapSpec` / `Envelope` and all
three consumers already depend on it. The converter's output is *text in the `@cas/expr` grammar*, not an
`@cas/expr` AST, so `@cas/interchange` stays independent of `@cas/expr` — no package import, no dependency
cycle; the two are coupled only by that documented string grammar. (Putting it in `@cas/expr` would instead
require `@cas/expr` → `@cas/interchange` for the `MapSpec` type, the wrong direction for a
serialization → executable layering.)

**Consequences.**
- **CD picks up the guards it lacked** — a degenerate 0/0 rational or a pole-bearing Laurent now throws;
  CD's `main.ts` import path catches and surfaces a toast (fails loudly) instead of building a NaN /
  silently-wrong map. This is a behavior change for exactly those degenerate payloads, and is the fix.
- A cross-consumer golden (`packages/interchange/test/mapSpecToExpr.test.ts`) pins the emitted grammar and
  the three refusals (degenerate denominator, pole-bearing Laurent, schwarz), so a future guard change
  lands in one place with one test. Each app's existing import/interop tests stay green.
- A future map form (or a fourth consumer) extends one shared converter, not three drifting copies.

**Not in scope.** The `@cas/interchange`-side SC form (still deferred, ADR-0007 — gate on a receiving tool)
and Riemann Map's *separate* CD → RM Böttcher `LaurentMap` converter (a different converter, left as-is).

---

## ADR-0028: Riemann-surface mode in the plotter — parametrize-by-w, branch machinery in-app

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*Records the decision to add a true multi-sheeted **Riemann-surface** view to
`apps/complex-function-plotter`, the **method choice** (parametrize-by-w first, algebraic triangulation
and z-grid continuation deferred), and — in the [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need)
shape — keeping the new branch/inverse machinery **in-app** with no package extraction and no new
[ADR-0005](#adr-0005-expr--interchange-are-the-keystone) multivalued interchange form. The full plan is
[`docs/design/riemann-surface-plan.md`](design/riemann-surface-plan.md).*

### Context

The plotter renders 2D domain coloring, a single-sheet analytic **landscape** (height = `|f|`), and a
domain **Riemann sphere** — all principal-branch. It cannot show a function's **true Riemann surface**
(multiple sheets glued across branch cuts), which is the natural next view for the multivalued primitives
users type (√, ⁿ√, `z^{p/q}`, log, inverse trig). The obstacle is that `@cas/expr` is single-valued
end-to-end ([ADR-0005](#adr-0005-expr--interchange-are-the-keystone) deferred multivalued `expr`), and a
naive height field paints a **spurious vertical wall** at a branch cut that reads as real structure.

There is no single algorithm that turns an arbitrary user expression into a correct Riemann surface; the
literature (Trott/Wolfram, Wegert, Nieser–Poelke–Polthier/Kranich) is a *ladder* of methods matched to
function class. See [`docs/design/riemann-surface-research-notes.md`](design/riemann-surface-research-notes.md).

### Decision

Add a **`riemann` render mode** to the plotter, built on the existing 3D stack (camera, mesh, `colorAt`).
Ship the **parametrize-by-w** method first: for a recognized invertible primitive `w = A·P(α z+β)+B`
(P ∈ {sqrt, log, arcsin, arccos, arctan} or a fractional power), sample the value plane `W`, plot
`(Re g(W), Im g(W), charisma(W))` with `z = g(W)` and color `colorAt(A·W+B)`. The sheets glue
automatically, so the mode **never performs — and never depends on — globally-consistent sheet
continuation through branch collisions**, the exploratory, never-certified problem the repo flags in
[`RISKS.md`](RISKS.md) §3 and `apps/correspondences/src/orbitTree.ts`.

Keep the inverse registry + branch-point detection **in the app** (`src/riemann/`), reusing `@cas/expr`
for both backends; **extract nothing** and add **no interchange form** until a second consumer exists
([ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need) is symmetric). Every result is honestly
labeled: exact glued topology, `≈` sampled values, a badge for finite sheet-count truncation, and the mode
is *only offered* when the map is a recognized primitive (else "principal-branch only").

### Options Considered

#### Option A: Parametrize-by-w first (chosen)
**Pros:** textbook-correct surfaces for the canonical multivalued primitives; reuses `compileF` /
`makeComplexFn` with zero new numeric code (the inverse is just another expression); sheets glue with no
branch-tracking; sidesteps the never-certified continuation problem entirely; coloring + height are affine
in the mesh UV, so they interpolate exactly. **Cons:** needs a symbolically-known single-valued inverse —
does not cover composites with no global inverse (e.g. `log(sin(√z))`), which fall back to the labeled
principal-branch views.

#### Option B: Algebraic-curve triangulation now (Kranich proximity gluing)
**Pros:** the most general single method for the whole *algebraic* sublanguage as one glued surface; the
exact tools exist (`@cas/exact` `discriminant`, `@cas/core` `rootsMonic`). **Cons, and why deferred:**
substantially heavier (AST→`P(z,w)=0` reduction, per-vertex root-finding, adaptive subdivision, Web-Worker
mesh caching); WebGL loses geometry-shader parallelism; visible holes near ramification at low depth. High
value but wrong first step — it is M2, gated on its own approval.

#### Option C: Multi-sheet stacking by z-grid analytic continuation
**Pros:** covers some composites over the z-plane. **Cons, and why rejected as the lead:** it *requires*
nearest-value / phase-unwrap continuation, whose failure modes (a branch point inside a cell, silent
cut-healing that violates true monodromy) are exactly [`RISKS.md`](RISKS.md) §3 — strictly weaker and
riskier than Option A wherever an inverse exists. Reserved, `≈`-only, for the M3 monodromy explorer.

#### Option D: A separate `apps/riemann-surface`
**Pros:** clean slate. **Cons:** the request is explicitly an addition *to the plotter*; a new app would
duplicate the entire render/expr/coloring/permalink stack it already shares — against the north-star
("each new tool builds fewer primitives from scratch").

### Trade-off Analysis

Option A delivers the headline capability at the lowest risk and the highest reuse, and it is the only
option that structurally cannot produce the misleading, uncertified output the guardrails forbid. B is the
right *second* method (broadest algebraic coverage) but is a large, independent build. C's continuation is
the genuinely hard, exploratory core the suite has deliberately never certified; confining it to a labeled
M3 explorer keeps the honest-labeling guardrail intact. In-app machinery honors ADR-0007 symmetry (no
extraction without a second consumer) and leaves the clean extraction seams (`render3d/`, a `@cas/branch`)
for when one appears.

### Consequences

- **Easier:** the plotter gains true Riemann surfaces reusing its whole stack; a permalink additively
  carries the new mode; the two later methods (B, C) have a recorded home and rationale.
- **Harder:** a second inverse/branch consumer will want `src/riemann/` extracted (the anticipated
  ADR-0007 trigger, like the `mat4.ts` "third consumer" note for `render3d/`); until then the machinery is
  app-local by design.
- **Revisit if** any of: (a) a receiving tool needs a serializable multivalued map (⇒ design the
  [ADR-0005](#adr-0005-expr--interchange-are-the-keystone) branch-aware interchange); (b) a second consumer
  needs the inverse registry / branch detection (⇒ extract `@cas/branch`); (c) M2/M3 are approved (⇒
  follow-on ADRs for the algebraic engine and any `@cas/core`/`@cas/exact` primitive they pull).

### Action Items
1. [x] Write [`docs/design/riemann-surface-plan.md`](design/riemann-surface-plan.md) +
       [`riemann-surface-research-notes.md`](design/riemann-surface-research-notes.md) and this ADR at the
       M0 gate.
2. [ ] Land M0 (spike) + M1 (parametrize-by-w mode) test-guarded on
       `claude/riemann-surface-rendering-fvybo6`; keep the existing top-down-3D≡2D golden green.
3. [ ] When (and only when) approved, land M2 (algebraic curves) — record a follow-on ADR for the
       `P(z,w)=0` engine and any shared primitive it needs — then M3 (monodromy explorer, `≈`-labeled).
       *(M2a approved + recorded as [ADR-0029](#adr-0029-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing).)*
4. [ ] On a second consumer of `src/riemann/`, extract `@cas/branch` and supersede this ADR's in-app note.

---

## ADR-0029: Algebraic-curve Riemann surfaces (M2a single-radical, NPP proximity gluing)

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*Follow-on to [ADR-0028](#adr-0028-riemann-surface-mode-in-the-plotter-parametrize-by-w-branch-machinery-in-app)
(anticipated in its Action Item 3). Extends the plotter's Riemann view from single invertible primitives to
**algebraic** functions via the Nieser–Poelke–Polthier / Kranich proximity-gluing algorithm, scoped this pass
to the **single-radical class** `w = R(z)^(p/q)` (R rational, constant coefficients). Records the method, the
scope, the roots-of-unity sheet specialization, the new `@cas/core` dependency, and the deferral of
`@cas/exact`-based elimination (M2b) and multivalued interchange (ADR-0005). Full plan:
[`docs/design/riemann-surface-M2-plan.md`](design/riemann-surface-M2-plan.md).*

### Context

M1 (ADR-0028) renders the true Riemann surface for one invertible primitive of an **affine** inner
(`A·P(αz+β)+B`). It declines algebraic composites — `sqrt(z^2−1)`, `sqrt(z^3−z)`, `(z^2−1)^(1/3)`,
`sqrt((z−1)/(z+1))` — whose surfaces are the classical multi-sheeted objects. The literature's
web-implementable method is NPP/Kranich (research notes §2.2): triangulate the z-domain, enumerate the `n`
sheets per vertex, proximity-stitch, and adaptively subdivide near the branch locus (leaving holes at
ramification points so cuts never render as walls). The suite already has the general tools it needs at
scale — `@cas/exact` `resultant`/`discriminant` and `@cas/core` `rootsMonic` — but the **single-radical**
subclass does not need them for the sheets: the `q` sheets of `R(z)^(p/q)` are elementary (`q`-th
powers/roots of `R(z)`).

### Decision

Ship **M2a** — `w = R(z)^(p/q)` with R a rational function of z and constant (rational-expressible)
coefficients — as a **`curve` kind** of the existing `riemann` mode. Sheets are the `q` distinct values of
`R(z)^(p/q)` (roots-of-unity specialization, **no per-vertex polynomial solve**); the mesh is built by NPP
proximity gluing on a Web Worker and cached; branch points (zeros of R and its poles, via `@cas/core`
`rootsMonic` on the `@cas/expr fToRational` numerator/denominator) drive adaptive subdivision + ramification
holes, with a local near-degeneracy backstop and a badged triangle-budget cap. Height = `Re w`, color =
shared `colorAt`. **Dispatch prefers M1's exact parametric surface**; the curve path takes only maps M1
declines. Keep everything **in-app** (ADR-0007); pull **`@cas/core`** only; leave **`@cas/exact`** for M2b.

> **Update (M2.1 as built):** M2a shipped with **no new package deps.** The branch points of this class are
> exactly the zeros/poles of R, which the mesh's *local* degeneracy test (`minSep → 0`) and the `wCap` catch
> directly — so `@cas/core rootsMonic` proved unnecessary and was not pulled. Adaptive subdivision is driven
> by the local test (no precomputed branch-point list); mesh-gen is synchronous (fast enough for M2a grids;
> the Web Worker is deferred). This strengthens the north-star (zero new primitives) and does not change the
> decision, only its dependency footprint.
>
> **Update (M2b as built):** radical **sums / products / ratios** (`√z + √(z−1)`, `√(z²−1) + z^(1/3)`,
> `1/√z`, `2·√(z²−1)`) shipped **without `@cas/exact` resultants** — via **root-of-unity branch injection**:
> the k-th branch of `Rᵢ^(pᵢ/qᵢ)` is its principal value × `ωᵢ^{pᵢk}`, so every sheet is the principal
> expression with a constant factor at each (structurally-deduped) radical node. `detectAlgebraicCurve`
> enumerates all `∏qᵢ` combos (cap 16) as ASTs reusing `makeComplexFn`; `curveMesh` was generalized to a
> `sheetsAt` spec that subsumes M2a. Exact, spurious-branch-free, **still no new deps.** `@cas/core` /
> `@cas/exact` are now reserved for **M2c** (a direct implicit `F(w,z)=0` input — genuinely coupled roots
> need per-vertex solving + an exact discriminant), specced in the plan §9.

### Options Considered

#### Option A: M2a single-radical, sheets as roots of unity (chosen)
**Pros:** the `q` sheets are elementary (no iterative root solve → fast, robust, no convergence/conditioning
failure per vertex); no symbolic elimination, so **no spurious "conjugate" branches**; covers the headline
algebraic cases (elliptic `sqrt(z^3−z)`, `sqrt(z^2−1)`, cube roots of rationals); needs only `@cas/core`
for branch-point location. **Cons:** does not cover radical *sums* (`√z + √(z−1)`), which have genuinely
coupled sheets — deferred to M2b.

#### Option B: General `P(z,w)=0` now (per-vertex `rootsMonic`, `@cas/exact` elimination)
**Pros:** one method for all algebraic composites. **Cons, why deferred:** radical **sums** need iterated
`@cas/exact` resultants to build `P`, which introduce spurious branches that must be filtered by continuity
from the principal sheet — real complexity and higher-degree `P` (more per-vertex solving, worse
conditioning). High value but the wrong first step; it is M2b, gated on its own approval.

#### Option C: A `@cas/riemann` / `@cas/branch` package now
**Pros:** a home for the mesh + branch machinery. **Cons:** ADR-0007 is symmetric — no second consumer yet.
Keep it in `src/riemann/`; the `mat4.ts`-style "second consumer triggers extraction" note already stands
(ADR-0028).

### Trade-off Analysis

M2a is the maximal robust subset: it delivers real algebraic surfaces at low risk because the sheet values
are closed-form, sidestepping both the root-conditioning and the spurious-branch problems that make the
general curve hard. Reusing `@cas/core` (not re-implementing a solver) honors the north-star; deferring
`@cas/exact` avoids pulling the heavy exact-elimination path before radical sums (M2b) actually need it. The
M1-preferred dispatch keeps the cheapest exact path for the primitives M1 already nails.

### Consequences

- **Easier:** the plotter gains the classical algebraic Riemann surfaces reusing M1's mode/camera/coloring;
  the general path (M2b) has a recorded home and rationale.
- **Harder:** a `curve` mesh is heavier than M1's parametric grid (worker + cache); a budget cap bounds it
  (badged). Radical sums remain declined until M2b.
- **Revisit if** any of: (a) M2b/M2c approved (⇒ `@cas/exact` elimination + spurious-branch filter, or an
  implicit-input mode — follow-on ADR); (b) a second consumer needs `src/riemann/` (⇒ extract, per
  ADR-0028 Action Item 4); (c) a receiving tool needs a serializable multivalued map (⇒ ADR-0005
  branch-aware interchange).

### Action Items
1. [x] Write [`docs/design/riemann-surface-M2-plan.md`](design/riemann-surface-M2-plan.md) + this ADR.
2. [x] Land M2.0 (spike, `sqrt(z^2−1)`) then M2.1 (full `R(z)^(p/q)`) — both **zero new deps** (local
       degeneracy + `wCap`); existing tests (incl. top-down-3D≡2D) kept green.
3. [x] Land M2b (radical sums / products / ratios) — via **root-of-unity branch injection**, not
       `@cas/exact` resultants; still zero new deps.
4. [ ] When (and only when) approved, land M2c (implicit `F(w,z)=0` input) — the first consumer of
       `@cas/core` per-vertex root-solving + `@cas/exact` discriminant here; follow-on ADR (plan §9).

---

## ADR-0030: Riemann-surface exploration tools (M3 — hover-pick, linked base-plane, monodromy)

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*Follow-on to [ADR-0028](#adr-0028-riemann-surface-mode-in-the-plotter-parametrize-by-w-branch-machinery-in-app)
and [ADR-0029](#adr-0029-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing). Turns the
Riemann view from a **renderer** into something **interrogable**: read the multi-sheeted value under the
cursor (M3.1), see the branch/cut structure beside the surface on a linked base plane (M3.2), and trace how a
loop permutes the sheets (M3.3, monodromy). Records the pick method, the local-branch-ordinal readout, the
reuse of the linked-view scaffold, and — critically — the confinement of the `≈`/uncertified monodromy
explorer. Full plan: [`docs/design/riemann-surface-M3-plan.md`](design/riemann-surface-M3-plan.md).*

### Context

M1 (ADR-0028) and M2 (ADR-0029) render the surface but leave it **mute**: no way to ask "what value is *this*
point", no spatial link to the base plane, no way to watch a loop swap sheets — the three things a Riemann
surface is *for*. The plotter already has a value inspector (catalog H1) for the 2D portrait and the 3D
landscape, but the landscape's pick (`render3d/pick.ts`) ray-marches a **single-valued** height field
`z = h(re, im)`; a Riemann surface stacks sheets over the same base point, so that pick cannot be reused. The
subtle piece is monodromy: analytic continuation around a loop is exactly the never-certified operation the
repo flags ([RISKS](RISKS.md) §3).

### Decision

Ship **M3** as three gated, app-local milestones, **no new packages** (ADR-0007 — reads existing geometry),
in the approved order **M3.1 + M3.2, then M3.3**:

- **M3.1 — multi-sheet hover-pick.** One uniform CPU **pick mesh** for both render paths: per vertex
  `xy = (Re z, Im z)`, `w` (value), and a **height basis** `hb` (the uniformizer `t` for the M1 parametric
  path, the value `w` for the M2 curve path) — so world height `= (heightSource? hb.im : hb.re)·heightScale`
  matches the shader's law and survives a height-axis/exaggeration change without a rebuild. A pure-geometry
  ray-cast (Möller–Trumbore, nearest hit, double-sided) returns the on-surface `z`/`w`; a point-in-triangle
  **sheet census** at that `z` gives `N` distinct sheet values and the hovered sheet's **local ordinal** `k`.
  Report `z`, `w`, `|w|`, `arg w`, and `k / N` — all `≈`.
- **M3.2 — linked base-plane pane.** Reuse the `paintLinked` split-viewport scaffold to pair the flat base
  plane with the surface, hover-linked, with branch-point markers.
- **M3.3 — monodromy explorer.** Opt-in loop drag + nearest-match continuation + a permutation readout —
  `≈`, uncertified, low-confidence-flagged, and **quarantined** from the badge, the permalink, and every
  export (RISKS §3).

### Options Considered

#### Option A: Uniform triangle-mesh pick + local branch ordinal (chosen)
**Pros:** one pick path serves both the parametric and the baked-curve surfaces; a real depth-sorted ray-cast
picks the sheet the eye actually sees (self-occlusion honest); the branch ordinal `k / N` is well-defined at a
point and exactly computable from the drawn mesh; near a branch point `N` honestly drops as sheets merge. No
continuation, so **no RISKS §3 exposure** in M3.1/M3.2. **Cons:** the ordinal is *local*, not a global sheet
identity — but a global one does not exist without fixing monodromy (M3.3), so claiming one would be
dishonest; labeled accordingly.

#### Option B: Reuse the height-field ray-march (`pick.ts`)
**Cons, why rejected:** the march assumes a single-valued `h(re, im)` — precisely what a Riemann surface is
not. It would silently return one sheet's height and mislabel overlapping sheets. Multi-valuedness is the
whole subject; the pick must respect it.

#### Option C: Assign global sheet numbers now
**Cons, why rejected:** global numbering *is* the monodromy representation — the thing M3.3 explores and that
RISKS §3 says is never certified. Baking a global integer into a hover readout would present uncertified
structure as fact. Deferred and confined to the opt-in M3.3 explorer.

### Trade-off Analysis

M3.1/M3.2 are pure geometry over geometry that already exists — maximal usefulness at minimal risk and zero
new primitives (north-star). M3.3 is the one place the plan buys a genuinely subtle capability (monodromy) at
the cost of certification, and fences it: opt-in, `≈`, and unable to write into any durable/exported artifact.
The uniform pick mesh (a single `hb` height-basis field) avoids branching the pick per render path and keeps
the height law identical to the shader, so pick and picture agree.

### Consequences

- **Easier:** the Riemann view gains the value inspector the other views have; the base-plane link gives
  spatial context for free from `paintLinked`; monodromy has a home that cannot contaminate the rest.
- **Harder:** the M2 curve arrays must be cached for the pick (were upload-and-discard); a large mesh makes
  the census O(triangles) per hover (throttled; a spatial index is a later optimization). M3.3 carries a
  standing honesty burden (its output is never certified).
- **Revisit if** any of: (a) a second consumer needs `src/riemann/pickMesh.ts` (⇒ extract, per ADR-0028
  Action Item 4); (b) M2c lands (implicit `F(w,z)=0`) — the pick mesh already takes an arbitrary `sheetsAt`,
  so it should carry over; (c) a receiving tool needs the monodromy data serialized (⇒ ADR-0005 branch-aware
  interchange — and only with the RISKS §3 labeling intact).

### Action Items
1. [x] Write [`docs/design/riemann-surface-M3-plan.md`](design/riemann-surface-M3-plan.md) + this ADR.
2. [x] Land M3.1 (hover-pick) — `riemann/pickMesh.ts` + `Plot.pickRiemann` + readout; node tests; both
       render paths; existing tests (incl. top-down-3D≡2D) kept green. **Paused for review.**
3. [x] Land M3.2 (linked base-plane pane) — a "Base-plane pane" toggle (not a new mode); reuse `paintLinked`;
       bidirectional hover-linking (crosshair). **Branch markers deferred to M3.4** (branch-point *location*
       pairs with the polish). Browser golden added; gate green. **Paused for review.**
4. [x] Land M3.3 (monodromy explorer) — `riemann/monodromy.ts` (nearest-match continuation + confidence
       flags) + `Plot.riemannSheetsAt`/`computeRiemannMonodromy` (exact for curves, census for parametric) +
       an opt-in loop-drag on the base pane. `≈`, low-confidence-flagged, and **quarantined** from the badge,
       permalink, and exports (RISKS §3). 10 node tests incl. the real √(z²−1) curve. Gate green.
5. [x] M3.4 (legibility polish) — **branch-point markers** (moved from M3.2): a uniform sheet-separation
       scan (`riemann/branchPoints.ts`), drawn on the base-plane pane + counted in the badge, `≈`. Per-sheet
       tint and cut-shadow were **considered and declined** on honesty grounds (global sheet identity is what
       monodromy permutes; a cut is a choice, not an invariant — the branch *points* are the invariant mark).

### Amendment (D/B arc — visual-intuition follow-ups)

Later additive work on the same branch, all inside the opt-in explorer and preserving the `≈`/quarantine
posture above (recorded here rather than as separate ADRs, being refinements not new decisions; the group-level
follow-on is [ADR-0033](#adr-0033-monodromy-group-and-fundamental-group-tools-generator-loops-permutation-diagram-genus)):

- **D1/D2 — direction arrows** on the base-plane loop *and* the lifted per-sheet paths, via AP's
  `drawDirectionTicks` lifted into `@cas/ui` (its second consumer — ADR-0007). **Real-time lift:** the surface
  paths now grow as the loop is drawn (incremental nearest-match continuation).
- **B2 — winding numbers** per branch point: `windingNumber(loop, center)`, exact integer topology (`=`),
  shown separately from the `≈` permutation it is the topological input to.
- **B1 — the principal branch cut** is now **drawn** for the M1 parametric primitives. This **refines** the
  M3.4 "a cut is a choice, not an invariant" note rather than reversing it: for the *auto-gluing* curve /
  implicit surfaces a cut remains an arbitrary choice and is **still not drawn** (`Plot.riemannCutRays()`
  returns `[]` there); it is drawn **only** where the surface is built on a *canonical principal branch* (√,
  ⁿ√, log, arcsin/arccos, arctan and their affine wraps), where the cut is determined by the principal-value
  convention — not a choice — and is genuinely where that branch is discontinuous. The branch *points* remain
  the primary invariant mark for every mode.

---

## ADR-0031: Implicit `F(w,z)=0` algebraic Riemann surfaces (M2c) — the plotter's first `@cas/core` + `@cas/exact` consumer

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*Follow-on to [ADR-0029](#adr-0029-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing)
(anticipated in its Action Item 4 / plan §9) and [ADR-0030](#adr-0030-riemann-surface-exploration-tools-m3-hover-pick-linked-base-plane-monodromy).
Extends the plotter's Riemann view from algebraic functions the user can *name* as radicals (M2a/M2b) to the
**general algebraic curve entered implicitly** as a bivariate complex polynomial `F(w,z)=0` — including the
curves with no radical form. Records the dedicated input-mode UX, the reuse of the M2 mesh + M3 exploration
stack through the `sheetsAt` seam, and the dependency additions (`@cas/core` `rootsMonic`; `@cas/exact`
`discriminant`) — the plotter's first consumers of both. Full plan:
[`docs/design/riemann-surface-M2c-plan.md`](design/riemann-surface-M2c-plan.md).*

### Context

M1 (ADR-0028) and M2a/M2b (ADR-0029) render every algebraic surface expressible as a **radical**. But by
Abel–Ruffini most algebraic curves (a general quintic `w⁵ + z·w + z = 0`) have no radical form, while their
Riemann surfaces are perfectly concrete. The whole M2/M3 stack is parametrized by ONE seam —
`sheetsAt: (z) => Complex[]` (the sheet values over a base point) — consumed unchanged by `buildCurveMesh`,
the M3.1 pick, the M3.3 monodromy, and the M3.4 branch scan. So covering the general curve needs only a new
`sheetsAt` source, not a new engine. And because `F` is entered **directly**, there are **no spurious
branches** (the problem that made building `P(z,w)` from radical sums by resultants the wrong first step in
ADR-0029's Option B): every root of `F(·,z)` is a genuine sheet.

### Decision

Ship **M2c** — an implicit `F(w,z)=0` bivariate-polynomial input (constant Gaussian/complex coefficients) as
a **new `implicit` kind** of the `riemann` mode, in a **dedicated input mode** (its own box + toggle, distinct
from the `f`/`g` slots, since an implicit relation is not a function; entering it pins the Riemann view and
disables the inapplicable tabs). A small app-local generic **bivariate expander** (`implicitPoly.ts`, over a
pluggable scalar ring) extracts the `w`-coefficients; `detectImplicitCurve` (`implicitCurve.ts`) builds a
`sheetsAt` that Horner-evaluates each `aₖ(z)` and solves the ascending list with **`@cas/core` `rootsMonic`**
per vertex (a leading-coefficient zero drops the degree ⇒ fewer sheets ⇒ a mesh hole, never a wall). The whole
M2 render/mesh + M3 exploration stack rides along unchanged via `riemannSheetsAt`. **M2c.2** adds the **exact**
branch locus (`implicitExact.ts`): for Gaussian-rational `F`, the roots of `disc_w F` via **`@cas/exact`
`discriminant`** — the locus `=`, coordinates `≈` — badged as `=K branch points`, falling back to the M3.4
`≈` scan for float coefficients. Keep the engine **in-app** (ADR-0007 — no second consumer); add **`@cas/core`
and `@cas/exact`** as dependencies (the plotter's first).

### Options Considered

#### Option A: Dedicated implicit mode + per-vertex `rootsMonic` + exact discriminant (chosen)
**Pros:** covers the whole algebraic-curve class; reuses the entire M2/M3 stack through the `sheetsAt` seam
(minimal new code); no spurious branches (direct `F`); the dedicated mode is honest that an implicit relation
isn't a function; the exact discriminant gives a `=` branch locus where the radicals' local scan was `≈`.
**Cons:** adds two dependencies (accepted — the anticipated first-consumer moment); per-vertex root-solving is
heavier than the radicals' closed form (bounded by a degree cap, badged).

#### Option B: Auto-detect `w` in the ordinary box, or an `= 0` equation (input-UX alternatives)
**Cons, why not:** both silently overload the `f(z)` box / blur the function-vs-relation distinction. The
dedicated mode was chosen for clarity (plan §6); all three share the same engine, so this is a front-door
choice only.

#### Option C: Emit `F(w,z)` from the radical recognizer via `@cas/exact` resultant elimination
**Cons:** an internal unification (make M2a/M2b share the implicit engine) that would reintroduce the spurious
branches ADR-0029 avoided; not needed for the user-facing implicit input. Left as a possible later refactor.

### Trade-off Analysis

M2c is the maximal-coverage step at low marginal cost: the `sheetsAt` seam means the surface, hover-pick,
linked pane, monodromy, and branch markers all work the moment the root-solve enumerator exists. Reusing
`@cas/core`/`@cas/exact` (not re-implementing a solver or a discriminant) honors the north-star; pulling them
now is exactly the demand ADR-0029 §9 foresaw. The degree cap + honest labels (`≈` roots, exact sheet count,
`=`/`≈` branch locus, no topology claims) keep it within the guardrails.

### Consequences

- **Easier:** the plotter renders the general algebraic Riemann surface, reusing all of M2/M3; the exact
  branch locus is available for Gaussian-rational curves.
- **Harder:** two new dependencies; per-vertex solving is heavier (degree cap, badged); the exact path is
  limited to Gaussian-rational `F` (float coefficients fall back to the `≈` scan — badged honestly).
- **Revisit if** any of: (a) a second consumer needs `src/riemann/implicit*.ts` (⇒ extract, ADR-0007);
  (b) a receiving tool needs the implicit map serialized (⇒ ADR-0005 branch-aware interchange); (c) the
  radical recognizer is unified onto the implicit engine (Option C — its own follow-on).

### Action Items
1. [x] Write [`docs/design/riemann-surface-M2c-plan.md`](design/riemann-surface-M2c-plan.md) + this ADR.
2. [x] Land M2c.0 + M2c.1 — `implicitPoly.ts` (generic bivariate expander) + `implicitCurve.ts` (`rootsMonic`
       `sheetsAt`) + the dedicated implicit mode (toggle, box, view pinning, permalink field); adds
       `@cas/core`. All M3 tools carry over via `riemannSheetsAt`. Node + browser tests.
3. [x] Land M2c.2 — exact branch locus (`implicitExact.ts`, `@cas/exact` `discriminant`), `=`-labeled, with
       the `≈` scan as the fall-back for float coefficients. Node tests.

---

## ADR-0032: Extract `@cas/ui` ahead of adoption; port CD's product shell

**Status:** Accepted — a **deliberate exception** to [ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need), of the same shape as [ADR-0018](#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore) but *milder* (the second-consumer bar is met many times over; only app-by-app **adoption** is deferred).

### Context

Every prior `@cas/*` package extracted the suite's *mathematics*. A 2026-08 cross-cutting UX review found the
suite's quality is **bimodal**: the two founder apps (Complex Dynamics, Quadrature Domains) are product-mature —
real keyboard a11y, WebGL fallbacks, `role="alert"` error banners, worker-offloaded solves — while the five
newer TS apps (riemann-map, argument-principle, faber-transform, correspondences, and to a lesser degree the
plotter) inherited the math rigor but **not** the product shell:

- **A11y (finding #2):** six of seven apps expose a bare `<canvas>` a screen reader cannot see; the four newest
  have **zero** keyboard handlers. Only CD is keyboard-operable.
- **Error UX (finding #3):** the newest apps have **no** fatal-error element — an uncaught `init` throw
  white-screens into an empty `<div id="app">`.
- **Threading (finding #4):** faber / correspondences / riemann-map run heavy solves **synchronously** on the
  main thread with no worker and no busy indicator — a hard input freezes the tab (correspondences even comments
  the hazard).
- **Navigation (finding #1) + interop:** navigation is one-way — once inside an app the only way back to the
  launcher or across to a sibling is the browser back button; and the celebrated cross-app hand-off is 3
  hard-coded `window.open` buttons with no discovery (`@cas/interchange` is a hub in the docs, three bilateral
  wires in the UI).

The root cause is structural: the extract-on-second-consumer rule ([ADR-0007](#adr-0007-incremental-extraction-driven-by-real-need))
was invoked constantly for math and **never once** for the shell, so the planned `@cas/ui` (VISION §6, ARCHITECTURE
§11, decision #8) stayed deferred while each new app re-implemented — or simply omitted — a11y / error UX /
threading / nav. Complex Dynamics already contains a **proven** implementation of all four.

### Decision

**Charter `@cas/ui` now — the suite's shared browser shell — by consolidating CD's proven patterns, then adopt it
app-by-app.** It is the eleventh `@cas/*` package, source-exports model (like `@cas/schwarz` / `@cas/conformal`),
and the **first with a real DOM surface** (its tests run under jsdom — the first non-node package environment;
the DOM libs are already in `tsconfig.base.json`). Four primitives, each a straight port of a CD reference:

1. **`mountCanvas`** / **`attachCanvasA11y`** — the accessible-canvas pattern (`apps/complex-dynamics/index.html:194-200`):
   an `aria-hidden` render canvas beneath a focusable `role="application"` overlay with a descriptive `aria-label`,
   a keyboard map (arrows pan, ± zoom, Enter/Space commit), and an `aria-live` status region. Two entry points share
   ONE implementation: `mountCanvas` builds the DOM; `attachCanvasA11y` applies the same contract to a canvas an app
   already built and lays out itself (added in U2 — Faber builds its own `gl`+`ov` panes, and a fresh mount would
   fight its CSS). `attachCanvasA11y` takes a `role`: `"application"` (interactive — focusable, keyboard wired) or
   `"img"` (a static visualization — named but not focusable, no keyboard; added in U3 for Correspondences' static
   views, since `role="application"` on a non-interactive canvas is an a11y anti-pattern).
2. **`runWithFatalBoundary` / `showFatalBanner`** — CD's init boundary (`main.ts:6876-6892`, `showFatalBanner`
   at `:260-266`): try/catch/finally, WebGL2-aware copy, boot-overlay removal; **creates** the banner if the app
   has none (fixing the white-screen).
3. **`createComputeClient`** — a generalization of `render/juliaMetricsClient.ts`: worker-offload with request
   coalescing + stale-response drop, a synchronous fallback, and an `onBusy` affordance.
4. **`mountNavHeader`** (+ the `SUITE_APPS` registry, seeded from the launcher as **data**, not imports) —
   back-to-launcher + sibling links, plus an optional "Send to…" hand-off picker.

**Why this is a (mild) ADR-0007 exception.** [ADR-0018](#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore)
extracted `@cas/conformal` with **zero** consumers. Here the demand is **proven across five to seven apps** by the
UX audit — so this is *not* extract-ahead-of-demand; it is extract-from-one-reference-implementation (CD) **ahead
of app-by-app adoption**. The only ADR-0007 tension is that the pattern lives in *one* app today rather than
having independently reappeared in two — but "would a second consumer want this?" is already answered six times.
The extract-ahead is retro-justified as each app adopts (Action Items 6–11), exactly as ADR-0018 AI-6 retro-justified
its builder when Schwarz–Christoffel landed.

**Scope boundary — QD is deliberately NOT a consumer.** Quadrature Domains is `allowJs`/vanilla
([ADR-0002](#adr-0002-typescript-as-the-common-language)), large, and *already* product-mature (the audit's
top half). Forcing it onto a strict-TS shell buys nothing and violates the ADR-0002 / [ADR-0008](#adr-0008-extract-casexact-keep-qds-sym-core-separate)
precedent of leaving QD's mature surface in place. `@cas/ui` targets the **six TS apps**.

**Dependency direction.** `@cas/ui` is a leaf UI package. In U0 it has **no** `@cas/*` runtime dependency (the
nav picker is caller-driven — the app supplies `accepts`/`hrefFor`); the `@cas/interchange` edge is added at U7
when the picker consults the known map kinds. App ids/labels are **data** in `apps.ts`, never imports, so
`no-package-to-app` and `no-cross-app` hold (dependency-cruiser confirms: clean).

### Options Considered

- **A — charter `@cas/ui` now, adopt app-by-app (this ADR).** *Pros:* one source of truth for the shell; each new
  app stops re-omitting it; consolidates CD's proven code rather than inventing. *Cons:* an extract-ahead-of-adoption
  (softens ADR-0007 — recorded, milder than ADR-0018).
- **B — per-app triage, extract only on the 2nd independent repetition.** *Rejected:* the reference already exists
  (CD) and six apps already need it, so waiting means each app hand-rolls (or re-omits) the shell first and is
  re-seamed later — the build-then-migrate waste [VISION §5](VISION.md#5-the-strategic-thesis) rejects.
- **C — keep omitting (status quo).** *Rejected:* it is the finding.
- **D — big-bang: adopt across all six apps in one change.** *Rejected:* violates working-software-per-step; a
  regression in one app blocks all. Adoption is one PR per app with a behavior-identical gate.

### Consequences

- **Easier:** every TS app can gain accessibility, a graceful failure, off-thread compute, and suite navigation by
  consuming a tested package instead of re-implementing (or skipping) each; the interop hand-off finally gets a
  discovery surface (U7).
- **Harder / owed:** an extract-ahead to be retro-justified by real adoption (U1–U6); the worker primitive's
  serialization boundary genuinely differs per app, so U0 ships the fallback + coalescing + busy state and each app
  wires its worker at adoption; a11y/perf remain **not** CI-enforced (a later, separate axe/pa11y job).
- **First DOM package:** `@cas/ui` introduces the jsdom test environment; its tests assert the a11y wiring
  (roles/labels/keyboard) and the sync-fallback path — the WebGL/worker paths are verified in-browser at adoption.
- **Revisit:** if adoption stalls after U1 (CD only), ADR-0007's symmetric "don't split without two" would invite
  folding the shell back; the U1 CD refactor (behavior-identical) is the first retro-justification.

### Action Items

1. [x] Charter ADR-0032 (this record).
2. [x] Scaffold `packages/ui` (source-exports; jsdom vitest env) with the four primitives + `SUITE_APPS`.
3. [x] jsdom unit tests for all four primitives (30 tests as of U6 — the U0 scaffold's 20 grew as U1–U6
   hardened the primitives); typecheck + lint + dependency-cruiser green.
4. [x] Register in `vitest.workspace.ts` + the test-census `PROJECTS` (a `ui` bucket).
5. [x] **U1:** adopt in Complex Dynamics **first**, as a *behavior-identical refactor* onto the shared versions —
   proving the API against the app it was ported from. Adopted the two primitives that are clean drop-ins:
   `runWithFatalBoundary` (replacing CD's inline `showFatalBanner` + init try/catch/finally, same `#webgl-error`
   banner and copy) and `createComputeClient` (CD's `JuliaMetricsClient` is now a thin adapter — its send-side
   coalescing test passes before and after). Proving `createComputeClient` against CD surfaced a behavior the U0
   primitive lacked — recovering the in-flight request when the worker dies (`cd-metricsworker-01`) — which was
   folded INTO the shared primitive (with its own worker-path tests), exactly what "prove against the app it came
   from" is for. `mountCanvas` and `mountNavHeader` are **not** adopted in CD here: CD's canvas is static
   two-plot HTML (converting it to a JS mount is not behavior-neutral) and a nav header is a new feature — both
   fit later apps / a deliberate rollout better than a behavior-identical CD refactor. Full CD suite green before
   and after (84 files / 833 tests).
6. [x] **U2–U6:** adopt in the five TS apps, one PR each, each closing that app's specific audit findings.
   **faber-transform DONE (U2):** wrapped its entry in `runWithFatalBoundary` (it had no error element — an init
   throw white-screened into the empty `<div id="app">`) and gave both render panes accessibility + keyboard via
   `attachCanvasA11y` (arrows pan / ± zoom the viewport, distinct `aria-label`s, the `gl` layer marked
   `aria-hidden`). Proving `mountCanvas` against Faber surfaced that apps build their own canvas + layout, so the
   primitive gained `attachCanvasA11y` (an attach mode over the shared code path) rather than forcing a fresh mount
   — the U2 analogue of U1's worker-recovery discovery. Verified with a headless-Chromium smoke (roles/labels/live
   region present, no fatal banner, ArrowUp pans + `+` zooms the permalink, no console errors) plus the primitive's
   jsdom tests. **correspondences DONE (U3):** both entrypoints (`main.ts`, `mating.html`'s `matingMain.ts`)
   wrapped in `runWithFatalBoundary` (both booted into a bare `<div id="app">`); the four STATIC views on the
   main page named with `role="img"` labels; the three interactive mating panels given `role="application"` +
   keyboard (←/→ move the shared equator angle θ, Enter traces its θ↦−2θ orbit) and the fold viewer `role="img"`.
   Proving against correspondences surfaced that a NON-interactive visualization must be `role="img"`, not
   `"application"` (which lies to assistive tech that keyboard is handled) — so `attachCanvasA11y` gained a
   `role: "application" | "img"` option (the U3 discovery, with a jsdom test). Verified with a headless-Chromium
   smoke over BOTH pages (static views img+labelled+not-focusable; panels application+focusable; ArrowRight moves
   θ to 2°; no fatal banner; no console errors); correspondences' 97 tests stay green. **riemann-map DONE (U4):**
   `main()` wrapped in `runWithFatalBoundary`; both pan/zoom panes made accessible + keyboard-operable by enriching
   the app's own `attachPanZoom` (nav.ts) with an optional `a11yLabel` — so the keyboard pan/zoom rides the SAME
   `get`/`set`/pan-lock as the pointer path, and both panes get it from one integration point. The left pane's
   decorative overlay canvas is marked `aria-hidden`. No new primitive gap surfaced (the attach + `role` API already
   covered it — the adoptions have converged). Verified with a headless-Chromium smoke (both panes
   application+focusable+labelled, overlay aria-hidden, keyboard `+` zooms the permalink, no fatal banner, no console
   errors); riemann-map's 60 tests stay green (nav.test.ts unaffected by the transitive @cas/ui import).
   **argument-principle + plotter DONE (U5+U6, batched):** both `main()`s wrapped in `runWithFatalBoundary`
   (arg-principle had no error element; the plotter reuses its existing `#error` banner — the wrap now catches
   init throws OUTSIDE its inner Plot try/catch that previously white-screened). arg-principle's three panes
   (z-plane, w-plane, argument strip) named `role="img"` (mouse-interactive, keyboard deferred — its contour
   drawing is the least keyboard-natural interaction). The plotter's `#view` was ALREADY fully accessible in
   static HTML (role/tabindex/label + its own `keyToNav` keyboard, `#axes` aria-hidden), so U6 added only the
   boundary. Two small primitive refinements fell out: `attachCanvasA11y` skips its keydown listener when no
   `onKey` is given (a `role="application"` canvas whose app owns keyboard — the plotter — just needs the
   name), and the live region falls back to `<body>` so naming a not-yet-attached canvas never appends into
   it. Both verified with a headless-Chromium smoke (arg-principle: 3 img-labelled panes, no fatal banner;
   plotter: `#view` a11y intact, no error shown; no console errors either); their 15 + 18 tests stay green.
   **This completes the app rollout (U1–U6).**
7. [ ] **U7:** wire the nav header's generic "Send to…" hand-off picker to `@cas/interchange`'s known map kinds
   (adds the `@cas/interchange` dependency), turning the 3 hard-coded deep-link buttons into discovery.
8. [x] **U8 DONE — non-blocking `axe` CI job so a11y regressions are caught, not just introduced-once-and-forgotten.**
   `scripts/a11y-audit.mjs` stands up a static server over the real `apps/*/dist` bytes (the deploy layout,
   launcher-at-root + subpaths, plus correspondences and its `mating.html`), loads each of the **9 pages** in
   headless Chromium under forced software WebGL2 (SwiftShader, so the audited DOM matches CI on any GPU), and runs
   axe-core's WCAG 2.0/2.1 **A + AA + best-practice** ruleset. Because real apps carry pre-existing findings
   (a contrast ratio, a missing landmark), it is a **baseline tripwire**, not a pass/fail on the absolute count:
   `scripts/a11y-baseline.json` records the known findings per page (rule id + violating-node count — node-count,
   not brittle CSS selectors, so it is robust to layout churn yet still catches "this rule now fails on more
   elements"), and only a **new rule** or an **increased count** is a regression. The CI job (`a11y` in `ci.yml`,
   PR-only like `build`) runs in **report mode** — always exit 0 — so a single flaky automated rule can never wedge
   `master`; regressions surface as `::warning::` annotations + a `$GITHUB_STEP_SUMMARY` table rather than a blocked
   merge. `--strict` (exit 1 on regression) is available for local hard checks; `--update-baseline` re-records after
   an intended change; `pnpm a11y` is the local entry point. Publishing stays gated only on lint/typecheck/test
   (deploy-pages.yml) — the a11y job, like `browser`, is not a publish blocker. The committed baseline documents the
   suite's remaining known findings (a burn-down list, separate from the tripwire). **First burn-down (done):** every
   axe **critical** and the **serious** label/keyboard-focus findings were fixed as attribute-level changes (no
   visual/behavior change) — riemann-map's unnamed preset `<select>` (`select-name`) and the mating fold slider
   (`label`) got `aria-label`s; QD's view-mode segmented control moved from `role="tablist"` (which demands
   `role="tab"` children it lacks) to `role="group"`, matching QD's own convention for its other segmented button
   groups (`aria-required-children`); complex-dynamics' three `title`-only inputs (`label-title-only`) gained
   `aria-label`s; and the horizontally-scrolling regions (CD's BibTeX `<pre>`, QD's KaTeX equation blocks) became
   keyboard-focusable (`scrollable-region-focusable`). Baseline tightened **16 → 10 rule findings / 56 → 46 nodes**;
   complex-dynamics and both correspondences pages now audit clean (launcher and plotter already did). What remains
   is deliberately deferred: **color-contrast** (a palette decision) and the **region / landmark / heading** cluster
   (a broader per-app semantic-HTML pass, `moderate` severity). **This completes U8; only U7 (nav-header ↔
   `@cas/interchange` hand-off wiring) remains open in this ADR.**

---

## ADR-0033: Monodromy-group and fundamental-group tools (generator loops, permutation diagram, genus)

**Status:** Accepted  **Date:** 2026-08  **Deciders:** Andrew

*Follow-on to [ADR-0030](#adr-0030-riemann-surface-exploration-tools-m3-hover-pick-linked-base-plane-monodromy).
Extends the opt-in **Monodromy explorer** from tracing one loop to reading the **whole branched cover**:
one-click **generator loops** around each branch point (a generating set of the base's fundamental group), a
**permutation diagram** per generator, and the derived **monodromy group**, connectedness, product-one
consistency check, and the **surface's genus** via Riemann–Hurwitz. Full plan:
[`docs/design/riemann-surface-fundamental-group-plan.md`](design/riemann-surface-fundamental-group-plan.md).
Also records the direction-arrow / real-time-lift / branch-cut / winding additions (D1/D2/B1/B2) that precede
it on the same arc, and reconciles the branch cut with ADR-0030's M3.4 "no cut" note (see Amendment there).*

### Context

The explorer (ADR-0030 M3.3) estimates the sheet permutation of **one** hand-drawn loop. But a branched cover
is characterized by its **monodromy representation** `ρ : π₁(base ∖ branch points) → Sₙ` as a whole: `π₁` is
free on one generator `γᵢ` per branch point, `ρ(γᵢ) = σᵢ`, and from `{σᵢ}` follow the monodromy group, whether
the surface is connected (transitivity), the product-one relation `σ₁⋯σₘσ_∞ = id`, and — via Riemann–Hurwitz —
the **genus**. All of this is reachable by reusing the M3.3 pipeline on *canonical* loops rather than arbitrary
ones. The hazard is honesty: every `σᵢ` is the never-certified continuation (RISKS §3), so the whole tower is
`≈` and must stay quarantined; only the *combinatorial topology* (free-group rank, the product-one **form**,
Riemann–Hurwitz **given** the cycle data) and the winding numbers are `=`.

### Decision

Ship as gated, app-local, additive milestones (no new packages — ADR-0007, single consumer), inside the
already-opt-in explorer, in the order **C1 → C3 → C2 → C4**:

- **C1 — generator loops.** A chip per branch point auto-draws a CCW loop around it (radius keyed to the
  nearest-neighbor distance), certified by the B2 winding number (`= +1` about its own point, `= 0` about the
  others) and run through the existing `computeRiemannMonodromy` + lift. Prefers the exact discriminant branch
  points when available. New pure `src/riemann/generatorLoop.ts`.
- **C3 — group + genus.** New pure `src/riemann/permGroup.ts`: compose/inverse/cycleType, BFS subgroup closure
  (**capped**) with order + transitivity, the product-one check, and `riemannHurwitzGenus`. Surfaced as an
  `≈`, quarantined summary.
- **C2 — permutation diagram.** Sheet-coloured node/arrow diagram per `σᵢ`, pure render from a
  `MonodromyResult`.
- **C4 (optional) — a report panel** binding C1–C3 together.

### Options Considered

#### Option A: reuse the M3.3 pipeline on canonical generator loops (chosen)
**Pros:** no new continuation engine — the risky part is unchanged and already fenced; the only new code is
loop *generation*, finite-group *algebra*, and Riemann–Hurwitz *arithmetic*, all pure and unit-testable; the
winding number (B2, `=`) certifies each generator; the product-one relation is a free self-check on the
estimates. **Cons:** results inherit M3.3's `≈`; clustered branch points can defeat automatic generator sizing
(mitigated: winding self-check + hand-draw fallback).

#### Option B: symbolic monodromy from the defining polynomial (Puiseux / exact analytic continuation)
**Cons, why rejected:** a large new exact-CAS capability (Puiseux expansions, certified tracking) — precisely
the RISKS §3 problem the repo declines to certify; disproportionate to a visualization feature and a second
engine to maintain.

#### Option C: leave it at one-loop monodromy (status quo)
**Cons, why rejected:** the user asked to connect the loops to the fundamental group; the group/genus is the
intellectual payoff and is cheaply reachable by Option A without touching the certified/uncertified boundary.

### Trade-off Analysis

Option A keeps the certification boundary exactly where ADR-0030 drew it (continuation is `≈`, quarantined) and
buys real mathematical depth with only pure, bounded, testable additions. The genus is the sharpest example: it
is *exact given* the cycle structure, so the tool honestly reports "genus ≈ 1 (exact given the estimated
cycles)". The BFS cap bounds cost for high-degree implicit surfaces. Everything is behind the opt-in explorer,
so the default plotter is untouched (north-star: no regression, no new primitive built from scratch — it rides
M3/D/B).

### Consequences

- **Easier:** the explorer becomes a genuine covering-space instrument (generators, group, connectedness,
  genus) with no new risk surface; the product-one check turns the `≈` uncertainty into a visible signal.
- **Harder:** a standing honesty burden (as M3.3) — the group/genus are `≈` and must never leak into badge /
  permalink / export; automatic generator sizing needs the winding self-check to stay trustworthy.
- **Revisit if** (a) a second consumer needs `permGroup.ts` ⇒ extract to `@cas/core` (ADR-0007); (b) a
  receiving tool wants the monodromy representation serialized ⇒ ADR-0005 branch-aware interchange, RISKS §3
  labeling intact; (c) exact monodromy (Option B) is ever justified by a non-visualization consumer.

### Action Items
1. [x] Write [`docs/design/riemann-surface-fundamental-group-plan.md`](design/riemann-surface-fundamental-group-plan.md) + this ADR (C0).
2. [ ] C1 — `generatorLoop.ts` + branch-point chips (winding-certified) + tests; gate; pause for review.
3. [x] C3 — `permGroup.ts` (capped closure + orbit transitivity + Riemann–Hurwitz genus with the exact
       parity/bound consistency check) + lasso/enclosing loops (common-labeling generators + the ∞ loop) +
       `Plot.riemannSheetCount` + a **Monodromy group & genus** summary. `≈`, quarantined. Verified √(z²−1) →
       C₂ genus 0 and w²=z³−z → genus 1. (`∞` handling: inferred from the enclosing loop's cycle type, per
       the design doc's open question.)
4. [x] C2 — permutation diagram (`permDiagram.ts`, canvas, sheet-coloured nodes + `k→σ(k)` arrows) shown per
       generator in the group summary + test. Also switched parametric branch points to the exact cut-ray
       origins (`Plot.riemannParamBranchPoints`), replacing the mesh-limited scan (fixes `z^(1/3)`'s spurious
       24 → 1).
5. [x] C4 — a theme-aware full-screen **Monodromy report** (fingerprint stats · π₁ generators gallery with
       diagrams + branch-point locations · the Riemann–Hurwitz computation worked out with the numbers ·
       honest ≈ framing), opened from the inline summary; shared `gatherMonodromy()` behind both. Layout only.
6. [x] All `≈` outputs stay quarantined (badge / permalink / export); the Riemann–Hurwitz **parity/bound
       check** is surfaced as the consistency signal (an odd/negative result ⇒ "inconsistent estimates"),
       standing in for the ordering-sensitive product-one relation.

---

## ADR-0034: The eighth app — `apps/2d-electrostatics` (the complex potential, as fields and flow)

**Status:** Accepted. A new **separate app** (decision #8), built on the shared `@cas/*` packages; no new
package (ADR-0007 — extract only on a second consumer). Plan:
[`design/complex-potential-studio-plan.md`](design/complex-potential-studio-plan.md).

### Context

The suite visualizes maps (dynamics, conformal maps, Faber, the argument principle) but nothing renders a
**field** — Dictionary I of the author's writeup *"Complex Analysis as Two-Dimensional Electrostatics and
Hydrodynamics"*, where a meromorphic function *is* a planar field and its poles *are* the sources. The
machinery to do so already exists: `@cas/expr` (the field as an executable expression), `@cas/gpu` (WebGL2
domain-coloring + the shared GLSL stdlib), `@cas/interchange`/`@cas/export` (permalinks + figure recipes),
and the new `@cas/ui` shell ([ADR-0032](#adr-0032-extract-casui-ahead-of-adoption-port-cds-product-shell)).
Online the space is open too (elementary-flow toys exist; transplant-through-arbitrary-maps, interactive
equilibrium-measure/capacity, and complex-charge QD twisting do not).

### Decision

Add **`apps/2d-electrostatics`** ("2D Electrostatics") — an interactive realization of the complex potential
`W(z) = φ + iψ`: drop and drag charges / sources / sinks / vortices / doublets and see the field as field
lines, equipotentials, streamlines, and a domain-colored field, with a single **lens** toggle relabelling the
same picture between the electrostatic and hydrodynamic readings.

1. **The organizing primitive is the complex residue `c = q + iγ` = charge + vortex** (paper §1.7), whose
   streamlines are logarithmic spirals of pitch `arctan(γ/q)`. The field is `E = W'`, evaluated exactly and
   per-pixel on the GPU (the closed-form, holomorphic field means no velocity texture and analytic derivatives).
2. **Conventions live at the app edge** (aligning with [ADR-0006](#adr-0006-convention-neutral-core)): the app
   adopts the paper's normalizations (`∮ dz/z = 1`, `dA = dx dy/π`, `E = Eₓ − iE_y`) exactly as the QD app does,
   while the shared `@cas/*` packages stay convention-neutral.
3. **Framing is hybrid:** a physics-first drop-and-drag sandbox core PLUS a first-class **theorem gallery** that
   turns the paper's dictionary into live pictures (its first entry, the flux/circulation probe, renders the
   residue theorem as Gauss's law (Re) + Kelvin circulation (Im) — exact for the closed-form field, labelled `=`).
4. **Adopts the `@cas/ui` shell from day one** (`mountCanvas` + `runWithFatalBoundary`); registered in
   `SUITE_APPS`, the launcher, and the combined Pages deploy.
5. **The Hele-Shaw "twisting" showpiece (M4) lives in this app**, importing the QD app's Schwarz reflection σ /
   Richardson moments via a new `@cas/interchange` recipe — keeping the QD app stable and making the hand-off
   itself a feature.
6. **Honest labelling** throughout (`=` closed-form fields / capacities / residue sums; `≈` numerical contours,
   Fekete relaxation, transplanted flows; `≤`/`⚠` the ill-posed Hele-Shaw evolution past a cusp).

Consumes `@cas/core`, `@cas/expr`, `@cas/gpu`, `@cas/interchange`, `@cas/export`, `@cas/ui` (M0–M1); adds
`@cas/conformal` (M2), `@cas/faber` (M3), `@cas/schwarz` (M4) as those milestones land.

### Consequences

- **Positive:** a new consumer of already-built machinery (north star); the biggest future consumer of
  `@cas/conformal` (M2's transplant), which retro-justifies a `ConformalMap` `@cas/interchange` form (deferred to
  a companion ADR when M2 lands); surfaces potential-theory quantities (capacity, equilibrium measure) that sit
  one relabel from the exterior-map machinery; and gives the author's writeup an interactive companion.
- **Deferred:** the `ConformalMap` + `flow` interchange forms (M2, a companion ADR — gate on the receiving tool,
  which this app becomes); the non-Laurent σ families and the QD df64 deep-zoom (unchanged).

### Status of the build

**M0–M3 complete** (verified in live headless-Chromium WebGL2). M0 (render spike) + M1 (the superposition
sandbox — palette, inspector with the `c = q+iγ` decomposition, the two-lens toggle, the flux/circulation
probe, presets, `#vs=` permalink + PNG export, a sensor puck, and an animated tracer-flow layer). **M2**
(conformal transplant): Joukowski + Kármán–Trefftz airfoils; exterior-SC flow *past* a polygon and interior-SC
flow *inside* a polygon; the `@cas/interchange` `conformal` map form ([ADR-0035](#adr-0035-the-conformal-casinterchange-form-polygon-schwarzchristoffel-maps-interchange-140)) with a bidirectional Riemann-Map ↔ 2D-Electrostatics
hand-off. **M3** (potential theory): the conductor-K view — equilibrium charge, capacity, Green's function —
with Faber-zero and Fekete/Leja overlays (three roads to μ_K), plus general K with no closed-form map via a
log-lightning fit. The app now also rides `@cas/conformal` (M2) and `@cas/faber` (M3). **M4a + M4b** (the
Hele-Shaw "twisting" showpiece): the exact Graven–Makarov one-point unbounded-QD family `QD(α/(w−w₀))`
driven by a complex charge `α = q + iγ` (thesis §3.3 closed form — engine `src/heleShawOnePoint.ts`), and
its `twist.html` showpiece page that scrubs/plays the growing, twisting droplet up to a double point (α>0)
or a (3,2)-cusp, with the conserved quadrature charge as the honest correctness monitor. App-local, no new
package. **M4c** (the general Polubarinova–Galin time-stepper) is now **built** as the *classical
interior-droplet* evolver — a bounded droplet `f(w,t)=Σ aₖwᵏ` grown from a central source by the numerical
PG flow (`≈`), a genuinely different, textbook-validated scenario from the exact exterior M4a family:
`src/heleShawInterior.ts` (the equation + a closed-form oracle — self-similar disk, the two-term
4/3-cusp solution, the linearized modal rates), `src/heleShawInteriorStepper.ts` (the Galin–Kufarev
**spectral** velocity solve — no least squares; it rides the new `@cas/core` `dftOnCircle`, an ADR-0007
second-consumer extraction alongside Faber Transform's `taylorViaFFT` — RK4 in coefficient space, the
conserved Richardson moments as the honest `≈` error bar, and a hard ⚠ cusp / suction stop), and the
`droplet.html` page. **M4d** (the QD → 2D-Electrostatics interchange import — adds `@cas/schwarz` +
interchange `1.5.0`) and **M4e** (surface-tension regularization) remain specced in the plan and deferred
to separately-approved passes.

---

## ADR-0035: The `conformal` `@cas/interchange` form (polygon Schwarz–Christoffel maps, interchange 1.4.0)

**Status:** Accepted. A new `MapSpec` form (`kind` stays `"map"`), reconstructed via `@cas/conformal`,
minted by 2D Electrostatics' M2.4 polygon transplant. Foreshadowed by
[ADR-0034](#adr-0034-the-eighth-app--apps2d-electrostatics-the-complex-potential-as-fields-and-flow) (the
"companion ADR when M2 lands"). Plan §6:
[`design/complex-potential-studio-plan.md`](design/complex-potential-studio-plan.md).

### Context

M2 of 2D Electrostatics transplants flow **past a polygon** — flow past the unit disk carried through the
exterior Schwarz–Christoffel map `Ψ: 𝔻* → ext(K)` (`@cas/conformal`). That makes the app the first **receiving
tool** for a conformal-map hand-off: the Riemann-Map studio already fits polygon SC maps, and a user who shapes
a polygon there should be able to see the flow past it here. Every prior interchange form was gated on exactly
this — a real consumer (ADR-0007); until M2 there was none, so ADR-0034 deferred the form. There now is one.

### Decision

Add **`form:"conformal"`** to `MapSpec` (schema **1.4.0**, a MINOR bump). It carries the polygon's SC data —
an `engine` tag (`"sc-interior"` | `"sc-exterior"` | `"lightning"`), the `polygon` corners (the portable
geometry), and the fitted `prevertices` wₖ / interior `angles` αₖ / accessory `constant` C / `capacity` /
`converged` / `degraded` / `residual`. A consumer rebuilds the map from the polygon via `@cas/conformal` —
**exactly the reconstruct-via-the-engine pattern of `form:"schwarz"`** (rebuilt via `@cas/schwarz`), with the
polygon corners playing φ's role as the recorded recipe. Like `schwarz`, it is **not expr-compilable**
(`mapSpecToExpr` throws with a reconstruct-via-`@cas/conformal` message); the runtime seatbelt validates the
engine enum, a ≥ 2-corner polygon, and the bounded/typed optional fit data so a hand-edited link is rejected.

1. **The polygon corners are the canonical geometry**; `engine`/`prevertices`/… are the producer's fit
   provenance. A consumer always re-derives the fit it needs — 2D Electrostatics reads an `"sc-interior"`
   producer's corners and fits its **own** exterior map. This keeps producer and consumer loosely coupled.
2. **Cross-app golden `RM_TO_POTENTIAL_CONFORMAL_LINK`** (the side-2 square, `cap = 1.1803405990161`): the
   interchange package pins the **decode + recipe shape**; 2D Electrostatics pins the **consumer-side capacity**
   its `@cas/conformal` re-fit computes. Both sides fail on drift (an app may not import another app, so the
   frozen bytes live in the shared package — the CLAUDE.md golden-corpus rule).
3. **2D Electrostatics is both producer and consumer**: it imports a `#s=` conformal link (setting an "Imported
   polygon") and exports its current transplant polygon (a "Copy link" ⧉ button, `engine:"sc-exterior"` or
   `sc-interior` depending on the active view).
4. **Riemann-Map is the cross-app producer**: a "Send to 2D Electrostatics ↗" button on a polygon region emits
   the golden's `engine:"sc-interior"` map (a **minimal** payload — corners + angles + converged, no drift-prone
   prevertices/capacity) and opens `2d-electrostatics/polygon.html` via a CD-style app-segment URL swap. Pinned
   byte-for-byte from the RM side, so the golden is now anchored on **both** producer and consumer.
5. **The `flow` envelope kind is deferred** (plan §6 lists it, but it has no consumer yet — ADR-0007). The
   full app-state hand-off (singularity list + map reference + convention tag) lands when a second tool needs it.

### Consequences

- **Positive:** the deferred M2 hand-off is live — the first non-`schwarz` reconstruct-via-engine form, and the
  first **`@cas/conformal`** interchange form; shared forward with future apps (fingerprints, circle packing).
  A MINOR bump decodes every older link unchanged (consumers gate on MAJOR = 1); the five pre-existing goldens
  are regenerated to the 1.4.0 label (byte-identical bar that label — none use the new vocabulary).
- **Deferred:** the `flow` envelope kind — the full app-state hand-off (singularity list + map reference +
  convention tag) — until a second consumer needs it (ADR-0007). The Riemann-Map producer deep link, initially
  deferred here, has since landed (decision 4 above), so the hand-off is now bidirectional and end-to-end.
