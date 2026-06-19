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

    // Phase A — packed exponent-vector kernel: DIFFERENTIAL vs an independent,
    // naive textbook Buchberger built only from the public MPoly primitives
    // (sPoly + normalForm + reduceGroebner). Because the reduced Gröbner basis is
    // UNIQUE for a given ideal and order, the optimized packed kernel inside
    // S.buchberger must return a bit-identical basis (same generator keys) to any
    // correct algorithm — this pins correctness of the whole rewrite.
    {
      // Independent reference: add every nonzero S-poly normal form until closed,
      // then canonicalize. O(pairs²) and slow, but correct — used on SMALL systems.
      const naiveGB = (polys, ord) => {
        const basis = polys.filter((p) => !p.isZero()).map((p) => p.clone());
        let changed = true, guard = 0;
        while (changed) {
          changed = false;
          const cur = basis.slice();
          for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
            const r = S.normalForm(S.sPoly(cur[i], cur[j], ord), basis, ord);
            if (!r.isZero()) { basis.push(r); changed = true; }
            if (++guard > 200000) throw new Error('naiveGB: guard tripped');
          }
        }
        return S.reduceGroebner(basis, ord);
      };
      const keys = (G) => G.map((p) => p.key()).sort().join('|');
      const iC = S.mpolyConst(S.Gaussian.I);   // the constant i as an MPoly
      const cases = [
        { name: '⟨x²+y²−1, x−y⟩ lex(x>y)',
          sys: [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))],
          ord: S.monomialOrder('lex', ['x', 'y']) },
        { name: '⟨x²+y²−1, x−y⟩ grlex',
          sys: [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))],
          ord: S.monomialOrder('grlex', ['x', 'y']) },
        { name: '3-var cyclic-style grevlex',
          sys: [mv('x').pow(2).add(mv('y')), mv('y').pow(2).add(mv('z')), mv('z').pow(2).add(mv('x'))],
          ord: S.monomialOrder('grevlex', ['x', 'y', 'z']) },
        { name: 'ℚ(i): ⟨x²+1, xy−i⟩ grevlex',
          sys: [mv('x').pow(2).add(mi(1)), mv('x').mul(mv('y')).sub(iC)],
          ord: S.monomialOrder('grevlex', ['x', 'y']) },
        { name: 'block elimination ⟨x²+y²−1, x+y⟩ elim x',
          sys: [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').add(mv('y'))],
          ord: S.eliminationOrder(['x'], ['y']) },
        // large/denominator coefficients — exercises CONTENT REMOVAL (Phase D): the
        // working basis is kept primitive (Gaussian-integer gcd cleared), yet the
        // canonical reduced basis must still match the naive (no-content) path.
        { name: 'content removal: ⟨6x²−10, 15y−21x⟩ lex',
          sys: [mv('x').pow(2).scale(S.gaussInt(6)).sub(mi(10)), mv('y').scale(S.gaussInt(15)).sub(mv('x').scale(S.gaussInt(21)))],
          ord: S.monomialOrder('lex', ['x', 'y']) },
        { name: 'content removal ℚ(i): ⟨(3+3i)x²−(6−6i), x−y⟩ grevlex',
          sys: [mv('x').pow(2).scale(S.gaussInt(3, 3)).sub(S.mpolyConst(S.gaussInt(6, -6))), mv('x').sub(mv('y'))],
          ord: S.monomialOrder('grevlex', ['x', 'y']) },
      ];
      let allMatch = true, detail = '';
      for (const c of cases) {
        const a = keys(S.buchberger(c.sys, c.ord));
        const b = keys(naiveGB(c.sys, c.ord));
        if (a !== b) { allMatch = false; detail = c.name; break; }
      }
      ok('packed kernel == naive textbook Buchberger on every case (canonical basis)' + (allMatch ? '' : ' — MISMATCH: ' + detail), allMatch);
    }

    // Phase A — benchmark: cyclic-5 grevlex (a genuinely heavy run) completes and
    // yields a valid Gröbner basis. Timing is logged, not asserted (machine-
    // dependent); the assertion is that the packed kernel produces a real GB.
    {
      const v = (k) => mv('c' + k);
      const cyc = [];
      cyc.push(v(0).add(v(1)).add(v(2)).add(v(3)).add(v(4)));                       // e1
      cyc.push(v(0).mul(v(1)).add(v(1).mul(v(2))).add(v(2).mul(v(3))).add(v(3).mul(v(4))).add(v(4).mul(v(0))));
      cyc.push(v(0).mul(v(1)).mul(v(2)).add(v(1).mul(v(2)).mul(v(3))).add(v(2).mul(v(3)).mul(v(4)))
        .add(v(3).mul(v(4)).mul(v(0))).add(v(4).mul(v(0)).mul(v(1))));
      cyc.push(v(0).mul(v(1)).mul(v(2)).mul(v(3)).add(v(1).mul(v(2)).mul(v(3)).mul(v(4)))
        .add(v(2).mul(v(3)).mul(v(4)).mul(v(0))).add(v(3).mul(v(4)).mul(v(0)).mul(v(1)))
        .add(v(4).mul(v(0)).mul(v(1)).mul(v(2))));
      cyc.push(v(0).mul(v(1)).mul(v(2)).mul(v(3)).mul(v(4)).sub(mi(1)));            // e5 − 1
      const ord = S.monomialOrder('grevlex', ['c0', 'c1', 'c2', 'c3', 'c4']);
      const t0 = Date.now();
      const G = S.buchberger(cyc, ord);
      const ms = Date.now() - t0;
      const valid = (() => {
        for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++)
          if (!S.normalForm(S.sPoly(G[i], G[j], ord), G, ord).isZero()) return false;
        return true;
      })();
      console.log('      [bench] cyclic-5 grevlex: ' + G.length + ' generators in ' + ms + ' ms (packed kernel)');
      ok('cyclic-5: packed kernel produces a valid Gröbner basis (' + G.length + ' gens, ' + ms + ' ms)', valid && G.length > 0);
    }

    // Tier-3 signature-based Gröbner (GVW): the reduced Gröbner basis is unique, so a
    // correct signature algorithm yields a basis BIT-IDENTICAL to buchberger() while
    // pruning S-pairs via the syzygy + rewrite criteria. Cross-check on several
    // systems (incl. ℚ(i) and block elimination), confirm the opt-in delegation, and
    // record the S-pair reduction on a heavier system.
    {
      const keys = (Gb) => Gb.map((p) => p.key()).sort().join('|');
      const cases = [
        { name: 'lex', sys: [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))], ord: S.monomialOrder('lex', ['x', 'y']) },
        { name: 'grevlex', sys: [mv('x').pow(2).add(mv('y')), mv('y').pow(2).add(mv('z')), mv('z').pow(2).add(mv('x'))], ord: S.monomialOrder('grevlex', ['x', 'y', 'z']) },
        { name: 'ℚ(i)', sys: [mv('x').pow(2).add(mi(1)), mv('x').mul(mv('y')).sub(S.mpolyConst(S.Gaussian.I))], ord: S.monomialOrder('grevlex', ['x', 'y']) },
        { name: 'grid', sys: [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))], ord: S.monomialOrder('grevlex', ['x', 'y']) },
        { name: 'block', sys: [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').add(mv('y'))], ord: S.eliminationOrder(['x'], ['y']) },
      ];
      let allMatch = true, detail = '';
      for (const c of cases) { if (keys(S.buchbergerSig(c.sys, c.ord)) !== keys(S.buchberger(c.sys, c.ord))) { allMatch = false; detail = c.name; break; } }
      ok('buchbergerSig (GVW) == buchberger on every case (canonical basis)' + (allMatch ? '' : ' — MISMATCH: ' + detail), allMatch);

      // opt-in delegation: buchberger(..., {signature:true}) routes through GVW
      const sig = S.buchberger(cases[1].sys, cases[1].ord, { signature: true });
      ok('buchberger({signature:true}) delegates to GVW and matches the classic path',
         keys(sig) === keys(S.buchberger(cases[1].sys, cases[1].ord)));

      // a heavier 4-variable cyclic system: GVW matches AND prunes pairs (stats reported)
      const v = (k) => mv('c' + k);
      const cyc4 = [
        v(0).add(v(1)).add(v(2)).add(v(3)),
        v(0).mul(v(1)).add(v(1).mul(v(2))).add(v(2).mul(v(3))).add(v(3).mul(v(0))),
        v(0).mul(v(1)).mul(v(2)).add(v(1).mul(v(2)).mul(v(3))).add(v(2).mul(v(3)).mul(v(0))).add(v(3).mul(v(0)).mul(v(1))),
        v(0).mul(v(1)).mul(v(2)).mul(v(3)).sub(mi(1)),
      ];
      const o4 = S.monomialOrder('grevlex', ['c0', 'c1', 'c2', 'c3']);
      const stats = {};
      const gvw4 = S.buchbergerSig(cyc4, o4, { stats });
      ok('GVW: cyclic-4 matches buchberger and reports pair stats',
         keys(gvw4) === keys(S.buchberger(cyc4, o4)) && stats.pairsProcessed > 0 && stats.basisRaw > 0);

      // GVW honors the caps (a 0-step budget throws a clear error, like buchberger)
      ok('buchbergerSig: throws a clear cap error past the step budget', (() => {
        try { S.buchbergerSig(cyc4, o4, { maxSteps: 0 }); return false; }
        catch (e) { return /signature steps|use CAS export/i.test(String(e.message || e)); }
      })());
    }

    // Code-review coverage: edge cases the review flagged as untested.
    {
      // linearReduce on an INCONSISTENT system: a nonzero constant survives the
      // substitutions ⇒ no solutions. solveZeroDim must return ok with an empty set,
      // not throw or mis-lift. {x−1, x−2, y−x}: x=1 then x−2 → −1 (a nonzero constant).
      const inc = [mv('x').sub(mi(1)), mv('x').sub(mi(2)), mv('y').sub(mv('x'))];
      const lr = S.linearReduce(inc);
      ok('linearReduce: flags an inconsistent system', lr.inconsistent === true);
      const sinc = S.solveZeroDim(inc, {});
      ok('solveZeroDim: an inconsistent system → ok with zero solutions (no throw)',
         sinc.ok === true && sinc.solutions.length === 0);

      // preprocessing must respect opts.vars: a requested variable left UNCONSTRAINED
      // after linear elimination is free ⇒ positive-dimensional over that ambient space.
      // {y−1} with vars [x,y]: y is pinned, x is free.
      const pos = S.solveZeroDim([mv('y').sub(mi(1))], { vars: ['x', 'y'] });
      ok('solveZeroDim: a free requested variable ⇒ {ok:false} (not a bogus solution)',
         pos.ok === false && /zero-dimensional|unconstrained/i.test(pos.reason));

      // the eigenvalue solver honors its dimension cap
      const grid = [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))];   // quotient dim 4
      const capped = S.solveByEigenvalues(grid, { maxEigenDim: 2 });
      ok('solveByEigenvalues: quotient dimension over the cap → {ok:false} (no throw)',
         capped.ok === false && /cap/i.test(capped.reason));
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

    // Tier-1 linear-substitution preprocessing: linearReduce strips linear variables
    // before Buchberger, and solveZeroDim lifts them back — same solution set, fewer
    // variables in the residual (the lever that lets larger systems reach a solve).
    {
      const near = (a, b) => Math.abs(a - b) < 1e-9;
      // {x²+y²−1, x−y, z−x}: z and x are linear ⇒ stripped, residual is univariate in y
      const sys = [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y')), mv('z').sub(mv('x'))];
      const lr = S.linearReduce(sys);
      const rvars = new Set(lr.reduced.flatMap((p) => [...p.vars()]));
      ok('linearReduce: eliminates the 2 linear variables (x, z)', lr.eliminated.length === 2 && lr.eliminated.map((e) => e.name).sort().join(',') === 'x,z');
      ok('linearReduce: residual system is in the single surviving variable y', rvars.size === 1 && rvars.has('y'));
      ok('linearReduce: not flagged inconsistent', lr.inconsistent === false);

      const keyset = (R) => (R.solutions || []).map((s) => ['x', 'y', 'z'].map((v) => s[v].re.toFixed(6) + ',' + s[v].im.toFixed(6)).join('|')).sort().join(' ; ');
      const withPre = S.solveZeroDim(sys, {});
      const noPre = S.solveZeroDim(sys, { preprocess: false });
      ok('solveZeroDim+preprocess: 2 solutions, reports eliminatedVars', withPre.ok && withPre.solutions.length === 2 && withPre.eliminatedVars === 2);
      ok('solveZeroDim: preprocessing yields the SAME solution set as without', keyset(withPre) === keyset(noPre));
      ok('solveZeroDim+preprocess: every lifted solution satisfies the full system',
         withPre.solutions.every((s) => sys.every((eq) => { const v = eq.evalComplex(s); return near(v.re, 0) && near(v.im, 0); })));

      // a fully-linear system collapses to a single point with no Buchberger at all
      const lin = [mv('x').sub(mi(1)), mv('y').sub(mi(2)), mv('z').sub(mv('x')).sub(mv('y'))];
      const rl = S.solveZeroDim(lin, {});
      const p = (rl.solutions || [])[0] || {};
      ok('solveZeroDim: fully-linear system → unique solution (1,2,3) via preprocessing only',
         rl.ok && rl.solutions.length === 1 && rl.eliminatedVars === 3 && near(p.x.re, 1) && near(p.y.re, 2) && near(p.z.re, 3));
    }

    // Tier-2 eigenvalue (Möller–Stetter) solving: solves zero-dim ideals that are NOT
    // in shape position — the gap the shape-lemma path rejects. ⟨x²−1, y²−1⟩ has 4
    // solutions {±1}×{±1} but no single variable expresses the others, so the lex
    // basis is not in shape position; eigenvalue solving handles it.
    {
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      const nz = (x) => { const r = +x.toFixed(4); return r === 0 ? '0' : String(r); };
      const setOf = (sols, vs) => sols.map((s) => vs.map((v) => nz(s[v].re) + ',' + nz(s[v].im)).join('|')).sort().join(' ; ');
      const grid = [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))];

      const eig = S.solveByEigenvalues(grid, {});
      ok('solveByEigenvalues: ⟨x²−1, y²−1⟩ → 4 complete solutions', eig.ok && eig.solutions.length === 4 && eig.complete === true);
      ok('solveByEigenvalues: solutions are exactly {±1}×{±1}',
         setOf(eig.solutions, ['x', 'y']) === '-1,0|-1,0 ; -1,0|1,0 ; 1,0|-1,0 ; 1,0|1,0');
      ok('solveByEigenvalues: every solution satisfies the system',
         eig.solutions.every((s) => grid.every((g) => { const z = g.evalComplex(s); return near(z.re, 0) && near(z.im, 0); })));

      // solveZeroDim now FALLS BACK to eigenvalue solving on this non-shape system
      const sz = S.solveZeroDim(grid, {});
      ok('solveZeroDim: falls back to the eigenvalue method on a non-shape-position ideal',
         sz.ok && sz.solutions.length === 4 && sz.method === 'eigenvalue' && sz.shapePosition === false);
      ok('solveZeroDim: opts.noEigen disables the fallback (returns a clear reason)',
         S.solveZeroDim(grid, { noEigen: true }).ok === false);

      // complex roots, non-shape: ⟨x²+1, y²+1⟩ → (±i)×(±i)
      const cgrid = [mv('x').pow(2).add(mi(1)), mv('y').pow(2).add(mi(1))];
      const ce = S.solveByEigenvalues(cgrid, {});
      ok('solveByEigenvalues: ⟨x²+1, y²+1⟩ → 4 solutions (±i)×(±i)',
         ce.ok && ce.solutions.length === 4 && ce.solutions.every((s) => near(Math.abs(s.x.im), 1) && near(s.x.re, 0) && near(Math.abs(s.y.im), 1) && near(s.y.re, 0)));

      // a SHAPE-position system: eigenvalue and shape-lemma agree on the solution set
      const cl = [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))];
      ok('solveByEigenvalues agrees with the shape-lemma on a shape-position system',
         setOf(S.solveByEigenvalues(cl, {}).solutions, ['x', 'y']) === setOf(S.solveZeroDim(cl, { noEigen: true }).solutions, ['x', 'y']));

      // multiplicationMatrix sanity: M_x for ⟨x²−1,y²−1⟩ squares to the identity on R/I
      const o = S.monomialOrder('grevlex', ['x', 'y']);
      const G = S.buchberger(grid, o);
      const mm = S.multiplicationMatrix(G, o, ['x', 'y'], 'x');
      ok('multiplicationMatrix: quotient dimension is 4 (the solution count)', mm.D === 4);
    }

    // Certified REAL-solution counting (Hermite / trace form). signature(H) = #distinct
    // real solutions, rank(H) = #distinct complex solutions, D = #with multiplicity.
    {
      const iC = S.mpolyConst(S.gaussInt(0, 1));
      // ⟨x²−1, y²−1⟩ — 4 solutions {±1}², all real.
      const grid = [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))];
      const r1 = S.realSolutionCount(grid, null, ['x', 'y']);
      ok('realSolutionCount: ⟨x²−1, y²−1⟩ → 4 real, 4 complex, 4 with multiplicity',
         r1.ok && r1.realCount === 4 && r1.complexCount === 4 && r1.multiplicityCount === 4);
      // ⟨x²+1, y²+1⟩ — 4 complex solutions (±i)², NONE real.
      const cgrid = [mv('x').pow(2).add(mi(1)), mv('y').pow(2).add(mi(1))];
      const r2 = S.realSolutionCount(cgrid, null, ['x', 'y']);
      ok('realSolutionCount: ⟨x²+1, y²+1⟩ → 0 real, 4 complex',
         r2.ok && r2.realCount === 0 && r2.complexCount === 4 && r2.multiplicityCount === 4);
      // ⟨x²+y²−1, x−y⟩ — 2 real solutions (±1/√2, ±1/√2) (the triangular worked example).
      const circ = [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))];
      const r3 = S.realSolutionCount(circ, null, ['x', 'y']);
      ok('realSolutionCount: ⟨x²+y²−1, x−y⟩ → 2 real, 2 complex', r3.ok && r3.realCount === 2 && r3.complexCount === 2);
      // ⟨x²⟩ — one real point x=0 of multiplicity 2: distinct counts 1, multiplicity 2.
      const dbl = S.realSolutionCount([mv('x').pow(2)], null, ['x']);
      ok('realSolutionCount: ⟨x²⟩ → 1 distinct real, multiplicity 2 (rank<dim ⇒ non-radical)',
         dbl.ok && dbl.realCount === 1 && dbl.complexCount === 1 && dbl.multiplicityCount === 2);
      // mixed: ⟨x²−1, y²+1⟩ — 4 complex, only the x=±1 with y=±i ⇒ 0 real points.
      const mix = S.realSolutionCount([mv('x').pow(2).sub(mi(1)), mv('y').pow(2).add(mi(1))], null, ['x', 'y']);
      ok('realSolutionCount: ⟨x²−1, y²+1⟩ → 0 real, 4 complex', mix.ok && mix.realCount === 0 && mix.complexCount === 4);
      // ⟨x⁴−1⟩ — standard monomials {1,x,x²,x³}; the Hermite diagonal H[x][x] = Σ p² over
      // {1,−1,i,−i} is ZERO, exercising the inertia routine's zero-pivot (swap) branch.
      // 2 real roots (±1), 4 distinct complex.
      const q4 = S.realSolutionCount([mv('x').pow(4).sub(mi(1))], null, ['x']);
      ok('realSolutionCount: ⟨x⁴−1⟩ → 2 real, 4 complex (zero-diagonal inertia pivot)',
         q4.ok && q4.realCount === 2 && q4.complexCount === 4 && q4.multiplicityCount === 4);
      // cross-check vs the eigenvalue solver: #real = eigen solutions with vanishing imag part
      const eigSols = S.solveByEigenvalues(grid, {}).solutions;
      const eigReal = eigSols.filter((s) => ['x', 'y'].every((v) => Math.abs(s[v].im) < 1e-6)).length;
      ok('realSolutionCount agrees with the eigenvalue solver on the real-solution count', r1.realCount === eigReal);
      // a genuinely complex-coefficient system is rejected (Hermitian, not the real signature)
      const cplx = S.realSolutionCount([mv('x').pow(2).sub(iC)], null, ['x']);   // x² = i
      ok('realSolutionCount: complex-coefficient system → {ok:false} (needs the reim system)',
         cplx.ok === false && /real-coefficient|reim/.test(cplx.reason || ''));
      // positive-dimensional → {ok:false}; over the cap → {ok:false}
      ok('realSolutionCount: positive-dimensional ideal → {ok:false}',
         S.realSolutionCount([mv('x').pow(2).sub(mi(1))], null, ['x', 'y']).ok === false);
      ok('realSolutionCount: quotient dimension over the cap → {ok:false} (no throw)',
         S.realSolutionCount(grid, null, ['x', 'y'], { maxHermiteDim: 2 }).ok === false);
    }

    // G5 — real-root isolation via Sturm sequences (exact, certified intervals).
    {
      const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
      const x = mv('x');
      // bracket sanity: every interval contains exactly one root (sign change or exact),
      // and the numeric midpoints match the expected roots.
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      // (x−1)(x−2)(x−3) — three rational roots 1,2,3.
      const cubic = x.sub(mi(1)).mul(x.sub(mi(2))).mul(x.sub(mi(3)));
      const r1 = S.realRootIsolate(cubic, 'x');
      ok('realRootIsolate: (x−1)(x−2)(x−3) → 3 real roots at 1,2,3',
         r1.ok && r1.count === 3 && near(r1.roots[0].approx, 1) && near(r1.roots[1].approx, 2) && near(r1.roots[2].approx, 3));
      ok('realRootIsolate: rational roots are reported EXACTLY (lo==hi)',
         r1.roots.every((rt) => rt.exact && rt.lo.equals(rt.hi)));
      // x²+1 — no real roots.
      ok('realRootIsolate: x²+1 → 0 real roots', S.realRootIsolate(x.pow(2).add(mi(1)), 'x').count === 0);
      // x²−2 — two irrational roots ±√2; intervals must bracket with opposite-sign endpoints.
      const r2 = S.realRootIsolate(x.pow(2).sub(mi(2)), 'x');
      const sqrt2 = Math.SQRT2;
      ok('realRootIsolate: x²−2 → ±√2, narrowed, sign-changing brackets',
         r2.count === 2 && near(r2.roots[1].approx, sqrt2) && near(r2.roots[0].approx, -sqrt2) &&
         r2.roots.every((rt) => rt.exact || (rt.lo.toNumber() < rt.approx && rt.approx < rt.hi.toNumber())));
      // the cardioid resolvent 2s³−3s²+1 = (s−1)²(2s+1): square-free part (s−1)(2s+1) ⇒ 2 distinct real roots 1, −1/2.
      const s = mv('s');
      const card = s.pow(3).scale(S.gaussInt(2)).sub(s.pow(2).scale(S.gaussInt(3))).add(mi(1));
      const r3 = S.realRootIsolate(card, 's');
      ok('realRootIsolate: cardioid resolvent 2s³−3s²+1 → distinct real roots −1/2 and 1',
         r3.ok && r3.count === 2 && near(r3.roots[0].approx, -0.5) && near(r3.roots[1].approx, 1));
      // a bisection midpoint that IS a root (the non-root-splitter "nudge"): x(x−1) over [−B,B]
      // has midpoint 0 a root; isolation must still find both 0 and 1.
      const r4 = S.realRootIsolate(x.mul(x.sub(mi(1))), 'x');
      ok('realRootIsolate: x(x−1) → roots 0 and 1 (root-at-splitter handled)',
         r4.count === 2 && near(r4.roots[0].approx, 0) && near(r4.roots[1].approx, 1));
      // non-real coefficients are rejected
      ok('realRootIsolate: complex-coefficient poly → {ok:false}',
         S.realRootIsolate(x.pow(2).sub(S.mpolyConst(S.gaussInt(0, 1))), 'x').ok === false);
      // realRootCount agrees with the isolation count + Descartes/known values
      ok('realRootCount: matches isolation on the cubic + cardioid resolvent',
         S.realRootCount(cubic, 'x') === 3 && S.realRootCount(card, 's') === 2 && S.realRootCount(x.pow(2).add(mi(1)), 'x') === 0);
      // count on a sub-interval (Sturm on (0, 2.5] of the cubic ⇒ roots 1,2 only)
      ok('realRootCount: sub-interval (0, 5/2] of the cubic → 2 roots',
         S.realRootCount(cubic, 'x', S.rat(0), S.rat(5, 2)) === 2);
    }

    // G2 — Sturm–Habicht (signed subresultant) real-root counting (PARAMETRIC).
    // ORACLE: the exact G5 `realRootCount` (distinct real roots). The Sturm–Habicht
    // principal-coefficient sign count must AGREE with it across an exhaustive battery
    // of random integer polynomials AND specialize correctly for symbolic coefficients.
    {
      const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
      const x = mv('x');
      const polyOf = (co) => { let p = mi(0); for (let k = 0; k < co.length; k++) if (co[k] !== 0) p = p.add(mi(co[k]).mul(x.pow(k))); return p; };
      // deterministic xorshift32 (reproducible — no Math.random in the suite)
      let seed = 0x9e3779b9 >>> 0;
      const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
      const ri = (lo, hi) => lo + (rnd() % (hi - lo + 1));
      // exhaustive cross-check: degrees 1..6, integer coeffs in [−3,3], leading ≠ 0.
      let trials = 0, agree = 0, realPath = 0;
      for (let t = 0; t < 220; t++) {
        const deg = ri(1, 6), co = [];
        for (let k = 0; k <= deg; k++) co.push(ri(-3, 3));
        if (co[deg] === 0) co[deg] = (ri(0, 1) ? 1 : -1) * ri(1, 3);
        const p = polyOf(co);
        const oracle = S.realRootCount(p, 'x');
        const r = S.realRootCountSturm(p, 'x');
        trials++;
        if (r.ok && r.count === oracle) agree++;
        if (r.ok && !r.degenerate) realPath++;   // count came from the Sturm–Habicht PmV path (not the G5 fallback)
      }
      ok('realRootCountSturm: agrees with G5 on ALL ' + trials + ' random integer polynomials (deg 1..6)', agree === trials, agree + '/' + trials);
      ok('realRootCountSturm: most cases exercised the Sturm–Habicht PmV path (not the fallback)', realPath > trials * 0.7, realPath + '/' + trials + ' non-degenerate');

      // targeted known counts (square-free, so the generic PmV path is exercised)
      ok('realRootCountSturm: (x−1)(x−2)(x−3) → 3 real roots',
         S.realRootCountSturm(x.sub(mi(1)).mul(x.sub(mi(2))).mul(x.sub(mi(3))), 'x').count === 3);
      ok('realRootCountSturm: x²+1 → 0 real roots', S.realRootCountSturm(x.pow(2).add(mi(1)), 'x').count === 0);
      ok('realRootCountSturm: x³+x (one real root, two complex) → 1', S.realRootCountSturm(x.pow(3).add(x), 'x').count === 1);

      // degenerate stratum: a multiple root makes a principal coefficient vanish ⇒ flag +
      // defer to the exact G5 count (distinct roots). (x−1)²(x+2) → 2 distinct real roots.
      {
        const p = x.sub(mi(1)).pow(2).mul(x.add(mi(2)));
        const r = S.realRootCountSturm(p, 'x');
        ok('realRootCountSturm: (x−1)²(x+2) → degenerate flagged, count = 2 distinct (G5 fallback)',
           r.ok && r.degenerate === true && r.count === 2 && r.oracle === 2);
      }

      // PARAMETRIC: the depressed cubic x³ + b·x + c. The discriminant −4b³−27c² governs the
      // 1-vs-3-real-root split; sturmHabicht's principal coefficients carry that sign condition.
      {
        const b = mv('b'), c = mv('c');
        const cubic = x.pow(3).add(b.mul(x)).add(c);
        const sh = S.sturmHabicht(cubic, 'x');
        ok('sturmHabicht: depressed cubic → degree 3, 4 principal coefficients in the params {b,c}',
           sh.ok && sh.degree === 3 && sh.stha.length === 4 &&
           sh.stha.some((t) => { const vs = t.coeff.vars(); return vs.has('b') || vs.has('c'); }));
        // specialize to (b,c) on both sides of the cusp + the cusp itself; cross-check vs G5.
        const cases = [
          { b: 0, c: 0, name: 'x³ (triple root)' },              // disc 0 — degenerate
          { b: -1, c: 0, name: 'x³−x = x(x−1)(x+1)' },           // disc 4 > 0 — 3 real
          { b: 1, c: 0, name: 'x³+x' },                          // disc −4 < 0 — 1 real
          { b: -3, c: 1, name: 'x³−3x+1' },                      // disc 81 > 0 — 3 real
          { b: 3, c: 2, name: 'x³+3x+2' },                       // disc < 0 — 1 real
        ];
        let allMatch = true, lines = [];
        for (const cs of cases) {
          const r = S.realRootCountSturm(cubic, 'x', { values: { b: S.gaussInt(cs.b), c: S.gaussInt(cs.c) } });
          const num = x.pow(3).add(mi(cs.b).mul(x)).add(mi(cs.c));
          const oracle = S.realRootCount(num, 'x');
          if (!(r.ok && r.count === oracle)) { allMatch = false; lines.push(cs.name + ': ' + (r.count) + '≠' + oracle); }
        }
        ok('realRootCountSturm: parametric cubic specializes correctly across the cusp (vs G5)', allMatch, lines.join('; '));
      }

      // degenerate / invalid input handling
      ok('sturmHabicht: degree-0 (constant in v) → ok:false', S.sturmHabicht(mi(5), 'x').ok === false);
      ok('realRootCountSturm: unresolved parameters with no values → ok:false',
         S.realRootCountSturm(mv('a').mul(x.pow(2)).add(mv('b')), 'x').ok === false);
    }

    // G1 — Comprehensive Gröbner System (Suzuki–Sato), parametric.
    // ORACLE: each returned segment's gb must SPECIALIZE to the freshly-computed reduced GB
    // of the specialized system at random parameter points INSIDE the segment.
    {
      const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
      const grev = S.monomialOrder('grevlex');
      // reduced-GB fingerprint of a numeric (param-free) polynomial set
      const gbKey = (polys) => S.buchberger(polys.filter((p) => p && !p.isZero()), grev).map((g) => g.key()).sort().join('|') || 'EMPTY';
      const specialize = (polys, vals) => { const sub = {}; for (const k of Object.keys(vals)) sub[k] = mi(vals[k]); return polys.map((p) => p.subst(sub)); };
      // sample a parameter point in { eqs = 0, neqs ≠ 0 }; eqs handled only when each is a
      // single-parameter monomial (⇒ that param = 0) — enough for the test strata.
      let seed = 0x1234567 >>> 0;
      const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
      const sample = (eqs, neqs, params) => {
        for (let a = 0; a < 60; a++) {
          const vals = {}; let okEq = true;
          for (const e of eqs) {
            const vs = [...e.vars()];
            if (vs.length === 1 && e.degreeIn(vs[0]) === 1 && e.coeffsIn(vs[0])[0].isZero()) vals[vs[0]] = 0;
            else { okEq = false; break; }
          }
          if (!okEq) return null;
          for (const p of params) if (!(p in vals)) vals[p] = (rnd() % 9) - 4;
          const em = {}; for (const k of Object.keys(vals)) em[k] = { re: vals[k], im: 0 };
          let good = true;
          for (const e of eqs) { const z = e.evalComplex(em); if (Math.abs(z.re) + Math.abs(z.im) > 1e-9) { good = false; break; } }
          if (good) for (const n of neqs) { const z = n.evalComplex(em); if (Math.abs(z.re) + Math.abs(z.im) < 1e-9) { good = false; break; } }
          if (good) return vals;
        }
        return null;
      };
      const checkCGS = (label, F, params, expectSegs) => {
        const r = S.comprehensiveGroebnerSystem(F, params);
        ok(label + ': ok', r.ok, r.reason);
        if (!r.ok) return r;
        if (expectSegs != null) ok(label + ': ' + expectSegs + ' segment(s)', r.segments.length === expectSegs, 'got ' + r.segments.length);
        let verified = 0, sampled = 0;
        for (const seg of r.segments) {
          for (let t = 0; t < 3; t++) {
            const vals = sample(seg.eqs, seg.neqs, params);
            if (!vals) break;
            sampled++;
            const fk = gbKey(specialize(F, vals)), gk = gbKey(specialize(seg.gb, vals));
            if (fk === gk) verified++;
          }
        }
        ok(label + ': every sampled in-segment point matches the freshly-computed GB', sampled > 0 && verified === sampled, verified + '/' + sampled);
        return r;
      };

      const x = mv('x'), y = mv('y'), a = mv('a'), b = mv('b'), c = mv('c');
      // a·x − 1: generic a≠0 → {x − 1/a}; a = 0 → ⟨1⟩ (no solution). Two segments.
      const r1 = checkCGS('CGS a·x−1', [a.mul(x).sub(mi(1))], ['a'], 2);
      ok('CGS a·x−1: exactly one no-solution segment (a=0)', r1.ok && r1.segments.filter((s) => s.empty).length === 1);
      // parametric quadratic a·x²+b·x+c: a≠0 (quadratic), a=0&b≠0 (linear), a=0&b=0&c≠0 (no soln), a=b=c=0 (whole line)
      checkCGS('CGS a·x²+b·x+c', [a.mul(x.pow(2)).add(b.mul(x)).add(c)], ['a', 'b', 'c'], null);
      // two unknowns, one parameter, no strata (constant leading coeffs): single segment.
      checkCGS('CGS {x−a, y−x²} (no branching)', [x.sub(a), y.sub(x.pow(2))], ['a'], 1);

      // degenerate input / cap behavior
      ok('CGS: no non-parameter variable → ok:false', S.comprehensiveGroebnerSystem([a.sub(mi(1))], ['a']).ok === false);
      ok('CGS: empty system → trivial single (zero-ideal) segment', S.comprehensiveGroebnerSystem([], ['a']).segments.length === 1);
    }

    // G10 — SOS / Positivstellensatz certificate CHECKER (exact).
    {
      const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
      const x = mv('x'), y = mv('y');
      // explicit square: x²−2x+1 = (x−1)²
      ok('verifySOS: x²−2x+1 = (x−1)² (sum of squares)',
         S.verifySOS(x.pow(2).sub(mi(2).mul(x)).add(mi(1)), { squares: [x.sub(mi(1))] }).ok === true);
      // weighted squares: 2x²+8 = 2·x² + 8·1²  (nonnegative weights)
      ok('verifySOS: 2x²+8 = 2·x² + 8·1² (weighted squares)',
         S.verifySOS(mi(2).mul(x.pow(2)).add(mi(8)), { squares: [{ coeff: 2, poly: x }, { coeff: { n: 8, d: 1 }, poly: mi(1) }] }).ok === true);
      // a NEGATIVE weight is not a valid SOS
      ok('verifySOS: a negative square weight ⇒ ok:false',
         S.verifySOS(x.pow(2).neg(), { squares: [{ coeff: -1, poly: x }] }).ok === false);
      // identity must hold EXACTLY: x²+1 ≠ (x)²
      {
        const r = S.verifySOS(x.pow(2).add(mi(1)), { squares: [x] });
        ok('verifySOS: x²+1 vs x² ⇒ ok:false, identity:false', r.ok === false && r.identity === false);
      }
      // Gram (PSD) form: x²+2xy+y² = [x,y]·[[1,1],[1,1]]·[x,y]ᵀ, Gram PSD (eigvals 2,0)
      ok('verifySOS: Gram form x²+2xy+y² with a PSD rank-1 Gram ⇒ verified',
         S.verifySOS(x.pow(2).add(mi(2).mul(x).mul(y)).add(y.pow(2)), { monomials: [x, y], gram: [[1, 1], [1, 1]] }).ok === true);
      // identity holds but the Gram is INDEFINITE ⇒ ok:false (psd:false), identity:true
      {
        const r = S.verifySOS(x.pow(2).sub(y.pow(2)), { monomials: [x, y], gram: [[1, 0], [0, -1]] });
        ok('verifySOS: x²−y² with an indefinite Gram ⇒ identity true, psd false, ok false',
           r.ok === false && r.identity === true && r.psd === false);
      }
      // non-symmetric Gram is rejected
      ok('verifySOS: a non-symmetric Gram ⇒ ok:false',
         S.verifySOS(x.pow(2), { monomials: [x, y], gram: [[1, 2], [0, 0]] }).ok === false);
      // Positivstellensatz: x+y ≥ 0 on { x ≥ 0, y ≥ 0 }  via  x+y = 0 + x·1 + y·1
      ok('verifySOS: x+y = 0 + x·1² + y·1² (Positivstellensatz on x≥0, y≥0)',
         S.verifySOS(x.add(y), { base: { squares: [] }, constraints: [
           { g: x, multiplier: { squares: [mi(1)] } },
           { g: y, multiplier: { squares: [mi(1)] } },
         ] }).ok === true);
      // Positivstellensatz with a WRONG multiplier ⇒ identity fails
      ok('verifySOS: a Positivstellensatz whose identity fails ⇒ ok:false',
         S.verifySOS(x.add(y), { constraints: [{ g: x, multiplier: { squares: [mi(1)] } }] }).ok === false);
    }

    // G7 — multivariate GCD over ℚ(i) (recursive primitive PRS) + zero-dim radical.
    {
      const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
      const x = mv('x'), y = mv('y');
      const divides = (f, q) => { try { S.mpolyExactDiv(f, q); return true; } catch (e) { return false; } };
      // univariate: gcd(x²−1, x−1) = x−1
      ok('gcdMV: gcd(x²−1, x−1) = x−1', S.gcdMV(x.pow(2).sub(mi(1)), x.sub(mi(1))).equals(x.sub(mi(1))));
      // coprime ⇒ 1
      ok('gcdMV: gcd(x, y) = 1 (coprime)', S.gcdMV(x, y).equals(mi(1)));
      ok('gcdMV: gcd(x+1, x+2) = 1', S.gcdMV(x.add(mi(1)), x.add(mi(2))).equals(mi(1)));
      // bivariate: gcd((x−y)(x+y), x−y) = x−y (up to the monic normalization)
      const xmy = x.sub(y), xpy = x.add(y);
      ok('gcdMV: gcd((x−y)(x+y), x−y) = x−y', S.gcdMV(xmy.mul(xpy), xmy).equals(S.gcdList([xmy])));
      // the defining identity: gcd(f·h, g·h) = h·gcd(f,g); with f,g coprime ⇒ = h (monic-normalized)
      const f = x.add(y), g = x.sub(y), h = x.pow(2).add(y.pow(2)).add(mi(1));
      const G = S.gcdMV(f.mul(h), g.mul(h));
      ok('gcdMV: gcd(f·h, g·h) = h for coprime f,g (up to a unit)', G.equals(S.gcdList([h])));
      ok('gcdMV: the GCD divides both inputs exactly', divides(f.mul(h), G) && divides(g.mul(h), G));
      // ℚ(i) coefficients: gcd((x−i)(x+1), (x−i)) = x−i
      const iC = S.mpolyConst(S.gaussInt(0, 1));
      const xmi = x.sub(iC);
      ok('gcdMV: gcd((x−i)(x+1), x−i) = x−i over ℚ(i)', S.gcdMV(xmi.mul(x.add(mi(1))), xmi).equals(S.gcdList([xmi])));
      // gcdList of several
      ok('gcdList: gcd(x²−1, x²−x, x−1) = x−1', S.gcdList([x.pow(2).sub(mi(1)), x.pow(2).sub(x), x.sub(mi(1))]).equals(x.sub(mi(1))));

      // ---- zero-dim radical (Seidenberg) ----
      const ord1 = S.monomialOrder('grevlex', ['x']);
      // ⟨x²⟩ → √ = ⟨x⟩ : quotient dimension drops 2 → 1
      const r1 = S.radicalZeroDim([x.pow(2)], { vars: ['x'] });
      ok('radicalZeroDim: √⟨x²⟩ = ⟨x⟩ (dim 2 → 1)',
         r1.ok && S.quotientDimension(r1.basis, ord1, ['x']) === 1 && r1.basis.length === 1 && r1.basis[0].equals(x));
      // ⟨(x−1)²(x−2)⟩ → √ has the two distinct roots 1,2 (dim 3 → 2)
      const p2 = x.sub(mi(1)).pow(2).mul(x.sub(mi(2)));
      const r2 = S.radicalZeroDim([p2], { vars: ['x'] });
      ok('radicalZeroDim: √⟨(x−1)²(x−2)⟩ has dim 2 (distinct roots 1,2)',
         r2.ok && S.quotientDimension(r2.basis, ord1, ['x']) === 2);
      // ⟨x², y²⟩ → ⟨x, y⟩ : the single point (0,0), dim 4 → 1
      const ord2 = S.monomialOrder('grevlex', ['x', 'y']);
      const r3 = S.radicalZeroDim([x.pow(2), y.pow(2)], { vars: ['x', 'y'] });
      ok('radicalZeroDim: √⟨x², y²⟩ = ⟨x, y⟩ (dim 4 → 1)',
         r3.ok && S.quotientDimension(r3.basis, ord2, ['x', 'y']) === 1);
      // an already-radical ideal is unchanged in dimension: ⟨x²−1⟩ stays dim 2
      const r4 = S.radicalZeroDim([x.pow(2).sub(mi(1))], { vars: ['x'] });
      ok('radicalZeroDim: a radical ideal ⟨x²−1⟩ keeps dim 2', r4.ok && S.quotientDimension(r4.basis, ord1, ['x']) === 2);
    }

    // G6 — Rational Univariate Representation (separating form t, min poly f(t), coords xᵢ=gᵢ(t)).
    // ⚠ from-scratch power-basis RUR (not Rouillier's trace formula); oracle-checked against the
    // eigenvalue solver. The oracle needs no univariate root finder: it takes the eigen solutions,
    // forms each one's t-value, and checks f(t)=0 and gᵢ(t)=xᵢ there.
    {
      const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
      const x = mv('x'), y = mv('y');
      const capprox = (a, b) => Math.hypot(a.re - b.re, a.im - b.im) < 1e-6;
      function checkRUR(label, sys, vrs, expDeg) {
        const rur = S.rationalUnivariateRep(sys, { vars: vrs });
        ok(label + ': ok, min poly degree ' + expDeg, rur.ok && rur.degree === expDeg, rur.reason || ('deg ' + (rur && rur.degree)));
        if (!rur.ok) return;
        const eig = S.solveByEigenvalues(sys, { vars: vrs });
        if (!eig.ok) { ok(label + ': eigen cross-check available', false, eig.reason); return; }
        const tval = (sol) => { let re = 0, im = 0; vrs.forEach((v, i) => { re += rur.separating[i] * sol[v].re; im += rur.separating[i] * sol[v].im; }); return { re: re, im: im }; };
        let good = true;
        for (const sol of eig.solutions) {
          const tv = tval(sol);
          const fv = rur.minPoly.evalComplex({ [rur.tName]: tv });
          if (Math.hypot(fv.re, fv.im) > 1e-5) good = false;
          for (const v of vrs) if (!capprox(rur.coords[v].evalComplex({ [rur.tName]: tv }), sol[v])) good = false;
        }
        ok(label + ': f(t)=0 at every solution & gᵢ(t) reproduce each coordinate', good);
        const tset = new Set(eig.solutions.map((sol) => { const t = tval(sol); return t.re.toFixed(4) + ',' + t.im.toFixed(4); }));
        ok(label + ': the separating form yields ' + expDeg + ' distinct t-values', tset.size === expDeg);
      }
      checkRUR('RUR ⟨x²−2, y−x⟩', [x.pow(2).sub(mi(2)), y.sub(x)], ['x', 'y'], 2);
      checkRUR('RUR ⟨x²−1, y²−1⟩ (4 points)', [x.pow(2).sub(mi(1)), y.pow(2).sub(mi(1))], ['x', 'y'], 4);
      checkRUR('RUR ⟨x²⟩ (radical ⟨x⟩, single point)', [x.pow(2)], ['x'], 1);
      ok('RUR: positive-dimensional ⇒ ok:false', !S.rationalUnivariateRep([x.pow(2).sub(mi(1))], { vars: ['x', 'y'] }).ok);
    }

    // Schur–Cohn: exact count of roots inside the open unit disk via the Hermitian
    // C = A·Aᴴ − B·Bᴴ inertia (inside = #neg, outside = #pos, on-circle ⊂ nullity).
    // ascending Gaussian coeff arrays; gr = real rational a/d, gI = integer a+bi.
    {
      const gr = (n, d) => S.gauss(S.rat(n, d == null ? 1 : d), S.rat(0));
      const gI = (a, b) => S.gaussInt(a, b || 0);
      const sc = (arr) => S.schurCohn(arr);
      const shows = (r, ins, out, onc, deg) =>
        r.inside === ins && r.outside === out && r.onCircle === onc && r.degenerate === deg &&
        r.inside + r.outside + r.onCircle === r.degree;
      // (1) z − 1/2: single real root 1/2 strictly inside.
      ok('schurCohn: z − 1/2 → 1 inside (root 1/2)', shows(sc([gr(-1, 2), gI(1)]), 1, 0, 0, false));
      // (2) z − 2 and (3) z + 2: a single root outside.
      ok('schurCohn: z − 2 → 1 outside', shows(sc([gI(-2), gI(1)]), 0, 1, 0, false));
      ok('schurCohn: z + 2 → 1 outside', shows(sc([gI(2), gI(1)]), 0, 1, 0, false));
      // (4) 2z − 1: scaling-invariant — still root 1/2 inside.
      ok('schurCohn: 2z − 1 → 1 inside (leading-coeff invariance)', shows(sc([gI(-1), gI(2)]), 1, 0, 0, false));
      // (5) z² − 1/4 = (z−½)(z+½): both roots inside.
      ok('schurCohn: z² − 1/4 → 2 inside', shows(sc([gr(-1, 4), gI(0), gI(1)]), 2, 0, 0, false));
      // (6) z² − 4: both roots outside.
      ok('schurCohn: z² − 4 → 2 outside', shows(sc([gI(-4), gI(0), gI(1)]), 0, 2, 0, false));
      // (7) z² − 1: roots ±1 on the circle ⇒ nullity 2, degenerate (C = 0).
      ok('schurCohn: z² − 1 → on-circle, degenerate', shows(sc([gI(-1), gI(0), gI(1)]), 0, 0, 2, true));
      // (8) z² + 1: roots ±i on the circle ⇒ nullity 2, degenerate.
      ok('schurCohn: z² + 1 → on-circle, degenerate', shows(sc([gI(1), gI(0), gI(1)]), 0, 0, 2, true));
      // (9) THE DEGENERACY, now RESOLVED EXACTLY: (z−½)(z−2) = z² − 5/2·z + 1 is SELF-INVERSIVE
      //     (reciprocal pair ½ inside / 2 outside) ⇒ C singular WITHOUT any on-circle root. The
      //     self-inversive peel recovers the exact split: 1 inside, 1 outside, 0 on-circle, and
      //     since onCircle = 0 it is NOT a boundary degeneracy ⇒ degenerate:false, resolved:true.
      {
        const r = sc([gI(1), gr(-5, 2), gI(1)]);
        ok('schurCohn: z² − 5/2·z + 1 (self-inversive) → resolved 1 inside / 1 outside, not degenerate',
           shows(r, 1, 1, 0, false) && r.resolved === true);
      }
      // (10) (z−½)(z−3) = z² − 7/2·z + 3/2: NOT self-inversive (root product 3/2 ≠ 1) ⇒
      //      nonsingular C ⇒ certified 1 inside / 1 outside.
      ok('schurCohn: z² − 7/2·z + 3/2 → 1 inside, 1 outside (certified, non-degenerate)',
         shows(sc([gr(3, 2), gr(-7, 2), gI(1)]), 1, 1, 0, false));
      // (11) complex root inside: z − i/2 (|i/2| = 1/2 < 1).
      ok('schurCohn: z − i/2 → 1 inside (complex root)', shows(sc([S.gauss(S.rat(0), S.rat(-1, 2)), gI(1)]), 1, 0, 0, false));
      // edge: a constant has no roots; trailing (high-degree) zeros are trimmed.
      ok('schurCohn: constant → no roots', shows(sc([gI(3)]), 0, 0, 0, false));
      ok('schurCohn: trailing zeros trimmed (z − 1/2 padded) → 1 inside',
         shows(sc([gr(-1, 2), gI(1), gI(0), gI(0)]), 1, 0, 0, false));
      // (12) CUSP: φ′ = 1 + z has its only root at z = −1, exactly ON the circle ⇒ the resolved
      //      count is 1 on-circle, 0 inside (the cardioid's boundary cusp). degenerate stays true
      //      (a genuine boundary zero), but resolved:true with the exact split.
      {
        const r = sc([gI(1), gI(1)]);
        ok('schurCohn: 1 + z (cusp) → resolved 0 inside / 1 on-circle, degenerate (boundary zero)',
           r.inside === 0 && r.outside === 0 && r.onCircle === 1 && r.degenerate === true && r.resolved === true);
      }
      // (13) MULTIPLE on-circle root: (1+z)² → the square-free reduction counts DISTINCT
      //      locations, so 1 on-circle / 0 inside (sum < degree because of the multiplicity).
      {
        const r = sc([gI(1), gI(2), gI(1)]);
        ok('schurCohn: (1+z)² → 1 distinct on-circle root, 0 inside (square-free reduced)',
           r.inside === 0 && r.onCircle === 1 && r.resolved === true);
      }
      // unitCircleRootCount (the exact on-circle primitive, reused by the boundary test):
      ok('unitCircleRootCount: 1+z → 1 (root −1 on the circle)', S.unitCircleRootCount([gI(1), gI(1)]).count === 1);
      ok('unitCircleRootCount: z²+1 → 2 (roots ±i on the circle)', S.unitCircleRootCount([gI(1), gI(0), gI(1)]).count === 2);
      ok('unitCircleRootCount: z²−¼ → 0 (both roots inside)', S.unitCircleRootCount([gr(-1, 4), gI(0), gI(1)]).count === 0);
    }

    // Resolvent — the univariate eliminant χ_v(x) = det(x·I − M_v) of a zero-dim ideal.
    // squareFreePart = distinct v-values; a repeated root (distinctDegree < degree, disc 0)
    // ⇔ coincident solutions / a degeneracy.
    {
      // ⟨x²−1, y²−1⟩ in x: each x-value (±1) sits in 2 y-fibres ⇒ χ_x = (x²−1)² ⇒ degenerate.
      const gr2 = [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))];
      const rx = S.resolvent(gr2, 'x', ['x', 'y']);
      ok('resolvent: ⟨x²−1,y²−1⟩ in x → χ_x = (x²−1)² (deg 4, 2 distinct), degenerate',
         rx.ok && rx.degree === 4 && rx.distinctDegree === 2 && rx.degenerate === true &&
         rx.poly.equals(mv('x').pow(2).sub(mi(1)).pow(2)) && rx.squareFree.equals(mv('x').pow(2).sub(mi(1))));
      // separating ⟨x²−1, y−x⟩ in x: χ_x = x²−1 (deg 2 = #solutions), non-degenerate, disc ≠ 0.
      const sep = [mv('x').pow(2).sub(mi(1)), mv('y').sub(mv('x'))];
      const rs = S.resolvent(sep, 'x', ['x', 'y']);
      ok('resolvent: ⟨x²−1,y−x⟩ in x → χ_x = x²−1, degree 2, non-degenerate (disc ≠ 0)',
         rs.ok && rs.degree === 2 && rs.distinctDegree === 2 && rs.degenerate === false &&
         rs.poly.equals(mv('x').pow(2).sub(mi(1))) && !!rs.discriminant && !rs.discriminant.isZero());
      ok('resolvent: positive-dimensional ideal → {ok:false} (no finite resolvent)',
         S.resolvent([mv('x').pow(2).sub(mi(1))], 'x', ['x', 'y']).ok === false);
      ok('resolvent: a variable not in the system → {ok:false}',
         S.resolvent(gr2, 'z', ['x', 'y']).ok === false);
    }

    // Triangular decomposition (Wu-style pseudo-elimination) — the alternative eliminator.
    {
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      // pseudo-remainder worked step: prem(x²+y²−1, x−y, x) = 2y²−1.
      const prem = S.pseudoRemainder(mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y')), 'x');
      ok('pseudoRemainder: prem(x²+y²−1, x−y, x) = 2y²−1', prem.equals(mv('y').pow(2).mul(mi(2)).sub(mi(1))));
      ok('pseudoRemainder: g a unit in the variable ⇒ 0', S.pseudoRemainder(mv('x').pow(2), mi(3), 'x').isZero());

      // triangularize the circle×diagonal: chain [2y²−1, x−y] (lowest var first), zero-dim.
      const t = S.triangularize([mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))], ['x', 'y']);
      ok('triangularize: ⟨x²+y²−1, x−y⟩ → a 2-element triangular chain, zero-dim',
         t.ok && t.chain.length === 2 && t.mainVars.join(',') === 'y,x' && t.freeVars.length === 0 && t.contradiction === false);
      ok('triangularize: the lowest element is univariate (degree 2 in y) ⇒ ≤2 branches',
         t.chain[0].vars().size === 1 && t.chain[0].degreeIn('y') === 2);
      // the chain vanishes at the actual solutions (cross-check vs the solver)
      const sol = S.solveZeroDim([mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))], {});
      ok('triangularize: every chain polynomial vanishes at each solution',
         sol.ok && sol.solutions.every((s) => t.chain.every((g) => { const z = g.evalComplex(s); return near(z.re, 0) && near(z.im, 0); })));

      // a free variable ⇒ positive-dimensional family
      const f = S.triangularize([mv('x').sub(mv('y'))], ['x', 'y']);
      ok('triangularize: ⟨x−y⟩ → y is free (positive-dimensional)', f.ok && f.freeVars.join(',') === 'y' && f.mainVars.join(',') === 'x');

      // an inconsistent system ⇒ contradiction (no solution), not a throw
      const c = S.triangularize([mv('x'), mv('x').sub(mi(1))], ['x']);
      ok('triangularize: ⟨x, x−1⟩ → contradiction (no solution)', c.ok && c.contradiction === true);

      // cap: a tiny term cap routes to {ok:false} rather than running away
      ok('triangularize: a size cap → {ok:false, reason} (no throw)',
         S.triangularize([mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))], ['x', 'y'], { maxTerms: 1 }).ok === false);

      // L5 — monomial-order heuristic: solveZeroDim's solutions are order-independent
      // (the retry with a reversed order is therefore safe).
      const sys = [mv('x').pow(2).add(mv('y').pow(2)).sub(mi(1)), mv('x').sub(mv('y'))];
      const nz = (x) => { const r = +x.toFixed(4); return r === 0 ? '0' : String(r); };
      const setOf = (sols, vs) => sols.map((s) => vs.map((v) => nz(s[v].re) + ',' + nz(s[v].im)).join('|')).sort().join(' ; ');
      const a5 = S.solveZeroDim(sys, { noEigen: true });
      const b5 = S.solveZeroDim(sys, { noEigen: true, order1: S.monomialOrder('grevlex', ['y', 'x']) });
      ok('solveZeroDim L5: solutions are independent of the grevlex variable order',
         a5.ok && b5.ok && setOf(a5.solutions, ['x', 'y']) === setOf(b5.solutions, ['x', 'y']));
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
      // runJob solveZeroDim on a NON-shape ideal → eigenvalue fallback survives the worker boundary
      const rgrid = S.runJob('solveZeroDim', { polys: [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))].map((q) => q.termList()), vars: ['x', 'y'] });
      ok('runJob solveZeroDim: eigenvalue fallback returns 4 JSON-safe solutions (method tagged)',
         rgrid.ok && rgrid.solutions.length === 4 && rgrid.method === 'eigenvalue');
      // runJob classify — existence/uniqueness over a real system (the worker twin of
      // AlgebraStore._classifyImpl): Gröbner + zero-dim test + Hermite real count, JSON-safe.
      const rcl = S.runJob('classify', { polys: [mv('x').pow(2).sub(mi(1)), mv('y').pow(2).sub(mi(1))].map((q) => q.termList()), vars: ['x', 'y'] });
      ok('runJob classify: ⟨x²−1,y²−1⟩ → zero-dim, 4 real solutions (JSON-safe)',
         rcl.ok && rcl.zeroDim === true && rcl.realCount === 4 && rcl.complexCount === 4 && rcl.multiplicity === 4);
      const rincon = S.runJob('classify', { polys: [mv('x').sub(mi(1)), mv('x')].map((q) => q.termList()), vars: ['x'] });
      ok('runJob classify: inconsistent system (1 ∈ I) flagged', rincon.ok && rincon.inconsistent === true && rincon.realCount === 0);
      const rpos = S.runJob('classify', { polys: [mv('x')].map((q) => q.termList()), vars: ['x', 'y'] });
      ok('runJob classify: ⟨x⟩ in (x,y) is positive-dimensional', rpos.ok && rpos.zeroDim === false && rpos.realCount === null);
      ok('runJob: unknown op throws', (() => { try { S.runJob('nope', {}); return false; } catch (e) { return /unknown/i.test(String(e.message || e)); } })());
    }
  }

  // ---- factor(poly): radical factorization for case-splitting V(p)=⋃V(fᵢ) ----
  {
    const x = S.mpolyVar('x'), y = S.mpolyVar('y'), k = (n) => S.mpolyInt(n);
    const ra = (t) => [BigInt(Math.round(t)), 1n];            // nearest-integer rationalizer (Gaussian-integer roots)
    const opts = { ratApprox: ra };                            // default Durand–Kerner root finder (faber-analysis loaded)
    const divides = (f, p) => { try { S.mpolyExactDiv(p, f); return true; } catch (e) { return false; } };

    // (3) univariate over ℚ: (x−1)(x−2)
    const fu = S.factor(x.sub(k(1)).mul(x.sub(k(2))), opts);
    ok('factor: univariate (x−1)(x−2) → 2 factors, each dividing the input',
       fu.ok && fu.factors.length === 2 && fu.factors.every((f) => divides(f, x.sub(k(1)).mul(x.sub(k(2))))));

    // (3) univariate over ℚ(i): x²+1 = (x−i)(x+i)
    const p2 = x.mul(x).add(k(1));
    const fi = S.factor(p2, opts);
    ok('factor: x²+1 → (x−i)(x+i) over ℚ(i), each dividing', fi.ok && fi.factors.length === 2 && fi.factors.every((f) => divides(f, p2)));

    // (1) monomial: x²−xy = x·(x−y)
    const p3 = x.mul(x).sub(x.mul(y));
    const f3 = S.factor(p3, opts);
    ok('factor: x²−xy → x and (x−y), each dividing', f3.ok && f3.factors.length === 2 && f3.factors.every((f) => divides(f, p3)) && f3.factors.some((f) => f.equals(x)));

    // (2) separable product with mixed monomials: (x−1)(y−2) = xy−2x−y+2
    const p4 = x.sub(k(1)).mul(y.sub(k(2)));
    const f4 = S.factor(p4, opts);
    ok('factor: separable (x−1)(y−2) (despite the xy cross term) → 2 factors, each dividing',
       f4.ok && f4.factors.length === 2 && f4.factors.every((f) => divides(f, p4)));

    // radical: (x−1)²(x−2) → DISTINCT {x−1, x−2}
    const p6 = x.sub(k(1)).pow(2).mul(x.sub(k(2)));
    const f6 = S.factor(p6, opts);
    ok('factor: (x−1)²(x−2) → distinct radical factors {x−1, x−2}, each dividing',
       f6.ok && f6.factors.length === 2 && f6.factors.every((f) => divides(f, p6)));

    // irreducible: xy+1 (separable test keeps it whole; no monomial/univariate split)
    const f5 = S.factor(x.mul(y).add(k(1)), opts);
    ok('factor: xy+1 is irreducible by our methods → ok:false', !f5.ok && f5.factors.length === 1);

    // a nonzero constant has no nontrivial factorization
    ok('factor: a constant → ok:false', !S.factor(k(3), opts).ok);

    // ---- full ℚ(i) univariate factorization (the closed KNOWN GAP) ----
    // Helpers: multiply a factor list back, and a unit (degree-0, nonzero) test.
    const iC = S.mpolyConst(S.gauss(S.rat(0n, 1n), S.rat(1n, 1n)));        // i
    const mulAll = (fs) => fs.reduce((acc, f) => acc.mul(f), k(1));
    const dividesAndUnitBack = (fs, p) => {
      if (!fs.every((f) => divides(f, p))) return false;                  // each divides
      let q; try { q = S.mpolyExactDiv(p, mulAll(fs)); } catch (e) { return false; }
      return q.vars().size === 0 && !q.isZero();                          // product = p up to a unit
    };

    // THE GAP: x⁴+x²+1 = (x²+x+1)(x²−x+1), both IRREDUCIBLE over ℚ(i) (deg ≥ 2).
    const g6 = x.pow(4).add(x.pow(2)).add(k(1));
    const fg6 = S.factor(g6, opts);
    ok('factor: x⁴+x²+1 → {x²+x+1, x²−x+1} (irreducible-over-ℚ(i) quadratics separated)',
       fg6.ok && fg6.factors.length === 2 &&
       fg6.factors.every((f) => f.degreeIn('x') === 2) && dividesAndUnitBack(fg6.factors, g6));

    // product of two distinct irreducible-over-ℚ(i) quadratics: (x²+x+1)(x²+2).
    const q2 = x.pow(2).add(x).add(k(1)).mul(x.pow(2).add(k(2)));
    const fq2 = S.factor(q2, opts);
    ok('factor: (x²+x+1)(x²+2) → 2 irreducible quadratics, multiplying back to the input',
       fq2.ok && fq2.factors.length === 2 && dividesAndUnitBack(fq2.factors, q2));

    // conjugate-pair split needing the SHIFTED norm trick: (x²+ix+1)(x²−ix+1) = x⁴+3x²+1,
    // a rational quartic irreducible over ℚ but splitting into two conjugate ℚ(i) quadratics.
    const hConj = x.pow(2).add(iC.mul(x)).add(k(1));
    const cq = hConj.mul(x.pow(2).sub(iC.mul(x)).add(k(1)));
    const fcq = S.factor(cq, opts);
    ok('factor: x⁴+3x²+1 → two conjugate ℚ(i) quadratics (shifted-norm recovery)',
       fcq.ok && fcq.factors.length === 2 &&
       fcq.factors.every((f) => f.degreeIn('x') === 2) && dividesAndUnitBack(fcq.factors, cq));

    // x⁴+1 splits over ℚ(i) as (x²−i)(x²+i) (irreducible over ℚ, reducible over ℚ(i)).
    const f41 = S.factor(x.pow(4).add(k(1)), opts);
    ok('factor: x⁴+1 → (x²−i)(x²+i) over ℚ(i)',
       f41.ok && f41.factors.length === 2 && dividesAndUnitBack(f41.factors, x.pow(4).add(k(1))));

    // mixed linear + quadratic over ℚ(i): (x−1)(x−2)(x²+x+1) → 3 distinct factors.
    const mix = x.sub(k(1)).mul(x.sub(k(2))).mul(x.pow(2).add(x).add(k(1)));
    const fmix = S.factor(mix, opts);
    ok('factor: (x−1)(x−2)(x²+x+1) → 3 factors (linear + irreducible quadratic)',
       fmix.ok && fmix.factors.length === 3 && dividesAndUnitBack(fmix.factors, mix));

    // a genuinely irreducible-over-ℚ(i) quartic stays whole: x⁴+4x²+1 (roots ±i√(2±√3)).
    const irrQ = S.factor(x.pow(4).add(x.pow(2).mul(k(4))).add(k(1)), opts);
    ok('factor: x⁴+4x²+1 is irreducible over ℚ(i) → ok:false', !irrQ.ok && irrQ.factors.length === 1);

    // ---- factorOverQ: Berlekamp–Zassenhaus over ℚ (distinct rational irreducibles) ----
    const foq = S.factorOverQ(x.pow(4).add(x.pow(2).mul(k(5))).add(k(4)), 'x');   // (x²+1)(x²+4)
    ok('factorOverQ: x⁴+5x²+4 → {x²+1, x²+4} over ℚ',
       foq.length === 2 && foq.every((f) => f.degreeIn('x') === 2) &&
       dividesAndUnitBack(foq, x.pow(4).add(x.pow(2).mul(k(5))).add(k(4))));
    // an irreducible rational poly comes back whole (degree preserved).
    const foq2 = S.factorOverQ(x.pow(2).add(x).add(k(1)), 'x');
    ok('factorOverQ: x²+x+1 irreducible over ℚ → single factor', foq2.length === 1 && foq2[0].degreeIn('x') === 2);

    // ---- qiFactor: the complete ℚ(i) irreducible factorization, directly ----
    const qf = S.qiFactor(x.pow(4).add(x.pow(2)).add(k(1)), 'x');
    ok('qiFactor: x⁴+x²+1 → 2 irreducible factors covering the full degree',
       qf.length === 2 && qf.reduce((a, f) => a + f.degreeIn('x'), 0) === 4 &&
       dividesAndUnitBack(qf, x.pow(4).add(x.pow(2)).add(k(1))));
    // each returned factor is itself irreducible (re-factoring returns it whole).
    ok('qiFactor: every returned factor is irreducible over ℚ(i)',
       qf.every((f) => S.qiFactor(f, 'x').length === 1));

    // ---- univariate GCD + square-free over ℚ(i) ----
    // gcd((x−1)(x−2), (x−1)(x−3)) = x−1 (monic)
    const g1 = S.univariateGCD(x.sub(k(1)).mul(x.sub(k(2))), x.sub(k(1)).mul(x.sub(k(3))), 'x');
    ok('univariateGCD: gcd((x−1)(x−2),(x−1)(x−3)) = x−1', g1.equals(x.sub(k(1))));
    // coprime → gcd is a unit (degree 0)
    const g2 = S.univariateGCD(x.sub(k(1)), x.sub(k(2)), 'x');
    ok('univariateGCD: coprime linear factors → constant gcd', g2.degreeIn('x') === 0 && !g2.isZero());
    // gcd over ℚ(i): gcd((x−i)(x−1), (x−i)(x+1)) = x−i
    const xi = x.sub(S.mpolyConst(S.gauss(S.rat(0n, 1n), S.rat(1n, 1n))));   // x − i
    const g3 = S.univariateGCD(xi.mul(x.sub(k(1))), xi.mul(x.add(k(1))), 'x');
    ok('univariateGCD: gcd over ℚ(i) recovers x−i', g3.equals(xi));
    // square-free part collapses multiplicity: (x−1)²(x−2) → (x−1)(x−2)
    const sf = S.squareFreePart(x.sub(k(1)).pow(2).mul(x.sub(k(2))), 'x');
    ok('squareFreePart: (x−1)²(x−2) → degree-2 radical, divides the input and is square-free',
       sf.degreeIn('x') === 2 && divides(sf, x.sub(k(1)).pow(2).mul(x.sub(k(2)))) &&
       S.univariateGCD(sf, sf.derivativeIn('x'), 'x').degreeIn('x') === 0);
    // an already square-free input is returned (same degree)
    ok('squareFreePart: square-free input is unchanged in degree', S.squareFreePart(p2, 'x').degreeIn('x') === 2);
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
