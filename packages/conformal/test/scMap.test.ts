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

  it("hits the crowding wall honestly on a strongly elongated polygon (degraded, never silently good)", () => {
    // A 50:1 sliver crowds the prevertices exponentially (minGap ≪ 1e-6), the classic SC failure mode.
    // The honest-labeling guardrail (ADR-0020, CLAUDE.md) must fire on the PRECISE path — the mode that is
    // supposed to be the reentrant/hard path — not read as a clean fit. The corpus only tripped `degraded`
    // in FAST mode before this; this pins the precise crowding wall. (On total crowding collapse the
    // reported residual is NaN — coincident prevertices — which, crucially, still reads as degraded and
    // NOT-converged: the ≈ accuracy tag never falsely reads small, so nothing is silently wrong.)
    const sliver: C[] = [[0, 0], [50, 0], [50, 1], [0, 1]];
    const m = fitSchwarzChristoffel({ vertices: sliver });
    expect(m.mode).toBe("precise");
    expect(m.degraded).toBe(true); // crowding wall tripped
    expect(m.converged).toBe(false); // honest: did not reach tolerance
    expect(m.residual < 1e-6).toBe(false); // the accuracy tag never reads as accurate (NaN or huge)
    expect(reproErr(m, sliver) < 1e-6).toBe(false); // and the map really is wrong there — not a false alarm
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

describe("fitSchwarzChristoffel — inverse map (ODE + Newton)", () => {
  const cases: { poly: C[]; pts: C[] }[] = [
    { poly: pentagon, pts: [[0.3, 0.1], [-0.2, 0.3], [0.0, 0.4]] },
    { poly: square, pts: [[0.5, 0.3], [-0.4, 0.6], [0.1, -0.7]] },
    { poly: LSHAPE, pts: [[0.5, 0.5], [1.5, 0.5], [0.5, 1.5]] },
  ];

  it("precise: f(f⁻¹(z)) = z for interior points, to ≥9 digits", () => {
    for (const { poly, pts } of cases) {
      const m = fitSchwarzChristoffel({ vertices: poly });
      for (const z of pts) {
        const w = m.inverse(z);
        expect(Math.hypot(w[0], w[1])).toBeLessThan(1.0000001); // lands in the closed disk
        const back = m.forward(w);
        expect(Math.hypot(back[0] - z[0], back[1] - z[1])).toBeLessThan(1e-9);
      }
    }
  });

  it("precise: f⁻¹(f(w)) = w for interior disk points", () => {
    const m = fitSchwarzChristoffel({ vertices: pentagon });
    for (const w of [[0.3, 0.1], [-0.2, 0.4], [0.0, -0.5]] as C[]) {
      const back = m.inverse(m.forward(w));
      expect(Math.hypot(back[0] - w[0], back[1] - w[1])).toBeLessThan(1e-9);
    }
  });

  it("fast: the lightning inverse round-trips a convex polygon (coarse)", () => {
    const m = fitSchwarzChristoffel({ vertices: square }, { mode: "fast" });
    const z: C = [0.3, 0.2];
    const w = m.inverse(z);
    expect(Math.hypot(w[0], w[1])).toBeLessThan(1.001);
    const back = m.forward(w);
    expect(Math.hypot(back[0] - z[0], back[1] - z[1])).toBeLessThan(1e-2);
  });

  it("precise: inverseWithStatus reports converged=true + a tiny residual for an interior point", () => {
    const m = fitSchwarzChristoffel({ vertices: pentagon });
    const z: C = [0.3, 0.1];
    const s = m.inverseWithStatus(z);
    expect(s.converged).toBe(true);
    expect(s.residual).toBeLessThan(1e-9);
    // …and the plain inverse() is exactly the same preimage (the status wrapper does not change the answer).
    expect(m.inverse(z)).toEqual(s.w);
  });

  it("precise: inverseWithStatus flags a point OUTSIDE Ω as not-converged (no silent wrong preimage)", () => {
    // The honesty hole the finding named: f⁻¹ of a z ∉ Ω used to `return w` unconditionally. The ODE+Newton
    // cannot drive |f(w) − z| down for an unreachable target, so the residual stays large and converged is false.
    const m = fitSchwarzChristoffel({ vertices: square }); // the square is [-1,1]²
    const s = m.inverseWithStatus([5, 5]); // well outside Ω
    expect(s.converged).toBe(false);
    expect(s.residual).toBeGreaterThan(1e-3);
  });

  it("fast: inverseWithStatus reports the coarse round-trip residual, converged ⇔ residual < tol", () => {
    const m = fitSchwarzChristoffel({ vertices: square }, { mode: "fast" });
    const z: C = [0.3, 0.2];
    const s = m.inverseWithStatus(z);
    expect(Number.isFinite(s.residual)).toBe(true);
    expect(s.residual).toBeGreaterThanOrEqual(0);
    expect(s.converged).toBe(s.residual < 1e-9); // the flag is exactly the residual gate — no magic value
    expect(m.inverse(z)).toEqual(s.w); // same preimage as the plain inverse
  });
});
