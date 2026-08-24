/**
 * The algebraic-curve Riemann-surface mesh (M2a + M2b, ADR-0029) by **Nieser–Poelke–Polthier / Kranich
 * proximity gluing** (research notes §2.2). The surface is built over a triangulated z-domain: at each
 * vertex the `q` sheet values come from the recognizer (`spec.sheetsAt` — for a single radical the `q`
 * values of `R^(p/q)`, for a combination of radicals the `∏qᵢ` branch combos; both elementary, no root
 * solve); each domain triangle is stitched into `q` surface triangles by matching, for each sheet at the
 * anchor corner, the **nearest** sheet value at the other two corners. Where a branch point sits inside a
 * cell the sheets collide (separation → 0) so the nearest-match becomes a large jump; such triangles are
 * **adaptively subdivided** (up to `subdivideDepth`) and, if still degenerate at the finest level,
 * **dropped** — leaving small **holes** at the ramification points that shrink with depth, so a branch cut
 * is never rendered as a wall (it simply isn't in the glued mesh). Poles of R (where `|w| → ∞`) are dropped
 * by the `wCap`.
 *
 * Branch points of this class are exactly the zeros and poles of `R`, both of which the local degeneracy /
 * `wCap` tests detect directly — so the mesh needs **no branch-point solve and no extra packages** (exact
 * branch loci via `@cas/exact` are the M2b general-curve tool). Output is a **baked, non-indexed** triangle
 * soup: `positions` = world `(Re z, Im z)` per vertex (the charisma height `Re w` / `Im w` is applied in the
 * vertex shader, staying a live uniform), `values` = the sheet value `w` per vertex. Pure: no DOM / GL —
 * runnable on the main thread (tests + the app; fast enough for M2a grids). Winding matches `mesh.ts`.
 */
import type { Complex } from "@cas/expr/complex";

export interface CurveSpec {
  /** The `q` sheet values of the surface at a point `z` (from the recognizer's per-combo evaluators). A
   *  vertex whose result has the wrong length or a non-finite value is treated as degenerate (a hole). */
  sheetsAt: (z: Complex) => Complex[];
  /** The expected sheet count `q` (= number of branch combos). */
  sheetCount: number;
}

/** The world rectangle to build over (matches the plot view: half-width = span·aspect, half-height = span). */
export interface CurveViewport {
  cx: number;
  cy: number;
  span: number;
  aspect: number;
}

export interface CurveMeshOptions {
  /** Base grid cells per side (default 72). */
  grid?: number;
  /** Adaptive subdivision levels for degenerate (branch-point) cells (default 3 → up to grid·2³ locally). */
  subdivideDepth?: number;
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

/** A domain vertex: world position + its `q` sheet values (empty if R was non-finite) + sheet separation. */
interface Vert {
  x: number;
  y: number;
  s: Complex[];
  sep: number;
}

/**
 * Build the proximity-glued surface mesh for `spec` over `view`. A triangle is on-sheet only if the
 * nearest-match stayed on-sheet — its largest surface-edge |Δw| must be below half the minimum sheet
 * separation among the corners (a continuous step is ≪ a sheet gap; a jump across a branch point is ≈ a
 * gap). Degenerate cells are subdivided up to `subdivideDepth`, then their still-degenerate sheets dropped.
 */
export function buildCurveMesh(
  spec: CurveSpec,
  view: CurveViewport,
  opts: CurveMeshOptions = {},
): CurveMesh {
  const N = Math.max(2, Math.floor(opts.grid ?? 72));
  const maxDepth = Math.max(0, Math.floor(opts.subdivideDepth ?? 3));
  const maxTriangles = opts.maxTriangles ?? 600_000;
  const wCap = opts.wCap ?? 1e3;
  const q = spec.sheetCount;
  const halfW = view.span * view.aspect;
  const halfH = view.span;
  const x0 = view.cx - halfW;
  const y0 = view.cy - halfH;
  const dx = (2 * halfW) / N;
  const dy = (2 * halfH) / N;

  const posOut: number[] = [];
  const valOut: number[] = [];
  let dropped = 0;
  let capped = false;

  const vertAt = (x: number, y: number): Vert => {
    let s: Complex[];
    try {
      s = spec.sheetsAt([x, y]);
    } catch {
      s = [];
    }
    // All q sheet values must be present and finite; otherwise the vertex is degenerate (a hole near a
    // pole / a missing branch), so triangles touching it are subdivided and ultimately dropped.
    if (s.length !== q || s.some((w) => !Number.isFinite(w[0]) || !Number.isFinite(w[1])))
      return { x, y, s: [], sep: 0 };
    return { x, y, s, sep: minSeparation(s) };
  };
  const mid = (a: Vert, b: Vert): Vert => vertAt((a.x + b.x) / 2, (a.y + b.y) / 2);

  /**
   * Stitch one domain triangle (corners P0/P1/P2) into up to `q` on-sheet surface triangles, appending
   * them to the output. Returns whether ANY sheet was degenerate (the caller subdivides if it can).
   * `emit` = actually append (false while only probing whether to subdivide).
   */
  const stitchTri = (P0: Vert, P1: Vert, P2: Vert, emit: boolean): boolean => {
    if (P0.s.length !== q || P1.s.length !== q || P2.s.length !== q) {
      if (emit) dropped += q; // a non-finite corner (pole / NaN)
      return true;
    }
    const minSep = Math.min(P0.sep, P1.sep, P2.sep);
    let degenerate = false;
    for (let s = 0; s < q; s++) {
      const wa = P0.s[s];
      const nb = nearest(P1.s, wa);
      const nc = nearest(P2.s, wa);
      const wb = P1.s[nb.idx];
      const wc = P2.s[nc.idx];
      const edge = Math.max(nb.dist, nc.dist, Math.hypot(wb[0] - wc[0], wb[1] - wc[1]));
      const mag = Math.max(Math.hypot(wa[0], wa[1]), Math.hypot(wb[0], wb[1]), Math.hypot(wc[0], wc[1]));
      if (minSep < 1e-9 || edge > 0.5 * minSep || mag > wCap) {
        degenerate = true;
        if (emit) dropped++;
        continue;
      }
      if (emit) {
        if (posOut.length / 6 + 1 > maxTriangles) {
          capped = true;
          return degenerate;
        }
        posOut.push(P0.x, P0.y, P1.x, P1.y, P2.x, P2.y);
        valOut.push(wa[0], wa[1], wb[0], wb[1], wc[0], wc[1]);
      }
    }
    return degenerate;
  };

  // A cell has corners A=bottom-left, B=bottom-right, C=top-left, D=top-right; two triangles (A,C,B),(B,C,D).
  const emitCell = (A: Vert, B: Vert, C: Vert, D: Vert, depth: number): void => {
    if (capped) return;
    if (depth < maxDepth) {
      const deg = stitchTri(A, C, B, false) || stitchTri(B, C, D, false);
      if (deg) {
        const AB = mid(A, B);
        const AC = mid(A, C);
        const BD = mid(B, D);
        const CD = mid(C, D);
        const M = mid(A, D);
        emitCell(A, AB, AC, M, depth + 1);
        emitCell(AB, B, M, BD, depth + 1);
        emitCell(AC, M, C, CD, depth + 1);
        emitCell(M, BD, CD, D, depth + 1);
        return;
      }
    }
    stitchTri(A, C, B, true);
    stitchTri(B, C, D, true);
  };

  // Base grid row cache: reuse the lower row's vertices as the next row's upper corners.
  let lower: Vert[] = [];
  for (let i = 0; i <= N; i++) lower.push(vertAt(x0 + i * dx, y0));
  for (let j = 0; j < N && !capped; j++) {
    const upper: Vert[] = [];
    for (let i = 0; i <= N; i++) upper.push(vertAt(x0 + i * dx, y0 + (j + 1) * dy));
    for (let i = 0; i < N && !capped; i++) {
      emitCell(lower[i], lower[i + 1], upper[i], upper[i + 1], 0);
    }
    lower = upper;
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
