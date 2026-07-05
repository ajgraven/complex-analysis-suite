'use strict';
// =============================================================================
// thesis-examples tests — every curated example, when solved, reproduces its
// ANALYTIC ORACLE (#8). Validates both the example configs and the checkOracle
// engine, and locks the canonical numbers as regression anchors.
// =============================================================================
require('./bootstrap');
loadInCtx('ui-strings.js');      // QD.Strings (example blurbs) — before thesis-examples.js
loadInCtx('observables.js');     // boundaryObservables / harmonicMeasure / estimateAccuracy
loadInCtx('solver-cmax.js');     // estimateMaxConformalRadius
loadInCtx('symmetry.js');        // detectSymmetry
loadInCtx('thesis-examples.js'); // ThesisExamples + checkOracle

function fmt(x) {
  if (typeof x === 'number') {
    return (Math.abs(x) >= 1e4 || (x !== 0 && Math.abs(x) < 1e-3))
      ? x.toExponential(2) : String(+(+x).toPrecision(5));
  }
  return String(x);
}

module.exports = async function run() {
  section('thesis-examples — analytic oracles');

  ok('ThesisExamples exposed', Array.isArray(QD.ThesisExamples) && QD.ThesisExamples.length >= 6,
     'n=' + (QD.ThesisExamples ? QD.ThesisExamples.length : 0));
  ok('checkOracle exposed', typeof QD.checkOracle === 'function');
  ok('thesisExampleHData exposed', typeof QD.thesisExampleHData === 'function');

  const solveOptsFor = (ex) => ex.mode === 'unbounded'
    ? { unbounded: true, c: ex.c, identityTol: 1e-6, identitySamples: 2000 }
    : {};

  for (const ex of QD.ThesisExamples) {
    const hData = QD.thesisExampleHData(ex);
    const sol = QD.solveInverseQD(hData, solveOptsFor(ex));
    ok('[' + ex.id + '] solves', !!(sol && sol.success && sol.primary),
       sol && sol.success ? '' : (sol && sol.error));
    if (!(sol && sol.success)) continue;

    const phi = sol.primary.phi;
    const includeCmax = !!(ex.oracle && ex.oracle.cMax != null);
    const { rows, allPass } = await QD.checkOracle(phi, hData, ex.oracle,
      { includeCmax, solveFn: QD.solveInverseQD });

    ok('[' + ex.id + '] oracle produced rows', rows.length > 0, 'rows=' + rows.length);
    for (const r of rows) {
      ok('[' + ex.id + '] ' + r.name + ': exp ' + fmt(r.expected) + ' / got ' + fmt(r.computed),
         r.status !== 'fail',
         'status=' + r.status + (typeof r.relErr === 'number' ? ' relErr=' + r.relErr.toExponential(2) : ''));
    }
    ok('[' + ex.id + '] all oracle rows pass', allPass);
  }
};
