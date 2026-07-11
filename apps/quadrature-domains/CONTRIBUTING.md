# Contributing

How to extend the Quadrature Domain Solver. Start with
[ARCHITECTURE.md](ARCHITECTURE.md) for the big picture and
[THEORY_MAP.md](THEORY_MAP.md) to find the code for a given thesis
result.

## Ground rules

- **ES modules, Vite-built.** Every app module is a native `.mjs` file
  imported (directly or transitively) by [`app/main.mjs`](app/main.mjs),
  which `app/index.html` loads as `<script type="module">`. Run the dev
  server with `pnpm --filter quadrature-domains dev` (Vite + HMR); `pnpm
  --filter quadrature-domains build` emits a static `dist/`.
- **`'use strict'` semantics via modules.** Modules are strict by default.
  Many files keep their historical `(function (global) { … })(globalThis)`
  IIFE and attach onto the shared `QD` namespace, but the module *boundary*
  is `import`/`export` — a file registers by `import`-ing `solver.mjs` and
  mutating the `QD` object it default-exports.
- **All math is real or `{re, im}`.** No math.js in the solver hot
  path; math.js is parser-only.
- **Tests stay green.** `node app/node-test.js` must report no
  failures after every change. The harness `import()`s the same `.mjs`
  graph the browser loads; family-registration order is asserted.

## Adding a new family

Each inverse family lives in one `solver-*.mjs` file that `import`s
`solver.mjs` and registers onto the shared `QD` namespace at load
(import order matters; see
[ARCHITECTURE.md](ARCHITECTURE.md#script-load-order)). Use
[`app/solver-qd.mjs`](app/solver-qd.mjs) as the template — it has
the simplest variant.

A family file populates a `QD.Family.X` object with these methods (all
called by `solver.mjs` via dispatcher):

| Method | Purpose |
| --- | --- |
| `evalPhi(z, phi)` | Evaluate φ at z |
| `phiTaylorAt(zc, phi, L)` | Length-(L+1) Taylor series of φ at zc |
| `residual(phi, hData, options)` | Length-(n+d) real residual vector; concatenates the (★) and (●) blocks |
| `packPhi(phi)` / `unpackPhi(v, template)` | Flat-real-vector round-trip; prefer the schema runtime (`QD.packPhiBySchema`) for new families |
| `canonicalizePhi(phi)` | Quotient out gauge symmetries before returning to UI |
| `initialGuess(hData, norm)` | Family seed for stage A1 |
| `perturbedInitialGuess(hData, norm, rng, r)` | Stage A3 (multistart) |
| `diverseInitialGuess(hData, norm, rng, r)` | Stage A4 (diverse seeds) — optional but recommended for families with multi-valued φ |
| `continuationSolve(hData, norm, opts)` | Stage A2 (homotopy) — optional |
| `verifyQuadratureIdentity(phi, hData, opts)` | Boundary-identity check; flags spurious algebraic roots |

After populating `QD.Family.X`, call `QD.registerFamily('X')` at the
bottom of the file. The dispatcher walks `familyDispatchOrder`
(most-specific first); add an entry there in `solver.mjs` if your
family is more specific than `boundedQD`.

For LQD-style families, the shared Blaschke / r# machinery in
[`app/solver-lqd-common.mjs`](app/solver-lqd-common.mjs) is reusable —
read it via `const LqdCommon = QD.LqdCommon;` at the top of your module.

### Seed strategy (A6/B3 split — applied to all 10 families)

Every family's multistart seed strategy lives outside the math kernel
in `app/solvers/seeds/seeds-<familyTag>.mjs` and attaches to
`QD.Seeds.<familyTag> = { initialGuess, perturbedInitialGuess,
diverseInitialGuess? }`. The kernel (`app/solver-<familyTag>.mjs`)
dereferences those at top level (`const initialGuess_X =
QD.Seeds.<familyTag>.initialGuess;`) so the rest of the file stays
pure-math, and internal callers (continuation loops, the Family entry)
keep using the local names unchanged.

To add a seeds file for a new family, follow the same pattern:

1. Create `app/solvers/seeds/seeds-<familyTag>.mjs`. `import` `solver.mjs`
   and attach `QD.Seeds.<familyTag> = { initialGuess, … }`.
2. In `app/solver-<familyTag>.mjs`, `import` the seeds module BEFORE it
   reads `QD.Seeds.<familyTag>` (the import runs the attach as a side
   effect).
3. Dereference at the top of the solver file via
   `const initialGuess = QD.Seeds.<familyTag>.initialGuess;` (with a
   guard that throws if `QD.Seeds.<familyTag>` is missing).
4. Add the seeds module to the worker-thread solver barrel
   [`app/workers/solver-graph.mjs`](app/workers/solver-graph.mjs), BEFORE
   its `solver-<familyTag>.mjs`, so the native module workers pick it up.
   The test bootstrap (`app/test/bootstrap.js`) imports the same graph, so
   one entry gives you both the workers and test execution; parse coverage
   is automatic (`app/test/parse-check.test.js` `node --check`s the `.mjs`
   files).

If a seed function needs a kernel-internal helper (e.g.
`computeTargetF_*`, `_finitePolesView`), export it onto `QD` from the
solver file and reference `QD.<name>` from the seeds file — seed bodies
only run at solve time, so the attach is resolved by then regardless of
import order. See `solver-uqd-lqd.mjs` / `seeds-uqd-lqd.mjs` for an example.

### Schema-driven pack/unpack

New families should use the schema runtime rather than hand-writing
pack/unpack. See `SCHEMA_LQDS` in
[`app/solver-lqd-singular.mjs:273`](app/solver-lqd-singular.mjs) for the
canonical example. The schema is a list of `{ key, kind, ... }` entries
describing each parameter slot; `QD.packPhiBySchema` / `unpackPhiBySchema`
do the rest. Clamps (e.g. disk-interior) go in the schema entry, not
the residual.

### Tests for the new family

Add a `runFamilyBattery` block in
[`app/test/solvers.test.js`](app/test/solvers.test.js) — search for the
existing calls to copy the pattern. (`runFamilyBattery`, `ok`, `solveInverseQD`,
etc. are installed on `global` by `app/test/bootstrap.js`; see "Test harness"
below.) Each preset gets: solve success, family tag, boundary univalence,
identity tol, optional inside-test point. The new family should pass
`runFamilyBattery` before being shipped.

## Adding a Schwarz adapter

[`app/schwarz/schwarz-common.mjs`](app/schwarz/schwarz-common.mjs) contains
one CPU adapter per family (`adaptBounded`, `adaptUnbounded`,
`adaptBoundedLQD`, …). To add a new one, mirror an existing adapter's
shape: it returns `{ sigma, psi, evalPhi, evalF, isInOmega, escapeR,
adapter, family, unbounded }` for the new family's `phi` shape.

For GPU coverage, edit
[`app/schwarz/schwarz-webgl.mjs`](app/schwarz/schwarz-webgl.mjs) — every
piece of `phi` that the CPU adapter consumes needs a corresponding
uniform on the GPU. The most common bug class (HANDOFF #26, #28) is
forgetting one field in `clonePhi` or `setPhi` so the GPU shader
falls back to a default. The Schwarz tests in `node-test.js` round-
trip σ(w) ≈ w on ∂Ω to catch this.

## HANDOFF cadence

Each shipped feature gets a numbered entry in
[`HANDOFF.md`](HANDOFF.md) (§7). The convention:

- One paragraph problem statement.
- The fix in one sentence.
- File path(s) touched.
- New test count, e.g. "5 new tests (566 → 571 total)".
- Any follow-ups left open.

P0-P3 work in this codebase follows the same cadence — see entries
#21-#37 for recent examples. Numbering is monotonic.

## Test harness

`node app/node-test.js` (also `pnpm test`) is the entry. As of the Phase-2
refactor it is a thin **async runner**: it awaits `app/test/bootstrap.js`'s
async `init()` (which `import()`s the `.mjs` module graph ONCE — masking
`typeof window` / `typeof self` to `false` so each file's Node export branch
fires — and installs the shared kernels + assertion helpers on `global`: `ok`,
`approxEq`, `C`, `T`, `QD`, `solveInverseQD`, `Schwarz`, `PS`, `SC`,
`runFamilyBattery`, …), then `await`s each subsystem's `run()`. The suite lives in per-subsystem files
under [`app/test/`](app/test/) (`solvers.test.js`, `direct.test.js`,
`schwarz.test.js`, `param-slice.test.js`, `sphere.test.js`, `cusps.test.js`,
`riemann.test.js`, `parse-check.test.js`, `worker.test.js`), each
exporting `module.exports = async function run() { … }`. (`ui-domain-plot`
and `schwarz-ui` moved to Vitest jsdom, importing the `.mjs` directly.) To add a subsystem,
drop a file there and add its name to the `TESTS` array in `node-test.js`.
The runner is async, so jsdom/timer-based tests can `await` real behaviour
(e.g. the deferred single-click pin in `schwarz-ui.test.js`). Fast (well
under 30 s for the full battery + parse-checks).

When in doubt, add a test before the fix — the parser, families, and
critical-set kernels all have extensive precedent.

### Parse-check layer (P1.3)

Every app `.mjs` file gets a parse-check in
[`app/test/parse-check.test.js`](app/test/parse-check.test.js), which
`node --check`s the module graph. The file list is discovered by walking
`app/` — no manual list to maintain; a new `.mjs` gets parse coverage
automatically. This catches:

- Syntax errors before the app loads.
- Identifier typos in files that aren't otherwise exercised by Node.

## Cross-tab contracts (P0 work)

When wiring a new cross-tab interaction:

- **Reader:** prefer `QD.PrimarySolution.get()` /
  `.subscribe(handler)` over reaching into `state.current`. See
  [`app/schwarz/schwarz-ui.mjs`](app/schwarz/schwarz-ui.mjs) for the
  pattern.
- **Writer (ui.mjs):** call `publishPrimarySolution()` after every
  state.current mutation. Four call sites exist today; new ones should
  follow.
- **Param-slice-style:** if your reader needs to TRIGGER a solve in
  ui.mjs (not just read), use `window.QD_UI.loadScenarioIntoQdTab`.
  Define new such functions on `window.QD_UI.*` (one-direction
  namespace from UI to subsystems).

## Extracting a UI cluster (factory pattern)

`ui.mjs` (and, going forward, the other tab-UI files) keeps cohesive clusters in
sibling modules via the `QD_UI.installX(uiCtx)` factory pattern (Phase-3, item E
— see [ARCHITECTURE.md](ARCHITECTURE.md#qd_uiinstallxuictx--the-inverse-tab-module-split-phase-3-item-e)).
To pull a new cluster out of `ui.mjs`:

1. Create `app/ui-<name>.mjs` that `import`s the `QD_UI` registry and sets
   `QD_UI.installX = function (ui) { … return { … }; }`.
2. Move the functions **verbatim**; at the factory top, destructure each ui.mjs
   dependency with its original name (`const state = ui.state;` …) so the bodies
   don't change. For a peer that lives in another extracted module (and may
   install later), call it as `ui.fn()` at call time instead of destructuring.
3. In `ui.mjs`: forward-declare the moved names as `let`s, populate the needed
   helpers onto `uiCtx`, then `({ … } = QD_UI.installX(uiCtx))` at a point
   where every dependency is already on `uiCtx`. Keep small shared helpers
   (`escapeHTML` / `formatExp` / `setStatus`, the hData/option builders) in
   `ui.mjs` — the retained handlers use them too.
4. If a moved function is invoked synchronously at load (not just from event
   handlers), relocate that call to after the install block.
5. `import` `app/ui-<name>.mjs` from `ui.mjs` (before the install call), and
   `pnpm test` (parse-check covers the new file automatically). The pure-refactor
   guard is the test pass-count invariant + a browser smoke (the only runtime
   check for `ui.mjs`).

Tightly-coupled clusters that call each other and share mutable state (e.g. the
solve→render→analyze pipeline and its `_solveAndRenderToken`) belong in ONE
module, so those calls stay bare same-scope and the state never crosses a seam.

**IIFE hosts (`schwarz/schwarz-ui.mjs`).** When the host file keeps an inner IIFE
rather than being a flat module body, the forward-`let` bindings live *inside* the
IIFE and the `({ … } = QD_UI.installSchwarzX(sCtx))` assignments fill them in at
the tail — same pattern. `schwarz-ui.mjs` was split this way into `schwarz-paint` /
`schwarz-render` / `schwarz-features` / `schwarz-interaction`, installed in that
**dependency order** (render needs the paint fns; interaction destructures the
feature recompute hooks). Two gotchas: keep state that several modules mutate in
ONE module and expose accessors (the single-click `CLICK_DELAY` lives in
`schwarz-interaction` with `get/setClickDelay` for the test hook); and the Vitest
jsdom host test `import`s each extracted `.mjs` so the `installSchwarzX` factories
run at load.

## Worker pool conventions

Two Worker subsystems today:

- [`app/primary-solver-worker.mjs`](app/primary-solver-worker.mjs) —
  single warm worker for the Inverse-tab solve.
- [`app/param-slice/param-slice-pool.mjs`](app/param-slice/param-slice-pool.mjs)
  — pool of N workers for parameter sweeps.

Both spawn **native ES-module workers** — `new Worker(new
URL('./workers/<name>-entry.mjs', import.meta.url), {type:'module'})` — and
Vite bundles each entry's import graph into its own chunk. The worker-thread
side imports the shared solver barrel
[`app/workers/solver-graph.mjs`](app/workers/solver-graph.mjs), so adding a
new solver file only means importing it there (the test bootstrap imports the
same graph). Each main-thread twin keeps a `typeof Worker` guard that falls
back to solving on the main thread (Node / no-Worker environments).

## Style

- 2-space indent, single quotes, semicolons, 100-col print-width.
- Functions named in `camelCase`; classes in `PascalCase`; family tags
  in `camelCase` (`'boundedQD'`, `'unboundedLQD_singular'`).
- Comments lean technical and mathematical — when the math is dense,
  cite the thesis section.
- ESLint + Prettier configs exist and are tuned to match the existing
  style (no churn); CI runs `pnpm lint`.

## Styling (CSS design tokens)

`app/style.css` opens with a `:root` block of **design tokens** — the core
palette (`--c-primary`, `--c-ink`, `--c-border`, `--c-surface`, `--c-ok/-warn/
-err`, …) plus a spacing scale (`--sp-1`…`--sp-5`). Conventions:

- **Use the tokens, not literals.** New rules should reference `var(--c-…)` /
  `var(--sp-…)` rather than hard-coding hexes or pixel gaps. Add a new shared
  value to `:root` once and reference it everywhere (this is the single source of
  truth that replaced ~20 duplicated `#5677a8`s).
- **Avoid inline `style=` for anything themeable.** Inline width/colour literals
  can't be overridden by media queries or future themes; prefer a class.
- **Responsive.** The sidebar is fluid (`grid-template-columns:
  clamp(360px,28vw,460px) 1fr`); a `@media (max-width: 860px)` block stacks the
  controls above the plot and caps fixed-width inputs to the column.
- **Dark mode is a deferred follow-up** that the tokens enable. It additionally
  needs the JS plot renderer themed (the plot background is a JS fill in
  `ui-domain-plot.mjs` and the 2-D data palette is light-tuned), so a tokens-only
  flip would leave the plot pane light — do both together when it's tackled.
- **Cache-busting is handled by Vite.** `vite build` fingerprints emitted assets
  and `vite-plugin-pwa` refreshes the precache on update, so there's no manual
  cache-version step after editing `style.css` — just save and (in dev) the HMR
  server reloads it.

## License & attribution

When citing this codebase, cite Andrew Graven's thesis (Caltech 2026)
and the companion arXiv paper (arXiv:2509.03777, 2025). The
README.md "References" section has the full BibTeX entry.
