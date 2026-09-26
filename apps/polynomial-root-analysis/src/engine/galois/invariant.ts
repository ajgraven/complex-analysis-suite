// A G-relative K-invariant (DESIGN §4.6 step 3): an orbit sum F = Σ_{e ∈ K·m} xᵉ of one monomial m
// whose stabiliser in G is EXACTLY K. Then the values F(σ·z), one per left coset σK, are what the
// relative resolvent is built from, and a simple rational value at σ puts the Galois group inside
// σKσ⁻¹.
//
// The monomial is searched here rather than stored with the table: lowest total degree first (smaller
// values, fewer bits), then the smallest orbit (fewer terms), exponents at most 3. The stabiliser is
// computed by enumeration — |G| ≤ 5040 at degree 7 — so every invariant used is verified where it is
// used, and the suite runs the search over every maximal pair in the table.
import { groupElements, type Perm } from "@cas/monodromy";

/** Exponent vector e, as the monomial ∏ xᵢ^eᵢ. */
export type Exponents = readonly number[];

/** g·xᵉ = ∏ x_{g(i)}^{eᵢ}, so (g·e)[g(i)] = e[i]. */
export function actOn(g: Perm, e: Exponents): number[] {
  const out = new Array<number>(e.length).fill(0);
  for (let i = 0; i < e.length; i++) out[g[i]] = e[i];
  return out;
}

const key = (e: Exponents): string => e.join(",");

export function orbit(elements: readonly Perm[], e: Exponents): number[][] {
  const seen = new Map<string, number[]>();
  for (const g of elements) {
    const f = actOn(g, e);
    seen.set(key(f), f);
  }
  return [...seen.values()];
}

/** Does g map the orbit (as a set) to itself? */
function fixes(g: Perm, orb: readonly Exponents[], set: ReadonlySet<string>): boolean {
  return orb.every((e) => set.has(key(actOn(g, e))));
}

/** |Stab_G(Σ_{e ∈ orb} xᵉ)|. */
export function stabiliserOrder(G: readonly Perm[], orb: readonly Exponents[]): number {
  const set = new Set(orb.map(key));
  let count = 0;
  for (const g of G) if (fixes(g, orb, set)) count++;
  return count;
}

function* exponentVectors(n: number, degree: number, maxE: number): Generator<number[]> {
  const e = new Array<number>(n).fill(0);
  function* rec(i: number, left: number): Generator<number[]> {
    if (i === n - 1) {
      if (left <= maxE) {
        e[i] = left;
        yield e.slice();
      }
      return;
    }
    for (let v = Math.min(maxE, left); v >= 0; v--) {
      e[i] = v;
      yield* rec(i + 1, left - v);
    }
  }
  yield* rec(0, degree);
}

export interface Invariant {
  /** The monomial chosen. */
  readonly monomial: Exponents;
  /** Its K-orbit: F = Σ xᵉ over these. */
  readonly orbit: readonly Exponents[];
}

const CACHE = new Map<string, Invariant>();

/**
 * The invariant for K ≤ G (both given by generators on n points). Throws if none is found up to the
 * search bound — which the suite rules out for every maximal pair of degree ≤ 7.
 */
export function findInvariant(
  cacheKey: string,
  Ggens: readonly Perm[],
  Kgens: readonly Perm[],
  n: number,
): Invariant {
  const hit = CACHE.get(cacheKey);
  if (hit) return hit;
  const G = groupElements([...Ggens], n, 10_000).elements;
  const K = groupElements([...Kgens], n, 10_000).elements;
  for (let degree = 1; degree <= 3 * n; degree++) {
    let best: Invariant | null = null;
    for (const e of exponentVectors(n, degree, 3)) {
      const orb = orbit(K, e);
      if (best && orb.length >= best.orbit.length) continue;
      if (stabiliserOrder(G, orb) === K.length) best = { monomial: e, orbit: orb };
    }
    if (best) {
      CACHE.set(cacheKey, best);
      return best;
    }
  }
  throw new Error(`no invariant of degree ≤ ${3 * n} found for ${cacheKey}`);
}

/** The invariant carried into a conjugate frame: τ·F. */
export function conjugateOrbit(tau: Perm, orb: readonly Exponents[]): number[][] {
  return orb.map((e) => actOn(tau, e));
}

/** Left-coset representatives of Kc in Gc, where Kc = Stab_{Gc}(orbit): one per image σ·orbit. */
export function cosetRepresentatives(
  Gc: readonly Perm[],
  orb: readonly Exponents[],
): Perm[] {
  const seen = new Map<string, Perm>();
  for (const s of Gc) {
    const image = orb
      .map((e) => key(actOn(s, e)))
      .sort()
      .join("|");
    if (!seen.has(image)) seen.set(image, s);
  }
  return [...seen.values()];
}
