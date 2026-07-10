/**
 * Double-double arithmetic: each value is a pair of IEEE doubles `[hi, lo]` whose
 * unevaluated sum carries ~106 bits of mantissa (~31 decimal digits, vs 53 bits / ~16
 * digits for one double). Standard Dekker/Knuth error-free transforms.
 *
 * Used by perturbation deep zoom (Phase 15) to store and accumulate the *view centre*
 * with enough precision to locate the reference orbit far past the ~1e13 a plain double
 * allows. Values handled here are O(1) coordinates, so the split never overflows.
 *
 * This mirrors the float32 `df64Ref` spec but on plain doubles (no `Math.fround`) and
 * with the double split factor 2²⁷+1.
 */

/** A double-double value: hi + lo, each an IEEE double. */
export type DD = readonly [hi: number, lo: number];

/** Promote a plain double to a double-double. */
export function dd(x: number): DD {
  return [x, 0];
}

/** Collapse a double-double back to the nearest double. */
export function ddToNumber(a: DD): number {
  return a[0] + a[1];
}

/** Error-free sum of two doubles: s = a+b (rounded), e = the rounding error. */
function twoSum(a: number, b: number): DD {
  const s = a + b;
  const bb = s - a;
  const err = a - (s - bb) + (b - bb);
  return [s, err];
}

/** Fast error-free sum when |a| >= |b|. */
function quickTwoSum(a: number, b: number): DD {
  const s = a + b;
  return [s, b - (s - a)];
}

const SPLIT = 134217729; // 2²⁷ + 1, the Dekker split factor for IEEE doubles

/** Error-free product of two doubles: p = a*b (rounded), e = the error. */
function twoProd(a: number, b: number): DD {
  const p = a * b;
  const ca = SPLIT * a;
  const ah = ca - (ca - a);
  const al = a - ah;
  const cb = SPLIT * b;
  const bh = cb - (cb - b);
  const bl = b - bh;
  const err = ah * bh - p + ah * bl + al * bh + al * bl;
  return [p, err];
}

export function ddNeg(a: DD): DD {
  return [-a[0], -a[1]];
}

export function ddAdd(a: DD, b: DD): DD {
  let [s, e] = twoSum(a[0], b[0]);
  const [s2, e2] = twoSum(a[1], b[1]);
  e += s2;
  [s, e] = quickTwoSum(s, e);
  e += e2;
  [s, e] = quickTwoSum(s, e);
  return [s, e];
}

/** Add a plain double to a double-double (cheaper than promoting first). */
export function ddAddNumber(a: DD, b: number): DD {
  let [s, e] = twoSum(a[0], b);
  e += a[1];
  [s, e] = quickTwoSum(s, e);
  return [s, e];
}

export function ddSub(a: DD, b: DD): DD {
  return ddAdd(a, ddNeg(b));
}

export function ddMul(a: DD, b: DD): DD {
  let [p, e] = twoProd(a[0], b[0]);
  e += a[0] * b[1] + a[1] * b[0];
  [p, e] = quickTwoSum(p, e);
  return [p, e];
}

/**
 * Serialize a 2-D double-double view centre (x, y) to an exact, round-trippable string
 * "hx,lx,hy,ly" — each limb via Number#toString, which round-trips through Number(). Used to
 * persist a deep-zoom centre in permalinks / saved views: the f64 centre alone loses precision
 * past ~1e6× zoom (rounded display inputs) and runs out entirely past ~1e13×.
 */
export function ddCenterToString(x: DD, y: DD): string {
  return `${x[0]},${x[1]},${y[0]},${y[1]}`;
}

/** Parse "hx,lx,hy,ly" back to [x, y] double-doubles; null if malformed or non-finite. */
export function ddCenterFromString(s: string): [DD, DD] | null {
  const fields = s.split(",");
  if (fields.length !== 4) return null;
  // Number("") and Number("  ") are 0 (not NaN), so a blank field would silently substitute a zero
  // limb — dropping a low word and corrupting a deep-zoom centre while slipping past the finiteness
  // check below. Reject any empty/whitespace field before coercing.
  if (fields.some((f) => f.trim() === "")) return null;
  const p = fields.map(Number);
  if (p.some((v) => !Number.isFinite(v))) return null;
  return [
    [p[0], p[1]],
    [p[2], p[3]],
  ];
}
