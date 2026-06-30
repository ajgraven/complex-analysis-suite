import { describe, expect, it } from "vitest";
import { type Angle, classifyDoubling, kneadingSequence } from "../src/combinatorics/angles";
import {
  AddressError,
  addressFromKneading,
  externalAnglePairs,
  formatKneading,
  kneadingFromAddress,
  parseInternalAddress,
  stripExternalAngles,
} from "../src/combinatorics/stripping";

const a = (p: number, q: number): Angle => ({ p, q });

describe("kneadingFromAddress (Phase 1: internal address → ⋆-kneading)", () => {
  it("reproduces the classic kneading words", () => {
    expect(formatKneading(kneadingFromAddress([1]))).toBe("⋆");
    expect(formatKneading(kneadingFromAddress([1, 2]))).toBe("A⋆"); // basilica
    expect(formatKneading(kneadingFromAddress([1, 3]))).toBe("AA⋆"); // rabbit
    expect(formatKneading(kneadingFromAddress([1, 2, 4]))).toBe("ABA⋆"); // period-4 cascade
    expect(formatKneading(kneadingFromAddress([1, 3, 6]))).toBe("AABAA⋆"); // satellite of the rabbit
  });

  it("agrees with the angle-side kneading of the characteristic angle", () => {
    // The address kneading must equal kneadingSequence(θ⁻) (the itinerary defined in angles.ts).
    expect(kneadingFromAddress([1, 3])).toEqual(kneadingSequence(a(1, 7), 3));
    expect(kneadingFromAddress([1, 3, 6])).toEqual(kneadingSequence(a(10, 63), 6));
    expect(kneadingFromAddress([1, 2, 4])).toEqual(kneadingSequence(a(6, 15), 4));
  });
});

describe("addressFromKneading (ρ-function inverse) round-trips", () => {
  // Phase 1 and the ρ-function are mutual inverses on every ⋆-periodic word — including the
  // non-admissible 1-2-4-5-6 (admissibility is a separate property from the address↔kneading bijection).
  for (const addr of [[1], [1, 2], [1, 3], [1, 2, 4], [1, 3, 6], [1, 2, 4, 8], [1, 4, 5], [1, 2, 4, 5, 6]]) {
    it(`recovers ${addr.join("-")}`, () => {
      expect(addressFromKneading(kneadingFromAddress(addr))).toEqual(addr);
    });
  }
});

describe("stripExternalAngles (Phase 2: oracles)", () => {
  it("1-2 → basilica {1/3, 2/3}", () => {
    const r = stripExternalAngles([1, 2]);
    expect(r.realized).toBe(true);
    expect(r.lower).toEqual(a(1, 3));
    expect(r.upper).toEqual(a(2, 3));
  });

  it("1-3 → rabbit {1/7, 2/7}", () => {
    const r = stripExternalAngles([1, 3]);
    expect(r.lower).toEqual(a(1, 7));
    expect(r.upper).toEqual(a(2, 7));
    // The mirror (co-rabbit) wake comes second.
    expect(r.wakes).toHaveLength(2);
    expect(r.wakes[1]).toEqual([a(5, 7), a(6, 7)]);
  });

  it("1-2-4 → period-4 cascade {2/5, 3/5}", () => {
    const r = stripExternalAngles([1, 2, 4]);
    expect(r.lower).toEqual(a(2, 5)); // 6/15
    expect(r.upper).toEqual(a(3, 5)); // 9/15
  });

  it("1-3-6 → {10/63, 17/63}", () => {
    const r = stripExternalAngles([1, 3, 6]);
    expect(r.lower).toEqual(a(10, 63));
    expect(r.upper).toEqual(a(17, 63));
  });

  it("1 → main cardioid cusp at angle 0", () => {
    const r = stripExternalAngles([1]);
    expect(r.realized).toBe(true);
    expect(r.lower).toEqual(a(0, 1));
    expect(r.upper).toEqual(a(0, 1));
  });
});

describe("characteristic angles are well-formed", () => {
  for (const addr of [[1, 2], [1, 3], [1, 2, 4], [1, 3, 6], [1, 2, 4, 8], [1, 4]]) {
    it(`${addr.join("-")}: both angles have period = ${addr[addr.length - 1]} and kneading = ν`, () => {
      const r = stripExternalAngles(addr);
      const n = addr[addr.length - 1];
      expect(r.lower).not.toBeNull();
      expect(r.upper).not.toBeNull();
      if (!r.lower || !r.upper) return;
      // Both characteristic angles are periodic of exactly the component's period…
      expect(classifyDoubling(r.lower)).toEqual({ preperiod: 0, period: n });
      expect(classifyDoubling(r.upper)).toEqual({ preperiod: 0, period: n });
      // …and both carry the component's kneading sequence.
      expect(kneadingSequence(r.lower, n)).toEqual(r.kneading);
      expect(kneadingSequence(r.upper, n)).toEqual(r.kneading);
    });
  }
});

describe("admissibility: non-realised addresses are reported, not guessed", () => {
  it("flags 1-2-4-5-6 as non-admissible (the smallest such address)", () => {
    // ABAAB⋆ is the smallest non-admissible kneading sequence (Bruin–Schleicher); its ρ-address is
    // 1-2-4-5-6. No hyperbolic component realises it, so stripping reports it instead of guessing.
    expect(formatKneading(kneadingFromAddress([1, 2, 4, 5, 6]))).toBe("ABAAB⋆");
    const r = stripExternalAngles([1, 2, 4, 5, 6]);
    expect(r.realized).toBe(false);
    expect(r.lower).toBeNull();
    expect(r.upper).toBeNull();
    expect(r.wakes).toEqual([]);
  });

  it("externalAnglePairs returns no pairs for a non-admissible kneading word", () => {
    expect(externalAnglePairs(["A", "B", "A", "A", "B", "*"])).toEqual([]); // ABAAB⋆
  });

  it("every realised wake pair shares one kneading sequence", () => {
    const pairs = externalAnglePairs(kneadingFromAddress([1, 3]));
    for (const [lo, hi] of pairs) {
      expect(kneadingSequence(lo, 3)).toEqual(kneadingSequence(hi, 3));
    }
  });
});

describe("parseInternalAddress validation", () => {
  it("accepts assorted separators", () => {
    expect(parseInternalAddress("1-3-6")).toEqual([1, 3, 6]);
    expect(parseInternalAddress("1 2 4 8")).toEqual([1, 2, 4, 8]);
    expect(parseInternalAddress("1, 3, 6")).toEqual([1, 3, 6]);
  });

  it("rejects malformed addresses with clear errors", () => {
    expect(() => parseInternalAddress("")).toThrow(AddressError);
    expect(() => parseInternalAddress("2-4")).toThrow(/start with 1/);
    expect(() => parseInternalAddress("1-3-3")).toThrow(/strictly increase/);
    expect(() => parseInternalAddress("1-2-2")).toThrow(/strictly increase/);
    expect(() => parseInternalAddress("1-100")).toThrow(/interactive limit/);
  });
});
