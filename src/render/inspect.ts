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
 * The multiplier and distance need a holomorphic `f` (so f′ is well defined); for
 * non-holomorphic `f` (abs-maps, the assignment presets) they are reported as null,
 * while the period and rotation number — which are purely combinatorial — still hold.
 */

import type { Complex } from "../complex";
import type { Node } from "../expr/ast";
import * as C from "../expr/complexJs";
import { differentiate } from "../expr/derivative";
import { makeComplexFn, makeEscapeFn } from "../expr/evaluate";
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
  const ang = cycle.map((w) => Math.atan2(w[1] - cy, w[0] - cx));
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
  const f = makeComplexFn(fAst, a);
  const esc = makeEscapeFn(escapeAst, fAst, a);
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
  };
  const deriv = derivatives(fAst, a);

  if ((info.fate === "converged" || info.fate === "periodic") && info.period >= 1) {
    const f = makeComplexFn(fAst, a);
    const cycle = locateCycle(f, z0, c, info.period);
    if (cycle.length === info.period) {
      out.rotation = rotationNumber(cycle);
      if (deriv) {
        let lam: Complex = [1, 0];
        for (const w of cycle) lam = C.mul(lam, deriv.fz(w, c));
        out.multiplier = lam;
        out.multiplierMag = cabs(lam);
      }
    }
  } else if (info.fate === "escaped" && deriv) {
    out.distance = escapeDistance(fAst, escapeAst, plane, z0, c, a, deriv);
  }
  return out;
}
