import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import {
  heightAt,
  heightSlopeAt,
  LOG_CLAMP,
  LINEAR_CLAMP,
} from "../src/render3d/height.js";
import {
  buildSurfaceProgram,
  HEIGHT_GLSL,
  HEIGHT_SLOPE_GLSL,
} from "../src/render3d/surfaceShader.js";

// Phase 5 / 5A-ii + 5B: the analytic-landscape surface. The height law + its slope (for the analytic
// normal) are pure (pinned here), as is the GLSL assembly (analytic vs geometric normal, the shared
// `highp int` precision); the GLSL/JS parity, the top-down = 2D match, and shading are proven end-to-end
// by the headless render check.

describe("heightAt — the F1 height compression", () => {
  it("log|f|: 0 at |f| = 1, dips to −1 at zeros, rises to +1 at poles", () => {
    expect(heightAt(0, 1, 8)).toBeCloseTo(0, 12);
    expect(heightAt(0, Math.exp(LOG_CLAMP), 8)).toBeCloseTo(1, 12); // |f| = e^8 → clamp → +1
    expect(heightAt(0, Math.exp(-LOG_CLAMP), 8)).toBeCloseTo(-1, 12);
    expect(heightAt(0, 0, 8)).toBe(-1); // a zero saturates the floor
  });

  it("linear |f|: proportional to |f|/scale, clamped to a finite spike", () => {
    expect(heightAt(1, 4, 8)).toBeCloseTo(0.5, 12);
    expect(heightAt(1, 0, 8)).toBe(0);
    expect(heightAt(1, 1e6, 8)).toBe(LINEAR_CLAMP); // a pole clamps, not ∞
  });

  it("stereographic: bounded (|f|²−1)/(|f|²+1) ∈ (−1, 1]", () => {
    expect(heightAt(2, 1, 8)).toBeCloseTo(0, 12); // |f| = 1 → equator
    expect(heightAt(2, 0, 8)).toBe(-1); // zero → south
    expect(heightAt(2, 1e6, 8)).toBeGreaterThan(0.999); // pole → north
    for (const m of [0, 0.3, 1, 5, 40, 1e5]) {
      const h = heightAt(2, m, 8);
      expect(h).toBeGreaterThanOrEqual(-1);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it("maps an overflowed pole (non-finite |f|) to the top", () => {
    expect(heightAt(0, Infinity, 8)).toBe(1);
    expect(heightAt(2, Infinity, 8)).toBe(1);
    expect(heightAt(1, Infinity, 8)).toBe(LINEAR_CLAMP);
  });
});

describe("heightSlopeAt — dH/dm for the analytic normal (5B, F4)", () => {
  it("log: 1/(8m) in the unclamped band, flat outside it", () => {
    expect(heightSlopeAt(0, 1, 8)).toBeCloseTo(1 / 8, 12);
    expect(heightSlopeAt(0, Math.E, 8)).toBeCloseTo(1 / (8 * Math.E), 12);
    expect(heightSlopeAt(0, Math.exp(LOG_CLAMP + 1), 8)).toBe(0); // past the clamp → flat
    expect(heightSlopeAt(0, 0, 8)).toBe(0);
  });

  it("linear: 1/scale below the clamp, flat above", () => {
    expect(heightSlopeAt(1, 4, 8)).toBeCloseTo(1 / 8, 12);
    expect(heightSlopeAt(1, 100, 8)).toBe(0); // 100 > 3·8 → clamped → flat
  });

  it("stereographic: 4m/(m²+1)², peaking at m = 1", () => {
    expect(heightSlopeAt(2, 1, 8)).toBeCloseTo(1, 12); // 4·1/4 = 1
    expect(heightSlopeAt(2, 0, 8)).toBe(0);
    expect(heightSlopeAt(2, 1000, 8)).toBeLessThan(1e-5); // decays at a pole
  });
});

describe("buildSurfaceProgram — the surface GLSL assembly", () => {
  const { vertex, fragment } = buildSurfaceProgram(compileF(parse("z^2")));

  it("vertex evaluates f, displaces by the height, and projects with the camera", () => {
    expect(vertex).toContain("cvec fFn(cvec z, cvec c)");
    expect(vertex).toContain("surfaceHeight(uHeightMode");
    expect(vertex).toContain("uniform mat4  uVP;");
    expect(vertex).toContain("in vec2 aUV;");
    expect(vertex).toContain("gl_Position = uVP * vec4(re, im, h, 1.0);");
  });

  it("fragment recomputes f and colours it with the shared colorAt, then shades", () => {
    expect(fragment).toContain("vec3 colorAt(cvec w)"); // the shared colouring core, reused verbatim
    expect(fragment).toContain("cvec fFn(cvec z, cvec c)");
    expect(fragment).toContain("uniform float uShaded"); // off for top-down → equals the 2D portrait
    expect(fragment).toContain("uniform int   uSpecular");
    expect(fragment).toContain("out vec4 fragColor");
  });

  it("pins highp int in BOTH stages (uHeightMode is an int uniform shared across them)", () => {
    // Without this the vertex/fragment default int precisions differ and the program fails to LINK
    // (a runtime error unit tests can't reproduce, since they don't hit a GL context) — guard it here.
    expect(vertex).toContain("precision highp int;");
    expect(fragment).toContain("precision highp int;");
  });

  it("without f', the fragment uses the geometric (screen-space) normal", () => {
    expect(fragment).toContain("dFdx(vSurfPos)");
    expect(fragment).not.toContain("fpFn"); // no derivative supplied
  });

  it("with f' (a holomorphic map), the fragment uses the analytic normal from f'/f", () => {
    const fp = compileF(parse("2*z"), "fpFn"); // d/dz z^2
    const withDeriv = buildSurfaceProgram(compileF(parse("z^2")), [], fp);
    expect(withDeriv.fragment).toContain("cvec fpFn(cvec z, cvec c)");
    expect(withDeriv.fragment).toContain("surfaceHeightSlope(uHeightMode"); // H'(|f|)
    expect(withDeriv.fragment).not.toContain("dFdx(vSurfPos)"); // analytic, not geometric
  });

  it("declares each live parameter as a uParam_<name> uniform in both stages", () => {
    const withParams = buildSurfaceProgram(
      compileF(parse("a*z"), "fFn", { params: ["a"] }),
      ["a"],
    );
    expect(withParams.vertex).toContain("uniform vec2 uParam_a;");
    expect(withParams.fragment).toContain("uniform vec2 uParam_a;");
    // a parameter-free map declares none
    expect(vertex).not.toContain("uParam_");
  });

  it("the GLSL height law + slope mirror the JS heightAt / heightSlopeAt", () => {
    expect(HEIGHT_GLSL).toContain("float surfaceHeight(int mode, float m, float scale)");
    expect(HEIGHT_GLSL).toContain("(m2 - 1.0) / (m2 + 1.0)"); // stereographic
    expect(HEIGHT_GLSL).toContain("clamp(l, -8.0, 8.0) / 8.0"); // log, LOG_CLAMP = 8
    expect(HEIGHT_SLOPE_GLSL).toContain(
      "float surfaceHeightSlope(int mode, float m, float scale)",
    );
    expect(HEIGHT_SLOPE_GLSL).toContain("4.0 * m / (d * d)"); // stereographic slope 4m/(m²+1)²
    expect(HEIGHT_SLOPE_GLSL).toContain("1.0 / (8.0 * m)"); // log slope 1/(8m)
  });
});
