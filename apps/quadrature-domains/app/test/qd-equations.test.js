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

  // ---- φ(0) selection (opts.w0): fix the Riemann-map center in the equations.
  //      The exact ℚ(i) rationalization of the chosen w₀ is substituted for the
  //      w₀/w̄₀ symbols, dropping them from the parameter inventory. Oracle: the
  //      TRANSLATED cardioid Ω+¼ has the exact map φ(z) = ¼ + z + z²/2 (node a=¼,
  //      same C as the cardioid, w₀=¼; every value binary-exact). ----
  {
    const hData = { poles: [{ a: { re: 0.25, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }] };
    const phi = { unbounded: false, w0: { re: 0.25, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }, { re: 0.5, im: 0 }] }] };
    const free = QE.generateClassicalBounded(hData);
    ok('w0-fix: FREE system residual ≈0 at the exact translated-cardioid φ',
       QE.residualAtSolution(free, phi, hData).max < 1e-10);

    const fixed = QE.generateClassicalBounded(hData, { w0: { re: 0.25, im: 0 } });
    const allVars = new Set();
    for (const b of ['locator', 'star', 'gauge']) for (const it of fixed.blocks[b]) for (const v of it.eq.vars()) allVars.add(v);
    ok('w0-fix: no equation mentions w0/wb0 after fixing', !allVars.has('w0') && !allVars.has('wb0'));
    ok('w0-fix: params drop w0/wb0', fixed.vars.params.indexOf('w0') === -1 && fixed.vars.params.indexOf('wb0') === -1);
    ok('w0-fix: exact rationalization 0.25 → 1/4',
       !!fixed.w0Fixed && fixed.w0Fixed.re[0] === '1' && fixed.w0Fixed.re[1] === '4' && fixed.w0Fixed.im[0] === '0');
    ok('w0-fix: FIXED system residual ≈0 at the exact φ',
       QE.residualAtSolution(fixed, phi, hData).max < 1e-10);

    const rs = QE.reimSplit(fixed);
    ok('w0-fix: re/im split drops wx0/wy0 from params and carries w0Fixed',
       rs.vars.params.indexOf('wx0') === -1 && rs.vars.params.indexOf('wy0') === -1 && !!rs.w0Fixed);
    ok('w0-fix: split residual ≈0 at the exact φ',
       QE.residualReimAtSolution(rs, phi, hData).max < 1e-10);
    ok('w0-fix: systemToExport records the fixed value', QE.systemToExport(fixed).w0Fixed.re[1] === '4');

    // end-to-end: the SOLVER honors the same φ(0) selection (opts.w0), and the
    // fixed system verifies against that genuinely-solved normalization
    const sol = QD.solveInverseQD(hData, { w0: { re: 0.25, im: 0 } });
    ok('w0-fix: solver succeeded with the selected φ(0)', !!(sol && sol.success), sol && sol.error);
    if (sol && sol.success) {
      ok('w0-fix: solver honored φ(0) = 1/4',
         Math.hypot(sol.primary.phi.w0.re - 0.25, sol.primary.phi.w0.im) < 1e-12);
      const res = QE.residualAtSolution(fixed, sol.primary.phi, hData);
      ok('w0-fix: fixed-system residual ≈0 at the solver solution', res.max < 1e-6,
         'max=' + res.max.toExponential(2));
    }

    // rationalization: repeating decimals come back as the simple fractions
    const third = QE.generateClassicalBounded(hData, { w0: { re: 1 / 3, im: -2 / 7 } });
    ok('w0-fix: 1/3 and −2/7 rationalize exactly',
       third.w0Fixed.re.join('/') === '1/3' && third.w0Fixed.im.join('/') === '-2/7');
  }

  // ---- φ(0) fix at a COMPLEX center, residual-verified through the whole pipeline.
  //      Translating a domain by a complex shift Δ gives the exact map φ_Δ(z) =
  //      φ(z) + Δ with pole nodes a_j → a_j + Δ and w₀ → w₀ + Δ — so taking the disk
  //      (φ = z, w₀ = 0, one pole a = 0, C = R²) and Δ = 0.3 − 0.4·i yields an EXACT
  //      QD with a genuinely complex w₀. This exercises the wb0 ↦ conj substitution
  //      and the re/im split of complex constant coefficients — a sign error in
  //      either would leave the residual nonzero (the real-w₀ cases can't catch it). ----
  {
    // Translated disk of radius R: φ(z) = R·z + Δ ⇒ Riemann coeff A₁,₁ = R, node
    // a = Δ, C₁,₁ = R² = A·Ā, preimage z₁ = 0, w₀ = φ(0) = Δ.
    const R = 1.3, dRe = 0.3, dIm = -0.4;
    const hData = { poles: [{ a: { re: dRe, im: dIm }, principal: [{ re: R * R, im: 0 }] }] };
    const phi = { unbounded: false, w0: { re: dRe, im: dIm }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: R, im: 0 }] }] };
    const fixed = QE.generateClassicalBounded(hData, { w0: { re: dRe, im: dIm } });
    ok('w0-fix(complex): exact rationalization 0.3 − 0.4·i → 3/10, −2/5',
       fixed.w0Fixed.re.join('/') === '3/10' && fixed.w0Fixed.im.join('/') === '-2/5');
    ok('w0-fix(complex): no w0/wb0 in the fixed system', !(() => { const s = new Set(); for (const b of ['locator', 'star', 'gauge']) for (const it of fixed.blocks[b]) for (const v of it.eq.vars()) s.add(v); return s; })().has('wb0'));
    ok('w0-fix(complex): conjugate-model residual ≈0 at the exact φ',
       QE.residualAtSolution(fixed, phi, hData).max < 1e-10);
    ok('w0-fix(complex): re/im-split residual ≈0 at the exact φ (catches a conj/split sign error)',
       QE.residualReimAtSolution(QE.reimSplit(fixed), phi, hData).max < 1e-10);
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

  // ---- real-axis symmetry detection (auto-reality lever) ----
  {
    const realH = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] };
    const s1 = QE.realAxisSymmetry(realH);
    ok('realAxisSymmetry: all-real data ⇒ allReal & conjugationClosed', s1.allReal === true && s1.conjugationClosed === true);

    // a conjugate pole PAIR with conjugate principal parts: real-axis symmetric but NOT all-real
    const pairH = { poles: [
      { a: { re: 1, im: 2 }, principal: [{ re: 3, im: 1 }] },
      { a: { re: 1, im: -2 }, principal: [{ re: 3, im: -1 }] },
    ] };
    const s2 = QE.realAxisSymmetry(pairH);
    ok('realAxisSymmetry: conjugate pole pair ⇒ conjugationClosed but not allReal',
       s2.allReal === false && s2.conjugationClosed === true);

    // a lone complex pole with no conjugate partner: no symmetry
    const asym = { poles: [{ a: { re: 0, im: 1 }, principal: [{ re: 1, im: 0 }] }] };
    const s3 = QE.realAxisSymmetry(asym);
    ok('realAxisSymmetry: lone complex pole ⇒ neither allReal nor conjugationClosed',
       s3.allReal === false && s3.conjugationClosed === false);

    // a real pole but a COMPLEX principal coefficient ⇒ not all-real
    const cprin = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1, im: 0.5 }] }] };
    const s4 = QE.realAxisSymmetry(cprin);
    ok('realAxisSymmetry: real pole with complex principal ⇒ not allReal', s4.allReal === false);
  }

  // ---- isClassicalBounded gate (the shared predicate; the equation-card and Algebra-tab
  //      gates both delegate here, replacing two byte-identical private copies). ----
  {
    const hData = { poles: [{ a: { re: 0.5, im: 0 }, principal: [{ re: 0.2, im: 0 }] }] };
    const phiOk = { unbounded: false, family: 'boundedQD',
      branches: [{ z: { re: 0.3, im: 0 }, A: [{ re: 0.5, im: 0 }] }] };
    ok('isClassicalBounded: classical bounded φ (one branch per pole) ⇒ true',
       QE.isClassicalBounded(phiOk, hData) === true);
    ok('isClassicalBounded: missing hData/poles ⇒ false',
       QE.isClassicalBounded(phiOk, { poles: [] }) === false && QE.isClassicalBounded(phiOk, null) === false);
    ok('isClassicalBounded: unbounded φ ⇒ false',
       QE.isClassicalBounded({ ...phiOk, unbounded: true }, hData) === false);
    ok('isClassicalBounded: weighted-family markers (alpha/lqdBeta/z0/gamma/q) ⇒ false',
       QE.isClassicalBounded({ ...phiOk, alpha: 2 }, hData) === false &&
       QE.isClassicalBounded({ ...phiOk, lqdBeta: 1 }, hData) === false &&
       QE.isClassicalBounded({ ...phiOk, z0: { re: 0, im: 0 } }, hData) === false);
    ok('isClassicalBounded: branch count ≠ pole count ⇒ false',
       QE.isClassicalBounded({ ...phiOk, branches: [] }, hData) === false);
  }

  // ---- order-n point-functional generalization (#5). The A&S order-2 builder generalized
  //      to a degree-n map φ=Σ w_k z^k with an order-n point functional ∫f dA = Σ M_p f^{(p)}(0):
  //      p!·M_p = Σ_{a=p}^{n-1} [z^a](φ^p φ′)·w̄_{a+1}. n=2 is unchanged (A&S); n≥3 is new. ----
  {
    const S = QD.Sym, mv = S.mpolyVar, mi = S.mpolyInt;

    // backward-compat: default order 2 = the A&S system (var/param/poly shape unchanged).
    const s2 = QE.pointFunctionalSystem();
    ok('pointFunctionalSystem order-2 default: vars [w1,u2,v2], params [M0,m1,n1], 3 polys',
       s2.vars.join(',') === 'w1,u2,v2' && s2.params.join(',') === 'M0,m1,n1' && s2.polys.length === 3);

    // order 3: degree-3 map ⇒ 2n−1 = 5 real eqns in 5 unknowns; params M0,m1,n1,m2,n2.
    const s3 = QE.pointFunctionalSystem(null, { order: 3 });
    ok('pointFunctionalSystem order-3: vars [w1,u2,v2,u3,v3], 5 polys, params M0,m1,n1,m2,n2',
       s3.vars.join(',') === 'w1,u2,v2,u3,v3' && s3.polys.length === 5 && s3.params.join(',') === 'M0,m1,n1,m2,n2');

    // the p=0 equation is exactly the polynomial-image AREA law  M₀ = Σ_k k|w_k|².
    const area = mv('M0').sub(mv('w1').pow(2))
      .sub(mv('u2').pow(2).add(mv('v2').pow(2)).mul(mi(2)))
      .sub(mv('u3').pow(2).add(mv('v3').pow(2)).mul(mi(3)));
    ok('order-3 p=0 equation = area law  M₀ − (w₁²+2|w₂|²+3|w₃|²)', s3.polys[0].equals(area));

    // order 4: shape only (degree-4 ⇒ 7 eqns / 7 unknowns).
    const s4 = QE.pointFunctionalSystem(null, { order: 4 });
    ok('pointFunctionalSystem order-4: 7 vars / 7 polys',
       s4.vars.length === 7 && s4.polys.length === 7 && s4.params.join(',') === 'M0,m1,n1,m2,n2,m3,n3');

    // INDEPENDENT numeric oracle: take a concrete degree-3 φ, compute its moments M_p by a
    // 2-D disk quadrature of ∫_𝔻 φ^p|φ′|² dA (area-normalized π→1) — NO symbolic input — then
    // build the system from those numbers and confirm it VANISHES at that φ's real coords.
    // This checks the moment identities AND the convolution / reim-split code at once.
    {
      const w = [null, { re: 1, im: 0 }, { re: 0.3, im: -0.15 }, { re: -0.2, im: 0.1 }];  // w₁ real gauge
      const n = 3;
      const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
      const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
      const phi = (z) => { let s = { re: 0, im: 0 }, zp = { re: 1, im: 0 }; for (let k = 1; k <= n; k++) { zp = cmul(zp, z); s = cadd(s, cmul(w[k], zp)); } return s; };
      const dphi = (z) => { let s = { re: 0, im: 0 }, zp = { re: 1, im: 0 }; for (let k = 1; k <= n; k++) { s = cadd(s, cmul({ re: k * w[k].re, im: k * w[k].im }, zp)); zp = cmul(zp, z); } return s; };
      const NR = 600, NT = 720;
      const M = [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }];
      for (let i = 0; i < NR; i++) {
        const r = (i + 0.5) / NR;
        for (let j = 0; j < NT; j++) {
          const t = 2 * Math.PI * (j + 0.5) / NT;
          const z = { re: r * Math.cos(t), im: r * Math.sin(t) };
          const dp = dphi(z);
          const wgt = (dp.re * dp.re + dp.im * dp.im) * r * (1 / NR) * (2 * Math.PI / NT);
          let php = { re: 1, im: 0 };
          for (let p = 0; p < n; p++) { M[p] = cadd(M[p], { re: php.re * wgt, im: php.im * wgt }); php = cmul(php, phi(z)); }
        }
      }
      const fact = [1, 1, 2];
      for (let p = 0; p < n; p++) { M[p] = { re: M[p].re / Math.PI / fact[p], im: M[p].im / Math.PI / fact[p] }; }
      ok('order-3 numeric oracle: M₀ (the area) is real', Math.abs(M[0].im) < 1e-6);
      const sys = QE.pointFunctionalSystem({ M0: M[0].re, M1: M[1], M2: M[2] }, { order: 3 });
      const vmap = { w1: { re: 1, im: 0 }, u2: { re: w[2].re, im: 0 }, v2: { re: w[2].im, im: 0 }, u3: { re: w[3].re, im: 0 }, v3: { re: w[3].im, im: 0 } };
      let worst = 0;
      for (const p of sys.polys) { const v = p.evalComplex(vmap); worst = Math.max(worst, Math.abs(v.re), Math.abs(v.im)); }
      ok('order-3 numeric oracle: disk-quadrature moments ⇒ system vanishes at the true φ',
         worst < 1e-3, 'worst=' + worst.toExponential(2));
    }
  }

  // ---- Schwarz-function formulation (generateSchwarzBounded): the σ-principal-parts
  //      ALTERNATIVE to the forward (★). Same {z_j,A_{j,k}} variety, algebraically
  //      different (★_S) block (matches C_{j,s} to the Schwarz function's principal
  //      parts at a_j=φ(z_j) via series reversion). Oracle: residual ≈0 at the true φ. ----
  {
    ok('generateSchwarzBounded is exposed', typeof QE.generateSchwarzBounded === 'function');

    // order-2 translated cardioid: φ(z)=¼+z+z²/2 — exact, no solver needed.
    const hData = { poles: [{ a: { re: 0.25, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }] };
    const phi = { unbounded: false, w0: { re: 0.25, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }, { re: 0.5, im: 0 }] }] };
    const sw = QE.generateSchwarzBounded(hData);
    const cl = QE.generateClassicalBounded(hData);

    ok('schwarz: formulation tag', sw.formulation === 'schwarz');
    ok('schwarz: same equation counts as classical (●+★_S+gauge)',
       sw.blocks.locator.length === cl.blocks.locator.length &&
       sw.blocks.star.length === cl.blocks.star.length &&
       sw.blocks.gauge.length === cl.blocks.gauge.length);
    ok('schwarz: ORACLE — residual ≈0 at the exact cardioid φ',
       QE.residualAtSolution(sw, phi, hData).max < 1e-10);
    ok('schwarz: classical residual also ≈0 (same variety)',
       QE.residualAtSolution(cl, phi, hData).max < 1e-10);

    // genuine alternate presentation: at least one (★_S) poly differs from the (★) poly.
    let differ = false;
    for (let i = 0; i < sw.blocks.star.length; i++) {
      if (!sw.blocks.star[i].eq.equals(cl.blocks.star[i].eq)) differ = true;
    }
    ok('schwarz: (★_S) polynomials differ from (★) (not the same equations)', differ);
    // locator + gauge are reused verbatim (identical polys).
    ok('schwarz: locator/gauge blocks identical to classical (reused verbatim)',
       sw.blocks.locator[0].eq.equals(cl.blocks.locator[0].eq) &&
       sw.blocks.gauge[0].eq.equals(cl.blocks.gauge[0].eq));

    // re/im split composes with the Schwarz system.
    ok('schwarz: reim-split residual ≈0 at the exact φ',
       QE.residualReimAtSolution(QE.reimSplit(sw), phi, hData).max < 1e-10);

    // φ(0) fix composes: the FIXED Schwarz system drops w0/wb0 and still verifies.
    const swFixed = QE.generateSchwarzBounded(hData, { w0: { re: 0.25, im: 0 } });
    const sv = new Set();
    for (const b of ['locator', 'star', 'gauge']) for (const it of swFixed.blocks[b]) for (const v of it.eq.vars()) sv.add(v);
    ok('schwarz: φ(0)-fixed system mentions no w0/wb0', !sv.has('w0') && !sv.has('wb0'));
    ok('schwarz: φ(0)-fixed residual ≈0 at the exact φ',
       QE.residualAtSolution(swFixed, phi, hData).max < 1e-10);

    // simple-pole sanity: the disk h=1/w (order 1) ⇒ C_{1,1}=|φ′(z₁)|², residual ≈0.
    const hd2 = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
    const phi2 = { unbounded: false, w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }] }] };
    ok('schwarz: unit-disk (simple pole) residual ≈0', QE.residualAtSolution(QE.generateSchwarzBounded(hd2), phi2, hd2).max < 1e-10);

    // negative control: a perturbed φ makes the Schwarz residual large (the oracle bites).
    const bad = { unbounded: false, w0: { re: 0.25, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1.2, im: 0 }, { re: 0.5, im: 0 }] }] };
    ok('schwarz: residual is LARGE at a perturbed φ (oracle is discriminating)',
       QE.residualAtSolution(sw, bad, hData).max > 1e-3);

    // end-to-end with the genuine numeric solver (no hand-built φ): cardioid h.
    const sol = QD.solveInverseQD(hData, { w0: { re: 0.25, im: 0 } });
    if (sol && sol.success) {
      ok('schwarz: residual ≈0 at the SOLVER solution (cardioid)',
         QE.residualAtSolution(swFixed, sol.primary.phi, hData).max < 1e-6);
    }
  }
};

function scrub(o) {
  const out = {};
  for (const k in o) out[k] = o[k].toExponential(2);
  return out;
}
