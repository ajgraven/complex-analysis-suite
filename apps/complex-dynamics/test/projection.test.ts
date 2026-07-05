import { describe, expect, it } from "vitest";
import type { Vec2 } from "../src/arrays";
import { forwardProject, inverseProject } from "../src/render/projection";

const ORIGIN: Vec2 = [0, 0];
const close = (a: Vec2, b: Vec2, tol = 1e-9): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

describe("Poincaré disk projection (w = tanh(|z|/2)·ẑ)", () => {
  it("maps the disk centre to the projection centre and back", () => {
    expect(inverseProject([0, 0], ORIGIN, "poincare")).toEqual([0, 0]);
    expect(forwardProject([0, 0], ORIGIN, "poincare")).toEqual([0, 0]);
  });

  it("forward maps |z| = 2 to |w| = tanh(1) ≈ 0.7616", () => {
    const w = forwardProject([2, 0], ORIGIN, "poincare") as Vec2;
    expect(w[0]).toBeCloseTo(Math.tanh(1), 9);
    expect(w[1]).toBeCloseTo(0, 9);
  });

  it("pushes |z| → ∞ toward the disk boundary |w| → 1, never past it", () => {
    for (const R of [1, 10, 100, 1e6]) {
      const w = forwardProject([R, 0], ORIGIN, "poincare") as Vec2;
      const m = Math.hypot(w[0], w[1]);
      expect(m).toBeLessThanOrEqual(1); // tanh saturates to exactly 1 for large R (the boundary = ∞)
      if (R >= 100) expect(m).toBeGreaterThan(0.99);
    }
  });

  it("returns null outside the unit disk (boundary = ∞)", () => {
    expect(inverseProject([1, 0], ORIGIN, "poincare")).toBeNull();
    expect(inverseProject([0.8, 0.8], ORIGIN, "poincare")).toBeNull(); // |w| = 1.13
  });

  it("forward ∘ inverse = identity inside the disk (round-trip)", () => {
    for (const v of [[0.5, 0], [-0.3, 0.4], [0.1, -0.7], [0.62, 0.62]] as Vec2[]) {
      const z = inverseProject(v, ORIGIN, "poincare") as Vec2;
      expect(z).not.toBeNull();
      expect(close(forwardProject(z, ORIGIN, "poincare") as Vec2, v)).toBe(true);
    }
  });

  it("respects the projection centre", () => {
    const c: Vec2 = [0.3, -0.2];
    expect(inverseProject([0, 0], c, "poincare")).toEqual(c); // disk centre → c*
    const z = inverseProject([0.4, 0.1], c, "poincare") as Vec2;
    expect(close(forwardProject(z, c, "poincare") as Vec2, [0.4, 0.1])).toBe(true);
  });
});

describe("log-polar projection (z = c* + e^{ρ+iφ})", () => {
  it("maps the view origin to radius 1, angle 0 about the centre", () => {
    expect(close(inverseProject([0, 0], ORIGIN, "logpolar") as Vec2, [1, 0])).toBe(true);
  });

  it("screen x is the angle (φ = x·π), screen y is the log-radius (ρ = y·π)", () => {
    // x = 1 ⇒ φ = π ⇒ direction (−1, 0); y = 0 ⇒ radius 1.
    expect(close(inverseProject([1, 0], ORIGIN, "logpolar") as Vec2, [-1, 0])).toBe(true);
    // y = 1 ⇒ ρ = π ⇒ radius e^π; x = 0 ⇒ angle 0.
    const z = inverseProject([0, 1], ORIGIN, "logpolar") as Vec2;
    expect(z[0]).toBeCloseTo(Math.exp(Math.PI), 6);
  });

  it("forward ∘ inverse = identity (round-trip, |φ| < π)", () => {
    for (const v of [[0.3, 0.2], [-0.5, -0.4], [0.0, 0.9], [0.7, -0.6]] as Vec2[]) {
      const z = inverseProject(v, ORIGIN, "logpolar") as Vec2;
      expect(close(forwardProject(z, ORIGIN, "logpolar") as Vec2, v, 1e-9)).toBe(true);
    }
  });

  it("respects the projection centre (the exponential map's fixed anchor)", () => {
    const c: Vec2 = [-1.401155, 0]; // a Feigenbaum-like anchor
    const z = inverseProject([0.2, 0.1], c, "logpolar") as Vec2;
    expect(close(forwardProject(z, c, "logpolar") as Vec2, [0.2, 0.1])).toBe(true);
  });
});

describe("linear mode is the identity", () => {
  it("passes the view coordinate through unchanged", () => {
    expect(inverseProject([0.4, -0.2], ORIGIN, "linear")).toEqual([0.4, -0.2]);
    expect(forwardProject([0.4, -0.2], ORIGIN, "linear")).toEqual([0.4, -0.2]);
  });
});
