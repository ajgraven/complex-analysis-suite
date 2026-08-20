// ESLint flat config (eslint 9+).
//
// Calibrated to the existing codebase rather than imposing a new style:
// quote style stays mixed (single vs double both occur in solver.js
// versus ui.js — neither is wrong); var/let/const all coexist by design
// (some IIFE wrappers need `var` for hoisting into worker globals).
//
// The rules below are deliberately conservative — they catch the bugs
// that have actually bitten this codebase (silent field drop-through,
// typo in identifier name) and stop short of mechanical-style
// enforcement that would produce a wall-of-diff with no value.
//
// Tune up over time by adding lines below the "// Correctness" block.

import globals from 'globals';

// Strip the built-in `Taylor` and `Schwarz` browser globals (Apple Pay /
// other vendor namespaces) so our codebase's same-named identifiers can
// be declared at script scope without `no-redeclare` firing.
const browserGlobalsClean = { ...globals.browser };
delete browserGlobalsClean.Taylor;
delete browserGlobalsClean.Schwarz;

// Shared codebase-specific globals. Re-used across the QD-script,
// node-test, and ESM blocks.
const QD_GLOBALS = {
  QD: 'writable',                       // primary namespace
  QD_UI: 'writable',                    // ui.js bridge namespace
  QD_ASSET_MANIFEST: 'writable',        // P3.3 PWA shared asset list
  Complex: 'readonly',                  // complex.js top-level
  Taylor: 'readonly',                   // taylor.js top-level (browser global cleared above)
  ParamSlice: 'writable',
  ParamSlicePool: 'writable',
  Schwarz: 'readonly',                  // schwarz/* (browser global cleared above)
  SphereCommon: 'readonly',             // sphere/sphere-common.js → sphere/sphere-{ui,webgl}.js
  Sphere: 'readonly',                   // sphere namespace
  Direct: 'readonly',                   // direct namespace
  LqdCommon: 'readonly',                // solver-lqd-common.js
  state: 'readonly',                    // ui.js script-realm const, read by schwarz-ui.js fallback
  // Preset arrays attached to globals by ui-presets.js.
  QD_PRESETS_BOUNDED: 'readonly',
  QD_PRESETS_BOUNDED_PQD: 'readonly',
  QD_PRESETS_BOUNDED_PQD_SINGULAR: 'readonly',
  QD_PRESETS_UNBOUNDED: 'readonly',
  QD_PRESETS_UNBOUNDED_PQD: 'readonly',
  QD_PRESETS_UNBOUNDED_PQD_SINGULAR: 'readonly',
  LQD_PRESETS_BOUNDED: 'readonly',
  LQD_PRESETS_BOUNDED_SINGULAR: 'readonly',
  LQD_PRESETS_UNBOUNDED: 'readonly',
  LQD_PRESETS_UNBOUNDED_SINGULAR: 'readonly',
  // math.js + KaTeX (CDN globals).
  math: 'readonly',
  katex: 'readonly',
};

// Kernels that are genuine script-scope globals in the classic `<script>` world
// (complex.js / taylor.js declare them at top level; every other classic script
// reads the bare name) but MUST be imported in real ESM — an `.mjs` module gets
// them only via `import { Complex } from '../core/complex.mjs'`. Keeping them in
// the `.mjs` global allowlist made `no-undef` treat a forgotten import as fine:
// that is exactly how `solver-pqd-common.mjs` shipped `Complex.*` calls with no
// import, throwing "ReferenceError: Complex is not defined" from the bundled
// worker (the test harness masked it by leaking Complex onto globalThis, which
// the production bundle has no equivalent of). Dropping them here for `.mjs` only
// makes `no-undef` catch the missing import at author time. Verified zero
// existing `.mjs` violations before enabling (bare Complex/Taylor references are
// all `QD.Complex`-style member access or the defining module's own binding).
const ESM_MUST_IMPORT = ['Complex', 'Taylor'];
const ESM_GLOBALS = { ...QD_GLOBALS };
for (const name of ESM_MUST_IMPORT) delete ESM_GLOBALS[name];

// Shared no-unused-vars rule: ignore `_`-prefixed names, catch-block
// exception bindings, and function args entirely. The codebase
// deliberately uses unused args to document API shape (e.g. a
// `verifyQuadratureIdentity(phi, hData, opts)` signature where opts
// is unused in one family but used in another) — flagging those is
// noise. We still want signal on unused VARIABLE declarations because
// those usually indicate dead code.
const NO_UNUSED_VARS_RULE = ['warn', {
  args: 'none',                         // don't flag unused function args
  varsIgnorePattern: '^_',              // _-prefixed vars are intentional
  caughtErrors: 'none',                 // catch (e) {} is fine
}];

export default [
  // Top-level ignores. Goes first so ESLint never tries to parse non-JS.
  {
    ignores: [
      'app/node_modules/**',
      'node_modules/**',
      'app/disabled/**',
      '**/*.min.js',
      '**/*.html',                      // ui.js inline scripts aren't linted via .html
    ],
  },
  // Service worker — its own globals (`importScripts`, caches API, clients).
  {
    files: ['app/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...QD_GLOBALS },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': NO_UNUSED_VARS_RULE,
      'no-redeclare': 'error',
    },
  },
  // Main classic-script app code.
  {
    files: ['app/**/*.js'],
    ignores: ['app/sw.js', 'app/node-test.js', 'app/qd.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',             // classic <script> tags; ESM lives in qd.mjs
      globals: {
        ...browserGlobalsClean,
        ...globals.node,                // Node export branch in IIFEs
        ...QD_GLOBALS,
      },
    },
    rules: {
      // -------- Correctness (we want these to fire) --------
      'no-undef': 'error',
      'no-unused-vars': NO_UNUSED_VARS_RULE,
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-self-compare': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',

      // -------- Permissive (codebase deliberately mixed) --------
      'no-var': 'off',                  // worker bundles need var-hoisting; ui-presets uses var
      'prefer-const': 'off',            // codebase chooses let/const case-by-case
      'quotes': 'off',                  // solver.js double, ui.js single; both fine
      'semi': 'off',                    // present universally already
      'indent': 'off',                  // 2-space already universal
    },
  },
  // Files that DECLARE the corresponding QD_GLOBALS name at script scope.
  // Listing them in globals makes other files happy under no-undef, but the
  // declaration file itself trips no-redeclare. Per-file override turns that
  // off where (and only where) the redeclaration is legitimate.
  {
    files: ['app/complex.js', 'app/taylor.js', 'app/schwarz/schwarz-common.js', 'app/ui.js'],
    rules: { 'no-redeclare': 'off' },
  },
  // The ESM app source — 97 of the 98 .mjs files under app/.
  //
  // These had NO rules at all. Every `files:` glob above targets app/**/*.js or a named .js file,
  // and the only .mjs glob was app/qd.mjs — so `eslint --print-config app/ui.mjs` (and sym-core.mjs,
  // and main.mjs) resolved to zero active rules. The comment on the classic-script block, "classic
  // <script> tags; ESM lives in qd.mjs", explains why: it was written before the Phase-2 ESM
  // migration, which moved the whole app to .mjs and left the lint config behind. The result was
  // that the correctness rules this config carefully picks — no-undef, no-unreachable, use-isnan,
  // valid-typeof, no-dupe-keys — applied only to the legacy .js files, which after the migration are
  // mostly tests.
  //
  // Same rule set as the classic-script block, with sourceType 'module'. no-unused-vars stays at
  // WARN (NO_UNUSED_VARS_RULE), deliberately: turning it on surfaces ~294 findings across this tree,
  // and a green gate that shows them beats a red gate that blocks everything until a 294-item
  // cleanup lands. The genuinely-bug-shaped rules are errors, and they were measured at zero
  // findings before being switched on — so they gate from day one without a backlog.
  {
    files: ['app/**/*.mjs'],
    ignores: ['app/qd.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Worker entries (app/workers/*.mjs) run in a worker realm, so include those globals
      // alongside the browser ones; node covers the handful of environment probes.
      globals: {
        ...browserGlobalsClean,
        ...globals.worker,
        ...globals.node,
        ...ESM_GLOBALS,                 // QD_GLOBALS minus kernels that MUST be imported in ESM
      },
    },
    rules: {
      // -------- Correctness (errors — measured at zero findings before enabling) --------
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-self-compare': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      // -------- Visible but non-blocking (the ~294-item backlog) --------
      'no-unused-vars': NO_UNUSED_VARS_RULE,
    },
  },
  // ESM façade (qd.mjs).
  {
    files: ['app/qd.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...browserGlobalsClean, ...QD_GLOBALS },
    },
    rules: {
      'no-unused-vars': NO_UNUSED_VARS_RULE,
    },
  },
  // Test harness + bench (Node entry points).
  {
    files: ['app/node-test.js', 'app/bench.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.node, ...QD_GLOBALS },
    },
    rules: {
      'no-unused-vars': 'off',          // scaffolding declares many helpers used per-block
      'no-undef': 'error',
      'no-redeclare': 'off',             // bench.js declares its own QD via vm context
    },
  },
  // Split test suite (app/test/**). test/bootstrap.js installs the shared kernel
  // namespaces + harness helpers (ok, C, T, solveInverseQD, Schwarz, PS, …) on
  // `global`, so the per-subsystem *.test.js files reference them as bare names
  // exactly as the old monolithic node-test.js did. no-undef is off because that
  // shared API is injected at runtime, not imported per file; a genuinely
  // undefined reference surfaces as a ReferenceError when the suite runs in CI.
  {
    files: ['app/test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.node, ...QD_GLOBALS },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
    },
  },
];
