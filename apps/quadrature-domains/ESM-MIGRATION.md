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
- Also standalone: `vite.config.mjs` + `esm-proof.{html,js}` + `app/workers/leaf.worker.mjs`
  prove `vite build` bundles a native module worker (replaces runtime-Blob bundling). These are
  transitional scaffolding — the final flip repoints Vite at `index.html`.

## Remaining

1. **Analysis / subsystem layer** (still `vm`-loaded in bootstrap `CORE` + the subsystem block):
   `poly-helpers`, `critical-set`, `univalence`, `cusps`, `riemann-latex`, `primary-solution`,
   `observables`, `symmetry`, `solver-cmax`, `thesis-examples`, `faber-analysis`, `sym-core`,
   `sym-radical`, `qd-equations`, `qd-constraints`; then `direct/direct-common`, `schwarz/schwarz-*`,
   `param-slice/param-slice-common`, `sphere/sphere-common`.
   - ⚠ **Gotcha:** `param-slice-common.js` and `sphere-common.js` **reassign `module.exports`** to
     their own API (bootstrap captures `PS`/`SC`, then restores `module.exports = QD_NS`). As ESM
     they must `export` their API and get bootstrap wiring (globals/namespace-style), *not* the
     uniform family transform.
2. **Workers → native module workers.** `primary-solver-worker`, `param-slice/param-slice-pool`,
   `schwarz/schwarz-cpu-worker`: replace runtime-Blob bundling with
   `new Worker(new URL('./w.mjs', import.meta.url), { type: 'module' })` importing the ESM graph
   (proven by the `esm-proof` slice).
3. **UI layer + flip.** ESM-port the `QD_UI.installX(uiCtx)` factory modules and `ui.js`; replace
   the `document.write` loader in `index.html` with a Vite ESM entry; replace the hand-rolled
   `sw.js` + `version:sync` with `vite-plugin-pwa`; delete the frozen `.js` graph. Then the
   **byte-for-byte parity gate**: `pnpm --filter quadrature-domains dev` + `build`, spot-check the
   thesis-example oracle panel, the Schwarz dynamics tab, the param-slice sweep, and a live Worker
   solve.

## How to resume / verify

```bash
# from apps/quadrature-domains:
node app/node-test.js          # the parity check — must stay "2200 passed, 0 failed"
# recipe per file: cp x.js x.mjs → add imports for the bare globals it uses (load order bounds
# these to earlier files) → for families swap the `const QD = (typeof window…)` block for
# `const QD = _QD` → add the .js key to ESM_PORTED in bootstrap.js (in WORKER_BUNDLE_FILES order)
# → rerun the suite. See bootstrap.js's ESM_PORTED comments for the three wiring kinds.
```

Root gate (`pnpm` on PATH — see the pnpm-local-invocation memory): `pnpm lint && pnpm typecheck && pnpm test`.

## Invariants

- **Never edit a classic `.js` twin** while its `.mjs` exists — they would drift. The `.js` is
  frozen until the flip deletes it; all changes go in the `.mjs`.
- **The suite must stay green (2200/0)** after each file's conversion — it is the parity guard.
- Adding `.mjs` files is inert to the manifest machinery: `QD_ASSET_MANIFEST`, the `gen-cache-version`
  `CACHE_HASH` (hashes only manifest-listed `.js` + `sw.js`), and `parse-check` all key off the
  frozen `.js`, so the `manifest` test stays green without a `version:sync`.
- `parse-h.js` is **not** in the harness `CORE` (bootstrap filters it out), so it can be deferred
  to the worker/flip stage.
