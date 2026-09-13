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

Green is **528 test files / 5291 tests** with lint and typecheck silent. `pnpm lint` includes
`pnpm dep:check` (dependency-cruiser). `pnpm test` builds the `packages/*` dists first, so a clean
clone can run it directly. Two suites behave unusually: the Quadrature-Domains maths runs as a
separate headless runner wrapped as one Vitest spec (`node app/node-test.js`), and `packages/ui` is
the only jsdom project. **Never pipe the gate through `tail` or `head`** — doing so has truncated
real failures before.

Dev servers go through `.claude/launch.json` (one entry per app, each with its port), not a bare
`vite` left running in the background.

**The browser suites are NOT in `pnpm test`** and must be run deliberately — `pnpm test:browser` in
the app that has one (contour-integration, complex-dynamics, complex-function-plotter, quadrature-domains,
`packages/gpu`). They compile real GLSL and need a Chromium; where Playwright's pinned build is absent,
`apps/contour-integration/vitest.browser.config.ts` reads `CAS_CHROMIUM_EXECUTABLE`, so
`CAS_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:browser` works in a container that has one
under a different version. **Run it when a slice adds a record or touches the stage:** the contour-integration
browser suite was red for three milestones on a hardcoded record count, and the node gate structurally
cannot see it.

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

Through **Milestone 4** and published (M1–M4 complete; 20 of the 28 gallery records loaded). `∮ f dz` comes from `2πi Σ n(γ,aₖ)·Res(f,aₖ)` — a *formula*,
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
come: the pen tool (free-hand path editing), the rest of the gallery (**M5.8** — the cross-family
invariants that were reasoned and never run, plus E3 and F2 together on ADR-0042's `knownValue`;
M5.0–M5.7 are done, **26 of the 28 records are loaded and TIER G IS COMPLETE**, and **M5.6** built the tier-G solve — `Res(K·f, z₀)` at a pole of the cofactor
as an exact quotient of basis elements (both kernels are Möbius functions of `e^{2πiz₀}`, so `coth` is
a NAME for that quotient at `z₀ = ia` rather than new arithmetic), then SG-1's unknown *inside* the
residue sum. **The plan's own one-equation generalisation cannot be built**: its coefficient adds a
dimensionless `1 + Σⱼcⱼ` to a `2πi·w` carrying π, and neither the exponential basis nor ℚ(i)(π) holds
both — and it is never needed, because `a = 0` is tier G's DEFINITION rather than an accident. So it
is a third route, `T/π = −ρ/w`, with the mixed case refused by name; the weight is DERIVED from the
target's declared range and checked, halving additionally requiring an even cofactor with a vanishing
`n = 0` term (both decided exactly over ℚ(i)), which is research 03 §8's commonest error made
arithmetic. The no-op for the existing corpus is PROVEN rather than inferred — 23 records × 79
fixtures, ledger rows and all, dumped before and after and byte-identical over 1253 lines — and the
sweep's one survivor that mattered was dropping the kernel from `analyse`, which left every test green
while reintroducing the hole M5.5b closed: **a right answer is not evidence that the ledger is
honest**. **M5.6c** then landed **G2** — `Σ_{n∈ℤ} 1/(n²+a²) = (π/a)coth(πa)`, the twenty-fourth record
and the first in tier G — with `cothForm.ts` naming the quotient (a two-pole conjugate cofactor's
residues cross-multiply into `2c·sinh(δ)` over `−4sinh²(γ/2)`, and `δ` is `γ` or `γ/2`: *the two cases
are the two KERNELS, not two patterns to search among*, so the recogniser never sees which kernel it
came from), `summationTheorem.ts` making `∮` at finite N the exact `2πi[S_N − T]` that the quadrature
then corroborates to 5.8e-15, and a hyperbolic form MULTIPLYING where a sine divides — its own slot on
`SineForm`, with `denominatorOf` the single reader the formatter, the number and the argument accessor
all go through, which is the E2 lesson made structural. **SG-1 inverts TWO invariants and both would
have dropped the record**: `rank(M) = m` fails because `M` is identically zero for a tier-G contour by
construction (full rank would mean the record also carries its target on the contour), and the
corpus's radius-independence is false here for the reason it is true elsewhere — this kernel has a pole
at every integer, so more radius adds more POLES and `∮`'s dependence on N is the argument's content
rather than a defect in it. Three rows were saying something false, each found by RUNNING it: CATCH
claimed "no individual residue is expressible" (the cyclotomic route's sentence, where here every one
is written down); the enclosed count was short by exactly the poles that carry the answer, because
`findPoles` refuses the whole product and not just the `cot`, so a square dragged onto `±ia` had every
singularity "clear of the contour" as surely as one dragged onto an integer did before M5.5b; and the
shell printed "the target is Re of ∮ f dz" about a record whose target is a TERM of the residue sum.
The browser pass found the **browser suite itself red** on a hardcoded record count stale since M5.3d —
the node gate deliberately does not launch a browser, so nothing could see it. Sweeps 25/25 and 32
mutants with 29 killed, two recorded equivalents and one unreachable branch removed. **M5.7 then
completed tier G with the COLLISION — G1 and G3**, `Σ_{n≥1}1/n² = π²/6` and `Σ_{n≥1}(−1)ⁿ/n² = −π²/12`.
Its content is that **a stated hypothesis FAILS while the argument stays rigorous**: `f = 1/z²` has its
pole where the kernel has one, so *"f has no pole at an integer"* is false — refusing would stop a
correct argument and warning would flag a certainty — and that hypothesis is SUFFICIENT for the clean
form of the theorem, not NECESSARY for the contour argument, since the product is meromorphic there
with a pole of order **1 + 2 = 3** and orders ADD. SG-6's `escalate` is therefore an **OBLIGATION
rather than a licence**: an escalating record must DECLARE the merged order and residue, and
`collisionCheck.ts` falsifies both against the Laurent route (declaring order 2 is refused with "the
orders ADD to 3"; declaring `+π²/3` returns `−π²/6` for ζ(2), negative and otherwise plausible), while
a record that escalates and declares nothing is dropped by the loader. The residue comes from DESIGN
§6.3's mandated formula (4) — the kernel's expansion is **EVEN**, so the `u^{−1}` coefficient of the
product is `c₀ + Σ t_k π^{2k} c_{−2k}`, only `f`'s constant term and its even negative coefficients and
finitely many of those; `m = 3` is the first case where the derivative formula's symbolic explosion
matters, so G1 is the entry that justifies the series layer. Bernoulli numbers come from
`Σ C(m+1,j) B_j = 0` in exact ℚ, in-app (ADR-0007), and every value is checked against a 4096-point
circle trapezoid. **A collision is a different RING, not a harder case** — `t_k` is rational and the
powers of π even, so the value is in ℚ(i)(π) where G2's `coth` is a quotient of exponentials, and
since `Σ f(n)` is rational the whole identity reuses `exactInPi`, the log families' seat; with a
cofactor pole away from the integers as well the two halves are incomparable and refused by name on
both sides. `cofactorResidues` and `mergedResidue` now **PARTITION** the pole set (before, both refused
a collision from their own side, each true of the identity it applies and beside the point), which made
one refusal unreachable and it was removed. **The two records differ by ONE number** — identical
cofactor `1/z²`, contour and weight, with `π cot` giving `−π²/3` and `π csc` `+π²/6` — the alternation
being the KERNEL's, which is why `(−1)ⁿ` never appears in a cofactor. And **SG-5 turned out already
done**: the plan's "widest blast radius in M5" (`kind: "sum"`, an integer index, a `summand`) landed
with D1's arc and its readers with G2, measured rather than assumed. Sweep 27/27 with no equivalents;
the three survivors each bought a test — `f`'s CONSTANT term is part of the residue and every bare
`1/z^m` fixture hides it, a merged residue is winding-weighted like every other, and a wrong
declaration must stop the SOLVE and not only fail the checker. 26 of the 28
records are loaded, and the plan and its one engine decision are
[`M5-plan.md`](docs/contour-integration/M5-plan.md) + [ADR-0042](docs/DECISIONS.md);
**read the plan before continuing M5**), the teaching layer (M6).

**M4 (branch cuts) is complete — D1–D7 loaded and solving.** ADR-0041 and
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

**M4.6** is the dogbone's. `Res(f,∞)` is exact over ℚ(i) by one polynomial
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
cut system its shape presupposes. **M4.6c** then lands **D6** (`∫₋₁¹ dx/((x²+a²)√(1−x²)) = π/(a√(1+a²))`,
the nineteenth record): the individual arguments of a multi-point branch factor need not be rational
multiples of π — at the pole `ia` they are `π − arctan a` and `arctan a` — but the weighted SUM is, so
the question is asked once about the PRODUCT and verified by raising it to the exponents' common
denominator, where every fractional power clears and the phase is an exact quotient in ℚ(i)(√d). The
branch pinned on the upper lip takes `+√(1+a²)` at `+ia` and `−√(1+a²)` at `−ia`, so the residues ADD
where the symmetry reflex would cancel them and return 0; the record's constant `i` is load-bearing for
the same reason. Its end caps are killed by the first bound in `kernel/bounds/` that is **not about the
origin** — the cofactor is shifted to the cap's own branch point by exact synthetic division, and
`|∫| = O(η^{1+α})` vanishes iff `α > −1`, the integrability of the endpoint singularity. Verifying M4.6b
in a browser found **three rules that had been true by
accident**, all older than this slice: LEGALITY read the branch points ONE AT A TIME and so refused the
dogbone (the rule is on the total monodromy `Σⱼ n(γ,bⱼ)·αⱼ ∈ ℤ` — admissibility's arithmetic read along
a contour); cut classification depended on the cut's DISCRETISATION, because the draggable midpoint
handle of a straight bounded cut lands on the lips' interior and was read as a bend; and every certified
arc bound assumed the arc was centred at the ORIGIN, which every `vanish` arc in the app happened to be
until the dogbone's caps sat on its branch points — an off-centre arc now gets no bound of that shape and
says so, rather than a `≤` computed from the wrong geometry.

**M4.6d completes M4.6 with D7** (`∫₀^b x^μ(b−x)^{1−μ}/(c−x) dx`, the twentieth record), where `Res(f,∞)`
is not a correction but most of the identity: `f → e^{iπμ} ≠ 0` at infinity, so `2πi·Res(f,∞)` has
magnitude 26.7 in an answer of 1.216, and dropping it leaves an answer that is **still perfectly real**
and wrong by a factor of 14.5 and a sign. The residue there comes from the binomial series with its
constant DERIVED — `Φ(z) = Λ·z^{Σα}·∏(1 − bⱼ/z)^{αⱼ}` with `Λ` a root of unity read off the declared
windows along a searched reference direction — and `Σ αⱼ ∈ ℤ` is required and refused by name, since
otherwise `f` is not single-valued near infinity and there is no residue there at all. D7 also needed
per-factor determinations (`z^μ` in `[0,2π)`, `(b−z)^ν` in the principal window) and a factor written
BACKWARDS (`(b − z)`, not `(z − b)` — the same number, not the same power). Its answer prints
`(−π·2^(1/4)·5^(3/4) + 17π/4)/sin(3π/4)`, which took making two folds partial: `e^{−iπ + log}` now
yields its `−1` while carrying the logarithm, and a logarithm folds **prime by prime**. A `Scalar`'s
`add` may now be another `Scalar`, because D7's dogbone hugs `[0, b]` with `b` a parameter and its upper
edge runs to `b − η`. Verifying it in a browser found the app drawing **D7's own trap**: the
domain-colouring backdrop comes from the compiled evaluator, which uses the PRINCIPAL branch of every
sub-expression, so it shows a seam on `(b, ∞)` where the composite is continuous — research 06 §2.2's
`rendering-the-union-of-sub-cuts`, true since D1 and **fixed in M4.7c** (below). What changed then is that a record with a
branch now says so, since an app that draws one determination while computing in another must not leave
the reader to notice.

**M4.7 is the GPU cut picture.** The app gained a `test:browser` — its real
GLSL compiled and linked for the first time (the sandbox's presets and all twenty records' contour
integrands, 28 programs the node gate structurally could not build) — and the branch-cut layer now
exists in both backends with a parity gate between them, because an app that draws one determination
while computing in another is not merely imprecise. The correction is a DIFFERENCE of two crossing
counts, so the shadow determination cancels: `f_Γ = f_ref·exp(2πi·[m_Γ − m_ref])` with the declared
arcs entering one array at `+J` and the reference rays entering the SAME array at `−α`, which is why
it is one loop and one uniform block, and why Γ equal to the reference is exactly zero term by term.
Three things it settled: **what the reference IS cannot be inferred from the branch points** —
`csqrt(1 − z·z)` is principal in its *argument*, so its cut runs OUTWARD along `(−∞,−1] ∪ [1,∞)` while
`(z−1)^{−1/2}(z+1)^{−1/2}` has the other reference for the same function, and assuming C99's
principal cut drew D6 wrong, so the reference is declared per factor and a point with nothing declared
gets no ray rather than an invented one; **an integer correction is no discontinuity**, which is
admissibility (`Σα ∈ ℤ`) arriving as a property of the picture rather than a second check on it; and
**the parity gate's floor is `sin`/`cos`, not float32** — GLSL ES 3.0 §4.5.1 is ULP counts throughout
except there, where the requirement is an *absolute* `2^-11` (4.9e-4, four orders looser than float32's
eps, of which SwiftShader spends 39% while `atan` delivers 8.5e-7), so the first draft asserted 3e-5
and went red on a correct shader. A mutation sweep on the shader kills 17 of 17; the two that survived
the first pass were both comments nothing checked — the turn count replaced by a modulus, and `<`
loosened to `<=` so a grazing touch counts as a crossing — and are asserted directly now.

**M4.7c** then put the declared determination on the stage: the phase portrait is BUILT from the
record's own factorisation `c·∏(sⱼ(z−bⱼ))^{αⱼ}`, each factor in its declared window, on the CPU and
in GLSL emitted per record — so D7's seam on `(b, ∞)`, where the composite is continuous and the
compiled evaluator drew a jump anyway, is gone and the picture is on the ledger's sheet. Constructing
beats correcting because `cutCorrection`'s reference would have to be the determination `@cas/expr`
compiled, and for D6's `csqrt(1 − z·z)` that is where `1 − z² ∈ ℝ₋` — in general a CURVE, not rays
from the branch points, so a ray-based correction is right about D6 by luck; the correction keeps its
job one level up, where the declared product is the reference and a dragged cut is measured from it.
The shader is generated so the declaration sits in the program text, since a uniform array would make
the orientation runtime data and `(b − z)^ν` is the same number as `−(z − b)^ν` and not the same
power. Research 06 §5.1's two honest counter-devices land with it: the cut carries its jump weight
(`J = 3/4` on D7's dogbone, `J = ∞` on a log's keyhole, because infinite-order monodromy has no
finite jump), and modulus contours are one toggle away — **whose claim holds only for the powers**,
measured: `|f|` is determination-independent to 1e-9 for D1/D2/D3/D6/D7, and differs by 18.7× and
80.7× for D4/D5 because a log's monodromy is additive, so the contours break at the cut there and the
app says which case it is showing. Writing the tests found three things a shader suite cannot
otherwise see — an unused GLSL function links perfectly, `expect(x).toBeLessThan` without a call
asserts nothing, and a grid never lands on a hair-thin isoline — and the browser found the label
placed off-canvas on a clipped ray and underneath the contour on a dogbone. Sweeps: 14/14.

**M4.7d completes M4 with north-star #3.** Its two halves: `∮` comes from `2πi Σ n·Res` with residues
read in the DECLARED window, so it cannot see the cut's geometry — with the cuts clear of the contour
the value is exactly invariant under any deformation of them, now a ledger row rather than a number a
reader must watch not move, and justified by the correction's own definition (a count of jump-weighted
crossings of `[z₀, z]` changes at no point of γ under a deformation missing γ), which is also what
makes a jump on crossing meaningful. And the crossing NAMES its factor: research 06 §3.2 requires
"refuse the crossing or change sheet and say so, with the multiplicative factor shown", and the app
had refused since M4.1 while saying nothing — teaching that a cut is a wall rather than a bookkeeping
choice with a price. It now prints `e^{2πi(α−1)} = e^{2πiα}` in BOTH of §3.4's forms with the reason
they agree, since a reader who only meets the reduced one carries it to an `x^s` integrand where the
`−1` is not there to cancel; `e^{2πiJ}` is built in the output basis so it folds to `1, i, −1, −i`
exactly when `4J ∈ ℤ` and is carried otherwise, and an integral jump weight reports nothing rather
than announcing a factor of 1. **Shadow-cut mode** (§2.3) lands with it — the cuts become the rays
away from the base point and swing as the lamp is dragged, derived rather than represented so no
downstream module is shadow-aware; always admissible because every ray reaches infinity, which is
precisely why it cannot express the dogbone, so the declared arcs are kept underneath and the toggle
gives them back. Running it found the sandbox's default lamp sitting on its own first branch point
(shadow mode refusing on its first click, correctly and uselessly), the ledger's repair naming an
action the mode does not offer, and the sandbox drawing a declared cut beside a principal-branch
colour seam with nothing to say they are different objects. Sweeps: 12/12 and 10/11 (one equivalent
mutant). Research 06 §5.3's **sheet spinner is deferred with its reason**: under a record the
determination is the record's, and the sandbox has no declared branch FACTOR for a sheet index to
multiply — giving it one means letting the sandbox declare `c·∏(z−bⱼ)^{αⱼ}·R(z)` rather than typing
one expression, which is a real extension of what the sandbox is. M4 is complete.

**M5 has begun, and M5.0 closes the one evidence gap M4 shipped with.** Plan:
[`docs/contour-integration/M5-plan.md`](docs/contour-integration/M5-plan.md) (ADR-0042 records its one
engine decision — an exactly-known IMPORTED value is `=` on its form, with the import in its
provenance). `side` had been declared, validated by LEGALITY and **never read**, so research 06 §3.3's
*"don't offset the contour; offset the branch"* was specified and unbuilt — and the quadrature
cross-check was therefore skipped for **all seven tier-D records**, leaving tier D the one tier whose
values had no independent numeric corroboration. It is honoured now, as a `1e-30` displacement
*inside the evaluator*: §3.3's two objections to an offset contour are both about a geometric `ε ~
1e-6`, and this leaves the contour's nodes and `dz` exact while moving `arg` by `~1e-29` — enough for
`atan2` to return `θ₀ + 0⁺` rather than a coin toss, and `|·|` by `O(1e-60)`, below float64's
resolution. So the value is the limiting boundary value to full precision, which an offset contour
cannot give. **All seven records now report an agreeing quadrature**, each within ~1.5× the
quadrature's own error estimate; the claim pinned is that RATIO, because tier D's gap is 1e-3…1e0
rather than tiers A–C's 1e-14 (a lip carries an endpoint singularity) and a flat tolerance loose
enough to pass would assert nothing. Three things it forced: the tag must be shown to **decide** the
number, so the suite integrates each record again with both lips forced `"above"` — the pre-M5.0
cancellation — and requires the honest declaration to be >10× closer; `branchTheorem.ts` and
`logTheorem.ts` had **never called** `checkAgainstQuadrature` (there had been nothing to compare
against), so dropping the skip alone would have produced a quadrature nothing read; and the golden
corpus's fork on `family.branch !== undefined` is **gone**, which is the real payoff — an
uncorroborated record can no longer hide behind a special case. One skip survives and is narrower: a
cut running *vertically* through a piece pins no limit ("above" displaces along it), so
`sideResolves` refuses it **by name** rather than answering it. The sandbox is deliberately not
covered — it can declare cuts but not a branch FACTOR, which is M5.1.

**M5.1 (a–d) gives the sandbox a branch FACTOR, and D1's trap becomes reachable by hand.** The gap was
bigger than it read: `findPoles` on `z^0.3/(1+z)` reports `rational: false` and ZERO poles, so there
was no `exactValue` at all and the ledger failed at KILL — the sandbox produced no answer for a
multivalued integrand rather than a wrong one, which is why "dragging a cut changes the answer" had
nothing to be true of. **M5.1a** extracts `kernel/branch/declaration.ts` (one factor → the
`PowerFactor`/`LogFactor`, the `BranchChoice`, the `DeclaredProduct`) on the second-consumer rule, a
no-op PROVEN by dumping all seven records' declarations before and after and diffing them byte for
byte; the multi-point builder is deliberately left alone (its positions are exact `SqrtExt`, and a
dragged float's `simplestRational` has a sixteen-digit denominator). Having one place to state the
invariants closed two latent bugs: a window must be exactly **one turn** wide (`PowerFactor.argRange`'s
own contract, unchecked), and a single factor must sit at the **ORIGIN** — `branchResidue` is
`Res(z^α·R, z₀) = z₀^α·Res(R, z₀)`, literally `z^α`, and a `PowerFactor` has nowhere to put `b`, so a
factor at `b ≠ 0` would draw its cut in the right place and read its residue about the wrong point.
**M5.1b** adds `engine/declaredRun.ts`, the sandbox's `runFamily`, sharing `declaredEvaluator` with the
record path so both sample the identical integrand: a declaration assembled from a keyhole and five
field values reproduces D1's own closed form `2πi·e^(−7iπ/10)` — the record's exact TEXT — with an
agreeing quadrature. **The plan's gate asked for something that cannot happen**, and M4.7d's own result
is why: `∮` reads the declared WINDOW and `powerAtPole` takes no geometry, so no deformation of a cut
can move the value. Measured — swinging the ray across the contour leaves the value bit-identical and
fails LEGALITY, naming the piece and the cut; changing the DETERMINATION jumps it by exactly
`e^{−2πiJ}` (asserted to twelve decimal places). **M5.1c** is the editing surface: declaring is an
explicit act (the keyhole and dogbone templates already seed cut systems, so inferring a
factorisation from "there are branch points" would silently reinterpret what was typed), after which
the integrand box holds only `R(z)` — and `engine/splitCheck.ts` makes that claim falsifiable by
checking `declared · R(z)` against the expression the box held a moment earlier, **only where the two
determinations agree**, a region computed by evaluating the product a second time in the principal
window rather than assumed. In a browser: type `z^(-0.5)/(1+z)`, declare, and the split reads
`⚠ NOT the expression that was in the box`; fix the cofactor and it reads `≤ reproduces … to 2.50e-16
over 48 sample points` beside `∮ = 2π`; switch the determination to principal and the answer jumps to
`⚠ −2π` while LEGALITY refuses — D1's `wrong-branch` trap, one dropdown. The sandbox's colouring is
now built from the declared factorisation, so its seam and its cut stop being different objects.
**M5.1d** is research 06 §5.3's **sheet spinner**, deferred in M4.7d for want of a factor to multiply
— and it needed no new machinery at all, which is the claim worth keeping: **a sheet is a whole-turn
offset of the declared window**, `[lo + 2s, hi + 2s]`. Everything follows rather than being arranged.
The residues pick up `e^{2πisα}` exactly (because `powerAtPole` reads the window); a **log shifts
ADDITIVELY** instead, for free, with no branch anywhere in the code; the cut does not move; and the
window stays one turn wide, so M5.1a's invariant is untouched. `BranchChoice.sheet` is read at last.
The geometry is computed from the window edge reduced modulo whole turns, which is the difference
between "a sheet does not move the cut" being true and being true to rounding — at sheet 3
`Math.sin(6π)` is `−7.3e-16`, and it drifts further the higher the sheet.

Reviewing the arc found three shell bugs a browser pass caught and no test could, all of one kind.
`renderDeclaration(branch)` **shadowed** the module-level `let branch` every handler assigns to, so
the sheet spinner did nothing and — worse — changing the determination moved the ANSWER (which reads
`declaration.window`) while leaving the cut drawn where it was, the two then disagreeing about where
the discontinuity is: the one thing "declaring the determination IS declaring the cut" exists to
prevent. With it fixed, switching to the principal window now REFUSES (`the R → ∞ circle crosses the
cut 'Γ' without declaring which side it runs on`) and prints no `∮` at all, where before it printed
`⚠ −2π`. The stage's rebuild guard compared object IDENTITY against a product `runDeclared` builds
fresh every call, so the GLSL was recompiled and relinked on every recompute, every frame of a
contour drag included; it is keyed by value now, and `adopt` clears that key so a gallery trip cannot
leave a record's program under the sandbox's numbers (verified: the stage is byte-identical across the
round trip). TypeScript catches none of this — assigning to a parameter is legal and both sides have
the same type — so **`no-shadow` is now an error for `apps/contour-integration/**`**, which was three
harmless cases (renamed) and catches the hazard at its source. `no-param-reassign` would be the
broader rule and fires 268 times across `packages/`, nearly all of it legitimate.

A follow-on fixed the **partial-sum panel's size**, where the defect was not the one it looked like: the
frame fitted `[−max, max]` on both axes with `0` pinned to the canvas centre, tight only for a walk
reaching equally far in all four directions, and D1's keyhole never leaves one quadrant — so it used
half the frame's width and 36% of its height before the panel's 4.75:1 shape cost it anything. Fitting
the data's real bounding box (origin always in it) and centring the BOX rather than the origin puts
every one of the twenty records at ≥95% of whichever dimension binds, up from at best 5% of the panel's
area; the scale stays one number for both axes, because the angle between consecutive terms is content.
The strip went 12rem → 16rem and the side panel 15rem → 19rem (which also stops the complex readout
wrapping). It found a bug older than itself: `removable-one-minus-cos` samples a midpoint EXACTLY on the
removable singularity of `(1 − cos z)/z²`, so `0/0` makes every later partial sum `NaN` — the quadrature
is unaffected and correct, but the panel needs `integrateContour`'s posture (refuse and name it) and
that is left as its own slice, recorded in the code. `src/ui/` gained its first tests: the fit in node,
and the ink `drawAccumulator` actually lays down measured in Chromium — whose first draft was VACUOUS,
since `clearRect` leaves the canvas transparent and `getImageData` returns the axes' 16%-alpha stroke as
bright un-premultiplied RGB, so an RGB-only filter measured the full-canvas axes and passed with the
trail blanked. Sweeps: 9/9. Reviewing it found a regression
and a bad method: `FamilyRun.f` had been the compiled AST and `declaredProduct.test.ts` read that as
"the principal determination" — true by accident — so with `f` now the DECLARED evaluator both halves
of its central claim compared a function with itself, one going red and the other passing
**vacuously**; and the first mutation sweep reported 16/16 while nine tests were already failing on
the clean tree, so re-run against a verified-green baseline it was 13/17. The four survivors were
real (nothing asserted `agrees` could be `false`; neither the accumulation panel's determination nor
`Analysis.sides` was checked), and closing them bought the slice's two strongest claims: a
mis-declared side drops the **verdict** from `=` to `⚠` on all seven records, and the accumulation
trail tracks the integral 4.7×–441× better with the sides than without. Sweeps: 16/17 (one equivalent
mutant).

**M5.2 builds no record — it builds the inequality two of the eight lemmas SHARE, and corrects the
one the research states wrongly.** `sin ψ ≥ 2ψ/π` (Jordan, L3) and `cos φ ≥ 1 − 2φ/π` (the wedge
lemma, L6) are one statement under `φ = π/2 − ψ` (measured: the two slacks agree to 2.2e-16 on 5001
points), and `kernel/bounds/linearMinorant.ts` is the single predicate both discharge through —
`jordanArcBound` included, a provable no-op since the semicircle's range returns a constant of 1 and
the arithmetic is identical in ℚ. **What the predicate decides is the SIDE CONDITION, not the
inequality**: the inequality is a theorem about the concavity of `sin` and no arithmetic could
establish it, while "does the range lie inside `[0, π/2]`?" is decidable in exact ℚ — and that is
precisely the half research 03 got wrong. **D-1 is the two faces parting company past `π/2`:** `sin`
stays non-negative to `π` and folds by `sin ψ = sin(π − ψ)`, so exceeding the range costs a factor of
two; `cos` changes SIGN, so it costs everything, and the majorant the research states for `e^{−zⁿ}`
on `[0, π/n]` is 2.7e15 at `n = 2, R = 6`, 1.1e93 at `n = 3` and float64 overflow at `n = 4` — all
three recomputed in the suite, so the wrong statement is refuted by the tests and not only by a
paragraph. The research applied the sin face's tolerance to the cos face's integrand, and asking the
range ONCE makes that unrepresentable rather than merely corrected; in the app it is two ledger rows
on one `π/2` wedge, `e^{iz²}` killed and `e^{−z²}` refused. `kernel/bounds/wedgeArc.ts` is the bound
— `|∫| ≤ |λ|·k·π/(n·c·R^{n−1})` for `λ·e^{w zⁿ}`, exact in ℚ with π entering only through the
certified upper bracket — routed from the ledger's KILL pass, where such an arc previously reached
**no lemma at all** (Jordan's reader wants a linear exponent; the exact rational reader refuses a
`call`). **Jordan turns out to be this bound at `n = 1`** — both give `π/|a|` on a semicircle,
asserted in ℚ — and the two stay separate functions, because Jordan carries a rational cofactor's
`max|g|` and the wedge carries none: ADR-0007's merge rule read in the direction it usually is not.
Three things the slice forced: the two documents quote DIFFERENT oscillatory ranges (research 03's
`[0, π/(2n)]` is the wedge Fresnel uses, `tier-efg.md`'s `[0, π/n]` the largest on which the form
still vanishes — both right, and the engine quotes neither, reading the arc's range off the
geometry); the arc-extent reader had no way to MEASURE a `π/6` or `π/8` sweep, one step before the
missing lemma, and now refuses a degenerate extent because `0·π·R·max|f|` is a `≤ 0` that is false;
and a uniform quadrature cannot check this bound at all — `e^{−κh}` is a spike of width `1/κ` with
`κ` up to 65536, so a 40001-point rule measured 2.1e-4 where the true majorant is 1.2e-4 and called a
**correct** bound violated, while textbook adaptive Simpson never terminated (a mesh graded toward
both endpoints does it in 20001 points and needs no case analysis about which end the spike is at).
Sweep 20/21, one equivalent; both real kills were about geometry rather than the inequality — reading
a sector's start angle as `0` certifies `π/(4R)` for the clockwise arc `[π/2 → π/4]` where the
integrand reaches `e^{+R²}`, and the first test written for it refused under the mutant anyway,
pinning the outcome without pinning the reason. D-2 (the square-contour bound) stays a document-only
correction until M5.5, said out loud rather than left to be noticed.

**M5.3 opens tier E — E1 and E2 load and solve, and the sign of λ decides everything.** The plan
called it "mostly wiring"; measuring first said otherwise. `findPoles` gave `e^{0.3z}/(1+e^z)`
`rational: false` and ZERO poles — the same report it gave `1/cosh z`, which has infinitely many, and
`e^{−z²}`, which genuinely has none — so E1 and E2 had no residue to take and E3's `poles: []` was
true by accident. **M5.3a** therefore made entirety a DECISION (`kernel/entire.ts`, `PoleReport.entire`):
a SUFFICIENT condition, with the type shaped so a refusal cannot be read as a claim (`sin(z)/z` is
entire and refuses) and every refusal naming which of three walls it hit — a quotient, a function
with poles or branch points, or one that is not holomorphic anywhere, which is not a singularity
question at all. **M5.3b** is the substitution the whole tier rests on: `w = e^z` makes both
integrands rational, their poles become vertical LATTICES (`e^z = ρ` has solutions every `2πi`), and
`polesInStrip` takes the band because a list of infinitely many is not a list and truncating one
silently is how a residue sum loses terms. Exactness rests on ONE stated restriction — each root of
`D(w)` is a root of unity, so `log ρ = 2πi·q` exactly and `e^{az₀}` lands in M4.2's basis with **no new
number field**; the order is decided exactly in `SqrtExt` and only `q`'s numerator read numerically,
safe because the n-th roots of unity are `2π/n ≥ 2π/12` apart. **M5.3c** is the app's first vanishing
SEGMENT — `disposeArc` declined anything that was not an arc, so a rectangle's verticals reached no
lemma at all — and it makes E1's window `0 < a < 1` **DERIVED**: `κ = Re(a) + deg N − deg D` on the
right and `−Re(a) − ord₀N + ord₀D` on the left, whose signs are `a < 1` and `a > 0`, which is the
record's own "one condition, two jobs"; E2's contrasting "no condition at all" is the same expression
at `Re(iξ) = 0`, since `Im(a)` cannot enter a limit on a strip of finite height. `stripTemplate` is a
SIBLING of `rectangleTemplate` (the sandbox's free shape keeps its four free sides) with the top side
carrying `reproduces`, so no lemma is ever asked to kill it — E1's first trap, structural. **M5.3d**
lands both records and finds the tier's real content: **a strip has TWO denominator shapes, and which
one is the SIGN of λ.** `1 − λ` factors as a sine when λ sits on the unit circle (E1 → `π/sin(3π/10)`,
which is D1's own text, since `x = log t` carries one onto the other) and as a **hyperbolic cosine**
when λ is a negative real (E2 → `π/cosh(π)`, i.e. `π sech(πξ/2)`). The sine recogniser refused E2
correctly and by name; `sineForm.ts` now carries both with its one-rule warning spent deliberately —
not a pattern accreting into a simplifier but the other half of one fact, selected by an exact
comparison of two coefficients. A cosh **cannot degenerate** (it vanishes only at an imaginary
argument), which is E2's "unconditionally well-posed" claim arriving as a property of the factoring
rather than a range check, while E1 still divides by zero at integer `a`. The sharpest bug of the arc
was a **RIGHT VALUE UNDER A WRONG FORM**: `solveTarget` rebuilt the solved form field by field and
carried only `sine`, so E2's value divided by the cosh while its text printed a bare `π` for numbers
that were 0.271, 1.252 and 0.590 — nothing about which looks wrong. The declared strip is CHECKED
against the contour drawn (the lattice points one period either side are asked for their windings;
enclosing one, or passing through one, refuses — E1's `wrong-strip-height` trap at run time), and that
check was INERT when first written, because margin poles never reach `integrateContour`. Three wording
defects older than the slices surfaced too: the pole card said "no poles are claimed" about an entire
integrand, the ledger's CATCH row gave an UNCONDITIONAL reason naming a difficulty it never reached,
and `PoleReport.rational`'s doc had drifted from its meaning. Sweeps: 13/14, 15/16, 14/14, 12/13 —
four recorded equivalents, each kept with its reason. **E3 is deferred with F2**, not dropped: both
need ADR-0042's `knownValue`, and doing them together implements the import set once against two
consumers rather than once against one.

**M5.4 opens tier F with F1, and finds three rows that were saying something false.** The wedge is
the strip's ROTATIONAL twin — `f(ωz) = μ f(z)` makes the return ray reproduce the outgoing one by
`−ω·μ` where E1's top side returned `−λ` — and `wedgeTemplate` takes `n` rather than an angle, so
"the angle must be exactly `2π/n`" is unrepresentable rather than checked. **The affine `Scalar` did
not cover it, and its own doc claimed it covered every template in the gallery**: the return ray's
endpoint is `R·cos(2π/n)`, a product of two parameters. Neither route that looks like it avoids the
widening works — `derived` is evaluated before the limit parameters exist, deliberately, and computed
afterwards it would freeze at instantiation and leave the ray behind while the arc followed a drag,
silently opening a contour the ledger had just certified closed. So `mul` may name a parameter, and
the form stays affine in every LIVE one, because a `derived` coefficient never moves: until F1 there
was no record in which "one parameter" and "one LIVE parameter" differed. **Then `1/(1 + zⁿ)` has
exact poles at `n = 2, 3, 4` and none at `n = 5, 7`** (`ℚ(ζ₁₀)` has degree 4 over ℚ), which D3 met
first and answered for a KEYHOLE — every root once. A wedge encircles ONE of the `n`, so the
structural sum becomes what the residue theorem actually says, `Σ n(γ,zₖ)·Res`, with the all-roots case
left as a wrapper; an undecided weight REFUSES rather than contributing zero, and `argRange` may be
omitted only for an INTEGER power, since a determination is a property of the integrand and F1's has
none to declare. The route is a FALLBACK on purpose: the per-pole one returns `2π/(3√3)` where the
structural one returns `π/(3·sin(π/3))`, the same number carrying a transcendental it does not need.
**Three rows were false, two of them older than the slice.** `2π/5` was not in the thirteen-entry
angle whitelist, so KILL reported that no lemma applied TO THE INTEGRAND for the one integrand shape
it discharges at `n = 4` — a cap replaces the list with the same guarantee (two rationals with
denominator ≤ 12 differ by at least 1/144, so a `1e-12` window admits one candidate or none) and the
row now distinguishes an unreadable sweep from an unsupported integrand. And CATCH read
`poles.exactlyComplete` — *was every pole pinned?* — where the claim beside it is about the SUM, so
**D3 at `(a,n) = (2.3, 5)` had printed the exact `(π/5)/sin(23π/50)` beside "not every residue is
known exactly, so the total is an estimate" since M4.2e**, which is precisely what that route exists
to deny. **F1's uniform answer took a fold, and the fold needed a rule.** At `n = 3` the sine
recogniser leaves `(1/6 + i√3/6)·e^{−iπ/3}`, exactly `1/3`, which the old fold (`e^{iπr}` with
`2r ∈ ℤ`) could not take — so the flagship fixture printed a decimal and no closed form. Folding every
representable root of unity fixes it and breaks D7, whose residue-at-infinity row became
`17√2/8 − 17i√2/8` where `17/4·e^{−iπ/4}` is the same number with its magnitude of 4.25 visible — and
that row exists to say `2π·4.25 = 26.7` in an answer of 1.216. So: **a fold may COMBINE a radical the
coefficient already carries, never INTRODUCE one**, which subsumes the old collision worry rather
than answering it separately. All four F1 fixtures then print `(π/n)/sin(π/n)` by two routes the
record cannot tell apart. Its real job is **cross-provenance**: `2π/(3√3)` is also D3 at `(a,n) =
(1,3)`, computed by a keyhole with a cut, a `z^{a−1}` monodromy and a `−e^{2πia}` phase, where F1's
wedge has no cut at all — and D3 REFUSES there, naming this record as the repair. `unitRoot` moved to
its own module on the second-consumer rule, by which time there were three. Sweeps: 9/9, 18/18, 9/10.
**F2 stays deferred with E3** (ADR-0042's `knownValue`).

**M5.5 builds no record either — it builds tier G's machinery, and executes the second finding
against the research.** The **square** `Γ_N` is the first contour in the gallery with NO target
piece: `∮ → 0` is the result rather than the bookkeeping, and the sum being evaluated sits inside the
residue list as the kernel's own poles at the integers. Its tests pin the MECHANISM rather than a
number that shrinks — `∮ = 2πi(2·S_N − π²/3)`, so inverting it recovers the partial sum from the
engine's own quadrature, and the residual is then the tail `Σ_{n>N}1/n²` bracketed in `(1/(N+1), 1/N)`.
**The kernels are `π cot(πz)` and `π csc(πz)`**, with residue exactly `1` and exactly `(−1)ⁿ` at every
integer: the alternation belongs to the KERNEL, not to `f`, which is why `Σ(−1)ⁿ/n²` will cost nothing
once `Σ 1/n²` exists. What the module computes is `f(n)` exactly over ℚ(i); what it ASSERTS is the
kernel's residue, checked against an independent contour quadrature rather than against itself. The
leading `π` is **counted, not pattern-matched** — `cot(πz)` has residue `1/π` and is a different sum by
a factor of π on every term — and a numeric coefficient goes to the COFACTOR, where `2π cot(πz)/z²` is
the kernel times `2/z²`. A COLLISION is named rather than summed: G1's `f = 1/z²` merges with the
kernel at `n = 0`, where the true residue is `−π²/3`, needs the Laurent expansion and lands in
ℚ(i)(π) — the same wall the log families met — so it is M5.7's. **And a hole closes with it:**
`findPoles` reports ZERO poles for a `cot` integrand (no reader sees a transcendental, and reporting
nothing is honest), so a square at an INTEGER half-width ran its vertical sides exactly through
`z = ±N` while LEGALITY said "every singularity is clear of the contour". The band is read off the
GEOMETRY — the question is local to the contour drawn, so the integers it can reach are exactly the
ones to list, and a contour that moves gets a new window on the same recompute. **The bound is
`8π·coth(π/2)·(N+½)·max|f|`**, exact in ℚ, where `max|f|` read at `|z| = N+½` bounds `|f|` on the
whole square by a term-by-term inequality rather than by any monotonicity of `|f|`; `coth(π/2)` is
bracketed from a certified LOWER bound on `e^π` (`e^x ≥ Σ x^k/k!` at `piLower()`), with both
truncations pushing the same way — the only direction a bound may err. It **refuses** a half-width
that is not `N + ½` by name — which ENFORCES what `through: "halfIntegers"` declares, from the
geometry rather than from the field, and is strictly stronger because it catches a dragged contour
too. The schema field itself is still unread, and stays so until a G record declares it. **D-2 is executed:** research 03 §8's `(M/N^k)·coth(π/2)·4(2N+1)` drops the
`π` from `π cot(πz)` and is then not a bound at all — 3.392 against a measured 3.567 at `N = 3`, 0.356
against 0.493 at `N = 25`. **And a correction to the correction:** the gallery calls that "30–40 % at
every N tested"; measured, it is 4.9% at `N = 3` and 27.8% at `N = 25`, GROWING, because the ratio
between the two bounds is exactly `π·(N/(N+½))^k` — so 30% is the asymptote, not the typical case. The
finding stands; only its magnitude was overstated at small N. Two performance/precision findings came
with it: the ledger spent 3.1 s per square side recomputing a CONSTANT (`piLower()` is far more
precise than a 40-term series needs, and `x^40/40!` over it makes thousand-digit BigInts), and the
bracket is then so tight that comparing it to `1/Math.tanh(π/2)` tests float64's rounding rather than
the arithmetic — M5.2's `piUpper().toNumber() === Math.PI` again, with the same fix. Sweeps: 7/7,
15/15, 14/15.

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
