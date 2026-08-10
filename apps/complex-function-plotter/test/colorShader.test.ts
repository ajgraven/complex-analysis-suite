import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import { VERTEX_SHADER, buildFragmentShader } from "../src/render/colorShader.js";

describe("coloring shader assembly", () => {
  const frag = buildFragmentShader(compileF(parse("z^2")));

  it("is a GLSL ES 3.00 fragment program", () => {
    expect(frag.startsWith("#version 300 es")).toBe(true);
    expect(frag).toContain("out vec4 fragColor");
    expect(frag).toContain("void main()");
  });

  it("splices in the compiled f and the coloring chain", () => {
    expect(frag).toContain("cvec fFn(cvec z, cvec c)");
    expect(frag).toContain("cmul(z, z)");
    expect(frag).toContain("vec3 colorAt(cvec w)");
    expect(frag).toContain("uniform sampler2D uPhaseLUT");
    expect(frag).toContain("fFn(z, vec_(0.0, 0.0))");
  });

  it("includes the fwidth-antialiased enhancement layer", () => {
    expect(frag).toContain("float enhancement(cvec w");
    expect(frag).toContain("fwidth(");
    expect(frag).toContain("uEnhance");
    expect(frag).toContain("uSectors");
    expect(frag).toContain("uHueShift");
    expect(frag).toContain("uHueSign");
  });

  it("applies a colour-vision-deficiency simulation pass", () => {
    expect(frag).toContain("vec3 simulateCvd(vec3 c)");
    expect(frag).toContain("uCvd");
  });

  it("includes the level-set and uncertainty layers", () => {
    expect(frag).toContain("float line0(");
    expect(frag).toContain("uLevelAbs");
    expect(frag).toContain("uLevelArgOn");
    expect(frag).toContain("uUncertainty");
  });

  it("passes a fullscreen triangle from the vertex shader", () => {
    expect(VERTEX_SHADER).toContain("gl_Position");
  });

  it("declares a uParam_<name> uniform for each live parameter (ADR-0011 / G1)", () => {
    const withParams = buildFragmentShader(
      compileF(parse("a*z + b"), "fFn", { params: ["a", "b"] }),
      ["a", "b"],
    );
    // the declaration must precede fFn (which reads the alias) — GLSL requires declaration before use
    expect(withParams).toContain("uniform vec2 uParam_a;");
    expect(withParams).toContain("uniform vec2 uParam_b;");
    expect(withParams.indexOf("uniform vec2 uParam_a;")).toBeLessThan(
      withParams.indexOf("cvec fFn("),
    );
    expect(withParams).toContain("cvec a = vec_(uParam_a.x, uParam_a.y);");
    // a parameter-free map declares no uParam / uA uniforms
    expect(frag).not.toContain("uParam_");
    expect(frag).not.toContain("uA");
  });
});
