import { describe, expect, it } from "vitest";
import {
  cycleType,
  derivedSeries,
  derivedSubgroup,
  formatCycles,
  fromCycles,
  groupElements,
  inverse,
  isPrimitive,
  loopCommutator,
  recogniseSymmetric,
  sign,
  andThen,
  wordPerm,
} from "../src/index.js";

const t = (n: number, a: number, b: number) => fromCycles(n, [[a, b]]);

describe("loop words, travelled left to right", () => {
  it("`andThen` runs the first loop first: σ[i] is where the root that STARTED at i ends", () => {
    const a = fromCycles(3, [[0, 1]]);
    const b = fromCycles(3, [[1, 2]]);
    // Root 0: a takes it to 1, then b takes 1 to 2.
    expect(andThen(a, b)[0]).toBe(2);
    expect(andThen(b, a)[0]).toBe(1);
    expect(wordPerm([a, b], 3)).toEqual(andThen(a, b));
    expect(wordPerm([], 3)).toEqual([0, 1, 2]);
  });

  it("the commutator of two swaps sharing a root is the 3-cycle (1 2 3) — PLAN §7's gate identity", () => {
    const c = loopCommutator(t(5, 0, 1), t(5, 1, 2));
    expect(formatCycles(c)).toBe("(1 2 3)");
    expect(cycleType(c)).toEqual([3]);
    // Disjoint swaps commute: the commutator is trivial.
    expect(formatCycles(loopCommutator(t(5, 0, 1), t(5, 2, 3)))).toBe("()");
  });
});

describe("sign, cycle type, cycle notation", () => {
  it("round-trips cycles and reads parity off them", () => {
    const p = fromCycles(6, [
      [0, 3, 5],
      [1, 2],
    ]);
    expect(formatCycles(p)).toBe("(1 4 6)(2 3)");
    expect(formatCycles(p, 0)).toBe("(0 3 5)(1 2)");
    expect(cycleType(p)).toEqual([3, 2]);
    expect(sign(p)).toBe(-1);
    expect(sign(fromCycles(6, [[0, 1, 2]]))).toBe(1);
    expect(sign(inverse(p))).toBe(-1);
  });
});

describe("primitivity (Atkinson's minimal blocks)", () => {
  it("decides the standard cases", () => {
    const c4 = fromCycles(4, [[0, 1, 2, 3]]);
    expect(isPrimitive([c4, t(4, 0, 1)], 4)).toBe(true); // S4
    expect(isPrimitive([c4, t(4, 0, 2)], 4)).toBe(false); // D4: blocks {0,2}, {1,3}
    expect(isPrimitive([fromCycles(5, [[0, 1, 2, 3, 4]])], 5)).toBe(true); // prime degree
    expect(isPrimitive([t(4, 0, 1)], 4)).toBe(false); // intransitive
  });
});

describe("Sₙ / Aₙ recognition, each route a theorem", () => {
  it("connected transpositions: Sₙ with no enumeration", () => {
    const r = recogniseSymmetric([t(5, 0, 1), t(5, 1, 2), t(5, 2, 3), t(5, 3, 4)], 5);
    expect(r).toEqual({ name: "S", how: "transpositions", order: null });
    // At a degree whose group could never be enumerated.
    const big = Array.from({ length: 23 }, (_, i) => t(24, i, i + 1));
    expect(recogniseSymmetric(big, 24).name).toBe("S");
  });

  it("disconnected transpositions are NOT Sₙ", () => {
    const r = recogniseSymmetric([t(5, 0, 1), t(5, 2, 3), t(5, 3, 4)], 5);
    expect(r.name).toBeNull();
    expect(r.order).toBe(12);
  });

  it("Jordan: primitive + a transposition is Sₙ; primitive + a 3-cycle is Aₙ when every generator is even", () => {
    const c5 = fromCycles(5, [[0, 1, 2, 3, 4]]);
    expect(recogniseSymmetric([c5, t(5, 0, 1)], 5)).toMatchObject({
      name: "S",
      how: "jordan",
    });
    expect(recogniseSymmetric([c5, fromCycles(5, [[0, 1, 2]])], 5)).toMatchObject({
      name: "A",
      how: "jordan",
    });
    const c6 = fromCycles(6, [[0, 1, 2, 3, 4, 5]]); // odd
    expect(recogniseSymmetric([c6, fromCycles(6, [[0, 1, 2]])], 6)).toMatchObject({
      name: "S",
    });
  });

  it("Jordan needs PRIMITIVE, not just transitive: D₄ on four points holds a swap and is not S₄", () => {
    const d4 = [
      t(4, 0, 1),
      fromCycles(4, [
        [0, 2],
        [1, 3],
      ]),
    ];
    expect(recogniseSymmetric(d4, 4)).toEqual({
      name: null,
      how: "enumerated",
      order: 8,
    });
  });

  it("falls back to enumeration, and names nothing it cannot", () => {
    const d5 = [
      fromCycles(5, [[0, 1, 2, 3, 4]]),
      fromCycles(5, [
        [1, 4],
        [2, 3],
      ]),
    ];
    expect(recogniseSymmetric(d5, 5)).toEqual({
      name: null,
      how: "enumerated",
      order: 10,
    });
    expect(groupElements(d5, 5).elements).toHaveLength(10);
  });
});

describe("the derived series", () => {
  it("S₅ stops at A₅ (perfect): not solvable — Abel–Ruffini's group theory", () => {
    const s5 = [fromCycles(5, [[0, 1, 2, 3, 4]]), t(5, 0, 1)];
    const r = derivedSeries(s5, 5);
    expect(r.levels.map((l) => l.order)).toEqual([120, 60, 60]);
    expect(r.solvable).toBe(false);
  });

  it("S₄ ⊵ A₄ ⊵ V₄ ⊵ 1, and S₃ ⊵ A₃ ⊵ 1: solvable", () => {
    const s4 = [fromCycles(4, [[0, 1, 2, 3]]), t(4, 0, 1)];
    expect(derivedSeries(s4, 4).levels.map((l) => l.order)).toEqual([24, 12, 4, 1]);
    expect(derivedSeries(s4, 4).solvable).toBe(true);
    const s3 = [t(3, 0, 1), t(3, 1, 2)];
    expect(derivedSeries(s3, 3).levels.map((l) => l.order)).toEqual([6, 3, 1]);
  });

  it("the derived subgroup of an abelian group is trivial", () => {
    expect(derivedSubgroup([fromCycles(5, [[0, 1, 2, 3, 4]])], 5)).toEqual({
      generators: [],
      order: 1,
      capped: false,
    });
  });
});
