import { describe, expect, it } from "vitest";
import { DELTOID, deltoidBoundary, escapeTime, pointInPolygon, type Complex } from "../src/deltoid.js";
import { glue } from "../src/mating/glue.js";
import { fundamentalEdges, IDEAL_VERTICES, tessellate } from "../src/models/idealTriangleGroup.js";

const near = (a: Complex, b: Complex, p = 7): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};
const CUSPS: Complex[] = IDEAL_VERTICES.map((v) => [1.5 * v[0], 1.5 * v[1]]);
const BOUND = deltoidBoundary(256);
const isInOmega = (w: Complex): boolean => !pointInPolygon(w, BOUND);
const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

describe("mating glue Ψ = φ∘η : group side → σ-plane", () => {
  it("maps the ideal vertices exactly to the three cusps 1.5·{1, ω, ω²}", () => {
    for (let k = 0; k < 3; k++) near(glue(IDEAL_VERTICES[k]), CUSPS[k], 9);
  });

  it("maps fundamental edge k to a curve from cusp k to cusp k+1 that lies in Ω", () => {
    const edges = fundamentalEdges(24);
    for (let k = 0; k < 3; k++) {
      const g = edges[k].map(glue);
      near(g[0], CUSPS[k], 7);
      near(g[g.length - 1], CUSPS[(k + 1) % 3], 7);
      for (let i = 3; i < g.length - 3; i++) expect(isInOmega(g[i])).toBe(true); // bulges into the exterior
    }
  });

  it("deeper group tiles map closer to the deltoid boundary ∂K — the mating anchor", () => {
    const tiles = tessellate(5).filter((t) => t.depth >= 1);
    const distTo = (w: Complex): number => {
      let m = Infinity;
      for (const p of BOUND) m = Math.min(m, Math.hypot(w[0] - p[0], w[1] - p[1]));
      return m;
    };
    const dists: number[][] = Array.from({ length: 6 }, () => []);
    const gens: number[][] = Array.from({ length: 6 }, () => []);
    for (const t of tiles) {
      const w = glue(t.rep);
      dists[t.depth].push(distTo(w));
      gens[t.depth].push(escapeTime(DELTOID, isInOmega, w, { maxIter: 80, escapeR: 40 }).n);
    }
    const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    const dmeans = [1, 2, 3, 4, 5].map((d) => +mean(dists[d]).toFixed(3));
    const gmeds = [1, 2, 3, 4, 5].map((d) => median(gens[d]));
    // eslint-disable-next-line no-console
    console.log("MATING", JSON.stringify({ dmeans, gmeds }));
    // The group orbit of 0 accumulates on ∂𝔻, and Ψ(∂𝔻) = ∂K, so deeper tiles land nearer the boundary.
    for (let i = 1; i < dmeans.length; i++) expect(dmeans[i]).toBeLessThan(dmeans[i - 1]);
  });
});
