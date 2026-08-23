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
    // One side overflows a double. Reduce EACH side INDEPENDENTLY to a ~60-bit mantissa (> the double's 53)
    // plus a binary exponent, so all 53 bits of the ratio stay meaningful no matter how the two magnitudes
    // compare — accurate to ≤ 2 ULP (the two `Number()` roundings plus the divide), matching the fast path's
    // own `Number(n)/Number(d)` on large operands; NOT correctly-rounded — then divide the mantissas and
    // recombine the exponents. The old form shifted BOTH sides by the SAME amount: correct only for a ratio
    // near 1, but for a large ratio it truncated the SMALLER side to a few bits (a ~2^-13 error) and, once it
    // hit zero, reported Infinity/0 for a representable ratio in ~[2^1000, 2^1024). (One boundary the ≤ 2-ULP
    // window leaves imperfect: a ratio within a ULP of the ½·MIN_VALUE rounding tie can round to 0 instead of
    // MIN_VALUE — the sub-60-bit residual that breaks the tie is truncated here exactly as on the fast path.
    // Correctly rounding it would need a sticky bit through the full BigInt, unwarranted for a boundary no
    // caller reaches; NB a normalize-q + single-subnormal-multiply rewrite does NOT recover it — the residual
    // is already gone by then.) WP7 / A6.
    const KEEP = 60;
    const neg = this.n < 0n;
    const a = neg ? -this.n : this.n; // Frac normalizes the sign onto the numerator, d > 0
    const b = this.d;
    const ea = Math.max(0, a.toString(2).length - KEEP);
    const eb = Math.max(0, b.toString(2).length - KEEP);
    const ma = Number(ea > 0 ? a >> BigInt(ea) : a); // ≤ KEEP bits ⇒ finite, full mantissa
    const mb = Number(eb > 0 ? b >> BigInt(eb) : b);
    let q = ma / mb; // O(1)-scale, full precision
    let e = ea - eb; // net power of two to reapply
    // Scale by 2^e in bounded chunks so an intermediate never over/underflows when the true result is in
    // range (and correctly reaches ±Infinity / 0 exactly when the ratio genuinely does).
    while (e > 1023 && q !== 0) {
      q *= 2 ** 1023;
      e -= 1023;
    }
    while (e < -1074 && q !== 0) {
      q *= 2 ** -1074;
      e += 1074;
    }
    q *= 2 ** e;
    return neg ? -q : q;
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
