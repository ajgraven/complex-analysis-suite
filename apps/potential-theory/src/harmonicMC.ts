// apps/potential-theory — the walk-on-spheres harmonic-measure Monte Carlo (PT-6c). A live PROBABILISTIC
// road to the equilibrium measure: harmonic measure from ∞ EQUALS μ_K (Kakutani — harmonic measure is the
// Brownian first-hit law — plus Frostman: harmonic measure with pole at ∞ is the equilibrium measure). So
// Brownian walkers released far from K and recorded where they first strike ∂K reconstruct μ_K, honestly
// `≈`. A fourth road beside the charge (exact), the Faber zeros, and the Fekete/Leja points.
//
// Walk-on-spheres jumps a walker to a uniform point on the largest ∂K-free disk around it — the EXACT exit
// distribution of Brownian motion from an empty disk (isotropy). It converges geometrically, so no
// tiny-step time-stepping. A walker that wanders past the far-field circle |z − c| = R is brought back to
// it via the EXACT exterior Poisson kernel (a wrapped-Cauchy draw): in 2D Brownian motion is recurrent, so
// it returns with probability 1, at an angle given by that kernel. The only approximations are the finite
// far-field radius R (a multipole bias in the start ring, suppressed by averaging over the ring) and the ε
// capture shell. Pure + node-testable via a seedable RNG.
import type { Pt } from "@cas/flow";

export type Rng = () => number;

/** mulberry32 — a small deterministic PRNG, for reproducible runs and tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Hit {
  /** The capture point on ∂K (the nearest point of the boundary polyline). */
  readonly point: Pt;
  /** Index of the nearest boundary segment. For an exterior-map K whose polyline is Ψ(e^{iθ}) at uniform
   *  θ, index/N is the uniformizing angle θ/2π — and μ_K is uniform in θ, the validation below. */
  readonly index: number;
}

/** Distance from x to a closed boundary polyline, with the nearest point and its segment index. */
export function distToPolyline(x: Pt, poly: readonly Pt[]): { dist: number; point: Pt; index: number } {
  let best = Infinity;
  let bx = poly[0][0];
  let by = poly[0][1];
  let bi = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((x[0] - a[0]) * abx + (x[1] - a[1]) * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a[0] + t * abx;
    const qy = a[1] + t * aby;
    const dx = x[0] - qx;
    const dy = x[1] - qy;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bx = qx;
      by = qy;
      bi = i;
    }
  }
  return { dist: Math.sqrt(best), point: [bx, by], index: bi };
}

/** Sample the exterior Poisson return: a walker at radius r > R re-enters |·| = R at an angular offset Δ
 *  (relative to its current angle) drawn from the wrapped-Cauchy law with η = R/r — the exact hitting
 *  distribution of Brownian motion on the inner circle of an unbounded annulus. η → 1 (just outside) gives
 *  Δ ≈ 0 (returns near where it left); η → 0 (far out) gives a near-uniform re-entry. */
export function samplePoissonOffset(r: number, R: number, rng: Rng): number {
  const eta = R / r; // ∈ (0, 1)
  const k = (1 - eta) / (1 + eta);
  return 2 * Math.atan(k * Math.tan(Math.PI * (rng() - 0.5)));
}

export interface MCGeometry {
  readonly boundary: readonly Pt[]; // the closed ∂K polyline (ordered)
  readonly center: Pt; // centroid of the polyline
  readonly farR: number; // the far-field release circle |z − c| = farR
  readonly eps: number; // capture shell: a walker within eps of ∂K has "hit"
}

/** Build the MC geometry from a closed boundary polyline: centroid, far-field radius (a multiple of K's
 *  extent), and the capture ε. */
export function mcGeometry(boundary: readonly Pt[], farMul = 8, epsRel = 1.5e-3): MCGeometry {
  let cx = 0;
  let cy = 0;
  for (const p of boundary) {
    cx += p[0];
    cy += p[1];
  }
  cx /= boundary.length;
  cy /= boundary.length;
  let rK = 0;
  for (const p of boundary) rK = Math.max(rK, Math.hypot(p[0] - cx, p[1] - cy));
  rK = rK || 1;
  return { boundary, center: [cx, cy], farR: farMul * rK, eps: epsRel * rK };
}

/** One walker: released uniformly on |z − c| = farR, walk-on-spheres to ∂K. Returns the first-hit point,
 *  or null if it exceeds maxSteps (a negligible fraction — near a cusp — that we discard). */
export function walkOnce(g: MCGeometry, rng: Rng, maxSteps = 4000): Hit | null {
  const [cx, cy] = g.center;
  const ang0 = 2 * Math.PI * rng();
  let x = cx + g.farR * Math.cos(ang0);
  let y = cy + g.farR * Math.sin(ang0);
  for (let s = 0; s < maxSteps; s++) {
    const dxc = x - cx;
    const dyc = y - cy;
    const r = Math.hypot(dxc, dyc);
    if (r > g.farR) {
      // Far field (K-free beyond farR): exact Poisson return to the release circle.
      const a = Math.atan2(dyc, dxc) + samplePoissonOffset(r, g.farR, rng);
      x = cx + g.farR * Math.cos(a);
      y = cy + g.farR * Math.sin(a);
      continue;
    }
    const near = distToPolyline([x, y], g.boundary);
    if (near.dist < g.eps) return { point: near.point, index: near.index };
    // Walk on the largest ∂K-free disk: jump to a uniform point on its boundary.
    const phi = 2 * Math.PI * rng();
    x += near.dist * Math.cos(phi);
    y += near.dist * Math.sin(phi);
  }
  return null;
}

/** Run a batch of walkers, appending hits to `out`; returns how many reached ∂K. */
export function runBatch(g: MCGeometry, count: number, rng: Rng, out: Hit[]): number {
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const h = walkOnce(g, rng);
    if (h) {
      out.push(h);
      hits++;
    }
  }
  return hits;
}

/** Coefficient of variation of the hit counts binned by the uniformizing angle θ = 2π·index/N into `bins`
 *  equal bins. For an exterior-map K (polyline = Ψ(e^{iθ}), uniform θ) μ_K is uniform in θ, so this → the
 *  pure sampling floor (~1/√(hits/bins)) as the run converges — a quantitative "harmonic measure =
 *  equilibrium measure" check. (Meaningless for a slit like the segment, whose polyline double-covers ∂K,
 *  or for a general K, which has no uniformizing map — the caller gates on that.) */
export function uniformThetaCV(counts: readonly number[], bins = 36): number {
  const n = counts.length;
  if (n === 0) return NaN;
  const sum = new Array<number>(bins).fill(0);
  const width = new Array<number>(bins).fill(0); // θ-vertices per bin (uneven when n % bins ≠ 0)
  let total = 0;
  for (let i = 0; i < n; i++) {
    const b = Math.min(bins - 1, Math.floor((i / n) * bins));
    sum[b] += counts[i];
    width[b] += 1;
    total += counts[i];
  }
  if (total === 0) return NaN;
  // Per-bin density = count / (θ-width), so an uneven bin split doesn't itself register as non-uniformity.
  const dens = sum.map((s, k) => (width[k] > 0 ? s / width[k] : 0));
  const mean = dens.reduce((a, b) => a + b, 0) / bins;
  if (mean <= 0) return NaN;
  let v = 0;
  for (const d of dens) v += (d - mean) ** 2;
  return Math.sqrt(v / bins) / mean;
}
