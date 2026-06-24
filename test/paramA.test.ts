import { describe, it, expect } from "vitest";
import { parse } from "../src/expr/parser";
import { isFreeParameter } from "../src/expr/ast";
import { makeComplexFn } from "../src/expr/evaluate";

describe("live parameter `a`", () => {
  it("detects `a` as a free variable", () => {
    expect(isFreeParameter(parse("z^2+c"), "a")).toBe(false);
    expect(isFreeParameter(parse("a*z*(1-z)"), "a")).toBe(true);
    expect(isFreeParameter(parse("z^2+c+a"), "a")).toBe(true);
    expect(isFreeParameter(parse("abs(z) > a"), "a")).toBe(true);
  });

  it("treats a local assignment to `a` as not free (shadowed)", () => {
    expect(isFreeParameter(parse("a = z^2; a + c"), "a")).toBe(false);
  });

  it("binds the `a` value in the evaluator", () => {
    const f = makeComplexFn(parse("z + a"), [3, 0]);
    expect(f([1, 0], [0, 0])).toEqual([4, 0]); // z + a = 1 + 3
    const g = makeComplexFn(parse("a * z"), [0, 2]); // a = 2i
    expect(g([1, 0], [0, 0])).toEqual([0, 2]); // 2i * 1 = 2i
  });

  it("defaults `a` to 0 when omitted", () => {
    const f = makeComplexFn(parse("z + a"));
    expect(f([5, 0], [0, 0])).toEqual([5, 0]);
  });
});
