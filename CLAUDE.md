# CLAUDE.md — project context & working agreement

> This file is read automatically by Claude Code at the start of a session. It is the
> **authoritative** brief. The full reasoning lives in [`docs/`](docs/); read those for
> the *why*, but the decisions and guardrails here are binding.

## What this repository is

`complex-analysis-suite` — a monorepo for a growing **suite of complex-analysis /
complex-dynamics visualization tools** that share common packages and hand data off to
one another. North-star property: **each new tool builds fewer primitives from scratch
than the last.** It now unifies thirteen apps — Complex Dynamics, Quadrature Domains,
Complex Function Plotter, Riemann Map, Argument Principle, Faber Transform, 2D
Electrostatics, 2D Hydrodynamics, Hele-Shaw Flow, Potential Theory, Contour Integration, and
Polynomial Roots, plus the anti-holomorphic Correspondences tool (built, not yet published) — riding
thirteen shared `@cas/*` packages.

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
   plus a shared nav header later — that clause is **WITHDRAWN by ADR-0044**; the launcher is the
   unified menu and no in-app header replaces it, with the removal staged as N1–N6). **No**
   unified single-page shell.
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
    `2d-electrostatics/`, `2d-hydrodynamics/`, `hele-shaw-flow/`, `potential-theory/`,
    `contour-integration/`, and `polynomial-roots/` beneath it.
    `apps/correspondences` is **built but not published** (the launcher shows it as "Coming soon"). There are **two** workflows: `ci.yml` (jobs `build` + `browser` + the non-blocking
    `a11y`) and `deploy-pages.yml`; the `browser` job is not a publish blocker. *(Corrected
    2026-09-20: this said "the `build` + `browser` gate" — `grep -n '^  [a-z0-9_-]*:'
    .github/workflows/ci.yml` gives `build:` 46, `browser:` 131, `a11y:` 187.)*

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

Green is **618 test files / 7034 tests**
*(615 / 6997 before ADR-0046's PR-3 — deep zoom by reference — added 3 files / 37 tests; 610 / 6949 before its PR-2 — the limit-set engine — added 5 files / 48 tests; 599 / 6818 before
Polynomial Roots itself added 10 files / 122 tests and its `@cas/gpu` extraction 1 / 9; 592 / 6643 before the 2026-09-20 remediation)* with lint and typecheck
silent. `pnpm lint` includes `pnpm dep:check` (dependency-cruiser). `pnpm test` builds the
`packages/*` dists first, so a clean clone can run it directly. Two suites behave unusually: the Quadrature-Domains maths runs as
**29 per-file specs under `apps/quadrature-domains/vitest/node/`** (via `vitest/node/_run.ts`), and
**jsdom is opted into per FILE, by a `// @vitest-environment jsdom` docblock on line 1** —
`packages/ui` is the only one that sets it in its Vitest config, and Quadrature-Domains' own config
says `environment: "node"` while ~33 of its `vitest/` DOM specs opt in anyway. Measured after the M8
merge, rather than remembered: **33 Quadrature-Domains** specs, **23 Contour-Integration** ones (the
whole `src/shell/` surface after M8 — the cards, the two rails, the bar, the front door, the drill,
the strip) and **3 Complex-Dynamics** ones (reaching `src/main.ts`), and no other app or package.
*(Corrected 2026-09-20 by re-measuring rather than re-reading: this said the QD maths ran as one
wrapper spec around `node app/node-test.js`, which QD-TEST-1 replaced with the 29 per-file specs —
`app/node-test.js` is kept for standalone runs; and it said 34 QD jsdom specs where `head -1` over
`apps/quadrature-domains/vitest/**` finds the docblock on line 1 in **33**, the thirty-fourth file
being `vitest/_algebra-mount.ts`, a shared mount helper whose docblock is on line 10, where Vitest
does not read it.)*
*(This paragraph named three Contour-Integration files by name until M8 step 5.3; all three were
deleted at the M8 cutover.)* **Never pipe the gate through `tail` or `head`** — doing so has
truncated real failures before.

Dev servers go through `.claude/launch.json` (one entry per app that has one — **four today**:
`qd-esm` 5199, `cd-esm` 5188, `corr` 5176, `contour` 5177), not a bare `vite` left running in the
background. *(Corrected 2026-09-20: this said "one entry per app"; `grep '"name"' .claude/launch.json`
gives four configurations against twelve tool apps.)*

**The browser suites are NOT in `pnpm test`** and must be run deliberately — `pnpm test:browser` in
the app that has one (contour-integration, complex-dynamics, complex-function-plotter, quadrature-domains,
polynomial-roots, `packages/gpu`, `packages/schwarz`). They compile real GLSL and need a Chromium, and Playwright pins an
exact build that `pnpm install` does not fetch, so a container holding one under a different version
cannot launch the provider at all. Four of the six configs say so: contour-integration,
complex-dynamics and `packages/gpu` take `CAS_CHROMIUM_EXECUTABLE ?? /opt/pw-browsers/chromium` — both,
in that order — and quadrature-domains probes `/opt/pw-browsers/chromium` only. **complex-function-plotter
and `packages/schwarz` still take neither, so their suites cannot run in such a container** — unify them
when one is next touched. *(Corrected 2026-09-20: the split was written as one-env / one-probe / two-both;
grepping all six configs gives three-both / one-probe / two-neither — contour-integration's line, which
its own config once called "ONE LINE THE OTHER THREE DO NOT HAVE", has since been taken by two of them.)*
**Run it when a slice adds a record or touches the stage:** the contour-integration
browser suite was red for three milestones on a hardcoded record count, and the node gate structurally
cannot see it. Anything about a shader's NUMBERS belongs there too — QD's Schwarz in-Ω mask claimed
membership for points its exact ψ could not invert, and Complex Dynamics' σ view carried the same defect
through the SHARED `@cas/gpu` mask; neither is reachable from the node gate, which never compiles the
GLSL (`apps/quadrature-domains/vitest/browser/schwarz-mask.browser.test.ts`,
`apps/complex-dynamics/test/schwarzMask.browser.test.ts`).

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
`@cas/export`, `@cas/conformal`, `@cas/faber`, `@cas/ui`, `@cas/flow`, `@cas/rigor`) — `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`, and `@cas/export` were all extracted later
than the phase plan, on the ADR-0007 second-consumer rule; `@cas/exact` and `@cas/schwarz` are each used by
Complex-Dynamics and Correspondences, `@cas/dynamics` (Böttcher exterior maps + external rays) by
Complex-Dynamics (its original second consumer, the Riemann-map studio, shed it — see below), and
`@cas/export` (PNG text-chunk reproducibility metadata) by **seven** apps — Complex-Dynamics, the
plotter, the Riemann-map studio, Argument-Principle, 2D Electrostatics, 2D Hydrodynamics and
Contour-Integration. The plotter and Riemann-map apps plus `@cas/dynamics` (ADR-0010–0014) landed
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
inherited the math rigor but not the product shell. `@cas/ui` collects three primitives ported from Complex
Dynamics' proven patterns — `mountCanvas`/`attachCanvasA11y` (accessible canvas: focusable `role="application"`
overlay + keyboard, or `role="img"` for a static view), `runWithFatalBoundary`/`showFatalBanner` (init inside a
WebGL2-aware fatal-error boundary), and `createComputeClient` (worker-offload + coalescing + sync fallback + busy
state). There was a fourth — `mountNavHeader`, with the `SUITE_APPS` registry beneath it — **withdrawn from the
package and from every app by [ADR-0044](docs/DECISIONS.md)**; the package's other three retro-justify the
extract-ahead many times over. It is the first package whose tests run under **jsdom**. Adopted app-by-app: **CD** (the
fatal boundary + `JuliaMetricsClient` on `createComputeClient`), **faber-transform**, **correspondences** (both
pages), **riemann-map**, **argument-principle**, and the **plotter** — closing each app's a11y / fatal-error UX
findings. **QD is deliberately NOT a consumer** (allowJs/vanilla and already product-mature; it took `@cas/schwarz`
as a devDependency only, for the ADR-0026 σ drift-guard). **U8 is now done** — a **non-blocking `axe` CI job**
(`a11y` in `ci.yml` → `scripts/a11y-audit.mjs` + `scripts/a11y-baseline.json`, or `pnpm a11y`) audits all nine
built app pages in headless Chromium against a per-page baseline, surfacing a11y *regressions* as `::warning::`
annotations + a step summary without ever blocking a merge (publishing stays gated only on lint/typecheck/test).
**U7 is CLOSED as withdrawn, not done** (ADR-0044): it would have wired the nav header's hand-off picker to
`@cas/interchange`'s known map kinds, and the header itself is withdrawn — a cross-app hand-off belongs in the
panel that owns the state instead. Two correctness guards also landed this arc: a **convention-neutral**
scan over `@cas/core` (ADR-0006 AI-2) and a **Schwarz σ differential** guard between QD's engine and `@cas/schwarz`
(ADR-0026 AI-2).

**The σ mask defect, now closed on BOTH sides of it (QD #337, then `@cas/gpu` + Complex Dynamics).** QD's
Schwarz view had salmon speckle along every tile boundary; the cause was not Newton but the in-Ω test. A
rasterised polygon mask is an APPROXIMATION of ∂Ω while ψ = φ⁻¹ is exact and **PARTIAL** — it exists on
φ(𝔻*) alone — so inside the band where the two disagree the shader asks σ about a point outside its
domain, Newton converges to a WRONG-SHEET preimage, and the pixel is painted as a numerical failure. It
iterates, so it lands on ∂Ω and on every σ-preimage of ∂Ω. Two things fix it and neither is a tolerance:
drop the pad (a pad is not headroom — out-of-`[0,1]` uv already classifies correctly, so every factor
above ~1 is spent boundary resolution), and re-stroke the outline in the colour meaning NOT-in-Ω so the
rasteriser's own half-texel error is resolved AGAINST Ω. Complex Dynamics' σ view rides the SHARED
`@cas/gpu` mask and had the same defect — measured, 1.14% of a 512² frame at 30× zoom, 99.9% of it points
with no `|z| > 1` preimage at all (exact cubic roots, so non-existence rather than a search that gave up),
against 0 of 3000 control pixels — closed by a `conservativeOmega` option on `buildPolygonMaskTexture`.
**And fixing it broke a test that the defect had been satisfying.** `schwarzGL.browser.test.ts`'s
pole-bearing case asserted `distinctColors > 1`, "structure, not a flat fill" — but that φ's σ field is
exactly two classes at every zoom (K and the first tile; every point of Ω enters K in ONE step), and the
linear ramp paints both at `t = 0` correctly, so its honest frame IS flat and the assertion had been
passing on two stray `invalid` pixels. It is now a per-pixel parity check against the float64 CPU engine
under the sqrt ramp, which also supplies the anti-vacuity clause the deltoid could not — "no invalid
pixels" is no longer buyable by over-dilating the mask until Ω is gone. Measured by widening the stroke:
the check bites once ∂Ω moves by about one SCREEN pixel, 38.7× the margin shipped. QD's own high-resolution
Schwarz export (#338) landed alongside.

**`apps/contour-integration`** (2026-09): a sandbox and 28-integral worked-example gallery for contour
integration and the residue theorem, including the evaluation of real definite integrals in closed
form. Plan, design and content spec are in [`docs/contour-integration/`](docs/contour-integration/)
— **read `PLAN.md` then `DESIGN.md` before touching it**; the 28 gallery entries are the engine's
specification, not examples added afterwards. **Its shell was rebuilt at M8** (ADR-0043, the *Done — M8*
paragraph below): `src/shell/` is the M8 shell — a keyed DOM builder, two rails, KaTeX and the textbook
vocabulary — over the same engine, so anything below describing the SCREEN before M8 describes a shell
that no longer exists, while everything about the MATHEMATICS is unchanged.

Through **Milestone 7** and published — **M1–M7 complete, and THE GALLERY IS COMPLETE: all 28 records load and every one is executed against the engine.** `∮ f dz` comes from `2πi Σ n(γ,aₖ)·Res(f,aₖ)` — a *formula*,
not a quadrature — with exactly-decided winding numbers (exact-sign predicates over a certified
polygonisation) and exact residues over ℚ(i) or one quadratic extension of it, so `1/(1+z⁴)` reads
`π√2/2`. Numerical quadrature is demoted to an independent **cross-check**; a disagreement beyond its
own error estimate is reported, not resolved by preference. The arc bounds are certified in exact ℚ
with **no floating point in the chain** (including certified rational brackets on π), and the
`deg Q ≥ deg P + 2` hypothesis is *derived* from the exponent rather than checked. The **Closing
Ledger** (COVER / KILL / CATCH / LEGALITY) answers "does this argument close?", and a wrong contour
fails diagnostically — closing `∫cos x/(1+x²)` downward shows the bound diverging and names KILL.
The 28 gallery records load as **data** through a schema and a loader enforcing four invariants,
with Pass 5's `M t = r` solved exactly over ℚ so rank is decided rather than thresholded; **all of
them — every entry in every tier** — are executed against the engine in the suite, each solving to a
symbolic closed form because the whole solve runs in units of π and never evaluates it.
A record that fails an invariant is dropped, not thrown on. **Extended M3 (M3.5a–c)** then made the
engine's work reachable: the thirteen records are **browsable** (a `Sandbox | Gallery` switch, with
one shared analysis path — `engine/analyse.ts` — that the golden corpus also runs, so the numbers on
screen are the numbers the suite pins); every record carries a **derivation panel** that renders the
ledger's own certificates, their methods and their ✓/✗ audit trails, with **every badge in the app
computed from a verdict** (the last literal `=` is gone, and the corroborating quadrature no longer
caps an exact `∮` at `≤`); and the **contour is an object you can grab** — drag it across a pole and
the value jumps by exactly `2πi·Res`, park it on the pole and there is no number at all. **M6 is
complete (M6.0–M6.4)**: the state object, the `#vs=` permalink, the figure export and the a11y pass,
so what a reader sees is now also what a reader can SHARE. **M7 is complete (M7.1–M7.4)** — the contrast
ladder, the pen and the faded drill, with the milestone split out of M6 because PLAN's M6 gate never
mentioned the teaching layer it carried.
**M5 is complete (M5.0–M5.8);
all 28 records are loaded and every tier is done**, and **M5.6** built the tier-G solve — `Res(K·f, z₀)` at a pole of the cofactor
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
§6.3's mandated formula (4) — the kernel `K` is odd about every integer, so `u·K(n+u)` is **even** in `u`
and the coefficient of `u^{2k−1}` is a rational multiple of `π^{2k}`; hence the `u^{−1}` coefficient of the
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
declaration must stop the SOLVE and not only fail the checker.

**M5.8 completes M5 and the gallery — the last two records, and the import they both rest on.**
§10.3's cross-family invariants are RUN rather than reasoned, and **three of them turn out to be one
identity**: `(π/a)coth(πa) − 1/a² = Σ_{k≥1} (−1)^k t_k π^{2k} a^{2k−2}` with `t_k` the summation
kernel's OWN Laurent coefficients, so `a → 0` is a series rather than an evaluation at a small `a` —
its `a⁰` term is exactly `−Res₀` (G1's answer), its `a²` term is ζ(4)'s, and the same statement on
`csc` closes the other column, making the 2×2 square of {cot, csc} × {collision, none} one fact about
one series. F1's invariant earns its place because the two routes print **different closed forms for
the same number** (supplementary angles with equal sines), which a shared formatter could not have
produced. Then **ADR-0042's `knownValue`**: E3's top side is `√π` and F2's return ray carries
`Γ(1+1/n)`, neither a residue, neither vanishing, neither proved by the argument being checked — so
under the v1 schema both were `free`, which Pass 3 prices at `≈`, **capping a perfectly exact argument
by its most certain step**, while a bare `=` would launder the import as a derivation. **There is ONE
import**, because E3's own record says `√π` IS `Γ(1/2)`, so the closed set is the Gamma function at a
rational argument and one independent check (`∫₀^∞e^{−tⁿ}dt`, F2's declared method) covers both. **An
imported value has no inverse**, which is the arithmetic of "imported": Pass 5's fourth route works in
the rank-1 module the atom generates and REQUIRES `∮ = 0`, since `2πi Σ Res` carries π and an import
does not and `0` is the one value both rings share — not a restriction but these records' own content,
the empty singular set. **E3** (`√π e^{−b²/4}`, the twenty-seventh) brought the first bound whose
`max|f|` is ATTAINED rather than majorised — `Re Q(c+iy)` is an exact quadratic, so the maximum is a
decision over three candidates, and the vertex is a real one (`e^{z²}` on `Re z = 0` over `[−1,1]` has
`|∫| = 1.494` where an endpoint-only maximum certifies `0.736`, a FALSE bound rather than a loose one)
— plus a LEGALITY row for the empty singular set, which had said nothing at all where "there are none"
and "none were looked for" then looked the same. **F2** (Fresnel by the `π/(2n)` wedge, the
twenty-eighth) needed **no new engine**: M5.2 built `linearMinorant.ts` two slices before its consumer
existed, and measuring the discharged bound showed it **loose by exactly `π/2` — the minorant's own
slack at the origin**, where the true `sin(nθ) ≈ nθ` against a claimed `≥ 2nθ/π`. Its conditional
convergence is arithmetic rather than a footnote: the partial integral's error is
`(sin R², −cos R²)/(2R)`, envelope `1/(2R)` and phase `R²`, so no component settles while the ANSWER is
bit-identical at every radius — and `ray0 − T` is exactly `−arc`, which makes the arc bound a bound on
the TRUNCATION ERROR, and the accumulator draws the **Cornu spiral**. Both records determine TWO
unknowns from one complex identity (`[1, i]` realified), which turns E3's `target-is-real` hypothesis
into a column the contour must pin and makes F2's `∫cos = ∫sin` something the app COMPARES. Schema gaps
**SG-2** (built as proposed), **SG-3** (shipped as the record's own evenness reduction) and **SG-4**
(the schema already had `convergence`) all close. The plan and its one engine decision are
[`M5-plan.md`](docs/contour-integration/M5-plan.md) + [ADR-0042](docs/DECISIONS.md).

**M6 has begun — M6.1 gives the shell a state object, and its first test.** Plans:
[`M6-plan.md`](docs/contour-integration/M6-plan.md) (presentation and publish) and
[`M7-plan.md`](docs/contour-integration/M7-plan.md) — M6 was **split**, because PLAN's M6 carried the
teaching layer in its scope while its gate never mentioned it, so that half had no completion criterion
at all; the Pólya work/flux toggle is dropped on the record. `src/shell/state.ts` holds `ShellState` and
`resolveState` — the app's three compute branches (a gallery record, a sandbox expression, a sandbox
expression with a branch factor declared) as ONE pure function of that state — and `mountApp` returns
`currentState()` / `applyState(s)` over the closure's locals. Proven a no-op the way M5.6b proves one:
the whole visible rail and strip dumped before and after across 28 records × every fixture, 7
expressions × 10 templates and the full declared block, **byte-identical over 710 lines**. It brings
`test/shell.test.ts`, the **first test that reaches `src/shell/app.ts`** — 2,511 lines reached by
nothing, because the stage is WebGL2 and that looked like a browser-only problem. *(Both facts are
M6.1's, and both were superseded at M8: that spec was deleted at the cutover — its assertions are
`test/shell2State.test.ts`'s, row by row in [`M8/parity.md`](docs/contour-integration/M8/parity.md) —
and `wc -l src/shell/app.ts` now reads **1,422**, reached by nineteen suites. Re-measured 2026-09-20.)* It is not: `mountApp`
builds its stage inside a `try`, the fatal boundary catches WebGL2's absence, `getContext` is stubbed to
`null`, and everything else is ordinary DOM that jsdom runs. Three findings. **(1)** The argument-window
picker was **silently dropping the declared factor**: it adopted `buildDeclaration`'s whole cut system,
whose single point is `SINGLE_POINT_ID` = `"b"` while the reader's is `"b1"`, so `declaredOrder()` went
null and the box went on holding the COFACTOR under an `R(z) =` label — the app then integrating `R(z)`
as the whole integrand with a plausible number beside it, and M5.1c's own demonstration (switch to the
principal window, watch LEGALITY refuse) not happening at all. `setCutFromWindow` rebuilds the cut's
GEOMETRY on the point the declaration names and nothing else. **(2) The milestone's own gate is too weak
to be worth passing.** *"`applyState(currentState())` is a fixed point"* survived **11 of 20 mutants**,
and ten were one defect rather than ten: **a consistently LOSSY round trip is still a fixed point** — a
`currentState` that forgets a field and an `applyState` that never reads it agree perfectly, and every
state the test could reach was already inside the lossy image, so the sentence is satisfied by
`currentState = () => ({})` and `applyState = () => {}`. The property a permalink actually needs is to
**restore a state the app is NOT in and land on the state APPLIED**: two states as unlike as the app
gets, applied in both directions with every field differing, **20/20**. M6.2's *"encode → decode → the
same verdict"* has to be read the same way. **(3) In gallery mode the contour is an OUTPUT** — `adopt`
takes `run.contour`, and the record rebuilds it from `(record, fixture, bindings, geometry)` on every
run — so a state carrying a stale contour is corrected rather than obeyed, which is right, since a
family parameter changes the integrand as well as the geometry. That is M6.2's *"a gallery link is
`{record, fixture}` and nothing else"* arriving as a property of the shell rather than as a size
optimisation.

**M6.2 — the `#vs=` permalink, verified by verdict.** `src/shell/viewState.ts` on `@cas/interchange`
(namespace `"ci"`, the ten-app idiom — *corrected 2026-09-20 from "eight-app": `grep -rl encodeViewState
apps/` names ten, which `src/shell/viewState.ts:3` already had right as "nine other apps"*). **The
measurement came first and corrected M6.0's**, which was
taken before `ShellState` existed: against the real state object the payload is 2.2× larger, and
rounding floats — which M6.0 called "74% of the headroom" — is worth **4.0%**, because the bulk is
structural (piece ids, names, roles, the `params` record) rather than decimal. **The headroom is that
the contour is never serialised as geometry.** In gallery mode it is DERIVED and carried as nothing
(M6.1's finding); in the sandbox it is carried as the RECIPE that produced it, `{template, params,
shift}`, which is expressible because every assignment to `contour` in sandbox mode is a template
build, `setParam` or a rigid `translateContour` and nothing else. That is research 07 §6's
semantics-not-samples rule one level further up than the plan asked — the piece list is already
sample-free, since `contour/model.ts` has no sampled-point representation at all — and it takes the
worst case from **2,838 B of URL, over research 07's ~2 kB warning, to 1,078 B**; a gallery link is
130 B. `ShellState` gains `contourSource` provenance (kept in step by one `moveContour` helper, so the
recipe and the geometry cannot drift), and `src/shell/templates.ts` is extracted on the second-consumer
rule because the codec is DOM-free. **The recipe is VERIFIED on encode** — rebuilt and compared against
the live contour, refusing rather than minting a link that would open a different shape, which is the
ledger's posture applied to the app's own provenance. **The gate is by VERDICT**: 28 records × every
fixture, encode → decode → re-run → the identical closed form and the identical ledger rows, every
decode landing in a FRESH default so M6.1's consistently-lossy trap cannot pass it; field equality
would have passed M5.1's shadowed-`branch` bug. A link that cannot be honoured **refuses by name** —
an unknown record, a fixture past the end, an unknown template, a non-finite number, a foreign app, a
truncated hash, and a **declaration naming a branch point the link does not carry**, which is M6.1a's
bug in permalink form. Five findings. **(1) TWO camera bugs, in opposite directions, and only a real browser found the
second.** `frameContour()` after APPLYING a link discarded the sharer's camera (caught in the draft —
the link carries the view and reframing overrode it); then a Playwright pass found the converse, that
`frameContour()` runs AFTER the recompute which writes the URL, so opening a record left the ADDRESS
BAR a step behind — `halfHeight 1.2` in the bar against 4.8 on screen. The copy button hid it by
writing its own hash first, so the SHARED link was right while the URL a reader could select and paste
was stale. `screen()` cannot see a camera, so no jsdom test could either until one read the hash. The
repair is one place rather than three, because keyboard pan/zoom and WHEEL zoom run outside any
gesture and a wheel has no end event at all — which makes per-event writing unsafe, since
`replaceState` is rate-limited by the browser and would silently stop — so `syncHash` coalesces on a
250 ms timer and every caller simply says "this changed".
**(3) A refusal is not an absence**: `decodeShell` returns `null` for "no link" and a named reason for
"a link I cannot honour", and the latter gets its own box, because `errorBox` is cleared by the next
successful parse and a refusal wiped a moment after appearing is no refusal. **(4) 23/27 on the first
sweep, all four survivors real** — `enc-params` and `dec-shift` hid behind one hole (no test built a
contour that was genuinely a moved template at moved parameters, so the only shift test was the refusal
path), `enc-record-sandbox` changes no number so no verdict could catch it, and **`dec-template` pinned
the outcome without pinning the reason**: removing the check still refuses, because `fromRecipe` returns
null a few lines later, but the message then blames a parameter for a missing template. M5.2's finding
met again; **27/27** after the repair. **(5)** The pen tool's contour has no recipe, so encoding
**refuses by name** rather than carrying a piece list for a shape nothing can yet produce — the refusal
being the signal M7 needs its own serialisation, instead of forty lines of speculative one.

**M6.3 — the figure carries its own recipe, and its own verdict.** `src/shell/figure.ts` composites
the stage (the phase portrait with the contour over it) above the accumulator's partial-sum trail,
captions it, and stamps the PNG's `tEXt` with `Software`, the permalink under **`cas:state`** and the
**verdict** — carried BOTH ways, because the plan asked only for metadata and nobody reads metadata,
while a picture of a contour over a phase portrait looks identical whether the argument closes or not.
Two controls (**Save figure**, **Copy figure**), the second passing the export PROMISE into
`ClipboardItem` so the blob resolves inside the user gesture (Safari's requirement, the plotter's
form). `figureLayout`/`figureCaption` are pure and run in the node gate; `drawFigure` is the thin
canvas half and runs in the browser suite — `ui/accumulator.ts`'s split. **`integralRefusal` is lifted
out of `renderResult` into `engine/ledger.ts`** on the second-consumer rule: the caption is its second
reader, and one that re-derived "may a number be shown?" would be an edit away from printing a value
on a shareable image the app itself withholds. **Four findings.** **(1) THE GL CANVAS COULD NOT BE READ
AT ALL** — the context was created without `preserveDrawingBuffer`, so a read after the browser has
composited returns an empty buffer: **1 distinct colour against the ink layer's 44**, so every figure
would have been missing its whole backdrop and would have looked merely plain rather than wrong.
Re-rendering synchronously first does NOT fix it (still 1); the flag does (601), and the synchronous
render stays anyway because the persisted buffer holds the LAST frame. **Its cost is 0.6 %** — a
continuous 60-frame pan is 20.00 ms/frame without and 20.12 ms with, best of three, under SwiftShader
software rendering, which is the worst case for a buffer copy. **(2) IT TOOK THREE ATTEMPTS TO WRITE A
TEST THAT IS NOT VACUOUS**, and the first two would have shipped: "the plate's upper band carries > 12
distinct colours" passes with the portrait ABSENT, because the plate is drawn at 2× and `drawImage`
interpolating the ink's 44 antialiased shades manufactures hundreds (both runs read 601, the sampler's
own cap); and a control plate with the GL layer blanked, required to differ from the real one, reads
**97.9 % in BOTH directions**, since the real plate has been through a PNG encode and an `Image` decode
while the control was drawn straight to a canvas — a tolerance did not rescue it. What works is
asserting the PRIMITIVE (`canvas.gl` reads back > 12 distinct colours), which fails at 1 with the flag
removed, while the synthetic `drawFigure` tests assert exact pixels for the compositing order: **a
number is only evidence if nothing else could have produced it.** **(3) The plan's metadata convention
describes the DOC, not the code** — `@cas/export`'s README and tests specify `Software` + `cas:state`
and have **one adopter of six** (Riemann Map; the others write `ap:url`, `2de:url`, `2dh:url`,
`cdjs:state`, or a caller-supplied record). This app writes the documented key, so one reader can open
any figure in the suite, and the discrepancy is recorded rather than fixed from inside one app.
**(4)** The accumulator is NARROWER than the stage on screen (744 against 1048, its side panel taking
the rest), so it is drawn at the stage's width keeping its own aspect — legitimate because its axes are
`Σ f·Δz` rather than the plane, so there is no shared scale to preserve and matching the frame is only
a matter of not implying the trail stops early.

**M6.4 completes M6 — the page audits CLEAN, and the two canvas descriptions are GENERATED from the
ledger.** Zero `axe` rules and zero nodes, baseline recorded as `{}`, `--strict` passing; re-measured
first, so the claim that M6.1–M6.3's new controls added no findings is a measurement rather than a
hope. Both findings fall to two elements — the grid holding the stage, the rail and the strip becomes
a `<main>`, and the bar's brand becomes the page's `<h1>` above the page's seven `<h2>`s, with the CSS
cancelling the heading's size and margin so the document structure changes and the picture does not.
Research 02 §8 makes the head-to-tail partial sum this app's P0 picture and it was **completely
unannounced**; it now carries `role="img"` and a sentence naming its step count and its endpoint,
while the stage's alternative appends a generated description — the piece count, how many poles the
contour winds about, the value and the ledger's headline, every clause from something the engine
computed and refreshed on each recompute, because a hand-written alternative drifts the first time a
record changes. **Three findings.** **(1) The suite nav looked first and read LAST**, and the comment
above the call claimed the opposite: `mountNavHeader` ends with `container.appendChild(nav)`, so with
the call placed after the shell was filled the nav was its *final* child while `.cas-nav` is
`position: fixed` and draws at the top — a screen-reader user reached "Back to the suite launcher"
only after the entire rail. It has its own host prepended now, which is also what lets the shell be a
landmark at all, since site navigation does not belong inside `<main>`. **Checked rather than assumed:
every other adopter is FINE** (all six call sites mount the nav immediately before appending their
content), so this is not four broken apps but one function whose contract is positional and unstated —
[ADR-0016](docs/DECISIONS.md) action item 5. **(2)** `gl`'s `aria-hidden` was **already** set, by
`@cas/ui`'s `attachCanvasA11y`; M6.0's table listed it as unnamed by reading the role and name columns
and not that attribute. **(3) `prefers-reduced-motion` has nothing to act on, so it is deliberately
not honoured** — measured: `app.css` carries **zero** `transition`, `animation` or `@keyframes` rules
and the app's single `requestAnimationFrame` is a draw COALESCER rather than a loop, so research 07
rule 7 is satisfied vacuously and a media query with nothing inside it would claim to have addressed
something that was never there. Because the a11y job is **non-blocking** in CI, the four structural
invariants (one `<main>`, one `<h1>`, the nav before the landmark, every canvas named or explicitly
hidden) are asserted in `test/shell.test.ts`, which blocks *(that spec was deleted at the M8
cutover; the two structural clauses are `test/shell2Page.test.ts` › "leaves M6.4's structure intact
— one `<main>`, one `<h1>`, and the ladder INSIDE the landmark", and the nav clause is moot since
ADR-0044 removed the header. Repointed 2026-09-20)*. **And the keyboard re-measurement repeated
M6.0's own probe bug**: a DOM walk reading `aria-label ?? textContent` reported one unnamed `<input>`,
where the real accessibility tree over CDP shows **45 interactive nodes in the sandbox and 29 in the
gallery, none unnamed** — a wrapping `<label>` names an input that carries no `aria-label`. Twice in
one milestone: the accessibility tree is the instrument, not the DOM.

**The review that closed M6 found four things, one of them in a package seven apps depend on.**
**(1) `@cas/export`'s `tEXt` chunk is LATIN-1**, and the coercion to `?` had been *documented* rather
than fixed, which made it read as deliberate. It was destroying real content in every consumer — each
one's `Software` string carries an em-dash, and this app stamps a figure's own verdict, where
`= 2π√3/3` was stored as `= 2??3/3`, the mathematics gone from the one field whose job is to say what
the figure claims. `injectPngText` now chooses per entry (`tEXt` when lossless, so existing ASCII
payloads are byte-identical; **`iTXt`** otherwise) and `readPngText` reads both, leaving a
*compressed* `iTXt` **absent** rather than garbled since zlib is deliberately not carried. UTF-8 is
hand-rolled, because the package compiles against `lib: ES2022` with no DOM and no Node types — so
`TextEncoder` is not available — and it already hand-rolls CRC-32 and Latin-1. **The package test
asserting the coercion as intended behaviour is replaced**: a test that documents a defect is how a
defect survives seven consumers. **(2) `figureBytes` captured its caption and its permalink on either
side of an `await`**, so a recompute landing in between would stamp a verdict the drawn caption
disagreed with; everything the plate claims is now read before the first `await`. **(3) The caption
printed a fabricated `≈ 0.0000000 + 0.0000000i`** when there was no quadrature to report, which is the
honest-labelling guardrail inverted — it says so instead. **(4) `describeStage` said "enclosed"**
where it counts poles of non-zero winding, and D6's exterior theorem re-weights by `n − σ`, so the
word was wrong for the one record that most needs it right. **Sweeps: 24/25, one recorded
equivalent** — and all three first-pass survivors were real: nothing asserted the caption prints *no
number* without a quadrature (the sweep found the missing TEST for a fix the review had just made),
nothing asserted the accumulator's step count, and nothing asserted that a pole counts only where its
winding was DECIDED — whose test moves the circle by its OWN radius so the pole lands exactly on it,
a hardcoded shift of 1 having merely enclosed it and passed for the wrong reason until measured. That
last mutant is the equivalent one: every `decided: false` path in `kernel/winding.ts` returns `n: 0`,
so the guard is unobservable and kept anyway, because a description should not depend on an invariant
established in another module. The doc sweep found the **root README** stale in four places — no
`@cas/rigor` in the package tree, no Contour Integration in either the tree or the app table, a test
count from 436 files ago, and "ten applications riding twelve packages" where there are twelve and
thirteen.

**M7.1 — the contrast ladder: five arguments, each one declared row from the last.** Research 02
§13's contrasting cases as gallery ORGANISATION rather than lessons (M7's scope excludes prose,
prediction prompts and self-explanation prompts on the record — *M8 step 3.4 then took exactly ONE
prediction: forced-choice, asked before the drill's menu exists, graded from the ledger, and audited
as its own a11y roster entry `contour-integration-predict`. Noted 2026-09-20*). `engine/contrast.ts` aligns two
ledgers and says how they differ; `shell/contrastGrid.ts` holds the five cells and their DECLARED
difference sets, and the test derives the real set from the engine and requires equality **in both
directions** — nothing undeclared differs, nothing declared agrees. **Measuring first changed four
things.** **(1) The wrong-way cell is not a record and CANNOT be**: B1 derives its closing side from
`sgnA = if(a < 0, -1, 1)` and a `derived` parameter is read-only precisely so the geometry cannot
desync from its own definition, so the record is incapable of being closed wrongly — it is a SANDBOX
state, which makes a cell a `ShellState`, the ladder span both modes, and the gate's
permalink-addressability clause fall out for free. **(2) Rows cannot be aligned by `pieceId`** — the
plan's own risk S-c, biting on the first pair: B1 names its target piece `realAxis` where the sandbox
semicircle names the same row's piece `diameter`, so an id-keyed pairing reports a removal and an
addition where one row changed STATUS. The key is `(constraint, role, ordinal)`, the ordinal forced
because C1 carries two KILL/target rows and two KILL/vanish, and the alternative is implemented in
the test and shown to mis-pair. **(3) The step to C1 moves FIVE things, not the plan's two** — CATCH
`1 → 0` enclosed, the target row splitting ×1 → ×2, a new vanish row, `pieceLimits`, and the answer —
and the last is a UI requirement, since C1's `∮` is exactly 0 while the integral it determines is
`π/2`, so **the grid prints the record's ANSWER and not the ledger's value**. **(4) Running the
ladder found a category with no field for it**: rows whose WORDING moves without the argument doing
so (a renamed piece across the record/sandbox boundary; a quoted clearance). Widening the declared
set would make the grid point at rows that did not change and ignoring them would leave a difference
nobody watches, so they are declared apart, and **a STATUS change may never be filed there** — the
one loophole that would empty the declaration of content. What survives is the premise: the first
three rungs are ONE ROW apart and it is the same row all three times, the arc's. Three findings from
the UI. **Contrasts is not a MODE** — a third one would make every mode check, the codec included,
grow a case meaning "none of the above"; it is a panel, and opening a cell is `applyState`.
**First-appearance row order is wrong and drawing the table is what showed it**, since C1's extra
rows then land BELOW `COVER` in an order its own argument never had — a topological merge instead,
with the failing alternative in the test. And **the a11y roster audits pages in their DEFAULT state,
so a panel nothing opens is never audited**: run by hand, axe found `empty-table-header` on the
corner cell, now named and pinned in the node gate because the axe job does not block. One defect
measured and deliberately NOT absorbed: the page scrolls horizontally at phone width, identically
with the panel open, shut and on the tree before this slice, with `footer.strip` the sole cause
(removing it drops 656 → 400; the nav, rail and bar change nothing). Sweep **24/24**; the one
first-pass survivor was real and unreachable from the ladder — nothing tested that a row
DISAPPEARING is reported, because the ladder only runs forwards — and writing that test found that
`KILL/vanish#1` is C1's big arc rather than its indentation, the ordinal counting in PIECE order, so
B1's arc pairs with C1's INDENTATION. Nothing false follows, both being in the declared set, but the
pairing is by position within the role rather than by what a reader would call the same piece.

**M7.2 — the pen: a contour you DRAW, and a link that carries what you drew.** M1's deferred item,
and the grammar every reader already knows (research 07 rule 6) — click = corner, drag = arc, click
the first vertex = close, Backspace/Escape/Enter, Alt suppresses snapping — in the sandbox only,
since a record's contour is the record's. **An arc is pinned by a BULGE, not a centre**: the apex's
signed offset from the chord's midpoint is one number, is exactly what the drag measures, and
*cannot* disagree with the endpoints where a centre (two numbers) can; zero degrades to a segment
continuously. Every drawn piece is a first-class object with an id, a name, a role and a colour, so
the gate — a hand-drawn contour's ledger is indistinguishable IN KIND from a template's — is asserted
by putting a drawn square and the circle template around the same simple pole and comparing both the
constraint/status shape and the value (`2πi`). **The payload chose the wire form:** a twelve-corner
path carried as its piece list is 2,028 base64 characters, *at* research 07 §6's ~2 kB warning, and
twenty corners is 4,635 — the same path as vertices plus a per-piece kind tag is **292**, because
ids, names, colours and every shared endpoint are DERIVED. It round-trips to the same piece list, and
the path is read back out of the geometry rather than stored (one source of truth), so `contourOut`
rebuilds and compares before minting a link — **by SHAPE, not by bytes**, which the first draft
discovered by refusing a perfectly good arc: the bulge goes out through `atan2` and back through
`cos`/`sin`, bit-identical in three of four measured cases and off by 2.0e-13 in the fourth, moving
sampled points by at most 1.3e-12. Five findings. **(1) The defect that shipped in the first draft**
— the drag bowing the piece *leaving* the new vertex against a chord whose far end was still the
click, so the chord was zero — **and the correction to why it survived**, which measuring found: it
was recorded as invisible to jsdom by construction, where in fact `viewport()`'s `|| 1` guard
MAGNIFIES the geometry by 4 (the chord is 280 world units, the drag makes a real arc with bulge
−358), and what let it through was a test asserting the piece COUNT where the defect shows in the
KINDS. **(2) The browser harness's layout was then the defect itself**, twice: Vitest browser mode's
viewport defaults to **414 × 896** — a phone, in which this app's desktop grid overflows — and
mounting without the app's stylesheets gives not a plainer layout but a different one, `.stage` at
1200 × 316 with `canvas.ink` at 1200 × **154**, two boxes that in the real app are the same box. Tests
aimed at either were aiming at an artefact, and the snap that never fired read as a pen defect until
a probe against the dev server showed the product was fine. **(3) `sameShape`'s kind check: the test
pinned the outcome without pinning the reason** — measured, an arc above the straightness floor over
a chord of 2 has radius 5e8, where `pointAt`'s own cancellation moves the samples by 1.1e-7, two
orders above `SHAPE_EPS`, so the samples always disagree first and the check can only decide on a
SHORT chord. **(4) The encode-side verification had no test at all**, because every path the pen can
draw round-trips; what it guards is a contour whose pieces are not the chain its vertices describe.
**(5) The pen's drawing state audits clean** (zero axe rules in all three states), measured by hand
because the roster only ever sees a page's default state. Sweep **25/25**, five closed on a second
pass and no equivalents — among them that the card must NOT be rebuilt on a move that changes
nothing, whose consequence is not cosmetic: `replaceChildren` destroys the buttons, so a reader who
has tabbed to `Cancel` loses focus the moment the mouse crosses the stage.

**M7.3 — the faded drill: four rungs, each supplying less.** Research 02 §7's contour-choice drill
(item 11 of §8 minus its prompts, M7 §0): rung i is the worked argument, rung ii masks the ledger's
KILL column, rung iii masks the contour as well and offers a menu, rung iv is a blank plane and the
pen — scoped to M7.1's contrast set, fading on progress in a versioned `localStorage` key where
absence and garbage read identically. Every rung is a `ShellState`, so **every rung is a permalink**
(M7's gate clause 2) and rides M6.2's round-trip-by-verdict test. Four measurements changed what the
rungs ASK. **(1) "Assert each ledger row" is not a task, structurally** — a faded worked example is
faded from a CORRECT argument, so on these four tasks it is **30 rows, 30 satisfied** (26 exact), and
ticking "satisfied" scores 30/30 without reading any mathematics. So rung ii asks the KILL column —
what each PIECE is for, read off `(status, role, level)` — at target ×5, vanishes ×4, a known limit
×1, where a constant answer scores exactly 5/10; the feedback on a wrong answer is the ledger's own
row. **(2) The menu needs a membership rule**: running each record's integrand over all ten
templates, FOUR of them (strip, wedge, keyhole, dogbone) close and report a target for B1 at `a = 1`,
because each carries a `reproduces` piece and **the ledger takes that role on faith** — nothing checks
`f(ωz) = μ f(z)`. The menu is drawn from the templates whose every role the ledger establishes, and a
test pins that the wedge really does answer, so the rule is load-bearing. **(3) At `a = 0` the
wrong-way contour is not wrong** — the rational case closes in either half-plane and both report `π`
— so the menu declares a second right answer and rung iv's check relaxes with it, the two
declarations cross-checked against each other. **(4) Rung iv cannot check what the others check, and
not from a gap in the drill**: a drawn contour is a FIXED curve while the argument is about `R → ∞`,
and comparing `∮` to the answer would pass a small circle round the pole — so it checks the
ENCLOSURE, with the sign (a counter-clockwise loop about `−i` is refused where the record winds `−1`),
and C1 declares no check because it encloses nothing at all. **The mask's first implementation was
wrong in a way only a browser could find**: `drawContour` begins with `clearRect`, so masking by
SKIPPING the call left the previous frame's contour standing — the ledger hidden, the value hidden and
the answer still drawn. It draws an empty piece list now, measured at **14,429 ink pixels at rung i,
0 at rung iii, 14,729 after a pick**, with the phase portrait untouched because the integrand is the
question. The sandbox twin of each record's integrand is declared and **verified against the record's
own compiled `f`** at 48 points (`@cas/expr` has no printer), which also closes a gap M7.1 left where
its wrong-way cell transcribed B1's integrand unchecked. Every rung audits clean under `axe`,
measured by hand since the roster only sees default states. Sweep **30/30**, three closed on a second
pass — two unreachable from the drill's own tasks and built by hand, one the value card nothing
asserted was masked.

**M7.4 completes M7 — the review, and three defects in code that shipped green.** Each slice swept
as it landed (24/24, 25/25, 30/30), so the closing slice is the review. **(1) The pen survived
leaving the sandbox**: its controls live in the Contour card and the card offers them in the sandbox
only, so switching to gallery mode took them off screen while `penNodes` stayed non-null — and
`pointerdown` takes the pen's click BEFORE any grab test, deliberately. Measured with two vertices
placed: a click in gallery mode placed a THIRD into a path with no visible controls, and Enter then
COMMITTED it, leaving `contourSource` null and `sandboxContour` a contour the reader never drew; the
same click would otherwise have grabbed a record's radius handle. It is put away now on leaving the
sandbox and on every `applyState` — which is the decision M7.2 already recorded, a half-drawn path
being no state worth restoring. **(2) A grading could outlive its rung**: the derivation is unmasked
once rung ii has been checked (it is then the answer sheet), and `drillGraded` was a shell local
`applyState` did not clear, so a state restored while graded would have shown the whole derivation at
rung iii where the argument is exactly what is masked — `enterDrill` happened to clear it and a link
did not, which is the shape of defect a review finds by reading rather than by failing. **(3)
`checkDrawing` passed VACUOUSLY on an empty singular set**: it mapped over the DRAWN windings alone,
so an integrand with no poles — and rung iv leaves the reader free to edit the box — gave an empty row
list, nothing wrong in it, and the rung reported the enclosure exactly right; the set now has to match
in both directions. **And the a11y roster audits a MASKED rung through its own permalink**, closing
M7.1's "a panel nothing opens is never audited" structurally for the drill rather than by hand — the
gate's addressability clause paying off somewhere unexpected — guarded by a selector that must appear,
since a link the app stops honouring would otherwise audit the landing page under a name claiming
otherwise (measured: a wrong task id exits 2 naming the state it could not reach).

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
the repair. The crossing classifier is **five**-valued on purpose (`clear`, `endpoint`, `along` and
`crosses` are decisions, `touches` is a refusal, since a grazing contact has no side to declare), and
the keyhole's two lips are `along` — legal when tagged. *(Corrected 2026-09-20: this said
"three-valued" and named the keyhole's lips `clear`, which is the version `kernel/branch/crossing.ts`
replaced inside M4.1 itself — its own header says so: "FIVE ANSWERS, AND D1 IS WHY. The first version
of this file had three — `clear`, `crosses`, `touches` — and refused the keyhole outright."
`endpoint` and `along` are what make the keyhole legal.)* The sandbox's **cut editor** is a declared object, *not*
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
across all three apps (**since WITHDRAWN — ADR-0044 removed the in-app header from every app; the launcher is
the unified menu**), added all three to the non-blocking a11y roster (baseline refreshed),
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

**Done — M8 (Contour Integration: the shell rebuild, ADR-0043).** A review at M7 found the engine sound
and the PRESENTATION LAYER the liability — no mathematics typeset, one right-hand rail carrying seven
concerns and torn down on every recompute, a `<select>` of slugs for a front door, and the ledger's house
ids (`COVER / KILL / CATCH / LEGALITY`) shown to readers. So the shell was rebuilt rather than patched,
on the UNCHANGED engine and its `ShellState → resolveState` contract: a keyed DOM builder, **two rails**
(what is being integrated · what it proves) around the stage, **KaTeX throughout**, textbook vocabulary
decided in one place (`engine/vocabulary.ts`, with a two-part denylist — one half reading every string
literal out of the TypeScript AST, the other mounting the app across 43 states and reading the screen —
so a house id cannot reach a reader), a **front door** of eight classics over an eight-group taxonomy,
**four stage modes** on Kovesi's real CET-C6 (quiet / full / isolines / a textbook plate with no portrait
at all), a **stepper** that gives the argument in the order a lecturer gives it, scrubbable limits, the
amplitwist detail, the contrast ladder as a strip, the faded drill rehoused as a card, an **editable piece
list** (seven actions plus a Shift-drag division) and undo/redo. Phase 0 merged to `master` alone
([#340](https://github.com/ajgraven/complex-analysis-suite/pull/340)); Phases 1–5 landed in one merge.

Six findings worth carrying. **The rebuild's own gates were the weakest part of it, twice**: M6.1's
*"`applyState(currentState())` is a fixed point"* survived 11 of 20 mutants, because a CONSISTENTLY LOSSY
round trip is still a fixed point; and step 3.6's gate clause named *a Worked-example permalink at step 5*
for a link that could not exist, the reader's place in an argument being session state the codec did not
carry. **The plan's own carriers were falsified by measuring them** — serialising an edited template as a
pen wire changes the LEDGER for four of the ten templates (a full turn has a zero-length chord no bulge can
express; a rebuilt arc's centre lands 2.2e-16 off an origin `arcRadius` demands exactly), so an edited
contour is carried as WHAT WAS DONE TO IT, six replayable operations onto the recipe. **A defect can ship
green because a test pins the outcome without the reason**, which the sweeps caught at 4.2, 4.3, 4.4b, 5.1
and 5.2. **The accessibility TREE is the instrument and a DOM walk is not** — established at M6.4 and
re-established at 5.1 and 5.2, a walk reading `aria-label ?? textContent` reporting twelve unnamed controls
on a page whose tree has none. **A sentence the engine composed correctly can still reach a reader wrong**:
the Result card said *There is no integrand* about a refused declaration with the integrand still in the
box, and printed a refused claim raw above a typeset copy of itself. And `scripts/a11y-audit.mjs` now walks
each page's accessibility tree beside axe — **682 interactive nodes across 20 pages,
0 unnamed** *(this said 845, measured at M8 step 5.2; ADR-0044's removal of the bar then measured
792 → **682**, and the 845/792 pair is itself unreconciled — so the total is re-run rather than
remembered. the per-contour-page figures are 46/60/39/43 — ADR-0044 DID move them, by the nav's eleven nodes each, from step 5.2's 57/71/50/54, and the 2026-09-20 remediation moved none, measured by diffing the landing page's tree between the two builds)* — because
a `<div tabindex="0">` with no name is a tab stop a screen reader announces as nothing and **axe calls that
page clean**. Plan: [`docs/contour-integration/M8-plan.md`](docs/contour-integration/M8-plan.md); the
step-by-step record, with every finding and every sweep, is
[`docs/contour-integration/M8/STATUS.md`](docs/contour-integration/M8/STATUS.md), the owner's click-through
checklist [`M8/browser-pass.md`](docs/contour-integration/M8/browser-pass.md), and what survived the rebuild
and what deliberately did not is [`M8/parity.md`](docs/contour-integration/M8/parity.md), row by row.

**Done — the post-M8 review and its remediation (2026-09-20, ADR-0045).** Ten parallel read-only
reviews of the app at `5ebfa54` found **the mathematics sound** — all 28 closed forms and 94 fixtures
re-derived independently to 1e-12 or better, every kernel primitive and every bound checked against an
independent computation — and the defects in the GATING of what may be shown: nine confirmed bugs were
one gap, "nothing prints a value the argument has not earned" implemented on some surfaces and not
others, and on LEGALITY where the same argument applies to KILL. Nine work packages then ran in
parallel, each in its own git worktree with its own mutation sweep (33/33, 29/31, 23/25, 24/25, 24/24,
39/42, 21/22, 26/26 — 219 mutants, 7 recorded equivalents), and merged in dependency order with the
gate after each merge. The report, the ten slice reports with every reproduction, and the plan are
[`docs/review/2026-09-20-contour-integration-review/`](docs/review/2026-09-20-contour-integration-review/).
Four findings worth carrying. **A value is earned by different rows than a target**, and the first
draft of the one gate got that wrong: `∮ f dz` is earned by LEGALITY and CATCH alone, the integral the
contour DETERMINES by all four, and asking the target's clause of the `∮` line withheld the one number
the sandbox exists to show (`z/(1+z²)` on the semicircle: `∮ = πi` exactly, a failing KILL row, no
target) — so `valueRefusal(integral, ledger, of)` makes the caller SAY which it is showing
([ADR-0045](docs/DECISIONS.md)). **A refusal that carries the field a consumer reads is a claim**: six
bound producers returned `⚠` refusals with `asymptotics: "vanishes"`, the ledger read only that field,
and `1/(1+z²)` at `R = 0.5` was "The argument is complete." — closed on the ledger's side (a `⚠` level
never establishes) and the producers' (a refusal that reached no bound answers `"unestablished"`), so it
cannot be forgotten a seventh time. **The instruments had blind spots shaped like the defects**: the
denylist read `src/shell/**` and `src/engine/**`, and `KILL` reached the screen from `src/kernel/bounds/`;
it exempted attributes on a premise step 3.6 retired, and 45 `aria-label`s carried raw LaTeX; no test
rendered a REFUSING gallery state through `patch`, and a duplicate DOM key left the previous binding's
`=` answer beside a new refusal on seven records. **And the M8 cutover dropped the record's own branch
cut from the stage** (`stageView` read the sandbox's `state.branch`, never `run.branch`), which
`M8/parity.md` had not recorded — the seven tier-D records draw it again, and the GPU cut-correction
layer M4.7d specified is wired for the first time. Measured after: F2/E3/C2 recompute 3,630 → 326 ms
(`panelPlan(len, ∞)` had been taking the MAXIMUM plan), a keystroke in the integrand box 553 → 53 ms,
`piUpper()` 2.48 ms → 0.07 µs, a hover 33 ms of GL → none, the D7 tab-wedge a 2 ms refusal by name.
Green: **599 files / 6818 tests**, the browser suite 22 / 232, `pnpm a11y --strict` 682 nodes / 0 unnamed.

**Done — PR-0 and PR-1 of ADR-0046 (Polynomial Roots, the twelfth published app).** `apps/polynomial-roots`
— every root of every polynomial whose coefficients come from a small finite alphabet, painted by density:
the picture at the head of Baez–Christensen–Derbyshire's *The Beauty of Roots*. **No new package**; it
consumes `@cas/ui`, `@cas/gpu`, `@cas/core`, `@cas/flow`, `@cas/interchange` and `@cas/export`, and makes
ONE second-consumer extraction into `@cas/gpu` — Complex Dynamics' histogram-equalisation arithmetic as
`equalizedCdfLut` (`@cas/gpu/histogram`), with CD keeping the decode half alone. PR-1 shipped the scaffold,
the root engine (an app-local Aberth–Ehrlich in a worker pool, pinned against `@cas/core`'s Durand–Kerner),
the per-degree float-texture density stage, the `#vs=` permalink, PNG export, fourteen named places, and
the launcher + Pages wiring. PR-3…PR-5 (deep zoom by reference, the dragons, the gallery) are staged and
not started. Plan: [`docs/design/polynomial-roots-plan.md`](docs/design/polynomial-roots-plan.md).

Six findings worth carrying. **(1) A SMALL STEP IS NOT CONVERGENCE, and treating it as one shipped a wrong
answer.** The Aberth solver first settled a root whose STEP had fallen below a floor; when two iterates come
within ~1e-15 the repulsion sum `Σ 1/(z_k − z_j)` reaches ~1e15 and divides the correction to nothing — the
roots are FROZEN, not settled. On `−1 + iz + iz²` that returned a double root at `−(1+i)/√2` with residual
1.47 and reported `converged`, and the density drew two roots that do not exist. The residual is the only
certificate (`|p| ≤ 8ε·Σ|a_k||z|^k`, Adams/Igarashi), and it is strictly better rather than a trade:
measured over six alphabets to degree 18, **nothing fails to converge under it**, including the five
Littlewood polynomials to degree 12 the step rule had failed. A polynomial that does fail is now not
painted and is counted on screen. **(2) The density's parity test was measuring its own GRID, twice.**
Brute force and the symmetry-reduced sweep disagreed on two cells because `y = 0` sat on a bin BOUNDARY, so
every real root fell either side by the sign of its 1e-16 noise; an odd cell count fixed that and exposed
the primitive cube roots of unity at `x = −1/2`, exactly on a vertical boundary (`1 + z + z² − z³ − z⁴ −
z⁵` is a Littlewood polynomial). With the grid offset off those values all 25 cases agree **exactly**, bin
for bin — far stronger than any tolerance. **(3) Root agreement splits by MULTIPLICITY.** Against
`@cas/core`: 1e-13 on simple roots, 4.8e-8 on the double root of `(z−1)²(z+1)`, 1.19e-5 on the triple root
of `1 − z − z² + z³ − z⁴ + z⁵ + z⁶ − z⁷` — `√ε` and `∛ε`, arithmetic and not solver quality. One tolerance
loose enough for the triple root stops testing the 99% the picture is made of. **(4) A gallery entry has to
SHOW something.** The hexahole place pointed at CKW's own 0.0005-wide window, where measurement says the
nearest trinary root at degree 12 is 7.1e-4 away — the window is empty at any degree this app computes. It
opens at half-height 0.008 now and says so; the holes are PR-2's, which that milestone's gate already
names. **(5) Two instrument defects.** An a11y roster `expect` selector present in the DEFAULT state
verifies nothing (the first keyed on a caption every page has, so it would have audited the front page
under the permalink's name); and the baseline is now written SORTED, because in roster order adding two
clean pages produced a 90-line diff of pure reordering. **(6)**
`scripts/check-built-artifacts.mjs` hardcoded its app names in the summary while counting from the roster,
so a third app made it say *"across 3 published apps (quadrature-domains, complex-dynamics)"*; both are
derived now. `eslint.config.js`'s `APP_NAMES` was also stale by four apps and is brought current.

**Sweep: 47 mutants, 42 killed, 5 recorded** (three provably equivalent, one equivalent in outcome, one
unreachable — each with its reason in the plan). Four survivors bought something. **The classical Aberth
seed radius `|a_0/a_d|^{1/d}` was REMOVED**: the mutant replacing it with 1 changed no test, which sent
the question to a measurement, and over ~20,000 polynomials the textbook radius never won a case — on the
WIDE alphabets it exists to protect it was worse (`{1, 1000}` at degree 14 took 9.23 sweeps against the
unit circle's 8.40). A small alphabet's roots sit near `|z| = 1` whatever the coefficients do, so moving
the seed circle away from 1 moves it away from the roots. **`clampState` had no ordering test**, and with
`maxDegree < minDegree` the pool queues nothing: a blank stage with every control looking correct. **And
the statistics' SHARE had no test on its denominator** — dividing by the polynomial count instead of the
root count is a factor of the degree, and the first repair still passed the mutant because `"150.0%"`
contains `"50.0%"` and the assertion used `toContain`.

**A browser pass then found two more, both invisible to every test that existed.** The statistics panel
and the stage's generated description refreshed only when a sweep FINISHED, so a multi-million-polynomial
sweep filled the picture in beside a panel reading zero and an alternative text saying *"No roots have
been computed yet"* for its whole duration; they refresh on a throttle now. And **the hexahole place
rendered BLACK** — at Calegari–Koch–Walker's own 0.0005-wide window the trinary cloud of bounded degree
puts 1,610 roots into 730,000 pixels, measured at 0.05% lit and two distinct colours. The node places
test passed it, because *are there roots in this window* and *is there a picture* are different questions
and only a rendered frame answers the second. The place opens wider now and says it shows the region
rather than the holes, and the browser suite gained the pairing that tells the two apart.

**Done — PR-2 of ADR-0046: the limit-set engine and the handover.** The app's second reader of the one
coefficient tree. Fix `z`, walk the partial sums `s_k = s_{k−1} + a_k z^k`, and prune every prefix whose
remaining tail cannot reach zero — `|s_k| > max|a|·|z|^{k+1}/(1−|z|) + ε`; what survives is the LIMIT SET,
the points at which a power series over the alphabet can vanish, which Bousch proved is the closure of the
root set inside the disk. `src/engine/limit/` (`walk.ts` float64, `bandt.ts` the independent decision,
`walkGlsl.ts` the generated shader, `handover.ts` the engine rule) + `src/stage/limitPass.ts`, which writes
straight into the stage's existing composite so the equalisation, the ramp, the present pass and the PNG
export are the same code for both engines. Three new places and one split in two; +47 node tests, +5
browser tests.

**COUNTING SURVIVORS IS UNAFFORDABLE, and the escape depth is the better quantity anyway.** The plan
specified a survivor count per pixel. Measured at the app's own flagship window — the CKW hexaholes —
**2,675 of 2,720 texels spent a 40,000-node budget without finishing**, so the picture was one decided hole
on a field of "undecided". Existence EXITS EARLY: the moment one branch reaches the cap there is nothing
left to learn, and the same window then costs **152 nodes a texel**, the Littlewood overview 23, and
nothing exhausts anywhere. The quantity that falls out is the right one: survival to depth `k` is MONOTONE
in `k`, so `reach` is the deepest approximation of the limit set a point belongs to — the escape-time
function of this set — and it is order-independent where a first-hit depth under an early exit would not
have been. One field replaces two, the present pass needs no change, and the two colour modes become two
RAMPS over one quantity rather than a third `ColourMode`. **The node budget bites ONLY inside the excluded
band**, which justifies both: over a 120² grid of `[−2.3, 2.3]²` at depth 40 with the band off not one
texel runs out and the worst spends 5,546 nodes; with the band walked, 14 of 8,100 do.

**The gate asked for a correlation; an exact INCLUSION was available and is strictly stronger.** Every
pixel holding a root of any degree must be lit by the walk. Measured over a 128² grid of the opening view,
band excluded, against the depth-28 walk: **at every degree from 2 to 20, 100.00% — not one root pixel
missed**; and the walk's surplus falls 5,702 → 1,874 → 960 as the degree climbs 2 → 12 → 20, which is the
root cloud converging onto the limit set. A correlation would have passed with a systematic offset, a wrong
fold or a wrong aspect. **Shader against float64: 46,532 texels, ZERO disagreements**, so the assertion is
equality rather than a tolerance — `reach` is discrete and float32 can only move it within ~1e-7 of a tie.
**Bandt's Algorithm 1 is the same predicate in the other coordinate system**, `v_k = −s_k/z^k` turning a
shrinking tail bound into a fixed radius derived by summing the future; the two agree on the frontier
COUNTS over 624 points, 158 in the set and 466 out.

**A browser pass found three, and the third is the honest-labelling guardrail again.** *(1)* The statistics
panel described the LAST FRAME: `syncStats` runs before `render` on a recompute, so a link opening at depth
40 announced "to depth 26" while the controls beside it said 40. It is a pure function of the state now,
with `limitPixelRadius` shared so the legend's `ε` and the shader's cannot drift. *(2)* **The depth has to
follow the zoom.** The depth-`D` walk cannot separate points closer than about `|z|^D`, so a deep view at a
shallow depth over-reports: measured at the zoom story at half-height 4e-4, depth 16 calls 50% of the frame
in-set against 18% at 24 and 16% at 34, where it has converged. Zooming now raises the depth to
`log(pixel)/log|z|` — visibly, on the slider, and it stops the moment the reader touches it. *(3)* **A frame
with NOTHING in the set does not look empty.** The tone map equalises the escape depth over the occupied
texels, so a window that misses the limit set entirely has its one or two escape levels stretched across the
whole ramp and comes out as a full, evenly-coloured picture. Measured: `0.372 − 0.542i` at half-height 1e-3
and below is **0% in the set at depths 16, 24, 34 and 48 alike** — the set is thin there — and it was
painted in two bright colours. The panel now counts the frame (`measureLimit`) and says so in its own line
and in the generated description.

**And a CSS defect older than this slice, found by the a11y roster.** `[hidden]` is a UA rule and
`.row { display: grid }` is an author rule, so every row the shell hides was on screen — since PR-1 the `n`
spinner and the custom-alphabet box under presets that have neither, and now the depth slider and the band
toggle under the root engine. The three Polynomial-Roots roster entries all reported 44 interactive nodes,
and the one that opens the limit-set engine should have reported more; with `.row[hidden] { display: none }`
they read 40 / 40 / **42**, which is the two controls the link opens. The guard is a browser test, because
jsdom cannot decide a cascade.

**Sweep: 45 mutants, 45 killed, no survivors and no equivalents.** Eight survived the first pass and every
one bought a test. Three were about a TIE: `z = ½` exactly is in the Littlewood limit set — `tail[k] = 2^{−k}`
and `s_k = −2^{−k}` at every level, in powers of two, so float64 reproduces Bousch's own boundary bit for
bit — and a `≥` in either formulation's prune drops it. Two were about CONJUGATION: over a real alphabet
`1/z` and `1/conj z` agree everywhere, so the fold could have been conjugating in both the walk and Bandt's
iteration with every picture still right; `{1, ½+½i, −1}` disagrees with its own conjugate at 772 of 2,816
points. One was `max|a|` in Foster's fudge, which is 1 for every preset but `range` and a custom list. One
was the grid taking the larger side of a non-square texel (1,600 of 1,600 cells against 1,300). And one was
`toPrecision(9)`'s own decimal point, which it writes for everything the app normally carries and drops at
nine integer digits — `vec2(123456789, 0.0)` is a GLSL compile error no node test could see, and the custom
alphabet lets a reader type it.

**Done — PR-3 of ADR-0046: deep zoom by reference, and the probe.** The overview is the root engine, the
zoom the limit-set engine, and below a float32 texel the third rung: `src/engine/deep/`
(`dd.ts`, `num.ts`, `reference.ts`, `reference.worker.ts`) + `src/stage/deepPass.ts`. One CPU walk per
frame at the view's own centre — every pixel shares `z₀` to within the view, so the pruning bounds are
`O(1)` and the survivors are the same for all of them — and each survivor's root is a float32 OFFSET the
GPU splats, so no number the shader touches is ever `O(1)`. Two new places, a probe panel naming the
polynomial under the cursor with its residual, a fourth a11y roster entry; +34 node tests across three
new files and +4 browser tests.

**`@cas/gpu/df64` IS A FLOAT32 PAIR, so on the CPU it is a downgrade** — and ADR-0046 decision 3 said to
reuse it. Every operation in `df64Ref.ts` runs through `Math.fround`, because its job is to be the
executable spec for the GLSL, where float32 IS the native type; a df64 carries ~47 bits where a plain JS
number already has 53, so the decision's ladder stepped DOWN at exactly the point it meant to step up.
What it was asking for is the same ALGORITHMS at one higher radix, which is `dd.ts`: Dekker's split and
Knuth's two-sum over float64 pairs, the split factor `2^27 + 1`, `Math.fround` removed. Every operation
is pinned against exact BigInt rationals rather than against another float computation.

**The floor is reached rather than assumed.** At a half-height of `1e-30` the walk returns 2,223
polynomials from 15,871 nodes in 2.2 s, worst residual **1.6e-32**; float64's on the same view is
1.8e-16 — 53 bits and 106 bits made visible. The two agree on the root SET **exactly** from 1e-10 to
1e-13, part company at 1e-14, and by 1e-24 float64 finds nothing at all, so the handover sits at 1e-11.

**A CENTRE IS NEVER INHERITED, and that is what makes a deep view reachable at all.** A `ReferenceRoot`
carries a float64 offset, so a centre built by adding one to the old centre is good to about 1e-17; at
`1e-24` the walk then finds NOTHING there — including the very polynomial the centre was taken from. The
same trap one level up cost the first measurement its whole ladder: the root engine's points are a
`Float32Array`, because they are GPU vertex data, so a centre read off one is good to seven digits and
`|P|` at the supposed root measured 6.4e-8. `centreOnRoot` re-derives the root at the view's own
precision, and it is the probe's "Centre on this root".

**The permalink's centre is a decimal STRING, and the codec had to become exact.** A JSON number is a
double and cannot hold the 32 significant figures a `1e-30` view needs. The first printer and parser both
accumulated in double-double and the round trip was not stable — `π` printed, parsed and printed again
differed in its last three digits, so the same view shared twice would have been two URLs. Both go through
BigInt now: exact digits out of the value's own bits, correctly-rounded limbs back in. A link carrying its
centre as a NUMBER still opens, because every link minted before this milestone does.

**`@cas/flow` is dropped from this app, which now consumes five packages.** `panView`/`zoomView` return an
absolute float64 `{cx, cy}`, and recovering how far a view moved from one at `1e-30` means subtracting two
numbers thirty orders apart — the exact cancellation the reference point exists to avoid. The camera is
`centre + a small increment` in double-double, which is three lines, and one camera is safer than two that
must be kept in step.

**The walk reaches each polynomial ONCE, but a polynomial can have two roots in the view.** Measured
against the root engine at `0.6 + 0.45i`: three of the sweep's 147 roots were second roots of polynomials
already found, with `z₀` in the basin of a root just outside the rect. Each root is deflated out and
Newton runs again, stopped by a NECESSARY condition on what is left — `|Q(z₀)| ≤ r·max|Q′|`, one Horner
pass against a Newton's dozen. That is also the engine's performance: the suite went 64 s → **7.5 s**, and
the 1e-30 case 16.6 s → **2.2 s**. **And the root engine's own list has duplicates**, which the first draft
of that comparison read as roots the walk had missed: the sweep mirrors each orbit representative over the
whole group, so a polynomial fixed by a group element yields the same root twice, while the walk enumerates
up to UNITS. 150 points, 147 distinct.

**At depth the same root comes from MANY polynomials.** If `P` is Littlewood with a root at `α`, so is
`P·(1 + z^(d+1))`, and `P·(1 + z^(d+1) + z^(2(d+1)))`, for ever. Measured at 1e-30: **2,223 polynomials on
140 distinct points**, their degrees running 26, 53, 80, 107, 134 — steps of `deg P + 1`. So the deep
picture's density is a MULTIPLICITY: "how many roots are here" and "how many dots are here" are different
questions, and the panel reports both.

**Two strides for one vertex layout.** `DeepPass` read four floats per root where `packFrame` writes six,
so the pass took each position out of the middle of the previous record — and the picture still looked like
a scatter of dots. One imported constant now, rather than two agreed by inspection.

**The gate, restated with its reason.** The slide deck's own centre `0.42065 + 0.48354i` is not a limit
point below about 1e-4 — measured, the nearest root of degree ≤ 20 is 2.19e-4 away and the walk dies at 45
nodes at any half-height below 1e-6, so there is nothing there to continue INTO. The zoom story continues
past 1e-12, and to 1e-30, **at a root near it**: an exact root of one degree-26 Littlewood polynomial,
which is what Michelen–Yakir's theorem is about in the first place. The hand-over clause has an exact form,
as PR-2's did — every root the reference walk finds lands in a texel the limit-set shader calls in-set, **0
of 50+ outside**, an inclusion rather than a pixel-difference percentage.

Work in small, reviewable commits. Pause at each phase/milestone gate for review before proceeding.
When a command or path in the docs is marked `⚠ verify`, check it against the actual repo
contents rather than assuming.

## Replying: be brief

**The code and the docs carry the detail; the reply does not.** Findings belong in
`STATUS.md` and in the comment beside the code that caused them, which is where a reader
will look for them later — repeating them in chat costs the owner's metered context and is
read once.

- **Report, do not re-narrate.** A finished step is a handful of lines: what was built, the
  numbers the gate and the sweep came back with, where it is written down, and the one
  decision the owner has to make. Never restate a finding the commit already carries.
- **Never announce, never wait aloud.** No "I'll now…", no "waiting…", no progress ticks
  while a background job runs. Say nothing until there is a result.
- **A measurement, not a paragraph about a measurement.** `20.4% (2.03e6 → 1.62e6)` says
  what three sentences would.
- **Bold, bullets and headings are for a reply with real structure**, not decoration on a
  two-line answer.
