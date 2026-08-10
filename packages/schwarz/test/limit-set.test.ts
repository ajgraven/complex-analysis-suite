import { describe, expect, it } from "vitest";
import {
  makeUnboundedLaurentSchwarz,
  pointInPolygon,
  sampleLimitSet,
  boxCountingDimension,
  type Complex,
} from "../src/index.js";

// The σ limit set (F4a): the chaos game on σ⁻¹ + its box-counting dimension. Two independent pins —
//   1. boxCountingDimension on SYNTHETIC sets with a known dimension (a line → 1, a filled square → 2),
//      on a coarse (unsaturated) ε ladder, deterministically pins the log-log regression math.
//   2. sampleLimitSet on the deltoid (seeded PRNG) reproduces the QD-app golden's robust invariants —
//      ≥ most points collected, finite/bounded coords, a finite box-dimension in a broad range.

// A seeded LCG (the QD test's rng) so the chaos game is reproducible.
function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0x100000000;
  };
}

const DELTOID = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);
const deltoidBoundary = (): Complex[] => {
  const pts: Complex[] = [];
  for (let k = 0; k < 512; k++) {
    const t = (2 * Math.PI * k) / 512;
    pts.push(DELTOID.evalPhi([Math.cos(t), Math.sin(t)]));
  }
  return pts;
};
const bboxOf = (poly: Complex[]): [number, number, number, number] => {
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const p of poly) {
    mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]);
    mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]);
  }
  return [mnx, mxx, mny, mxy];
};

describe("@cas/schwarz boxCountingDimension (F4a — log-log slope)", () => {
  // Coarse ε ladder (0.125 … 0.015625): above the point spacing of the synthetic sets below, so every scale
  // is UNSATURATED and the slope is the true dimension.
  const COARSE = [0.125, 0.0625, 0.03125, 0.015625];

  it("a dense line segment has dimension 1", () => {
    const line: Complex[] = [];
    for (let i = 0; i < 4000; i++) line.push([i / 4000, 0]);
    const r = boxCountingDimension(line, { boxSizes: COARSE });
    expect(r.counts).toEqual([8, 16, 32, 64]); // N(ε) doubles as ε halves — slope −1
    expect(r.dim).toBeCloseTo(1, 6);
  });

  it("a filled square has dimension 2", () => {
    const sq: Complex[] = [];
    for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) sq.push([i / 64, j / 64]);
    const r = boxCountingDimension(sq, { boxSizes: COARSE });
    expect(r.counts).toEqual([64, 256, 1024, 4096]); // N(ε) ×4 as ε halves — slope −2
    expect(r.dim).toBeCloseTo(2, 6);
  });

  it("accepts the interleaved Float64Array form identically to the tuple form", () => {
    const tuples: Complex[] = [[0, 0], [0.25, 0], [0.5, 0], [0.75, 0]];
    const flat = new Float64Array([0, 0, 0.25, 0, 0.5, 0, 0.75, 0]);
    const a = boxCountingDimension(tuples, { boxSizes: COARSE });
    const b = boxCountingDimension(flat, { boxSizes: COARSE });
    expect(b.counts).toEqual(a.counts);
    expect(b.dim).toBe(a.dim);
  });

  it("returns NaN dim (not a throw) when there are too few usable scales", () => {
    const single: Complex[] = [[0.3, 0.7]]; // one point ⇒ every scale has 1 occupied cell ⇒ < 2 valid scales
    const r = boxCountingDimension(single, { boxSizes: COARSE });
    expect(Number.isNaN(r.dim)).toBe(true);
    expect(boxCountingDimension([], { boxSizes: COARSE }).dim).toBeNaN();
  });
});

describe("@cas/schwarz sampleLimitSet (F4a — chaos game on σ⁻¹, deltoid)", () => {
  const poly = deltoidBoundary();
  const isInOmega = (w: Complex): boolean => !pointInPolygon(w, poly);
  const bbox = bboxOf(poly);

  it("collects (almost) all requested points, finite + bounded (mirrors the QD S3 golden)", () => {
    const cloud = sampleLimitSet(DELTOID, { n: 2000, burnIn: 50, rng: makeRng(0x9e3779b9), isInOmega, bbox });
    expect(cloud.length).toBeGreaterThanOrEqual(2 * 1500); // ≥ 1500 of 2000 (QD's threshold)
    for (let i = 0; i < cloud.length; i++) {
      expect(Number.isFinite(cloud[i])).toBe(true);
      expect(Math.abs(cloud[i])).toBeLessThan(5); // the deltoid limit set is compact, well inside |w| < 5
    }
  });

  it("is reproducible: the same seed yields the identical cloud", () => {
    const a = sampleLimitSet(DELTOID, { n: 300, burnIn: 20, rng: makeRng(12345), isInOmega, bbox });
    const b = sampleLimitSet(DELTOID, { n: 300, burnIn: 20, rng: makeRng(12345), isInOmega, bbox });
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("its box-counting dimension is finite, in a plausible range, with ≥ 4 valid scales (QD S3 golden)", () => {
    const cloud = sampleLimitSet(DELTOID, { n: 2000, burnIn: 50, rng: makeRng(0x1234567), isInOmega, bbox });
    const r = boxCountingDimension(cloud);
    expect(Number.isFinite(r.dim)).toBe(true);
    expect(r.dim).toBeGreaterThanOrEqual(-0.05); // QD's loose bounds — the estimate is rough (sample-density biased)
    expect(r.dim).toBeLessThanOrEqual(2.5);
    expect(r.counts.filter((c) => c >= 2).length).toBeGreaterThanOrEqual(4);
  });

  it("n = 0 returns an empty cloud (no walk)", () => {
    expect(sampleLimitSet(DELTOID, { n: 0, isInOmega, bbox }).length).toBe(0);
  });
});
