/**
 * Tier-1 (analytic / orbit-based) Julia-set properties. Oracles use known parameters of z²+c:
 * c=0 (unit disk: area π, dimension 1, superattracting), c=−1 (basilica, period-2), c=−0.5 (an
 * attracting fixed point in the cardioid), c=2 (escapes → Cantor, area 0). Also checks the monic
 * gating: an arbitrary / non-holomorphic f returns null for the capacity-based rows.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "../src/expr/parser";
import {
  analyticAreaUpperBound,
  boundingRadius,
  boxCountDimension,
  computeJuliaProperties,
  countInterior,
  interiorMask,
} from "../src/render/juliaProperties";

const F2 = parse("z^2+c");
const ESC = parse("abs(z)>2");
const O: Complex = [0, 0];
const props = (degree: number | null, c: Complex, fAst = F2) =>
  computeJuliaProperties({ degree, c, fAst, escAst: ESC, criticalPoint: O, a: [0, 0] });

describe("boundingRadius (escape radius of z^d+c)", () => {
  it("d=2 closed form", () => {
    expect(boundingRadius(2, [0, 0])).toBeCloseTo(1, 12); // unit disk
    expect(boundingRadius(2, [2, 0])).toBeCloseTo(2, 12); // (1+√9)/2
    expect(boundingRadius(2, [0, 0.75])).toBeCloseTo((1 + Math.sqrt(1 + 3)) / 2, 12);
  });
  it("d=3 Newton root of R³ − R − |c| = 0", () => {
    const R = boundingRadius(3, [1.5, 0]);
    expect(Math.abs(R ** 3 - R - 1.5)).toBeLessThan(1e-9);
    expect(R).toBeGreaterThan(1);
  });
});

describe("analyticAreaUpperBound", () => {
  it("c=0 gives π (the unit disk: all b_k = 0)", () => {
    expect(analyticAreaUpperBound(2, [0, 0])).toBeCloseTo(Math.PI, 9);
  });
  it("is a monotone upper bound — more coefficients never increase it", () => {
    const c: Complex = [-0.2, 0.1];
    expect(analyticAreaUpperBound(2, c, 64)).toBeLessThanOrEqual(
      analyticAreaUpperBound(2, c, 8) + 1e-12,
    );
  });
  it("a connected non-trivial c has area in (0, π)", () => {
    const area = analyticAreaUpperBound(2, [-0.12, 0.74]); // rabbit
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(Math.PI);
  });
});

describe("computeJuliaProperties — z²+c known parameters", () => {
  it("c=0: connected unit disk — period-1 superattracting, area π, dimension 1, capacity 1", () => {
    const p = props(2, [0, 0]);
    expect(p.degree).toBe(2);
    expect(p.connected).toBe(true);
    expect(p.escapes).toBe(false);
    expect(p.cycle?.period).toBe(1);
    expect(p.cycle?.multiplierMag ?? 9).toBeLessThan(1e-6); // superattracting
    expect(p.paramClass).toBe("hyperbolic");
    expect(p.lyapunov).toBe(-Infinity); // superattracting ⇒ −∞
    expect(p.analyticArea ?? 0).toBeCloseTo(Math.PI, 6);
    expect(p.smallCDimension ?? 0).toBeCloseTo(1, 9);
    expect(p.boundingRadius ?? 0).toBeCloseTo(1, 9);
    expect(p.capacity).toBe(1);
  });

  it("c=-1: connected basilica — period 2, area in (0, π), no small-c dimension", () => {
    const p = props(2, [-1, 0]);
    expect(p.connected).toBe(true);
    expect(p.cycle?.period).toBe(2);
    expect(p.analyticArea ?? -1).toBeGreaterThan(0);
    expect(p.analyticArea ?? 9).toBeLessThan(Math.PI);
    expect(p.smallCDimension).toBeNull(); // period 2 ≠ principal cardioid
  });

  it("c=-0.5: attracting fixed point in the cardioid — |λ|∈(0,1), λ_Lyap<0, small-c dim>1", () => {
    const p = props(2, [-0.5, 0]);
    expect(p.cycle?.period).toBe(1);
    expect(p.cycle?.multiplierMag ?? 9).toBeGreaterThan(0);
    expect(p.cycle?.multiplierMag ?? 9).toBeLessThan(1);
    expect(p.paramClass).toBe("hyperbolic");
    expect(p.lyapunov ?? 9).toBeLessThan(0); // attracting
    expect(p.smallCDimension ?? 0).toBeCloseTo(1 + 0.25 / (4 * Math.log(2)), 6);
  });

  it("c=2: escapes → disconnected Cantor set, area 0", () => {
    const p = props(2, [2, 0]);
    expect(p.connected).toBe(false);
    expect(p.escapes).toBe(true);
    expect(p.paramClass).toBe("outside");
    expect(p.cycle).toBeNull();
    expect(p.lyapunov).toBeNull(); // escaping ⇒ reported via `escapes`
    expect(p.analyticArea).toBe(0);
    expect(p.smallCDimension).toBeNull();
    expect(p.boundingRadius ?? 0).toBeCloseTo(2, 9);
  });
});

describe("computeJuliaProperties — non-monic gating", () => {
  it("degree null (arbitrary f) hides the capacity-based rows but keeps orbit facts", () => {
    const p = props(null, [-0.1, 0]); // holomorphic z²+c but treated as arbitrary
    expect(p.degree).toBeNull();
    expect(p.analyticArea).toBeNull();
    expect(p.capacity).toBeNull();
    expect(p.boundingRadius).toBeNull();
    expect(p.smallCDimension).toBeNull();
    expect(p.connected).toBe(true); // orbit-based facts still computed
    expect(typeof p.lyapunov).toBe("number"); // holomorphic ⇒ Lyapunov available
  });

  it("non-holomorphic f: connectivity holds, but cycle/Lyapunov are null (no f′)", () => {
    const bar = parse("conjugate(z)^2+c");
    const p = props(null, [0, 0], bar);
    expect(p.connected).toBe(true); // 0 is a bounded (fixed) orbit of conj(z)²
    expect(p.cycle).toBeNull(); // no analytic multiplier
    expect(p.lyapunov).toBeNull(); // no analytic derivative
    expect(p.analyticArea).toBeNull();
  });
});

describe("Tier-2 image metrics (interior mask, pixel area, box-counting)", () => {
  it("pixel area: z²+c at c=0 fills the unit disk (area ≈ π)", () => {
    const size = 160;
    const H = 1; // window [-1,1]² bounds K_0 (the closed unit disk)
    const mask = interiorMask(F2, ESC, [0, 0], [0, 0], 0, 0, H, size, 120);
    const area = countInterior(mask) * ((2 * H) / size) ** 2;
    expect(Math.abs(area - Math.PI)).toBeLessThan(0.1);
  });

  it("interior mask is empty when the set is a Cantor dust (c=2)", () => {
    const mask = interiorMask(F2, ESC, [2, 0], [0, 0], 0, 0, 2, 64, 80);
    expect(countInterior(mask)).toBe(0);
  });

  it("box-counting dimension of a filled disk ≈ 1 (its boundary is a circle)", () => {
    const size = 256;
    const r = 90;
    const mid = size / 2;
    const disk = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((x - mid) ** 2 + (y - mid) ** 2 <= r * r) disk[y * size + x] = 1;
      }
    }
    const dim = boxCountDimension(disk, size);
    expect(dim).not.toBeNull();
    expect(dim ?? 9).toBeGreaterThan(0.85);
    expect(dim ?? 9).toBeLessThan(1.25);
  });

  it("box-counting dimension is null for an empty mask", () => {
    expect(boxCountDimension(new Uint8Array(64 * 64), 64)).toBeNull();
  });
});
