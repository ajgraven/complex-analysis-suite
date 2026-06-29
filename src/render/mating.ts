/**
 * mating.ts — the conjugate-limb obstruction to mating two quadratic polynomials.
 *
 * (Rees–Shishikura–Tan Lei) Two post-critically-finite quadratics z²+c₁ and z²+c₂ admit a
 * conformal **mating** — their filled Julia sets glued along the boundary into a single
 * quadratic rational map — iff c₁ and c₂ do **not** lie in complex-conjugate limbs of the
 * Mandelbrot set.
 *
 * For the hyperbolic bulbs hanging off the main cardioid, a limb is named by the bulb's
 * internal angle (rotation number) p/q. Its complex conjugate — the mirror across the real
 * axis — is the (q−p)/q bulb, so two main-cardioid bulbs lie in conjugate limbs exactly when
 *     p₁/q₁ + p₂/q₂ = 1.
 * The 1/2 bulb is the unique self-conjugate limb, so a parameter outside it can be mated with
 * itself. This module decides mateability for **main-cardioid bulbs**; the deeper nested-limb
 * case (satellites of satellites) is out of scope.
 *
 * Pure module — no DOM / GL. All arithmetic is exact integer/rational. See FEATURE_RESEARCH.md
 * §6.1 / §6.4.
 */

/** Greatest common divisor (non-negative). */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Reduce p/q to lowest terms with q > 0; null for q = 0 or non-integer inputs. */
export function reduceFraction(p: number, q: number): [number, number] | null {
  if (!Number.isInteger(p) || !Number.isInteger(q) || q === 0) return null;
  if (q < 0) {
    p = -p;
    q = -q;
  }
  const g = gcd(p, q) || 1;
  return [p / g, q / g];
}

/** The conjugate limb of the main-cardioid p/q bulb: the (q−p)/q bulb (reduced). */
export function conjugateLimb(p: number, q: number): [number, number] | null {
  const r = reduceFraction(p, q);
  if (!r) return null;
  return reduceFraction((((r[1] - r[0]) % r[1]) + r[1]) % r[1], r[1]);
}

/** True iff the two main-cardioid bulbs lie in complex-conjugate limbs (p₁/q₁ + p₂/q₂ = 1). */
export function limbsConjugate(p1: number, q1: number, p2: number, q2: number): boolean {
  const a = reduceFraction(p1, q1);
  const b = reduceFraction(p2, q2);
  if (!a || !b) return false;
  return a[0] * b[1] + b[0] * a[1] === a[1] * b[1]; // a + b === 1
}

/** Verdict on whether two main-cardioid bulbs are mateable. */
export interface MatingVerdict {
  /** Both inputs are valid reduced fractions. */
  valid: boolean;
  /** The two quadratics admit a mating (their limbs are not conjugate). */
  mateable: boolean;
  /** The obstruction: the two limbs are complex-conjugate. */
  conjugate: boolean;
  /** Reduced p/q of bulb A and bulb B, and the conjugate limb of bulb A. */
  a: [number, number] | null;
  b: [number, number] | null;
  conjugateOfA: [number, number] | null;
}

/** Decide whether the main-cardioid bulbs p1/q1 and p2/q2 are mateable. */
export function matingVerdict(p1: number, q1: number, p2: number, q2: number): MatingVerdict {
  const a = reduceFraction(p1, q1);
  const b = reduceFraction(p2, q2);
  if (!a || !b) {
    return { valid: false, mateable: false, conjugate: false, a, b, conjugateOfA: null };
  }
  const conjugate = limbsConjugate(a[0], a[1], b[0], b[1]);
  return {
    valid: true,
    mateable: !conjugate,
    conjugate,
    a,
    b,
    conjugateOfA: conjugateLimb(a[0], a[1]),
  };
}
