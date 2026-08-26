// General-K domains for the conductor view (M3.4): compact sets with NO closed-form exterior map, whose
// potential-theory quantities come from the log-lightning fit (logLightning.ts) instead of a pushforward.
// Presets are smooth boundaries defined by a radius function r(θ) (or an off-centre circle). All `≈`.
import type { Pt } from "./transplant.js";
import { fitLogLightning } from "./logLightning.js";

/** A compact set K given by boundary samples + its log-lightning potential-theory fit. */
export interface GeneralDomain {
  readonly id: string;
  readonly name: string;
  readonly kind: "general";
  /** ∂K samples, counter-clockwise (an open loop — no closing duplicate). */
  readonly boundary: Pt[];
  /** Logarithmic capacity (≈, from log-lightning). */
  readonly capacity: number;
  readonly exact: false;
  /** Green's function g_K(z) = 0 on ∂K, ~ log|z| − log cap at ∞. */
  greenFn(z: Pt): number;
  /** Relative equilibrium charge density at a boundary point. */
  chargeDensity(w: Pt): number;
  /** The log-lightning boundary residual (honest ≈ accuracy tag). */
  readonly residual: number;
  readonly note?: string;
}

function fromBoundary(id: string, name: string, boundary: Pt[], note?: string): GeneralDomain {
  const fit = fitLogLightning(boundary);
  return {
    id,
    name,
    kind: "general",
    boundary,
    capacity: fit.capacity,
    exact: false,
    greenFn: fit.greenFn,
    chargeDensity: fit.chargeDensity,
    residual: fit.residual,
    note,
  };
}

/** A closed boundary from a radius function r(θ), counter-clockwise. */
function radial(r: (t: number) => number, n = 260): Pt[] {
  return Array.from({ length: n }, (_, k): Pt => {
    const t = (2 * Math.PI * k) / n;
    const rr = r(t);
    return [rr * Math.cos(t), rr * Math.sin(t)];
  });
}

/** A smooth trefoil-ish blob r(θ) = 1 + 0.3·cos 3θ. */
export const blobDomain = (): GeneralDomain =>
  fromBoundary("blob", "Smooth blob", radial((t) => 1 + 0.3 * Math.cos(3 * t)), "general K — log-lightning (≈)");

/** A rounded oval r(θ) = 1 + 0.35·cos 2θ. */
export const ovalDomain = (): GeneralDomain =>
  fromBoundary("oval", "Rounded oval", radial((t) => 1 + 0.35 * Math.cos(2 * t)), "general K — log-lightning (≈)");

/** A disk of radius 1 centred off the origin (cap = 1, translation-invariant — a clean numerical check). */
export const offDiskDomain = (): GeneralDomain =>
  fromBoundary(
    "offdisk",
    "Off-centre disk",
    Array.from({ length: 260 }, (_, k): Pt => {
      const t = (2 * Math.PI * k) / 260;
      return [0.55 + Math.cos(t), 0.35 + Math.sin(t)];
    }),
    "general K — log-lightning (≈); cap = 1",
  );
