import { describe, expect, it } from "vitest";
import {
  canCommute,
  commuteLastTwo,
  inverted,
  nodes,
  withLasso,
} from "../src/shell/loopEdit.js";
import type { Loop } from "../src/engine/loops/loop.js";

const L = (point: number, sign: 1 | -1 = 1): Loop => ({ kind: "lasso", point, sign });

describe("editing a loop word", () => {
  it("sets or appends a lasso", () => {
    expect(withLasso(null, 2, true)).toEqual(L(2));
    expect(withLasso(L(0), 2, false)).toEqual(L(2));
    expect(withLasso(L(0), 2, true)).toEqual({ kind: "word", parts: [L(0), L(2)] });
    expect(withLasso({ kind: "word", parts: [L(0), L(1)] }, 2, true)).toEqual({
      kind: "word",
      parts: [L(0), L(1), L(2)],
    });
  });

  it("inverts: a lasso flips its sign, an inverse unwraps, anything else is wrapped", () => {
    expect(inverted(L(1))).toEqual(L(1, -1));
    expect(inverted(L(1, -1))).toEqual(L(1));
    const w: Loop = { kind: "word", parts: [L(0), L(1)] };
    expect(inverted(w)).toEqual({ kind: "inverse", of: w });
    expect(inverted(inverted(w))).toEqual(w);
  });

  it("makes [a, b] of the last two parts IN ORDER — [b, a] is its inverse, a different loop", () => {
    expect(canCommute(L(0))).toBe(false);
    expect(commuteLastTwo({ kind: "word", parts: [L(0), L(1)] })).toEqual({
      kind: "commutator",
      a: L(0),
      b: L(1),
    });
    expect(commuteLastTwo({ kind: "word", parts: [L(2), L(0), L(1)] })).toEqual({
      kind: "word",
      parts: [L(2), { kind: "commutator", a: L(0), b: L(1) }],
    });
  });

  it("lists the tree depth-first", () => {
    const t: Loop = { kind: "commutator", a: L(0), b: { kind: "inverse", of: L(1) } };
    expect(nodes(t).map((n) => n.depth)).toEqual([0, 1, 1, 2]);
  });
});
