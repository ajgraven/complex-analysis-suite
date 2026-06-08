'use strict';
// =============================================================================
// qd-equations tests — the classical bounded-QD symbolic system (QD.QDEquations).
// Correctness is checked by the RESIDUAL ORACLE: every generated equation,
// evaluated at the solver's numeric φ (+ numeric h), must be ≈0. No hand-derived
// expected polynomials — the proven numeric path is the ground truth.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('qd-equations.js');

module.exports = async function run() {
  section('qd-equations — classical bounded QD symbolic system');
  const QE = QD.QDEquations;
  ok('QD.QDEquations exposed', !!QE && typeof QE.generateClassicalBounded === 'function');

  // ---- Disk: single simple pole at 0, principal C_{1,1} = R^2 ----
  {
    const R = 1.4;
    const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: R * R, im: 0 }] }] };
    const sys = QE.generateClassicalBounded(hData);
    ok('disk: blocks 1 locator / 1 star / 1 gauge',
       sys.blocks.locator.length === 1 && sys.blocks.star.length === 1 && sys.blocks.gauge.length === 1);
    ok('disk: counts n=1 d=1, 5 real eqns / 4 real unknowns',
       sys.n === 1 && sys.d === 1 && sys.counts.realEquations === 5 && sys.counts.realUnknowns === 4);
    ok('disk: every equation is a non-trivial MPoly',
       sys.blocks.locator[0].eq && !sys.blocks.locator[0].eq.isZero() && !sys.blocks.star[0].eq.isZero());
    const sol = QD.solveInverseQD(hData, {});
    ok('disk: solver succeeded', !!(sol && sol.success), sol && sol.error);
    if (sol && sol.success) {
      const res = QE.residualAtSolution(sys, sol.primary.phi, hData);
      ok('disk: residual ≈0 at numeric solution', res.max < 1e-6,
         'max=' + res.max.toExponential(2) + ' perBlock=' + JSON.stringify(scrub(res.perBlock)));
      const rs = QE.reimSplit(sys);
      ok('disk: re/im split → model reim, 5 real eqns / 4 real unknowns',
         rs.model === 'reim' && rs.counts.realEquations === 5 && rs.counts.realUnknowns === 4);
      ok('disk: gauge Re part dropped (purely imaginary) → 1 gauge real eqn',
         rs.blocks.gauge.length === 1 && rs.blocks.gauge[0].part === 'im');
      const rres = QE.residualReimAtSolution(rs, sol.primary.phi, hData);
      ok('disk: re/im residual ≈0 at numeric solution', rres.max < 1e-6,
         'max=' + rres.max.toExponential(2));
    }
  }

  // ---- Symmetric two-point: simple poles at ±0.5, C_{j,1}=1 ----
  {
    const hData = { poles: [
      { a: { re: -0.5, im: 0 }, principal: [{ re: 1, im: 0 }] },
      { a: { re: 0.5, im: 0 }, principal: [{ re: 1, im: 0 }] },
    ] };
    const sys = QE.generateClassicalBounded(hData);
    ok('two-pt: blocks 2 locator / 2 star / 1 gauge',
       sys.blocks.locator.length === 2 && sys.blocks.star.length === 2 && sys.blocks.gauge.length === 1);
    ok('two-pt: 9 real eqns / 8 real unknowns',
       sys.counts.realEquations === 9 && sys.counts.realUnknowns === 8);
    const sol = QD.solveInverseQD(hData, {});
    ok('two-pt: solver succeeded', !!(sol && sol.success), sol && sol.error);
    if (sol && sol.success) {
      const res = QE.residualAtSolution(sys, sol.primary.phi, hData);
      ok('two-pt: residual ≈0 at numeric solution', res.max < 1e-6,
         'max=' + res.max.toExponential(2) + ' perBlock=' + JSON.stringify(scrub(res.perBlock)));
      const rs = QE.reimSplit(sys);
      ok('two-pt: re/im split → 9 real eqns / 8 real unknowns',
         rs.counts.realEquations === 9 && rs.counts.realUnknowns === 8);
      const rres = QE.residualReimAtSolution(rs, sol.primary.phi, hData);
      ok('two-pt: re/im residual ≈0 at numeric solution', rres.max < 1e-6,
         'max=' + rres.max.toExponential(2));
    }
  }

  // ---- Imaginary-axis conjugate pole pair (the ±0.5 case rotated 90°): a valid
  //      QD with COMPLEX poles → complex z_j / A_{j,1}, exercising the conjugate
  //      variables with non-real values. ----
  {
    const hData = { poles: [
      { a: { re: 0, im: 0.5 }, principal: [{ re: 1, im: 0 }] },
      { a: { re: 0, im: -0.5 }, principal: [{ re: 1, im: 0 }] },
    ] };
    const sys = QE.generateClassicalBounded(hData);
    const sol = QD.solveInverseQD(hData, {});
    ok('imag-pair: solver succeeded', !!(sol && sol.success), sol && sol.error);
    if (sol && sol.success) {
      const z1 = sol.primary.phi.branches[0].z;
      ok('imag-pair: preimage z_1 is genuinely complex (conjugate vars exercised)',
         Math.abs(z1.im) > 1e-3, 'z1.im=' + z1.im.toExponential(2));
      const res = QE.residualAtSolution(sys, sol.primary.phi, hData);
      ok('imag-pair: residual ≈0 at numeric solution', res.max < 1e-6,
         'max=' + res.max.toExponential(2));
      const rs = QE.reimSplit(sys);
      const rres = QE.residualReimAtSolution(rs, sol.primary.phi, hData);
      ok('imag-pair: re/im residual ≈0 at numeric solution (complex poles)', rres.max < 1e-6,
         'max=' + rres.max.toExponential(2));
    }
  }

  // ---- HIGHER-ORDER classical poles, forward (★) form + factored-denominator
  //      engine. φ(z) = z + z^n/n (single order-n pole at the origin) ⇒
  //      h(w) = ((n+1)/n)/w + (1/n)/w^n. n=3 is the user's φ=z+z^3/3,
  //      h=(4/3)/w+(1/3)/w^3. Exact-φ residual oracle (no solver); verifies the
  //      engine through order 6 (compact + sub-second thanks to factored dens). ----
  {
    for (const nn of [2, 3, 4, 5, 6]) {
      const A = [], principal = [];
      for (let k = 1; k <= nn; k++) {
        A.push({ re: k === 1 ? 1 : (k === nn ? 1 / nn : 0), im: 0 });
        principal.push({ re: k === 1 ? (nn + 1) / nn : (k === nn ? 1 / nn : 0), im: 0 });
      }
      const phi = { unbounded: false, w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A }] };
      const hData = { poles: [{ a: { re: 0, im: 0 }, principal }] };
      const sys = QE.generateClassicalBounded(hData);
      ok('order-' + nn + ': d=' + nn + ', single order-' + nn + ' pole',
         sys.d === nn && sys.blocks.star.length === nn);
      const res = QE.residualAtSolution(sys, phi, hData);
      ok('order-' + nn + ' φ=z+z^' + nn + '/' + nn + ': residual ≈0 at exact φ',
         res.max < 1e-10, 'max=' + res.max.toExponential(2));
    }
    // Complexity guard: a pole beyond the default cap (6) throws instead of hanging.
    const big = []; for (let k = 0; k < 8; k++) big.push({ re: k === 0 ? 1 : 0, im: 0 });
    let threw = false;
    try { QE.generateClassicalBounded({ poles: [{ a: { re: 0, im: 0 }, principal: big }] }); }
    catch (e) { threw = true; }
    ok('order-8 (beyond default cap 6) throws a clear error rather than hanging', threw);
  }

  // ---- Re/im split FAITHFULNESS. At an ARBITRARY (non-solution) reality-sliced
  //      point, each conjugate-model equation E must equal (Re-part) + i·(Im-part)
  //      of its split, evaluated at the matching real point. This proves the
  //      substitution + coefficient split is algebraically faithful to E — a check
  //      independent of any solution being ≈0 (where 0 ≈ 0 would be trivially true).
  {
    const faithful = (label, hData, phi) => {
      const sys = QE.generateClassicalBounded(hData);
      const rs = QE.reimSplit(sys);
      const cvm = QE.buildVarMap(phi, hData);      // conjugate vars (reality slice)
      const rvm = QE.buildRealVarMap(phi, hData);  // matching real vars
      let worst = 0;
      for (const blk of ['locator', 'star', 'gauge']) {
        for (const { label: src, eq } of sys.blocks[blk]) {
          const cval = eq.evalComplex(cvm);
          const reE = rs.blocks[blk].find((x) => x.source === src && x.part === 're');
          const imE = rs.blocks[blk].find((x) => x.source === src && x.part === 'im');
          const reV = reE ? reE.eq.evalComplex(rvm).re : 0;
          const imV = imE ? imE.eq.evalComplex(rvm).re : 0;
          worst = Math.max(worst, Math.abs(cval.re - reV), Math.abs(cval.im - imV));
        }
      }
      ok(label + ': conjugate eqn == Re + i·Im of split at an arbitrary point',
         worst < 1e-9, 'worst=' + worst.toExponential(2));
    };

    faithful('faithful-disk',
      { poles: [{ a: { re: 0.7, im: -0.1 }, principal: [{ re: 0.2, im: 0.3 }] }] },
      { unbounded: false, w0: { re: 0.1, im: -0.2 },
        branches: [{ z: { re: 0.3, im: 0.4 }, A: [{ re: 0.5, im: 0.6 }] }] });

    faithful('faithful-two-pt',
      { poles: [
        { a: { re: 0.7, im: -0.1 }, principal: [{ re: 0.2, im: 0.3 }] },
        { a: { re: -0.6, im: 0.2 }, principal: [{ re: -0.15, im: 0.25 }] },
      ] },
      { unbounded: false, w0: { re: 0.1, im: -0.2 }, branches: [
        { z: { re: 0.3, im: 0.15 }, A: [{ re: 0.4, im: -0.25 }] },
        { z: { re: -0.2, im: 0.35 }, A: [{ re: 0.05, im: 0.5 }] },
      ] });

    // n=1, order 3 — exercises the factored-denominator higher-order branches.
    faithful('faithful-order3',
      { poles: [{ a: { re: 0.2, im: 0.1 },
        principal: [{ re: 0.3, im: 0.2 }, { re: -0.1, im: 0.4 }, { re: 0.05, im: -0.15 }] }] },
      { unbounded: false, w0: { re: 0.1, im: 0 }, branches: [{ z: { re: 0.25, im: -0.1 },
        A: [{ re: 0.4, im: 0.1 }, { re: -0.2, im: 0.3 }, { re: 0.15, im: -0.05 }] }] });
  }

  // ---- LaTeX + export surfaces (consumed by the UI card and the future reducer).
  //      Verify they don't throw and carry the right structure on φ=z+z^3/3. ----
  {
    const hData = { poles: [{ a: { re: 0, im: 0 },
      principal: [{ re: 4 / 3, im: 0 }, { re: 0, im: 0 }, { re: 1 / 3, im: 0 }] }] };
    const sys = QE.generateClassicalBounded(hData);
    const lx = QE.systemToLatex(sys);
    ok('latex: conjugate system → 1 locator / 3 star / 1 gauge entries, each "… = 0"',
       lx.blocks.locator.length === 1 && lx.blocks.star.length === 3 && lx.blocks.gauge.length === 1 &&
       /= 0$/.test(lx.blocks.gauge[0].latex) && typeof lx.blocks.star[0].terms === 'number');
    ok('latex: gauge renders A_{1,1} − \\bar{A}_{1,1}',
       /A_\{1,1\}/.test(lx.blocks.gauge[0].latex) && /\\bar\{A\}_\{1,1\}/.test(lx.blocks.gauge[0].latex));
    ok('latex: locator mentions parameter a_{1}', /a_\{1\}/.test(lx.blocks.locator[0].latex));

    const rs = QE.reimSplit(sys);
    const rlx = QE.systemToLatex(rs);
    ok('latex: reim uses real-variable symbols (x_/p_/q_) and no conjugate bars',
       /[xpq]_\{/.test(rlx.blocks.locator[0].latex) && !/\\bar/.test(rlx.blocks.star[0].latex));

    const exp = QE.systemToExport(rs);
    ok('export: reim export carries model, one term list per equation, and re/im tags',
       exp.model === 'reim' && exp.equations.length === rs.counts.realEquations &&
       exp.equations.every((e) => Array.isArray(e.terms)) &&
       exp.equations.some((e) => e.part === 're') && exp.equations.some((e) => e.part === 'im'));
  }
};

function scrub(o) {
  const out = {};
  for (const k in o) out[k] = o[k].toExponential(2);
  return out;
}
