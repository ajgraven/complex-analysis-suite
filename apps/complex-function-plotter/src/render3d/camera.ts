/**
 * The orbit camera for the Phase-5 analytic-landscape view (catalog F5). The surface lives in a **Z-up**
 * world — world `(X, Y, Z) = (re, im, height)` — so the height axis is the vertical, and looking straight
 * down projects `(re, im)` to the screen exactly as the flat 2D shader does (the **top-down = 2D
 * portrait** gate). The camera orbits the target by an `azimuth` (longitude about +Z) and `elevation`
 * (latitude up from the plane), at a dolly `distance`, with a perspective or orthographic projection.
 * Pure — no DOM / GL; the renderer reads the matrices and drives the drag.
 */
import { type Mat4, type Vec3, lookAt, perspective, ortho, multiply } from "./mat4.js";

export interface OrbitCamera {
  /** Longitude about the +Z (height) axis, radians. */
  azimuth: number;
  /** Latitude up from the (re, im) plane toward +Z, radians. `π/2` is straight above the target. */
  elevation: number;
  /** Eye distance from `target` (dolly). */
  distance: number;
  /** Look-at point in world space — typically `[cx, cy, 0]`, the centre of the viewed region. */
  target: Vec3;
  /** Vertical field of view (radians) for the perspective projection. */
  fov: number;
  /** Orthographic projection (true) vs. perspective (false). */
  ortho: boolean;
}

const DEG = Math.PI / 180;
const WORLD_UP: Vec3 = [0, 0, 1];

/** A pleasant three-quarter opening view of the landscape. */
export const DEFAULT_CAMERA: OrbitCamera = {
  azimuth: -60 * DEG,
  elevation: 30 * DEG,
  distance: 4.2,
  target: [0, 0, 0],
  fov: 50 * DEG,
  ortho: false,
};

/** Drag-clamp bounds for elevation: kept just under straight-down so the orbit never rolls through the
 *  pole (the exact top-down look is the discrete {@link TOP_DOWN} snap, not something you drag into). */
export const ELEV_MIN = 3 * DEG;
export const ELEV_MAX = 89 * DEG;
export function clampElevation(e: number): number {
  return e < ELEV_MIN ? ELEV_MIN : e > ELEV_MAX ? ELEV_MAX : e;
}

/** The eye position for the given orbit angles (Z-up). At `elevation = π/2` the eye is directly above. */
export function cameraEye(cam: OrbitCamera): Vec3 {
  const ce = Math.cos(cam.elevation);
  const se = Math.sin(cam.elevation);
  return [
    cam.target[0] + cam.distance * ce * Math.cos(cam.azimuth),
    cam.target[1] + cam.distance * ce * Math.sin(cam.azimuth),
    cam.target[2] + cam.distance * se,
  ];
}

/**
 * The view matrix. World up is +Z (the height axis); looking straight down (`elevation → π/2`) it is
 * parallel to the view direction, so there the up falls back to +Y — which orients the top-down image
 * with **im up and re right**, matching the 2D portrait. Dragging is clamped below that (see
 * {@link ELEV_MAX}), so the fallback only ever kicks in for the exact {@link TOP_DOWN} snap.
 */
export function viewMatrix(cam: OrbitCamera): Mat4 {
  const up: Vec3 = cam.elevation > Math.PI / 2 - 1e-3 ? [0, 1, 0] : WORLD_UP;
  return lookAt(cameraEye(cam), cam.target, up);
}

/**
 * The projection matrix. `worldHalfHeight` sizes the orthographic box, so a top-down ortho view with
 * `worldHalfHeight` = the 2D view's span (and `aspect` = width / height) matches the flat portrait;
 * near/far bracket a scene of radius ≈ `distance`.
 */
export function projectionMatrix(
  cam: OrbitCamera,
  aspect: number,
  worldHalfHeight: number,
): Mat4 {
  const far = cam.distance + worldHalfHeight * 4 + 10;
  if (cam.ortho) return ortho(worldHalfHeight * aspect, worldHalfHeight, -far, far);
  const near = Math.max(0.01, cam.distance * 0.05);
  return perspective(cam.fov, aspect, near, far);
}

/** `proj · view` — the full view-projection to hand a vertex shader as one `mat4` uniform. */
export function viewProjection(
  cam: OrbitCamera,
  aspect: number,
  worldHalfHeight: number,
): Mat4 {
  return multiply(projectionMatrix(cam, aspect, worldHalfHeight), viewMatrix(cam));
}

/**
 * World distance per screen pixel in the (re, im) target plane, for the span-framed landscape camera
 * (§B — see `Plot.surfaceCamera`). The perspective eye distance tracks the view span, so the on-screen
 * scale is `2·span·framing / viewportHeightPx`; the top-down orthographic snap sizes its box from span
 * directly (`framing` → 1). A click-drag pan multiplies its pixel delta by this, so it is **span-coupled**:
 * the domain moves by the same on-screen amount at every zoom. (A fixed world-per-pixel — e.g. one built
 * from the constant orbit-dolly distance — makes a deep zoom pan far too fast.) Returns 0 for a degenerate
 * viewport or span (a no-op pan).
 */
export function landscapeWorldPerPixel(
  span: number,
  viewportHeightPx: number,
  ortho: boolean,
  framing: number,
): number {
  if (!(viewportHeightPx > 0) || !(span > 0)) return 0;
  return (2 * span * (ortho ? 1 : framing)) / viewportHeightPx;
}

/** The orbit settings for the exact top-down orthographic view: straight down (`elevation = π/2`) with
 *  the orthographic projection on, so the landscape's top-down equals the 2D portrait. Merge onto a
 *  camera (`{ ...cam, ...TOP_DOWN }`) — applied directly, bypassing {@link clampElevation}. */
export const TOP_DOWN: Pick<OrbitCamera, "elevation" | "ortho"> = {
  elevation: Math.PI / 2,
  ortho: true,
};
