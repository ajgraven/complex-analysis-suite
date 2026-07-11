import { describe, expect, it } from "vitest";
import type { Complex } from "@cas/expr/complex";
import {
  buildProbeGLSL,
  buildEscapeProbeGLSL,
  compareResults,
  defaultSamples,
  DUAL_BACKEND_CORPUS,
  ESCAPE_REGRESSION_CORPUS,
  F_REGRESSION_CORPUS,
  jsEscapeReference,
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

// The emitBody codegen bugs the whole-app review found (H1/H2). These node checks pin the emitted STRING;
// the browser harness (dualBackend.browser.test.ts) additionally compiles + runs them on real WebGL2 — the
// stronger check the review's core concern demands (the emitted GLSL, not a mirror, must actually compile).
describe("@cas/gpu dual-backend — emitBody codegen regression corpus (H1/H2)", () => {
  it("H2: buildProbeGLSL does NOT redeclare a reassigned shader parameter (`cvec z =` → GLSL error)", () => {
    const gz = buildProbeGLSL(F_REGRESSION_CORPUS[0].source); // z = z^2 + c; z
    expect(gz).toContain("cvec fFn(cvec z, cvec c)"); // the signature has `cvec z,` …
    expect(gz).not.toContain("cvec z ="); // … but the BODY must reuse z, not redefine it
    expect(buildProbeGLSL(F_REGRESSION_CORPUS[1].source)).not.toContain("cvec c ="); // c = c^2; z + c
  });

  it("H2: the reassigned-param spellings are the same maps as z²+c and z+c²", () => {
    const a = jsReference(F_REGRESSION_CORPUS[0].source, [{ z: [1, 1], c: [0.5, 0] }] as Sample[])[0];
    expect(a[0]).toBeCloseTo(0.5, 12); // (1+i)² + 0.5 = 0.5 + 2i
    expect(a[1]).toBeCloseTo(2, 12);
    const b = jsReference(F_REGRESSION_CORPUS[1].source, [{ z: [2, 0], c: [3, 0] }] as Sample[])[0];
    expect(b[0]).toBeCloseTo(11, 12); // 2 + 3² = 11
    expect(b[1]).toBeCloseTo(0, 12);
  });

  it("H1: buildEscapeProbeGLSL emits a bool escapeFn coercing a trailing assignment (no cvec return)", () => {
    const g = buildEscapeProbeGLSL(ESCAPE_REGRESSION_CORPUS[0].source); // x = z^2
    expect(g).toContain("bool escapeFn(cvec z, cvec c)");
    expect(g).toContain("!= 0.0"); // real-part bool coercion of the trailing assignment
    expect(g).not.toMatch(/return\s+x\s*;/); // must NOT return the cvec x from a bool fn
    expect(g).toContain("void main()");
    expect(g).toContain("escapeFn(");
  });

  it("H1: jsEscapeReference — `x = z^2` escapes iff re(z²) ≠ 0 (true for z ≠ 0)", () => {
    const { source, fSource } = ESCAPE_REGRESSION_CORPUS[0];
    expect(jsEscapeReference(source, fSource, [{ z: [3, 0], c: [0, 0] }] as Sample[])[0]).toBe(true);
    expect(jsEscapeReference(source, fSource, [{ z: [0, 0], c: [0, 0] }] as Sample[])[0]).toBe(false);
  });
});
