import { describe, expect, it } from "vitest";
import type { Complex } from "@cas/expr/complex";
import {
  buildProbeGLSL,
  compareResults,
  defaultSamples,
  DUAL_BACKEND_CORPUS,
  jsReference,
  type Sample,
} from "../src/dualBackend.js";

// The GLSL≈JS numeric agreement itself (runGLSL vs jsReference) needs a real WebGL2 context and rides
// in a browser — Vitest browser mode, or a preview-browser run over DUAL_BACKEND_CORPUS. These node
// tests guard the harness's pure core: probe-shader assembly, the JS reference values, and the metric.

describe("@cas/gpu dual-backend harness (node-testable core)", () => {
  it("assembles a well-formed GLSL ES 3.00 probe shader for every corpus map", () => {
    for (const c of DUAL_BACKEND_CORPUS) {
      const glsl = buildProbeGLSL(c.source);
      expect(glsl).toContain("#version 300 es");
      expect(glsl).toContain("void main()");
      expect(glsl).toContain("cvec fFn(cvec z, cvec c)"); // compileF output
      expect(glsl).toContain("fragColor");
      expect(glsl.length).toBeGreaterThan(200);
    }
  });

  it("JS reference matches hand-computed values", () => {
    // (1 + i)^2 + 0.5 = 2i + 0.5
    const a = jsReference("z^2 + c", [{ z: [1, 1], c: [0.5, 0] }]);
    expect(a[0][0]).toBeCloseTo(0.5, 12);
    expect(a[0][1]).toBeCloseTo(2, 12);
    // conjugate(1 + i)^2 = (1 - i)^2 = -2i  (the anti-holomorphic tricorn path)
    const b = jsReference("conjugate(z)^2 + c", [{ z: [1, 1], c: [0, 0] }]);
    expect(b[0][0]).toBeCloseTo(0, 12);
    expect(b[0][1]).toBeCloseTo(-2, 12);
    // exp(0) = 1
    const e = jsReference("exp(z) + c", [{ z: [0, 0], c: [0, 0] }]);
    expect(e[0][0]).toBeCloseTo(1, 12);
    expect(e[0][1]).toBeCloseTo(0, 12);
  });

  it("compareResults reports the max abs error and the worst sample", () => {
    const samples: Sample[] = [
      { z: [0, 0], c: [0, 0] },
      { z: [1, 0], c: [0, 0] },
    ];
    const js: Complex[] = [
      [1, 0],
      [2, 0],
    ];
    const glsl: Complex[] = [
      [1, 0],
      [2.5, 0],
    ];
    const r = compareResults("t", samples, js, glsl);
    expect(r.maxAbsError).toBeCloseTo(0.5, 12);
    expect(r.worst?.sample.z).toEqual([1, 0]);
  });

  it("defaultSamples is a non-empty, deterministic grid (no RNG)", () => {
    const s1 = defaultSamples();
    const s2 = defaultSamples();
    expect(s1.length).toBeGreaterThan(0);
    expect(s1).toEqual(s2);
  });
});
