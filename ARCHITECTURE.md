# Architecture

High-level map of how the Quadrature Domain Solver app fits together.
For mathematical content, see [THEORY_MAP.md](THEORY_MAP.md). For how
to extend the app, see [CONTRIBUTING.md](CONTRIBUTING.md).

## At a glance

- **Vanilla HTML + JS** — no build step. Open `app/index.html` in any
  modern browser.
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
    A2[KaTeX 0.16.11]
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

## Public `QD.*` surface

| Group | Exports |
| --- | --- |
| Math primitives | `Complex`, `Taylor` |
| Solver core | `evalPhi`, `phiTaylorAt`, `residual`, `residualNorm`, `packPhi`, `unpackPhi`, `newtonSolve`, `solveInverseQD`, `searchAlternates`, `isBoundaryUnivalent`, `sampleBoundary`, `sampleBoundaryAdaptive`, `binomialCoeff`, `selectFamily`, `registerFamily`, `packPhiBySchema`, `unpackPhiBySchema`, `applySchemaClamps` |
| Linear algebra (P1.2) | `solveLinearSystem`, `solveLeastSquares`, `houseQR`, `numericalJacobian` |
| Inverse Faber | `QD.Faber.inverseFaberAtPole`, `QD.Faber.inverseFaberAtInfinity` |
| Direct problem | `QD.Direct.*` (see [`app/direct/README.md`](app/direct/README.md)) |
| Schwarz dynamics | `QD.Schwarz.*` (see [`app/schwarz/README.md`](app/schwarz/README.md)) |
| Riemann sphere | `QD.Sphere.*` (see [`app/sphere/README.md`](app/sphere/README.md)) |
| Critical set | `QD.findCriticalPoints`, `QD.CriticalSet.*` |
| Geometric properties | `QD.classifyUnivalence`, `QD.Univalence.classifyUnivalence` |
| Boundary cusps | `QD.classifyCusps`, `QD.Cusps.classifyCusps` |
| Custom h(w) text | `QD.parseH`, `QD.formatH` |
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
