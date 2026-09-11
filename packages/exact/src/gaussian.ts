// Exact Gaussian rationals ℚ(i) over BigInt — the base field of @cas/exact. This package was extracted
// (roadmap #17, ADR-0007 demand-driven) once a third consumer appeared: the exact-poly primitives are now
// shared by correspondences (the deleted-correspondence curve + cusp locus, #16) and CD (dynatomic /
// Gleason / multiplier component data, #17), joining QD's app-internal ℚ(i) tower in sym-core.mjs. A field,
// so every nonzero element is invertible — which is what makes exact polynomial division and the
// fraction-free (Bareiss) determinant/resultant exact.
//
// Strict-TS and dependency-free (like @cas/core), the exact analogue of that numeric kernel. Convention-
// neutral (ADR-0006): no π / 2πi constants. See ARCHITECTURE.md / RISKS.md §3 — the algebraic scaffold the
// apps build on this is exact (=); the dynamics on top of it stay ≈.

/** Euclidean gcd on non-negative magnitudes of BigInts (bigGcd(0,0) = 0). */
export function bigGcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * An exact rational ℚ, stored in lowest terms with a positive denominator (0 = 0/1). Immutable; every
 * operation returns a fresh value.
 */
export class Frac {
  readonly n: bigint; // numerator (carries the sign)
  readonly d: bigint; // denominator, strictly > 0

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  /** Construct n/d in lowest terms (d ≠ 0). */
  static of(n: bigint, d: bigint = 1n): Frac {
    if (d === 0n) throw new Error("Frac: zero denominator");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = bigGcd(n, d);
    return g > 1n ? new Frac(n / g, d / g) : new Frac(n, d);
  }

  static readonly ZERO = new Frac(0n, 1n);
  static readonly ONE = new Frac(1n, 1n);

  isZero(): boolean {
    return this.n === 0n;
  }

  equals(o: Frac): boolean {
    // Both are normalized, so componentwise equality suffices.
    return this.n === o.n && this.d === o.d;
  }

  add(o: Frac): Frac {
    return Frac.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  sub(o: Frac): Frac {
    return Frac.of(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  mul(o: Frac): Frac {
    return Frac.of(this.n * o.n, this.d * o.d);
  }

  div(o: Frac): Frac {
    if (o.n === 0n) throw new Error("Frac: division by zero");
    return Frac.of(this.n * o.d, this.d * o.n);
  }

  neg(): Frac {
    return new Frac(-this.n, this.d);
  }

  /**
   * The nearest double to this rational — the sole crossing from the exact engine into the numeric
   * plane (`Gauss.toTuple` is the only other, and delegates here).
   *
   * `Number(bigint)` saturates to ±Infinity past ~1.8e308, so the direct quotient returned NaN
   * (Infinity/Infinity) for ratios that are themselves perfectly ordinary — and since `Frac` is kept
   * in lowest terms, "numerator and denominator both huge" is a normal state, not a degenerate one:
   * 10^400 / (3·10^400 + 1) is ≈ 1/3 with 401 digits on each side. Unreachable from today's callers
   * (the Gleason degrees are capped well below it) but this is a library boundary, and a NaN here
   * propagates straight into a read-out labelled "= exact". (cd-frac-07)
   */
  toNumber(): number {
    const n = Number(this.n);
    const d = Number(this.d);
    if (Number.isFinite(n) && Number.isFinite(d)) return n / d; // unchanged for everything in range
    if (this.n === 0n) return 0;

    // Scale so the INTEGER quotient carries a fixed number of significant bits, then undo the
    // scaling as a power of two. The previous version shifted numerator and denominator by the same
    // amount, chosen from whichever was larger — which is right when both are huge, but destroys the
    // numerator when only the denominator is. `m / 2^1050` with a 53-bit `m` (which is exactly what
    // an exactly-converted small double looks like) shifted `m` right by ~51 bits and returned a
    // value ~7% wrong, for a ratio that is perfectly representable. (cd-frac-07 follow-up)
    const PREC = 64n;
    const neg = this.n < 0n;
    const a = neg ? -this.n : this.n;
    const b = this.d;
    const exp = PREC - BigInt(a.toString(2).length - b.toString(2).length);
    const q = exp >= 0n ? (a << exp) / b : a / (b << -exp);

    // Apply 2^-exp in bounded steps. Doing it in one `Math.pow` would route an extreme ratio through
    // a subnormal intermediate and lose most of the precision the quotient just earned; each step
    // here only shifts the exponent, so it is exact.
    let value = Number(q);
    let e = -Number(exp);
    const STEP = 1000;
    while (e < -STEP) {
      value *= Math.pow(2, -STEP);
      e += STEP;
    }
    while (e > STEP) {
      value *= Math.pow(2, STEP);
      e -= STEP;
    }
    value *= Math.pow(2, e);
    return neg ? -value : value;
  }
}

/**
 * An exact Gaussian rational a + b·i with a, b ∈ ℚ. Immutable. This is a field (ℚ(i)), so every nonzero
 * element is invertible — which is what makes exact polynomial division (the deflation of the trivial
 * branch) and the fraction-free determinant (the resultant/discriminant) exact.
 */
export class Gauss {
  readonly re: Frac;
  readonly im: Frac;

  constructor(re: Frac, im: Frac) {
    this.re = re;
    this.im = im;
  }

  static readonly ZERO = new Gauss(Frac.ZERO, Frac.ZERO);
  static readonly ONE = new Gauss(Frac.ONE, Frac.ZERO);
  static readonly I = new Gauss(Frac.ZERO, Frac.ONE);

  /** a + b·i from integers (or a single integer for a real value). */
  static int(re: number | bigint, im: number | bigint = 0): Gauss {
    return new Gauss(Frac.of(BigInt(re)), Frac.of(BigInt(im)));
  }

  /** a + b·i from a rational numerator/denominator pair for each part. */
  static rat(reN: bigint, reD: bigint, imN: bigint = 0n, imD: bigint = 1n): Gauss {
    return new Gauss(Frac.of(reN, reD), Frac.of(imN, imD));
  }

  isZero(): boolean {
    return this.re.isZero() && this.im.isZero();
  }

  equals(o: Gauss): boolean {
    return this.re.equals(o.re) && this.im.equals(o.im);
  }

  add(o: Gauss): Gauss {
    return new Gauss(this.re.add(o.re), this.im.add(o.im));
  }

  sub(o: Gauss): Gauss {
    return new Gauss(this.re.sub(o.re), this.im.sub(o.im));
  }

  mul(o: Gauss): Gauss {
    // Real × real is the overwhelmingly common case for this package's consumers — CD's whole
    // dynatomic tower (critical orbit, Gleason Gₙ, Φₙ, multiplierMap, the Sylvester/Bareiss
    // resultant) is built from QiPoly.variable() and Gauss.int, so every element has im = 0, as is
    // the Correspondences deltoid curve. The general form below runs four Frac.mul plus an add and a
    // sub = six Frac.of normalisations, each with its own bigGcd; three of those multiplies are by
    // zero and five of the normalisations are on the value 0. Measured on integer-valued operands
    // (which is what the towers actually hold): 3.0–3.6× faster across 4–120 digit magnitudes.
    //
    // Bit-identical by construction, not by approximation: the dropped terms are exactly zero and
    // Frac is kept normalised, so no representable value can differ. (cd-perf-04)
    if (this.im.isZero() && o.im.isZero()) return new Gauss(this.re.mul(o.re), Frac.ZERO);
    // (a+bi)(c+di) = (ac − bd) + (ad + bc) i
    return new Gauss(
      this.re.mul(o.re).sub(this.im.mul(o.im)),
      this.re.mul(o.im).add(this.im.mul(o.re)),
    );
  }

  neg(): Gauss {
    return new Gauss(this.re.neg(), this.im.neg());
  }

  conj(): Gauss {
    return new Gauss(this.re, this.im.neg());
  }

  /** The norm a² + b² ∈ ℚ (real). Zero only for the zero element. */
  norm2(): Frac {
    return this.re.mul(this.re).add(this.im.mul(this.im));
  }

  /** Multiplicative inverse conj(z)/|z|²; throws on zero. */
  inv(): Gauss {
    const n2 = this.norm2();
    if (n2.isZero()) throw new Error("Gauss: division by zero");
    return new Gauss(this.re.div(n2), this.im.neg().div(n2));
  }

  div(o: Gauss): Gauss {
    return this.mul(o.inv());
  }

  /** Numeric [re, im] tuple (matches @cas/core's ComplexTuple) for numeric cross-checks. */
  toTuple(): [number, number] {
    return [this.re.toNumber(), this.im.toNumber()];
  }
}
