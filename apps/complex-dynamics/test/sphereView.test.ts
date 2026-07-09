import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import {
  DEFAULT_DISTANCE,
  DEFAULT_FOV,
  DEFAULT_ROTATION,
  QUAT_IDENTITY,
  type Quat,
  type Vec3,
  arcballDelta,
  makeSphereCamera,
  quatConjugate,
  quatFromAxisAngle,
  quatMultiply,
  quatToMat3,
  rotateVec3,
  screenToPlane,
  screenToSpherePoint,
  stereographic,
  stereographicInverse,
  trackballPoint,
} from "../src/render/sphereView";

const unit = (p: Vec3): number => Math.hypot(p[0], p[1], p[2]);
const closeV3 = (a: Vec3, b: Vec3, tol = 1e-9): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < tol;
const closeC = (a: Complex, b: Complex, tol = 1e-9): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

/** Apply a column-major mat3 (from quatToMat3) to a vector — the oracle for GLSL `mat3 * v`. */
const applyMat3 = (m: number[], v: Vec3): Vec3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];

describe("stereographic projection (N-pole; south = 0, equator = |w|=1, north = ∞)", () => {
  it("round-trips w → sphere → w for finite points", () => {
    for (const w of [[0, 0], [1, 0], [0, 1], [0.3, -0.7], [2.5, 1.1], [-4, 3]] as Complex[]) {
      expect(closeC(stereographic(stereographicInverse(w)), w)).toBe(true);
    }
  });

  it("maps the key points: 0 → south pole, |w|=1 → equator, |w|→∞ → north pole", () => {
    expect(closeV3(stereographicInverse([0, 0]), [0, 0, -1])).toBe(true);
    for (const w of [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2]] as Complex[]) {
      expect(stereographicInverse(w)[2]).toBeCloseTo(0, 12); // Z = 0 on the equator
    }
    const nearN = stereographicInverse([1e8, 0]);
    expect(closeV3(nearN, [0, 0, 1], 1e-6)).toBe(true);
  });

  it("always returns unit vectors", () => {
    for (const w of [[0, 0], [1, 0], [3, -2], [0.01, 0.02], [1e6, 1e6]] as Complex[]) {
      expect(unit(stereographicInverse(w))).toBeCloseTo(1, 12);
    }
  });

  it("stereographic of the south pole is 0; near the north pole it blows up", () => {
    expect(closeC(stereographic([0, 0, -1]), [0, 0])).toBe(true);
    const nearNorth = stereographicInverse([1e6, 0]); // a genuine sphere point close to N
    expect(Math.hypot(...stereographic(nearNorth))).toBeGreaterThan(1e5);
  });

  it("clamps |z| to 1e8 at the north pole, matching the GLSL mirror (shaderBuilder)", () => {
    // A sphere point pressed against N (1 − Z floored to 1e-15) projects to |z| ≈ 1e12; the CPU path
    // clamps it to 1e8 exactly as sphereRayZ does, so click-inspect ↔ render stay in agreement.
    const mag = Math.hypot(...stereographic([1e-3, 0, 1]));
    expect(mag).toBeGreaterThan(9e7);
    expect(mag).toBeLessThan(1.1e8); // clamped to ~1e8, not the raw ~1e12
  });
});

describe("quaternions", () => {
  it("identity rotates a vector to itself", () => {
    expect(closeV3(rotateVec3(QUAT_IDENTITY, [1, 2, 3]), [1, 2, 3])).toBe(true);
  });

  it("π/2 about +Z sends x̂ → ŷ", () => {
    const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    expect(closeV3(rotateVec3(q, [1, 0, 0]), [0, 1, 0])).toBe(true);
  });

  it("rotation preserves length", () => {
    const q = quatFromAxisAngle([1, 1, 1].map((x) => x / Math.sqrt(3)) as Vec3, 1.2);
    const v: Vec3 = [0.4, -1.3, 2.1];
    expect(unit(rotateVec3(q, v))).toBeCloseTo(unit(v), 12);
  });

  it("conjugate undoes a rotation", () => {
    const q = quatFromAxisAngle([0.6, 0.8, 0], 0.9);
    const v: Vec3 = [1, -2, 0.5];
    expect(closeV3(rotateVec3(quatConjugate(q), rotateVec3(q, v)), v)).toBe(true);
  });

  it("product composes rotations (apply b first, then a)", () => {
    const a = quatFromAxisAngle([0, 0, 1], 0.5);
    const b = quatFromAxisAngle([1, 0, 0], 0.7);
    const v: Vec3 = [0.2, 0.9, -0.4];
    expect(closeV3(rotateVec3(quatMultiply(a, b), v), rotateVec3(a, rotateVec3(b, v)))).toBe(true);
  });

  it("quatToMat3 (column-major) matches rotateVec3", () => {
    const q = quatFromAxisAngle([0.2, -0.5, 0.84], 1.4);
    const m = quatToMat3(q);
    for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.7, 0.5]] as Vec3[]) {
      expect(closeV3(applyMat3(m, v), rotateVec3(q, v))).toBe(true);
    }
  });
});

describe("arcball (drag → rotation)", () => {
  it("a null drag is the identity", () => {
    expect(arcballDelta([0.5, 0.5], [0.5, 0.5])).toEqual(QUAT_IDENTITY);
  });

  it("trackball centre is the pole facing the camera", () => {
    expect(closeV3(trackballPoint([0.5, 0.5]), [0, 0, 1])).toBe(true);
  });

  it("a horizontal drag rotates about the up (Y) axis", () => {
    const q = arcballDelta([0.5, 0.5], [0.7, 0.5]);
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 9); // unit quaternion
    expect(q[1]).toBeGreaterThan(0); // axis ≈ +Y
    expect(Math.abs(q[0])).toBeLessThan(1e-9);
    expect(Math.abs(q[2])).toBeLessThan(1e-9);
  });

  it("a vertical drag rotates about the right (X) axis", () => {
    const q = arcballDelta([0.5, 0.5], [0.5, 0.7]);
    expect(Math.abs(q[1])).toBeLessThan(1e-9);
    expect(Math.abs(q[2])).toBeLessThan(1e-9);
    expect(Math.abs(q[0])).toBeGreaterThan(0); // axis ≈ ±X
  });
});

describe("orbit camera + ray-cast", () => {
  const cam = makeSphereCamera(DEFAULT_ROTATION, DEFAULT_DISTANCE, DEFAULT_FOV, 1);

  it("screen centre shows z = 0 (south pole / filled set faces the viewer by default)", () => {
    const p = screenToSpherePoint([0.5, 0.5], cam) as Vec3;
    expect(p).not.toBeNull();
    expect(unit(p)).toBeCloseTo(1, 9);
    expect(closeC(screenToPlane([0.5, 0.5], cam) as Complex, [0, 0], 1e-9)).toBe(true);
  });

  it("returns null off the sphere silhouette", () => {
    expect(screenToSpherePoint([1.6, 1.6], cam)).toBeNull();
    expect(screenToPlane([1.6, 1.6], cam)).toBeNull();
  });

  it("rotating the camera moves which z faces the viewer, off the origin", () => {
    const rolled = makeSphereCamera(
      quatMultiply(arcballDelta([0.5, 0.5], [0.75, 0.5]), DEFAULT_ROTATION),
      DEFAULT_DISTANCE,
      DEFAULT_FOV,
      1,
    );
    const z = screenToPlane([0.5, 0.5], rolled) as Complex;
    expect(z).not.toBeNull();
    expect(Math.hypot(z[0], z[1])).toBeGreaterThan(1e-3); // no longer the south pole
  });
});

/** Guard: the four rotation constants stay unit-length as re-used across the app. */
describe("invariants", () => {
  it("DEFAULT_ROTATION is a unit quaternion", () => {
    const q: Quat = DEFAULT_ROTATION;
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 12);
  });
});
