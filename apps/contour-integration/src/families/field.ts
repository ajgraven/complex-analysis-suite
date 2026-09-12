// The field Pass 5's elimination runs over — and why there has to be more than one.
//
// `linear.ts` exists because rank must be **DECIDED, never thresholded**: four classical traps
// collapse into one rank condition, and a rank read off a float SVD with a tolerance would make all
// four a matter of tuning. Over `Frac` that is free — a pivot is zero or it is not. Tiers A–C need
// nothing else, because every coefficient there is `0` or `1`.
//
// D4 is where it stops. Its lower edge reproduces an AFFINE COMBINATION of three real integrals,
// `−(1, 4πi, −4π²)·(T2, T1, T0)`, so `M` carries a `4π²` and a `−4πi` and no rational matrix holds
// it. ADR-0041 took the decision — the symbolic entry wins, because the rational rescaling does not
// generalise: for `R = 1/(1+x²)` the unknowns `T0 = π/2` and `T2 = π³/8` have π-degrees 1 and 3,
// while for `R = 1/(1+x²)²` both `T0 = π/4` and `T1 = −π/4` are degree 1, and no single exponent
// assignment clears π across the two.
//
// **π IS TRANSCENDENTAL, SO ℚ(i)[π] IS A POLYNOMIAL RING** and its fraction field admits exact
// elimination — same arithmetic, same decision, one level up. That is the whole content of this file:
// a five-method interface, and two instances of it.
import { Frac, Gauss, QiPoly, bigGcd } from "@cas/exact";
import { formatFrac, gaussTerms, joinTerms, type Term } from "../kernel/formatExact.js";

/**
 * What elimination needs of a coefficient, and nothing more.
 *
 * Deliberately not an algebra: no ordering (there is no pivoting by magnitude — `linear.ts` takes the
 * FIRST non-zero pivot, because there is no growth to control in an exact field), and no `div`
 * (`mul` by `inv` is the same thing and one fewer law to state).
 */
export interface Field<T> {
  readonly zero: T;
  readonly one: T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  /** The multiplicative inverse. The caller has already checked `isZero`. */
  inv(a: T): T;
  neg(a: T): T;
  isZero(a: T): boolean;
  equals(a: T, b: T): boolean;
  /** For a message a reader can check — `4π²`, `−1/2`. */
  format(a: T): string;
}

/** ℚ — what tiers A–C need, and what invariant 4 has always run over. */
export const FRAC_FIELD: Field<Frac> = {
  zero: Frac.ZERO,
  one: Frac.ONE,
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  inv: (a) => Frac.ONE.div(a),
  neg: (a) => a.neg(),
  isZero: (a) => a.isZero(),
  equals: (a, b) => a.equals(b),
  format: formatFrac,
};

/**
 * An element of ℚ(i)(π): a rational function of π with Gaussian-rational coefficients.
 *
 * Held as a quotient in lowest terms with a monic denominator, so `equals` is componentwise and
 * `isZero` is a numerator test — both decisions, not comparisons.
 */
export class RatPi {
  readonly num: QiPoly;
  readonly den: QiPoly;

  private constructor(num: QiPoly, den: QiPoly) {
    this.num = num;
    this.den = den;
  }

  /** Normalise: cancel the gcd and make the denominator monic. */
  static of(num: QiPoly, den: QiPoly = QiPoly.constant(Gauss.ONE)): RatPi {
    if (den.isZero()) throw new Error("RatPi: zero denominator");
    if (num.isZero()) return RatPi.ZERO;
    const g = num.gcd(den);
    const n = g.degree() > 0 ? num.divExact(g) : num;
    const d = g.degree() > 0 ? den.divExact(g) : den;
    // A monic denominator fixes the representative, so `1/(2π)` and `(1/2)/π` are the same object.
    const lead = d.leadingCoeff();
    return new RatPi(n.scale(lead.inv()), d.scale(lead.inv()));
  }

  static readonly ZERO = new RatPi(QiPoly.zero(), QiPoly.constant(Gauss.ONE));
  static readonly ONE = new RatPi(QiPoly.constant(Gauss.ONE), QiPoly.constant(Gauss.ONE));

  /** A Gaussian rational, as a constant. */
  static fromGauss(g: Gauss): RatPi {
    return g.isZero() ? RatPi.ZERO : RatPi.of(QiPoly.constant(g));
  }

  /** `c·π^k`, which is the shape every coefficient in the corpus actually has. */
  static piPower(k: number, coefficient: Gauss = Gauss.ONE): RatPi {
    // `QiPoly.monomial` answers a negative power with the ZERO polynomial, so without this guard
    // `piPower(−1)` would quietly be 0 rather than `1/π`. Negative powers go through `of`.
    if (k < 0) throw new Error(`RatPi.piPower: negative power ${k}; use RatPi.of(num, den)`);
    return coefficient.isZero() ? RatPi.ZERO : RatPi.of(QiPoly.monomial(k, coefficient));
  }

  isZero(): boolean {
    return this.num.isZero();
  }

  equals(o: RatPi): boolean {
    // Both normalised with a monic denominator, so componentwise equality is exact.
    return this.num.equals(o.num) && this.den.equals(o.den);
  }

  add(o: RatPi): RatPi {
    return RatPi.of(this.num.mul(o.den).add(o.num.mul(this.den)), this.den.mul(o.den));
  }

  sub(o: RatPi): RatPi {
    return RatPi.of(this.num.mul(o.den).sub(o.num.mul(this.den)), this.den.mul(o.den));
  }

  mul(o: RatPi): RatPi {
    return RatPi.of(this.num.mul(o.num), this.den.mul(o.den));
  }

  neg(): RatPi {
    return new RatPi(this.num.neg(), this.den);
  }

  inv(): RatPi {
    if (this.num.isZero()) throw new Error("RatPi: cannot invert zero");
    return RatPi.of(this.den, this.num);
  }

  /**
   * The real and imaginary parts, exactly.
   *
   * **Only sound because π is REAL.** `Re` of a quotient is not `Re(num)/Re(den)`, so this goes
   * through the conjugate: `n/d = n·conj(d)/(d·conj(d))`, and `d·conj(d)` has real coefficients
   * (the `π^m` coefficient is `Σ_{j+k=m} a_j conj(a_k)`, which pairs into `2Re(a_j conj(a_k))`), so
   * with a real denominator the part can be taken coefficientwise on top.
   *
   * D4 is what needs it: its single complex identity `4π²·T0 − 4πi·T1 = 2πi·Σ` is TWO real equations,
   * and that split is the whole reason its rank is 2 rather than 1.
   */
  re(): RatPi {
    return this.component("re");
  }

  im(): RatPi {
    return this.component("im");
  }

  private component(part: "re" | "im"): RatPi {
    const conj = QiPoly.fromCoeffs(this.den.coeffs.map((c) => c.conj()));
    const top = this.num.mul(conj);
    const bottom = this.den.mul(conj);
    const pick = (g: Gauss): Gauss =>
      part === "re" ? new Gauss(g.re, Frac.ZERO) : new Gauss(g.im, Frac.ZERO);
    return RatPi.of(QiPoly.fromCoeffs(top.coeffs.map(pick)), bottom);
  }

  /** `c·π^k` read back out, when that is the shape. `null` for anything else. */
  asPiMonomial(): { readonly power: number; readonly coefficient: Gauss } | null {
    if (this.den.degree() > 0) return null;
    const top = this.num.degree();
    if (top < 0) return { power: 0, coefficient: Gauss.ZERO };
    for (let k = 0; k < top; k++) if (!this.num.coeff(k).isZero()) return null;
    return { power: top, coefficient: this.num.coeff(top).div(this.den.coeff(0)) };
  }

  /** **The one crossing into the numeric plane.** A decimal of this is `≈`, as always. */
  toNumber(): [number, number] {
    const at = (p: QiPoly): [number, number] => {
      let re = 0;
      let im = 0;
      for (let k = p.degree(); k >= 0; k--) {
        const [cr, ci] = p.coeff(k).toTuple();
        re = re * Math.PI + cr;
        im = im * Math.PI + ci;
      }
      return [re, im];
    };
    const [nr, ni] = at(this.num);
    const [dr, di] = at(this.den);
    const mod2 = dr * dr + di * di;
    return [(nr * dr + ni * di) / mod2, (ni * dr - nr * di) / mod2];
  }
}

const SUPERSCRIPTS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const superscript = (k: number): string =>
  String(k)
    .split("")
    .map((d) => SUPERSCRIPTS[Number(d)] ?? d)
    .join("");

/** `π^k` as a symbol to hang a coefficient on: ``, `π`, `π²`, `π³`. */
const piSymbol = (k: number): string => (k === 0 ? "" : k === 1 ? "π" : `π${superscript(k)}`);

/** The terms of `Σ cₖ π^k`, highest power first. */
function polyTerms(p: QiPoly): Term[] {
  const terms: Term[] = [];
  for (let k = p.degree(); k >= 0; k--) {
    const c = p.coeff(k);
    if (c.isZero()) continue;
    terms.push(...gaussTerms(c, piSymbol(k)));
  }
  return terms;
}

const lcm = (a: bigint, b: bigint): bigint => (a / bigGcd(a, b)) * b;

/** The lcm of every coefficient denominator — what a printed quotient has to be cleared by. */
function denominatorLcm(p: QiPoly): bigint {
  return p.coeffs.reduce((l, c) => lcm(lcm(l, c.re.d), c.im.d), 1n);
}

/** `π`, `π²`, `π³` — the denominators that can follow a slash without parentheses. */
function isBarePiPower(p: QiPoly): boolean {
  const top = p.degree();
  if (top < 1 || !p.leadingCoeff().equals(Gauss.ONE)) return false;
  for (let k = 0; k < top; k++) if (!p.coeff(k).isZero()) return false;
  return true;
}

/**
 * A coefficient as a reader would write it: `4π²`, `−4iπ`, `1/2`, `π³`, `1/(4π²)`, `2π/(π² + 1)`.
 *
 * Built on `formatExact.ts`'s term machinery rather than beside it, so the sign and unit-coefficient
 * conventions are the app's single set. A quotient is parenthesised only where it has to be.
 *
 * Terms run highest power first, as a polynomial is written: `π² − 1`, and so also `−π² + 1`.
 */
export function formatRatPi(x: RatPi): string {
  if (x.den.degree() === 0 && x.den.coeff(0).equals(Gauss.ONE)) return joinTerms(polyTerms(x.num));
  // The monic-denominator normal form pushes rational scalars up into the numerator, so `1/(4π²)`
  // is HELD as `(1/4)/π²` and would print as the ambiguous `1/4/π²`. Clearing the coefficient
  // denominators from both sides at once leaves the value alone and puts the 4 back where a reader
  // expects it. Display only — the stored representative stays canonical.
  const clear = Gauss.int(lcm(denominatorLcm(x.num), denominatorLcm(x.den)));
  const bottom = x.den.scale(clear);
  const terms = polyTerms(x.num.scale(clear));
  const num = joinTerms(terms);
  const den = joinTerms(polyTerms(bottom));
  // A denominator needs its parentheses unless it is a bare power of π: `1/4π²` would read as
  // `(1/4)π²`, which is a different number, while `1/π` and `2π/(π² + 1)` are unambiguous.
  return `${terms.length > 1 ? `(${num})` : num}/${isBarePiPower(bottom) ? den : `(${den})`}`;
}

/** ℚ(i)(π) — what D4 and D5 need. */
export const RAT_PI_FIELD: Field<RatPi> = {
  zero: RatPi.ZERO,
  one: RatPi.ONE,
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  inv: (a) => a.inv(),
  neg: (a) => a.neg(),
  isZero: (a) => a.isZero(),
  equals: (a, b) => a.equals(b),
  format: formatRatPi,
};
