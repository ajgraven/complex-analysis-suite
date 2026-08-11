import { describe, expect, it } from "vitest";
import { compileMap, derivativeAt } from "../src/map.js";
import type { MapState } from "../src/viewState.js";

const mk = (expr: string): MapState => ({ expr, vars: ["z"], antiholomorphic: false });

describe("compileMap (A1/S3)", () => {
  it("compiles a valid map to a JS evaluator + GLSL body + latex", () => {
    const r = compileMap(mk("z + 1/z")); // Joukowski
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [re, im] = r.map.jsFn([2, 0], [0, 0]); // 2 + 1/2
    expect(re).toBeCloseTo(2.5, 12);
    expect(im).toBeCloseTo(0, 12);
    expect(r.map.glslBody).toMatch(/\bfFn\b/);
    expect(r.map.latex.length).toBeGreaterThan(0);
  });

  it("returns an honest error for a malformed expression (never throws)", () => {
    const r = compileMap(mk("(z + 1")); // unclosed parenthesis
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThan(0);
  });

  it("carries a symbolic φ′ for holomorphic maps (exact) and evaluates it", () => {
    const r = compileMap(mk("z*z")); // (z²)′ = 2z
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.map.jsDeriv).not.toBeNull();
    expect(r.map.glslDerivBody).toMatch(/\bdFn\b/);
    const d = derivativeAt(r.map, [3, 0]); // 2·3 = 6
    expect(d[0]).toBeCloseTo(6, 9);
    expect(d[1]).toBeCloseTo(0, 9);
  });

  it("has no symbolic φ′ for an anti-holomorphic map, and finite-differences instead", () => {
    const r = compileMap(mk("conjugate(z)"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.map.jsDeriv).toBeNull();
    expect(r.map.glslDerivBody).toBeNull();
    // finite-difference ∂/∂x of conj(z) = 1 (the real-axis directional derivative)
    const d = derivativeAt(r.map, [2, -1]);
    expect(d[0]).toBeCloseTo(1, 5);
    expect(d[1]).toBeCloseTo(0, 5);
  });

  it("reports the local degree at ∞ for rational maps of degree ≥ 2, else null (P2)", () => {
    const deg = (expr: string) => {
      const r = compileMap(mk(expr));
      return r.ok ? r.map.degree : "err";
    };
    expect(deg("z*z - 1")).toBe(2); // basilica
    expect(deg("z*z*z + 0.1")).toBe(3);
    expect(deg("(z - 1)/(z + 1)")).toBeNull(); // Möbius: degree 0 at ∞
    expect(deg("1/z")).toBeNull(); // degree −1 at ∞
    expect(deg("exp(z)")).toBeNull(); // transcendental → not rational
  });
});
