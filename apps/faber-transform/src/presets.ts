// presets.ts — the curated univalent exterior maps φ: 𝔻* → Ω (M1: interval + ellipse; the k-cusped
// star and general m-fold families arrive at M2). Each is a closed-form finite Laurent map, so no
// numerical Riemann solver is needed. Fixed presets have `shape: null`; parametrized ones expose one
// clamped shape slider whose range keeps φ univalent (a valid domain).
import type { Cx } from "@cas/core";
import type { ExteriorMap } from "@cas/faber";

const re = (x: number): Cx => ({ re: x, im: 0 });

export interface ShapeControl {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

export interface PhiPreset {
  readonly id: string;
  readonly name: string;
  /** Build the exterior map from the shape-slider value (fixed presets ignore it). */
  readonly build: (shape: number) => ExteriorMap;
  /** The clamped shape slider, or null when the preset is fixed. */
  readonly shape: ShapeControl | null;
  /** World half-height framing K for the right panel's default view. */
  readonly kHalf: number;
}

export const PHI_PRESETS: readonly PhiPreset[] = [
  {
    id: "interval",
    name: "Interval [−2, 2] — Joukowski z + 1/z",
    build: () => ({ c: 1, laurent: [re(0), re(1)] }),
    shape: null,
    kHalf: 2.6,
  },
  {
    id: "ellipse",
    name: "Ellipse — z + m/z",
    // K is an ellipse with semi-axes 1 ± m; univalent for |m| < 1 (m → 1 degenerates to the interval).
    build: (m: number) => ({ c: 1, laurent: [re(0), re(m)] }),
    shape: { label: "m", min: 0, max: 0.95, default: 0.5 },
    kHalf: 2.4,
  },
  {
    id: "deltoid",
    name: "Deltoid — z + a/(2z²)",
    // φ(z) = z + a·z^{−2}/2. The coefficient of z^{−2} is a/2, so the area-type univalence bound
    // Σ n|aₙ| ≤ 1 reads 2·(a/2) = a ≤ 1; a → 1 is the 3-cusped deltoid (the ground-truth QD cusp case).
    build: (a: number) => ({ c: 1, laurent: [re(0), re(0), re(a / 2)] }),
    shape: { label: "a", min: 0, max: 0.98, default: 0.85 },
    kHalf: 1.7,
  },
  {
    id: "star5",
    name: "5-cusped star — z + a/(4z⁴)",
    // φ(z) = z + a·z^{−4}/4. Coefficient a/4 at n = 4 ⇒ 4·(a/4) = a ≤ 1 univalent; a → 1 gives 5 cusps.
    build: (a: number) => ({ c: 1, laurent: [re(0), re(0), re(0), re(0), re(a / 4)] }),
    shape: { label: "a", min: 0, max: 0.98, default: 0.85 },
    kHalf: 1.45,
  },
];

/** Look up a preset by id, falling back to the first (interval) for an unknown id. */
export function phiPresetById(id: string): PhiPreset {
  return PHI_PRESETS.find((p) => p.id === id) ?? PHI_PRESETS[0];
}

/**
 * Curated free-form input functions f, all analytic on the closed unit disk (any singularities sit
 * OUTSIDE |z| ≤ 1, so the Taylor series exists there). Entire functions (exp, sin) converge everywhere;
 * the rational ones have a finite radius of convergence R (the distance to the nearest pole), which the
 * app draws as the convergence equipotential Γ_R.
 */
export const F_PRESETS: readonly string[] = [
  "exp(z)",
  "sin(z)",
  "1/(z - 2)",
  "z/(1 - z/3)",
  "exp(z)/(z - 2)",
  "1/(1 + z^2/4)",
  "cos(z) + z^2",
];
