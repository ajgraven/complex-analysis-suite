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

Open `app/index.html` in any modern browser. No build step required.
Everything is vanilla HTML / JS, with [math.js](https://mathjs.org) loaded
from a CDN for user-facing complex arithmetic (parsing pasted expressions)
and [KaTeX](https://katex.org) loaded for math display.

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
    │
    ├── ui.js                          QD/LQD-tab UI hub: DOM wiring, shared helpers,
    │                                  uiCtx injection + the module installs below
    ├── ui-modes.js                    MODE descriptors + aggressiveness presets
    ├── ui-pole-grid.js                pole / poly-coef control renderers
    ├── ui-h-text.js                   h(w) text ⇄ structured-grid mirror
    ├── ui-solve.js                    solve → render → analyze pipeline
    │                                  (+ alternates + background search)
    ├── ui-url-state.js                URL/hash serialize + restore (B1)
    │                                  (all five: QD_UI.installX(uiCtx) factories,
    │                                   Phase-3 item E split of ui.js)
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
* **φ(0)** — defaults to the centroid of the poles (manually overridable
  in bounded mode).
* **Solver settings** — boundary samples, aggressiveness preset (Quick /
  Standard / Thorough), auto-fit toggle, vector-field overlay (`h̄(w)`
  Pólya field, or `w − h̄(w)` external field).
* **Search options (advanced)** — per-phase toggles, restart budgets,
  Newton / continuation tolerances, deflation strength, identity-tol,
  RNG seed.
* **Status, Riemann map, Alternates** cards.

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
* **View mode toggle** (HANDOFF #29) — segmented control at the top of
  the sidebar switches between two views of the same σ-iteration:
  * **plane** (default): the 2-D w-plane fractal described above.
  * **sphere**: same iteration textured onto a Riemann sphere via
    stereographic projection (north-pole convention; ∞ → north pole).
    Three-pass WebGL 2 renderer with orbit camera (drag rotates, wheel
    zooms, double-click resets). Hover tooltip shows `(x,y,z)` on the
    sphere and the corresponding `w ∈ ℂ`. Math kernel
    `app/sphere/sphere-common.js` is Float64 throughout (round-trip
    test passes at < 1e-12). The sphere view is particularly useful
    for unbounded Ω, where iterates wander to infinity and the
    spherical wrapping bounds the picture.
  * The captured φ + boundary polygon is shared across both views,
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

## Recently shipped (HANDOFF #21–#27)

Highlights from the recent ship cadence — full retrospectives in `HANDOFF.md`:

* **#21 — Polynomial-h for unbounded non-singular LQDs.** The (★)_F
  equations match `phi.lqdBeta` to h's polynomial-at-∞ part via
  `phiLaurentAtInfinity_UQDL` + `inverseFaberAtInfinity`.
* **#22 — Polynomial-h for unbounded SINGULAR LQDs.** Andrew Graven
  derived the full q-formula via the logarithmic generalized Schwarz
  function S₀(w); the (●₀) q-equation gains a closed-form β-correction.
* **#23 — UQDLS with no finite poles + polyPart.** Rejection check
  widened so `h = q/w + polyPart` (no finite poles) is now accepted.
* **#24 — Higher-order pole at the origin for UQDLS.** New
  `phi.lqdGamma` Newton-vector slot encoding a synthetic Möbius branch
  at z = z₀; (★)_Γ block pins γ to the user's principal at w = 0
  directly via `inverseFaberAtPole`.
* **#25 — polyPart contribution to the LQD-singular identity verifier.**
  Closed-form `Res_∞(f · h_polyPart)` term added; previously the
  verifier silently skipped this and `runFamilyBattery` only checked
  residual.
* **#26 — Schwarz dynamics tab supports polyPart + γ.** `clonePhi`
  carries `lqdBeta` and `lqdGamma` through; CPU adapters add B(1/z)
  to evalPhi/evalF/derivPhi and merge γ into branches via a
  synthetic-branch helper; GPU shader gains `u_lqdBeta` uniforms and
  the same γ-merge at upload.
* **#27 — Code review + README refresh (this entry).** Centralized
  duplicated `evalB_OverZ` / `bOverZTaylorAt` into `QD.LqdCommon`,
  extracted named constants (`ZERO_THRESHOLD`, `DISK_CLAMP_OUT`,
  `Z0_MAX_RADIUS`, `DEFAULT_FD_EPS`), memoized
  `_phiWithSyntheticBranch` to amortize cost across Newton residual
  evaluations, removed dead `checkLqdPolynomialGap` gate.

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
