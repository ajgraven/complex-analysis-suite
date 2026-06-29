/**
 * All-critical-points connectivity (Fatou–Julia). Oracles: z²+c has the single critical point 0;
 * the cubic z³−3z+c has critical points ±1, giving all three connectivity regimes as c varies
 * (c=0 both bounded → connected; c=1 both escape → Cantor; c=2.5 one of each → disconnected).
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "../src/expr/parser";
import { findCriticalPoints, polynomialCoeffs, polynomialConnectivity } from "../src/render/critical";

const ESC = parse("abs(z)>2");
const O: Complex = [0, 0];
const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);

describe("findCriticalPoints", () => {
  it("z²+c has the single critical point 0", () => {
    const pts = findCriticalPoints(parse("z^2+c"), O, O);
    expect(pts).not.toBeNull();
    if (!pts) return;
    expect(pts.length).toBe(1);
    expect(cabs(pts[0])).toBeLessThan(1e-6);
  });

  it("z³+c has critical point 0 (double)", () => {
    const pts = findCriticalPoints(parse("z^3+c"), O, O);
    expect(pts).not.toBeNull();
    if (!pts) return;
    expect(pts.length).toBe(2);
    for (const p of pts) expect(cabs(p)).toBeLessThan(1e-2);
  });

  it("z³−3z+c has critical points ±1", () => {
    const pts = findCriticalPoints(parse("z^3-3*z+c"), O, O);
    expect(pts).not.toBeNull();
    if (!pts) return;
    expect(pts.length).toBe(2);
    const reals = pts.map((p) => p[0]).sort((u, v) => u - v);
    expect(reals[0]).toBeCloseTo(-1, 6);
    expect(reals[1]).toBeCloseTo(1, 6);
    for (const p of pts) expect(Math.abs(p[1])).toBeLessThan(1e-6); // real roots
  });

  it("z⁴+c has critical point 0 (triple) — the residual guard accepts the multiple root", () => {
    const pts = findCriticalPoints(parse("z^4+c"), O, O);
    expect(pts).not.toBeNull();
    if (!pts) return;
    expect(pts.length).toBe(3);
    for (const p of pts) expect(cabs(p)).toBeLessThan(1e-2);
  });

  it("returns null for a non-polynomial map", () => {
    expect(findCriticalPoints(parse("exp(z)+c"), O, O)).toBeNull();
    expect(findCriticalPoints(parse("conjugate(z)^2+c"), O, O)).toBeNull(); // non-holomorphic
  });
});

describe("polynomialConnectivity (all critical orbits)", () => {
  it("z²+c reduces to the single-critical-point test", () => {
    expect(polynomialConnectivity(parse("z^2+c"), ESC, O, [0, 0])).toBe("connected");
    expect(polynomialConnectivity(parse("z^2+c"), ESC, O, [2, 0])).toBe("cantor");
  });

  it("cubic z³−3z+c covers all three regimes as c varies", () => {
    const F = parse("z^3-3*z+c");
    expect(polynomialConnectivity(F, ESC, O, [0, 0])).toBe("connected"); // ±1 → −2, 2 (both bounded)
    expect(polynomialConnectivity(F, ESC, O, [1, 0])).toBe("cantor"); // both critical orbits escape
    expect(polynomialConnectivity(F, ESC, O, [2.5, 0])).toBe("disconnected"); // one bounded, one escapes
  });

  it("z⁴+c (triple critical point): connected at c=0, Cantor when the critical orbit escapes", () => {
    const F = parse("z^4+c");
    expect(polynomialConnectivity(F, ESC, O, [0, 0])).toBe("connected");
    expect(polynomialConnectivity(F, ESC, O, [2, 0])).toBe("cantor");
  });

  it("is null for a non-polynomial map (caller falls back to the image estimate)", () => {
    expect(polynomialConnectivity(parse("exp(z)+c"), ESC, O, O)).toBeNull();
    expect(polynomialConnectivity(parse("1/z+c"), ESC, O, O)).toBeNull();
  });
});

describe("polynomialCoeffs", () => {
  const C0: Complex = [0.3, -0.4];
  const near = (z: Complex, x: number, y: number): boolean =>
    Math.abs(z[0] - x) < 1e-6 && Math.abs(z[1] - y) < 1e-6;

  it("extracts z²+c", () => {
    const co = polynomialCoeffs(parse("z^2+c"), O, C0);
    expect(co).not.toBeNull();
    if (!co) return;
    expect(co.length).toBe(3);
    expect(near(co[0], C0[0], C0[1])).toBe(true); // a0 = c
    expect(cabs(co[1])).toBeLessThan(1e-6); // a1 = 0
    expect(near(co[2], 1, 0)).toBe(true); // a2 = 1
  });

  it("extracts the non-monic 2z²+c", () => {
    const co = polynomialCoeffs(parse("2*z^2+c"), O, C0);
    expect(co).not.toBeNull();
    if (!co) return;
    expect(near(co[2], 2, 0)).toBe(true);
    expect(near(co[0], C0[0], C0[1])).toBe(true);
  });

  it("expands a product into a general cubic — (z²+1)(z−c) = z³ − c·z² + z − c", () => {
    const co = polynomialCoeffs(parse("(z^2+1)*(z-c)"), O, C0);
    expect(co).not.toBeNull();
    if (!co) return;
    expect(co.length).toBe(4);
    expect(near(co[3], 1, 0)).toBe(true);
    expect(near(co[2], -C0[0], -C0[1])).toBe(true); // −c
    expect(near(co[1], 1, 0)).toBe(true);
    expect(near(co[0], -C0[0], -C0[1])).toBe(true); // −c
  });

  it("treats a function of constants as a constant coefficient — z² + sqrt(c)", () => {
    const co = polynomialCoeffs(parse("z^2+sqrt(c)"), O, C0);
    expect(co).not.toBeNull();
    if (!co) return;
    const r = Math.sqrt(Math.hypot(C0[0], C0[1]));
    const ang = Math.atan2(C0[1], C0[0]) / 2;
    expect(near(co[0], r * Math.cos(ang), r * Math.sin(ang))).toBe(true);
    expect(near(co[2], 1, 0)).toBe(true);
  });

  it("returns null for non-polynomial f (transcendental / rational / non-holomorphic)", () => {
    expect(polynomialCoeffs(parse("sin(z)+c"), O, C0)).toBeNull();
    expect(polynomialCoeffs(parse("1/(z-1)"), O, C0)).toBeNull();
    expect(polynomialCoeffs(parse("conjugate(z)+c"), O, C0)).toBeNull();
  });
});
