'use strict';
// worker-graph-cleanrealm.test.js — guards the production solver worker graph
// against a bug class the rest of the suite cannot see: an ESM module that uses
// a kernel (Complex, Taylor, …) WITHOUT importing it.
//
// Why a separate process: every other *.test.js runs after test/bootstrap
// installs the kernels on globalThis (node-test.js:19 — "each file's run() only
// reads already-resolved globals"). Native-ESM free-variable lookup falls
// through to globalThis, so a missing import is silently backfilled by the
// leaked global — while the browser's bundled worker, which has no such global,
// throws "ReferenceError: Complex is not defined" (the powerQD / bounded-PQD
// regression this guards). We therefore CANNOT catch it in-process; we spawn a
// fresh `node` on worker-graph-cleanrealm.child.mjs, which imports the graph and
// runs one solve per family in an unpolluted realm, and assert it exits cleanly.
const path = require('path');
const { execFileSync } = require('child_process');

module.exports = async function run() {
  const child = path.join(__dirname, 'worker-graph-cleanrealm.child.mjs');
  let out = '';
  let passed = false;
  let err = '';
  try {
    out = execFileSync(process.execPath, [child], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    passed = /CLEANREALM_OK \d+/.test(out);
  } catch (e) {
    // Non-zero exit (e.g. a ReferenceError from a missing kernel import) lands here.
    err = ((e.stderr || '') + (e.stdout || '')).trim() || (e && e.message) || String(e);
  }

  ok(
    'worker graph imports + solves in a clean realm (no kernel-global leak)',
    passed,
    passed ? '' : (err || 'no CLEANREALM_OK marker; child output: ' + String(out).trim()),
  );

  const m = String(out).match(/CLEANREALM_OK (\d+)/);
  const n = m ? parseInt(m[1], 10) : 0;
  ok('clean-realm child exercised ≥ 4 family solves', n >= 4, 'ran ' + n);
};
