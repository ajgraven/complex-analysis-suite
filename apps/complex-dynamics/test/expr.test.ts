import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import * as C from "@cas/expr/complexJs";
import { tokenize } from "@cas/expr/lexer";
import { parse } from "@cas/expr/parser";
import { ExprError } from "@cas/expr/ast";
import { evaluate, makeComplexFn, makeEscapeFn } from "@cas/expr/evaluate";
import { dynPresets, paramPresets, presetNames } from "../src/presets";

const close = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

describe("complexJs arithmetic", () => {
  it("multiplies and divides", () => {
    close(C.mul([1, 2], [3, 4]), [-5, 10]);
    close(C.div([-5, 10], [3, 4]), [1, 2]);
  });
  it("exp/log are inverse (principal branch)", () => {
    close(C.log(C.exp([0.5, 0.3])), [0.5, 0.3]);
  });
  it("principal sqrt and integer pow", () => {
    close(C.sqrt([-1, 0]), [0, 1]); // sqrt(-1) = i
    close(C.pow([0, 1], [2, 0]), [-1, 0]); // i^2 = -1
    close(C.intPow([1, 2], 3), C.mul(C.mul([1, 2], [1, 2]), [1, 2]));
  });
  it("fractional pow uses exp(w·log z)", () => {
    close(C.pow([8, 0], [1 / 3, 0]), [2, 0]); // cube root of 8
  });
});

describe("lambertw (principal branch)", () => {
  it("W(0) = 0 and W(1) = Ω ≈ 0.5671432904", () => {
    close(C.lambertw([0, 0]), [0, 0], 6);
    close(C.lambertw([1, 0]), [0.5671432904097838, 0], 6);
  });
  it("satisfies W·e^W = z (to the 5-iteration algorithm's accuracy)", () => {
    const z: Complex = [1.5, 0.7];
    const w = C.lambertw(z);
    close(C.mul(w, C.exp(w)), z, 4);
  });
});

describe("lexer", () => {
  it("distinguishes the constant e from scientific notation", () => {
    expect(tokenize("e^2").map((t) => t.type)).toEqual(["ident", "op", "number", "eof"]);
    const sci = tokenize("1e-3");
    expect(sci[0]).toMatchObject({ type: "number", value: "1e-3" });
  });
  it("lexes an unsigned scientific literal followed by an operator (regression)", () => {
    // The exponent guard used to check the wrong offset, splitting `1e5+2` into `1`,`e5`,`+`,`2`.
    const toks = tokenize("1e5+2");
    expect(toks.map((t) => t.type)).toEqual(["number", "op", "number", "eof"]);
    expect(toks[0]).toMatchObject({ type: "number", value: "1e5" });
    expect(tokenize("1e5*z")[0]).toMatchObject({ type: "number", value: "1e5" });
    expect(tokenize("2e3)")[0]).toMatchObject({ type: "number", value: "2e3" });
    expect(tokenize("1e-3")[0]).toMatchObject({ type: "number", value: "1e-3" }); // signed still ok
    expect(tokenize("1e6")[0]).toMatchObject({ type: "number", value: "1e6" }); // end-of-input ok
    expect(tokenize("1e").map((t) => t.type)).toEqual(["number", "ident", "eof"]); // bare e = const
  });
  it("evaluates a formula with an unsigned scientific literal end-to-end", () => {
    close(evaluate(parse("z + 1e3"), [2, 0], [0, 0]) as Complex, [1002, 0]);
    close(evaluate(parse("z*1e5 + c"), [2, 0], [7, 0]) as Complex, [200007, 0]);
  });
  it("distinguishes == from =", () => {
    expect(tokenize("a==b").map((t) => t.type)).toEqual(["ident", "cmp", "ident", "eof"]);
    expect(tokenize("a=b").map((t) => t.type)).toEqual(["ident", "assign", "ident", "eof"]);
  });
});

describe("parser", () => {
  it("parses every preset f and escape without error", () => {
    for (const name of presetNames) {
      for (const preset of [paramPresets[name], dynPresets[name]]) {
        expect(() => parse(preset.f)).not.toThrow();
        expect(() => parse(preset.escape)).not.toThrow();
      }
    }
  });
  it("reports a structured error for malformed input", () => {
    expect(() => parse("z^^2")).toThrow(ExprError);
    expect(() => parse("foo(z)")).toThrow(/Unknown function/);
  });
  it("makes ^ right-associative and tighter than unary minus", () => {
    // -z^2 should parse as -(z^2): with z=2, value is -4.
    close(evaluate(parse("-z^2"), [2, 0], [0, 0]) as Complex, [-4, 0]);
  });
});

describe("evaluate — preset f parity", () => {
  it("mandelbrot z^2+c", () => {
    const f = makeComplexFn(parse("z^2+c"));
    close(f([0, 1], [0, 0]), [-1, 0]); // i^2 = -1
    close(f([1, 1], [0.5, -0.5]), [0.5, 1.5]); // (1+i)^2 = 2i; +0.5-0.5i
  });
  it("burning ship (abs(re(z))+i*abs(im(z)))^2-c", () => {
    const f = makeComplexFn(parse("(abs(re(z))+i*abs(im(z)))^2-c"));
    close(f([1, -2], [0.5, 0]), [-3.5, 4]); // (1+2i)^2 - 0.5 = -3+4i-0.5
  });
  it("teardrop Schwarz f (multi-statement with locals) is finite", () => {
    const f = makeComplexFn(parse(paramPresets["teardrop Schwarz"].f));
    const out = f([0.4, 0.2], [0.5, 0]);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
  });
  it("exp Schwarz f matches a direct computation", () => {
    const f = makeComplexFn(parse(paramPresets["exp Schwarz"].f));
    const z: Complex = [1.2, 0.4];
    const c: Complex = [1, 0];
    const c0 = C.div(C.mul(c, c), z);
    const c1 = C.lambertw(C.neg(c0));
    const expected = C.conjugate(C.div(c0, C.exp(C.add(c1, C.div(C.mul(c, c), c1)))));
    close(f(z, c), expected, 6);
  });
});

describe("evaluate — escape predicates", () => {
  it("abs(z)>2 returns a boolean", () => {
    const esc = makeEscapeFn(parse("abs(z)>2"), parse("z^2+c"));
    expect(esc([3, 0], [0, 0])).toBe(true);
    expect(esc([1, 0], [0, 0])).toBe(false);
  });
  it("exp Schwarz escape (if/not, calls f) returns a boolean", () => {
    const fAst = parse(dynPresets["exp Schwarz"].f);
    const esc = makeEscapeFn(parse(dynPresets["exp Schwarz"].escape), fAst);
    expect(typeof esc([-6, 0], [1, 0])).toBe("boolean"); // re(z)<-5 branch → true
    expect(esc([-6, 0], [1, 0])).toBe(true);
  });
});
