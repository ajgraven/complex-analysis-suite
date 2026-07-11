# Architecture

High-level map of how the Quadrature Domain Solver app fits together.
For mathematical content, see [THEORY_MAP.md](THEORY_MAP.md). For how
to extend the app, see [CONTRIBUTING.md](CONTRIBUTING.md).

> **✅ ESM migration COMPLETE (suite Phase 2).** This app is now **ES-module-only** and Vite-built:
> `app/index.html` loads `main.mjs` (a native module + native-module-worker graph), and `vite build`
> emits a static `dist/`. The classic frozen-`.js` copies and the no-build, `window.QD`-only load
> model described **below are HISTORICAL** — the subsystem *map* is still an accurate conceptual guide,
> but the *mechanism* details (vanilla `.js`, "no build step", a global `window.QD` as the only entry)
> are superseded by the `.mjs` graph. Current build + what changed: [ESM-MIGRATION.md](ESM-MIGRATION.md)
> and the suite root `CLAUDE.md` status. (Review XCUT-hygiene-01)

## At a glance

- **ES modules, Vite-built** — `app/index.html` loads `main.mjs`; `vite build` (root `app/`)
  emits a static `dist/`. In dev, `vite` serves `app/` with HMR. _(Historically vanilla HTML+JS
  with no build step — see the banner above; the detailed classic map below is likewise historical.)_
- **Single namespace** — `window.QD` holds every public function, type,
  and subsystem. ES-module consumers can use the [`app/qd.mjs`](app/qd.mjs)
  façade instead.
- **Lazy-mount tabs** — Schwarz, Sphere, and Param-slice UIs mount
  their controls only when their tab is first activated, keeping
  startup cheap.
- **Web Workers for heavy compute** — the Inverse-tab primary solve
  runs on a single warm worker (P0.2); the Parameter-slice tab spawns
  a pool of workers (one per `navigator.hardwareConcurrency` core).
  Both bundles are built at runtime by `fetch`-ing the solver source
  files and stitching them with a `Blob` URL — no build step needed.
- **GPU rendering for Schwarz / Sphere** — WebGL 2 fragment shaders;
  Float32 throughout. CPU fallback ships in every adapter.

## Script load order

```mermaid
flowchart LR
  subgraph CDN
    A1[math.js 12.4.1]
    A2[KaTeX 0.16.47]
  end
  subgraph Math["Math primitives"]
    B1[complex.js]
    B2[taylor.js]
  end
  subgraph Solver["Solver core (registers families on QD)"]
    C1[solver.js]
    C2[solver-faber.js]
    C3[solver-qd.js]
    C4[solver-uqd.js]
    C5[solver-lqd-common.js]
    C6[solver-lqd.js]
    C7[solver-lqd-singular.js]
    C8[solver-uqd-lqd.js]
    C9[solver-uqd-lqd-singular.js]
  end
  subgraph Utility
    D1[parse-h.js]
    D2[critical-set.js]
    D2a[univalence.js]
    D2b[cusps.js]
    D2c[solver-cmax.js]
    D3[primary-solution.js]
    D4[primary-solver-worker.js]
  end
  subgraph Tabs["Tab subsystems"]
    E1[direct/direct-common.js]
    E2[schwarz/schwarz-common.js]
    E3[schwarz/schwarz-webgl.js]
    E4[param-slice/param-slice-common.js]
    E5[param-slice/param-slice-pool.js]
  end
  subgraph UI["UI layer"]
    F1[qol.js]
    F2[ui-presets.js]
    F2b[ui-state.js]
    F3[ui-domain-plot.js]
    F2c["ui-modes / ui-pole-grid / ui-h-text / ui-solve / ui-url-state"]
    F4[ui.js]
    F5a["direct/direct-recompute / direct-verify"]
    F5[direct/direct-ui.js]
    F6a["schwarz/schwarz-paint / schwarz-render / schwarz-features / schwarz-interaction"]
    F6[schwarz/schwarz-ui.js]
    F7a[param-slice/param-slice-render.js]
    F7[param-slice/param-slice-ui.js]
  end
  subgraph Sphere["Sphere (lazy adapter)"]
    G1[sphere/sphere-common.js]
    G2[sphere/sphere-webgl.js]
    G3[sphere/sphere-ui.js]
  end

  CDN --> Math --> Solver --> Utility --> Tabs --> UI --> Sphere
```

Within each layer, files are loaded in the order shown above. The
load order matters: every solver-family file calls
`QD.registerFamily('X')` at top level, so `solver.js` must run first.

The diagram is illustrative, not exhaustive — `app/asset-manifest.js` is the
authoritative load order. The Utility layer also loads several page-only analysis
modules not drawn above: `observables.js`, `symmetry.js`, `thesis-examples.js`,
`faber-analysis.js`, and **`ui-strings.js`** (loaded *first* in
`SOLVER_PAGE_ONLY_FILES`, since `thesis-examples.js` reads `QD.Strings.blurbs` at
load). `ui-strings.js` defines `QD.Strings` (the editable-prose source of truth) and
its `apply()` is invoked by a one-line inline `<script>` in `index.html` after the
page-script loader to fill `[data-str*]` elements before paint.

## Public `QD.*` surface

| Group | Exports |
| --- | --- |
| Math primitives | `Complex`, `Taylor` |
| Solver core | `evalPhi`, `phiTaylorAt`, `residual`, `residualNorm`, `packPhi`, `unpackPhi`, `newtonSolve`, `solveInverseQD`, `searchAlternates`, `isBoundaryUnivalent`, `sampleBoundary`, `sampleBoundaryAdaptive`, `binomialCoeff`, `selectFamily`, `registerFamily`, `packPhiBySchema`, `unpackPhiBySchema`, `applySchemaClamps` |
| Linear algebra (P1.2) | `solveLinearSystem`, `solveLeastSquares`, `houseQR`, `numericalJacobian` |
| Inverse Faber | `QD.Faber.inverseFaberAtPole`, `QD.Faber.inverseFaberAtInfinity` |
| Faber polynomials (forward) | `QD.FaberAnalysis.{faberPolynomials, faberPolynomial, polynomialRoots, formatFaberPoly, faberConvergence}` — Faber polynomials of the complement of a classical UQD + a Durand–Kerner complex root-finder (`faber-analysis.js`) |
| Direct problem | `QD.Direct.*` (see [`app/direct/README.md`](app/direct/README.md)) |
| Schwarz dynamics | `QD.Schwarz.*` (see [`app/schwarz/README.md`](app/schwarz/README.md)) |
| Riemann sphere | `QD.Sphere.*` (see [`app/sphere/README.md`](app/sphere/README.md)) |
| Critical set | `QD.findCriticalPoints`, `QD.CriticalSet.*` |
| Geometric properties | `QD.classifyUnivalence`, `QD.Univalence.classifyUnivalence` |
| Boundary cusps | `QD.classifyCusps`, `QD.Cusps.classifyCusps` |
| Max conformal radius | `QD.estimateMaxConformalRadius` (unbounded c\*; bracket+bisection with a two-regime gate — genuine-QD identity away from the cusp, cusp criterion `max\|z\|` over φ′ zeros near it; returns `mechanism` cusp/fold — `solver-cmax.js`) |
| Custom h(w) text | `QD.parseH`, `QD.formatH` |
| Editable UI prose | `QD.Strings.{help, familyHints, hints, tooltips, notes, faber, oracle, blurbs, guidance, get, apply}` — single source of truth for descriptions/helptext/tooltips/blurbs; `apply()` injects static HTML into `[data-str]`/`[data-str-html]`/`[data-str-title]` elements (`ui-strings.js`; see `HELPTEXT.md`) |
| Cross-tab envelope (P0.1a) | `QD.PrimarySolution.{get, hasSolution, subscribe, publish, update, clear}` |
| Warm worker (P0.2) | `QD.PrimarySolverWorker.{ensureReady, solve, cancel, isBusy, searchAlternates, cancelAux, isAuxBusy}` |
| Family registry | `QD.Family.boundedQD`, `QD.Family.unboundedQD`, `QD.Family.boundedLQD`, `QD.Family.boundedLQD_singular`, `QD.Family.unboundedLQD`, `QD.Family.unboundedLQD_singular` |

## Tab → DOM ownership

| Tab | Container | UI script | Public adapter |
| --- | --- | --- | --- |
| QD (Inverse + Direct) | `#controls-qd` + shared `#canvas` | `ui.js`, `direct/direct-ui.js` | publishes `QD.PrimarySolution` |
| Schwarz dynamics | `#controls-schwarz` + own GL canvas overlay | `schwarz/schwarz-ui.js` | subscribes `QD.PrimarySolution`; toggles to Sphere |
| Sphere view | mounted inside Schwarz panel | `sphere/sphere-ui.js` (`QD.SphereView.mount`) | shares Schwarz's `phiSnapshot` |
| Parameter slice | `#controls-param-slice` | `param-slice/param-slice-ui.js` | reads `window.QD_UI.snapshotScenario`; pushes back via `loadScenarioIntoQdTab` |

## Key cross-cutting contracts (P0/P1 work)

### `QD.PrimarySolution` envelope (P0.1a)

Cross-tab pub/sub for the current inverse-solver result. Schwarz /
Sphere / Param-slice subscribe to this envelope rather than reaching
into `ui.js`'s internal `state.current`.

```js
QD.PrimarySolution.subscribe(handler);   // tabs subscribe
QD.PrimarySolution.publish(envelope);    // ui.js writes after each solve
const env = QD.PrimarySolution.get();    // snapshot read
```

Source: [`app/primary-solution.js`](app/primary-solution.js). Envelope
shape is the same `{ success, primary, alternates, hData, w0Used,
cUsed, unbounded, attempts, criticalSet }` previously held on
`state.current`. The JSDoc `@typedef PrimaryEnvelope` at the top of
that file is the source of truth.

### `QD.PrimarySolverWorker` (P0.2)

Single warm Web Worker for the Inverse-tab solve. Keeps the multistart
pipeline (50–500 ms for hard h's) off the main thread. Source:
[`app/primary-solver-worker.js`](app/primary-solver-worker.js).

```js
const result = await QD.PrimarySolverWorker.solve(hData, opts);
```

Preemption: if a new `solve()` arrives while one is in flight, the
worker is **terminated and recreated**. This is the cheapest way to
interrupt deeply-nested Newton iteration; the resulting solve rejects
with `{ aborted: true, superseded: true }`. Token-gating in `ui.js`
(`_solveAndRenderToken`) discards stale results that arrive after a
newer call. `ui.js` also surfaces a **Cancel** button during a solve
that calls `cancel()` and bumps the token.

The same module hosts a **dedicated aux worker** for the background
alternate-solution search (`searchAlternates` / `cancelAux`): a second
Worker instance from the same bundle, so a long alt-search never queues
behind or preempts an interactive primary solve. `ui.js`'s
`startBackgroundAltSearch` drives it as an async loop instead of the old
synchronous `setTimeout` chunks (which janked the 2D plot).

### URL/hash state (B1)

`ui.js` serializes the user-meaningful config — `{mode, h(w) text,
w0(mode), c, α, q, aggressiveness, tab}` — into `location.hash` via
`writeUrlState` (`history.replaceState`, rAF-coalesced) on each solve and
tab switch, and restores it on load via `applyUrlState`. The h-text
round-trips both the poles and the polynomial part (`formatH` ⇄
`parseH`), so it alone reproduces the quadrature data. This makes a
configuration bookmarkable, shareable, and reload-restorable.

Fallback: if Worker / Blob / fetch is unavailable (e.g. `file://`
origin), `solve()` runs `QD.solveInverseQD` on the main thread inside
a microtask. Logged once at `console.warn`.

### `window.QD_UI.installDomainPlot(deps)` (P0.1b)

`DomainPlot` lives in [`app/ui-domain-plot.js`](app/ui-domain-plot.js)
as a factory function, so the class can be in a separate `<script>`
tag while still receiving the four `ui.js` closures it needs:

```js
const DomainPlot = window.QD_UI.installDomainPlot({
  state, modeDescriptor, formatTick, sub,
});
const plot = new DomainPlot(canvasEl, readoutEl);
```

#### `QD_UI.installX(uiCtx)` — the Inverse-tab module split (Phase 3, item E)

The Phase-3 UI modularization carved the 3024-line `ui.js` down to ~1580 by
moving cohesive clusters into sibling factory modules, all on the same pattern:

| Module | Responsibility |
| --- | --- |
| [`app/ui-modes.js`](app/ui-modes.js) | `MODES` descriptor table + aggressiveness `PRESETS` + `modeDescriptor`/`currentPresetList` |
| [`app/ui-pole-grid.js`](app/ui-pole-grid.js) | `renderPolesList` / `renderPolyCoefList` (the pole + poly-coef DOM builders) |
| [`app/ui-h-text.js`](app/ui-h-text.js) | the `#h-text` ⇄ structured-grid mirror (`parseAndApplyHText`, `refreshHText`, `modeAllowsPoly`) |
| [`app/ui-solve.js`](app/ui-solve.js) | the solve→render→analyze pipeline (`solveAndRender`, `showSolution`, the geom/cusp/realizability analysis, alternates, background search) |
| [`app/ui-url-state.js`](app/ui-url-state.js) | `writeUrlState` / `applyUrlState` (B1 hash serialize+restore) |

`ui.js` builds ONE shared mutable context object, `uiCtx`, carrying the closures
the modules need (`state`, the descriptor tables, DOM helpers, the small shared
render helpers `escapeHTML`/`formatExp`/`setStatus`, the hData/option builders,
`plot`, …). Each module is `QD_UI.installX(uiCtx)` and returns its public
functions; `ui.js` captures them into local bindings with their **original
names**, so every existing call site is unchanged:

```js
const { MODES, PRESETS, modeDescriptor, currentPresetList } =
  window.QD_UI.installModes(uiCtx);
// …later, after every dependency is on uiCtx…
({ solveAndRender, showSolution, refreshAlternatesPanel, /* … */ } =
  window.QD_UI.installSolve(uiCtx));
```

Two rules keep it correct:
- **Install where the deps exist.** Each module is installed at the point in
  `ui.js` where everything it destructures is already on `uiCtx` (modes early,
  after `buildW0`; the rest at the tail, after all helpers are defined). Bodies
  destructure their deps at the factory top, so the moved code is verbatim.
- **Cross-module peers go through `uiCtx` at call time.** When module A calls a
  function that lives in module B (which may install later), it reads
  `ui.fn()` at call time rather than destructuring at install — e.g.
  `ui-solve`'s `solveAndRender` calls `ui.writeUrlState()`. Within a module,
  all calls stay bare (which is why the coupled solve/output/analysis cluster is
  one module — its shared `_solveAndRenderToken` and mutual calls never cross a
  seam).

Same pattern works for any future class or cluster extraction.

#### `QD_UI.installSchwarzX(sCtx)` — the Schwarz-tab module split (Phase 3, item E)

The same modularization carved the 2477-line `schwarz/schwarz-ui.js` down to
~1215 by moving four cohesive clusters into sibling factory modules. The only
twist vs. the Inverse-tab split is that `schwarz-ui.js` is an **IIFE**, so the
host uses forward-`let` bindings inside the IIFE (`let paintAll, …;`) that the
install assignments fill in — the captured names are then called bare
everywhere else in the IIFE.

| Module | Responsibility |
| --- | --- |
| [`app/schwarz/schwarz-paint.js`](app/schwarz/schwarz-paint.js) | the 2D-canvas output layer: `clearCanvas` / `paintAll` / `repaintField` / `paintBoundaryOnTop` / `paintOrbit` / `paintPreimageTree` / `paintLimitSet` / `setProgress` + the colormaps |
| [`app/schwarz/schwarz-render.js`](app/schwarz/schwarz-render.js) | the progressive escape-time renderer: debounced `requestRecompute` + `doRecompute` + the CPU 4×4→2×2→1×1 pyramid (GPU path is one synchronous frame) |
| [`app/schwarz/schwarz-features.js`](app/schwarz/schwarz-features.js) | the per-feature compute/recompute routines wired to the analysis / limit-set / forward-dynamics cards: σ domain-coloring, preimage-tree rebuild + stats, limit-set chaos game, σ level curves, critical orbits, cycle finder, orbit sweep, z-panel ψ-pullback, and high-res PNG export |
| [`app/schwarz/schwarz-interaction.js`](app/schwarz/schwarz-interaction.js) | canvas hover / wheel / click / dblclick / pin handlers + `attachCanvasHandlers` (incl. the single-click `CLICK_DELAY` pin timer, exposed via `get/setClickDelay` for the test hook) |

`schwarz-ui.js` builds ONE shared mutable `sCtx` (`sState` + the geometry/GPU
helpers + the KIND_* constants) and installs in dependency order at the tail:
**paint → render → features → interaction** — each installed once its `sCtx`
deps exist (render needs the paint fns; interaction destructures the feature
recompute hooks `_recomputeLevelCurves` / `_recomputeDomainColoring` /
`_recomputeZPanelOrbit` / `_refreshPreimageTreeStats`). What **stays** in
`schwarz-ui.js`: `sState` + constants, the lazy sidebar mount + the card
builders, `setMode` / view-toggle, the φ-capture + GPU-init plumbing, and the
coordinate transforms / `renderImmediate` that several modules share via `sCtx`.

#### `QD_UI.installDirectX(dCtx)` — the Direct-tab module split (Phase 3, item E)

The 1662-line `direct/direct-ui.js` (also an IIFE) was carved to ~1063 by moving
the two heaviest clusters into sibling factory modules:

| Module | Responsibility |
| --- | --- |
| [`app/direct/direct-recompute.js`](app/direct/direct-recompute.js) | the recompute→render pipeline: `recomputeAndRender` + `recomputeBounded`/`recomputeUnbounded`/`recomputeNumerical` + `displayH` + `sampleBoundedPhi` + `pushBoundaryToPlot` |
| [`app/direct/direct-verify.js`](app/direct/direct-verify.js) | the **Verify** button: `runVerify` + `sampleAnalyticPhi` |

`direct-ui.js` builds ONE shared `dCtx` (`{ directState, parseComplex, isMounted }`)
and installs both at the tail (`({ recomputeAndRender } = QD_UI.installDirectRecompute(dCtx))`,
`({ runVerify } = QD_UI.installDirectVerify(dCtx))`), capturing the returns into
forward-`let` bindings so the card-builder handlers + `_activate` call them
unchanged. The two modules are independent (neither calls the other), so install
order between them is free. What **stays** in `direct-ui.js`: `directState`, the
mount/activate API, the Domain-type + φ-input + output card builders, the
coeff-field builders, the paste/expression-parse wiring, and the shared
`parseComplex` / `coeffToString` / `section` helpers (retained handlers use
them). The host's mount flag is read inside the moved `recomputeAndRender` via
the `dCtx.isMounted()` accessor — the one non-verbatim line, since a primitive
can't be shared by value.

#### `QD_UI.installParamSliceRender(psCtx)` — the Param-slice split (Phase 3, item E)

The 1396-line `param-slice/param-slice-ui.js` (also an IIFE) was carved to ~1096
by lifting its one heavy compute cluster — the adaptive 2-D render engine — into
[`app/param-slice/param-slice-render.js`](app/param-slice/param-slice-render.js).

That module is a single function, `runAdaptive2D`: the progressive quadtree sweep
(coarse stride pass → stride/2 refinement of only the cells whose corners
disagree → nearest-neighbour coverage fill), plus the warm-hint **spatial index**
(bucketed `insertPhi`/`nearestPhi`, published on `sliceState` so the hover preview
warm-starts) — all nested inside it. Every per-run input (the worker `pool`, the
`paintCellBlock`/`paintImage`/`onProgress` callbacks, `cancelToken`, axes/grid
dims) arrives via its single options argument, so the only cross-seam deps are
`sliceState` and the `cancelLiveSolve` host hook, passed via
`psCtx = { sliceState, cancelLiveSolve }`. `param-slice-ui.js` captures
`runAdaptive2D` into a forward-`let` and calls it from `startRun` unchanged; the
`sliceState`, card builders, canvas interaction, and run orchestration stay.

### `qd.mjs` ESM façade (P1.1)

[`app/qd.mjs`](app/qd.mjs) re-exports the entire public `QD` surface as
named ES-module exports:

```js
import { Complex, solveInverseQD, PrimarySolution } from './qd.mjs';
```

Load order requirement: classic scripts must run first to populate
`window.QD`. A 5-stage migration plan (leaf modules → solver families
→ Worker pool → UI) is documented at the top of `qd.mjs`. This file is
**stage 1**: a no-risk façade. Stages 2-5 are open follow-ups.

## Algebra module (the symbolic track)

The **Algebra tab** is a self-contained four-layer stack for setting up and reducing the
polynomial system that decides existence/uniqueness of a classical bounded quadrature
domain. Data flows one way; all exact math lives at the bottom.

```
 generators                 store (DOM-free)          view                 heavy ops
 ───────────                ────────────────          ────                 ─────────
 qd-equations.js ─┐                                  algebra-canvas.js
 (●/★/gauge system)├─seed→  algebra-store.js  ─render→ (QD.AlgebraCanvas:    sym-worker.js
 qd-constraints.js┘         (QD.AlgebraStore:          column lanes,         (QD.SymWorker:
 (univalence forms)         append-column audit       SVG edges, verdict)   Blob worker;
                            trail DAG of equation                            groebner/solve/
                            nodes; reductions;     ↑drive│ ↑select           dimension; main-
 sym-core.js  ◀──all exact  classify/solve/factor) │     │                  thread fallback)
 (QD.Sym: ℚ(i),  math       │        ▲              algebra-ui.js
  MPoly, Gröbner,           └────────┘              (QD_UI.installAlgebra:
  solvers, factor)            offload heavy ops      node-editor sidebar,
                              ────────────────▶      inspector, toolbar,
                                                     breadcrumb, exports)
```

- **`sym-core.js` (`QD.Sym`)** — exact Rational/Gaussian(ℚ(i))/MPoly, Gröbner/FGLM/zero-dim
  solvers, Hermite real-solution counting, Wu triangularization, and `factor`. No DOM, no deps.
- **`qd-equations.js` / `qd-constraints.js`** — generate the (●)/(★)/gauge system and the
  univalence constraints (the `{poly, rel, label, meta}` node specs the store seeds from).
- **`algebra-store.js` (`QD.AlgebraStore`)** — DOM-free model: an **append-column audit-trail
  DAG** (column 0 = original; each reduction appends a labeled column), plus analysis
  (`classify`/`solve`/`dimension`/`factorOf`/`applyFactor`) defaulting to the *current* (last)
  column. Heavy ops route through `sym-worker.js`.
- **`algebra-canvas.js` (`QD.AlgebraCanvas`)** — renders the store as structured column lanes
  (sticky headers, arrowed SVG edges, zoom); exposes `scrollToColumn`/`fitWidth`/`setVerdict`.
- **`algebra-ui.js` (`QD_UI.installAlgebra`)** — the node-editor sidebar + inspector + floating
  toolbar + breadcrumb; drives the store and reads selection back from the canvas via `onSelect`.

**Provenance-op contract** (the one cross-layer coupling to know): every store reduction stamps
`provenance.op` ∈ `{generate, conjugate, resultant, groebner, constraint, duplicate, substitute,
linear-reduce, assume-real, fix-w0, triangular, factor}`, and `algebra-ui.js`'s `provText` +
`columnLabel` switch on exactly those strings — a new reduction op must be added in **both** the
store (emit) and the UI (render), or its column shows as a bare "column N". See the headers of
`algebra-store.js` and `algebra-ui.js`, and the THEORY_MAP rows for the per-feature function→file
index.

## Worker bundles

Both Worker subsystems (`primary-solver-worker.js`,
`param-slice/param-slice-pool.js`) build their bundles at runtime:

1. `fetch` each solver source file (`complex.js`, `solver.js`, …) as text.
2. Prepend `var window = self;` so the existing `(typeof window !==
   'undefined' && window.QD)` namespace idiom resolves inside the
   worker scope.
3. Append a worker-side message handler.
4. Wrap as a `Blob({ type: 'application/javascript' })` and pass the
   `URL.createObjectURL(blob)` to `new Worker(url)`.

The worker-bundle file list lives in ONE place — `WORKER_BUNDLE_FILES` in
[`app/asset-manifest.js`](app/asset-manifest.js). Both worker bundlers
(`primary-solver-worker.js`, `param-slice-pool.js`), the service worker
(via `ALL_ASSETS`), `bench.js`, and the test bootstrap all read it; the
index.html page-script loader and the cache-version generator likewise
derive from the manifest. It is the single source of truth for which files
load where.

## Test harness

- `npm test` (= `node app/node-test.js`) runs the full suite headless. Since
  the Phase-2 refactor the entry is a thin **async runner**: it boots the
  shared Node `vm` context + assertion harness once via
  [`app/test/bootstrap.js`](app/test/bootstrap.js) (masking `typeof window` /
  `typeof self` to `false` so each file takes its Node export branch, and
  installing the kernels + `ok`/`approxEq`/… on `global`), then `await`s each
  per-subsystem file under [`app/test/`](app/test/) in turn. The runner prints
  the live pass/fail tally on exit — the count is not duplicated here to avoid
  drift.
- Parse-checks (P1.3, `app/test/parse-check.test.js`) cover every
  browser-loaded JS file in `app/` (list derived from the manifest), catching
  syntax errors and identifier typos that would otherwise only surface at
  runtime.

## File index

For the canonical file layout see `README.md` § "File layout". The
module READMEs cover the per-subsystem internals:

- [`app/direct/README.md`](app/direct/README.md)
- [`app/schwarz/README.md`](app/schwarz/README.md)
- [`app/sphere/README.md`](app/sphere/README.md)
- [`app/param-slice/README.md`](app/param-slice/README.md)
