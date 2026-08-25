import { describe, it, expect } from "vitest";
import { faberZeros, faberZerosUpTo, toExteriorMap } from "../src/faberZeros.js";
import { diskDomain, ellipseDomain, segmentDomain, polygonDomain } from "../src/potentialDomain.js";
import type { Pt } from "../src/transplant.js";

const byReal = (a: Pt, b: Pt): number => a[0] - b[0];
const maxMod = (zs: readonly Pt[]): number => Math.max(0, ...zs.map((z) => Math.hypot(z[0], z[1])));

describe("Faber map adapter", () => {
  it("hands the domain's Laurent map to @cas/faber (c = capacity, laurent = cₖ)", () => {
    const m = toExteriorMap(segmentDomain(1));
    expect(m.c).toBeCloseTo(0.5, 12);
    expect(m.laurent[1].re).toBeCloseTo(0.5, 12); // c₁ = ½ (Ψ = ½z + ½/z)
  });
});

describe("Faber zeros → equilibrium measure (corner domains)", () => {
  it("the segment [−1,1] gives the Chebyshev nodes cos((2k−1)π/2n) (arcsine μ_K)", () => {
    const seg = segmentDomain(1);
    for (const n of [4, 7, 12]) {
      const { zeros, converged } = faberZeros(seg, n);
      expect(converged).toBe(true);
      expect(zeros.length).toBe(n);
      const got = [...zeros].sort(byReal);
      const want = Array.from({ length: n }, (_, k) => Math.cos(((2 * (n - k) - 1) * Math.PI) / (2 * n)));
      for (let k = 0; k < n; k++) {
        expect(got[k][0]).toBeCloseTo(want[k], 6);
        expect(got[k][1]).toBeCloseTo(0, 6); // zeros are real, on the segment
      }
    }
  });

  it("a polygon's Faber zeros stay finite and spread toward ∂K as n grows", () => {
    const sq: Pt[] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
    const d = polygonDomain("square", "Square", sq);
    const lo = faberZeros(d, 5);
    const hi = faberZeros(d, 16);
    expect(lo.zeros.length).toBe(5);
    expect(hi.zeros.length).toBe(16);
    for (const z of hi.zeros) expect(Number.isFinite(z[0]) && Number.isFinite(z[1])).toBe(true);
    expect(maxMod(hi.zeros)).toBeGreaterThan(maxMod(lo.zeros)); // migrating outward toward the boundary
  });
});

describe("Faber zeros for a SMOOTH boundary do NOT reach μ_K (the honest caveat)", () => {
  it("the disk collapses every Faber zero to the centre", () => {
    const { zeros } = faberZeros(diskDomain(1.3), 10);
    for (const z of zeros) expect(Math.hypot(z[0], z[1])).toBeLessThan(1e-6);
  });

  it("the ellipse puts its Faber zeros on the interior focal segment (real, within ±√(a²−b²))", () => {
    const a = 2;
    const b = 1;
    const f = Math.sqrt(a * a - b * b); // focal half-distance
    const { zeros } = faberZeros(ellipseDomain(a, b), 12);
    for (const z of zeros) {
      expect(Math.abs(z[1])).toBeLessThan(1e-6); // real
      expect(Math.abs(z[0])).toBeLessThan(f + 1e-6); // inside the focal segment, not on ∂K
    }
    // and they genuinely do NOT reach the boundary (|x| ≤ f ≈ 1.73 < a = 2)
    expect(maxMod(zeros)).toBeLessThan(a - 0.2);
  });
});

describe("per-order convergence flags", () => {
  it("returns one entry per order 1…N with honest converged/residual", () => {
    const orders = faberZerosUpTo(segmentDomain(2), 8);
    expect(orders.map((o) => o.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const o of orders) {
      expect(o.zeros.length).toBe(o.n);
      expect(Number.isFinite(o.residual)).toBe(true);
    }
  });
});
