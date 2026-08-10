import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import { heightAt, LOG_CLAMP, LINEAR_CLAMP } from "../src/render3d/height.js";
import { buildSurfaceProgram, HEIGHT_GLSL } from "../src/render3d/surfaceShader.js";

// Phase 5 / 5A-ii: the analytic-landscape surface. The height law is pure (pinned here); the GLSL/JS
// height parity and the top-down = 2D match are proven end-to-end by the headless render check.

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
    expect(fragment).toContain("dFdx(vSurfPos)"); // geometric shading normal
    expect(fragment).toContain("uniform float uShaded"); // off for top-down → equals the 2D portrait
    expect(fragment).toContain("out vec4 fragColor");
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

  it("the GLSL height law mirrors the JS heightAt (same three modes)", () => {
    expect(HEIGHT_GLSL).toContain("float surfaceHeight(int mode, float m, float scale)");
    expect(HEIGHT_GLSL).toContain("(m2 - 1.0) / (m2 + 1.0)"); // stereographic
    expect(HEIGHT_GLSL).toContain("clamp(l, -8.0, 8.0) / 8.0"); // log, LOG_CLAMP = 8
  });
});
