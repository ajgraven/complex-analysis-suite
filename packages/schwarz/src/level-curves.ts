// @cas/schwarz — σ level curves (F4b): the iso-magnitude + iso-phase lines of the reflection σ, by marching
// squares over a grid of σ(w).
//   • MAGNITUDE contours |σ(w)| = L (drawn solid) — a scalar field, plain marching squares.
//   • PHASE contours arg σ(w) ≡ θ (drawn dashed) — computed SEAM-FREE as the zero set of the smooth field
//     g_θ(w) = Im(σ(w)·e^{−iθ}) = |σ|·sin(arg σ − θ). Its zeros are exactly arg σ ≡ θ (mod π), so a single
//     level-0 march per θ ∈ {0, π/M, …} yields the phase lines with NO reference to arg's ±π branch cut —
//     the negative-real-axis "seam" that a raw arg-field marcher has to special-case simply never appears.
// Where σ = null (φ⁻¹ failed, w ∉ Ω) a grid corner is INVALID and every cell touching it is skipped, so the
// curves live only where σ is defined. A free function over the minimal {sigma} surface both engines expose.
// σ is a numerical reconstruction, so the curves are `≈` — never certified.
import { type Complex } from "./branches.js";
import { type BBox } from "./limit-set.js";

/** The minimal forward-σ surface the level-curve marcher needs (both engines expose it). */
export interface SchwarzSigma {
  sigma(w: Complex): Complex | null;
}

export interface LevelCurveOptions {
  /** Grid samples per axis (default 161). Higher = smoother curves at ~grid² σ evaluations. */
  grid?: number;
  /** |σ| contour levels. Default: a geometric ladder L·2^{2−k}, k=0…4, off the MEDIAN of |σ| over the grid —
   *  robust to a σ-pole spike (a bounded map) that a max-based scale would let dominate. */
  magnitudeLevels?: readonly number[];
  /** Phase lines: the contours arg σ ≡ θ for θ = kπ/M, k=0…M−1 (default M = 6). Each is a full line (θ and
   *  θ+π together — the zero set of Im(σ·e^{−iθ})), so M lines partition the phase into 2M sectors. */
  phaseLines?: number;
}

/** A contour segment in w-space (both endpoints complex). */
export interface LevelSegment {
  a: Complex;
  b: Complex;
}

export interface SigmaLevelCurves {
  /** |σ(w)| = const contours (drawn solid). */
  magnitude: LevelSegment[];
  /** arg σ(w) ≡ const contours (drawn dashed). */
  phase: LevelSegment[];
  /** The magnitude levels actually contoured (the resolved default when none was supplied). */
  magnitudeLevels: number[];
}

// Marching-squares segment table: case (b0|b1<<1|b2<<2|b3<<3, bit set ⇒ corner value ≥ level) → the pairs of
// cell EDGES a contour segment connects. Edge i runs between corner i and corner (i+1)%4; corners are ordered
// 0=(i,j) 1=(i+1,j) 2=(i+1,j+1) 3=(i,j+1) around the cell. Cases 5 & 10 are saddles (two segments; either
// pairing is a valid contour for visualization).
const MS_TABLE: readonly (readonly [number, number][])[] = [
  [], // 0
  [[3, 0]], // 1
  [[0, 1]], // 2
  [[3, 1]], // 3
  [[1, 2]], // 4
  [[3, 0], [1, 2]], // 5 (saddle)
  [[0, 2]], // 6
  [[3, 2]], // 7
  [[2, 3]], // 8
  [[2, 0]], // 9
  [[0, 1], [2, 3]], // 10 (saddle)
  [[2, 1]], // 11
  [[1, 3]], // 12
  [[1, 0]], // 13
  [[0, 3]], // 14
  [], // 15
];

/**
 * Marching squares of the scalar `f` (one value per grid node, row-major grid×grid) over the world-space grid
 * whose node (i,j) sits at (`xs[i]`, `ys[j]`). A node with `ok = false` is invalid; any cell touching one is
 * skipped. Appends the contour segments at `level` to `out`.
 */
function marchLevel(
  f: Float64Array,
  ok: Uint8Array,
  xs: Float64Array,
  ys: Float64Array,
  grid: number,
  level: number,
  out: LevelSegment[],
): void {
  const at = (i: number, j: number): number => j * grid + i;
  // Crossing point where f = level on the edge from corner (value va, position pa) to (vb, pb).
  const cross = (
    va: number,
    ax: number,
    ay: number,
    vb: number,
    bx: number,
    by: number,
  ): Complex => {
    const t = (level - va) / (vb - va);
    return [ax + t * (bx - ax), ay + t * (by - ay)];
  };
  for (let j = 0; j < grid - 1; j++) {
    for (let i = 0; i < grid - 1; i++) {
      const k0 = at(i, j), k1 = at(i + 1, j), k2 = at(i + 1, j + 1), k3 = at(i, j + 1);
      if (!ok[k0] || !ok[k1] || !ok[k2] || !ok[k3]) continue; // cell straddles the σ-undefined region
      const v0 = f[k0], v1 = f[k1], v2 = f[k2], v3 = f[k3];
      const c = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
      const pairs = MS_TABLE[c];
      if (pairs.length === 0) continue;
      // Corner positions.
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      const cx = [x0, x1, x1, x0]; // corner x by index 0..3
      const cy = [y0, y0, y1, y1];
      const cv = [v0, v1, v2, v3];
      // Edge e → the crossing on that edge (between corner e and (e+1)%4).
      const edgePt = (e: number): Complex => {
        const a = e, b = (e + 1) & 3;
        return cross(cv[a], cx[a], cy[a], cv[b], cx[b], cy[b]);
      };
      for (const [ea, eb] of pairs) out.push({ a: edgePt(ea), b: edgePt(eb) });
    }
  }
}

/**
 * Contour the reflection σ over `bbox` = [minRe, maxRe, minIm, maxIm]: magnitude lines |σ| = L (solid) and
 * phase lines arg σ ≡ kπ/M (dashed), by marching squares on a `grid`×`grid` sampling of σ. σ is evaluated
 * ONCE per node; the phase lines reuse those samples through the seam-free rotated field Im(σ·e^{−iθ}).
 * Segments are returned in w-space (project them per view at draw time). Best-effort and `≈` — σ is numerical.
 */
export function computeSigmaLevelCurves(
  surface: SchwarzSigma,
  bbox: BBox,
  opts: LevelCurveOptions = {},
): SigmaLevelCurves {
  const grid = Math.max(2, Math.floor(opts.grid ?? 161));
  const [minRe, maxRe, minIm, maxIm] = bbox;
  const xs = new Float64Array(grid);
  const ys = new Float64Array(grid);
  for (let i = 0; i < grid; i++) xs[i] = minRe + ((maxRe - minRe) * i) / (grid - 1);
  for (let j = 0; j < grid; j++) ys[j] = minIm + ((maxIm - minIm) * j) / (grid - 1);

  // Sample σ once per node: real, imag, and a validity flag (σ defined AND finite).
  const n = grid * grid;
  const sre = new Float64Array(n);
  const sim = new Float64Array(n);
  const ok = new Uint8Array(n);
  const absSorted: number[] = [];
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const k = j * grid + i;
      const s = surface.sigma([xs[i], ys[j]]);
      if (s && Number.isFinite(s[0]) && Number.isFinite(s[1])) {
        sre[k] = s[0];
        sim[k] = s[1];
        ok[k] = 1;
        const a = Math.hypot(s[0], s[1]);
        if (a < 1e6) absSorted.push(a); // exclude a σ-pole spike from the level ladder scale
      }
    }
  }

  // Resolve the magnitude levels: a geometric ladder off the median |σ| (robust to pole spikes), unless the
  // caller supplied its own. Median needs a sorted copy; absSorted is unsorted so far.
  let magnitudeLevels: number[];
  if (opts.magnitudeLevels && opts.magnitudeLevels.length) {
    magnitudeLevels = [...opts.magnitudeLevels];
  } else if (absSorted.length) {
    absSorted.sort((p, q) => p - q);
    const median = absSorted[absSorted.length >> 1] || 1;
    magnitudeLevels = [4, 2, 1, 0.5, 0.25].map((m) => median * m);
  } else {
    magnitudeLevels = [];
  }

  // Magnitude field |σ| — one march per level.
  const magnitude: LevelSegment[] = [];
  const mag = new Float64Array(n);
  for (let k = 0; k < n; k++) mag[k] = ok[k] ? Math.hypot(sre[k], sim[k]) : 0;
  for (const L of magnitudeLevels) marchLevel(mag, ok, xs, ys, grid, L, magnitude);

  // Phase field g_θ = Im(σ·e^{−iθ}) = sim·cosθ − sre·sinθ — level-0 march per θ = kπ/M. Seam-free.
  const phase: LevelSegment[] = [];
  const M = Math.max(1, Math.floor(opts.phaseLines ?? 6));
  const g = new Float64Array(n);
  for (let m = 0; m < M; m++) {
    const th = (Math.PI * m) / M;
    const ct = Math.cos(th), st = Math.sin(th);
    for (let k = 0; k < n; k++) g[k] = ok[k] ? sim[k] * ct - sre[k] * st : 0;
    marchLevel(g, ok, xs, ys, grid, 0, phase);
  }

  return { magnitude, phase, magnitudeLevels };
}
