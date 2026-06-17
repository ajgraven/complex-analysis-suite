'use strict';
// =============================================================================
// sym-radical tests — solve one equation for one variable IN RADICALS
// (QD.SymRadical). The correctness ORACLE is numeric: for each case, every
// returned closed-form root, evaluated with the remaining variables set to
// several random sample values, must satisfy p ≈ 0 (verifyRoots). No
// hand-derived expected formulas — the numeric residual is the ground truth.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('sym-radical.js');

module.exports = async function run() {
  section('sym-radical — solve one variable in radicals');
  const S = QD.Sym, SR = QD.SymRadical;
  ok('QD.SymRadical exposed', !!SR && typeof SR.solveByRadicals === 'function');

  const x = S.mpolyVar('x');
  const V = (n) => S.mpolyVar(n);
  const I = (k) => S.mpolyInt(k);

  // Solve + verify every root by sampling the remaining vars; returns the result.
  function solveOK(label, poly, varName, expDegree, expCount) {
    const r = SR.solveByRadicals(poly, varName);
    ok(label + ': solvable (ok)', r.ok, r.reason);
    if (!r.ok) return r;
    const ver = SR.verifyRoots(poly, varName, r.roots, { samples: 6 });
    ok(label + ': every root verifies at random samples (residual ≈0)',
       ver.checked >= 4 && ver.maxResidual < 1e-6, 'checked=' + ver.checked + ' maxRel=' + ver.maxResidual.toExponential(2));
    if (expDegree != null) ok(label + ': degree ' + expDegree, r.degree === expDegree, 'got ' + r.degree);
    if (expCount != null) ok(label + ': ' + expCount + ' root(s)', r.roots.length === expCount, 'got ' + r.roots.length);
    return r;
  }

  // ---- linear / quadratic / cubic / quartic, fully symbolic coefficients ----
  solveOK('linear a·x+b', V('a').mul(x).add(V('b')), 'x', 1, 1);
  solveOK('quadratic a·x²+b·x+c', V('a').mul(x.pow(2)).add(V('b').mul(x)).add(V('c')), 'x', 2, 2);
  solveOK('cubic a·x³+b·x²+c·x+d (Cardano)',
    V('a').mul(x.pow(3)).add(V('b').mul(x.pow(2))).add(V('c').mul(x)).add(V('d')), 'x', 3, 3);
  solveOK('quartic a·x⁴+…+e (Ferrari)',
    V('a').mul(x.pow(4)).add(V('b').mul(x.pow(3))).add(V('c').mul(x.pow(2))).add(V('d').mul(x)).add(V('e')), 'x', 4, 4);

  // ---- the headline: x⁶ + b·x⁴ + c·x² + d  (a CUBIC in x²) -------------------
  const r6 = solveOK('x⁶+b·x⁴+c·x²+d (cubic in x²)',
    x.pow(6).add(V('b').mul(x.pow(4))).add(V('c').mul(x.pow(2))).add(V('d')), 'x', 6, 6);
  ok('x⁶ case reports the quasi-polynomial method', /quasi-polynomial/.test(r6.method || ''), r6.method);
  solveOK('biquadratic x⁴+p·x²+q (quadratic in x²)',
    x.pow(4).add(V('p').mul(x.pow(2))).add(V('q')), 'x', 4, 4);

  // ---- casus irreducibilis: irreducible/ℚ cubic with three REAL roots --------
  {
    const p = x.pow(3).sub(I(3).mul(x)).add(I(1));   // x³−3x+1, roots ≈ 1.532, 0.347, −1.879
    const r = SR.solveByRadicals(p, 'x');
    ok('casus irreducibilis: solved via Cardano', r.ok && /Cardano/.test(r.method || ''), r.reason || r.method);
    const vals = (r.roots || []).map((rt) => SR.evalRadical(rt, {}));
    ok('casus irreducibilis: three real roots recovered (imag ≈ 0) via complex radicals',
       vals.length === 3 && vals.every((z) => Math.abs(z.im) < 1e-9), JSON.stringify(vals.map((z) => z.re.toFixed(3))));
    const ver = SR.verifyRoots(p, 'x', r.roots, { samples: 1 });
    ok('casus irreducibilis: roots satisfy the cubic', ver.maxResidual < 1e-6, ver.maxResidual.toExponential(2));
  }

  // ---- factorization-based reduction ----------------------------------------
  // numeric quintic x⁵−1 → (x−1)·(quartic) ⇒ solvable per factor.
  {
    const r = solveOK('x⁵−1 (numeric; factors → linear · quartic)', x.pow(5).sub(I(1)), 'x', 5, 5);
    ok('x⁵−1 reports the factored method', /factored/.test(r.method || ''), r.method);
  }
  // a symbolic product (x²−a)(x−b) — separable/var-grouped factor split.
  solveOK('(x²−a)(x−b) factors', x.pow(2).sub(V('a')).mul(x.sub(V('b'))), 'x', 3, 3);

  // ---- honest Abel–Ruffini refusal for the irreducible quintic --------------
  {
    const r = SR.solveByRadicals(x.pow(5).add(V('b').mul(x)).add(V('c')), 'x');
    ok('irreducible quintic x⁵+b·x+c ⇒ ok:false (Abel–Ruffini, no false claim)',
       !r.ok && /Abel|radical reduction/i.test(r.reason || ''), r.reason);
  }

  // ---- degenerate inputs -----------------------------------------------------
  {
    const r = SR.solveByRadicals(V('a'), 'x');   // no x at all (nonzero constant)
    ok('constant in x (no root) ⇒ ok with 0 roots', r.ok && r.roots.length === 0, r.reason);
    // a perturbed "root" must FAIL the oracle (the verifier is discriminating)
    const q = V('a').mul(x.pow(2)).add(V('b').mul(x)).add(V('c'));
    const good = SR.solveByRadicals(q, 'x');
    const bogus = [SR.builders.rat(S.RatFn.fromInt(0))];   // x = 0 is not a root in general
    const ver = SR.verifyRoots(q, 'x', bogus, { samples: 4 });
    void good;
    ok('oracle is discriminating: a bogus root has large residual', ver.maxResidual > 1e-3, ver.maxResidual.toExponential(2));
  }

  // ---- LaTeX render ----------------------------------------------------------
  {
    const q = V('a').mul(x.pow(2)).add(V('b').mul(x)).add(V('c'));
    const r = SR.solveByRadicals(q, 'x');
    const tex = SR.radicalToLatex(r.roots[0], null, S);
    ok('radicalToLatex emits a \\sqrt and \\frac for the quadratic formula',
       /\\sqrt\{/.test(tex) && /\\frac\{/.test(tex), tex);
  }
};
