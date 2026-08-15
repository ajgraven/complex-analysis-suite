import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { findSingularities, countInside, type Region } from "../src/singularities.js";
import { sampleCircle, pointInCircle, pointInPolygon, type Vec2, type Circle } from "../src/contour.js";
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

describe("target w₀ ≠ 0: counting solutions of f(z) = w₀ (§11 D8)", () => {
  it("z² = 1 has the two preimages ±1 (exact); winding about w₀ = 1 is 2", () => {
    const s = findSingularities(parse("z*z"), { cx: 0, cy: 0, halfW: 3, halfH: 3 }, [1, 0]);
    expect(s.exact).toBe(true);
    const xs = s.zeros.map((r) => r.z[0]).sort((a, b) => a - b);
    expect(s.zeros).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(-1, 6);
    expect(xs[1]).toBeCloseTo(1, 6);

    const f = makeComplexFn(parse("z*z"));
    const image: Vec2[] = sampleCircle({ centerRe: 0, centerIm: 0, radius: 1.5 }, 512).map((p) => {
      const w = f([p[0], p[1]], [0, 0]);
      return [w[0], w[1]];
    });
    expect(windingNumber(image, [1, 0])).toBe(2); // winding about w₀ = solutions inside
  });

  it("w₀ = 0 reproduces the classic zeros exactly", () => {
    const region: Region = { cx: 0, cy: 0, halfW: 3, halfH: 3 };
    const dflt = findSingularities(parse("z*z*z - 1"), region);
    const zero = findSingularities(parse("z*z*z - 1"), region, [0, 0]);
    expect(zero.zeros.map((r) => [r.z[0], r.z[1], r.order])).toEqual(
      dflt.zeros.map((r) => [r.z[0], r.z[1], r.order]),
    );
  });

  it("poles are independent of the target", () => {
    const s = findSingularities(parse("z*(z + 1)/(z - 1)"), { cx: 0, cy: 0, halfW: 3, halfH: 3 }, [0.5, 0.3]);
    expect(s.poles).toHaveLength(1);
    expect(s.poles[0].z[0]).toBeCloseTo(1, 6);
    expect(s.poles[0].z[1]).toBeCloseTo(0, 6);
  });

  it("z³ − 1 = −1 collapses to a triple solution at 0; winding about −1 is 3", () => {
    const s = findSingularities(parse("z*z*z - 1"), { cx: 0, cy: 0, halfW: 2, halfH: 2 }, [-1, 0]);
    expect(s.zeros).toHaveLength(1);
    expect(s.zeros[0].order).toBe(3);
    expect(s.zeros[0].z[0]).toBeCloseTo(0, 5);
    const f = makeComplexFn(parse("z*z*z - 1"));
    const image: Vec2[] = sampleCircle({ centerRe: 0, centerIm: 0, radius: 1.5 }, 512).map((p) => {
      const w = f([p[0], p[1]], [0, 0]);
      return [w[0], w[1]];
    });
    expect(windingNumber(image, [-1, 0])).toBe(3);
  });

  it("transcendental target: exp(z) = e has the preimage z = 1 in view (≈)", () => {
    const s = findSingularities(parse("exp(z)"), { cx: 1, cy: 0, halfW: 1.5, halfH: 1.5 }, [Math.E, 0]);
    expect(s.exact).toBe(false);
    expect(s.zeros.some((r) => Math.hypot(r.z[0] - 1, r.z[1]) < 0.05)).toBe(true);
  });
});

/** A densely-sampled square path (side 2h, CCW) — a stand-in for a freehand contour. */
function denseSquare(h: number, perEdge: number): Vec2[] {
  const corners: Vec2[] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const out: Vec2[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

describe("freehand (polygon) contour: the theorem holds for a drawn curve", () => {
  it("a square around z³−1's three roots winds 3 = zeros enclosed", () => {
    const square = denseSquare(1.5, 120);
    const f = makeComplexFn(parse("z*z*z - 1"));
    const image: Vec2[] = square.map((p) => {
      const w = f([p[0], p[1]], [0, 0]);
      return [w[0], w[1]];
    });
    const s = findSingularities(parse("z*z*z - 1"), { cx: 0, cy: 0, halfW: 2.5, halfH: 2.5 });
    const zerosInside = countInside(s.zeros, (p) => pointInPolygon(p, square));
    expect(windingNumber(image)).toBe(3);
    expect(zerosInside).toBe(3);
  });

  it("a small square enclosing only the pole of z+1/z winds −1", () => {
    const square = denseSquare(0.4, 120); // around 0; ±i are outside
    const f = makeComplexFn(parse("z + 1/z"));
    const image: Vec2[] = square.map((p) => {
      const w = f([p[0], p[1]], [0, 0]);
      return [w[0], w[1]];
    });
    const s = findSingularities(parse("z + 1/z"), { cx: 0, cy: 0, halfW: 1, halfH: 1 });
    const inside = (p: Vec2): boolean => pointInPolygon(p, square);
    const nMinusP = countInside(s.zeros, inside) - countInside(s.poles, inside);
    expect(windingNumber(image)).toBe(-1); // one pole at 0, no zeros
    expect(nMinusP).toBe(-1);
  });
});
