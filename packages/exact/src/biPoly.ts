// Exact bivariate polynomials over ℚ(i) — a polynomial in an OUTER variable whose coefficients are QiPolys
// in an INNER variable (so ℚ(i)[inner][outer]). The layer CD's dynatomic Φ_n(z,c) and multiplier δ_n(λ,c)
// need: for Φ_n the outer variable is z and the inner is c, and f_c(z) = z² + c is built and iterated here.
//
// The inner ring ℚ(i)[c] is NOT a field, so general division-with-remainder is not available — but the
// divisions these consumers need are all by MONIC divisors (f^d(z) − z is monic in z), and monic division
// requires no coefficient inversion. `divmodMonic` therefore only accepts a divisor whose leading (outer)
// coefficient is a nonzero CONSTANT (a Gauss unit), which covers every monic case.
//
// Coefficients are little-endian in the outer variable; the array is trimmed (top coefficient nonzero); the
// zero polynomial is the empty array.
import { Gauss } from "./gaussian.js";
import { QiPoly } from "./qiPoly.js";

const QZERO = QiPoly.zero();

export class BiPoly {
  /** Little-endian in the outer variable; coeffs[k] (a QiPoly in the inner variable) multiplies outerᵏ. */
  readonly coeffs: readonly QiPoly[];

  private constructor(coeffs: readonly QiPoly[]) {
    this.coeffs = coeffs;
  }

  static fromCoeffs(coeffs: readonly QiPoly[]): BiPoly {
    let n = coeffs.length;
    while (n > 0 && (coeffs[n - 1] ?? QZERO).isZero()) n--;
    return new BiPoly(coeffs.slice(0, n));
  }

  static zero(): BiPoly {
    return new BiPoly([]);
  }

  /** A constant (in the outer variable): a bare inner-variable polynomial. */
  static constant(p: QiPoly): BiPoly {
    return p.isZero() ? new BiPoly([]) : new BiPoly([p]);
  }

  /** The outer variable itself (degree 1). */
  static variable(): BiPoly {
    return new BiPoly([QZERO, QiPoly.constant(Gauss.ONE)]);
  }

  /** coeff · outerᵏ. */
  static monomial(k: number, coeff: QiPoly): BiPoly {
    if (k < 0 || coeff.isZero()) return BiPoly.zero();
    const cs: QiPoly[] = new Array<QiPoly>(k + 1).fill(QZERO);
    cs[k] = coeff;
    return new BiPoly(cs);
  }

  /** Degree in the outer variable (−1 for the zero polynomial). */
  degree(): number {
    return this.coeffs.length - 1;
  }

  isZero(): boolean {
    return this.coeffs.length === 0;
  }

  /** The coefficient of outerⁱ (the zero QiPoly outside the stored range). */
  coeff(i: number): QiPoly {
    return i >= 0 && i < this.coeffs.length ? (this.coeffs[i] ?? QZERO) : QZERO;
  }

  leadingCoeff(): QiPoly {
    return this.coeffs.length === 0 ? QZERO : (this.coeffs[this.coeffs.length - 1] ?? QZERO);
  }

  equals(o: BiPoly): boolean {
    if (this.coeffs.length !== o.coeffs.length) return false;
    for (let i = 0; i < this.coeffs.length; i++) if (!this.coeff(i).equals(o.coeff(i))) return false;
    return true;
  }

  add(o: BiPoly): BiPoly {
    const n = Math.max(this.coeffs.length, o.coeffs.length);
    const out: QiPoly[] = [];
    for (let i = 0; i < n; i++) out.push(this.coeff(i).add(o.coeff(i)));
    return BiPoly.fromCoeffs(out);
  }

  sub(o: BiPoly): BiPoly {
    const n = Math.max(this.coeffs.length, o.coeffs.length);
    const out: QiPoly[] = [];
    for (let i = 0; i < n; i++) out.push(this.coeff(i).sub(o.coeff(i)));
    return BiPoly.fromCoeffs(out);
  }

  neg(): BiPoly {
    return new BiPoly(this.coeffs.map((c) => c.neg()));
  }

  /** Multiply every coefficient by an inner-variable polynomial (an element of ℚ(i)[inner]). */
  scaleInner(p: QiPoly): BiPoly {
    if (p.isZero()) return BiPoly.zero();
    return BiPoly.fromCoeffs(this.coeffs.map((c) => c.mul(p)));
  }

  mul(o: BiPoly): BiPoly {
    if (this.isZero() || o.isZero()) return BiPoly.zero();
    const out: QiPoly[] = new Array<QiPoly>(this.coeffs.length + o.coeffs.length - 1).fill(QZERO);
    for (let i = 0; i < this.coeffs.length; i++) {
      const a = this.coeff(i);
      if (a.isZero()) continue;
      for (let j = 0; j < o.coeffs.length; j++) out[i + j] = (out[i + j] ?? QZERO).add(a.mul(o.coeff(j)));
    }
    return BiPoly.fromCoeffs(out);
  }

  /** Non-negative integer power (exponentiation by squaring). */
  pow(n: number): BiPoly {
    if (n < 0) throw new Error("BiPoly.pow: negative exponent");
    let result = BiPoly.constant(QiPoly.constant(Gauss.ONE));
    let base = BiPoly.fromCoeffs(this.coeffs);
    for (let e = n; e > 0; e >>= 1) {
      if (e & 1) result = result.mul(base);
      if (e > 1) base = base.mul(base);
    }
    return result;
  }

  /**
   * Division with remainder by a divisor whose leading (outer) coefficient is a nonzero CONSTANT — i.e. a
   * unit of ℚ(i) (every monic divisor qualifies). No coefficient inversion in the inner ring is needed, so
   * the quotient and remainder stay exact polynomials. Throws if the divisor's leading coefficient has
   * positive degree in the inner variable (division would leave the polynomial ring).
   */
  divmodMonic(b: BiPoly): { q: BiPoly; r: BiPoly } {
    if (b.isZero()) throw new Error("BiPoly.divmodMonic: division by zero polynomial");
    const lb = b.leadingCoeff();
    if (lb.degree() !== 0) throw new Error("BiPoly.divmodMonic: divisor leading coefficient must be a constant (unit)");
    const lbInv = lb.coeff(0).inv(); // Gauss inverse of the constant leading coefficient
    const db = b.degree();
    const r: QiPoly[] = this.coeffs.slice();
    const qLen = Math.max(0, this.degree() - db + 1);
    const q: QiPoly[] = new Array<QiPoly>(qLen).fill(QZERO);
    for (let i = this.degree(); i >= db; i--) {
      const ri = r[i] ?? QZERO;
      if (ri.isZero()) continue;
      const coef = ri.scale(lbInv);
      const k = i - db;
      q[k] = coef;
      for (let j = 0; j <= db; j++) r[k + j] = (r[k + j] ?? QZERO).sub(coef.mul(b.coeff(j)));
    }
    return { q: BiPoly.fromCoeffs(q), r: BiPoly.fromCoeffs(r.slice(0, db)) };
  }

  /** Exact quotient this / b (b monic/unit-leading), throwing if a remainder survives. */
  divExactMonic(b: BiPoly): BiPoly {
    const { q, r } = this.divmodMonic(b);
    if (!r.isZero()) throw new Error("BiPoly.divExactMonic: inexact division");
    return q;
  }
}
