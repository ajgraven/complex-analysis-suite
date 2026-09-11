import { describe, expect, it } from "vitest";
import { ExprError } from "../src/ast.js";
import { makeComplexFn, parse, toLatex } from "../src/index.js";

const Z0: [number, number] = [0, 0];
const val = (src: string, z: [number, number] = Z0, c: [number, number] = Z0) =>
  makeComplexFn(parse(src))(z, c);

// Implicit multiplication after a number literal. The motivating case is complex literals — nobody
// writes `3+4*i` on paper — but the rule is the general one, and it is deliberately narrow: it fires
// only where a number is IMMEDIATELY followed by an identifier or `(`.
describe("implicit multiplication after a number", () => {
  it("makes complex literals work", () => {
    expect(val("2i")).toEqual([0, 2]);
    const [re, im] = val("3+4i");
    expect(re).toBeCloseTo(3, 12);
    expect(im).toBeCloseTo(4, 12);
    expect(val("0.5i")[1]).toBeCloseTo(0.5, 12);
    expect(val("-2i")[1]).toBeCloseTo(-2, 12);
  });

  it("works for variables, named constants and parentheses", () => {
    expect(val("2z", [3, 0])[0]).toBeCloseTo(6, 12);
    expect(val("2pi")[0]).toBeCloseTo(2 * Math.PI, 12);
    expect(val("2(z+1)", [3, 0])[0]).toBeCloseTo(8, 12);
    expect(val("3z^2", [2, 0])[0]).toBeCloseTo(12, 12);
  });

  it("binds at multiplicative precedence, so ^ still wins", () => {
    // `2i^2` is 2·(i²) = −2, NOT (2i)² = −4. This is the conventional reading, and it is what
    // makes an inserted `*` the right implementation rather than a dedicated imaginary literal.
    expect(val("2i^2")[0]).toBeCloseTo(-2, 12);
    expect(val("2z^2", [3, 0])[0]).toBeCloseTo(18, 12);
  });

  it("produces an ordinary multiply, so every downstream pass needs no change", () => {
    // No new token type and no new AST node: derivative, LaTeX, GLSL and the rational extractor all
    // see `arith *`. If this ever stops being true, that is the signal to revisit the design.
    expect(toLatex(parse("3+4i"))).toContain("4");
    expect(() => toLatex(parse("2z"))).not.toThrow();
  });
});

describe("implicit multiplication does not reopen the statement-separator guard", () => {
  it("still rejects whitespace-separated adjacent expressions", () => {
    // The guard exists so a typo is an error rather than a silently different result. Whitespace
    // suppressing the implicit `*` is what keeps all of these failing.
    expect(() => parse("2 3")).toThrow(ExprError);
    expect(() => parse("z c")).toThrow(ExprError);
    expect(() => parse("2 z")).toThrow(ExprError);
    expect(() => parse("1 e")).toThrow(ExprError);
    expect(() => parse("1.2.3")).toThrow(ExprError);
  });

  it("still rejects a bare e/E after a number — that position is the exponent marker", () => {
    // A truncated `1e5` typed as `1e` is far likelier than someone meaning 1·e, and silently
    // yielding 2.718 would be exactly the failure the separator guard was added to close.
    expect(() => parse("1e")).toThrow(ExprError);
    expect(() => parse("2E")).toThrow(ExprError);
    expect(val("2*e")[0]).toBeCloseTo(2 * Math.E, 12);
  });

  it("leaves scientific notation alone", () => {
    expect(val("1e5")[0]).toBeCloseTo(1e5, 6);
    expect(val("1e-3")[0]).toBeCloseTo(1e-3, 12);
    expect(val("1e5i")[1]).toBeCloseTo(1e5, 6); // exponent consumed first, then the implicit *
  });

  it("is additive: it only fires where the input previously threw", () => {
    // Spot-check that ordinary programs are untouched — the blast-radius claim for a shared package.
    expect(val("z^2 + c", [1, 1], [0.5, 0])[1]).toBeCloseTo(2, 12);
    expect(val("2*z", [3, 0])[0]).toBeCloseTo(6, 12);
    expect(() => parse("a = z*z; a + c")).not.toThrow();
  });
});
