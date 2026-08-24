/**
 * The multi-sheet hover-pick for the Riemann view (M3.1, ADR-0029). The 3D-landscape pick
 * (`render3d/pick.ts`) ray-marches a **single-valued** height field `z = h(re, im)`; a Riemann surface
 * stacks sheets over the same base point, so that pick cannot see the sheet the eye actually touches. This
 * module ray-casts the **drawn triangles** instead, so a hover reads the front-most sheet under the cursor.
 *
 * One uniform {@link PickMesh} serves BOTH render paths (the M1 parametric grid and the M2 baked curve): each
 * vertex carries its world `xy = (Re z, Im z)`, its value `w` (colour + readout), and a **height basis** `hb`
 * — the uniformizer `t` for the parametric path, the value `w` for the curve path. The world height of a
 * vertex is `(heightSource == Im ? hb.im : hb.re) · heightScale`, EXACTLY the shader's law
 * (`render3d/riemannSurface.ts`: the parametric program lifts by `t`, the curve program lifts by `w`), so the
 * pick agrees with the picture and needs no rebuild when the height axis / exaggeration changes.
 *
 * {@link pickRiemannSurface} does two things: (1) a Möller–Trumbore ray-cast (double-sided — the projected
 * sheets face both ways) keeps the **nearest** hit and barycentric-interpolates `z` and `w` there; (2) a
 * point-in-triangle **sheet census** at that `z` collects the value on every sheet lying over it, giving `N`
 * distinct sheets and the hovered sheet's **local ordinal** `k` (rank by `arg`, then `|·|`). `k / N` is a
 * well-defined, exactly-computable-from-the-mesh quantity at a point; it is deliberately NOT a global sheet
 * number (monodromy — M3.3 — is what permutes those). Everything is resolution-limited, hence `≈`. Pure: no
 * DOM / GL, so it is unit-tested headless and shared by every Riemann path.
 */
import type { Complex } from "@cas/expr/complex";
import type { Vec3 } from "../render3d/mat4.js";

/** A CPU triangle soup of the drawn Riemann surface — 3 vertices per triangle, flat arrays. */
export interface PickMesh {
  /** 2 floats per vertex: world `(Re z, Im z)` — the base-plane position (also the readout `z`). */
  xy: Float32Array;
  /** 2 floats per vertex: the value `w` (colour + the readout `w`). */
  w: Float32Array;
  /** 2 floats per vertex: the **height basis** — the uniformizer `t` (parametric) or `w` (curve). */
  hb: Float32Array;
  /** Number of triangles (= `xy.length / 6`). */
  triangleCount: number;
}

/** A world-space ray (the camera eye + a normalized direction through the cursor). */
export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

/** The result of a hover pick: the on-surface point + the local sheet census over its base point. */
export interface RiemannHit {
  /** The base-plane point `(Re z, Im z)` under the cursor, on the front-most sheet. */
  z: Complex;
  /** The value `w` on that sheet (barycentric-interpolated). */
  w: Complex;
  /** How many distinct sheets lie over `z` in the drawn mesh (drops to 1 at a branch point — honestly). */
  sheetCount: number;
  /** 1-based ordinal of the hovered sheet among those `N`, by a local (arg, |·|) ordering. */
  sheetIndex: number;
}

// --- tiny vec3 kit (kept local so the module is DOM/GL-free and self-contained, like render3d/pick.ts) ---
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The world height of a vertex: `(Im-source ? hb.im : hb.re) · heightScale`, matching the shader. */
function vertexHeight(hbRe: number, hbIm: number, heightSource: number, heightScale: number): number {
  return (heightSource === 1 ? hbIm : hbRe) * heightScale;
}

const RAY_EPS = 1e-9;

/**
 * Möller–Trumbore ray/triangle intersection, **double-sided** (a projected sheet faces both ways). Returns
 * the ray parameter `t > 0` of the hit and its barycentric weights `(b0, b1, b2)` for `(v0, v1, v2)`, or null
 * (miss / behind / parallel).
 */
function rayTriangle(
  orig: Vec3,
  dir: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
): { t: number; b0: number; b1: number; b2: number } | null {
  const e1 = sub(v1, v0);
  const e2 = sub(v2, v0);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < RAY_EPS) return null; // ray parallel to the triangle
  const inv = 1 / det;
  const tvec = sub(orig, v0);
  const u = dot(tvec, p) * inv;
  if (u < -RAY_EPS || u > 1 + RAY_EPS) return null;
  const q = cross(tvec, e1);
  const v = dot(dir, q) * inv;
  if (v < -RAY_EPS || u + v > 1 + RAY_EPS) return null;
  const t = dot(e2, q) * inv;
  if (t <= RAY_EPS) return null; // behind the eye
  return { t, b0: 1 - u - v, b1: u, b2: v };
}

/** Barycentric weights of `(px, py)` in triangle `(a, b, c)` (each `[x, y]`), or null if outside/degenerate. */
function bary2d(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): [number, number, number] | null {
  const v0x = bx - ax;
  const v0y = by - ay;
  const v1x = cx - ax;
  const v1y = cy - ay;
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-30) return null; // degenerate (zero-area) triangle
  const v2x = px - ax;
  const v2y = py - ay;
  const wb = (v2x * v1y - v1x * v2y) / den;
  const wc = (v0x * v2y - v2x * v0y) / den;
  const wa = 1 - wb - wc;
  const tol = 1e-6;
  if (wa < -tol || wb < -tol || wc < -tol) return null;
  return [wa, wb, wc];
}

/** Sort key: ascending `arg`, then ascending `|·|` — a stable local ordering of the sheet values over a `z`. */
function sheetLess(a: Complex, b: Complex): number {
  const aa = Math.atan2(a[1], a[0]);
  const ab = Math.atan2(b[1], b[0]);
  if (Math.abs(aa - ab) > 1e-9) return aa - ab;
  return Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]);
}

/**
 * Census the distinct sheet values lying over base point `z` in `mesh`: interpolate `w` in every triangle
 * whose xy-projection contains `z`, cluster near-equal values, and return them in the stable local order.
 * Also the parametric-path sheet enumerator for the monodromy explorer (M3.3).
 */
export function sheetsOverZ(mesh: PickMesh, zx: number, zy: number): Complex[] {
  const { xy, w, triangleCount } = mesh;
  const raw: Complex[] = [];
  for (let tri = 0; tri < triangleCount; tri++) {
    const o = tri * 6;
    const bc = bary2d(
      zx,
      zy,
      xy[o],
      xy[o + 1],
      xy[o + 2],
      xy[o + 3],
      xy[o + 4],
      xy[o + 5],
    );
    if (!bc) continue;
    const [wa, wb, wc] = bc;
    raw.push([
      wa * w[o] + wb * w[o + 2] + wc * w[o + 4],
      wa * w[o + 1] + wb * w[o + 3] + wc * w[o + 5],
    ]);
  }
  if (raw.length === 0) return [];
  // Cluster: two values are the same sheet if closer than a scale-relative tolerance (sheets that have
  // genuinely merged at a branch point collapse to one — the honest count there).
  let maxAbs = 0;
  for (const v of raw) maxAbs = Math.max(maxAbs, Math.hypot(v[0], v[1]));
  const tol = Math.max(1e-7, 1e-3 * maxAbs);
  raw.sort(sheetLess);
  const distinct: Complex[] = [];
  for (const v of raw) {
    const last = distinct[distinct.length - 1];
    if (!last || Math.hypot(v[0] - last[0], v[1] - last[1]) > tol) distinct.push(v);
  }
  return distinct;
}

/**
 * Ray-cast `mesh` and return the hover pick, or null if the ray misses the surface. `heightSource`
 * (0 = Re, 1 = Im) and `heightScale` reconstruct each vertex's world height from its height basis, matching
 * the shader — so the pick tracks the picture through a height-axis / exaggeration change with no rebuild.
 */
export function pickRiemannSurface(
  mesh: PickMesh,
  ray: Ray,
  heightSource: number,
  heightScale: number,
): RiemannHit | null {
  const { xy, w, hb, triangleCount } = mesh;
  if (triangleCount === 0) return null;
  let bestT = Infinity;
  let hit: { b0: number; b1: number; b2: number; o: number } | null = null;
  for (let tri = 0; tri < triangleCount; tri++) {
    const o = tri * 6;
    const h0 = vertexHeight(hb[o], hb[o + 1], heightSource, heightScale);
    const h1 = vertexHeight(hb[o + 2], hb[o + 3], heightSource, heightScale);
    const h2 = vertexHeight(hb[o + 4], hb[o + 5], heightSource, heightScale);
    const v0: Vec3 = [xy[o], xy[o + 1], h0];
    const v1: Vec3 = [xy[o + 2], xy[o + 3], h1];
    const v2: Vec3 = [xy[o + 4], xy[o + 5], h2];
    const r = rayTriangle(ray.origin, ray.dir, v0, v1, v2);
    if (r && r.t < bestT) {
      bestT = r.t;
      hit = { b0: r.b0, b1: r.b1, b2: r.b2, o };
    }
  }
  if (!hit) return null;
  const { b0, b1, b2, o } = hit;
  const zx = b0 * xy[o] + b1 * xy[o + 2] + b2 * xy[o + 4];
  const zy = b0 * xy[o + 1] + b1 * xy[o + 3] + b2 * xy[o + 5];
  const wx = b0 * w[o] + b1 * w[o + 2] + b2 * w[o + 4];
  const wy = b0 * w[o + 1] + b1 * w[o + 3] + b2 * w[o + 5];

  const sheets = sheetsOverZ(mesh, zx, zy);
  let sheetCount = sheets.length;
  let sheetIndex = 1;
  if (sheetCount === 0) {
    sheetCount = 1; // the hit triangle covers z, so this is a numerical corner case — report a lone sheet
  } else {
    let best = Infinity;
    for (let i = 0; i < sheets.length; i++) {
      const d = Math.hypot(sheets[i][0] - wx, sheets[i][1] - wy);
      if (d < best) {
        best = d;
        sheetIndex = i + 1;
      }
    }
  }
  return { z: [zx, zy], w: [wx, wy], sheetCount, sheetIndex };
}

/** A {@link PickMesh} view over a baked curve mesh (M2): `xy` = positions, `w` = `hb` = the sheet values. */
export function pickMeshFromCurve(positions: Float32Array, values: Float32Array): PickMesh {
  return { xy: positions, w: values, hb: values, triangleCount: positions.length / 6 };
}

/**
 * Sample the parametric (M1) surface into a {@link PickMesh} over its `t`-window: a `grid × grid` cell mesh
 * with `xy = z(t)`, `w = w(t)`, and `hb = t` (the height basis). Cells touching a non-finite or runaway
 * (`|z|` huge) sample are dropped, so poles/branch edges leave holes rather than absurd triangles — the same
 * spirit as the render mesh. `window` is the half-extent about the origin (`uTCenter` is always `(0,0)`).
 */
export function buildParamPickMesh(
  zFn: (t: Complex) => Complex,
  wFn: (t: Complex) => Complex,
  window: { halfX: number; halfY: number },
  grid = 64,
): PickMesh {
  const N = Math.max(2, Math.floor(grid));
  const { halfX, halfY } = window;
  const Z_CAP = 1e5; // drop runaway positions (pole/edge blow-ups) so the pick mesh stays sane
  interface PVert {
    zx: number;
    zy: number;
    wx: number;
    wy: number;
    tx: number;
    ty: number;
    ok: boolean;
  }
  const sampleAt = (tx: number, ty: number): PVert => {
    let z: Complex;
    let wv: Complex;
    try {
      z = zFn([tx, ty]);
      wv = wFn([tx, ty]);
    } catch {
      return { zx: 0, zy: 0, wx: 0, wy: 0, tx, ty, ok: false };
    }
    const ok =
      Number.isFinite(z[0]) &&
      Number.isFinite(z[1]) &&
      Number.isFinite(wv[0]) &&
      Number.isFinite(wv[1]) &&
      Math.hypot(z[0], z[1]) <= Z_CAP;
    return { zx: z[0], zy: z[1], wx: wv[0], wy: wv[1], tx, ty, ok };
  };

  const xyOut: number[] = [];
  const wOut: number[] = [];
  const hbOut: number[] = [];
  const push = (v: PVert): void => {
    xyOut.push(v.zx, v.zy);
    wOut.push(v.wx, v.wy);
    hbOut.push(v.tx, v.ty);
  };
  const emitTri = (a: PVert, b: PVert, c: PVert): void => {
    if (!a.ok || !b.ok || !c.ok) return;
    push(a);
    push(b);
    push(c);
  };

  // Row cache: reuse the lower row's samples as the next row's upper corners.
  const rowAt = (j: number): PVert[] => {
    const ty = -halfY + (2 * halfY * j) / N;
    const row: PVert[] = [];
    for (let i = 0; i <= N; i++) row.push(sampleAt(-halfX + (2 * halfX * i) / N, ty));
    return row;
  };
  let lower = rowAt(0);
  for (let j = 0; j < N; j++) {
    const upper = rowAt(j + 1);
    for (let i = 0; i < N; i++) {
      // Cell corners A=bottom-left, B=bottom-right, C=top-left, D=top-right; triangles (A,C,B),(B,C,D).
      emitTri(lower[i], upper[i], lower[i + 1]);
      emitTri(lower[i + 1], upper[i], upper[i + 1]);
    }
    lower = upper;
  }
  return {
    xy: new Float32Array(xyOut),
    w: new Float32Array(wOut),
    hb: new Float32Array(hbOut),
    triangleCount: xyOut.length / 6,
  };
}
