# Contributing

How to extend the Quadrature Domain Solver. Start with
[ARCHITECTURE.md](ARCHITECTURE.md) for the big picture and
[THEORY_MAP.md](THEORY_MAP.md) to find the code for a given thesis
result.

## Ground rules

- **No build step.** Open `app/index.html` in a browser. Anything that
  requires bundling / transpilation is a hard no for the main path.
  ES-module consumers can use [`app/qd.mjs`](app/qd.mjs).
- **Vanilla JS.** `'use strict'` everywhere; the `(function (global) {
  … })(globalThis)` IIFE per file; namespace registrations on the
  shared `window.QD` object.
- **All math is real or `{re, im}`.** No math.js in the solver hot
  path; math.js is parser-only.
- **Tests stay green.** `node app/node-test.js` must report no
  failures after every change. The harness loads the same source
  files as the browser; family-registration order is asserted.

## Adding a new family

Each inverse family lives in one solver-`*.js` file plus an entry in
[`app/index.html`](app/index.html)'s `<script>` block (load order
matters; see [ARCHITECTURE.md](ARCHITECTURE.md#script-load-order)).
Use [`app/solver-qd.js`](app/solver-qd.js) as the template — it has
the simplest variant.

A family file exports a `QD.Family.X` object with these methods (all
called by `solver.js` via dispatcher):

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
(most-specific first); add an entry there in `solver.js` if your
family is more specific than `boundedQD`.

For LQD-style families, the shared Blaschke / r# machinery in
[`app/solver-lqd-common.js`](app/solver-lqd-common.js) is reusable —
import via `const LqdCommon = QD.LqdCommon;` at the top of your IIFE.

### Seed strategy (A6/B3 split — applied to all 10 families)

Every family's multistart seed strategy lives outside the math kernel
in `app/solvers/seeds/seeds-<familyTag>.js` and attaches to
`QD.Seeds.<familyTag> = { initialGuess, perturbedInitialGuess,
diverseInitialGuess? }`. The kernel (`app/solver-<familyTag>.js`)
dereferences those at top level (`const initialGuess_X =
QD.Seeds.<familyTag>.initialGuess;`) so the rest of the file stays
pure-math, and internal callers (continuation loops, the Family entry)
keep using the local names unchanged.

To add a seeds file for a new family, follow the same pattern:

1. Create `app/solvers/seeds/seeds-<familyTag>.js`.
2. Inside an IIFE, attach `QD.Seeds.<familyTag> = { initialGuess, … }`.
3. In `app/index.html`, load the seeds file BEFORE the corresponding
   `solver-<familyTag>.js`.
4. In the solver file, dereference at the top via
   `const initialGuess = QD.Seeds.<familyTag>.initialGuess;` (with a
   guard that throws if `QD.Seeds.<familyTag>` is missing).
5. Add the seeds file to `WORKER_BUNDLE_FILES` in
   `app/asset-manifest.js` (the worker bundlers read it), BEFORE its
   `solver-<familyTag>.js`. **This is the only list to edit** — the test
   bootstrap (`app/test/bootstrap.js`) and the parse-check
   (`app/test/parse-check.test.js`) both derive their file lists from the
   manifest, so a manifest entry gives you both test execution and parse
   coverage automatically (no more hand-synced loader copies).
6. Run `npm run version:sync` and commit the updated `app/asset-manifest.js`
   — any change to an `app/` asset bumps the content-hash cache version, and
   CI's `npm run version:check` fails if it's stale.

If a seed function needs a kernel-internal helper (e.g.
`computeTargetF_*`, `_finitePolesView`), export it onto `QD` from the
solver file and reference `QD.<name>` from the seeds file — seed bodies
only run at solve time, so the export is resolved by then regardless of
load order. See `solver-uqd-lqd.js` / `seeds-uqd-lqd.js` for an example.

### Schema-driven pack/unpack

New families should use the schema runtime rather than hand-writing
pack/unpack. See `SCHEMA_LQDS` in
[`app/solver-lqd-singular.js:273`](app/solver-lqd-singular.js) for the
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

[`app/schwarz/schwarz-common.js`](app/schwarz/schwarz-common.js) contains
one CPU adapter per family (`adaptBounded`, `adaptUnbounded`,
`adaptBoundedLQD`, …). To add a new one, mirror an existing adapter's
shape: it returns `{ sigma, psi, evalPhi, evalF, isInOmega, escapeR,
adapter, family, unbounded }` for the new family's `phi` shape.

For GPU coverage, edit
[`app/schwarz/schwarz-webgl.js`](app/schwarz/schwarz-webgl.js) — every
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

`npm test` (= `node app/node-test.js`) is the entry. As of the Phase-2
refactor it is a thin **async runner**: it requires `app/test/bootstrap.js`
(which builds the Node `vm` context ONCE — masking `typeof window` /
`typeof self` to `false` so the Node export branch fires — and installs the
shared kernels + assertion helpers on `global`: `ok`, `approxEq`, `C`, `T`,
`QD`, `solveInverseQD`, `Schwarz`, `PS`, `SC`, `runFamilyBattery`, …), then
`await`s each subsystem's `run()`. The suite lives in per-subsystem files
under [`app/test/`](app/test/) (`solvers.test.js`, `direct.test.js`,
`schwarz.test.js`, `param-slice.test.js`, `sphere.test.js`, `cusps.test.js`,
`riemann.test.js`, `parse-check.test.js`, `worker.test.js`,
`ui-domain-plot.test.js`, `schwarz-ui.test.js`, `manifest.test.js`), each
exporting `module.exports = async function run() { … }`. To add a subsystem,
drop a file there and add its name to the `TESTS` array in `node-test.js`.
The runner is async, so jsdom/timer-based tests can `await` real behaviour
(e.g. the deferred single-click pin in `schwarz-ui.test.js`). Fast (well
under 30 s for the full battery + parse-checks).

When in doubt, add a test before the fix — the parser, families, and
critical-set kernels all have extensive precedent.

### Parse-check layer (P1.3)

Every browser-loaded JS file (and the `qd.mjs` ESM façade) gets a
parse-check in [`app/test/parse-check.test.js`](app/test/parse-check.test.js).
The file list is **derived from the manifest** (`PAGE_SCRIPTS` +
`asset-manifest.js` + `sw.js`) — no manual list to maintain; adding a file to
`app/asset-manifest.js` gives it parse coverage automatically. This catches:

- Syntax errors before browser load.
- Identifier typos in files that aren't otherwise exercised by Node.

## Cross-tab contracts (P0 work)

When wiring a new cross-tab interaction:

- **Reader:** prefer `QD.PrimarySolution.get()` /
  `.subscribe(handler)` over reaching into `state.current`. See
  [`app/schwarz/schwarz-ui.js`](app/schwarz/schwarz-ui.js) for the
  pattern.
- **Writer (ui.js):** call `publishPrimarySolution()` after every
  state.current mutation. Four call sites exist today; new ones should
  follow.
- **Param-slice-style:** if your reader needs to TRIGGER a solve in
  ui.js (not just read), use `window.QD_UI.loadScenarioIntoQdTab`.
  Define new such functions on `window.QD_UI.*` (one-direction
  namespace from UI to subsystems).

## Extracting a UI cluster (factory pattern)

`ui.js` (and, going forward, the other tab-UI files) keeps cohesive clusters in
sibling modules via the `QD_UI.installX(uiCtx)` factory pattern (Phase-3, item E
— see [ARCHITECTURE.md](ARCHITECTURE.md#qd_uiinstallxuictx--the-inverse-tab-module-split-phase-3-item-e)).
To pull a new cluster out of `ui.js`:

1. Create `app/ui-<name>.js` as an IIFE that sets
   `global.QD_UI.installX = function (ui) { … return { … }; }`.
2. Move the functions **verbatim**; at the factory top, destructure each ui.js
   dependency with its original name (`const state = ui.state;` …) so the bodies
   don't change. For a peer that lives in another extracted module (and may
   install later), call it as `ui.fn()` at call time instead of destructuring.
3. In `ui.js`: forward-declare the moved names as `let`s, populate the needed
   helpers onto `uiCtx`, then `({ … } = window.QD_UI.installX(uiCtx))` at a point
   where every dependency is already on `uiCtx`. Keep small shared helpers
   (`escapeHTML` / `formatExp` / `setStatus`, the hData/option builders) in
   `ui.js` — the retained handlers use them too.
4. If a moved function is invoked synchronously at load (not just from event
   handlers), relocate that call to after the install block.
5. Add `app/ui-<name>.js` to `PAGE_UI_FILES` in `app/asset-manifest.js`
   **before `ui.js`**, run `npm run version:sync`, and `npm test` (parse-check
   covers the new file automatically). The pure-refactor guard is the test
   pass-count invariant + a browser smoke (the only runtime check for `ui.js`).

Tightly-coupled clusters that call each other and share mutable state (e.g. the
solve→render→analyze pipeline and its `_solveAndRenderToken`) belong in ONE
module, so those calls stay bare same-scope and the state never crosses a seam.

**IIFE hosts (`schwarz/schwarz-ui.js`).** When the host file is itself an IIFE
rather than a flat script, the forward-`let` bindings live *inside* the IIFE and
the `({ … } = window.QD_UI.installSchwarzX(sCtx))` assignments fill them in at
the tail — same pattern, no `window.` exposure needed. `schwarz-ui.js` was split
this way into `schwarz-paint` / `schwarz-render` / `schwarz-features` /
`schwarz-interaction`, installed in that **dependency order** (render needs the
paint fns; interaction destructures the feature recompute hooks). Two gotchas:
keep state that several modules mutate in ONE module and expose accessors (the
single-click `CLICK_DELAY` lives in `schwarz-interaction` with `get/setClickDelay`
for the test hook); and when a jsdom test `eval`s the host, it must `eval` each
extracted module **first** (see the load list at the top of
[`app/test/schwarz-ui.test.js`](app/test/schwarz-ui.test.js)), since the IIFE
calls the `installSchwarzX` factories at load.

## Worker pool conventions

Two Worker subsystems today:

- [`app/primary-solver-worker.js`](app/primary-solver-worker.js) —
  single warm worker for the Inverse-tab solve.
- [`app/param-slice/param-slice-pool.js`](app/param-slice/param-slice-pool.js)
  — pool of N workers for parameter sweeps.

Both build their bundles at runtime by `fetch`-ing solver source files
(cache-busted with `?v=<CACHE_VERSION>`) and concatenating with a
worker-side handler string. Both read the file list from
`QD_ASSET_MANIFEST.WORKER_BUNDLE_FILES` (`app/asset-manifest.js`) — the
single source of truth — so adding a new solver file only means editing
the manifest (`bench.js` and the test bootstrap read the same list).

## Style

- 2-space indent, single quotes, semicolons, 100-col print-width.
- Functions named in `camelCase`; classes in `PascalCase`; family tags
  in `camelCase` (`'boundedQD'`, `'unboundedLQD_singular'`).
- Comments lean technical and mathematical — when the math is dense,
  cite the thesis section.
- ESLint + Prettier configs land in P3.2; both will be tuned to match
  the existing style (no churn).

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
  `ui-domain-plot.js` and the 2-D data palette is light-tuned), so a tokens-only
  flip would leave the plot pane light — do both together when it's tackled.
- **CSS isn't `?v=`-busted** like the page scripts (`<link href="style.css">` is
  static); the service worker refreshes it via the `CACHE_VERSION` bump, so run
  `npm run version:sync` after editing `style.css` (any `app/` asset change) and
  hard-reload in dev.

## License & attribution

When citing this codebase, cite Andrew Graven's thesis (Caltech 2026)
and the companion arXiv paper (arXiv:2509.03777, 2025). The
README.md "References" section has the full BibTeX entry.
