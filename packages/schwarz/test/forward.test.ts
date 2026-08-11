import { describe, expect, it } from "vitest";
import { iterateCurveForward, findCycles, makeUnboundedLaurentSchwarz, pointInPolygon, type Complex, type SchwarzForward } from "../src/index.js";

// Forward σ-dynamics (F4d cycle finder + F4f forward-curve image). Synthetic holomorphic maps with textbook
// cycles pin the finder exactly (σ = w²−1: fixed points at the golden ratios, the 2-cycle {0,−1}); the real
// deltoid engine is a structural smoke (round-trip + period consistency).

const near = (a: Complex, b: Complex, p = 4): boolean => Math.abs(a[0] - b[0]) < 10 ** -p && Math.abs(a[1] - b[1]) < 10 ** -p;
const inDisk = (R: number) => (w: Complex): boolean => Math.hypot(w[0], w[1]) < R;

/** σ(w) = w² − 1 — holomorphic; fixed points (1±√5)/2, a super-attracting 2-cycle {0, −1}. */
const SQ: SchwarzForward = {
  sigma: (w) => [w[0] * w[0] - w[1] * w[1] - 1, 2 * w[0] * w[1]],
  isInOmega: inDisk(3),
};

describe("iterateCurveForward (F4f)", () => {
  it("returns k+1 steps: the original polyline, then σ(pts), σ²(pts), …", () => {
    const half: SchwarzForward = { sigma: (w) => [w[0] / 2, w[1] / 2], isInOmega: inDisk(10) };
    const out = iterateCurveForward([[2, 0], [0, 2]], half, 3);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual([[2, 0], [0, 2]]); // step 0 is the original
    expect(near(out[1][0], [1, 0])).toBe(true); // σ halves
    expect(near(out[2][0], [0.5, 0])).toBe(true); // σ² quarters
  });

  it("drops a vertex once it leaves Ω, and pads the tail with empty steps", () => {
    // Translate +2 in Re each step; Ω = Re < 3. From (0,0): (2,0) then (4,0) which is out ⇒ empties.
    const shift: SchwarzForward = { sigma: (w) => [w[0] + 2, w[1]], isInOmega: (w) => w[0] < 3 };
    const out = iterateCurveForward([[0, 0]], shift, 3);
    expect(out).toHaveLength(4); // always k+1
    expect(near(out[2][0], [4, 0])).toBe(true);
    expect(out[3]).toEqual([]); // (4,0) is out of Ω ⇒ nothing survives the last step
  });

  it("an empty polyline yields a single empty step", () => {
    expect(iterateCurveForward([], SQ, 4)).toEqual([[]]);
  });
});

describe("findCycles (F4d) — synthetic w² − 1", () => {
  it("period 1: finds both fixed points, the golden ratios (1 ± √5)/2", () => {
    const cycles = findCycles(SQ, 1, { bbox: [-3, 3, -3, 3], gridSize: 20 });
    const fixed = cycles.filter((c) => c.period === 1).map((c) => c.points[0]);
    const g1 = (1 + Math.sqrt(5)) / 2, g2 = (1 - Math.sqrt(5)) / 2;
    expect(fixed.some((w) => near(w, [g1, 0], 4))).toBe(true);
    expect(fixed.some((w) => near(w, [g2, 0], 4))).toBe(true);
  });

  it("period 2: finds the super-attracting 2-cycle {0, −1} (period correctly reported as 2)", () => {
    const cycles = findCycles(SQ, 2, { bbox: [-3, 3, -3, 3], gridSize: 20 });
    const two = cycles.filter((c) => c.period === 2);
    expect(two.length).toBeGreaterThanOrEqual(1);
    // Some period-2 cycle is exactly {0, −1} as a set.
    const isZeroMinusOne = (c: { points: Complex[] }): boolean =>
      c.points.length === 2 &&
      c.points.some((w) => near(w, [0, 0])) &&
      c.points.some((w) => near(w, [-1, 0]));
    expect(two.some(isZeroMinusOne)).toBe(true);
  });

  it("a constant map σ ≡ c has its fixed point at c", () => {
    const c: Complex = [0.4, -0.2];
    const constMap: SchwarzForward = { sigma: () => [c[0], c[1]], isInOmega: inDisk(3) };
    const cycles = findCycles(constMap, 1, { bbox: [-2, 2, -2, 2], gridSize: 6 });
    expect(cycles.some((cy) => cy.period === 1 && near(cy.points[0], c))).toBe(true);
  });
});

describe("findCycles (F4d) — the deltoid engine (structural smoke)", () => {
  const DELTOID = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);
  // Deltoid boundary polygon (sampled), for the Ω test (Ω = outside the boundary for the unbounded family).
  const poly: Complex[] = [];
  for (let k = 0; k < 240; k++) {
    const th = (2 * Math.PI * k) / 240;
    poly.push(DELTOID.evalPhi([Math.cos(th), Math.sin(th)]));
  }
  const surface: SchwarzForward = { sigma: (w) => DELTOID.sigma(w), isInOmega: (w) => !pointInPolygon(w, poly) };

  it("every reported cycle round-trips (σ^period ≈ start) with consistent period", () => {
    const cycles = findCycles(surface, 2, { bbox: [-3, 3, -3, 3], gridSize: 16 });
    for (const c of cycles) {
      expect(c.points).toHaveLength(c.period);
      // Iterating σ `period` times from the first point returns to it.
      let cur: Complex | null = c.points[0];
      for (let i = 0; i < c.period && cur; i++) cur = surface.sigma(cur);
      expect(cur && near(cur, c.points[0], 3)).toBe(true);
      for (const p of c.points) expect(surface.isInOmega(p)).toBe(true);
    }
  });
});
