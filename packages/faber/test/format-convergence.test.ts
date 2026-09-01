// formatFaberPoly readability + faberConvergence shape — ported from the QD app's faber-analysis suite.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import { faberPolynomial, formatFaberPoly, faberConvergence } from "../src/index.js";
import type { ExteriorMap } from "../src/index.js";

const re = (x: number): Cx => ({ re: x, im: 0 });
const phiDisk: ExteriorMap = { c: 1, laurent: [] };
const phiJouk: ExteriorMap = { c: 1, laurent: [re(0), re(1)] };

describe("formatFaberPoly", () => {
  it("F₂ (interval) renders as \"ζ² − 2\"", () => {
    expect(formatFaberPoly(faberPolynomial(phiJouk, 2))).toBe("ζ² − 2");
  });
  it("F₁ (disk) renders as \"ζ\"", () => {
    expect(formatFaberPoly(faberPolynomial(phiDisk, 1))).toBe("ζ");
  });
  it("a custom `sup` renderer replaces the Unicode exponent (for <sup> typesetting)", () => {
    expect(formatFaberPoly(faberPolynomial(phiJouk, 2), { varSym: "w", sup: (k) => `^{${k}}` })).toBe("w^{2} − 2");
  });

  it("maxTerms caps the printed terms and elides the rest with `+ …`", () => {
    // A dense degree-5 polynomial 1 + 2ζ + 3ζ² + 4ζ³ + 5ζ⁴ + 6ζ⁵ (6 non-zero terms, descending print).
    const dense: Cx[] = [re(1), re(2), re(3), re(4), re(5), re(6)];
    expect(formatFaberPoly(dense, { maxTerms: 3 })).toBe("6ζ⁵ + 5ζ⁴ + 4ζ³ + …");
    // No ellipsis when the term count is within the cap (or the cap is unset).
    expect(formatFaberPoly(dense, { maxTerms: 6 })).toBe("6ζ⁵ + 5ζ⁴ + 4ζ³ + 3ζ² + 2ζ + 1");
    expect(formatFaberPoly(dense, { maxTerms: 10 }).includes("…")).toBe(false);
    expect(formatFaberPoly(faberPolynomial(phiJouk, 2), { maxTerms: 2 })).toBe("ζ² − 2"); // 2 terms, cap 2 → no cut
  });
});

describe("faberConvergence", () => {
  it("returns 5 orders n = 1..5", () => {
    const conv = faberConvergence(phiJouk, 5);
    expect(conv.length).toBe(5);
    expect(conv[0].n).toBe(1);
    expect(conv[4].n).toBe(5);
  });
  it("each order has roots array + converged flag", () => {
    const conv = faberConvergence(phiJouk, 5);
    expect(conv.every((o) => Array.isArray(o.roots) && typeof o.converged === "boolean")).toBe(true);
  });
  it("low-order interval solves converge with small residual", () => {
    const conv = faberConvergence(phiJouk, 5);
    expect(conv.every((o) => o.converged)).toBe(true);
    expect(conv.every((o) => o.residual < 1e-6)).toBe(true);
  });
});
