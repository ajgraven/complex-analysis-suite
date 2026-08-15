import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { findSingularities, countInside, type Region } from "../src/singularities.js";
import { sampleCircle, pointInCircle, type Vec2, type Circle } from "../src/contour.js";
import { windingNumber } from "../src/winding.js";

function regionFor(circle: Circle): Region {
  return { cx: circle.centerRe, cy: circle.centerIm, halfW: circle.radius * 1.4, halfH: circle.radius * 1.4 };
}

// The heart of the tool and the Phase-2 gate: for every preset, over a contour chosen not to graze any
// singularity, the winding number of f(γ) about 0 (right-hand side) must equal zeros − poles enclosed
// (left-hand side). Two INDEPENDENT computations — the image curve's winding vs. the located-root count
// — agreeing is the argument principle, and a strong regression guard on the finder.
const CASES: { name: string; expr: string; radius: number; expect: number }[] = [
  { name: "z²/(z²+1)", expr: "z*z/(z*z + 1)", radius: 0.5, expect: 2 }, // double zero at 0; poles ±i outside
  { name: "z³ − 1", expr: "z*z*z - 1", radius: 1.5, expect: 3 }, // three cube roots of unity
  { name: "sin(z)/z", expr: "sin(z)/z", radius: 4.0, expect: 2 }, // zeros at ±π (0 is removable)
  { name: "exp(z) − 1", expr: "exp(z) - 1", radius: 1.5, expect: 1 }, // one zero at 0
  { name: "z + 1/z", expr: "z + 1/z", radius: 1.5, expect: 1 }, // zeros ±i, pole 0: 2 − 1
  { name: "(z−1)²(z+i)", expr: "(z - 1)*(z - 1)*(z + i)", radius: 2.0, expect: 3 }, // double zero 1, zero −i
  { name: "tan(z)", expr: "tan(z)", radius: 1.2, expect: 1 }, // zero at 0; poles ±π/2 outside
  { name: "z(z+1)/(z−1)", expr: "z*(z + 1)/(z - 1)", radius: 1.5, expect: 1 }, // zeros 0,−1; pole 1
];

describe("argument principle: N − P = winding (all presets)", () => {
  for (const c of CASES) {
    it(`${c.name} over |z| = ${c.radius}`, () => {
      const circle: Circle = { centerRe: 0, centerIm: 0, radius: c.radius };
      const f = makeComplexFn(parse(c.expr));
      const image: Vec2[] = sampleCircle(circle, 512).map((p) => {
        const w = f([p[0], p[1]], [0, 0]);
        return [w[0], w[1]];
      });
      const winding = windingNumber(image);

      const s = findSingularities(parse(c.expr), regionFor(circle));
      const inside = (p: Vec2): boolean => pointInCircle(p, circle);
      const nMinusP = countInside(s.zeros, inside) - countInside(s.poles, inside);

      expect(s.differentiable).toBe(true);
      expect(winding).toBe(c.expect); // right-hand side
      expect(nMinusP).toBe(c.expect); // left-hand side — the theorem
    });
  }
});

describe("finder specifics", () => {
  it("z²/(z²+1): double zero at 0, simple poles at ±i (exact/rational)", () => {
    const s = findSingularities(parse("z*z/(z*z + 1)"), { cx: 0, cy: 0, halfW: 3, halfH: 3 });
    expect(s.exact).toBe(true);
    const zeroOrders = s.zeros.map((r) => r.order).sort();
    expect(zeroOrders).toEqual([2]);
    expect(s.zeros[0].z[0]).toBeCloseTo(0, 6);
    expect(s.zeros[0].z[1]).toBeCloseTo(0, 6);
    const poleY = s.poles.map((r) => r.z[1]).sort((a, b) => a - b);
    expect(poleY.length).toBe(2);
    expect(poleY[0]).toBeCloseTo(-1, 4);
    expect(poleY[1]).toBeCloseTo(1, 4);
  });

  it("cancels a removable singularity (z/z has no zero or pole)", () => {
    const s = findSingularities(parse("z/z"), { cx: 0, cy: 0, halfW: 2, halfH: 2 });
    expect(s.zeros).toHaveLength(0);
    expect(s.poles).toHaveLength(0);
  });

  it("z³ − 1 has critical point at 0 (f′ = 3z²)", () => {
    const s = findSingularities(parse("z*z*z - 1"), { cx: 0, cy: 0, halfW: 3, halfH: 3 });
    expect(s.critical.length).toBe(1);
    expect(s.critical[0].z[0]).toBeCloseTo(0, 6);
    expect(s.critical[0].z[1]).toBeCloseTo(0, 6);
  });

  it("a non-holomorphic f (conjugate) reports differentiable: false", () => {
    const s = findSingularities(parse("conjugate(z)"), { cx: 0, cy: 0, halfW: 2, halfH: 2 });
    expect(s.differentiable).toBe(false);
  });
});
