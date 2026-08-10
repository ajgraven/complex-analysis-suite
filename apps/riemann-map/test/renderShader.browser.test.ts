import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import { createProgram } from "@cas/gpu/shader";
import { RIEMANN_VERTEX, assembleFragmentShader } from "../src/render/shader.js";

// COMPILES + LINKS THE REAL DOMAIN-COLOURING SHADER IN A LIVE WebGL2 CONTEXT (S4/C1 — the P0-deferred
// browser guard, now that a real shader exists). shader.test.ts asserts the emitted GLSL as a string;
// only this can tell you the assembled program — the shared complex stdlib + the compiled fFn body +
// the colouring main — actually builds on a driver. Covers a spread of map shapes: rational,
// transcendental (needs the derived stdlib), anti-holomorphic (conjugate), and polynomial powers.

function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  return gl;
}

const MAPS = ["z + 1/z", "z*z", "exp(z)", "sin(z)", "(z - 1)/(z + 1)", "conjugate(z)", "z^3 - 1"];

describe("riemann-map domain-colouring shader compiles + links in real WebGL2 (S4/C1)", () => {
  it("has a WebGL2 context (otherwise the compile assertions are vacuous)", () => {
    expect(() => context()).not.toThrow();
  });

  for (const expr of MAPS) {
    it(`builds φ = ${expr}`, () => {
      const gl = context();
      const src = assembleFragmentShader(compileF(parse(expr)));
      expect(() => createProgram(gl, RIEMANN_VERTEX, src), expr).not.toThrow();
    });
  }
});
