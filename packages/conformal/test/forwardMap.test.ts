import { describe, expect, it } from "vitest";
import { fitConformalMap } from "../src/lightning.js";
import { fitForwardMap } from "../src/forwardMap.js";
import type { C } from "../src/vandermondeArnoldi.js";

const sampleBoundary = (m: number, gamma: (t: number) => C): C[] =>
  Array.from({ length: m }, (_, j) => gamma((2 * Math.PI * j) / m));

describe("forward Riemann map g: 𝔻 → Ω", () => {
  it("the unit disk maps (essentially) to the identity", () => {
    // Ω = 𝔻 (radius 1): f is the identity, so g should be too.
    const boundary = sampleBoundary(240, (t): C => [Math.cos(t), Math.sin(t)]);
    const f = fitConformalMap(boundary, 20);
    const g = fitForwardMap(f, boundary, 20);
    expect(g.boundaryResidual).toBeLessThan(1e-3);
    expect(Math.hypot(g.center[0], g.center[1])).toBeLessThan(1e-3); // g(0) ≈ 0
    const w: C = [0.4, 0.2];
    const gw = g.eval(w);
    expect(Math.hypot(gw[0] - w[0], gw[1] - w[1])).toBeLessThan(2e-3);
  });

  it("a smooth ellipse: g sends ∂𝔻 onto ∂Ω to good accuracy, and 𝔻 into Ω", () => {
    const a = 1.5;
    const b = 0.7;
    const boundary = sampleBoundary(400, (t): C => [a * Math.cos(t), b * Math.sin(t)]);
    const f = fitConformalMap(boundary, 60);
    const g = fitForwardMap(f, boundary, 60);
    expect(g.boundaryResidual).toBeLessThan(5e-2);
    // interior disk points land inside the ellipse (x/a)² + (y/b)² < 1 (with a little slack for the fit)
    for (const [rr, th] of [
      [0.3, 0.7],
      [0.6, 2.1],
      [0.8, 4.0],
    ]) {
      const p = g.eval([rr * Math.cos(th), rr * Math.sin(th)]);
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
      expect((p[0] / a) ** 2 + (p[1] / b) ** 2).toBeLessThan(1.15);
    }
  });

  it("an off-centre circle stays finite and accurate", () => {
    const boundary = sampleBoundary(400, (t): C => [0.4 + Math.cos(t), Math.sin(t)]);
    const f = fitConformalMap(boundary, 40);
    const g = fitForwardMap(f, boundary, 40);
    expect(g.boundaryResidual).toBeLessThan(5e-2);
    const p = g.eval([0.5, 0.1]);
    expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
  });
});
