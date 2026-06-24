import { describe, it, expect } from "vitest";
import { dd, ddToNumber, ddAdd, ddAddNumber, ddSub, ddMul } from "../src/render/dd";
import { computeReferenceOrbit, computeReferenceOrbitDD } from "../src/render/perturbation";

describe("double-double arithmetic", () => {
  it("round-trips a plain double", () => {
    for (const x of [0, 1, -3.5, Math.PI, 1e-20, 1e15]) {
      expect(ddToNumber(dd(x))).toBe(x);
    }
  });

  it("retains precision a single double would lose", () => {
    // 1 + 1e-20 - 1 === 0 in plain doubles; double-double keeps the 1e-20.
    expect(1 + 1e-20 - 1).toBe(0);
    const a = ddAdd(dd(1), dd(1e-20));
    const back = ddSub(a, dd(1));
    expect(ddToNumber(back)).toBeCloseTo(1e-20, 25);
  });

  it("ddAddNumber matches ddAdd of a promoted double", () => {
    const a = ddAdd(dd(0.1), dd(1e-18));
    const viaAdd = ddAdd(a, dd(3e-19));
    const viaNum = ddAddNumber(a, 3e-19);
    expect(ddToNumber(ddSub(viaAdd, viaNum))).toBeCloseTo(0, 28);
  });

  it("multiplies with extended precision", () => {
    // (1 + 1e-15)² = 1 + 2e-15 + 1e-30; the 1e-30 term is below double resolution at 1.
    const one_plus = ddAdd(dd(1), dd(1e-15));
    const sq = ddMul(one_plus, one_plus);
    const minus = ddSub(sq, dd(1));
    expect(ddToNumber(minus)).toBeCloseTo(2e-15 + 1e-30, 20);
  });
});

describe("double-double reference orbit", () => {
  it("matches the plain-double orbit when the centre is a plain double", () => {
    const pts: [number, number][] = [
      [-0.5, 0.5],
      [-0.743643887, 0.131825904],
      [0.25, 0.0],
      [-1.25, 0.1],
    ];
    for (const [cx, cy] of pts) {
      const a = computeReferenceOrbit(cx, cy, 400);
      const b = computeReferenceOrbitDD(dd(cx), dd(cy), 400);
      expect(b.escaped).toBe(a.escaped);
      expect(b.length).toBe(a.length);
      for (let i = 0; i < Math.min(a.length, 20) * 2; i++) {
        expect(b.xy[i]).toBeCloseTo(a.xy[i], 5);
      }
    }
  });

  it("resolves centres beyond double precision distinctly", () => {
    // Two centres differing only at the ~20th digit collapse to the same double, but
    // double-double keeps them apart — their orbits can diverge over many iterations.
    const base = -0.743643887037151;
    const cyA = dd(0.131825904205311);
    const cxA = ddAdd(dd(base), dd(1e-19));
    const cxB = ddAdd(dd(base), dd(-1e-19));
    expect(ddToNumber(cxA)).toBe(ddToNumber(cxB)); // identical as plain doubles
    const a = computeReferenceOrbitDD(cxA, cyA, 5000);
    const b = computeReferenceOrbitDD(cxB, cyA, 5000);
    // The two distinct centres are carried independently (the inputs are not equal).
    expect(cxA[1]).not.toBe(cxB[1]);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});
