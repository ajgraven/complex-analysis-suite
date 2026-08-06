// Characterization net for buildHForm — the quadrature-data h(w) LaTeX builder carved out of installAlgebra
// (refactor D, installAlgebra carve-out 9). It renders h(w) = Σⱼ Σ_{s≥1} C_{j,s}/(w − aⱼ)^s on the φ/h
// reference card, either symbolically (a_{j}, C_{j,s}) or with the pole positions / principal-part
// coefficients substituted as values (numeric=true, via QD.RiemannLatex.katexCmpxParen). Reachable only
// through a live DOM mount before, so no coverage. Pure; the module side-effect-imports riemann-latex so
// katexCmpxParen is wired ⇒ headless (no jsdom). Backslashes are doubled in the JS literals (\\dfrac === \dfrac).
import { describe, it, expect } from "vitest";
import { buildHForm } from "../app/algebra/algebra-latex.mjs";

describe("buildHForm — h(w) partial-fraction LaTeX (symbolic and numeric)", () => {
  it("no poles ⇒ 'h(w) = 0' (empty or missing poles list)", () => {
    expect(buildHForm({ poles: [] }, false)).toBe("h(w) \\;=\\; 0");
    expect(buildHForm({}, false)).toBe("h(w) \\;=\\; 0"); // missing `poles` defaults to []
  });

  it("symbolic: one pole, one principal coefficient ⇒ a single \\dfrac term (power 1 ⇒ no exponent)", () => {
    expect(buildHForm({ poles: [{ a: {}, principal: [{}] }] }, false))
      .toBe("h(w) \\;=\\; \\dfrac{C_{1,1}}{(w - a_{1})}");
  });

  it("symbolic: higher principal parts get ^{power}, joined with ' + '", () => {
    expect(buildHForm({ poles: [{ a: {}, principal: [{}, {}] }] }, false))
      .toBe("h(w) \\;=\\; \\dfrac{C_{1,1}}{(w - a_{1})} + \\dfrac{C_{1,2}}{(w - a_{1})^{2}}");
  });

  it("symbolic: multiple poles index a_{j} / C_{j,s} from 1", () => {
    expect(buildHForm({ poles: [{ a: {}, principal: [{}] }, { a: {}, principal: [{}] }] }, false))
      .toBe("h(w) \\;=\\; \\dfrac{C_{1,1}}{(w - a_{1})} + \\dfrac{C_{2,1}}{(w - a_{2})}");
  });

  it("numeric: substitutes the pole/coefficient values via katexCmpxParen (real ⇒ bare, complex ⇒ parenthesised)", () => {
    expect(buildHForm({ poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: -2 }] }] }, true))
      .toBe("h(w) \\;=\\; \\dfrac{\\left(1 - 2i\\right)}{(w - 2)}");
  });
});
