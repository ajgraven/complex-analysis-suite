// =============================================================================
// sym-core.js -- Exact symbolic-algebra core (QD.Sym).
//
// The foundation for the app's symbolic track (the classical-QD equation
// generator in qd-equations.js, and a future Gröbner/CTD reducer). Everything
// here is EXACT (BigInt rationals) so downstream elimination is meaningful;
// floating point only ever appears in evalComplex (the numeric-residual oracle).
//
// Layers, smallest to largest:
//   Rational  -- BigInt n/d, normalized (d > 0, gcd 1).
//   Gaussian  -- a + b·i with a, b ∈ Rational (the coefficient field ℚ(i)).
//   MPoly     -- multivariate polynomial: sparse Map<monomialKey, term>, term =
//                { mono: Map<varName,exp>, coeff: Gaussian }. Variables are bare
//                string names (e.g. 'z1', 'zb1', 'A_1_1', 'Ab_1_1', 'a1', …).
//   RatFn     -- MPoly/MPoly (the fraction field) — needed because the QD ansatz
//                and Taylor inversion introduce (1 − z̄·z) and φ′ denominators;
//                an equation RatFn = 0 clears to its numerator MPoly = 0.
//   Series    -- truncated power series in a local variable t, coeffs = RatFn,
//                with mul / pow / compose / compositional-inverse (mirrors the
//                numeric taylor.js, but symbolic) — drives the (★) Faber block.
//
// Pure module: no DOM. Loads in node-test (after complex.js, for evalComplex).
// Namespace idiom mirrors poly-helpers.js.
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
  function monoTotalDeg(mono) { let d = 0; for (const e of mono.values()) d += e; return d; }
  // Global monomial order (graded-lex): higher total degree wins; ties broken
  // lexicographically by the higher exponent on the alphabetically-earliest
  // differing variable. Used only by the exact-division step of the determinant —
  // any well-founded order makes that division terminate; grlex keeps it cheap.
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
  function mpolyExactDiv(f, g) {
    if (g.isZero()) throw new Error('mpolyExactDiv: division by zero');
    const gLead = _leadTerm(g);
    let rem = f.clone();
    let q = MPoly.zero();
    let guard = 0;
    while (!rem.isZero()) {
      const rLead = _leadTerm(rem);
      const qm = monoDivide(rLead.mono, gLead.mono);
      if (qm === null) throw new Error('mpolyExactDiv: not divisible (invariant violated)');
      const qc = rLead.coeff.div(gLead.coeff);          // exact in ℚ(i)
      const term = new MPoly(); term._addTerm(qm, qc);
      q = q.add(term);
      rem = rem.sub(term.mul(g));
      if (++guard > 1e6) throw new Error('mpolyExactDiv: non-terminating');
    }
    return q;
  }
  // Determinant via fraction-free Bareiss elimination with row-pivoting.
  function mpolyDet(matrix) {
    const n = matrix.length;
    if (n === 0) return MPoly.fromInt(1);
    const M = matrix.map((row) => row.map((e) => e.clone()));
    let sign = 1;
    let prev = MPoly.fromInt(1);
    for (let k = 0; k < n - 1; k++) {
      if (M[k][k].isZero()) {
        let r = k + 1;
        while (r < n && M[r][k].isZero()) r++;
        if (r === n) return MPoly.zero();               // singular column
        const tmp = M[k]; M[k] = M[r]; M[r] = tmp; sign = -sign;
      }
      const pivot = M[k][k];
      for (let i = k + 1; i < n; i++) {
        for (let j = k + 1; j < n; j++) {
          const num = pivot.mul(M[i][j]).sub(M[i][k].mul(M[k][j]));
          M[i][j] = mpolyExactDiv(num, prev);
        }
        M[i][k] = MPoly.zero();
      }
      prev = pivot;
    }
    const det = M[n - 1][n - 1];
    return sign === 1 ? det : det.neg();
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
  // Its zero set contains the double-root locus — the geometric border loci.
  function discriminant(p, varName) {
    return resultant(p, p.derivativeIn(varName), varName);
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
  function _orderCmp(order) {
    if (!order) return monoCmp;
    if (typeof order === 'function') return order;
    if (typeof order.cmp === 'function') return order.cmp;
    return monoCmp;
  }

  // Build a monomial order. kind ∈ {'lex','grlex','grevlex'} (default grevlex —
  // the fastest general order for Buchberger). `varOrder` ranks variables from
  // HIGHEST priority to lowest; variables absent from the list rank below all
  // listed ones, alphabetically among themselves (so the order is total even on
  // monomials in newly-introduced variables). For ELIMINATION, use 'lex' with the
  // variables to eliminate at the front of varOrder. Returns { kind, varOrder, cmp },
  // where cmp(a,b) returns -1 / 0 / 1 (a<b / a=b / a>b), matching monoCmp.
  function monomialOrder(kind, varOrder) {
    kind = kind || 'grevlex';
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

  // lcm of two monomials (max exponent per variable).
  function monoLcm(a, b) {
    const out = new Map(a);
    for (const [name, e] of b) out.set(name, Math.max(out.get(name) || 0, e));
    return out;
  }
  function _monoCoprime(a, b) { for (const k of a.keys()) if (b.has(k)) return false; return true; }
  function _monoEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [k, e] of a) if ((b.get(k) || 0) !== e) return false;
    return true;
  }

  // Multivariate division with remainder: f = Σ qᵢ·divisorᵢ + r, where no term of
  // r is divisible by any leading monomial LT(divisorᵢ) under `order`. Returns
  // { quotients:[MPoly], remainder:MPoly }. The remainder is the NORMAL FORM of f
  // modulo the divisor set (canonical when the divisors are a Gröbner basis).
  function mpolyDivMod(f, divisors, order) {
    const lts = divisors.map((g) => g.leadingTerm(order));
    const quotients = divisors.map(() => MPoly.zero());
    let r = MPoly.zero();
    let p = f.clone();
    let guard = 0;
    while (!p.isZero()) {
      const lp = p.leadingTerm(order);
      let divided = false;
      for (let i = 0; i < divisors.length; i++) {
        const lg = lts[i];
        if (!lg) continue;
        const md = monoDivide(lp.mono, lg.mono);
        if (md !== null) {
          const term = new MPoly(); term._addTerm(md, lp.coeff.div(lg.coeff));
          quotients[i] = quotients[i].add(term);
          p = p.sub(term.mul(divisors[i]));
          divided = true;
          break;
        }
      }
      if (!divided) {                                   // LT(p) is irreducible → move to r
        const lt = new MPoly(); lt._addTerm(new Map(lp.mono), lp.coeff);
        r = r.add(lt);
        p = p.sub(lt);
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

  // Caps — Buchberger can blow up super-exponentially, so bound the run and throw
  // a clear "use CAS export" error rather than hanging (mirrors RESULTANT_MATRIX_CAP).
  // All overridable via opts {maxBasis, maxSteps, maxDegree, maxTerms}.
  const GROEBNER_MAX_BASIS = 80;     // generators in the working basis
  const GROEBNER_MAX_STEPS = 8000;   // S-pair reductions
  const GROEBNER_MAX_DEGREE = 40;    // total degree of any new generator
  const GROEBNER_MAX_TERMS = 8000;   // term count of any new generator

  // Buchberger's algorithm → a Gröbner basis of ⟨polys⟩ under `order` (a
  // monomialOrder object, an order kind string, or omitted → grevlex). Uses the
  // first criterion (coprime leading monomials ⇒ the S-poly reduces to 0, skip).
  // Returns the REDUCED Gröbner basis (canonical: monic, inter-reduced) unless
  // opts.reduced === false. Throws a capped-cost error past the GROEBNER_* limits.
  function buchberger(polys, order, opts) {
    opts = opts || {};
    const ord = (order && order.cmp) ? order : monomialOrder(order || 'grevlex');
    const maxBasis = opts.maxBasis != null ? opts.maxBasis : GROEBNER_MAX_BASIS;
    const maxSteps = opts.maxSteps != null ? opts.maxSteps : GROEBNER_MAX_STEPS;
    const maxDegree = opts.maxDegree != null ? opts.maxDegree : GROEBNER_MAX_DEGREE;
    const maxTerms = opts.maxTerms != null ? opts.maxTerms : GROEBNER_MAX_TERMS;
    const G = (polys || []).filter((p) => p && !p.isZero()).map((p) => p.clone());
    if (!G.length) return [];
    const pairs = [];
    for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) pairs.push([i, j]);
    let steps = 0;
    while (pairs.length) {
      if (++steps > maxSteps)
        throw new Error('buchberger: exceeded ' + maxSteps + ' S-pair steps; the system is too large — use CAS export.');
      const [i, j] = pairs.shift();
      const lmi = G[i].leadingMono(ord), lmj = G[j].leadingMono(ord);
      if (_monoCoprime(lmi, lmj)) continue;             // first criterion
      const r = normalForm(sPoly(G[i], G[j], ord), G, ord);
      if (r.isZero()) continue;
      if (r.totalDegree() > maxDegree)
        throw new Error('buchberger: generator degree ' + r.totalDegree() + ' exceeds the cap (' + maxDegree + '); use CAS export.');
      if (r.size() > maxTerms)
        throw new Error('buchberger: a generator reached ' + r.size() + ' terms (cap ' + maxTerms + '); use CAS export.');
      G.push(r);
      if (G.length > maxBasis)
        throw new Error('buchberger: basis exceeded ' + maxBasis + ' generators; use CAS export.');
      const ni = G.length - 1;
      for (let k = 0; k < ni; k++) pairs.push([k, ni]);
    }
    return opts.reduced === false ? G : reduceGroebner(G, ord);
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

  // Saturation ⟨polys⟩ : f^∞ via the Rabinowitsch trick: adjoin a fresh variable w
  // and the relation 1 − w·f, compute a Gröbner basis under a lex order with w
  // ranked highest (eliminating w), then drop every generator that still mentions
  // w. This removes the components on which f vanishes — e.g. saturating by the
  // φ′ numerator drops the non-univalent locus (form (a)'s witness 1 − ω·numφ′ is
  // exactly this relation, so passing that witness as `f` recovers it). Returns the
  // generator list (MPolys in the original variables).
  function saturate(polys, f, wName, opts) {
    wName = wName || '_w';
    const w = MPoly.variable(wName);
    const rab = MPoly.fromInt(1).sub(w.mul(f));
    const vs = new Set([wName]);
    for (const p of (polys || []).concat([f])) for (const v of p.vars()) vs.add(v);
    const rest = [...vs].filter((v) => v !== wName).sort();
    const order = monomialOrder('lex', [wName, ...rest]);
    const G = buchberger((polys || []).concat([rab]), order, opts);
    return G.filter((g) => !g.vars().has(wName));
  }

  // ---------------------------------------------------------------------------
  // RatFn — MPoly/MPoly. No multivariate-gcd reduction (kept simple; denominators
  // are products of (1 − z̄·z) and φ′ factors, nonzero on the relevant domain).
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
      return cdiv(n, d);
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
      return cdiv(n, d);
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
    monoKey, monoCmp,
    mpolyDet, mpolyDetLaplace, resultant, discriminant, mpolyExactDiv,
    monomialOrder, monoLcm, mpolyDivMod, normalForm, sPoly, buchberger, reduceGroebner, saturate,
    seriesZero, seriesConst, seriesAdd, seriesScale, seriesMul, seriesPow,
    seriesCompose, seriesInverse, seriesReversion, seriesScaleByCoeff, seriesRecip,
  };

  const QD = (typeof window !== 'undefined' && window.QD)
    ? window.QD
    : (typeof module !== 'undefined' && module.exports ? module.exports : (global.QD || (global.QD = {})));
  QD.Sym = Sym;
})(typeof globalThis !== 'undefined' ? globalThis : this);
