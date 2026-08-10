import { describe, expect, it } from "vitest";
import {
  identity,
  multiply,
  lookAt,
  perspective,
  ortho,
  transformPoint,
  type Vec3,
} from "../src/render3d/mat4.js";
import {
  DEFAULT_CAMERA,
  TOP_DOWN,
  cameraEye,
  viewProjection,
  clampElevation,
  ELEV_MIN,
  ELEV_MAX,
} from "../src/render3d/camera.js";
import { buildGridMesh } from "../src/render3d/mesh.js";

// Phase 5 / 5A: the pure 3D kit (mat4 · orbit camera · grid mesh) the analytic-landscape renderer is
// built on. Everything here is math-only, so it pins the projection algebra — most importantly the
// top-down = 2D-portrait mapping (the phase gate) — before any GPU code depends on it.

const close3 = (a: Vec3, b: Vec3, p = 6): void => {
  for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], p);
};

describe("mat4", () => {
  it("identity is a left/right unit and a no-op on points", () => {
    const m = perspective(1, 1.3, 0.5, 20);
    expect(multiply(identity(), m)).toEqual(m);
    expect(multiply(m, identity())).toEqual(m);
    close3(transformPoint(identity(), [3, -2, 5]), [3, -2, 5]);
  });

  it("perspective sends the near/far plane centres to NDC z = ∓1", () => {
    const m = perspective(Math.PI / 2, 1, 1, 10);
    close3(transformPoint(m, [0, 0, -1]), [0, 0, -1]); // near plane centre
    close3(transformPoint(m, [0, 0, -10]), [0, 0, 1]); // far plane centre
  });

  it("ortho maps the box corners to the NDC cube", () => {
    const m = ortho(2, 1, -5, 5); // [-2,2] × [-1,1] × [-5,5]
    close3(transformPoint(m, [2, 1, 0]), [1, 1, 0]);
    close3(transformPoint(m, [-2, -1, 0]), [-1, -1, 0]);
  });

  it("lookAt places the target in front of the camera (−Z), at the dolly distance", () => {
    const v = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    close3(transformPoint(v, [0, 0, 0]), [0, 0, -5]); // origin is 5 units down −Z
  });
});

describe("orbit camera", () => {
  it("cameraEye follows the orbit angles (Z-up)", () => {
    close3(
      cameraEye({
        ...DEFAULT_CAMERA,
        azimuth: 0,
        elevation: 0,
        distance: 3,
        target: [0, 0, 0],
      }),
      [3, 0, 0],
    );
    close3(
      cameraEye({
        ...DEFAULT_CAMERA,
        elevation: Math.PI / 2,
        distance: 3,
        target: [0, 0, 0],
      }),
      [0, 0, 3],
    );
    close3(
      cameraEye({
        ...DEFAULT_CAMERA,
        azimuth: Math.PI / 2,
        elevation: 0,
        distance: 2,
        target: [1, 1, 0],
      }),
      [1, 3, 0],
    );
  });

  it("TOP_DOWN ortho projects world (re, im) to the 2D portrait's screen point, height-independent", () => {
    // The phase gate: with worldHalfHeight = the 2D span and the same aspect, top-down NDC.xy must be
    // (re/(H·A), im/H) — exactly the flat shader's mapping — regardless of the vertex's height.
    const A = 1.6;
    const H = 2;
    const cam = { ...DEFAULT_CAMERA, ...TOP_DOWN, target: [0, 0, 0] as Vec3 };
    const vp = viewProjection(cam, A, H);
    for (const [re, im] of [
      [1, 0.5],
      [-1.3, 0.8],
      [0.2, -1.1],
    ]) {
      const ndcFlat = transformPoint(vp, [re, im, 0]);
      const ndcHigh = transformPoint(vp, [re, im, 3.7]); // a tall spike
      expect(ndcFlat[0]).toBeCloseTo(re / (H * A), 6);
      expect(ndcFlat[1]).toBeCloseTo(im / H, 6);
      expect(ndcHigh[0]).toBeCloseTo(ndcFlat[0], 6); // height doesn't move x/y in ortho top-down
      expect(ndcHigh[1]).toBeCloseTo(ndcFlat[1], 6);
    }
  });

  it("clampElevation keeps the orbit out of the poles", () => {
    expect(clampElevation(-1)).toBe(ELEV_MIN);
    expect(clampElevation(10)).toBe(ELEV_MAX);
    expect(clampElevation(0.5)).toBe(0.5);
  });
});

describe("grid mesh", () => {
  it("has (n+1)² vertices and n²·2 triangles", () => {
    const m = buildGridMesh(2);
    expect(m.vertexCount).toBe(9);
    expect(m.uvs.length).toBe(18);
    expect(m.indexCount).toBe(24); // 4 cells × 2 tris × 3
  });

  it("covers the unit square, corner to corner", () => {
    const m = buildGridMesh(4);
    for (const u of m.uvs) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
    expect([m.uvs[0], m.uvs[1]]).toEqual([0, 0]); // first vertex
    const last = m.vertexCount * 2;
    expect([m.uvs[last - 2], m.uvs[last - 1]]).toEqual([1, 1]); // opposite corner
  });

  it("indices are all in range", () => {
    const m = buildGridMesh(5);
    for (const idx of m.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(m.vertexCount);
    }
  });

  it("floors / clamps the cell count to ≥ 1", () => {
    expect(buildGridMesh(0).n).toBe(1);
    expect(buildGridMesh(3.7).n).toBe(3);
    expect(buildGridMesh(1).vertexCount).toBe(4);
  });
});
