// =============================================================================
// sym-radical.js -- Solve a single polynomial equation for ONE variable IN
// RADICALS (closed form), keeping the remaining variables as symbolic
// coefficients (QD.SymRadical). Built on QD.Sym (exact ℚ(i) MPoly/RatFn).
//
// Given p = 0 viewed as a univariate polynomial in `varName` with coefficients
// that are MPolys in the OTHER variables, return the roots as closed-form
// RADICAL expressions whenever the degree (in varName) is ≤ 4, or it reduces to
// such a case via:
//   • factorization      — p factors; solve each factor that involves varName.
//   • quasi-polynomial    — only exponents that are multiples of g appear ⇒
//                           substitute y = varName^g and solve the lower-degree
//                           polynomial, then take g-th roots (e.g. x⁶+b x⁴+c x²+d
//                           is a CUBIC in x²).
// Irreducible degree ≥ 5 with no such reduction ⇒ honest Abel–Ruffini refusal.
//
// The output is a RADICAL EXPRESSION (a small AST: rational leaves over ℚ(i)
// + add/mul/neg/div/pow/n-th-root/root-of-unity), because nothing in QD.Sym can
// hold a √ or ∛. The AST renders to LaTeX and evaluates numerically (principal
// branches) — the latter is the correctness oracle: every returned root, with
// the remaining variables set to random sample values, must satisfy p ≈ 0.
//
// NO radical SIMPLIFICATION/canonicalization — the formula is displayed as built
// (Cardano/Ferrari nest deeply); rigor comes from the numeric oracle, not from
// normalizing the surd. Pure module: no DOM; loads after sym-core.js.
// =============================================================================

(function (global) {
  'use strict';

  function getSym() {
    return (typeof window !== 'undefined' && window.QD && window.QD.Sym)
      || (typeof global !== 'undefined' && global.QD && global.QD.Sym)
      || (typeof QD !== 'undefined' && QD.Sym);
  }

  // ---- minimal complex arithmetic (self-contained; principal branches) -------
  function cadd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
  function cneg(a) { return { re: -a.re, im: -a.im }; }
  function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
  function cdiv(a, b) {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  }
  function cpowInt(a, e) {
    let out = { re: 1, im: 0 };
    const base = e < 0 ? cdiv({ re: 1, im: 0 }, a) : a;
    const n = Math.abs(e);
    for (let i = 0; i < n; i++) out = cmul(out, base);
    return out;
  }
  // Principal n-th root: r^(1/n)·e^{iθ/n}, θ = atan2(im,re) ∈ (−π,π].
  function cnroot(a, n) {
    const r = Math.hypot(a.re, a.im);
    if (r === 0) return { re: 0, im: 0 };
    const th = Math.atan2(a.im, a.re) / n;
    const rr = Math.pow(r, 1 / n);
    return { re: rr * Math.cos(th), im: rr * Math.sin(th) };
  }
  function cfinite(z) { return z && isFinite(z.re) && isFinite(z.im); }

  // ---- the radical-expression AST -------------------------------------------
  // Nodes (plain objects): { k:'rat', v:RatFn } leaf; add/mul {a,b}; neg/sqrtish
  // {a}; div {a,b}; pow {a, n:int}; root {a, n:int} (principal n-th root);
  // rou {g, j} (the root of unity e^{2πi·j/g}). Builders below.
  const Rx = {
    rat(v) { return { k: 'rat', v: v }; },
    add(a, b) { return { k: 'add', a: a, b: b }; },
    sub(a, b) { return { k: 'add', a: a, b: { k: 'neg', a: b } }; },
    mul(a, b) { return { k: 'mul', a: a, b: b }; },
    neg(a) { return { k: 'neg', a: a }; },
    div(a, b) { return { k: 'div', a: a, b: b }; },
    pow(a, n) { return { k: 'pow', a: a, n: n }; },
    root(a, n) { return { k: 'root', a: a, n: n }; },
    rou(g, j) { return { k: 'rou', g: g, j: ((j % g) + g) % g }; },
  };

  function evalRadical(node, vm) {
    switch (node.k) {
      case 'rat': return node.v.evalComplex(vm);
      case 'add': return cadd(evalRadical(node.a, vm), evalRadical(node.b, vm));
      case 'mul': return cmul(evalRadical(node.a, vm), evalRadical(node.b, vm));
      case 'neg': return cneg(evalRadical(node.a, vm));
      case 'div': return cdiv(evalRadical(node.a, vm), evalRadical(node.b, vm));
      case 'pow': return cpowInt(evalRadical(node.a, vm), node.n);
      case 'root': return cnroot(evalRadical(node.a, vm), node.n);
      case 'rou': {
        const t = 2 * Math.PI * node.j / node.g;
        return { re: Math.cos(t), im: Math.sin(t) };
      }
      default: throw new Error('evalRadical: unknown node ' + node.k);
    }
  }

  // LaTeX. Precedence: 0 add, 1 mul/div, 2 unary/atom — parenthesize when a
  // lower-precedence child sits inside a higher-precedence parent.
  function _isOne(mp, S) { return mp.equals(S.MPoly.fromInt(1)); }
  // +1 / −1 detection for tidying products: a root-of-unity that equals ±1, or a
  // rational leaf equal to ±1. Returns 1, −1, or 0 (not a unit) — lets the mul
  // renderer drop "1 · …" and fold "(−1) · …" into a leading minus sign.
  function _unitVal(node, S) {
    if (node.k === 'rou') {
      if (node.j % node.g === 0) return 1;
      if ((node.g === 2 && node.j === 1) || (node.g === 4 && node.j === 2)) return -1;
      return 0;
    }
    if (node.k === 'rat' && _isOne(node.v.den, S)) {
      if (node.v.num.equals(S.MPoly.fromInt(1))) return 1;
      if (node.v.num.equals(S.MPoly.fromInt(-1))) return -1;
    }
    return 0;
  }
  function ratLatex(rf, latexOf, S) {
    if (_isOne(rf.den, S)) return rf.num.toLatex(latexOf);
    return '\\frac{' + rf.num.toLatex(latexOf) + '}{' + rf.den.toLatex(latexOf) + '}';
  }
  function radicalToLatex(node, latexOf, S, prec) {
    prec = prec || 0;
    const wrap = (s, p) => (p < prec ? '\\left(' + s + '\\right)' : s);
    switch (node.k) {
      case 'rat': {
        const s = ratLatex(node.v, latexOf, S);
        // a bare sum/diff leaf needs grouping inside a product/power
        const bare = !_isOne(node.v.den, S) ? false : (node.v.num.size && node.v.num.size() > 1);
        return wrap(s, bare ? 0 : 2);
      }
      case 'add': {
        const a = radicalToLatex(node.a, latexOf, S, 0);
        // render "+ (−x)" as "− x"
        if (node.b.k === 'neg') return wrap(a + ' - ' + radicalToLatex(node.b.a, latexOf, S, 1), 0);
        return wrap(a + ' + ' + radicalToLatex(node.b, latexOf, S, 0), 0);
      }
      case 'neg': return wrap('-' + radicalToLatex(node.a, latexOf, S, 2), 1);
      case 'mul': {
        const ua = _unitVal(node.a, S), ub = _unitVal(node.b, S);
        if (ua === 1) return radicalToLatex(node.b, latexOf, S, prec);
        if (ub === 1) return radicalToLatex(node.a, latexOf, S, prec);
        if (ua === -1) return wrap('-' + radicalToLatex(node.b, latexOf, S, 2), 1);
        if (ub === -1) return wrap('-' + radicalToLatex(node.a, latexOf, S, 2), 1);
        return wrap(radicalToLatex(node.a, latexOf, S, 1) + ' \\cdot ' + radicalToLatex(node.b, latexOf, S, 1), 1);
      }
      case 'div': return wrap('\\frac{' + radicalToLatex(node.a, latexOf, S, 0) + '}{' + radicalToLatex(node.b, latexOf, S, 0) + '}', 2);
      case 'pow': return wrap('{' + radicalToLatex(node.a, latexOf, S, 2) + '}^{' + node.n + '}', 2);
      case 'root': {
        const inner = radicalToLatex(node.a, latexOf, S, 0);
        return wrap(node.n === 2 ? '\\sqrt{' + inner + '}' : '\\sqrt[' + node.n + ']{' + inner + '}', 2);
      }
      case 'rou': {
        if (node.g === 1 || node.j === 0) return wrap('1', 2);
        if (node.g === 2) return wrap('-1', 1);
        if (node.g === 4) return wrap(node.j === 1 ? 'i' : (node.j === 2 ? '-1' : '-i'), 1);
        return wrap('e^{2\\pi i \\cdot ' + node.j + '/' + node.g + '}', 2);
      }
      default: return '?';
    }
  }

  // ---- closed-form solvers over RADICAL coefficients -------------------------
  // Each takes Radical-valued coefficients and returns an array of Radical roots.
  // (Coefficients are Radicals — not just RatFn — so Ferrari can feed the nested
  // resolvent-cubic root y and √(2y) back into the quadratic solver.)
  function ratiInt(S, n) { return Rx.rat(S.RatFn.fromInt(n)); }

  function solveLinear(a, b) {            // a·x + b = 0
    return [Rx.div(Rx.neg(b), a)];
  }
  function solveQuadratic(S, a, b, c) {   // a·x² + b·x + c = 0
    const four = ratiInt(S, 4), two = ratiInt(S, 2);
    const disc = Rx.sub(Rx.pow(b, 2), Rx.mul(four, Rx.mul(a, c)));
    const s = Rx.root(disc, 2);
    const den = Rx.mul(two, a);
    return [Rx.div(Rx.add(Rx.neg(b), s), den), Rx.div(Rx.sub(Rx.neg(b), s), den)];
  }
  function solveCubic(S, a, b, c, d) {    // a·x³ + b·x² + c·x + d = 0
    const i2 = ratiInt(S, 2), i3 = ratiInt(S, 3), i27 = ratiInt(S, 27);
    const B = Rx.div(b, a), C = Rx.div(c, a), D = Rx.div(d, a);   // monic x³+Bx²+Cx+D
    // depress x = t − B/3 :  t³ + p t + q
    const p = Rx.sub(C, Rx.div(Rx.pow(B, 2), i3));
    const q = Rx.add(Rx.sub(Rx.div(Rx.mul(i2, Rx.pow(B, 3)), i27), Rx.div(Rx.mul(B, C), i3)), D);
    // Cardano: D3 = (q/2)² + (p/3)³;  u = ∛(−q/2 + √D3);  v = −p/(3u);  t_k = ω^k u + ω^{2k} v.
    const D3 = Rx.add(Rx.pow(Rx.div(q, i2), 2), Rx.pow(Rx.div(p, i3), 3));
    const u = Rx.root(Rx.add(Rx.neg(Rx.div(q, i2)), Rx.root(D3, 2)), 3);
    const shift = Rx.div(B, i3);
    const roots = [];
    for (let k = 0; k < 3; k++) {
      const wk = Rx.mul(Rx.rou(3, k), u);                          // ω^k · u
      // t_k = ω^k u − p/(3·ω^k u)   (= ω^k u + ω^{2k} v with v = −p/(3u))
      const tk = Rx.sub(wk, Rx.div(p, Rx.mul(i3, wk)));
      roots.push(Rx.sub(tk, shift));
    }
    return roots;
  }
  function solveQuartic(S, a, b, c, d, e) {   // a·x⁴ + b·x³ + c·x² + d·x + e = 0
    const i2 = ratiInt(S, 2), i3 = ratiInt(S, 3), i4 = ratiInt(S, 4), i8 = ratiInt(S, 8),
      i16 = ratiInt(S, 16), i256 = ratiInt(S, 256);
    const B = Rx.div(b, a), C = Rx.div(c, a), D = Rx.div(d, a), E = Rx.div(e, a);  // monic
    // depress x = t − B/4 :  t⁴ + p t² + q t + r
    const p = Rx.sub(C, Rx.div(Rx.mul(i3, Rx.pow(B, 2)), i8));
    const q = Rx.add(Rx.sub(D, Rx.div(Rx.mul(B, C), i2)), Rx.div(Rx.pow(B, 3), i8));
    const r = Rx.add(Rx.sub(Rx.add(E, Rx.div(Rx.mul(Rx.pow(B, 2), C), i16)), Rx.div(Rx.mul(B, D), i4)),
      Rx.neg(Rx.div(Rx.mul(i3, Rx.pow(B, 4)), i256)));
    // resolvent cubic in y:  8 y³ + 8 p y² + (2 p² − 8 r) y − q² = 0
    const rc = solveCubic(S, ratiInt(S, 8), Rx.mul(i8, p),
      Rx.sub(Rx.mul(i2, Rx.pow(p, 2)), Rx.mul(i8, r)), Rx.neg(Rx.pow(q, 2)));
    const y = rc[0];
    const A = Rx.root(Rx.mul(i2, y), 2);                  // √(2y)
    const base = Rx.add(Rx.div(p, i2), y);                // p/2 + y
    const qOver2A = Rx.div(q, Rx.mul(i2, A));             // q/(2A)
    // (t² − A t + (p/2+y+q/(2A))) · (t² + A t + (p/2+y−q/(2A))) = depressed quartic
    const t1 = solveQuadratic(S, ratiInt(S, 1), Rx.neg(A), Rx.add(base, qOver2A));
    const t2 = solveQuadratic(S, ratiInt(S, 1), A, Rx.sub(base, qOver2A));
    const shift = Rx.div(B, i4);
    return t1.concat(t2).map((t) => Rx.sub(t, shift));
  }

  // ---- integer gcd over the present exponents --------------------------------
  function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

  // ---- the top-level solver --------------------------------------------------
  // Returns { ok, roots:[Radical], method, degree, reason }.
  // ---- G8: depth-2 radical DENESTING (exact, real principal-root case) ---------
  // √(perfect-square rational) → rational, and √(a+b√c) → √x ± √y when a,c ≥ 0 are real
  // rationals, b rational, and the discriminant a²−b²c is a perfect rational square s²:
  // x=(a+s)/2, y=(a−s)/2 ⇒ √(a+b√c) = √x + sign(b)·√y (all real principal roots, since a≥0 ⇒
  // x,y ≥ 0 and (√x±√y)² = a ± |b|√c). Only fires on CONCRETE real-rational radicands;
  // symbolic / complex ones are left untouched, and the radical solver's numeric oracle
  // re-verifies every simplified root, so a missed guard can't produce a wrong value.
  // Refs: classic surd denesting — √(3+2√2)=1+√2, √(5+2√6)=√2+√3.
  function _bisqrt(n) {
    if (n < 0n) return null; if (n < 2n) return n;
    let x = n, y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return x * x === n ? x : null;
  }
  function denest(node) {
    const S = getSym(); if (!S || !node || typeof node !== 'object') return node;
    const rat0 = S.rat(0);
    const ratNode = (r) => Rx.rat(S.RatFn.fromInt(r.n).div(S.RatFn.fromInt(r.d)));
    const constReal = (mp) => {                       // constant real-rational MPoly → Rational | null
      const tl = mp.termList();
      if (tl.length === 0) return rat0;
      if (tl.length > 1) return null;
      const t = tl[0];
      if (Object.keys(t.mono).length || t.coeff.im[0] !== '0') return null;
      return S.rat(BigInt(t.coeff.re[0]), BigInt(t.coeff.re[1]));
    };
    const ratValue = (nd) => {                        // concrete real-rational value of a node | null
      if (nd.k === 'neg') { const v = ratValue(nd.a); return v ? v.neg() : null; }
      if (nd.k !== 'rat') return null;
      const n = constReal(nd.v.num), d = constReal(nd.v.den);
      return (n && d && !d.isZero()) ? n.div(d) : null;
    };
    const ratSqrt = (r) => {                          // Rational ≥0 → exact Rational √ | null
      if (r.sign() < 0) return null;
      if (r.isZero()) return rat0;
      const ns = _bisqrt(r.n), ds = _bisqrt(r.d);
      return (ns != null && ds != null) ? S.rat(ns, ds) : null;
    };
    const sqrtTerm = (nd) => {                         // node == b·√c (b,c real rationals, c≥0) → {b,c} | null
      if (nd.k === 'neg') { const t = sqrtTerm(nd.a); return t ? { b: t.b.neg(), c: t.c } : null; }
      if (nd.k === 'root' && nd.n === 2) { const c = ratValue(nd.a); return (c != null && c.sign() >= 0) ? { b: S.rat(1), c: c } : null; }
      if (nd.k === 'mul') {
        const ra = ratValue(nd.a), rb = ratValue(nd.b);
        if (ra != null) { const t = sqrtTerm(nd.b); return t ? { b: ra.mul(t.b), c: t.c } : null; }
        if (rb != null) { const t = sqrtTerm(nd.a); return t ? { b: rb.mul(t.b), c: t.c } : null; }
      }
      return null;
    };
    const cur = {}; for (const k in node) cur[k] = node[k];   // recurse into children first
    if (node.a) cur.a = denest(node.a);
    if (node.b) cur.b = denest(node.b);
    if (cur.k === 'root' && cur.n === 2) {
      const rv = ratValue(cur.a);
      if (rv != null) { const sq = ratSqrt(rv); if (sq != null) return ratNode(sq); }     // √(square) → rational
      if (cur.a.k === 'add') {                                                             // √(a+b√c) → √x ± √y
        let aVal = null, st = null;
        for (const part of [cur.a.a, cur.a.b]) {
          const rp = ratValue(part);
          if (rp != null && aVal == null) aVal = rp;
          else if (st == null) { const s = sqrtTerm(part); if (s) st = s; }
        }
        if (aVal != null && st != null && aVal.sign() >= 0) {
          const s = ratSqrt(aVal.mul(aVal).sub(st.b.mul(st.b).mul(st.c)));                 // √(a²−b²c)
          if (s != null) {
            const half = S.rat(1, 2);
            const sx = denest(Rx.root(ratNode(aVal.add(s).mul(half)), 2));
            const sy = denest(Rx.root(ratNode(aVal.sub(s).mul(half)), 2));
            return st.b.sign() >= 0 ? Rx.add(sx, sy) : Rx.sub(sx, sy);
          }
        }
      }
    }
    return cur;
  }
  // Public entry: solve, then DENEST each root at the outermost call (depth 0; opt-out via
  // opts.denest === false). Recursive sub-solves run undenested; the final roots are simplified.
  function solveByRadicals(poly, varName, opts) {
    opts = opts || {};
    const res = _solveRadicals(poly, varName, opts);
    if (res && res.ok && Array.isArray(res.roots) && !opts._depth && opts.denest !== false) {
      res.roots = res.roots.map((r) => { try { return denest(r); } catch (e) { return r; } });
    }
    return res;
  }
  function _solveRadicals(poly, varName, opts) {
    const S = getSym();
    if (!S) throw new Error('QD.SymRadical: QD.Sym not loaded');
    opts = opts || {};
    const depth = opts._depth || 0;
    if (depth > 24) return { ok: false, reason: 'recursion too deep' };

    let coeffsM = poly.coeffsIn(varName);                 // [c0..cd] MPolys in other vars
    let d = coeffsM.length - 1;
    while (d > 0 && coeffsM[d].isZero()) d--;              // strip leading zeros
    coeffsM = coeffsM.slice(0, d + 1);
    if (d < 0 || (d === 0)) {
      // constant in varName: c0 = 0 is an identity (every x), c0 ≠ 0 has no root.
      const c0 = coeffsM[0] || S.MPoly.zero ? coeffsM[0] : null;
      if (c0 && c0.isZero()) return { ok: false, reason: 'equation does not constrain ' + varName + ' (identically satisfied)' };
      return { ok: true, roots: [], degree: 0, method: 'no solution (nonzero constant in ' + varName + ')' };
    }

    // (1) FACTORIZATION — try to split p; solve each factor that involves varName.
    if (!opts._noFactor) {
      const split = _factorSplit(S, poly, varName);
      if (split && split.length > 1) {
        const roots = []; const methods = [];
        for (const f of split) {
          const sub = solveByRadicals(f, varName, { _depth: depth + 1 });
          if (!sub.ok) return { ok: false, reason: 'a factor is not solvable in radicals: ' + sub.reason };
          roots.push(...sub.roots); methods.push(sub.method);
        }
        return { ok: true, roots: roots, degree: d, method: 'factored → ' + methods.join(' · ') };
      }
    }

    // (2) QUASI-POLYNOMIAL — only exponents that are multiples of g appear.
    let g = 0;
    for (let i = 0; i <= d; i++) if (!coeffsM[i].isZero()) g = gcdInt(g, i);
    if (g > 1) {
      const m = d / g;
      const yName = _freshVar(poly, varName);
      let red = S.MPoly.zero ? S.MPoly.zero() : S.mpolyInt(0);
      const yv = S.mpolyVar(yName);
      for (let j = 0; j <= m; j++) red = red.add(coeffsM[g * j].mul(yv.pow(j)));
      const sub = solveByRadicals(red, yName, { _depth: depth + 1 });
      if (!sub.ok) return { ok: false, reason: 'the x^' + g + ' reduction is not solvable: ' + sub.reason };
      const roots = [];
      for (const yr of sub.roots) for (let j = 0; j < g; j++) roots.push(Rx.mul(Rx.rou(g, j), Rx.root(yr, g)));
      return { ok: true, roots: roots, degree: d, method: 'quasi-polynomial: degree-' + m + ' in ' + varName + '^' + g };
    }

    // (3) DEGREE DISPATCH — lift the MPoly coefficients to Radical leaves.
    const c = coeffsM.map((mp) => Rx.rat(S.RatFn.fromPoly(mp)));   // ascending
    if (d === 1) return { ok: true, roots: solveLinear(c[1], c[0]), degree: 1, method: 'linear' };
    if (d === 2) return { ok: true, roots: solveQuadratic(S, c[2], c[1], c[0]), degree: 2, method: 'quadratic formula' };
    if (d === 3) return { ok: true, roots: solveCubic(S, c[3], c[2], c[1], c[0]), degree: 3, method: 'cubic (Cardano)' };
    if (d === 4) return { ok: true, roots: solveQuartic(S, c[4], c[3], c[2], c[1], c[0]), degree: 4, method: 'quartic (Ferrari)' };
    return { ok: false, degree: d,
      reason: 'degree ' + d + ' in ' + varName + ' with no radical reduction (Abel–Ruffini) — use numeric Solve' };
  }

  // A fresh variable name not present in poly (for the x^g substitution).
  function _freshVar(poly, varName) {
    const used = poly.vars();
    let i = 0, name;
    do { name = '_y' + (i++ || ''); } while (used.has(name) || name === varName);
    return name;
  }

  // Factor p and return the list of factors that involve varName (with the
  // numeric-univariate path going through qiFactor for a full split). Returns
  // null if no nontrivial split. Factors not involving varName are dropped (they
  // contribute no varName-roots). Squared factors collapse (distinct factors).
  function _factorSplit(S, poly, varName) {
    const vars = poly.vars();
    // pure-univariate in varName with numeric ℚ(i) coefficients → full factorization.
    if (vars.size === 1 && vars.has(varName) && typeof S.qiFactor === 'function') {
      let fs; try { fs = S.qiFactor(poly, varName); } catch (e) { fs = null; }
      if (fs && fs.length > 1) return fs.filter((f) => f.degreeIn(varName) > 0);
    }
    // general multivariate factor (monomial / variable-separable split).
    if (typeof S.factor === 'function') {
      let r; try { r = S.factor(poly); } catch (e) { r = null; }
      if (r && r.ok && r.factors && r.factors.length > 1) {
        const inv = r.factors.filter((f) => f.degreeIn(varName) > 0);
        if (inv.length > 1 || (inv.length >= 1 && inv.length < r.factors.length)) return inv;
      }
    }
    return null;
  }

  // ---- numeric oracle --------------------------------------------------------
  // Verify every root by sampling the remaining variables at several random
  // ℚ(i) points and checking |p(root, sample)| ≈ 0. Deterministic LCG (no
  // Math.random) so tests/UI are reproducible. Returns { checked, samples,
  // maxResidual } — `checked` good samples (degenerate ones, where a root is
  // non-finite, are skipped).
  function verifyRoots(poly, varName, roots, opts) {
    opts = opts || {};
    const want = opts.samples || 6;
    const rest = [...poly.vars()].filter((v) => v !== varName);
    let seed = 0x9e3779b9 >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const smallInt = () => Math.round((rnd() * 2 - 1) * 4);   // −4..4
    let checked = 0, maxResidual = 0, tries = 0;
    while (checked < want && tries < want * 8) {
      tries++;
      const vm = {};
      for (const v of rest) {
        let re = smallInt(), im = smallInt();
        if (re === 0 && im === 0) re = 1;
        vm[v] = { re: re, im: im };
      }
      let good = true, worst = 0;
      for (const root of roots) {
        let x; try { x = evalRadical(root, vm); } catch (e) { good = false; break; }
        if (!cfinite(x)) { good = false; break; }
        const res = poly.evalComplex(Object.assign({ [varName]: x }, vm));
        const scale = Math.max(1, Math.hypot(x.re, x.im));
        const rel = Math.hypot(res.re, res.im) / Math.pow(scale, poly.degreeIn(varName));
        if (rel > worst) worst = rel;
      }
      if (!good) continue;
      checked++; if (worst > maxResidual) maxResidual = worst;
    }
    return { checked: checked, samples: want, maxResidual: maxResidual };
  }

  const ns = { solveByRadicals, denest, verifyRoots, evalRadical, radicalToLatex, builders: Rx };

  const QD = (typeof window !== 'undefined' && window.QD)
    ? window.QD
    : (typeof module !== 'undefined' && module.exports ? module.exports : (global.QD || (global.QD = {})));
  QD.SymRadical = ns;
})(typeof globalThis !== 'undefined' ? globalThis : this);
