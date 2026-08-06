// Characterization net for the exact ℚ(i) value formatter carved out of installAlgebra (refactor D,
// installAlgebra carve-out 3): fmtRat (float → exact rational via the store's continued-fraction
// rationalizer) + exactValueStr (a full complex value → "re ± im·i"). These drove the "Set values" inline
// preview + toast and were reachable only through a live DOM mount, so the display had NO executable
// coverage. Pinned here directly (pure; the module side-effect-imports qd-equations so ratApprox is wired —
// no jsdom, no DOM). The sign glyph is the typographic MINUS U+2212, not an ASCII hyphen — pinned so a
// "cleanup" can't silently swap it. Expected values are ground-truthed against ratApprox, not guessed.
import { describe, it, expect } from "vitest";
import { fmtRat, exactValueStr } from "../app/algebra/algebra-format.mjs";

describe("fmtRat — one real component as an exact rational (continued-fraction rationalizer)", () => {
  it("rationalizes terminating decimals to lowest terms", () => {
    expect(fmtRat(0.2)).toBe("1/5");
    expect(fmtRat(0.5)).toBe("1/2");
    expect(fmtRat(0.25)).toBe("1/4");
    expect(fmtRat(0.75)).toBe("3/4");
    expect(fmtRat(1.5)).toBe("3/2");
  });
  it("drops the denominator when it is 1 (renders a bare integer, not 'n/1')", () => {
    expect(fmtRat(3)).toBe("3");
    expect(fmtRat(0)).toBe("0");
  });
  it("treats a missing/zero argument as 0 (the `x || 0` guard)", () => {
    expect(fmtRat(undefined)).toBe("0");
    expect(fmtRat(null)).toBe("0");
  });
});

describe("exactValueStr — a full complex value as an exact ℚ(i) string", () => {
  it("real only ⇒ just the rational (no imaginary part)", () => {
    expect(exactValueStr(0.5, 0)).toBe("1/2");
    expect(exactValueStr(3, 0)).toBe("3");
  });
  it("imaginary only ⇒ '<rat>i', with a leading MINUS when negative", () => {
    expect(exactValueStr(0, 0.5)).toBe("1/2i");
    expect(exactValueStr(0, -0.5)).toBe("−1/2i"); // U+2212, not '-'
  });
  it("both parts ⇒ 're ± im·i', ' + ' for positive im and ' − ' (U+2212) for negative", () => {
    expect(exactValueStr(0.5, 0.25)).toBe("1/2 + 1/4i");
    expect(exactValueStr(0.5, -0.25)).toBe("1/2 − 1/4i");
  });
  it("zero / missing arguments ⇒ '0' (guards both components)", () => {
    expect(exactValueStr(0, 0)).toBe("0");
    expect(exactValueStr()).toBe("0");
  });
  it("uses the typographic MINUS U+2212, never an ASCII hyphen (display guardrail)", () => {
    // The negative-imaginary strings must carry U+2212 (−), not '-' (U+002D). Assert the code point directly
    // so a font/editor swap to a hyphen fails loudly rather than shipping a subtly wrong exact value.
    expect(exactValueStr(0, -0.5)).toContain("−");
    expect(exactValueStr(0, -0.5)).not.toContain("-");
    expect(exactValueStr(1, -1)).toContain(" − ");
  });
});
