import { describe, expect, it } from "vitest";
import { doublingPeriod, internalAddress, kneadingSequence } from "../src/render/internalAddress";

const addr = (p: number, q: number): number[] | null => internalAddress(p, q)?.address ?? null;

describe("internalAddress — the combinatorial GPS of a hyperbolic component", () => {
  it("basilica (period-2 bulb): both root angles 1/3, 2/3 give 1→2", () => {
    expect(addr(1, 3)).toEqual([1, 2]);
    expect(addr(2, 3)).toEqual([1, 2]);
  });

  it("THE money oracle: rabbit (1→3) vs airplane (1→2→3) — same period 3, different address", () => {
    // Rabbit = the 1/3-bulb, a satellite of the main cardioid ⇒ straight 1→3.
    expect(addr(1, 7)).toEqual([1, 3]);
    expect(addr(2, 7)).toEqual([1, 3]); // its other root angle agrees
    // Airplane = primitive period-3 on the real axis ⇒ its vein passes through period 2.
    expect(addr(3, 7)).toEqual([1, 2, 3]);
    expect(addr(4, 7)).toEqual([1, 2, 3]);
  });

  it("corabbit (2/3-bulb) shares the rabbit's address 1→3", () => {
    expect(addr(5, 7)).toEqual([1, 3]);
    expect(addr(6, 7)).toEqual([1, 3]);
  });

  it("the full period-4 census (denominator 2⁴−1 = 15) has the right addresses", () => {
    expect(addr(1, 15)).toEqual([1, 4]); // 1/4 satellite bulb of the main cardioid
    expect(addr(2, 5)).toEqual([1, 2, 4]); // 6/15 — the period-doubling cascade
    expect(addr(1, 5)).toEqual([1, 3, 4]); // 3/15 — satellite of the period-3 rabbit
    expect(addr(7, 15)).toEqual([1, 2, 3, 4]); // primitive period-4
  });

  it("period-5 examples land on strictly increasing addresses ending at 5", () => {
    expect(addr(1, 31)).toEqual([1, 5]); // 1/5 satellite bulb
    expect(addr(3, 31)).toEqual([1, 4, 5]);
    expect(addr(5, 31)).toEqual([1, 3, 5]);
    expect(addr(11, 31)).toEqual([1, 2, 5]);
  });

  it("reduces the angle before computing (5/15 = 1/3 ⇒ 1→2)", () => {
    const r = internalAddress(5, 15);
    expect(r?.address).toEqual([1, 2]);
    expect(r?.angle).toEqual({ p: 1, q: 3 }); // reported in lowest terms
    expect(r?.period).toBe(2);
  });

  it("refuses a pre-periodic (Misiurewicz) angle — even reduced denominator", () => {
    expect(internalAddress(1, 4)).toBeNull(); // 1/4 lands on a Misiurewicz point, not a component root
    expect(internalAddress(1, 6)).toBeNull();
    expect(doublingPeriod(1, 4)).toBe(0);
    expect(doublingPeriod(1, 6)).toBe(0);
  });

  it("the address always starts at 1 and ends at the period", () => {
    for (const [p, q] of [[1, 7], [3, 7], [7, 15], [11, 31], [1, 15]] as const) {
      const r = internalAddress(p, q);
      expect(r).not.toBeNull();
      expect(r?.address[0]).toBe(1);
      expect(r?.address[r.address.length - 1]).toBe(r?.period);
      // strictly increasing
      for (let i = 1; i < (r?.address.length ?? 0); i++) {
        expect((r as { address: number[] }).address[i]).toBeGreaterThan((r as { address: number[] }).address[i - 1]);
      }
    }
  });

  it("kneading sequences match the hand-derived values (ν₁ = 1 always; '*' marks the period)", () => {
    expect(kneadingSequence(1, 3, 2)).toEqual([1, "*"]); // basilica: 1*
    expect(kneadingSequence(1, 7, 3)).toEqual([1, 1, "*"]); // rabbit: 11*
    expect(kneadingSequence(3, 7, 3)).toEqual([1, 0, "*"]); // airplane: 10*
    expect(internalAddress(1, 7)?.kneading).toEqual([1, 1, "*"]);
  });

  it("doublingPeriod is the multiplicative order of 2 mod q", () => {
    expect(doublingPeriod(1, 3)).toBe(2); // ord_3(2)=2
    expect(doublingPeriod(1, 7)).toBe(3); // ord_7(2)=3
    expect(doublingPeriod(1, 15)).toBe(4); // ord_15(2)=4
    expect(doublingPeriod(1, 31)).toBe(5); // ord_31(2)=5
  });
});
