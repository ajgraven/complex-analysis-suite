'use strict';
// Asset-manifest anti-drift battery (Phase-1 release hardening; split out in
// Phase 2). Guards the single-source-of-truth invariants the index.html loader,
// SW, and cache-version generator depend on. Self-contained: evaluates
// asset-manifest.js in a vm and reads index.html. Note: the node-test loaders
// are no longer a hand-synced copy — test/bootstrap.js + parse-check.test.js
// now derive their file lists from this manifest. `ok` is a bootstrap global.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');

module.exports = async function run() {
  try {
    const appDir = APP_DIR;
    const sandbox = { self: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(appDir, 'asset-manifest.js'), 'utf8'),
                     sandbox, { filename: 'asset-manifest.js' });
    const M = sandbox.self.QD_ASSET_MANIFEST;
    ok('manifest: QD_ASSET_MANIFEST defined', !!M);

    // PAGE_SCRIPTS structure: worker bundle, then page-only solver files, then UI.
    const head = [...M.WORKER_BUNDLE_FILES, ...M.SOLVER_PAGE_ONLY_FILES];
    const headOK = head.every((f, i) => M.PAGE_SCRIPTS[i] === f);
    ok('manifest: PAGE_SCRIPTS begins with WORKER_BUNDLE_FILES + SOLVER_PAGE_ONLY_FILES', headOK);
    ok('manifest: PAGE_SCRIPTS = head + PAGE_UI_FILES (lengths)',
       M.PAGE_SCRIPTS.length === head.length + M.PAGE_UI_FILES.length);

    // Regression for the SW-precache omissions Phase 1 fixed.
    ok('manifest: ui-state.js in PAGE_SCRIPTS', M.PAGE_SCRIPTS.includes('ui-state.js'));
    ok('manifest: ui-state.js in ALL_ASSETS', M.ALL_ASSETS.includes('ui-state.js'));
    ok('manifest: asset-manifest.js in ALL_ASSETS', M.ALL_ASSETS.includes('asset-manifest.js'));

    // Every page script exists on disk.
    const missing = M.PAGE_SCRIPTS.filter(f => !fs.existsSync(path.join(appDir, f)));
    ok('manifest: every PAGE_SCRIPTS entry exists on disk', missing.length === 0,
       missing.length ? 'missing: ' + missing.join(', ') : '');

    // index.html must carry NO static same-origin module <script> tag except
    // asset-manifest.js — everything else is injected by the loader with ?v=.
    const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    const re = /<script\s+src="([^"]+)"/g; let mm; const staticJs = [];
    while ((mm = re.exec(html))) {
      const s = mm[1];
      if (/\.js$/.test(s) && !/^https?:/.test(s)) staticJs.push(s);
    }
    ok('index.html: only asset-manifest.js is a static module <script>',
       staticJs.length === 1 && staticJs[0] === 'asset-manifest.js',
       'static .js tags: ' + JSON.stringify(staticJs));

    // Committed CACHE_HASH must match a fresh recompute (reuse the real
    // generator so the test can't drift from it).
    const cp = require('child_process');
    let genOK = true, genMsg = '';
    try {
      cp.execFileSync('node', [path.join(appDir, '..', 'scripts', 'gen-cache-version.js'), '--check'],
                      { stdio: 'pipe' });
    } catch (e) { genOK = false; genMsg = String((e.stderr || e.stdout || e).toString()).trim().split('\n').pop(); }
    ok('manifest: committed CACHE_HASH is current (gen-cache-version --check)', genOK, genMsg);
  } catch (e) {
    ok('manifest anti-drift battery ran without error', false, String((e && e.stack) || e));
  }

  // Suite-size floor (runs last — manifest is the final TESTS entry). A mass
  // regression — a whole subsystem failing to load, or a run() early-returning —
  // would otherwise pass quietly with a silently shrunken count (assertions that
  // never run leave fail=0 → exit 0). This catches losing a whole section. The
  // floor is deliberately well below the true total (~1201); raise it only if the
  // suite legitimately grows a lot, lower it only on an intentional shrink.
  const { report } = require('./harness');
  const passSoFar = report().pass;   // all assertions so far, except this one
  ok('suite size floor: ≥ 1175 assertions ran (mass-regression guard)',
     passSoFar >= 1175, 'passSoFar=' + passSoFar);
};
