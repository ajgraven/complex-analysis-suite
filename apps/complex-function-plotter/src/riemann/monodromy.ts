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
  /** Per tracked sheet `k`, its continuation path along the loop: `{ z (base point), w (sheet value) }`.
   *  Lifted onto the 3D surface by the caller so the monodromy is visible where the sheets actually live. */
  paths: { z: Complex; w: Complex }[][];
}

/** The most frequent value among `counts` that is ≥ 2 (a robust sheet count), or 0 if none qualify. */
function modeCountAtLeast2(counts: readonly number[]): number {
  const freq = new Map<number, number>();
  for (const c of counts) if (c >= 2) freq.set(c, (freq.get(c) ?? 0) + 1);
  let best = 0;
  let bestFreq = 0;
  for (const [c, f] of freq) if (f > bestFreq || (f === bestFreq && c < best)) {
    best = c;
    bestFreq = f;
  }
  return best;
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
  opts: { samples?: number; expected?: number } = {},
): MonodromyResult | null {
  const samples = Math.max(16, Math.floor(opts.samples ?? 256));
  let path = resampleClosedLoop(loop, samples);
  if (path.length < 3) return null;

  // Census every loop point once, then pick a robust sheet count N and a CLEAN start point. The census can
  // wobble (an extra near-duplicate, or a merge near a branch point); starting on a wobble used to poison N
  // and give an "ambiguous" result. Prefer the caller's known count (`expected`); else the modal count.
  let census = path.map((p) => distinctSheets(sheetsAt(p)));
  const S = path.length - 1; // distinct loop points (path[S] === path[0])
  const counts = census.slice(0, S).map((c) => c.length);
  const mode = modeCountAtLeast2(counts);
  const N =
    opts.expected && opts.expected >= 2 && counts.includes(opts.expected) ? opts.expected : mode;
  if (N < 2) return null; // fewer than two sheets anywhere — nothing to permute
  // Start where the loop actually resolves N sheets (keep index 0 when it already does — so a clean
  // enumerator never rotates and the reported permutation is start-stable for the tests).
  const start = counts[0] === N ? 0 : counts.indexOf(N);
  if (start < 0) return null;
  if (start !== 0) {
    const rot = <T>(arr: T[]): T[] => {
      const r = [...arr.slice(start, S), ...arr.slice(0, start)];
      r.push(r[0]);
      return r;
    };
    path = rot(path);
    census = rot(census);
  }

  const s0: Complex[] = census[0].slice(0, N).map((v) => [v[0], v[1]]);
  const track: Complex[] = s0.map((v) => [v[0], v[1]]);
  const paths: { z: Complex; w: Complex }[][] = s0.map((v) => [
    { z: path[0], w: [v[0], v[1]] as Complex },
  ]);
  let gapMin = Infinity;
  let maxJumpRatio = 0;
  let countDrift = false;
  for (let i = 1; i < path.length; i++) {
    const cur = census[i];
    if (cur.length < 2) {
      countDrift = true; // sheets merged (near a branch point) — carry the tracks forward
      for (let k = 0; k < N; k++) paths[k].push({ z: path[i], w: [track[k][0], track[k][1]] as Complex });
      continue;
    }
    if (cur.length < N) countDrift = true; // genuinely fewer sheets resolved (a near-branch pass)
    const prev = track.map((v) => [v[0], v[1]] as Complex);
    for (let k = 0; k < N; k++) {
      const { idx } = nearest(cur, track[k]);
      if (idx >= 0) track[k] = cur[idx];
    }
    // Gauge separation + step size on the TRACKED sheets (immune to a spurious extra in the raw census).
    const gap = minPairwise(track);
    if (gap > 1e-12) {
      gapMin = Math.min(gapMin, gap);
      for (let k = 0; k < N; k++)
        maxJumpRatio = Math.max(maxJumpRatio, nearest([prev[k]], track[k]).d / gap);
    }
    for (let k = 0; k < N; k++) paths[k].push({ z: path[i], w: [track[k][0], track[k][1]] as Complex });
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
    paths,
  };
}
