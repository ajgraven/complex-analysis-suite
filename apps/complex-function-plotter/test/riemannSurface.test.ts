import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import { detectRiemannForm } from "../src/riemann/inverse.js";
import { buildRiemannProgram } from "../src/render3d/riemannSurface.js";

// The Riemann-surface program (ADR-0027) GLSL assembly — the string shape. Whether it actually compiles
// and links is proven in shaderCompile.browser.test.ts against a live WebGL2 context.

/** Build the program the plotter's rebuildRiemannProgram will build for a source string. */
function program(src: string): { vertex: string; fragment: string } {
  const form = detectRiemannForm(parse(src));
  if (!form) throw new Error(`not a Riemann form: ${src}`);
  return buildRiemannProgram(compileF(form.zFromT, "gZFn"), compileF(form.wFromT, "gWFn"));
}

describe("buildRiemannProgram — vertex", () => {
  const { vertex } = program("sqrt(z)");

  it("compiles the position map gZFn and value map gWFn over the uniformizer", () => {
    expect(vertex).toContain("cvec gZFn(cvec z, cvec c)");
    expect(vertex).toContain("cvec gWFn(cvec z, cvec c)");
  });

  it("maps grid UV into the t-window, lifts by the charisma height, projects with the camera", () => {
    expect(vertex).toContain("uniform mat4  uVP;");
    expect(vertex).toContain("uniform vec2  uTCenter;");
    expect(vertex).toContain("uniform vec2  uTHalf;");
    expect(vertex).toContain("uniform int   uHeightSource;");
    expect(vertex).toContain("in vec2 aUV;");
    expect(vertex).toContain("gl_Position = uVP * vec4(p, 1.0);");
  });

  it("passes the value w and the world position to the fragment", () => {
    expect(vertex).toContain("out vec2 vW;");
    expect(vertex).toContain("out vec3 vPos;");
    // Charisma from the uniformizer t (bounded), not w — Im t vs Re t.
    expect(vertex).toContain("uHeightSource == 1 ? cre1(cim(t)) : cre1(cre(t))");
  });
});

describe("buildRiemannProgram — fragment", () => {
  const { fragment } = program("sqrt(z)");

  it("colours with the shared colorAt and shades with a geometric normal", () => {
    expect(fragment).toContain("vec3 colorAt(cvec w)"); // shared colouring core, verbatim
    expect(fragment).toContain("in vec2 vW;");
    expect(fragment).toContain("in vec3 vPos;");
    expect(fragment).toContain("dFdx(vPos)"); // geometric (screen-space) normal
    expect(fragment).toContain("out vec4 fragColor");
  });

  it("pins highp int in both stages (stage-default parity)", () => {
    const { vertex } = program("sqrt(z)");
    expect(vertex).toContain("precision highp int;");
    expect(fragment).toContain("precision highp int;");
  });
});

describe("buildRiemannProgram — no live parameters (affine constants are baked)", () => {
  it("declares no uParam_* uniforms for any recognized form", () => {
    for (const src of ["sqrt(z)", "log(z)", "z^(1/3)", "arctan(z)", "2*sqrt(z)+1", "sqrt(2*z+1)"]) {
      const { vertex, fragment } = program(src);
      expect(vertex, src).not.toContain("uParam_");
      expect(fragment, src).not.toContain("uParam_");
    }
  });
});
