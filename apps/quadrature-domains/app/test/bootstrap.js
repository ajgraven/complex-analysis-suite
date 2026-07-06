'use strict';
// =============================================================================
// test/bootstrap.js -- builds the shared vm context ONCE and installs every
// shared symbol on `global`, so the split test files (app/test/*.test.js) can
// reference the kernels + harness exactly as the old single-file node-test.js
// did (zero call-site churn).
//
// Phase-2 ESM migration: as leaf modules are ported to native ESM (.mjs), this
// harness `import()`s them and exposes them on the vm context's GLOBAL OBJECT
// (`ctx.Complex = …`), so the still-classic, vm-loaded files resolve the bare
// name `Complex`/`Taylor` through the context global exactly as they did when
// complex.js/taylor.js were vm-loaded. The classic .js files stay on disk (the
// legacy browser loader still uses them) but the SUITE now exercises the ESM
// ports — a live parity check. Because `import()` is async, setup moved from
// require-time into an idempotent async `init()` that node-test.js awaits.
// =============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const harness = require('./harness');

// Optional shared dep: the Direct/Schwarz/riemann sections all reference mathjs
// (the old single-file suite declared it once); require it here so every split
// file sees the same value (or null when not installed → those sections skip).
let mathjs = null;
try { mathjs = require('mathjs'); } catch (e) { /* optional — sections skip if absent */ }

const APP_DIR = path.join(__dirname, '..');   // app/

// Manifest files that have been ported to native ESM (.mjs). They are imported
// (not vm-loaded) and injected on the ctx global. Grow this set as the port
// proceeds up the dependency graph.
const ESM_PORTED = new Map([
  ['complex.js', { file: 'complex.mjs', globals: ['Complex'] }],
  ['taylor.js', { file: 'taylor.mjs', globals: ['Taylor'] }],
  // solver.mjs default-exports the mutable QD namespace. bootstrap sets ctx.module.exports +
  // ctx.QD to it so the STILL-classic vm-loaded files (poly-helpers, analysis, subsystems)
  // read/register onto it, and the ESM family modules below import it directly.
  ['solver.js', { file: 'solver.mjs', namespace: true }],
]);
// Solver family/seed cluster: native-ESM twins, imported (side effect) in WORKER_BUNDLE_FILES
// order — each IIFE registers onto the solver.mjs namespace exactly as its classic twin did.
for (const rel of [
  'solver-faber.js',
  'solvers/seeds/seeds-qd.js', 'solver-qd.js',
  'solvers/seeds/seeds-uqd.js', 'solver-uqd.js',
  'solver-lqd-common.js', 'solvers/seeds/seeds-lqd.js', 'solver-lqd.js',
  'solvers/seeds/seeds-lqd-singular.js', 'solver-lqd-singular.js',
  'solvers/seeds/seeds-uqd-lqd.js', 'solver-uqd-lqd.js',
  'solvers/seeds/seeds-uqd-lqd-singular.js', 'solver-uqd-lqd-singular.js',
  'solver-pqd-common.js', 'solvers/seeds/seeds-pqd.js', 'solver-pqd.js',
  'solvers/seeds/seeds-pqd-singular.js', 'solver-pqd-singular.js',
  'solvers/seeds/seeds-uqd-pqd.js', 'solver-uqd-pqd.js',
  'solvers/seeds/seeds-uqd-pqd-singular.js', 'solver-uqd-pqd-singular.js',
]) {
  ESM_PORTED.set(rel, { file: rel.replace(/\.js$/, '.mjs') });
}

// Analysis + subsystem layer ported to native ESM. Imported (not vm-loaded) in
// dependency order after the core namespace exists. Most are SIDE-EFFECT modules
// that register onto the QD namespace exactly as their classic twins did (poly-
// helpers → QD.Poly/QD.Format, critical-set → QD.CriticalSet, direct-common →
// QD.Direct, the four schwarz files → QD.Schwarz, …). The two `capture` modules
// instead expose their OWN API object (they used to reassign module.exports):
// param-slice-common's default export is the ParamSlice API (bootstrap → PS);
// sphere-common's named `SphereCommon` export (bootstrap → SC). Keyed by the
// classic filename so loadInCtx() and the CORE filter can skip the frozen .js.
const PORTED_ANALYSIS = [
  { file: 'poly-helpers.js' },
  { file: 'critical-set.js' },
  { file: 'univalence.js' },
  { file: 'cusps.js' },
  { file: 'riemann-latex.js' },
  { file: 'primary-solution.js' },
  { file: 'direct/direct-common.js' },
  { file: 'schwarz/schwarz-common.js' },     // creates QD.Schwarz; must precede the three below
  { file: 'schwarz/schwarz-inverse.js' },
  { file: 'schwarz/schwarz-analysis.js' },
  { file: 'schwarz/schwarz-forward.js' },
  { file: 'param-slice/param-slice-common.js', capture: 'default' },      // → PS
  { file: 'sphere/sphere-common.js', capture: 'SphereCommon' },           // → SC
];
const PORTED_ANALYSIS_SET = new Set(PORTED_ANALYSIS.map((s) => s.file));

let _initPromise = null;
function init() {
  if (!_initPromise) _initPromise = _init();
  return _initPromise;
}

async function _init() {
  const ctx = {
    module: { exports: {} }, exports: {}, global, require, console, process,
    __dirname: APP_DIR, __filename: path.join(APP_DIR, 'node-test.js'),
  };
  ctx.global = ctx;
  vm.createContext(ctx);

  // Read a source file, mask the browser/worker env checks (so the Node export
  // branch runs), and execute it in the shared context. `replaceSelf` is needed
  // by the worker modules (primary-solver-worker.js, schwarz-cpu-worker.js).
  function loadInCtx(rel, opts = {}) {
    let src = fs.readFileSync(path.join(APP_DIR, rel), 'utf8')
      .replace(/typeof window !== 'undefined'/g, 'false');
    if (opts.replaceSelf) src = src.replace(/typeof self !== 'undefined'/g, 'false');
    vm.runInContext(src, ctx, { filename: rel });
  }

  // Import a native-ESM app module by relative path (file:// URL for Windows).
  async function importApp(rel) {
    return import(pathToFileURL(path.join(APP_DIR, rel)).href);
  }

  // Import every ESM-ported module and expose its exports on the ctx global, so
  // bare references in the still-classic vm-loaded files resolve to the ports.
  for (const spec of ESM_PORTED.values()) {
    const mod = await importApp(spec.file);
    for (const name of (spec.globals || [])) {
      if (!(name in mod)) throw new Error(`bootstrap: ${spec.file} does not export ${name}`);
      ctx[name] = mod[name];
    }
    if (spec.namespace) {
      const ns = mod.default;
      if (!ns) throw new Error(`bootstrap: ${spec.file} has no default (namespace) export`);
      ctx.module.exports = ns;   // classic family files read `module.exports` as the QD namespace
      ctx.QD = ns;               // and some files read bare QD
      // When solver.js was vm-loaded its top-level declarations were bare bindings in the
      // context; some tests read them that way (e.g. vm.runInContext('evalPhi', ctx)). Mirror
      // that by exposing the namespace members as bare ctx globals. Function refs are stable;
      // the Family registry object is the same reference the family files mutate in place.
      Object.assign(ctx, ns);
    }
  }

  // --- asset manifest first: its IIFE resolves the global to ctx (no self/window
  //     in the vm), so QD_ASSET_MANIFEST lands on ctx; primary-solver-worker.js
  //     reads it. Also the source of the core load order below. ---
  loadInCtx('asset-manifest.js');
  const MANIFEST = ctx.QD_ASSET_MANIFEST;

  // Capture the QD namespace (populated by the solver + families imported above;
  // ctx.module.exports was pointed at it in the ESM_PORTED namespace step).
  const QD_NS = ctx.module.exports;
  ctx.QD = QD_NS;

  // --- still-classic core kernels: WORKER_BUNDLE_FILES + the page-only analysis
  //     modules the old suite appended, MINUS parse-h (the execution loader omitted
  //     it), the ESM-ported leaves/solver/families, and the ESM-ported analysis
  //     layer. Order is significant (seeds before each solver); WORKER_BUNDLE_FILES
  //     already encodes it. This list shrinks toward empty as the port proceeds. ---
  const ANALYSIS_FILES = ['critical-set.js', 'univalence.js', 'cusps.js', 'riemann-latex.js', 'primary-solution.js'];
  const CORE = MANIFEST.WORKER_BUNDLE_FILES
    .concat(ANALYSIS_FILES)
    .filter(f => f !== 'parse-h.js' && !ESM_PORTED.has(f) && !PORTED_ANALYSIS_SET.has(f));
  for (const f of CORE) loadInCtx(f);

  // --- ESM-ported analysis + subsystem layer: imported (not vm-loaded), in the
  //     dependency order declared in PORTED_ANALYSIS. Side-effect modules register
  //     onto the QD namespace (same object as QD_NS); `capture` modules expose their
  //     own API, grabbed here. Sequential await guarantees the order (e.g. poly-
  //     helpers before schwarz-inverse, schwarz-common before its augmenters). ---
  const captured = {};
  for (const spec of PORTED_ANALYSIS) {
    const mod = await importApp(spec.file.replace(/\.js$/, '.mjs'));
    if (spec.capture) captured[spec.file] = spec.capture === 'default' ? mod.default : mod[spec.capture];
  }

  // Re-expose all namespace members (solver + families + the ported analysis that
  // attached to QD) as bare ctx globals, for the handful of tests that read them
  // via vm.runInContext('<name>', ctx).
  Object.assign(ctx, QD_NS);

  const Direct  = QD_NS.Direct;                              // direct-common.mjs attached it
  const Schwarz = QD_NS.Schwarz;                             // schwarz-*.mjs attached it
  const PS = captured['param-slice/param-slice-common.js'];  // ParamSlice API (default export)
  const SC = captured['sphere/sphere-common.js'];            // SphereCommon (named export)

  // --- workers (still classic; native module workers land in the next port step) ---
  loadInCtx('primary-solver-worker.js', { replaceSelf: true });   // attaches QD_NS.PrimarySolverWorker
  const PSW = QD_NS.PrimarySolverWorker;
  loadInCtx('schwarz/schwarz-cpu-worker.js', { replaceSelf: true }); // attaches QD_NS.SchwarzCpuWorker
  const SCW = QD_NS.SchwarzCpuWorker;

  // --- per-family standard battery (migrated from node-test.js) ---
  function runFamilyBattery(label, presets) {
    for (const p of presets) {
      const tol = p.identityTol ?? 1e-8;
      const result = QD_NS.solveInverseQD(p.hData, p.opts);
      const tag = label + ' :: ' + p.tag;
      harness.ok(tag + ' solves', result.success, result.success ? '' : result.error);
      if (!result.success) continue;
      const sol = result.primary;
      if (p.family) {
        const got = sol.phi.family;
        harness.ok(tag + ' family tag = ' + p.family, got === p.family, 'got=' + (got || '<none>'));
      }
      harness.ok(tag + ' univalent', sol.univalent);
      harness.ok(tag + ' identityOK (' + tol.toExponential(0) + ')', sol.identity.maxRelDiff < tol,
         'maxRel=' + sol.identity.maxRelDiff.toExponential(2));
      const sampleAdaptive = QD_NS.sampleBoundaryAdaptive;
      const boundary = sampleAdaptive(sol.phi, 500, 750);
      let dup = 0, ooo = 0;
      for (let i = 1; i < boundary.length; i++) {
        const dx = boundary[i].w.re - boundary[i - 1].w.re;
        const dy = boundary[i].w.im - boundary[i - 1].w.im;
        if (Math.hypot(dx, dy) < 1e-12) dup++;
        if (boundary[i].theta < boundary[i - 1].theta) ooo++;
      }
      harness.ok(tag + ' sampler: no duplicates', dup === 0, 'dup=' + dup);
      harness.ok(tag + ' sampler: theta strictly increasing', ooo === 0, 'ooo=' + ooo);
      if (p.insideTest) {
        const pts = boundary.map(b => b.w);
        const got = harness.pointInside(pts, p.insideTest.point.re, p.insideTest.point.im);
        harness.ok(tag + ' polygon contains ' + p.insideTest.label, got === p.insideTest.expected,
           'got=' + got + ' expected=' + p.insideTest.expected);
      }
    }
  }

  // --- install the shared API on `global` so split test files use it unchanged ---
  const shared = {
    ctx, loadInCtx, MANIFEST,
    QD_NS, QD: QD_NS,                 // some test bodies reference the namespace as bare `QD`
    Complex: ctx.Complex, Taylor: ctx.Taylor,   // the ESM ports (injected above)
    C: ctx.Complex, T: ctx.Taylor,
    evalPhi: QD_NS.evalPhi, phiTaylorAt: QD_NS.phiTaylorAt, computeTargetA: QD_NS.computeTargetA,
    residual: QD_NS.residual, residualNorm: QD_NS.residualNorm,
    solveInverseQD: QD_NS.solveInverseQD, isBoundaryUnivalent: QD_NS.isBoundaryUnivalent,
    Direct, Schwarz, PS, SC, PSW, SCW,
    mathjs,
    runFamilyBattery,
    ok: harness.ok, approxEq: harness.approxEq, pointInside: harness.pointInside,
    section: harness.section,
  };
  Object.assign(global, shared);

  return shared;
}

module.exports = { init };
