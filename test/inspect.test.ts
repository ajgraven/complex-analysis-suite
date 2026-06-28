import { describe, it, expect } from "vitest";
import { parse } from "../src/expr/parser";
import { makeComplexFn } from "../src/expr/evaluate";
import { inspect, rotationNumber, findNucleus } from "../src/render/inspect";
import type { Complex } from "../src/complex";

const F = parse("z^2+c"); // Mandelbrot / Julia map
const ESC = parse("abs(z)>2");
const O: Complex = [0, 0]; // critical point of z²+c

describe("rotationNumber", () => {
  it("is 1/2 for a 2-cycle and 1/3 for a CCW 3-cycle (in orbit order)", () => {
    expect(
      rotationNumber([
        [1, 0],
        [-1, 0],
      ]),
    ).toEqual({ p: 1, q: 2 });
    expect(
      rotationNumber([
        [1, 0],
        [-0.5, 0.866],
        [-0.5, -0.866],
      ]),
    ).toEqual({ p: 1, q: 3 });
  });

  it("is null for a single point", () => {
    expect(rotationNumber([[1, 0]])).toBeNull();
  });

  it("is null for a collinear (real) cycle of period ≥ 3 — no winding", () => {
    expect(
      rotationNumber([
        [1, 0],
        [-0.5, 0],
        [-2, 0],
      ]),
    ).toBeNull();
    expect(
      rotationNumber([
        [0, 1],
        [0, -0.3],
        [0, 2],
        [0, -1.5],
      ]),
    ).toBeNull();
  });
});

describe("inspect — parameter plane (critical orbit)", () => {
  it("main cardioid: attracting fixed point (period 1, |λ| < 1)", () => {
    const r = inspect(F, ESC, "param", O, [-0.1, 0]);
    expect(r.fate).toBe("converged");
    expect(r.period).toBe(1);
    expect(r.multiplierMag).not.toBeNull();
    // `?? 9` so a null magnitude (which .not.toBeNull already guards) still fails here.
    expect(r.multiplierMag ?? 9).toBeGreaterThan(0.05);
    expect(r.multiplierMag ?? 9).toBeLessThan(1);
  });

  it("period-2 bulb centre c=-1: period 2, superattracting, rotation 1/2", () => {
    const r = inspect(F, ESC, "param", O, [-1, 0]);
    expect(r.period).toBe(2);
    expect(r.multiplierMag ?? 9).toBeLessThan(1e-3);
    expect(r.rotation).toEqual({ p: 1, q: 2 });
  });

  it("1/3 bulb centre: period 3, superattracting, rotation denominator 3", () => {
    const r = inspect(F, ESC, "param", O, [-0.1225611668, 0.7448617666]);
    expect(r.period).toBe(3);
    expect(r.multiplierMag ?? 9).toBeLessThan(1e-3);
    expect(r.rotation?.q).toBe(3);
  });

  it("exterior c=2: escapes with a positive, finite distance estimate", () => {
    const r = inspect(F, ESC, "param", O, [2, 0]);
    expect(r.fate).toBe("escaped");
    expect(r.distance).not.toBeNull();
    expect(r.distance ?? -1).toBeGreaterThan(0);
    expect(Number.isFinite(r.distance ?? NaN)).toBe(true);
  });
});

describe("inspect — dynamical plane", () => {
  it("escaped z₀ reports a positive distance to the Julia set", () => {
    const r = inspect(F, ESC, "dyn", [2, 0], [0, 0]);
    expect(r.fate).toBe("escaped");
    expect(r.distance ?? -1).toBeGreaterThan(0);
  });
});

describe("inspect — non-holomorphic fallback", () => {
  it("conjugate map (Mandelbar): period reported, multiplier null", () => {
    const bar = parse("conjugate(z)^2+c");
    const r = inspect(bar, ESC, "param", O, [0, 0]);
    expect(r.period).toBe(1); // 0 is a fixed point of conj(z)²
    expect(r.multiplier).toBeNull();
    expect(r.distance).toBeNull();
  });

  it("conjugate map that escapes: fate escaped, distance null (no derivative)", () => {
    const bar = parse("conjugate(z)^2+c");
    const r = inspect(bar, ESC, "param", O, [2, 0]); // c=2 escapes
    expect(r.fate).toBe("escaped");
    expect(r.distance).toBeNull(); // non-holomorphic ⇒ no analytic DE
  });
});

describe("inspect — located cycle points", () => {
  it("captures the attracting cycle (param plane, c=-1 → superattracting 2-cycle {0,-1})", () => {
    const r = inspect(F, ESC, "param", O, [-1, 0]);
    expect(r.cyclePoints).not.toBeNull();
    expect(r.cyclePoints?.length).toBe(r.period);
    expect(r.cyclePoints?.length).toBe(2);
    // The critical 2-cycle of z²−1 is {0, −1} (in some rotation); both points are real.
    const xs = (r.cyclePoints ?? []).map((p) => p[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1, 6);
    expect(xs[1]).toBeCloseTo(0, 6);
    for (const p of r.cyclePoints ?? []) expect(Math.abs(p[1])).toBeLessThan(1e-6);
  });

  it("captures the cycle on the dynamical plane (z₀=0 in the basilica basin)", () => {
    const r = inspect(F, ESC, "dyn", O, [-1, 0]);
    expect(r.cyclePoints?.length).toBe(2);
  });

  it("is null when the orbit escapes", () => {
    const r = inspect(F, ESC, "param", O, [2, 0]);
    expect(r.fate).toBe("escaped");
    expect(r.cyclePoints).toBeNull();
  });

  it("Newton-refines the cycle so fᵖ(z*) = z* to high precision", () => {
    const f = makeComplexFn(F);
    // Attracting (not superattracting) fixed point at c = -0.5: f(z*) = z*.
    const c1: Complex = [-0.5, 0];
    const z1 = inspect(F, ESC, "param", O, c1).cyclePoints?.[0] ?? [9, 9];
    const fz1 = f(z1, c1);
    expect(Math.hypot(fz1[0] - z1[0], fz1[1] - z1[1])).toBeLessThan(1e-12);
    // Period-3 (1/3 bulb centre): f³(z*) = z*.
    const c3: Complex = [-0.1225611668, 0.7448617666];
    const r3 = inspect(F, ESC, "param", O, c3);
    let w = r3.cyclePoints?.[0] ?? [9, 9];
    for (let k = 0; k < r3.period; k++) w = f(w, c3);
    const z3 = r3.cyclePoints?.[0] ?? [0, 0];
    expect(Math.hypot(w[0] - z3[0], w[1] - z3[1])).toBeLessThan(1e-9);
  });
});

describe("findNucleus", () => {
  it("snaps to the period-2 nucleus c = -1 from inside the bulb", () => {
    const c = findNucleus(F, O, 2, [-0.9, 0.1]);
    expect(c).not.toBeNull();
    expect(c?.[0] ?? 9).toBeCloseTo(-1, 10);
    expect(c?.[1] ?? 9).toBeCloseTo(0, 10);
  });

  it("snaps to the period-3 (rabbit) nucleus", () => {
    const c = findNucleus(F, O, 3, [-0.12, 0.74]);
    expect(c?.[0] ?? 9).toBeCloseTo(-0.1225611668, 8);
    expect(c?.[1] ?? 9).toBeCloseTo(0.7448617666, 8);
  });

  it("lands on a superattracting centre (|λ| ≈ 0 there)", () => {
    const c = findNucleus(F, O, 2, [-0.9, 0.1]);
    const r = inspect(F, ESC, "param", O, c ?? [0, 0]);
    expect(r.multiplierMag ?? 9).toBeLessThan(1e-3);
  });

  it("returns null for a non-holomorphic map (no analytic derivative)", () => {
    const bar = parse("conjugate(z)^2+c");
    expect(findNucleus(bar, O, 2, [-0.9, 0.1])).toBeNull();
  });
});
