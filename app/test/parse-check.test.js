'use strict';
// parse-check tests — every browser-loaded JS file parses cleanly under Node.
// Split from the former monolithic node-test.js (Phase 2). The file list is now
// DERIVED from the manifest (PAGE_SCRIPTS + asset-manifest.js + sw.js) instead
// of a hand-synced copy — closing the old drift hazard.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');

module.exports = async function run() {
  // (2) PARSE-CHECK list — derived from the single source of truth. PAGE_SCRIPTS
  // already covers every page module (solvers, seeds, UI, schwarz, sphere,
  // param-slice, workers); add the two files the page loads outside the module
  // list (the manifest itself + the service worker).
  const sourceFiles = [...MANIFEST.PAGE_SCRIPTS, 'asset-manifest.js', 'sw.js'];
  for (const rel of sourceFiles) {
    const abs = path.join(APP_DIR, rel);
    if (!fs.existsSync(abs)) { ok('parse-check ' + rel + ' (missing file)', false); continue; }
    const src = fs.readFileSync(abs, 'utf8');
    let parsed = true, err = '';
    try { new vm.Script(src, { filename: rel }); }
    catch (e) { parsed = false; err = e.message; }
    ok('parse-check ' + rel, parsed, parsed ? '' : err.split('\n')[0]);
  }
  // Regression guard (review item 1): the canonical poly-part state field is
  // `state.polyCoeffs` (two f's). A `state.polyCoefs` (one f) write is a silent
  // no-op — renderPolyCoefList() reads `polyCoeffs`, so loaded coefficients are
  // dropped. This bit the Direct→QD cross-load path (_sendHToInverseTab).
  {
    const uiSrc = fs.readFileSync(path.join(APP_DIR, 'ui.js'), 'utf8');
    const hasTypo = /\bstate\.polyCoefs\b/.test(uiSrc);       // one 'f' — the bug
    const hasCanonical = /\bstate\.polyCoeffs\b/.test(uiSrc); // two 'f' — correct
    ok('ui.js uses state.polyCoeffs (no single-f typo)', !hasTypo && hasCanonical,
      hasTypo ? 'found state.polyCoefs (one f) — silent drop of poly coeffs' : '');
  }
  // P1.1 — ES module file. vm.Script doesn't understand ESM `export`; shell
  // out to `node --check` (which uses --input-type=module for .mjs).
  {
    const cp = require('child_process');
    const rel = 'qd.mjs';
    let parsed = true, err = '';
    try { cp.execSync('node --check ' + JSON.stringify(path.join(APP_DIR, rel)), { stdio: 'pipe' }); }
    catch (e) { parsed = false; err = String((e.stderr && e.stderr.toString()) || e.message || e); }
    ok('parse-check ' + rel + ' (ESM)', parsed, parsed ? '' : err.split('\n')[0]);
  }
};
