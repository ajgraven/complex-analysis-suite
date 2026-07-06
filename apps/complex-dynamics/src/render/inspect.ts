/**
 * Click-to-inspect: turn a clicked point into a small dynamics report. Classifies
 * the orbit and, when it settles to an attracting cycle, reports the period, the
 * cycle multiplier λ = ∏ f′(z_k), and the combinatorial rotation number p/q (the
 * bulb's internal angle). When the orbit escapes it reports an exterior distance
 * estimate. Everything runs on the CPU with the expression evaluator, so it costs
 * one classification per click — never per mouse-move.
 *
 * Plane semantics: on the parameter plane the orbit studied is the critical orbit
 * (start = the critical point) at `c = the clicked point`; on the dynamical plane
 * it is the orbit of the clicked point at the fixed `c`. The multiplier, period and
 * rotation number need the multiplier of the *attracting cycle*, identical in both
 * cases; only the distance estimate differs (∂/∂c on the parameter plane,
 * ∂/∂z on the dynamical plane).
 *
 * The complex multiplier λ and the exterior distance need a holomorphic `f` (so f′ is well
 * defined). For a non-holomorphic `f` (abs-maps, the assignment presets) the multiplier
 * MAGNITUDE |λ| is still reported — the spectral radius of the product of the real 2×2 Jacobians
 * around the cycle (see ./jacobian) — while arg λ and the distance are null; the period and the
 * rotation number, being purely combinatorial, always hold.
 */

import type { Complex } from "../complex";
import type { Node } from "@cas/expr/ast";
import * as C from "@cas/expr/complexJs";
import { differentiate } from "@cas/expr/derivative";
import { makeComplexFn, getComplexFn, getEscapeFn } from "@cas/expr/evaluate";
import { classifyRotationNumber, type RotationClass } from "./brjuno";
import { cycleMultiplierMag } from "./jacobian";
import { classifyOrbit, type OrbitFate } from "./overlay";

/** One plane's worth of inspector output. */
export interface InspectResult {
  fate: OrbitFate;
  /** Attracting-cycle period (1 = fixed point); 0 if escaped/unknown. */
  period: number;
  /** Iterations to escape (escaped orbits only). */
  escapeIter: number;
  /** Cycle multiplier λ = ∏ f′(z_k) over the cycle, or null when f is non-holomorphic. */
  multiplier: Complex | null;
  /** |λ| (attracting < 1, indifferent = 1), or null. */
  multiplierMag: number | null;
  /** Combinatorial rotation number (q = period), or null when undefined. */
  rotation: { p: number; q: number } | null;
  /** Exterior distance estimate in plot units (escaped + holomorphic only), else null. */
  distance: number | null;
  /**
   * Attracting-cycle points in orbit order (z-plane values), or null when the orbit
   * does not settle to a finite cycle. These live in the dynamical (z) plane, so they
   * are meaningful to draw on the dynamical plot only — never on the parameter plane.
   */
  cyclePoints: Complex[] | null;
}

/** Type of the Fatou component a cycle bounds, from its multiplier λ. */
export type FatouType =
  | "superattracting"
  | "attracting"
  | "repelling"
  | "parabolic"
  | "siegel"
  | "cremer"
  | "neutral";

/** Fatou-component classification of an inspected cycle (see {@link fatouComponentType}). */
export interface FatouInfo {
  type: FatouType;
  /** Rotation number θ = arg(λ)/2π ∈ [0,1) for an indifferent cycle, else null. */
  theta: number | null;
  /** Brjuno classification of θ (indifferent + holomorphic only), else null. */
  rotation: RotationClass | null;
}

/** ||λ|−1| below this ⇒ indifferent (matches showInspect + juliaProperties' neutral band). */
const NEUTRAL_TOL = 1e-3;
/** |λ| below this ⇒ superattracting (the cycle contains a critical point). */
const SUPERATTRACTING_TOL = 1e-6;

/**
 * Classify the Fatou component a cycle bounds from its multiplier λ:
 *   |λ| < 1 → attracting (|λ| ≈ 0 → superattracting), |λ| > 1 → repelling, |λ| = 1 → indifferent.
 * For an indifferent cycle the rotation number θ = arg(λ)/2π splits it into **parabolic**
 * (θ rational) vs a rotation domain — a **Siegel** disc (θ Brjuno) or a **Cremer** point
 * (θ non-Brjuno) — via {@link classifyRotationNumber}.
 *
 * Returns null when there is no multiplier at all. A non-holomorphic f has only |λ| (no arg λ),
 * so an indifferent cycle there can only be reported as "neutral".
 */
export function fatouComponentType(
  multiplier: Complex | null,
  mag: number | null,
): FatouInfo | null {
  if (mag === null) return null;
  if (mag < 1 - NEUTRAL_TOL) {
    const type = mag < SUPERATTRACTING_TOL ? "superattracting" : "attracting";
    return { type, theta: null, rotation: null };
  }
  if (mag > 1 + NEUTRAL_TOL) return { type: "repelling", theta: null, rotation: null };
  if (!multiplier) return { type: "neutral", theta: null, rotation: null }; // |λ|≈1, arg unknown
  let theta = Math.atan2(multiplier[1], multiplier[0]) / (2 * Math.PI);
  theta -= Math.floor(theta); // → [0, 1)
  const rotation = classifyRotationNumber(theta);
  const type: FatouType =
    rotation.kind === "rational" ? "parabolic" : rotation.kind === "cremer" ? "cremer" : "siegel";
  return { type, theta, rotation };
}

const MAX_DE_ITER = 1024; // cap for the CPU distance-estimate loop
const SETTLE = 1024; // iterations to land on the attractor before sampling the cycle

const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Iterate from `z0` until on the attractor, then return the `period` cycle points in orbit order. */
function locateCycle(
  f: (z: Complex, c: Complex) => Complex,
  z0: Complex,
  c: Complex,
  period: number,
): Complex[] {
  let z: Complex = [z0[0], z0[1]];
  for (let k = 0; k < SETTLE; k++) {
    z = f(z, c);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return [];
  }
  const pts: Complex[] = [z];
  for (let k = 1; k < period; k++) {
    z = f(z, c);
    pts.push(z);
  }
  return pts;
}

/**
 * Newton-refine an attracting cycle to ~1e-13: polish one point on fᵖ(z) − z = 0 (Newton step
 * z − (fᵖ(z) − z)/((fᵖ)′(z) − 1)), then regenerate the cycle by iterating f. Seeded with the
 * approximate cycle classifyOrbit already located, so it converges in a few steps — far cheaper
 * and more accurate than re-settling. Falls back to the seed-derived cycle if a step goes
 * non-finite or (fᵖ)′ ≈ 1 (a parabolic/indifferent cycle, which Newton can't refine).
 */
function refineCycle(
  f: (z: Complex, c: Complex) => Complex,
  fz: (z: Complex, c: Complex) => Complex,
  seed: Complex,
  c: Complex,
  period: number,
): Complex[] {
  let z: Complex = [seed[0], seed[1]];
  for (let it = 0; it < 30; it++) {
    let w: Complex = [z[0], z[1]];
    let d: Complex = [1, 0]; // (fᵖ)′(z) = ∏ f′ along the orbit
    let ok = true;
    for (let k = 0; k < period; k++) {
      d = C.mul(fz(w, c), d);
      w = f(w, c);
      if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) {
        ok = false;
        break;
      }
    }
    if (!ok) break;
    const gp: Complex = [d[0] - 1, d[1]]; // (fᵖ)′(z) − 1
    if (cabs(gp) < 1e-12) break; // parabolic / flat — Newton can't refine
    const delta = C.div([w[0] - z[0], w[1] - z[1]], gp);
    const next: Complex = [z[0] - delta[0], z[1] - delta[1]];
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) break;
    z = next;
    if (cabs(delta) < 1e-13) break;
  }
  const pts: Complex[] = [[z[0], z[1]]];
  let w: Complex = [z[0], z[1]];
  for (let k = 1; k < period; k++) {
    w = f(w, c);
    pts.push([w[0], w[1]]);
  }
  return pts;
}

/**
 * Combinatorial rotation number of a cycle: how many positions one dynamical step
 * advances around the cycle's centroid, as a reduced fraction p/q (q = period). This
 * is the bulb's internal angle (1/2 at the period-2 neck, 1/3 at the period-3 bulb …)
 * and is stable across the whole component because it is combinatorial, not metric.
 * Returns null for a fixed point or a degenerate (collinear/coincident) arrangement.
 */
export function rotationNumber(cycle: Complex[]): { p: number; q: number } | null {
  const q = cycle.length;
  if (q < 2) return null;
  let cx = 0;
  let cy = 0;
  for (const w of cycle) {
    cx += w[0];
    cy += w[1];
  }
  cx /= q;
  cy /= q;
  // A collinear cycle (e.g. a real period-q window, q ≥ 3) has no winding around the
  // centroid — the points cluster at two angles, so the angular order, and any rotation
  // number from it, is ill-defined. Detect collinearity via the cross product against the
  // longest centroid-relative vector and bail. (q = 2 is genuinely ½ and is kept.)
  const rel = cycle.map((w): Complex => [w[0] - cx, w[1] - cy]);
  if (q >= 3) {
    let ref = rel[0];
    let maxR = 0;
    for (const u of rel) {
      const r = Math.hypot(u[0], u[1]);
      if (r > maxR) {
        maxR = r;
        ref = u;
      }
    }
    let maxCross = 0;
    for (const u of rel) maxCross = Math.max(maxCross, Math.abs(ref[0] * u[1] - ref[1] * u[0]));
    if (maxCross < 1e-6 * maxR * maxR) return null;
  }
  const ang = rel.map((u) => Math.atan2(u[1], u[0]));
  // Rank the points by angle around the centroid (CCW order).
  const order = [...ang.keys()].sort((i, j) => ang[i] - ang[j]);
  const rank = new Array<number>(q);
  order.forEach((idx, r) => (rank[idx] = r));
  // One step takes point 0 → point 1; the angular gap between their ranks is p.
  let p = (rank[1] - rank[0]) % q;
  if (p < 0) p += q;
  if (p === 0) return null; // points coincide / collapse — no well-defined rotation
  const g = gcd(p, q);
  return { p: p / g, q: q / g };
}

/** ∂f/∂z and ∂f/∂c as JS closures, or null when f is non-holomorphic. */
function derivatives(
  fAst: Node,
  a: Complex,
): { fz: (z: Complex, c: Complex) => Complex; fc: (z: Complex, c: Complex) => Complex } | null {
  try {
    return {
      fz: makeComplexFn(differentiate(fAst, "z"), a),
      fc: makeComplexFn(differentiate(fAst, "c"), a),
    };
  } catch {
    return null; // a non-holomorphic op (abs/re/im/…) or an assignment/recursion form
  }
}

/**
 * Exterior distance estimate d ≈ |z|·log|z| / |D|, carrying the running derivative
 * D = ∂z/∂c (parameter plane) or ∂z/∂z₀ (dynamical plane) alongside the orbit.
 */
function escapeDistance(
  fAst: Node,
  escapeAst: Node,
  plane: "param" | "dyn",
  z0: Complex,
  c: Complex,
  a: Complex,
  deriv: { fz: (z: Complex, c: Complex) => Complex; fc: (z: Complex, c: Complex) => Complex },
): number | null {
  const f = getComplexFn(fAst, a);
  const esc = getEscapeFn(escapeAst, fAst, a);
  let z: Complex = [z0[0], z0[1]];
  let der: Complex = plane === "param" ? [0, 0] : [1, 0]; // D₀ = 0 (param), z′₀ = 1 (dyn)
  for (let k = 0; k < MAX_DE_ITER; k++) {
    if (esc(z, c)) break;
    // Advance the derivative at the current iterate, before advancing z.
    const step = C.mul(deriv.fz(z, c), der);
    der = plane === "param" ? C.add(step, deriv.fc(z, c)) : step;
    z = f(z, c);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) break;
  }
  const az = cabs(z);
  const ad = cabs(der);
  if (az <= 1 || ad === 0 || !Number.isFinite(ad)) return null;
  return (0.5 * az * Math.log(az)) / ad;
}

/** Classify and measure the orbit at a clicked point. See the module comment for plane semantics. */
export function inspect(
  fAst: Node,
  escapeAst: Node,
  plane: "param" | "dyn",
  z0: Complex,
  c: Complex,
  a: Complex = [0, 0],
): InspectResult {
  const info = classifyOrbit(fAst, escapeAst, z0, c, a);
  const out: InspectResult = {
    fate: info.fate,
    period: info.period,
    escapeIter: info.escapeIter,
    multiplier: null,
    multiplierMag: null,
    rotation: null,
    distance: null,
    cyclePoints: null,
  };
  const deriv = derivatives(fAst, a);

  if ((info.fate === "converged" || info.fate === "periodic") && info.period >= 1) {
    const f = getComplexFn(fAst, a);
    // Reuse the cycle classifyOrbit already found (no 1024-step re-settle); Newton-refine it
    // to ~1e-13 when f is holomorphic, else fall back to settling from z0.
    const seed =
      info.cyclePoints && info.cyclePoints.length === info.period
        ? info.cyclePoints
        : locateCycle(f, z0, c, info.period);
    const cycle =
      deriv && seed.length === info.period
        ? refineCycle(f, deriv.fz, seed[0], c, info.period)
        : seed;
    if (cycle.length === info.period) {
      out.cyclePoints = cycle;
      out.rotation = rotationNumber(cycle);
      if (deriv) {
        // Stable cycle multiplier λ = exp(Σ log f′(z_k)) — avoids under/overflow for long or
        // superattracting cycles (a zero factor → log −∞ → λ = 0, exactly as it should).
        let s: Complex = [0, 0];
        for (const w of cycle) s = C.add(s, C.log(deriv.fz(w, c)));
        const lam = C.exp(s);
        out.multiplier = lam;
        out.multiplierMag = cabs(lam);
      } else {
        // Non-holomorphic f: no scalar f′, so report |λ| (magnitude only) as the spectral radius
        // of the product of real Jacobians around a freshly-settled cycle; arg λ stays null.
        const settled = locateCycle(f, cycle[0], c, info.period);
        if (settled.length === info.period) out.multiplierMag = cycleMultiplierMag(f, settled, c);
      }
    }
  } else if (info.fate === "escaped" && deriv) {
    out.distance = escapeDistance(fAst, escapeAst, plane, z0, c, a, deriv);
  }
  return out;
}

/**
 * Newton-snap a parameter `c` to a hyperbolic-component nucleus — the superattracting
 * centre where the critical orbit is periodic with the given period. Solves
 * g(c) = fᵖᵉʳⁱᵒᵈ(critPoint; c) − critPoint = 0, carrying the running derivative D = ∂z/∂c
 * along the critical orbit (g′ = D, since the critical point is c-independent for the
 * supported families, so ∂(critPoint)/∂c = 0). The recurrence is the same
 * f_z·D + f_c that the distance estimate uses, generalised to any holomorphic `f`.
 *
 * Returns null for a non-holomorphic `f` (no analytic derivative) or if Newton fails to
 * converge from `c0` (caller should leave `c` unchanged). Seed it with a point already
 * inside the component (the clicked `c`) so it converges to that component's centre and
 * not a lower-period root of g.
 */
export function findNucleus(
  fAst: Node,
  critPoint: Complex,
  period: number,
  c0: Complex,
  a: Complex = [0, 0],
): Complex | null {
  if (period < 1) return null;
  const deriv = derivatives(fAst, a);
  if (!deriv) return null; // non-holomorphic ⇒ no analytic Newton step
  const f = getComplexFn(fAst, a);
  let c: Complex = [c0[0], c0[1]];
  for (let it = 0; it < 60; it++) {
    let z: Complex = [critPoint[0], critPoint[1]];
    let der: Complex = [0, 0]; // ∂(critPoint)/∂c = 0
    for (let k = 0; k < period; k++) {
      der = C.add(C.mul(deriv.fz(z, c), der), deriv.fc(z, c));
      z = f(z, c);
      if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return null;
    }
    const g: Complex = [z[0] - critPoint[0], z[1] - critPoint[1]];
    const ad = cabs(der);
    if (ad === 0 || !Number.isFinite(ad)) return null; // flat — no Newton step
    const delta = C.div(g, der);
    c = [c[0] - delta[0], c[1] - delta[1]];
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    if (cabs(delta) < 1e-13) return c;
  }
  return null; // did not converge within the iteration budget
}

/**
 * Newton-snap a parameter `c` to a Misiurewicz point — where the critical orbit is *strictly
 * preperiodic*: fᵐ⁺ᵏ(crit) = fᵐ(crit) with preperiod m ≥ 1 and period k ≥ 1, so the orbit lands
 * exactly on a repelling k-cycle after m steps. Solves g(c) = fᵐ⁺ᵏ(crit) − fᵐ(crit) = 0 by
 * Newton, carrying the running derivative D = ∂z/∂c along the critical orbit (g′ = D_{m+k} − D_m),
 * the same recurrence {@link findNucleus} uses. Like the nucleus finder, **seed it near the
 * target** (the view centre / clicked c) so it converges to that Misiurewicz point and not
 * another root of g — e.g. a low-period centre such as c=0 or c=−1 also satisfy fᵐ⁺ᵏ = fᵐ.
 *
 * Oracles: (m,k)=(2,2) near i → c=i; (m,k)=(2,1) near −2 → c=−2. Returns null for a
 * non-holomorphic `f` or if Newton fails to converge from `c0`.
 */
export function findMisiurewicz(
  fAst: Node,
  critPoint: Complex,
  preperiod: number,
  period: number,
  c0: Complex,
  a: Complex = [0, 0],
): Complex | null {
  if (preperiod < 1 || period < 1) return null;
  const deriv = derivatives(fAst, a);
  if (!deriv) return null; // non-holomorphic ⇒ no analytic Newton step
  const f = getComplexFn(fAst, a);
  let c: Complex = [c0[0], c0[1]];
  for (let it = 0; it < 80; it++) {
    let z: Complex = [critPoint[0], critPoint[1]];
    let der: Complex = [0, 0]; // ∂(critPoint)/∂c = 0
    let zm: Complex = [0, 0];
    let derm: Complex = [0, 0];
    for (let n = 0; n < preperiod + period; n++) {
      if (n === preperiod) {
        zm = [z[0], z[1]]; // z_m
        derm = [der[0], der[1]]; // ∂z_m/∂c
      }
      der = C.add(C.mul(deriv.fz(z, c), der), deriv.fc(z, c));
      z = f(z, c);
      if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return null;
    }
    const g: Complex = [z[0] - zm[0], z[1] - zm[1]]; // f^{m+k} − f^m
    const gp: Complex = [der[0] - derm[0], der[1] - derm[1]]; // its c-derivative
    const ad = cabs(gp);
    if (ad === 0 || !Number.isFinite(ad)) return null; // flat — no Newton step
    const delta = C.div(g, gp);
    c = [c[0] - delta[0], c[1] - delta[1]];
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    if (cabs(delta) < 1e-13) return c;
  }
  return null; // did not converge within the iteration budget
}
