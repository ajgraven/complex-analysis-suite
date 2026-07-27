import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { ExprError } from "../src/ast.js";

describe("statement-separator enforcement", () => {
  it("rejects adjacent expressions with no ';' between them", () => {
    // These used to parse silently as a 2-statement sequence (value = the last one).
    expect(() => parse("z c")).toThrow(ExprError);
    expect(() => parse("2 3")).toThrow(ExprError);
    expect(() => parse("z*z c")).toThrow(ExprError);
  });

  it("accepts valid ';'-separated statements, plus leading/trailing/empty separators", () => {
    expect(() => parse("a = z*z; a + c")).not.toThrow();
    expect(() => parse("z*z + c")).not.toThrow();
    expect(() => parse("z*z;")).not.toThrow(); // trailing
    expect(() => parse(";z")).not.toThrow(); // leading
    expect(() => parse("a = z; ; b = c; a + b")).not.toThrow(); // empty between
  });

  it("reports the offending position", () => {
    try {
      parse("z c");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExprError);
      expect((e as ExprError).pos).toBe(2); // the 'c'
    }
  });
});

describe("parser error cases", () => {
  it("throws on empty input", () => {
    expect(() => parse("")).toThrow(/Empty/);
    expect(() => parse(";")).toThrow(/Empty/);
  });

  it("throws on wrong builtin arity", () => {
    expect(() => parse("sin(z, c)")).toThrow(ExprError);
    expect(() => parse("mod(z)")).toThrow(ExprError);
    expect(() => parse("f(z)")).toThrow(ExprError);
    expect(() => parse("if(z)")).toThrow(ExprError);
    expect(() => parse("not(z, c)")).toThrow(ExprError);
  });

  it("throws on unknown functions and unterminated parens", () => {
    expect(() => parse("foo(z)")).toThrow(/Unknown function/);
    expect(() => parse("(z + c")).toThrow(ExprError);
    expect(() => parse("sin(z")).toThrow(ExprError);
  });

  it("still parses the standard formulas", () => {
    expect(() => parse("z^2 + c")).not.toThrow();
    expect(() => parse("z*z + c + a")).not.toThrow();
    expect(() => parse("exp(z) + c")).not.toThrow();
    expect(() => parse("if(abs(z) > 2, z, c)")).not.toThrow();
  });

  // The depth cap has to hold on EVERY self-recursive descent, not just the one this test used to
  // cover. It previously exercised parenthesis nesting only, while its title claimed the general
  // property — and the two paths it skipped were exactly the two the guard did not cover. (expr-parser-01,
  // expr-parser-depth-04)
  describe("rejects pathologically nested input with a clean error (not a stack overflow)", () => {
    const DEEP = 5000; // comfortably past MAX_DEPTH (256) and past the JS stack on every path below

    it("parenthesis nesting (parseExpr)", () => {
      expect(() => parse("(".repeat(DEEP) + "z" + ")".repeat(DEEP))).toThrow(/nested too deeply/);
    });

    it("unary chain (parseUnary self-recursion) — used to throw RangeError", () => {
      expect(() => parse("-".repeat(DEEP) + "z")).toThrow(/nested too deeply/);
    });

    it("power chain (parsePower re-entering parseUnary) — used to throw RangeError", () => {
      expect(() => parse("z^".repeat(DEEP) + "z")).toThrow(/nested too deeply/);
    });

    it("call-argument nesting", () => {
      expect(() => parse("exp(".repeat(DEEP) + "z" + ")".repeat(DEEP))).toThrow(/nested too deeply/);
    });

    it("never a RangeError — the whole point is a positioned ExprError", () => {
      for (const src of [
        "(".repeat(DEEP) + "z" + ")".repeat(DEEP),
        "-".repeat(DEEP) + "z",
        "z^".repeat(DEEP) + "z",
      ]) {
        expect(() => parse(src)).not.toThrow(RangeError);
      }
    });

    it("moderate nesting on every path still parses", () => {
      expect(() => parse("(".repeat(100) + "z + c" + ")".repeat(100))).not.toThrow();
      expect(() => parse("-".repeat(100) + "z")).not.toThrow();
      expect(() => parse("z^".repeat(50) + "z")).not.toThrow();
      expect(() => parse("--z")).not.toThrow(); // the ordinary case must be unaffected
      expect(() => parse("z^-2")).not.toThrow();
    });
  });
});
