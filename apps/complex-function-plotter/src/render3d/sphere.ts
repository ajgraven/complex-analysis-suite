/**
 * The Riemann-sphere kit (catalog F7): quaternion + arcball for the drag, and the stereographic map the
 * ray-cast shader uses, so the extended plane ℂ∪{∞} is shown as a literal sphere (the north pole is ∞).
 * Ported to the plotter from the Complex-Dynamics app's `sphereView.ts` (apps can't import each other —
 * a third consumer, with the QD/CD mat4 kits, is the trigger for the extraction ADR at the end of Phase 5).
 *
 * Convention: a unit-sphere point `P = (x, y, Z)` ↦ `z = (x + iy)/(1 − Z)`, so the **south** pole
 * `(0,0,−1)` ↦ `0`, the equator (`Z = 0`) ↦ `|z| = 1`, and the **north** pole `(0,0,1)` ↦ `∞`. The camera
 * is fixed on `+Z`; the user's drag accumulates a rotation quaternion that orients the sphere, applied to
 * each ray hit through `worldToModel` (the inverse rotation) before projecting — so the coloured texture
 * spins under fixed illumination. `sphereToZ` here is the JS mirror of the GLSL in `sphereShader.ts`
 * (the naive form, floored + clamped) — kept bit-for-bit so a future cursor pick agrees with the render.
 * Pure — no DOM / GL.
 */
import { type Vec3, add3, cross3, dot3, scale3, length3, normalize3 } from "./mat4.js";

/** A quaternion `[x, y, z, w]` (vector part first, scalar last). */
export type Quat = [number, number, number, number];

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

/** Unit quaternion for a rotation by `angle` (radians) about the unit `axis`. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/** Quaternion product `a·b` (apply `b` first, then `a`). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** The conjugate (inverse for a unit quaternion): negate the vector part. */
export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Re-normalise a quaternion to unit length (accumulated drags drift otherwise). */
export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotate a 3-vector by a unit quaternion: `v' = q·v·q⁻¹`. */
export function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = scale3(cross3(u, v), 2);
  return add3(add3(v, scale3(t, q[3])), cross3(u, t));
}

/** A unit quaternion → its 3×3 rotation matrix, **column-major** (9 numbers) for a GLSL `mat3` uniform.
 *  Built by rotating the three basis vectors, so it agrees with {@link rotateVec3} by construction. */
export function quatToMat3(q: Quat): number[] {
  const cx = rotateVec3(q, [1, 0, 0]);
  const cy = rotateVec3(q, [0, 1, 0]);
  const cz = rotateVec3(q, [0, 0, 1]);
  return [...cx, ...cy, ...cz]; // columns c0, c1, c2
}

/** The column-major `mat3` that maps a WORLD-space ray hit into the sphere's own frame (the inverse of
 *  the orientation `rot`) — the `uWorldToModel` uniform. */
export function worldToModel(rot: Quat): number[] {
  return quatToMat3(quatConjugate(quatNormalize(rot)));
}

// --- arcball (drag → rotation) ---------------------------------------------

/**
 * Map a normalised pointer position `uv ∈ [0,1]²` to a point on the virtual trackball: inside the unit
 * disk it lies on the front hemisphere (`z = √(1−r²)`); outside, it is projected to the rim (`z = 0`).
 * Screen `y` is flipped so `+y` is up.
 */
export function trackballPoint(uv: [number, number]): Vec3 {
  const x = 2 * uv[0] - 1;
  const y = 1 - 2 * uv[1];
  const d2 = x * x + y * y;
  if (d2 <= 1) return [x, y, Math.sqrt(1 - d2)];
  const inv = 1 / Math.sqrt(d2);
  return [x * inv, y * inv, 0];
}

/**
 * The incremental rotation to apply when the pointer drags from `prevUv` to `uv`: the rotation taking one
 * trackball point to the other. Identity for a null drag. The delta lives in world/screen space, so
 * accumulate it by **pre**-multiplying the orientation: `rot ← quatMultiply(delta, rot)`.
 */
export function arcballDelta(prevUv: [number, number], uv: [number, number]): Quat {
  const a = trackballPoint(prevUv);
  const b = trackballPoint(uv);
  const axis = cross3(a, b);
  const s = length3(axis);
  if (s < 1e-9) return QUAT_IDENTITY;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot3(a, b))));
  return quatFromAxisAngle(scale3(axis, 1 / s), angle);
}

/** Default orientation: 180° about X, so the **south** pole (`z = 0`, the finite origin) faces the
 *  viewer and ∞ sits at the back. */
export const DEFAULT_ROTATION: Quat = quatFromAxisAngle([1, 0, 0], Math.PI);

/** Camera dolly bounds (distance along +Z; must stay outside the unit sphere). */
export const SPHERE_DIST_MIN = 1.6;
export const SPHERE_DIST_MAX = 12;
export const SPHERE_DIST_DEFAULT = 3;

/**
 * The complex `z` a **model-frame** unit-sphere point projects to — the JS mirror of the GLSL `sphereToZ`
 * (the naive `xy/(1−Z)`, denominator floored and `|z|` clamped near the north pole so single precision
 * stays finite). Kept identical to the shader so a cursor pick agrees with the rendered pixel.
 */
export function sphereToZ(p: Vec3): [number, number] {
  const d = Math.max(1 - p[2], 1e-6);
  const z: [number, number] = [p[0] / d, p[1] / d];
  const az = Math.hypot(z[0], z[1]);
  if (az > 1e8) {
    z[0] *= 1e8 / az;
    z[1] *= 1e8 / az;
  }
  return z;
}

/** Convenience: rotate a world hit into the model frame (via `rot`) and project to `z`. Used for a
 *  cursor pick; `normalize3` guards a non-unit input. */
export function worldHitToZ(rot: Quat, hitWorld: Vec3): [number, number] {
  const m = quatToMat3(quatConjugate(quatNormalize(rot)));
  const h = normalize3(hitWorld);
  const model: Vec3 = [
    m[0] * h[0] + m[3] * h[1] + m[6] * h[2],
    m[1] * h[0] + m[4] * h[1] + m[7] * h[2],
    m[2] * h[0] + m[5] * h[1] + m[8] * h[2],
  ];
  return sphereToZ(model);
}
