# CLAUDE.md — project context & working agreement

> This file is read automatically by Claude Code at the start of a session. It is the
> **authoritative** brief. The full reasoning lives in [`docs/`](docs/); read those for
> the *why*, but the decisions and guardrails here are binding.

## What this repository is

`complex-analysis-suite` — a monorepo for a growing **suite of complex-analysis /
complex-dynamics visualization tools** that share common packages and hand data off to
one another. North-star property: **each new tool builds fewer primitives from scratch
than the last.** It now unifies eight apps — Complex Dynamics, Quadrature Domains,
Complex Function Plotter, Riemann Map, Argument Principle, Faber Transform, and 2D
Electrostatics, plus the anti-holomorphic Correspondences tool (built, not yet published) —
riding eleven shared `@cas/*` packages.

Read the docs in this order before making changes: [`docs/VISION.md`](docs/VISION.md) →
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) → [`docs/DECISIONS.md`](docs/DECISIONS.md)
→ [`docs/MIGRATION.md`](docs/MIGRATION.md) → [`docs/INTERCHANGE.md`](docs/INTERCHANGE.md)
→ [`docs/RISKS.md`](docs/RISKS.md).

## Locked decisions (do not re-litigate; supersede via a new ADR if they must change)

1. **Monorepo**, pnpm workspaces, `packages/*` + `apps/*`. ([ADR-0001](docs/DECISIONS.md), [ADR-0004](docs/DECISIONS.md))
2. **TypeScript is the common language.** Shared packages are strict TS. App internals
   migrate to TS *incrementally, leaves-first*; gnarly app glue may stay
   `allowJs`/`// @ts-nocheck` **indefinitely** — full typing is NOT a goal. ([ADR-0002](docs/DECISIONS.md))
3. **Vite for both apps.** The Quadrature app moves onto Vite as a **bundler swap first,
   code still 100% JS** (`allowJs`), TS later. ([ADR-0003](docs/DECISIONS.md))
4. **`expr` + `interchange` are the keystone** (executable + serializable map
   representation). Single-valued hand-off first; multivalued/branch-aware later. ([ADR-0005](docs/DECISIONS.md))
5. **Core packages are convention-neutral.** The Quadrature app's `dA = dx dy/π` and
   `1/(2πi)`-suppressed contour conventions live at the app/domain edge; `@cas/core`
   contains **no** `π`/`2πi` normalization constants; the interchange format is canonical
   (standard) and convention-tagged. This prevents a *silent* factor-of-π/2πi error.
   ([ADR-0006](docs/DECISIONS.md))
6. **Extraction is demand-driven:** a primitive becomes a package when a **second
   consumer** needs it — and, symmetrically, two engines are not *merged* without one either.
   ([ADR-0007](docs/DECISIONS.md); worked example + the standing exception in
   [ADR-0008](docs/DECISIONS.md), which extracted `@cas/exact` and deliberately left QD's
   `sym-core.mjs` separate.)
7. **Package scope `@cas/*`** (internal, `workspace:*`, not published).
8. **Topology:** separate apps + a **unified menu** (a launcher page in `apps/launcher`,
   plus a shared nav header later). **No** unified single-page shell.
9. **Correspondence tool** is a **separate app** (`apps/correspondences`), quadratic-first
   (deltoid + circle-and-cardioid), with the **deltoid** as the first ground-truth
   milestone.
10. **Node 22 LTS** (`.nvmrc` = `22`, `engines.node >= 22`). *(This supersedes the "20"
    mentioned in some docs.)*
11. **Deployment:** each app builds static (`base: "./"`) so its assets resolve from any path.
    **`.github/workflows/deploy-pages.yml` publishes automatically on every push to `master`**
    (and on `workflow_dispatch`), gated on `lint` + `typecheck` + `test`. It assembles **one
    combined Pages site** — launcher at the root, `complex-dynamics/`, `quadrature-domains/`,
    `complex-function-plotter/`, `riemann-map/`, `argument-principle/`, `faber-transform/`, and
    `2d-electrostatics/` beneath it.
    `apps/correspondences` is **built but not published** (the launcher shows it as "Coming soon"). There are **two** workflows: `ci.yml` (the `build` + `browser` gate) and
    `deploy-pages.yml`; the `browser` job is not a publish blocker.

## Non-negotiable guardrails

- **Working software at every step.** Never leave the repo in a broken state; each
  [MIGRATION](docs/MIGRATION.md) phase gate is a shippable point.
- **Test-guard every refactor.** Consolidate on Vitest early; a module never moves
  without its tests green *before and after*; shared packages ship *with* a golden-value
  corpus representing both apps' needs.
- **One dependency direction:** packages import downward only; apps import packages; no
  app imports another app; no cycles. Enforced with ESLint `no-restricted-imports`
  (`eslint.config.js`); a `dependency-cruiser` check is also wired — `pnpm dep:check`
  (`depcruise packages apps`, config `.dependency-cruiser.cjs`), run inside `pnpm lint` and in CI.
- **Honest labeling** of computed results (`=` exact, `≤` rigorous bound, `≈` estimate) —
  especially anything from the correspondence tool's straightening/surgery, which is
  exploratory and must never read as certified.
- **Preserve provenance and backward-compat:** bring apps in with git history
  (`git subtree`); preserve or migrate each app's existing share-link URL formats before
  touching that code.
- **Don't over-reach.** Follow the phase order; extract only when a second consumer needs
  it; ask before large speculative refactors.

## Source repositories (fill in before running Phase 0)

```
CD_SRC=<path-or-URL to ComplexDynamicsJS>      # already Vite + TypeScript
QD_SRC=<path-or-URL to QuadratureDomains>      # currently vanilla JS, no build
```
`scripts/bootstrap-subtrees.sh` uses these to pull both apps in with history preserved.

## Status (Phases 0–6 complete)

The runbook is fully executed. Phases 0–2 (workspace skeleton, unified tooling/tests, QD→Vite
ESM-ification) and the shared-package extractions — **`@cas/core`** (Phase 3), **`@cas/interchange`**
(Phase 4), **`@cas/expr` + `@cas/gpu`** (Phase 5) — are done and merged. **Phase 6**
(`apps/correspondences`) is complete through Milestone C: the deltoid Schwarz reflection σ (CPU + GPU),
its deleted correspondence (branch engine + orbit trees + density render), the family parameter plane,
the parabolic-Tricorn model coordinate, and a follow-on interactive mating visualizer (`mating.html`).
Eight apps (the sixth, **Argument Principle**, ADR-0019 — it rides
`@cas/core`, `@cas/expr`, `@cas/interchange`, `@cas/export`; the seventh, **Faber Transform**, ADR-0024 — it
rides `@cas/core`, `@cas/expr`, `@cas/interchange`, `@cas/faber`, `@cas/conformal`, and `@cas/gpu`; the eighth,
**2D Electrostatics**, ADR-0034 — the complex potential W = φ + iψ as an interactive field of charges /
sources / vortices, extended through M2 (conformal transplant of flows past/inside airfoils and polygons),
M3 (a potential-theory conductor view — capacity, equilibrium measure, Green's function, Faber/Fekete points),
and M4a/M4b (the Hele-Shaw "twisting" showpiece — the exact Graven–Makarov one-point unbounded-QD family
driven by a complex charge, closed-form engine + a `twist.html` scrub/play page; M4c–M4e deferred),
riding `@cas/core`, `@cas/expr`, `@cas/gpu`, `@cas/interchange`, `@cas/export`, `@cas/ui`, `@cas/conformal` (M2),
and `@cas/faber` (M3)) ride the eleven shared `@cas/*` packages
(`@cas/core`, `@cas/interchange`, `@cas/expr`, `@cas/gpu`, `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`,
`@cas/export`, `@cas/conformal`, `@cas/faber`, `@cas/ui`) — `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`, and `@cas/export` were all extracted later
than the phase plan, on the ADR-0007 second-consumer rule; `@cas/exact` and `@cas/schwarz` are each used by
Complex-Dynamics and Correspondences, `@cas/dynamics` (Böttcher exterior maps + external rays) by
Complex-Dynamics (its original second consumer, the Riemann-map studio, shed it — see below), and
`@cas/export` (PNG `tEXt` reproducibility metadata) by Complex-Dynamics, the plotter, the Riemann-map
studio, and Argument-Principle. The plotter and Riemann-map apps plus `@cas/dynamics` (ADR-0010–0014) landed
on `master` alongside the σ arc. (The launcher consumes no packages.)

**`@cas/export` + CD → Riemann-Map hand-off + Riemann Map goes pure-2D (merged, #257):**
The eighth package **`@cas/export`** collapses three byte-equivalent copies of the PNG `tEXt` metadata code
(CD / plotter / Riemann-map), and three shared GLSL snippets fold into `@cas/gpu/glsl` (ADR-0016). Complex
Dynamics gains its first interchange **producer** — a "Riemann Map ↗" deep link that exports a filled Julia
set's Böttcher map as a `kind:"map"` `LaurentMap`; the **Riemann-map studio** becomes the **consumer** (an
"import" disk-image source) and sheds its whole dynamics + GPU stack (the escape-time Julia mode, dynamics
analysis, external rays, local Böttcher, generic domain-coloring modes, and the fragment-shader pipeline),
dropping `@cas/dynamics`, `@cas/schwarz`, and `@cas/gpu` to render **pure-2D**. It now consumes only
`@cas/core`, `@cas/export`, `@cas/expr`, and `@cas/interchange` (ADR-0017; supersedes ADR-0014's RM-consumer
premise, narrows ADR-0013). Cross-app golden `CD_TO_RM_BOTTCHER_LINK` pins both sides.

**`@cas/conformal` + `lstsq` → `@cas/core` (step D, merged #259):**
The **ninth** package **`@cas/conformal`** is carved out of the Riemann-map app — the conformal-map builder
(the Vandermonde–Arnoldi stable basis, the lightning solver f: Ω → 𝔻, and the forward map g: 𝔻 → Ω) — with the
real Householder-QR least-squares primitive `lstsqHouseholder` beneath it lifted into **`@cas/core`**. This is
the suite's **first deliberate extract-*ahead*-of-demand** (ADR-0018): unlike every prior package it preceded
its second consumer (Schwarz–Christoffel, roadmap step E — **now landed**, next paragraph) — a recorded exception
to ADR-0007. Riemann Map drops its whole `src/solve/` directory and consumes `@cas/conformal`; it now rides
`@cas/core`, `@cas/conformal`, `@cas/export`, `@cas/expr`, and `@cas/interchange`. Quadrature Domains' near-twin
least-squares solver is documented as the *deferred* second consumer of core-`lstsq` — the two diverged on
rank-deficiency policy (RM zero-fills at `1e-300`; QD throws at `1e-13`, with `condEst`-driven refinement its
cusp Newton solver needs), so QD's solver is **not** rewired in this step.

**Schwarz–Christoffel engine + Riemann-map polygon regions (step E, merged #263; pan-lock #264):**
`@cas/conformal` gains its **second engine** — a Schwarz–Christoffel map builder (𝔻 → bounded simple polygon),
which is the **second consumer** that retro-justifies ADR-0018's extract-ahead (ADR-0018 Action Item 6 → done).
Its one new numeric primitive is Gauss–Jacobi quadrature (`gaussJacobi.ts` Golub–Welsch + `scQuadrature.ts`
compound `d<ℓ/(3√2)` subdivision), kept **in-package** (ADR-0007: SC is its sole consumer). The public
`fitSchwarzChristoffel` (`scMap.ts`) is **two-mode** (ADR-0020, method-choice record): **precise** reaches
machine precision on convex **and** reentrant polygons — forward (`schwarzChristoffel.ts`) *and* inverse
(ODE+Newton, Driscoll–Trefethen) — via the parameter solve (`scParameterProblem.ts`, softmax gap gauge +
damped Gauss–Newton, each step one core `lstsqHouseholder`; uniform cold start by default, lightning-seedable
through `warmStart`); **fast** reuses the lightning fit (instant, warm-startable, ~convex-reliable,
`degraded`-flagged on strongly reentrant shapes). Outputs carry
honest `converged`/`degraded`/`residual` labels (guardrail). **Riemann Map** wires it in: `fitRegion` routes
polygon `corners` domains through the SC engine (lightning for smooth regions), the region picker offers the
polygon presets, and the left disk-pane pan is **locked** for the region source so the fixed unit disk cannot
drift (#264). **No new package** (SC lives inside `@cas/conformal`); **no `@cas/interchange` form yet**
(deferred, ADR-0007 — gate on a receiving tool) — *since superseded: the `conformal` form landed in
ADR-0035 once 2D Electrostatics became the receiving tool*. Plan + literature: [`docs/design/schwarz-christoffel-plan.md`]
(docs/design/schwarz-christoffel-plan.md) / [`schwarz-christoffel-research-notes.md`]
(docs/design/schwarz-christoffel-research-notes.md).

**Riemann-map SC studio — reentrant polygons · exact both directions · prevertex viz · draggable editor
(Phases A–C):** the app's step-E SC wiring deepens into an interactive studio. **Reentrant presets** (L-shape,
cross) join the polygon picker — the precise solve's reentrant-corner accuracy made visible. The **Ω→𝔻 direction**
now routes polygons through the exact SC engine too (the conformal grid drawn by the FORWARD map — cheap + exact;
the ODE `inverse` reserved for the single hover query) instead of the approximate lightning fit, so **both directions
are exact for polygons** (smooth regions keep the lightning fit), honestly `=`/`≈`-labelled with mode / `degraded` /
interior-angle stats. The **prevertices wₖ ↔ corners
vₖ** correspondence is drawn colour-matched across the two panes, with interior-angle `αₖ·π` labels and hover-linking.
Polygon **vertices are draggable** directly on whichever pane shows Ω (image pane in 𝔻→Ω, source pane in Ω→𝔻): a drag
forks to an editable **"Custom polygon"** (named presets stay fixed), refits **fast (lightning) while dragging** and
**precise (warm-started) on release** (ADR-0020's drag-then-refine), with ＋/－/reset tools; the custom polygon rides
in the `#vs=` view-state so a permalink reopens the exact hand-drawn shape. Still **no `@cas/interchange` SC form**
(deferred, ADR-0007) — *since superseded by the `conformal` form (ADR-0035)*. A follow-on **exterior-disk preset gallery** (#288) adds closed-form univalent maps
ψ: 𝔻\* = {|z|≥1} → the exterior of a compact `K` (Joukowski / vertical-slit / ellipse / deltoid / star) shown in
an interactive pan/drag/zoom **image pane**. (See [`apps/riemann-map/README.md`](apps/riemann-map/README.md).)

**QD → CD σ hand-off (QD-HANDOFF-2 + S5, merged — σ peer view #246, σ multi-view explorer #255; interchange 1.3.0):**
Quadrature Domains exports its Schwarz reflection σ as a `@cas/interchange` `form:"schwarz"` recipe
(closed-form φ + branch of the inverse); Complex Dynamics reconstructs σ via `@cas/schwarz` and renders
its escape-time field on the GPU as a first-class **peer view** (ADR-0009), `≈`-labeled. Covers the
unbounded-Laurent family (pole-free deltoid + finite-pole QDs, complex leading `c`) and the **bounded**
family (φ: 𝔻 → Ω, interior branch, interchange 1.3.0) — both importable AND authorable natively in CD's
σ φ-form. Full per-increment detail in [`docs/refactor/LOG.md`](docs/refactor/LOG.md) and
[`docs/design/SIGMA-HANDOFF.md`](docs/design/SIGMA-HANDOFF.md).

**Faber Transform app + `@cas/faber` + polygonal K via exterior Schwarz–Christoffel (ADR-0024, T2.3 = DONE):**
The seventh app, **Faber Transform** (`apps/faber-transform`), visualizes the exterior Faber transform
Φφ: 𝒜(𝔻) → 𝒜(K) — an analytic `f` on the unit disk domain-colored beside its Faber image `Σ bₙ Fₙ` on the
bounded complement `K`. Its engine is the tenth package **`@cas/faber`** (Faber-polynomial recurrence, exact
rational images, exterior-map Laurent jets). Domain class now spans ellipse / deltoid / finite-Laurent QDs
**and arbitrary polygons**: **M1a** regular-polygon presets (closed-form), **M1b** arbitrary convex + reentrant
polygons via a new **exterior** Schwarz–Christoffel engine carved into `@cas/conformal`
(`exteriorSchwarzChristoffel.ts` forward map + `exteriorScParameterProblem.ts` multi-seed damped Gauss–Newton
solve, sharing the `gaussNewton.ts` driver with the interior solver + a Laurent-at-∞ extractor), and **M2**
adaptive Laurent truncation, per-corner norm annotations `Λₖ = max{αₖ, 2−αₖ}`, and a draggable-vertex polygon
editor. This is `@cas/conformal`'s **second SC family** (exterior alongside ADR-0020's interior), and Faber
Transform is the exterior engine's sole consumer (ADR-0007) — *since joined by 2D Electrostatics (ADR-0034),
which drives both SC engines*. Polygon domains are honestly `≈`-labeled;
degenerate/failed fits render `⚠` with blank panels. **M3** adds the corner-**suppressing** weighted Faber
polynomials `Q_{n,m}` — a `@cas/faber` engine (`weightedFaberPolynomial`, `Q_{n,m} = Σⱼ gⱼ F_{n−j}`, no new
numerics: the weight `G_m = ∏(1−w_k/φ)^{1/m}` rides the SC prevertices `w_k = 1/u_k` and the existing `F_n`),
an app toggle + strength slider (monomial inputs on a polygonal K), and a before/after `|Fₙ|` vs `|Q_{n,m}|`
boundary-overshoot profile (paper Fig. 2). T2.3 is complete (M1a + M1b + M2 + M3). Plan:
[`docs/design/faber-polygonal-sc-plan.md`](docs/design/faber-polygonal-sc-plan.md). A follow-on **custom φ
(formula)** domain source (`symbolicPhi.ts`) lets the user type a symbolic exterior map φ(z) = c·z + Σ cₖ z⁻ᵏ:
a rational φ is extracted **exactly** by Laurent-at-∞ reciprocal-polynomial division (finite Laurent = `=`,
finite-pole tail = `≈`), a transcendental φ falls back to `taylorViaFFT` (`≈`); a complex leading term is
rotated to the real-positive capacity gauge, and an area-theorem check (`Σ k·|cₖ| ≤ c`) honestly flags a
possibly non-univalent φ. Everything downstream (Faber images, ∂K, rendering) reuses the existing
`ExteriorMap` pipeline unchanged.

**`@cas/ui` — the shared browser shell (ADR-0032, U0–U6):** the **eleventh** package, and the suite's first
extract-*ahead*-of-adoption of a **product** (not math) layer, prompted by a UX review that found the newer apps
inherited the math rigor but not the product shell. `@cas/ui` collects four primitives ported from Complex
Dynamics' proven patterns — `mountCanvas`/`attachCanvasA11y` (accessible canvas: focusable `role="application"`
overlay + keyboard, or `role="img"` for a static view), `runWithFatalBoundary`/`showFatalBanner` (init inside a
WebGL2-aware fatal-error boundary), `createComputeClient` (worker-offload + coalescing + sync fallback + busy
state), and `mountNavHeader` (back-to-launcher + sibling nav + a deferred "send to" hand-off picker) — plus the
`SUITE_APPS` registry. It is the first package whose tests run under **jsdom**. Adopted app-by-app: **CD** (the
fatal boundary + `JuliaMetricsClient` on `createComputeClient`), **faber-transform**, **correspondences** (both
pages), **riemann-map**, **argument-principle**, and the **plotter** — closing each app's a11y / fatal-error UX
findings. **QD is deliberately NOT a consumer** (allowJs/vanilla and already product-mature; it took `@cas/schwarz`
as a devDependency only, for the ADR-0026 σ drift-guard). **U8 is now done** — a **non-blocking `axe` CI job**
(`a11y` in `ci.yml` → `scripts/a11y-audit.mjs` + `scripts/a11y-baseline.json`, or `pnpm a11y`) audits all nine
built app pages in headless Chromium against a per-page baseline, surfacing a11y *regressions* as `::warning::`
annotations + a step summary without ever blocking a merge (publishing stays gated only on lint/typecheck/test).
Still open: **U7** (wire the nav header's hand-off picker to `@cas/interchange`'s known map kinds — the one place
cross-app interop becomes user-visible). Two correctness guards also landed this arc: a **convention-neutral**
scan over `@cas/core` (ADR-0006 AI-2) and a **Schwarz σ differential** guard between QD's engine and `@cas/schwarz`
(ADR-0026 AI-2).

Deferred / exploratory (not started): further correspondence families (circle-and-cardioid → cubic
Chebyshev → general d:d), the remaining non-Laurent σ families (power-weighted PQD, log-weighted LQD),
analytic branch continuation through cusps (uncertified — RISKS §3), and QD Schwarz df64 deep-zoom.
See [MIGRATION](docs/MIGRATION.md) for the phase specs and gates.

Work in small, reviewable commits. Pause at each phase/milestone gate for review before proceeding.
When a command or path in the docs is marked `⚠ verify`, check it against the actual repo
contents rather than assuming.
