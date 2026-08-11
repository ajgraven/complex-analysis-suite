import { describe, expect, it } from "vitest";
import { computeSigmaLevelCurves, makeUnboundedLaurentSchwarz, type Complex, type SchwarzSigma } from "../src/index.js";

// σ level curves (F4b): marching squares of |σ| (solid) + arg σ (dashed, seam-free). Synthetic surfaces with
// known contour geometry pin the marcher exactly; the real deltoid engine is a non-empty in-bbox smoke.

const mid = (s: { a: Complex; b: Complex }): Complex => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
const inBox = (w: Complex, b: readonly [number, number, number, number], eps = 1e-9): boolean =>
  w[0] >= b[0] - eps && w[0] <= b[1] + eps && w[1] >= b[2] - eps && w[1] <= b[3] + eps;

/** The identity reflection σ(w) = w: |σ| contours are circles, phase contours are lines through the origin. */
const IDENTITY: SchwarzSigma = { sigma: (w) => [w[0], w[1]] };

describe("computeSigmaLevelCurves — magnitude (F4b)", () => {
  it("|σ| = 1 of the identity is the unit circle (every segment midpoint on |w| ≈ 1)", () => {
    const box = [-1.5, 1.5, -1.5, 1.5] as const;
    const { magnitude } = computeSigmaLevelCurves(IDENTITY, box, { grid: 80, magnitudeLevels: [1], phaseLines: 0 });
    expect(magnitude.length).toBeGreaterThan(100); // ~2π/h segments around the circle
    for (const s of magnitude) {
      const m = mid(s);
      expect(Math.abs(Math.hypot(m[0], m[1]) - 1)).toBeLessThan(0.03);
    }
  });

  it("skips cells where σ is undefined — no contour leaks outside the σ-defined region", () => {
    // σ defined only inside the unit disk; the |σ| = 0.5 circle lives well inside it.
    const disk: SchwarzSigma = { sigma: (w) => (Math.hypot(w[0], w[1]) < 1 ? [w[0], w[1]] : null) };
    const box = [-2, 2, -2, 2] as const;
    const { magnitude } = computeSigmaLevelCurves(disk, box, { grid: 60, magnitudeLevels: [0.5], phaseLines: 0 });
    expect(magnitude.length).toBeGreaterThan(40);
    for (const s of magnitude) {
      expect(Math.hypot(...mid(s))).toBeLessThan(1); // the whole contour stayed in the σ-defined disk
      expect(Math.abs(Math.hypot(...mid(s)) - 0.5)).toBeLessThan(0.03);
    }
  });

  it("auto-derives a 5-level geometric ladder off the median |σ| when none is given", () => {
    const { magnitudeLevels } = computeSigmaLevelCurves(IDENTITY, [-1, 1, -1, 1], { grid: 40, phaseLines: 0 });
    expect(magnitudeLevels).toHaveLength(5);
    expect(magnitudeLevels.every((L) => L > 0)).toBe(true);
    // Geometric: each level is half the previous (4,2,1,0.5,0.25 × median).
    for (let k = 1; k < magnitudeLevels.length; k++) {
      expect(magnitudeLevels[k] / magnitudeLevels[k - 1]).toBeCloseTo(0.5, 6);
    }
  });
});

describe("computeSigmaLevelCurves — phase (F4b, seam-free)", () => {
  const box = [-1.5, 1.5, -1.5, 1.5] as const;

  it("arg contours of the identity lie on lines through the origin (real + imaginary axes for M = 2)", () => {
    const { phase } = computeSigmaLevelCurves(IDENTITY, box, { grid: 80, magnitudeLevels: [], phaseLines: 2 });
    expect(phase.length).toBeGreaterThan(100);
    // θ = 0 → the real axis (y ≈ 0); θ = π/2 → the imaginary axis (x ≈ 0). Every segment is on ONE of them.
    for (const s of phase) {
      const m = mid(s);
      expect(Math.min(Math.abs(m[0]), Math.abs(m[1]))).toBeLessThan(0.05);
    }
    const onReal = phase.some((s) => Math.abs(mid(s)[1]) < 0.05 && Math.abs(mid(s)[0]) > 0.5);
    const onImag = phase.some((s) => Math.abs(mid(s)[0]) < 0.05 && Math.abs(mid(s)[1]) > 0.5);
    expect(onReal && onImag, "both axes drawn").toBe(true);
  });

  it("draws the NEGATIVE real axis — the arg = ±π seam is contoured, not dropped", () => {
    // Raw-arg marching squares would reject the branch cut here; the rotated Im(σ·e^{−iθ}) field has none.
    const { phase } = computeSigmaLevelCurves(IDENTITY, box, { grid: 80, magnitudeLevels: [], phaseLines: 1 });
    const onNegReal = phase.some((s) => Math.abs(mid(s)[1]) < 0.05 && mid(s)[0] < -0.5);
    const onPosReal = phase.some((s) => Math.abs(mid(s)[1]) < 0.05 && mid(s)[0] > 0.5);
    expect(onNegReal && onPosReal, "θ=0 contour spans the whole real axis").toBe(true);
  });
});

describe("computeSigmaLevelCurves — the deltoid engine (F4b smoke)", () => {
  const DELTOID = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);
  const box = [-3, 3, -3, 3] as const;

  it("contours the reconstructed σ: non-empty magnitude + phase, every endpoint in the box", () => {
    const { magnitude, phase, magnitudeLevels } = computeSigmaLevelCurves(DELTOID, box, { grid: 90 });
    expect(magnitude.length).toBeGreaterThan(0);
    expect(phase.length).toBeGreaterThan(0);
    expect(magnitudeLevels).toHaveLength(5);
    for (const s of [...magnitude, ...phase]) {
      expect(inBox(s.a, box), `endpoint ${s.a} out of box`).toBe(true);
      expect(inBox(s.b, box), `endpoint ${s.b} out of box`).toBe(true);
    }
  });
});
