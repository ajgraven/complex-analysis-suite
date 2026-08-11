import { describe, expect, it } from "vitest";
import { pickHeightField, type PickCamera } from "../src/render3d/pick.js";

// The value-inspector raycast (catalog H1): march the cursor against the height field and return the
// domain point on the surface under it. Tested against a FLAT field (z = 0), where the hit is the exact
// ray–plane intersection, plus the top-down ortho case and the off-surface miss.
const flat = (): number => 0;
const hit = (h: [number, number] | null): [number, number] => {
  if (h === null) throw new Error("expected a surface hit, got null");
  return h;
};

describe("pickHeightField", () => {
  it("a perspective centre ray hits the look-at point (the domain centre)", () => {
    // The centre ray points from the eye straight at the target on z = 0, so it lands on the centre.
    const cam: PickCamera = {
      eye: [3, -4, 3],
      target: [0, 0, 0],
      fov: (50 * Math.PI) / 180,
      ortho: false,
      worldHalfHeight: 4,
    };
    const p = hit(pickHeightField(cam, 0, 0, 1.5, flat));
    expect(p[0]).toBeCloseTo(0, 3);
    expect(p[1]).toBeCloseTo(0, 3);
  });

  it("the top-down ortho pick equals the screen→world mapping (re right, im up)", () => {
    const cam: PickCamera = {
      eye: [0, 0, 5],
      target: [0, 0, 0],
      fov: (50 * Math.PI) / 180,
      ortho: true,
      worldHalfHeight: 2,
    };
    const aspect = 1.5; // halfW = 3, halfH = 2
    const p = hit(pickHeightField(cam, 0.5, -0.5, aspect, flat));
    expect(p[0]).toBeCloseTo(0.5 * 3, 4); // ndcX · halfW
    expect(p[1]).toBeCloseTo(-0.5 * 2, 4); // ndcY · halfH
  });

  it("moving the cursor right/up moves the hit right (+re) / away (+im)", () => {
    // Camera on −Y looking toward +Y: screen-right = +re, screen-up = +im on the ground.
    const cam: PickCamera = {
      eye: [0, -5, 3],
      target: [0, 0, 0],
      fov: (50 * Math.PI) / 180,
      ortho: false,
      worldHalfHeight: 6,
    };
    const centre = hit(pickHeightField(cam, 0, 0, 1, flat));
    const rightward = hit(pickHeightField(cam, 0.5, 0, 1, flat));
    const upward = hit(pickHeightField(cam, 0, 0.5, 1, flat));
    expect(centre[0]).toBeCloseTo(0, 3);
    expect(centre[1]).toBeCloseTo(0, 3);
    expect(rightward[0]).toBeGreaterThan(0.1); // drag right → larger re
    expect(upward[1]).toBeGreaterThan(centre[1]); // up the screen → further into +im
  });

  it("returns null when the ray misses the plotted domain (cursor over empty scene)", () => {
    const cam: PickCamera = {
      eye: [3, -4, 3],
      target: [0, 0, 0],
      fov: (50 * Math.PI) / 180,
      ortho: false,
      worldHalfHeight: 0.1, // a tiny domain — a far-corner ray lands well outside it
    };
    expect(pickHeightField(cam, 0.95, 0.95, 1, flat)).toBeNull();
  });

  it("hits a raised plateau above the base plane (height is respected)", () => {
    // A constant height h = 1: the centre ray meets the plateau nearer the camera than the base plane, so
    // (from −Y) at a smaller +im. Both are valid domain points; they must differ — the height is used.
    const cam: PickCamera = {
      eye: [0, -5, 6],
      target: [0, 0, 0],
      fov: (50 * Math.PI) / 180,
      ortho: false,
      worldHalfHeight: 6,
    };
    const onBase = hit(pickHeightField(cam, 0, 0, 1, flat));
    const onPlateau = hit(pickHeightField(cam, 0, 0, 1, () => 1));
    expect(onPlateau[1]).toBeLessThan(onBase[1]);
  });
});
