/**
 * angleParameter.ts — "go to external angle": map a rational external angle θ to the parameter it
 * names on the Mandelbrot set (z²+c).
 *
 * This is the inverse of ray drawing. The Hubbard–Schleicher *spider algorithm* solves it from
 * scratch (pulling back a normalised spider, with intersection-number branch selection); here we
 * take the robust, already-tested route to the same answer: trace the parameter ray at θ (globally
 * convergent — it starts at infinity, no nearby guess needed) to its landing point, then hand that
 * as a Newton seed to the exact center / Misiurewicz finder. θ's combinatorics (period / preperiod
 * under doubling) decide which finder to use:
 *   • periodic θ   → the root of a period-n hyperbolic component → Newton-snap to its **center**;
 *   • preperiodic θ → a **Misiurewicz** point fᵐ⁺ᵏ(0) = fᵐ(0).
 *
 * Pure module — the landing + classification only (no DOM/GL); the caller does the Newton refine
 * with `inspect.findNucleus` / `inspect.findMisiurewicz`. The full leg-lifting spider (drawing the
 * convergence, and angles whose rays are hard to land in f64) is a deferred enhancement.
 * See FEATURE_RESEARCH.md §3.1.
 */
import type { Vec2 } from "../arrays";
import { angle, classifyDoubling } from "../combinatorics/angles";
import { parse } from "../expr/parser";
import { bulbRoot } from "./farey";
import { findMisiurewicz } from "./inspect";
import { bulbRayAngles, dynamicRay, parameterRay } from "./rays";

export interface AngleLanding {
  /** Parameter-ray landing point at external angle θ — a Newton seed for the exact finder. */
  seed: Vec2;
  /** Preperiod of θ under doubling (0 ⇒ periodic ⇒ a component center). */
  preperiod: number;
  /** Period of θ under doubling = the period of the landed component / Misiurewicz cycle. */
  period: number;
  /** Which exact finder the seed should feed. */
  kind: "center" | "misiurewicz";
}

/**
 * Land the parameter ray at the rational external angle p/q and classify it under doubling.
 * Returns null for a degenerate angle (θ = 0, the β-fixed-point ray) or a non-integer input.
 */
export function landingForAngle(p: number, q: number): AngleLanding | null {
  let a;
  try {
    a = angle(p, q);
  } catch {
    return null;
  }
  if (a.p === 0) return null; // θ = 0 lands at the β fixed point (cusp tip) — not a useful target
  const { preperiod, period } = classifyDoubling(a);
  const ray = parameterRay(a.p / a.q);
  if (ray.length === 0) return null;
  const seed = ray[ray.length - 1]; // innermost traced point ≈ the landing
  return {
    seed: [seed[0], seed[1]],
    preperiod,
    period,
    kind: preperiod === 0 ? "center" : "misiurewicz",
  };
}

function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y);
}

const MANDEL = parse("z^2+c"); // the z²+c map, for the Misiurewicz Newton refine

export interface ParameterLanding {
  /** The parameter ray's landing point on ∂M. */
  point: Vec2;
  /** How it lands: the cardioid **cusp** (θ = 0), a hyperbolic-component **root** (periodic θ), or a
   *  **Misiurewicz** point (preperiodic θ). */
  kind: "cusp" | "root" | "misiurewicz";
  /** Period of θ under doubling (= the landed component / repelling cycle's period). */
  period: number;
  /** Preperiod of θ under doubling (0 ⇒ periodic). */
  preperiod: number;
  /** true when `point` is exact — a closed-form cardioid-bulb root, the cusp, or a converged
   *  Misiurewicz Newton; false when it is the approximate innermost ray point (a deeper,
   *  non-cardioid root that the general parabolic-root Newton — a follow-up — would refine). */
  refined: boolean;
}

/**
 * The **landing point** of the parameter ray at the rational external angle p/q on ∂M (z²+c) — the
 * point the ray actually reaches, as distinct from {@link landingForAngle} / "go to angle" which
 * navigates to the component *centre*. (Ray 1/3 lands at the *root* c = −3/4, not the period-2
 * centre c = −1.)
 *
 *   • θ = 0        → the cardioid cusp c = 1/4.
 *   • periodic θ   → the **root** of the landed component. Primary (cardioid-attached) bulbs use the
 *                    closed form {@link bulbRoot}; a deeper root falls back to the innermost ray point
 *                    (refined = false) until the general parabolic-root Newton lands (follow-up).
 *   • preperiodic θ → a **Misiurewicz** point, Newton-refined with {@link findMisiurewicz}. The
 *                    critical-orbit preperiod is one more than the doubling preperiod (z₀ = 0 precedes
 *                    z₁ = c), so we pass `preperiod + 1`.
 *
 * Oracles: (0,1) → 1/4; {1/3, 2/3} → −3/4; {1/7, 2/7} → the period-3 root ≈ −0.125 + 0.6495 i;
 * 1/2 → −2; 1/6 → i. Returns null for a non-integer / degenerate input or an untraceable ray.
 */
export function parameterLanding(p: number, q: number): ParameterLanding | null {
  let a;
  try {
    a = angle(p, q);
  } catch {
    return null;
  }
  if (a.p === 0) return { point: [0.25, 0], kind: "cusp", period: 1, preperiod: 0, refined: true };

  const { preperiod, period } = classifyDoubling(a);
  const theta = a.p / a.q;
  const ray = parameterRay(theta);
  if (ray.length === 0) return null;
  const last = ray[ray.length - 1];
  const seed: Vec2 = [last[0], last[1]];

  if (preperiod === 0) {
    // Periodic ⇒ the ray lands at a component root. Match θ to a primary cardioid p′/period bulb
    // (its denominator under doubling is the bulb's period) for the exact closed-form root.
    for (let pp = 1; pp < period; pp++) {
      if (gcd(pp, period) !== 1) continue;
      const pair = bulbRayAngles(pp, period);
      if (!pair) continue;
      if (Math.abs(theta - pair[0]) < 1e-9 || Math.abs(theta - pair[1]) < 1e-9) {
        return { point: bulbRoot(pp, period).c, kind: "root", period, preperiod: 0, refined: true };
      }
    }
    return { point: seed, kind: "root", period, preperiod: 0, refined: false };
  }

  // Preperiodic ⇒ a Misiurewicz point fᵐ⁺ᵏ(0) = fᵐ(0); critical-orbit preperiod = doubling + 1.
  const mis = findMisiurewicz(MANDEL, [0, 0], preperiod + 1, period, seed);
  return {
    point: mis ?? seed,
    kind: "misiurewicz",
    period,
    preperiod,
    refined: mis !== null,
  };
}

export interface DynamicalLanding {
  /** The dynamical ray's landing point on ∂K_c — a repelling (pre)periodic point. */
  point: Vec2;
  /** Periodic (θ purely periodic under doubling) or preperiodic. */
  kind: "periodic" | "preperiodic";
  period: number;
  preperiod: number;
  /** true when the Newton polish converged; false ⇒ the approximate innermost ray point. */
  refined: boolean;
}

/**
 * Newton-polish a dynamical-ray landing (z²+c, fixed c) onto its exact repelling (pre)periodic
 * point: fᵖ(z) = z for a periodic angle, f^{ℓ+k}(z) = f^ℓ(z) for a preperiodic one. Carries the
 * z-derivative d = ∂f^k(z)/∂z (d ← 2·w·d). Returns null if Newton diverges.
 */
function refineLanding(seed: Vec2, c: Vec2, preperiod: number, period: number): Vec2 | null {
  let z: Vec2 = [seed[0], seed[1]];
  const total = preperiod + period;
  for (let it = 0; it < 40; it++) {
    let w: Vec2 = [z[0], z[1]];
    let d: Vec2 = [1, 0];
    let wl: Vec2 = [z[0], z[1]]; // f^ℓ(z)  (= z when preperiod 0)
    let dl: Vec2 = [1, 0]; // ∂f^ℓ(z)/∂z
    for (let k = 0; k < total; k++) {
      if (k === preperiod) {
        wl = [w[0], w[1]];
        dl = [d[0], d[1]];
      }
      const nd: Vec2 = [2 * (w[0] * d[0] - w[1] * d[1]), 2 * (w[0] * d[1] + w[1] * d[0])]; // d ← 2wd
      const nw: Vec2 = [w[0] * w[0] - w[1] * w[1] + c[0], 2 * w[0] * w[1] + c[1]]; // w ← w² + c
      w = nw;
      d = nd;
      if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) return null;
    }
    const g: Vec2 = [w[0] - wl[0], w[1] - wl[1]]; // f^{ℓ+k}(z) − f^ℓ(z)
    const gp: Vec2 = [d[0] - dl[0], d[1] - dl[1]]; // its z-derivative
    const den = gp[0] * gp[0] + gp[1] * gp[1];
    if (den < 1e-30 || !Number.isFinite(den)) return null;
    const delta: Vec2 = [(g[0] * gp[0] + g[1] * gp[1]) / den, (g[1] * gp[0] - g[0] * gp[1]) / den]; // g / gp
    z = [z[0] - delta[0], z[1] - delta[1]];
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return null;
    if (delta[0] * delta[0] + delta[1] * delta[1] < 1e-26) return z;
  }
  return null;
}

/**
 * The landing point of the dynamical (Julia) external ray at angle p/q on ∂K_c (z²+c, fixed c) — the
 * repelling (pre)periodic point the ray lands on. Traces the ray with {@link dynamicRay}, then
 * Newton-polishes it with {@link refineLanding}.
 *
 * Oracle: ray 0 → the β fixed point (1 + √(1−4c))/2 (c = 0 → 1; c = −1 → the golden ratio ≈ 1.618).
 * Returns null for a non-integer input or an untraceable ray.
 */
export function dynamicalLanding(p: number, q: number, c: Vec2): DynamicalLanding | null {
  let a;
  try {
    a = angle(p, q);
  } catch {
    return null;
  }
  const { preperiod, period } = classifyDoubling(a);
  const ray = dynamicRay(a.p / a.q, c);
  if (ray.length === 0) return null;
  const last = ray[ray.length - 1];
  const seed: Vec2 = [last[0], last[1]];
  const refined = refineLanding(seed, c, preperiod, period);
  return {
    point: refined ?? seed,
    kind: preperiod === 0 ? "periodic" : "preperiodic",
    period,
    preperiod,
    refined: refined !== null,
  };
}
