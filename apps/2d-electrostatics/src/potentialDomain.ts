// Potential theory on a compact set K (M3.1). The electrostatic lens made literal: the equilibrium
// measure μ_K IS the charge density on a grounded conductor K, the (logarithmic) capacity cap(K) is its
// capacitance, and the Green's function g_K(·,∞) is its exterior potential. Every quantity comes from the
// EXTERIOR map Ψ: 𝔻* = {|w| ≥ 1} → ext(K), Ψ(w) = c·w + Σ_{k≥1} aₖ·w⁻ᵏ with c = cap(K):
//
//   • capacity      cap(K) = |c|                        (the leading coefficient)               [=]
//   • equilibrium μ = Ψ⁎(dθ/2π): the images Ψ(e^{iθ}) at UNIFORM θ — their density on ∂K is the charge
//   • Green curves  g_K = t  ⇔  Ψ(|w| = eᵗ)             (exterior equipotentials, t = 0 is ∂K)   [=]
//
// Polygons get Ψ from the exterior Schwarz–Christoffel fit (polygonMap.ts); the closed-form classes
// (disk / ellipse / segment / deltoid) carry Ψ as an explicit finite Laurent map. Both reduce to one
// evalPsi, so the samplers below are domain-agnostic. All `=` for these classes.
import type { Pt } from "./transplant.js";
import { fitPolygonFlow } from "./polygonMap.js";

/** A compact set K exposed through its exterior map Ψ: 𝔻* → ext(K). */
export interface ExteriorDomain {
  readonly id: string;
  readonly name: string;
  /** Ψ(w) → z for |w| ≥ 1 (Ψ(w) ~ c·w at ∞). */
  evalPsi(w: Pt): Pt;
  /** Logarithmic capacity cap(K) = |c|. */
  readonly capacity: number;
  /** `=` (closed-form / converged SC) vs `≈` (degraded / truncated). */
  readonly exact: boolean;
  /** An optional ground-truth note (e.g. the arcsine law on a segment). */
  readonly note?: string;
}

/** Ψ(w) = c·w + Σ_{k≥1} laurent[k]·w⁻ᵏ (laurent[0] = 0, the centred convention). Shared by every class. */
export function laurentEval(c: number, laurent: readonly Pt[], w: Pt): Pt {
  let accRe = c * w[0];
  let accIm = c * w[1];
  const d = w[0] * w[0] + w[1] * w[1];
  const invRe = w[0] / d;
  const invIm = -w[1] / d;
  let pRe = 1;
  let pIm = 0; // w^{−k}
  for (let k = 0; k < laurent.length; k++) {
    accRe += laurent[k][0] * pRe - laurent[k][1] * pIm;
    accIm += laurent[k][0] * pIm + laurent[k][1] * pRe;
    const nRe = pRe * invRe - pIm * invIm;
    const nIm = pRe * invIm + pIm * invRe;
    pRe = nRe;
    pIm = nIm;
  }
  return [accRe, accIm];
}

/** A closed-form exterior-map domain from an explicit finite Laurent map (capacity = c, real-positive). */
function laurentDomain(id: string, name: string, c: number, laurent: readonly Pt[], note?: string): ExteriorDomain {
  return { id, name, evalPsi: (w) => laurentEval(c, laurent, w), capacity: c, exact: true, note };
}

// --- Closed-form classes (exact Ψ) -------------------------------------------------------------------

/** The disk |z| ≤ r: Ψ(w) = r·w, uniform equilibrium measure, cap = r. */
export const diskDomain = (r: number): ExteriorDomain => laurentDomain("disk", `Disk (r=${r})`, r, [], "μ uniform on |z|=r");

/** The ellipse with semi-axes a (x), b (y): Ψ(w) = ((a+b)/2)·w + ((a−b)/2)·w⁻¹, cap = (a+b)/2. */
export const ellipseDomain = (a: number, b: number): ExteriorDomain =>
  laurentDomain("ellipse", `Ellipse (${a}:${b})`, (a + b) / 2, [[0, 0], [(a - b) / 2, 0]]);

/** The segment [−h, h] (a degenerate ellipse, b = 0): Ψ(w) = (h/2)(w + w⁻¹), cap = h/2, arcsine law. */
export const segmentDomain = (h: number): ExteriorDomain =>
  laurentDomain("segment", `Segment [−${h}, ${h}]`, h / 2, [[0, 0], [h / 2, 0]], "μ = arcsine law 1/(π√(h²−x²))");

/** The deltoid (hypocycloid): Ψ(w) = w + ½·w⁻², cap = 1. */
export const deltoidDomain = (): ExteriorDomain => laurentDomain("deltoid", "Deltoid", 1, [[0, 0], [0, 0], [0.5, 0]]);

// --- Polygon class (exterior SC fit) -----------------------------------------------------------------

/** A polygon K via the exterior Schwarz–Christoffel fit (polygonMap.ts). `exact` reflects the fit's
 *  converged/degraded flags — a degraded fit is honestly `≈`. Throws propagate to the caller (a
 *  degenerate polygon), which flags `⚠`. */
export function polygonDomain(id: string, name: string, corners: readonly Pt[]): ExteriorDomain {
  const m = fitPolygonFlow(corners);
  return {
    id,
    name,
    evalPsi: (w) => m.evalPsi(w),
    capacity: m.capacity,
    exact: m.converged && !m.degraded,
  };
}

// --- Samplers (domain-agnostic) ----------------------------------------------------------------------

const TWO_PI = 2 * Math.PI;

/** The equilibrium charge: Ψ(e^{iθ}) at n UNIFORM angles θ — points ON ∂K whose density is the charge
 *  density (they crowd where Ψ stretches ∂𝔻: corners, tips). μ_K = Ψ⁎(dθ/2π). */
export function equilibriumDots(domain: ExteriorDomain, n = 180): Pt[] {
  const dots: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const t = (TWO_PI * k) / n;
    dots.push(domain.evalPsi([Math.cos(t), Math.sin(t)]));
  }
  return dots;
}

/** Local charge density at each equilibrium dot, ≈ (dθ/2π)/ds with ds the arc length to the next dot —
 *  a relative measure (its integral over ∂K is 1). Peaks at corners/tips, vanishes on flats/of a disk. */
export function chargeDensity(dots: readonly Pt[]): number[] {
  const n = dots.length;
  const gap = (i: number): number => {
    const a = dots[i];
    const b = dots[(i + 1) % n];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  // density_i ∝ 1 / (mean arc gap around dot i); normalise so Σ density_i · ds_i = 1.
  const ds = dots.map((_, i) => 0.5 * (gap(i) + gap((i - 1 + n) % n)));
  const raw = ds.map((s) => (s > 0 ? 1 / s : 0));
  const total = raw.reduce((acc, r, i) => acc + r * ds[i], 0) || 1;
  return raw.map((r) => r / total);
}

/** A Green's-function equipotential g_K = t: Ψ({|w| = eᵗ}) as a closed polyline. t = 0 gives ∂K itself;
 *  larger t gives curves nested farther out (g_K(z) ~ log|z| − log cap at ∞). */
export function greenCurve(domain: ExteriorDomain, t: number, samples = 360): Pt[] {
  const R = Math.exp(t);
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const th = (TWO_PI * i) / samples;
    pts.push(domain.evalPsi([R * Math.cos(th), R * Math.sin(th)]));
  }
  return pts;
}

/** A field line of the conductor: Ψ({arg w = θ₀, |w| ≥ 1}) — orthogonal to the equipotentials, running
 *  from ∂K out to ∞. */
export function fieldLine(domain: ExteriorDomain, theta0: number, tMax = 1.6, samples = 80): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const R = Math.exp((tMax * i) / samples);
    pts.push(domain.evalPsi([R * Math.cos(theta0), R * Math.sin(theta0)]));
  }
  return pts;
}
