'use strict';
// riemann.test.js — subsystem tests split from the former monolithic node-test.js (Phase 2).
// Shared kernels + harness (ok, C, T, solveInverseQD, Schwarz, PS, SC, …) are
// installed on `global` by test/bootstrap.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {
// QD.RiemannLatex.build(phi) (riemann-latex.js) generates the symbolic +
// closed-form LaTeX for the Riemann-map card. KaTeX 0.16.x rejects some
// constructs (e.g. the `\\[2pt]` row separator), and the UI renders with
// throwOnError:false — so a bad string renders a red error node instead of
// throwing, which is invisible without a guard (this exact bug shipped once).
// Here we render every family's build() output with throwOnError:TRUE and
// assert it parses. Requires the `katex` devDependency; skipped cleanly if
// absent (mirrors the optional-mathjs pattern).
// =============================================================================
{
  let katexLib = null;
  try { katexLib = require('katex'); } catch (e) { katexLib = null; }
  if (!katexLib) {
    ok('RiemannLatex KaTeX smoke (katex not installed — skipped)', true);
  } else {
    const RL = QD_NS.RiemannLatex;
    const br = (z, ...A) => ({ z, A });
    const c0 = (re, im) => ({ re, im });
    // One representative φ per family. Field shapes match a solved φ; the values
    // are illustrative — this checks LaTeX generation + KaTeX parsing, not the
    // solver. (`boundedQD`/`unboundedQD` route through the `_boundedQD`/
    // `_unboundedQD` fragments exactly as a real solved φ does.)
    const phis = {
      boundedQD: { family: 'boundedQD', unbounded: false, w0: c0(0.3, -0.1),
        branches: [ br(c0(0, 0), c0(1, 0)),                          // z=0 → denom collapses
                    br(c0(0.4, 0.2), c0(0.5, -0.3), c0(0.1, 0)) ] }, // 2nd-order pole ⇒ Σ_{j,k}
      unboundedQD: { family: 'unboundedQD', unbounded: true, c: 0.8,
        polyA: [ c0(0.2, 0), c0(0.1, -0.1) ], branches: [ br(c0(2, 0), c0(0.5, 0)) ] },
      powerQD: { family: 'powerQD', unbounded: false, alpha: 2, w0: c0(0.6, 0.2),
        branches: [ br(c0(0.3, 0), c0(0.4, 0.1)) ] },
      powerQD_singular: { family: 'powerQD_singular', unbounded: false, alpha: 2,
        w0: c0(0.5, 0), z0: c0(0.4, 0.1), branches: [ br(c0(0.3, 0), c0(0.4, 0)) ] },
      unboundedPQD: { family: 'unboundedPQD', unbounded: true, alpha: 2, c: 0.7,
        polyA: [ c0(0.2, 0) ], branches: [ br(c0(2, 0), c0(0.5, 0)) ] },
      unboundedPQD_singular: { family: 'unboundedPQD_singular', unbounded: true, alpha: 2,
        c: 0.7, z0: c0(2, 0.3), branches: [ br(c0(2.2, 0), c0(0.5, 0)) ] },
      boundedLQD: { family: 'boundedLQD', unbounded: false, w0: c0(0.5, 0),
        branches: [ br(c0(0.3, 0.1), c0(0.4, -0.2)) ] },
      boundedLQD_singular: { family: 'boundedLQD_singular', unbounded: false,
        gamma: c0(0.6, 0), z0: c0(0.4, 0), q: c0(0.1, 0),
        branches: [ br(c0(0.3, 0), c0(0.4, 0)) ] },
      unboundedLQD: { family: 'unboundedLQD', unbounded: true, c: 0.8,
        branches: [ br(c0(2, 0), c0(0.5, 0.2)) ] },
      unboundedLQD_singular: { family: 'unboundedLQD_singular', unbounded: true, c: 0.8,
        z0: c0(2, 0), q: c0(0.1, 0), branches: [ br(c0(2.2, 0), c0(0.5, 0)) ] },
    };
    for (const fam of Object.keys(phis)) {
      let built = null, berr = '';
      try { built = RL.build(phis[fam]); } catch (e) { berr = 'build: ' + e.message; }
      ok('RiemannLatex build ' + fam, !!built, berr);
      if (!built) continue;
      const pieces = [built.symbolic, built.numeric, ...built.params.map(p => p.name)];
      let bad = '';
      for (const tex of pieces) {
        try { katexLib.renderToString(tex, { displayMode: true, throwOnError: true }); }
        catch (e) { bad = e.message.split('\n')[0] + '  «' + String(tex).slice(0, 48) + '»'; break; }
      }
      ok('RiemannLatex KaTeX parse ' + fam, !bad, bad);
    }
  }
}

// =============================================================================
};
