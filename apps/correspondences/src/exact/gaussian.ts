// Exact Gaussian rationals ℚ(i) over BigInt — the coefficient field for the exact correspondence-curve
// engine (roadmap #16). Small, self-contained, and dependency-free so it can be lifted verbatim into a
// shared @cas/* package IF a third consumer appears (CD dynatomic/Gleason, #17); until then it lives in
// the app that needs it (the deltoid family's coefficients c=1, F₂=½ are Gaussian-rational, so the whole
// deleted-correspondence curve is exactly representable here). See ARCHITECTURE.md / RISKS.md §3: the
// algebraic scaffold is exact (=); the dynamics on top of it stay ≈.
//
// This is deliberately a fresh, strict-TS reimplementation of the ℚ(i) tower QD keeps in
// apps/quadrature-domains/app/sym-core.mjs (untyped, app-internal, and physically tangled into the
// Gröbner section) — an app may not import another app, and #16 needs only this contained slice.

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

  toNumber(): number {
    return Number(this.n) / Number(this.d);
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
