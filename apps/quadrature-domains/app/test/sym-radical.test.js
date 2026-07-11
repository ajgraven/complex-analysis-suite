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

  // ---- q=0 depressed-biquadratic quartic that REACHES Ferrari (regression) -----
  // x⁴+2x³+3x²+2x−10 is irreducible over ℚ(i) (factor path can't rescue) and has
  // ALL exponents present (gcd 1 ⇒ not the quasi-polynomial reduction), so it hits
  // solveQuartic; depression gives Ferrari's linear term q=0, whose resolvent has a
  // y=0 root. The old code took it (A=√(2y)=0 ⇒ q/(2A)=0/0), poisoning all 4 roots
  // with NaN while still reporting {ok:true, "quartic (Ferrari)"}. Now: 4 finite roots.
  {
    const p = x.pow(4).add(I(2).mul(x.pow(3))).add(I(3).mul(x.pow(2))).add(I(2).mul(x)).add(I(-10));
    const r = SR.solveByRadicals(p, 'x');
    ok('q=0 quartic: solvable (ok)', r.ok, r.reason);
    ok('q=0 quartic: 4 roots', (r.roots || []).length === 4, 'got ' + (r.roots || []).length);
    const vals = (r.roots || []).map((rt) => SR.evalRadical(rt, {}));
    ok('q=0 quartic: every root is FINITE (no 0/0 NaN)',
       vals.length === 4 && vals.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im)),
       JSON.stringify(vals));
    const ver = SR.verifyRoots(p, 'x', r.roots, { samples: 6 });
    ok('q=0 quartic: roots verify at random samples (residual ≈ 0)',
       ver.checked > 0 && ver.maxResidual < 1e-6, 'checked=' + ver.checked + ' maxRel=' + ver.maxResidual.toExponential(2));
    // library contract: a successful solve with roots must have MEASURED ≥1 sample —
    // never the silent {checked:0, maxResidual:0} that reads as a false "verified".
    ok('q=0 quartic: verify.checked>0 whenever ok && roots.length>0',
       !(r.ok && r.roots.length > 0) || ver.checked > 0, 'ok=' + r.ok + ' n=' + r.roots.length + ' checked=' + ver.checked);
  }

  // ---- p=0 depressed-pure-cubic that REACHES Cardano (regression, review H4) ----
  // x³+3x²+3x+3 = (x+1)³+2 is irreducible over ℚ(i) and depresses to t³+2 (p=0, q=2>0), so it hits
  // solveCubic's Cardano path. The old code computed u = ∛(−q/2+√((q/2)²)) = ∛0 = 0, then
  // t_k = ω^k·0 − p/(3·0) = 0/0 = NaN, poisoning all 3 roots while still reporting {ok:true}. Now: 3
  // FINITE roots (x = −1 + ∛(−2)·ω^k) — the p=0 guard mirrors solveQuartic's existing q=0 guard.
  {
    const p = x.pow(3).add(I(3).mul(x.pow(2))).add(I(3).mul(x)).add(I(3));
    const r = SR.solveByRadicals(p, 'x');
    ok('p=0 cubic: solvable (ok)', r.ok, r.reason);
    ok('p=0 cubic: 3 roots', (r.roots || []).length === 3, 'got ' + (r.roots || []).length);
    const vals = (r.roots || []).map((rt) => SR.evalRadical(rt, {}));
    ok('p=0 cubic: every root is FINITE (no 0/0 NaN)',
       vals.length === 3 && vals.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im)),
       JSON.stringify(vals));
    const ver = SR.verifyRoots(p, 'x', r.roots, { samples: 6 });
    ok('p=0 cubic: roots verify at random samples (residual ≈ 0)',
       ver.checked > 0 && ver.maxResidual < 1e-6, 'checked=' + ver.checked + ' maxRel=' + ver.maxResidual.toExponential(2));
  }

  // ---- verifyRoots hardening: all-non-finite roots ⇒ EXPLICIT refusal ----------
  {
    const q = V('a').mul(x.pow(2)).add(V('b').mul(x)).add(V('c'));
    // a deliberately poisoned root: 0/0 = NaN at every sample.
    const nan = SR.builders.div(SR.builders.rat(S.RatFn.fromInt(0)), SR.builders.rat(S.RatFn.fromInt(0)));
    const ver = SR.verifyRoots(q, 'x', [nan], { samples: 6 });
    ok('verifyRoots: all-non-finite roots ⇒ checked:0', ver.checked === 0, 'checked=' + ver.checked);
    ok('verifyRoots: all-non-finite roots ⇒ ok:false (not a silent maxResidual:0 pass)',
       ver.ok === false, JSON.stringify(ver));
    ok('verifyRoots: all-non-finite roots ⇒ allNonFinite:true', ver.allNonFinite === true, JSON.stringify(ver));
    // no false negatives: a healthy solve still verifies ok:true with checked>0.
    const good = SR.solveByRadicals(q, 'x');
    const vok = SR.verifyRoots(q, 'x', good.roots, { samples: 4 });
    ok('verifyRoots: healthy roots ⇒ ok:true, checked>0', vok.ok === true && vok.checked > 0, JSON.stringify(vok));
  }

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

  // ---- G8: depth-2 radical denesting (exact, real principal-root case) --------
  {
    const Rx = SR.builders;
    const ratK = (k) => Rx.rat(S.RatFn.fromInt(k));
    const sqrtOf = (nd) => Rx.root(nd, 2);
    const num = (nd) => SR.evalRadical(nd, {});
    const same = (a, b) => Math.abs(a - b) < 1e-9;
    // √(3+2√2) = 1+√2
    const n1 = sqrtOf(Rx.add(ratK(3), Rx.mul(ratK(2), sqrtOf(ratK(2)))));
    const d1 = SR.denest(n1);
    ok('denest √(3+2√2): value preserved (= 1+√2)', same(num(d1).re, num(n1).re) && same(num(d1).re, 1 + Math.SQRT2) && Math.abs(num(d1).im) < 1e-9);
    ok('denest √(3+2√2): no longer a top-level √ (denested to a sum)', d1.k === 'add');
    // √(5+2√6) = √2+√3
    const n2 = sqrtOf(Rx.add(ratK(5), Rx.mul(ratK(2), sqrtOf(ratK(6)))));
    const d2 = SR.denest(n2);
    ok('denest √(5+2√6): value preserved (= √2+√3)', same(num(d2).re, Math.sqrt(2) + Math.sqrt(3)) && d2.k === 'add');
    // √(2+√3) = (√6+√2)/2 — non-integer inner radicands
    const n3 = sqrtOf(Rx.add(ratK(2), sqrtOf(ratK(3))));
    ok('denest √(2+√3): value preserved (non-integer x,y)', same(num(SR.denest(n3)).re, Math.sqrt(2 + Math.sqrt(3))) && SR.denest(n3).k === 'add');
    // √(perfect square) → rational
    const d4 = SR.denest(sqrtOf(ratK(4)));
    ok('denest √4 = 2 (rational leaf)', d4.k === 'rat' && same(num(d4).re, 2));
    ok('denest √(9/16) = 3/4', same(num(SR.denest(sqrtOf(Rx.div(ratK(9), ratK(16))))).re, 0.75));
    // NON-denestable: a²−b²c < 0 ⇒ left nested
    const n5 = sqrtOf(Rx.add(ratK(1), sqrtOf(ratK(2))));   // √(1+√2): disc 1−2 = −1
    ok('denest leaves √(1+√2) nested (discriminant < 0)', SR.denest(n5).k === 'root' && same(num(SR.denest(n5)).re, Math.sqrt(1 + Math.SQRT2)));
    // symbolic radicand untouched
    ok('denest leaves a symbolic radicand √a untouched', SR.denest(sqrtOf(V('a'))).k === 'root');
  }
};
