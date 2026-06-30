/**
 * orbitPortrait.ts — the combinatorics of an orbit portrait (Milnor, "Periodic orbits, external
 * rays and the Mandelbrot set").
 *
 * The external rays landing at a repelling/parabolic cycle {z₁…zₙ} of z²+c form the orbit portrait
 * P(O) = {A₁…Aₙ}, where Aⱼ is the set of angles landing at zⱼ. The doubling map D sends Aⱼ → A_{j+1}
 * preserving cyclic order, so D^n maps each Aⱼ to itself as a rigid rotation. This module computes
 * the invariants that need no dynamics once you know the angles at one point: the **valence** v
 * (rays per point), the **rotation number** (the rigid-rotation step of D^n within one Aⱼ), and the
 * **characteristic arc** (the narrowest complementary arc — a complete invariant of the portrait).
 *
 * The *grouping* of angles to cycle points is dynamics-dependent (the overlay obtains it by tracing
 * dynamic rays); this module is the pure layer it feeds. See FEATURE_RESEARCH.md §3.4.
 */
import { type Angle, angle, compare, double } from "./angles";

function gcdInt(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Apply the doubling map `n` times. */
function doubleN(a: Angle, n: number): Angle {
  let r = a;
  for (let i = 0; i < n; i++) r = double(r);
  return r;
}

/**
 * The external angles of the rays landing at the repelling α fixed point of a z²+c map whose
 * attracting cycle has internal angle p/q — i.e. the period-q cycle of the doubling map x ↦ 2x
 * (mod 2^q−1) that is order-isomorphic to rigid rotation by p/q, returned as q angles m/(2^q−1)
 * sorted in angular order. These are the rays of the α orbit portrait (p/q satellite bulb): 1/3 →
 * {1/7, 2/7, 4/7} (the rabbit), 1/2 → {1/3, 2/3} (the basilica). Null for a non-reduced or trivial
 * p/q. (Generalises rays.ts `bulbRayAngles`, which returns only the bounding pair.)
 */
export function rotationCycleAngles(p: number, q: number): Angle[] | null {
  if (q < 2 || p < 1 || p >= q || gcdInt(p, q) !== 1) return null;
  const denom = 2 ** q - 1;
  const seen = new Set<number>();
  for (let start = 1; start < denom; start++) {
    if (seen.has(start)) continue;
    const orbit: number[] = [];
    let x = start;
    do {
      orbit.push(x);
      seen.add(x);
      x = (2 * x) % denom;
    } while (x !== start);
    if (orbit.length !== q) continue; // not period-q
    const sorted = [...orbit].sort((a, b) => a - b);
    const idx = new Map<number, number>();
    sorted.forEach((v, i) => idx.set(v, i));
    let isRotation = true; // sorted[i] doubles to sorted[(i+p) mod q] ⇒ rotation by p/q
    for (let i = 0; i < q && isRotation; i++) {
      if (idx.get((2 * sorted[i]) % denom) !== (i + p) % q) isRotation = false;
    }
    if (isRotation) return sorted.map((m) => angle(m, denom));
  }
  return null;
}

/**
 * Rotation number of the rays landing at one periodic point of period `p`: D^p permutes those
 * angles, and for a genuine orbit portrait it does so as a rigid rotation in cyclic (angular)
 * order — the constant forward shift r over v angles gives the rotation number r/v (reduced).
 * Returns null if the angles are not permuted rigidly (not a valid single-point ray set).
 */
export function rayRotationNumber(anglesAtPoint: Angle[], period: number): Angle | null {
  const v = anglesAtPoint.length;
  if (v === 0) return null;
  if (v === 1) return { p: 0, q: 1 };
  const sorted = [...anglesAtPoint].sort(compare);
  const indexOf = (a: Angle): number => sorted.findIndex((b) => compare(a, b) === 0);
  let shift = -1;
  for (let i = 0; i < v; i++) {
    const j = indexOf(doubleN(sorted[i], period));
    if (j < 0) return null; // image left the set ⇒ not a closed ray set
    const s = (((j - i) % v) + v) % v;
    if (shift === -1) shift = s;
    else if (s !== shift) return null; // not a rigid rotation ⇒ invalid portrait
  }
  if (shift === 0) return { p: 0, q: 1 };
  const g = ((a: number, b: number): number => {
    while (b) [a, b] = [b, a % b];
    return a;
  })(shift, v);
  return { p: shift / g, q: v / g };
}

/** The narrowest arc between cyclically-adjacent landing angles — the portrait's characteristic arc. */
export function characteristicArc(
  anglesAtPoint: Angle[],
): { lo: Angle; hi: Angle; length: number } | null {
  const v = anglesAtPoint.length;
  if (v < 2) return null;
  const sorted = [...anglesAtPoint].sort(compare);
  let best: { lo: Angle; hi: Angle; length: number } | null = null;
  for (let i = 0; i < v; i++) {
    const lo = sorted[i];
    const hi = sorted[(i + 1) % v];
    // arc length lo→hi going forward (wrapping past 1 for the last pair)
    let len = hi.p / hi.q - lo.p / lo.q;
    if (len <= 0) len += 1;
    if (!best || len < best.length) best = { lo, hi, length: len };
  }
  return best;
}

/** Summary of an orbit portrait's per-point combinatorics. */
export interface PortraitSummary {
  valence: number;
  rotation: Angle | null;
  characteristic: { lo: Angle; hi: Angle; length: number } | null;
}

/** Valence, rotation number and characteristic arc of the rays landing at one period-`p` point. */
export function portraitSummary(anglesAtPoint: Angle[], period: number): PortraitSummary {
  return {
    valence: anglesAtPoint.length,
    rotation: rayRotationNumber(anglesAtPoint, period),
    characteristic: characteristicArc(anglesAtPoint),
  };
}
