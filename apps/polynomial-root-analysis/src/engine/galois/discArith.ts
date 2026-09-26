// Complex disc arithmetic in fixed point (DESIGN §4.6 step 2): every value is a DISC — an exact
// dyadic centre and a radius that bounds the distance to the true value — and every operation returns
// a disc that contains every result its inputs' discs allow. The centres are rounded; the radii
// absorb the rounding, always outward.
//
// Fixed point with S fractional bits: a disc is (re + i·im)·2⁻ˢ with radius r·2⁻ˢ, all three BigInts.
// One scale for everything keeps the error accounting to one line per operation: a product's centre
// is truncated back to S bits (floor, error < 1 ulp in each part, < 2 in modulus) and its radius is
// |a|·r_b + |b|·r_a + r_a·r_b, each modulus bounded ABOVE by an integer square root plus one.
import { isqrt } from "@cas/exact";

export interface Disc {
  readonly re: bigint;
  readonly im: bigint;
  /** Radius in ulps (units of 2⁻ˢ), an upper bound. */
  readonly r: bigint;
}

const ceilShift = (x: bigint, s: bigint): bigint => -(-x >> s);

/** An upper bound on |re + i·im|. */
export function modulusUpper(re: bigint, im: bigint): bigint {
  return isqrt(re * re + im * im) + 1n;
}

export class DiscArith {
  readonly one: bigint;
  private readonly s: bigint;

  constructor(readonly S: number) {
    this.s = BigInt(S);
    this.one = 1n << this.s;
  }

  int(k: bigint): Disc {
    return { re: k << this.s, im: 0n, r: 0n };
  }

  add(a: Disc, b: Disc): Disc {
    return { re: a.re + b.re, im: a.im + b.im, r: a.r + b.r };
  }

  sub(a: Disc, b: Disc): Disc {
    return { re: a.re - b.re, im: a.im - b.im, r: a.r + b.r };
  }

  neg(a: Disc): Disc {
    return { re: -a.re, im: -a.im, r: a.r };
  }

  mul(a: Disc, b: Disc): Disc {
    const re = (a.re * b.re - a.im * b.im) >> this.s;
    const im = (a.re * b.im + a.im * b.re) >> this.s;
    let r = 2n; // the two truncations
    if (a.r !== 0n || b.r !== 0n) {
      const spread =
        modulusUpper(a.re, a.im) * b.r + modulusUpper(b.re, b.im) * a.r + a.r * b.r;
      r += ceilShift(spread, this.s);
    }
    return { re, im, r };
  }

  /** aᵏ, k ≥ 0, by repeated squaring. */
  pow(a: Disc, k: number): Disc {
    let result = this.int(1n);
    let base = a;
    let e = k;
    while (e > 0) {
      if (e & 1) result = this.mul(result, base);
      e >>= 1;
      if (e > 0) base = this.mul(base, base);
    }
    return result;
  }

  /** The disc, as a number pair — for display and for the tests' independent checks. */
  toNumbers(a: Disc): { re: number; im: number; r: number } {
    const f = (x: bigint): number => Number(x) / 2 ** this.S;
    const big = (x: bigint): number => {
      const bits = x < 0n ? (-x).toString(2).length : x.toString(2).length;
      const shift = Math.max(0, bits - 60);
      return (Number(x >> BigInt(shift)) * 2 ** shift) / 2 ** this.S;
    };
    return {
      re: Math.abs(Number(a.re)) < 2 ** 52 ? f(a.re) : big(a.re),
      im: Math.abs(Number(a.im)) < 2 ** 52 ? f(a.im) : big(a.im),
      r: big(a.r),
    };
  }

  /** Is the radius below ½? Then the disc holds at most one integer. */
  narrow(a: Disc): boolean {
    return 2n * a.r < this.one;
  }

  /**
   * The integer this disc holds, when it is narrow enough to hold at most one and does hold one (its
   * imaginary extent reaching 0); null otherwise. Exact.
   */
  integerIn(a: Disc): bigint | null {
    if (!this.narrow(a)) return null;
    const half = this.one >> 1n;
    const n = (a.re + half) >> this.s; // the nearest integer to the centre
    const dRe = a.re - (n << this.s);
    // |centre − n| ≤ r, compared squared and exactly.
    if (dRe * dRe + a.im * a.im > a.r * a.r) return null;
    return n;
  }

  /** Does the disc hold NO integer at all? Exact. */
  excludesIntegers(a: Disc): boolean {
    if (a.im * a.im > a.r * a.r) return true;
    // An integer lies in [re − r, re + r] (scaled) iff ⌊hi⌋ ≥ ⌈lo⌉.
    const floorHi = (a.re + a.r) >> this.s;
    const ceilLo = ceilShift(a.re - a.r, this.s);
    return floorHi < ceilLo;
  }
}

/** ∏ (T − vᵢ), ascending coefficients, in disc arithmetic. */
export function polyFromRoots(A: DiscArith, values: readonly Disc[]): Disc[] {
  let c: Disc[] = [A.int(1n)];
  for (const v of values) {
    const next: Disc[] = new Array<Disc>(c.length + 1);
    next[c.length] = c[c.length - 1];
    for (let k = c.length - 1; k >= 1; k--) next[k] = A.sub(c[k - 1], A.mul(v, c[k]));
    next[0] = A.neg(A.mul(v, c[0]));
    c = next;
  }
  return c;
}
