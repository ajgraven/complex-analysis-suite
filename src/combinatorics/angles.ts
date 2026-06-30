/**
 * angles.ts — exact-rational external-angle combinatorics under the doubling map.
 *
 * External angles (measured in turns, θ ∈ [0,1)) organise the boundary of the Mandelbrot/Julia
 * set: the doubling map D(θ) = 2θ mod 1 is the boundary dynamics, and rational angles land at the
 * cut points (periodic angles at repelling cycles, preperiodic at Misiurewicz points). All of this
 * combinatorics is exact rational arithmetic — floating-point angles smear the doubling orbit and
 * break the symbolic structure — so an angle here is a reduced fraction p/q in [0,1).
 *
 * Shared foundation for the orbit-portrait overlay, the spider algorithm, and the stripping
 * algorithm. Pure module — no DOM / GL. See FEATURE_RESEARCH.md §3.
 */

/** An external angle as a reduced fraction p/q ∈ [0,1) (q > 0, gcd(p,q) = 1; zero is 0/1). */
export interface Angle {
  p: number;
  q: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Build a reduced angle p/q, folded into [0,1) (so D and friends stay closed on the type). */
export function angle(p: number, q: number): Angle {
  if (!Number.isInteger(p) || !Number.isInteger(q) || q === 0) {
    throw new Error(`angle expects integers with q≠0, got ${p}/${q}`);
  }
  if (q < 0) {
    p = -p;
    q = -q;
  }
  p = ((p % q) + q) % q; // fold into [0, q) ⇒ value in [0,1)
  const g = gcd(p, q) || 1;
  return { p: p / g, q: q / g };
}

/** Numeric value θ = p/q ∈ [0,1). */
export function toNumber(a: Angle): number {
  return a.p / a.q;
}

/** The doubling map D(θ) = 2θ mod 1. */
export function double(a: Angle): Angle {
  return angle(2 * a.p, a.q);
}

export function equals(a: Angle, b: Angle): boolean {
  return a.p === b.p && a.q === b.q; // both reduced ⇒ structural equality suffices
}

/** Compare two angles as numbers without floating point: sign of a − b. */
export function compare(a: Angle, b: Angle): number {
  return Math.sign(a.p * b.q - b.p * a.q);
}

/**
 * Classify θ under doubling: its preperiod (steps before the cycle) and period (cycle length).
 * A reduced p/q is purely periodic iff q is odd (preperiod 0); an even q has preperiod = the power
 * of two dividing q. Period = the multiplicative order of 2 modulo the odd part of q.
 */
export function classifyDoubling(a: Angle): { preperiod: number; period: number } {
  const seen = new Map<string, number>();
  let cur = a;
  for (let n = 0; ; n++) {
    const key = `${cur.p}/${cur.q}`;
    const prev = seen.get(key);
    if (prev !== undefined) return { preperiod: prev, period: n - prev };
    seen.set(key, n);
    cur = double(cur);
  }
}

/** True iff θ is purely periodic under doubling (reduced denominator is odd). */
export function isPeriodic(a: Angle): boolean {
  return a.q % 2 === 1;
}

/** The doubling orbit θ, Dθ, D²θ, … for `len` steps (D⁰θ = θ first). */
export function doublingOrbit(a: Angle, len: number): Angle[] {
  const out: Angle[] = [];
  let cur = a;
  for (let n = 0; n < len; n++) {
    out.push(cur);
    cur = double(cur);
  }
  return out;
}

/** Binary itinerary of the doubling orbit: bit n = 1 iff Dⁿθ ≥ ½ (the cut at 0 and ½). */
export function binaryItinerary(a: Angle, len: number): number[] {
  return doublingOrbit(a, len).map((x) => (2 * x.p >= x.q ? 1 : 0));
}

/** A kneading symbol: in the arc containing θ ("A"), the other arc ("B"), or on a cut point ("*"). */
export type KneadingSymbol = "A" | "B" | "*";

/**
 * Kneading sequence K(θ): the itinerary of the doubling orbit relative to the partition cut at the
 * two preimages θ/2 and (θ+1)/2. Arc A is the (short) arc between them that contains θ; landing
 * exactly on a cut point gives "*". A periodic θ has a "*" (at index period−1, where D^(period−1)θ
 * is a preimage of θ), so K encodes whether θ is periodic and which sector each preimage sits in.
 */
export function kneadingSequence(a: Angle, len: number): KneadingSymbol[] {
  const lo = angle(a.p, 2 * a.q); // θ/2
  const hi = angle(a.p + a.q, 2 * a.q); // (θ+1)/2
  return doublingOrbit(a, len).map((x) => {
    if (equals(x, lo) || equals(x, hi)) return "*";
    return compare(lo, x) < 0 && compare(x, hi) < 0 ? "A" : "B";
  });
}

/**
 * All angles m/(2ⁿ−1) for m = 0 … 2ⁿ−2 — the angles whose doubling period divides n. These are the
 * candidate ray angles landing at a period-n repelling cycle (the orbit-portrait enumeration).
 */
export function periodicAngles(n: number): Angle[] {
  if (n < 1) return [];
  const den = Math.pow(2, n) - 1;
  const out: Angle[] = [];
  for (let m = 0; m < den; m++) out.push(angle(m, den));
  return out;
}

/** Farey mediant (p₁+p₂)/(q₁+q₂) — the simplest angle/fraction strictly between two neighbours. */
export function fareyMediant(a: Angle, b: Angle): Angle {
  return angle(a.p + b.p, a.q + b.q);
}
