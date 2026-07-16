// Routing detectors (extracted from algebra-ui to prove-plan.mjs so they're unit-testable): they decide
// which prove ROUTE the raw h-data takes. These lock the ACCEPT and REJECT boundaries — a false-null would
// silently downgrade a valid QD to the (●)/(★) tree lower bound (the review flagged them as untested).
import { describe, it, expect } from "vitest";
import * as PROVE from "../app/algebra/prove-plan.mjs";

const pole = (are: number, aim: number, principal: Array<{ re: number; im: number }>) => ({ a: { re: are, im: aim }, principal });
const W = 0.8660254037844386; // √3/2 — cube-root-of-unity imaginary part

describe("pointFunctionalMoments — single-node point-functional detector (C1)", () => {
  it("accepts one order-≥1 node with real positive M₀; returns moments + order + node", () => {
    const r: any = PROVE.pointFunctionalMoments({ poles: [pole(0, 0, [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }])] });
    expect(r).not.toBeNull();
    expect(r.order).toBe(2);
    expect(r.moments.M0).toBeCloseTo(1.5);
    expect(r.moments.M1).toEqual({ re: 0.5, im: 0 });
    expect(r.node).toEqual({ re: 0, im: 0 });
  });
  it("rejects: not exactly one pole, empty principal, complex M₀, non-positive M₀", () => {
    expect(PROVE.pointFunctionalMoments({ poles: [] })).toBeNull();
    expect(PROVE.pointFunctionalMoments({ poles: [pole(0, 0, [{ re: 1, im: 0 }]), pole(1, 0, [{ re: 1, im: 0 }])] })).toBeNull();
    expect(PROVE.pointFunctionalMoments({ poles: [pole(0, 0, [])] })).toBeNull();
    expect(PROVE.pointFunctionalMoments({ poles: [pole(0, 0, [{ re: 1, im: 0.5 }])] })).toBeNull();   // M₀ not real
    expect(PROVE.pointFunctionalMoments({ poles: [pole(0, 0, [{ re: -1, im: 0 }])] })).toBeNull();    // M₀ ≤ 0
    expect(PROVE.pointFunctionalMoments({})).toBeNull();
  });
});

describe("multiNodeRationalData — 2-node rational detector (C2)", () => {
  it("accepts 2 order-1 real nodes with real weights", () => {
    const r: any = PROVE.multiNodeRationalData({ poles: [pole(1, 0, [{ re: 1.5, im: 0 }]), pole(-1, 0, [{ re: 1.5, im: 0 }])] });
    expect(r).not.toBeNull();
    expect(r.nodes).toEqual([{ re: 1, im: 0 }, { re: -1, im: 0 }]);
    expect(r.weights).toEqual([{ re: 1.5, im: 0 }, { re: 1.5, im: 0 }]);
  });
  it("rejects: wrong pole count, order-≥2 pole, complex node/weight, coincident nodes", () => {
    expect(PROVE.multiNodeRationalData({ poles: [pole(1, 0, [{ re: 1, im: 0 }])] })).toBeNull();                       // 1 pole
    expect(PROVE.multiNodeRationalData({ poles: [pole(1, 0, [{ re: 1, im: 0 }, { re: 1, im: 0 }]), pole(-1, 0, [{ re: 1, im: 0 }])] })).toBeNull(); // order 2
    expect(PROVE.multiNodeRationalData({ poles: [pole(0, 1, [{ re: 1, im: 0 }]), pole(0, -1, [{ re: 1, im: 0 }])] })).toBeNull();   // off-axis node
    expect(PROVE.multiNodeRationalData({ poles: [pole(1, 0, [{ re: 1, im: 0.5 }]), pole(-1, 0, [{ re: 1, im: 0 }])] })).toBeNull(); // complex weight
    expect(PROVE.multiNodeRationalData({ poles: [pole(1, 0, [{ re: 1, im: 0 }]), pole(1, 0, [{ re: 1, im: 0 }])] })).toBeNull();    // coincident
  });
});

describe("multiNodeTriangleData — 3-node equilateral detector (C3)", () => {
  const cube = { poles: [pole(1, 0, [{ re: 1, im: 0 }]), pole(-0.5, W, [{ re: 1, im: 0 }]), pole(-0.5, -W, [{ re: 1, im: 0 }])] };
  it("accepts 3 equal-magnitude, centroid-0, equal-real-weight nodes (cube roots of unity)", () => {
    const r: any = PROVE.multiNodeTriangleData(cube);
    expect(r).not.toBeNull();
    expect(r.nodes.length).toBe(3);
    expect(r.weights.every((w: any) => w.re === 1 && w.im === 0)).toBe(true);
  });
  it("rejects: wrong pole count, order-≥2, complex weight, unequal magnitude, off-centre, unequal weights", () => {
    expect(PROVE.multiNodeTriangleData({ poles: [pole(1, 0, [{ re: 1, im: 0 }]), pole(-1, 0, [{ re: 1, im: 0 }])] })).toBeNull(); // 2 poles
    expect(PROVE.multiNodeTriangleData({ poles: [pole(1, 0, [{ re: 1, im: 0 }, { re: 1, im: 0 }]), pole(-0.5, W, [{ re: 1, im: 0 }]), pole(-0.5, -W, [{ re: 1, im: 0 }])] })).toBeNull(); // order 2
    expect(PROVE.multiNodeTriangleData({ poles: [pole(1, 0, [{ re: 1, im: 0.5 }]), pole(-0.5, W, [{ re: 1, im: 0 }]), pole(-0.5, -W, [{ re: 1, im: 0 }])] })).toBeNull(); // complex weight
    expect(PROVE.multiNodeTriangleData({ poles: [pole(2, 0, [{ re: 1, im: 0 }]), pole(-0.5, W, [{ re: 1, im: 0 }]), pole(-0.5, -W, [{ re: 1, im: 0 }])] })).toBeNull(); // unequal magnitude
    expect(PROVE.multiNodeTriangleData({ poles: [pole(1.5, 0, [{ re: 1, im: 0 }]), pole(0, W, [{ re: 1, im: 0 }]), pole(0, -W, [{ re: 1, im: 0 }])] })).toBeNull(); // off-centre (centroid ≠ 0)
    expect(PROVE.multiNodeTriangleData({ poles: [pole(1, 0, [{ re: 1, im: 0 }]), pole(-0.5, W, [{ re: 2, im: 0 }]), pole(-0.5, -W, [{ re: 1, im: 0 }])] })).toBeNull(); // unequal weights
  });
});
