# Quadrature Domain Solver

A browser app for computing and visualizing simply connected quadrature
domains and log-weighted quadrature domains, in both the **inverse**
(given the quadrature data, find the domain) and **direct** (given the
Riemann map, find the quadrature data) directions. Implements the
Faber-transform approach to both problems from Andrew Graven's PhD thesis,
*Weighted Quadrature Domains and the Faber Transform* (Caltech, 2026).

> **Navigation:** [ARCHITECTURE.md](ARCHITECTURE.md) — script load
> order, namespace map, cross-tab contracts.
> [THEORY_MAP.md](THEORY_MAP.md) — thesis equations → file:line.
> [CONTRIBUTING.md](CONTRIBUTING.md) — how to add a family, schema
> runtime, test conventions. Per-module READMEs in
> [`app/direct/`](app/direct/README.md),
> [`app/schwarz/`](app/schwarz/README.md),
> [`app/sphere/`](app/sphere/README.md),
> [`app/param-slice/`](app/param-slice/README.md).

## What is a quadrature domain?

A bounded rectifiable domain Ω ⊂ ℂ is a **quadrature domain** with rational
**quadrature function** *h* if

  ∫_Ω f dA  =  ∮_∂Ω f(w) h(w) dw

for every f analytic in Ω. Equivalently (by the residue theorem) there are
finitely many *quadrature nodes* a_j ∈ Ω and complex coefficients C_{j,s}
such that

  ∫_Ω f dA  =  Σ_j Σ_s (C_{j,s} / (s − 1)!) · f^{(s−1)}(a_j).

**Log-weighted quadrature domains** (LQDs) replace the unweighted area
integral on the left with `∫_Ω f / |w|² dA` and add a finite list of
singular families (bounded / unbounded × singular / non-singular,
depending on whether 0 ∈ Ω and ∞ ∈ Ω). See Chapter V of the thesis.

The app's **inverse tab** takes {a_j, C_{j,s}} (i.e. the principal parts of
*h*) and solves for the corresponding Ω by reconstructing its Riemann map.
The **direct tab** takes a Riemann map φ : 𝔻 → Ω (polynomial, rational,
unbounded-Laurent, or arbitrary expression) and computes the corresponding
*h* explicitly via the Faber transform.

## Running the app

No build step — everything is vanilla HTML / JS. **Run it from a local web
server** (not the `file://` protocol):

```
npm run serve        # python3 -m http.server --directory app 8000
```

then open <http://localhost:8000/>. Any static file server works
(`npx serve app`, VS Code Live Server, etc.) — just serve the `app/` directory.

> **Why a server?** The app registers a service worker and runs the solver in
> Web Workers built from the source files. Opening `index.html` directly via
> `file://` still works, but the service worker won't register and the workers
> can't load — the app silently falls back to solving on the main thread (slower,
> no offline cache, and some `file://` console warnings). Serving over HTTP avoids
> all of that.

Modern browser recommended (WebGL 2 is used for the Schwarz/sphere views, with a
CPU fallback). [math.js](https://mathjs.org) and [KaTeX](https://katex.org) are
loaded from a CDN (pinned + SRI) for expression parsing and math display.

### Deploying / hosting

> **Before publishing, run `npm run version:sync`** (then `npm test` + `npm run
> lint`). This recomputes the content-hash cache version so the service worker
> and the `?v=` page-script URLs invalidate on update — skip it and returning
> visitors keep getting the *old* code from the cache-first service worker until a
> hard reload. CI's `npm run version:check` fails the build if the hash is stale,
> so a forgotten sync is caught before merge; running it locally just means the
> copy you publish is already current.

To publish, copy the **`app/` directory** to any static host (GitHub Pages, a
personal website, Netlify, …) and point at its `index.html`. Paths are relative,
so it works under a sub-path too. Nothing outside `app/` is needed at runtime; you
can omit the dev-only `app/node_modules/`, `app/test/`, `app/node-test.js`, and
`app/bench.js` when copying (none are loaded by the page).

### Headless tests

```
cd app
node node-test.js     # covers all families, the Direct tab, the critical-set
                      # kernel, Riemann sphere, Schwarz dynamics, and the
                      # parameter-slice / param-sweep machinery. The runner
                      # prints the live pass/fail tally on exit (the source of
                      # truth for the test count — counts are intentionally not
                      # duplicated in prose, which drifts).
```

The Node test suite optionally uses npm `mathjs` (run `npm install mathjs`
in `app/` once); the parser tests skip cleanly if it isn't installed.

`app/test.html` is an in-browser test page with small per-test
visualizations, complementary to the headless runner.

## File layout

```
.
├── README.md                          (this file)
├── Andrew_Graven_Thesis.pdf
└── app/
    ├── index.html                     entry point (tab bar, sidebars, canvas)
    ├── style.css
    │
    ├── complex.js                     {re, im} complex arithmetic + string format/parse
    ├── taylor.js                      truncated Taylor-series arithmetic
    │                                  (mul, invert, exp, log, reciprocal, compose)
    │
    ├── solver.js                      Family registry; dispatchers; schema runtime;
    │                                  Newton driver; deflation; boundary sampler /
    │                                  univalence check; top-level solveInverseQD
    ├── solver-faber.js                shared inverse Faber transform primitives
    ├── solver-qd.js                   Family.boundedQD            (classical bounded)
    ├── solver-uqd.js                  Family.unboundedQD          (classical unbounded)
    ├── solver-lqd-common.js           shared LQD machinery (Blaschke, modified residues)
    ├── solver-lqd.js                  Family.boundedLQD           (non-singular)
    ├── solver-lqd-singular.js         Family.boundedLQD_singular
    ├── solver-uqd-lqd.js              Family.unboundedLQD         (non-singular)
    ├── solver-uqd-lqd-singular.js     Family.unboundedLQD_singular
    │
    ├── parse-h.js                     custom-text h(w) parser (strict PFD walker,
    │                                  general-rational fallback via Durand–Kerner)
    ├── critical-set.js                complex Newton on φ'(z) = 0 from a polar
    │                                  seed grid; powers the inverse-tab critical-
    │                                  set overlay
    ├── observables.js                 boundary observables (area / perimeter /
    │                                  curvature / harmonic measure / accuracy)
    ├── symmetry.js                    QD.detectSymmetry (D_n / Z_n via φ intertwining)
    ├── thesis-examples.js             curated examples + analytic-oracle engine
    ├── faber-analysis.js              QD.FaberAnalysis: Faber polynomials of a UQD
    │                                  complement + a Durand–Kerner complex root-finder
    ├── sym-core.js                    QD.Sym: exact symbolic algebra (Rational/Gaussian/
    │                                  MPoly/RatFn/FRatFn + power series, Lagrange reversion;
    │                                  resultant/discriminant + Gröbner basis over ℚ(i):
    │                                  Buchberger (+ signature/GVW), FGLM, linearReduce,
    │                                  solveZeroDim + Möller–Stetter eigenvalue solving)
    ├── qd-equations.js                QD.QDEquations: symbolic coefficient system for a
    │                                  classical bounded QD (conjugate + real/imag reps)
    ├── qd-constraints.js              QD.QDConstraints: univalence/geometric constraints
    │                                  (convex/star/spiral, φ′≠0, global injectivity, borders)
    ├── ui-strings.js                  QD.Strings: editable UI prose (SINGLE SOURCE) +
    │                                  the data-str applier (see HELPTEXT.md)
    │
    ├── ui.js                          QD/LQD-tab UI hub: DOM wiring, shared helpers,
    │                                  uiCtx injection + the module installs below
    ├── ui-modes.js                    MODE descriptors + aggressiveness presets
    ├── ui-pole-grid.js                pole / poly-coef control renderers
    ├── ui-h-text.js                   h(w) text ⇄ structured-grid mirror
    ├── ui-solve.js                    solve → render → analyze pipeline
    │                                  (+ alternates + background search)
    ├── ui-url-state.js                URL/hash serialize + restore (B1)
    ├── ui-thesis.js                   thesis-example gallery + analytic-oracle card
    ├── ui-faber.js                    Faber-polynomials card + roots overlay (UQD)
    ├── ui-qd-equations.js             Quadrature↔map equation-system card (classical
    │                                  bounded QD): LaTeX display + self-verify + export
    │                                  (all: QD_UI.installX(uiCtx) factories,
    │                                   Phase-3 item E split of ui.js)
    ├── algebra/                       Algebra tab — symbolic elimination workspace:
    │   ├── sym-worker.js              QD.SymWorker: off-main-thread Gröbner/solve
    │   │                              (Blob Web Worker; progress + cancel)
    │   ├── algebra-store.js           QD.AlgebraStore: equation-DAG model (DOM-free)
    │   ├── algebra-canvas.js          QD.AlgebraCanvas: SVG + KaTeX DAG renderer
    │                                   (collapsible cards, reorder, copy-LaTeX, hovertext)
    │   └── algebra-ui.js              QD_UI.installAlgebra: tab, palette, eliminate,
    │                                   Gröbner basis, dimension/solve, export
    │
    ├── direct/
    │   ├── direct-common.js           Direct-problem kernels (polynomial / rational /
    │   │                              numerical / unbounded), polynomial root finder,
    │   │                              parser, Fourier verifier, boundary samplers
    │   ├── direct-ui.js               Direct-tab UI hub: Domain-type + φ-input +
    │   │                              output cards, mode toggle, dCtx injection +
    │   │                              the two module installs below
    │   ├── direct-recompute.js        recompute → render pipeline (bounded /
    │   │                              unbounded / numerical + h display + ∂Ω plot)
    │   └── direct-verify.js           Verify button (family verifier / round-trip /
    │                                  Fourier diagnostic) — both QD_UI.installDirectX
    │                                  (dCtx) factories, Phase-3 item E split of direct-ui.js
    │
    ├── schwarz/
    │   ├── schwarz-common.js          Schwarz-reflection dynamics math kernel +
    │   │                              per-family CPU adapters; orbit / escape-time
    │   ├── schwarz-ui.js              Schwarz-tab UI hub: capture φ from Inverse tab,
    │   │                              card builders, setMode / view-toggle, sCtx
    │   │                              injection + the four module installs below
    │   ├── schwarz-paint.js           2D-canvas output layer (field / boundary /
    │   │                              orbit / tree / limit-set painters + colormaps)
    │   ├── schwarz-render.js          progressive escape-time renderer (debounced
    │   │                              recompute + GPU path + CPU pyramid)
    │   ├── schwarz-features.js        per-feature compute (domain-coloring, limit
    │   │                              set, level curves, orbits, cycles, sweep,
    │   │                              z-panel, PNG export)
    │   ├── schwarz-interaction.js     canvas hover / wheel / click / dblclick / pin
    │   │                              handlers (all four: QD_UI.installSchwarzX(sCtx)
    │   │                              factories, Phase-3 item E split of schwarz-ui.js)
    │   └── schwarz-webgl.js           WebGL 2 fragment-shader renderer (escape-time
    │                                  in a single GPU pass)
    │
    ├── sphere/                        Sphere-view adapter for the Schwarz tab.
    │   ├── sphere-common.js           Stereographic projection + sphere-mesh
    │   │                              builder + mat4 helpers (Float64)
    │   ├── sphere-ui.js               QD.SphereView.mount(opts) → handle:
    │   │                              orbit camera, drag / wheel zoom,
    │   │                              ResizeObserver, hover tooltip. The
    │   │                              Schwarz tab calls mount() on first
    │   │                              switch to sphere view. (HANDOFF #29)
    │   └── sphere-webgl.js            Three-pass WebGL 2 renderer: opaque sphere
    │                                  base, fractal Mandelbrot-like pass, glow
    │
    ├── param-slice/
    │   ├── param-slice-common.js      Pure math kernel: ParamRef descriptors,
    │   │                              listAvailableParams, applyParam,
    │   │                              classifyResult, color LUT
    │   ├── param-slice-pool.js        Web Worker pool — runtime Blob bundle of
    │   │                              the solver source (no build step)
    │   ├── param-slice-render.js      adaptive 2-D render engine (runAdaptive2D:
    │   │                              progressive quadtree sweep + warm-hint
    │   │                              spatial index + coverage fill) —
    │   │                              QD_UI.installParamSliceRender(psCtx),
    │   │                              Phase-3 item E split of param-slice-ui.js
    │   └── param-slice-ui.js          Parameter-slice tab UI hub (lazy mount,
    │                                  cards, canvas interaction, run orchestration)
    │
    ├── disabled/                      Parked work-in-progress
    │   ├── README.md                  How to re-enable
    │   └── aqd/                       Algebraic QD scaffolding (deferred)
    │
    ├── test.html                      in-browser test harness
    ├── node-test.js                   headless test entry (async runner)
    └── test/                          split test suite + shared harness/bootstrap
        ├── harness.js                 ok/approxEq/report (shared counters)
        ├── bootstrap.js               builds the vm ctx once; installs globals
        └── *.test.js                  one file per subsystem (solvers, schwarz, …)
```

## Supported families

| Tab | Family | Weight | Setting | Status |
|---|---|---|---|---|
| QD (inverse) | boundedQD                  | 1                | Ω bounded                  | shipped |
| QD (inverse) | unboundedQD                | 1                | Ω unbounded                | shipped |
| QD (inverse) | boundedLQD                 | 1/\|w\|²           | 0 ∉ Ω̄                      | shipped |
| QD (inverse) | boundedLQD_singular        | 1/\|w\|²           | 0 ∈ Ω                      | shipped |
| QD (inverse) | unboundedLQD               | 1/\|w\|²           | 0 ∉ Ω̄, ∞ ∈ Ω               | shipped (incl. polynomial h) |
| QD (inverse) | unboundedLQD_singular      | 1/\|w\|²           | 0 ∈ Ω, ∞ ∈ Ω               | shipped (incl. polynomial h + higher-order pole at 0) |
| QD (inverse) | powerQD                    | \|w\|^{2(α−1)}     | Ω bounded, 0 ∉ Ω, any α>0 (α≠1) | shipped |
| QD (inverse) | powerQD_singular           | \|w\|^{2(α−1)}     | Ω bounded, 0 ∈ Ω           | shipped |
| QD (inverse) | unboundedPQD               | \|w\|^{2(α−1)}     | Ω unbounded, 0 ∉ Ω (incl. polynomial h) | shipped |
| QD (inverse) | unboundedPQD_singular      | \|w\|^{2(α−1)}     | Ω unbounded, 0 ∈ Ω         | shipped |
| QD (direct) | boundedQD (polynomial φ)     | 1                | polynomial Riemann map     | shipped |
| QD (direct) | boundedQD (rational φ)       | 1                | rational P/Q, Q≠0 on 𝔻̄    | shipped |
| QD (direct) | boundedQD (numerical)        | 1                | any math.js expression in z| shipped |
| QD (direct) | unboundedQD (Laurent φ)      | 1                | φ = c·z + Σ F_l/z^l        | shipped |
| —      | Algebraic QD                 | \|R'\|²            | arbitrary rational R       | deferred (`app/disabled/`) |

## Mathematical approach (inverse problem, bounded classical sketch)

For a bounded simply connected QD with rational quadrature function

  h(w)  =  Σ_j Σ_{s=1}^{m_j} C_{j,s} / (w − a_j)^s,

the Riemann map φ : 𝔻 → Ω is a rational function (Theorem 3.2.1 of the
thesis) and satisfies the inverse-problem identity (Theorem 3.2.2)

  φ(z)  =  w_0  +  Φ_φ⁻¹(h)^#(z),

where w_0 = φ(0), Φ_φ⁻¹ is the inverse Faber transform associated to φ,
and f^# denotes Schwarz reflection across the unit circle. Substituting the
Bell-polynomial form of Φ_φ⁻¹ and converting Bell polynomials to Taylor
coefficients of the local series ψ̃_j(t) := φ⁻¹(a_j + t) − z_j yields the
explicit system

  **(★)**   A_{j,k}  =  Σ_{s=k}^{m_j} (s/k) · C_{j,s} · [t^s] ψ̃_j(t)^k,

together with the *n* nodal constraints

  **(●)**   φ(z_j)  =  a_j,

in *n + d* complex unknowns (z_j, A_{j,k}), where *d* = Σ m_j is the
degree of h. The other inverse families (LQD bounded / unbounded /
singular variants) follow the same template with family-specific
parametric forms for φ and family-specific residue preprocessing:

| Family | Parametric φ | Residue preprocessing |
| --- | --- | --- |
| boundedQD     | Σ_j Σ_k conj(A_{j,k})·z^k/(1 − conj(z_j) z)^k | raw C_{j,s} |
| unboundedQD   | c·z + Σ_l F_l/z^l + branches part            | raw C_{j,s} (finite) + Faber-at-∞ for polyPart |
| boundedLQD    | w₀ · exp(r#(z))                              | modified D_{j,s} = a_j C_{j,s} + C_{j,s+1} |
| boundedLQD_singular | γ · b_{z₀}(z) · exp(r̃#(z))             | modified D + q-equation at the origin |
| unboundedLQD  | c·z · exp(r̃#(z) + B(1/z))                    | modified D + ∞-gauge + β-correction for h's polyPart |
| unboundedLQD_singular | c·\|z₀\|·z·b_{z₀}(z)·exp(r̃#(z) + B(1/z)) | modified D + q-equation + ∞-gauge + β + γ synth-branch at z₀ |

All families share `QD.Faber.inverseFaberAtPole` (the per-pole inverse
Faber primitive) and the residual / Newton / multistart / deflation
infrastructure in `solver.js`.

## Mathematical approach (direct problem)

Given φ, the Schwarz function σ satisfies σ(w) = w̄ on ∂Ω and extends
meromorphically into Ω. The quadrature function h is the sum of σ's
principal parts at its finite poles in Ω. For the various φ shapes:

* **Polynomial φ**: φ has a single pole of order n at w₀ = φ(0); the
  principal-part coefficients are computed in closed form from the
  Taylor coefficients of φ via the forward Faber formula.
* **Rational φ = P(z)/Q(z)**: σ extends with one pole at φ(0) (if deg P
  > deg Q) plus one pole per root r_i of Q at φ(1/conj(r_i)). The
  polynomial root finder (Durand–Kerner, in `direct-common.js`) locates
  the r_i; per-pole principal parts are computed by the same forward
  Faber primitive.
* **Unbounded Laurent φ = c·z + F_0 + F_1/z + …**: the polynomial part
  of h is computed by back-substituting the dual of `inverseFaberAtInfinity`
  (a triangular system); the finite-pole part is handled only for the
  simple `c·z + F_0` case (exterior of a disk). Higher Laurent terms
  typically don't correspond to classical QDs.
* **Arbitrary expression** (numerical mode): the user types any math.js
  expression in z; the kernel samples on |z| = 1, extracts polynomial
  Taylor coefficients via DFT, truncates, and falls through to the
  polynomial path. Non-analytic-in-𝔻̄ φ (e.g. `conj(z)`) is flagged.

The Direct tab's **Verify** button checks the boundary identity directly
via the **Fourier negative-frequency mass** of `h(φ(z)) − conj(φ(z))` on
|z| = 1 — for any valid classical QD this should be ≈ 0, regardless of
mode. (It works because σ − h is analytic in Ω, so its pullback to 𝔻 has
only non-negative-frequency Fourier modes.)

## Solver (inverse problem)

`solveInverseQD(hData, options)` runs a multi-stage strategy:

* **Stage A1 — direct Newton.** Damped Newton with Armijo line search from
  the family's `initialGuess` (typically a disk-shaped seed). The Jacobian
  is built by forward differences; `newtonSolve` accepts a `jacobianFn`
  override for analytic Jacobians.
* **Stage A2 — continuation.** For some families (notably bounded
  classical QD), an adaptive-step homotopy along `a_j(t) = w_0 + t·(a_j −
  w_0)` for t ∈ (0, 1]. Step grows on Newton success and halves on
  failure; underflow aborts.
* **Stage A3 — multistart.** Perturbed initial guesses with growing
  perturbation magnitude (`numRestarts` × the per-family seed).
* **Stage A4 — diverse seeds.** Log-uniform sampling of the branch
  configuration space.
* **Stage A5 — deflation.** Brown–Gearhart deflation of converged-but-
  invalid roots, to push Newton away from spurious algebraic solutions.

**Validity filter.** A candidate is a "valid QD" iff (i) the boundary
φ(e^{iθ}) does not self-intersect and (ii) the family's
`verifyQuadratureIdentity` passes (default tol 1e-6). Spurious algebraic
roots are not infrequent for asymmetric h; without filtering, the solver
would happily return a wrong domain.

**Stage B — background alternate-solution search.** After the primary is
returned, the UI launches a chunked background search
(`searchAlternates`) that keeps trying perturbed initial guesses; any
new valid solution structurally distinct from those already known is
added to the alternates panel.

## UI

**QD tab.**

As of HANDOFF #30, the former standalone "Direct problem" tab is folded
into this tab as an `inverse | direct` view-mode toggle at the top of
the sidebar. The shared `#canvas` displays Ω in both modes; switching
modes preserves all UI state and re-renders the canvas from whichever
view is active.

*Inverse mode* (default — h → Ω):

* **Domain type** — radio buttons for the ten inverse families (classical
  QD, log-weighted LQD ± singular, and power-weighted PQD ± singular, each in
  bounded and unbounded variants).
* **Quadrature function h(w)** — paste a math.js expression in `w` like
  `1.5/w + 0.5/w^2` or `1/(w-2) + (1+i)/(w-2)^2 + 0.3*w^2` or
  `1/(w^2 - 1)`; click *Parse* (or hit Enter). The text box is two-way
  coupled to the structured pole grid below — preset / mode changes
  refresh it automatically, and parse rebuilds the grid. Parser runs a
  strict partial-fraction walker first (exact results for clean input),
  falling back to general-rational decomposition via Durand–Kerner +
  shift-and-series-divide for inputs like `1/(w^2-1)`.
* **Poles** — per-pole `a_j` field, an order selector (1–6), and one
  `C_{j,s}` field per order. Each complex field has an inline **2-D
  slider pad**: drag to set, wheel to zoom the pad's range,
  double-click to auto-fit.
* **Domain plot gestures** — on the Ω plot, **drag a quadrature node** to
  move its pole `a_j` (live re-solve), **double-click empty space** to drop a
  new simple pole there (order 1, coefficient 1), and pan / wheel-zoom the
  view. Pole placement/move is inverse-view only.
* **Singular extras** — `q` (origin residue) and `c` (conformal radius)
  appear as 1-D sliders for the singular / unbounded families.
* **Estimate max c** (unbounded families) — a button beside the `c` slider
  that automatically finds the critical conformal radius `c*`: the largest `c`
  for which a valid unbounded QD still exists (univalent boundary + quadrature
  identity). It brackets and bisects with a two-regime gate — the genuine-QD
  identity away from the cusp, and the geometric cusp criterion (a φ′ zero
  reaching `|z| = 1`) near it, where the thinning complement makes the identity
  hard to verify — then caps the slider at `c*` and jumps to ≈ 0.99·`c*`. The
  result note reports whether `c*` is a **cusp** (beyond it the boundary
  self-overlaps) or a **fold** (the QD simply ceases to exist), plus a
  **confidence** percentage for the estimate.
* **Geometry & accuracy** — after a solve, a panel card reports the domain's
  **area, perimeter, and maximum boundary curvature** (which blows up at a cusp),
  plus an **accuracy meter** (estimated significant digits of the solution, with
  an under-resolution warning) and a **near-cusp** note: when a φ′ zero approaches
  `|z| = 1` the quadrature-identity check becomes unreliable (the complement
  thins), so validity is governed by the geometric criterion instead — the card
  says so and shows the distance to the cusp. Near `c*` the solver also resolves
  the identity to tolerance automatically (adaptive node escalation) and sharpens
  Newton's Jacobian (central differences) when the problem turns ill-conditioned,
  so genuine near-cusp domains are no longer mis-rejected. An optional **curvature
  heat-strip** toggle colors ∂Ω by |κ| (cool → hot) so the sharpest bends — and
  forming cusps — stand out.
  These come from `app/observables.js` (`QD.boundaryObservables`,
  `QD.harmonicMeasure`, `QD.estimateAccuracy`), computed from the solved map φ.
* **Thesis examples + analytic oracles** — a **Thesis example** gallery loads
  curated canonical quadrature domains (unit disk, symmetric multi-pole D₂/D₃/D₄
  domains, the cusp-limited cardioid, the deltoid, a single exterior pole). Each
  carries an *analytic oracle* — the closed-form quantities a correct solve must
  reproduce (area, symmetry group, cusp count/type, `c*` + mechanism, achievable
  significant digits) — and an **Analytic oracle** card shows computed vs expected
  with ✓ / ⚠ / ✗ (the heavy `c*` check verifies on demand). From
  `app/thesis-examples.js` (`QD.ThesisExamples`, `QD.checkOracle`).
* **Annotated phenomena** — an optional overlay labels the features the
  critical-set / cusp overlays don't: the **harmonic-measure hot spot** (the tip,
  where `ρ = 1/(2π|φ′|)` peaks), the **maximum-curvature point** on ∂Ω, and the
  domain's **symmetry axes** (dashed) with its `D_n` / `Z_n` group. Symmetry comes
  from `app/symmetry.js` (`QD.detectSymmetry`), which reads the domain's symmetry
  straight off φ via the conformal-map intertwining.
* **Faber polynomials** *(classical unbounded QD only)* — a **Faber polynomials**
  card computes the Faber polynomials `F_n(ζ)` of the bounded complement `K = ℂ∖Ω`
  straight from φ's Laurent expansion at ∞ (φ is the exterior map of K). It shows
  the polynomials (formula + expandable coefficient table) with capacity `cap(K)=c`,
  degree and leading coefficient, and per-order root-finder **convergence flags**, and
  optionally **plots their roots** on the domain canvas — the union of all roots up to
  order N (teal circles) or the roots of a single `F_n` (violet diamonds). Roots cluster
  inside K, the "hole" of the unbounded domain. From `app/faber-analysis.js`
  (`QD.FaberAnalysis`: `faberPolynomials`, `polynomialRoots` (Durand–Kerner)).
* **Quadrature ↔ map equations** *(classical bounded QD only)* — a **Quadrature ↔ map
  equations** card generates the explicit *algebraic* system relating the quadrature data
  `{a_j, C_{j,s}, w_0}` to the Riemann-map coefficients `{z_j, A_{j,k}}` — a locator block
  `φ(z_j)=a_j`, a principal-part block giving each `C_{j,s}` from the `A_{j,k}`, and a gauge
  normalization. Choose the **conjugate model over ℚ(i)** or the **real/imaginary split**; the
  system is rendered with KaTeX, **self-verified** against the numeric solution (every equation
  ≈0), and exportable as LaTeX or a CAS-agnostic JSON term list. A default-on **"Fix φ(0) = w₀"**
  checkbox bakes the solve's selected Riemann-map center (centroid of the poles by default) into
  the equations as an *exact rational*, dropping w₀/w̄₀ from the variables. Exact arithmetic
  throughout (`app/sym-core.js` `QD.Sym`; `app/qd-equations.js` `QD.QDEquations`); the
  "Open in Algebra workspace ↗" button feeds the in-browser elimination/Gröbner reducer below.
* **Algebra tab** *(classical bounded QD only)* — an interactive **equation-derivation
  workspace**. The generated (●)/(★)/gauge system appears as KaTeX nodes in a graph;
  add **univalence constraints** (convex, star-like, spiral-like, `φ′≠0`, global boundary
  injectivity, geometric border loci), then select two equation nodes + a shared variable
  and **eliminate** it by an exact Sylvester **resultant** — a derived equation appears one
  column over, with edges. For several equations / several shared variables at once, take a
  **Gröbner basis** (pure-JS Buchberger over ℚ(i) with the Gebauer–Möller criteria +
  sugar selection; pick the monomial order, or give an *eliminate* list for a fast block
  elimination order) — each basis generator becomes a derived node. **Dimension / count**
  reports whether the system has finitely many solutions and how many; **Solve (numeric)**
  runs the shape-lemma path (FGLM to lex → Durand–Kerner → back-substitution), falling back
  to Möller–Stetter **eigenvalue solving** when the lex basis is not in shape position (so it
  handles any radical zero-dimensional system). The
  Gröbner and Solve actions run **off the main thread** in a Web Worker with live
  progress and a **Cancel** button (a main-thread fallback covers `file://`). Variables
  to eliminate are chosen from a **dropdown checklist**; you can **assume chosen
  variables are real** (z̄ⱼ ≡ zⱼ) to regenerate a simplified system — often the
  difference between an intractable and a feasible Gröbner basis. Op failures show in a
  **persistent, dismissible error panel** with actionable guidance. Cards are
  **collapsible** (collapsed by default — a one-line
  preview; expand for the full form), **reorderable** within a column (▲/▼), copy as
  **LaTeX** individually (⧉), and carry **hovertext** (variable count, real-equation
  contribution, per-variable order, total degree, provenance); conjugate equations are
  paired adjacently. Re-seeding (toggle **fix φ(0)** / **assume real**) is undoable. Undo/redo,
  a cost preview, and JSON/LaTeX export. From `app/qd-constraints.js` (`QD.QDConstraints`) +
  `app/algebra/`; an external-CAS / RCTD bridge is the remaining future step.
* **φ(0)** — the Riemann-map center w₀ = φ(0) defaults to the centroid of the poles
  (manually overridable in bounded mode), and now also drives the **symbolic** equation
  system and the Algebra-tab seeding (exact-rational substitution).
* **Solver settings** — boundary samples, aggressiveness preset (Quick /
  Standard / Thorough), auto-fit toggle, vector-field overlay (`h̄(w)`
  Pólya field, or `w − h̄(w)` external field).
* **Search options (advanced)** — per-phase toggles, restart budgets,
  Newton / continuation tolerances, deflation strength, identity-tol,
  RNG seed.
* **Status, Riemann map, Alternates** cards.
* **🔗 Copy link** (top of the sidebar) — copies a shareable URL that encodes
  the current configuration (mode, `h(w)`, gauges, active tab); paste it to
  restore the exact state. The whole app is also responsive (the sidebar stacks
  above the plot on narrow viewports).

**Schwarz dynamics tab.**
* **Source-of-φ card** — mirrors the Inverse tab's last solved φ. Click
  **Use this φ** to snapshot it into the Schwarz tab.
* **Render controls** — resolution (192–768), max iterations (1–200),
  colormap (magma / inferno / plasma / viridis / cividis / turbo /
  grayscale / rainbow / ice & fire / two-tone / cyclic), escape-time
  scale (smooth / discrete / log / sqrt / modulo with K), renderer mode
  (auto / GPU / CPU), Recompute and Fit-to-Ω buttons.
* **Two renderer paths**:
  * **GPU** (default, WebGL 2 fragment shader). The σ-iteration runs
    entirely on the GPU; full 1024×1024 frames at maxIter=128 render
    in ~150 ms, so pan/zoom is interactive. Caps: MAX_BRANCHES=12,
    MAX_K=8, MAX_LAURENT=12 (covers every shipped preset with
    headroom). Float32 precision — fine for iteration depths ≤ ~200
    at moderate zoom; for extreme zooms, switch to CPU mode or accept
    minor banding.
  * **CPU** (fallback). Progressive 4×4 → 2×2 → 1×1 pyramid chunked
    across `requestAnimationFrame` ticks. Always available; used
    automatically when WebGL 2 is unavailable, when φ exceeds the
    GPU caps, or when explicitly selected.
* **Canvas** — pan (drag) and zoom (wheel) re-render the GPU frame
  every mousemove (~30 ms) so panning is interactive. **Double-click**
  a point in Ω to plot its orbit {w₀, σ(w₀), σ²(w₀), …}; single click
  is reserved for the start of a drag. Hover for pixel coords + escape
  time (escape time available in CPU mode only). ∂Ω is overlaid in blue.
* **Coloring** — for points whose orbit lands in Ω^c (the "fundamental
  tile"), the escape time `n` is mapped through the selected colormap.
  For unbounded Ω, points whose orbit diverges to ∞ are the "escaping
  set" (gray); points that stay in Ω forever are the tiling-set
  interior (black).
* **Family coverage**: all ten inverse families. The six classical/LQD
  families (classical bounded/unbounded QD; bounded/unbounded LQD, each
  ± singular) have both CPU and GPU adapters. The four power-weighted PQD
  families (bounded/unbounded, each ± singular) are **CPU-only** — the GPU
  shader refuses them and the renderer falls back to the CPU path
  (non-integer αth-root powers aren't in the shader). The unbounded LQD
  adapters carry `phi.lqdBeta` (polynomial-h β-correction, HANDOFF #22) and
  `phi.lqdGamma` (higher-order pole at origin synth branch, HANDOFF #24)
  through to both the CPU adapter and the GPU shader, so all the
  HANDOFF #21–#24 shipped solver features render correctly in dynamics
  too. Bounded-rational direct φ is supported via the
  `QD.Schwarz.buildSchwarzFromRational` entry point (no Direct-tab
  "Send to Schwarz" wiring yet).
* **View mode toggle** (HANDOFF #29; z-disk #59/#60) — segmented control at the
  top of the sidebar switches between three views of the same σ-iteration:
  * **plane** (default): the 2-D w-plane fractal described above.
  * **z-disk**: the same tiling uniformized onto the unit disk 𝔻 (or its
    exterior 𝔻* for unbounded Ω) — each pixel takes `z`, lifts `w = φ(z)`, and
    runs the same escape-time. Renders on the GPU for the six classical/LQD
    families (a `u_viewMode` branch in the shared fragment shader) and on the CPU
    otherwise, with full pan / zoom / click-pin / hover parity.
  * **sphere**: same iteration textured onto a Riemann sphere via
    stereographic projection (north-pole convention; ∞ → north pole).
    Three-pass WebGL 2 renderer with orbit camera (drag rotates, wheel
    zooms, double-click resets). Hover tooltip shows `(x,y,z)` on the
    sphere and the corresponding `w ∈ ℂ`. Math kernel
    `app/sphere/sphere-common.js` is Float64 throughout (round-trip
    test passes at < 1e-12). The sphere view is particularly useful
    for unbounded Ω, where iterates wander to infinity and the
    spherical wrapping bounds the picture.
  * The captured φ + boundary polygon is shared across all three views,
    so toggling never requires re-capturing; render parameters
    (maxIter / colormap / scale / modK) also carry over.

**Parameter slice tab.**
* **Base scenario** — pulls the current h(w) / mode / c / q / w₀ from the
  QD tab. Re-open the slice tab after editing to refresh.
* **Axes** — pick X (and optionally Y) from any sweepable parameter of
  the base scenario: residue Re/Im, pole position Re/Im, polynomial
  coefficient Re/Im (where the mode allows), conformal radius `c`,
  origin residue `q` (singular families), or manual `w₀` (bounded
  families). Range fields default to (current ± 1).
* **Render** — spawns a pool of Web Workers
  (`navigator.hardwareConcurrency` of them) and dispatches one row of
  pixels per tile. Each worker warm-starts the next pixel from the
  previous pixel's φ when convergent, so adjacent pixels converge in
  1–5 Newton iterations after the first cold solve.
* **Categorical classification** — every pixel falls into one of:
  *Valid QD* (green; brightness ∝ 1/iterations), *Identity fails*
  (yellow), *Boundary self-intersects* (orange), *Newton diverged*
  (red), *No algebraic root* (gray), *Capability refused* (slate, e.g.
  polynomial-h LQDs which are deferred). The legend lives in the
  sidebar.
* **Click any pixel** → re-solves at that parameter value and pushes
  the resulting φ into the QD tab, then switches tabs so the
  boundary plot appears in the main canvas. The fastest way to navigate
  parameter space.

*Direct mode* (φ → h — toggle from the inverse view via the segmented
control at the top of the sidebar):

* **Domain type** — Bounded / Unbounded / Numerical.
* **Riemann map φ(z)** — paste a math.js expression (debounced
  real-time parsing) and/or edit the structured coefficient fields.
  Bounded mode auto-detects polynomial vs rational `P(z)/Q(z)` and shows
  one or two coefficient panels accordingly.
* **Output card** — h displayed in both text and KaTeX. Three buttons:
  *Send to inverse* (pre-fill the inverse-view fields, switch the
  toggle back to inverse, and auto-solve — one-click round-trip),
  *Verify* (Fourier diagnostic on the boundary identity).

**Shared plot canvas (right).**
* Adaptive boundary samples.
* Filled Ω (blue for valid; red-tinted if non-univalent or
  identity-failing).
* Quadrature nodes a_j shown as red dots with labels.
* φ(0) shown as a small blue cross.
* Optional dashed-gold overlay boundary (used by Direct-tab diagnostics).
* Pan with drag; wheel to zoom; Fit / Reset buttons.
* Live mouse-coordinate readout in the corner.

## Public API surface

All entry points are on `window.QD` (and `module.exports` for Node):

### Shared infrastructure

| Function                          | Use |
| ---                               | --- |
| `Complex`, `Taylor`               | Complex / Taylor arithmetic primitives |
| `Complex.format(c, opts)`         | Unified complex-to-string formatter |
| `evalPhi(z, phi)` / `phiTaylorAt` | Family-dispatch wrappers |
| `residual` / `residualNorm`       | Family-dispatch wrappers |
| `packPhi` / `unpackPhi`           | Pack/unpack to/from a flat real vector |
| `newtonSolve(phi₀, hData, opts)`  | Damped Newton with pluggable Jacobian and deflation |
| `solveInverseQD(hData, opts)`     | Top-level inverse solver: all stages + alternates |
| `searchAlternates(...)`           | Chunked background search for more valid solutions |
| `isBoundaryUnivalent(phi)`        | Boundary self-intersection check |
| `sampleBoundary` / `sampleBoundaryAdaptive` | Boundary samplers |
| `binomialCoeff(n, k)`             | Integer binomial helper |
| `selectFamily` / `registerFamily` | Family registry |
| `packPhiBySchema` / `unpackPhiBySchema` / `applySchemaClamps` | Schema-driven pack/unpack runtime |

### Inverse-Faber primitives (`QD.Faber`)

| Function                            | Use |
| ---                                 | --- |
| `inverseFaberAtPole(residues, phiTilde)` | Per-pole inverse Faber transform (Möbius-style A_{j,k}) |
| `inverseFaberAtInfinity(polyPart, f, c)` | Inverse Faber at ∞ for h's polynomial part |

### Direct problem (`QD.Direct`)

| Function                              | Use |
| ---                                   | --- |
| `boundedQD(coeffs)`                   | h from polynomial φ |
| `boundedQDRational(P, Q)`             | h from rational φ = P/Q (validates Q ≠ 0 on 𝔻̄) |
| `unboundedQD(c, F)`                   | h from Laurent-at-∞ φ |
| `numericalBoundedQD(phiFn, opts)`     | h from arbitrary analytic φ (DFT + polynomial truncation) |
| `polynomialRoots(coeffs)`             | Durand–Kerner complex polynomial root finder |
| `parseRationalInZ(expr, math)`        | math.js AST walker; returns polynomial array or `{num, den}` |
| `parsePolynomialInZ(expr, math)`      | Thin wrapper that rejects rational results |
| `polynomialToString(coeffs)`          | Canonical-form printer |
| `evalH(hData, w)`                     | Evaluate h at a complex point |
| `verifyBoundaryIdentity(hData, pts)`  | Fourier negative-frequency-mass diagnostic |
| `sampleBoundaryPolynomial(coeffs, N)` | ∂Ω samples for polynomial φ |
| `sampleBoundaryLaurent(c, F, N)`      | ∂Ω samples for Laurent φ |

### Custom h(w) text input (Inverse tab)

| Function                              | Use |
| ---                                   | --- |
| `QD.parseH(expr, math, {mode})`       | Parse `h(w)` text → `{poles, polyCoeffs}` (strict PFD walker, falls back to general-rational decomposition via Durand–Kerner) |
| `QD.formatH({poles, polyCoeffs})`     | Inverse direction: structured h → canonical math.js source |

### Schwarz dynamics (`QD.Schwarz`)

| Function                                                 | Use |
| ---                                                      | --- |
| `buildSchwarzFromPhi(phi, hData, boundaryPts)`           | Build `{ sigma, psi, evalPhi, evalF, isInOmega, escapeR, … }` from an inverse-solver φ (bounded polynomial or unbounded Laurent) |
| `buildSchwarzFromRational(phi, boundaryPts)`             | Same builder for a bounded rational φ = P/Q (P, Q on the `phi` object) — used when piping in from the Direct tab |
| `escapeTime(w₀, schwarz, {maxIter, escapeR})`            | Iterate σ from w₀ until it lands in Ω^c, diverges, or hits maxIter; returns `{kind, n, lastW}` |
| `makeOrbit(w₀, schwarz, {maxIter})`                      | Return the orbit polyline for click-to-orbit overlay |
| `pointInPolygon(pt, polyPts)`                            | Even-odd point-in-polygon (boundary-curve in-Ω test) |
| `createGPURenderer(canvas)`                              | WebGL 2 fragment-shader renderer; returns `{ setPhi, setColormap, render, destroy }` or `null` if WebGL 2 unavailable / shader compile fails |

### Critical-set kernel (`QD.findCriticalPoints`)

| Function                                  | Use |
| ---                                       | --- |
| `findCriticalPoints(phi, opts)`           | Locate zeros of φ'(z) via complex Newton from a polar seed grid; returns `[{z, w, severity}]` with severity ∈ {`critical`, `near`, `safe`} based on `\|z\|` relative to the boundary unit circle. Powers the inverse-tab critical-set overlay. |

### Riemann-sphere kernel (`QD.Sphere`)

| Function                                  | Use |
| ---                                       | --- |
| `projectToSphere(w)`                      | Stereographic projection `ℂ → S²` (north-pole convention). |
| `unprojectFromSphere(pt)`                 | Inverse projection; returns `null` at / near the north pole. |
| `buildSphereMesh(divisions)`              | UV-sphere mesh for the WebGL renderer (Float32 vertices + Uint16 indices). |
| `mat4lookAt`, `mat4perspective`, `mat4invertRigid` | Float64 mat4 helpers used by the orbit camera. |

## Conventions

Matching the thesis:

* Contour integrals suppress the `1/(2πi)` factor: in this codebase
  `∮_∂Ω F dw` means `(1/(2πi)) · (literal contour integral)`. The
  unit-disk QD identity reads `∫_D f dA = ∮_∂D f · 1/w · dw` (so
  h = 1/w for the unit disk), not the textbook `2/w`.
* `dA = dx dy / π` is the normalized area measure, so the area of the
  unit disk is 1 (not π).

## Recently shipped

Highlights from the recent ship cadence — full retrospectives in `HANDOFF.md`:

* **Faber polynomials (UQD).** A **Faber polynomials** card computes the Faber
  polynomials `Fₙ(ζ)` of the bounded complement `K = ℂ∖Ω` of a classical unbounded
  QD from φ's Laurent expansion at ∞, shows them (formula + coefficient table) with
  capacity / leading-coeff / convergence flags, and optionally plots their roots on
  the domain canvas (roots cluster inside `K`). "Estimate max c" now jumps the slider
  to *exactly* c\*. (`app/faber-analysis.js`, `app/ui-faber.js`.)
* **Usability / clarity overhaul.** The on-plot status panel no longer obscures the
  domain (shrunk + dockable, persisted), overlay toggles unified into an **Overlays /
  Layers** card with color keys, an example-led first run + dismissible coachmark, a
  plain-language "what you're solving" summary, an intro popover, per-tab subtitles,
  and live solve-phase feedback.
* **Thesis-example pack + analytic oracles.** A **Thesis example** gallery loads
  curated canonical domains, each with a closed-form *analytic oracle*; an **Analytic
  oracle** card shows computed-vs-expected with ✓ / ⚠ / ✗. (`app/thesis-examples.js`.)
* **Annotated-phenomena overlay.** Labels the harmonic-measure hot spot (tip),
  maximum-curvature point, and symmetry axes / group, with an exact symmetry detector
  read off φ via the conformal-map intertwining (`app/symmetry.js`).
* **Solver accuracy near cusps.** Adaptive quadrature-identity sample escalation,
  Newton conditioning (central-difference Jacobian when ill-conditioned), a c\*
  confidence estimate, and honest near-cusp accuracy reporting.
* **Boundary observables.** Curvature heat-strip, area / perimeter / centroid /
  moments, harmonic-measure density, and an accuracy estimate, surfaced in a
  **Geometry & accuracy** card (`app/observables.js`).

Earlier LQD/PQD ship cadence (polynomial-h for unbounded LQDs, the singular-LQD
q-formula, Schwarz-tab polyPart/γ support, etc.) is retrospected in `HANDOFF.md`.

## Known limitations / future directions

* **Algebraic Quadrature Domains** (`α = R'` for rational R; thesis
  Chapter VI) are deferred. Stage-0 through Stage-2 scaffolding lives
  in `app/disabled/aqd/` with a re-enable checklist.
* **Unbounded rational direct mode** isn't implemented: `unboundedQD`
  computes h's polynomial-at-∞ part for any Laurent-at-∞ φ but only
  handles the finite-pole part for the trivial `c·z + F_0` case
  (exterior of a disk).
* **Polynomial-h for BOUNDED LQDs** is not yet shipped (the
  HANDOFF #21–#22 work covered unbounded LQDs only). The bounded-LQD
  parametrization needs its own analog of the β-correction with
  derivation specific to the bounded boundary kernel.
* **Numerical-mode caveat**: the Direct tab's numerical mode degrades
  arbitrary analytic-in-𝔻̄ φ to its polynomial truncation; non-analytic
  φ (e.g. `conj(z)`) is flagged but not solvable.
* **Jacobian**: built by forward differences; `newtonSolve` exposes a
  `jacobianFn` hook for plug-in analytic Jacobians. The system is
  structured enough that this would noticeably help higher-degree cases.
* **Spurious roots** are not infrequent for asymmetric h. The deflation
  stage helps but smarter alternate seeding (e.g. from analytic
  Hele-Shaw considerations) would further reduce the dependence on
  multistart luck.
* **Direct-pole drag** on the main canvas (rather than via the 2-D
  slider pads) is a planned UX follow-up.
* **Identity-verifier edge case**: for UQDLS with polyPart-only h and
  NO finite poles, the converged Ω can have very large bounded
  complement K such that boundary samples extend far enough to cause
  numerical conditioning issues in the identity check. Solver
  residuals at convergence remain machine-precision; only the
  identity verifier is affected. Documented in HANDOFF.md §10.

## References

[1] A. Graven, *Weighted Quadrature Domains and the Faber Transform*,
    Ph.D. thesis, California Institute of Technology, 2026.

[2] A. Graven and N. G. Makarov, *Quadrature Domains and the Faber
    Transform*, arXiv:2509.03777, 2025.

## License & attribution

Released under the **MIT License** — free to use, copy, modify, and redistribute,
including for commercial purposes, provided the copyright and license notice are
retained. See [`LICENSE`](LICENSE).

If you use this tool in published work, a citation of the thesis (reference [1]
above) is appreciated.

Third-party libraries (loaded from a CDN, not bundled): [KaTeX](https://katex.org)
(MIT) and [math.js](https://mathjs.org) (Apache-2.0).
