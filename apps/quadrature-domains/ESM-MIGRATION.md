# Quadrature app — ESM migration (Phase 2)

> **Status doc for the in-progress port of the Quadrature app from classic `<script>` globals
> onto native ES modules (the prerequisite for consuming shared `@cas/*` packages).** This is
> [MIGRATION.md Phase 2](../../docs/MIGRATION.md#phase-2--quadrature-domains-onto-vite-still-all-javascript)
> of the suite runbook. Work happens on the **`phase-2`** branch. The live app is unaffected
> until the final flip (see [Invariants](#invariants)).

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
- Also standalone: `vite.config.mjs` + `esm-proof.{html,js}` + `app/workers/leaf.worker.mjs`
  prove `vite build` bundles a native module worker (replaces runtime-Blob bundling). These are
  transitional scaffolding — the final flip repoints Vite at `index.html`.

## Remaining

1. **Workers → native module workers.** `primary-solver-worker`, `param-slice/param-slice-pool`,
   `schwarz/schwarz-cpu-worker`: replace runtime-Blob bundling with
   `new Worker(new URL('./w.mjs', import.meta.url), { type: 'module' })` importing the ESM graph
   (proven by the `esm-proof` slice). These three are the last classic `.js` still vm-loaded in
   `bootstrap.js` (via `loadInCtx(..., { replaceSelf: true })`); `parse-h` (deferred) rides along
   at this stage.
2. **UI layer + flip.** ESM-port the `QD_UI.installX(uiCtx)` factory modules, `ui.js`, the
   `algebra/*` tab modules, and `ui-modes` (all still classic — the on-demand test files that pull
   `algebra/algebra-store`, `algebra/cas-export`, `algebra/expr-parser`, `algebra/sym-worker`, and
   `ui-modes` via `loadInCtx` keep resolving them as frozen `.js` for now); replace the
   `document.write` loader in `index.html` with a Vite ESM entry; replace the hand-rolled `sw.js` +
   `version:sync` with `vite-plugin-pwa`; delete the frozen `.js` graph. Then the **byte-for-byte
   parity gate**: `pnpm --filter quadrature-domains dev` + `build`, spot-check the thesis-example
   oracle panel, the Schwarz dynamics tab, the param-slice sweep, and a live Worker solve.

## How to resume / verify

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
