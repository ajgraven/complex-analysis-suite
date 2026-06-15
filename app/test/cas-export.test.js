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

  // ---- IMPORT: parseRCTD round-trips the qd-rctd JSON (the return trip for the export) ----
  {
    ok('QD.CASExport.parseRCTD exposed', typeof CAS.parseRCTD === 'function');
    // A hand-authored 2-cell decomposition fixture (the cardioid resolvent shape, schematically):
    // cell 1 with a parameter constraint M0>0 and a chain poly (1 real soln); cell 2 degenerate (2).
    const s = mv('s'), M0 = mv('M0');
    const cell1chain = s.pow(3).sub(M0.mul(s.pow(2))).add(mi(2));    // s³ − M0·s² + 2
    const json = JSON.stringify({
      format: 'qd-rctd', version: 1, params: ['M0', 'm1', 'n1'],
      cells: [
        { index: 1, realCount: 1, constraints: [{ terms: tl(M0), rel: '>' }], chain: [{ terms: tl(cell1chain) }] },
        { index: 2, realCount: 2, constraints: [{ terms: tl(M0.sub(mi(3))), rel: '=' }], chain: [{ terms: tl(s.sub(mi(1))) }] },
      ],
    });
    const r = CAS.parseRCTD(json);
    ok('parseRCTD: ok with the right format / version / params',
       r.ok && r.format === 'qd-rctd' && r.version === 1 && r.params.join(',') === 'M0,m1,n1');
    ok('parseRCTD: returns both cells with their indices + real-solution counts',
       r.cells.length === 2 && r.cells[0].index === 1 && r.cells[0].realCount === 1 && r.cells[1].realCount === 2);
    ok('parseRCTD: cell 1 carries a ">" parameter constraint and a chain polynomial',
       r.cells[0].constraints.length === 1 && r.cells[0].constraints[0].rel === '>' && r.cells[0].chain.length === 1);
    ok('parseRCTD: the chain term list rebuilds the original polynomial exactly',
       S.polyFromTermList(r.cells[0].chain[0].terms).equals(cell1chain));
    // Relation spellings: accept Maple's <> (≠) and >= / > (strict cell side).
    const r2 = CAS.parseRCTD(JSON.stringify({ cells: [{ index: 1, constraints: [{ terms: tl(M0), rel: '<>' }, { terms: tl(s), rel: '>=' }], chain: [] }] }));
    ok('parseRCTD: maps "<>"→≠ and ">="→>',
       r2.ok && r2.cells[0].constraints[0].rel === '≠' && r2.cells[0].constraints[1].rel === '>');
    // Robustness — every bad input is reported, never thrown.
    ok('parseRCTD: invalid JSON → ok:false (reason names it)',
       (() => { const x = CAS.parseRCTD('{not json'); return !x.ok && /invalid JSON/.test(x.reason); })());
    ok('parseRCTD: unrecognized format → ok:false',
       (() => { const x = CAS.parseRCTD(JSON.stringify({ format: 'maple-native', cells: [] })); return !x.ok; })());
    ok('parseRCTD: empty / missing cells → ok:false (reason mentions cells)',
       (() => { const x = CAS.parseRCTD(JSON.stringify({ cells: [] })); return !x.ok && /cells/.test(x.reason); })());
    ok('parseRCTD: a malformed term list → ok:false (located reason)',
       (() => { const x = CAS.parseRCTD(JSON.stringify({ cells: [{ index: 1, chain: [{ terms: [{ coeff: { re: ['1'] }, mono: {} }] }] }] })); return !x.ok && /coeff/.test(x.reason); })());
  }
};
