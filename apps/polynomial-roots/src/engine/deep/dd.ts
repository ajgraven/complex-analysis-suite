// Double-double arithmetic: a pair of float64s carrying ~106 bits, for the deep-zoom reference point.
//
// **Why this is not `@cas/gpu/df64`, which ADR-0046 decision 3 said to reuse.** Measured: `df64Ref.ts`
// is a pair of **float32**s — every operation runs through `Math.fround`, because its job is to be the
// spec for GLSL, where float32 IS the native type. A df64 carries ~46–48 bits of mantissa, so on the
// CPU it is a DOWNGRADE from the 53 bits a plain JS number already has. The plan's ladder — "float64,
// then `@cas/gpu/df64` below a pixel of 1e-13" — therefore steps DOWN at exactly the point it means to
// step up.
//
// What the decision was really asking for is the same ALGORITHMS at one higher radix, and that is what
// this file is: Dekker's split, Knuth's two-sum, the same error-free transforms `df64Ref.ts` uses, over
// float64 instead of float32. It is a transliteration of that file with `Math.fround` removed and the
// split factor moved from `2^12 + 1` to `2^27 + 1`, which is the reuse the ADR wanted and the only form
// of it that is an improvement. `@cas/gpu/df64` stays what it is: the GPU's tool, and the shader's.
//
// **The floor.** ~106 bits is a relative precision of about 1.2e-32, so a view centred at `|z| ≈ 1` can
// be resolved to roughly 1e-30 — ADR-0046 decision 3's stated floor, reached rather than assumed. A
// plain float64 centre gives out three orders above 1e-14.
//
// Not extracted to a package: one consumer (ADR-0007). `test/dd.test.ts` pins every operation against
// exact BigInt arithmetic rather than against another float computation.

/** A double-double: `hi + lo`, each an IEEE double, with `|lo| ≤ ulp(hi)/2`. */
export type DD = readonly [hi: number, lo: number];

export const DD_ZERO: DD = [0, 0];
export const DD_ONE: DD = [1, 0];

/** Dekker's split factor for float64: `2^27 + 1`. */
const SPLITTER = 134217729;

/** Above this a naive split overflows; scale down by `2^28`, split, scale back (exact both ways). */
const SPLIT_THRESHOLD = 6.69692879491417e299; // 2^996

/** Lift a double into a double-double. Exact. */
export function dd(x: number): DD {
  return [x, 0];
}

/** Collapse to the nearest double. */
export function ddToNumber(a: DD): number {
  return a[0] + a[1];
}

/** Error-free sum: `s = a + b` rounded, `e` the exact rounding error. */
function twoSum(a: number, b: number): DD {
  const s = a + b;
  const bb = s - a;
  return [s, a - (s - bb) + (b - bb)];
}

/** Error-free sum when `|a| ≥ |b|`. */
function quickTwoSum(a: number, b: number): DD {
  const s = a + b;
  return [s, b - (s - a)];
}

/** Dekker split of a double into two ~26-bit halves. */
function split(a: number): DD {
  if (a > SPLIT_THRESHOLD || a < -SPLIT_THRESHOLD) {
    const as = a * 3.7252902984619140625e-9; // a · 2^-28, exact
    const c = SPLITTER * as;
    const hi = c - (c - as);
    return [hi * 268435456, (as - hi) * 268435456]; // · 2^28, exact
  }
  const c = SPLITTER * a;
  const hi = c - (c - a);
  return [hi, a - hi];
}

/** Error-free product. */
function twoProd(a: number, b: number): DD {
  const p = a * b;
  const [ah, al] = split(a);
  const [bh, bl] = split(b);
  return [p, ah * bh - p + ah * bl + al * bh + al * bl];
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
  return quickTwoSum(s, e);
}

export function ddSub(a: DD, b: DD): DD {
  return ddAdd(a, ddNeg(b));
}

export function ddMul(a: DD, b: DD): DD {
  const [p, e0] = twoProd(a[0], b[0]);
  const e = e0 + a[0] * b[1] + a[1] * b[0];
  return quickTwoSum(p, e);
}

export function ddDiv(a: DD, b: DD): DD {
  const q1 = a[0] / b[0];
  let r = ddSub(a, ddMul(b, [q1, 0]));
  const q2 = r[0] / b[0];
  r = ddSub(r, ddMul(b, [q2, 0]));
  const q3 = r[0] / b[0];
  const [s, e] = quickTwoSum(q1, q2);
  return ddAdd([s, e], [q3, 0]);
}

export function ddAbs(a: DD): DD {
  return a[0] < 0 ? ddNeg(a) : a;
}

/** `√a` by one Newton step on a double seed — the `dfSqrt` algorithm at this radix. */
export function ddSqrt(a: DD): DD {
  if (a[0] <= 0) return DD_ZERO;
  const x = 1 / Math.sqrt(a[0]);
  const y = a[0] * x;
  const d = ddSub(a, ddMul([y, 0], [y, 0]));
  return ddAdd([y, 0], [d[0] * x * 0.5, 0]);
}

/** −1, 0 or 1. */
export function ddCmp(a: DD, b: DD): number {
  if (a[0] < b[0]) return -1;
  if (a[0] > b[0]) return 1;
  if (a[1] < b[1]) return -1;
  if (a[1] > b[1]) return 1;
  return 0;
}

/** Digits `ddToString` writes. ~106 bits is 31.9 decimal digits, so 34 determines the value uniquely. */
export const DD_DIGITS = 34;

/** A double as an exact rational `num / 2^k`, from its own bits. */
function exactDouble(x: number): { num: bigint; den: bigint } {
  if (x === 0 || !Number.isFinite(x)) return { num: 0n, den: 1n };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = (BigInt(view.getUint32(0)) << 32n) | BigInt(view.getUint32(4));
  const sign = (bits >> 63n) & 1n ? -1n : 1n;
  const biased = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0xfffffffffffffn;
  const mantissa = biased === 0 ? frac : frac | (1n << 52n);
  const e = biased === 0 ? -1074 : biased - 1075;
  return e >= 0 ? { num: sign * mantissa * (1n << BigInt(e)), den: 1n } : { num: sign * mantissa, den: 1n << BigInt(-e) };
}

/** The exact value of a double-double, as a rational. Both limbs are dyadic, so their sum is too. */
function exactDd(a: DD): { num: bigint; den: bigint } {
  const hi = exactDouble(a[0]);
  const lo = exactDouble(a[1]);
  return { num: hi.num * lo.den + lo.num * hi.den, den: hi.den * lo.den };
}

/** The nearest double to `num / den` (`den > 0`), by exact integer arithmetic. */
function ratToDouble(num: bigint, den: bigint): number {
  if (num === 0n) return 0;
  const neg = num < 0n;
  const n = neg ? -num : num;
  const bits = (x: bigint): number => x.toString(2).length;
  // Scale so the quotient has 54 bits, then round to 53.
  let shift = 54 - (bits(n) - bits(den));
  const quotient = (sh: number): bigint => (sh >= 0 ? (n << BigInt(sh)) / den : n / (den << BigInt(-sh)));
  let q = quotient(shift);
  while (bits(q) > 54) {
    shift -= 1;
    q = quotient(shift);
  }
  while (bits(q) < 54) {
    shift += 1;
    q = quotient(shift);
  }
  const rounded = (q + 1n) >> 1n; // round half away from zero — a half-ulp tie either way is a half ulp
  const value = Number(rounded) * Math.pow(2, -(shift - 1));
  return neg ? -value : value;
}

/** `count` correctly-rounded decimal digits of `num/den > 0`, with the exponent of the first. */
function decimalDigits(num: bigint, den: bigint, count: number): { digits: string; exponent: number } {
  let e = Math.floor((num.toString(2).length - den.toString(2).length) * Math.LOG10E * Math.LN2);
  for (let guard = 0; guard < 6; guard++) {
    const m = count - 1 - e;
    const sn = m >= 0 ? num * 10n ** BigInt(m) : num;
    const sd = m >= 0 ? den : den * 10n ** BigInt(-m);
    const q = (2n * sn + sd) / (2n * sd); // round to nearest
    const text = q.toString();
    if (text.length === count) return { digits: text, exponent: e };
    e += text.length - count;
  }
  return { digits: "0".repeat(count), exponent: 0 };
}

/**
 * A decimal string carrying the whole value, EXACTLY.
 *
 * The digits come from BigInt arithmetic on the value's own bits rather than from repeated `×10` in
 * double-double, and `ddFromString` rounds correctly back. The first draft did both by accumulation and
 * the round trip was not stable — `π` printed, parsed and printed again differed in its last three
 * digits, so the same view shared twice would have been two different URLs.
 *
 * The permalink carries the deep view's centre this way rather than as the `[hi, lo]` pair, which is
 * also exact and is two JSON numbers: a permalink is a thing people read, paste and edit, and
 * `0.4206512041286740015…` is a number a reader can check against a paper while `[0.42065120412867399,
 * 1.5e-17]` is not.
 */
export function ddToString(a: DD): string {
  const value = exactDd(a);
  if (value.num === 0n) return "0";
  const neg = value.num < 0n;
  const { digits, exponent } = decimalDigits(neg ? -value.num : value.num, value.den, DD_DIGITS);
  const body = `${digits[0]}.${digits.slice(1).replace(/0+$/, "") || "0"}`;
  return `${neg ? "-" : ""}${body}e${exponent}`;
}

/** Read a decimal string back, correctly rounded. Accepts anything `Number` does plus `ddToString`'s. */
export function ddFromString(text: string): DD | null {
  const t = text.trim();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(t);
  if (m === null) return null;
  const intPart = m[2];
  const fracPart = m[3] ?? "";
  if (intPart === "" && fracPart === "") return null;
  const exp = m[4] === undefined ? 0 : Number(m[4]);
  if (!Number.isFinite(exp) || Math.abs(exp) > 5000) return null;
  const mantissa = BigInt(`${intPart}${fracPart}` || "0");
  const scale = exp - fracPart.length;
  let num = mantissa;
  let den = 1n;
  if (scale >= 0) num *= 10n ** BigInt(scale);
  else den = 10n ** BigInt(-scale);
  if (m[1] === "-") num = -num;
  if (num === 0n) return DD_ZERO;
  // Two correctly-rounded steps: the leading double, then the exact remainder's leading double.
  const hi = ratToDouble(num, den);
  const eh = exactDouble(hi);
  const rn = num * eh.den - eh.num * den;
  const rd = den * eh.den;
  const lo = rn === 0n ? 0 : ratToDouble(rn, rd);
  return quickTwoSum(hi, lo);
}
