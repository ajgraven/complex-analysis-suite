// The M3 corner-overshoot profile compute (the pure half of the before/after demo). The draw half is DOM
// and covered by the browser check.
import { describe, expect, it } from "vitest";
import { computeCornerProfile } from "../src/render/cornerProfile.js";
import { regularPolygonCornerImages, regularPolygonMap } from "../src/polygon.js";

describe("computeCornerProfile", () => {
  const map = regularPolygonMap(4, 200);
  const w = regularPolygonCornerImages(4);
  const n = 40;

  it("samples |Fₙ| along ∂K with an overshoot above the smooth-arc floor, no Q when m is null", () => {
    const p = computeCornerProfile(map, w, n, null, 1.5, 200);
    expect(p.absQ).toBeNull();
    expect(p.peakQ).toBeNull();
    expect(p.t[0]).toBe(0);
    expect(p.t[p.t.length - 1]).toBeCloseTo(1, 12);
    expect(p.absF.length).toBe(201);
    expect(p.peakF).toBeGreaterThan(1.1); // corner overshoot (→ λ = 3/2)
    expect(p.maxLambda).toBe(1.5);
    expect(p.n).toBe(40);
  });

  it("overlays |Q_{n,m}| with a lower peak when m is given (suppression visible)", () => {
    const p = computeCornerProfile(map, w, n, 8, 1.5, 200);
    expect(p.absQ).not.toBeNull();
    expect(p.absQ?.length).toBe(201);
    expect(p.peakQ).not.toBeNull();
    expect(p.peakQ as number).toBeLessThan(p.peakF); // Q_{n,8} flattens the overshoot
    expect(p.m).toBe(8);
  });

  it("omits Q when there are no corner images even if m is given", () => {
    const p = computeCornerProfile(map, [], n, 8, 1.5, 64);
    expect(p.absQ).toBeNull();
  });
});
