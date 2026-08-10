// @cas/schwarz — the σ limit set (the boundary the fundamental-domain tiling converges to) by the chaos
// game on σ⁻¹, plus its box-counting dimension. Ported from the QD app's schwarz-inverse.mjs
// (sampleLimitSet + boxCountingDimension), the [re,im]-tuple form. Free functions over the minimal
// SchwarzInverse surface (F3b), so they serve every σ family. σ⁻¹ is a numerical reconstruction, so the
// limit set + its dimension are `≈` — never certified.
import { type Complex } from "./branches.js";
import { type SchwarzInverse } from "./preimage-tree.js";

/** [minRe, maxRe, minIm, maxIm] — the box restart seeds are sampled from (they must land in Ω^c = K). */
export type BBox = readonly [number, number, number, number];

export interface LimitSetOptions {
  /** Ω-membership. Restart seeds (when σ⁻¹ dead-ends) must be in Ω^c = K, so the walk samples until
   *  `!isInOmega(w)`. The SAME predicate the field render + orbit tracer use (outside ∂Ω for the unbounded
   *  family, inside it for a bounded QD). */
  isInOmega: (w: Complex) => boolean;
  /** The restart-seed sampling box; default [-2, 2, -2, 2]. Pass the domain's own bounding box (padded) so
   *  restarts land near K rather than far out in Ω. */
  bbox?: BBox;
  /** Points to collect after burn-in (default 50000). */
  n?: number;
  /** Warm-up steps discarded before collecting, so the walk has settled onto the attractor (default 500). */
  burnIn?: number;
  /** Uniform [0,1) source (default Math.random). Pass a seeded PRNG for a reproducible cloud (tests). */
  rng?: () => number;
  /** Initial point; default a random Ω^c seed. */
  seed?: Complex;
}

/**
 * Chaos game on σ⁻¹: from a seed in K, repeatedly pick ONE preimage at random and continue. After burn-in
 * the trajectory densely samples the σ limit set (the attractor of the IFS of σ⁻¹ branches — the boundary of
 * the tiling set). Returns a Float64Array of interleaved [re, im, …] (length 2·collected). If σ⁻¹ dead-ends
 * (no preimage), the walk restarts from a fresh random Ω^c seed; after 100 consecutive failed restarts, or a
 * 20×-budget step failsafe, it returns what it has (possibly < n points — a short buffer). Ported verbatim
 * from QD's schwarz-inverse.mjs sampleLimitSet.
 */
export function sampleLimitSet(schwarz: SchwarzInverse, opts: LimitSetOptions): Float64Array {
  const n = opts.n != null ? Math.max(0, opts.n | 0) : 50000;
  const burnIn = opts.burnIn != null ? Math.max(0, opts.burnIn | 0) : 500;
  const rng = opts.rng ?? Math.random;
  const isInOmega = opts.isInOmega;
  const [bMinRe, bMaxRe, bMinIm, bMaxIm] = opts.bbox ?? [-2, 2, -2, 2];

  const out = new Float64Array(2 * n);
  if (n === 0) return out;

  // Reject-sample the restart box for a point in Ω^c = K; fall back to a corner (usually in K for a typical Ω).
  const randomOmegaCSeed = (): Complex => {
    for (let tries = 0; tries < 200; tries++) {
      const w: Complex = [bMinRe + rng() * (bMaxRe - bMinRe), bMinIm + rng() * (bMaxIm - bMinIm)];
      if (!isInOmega(w)) return w;
    }
    return [bMaxRe, bMaxIm];
  };

  let cur: Complex = opts.seed ? [opts.seed[0], opts.seed[1]] : randomOmegaCSeed();
  let written = 0;
  let consecRestarts = 0;
  let stepIdx = 0;
  const total = burnIn + n;

  while (written < n && consecRestarts < 100) {
    let preimages: Complex[];
    try {
      preimages = schwarz.sigmaInverse(cur);
    } catch {
      preimages = [];
    }
    if (preimages.length === 0) {
      cur = randomOmegaCSeed();
      consecRestarts++;
      continue;
    }
    consecRestarts = 0;
    cur = preimages[Math.floor(rng() * preimages.length)] ?? preimages[0];
    stepIdx++;
    if (stepIdx > burnIn) {
      out[2 * written] = cur[0];
      out[2 * written + 1] = cur[1];
      written++;
    }
    if (stepIdx > 20 * total) break; // failsafe against a pathological φ that never collects enough
  }

  return written < n ? out.subarray(0, 2 * written) : out;
}

export interface BoxDimensionResult {
  /** The box sizes ε used (geometric, decreasing). */
  boxSizes: number[];
  /** Occupied-cell count N(ε) at each size. */
  counts: number[];
  /** Least-squares slope of log N vs log ε (= −dim). */
  slope: number;
  intercept: number;
  /** The box-counting dimension estimate (= −slope); NaN if < 2 valid scales. */
  dim: number;
}

/** Default box sizes ε: a geometric ladder 2^{-3 … -12}, matching QD. */
const DEFAULT_BOX_SIZES: readonly number[] = [
  0.125, 0.0625, 0.03125, 0.015625, 0.0078125, 0.00390625, 0.001953125, 0.0009765625, 0.00048828125,
  0.000244140625,
];

/**
 * Box-counting (Minkowski–Bouligand) dimension of a point set: for each box size ε, count the grid cells of
 * side ε containing ≥1 point; then log N(ε) ≈ −d·log ε + c, so the least-squares slope of (log ε, log N) gives
 * d. Accepts the interleaved Float64Array `sampleLimitSet` returns, or a Complex[] (tuple) array. Scales with
 * N(ε) < 2 are dropped as degenerate; `dim` is NaN when fewer than 2 usable scales remain. box-counting
 * agrees with Hausdorff for self-similar sets, so it is the standard fractal-dimension estimate — `≈`.
 *
 * The estimate is SAMPLE-DENSITY dependent: at box sizes finer than the point spacing every point sits in its
 * own cell, so N(ε) plateaus at the point count and those saturated scales flatten the slope, biasing `dim`
 * DOWNWARD. More points push the plateau finer; the number is a rough estimate, never a certified dimension
 * (hence `≈`). Callers wanting a clean value on a known set should pass `boxSizes` coarse enough to stay above
 * the point spacing (the unsaturated regime).
 */
export function boxCountingDimension(
  points: Float64Array | readonly Complex[],
  opts: { boxSizes?: readonly number[] } = {},
): BoxDimensionResult {
  const sizes = opts.boxSizes ?? DEFAULT_BOX_SIZES;

  // Normalise to an interleaved Float64Array.
  let pts: Float64Array;
  if (ArrayBuffer.isView(points)) {
    pts = points as Float64Array;
  } else {
    const arr = points as readonly Complex[];
    pts = new Float64Array(arr.length * 2);
    for (let i = 0; i < arr.length; i++) {
      pts[2 * i] = arr[i][0];
      pts[2 * i + 1] = arr[i][1];
    }
  }

  const nPts = pts.length / 2;
  const counts: number[] = new Array(sizes.length).fill(0);
  for (let s = 0; s < sizes.length; s++) {
    const eps = sizes[s];
    const occ = new Set<string>();
    for (let i = 0; i < nPts; i++) {
      const bx = Math.floor(pts[2 * i] / eps);
      const by = Math.floor(pts[2 * i + 1] / eps);
      occ.add(bx + "," + by);
    }
    counts[s] = occ.size;
  }

  // Least-squares regression on (log ε, log N(ε)); slope = −d.
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let nValid = 0;
  for (let s = 0; s < sizes.length; s++) {
    if (counts[s] < 2) continue; // a scale with ≤1 occupied cell carries no slope information
    const lx = Math.log(sizes[s]);
    const ly = Math.log(counts[s]);
    sumX += lx;
    sumY += ly;
    sumXY += lx * ly;
    sumXX += lx * lx;
    nValid++;
  }
  let slope = NaN;
  let intercept = NaN;
  let dim = NaN;
  if (nValid >= 2) {
    const denom = nValid * sumXX - sumX * sumX;
    if (denom !== 0) {
      slope = (nValid * sumXY - sumX * sumY) / denom;
      intercept = (sumY - slope * sumX) / nValid;
      dim = -slope;
    }
  }
  return { boxSizes: [...sizes], counts, slope, intercept, dim };
}
