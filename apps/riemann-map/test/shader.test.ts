import { describe, expect, it } from "vitest";
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";
import { assembleFragmentShader, RIEMANN_VERTEX } from "../src/render/shader.js";
import { compileMap } from "../src/map.js";
import type { MapState } from "../src/viewState.js";

// Codegen guard for the GLSL half of the dual pipeline (S4). String-level only; the real compile/link
// under WebGL2 is renderShader.browser.test.ts.

const mk = (expr: string): MapState => ({ expr, vars: ["z"], antiholomorphic: false });
function bodies(expr: string): { body: string; deriv: string | null } {
  const r = compileMap(mk(expr));
  if (!r.ok) throw new Error(`compile failed: ${r.error}`);
  return { body: r.map.glslBody, deriv: r.map.glslDerivBody };
}

describe("assembleFragmentShader (S4/C1–C6)", () => {
  it("concatenates stdlib + fFn + dphi + colouring main into one #version 300 es fragment", () => {
    const { body, deriv } = bodies("z + 1/z");
    const src = assembleFragmentShader(body, deriv);
    expect(src.startsWith("#version 300 es")).toBe(true);
    expect(src).toContain(COMPLEX_SINGLE_GLSL);
    expect(src).toContain(COMPLEX_DERIVED_GLSL);
    expect(src).toContain(body);
    expect(src).toMatch(/\bfFn\b/);
    expect(src).toContain("cvec dphi");
    expect(src).toMatch(/uMode/);
    expect(src).toContain("void main()");
    expect(src).toContain("out vec4 fragColor;");
  });

  it("uses the symbolic dFn for dphi when φ is holomorphic", () => {
    const { body, deriv } = bodies("z*z");
    expect(deriv).not.toBeNull();
    expect(assembleFragmentShader(body, deriv)).toContain("return dFn(z");
  });

  it("finite-differences dphi when there is no derivative body (anti-holomorphic)", () => {
    const { body, deriv } = bodies("conjugate(z)");
    expect(deriv).toBeNull();
    const src = assembleFragmentShader(body, deriv);
    expect(src).toContain("cvec dphi");
    expect(src).not.toContain("dFn");
  });

  it("always includes both stdlib blocks so transcendental maps resolve", () => {
    const { body, deriv } = bodies("sin(z) + exp(z)");
    const src = assembleFragmentShader(body, deriv);
    expect(src).toContain(COMPLEX_SINGLE_GLSL);
    expect(src).toContain(COMPLEX_DERIVED_GLSL);
  });

  it("the vertex shader is a self-contained #version 300 es program", () => {
    expect(RIEMANN_VERTEX.startsWith("#version 300 es")).toBe(true);
    expect(RIEMANN_VERTEX).toContain("aPos");
  });
});
