// dynamicsStats.ts — dynamical invariants of a filled Julia set for the z²+c family (catalog item E12).
//
// Alongside the *conformal* exterior invariants (capacity / Robin / bₖ, analysis/exterior.ts) the tool
// reports the *dynamical* ones: is K connected (c ∈ M), and what attracting cycle does the critical
// orbit fall into — the period + multiplier that name the hyperbolic component (period 1 = main cardioid,
// 2 = basilica bulb, …). Connectedness reuses @cas/dynamics' `juliaConnected` (critical-orbit boundedness
// is the theorem c ∈ M ⟺ K_c connected). Restricted to z²+c, like the ray tracer + external angle. Pure.
import { juliaConnected } from "@cas/dynamics";

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const step = (z: C, c: C): C => [z[0] * z[0] - z[1] * z[1] + c[0], 2 * z[0] * z[1] + c[1]];

export interface AttractingCycle {
  /** Period p of the attracting cycle the critical orbit converges to. */
  readonly period: number;
  /** |multiplier| = |Π f′(zᵢ)| over the cycle; 0 = superattracting (the cycle contains the critical point). */
  readonly multiplier: number;
}

export interface DynamicsStats {
  /** K_c connected (c ∈ Mandelbrot) vs a Cantor dust — a numerical critical-orbit test (@cas/dynamics). */
  readonly connected: boolean;
  /** The attracting cycle of the critical orbit, or null (disconnected / parabolic / irrational). */
  readonly cycle: AttractingCycle | null;
}

/**
 * Find the attracting cycle the critical orbit (z=0) of z²+c falls into: settle onto the attractor, then
 * find the smallest period p that closes up, and take the multiplier Π 2zᵢ over the cycle. Returns null
 * when the orbit escapes (disconnected K) or does not settle to an attracting/neutral cycle within budget
 * (parabolic or irrationally-neutral c, whose critical orbit does not converge to a cycle). Honest: a
 * detected cycle with |multiplier| > 1 is a repelling cycle the finite orbit landed on by coincidence
 * (e.g. c = −2), NOT an attracting one — rejected.
 */
export function attractingCycle(
  c: C,
  opts: { settle?: number; maxPeriod?: number; tol?: number } = {},
): AttractingCycle | null {
  const settle = opts.settle ?? 4000;
  const maxPeriod = opts.maxPeriod ?? 128;
  const tol = opts.tol ?? 1e-10;
  const r = Math.max(2, Math.hypot(c[0], c[1]));
  const r2 = r * r;
  let z: C = [0, 0];
  for (let i = 0; i < settle; i++) {
    z = step(z, c);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1]) || z[0] * z[0] + z[1] * z[1] > r2) return null;
  }
  const anchor: C = [z[0], z[1]];
  let w: C = [z[0], z[1]];
  for (let p = 1; p <= maxPeriod; p++) {
    w = step(w, c);
    if (Math.hypot(w[0] - anchor[0], w[1] - anchor[1]) < tol) {
      let lam: C = [1, 0];
      let u: C = [anchor[0], anchor[1]];
      for (let k = 0; k < p; k++) {
        lam = cmul(lam, [2 * u[0], 2 * u[1]]); // f′(z) = 2z for z²+c
        u = step(u, c);
      }
      const mult = Math.hypot(lam[0], lam[1]);
      return mult <= 1 + 1e-6 ? { period: p, multiplier: mult } : null; // attracting/neutral only
    }
  }
  return null;
}

/** Dynamical invariants of the filled Julia set of z²+c: connectedness and the attracting cycle. */
export function juliaDynamics(c: C): DynamicsStats {
  const connected = juliaConnected(2, [c[0], c[1]]);
  return { connected, cycle: connected ? attractingCycle(c) : null };
}
