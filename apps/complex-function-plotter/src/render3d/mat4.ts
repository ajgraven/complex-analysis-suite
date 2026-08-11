/**
 * The app-local 4×4 matrix + 3-vector kit for the Phase-5 3D views (the analytic landscape and, later,
 * the Riemann sphere). Column-major (`m[col * 4 + row]`), so a `Mat4` passes straight to
 * `gl.uniformMatrix4fv(loc, false, m)`. Ported to TypeScript from the Quadrature-Domains app's
 * `sphere-common.mjs` kit (apps can't import each other — one dependency direction — so the plotter
 * keeps its own typed copy; a third consumer is the signal to write the extraction ADR, deferred to the
 * end of Phase 5). `ortho` and `transformPoint` are new here (the landscape's top-down = 2D match needs
 * an orthographic projection; `transformPoint` makes the projection unit-testable). Pure — no DOM / GL.
 */

/** A 4×4 matrix in column-major order (16 numbers): the first four are column 0, etc. */
export type Mat4 = number[];
/** A 3-vector `[x, y, z]`. */
export type Vec3 = [number, number, number];

// --- 3-vector helpers ----------------------------------------------------------------------------
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length3 = (a: Vec3): number => Math.sqrt(dot3(a, a));
export const normalize3 = (a: Vec3): Vec3 => {
  const l = length3(a);
  return l < 1e-300 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l];
};

// --- matrices ------------------------------------------------------------------------------------

/** The 4×4 identity. */
export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** The product `a · b` (both column-major), i.e. the transform that applies `b` then `a`. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = s;
    }
  }
  return out;
}

/**
 * A right-handed view matrix looking from `eye` at `target` with the given `up`. The camera looks down
 * its local −Z; `up` is re-orthogonalised, so it only needs to be non-parallel to the view direction.
 */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const f = normalize3(sub3(target, eye)); // forward
  const s = normalize3(cross3(f, up)); // right
  const u = cross3(s, f); // true up
  return [
    s[0],
    u[0],
    -f[0],
    0,
    s[1],
    u[1],
    -f[1],
    0,
    s[2],
    u[2],
    -f[2],
    0,
    -dot3(s, eye),
    -dot3(u, eye),
    dot3(f, eye),
    1,
  ];
}

/** A symmetric perspective projection. `fovY` in radians; `aspect` = width / height. */
export function perspective(
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const rangeInv = 1 / (near - far);
  return [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (near + far) * rangeInv,
    -1,
    0,
    0,
    2 * near * far * rangeInv,
    0,
  ];
}

/**
 * A symmetric orthographic projection of the box `[−halfW, halfW] × [−halfH, halfH] × [−near..far]`
 * onto the clip cube. Depth maps to NDC z in the usual right-handed way. Used for the landscape's
 * **top-down = 2D portrait** view: with `halfH` = the 2D view's world half-height and `halfW` =
 * `halfH · aspect`, a straight-down ortho camera projects world `(re, im)` to the same screen point the
 * flat shader draws, so the two views line up pixel-for-pixel.
 */
export function ortho(halfW: number, halfH: number, near: number, far: number): Mat4 {
  return [
    1 / halfW,
    0,
    0,
    0,
    0,
    1 / halfH,
    0,
    0,
    0,
    0,
    -2 / (far - near),
    0,
    0,
    0,
    -(far + near) / (far - near),
    1,
  ];
}

/**
 * Apply `m` to the point `p` (as `(p, 1)`), then do the perspective divide — the full model-view-
 * projection of a world point down to normalized device coordinates. Only a near-zero `w` (|w| < 1e-30)
 * is floored to avoid a divide-by-zero; any other `w`, including a normal behind-the-camera `w < 0`,
 * divides as usual. Enough for the unit tests, which only probe in-front points.
 */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  const iw = 1 / (Math.abs(w) < 1e-30 ? 1e-30 : w);
  return [x * iw, y * iw, z * iw];
}
