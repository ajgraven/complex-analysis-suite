/**
 * External rays for Complex Dynamics. The ray-*tracing* (parameter/dynamical rays, depth scaling, angle
 * parsing) was extracted to `@cas/dynamics` when the Riemann-map app became a second consumer
 * (ADR-0011 follow-on); this module re-exports it so CD's callers keep importing from `./rays` unchanged,
 * and keeps the one CD-specific piece — `bulbRayAngles` — here, because it needs CD's orbit-portrait
 * combinatorics (`rotationCycleAngles`), which is not (yet) shared.
 */
export { parameterRay, dynamicRay, rayDepthForZoom, parseAngle } from "@cas/dynamics";
export type { RayOptions } from "@cas/dynamics";

import { rotationCycleAngles } from "../combinatorics/orbitPortrait";

/**
 * The two external angles (in turns) of the parameter rays landing at the root of the p/q satellite bulb
 * of the main cardioid. Among the period-q cycles of the doubling map x ↦ 2x (mod 2^q − 1), exactly one
 * is order-isomorphic to rigid rotation by p/q; the two angles bounding its smallest circular gap are the
 * landing rays (1/2 → {1/3, 2/3}, 1/3 → {1/7, 2/7}, 2/3 → {5/7, 6/7}, 1/4 → {1/15, 2/15}). Returns null
 * for q < 2 or a non-reduced p/q.
 */
export function bulbRayAngles(p: number, q: number): [number, number] | null {
  // The full rotation-by-p/q cycle (this validates p/q, caps q, and does the O(2^q) orbit search);
  // the landing pair is just its two angles bounding the smallest circular gap.
  const cycle = rotationCycleAngles(p, q);
  if (!cycle) return null;
  const denom = cycle[0].q; // 2^q − 1
  const m = cycle.map((a) => a.p); // cycle numerators, ascending
  let bestGap = Infinity;
  let ea = m[0];
  let eb = m[q - 1];
  for (let i = 0; i < q; i++) {
    const prev = m[(i - 1 + q) % q];
    const cur = m[i];
    const gap = i === 0 ? cur + denom - prev : cur - prev; // include the wrap-around gap
    if (gap < bestGap) {
      bestGap = gap;
      ea = prev;
      eb = cur;
    }
  }
  return [Math.min(ea, eb) / denom, Math.max(ea, eb) / denom];
}
