// domains.ts — preset smooth Jordan domains for the numerical Riemann map (P3b), plus the natural
// "polar" source grid whose image under the fitted map f: Ω → 𝔻 is the conformal grid in the disk.
//
// Every preset is star-shaped about the origin (0 ∈ Ω), given by a polar radius r(θ) > 0, so the source
// grid is unambiguous: radial spokes 0 → ∂Ω and nested rings t·∂Ω. Sampling the boundary and mapping the
// grid forward needs only the FORWARD map (no inverse), so it composes with P3a's solver directly. Pure
// data + geometry; node-tested.

import { pointInPolygon } from "@cas/core";

export type C = [number, number];

export interface DomainPreset {
  readonly id: string;
  readonly name: string;
  /** Polar boundary radius r(θ) > 0 (boundary point = r(θ)·(cos θ, sin θ)); star-shaped about 0. */
  radius(theta: number): number;
  /** Corner vertices (for a polygon), where g is singular and the lightning solver clusters poles.
   *  Absent ⇒ a smooth domain (polynomial-only fit). */
  readonly corners?: readonly C[];
}

// --- polygon geometry (P3c) -------------------------------------------------------------------

/** Ray-cast radius r(θ) of a star-shaped polygon about 0: distance from 0 to ∂Ω along direction θ. */
function polygonRadius(vertices: readonly C[]): (t: number) => number {
  return (t) => {
    const cx = Math.cos(t);
    const cy = Math.sin(t);
    let best = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const det = ex * cy - ey * cx; // s·dir − u·e = a
      if (Math.abs(det) < 1e-12) continue;
      const s = (ex * a[1] - ey * a[0]) / det; // distance along the ray
      const u = (cx * a[1] - cy * a[0]) / det; // position along the edge
      if (u >= -1e-9 && u <= 1 + 1e-9 && s > 1e-9 && s < best) best = s;
    }
    return Number.isFinite(best) ? best : 1;
  };
}

// pointInPolygon (even-odd ray cast) is the shared @cas/core geometry primitive (ADR-0007),
// re-exported so the corner-pole outward-direction flip below and this module's consumers keep
// using it unchanged.
export { pointInPolygon };

const nrm = (v: C): C => {
  const r = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / r, v[1] / r];
};
const dist = (a: C, b: C): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Boundary samples of a polygon with points clustered toward each corner (a Chebyshev density
 * t = ½(1−cos πu) on every edge), so the least-squares fit resolves the corner singularities.
 */
export function cornerBoundary(corners: readonly C[], perEdge = 90): C[] {
  const pts: C[] = [];
  const K = corners.length;
  for (let i = 0; i < K; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % K];
    for (let k = 0; k < perEdge; k++) {
      const t = 0.5 * (1 - Math.cos((Math.PI * k) / perEdge)); // clusters toward both endpoints
      pts.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return pts;
}

/**
 * Poles for the rational part of the lightning fit: at each corner, `nPerCorner` poles clustered
 * root-exponentially toward the corner (distance L·exp(−σ(√N−√k))), on the OUTWARD side of ∂Ω (oriented
 * by a point-in-polygon test, so it is correct for both convex and reflex corners).
 */
export function cornerPoles(corners: readonly C[], nPerCorner = 16, sigma = 4): C[] {
  const poles: C[] = [];
  const K = corners.length;
  for (let i = 0; i < K; i++) {
    const w = corners[i];
    const prev = corners[(i - 1 + K) % K];
    const next = corners[(i + 1) % K];
    const bis: C = [nrm([prev[0] - w[0], prev[1] - w[1]])[0] + nrm([next[0] - w[0], next[1] - w[1]])[0], nrm([prev[0] - w[0], prev[1] - w[1]])[1] + nrm([next[0] - w[0], next[1] - w[1]])[1]];
    if (Math.hypot(bis[0], bis[1]) < 1e-9) continue; // straight (not a real corner)
    let d = nrm([-bis[0], -bis[1]]); // outward = negative interior bisector…
    const L = 0.5 * Math.min(dist(w, prev), dist(w, next));
    if (pointInPolygon([w[0] + 0.01 * L * d[0], w[1] + 0.01 * L * d[1]], corners)) d = [-d[0], -d[1]]; // …flip if it pointed in
    for (let k = 1; k <= nPerCorner; k++) {
      const rho = L * Math.exp(-sigma * (Math.sqrt(nPerCorner) - Math.sqrt(k)));
      poles.push([w[0] + rho * d[0], w[1] + rho * d[1]]);
    }
  }
  return poles;
}

/** Off-centre disk |z − c| = R as a polar radius about 0 (positive root; requires |c| < R so 0 ∈ Ω). */
function offCentreDiskRadius(c: number, R: number): (t: number) => number {
  return (t) => c * Math.cos(t) + Math.sqrt(Math.max(0, R * R - c * c * Math.sin(t) * Math.sin(t)));
}

/** A regular n-gon (circumradius R) centred at 0, vertices from the given start angle. */
function regularPolygon(sides: number, R: number, phase = Math.PI / 2): C[] {
  return Array.from({ length: sides }, (_, k): C => {
    const a = phase + (2 * Math.PI * k) / sides;
    return [R * Math.cos(a), R * Math.sin(a)];
  });
}

const SQUARE = regularPolygon(4, Math.SQRT2, Math.PI / 4); // axis-aligned unit square, corners at (±1,±1)
const TRIANGLE = regularPolygon(3, 1.3);
const PENTAGON = regularPolygon(5, 1.15);

function polygonPreset(id: string, name: string, vertices: C[]): DomainPreset {
  return { id, name, radius: polygonRadius(vertices), corners: vertices };
}

export const DOMAIN_PRESETS: readonly DomainPreset[] = [
  { id: "ellipse", name: "Ellipse (3:2)", radius: (t) => (1.5 * 1.0) / Math.hypot(1.0 * Math.cos(t), 1.5 * Math.sin(t)) },
  { id: "offdisk", name: "Off-centre disk", radius: offCentreDiskRadius(0.45, 1) },
  { id: "blob", name: "Smooth blob", radius: (t) => 1 + 0.3 * Math.cos(3 * t) },
  { id: "oval", name: "Rounded oval", radius: (t) => 1 + 0.35 * Math.cos(2 * t) },
  polygonPreset("square", "Square", SQUARE),
  polygonPreset("triangle", "Triangle", TRIANGLE),
  polygonPreset("pentagon", "Pentagon", PENTAGON),
] as const;

/** The preset with this id, or undefined. */
export function domainById(id: string): DomainPreset | undefined {
  return DOMAIN_PRESETS.find((d) => d.id === id);
}

/** Sample ∂Ω at `m` equally-spaced angles (an open list — the caller closes it if needed). */
export function sampleDomainBoundary(d: DomainPreset, m: number): C[] {
  return Array.from({ length: m }, (_, j): C => {
    const t = (2 * Math.PI * j) / m;
    const r = d.radius(t);
    return [r * Math.cos(t), r * Math.sin(t)];
  });
}

export interface ConformalGrid {
  /** ∂Ω as a closed polyline. */
  readonly boundary: C[];
  /** Radial spokes 0 → ∂Ω (each a polyline). */
  readonly spokes: C[][];
  /** Nested rings t·∂Ω for a few 0 < t < 1 (each a closed polyline). */
  readonly rings: C[][];
}

/**
 * The polar source grid of Ω: `nSpokes` radial lines and `nRings` nested scaled boundaries, each sampled
 * at `res` points (so their forward images render as smooth curves). The spokes start just off 0 to avoid
 * the removable log-singularity of g at the centre.
 */
export function conformalSourceGrid(d: DomainPreset, nSpokes = 24, nRings = 6, res = 160): ConformalGrid {
  const bpts = sampleDomainBoundary(d, res);
  const boundary: C[] = [...bpts, bpts[0]];

  const spokes: C[][] = [];
  for (let k = 0; k < nSpokes; k++) {
    const a = (2 * Math.PI * k) / nSpokes;
    const end: C = [d.radius(a) * Math.cos(a), d.radius(a) * Math.sin(a)];
    const line: C[] = [];
    for (let i = 0; i <= res; i++) {
      const s = 0.02 + (0.98 * i) / res; // from just off centre out to ∂Ω
      line.push([s * end[0], s * end[1]]);
    }
    spokes.push(line);
  }

  const rings: C[][] = [];
  for (let i = 1; i <= nRings; i++) {
    const t = i / (nRings + 1);
    const ring: C[] = bpts.map((p): C => [t * p[0], t * p[1]]);
    ring.push(ring[0]);
    rings.push(ring);
  }

  return { boundary, spokes, rings };
}
