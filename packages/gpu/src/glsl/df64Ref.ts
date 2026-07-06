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

// --- df64 transcendentals (seed-in-float + df64 refinement / series) ----------
//
// These are the spec for the GLSL ports in `./df64.glsl`. Range reduction uses
// only the hi limb (so the integer k/q match the single-precision GLSL), then the
// reduced argument and the series run in df64.

const LN2: DF = df(Math.LN2);
const PI_2: DF = df(Math.PI / 2);

/** df64 exp: reduce a = k·ln2 + r (|r| ≤ ln2/2), Taylor exp(r), scale by 2^k. */
export function dfExp(a: DF): DF {
  if (a[0] <= -88) return [0, 0];
  // Pick k with the hi-limb constant in float32, matching the GLSL exactly (it can only
  // divide by the single-precision LN2_HI = f(Math.LN2) = LN2[0]); dividing by the
  // full-precision Math.LN2 here could pick a different k at a tie boundary.
  const k = Math.round(f(a[0] / LN2[0]));
  const r = dfSub(a, dfMul(LN2, df(k)));
  let term: DF = [1, 0];
  let sum: DF = [1, 0];
  for (let n = 1; n <= 14; n++) {
    term = dfMul(term, dfDiv(r, df(n)));
    sum = dfAdd(sum, term);
  }
  return dfMul(sum, df(Math.pow(2, k)));
}

/** df64 log: single-precision seed refined by two Newton steps y += a·e^-y − 1. */
export function dfLog(a: DF): DF {
  let y = df(Math.log(a[0]));
  for (let i = 0; i < 2; i++) {
    y = dfAdd(y, dfSub(dfMul(a, dfExp(dfNeg(y))), [1, 0]));
  }
  return y;
}

/** df64 sin and cos together: reduce to a quadrant with |r| ≤ π/4, then Taylor. */
export function dfSinCos(a: DF): { sin: DF; cos: DF } {
  // Quadrant index via the hi-limb π/2 in float32, matching the GLSL (see dfExp).
  const q = Math.round(f(a[0] / PI_2[0]));
  const r = dfSub(a, dfMul(PI_2, df(q)));
  const r2 = dfMul(r, r);
  let cterm: DF = [1, 0];
  let csum: DF = [1, 0];
  let sterm: DF = r;
  let ssum: DF = r;
  for (let n = 1; n <= 8; n++) {
    cterm = dfMul(cterm, dfDiv(dfNeg(r2), df((2 * n - 1) * (2 * n))));
    csum = dfAdd(csum, cterm);
    sterm = dfMul(sterm, dfDiv(dfNeg(r2), df(2 * n * (2 * n + 1))));
    ssum = dfAdd(ssum, sterm);
  }
  const qm = ((q % 4) + 4) % 4;
  if (qm === 0) return { sin: ssum, cos: csum };
  if (qm === 1) return { sin: csum, cos: dfNeg(ssum) };
  if (qm === 2) return { sin: dfNeg(ssum), cos: dfNeg(csum) };
  return { sin: dfNeg(csum), cos: ssum };
}

/** df64 atan2: single seed θ₀, then one small-angle correction by rotating (x,y) by −θ₀. */
export function dfAtan2(y: DF, x: DF): DF {
  if (x[0] === 0 && y[0] === 0) return [0, 0];
  const t0 = Math.atan2(y[0], x[0]);
  const { sin: s, cos: c } = dfSinCos(df(t0));
  const rx = dfAdd(dfMul(x, c), dfMul(y, s));
  const ry = dfSub(dfMul(y, c), dfMul(x, s));
  return dfAdd(df(t0), dfDiv(ry, rx));
}
