// Characterization net for _pronyLatex — the Prony-polynomial math→LaTeX formatter carved out of
// installAlgebra (refactor D, installAlgebra carve-out 7). It renders the reconstructed polynomial on the
// "Shape from moments" result card and — reachable only through a live DOM mount — had no executable
// coverage, despite branchy formatting logic: descending powers, 1e-6 rounding, near-zero-term dropping,
// unit-coefficient elision on a z-power ("z" not "1z"), leading-sign handling, and a parenthesised
// (a±bi)zᵏ form for complex coefficients. Pure ⇒ pinned directly, no jsdom. Coefficients are ASCENDING
// {re,im} (index k is the z^k coefficient); the output lists them in descending order.
import { describe, it, expect } from "vitest";
import { _pronyLatex } from "../app/algebra/algebra-latex.mjs";

describe("_pronyLatex — Σ cₖ zᵏ = 0 as LaTeX (descending, rounded, honest about zero terms)", () => {
  it("an all-zero / empty polynomial renders as '0 = 0'", () => {
    expect(_pronyLatex([])).toBe("0 = 0");
    expect(_pronyLatex([{ re: 0, im: 0 }, { re: 0, im: 0 }])).toBe("0 = 0");
  });

  it("a bare constant", () => {
    expect(_pronyLatex([{ re: 2, im: 0 }])).toBe("2 = 0");
  });

  it("elides a unit coefficient on a z-power ('z', not '1z')", () => {
    expect(_pronyLatex([{ re: 0, im: 0 }, { re: 1, im: 0 }])).toBe("z = 0");
  });

  it("a leading negative term gets a '-' prefix, not ' - '", () => {
    expect(_pronyLatex([{ re: 0, im: 0 }, { re: -1, im: 0 }])).toBe("-z = 0");
  });

  it("z^2 - 1 (a dropped middle zero coefficient + z^{k} for k≥2)", () => {
    expect(_pronyLatex([{ re: -1, im: 0 }, { re: 0, im: 0 }, { re: 1, im: 0 }])).toBe("z^{2} - 1 = 0");
  });

  it("z^2 - 3z + 2 (multi-term sign joining, unit leading coefficient)", () => {
    expect(_pronyLatex([{ re: 2, im: 0 }, { re: -3, im: 0 }, { re: 1, im: 0 }])).toBe("z^{2} - 3z + 2 = 0");
  });

  it("a complex coefficient is parenthesised as (a±bi)zᵏ (always joined with '+')", () => {
    expect(_pronyLatex([{ re: 0, im: 0 }, { re: 1, im: 2 }])).toBe("(1+2i)z = 0");
    expect(_pronyLatex([{ re: 0, im: 0 }, { re: 3, im: -4 }])).toBe("(3-4i)z = 0");
  });

  it("rounds coefficients to 1e-6 and drops sub-1e-9 terms", () => {
    // c0 ≈ 1e-10 rounds to 0 ⇒ dropped; c1 ≈ 2.9999999 rounds to 3.
    expect(_pronyLatex([{ re: 1e-10, im: 0 }, { re: 2.9999999, im: 0 }])).toBe("3z = 0");
  });
});
