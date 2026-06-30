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
import { parameterRay } from "./rays";

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
