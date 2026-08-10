/**
 * External rays for the Mandelbrot set (parameter plane) and filled Julia sets (dynamical plane), for
 * z² + c. An external ray at angle θ (in turns) is the image under the Böttcher map of the straight ray
 * {r·e^{2πiθ} : r > 1}; as r → 1⁺ it lands on the boundary at "external angle θ".
 *
 * Tracing uses the Böttcher approximation z_m ≈ Φ(·)^{2^m}: at depth m the target is the fixed-modulus
 * point R·exp(2πi·2^m·θ) (R the escape radius), and we Newton-solve the m-th iterate for the unknown
 * (c on the parameter plane, z₀ on the dynamical plane), marching m outward and using each solved point
 * as the next initial guess (continuation). Fixing the target modulus at R avoids the w^{2^m} overflow.
 *
 * Extracted from Complex Dynamics on the ADR-0007 second-consumer rule (Riemann Map draws external rays,
 * ADR-0011 follow-on). Pure (no DOM/GL), specialized to the quadratic family z² + c. The bulb-angle
 * combinatorics (`bulbRayAngles`, which needs CD's orbit-portrait code) stays app-local.
 *
 * Double-precision-bound: the angle doubling 2^m·θ loses a bit per step, so landings deep in the set
 * (large `depth`) are approximate — deep-zoom rays would need extended precision (deferred).
 */

type Vec2 = [number, number];

export interface RayOptions {
  /** Iteration depth = number of ray points toward the landing (capped for f64). */
  depth?: number;
  /** Escape radius R — the fixed target modulus for the Böttcher approximation. */
  escapeR?: number;
  /** Newton iterations per ray point. */
  newtonSteps?: number;
}

const DEFAULTS = { depth: 28, escapeR: 64, newtonSteps: 60 };
const TWO_PI = 2 * Math.PI;

const cmulRe = (a: Vec2, b: Vec2): number => a[0] * b[0] - a[1] * b[1];
const cmulIm = (a: Vec2, b: Vec2): number => a[0] * b[1] + a[1] * b[0];
function cdiv(a: Vec2, b: Vec2): Vec2 {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

/** Far-field seed R·e^{2πiθ}, where Φ(·) ≈ identity. */
function seed(theta: number, R: number): Vec2 {
  return [R * Math.cos(TWO_PI * theta), R * Math.sin(TWO_PI * theta)];
}

/**
 * Parameter-plane external ray of the Mandelbrot set at angle θ. Points run from the far field inward to
 * the landing point on ∂M. Newton variable = c; the m-th iterate of the critical orbit z_m(c) (z₀ = 0)
 * and its derivative dz_m/dc (recurrence d ← 2zd + 1).
 */
export function parameterRay(theta: number, opts: RayOptions = {}): Vec2[] {
  const { depth, escapeR, newtonSteps } = { ...DEFAULTS, ...opts };
  const pts: Vec2[] = [];
  let c = seed(theta, escapeR);
  pts.push([c[0], c[1]]);
  // Critical orbit starts at z₀ = 0, so z₁ = c is not yet squared: z_m ≈ Φ^{2^(m-1)}.
  // Hence the target angle is 2^(m-1)·θ — double *after* using it (a = θ at m = 1).
  let a = theta - Math.floor(theta);
  for (let m = 1; m <= depth; m++) {
    const ang = TWO_PI * a; // a = 2^(m-1)·θ mod 1 (one bit lost per step — the f64 limit)
    const target: Vec2 = [escapeR * Math.cos(ang), escapeR * Math.sin(ang)];
    for (let it = 0; it < newtonSteps; it++) {
      let z: Vec2 = [0, 0];
      let d: Vec2 = [0, 0];
      for (let k = 0; k < m; k++) {
        const nd: Vec2 = [2 * cmulRe(z, d) + 1, 2 * cmulIm(z, d)]; // d ← 2zd + 1
        const nz: Vec2 = [z[0] * z[0] - z[1] * z[1] + c[0], 2 * z[0] * z[1] + c[1]]; // z ← z²+c
        z = nz;
        d = nd;
      }
      if (d[0] === 0 && d[1] === 0) break;
      const delta = cdiv([z[0] - target[0], z[1] - target[1]], d);
      c = [c[0] - delta[0], c[1] - delta[1]];
      if (delta[0] * delta[0] + delta[1] * delta[1] < 1e-30) break;
    }
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) break;
    pts.push([c[0], c[1]]);
    a = (2 * a) % 1; // advance to 2^m·θ for the next depth
  }
  return pts;
}

/**
 * Dynamical-plane external ray of the filled Julia set K_c at angle θ (c fixed). Newton variable = z₀;
 * the m-th iterate z_m (z₀ = the unknown) and its derivative dz_m/dz₀ (recurrence d ← 2zd, d₀ = 1).
 */
export function dynamicRay(theta: number, c: Vec2, opts: RayOptions = {}): Vec2[] {
  const { depth, escapeR, newtonSteps } = { ...DEFAULTS, ...opts };
  const pts: Vec2[] = [];
  let z0 = seed(theta, escapeR);
  pts.push([z0[0], z0[1]]);
  let a = theta - Math.floor(theta);
  for (let m = 1; m <= depth; m++) {
    a = (2 * a) % 1;
    const ang = TWO_PI * a;
    const target: Vec2 = [escapeR * Math.cos(ang), escapeR * Math.sin(ang)];
    for (let it = 0; it < newtonSteps; it++) {
      let z: Vec2 = [z0[0], z0[1]];
      let d: Vec2 = [1, 0];
      for (let k = 0; k < m; k++) {
        const nd: Vec2 = [2 * cmulRe(z, d), 2 * cmulIm(z, d)]; // d ← 2zd
        const nz: Vec2 = [z[0] * z[0] - z[1] * z[1] + c[0], 2 * z[0] * z[1] + c[1]];
        z = nz;
        d = nd;
      }
      if (d[0] === 0 && d[1] === 0) break;
      const delta = cdiv([z[0] - target[0], z[1] - target[1]], d);
      z0 = [z0[0] - delta[0], z0[1] - delta[1]];
      if (delta[0] * delta[0] + delta[1] * delta[1] < 1e-30) break;
    }
    if (!Number.isFinite(z0[0]) || !Number.isFinite(z0[1])) break;
    pts.push([z0[0], z0[1]]);
  }
  return pts;
}

/**
 * Ray depth (number of points marched toward the landing) scaled with zoom: each consecutive point
 * roughly halves its distance to the boundary, so one extra point per zoom-doubling keeps the
 * near-landing sampling sub-pixel as you zoom in. Clamped to the f64 angle-doubling budget (~50 bits) —
 * beyond that `2^m·θ` is noise and deep-zoom rays would need extended precision (deferred).
 */
export function rayDepthForZoom(zoom: number): number {
  const d = Math.round(28 + Math.log2(Math.max(1, zoom)));
  return Math.max(28, Math.min(50, d));
}

/** Parse an external angle written as a fraction "p/q" or a decimal; null if unparseable. */
export function parseAngle(input: string): number | null {
  const s = input.trim();
  if (s === "") return null;
  const frac = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const q = Number(frac[2]);
    if (q === 0) return null;
    return Number(frac[1]) / q;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
