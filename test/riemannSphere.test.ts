import { describe, expect, it } from "vitest";
import { parse } from "../src/expr/parser";
import { renderRiemannSphere, spherePixelToPlane } from "../src/render/riemannSphere";

describe("spherePixelToPlane (orthographic stereographic projection)", () => {
  const size = 200;

  it("maps the screen centre to z = 0 (south pole)", () => {
    const z = spherePixelToPlane(size / 2, size / 2, size);
    expect(z).not.toBeNull();
    if (z) expect(Math.hypot(z[0], z[1])).toBeLessThan(0.02);
  });

  it("maps the rim toward |z| = 1 (the equator)", () => {
    const z = spherePixelToPlane(size / 2, 0, size); // top centre, near the rim
    expect(z).not.toBeNull();
    if (z) {
      expect(Math.hypot(z[0], z[1])).toBeGreaterThan(0.85);
      expect(Math.hypot(z[0], z[1])).toBeLessThanOrEqual(1.0001);
    }
  });

  it("returns null outside the sphere silhouette", () => {
    expect(spherePixelToPlane(0, 0, size)).toBeNull(); // corner
  });
});

describe("renderRiemannSphere", () => {
  it("renders the basilica (c=−1) with in-set, escaping, and background regions", () => {
    const size = 120;
    const buf = renderRiemannSphere(parse("z^2+c"), parse("abs(z)>2"), [-1, 0], size, 200);
    let inset = 0;
    let escaped = 0;
    let background = 0;
    for (let i = 0; i < size * size; i++) {
      const r = buf[i * 4];
      const g = buf[i * 4 + 1];
      const b = buf[i * 4 + 2];
      if (r === 16 && g === 16 && b === 16) background++;
      else if (r === 0 && g === 0 && b === 0) inset++;
      else escaped++;
    }
    expect(background).toBeGreaterThan(0); // off-sphere corners
    expect(inset).toBeGreaterThan(0); // the filled Julia set
    expect(escaped).toBeGreaterThan(0); // the basin of ∞ shading
  });
});
