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
   `solver-<familyTag>.js`.
6. Add the seeds file to `node-test.js`'s loaders (the top vm loader
   AND the parse-check list).

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
[`app/node-test.js`](app/node-test.js) — search for the existing
calls to copy the pattern. Each preset gets: solve success, family
tag, boundary univalence, identity tol, optional inside-test point.
The new family should pass `runFamilyBattery` before being shipped.

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

Two paths:

- **Headless:** `cd app && node node-test.js`. Loads source files via
  Node's `vm`, masking `typeof window !== 'undefined'` to `false` so
  the Node export branch fires. Fast (well under 30 s for the full
  battery + parse-checks).
- **Browser:** open `app/test.html`. Same tests, with small inline
  visualisations. Mostly useful for debugging numerical surprises.

When in doubt, add a test before the fix — the parser, families, and
critical-set kernels all have extensive precedent.

### Parse-check layer (P1.3)

Every browser-loaded JS file (and the `qd.mjs` ESM façade) gets a
parse-check in `node-test.js`. New files should be added to
`sourceFiles` in the parse-check block. This catches:

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

## Worker pool conventions

Two Worker subsystems today:

- [`app/primary-solver-worker.js`](app/primary-solver-worker.js) —
  single warm worker for the Inverse-tab solve.
- [`app/param-slice/param-slice-pool.js`](app/param-slice/param-slice-pool.js)
  — pool of N workers for parameter sweeps.

Both build their bundles at runtime by `fetch`-ing solver source files
and concatenating with a worker-side handler string. To add a new
solver file, update **both** `SOLVER_SRC_FILES` arrays. A future
refactor will hoist this into a shared `asset-manifest.js`.

## Style

- 2-space indent, single quotes, semicolons, 100-col print-width.
- Functions named in `camelCase`; classes in `PascalCase`; family tags
  in `camelCase` (`'boundedQD'`, `'unboundedLQD_singular'`).
- Comments lean technical and mathematical — when the math is dense,
  cite the thesis section.
- ESLint + Prettier configs land in P3.2; both will be tuned to match
  the existing style (no churn).

## License & attribution

When citing this codebase, cite Andrew Graven's thesis (Caltech 2026)
and the companion arXiv paper (arXiv:2509.03777, 2025). The
README.md "References" section has the full BibTeX entry.
