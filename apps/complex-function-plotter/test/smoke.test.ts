import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { compileF } from "@cas/expr/glsl";
import { COMPLEX_SINGLE_GLSL } from "@cas/gpu/glsl";
import { CANONICAL, SCHEMA_ID } from "@cas/interchange";

// Phase 0 scaffold: prove the plotter can consume the shared packages its render chain is built on.
// The render path is exactly this: parse a user expression (@cas/expr), compile it to a GLSL fFn
// body (@cas/expr), and concatenate it with the complex GLSL stdlib (@cas/gpu); the JS evaluator is
// the CPU-side twin used for instruments; @cas/interchange carries share-links and suite hand-off.

describe("complex-function-plotter scaffold — shared-package wiring", () => {
  it("@cas/expr evaluates the plotted map f(z) = z^2 on the CPU", () => {
    const f = makeComplexFn(parse("z^2"));
    const w = f([0, 2], [0, 0]); // (2i)^2 = -4
    expect(w[0]).toBeCloseTo(-4, 12);
    expect(w[1]).toBeCloseTo(0, 12);
  });

  it("@cas/expr compiles f(z) = z^2 to a GLSL fFn body (the render chain)", () => {
    const glsl = compileF(parse("z^2"));
    expect(glsl).toContain("cvec fFn(cvec z, cvec c)");
    expect(glsl).toContain("cmul(z, z)");
  });

  it("@cas/gpu supplies the complex GLSL stdlib the fragment shader concatenates", () => {
    expect(COMPLEX_SINGLE_GLSL).toContain("cvec carg"); // phase
    expect(COMPLEX_SINGLE_GLSL).toContain("float cabsf"); // modulus
  });

  it("@cas/interchange exposes the canonical convention + schema id for hand-off", () => {
    expect(SCHEMA_ID).toContain("interchange");
    expect(CANONICAL).toBeTruthy();
  });
});
