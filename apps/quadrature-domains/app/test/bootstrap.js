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

  // --- core kernels: WORKER_BUNDLE_FILES (minus parse-h, which the old execution
  //     loader omitted; minus the ESM-ported leaves, which were imported above) +
  //     the page-only analysis modules it appended. Order is significant (seeds
  //     before each solver); WORKER_BUNDLE_FILES already encodes it. ---
  const ANALYSIS_FILES = ['critical-set.js', 'univalence.js', 'cusps.js', 'riemann-latex.js', 'primary-solution.js'];
  const CORE = MANIFEST.WORKER_BUNDLE_FILES
    .filter(f => f !== 'parse-h.js' && !ESM_PORTED.has(f))
    .concat(ANALYSIS_FILES);
  for (const f of CORE) loadInCtx(f);

  // Capture the QD namespace BEFORE param-slice/sphere reassign module.exports.
  const QD_NS = ctx.module.exports;
  ctx.QD = QD_NS;   // param-slice-common reads global.QD (= ctx.QD)
  // Re-expose all namespace members (incl. family-registered ones) as bare ctx globals, for
  // the handful of tests that read them via vm.runInContext('<name>', ctx).
  Object.assign(ctx, QD_NS);

  // --- subsystems (the 5 former mid-file loaders; each depends only on core QD) ---
  loadInCtx('direct/direct-common.js');               // augments module.exports.Direct
  const Direct = ctx.module.exports.Direct;

  loadInCtx('schwarz/schwarz-common.js');
  loadInCtx('schwarz/schwarz-inverse.js');
  loadInCtx('schwarz/schwarz-analysis.js');
  loadInCtx('schwarz/schwarz-forward.js');            // augments module.exports.Schwarz
  const Schwarz = ctx.module.exports.Schwarz;

  loadInCtx('param-slice/param-slice-common.js');     // REASSIGNS module.exports → its API
  const PS = ctx.module.exports;

  loadInCtx('sphere/sphere-common.js');               // REASSIGNS module.exports → { SphereCommon }
  const SC = ctx.module.exports.SphereCommon;

  loadInCtx('primary-solver-worker.js', { replaceSelf: true });   // attaches QD_NS.PrimarySolverWorker
  const PSW = QD_NS.PrimarySolverWorker;
  loadInCtx('schwarz/schwarz-cpu-worker.js', { replaceSelf: true }); // attaches QD_NS.SchwarzCpuWorker
  const SCW = QD_NS.SchwarzCpuWorker;

  // param-slice-common and sphere-common REASSIGNED ctx.module.exports to their
  // own APIs (PS/SC were captured above). Restore it to the QD namespace, since
  // the old single-file suite ran most sections BEFORE those loaders and some
  // bodies still do `vm.runInContext('module.exports', ctx)` expecting QD.
  ctx.module.exports = QD_NS;

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
