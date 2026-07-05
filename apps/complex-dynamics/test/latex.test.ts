import { describe, it, expect } from "vitest";
import { parse } from "../src/expr/parser";
import { toLatex } from "../src/expr/latex";

const tex = (s: string): string => toLatex(parse(s));

describe("toLatex", () => {
  it("renders powers without spurious parentheses", () => {
    expect(tex("z^2+c")).toBe("z^{2} + c");
  });
  it("parenthesises a compound power base", () => {
    expect(tex("(z+c)^2")).toBe("\\left(z + c\\right)^{2}");
  });
  it("uses \\frac for division", () => {
    expect(tex("z/c")).toBe("\\frac{z}{c}");
  });
  it("renders sqrt and conjugate", () => {
    expect(tex("sqrt(z)")).toBe("\\sqrt{z}");
    expect(tex("conjugate(z)")).toBe("\\overline{z}");
  });
  it("renders constants and multiplication", () => {
    expect(tex("pi*i")).toBe("\\pi \\cdot i");
  });
  it("parenthesises a negated sum but not a negated atom or power", () => {
    expect(tex("-(z+c)")).toBe("-\\left(z + c\\right)"); // regression: was the wrong "-z + c"
    expect(tex("-z^2")).toBe("-z^{2}");
  });
});
