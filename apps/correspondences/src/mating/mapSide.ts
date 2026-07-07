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
