import { describe, expect, it } from "vitest";
import { createProgram } from "@cas/gpu/shader";
import { RIEMANN_VERTEX, assembleFragmentShader } from "../src/render/shader.js";
import { compileMap } from "../src/map.js";

// COMPILES + LINKS THE REAL SHADER IN A LIVE WebGL2 CONTEXT (S4/C1–C6). shader.test.ts asserts the
// emitted GLSL as a string; only this can tell you the assembled program — the shared complex stdlib +
// the compiled fFn + dphi (symbolic dFn OR finite-difference) + the multi-mode colouring main —
// actually builds on a driver. Covers rational, transcendental, anti-holomorphic (finite-difference
// dphi), and polynomial maps; the full mode/colormap switch lives in one program, so a single compile
// exercises every mode's code path.

function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  return gl;
}

const MAPS = ["z + 1/z", "z*z", "exp(z)", "sin(z)", "(z - 1)/(z + 1)", "conjugate(z)", "z^3 - 1"];

describe("riemann-map shader compiles + links in real WebGL2 (S4/C1–C6)", () => {
  it("has a WebGL2 context (otherwise the compile assertions are vacuous)", () => {
    expect(() => context()).not.toThrow();
  });

  for (const expr of MAPS) {
    it(`builds φ = ${expr} (φ body + dphi + all modes)`, () => {
      const gl = context();
      const r = compileMap({ expr, vars: ["z"], antiholomorphic: false });
      if (!r.ok) throw new Error(`compile failed for ${expr}: ${r.error}`);
      const src = assembleFragmentShader(r.map.glslBody, r.map.glslDerivBody);
      expect(() => createProgram(gl, RIEMANN_VERTEX, src), expr).not.toThrow();
    });
  }
});
