import { describe, expect, it } from "vitest";
import type { C } from "../src/vandermondeArnoldi.js";
import { integrateSegment, type SegmentIntegrand } from "../src/scQuadrature.js";

// Exact regular-n-gon integrals  ∫₀¹ (1−tⁿ)^{−2/n} dt = (1/n)·B(1/n, 1−2/n) = the circumradius Rₙ
// with the SC constant set so f′(0)=1 (research-notes §6). Validated to 40 digits with mpmath.
const NGON_R: Record<number, number> = {
  3: 1.7666387502854475,
  4: 1.3110287771460598,
  5: 1.174450160620581,
  6: 1.1129126745223055,
  8: 1.0590783619739317,
  12: 1.0247775749945334,
};

// The regular-n-gon SC integrand in the substituted variable s = 1 − t (singularity moved to s = 0,
// so it is a positive-real left endpoint): G(s) = (1 − (1−s)ⁿ)^{−2/n}, with analytic remainder
// H(s) = [(1 − (1−s)ⁿ)/s]^{−2/n} → n^{−2/n} at s = 0. The other prevertices sⱼ = 1 − ρⱼ (ρⱼ the nth
// roots of unity) crowd toward s = 0 as n grows — the foreign singularities the compound rule must
// subdivide around.
function ngonSpec(n: number): { spec: SegmentIntegrand; foreign: C[] } {
  const e = -2 / n;
  const oneMinusWn = (s: number) => -Math.expm1(n * Math.log1p(-s)); // 1 − (1−s)ⁿ, cancellation-safe
  const full = (t: C): C => [Math.pow(oneMinusWn(t[0]), e), 0];
  const regular = (t: C): C => {
    const s = t[0];
    return [Math.pow(s === 0 ? n : oneMinusWn(s) / s, e), 0];
  };
  const foreign: C[] = [];
  for (let j = 1; j < n; j++) {
    const th = (2 * Math.PI * j) / n;
    foreign.push([1 - Math.cos(th), -Math.sin(th)]);
  }
  return { spec: { full, nearEndpoint: { exponent: e, regular } }, foreign };
}

describe("compound Gauss–Jacobi integrateSegment", () => {
  it("integrates smooth functions on real and complex segments", () => {
    const one: SegmentIntegrand = { full: () => [1, 0] };
    const id: SegmentIntegrand = { full: (t) => [t[0], 0] };
    const i1 = integrateSegment(one, [0, 0], [1, 0], []); // ∫₀¹ 1 dt = 1
    expect(i1[0]).toBeCloseTo(1, 12);
    expect(i1[1]).toBeCloseTo(0, 12);
    const it2 = integrateSegment(id, [0, 0], [1, 0], []); // ∫₀¹ t dt = 1/2
    expect(it2[0]).toBeCloseTo(0.5, 12);
    const ic = integrateSegment(one, [0, 0], [0, 1], []); // ∫_{0→i} 1 dt = i
    expect(ic[0]).toBeCloseTo(0, 12);
    expect(ic[1]).toBeCloseTo(1, 12);
  });

  it("reproduces the regular-n-gon circumradius to ≥10 digits (endpoint singularity)", () => {
    for (const n of [3, 4, 5, 6, 8, 12]) {
      const { spec, foreign } = ngonSpec(n);
      const I = integrateSegment(spec, [0, 0], [1, 0], foreign, { nGaussJacobi: 24, nGaussLegendre: 24 });
      expect(I[0]).toBeCloseTo(NGON_R[n], n <= 6 ? 11 : 10);
      expect(I[1]).toBeCloseTo(0, 11); // the integral is real
    }
  });

  it("compound subdivision earns its keep near a strong foreign singularity", () => {
    const p: C = [0.5, 0.02]; // a (−1/2) branch point only 0.02 off the length-1 segment
    const csqrt = (z: C): C => {
      const r = Math.hypot(z[0], z[1]);
      return [Math.sqrt((r + z[0]) / 2), Math.sign(z[1] || 1) * Math.sqrt((r - z[0]) / 2)];
    };
    const cinvsqrt = (z: C): C => {
      const s = csqrt(z);
      const d = s[0] * s[0] + s[1] * s[1];
      return [s[0] / d, -s[1] / d];
    };
    const full = (t: C): C => cinvsqrt([t[0] - p[0], t[1] - p[1]]);
    // ∫₀¹ (t−p)^{−1/2} dt = 2√(1−p) − 2√(−p) (principal branch; the path stays in the lower half-plane)
    const hi = csqrt([1 - p[0], -p[1]]);
    const lo = csqrt([-p[0], -p[1]]);
    const exact: C = [2 * (hi[0] - lo[0]), 2 * (hi[1] - lo[1])];
    const err = (v: C) => Math.hypot(v[0] - exact[0], v[1] - exact[1]);

    const plain = integrateSegment({ full }, [0, 0], [1, 0], [p], { nGaussLegendre: 12, maxDepth: 0 });
    const compound = integrateSegment({ full }, [0, 0], [1, 0], [p], { nGaussLegendre: 12 });

    expect(err(plain)).toBeGreaterThan(1e-4); // one panel cannot resolve the near-singularity
    expect(err(compound)).toBeLessThan(1e-9); // subdivision does
    expect(err(compound)).toBeLessThan(err(plain));
  });
});
