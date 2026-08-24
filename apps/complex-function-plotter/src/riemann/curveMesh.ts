/**
 * The algebraic-curve Riemann-surface mesh (M2a, ADR-0028) by **Nieser–Poelke–Polthier / Kranich proximity
 * gluing** (research notes §2.2). For `w = R(z)^(p/q)` the surface is built over a triangulated z-domain:
 * at each grid vertex the `q` sheet values are the `q` distinct values of `R(z)^(p/q)` (elementary — no
 * root solve); each domain triangle is stitched into `q` surface triangles by matching, for each sheet at
 * the anchor corner, the **nearest** sheet value at the other two corners. Where a branch point sits inside
 * a cell the sheets collide (their separation → 0) and the nearest-match becomes a large jump; such
 * triangles are **dropped**, leaving small **holes** at the ramification points that shrink as the grid
 * refines — so a branch cut is never rendered as a wall (it simply isn't in the glued mesh).
 *
 * Output is a **baked, non-indexed** triangle soup: `positions` = world `(Re z, Im z)` per vertex (the
 * charisma height `Re w` / `Im w` is applied in the vertex shader, so it stays a live uniform), `values` =
 * the sheet value `w` per vertex (for `colorAt` and the height), three vertices per kept triangle. Pure: no
 * DOM / GL — runnable on the main thread (tests) or a Web Worker (the app). Uniform grid here; adaptive
 * subdivision + `@cas/core` branch-point seeding are M2.1 refinements over this M2.0 core.
 */
import type { Complex } from "@cas/expr/complex";

export interface CurveSpec {
  /** The radicand evaluator `R(z)` (`makeComplexFn` of the recognized rational radicand). */
  R: (z: Complex, c: Complex) => Complex;
  /** `w = R^(p/q)`, lowest terms, `q ≥ 2`. */
  p: number;
  q: number;
}

/** The world rectangle to build over (matches the plot view: half-width = span·aspect, half-height = span). */
export interface CurveViewport {
  cx: number;
  cy: number;
  span: number;
  aspect: number;
}

export interface CurveMeshOptions {
  /** Base grid cells per side (default 96). */
  grid?: number;
  /** Stop after this many kept triangles (badged when hit; default 600k). */
  maxTriangles?: number;
  /** Drop vertices/triangles whose |w| exceeds this (a pole in R; default 1e3). */
  wCap?: number;
}

export interface CurveMesh {
  /** 2 floats per vertex: world (Re z, Im z). */
  positions: Float32Array;
  /** 2 floats per vertex: the sheet value w (colour + charisma height). */
  values: Float32Array;
  vertexCount: number;
  triangleCount: number;
  /** Triangles dropped as ramification holes / pole clamps — surfaced honestly in the badge. */
  droppedTriangles: number;
  /** True if the triangle budget was hit (the surface is incomplete — badged). */
  capped: boolean;
}

/** The `q` distinct values of `r^(p/q)`, ordered by increasing branch index k = 0…q−1. */
export function sheetsOf(r: Complex, p: number, q: number): Complex[] {
  const mag = Math.hypot(r[0], r[1]);
  const arg = Math.atan2(r[1], r[0]);
  const rho = Math.pow(mag, p / q); // |w|
  const out: Complex[] = [];
  for (let k = 0; k < q; k++) {
    const ang = (p * (arg + 2 * Math.PI * k)) / q;
    out.push([rho * Math.cos(ang), rho * Math.sin(ang)]);
  }
  return out;
}

/** Minimum pairwise distance between distinct sheet values (→ 0 at a branch point). */
function minSeparation(sheets: readonly Complex[]): number {
  let m = Infinity;
  for (let i = 0; i < sheets.length; i++)
    for (let j = i + 1; j < sheets.length; j++) {
      const d = Math.hypot(sheets[i][0] - sheets[j][0], sheets[i][1] - sheets[j][1]);
      if (d < m) m = d;
    }
  return m;
}

/** Index of the sheet at `cand` nearest to value `w`, and that distance. */
function nearest(cand: readonly Complex[], w: Complex): { idx: number; dist: number } {
  let idx = 0;
  let best = Infinity;
  for (let j = 0; j < cand.length; j++) {
    const d = Math.hypot(cand[j][0] - w[0], cand[j][1] - w[1]);
    if (d < best) {
      best = d;
      idx = j;
    }
  }
  return { idx, dist: best };
}

/**
 * Build the proximity-glued surface mesh for `spec` over `view`. A triangle is kept for a sheet only if the
 * nearest-match stayed on-sheet — the largest surface-edge |Δw| must be below half the minimum sheet
 * separation among the triangle's corners (a legitimate continuous step is ≪ a sheet gap; a jump across a
 * branch point is ≈ a sheet gap). Degenerate (branch-point) and pole cells are dropped as holes.
 */
export function buildCurveMesh(
  spec: CurveSpec,
  view: CurveViewport,
  opts: CurveMeshOptions = {},
): CurveMesh {
  const N = Math.max(2, Math.floor(opts.grid ?? 96));
  const maxTriangles = opts.maxTriangles ?? 600_000;
  const wCap = opts.wCap ?? 1e3;
  const { p, q } = spec;
  const side = N + 1;
  const halfW = view.span * view.aspect;
  const halfH = view.span;
  const x0 = view.cx - halfW;
  const y0 = view.cy - halfH;
  const dx = (2 * halfW) / N;
  const dy = (2 * halfH) / N;

  // Per-vertex sheet values + separation, computed once and shared across the (up to 4) incident cells.
  const grid: Complex[][] = new Array(side * side);
  const seps = new Float64Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const z: Complex = [x0 + i * dx, y0 + j * dy];
      let r: Complex;
      try {
        r = spec.R(z, [0, 0]);
      } catch {
        r = [NaN, NaN];
      }
      const sheets = Number.isFinite(r[0]) && Number.isFinite(r[1]) ? sheetsOf(r, p, q) : [];
      grid[j * side + i] = sheets;
      seps[j * side + i] = sheets.length ? minSeparation(sheets) : 0;
    }
  }

  const posOut: number[] = [];
  const valOut: number[] = [];
  let dropped = 0;
  let capped = false;

  // Emit the `q` surface triangles for one domain triangle (corners a, b, c = grid vertex indices).
  const emitTriangle = (a: number, b: number, c: number): void => {
    const sa = grid[a];
    const sb = grid[b];
    const sc = grid[c];
    if (sa.length !== q || sb.length !== q || sc.length !== q) {
      dropped += q; // a non-finite corner (pole / NaN) → drop all sheets here
      return;
    }
    const minSep = Math.min(seps[a], seps[b], seps[c]);
    const xa = x0 + (a % side) * dx;
    const ya = y0 + Math.floor(a / side) * dy;
    const xb = x0 + (b % side) * dx;
    const yb = y0 + Math.floor(b / side) * dy;
    const xc = x0 + (c % side) * dx;
    const yc = y0 + Math.floor(c / side) * dy;
    for (let s = 0; s < q; s++) {
      if (posOut.length / 6 + 1 > maxTriangles) {
        capped = true;
        return;
      }
      const wa = sa[s];
      const nb = nearest(sb, wa);
      const nc = nearest(sc, wa);
      const wb = sb[nb.idx];
      const wc = sc[nc.idx];
      const edge = Math.max(
        nb.dist,
        nc.dist,
        Math.hypot(wb[0] - wc[0], wb[1] - wc[1]),
      );
      // Drop degenerate (branch-point) and mis-stitched cells, and pole blow-ups.
      const mag = Math.max(Math.hypot(wa[0], wa[1]), Math.hypot(wb[0], wb[1]), Math.hypot(wc[0], wc[1]));
      if (minSep < 1e-9 || edge > 0.5 * minSep || mag > wCap) {
        dropped++;
        continue;
      }
      posOut.push(xa, ya, xb, yb, xc, yc);
      valOut.push(wa[0], wa[1], wb[0], wb[1], wc[0], wc[1]);
    }
  };

  for (let j = 0; j < N && !capped; j++) {
    for (let i = 0; i < N && !capped; i++) {
      const A = j * side + i;
      const B = A + 1;
      const C = A + side;
      const D = C + 1;
      emitTriangle(A, C, B); // CW from +Z, matching mesh.ts (culling off; normal oriented in-shader)
      emitTriangle(B, C, D);
    }
  }

  return {
    positions: new Float32Array(posOut),
    values: new Float32Array(valOut),
    vertexCount: posOut.length / 2,
    triangleCount: posOut.length / 6,
    droppedTriangles: dropped,
    capped,
  };
}
