// Roadmap #16 PR-B — the app-facing deltoid scaffold (src/exact/deltoidExact.ts): the exact curve/cusp
// strings shown in the UI, and the numeric branch points solved from the exact cusp locus.
import { describe, it, expect } from "vitest";
import {
  DELTOID_CUSP_LOCUS_TEXT,
  DELTOID_EXACT_CURVE,
  deltoidBranchPoints,
  prettyCurve,
} from "../src/exact/deltoidExact.js";

describe("deltoid exact scaffold (app-facing)", () => {
  it("exposes the exact curve and cusp-locus strings", () => {
    expect(DELTOID_EXACT_CURVE.text).toBe("2 w^2 - z̄^2 w - z̄ = 0");
    expect(prettyCurve(DELTOID_EXACT_CURVE.text)).toBe("2w² − z̄²w − z̄ = 0");
    expect(DELTOID_CUSP_LOCUS_TEXT).toBe("z̄⁴ + 8z̄");
  });

  it("solves the cusp locus into 3 finite branch points on |z| = 2 (+ the degenerate z̄ = 0)", () => {
    const pts = deltoidBranchPoints();
    const degenerate = pts.filter((p) => p.degenerate);
    const finite = pts.filter((p) => !p.degenerate);
    expect(degenerate.length).toBe(1); // z̄ = 0 → η(0) = ∞
    expect(finite.length).toBe(3); // z̄³ = −8
    for (const p of finite) {
      expect(Math.hypot(p.z[0], p.z[1])).toBeCloseTo(2, 6);
      // z = conj(z̄) and each is a genuine root of the exact cusp locus disc_w = z̄⁴ + 8z̄.
      const [x, y] = p.zbar;
      // z̄⁴ + 8z̄ evaluated numerically ≈ 0
      const z2: [number, number] = [x * x - y * y, 2 * x * y];
      const z4: [number, number] = [z2[0] * z2[0] - z2[1] * z2[1], 2 * z2[0] * z2[1]];
      expect(Math.hypot(z4[0] + 8 * x, z4[1] + 8 * y)).toBeLessThan(1e-9);
    }
  });

  it("prettifies superscripts and the minus sign", () => {
    expect(prettyCurve("w^3 - z̄^2 w - 1 = 0")).toBe("w³ − z̄²w − 1 = 0");
  });
});
