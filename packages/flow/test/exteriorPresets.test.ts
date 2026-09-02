import { describe, it, expect } from "vitest";
import { EXTERIOR_MAP_PRESETS } from "../src/exteriorPresets.js";
import type { Pt } from "../src/transplant.js";

const psiOf = (id: string): ((z: Pt) => Pt) => {
  const p = EXTERIOR_MAP_PRESETS.find((e) => e.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p.psi;
};

describe("exterior-map presets", () => {
  it("exposes the six-map gallery with unique ids", () => {
    expect(EXTERIOR_MAP_PRESETS.map((p) => p.id)).toEqual([
      "joukowski-ext",
      "vslit-ext",
      "ellipse-ext",
      "deltoid-ext",
      "astroid-ext",
      "star5-ext",
    ]);
  });

  // Golden — ψ at two clean exterior points, frozen. z = 2 (real axis) and z = i (on |z| = 1). These
  // rationals are the shared corpus the two consumers (Riemann-Map, 2D Hydrodynamics) agree on.
  it("pins ψ(2) — the leading coefficient shows as z grows", () => {
    const two: Pt = [2, 0];
    expect(psiOf("joukowski-ext")(two)).toEqual([1.25, 0]);
    expect(psiOf("vslit-ext")(two)).toEqual([0.75, 0]);
    expect(psiOf("ellipse-ext")(two)).toEqual([2.25, 0]);
    expect(psiOf("deltoid-ext")(two)).toEqual([2.125, 0]);
    expect(psiOf("astroid-ext")(two)[0]).toBeCloseTo(2.0416667, 6);
    expect(psiOf("star5-ext")(two)).toEqual([2.015625, 0]);
  });

  it("pins ψ(i) on the unit circle", () => {
    const i: Pt = [0, 1];
    const near = (z: Pt, re: number, im: number): void => {
      expect(z[0]).toBeCloseTo(re, 12);
      expect(z[1]).toBeCloseTo(im, 12);
    };
    near(psiOf("joukowski-ext")(i), 0, 0); // segment [−1,1] — the circle collapses onto the real axis
    near(psiOf("vslit-ext")(i), 0, 1); // segment [−i,i] — i is an endpoint
    near(psiOf("ellipse-ext")(i), 0, 0.5); // ellipse minor semi-axis
    near(psiOf("deltoid-ext")(i), -0.5, 1);
    near(psiOf("astroid-ext")(i), 0, 4 / 3);
    near(psiOf("star5-ext")(i), 0.25, 1);
  });

  it("maps ∂𝔻 to the expected body: Joukowski → [−1,1], vertical slit → [−i,i]", () => {
    const jouk = psiOf("joukowski-ext");
    const vslit = psiOf("vslit-ext");
    for (let k = 0; k < 24; k++) {
      const t = (2 * Math.PI * k) / 24;
      const e: Pt = [Math.cos(t), Math.sin(t)];
      const j = jouk(e);
      expect(Math.abs(j[1])).toBeLessThan(1e-12); // stays on the real axis
      expect(Math.abs(j[0])).toBeLessThanOrEqual(1 + 1e-12); // within [−1,1]
      const v = vslit(e);
      expect(Math.abs(v[0])).toBeLessThan(1e-12); // stays on the imaginary axis
      expect(Math.abs(v[1])).toBeLessThanOrEqual(1 + 1e-12); // within [−i,i]
    }
  });

  it("maps ∂𝔻 onto the ellipse with semi-axes 3/2 and 1/2", () => {
    const psi = psiOf("ellipse-ext");
    for (let k = 0; k < 24; k++) {
      const t = (2 * Math.PI * k) / 24;
      const e: Pt = [Math.cos(t), Math.sin(t)];
      const [x, y] = psi(e);
      expect((x / 1.5) ** 2 + (y / 0.5) ** 2).toBeCloseTo(1, 12);
    }
  });
});
