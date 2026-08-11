import { describe, expect, it } from "vitest";
import { subscript, superscript } from "../src/index.js";

// Golden corpus for the sub/superscript label helpers (the display half of the poly-helpers
// extraction). Byte-identical to QD.Format: digits map, everything else passes through.

describe("subscript", () => {
  it("maps each digit to its Unicode subscript", () => {
    expect(subscript(0)).toBe("₀");
    expect(subscript(12)).toBe("₁₂");
    expect(subscript(1234567890)).toBe("₁₂₃₄₅₆₇₈₉₀");
  });
  it("passes non-digit characters through unchanged", () => {
    expect(subscript("a_1")).toBe("a_₁");
    expect(subscript("-3")).toBe("-₃"); // the sign is not mapped (QD.Format parity)
  });
});

describe("superscript", () => {
  it("maps each digit to its Unicode superscript", () => {
    expect(superscript(0)).toBe("⁰");
    expect(superscript(23)).toBe("²³");
    expect(superscript(1234567890)).toBe("¹²³⁴⁵⁶⁷⁸⁹⁰");
  });
  it("passes non-digit characters through unchanged", () => {
    expect(superscript("z^2")).toBe("z^²");
    expect(superscript("-4")).toBe("-⁴"); // digits only, matching QD.Format
  });
});
