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
