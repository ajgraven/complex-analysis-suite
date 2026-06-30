/**
 * interiorDE.ts — interior distance estimation for the Mandelbrot set (z² + c).
 *
 * The exterior distance estimate shades how far an *escaping* c sits from the set boundary;
 * this is its counterpart for c *inside* a hyperbolic component — the distance from c to the
 * boundary of that component, which gives the flat interior a smooth, carved structure
 * (brightest at the component's centre, fading to 0 at its edge).
 *
 * For a parameter c whose critical orbit settles on an attracting cycle of period p, let z be a
 * point of that cycle (fᶜ^p(z) = z) and accumulate the partials of fᶜ^p at z. Then
 *
 *     DE_interior = (1 − |dz|²) / | dcdz + dzdz · dc / (1 − dz) |
 *
 * where dz = ∂fᵖ/∂z (the multiplier λ), dc = ∂fᵖ/∂c, dzdz = ∂²fᵖ/∂z², dcdz = ∂²fᵖ/∂z∂c.
 * The partials are built by iterating the cycle once (order matters — each line reads the
 * previous step's values):
 *
 *     dcdz = 2(z·dcdz + dz·dc);  dc = 2 z·dc + 1;  dzdz = 2(dz² + z·dzdz);  dz = 2 z·dz;  z = z² + c
 *
 * Specialised to z² + c (the `2·…` factors are f′(z) = 2z); a general-f / arbitrary-precision
 * version is a deferred follow-up. Pure module — no DOM / GL. See FEATURE_RESEARCH.md §2.1.
 *
 * References: Wikipedia "Plotting algorithms for the Mandelbrot set" (interior DEM); mathr.co.uk.
 * Oracles: c = 0 (cardioid nucleus, p = 1) → DE = 0.5; c = −1 (period-2 nucleus, p = 2) → DE = 0.25
 * (the period-2 bulb's exact radius); a parabolic root (dz → 1) → 0.
 */
import type { Complex } from "../complex";

const cmul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const cadd = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const scale2 = (a: Complex): Complex => [2 * a[0], 2 * a[1]];
const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/**
 * Interior distance estimate at parameter `c`, given a point `z0` of the attracting cycle and its
 * period `p` (both from the inspector's cycle finder). Returns 0 at a parabolic boundary (dz → 1)
 * and for any non-finite result, so it is safe to use directly as a brightness. Larger = deeper
 * inside the component; the value is the component centre's distance estimate at the nucleus.
 */
export function interiorDistanceEstimate(c: Complex, z0: Complex, p: number): number {
  let z: Complex = [z0[0], z0[1]];
  let dz: Complex = [1, 0]; // ∂fᵏ/∂z (→ the multiplier λ after p steps)
  let dzdz: Complex = [0, 0]; // ∂²fᵏ/∂z²
  let dc: Complex = [0, 0]; // ∂fᵏ/∂c
  let dcdz: Complex = [0, 0]; // ∂²fᵏ/∂z∂c
  for (let k = 0; k < p; k++) {
    dcdz = scale2(cadd(cmul(z, dcdz), cmul(dz, dc)));
    dc = cadd(scale2(cmul(z, dc)), [1, 0]);
    dzdz = scale2(cadd(cmul(dz, dz), cmul(z, dzdz)));
    dz = scale2(cmul(z, dz));
    z = cadd(cmul(z, z), c);
  }
  const num = 1 - (dz[0] * dz[0] + dz[1] * dz[1]); // 1 − |dz|²
  const oneMinusDz: Complex = [1 - dz[0], -dz[1]];
  // dcdz + dzdz · dc / (1 − dz); as 1−dz → 0 (parabolic) this blows up and DE → 0.
  const denomC = cadd(dcdz, cdiv(cmul(dzdz, dc), oneMinusDz));
  const denom = Math.hypot(denomC[0], denomC[1]);
  const de = num / denom;
  return Number.isFinite(de) && de > 0 ? de : 0;
}
