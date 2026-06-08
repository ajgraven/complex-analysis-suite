'use strict';
// =============================================================================
// sym-core tests — the exact symbolic-algebra core (QD.Sym): Rational, Gaussian,
// MPoly, RatFn, and the truncated power-series layer (incl. compositional
// inverse). Oracles are closed-form identities; the symbolic series inverse is
// cross-checked numerically against its known closed form.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');   // page-only module (not in the CORE bundle)

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
};

// ---- local complex helpers ----
function approxEqC(a, b, tol) { tol = tol || 1e-9; return Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol; }
function ceq(rf, n, tol) { const v = rf.evalComplex({}); return Math.abs(v.re - n) < (tol || 1e-12) && Math.abs(v.im) < (tol || 1e-12); }
