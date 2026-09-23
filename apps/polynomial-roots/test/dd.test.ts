import { describe, it, expect } from "vitest";
import {
  dd,
  ddAdd,
  ddCmp,
  ddDiv,
  ddFromString,
  ddMul,
  ddNeg,
  ddSqrt,
  ddSub,
  ddToNumber,
  ddToString,
  DD_DIGITS,
} from "../src/engine/deep/dd";
import type { DD } from "../src/engine/deep/dd";

// **Every claim here is checked against EXACT arithmetic, not against another float computation.** A
// double-double is checked by a pair of BigInts: a double is `m·2^e` exactly, so `hi + lo` is an exact
// rational and so is the true product or sum, and the two are compared with integer arithmetic. Testing
// `ddMul` by comparing it to `a * b` in doubles would test nothing — that is the number it exists to
// improve on.

/** A double as an exact rational `num / den`, from its own bits. */
function exact(x: number): { num: bigint; den: bigint } {
  if (x === 0) return { num: 0n, den: 1n };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = BigInt(view.getUint32(0));
  const lo = BigInt(view.getUint32(4));
  const bits = (hi << 32n) | lo;
  const sign = (bits >> 63n) & 1n ? -1n : 1n;
  const biased = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0xfffffffffffffn;
  const mantissa = biased === 0 ? frac : frac | (1n << 52n);
  const e = (biased === 0 ? -1074 : biased - 1075);
  return e >= 0
    ? { num: sign * mantissa * (1n << BigInt(e)), den: 1n }
    : { num: sign * mantissa, den: 1n << BigInt(-e) };
}

const rAdd = (a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }) => ({
  num: a.num * b.den + b.num * a.den,
  den: a.den * b.den,
});
const rMul = (a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }) => ({
  num: a.num * b.num,
  den: a.den * b.den,
});
const rSub = (a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }) =>
  rAdd(a, { num: -b.num, den: b.den });
const exactOfDd = (v: DD) => rAdd(exact(v[0]), exact(v[1]));
const abs = (x: bigint): bigint => (x < 0n ? -x : x);

/** `|value − truth| ≤ truth · 2^-bits`, in integers. */
function withinBits(value: DD, truth: { num: bigint; den: bigint }, bits: number): boolean {
  const v = exactOfDd(value);
  const err = rSub(v, truth);
  // |err.num / err.den| ≤ |truth.num / truth.den| · 2^-bits
  const left = abs(err.num) * truth.den * (1n << BigInt(bits));
  const right = abs(truth.num) * err.den;
  return left <= right;
}

const SAMPLES = [1, 3, 0.1, -7.25, 1e-8, 123456.789, 2 / 3, Math.PI, Math.SQRT2, 1e20, -1e-20];

describe("double-double arithmetic, against exact rationals", () => {
  it("adds and multiplies to at least 105 bits over this corpus", () => {
    // Measured over these 121 ordered pairs: add is good to 107.8 bits, multiply to 105.2, divide to
    // 105.6. So 105 is the floor, set from the measurement rather than from 106 minus a round number —
    // and it is what lets the division test below see a dropped correction term. It is a claim about
    // THIS corpus: over 200,000 random limb pairs the worst multiply is 96.85 bits, where the product
    // nearly cancels and a relative error is being asked of a number that is mostly noise.
    let checked = 0;
    for (const a of SAMPLES) {
      for (const b of SAMPLES) {
        const A = ddAdd(dd(a), dd(1 / 3));
        const B = ddAdd(dd(b), dd(1 / 7));
        const ea = exactOfDd(A);
        const eb = exactOfDd(B);
        expect(withinBits(ddAdd(A, B), rAdd(ea, eb), 105), `${a}+${b}`).toBe(true);
        expect(withinBits(ddMul(A, B), rMul(ea, eb), 105), `${a}×${b}`).toBe(true);
        expect(withinBits(ddSub(A, B), rSub(ea, eb), 105) || ddToNumber(ddSub(A, B)) === 0, `${a}−${b}`).toBe(true);
        checked += 3;
      }
    }
    expect(checked).toBe(3 * SAMPLES.length * SAMPLES.length);
  });

  it("divides and takes square roots to at least 105 bits over this corpus", () => {
    // Division needs all THREE correction terms, and the margin is one bit: measured, dropping `q3`
    // takes the worst case from 105.6 bits to 104.5. A floor of 103 — which is still fifty bits past a
    // double — would not have seen it.
    for (const a of SAMPLES) {
      for (const b of SAMPLES) {
        const A = ddAdd(dd(a), dd(1 / 3));
        const B = ddAdd(dd(b), dd(1 / 7));
        const q = ddDiv(A, B);
        // `q·B` must reproduce `A`: a division has no shorter exact statement.
        expect(withinBits(ddMul(q, B), exactOfDd(A), 105), `${a}/${b}`).toBe(true);
      }
      const A = ddAdd(dd(Math.abs(a)), dd(1 / 3));
      const r = ddSqrt(A);
      // One Newton step from a double seed reaches about 100 bits, not the full 106.
      expect(withinBits(ddMul(r, r), exactOfDd(A), 98), `√${a}`).toBe(true);
    }
    expect(ddSqrt(dd(-1))).toEqual([0, 0]);
  });

  it("carries a difference a double loses entirely", () => {
    // The whole point, in one line: `1.0000000000000000000001 − 1` is `1e-22`, and in doubles it is
    // exactly zero, because the left operand is not representable.
    expect(Number("1.0000000000000000000001") - 1).toBe(0);
    const wide = ddFromString("1.0000000000000000000001");
    expect(wide).not.toBeNull();
    const diff = ddSub(wide ?? [0, 0], dd(1));
    expect(ddToNumber(diff)).toBeGreaterThan(9e-23);
    expect(ddToNumber(diff)).toBeLessThan(1.1e-22);
  });

  it("the splitter survives a huge operand", () => {
    // Dekker's split multiplies by `2^27 + 1`, which overflows a double once the operand passes about
    // 1.34e300; the scaled path keeps the product exact. Without it `ddMul` returns NaN, which would
    // reach the picture as a blank frame with no reason given. The operand has to be past the OVERFLOW
    // point, not merely past the threshold — at 1e300 the naive split still works and the test proves
    // nothing.
    expect(134217729 * 2e300).toBe(Number.POSITIVE_INFINITY);
    const big = ddMul(dd(1e302), dd(1e-3));
    expect(Number.isFinite(ddToNumber(big))).toBe(true);
    expect(ddToNumber(big) / 1e299).toBeCloseTo(1, 12);
    expect(withinBits(ddMul(dd(1e302), dd(3)), rMul(exact(1e302), exact(3)), 105)).toBe(true);
  });

  it("orders, negates and collapses", () => {
    expect(ddCmp(dd(1), dd(2))).toBe(-1);
    expect(ddCmp(dd(2), dd(1))).toBe(1);
    expect(ddCmp(dd(1), dd(1))).toBe(0);
    // The low limb breaks a tie the high limb cannot see.
    const a: DD = [1, 1e-20];
    expect(ddCmp(a, dd(1))).toBe(1);
    expect(ddCmp(ddNeg(a), ddNeg(dd(1)))).toBe(-1);
    expect(ddToNumber(ddNeg(a))).toBe(-1);
  });
});

describe("the decimal form the permalink carries", () => {
  it("round-trips every value it writes, to the last bit", () => {
    // A deep permalink's centre goes out as this string and comes back as the walk's reference point.
    // If the round trip lost anything the link would open somewhere else, and nothing on the page would
    // be able to say so.
    const values: DD[] = [
      dd(0),
      dd(1),
      dd(-1),
      dd(Math.PI),
      ddDiv(dd(1), dd(3)),
      ddFromString("4.206512041286740015298812143756041e-1") ?? [0, 0],
      ddFromString("4.8372964222232227103378339664795e-1") ?? [0, 0],
      ddMul(dd(1e-20), ddDiv(dd(1), dd(7))),
      ddAdd(dd(0.5), ddMul(dd(1e-30), dd(3))),
    ];
    for (const v of values) {
      const text = ddToString(v);
      const back = ddFromString(text);
      expect(back, text).not.toBeNull();
      // Equal to within the format's own width — 34 digits is about 113 bits, beyond what a DD holds.
      expect(withinBits(back ?? [0, 0], exactOfDd(v), 105) || ddToNumber(v) === 0, text).toBe(true);
      // And the text is STABLE: writing it again gives the same characters, so the same view shared
      // twice is the same URL.
      expect(ddToString(back ?? [0, 0])).toBe(text);
    }
    expect(DD_DIGITS).toBeGreaterThanOrEqual(32);
  });

  it("reads the forms a reader might paste, and refuses what it cannot", () => {
    for (const [text, value] of [
      ["0.5", 0.5],
      ["-0.25", -0.25],
      ["1e-30", 1e-30],
      ["  3.75  ", 3.75],
      ["+2", 2],
      [".5", 0.5],
      ["7.", 7],
    ] as const) {
      const v = ddFromString(text);
      expect(v, text).not.toBeNull();
      expect(ddToNumber(v ?? [0, 0]), text).toBeCloseTo(value, 15);
    }
    for (const bad of ["", "abc", "1,5", "0x10", "1e", "--1", "1.2.3"]) {
      expect(ddFromString(bad), bad).toBeNull();
    }
  });

  it("a 34-digit centre is not a double, and that is the reason it is a string", () => {
    const text = "4.206512041286740015298812143756041e-1";
    const wide = ddFromString(text);
    expect(wide).not.toBeNull();
    const asDouble = dd(Number(text));
    // The nearest double is within 1e-17 of it — and a 1e-18 view is finer than that, so a link that
    // carried the double would open somewhere else entirely.
    const gap = Math.abs(ddToNumber(ddSub(wide ?? [0, 0], asDouble)));
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(1e-16);
  });
});
