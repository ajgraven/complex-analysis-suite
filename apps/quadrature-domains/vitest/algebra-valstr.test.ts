// Characterization net for valStr — the compact decimal value formatter carved out of installAlgebra
// (refactor D, installAlgebra carve-out 8). It renders a stored {approx:{re,im}} record as the per-card
// hovertext value ("re ± im·i", each component rounded to 1e-6, minus = U+2212). It is INJECTED into the
// PROV_UI label context, and the PROV_UI tests inject a MOCK valStr — so the real rounding/sign logic had no
// executable coverage. Distinct from exactValueStr (exact ℚ(i) rationals); this reads the pre-computed float.
// Pure leaf ⇒ pinned directly, no jsdom. (substList, which also formats via valStr, is deferred: it calls the
// un-exportable IIFE-scoped latexPlain, so moving it needs latexPlain injected as a parameter.)
import { describe, it, expect } from "vitest";
import { valStr } from "../app/algebra/algebra-format.mjs";

describe("valStr — {approx:{re,im}} → compact decimal string", () => {
  it("returns '?' when there is no approx value", () => {
    expect(valStr(null)).toBe("?");
    expect(valStr({})).toBe("?");
    expect(valStr({ approx: null })).toBe("?");
  });
  it("real-only (no imaginary part)", () => {
    expect(valStr({ approx: { re: 2, im: 0 } })).toBe("2");
    expect(valStr({ approx: { re: 0, im: 0 } })).toBe("0");
  });
  it("imaginary-only ⇒ '<n>i'", () => {
    expect(valStr({ approx: { re: 0, im: 3 } })).toBe("3i");
  });
  it("both parts ⇒ 're ± im·i', ' + ' for positive im and ' − ' (U+2212) for negative", () => {
    expect(valStr({ approx: { re: 2, im: 3 } })).toBe("2 + 3i");
    expect(valStr({ approx: { re: 2, im: -3 } })).toBe("2 − 3i"); // U+2212, not '-'
  });
  it("rounds each component to 1e-6", () => {
    expect(valStr({ approx: { re: 0.1234567, im: 0 } })).toBe("0.123457");
    expect(valStr({ approx: { re: 1.9999999, im: 0 } })).toBe("2"); // rounds up to an integer
  });
  it("uses the typographic MINUS U+2212 on a negative imaginary part, never an ASCII hyphen", () => {
    const s = valStr({ approx: { re: 1, im: -1 } });
    expect(s).toBe("1 − 1i");
    expect(s).toContain("−");
    expect(s).not.toContain("-");
  });
});
