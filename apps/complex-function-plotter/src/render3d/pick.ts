/**
 * Cursor pick for the analytic-landscape surface (catalog H1, the value inspector). Given the render
 * camera and a cursor in NDC, ray-march against the height field `z = heightFn(re, im)` and return the
 * domain point (re, im) of the nearest visible surface hit — so a hover reads the point actually under
 * the cursor ON the surface (height + self-occlusion accounted for), not its shadow on the base plane.
 * Pure geometry — no DOM / GL; the height field is supplied as a callback (the CPU `f` evaluator ∘ the
 * height law), so this is unit-testable and shared by 2D/3D. Perspective and the top-down ortho snap are
 * both handled; a hit outside the plotted domain rectangle (the cursor is off the surface) returns null.
 */
import type { Vec3 } from "./mat4.js";

const WORLD_UP: Vec3 = [0, 0, 1];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface PickCamera {
  eye: Vec3;
  /** Look-at point (the view centre on z = 0). */
  target: Vec3;
  /** Vertical field of view (radians) for the perspective ray. */
  fov: number;
  /** True for the top-down orthographic snap (parallel rays). */
  ortho: boolean;
  /** World half-height of the plotted domain (= the view span); half-width is this × aspect. */
  worldHalfHeight: number;
}

/**
 * Ray-march the cursor (NDC ∈ [−1, 1]², y up) against `z = heightFn(re, im)` and return the nearest
 * in-domain surface hit as `[re, im]`, or null if the ray never meets the surface inside the plotted
 * rectangle (the cursor is over empty scene). `heightFn` is evaluated once per march step.
 */
export function pickHeightField(
  cam: PickCamera,
  ndcX: number,
  ndcY: number,
  aspect: number,
  heightFn: (re: number, im: number) => number,
): [number, number] | null {
  const fwd = norm(sub(cam.target, cam.eye));
  let right = cross(fwd, WORLD_UP);
  // Looking straight down, fwd ∥ WORLD_UP so `right` degenerates; fall back to +X (re) — matching the
  // camera's own +Y-up fallback, which orients the top-down image re-right / im-up like the 2D portrait.
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0];
  right = norm(right);
  const up = norm(cross(right, fwd));

  const halfH = cam.worldHalfHeight;
  const halfW = halfH * aspect;
  let origin: Vec3;
  let dir: Vec3;
  if (cam.ortho) {
    // Parallel projection: every ray points along `fwd`; the origin slides across the image plane, then
    // steps back up `fwd` so the march starts above the field.
    const onPlane = add(cam.target, add(mul(right, ndcX * halfW), mul(up, ndcY * halfH)));
    origin = sub(onPlane, mul(fwd, halfH * 4));
    dir = fwd;
  } else {
    origin = cam.eye;
    const t = Math.tan(cam.fov / 2);
    dir = norm(add(fwd, add(mul(right, ndcX * t * aspect), mul(up, ndcY * t))));
  }

  const eyeToTarget = Math.hypot(
    cam.target[0] - origin[0],
    cam.target[1] - origin[1],
    cam.target[2] - origin[2],
  );
  const tMax = eyeToTarget + 4 * halfH + 10; // march past the far side of the domain + its tallest spikes
  const STEPS = 160;
  const margin = 1.02;
  const inDomain = (re: number, im: number): boolean =>
    Math.abs(re - cam.target[0]) <= halfW * margin && Math.abs(im - cam.target[1]) <= halfH * margin;

  // g(t) = ray height − surface height. A descending crossing (+ → ≤0) is a surface hit; take the first
  // one whose domain point lies inside the plotted rectangle (earlier crossings over the extrapolated
  // field beyond the mesh edge are not really on screen).
  let prevT = 0;
  let prevG = origin[2] - heightFn(origin[0], origin[1]);
  for (let i = 1; i <= STEPS; i++) {
    const tt = (tMax * i) / STEPS;
    const p = add(origin, mul(dir, tt));
    const g = p[2] - heightFn(p[0], p[1]);
    if (prevG > 0 && g <= 0) {
      let lo = prevT;
      let hi = tt;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        const pm = add(origin, mul(dir, mid));
        if (pm[2] - heightFn(pm[0], pm[1]) > 0) lo = mid;
        else hi = mid;
      }
      const ph = add(origin, mul(dir, (lo + hi) / 2));
      if (inDomain(ph[0], ph[1])) return [ph[0], ph[1]];
    }
    prevT = tt;
    prevG = g;
  }
  return null;
}
