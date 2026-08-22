# Quadrature app — ESM migration (Phase 2)

> **✅ DONE — this now documents the COMPLETED port** of the Quadrature app from classic `<script>`
> globals to native ES modules ([MIGRATION.md Phase 2](../../docs/MIGRATION.md#phase-2--quadrature-domains-onto-vite-still-all-javascript)).
> The app is **ESM-only**: `index.html` → `main.mjs`, native module workers, vite-plugin-pwa, and the
> classic `.js` graph is **deleted** (git history keeps it as provenance). Retained as the record of *how* the
> parallel-graph flip was done. `@cas/core` has since been extracted; use the app README and CONTRIBUTING guide
> for current commands and validation rather than the historical counts below.
>
> **Current loading note (post-migration):** `main.mjs` now retains only the
> inverse-QD startup graph. `lazy-features.mjs` dynamically loads Direct,
> Schwarz/Sphere, Parameter-slice, and Algebra on first use; the historical
> references below to one eager page graph describe the completed migration,
> not the current bundle boundary.
>
> **Historical-record boundary:** except for the two notices above, this file is a chronological migration log.
> Its former paths, branch names, test totals, and transitional scaffolding describe the state at that step and
> are deliberately not current operational instructions.

## Why this is not a mechanical swap

The app loads ~84 files as classic `<script>` tags via a `document.write` loop over
`QD_ASSET_MANIFEST.PAGE_SCRIPTS` (`app/index.html`). They share one global scope and
cross-reference each other by **bare globals** (`Complex`, `Taylor`, `LqdCommon`, `QD`) and the
`QD` namespace object. The headless test suite (`app/test/bootstrap.js`) loads the *same* sources
in a Node `vm` context with `typeof window` masked to `false`. Both loaders are incompatible with
a top-level `export`: the moment a file gains one it drops out of the classic browser loader, the
vm loader, **and** the runtime-Blob worker bundlers. So this is a coordinated port of the file
graph + the test harness + the two worker systems, ending with an `index.html` flip. See the
author's own 5-stage plan at the top of `app/qd.mjs`.

## Strategy: parallel graph (`.mjs` twins)

Each classic `app/x.js` gets a native-ESM **twin** `app/x.mjs`. The classic `.js` stays **frozen**
and live (legacy browser loader + blob workers keep working); the `.mjs` graph is what the test
suite now exercises, giving a **live parity check** at every step. The classic files are removed
only at the final `index.html` flip, once the whole graph is ESM.

The seam is `app/test/bootstrap.js`'s **`ESM_PORTED`** map. For each ported file the harness
`import()`s the `.mjs` instead of `vm`-loading the `.js`, and wires it into the shared `vm`
context so the *still-classic* files see the ported values exactly as before:

| twin kind | `.mjs` shape | bootstrap wiring |
|---|---|---|
| **leaf** (`complex`, `taylor`) | `export { X }` | `ctx.X = mod.X` (bare global for vm files) |
| **namespace** (`solver`) | `export default _exports` (the mutable `QD`) | `ctx.module.exports = ctx.QD = mod.default`, then `Object.assign(ctx, ns)` |
| **family/seed** (23 files) | keep the IIFE; `import _QD from './solver.mjs'`; `const QD = _QD` | side-effect `import()` in `WORKER_BUNDLE_FILES` order (registers onto the namespace) |
| **analysis/subsystem** (side-effect) | keep the IIFE; `const QD = _QD` (+ `import {Complex[,Taylor]}` where used); attach `QD.X = …` | `import()` in `PORTED_ANALYSIS` dep order; `loadInCtx()` skips the frozen `.js` |
| **capture** (`param-slice-common`, `sphere-common`) | drop the IIFE `global` arg; `return` the API from an arg-less IIFE → `export default`/named | `import()` then grab `.default` / `.SphereCommon` (→ `PS` / `SC`) |
| **worker** (`*-worker-entry` + the `-worker`/`-pool` twins) | entry: `import` the `solver-graph` barrel + `self`-guarded `onmessage`; twin: `new Worker(new URL('./workers/*-entry.mjs', import.meta.url), {type:'module'})` + `typeof Worker` fallback | twins imported via `PORTED_ANALYSIS` (Node hits the main-thread fallback); entries + graph validated by `vitest/worker-entry.test.ts` and `vite build` |

Because `import()` is async, harness setup moved into an idempotent async `bootstrap.init()`
that `app/node-test.js` awaits before the run loop.

## Done (branch `phase-2`, `node app/node-test.js` → **2200 passed, 0 failed** throughout)

- **Leaves:** `complex.mjs`, `taylor.mjs` (+ native Vitest golden tests in
  `vitest/leaves/`; these feed `@cas/core` in Phase 3).
- **Harness:** async `init()` + the `ESM_PORTED` seam (`bootstrap.js`, `node-test.js`).
- **Solver core:** `solver.mjs` — default-exports the `QD` namespace.
- **Solver families/seeds (23):** `solver-faber`, `solvers/seeds/*`,
  `solver-{qd,uqd,lqd,lqd-singular,uqd-lqd,uqd-lqd-singular,pqd,pqd-singular,uqd-pqd,uqd-pqd-singular}`,
  `solver-{lqd,pqd}-common`. Batch transform was `scratchpad/port-families.mjs` (throwaway).
- **Analysis CORE + subsystems:** `poly-helpers`, `critical-set`, `univalence`, `cusps`,
  `riemann-latex`, `primary-solution`; `direct/direct-common`, `schwarz/{common,inverse,analysis,
  forward}`, `param-slice/param-slice-common` (→ `PS`), `sphere/sphere-common` (→ `SC`). Imported
  in init via the new `PORTED_ANALYSIS` registry (side-effect + capture kinds above). The
  `module.exports.Direct`/`Schwarz` tails and `if (!QD) return` guards survive untouched — they
  are inert in ESM (`typeof module` → `'undefined'`; `_QD` is always truthy).
- **Page-only analysis:** `sym-core`, `sym-radical`, `qd-equations`, `qd-constraints`,
  `observables`, `symmetry`, `solver-cmax`, `faber-analysis`, `ui-strings`, `thesis-examples` —
  the modules the test files pull in on demand. Pre-imported in dep order; `loadInCtx()` now skips
  any `PORTED_ANALYSIS` file, so the on-demand `loadInCtx('sym-core.js')` calls are no-ops (without
  the skip, vm-loading the frozen `.js` would clobber the `.mjs` attach and void the parity check).
  Batch transforms were `scratchpad/port-analysis.mjs` + `port-reassign.mjs` (throwaway).
- **Workers (native module workers):** the three main-thread twins `primary-solver-worker`,
  `schwarz/schwarz-cpu-worker`, `param-slice/param-slice-pool` + the worker-thread side in
  `app/workers/`: `solver-graph.mjs` (side-effect barrel = the WORKER_BUNDLE_FILES solver cluster
  as ESM, minus parse-h) and `{solver,schwarz,param-slice}-worker-entry.mjs`. The twins drop the
  runtime-Blob bundle for `new Worker(new URL('./workers/*-entry.mjs', import.meta.url),
  {type:'module'})`, guarded by `typeof Worker` so Node/file:// use the imported main-thread
  fallback. The native round-trip is browser-only, so it is validated in three headless layers:
  the fallback surface + a functional `liveSolve` in `worker.test.js`; `vitest/worker-entry.test.ts`
  (each entry's whole import graph loads in real Node ESM + wires QD/the pool factory); and
  `vite build` via `workers-build-check.html` (Rollup bundles the worker entries + the solver
  graph into their own chunks). The live in-browser worker round-trip is a **flip** spot-check. QD
  gained a `build` script (ADR-0003; `pnpm build` now covers both apps). Batch transform:
  `scratchpad/port-workers.mjs`.
- **UI layer (the mechanical + headless-tested files):** QD-attach twins (`parse-h`, `qol`,
  `schwarz/schwarz-webgl`, `sphere/sphere-webgl`); the algebra kernels (`expr-parser`, `cas-export`,
  `algebra-store`) + `algebra/sym-worker` (a **4th** native module worker); and the `QD_UI` factory
  graph — `ui-registry.mjs` (the `QD_UI` namespace, UI-side counterpart to `QD`), `ui-presets.mjs`
  (exports the 10 preset arrays), and 16 `installX` factory modules (`ui-modes`, `ui-pole-grid`,
  `ui-h-text`, `ui-solve`, `ui-url-state`, `ui-domain-plot`, `ui-thesis`, `ui-faber`,
  `ui-qd-equations`, `direct/{recompute,verify}`, `schwarz/{paint,render,features,interaction}`,
  `param-slice/param-slice-render`). `ui-modes` + the 4 algebra kernels are headless-tested (join
  `PORTED_ANALYSIS`; bootstrap exposes `ctx.QD_UI`); the rest are dormant twins. Factory transform
  KEEPS each IIFE (ADR-0002) and only rewrites the module boundary. Batch transforms:
  `scratchpad/port-ui-{phase1,factories}.mjs`.
- Also standalone: `vite.config.mjs` + `esm-proof.{html,js}` + `app/workers/leaf.worker.mjs`
  prove `vite build` bundles a native module worker (replaces runtime-Blob bundling). These are
  transitional scaffolding — the final flip repoints Vite at `index.html`.

## The flip — ✅ DONE (retained as the record of how it was completed)

> All of the below is finished. `main.mjs` is the page entry; `index.html` loads it; the 8
> orchestrator twins are ported; the classic `.js` graph + `asset-manifest`/`sw`/`bench`/
> `gen-cache-version` are deleted; vite-plugin-pwa is in. The headless harness was migrated off the
> classic files (bootstrap drops the manifest; `manifest.test` retired; `parse-check` now `node
> --check`s the `.mjs`; `ui-domain-plot`/`schwarz-ui` moved to Vitest jsdom importing the `.mjs`).
> The `katex`/`math` "gotcha" below was a **false alarm** — those resolve fine as bare identifiers in
> a module (browser-verified). The one real coupling was `ui-state`'s `const state` → `export`.

### (historical) the browser-dependent endgame (8 orchestrator twins + the flip)

Everything the **headless suite** loads is ESM (the only classic `.js` still `loadInCtx`'d in
`bootstrap.js` is `asset-manifest.js` — plain data, can stay through the flip). What's left is
browser-only and can't be validated headlessly (lint/typecheck are blind here: `QD`, `QD_UI`,
`Complex`, `state`, … are declared eslint **globals**, so a missing import does NOT error). The
**browser flip is their validation** — run the preview server and fix console errors iteratively.

**1. The 8 bare-top-level orchestrator twins** (dormant; tests `readFileSync` the frozen `.js`):
- `ui-state.js` — defines `const state = {...}` at script scope. In ESM it must **`export const
  state`** (+ `QD_UI.state = state`); it's the cross-script `state` global read by `ui.js`,
  `schwarz/schwarz-ui`, `direct/direct-ui`, `param-slice/param-slice-ui`, `algebra/algebra-ui`,
  `algebra/algebra-canvas` — each must **`import { state }`** from it. (`sphere/sphere-ui` has its
  OWN local `state` — no import.)
- `ui.js` (1855 lines, no IIFE) — import `state`, `_QD`(→`const QD`), `Complex`, `QD_UI`; rewrite
  `window.QD_UI` → `QD_UI`; it attaches `QD_UI.snapshotScenario`/`.loadScenarioIntoQdTab`/`.state`.
- The `*-ui` consumers (`schwarz-ui`, `direct-ui`, `param-slice-ui` [+ `ParamSlice`], `sphere-ui`
  [+ `SphereCommon`], `algebra-ui`, `algebra-canvas`): import `state`/`QD`/`QD_UI` as the recon
  shows (see `scratchpad/recon-ui.mjs` output), rewrite `window.QD`/`window.QD_UI` → `QD`/`QD_UI`,
  keep the IIFE. `algebra-ui` is the `const QD = window.QD` (win) case.
- **Cross-module-global binding audit (`scratchpad/recon-globals.mjs`):** across all 77 committed
  `.mjs`, only **3** use a cross-module global without a local binding — all `katex`
  (`riemann-latex`, `ui-qd-equations`, `ui-solve`). This is very likely a **non-issue**: `katex` /
  `math` are CDN-set **global-object properties** (`window.katex`), which DO resolve as bare
  identifiers inside an ES module (the module scope chain reaches the global object), and the CDN
  `<script>`s are parser-blocking so they run before the deferred module. (Contrast `ui-state`'s
  `const state`, a global *lexical* binding — that does NOT cross the module boundary, hence the
  `export`/`import` above.) Confirm at the browser gate; no preemptive rewrite planned. Everything
  else (`Schwarz`/`Direct`/`LqdCommon`/… ) is already bound via `const X = QD.X` aliases or imports.

**2. The flip.** ✅ **Dev-validated (commit `cef91ec`).** `app/main.mjs` (side-effect-imports the whole
`PAGE_SCRIPTS` graph, generated by `scratchpad/gen-main.mjs`, + `QD.Strings.apply()`) and a parallel
`app/index-esm.html` (loader → `<script type="module" src="./main.mjs">`, hand-rolled SW dropped)
were browser-validated on a Vite dev server (`vite.dev.config.mjs`, root `app/`): the page loads
clean, KaTeX + strings render, **auto-solve succeeds**, the **native module worker solve returns
success + univalent off-thread**, all 4 tabs switch (only benign `ResizeObserver` noise). `solver.mjs`
now exposes `window.QD = _exports` in the browser (mirrors classic). The live `index.html` is
untouched, so the app + suite stay green. Still TODO to finish the flip:
- Swap `index.html` → the `index-esm.html` content; repoint the BUILD `vite.config` at `app/index.html`
  (root `app/`) + delete `esm-proof.*` + `workers-build-check.*`; add **vite-plugin-pwa**
  (`autoUpdate`, precache the build, runtimeCache the CDN) — as a *separate additive commit after* the
  ESM swap validates (decision: PWA decoupled from the flip).
- ⚠ **Delete-blocker (new finding):** the headless suite still reads the **classic `.js`** — `bootstrap`
  vm-loads `asset-manifest.js`; `manifest`/`parse-check`/`schwarz-ui`/`ui-domain-plot`/`direct`/
  `param-slice` tests `readFileSync`/parse the classic `.js`; `bench.js` vm-loads the classic solver.
  So **deleting the classic graph requires migrating these test/harness deps first** (point them at the
  `.mjs` graph, or retire the manifest-shape checks). Delete is bundled with the flip (decision #3).
- Final parity gate: `pnpm build` + suite + browser spot-checks (Schwarz render, param-slice sweep).

## How to resume / verify

> **(Historical — the classic `.js` graph is now deleted; the parallel-graph port is complete.)**
> The recipe below is retained only as the record of how each file was ported during the flip.

```bash
# from apps/quadrature-domains:
node app/node-test.js          # the parity check — must stay "2200 passed, 0 failed"
# recipe per QD-attach file: cp x.js x.mjs → prepend imports for the bare leaf globals it uses
# (Complex/Taylor) + `import _QD from '<rel>solver.mjs'` → swap the `const QD = (typeof window…)`
# block for `const QD = _QD` → register the .js in bootstrap.js (ESM_PORTED for leaves/solver/
# families; PORTED_ANALYSIS for the analysis/subsystem layer, which loadInCtx() then auto-skips)
# → rerun the suite. See bootstrap.js's ESM_PORTED / PORTED_ANALYSIS comments for the wiring kinds.
# The batch transforms scratchpad/port-{families,analysis,reassign}.mjs encode exactly this.
```

Root gate (`pnpm` on PATH — see the pnpm-local-invocation memory): `pnpm lint && pnpm typecheck && pnpm test`.

## Invariants

> **(Historical — the classic graph is now deleted, so these parallel-graph invariants no longer
> apply; kept as the record of what kept the port honest while both graphs coexisted.)**

- **Never edit a classic `.js` twin** while its `.mjs` exists — they would drift. The `.js` is
  frozen until the flip deletes it; all changes go in the `.mjs`.
- **The suite must stay green (2200/0)** after each file's conversion — it is the parity guard.
- **A ported page-only file MUST be added to `PORTED_ANALYSIS`** (so `loadInCtx()` skips its frozen
  `.js`). Porting the `.mjs` without the skip leaves the test files vm-loading the classic `.js`,
  which re-runs the IIFE and clobbers the `.mjs`'s namespace attach — the suite still passes but
  silently tests the `.js`, not the `.mjs`. The skip is what makes the parity check real.
- Adding `.mjs` files is inert to the manifest machinery: `QD_ASSET_MANIFEST`, the `gen-cache-version`
  `CACHE_HASH` (hashes only manifest-listed `.js` + `sw.js`), and `parse-check` all key off the
  frozen `.js`, so the `manifest` test stays green without a `version:sync`.
- `parse-h.js` is **not** in the harness `CORE` (bootstrap filters it out), so it can be deferred
  to the worker/flip stage.
