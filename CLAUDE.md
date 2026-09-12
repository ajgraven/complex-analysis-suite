# CLAUDE.md — project context & working agreement

> This file is read automatically by Claude Code at the start of a session. It is the
> **authoritative** brief. The full reasoning lives in [`docs/`](docs/); read those for
> the *why*, but the decisions and guardrails here are binding.

## What this repository is

`complex-analysis-suite` — a monorepo for a growing **suite of complex-analysis /
complex-dynamics visualization tools** that share common packages and hand data off to
one another. North-star property: **each new tool builds fewer primitives from scratch
than the last.** It now unifies twelve apps — Complex Dynamics, Quadrature Domains,
Complex Function Plotter, Riemann Map, Argument Principle, Faber Transform, 2D
Electrostatics, 2D Hydrodynamics, Hele-Shaw Flow, Potential Theory, and Contour Integration, plus the
anti-holomorphic Correspondences tool (built, not yet published) — riding thirteen shared `@cas/*`
packages.

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
    `complex-function-plotter/`, `riemann-map/`, `argument-principle/`, `faber-transform/`,
    `2d-electrostatics/`, `2d-hydrodynamics/`, `hele-shaw-flow/`, `potential-theory/`, and
    `contour-integration/` beneath it.
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

## Getting set up (any machine — local or cloud)

**The toolchain is pinned; do not improvise it.** Node **22** (`.nvmrc`, `engines.node >= 22`) and
**pnpm 9.15.9** (`packageManager` — `corepack enable` honours it). Nothing else is required: no
global installs, no native build tools, no GPU.

```bash
pnpm install
pnpm build
```

**The gate — run it after your LAST edit, never before it:**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Green is **494 test files / 4616 tests** with lint and typecheck silent. `pnpm lint` includes
`pnpm dep:check` (dependency-cruiser). `pnpm test` builds the `packages/*` dists first, so a clean
clone can run it directly. Two suites behave unusually: the Quadrature-Domains maths runs as a
separate headless runner wrapped as one Vitest spec (`node app/node-test.js`), and `packages/ui` is
the only jsdom project. **Never pipe the gate through `tail` or `head`** — doing so has truncated
real failures before.

Dev servers go through `.claude/launch.json` (one entry per app, each with its port), not a bare
`vite` left running in the background.

**Line endings are LF everywhere**, enforced by `.gitattributes`. The index was always LF; before
that file existed, a Windows checkout produced a CRLF working tree and two gate tests failed locally
while passing in CI. If that split ever reappears, suspect the checkout before the code.

*Historical:* `scripts/bootstrap-subtrees.sh` pulled Complex Dynamics and Quadrature Domains in with
their history during Phase 0. Both were imported long ago; the script is kept for provenance only.

## Status (Phases 0–6 complete)

The runbook is fully executed. Phases 0–2 (workspace skeleton, unified tooling/tests, QD→Vite
ESM-ification) and the shared-package extractions — **`@cas/core`** (Phase 3), **`@cas/interchange`**
(Phase 4), **`@cas/expr` + `@cas/gpu`** (Phase 5) — are done and merged. **Phase 6**
(`apps/correspondences`) is complete through Milestone C: the deltoid Schwarz reflection σ (CPU + GPU),
its deleted correspondence (branch engine + orbit trees + density render), the family parameter plane,
the parabolic-Tricorn model coordinate, and a follow-on interactive mating visualizer (`mating.html`).
Eleven apps (the sixth, **Argument Principle**, ADR-0019 — it rides
`@cas/core`, `@cas/expr`, `@cas/interchange`, `@cas/export`; the seventh, **Faber Transform**, ADR-0024 — it
rides `@cas/core`, `@cas/expr`, `@cas/interchange`, `@cas/faber`, `@cas/conformal`, and `@cas/gpu`; the eighth,
**2D Electrostatics**, ADR-0034 — the complex potential W = φ + iψ as an interactive field of charges /
sources / vortices, extended through M2 (conformal transplant of flows past/inside airfoils and polygons — a
producer AND consumer of the `@cas/interchange` conformal-map hand-off, ADR-0035); its potential-theory and
Hele-Shaw pages split out into their own apps (ADR-0036, the two below), and its airfoil transplant into
2D Hydrodynamics (ADR-0037), leaving it the field sandbox + the polygon transplant, riding `@cas/gpu`,
`@cas/flow`, `@cas/interchange`, `@cas/export`, and
`@cas/ui`; the ninth, **Hele-Shaw Flow**, ADR-0036 — the *time-evolving* free-boundary pages split out of 2D
Electrostatics: the exact Graven–Makarov one-point unbounded-QD "twisting" showpiece (`twist.html`, closed-form
`=`) and the classical interior-droplet Polubarinova–Galin evolver (`droplet.html`, numerical `≈`, the
Galin–Kufarev spectral solve on `@cas/core` `dftOnCircle`, conserved Richardson moments + a hard ⚠ cusp /
suction stop), driven natively or by the QD → Hele-Shaw import (the Quadrature Domains app hands a one-point
unbounded QD via `@cas/interchange`, α the convention-neutral residue read straight off the wire — no schema
bump; `QD_TO_HELESHAW` golden), riding `@cas/core`, `@cas/flow`, `@cas/interchange`, and `@cas/ui`; and the
tenth, **Potential Theory**, ADR-0036 — the conductor view split out of 2D Electrostatics (M3): a compact set K
as a grounded conductor — equilibrium charge / logarithmic capacity / Green's function, with Faber-zero and
Fekete/Leja overlays; exact `=` for Schwarz–Christoffel polygons + closed forms, log-lightning `≈` for smooth
blobs; riding `@cas/flow`, `@cas/faber`, `@cas/core`, and `@cas/ui`; and the eleventh, **2D Hydrodynamics**,
ADR-0037 — the hydrodynamic twin of 2D Electrostatics: ideal flow past a body as flow past 𝔻* through a
conformal map ψ: 𝔻* → ext(B), the Joukowski/Kármán–Trefftz airfoil (Kutta condition + lift) plus a
closed-form transplant gallery (flat plate / ellipse / deltoid / astroid / star), the airfoil promoted out
of 2D Electrostatics; riding `@cas/flow`, `@cas/gpu`, `@cas/export`, `@cas/interchange`, and `@cas/ui`) ride the thirteen shared `@cas/*` packages
(`@cas/core`, `@cas/interchange`, `@cas/expr`, `@cas/gpu`, `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`,
`@cas/export`, `@cas/conformal`, `@cas/faber`, `@cas/ui`, `@cas/flow`) — `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`, and `@cas/export` were all extracted later
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

**`apps/contour-integration`** (2026-09): a sandbox and 28-integral worked-example gallery for contour
integration and the residue theorem, including the evaluation of real definite integrals in closed
form. Plan, design and content spec are in [`docs/contour-integration/`](docs/contour-integration/)
— **read `PLAN.md` then `DESIGN.md` before touching it**; the 28 gallery entries are the engine's
specification, not examples added afterwards.

Through **Milestone 3** and published. `∮ f dz` comes from `2πi Σ n(γ,aₖ)·Res(f,aₖ)` — a *formula*,
not a quadrature — with exactly-decided winding numbers (exact-sign predicates over a certified
polygonisation) and exact residues over ℚ(i) or one quadratic extension of it, so `1/(1+z⁴)` reads
`π√2/2`. Numerical quadrature is demoted to an independent **cross-check**; a disagreement beyond its
own error estimate is reported, not resolved by preference. The arc bounds are certified in exact ℚ
with **no floating point in the chain** (including certified rational brackets on π), and the
`deg Q ≥ deg P + 2` hypothesis is *derived* from the exponent rather than checked. The **Closing
Ledger** (COVER / KILL / CATCH / LEGALITY) answers "does this argument close?", and a wrong contour
fails diagnostically — closing `∫cos x/(1+x²)` downward shows the bound diverging and names KILL.
The 28 gallery records load as **data** through a schema and a loader enforcing four invariants,
with Pass 5's `M t = r` solved exactly over ℚ so rank is decided rather than thresholded; **thirteen**
of them — **every entry in tiers A, B and C** — are executed against the engine in the suite, each
solving to a symbolic closed form because the whole solve runs in units of π and never evaluates it.
A record that fails an invariant is dropped, not thrown on. **Extended M3 (M3.5a–c)** then made the
engine's work reachable: the thirteen records are **browsable** (a `Sandbox | Gallery` switch, with
one shared analysis path — `engine/analyse.ts` — that the golden corpus also runs, so the numbers on
screen are the numbers the suite pins); every record carries a **derivation panel** that renders the
ledger's own certificates, their methods and their ✓/✗ audit trails, with **every badge in the app
computed from a verdict** (the last literal `=` is gone, and the corroborating quadrature no longer
caps an exact `∮` at `≤`); and the **contour is an object you can grab** — drag it across a pole and
the value jumps by exactly `2πi·Res`, park it on the pole and there is no number at all. Still to
come: the pen tool (free-hand path editing), branch cuts (M4), the rest of the gallery (M5), the
teaching layer (M6).

**M4 (branch cuts): M4.1–M4.3 have landed** — ADR-0041 and
[`docs/contour-integration/M4-plan.md`](docs/contour-integration/M4-plan.md): tier D's output basis is
**carried, not reduced** (a form labelled `=`, decimal `≈`, as tier B already carries `e^{β}`), and
Pass 5 moves to **ℚ(i)(π)** with π an indeterminate so that rank stays decided. No new number field. Its residues reach ℚ(i)(√d) and, for `g(z)·e^{iaz}` at simple poles, the
exponential basis `Σ cₖ e^{βₖ}`, in which the FORM is `=` and the decimal stays `≈`.

**M4.1** brought the branch-cut kernel (`src/kernel/branch/`) and made it visible. A cut is a
**choice**, not a property of `f`: exponents are exact `Frac`s because research 06 §2.1's
admissibility test asks *"is `Σ αₖ` an INTEGER"* — a decision, not a measurement — and one rule
explains the whole tier-D gallery (the keyhole's cut must reach ∞ and may be any arc doing so; the
dogbone is admissible **both** as the bounded arc `a→b` and as two rays to ∞; a `log` is never
bounded). **LEGALITY steps 2–3** land with it: the cut system must be admissible, and any piece that
meets a cut must declare which side it runs on — a crossing without a `side` tag refuses and names
the repair. The crossing classifier is three-valued on purpose (`clear` and `crosses` are decisions,
`touches` is a refusal, since a grazing contact has no side to declare), and the keyhole's two lips
stay `clear` down to the resolution floor. The sandbox's **cut editor** is a declared object, *not*
a detector — an incomplete detector would report "no branch points" for an integrand that has them
and let LEGALITY pass a crossing in silence — and the dogbone join/split gesture is live. One latent
hole closed on the way: `engine/ledger.ts` now exports `legalityRefusal`, so the result card can no
longer print `∮` past a LEGALITY row the quadrature knew nothing about. **M4.2** delivers **north-star #4**: `∫₀^∞ x^{α−1}/(1+x) dx` prints `π/sin(πα)` labelled `=`, with
the keyhole's four pieces, the `(1 − e^{2πiα})` factor and a certified bound on each vanishing arc.
D1 and D3 are the fourteenth and fifteenth loaded records — **tier D has begun**. The exponential
basis widens to `β = ℚ(i)(√d) ⊕ ℚ(i)·π` with π an INDETERMINATE (`kernel/exponent.ts`), so `e^{2πiα}`
and `e^{iπ(α−1)}` compare by exponent rather than by tolerance; one **sine recogniser**
(`kernel/sineForm.ts`) factors `a − b·e^{β}` with `|a| = |b|` and refuses everything else (R3); the
**power-residue reader** evaluates `z₀^α` in the DECLARED `argRange`, guessed numerically and then
verified exactly, which is D1's `residue-with-the-wrong-argument` trap made arithmetic; and
`branchArc.ts` spends `α < 1` on the outer circle and `α > 0` on the inner — the same ML inequality
read in opposite directions. D3 adds the **cyclotomic sum**, which computes `Σₖ Res` over the `n`-th
roots of `−1` without ever naming one (at `n = 5` and `n = 7` no root fits one quadratic extension,
and the SUM needs none), and the **geometric cancellation** that turns `sin(πa)` into `sin(πa/n)`.
Three refusals are structural rather than detected: the wrong `argRange` swings the cut onto ℝ₋ and
LEGALITY catches both untagged circles; integer `α` makes the coefficient exactly zero; and a
cancellation may simplify a derivation but never rescue one — `Golden.refuses` is the schema
consequence, and invariant 4's rank rule inverts for such a fixture rather than being lifted. Two
guardrail holes closed on the way: `solveFamily` now gates on LEGALITY as the result card does, and
no skipped quadrature is ever rendered as agreement.

**M4.3** lands **D4**, the sixteenth record and the first that is not solved by dividing:
`∫₀^∞ log x/(1+x²)² dx = −π/4`, with `∫₀^∞ dx/(1+x²)² = π/4` free from the same contour and
`∫R log²x` honestly reported as invisible. Its one complex identity in three unknowns has rank 1 read
as one equation and rank 2 split into real and imaginary parts — a split the record must DECLARE,
since it is legitimate only because the unknowns are real. Pass 5 becomes a linear system:
`linear.ts` runs over a `Field<T>` (`families/field.ts`) instantiated at ℚ and at **ℚ(i)(π)**
(`kernel/ratPi.ts`), where π is transcendental so elimination is exact and rank stays DECIDED. Three
things the plan did not anticipate: `SolveReport.determined`, because rank deficiency is not
all-or-nothing (D4 pins two of three unknowns and is right to say nothing about the third, so
invariant 4 became a per-unknown check in both directions); **the record chooses the coefficient
ring**, since `e^{2πiα}` is not a rational function of π and `π²` is not an algebraic multiple of an
exponential — a MULTIPLICATIVE crossing phase means the exponential basis, an ADDITIVE one means
ℚ(i)(π); and **the coefficient row is derived from the declared increment** and checked against the
record, which turns three of D4's traps into arithmetic. `kernel/logResidue.ts` computes
`Res(R·log^m z, z₀)` at a pole of any order (the Laurent principal part convolved with the expansion
of `log^m`, so a double pole mixes both halves), checked against an independent quadrature to 1e−12;
`kernel/bounds/logArc.ts` kills the circles, where a log moves no exponent but does take the boundary
case away.

**M4.4** lands **D5**, the seventeenth record and the first that does not close ALONE:
`∫₀^∞ (log x)²/(1+x²) dx = π³/8`. Its `log³` keyhole gives two real equations in three unknowns —
`∫R log x` outright, `∫R log²x` only *modulo* `∫R dx` — so the record declares a **prerequisite**,
and the engine RUNS it: `from: "family:log-squared-keyhole"` resolves D4 at the *same* binding
(borrowing at D4's own fixture would return π/4 where π/2 is needed). The borrowed verdict then meets
into the answers that depend on it and **no others** — dependence decided in ℚ(i)(π) as
`Σ_row weights·M[row][j] ≠ 0`, so D5's bonus stays exact on its own contour while its primary carries
the input's certificate — and a record expecting `≈` keeps `≈` however exact its source was. Invariant
4 judges a borrowing record on the system with that column REMOVED (structural, so still no residues),
in both directions: a contour that cannot determine what the record claims is broken, and so is one
that borrows a value it supplies itself.

**M4.5** completes ADR-0041's Action Item 1 — the exponent's `Σ(ℚ)·ln(ℚ₊)` half (`kernel/logPart.ts`)
— and lands **D2**, the eighteenth record and the first whose poles are off the UNIT CIRCLE:
`∫₀^∞ √x/(x²+6x+8) dx = π(1 − 1/√2)`. `(−2)^{1/2} = e^{(1/2)(ln 2 + iπ)}`, the argument decided in the
declared determination as before and the modulus now a symbolic `ln 2` in the same exponent; dropping
it returns `π/2`, which is plausible and wrong. The logarithms are carried over **primes**, because
`ln 4 = 2ln 2` and a representation keyed by the rational would make the sine recogniser compare
forms rather than numbers — trial division refuses rather than returning an uncertified atom. They
fold back out when the weight is an integer or a half (`e^{ln 2}` is 2, `e^{(ln 2)/2}` is `√2`, so
D2 reads `π − π√2/2`) and are CARRIED at a third or a quarter, printed as a power. `argumentOfPole`
now verifies by DIVISION rather than equality — `z₀·conj(ζ)` a positive real — which is the same
guess-then-verify with one bound fewer. Two findings the widening forced: `logResidue` would have
silently dropped `ln r` for a log family (ℚ(i)(π) has no seat for it) and now refuses by name, and a
record whose poles sit on the default contour radius opens refusing, so `limitParams[].start` lets a
record say where its own contour must start.

**M4.6** is the dogbone's, and **M4.6a–b have landed**. `Res(f,∞)` is exact over ℚ(i) by one polynomial
division, with `Σ_finite Res + Res(f,∞) = 0` as a differential check between two computations that share
no arithmetic; and ONE number — the order at infinity `p = Σαⱼ − (deg D − deg N)` — decides both whether
the outer circle vanishes (L2 needs `p < −1`) and whether the residue there is zero (`p ≤ −2`), which is
research 03 §9(d)'s unification made arithmetic. `engine/exteriorTheorem.ts` is then the identity a
contour with the CUT INSIDE IT satisfies — `∮γ = 2πi[Σ (n(γ,aₖ) − σ)·Res(f,aₖ) − σ·Res(f,∞)]`, `σ` the
winding about the branch points — and it is the ORDINARY residue theorem applied to `γ − σ·C_R`, which
winds zero times about the cut. `σ = 0` gives the residue theorem back term for term, which is what makes
the `− σ` falsifiable. Three things it settled: the dogbone template carries **no outer circle**, because
drawing `C_R` would be two disjoint loops called one path and would make every winding `1` — the one fact
D6 exists to deny, so `C_R` is `Res(f,∞)` and appears as that row; `analyse` routes on the GEOMETRY, so a
contour that has moved may change which theorem applies to it, and an UNDECIDED winding about a branch
point routes here to be refused by name rather than to the ordinary theorem to be answered; and a rational
integrand can falsify the pole weights and the residue at infinity against the quadrature but **not the
sign of σ** (`Σ Res + Res(f,∞) = 0` kills that whole term), which is said out loud in the certificate
rather than left for a reader to discover. The sandbox gains the keyhole and the dogbone, each seeding the
cut system its shape presupposes. Verifying that in a browser found **three rules that had been true by
accident**, all older than this slice: LEGALITY read the branch points ONE AT A TIME and so refused the
dogbone (the rule is on the total monodromy `Σⱼ n(γ,bⱼ)·αⱼ ∈ ℤ` — admissibility's arithmetic read along
a contour); cut classification depended on the cut's DISCRETISATION, because the draggable midpoint
handle of a straight bounded cut lands on the lips' interior and was read as a bend; and every certified
arc bound assumed the arc was centred at the ORIGIN, which every `vanish` arc in the app happened to be
until the dogbone's caps sat on its branch points — an off-centre arc now gets no bound of that shape and
says so, rather than a `≤` computed from the wrong geometry. Still to come in M4: the off-centre arc bound
and D6 (M4.6c), D7 (M4.6d), and the GPU cut picture (M4.7).

It brought `@cas/rigor` ([ADR-0040](docs/DECISIONS.md)), the first package **created rather than
extracted**: the honest-labelling guardrail above had no shared code at all, only ~6,000 lines of QD
`.mjs` that each later app reimplemented. Branded types make `=` a compile error to write by hand.
**QD is not migrated onto it**, so the suite has two rigor vocabularies on purpose.

Deferred / exploratory (not started): further correspondence families (circle-and-cardioid → cubic
Chebyshev → general d:d), the remaining non-Laurent σ families (power-weighted PQD, log-weighted LQD),
analytic branch continuation through cusps (uncertified — RISKS §3), and QD Schwarz df64 deep-zoom.
See [MIGRATION](docs/MIGRATION.md) for the phase specs and gates.

**Done — ADR-0036 (split 2D Electrostatics into three apps + `@cas/flow`).** Stage 0 extracted `@cas/flow`
(the shared conformal-transplant kernel); Stage 1 carved `apps/hele-shaw-flow` (the twist + droplet pages)
and retargeted the QD → Hele-Shaw hand-off (golden `QD_TO_HELESHAW`); Stage 2 carved `apps/potential-theory`
(the conductor view), leaving 2D Electrostatics as the field sandbox + airfoil + polygon (its now-unused
`@cas/core`/`@cas/expr`/`@cas/faber`/`@cas/conformal` deps pruned); Stage 3 adopted the shared nav header
(`mountNavHeader` + `@cas/ui/nav.css`) across all three apps — their first consumers, a suite-wide rollout to
the other seven left as a follow-on — added all three to the non-blocking a11y roster (baseline refreshed),
and split the studio plan into three per-app plans. Per-app plans:
[`docs/design/2d-electrostatics-plan.md`](docs/design/2d-electrostatics-plan.md),
[`docs/design/hele-shaw-flow-plan.md`](docs/design/hele-shaw-flow-plan.md),
[`docs/design/potential-theory-plan.md`](docs/design/potential-theory-plan.md).

**In progress — ADR-0037 (2D Hydrodynamics, the eleventh app; the airfoil promoted out of 2D Electrostatics).**
A new app, `apps/2d-hydrodynamics` — ideal flow past a body B as flow past 𝔻* through a conformal map ψ: 𝔻* →
ext(B), the hydrodynamic twin of 2D Electrostatics — anchored by the Joukowski/Kármán–Trefftz airfoil and
broadened by a closed-form transplant gallery (slit / ellipse / deltoid / astroid / star). No new package
(ADR-0007): it consumes `@cas/ui`/`@cas/gpu`/`@cas/flow`/`@cas/export`/`@cas/interchange`, moves the airfoil
engine intact, and extracts Riemann-Map's `EXTERIOR_MAP_PRESETS` into `@cas/flow` on the second-consumer rule
(HD-2). Staged HD-0…HD-5: **HD-0 (scaffold + wire the hub), HD-1 (`git mv` the airfoil out of 2D
Electrostatics — retitled, nav retargeted, CSS ported to `panes.css`, the two dangling cross-page links
removed), HD-2 (the closed-form transplant gallery `gallery.html` on `flowNet`+`pushforward`, plus extracting
Riemann-Map's `EXTERIOR_MAP_PRESETS` into `@cas/flow` on the second-consumer rule — Riemann-Map draws the
maps, 2D Hydrodynamics transplants flow through them, golden + expr↔psi cross-check pinning both), and HD-3
(the shareable/reproducible shell — `#vs=` permalinks + PNG export via `@cas/export`, on both pages, plus
gallery stagnation-point markers) are done**; the polygon transplant stays in 2D Electrostatics for now
(HD-4, deferred — it anchors the ADR-0035 `conformal` hand-off). 2D Electrostatics' ES-4 is reassigned to
this app.
Plan: [`docs/design/2d-hydrodynamics-plan.md`](docs/design/2d-hydrodynamics-plan.md).

**Done — ADR-0038 (2D Hydrodynamics → one page, domain-colored everywhere).** A follow-on that
collapses ADR-0037's *incidental* three-page shape (hub + `airfoil.html` + `gallery.html`) into a **single
page** with a **Body** selector, rendering **every** body — the airfoil and the closed-form gallery — with the
same domain-colored two-pane look. It rests on the identity that every body is a forward map ψ: 𝔻* → ext(B)
driven by the *same* reference flow past the unit disk: the airfoil folds in as ψ(w) = J(ζ₀ + R·w), U′ = U·R
(the R cancels in dW/dz = W_ref′/ψ′, pinned by a golden), so its rear stagnation lands on the trailing edge —
the Kutta condition made visible. Render idiom: a per-pixel disk shader (left) + a **forward-mapped colored
mesh** for the body (right — the CPU warps a disk-exterior tessellation through ψ, the GPU colors by the exact
velocity W_ref′/ψ′ through one shared colormap), so no per-pixel inverse ψ⁻¹ is ever needed (the cusped bodies
have none). No new package (ADR-0007); `@cas/flow`'s `ExteriorMapPreset` gains a `psiPrime` closure (Riemann-Map,
the other consumer, is unaffected). A unified `#vs=` decoder still reads every ADR-0037 airfoil / gallery /
bare-`#id` permalink. **HD-6.0–6.4 done** (ADR + plan; the unified body model + airfoil-equivalence golden;
the single-page shell; the domain-color render; the doc + PNG-export-verification sweep).

Work in small, reviewable commits. Pause at each phase/milestone gate for review before proceeding.
When a command or path in the docs is marked `⚠ verify`, check it against the actual repo
contents rather than assuming.
