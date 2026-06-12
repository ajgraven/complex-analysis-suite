'use strict';
// =============================================================================
// cardioid-uniqueness tests — reproduce the Aharonov–Shapiro order-2 quadrature-
// domain UNIQUENESS theorem with the in-engine algebra tool.
//
// A&S (Domains on which analytic functions satisfy quadrature identities, J.
// Analyse Math. 30 (1976), 39–73) prove: a solid QD with one order-2 node,
//     ∫_Ω f dA = M₀ f(0) + M₁ f′(0),   M₀ = area > 0,  M₁ ∈ ℂ,
// is UNIQUE; the cardioid φ(z) = √3/6·(2z+z²) is the cusp case. Ameur–Helmer–
// Tellander (arXiv:2001.09431, §5.1) give an automated proof via a real triangular
// decomposition + the Schur–Cohn (φ′≠0 in 𝔻) constraint — exactly this engine.
//
// The interior system (QDEquations.pointFunctionalSystem, area normalized π→1) for
// φ(z)=w₁z+w₂z² is  M₀=w₁²+2|w₂|², M₁=w₁²w̄₂, eliminating to the resolvent cubic
// s³−M₀s²+2|M₁|²=0 (s=w₁²). Univalence is degree-2-special: φ′(z)=w₁+2w₂z ≠ 0 in 𝔻
// (⇔ w₁≥2|w₂|, the Sym.schurCohn count) is necessary AND sufficient. Uniqueness =
// exactly one root of the cubic with w₁>0 yields a univalent map.
//
// Worked over the UNNORMALIZED rational representative φ=z+½z² (data M₀=3/2, M₁=½,
// both ℚ ⇒ exact); the A&S-normalized √3/6·(2z+z²) is the same shape at conformal
// radius √3/3. The exterior-h preset h=1.5/w+0.5/w² is the same domain (Part B).
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('qd-equations.js');
loadInCtx('qd-constraints.js');
loadInCtx('algebra/algebra-store.js');

module.exports = async function run() {
  section('cardioid-uniqueness — Aharonov–Shapiro order-2 QD uniqueness via the algebra tool');
  const S = QD.Sym, QE = QD.QDEquations;
  const mv = S.mpolyVar, mi = S.mpolyInt;
  const grat = (n, d) => S.gauss(S.rat(n, d == null ? 1 : d), S.rat(0));   // real rational a/d
  const gI = (a, b) => S.gaussInt(a, b || 0);

  // ---- Part A: interior point-functional system + cardioid uniqueness ----
  {
    const sys = QE.pointFunctionalSystem({ M0: 1.5, M1: { re: 0.5, im: 0 } });   // cardioid (φ=z+½z²)
    ok('pointFunctionalSystem: cardioid data → 3 equations in [w1,u2,v2]',
       sys.polys.length === 3 && sys.vars.join(',') === 'w1,u2,v2' && sys.params.length === 0);
    // realCount 2 = the ±w₁ rotation-gauge pair ⇒ a UNIQUE map under w₁>0 = the cardioid.
    const rc = S.realSolutionCount(sys.polys, null, sys.vars);
    ok('cardioid: realSolutionCount = 2 (±w₁ gauge pair ⇒ unique w₁>0 solution)',
       rc.ok && rc.realCount === 2, 'rc=' + JSON.stringify(rc));
  }

  // ---- Part C: the resolvent cubic (symbolic + cardioid factorization) ----
  {
    const sym = QE.pointFunctionalSystem();                       // symbolic M0,m1,n1
    ok('pointFunctionalSystem (symbolic): params [M0,m1,n1]', sym.params.join(',') === 'M0,m1,n1');
    const ord = S.monomialOrder('lex', ['u2', 'v2', 'w1', 'M0', 'm1', 'n1']);
    const GB = S.buchberger(sym.polys, ord);
    const w1 = mv('w1'), M0 = mv('M0'), m1 = mv('m1'), n1 = mv('n1');
    // resolvent w₁⁶ − M₀w₁⁴ + 2(m₁²+n₁²) = 0  (cubic in s=w₁²:  s³ − M₀s² + 2|M₁|²)
    const resolvent = w1.pow(6).sub(M0.mul(w1.pow(4))).add(m1.pow(2).mul(mi(2))).add(n1.pow(2).mul(mi(2)));
    ok('symbolic resolvent s³−M₀s²+2|M₁|² is entailed by the system (normalForm = 0)',
       S.normalForm(resolvent, GB, ord).isZero());
    // cardioid resolvent 2s³−3s²+1 = (s−1)²(2s+1): the cusp = the cubic's DOUBLE root s=w₁²=1.
    const s = mv('s');
    const card = s.pow(3).mul(mi(2)).sub(s.pow(2).mul(mi(3))).add(mi(1));
    const fac = s.sub(mi(1)).pow(2).mul(s.mul(mi(2)).add(mi(1)));
    ok('cardioid resolvent 2s³−3s²+1 = (s−1)²(2s+1): double root s=w₁²=1 is the cusp', card.equals(fac));
  }

  // ---- univalence filter: Sym.schurCohn on φ′=w₁+2w₂z (degree-2 ⇒ φ′≠0 in 𝔻 ⟺ univalent) ----
  {
    // φ′ ascending coeffs [w₁, 2w₂]. cardioid w₁=1,w₂=½ ⇒ [1,1], root −1 ON the circle (cusp).
    const cusp = S.schurCohn([gI(1), gI(1)]);
    ok('cardioid φ′=1+z: schurCohn on-circle (cusp), degenerate, inside 0',
       cusp.onCircle === 1 && cusp.degenerate === true && cusp.inside === 0);
    // a univalent member w₁=4,w₂=⅓ ⇒ [4,⅔], root −6 OUTSIDE ⇒ EXACTLY certified univalent.
    const univ = S.schurCohn([gI(4), grat(2, 3)]);
    ok('univalent member φ′=4+⅔z: schurCohn inside 0, certified (non-degenerate)',
       univ.inside === 0 && univ.degenerate === false);
    // an overshoot w₁=1,w₂=1 ⇒ [1,2], root −½ INSIDE ⇒ φ′ vanishes in 𝔻 ⇒ NOT univalent.
    const over = S.schurCohn([gI(1), gI(2)]);
    ok('overshoot φ′=1+2z: schurCohn inside 1 (φ′=0 in 𝔻) ⇒ rejected', over.inside === 1);
  }

  // ---- uniqueness mechanism: ≥2 algebraic solutions, the filter keeps exactly one ----
  {
    // Data with TWO positive resolvent roots s=w₁²∈{2,16}: candidates w₁=4 (univalent) and
    // w₁=√2 (overshoot). M₀=146/9, M₁=16/3 (both ℚ). realSolutionCount counts all real (±w₁);
    // the rational univalent candidate (w₁=4,w₂=⅓) is certified, the irrational one is spurious.
    const sys = QE.pointFunctionalSystem({ M0: 146 / 9, M1: { re: 16 / 3, im: 0 } });
    const rc = S.realSolutionCount(sys.polys, null, sys.vars);
    ok('two-root data: realSolutionCount = 4 (two w₁² roots × ±w₁)', rc.ok && rc.realCount === 4, 'rc=' + JSON.stringify(rc));
    ok('the univalent candidate w₁=4,w₂=⅓ is certified (schurCohn inside 0) ⇒ unique genuine QD',
       S.schurCohn([gI(4), grat(2, 3)]).inside === 0);
  }

  // ---- Part B: the app's exterior-h pipeline recovers the SAME cardioid ----
  {
    const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }] };
    const params = { a1: { re: 0, im: 0 }, ab1: { re: 0, im: 0 }, C1_1: { re: 1.5, im: 0 }, Cb1_1: { re: 1.5, im: 0 }, C1_2: { re: 0.5, im: 0 }, Cb1_2: { re: 0.5, im: 0 } };
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData, { w0: { re: 0, im: 0 } }));
    st.assumeReal(st.baseVariables().map((v) => v.raw || v.name || v));
    // φ(0)=a₁=0 with a single pole at the origin ⇒ the pole preimage z₁=0 is forced. Pinning it
    // removes the spurious z₁≠0 component (the locator factors through z₁) ⇒ zero-dimensional,
    // matching the interior realCount=2.
    st.substituteValues([{ varName: 'z1', value: { re: 0, im: 0 } }], { propagate: true });
    const cls = st.classify(null, { paramValues: params });
    ok('exterior-h: after z₁=0 the reim system is zero-dimensional with realCount = 2',
       cls.ok && cls.zeroDim === true && cls.realCount === 2, 'cls=' + JSON.stringify(cls));
    // numeric oracle: the inverse solver recovers φ = z + ½z² (A₁,₁≈1, A₁,₂≈½, z₁=0, univalent).
    const r = QD.solveInverseQD(hData, { boundaryPts: 300 });
    const phi = r && r.primary && r.primary.phi, b = phi && phi.branches && phi.branches[0];
    ok('exterior-h numeric oracle: solveInverseQD → φ=z+½z² (A₁,₁≈1, A₁,₂≈½), univalent',
       !!b && approxEq(b.A[0].re, 1, 1e-3) && approxEq(b.A[1].re, 0.5, 1e-3) && Math.abs(b.z.re) < 1e-6 && r.primary.univalent === true);
  }

  // ---- gauge quotient: QD.sameDomain merges rotation-related maps to one domain ----
  // The realCount=2 above is the ±φ′(0) rotation pair, ONE domain. sameDomain (canonicalize
  // by the disk rotation that makes φ′(0) real-positive, then phisEquivalent) collapses it.
  {
    const phi = (A) => ({ unbounded: false, w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A }] });
    const card = phi([{ re: 1, im: 0 }, { re: 0.5, im: 0 }]);              // φ = z + ½z²
    const refl = phi([{ re: -1, im: 0 }, { re: 0.5, im: 0 }]);             // π-rotation z↦−z: −z + ½z²
    const rotI = phi([{ re: 0, im: 1 }, { re: -0.5, im: 0 }]);             // z↦iz: A₁=i, A₂=½·i²=−½
    const disk = phi([{ re: 1, im: 0 }]);                                  // φ = z (unit disk)
    const big = phi([{ re: 2, im: 0 }, { re: 1, im: 0 }]);                 // 2× cardioid (different size)
    ok('sameDomain: cardioid ≡ its π-rotation (−z+½z²) — one domain, not two', QD.sameDomain(card, refl) === true);
    ok('sameDomain: cardioid ≡ its z↦iz rotation', QD.sameDomain(card, rotI) === true);
    ok('sameDomain: cardioid ≠ disk', QD.sameDomain(card, disk) === false);
    ok('sameDomain: cardioid ≠ a 2× scaled cardioid (distinct domain)', QD.sameDomain(card, big) === false);
  }
};
