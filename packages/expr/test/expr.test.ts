import { describe, expect, it } from "vitest";
import type { Complex } from "../src/index.js";
import { compileEscape, compileF, differentiate, makeComplexFn, parse, toLatex } from "../src/index.js";

// Golden corpus for @cas/expr: the JS backend (parse -> makeComplexFn -> evaluate) on holomorphic,
// anti-holomorphic, and transcendental maps, plus structural checks on the GLSL backend and the
// derivative / latex passes. (The NUMERIC GLSL≈JS backend-agreement property test needs a real
// WebGL context — it rides with the gpu extraction / a GPU-capable run.)

describe("@cas/expr JS backend", () => {
  it("evaluates z^2 + c", () => {
    const f = makeComplexFn(parse("z^2 + c"));
    // (1+i)^2 + 0.5 = 2i + 0.5
    const v: Complex = f([1, 1], [0.5, 0]);
    expect(v[0]).toBeCloseTo(0.5, 12);
    expect(v[1]).toBeCloseTo(2, 12);
  });

  it("handles conjugate (anti-holomorphic) and transcendentals", () => {
    // multicorn/tricorn map conjugate(z)^2 + c: conj(1+i) = 1-i; (1-i)^2 = -2i
    const v = makeComplexFn(parse("conjugate(z)^2 + c"))([1, 1], [0, 0]);
    expect(v[0]).toBeCloseTo(0, 12);
    expect(v[1]).toBeCloseTo(-2, 12);
    // exp(0) = 1
    expect(makeComplexFn(parse("exp(z)"))([0, 0], [0, 0])[0]).toBeCloseTo(1, 12);
  });
});

describe("@cas/expr GLSL backend + passes", () => {
  it("compiles f and the escape test to non-empty GLSL", () => {
    expect(compileF(parse("z^2 + c")).length).toBeGreaterThan(0);
    expect(compileEscape(parse("abs(z) > 2")).length).toBeGreaterThan(0);
  });

  it("differentiates (d/dz z^2 = 2z) and formats to latex", () => {
    const d = differentiate(parse("z^2"), "z");
    expect(makeComplexFn(d)([3, 0], [0, 0])[0]).toBeCloseTo(6, 12);
    expect(typeof toLatex(parse("z^2 + c"))).toBe("string");
  });
});
