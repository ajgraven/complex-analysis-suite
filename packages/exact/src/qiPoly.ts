// Exact univariate polynomials over ℚ(i) — @cas/exact's workhorse. The single variable is abstract (its
// consumers name it: z̄ for the correspondence curve, c for a Gleason polynomial). Because ℚ(i) is a field,
// division-with-remainder is exact, which the correspondence-curve deflation, the fraction-free Bareiss
// resultant, and the dynatomic/Gleason Möbius division (which needs only the monic-divisor case) all rely on.
//
// Coefficients are little-endian: coeffs[k] multiplies varᵏ. The array is always trimmed so the top
// coefficient is nonzero; the zero polynomial is the empty array.
import { Gauss } from "./gaussian.js";

const ZERO = Gauss.ZERO;

export class QiPoly {
  /** Little-endian, trimmed (last entry nonzero), empty ⇔ zero polynomial. */
  readonly coeffs: readonly Gauss[];

  private constructor(coeffs: readonly Gauss[]) {
    this.coeffs = coeffs;
  }

  /** Build from a little-endian coefficient list, trimming trailing (high-degree) zeros. */
  static fromCoeffs(coeffs: readonly Gauss[]): QiPoly {
    let n = coeffs.length;
    while (n > 0 && (coeffs[n - 1] ?? ZERO).isZero()) n--;
    return new QiPoly(coeffs.slice(0, n));
  }

  static zero(): QiPoly {
    return new QiPoly([]);
  }

  static constant(g: Gauss): QiPoly {
    return g.isZero() ? new QiPoly([]) : new QiPoly([g]);
  }

  static int(n: number | bigint): QiPoly {
    return QiPoly.constant(Gauss.int(n));
  }

  /** The variable itself (degree 1). */
  static variable(): QiPoly {
    return new QiPoly([ZERO, Gauss.ONE]);
  }

  /** The monomial coeff·varᵏ. */
  static monomial(k: number, coeff: Gauss = Gauss.ONE): QiPoly {
    if (k < 0 || coeff.isZero()) return QiPoly.zero();
    const cs: Gauss[] = new Array<Gauss>(k + 1).fill(ZERO);
    cs[k] = coeff;
    return new QiPoly(cs);
  }

  /** Degree, with the zero polynomial reported as −1. */
  degree(): number {
    return this.coeffs.length - 1;
  }

  isZero(): boolean {
    return this.coeffs.length === 0;
  }

  /** The coefficient of zbarⁱ (ZERO outside the stored range). */
  coeff(i: number): Gauss {
    return i >= 0 && i < this.coeffs.length ? (this.coeffs[i] ?? ZERO) : ZERO;
  }

  leadingCoeff(): Gauss {
    return this.coeffs.length === 0 ? ZERO : (this.coeffs[this.coeffs.length - 1] ?? ZERO);
  }

  equals(o: QiPoly): boolean {
    if (this.coeffs.length !== o.coeffs.length) return false;
    for (let i = 0; i < this.coeffs.length; i++) {
      if (!this.coeff(i).equals(o.coeff(i))) return false;
    }
    return true;
  }

  add(o: QiPoly): QiPoly {
    const n = Math.max(this.coeffs.length, o.coeffs.length);
    const out: Gauss[] = [];
    for (let i = 0; i < n; i++) out.push(this.coeff(i).add(o.coeff(i)));
    return QiPoly.fromCoeffs(out);
  }

  sub(o: QiPoly): QiPoly {
    const n = Math.max(this.coeffs.length, o.coeffs.length);
    const out: Gauss[] = [];
    for (let i = 0; i < n; i++) out.push(this.coeff(i).sub(o.coeff(i)));
    return QiPoly.fromCoeffs(out);
  }

  neg(): QiPoly {
    return new QiPoly(this.coeffs.map((c) => c.neg()));
  }

  /** Scale by a field element. */
  scale(g: Gauss): QiPoly {
    if (g.isZero()) return QiPoly.zero();
    return new QiPoly(this.coeffs.map((c) => c.mul(g)));
  }

  mul(o: QiPoly): QiPoly {
    if (this.isZero() || o.isZero()) return QiPoly.zero();
    const out: Gauss[] = new Array<Gauss>(this.coeffs.length + o.coeffs.length - 1).fill(ZERO);
    for (let i = 0; i < this.coeffs.length; i++) {
      const a = this.coeff(i);
      if (a.isZero()) continue;
      for (let j = 0; j < o.coeffs.length; j++) {
        out[i + j] = (out[i + j] ?? ZERO).add(a.mul(o.coeff(j)));
      }
    }
    return QiPoly.fromCoeffs(out);
  }

  /** Non-negative integer power (exponentiation by squaring). */
  pow(n: number): QiPoly {
    if (n < 0) throw new Error("QiPoly.pow: negative exponent");
    let result = QiPoly.constant(Gauss.ONE);
    let base = QiPoly.fromCoeffs(this.coeffs); // a copy, so `this` is not aliased
    for (let e = n; e > 0; e >>= 1) {
      if (e & 1) result = result.mul(base);
      if (e > 1) base = base.mul(base);
    }
    return result;
  }

  /**
   * Exact division by the variable zbar: returns p / zbar, requiring a zero constant term (i.e. zbar | p).
   * This is the one division the deflation needs — dividing the trivial factor (zbar·w − 1) out of the
   * correspondence polynomial reduces, coefficient by coefficient, to "divide a zbar-polynomial by zbar".
   */
  divideByVar(): QiPoly {
    if (this.isZero()) return QiPoly.zero();
    if (!this.coeff(0).isZero()) throw new Error("QiPoly.divideByVar: nonzero constant term (not divisible by zbar)");
    return QiPoly.fromCoeffs(this.coeffs.slice(1));
  }

  /** Polynomial division with remainder over the field ℚ(i): this = q·b + r with deg r < deg b. */
  divmod(b: QiPoly): { q: QiPoly; r: QiPoly } {
    if (b.isZero()) throw new Error("QiPoly.divmod: division by zero polynomial");
    const db = b.degree();
    const lcbInv = b.leadingCoeff().inv();
    const r: Gauss[] = this.coeffs.slice();
    const qLen = Math.max(0, this.degree() - db + 1);
    const q: Gauss[] = new Array<Gauss>(qLen).fill(ZERO);
    for (let i = this.degree(); i >= db; i--) {
      const ri = r[i] ?? ZERO;
      if (ri.isZero()) continue;
      const coef = ri.mul(lcbInv);
      const k = i - db;
      q[k] = coef;
      for (let j = 0; j <= db; j++) {
        r[k + j] = (r[k + j] ?? ZERO).sub(coef.mul(b.coeff(j)));
      }
    }
    return { q: QiPoly.fromCoeffs(q), r: QiPoly.fromCoeffs(r.slice(0, db)) };
  }

  /** Exact quotient this / b, throwing if the division leaves a remainder. */
  divExact(b: QiPoly): QiPoly {
    const { q, r } = this.divmod(b);
    if (!r.isZero()) throw new Error("QiPoly.divExact: inexact division");
    return q;
  }

  /** Horner evaluation at a field point. */
  eval(x: Gauss): Gauss {
    let acc = ZERO;
    for (let i = this.coeffs.length - 1; i >= 0; i--) acc = acc.mul(x).add(this.coeff(i));
    return acc;
  }

  /** Formal derivative d/dvar. */
  derivative(): QiPoly {
    if (this.coeffs.length <= 1) return QiPoly.zero();
    const out: Gauss[] = [];
    for (let k = 1; k < this.coeffs.length; k++) out.push(this.coeff(k).mul(Gauss.int(k)));
    return QiPoly.fromCoeffs(out);
  }

  /** This polynomial divided by its leading coefficient (monic; the zero polynomial is unchanged). */
  monic(): QiPoly {
    if (this.isZero()) return this;
    return this.scale(this.leadingCoeff().inv());
  }

  /** The monic GCD over ℚ(i) (Euclidean algorithm); gcd(0,0) = 0. */
  gcd(o: QiPoly): QiPoly {
    let a = QiPoly.fromCoeffs(this.coeffs); // a copy, so `this` is not aliased
    let b: QiPoly = o;
    while (!b.isZero()) {
      const r = a.divmod(b).r;
      a = b;
      b = r;
    }
    return a.isZero() ? a : a.monic();
  }

  /** The squarefree part p / gcd(p, p′) — same roots as p, each with multiplicity one. */
  squarefreePart(): QiPoly {
    if (this.degree() < 1) return this;
    const g = this.gcd(this.derivative());
    return g.degree() < 1 ? this : this.divExact(g);
  }

  /**
   * The Taylor shift p(var + a), exactly.
   *
   * Repeated synthetic division by (var − a): each remainder is the next coefficient of the shifted
   * polynomial, since dividing out (var − a) k times leaves p^{(k)}(a)/k! behind. Exact over a field
   * and O(deg²), which is the right trade here — the alternative, expanding binomials, is the same
   * cost with far more opportunity to get a sign wrong.
   *
   * This is the primitive that turns "the residue at a" into "the coefficient of var^{-1} of a
   * series about 0": shift the pole to the origin and the Laurent expansion is a series quotient.
   */
  shift(a: Gauss): QiPoly {
    if (this.isZero()) return QiPoly.zero();
    const out: Gauss[] = [];
    let work: Gauss[] = this.coeffs.slice();
    while (work.length > 0) {
      const q = new Array<Gauss>(Math.max(0, work.length - 1));
      let acc = Gauss.ZERO;
      for (let i = work.length - 1; i >= 1; i--) {
        acc = acc.mul(a).add(work[i]);
        q[i - 1] = acc;
      }
      out.push(acc.mul(a).add(work[0]));
      work = q;
    }
    return QiPoly.fromCoeffs(out);
  }
}

/**
 * The extended Euclidean algorithm over ℚ(i)[var]: returns the monic `g = gcd(a, b)` together with
 * cofactors satisfying `s·a + t·b = g`.
 *
 * Needed because the residue at a simple pole is `P/Q′` *evaluated at a root of Q* — and the way to
 * keep that exact without ever naming the root is to compute it in the quotient ring ℚ(i)[z]/⟨Q⟩,
 * where dividing by Q′ means inverting it modulo Q. See {@link invMod}.
 */
export function extendedGcd(a: QiPoly, b: QiPoly): { g: QiPoly; s: QiPoly; t: QiPoly } {
  let r0 = a;
  let r1 = b;
  let s0 = QiPoly.int(1);
  let s1 = QiPoly.zero();
  let t0 = QiPoly.zero();
  let t1 = QiPoly.int(1);

  while (!r1.isZero()) {
    const { q, r } = r0.divmod(r1);
    r0 = r1;
    r1 = r;
    const s2 = s0.sub(q.mul(s1));
    s0 = s1;
    s1 = s2;
    const t2 = t0.sub(q.mul(t1));
    t0 = t1;
    t1 = t2;
  }

  if (r0.isZero()) return { g: r0, s: s0, t: t0 };
  // Normalise so g is monic; the cofactors scale with it so the identity still holds.
  const lead = r0.leadingCoeff().inv();
  return { g: r0.scale(lead), s: s0.scale(lead), t: t0.scale(lead) };
}

/**
 * The inverse of `a` modulo `m`, or `null` when `a` is not invertible there.
 *
 * `null` is a real answer, not a failure: `a` is non-invertible exactly when it shares a factor with
 * `m`, which for `m = Q` and `a = Q′` means Q has a repeated root — i.e. the pole is not simple and
 * the `P/Q′` shortcut does not apply. Returning null rather than throwing lets the caller take the
 * higher-order route instead of treating a legitimate case as an error.
 */
export function invMod(a: QiPoly, m: QiPoly): QiPoly | null {
  const { g, s } = extendedGcd(a, m);
  if (g.degree() !== 0) return null; // a shares a factor with m
  return s.divmod(m).r;
}
