import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { siegelInvariantCurves } from "../src/render/siegelCurves";

const GOLDEN_SIEGEL: Complex = [-0.390541, 0.586788]; // c for the golden-mean rotation number

describe("siegelInvariantCurves", () => {
  it("the golden-mean Siegel parameter has an indifferent fixed point + bounded nested curves", () => {
    const r = siegelInvariantCurves(GOLDEN_SIEGEL);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.multiplier).toBeCloseTo(1, 3); // |λ| = 1 (indifferent)
    expect(r.center[0]).toBeCloseTo(-0.3685, 2);
    expect(r.center[1]).toBeCloseTo(0.338, 2);
    expect(r.curves.length).toBeGreaterThanOrEqual(3); // several nested invariant curves
    // every kept curve stays bounded (it samples a curve inside the disc)
    for (const curve of r.curves) {
      for (const z of curve) expect(Math.hypot(z[0], z[1])).toBeLessThan(4);
    }
  });

  it("returns null where there is no Siegel disc", () => {
    expect(siegelInvariantCurves([0, 0])).toBeNull(); // superattracting fixed point (|λ|=0)
    expect(siegelInvariantCurves([-1, 0])).toBeNull(); // repelling fixed point (|λ|≈1.24)
    expect(siegelInvariantCurves([0.25, 0])).toBeNull(); // parabolic cusp (λ=1, θ rational)
  });
});
