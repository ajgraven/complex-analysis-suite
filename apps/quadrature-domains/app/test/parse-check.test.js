'use strict';
// Parse-check battery (rewritten at the Phase-2 flip). The classic PAGE_SCRIPTS /
// asset-manifest.js / sw.js graph it used to `new vm.Script`-check is retired; the page is
// now the ESM `main.mjs` graph. So this syntax-validates every app **.mjs** via `node --check`
// — which catches a broken file even when no test imports it (the browser-only UI twins:
// ui.mjs, the *-ui.mjs, schwarz-paint/render/…). Import RESOLUTION is covered separately by
// `vite build` + the suite's imports; this is the fast syntax gate. Plus a targeted ui.mjs
// regression guard. `ok` is a bootstrap global.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');

function listMjs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|disabled/.test(e.name)) listMjs(p, out); }
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

module.exports = async function run() {
  const files = listMjs(APP_DIR);
  ok('parse-check: found the app .mjs graph', files.length > 50, 'found ' + files.length);

  let bad = 0;
  for (const abs of files) {
    try {
      execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
    } catch (e) {
      bad++;
      ok('parse-check ' + path.relative(APP_DIR, abs).replace(/\\/g, '/'), false,
         String((e && e.stderr) || e).split('\n').slice(0, 2).join(' '));
    }
  }
  ok('parse-check: all ' + files.length + ' app .mjs parse under `node --check`', bad === 0, bad + ' failed');

  // Regression guard (review item 1): the canonical poly-part state field is
  // `state.polyCoeffs` (two f's). A `state.polyCoefs` (one f) write is a silent no-op —
  // renderPolyCoefList() reads `polyCoeffs`, so loaded coefficients are dropped.
  const uiSrc = fs.readFileSync(path.join(APP_DIR, 'ui', 'ui.mjs'), 'utf8');
  const hasTypo = /\bstate\.polyCoefs\b/.test(uiSrc);       // one 'f' — the bug
  const hasCanonical = /\bstate\.polyCoeffs\b/.test(uiSrc); // two 'f' — correct
  ok('ui.mjs uses state.polyCoeffs (no single-f typo)', !hasTypo && hasCanonical,
    hasTypo ? 'found state.polyCoefs (one f) — silent drop of poly coeffs' : '');
};
