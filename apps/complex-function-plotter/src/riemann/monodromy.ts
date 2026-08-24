/**
 * The monodromy explorer's continuation engine (M3.3, ADR-0030) — the ONE place the plotter performs
 * analytic continuation around a loop, which [`docs/RISKS.md`](../../../../docs/RISKS.md) §3 flags as
 * **never certified**. So everything here is an **estimate** and is fenced accordingly: the result is `≈`,
 * carries explicit low-confidence flags, and is quarantined by its caller from the badge, the permalink, and
 * every export.
 *
 * Given an enumerator `sheetsAt(z)` (the set of sheet values over a base point — exact for algebraic curves,
 * a mesh census for the parametric primitives) and a base-plane loop, it resamples the closed loop by arc
 * length, tracks each starting sheet value by **nearest-match** from step to step (the same proximity
 * principle as the M2 mesh gluing), and reports the permutation the sheets return in — e.g. a loop around 0
 * swaps the two sheets of `√z` (a 2-cycle) and cycles the three of `z^(1/3)` (a 3-cycle). Nearest-match can
 * hop where sheets nearly merge (a loop grazing a branch point), so the result flags low confidence when the
 * smallest sheet gap gets dangerously small, when a single step jumps more than half the local gap, when the
 * sheet count drifts along the loop, or when the tracked endpoints don't form a bijection. Pure: no DOM/GL,
 * unit-tested with exact analytic enumerators.
 */
import type { Complex } from "@cas/expr/complex";

export interface MonodromyResult {
  /** Number of distinct sheets over the loop's start point (the permutation is on `0 … N−1`). */
  sheetCount: number;
  /** `permutation[k]` = the start-sheet index that tracked sheet `k` returned to after the loop. */
  permutation: number[];
  /** Cycle decomposition of the permutation (0-based indices), only when it is a genuine bijection. */
  cycles: number[][];
  /** Whether the tracked endpoints form a genuine bijection (a valid permutation). */
  isPermutation: boolean;
  /** The smallest sheet separation seen along the loop (a proxy for how close it ran to a branch point). */
  gapMin: number;
  /** The largest single-step jump as a fraction of the local sheet gap (≫ 1 ⇒ the tracking hopped). */
  maxJumpRatio: number;
  /** True when the estimate is unreliable — near a branch point, under-resolved, or not a bijection. */
  lowConfidence: boolean;
  /** How many points the closed loop was resampled to. */
  samples: number;
}

const dist = (a: Complex, b: Complex): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Sort key: ascending `arg`, then ascending `|·|` — a deterministic labeling of the start sheets. */
function sheetLess(a: Complex, b: Complex): number {
  const aa = Math.atan2(a[1], a[0]);
  const ab = Math.atan2(b[1], b[0]);
  if (Math.abs(aa - ab) > 1e-9) return aa - ab;
  return Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]);
}

/** Finite, deterministically-ordered, near-duplicate-clustered sheet values (branch-point merges collapse). */
function distinctSheets(values: readonly Complex[]): Complex[] {
  const finite = values.filter((v) => Number.isFinite(v[0]) && Number.isFinite(v[1]));
  if (finite.length === 0) return [];
  let maxAbs = 0;
  for (const v of finite) maxAbs = Math.max(maxAbs, Math.hypot(v[0], v[1]));
  const tol = Math.max(1e-7, 1e-3 * maxAbs);
  const sorted = [...finite].sort(sheetLess);
  const out: Complex[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (!last || dist(v, last) > tol) out.push([v[0], v[1]]);
  }
  return out;
}

/** Index in `cand` nearest to `w`, and that distance (idx = −1 for an empty candidate set). */
function nearest(cand: readonly Complex[], w: Complex): { idx: number; d: number } {
  let idx = -1;
  let best = Infinity;
  for (let j = 0; j < cand.length; j++) {
    const d = dist(cand[j], w);
    if (d < best) {
      best = d;
      idx = j;
    }
  }
  return { idx, d: best };
}

/** Minimum pairwise distance among `arr` (Infinity for fewer than two points). */
function minPairwise(arr: readonly Complex[]): number {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++) m = Math.min(m, dist(arr[i], arr[j]));
  return m;
}

/**
 * Resample a closed loop (the segment from the last point back to the first is implied) to `samples` points
 * evenly spaced by arc length, with the start point appended at the end so the continuation returns home.
 * Returns [] for a degenerate (zero-length) loop.
 */
export function resampleClosedLoop(loop: readonly Complex[], samples: number): Complex[] {
  const pts = loop.filter(
    (p, i) => i === 0 || dist(p, loop[i - 1]) > 1e-12,
  );
  if (pts.length < 2) return [];
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i], pts[(i + 1) % pts.length]);
    seg.push(d);
    total += d;
  }
  if (total < 1e-12) return [];
  const out: Complex[] = [];
  for (let s = 0; s < samples; s++) {
    let t = (total * s) / samples;
    let i = 0;
    while (i < seg.length - 1 && t > seg[i]) {
      t -= seg[i];
      i++;
    }
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const f = seg[i] > 1e-12 ? t / seg[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  out.push([out[0][0], out[0][1]]); // close the loop back to the start
  return out;
}

/** Cycle decomposition of a permutation (0-based). Fixed points appear as singleton cycles. */
function cyclesOf(perm: readonly number[]): number[][] {
  const seen = new Array<boolean>(perm.length).fill(false);
  const cycles: number[][] = [];
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    const cyc: number[] = [];
    let j = i;
    while (!seen[j]) {
      seen[j] = true;
      cyc.push(j);
      j = perm[j];
    }
    cycles.push(cyc);
  }
  return cycles;
}

/**
 * Estimate the monodromy of a base-plane loop by nearest-match continuation (M3.3). `sheetsAt(z)` returns the
 * sheet values over `z`. Returns null when the loop is degenerate or fewer than two sheets lie over its start
 * (nothing to permute). The result is an **estimate** — see the module note and its `lowConfidence` flag.
 */
export function computeMonodromy(
  sheetsAt: (z: Complex) => Complex[],
  loop: readonly Complex[],
  opts: { samples?: number } = {},
): MonodromyResult | null {
  const samples = Math.max(16, Math.floor(opts.samples ?? 256));
  const path = resampleClosedLoop(loop, samples);
  if (path.length < 3) return null;
  const s0 = distinctSheets(sheetsAt(path[0]));
  const N = s0.length;
  if (N < 2) return null;

  const track: Complex[] = s0.map((v) => [v[0], v[1]]);
  let gapMin = Infinity;
  let maxJumpRatio = 0;
  let countDrift = false;
  for (let i = 1; i < path.length; i++) {
    const cur = distinctSheets(sheetsAt(path[i]));
    if (cur.length !== N) countDrift = true;
    if (cur.length < 2) {
      countDrift = true;
      continue; // sheets merged (a branch point on the loop) — skip; the flags will mark it unreliable
    }
    const gap = minPairwise(cur);
    gapMin = Math.min(gapMin, gap);
    for (let k = 0; k < N; k++) {
      const { idx, d } = nearest(cur, track[k]);
      if (gap > 1e-12) maxJumpRatio = Math.max(maxJumpRatio, d / gap);
      if (idx >= 0) track[k] = cur[idx];
    }
  }

  const permutation = track.map((v) => nearest(s0, v).idx);
  const isPermutation =
    new Set(permutation).size === N && permutation.every((x) => x >= 0 && x < N);
  const cycles = isPermutation ? cyclesOf(permutation) : [];
  const lowConfidence =
    !isPermutation || countDrift || !(gapMin > 1e-6) || maxJumpRatio > 0.5;
  return {
    sheetCount: N,
    permutation,
    cycles,
    isPermutation,
    gapMin: gapMin === Infinity ? 0 : gapMin,
    maxJumpRatio,
    lowConfidence,
    samples,
  };
}
