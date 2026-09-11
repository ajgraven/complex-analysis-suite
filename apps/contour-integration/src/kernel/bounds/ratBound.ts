// Certified rational bounds on a square root.
//
// This is the primitive the whole exact-ℚ certification tier stands on (PLAN.md §3.2, DESIGN.md §6.1).
// The flagship certified quantity — the ML bound on a vanishing arc for a rational integrand — is
//
//     |P(z)| ≤ Σ|a_k| R^k        |Q(z)| ≥ |b_q| R^q − Σ_{k<q} |b_k| R^k
//
// which is pure `+ × ÷` on non-negative reals *except* for the coefficient moduli |a| = √(re² + im²).
// Bounding those from above and below in ℚ is therefore the only thing standing between us and a
// certification path that needs no floating point and no directed-rounding argument at all — which
// matters because JavaScript offers neither (research 04 §5: ECMA-262 gives `Math.exp` and friends no
// ulp bound whatsoever, so every npm interval library's transcendental is a heuristic in a proof's
// clothing). Nothing in this file calls `Math`.
//
// The contract is exactly two inequalities, and the test verifies them *in ℚ*, which is a complete
// correctness proof rather than a sample of one:
//
//     sqrtDown(c)² ≤ c ≤ sqrtUp(c)²
import { Frac } from "@cas/exact";

/** Sign of a − b for rationals, using that Frac keeps its denominator strictly positive. */
export function fracCmp(a: Frac, b: Frac): -1 | 0 | 1 {
  const lhs = a.n * b.d;
  const rhs = b.n * a.d;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/**
 * Integer square root: the largest `s ≥ 0` with `s² ≤ n`. Newton on BigInt, so it is exact for
 * arbitrarily large inputs — `Math.sqrt(Number(n))` would silently lose the guarantee above 2^53,
 * and "silently" is the whole problem.
 */
export function bigISqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("bigISqrt: negative input");
  if (n < 2n) return n;
  // Seed with a power of two comfortably above √n, so the iteration descends monotonically to the floor.
  let x = 1n << BigInt(((n.toString(2).length + 1) >> 1) + 1);
  for (;;) {
    const next = (x + n / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
}

/** Bit length of a positive BigInt. */
function bitLength(n: bigint): number {
  return n.toString(2).length;
}

/** ⌈a/b⌉ for a ≥ 0, b > 0. */
function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/**
 * Round `u > 0` **upwards** to a nearby rational carrying about `bits` significant bits.
 *
 * Newton's iteration on rationals is exact, which means each step roughly *squares* the denominator:
 * six steps from a 50-digit seed would leave a 3,000-digit fraction carrying maybe 30 useful digits.
 * Rounding up after every step keeps the numbers small, and — because it only ever rounds *up* — it
 * cannot break the `u ≥ √c` invariant that is the entire point of the function. Precision is relative
 * rather than absolute (a fixed dyadic grid would be far too coarse for `√c ≈ 10⁻¹⁵` and far too fine
 * for `√c ≈ 10¹⁵`), so `sqrtUp` behaves the same across the whole range the ML bound will throw at it.
 */
function ceilToPrecision(u: Frac, bits: number): Frac {
  const e = bitLength(u.n) - bitLength(u.d); // u ≈ 2^e
  const k = bits - e;
  if (k >= 0) {
    const scale = 1n << BigInt(k);
    return Frac.of(ceilDiv(u.n * scale, u.d), scale);
  }
  const step = 1n << BigInt(-k); // u is huge: round up to a multiple of 2^(−k)
  return Frac.of(ceilDiv(u.n, u.d * step) * step, 1n);
}

/**
 * Significant bits retained per Newton step — about 29 decimal digits, far more than a `double` can
 * show and enough headroom that the bound stays useful after the arithmetic that consumes it.
 */
export const SQRT_PRECISION_BITS = 96;

/**
 * How many Newton refinements `sqrtUp` runs by default.
 *
 * Each step roughly doubles the correct digits, and the seed's relative error is at worst ~0.41 (at
 * `c = 2`, where `⌊√n⌋ = 1` makes the seed proportionally weakest): 0.41 → 8e-2 → 2.5e-3 → 2e-6 →
 * 1.2e-12 → 5e-25 → the precision floor. Six is therefore the count at which the *worst* input
 * reaches the floor; every other input gets there sooner and exits early via the decrease check.
 */
export const DEFAULT_SQRT_STEPS = 6;

/**
 * A rational `u` with `u ≥ √c`, exact when `c` is a rational square.
 *
 * Seeded from the integer square roots of numerator and denominator rather than from the textbook
 * `(c+1)/2`: with `c = n/d` in lowest terms, `a = ⌊√n⌋` and `b = ⌊√d⌋ ≥ 1` give
 *
 *     (a+1)/b  >  √n/√d  =  √c            because  a + 1 > √n  and  b ≤ √d,
 *
 * which is already correct to within a relative factor of about `1 + 1/a`. The textbook `(c+1)/2` seed
 * is also a valid upper bound, but it converges by *halving* — `O(log c)` steps — so for `c = 10⁶` it
 * needs about ten iterations just to reach the neighbourhood this seed starts in.
 *
 * Newton's iteration `u ← (u + c/u)/2` keeps `u ≥ √c` at every step (AM–GM) and decreases while
 * `u > √c`, so **every** intermediate value is a valid answer and stopping early is safe. Fewer steps
 * cost accuracy, never soundness.
 */
export function sqrtUp(c: Frac, steps: number = DEFAULT_SQRT_STEPS): Frac {
  if (c.n < 0n) throw new Error("sqrtUp: negative input");
  if (c.n === 0n) return Frac.ZERO;

  const a = bigISqrt(c.n);
  const b = bigISqrt(c.d);
  if (a * a === c.n && b * b === c.d) return Frac.of(a, b); // exact: c is a rational square

  const half = Frac.of(1n, 2n);
  let u = ceilToPrecision(Frac.of(a + 1n, b), SQRT_PRECISION_BITS);
  for (let i = 0; i < steps; i++) {
    const next = ceilToPrecision(u.add(c.div(u)).mul(half), SQRT_PRECISION_BITS);
    // Accept only a strict decrease. Mathematically the iteration cannot increase from above, and
    // rounding only ever moves up, so this both asserts that the *implementation* agrees and
    // terminates the loop once the precision floor is reached — a bound that is not one is far worse
    // than a loose one, and extra steps past the floor buy nothing.
    if (fracCmp(next, u) >= 0) break;
    u = next;
  }
  return u;
}

/**
 * A rational `l` with `l ≤ √c`, exact when `c` is a rational square.
 *
 * `c / sqrtUp(c)`: since `u ≥ √c > 0`, dividing gives `c/u ≤ c/√c = √c`. One division, and its
 * soundness is inherited from `sqrtUp`'s rather than argued separately.
 */
export function sqrtDown(c: Frac, steps: number = DEFAULT_SQRT_STEPS): Frac {
  if (c.n < 0n) throw new Error("sqrtDown: negative input");
  if (c.n === 0n) return Frac.ZERO;
  return c.div(sqrtUp(c, steps));
}
