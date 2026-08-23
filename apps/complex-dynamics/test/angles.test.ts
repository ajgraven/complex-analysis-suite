import { describe, expect, it } from "vitest";
import {
  angle,
  binaryItinerary,
  classifyDoubling,
  compare,
  double,
  equals,
  fareyMediant,
  isPeriodic,
  kneadingSequence,
  periodicAngles,
} from "../src/combinatorics/angles";

describe("angle construction & arithmetic", () => {
  it("reduces and folds into [0,1)", () => {
    expect(angle(2, 6)).toEqual({ p: 1, q: 3 });
    expect(angle(7, 7)).toEqual({ p: 0, q: 1 });
    expect(angle(-1, 3)).toEqual({ p: 2, q: 3 }); // fold negatives
    expect(angle(3, 2)).toEqual({ p: 1, q: 2 }); // fold ≥ 1
  });

  it("doubling map D(θ) = 2θ mod 1", () => {
    expect(double(angle(1, 3))).toEqual({ p: 2, q: 3 });
    expect(double(angle(2, 3))).toEqual({ p: 1, q: 3 }); // 4/3 → 1/3
    expect(double(angle(1, 7))).toEqual({ p: 2, q: 7 });
    expect(double(angle(4, 7))).toEqual({ p: 1, q: 7 }); // 8/7 → 1/7
  });

  it("compares without floating point", () => {
    expect(compare(angle(1, 3), angle(1, 2))).toBe(-1);
    expect(compare(angle(2, 3), angle(1, 2))).toBe(1);
    expect(compare(angle(2, 6), angle(1, 3))).toBe(0);
    expect(equals(angle(2, 6), angle(1, 3))).toBe(true);
  });

  it("compare stays exact when the cross product overflows 2^53 (WP6 / A8)", () => {
    // Two Farey-neighbour angles (consecutive √2 continued-fraction convergents, so |p1·q2 − p2·q1| = 1).
    // Their cross products (~3.3e16) exceed Number.MAX_SAFE_INTEGER, and the OLD Math.sign(float) form
    // rounded the exact-±1 difference to 0 — reporting them EQUAL (a silent misordering that corrupts the
    // arc classification / core-entropy result). BigInt is exact and returns the true sign.
    const a1 = angle(61233502, 147830751);
    const a2 = angle(222314471, 536714611);
    expect(61233502 * 536714611).toBeGreaterThan(Number.MAX_SAFE_INTEGER); // genuinely in the overflow regime
    // Negative control: the pre-fix float form gives 0 (wrong) here.
    expect(Math.sign(61233502 * 536714611 - 222314471 * 147830751)).toBe(0);
    // The fixed BigInt compare gives the true ordering (a1 > a2).
    expect(compare(a1, a2)).toBe(1);
    expect(compare(a2, a1)).toBe(-1);
    // The finding's concrete denominator scale: 1/(2^27−1) vs 2/(2^27−1).
    expect(compare(angle(1, 2 ** 27 - 1), angle(2, 2 ** 27 - 1))).toBe(-1);
  });
});

describe("doubling orbit classification", () => {
  it("periods of periodic angles (odd denominator)", () => {
    expect(classifyDoubling(angle(1, 7))).toEqual({ preperiod: 0, period: 3 });
    expect(classifyDoubling(angle(1, 3))).toEqual({ preperiod: 0, period: 2 });
    expect(classifyDoubling(angle(1, 15))).toEqual({ preperiod: 0, period: 4 });
    expect(isPeriodic(angle(1, 7))).toBe(true);
  });

  it("preperiodic (Misiurewicz) angles (even denominator)", () => {
    // 1/6 → 1/3 → 2/3 → 1/3 …  (c = i): preperiod 1, period 2.
    expect(classifyDoubling(angle(1, 6))).toEqual({ preperiod: 1, period: 2 });
    // 1/4 → 1/2 → 0 → 0 …  preperiod 2, fixed.
    expect(classifyDoubling(angle(1, 4))).toEqual({ preperiod: 2, period: 1 });
    expect(isPeriodic(angle(1, 6))).toBe(false);
  });
});

describe("symbolic sequences", () => {
  it("binary itinerary (cut at 0 and ½)", () => {
    expect(binaryItinerary(angle(1, 7), 3)).toEqual([0, 0, 1]); // 1/7, 2/7, 4/7
  });

  it("kneading sequence has a * iff periodic, at index period−1", () => {
    expect(kneadingSequence(angle(1, 3), 2)).toEqual(["A", "*"]);
    expect(kneadingSequence(angle(1, 7), 3)).toEqual(["A", "A", "*"]);
  });
});

describe("enumeration helpers", () => {
  it("period-n candidate angles m/(2ⁿ−1)", () => {
    expect(periodicAngles(2)).toEqual([
      { p: 0, q: 1 },
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(periodicAngles(3)).toHaveLength(7); // m = 0..6 over 7
  });

  it("Farey mediant", () => {
    expect(fareyMediant(angle(1, 3), angle(1, 2))).toEqual({ p: 2, q: 5 });
  });
});
