import { describe, it, expect } from "vitest";
import { FIELD_FRAGMENT_SHADER, MAX_SINGULARITIES } from "../src/render/fieldShader.js";

// A live WebGL2 context can't run under node, so the GLSL↔JS parity test is a browser slice (later
// M0). This node-level regression pins that the shader SOURCE assembled correctly — the shared @cas/gpu
// snippets are present and the field summation mirrors the JS twin's terms — so a dropped snippet or a
// renamed uniform fails fast in the fast test lane rather than only at runtime.
describe("field fragment shader assembly", () => {
  it("declares WebGL2 + the field entry point", () => {
    expect(FIELD_FRAGMENT_SHADER).toContain("#version 300 es");
    expect(FIELD_FRAGMENT_SHADER).toContain("cvec fieldE(cvec z)");
    expect(FIELD_FRAGMENT_SHADER).toContain("void main()");
  });

  it("pulls in the shared @cas/gpu GLSL stdlib by function name", () => {
    for (const sym of ["cadd", "csub", "cmul", "cdiv", "cneg", "carg", "cabsf", "planeFromFrag", "hsv2rgb"]) {
      expect(FIELD_FRAGMENT_SHADER).toContain(sym);
    }
  });

  it("mirrors the JS twin's terms: c/(z−a) monopoles and −μ/(z−a)² doublets", () => {
    expect(FIELD_FRAGMENT_SHADER).toContain("cdiv(uMonoCoef[i], csub(z, uMonoPos[i]))");
    expect(FIELD_FRAGMENT_SHADER).toContain("cdiv(cneg(uDoubletMu[i]), cmul(d, d))");
  });

  it("bakes the uniform-array capacity from MAX_SINGULARITIES", () => {
    expect(MAX_SINGULARITIES).toBeGreaterThan(0);
    expect(FIELD_FRAGMENT_SHADER).toContain(`#define MAX_SING ${MAX_SINGULARITIES}`);
  });
});
