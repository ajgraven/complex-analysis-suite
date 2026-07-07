import { describe, expect, it } from "vitest";
import type { Complex } from "../src/deltoid.js";
import { equatorPoint, pixelToWorld, pointerToTheta } from "../src/mating/matingView.js";

const near = (a: Complex, b: Complex, p = 6): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

describe("mating view — interactive equator coordinates", () => {
  it("equatorPoint: disk panels give e^{iθ}; σ gives the deltoid curve (cusps at θ = 0, 2π/3)", () => {
    near(equatorPoint("map", 0.7), [Math.cos(0.7), Math.sin(0.7)]);
    near(equatorPoint("group", 2), [Math.cos(2), Math.sin(2)]);
    near(equatorPoint("sigma", 0), [1.5, 0]); // the real cusp
    near(equatorPoint("sigma", (2 * Math.PI) / 3), [1.5 * Math.cos((2 * Math.PI) / 3), 1.5 * Math.sin((2 * Math.PI) / 3)]);
  });

  it("pointerToTheta inverts equatorPoint on the equator (both disk and σ)", () => {
    for (const th of [0.3, 1.5, 3.0, -1.2, 2.7]) {
      const dm = pointerToTheta("map", equatorPoint("map", th));
      near([Math.cos(dm), Math.sin(dm)], [Math.cos(th), Math.sin(th)], 6);
      const ds = pointerToTheta("sigma", equatorPoint("sigma", th));
      near([Math.cos(ds), Math.sin(ds)], [Math.cos(th), Math.sin(th)], 1); // nearest of 360 samples ≈ 1°
    }
  });

  it("pixelToWorld maps the centre pixel to the panel's view centre", () => {
    near(pixelToWorld(190, 190, "map", 380), [0, 0]);
    const c = pixelToWorld(190, 190, "sigma", 380);
    expect(c[0]).toBeCloseTo(0.2, 6); // σ view is centred at cx = 0.2
    expect(c[1]).toBeCloseTo(0, 6);
  });
});
