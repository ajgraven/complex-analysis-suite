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
});
