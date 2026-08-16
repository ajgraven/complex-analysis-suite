# Architecture

This document describes the **target** architecture. Not every package exists from
day one — see the [migration runbook](MIGRATION.md) for the order in which they come
into being, and [ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)
for why extraction is demand-driven rather than up-front.

> **✅ As built.** The suite is now built, and the diagrams below are the *target*, not an
> inventory. What actually exists:
>
> - **Eight packages** were extracted: **`@cas/core`, `@cas/gpu`, `@cas/expr`,
>   `@cas/interchange`, `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`, `@cas/export`** — the last four
>   later than the phase plan, on the same second-consumer rule (`@cas/exact`: Complex Dynamics and
>   Correspondences both needed exact polynomial arithmetic; `@cas/schwarz`: the Schwarz-reflection σ
>   engine, shared by Complex Dynamics and Correspondences; `@cas/dynamics`: the inverse-Böttcher machinery,
>   ADR-0014; `@cas/export`: PNG `tEXt` metadata across three apps, ADR-0016). The **`ui` and `quadrature`**
>   packages sketched in the layer diagram and §3 were **never extracted** — no second consumer needed the
>   whole of either (the Correspondences app keeps its own σ-construction and parabolic-Tricorn model),
>   though the `ui` package's PNG-metadata half did later ship as `@cas/export`. That is the
>   [ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need) demand-driven rule working
>   as intended, not an unfinished migration.
> - **`@cas/core` shipped leaner** than §3 describes: it holds complex arithmetic, the
>   `ComplexAlgebra` contract, Durand–Kerner, and truncated series-multiply — **not**
>   Newton/deflation, mat4/camera helpers, or the full series library (all likewise left in the
>   apps for want of a second consumer).
> - **`@cas/gpu` shipped as a substrate**, not a turnkey renderer: df64 + the complex-GLSL
>   stdlib + shader compile/link + the dual-backend GLSL≈JS harness. The escape-time program
>   scaffold, colormaps, and sphere/projection remaps stayed in the apps.
>
> Read the package-specific claims below against this note, and see each package's own `README`
> for its real API surface.

## 1. The shape: layered packages + thin apps

```
┌─────────────────────────────────────────────────────────────────────┐
│  apps/            (thin; own UI, conventions, presets, deployment)    │
│    complex-dynamics   quadrature-domains   correspondences            │
│         │                    │                    │                   │
│         └──────────┬─────────┴──────────┬─────────┘                   │
│                    ▼                     ▼                             │
├─────────────────────────────────────────────────────────────────────┤
│  packages/  (domain layer)                                            │
│    quadrature   ── Faber transform, QD/LQD solvers, Schwarz reflection │
│    dynamics     ── escape-time, Böttcher, external rays, classification│
│         │                    │                                        │
│         └──────────┬─────────┘                                        │
│                    ▼                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  packages/  (foundation layer)                                        │
│    expr    ── one AST → GLSL + JS evaluator (single- and multi-valued) │
│    ui      ── KaTeX helpers, inspector cards, share-links, theming     │
│    gpu     ── WebGL2 escape-time substrate, df64 deep zoom, sphere     │
│    interchange ── typed hand-off schemas + deep-link codec             │
│         │           │           │           │                         │
│         └───────────┴─────┬─────┴───────────┘                         │
│                           ▼                                           │
├─────────────────────────────────────────────────────────────────────┤
│  packages/  (kernel)                                                  │
│    core    ── complex numbers, formal power/Laurent series,           │
│               polynomial & rational algebra, Durand–Kerner, Newton,   │
│               deflation, mat4/camera helpers.  Pure. No DOM. No WebGL. │
└─────────────────────────────────────────────────────────────────────┘
```

Dependencies point **downward only**. This is the load-bearing invariant of the whole
design; see [§4](#4-the-dependency-rule).

## 2. Why this particular decomposition

The boundaries are chosen so that each package is (a) genuinely reusable across
tools, (b) testable in isolation, and (c) free of anything app-specific. Three
boundaries deserve explicit justification:

- **`core` is kept ruthlessly pure** (no DOM, no WebGL, no conventions) because it is
  the hottest code (every orbit step touches complex arithmetic) and the most
  reused. Purity makes it trivially testable with golden values and safe to optimize.
- **`gpu` and `expr` are separate** even though they cooperate. `gpu` owns the WebGL
  machinery (context management, the escape-time program scaffold, df64, sphere and
  projection shaders); `expr` owns *turning a map into a shader body* (and into a JS
  evaluator). Keeping them separate means a tool can use the GPU substrate with a
  hand-written GLSL kernel, or use `expr` to target something other than the standard
  escape-time program. Their contract is small: `expr` produces a GLSL snippet for the
  iteration step; `gpu` wraps it into a full program.
- **`quadrature` and `dynamics` are *domain* packages**, one tier above the
  foundation. They hold reusable *mathematics* (Faber transforms, Schwarz-reflection
  construction; Böttcher recurrences, external-ray tracing, cycle classification) that
  is more than a primitive but still not app-specific. The correspondence app depends
  on **both** — it needs `quadrature`'s Schwarz-reflection construction and
  `dynamics`' Tricorn model space — which is exactly why they are packages and not
  buried inside their originating apps.

## 3. What each package owns

> Package names below use the placeholder scope `@cas/*`. Import paths are
> shown as `@cas/core`, etc.

### `@cas/core` — the kernel
Complex numbers (`{re, im}`); formal power- and Laurent-series arithmetic
(multiply, invert, exp, log, reciprocal, compose) — the shared successor to the
Quadrature app's `taylor.js` and the Dynamics app's Böttcher recurrences; polynomial
and rational algebra; **Durand–Kerner** simultaneous root-finding (today duplicated in
`faber-analysis.js`, `direct-common.js`, the param-slice worker, **and**
`render/critical.ts` — this package ends that duplication); Newton iteration with
line search and Brown–Gearhart deflation; `mat4`/camera helpers for the 3-D views.
**No DOM, no WebGL, no mathematical conventions.** Ships with a consolidated
golden-value test corpus.

### `@cas/gpu` — the WebGL2 substrate
Context creation and loss recovery; the escape-time program scaffold that takes a
GLSL iteration-step body and produces a full fragment program; **df64 (double-float)
deep-zoom** and perturbation/rebasing paths; the **Riemann-sphere** and **projection**
(log-polar, Poincaré) coordinate remaps; colormaps/palettes; HiDPI and progressive
(coarse-then-refine) rendering. This is the hardest extraction (the Dynamics app's
deep-zoom code is sophisticated and tightly coupled), so it is sequenced late — see
[MIGRATION Phase 5](MIGRATION.md#phase-5--extract-gpu-and-promote-expr).

### `@cas/expr` — the expression compiler (the keystone, part 1)
A single AST that emits **both** a GLSL shader body (for rendering) and a JavaScript
evaluator (for orbits, overlays, and tests) — promoted from the Dynamics app's
`src/expr`. Supports the complex operators/functions the apps need, including
`conjugate` (so anti-holomorphic maps like `z̄²+c` are first-class). **Extended for the
suite** in two steps: (i) confirm anti-holomorphic coverage; (ii) add
**multivalued / branch-aware** maps, which the correspondence tool requires (the
deleted correspondence is multi-valued where a Schwarz reflection is single-valued).
See [§5](#5-the-keystone-map-representation).

### `@cas/interchange` — the hand-off contract (the keystone, part 2)
The typed schema for objects passed between tools and the deep-link codec. Full spec
in [INTERCHANGE.md](INTERCHANGE.md). This is what makes "pass off a Schwarz reflection
from the Quadrature tool to the Dynamics tool" a one-line, type-checked operation
instead of an ad-hoc JSON blob.

> Of the three packages below, **`@cas/quadrature` was never extracted** and **`@cas/ui` only partly**
> (its PNG-metadata half shipped as `@cas/export`, ADR-0016; the rest stayed app-local) — the demand-driven
> rule (extract only when a second consumer needs it, ADR-0007) fired for them selectively — while
> **`@cas/dynamics` reached genesis**: its inverse-Böttcher core was extracted when the Riemann-map app
> became a second consumer ([ADR-0014](DECISIONS.md#adr-0014-extract-casdynamics-on-the-second-consumer-rule-riemann-map)),
> though that app has since **shed** it (ADR-0017), leaving Complex Dynamics the sole consumer.
> The suite now ships **ten** packages: `@cas/core`, `@cas/interchange`, `@cas/expr`, `@cas/gpu`,
> `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`, `@cas/export`, `@cas/conformal`, and `@cas/faber` (`@cas/exact`
> through `@cas/export` extracted later than the phase plan on the ADR-0007 second-consumer rule; `@cas/conformal`
> extracted *ahead* of demand, [ADR-0018](DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore);
> `@cas/faber` is the exterior Faber-transform engine behind the Faber Transform app, [ADR-0024](DECISIONS.md#adr-0024-faber-transform-app--casfaber--polygonal-k-via-the-exterior-sc-engine)).
> The sections are kept as design intent; each notes where the functionality actually lives today.

### `@cas/ui` — the shared UI kit *(partly built — PNG metadata shipped as `@cas/export`)*
Would hold KaTeX typesetting helpers; the inspector/readout card framework; complex-number slider
pads; the glossary framework; share-link serialization and reproducibility-metadata PNG embedding;
theming. **Status: only the PNG-metadata half shipped** — as **`@cas/export`** (ADR-0016), when three
apps each carried a byte-equivalent copy. The KaTeX / inspector / theming UI helpers remain app-local;
the versioned `#vs=` **view-state codec** is shared into `@cas/interchange`.

### `@cas/export` — figure-export primitives *(built — ADR-0016)*
Holds the PNG `tEXt` reproducibility metadata (`crc32`, `pngChunk`, `injectPngText(entries)`,
`readPngText`, `PNG_SIGNATURE`) — the "a figure carries its own recipe" mechanism that splices a
permalink / parameters into an exported PNG before `IEND` with a correct CRC-32, without touching a
pixel. Pure, DOM-free, convention-neutral (ADR-0006: byte manipulation, no maths). Consumers: Complex
Dynamics, the Complex-Function Plotter, and the Riemann-map studio. The natural future home for the
medium-term high-res / SVG export goal.

### `@cas/conformal` — the conformal-map builder *(built — ADR-0018, extract-ahead-of-demand)*
Holds the numerical **Riemann-map builder**: the Vandermonde–Arnoldi stable polynomial basis
(Brubeck–Nakatsukasa–Trefethen 2021), the **lightning** solver f: Ω → 𝔻 (Gopal–Trefethen 2019) with
corner-clustered poles, and the forward map g: 𝔻 → Ω. Built on `@cas/core` — including its Householder-QR
least squares (`lstsqHouseholder`), lifted into the numeric kernel from RM's `solve/` in the same step.
Convention-neutral (ADR-0006). It is **the one package extracted *before* a second consumer proved it needed
one** — a deliberate exception to ADR-0007
([ADR-0018](DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore)) — so the
Schwarz–Christoffel engine (roadmap step E) had a home to be born into. That engine is now **built into the
package** as its second engine — Gauss–Jacobi quadrature (`gaussJacobi.ts`/`scQuadrature.ts`), the SC
forward/inverse maps (`schwarzChristoffel.ts`), the parameter solver (`scParameterProblem.ts`, uniform cold start by default, warm-startable),
and the two-mode `fitSchwarzChristoffel` surface (`scMap.ts`) — retro-justifying the ahead-of-demand extract
([ADR-0020](DECISIONS.md#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode)). A
**third engine** followed — the **exterior** SC map 𝔻* → Ω for a bounded simple polygon
(`exteriorSchwarzChristoffel.ts` forward map + Laurent-at-∞ extractor, `exteriorScParameterProblem.ts` multi-seed
damped Gauss–Newton solve, sharing the extracted `gaussNewton.ts` driver with the interior solver) — added for
the Faber Transform app, a second SC family beside the interior one
([ADR-0024](DECISIONS.md#adr-0024-faber-transform-app--casfaber--polygonal-k-via-the-exterior-sc-engine)).
Consumers today: the **Riemann-map studio** — the lightning builder for smooth region maps, and the interior SC
engine for polygon (`corners`) domains — and the **Faber Transform app** — the exterior SC engine for polygonal
`K`. The near-twin least-squares solver in Quadrature Domains is the *anticipated* second consumer
of `@cas/core`'s `lstsqHouseholder`, but its adoption is deferred (the two diverged on rank-deficiency policy —
see ADR-0018).

### `@cas/faber` — the exterior Faber-transform engine *(built — ADR-0024)*
Holds the exterior Faber transform machinery behind the Faber Transform app: the Faber-polynomial recurrence
(from an exterior map's Laurent-at-∞ jet), exact rational images of monomial and pole inputs, and the truncated
series path for free-form `f`. Everything consumes one struct — `ExteriorMap = { c, laurent }` — so the engine is
blind to *how* φ was produced: a curated closed form (ellipse/deltoid/finite-Laurent QD) or a solved exterior
Schwarz–Christoffel map for an arbitrary polygon. Built on `@cas/core` (complex/poly algebra, series);
convention-neutral (ADR-0006: the Faber transform carries no π / 2πi). Sole consumer today: the Faber Transform
app. This is the domain package that the never-built `@cas/quadrature` (below) *would* have partly held — the
Faber half shipped standalone, demand-driven, when the app needed it.

### `@cas/quadrature` — domain package *(planned — not built as such; Faber half shipped as `@cas/faber`)*
Would hold the Faber-transform machinery; the inverse solvers (classical/log-weighted/power,
bounded/unbounded, singular variants) and the direct-problem kernels; the Schwarz-reflection
construction (`σ = f∘η∘f⁻¹`); boundary observables. **Status: never built as one package** — the
correspondence app builds its own σ (deltoid) rather than consuming the QD solver, so the solver/σ
machinery stayed inside `apps/quadrature-domains`. The **Faber-transform half did later ship**, demand-driven,
as the standalone **`@cas/faber`** (ADR-0024, above) when the Faber Transform app needed it — the same
"a slice becomes a package when a consumer needs it" pattern as `@cas/export` splitting out of `@cas/ui`.

### `@cas/dynamics` — domain package *(genesis — inverse-Böttcher + external rays extracted, ADR-0014)*
Holds the **inverse-Böttcher exterior maps** (the Laurent coefficients uniformizing the complement of a
filled Julia set — z^d+c / general polynomial / rational — and of the multibrot connectedness locus, the
capacity, a connectivity test, and boundary reconstruction) and the **external-ray tracing** for z²+c
(parameter- and dynamical-plane rays, depth scaling, angle parsing) — both extracted from Complex Dynamics
when the Riemann-map app became a second consumer
([ADR-0014](DECISIONS.md#adr-0014-extract-casdynamics-on-the-second-consumer-rule-riemann-map)).
**Now single-consumer:** the Riemann-map studio subsequently **shed** `@cas/dynamics` when it dropped local
dynamics in favor of importing a Böttcher map from Complex Dynamics over `@cas/interchange`
([ADR-0017](DECISIONS.md#adr-0017-the-complex-dynamics--riemann-map-hand-off-riemann-map-becomes-a-pure-2d-conformal-consumer)),
so Complex Dynamics is again the sole consumer (a weaker extraction rationale, recorded not reversed).
Still **app-local** (awaiting a second consumer): escape-time / smooth iteration count; the **bulb-angle
combinatorics** (`bulbRayAngles`, which needs the orbit-portrait code); cycle detection, multiplier, Fatou
classification; and the **(parabolic) Tricorn model space** (the correspondence tool reuses
Complex-Dynamics' tricorn preset via `@cas/expr`).

## 4. The dependency rule

> **Packages import only from packages below them. Apps import packages. No app
> imports another app. No cycles.**

This is enforced today by ESLint's `no-restricted-imports` boundary rules (see
[`eslint.config.js`](../eslint.config.js)); a `dependency-cruiser` check remains a planned
follow-on, not yet wired. It is what guarantees the north-star property: because a new app sits
*on top of* the package stack and pulls only downward, each new app builds fewer primitives than the
last — the primitives are already there, and the rule forbids the tangle that would otherwise erode
that benefit.

Concretely, the shipped layering is: `core` → { `gpu`, `expr`, `interchange` } → `apps`. (The
`@cas/ui` / `@cas/quadrature` / `@cas/dynamics` domain layer above `apps` was planned but never
extracted — see §3 — so apps depend directly on the shipped packages. `@cas/gpu` depends on
`@cas/expr`; `@cas/interchange` is standalone.)

## 5. The keystone: map representation

The single most important architectural idea in the suite is that **hand-off, code
sharing, and the correspondence tool all converge on one artifact: a shared way to
*represent and evaluate a map*.** Get this right and the rest follows; get it wrong and
every tool re-invents map evaluation.

The representation has two coordinated pieces:

1. **`expr`** — the *executable* form. Given a map, produce a GLSL body (to render it
   on the GPU) and a JS closure (to iterate it on the CPU) from one source of truth.
2. **`interchange`** — the *serializable* form. A structured, versioned description of
   a map (or a domain, or a parameter slice) that one tool emits and another consumes.

The two connect: an `interchange` `MapSpec` can be *compiled* by `expr` into an
executable map. That is the mechanism behind the motivating hand-off:

```
Quadrature app                                   Complex Dynamics app
──────────────                                   ────────────────────
builds σ = f∘η∘f⁻¹  ──serialize──►  interchange  ──compile via expr──►  renders σ's
(QD.Schwarz)          SchwarzReflection MapSpec        dynamical plane, Böttcher, rays, deep zoom
```

**Staging (why this de-risks the whole plan):**

- **Single-valued first.** A Schwarz reflection `σ` is single-valued, so the hand-off
  above works with `expr` **exactly as it exists today**. This is an early, motivating
  win requiring *no new mathematics* — see [MIGRATION Phase 4](MIGRATION.md#phase-4--interchange-and-the-first-hand-off).
- **Multivalued later.** The anti-holomorphic **correspondence** is the same idea,
  extended: the deleted correspondence `(f(w) − f(η(z)))/(w − η(z)) = 0` is
  multi-valued, so `expr` (and `interchange`) grow a branch-aware representation. The
  same extension that lets `expr` host correspondences is what later lets the suite
  hand off *correspondences*, not just reflections.

This staging means the keystone is exercised, and proven, on the easy case before the
hard case depends on it.

## 6. What deliberately stays in the app layer

Equally important is what is **not** shared. Pushing these into packages would couple
tools that should stay independent, and in the numeric cases would cause silent
errors:

- **Mathematical conventions.** The Quadrature app normalizes area (`dA = dx dy/π`, so
  the unit disk has area 1) and suppresses the `1/(2πi)` factor in contour integrals.
  The Dynamics app uses standard conventions. If a shared package baked in either, the
  other app's results would be wrong by a factor of `π` or `2πi`. Conventions live in
  the app (or domain-package) boundary; `core` is convention-free; the `interchange`
  format is defined in one canonical convention and each app converts at its edge. See
  [ADR-0006](DECISIONS.md#adr-0006-convention-neutral-core-packages) and
  [RISKS §2](RISKS.md#risk-convention-collision-silent-numerical-error).
- **Escape predicates.** The Quadrature Schwarz dynamics "escapes" when `σ` lands in
  `Ωᶜ`; the Dynamics tool escapes on `|z| > R` or convergence to a fixed point. These
  are app/domain semantics, not kernel concerns.
- **Parameter-space classifiers.** The Dynamics app iterates the critical point with
  the pixel as `c`; the Quadrature `param-slice` engine sweeps a *solver* parameter and
  classifies solver *outcomes*. Share the *substrate* (the adaptive-quadtree sweep, the
  worker pool, the classify-and-color plumbing); never the classifier itself.
- **Presets, tours, glossary content, deployment config** — inherently per-app.

The rule of thumb: **share the substrate, not the semantics.**

## 7. Cross-pollination (the upside beyond de-duplication)

Extraction is not only about removing duplication; it moves capabilities between
tools:

- The Quadrature app and the correspondence tool **gain df64 deep zoom** from `gpu` —
  which they currently lack and will want, because the limit sets of Schwarz
  reflections and correspondences are cusped and self-similar (exactly the deep-zoom
  case). *Caveat:* df64 transfers directly; **perturbation** deep zoom is tuned for
  *polynomial* maps and does not straightforwardly apply to rational/transcendental/
  multivalued maps, so expect df64 but not necessarily perturbation on the Schwarz side.
- The Dynamics app can **gain a quadrature-domain mode** or draw Böttcher external rays
  on the Quadrature app's limit sets, by depending on the `quadrature` package.
- Every tool shares the versioned `#vs=` **view-state codec** (`@cas/interchange`) for linkable
  views, and reproducibility-metadata **PNG embedding is now shared via `@cas/export`** (ADR-0016, §3);
  the `@cas/ui` package that would also have carried the KaTeX / theming UI helpers was never extracted.

## 8. Build & deployment model

- Each **app** is an independent Vite build producing static files with relative asset
  paths (`base: "./"`), so its assets resolve from any path; there is no single suite-wide version.
- **Publishing is automated.** `.github/workflows/deploy-pages.yml` runs on every push to `master`
  (and on `workflow_dispatch`), gates on `lint` → `typecheck` → `test` → `build`, then assembles
  **one combined Pages site**: `apps/launcher/dist` at the root, with `complex-dynamics/` and
  `quadrature-domains/` beneath it. Note the shape — apps build independently but publish
  *together*, as a single artifact, not as independent Pages sites.
- `apps/correspondences` is **built but not published** (kept in the build for CI parity; the
  launcher lists it as a non-linking "Coming soon" card). Publishing it means adding one `cp` to
  the assemble step and turning that card into a link.
- There are **two** workflows: `ci.yml` (jobs `build` + `browser`) and `deploy-pages.yml`. The
  `browser` job — the real-WebGL2 numeric backstop — lives only in CI and is *not* a publish
  blocker, so a GPU-only regression can reach the live site while still failing CI.
- Packages are **not** separately built or published: apps consume package *source*
  through the workspace, and each app's Vite build transpiles and bundles everything it
  imports. There is exactly **one build per app**. (This is the payoff of accepting a
  build step — it retires the awkward "pre-built ESM artifact with version pinning"
  scheme that a no-build Quadrature app would otherwise force. See
  [ADR-0003](DECISIONS.md#adr-0003-give-quadrature-domains-a-build-step-vite).)
- Because Vite/esbuild transpiles TypeScript *without* type-checking, a separate
  `tsc --noEmit` type-check runs in CI across the whole workspace — the type contract
  is only real if it is checked.

## 9. Testing architecture

- **One runner: Vitest**, across packages and apps. The Quadrature app's existing Node
  test suite is ported/adapted so the whole repo has a single green/red signal.
- **Golden-value corpora** live with the shared packages (especially `core`), so a
  change to a shared primitive is caught by tests representing *both* apps' needs — the
  mechanism that makes "fix a bug once" safe.
- **Dual-backend property tests for `expr`:** for a fixed corpus, the GLSL output and the JS
  evaluator must agree within tolerance. This is now **wired**: the node core (`@cas/gpu`
  `dualBackend.test.ts`) checks probe-shader assembly + the JS reference, and the CI **`browser`
  job** runs the ACTUAL WebGL2 GLSL (`pnpm test:browser`, headless Chromium/SwiftShader) against
  the JS backend — the automated backstop for GLSL/JS drift (and it guards the H1/H2 emitBody
  regressions). See [RISKS §3](RISKS.md#hard-part-2-the-dualbackend-glsljs-sync-invariant-at-suite-scale).
- **Visual-regression harness (later):** both apps render images; a pixel-diff harness
  over a fixed set of views guards the renderers against regressions. Deferred, but
  named here so it has a home.

## 10. How the correspondence tool fits (forward reference)

The correspondence tool is `apps/correspondences`. It depends on the shipped packages
(`@cas/core`, `@cas/gpu`, `@cas/expr`, `@cas/interchange`, `@cas/exact`, `@cas/schwarz`) — its
**σ-construction** (the deltoid Schwarz reflection) is no longer app-local: it was deduped onto the
shared `@cas/schwarz` engine at the σ hand-off (S2e, ADR-0007's second-consumer rule). Because
`@cas/quadrature` and `@cas/dynamics` were never extracted (§3), it reuses Complex-Dynamics'
**Tricorn** model space via a shared `@cas/expr` preset (app-local). Its only genuinely new code is the **branch-aware correspondence
engine** — enumerating the `d` branches of `f(w) = f(η(z))`, iterating an orbit *tree*
(the Quadrature app's Schwarz module already has "tree" painters to reuse), and
**branch continuation** (templated on the Mother Body Constructor's exclusive
bipartite root-matching), with high-precision local charts near cusps and parabolic
points built from `core`'s formal-series arithmetic. Whether it is a *separate app* or
a *mode inside the Quadrature app* is an [open decision](RISKS.md#open-questions-decisions-needed-from-you);
the default here is a separate app depending on the `quadrature` package, which keeps
the suite's "thin apps over shared packages" shape intact.

## 11. The launcher (unified menu without a unified shell)

**Decision (locked):** the suite is **separate apps that hand off to each other**, plus a
**unified menu** to move between them — *not* a single unified single-page shell that
owns every tool's state.

This is realized in two cheap, additive pieces:

1. **A launcher app (`apps/launcher`).** A small static landing page — its own trivial
   Vite app (or just an `index.html`) — that lists the tools with a one-line description
   and a link to each. It sits at the suite's top-level GitHub Pages URL with each published app
   under a subpath beneath it — one combined deploy, not independent per-app sites (see §8). This
   is the "menu to select between apps."
2. **A shared navigation header (later, not built).** A small component that would be promoted into
   a shared `@cas/ui` package (never extracted — §3) and rendered by each app, offering a dropdown to jump to the sibling
   apps (and, where a hand-off is meaningful, a "send this to <app>" action that uses the
   [interchange](INTERCHANGE.md) deep-link codec). This makes cross-navigation available
   *inside* each app without merging them.

**Why not a unified shell.** A single-page shell that hosts every tool as a tab would
have to own cross-tool routing, a shared global state store, and a merged build — a
materially heavier product with its own failure modes, and it would fight the
"independent, separately-deployable apps" property that keeps each tool simple and
shippable. The launcher + shared-nav approach delivers the *experience* of a suite (one
entry point, easy movement between tools, hand-off between them) at a fraction of the
cost and coupling. If a unified shell is ever wanted, it can be added later as *another*
app that embeds the others — but it is explicitly out of scope now.

The launcher is a static stub (`apps/launcher`) listing all three apps; the shared-nav header
remains **unbuilt** — it awaited a `@cas/ui` package that was never extracted (§3). See
[MIGRATION](MIGRATION.md).
