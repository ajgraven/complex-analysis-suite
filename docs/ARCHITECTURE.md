# Architecture

This document describes the **target** architecture. Not every package exists from
day one — see the [migration runbook](MIGRATION.md) for the order in which they come
into being, and [ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)
for why extraction is demand-driven rather than up-front.

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

### `@cas/ui` — the shared UI kit
KaTeX typesetting helpers; the inspector/readout card framework; complex-number slider
pads; the glossary framework; **URL-state / share-link serialization** and the
**reproducibility-metadata PNG embedding** (both apps already have versions of these —
unifying them is what makes deep-link hand-off work); theming (auto/dark/light).
Depends on `interchange` for the share-link payload types.

### `@cas/quadrature` — domain package
The Faber-transform machinery; the inverse solvers (classical/log-weighted/power,
bounded/unbounded, singular variants) and the direct-problem kernels; the
**Schwarz-reflection construction** (`σ = f∘η∘f⁻¹` from a uniformizing `φ`); boundary
observables. Extracted from the Quadrature app once a second consumer (the
correspondence app) needs the Schwarz-reflection construction.

### `@cas/dynamics` — domain package
Escape-time and smooth iteration count; Böttcher coordinate and external/parameter ray
tracing; cycle detection, multiplier, and Fatou classification; connectivity and the
potential-theoretic estimates. Houses the **(parabolic) Tricorn model space** the
correspondence tool straightens against.

## 4. The dependency rule

> **Packages import only from packages below them. Apps import packages. No app
> imports another app. No cycles.**

This is enforceable and should be enforced (ESLint boundary rules and/or
`dependency-cruiser`; see [MIGRATION Phase 1](MIGRATION.md#phase-1--unify-tooling-and-the-test-harness)).
It is what guarantees the north-star property: because a new app sits *on top of* the
package stack and pulls only downward, each new app builds fewer primitives than the
last — the primitives are already there, and the rule forbids the tangle that would
otherwise erode that benefit.

Concretely, the layering is: `core` → { `gpu`, `expr`, `interchange` } → { `ui`,
`quadrature`, `dynamics` } → `apps`. (`ui` depends on `interchange`; `quadrature` and
`dynamics` depend on `core` and may depend on `expr`/`gpu`; apps depend on whatever
they need, downward.)

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
- Every tool inherits `ui`'s share-links and reproducibility metadata, so any image or
  view from any tool is reproducible and linkable in the same way.

## 8. Build & deployment model

- Each **app** is an independent Vite build producing static files with relative asset
  paths (`base: "./"`), deployable to GitHub Pages (which the Dynamics app already
  does). Apps deploy **independently**; there is no single suite-wide version.
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
- **Dual-backend property tests for `expr`:** for random inputs, the GLSL output and
  the JS evaluator must agree within tolerance. The Dynamics app already flags
  "keeping the GLSL/JS backends in sync" as a gotcha; as `expr` becomes shared across
  three tools — and grows multivalued branch selection — this invariant must be tested,
  not assumed. See [RISKS §3](RISKS.md#hard-part-2-the-dualbackend-glsljs-sync-invariant-at-suite-scale).
- **Visual-regression harness (later):** both apps render images; a pixel-diff harness
  over a fixed set of views guards the renderers against regressions. Deferred, but
  named here so it has a home.

## 10. How the correspondence tool fits (forward reference)

The correspondence tool is `apps/correspondences`. It depends on `core`, `gpu`,
`expr`, `interchange`, `ui`, `quadrature` (for `σ`-construction), and `dynamics` (for
the Tricorn model). Its only genuinely new code is the **branch-aware correspondence
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
   and a link to each. Deployed at the suite's top-level GitHub Pages URL; each app keeps
   its own independent deploy underneath. This is the "menu to select between apps."
2. **A shared navigation header (later).** A small component promoted into
   `@cas/ui` and rendered by each app, offering a dropdown/menu to jump to the sibling
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

The launcher is scaffolded as a stub in Phase 0 (it can list the two existing apps
immediately) and grows as apps are added; the shared-nav header lands once
`@cas/ui` exists. See [MIGRATION](MIGRATION.md).
