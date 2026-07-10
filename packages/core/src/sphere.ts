// Stereographic projection between the extended complex plane C∪{∞} and the unit Riemann sphere S²,
// from the north pole N = (0,0,1). Convention-neutral pure geometry (ADR-0006): no π constants live
// here. Shared by the suite's two sphere views — CD's ray-cast whole-plane overview
// (render/sphereView.ts) and QD's mesh-rendered sphere (app/sphere/sphere-common.mjs) — which
// previously hand-rolled identical forward projections. The inverse is QD's cancellation-safe form,
// now the canonical one (shared-consolidation survey, Tier-1 B).
//
//   w = u + iv,  r² = u² + v²
//   forward:  x = 2u/(1+r²),  y = 2v/(1+r²),  z = (r²−1)/(1+r²)
//     w = 0 → south pole (0,0,−1);  |w| = 1 → equator z = 0;  |w| → ∞ → north pole (0,0,1).
//   inverse:  u = x/(1−z),  v = y/(1−z)   (singular at N; see sphereToPlane for the robust form).

/**
 * A complex number w = (re, im) ↦ the unit-sphere point it maps to under stereographic projection
 * from the north pole. w = 0 → south pole (0,0,−1); |w| = 1 → the equator (z = 0); |w| → ∞ → the
 * north pole (0,0,1). The result is always a unit vector.
 */
export function planeToSphere(re: number, im: number): [number, number, number] {
  const r2 = re * re + im * im;
  const d = 1 + r2;
  // |w| → ∞ (a non-finite input, or r² overflowing to Infinity) maps to the north pole, per the
  // projection's definition; without this the ratios below are ∞/∞ = NaN. Unreachable via current
  // callers (all pass finite plane coordinates), but keeps the documented invariant total.
  if (!Number.isFinite(d)) return [0, 0, 1];
  return [(2 * re) / d, (2 * im) / d, (r2 - 1) / d];
}

/**
 * A unit-sphere point (x, y, z) ↦ the complex number w = (re, im) it projects to, or `null` at / near
 * the north pole (|1 − z| < `eps` ⇒ w = ∞). Cancellation-safe: for z > 0 the naive x/(1 − z) subtracts
 * two nearly-equal numbers, so it uses the algebraically-equivalent u = x·(1 + z)/(x² + y²) (valid
 * because x² + y² = 1 − z² = (1 − z)(1 + z) on the unit sphere), which avoids the precision loss.
 *
 * PRECONDITION: (x, y, z) lies ON the unit sphere (x² + y² + z² = 1). The z > 0 branch's identity
 * x² + y² = 1 − z² holds only there, so the two branches meet continuously at the z = 0 seam ONLY for
 * on-sphere input; feeding an off-sphere point makes them disagree. All current callers pass unit
 * vectors (ray–sphere hits / normalized mesh vertices), so this is a documented contract, not a guard.
 */
export function sphereToPlane(
  x: number,
  y: number,
  z: number,
  eps = 1e-9,
): [number, number] | null {
  const denom = 1 - z;
  if (Math.abs(denom) < eps) return null;
  if (z > 0) {
    const r2sq = x * x + y * y; // = 1 − z² on the unit sphere
    if (r2sq === 0) return [0, 0];
    const fac = (1 + z) / r2sq;
    return [x * fac, y * fac];
  }
  return [x / denom, y / denom];
}
