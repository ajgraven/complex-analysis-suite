'use strict';
// =============================================================================
// sym-core tests — the exact symbolic-algebra core (QD.Sym): Rational, Gaussian,
// MPoly, RatFn, and the truncated power-series layer (incl. compositional
// inverse). Oracles are closed-form identities; the symbolic series inverse is
// cross-checked numerically against its known closed form.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');   // page-only module (not in the CORE bundle)
loadInCtx('faber-analysis.js');   // Durand–Kerner finder used by solveZeroDim (Complex is in the core bundle)

module.exports = async function run() {
  section('sym-core — QD.Sym exact symbolic algebra');
  const S = QD.Sym;
  ok('QD.Sym exposed', !!S && !!S.MPoly && !!S.RatFn && typeof S.seriesInverse === 'function');

  const { Rational, Gaussian, MPoly, RatFn } = S;
  const ri = (k) => Rational.fromInt(k);

  // ---- Rational ----
  {
    const half = new Rational(1n, 2n), third = new Rational(1n, 3n);
    ok('Q: 1/2 + 1/3 = 5/6', half.add(third).equals(new Rational(5n, 6n)));
    ok('Q: 1/2 - 1/3 = 1/6', half.sub(third).equals(new Rational(1n, 6n)));
    ok('Q: 1/2 * 1/3 = 1/6', half.mul(third).equals(new Rational(1n, 6n)));
    ok('Q: (1/3)/(2/3) = 1/2', third.div(new Rational(2n, 3n)).equals(half));
    ok('Q: 2/4 normalizes to 1/2', new Rational(2n, 4n).equals(half));
    ok('Q: -1/-2 normalizes to 1/2', new Rational(-1n, -2n).equals(half));
    // normalization fast-paths (integer/zero/unit denominators)
    ok('Q: 0/5 normalizes to 0/1', new Rational(0n, 5n).equals(new Rational(0n, 1n)));
    ok('Q: 4/-2 normalizes to -2/1', new Rational(4n, -2n).equals(new Rational(-2n, 1n)));
    ok('Q: 6/4 still reduces to 3/2 (gcd path)', new Rational(6n, 4n).equals(new Rational(3n, 2n)));
    ok('Q: 7/1 stays 7/1', new Rational(7n, 1n).n === 7n && new Rational(7n, 1n).d === 1n);
    ok('Q: toNumber(3/8)=0.375', approxEq(new Rational(3n, 8n).toNumber(), 0.375, 1e-12));
  }

  // ---- Gaussian (ℚ(i)) ----
  {
    const one = Gaussian.fromInt(1), I = Gaussian.I;
    ok('G: i*i = -1', I.mul(I).equals(Gaussian.fromInt(-1)));
    ok('G: (1+i)(1-i) = 2', new Gaussian(ri(1), ri(1)).mul(new Gaussian(ri(1), ri(-1)))
       .equals(Gaussian.fromInt(2)));
    ok('G: conj(1+i) = 1-i', new Gaussian(ri(1), ri(1)).conj().equals(new Gaussian(ri(1), ri(-1))));
    ok('G: (3+4i)/(1+2i) = 11/5 - 2/5 i',
       new Gaussian(ri(3), ri(4)).div(new Gaussian(ri(1), ri(2)))
         .equals(new Gaussian(new Rational(11n, 5n), new Rational(-2n, 5n))));
    ok('G: 1 + (-1) = 0 isZero', one.add(Gaussian.fromInt(-1)).isZero());
  }

  // ---- MPoly ----
  {
    const x = MPoly.variable('x'), y = MPoly.variable('y'), one = MPoly.fromInt(1);
    const xp1sq = x.add(one).pow(2);                       // (x+1)^2
    const expect = x.pow(2).add(x.scale(Gaussian.fromInt(2))).add(one);   // x^2+2x+1
    ok('MPoly: (x+1)^2 = x^2+2x+1', xp1sq.equals(expect));
    ok('MPoly: (x+y)(x-y) = x^2 - y^2',
       x.add(y).mul(x.sub(y)).equals(x.pow(2).sub(y.pow(2))));
    ok('MPoly: eval (x+1)^2 at x=2 -> 9',
       approxEqC(xp1sq.evalComplex({ x: { re: 2, im: 0 } }), { re: 9, im: 0 }));
    ok('MPoly: eval (x+1)^2 at x=i -> 2i',
       approxEqC(xp1sq.evalComplex({ x: { re: 0, im: 1 } }), { re: 0, im: 2 }));
    ok('MPoly: eval (x+y)(x-y) at x=3,y=1 -> 8',
       approxEqC(x.add(y).mul(x.sub(y)).evalComplex({ x: { re: 3, im: 0 }, y: { re: 1, im: 0 } }),
                 { re: 8, im: 0 }));
    ok('MPoly: zero is zero', MPoly.zero().isZero());
    ok('MPoly: x - x = 0', x.sub(x).isZero());
    // LaTeX (identity var map)
    const tex = xp1sq.toLatex((n) => n);
    ok('MPoly: toLatex contains x^{2} and constant', /x\^\{2\}/.test(tex) && /1/.test(tex), tex);
    // term-list export shape
    const tl = xp1sq.termList();
    ok('MPoly: termList has 3 terms', tl.length === 3, 'n=' + tl.length);
  }

  // ---- RatFn ----
  {
    const x = MPoly.variable('x');
    const f = new RatFn(MPoly.fromInt(1), MPoly.fromInt(1).sub(x));   // 1/(1-x)
    ok('RatFn: 1/(1-x) at x=1/2 -> 2',
       approxEqC(f.evalComplex({ x: { re: 0.5, im: 0 } }), { re: 2, im: 0 }));
    // f - f == 0 (numerator clears to zero)
    ok('RatFn: f - f clears to 0', f.sub(f).clearDenominators().isZero());
    // (1/(1-x)) * (1-x) == 1  -> numerator equals denominator-cleared 1
    const prod = f.mul(RatFn.fromPoly(MPoly.fromInt(1).sub(x)));
    ok('RatFn: 1/(1-x) * (1-x) = 1 (numerically)',
       approxEqC(prod.evalComplex({ x: { re: 0.3, im: 0.2 } }), { re: 1, im: 0 }));
  }

  // ---- Power series: mul / pow ----
  {
    const L = 4;
    const onePlusT = [RatFn.fromInt(1), RatFn.fromInt(1), RatFn.fromInt(0), RatFn.fromInt(0), RatFn.fromInt(0)];
    const sq = S.seriesPow(onePlusT, 2, L);   // (1+t)^2 = 1 + 2t + t^2
    ok('series: (1+t)^2 coeffs [1,2,1,0,0]',
       ceq(sq[0], 1) && ceq(sq[1], 2) && ceq(sq[2], 1) && ceq(sq[3], 0) && ceq(sq[4], 0));
  }

  // ---- Compositional inverse: numeric closed form ----
  {
    const L = 5;
    // s(t) = t + t^2 ; inverse has coeffs 0,1,-1,2,-5,14 (signed Catalan)
    const s = [RatFn.fromInt(0), RatFn.fromInt(1), RatFn.fromInt(1), RatFn.fromInt(0), RatFn.fromInt(0), RatFn.fromInt(0)];
    const T = S.seriesInverse(s, L);
    ok('seriesInverse(t+t^2): T = [0,1,-1,2,-5]',
       ceq(T[0], 0) && ceq(T[1], 1) && ceq(T[2], -1) && ceq(T[3], 2) && ceq(T[4], -5));
    // sanity: s(T(t)) == t  (compose, then check coeffs are [0,1,0,0,0])
    const comp = S.seriesCompose(s, T, L);
    ok('seriesInverse: s(T(t)) = t',
       ceq(comp[0], 0) && ceq(comp[1], 1) && ceq(comp[2], 0) && ceq(comp[3], 0) && ceq(comp[4], 0));
  }

  // ---- Compositional inverse: SYMBOLIC coefficients (the key capability) ----
  {
    const L = 3;
    const s1 = MPoly.variable('s1'), s2 = MPoly.variable('s2');
    // s(t) = s1·t + s2·t^2  (s1,s2 symbolic) ; closed form: T[2] = -s2/s1^3
    const s = [RatFn.fromInt(0), RatFn.fromPoly(s1), RatFn.fromPoly(s2), RatFn.fromInt(0)];
    const T = S.seriesInverse(s, L);
    // T[1] = 1/s1 ; T[2] = -s2/s1^3  -- verify numerically at several (s1,s2)
    const checkAt = (a, b, t1exp, t2exp) => {
      const vm = { s1: { re: a, im: 0 }, s2: { re: b, im: 0 } };
      return approxEqC(T[1].evalComplex(vm), { re: t1exp, im: 0 }) &&
             approxEqC(T[2].evalComplex(vm), { re: t2exp, im: 0 });
    };
    ok('seriesInverse symbolic: T[1]=1/s1, T[2]=-s2/s1^3 at (2,1)',
       checkAt(2, 1, 1 / 2, -1 / 8));
    ok('seriesInverse symbolic: same at (3,2)',
       checkAt(3, 2, 1 / 3, -2 / 27));
  }

  // ---- Multiplicative reciprocal 1/a(t) (Möbius-denominator expansions) ----
  {
    const L = 4;
    const oneMinusT = [RatFn.fromInt(1), RatFn.fromInt(-1), RatFn.fromInt(0), RatFn.fromInt(0), RatFn.fromInt(0)];
    const r = S.seriesRecip(oneMinusT, L);   // 1/(1-t) = 1 + t + t^2 + ...
    ok('seriesRecip 1/(1-t) = [1,1,1,1,1]',
       ceq(r[0], 1) && ceq(r[1], 1) && ceq(r[2], 1) && ceq(r[3], 1) && ceq(r[4], 1));
    const prod = S.seriesMul(oneMinusT, r, L);
    ok('seriesRecip: a·(1/a) = 1',
       ceq(prod[0], 1) && ceq(prod[1], 0) && ceq(prod[2], 0) && ceq(prod[3], 0) && ceq(prod[4], 0));
    // symbolic 1/(a + b·t): r[0]=1/a, r[1]=-b/a^2
    const a = MPoly.variable('a'), b = MPoly.variable('b');
    const rs = S.seriesRecip([RatFn.fromPoly(a), RatFn.fromPoly(b), RatFn.fromInt(0)], 2);
    const vm = { a: { re: 2, im: 0 }, b: { re: 3, im: 0 } };
    ok('seriesRecip symbolic: r0=1/a, r1=-b/a^2 at (2,3)',
       approxEqC(rs[0].evalComplex(vm), { re: 0.5, im: 0 }) &&
       approxEqC(rs[1].evalComplex(vm), { re: -3 / 4, im: 0 }));
  }

  // ---- FRatFn: factored-denominator rational functions ----
  {
    const FR = S.FRatFn;
    const x = MPoly.variable('x'), y = MPoly.variable('y');
    const D0 = MPoly.fromInt(1).sub(x.mul(y));         // 1 - x·y  (the Möbius factor)
    const invD0 = FR.fromInt(1).div(FR.fromPoly(D0));  // 1/D0
    const invD0sq = invD0.mul(invD0);                  // 1/D0^2
    ok('FRatFn: 1/D0·1/D0 keeps num=1 with den factored as D0^2 (no expansion)',
       invD0sq.num.equals(MPoly.fromInt(1)) && invD0sq.den.length === 1 && invD0sq.den[0].e === 2);
    const vm = { x: { re: 0.5, im: 0 }, y: { re: 0.5, im: 0 } };   // D0 = 0.75
    ok('FRatFn: eval 1/D0^2 = 1/0.75^2', approxEqC(invD0sq.evalComplex(vm), { re: 1 / 0.5625, im: 0 }));
    const sum = invD0.add(invD0sq);                    // 1/D0 + 1/D0^2 = (D0+1)/D0^2
    ok('FRatFn: 1/D0 + 1/D0^2 evaluates correctly',
       approxEqC(sum.evalComplex(vm), { re: 1 / 0.75 + 1 / 0.5625, im: 0 }));
    ok('FRatFn: add over a shared factor stays factored (D0^2)',
       sum.den.length === 1 && sum.den[0].e === 2);
    ok('FRatFn: clearDenominators(1/D0^2)=1 (numerator only, not inflated by D0^2)',
       invD0sq.clearDenominators().equals(MPoly.fromInt(1)));
  }

  // ---- Field-generic series run over FRatFn and agree with RatFn ----
  {
    const FR = S.FRatFn, L = 4, vm = { x: { re: 0.3, im: 0 } };
    const x = MPoly.variable('x'), onePlusX = MPoly.fromInt(1).add(x);
    const aR = [RatFn.fromPoly(onePlusX), RatFn.fromInt(2), RatFn.fromInt(0), RatFn.fromInt(0), RatFn.fromInt(0)];
    const aF = [FR.fromPoly(onePlusX), FR.fromInt(2), FR.fromInt(0), FR.fromInt(0), FR.fromInt(0)];
    const rR = S.seriesRecip(aR, L), rF = S.seriesRecip(aF, L);
    let agree = true;
    for (let i = 0; i <= L; i++) agree = agree && approxEqC(rR[i].evalComplex(vm), rF[i].evalComplex(vm));
    ok('seriesRecip agrees over RatFn and FRatFn (same values)', agree);
    ok('seriesRecip over FRatFn keeps a factored denominator', rF[L].den.length >= 1);
  }

  // ---- Lagrange reversion == iterative compositional inverse ----
  {
    const s1 = MPoly.variable('s1'), s2 = MPoly.variable('s2');
    const s = [RatFn.fromInt(0), RatFn.fromPoly(s1), RatFn.fromPoly(s2), RatFn.fromInt(0)];
    const Tinv = S.seriesInverse(s, 3), Trev = S.seriesReversion(s, 3);
    const vm = { s1: { re: 2, im: 0 }, s2: { re: 1, im: 0 } };
    let agree = true;
    for (let i = 1; i <= 3; i++) agree = agree && approxEqC(Tinv[i].evalComplex(vm), Trev[i].evalComplex(vm));
    ok('seriesReversion (Lagrange) matches seriesInverse (symbolic, values)', agree);
    const sNum = [RatFn.fromInt(0), RatFn.fromInt(1), RatFn.fromInt(1), RatFn.fromInt(0)];
    const Tr = S.seriesReversion(sNum, 3);
    ok('seriesReversion(t+t^2) = [0,1,-1,2]', ceq(Tr[1], 1) && ceq(Tr[2], -1) && ceq(Tr[3], 2));
  }

  // ---- Elimination layer: univariate view, determinant, resultant ----
  // Oracle style: the eliminant must VANISH at the true common solutions and be
  // nonzero elsewhere; Bareiss det is cross-checked against Laplace cofactor.
  {
    const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
    const iC = S.mpolyConst(S.gaussInt(0, 1));   // the constant i as an MPoly

    // degreeIn / coeffsIn
    const f0 = mv('x').pow(2).mul(mv('y')).add(mv('x')).sub(mi(3)); // y·x² + x − 3
    ok('degreeIn(x)=2, degreeIn(y)=1, degreeIn(z)=0',
       f0.degreeIn('x') === 2 && f0.degreeIn('y') === 1 && f0.degreeIn('z') === 0);
    ok('totalDegree(y·x²+x−3)=3; const=0; zero=−1',
       f0.totalDegree() === 3 && mi(7).totalDegree() === 0 && S.MPoly.zero().totalDegree() === -1);
    const cs = f0.coeffsIn('x');   // [ −3, 1, y ]
    ok('coeffsIn(x): c0=−3, c1=1, c2=y',
       cs.length === 3 && cs[0].equals(mi(-3)) && cs[1].equals(mi(1)) && cs[2].equals(mv('y')));
    ok('derivativeIn(x) of y·x²+x−3 = 2y·x + 1',
       f0.derivativeIn('x').equals(mv('y').mul(mv('x')).scale(S.gaussInt(2)).add(mi(1))));

    // (1) eliminate x from { x²−y, x−1 } → vanishes at y=1, not at y=2
    const r1 = S.resultant(mv('x').pow(2).sub(mv('y')), mv('x').sub(mi(1)), 'x');
    ok('Res_x(x²−y, x−1) vanishes at y=1', Math.hypot(r1.evalComplex({ y: { re: 1, im: 0 } }).re,
       r1.evalComplex({ y: { re: 1, im: 0 } }).im) < 1e-12);
    ok('Res_x(x²−y, x−1) nonzero at y=2', Math.hypot(r1.evalComplex({ y: { re: 2, im: 0 } }).re,
       r1.evalComplex({ y: { re: 2, im: 0 } }).im) > 1e-9);

    // (2) circle ∩ line: eliminate x from { x²+y²−1, x+y } → 2y²−1, roots y=±1/√2
    const r2 = S.resultant(mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').add(mv('y')), 'x');
    ok('Res_x(circle,line) vanishes at y=1/√2',
       Math.abs(r2.evalComplex({ y: { re: Math.SQRT1_2, im: 0 } }).re) < 1e-12);
    ok('Res_x(circle,line) nonzero at y=0',
       Math.abs(r2.evalComplex({ y: { re: 0, im: 0 } }).re) > 1e-9);

    // (3) ℚ(i): x−i shares the root i with x²+1 (≡0); x−i and x−2 do not
    ok('Res_x(x−i, x²+1) ≡ 0 (shared factor)', S.resultant(mv('x').sub(iC), mv('x').pow(2).add(mi(1)), 'x').isZero());
    ok('Res_x(x−i, x−2) is a nonzero ℚ(i) constant',
       !S.resultant(mv('x').sub(iC), mv('x').sub(mi(2)), 'x').isZero());

    // (4) Bareiss det == Laplace det on small MPoly matrices (incl. a zero pivot)
    const M3 = [[mv('x'), mi(1), mv('y')], [mi(0), mv('x'), mi(2)], [mv('y'), mi(1), mv('x')]];
    ok('mpolyDet (Bareiss) == Laplace, 3×3', S.mpolyDet(M3).equals(S.mpolyDetLaplace(M3)));
    const M4 = [[mv('x'), mi(2), mi(0), mv('y')], [mi(1), mv('y'), mi(3), mi(0)],
                [mi(0), mi(1), mv('x'), mi(2)], [mv('y'), mi(0), mi(1), mv('x')]];
    ok('mpolyDet (Bareiss) == Laplace, 4×4', S.mpolyDet(M4).equals(S.mpolyDetLaplace(M4)));
    const Msw = [[mi(0), mi(1)], [mi(1), mi(0)]];   // forces a pivot row-swap → det −1
    ok('mpolyDet handles zero pivot (row swap), det[[0,1],[1,0]]=−1', S.mpolyDet(Msw).equals(mi(-1)));

    // (5) edge cases
    ok('Res(f, const c, x) = c^{deg f}: Res(x²−y, 3, x)=9',
       S.resultant(mv('x').pow(2).sub(mv('y')), mi(3), 'x').equals(mi(9)));
    ok('Res(const, const, x) = 1', S.resultant(mi(5), mi(7), 'x').equals(mi(1)));
    ok('Res(0, g, x) = 0', S.resultant(S.MPoly.zero(), mv('x').add(mi(1)), 'x').isZero());

    // discriminant of x²+bx+c (in x) is b²−4c (up to sign): vanishes at the double-root line
    const disc = S.discriminant(mv('x').pow(2).add(mv('b').mul(mv('x'))).add(mv('c')), 'x');
    ok('disc_x(x²+bx+c) vanishes at b=2,c=1 (double root)',
       Math.abs(disc.evalComplex({ b: { re: 2, im: 0 }, c: { re: 1, im: 0 } }).re) < 1e-12);
    ok('disc_x(x²+bx+c) nonzero at b=0,c=−1',
       Math.abs(disc.evalComplex({ b: { re: 0, im: 0 }, c: { re: -1, im: 0 } }).re) > 1e-9);

    // matrix-size cap: a resultant whose Sylvester dimension exceeds the cap throws
    // (rather than hanging on a huge Bareiss determinant) — the guard that keeps the
    // heavy geometric-border discriminant from blowing up interactively.
    let threw = false, msg = '';
    try { S.resultant(mv('x').pow(6).add(mv('y')), mv('x').pow(6).add(mi(1)), 'x'); }
    catch (e) { threw = true; msg = String(e.message || e); }
    ok('resultant throws a clear cap error when the Sylvester matrix is too large (12×12 > 10)',
       threw && /cap/i.test(msg), msg);
    ok('resultant honors an explicit higher cap override',
       !!S.resultant(mv('x').pow(6).add(mv('y')), mv('x').pow(6).add(mi(1)), 'x', 16));
  }

  // ---- Gröbner basis layer (Buchberger over ℚ(i)) ---------------------------
  // The multivariate generalization of the resultant. Oracles: ideal membership
  // (a polynomial is in the ideal iff its normal form is 0), the division
  // identity f = Σqᵢ·gᵢ + r, canonicity of the reduced basis, and a cross-check
  // that the lex-elimination GB contains the resultant (Res reduces to 0 mod GB).
  {
    const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);

    // monomial orders pick the expected leading term
    {
      const p = mv('x').pow(2).add(mv('y').pow(3)).add(mv('x').mul(mv('y')));  // x² + y³ + xy
      const lex = S.monomialOrder('lex', ['x', 'y']);
      const grlex = S.monomialOrder('grlex', ['x', 'y']);
      const grevlex = S.monomialOrder('grevlex', ['x', 'y']);
      ok('order: lex(x>y) leads with x²', _monoEq(p.leadingMono(lex), { x: 2 }));
      ok('order: grlex leads with y³ (top total degree)', _monoEq(p.leadingMono(grlex), { y: 3 }));
      ok('order: grevlex leads with y³ (top total degree)', _monoEq(p.leadingMono(grevlex), { y: 3 }));
      // grevlex vs grlex differ on equal-degree monomials: x²y vs xy² (deg 3)
      const q = mv('x').pow(2).mul(mv('y')).add(mv('x').mul(mv('y').pow(2)));   // x²y + xy²
      ok('order: grlex(x>y) leads x²y; grevlex leads x²y too here',
         _monoEq(q.leadingMono(grlex), { x: 2, y: 1 }) && _monoEq(q.leadingMono(grevlex), { x: 2, y: 1 }));
      ok('order: leadingCoeff of 3x²+… (lex) is 3',
         mv('x').pow(2).scale(S.gaussInt(3)).add(mv('y')).leadingCoeff(lex).equals(S.gaussInt(3)));
    }

    // multivariate division identity: f = Σ qᵢ·gᵢ + r, and r has no LT divisible by any LT(gᵢ)
    {
      const ord = S.monomialOrder('lex', ['x', 'y']);
      const f = mv('x').pow(2).mul(mv('y')).add(mv('x').mul(mv('y').pow(2))).add(mv('y').pow(2)); // x²y+xy²+y²
      const g1 = mv('x').mul(mv('y')).sub(mi(1)), g2 = mv('y').pow(2).sub(mi(1));
      const dm = S.mpolyDivMod(f, [g1, g2], ord);
      let recon = dm.remainder;
      recon = recon.add(dm.quotients[0].mul(g1)).add(dm.quotients[1].mul(g2));
      ok('divmod: f = Σ qᵢ·gᵢ + r exactly', recon.equals(f));
    }

    // S-polynomial cancels leading terms
    {
      const ord = S.monomialOrder('grlex', ['x', 'y']);
      const f = mv('x').pow(2).mul(mv('y')).add(mi(1)), g = mv('x').mul(mv('y').pow(2)).add(mi(1));
      const s = S.sPoly(f, g, ord);
      // S = y·f − x·g = y − x  (leading x²y² cancels)
      ok('sPoly(x²y+1, xy²+1) = y − x', s.equals(mv('y').sub(mv('x'))));
    }

    // ideal membership via Buchberger: I = (x²+y²−1, x−y)
    {
      const ord = S.monomialOrder('grevlex', ['x', 'y']);
      const f = mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), g = mv('x').sub(mv('y'));
      const G = S.buchberger([f, g], ord);
      ok('buchberger: reduced GB of (x²+y²−1, x−y) has 2 generators', G.length === 2);
      ok('buchberger: every generator is monic (leadingCoeff = 1)',
         G.every((p) => p.leadingCoeff(ord).equals(S.gaussInt(1))));
      ok('membership: both generators of I reduce to 0',
         S.normalForm(f, G, ord).isZero() && S.normalForm(g, G, ord).isZero());
      ok('membership: x·(x−y) ∈ I reduces to 0', S.normalForm(mv('x').mul(g), G, ord).isZero());
      ok('membership: x ∉ I reduces to nonzero', !S.normalForm(mv('x'), G, ord).isZero());
    }

    // reduced GB is canonical: same ideal, two generating sets → identical reduced GB
    {
      const ord = S.monomialOrder('grevlex', ['x', 'y']);
      const f = mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), g = mv('x').sub(mv('y'));
      const G1 = S.buchberger([f, g], ord);
      // a different generating set of the SAME ideal: {g, f + 3·(x−y)·something within ideal}
      const alt = f.add(g.mul(mv('x').add(mi(2))));        // f + (x+2)(x−y) — same ideal
      const G2 = S.buchberger([g, alt], ord);
      const keys1 = G1.map((p) => p.key()).sort().join('|');
      const keys2 = G2.map((p) => p.key()).sort().join('|');
      ok('reduced GB is canonical (independent of the generating set)', keys1 === keys2, keys1 + ' vs ' + keys2);
    }

    // lex-elimination GB contains the resultant: Res_x(f,g) reduces to 0 mod the lex GB
    {
      const f = mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), g = mv('x').add(mv('y'));
      const lex = S.monomialOrder('lex', ['x', 'y']);
      const G = S.buchberger([f, g], lex);
      const elim = G.filter((p) => !p.vars().has('x'));   // elimination ideal ∩ ℚ[y]
      ok('lex-elim GB has a generator free of x (the elimination ideal)', elim.length >= 1);
      const Res = S.resultant(f, g, 'x');
      ok('resultant lies in the ideal: Res_x(f,g) reduces to 0 mod the lex GB',
         S.normalForm(Res, G, lex).isZero());
    }

    // numeric vanishing: GB generators vanish wherever the inputs do
    {
      const ord = S.monomialOrder('grevlex', ['x', 'y']);
      const f = mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), g = mv('x').sub(mv('y'));
      const G = S.buchberger([f, g], ord);
      // common solution x=y=1/√2 (on the circle and the line)
      const vm = { x: { re: Math.SQRT1_2, im: 0 }, y: { re: Math.SQRT1_2, im: 0 } };
      ok('every GB generator vanishes at a common solution of the inputs',
         G.every((p) => Math.hypot(p.evalComplex(vm).re, p.evalComplex(vm).im) < 1e-12));
    }

    // ℚ(i) coefficients: GB of (x²+1, x−i) collapses (x−i divides x²+1) → basis {x−i}
    {
      const iC = S.mpolyConst(S.gaussInt(0, 1));
      const ord = S.monomialOrder('lex', ['x']);
      const G = S.buchberger([mv('x').pow(2).add(mi(1)), mv('x').sub(iC)], ord);
      ok('buchberger over ℚ(i): (x²+1, x−i) → reduced basis {x − i}',
         G.length === 1 && G[0].equals(mv('x').sub(iC)));
    }

    // saturation (Rabinowitsch): ⟨x·y⟩ : x^∞ = ⟨y⟩ (drop the x=0 component)
    {
      const sat = S.saturate([mv('x').mul(mv('y'))], mv('x'));
      // result generates ⟨y⟩: y reduces to 0, x does not
      const ord = S.monomialOrder('grevlex', ['x', 'y']);
      ok('saturate(⟨xy⟩ : x^∞) = ⟨y⟩ (y in, x out)',
         sat.length === 1 && S.normalForm(mv('y'), sat, ord).isZero() &&
         !S.normalForm(mv('x'), sat, ord).isZero());
    }

    // cost cap: tripping the step limit throws a clear "use CAS export" error.
    // The leading monomials x², xy share x (NOT coprime), so a real S-pair survives
    // the Gebauer–Möller criteria and the step loop runs — maxSteps:0 trips it.
    {
      let threw = false, msg = '';
      try {
        S.buchberger([mv('x').pow(2).add(mv('y')), mv('x').mul(mv('y')).add(mv('x'))],
          S.monomialOrder('grevlex', ['x', 'y']), { maxSteps: 0 });
      } catch (e) { threw = true; msg = String(e.message || e); }
      ok('buchberger throws a clear cap error past the step limit', threw && /export/i.test(msg), msg);
    }

    // Gebauer–Möller + sugar: the output is a genuine Gröbner basis (every S-pair
    // reduces to 0) AND canonical across runs. The 3-variable cyclic-style system
    // exercises the chain criterion heavily.
    {
      const verifyGB = (G, ord) => {
        for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
          if (!S.normalForm(S.sPoly(G[i], G[j], ord), G, ord).isZero()) return false;
        }
        return true;
      };
      const sys = [mv('x').pow(2).add(mv('y')), mv('y').pow(2).add(mv('z')), mv('z').pow(2).add(mv('x'))];
      const ord = S.monomialOrder('grevlex', ['x', 'y', 'z']);
      const G = S.buchberger(sys, ord);
      ok('GM/sugar: output is a valid Gröbner basis (all S-polys reduce to 0)', verifyGB(G, ord));
      // determinism: a re-run and a permuted input give the identical reduced basis
      const G2 = S.buchberger([sys[2], sys[0], sys[1]], ord);
      ok('GM/sugar: reduced basis is canonical regardless of input order',
         G.map((p) => p.key()).sort().join('|') === G2.map((p) => p.key()).sort().join('|'));
    }

    // Block / elimination order: cheaper than lex, same elimination ideal.
    {
      const f = mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), g = mv('x').add(mv('y'));
      const be = S.eliminationOrder(['x'], ['y']);
      ok('eliminationOrder reports kind "block"', be.kind === 'block');
      // an x-monomial outranks a pure-y monomial of higher total degree (elim property)
      ok('block order: x¹ ≻ y³ (elim block dominates)', be.cmp(new Map([['x', 1]]), new Map([['y', 3]])) > 0);
      const G = S.buchberger([f, g], be);
      const elim = G.filter((p) => !p.vars().has('x'));
      ok('block-elim GB exposes the elimination ideal (a generator free of x)', elim.length >= 1);
      const Res = S.resultant(f, g, 'x');
      ok('block-elim GB contains the resultant (Res reduces to 0 mod the GB)',
         S.normalForm(Res, G, be).isZero());
      // the block-elim eliminant and the lex eliminant cut out the same y-locus
      const lex = S.monomialOrder('lex', ['x', 'y']);
      const Glex = S.buchberger([f, g], lex).filter((p) => !p.vars().has('x'));
      const vmRoot = { y: { re: Math.SQRT1_2, im: 0 } };       // y=1/√2 is a common-root projection
      ok('block-elim and lex eliminants agree at a root projection',
         Math.abs(elim[0].evalComplex(vmRoot).re) < 1e-12 && Math.abs(Glex[0].evalComplex(vmRoot).re) < 1e-12);
    }

    // Zero-dimensional toolkit: standard monomials / dimension / solution count.
    {
      const o = S.monomialOrder('grevlex', ['x', 'y']);
      const G = S.buchberger([mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))], o);   // {±1}×{±1}
      ok('isZeroDimensional: ⟨x²−1, y²−1⟩ is zero-dim', S.isZeroDimensional(G, o, ['x', 'y']));
      ok('quotientDimension: ⟨x²−1, y²−1⟩ has 4 standard monomials (= 4 solutions)',
         S.quotientDimension(G, o, ['x', 'y']) === 4);
      ok('standardMonomials: basis is {1, y, x, xy} (grevlex-ascending)',
         S.standardMonomials(G, o, ['x', 'y']).map((m) => _monoStr(m)).join(',') === '1,y,x,x*y');
      const Gp = S.buchberger([mv('x').pow(2).sub(mv('y'))], o);     // a curve — positive-dimensional
      ok('isZeroDimensional: ⟨x²−y⟩ is NOT zero-dim', !S.isZeroDimensional(Gp, o, ['x', 'y']));
      ok('quotientDimension: positive-dim ideal reports Infinity', S.quotientDimension(Gp, o, ['x', 'y']) === Infinity);
    }

    // FGLM: grevlex → lex conversion equals a direct lex Buchberger (same reduced GB).
    {
      const o1 = S.monomialOrder('grevlex', ['x', 'y']), lex = S.monomialOrder('lex', ['x', 'y']);
      const sys = [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))];
      const viaFglm = S.fglm(S.buchberger(sys, o1), o1, lex, ['x', 'y']);
      const direct = S.buchberger(sys, lex);
      ok('fglm: grevlex→lex matches a direct lex Gröbner basis',
         viaFglm.map((p) => p.key()).sort().join('|') === direct.map((p) => p.key()).sort().join('|'));
      // and on a 0-dim square ideal
      const sq = [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))];
      const f2 = S.fglm(S.buchberger(sq, o1), o1, lex, ['x', 'y']);
      const d2 = S.buchberger(sq, lex);
      ok('fglm: matches direct lex on ⟨x²−1, y²−1⟩',
         f2.map((p) => p.key()).sort().join('|') === d2.map((p) => p.key()).sort().join('|'));
      ok('fglm: throws on a positive-dimensional ideal', (() => {
        try { S.fglm(S.buchberger([mv('x').pow(2).sub(mv('y'))], o1), o1, lex, ['x', 'y']); return false; }
        catch (e) { return /zero-dimensional/i.test(String(e.message || e)); }
      })());
    }

    // solveZeroDim: shape-lemma numeric solving via the real Durand–Kerner finder.
    {
      const sys = [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))];  // x=y=±1/√2
      const sol = S.solveZeroDim(sys, { vars: ['x', 'y'], solveVar: 'y' });               // default finder = QD.FaberAnalysis
      ok('solveZeroDim: succeeds (default Durand–Kerner finder) with 2 solutions',
         sol.ok && sol.solutions.length === 2 && sol.dimension === 2);
      ok('solveZeroDim: every returned solution satisfies the system', sol.ok &&
         sol.solutions.every((s) => sys.every((p) => { const v = p.evalComplex(s); return Math.hypot(v.re, v.im) < 1e-7; })));
      // a system with complex solutions: x²+1=0, y−x=0 → x=±i
      const cplx = [mv('x').pow(2).add(mi(1)), mv('y').sub(mv('x'))];
      const sc = S.solveZeroDim(cplx, { vars: ['x', 'y'], solveVar: 'x' });
      ok('solveZeroDim: finds the complex roots of x²+1 (x=±i, y=x)', sc.ok && sc.solutions.length === 2 &&
         sc.solutions.every((s) => Math.abs(Math.hypot(s.x.re, s.x.im) - 1) < 1e-7 && Math.abs(s.x.re) < 1e-7));
      const bad = S.solveZeroDim([mv('x').pow(2).sub(mv('y'))], { vars: ['x', 'y'] });
      ok('solveZeroDim: a positive-dimensional system returns {ok:false}', bad.ok === false && /zero-dimensional/i.test(bad.reason));
    }

    // Serialization (worker boundary): MPoly ⇄ term list round-trip, and runJob —
    // the serialized op dispatcher used by the Web-Worker offload (sym-worker.js).
    {
      const iC = S.mpolyConst(S.gaussInt(0, 1));
      const p = mv('x').pow(2).mul(mv('y')).add(mv('x').mul(iC).scale(S.gaussInt(3))).sub(mi(5));  // x²y + 3i·x − 5
      ok('fromTermList: round-trips an MPoly (incl. ℚ(i) coeffs) exactly', S.polyFromTermList(p.termList()).equals(p));
      ok('fromTermList: empty list → zero polynomial', S.polyFromTermList([]).isZero());
      // runJob groebner: serialized in → serialized out, equals the direct basis
      const sys = [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))];
      let progressCalls = 0;
      const rj = S.runJob('groebner', { polys: sys.map((q) => q.termList()), orderSpec: { kind: 'grevlex', varOrder: ['x', 'y'] } }, () => progressCalls++);
      const direct = S.buchberger(sys, S.monomialOrder('grevlex', ['x', 'y']));
      ok('runJob groebner: generators match a direct Buchberger run',
         rj.generators.map((tl) => S.polyFromTermList(tl).key()).sort().join('|') === direct.map((g) => g.key()).sort().join('|'));
      // runJob with a block elimination spec
      const rjE = S.runJob('groebner', { polys: sys.map((q) => q.termList()), orderSpec: { kind: 'block', blocks: [['x'], ['y']] } });
      ok('runJob groebner: block-order spec yields an x-free elimination generator',
         rjE.generators.map((tl) => S.polyFromTermList(tl)).some((g) => !g.vars().has('x')));
      // runJob solveZeroDim
      const rs = S.runJob('solveZeroDim', { polys: [mv('x').pow(2).sub(mi(2)), mv('y').sub(mv('x'))].map((q) => q.termList()), vars: ['x', 'y'], solveVar: 'x' });
      ok('runJob solveZeroDim: 2 solutions x=±√2 (JSON-safe)',
         rs.ok && rs.solutions.length === 2 && rs.solutions.every((s) => Math.abs(Math.abs(s.x.re) - Math.SQRT2) < 1e-7));
      ok('runJob: unknown op throws', (() => { try { S.runJob('nope', {}); return false; } catch (e) { return /unknown/i.test(String(e.message || e)); } })());
    }
  }
};

// compact monomial string for assertions ('' → '1')
function _monoStr(m) {
  const parts = [...m.entries()].sort().map(([n, e]) => (e === 1 ? n : n + '^' + e));
  return parts.join('*') || '1';
}

// monomial (Map) equals a plain {name:exp} object — for leading-term assertions
function _monoEq(mono, obj) {
  const keys = Object.keys(obj);
  if (mono.size !== keys.length) return false;
  for (const k of keys) if ((mono.get(k) || 0) !== obj[k]) return false;
  return true;
}

// ---- local complex helpers ----
function approxEqC(a, b, tol) { tol = tol || 1e-9; return Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol; }
function ceq(rf, n, tol) { const v = rf.evalComplex({}); return Math.abs(v.re - n) < (tol || 1e-12) && Math.abs(v.im) < (tol || 1e-12); }
