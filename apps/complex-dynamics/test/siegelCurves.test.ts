import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { siegelInvariantCurves } from "../src/render/siegelCurves";

// c for the golden-mean rotation number, computed EXACTLY as the app's own "Siegel c for θ" does:
// c = λ/2 − λ²/4 with λ = e^{2πiθ}. It used to be the 6-decimal rounding [-0.390541, 0.586788],
// whose |λ| is off by ~1e-6 — fine against the old 0.02 indifference tolerance, which also admitted
// genuinely ATTRACTING fixed points at |λ| = 0.99 and drew nine "invariant curves" around them.
// With the tolerance at 1e-9 the parameter has to be the real one. (WP5, review 2026-09-16.)
const GOLDEN = (Math.sqrt(5) - 1) / 2;
const siegelC = (theta: number): Complex => {
  const l: Complex = [Math.cos(2 * Math.PI * theta), Math.sin(2 * Math.PI * theta)];
  const l2: Complex = [l[0] * l[0] - l[1] * l[1], 2 * l[0] * l[1]];
  return [l[0] / 2 - l2[0] / 4, l[1] / 2 - l2[1] / 4];
};
// θ = 1 − φ rather than φ: both are golden-type rotation numbers and the two parameters are complex
// conjugates, and this is the one the assertions below were written against (centre ≈ −0.3685+0.338i).
const GOLDEN_SIEGEL: Complex = siegelC(1 - GOLDEN);

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

// ── WP5 (review 2026-09-16): curves are drawn only at |λ| = 1 ─────────────────────────────────
describe("siegelInvariantCurves — an attracting fixed point has no Siegel disc", () => {
  it("refuses a near-miss that is actually attracting", () => {
    // At |λ| = 0.99 and 0.985 this drew nine "invariant curves". They were orbits spiralling into an
    // attractor, which look like nested loops and are nothing of the kind; the README promises the
    // overlay appears "only for a genuine Brjuno rotation number".
    const near = (r: number): Complex => {
      const t = 1 - GOLDEN;
      const l: Complex = [r * Math.cos(2 * Math.PI * t), r * Math.sin(2 * Math.PI * t)];
      const l2: Complex = [l[0] * l[0] - l[1] * l[1], 2 * l[0] * l[1]];
      return [l[0] / 2 - l2[0] / 4, l[1] / 2 - l2[1] / 4];
    };
    for (const r of [0.985, 0.99, 0.995, 0.999, 1.01]) expect(siegelInvariantCurves(near(r))).toBeNull();
  });

  it("still draws them at the exact golden-mean parameter", () => {
    expect(siegelInvariantCurves(GOLDEN_SIEGEL)).not.toBeNull();
  });
});
