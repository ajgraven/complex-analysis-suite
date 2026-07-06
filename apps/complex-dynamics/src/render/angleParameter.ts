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
import { add, div, mul, sub } from "@cas/expr/complexJs";
import { parse } from "@cas/expr/parser";
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
    // A deeper, non-cardioid root (e.g. the period-4 cascade root c = −5/4): no closed form, so
    // Newton-refine the parabolic system, seeded from the ray landing and a period-n cycle point
    // there (from the dynamical ray at the same angle). Falls back to the ray seed if it diverges.
    const cyc = dynamicalLanding(a.p, a.q, seed);
    const root = cyc ? refineParabolicRoot(cyc.point, seed, period) : null;
    return root
      ? { point: root, kind: "root", period, preperiod: 0, refined: true }
      : { point: seed, kind: "root", period, preperiod: 0, refined: false };
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

/**
 * Refine a deeper hyperbolic-component **root** — the parabolic parameter c where the period-n
 * cycle has multiplier exactly 1 — by a 2×2 complex Newton in (z, c) on the system
 *   P(z,c) = fⁿ(z) − z    = 0   (z is a period-n point) and
 *   Q(z,c) = (fⁿ)′(z) − 1 = 0   (the cycle is parabolic, λ = 1),
 * for f(z) = z² + c. Carries the four derivatives along the orbit (z₀ = z, p₀ = 1, q₀ = r₀ = s₀ = 0):
 *   z ← z²+c · p ← 2zp (∂/∂z) · q ← 2zq+1 (∂/∂c) · r ← 2(p²+zr) (∂²/∂z²) · s ← 2(pq+zs) (∂²/∂z∂c),
 * giving the Jacobian J = [[pₙ−1, qₙ], [rₙ, sₙ]] and the step [z;c] −= J⁻¹[P;Q]. This is the general
 * counterpart of the closed-form {@link bulbRoot} (which only covers primary cardioid bulbs): it lands
 * the non-cardioid roots (e.g. the period-4 cascade root c = −5/4) that {@link parameterLanding} would
 * otherwise leave at the approximate ray seed.
 *
 * Seed `c` with the parameter-ray landing and `z` with a period-n cycle point there so Newton
 * converges to *that* component's root, not another solution of the system (a period-m point with
 * m | n also solves it — e.g. the period-2 root −¾ satisfies the period-4 system).
 *
 * Convergence is quadratic at a **primitive** root (z is a *double* root of fⁿ−z, non-singular
 * Jacobian) but only **linear** at a **satellite** root born by period-doubling / p⁄k-bifurcation
 * (there the period-n cycle collides with its lower-period parent, making z a triple-or-higher root
 * of fⁿ−z and the Jacobian singular at the limit). So acceptance is on the **residual** |P|²+|Q|²
 * rather than the step, and the budget is generous. Returns null if it does not converge (a very deep
 * or high-rotation satellite may exhaust the budget → caller keeps the approximate ray seed) or if the
 * result drifts implausibly far from the seed (a sign Newton wandered to a different root).
 */
function refineParabolicRoot(zSeed: Vec2, cSeed: Vec2, period: number): Vec2 | null {
  let z: Vec2 = [zSeed[0], zSeed[1]];
  let c: Vec2 = [cSeed[0], cSeed[1]];
  for (let it = 0; it < 60; it++) {
    let zk: Vec2 = [z[0], z[1]];
    let p: Vec2 = [1, 0]; // ∂z_k/∂z
    let q: Vec2 = [0, 0]; // ∂z_k/∂c
    let r: Vec2 = [0, 0]; // ∂²z_k/∂z²
    let s: Vec2 = [0, 0]; // ∂²z_k/∂z∂c
    for (let k = 0; k < period; k++) {
      // All new values are formed from the current (z_k, p, q, r, s) before any is overwritten.
      const zp = mul(zk, p);
      const zq = mul(zk, q);
      const rr = add(mul(p, p), mul(zk, r));
      const ss = add(mul(p, q), mul(zk, s));
      const nz: Vec2 = [zk[0] * zk[0] - zk[1] * zk[1] + c[0], 2 * zk[0] * zk[1] + c[1]];
      p = [2 * zp[0], 2 * zp[1]];
      q = [2 * zq[0] + 1, 2 * zq[1]];
      r = [2 * rr[0], 2 * rr[1]];
      s = [2 * ss[0], 2 * ss[1]];
      zk = nz;
      if (!Number.isFinite(zk[0]) || !Number.isFinite(zk[1])) return null;
    }
    const P: Vec2 = [zk[0] - z[0], zk[1] - z[1]]; // fⁿ(z) − z
    const Q: Vec2 = [p[0] - 1, p[1]]; // (fⁿ)′(z) − 1
    if (P[0] ** 2 + P[1] ** 2 + Q[0] ** 2 + Q[1] ** 2 < 1e-24) {
      // Residual ≈ 0: the current (z, c) is the root. Reject a jump to a different (lower-period) root
      // — a real component root sits well within the traced ray's reach, so a far result means Newton
      // wandered (e.g. to the period-2 root −¾ instead of the period-4 root −5⁄4).
      return Math.hypot(c[0] - cSeed[0], c[1] - cSeed[1]) < 0.4 ? [c[0], c[1]] : null;
    }
    const a: Vec2 = [p[0] - 1, p[1]]; // ∂P/∂z = pₙ − 1
    const b = q; // ∂P/∂c = qₙ
    const d = r; // ∂Q/∂z = rₙ
    const e = s; // ∂Q/∂c = sₙ
    const det = sub(mul(a, e), mul(b, d)); // ae − bd
    if (det[0] * det[0] + det[1] * det[1] < 1e-30 || !Number.isFinite(det[0])) return null;
    const dz = div(sub(mul(e, P), mul(b, Q)), det); // ( eP − bQ) / det
    const dc = div(sub(mul(a, Q), mul(d, P)), det); // (−dP + aQ) / det
    z = [z[0] - dz[0], z[1] - dz[1]];
    c = [c[0] - dc[0], c[1] - dc[1]];
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  }
  return null;
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
