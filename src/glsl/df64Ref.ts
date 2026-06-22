/**
 * Reference implementation of the double-float (df64) primitives, in JavaScript,
 * using `Math.fround` to simulate GLSL's 32-bit `float`. A df64 value is a pair
 * `[hi, lo]` of float32s whose sum carries ~46–48 bits of mantissa (vs. 24).
 *
 * This is the canonical spec for the algorithms — the GLSL in `./df64.glsl`
 * transliterates these line-for-line. The unit tests (`test/df64.test.ts`) check
 * that these operations extend precision well beyond single `float`, which gives
 * confidence in the GLSL port (whose precision can't be unit-tested directly).
 *
 * Algorithms are the standard Dekker/Knuth error-free transforms used by GPU
 * "double-single" libraries (two-sum, split-based two-product, Newton division
 * and square root).
 */

const f = Math.fround;

/** A double-float: hi + lo, each an IEEE single. */
export type DF = readonly [hi: number, lo: number];

/** Split a double into the nearest df64 (hi = nearest float32, lo = residual). */
export function df(x: number): DF {
  const hi = f(x);
  return [hi, f(x - hi)];
}

/** Collapse a df64 back to a JS double. */
export function toNumber(a: DF): number {
  return a[0] + a[1];
}

/** Error-free sum of two floats: s = a+b (rounded), e = the rounding error. */
function twoSum(a: number, b: number): DF {
  const s = f(a + b);
  const b2 = f(s - a);
  const err = f(f(a - f(s - b2)) + f(b - b2));
  return [s, err];
}

/** Fast error-free sum when |a| >= |b|. */
function quickTwoSum(a: number, b: number): DF {
  const s = f(a + b);
  return [s, f(b - f(s - a))];
}

/** Dekker split of a float32 into two ~12-bit halves (split factor 2^12 + 1). */
function split(a: number): DF {
  const c = f(4097 * a);
  const hi = f(c - f(c - a));
  return [hi, f(a - hi)];
}

/** Error-free product of two floats: p = a*b (rounded), e = the error. */
function twoProd(a: number, b: number): DF {
  const p = f(a * b);
  const [ah, al] = split(a);
  const [bh, bl] = split(b);
  const e = f(f(f(f(ah * bh - p) + f(ah * bl)) + f(al * bh)) + f(al * bl));
  return [p, e];
}

export function dfNeg(a: DF): DF {
  return [-a[0], -a[1]];
}

export function dfAdd(a: DF, b: DF): DF {
  let [s, e] = twoSum(a[0], b[0]);
  const [s2, e2] = twoSum(a[1], b[1]);
  e = f(e + s2);
  [s, e] = quickTwoSum(s, e);
  e = f(e + e2);
  [s, e] = quickTwoSum(s, e);
  return [s, e];
}

export function dfSub(a: DF, b: DF): DF {
  return dfAdd(a, dfNeg(b));
}

export function dfMul(a: DF, b: DF): DF {
  let [p, e] = twoProd(a[0], b[0]);
  e = f(e + f(f(a[0] * b[1]) + f(a[1] * b[0])));
  [p, e] = quickTwoSum(p, e);
  return [p, e];
}

export function dfDiv(a: DF, b: DF): DF {
  const q1 = f(a[0] / b[0]);
  let r = dfSub(a, dfMul(b, [q1, 0]));
  const q2 = f(r[0] / b[0]);
  r = dfSub(r, dfMul(b, [q2, 0]));
  const q3 = f(r[0] / b[0]);
  const [s, e] = quickTwoSum(q1, q2);
  return dfAdd([s, e], [q3, 0]);
}

export function dfSqrt(a: DF): DF {
  if (a[0] <= 0) return [0, 0];
  const x = f(1 / f(Math.sqrt(a[0]))); // approximate 1/sqrt(a)
  const y = f(a[0] * x); // ≈ sqrt(a)
  const d = dfSub(a, dfMul([y, 0], [y, 0])); // a - y²
  const corr = f(f(d[0] * x) * 0.5); // (a - y²)/(2y) ≈ (a-y²)·x/2
  return dfAdd([y, 0], [corr, 0]);
}

/** Compare two df64s: -1, 0, or 1. */
export function dfCmp(a: DF, b: DF): number {
  if (a[0] < b[0]) return -1;
  if (a[0] > b[0]) return 1;
  if (a[1] < b[1]) return -1;
  if (a[1] > b[1]) return 1;
  return 0;
}
