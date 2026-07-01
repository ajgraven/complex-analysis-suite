/**
 * sphereView.ts — geometry + orbit-camera math for the live 3D Riemann-sphere render mode.
 *
 * The extended complex plane ℂ∪{∞} is the Riemann sphere via stereographic projection from the
 * north pole N = (0,0,1): a sphere point P = (x,y,Z) ↦ w = (x + iy)/(1 − Z), so the south pole
 * S = (0,0,−1) ↦ 0, the equator (Z = 0) ↦ |w| = 1, and N ↦ ∞. The live sphere is rendered by
 * ray-casting an ANALYTIC unit sphere per pixel (no mesh): a camera ray hits the front surface at a
 * point P, and the fragment is coloured by the escape-time of z = w(P) — the same iteration the flat
 * plane uses, only the source coordinate differs. This module is the single source of truth for that
 * geometry, mirrored exactly by the GLSL in shaderBuilder so the picture and the cursor agree.
 *
 * Camera model: a FIXED perspective camera on the +Z axis looking at the origin; the user's drag
 * accumulates a rotation quaternion that orients the sphere. Ray-casting stays trivial (canonical
 * sphere, fixed camera) — the orientation is applied by mapping each world hit point back into the
 * sphere's own frame (`worldToModel`) before projecting. Lighting uses the world-space normal, so the
 * fractal texture spins under fixed illumination. Pure module — no DOM / GL; single precision only
 * (the sphere is a whole-plane overview, never a deep-zoom surface). See the riemann-sphere-live plan.
 */
import type { Complex } from "../complex";
import type { Vec2 } from "../arrays";

export type Vec3 = [number, number, number];
/** Quaternion as [x, y, z, w] (vector part first, scalar last). */
export type Quat = [number, number, number, number];

// --- tiny 3-vector helpers (internal) ---------------------------------------
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len3 = (a: Vec3): number => Math.sqrt(dot3(a, a));
const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// --- stereographic projection ----------------------------------------------

/**
 * A complex number w ↦ the unit-sphere point it corresponds to under stereographic projection from
 * the north pole. w = 0 → south pole (0,0,−1); |w| = 1 → the equator (Z = 0); |w| → ∞ → the north
 * pole (0,0,1). The result is always a unit vector.
 */
export function stereographicInverse(w: Complex): Vec3 {
  const [u, v] = w;
  const r2 = u * u + v * v;
  const d = 1 + r2;
  return [(2 * u) / d, (2 * v) / d, (r2 - 1) / d];
}

/**
 * A unit-sphere point P = (x,y,Z) ↦ the complex number w = (x + iy)/(1 − Z) it projects to. Near the
 * north pole (Z → 1) the denominator → 0, so |w| → ∞; the denominator is floored to a tiny positive
 * value so the result stays finite (the caller clamps huge |z| before iterating).
 */
export function stereographic(p: Vec3): Complex {
  const d = Math.max(1 - p[2], 1e-15);
  return [p[0] / d, p[1] / d];
}

// --- quaternions ------------------------------------------------------------

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

/** Unit quaternion for a rotation by `angle` (radians) about the given (unit) `axis`. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/** Quaternion product a·b (apply b first, then a). */
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

/** The conjugate (inverse, for a unit quaternion): negate the vector part. */
export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Re-normalise a quaternion to unit length (accumulated drags drift otherwise). */
export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotate a 3-vector by a unit quaternion: v' = q·v·q⁻¹. */
export function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = scale3(cross3(u, v), 2);
  return add3(add3(v, scale3(t, q[3])), cross3(u, t));
}

/**
 * A unit quaternion → its 3×3 rotation matrix, COLUMN-MAJOR (9 numbers), ready to hand to a GLSL
 * `mat3` uniform. Built by rotating the three basis vectors, so it is identical to {@link rotateVec3}
 * by construction.
 */
export function quatToMat3(q: Quat): number[] {
  const cx = rotateVec3(q, [1, 0, 0]);
  const cy = rotateVec3(q, [0, 1, 0]);
  const cz = rotateVec3(q, [0, 0, 1]);
  return [...cx, ...cy, ...cz]; // columns c0, c1, c2
}

/** Apply a column-major 3×3 matrix (as from {@link quatToMat3}) to a 3-vector. */
function applyMat3(m: number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

// --- arcball (drag → rotation) ---------------------------------------------

/**
 * Map a normalised pointer position uv ∈ [0,1]² to a point on the virtual trackball: inside the unit
 * disk it lies on the front hemisphere (z = √(1−r²)); outside, it is projected to the rim (z = 0).
 * Screen y is flipped so +y is up, matching the camera's up vector.
 */
export function trackballPoint(uv: Vec2): Vec3 {
  const x = 2 * uv[0] - 1;
  const y = 1 - 2 * uv[1];
  const d2 = x * x + y * y;
  if (d2 <= 1) return [x, y, Math.sqrt(1 - d2)];
  const inv = 1 / Math.sqrt(d2);
  return [x * inv, y * inv, 0];
}

/**
 * The incremental rotation to apply when the pointer drags from `prevUv` to `uv`: the rotation taking
 * one trackball point to the other (axis = their cross product, angle = the angle between them).
 * Returns identity for a null drag. The delta lives in world/screen space, so accumulate it by
 * PRE-multiplying the sphere's orientation: `rot ← quatMultiply(delta, rot)`.
 */
export function arcballDelta(prevUv: Vec2, uv: Vec2): Quat {
  const a = trackballPoint(prevUv);
  const b = trackballPoint(uv);
  const axis = cross3(a, b);
  const s = len3(axis);
  if (s < 1e-9) return QUAT_IDENTITY;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot3(a, b))));
  return quatFromAxisAngle(scale3(axis, 1 / s), angle);
}

// --- orbit camera + ray-cast ------------------------------------------------

/** Camera + orientation resolved into the primitives the ray-cast (and its GLSL mirror) needs. */
export interface SphereCamera {
  eye: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  tanHalfFov: number;
  aspect: number;
  /** Column-major mat3 mapping a world-space hit point into the sphere's own frame. */
  worldToModel: number[];
}

export const DEFAULT_DISTANCE = 3;
export const DEFAULT_FOV = (50 * Math.PI) / 180;
export const DOLLY_MIN = 1.05; // stay outside the unit sphere
export const DOLLY_MAX = 8;
/** Default orientation: 180° about X so the south pole (z = 0, the filled set) faces the viewer. */
export const DEFAULT_ROTATION: Quat = quatFromAxisAngle([1, 0, 0], Math.PI);

/** Clamp a dolly distance to keep the camera outside the sphere and within a sensible range. */
export function clampDistance(d: number): number {
  return Math.min(DOLLY_MAX, Math.max(DOLLY_MIN, d));
}

/**
 * Build the ray-cast camera for a given orientation `rot`, dolly `distance`, vertical `fov` (radians)
 * and viewport `aspect` (width / height). The camera is fixed on +Z looking at the origin; `rot`
 * orients the sphere, captured as the inverse rotation `worldToModel` applied to hit points.
 */
export function makeSphereCamera(
  rot: Quat,
  distance = DEFAULT_DISTANCE,
  fov = DEFAULT_FOV,
  aspect = 1,
): SphereCamera {
  const q = quatNormalize(rot);
  return {
    eye: [0, 0, distance],
    forward: [0, 0, -1],
    right: [1, 0, 0],
    up: [0, 1, 0],
    tanHalfFov: Math.tan(fov / 2),
    aspect,
    worldToModel: quatToMat3(quatConjugate(q)),
  };
}

/** The world-space ray (origin + unit direction) through a normalised pixel uv ∈ [0,1]². */
function sphereRay(uv: Vec2, cam: SphereCamera): { origin: Vec3; dir: Vec3 } {
  const nx = (2 * uv[0] - 1) * cam.aspect * cam.tanHalfFov;
  const ny = (1 - 2 * uv[1]) * cam.tanHalfFov; // flip y so +y is up
  const dir = norm3(add3(cam.forward, add3(scale3(cam.right, nx), scale3(cam.up, ny))));
  return { origin: cam.eye, dir };
}

/** Nearest front-facing intersection parameter t of a ray with the unit sphere, or null (a miss). */
function intersectUnitSphere(origin: Vec3, dir: Vec3): number | null {
  const b = 2 * dot3(origin, dir); // a = dir·dir = 1 (unit dir)
  const c = dot3(origin, origin) - 1;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / 2;
  return t >= 0 ? t : null;
}

/**
 * Ray-cast a pixel uv ∈ [0,1]² to the sphere point (in the SPHERE's frame) it shows, or null if the
 * ray misses the sphere silhouette. The world hit point is mapped back through `worldToModel` so the
 * result can be projected with {@link stereographic} directly.
 */
export function screenToSpherePoint(uv: Vec2, cam: SphereCamera): Vec3 | null {
  const { origin, dir } = sphereRay(uv, cam);
  const t = intersectUnitSphere(origin, dir);
  if (t === null) return null;
  const pw = add3(origin, scale3(dir, t)); // world hit (unit)
  return applyMat3(cam.worldToModel, pw);
}

/**
 * Ray-cast a pixel to the complex coordinate z the sphere shows there, or null off the silhouette —
 * the value fed to click-to-inspect (z on the dynamical plane, c on the parameter plane).
 */
export function screenToPlane(uv: Vec2, cam: SphereCamera): Complex | null {
  const p = screenToSpherePoint(uv, cam);
  return p ? stereographic(p) : null;
}
