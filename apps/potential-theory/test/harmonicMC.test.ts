import { describe, it, expect } from "vitest";
import {
  mulberry32,
  distToPolyline,
  samplePoissonOffset,
  mcGeometry,
  walkOnce,
  runBatch,
  uniformThetaCV,
  type Hit,
} from "../src/harmonicMC.js";
import { diskDomain, segmentDomain, deltoidDomain, equilibriumDots } from "../src/potentialDomain.js";

// PT-6c — the walk-on-spheres harmonic-measure Monte Carlo, validated against the exact μ_K: uniform on
// the disk, arcsine (tip-crowding) on the segment, cusp-concentration on the deltoid.

describe("mulberry32", () => {
  it("is deterministic and stays in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("distToPolyline", () => {
  const sq: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  it("finds the nearest boundary point + segment of a square", () => {
    const near = distToPolyline([2, 0], sq); // nearest point is (1,0) on the right edge (segment 1)
    expect(near.dist).toBeCloseTo(1, 9);
    expect(near.point[0]).toBeCloseTo(1, 9);
    expect(near.point[1]).toBeCloseTo(0, 9);
    expect(near.index).toBe(1);
  });
});

describe("samplePoissonOffset", () => {
  it("stays in (−π, π] and concentrates near 0 as r → R", () => {
    const rng = mulberry32(7);
    let maxNear = 0;
    for (let i = 0; i < 200; i++) {
      const d = samplePoissonOffset(1.001, 1, rng); // η ≈ 1 ⇒ tiny offsets
      expect(Math.abs(d)).toBeLessThanOrEqual(Math.PI + 1e-9);
      maxNear = Math.max(maxNear, Math.abs(d));
    }
    expect(maxNear).toBeLessThan(0.2); // just outside ⇒ returns near the same angle
  });
});

const meanAbs = (hits: readonly Hit[], axis: 0 | 1): number =>
  hits.reduce((s, h) => s + Math.abs(h.point[axis]), 0) / Math.max(1, hits.length);

describe("walkOnce — the disk (uniform μ_K)", () => {
  it("lands on ∂K and is ~uniform in angle", () => {
    const boundary = equilibriumDots(diskDomain(1), 240);
    const g = mcGeometry(boundary);
    const rng = mulberry32(123);
    const hits: Hit[] = [];
    runBatch(g, 4000, rng, hits);
    expect(hits.length).toBeGreaterThan(3900); // almost all reach ∂K
    for (const h of hits) expect(Math.hypot(h.point[0], h.point[1])).toBeCloseTo(1, 1); // on |z| = 1
    // Bin by angle into 8 sectors — each should hold ~1/8 of the hits (uniform).
    const oct = new Array<number>(8).fill(0);
    for (const h of hits) oct[Math.floor(((Math.atan2(h.point[1], h.point[0]) + Math.PI) / (2 * Math.PI)) * 8) % 8]++;
    const exp = hits.length / 8;
    for (const c of oct) expect(Math.abs(c - exp) / exp).toBeLessThan(0.2);
  });
});

describe("walkOnce — the segment [−1,1] (arcsine μ_K)", () => {
  it("crowds at the tips: mean|x| approaches the arcsine 2/π, well above the uniform ½", () => {
    const boundary = equilibriumDots(segmentDomain(1), 240);
    const g = mcGeometry(boundary);
    const rng = mulberry32(2024);
    const hits: Hit[] = [];
    runBatch(g, 4000, rng, hits);
    for (const h of hits) expect(Math.abs(h.point[1])).toBeLessThan(0.02); // on the x-axis
    expect(meanAbs(hits, 0)).toBeGreaterThan(0.56); // arcsine E|x| = 2/π ≈ 0.637 ≫ uniform 0.5
  });
});

describe("walkOnce — the deltoid (cusp concentration)", () => {
  it("puts more hits near the 3 cusps than a uniform boundary law would", () => {
    const boundary = equilibriumDots(deltoidDomain(), 300);
    const g = mcGeometry(boundary);
    const rng = mulberry32(99);
    const hits: Hit[] = [];
    runBatch(g, 4000, rng, hits);
    // The deltoid Ψ(w)=w+½w⁻² has cusps at w = 1, e^{±2πi/3}; the max |Ψ| (the outward cusp tips) is 1.5.
    const nearCusp = hits.filter((h) => Math.hypot(h.point[0], h.point[1]) > 1.35).length;
    expect(nearCusp / hits.length).toBeGreaterThan(0.12); // clear cusp crowding
  });
});

describe("uniformThetaCV", () => {
  it("→ small for uniform-in-θ counts, large for a spike", () => {
    const flat = new Array<number>(240).fill(50);
    expect(uniformThetaCV(flat, 36)).toBeCloseTo(0, 6);
    const spike = new Array<number>(240).fill(0);
    spike[0] = 1000;
    expect(uniformThetaCV(spike, 36)).toBeGreaterThan(2);
  });
  it("reads small on a real disk run (harmonic measure = equilibrium measure)", () => {
    const g = mcGeometry(equilibriumDots(diskDomain(1), 240));
    const rng = mulberry32(555);
    const counts = new Array<number>(240).fill(0);
    for (let i = 0; i < 8000; i++) {
      const h = walkOnce(g, rng);
      if (h) counts[h.index]++;
    }
    expect(uniformThetaCV(counts, 36)).toBeLessThan(0.2);
  });
});
