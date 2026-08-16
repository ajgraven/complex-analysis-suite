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
];

/** Look up a preset by id, falling back to the first (interval) for an unknown id. */
export function phiPresetById(id: string): PhiPreset {
  return PHI_PRESETS.find((p) => p.id === id) ?? PHI_PRESETS[0];
}
