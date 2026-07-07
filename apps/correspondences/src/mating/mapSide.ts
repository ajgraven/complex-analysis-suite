// The map side of the mating — M2. The MAP factor is the anti-polynomial z̄²; its ∞-germ is transported
// into the deltoid σ-plane by the Böttcher structure. σ(w) ≈ (1/2)·w̄² near ∞, so ∞ is a super-attracting
// fixed point and σ carries a Green's function G (the Böttcher MODULUS) on its ∞-basin, with G∘σ = 2G.
// The equipotentials {G = const} are the level sets drawn in the σ-plane; the external ANGLES (the full
// anti-holomorphic Böttcher argument) are the delicate part, left for a later slice.
import { DELTOID, type Complex } from "../deltoid.js";

/** The anti-polynomial z ↦ z̄² = conj(z)². Fixes the cube roots of unity; on |z|=1 it is θ ↦ −2θ. */
export function antiSquare(z: Complex): Complex {
  return [z[0] * z[0] - z[1] * z[1], -2 * z[0] * z[1]];
}

export interface GreenOptions {
  maxIter?: number;
  /** |w| beyond which the orbit is deemed escaped to ∞ (large, since σ ≈ w̄²/2 grows doubly-exponentially). */
  escapeR?: number;
}

/**
 * Green's function of σ's ∞-basin (the Böttcher modulus): G(w) = lim_n log|σⁿ(w)| / 2ⁿ. Returns 0 for
 * points not in the ∞-basin — the σ-orbit falls into K (σ then has no exterior preimage → sigma() is
 * null) or fails to escape. Satisfies the functional equation G(σ(w)) = 2·G(w) exactly (both use the same
 * first iterate to exceed escapeR).
 */
export function greenSigma(w: Complex, opts: GreenOptions = {}): number {
  const maxIter = opts.maxIter ?? 60;
  const escapeR = opts.escapeR ?? 1e6;
  let z = w;
  for (let n = 0; n <= maxIter; n++) {
    const r = Math.hypot(z[0], z[1]);
    if (r > escapeR) return Math.log(r) / Math.pow(2, n);
    const next = DELTOID.sigma(z);
    if (!next) return 0; // no exterior preimage → the orbit left the ∞-basin (fell into K)
    z = next;
  }
  return 0; // never escaped within maxIter → not (effectively) in the ∞-basin
}

/** The z̄² external ray at angle t: radial from the Julia circle outward (Böttcher = identity for z̄²).
 *  z̄² maps the ray at t to the ray at −2t (the equator's doubling map). */
export function externalRay(t: number, rMax = 3, samples = 24): Complex[] {
  const pts: Complex[] = [];
  const c = Math.cos(t);
  const s = Math.sin(t);
  for (let i = 0; i <= samples; i++) {
    const r = 1 + ((rMax - 1) * i) / samples;
    pts.push([r * c, r * s]);
  }
  return pts;
}

/** A z̄² equipotential: the circle |z| = r (Böttcher = identity). */
export function equipotential(r: number, samples = 96): Complex[] {
  const pts: Complex[] = [];
  for (let i = 0; i <= samples; i++) {
    const a = (i / samples) * 2 * Math.PI;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

// ── The external ANGLES transported into σ ──────────────────────────────────────────────────────────
// The map-side external rays (radial, above) are carried into the σ-plane by the Böttcher structure.
// G = greenSigma is harmonic on σ's ∞-basin, so its gradient lines are the level lines of its harmonic
// conjugate arg B — i.e. the external RAYS {arg B = const}. We trace them numerically by flowing along
// ∇G. Only the tracing is approximate (finite-difference ∇G + midpoint steps); the facts it draws — the
// doubling transport R(θ) ↦ R(−2θ) and the three cusp landings — are exact consequences of B∘σ = B̄².

/** Central-difference gradient ∇G = [∂G/∂x, ∂G/∂y] of the σ Green's function at w. */
function greenGradient(w: Complex, opts: GreenOptions, h: number): Complex {
  const gx1 = greenSigma([w[0] + h, w[1]], opts);
  const gx0 = greenSigma([w[0] - h, w[1]], opts);
  const gy1 = greenSigma([w[0], w[1] + h], opts);
  const gy0 = greenSigma([w[0], w[1] - h], opts);
  return [(gx1 - gx0) / (2 * h), (gy1 - gy0) / (2 * h)];
}

export interface SigmaRayOptions extends GreenOptions {
  /** Starting radius near ∞ (there arg B ≈ arg w, so the ray leaves ∞ in the direction θ). */
  rStart?: number;
  /** Arc-length step taken inward each iterate. */
  step?: number;
  /** Stop once G drops below this (the equator neighbourhood; keep ≳ 0.01 so greenSigma still resolves). */
  gFloor?: number;
  /** Safety cap on the number of steps. */
  maxSteps?: number;
  /** Finite-difference spacing for ∇G. */
  gradH?: number;
}

/**
 * The σ external ray at angle θ (radians): the gradient flow line of the Böttcher modulus G = greenSigma,
 * traced from near ∞ inward toward ∂K. Rays are orthogonal to the equipotentials {G = const}; the ray "at
 * θ" leaves ∞ in the direction θ (there arg B(w) ≈ arg w). σ transports rays by the equator's doubling map,
 * R(θ) ↦ R(−2θ); the three rays at that map's fixed angles θ ∈ {0, 2π/3, 4π/3} land at the three cusps
 * 1.5·{1, ω, ω²}. Returns a polyline ordered ∞ → ∂K.
 *
 * ≈ illustrative: numerical gradient tracing (finite-difference ∇G + midpoint steps), NOT a certified
 * Böttcher argument. The angle dynamics θ↦−2θ and the cusp landings it approximates are exact.
 */
export function sigmaExternalRay(theta: number, opts: SigmaRayOptions = {}): Complex[] {
  const rStart = opts.rStart ?? 6;
  const step = opts.step ?? 0.035;
  const gFloor = opts.gFloor ?? 0.01;
  const maxSteps = opts.maxSteps ?? 600;
  const gradH = opts.gradH ?? 4e-3;
  const gopts: GreenOptions = { maxIter: opts.maxIter ?? 48, escapeR: opts.escapeR ?? 1e6 };
  let w: Complex = [rStart * Math.cos(theta), rStart * Math.sin(theta)];
  const pts: Complex[] = [w];
  for (let i = 0; i < maxSteps; i++) {
    // Midpoint (RK2) step of length `step` along −∇G/|∇G| (inward, toward ∂K).
    const g1 = greenGradient(w, gopts, gradH);
    const n1 = Math.hypot(g1[0], g1[1]);
    if (n1 < 1e-9) break;
    const mid: Complex = [w[0] - ((step / 2) * g1[0]) / n1, w[1] - ((step / 2) * g1[1]) / n1];
    const g2 = greenGradient(mid, gopts, gradH);
    const n2 = Math.hypot(g2[0], g2[1]);
    if (n2 < 1e-9) break;
    const next: Complex = [w[0] - (step * g2[0]) / n2, w[1] - (step * g2[1]) / n2];
    const g = greenSigma(next, gopts);
    if (g <= 0) break; // stepped across ∂K into K — stop at the last exterior point
    pts.push(next);
    w = next;
    if (g < gFloor) break; // reached the equator neighbourhood
  }
  return pts;
}

/** The innermost traced point of the σ external ray at θ — its approximate landing on ∂K. */
export function sigmaRayLanding(theta: number, opts: SigmaRayOptions = {}): Complex {
  const ray = sigmaExternalRay(theta, opts);
  return ray[ray.length - 1];
}
