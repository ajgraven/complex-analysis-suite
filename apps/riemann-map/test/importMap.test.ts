import { describe, it, expect } from "vitest";
import { CD_TO_RM_BOTTCHER_LINK, CD_TO_RM_BOTTCHER_PSI_AT_2 } from "@cas/interchange";
import { importExteriorMap } from "../src/interchange/importMap.js";

/** ψ(w) = γ₁·w + Σ bₖ·w⁻ᵏ, the same evaluation the disk-image "import" source uses (real w here). */
function psiReal(lead: [number, number], coeffs: [number, number][], w: number): number {
  let re = lead[0] * w;
  coeffs.forEach((b, k) => {
    re += b[0] * Math.pow(w, -k);
  });
  return re;
}

describe("importExteriorMap", () => {
  it("decodes the CD→RM cross-app golden and evaluates ψ(2) = 2.125", () => {
    const m = importExteriorMap(CD_TO_RM_BOTTCHER_LINK);
    if (!m) throw new Error("expected the golden to import");
    expect(m.app).toBe("complex-dynamics");
    expect(m.lead).toEqual([1, 0]);
    expect(m.coeffs).toEqual([[0, 0], [0, 0], [0.5, 0]]);
    expect(psiReal(m.lead, m.coeffs, 2)).toBeCloseTo(CD_TO_RM_BOTTCHER_PSI_AT_2, 12);
  });

  it("accepts a link whether or not it carries the leading '#'", () => {
    expect(importExteriorMap(CD_TO_RM_BOTTCHER_LINK.replace(/^#/, ""))).not.toBeNull();
  });

  it("returns null for a #vs= view-state permalink (no s= payload)", () => {
    expect(importExteriorMap("#vs=eyJ2IjoxLCJhcHAiOiJybSJ9")).toBeNull();
  });

  it("returns null for junk / non-interchange text", () => {
    expect(importExteriorMap("not a link")).toBeNull();
    expect(importExteriorMap("")).toBeNull();
    expect(importExteriorMap("#s=@@@notbase64@@@")).toBeNull();
  });
});
