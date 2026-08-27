// Fekete / Leja points — a third road to the equilibrium measure (M3.3). The equilibrium measure μ_K is
// also the weak-* limit of the normalized counting measures of the extremal points of K: the n points on
// ∂K that (near-)maximize ∏ᵢ<ⱼ|zᵢ−zⱼ|. Their "diameter" (∏|zᵢ−zⱼ|)^{2/n(n−1)} CONVERGES to cap(K) — tying
// these points back to the capacity the conductor view already shows. (The monotone DECREASE dₙ ↓ cap is the
// property of the jointly-optimal Fekete configuration / the true set-function dₙ(K); the Leja product below
// converges but is not guaranteed monotone.) Points live on ∂K = Ψ(e^{iθ}), so we work in θ over a fine grid.
//
// We use LEJA points: greedy and sequential (each new point maximizes the product of distances to those
// already chosen), so extending n by one just appends — natural for an interactive n-slider — and they
// equidistribute to μ_K just as the (jointly optimal) Fekete points do. All `≈` (finite n).
import type { Pt } from "./transplant.js";
import type { ExteriorDomain } from "./potentialDomain.js";

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Greedy Leja over a set of candidate points on ∂K: returns the chosen indices (nested — the first k are
 *  the k-point Leja set). The seed is an extreme point (argmax |z|); each subsequent point maximizes the
 *  product of distances to those already chosen (computed in the log domain, so a chosen index → −∞ and is
 *  never re-picked). Shared by the exterior-map and general-K wrappers. */
function lejaIndices(grid: readonly Pt[], count: number): number[] {
  const M = grid.length;
  const logSum = new Float64Array(M);
  const chosen: number[] = [];
  let seed = 0;
  let bestMod = -Infinity;
  for (let m = 0; m < M; m++) {
    const r = Math.hypot(grid[m][0], grid[m][1]);
    if (r > bestMod) {
      bestMod = r;
      seed = m;
    }
  }
  const accumulate = (idx: number): void => {
    for (let m = 0; m < M; m++) logSum[m] += Math.log(dist(grid[m], grid[idx]));
  };
  chosen.push(seed);
  accumulate(seed);
  for (let k = 1; k < count; k++) {
    let bi = 0;
    let bv = -Infinity;
    for (let m = 0; m < M; m++) {
      if (logSum[m] > bv) {
        bv = logSum[m];
        bi = m;
      }
    }
    chosen.push(bi);
    accumulate(bi);
  }
  return chosen;
}

/** n Leja points on ∂K = Ψ(∂𝔻), plus their θ-parameters (in choice order). Greedy over a fine θ-grid. */
export function lejaPoints(domain: ExteriorDomain, n: number, gridSize = 1600): { points: Pt[]; thetas: number[] } {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return { points: [], thetas: [] };
  const M = Math.max(count * 4, gridSize);
  const grid: Pt[] = new Array(M);
  const gTheta: number[] = new Array(M);
  for (let m = 0; m < M; m++) {
    const th = (2 * Math.PI * m) / M;
    gTheta[m] = th;
    grid[m] = domain.evalPsi([Math.cos(th), Math.sin(th)]);
  }
  const chosen = lejaIndices(grid, count);
  return { points: chosen.map((i) => grid[i]), thetas: chosen.map((i) => gTheta[i]) };
}

/** n Leja points chosen from a general boundary curve (∂K samples) — for domains with no exterior map. */
export function lejaFromCurve(curve: readonly Pt[], n: number): Pt[] {
  const count = Math.max(0, Math.min(Math.floor(n), curve.length));
  if (count === 0) return [];
  return lejaIndices(curve, count).map((i) => curve[i]);
}

/** The n-point transfinite diameter dₙ = (∏ᵢ<ⱼ|zᵢ−zⱼ|)^{2/n(n−1)}. Converges to cap(K) as n → ∞ (monotone
 *  decrease holds for the optimal Fekete configuration, not necessarily for the Leja points fed in here).
 *  Zero for fewer than 2 points. */
export function transfiniteDiameter(points: readonly Pt[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let e = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e += Math.log(dist(points[i], points[j]));
  return Math.exp((2 * e) / (n * (n - 1)));
}
