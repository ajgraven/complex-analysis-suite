'use strict';
// =============================================================================
// cas-export tests — QD.CASExport, the external-CAS formatter (Maple RegularChains
// / Singular / Sage / Mathematica). Builds term lists with QD.Sym and checks the
// per-dialect lexical choices (imaginary unit, name sanitizing, relation suffix) and
// the system-script structure (the RegularChains RCTD call, the parameter-last ring,
// the equality ideals). Mathematica output is the canonical printer the AlgebraStore
// export delegates to — covered both here and by the algebra-store mathematica tests.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('algebra/cas-export.js');

module.exports = async function run() {
  section('cas-export — external-CAS (Maple RCTD / Singular / Sage) formatter');
  const S = QD.Sym, CAS = QD.CASExport;
  ok('QD.CASExport exposed', !!CAS && typeof CAS.systemToCAS === 'function' && typeof CAS.polyToCAS === 'function');

  const mv = S.mpolyVar, mi = S.mpolyInt;
  const I = S.mpolyConst(S.gaussInt(0, 1));
  const tl = (p) => p.termList();

  // ---- polynomial printer: per-dialect imaginary unit + name sanitizing ----
  {
    const pI = I.mul(mv('x')).add(mi(1));                 // i·x + 1
    ok('polyToCAS: Mathematica uses I for the imaginary unit', /\bI\b/.test(CAS.polyToCAS(tl(pI), 'mathematica')));
    ok('polyToCAS: Singular uses i (lower-case) for the imaginary unit',
       /\bi\b/.test(CAS.polyToCAS(tl(pI), 'singular')) && !/\bI\b/.test(CAS.polyToCAS(tl(pI), 'singular')));
    const pSub = mv('A1_1').mul(mv('z1'));                // A1_1·z1
    ok('polyToCAS: Mathematica sanitizes the subscript underscore (A1_1 → A1$1)',
       /A1\$1/.test(CAS.polyToCAS(tl(pSub), 'mathematica')) && !/A1_1/.test(CAS.polyToCAS(tl(pSub), 'mathematica')));
    ok('polyToCAS: Maple keeps the underscore (A1_1 is a legal Maple name)',
       /A1_1/.test(CAS.polyToCAS(tl(pSub), 'maple')));
    ok('polyToCAS: the zero polynomial prints as 0', CAS.polyToCAS([], 'maple') === '0');
  }

  // ---- relation suffixes per dialect ----
  {
    const p = mv('x');
    ok('equationToCAS: Maple equality → "= 0", strict → "> 0", non-vanishing → "<> 0"',
       /= 0$/.test(CAS.equationToCAS({ terms: tl(p), rel: '=' }, 'maple')) &&
       />\s*0$/.test(CAS.equationToCAS({ terms: tl(p), rel: '>' }, 'maple')) &&
       /<>\s*0$/.test(CAS.equationToCAS({ terms: tl(p), rel: '≠' }, 'maple')));
    ok('equationToCAS: Mathematica uses == 0 / != 0',
       /== 0$/.test(CAS.equationToCAS({ terms: tl(p), rel: '=' }, 'mathematica')) &&
       /!= 0$/.test(CAS.equationToCAS({ terms: tl(p), rel: '≠' }, 'mathematica')));
  }

  // ---- Maple RegularChains system: parameters declared LAST + the RCTD call ----
  {
    // A small parametric system in unknowns w1,u2,v2 with parameters M0,m1,n1.
    const items = [
      { terms: tl(mv('w1').pow(2).sub(mv('M0'))), rel: '=', label: 'area' },
      { terms: tl(mv('w1').pow(2).mul(mv('u2')).sub(mv('m1'))), rel: '=' },
      { terms: tl(mv('w1')), rel: '>' },                  // a univalence inequality w1 > 0
    ];
    const maple = CAS.systemToCAS(items, 'maple', { params: ['M0', 'm1', 'n1'] });
    ok('maple: emits a RegularChains script', /with\(RegularChains\)/.test(maple) && /PolynomialRing\(\[/.test(maple));
    ok('maple: RealComprehensiveTriangularize with the parameter count (2 present of 3 named)',
       /RealComprehensiveTriangularize\(sys, 2, R\)/.test(maple));   // only M0, m1 appear in the items
    ok('maple: parameters are declared LAST (w1,u2 precede M0,m1 in the ring)',
       (() => { const m = /PolynomialRing\(\[([^\]]*)\]/.exec(maple); const v = m[1].split(',').map((s) => s.trim());
         return v.indexOf('w1') < v.indexOf('M0') && v.indexOf('u2') < v.indexOf('m1'); })());
    ok('maple: the strict inequality is carried as "> 0"', /> 0/.test(maple));

    // No parameters ⇒ plain RealTriangularize.
    const maple0 = CAS.systemToCAS(items.slice(0, 2), 'maple', {});
    ok('maple: no parameters ⇒ RealTriangularize (not RealComprehensive…)',
       /RealTriangularize\(sys, R\)/.test(maple0) && !/RealComprehensive/.test(maple0));
  }

  // ---- Singular / Sage equality-ideal scripts ----
  {
    const items = [
      { terms: tl(mv('x').pow(2).sub(mi(2))), rel: '=' },
      { terms: tl(I.mul(mv('y')).add(mi(1))), rel: '=' },
      { terms: tl(mv('x')), rel: '>' },
    ];
    const sing = CAS.systemToCAS(items, 'singular', {});
    ok('singular: ℚ(i) ground field (minpoly i^2+1) + an ideal + std()',
       /ring r = \(0,i\)/.test(sing) && /minpoly = i\^2\+1/.test(sing) && /ideal Id =/.test(sing) && /std\(Id\)/.test(sing));
    ok('singular: the inequality is commented out (not in the ideal)', /\/\/ inequality/.test(sing));
    const sage = CAS.systemToCAS(items, 'sage', {});
    ok('sage: NumberField(x^2+1) + PolynomialRing + groebner_basis()',
       /NumberField\(x\^2 \+ 1\)/.test(sage) && /PolynomialRing\(K/.test(sage) && /groebner_basis\(\)/.test(sage));
    ok('sage: the inequality is commented out (not in the ideal)', /# inequality/.test(sage));
  }
};
