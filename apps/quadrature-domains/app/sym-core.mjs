// ESM (Phase 2 port) — twin of sym-core.js (classic stays frozen). Registers onto the QD namespace.
import _QD from './solver.mjs';
// =============================================================================
// sym-core.js -- Exact symbolic-algebra core (QD.Sym).
//
// The foundation for the app's symbolic track: the classical-QD equation
// generator (qd-equations.js), the univalence constraints (qd-constraints.js),
// and the Algebra-tab elimination/Gröbner workspace (app/algebra/). Everything
// here is EXACT (BigInt rationals) so downstream elimination is meaningful;
// floating point appears only in evalComplex (the numeric-residual oracle) and
// in the numeric eigen/root steps of the two solvers.
//
// Layers, smallest to largest:
//   Rational  -- BigInt n/d, normalized (d > 0, gcd 1).
//   Gaussian  -- a + b·i with a, b ∈ Rational (the coefficient field ℚ(i)).
//   MPoly     -- multivariate polynomial: sparse Map<monomialKey, term>, term =
//                { mono: Map<varName,exp>, coeff: Gaussian }. Variables are bare
//                string names (e.g. 'z1', 'zb1', 'A_1_1', 'Ab_1_1', 'a1', …).
//   Elimination -- resultant/discriminant via fraction-free Bareiss (mpolyDet);
//                exact-division (mpolyExactDiv); and `factor` — RADICAL polynomial
//                factorization (monomial + variable-separable products via the
//                mixed-partial test + univariate via verified numeric roots) used
//                to case-split a variety V(p)=⋃V(fᵢ) (see the block above `factor`).
//   Gröbner   -- monomial orders (lex/grlex/grevlex/block), normal form, the
//                packed exponent-vector kernel, Buchberger (Gebauer–Möller +
//                sugar) and the signature-based GVW variant (buchbergerSig),
//                reduced bases, saturation; linearReduce preprocessing.
//   Zero-dim  -- standard monomials / quotient dimension, FGLM (grevlex→lex),
//                solveZeroDim (shape lemma; a reversed-order retry on a cap, then a
//                Möller–Stetter eigenvalue fallback for non-shape-position ideals),
//                certified REAL-solution counting via the Hermite trace form
//                (realSolutionCount), and an alternative eliminator — triangular
//                decomposition by Wu pseudo-elimination (pseudoRemainder/triangularize).
//   RatFn     -- MPoly/MPoly (the fraction field) — needed because the QD ansatz
//                and Taylor inversion introduce (1 − z̄·z) and φ′ denominators;
//                an equation RatFn = 0 clears to its numerator MPoly = 0.
//   Series    -- truncated power series in a local variable t, coeffs = RatFn,
//                with mul / pow / compose / compositional-inverse (mirrors the
//                numeric taylor.js, but symbolic) — drives the (★) Faber block.
//
// Worker bridge: `runJob(op, payload)` is a serialized dispatcher (term-list in,
// term-list out) over the heavy ops (groebner / solveZeroDim / dimension) so the
// Algebra tab can offload them to app/algebra/sym-worker.js (a Blob Web Worker) and
// stay responsive; it also runs synchronously on the main thread as the fallback.
//
// Pure module: no DOM, no dependencies (a minimal {re,im} complex arithmetic is
// inlined for evalComplex — QD.Complex is NOT assumed loaded). Namespace idiom
// mirrors poly-helpers.js.
// =============================================================================

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // BigInt helpers
  // ---------------------------------------------------------------------------
  function babs(a) { return a < 0n ? -a : a; }
  function bgcd(a, b) {
    a = babs(a); b = babs(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  // ---------------------------------------------------------------------------
  // Rational — exact n/d over BigInt, normalized (d > 0, gcd(|n|,d) = 1).
  // ---------------------------------------------------------------------------
  class Rational {
    constructor(n, d = 1n) {
      n = BigInt(n); d = BigInt(d);
      if (d === 0n) throw new Error('Rational: zero denominator');
      // Fast paths for the overwhelmingly common cases (integer coefficients,
      // unit/zero) — skip the BigInt gcd entirely. The symbolic-core coefficients
      // are mostly small integers (±1, ±2, i, …), so this is a broad win.
      if (d === 1n) { this.n = n; this.d = 1n; return; }
      if (n === 0n) { this.n = 0n; this.d = 1n; return; }
      if (d === -1n) { this.n = -n; this.d = 1n; return; }
      if (d < 0n) { n = -n; d = -d; }
      const g = bgcd(n, d) || 1n;
      this.n = n / g;
      this.d = d / g;
    }
    static fromInt(k) { return new Rational(BigInt(k), 1n); }
    isZero() { return this.n === 0n; }
    isOne() { return this.n === 1n && this.d === 1n; }
    neg() { return new Rational(-this.n, this.d); }
    add(o) { return new Rational(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return new Rational(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Rational(this.n * o.n, this.d * o.d); }
    div(o) {
      if (o.n === 0n) throw new Error('Rational: division by zero');
      return new Rational(this.n * o.d, this.d * o.n);
    }
    equals(o) { return this.n === o.n && this.d === o.d; }
    sign() { return this.n > 0n ? 1 : (this.n < 0n ? -1 : 0); }
    toNumber() { return Number(this.n) / Number(this.d); }
    // LaTeX: integer → "k"; else "\frac{n}{d}" (sign carried outside by callers).
    toLatex() {
      if (this.d === 1n) return String(this.n);
      const s = this.n < 0n ? '-' : '';
      return s + '\\frac{' + babs(this.n) + '}{' + this.d + '}';
    }
  }
  const RZERO = Rational.fromInt(0);
  const RONE = Rational.fromInt(1);

  // ---------------------------------------------------------------------------
  // Gaussian — a + b·i, a,b ∈ Rational. The coefficient field.
  // ---------------------------------------------------------------------------
  class Gaussian {
    constructor(re, im) { this.re = re || RZERO; this.im = im || RZERO; }
    static fromInt(k) { return new Gaussian(Rational.fromInt(k), RZERO); }
    static fromRational(r) { return new Gaussian(r, RZERO); }
    static get I() { return new Gaussian(RZERO, RONE); }
    isZero() { return this.re.isZero() && this.im.isZero(); }
    neg() { return new Gaussian(this.re.neg(), this.im.neg()); }
    conj() { return new Gaussian(this.re, this.im.neg()); }
    add(o) { return new Gaussian(this.re.add(o.re), this.im.add(o.im)); }
    sub(o) { return new Gaussian(this.re.sub(o.re), this.im.sub(o.im)); }
    mul(o) {
      // (a+bi)(c+di) = (ac−bd) + (ad+bc) i
      return new Gaussian(
        this.re.mul(o.re).sub(this.im.mul(o.im)),
        this.re.mul(o.im).add(this.im.mul(o.re)));
    }
    div(o) {
      // (a+bi)/(c+di) = (a+bi)(c−di)/(c²+d²)
      const den = o.re.mul(o.re).add(o.im.mul(o.im));
      if (den.isZero()) throw new Error('Gaussian: division by zero');
      const num = this.mul(o.conj());
      return new Gaussian(num.re.div(den), num.im.div(den));
    }
    equals(o) { return this.re.equals(o.re) && this.im.equals(o.im); }
    toComplex() { return { re: this.re.toNumber(), im: this.im.toNumber() }; }
    toLatex() {
      if (this.im.isZero()) return this.re.toLatex();
      if (this.re.isZero()) {
        if (this.im.isOne()) return 'i';
        if (this.im.neg().isOne()) return '-i';
        return this.im.toLatex() + 'i';
      }
      const imPart = (this.im.sign() < 0 ? ' - ' : ' + ') +
        (this.im.sign() < 0 ? this.im.neg() : this.im).toLatex() + 'i';
      return '(' + this.re.toLatex() + imPart + ')';
    }
  }

  // ---------------------------------------------------------------------------
  // Monomial helpers — a monomial is a Map<varName, exponent(int>0)>.
  // Canonical key = sorted "name^exp" joined by '*'; '' for the empty monomial.
  // ---------------------------------------------------------------------------
  function monoKey(mono) {
    if (mono.size === 0) return '';
    const parts = [];
    for (const [name, e] of mono) parts.push(name + '^' + e);
    parts.sort();
    return parts.join('*');
  }
  function monoMul(a, b) {
    const out = new Map(a);
    for (const [name, e] of b) out.set(name, (out.get(name) || 0) + e);
    return out;
  }
  // Total degree of a monomial, MEMOIZED on the monomial Map (monomials are treated
  // as immutable here, so the cache is always valid). monoTotalDeg is the hottest
  // helper in graded-order comparisons (every leadingTerm scan / pair selection in
  // Buchberger calls it), so caching it is a broad constant-factor win. A WeakMap
  // keeps it off the Map object and lets GC reclaim entries with their monomials.
  const _tdegCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function monoTotalDeg(mono) {
    if (_tdegCache) { const c = _tdegCache.get(mono); if (c !== undefined) return c; }
    let d = 0; for (const e of mono.values()) d += e;
    if (_tdegCache) _tdegCache.set(mono, d);
    return d;
  }
  // Global monomial order (graded-lex): higher total degree wins; ties broken
  // lexicographically by the higher exponent on the alphabetically-earliest
  // differing variable. This is the DEFAULT order whenever an `order` argument is
  // omitted (_orderCmp(null) → monoCmp, so leadingTerm / mpolyDivMod / normalForm /
  // sPoly without an explicit order use it), and the order the determinant's
  // exact-division step relies on — any well-founded order makes that division
  // terminate; grlex keeps it cheap. Also exported as Sym.monoCmp.
  function monoCmp(a, b) {
    const da = monoTotalDeg(a), db = monoTotalDeg(b);
    if (da !== db) return da < db ? -1 : 1;
    const names = new Set(); for (const k of a.keys()) names.add(k); for (const k of b.keys()) names.add(k);
    const sorted = [...names].sort();
    for (const nm of sorted) {
      const ea = a.get(nm) || 0, eb = b.get(nm) || 0;
      if (ea !== eb) return ea < eb ? -1 : 1;
    }
    return 0;
  }
  // a / b exponentwise (Map) if every resulting exponent ≥ 0, else null.
  function monoDivide(a, b) {
    const out = new Map(a);
    for (const [name, e] of b) {
      const cur = (out.get(name) || 0) - e;
      if (cur < 0) return null;
      if (cur === 0) out.delete(name); else out.set(name, cur);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // MPoly — multivariate polynomial over Gaussian. Sparse term map.
  // ---------------------------------------------------------------------------
  class MPoly {
    constructor() { this.terms = new Map(); }   // monoKey -> { mono, coeff }

    static zero() { return new MPoly(); }
    static constant(g) {
      const p = new MPoly();
      if (!g.isZero()) p.terms.set('', { mono: new Map(), coeff: g });
      return p;
    }
    static fromInt(k) { return MPoly.constant(Gaussian.fromInt(k)); }
    static variable(name) {
      const p = new MPoly();
      p.terms.set(name + '^1', { mono: new Map([[name, 1]]), coeff: Gaussian.fromInt(1) });
      return p;
    }
    // Rebuild an MPoly from the CAS-agnostic term list produced by termList()
    // (the inverse of termList). Coefficients are exact Gaussian rationals carried
    // as [numerator, denominator] decimal strings (BigInt-safe), so this is the
    // structured-clone-safe (de)serialization used by the Web-Worker offload and by
    // CAS import. Unknown/empty input → the zero polynomial.
    static fromTermList(list) {
      const p = new MPoly();
      for (const t of (list || [])) {
        const mono = new Map();
        const m = t.mono || {};
        for (const k in m) if (Object.prototype.hasOwnProperty.call(m, k)) mono.set(k, m[k]);
        const re = new Rational(BigInt(t.coeff.re[0]), BigInt(t.coeff.re[1]));
        const im = new Rational(BigInt(t.coeff.im[0]), BigInt(t.coeff.im[1]));
        p._addTerm(mono, new Gaussian(re, im));
      }
      return p;
    }

    _addTerm(mono, coeff) {
      if (coeff.isZero()) return;
      const key = monoKey(mono);
      const cur = this.terms.get(key);
      if (cur) {
        const c = cur.coeff.add(coeff);
        if (c.isZero()) this.terms.delete(key);
        else cur.coeff = c;
      } else {
        this.terms.set(key, { mono, coeff });
      }
    }

    clone() {
      const p = new MPoly();
      for (const [k, t] of this.terms) p.terms.set(k, { mono: new Map(t.mono), coeff: t.coeff });
      return p;
    }
    isZero() { return this.terms.size === 0; }
    size() { return this.terms.size; }   // number of (nonzero) terms — for display caps

    add(o) {
      const p = this.clone();
      for (const t of o.terms.values()) p._addTerm(new Map(t.mono), t.coeff);
      return p;
    }
    neg() {
      const p = new MPoly();
      for (const [k, t] of this.terms) p.terms.set(k, { mono: new Map(t.mono), coeff: t.coeff.neg() });
      return p;
    }
    sub(o) { return this.add(o.neg()); }
    scale(g) {
      if (g.isZero()) return MPoly.zero();
      const p = new MPoly();
      for (const [k, t] of this.terms) p.terms.set(k, { mono: new Map(t.mono), coeff: t.coeff.mul(g) });
      return p;
    }
    mul(o) {
      const p = new MPoly();
      for (const a of this.terms.values()) {
        for (const b of o.terms.values()) {
          p._addTerm(monoMul(a.mono, b.mono), a.coeff.mul(b.coeff));
        }
      }
      return p;
    }
    pow(k) {
      if (k < 0) throw new Error('MPoly.pow: negative exponent');
      let out = MPoly.fromInt(1);
      for (let i = 0; i < k; i++) out = out.mul(this);
      return out;
    }
    equals(o) { return this.sub(o).isZero(); }

    // Substitute variables with replacement MPolys (map: name -> MPoly). Any
    // variable absent from the map is left as itself. Re-expands fully, so the
    // result is a plain MPoly in whatever variables the replacements introduce.
    // Drives the real/imaginary split (z_j -> x_j + i·y_j, etc.).
    subst(map) {
      let out = MPoly.zero();
      for (const t of this.terms.values()) {
        let term = MPoly.constant(t.coeff);
        for (const [name, e] of t.mono) {
          const rep = (map && Object.prototype.hasOwnProperty.call(map, name))
            ? map[name] : MPoly.variable(name);
          term = term.mul(rep.pow(e));
        }
        out = out.add(term);
      }
      return out;
    }

    // Real / imaginary part of the COEFFICIENTS (a real-coefficient MPoly, i.e.
    // Gaussian with im=0). When every variable is real, P = realPart + i·imagPart
    // as a function, so these split a Gaussian-coefficient equation into its two
    // real-coefficient equations. (Used after subst maps all vars to real ones.)
    realPart() {
      const p = new MPoly();
      for (const [k, t] of this.terms) {
        const c = new Gaussian(t.coeff.re, RZERO);
        if (!c.isZero()) p.terms.set(k, { mono: new Map(t.mono), coeff: c });
      }
      return p;
    }
    imagPart() {
      const p = new MPoly();
      for (const [k, t] of this.terms) {
        const c = new Gaussian(t.coeff.im, RZERO);
        if (!c.isZero()) p.terms.set(k, { mono: new Map(t.mono), coeff: c });
      }
      return p;
    }
    // Conjugate every coefficient (the ℚ(i) bar); variables untouched.
    conjCoeffs() {
      const p = new MPoly();
      for (const [k, t] of this.terms) p.terms.set(k, { mono: new Map(t.mono), coeff: t.coeff.conj() });
      return p;
    }
    // Rename variables via nameFn(name)->newName; re-expands, merging any collisions.
    // (With conjCoeffs, this builds the full complex conjugate of an expression in
    // the conjugate-variable model: bar the coeffs, swap each var with its partner.)
    relabel(nameFn) {
      const p = new MPoly();
      for (const t of this.terms.values()) {
        const mono = new Map();
        for (const [nm, e] of t.mono) { const nn = nameFn(nm); mono.set(nn, (mono.get(nn) || 0) + e); }
        p._addTerm(mono, t.coeff);
      }
      return p;
    }

    vars() {
      const s = new Set();
      for (const t of this.terms.values()) for (const name of t.mono.keys()) s.add(name);
      return s;
    }

    // --- "univariate-in-varName" view, for resultant elimination ---------------
    // Highest power of varName present (-1 for the zero polynomial; 0 if the
    // variable is absent but the polynomial is nonzero).
    degreeIn(varName) {
      if (this.isZero()) return -1;
      let d = 0;
      for (const t of this.terms.values()) { const e = t.mono.get(varName) || 0; if (e > d) d = e; }
      return d;
    }
    // Total (graded) degree: the max over terms of the sum of its exponents
    // (-1 for the zero polynomial, 0 for a nonzero constant). Used for display
    // metadata and as a size proxy for elimination/Gröbner cost.
    totalDegree() {
      if (this.isZero()) return -1;
      let d = 0;
      for (const t of this.terms.values()) {
        let s = 0; for (const e of t.mono.values()) s += e;
        if (s > d) d = s;
      }
      return d;
    }
    // Dense coefficient list [c_0, …, c_d] with this = Σ_k c_k·varName^k, each c_k
    // an MPoly in the remaining variables. (Returns [0] for the zero polynomial.)
    coeffsIn(varName) {
      const d = this.degreeIn(varName);
      if (d < 0) return [MPoly.zero()];
      const out = []; for (let i = 0; i <= d; i++) out.push(new MPoly());
      for (const t of this.terms.values()) {
        const e = t.mono.get(varName) || 0;
        const mono = new Map(t.mono); mono.delete(varName);
        out[e]._addTerm(mono, t.coeff);
      }
      return out;
    }
    // ∂/∂varName (termwise; for discriminants).
    derivativeIn(varName) {
      const p = new MPoly();
      for (const t of this.terms.values()) {
        const e = t.mono.get(varName) || 0;
        if (e === 0) continue;
        const mono = new Map(t.mono);
        if (e === 1) mono.delete(varName); else mono.set(varName, e - 1);
        p._addTerm(mono, t.coeff.mul(new Gaussian(new Rational(BigInt(e), 1n), RZERO)));
      }
      return p;
    }

    // --- monomial-order views, for Gröbner / normal-form reduction ------------
    // The "leading" term/monomial/coefficient under a monomial order (an object
    // with a `.cmp(monoA, monoB)` from `monomialOrder`, a bare cmp function, or
    // omitted → the default grlex `monoCmp`). leadingTerm returns the stored term
    // object { mono, coeff } (or null for the zero polynomial) — DO NOT mutate it.
    leadingTerm(order) {
      const cmp = _orderCmp(order);
      let best = null;
      for (const t of this.terms.values()) if (best === null || cmp(t.mono, best.mono) > 0) best = t;
      return best;
    }
    leadingCoeff(order) { const t = this.leadingTerm(order); return t ? t.coeff : Gaussian.fromInt(0); }
    leadingMono(order) { const t = this.leadingTerm(order); return t ? new Map(t.mono) : new Map(); }

    // Evaluate at complex values. varMap: name -> {re,im}. Returns {re,im}.
    // Integer exponents only; missing variables throw (caller must supply all).
    evalComplex(varMap) {
      let acc = { re: 0, im: 0 };
      for (const t of this.terms.values()) {
        let term = t.coeff.toComplex();
        for (const [name, e] of t.mono) {
          const v = varMap[name];
          if (!v) throw new Error('MPoly.evalComplex: missing variable ' + name);
          term = cmul(term, cpowInt(v, e));
        }
        acc = cadd(acc, term);
      }
      return acc;
    }

    // LaTeX. latexOf: name -> LaTeX for that variable (e.g. 'z_1', '\\bar{z}_1').
    // Renders terms in a stable (sorted-key) order; coefficient ±1 elided when a
    // monomial is present.
    toLatex(latexOf) {
      if (this.isZero()) return '0';
      const keys = [...this.terms.keys()].sort();
      let out = '';
      for (const key of keys) {
        const t = this.terms.get(key);
        const monoStr = monoToLatex(t.mono, latexOf);
        const { sign, body } = coeffToLatex(t.coeff, monoStr);
        out += (out === '' ? (sign === '-' ? '-' : '') : (sign === '-' ? ' - ' : ' + ')) + body;
      }
      return out;
    }

    // Canonical key for factor identity (used by FRatFn's factored denominator).
    key() {
      const parts = [];
      for (const [k, t] of this.terms) {
        const c = t.coeff;
        parts.push(k + '#' + c.re.n + '/' + c.re.d + ',' + c.im.n + '/' + c.im.d);
      }
      parts.sort();
      return parts.join('|') || '0';
    }

    // Export: CAS-agnostic term list with exact Gaussian-rational coeffs.
    termList() {
      const out = [];
      for (const t of this.terms.values()) {
        const mono = {};
        for (const [name, e] of t.mono) mono[name] = e;
        out.push({
          coeff: {
            re: [t.coeff.re.n.toString(), t.coeff.re.d.toString()],
            im: [t.coeff.im.n.toString(), t.coeff.im.d.toString()],
          },
          mono,
        });
      }
      return out;
    }
  }

  function monoToLatex(mono, latexOf) {
    if (mono.size === 0) return '';
    const parts = [];
    for (const [name, e] of mono) parts.push([name, e]);
    parts.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return parts.map(([name, e]) => {
      const base = latexOf ? (latexOf(name) || name) : name;
      return e === 1 ? base : base + '^{' + e + '}';
    }).join(' ');
  }
  // Returns { sign: '+'|'-', body: latex } for coeff·monoStr, eliding ±1 when a
  // monomial is present.
  function coeffToLatex(coeff, monoStr) {
    const isReal = coeff.im.isZero();
    if (monoStr === '') return { sign: '+', body: coeff.toLatex() };
    if (isReal) {
      const r = coeff.re;
      if (r.isOne()) return { sign: '+', body: monoStr };
      if (r.neg().isOne()) return { sign: '-', body: monoStr };
      if (r.sign() < 0) return { sign: '-', body: r.neg().toLatex() + ' ' + monoStr };
      return { sign: '+', body: r.toLatex() + ' ' + monoStr };
    }
    return { sign: '+', body: coeff.toLatex() + ' ' + monoStr };
  }

  // ---------------------------------------------------------------------------
  // Elimination layer — determinant + Sylvester resultant over MPoly.
  // The coefficient ring is the integral domain MPoly-over-ℚ(i), so a fraction-
  // free Bareiss determinant stays polynomial (no denominator inflation). Bareiss
  // needs ONE ring op beyond +,−,×: exact division of an MPoly by an MPoly known
  // to divide it (the Bareiss identity guarantees divisibility). Since the coeff
  // field ℚ(i) is a field, exact division is ordinary leading-term polynomial
  // division under the grlex monomial order, terminating with zero remainder.
  // ---------------------------------------------------------------------------
  function _leadTerm(poly) {
    let best = null;
    for (const t of poly.terms.values()) {
      if (best === null || monoCmp(t.mono, best.mono) > 0) best = t;
    }
    return best; // { mono, coeff } or null (zero polynomial)
  }
  // q with f = q·g exactly (assumes g ≠ 0 and g | f). Throws if not divisible.
  // Uses the in-place _subTermTimesPoly reduction (the same geobucket-style win as
  // mpolyDivMod): the running remainder is never reallocated into a fresh term Map each
  // step — only the O(size g) affected entries are touched. Result is bit-identical.
  function mpolyExactDiv(f, g) {
    if (g.isZero()) throw new Error('mpolyExactDiv: division by zero');
    const gLead = _leadTerm(g);
    const rem = f.clone();                               // mutated in place below
    const q = MPoly.zero();
    let guard = 0;
    while (!rem.isZero()) {
      const rLead = _leadTerm(rem);
      const qm = monoDivide(rLead.mono, gLead.mono);
      if (qm === null) throw new Error('mpolyExactDiv: not divisible (invariant violated)');
      const qc = rLead.coeff.div(gLead.coeff);          // exact in ℚ(i)
      q._addTerm(qm, qc);
      _subTermTimesPoly(rem, qm, qc, g);                // rem -= (qc·x^qm)·g, cancels LT(rem)
      if (++guard > 1e6) throw new Error('mpolyExactDiv: non-terminating');
    }
    return q;
  }
  // Determinant via fraction-free Bareiss elimination with row-pivoting. Runs on the PACKED
  // kernel (Int32Array lanes, grlex — the order _leadTerm/mpolyExactDiv use) so the resultant/
  // discriminant hot path drops the map path's per-term monoKey + per-comparison monoCmp churn.
  // Bit-identical: mul/sub are exact ring ops and exact division has a UNIQUE quotient, so the
  // determinant is representation- and order-independent (cross-checked vs the division-free
  // mpolyDetLaplace oracle).
  function mpolyDet(matrix) {
    const n = matrix.length;
    if (n === 0) return MPoly.fromInt(1);
    if (n === 1) return matrix[0][0].clone();
    const vset = new Set();
    for (const row of matrix) for (const e of row) for (const t of e.terms.values()) for (const nm of t.mono.keys()) vset.add(nm);
    const ctx = _packedContext({ kind: 'grlex' }, [...vset]);
    const packed = matrix.map((row) => row.map((e) => _ppFromMPoly(ctx, e)));
    return _ppToMPoly(ctx, _bareissPacked(ctx, packed));
  }
  // Division-free Laplace cofactor expansion — O(n!), used as the test oracle for
  // Bareiss on small matrices (and a safe path for tiny ones).
  function mpolyDetLaplace(matrix) {
    const n = matrix.length;
    if (n === 0) return MPoly.fromInt(1);
    if (n === 1) return matrix[0][0].clone();
    let acc = MPoly.zero();
    for (let j = 0; j < n; j++) {
      const minor = [];
      for (let i = 1; i < n; i++) {
        const row = [];
        for (let c = 0; c < n; c++) if (c !== j) row.push(matrix[i][c]);
        minor.push(row);
      }
      let term = matrix[0][j].mul(mpolyDetLaplace(minor));
      if (j % 2 === 1) term = term.neg();
      acc = acc.add(term);
    }
    return acc;
  }
  // Hard cap on the Sylvester dimension. The Bareiss determinant is O(N³) ring ops
  // with intermediate entries that grow, so a large N over many-variable MPolys
  // explodes (e.g. an order-2 geometric border discriminant is a 15×15 over ~8
  // variables — minutes-to-never). Interactive pairwise eliminations are small
  // (N ≤ ~6); anything larger should go to the CAS export path instead.
  const RESULTANT_MATRIX_CAP = 10;
  // Sylvester resultant Res_x(f, g): eliminate `varName`, returning an MPoly in the
  // remaining variables whose vanishing is necessary for f, g to share a root in
  // `varName`. Edge cases: a constant-in-var input c gives c^(deg of the other);
  // both constant → 1 (nothing to eliminate); a zero input → 0. A ≡0 result means
  // f, g share a component (caller should treat as "no new information"). Throws a
  // clear cap error when the Sylvester matrix would exceed `maxMatrix` (default 10)
  // — callers (the workspace, the geometric-border generator) surface that as
  // "too large; use CAS export" rather than hanging.
  function resultant(f, g, varName, maxMatrix) {
    if (f.isZero() || g.isZero()) return MPoly.zero();
    const a = f.coeffsIn(varName);   // a[m] leading, nonzero by construction
    const b = g.coeffsIn(varName);
    const m = a.length - 1, n = b.length - 1;
    if (m === 0 && n === 0) return MPoly.fromInt(1);
    if (m === 0) return a[0].pow(n);
    if (n === 0) return b[0].pow(m);
    const size = m + n;
    const cap = (maxMatrix == null) ? RESULTANT_MATRIX_CAP : maxMatrix;
    if (size > cap) {
      throw new Error('resultant: Sylvester matrix ' + size + '×' + size +
        ' exceeds the cap (' + cap + '); eliminate lower-degree terms or use CAS export.');
    }
    const aRow = []; for (let k = m; k >= 0; k--) aRow.push(a[k]);   // high → low
    const bRow = []; for (let k = n; k >= 0; k--) bRow.push(b[k]);
    const M = [];
    for (let r = 0; r < n; r++) {
      const row = []; for (let c = 0; c < size; c++) row.push(MPoly.zero());
      for (let c = 0; c < aRow.length; c++) row[r + c] = aRow[c];
      M.push(row);
    }
    for (let r = 0; r < m; r++) {
      const row = []; for (let c = 0; c < size; c++) row.push(MPoly.zero());
      for (let c = 0; c < bRow.length; c++) row[r + c] = bRow[c];
      M.push(row);
    }
    return mpolyDet(M);
  }
  // Discriminant (up to the leading-coefficient/sign factor): Res(p, ∂p/∂var).
  // By the standard identity Res(p, ∂p/∂v) = ±lc_v(p)·disc_v(p), so its zero set is
  // V(disc) ∪ V(lc_v(p)) — the genuine double-root locus PLUS the spurious degree-drop
  // stratum lc_v(p)=0 (where p loses degree in v; not a real border). That extra branch
  // is invisible when lc_v(p) is a constant (a monic p — e.g. disc(x²+bx+c)=−b²+4c) but a
  // real spurious component when the leading coefficient is parameter-dependent. Callers
  // that use the result AS A BORDER EQUATION — a variety whose points must be genuine
  // double roots — MUST use reducedDiscriminant() (below), NOT this raw form.
  function discriminant(p, varName) {
    return resultant(p, p.derivativeIn(varName), varName);
  }
  // Reduced discriminant — the GENUINE double-root locus with the spurious degree-drop
  // stratum removed. Since lc_v(p) divides Res(p, ∂p/∂v) EXACTLY (the identity above is a
  // polynomial identity in the coefficients), one exact division yields ±disc_v(p), whose
  // vanishing IS precisely V(disc) — no lc_v(p)=0 branch. NOTE we divide by lc exactly ONCE:
  // stripping gcd(Res, lc^k) instead would over-remove any factor genuinely shared between
  // disc and lc (a real border coincidence), so single division is the correct reduction.
  // Returns 0 unchanged when p is constant/zero in v or shares a repeated factor with ∂p/∂v
  // (Res≡0); returns the constant 1 for degree-1 p (a line never has a double root).
  function reducedDiscriminant(p, varName) {
    const disc = discriminant(p, varName);
    if (disc.isZero()) return disc;                     // constant/zero in v, or repeated factor
    return mpolyExactDiv(disc, _lcInV(p, varName));     // lc_v(p) | Res exactly ⇒ ±disc_v(p)
  }

  // ---------------------------------------------------------------------------
  // Polynomial factorization (RADICAL — distinct factors, for case-splitting a
  // variety V(p) = ⋃ V(fᵢ)). factor(p, opts) → { ok, factors:[MPoly], reason }.
  // EVERY returned factor is verified to divide p exactly (mpolyExactDiv), so a
  // returned factorization is provably correct; an input we cannot split returns
  // ok:false with factors:[p]. Three exact methods, applied in order:
  //   (1) MONOMIAL — a variable dividing every term ⇒ that variable is a case
  //       (peel x^min, push the factor x).
  //   (2) VARIABLE-DISJOINT product — when the variables partition into groups
  //       with no term mixing two groups, test p = A·B by substituting one group
  //       to a constant and VERIFYING A·B = κ·p exactly.
  //   (3) UNIVARIATE (one variable only) — the EXACT ℚ(i) factorizer (_qiFactor):
  //       the shifted norm trick + Berlekamp–Zassenhaus over ℚ returns the COMPLETE
  //       irreducible factorization, including factors irreducible over ℚ(i) of
  //       degree ≥ 2 (e.g. x⁴+x²+1 → {x²+x+1, x²−x+1}).
  // Multiplicities collapse (only distinct zero sets matter for the case split).
  // opts is accepted for back-compat (older callers pass rootFinder/ratApprox) but
  // the univariate path is now exact and needs neither.
  // ---------------------------------------------------------------------------
  // Leading coefficient under the default (grlex) order — a stable scalar for the
  // monic normalization below. Returns 0 for the zero polynomial.
  function _factorLeadCoeff(p) { const t = _leadTerm(p); return t ? t.coeff : Gaussian.fromInt(0); }
  // Canonical (monic) form: divide by the leading coefficient so two factors that are
  // equal up to a nonzero scalar compare equal (used only for dedup keys, not output).
  function _factorMonic(p) { const c = _factorLeadCoeff(p); return c.isZero() ? p : p.scale(Gaussian.fromInt(1).div(c)); }
  // Push p as a distinct non-constant factor (dedup up to a nonzero scalar via monic form).
  function _factorPush(list, p) {
    if (p.vars().size === 0) return;
    const m = _factorMonic(p);
    if (list.some((q) => _factorMonic(q).equals(m))) return;
    list.push(p);
  }
  // Minimum exponent of `v` across all terms of p (0 ⇒ v does not divide every term).
  function _minExp(p, v) {
    let mn = Infinity;
    for (const t of p.terms.values()) { const e = t.mono.get(v) || 0; if (e < mn) mn = e; if (mn === 0) break; }
    return mn === Infinity ? 0 : mn;
  }
  // Multiplicative variable groups via the SEPARABILITY test: variables u, w belong to
  // the same factor iff  p·∂²p/∂u∂w − (∂p/∂u)(∂p/∂w) ≢ 0  (for p = A·B with u∈A, w∈B that
  // difference is identically zero). Union-find on the nonzero pairs ⇒ the finest grouping
  // into multiplicative factors. Returns the array of variable groups (≥1).
  function _separableGroups(p) {
    const vars = [...p.vars()];
    const parent = {}; vars.forEach((v) => { parent[v] = v; });
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let i = 0; i < vars.length; i++) {
      const du = p.derivativeIn(vars[i]);
      for (let j = i + 1; j < vars.length; j++) {
        if (find(vars[i]) === find(vars[j])) continue;
        const d = p.mul(du.derivativeIn(vars[j])).sub(du.mul(p.derivativeIn(vars[j])));
        if (!d.isZero()) parent[find(vars[i])] = find(vars[j]);   // u, w share a factor
      }
    }
    const comps = {};
    for (const v of vars) { const r = find(v); (comps[r] = comps[r] || []).push(v); }
    return Object.values(comps);
  }
  // p = ∏ Aᵢ(Sᵢ) over the separable variable groups: project p onto each group by
  // substituting the OTHER groups to a constant (a few trial values), then VERIFY the
  // product equals κ·p exactly. Returns the array of factors, or null.
  function _separableSplit(p) {
    const vars = [...p.vars()];
    if (vars.length < 2 || vars.length > 8 || p.terms.size > 300) return null;   // size guard
    const groups = _separableGroups(p);
    if (groups.length < 2) return null;
    const constOf = (val) => MPoly.constant(gauss(rat(val, 1n), rat(0n, 1n)));
    for (const val of [0n, 1n, 2n, -1n, 3n]) {
      const facs = groups.map((grp) => {
        const grpSet = new Set(grp), sub = {};
        for (const v of vars) if (!grpSet.has(v)) sub[v] = constOf(val);
        return p.subst(sub);                                  // factor in `grp` vars (× a constant)
      });
      if (facs.some((f) => f.vars().size === 0)) continue;    // degenerate value — retry
      let prod = facs[0]; for (let i = 1; i < facs.length; i++) prod = prod.mul(facs[i]);
      const ltP = _leadTerm(prod), lp = _leadTerm(p);
      if (!ltP || !lp || lp.coeff.isZero()) continue;
      if (prod.equals(p.scale(ltP.coeff.div(lp.coeff)))) return facs;   // EXACT verification
    }
    return null;
  }
  // ---- univariate GCD + square-free over ℚ(i) (a single variable) -------------
  // Gaussian coefficient of a constant MPoly (the empty-monomial term), else 0.
  function _constGauss(p) { for (const t of p.terms.values()) if (t.mono.size === 0) return t.coeff; return Gaussian.fromInt(0); }
  // MPoly univariate in v → ascending Gaussian coefficient array [c₀, c₁, …, c_d].
  function _uniToArr(p, v) { return p.coeffsIn(v).map((c) => _constGauss(c)); }
  // Ascending Gaussian array → MPoly Σ aᵢ·v^i (zero coefficients skipped).
  function _uniFromArr(arr, v) {
    let out = MPoly.zero();
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].isZero()) continue;
      const t = new MPoly(); t._addTerm(new Map(i > 0 ? [[v, i]] : []), arr[i]); out = out.add(t);
    }
    return out;
  }
  // Monic GCD of two univariate Gaussian-coefficient arrays via the Euclidean algorithm
  // (ℚ(i) is a field, so the remainder sequence terminates). Returns a monic array; [1]
  // for coprime inputs, [0] only if both inputs are zero.
  function _uniGCDArr(a, b) {
    const trim = (x) => { while (x.length && x[x.length - 1].isZero()) x.pop(); return x; };
    let f = trim(a.slice()), g = trim(b.slice());
    let guard = 0;
    while (g.length) {
      const r = f.slice(), lcg = g[g.length - 1];
      while (trim(r).length >= g.length && r.length) {
        const lc = r[r.length - 1], q = lc.div(lcg), shift = r.length - g.length;
        for (let i = 0; i < g.length; i++) r[shift + i] = r[shift + i].sub(q.mul(g[i]));
        trim(r);
        if (++guard > 1e6) throw new Error('univariateGCD: non-terminating');
      }
      f = g; g = trim(r);
    }
    if (!f.length) return [Gaussian.fromInt(0)];
    const lc = f[f.length - 1];
    return f.map((c) => c.div(lc));                            // monic
  }
  // Monic univariate GCD of two polynomials in the single variable v over ℚ(i).
  function univariateGCD(p, q, v) { return _uniFromArr(_uniGCDArr(_uniToArr(p, v), _uniToArr(q, v)), v); }
  // ── ascending Gaussian-coefficient array arithmetic over ℚ(i)[x] (for the Hensel oracle, roadmap #19 P5) ──
  // (These mirror the real-ℚ Sturm arrays, but over ℚ(i). Arrays are ascending [c₀,c₁,…]; [] is zero.)
  function _gaTrim(a) { a = a.slice(); while (a.length && a[a.length - 1].isZero()) a.pop(); return a; }
  function _gaMul(a, b) {
    if (!a.length || !b.length) return [];
    const out = new Array(a.length + b.length - 1).fill(Gaussian.fromInt(0));
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = out[i + j].add(a[i].mul(b[j]));
    return _gaTrim(out);
  }
  function _gaSub(a, b) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push((i < a.length ? a[i] : Gaussian.fromInt(0)).sub(i < b.length ? b[i] : Gaussian.fromInt(0)));
    return _gaTrim(out);
  }
  // a = q·b + r with deg r < deg b, over the field ℚ(i). b must be nonzero.
  function _gaDivRem(a, b) {
    let r = _gaTrim(a.slice()); const bb = _gaTrim(b.slice());
    if (!bb.length) throw new Error('_gaDivRem: division by zero');
    const lcb = bb[bb.length - 1];
    const q = new Array(Math.max(0, r.length - bb.length + 1)).fill(Gaussian.fromInt(0));
    while (r.length >= bb.length && r.length) {
      const co = r[r.length - 1].div(lcb), shift = r.length - bb.length;
      q[shift] = co;
      for (let i = 0; i < bb.length; i++) r[shift + i] = r[shift + i].sub(co.mul(bb[i]));
      r = _gaTrim(r);
    }
    return { q: _gaTrim(q), r };
  }
  // Inverse of `a` modulo `m` over ℚ(i)[x] (extended Euclid), reduced to deg < deg m; null if gcd(a,m) ≠ unit.
  function _gaModInv(a, m) {
    let R0 = _gaTrim(a.slice()), R1 = _gaTrim(m.slice());
    let S0 = [Gaussian.fromInt(1)], S1 = [];
    while (R1.length) {
      const { q, r } = _gaDivRem(R0, R1);
      R0 = R1; R1 = r;
      const ns = _gaSub(S0, _gaMul(q, S1));
      S0 = S1; S1 = ns;
    }
    if (R0.length !== 1) return null;                          // gcd non-constant ⇒ not coprime
    const g = R0[0];                                           // S0·a ≡ g (mod m) ⇒ (S0/g)·a ≡ 1
    return _gaDivRem(S0.map((c) => c.div(g)), m).r;
  }
  // Drop every term of an MPoly whose exponent of `v` is ≥ N (truncate mod v^N).
  function _truncInVar(p, v, N) {
    const out = new MPoly();
    for (const [key, t] of p.terms) if ((t.mono.get(v) || 0) < N) out.terms.set(key, { mono: new Map(t.mono), coeff: t.coeff });
    return out;
  }
  // All size-k index subsets of `arr` (k small; used by Hensel recombination).
  function _subsetsOfSize(arr, k) {
    const out = [];
    const rec = (start, acc) => {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
    };
    rec(0, []);
    return out;
  }

  // Square-free part (radical) of a univariate p in v: p / gcd(p, p′). Same zero set as
  // p but every root simple. p must be univariate in v (else returns p unchanged).
  function squareFreePart(p, v) {
    if (p.vars().size !== 1) return p;
    const dp = p.derivativeIn(v);
    if (dp.isZero()) return p;
    const g = univariateGCD(p, dp, v);
    if (g.degreeIn(v) <= 0) return p;                          // already square-free
    return mpolyExactDiv(p, g);
  }

  // ===========================================================================
  // G5 — REAL-ROOT ISOLATION over ℚ via STURM SEQUENCES (exact, certified).
  //
  // For a univariate polynomial with RATIONAL (real) coefficients, returns a list of
  // isolating intervals [lo,hi] with exact rational endpoints, each enclosing exactly ONE
  // distinct real root. The count in every interval is a Sturm count — V(lo)−V(hi), the drop
  // in sign-variations of the Sturm chain — which is EXACT (all arithmetic over ℚ), and each
  // bracket has opposite-sign endpoints (or coincident endpoints at an exact rational root).
  // The certification is therefore unconditional; intervals are refined to width < opts.tol
  // by exact bisection (chosen over interval-Newton so the enclosure stays rigorous with no
  // floating point). Operates on the SQUARE-FREE part, so the roots reported are the distinct
  // real roots. Refs: Basu–Pollack–Roy "Algorithms in Real Algebraic Geometry" §2.2 (Sturm).
  // ---------------------------------------------------------------------------
  // Rational-array (ascending) polynomial helpers — a real univariate over ℚ.
  function _raTrim(a) { a = a.slice(); while (a.length && a[a.length - 1].isZero()) a.pop(); return a; }
  function _raEval(a, x) { let acc = RZERO; for (let i = a.length - 1; i >= 0; i--) acc = acc.mul(x).add(a[i]); return acc; }
  function _raDeriv(a) { const out = []; for (let i = 1; i < a.length; i++) out.push(a[i].mul(Rational.fromInt(i))); return _raTrim(out); }
  // Remainder of f ÷ g over ℚ (both ascending Rational arrays, g ≠ 0).
  function _raRem(f, g) {
    let r = _raTrim(f); g = _raTrim(g);
    const dg = g.length - 1, lcg = g[dg];
    let guard = 0;
    while (r.length - 1 >= dg && r.length) {
      const dr = r.length - 1, factor = r[dr].div(lcg), shift = dr - dg;
      for (let i = 0; i <= dg; i++) r[shift + i] = r[shift + i].sub(factor.mul(g[i]));
      r = _raTrim(r);
      if (++guard > 1e6) throw new Error('realRootIsolate: non-terminating remainder');
    }
    return r;
  }
  // Sturm chain of a square-free real poly: s₀ = p, s₁ = p′, s_{k+1} = −rem(s_{k-1}, s_k).
  function _sturmChain(a) {
    const chain = [_raTrim(a)]; const d = _raDeriv(a); if (!d.length) return chain;
    chain.push(d);
    let guard = 0;
    while (true) {
      const r = _raRem(chain[chain.length - 2], chain[chain.length - 1]);
      if (!r.length) break;
      chain.push(r.map((c) => c.neg()));
      if (++guard > 1e5) throw new Error('realRootIsolate: Sturm chain too long');
    }
    return chain;
  }
  // Sign-variation count V(x) of the chain at a rational x (zeros skipped).
  function _sturmV(chain, x) {
    let prev = 0, vars = 0;
    for (const s of chain) { const sg = _raEval(s, x).sign(); if (sg === 0) continue; if (prev !== 0 && sg !== prev) vars++; prev = sg; }
    return vars;
  }
  // Cauchy root bound (1 + max|aᵢ|/|a_deg|) as a Rational, bumped until ±B are non-roots.
  function _cauchyBound(a) {
    const d = a.length - 1, lc = a[d]; let m = RZERO;
    const rabs = (r) => (r.sign() < 0 ? r.neg() : r);
    for (let i = 0; i < d; i++) { const q = rabs(a[i].div(lc)); if (q.sub(m).sign() > 0) m = q; }
    let B = m.add(RONE);
    let guard = 0;
    while (_raEval(a, B).isZero() || _raEval(a, B.neg()).isZero()) { B = B.add(RONE); if (++guard > 1e4) break; }
    return B;
  }
  // Clear a Rational ascending array to a BigInt integer array (×lcm of denominators).
  function _raToIntArr(a) { let L = 1n; for (const r of a) L = _blcm(L, r.d) || 1n; return a.map((r) => r.n * (L / r.d)); }
  // Positive divisors of |n| (capped — caller guards the magnitude).
  function _bdivisors(n) {
    n = n < 0n ? -n : n; if (n === 0n) return [1n];
    const ds = [];
    for (let i = 1n; i * i <= n; i++) { if (n % i === 0n) { ds.push(i); if (i !== n / i) ds.push(n / i); } }
    return ds;
  }
  // Exact rational roots of a square-free real univariate (rational-root theorem). Returns []
  // (still catching x=0) when the leading/trailing integer coefficients are too large to factor
  // cheaply — isolation then reports those roots as narrow brackets rather than exact rationals.
  function _rationalRootsOf(a) {
    const ia = _raToIntArr(a); const d = ia.length - 1; if (d < 1) return [];
    const roots = [];
    if (ia[0] === 0n) roots.push(RZERO);                  // x = 0
    let k = 0; while (k < ia.length && ia[k] === 0n) k++;  // trailing (low) zeros → nonzero const
    const a0 = ia[k] < 0n ? -ia[k] : ia[k], aN = ia[d] < 0n ? -ia[d] : ia[d];
    const CAP = 1000000000n;                               // 1e9 — keeps the divisor sieve fast
    if (a0 > CAP || aN > CAP) return roots;
    const P = _bdivisors(a0), Q = _bdivisors(aN), seen = new Set();
    for (const pp of P) for (const q of Q) for (const sgn of [1n, -1n]) {
      const r = new Rational(sgn * pp, q), key = r.n + '/' + r.d;
      if (seen.has(key)) continue; seen.add(key);
      if (_raEval(a, r).isZero()) roots.push(r);
    }
    return roots;
  }
  function realRootIsolate(p, v, opts) {
    opts = opts || {};
    const tol = (opts.tol != null) ? Number(opts.tol) : 1e-9;
    if (!(p instanceof MPoly) || p.isZero()) return { ok: false, reason: 'zero or invalid polynomial' };
    const vs = p.vars();
    if (vs.size > 1 || (vs.size === 1 && !vs.has(v))) return { ok: false, reason: 'not univariate in ' + v };
    for (const g of _uniToArr(p, v)) if (!g.im.isZero()) return { ok: false, reason: 'polynomial has non-real coefficients' };
    const sf = squareFreePart(p, v);
    const a = _raTrim(_uniToArr(sf, v).map((g) => g.re));
    if (a.length <= 1) return { ok: true, count: 0, roots: [] };   // constant ⇒ no roots
    let chain; try { chain = _sturmChain(a); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    const half = new Rational(1n, 2n);
    const isRoot = (x) => _raEval(a, x).isZero();
    const ratRoots = _rationalRootsOf(a);                  // exact rational roots (reported as lo==hi)
    // Refine a count-1 bracket (lo,hi] to width < tol by exact bisection — unless an exact
    // rational root lies in it, in which case report that root precisely.
    const refine = (lo, hi) => {
      for (const r of ratRoots) if (lo.sub(r).sign() <= 0 && r.sub(hi).sign() <= 0) return { lo: r, hi: r, exact: true, approx: r.toNumber() };
      let g = 0;
      while (hi.sub(lo).toNumber() >= tol && g < 200) {
        const m = lo.add(hi).mul(half);
        if (isRoot(m)) return { lo: m, hi: m, exact: true, approx: m.toNumber() };
        // root is in (lo,hi]; keep the half whose right end still has the sign drop
        if (_sturmV(chain, lo) - _sturmV(chain, m) >= 1) hi = m; else lo = m;
        g++;
      }
      return { lo, hi, exact: false, approx: hi.add(lo).mul(half).toNumber() };
    };
    const out = [];
    const B = _cauchyBound(a);
    // Work-list of (lo,hi] brackets with their Sturm counts; split at a non-root midpoint.
    const stack = [[B.neg(), B]];
    let guard = 0;
    while (stack.length) {
      if (++guard > 100000) return { ok: false, reason: 'isolation did not terminate (degenerate input)' };
      const [lo, hi] = stack.pop();
      const cnt = _sturmV(chain, lo) - _sturmV(chain, hi);
      if (cnt <= 0) continue;
      if (cnt === 1) { out.push(refine(lo, hi)); continue; }
      let m = lo.add(hi).mul(half);
      let nudge = 0;
      while (isRoot(m) && nudge < 60) { m = lo.add(m).mul(half); nudge++; }   // pick a non-root splitter
      stack.push([lo, m], [m, hi]);
    }
    out.sort((x, y) => x.approx - y.approx);
    return { ok: true, count: out.length, roots: out };
  }
  // Number of distinct real roots of a real univariate p in (lo, hi] (defaults to all of ℝ via
  // the Cauchy bound) — a thin Sturm-count wrapper (also the primitive Phase-5 Sturm work wants).
  function realRootCount(p, v, lo, hi) {
    if (!(p instanceof MPoly) || p.isZero()) return null;
    const vs = p.vars(); if (vs.size > 1 || (vs.size === 1 && !vs.has(v))) return null;
    for (const g of _uniToArr(p, v)) if (!g.im.isZero()) return null;
    const a = _raTrim(_uniToArr(squareFreePart(p, v), v).map((g) => g.re));
    if (a.length <= 1) return 0;
    const chain = _sturmChain(a);
    const B = _cauchyBound(a);
    const L = (lo != null) ? lo : B.neg(), H = (hi != null) ? hi : B;
    return _sturmV(chain, L) - _sturmV(chain, H);
  }

  // ===========================================================================
  // G2 — STURM–HABICHT (signed subresultant) real-root counting, PARAMETRIC.
  //
  // G5's Sturm chain divides by the (numeric) leading coefficients, so it cannot be
  // specialized symbolically: a parametric leading coefficient might vanish, and the
  // division is invalid there. The SIGNED SUBRESULTANT / Sturm–Habicht machinery is the
  // DIVISION-STABLE cousin — every principal coefficient is a POLYNOMIAL in the original
  // coefficients (hence in the parameters), computed as a Sylvester-style determinant
  // (no division at all), so it specializes correctly everywhere. The number of DISTINCT
  // real roots of p is then a function of the SIGNS of those principal Sturm–Habicht
  // coefficients — i.e. a tree of parametric sign conditions. The discriminant appears
  // among them (sthaj₀ ∝ ±Res(p,p′) ∝ disc), so e.g. the cardioid resolvent cubic
  // s³−M₀s²+2|M₁|² yields the cusp locus (disc = 0) as the boundary between its 1-real
  // and 3-real strata. Refs: Basu–Pollack–Roy "Algorithms in Real Algebraic Geometry"
  // §4.2 (signed subresultants) & §9 (real-root counting); González-Vega–Lombardi–Recio–
  // Roy, Sturm–Habicht sequences.
  //
  // The construction (validated by hand on the quadratic/cubic and exhaustively against
  // G5 in the test suite):
  //   • stha_p     = lc_v(p)            (leading coefficient)
  //   • stha_{p−1} = lc_v(p′) = p·a_p   (the (p−1)-subresultant is p′ itself)
  //   • stha_j     = εⱼ · psc_j  for 0 ≤ j ≤ p−2,  εⱼ = (−1)^{(p−j)(p−j−1)/2},
  //     psc_j = the j-th principal SUBRESULTANT coefficient of (p, p′) = the determinant
  //     of the Sylvester submatrix with (q−j) shifted rows of p and (p−j) shifted rows of
  //     p′ over the first (p+q−2j) columns (q = deg p′ = p−1). psc_0 = Res(p, p′) exactly.
  //   • #distinct real roots = PmV(stha_p, …, stha_0)  (permanences minus variations over
  //     consecutive NONZERO signs) — Sturm's theorem read off the Sturm–Habicht principal
  //     coefficients.
  //
  // SCOPE / honesty: the sign conditions classify the GENERIC stratum (no principal
  // coefficient vanishing). On a specialization where one vanishes (a case boundary / a
  // multiple root) realRootCountSturm reports `degenerate:true` and DEFERS the count to the
  // exact numeric G5 `realRootCount` (which uses the square-free part, so it counts distinct
  // roots correctly even there). The full parameter case-tree is G1 (comprehensive Gröbner
  // systems). ⚠ MATH-REVIEW NOTE (Andrew): the sign/ε convention below is pinned EMPIRICALLY
  // by the numeric oracle (random specializations vs G5), not hand-proved in generality —
  // flagged for your review like the RUR (G6).
  // ---------------------------------------------------------------------------
  function _lcInV(p, v) { const d = p.degreeIn(v); return d < 0 ? MPoly.zero() : p.coeffsIn(v)[d]; }
  // εⱼ = (−1)^{(p−j)(p−j−1)/2}: the sign relating the j-th subresultant to the j-th
  // Sturm–Habicht polynomial (the ½(p−j)(p−j−1) triangular exponent mod 2 → the ++−− period).
  function _epsSign(p, j) { const m = p - j; return ((((m * (m - 1)) / 2) % 2) === 0) ? 1 : -1; }
  // j-th principal subresultant coefficient of (P, Pp) in v (0 ≤ j ≤ p−2), as a determinant
  // over MPoly (Bareiss; no division). j = 0 reproduces the Sylvester resultant Res(P, Pp).
  function _principalSubresCoeff(P, Pp, v, j) {
    const p = P.degreeIn(v), q = Pp.degreeIn(v);
    const aCo = P.coeffsIn(v), bCo = Pp.coeffsIn(v);
    const aRow = []; for (let k = p; k >= 0; k--) aRow.push(aCo[k]);   // high → low
    const bRow = []; for (let k = q; k >= 0; k--) bRow.push(bCo[k]);
    const rowsA = q - j, rowsB = p - j, size = rowsA + rowsB;          // = p + q − 2j
    const M = [];
    for (let r = 0; r < rowsA; r++) {
      const row = []; for (let c = 0; c < size; c++) row.push(MPoly.zero());
      for (let c = 0; c < aRow.length && (r + c) < size; c++) row[r + c] = aRow[c];
      M.push(row);
    }
    for (let r = 0; r < rowsB; r++) {
      const row = []; for (let c = 0; c < size; c++) row.push(MPoly.zero());
      for (let c = 0; c < bRow.length && (r + c) < size; c++) row[r + c] = bRow[c];
      M.push(row);
    }
    return mpolyDet(M);
  }
  // sturmHabicht(p, v) → { ok, degree, stha:[{ j, coeff:MPoly }] (j = p, p−1, …, 0) }.
  // The `coeff` MPolys are the principal Sturm–Habicht coefficients — polynomials in the
  // PARAMETERS (the variables of p other than v); their signs drive the real-root count.
  function sturmHabicht(p, v) {
    if (!(p instanceof MPoly) || p.isZero()) return { ok: false, reason: 'zero or invalid polynomial' };
    const deg = p.degreeIn(v);
    if (deg < 1) return { ok: false, reason: 'polynomial has degree < 1 in ' + v };
    const pp = p.derivativeIn(v);
    const stha = [{ j: deg, coeff: _lcInV(p, v) }];
    stha.push({ j: deg - 1, coeff: _lcInV(pp, v) });          // the (p−1)-subresultant is p′
    try {
      for (let j = deg - 2; j >= 0; j--) {
        let c = _principalSubresCoeff(p, pp, v, j);
        if (_epsSign(deg, j) < 0) c = c.neg();
        stha.push({ j, coeff: c });
      }
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    return { ok: true, degree: deg, stha };
  }
  // Permanences − variations over a sign list (ordered stha_p … stha_0), zeros skipped.
  function _pmv(signs) {
    let prev = 0, c = 0;
    for (const s of signs) { if (s === 0) continue; if (prev !== 0) c += (s === prev) ? 1 : -1; prev = s; }
    return c;
  }
  function _toReIm(val) {
    if (val instanceof Gaussian) return val.toComplex();
    if (typeof val === 'number') return { re: val, im: 0 };
    return { re: (val && val.re) || 0, im: (val && val.im) || 0 };
  }
  function _constFromValue(val) {
    if (val instanceof Gaussian) return MPoly.constant(val);
    if (typeof val === 'number' && Number.isInteger(val)) return MPoly.fromInt(val);
    return null;   // non-exact value ⇒ no exact substitution (oracle skipped)
  }
  // realRootCountSturm(p, v, opts) — number of DISTINCT real roots of p over all of ℝ, via
  // the Sturm–Habicht principal-coefficient signs. p may carry PARAMETERS; opts.values maps
  // each parameter → an exact Gaussian (or integer/number) specialization. Returns
  // { ok, count, degenerate, oracle?, note? }: when p specializes to a real univariate it
  // also computes the exact G5 count as `oracle` and PREFERS it on a degenerate stratum
  // (a vanishing principal coefficient). reason on failure.
  function realRootCountSturm(p, v, opts) {
    opts = opts || {};
    const sh = sturmHabicht(p, v);
    if (!sh.ok) return sh;
    const tol = opts.tol != null ? Number(opts.tol) : 1e-9;
    const values = opts.values || {};
    const numMap = {}; for (const k of Object.keys(values)) numMap[k] = _toReIm(values[k]);
    let degenerate = false, indeterminate = false;
    const signs = sh.stha.map(({ coeff }) => {
      for (const vn of coeff.vars()) if (!(vn in numMap)) { indeterminate = true; return null; }
      const z = coeff.evalComplex(numMap);
      if (Math.abs(z.im) > tol) { indeterminate = true; return null; }
      if (Math.abs(z.re) <= tol) { degenerate = true; return 0; }
      return z.re > 0 ? 1 : -1;
    });
    // exact oracle (G5) when p specializes to a real univariate in v
    let oracle = null;
    const subMap = {}; let exactSub = true;
    for (const k of Object.keys(values)) { const c = _constFromValue(values[k]); if (c) subMap[k] = c; else exactSub = false; }
    if (exactSub) {
      const pn = Object.keys(subMap).length ? p.subst(subMap) : p;
      if (pn.vars().size <= 1 && (pn.vars().size === 0 || pn.vars().has(v))) {
        let real = true;
        for (const g of _uniToArr(pn, v)) if (!g.im.isZero()) { real = false; break; }
        if (real) oracle = realRootCount(pn, v);
      }
    }
    if (indeterminate) {
      if (oracle != null) return { ok: true, count: oracle, degenerate: false, oracle, note: 'numeric count via G5 (some parametric signs unresolved)' };
      return { ok: false, reason: 'cannot count: coefficients remain parametric (supply opts.values) or are non-real' };
    }
    // A DEGENERATE stratum (a vanishing principal coefficient ⇒ an internal zero in the sign
    // sequence) is NOT counted by the naive permanences−variations of _pmv — that needs the
    // generalized BPR gap rule. So on a degenerate stratum we MUST defer to the exact G5 oracle;
    // if it isn't available (e.g. a non-integer/non-Gaussian float value couldn't be substituted
    // exactly) we report ok:false rather than return the naive — and wrong — count.
    if (degenerate) {
      if (oracle != null) return { ok: true, count: oracle, degenerate: true, oracle };
      return { ok: false, degenerate: true, reason: 'degenerate stratum (a principal Sturm–Habicht coefficient vanishes); supply exact integer/Gaussian values so the exact G5 count can certify it — the naive sign count is unreliable here' };
    }
    return { ok: true, count: _pmv(signs), degenerate: false, oracle };
  }

  // ===========================================================================
  // G7 — MULTIVARIATE GCD over ℚ(i) (recursive primitive PRS) + ZERO-DIM RADICAL.
  //
  // ℚ(i)[x₁…xₙ] is a UFD, so the GCD is well defined up to a unit (a nonzero ℚ(i) scalar).
  // gcdMV(f,g) recurses on the main variable x: content_x = gcd of the x-coefficients (a
  // polynomial in the OTHER variables — one fewer, so the recursion terminates at constants),
  // primitive part = poly / content; the GCD of the primitive parts is the last nonzero term
  // of a PRIMITIVE polynomial-remainder sequence (pseudo-remainder, then divide out content
  // each step — textbook, slower than subresultant PRS but immune to its sign/β subtleties),
  // and gcd(f,g) = gcd(content_f,content_g) · primitive-part-gcd. Normalized monic in grevlex.
  // (Partial fractions over ℚ(i) — the third G7 sub-item — is DEFERRED: it needs an exact
  // ℚ(i) linear solve / square-free factorization, a separate piece.) Ref: GCL "Algorithms
  // for Computer Algebra" §7.2 (primitive PRS).
  // ---------------------------------------------------------------------------
  function _gcdNormalize(p) {
    if (p.isZero()) return p;
    const vs = [...p.vars()].sort();
    if (!vs.length) return MPoly.constant(Gaussian.fromInt(1));   // nonzero constant ⇒ unit
    const lc = p.leadingCoeff(monomialOrder('grevlex', vs));
    return lc.isZero() ? p : p.scale(Gaussian.fromInt(1).div(lc));
  }
  function gcdMV(f, g) {
    if (!(f instanceof MPoly) || !(g instanceof MPoly)) throw new Error('gcdMV: MPoly expected');
    if (f.isZero()) return _gcdNormalize(g);
    if (g.isZero()) return _gcdNormalize(f);
    const vars = new Set([...f.vars(), ...g.vars()]);
    if (vars.size === 0) return MPoly.constant(Gaussian.fromInt(1));   // both nonzero constants
    const x = [...vars].sort()[0];                                     // main variable (deterministic)
    const contentOf = (p) => {
      const cs = p.coeffsIn(x).filter((c) => !c.isZero());   // coeffs are x-free by construction
      if (!cs.length) return MPoly.constant(Gaussian.fromInt(1));
      let c = cs[0];
      // fold the gcd over the remaining coefficients; stop early once it collapses to a unit.
      for (let i = 1; i < cs.length && c.vars().size > 0; i++) c = gcdMV(c, cs[i]);
      return c;
    };
    const cf = contentOf(f), cg = contentOf(g);
    const cc = gcdMV(cf, cg);
    let A = mpolyExactDiv(f, cf), B = mpolyExactDiv(g, cg);            // primitive parts in x
    if (A.degreeIn(x) < B.degreeIn(x)) { const t = A; A = B; B = t; }
    let guard = 0;
    while (!B.isZero()) {
      const R = pseudoRemainder(A, B, x);
      A = B;
      B = R.isZero() ? MPoly.zero() : mpolyExactDiv(R, contentOf(R));  // primitive part of R
      if (++guard > 1e5) throw new Error('gcdMV: non-terminating PRS');
    }
    const ppGCD = (A.degreeIn(x) > 0) ? mpolyExactDiv(A, contentOf(A)) : MPoly.constant(Gaussian.fromInt(1));
    return _gcdNormalize(cc.mul(ppGCD));
  }
  // GCD of a list (≥1) of MPolys over ℚ(i), folded via gcdMV.
  function gcdList(polys) {
    const ps = (polys || []).filter((p) => p instanceof MPoly);
    if (!ps.length) return MPoly.zero();
    let g = ps[0];
    for (let i = 1; i < ps.length; i++) { g = gcdMV(g, ps[i]); if (g.vars().size === 0 && !g.isZero()) break; }
    return _gcdNormalize(g);
  }

  // --- Bivariate factorization infrastructure (roadmap #19, Gao's method — see docs/MULTIVARIATE_FACTORING.md) ---
  // Content of f in a CHOSEN main variable xVar: the gcd (over ℚ(i)[other vars]) of f's xVar-coefficients —
  // an MPoly free of xVar. (gcdMV's own content uses the smallest-sorted variable; the factorizer must pick
  // the main variable, so it needs this explicit-variable form.)
  function bivariateContent(f, xVar) {
    if (!(f instanceof MPoly)) throw new Error('bivariateContent: MPoly expected');
    if (f.isZero()) return MPoly.zero();
    const cs = f.coeffsIn(xVar).filter((c) => !c.isZero());
    return cs.length ? gcdList(cs) : MPoly.constant(Gaussian.fromInt(1));
  }
  // Primitive part in xVar: f / content_{xVar}(f). A unit content ⇒ f is already primitive.
  function bivariatePrimitivePart(f, xVar) {
    const c = bivariateContent(f, xVar);
    return c.vars().size === 0 ? f : mpolyExactDiv(f, c);
  }
  // f squarefree in xVar ⟺ gcd(f, ∂f/∂xVar) has xVar-degree 0. On the PRIMITIVE part (pure-other-variable
  // content already stripped) this is Gao's gcd(f, f_x) = 1 precondition.
  function bivariateSquarefreeInX(f, xVar) {
    if (!(f instanceof MPoly) || f.isZero()) return false;
    const d = f.derivativeIn(xVar);
    if (d.isZero()) return f.degreeIn(xVar) <= 0; // f free of xVar ⇒ trivially "squarefree in x"
    return gcdMV(f, d).degreeIn(xVar) === 0;
  }

  // A single monomial coeff·xVar^a·yVar^b as an MPoly (zero if a<0 or b<0, so callers can pass the
  // "shifted" exponents a−1 / b−1 from a derivative without guarding). Small, allocation-light helper
  // for assembling the Ruppert linear system column by column.
  function _bivMono(xVar, yVar, a, b, coeff) {
    if (a < 0 || b < 0) return MPoly.zero();
    const g = coeff || Gaussian.fromInt(1);
    if (g.isZero()) return MPoly.zero();
    const mono = new Map();
    if (a > 0) mono.set(xVar, a);
    if (b > 0) mono.set(yVar, b);
    const p = new MPoly();
    p.terms.set(monoKey(mono), { mono, coeff: g });
    return p;
  }
  // (xVar-exp, yVar-exp) → Gaussian coeff, for a poly whose variables ⊆ {xVar, yVar}. Terms are already
  // merged (one per monomial key), so each (i,j) appears once. Used to lay a Ruppert contribution
  // polynomial down as a matrix COLUMN keyed by its monomials.
  function _bivTermMap(poly, xVar, yVar) {
    const map = new Map();
    for (const t of poly.terms.values()) {
      const i = t.mono.get(xVar) || 0;
      const j = t.mono.get(yVar) || 0;
      map.set(i + ',' + j, t.coeff);
    }
    return map;
  }

  // Shared preconditions for the bivariate factorizer (Phases 2–3). Throws (never silently coerces) unless
  // f is a nonzero polynomial in exactly (xVar, yVar) with positive degree in both after stripping the
  // pure-yVar content, and squarefree in xVar (Gao's reduced-curve hypothesis). Returns the primitive part
  // fp (pure-yVar content removed) that both the count and the extraction operate on. `who` names the
  // caller for legible errors (the substrings 'zero' / 'bivariate' / 'positive degree' / 'squarefree' /
  // 'differ' are load-bearing — the golden tests match on them).
  function _bivariatePrecond(f, xVar, yVar, who) {
    if (!(f instanceof MPoly)) throw new Error(who + ': MPoly expected');
    if (f.isZero()) throw new Error(who + ': the zero polynomial has no factorization');
    if (xVar === yVar) throw new Error(who + ': xVar and yVar must differ');
    for (const v of f.vars()) {
      if (v !== xVar && v !== yVar) throw new Error(who + ': not bivariate in (' + xVar + ', ' + yVar + '); found variable ' + v);
    }
    const fp = bivariatePrimitivePart(f, xVar); // strip the pure-yVar content (a separate univariate-in-y problem)
    if (fp.degreeIn(xVar) < 1 || fp.degreeIn(yVar) < 1) {
      throw new Error(who + ': needs positive degree in both ' + xVar + ' and ' + yVar +
        ' after stripping content (a single-variable input factors via the univariate path)');
    }
    if (!bivariateSquarefreeInX(fp, xVar)) {
      throw new Error(who + ': f must be squarefree in ' + xVar +
        ' (Gao\'s dimension theorem needs a reduced curve; strip repeated factors first)');
    }
    return fp;
  }

  // Assemble the Ruppert closedness-PDE linear system for the (already-validated) primitive squarefree
  // curve fp and return its exact ℚ(i) kernel. The PDE is
  //     f·(g_y − h_x) + h·f_x − g·f_y = 0,   deg_x g ≤ m−1, deg_y g ≤ n ;  deg_x h ≤ m, deg_y h ≤ n−1.
  // Each candidate unknown monomial contributes one COLUMN (the coefficients of its image under the PDE
  // operator); rows are the union of the monomials those images touch. The g-block columns come first,
  // so the count projects onto them and the extraction rebuilds g-polynomials from them via gMonos.
  // Returns { m, n, fx, fy, gMonos (ordered [a,b] list for the g-block), ngU (g-block size), basis }.
  function _ruppertNullspace(fp, xVar, yVar) {
    const m = fp.degreeIn(xVar), n = fp.degreeIn(yVar);
    const fx = fp.derivativeIn(xVar), fy = fp.derivativeIn(yVar);
    const gMonos = [], contribs = [];
    for (let a = 0; a <= m - 1; a++) {
      for (let b = 0; b <= n; b++) {
        gMonos.push([a, b]);
        // image of g = x^a y^b : f·g_y − f_y·g = b·f·x^a y^{b−1} − f_y·x^a y^b
        contribs.push(fp.mul(_bivMono(xVar, yVar, a, b - 1, Gaussian.fromInt(b))).sub(fy.mul(_bivMono(xVar, yVar, a, b))));
      }
    }
    const ngU = contribs.length; // size of the g-block (its columns precede every h column)
    for (let a = 0; a <= m; a++) {
      for (let b = 0; b <= n - 1; b++) {
        // image of h = x^a y^b : −f·h_x + f_x·h = −a·f·x^{a−1} y^b + f_x·x^a y^b
        contribs.push(fx.mul(_bivMono(xVar, yVar, a, b)).sub(fp.mul(_bivMono(xVar, yVar, a - 1, b, Gaussian.fromInt(a)))));
      }
    }
    // Rows = the union of every monomial any image touches; matrix M[row][col] = that Gaussian coeff.
    const rowIdx = new Map();
    const colMaps = contribs.map((c) => _bivTermMap(c, xVar, yVar));
    for (const cm of colMaps) for (const k of cm.keys()) if (!rowIdx.has(k)) rowIdx.set(k, rowIdx.size);
    const nr = rowIdx.size, nc = contribs.length;
    const M = [];
    for (let r = 0; r < nr; r++) M.push(new Array(nc).fill(Gaussian.fromInt(0)));
    for (let col = 0; col < nc; col++) for (const [k, g] of colMaps[col]) M[rowIdx.get(k)][col] = g;
    return { m, n, fx, fy, gMonos, ngU, basis: _gaussianNullspace(M) };
  }

  // ── Gao's ABSOLUTE bivariate factor count (roadmap #19 Phase 2; docs/MULTIVARIATE_FACTORING.md §5) ──
  // The number of ABSOLUTELY irreducible factors (i.e. over ℂ, not over ℚ(i)) of a squarefree plane curve
  // f ∈ ℚ(i)[xVar, yVar], as the dimension of the Ruppert closedness-PDE solution space G = { g : ∃ h
  // solving the PDE } (Gao 2003, Thm 2.3). The whole computation is exact over ℚ(i) — the nullspace
  // DIMENSION is integer-valued, so a floating rank could miscount; an exact ℚ(i) kernel cannot. We read
  // the kernel with the Phase-1 `_gaussianNullspace` (via `_ruppertNullspace`) and project onto the
  // g-block; the g-projection is injective on the kernel when deg_y f = n, so this equals the plain
  // nullity for a genuine bivariate curve, and is the faithful statement of the theorem regardless.
  //
  // HONEST LABELLING: the returned count is the ABSOLUTE (over-ℂ) factor count — an upper bound on the
  // number of factors over ℚ(i). E.g. x²+y² → 2 (splits as (x−iy)(x+iy) over ℚ(i) too), but x²−2y² → 2
  // while remaining IRREDUCIBLE over ℚ(i) (its factors live over ℚ(√2), not ℚ(i)). The ℚ(i)-rational
  // factorization is Phase 3 (`factorBivariate`). Validated exactly by the Phase-0 spike on the battery.
  function bivariateAbsFactorCount(f, xVar, yVar) {
    const fp = _bivariatePrecond(f, xVar, yVar, 'bivariateAbsFactorCount');
    const { ngU, basis } = _ruppertNullspace(fp, xVar, yVar);
    return _gaussianMatrixRank(basis.map((v) => v.slice(0, ngU))); // dim(G) = # absolutely-irreducible factors
  }
  // f absolutely irreducible ⟺ exactly one factor over ℂ. NOTE this is ABSOLUTE irreducibility, which is
  // STRICTLY STRONGER than irreducibility over ℚ(i): `true` guarantees irreducible over ℚ(i) as well,
  // but `false` does NOT imply ℚ(i)-reducible (x²−2y² splits over ℂ yet is ℚ(i)-irreducible). Same
  // preconditions as bivariateAbsFactorCount (thrown on violation).
  function isAbsolutelyIrreducible(f, xVar, yVar) {
    return bivariateAbsFactorCount(f, xVar, yVar) === 1;
  }

  // Rebuild the g-polynomial g(x,y) = Σ vec_i · x^{a_i} y^{b_i} from a kernel vector's g-block (the first
  // gMonos.length coordinates), using the gMonos monomial ordering `_ruppertNullspace` laid down.
  function _gPolyFromVec(vec, gMonos, xVar, yVar) {
    let g = MPoly.zero();
    for (let i = 0; i < gMonos.length; i++) {
      if (vec[i].isZero()) continue;
      g = g.add(_bivMono(xVar, yVar, gMonos[i][0], gMonos[i][1], vec[i]));
    }
    return g;
  }
  // Canonicalize a factor: strip pure-yVar content, then make it monic in xVar when its leading
  // xVar-coefficient is a nonzero constant (so conjugate / scalar-multiple variants of the same factor
  // compare equal). Leaves factors whose leading xVar-coefficient depends on yVar as their primitive part.
  function _canonicalFactor(p, xVar) {
    let q = bivariatePrimitivePart(p, xVar);
    const cs = q.coeffsIn(xVar);
    const lc = cs[cs.length - 1];
    if (lc.vars().size === 0 && !lc.isZero()) {
      const t = lc.terms.get('');
      if (t) q = q.scale(Gaussian.fromInt(1).div(t.coeff)); // divide out the constant leading coeff ⇒ monic in xVar
    }
    return q;
  }

  // ── Gao's ℚ(i)-RATIONAL bivariate factorization (roadmap #19 Phase 3) — the resultant-eigenvalue
  // extraction (docs/MULTIVARIATE_FACTORING.md §5). Given the r-dimensional Ruppert solution space
  // G = span{ E_j = (f/f_j)·∂_x f_j } (r = the absolute factor count), a GENERIC g = Σ λ_j E_j ∈ G has,
  // for x on the branch f_j = 0, the CONSTANT ratio g/∂_x f = λ_j. Hence
  //     Res_x(f, g − λ·f_x) = c(y)·∏_j (λ − λ_j)^{deg_x f_j}
  // — its λ-roots are those r constants. Stripping the y-content (Phase-1 bivariatePrimitivePart in λ)
  // leaves the constant polynomial P(λ); its square-free part factors over ℚ(i) (via _qiFactor) into one
  // irreducible p_k(λ) per Galois orbit of the λ_j — i.e. one per ℚ(i)-RATIONAL irreducible factor F_k.
  // Finally F_k = gcd(f, Res_λ(p_k(λ), g − λ·f_x)) = ∏_{λ_j ∈ orbit_k} f_j, because g − λ_j f_x =
  // Σ_{l≠j}(λ_l − λ_j)E_l is divisible by f_j but by no other f_i (the Phase-0 spike's exact identity
  // (D2)). This stays entirely in ℚ(i)[x,y] and reuses resultant / _qiFactor / gcdMV rather than a
  // multiplication-matrix + ℚ(i)(y)-linear-algebra route; conjugate orbits and rational factors are
  // handled uniformly (a rational factor is just an orbit of size 1, p_k linear).
  //
  // HONEST: `factors` are the ℚ(i)-irreducible factors of the PRIMITIVE part (pure-yVar content returned
  // separately in `content`, so f = content·∏factors); `complete` is a CHECKED claim (∏factors = fp up to
  // a ℚ(i) unit, by exact division). `absoluteCount` = r (the over-ℂ count): x²−2y² → one ℚ(i)-irreducible
  // factor (itself) with absoluteCount 2, while x²+y² → two ((x∓iy)). Same preconditions as the count
  // (thrown), including squarefree-in-xVar — the full squarefree-decomposition-with-multiplicity is a
  // later refinement. Returns { ok, factors, complete, absoluteCount, content, reason? }.
  function factorBivariate(f, xVar, yVar) {
    const fp = _bivariatePrecond(f, xVar, yVar, 'factorBivariate');
    const content = bivariateContent(f, xVar); // pure-yVar; f = content · fp
    const { fx, gMonos, ngU, basis } = _ruppertNullspace(fp, xVar, yVar);
    const r = _gaussianMatrixRank(basis.map((v) => v.slice(0, ngU)));
    if (r <= 1) {
      // absolutely irreducible ⇒ ℚ(i)-irreducible: fp is its own only factor.
      return { ok: true, factors: [_canonicalFactor(fp, xVar)], complete: true, absoluteCount: 1, content };
    }
    const gPolys = basis.map((v) => _gPolyFromVec(v, gMonos, xVar, yVar)).filter((p) => !p.isZero());
    // a λ variable that cannot collide with the curve's variables
    let lam = 'λ';
    { const used = new Set([xVar, yVar]); for (const v of fp.vars()) used.add(v); let k = 0; while (used.has(lam)) lam = '_lam' + (k++); }
    const lamVar = MPoly.variable(lam);
    const RCAP = 64; // controlled internal resultant sizes; override the default cap so slightly-larger curves don't throw
    // Find a generic g ∈ G whose r eigenvalues λ_j are DISTINCT (⟺ the square-free P(λ) has degree r).
    // Deterministic trials (no Math.random in the engine): trial t uses geometric coefficients 1, base,
    // base², … with base = t+2 — distinct separating linear functionals on G.
    let gGen = null, Qsf = null;
    for (let t = 0; t < 12 && !Qsf; t++) {
      const base = Gaussian.fromInt(t + 2);
      let g = MPoly.zero(), p = Gaussian.fromInt(1);
      for (let i = 0; i < gPolys.length; i++) { g = g.add(gPolys[i].scale(p)); p = p.mul(base); }
      if (g.isZero()) continue;
      let R;
      try { R = resultant(fp, g.sub(lamVar.mul(fx)), xVar, RCAP); } catch (e) { continue; }
      if (R.isZero()) continue;
      const P = bivariatePrimitivePart(R, lam);
      if (P.vars().size !== 1 || [...P.vars()][0] !== lam) continue; // must be y-free: a constant polynomial in λ
      let sf;
      try { sf = squareFreePart(P, lam); } catch (e) { continue; }
      if (sf.degreeIn(lam) === r) { gGen = g; Qsf = sf; }
    }
    if (!Qsf) {
      return { ok: false, reason: 'factorBivariate: could not find a generic separating element (eigenvalue collision)',
        factors: [_canonicalFactor(fp, xVar)], complete: false, absoluteCount: r, content };
    }
    const pks = _qiFactor(Qsf, lam); // ℚ(i)-irreducible factors of ∏(λ − λ_j), one per rational factor
    const factors = [];
    for (const pk of pks) {
      let S;
      try { S = resultant(pk, gGen.sub(lamVar.mul(fx)), lam, RCAP); } catch (e) { continue; }
      if (S.isZero()) continue;
      const Fk = _canonicalFactor(gcdMV(fp, S), xVar);
      if (Fk.degreeIn(xVar) >= 1 || Fk.degreeIn(yVar) >= 1) factors.push(Fk);
    }
    // Completeness is a checked claim: ∏ factors = fp up to a ℚ(i) unit (exact division leaves a constant).
    let complete = false;
    if (factors.length) {
      let prod = MPoly.fromInt(1);
      for (const Fk of factors) prod = prod.mul(Fk);
      try { complete = mpolyExactDiv(fp, prod).vars().size === 0; } catch (e) { complete = false; }
    }
    return { ok: factors.length > 0, factors, complete, absoluteCount: r, content };
  }

  // ── INDEPENDENT bivariate factorization ORACLE via Zassenhaus–Hensel (roadmap #19 Phase 5;
  // docs/MULTIVARIATE_FACTORING.md §6). This is a deliberately DIFFERENT algorithm from factorBivariate
  // (which uses the Ruppert PDE + a resultant eigenvalue) so a shared algorithm-level bug is unlikely to
  // survive a differential comparison of the two: evaluate y at a good point, factor UNIVARIATELY over
  // ℚ(i), Hensel-LIFT that coprime factorization in the y-adic (y − y₀) direction, then RECOMBINE by exact
  // trial division. It reuses only the low-level primitives (Gaussian arithmetic, `_qiFactor`).
  //
  // SCOPE (an oracle, not the primary factorizer): requires f MONIC in xVar (a non-constant leading
  // xVar-coefficient ⇒ { ok:false } — the classical leading-coefficient distribution is out of scope) and
  // squarefree in xVar. Returns { ok:true, factors:[monic-in-x MPoly] } or { ok:false, reason }. The
  // factors match factorBivariate's set on every supported input (the differential test asserts this).
  function henselFactorBivariate(f, xVar, yVar) {
    if (!(f instanceof MPoly) || f.isZero()) return { ok: false, reason: 'zero or non-MPoly' };
    for (const v of f.vars()) if (v !== xVar && v !== yVar) return { ok: false, reason: 'not bivariate in (' + xVar + ', ' + yVar + ')' };
    let fp = bivariatePrimitivePart(f, xVar);
    const m = fp.degreeIn(xVar);
    if (m < 1) return { ok: false, reason: 'not positive-degree in ' + xVar };
    const lcx = fp.coeffsIn(xVar)[m];
    if (lcx.vars().size !== 0) return { ok: false, reason: 'non-monic in ' + xVar + ' (leading coeff depends on ' + yVar + ')' };
    const lcg = lcx.terms.get('') ? lcx.terms.get('').coeff : Gaussian.fromInt(1);
    fp = fp.scale(Gaussian.fromInt(1).div(lcg));               // monic in xVar
    if (fp.degreeIn(yVar) === 0) {                             // genuinely univariate in xVar
      return { ok: true, factors: _qiFactor(fp, xVar).map((p) => _canonicalFactor(p, xVar)) };
    }
    if (!bivariateSquarefreeInX(fp, xVar)) return { ok: false, reason: 'not squarefree in ' + xVar };
    // Choose y₀ so f(x, y₀) stays degree m and squarefree in x (avoids disc_x / lc_x zeros).
    const cands = [0, 1, -1, 2, -2, 3, -3].map((k) => Gaussian.fromInt(k))
      .concat([new Gaussian(RZERO, Rational.fromInt(1)), new Gaussian(RZERO, Rational.fromInt(-1))]); // ±i
    let y0 = null, F0 = null, Fw = null;
    for (const c of cands) {
      const f0 = fp.subst({ [yVar]: MPoly.constant(c) });
      if (f0.degreeIn(xVar) !== m) continue;
      if (univariateGCD(f0, f0.derivativeIn(xVar), xVar).degreeIn(xVar) !== 0) continue; // not squarefree ⇒ skip
      y0 = c; F0 = f0;
      Fw = fp.subst({ [yVar]: MPoly.variable(yVar).add(MPoly.constant(c)) });            // lift around Y = y − y₀ = 0
      break;
    }
    if (y0 === null) return { ok: false, reason: 'no squarefree evaluation point found' };
    const u = _qiFactor(F0, xVar);                             // monic, distinct ⇒ pairwise coprime
    if (u.length <= 1) return { ok: true, factors: [_canonicalFactor(fp, xVar)] }; // univariate-irreducible ⇒ f irreducible
    const n = Fw.degreeIn(yVar), N = n + 1;                    // true factors have deg_y ≤ n ⇒ lift to precision N
    const uArr = u.map((ui) => _uniToArr(ui, xVar));
    // Bézout: σ_i = (∏_{j≠i} u_j)^{-1} mod u_i, so Σ σ_i ∏_{j≠i} u_j ≡ 1 (the multifactor lift's diophantine solver).
    const sigma = [];
    for (let i = 0; i < u.length; i++) {
      let prod = [Gaussian.fromInt(1)];
      for (let j = 0; j < u.length; j++) if (j !== i) prod = _gaMul(prod, uArr[j]);
      const inv = _gaModInv(prod, uArr[i]);
      if (!inv) return { ok: false, reason: 'specialization not coprime (bad y₀)' };
      sigma.push(inv);
    }
    // Linear Hensel lift: maintain g_i ≡ u_i (mod Y), monic in x, with ∏ g_i ≡ Fw (mod Y^{k+1}).
    const g = u.map((ui) => ui.clone());
    for (let k = 1; k < N; k++) {
      let prod = MPoly.fromInt(1);
      for (const gi of g) prod = _truncInVar(prod.mul(gi), yVar, k + 1);
      const eco = Fw.sub(prod).coeffsIn(yVar);                 // ascending in Y
      const e = (k < eco.length) ? eco[k] : MPoly.zero();      // [Y^k](Fw − ∏ g_i), a univariate-in-x poly
      if (e.isZero()) continue;
      const eArr = _uniToArr(e, xVar);
      for (let i = 0; i < u.length; i++) {
        const delta = _gaDivRem(_gaMul(sigma[i], eArr), uArr[i]).r; // δ_i = σ_i·e mod u_i
        const dP = _uniFromArr(delta, xVar);
        if (!dP.isZero()) g[i] = g[i].add(dP.mul(MPoly.variable(yVar).pow(k)));
      }
    }
    // Recombine: the smallest subset whose truncated product divides the remainder is an irreducible factor.
    const used = new Array(g.length).fill(false), foundShifted = [];
    let remaining = Fw, d = 1;
    while (true) {
      const avail = g.map((_, i) => i).filter((i) => !used[i]);
      if (!avail.length || d > avail.length) break;
      let hit = false;
      for (const S of _subsetsOfSize(avail, d)) {
        let cand = MPoly.fromInt(1);
        for (const i of S) cand = _truncInVar(cand.mul(g[i]), yVar, N);
        let q;
        try { q = mpolyExactDiv(remaining, cand); } catch (e) { continue; }
        foundShifted.push(cand); S.forEach((i) => { used[i] = true; }); remaining = q; hit = true; break;
      }
      if (!hit) d++;
    }
    if (!foundShifted.length) return { ok: true, factors: [_canonicalFactor(fp, xVar)] }; // safety: irreducible
    // Undo the y-shift (Y → y − y₀) and canonicalize monic-in-x.
    const factors = foundShifted.map((Fs) => _canonicalFactor(Fs.subst({ [yVar]: MPoly.variable(yVar).sub(MPoly.constant(y0)) }), xVar));
    return { ok: true, factors };
  }

  // RADICAL of a ZERO-DIMENSIONAL ideal (Seidenberg): √I = I + (squarefree(χ_v) : v ∈ vars),
  // where χ_v is the characteristic polynomial of multiplication-by-v on ℚ(i)[x]/I (Sym.resolvent).
  // Its square-free part has the same v-coordinates with multiplicity 1, so adding them strips all
  // multiplicities. Returns { ok, basis (reduced Gröbner basis of √I), order, reason }. Requires a
  // zero-dimensional input (else resolvent fails → {ok:false}). Reuses resolvent + squareFreePart.
  function radicalZeroDim(input, opts) {
    opts = opts || {};
    const arr = Array.isArray(input) ? input : (input && input.G);
    if (!Array.isArray(arr) || !arr.length) return { ok: false, reason: 'expected a non-empty generator list' };
    const vars = (opts.vars && opts.vars.length) ? opts.vars.slice()
      : [...new Set(arr.flatMap((p) => [...p.vars()]))].sort();
    if (!vars.length) return { ok: false, reason: 'no variables' };
    const order = (input && input.order) || monomialOrder('grevlex', vars);
    let G;
    try { G = (input && input.G) ? input.G : buchberger(arr, order); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    const extra = [];
    for (const v of vars) {
      let r; try { r = resolvent(G.length ? G : arr, v, vars, opts); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
      if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || ('resolvent failed for ' + v) };
      extra.push(squareFreePart(r.poly, v));
    }
    let basis;
    try { basis = buchberger(G.concat(extra), order); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    return { ok: true, basis, order };
  }

  // ===========================================================================
  // G6 — RATIONAL UNIVARIATE REPRESENTATION of a zero-dimensional ideal.
  //
  // Represents the solution set by ONE univariate polynomial f(t) for a separating linear
  // form t = Σ cᵢ·xᵢ, plus each coordinate as a polynomial xᵢ = gᵢ(t) (mod f). Built on the
  // RADICAL (via radicalZeroDim) so the quotient ℚ(i)[x]/√I is a product of D fields at the D
  // distinct points; a separating t makes the powers {1,t,…,t^{D−1}} a basis (Vandermonde), so
  // each xᵢ is the UNIQUE polynomial gᵢ(t) found by an EXACT ℚ(i) linear solve of P·gᵢ = NF(xᵢ),
  // where P's columns are the quotient-vectors of tʲ (= Mₜʲ·⟨1⟩). f(t) is the characteristic
  // polynomial of Mₜ (squarefree ⟺ t separates ⟺ deg = D). All arithmetic exact; the solve is
  // self-checking and tests cross-check gᵢ(rootₖ) against the eigenvalue solver's coordinates.
  //
  // ✓ MATH-REVIEWED (2026-07): the power-basis construction is CORRECT for the radical zero-dim
  // ideals it enforces. Argument: radicalZeroDim makes R/√I ≅ ⊕_{k=1}^{D} ℂ (the D distinct
  // points); a separating t has D DISTINCT values t_k, so the Vandermonde on {1,t,…,t^{D−1}} is
  // invertible ⟹ those powers are a BASIS of R/√I ⟹ each coordinate x_v is the UNIQUE polynomial
  // g_v(t) with P·g_v = NF(x_v) (P = the exact ℚ(i) change-of-basis whose columns are the
  // quotient-vectors of tʲ). squareFreePart(f)=D certifies separation. This is Lagrange
  // interpolation of x_v through the D points; it EQUALS Rouillier's rational form g_v(t)/f'(t)
  // mod f (identical values at the D roots), just carried as a polynomial (no denominator).
  // Coefficient growth is worse than the trace form — an EFFICIENCY, not a correctness, difference.
  // Every result is now EXACTLY self-certified (verified:true): f(t) ≡ 0 and g_v(t) ≡ x_v mod √I
  // are checked by normal-form-is-zero over ℚ(i) (see the opts.verify block below) — no root
  // finder, no floats. It overlaps solveByEigenvalues (which already solves every radical zero-dim
  // ideal); RUR adds the EXACT symbolic coordinate maps gᵢ(t).
  // ---------------------------------------------------------------------------
  function _matZeroG(D) { const M = []; for (let i = 0; i < D; i++) { const r = new Array(D); for (let j = 0; j < D; j++) r[j] = Gaussian.fromInt(0); M.push(r); } return M; }
  function _matAddScaledG(M, A, s) { for (let i = 0; i < M.length; i++) for (let j = 0; j < M.length; j++) M[i][j] = M[i][j].add(s.mul(A[i][j])); }
  function _matVecG(M, v) { const out = []; for (let i = 0; i < M.length; i++) { let acc = Gaussian.fromInt(0); for (let j = 0; j < M.length; j++) acc = acc.add(M[i][j].mul(v[j])); out.push(acc); } return out; }
  // Exact solve A·x = b over ℚ(i) (Gaussian elimination); null if A is singular.
  function _gaussSolveG(A, b, n) {
    const M = A.map((r, i) => r.slice().concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = -1; for (let r = col; r < n; r++) if (!M[r][col].isZero()) { piv = r; break; }
      if (piv < 0) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
      const pv = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] = M[col][c].div(pv);
      for (let r = 0; r < n; r++) { if (r === col) continue; const f = M[r][col]; if (f.isZero()) continue; for (let c = col; c <= n; c++) M[r][c] = M[r][c].sub(f.mul(M[col][c])); }
    }
    return M.map((r) => r[n]);
  }
  // Characteristic polynomial det(t·I − M) of a Gaussian D×D matrix, as an MPoly in `t`.
  function _charPolyG(M, D, t) {
    const tv = MPoly.variable(t), A = [];
    for (let i = 0; i < D; i++) { const row = []; for (let j = 0; j < D; j++) { let e = MPoly.constant(M[i][j].neg()); if (i === j) e = e.add(tv); row.push(e); } A.push(row); }
    return mpolyDet(A);
  }
  // Deterministic separating-form candidates: each single coordinate, then t = Σ jⁱ·xᵢ.
  function _sepCandidates(n, max) {
    const list = [];
    for (let i = 0; i < n; i++) { const v = new Array(n).fill(0); v[i] = 1; list.push(v); }
    for (let j = 1; list.length < max; j++) { const v = []; for (let i = 0; i < n; i++) v.push(BigInt(j) ** BigInt(i)); list.push(v); if (j > max) break; }   // exact integer powers (no float-2^53 loss for large n)
    return list;
  }
  function rationalUnivariateRep(input, opts) {
    opts = opts || {};
    const tName = opts.tName || '_t';
    const arr = Array.isArray(input) ? input : (input && input.G);
    if (!Array.isArray(arr) || !arr.length) return { ok: false, reason: 'expected a non-empty generator list' };
    const vars = (opts.vars && opts.vars.length) ? opts.vars.slice() : [...new Set(arr.flatMap((p) => [...p.vars()]))].sort();
    if (!vars.length) return { ok: false, reason: 'no variables' };
    if (vars.indexOf(tName) >= 0) return { ok: false, reason: 'reserved RUR variable ' + tName + ' clashes with a system variable (pass opts.tName)' };
    const rad = radicalZeroDim(input, { vars });
    if (!rad.ok) return { ok: false, reason: 'radical/zero-dim step failed: ' + rad.reason };
    const G = rad.basis, order = rad.order;
    let B, D, oneIdx; const mats = {};
    try {
      const base = multiplicationMatrix(G, order, vars, vars[0]);
      B = base.B; D = base.D; mats[vars[0]] = base.M;
      oneIdx = B.findIndex((m) => m.size === 0);
      if (oneIdx < 0) return { ok: false, reason: 'standard-monomial basis missing the unit monomial' };
      if (D > (opts.maxDim || 64)) return { ok: false, reason: 'quotient dimension ' + D + ' over the cap (' + (opts.maxDim || 64) + ')' };
      for (let i = 1; i < vars.length; i++) mats[vars[i]] = multiplicationMatrix(G, order, vars, vars[i]).M;
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    const eOne = new Array(D).fill(Gaussian.fromInt(0)); eOne[oneIdx] = Gaussian.fromInt(1);
    for (const cs of _sepCandidates(vars.length, opts.maxTries || 48)) {
      const Mt = _matZeroG(D);
      vars.forEach((v, i) => { if (cs[i]) _matAddScaledG(Mt, mats[v], Gaussian.fromInt(cs[i])); });
      const f = _charPolyG(Mt, D, tName);
      if (squareFreePart(f, tName).degreeIn(tName) !== D) continue;        // not separating (repeated t-values)
      const cols = []; let cur = eOne; for (let j = 0; j < D; j++) { cols.push(cur); cur = _matVecG(Mt, cur); }
      const P = []; for (let i = 0; i < D; i++) { const row = []; for (let j = 0; j < D; j++) row.push(cols[j][i]); P.push(row); }
      const coords = {}; let solved = true;
      for (const v of vars) {
        const g = _gaussSolveG(P, _matVecG(mats[v], eOne), D);
        if (!g) { solved = false; break; }
        coords[v] = _uniFromArr(g, tName);                                  // xᵥ = Σ g[j]·tʲ  (mod f)
      }
      if (!solved) continue;
      // EXACT self-certification (paper-grade): the RUR represents the variety iff f(t) ≡ 0 and
      // every g_v(t) ≡ x_v MODULO √I — i.e. the ℚ(i) normal form of each, after substituting
      // t = Σ cᵢ·xᵢ, is EXACTLY 0. A machine-checked witness that certifies the OUTPUT regardless
      // of construction. Default ON (D ≤ cap keeps it cheap); pass opts.verify=false to skip.
      let verified = false;
      if (opts.verify !== false) {
        const tPoly = vars.reduce((acc, v, i) => acc.add(MPoly.constant(Gaussian.fromInt(cs[i])).mul(MPoly.variable(v))), MPoly.zero());
        let cert = normalForm(f.subst({ [tName]: tPoly }), G, order).isZero();
        for (const v of vars) { if (!cert) break; cert = normalForm(coords[v].subst({ [tName]: tPoly }).sub(MPoly.variable(v)), G, order).isZero(); }
        if (!cert) continue;   // did not certify — reject this candidate (defensive; a correct RUR always certifies)
        verified = true;
      }
      return { ok: true, separating: cs.map(Number), tName, minPoly: f, degree: D, coords, order, radicalBasis: G, verified };   // BigInt cands stay exact in Gaussian.fromInt; separating exposes Numbers
    }
    return { ok: false, reason: 'no separating linear form found in ' + (opts.maxTries || 48) + ' tries' };
  }

  // Rigorous rational-interval enclosure of a REAL-coefficient univariate a[0..d] (Rational[],
  // ascending) over t ∈ [lo,hi], by interval Horner. The returned { lo, hi } provably contains
  // EVERY value of the polynomial on the bracket; when lo == hi (an exact rational root) it
  // collapses to the EXACT value a(lo). The enclosure tightens with the bracket width, so the
  // Sturm refinement (width < tol) makes the coordinate box as sharp as wanted.
  function _intervalPolyEval(a, lo, hi) {
    if (!a.length) return { lo: RZERO, hi: RZERO };
    let AL = a[a.length - 1], AH = a[a.length - 1];         // acc = [a_d, a_d]
    for (let i = a.length - 2; i >= 0; i--) {
      const p = [AL.mul(lo), AL.mul(hi), AH.mul(lo), AH.mul(hi)];   // acc·[lo,hi] — min/max of the 4 endpoint products
      let mn = p[0], mx = p[0];
      for (let k = 1; k < 4; k++) { if (p[k].sub(mn).sign() < 0) mn = p[k]; if (p[k].sub(mx).sign() > 0) mx = p[k]; }
      AL = mn.add(a[i]); AH = mx.add(a[i]);                 // + a_i (a point)
    }
    return { lo: AL, hi: AH };
  }

  // Certified real solving of a zero-dimensional system: the RUR (rationalUnivariateRep — an EXACT,
  // self-certifying univariate representation) + EXACT Sturm real-root isolation of its minimal
  // polynomial + rigorous interval evaluation of the coordinate maps. Returns, for EVERY real
  // solution, a rational isolating BOX per coordinate — no floating-point eigenvalue step, so it
  // never drops a clustered / coincident-projection real root that the numeric eigenvalue solver
  // would silently merge. Intended for a REAL-coefficient (reim) system: then minPoly(t) is real, its
  // real roots ARE the real solutions, and every coordinate box has im = [0,0]. A genuinely complex
  // system whose minPoly carries imaginary coefficients is rejected honestly by the isolation step.
  //
  // Result: { ok, certified:true, count, degree, verified, tName, solutions } where each solution is
  // { [v]: { re:{lo,hi}, im:{lo,hi}, exact, mid:{re,im} } } — Rational box endpoints are the
  // CERTIFICATE (the true coordinate lies in re + i·im); `mid` is the numeric box midpoint for
  // convenience; `exact` marks a point box (an exact rational root). Honestly labeled ≤ (a rigorous
  // bound), = only where a box is a point.
  function solveRealCertified(input, opts) {
    opts = opts || {};
    const rur = rationalUnivariateRep(input, opts);
    if (!rur.ok) return { ok: false, reason: 'RUR step failed: ' + rur.reason };
    const tName = rur.tName;
    const iso = realRootIsolate(rur.minPoly, tName, { tol: opts.tol != null ? opts.tol : 1e-12 });
    if (!iso.ok) return { ok: false, reason: 'real-root isolation failed: ' + iso.reason };
    const vars = Object.keys(rur.coords).sort();
    const reC = {}, imC = {};                               // split each g_v(t) into real + imag Rational coeff arrays once
    for (const v of vars) { const arr = _uniToArr(rur.coords[v], tName); reC[v] = arr.map((g) => g.re); imC[v] = arr.map((g) => g.im); }
    const solutions = iso.roots.map((rt) => {
      const sol = {};
      for (const v of vars) {
        const re = _intervalPolyEval(reC[v], rt.lo, rt.hi), im = _intervalPolyEval(imC[v], rt.lo, rt.hi);
        sol[v] = { re, im, exact: !!rt.exact, mid: { re: (re.lo.toNumber() + re.hi.toNumber()) / 2, im: (im.lo.toNumber() + im.hi.toNumber()) / 2 } };
      }
      return sol;
    });
    return { ok: true, certified: true, count: iso.count, degree: rur.degree, verified: rur.verified, tName, solutions };
  }

  // Serialize a solveRealCertified result to a JSON-safe shape (for postMessage / storage): each
  // coordinate becomes { re, im, exact, reLo, reHi, imLo, imHi } where re/im are the numeric box
  // MIDPOINTS (so it drops in wherever a {var:{re,im}} solution is consumed) and reLo…imHi are the
  // numeric rational-box endpoints (the rigorous ≤ envelope). allExact ⇒ every coordinate is a point.
  function certifiedRealToJSON(res) {
    if (!res || !res.ok) return res;
    const solutions = res.solutions.map((s) => {
      const o = {};
      for (const v of Object.keys(s)) {
        const c = s[v];
        o[v] = { re: c.mid.re, im: c.mid.im, exact: !!c.exact, reLo: c.re.lo.toNumber(), reHi: c.re.hi.toNumber(), imLo: c.im.lo.toNumber(), imHi: c.im.hi.toNumber() };
      }
      return o;
    });
    return { ok: true, certified: true, count: res.count, degree: res.degree, verified: res.verified,
      allExact: solutions.every((s) => Object.keys(s).every((v) => s[v].exact)), solutions };
  }

  // ===========================================================================
  // EXACT univariate factorization over ℚ(i) — the shifted norm trick (Trager's
  // algorithm specialized to k = ℚ(i)), built on Berlekamp–Zassenhaus over ℚ.
  //
  // To factor f ∈ ℚ(i)[x]: for a rational shift s, form b(x) = f(x − s·i); its
  // NORM N(b) = b·b̄ (conjugate the coefficients, i→−i) lies in ℚ[x] and is
  // SQUARE-FREE exactly when gcd(b, b̄) = 1. Factor N(b) over ℚ; each ℚ(i)-
  // irreducible factor of f is then recovered as gcd(f, Rⱼ(x + s·i)) for a
  // rational irreducible factor Rⱼ of N(b). The plain "N(f) = f·f̄" prescription
  // is the s = 0 case; a nonzero shift is needed precisely when f shares a factor
  // with its conjugate (e.g. f = x²+1 = (x−i)(x+i): N(f) = (x²+1)² is NOT square-
  // free, so s bumps to 2, where N = (x²+1)(x²+9) splits and the gcds give x±i).
  // When N(b) is square-free the recovery is provably complete (Trager): the gcds
  // are exactly the distinct irreducible factors of f. Every factor is still
  // exact-division verified by the caller, so the result is certified regardless.
  //
  // The norm reduces ℚ(i)-factoring to factoring over ℚ — Berlekamp–Zassenhaus:
  // square-free → Cantor–Zassenhaus mod a good prime p → Hensel lift past the
  // Mignotte bound → naïve subset recombination (fine for the moderate degrees in
  // QD systems). Refs: Hart–van Hoeij ISSAC'10; K. Conrad's ℤ[i] notes (norm
  // property); FLINT fmpz_poly_factor as the correctness oracle.
  // ---------------------------------------------------------------------------
  // ---- BigInt scalar helpers (_blcm is shared with the Gröbner content-reduction below) ----
  function _bpow(a, e) { let r = 1n; for (let i = 0n; i < e; i++) r *= a; return r; }
  function _isqrt(n) {
    if (n < 0n) throw new Error('isqrt: negative'); if (n < 2n) return n;
    let x = n, y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return x;
  }
  function _modInv(a, p) {                                     // a⁻¹ mod p (p prime), via extended Euclid
    let t = 0n, nt = 1n, r = p, nr = ((a % p) + p) % p;
    while (nr !== 0n) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; }
    if (r > 1n) throw new Error('modInv: not invertible'); return ((t % p) + p) % p;
  }
  // ---- integer polynomials (ascending BigInt arrays, trailing zeros trimmed) ----
  function _ipTrim(a) { const b = a.slice(); while (b.length && b[b.length - 1] === 0n) b.pop(); return b; }
  function _ipDeg(a) { let d = a.length - 1; while (d >= 0 && a[d] === 0n) d--; return d; }
  // Exact quotient of A by a MONIC integer divisor D (D | A over ℤ), else null.
  function _ipDivExactMonic(A, D) {
    const r = A.slice(); const d = _ipDeg(D);
    if (d < 0) return null;
    const q = []; for (let k = 0; k <= Math.max(_ipDeg(r) - d, -1); k++) q.push(0n);
    for (let i = _ipDeg(r); i >= d; i--) {
      const c = r[i]; if (c === 0n) continue;
      q[i - d] = c;                                            // D monic ⇒ quotient coeff = c
      for (let j = 0; j <= d; j++) r[i - d + j] -= c * D[j];
    }
    for (let i = 0; i < d; i++) if ((r[i] || 0n) !== 0n) return null;
    return _ipTrim(q);
  }
  // ---- modular polynomials over ℤ/M (M a prime p in 𝔽_p ops, or p^k in Hensel) ----
  function _pmRedux(a, M) { return _ipTrim(a.map((c) => ((c % M) + M) % M)); }
  function _pmAdd(a, b, M) { const n = Math.max(a.length, b.length), o = []; for (let i = 0; i < n; i++) o.push((((a[i] || 0n) + (b[i] || 0n)) % M + M) % M); return _ipTrim(o); }
  function _pmSub(a, b, M) { const n = Math.max(a.length, b.length), o = []; for (let i = 0; i < n; i++) o.push((((a[i] || 0n) - (b[i] || 0n)) % M + M) % M); return _ipTrim(o); }
  function _pmScale(a, c, M) { const cc = ((c % M) + M) % M; return _ipTrim(a.map((x) => (x * cc) % M)); }
  function _pmMul(a, b, M) {
    if (!a.length || !b.length) return [];
    const o = new Array(a.length + b.length - 1).fill(0n);
    for (let i = 0; i < a.length; i++) { if (a[i] === 0n) continue; for (let j = 0; j < b.length; j++) o[i + j] = (o[i + j] + a[i] * b[j]) % M; }
    return _pmRedux(o, M);
  }
  // Division mod a PRIME p (field): a = q·b + r, deg r < deg b. b may be non-monic.
  function _pmDivModF(a, b, p) {
    const r = _pmRedux(a, p); const bb = _pmRedux(b, p); const db = _ipDeg(bb);
    if (db < 0) throw new Error('pmDivModF: division by zero');
    const inv = _modInv(bb[db], p); const q = [];
    let dr = _ipDeg(r); for (let k = 0; k <= Math.max(dr - db, -1); k++) q.push(0n);
    while (dr >= db) {
      const coef = (r[dr] * inv) % p; q[dr - db] = coef;
      for (let j = 0; j <= db; j++) r[dr - db + j] = ((r[dr - db + j] - coef * bb[j]) % p + p) % p;
      r.length = dr;                                           // drop the now-zero leading slot
      dr = _ipDeg(r);
    }
    return { q: _ipTrim(q), r: _ipTrim(r) };
  }
  function _pmRemF(a, b, p) { return _pmDivModF(a, b, p).r; }
  function _pmGcdF(a, b, p) {                                  // monic gcd over 𝔽_p
    let x = _pmRedux(a, p), y = _pmRedux(b, p);
    while (_ipDeg(y) >= 0) { const r = _pmRemF(x, y, p); x = y; y = r; }
    if (_ipDeg(x) < 0) return [];
    return _pmScale(x, _modInv(x[_ipDeg(x)], p), p);           // make monic
  }
  function _pmDeriv(a, M) { const o = []; for (let k = 1; k < a.length; k++) o.push((a[k] * BigInt(k)) % M); return _pmRedux(o, M); }
  // Division by a MONIC divisor mod any modulus M (no inverse needed): used in Hensel.
  function _pmDivModMonic(a, b, M) {
    const r = _pmRedux(a, M); const bb = _pmRedux(b, M); const db = _ipDeg(bb);
    const q = []; let dr = _ipDeg(r); for (let k = 0; k <= Math.max(dr - db, -1); k++) q.push(0n);
    while (dr >= db && dr >= 0) {
      const coef = r[dr]; q[dr - db] = coef;
      for (let j = 0; j <= db; j++) r[dr - db + j] = ((r[dr - db + j] - coef * bb[j]) % M + M) % M;
      r.length = dr; dr = _ipDeg(r);
    }
    return { q: _ipTrim(q), r: _ipTrim(r) };
  }
  function _pmPowMod(base, e, mod, p) {                        // base^e mod `mod` over 𝔽_p (mod monic)
    let result = [1n], b = _pmRemF(base, mod, p), ee = e;
    while (ee > 0n) { if (ee & 1n) result = _pmRemF(_pmMul(result, b, p), mod, p); ee >>= 1n; if (ee > 0n) b = _pmRemF(_pmMul(b, b, p), mod, p); }
    return result;
  }
  function _prodMod(list, M) { let r = [1n]; for (const g of list) r = _pmMul(r, g, M); return r; }
  // Symmetric (balanced) residues in (−M/2, M/2] — recovers the true small integers.
  function _balanced(a, M) { const h = M / 2n; return _ipTrim(a.map((c) => { let r = ((c % M) + M) % M; if (r > h) r -= M; return r; })); }
  // ---- Cantor–Zassenhaus over 𝔽_p (input: monic square-free mod p) ----
  // Deterministic LCG so equal-degree splitting is reproducible across runs (the
  // commit history's "fresh seed" rule: derive the seed from the input so distinct
  // polynomials get distinct streams while a given input is always reproducible).
  function _mkRng(seed) {
    const MASK = (1n << 64n) - 1n; let s = ((seed % MASK) + MASK) % MASK; if (s === 0n) s = 0x2545f4914f6cdd1dn;
    return function (mod) { s = (s * 6364136223846793005n + 1442695040888963407n) & MASK; return (s >> 11n) % mod; };
  }
  function _randPoly(n, p, rng) { const a = []; for (let k = 0; k < n; k++) a.push(rng(p)); return _ipTrim(a); }
  function _ddf(f, p) {                                        // distinct-degree: [{f, d}], each f a product of deg-d irreducibles
    const res = []; let fstar = _pmRedux(f, p); let h = [0n, 1n]; const X = [0n, 1n]; let i = 0;
    while (_ipDeg(fstar) > 0) {
      i++; h = _pmPowMod(h, p, f, p);                          // h = x^(pⁱ) mod f
      const g = _pmGcdF(_pmSub(h, X, p), fstar, p);
      if (_ipDeg(g) > 0) { res.push({ f: g, d: i }); fstar = _pmDivModF(fstar, g, p).q; }
      if (_ipDeg(fstar) > 0 && _ipDeg(fstar) < 2 * (i + 1)) { res.push({ f: _pmScale(fstar, _modInv(fstar[_ipDeg(fstar)], p), p), d: _ipDeg(fstar) }); break; }
    }
    return res;
  }
  function _edf(f, d, p, rng) {                                // equal-degree: split f (∏ of deg-d irreducibles) into them
    const out = []; const stack = [_pmScale(f, _modInv(f[_ipDeg(f)], p), p)];
    const e = (_bpow(p, BigInt(d)) - 1n) / 2n;
    while (stack.length) {
      const g = stack.pop();
      if (_ipDeg(g) === d) { out.push(g); continue; }
      let split = null;
      for (let tries = 0; tries < 100000 && !split; tries++) {
        const a = _randPoly(_ipDeg(g), p, rng);
        if (_ipDeg(a) <= 0) continue;
        let gg = _pmGcdF(a, g, p);
        if (_ipDeg(gg) > 0 && _ipDeg(gg) < _ipDeg(g)) { split = gg; break; }
        const b = _pmSub(_pmPowMod(a, e, g, p), [1n], p);      // a^((pᵈ−1)/2) − 1 mod g
        gg = _pmGcdF(b, g, p);
        if (_ipDeg(gg) > 0 && _ipDeg(gg) < _ipDeg(g)) split = gg;
      }
      if (!split) throw new Error('factorOverQ: Cantor–Zassenhaus failed to split (bad prime?)');
      split = _pmScale(split, _modInv(split[_ipDeg(split)], p), p);
      stack.push(split, _pmDivModF(g, split, p).q);
    }
    return out;
  }
  function _czFactor(f, p, rng) { const out = []; for (const part of _ddf(f, p)) for (const g of _edf(part.f, part.d, p, rng)) out.push(g); return out; }
  // ---- Hensel lifting (linear step, binary tree over the mod-p factors) ----
  function _bezout(g, h, p) {                                  // s·g + t·h ≡ 1 (mod p), deg s < deg h
    let r0 = _pmRedux(g, p), r1 = _pmRedux(h, p), s0 = [1n], s1 = [], t0 = [], t1 = [1n];
    while (_ipDeg(r1) >= 0) {
      const { q } = _pmDivModF(r0, r1, p); const r2 = _pmSub(r0, _pmMul(q, r1, p), p);
      const s2 = _pmSub(s0, _pmMul(q, s1, p), p), t2 = _pmSub(t0, _pmMul(q, t1, p), p);
      r0 = r1; r1 = r2; s0 = s1; s1 = s2; t0 = t1; t1 = t2;
    }
    const inv = _modInv(r0[_ipDeg(r0)], p); let s = _pmScale(s0, inv, p), t = _pmScale(t0, inv, p);
    const { q, r } = _pmDivModF(s, h, p); s = r; t = _pmAdd(t, _pmMul(q, g, p), p);   // reduce deg s < deg h
    return { s, t };
  }
  function _henselLinear(f, g, h, s, t, p, pa) {               // lift f ≡ gh from mod pa to mod pa·p (g,h monic)
    const P = BigInt(p), pap = pa * P;
    const diff = _pmSub(_pmRedux(f, pap), _pmMul(g, h, pap), pap);   // ≡ 0 (mod pa)
    const delta = _pmRedux(diff.map((c) => (c / pa)), P);     // (f − gh)/pa  reduced mod p
    const { q, r } = _pmDivModMonic(_pmMul(t, delta, P), g, P);      // t·δ = q·g + r, deg r < deg g
    const dg = r, dh = _pmAdd(_pmMul(s, delta, P), _pmMul(q, h, P), P);
    return { g: _pmRedux(_pmAdd(g, _pmScale(dg, pa, pap), pap), pap), h: _pmRedux(_pmAdd(h, _pmScale(dh, pa, pap), pap), pap) };
  }
  function _henselTree(f, facts, p, K) {                       // lift the mod-p factorization of monic f to mod p^K
    const M = _bpow(BigInt(p), BigInt(K));
    if (facts.length === 1) return [_pmRedux(f, M)];
    const mid = facts.length >> 1, left = facts.slice(0, mid), right = facts.slice(mid);
    let g = _prodMod(left, BigInt(p)), h = _prodMod(right, BigInt(p));
    const { s, t } = _bezout(g, h, BigInt(p)); let pa = BigInt(p);
    for (let a = 1; a < K; a++) { const st = _henselLinear(f, g, h, s, t, p, pa); g = st.g; h = st.h; pa *= BigInt(p); }
    g = _pmRedux(g, M); h = _pmRedux(h, M);
    return _henselTree(g, left, p, K).concat(_henselTree(h, right, p, K));
  }
  // ---- subset recombination of the lifted factors into true ℤ irreducibles ----
  function _combinations(n, k) {                               // index k-subsets of [0,n)
    const out = []; const idx = []; (function rec(start) {
      if (idx.length === k) { out.push(idx.slice()); return; }
      for (let i = start; i < n; i++) { idx.push(i); rec(i + 1); idx.pop(); }
    })(0); return out;
  }
  function _recombine(B, lifted, M) {                          // B monic over ℤ; lifted: monic factors mod M
    const factors = []; let remaining = lifted.slice(); let Bcur = _ipTrim(B.slice()); let size = 1;
    while (remaining.length > 0 && size <= remaining.length) {
      let found = false;
      for (const idx of _combinations(remaining.length, size)) {
        let prod = [1n]; for (const j of idx) prod = _pmMul(prod, remaining[j], M);
        const cand = _balanced(prod, M);                      // monic integer candidate
        const quo = _ipDivExactMonic(Bcur, cand);
        if (quo) { factors.push(cand); Bcur = quo; const drop = new Set(idx); remaining = remaining.filter((_, j) => !drop.has(j)); found = true; break; }
      }
      if (found) { size = 1; continue; }
      size++;
    }
    if (_ipDeg(Bcur) > 0) factors.push(Bcur);                  // leftover is the final irreducible factor
    return factors;
  }
  // ---- MPoly(univariate, rational coeffs) ↔ primitive integer poly ----
  function _mpolyToIntPrimitive(p, v) {
    const g = _uniToArr(p, v); const nums = [], dens = [];
    for (const c of g) { if (!c.im.isZero()) throw new Error('factorOverQ: non-rational coefficient'); nums.push(c.re.n); dens.push(c.re.d); }
    let L = 1n; for (const d of dens) L = _blcm(L, d) || 1n;
    let arr = nums.map((n, k) => n * (L / dens[k]));
    let cont = 0n; for (const a of arr) cont = bgcd(cont, a);
    if (cont === 0n) return [];
    arr = arr.map((a) => a / cont);
    if (arr[_ipDeg(arr)] < 0n) arr = arr.map((a) => -a);      // leading coefficient positive
    return _ipTrim(arr);
  }
  function _ipToMonicMPoly(arr, v) {                          // integer factor → monic MPoly over ℚ(i)
    const a = _ipTrim(arr.slice()); const d = _ipDeg(a); const lc = a[d];
    let out = MPoly.zero();
    for (let k = 0; k <= d; k++) {
      if (a[k] === 0n) continue;
      const term = new MPoly(); term._addTerm(new Map(k > 0 ? [[v, k]] : []), gauss(new Rational(a[k], lc), RZERO));
      out = out.add(term);
    }
    return out;
  }
  function _nextPrime(n) {
    let c = n + 1n; if (c < 3n) return 3n; if (c % 2n === 0n) c++;
    for (; ; c += 2n) { let prime = true; for (let d = 3n; d * d <= c; d += 2n) if (c % d === 0n) { prime = false; break; } if (prime) return c; }
  }
  // Factor a RATIONAL (real-coefficient) univariate MPoly into DISTINCT monic
  // irreducible rational factors via Berlekamp–Zassenhaus. Square-free input is
  // taken (radical) defensively, so every returned factor is distinct.
  function _factorOverQ(poly, v) {
    let R = poly;
    try { R = squareFreePart(poly, v); } catch (e) { R = poly; }
    const A = _mpolyToIntPrimitive(R, v); const n = _ipDeg(A);
    if (n <= 0) return [];
    if (n === 1) return [_ipToMonicMPoly(A, v)];
    const lc = A[n];
    // Monic transform B(y) = lc^{n−1}·A(y/lc): bₖ = aₖ·lc^{n−1−k} (k<n), bₙ = 1.
    const B = []; for (let k = 0; k < n; k++) B.push(A[k] * _bpow(lc, BigInt(n - 1 - k))); B.push(1n);
    // Choose a prime p with B mod p square-free (B monic ⇒ p ∤ lc automatically).
    let p = 2n, rng = null, modp = null;
    for (let tries = 0; tries < 200; tries++) {
      p = _nextPrime(p < 3n ? 2n : p);
      const Bp = _pmRedux(B, p);
      if (_ipDeg(Bp) !== n) continue;
      if (_ipDeg(_pmGcdF(Bp, _pmDeriv(Bp, p), p)) !== 0) continue;   // not square-free mod p
      modp = _pmScale(Bp, _modInv(Bp[n], p), p);             // monic mod p
      break;
    }
    if (!modp) throw new Error('factorOverQ: no usable prime found');
    rng = _mkRng(B.reduce((acc, c) => acc + babs(c), 0n) + p + BigInt(n));
    const cz = _czFactor(modp, p, rng);
    if (cz.length <= 1) return [_ipToMonicMPoly(A, v)];        // B irreducible ⇒ A irreducible
    // Hensel lift past the Mignotte coefficient bound 2ⁿ·‖B‖₂, then recombine.
    let norm2 = 0n; for (const c of B) norm2 += c * c;
    const bound = (1n << BigInt(n)) * (_isqrt(norm2) + 1n);
    const need = 2n * bound + 1n;
    let K = 1, pk = p; while (pk < need) { pk *= p; K++; }
    const lifted = _henselTree(B, cz, Number(p), K);
    const facsB = _recombine(B, lifted, _bpow(p, BigInt(K)));
    // Map each monic factor Bⱼ(y) of B back to a factor of A: primpart(Bⱼ(lc·x)).
    return facsB.map((Bj) => _ipToMonicMPoly(Bj.map((c, k) => c * _bpow(lc, BigInt(k))), v));
  }
  // Full ℚ(i) univariate factorization (RADICAL): returns the DISTINCT monic
  // irreducible factors of f over ℚ(i). Uses the shifted norm trick above. The
  // factors divide squareFreePart(f) (hence f), and V(square-free) = V(f), so the
  // case split V(f) = ⋃ V(fᵢ) is exact. Returns [monic f] when f is irreducible.
  function _qiFactor(f, v) {
    if (f.vars().size !== 1 || [...f.vars()][0] !== v) return [f];
    let work = f;
    try { work = squareFreePart(f, v); } catch (e) { work = f; }
    const lcW = _factorLeadCoeff(work);
    if (!lcW.isZero()) work = work.scale(Gaussian.fromInt(1).div(lcW));   // monic over ℚ(i)
    const deg = work.degreeIn(v);
    if (deg <= 1) return [work];
    const SMAX = 2 * deg + 8;
    for (let s = 0; s <= SMAX; s++) {
      // b(x) = work(x − s·i); s = 0 leaves work unchanged.
      const b = (s === 0) ? work
        : work.subst({ [v]: MPoly.variable(v).sub(MPoly.constant(gauss(RZERO, new Rational(BigInt(s), 1n)))) });
      const bbar = b.conjCoeffs();
      if (univariateGCD(b, bbar, v).degreeIn(v) > 0) continue;            // N(b) not square-free ⇒ bump s
      const N = b.mul(bbar);                                              // norm ∈ ℚ[x] (im parts vanish)
      let ratFactors;
      try { ratFactors = _factorOverQ(N, v); } catch (e) { continue; }
      if (!ratFactors.length) continue;
      const factors = [];
      for (const q of ratFactors) {
        // Undo the shift on the rational factor: Rⱼ(x + s·i), then gcd with f.
        const qShift = (s === 0) ? q
          : q.subst({ [v]: MPoly.variable(v).add(MPoly.constant(gauss(RZERO, new Rational(BigInt(s), 1n)))) });
        const h = univariateGCD(work, qShift, v);
        if (h.degreeIn(v) >= 1) _factorPush(factors, h);
      }
      // Completeness: distinct irreducible factors of a square-free poly partition
      // its degree. If they don't (a bad shift), bump s; otherwise accept.
      let degSum = 0; for (const h of factors) degSum += h.degreeIn(v);
      if (factors.length && degSum === deg) return factors;
    }
    return [work];                                                        // irreducible (or no clean shift found)
  }
  // Recursive driver that accumulates the distinct (radical) factors of `p` into `out`
  // (a dedup'd list, via _factorPush), applying the methods in order of cost:
  //   (1) peel monomial factors (a variable dividing every term → the case v=0),
  //   (2) split a variable-separable product and recurse on each factor,
  //   (3) factor a truly-univariate remainder fully over ℚ(i) (the norm trick),
  //   (4) factor a genuine BIVARIATE remainder over ℚ(i) (Gao's method, roadmap #19).
  // A remainder none of these split is pushed whole (irreducible). Every step
  // strictly shrinks `cur` (or, in (4), only splices STRICTLY smaller factors and
  // recurses on the pure-content), so the recursion terminates; constants are dropped.
  function _factorRec(p, out) {
    if (p.vars().size === 0) return;
    let cur = p;
    for (const v of [...cur.vars()]) {                         // (1) monomial factors
      const k = _minExp(cur, v);
      if (k > 0) { _factorPush(out, MPoly.variable(v)); cur = mpolyExactDiv(cur, MPoly.variable(v).pow(k)); }
    }
    if (cur.vars().size === 0) return;
    const facs = _separableSplit(cur);                         // (2) separable (variable-disjoint) product
    if (facs) { facs.forEach((f) => _factorRec(f, out)); return; }
    if (cur.vars().size === 1) {                               // (3) univariate over ℚ(i)
      const v = [...cur.vars()][0];
      if (cur.degreeIn(v) >= 2) { _qiFactor(cur, v).forEach((f) => _factorPush(out, f)); return; }
    }
    if (cur.vars().size === 2 && cur.terms.size <= 300) {      // (4) genuine bivariate over ℚ(i) — Gao (roadmap #19)
      const vs = [...cur.vars()];
      // Gao needs a squarefree main variable; try either ordering. Degree caps keep the Ruppert
      // nullspace bounded — a curve past them falls through and is pushed whole (honest: not certified).
      let xv = null, yv = null;
      if (bivariateSquarefreeInX(cur, vs[0])) { xv = vs[0]; yv = vs[1]; }
      else if (bivariateSquarefreeInX(cur, vs[1])) { xv = vs[1]; yv = vs[0]; }
      if (xv && cur.degreeIn(xv) >= 1 && cur.degreeIn(yv) >= 1 && cur.degreeIn(xv) <= 12 && cur.degreeIn(yv) <= 12) {
        let res = null;
        try { res = factorBivariate(cur, xv, yv); } catch (e) { res = null; }
        // Only act on a VERIFIED-complete split (≥2 factors, or a non-unit pure-yVar content to peel);
        // an irreducible curve (r = 1, unit content) falls through to the whole-push below.
        if (res && res.ok && res.complete && (res.factors.length >= 2 || res.content.vars().size > 0)) {
          res.factors.forEach((Fk) => _factorPush(out, Fk));  // ℚ(i)-irreducible factors (already irreducible — do not recurse)
          if (res.content.vars().size > 0) _factorRec(res.content, out); // pure-yVar content: univariate, terminates
          return;
        }
      }
    }
    _factorPush(out, cur);                                     // irreducible by our methods
  }
  function factor(poly, opts) {
    opts = opts || {};   // accepted for back-compat (rootFinder/ratApprox); the univariate path is now exact
    if (!poly || poly.isZero()) return { ok: false, reason: 'cannot factor the zero polynomial', factors: [] };
    if (poly.vars().size === 0) return { ok: false, reason: 'a constant has no nontrivial factorization', factors: [poly] };
    const out = [];
    try { _factorRec(poly, out); }
    catch (e) { return { ok: false, reason: (e && e.message) || String(e), factors: [poly] }; }
    if (out.length <= 1) return { ok: false, reason: 'no nontrivial factorization found', factors: [poly] };
    // Defensive: make the contract literal — every returned factor must divide `poly`
    // exactly. The separable leaves are only transitively verified inside _factorRec, so
    // confirm each here; a (theoretically impossible) bad divisor downgrades to ok:false.
    for (const f of out) {
      try { mpolyExactDiv(poly, f); }
      catch (e) { return { ok: false, reason: 'internal: a candidate factor did not divide the input', factors: [poly] }; }
    }
    return { ok: true, factors: out, reason: '' };
  }

  // ---------------------------------------------------------------------------
  // Gröbner-basis layer — Buchberger over the field ℚ(i) (Gaussian-rational
  // coefficients). This is the multivariate generalization of the resultant: a
  // Gröbner basis of an ideal under an ELIMINATION order (lex with the variables
  // to drop ranked highest) exposes the elimination ideal — the consequences that
  // survive in the remaining variables — which is exactly what the QD elimination
  // needs when more than two equations / more than one variable are in play.
  //
  // Everything is exact. The cost can blow up super-exponentially, so the same
  // discipline as the resultant applies: hard caps that throw a clear "use CAS
  // export" error instead of hanging (see GROEBNER_* below; overridable per call).
  // ---------------------------------------------------------------------------

  // Resolve an `order` argument to a monomial-comparison function. Accepts an
  // order object (with `.cmp`) from monomialOrder(), a bare cmp function, or
  // null/undefined → the default graded-lex (monoCmp).
  // Resolve a monomial-order spec to a cmp function. ⚠ An omitted/falsy order falls back to
  // monoCmp (GRLEX), but buchberger() defaults to GREVLEX — so calling BOTH without an explicit
  // order (`G = buchberger(gens); normalForm(f, G)`) reduces against a basis that is NOT a
  // Gröbner basis under the reduction's order, giving a wrong normal form. Pass the SAME explicit
  // order to both. (Every in-module call site already threads a matching order; this only bites
  // external Sym.normalForm / leadingTerm / sPoly callers who omit it.)
  function _orderCmp(order) {
    if (!order) return monoCmp;
    if (typeof order === 'function') return order;
    if (typeof order.cmp === 'function') return order.cmp;
    return monoCmp;
  }

  // Build a monomial order. kind ∈ {'lex','grlex','grevlex','block'} (default
  // grevlex — the fastest general order for Buchberger). For the three classic
  // kinds, `varOrder` ranks variables from HIGHEST priority to lowest; variables
  // absent from the list rank below all listed ones, alphabetically among
  // themselves (so the order is total even on monomials in newly-introduced
  // variables). For ELIMINATION, prefer the 'block' kind (or eliminationOrder())
  // over pure 'lex' — a product/block order is far cheaper for Buchberger while
  // exposing the same elimination ideal. With kind 'block', `varOrder` is an ARRAY
  // OF BLOCKS (each a variable-name array); blocks are compared grevlex, in order,
  // and any unlisted variables form a trailing alphabetical block. Returns
  // { kind, varOrder, cmp }, where cmp(a,b) returns -1 / 0 / 1 (a<b / a=b / a>b).
  function monomialOrder(kind, varOrder) {
    kind = kind || 'grevlex';
    if (kind === 'block') return { kind, varOrder, cmp: _blockGrevlexCmp(varOrder || []) };
    const rank = new Map();
    if (varOrder) varOrder.forEach((v, i) => rank.set(v, i));
    function varCmp(x, y) {
      const rx = rank.has(x) ? rank.get(x) : Infinity;
      const ry = rank.has(y) ? rank.get(y) : Infinity;
      if (rx !== ry) return rx < ry ? -1 : 1;          // smaller index = higher priority
      return x < y ? -1 : (x > y ? 1 : 0);             // alphabetical fallback
    }
    function names(a, b) {
      const s = new Set();
      for (const k of a.keys()) s.add(k);
      for (const k of b.keys()) s.add(k);
      return [...s].sort(varCmp);                       // highest priority first
    }
    let cmp;
    if (kind === 'lex') {
      cmp = function (a, b) {
        for (const nm of names(a, b)) {
          const ea = a.get(nm) || 0, eb = b.get(nm) || 0;
          if (ea !== eb) return ea < eb ? -1 : 1;
        }
        return 0;
      };
    } else if (kind === 'grlex') {
      cmp = function (a, b) {
        const da = monoTotalDeg(a), db = monoTotalDeg(b);
        if (da !== db) return da < db ? -1 : 1;
        for (const nm of names(a, b)) {
          const ea = a.get(nm) || 0, eb = b.get(nm) || 0;
          if (ea !== eb) return ea < eb ? -1 : 1;
        }
        return 0;
      };
    } else {                                            // grevlex
      cmp = function (a, b) {
        const da = monoTotalDeg(a), db = monoTotalDeg(b);
        if (da !== db) return da < db ? -1 : 1;
        const ns = names(a, b);
        for (let k = ns.length - 1; k >= 0; k--) {      // lowest priority var first
          const nm = ns[k];
          const ea = a.get(nm) || 0, eb = b.get(nm) || 0;
          if (ea !== eb) return ea < eb ? 1 : -1;       // smaller last-var exp ⇒ larger
        }
        return 0;
      };
    }
    return { kind, varOrder: varOrder ? varOrder.slice() : null, cmp };
  }

  // Product (block) order: compare grevlex within block 1; on a tie, grevlex within
  // block 2; etc. Unlisted variables form a trailing alphabetical block, keeping the
  // order total. Because a monomial with ANY positive exponent in an earlier block
  // outranks one without, putting the variables to eliminate in block 1 makes this an
  // ELIMINATION order: the elimination ideal is the set of basis generators whose
  // leading monomial (indeed whole support) avoids the block-1 variables.
  function _blockGrevlexCmp(blocks) {
    const listed = new Set();
    blocks.forEach((b) => b.forEach((v) => listed.add(v)));
    function grevlexOnBlock(blk, a, b) {
      let da = 0, db = 0;
      for (const v of blk) { da += a.get(v) || 0; db += b.get(v) || 0; }
      if (da !== db) return da < db ? -1 : 1;
      for (let k = blk.length - 1; k >= 0; k--) {        // reverse-lex within the block
        const v = blk[k], ea = a.get(v) || 0, eb = b.get(v) || 0;
        if (ea !== eb) return ea < eb ? 1 : -1;          // smaller last-var exp ⇒ larger
      }
      return 0;
    }
    return function (a, b) {
      for (const blk of blocks) { const c = grevlexOnBlock(blk, a, b); if (c) return c; }
      // trailing block of any variables not named in `blocks` (alphabetical)
      const extra = new Set();
      for (const k of a.keys()) if (!listed.has(k)) extra.add(k);
      for (const k of b.keys()) if (!listed.has(k)) extra.add(k);
      if (extra.size) return grevlexOnBlock([...extra].sort(), a, b);
      return 0;
    };
  }
  // Convenience: an elimination order that ranks `elimVars` (block 1) above
  // `keepVars` (block 2), both compared grevlex. The Gröbner basis under this order
  // exposes ⟨…⟩ ∩ k[keepVars] as the generators free of every elimVar — much cheaper
  // than pure lex. (keepVars may be omitted; unlisted vars trail alphabetically.)
  function eliminationOrder(elimVars, keepVars) {
    const blocks = [elimVars.slice()];
    if (keepVars && keepVars.length) blocks.push(keepVars.slice());
    return monomialOrder('block', blocks);
  }

  // lcm of two monomials (max exponent per variable).
  function monoLcm(a, b) {
    const out = new Map(a);
    for (const [name, e] of b) out.set(name, Math.max(out.get(name) || 0, e));
    return out;
  }
  function _monoEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [k, e] of a) if ((b.get(k) || 0) !== e) return false;
    return true;
  }

  // Multivariate division with remainder: f = Σ qᵢ·divisorᵢ + r, where no term of
  // r is divisible by any leading monomial LT(divisorᵢ) under `order`. Returns
  // { quotients:[MPoly], remainder:MPoly }. The remainder is the NORMAL FORM of f
  // modulo the divisor set (canonical when the divisors are a Gröbner basis).
  // p -= (qc · x^qm) · g, mutating p.terms IN PLACE. This is the geobucket-style
  // win for the division loop: the running dividend never gets reallocated into a
  // fresh term Map each step (the old `p = p.sub(term.mul(g))` was O(size p) per
  // reduction), only the O(size g) affected entries are touched. g is small (a
  // single basis element), so each reduction is cheap regardless of how big p is.
  function _subTermTimesPoly(p, qm, qc, g) {
    for (const tg of g.terms.values()) {
      const mono = monoMul(qm, tg.mono);
      const key = monoKey(mono);
      const sub = qc.mul(tg.coeff);
      const cur = p.terms.get(key);
      if (cur) {
        const c = cur.coeff.sub(sub);
        if (c.isZero()) p.terms.delete(key); else cur.coeff = c;
      } else if (!sub.isZero()) {
        p.terms.set(key, { mono, coeff: sub.neg() });
      }
    }
  }
  function mpolyDivMod(f, divisors, order) {
    const lts = divisors.map((g) => g.leadingTerm(order));
    const quotients = divisors.map(() => MPoly.zero());
    const r = MPoly.zero();
    const p = f.clone();                                 // mutated in place below
    let guard = 0;
    while (!p.isZero()) {
      const lp = p.leadingTerm(order);
      let divided = false;
      for (let i = 0; i < divisors.length; i++) {
        const lg = lts[i];
        if (!lg) continue;
        const md = monoDivide(lp.mono, lg.mono);
        if (md !== null) {
          const qc = lp.coeff.div(lg.coeff);
          quotients[i]._addTerm(md, qc);
          _subTermTimesPoly(p, md, qc, divisors[i]);    // in place; cancels LT(p)
          divided = true;
          break;
        }
      }
      if (!divided) {                                   // LT(p) is irreducible → move to r
        r._addTerm(new Map(lp.mono), lp.coeff);
        p.terms.delete(monoKey(lp.mono));
      }
      if (++guard > 2e6) throw new Error('mpolyDivMod: non-terminating (guard tripped)');
    }
    return { quotients, remainder: r };
  }
  // Normal form (remainder) of f modulo a divisor set under `order`.
  function normalForm(f, divisors, order) { return mpolyDivMod(f, divisors, order).remainder; }

  // S-polynomial of f, g: S = (L/LT(f))·f − (L/LT(g))·g with L = lcm(LM f, LM g).
  // The construction cancels the leading terms; its normal form modulo the basis
  // is what Buchberger feeds back in.
  function sPoly(f, g, order) {
    const ltf = f.leadingTerm(order), ltg = g.leadingTerm(order);
    if (!ltf || !ltg) return MPoly.zero();
    const L = monoLcm(ltf.mono, ltg.mono);
    const tf = new MPoly(); tf._addTerm(monoDivide(L, ltf.mono), Gaussian.fromInt(1).div(ltf.coeff));
    const tg = new MPoly(); tg._addTerm(monoDivide(L, ltg.mono), Gaussian.fromInt(1).div(ltg.coeff));
    return tf.mul(f).sub(tg.mul(g));
  }

  // ===========================================================================
  // Packed exponent-vector kernel (Phase A) — the Buchberger HOT PATH.
  //
  // The name-keyed Map<varName,exp> monomial + monoKey() string (sort+join on
  // every term op) and the Set-building order `cmp` dominate Buchberger's cost.
  // Here a monomial is an Int32Array of exponents in a FIXED variable layout
  // (one lane per variable), so: tdeg = lane sum, lcm = lane max, divide = lane
  // subtract, multiply = lane add, coprime = no shared positive lane, and the
  // monomial order is a direct index walk — no Map iteration, no Set, no sort,
  // no string concatenation per comparison. The term key is one UTF-16 code unit
  // per lane (collision-free for exponents ≤ 0xFFFF — enforced in _pMul and
  // _ppFromMPoly, see _P_EXP_MAX). Coefficients stay Gaussian (ℚ(i)).
  //
  // This kernel powers the whole Gröbner layer: buchberger()'s main loop AND its
  // reduction phase (_reduceGroebnerPacked), the signature-based buchbergerSig,
  // and content removal (_ppMakePrimitive). Inputs convert from MPoly on entry
  // and the basis back to MPoly only at the very end. Because the reduced Gröbner
  // basis is UNIQUE for a given ideal and order, a correct kernel yields a result
  // bit-identical to the original MPoly path. The public MPoly division/
  // normalForm/sPoly primitives are untouched (still used by fglm/saturate and
  // exported); reduceGroebner survives as their reduction counterpart.
  // ===========================================================================

  // Build the fixed variable layout + order comparator + tdeg for a ring over
  // `allVars`, replicating monomialOrder()'s variable ranking exactly so the
  // packed comparator agrees with the Map-based one term for term.
  function _packedContext(order, allVars) {
    const kind = (order && order.kind) || 'grevlex';
    let layout = [];
    let ranges = null;                                   // block kind only: [[lo,hi),…]
    if (kind === 'block') {
      const blks = (order && order.varOrder) || [];
      const present = new Set(allVars);
      const listed = new Set();
      blks.forEach((b) => b.forEach((v) => listed.add(v)));
      ranges = [];
      for (const b of blks) {
        const start = layout.length;
        for (const v of b) if (present.has(v)) layout.push(v);
        if (layout.length > start) ranges.push([start, layout.length]);
      }
      const trailing = allVars.filter((v) => !listed.has(v)).sort();
      if (trailing.length) {
        const start = layout.length;
        for (const v of trailing) layout.push(v);
        ranges.push([start, layout.length]);
      }
    } else {
      const rank = new Map();
      if (order && order.varOrder) order.varOrder.forEach((v, i) => rank.set(v, i));
      const varCmp = (x, y) => {
        const rx = rank.has(x) ? rank.get(x) : Infinity;
        const ry = rank.has(y) ? rank.get(y) : Infinity;
        if (rx !== ry) return rx < ry ? -1 : 1;
        return x < y ? -1 : (x > y ? 1 : 0);
      };
      layout = allVars.slice().sort(varCmp);
    }
    const n = layout.length;
    const index = new Map();
    layout.forEach((v, i) => index.set(v, i));
    const tdeg = (e) => { let d = 0; for (let i = 0; i < n; i++) d += e[i]; return d; };
    let cmp;
    if (kind === 'lex') {
      cmp = (a, b) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
    } else if (kind === 'grlex') {
      cmp = (a, b) => {
        const da = tdeg(a), db = tdeg(b);
        if (da !== db) return da < db ? -1 : 1;
        for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
        return 0;
      };
    } else if (kind === 'block') {
      cmp = (a, b) => {
        for (const [lo, hi] of ranges) {
          let da = 0, db = 0;
          for (let i = lo; i < hi; i++) { da += a[i]; db += b[i]; }
          if (da !== db) return da < db ? -1 : 1;
          for (let i = hi - 1; i >= lo; i--) if (a[i] !== b[i]) return a[i] < b[i] ? 1 : -1;
        }
        return 0;
      };
    } else {                                             // grevlex
      cmp = (a, b) => {
        const da = tdeg(a), db = tdeg(b);
        if (da !== db) return da < db ? -1 : 1;
        for (let i = n - 1; i >= 0; i--) if (a[i] !== b[i]) return a[i] < b[i] ? 1 : -1;
        return 0;
      };
    }
    return { vars: layout, index, n, cmp, tdeg };
  }

  // Packed-monomial primitives (Int32Array lanes).
  function _pKey(e) { let s = ''; for (let i = 0; i < e.length; i++) s += String.fromCharCode(e[i]); return s; }
  // Per-variable exponents must stay ≤ 0xFFFF for _pKey's one-UTF-16-code-unit-
  // per-lane encoding to be collision-free (String.fromCharCode applies ToUint16,
  // so 65536 would key like 0 and silently merge distinct terms). Graded orders
  // can't exceed it (GROEBNER_MAX_DEGREE caps accepted generators and division
  // never raises total degree there), but under a pure-lex order intermediate
  // reduction CAN raise degree — so the two growth points (term products here,
  // input conversion in _ppFromMPoly) enforce the bound with a clear throw.
  const _P_EXP_MAX = 0xFFFF;
  function _pMul(a, b) {
    const n = a.length, o = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const s = a[i] + b[i];
      if (s > _P_EXP_MAX) throw new Error('packed kernel: exponent ' + s + ' exceeds the 16-bit key bound; use CAS export.');
      o[i] = s;
    }
    return o;
  }
  function _pLcmV(a, b) { const n = a.length, o = new Int32Array(n); for (let i = 0; i < n; i++) o[i] = a[i] > b[i] ? a[i] : b[i]; return o; }
  function _pDivV(a, b) { const n = a.length, o = new Int32Array(n); for (let i = 0; i < n; i++) { const d = a[i] - b[i]; if (d < 0) return null; o[i] = d; } return o; }
  function _pCoprimeV(a, b) { const n = a.length; for (let i = 0; i < n; i++) if (a[i] > 0 && b[i] > 0) return false; return true; }
  function _pEqualV(a, b) { const n = a.length; for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; }

  // Packed polynomial = Map<key, { e:Int32Array, coeff:Gaussian }>. Exponent
  // arrays and coeffs are never mutated in place (replaced wholesale), so terms
  // may be shared across clones.
  function _ppFromMPoly(ctx, poly) {
    const terms = new Map();
    for (const t of poly.terms.values()) {
      const e = new Int32Array(ctx.n);
      for (const [nm, ex] of t.mono) {
        if (ex > _P_EXP_MAX) throw new Error('packed kernel: input exponent ' + ex + ' exceeds the 16-bit key bound; use CAS export.');
        e[ctx.index.get(nm)] = ex;
      }
      terms.set(_pKey(e), { e, coeff: t.coeff });
    }
    return terms;
  }
  function _ppToMPoly(ctx, terms) {
    const out = MPoly.zero();
    for (const t of terms.values()) {
      const mono = new Map();
      for (let i = 0; i < ctx.n; i++) if (t.e[i] !== 0) mono.set(ctx.vars[i], t.e[i]);
      out._addTerm(mono, t.coeff);
    }
    return out;
  }
  function _ppLeading(ctx, terms) {
    let best = null;
    for (const t of terms.values()) if (best === null || ctx.cmp(t.e, best.e) > 0) best = t;
    return best;
  }
  function _ppTotalDeg(ctx, terms) { let d = -1; for (const t of terms.values()) { const td = ctx.tdeg(t.e); if (td > d) d = td; } return d; }

  // p -= (qc · x^qe) · g, mutating the packed map p in place (mirrors _subTermTimesPoly).
  function _ppSubTermTimesPoly(p, qe, qc, g) {
    for (const tg of g.values()) {
      const e = _pMul(qe, tg.e);
      const key = _pKey(e);
      const sub = qc.mul(tg.coeff);
      const cur = p.get(key);
      if (cur) { const c = cur.coeff.sub(sub); if (c.isZero()) p.delete(key); else cur.coeff = c; }
      else if (!sub.isZero()) p.set(key, { e, coeff: sub.neg() });
    }
  }
  // Normal form of packed f modulo divs (each { terms, le, lc } — leading e/coeff
  // precomputed). Returns a packed map.
  function _ppNormalForm(ctx, fTerms, divs) {
    const p = new Map(); for (const [k, t] of fTerms) p.set(k, { e: t.e, coeff: t.coeff });
    const r = new Map();
    let guard = 0;
    while (p.size) {
      const lp = _ppLeading(ctx, p);
      let divided = false;
      for (let i = 0; i < divs.length; i++) {
        const md = _pDivV(lp.e, divs[i].le);
        if (md !== null) {
          const qc = lp.coeff.div(divs[i].lc);
          _ppSubTermTimesPoly(p, md, qc, divs[i].terms);
          divided = true;
          break;
        }
      }
      if (!divided) { r.set(_pKey(lp.e), { e: lp.e, coeff: lp.coeff }); p.delete(_pKey(lp.e)); }
      if (++guard > 2e6) throw new Error('normalForm(packed): non-terminating (guard tripped)');
    }
    return r;
  }
  // S-polynomial of packed f,g with precomputed leading e/coeff. Mirrors sPoly.
  function _ppSPoly(ctx, f, g, lef, lcf, leg, lcg) {
    const L = _pLcmV(lef, leg);
    const af = _pDivV(L, lef), ag = _pDivV(L, leg);
    const cf = Gaussian.fromInt(1).div(lcf), cg = Gaussian.fromInt(1).div(lcg);
    const out = new Map();
    for (const t of f.values()) { const e = _pMul(af, t.e); out.set(_pKey(e), { e, coeff: cf.mul(t.coeff) }); }
    for (const t of g.values()) {
      const e = _pMul(ag, t.e); const key = _pKey(e); const sub = cg.mul(t.coeff);
      const cur = out.get(key);
      if (cur) { const c = cur.coeff.sub(sub); if (c.isZero()) out.delete(key); else cur.coeff = c; }
      else if (!sub.isZero()) out.set(key, { e, coeff: sub.neg() });
    }
    return out;
  }

  // Packed general-polynomial ops for the Bareiss determinant (mpolyDet). Buchberger needs only
  // S-poly + reduction; Bareiss additionally multiplies and subtracts two arbitrary packed polys
  // and exact-divides — so add those three on packed lanes so mpolyDet drops the map path's
  // per-term monoKey / per-comparison monoCmp churn. All are exact ring ops (mul/sub) or a UNIQUE
  // exact quotient (exactDiv), hence representation- and order-independent.
  function _ppAddInto(dst, key, e, coeff) {
    const cur = dst.get(key);
    if (cur) { const c = cur.coeff.add(coeff); if (c.isZero()) dst.delete(key); else cur.coeff = c; }
    else if (!coeff.isZero()) dst.set(key, { e, coeff });
  }
  function _ppMulPoly(a, b) {
    const out = new Map();
    for (const ta of a.values()) for (const tb of b.values()) { const e = _pMul(ta.e, tb.e); _ppAddInto(out, _pKey(e), e, ta.coeff.mul(tb.coeff)); }
    return out;
  }
  function _ppSubPoly(a, b) {
    const out = new Map(); for (const [k, t] of a) out.set(k, { e: t.e, coeff: t.coeff });
    for (const t of b.values()) _ppAddInto(out, _pKey(t.e), t.e, t.coeff.neg());
    return out;
  }
  // q with f = q·g exactly (assumes g | f); mirrors mpolyExactDiv on packed lanes.
  function _ppExactDiv(ctx, f, g) {
    const gLead = _ppLeading(ctx, g);
    const rem = new Map(); for (const [k, t] of f) rem.set(k, { e: t.e, coeff: t.coeff });
    const q = new Map();
    let guard = 0;
    while (rem.size) {
      const rLead = _ppLeading(ctx, rem);
      const qe = _pDivV(rLead.e, gLead.e);
      if (qe === null) throw new Error('packed exactDiv: not divisible (invariant violated)');
      const qc = rLead.coeff.div(gLead.coeff);
      _ppAddInto(q, _pKey(qe), qe, qc);
      _ppSubTermTimesPoly(rem, qe, qc, g);                // rem -= (qc·x^qe)·g, cancels LT(rem)
      if (++guard > 1e6) throw new Error('packed exactDiv: non-terminating');
    }
    return q;
  }
  // Fraction-free Bareiss elimination on a matrix of packed polys (mirrors mpolyDet). Entries are
  // read-only (replaced wholesale, never mutated in place), so cloning the row arrays suffices.
  function _bareissPacked(ctx, matrix) {
    const n = matrix.length;
    const M = matrix.map((row) => row.slice());
    let prev = new Map(); { const e = new Int32Array(ctx.n); prev.set(_pKey(e), { e, coeff: Gaussian.fromInt(1) }); }
    let sign = 1;
    for (let k = 0; k < n - 1; k++) {
      if (M[k][k].size === 0) {
        let r = k + 1; while (r < n && M[r][k].size === 0) r++;
        if (r === n) return new Map();                    // singular column ⇒ det 0
        const tmp = M[k]; M[k] = M[r]; M[r] = tmp; sign = -sign;
      }
      const pivot = M[k][k];
      for (let i = k + 1; i < n; i++) {
        for (let j = k + 1; j < n; j++) {
          const num = _ppSubPoly(_ppMulPoly(pivot, M[i][j]), _ppMulPoly(M[i][k], M[k][j]));
          M[i][j] = _ppExactDiv(ctx, num, prev);
        }
        M[i][k] = new Map();
      }
      prev = pivot;
    }
    const det = M[n - 1][n - 1];
    if (sign === 1) return det;
    const neg = new Map(); for (const [key, t] of det) neg.set(key, { e: t.e, coeff: t.coeff.neg() });
    return neg;
  }

  // The packed Buchberger main loop (Gebauer–Möller + sugar, identical control
  // flow to the MPoly version) → array of packed term maps (the raw basis).
  function _buchbergerPacked(ctx, packedPolys, caps) {
    const G = [];           // { terms, le, lc, sugar }
    const divs = [];        // { terms, le, lc } parallel for normalForm
    let P = [];             // { i, j, lcm, sugar }
    function update(t) {
      const lmt = G[t].le;
      const C = [];
      for (let i = 0; i < t; i++) C.push({ i, j: t, lcm: _pLcmV(G[i].le, lmt) });
      const D = [];
      const dividedBy = (arr, p) => arr.some((q) => q !== p && _pDivV(p.lcm, q.lcm) !== null);
      while (C.length) {
        const p = C.pop();
        if (_pCoprimeV(G[p.i].le, lmt) || (!dividedBy(C, p) && !dividedBy(D, p))) D.push(p);
      }
      const E = D.filter((p) => !_pCoprimeV(G[p.i].le, lmt));
      P = P.filter((p) => {
        if (_pDivV(p.lcm, lmt) === null) return true;
        return _pEqualV(_pLcmV(G[p.i].le, lmt), p.lcm) || _pEqualV(_pLcmV(G[p.j].le, lmt), p.lcm);
      });
      for (const p of E) {
        const si = G[p.i].sugar + (ctx.tdeg(p.lcm) - ctx.tdeg(G[p.i].le));
        const sj = G[t].sugar + (ctx.tdeg(p.lcm) - ctx.tdeg(lmt));
        p.sugar = Math.max(si, sj);
        P.push(p);
      }
    }
    function addElement(terms, sugar) {
      terms = _ppMakePrimitive(terms);                 // content removal: keep coeffs small
      const lt = _ppLeading(ctx, terms);
      G.push({ terms, le: lt.e, lc: lt.coeff, sugar });
      divs.push({ terms, le: lt.e, lc: lt.coeff });
      update(G.length - 1);
      if (G.length > caps.maxBasis)
        throw new Error('buchberger: basis exceeded ' + caps.maxBasis + ' generators; use CAS export.');
    }
    for (const pt of packedPolys) if (pt.size) addElement(pt, _ppTotalDeg(ctx, pt));
    if (!G.length) return [];
    let steps = 0;
    while (P.length) {
      if (++steps > caps.maxSteps)
        throw new Error('buchberger: exceeded ' + caps.maxSteps + ' S-pair steps; the system is too large — use CAS export.');
      let bi = 0;
      for (let k = 1; k < P.length; k++) {
        if (P[k].sugar < P[bi].sugar
          || (P[k].sugar === P[bi].sugar && ctx.cmp(P[k].lcm, P[bi].lcm) < 0)) bi = k;
      }
      const pair = P.splice(bi, 1)[0];
      const sp = _ppSPoly(ctx, G[pair.i].terms, G[pair.j].terms, G[pair.i].le, G[pair.i].lc, G[pair.j].le, G[pair.j].lc);
      const r = _ppNormalForm(ctx, sp, divs);
      if (caps.onProgress) caps.onProgress({ basis: G.length, pairs: P.length, steps });
      if (r.size === 0) continue;
      const rdeg = _ppTotalDeg(ctx, r);
      if (rdeg > caps.maxDegree)
        throw new Error('buchberger: generator degree ' + rdeg + ' exceeds the cap (' + caps.maxDegree + '); use CAS export.');
      if (r.size > caps.maxTerms)
        throw new Error('buchberger: a generator reached ' + r.size + ' terms (cap ' + caps.maxTerms + '); use CAS export.');
      addElement(r, pair.sugar);
    }
    return divs.map((d) => d.terms);
  }

  // Packed-poly equality (same monomials, same Gaussian coeffs).
  function _ppEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [k, t] of a) { const u = b.get(k); if (!u || !t.coeff.sub(u.coeff).isZero()) return false; }
    return true;
  }

  // --- Content removal (Phase D) ---------------------------------------------
  // Keep working-basis coefficients SMALL by dividing out the Gaussian-integer
  // content of each new generator. Scaling a generator by a nonzero constant
  // leaves the ideal, leading monomial, and sugar unchanged, so the run's control
  // flow and the final monic reduced basis are bit-identical — only intermediate
  // coefficient SIZE (BigInt digit count, hence memory + arithmetic cost) shrinks.
  function _blcm(a, b) { if (a === 0n || b === 0n) return 0n; return (a / bgcd(a, b)) * b; }
  function _bRoundDiv(x, n) { let q = x / n; const r = x - q * n; const ar = r < 0n ? -r : r; if (2n * ar >= n) q += (x < 0n ? -1n : 1n); return q; }
  // GCD of two Gaussian integers (a,b = {re,im} BigInt), up to a unit — Euclidean
  // with nearest-integer (rounding) division so the norm strictly decreases.
  function _gaussGCD(a, b) {
    let x = a, y = b;
    let guard = 0;
    while (!(y.re === 0n && y.im === 0n)) {
      const nb = y.re * y.re + y.im * y.im;
      const pr = x.re * y.re + x.im * y.im;        // x·conj(y), real
      const pi = x.im * y.re - x.re * y.im;        // imag
      const qr = _bRoundDiv(pr, nb), qi = _bRoundDiv(pi, nb);
      const r = { re: x.re - (qr * y.re - qi * y.im), im: x.im - (qr * y.im + qi * y.re) };
      x = y; y = r;
      // The nearest-integer step at least halves N(y) each iteration, so this is
      // unreachable for real inputs — but a silent `break` here would hand back a
      // non-divisor and _ppMakePrimitive's truncating division would then corrupt
      // coefficients, so fail loudly like every other guard in this file.
      if (++guard > 100000) throw new Error('gaussGCD: non-terminating (guard tripped)');
    }
    return x;
  }
  // Replace a packed poly's coefficients by a primitive Gaussian-INTEGER multiple:
  // clear denominators (×lcm), then divide by the Gaussian gcd of the numerators.
  function _ppMakePrimitive(terms) {
    if (terms.size === 0) return terms;
    let L = 1n;
    for (const t of terms.values()) { L = _blcm(L, t.coeff.re.d); L = _blcm(L, t.coeff.im.d); }
    const ints = [];
    let g = null;
    for (const t of terms.values()) {
      const re = t.coeff.re.n * (L / t.coeff.re.d);
      const im = t.coeff.im.n * (L / t.coeff.im.d);
      ints.push({ e: t.e, re, im });
      g = g === null ? { re, im } : _gaussGCD(g, { re, im });
    }
    const ng = g.re * g.re + g.im * g.im;
    if (ng === 0n) return terms;                    // all-zero (shouldn't happen)
    const out = new Map();
    for (const it of ints) {
      const pr = it.re * g.re + it.im * g.im;        // (re+im·i)/g = (re+im·i)·conj(g)/N(g)
      const pi = it.im * g.re - it.re * g.im;
      out.set(_pKey(it.e), { e: it.e, coeff: new Gaussian(new Rational(pr / ng, 1n), new Rational(pi / ng, 1n)) });
    }
    return out;
  }
  // The canonical REDUCED basis, computed entirely on packed exponent vectors
  // (Phase D) — monic leading coeffs, no leading monomial divisible by another's,
  // every generator fully reduced modulo the rest, sorted by leading monomial
  // (descending). Mirrors reduceGroebner exactly but stays packed, so the exact
  // path no longer rebuilds MPolys and re-runs the Map/string normal form for the
  // reduction phase (which dominated end-to-end time once the main loop was packed).
  // The reduced Gröbner basis is UNIQUE, so the result is bit-identical.
  function _reduceGroebnerPacked(ctx, basis) {
    const monic = (terms) => {
      const inv = Gaussian.fromInt(1).div(_ppLeading(ctx, terms).coeff);
      const out = new Map();
      for (const [k, t] of terms) out.set(k, { e: t.e, coeff: inv.mul(t.coeff) });
      return out;
    };
    let B = basis.filter((t) => t.size).map(monic);
    const lead = B.map((t) => _ppLeading(ctx, t).e);
    const keep = [];
    for (let i = 0; i < B.length; i++) {
      let red = false;
      for (let j = 0; j < B.length; j++) {
        if (i === j) continue;
        if (_pDivV(lead[i], lead[j]) !== null) {
          if (_pEqualV(lead[i], lead[j])) { if (j < i) { red = true; break; } }   // keep the earlier of equals
          else { red = true; break; }
        }
      }
      if (!red) keep.push(B[i]);
    }
    B = keep;
    let changed = true, guard = 0;
    while (changed) {
      changed = false;
      for (let i = 0; i < B.length; i++) {
        const divs = [];
        for (let k = 0; k < B.length; k++) { if (k === i) continue; const lt = _ppLeading(ctx, B[k]); divs.push({ terms: B[k], le: lt.e, lc: lt.coeff }); }
        const nf = _ppNormalForm(ctx, B[i], divs);
        if (!_ppEqual(B[i], nf)) { B[i] = nf.size ? monic(nf) : null; changed = true; }
      }
      B = B.filter(Boolean);
      if (++guard > 10000) throw new Error('reduceGroebnerPacked: non-terminating (guard tripped)');
    }
    B.sort((a, b) => ctx.cmp(_ppLeading(ctx, b).e, _ppLeading(ctx, a).e));   // leading monos distinct ⇒ total
    return B;
  }

  // shift a packed poly by a monomial t: each term's exponent vector += t.
  function _ppShift(p, t) { const out = new Map(); for (const term of p.values()) { const e = _pMul(t, term.e); out.set(_pKey(e), { e, coeff: term.coeff }); } return out; }

  // ===========================================================================
  // Signature-based Gröbner basis — GVW (Gao–Volny–Wang) on the packed kernel (Tier 3).
  //
  // Each labeled polynomial carries a SIGNATURE (monomial · e_index) = the leading term
  // of its provenance in the free module Rᵐ. Two history-based criteria prune whole
  // families of S-pairs BEFORE reduction — the SYZYGY criterion (a J-pair whose
  // signature is a multiple of a known syzygy signature reduces to 0) and the REWRITE
  // criterion (keep only the newest generator per signature). A "J-pair" is a single
  // multiple t·(s,v) (the larger-signature side); REGULAR reduction (only steps that
  // strictly lower the signature) handles the cancellation. The polynomials of the
  // resulting signature basis form a Gröbner basis → reduced here to the SAME canonical
  // basis as buchberger() (the reduced GB is unique, so this is the correctness oracle).
  // Module order: POT (position-over-term, index primary — see sigCmp below), the
  // incremental F5-style choice that makes regular reduction effective.
  // opts: the same {maxBasis, maxSteps, maxDegree, maxTerms, onProgress, reduced}
  // caps as buchberger, plus opts.stats (out-param, filled with
  // {pairsProcessed, pairsGenerated, basisRaw}).
  // ===========================================================================
  function buchbergerSig(polys, order, opts) {
    opts = opts || {};
    const ord = (order && order.cmp) ? order : monomialOrder(order || 'grevlex');
    const stats = opts.stats || {};
    const caps = {
      maxBasis: opts.maxBasis != null ? opts.maxBasis : GROEBNER_MAX_BASIS,
      maxSteps: opts.maxSteps != null ? opts.maxSteps : GROEBNER_MAX_STEPS,
      maxDegree: opts.maxDegree != null ? opts.maxDegree : GROEBNER_MAX_DEGREE,
      maxTerms: opts.maxTerms != null ? opts.maxTerms : GROEBNER_MAX_TERMS,
      onProgress: typeof opts.onProgress === 'function' ? opts.onProgress : null,
    };
    const cleaned = (polys || []).filter((p) => p && !p.isZero());
    if (!cleaned.length) return [];
    const allVars = new Set();
    for (const p of cleaned) for (const v of p.vars()) allVars.add(v);
    const ctx = _packedContext(ord, [...allVars]);
    const F = cleaned.map((p) => _ppFromMPoly(ctx, p));
    const m = F.length;
    const ONE = new Int32Array(ctx.n);

    // signature = { sm: packed monomial, si: index }; POT order (position-over-term):
    // index primary (lower index processed first → INCREMENTAL, like F5), then term order.
    // POT lets every lower-index basis element regular-reduce a higher-index polynomial
    // (its signature is automatically smaller), which is what makes signatures efficient.
    const sigCmp = (a, b) => { if (a.si !== b.si) return a.si - b.si; return ctx.cmp(a.sm, b.sm); };
    const sigDivides = (g, s) => g.si === s.si && _pDivV(s.sm, g.sm) !== null;   // g | s
    const lead = (p) => _ppLeading(ctx, p);

    const G = [];            // { sm, si, p, lm, lc }
    const Syz = [];          // syzygy signatures { sm, si }
    let P = [];              // J-pairs / initial labeled polys: { sm, si, p, srcIdx }
    for (let i = 0; i < m; i++) P.push({ sm: ONE, si: i, p: F[i], srcIdx: -1 });

    const isRewritable = (cand) => { for (let k = cand.srcIdx + 1; k < G.length; k++) if (sigDivides(G[k], cand)) return true; return false; };
    const jPair = (a, ai, b, bi) => {
      const t = _pLcmV(a.lm, b.lm);
      const ta = _pDivV(t, a.lm), tb = _pDivV(t, b.lm);
      const sa = { sm: _pMul(ta, a.sm), si: a.si }, sb = { sm: _pMul(tb, b.sm), si: b.si };
      const c = sigCmp(sa, sb);
      if (c === 0) return null;                       // equal signatures ⇒ syzygy, no J-pair
      return c > 0 ? { sm: sa.sm, si: sa.si, p: _ppShift(a.p, ta), srcIdx: ai }
                   : { sm: sb.sm, si: sb.si, p: _ppShift(b.p, tb), srcIdx: bi };
    };
    // regular signature reduction of cand.p (signature held at cand): only subtract a
    // multiple whose signature is STRICTLY below cand — keeps the leading signature fixed.
    const sigReduce = (cand) => {
      const p = new Map(); for (const [k, t] of cand.p) p.set(k, { e: t.e, coeff: t.coeff });
      let guard = 0;
      while (p.size) {
        const lt = lead(p);
        let reduced = false;
        for (const g of G) {
          const md = _pDivV(lt.e, g.lm);
          if (md === null) continue;
          if (sigCmp({ sm: _pMul(md, g.sm), si: g.si }, cand) >= 0) continue;   // not signature-lowering
          _ppSubTermTimesPoly(p, md, lt.coeff.div(g.lc), g.p);
          reduced = true;
          break;
        }
        if (!reduced) break;                          // lead term is regular-reduced
        if (++guard > 2e6) throw new Error('buchbergerSig: non-terminating reduction (guard tripped)');
      }
      return p;
    };

    let steps = 0, generated = m;
    while (P.length) {
      if (++steps > caps.maxSteps) throw new Error('buchbergerSig: exceeded ' + caps.maxSteps + ' signature steps; use CAS export.');
      let bi = 0;
      for (let k = 1; k < P.length; k++) if (sigCmp(P[k], P[bi]) < 0) bi = k;
      const cand = P.splice(bi, 1)[0];
      if (Syz.some((z) => sigDivides(z, cand))) continue;     // syzygy criterion
      if (isRewritable(cand)) continue;                       // rewrite criterion
      const r = sigReduce(cand);
      if (caps.onProgress) caps.onProgress({ basis: G.length, pairs: P.length, steps });
      if (r.size === 0) { Syz.push({ sm: cand.sm, si: cand.si }); continue; }
      const lt = lead(r);
      if (ctx.tdeg(lt.e) > caps.maxDegree) throw new Error('buchbergerSig: generator degree exceeds the cap (' + caps.maxDegree + '); use CAS export.');
      if (r.size > caps.maxTerms) throw new Error('buchbergerSig: a generator reached ' + r.size + ' terms; use CAS export.');
      const lp = { sm: cand.sm, si: cand.si, p: r, lm: lt.e, lc: lt.coeff };
      const idx = G.length;
      for (let gi = 0; gi < G.length; gi++) {
        const g = G[gi];
        // F5 / Koszul syzygy criterion: the principal syzygy lm(g)·sig(lp) vs lm(lp)·sig(g)
        // is a known syzygy — register its (larger) signature so future J-pairs that are
        // its multiples are pruned before reduction. This is what makes signatures fast.
        // On a TIE the two module leading terms may CANCEL (module coefficients aren't
        // tracked), so the true syzygy signature could be strictly smaller — registering
        // it would over-prune and could lose basis elements. Skip the tie case (sound:
        // fewer registered syzygies only costs pruning power, never correctness).
        const s1 = { sm: _pMul(g.lm, lp.sm), si: lp.si }, s2 = { sm: _pMul(lp.lm, g.sm), si: g.si };
        const sc = sigCmp(s1, s2);
        if (sc !== 0) Syz.push(sc > 0 ? s1 : s2);
        const jp = jPair(lp, idx, g, gi); if (jp) { P.push(jp); generated++; }
      }
      G.push(lp);
      if (G.length > caps.maxBasis) throw new Error('buchbergerSig: basis exceeded ' + caps.maxBasis + ' generators; use CAS export.');
    }
    stats.pairsProcessed = steps; stats.pairsGenerated = generated; stats.basisRaw = G.length;
    const raw = G.map((g) => g.p);
    if (opts.reduced === false) return raw.map((t) => _ppToMPoly(ctx, t));
    return _reduceGroebnerPacked(ctx, raw).map((t) => _ppToMPoly(ctx, t));
  }

  // Caps — Buchberger can blow up super-exponentially, so bound the run and throw
  // a clear "use CAS export" error rather than hanging (mirrors RESULTANT_MATRIX_CAP).
  // All overridable per call via opts {maxBasis, maxSteps, maxDegree, maxTerms} (0 is
  // honored). The values are tuned for the cancellable Web Worker (sym-worker.js):
  // feasible interactive systems complete (the reality-reduced cardioid — 118
  // generators, ~10 s — fits comfortably) while a genuinely intractable one (the FULL
  // conjugate cardioid: 478 generators / minutes, and that many cards would choke the
  // canvas anyway) errors with actionable guidance (assume variables real / fix φ(0) /
  // eliminate / CAS export) instead of grinding.
  const GROEBNER_MAX_BASIS = 300;      // generators in the working basis
  const GROEBNER_MAX_STEPS = 150000;   // S-pair reductions
  const GROEBNER_MAX_DEGREE = 200;     // total degree of any new generator
  const GROEBNER_MAX_TERMS = 100000;   // term count of any new generator

  // Buchberger's algorithm → a Gröbner basis of ⟨polys⟩ under `order` (a
  // monomialOrder object, an order kind string, or omitted → grevlex). Uses the
  // **Gebauer–Möller** pair-update installation (Buchberger's first/coprime
  // criterion AND the chain criterion) to discard the great majority of useless
  // S-pairs, and the **sugar** selection strategy (smallest sugar first, tie-broken
  // by the order) — both standard and essential for non-homogeneous input like the
  // QD systems. Returns the canonical REDUCED basis unless opts.reduced === false.
  // opts: {maxBasis, maxSteps, maxDegree, maxTerms} caps (overridable; throw a clear
  // "use CAS export" error past the limit); opts.onProgress({basis,pairs,steps})
  // (called per reduction; the seam the Web-Worker offload reports/cancels through);
  // opts.reduced === false returns the raw (unreduced) basis; opts.signature === true
  // delegates to the signature-based GVW variant (buchbergerSig) — same canonical
  // reduced basis, usually fewer S-pair reductions.
  function buchberger(polys, order, opts) {
    opts = opts || {};
    if (opts.signature) return buchbergerSig(polys, order, opts);   // opt-in signature/GVW path
    const ord = (order && order.cmp) ? order : monomialOrder(order || 'grevlex');
    const caps = {
      maxBasis: opts.maxBasis != null ? opts.maxBasis : GROEBNER_MAX_BASIS,
      maxSteps: opts.maxSteps != null ? opts.maxSteps : GROEBNER_MAX_STEPS,
      maxDegree: opts.maxDegree != null ? opts.maxDegree : GROEBNER_MAX_DEGREE,
      maxTerms: opts.maxTerms != null ? opts.maxTerms : GROEBNER_MAX_TERMS,
      onProgress: typeof opts.onProgress === 'function' ? opts.onProgress : null,
    };

    // Run BOTH the main loop and the reduction on the packed exponent-vector
    // kernel (see above); convert back to MPoly only at the very end. The reduced
    // Gröbner basis is canonical/unique, so this is bit-identical to the old MPoly
    // path while keeping the whole computation off the Map/string representation.
    const cleaned = (polys || []).filter((p) => p && !p.isZero());
    if (!cleaned.length) return [];
    const allVars = new Set();
    for (const p of cleaned) for (const v of p.vars()) allVars.add(v);
    const ctx = _packedContext(ord, [...allVars]);
    const packed = cleaned.map((p) => _ppFromMPoly(ctx, p));
    const rawPacked = _buchbergerPacked(ctx, packed, caps);
    if (opts.reduced === false) return rawPacked.map((t) => _ppToMPoly(ctx, t));
    return _reduceGroebnerPacked(ctx, rawPacked).map((t) => _ppToMPoly(ctx, t));
  }

  // Reduce a Gröbner basis to the canonical REDUCED basis: monic leading
  // coefficients, no generator's leading monomial divisible by another's, and
  // every generator fully reduced modulo the rest. Output sorted by leading
  // monomial (descending) for a stable, comparable result.
  function reduceGroebner(G, order) {
    const ord = (order && order.cmp) ? order : monomialOrder(order || 'grevlex');
    const monic = (g) => g.scale(Gaussian.fromInt(1).div(g.leadingCoeff(ord)));
    let B = G.filter((g) => !g.isZero()).map(monic);
    // minimalize: drop g whose leading monomial is a multiple of another's
    const keep = [];
    for (let i = 0; i < B.length; i++) {
      const lmi = B[i].leadingMono(ord);
      let redundant = false;
      for (let j = 0; j < B.length; j++) {
        if (i === j) continue;
        const lmj = B[j].leadingMono(ord);
        if (monoDivide(lmi, lmj) !== null) {            // lmj | lmi
          if (_monoEqual(lmi, lmj)) { if (j < i) { redundant = true; break; } }   // keep the earlier of equals
          else { redundant = true; break; }
        }
      }
      if (!redundant) keep.push(B[i]);
    }
    B = keep;
    // inter-reduce tails (leading monomials are minimal, so only tails change)
    let changed = true, guard = 0;
    while (changed) {
      changed = false;
      for (let i = 0; i < B.length; i++) {
        const others = B.filter((_, k) => k !== i);
        const nf = normalForm(B[i], others, ord);
        if (!nf.equals(B[i])) {
          B[i] = nf.isZero() ? null : monic(nf);
          changed = true;
        }
      }
      B = B.filter(Boolean);
      if (++guard > 10000) throw new Error('reduceGroebner: non-terminating (guard tripped)');
    }
    B.sort((a, b) => ord.cmp(b.leadingMono(ord), a.leadingMono(ord)) || (a.key() < b.key() ? -1 : 1));
    return B;
  }

  // Normalize an order argument to an order OBJECT (with .cmp). Mirrors _orderCmp
  // but returns the object (so leadingMono/cmp/varOrder are all available).
  function _ord(order) { return (order && order.cmp) ? order : monomialOrder(order || 'grevlex'); }

  // ---------------------------------------------------------------------------
  // Zero-dimensional toolkit — once a Gröbner basis G is in hand, these read off
  // the geometry of the variety: whether it is finite (zero-dimensional), the
  // standard monomials (a basis of the quotient ring k[x]/I), and the quotient
  // dimension = the number of solutions counted with multiplicity. The QD coefficient
  // system is zero-dimensional once the quadrature data is fixed, so this is the gate
  // for FGLM and the shape-position solver below.
  // ---------------------------------------------------------------------------
  const ZERO_DIM_MAX = 4096;   // cap on the enumerated quotient dimension

  function leadingMonomials(G, order) { const o = _ord(order); return G.filter((g) => !g.isZero()).map((g) => g.leadingMono(o)); }
  function _ambientVars(G, vars) {
    if (vars) return vars.slice();
    const s = new Set(); for (const g of G) for (const v of g.vars()) s.add(v); return [...s].sort();
  }
  // Cheap zero-dimensionality test: the ideal is zero-dimensional iff, for every
  // ambient variable, some leading monomial is a pure power of that variable.
  // (A unit leading monomial '1' means I = (1) — the empty variety, also zero-dim.)
  function isZeroDimensional(G, order, vars) {
    const lms = leadingMonomials(G, order);
    if (lms.some((lm) => lm.size === 0)) return true;
    const V = _ambientVars(G, vars);
    return V.every((v) => lms.some((lm) => lm.size === 1 && lm.has(v)));
  }
  // Standard monomials: the monomials divisible by no leading monomial of G — a
  // k-basis of k[x]/I. Returns the list (mono Maps) for a zero-dim ideal, [] for
  // I=(1), or null if the ideal is positive-dimensional. opts.maxDim caps the size.
  function standardMonomials(G, order, vars, opts) {
    opts = opts || {};
    const o = _ord(order);
    const lms = leadingMonomials(G, order);
    if (lms.some((lm) => lm.size === 0)) return [];          // I = (1)
    const V = _ambientVars(G, vars);
    const bound = {};
    for (const v of V) {
      let e = Infinity;
      for (const lm of lms) if (lm.size === 1 && lm.has(v)) e = Math.min(e, lm.get(v));
      if (e === Infinity) return null;                       // not zero-dim along v
      bound[v] = e;
    }
    const maxDim = opts.maxDim != null ? opts.maxDim : ZERO_DIM_MAX;
    const dims = V.map((v) => bound[v]);
    const idx = V.map(() => 0);
    const divBySome = (m) => lms.some((lm) => monoDivide(m, lm) !== null);
    const out = [];
    let guard = 0;
    for (;;) {
      const m = new Map();
      for (let k = 0; k < V.length; k++) if (idx[k] > 0) m.set(V[k], idx[k]);
      if (!divBySome(m)) {
        out.push(m);
        if (out.length > maxDim) throw new Error('standardMonomials: quotient dimension exceeds the cap (' + maxDim + '); use CAS export.');
      }
      let k = 0; while (k < V.length) { idx[k]++; if (idx[k] < dims[k]) break; idx[k] = 0; k++; }
      if (k === V.length) break;
      if (++guard > 1e7) throw new Error('standardMonomials: enumeration guard tripped');
    }
    // sort by the order (ascending) for a stable, meaningful basis listing
    out.sort((a, b) => o.cmp(a, b));
    return out;
  }
  // Quotient dimension = #standard monomials = #solutions with multiplicity (∞ if
  // positive-dimensional).
  function quotientDimension(G, order, vars) {
    const s = standardMonomials(G, order, vars);
    return s === null ? Infinity : s.length;
  }

  // Minimum hitting set of a family of variable-support Sets — the height of the leading-
  // monomial ideal. Branch-and-bound: each still-uncovered support must be hit by one of its
  // members, so branch on its elements. Exact; fine for the modest variable counts of QD systems.
  function _minHittingSet(supports) {
    let best = Infinity;
    (function rec(rem, count) {
      if (count >= best) return;
      if (!rem.length) { best = count; return; }
      for (const v of rem[0]) rec(rem.filter((t) => !t.has(v)), count + 1);
    })(supports, 0);
    return best === Infinity ? 0 : best;
  }

  // Krull dimension of R/I from the leading-monomial (initial) ideal: dim(R/I) = dim(R/in I),
  // and for a MONOMIAL ideal dim = n − height, where height = the minimum number of variables
  // whose vanishing contains V(in I) = the min set hitting every generator's support. Returns
  // 0 (a finite solution set), ≥1 (a positive-dimensional family of that many free parameters),
  // or −1 for I = (1) (the empty variety). Unlike quotientDimension — which returns ∞ and stops
  // for positive-dim ideals — this reports the actual moduli dimension.
  function krullDimension(G, order, vars) {
    const lms = leadingMonomials(G, order);
    if (lms.some((lm) => lm.size === 0)) return -1;              // I = (1)
    const V = _ambientVars(G, vars);
    const supports = lms.filter((lm) => lm.size > 0).map((lm) => new Set(lm.keys()));
    if (!supports.length) return V.length;                       // I = (0)
    return V.length - _minHittingSet(supports);
  }

  // { dimension, degree } for R/I. degree is the exact solution count with multiplicity
  // (= #standard monomials) when zero-dimensional; for a positive-dimensional ideal the degree
  // needs the full Hilbert-series numerator (a follow-on) so it is reported as null.
  function dimensionDegree(G, order, vars) {
    const dimension = krullDimension(G, order, vars);
    return { dimension, degree: dimension === 0 ? quotientDimension(G, order, vars) : null };
  }

  // ---------------------------------------------------------------------------
  // FGLM — convert a Gröbner basis G1 (order1, typically the fast grevlex) into the
  // Gröbner basis under order2 (typically lex, for elimination / solving) of the
  // SAME zero-dimensional ideal, by linear algebra in the quotient ring. This is the
  // standard CAS pipeline: compute a cheap grevlex basis, then FGLM to lex, instead
  // of running Buchberger directly under the slow lex order. Throws if not zero-dim.
  // ---------------------------------------------------------------------------
  function _vecZero(n) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = Gaussian.fromInt(0); return a; }

  // Packed-kernel normal-form → coordinate-vector helper, shared by fglm + multiplicationMatrix.
  // Both repeatedly reduce a monomial modulo a Gröbner basis G and read off its coordinates in the
  // standard-monomial basis B. The map-based normalForm pays monoKey's per-term sort-join + monoCmp's
  // per-comparison Set allocation — exactly the churn the packed Int32Array kernel already removed for
  // Buchberger, but left on this zero-dim SOLVE path. Precompute the packed context, the packed
  // divisors (each with its leading exponent/coeff), and a packed-key → basis-column map ONCE, then
  // _ppNormalForm reduces each monomial on packed lanes. NF modulo a Gröbner basis is UNIQUE, so the
  // coordinate vector is bit-identical to the map path (guarded by the fglm/multMatrix differential
  // tests + realSolutionCount's realCount corpus).
  function _packedNFCoords(G, o, ambientVars, B) {
    const ctx = _packedContext(o, ambientVars);
    const divs = G.map((g) => { const terms = _ppFromMPoly(ctx, g); const lead = _ppLeading(ctx, terms); return { terms, le: lead.e, lc: lead.coeff }; });
    const packMono = (monoMap) => {
      const e = new Int32Array(ctx.n);
      for (const [nm, ex] of monoMap) {
        if (ex > _P_EXP_MAX) throw new Error('packed NF: exponent ' + ex + ' exceeds the 16-bit key bound; use CAS export.');
        e[ctx.index.get(nm)] = ex;
      }
      return e;
    };
    const D = B.length;
    const colOf = new Map();
    B.forEach((m, i) => colOf.set(_pKey(packMono(m)), i));
    return {
      // coordinate vector (length D, Gaussian entries) of NF(the given monomial) in B
      coordsOfMono(monoMap) {
        const e = packMono(monoMap);
        const f = new Map(); f.set(_pKey(e), { e, coeff: Gaussian.fromInt(1) });
        const r = _ppNormalForm(ctx, f, divs);
        const v = _vecZero(D);
        for (const t of r.values()) {
          const c = colOf.get(_pKey(t.e));
          if (c == null) throw new Error('packed NF: normal form left the standard-monomial span (not a Gröbner basis?)');
          v[c] = t.coeff;
        }
        return v;
      },
    };
  }

  function fglm(G1, order1, order2, vars) {
    const o1 = _ord(order1), o2 = _ord(order2);
    const B = standardMonomials(G1, o1, vars);
    if (B === null) throw new Error('fglm: the ideal is not zero-dimensional');
    const D = B.length;
    const V = _ambientVars(G1, vars);
    // coordinate vector of NF(monomial) in the standard-monomial basis B, via the PACKED kernel
    // (see _packedNFCoords). NF modulo the Gröbner basis G1 is unique, so this is bit-identical to
    // the old map-based normalForm path — without its per-term monoKey/monoCmp churn.
    const nfc = _packedNFCoords(G1, o1, V, B);
    const nfVec = (monoMap) => nfc.coordsOfMono(monoMap);
    const rows = [];        // echelon { vec, pivot, comb:Map(acceptedIndex→Gaussian) }; invariant vec = comb·accepted
    const accepted = [];    // standard monomials under order2, in increasing-order2 acceptance order
    function reduce(v) {
      const w = v.slice(); const comb = new Map();
      for (const row of rows) {
        const p = row.pivot; if (w[p].isZero()) continue;
        const f = w[p].div(row.vec[p]);
        for (let i = 0; i < D; i++) w[i] = w[i].sub(f.mul(row.vec[i]));
        for (const [k, c] of row.comb) comb.set(k, (comb.get(k) || Gaussian.fromInt(0)).add(f.mul(c)));
      }
      let piv = -1; for (let i = 0; i < D; i++) if (!w[i].isZero()) { piv = i; break; }
      return { w, comb, piv };
    }
    const G2 = [], G2lm = [];
    const divByG2 = (m) => G2lm.some((lm) => monoDivide(m, lm) !== null);
    const processed = new Set();
    let cand = [new Map()];   // start with the monomial 1
    let guard = 0;
    while (cand.length) {
      let bi = 0; for (let k = 1; k < cand.length; k++) if (o2.cmp(cand[k], cand[bi]) < 0) bi = k;
      const m = cand.splice(bi, 1)[0]; const mk = monoKey(m);
      if (processed.has(mk)) continue; processed.add(mk);
      if (divByG2(m)) continue;
      const v = nfVec(m);
      const { w, comb, piv } = reduce(v);
      if (piv === -1) {                          // dependent → new G2 generator
        let poly = new MPoly(); poly._addTerm(new Map(m), Gaussian.fromInt(1));
        for (const [j, c] of comb) { const t = new MPoly(); t._addTerm(new Map(accepted[j]), c); poly = poly.sub(t); }
        G2.push(poly); G2lm.push(m);
      } else {                                   // independent → new standard monomial
        const ai = accepted.length, pivVal = w[piv];
        const ncomb = new Map();
        for (const [k, c] of comb) ncomb.set(k, c.neg().div(pivVal));
        ncomb.set(ai, Gaussian.fromInt(1).div(pivVal));
        accepted.push(m);
        rows.push({ vec: w.map((x) => x.div(pivVal)), pivot: piv, comb: ncomb });
        for (const x of V) { const c = new Map(m); c.set(x, (c.get(x) || 0) + 1); cand.push(c); }
      }
      if (++guard > 1e6) throw new Error('fglm: guard tripped');
    }
    return reduceGroebner(G2, o2);
  }

  // ---------------------------------------------------------------------------
  // solveZeroDim — numeric solutions of a zero-dimensional system via the SHAPE
  // LEMMA: compute a grevlex GB, FGLM to a lex basis with the chosen solve-variable
  // ranked lowest; if the basis is in shape position (one univariate generator in the
  // solve variable, every other variable a polynomial in it), solve the univariate
  // numerically (injected root finder — the app passes QD.FaberAnalysis.polynomialRoots)
  // and back-substitute. When the lex basis is NOT in shape position it falls back to
  // the Möller–Stetter eigenvalue solver (solveByEigenvalues), so it solves every
  // radical zero-dim ideal; pass opts.noEigen:true to suppress the fallback.
  // Returns { ok, solutions:[{var:{re,im}}], … } or { ok:false, reason } (not zero-dim
  // / eigen-solve failed / no convergence → use the CAS bridge).
  // input: an array of MPolys (a system) or { G, order } (a precomputed GB).
  // opts: {vars, solveVar, order1, rootFinder, preprocess (default true; linear
  //   pre-elimination), noEigen, maxEigenDim} plus the buchberger caps.
  // NOTE the result shape varies by path: the shape route adds {basis, univariateDegree};
  //   the eigen fallback adds {method:'eigenvalue', shapePosition:false, fallbackFrom,
  //   complete} (complete:false ⇒ a PARTIAL solution set); preprocessing adds
  //   {eliminatedVars}. Callers should probe fields defensively.
  // ---------------------------------------------------------------------------
  // Linear-substitution preprocessing (Tier 1). Repeatedly find a generator that is
  // degree 1 in some variable v with a CONSTANT nonzero leading coefficient — i.e.
  // c₁·v + c₀ with c₁ ∈ ℚ(i)\{0} and v ∉ c₀ — AND whose solved form v = −c₀/c₁ is
  // itself LINEAR (total degree ≤ 1, so substituting it NEVER raises any generator's
  // total degree). Solve v, substitute into every other generator (dropping this one),
  // recurse to a fixpoint. Each step removes one variable for free, so the residual
  // system handed to Buchberger/solveZeroDim is strictly smaller — often the
  // difference between "reaches shape position / finishes" and "hangs" (the QD gauge
  // and the locator/star rows are exactly such linear generators).
  // Returns { reduced:[MPoly over the surviving vars], eliminated:[{name, expr}] (each
  // expr already chained-substituted to the surviving vars, so a solution of `reduced`
  // lifts to the eliminated vars by direct evaluation), inconsistent }.
  function linearReduce(polys) {
    let cur = (polys || []).filter((p) => p && !p.isZero()).map((p) => p.clone());
    const eliminated = [];
    let changed = true, inconsistent = false;
    while (changed) {
      changed = false;
      for (let i = 0; i < cur.length && !changed; i++) {
        const g = cur[i];
        for (const v of g.vars()) {
          if (g.degreeIn(v) !== 1) continue;
          const cs = g.coeffsIn(v);                          // g = c₁·v + c₀
          const c1 = cs[1];
          if (c1.isZero() || c1.vars().size !== 0) continue; // need a nonzero CONSTANT leading coeff
          const expr = cs[0].scale(Gaussian.fromInt(-1).div([...c1.terms.values()][0].coeff));   // v = −c₀/c₁
          if (expr.totalDegree() > 1) continue;              // keep substitutions linear → no degree growth
          const map = {}; map[v] = expr;
          const next = [];
          for (let j = 0; j < cur.length; j++) {
            if (j === i) continue;
            const s = cur[j].subst(map);
            if (s.isZero()) continue;
            if (s.vars().size === 0) inconsistent = true;    // a nonzero constant ⇒ no solutions
            next.push(s);
          }
          for (const el of eliminated) el.expr = el.expr.subst(map);   // chain prior exprs to surviving vars
          eliminated.push({ name: v, expr });
          cur = next;
          changed = true;
          break;
        }
      }
    }
    return { reduced: cur, eliminated, inconsistent };
  }
  function _liftEliminated(partialSol, eliminated) {
    const sol = Object.assign({}, partialSol);
    for (const el of eliminated) sol[el.name] = el.expr.evalComplex(partialSol);
    return sol;
  }

  function solveZeroDim(input, opts) {
    opts = opts || {};
    // Tier-1 preprocessing: strip linear variables first, solve the smaller residual
    // system, then lift the eliminated variables back. Expands the solvable class
    // (fewer variables ⇒ more systems reach zero-dim / shape position).
    if (Array.isArray(input) && opts.preprocess !== false) {
      const lr = linearReduce(input);
      if (lr.eliminated.length) {
        // A nonzero constant in the ideal ⇒ no solutions at all (over ANY ambient space).
        if (lr.inconsistent) return { ok: true, solutions: [], basis: [], dimension: 0, univariateDegree: 0, eliminatedVars: lr.eliminated.length };
        // Respect a caller-supplied ambient space (opts.vars): a requested variable
        // that was neither eliminated nor survives in the residual generators is
        // FREE — the system is positive-dimensional over opts.vars even though the
        // residual alone may look zero-dimensional (e.g. [y−1] with vars ['x','y']).
        const elimNames = new Set(lr.eliminated.map((e) => e.name));
        const surviving = opts.vars ? opts.vars.filter((v) => !elimNames.has(v)) : undefined;
        if (surviving) {
          const rv = new Set(_ambientVars(lr.reduced));
          if (surviving.some((v) => !rv.has(v))) {
            return { ok: false, reason: 'the system is not zero-dimensional (a requested variable is unconstrained after linear reduction)' };
          }
        }
        if (lr.reduced.length === 0 || _ambientVars(lr.reduced).length === 0) {
          return { ok: true, solutions: [_liftEliminated({}, lr.eliminated)], basis: [], dimension: 1, univariateDegree: 0, eliminatedVars: lr.eliminated.length };
        }
        // Keep the caller's solveVar when it survives elimination; drop it otherwise.
        const sv = (opts.solveVar && !elimNames.has(opts.solveVar)) ? opts.solveVar : undefined;
        const sub = solveZeroDim(lr.reduced, Object.assign({}, opts, { preprocess: false, vars: surviving, solveVar: sv }));
        if (!sub.ok) return sub;
        return Object.assign({}, sub, {
          solutions: sub.solutions.map((s) => _liftEliminated(s, lr.eliminated)),
          eliminatedVars: lr.eliminated.length,
        });
      }
    }
    let G1, o1, vars;
    if (Array.isArray(input)) {
      vars = opts.vars || _ambientVars(input);
      // L5 — monomial-order heuristic: try grevlex on the natural variable order; if it
      // hits a cost cap, retry once with the REVERSED order (a different elimination
      // order can shrink the basis by orders of magnitude). The variety — hence the
      // solutions — is order-independent, so this is safe; keep the first order that
      // completes. opts.order1 overrides (use exactly that order, no retry).
      const cand = opts.order1 ? [opts.order1]
        : [monomialOrder('grevlex', vars), monomialOrder('grevlex', vars.slice().reverse())];
      let lastErr = null;
      for (const co of cand) {
        try { o1 = _ord(co); G1 = buchberger(input, o1, opts); lastErr = null; break; }
        catch (e) { lastErr = e; G1 = null; }
      }
      if (!G1) return { ok: false, reason: (lastErr && lastErr.message) || String(lastErr) };
    } else { G1 = input.G; o1 = _ord(input.order); vars = opts.vars || _ambientVars(G1); }

    if (!isZeroDimensional(G1, o1, vars)) {
      return { ok: false, reason: 'the system is not zero-dimensional (infinitely many solutions / a positive-dimensional component)' };
    }
    // The shape-lemma path below is fast and gives exact back-substitution, but it
    // requires the lex basis to be in SHAPE POSITION. When it isn't (multiple
    // solutions share the solve-var coordinate, or a variable isn't a polynomial in
    // it), fall back to eigenvalue/quotient-ring solving, which handles EVERY radical
    // zero-dim ideal (Tier 2). The fallback reuses the grevlex basis G1 — no FGLM,
    // no shape requirement.
    const eigenFallback = (reason) => {
      if (opts.noEigen) return { ok: false, reason: reason + ' — use the CAS bridge' };
      const r = solveByEigenvalues({ G: G1, order: o1 }, Object.assign({}, opts, { vars }));
      return r.ok ? Object.assign(r, { shapePosition: false, fallbackFrom: reason }) : { ok: false, reason: reason + '; eigenvalue fallback also failed: ' + r.reason };
    };
    const solveVar = opts.solveVar || vars[vars.length - 1];
    const lexVars = vars.filter((v) => v !== solveVar).concat([solveVar]);   // solveVar lowest
    const lex = monomialOrder('lex', lexVars);
    let Glex;
    try { Glex = fglm(G1, o1, lex, vars); }
    catch (e) { return eigenFallback('FGLM/order-change failed (' + ((e && e.message) || e) + ')'); }

    // shape position: one generator univariate in solveVar; each other u is u = h(solveVar)
    const uni = Glex.filter((g) => { const vs = g.vars(); return vs.has(solveVar) && [...vs].every((x) => x === solveVar); });
    if (uni.length !== 1) return eigenFallback('lex basis not in shape position (no single univariate generator)');
    const f = uni[0];
    const exprs = {};
    for (const u of vars) {
      if (u === solveVar) continue;
      const gen = Glex.find((g) => { const vs = g.vars(); return vs.has(u) && [...vs].every((x) => x === u || x === solveVar) && g.degreeIn(u) === 1; });
      if (!gen) return eigenFallback('lex basis not in shape position for ' + u);
      const cs = gen.coeffsIn(u);                 // u·c1 + c0(solveVar) = 0
      if (cs[1].vars().size !== 0) return eigenFallback('lex basis not in shape position for ' + u + ' (leading coeff not constant)');
      exprs[u] = { c1: cs[1], c0: cs[0] };
    }
    const rootFinder = opts.rootFinder || _defaultRootFinder();
    if (!rootFinder) return { ok: false, reason: 'no root finder available (pass opts.rootFinder)', basis: Glex };
    const fc = f.coeffsIn(solveVar).map((c) => c.evalComplex({}));   // ascending {re,im}
    const res = rootFinder(fc) || {};
    const roots = res.roots || [];
    if (res.converged === false && !opts.allowUnconverged) {
      return { ok: false, reason: 'univariate root-finding did not converge (degree ' + f.degreeIn(solveVar) + ')', basis: Glex };
    }
    const c1c = {};
    for (const u of vars) if (u !== solveVar) c1c[u] = exprs[u].c1.evalComplex({});
    const solutions = roots.map((r) => {
      const sol = {}; sol[solveVar] = { re: r.re, im: r.im };
      for (const u of vars) {
        if (u === solveVar) continue;
        const c0 = exprs[u].c0.evalComplex({ [solveVar]: r });
        sol[u] = cdiv({ re: -c0.re, im: -c0.im }, c1c[u]);     // u = −c0/c1
      }
      return sol;
    });
    // quotientDimension can throw past ZERO_DIM_MAX; the solve itself succeeded,
    // so report the solutions with an unknown dimension rather than throwing.
    let qdim = null;
    try { qdim = quotientDimension(G1, o1, vars); } catch (e) { qdim = null; }
    const uniDeg = f.degreeIn(solveVar);
    // complete:false when the injected root finder returned FEWER roots than the univariate
    // degree (a missed clustered / multiple root) — mirrors the eigenvalue path's `complete`
    // flag so a consumer (e.g. reconcileRealCount) can honestly flag an under-count instead of
    // trusting a strict subset that reads as the full solution set.
    return { ok: true, solutions, basis: Glex, dimension: qdim, univariateDegree: uniDeg, complete: solutions.length >= uniDeg };
  }
  function _defaultRootFinder() {
    const G = (typeof window !== 'undefined' && window.QD) || (typeof global !== 'undefined' && global.QD)
      || (typeof QD !== 'undefined' && QD) || null;
    const FA = G && G.FaberAnalysis;
    return (FA && FA.polynomialRoots) ? ((coeffsAsc) => FA.polynomialRoots(coeffsAsc)) : null;
  }

  // ===========================================================================
  // Eigenvalue (Möller–Stetter) solving on the quotient ring R/I (Tier 2).
  //
  // For a zero-dim ideal the quotient R/I is a finite-dim ℂ-space with the STANDARD
  // MONOMIALS as a basis B (|B| = #solutions w/ multiplicity), and multiplication by a
  // variable x is a linear operator Mₓ on R/I. Stickelberger: the eigenvalues of Mₓ are
  // the x-coordinates of the solutions, and the {Mₓ} COMMUTE, so they share eigenvectors
  // — the LEFT eigenvectors are the point-evaluation functionals. Take a generic
  // combination M = Σ cₖ M_{xₖ} (distinct eigenvalues), find its eigenvalues (char poly
  // via the existing Bareiss det + the injected univariate root finder) and per
  // eigenvalue its left eigenvector w; then xₖ(p) = (wᵀ M_{xₖ})/wᵀ (a Rayleigh read-off).
  // Needs NO shape position — solves every radical zero-dim ideal, the gap the
  // shape-lemma path rejects. Numeric in the eigen-step (exact Mₓ over ℚ(i)).
  // ===========================================================================

  // Mₓ as a D×D Gaussian matrix: column j = normalForm(x·B[j]) written in the basis B.
  function multiplicationMatrix(G, order, vars, varName) {
    const o = _ord(order);
    const B = standardMonomials(G, o, vars);
    if (B === null) throw new Error('multiplicationMatrix: positive-dimensional ideal');
    const D = B.length;
    const M = [];
    for (let i = 0; i < D; i++) { const row = new Array(D); for (let j = 0; j < D; j++) row[j] = Gaussian.fromInt(0); M.push(row); }
    // Column j = coordinates of NF(varName · B[j]) in the standard basis, via the packed kernel
    // (see _packedNFCoords / fglm). NF modulo a GB is unique ⇒ M is bit-identical to the map path.
    const nfc = _packedNFCoords(G, o, _ambientVars(G, vars), B);
    for (let j = 0; j < D; j++) {
      const m = new Map(B[j]); m.set(varName, (m.get(varName) || 0) + 1);       // the monomial varName · B[j]
      const col = nfc.coordsOfMono(m);
      for (let k = 0; k < D; k++) if (!col[k].isZero()) M[k][j] = col[k];
    }
    return { M, B, D };
  }

  // --- Power sums / coordinate moments over a zero-dim variety (Stickelberger, exact ℚ(i)) ---
  function _matTrace(M) { let s = Gaussian.fromInt(0); for (let i = 0; i < M.length; i++) s = s.add(M[i][i]); return s; }
  function _matMul(A, B) {
    const n = A.length, p = B.length, m = B[0].length, C = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(m);
      for (let j = 0; j < m; j++) { let s = Gaussian.fromInt(0); for (let k = 0; k < p; k++) s = s.add(A[i][k].mul(B[k][j])); row[j] = s; }
      C.push(row);
    }
    return C;
  }

  // Power sums p_0..p_K of the eigenvalues of a D×D Gaussian matrix M: p_k = trace(M^k), exact.
  // For M = the multiplication-by-v operator on the quotient R/I of a zero-dim ideal, Stickelberger
  // makes the eigenvalues the v-coordinates of V(I) (with multiplicity), so p_k = Σ_{p∈V(I)} v(p)^k
  // — the k-th power-sum "moment" of that coordinate over the solution set. p_0 = D = #solutions.
  function powerSums(M, K) {
    const out = [Gaussian.fromInt(M.length)];
    let Mk = M;
    for (let k = 1; k <= K; k++) { out.push(_matTrace(Mk)); if (k < K) Mk = _matMul(Mk, M); }
    return out;
  }

  // Elementary symmetric functions e_0..e_n from the power sums via Newton's identities
  // k·e_k = Σ_{i=1}^{k} (−1)^{i−1} e_{k−i} p_i. p is the p_0..p_n array (p_0 unused). Exact ℚ(i).
  function newtonToElementary(p, n) {
    const e = [Gaussian.fromInt(1)];
    for (let k = 1; k <= n; k++) {
      let acc = Gaussian.fromInt(0);
      for (let i = 1; i <= k; i++) { const t = e[k - i].mul(p[i]); acc = (i % 2 === 0) ? acc.sub(t) : acc.add(t); }
      e.push(acc.div(Gaussian.fromInt(k)));
    }
    return e;
  }

  // Characteristic polynomial of the multiplication matrix M — i.e. the (monic) univariate
  // polynomial the coordinate satisfies over V(I), with multiplicity: Π(λ−λ_i) = Σ_k (−1)^k e_k
  // λ^{D−k}. Returned as an ASCENDING Gaussian coeff array [c_0..c_D] (c_D = 1). Trace-based
  // (Leverrier / Newton) — no symbolic λ-determinant; complements the Bareiss det path.
  function charPolyByTraces(M) {
    const D = M.length;
    const e = newtonToElementary(powerSums(M, D), D);
    const c = new Array(D + 1);
    for (let k = 0; k <= D; k++) c[D - k] = (k % 2 === 0) ? e[k] : e[k].neg();
    return c;
  }

  // QD-facing: the power-sum moments of coordinate `varName` over the (zero-dim) solution set of
  // `input` — an MPoly[] system or a precomputed { G, order }. Returns { ok, D, moments } with
  // moments[k] = Σ_{p∈V(I)} varName(p)^k as {re,im} (k = 0..K, moments[0] = D), or { ok:false,
  // reason }. K defaults to D. Exact ℚ(i) internally; toComplex only at the boundary.
  function coordinateMoments(input, varName, K, opts) {
    opts = opts || {};
    let G, o, vars;
    if (Array.isArray(input)) {
      vars = opts.vars || _ambientVars(input);
      o = _ord(opts.order || monomialOrder('grevlex', vars));
      try { G = buchberger(input, o, opts); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    } else { G = input.G; o = _ord(input.order); vars = opts.vars || _ambientVars(G); }
    if (vars.indexOf(varName) === -1) return { ok: false, reason: 'coordinate "' + varName + '" is not an ambient variable' };
    if (!isZeroDimensional(G, o, vars)) return { ok: false, reason: 'the system is not zero-dimensional' };
    let mm;
    try { mm = multiplicationMatrix(G, o, vars, varName); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    const ps = powerSums(mm.M, K == null ? mm.D : K);
    return { ok: true, D: mm.D, moments: ps.map((g) => g.toComplex()) };
  }

  // --- Shape-from-moments (Prony–Hankel) — roadmap #18 ---
  // Given a complex moment sequence m_k = Σ_j a_j z_j^k (an exponential sum: the k-th power-sum moment
  // of a discrete measure Σ a_j δ_{z_j} — for a quadrature domain, exactly the quadrature data), recover
  // the "shape": the ORDER N = #nodes (the QD-order), and the exact PRONY polynomial P(z) = Π(z − z_j)
  // the nodes satisfy. The order is the rank of the Hankel moment matrix H_{ij} = m_{i+j}; computed
  // EXACTLY over ℚ(i) it is an integer with a genuine rank DROP at N, where floating-point Prony is
  // notoriously ill-conditioned. (Nodes/weights = the numeric roots of P + a Vandermonde solve — a later
  // step; the exact contribution here is the order and the exact Prony polynomial.)

  // Rationalize a finite JS number to an exact Rational (continued-fraction convergents, denominator
  // capped): integers are exact, and a float that is really a simple rational is recovered exactly — the
  // regime #18 targets (exact input ⇒ exact rank). A genuinely irrational float rounds to a close rational.
  function _ratFromNumber(x, maxDen) {
    if (typeof x !== 'number' || !isFinite(x)) throw new Error('shape-from-moments: non-finite moment');
    if (Number.isInteger(x)) return new Rational(BigInt(x), 1n);
    maxDen = maxDen || 1000000000000n; // 1e12
    const neg = x < 0; let y = Math.abs(x);
    let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n; // convergent numerators/denominators
    for (let it = 0; it < 64; it++) {
      const a = Math.floor(y), ai = BigInt(a);
      const h2 = ai * h1 + h0, k2 = ai * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      const frac = y - a;
      if (frac < 1e-15) break;
      y = 1 / frac;
    }
    return new Rational(neg ? -h1 : h1, k1);
  }

  // Coerce a moment (Gaussian | {re,im} numbers/Rationals | real number) to an exact Gaussian.
  function _momentToGaussian(m) {
    if (m instanceof Gaussian) return m;
    if (typeof m === 'number') return new Gaussian(_ratFromNumber(m), RZERO);
    if (m && typeof m === 'object' && ('re' in m || 'im' in m)) {
      const re = m.re instanceof Rational ? m.re : _ratFromNumber(m.re == null ? 0 : m.re);
      const im = m.im instanceof Rational ? m.im : _ratFromNumber(m.im == null ? 0 : m.im);
      return new Gaussian(re, im);
    }
    throw new Error('shape-from-moments: unrecognized moment value');
  }

  // Exact rank of a Gaussian matrix by row reduction over ℚ(i) (ℚ(i) is a field ⇒ ordinary elimination
  // is exact); counts pivots.
  function _gaussianMatrixRank(A) {
    const rows = A.length;
    if (rows === 0) return 0;
    const cols = A[0].length;
    const M = A.map((r) => r.slice());
    let rank = 0;
    for (let col = 0; col < cols && rank < rows; col++) {
      let piv = -1;
      for (let r = rank; r < rows; r++) if (!M[r][col].isZero()) { piv = r; break; }
      if (piv < 0) continue;
      if (piv !== rank) { const t = M[piv]; M[piv] = M[rank]; M[rank] = t; }
      const pv = M[rank][col];
      for (let c = col; c < cols; c++) M[rank][c] = M[rank][c].div(pv);
      for (let r = 0; r < rows; r++) {
        if (r === rank) continue;
        const f = M[r][col];
        if (f.isZero()) continue;
        for (let c = col; c < cols; c++) M[r][c] = M[r][c].sub(f.mul(M[rank][c]));
      }
      rank++;
    }
    return rank;
  }

  // Exact kernel (null-space) BASIS of a Gaussian matrix over ℚ(i): reduced row echelon, then one basis
  // vector per free column (free var = 1, the pivot entries read off the RREF). Returns an array of
  // Gaussian[] (each length = #columns), empty when the matrix has full column rank. The load-bearing
  // linear-algebra primitive the bivariate factorizer's Ruppert-nullspace step needs (roadmap #19).
  function _gaussianNullspace(A) {
    const rows = A.length;
    const cols = rows ? A[0].length : 0;
    if (cols === 0) return [];
    const M = A.map((r) => r.slice());
    const pivots = []; // pivots[k] = column of the k-th pivot
    let rank = 0;
    for (let col = 0; col < cols && rank < rows; col++) {
      let piv = -1;
      for (let r = rank; r < rows; r++) if (!M[r][col].isZero()) { piv = r; break; }
      if (piv < 0) continue;
      if (piv !== rank) { const t = M[piv]; M[piv] = M[rank]; M[rank] = t; }
      const pv = M[rank][col];
      for (let c = col; c < cols; c++) M[rank][c] = M[rank][c].div(pv);
      for (let r = 0; r < rows; r++) {
        if (r === rank) continue;
        const f = M[r][col];
        if (f.isZero()) continue;
        for (let c = col; c < cols; c++) M[r][c] = M[r][c].sub(f.mul(M[rank][c]));
      }
      pivots.push(col);
      rank++;
    }
    const pivotSet = new Set(pivots);
    const basis = [];
    for (let free = 0; free < cols; free++) {
      if (pivotSet.has(free)) continue;
      const v = new Array(cols).fill(Gaussian.fromInt(0));
      v[free] = Gaussian.fromInt(1);
      for (let k = 0; k < rank; k++) v[pivots[k]] = M[k][free].neg(); // pivot var = −(RREF at row k, free col)
      basis.push(v);
    }
    return basis;
  }

  // Public exact-ℚ(i) kernel basis: rows given as numbers | {re,im} (coerced exactly, as for moments);
  // returns the basis as an array of {re,im}[] vectors (empty ⇒ full column rank).
  function nullspaceRational(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const A = rows.map((r) => (r || []).map(_momentToGaussian));
    return _gaussianNullspace(A).map((v) => v.map((g) => g.toComplex()));
  }

  // The QD-order N = rank of the maximal square Hankel of the moment sequence, EXACT over ℚ(i). With L
  // moments a size-s Hankel (using m_0..m_{2s-2}) is available for s ≤ ⌊(L+1)/2⌋; `saturated` flags
  // rank == s — the order could be higher, so supply more moments. Returns { ok, order, hankelSize,
  // saturated } or { ok:false, reason }.
  function hankelRank(moments) {
    if (!Array.isArray(moments) || moments.length < 1) return { ok: false, reason: 'need a nonempty moment sequence' };
    let g;
    try { g = moments.map(_momentToGaussian); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    const L = g.length, s = Math.floor((L + 1) / 2), H = [];
    for (let i = 0; i < s; i++) { const row = []; for (let j = 0; j < s; j++) row.push(g[i + j]); H.push(row); }
    const rank = _gaussianMatrixRank(H);
    return { ok: true, order: rank, hankelSize: s, saturated: rank === s };
  }

  // The exact Prony polynomial P(z) = Π(z − z_j) = z^N − Σ_{i<N} c_i z^i, whose roots are the nodes,
  // from the Hankel system H·c = rhs (H_{ij} = m_{i+j}, rhs_i = m_{i+N}) solved exactly over ℚ(i). `order`
  // defaults to hankelRank; needs ≥ 2·order moments. Returns { ok, order, poly (monic MPoly in opts.varName,
  // default 'z'), coeffs (ascending Gaussian array, coeffs[N] = 1) } or { ok:false, reason }.
  function pronyPolynomial(moments, opts) {
    opts = opts || {};
    const hr = hankelRank(moments);
    if (!hr.ok) return hr;
    const N = opts.order != null ? opts.order : hr.order;
    const varName = opts.varName || 'z';
    if (N < 0 || !Number.isInteger(N)) return { ok: false, reason: 'invalid order' };
    let g;
    try { g = moments.map(_momentToGaussian); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    const zv = MPoly.variable(varName);
    if (N === 0) return { ok: true, order: 0, poly: MPoly.fromInt(1), coeffs: [Gaussian.fromInt(1)] };
    if (g.length < 2 * N) return { ok: false, reason: 'need at least 2·order = ' + 2 * N + ' moments' };
    const H = [], rhs = [];
    for (let i = 0; i < N; i++) { const row = []; for (let j = 0; j < N; j++) row.push(g[i + j]); H.push(row); rhs.push(g[i + N]); }
    const c = _gaussSolveG(H, rhs, N);
    if (!c) return { ok: false, reason: 'Hankel system singular at order ' + N + ' — the order estimate is too high for these moments' };
    // P(z) = z^N − Σ c_i z^i  ⇒ ascending coeffs [−c_0, …, −c_{N−1}, 1]; build the MPoly.
    const coeffs = c.map((ci) => ci.neg());
    coeffs.push(Gaussian.fromInt(1));
    let poly = MPoly.fromInt(0), zp = MPoly.fromInt(1);
    for (let k = 0; k <= N; k++) { poly = poly.add(zp.mul(MPoly.constant(coeffs[k]))); if (k < N) zp = zp.mul(zv); }
    return { ok: true, order: N, poly, coeffs };
  }

  // Numeric roots of an ascending complex-float coefficient array (Durand–Kerner). Turns the EXACT Prony
  // polynomial into the numeric nodes; because the polynomial is exact its roots are well-conditioned —
  // the point of #18 vs solving the ill-conditioned float Prony system directly. Returns [] on failure.
  function _numRootsDK(coeffs) {
    let n = coeffs.length - 1;
    while (n > 0 && Math.hypot(coeffs[n].re, coeffs[n].im) < 1e-14) n--;
    if (n < 1) return [];
    const lead = coeffs[n];
    const a = coeffs.slice(0, n + 1).map((c) => cdiv(c, lead)); // monic ascending, a[n] = 1
    const evalP = (z) => { let acc = a[n]; for (let k = n - 1; k >= 0; k--) acc = cadd(cmul(acc, z), a[k]); return acc; };
    let bound = 1;
    for (let k = 0; k < n; k++) bound = Math.max(bound, 1 + Math.hypot(a[k].re, a[k].im));
    let z = [];
    for (let k = 0; k < n; k++) { const t = (2 * Math.PI * (k + 0.5)) / n + 0.1; z.push({ re: bound * Math.cos(t), im: bound * Math.sin(t) }); }
    for (let it = 0; it < 500; it++) {
      let maxd = 0;
      z = z.map((zi, i) => {
        let denom = { re: 1, im: 0 };
        for (let j = 0; j < n; j++) if (j !== i) denom = cmul(denom, { re: zi.re - z[j].re, im: zi.im - z[j].im });
        const step = cdiv(evalP(zi), denom);
        maxd = Math.max(maxd, Math.hypot(step.re, step.im));
        return { re: zi.re - step.re, im: zi.im - step.im };
      });
      if (maxd < 1e-14) break;
    }
    return z;
  }

  // Solve the numeric Vandermonde system V·a = b (V_{kj} = nodes[j]^k) for the weights a, by complex
  // Gaussian elimination with partial pivoting. Returns null if singular (repeated nodes).
  function _numVandermondeSolve(nodes, b) {
    const n = nodes.length, A = [];
    for (let k = 0; k < n; k++) { const row = []; for (let j = 0; j < n; j++) row.push(cpowInt(nodes[j], k)); row.push(b[k]); A.push(row); }
    for (let col = 0; col < n; col++) {
      let piv = col, best = Math.hypot(A[col][col].re, A[col][col].im);
      for (let r = col + 1; r < n; r++) { const m = Math.hypot(A[r][col].re, A[r][col].im); if (m > best) { best = m; piv = r; } }
      if (best < 1e-300) return null;
      if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
      const pv = A[col][col];
      for (let c = col; c <= n; c++) A[col][c] = cdiv(A[col][c], pv);
      for (let r = 0; r < n; r++) { if (r === col) continue; const f = A[r][col]; for (let c = col; c <= n; c++) A[r][c] = { re: A[r][c].re - cmul(f, A[col][c]).re, im: A[r][c].im - cmul(f, A[col][c]).im }; }
    }
    return A.map((r) => r[n]);
  }

  // Full shape-from-moments reconstruction: the exact ORDER N and Prony polynomial (see pronyPolynomial),
  // plus the numeric NODES (its roots) and WEIGHTS (a Vandermonde solve), and a reconstruction RESIDUAL
  // maxₖ |m_k − Σ_j a_j z_j^k| over the supplied moments — an honest self-check. The order and Prony
  // polynomial are exact (=); the nodes/weights are numeric (≈, the nodes being generally algebraic).
  function shapeFromMoments(moments, opts) {
    opts = opts || {};
    const pr = pronyPolynomial(moments, opts);
    if (!pr.ok) return pr;
    const N = pr.order;
    let mm;
    try { mm = moments.map(_momentToGaussian).map((g) => g.toComplex()); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    if (N === 0) return { ok: true, order: 0, coeffs: pr.coeffs, poly: pr.poly, nodes: [], weights: [], maxResidual: 0 };
    const nodes = _numRootsDK(pr.coeffs.map((g) => g.toComplex()));
    if (nodes.length !== N) return { ok: false, reason: 'root-finding failed to return ' + N + ' nodes' };
    const weights = _numVandermondeSolve(nodes, mm.slice(0, N));
    if (!weights) return { ok: false, reason: 'Vandermonde system singular (repeated nodes?)' };
    let maxResidual = 0;
    for (let k = 0; k < mm.length; k++) {
      let s = { re: 0, im: 0 };
      for (let j = 0; j < N; j++) s = cadd(s, cmul(weights[j], cpowInt(nodes[j], k)));
      maxResidual = Math.max(maxResidual, Math.hypot(s.re - mm[k].re, s.im - mm[k].im));
    }
    return { ok: true, order: N, coeffs: pr.coeffs, poly: pr.poly, nodes, weights, maxResidual };
  }

  // JSON-safe serialization of shapeFromMoments (drops the MPoly; the exact Prony coefficients become
  // {re,im} floats). Used by the worker runJob handler and the store's sync fallback so both return the
  // identical plain-object shape. `coeffs` are ascending (coeffs[N] = 1); `saturated` warns the order may
  // be an underestimate (supply more moments).
  function shapeFromMomentsJSON(moments, opts) {
    const res = shapeFromMoments(moments, opts || {});
    if (!res.ok) return { ok: false, reason: res.reason };
    const hr = hankelRank(moments);
    return {
      ok: true, order: res.order,
      saturated: hr.ok ? hr.saturated : false,
      hankelSize: hr.ok ? hr.hankelSize : res.order,
      coeffs: res.coeffs.map((g) => g.toComplex()),
      nodes: res.nodes, weights: res.weights, maxResidual: res.maxResidual,
    };
  }

  // A unit-free null vector of a complex n×n matrix A ({re,im} entries), i.e. w≠0 with
  // A·w = 0 (Gaussian elimination with partial pivoting; returns null if A has full rank).
  function _complexNullVector(A, n) {
    const M = A.map((row) => row.map((c) => ({ re: c.re, im: c.im })));
    const cabs2 = (a) => a.re * a.re + a.im * a.im;
    const rowOfCol = new Array(n).fill(-1); // rowOfCol[c] = pivot row for column c (or -1)
    let row = 0, scale = 1;
    for (const r0 of M) for (const c of r0) scale = Math.max(scale, Math.abs(c.re), Math.abs(c.im));
    const tol = 1e-12 * scale * scale;
    for (let col = 0; col < n && row < n; col++) {
      let best = row, bestAbs = cabs2(M[row][col]);
      for (let r = row + 1; r < n; r++) { const a = cabs2(M[r][col]); if (a > bestAbs) { bestAbs = a; best = r; } }
      if (bestAbs <= tol) continue;          // free column
      const tmp = M[row]; M[row] = M[best]; M[best] = tmp;
      const pv = M[row][col];
      for (let c = col; c < n; c++) M[row][c] = cdiv(M[row][c], pv);
      for (let r = 0; r < n; r++) {
        if (r === row) continue;
        const f = M[r][col];
        if (cabs2(f) === 0) continue;
        for (let c = col; c < n; c++) M[r][c] = { re: M[r][c].re - (f.re * M[row][c].re - f.im * M[row][c].im), im: M[r][c].im - (f.re * M[row][c].im + f.im * M[row][c].re) };
      }
      rowOfCol[col] = row; row++;
    }
    let freeCol = -1;
    for (let c = 0; c < n; c++) if (rowOfCol[c] === -1) { freeCol = c; break; }
    if (freeCol === -1) return null;         // full rank → trivial null space only
    const w = []; for (let i = 0; i < n; i++) w.push({ re: 0, im: 0 });
    w[freeCol] = { re: 1, im: 0 };
    for (let c = 0; c < n; c++) if (rowOfCol[c] !== -1) { const r = rowOfCol[c]; w[c] = { re: -M[r][freeCol].re, im: -M[r][freeCol].im }; }
    return w;
  }

  // Solve a zero-dimensional system via eigenvalues of the multiplication matrices.
  // input: an array of MPolys, or { G, order } (a precomputed grevlex GB). Returns
  // { ok, solutions:[{var:{re,im}}], dimension, method } or { ok:false, reason }.
  function solveByEigenvalues(input, opts) {
    opts = opts || {};
    let G, o, vars;
    if (Array.isArray(input)) {
      vars = opts.vars || _ambientVars(input);
      o = _ord(opts.order1 || monomialOrder('grevlex', vars));
      try { G = buchberger(input, o, opts); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    } else { G = input.G; o = _ord(input.order); vars = opts.vars || _ambientVars(G); }
    if (!isZeroDimensional(G, o, vars)) return { ok: false, reason: 'the system is not zero-dimensional' };
    // standardMonomials THROWS past ZERO_DIM_MAX (4096); keep this function's
    // { ok:false, reason } contract by catching it here.
    let B;
    try { B = standardMonomials(G, o, vars); }
    catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    if (B === null) return { ok: false, reason: 'positive-dimensional ideal' };
    const D = B.length;
    if (D === 0) return { ok: true, solutions: [], dimension: 0, method: 'eigenvalue' };
    const MAXDIM = opts.maxEigenDim != null ? opts.maxEigenDim : 64;
    if (D > MAXDIM) return { ok: false, reason: 'quotient dimension ' + D + ' exceeds the eigenvalue-solver cap (' + MAXDIM + ') — use the CAS bridge' };
    const rootFinder = opts.rootFinder || _defaultRootFinder();
    if (!rootFinder) return { ok: false, reason: 'no root finder available (pass opts.rootFinder)' };

    const Mk = {};
    for (const v of vars) Mk[v] = multiplicationMatrix(G, o, vars, v).M;
    const MkNum = {}; for (const v of vars) MkNum[v] = Mk[v].map((r) => r.map((g) => g.toComplex()));
    const tol = opts.verifyTol != null ? opts.verifyTol : 1e-6;
    const satisfies = (sol) => G.every((g) => { const z = g.evalComplex(sol); return Math.abs(z.re) < tol && Math.abs(z.im) < tol; });

    // Try a few generic integer coefficient vectors until we recover all D solutions
    // (a "separating" combination makes the eigenvalues distinct → simple eigenvectors).
    const COEFF_SETS = [vars.map((_, i) => i + 1), [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53], vars.map((_, i) => 1 + ((i * 2 + 1) % 7) + i * 11)];
    let bestSols = [];
    for (let attempt = 0; attempt < COEFF_SETS.length; attempt++) {
      const cv = {}; vars.forEach((v, i) => { cv[v] = COEFF_SETS[attempt][i % COEFF_SETS[attempt].length] || (i + 1); });
      // M = Σ cᵥ·Mᵥ  (exact Gaussian)
      const Mcomb = [];
      for (let i = 0; i < D; i++) { const row = new Array(D); for (let j = 0; j < D; j++) { let s = Gaussian.fromInt(0); for (const v of vars) s = s.add(Mk[v][i][j].mul(Gaussian.fromInt(cv[v]))); row[j] = s; } Mcomb.push(row); }
      // char poly det(λI − M) via Bareiss, then the injected univariate root finder
      const LAM = '__lambda';
      const lamMat = [];
      for (let i = 0; i < D; i++) { const row = []; for (let j = 0; j < D; j++) { let e = MPoly.constant(Mcomb[i][j].neg()); if (i === j) e = e.add(MPoly.variable(LAM)); row.push(e); } lamMat.push(row); }
      const asc = mpolyDet(lamMat).coeffsIn(LAM).map((c) => c.evalComplex({}));
      const res = rootFinder(asc) || {};
      const eig = res.roots || [];
      const McombNum = Mcomb.map((r) => r.map((g) => g.toComplex()));
      const sols = [];
      const seen = new Set();
      for (const mu of eig) {
        const A = [];                                    // A = Mᵀ − μI (left eigvec of M = null vec of A)
        for (let i = 0; i < D; i++) { const row = new Array(D); for (let j = 0; j < D; j++) row[j] = McombNum[j][i]; A.push(row); }
        for (let i = 0; i < D; i++) A[i][i] = { re: A[i][i].re - mu.re, im: A[i][i].im - mu.im };
        const w = _complexNullVector(A, D);
        if (!w) continue;
        let jmax = 0, bestAbs = w[0].re * w[0].re + w[0].im * w[0].im;
        for (let j = 1; j < D; j++) { const a = w[j].re * w[j].re + w[j].im * w[j].im; if (a > bestAbs) { bestAbs = a; jmax = j; } }
        const sol = {};
        for (const v of vars) {
          let num = { re: 0, im: 0 };
          for (let i = 0; i < D; i++) num = cadd(num, cmul(MkNum[v][i][jmax], w[i]));   // (wᵀ Mᵥ)[jmax]
          sol[v] = cdiv(num, w[jmax]);
        }
        if (!satisfies(sol)) continue;
        const nz = (x) => { const r = +x.toFixed(6); return r === 0 ? '0' : String(r); };   // normalize ±0
        const key = vars.map((v) => nz(sol[v].re) + ',' + nz(sol[v].im)).join('|');
        if (seen.has(key)) continue;
        seen.add(key); sols.push(sol);
      }
      if (sols.length > bestSols.length) bestSols = sols;
      if (bestSols.length >= D) break;
    }
    if (!bestSols.length) return { ok: false, reason: 'eigenvalue solve produced no verified solutions (clustered/non-radical?) — use the CAS bridge' };
    return { ok: true, solutions: bestSols, dimension: D, method: 'eigenvalue', complete: bestSols.length >= D };
  }

  // ===========================================================================
  // CERTIFIED REAL-SOLUTION COUNTING (Hermite / trace form).
  // For a zero-dimensional ideal I with quotient A = R/I (dim D), the Hermite
  // bilinear form on the standard-monomial basis B is H[i][j] = trace(M_{b_i·b_j}) =
  // trace(M_{b_i}·M_{b_j}). Over a REAL coefficient field, H is a real symmetric matrix
  // and (Hermite / Pedersen–Roy–Szpirglas):
  //     rank(H)      = number of DISTINCT complex solutions,
  //     signature(H) = number of DISTINCT real solutions.
  // For QD, the REAL solutions are the actual quadrature domains, so this is run on the
  // REAL (reim) system (real-coefficient MPolys in real variables): then every M_v is
  // rational, H is rational symmetric, and its inertia is computed EXACTLY (no floats).
  // ===========================================================================

  // Exact inertia { pos, neg, zero } of a symmetric matrix of Gaussian entries that are
  // real (im = 0). Symmetric LDLᵀ-style congruence; signature = pos − neg, rank = pos + neg.
  // A zero diagonal pivot is handled by FIRST trying a symmetric pivot SWAP with a nonzero
  // trailing diagonal (a permutation congruence — preserves inertia); only when EVERY
  // trailing diagonal is zero do we use a hyperbolic fold (EᵀAE: col/row m into k), which is
  // then SAFE — with A[m][m]=0 the new diagonal is exactly 2·A[k][m] ≠ 0, so it can't cancel.
  // (Folding first is wrong: for [[0,a],[a,b]] with b=−2a it gives 2a+b=0 and would miscount
  // an indefinite direction as a kernel direction.)
  function _rationalInertia(A0) {
    const n = A0.length;
    const A = A0.map((row) => row.map((g) => new Gaussian(g.re, g.im)));   // working copy
    const swapKM = (k, m) => {
      for (let j = 0; j < n; j++) { const t = A[k][j]; A[k][j] = A[m][j]; A[m][j] = t; }
      for (let i = 0; i < n; i++) { const t = A[i][k]; A[i][k] = A[i][m]; A[i][m] = t; }
    };
    let pos = 0, neg = 0, zero = 0, guard = 0;
    for (let k = 0; k < n; k++) {
      if (++guard > 4 * (n + 1) * (n + 1)) throw new Error('realSolutionCount: inertia did not converge');
      if (A[k][k].isZero()) {
        let sw = -1; for (let m = k + 1; m < n; m++) if (!A[m][m].isZero()) { sw = m; break; }
        if (sw !== -1) { swapKM(k, sw); }                   // bring a nonzero diagonal up (inertia-preserving)
        else {                                              // all trailing diagonals zero ⇒ a safe hyperbolic fold
          let m = -1; for (let j = k + 1; j < n; j++) if (!A[k][j].isZero()) { m = j; break; }
          if (m === -1) { zero++; continue; }               // entire remaining row/col is zero ⇒ kernel direction
          for (let i = 0; i < n; i++) A[i][k] = A[i][k].add(A[i][m]);   // col k += col m
          for (let j = 0; j < n; j++) A[k][j] = A[k][j].add(A[m][j]);   // row k += row m ⇒ A[k][k] = 2·A[k][m] ≠ 0
        }
      }
      const piv = A[k][k];
      const s = piv.re.sign();
      if (s > 0) pos++; else if (s < 0) neg++; else { zero++; continue; }   // (defensive; piv is nonzero here)
      for (let i = k + 1; i < n; i++) {
        if (A[i][k].isZero()) continue;
        const f = A[i][k].div(piv);
        for (let j = k; j < n; j++) A[i][j] = A[i][j].sub(f.mul(A[k][j]));   // symmetric Schur update of the trailing block
      }
    }
    return { pos, neg, zero };
  }

  // realSolutionCount(input, order, vars, opts) → { ok, realCount, complexCount,
  // multiplicityCount, reason }. input: an array of MPolys (a system) or { G, order }
  // (a precomputed GB). Counts over the REAL variety — pass the REAL (reim) system for
  // the count to mean "number of quadrature domains"; a non-real-coefficient system is
  // rejected (its trace form is Hermitian over ℚ(i), not the real signature we want).
  function realSolutionCount(input, order, vars, opts) {
    opts = opts || {};
    const fail = (reason) => ({ ok: false, realCount: null, complexCount: null, multiplicityCount: null, reason });
    let G, o, vrs;
    if (Array.isArray(input)) {
      vrs = vars || opts.vars || _ambientVars(input);
      o = _ord(order || monomialOrder('grevlex', vrs));
      try { G = buchberger(input, o, opts); } catch (e) { return fail((e && e.message) || String(e)); }
    } else { G = input.G; o = _ord(input.order); vrs = vars || opts.vars || _ambientVars(G); }
    if (!isZeroDimensional(G, o, vrs)) return fail('the system is not zero-dimensional (infinitely many / a positive-dimensional family)');
    let B;
    try { B = standardMonomials(G, o, vrs); } catch (e) { return fail((e && e.message) || String(e)); }
    if (B === null) return fail('positive-dimensional ideal');
    const D = B.length;
    if (D === 0) return { ok: true, realCount: 0, complexCount: 0, multiplicityCount: 0 };   // I = (1): no solutions
    const MAXDIM = opts.maxHermiteDim != null ? opts.maxHermiteDim : 64;
    if (D > MAXDIM) return fail('quotient dimension ' + D + ' exceeds the Hermite-form cap (' + MAXDIM + ') — use the CAS bridge');

    // Variable multiplication matrices, then M_{b_k} for each basis monomial (the M_v
    // commute, so a monomial's matrix is the product of variable-matrix powers).
    const Mv = {}; for (const v of vrs) Mv[v] = multiplicationMatrix(G, o, vrs, v).M;
    const matMul = (X, Y) => { const C = []; for (let i = 0; i < D; i++) { const r = new Array(D); for (let j = 0; j < D; j++) { let s = Gaussian.fromInt(0); for (let t = 0; t < D; t++) s = s.add(X[i][t].mul(Y[t][j])); r[j] = s; } C.push(r); } return C; };
    const ident = () => { const I = []; for (let i = 0; i < D; i++) { const r = new Array(D); for (let j = 0; j < D; j++) r[j] = Gaussian.fromInt(i === j ? 1 : 0); I.push(r); } return I; };
    // M_{b_k} built bottom-up over the divisibility POSET: the standard monomials are
    // divisor-closed, so every b_k ≠ 1 factors as b_k = b_j·v with b_j ALSO standard (hence
    // already built) — ONE matMul per basis monomial (O(D·D³)) instead of Σ_k deg(b_k) of them
    // (the old per-monomial re-multiply was up to ~O(D⁵)). The M_v commute and matMul is
    // exact-associative over ℚ(i), so these matrices are BIT-IDENTICAL to the old build.
    const idxOf = new Map(); B.forEach((m, k) => idxOf.set(monoKey(m), k));
    const byDeg = B.map((_, k) => k).sort((p, q) => monoTotalDeg(B[p]) - monoTotalDeg(B[q]));
    const Mb = new Array(D);
    for (const k of byDeg) {
      const mono = B[k];
      if (mono.size === 0) { Mb[k] = ident(); continue; }      // b_k = 1 ⇒ identity
      const vn = mono.keys().next().value;                     // any variable dividing b_k
      const pred = new Map(mono); const e = pred.get(vn);
      if (e > 1) pred.set(vn, e - 1); else pred.delete(vn);     // b_k / v — still a standard monomial
      Mb[k] = matMul(Mb[idxOf.get(monoKey(pred))], Mv[vn]);
    }

    // Hermite form H[i][j] = trace(M_{b_i}·M_{b_j}) = Σ_{a,b} M_{b_i}[a][b]·M_{b_j}[b][a].
    const H = []; let hasImag = false;
    for (let i = 0; i < D; i++) H.push(new Array(D));
    for (let i = 0; i < D; i++) {
      for (let j = 0; j <= i; j++) {
        let s = Gaussian.fromInt(0);
        for (let a = 0; a < D; a++) for (let b = 0; b < D; b++) s = s.add(Mb[i][a][b].mul(Mb[j][b][a]));
        if (!s.im.isZero()) hasImag = true;
        H[i][j] = s; H[j][i] = s;
      }
    }
    if (hasImag) return fail('real-solution counting requires a real-coefficient (reim) system');
    const inertia = _rationalInertia(H);
    return { ok: true, realCount: inertia.pos - inertia.neg, complexCount: inertia.pos + inertia.neg, multiplicityCount: D };
  }

  // Parametric real-solution count over ONE real parameter (roadmap #2b-1): the bifurcation of the
  // #real solutions of a family polys(x…, t) = 0 as the parameter t ranges over ℝ. Builds a univariate
  // eliminant f(u,t) of the fiber (a SEPARATING linear form u = Σcᵢxᵢ, eliminated by Gröbner projection —
  // no extraneous factors), takes the real roots of its border polynomial reducedDisc_u(f)·lc_u(f) as the
  // transition CANDIDATES (the real u-root count changes only at a real double root or a root escaping to
  // ±∞; over-inclusion is harmless — a spurious boundary just splits a cell into equal-count halves), then
  // reports the CERTIFIED real count on each open interval by substituting a rational sample and using the
  // Hermite trace form (realSolutionCount) — the ground truth, independent of the eliminant. Returns
  // { ok, paramVar, degree, criticalValues, cells, crosschecked } or { ok:false, reason }. crosschecked =
  // f's own real-u-root count matched Hermite at EVERY sample (⇒ the separating form is valid and the
  // candidate set is trustworthy). Honest labeling: cell counts are = (exact); criticalValues are ≤
  // (isolating rational boxes). One real parameter only; ≥2 is CAD territory (deferred).
  function parametricRealCount1D(polys, paramVar, opts) {
    opts = opts || {};
    polys = (polys || []).filter((p) => p && !p.isZero());
    const fail = (reason) => ({ ok: false, reason });
    if (!polys.length) return fail('empty system');
    const amb = _ambientVars(polys);
    if (amb.indexOf(paramVar) < 0) return fail('parameter "' + paramVar + '" does not appear in the system');
    const solveVars = amb.filter((v) => v !== paramVar);
    if (!solveVars.length) return fail('no solve variables besides the parameter');
    const uName = opts.uName || '_u';
    if (amb.indexOf(uName) >= 0) return fail('reserved eliminant variable "' + uName + '" clashes; pass opts.uName');
    const tol = opts.tol != null ? opts.tol : 1e-9;
    const u = MPoly.variable(uName);
    const genericTs = [1, -1, 2, -2, 3, 5, 7].map((k) => Rational.fromInt(k));
    const subT = (p, t0) => p.subst({ [paramVar]: MPoly.constant(new Gaussian(t0, RZERO)) });
    // distinct real solutions of the fiber at a rational t0 via the Hermite form (authoritative).
    const hermiteAt = (t0) => {
      const sys = polys.map((p) => subT(p, t0)).filter((p) => !p.isZero());
      try { return realSolutionCount(sys, null, solveVars, opts); } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    };
    try {

    // 1) separating univariate eliminant f(u,t): eliminate the solve variables from polys ∪ {u − Σcᵢxᵢ};
    //    accept the first candidate whose squarefree eliminant has deg_u = the generic distinct-solution
    //    count (⇒ u separates the fiber, so no collision is invisible to f).
    let f = null;
    for (const cs of _sepCandidates(solveVars.length, opts.maxTries || 24)) {
      let lin = u;
      solveVars.forEach((v, i) => { if (cs[i]) lin = lin.sub(MPoly.constant(Gaussian.fromInt(cs[i])).mul(MPoly.variable(v))); });
      let gens;
      try { gens = eliminationIdeal(polys.concat([lin]), solveVars, [uName, paramVar], opts); } catch (e) { continue; }
      const uGens = gens.filter((g) => g.vars().has(uName));
      if (!uGens.length) continue;
      let prod = uGens[0]; for (let i = 1; i < uGens.length; i++) prod = prod.mul(uGens[i]);
      prod = squareFreePart(prod, uName);
      const du = prod.degreeIn(uName);
      if (du < 1) continue;
      let sep = false;
      for (const t0 of genericTs) { const h = hermiteAt(t0); if (h.ok && du === h.complexCount) { sep = true; break; } }
      if (sep) { f = prod; break; }
    }
    if (!f) return fail('could not build a separating univariate eliminant (fiber not zero-dimensional over the parameter, or no separating form found)');

    // 2) border polynomial in the parameter: real double root (reducedDisc_u f = 0) ∪ escape to ∞ (lc_u f = 0).
    const disc = reducedDiscriminant(f, uName), lc = _lcInV(f, uName);
    let border = MPoly.fromInt(1);
    if (!disc.isZero() && disc.degreeIn(paramVar) >= 1) border = border.mul(disc);
    if (!lc.isZero() && lc.degreeIn(paramVar) >= 1) border = border.mul(lc);
    if (border.vars().has(uName)) return fail('internal: the border polynomial retained the eliminant variable');
    border = squareFreePart(border, paramVar);
    for (const g of _uniToArr(border, paramVar)) if (!g.im.isZero()) return fail('the family has non-real coefficients — a real-parameter bifurcation is undefined');

    // 3) isolate the critical parameter values (candidates), left-to-right.
    let critical = [];
    if (border.degreeIn(paramVar) >= 1) {
      const iso = realRootIsolate(border, paramVar, { tol });
      if (!iso.ok) return fail('isolation of the border polynomial failed: ' + iso.reason);
      critical = iso.roots.slice().sort((a, b) => a.lo.sub(b.lo).sign());
    }

    // 4) certified count on each open cell. The count is constant on the open interval, so ANY interior
    //    point gives it — EXCEPT a measure-zero degeneracy the border polynomial didn't capture (e.g. a
    //    parameter value where the fiber jumps to positive-dimensional, which realSolutionCount rejects).
    //    So try several interior samples and take the first that yields a zero-dimensional fiber; only if
    //    they all fail is the cell honestly ok:false. Cross-check f's own real-u-root count at that sample.
    const frac = (a, b, num, den) => a.add(b.sub(a).mul(new Rational(BigInt(num), BigInt(den))));
    const fRealRootsAt = (t0) => { const iso = realRootIsolate(subT(f, t0), uName, { tol }); return iso.ok ? iso.count : null; };
    // interior sample candidates for cell i (left→right); the first that gives a zero-dim fiber wins.
    const cellSamples = (i) => {
      if (!critical.length) return genericTs.concat([RZERO]);
      if (i === 0) return [1, 2, 3, 5].map((d) => critical[0].lo.sub(Rational.fromInt(d)));
      if (i === critical.length) return [1, 2, 3, 5].map((d) => critical[i - 1].hi.add(Rational.fromInt(d)));
      const a = critical[i - 1].hi, b = critical[i].lo;
      return [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5]].map(([n, d]) => frac(a, b, n, d));
    };
    const cells = []; let crosschecked = true;
    for (let i = 0; i <= critical.length; i++) {
      let h = { ok: false, reason: 'no interior sample gave a zero-dimensional fiber' }, used = null;
      for (const cand of cellSamples(i)) { if (used === null) used = cand; const hh = hermiteAt(cand); if (hh.ok) { h = hh; used = cand; break; } }
      const fc = h.ok ? fRealRootsAt(used) : null;
      if (h.ok && fc != null && fc !== h.realCount) crosschecked = false;
      cells.push({
        lo: i === 0 ? -Infinity : critical[i - 1].approx,
        hi: i === critical.length ? Infinity : critical[i].approx,
        sample: used != null ? used.toNumber() : null, realCount: h.ok ? h.realCount : null,
        complexCount: h.ok ? h.complexCount : null, ok: !!h.ok, reason: h.ok ? undefined : h.reason,
      });
    }
    return {
      ok: true, paramVar, degree: f.degreeIn(uName),
      criticalValues: critical.map((r) => ({ lo: r.lo.toNumber(), hi: r.hi.toNumber(), exact: !!r.exact, approx: r.approx })),
      cells, crosschecked,
    };
    } catch (e) { return fail((e && e.message) || String(e)); }   // never throw (would crash the worker)
  }

  // The DISCRIMINANT VARIETY (bifurcation set) of a family polys(x…, p₁…p_m) = 0 in PARAMETER space
  // (roadmap #2b-2a / #14): the locus in ℝ^m where the number of real solutions changes. Generalizes the
  // 1-parameter border of parametricRealCount1D to any number of parameters — a separating univariate
  // eliminant f(u, p) of the fiber, then the parameter-space polynomials where f gains a real double root
  // (reducedDisc_u f) or a root escapes to ±∞ (lc_u f). Their union V(disc·lc) is the boundary; off it the
  // real count is locally constant. Returns { ok, paramVars, degree, boundary, components, strata } — the
  // boundary as one MPoly (= 1 when the count never changes), its irreducible factors (the distinct
  // curves/surfaces, via exact factorization), and the two labeled strata — or { ok:false, reason }.
  // Counting per region for m ≥ 2 needs a cell decomposition (CAD / real comprehensive triangular
  // decomposition — the Maple RCTD export); this gives only the exact boundary EQUATION.
  function discriminantVariety(polys, paramVars, opts) {
    opts = opts || {};
    polys = (polys || []).filter((p) => p && !p.isZero());
    const fail = (reason) => ({ ok: false, reason });
    if (!polys.length) return fail('empty system');
    const amb = _ambientVars(polys);
    paramVars = (paramVars || []).slice();
    if (!paramVars.length) return fail('no parameters given');
    for (const p of paramVars) if (amb.indexOf(p) < 0) return fail('parameter "' + p + '" does not appear in the system');
    const solveVars = amb.filter((v) => paramVars.indexOf(v) < 0);
    if (!solveVars.length) return fail('no solve variables besides the parameters');
    const uName = opts.uName || '_u';
    if (amb.indexOf(uName) >= 0) return fail('reserved eliminant variable "' + uName + '" clashes; pass opts.uName');
    try {
      const u = MPoly.variable(uName), keep = [uName].concat(paramVars);
      // separating univariate eliminant f(u, p): take the MAX u-degree over a few candidate forms — the
      // separating form achieves the full fiber size, so max degree ⇒ generically separating (no invisible
      // collision, so no boundary component is missed).
      let f = null, fdeg = -1;
      const cands = [..._sepCandidates(solveVars.length, opts.maxTries || 24)].slice(0, opts.formTries || 6);
      for (const cs of cands) {
        let lin = u;
        solveVars.forEach((v, i) => { if (cs[i]) lin = lin.sub(MPoly.constant(Gaussian.fromInt(cs[i])).mul(MPoly.variable(v))); });
        let gens; try { gens = eliminationIdeal(polys.concat([lin]), solveVars, keep, opts); } catch (e) { continue; }
        const uGens = gens.filter((g) => g.vars().has(uName));
        if (!uGens.length) continue;
        let prod = uGens[0]; for (let i = 1; i < uGens.length; i++) prod = prod.mul(uGens[i]);
        prod = squareFreePart(prod, uName);
        const d = prod.degreeIn(uName);
        if (d > fdeg) { f = prod; fdeg = d; }
      }
      if (!f || fdeg < 1) return fail('could not build a univariate eliminant (fiber not zero-dimensional over the parameters)');

      const disc = reducedDiscriminant(f, uName), lc = _lcInV(f, uName);
      const nonConst = (p) => p && !p.isZero() && p.vars().size > 0 && !p.vars().has(uName);
      const strata = { doubleRoot: nonConst(disc) ? disc : null, escapeToInfinity: nonConst(lc) ? lc : null };
      let boundary = MPoly.fromInt(1);
      if (strata.doubleRoot) boundary = boundary.mul(strata.doubleRoot);
      if (strata.escapeToInfinity) boundary = boundary.mul(strata.escapeToInfinity);
      // irreducible components (distinct boundary curves/surfaces) via exact factorization (the radical).
      const components = [];
      if (boundary.vars().size > 0) {
        let facs = [boundary];
        try { const fr = factor(boundary, opts); if (fr.ok && fr.factors && fr.factors.length) facs = fr.factors; } catch (e) { /* keep unfactored */ }
        for (const g of facs) if (g && g.vars().size > 0) components.push(g);
      }
      return { ok: true, paramVars, degree: fdeg, boundary, components, strata };
    } catch (e) { return fail((e && e.message) || String(e)); }
  }

  // ---------------------------------------------------------------------------
  // reconcileRealCount — a SELF-CHECKING ORACLE pairing the two INDEPENDENT
  // real-solution counters so a silent undercount can't pass as a clean verdict.
  //   • the CERTIFIED count: realSolutionCount(...).realCount — the Hermite trace-form
  //     signature, the exact number of DISTINCT real solutions (no root-finding);
  //   • the EXPLICIT solver: solveZeroDim / solveByEigenvalues — returns the actual
  //     coordinates, but its eigenvalue fallback DELIBERATELY drops a coincident-
  //     projection cluster it can't separate (returns complete:false, keeps only one
  //     null vector per repeated eigenvalue), so its distinct count can UNDERCOUNT.
  // Cross-check the two: prefer the certified count as the authoritative denominator and
  // flag PARTIAL only on a GENUINE miss (found strictly fewer distinct reals than
  // certified). NB `complete:false` alone is NOT a miss — it also fires on any
  // non-radical / multiple ideal whose every distinct solution WAS recovered (D counts
  // with multiplicity, `bestSols` is deduplicated). When no certified count is available
  // (over the Hermite cap), fall back to the raw `complete` flag.
  //   certifiedRealCount : number | null    — realSolutionCount(...).realCount (null ⇒ unknown)
  //   foundSolutions     : [{ var:{re,im} }] — the explicitly-found REAL solutions
  //   complete           : boolean|undefined — solveByEigenvalues completeness (undefined on the shape path)
  // → { certReal, foundDistinct, nReal, partial, disagree, reason }
  //     nReal    — the authoritative distinct-real denominator (certified if available)
  //     partial  — the explicit set is INCOMPLETE (an undercount, or complete:false with
  //                no certified count to check against): the genuine count is a LOWER BOUND
  //     disagree — the explicit set has MORE distinct reals than certified (numeric noise
  //                / a reduction inconsistency): the certified count is authoritative
  //     reason   — 'undercount' | 'incomplete' | 'overcount' | ''
  // ---------------------------------------------------------------------------
  function reconcileRealCount(certifiedRealCount, foundSolutions, complete) {
    const sols = Array.isArray(foundSolutions) ? foundSolutions : [];
    // De-duplicate at 1e-6 so a shape-lemma multiple root (legitimately returned WITH
    // multiplicity by the univariate finder) collapses to one point — the comparison
    // against the certified DISTINCT count is then apples-to-apples. Matches
    // solveByEigenvalues' own dedup granularity (toFixed(6), ±0 normalized).
    const nz = (x) => { const r = +(Number(x)).toFixed(6); return r === 0 ? '0' : String(r); };
    const dkey = (s) => Object.keys(s || {}).sort().map((k) => {
      const z = s[k] || { re: 0, im: 0 };
      return nz(z.re) + ',' + nz(z.im);
    }).join('|');
    const foundDistinct = new Set(sols.map(dkey)).size;
    const certReal = (certifiedRealCount != null && isFinite(certifiedRealCount)) ? certifiedRealCount : null;
    if (certReal == null) {
      // No independent oracle — trust the explicit count, but surface the solver's own
      // incompleteness flag (clustered/near-multiple roots) as PARTIAL.
      const partial = complete === false;
      return { certReal: null, foundDistinct, nReal: foundDistinct, partial, disagree: false, reason: partial ? 'incomplete' : '' };
    }
    if (foundDistinct < certReal) return { certReal, foundDistinct, nReal: certReal, partial: true, disagree: false, reason: 'undercount' };
    if (foundDistinct > certReal) return { certReal, foundDistinct, nReal: certReal, partial: true, disagree: true, reason: 'overcount' };
    return { certReal, foundDistinct, nReal: certReal, partial: false, disagree: false, reason: '' };
  }

  // ===========================================================================
  // G10 — SOS / POSITIVSTELLENSATZ certificate CHECKER (exact over ℚ).
  //
  // Proving a polynomial p NONNEGATIVE is, in general, found by an external SDP solver — but
  // the certificate it returns can be CHECKED exactly and cheaply, with no floating point.
  // This is that checker (the SEARCH stays external; cf. the deferred msolve/CAS bridges).
  // Three certificate shapes (real-coefficient polynomials throughout — SOS is a real notion):
  //   • squares:  { squares: [MPoly | { coeff, poly }] }  ⇒ value = Σ coeffᵢ·polyᵢ²  (coeffᵢ ≥ 0
  //     rational, default 1). A sum of (nonnegative-weighted) squares is manifestly ≥ 0.
  //   • Gram:     { monomials:[MPoly], gram:[[entry]] }   ⇒ value = mᵀ·G·m. Valid iff G is
  //     SYMMETRIC and POSITIVE SEMIDEFINITE — checked EXACTLY via the rational inertia
  //     (PSD ⟺ no negative eigenvalue) reused from the Hermite-trace machinery above.
  //   • Positivstellensatz: { base: cert, constraints:[{ g:MPoly, multiplier: cert }] } ⇒
  //     value = base + Σ gⱼ·multiplierⱼ, where base and every multiplier are themselves SOS
  //     certs (recursively). This certifies p ≥ 0 on the basic closed semialgebraic set
  //     { gⱼ ≥ 0 } (Putinar/Schmüdgen form; the checker does NOT re-derive that the gⱼ cut out
  //     the intended region — it verifies the algebraic identity + the SOS-ness of each piece).
  // verifySOS(p, cert) → { ok, reason, identity (p = Σ exactly), psd (all Gram blocks PSD) }.
  // Entries/coeffs accept a Rational, Gaussian (real), integer Number, or { n, d } pair.
  // ---------------------------------------------------------------------------
  function _toRealGaussian(x) {
    if (x instanceof Gaussian) return x;
    if (x instanceof Rational) return new Gaussian(x, RZERO);
    if (typeof x === 'number' && Number.isInteger(x)) return Gaussian.fromInt(x);
    if (x && x.n !== undefined && x.d !== undefined) return new Gaussian(new Rational(BigInt(x.n), BigInt(x.d)), RZERO);
    if (Array.isArray(x) && x.length === 2) return new Gaussian(new Rational(BigInt(x[0]), BigInt(x[1])), RZERO);
    throw new Error('verifySOS: cannot interpret coefficient ' + JSON.stringify(x));
  }
  // True iff every coefficient of the MPoly is REAL (imaginary part zero). SOS is a real
  // notion — q² ≥ 0 only for a REAL polynomial q (e.g. (i·x)² = −x² ≤ 0), and the rational
  // inertia / PSD test below is sound only for a real symmetric Gram. So both certificate
  // forms must reject complex coefficients, or the checker would accept invalid certificates.
  function _isRealMPoly(p) { for (const t of p.terms.values()) if (!t.coeff.im.isZero()) return false; return true; }
  // Value (MPoly) of one SOS sub-certificate + whether it is a valid SOS (coeffs ≥ 0 / Gram PSD).
  function _sosCertValue(cert) {
    if (!cert || typeof cert !== 'object') return { ok: false, reason: 'missing certificate' };
    if (Array.isArray(cert.squares)) {
      let value = MPoly.zero();
      for (const sq of cert.squares) {
        const poly = (sq instanceof MPoly) ? sq : sq.poly;
        if (!(poly instanceof MPoly)) return { ok: false, reason: 'square entry is not an MPoly' };
        if (!_isRealMPoly(poly)) return { ok: false, reason: 'a square polynomial has non-real (complex) coefficients — q² ≥ 0 holds only for a REAL q' };
        const coeff = (sq instanceof MPoly || sq.coeff == null) ? Gaussian.fromInt(1) : _toRealGaussian(sq.coeff);
        if (!coeff.im.isZero() || coeff.re.sign() < 0) return { ok: false, reason: 'square weight must be a nonnegative real' };
        value = value.add(poly.mul(poly).scale(coeff));
      }
      return { ok: true, value };
    }
    if (Array.isArray(cert.monomials) && Array.isArray(cert.gram)) {
      const m = cert.monomials, G = cert.gram, n = m.length;
      if (G.length !== n || G.some((row) => row.length !== n)) return { ok: false, reason: 'Gram matrix is not ' + n + '×' + n };
      for (const mm of m) if (!(mm instanceof MPoly) || !_isRealMPoly(mm)) return { ok: false, reason: 'a Gram monomial is missing or has non-real (complex) coefficients' };
      const Gg = G.map((row) => row.map(_toRealGaussian));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!Gg[i][j].im.isZero()) return { ok: false, reason: 'Gram matrix has a non-real (complex) entry — SOS requires a real symmetric Gram' };
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!Gg[i][j].sub(Gg[j][i]).isZero()) return { ok: false, reason: 'Gram matrix is not symmetric' };
      let value = MPoly.zero();
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!Gg[i][j].isZero()) value = value.add(m[i].mul(m[j]).scale(Gg[i][j]));
      const inertia = _rationalInertia(Gg);
      if (inertia.neg > 0) return { ok: false, reason: 'Gram matrix is not positive semidefinite (' + inertia.neg + ' negative eigenvalue(s))', value, psd: false };
      return { ok: true, value, psd: true };
    }
    return { ok: false, reason: 'unrecognized certificate shape (expected squares | gram | constraints)' };
  }
  function verifySOS(p, cert, opts) {
    opts = opts || {};
    if (!(p instanceof MPoly)) return { ok: false, reason: 'p must be an MPoly' };
    let psdAll = true, total = MPoly.zero();
    const pieces = [];
    if (cert && Array.isArray(cert.constraints)) {
      const base = cert.base || { squares: [] };
      pieces.push({ g: null, c: base });
      for (const con of cert.constraints) {
        if (!(con.g instanceof MPoly)) return { ok: false, reason: 'each constraint needs a polynomial g (MPoly)' };
        pieces.push({ g: con.g, c: con.multiplier });
      }
    } else {
      pieces.push({ g: null, c: cert });
    }
    for (const pc of pieces) {
      const v = _sosCertValue(pc.c);
      if (!v.value) return { ok: false, reason: v.reason, identity: false, psd: false };   // structural: no value computed
      if (v.psd === false) psdAll = false;                                                  // value present but Gram not PSD
      total = total.add(pc.g ? pc.g.mul(v.value) : v.value);
    }
    const identity = p.sub(total).isZero();
    return { ok: identity && psdAll, identity, psd: psdAll, reason: identity ? (psdAll ? 'verified' : 'a Gram block is not PSD') : 'identity p = Σ does not hold exactly' };
  }

  // ===========================================================================
  // SCHUR–COHN: exact count of polynomial roots inside the open unit disk.
  // For p(z) = a₀ + a₁z + … + a_n z^n (a_n ≠ 0) the Hermitian Schur–Cohn matrix
  //     C = A·Aᴴ − B·Bᴴ,   A = lower-tri Toeplitz of (a₀,…,a_{n−1}),
  //                         B = lower-tri Toeplitz of (ā_n,…,ā₁)
  // (both n×n; A[i][j]=a_{i−j}, B[i][j]=ā_{n−(i−j)} for i≥j, else 0) is Hermitian, and by
  // the Schur–Cohn / Bezoutian theory its inertia counts the roots by location:
  //     #{|z|<1} = (# negative eigenvalues),   #{|z|>1} = (# positive),
  //     #{|z|=1} contributes to the nullity.
  // Computed EXACTLY over ℚ(i) via Hermitian congruence inertia (no floats, no root-
  // finding) — so a clean (nonsingular) C gives a CERTIFIED disk-root count.
  //
  // DEGENERACY (the honest-fallback trigger): a nonzero nullity is AMBIGUOUS. It arises
  // both from genuine on-circle roots AND from SELF-INVERSIVE factors — reciprocal root
  // pairs (r off the circle ⇒ 1/r̄ its mirror), e.g. (z−½)(z−2)=z²−5/2·z+1, which make C
  // singular WITHOUT any on-circle root. The matrix alone cannot tell the two apart, so
  // `schurCohn` reports `degenerate:true` whenever the nullity is positive and the caller
  // must NOT certify from it (fall back to a numeric/separate test). For a nonsingular C
  // the inside/outside split is exact and trustworthy.
  // ===========================================================================

  // Exact inertia { pos, neg, zero } of a HERMITIAN matrix of Gaussian entries (A[i][j] =
  // conj(A[j][i]); the diagonal is real). LDLᴴ-style congruence (Hermitian Schur update).
  // Mirrors _rationalInertia's zero-pivot handling: first a symmetric pivot SWAP to a
  // nonzero trailing diagonal (a permutation congruence — inertia-preserving); only when
  // EVERY trailing diagonal is zero, a Hermitian fold with λ = conj(A[k][m]) (col k += λ·col
  // m; row k += conj(λ)·row m) ⇒ the new diagonal is 2|A[k][m]|² > 0, which cannot cancel.
  function _hermitianInertia(A0) {
    const n = A0.length;
    const A = A0.map((row) => row.map((g) => new Gaussian(g.re, g.im)));   // working copy
    const swapKM = (k, m) => {
      for (let j = 0; j < n; j++) { const t = A[k][j]; A[k][j] = A[m][j]; A[m][j] = t; }
      for (let i = 0; i < n; i++) { const t = A[i][k]; A[i][k] = A[i][m]; A[i][m] = t; }
    };
    let pos = 0, neg = 0, zero = 0, guard = 0;
    for (let k = 0; k < n; k++) {
      if (++guard > 4 * (n + 1) * (n + 1)) throw new Error('schurCohn: inertia did not converge');
      if (A[k][k].isZero()) {
        let sw = -1; for (let m = k + 1; m < n; m++) if (!A[m][m].isZero()) { sw = m; break; }
        if (sw !== -1) { swapKM(k, sw); }                   // bring a nonzero diagonal up (inertia-preserving)
        else {                                              // all trailing diagonals zero ⇒ a safe Hermitian fold
          let m = -1; for (let j = k + 1; j < n; j++) if (!A[k][j].isZero()) { m = j; break; }
          if (m === -1) { zero++; continue; }               // entire remaining row/col is zero ⇒ kernel direction
          const lam = A[k][m].conj(), lamC = A[k][m];        // λ = conj(A[k][m]); conj(λ) = A[k][m]
          for (let i = 0; i < n; i++) A[i][k] = A[i][k].add(lam.mul(A[i][m]));    // col k += λ·col m
          for (let j = 0; j < n; j++) A[k][j] = A[k][j].add(lamC.mul(A[m][j]));   // row k += conj(λ)·row m ⇒ A[k][k] = 2|A[k][m]|²
        }
      }
      const piv = A[k][k];                                  // real (Hermitian diagonal)
      const s = piv.re.sign();
      if (s > 0) pos++; else if (s < 0) neg++; else { zero++; continue; }   // (defensive; piv is nonzero here)
      for (let i = k + 1; i < n; i++) {
        if (A[i][k].isZero()) continue;
        const f = A[i][k].div(piv);                         // piv real ⇒ f = A[i][k]/piv
        for (let j = k; j < n; j++) A[i][j] = A[i][j].sub(f.mul(A[k][j]));   // Hermitian Schur update of the trailing block
      }
    }
    return { pos, neg, zero };
  }

  // Build a univariate MPoly Σ arr[k]·var^k from an ASCENDING Gaussian coeff array.
  function _polyFromCoeffs(arr, varName) {
    let p = mpolyInt(0); const X = mpolyVar(varName);
    for (let k = 0; k < arr.length; k++) if (!arr[k].isZero()) p = p.add(mpolyConst(arr[k]).mul(X.pow(k)));
    return p;
  }

  // unitCircleRootCount(coeffs, opts) → { ok, count } : the number of DISTINCT roots of
  // p(z) = Σ coeffs[k]·z^k (ascending Gaussian array) that lie ON the unit circle |z|=1,
  // computed EXACTLY over ℚ — no floats, no root-finding. Substitute z = x + i·y, split
  // p into its real and imaginary parts (real ℚ coefficients), adjoin the circle relation
  // x²+y²−1 = 0, and count the real solutions via the shipped Hermite trace form
  // (realSolutionCount). The same construction as boundaryDoublePointCount. Returns
  // { ok:false, reason } when realSolutionCount can't (positive-dim / over the Hermite cap).
  // This is the on-circle primitive the degenerate Schur–Cohn (below) and the exact
  // cusp-aware boundary test reuse.
  function unitCircleRootCount(coeffs, opts) {
    let a = (coeffs || []).map((c) => new Gaussian(c.re, c.im));
    while (a.length && a[a.length - 1].isZero()) a.pop();
    const deg = a.length - 1;
    if (deg <= 0) return { ok: true, count: 0 };
    const I = mpolyConst(gaussInt(0, 1));
    const Zc = mpolyVar('x').add(I.mul(mpolyVar('y')));         // z = x + i·y
    let p = mpolyInt(0), zp = mpolyInt(1);
    for (let k = 0; k <= deg; k++) { if (!a[k].isZero()) p = p.add(mpolyConst(a[k]).mul(zp)); if (k < deg) zp = zp.mul(Zc); }
    const circle = mpolyVar('x').pow(2).add(mpolyVar('y').pow(2)).sub(mpolyInt(1));
    const sys = [p.realPart(), p.imagPart(), circle].filter((q) => !q.isZero());
    let rc; try { rc = realSolutionCount(sys, null, ['x', 'y'], opts || {}); }
    catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    if (!rc.ok) return { ok: false, reason: rc.reason };
    return { ok: true, count: rc.realCount };
  }

  // schurCohn(coeffs) → { inside, outside, onCircle, degenerate, degree, resolved? }. coeffs is
  // an ASCENDING Gaussian array [a₀,…,a_n] (trailing zeros trimmed).
  //   • Nonsingular C (nullity 0): inside/outside are the CERTIFIED open-disk/outside counts
  //     WITH MULTIPLICITY, onCircle 0, degenerate false.
  //   • Singular C (the old ambiguous case): resolved EXACTLY by peeling the self-inversive
  //     factor — square-free reduce p̂, form the reciprocal-conjugate p̂†(z)=zᵈ·conj(p̂)(1/z),
  //     s = gcd(p̂,p̂†) (self-inversive: s†=s up to a unit), cofactor q = p̂/s (no circle/paired
  //     roots ⇒ nonsingular ⇒ schurCohn(q) is exact). The on-circle count is
  //     unitCircleRootCount(s); s's remaining roots are reciprocal pairs {ρ,1/ρ̄} splitting
  //     evenly in/out. So onCircle = on, inside = q_in + (deg s − on)/2, outside likewise —
  //     here counting DISTINCT root LOCATIONS (the square-free reduction). `resolved:true`.
  //     `degenerate` is then true IFF onCircle > 0 (a genuine boundary zero — a cusp): the
  //     clean self-inversive case (e.g. (z−½)(z−2): on 0, in 1, out 1) becomes degenerate:false
  //     so callers can trust its in/out split, while a real on-circle zero still reads
  //     degenerate (callers either fall back or treat it as the allowed boundary cusp).
  //   • If the on-circle count is unavailable (positive-dim / over the Hermite cap), fall back
  //     to the legacy honest signal: degenerate:true with the raw (unreliable) inertia counts.
  function schurCohn(coeffs) {
    const Z = Gaussian.fromInt(0);
    let a = (coeffs || []).map((c) => new Gaussian(c.re, c.im));
    while (a.length && a[a.length - 1].isZero()) a.pop();       // trim leading (high-degree) zeros
    const n = a.length - 1;                                     // degree
    if (n <= 0) return { inside: 0, outside: 0, onCircle: 0, degenerate: false, degree: Math.max(n, 0) };
    const A = [], B = [];
    for (let i = 0; i < n; i++) {
      A.push(new Array(n)); B.push(new Array(n));
      for (let j = 0; j < n; j++) {
        if (i >= j) { A[i][j] = a[i - j]; B[i][j] = a[n - (i - j)].conj(); }
        else { A[i][j] = Z; B[i][j] = Z; }
      }
    }
    // C = A·Aᴴ − B·Bᴴ  (Hermitian).
    const C = [];
    for (let i = 0; i < n; i++) {
      C.push(new Array(n));
      for (let k = 0; k < n; k++) {
        let s = Z;
        for (let j = 0; j < n; j++) s = s.add(A[i][j].mul(A[k][j].conj())).sub(B[i][j].mul(B[k][j].conj()));
        C[i][k] = s;
      }
    }
    const inertia = _hermitianInertia(C);
    if (inertia.zero === 0) {
      return { inside: inertia.neg, outside: inertia.pos, onCircle: 0, degenerate: false, degree: n };
    }
    // Singular C ⇒ resolve the on-circle / self-inversive ambiguity exactly (see header).
    try {
      const v = 'z';
      const pHat = squareFreePart(_polyFromCoeffs(a, v), v);
      const aHat = _uniToArr(pHat, v); const dh = aHat.length - 1;
      const star = []; for (let k = 0; k <= dh; k++) star.push(aHat[dh - k].conj());   // p̂†
      const s = univariateGCD(pHat, _polyFromCoeffs(star, v), v);                       // self-inversive part
      const degS = s.degreeIn(v);
      const on = unitCircleRootCount(_uniToArr(s, v));
      if (!on.ok) throw new Error(on.reason || 'on-circle count unavailable');
      if ((degS - on.count) % 2 !== 0) throw new Error('self-inversive split parity');
      const half = (degS - on.count) / 2;
      const qc = schurCohn(_uniToArr(mpolyExactDiv(pHat, s), v));                        // cofactor: nonsingular ⇒ exact
      return { inside: qc.inside + half, outside: qc.outside + half, onCircle: on.count, degenerate: on.count > 0, degree: n, resolved: true };
    } catch (e) {
      // honest fallback: counts unreliable (cap / parity) — preserve the legacy degenerate signal.
      return { inside: inertia.neg, outside: inertia.pos, onCircle: inertia.zero, degenerate: true, degree: n, resolved: false };
    }
  }

  // ===========================================================================
  // G1 — COMPREHENSIVE GRÖBNER SYSTEM (Suzuki–Sato), in-engine.
  //
  // A PARAMETRIC ideal ⟨F⟩ ⊆ ℚ(i)[Ā][X̄] (Ā = parameters, X̄ = the unknowns) does NOT have a
  // single Gröbner basis valid for all parameter values — the leading coefficients are
  // polynomials in Ā that can vanish on subvarieties, changing the basis. A comprehensive
  // Gröbner SYSTEM is a finite list of triples (segment, GB), where each segment is a
  // locally-closed subset of parameter space { ā : eqs(ā)=0, neqs(ā)≠0 } and `gb`
  // SPECIALIZES to a Gröbner basis of ⟨F(ā,·)⟩ for EVERY ā in that segment; the segments
  // disjointly cover all of parameter space. This is the in-engine cousin of the deferred
  // RCTD bridge — for the cardioid the relevant (M₀,M₁) family is tiny.
  //
  // ALGORITHM (Suzuki–Sato 2006, "A simple algorithm to compute comprehensive Gröbner bases
  // using Gröbner bases"): compute the reduced GB of F ∪ eqs over ℚ(i)[Ā,X̄] under a BLOCK
  // order with X̄ ≫ Ā (so leading monomials live in X̄, their coefficients in Ā). Classify:
  //   • G0 = generators whose leading monomial avoids X̄ ⇒ pure-parameter polynomials in the
  //     ideal. Where some g0 ≠ 0 the specialized ideal is ⟨1⟩ (no solutions; gb = {1}); where
  //     ALL g0 = 0 we descend.
  //   • Gm = the rest. Let h = ∏ (X̄-leading coefficient of g) ∈ ℚ(i)[Ā]. On {all g0=0, h≠0}
  //     Gm is a faithful GB (the generic stratum). On {all g0=0, h=0} recurse (h added to eqs)
  //     — a strictly larger parameter ideal, so the recursion terminates (Noetherian).
  // The branches form a DISJOINT cover. Consistency of each segment (is V(eqs)\V(∏neqs)
  // nonempty over ℂ?) is the Rabinowitsch test 1 ∉ ⟨eqs, 1−w·∏neqs⟩.
  //
  // SCOPE / honesty: segments are over the ALGEBRAICALLY CLOSED field (params ∈ ℂ); the
  // real-existence refinement is G2/realSolutionCount territory. Defective strata (all X̄-
  // leading coefficients vanishing identically on a sub-stratum) are emitted with
  // `defective:true` rather than split further. Capped (maxSegments / maxDepth / GB caps) →
  // { ok:false, reason } past the cap. ⚠ MATH-REVIEW NOTE (Andrew): full Suzuki–Sato is
  // subtle; this implementation is verified by SAMPLING (each segment's gb specializes to the
  // freshly-computed GB at random in-segment points) but not machine-proved — flagged for
  // your review like the RUR (G6). Refs: Suzuki–Sato 2006; Kapur–Sun–Wang 2010.
  // ---------------------------------------------------------------------------
  // X̄-leading coefficient (a polynomial in Ā): group g's terms by the X̄-part of its leading
  // monomial under `order`, strip the X̄ part. (The full leading term is monic in a reduced
  // GB, but the X̄-leading coefficient still collects a nontrivial Ā-polynomial.)
  function _xLeadCoeffA(g, xset, order) {
    const lm = g.leadingMono(order);
    const mx = new Map(); for (const [k, e] of lm) if (xset.has(k)) mx.set(k, e);
    const res = new MPoly();
    for (const t of g.terms.values()) {
      let ok = true;
      for (const [k, e] of t.mono) if (xset.has(k) && (mx.get(k) || 0) !== e) { ok = false; break; }
      if (ok) for (const [k, e] of mx) if ((t.mono.get(k) || 0) !== e) { ok = false; break; }
      if (!ok) continue;
      const aMono = new Map(); for (const [k, e] of t.mono) if (!xset.has(k)) aMono.set(k, e);
      res._addTerm(aMono, t.coeff);
    }
    return res;
  }
  // 1 ∈ ⟨polys⟩ ? (the ideal is the whole ring). A nonzero constant generator, or a constant
  // in the reduced GB.
  function _oneInIdeal(polys) {
    const c = (polys || []).filter((p) => p && !p.isZero());
    if (!c.length) return false;
    if (c.some((p) => p.vars().size === 0)) return true;
    const G = buchberger(c, monomialOrder('grevlex'));
    return G.some((g) => !g.isZero() && g.vars().size === 0);
  }
  // Is the segment { eqs = 0, ∏neqs ≠ 0 } nonempty over ℂ? ⟺ ∏neqs ∉ √⟨eqs⟩ ⟺
  // 1 ∉ ⟨eqs, 1 − w·∏neqs⟩ (Rabinowitsch, fresh w).
  function _cgsConsistent(eqs, neqs) {
    let N = MPoly.fromInt(1);
    for (const n of (neqs || [])) { if (!n || n.isZero()) return false; N = N.mul(n); }
    const rab = MPoly.fromInt(1).sub(MPoly.variable('__cgs_w').mul(N));
    return !_oneInIdeal((eqs || []).concat([rab]));
  }
  function _cgsRec(F, eqs, neqs, xset, ordBlock, state, depth) {
    if (state.calls++ > state.maxCalls || depth > state.maxDepth || state.segs > state.maxSegs) { state.capped = true; return []; }
    if (!_cgsConsistent(eqs, neqs)) return [];
    const G = buchberger(F.concat(eqs), ordBlock);
    if (G.some((g) => !g.isZero() && g.vars().size === 0)) {   // 1 ∈ ideal ⇒ no solutions here
      state.segs++; return [{ eqs: eqs.slice(), neqs: neqs.slice(), gb: [MPoly.fromInt(1)], empty: true }];
    }
    const Gm = [], G0 = [];
    for (const g of G) {
      const lm = g.leadingMono(ordBlock);
      let hasX = false; for (const k of lm.keys()) if (xset.has(k)) { hasX = true; break; }
      (hasX ? Gm : G0).push(g);
    }
    const out = [];
    // region where some pure-parameter g0 ≠ 0 ⇒ specialized ideal = ⟨1⟩ (no solutions)
    const accum = eqs.slice();
    for (let j = 0; j < G0.length; j++) {
      if (_cgsConsistent(accum, neqs.concat([G0[j]]))) {
        state.segs++; out.push({ eqs: accum.slice(), neqs: neqs.concat([G0[j]]), gb: [MPoly.fromInt(1)], empty: true });
      }
      accum.push(G0[j]);                                       // descend into {g0_0..g0_j = 0}
    }
    // region where ALL g0 = 0 (accum = eqs ∪ G0):
    if (!Gm.length) {                                          // F reduced to 0 ⇒ zero ideal, whole X̄-space
      if (_cgsConsistent(accum, neqs)) { state.segs++; out.push({ eqs: accum.slice(), neqs: neqs.slice(), gb: [] }); }
      return out;
    }
    const lcs = Gm.map((g) => _xLeadCoeffA(g, xset, ordBlock));
    let h = MPoly.fromInt(1); for (const c of lcs) h = h.mul(c);
    // generic stratum: all leading coefficients nonzero ⇒ Gm is a faithful GB
    if (_cgsConsistent(accum, neqs.concat([h]))) { state.segs++; out.push({ eqs: accum.slice(), neqs: neqs.concat([h]), gb: Gm }); }
    // degenerate stratum h = 0: recurse only if it STRICTLY grows the parameter ideal
    // (else it would be an infinite loop on a defective stratum — emit it honestly instead).
    const gAccum = buchberger(accum.length ? accum : [MPoly.zero()], monomialOrder('grevlex'));
    const hRed = accum.length ? normalForm(h, gAccum, monomialOrder('grevlex')) : h;
    if (!hRed.isZero()) {
      out.push.apply(out, _cgsRec(F, accum.concat([h]), neqs, xset, ordBlock, state, depth + 1));
    } else if (_cgsConsistent(accum, neqs)) {
      state.segs++; state.defective = true;
      out.push({ eqs: accum.slice(), neqs: neqs.slice(), gb: Gm, defective: true });
    }
    return out;
  }
  // comprehensiveGroebnerSystem(F, params, opts) → { ok, params, variables, segments:[{ eqs,
  // neqs, gb, empty?, defective? }], defective }. params = the parameter variable NAMES (Ā);
  // every other variable in F is an unknown (X̄). Each segment's `gb` specializes to a Gröbner
  // basis of ⟨F⟩ at every parameter point with eqs=0 ∧ each neq≠0; `empty` ⇒ gb {1} (no
  // solutions there). Caps → { ok:false, reason }.
  function comprehensiveGroebnerSystem(F, params, opts) {
    opts = opts || {};
    const polys = (F || []).filter((p) => p && !p.isZero());
    if (!polys.length) return { ok: true, params: (params || []).slice(), variables: [], segments: [{ eqs: [], neqs: [], gb: [] }], defective: false };
    const allVars = new Set(); for (const p of polys) for (const v of p.vars()) allVars.add(v);
    const paramSet = new Set(params || []);
    const xs = [...allVars].filter((v) => !paramSet.has(v)).sort();
    if (!xs.length) return { ok: false, reason: 'no non-parameter variables to solve for' };
    const xset = new Set(xs);
    const ordBlock = monomialOrder('block', [xs.slice(), [...paramSet].sort()]);
    const state = {
      calls: 0, segs: 0, defective: false, capped: false,
      maxCalls: opts.maxCalls != null ? opts.maxCalls : 400,
      maxSegs: opts.maxSegments != null ? opts.maxSegments : 96,
      maxDepth: opts.maxDepth != null ? opts.maxDepth : 32,
    };
    let segments;
    try { segments = _cgsRec(polys, [], [], xset, ordBlock, state, 0); }
    catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    if (state.capped) return { ok: false, reason: 'comprehensive Gröbner system exceeded the segment/recursion cap; use CAS export' };
    return { ok: true, params: [...paramSet], variables: xs, segments, defective: state.defective };
  }

  // ===========================================================================
  // RESOLVENT — the univariate eliminant of a zero-dimensional ideal in one variable.
  // For I zero-dimensional and a variable v, the resolvent is the CHARACTERISTIC POLYNOMIAL of
  // multiplication-by-v on the quotient A = R/I (dim D):  χ_v(x) = det(x·I − M_v). Its roots
  // are the v-coordinates of the solutions, with algebraic multiplicity = the quotient
  // multiplicity. Reading it off:
  //   • squareFreePart(χ_v) = the DISTINCT v-values (the minimal polynomial of v on A);
  //   • a REPEATED root (squareFree drops degree ⇔ disc χ_v = 0) ⇔ COINCIDENT solutions / a
  //     degeneracy. When v SEPARATES the solutions (shape position) this is a genuine
  //     degeneracy — e.g. the cusp, where the cardioid resolvent 2s³−3s²+1 = (s−1)²(2s+1) has a
  //     double root; otherwise a repeat is just fibre multiplicity from projecting onto v.
  // Built from shipped primitives (multiplicationMatrix → Bareiss mpolyDet → squareFreePart);
  // the multiplicationMatrix caps (positive-dim throw, Hermite dim) propagate as { ok:false }.
  // `degenerate` is exact and cap-free (from squareFreePart's gcd); the `discriminant` polynomial
  // is best-effort (null if its Sylvester matrix exceeds the resultant cap).
  // ===========================================================================
  function resolvent(input, varName, vars, opts) {
    opts = opts || {};
    const fail = (reason) => ({ ok: false, reason });
    if (!varName) return fail('resolvent: no variable given');
    let G, o, vrs;
    if (Array.isArray(input)) {
      vrs = vars || opts.vars || _ambientVars(input);
      o = _ord(opts.order || monomialOrder('grevlex', vrs));
      try { G = buchberger(input, o, opts); } catch (e) { return fail((e && e.message) || String(e)); }
    } else { G = input.G; o = _ord(input.order); vrs = vars || opts.vars || _ambientVars(G); }
    if (vrs.indexOf(varName) === -1) return fail('resolvent: variable "' + varName + '" is not in the system');
    if (!isZeroDimensional(G, o, vrs)) return fail('the system is not zero-dimensional (positive-dimensional family) — no finite resolvent');
    let mm;
    try { mm = multiplicationMatrix(G, o, vrs, varName); } catch (e) { return fail((e && e.message) || String(e)); }
    const D = mm.D, M = mm.M;
    if (D === 0) return { ok: true, poly: MPoly.fromInt(1), degree: 0, squareFree: MPoly.fromInt(1), distinctDegree: 0, discriminant: MPoly.fromInt(0), degenerate: false, dimension: 0 };
    // χ_v(x) = det(x·I − M_v): the M entries are Gaussian constants, so this is univariate in v.
    const xv = MPoly.variable(varName);
    const negC = (g) => MPoly.constant(g.mul(Gaussian.fromInt(-1)));
    const mat = [];
    for (let i = 0; i < D; i++) {
      const row = new Array(D);
      for (let j = 0; j < D; j++) row[j] = (i === j) ? xv.add(negC(M[i][j])) : negC(M[i][j]);
      mat.push(row);
    }
    const chi = mpolyDet(mat);
    const sf = squareFreePart(chi, varName);
    const deg = chi.degreeIn(varName), sdeg = sf.degreeIn(varName);
    let disc = null;                                   // the discriminant polynomial (best-effort)
    try { disc = resultant(chi, chi.derivativeIn(varName), varName, 2 * deg + 2); } catch (e) { disc = null; }
    return { ok: true, poly: chi, degree: deg, squareFree: sf, distinctDegree: sdeg, discriminant: disc, degenerate: sdeg < deg, dimension: D };
  }

  // ===========================================================================
  // TRIANGULAR DECOMPOSITION (Wu-style successive pseudo-elimination).
  // An ALTERNATIVE eliminator to Gröbner: produce a TRIANGULAR set (one polynomial
  // per variable, each with a leading initial in the lower variables) by Ritt
  // pseudo-remainder elimination, top variable first. Often far cheaper than a full
  // Gröbner basis on structured systems, and it exhibits the solution structure
  // directly: the lowest-variable polynomial's roots, back-substituted, parameterize
  // the set; a nonzero constant ⇒ no solution (off the initials); a variable that is
  // never a main variable ⇒ free ⇒ a positive-dimensional family. Complements (does NOT
  // replace) the Gröbner solve path — the reduced GB stays the correctness oracle.
  // ===========================================================================

  // Ritt pseudo-remainder prem(f, g) w.r.t. varName, in k(other vars)[varName]: the
  // remainder of pseudo-dividing f by g (lc(g)^{deg f − deg g + 1}·f = q·g + prem),
  // built from lc(g)·f − lc_r·x^{Δ}·g steps (polynomial, exact — no division).
  function pseudoRemainder(f, g, varName) {
    const dg = g.degreeIn(varName);
    if (dg < 0) throw new Error('pseudoRemainder: divisor is zero in ' + varName);
    if (dg === 0) return MPoly.zero();          // g is a unit in varName ⇒ remainder 0
    const lcg = g.coeffsIn(varName)[dg];          // initial of g (a poly in the other vars)
    const xv = MPoly.variable(varName);
    let r = f, guard = 0;
    while (true) {
      const dr = r.degreeIn(varName);
      if (dr < dg) return r;
      if (++guard > 1e6) throw new Error('pseudoRemainder: non-terminating');
      const lcr = r.coeffsIn(varName)[dr];        // leading coeff of r in varName
      r = r.mul(lcg).sub(lcr.mul(xv.pow(dr - dg)).mul(g));   // r ← lc(g)·r − lc(r)·x^{dr−dg}·g
    }
  }

  // triangularize(polys, varOrder, opts) → { ok, chain:[MPoly] (low variable LAST → solve
  // bottom-up: chain is ordered with the lowest-ranked main variable FIRST), initials,
  // mainVars, freeVars, contradiction, reason }. varOrder ranks variables highest→lowest
  // (varOrder[0] is eliminated first); defaults to the ambient variables. ⚠ The chain is
  // TRIANGULAR, NOT a regular chain: it is not saturated by the pivots' initials, so where an
  // initial vanishes the chain may describe a SUPERSET (spurious branches) or MISS components.
  // The returned `initials` / `mainVars` are provided so the caller can check them — the chain
  // is UNCERTIFIED without that check (it is not on the primary solveZeroDim path). Caps mirror
  // the engine idiom (rounds / degree / terms) and throw "use CAS export"; the boundary
  // catches them into { ok:false, reason }.
  function triangularize(polys, varOrder, opts) {
    opts = opts || {};
    try {
      const MAXROUNDS = opts.maxRounds != null ? opts.maxRounds : 64;
      const MAXDEG = opts.maxDegree != null ? opts.maxDegree : 200;
      const MAXTERMS = opts.maxTerms != null ? opts.maxTerms : 100000;
      const vord = (varOrder && varOrder.length) ? varOrder.slice() : _ambientVars(polys);
      const rankOf = {}; vord.forEach((v, i) => { rankOf[v] = i; });
      const mainVar = (p) => {
        let best = null, bestRank = Infinity;
        for (const v of p.vars()) { const r = rankOf[v]; if (r != null && r < bestRank) { bestRank = r; best = v; } }
        return best;
      };
      const tooBig = (p) => p.totalDegree() > MAXDEG || p.size() > MAXTERMS;
      const contradiction = () => ({ ok: true, chain: [], initials: [], mainVars: [], freeVars: [], contradiction: true });

      let work = (polys || []).filter((p) => p && !p.isZero());
      for (const p of work) if (p.vars().size === 0) return contradiction();   // a nonzero constant in the input
      const chain = [];
      for (let ri = 0; ri < vord.length; ri++) {
        const v = vord[ri];
        let withV = work.filter((p) => mainVar(p) === v);
        const without = work.filter((p) => mainVar(p) !== v);
        if (!withV.length) continue;            // no constraint with main var v ⇒ v stays free
        let guard = 0;
        while (withV.length > 1) {
          if (++guard > MAXROUNDS * (withV.length + 1)) throw new Error('triangularize: exceeded the elimination-round cap; use CAS export.');
          withV.sort((a, b) => a.degreeIn(v) - b.degreeIn(v));
          const pivot = withV[0];
          const next = [pivot];
          for (let i = 1; i < withV.length; i++) {
            const r = pseudoRemainder(withV[i], pivot, v);
            if (r.isZero()) continue;
            if (tooBig(r)) throw new Error('triangularize: an intermediate polynomial exceeds the size cap; use CAS export.');
            if (r.vars().size === 0) return contradiction();   // pseudo-remainder collapsed to a nonzero constant
            if (mainVar(r) === v) next.push(r); else without.push(r);
          }
          withV = next;
        }
        const g = withV[0];
        if (g.vars().size === 0) return contradiction();
        chain.push(g);
        work = without;                          // v eliminated from the rest; descend
      }
      for (const p of work) if (p.vars().size === 0) return contradiction();
      // order the chain lowest-ranked main variable FIRST (bottom-up solve order)
      chain.sort((a, b) => rankOf[mainVar(b)] - rankOf[mainVar(a)]);
      const mainVars = chain.map(mainVar);
      const initials = chain.map((g) => g.coeffsIn(mainVar(g))[g.degreeIn(mainVar(g))]);
      const freeVars = vord.filter((v) => mainVars.indexOf(v) === -1);
      return { ok: true, chain, initials, mainVars, freeVars, contradiction: false };
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
  }

  // MINIMAL PRIMES (irreducible components) of V(⟨polys⟩) by FACTORIZING BUCHBERGER (facstd-style):
  // compute a Gröbner basis; whenever a basis element factors g = ∏fᵢ into ≥2 distinct irreducible
  // factors (the exact ℚ(i) factorizer), the variety splits V(I) = ⋃ V(I + ⟨fᵢ⟩), so recurse on each
  // I + ⟨fᵢ⟩. A basis with no reducibly-factoring element is a LEAF component; principal leaves ⟨g⟩ are
  // radicalized to ⟨squarefree g⟩, and the redundant leaves (whose variety is contained in another's,
  // by ideal containment) are pruned. Returns { ok, primes:[[MPoly]], complete, count } — each prime is
  // a reduced Gröbner basis. `complete` is false if a cost cap was hit; it finds the MINIMAL primes
  // (the irreducible components) — NOT embedded primes or multiplicities (full primary decomposition /
  // GTZ), which don't change V(I) and need the CAS route. A non-principal, non-radical leaf is returned
  // verbatim (a primary-not-prime piece) — flagged by complete only when a cap forced it.
  function minimalPrimes(polys, opts) {
    opts = opts || {};
    const src = (polys || []).filter((p) => p && !p.isZero());
    const vars = opts.vars || _ambientVars(src);
    const order = _ord(opts.order || monomialOrder('grevlex', vars));
    const maxComps = opts.maxComponents != null ? opts.maxComponents : 64;
    const maxSteps = opts.maxSteps != null ? opts.maxSteps : 500;
    const polyCanon = (g) => g.termList()
      .map((t) => Object.entries(t.mono).sort().map((e) => e[0] + '^' + e[1]).join('*') + ':' + t.coeff.re.join('/') + ',' + t.coeff.im.join('/'))
      .sort().join(' ');
    const gbKey = (G) => G.map(polyCanon).sort().join('|');
    const isUnit = (G) => G.length === 1 && G[0].vars().size === 0 && !G[0].isZero();
    const reduce = (gens) => reduceGroebner(buchberger(gens.filter((g) => g && !g.isZero()), order, opts), order);
    const factorsOf = (g) => { let fr; try { fr = factor(g, opts); } catch (e) { fr = null; } return (fr && fr.ok && fr.factors ? fr.factors : []).filter((f) => f && f.vars().size > 0); };

    if (!src.length) return { ok: true, primes: [[]], complete: true, count: 1, note: 'the zero ideal — V(I) is the whole space' };
    const G0 = reduce(src);
    if (isUnit(G0)) return { ok: true, primes: [], complete: true, count: 0, note: 'inconsistent (1 ∈ I) — the variety is empty' };

    let complete = true;
    const work = [G0], seen = new Set([gbKey(G0)]), leaves = [];
    let steps = 0;
    try {
      while (work.length) {
        if (++steps > maxSteps || leaves.length + work.length > maxComps) { complete = false; while (work.length) leaves.push(work.pop()); break; }
        const G = work.pop();
        let split = null;
        for (const g of G) { const facs = factorsOf(g); if (facs.length >= 2) { split = facs; break; } }
        if (!split) { leaves.push(G); continue; }                        // no factoring generator ⇒ a component
        for (const f of split) {                                          // V(I) = ⋃ V(I + ⟨fᵢ⟩)
          const H = reduce(G.concat([f]));
          if (isUnit(H)) continue;
          const k = gbKey(H);
          if (!seen.has(k)) { seen.add(k); work.push(H); }
        }
      }
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }

    // radicalize principal leaves ⟨g⟩ → ⟨∏ distinct factors⟩; then dedupe (exact + containment: drop a
    // component I when another J ⊆ I, i.e. V(I) ⊆ V(J), so I adds nothing).
    const norm = [];
    for (let G of leaves) {
      if (G.length === 1) {
        const g0 = G[0], facs = factorsOf(g0);
        let rad = null;
        if (facs.length >= 1) { rad = facs[0]; for (let i = 1; i < facs.length; i++) rad = rad.mul(facs[i]); }       // ∏ distinct factors
        else { const vs = [...g0.vars()]; if (vs.length === 1) rad = squareFreePart(g0, vs[0]); }                    // pure power the factorizer won't split
        if (rad) G = reduce([rad]);
      }
      if (!isUnit(G) && G.length) norm.push(G);
    }
    const uniq = [], keys = new Set();
    for (const G of norm) { const k = gbKey(G); if (!keys.has(k)) { keys.add(k); uniq.push(G); } }
    const keep = [];
    for (let i = 0; i < uniq.length; i++) {
      let redundant = false;
      for (let j = 0; j < uniq.length && !redundant; j++) {
        if (i === j) continue;
        if (uniq[j].every((g) => { try { return inIdeal(g, uniq[i], order); } catch (e) { return false; } })) redundant = true;
      }
      if (!redundant) keep.push(uniq[i]);
    }
    // Honest completeness: complete is true only when it terminated AND every component is provably
    // prime. A principal ideal ⟨g⟩ is prime ⟺ g is irreducible over ℚ(i) (ℚ(i)[x…] is a UFD). The
    // factorizer now reaches monomial + variable-disjoint + univariate AND genuine BIVARIATE (Gao,
    // roadmap #19), so a squarefree irreducible univariate OR bivariate hypersurface is certified prime;
    // a linear ideal is prime; anything else (a leaf that may split further) leaves complete:false.
    const isCertPrime = (G) => {
      if (G.every((g) => g.totalDegree() <= 1)) return true;                    // a linear ideal is prime
      if (G.length === 1) {
        const g = G[0], vs = [...g.vars()];
        if (vs.length === 1) { const sf = squareFreePart(g, vs[0]); return sf.degreeIn(vs[0]) === g.degreeIn(vs[0]) && factorsOf(g).length <= 1; }
        if (vs.length === 2) {                                                  // ⟨g⟩ prime ⟺ g irreducible over ℚ(i)
          try {
            let xv = vs[0], yv = vs[1];
            if (!bivariateSquarefreeInX(g, xv)) { if (bivariateSquarefreeInX(g, yv)) { xv = vs[1]; yv = vs[0]; } else return false; }
            if (g.degreeIn(xv) < 1 || g.degreeIn(yv) < 1) return false;
            const fr = factorBivariate(g, xv, yv);                              // squarefree + ONE ℚ(i) factor + unit content ⇒ irreducible
            return fr.ok && fr.complete && fr.factors.length === 1 && fr.content.vars().size === 0;
          } catch (e) { return false; }
        }
      }
      return false;
    };
    if (complete) complete = keep.every(isCertPrime);
    return { ok: true, primes: keep, complete, count: keep.length };
  }

  // TRIANGULAR DECOMPOSITION of V(⟨polys⟩) into REGULAR CHAINS (roadmap #13): a set of triangular
  // sets whose zero sets union to V(I), each solvable by back-substitution (solve the lowest-ranked
  // main variable, substitute up). Built by decomposing into irreducible components (minimalPrimes,
  // #12) and triangularizing each — so V(I) = ⋃ V(componentᵢ) = ⋃ (the chains). Returns
  // { ok, chains:[{ chain:[MPoly], mainVars, freeVars, initials, whole? }], complete, count } — `complete`
  // inherits minimalPrimes' honesty. With the genuine bivariate factorizer (Gao, roadmap #19) a plane-curve
  // component is now split into its irreducible pieces and each certified prime, so `complete:true` covers
  // the univariate + bivariate hypersurface cases; only higher-codimension nonlinear leaves may keep it false.
  function triangularDecomposition(polys, opts) {
    opts = opts || {};
    const src = (polys || []).filter((p) => p && !p.isZero());
    const vars = opts.vars || _ambientVars(src);
    const varOrder = opts.varOrder || vars;
    const mp = minimalPrimes(src, Object.assign({}, opts, { vars }));
    if (!mp.ok) return { ok: false, reason: mp.reason };
    const chains = [];
    try {
      for (const gens of mp.primes) {
        if (!gens.length) { chains.push({ chain: [], mainVars: [], freeVars: varOrder.slice(), initials: [], whole: true }); continue; }  // ⟨0⟩ → whole space
        const tri = triangularize(gens, varOrder, opts);
        if (!tri.ok) return { ok: false, reason: 'triangularize failed on a component: ' + tri.reason };
        if (tri.contradiction) continue;                              // an empty component (not expected for a prime)
        chains.push({ chain: tri.chain, mainVars: tri.mainVars, freeVars: tri.freeVars, initials: tri.initials });
      }
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    return { ok: true, chains, complete: mp.complete, count: chains.length };
  }

  // Degree-d homogenization of f(x,y) with a fresh variable Z: each term of (affine) degree e gains Z^{d−e}.
  function _homogenize(f, d, zVar) {
    let out = MPoly.zero();
    for (const t of f.termList()) {
      const e = Object.values(t.mono).reduce((s, x) => s + x, 0);
      const mono = Object.assign({}, t.mono);
      if (d - e > 0) mono[zVar] = (mono[zVar] || 0) + (d - e);
      out = out.add(MPoly.fromTermList([{ coeff: t.coeff, mono }]));
    }
    return out;
  }

  // Geometric GENUS + rationality of a plane algebraic curve f(x,y) = 0 (roadmap #15). The genus formula
  // needs an (absolutely) irreducible curve; the smoothness test already enforces this for the genus VALUE
  // (a reducible projective plane curve self-intersects by Bézout ⇒ singular ⇒ genus:null), and the exact
  // absolute-irreducibility is now REPORTED as `irreducible` via the bivariate factorizer (roadmap #19).
  // For a SMOOTH curve of degree d the geometric genus is EXACTLY the
  // arithmetic genus (d−1)(d−2)/2; a line or conic (d ≤ 2) is always rational (genus 0); a smooth
  // curve of degree ≥ 3 has positive genus, so it is NOT rational. Smoothness is tested EXACTLY and
  // PROJECTIVELY: homogenize F(x,y,Z), and the projective curve is smooth ⟺ the Jacobian ideal
  // ⟨Fₓ, F_y, F_Z⟩ vanishes only at the origin ⟺ it is zero-dimensional (else the cone over a
  // projective singular point makes it positive-dimensional). A SINGULAR curve''s geometric genus is
  // (d−1)(d−2)/2 − Σδ_P < the arithmetic genus; computing Σδ (⇒ the exact genus and any rational
  // parametrization) needs Puiseux singularity resolution — deferred — so the singular case returns
  // genus:null with arithmeticGenus as an upper bound and singular:true (its cusps/nodes).
  // Returns { ok, degree, arithmeticGenus, smooth, singular, genus, rational, note } or { ok:false }.
  function curveGenus(f, xVar, yVar, opts) {
    opts = opts || {};
    if (!(f instanceof MPoly) || f.isZero()) return { ok: false, reason: 'expected a nonzero curve polynomial' };
    for (const v of f.vars()) if (v !== xVar && v !== yVar) return { ok: false, reason: 'not a plane curve in (' + xVar + ',' + yVar + '): extra variable "' + v + '"' };
    const d = f.totalDegree();
    if (d < 1) return { ok: false, reason: 'the curve is constant' };
    const zVar = opts.zVar || '_Z';
    if (zVar === xVar || zVar === yVar) return { ok: false, reason: 'homogenizing variable "' + zVar + '" clashes; pass opts.zVar' };
    const pa = Math.max(0, (d - 1) * (d - 2) / 2);   // (also normalizes the d=1 line's −0 to +0)
    // Absolute irreducibility (roadmap #19), reported alongside the genus: true / false / null (undetermined,
    // e.g. a curve missing a variable, or not squarefree so the count's precondition fails). A line (d=1) is
    // irreducible by inspection. This is the precondition the smooth-genus formula assumes made explicit.
    let irreducible = (d === 1) ? true : null;
    if (irreducible === null && f.degreeIn(xVar) >= 1 && f.degreeIn(yVar) >= 1) {
      try {
        let xv = xVar, yv = yVar;
        if (!bivariateSquarefreeInX(f, xv)) { if (bivariateSquarefreeInX(f, yv)) { xv = yVar; yv = xVar; } else xv = null; }
        if (xv) irreducible = bivariateAbsFactorCount(f, xv, yv) === 1;
      } catch (e) { irreducible = null; }
    }
    try {
      const F = _homogenize(f, d, zVar);
      const jac = [F.derivativeIn(xVar), F.derivativeIn(yVar), F.derivativeIn(zVar)].filter((g) => g && !g.isZero());
      const order = _ord(monomialOrder('grevlex', [xVar, yVar, zVar]));
      const smooth = jac.length ? isZeroDimensional(buchberger(jac, order, opts), order, [xVar, yVar, zVar]) : false;
      let genus, rational, note;
      if (irreducible === false) { genus = null; rational = null; note = 'absolutely REDUCIBLE (' + d + ' components over ℂ) — the geometric genus is per irreducible component; factor the curve first'; }
      else if (pa === 0) { genus = 0; rational = true; note = (d === 1 ? 'a line' : 'a conic') + ' — rational (genus 0)'; }
      else if (smooth) { genus = pa; rational = false; note = 'smooth degree-' + d + ' curve — genus ' + pa + ' > 0, not rational'; }
      else { genus = null; rational = null; note = 'singular — geometric genus = ' + pa + ' − Σδ_P (< ' + pa + '); the exact genus and any rational parametrization need Puiseux singularity resolution (deferred)'; }
      return { ok: true, degree: d, arithmeticGenus: pa, smooth, singular: !smooth, irreducible, genus, rational, note };
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
  }

  // ---------------------------------------------------------------------------
  // runJob — a serialization-friendly op dispatcher: takes SERIALIZED input (term
  // lists from MPoly.termList, an order spec) and returns SERIALIZED output, so the
  // SAME code runs on the main thread or inside a Web Worker (sym-worker.js) with no
  // class instances crossing the postMessage boundary. onProgress(info) is forwarded
  // to Buchberger (the worker throttles + posts it back). This is the single source
  // of truth for the offloaded heavy ops.
  // ---------------------------------------------------------------------------
  function _orderFromSpec(spec) {
    if (!spec) return monomialOrder('grevlex');
    if (spec.kind === 'block') return monomialOrder('block', spec.blocks || []);
    return monomialOrder(spec.kind || 'grevlex', spec.varOrder || null);
  }
  function runJob(kind, payload, onProgress) {
    payload = payload || {};
    const polys = (payload.polys || []).map((tl) => MPoly.fromTermList(tl));
    if (kind === 'groebner') {
      const order = _orderFromSpec(payload.orderSpec);
      const opts = Object.assign({}, payload.opts, onProgress ? { onProgress } : {});
      return { generators: buchberger(polys, order, opts).map((g) => g.termList()) };
    }
    if (kind === 'solveZeroDim') {
      const opts = Object.assign({}, payload.opts, { vars: payload.vars, solveVar: payload.solveVar }, onProgress ? { onProgress } : {});
      const res = solveZeroDim(polys, opts);
      const out = {
        ok: res.ok, reason: res.reason, dimension: res.dimension, univariateDegree: res.univariateDegree,
        method: res.method, eliminatedVars: res.eliminatedVars, shapePosition: res.shapePosition,
        complete: res.complete, fallbackFrom: res.fallbackFrom,   // eigenvalue-path flags (complete=false ⇒ PARTIAL solution set)
      };
      if (res.ok) out.solutions = res.solutions;       // {var:{re,im}} — JSON-safe
      return out;
    }
    if (kind === 'solveRealCertified') {
      // CERTIFIED real solve (RUR + exact Sturm boxes): the count matches the Hermite real count by
      // construction (no clustered-root merging), so the caller's verdict can be certified. Serialized
      // JSON-safe: solutions carry numeric box midpoints (re/im) + endpoints (reLo…imHi) + exact flags.
      const opts = Object.assign({}, payload.opts, { vars: payload.vars });
      return certifiedRealToJSON(solveRealCertified(polys, opts));
    }
    if (kind === 'shapeFromMoments') {
      // #18 shape-from-moments: the input is a raw moment sequence (not the column system). moments are
      // {re,im} | number (JSON-safe as sent); the result is already JSON-safe (coeffs → {re,im}).
      return shapeFromMomentsJSON(payload.moments || [], payload.opts || {});
    }
    if (kind === 'parametricRealCount1D') {
      // 1-parameter real bifurcation. The result is already plain numbers/strings; only the
      // unbounded cell ends are ±Infinity → map to null (JSON-safe, and unambiguous by position:
      // the first cell's lo and the last cell's hi are the unbounded ones).
      const res = parametricRealCount1D(polys, payload.paramVar, Object.assign({}, payload.opts, { vars: payload.vars }));
      if (!res.ok) return { ok: false, reason: res.reason };
      const cells = res.cells.map((c) => Object.assign({}, c, { lo: Number.isFinite(c.lo) ? c.lo : null, hi: Number.isFinite(c.hi) ? c.hi : null }));
      return Object.assign({}, res, { cells });
    }
    if (kind === 'dimension') {
      const vars = payload.vars || _ambientVars(polys);
      const order = monomialOrder('grevlex', vars);
      const opts = Object.assign({}, payload.opts, onProgress ? { onProgress } : {});
      const G = buchberger(polys, order, opts);
      const zeroDim = isZeroDimensional(G, order, vars);
      // Infinity isn't JSON-cloneable → report zeroDim + a finite count (null if ∞). krullDim is
      // the true number of free parameters (0 when zero-dim), a better honesty label than numVars.
      return { zeroDim, dimension: zeroDim ? quotientDimension(G, order, vars) : null, krullDim: zeroDim ? 0 : krullDimension(G, order, vars), numVars: vars.length };
    }
    if (kind === 'classify') {
      // Existence/uniqueness verdict over a REAL (reim) system (the off-main-thread twin of
      // AlgebraStore._classifyImpl). `polys`/`vars` are the already-pinned reim equations;
      // returns JSON-safe { ok, inconsistent, zeroDim, realCount, complexCount, multiplicity,
      // numVars, reason }. The heavy part (grevlex Gröbner + Hermite real count) runs here.
      const vars = payload.vars || _ambientVars(polys);
      const order = monomialOrder('grevlex', vars);
      const opts = Object.assign({}, payload.opts, onProgress ? { onProgress } : {});
      let G;
      try { G = buchberger(polys, order, opts); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
      if (G.length === 1 && G[0].vars().size === 0 && !G[0].isZero()) {
        return { ok: true, inconsistent: true, zeroDim: true, realCount: 0, complexCount: 0, multiplicity: 0, numVars: vars.length };
      }
      const zeroDim = isZeroDimensional(G, order, vars);
      if (!zeroDim) return { ok: true, inconsistent: false, zeroDim: false, realCount: null, complexCount: null, multiplicity: null, numVars: vars.length, krullDim: krullDimension(G, order, vars) };
      const multiplicity = quotientDimension(G, order, vars);
      const rc = realSolutionCount({ G, order }, null, vars, opts);
      if (!rc.ok) return { ok: true, inconsistent: false, zeroDim: true, realCount: null, complexCount: null, multiplicity, reason: rc.reason, numVars: vars.length };
      return { ok: true, inconsistent: false, zeroDim: true, realCount: rc.realCount, complexCount: rc.complexCount, multiplicity, numVars: vars.length };
    }
    throw new Error('runJob: unknown kind ' + kind);
  }

  // Saturation ⟨polys⟩ : f^∞ via the Rabinowitsch trick: adjoin a fresh variable w
  // and the relation 1 − w·f, compute a Gröbner basis under an ELIMINATION order
  // (w in the top block), then drop every generator that still mentions w. This
  // removes the components on which f vanishes — e.g. saturating by the φ′ numerator
  // drops the non-univalent locus (form (a)'s witness 1 − ω·numφ′ is exactly this
  // relation, so passing that witness as `f` recovers it). Returns the generator
  // list (MPolys in the original variables).
  function saturate(polys, f, wName, opts) {
    wName = wName || '_w';
    const w = MPoly.variable(wName);
    const rab = MPoly.fromInt(1).sub(w.mul(f));
    const vs = new Set();
    for (const p of (polys || []).concat([f])) for (const v of p.vars()) vs.add(v);
    // The Rabinowitsch variable must be FRESH — a collision would silently change
    // the ideal instead of computing the saturation.
    if (vs.has(wName)) throw new Error('saturate: witness variable "' + wName + '" already appears in the input — pass a fresh wName.');
    const rest = [...vs].filter((v) => v !== wName).sort();
    const order = eliminationOrder([wName], rest);
    const G = buchberger((polys || []).concat([rab]), order, opts);
    return G.filter((g) => !g.vars().has(wName));
  }

  // ---------------------------------------------------------------------------
  // Ideal operations — round out the toolkit begun by saturate: membership,
  // projection (elimination ideal), intersection, and quotient/colon. All exact
  // over ℚ(i), Gröbner-elimination compositions on the existing kernel.
  // ---------------------------------------------------------------------------

  // Ideal membership: f ∈ ⟨gens⟩ ⟺ f reduces to 0 modulo a Gröbner basis of ⟨gens⟩.
  function inIdeal(f, gens, order) {
    if (!f || f.isZero()) return true;                          // 0 ∈ every ideal
    gens = (gens || []).filter((p) => p && !p.isZero());
    if (!gens.length) return false;                             // f ≠ 0 ∉ (0)
    let ord = order;
    if (!ord || !ord.cmp) {
      const vs = new Set(); for (const p of gens.concat([f])) for (const v of p.vars()) vs.add(v);
      ord = monomialOrder('grevlex', [...vs].sort());
    }
    return normalForm(f, buchberger(gens, ord), ord).isZero();
  }

  // The ELIMINATION IDEAL ⟨polys⟩ ∩ k[keepVars]: a Gröbner basis under an elimination
  // order, keeping the generators whose support avoids elimVars. keepVars defaults to
  // all remaining variables. Multivariate/multi-equation elimination with no 10×10
  // Sylvester cap — e.g. eliminate every z̄_j across the (★) block to get the border.
  function eliminationIdeal(polys, elimVars, keepVars, opts) {
    polys = (polys || []).filter((p) => p && !p.isZero());
    const elim = (elimVars || []).slice();
    if (!polys.length || !elim.length) return polys;
    let keep = keepVars;
    if (!keep) {
      const vs = new Set(); for (const p of polys) for (const v of p.vars()) vs.add(v);
      keep = [...vs].filter((v) => elim.indexOf(v) < 0).sort();
    }
    const G = buchberger(polys, eliminationOrder(elim, keep), opts);
    return G.filter((g) => elim.every((v) => !g.vars().has(v)));
  }

  // ⟨A⟩ ∩ ⟨B⟩ via the elimination trick: ⟨A⟩ ∩ ⟨B⟩ = (t·⟨A⟩ + (1−t)·⟨B⟩) ∩ k[x].
  function idealIntersect(A, B, opts) {
    A = (A || []).filter((p) => p && !p.isZero());
    B = (B || []).filter((p) => p && !p.isZero());
    if (!A.length || !B.length) return [];                      // (0) ∩ J = (0)
    const tName = '_t';
    const vs = new Set(); for (const p of A.concat(B)) for (const v of p.vars()) vs.add(v);
    if (vs.has(tName)) throw new Error('idealIntersect: auxiliary variable "_t" already appears in the input.');
    const t = MPoly.variable(tName), oneMt = MPoly.fromInt(1).sub(t);
    const gens = A.map((a) => t.mul(a)).concat(B.map((b) => oneMt.mul(b)));
    const G = buchberger(gens, eliminationOrder([tName], [...vs].sort()), opts);
    return G.filter((g) => !g.vars().has(tName));
  }

  // Ideal quotient (colon) ⟨I⟩ : J. J is a single MPoly (⟨I⟩:f) or an array (⟨I⟩:⟨J⟩ =
  // ∩_j ⟨I⟩:g_j). ⟨I⟩ : f = (1/f)(⟨I⟩ ∩ ⟨f⟩) — each generator of the intersection lies in
  // ⟨f⟩ so the exact division is clean. The FINITE sibling of saturate's ⟨I⟩:f^∞: it removes
  // exactly the ⟨f⟩ component (one embedded/degenerate piece) rather than the whole saturation.
  function idealQuotient(gensI, J, opts) {
    gensI = (gensI || []).filter((p) => p && !p.isZero());
    const Jg = (Array.isArray(J) ? J : [J]).filter((p) => p && !p.isZero());
    if (!Jg.length) return [MPoly.fromInt(1)];                  // ⟨I⟩ : (0) = the whole ring
    if (!gensI.length) return [];                               // (0) : J = (0)
    let result = null;
    for (const f of Jg) {
      const q = idealIntersect(gensI, [f], opts).map((g) => mpolyExactDiv(g, f));
      result = (result === null) ? q : idealIntersect(result, q, opts);
    }
    return result || [];
  }

  // The exact ℚ(i) value of a variable-free MPoly (its constant term), or null if
  // the polynomial actually involves a variable. Drives the evalComplex overflow
  // fallback in RatFn/FRatFn below.
  function _constGaussian(p) {
    if (p.terms.size === 0) return Gaussian.fromInt(0);
    if (p.terms.size !== 1) return null;
    const t = p.terms.values().next().value;
    return t.mono.size === 0 ? t.coeff : null;
  }

  // ---------------------------------------------------------------------------
  // RatFn — MPoly/MPoly. No multivariate-gcd reduction (kept simple; denominators
  // are products of (1 − z̄·z) and φ′ factors, nonzero on the relevant domain).
  // Because nothing reduces common factors, a division-heavy recurrence (e.g.
  // seriesInverse with a non-unit linear coefficient) can inflate num/den into
  // astronomically large but exactly-cancelling fractions — so evalComplex carries
  // an exact-ℚ(i) fallback for the case where the float division overflows to NaN.
  // ---------------------------------------------------------------------------
  class RatFn {
    constructor(num, den) {
      this.num = num;
      this.den = den || MPoly.fromInt(1);
      if (this.den.isZero()) throw new Error('RatFn: zero denominator');
    }
    static fromPoly(p) { return new RatFn(p, MPoly.fromInt(1)); }
    static fromInt(k) { return RatFn.fromPoly(MPoly.fromInt(k)); }
    isZero() { return this.num.isZero(); }
    neg() { return new RatFn(this.num.neg(), this.den); }
    add(o) { return new RatFn(this.num.mul(o.den).add(o.num.mul(this.den)), this.den.mul(o.den)); }
    sub(o) { return this.add(o.neg()); }
    mul(o) { return new RatFn(this.num.mul(o.num), this.den.mul(o.den)); }
    div(o) {
      if (o.num.isZero()) throw new Error('RatFn: division by zero');
      return new RatFn(this.num.mul(o.den), this.den.mul(o.num));
    }
    pow(k) {
      let out = RatFn.fromInt(1);
      for (let i = 0; i < k; i++) out = out.mul(this);
      return out;
    }
    scaleMPoly(p) { return new RatFn(this.num.mul(p), this.den); }
    // The polynomial that must vanish for "this == 0" (clears the denominator).
    clearDenominators() { return this.num; }
    evalComplex(varMap) {
      const n = this.num.evalComplex(varMap);
      const d = this.den.evalComplex(varMap);
      const q = cdiv(n, d);
      if (Number.isFinite(q.re) && Number.isFinite(q.im)) return q;
      // The float path overflowed (num/den can each be finite, yet cdiv squares the
      // denominator → ∞ → NaN) even though the exact ℚ(i) ratio is small. When num
      // and den are variable-free, divide exactly in ℚ(i) and round only at the end,
      // so a blown-up-but-exact coefficient never silently reads as NaN.
      const gn = _constGaussian(this.num), gd = _constGaussian(this.den);
      if (gn && gd && !gd.isZero()) return gn.div(gd).toComplex();
      return q;
    }
  }

  // ---------------------------------------------------------------------------
  // FRatFn — rational function with a FACTORED denominator: num / Π pᵉ. The
  // denominator is a list of {p: MPoly, e: int>0}; factors are identified by
  // p.key() so shared factors combine by exponent rather than being expanded.
  // This is the key to taming the (1 − z̄·z) Möbius denominators: they stay as a
  // tracked factor with an exponent instead of inflating every numerator (which
  // is what made the naive RatFn blow up super-exponentially). Same instance API
  // as RatFn (fromInt/add/sub/mul/div/neg/isZero/evalComplex/clearDenominators),
  // so the field-generic series ops below work over either type.
  // ---------------------------------------------------------------------------
  function _denMergeAdd(d1, d2) {
    const m = new Map();
    for (const f of d1) m.set(f.p.key(), { p: f.p, e: f.e });
    for (const f of d2) {
      const k = f.p.key(), cur = m.get(k);
      if (cur) cur.e += f.e; else m.set(k, { p: f.p, e: f.e });
    }
    return [...m.values()].filter(f => f.e !== 0);
  }
  function _denMergeMax(d1, d2) {
    const m = new Map();
    for (const f of d1) m.set(f.p.key(), { p: f.p, e: f.e });
    for (const f of d2) {
      const k = f.p.key(), cur = m.get(k);
      if (cur) cur.e = Math.max(cur.e, f.e); else m.set(k, { p: f.p, e: f.e });
    }
    return [...m.values()];
  }
  // Multiply num by Π factor^(common.e − ownExp) to lift it onto the common den.
  function _liftToCommon(num, ownDen, common) {
    const own = new Map(ownDen.map(f => [f.p.key(), f.e]));
    let out = num;
    for (const f of common) {
      const diff = f.e - (own.get(f.p.key()) || 0);
      if (diff > 0) out = out.mul(f.p.pow(diff));
    }
    return out;
  }
  class FRatFn {
    constructor(num, den) { this.num = num; this.den = (den || []).filter(f => f.e !== 0); }
    static fromInt(k) { return new FRatFn(MPoly.fromInt(k), []); }
    static fromPoly(p) { return new FRatFn(p, []); }
    static fromFactor(num, factorPoly, e) {
      return new FRatFn(num, e ? [{ p: factorPoly, e }] : []);
    }
    isZero() { return this.num.isZero(); }
    neg() { return new FRatFn(this.num.neg(), this.den.map(f => ({ p: f.p, e: f.e }))); }
    mul(o) { return new FRatFn(this.num.mul(o.num), _denMergeAdd(this.den, o.den)); }
    scaleMPoly(p) { return new FRatFn(this.num.mul(p), this.den.map(f => ({ p: f.p, e: f.e }))); }
    pow(k) {
      let out = FRatFn.fromInt(1);
      for (let i = 0; i < k; i++) out = out.mul(this);
      return out;
    }
    add(o) {
      const common = _denMergeMax(this.den, o.den);
      const a = _liftToCommon(this.num, this.den, common);
      const b = _liftToCommon(o.num, o.den, common);
      return new FRatFn(a.add(b), common);
    }
    sub(o) { return this.add(o.neg()); }
    div(o) {
      if (o.num.isZero()) throw new Error('FRatFn: division by zero');
      // a/b = a.num·(o.den) / (a.den · o.num): o's den factors lift into the
      // numerator (expanded), o.num becomes a new denominator factor.
      let num = this.num;
      for (const f of o.den) num = num.mul(f.p.pow(f.e));
      return new FRatFn(num, _denMergeAdd(this.den, [{ p: o.num, e: 1 }]));
    }
    // The polynomial that must vanish for "this == 0" (denominator is nonzero on
    // the relevant domain, so the equation is just num = 0 — NOT inflated by the
    // denominator, which is the whole point of the factored representation).
    clearDenominators() { return this.num; }
    denExponents() { return this.den.map(f => ({ key: f.p.key(), e: f.e })); }
    evalComplex(varMap) {
      const n = this.num.evalComplex(varMap);
      let d = { re: 1, im: 0 };
      for (const f of this.den) d = cmul(d, cpowInt(f.p.evalComplex(varMap), f.e));
      const q = cdiv(n, d);
      if (Number.isFinite(q.re) && Number.isFinite(q.im)) return q;
      // Exact ℚ(i) fallback (see RatFn.evalComplex): when num and every den factor
      // are variable-free, recover num / Π factorᵉ exactly so an overflowed-but-
      // exact coefficient never silently reads as NaN.
      const gn = _constGaussian(this.num);
      if (gn) {
        let gd = Gaussian.fromInt(1);
        for (const f of this.den) {
          const gf = _constGaussian(f.p);
          if (!gf) { gd = null; break; }
          for (let i = 0; i < f.e; i++) gd = gd.mul(gf);
        }
        if (gd && !gd.isZero()) return gn.div(gd).toComplex();
      }
      return q;
    }
  }

  // ---------------------------------------------------------------------------
  // Truncated power series in t, length L+1 (orders 0..L). Coefficients are any
  // "field" element with a static fromInt + instance add/sub/mul/div/neg/isZero
  // (RatFn or FRatFn). The element type is inferred from the input array so the
  // ops are generic. All ops truncate to order L.
  // ---------------------------------------------------------------------------
  function fieldOf(arr) { return (arr && arr[0] && arr[0].constructor) || RatFn; }
  function seriesZero(L, K) { K = K || RatFn; const a = []; for (let i = 0; i <= L; i++) a.push(K.fromInt(0)); return a; }
  function seriesConst(rf, L) { const a = seriesZero(L, rf.constructor); a[0] = rf; return a; }
  function seriesAdd(a, b, L) { const o = seriesZero(L, fieldOf(a)); for (let i = 0; i <= L; i++) o[i] = a[i].add(b[i]); return o; }
  function seriesScale(a, rf, L) { const o = seriesZero(L, fieldOf(a)); for (let i = 0; i <= L; i++) o[i] = a[i].mul(rf); return o; }
  function seriesMul(a, b, L) {
    const o = seriesZero(L, fieldOf(a));
    for (let i = 0; i <= L; i++) {
      for (let j = 0; j <= L - i; j++) o[i + j] = o[i + j].add(a[i].mul(b[j]));
    }
    return o;
  }
  function seriesPow(a, k, L) {
    const K = fieldOf(a);
    let out = seriesConst(K.fromInt(1), L);
    for (let i = 0; i < k; i++) out = seriesMul(out, a, L);
    return out;
  }
  // Multiply every coefficient of a series by a single field element.
  function seriesScaleByCoeff(series, coeff) {
    const o = [];
    for (let i = 0; i < series.length; i++) o.push(series[i].mul(coeff));
    return o;
  }
  // a(b(t)) with b[0] == 0 (else the composition isn't a formal power series).
  function seriesCompose(a, b, L) {
    const K = fieldOf(a);
    let out = seriesConst(a[0], L);
    let bpow = seriesConst(K.fromInt(1), L);       // b^0
    for (let k = 1; k <= L; k++) {
      bpow = seriesMul(bpow, b, L);                // b^k
      out = seriesAdd(out, seriesScaleByCoeff(bpow, a[k]), L);
    }
    return out;
  }
  // Compositional inverse T of s (s[0] == 0, s[1] invertible): s(T(t)) == t.
  // Order-by-order: at order n, [t^n] s(T) = s[1]·T[n] + (terms from T[1..n-1]),
  // so T[n] = (δ_{n,1} − Σ_{k≥2} s[k]·[t^n]((T with T[n]=0)^k)) / s[1].
  function seriesInverse(s, L) {
    if (!s[0].isZero()) throw new Error('seriesInverse: s[0] must be 0');
    const K = fieldOf(s);
    const T = seriesZero(L, K);
    if (L >= 1) T[1] = K.fromInt(1).div(s[1]);
    for (let n = 2; n <= L; n++) {
      let acc = K.fromInt(0);
      let Tk = seriesMul(T, T, L);            // T^2
      for (let k = 2; k <= n; k++) {
        acc = acc.add(s[k].mul(Tk[n]));
        if (k < n) Tk = seriesMul(Tk, T, L);  // up to T^n
      }
      T[n] = acc.neg().div(s[1]);
    }
    return T;
  }
  // Multiplicative reciprocal 1/a(t) (a[0] must be invertible). Recursion:
  // r[0] = 1/a[0]; r[n] = -(1/a[0]) Σ_{k=1}^{n} a[k]·r[n-k].
  function seriesRecip(a, L) {
    if (a[0].isZero()) throw new Error('seriesRecip: a[0] must be nonzero');
    const K = fieldOf(a);
    const r = seriesZero(L, K);
    const inv0 = K.fromInt(1).div(a[0]);
    r[0] = inv0;
    for (let n = 1; n <= L; n++) {
      let acc = K.fromInt(0);
      for (let k = 1; k <= n; k++) acc = acc.add(a[k].mul(r[n - k]));
      r[n] = acc.neg().mul(inv0);
    }
    return r;
  }
  // Compositional inverse via LAGRANGE INVERSION (series reversion):
  //   ψ̃_n = (1/n) [t^{n-1}] (t/s(t))^n,   t/s(t) = 1/(s[1] + s[2]t + …).
  // Uses only seriesRecip + seriesPow (no iterative denominator accumulation), so
  // over FRatFn the denominators stay bounded — the modern-CAS way to reverse a
  // series without expression blow-up. Equivalent to seriesInverse.
  function seriesReversion(s, L) {
    if (!s[0].isZero()) throw new Error('seriesReversion: s[0] must be 0');
    const K = fieldOf(s);
    if (L <= 0) return seriesZero(L, K);            // trivial: the reversion to order 0 is [0]
    if (s.length < 2 || s[1].isZero()) throw new Error('seriesReversion: needs a nonzero linear coefficient s[1]');
    const shifted = seriesZero(L, K);               // s(t)/t = [s1, s2, …]
    for (let i = 0; i <= L; i++) shifted[i] = (i + 1 <= L) ? s[i + 1] : K.fromInt(0);
    const g = seriesRecip(shifted, L);              // t/s(t)
    const T = seriesZero(L, K);
    for (let n = 1; n <= L; n++) {
      const gn = seriesPow(g, n, L);                // (t/s)^n
      const invN = MPoly.constant(new Gaussian(new Rational(1n, BigInt(n)), RZERO));
      T[n] = gn[n - 1].scaleMPoly(invN);            // (1/n)[t^{n-1}] (t/s)^n
    }
    return T;
  }

  // ---------------------------------------------------------------------------
  // Series calculus (Taylor): termwise derivative / integral, and log / exp via the
  // standard ODE recurrences. Same truncated-array representation over the generic
  // field (RatFn/FRatFn), each an O(L) or O(L²) loop. (Laurent / negative-order series
  // are a separate representation — a start-index offset — and are NOT added here.)
  // ---------------------------------------------------------------------------

  // d/dt of a series: a'[n] = (n+1)·a[n+1]; a'[L]=0 (a[L+1] is beyond the truncation).
  function seriesDeriv(a, L) {
    const K = fieldOf(a);
    if (L == null) L = a.length - 1;
    const o = seriesZero(L, K);
    for (let n = 0; n < L; n++) if (a[n + 1] != null) o[n] = a[n + 1].mul(K.fromInt(n + 1));
    return o;
  }

  // ∫ of a series with zero constant of integration: I[0]=0, I[n]=a[n−1]/n.
  function seriesIntegral(a, L) {
    const K = fieldOf(a);
    if (L == null) L = a.length - 1;
    const o = seriesZero(L, K);
    for (let n = 1; n <= L; n++) if (a[n - 1] != null) o[n] = a[n - 1].div(K.fromInt(n));
    return o;
  }

  // log(a(t)) = ∫ a'/a. Requires a[0]=1 (so log(a)[0]=0 — a nonunit / a≠1 constant term
  // has no symbolic log in the field).
  function seriesLog(a, L) {
    const K = fieldOf(a);
    if (L == null) L = a.length - 1;
    if (!a[0].sub(K.fromInt(1)).isZero()) throw new Error('seriesLog: constant term a[0] must be 1');
    return seriesIntegral(seriesMul(seriesDeriv(a, L), seriesRecip(a, L), L), L);
  }

  // exp(a(t)) via E'=a'·E: E[0]=1, E[n]=(1/n)·Σ_{k=1}^{n} k·a[k]·E[n−k]. Requires a[0]=0
  // (so exp(a)[0]=1; a nonzero constant term needs the unrepresentable scalar exp(a[0])).
  function seriesExp(a, L) {
    const K = fieldOf(a);
    if (L == null) L = a.length - 1;
    if (!a[0].isZero()) throw new Error('seriesExp: constant term a[0] must be 0');
    const E = seriesZero(L, K);
    E[0] = K.fromInt(1);
    for (let n = 1; n <= L; n++) {
      let acc = K.fromInt(0);
      for (let k = 1; k <= n; k++) if (a[k] != null) acc = acc.add(a[k].mul(K.fromInt(k)).mul(E[n - k]));
      E[n] = acc.div(K.fromInt(n));
    }
    return E;
  }

  // --- Rational (Padé) reconstruction from a truncated power series (EEA over K[t]) ---
  // Coefficient arrays are ASCENDING (p[i] = coeff of tⁱ) over K = fieldOf(a), like the series
  // primitives. Local field-generic polynomial helpers — a Padé run is short, so this needs no
  // MPoly machinery. _plDeg = true degree (−1 for the zero polynomial; ignores trailing zeros).
  function _plDeg(p) { let d = -1; for (let i = 0; i < p.length; i++) if (p[i] != null && !p[i].isZero()) d = i; return d; }
  function _plMul(a, b, K) {
    const da = _plDeg(a), db = _plDeg(b);
    if (da < 0 || db < 0) return [K.fromInt(0)];
    const out = []; for (let i = 0; i <= da + db; i++) out.push(K.fromInt(0));
    for (let i = 0; i <= da; i++) { if (a[i] == null || a[i].isZero()) continue; for (let j = 0; j <= db; j++) { if (b[j] == null || b[j].isZero()) continue; out[i + j] = out[i + j].add(a[i].mul(b[j])); } }
    return out;
  }
  function _plSub(a, b, K) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push((a[i] || K.fromInt(0)).sub(b[i] || K.fromInt(0)));
    return out;
  }
  // Long division a = q·b + r over the field K (deg r < deg b); b ≠ 0. Degrees read via _plDeg,
  // so trailing zeros in either operand are harmless.
  function _plDivMod(a, b, K) {
    const db = _plDeg(b), lcb = b[db], r = a.slice();
    const q = []; for (let i = 0, N = Math.max(1, a.length - db); i < N; i++) q.push(K.fromInt(0));
    for (let dr = _plDeg(r); dr >= db; dr = _plDeg(r)) {
      const c = r[dr].div(lcb), shift = dr - db;
      q[shift] = c;
      for (let j = 0; j <= db; j++) if (b[j] != null && !b[j].isZero()) r[shift + j] = r[shift + j].sub(c.mul(b[j]));
      if (_plDeg(r) >= dr) break;                               // numerical guard (degree must drop)
    }
    return { q, r };
  }

  // Padé [m/n] approximant of a power series a[0..]: the rational p(t)/q(t) with deg p ≤ m,
  // deg q ≤ n and p/q ≡ Σ aₖtᵏ (mod t^{m+n+1}), i.e. p ≡ q·a. Extended Euclid on t^{m+n+1} and
  // the truncated series — the FIRST remainder of degree ≤ m is p, and its running A-cofactor is
  // q (the classical Padé↔EEA degree theorem gives deg q ≤ n). Needs a known to order m+n
  // (a.length ≥ m+n+1). Returns { ok, num, den } (ascending coeff arrays over K, den normalized
  // so den[0] = 1), or { ok:false, reason } when the [m/n] entry is degenerate (den(0) = 0) or
  // the series is too short.
  function padeApproximant(a, m, n) {
    const K = fieldOf(a), L = m + n;
    if (a.length < L + 1) return { ok: false, reason: 'series too short: need ' + (L + 1) + ' coefficients for Padé [' + m + '/' + n + ']' };
    const mod = []; for (let i = 0; i <= L + 1; i++) mod.push(K.fromInt(i === L + 1 ? 1 : 0));  // t^{L+1}
    let r0 = mod, r1 = a.slice(0, L + 1), t0 = [K.fromInt(0)], t1 = [K.fromInt(1)];             // r = s·t^{L+1} + tcof·a
    while (_plDeg(r1) > m) {
      const { q } = _plDivMod(r0, r1, K);
      const r2 = _plSub(r0, _plMul(q, r1, K), K), t2 = _plSub(t0, _plMul(q, t1, K), K);
      r0 = r1; r1 = r2; t0 = t1; t1 = t2;
    }
    const d0 = t1[0];
    if (d0 == null || d0.isZero()) return { ok: false, reason: 'degenerate Padé [' + m + '/' + n + ']: denominator vanishes at 0' };
    const trim = (u) => u.slice(0, Math.max(0, _plDeg(u)) + 1);
    return { ok: true, num: trim(r1.map((c) => (c || K.fromInt(0)).div(d0))), den: trim(t1.map((c) => c.div(d0))) };
  }

  // Balanced rational reconstruction: the Padé [⌊L/2⌋ / ⌈L/2⌉] entry of a length-(L+1) series —
  // the lowest-degree rational function matching every known coefficient.
  function rationalReconstruct(a) {
    const L = a.length - 1;
    return padeApproximant(a, Math.floor(L / 2), Math.ceil(L / 2));
  }

  // ---------------------------------------------------------------------------
  // Minimal complex arithmetic for evalComplex (self-contained; QD.Complex is
  // not assumed loaded). {re,im} plain objects.
  // ---------------------------------------------------------------------------
  function cadd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
  function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
  function cdiv(a, b) {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  }
  function cpowInt(a, e) {
    let out = { re: 1, im: 0 };
    for (let i = 0; i < e; i++) out = cmul(out, a);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Convenience constructors
  // ---------------------------------------------------------------------------
  function rat(n, d) { return new Rational(n, d); }
  function gaussInt(a, b) { return new Gaussian(Rational.fromInt(a || 0), Rational.fromInt(b || 0)); }
  function gauss(re, im) { return new Gaussian(re || RZERO, im || RZERO); }
  function mpolyVar(name) { return MPoly.variable(name); }
  function mpolyConst(g) { return MPoly.constant(g); }
  function mpolyInt(k) { return MPoly.fromInt(k); }

  const Sym = {
    Rational, Gaussian, MPoly, RatFn, FRatFn,
    rat, gauss, gaussInt, mpolyVar, mpolyConst, mpolyInt,
    polyFromTermList: (list) => MPoly.fromTermList(list),
    monoKey, monoCmp,
    mpolyDet, mpolyDetLaplace, resultant, discriminant, reducedDiscriminant, mpolyExactDiv, factor, factorOverQ: _factorOverQ, qiFactor: _qiFactor, univariateGCD, squareFreePart, realRootIsolate, realRootCount, sturmHabicht, realRootCountSturm, comprehensiveGroebnerSystem, verifySOS, gcdMV, gcdList, radicalZeroDim, rationalUnivariateRep, solveRealCertified, certifiedRealToJSON,
    monomialOrder, eliminationOrder, monoLcm, mpolyDivMod, normalForm, sPoly, buchberger, buchbergerSig, reduceGroebner, saturate,
    inIdeal, eliminationIdeal, idealIntersect, idealQuotient, minimalPrimes, triangularDecomposition, curveGenus,   // ideal ops: membership, projection, ∩, colon, irreducible components, regular chains, plane-curve genus

    leadingMonomials, isZeroDimensional, standardMonomials, quotientDimension, krullDimension, dimensionDegree, fglm, linearReduce, solveZeroDim,
    multiplicationMatrix, powerSums, newtonToElementary, charPolyByTraces, coordinateMoments,
    hankelRank, pronyPolynomial, shapeFromMoments, shapeFromMomentsJSON, // #18 shape-from-moments (Prony–Hankel): exact QD-order + Prony polynomial + numeric nodes/weights (+JSON serializer)
    nullspaceRational, bivariateContent, bivariatePrimitivePart, bivariateSquarefreeInX, // #19 factorizer Phase-1 infra (exact ℚ(i) kernel basis + content/primitive/squarefree-in-x)
    bivariateAbsFactorCount, isAbsolutelyIrreducible, // #19 factorizer Phase-2: Gao Ruppert-nullspace absolute (over-ℂ) factor count + absolute-irreducibility test
    factorBivariate, // #19 factorizer Phase-3: ℚ(i)-rational bivariate factorization (resultant-eigenvalue extraction)
    henselFactorBivariate, // #19 factorizer Phase-5: INDEPENDENT Zassenhaus–Hensel oracle (differential cross-check of factorBivariate)
    solveByEigenvalues, realSolutionCount, parametricRealCount1D, discriminantVariety, reconcileRealCount, schurCohn, unitCircleRootCount, resolvent, uniCoeffs: _uniToArr, pseudoRemainder, triangularize, runJob,
    seriesZero, seriesConst, seriesAdd, seriesScale, seriesMul, seriesPow,
    seriesCompose, seriesInverse, seriesReversion, seriesScaleByCoeff, seriesRecip,
    seriesDeriv, seriesIntegral, seriesLog, seriesExp,   // series calculus (Taylor)
    padeApproximant, rationalReconstruct,                // rational (Padé) reconstruction
  };

  const QD = _QD;
  QD.Sym = Sym;
})(typeof globalThis !== 'undefined' ? globalThis : this);
