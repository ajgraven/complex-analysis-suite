import { describe, it, expect } from "vitest";
import { AIRFOIL_FRAGMENT_SHADER } from "../src/render/airfoilShader.js";

// Node-level regression on the two-pane shader assembly (the live WebGL parity is covered by the
// render check): the shared @cas/gpu snippets are present, both planes are computed, and the physical
// velocity divides by J'(ζ).
describe("airfoil fragment shader assembly", () => {
  it("declares WebGL2 and both cylinder/airfoil field functions", () => {
    expect(AIRFOIL_FRAGMENT_SHADER).toContain("#version 300 es");
    expect(AIRFOIL_FRAGMENT_SHADER).toContain("cvec cylVel(cvec zeta)");
    expect(AIRFOIL_FRAGMENT_SHADER).toContain("cvec cylPot(cvec zeta)");
    expect(AIRFOIL_FRAGMENT_SHADER).toContain("cvec jinv(cvec z)");
    expect(AIRFOIL_FRAGMENT_SHADER).toContain("cvec jprime(cvec zeta)");
  });

  it("switches ζ and the velocity on uMode (airfoil pane divides by J')", () => {
    expect(AIRFOIL_FRAGMENT_SHADER).toContain("(uMode == 0) ? p : jinv(p)");
    expect(AIRFOIL_FRAGMENT_SHADER).toContain("cdiv(cylVel(zeta), jprime(zeta))");
  });

  it("pulls in the shared @cas/gpu GLSL by function name", () => {
    for (const sym of ["planeFromFrag", "hsv2rgb", "csqrt", "clog", "cdiv", "cmul"]) {
      expect(AIRFOIL_FRAGMENT_SHADER).toContain(sym);
    }
  });
});
