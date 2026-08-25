import { describe, it, expect } from "vitest";
import { lejaPoints, transfiniteDiameter } from "../src/feketePoints.js";
import { diskDomain, segmentDomain, polygonDomain } from "../src/potentialDomain.js";
import type { Pt } from "../src/transplant.js";

const cabs = (p: Pt): number => Math.hypot(p[0], p[1]);

/** Largest wrap-around gap between sorted angles (radians). */
function maxAngularGap(thetas: readonly number[]): number {
  const s = [...thetas].map((t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  let g = s[0] + 2 * Math.PI - s[s.length - 1];
  for (let i = 1; i < s.length; i++) g = Math.max(g, s[i] - s[i - 1]);
  return g;
}

describe("transfinite diameter dₙ", () => {
  it("d₂ is just the distance between the two points", () => {
    expect(transfiniteDiameter([[0, 0], [3, 0]])).toBeCloseTo(3, 12);
    expect(transfiniteDiameter([[1, 1], [1, -1]])).toBeCloseTo(2, 12);
  });
  it("is zero for fewer than two points", () => {
    expect(transfiniteDiameter([])).toBe(0);
    expect(transfiniteDiameter([[1, 2]])).toBe(0);
  });
});

describe("Leja points on the disk (uniform μ_K, dₙ → cap = r)", () => {
  it("lie on ∂K and spread around it (no large void)", () => {
    const r = 1.3;
    const { points, thetas } = lejaPoints(diskDomain(r), 32);
    expect(points.length).toBe(32);
    for (const p of points) expect(cabs(p)).toBeCloseTo(r, 6);
    // Roughly equidistributed: the largest angular gap is a small multiple of the mean gap 2π/n.
    expect(maxAngularGap(thetas)).toBeLessThan(3 * ((2 * Math.PI) / 32));
  });
  it("the transfinite diameter stays above cap and decreases toward it", () => {
    const r = 1.3;
    const d = diskDomain(r);
    const dLo = transfiniteDiameter(lejaPoints(d, 8).points);
    const dHi = transfiniteDiameter(lejaPoints(d, 40).points);
    expect(dLo).toBeGreaterThan(r); // dₙ > cap for finite n
    expect(dHi).toBeGreaterThan(r);
    expect(dHi).toBeLessThan(dLo); // decreasing toward cap
    expect((dHi - r) / r).toBeLessThan((dLo - r) / r); // closer to cap at larger n
  });
});

describe("Leja points on the segment [−1,1] (arcsine, dₙ → cap = ½)", () => {
  it("lie on the segment and reach both endpoints", () => {
    const { points } = lejaPoints(segmentDomain(1), 20);
    for (const p of points) {
      expect(Math.abs(p[1])).toBeLessThan(1e-6); // on the real segment
      expect(Math.abs(p[0])).toBeLessThan(1 + 1e-6);
    }
    expect(Math.max(...points.map((p) => p[0]))).toBeGreaterThan(0.9); // reaches ≈ +1
    expect(Math.min(...points.map((p) => p[0]))).toBeLessThan(-0.9); // reaches ≈ −1
  });
  it("the transfinite diameter decreases toward cap = 0.5", () => {
    const d = segmentDomain(1);
    const dLo = transfiniteDiameter(lejaPoints(d, 8).points);
    const dHi = transfiniteDiameter(lejaPoints(d, 40).points);
    expect(dLo).toBeGreaterThan(0.5);
    expect(dHi).toBeGreaterThan(0.5);
    expect(dHi).toBeLessThan(dLo);
  });
});

describe("Leja points on a polygon", () => {
  it("lie on ∂K and their transfinite diameter approaches the SC capacity", () => {
    const sq: Pt[] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
    const dom = polygonDomain("square", "Square", sq);
    const { points } = lejaPoints(dom, 40);
    expect(points.length).toBe(40);
    const d40 = transfiniteDiameter(points);
    const d8 = transfiniteDiameter(lejaPoints(dom, 8).points);
    expect(d40).toBeGreaterThan(dom.capacity);
    expect(d40).toBeLessThan(d8); // decreasing toward cap(K)
  });
});
