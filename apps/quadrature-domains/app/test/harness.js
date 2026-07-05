'use strict';
// =============================================================================
// test/harness.js -- shared assertion harness for the split test suite.
//
// Counters live at module scope and are shared across every test file via
// Node's module cache (require returns the same instance), so the aggregate
// "N passed, M failed" tally is global no matter how many test files ran.
// Migrated verbatim from the old monolithic node-test.js (the ok/approxEq/
// pointInside definitions) so assertion behaviour is byte-for-byte identical.
// =============================================================================

let pass = 0, fail = 0;

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS  ' + name + (detail ? '  — ' + detail : '')); }
  else      { fail++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

function approxEq(a, b, tol = 1e-8) {
  if (typeof a === 'number') return Math.abs(a - b) < tol;
  return Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;
}

// Even-odd ray-cast point-in-polygon (used by the family batteries' insideTest).
function pointInside(pts, x, y) {
  let c = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    if ((pts[i].im > y) !== (pts[j].im > y)) {
      const t = (y - pts[i].im) / (pts[j].im - pts[i].im);
      if (pts[i].re + t * (pts[j].re - pts[i].re) > x) c++;
    }
  }
  return (c % 2) === 1;
}

// Optional visual divider between subsystem files in the console output.
function section(title) { console.log('\n========== ' + title + ' =========='); }

function report() { return { pass, fail }; }

module.exports = { ok, approxEq, pointInside, section, report };
