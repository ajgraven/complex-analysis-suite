import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";
import { assembleFragmentShader, RIEMANN_VERTEX } from "../src/render/shader.js";

// Codegen guard for the GLSL half of the dual pipeline (S4). String-level only; the real compile/link
// under WebGL2 is renderShader.browser.test.ts.

describe("assembleFragmentShader (S4/C1)", () => {
  it("concatenates the stdlib + compiled fFn + colouring main into one #version 300 es fragment", () => {
    const body = compileF(parse("z + 1/z"));
    const src = assembleFragmentShader(body);
    expect(src.startsWith("#version 300 es")).toBe(true);
    expect(src).toContain(COMPLEX_SINGLE_GLSL);
    expect(src).toContain(COMPLEX_DERIVED_GLSL);
    expect(src).toContain(body);
    expect(src).toMatch(/\bfFn\b/);
    expect(src).toContain("void main()");
    expect(src).toContain("out vec4 fragColor;");
  });

  it("always includes BOTH stdlib blocks so transcendental maps (sin, exp, …) resolve", () => {
    const src = assembleFragmentShader(compileF(parse("sin(z) + exp(z)")));
    expect(src).toContain(COMPLEX_SINGLE_GLSL);
    expect(src).toContain(COMPLEX_DERIVED_GLSL);
  });

  it("the vertex shader is a self-contained #version 300 es program", () => {
    expect(RIEMANN_VERTEX.startsWith("#version 300 es")).toBe(true);
    expect(RIEMANN_VERTEX).toContain("aPos");
  });
});
