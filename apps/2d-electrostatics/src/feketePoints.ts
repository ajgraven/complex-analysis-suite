// Fekete / Leja points — a third road to the equilibrium measure (M3.3). The equilibrium measure μ_K is
// also the weak-* limit of the normalized counting measures of the extremal points of K: the n points on
// ∂K that (near-)maximize ∏ᵢ<ⱼ|zᵢ−zⱼ|. Their "diameter" (∏|zᵢ−zⱼ|)^{2/n(n−1)} is the n-point transfinite
// diameter dₙ(K), which DECREASES to cap(K) (Fekete's theorem) — tying these points back to the capacity
// the conductor view already shows. Points live on ∂K = Ψ(e^{iθ}), so we work in θ over a fine grid.
//
// We use LEJA points: greedy and sequential (each new point maximizes the product of distances to those
// already chosen), so extending n by one just appends — natural for an interactive n-slider — and they
// equidistribute to μ_K just as the (jointly optimal) Fekete points do. All `≈` (finite n).
import type { Pt } from "./transplant.js";
import type { ExteriorDomain } from "./potentialDomain.js";

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** n Leja points on ∂K = Ψ(∂𝔻), plus their θ-parameters (in choice order — the sequence is nested, so
 *  the first m of them are the m-point Leja set). Greedy over a fine θ-grid; the first point is an extreme
 *  point of K (max |z|), the classic Leja seed. */
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

  // logSum[m] = Σ_{chosen j} log|grid[m] − z_j|; the next point maximizes it (a chosen index → −∞, so it
  // is never re-picked).
  const logSum = new Float64Array(M);
  const chosen: number[] = [];

  // Seed: an extreme point, argmax |z| (ties → the first).
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

  return { points: chosen.map((i) => grid[i]), thetas: chosen.map((i) => gTheta[i]) };
}

/** The n-point transfinite diameter dₙ = (∏ᵢ<ⱼ|zᵢ−zⱼ|)^{2/n(n−1)}. Decreases to cap(K) as n → ∞. Zero
 *  for fewer than 2 points. */
export function transfiniteDiameter(points: readonly Pt[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let e = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e += Math.log(dist(points[i], points[j]));
  return Math.exp((2 * e) / (n * (n - 1)));
}
