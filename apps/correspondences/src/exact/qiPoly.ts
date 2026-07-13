// Exact univariate polynomials over ℚ(i) — the coefficient ring for the correspondence curve, where the
// single variable is z̄ (the conjugate coordinate; the correspondence is anti-holomorphic, so its curve is
// polynomial in w with coefficients that are polynomials in z̄). Because ℚ(i) is a field, division-with-
// remainder is exact, which the deflation (dividing out the trivial branch) and the fraction-free Bareiss
// determinant (the discriminant → cusp locus) both rely on.
//
// Coefficients are little-endian: coeffs[k] multiplies zbarᵏ. The array is always trimmed so the top
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

  /** The variable itself, zbar (degree 1). */
  static variable(): QiPoly {
    return new QiPoly([ZERO, Gauss.ONE]);
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
}
