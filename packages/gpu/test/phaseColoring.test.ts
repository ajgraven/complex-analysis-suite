// PHASE_COLORING_GLSL — the shared domain-coloring core lifted from the Complex-Function-Plotter app
// (ADR-0007: plotter + Faber-transform visualizer). A string-shape check; the real-WebGL compile is
// covered by the plotter's browser tests (which consume this exact string).
import { describe, expect, it } from "vitest";
import { PHASE_COLORING_GLSL } from "../src/glsl/index.js";

describe("PHASE_COLORING_GLSL", () => {
  it("exposes vec3 colorAt(cvec w)", () => {
    expect(PHASE_COLORING_GLSL).toContain("vec3 colorAt(cvec w)");
  });

  it("declares the coloring uniform contract consumers must supply", () => {
    for (const u of [
      "uniform sampler2D uPhaseLUT",
      "uniform int       uModulus",
      "uniform int       uEnhance",
      "uniform float     uHueSign",
      "uniform int       uCvd",
      "uniform int       uUncertainty",
      "uniform float     uLevelAbs",
    ]) {
      expect(PHASE_COLORING_GLSL, u).toContain(u);
    }
  });

  it("carries the modulus, enhancement, CVD, and level-set layers", () => {
    for (const fn of [
      "float modulusLightness(float m)",
      "float enhancement(cvec w",
      "vec3 simulateCvd(vec3 c)",
      "float line0(",
      "fwidth(",
    ]) {
      expect(PHASE_COLORING_GLSL, fn).toContain(fn);
    }
  });

  it("depends only on the complex stdlib symbols (cvec/carg/cabsf/cre1/cre/cim)", () => {
    // It uses these — they are provided by COMPLEX_SINGLE/DERIVED, concatenated ahead of it.
    expect(PHASE_COLORING_GLSL).toContain("cabsf(w)");
    expect(PHASE_COLORING_GLSL).toContain("cre1(carg(w))");
  });
});
