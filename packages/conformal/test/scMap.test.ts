import { describe, expect, it } from "vitest";
import type { C } from "../src/vandermondeArnoldi.js";
import { fitSchwarzChristoffel, type SCMap } from "../src/scMap.js";

const reproErr = (m: SCMap, poly: readonly C[]): number =>
  Math.max(...poly.map((z, k) => { const f = m.forward(m.prevertices[k]); return Math.hypot(f[0] - z[0], f[1] - z[1]); }));

const pentagon: C[] = Array.from({ length: 5 }, (_, k): C => [Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5)]);
const square: C[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const LSHAPE: C[] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];

describe("fitSchwarzChristoffel — precise mode", () => {
  it("reproduces convex and reentrant polygons to ≥10 digits", () => {
    for (const poly of [pentagon, square, LSHAPE]) {
      const m = fitSchwarzChristoffel({ vertices: poly });
      expect(m.mode).toBe("precise");
      expect(m.converged).toBe(true);
      expect(m.degraded).toBe(false);
      expect(reproErr(m, poly)).toBeLessThan(1e-10);
    }
  });

  it("exposes the accessory constants, conformal centre, and quadrilateral modulus", () => {
    const m = fitSchwarzChristoffel({ vertices: square });
    expect(Math.hypot(m.center[0], m.center[1])).toBeLessThan(1e-9); // square centred at origin
    expect(Math.hypot(m.constant[0], m.constant[1])).toBeGreaterThan(0.1); // C = f′(0) ≠ 0
    expect(m.modulus).toBeCloseTo(1, 6); // conformal modulus of a square = 1
  });

  it("warm-starts from a prior solve on a perturbed polygon (continuation)", () => {
    const base = fitSchwarzChristoffel({ vertices: pentagon });
    const perturbed: C[] = pentagon.map((z, k): C => (k === 2 ? [z[0] + 0.05, z[1] - 0.03] : z));
    const warm = fitSchwarzChristoffel({ vertices: perturbed }, { warmStart: base });
    expect(warm.converged).toBe(true);
    expect(reproErr(warm, perturbed)).toBeLessThan(1e-10);
  });
});

describe("fitSchwarzChristoffel — fast mode (lightning)", () => {
  it("returns an instant approximate map on a convex polygon, honestly flagged", () => {
    const fast = fitSchwarzChristoffel({ vertices: pentagon }, { mode: "fast" });
    expect(fast.mode).toBe("fast");
    expect(fast.converged).toBe(false); // it is the approximate lightning fit, never "converged"
    expect(fast.degraded).toBe(false); // convex ⇒ reliable
    expect(fast.prevertices.length).toBe(5);
    expect(fast.residual).toBeGreaterThan(0);
    expect(reproErr(fast, pentagon)).toBeLessThan(1e-2); // coarse (a few digits) but usable
  });

  it("agrees with precise on a gauge-invariant — the conformal modulus of a square", () => {
    const fast = fitSchwarzChristoffel({ vertices: square }, { mode: "fast" });
    const prec = fitSchwarzChristoffel({ vertices: square });
    expect(fast.modulus).toBeCloseTo(prec.modulus ?? 0, 2); // both ≈ 1
  });

  it("flags degraded when the lightning fit is unreliable (reentrant L-shape)", () => {
    const fast = fitSchwarzChristoffel({ vertices: LSHAPE }, { mode: "fast" });
    expect(fast.degraded).toBe(true); // honest: precise mode is the path for reentrant polygons
  });
});
