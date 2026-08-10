// domains.ts — preset smooth Jordan domains for the numerical Riemann map (P3b), plus the natural
// "polar" source grid whose image under the fitted map f: Ω → 𝔻 is the conformal grid in the disk.
//
// Every preset is star-shaped about the origin (0 ∈ Ω), given by a polar radius r(θ) > 0, so the source
// grid is unambiguous: radial spokes 0 → ∂Ω and nested rings t·∂Ω. Sampling the boundary and mapping the
// grid forward needs only the FORWARD map (no inverse), so it composes with P3a's solver directly. Pure
// data + geometry; node-tested.

export type C = [number, number];

export interface DomainPreset {
  readonly id: string;
  readonly name: string;
  /** Polar boundary radius r(θ) > 0 (boundary point = r(θ)·(cos θ, sin θ)); star-shaped about 0. */
  radius(theta: number): number;
}

/** Off-centre disk |z − c| = R as a polar radius about 0 (positive root; requires |c| < R so 0 ∈ Ω). */
function offCentreDiskRadius(c: number, R: number): (t: number) => number {
  return (t) => c * Math.cos(t) + Math.sqrt(Math.max(0, R * R - c * c * Math.sin(t) * Math.sin(t)));
}

export const DOMAIN_PRESETS: readonly DomainPreset[] = [
  { id: "ellipse", name: "Ellipse (3:2)", radius: (t) => (1.5 * 1.0) / Math.hypot(1.0 * Math.cos(t), 1.5 * Math.sin(t)) },
  { id: "offdisk", name: "Off-centre disk", radius: offCentreDiskRadius(0.45, 1) },
  { id: "blob", name: "Smooth blob", radius: (t) => 1 + 0.3 * Math.cos(3 * t) },
  { id: "oval", name: "Rounded oval", radius: (t) => 1 + 0.35 * Math.cos(2 * t) },
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
