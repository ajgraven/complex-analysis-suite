// cornerClustering.ts — the shared lightning-fit corner machinery.
//
// Three pieces of the lightning method were carried, drift-prone, in three places: the interior
// `scMap.ts` (fast-mode fit), `forwardMap.ts` (the g: 𝔻→Ω pole set), and the Riemann-map app's
// `domains.ts` (its own Ω→𝔻 fit). Consolidated here on the ADR-0007 second-consumer rule (2026-08
// review, finding 03/10):
//
//   - the root-exponential pole-clustering LAW  ρ_k = scale·exp(−σ(√N − √k)),
//   - the Chebyshev EDGE SAMPLER that clusters boundary points toward corners, and
//   - the OUTWARD-direction test (interior bisector, disambiguated by a point-in-polygon probe).
//
// What legitimately DIFFERS between the callers — the *scale policy* (a single global min-edge scale
// in scMap vs a per-corner one in domains) and the *straight-vertex policy* (fall back to an edge
// normal vs skip) — stays a per-call-site choice, expressed through the parameters below. These
// functions reproduce each prior copy bit-for-bit; the golden conformal + Riemann-map corpora pin that.
//
// Convention-neutral (ADR-0006): no π / 2πi here.

import { pointInPolygon } from "@cas/core";

type Pt = [number, number];

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const nrm = (v: Pt): Pt => {
  const r = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / r, v[1] / r];
};

/**
 * The root-exponential clustering radii `ρ_k = scale·exp(−σ(√count − √k))` for `k = 1…count`. They
 * increase toward `scale` (the farthest pole) and → 0⁺ (nearest the corner) as `k → 1`. The single
 * home for the law previously copied verbatim into scMap's `cornerPoles`, forwardMap's
 * `forwardPoles`, and domains' `cornerPoles`.
 */
export function clusteredRadii(count: number, scale: number, sigma = 4): number[] {
  const out: number[] = [];
  for (let k = 1; k <= count; k++) out.push(scale * Math.exp(-sigma * (Math.sqrt(count) - Math.sqrt(k))));
  return out;
}

/**
 * Chebyshev-density samples along each edge of the closed polygon `vertices`, `perEdge` per edge,
 * clustered toward the corners: `t = ½(1 − cos(π(i+offset)/perEdge))`, `i = 0…perEdge−1`.
 * `offset = 0` includes the start vertex of each edge (domains' `cornerBoundary`); `offset = 0.5`
 * uses half-integer nodes that avoid the vertices exactly (scMap's `sampleBoundary`).
 */
export function clusteredEdgeSamples(vertices: readonly Pt[], perEdge: number, offset = 0): Pt[] {
  const n = vertices.length;
  const out: Pt[] = [];
  for (let e = 0; e < n; e++) {
    const a = vertices[e];
    const b = vertices[(e + 1) % n];
    for (let i = 0; i < perEdge; i++) {
      const t = 0.5 * (1 - Math.cos((Math.PI * (i + offset)) / perEdge));
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/**
 * Outward unit direction at corner `w` (with polygon neighbours `prev`, `next`), pointing away from
 * the interior of `polygon`. Starts from the interior angle-bisector direction and disambiguates it
 * with a point-in-polygon probe a step `probeEps` along it — flipping if the probe lands inside — so
 * it is correct for convex AND reflex corners. A straight vertex (bisector ≈ 0) returns `null` when
 * `onStraight = "skip"` (domains); with `onStraight = "normal"` it falls back to the next-edge normal
 * (scMap), and never returns `null`.
 */
export function outwardCornerDir(
  prev: Pt,
  w: Pt,
  next: Pt,
  polygon: readonly Pt[],
  probeEps: number,
  onStraight: "normal",
): Pt;
export function outwardCornerDir(
  prev: Pt,
  w: Pt,
  next: Pt,
  polygon: readonly Pt[],
  probeEps: number,
  onStraight?: "skip",
): Pt | null;
export function outwardCornerDir(
  prev: Pt,
  w: Pt,
  next: Pt,
  polygon: readonly Pt[],
  probeEps: number,
  onStraight: "skip" | "normal" = "skip",
): Pt | null {
  const ep = nrm(sub(prev, w)); // unit direction toward the previous vertex
  const en = nrm(sub(next, w)); // unit direction toward the next vertex
  let d: Pt = [ep[0] + en[0], ep[1] + en[1]]; // interior angle-bisector direction
  if (Math.hypot(d[0], d[1]) < 1e-9) {
    if (onStraight === "skip") return null;
    d = [-en[1], en[0]]; // straight vertex: use the next-edge normal
  }
  d = nrm(d);
  if (pointInPolygon([w[0] + probeEps * d[0], w[1] + probeEps * d[1]], polygon)) d = [-d[0], -d[1]];
  return d;
}
