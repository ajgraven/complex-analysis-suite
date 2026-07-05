/**
 * yoccozCritical.ts — the **critical piece** of a Yoccoz puzzle: the puzzle piece that contains the
 * critical point 0, computed as a rasterised region (a CPU flood fill), because inside the filled
 * Julia set the pieces are not angular sectors — the critical point sits deep in K, and its piece is
 * bounded by the rays landing at *every* pinch point around it.
 *
 * The depth-n critical piece is the connected component of {G < level} minus the puzzle-graph rays
 * that contains 0, where G is the escape potential and level = G₀/2ⁿ. We flood on an n×n grid over a
 * fixed plane box: a cell is a **wall** if G ≥ level (outside the equipotential) or if a ray polyline
 * passes through it. The rays are rasterised all the way to their landing cells (the pinch points of
 * K), and the flood is **4-connected**, so those barriered landing cells genuinely separate K's lobes
 * — otherwise the flood would leak through a pinch and merge pieces that should be distinct. As the
 * depth grows there are more rays → more pinch cuts → the critical piece nests down toward 0.
 */
import type { Vec2 } from "../arrays";

/** A rasterised critical-piece region over a plane box (1 = inside the piece), for the caller to draw. */
export interface CriticalMask {
  data: Uint8Array; // n·n, row-major with j = 0 at y0 (plane-bottom)
  n: number;
  box: [number, number, number, number]; // x0, y0, x1, y1
}

const ESCAPE_R2 = 1e12; // (10^6)^2
const MAX_ITER = 64; // ample: a cell at G ≈ level escapes in ~log2(log R / level) ≪ 64 steps

/** Smooth escape potential G = log|z_m|/2^m of the orbit z_{k+1} = z_k²+c from z₀, or 0 if bounded. */
function orbitPotential(x0: number, y0: number, cx: number, cy: number): number {
  let x = x0;
  let y = y0;
  for (let k = 0; k < MAX_ITER; k++) {
    const nx = x * x - y * y + cx;
    const ny = 2 * x * y + cy;
    x = nx;
    y = ny;
    const r2 = x * x + y * y;
    if (r2 > ESCAPE_R2) return Math.log(r2) / 2 / 2 ** (k + 1);
  }
  return 0;
}

/**
 * The potential at a grid point. On the **dynamical** plane it is the escape potential of z₀ = the
 * point under the fixed map z²+c (the Julia potential); on the **parameter** plane it is the potential
 * of the critical orbit z₀ = 0 under z²+(the point) (the Mandelbrot potential).
 */
function gridPotential(px: number, py: number, c: Vec2, paramPlane: boolean): number {
  return paramPlane ? orbitPotential(0, 0, px, py) : orbitPotential(px, py, c[0], c[1]);
}

/**
 * The rasterised depth-n Yoccoz critical piece (the flood component of `target` in {G < level} minus
 * the `rayPolylines`), over `box` at n×n. Returns null when `target` is not in the region (degenerate).
 * See the module comment for why the rays are barriered to their landing cells and the flood is
 * 4-connected.
 */
export function criticalPieceMask(
  c: Vec2,
  level: number,
  rayPolylines: Vec2[][],
  target: Vec2,
  box: [number, number, number, number],
  n: number,
  paramPlane = false,
): CriticalMask | null {
  const [x0, y0, x1, y1] = box;
  const dx = (x1 - x0) / n;
  const dy = (y1 - y0) / n;
  const wall = new Uint8Array(n * n);

  // 1. Equipotential walls: cells whose escape potential reaches `level` are outside the region.
  for (let j = 0; j < n; j++) {
    const py = y0 + (j + 0.5) * dy;
    const row = j * n;
    for (let i = 0; i < n; i++) {
      if (gridPotential(x0 + (i + 0.5) * dx, py, c, paramPlane) >= level) wall[row + i] = 1;
    }
  }

  // 2. Ray barriers: rasterise every polyline (Bresenham), landing cells included.
  const cellI = (x: number): number => Math.floor((x - x0) / dx);
  const cellJ = (y: number): number => Math.floor((y - y0) / dy);
  const markWall = (i: number, j: number): void => {
    if (i >= 0 && i < n && j >= 0 && j < n) wall[j * n + i] = 1;
  };
  for (const poly of rayPolylines) {
    for (let s = 1; s < poly.length; s++) {
      let ai = cellI(poly[s - 1][0]);
      let aj = cellJ(poly[s - 1][1]);
      const bi = cellI(poly[s][0]);
      const bj = cellJ(poly[s][1]);
      const di = Math.abs(bi - ai);
      const dj = Math.abs(bj - aj);
      const si = ai < bi ? 1 : -1;
      const sj = aj < bj ? 1 : -1;
      let err = di - dj;
      for (;;) {
        markWall(ai, aj);
        if (ai === bi && aj === bj) break;
        const e2 = 2 * err;
        if (e2 > -dj) {
          err -= dj;
          ai += si;
        }
        if (e2 < di) {
          err += di;
          aj += sj;
        }
      }
    }
  }

  // 3. 4-connected flood from the target cell.
  const ti = cellI(target[0]);
  const tj = cellJ(target[1]);
  if (ti < 0 || ti >= n || tj < 0 || tj >= n || wall[tj * n + ti]) return null;
  const mask = new Uint8Array(n * n);
  const stack = [tj * n + ti];
  mask[tj * n + ti] = 1;
  const visit = (k: number): void => {
    if (!wall[k] && !mask[k]) {
      mask[k] = 1;
      stack.push(k);
    }
  };
  while (stack.length) {
    const idx = stack.pop() as number;
    const i = idx % n;
    const j = (idx / n) | 0;
    if (i > 0) visit(idx - 1);
    if (i < n - 1) visit(idx + 1);
    if (j > 0) visit(idx - n);
    if (j < n - 1) visit(idx + n);
  }
  return { data: mask, n, box };
}
