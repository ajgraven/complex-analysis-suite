// @cas/schwarz — forward σ-dynamics kernels (F4d cycle finder + F4f forward-curve image). Ported from the QD
// app's schwarz-forward.mjs (findCycles + iterateCurveForward), the [re,im]-tuple form. Free functions over a
// minimal {sigma, isInOmega} surface — family-agnostic. σ is a numerical reconstruction, so both are `≈`; the
// cycle finder is additionally a COARSE global search (advisory, never an exhaustive enumeration).
import { type Complex } from "./branches.js";
import { type BBox } from "./limit-set.js";

/** The minimal forward-σ surface: σ (null off Ω / on failure) + Ω-membership. */
export interface SchwarzForward {
  sigma(w: Complex): Complex | null;
  isInOmega(w: Complex): boolean;
}

const isFiniteC = (w: Complex | null): w is Complex => !!w && Number.isFinite(w[0]) && Number.isFinite(w[1]);
const dist = (a: Complex, b: Complex): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Apply σ to every vertex of a polyline `pts`, `k` times (F4f). Returns an array of length k+1: the original
 * polyline, then σ(pts), σ²(pts), … At each step a vertex that has left Ω or produced an invalid σ is dropped;
 * once every vertex leaves, the remaining steps are empty arrays (the length is always k+1). A verbatim
 * tuple-form port of QD's iterateCurveForward.
 */
export function iterateCurveForward(pts: readonly Complex[], surface: SchwarzForward, k = 5): Complex[][] {
  const steps = Math.max(0, Math.floor(k));
  if (!pts || pts.length === 0) return [[]];
  const out: Complex[][] = [pts.map((p) => [p[0], p[1]] as Complex)];
  let current = out[0];
  for (let it = 0; it < steps; it++) {
    const next: Complex[] = [];
    for (const w of current) {
      if (!surface.isInOmega(w)) continue;
      const sv = surface.sigma(w);
      if (!isFiniteC(sv)) continue;
      next.push([sv[0], sv[1]]);
    }
    out.push(next);
    if (next.length === 0) {
      for (let pad = it + 1; pad < steps; pad++) out.push([]);
      break;
    }
    current = next;
  }
  return out;
}

export interface CycleOptions {
  /** Seed box [minRe, maxRe, minIm, maxIm]; inset 5% before seeding so we don't seed on ∂Ω. Default [-2,2,-2,2]. */
  bbox?: BBox;
  /** Grid seeds per axis M ⇒ M×M seeds (default 18). */
  gridSize?: number;
  /** Newton iterations per seed (default 30). */
  maxIter?: number;
  /** Convergence tolerance on |σⁿ(w) − w| (default 1e-8). */
  tol?: number;
}

export interface SchwarzCycle {
  /** The cycle's true period (the least k with σᵏ(w) ≈ w), 1 ≤ period ≤ n. */
  period: number;
  /** The cycle's points [w, σ(w), …, σ^{period−1}(w)]. */
  points: Complex[];
}

/**
 * Find period-n cycles of σ (F4d): grid-seed Ω, run Newton on G(w) = σⁿ(w) − w at each seed, dedup the
 * converged roots, then trace each into its cycle. Newton uses QD's complex step — (σⁿ)′ via a forward x-step
 * finite difference — which is exact for holomorphic σⁿ (even n) and a heuristic for the anti-holomorphic odd
 * n; the whole routine is a COARSE global search, so results are advisory (`≈`), reliable at n = 1–2 and
 * progressively harder above. Ported from QD's findCycles, with a CORRECTED period detection: the cycle is
 * traced [w, σ(w), …] until it returns to w within n steps (QD broke one step early and under-reported the
 * period of an n-cycle). Sub-period duplicates — a cycle sharing a point with an already-found shorter cycle —
 * are culled.
 */
export function findCycles(surface: SchwarzForward, n: number, opts: CycleOptions = {}): SchwarzCycle[] {
  const period = Math.max(1, Math.floor(n));
  const M = Math.max(1, Math.floor(opts.gridSize ?? 18));
  const maxIter = opts.maxIter ?? 30;
  const tol = opts.tol ?? 1e-8;
  const h = 1e-6;

  let [minRe, maxRe, minIm, maxIm] = opts.bbox ?? [-2, 2, -2, 2];
  const dx = maxRe - minRe, dy = maxIm - minIm; // inset 5% so seeds land inside Ω, not on ∂Ω
  minRe += 0.05 * dx; maxRe -= 0.05 * dx;
  minIm += 0.05 * dy; maxIm -= 0.05 * dy;

  // σⁿ(w) — n forward iterations; null if the orbit leaves Ω or σ fails.
  const sigmaN = (w: Complex): Complex | null => {
    let cur = w;
    for (let it = 0; it < period; it++) {
      if (!surface.isInOmega(cur)) return null;
      const sv = surface.sigma(cur);
      if (!isFiniteC(sv)) return null;
      cur = sv;
    }
    return cur;
  };

  // ---- grid-seeded Newton on G(w) = σⁿ(w) − w ----
  const roots: Complex[] = [];
  for (let iy = 0; iy < M; iy++) {
    for (let ix = 0; ix < M; ix++) {
      let w: Complex = [minRe + ((ix + 0.5) * (maxRe - minRe)) / M, minIm + ((iy + 0.5) * (maxIm - minIm)) / M];
      if (!surface.isInOmega(w)) continue;
      let converged = false;
      for (let it = 0; it < maxIter; it++) {
        const sN = sigmaN(w);
        if (!sN) break;
        const diffR = sN[0] - w[0], diffI = sN[1] - w[1];
        if (Math.hypot(diffR, diffI) < tol) {
          converged = true;
          break;
        }
        // G′(w) = (σⁿ)′(w) − 1, complex derivative from the forward x-step.
        const sNh = sigmaN([w[0] + h, w[1]]);
        if (!sNh) break;
        const fpR = (sNh[0] - sN[0]) / h - 1;
        const fpI = (sNh[1] - sN[1]) / h;
        const denom = fpR * fpR + fpI * fpI;
        if (denom < 1e-30) break;
        // Newton step −G / G′ (complex division).
        const stepR = -(diffR * fpR + diffI * fpI) / denom;
        const stepI = -(diffI * fpR - diffR * fpI) / denom;
        const nw: Complex = [w[0] + stepR, w[1] + stepI];
        if (!surface.isInOmega(nw)) break;
        w = nw;
      }
      if (!converged) continue;
      if (!roots.some((r) => dist(r, w) < 1e-4)) roots.push(w);
    }
  }

  // ---- trace each root into its cycle (corrected period detection) + cull sub-period duplicates ----
  const cycles: SchwarzCycle[] = [];
  for (const r of roots) {
    const pts: Complex[] = [r];
    let cur = r;
    let truePeriod = 0;
    for (let it = 1; it <= period; it++) {
      if (!surface.isInOmega(cur)) break;
      const sv = surface.sigma(cur);
      if (!isFiniteC(sv)) break;
      if (dist(sv, r) < 1e-4) {
        truePeriod = it; // returned to the start after `it` steps ⇒ that is the period
        break;
      }
      pts.push(sv);
      cur = sv;
    }
    if (truePeriod === 0) continue; // never returned within n steps — a spurious root
    // Cull a cycle that shares a point with an already-found shorter (dividing) cycle.
    const isSubperiod = cycles.some(
      (c) => truePeriod % c.period === 0 && pts.some((p) => c.points.some((q) => dist(p, q) < 1e-4)),
    );
    if (!isSubperiod) cycles.push({ period: truePeriod, points: pts.slice(0, truePeriod) });
  }
  return cycles;
}
