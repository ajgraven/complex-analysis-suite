/**
 * Branch-point finder for the Riemann view's legibility polish (M3.4, ADR-0030). Branch (ramification)
 * points are where the sheets **merge** — the defining feature of a multi-sheeted surface — so marking them
 * on the base plane tells you where the loops that permute sheets (the monodromy explorer, M3.3) have to go.
 *
 * The locations are found **uniformly for both render paths**, with no new solver, by scanning the base plane
 * with the same sheet enumerator the pick + monodromy tools use (`sheetsAt(z)` — exact for algebraic curves,
 * a mesh census for the parametric primitives): a branch point is a **local minimum of the sheet separation**
 * where two sheets come together. Candidates are the small-separation local minima, clustered, then refined by
 * a short local descent. Because it is a scan (and, on the parametric path, mesh-limited), the result is an
 * **estimate** — the caller labels it `≈`. Pure: no DOM/GL, unit-tested with exact analytic enumerators.
 */
import type { Complex } from "@cas/expr/complex";

/** The base-plane rectangle to scan (world coordinates). */
export interface BranchBox {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface BranchOptions {
  /** Grid cells per side for the scan (default 40). */
  grid?: number;
  /** Cap on the number of returned points (a legibility guard; default 24). */
  maxPoints?: number;
  /** A node qualifies only if its sheet separation is below this fraction of the largest seen (default 0.12). */
  mergeFraction?: number;
}

const dist = (a: Complex, b: Complex): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Distinct (near-duplicate-clustered) finite sheet values — merges at a branch point collapse the count. */
function distinctCount(values: readonly Complex[]): { sep: number; count: number } {
  const finite = values.filter((v) => Number.isFinite(v[0]) && Number.isFinite(v[1]));
  if (finite.length === 0) return { sep: NaN, count: 0 }; // no surface over this point
  let maxAbs = 0;
  for (const v of finite) maxAbs = Math.max(maxAbs, Math.hypot(v[0], v[1]));
  const tol = Math.max(1e-7, 1e-3 * maxAbs);
  const kept: Complex[] = [];
  for (const v of finite) {
    if (!kept.some((k) => dist(k, v) <= tol)) kept.push(v);
  }
  if (kept.length < 2) return { sep: 0, count: kept.length }; // merged (or single-valued) here
  let m = Infinity;
  for (let i = 0; i < kept.length; i++)
    for (let j = i + 1; j < kept.length; j++) m = Math.min(m, dist(kept[i], kept[j]));
  return { sep: m, count: kept.length };
}

/** Sheet separation at a base point (0 where merged, NaN where the surface has no cover). */
function sepAt(sheetsAt: (z: Complex) => Complex[], x: number, y: number): number {
  return distinctCount(sheetsAt([x, y])).sep;
}

/**
 * Locate the branch points inside `box` by scanning the sheet separation and returning the small-separation
 * local minima (clustered + refined). `sheetsAt(z)` is the sheet enumerator. Estimates — label `≈`.
 */
export function findBranchPoints(
  sheetsAt: (z: Complex) => Complex[],
  box: BranchBox,
  opts: BranchOptions = {},
): Complex[] {
  const N = Math.max(4, Math.floor(opts.grid ?? 40));
  const maxPoints = Math.max(1, Math.floor(opts.maxPoints ?? 24));
  const frac = opts.mergeFraction ?? 0.12;
  const w = box.xmax - box.xmin;
  const h = box.ymax - box.ymin;
  if (!(w > 0) || !(h > 0)) return [];
  const dx = w / N;
  const dy = h / N;
  const at = (i: number, j: number): { sep: number; count: number } =>
    distinctCount(sheetsAt([box.xmin + i * dx, box.ymin + j * dy]));

  // Scan the whole grid once.
  const sep: number[] = new Array((N + 1) * (N + 1));
  const cnt: number[] = new Array((N + 1) * (N + 1));
  let scale = 0;
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const r = at(i, j);
      sep[j * (N + 1) + i] = r.sep;
      cnt[j * (N + 1) + i] = r.count;
      if (Number.isFinite(r.sep) && r.sep > scale) scale = r.sep;
    }
  if (!(scale > 0)) return []; // nowhere are there two resolved sheets — nothing to merge

  const threshold = frac * scale;
  interface Cand {
    x: number;
    y: number;
    sep: number;
  }
  const cands: Cand[] = [];
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const idx = j * (N + 1) + i;
      const c = cnt[idx];
      if (c < 1) continue; // no surface here (uncovered) — never a branch point
      const s = sep[idx]; // 0 where the sheets have fully merged (a branch point sits on the node)
      const merged = c < 2;
      // A candidate is a node where the sheets have merged (`merged`) or come unusually close (`s < thr`).
      if (!merged && !(s < threshold)) continue;
      // …and is a local minimum of the separation among covered neighbours…
      let isMin = true;
      let hasMultiNeighbor = false;
      for (let dj = -1; dj <= 1 && isMin; dj++)
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || ni > N || nj < 0 || nj > N) continue;
          const nIdx = nj * (N + 1) + ni;
          if (cnt[nIdx] >= 2) hasMultiNeighbor = true;
          const ns = sep[nIdx];
          if (Number.isFinite(ns) && ns < s) {
            isMin = false;
            break;
          }
        }
      // …with at least one genuinely two-sheeted neighbour, so a coverage edge (2 → 0 sheets) never fakes one.
      if (isMin && hasMultiNeighbor) cands.push({ x: box.xmin + i * dx, y: box.ymin + j * dy, sep: s });
    }

  // Cluster: keep the smallest-separation candidate in each neighbourhood (closest to the true branch point).
  cands.sort((a, b) => a.sep - b.sep);
  const mergeR = 1.5 * Math.hypot(dx, dy);
  const accepted: Cand[] = [];
  for (const c of cands) {
    if (accepted.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < mergeR)) continue;
    accepted.push(c);
    if (accepted.length >= maxPoints) break;
  }

  // Refine each accepted seed by a short local descent toward the minimum separation.
  const out: Complex[] = [];
  for (const c of accepted) {
    let px = c.x;
    let py = c.y;
    let best = c.sep;
    let r = Math.max(dx, dy) * 0.5;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (let k = 0; k < 8; k++) {
        const ang = (Math.PI * 2 * k) / 8;
        const qx = px + r * Math.cos(ang);
        const qy = py + r * Math.sin(ang);
        const s = sepAt(sheetsAt, qx, qy);
        if (Number.isFinite(s) && s < best) {
          best = s;
          px = qx;
          py = qy;
          moved = true;
        }
      }
      if (!moved) r *= 0.5;
    }
    out.push([px, py]);
  }
  return out;
}
