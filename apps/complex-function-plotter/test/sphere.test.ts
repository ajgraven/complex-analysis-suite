import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import type { Vec3 } from "../src/render3d/mat4.js";
import {
  QUAT_IDENTITY,
  quatFromAxisAngle,
  quatMultiply,
  quatConjugate,
  quatNormalize,
  rotateVec3,
  quatToMat3,
  worldToModel,
  trackballPoint,
  arcballDelta,
  DEFAULT_ROTATION,
  SPHERE_DIST_MIN,
  SPHERE_DIST_MAX,
  SPHERE_DIST_DEFAULT,
  sphereToZ,
  worldHitToZ,
  type Quat,
} from "../src/render3d/sphere.js";
import { buildSphereFragment, SPHERE_TO_Z_GLSL } from "../src/render3d/sphereShader.js";

// Phase 5 / 5C-ii: the Riemann sphere (catalog F7). The quaternion + arcball + stereographic kit is pure,
// so it is pinned here — most importantly the two invariants the render leans on: `worldToModel` really is
// the inverse orientation (so a drag spins the texture the right way) and the JS `sphereToZ` mirrors the
// GLSL bit-for-bit (so a future cursor pick agrees with the rendered pixel). The end-to-end silhouette /
// rotation / dolly is proven by the headless render check.

const close3 = (a: Vec3, b: Vec3, p = 6): void => {
  for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], p);
};

/** Apply a column-major mat3 (9 numbers) to a vector — mirrors the GLSL `mat3 * vec3`. */
const applyMat3 = (m: number[], v: Vec3): Vec3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];

describe("quaternion", () => {
  it("identity rotates nothing", () => {
    expect(QUAT_IDENTITY).toEqual([0, 0, 0, 1]);
    close3(rotateVec3(QUAT_IDENTITY, [3, -2, 5]), [3, -2, 5]);
    expect(quatFromAxisAngle([1, 0, 0], 0)).toEqual([0, 0, 0, 1]);
  });

  it("rotateVec3 turns the basis by the right angle", () => {
    // 90° about +Z sends +X → +Y and +Y → −X.
    const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    close3(rotateVec3(q, [1, 0, 0]), [0, 1, 0]);
    close3(rotateVec3(q, [0, 1, 0]), [-1, 0, 0]);
    close3(rotateVec3(q, [0, 0, 1]), [0, 0, 1]); // axis is fixed
  });

  it("multiply composes rotations (apply b first, then a)", () => {
    const a = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    const b = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    // two quarter-turns about Z = a half-turn: +X → −X.
    close3(rotateVec3(quatMultiply(a, b), [1, 0, 0]), [-1, 0, 0]);
    // identity is a two-sided unit.
    expect(quatMultiply(QUAT_IDENTITY, a)).toEqual(a);
    close3(rotateVec3(quatMultiply(a, QUAT_IDENTITY), [1, 0, 0]), [0, 1, 0]);
  });

  it("conjugate is the inverse: q·q* = identity", () => {
    const q = quatNormalize(quatFromAxisAngle([1, 2, 3], 0.9));
    const p = quatMultiply(q, quatConjugate(q));
    close3([p[0], p[1], p[2]], [0, 0, 0]);
    expect(p[3]).toBeCloseTo(1, 6);
    // conjugate undoes the rotation.
    const v: Vec3 = [0.3, -0.7, 0.5];
    close3(rotateVec3(quatConjugate(q), rotateVec3(q, v)), v);
  });

  it("normalize rescales a drifted quaternion to unit length without changing the rotation", () => {
    const drifted: Quat = [2, 0, 0, 2]; // ‖·‖ = 2√2, a 90° X-rotation
    const n = quatNormalize(drifted);
    expect(Math.hypot(n[0], n[1], n[2], n[3])).toBeCloseTo(1, 12);
    close3(
      rotateVec3(n, [0, 1, 0]),
      rotateVec3(quatFromAxisAngle([1, 0, 0], Math.PI / 2), [0, 1, 0]),
    );
  });

  it("quatToMat3 columns are the rotated basis (agrees with rotateVec3, column-major)", () => {
    const q = quatNormalize(quatFromAxisAngle([1, -1, 0.5], 1.3));
    const m = quatToMat3(q);
    close3([m[0], m[1], m[2]], rotateVec3(q, [1, 0, 0])); // c0
    close3([m[3], m[4], m[5]], rotateVec3(q, [0, 1, 0])); // c1
    close3([m[6], m[7], m[8]], rotateVec3(q, [0, 0, 1])); // c2
  });
});

describe("worldToModel — the inverse orientation the shader applies to each ray hit", () => {
  it("identity orientation → identity matrix", () => {
    close3(applyMat3(worldToModel(QUAT_IDENTITY), [0.2, -0.4, 0.9]), [0.2, -0.4, 0.9]);
  });

  it("undoes the orientation: worldToModel(rot) · rotateVec3(rot, v) = v", () => {
    const rot = quatNormalize(quatFromAxisAngle([0.3, 1, -0.2], 2.1));
    for (const v of [
      [1, 0, 0],
      [0, 1, 0],
      [0.4, -0.5, 0.77],
    ] as Vec3[]) {
      close3(applyMat3(worldToModel(rot), rotateVec3(rot, v)), v);
    }
  });
});

describe("arcball (drag → rotation)", () => {
  it("trackballPoint: centre is the front pole, the rim is unit and flat", () => {
    close3(trackballPoint([0.5, 0.5]), [0, 0, 1]); // dead centre → front of the hemisphere
    const far = trackballPoint([2, 0.5]); // well outside the disk → projected to the rim
    expect(far[2]).toBe(0);
    expect(Math.hypot(far[0], far[1])).toBeCloseTo(1, 12);
  });

  it("flips screen-y so +y is up", () => {
    expect(trackballPoint([0.5, 0])[1]).toBeGreaterThan(0); // top of the screen → +y
    expect(trackballPoint([0.5, 1])[1]).toBeLessThan(0); // bottom → −y
  });

  it("a null drag is the identity rotation", () => {
    expect(arcballDelta([0.4, 0.6], [0.4, 0.6])).toEqual(QUAT_IDENTITY);
  });

  it("the delta rotates the start trackball point onto the end point", () => {
    const from: [number, number] = [0.5, 0.5];
    const to: [number, number] = [0.7, 0.35];
    const q = arcballDelta(from, to);
    close3(rotateVec3(q, trackballPoint(from)), trackballPoint(to));
  });
});

describe("sphereToZ — stereographic projection (JS mirror of the GLSL)", () => {
  it("south pole → 0, equator → |z| = 1, and the modulus blows up toward the north pole", () => {
    close3([...sphereToZ([0, 0, -1]), 0], [0, 0, 0]); // south pole is the finite origin
    const eq = sphereToZ([1, 0, 0]); // equator point
    expect(Math.hypot(eq[0], eq[1])).toBeCloseTo(1, 6);
    // A unit-sphere point just shy of the north pole: |z| = √((1+Z)/(1−Z)) grows large but stays finite.
    const Zc = 1 - 1e-6;
    const near = sphereToZ([Math.sqrt(1 - Zc * Zc), 0, Zc]);
    expect(Number.isFinite(near[0])).toBe(true);
    expect(Math.hypot(near[0], near[1])).toBeGreaterThan(1000); // ≈ √(2·10⁶) ≈ 1414
  });

  it("clamps a non-unit / overflow input so single precision stays finite (the ∞ guard)", () => {
    // The 1e-6 denominator floor already caps a real unit point at |z| ≈ 1414; the |z|-clamp is a guard
    // against a degenerate GPU hit (a near-miss normalized oddly, a NaN) — here an off-sphere point.
    const clamped = sphereToZ([1e10, 0, 0]);
    expect(Number.isFinite(clamped[0])).toBe(true);
    expect(Math.hypot(clamped[0], clamped[1])).toBeCloseTo(1e8, -1);
  });

  it("matches the closed form z = (x + iy)/(1 − Z) away from the pole", () => {
    const p: Vec3 = [0.3, -0.4, 0.5];
    const d = 1 - p[2];
    close3([...sphereToZ(p), 0], [p[0] / d, p[1] / d, 0]);
  });
});

describe("worldHitToZ — a world ray hit → the z it projects to", () => {
  it("under the default orientation the camera-facing point (+Z) is the finite origin z = 0", () => {
    // DEFAULT_ROTATION faces the south pole at the camera, so the nearest world point maps to 0.
    close3([...worldHitToZ(DEFAULT_ROTATION, [0, 0, 1]), 0], [0, 0, 0]);
  });

  it("agrees with sphereToZ after undoing the orientation", () => {
    const rot = quatNormalize(quatFromAxisAngle([1, 0.5, -0.3], 1.7));
    const hitWorld: Vec3 = rotateVec3(rot, [0.2, -0.5, Math.sqrt(1 - 0.04 - 0.25)]);
    const viaHelper = worldHitToZ(rot, hitWorld);
    const viaModel = sphereToZ(applyMat3(worldToModel(rot), hitWorld));
    close3([...viaHelper, 0], [...viaModel, 0]);
  });
});

describe("dolly bounds", () => {
  it("keep the camera outside the unit sphere and ordered", () => {
    expect(SPHERE_DIST_MIN).toBeGreaterThan(1); // outside the unit sphere
    expect(SPHERE_DIST_DEFAULT).toBeGreaterThan(SPHERE_DIST_MIN);
    expect(SPHERE_DIST_MAX).toBeGreaterThan(SPHERE_DIST_DEFAULT);
  });
});

describe("buildSphereFragment — the ray-cast sphere GLSL assembly", () => {
  const fragment = buildSphereFragment(compileF(parse("z^2")));

  it("ray-casts the sphere, projects, and colours it with the shared colorAt", () => {
    expect(fragment).toContain("cvec fFn(cvec z, cvec c)"); // the compiled map
    expect(fragment).toContain("cvec sphereToZ(vec3 p)"); // stereographic projection
    expect(fragment).toContain("vec3 colorAt(cvec w)"); // the same colouring core as the 2D portrait
    expect(fragment).toContain("uniform mat3  uWorldToModel;"); // the drag orientation (inverse)
    expect(fragment).toContain("fFn(sphereToZ(hitM)"); // evaluate f at the projected hit
  });

  it("keeps control flow uniform (masked miss, normalized hit) so colorAt's fwidth stays defined", () => {
    expect(fragment).toContain("float hitMask = step(0.0, disc) * step(0.0, t);");
    expect(fragment).toContain("normalize(eye + dir * max(t, 1e-3))"); // a miss can't NaN
    expect(fragment).not.toContain("return;"); // no early-out branch
  });

  it("pins highp int (colorAt carries int mode uniforms) in the fragment", () => {
    expect(fragment).toContain("precision highp int;");
  });

  it("the GLSL sphereToZ mirrors the JS: south pole is ∞, clamped finite", () => {
    expect(SPHERE_TO_Z_GLSL).toContain("1.0 - p.z"); // 1 − Z denominator
    expect(SPHERE_TO_Z_GLSL).toContain("1e8"); // the |z| clamp near ∞
  });

  it("declares each live parameter as a uParam_<name> uniform", () => {
    const withParams = buildSphereFragment(
      compileF(parse("a*z"), "fFn", { params: ["a"] }),
      ["a"],
    );
    expect(withParams).toContain("uniform vec2 uParam_a;");
    expect(fragment).not.toContain("uParam_"); // a parameter-free map declares none
  });
});
