import { describe, expect, it } from "vitest";
import { planeToSphere, sphereToPlane } from "../src/index.js";

// Golden corpus for stereographic projection C∪{∞} ↔ the unit Riemann sphere (@cas/core's sphere
// leaf). Consolidates the two apps' hand-rolled projections — CD render/sphereView.ts and QD
// app/sphere/sphere-common.mjs — whose forward maps were identical; the inverse is QD's
// cancellation-safe form (shared-consolidation survey, Tier-1 B).

const near = (a: number, b: number, tol = 1e-10) => Math.abs(a - b) < tol;
const isUnit = (p: [number, number, number]) => near(Math.hypot(p[0], p[1], p[2]), 1, 1e-12);

describe("@cas/core stereographic projection", () => {
  it("landmark points (north-pole convention)", () => {
    // w = 0 → south pole (0,0,−1)
    const s = planeToSphere(0, 0);
    expect(near(s[0], 0) && near(s[1], 0) && near(s[2], -1)).toBe(true);
    // |w| = 1 → equator (z = 0)
    expect(near(planeToSphere(1, 0)[2], 0)).toBe(true);
    expect(near(planeToSphere(0, 1)[2], 0)).toBe(true);
    // every image is a unit vector, across magnitudes
    for (const [u, v] of [[0.3, -0.7], [2, 5], [1e3, -4e2]] as const) {
      expect(isUnit(planeToSphere(u, v))).toBe(true);
    }
  });

  it("|w| → ∞ (non-finite input) maps to the north pole, not NaN", () => {
    // Without the finiteness guard, r² = ∞ makes every component ∞/∞ = NaN, breaking the documented
    // "|w| → ∞ → north pole" invariant. Unreachable via current callers, but kept total.
    for (const p of [
      planeToSphere(Infinity, 0),
      planeToSphere(0, -Infinity),
      planeToSphere(Infinity, Infinity),
      planeToSphere(1e200, 1e200), // r² overflows to Infinity even from finite inputs
    ]) {
      expect(p).toEqual([0, 0, 1]);
    }
  });

  it("round-trips w → sphere → w across magnitudes (both hemisphere branches)", () => {
    let maxErr = 0;
    for (const u of [-100, -3, -1, -0.4, 0, 0.25, 1, 5, 250]) {
      for (const v of [-40, -1, 0, 0.5, 2, 80]) {
        const p = planeToSphere(u, v);
        const w = sphereToPlane(p[0], p[1], p[2]);
        expect(w).not.toBeNull();
        maxErr = Math.max(maxErr, Math.abs(w![0] - u), Math.abs(w![1] - v));
      }
    }
    expect(maxErr).toBeLessThan(1e-8);
  });

  it("returns null at / near the north pole (w = ∞)", () => {
    expect(sphereToPlane(0, 0, 1)).toBeNull();
    expect(sphereToPlane(1e-6, 0, 1 - 1e-12, 1e-9)).toBeNull();
  });

  it("inverse is cancellation-safe for large |w| (z → 1, the northern branch)", () => {
    // A huge w lands ~2/r² from the north pole. The naive x/(1−z) subtracts two nearly-equal numbers
    // and loses most of its digits; the algebraically-equivalent robust form recovers w to near
    // machine accuracy. Pass a tiny eps so this near-pole point is not treated as ∞ (w = 1e6 is only
    // ~1.6e-12 from N, well inside the default eps — which the null-at-pole test above relies on).
    const u = 1e6;
    const v = -5e5;
    const p = planeToSphere(u, v);
    expect(p[2]).toBeGreaterThan(0); // northern hemisphere → the robust branch
    const w = sphereToPlane(p[0], p[1], p[2], 1e-300);
    expect(w).not.toBeNull();
    const robustErr = Math.hypot(w![0] - u, w![1] - v) / Math.hypot(u, v);
    // The naive formula, computed inline, is materially worse right here (catastrophic cancellation).
    const naive = [p[0] / (1 - p[2]), p[1] / (1 - p[2])];
    const naiveErr = Math.hypot(naive[0] - u, naive[1] - v) / Math.hypot(u, v);
    expect(robustErr).toBeLessThan(1e-9); // robust: near machine accuracy
    expect(naiveErr).toBeGreaterThan(1e3 * robustErr); // naive: many orders worse
  });
});
