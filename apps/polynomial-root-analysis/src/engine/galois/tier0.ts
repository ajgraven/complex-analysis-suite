// The Galois group over ℚ, as far as a theorem names it from the evidence alone (DESIGN §4.5).
//
// The evidence is three things any integer polynomial gives up exactly: its factorisation over ℤ, its
// discriminant, and — for each prime p below 1000 that divides neither the leading coefficient nor the
// discriminant — the degrees of the irreducible factors of f mod p. The last is Dedekind's theorem: those
// degrees are the cycle type of an element of the Galois group G, acting on the roots. So every prime
// adds a proved fact, "G contains an element of type λ", and the list only grows.
//
// From that list, and nothing else, a transitive G (f irreducible) is named when:
//   • it contains an ℓ-cycle with ℓ a prime > n/2, or an (n − 1)-cycle — then G is PRIMITIVE (a block
//     system would have blocks of size ≤ n/2 that the ℓ-cycle could not move; an (n − 1)-cycle makes G
//     doubly transitive); and
//   • it contains a transposition — a primitive group with a transposition is Sₙ; or a 3-cycle — a
//     primitive group with a 3-cycle contains Aₙ, and is Aₙ exactly when the discriminant is a square.
// (Conrad, "Recognizing Galois groups Sₙ and Aₙ", Theorems 2.1, 2.2 and 3.1, in one statement.)
//
// An element of the right type need not be seen directly: if λ has a part ℓ exactly once and every
// other part is coprime to ℓ, then g^m, m the lcm of the other parts, is an ℓ-cycle. So type (3, 2) at
// p = 2 gives a transposition (cubed) and a 3-cycle (squared) at once.
//
// Nothing else is claimed. A group this cannot name — D₅, say, whose elements are 5-cycles and double
// transpositions only — is reported as the list of what it contains, never as a name.
//
// The worker returns this module's EVIDENCE; engine/certify.ts turns it into certificates on the main
// thread, so no label is ever made inside the worker.
import {
  discriminant,
  factorDegreesModP,
  factorOverZ,
  isSquare,
  primesBelow,
  QiPoly,
  zFromQi,
  zToQi,
  type ZPoly,
} from "@cas/exact";
import type { Polynomial } from "../polynomial.js";
import { identifyFactor, type Identification } from "./identify.js";

/** Decimal strings, so a `bigint` never has to cross the worker boundary. */
export interface GaloisRequest {
  /** The primitive integer polynomial, ascending. */
  readonly coefficients: readonly string[];
  /** Cycle types are read at every good prime below this. */
  readonly primesBelow: number;
  /** The reader's roots, in the order the polynomial holds them, so a named group acts on THEM. */
  readonly roots?: readonly (readonly [number, number])[];
}

/** One cycle type seen, with the first prime that showed it and how many primes did. */
export interface CycleWitness {
  readonly type: readonly number[];
  readonly prime: number;
  readonly count: number;
}

/** An element of a given cycle length, and where it came from: g at `prime`, raised to `power`. */
export interface ElementWitness {
  readonly cycle: number;
  readonly prime: number;
  readonly type: readonly number[];
  /** 1 when the type is already the cycle (with fixed points); else the power that isolates it. */
  readonly power: number;
}

export type Verdict = "S" | "A" | "open";

export interface FactorEvidence {
  /** The irreducible factor, primitive, ascending. */
  readonly coefficients: readonly string[];
  readonly degree: number;
  readonly multiplicity: number;
  /** Degree ≥ 2 only: a linear factor is a rational root and has nothing to act on. */
  readonly galois: {
    readonly discriminant: string;
    readonly discSquare: boolean;
    readonly cycleTypes: readonly CycleWitness[];
    readonly primesUsed: number;
    /** An ℓ-cycle, ℓ prime > n/2, or an (n − 1)-cycle: G is primitive. */
    readonly primitive: ElementWitness | null;
    readonly transposition: ElementWitness | null;
    readonly threeCycle: ElementWitness | null;
    readonly verdict: Verdict;
    /** The group named, in whichever tier could name it (identify.ts). */
    readonly identification: Identification;
  } | null;
}

export type GaloisEvidence =
  | { readonly ok: false; readonly reason: string }
  | {
      readonly ok: true;
      readonly degree: number;
      /** f = unit · ∏ factorᵐ. */
      readonly unit: string;
      readonly irreducible: boolean;
      readonly factors: readonly FactorEvidence[];
    };

export const PRIME_BOUND = 1000;

/** The request for a polynomial, or why the Galois group over ℚ is not asked of it. */
export function galoisRequest(
  p: Polynomial,
): { ok: true; request: GaloisRequest } | { ok: false; reason: string } {
  if (!p.exact)
    return {
      ok: false,
      reason:
        "it needs exact rational coefficients — type the polynomial, or switch to ℚ",
    };
  if (p.exact.coeffs.some((c) => !c.im.isZero()))
    return {
      ok: false,
      reason:
        "Galois groups over ℚ need rational coefficients, and one of these is not real",
    };
  return {
    ok: true,
    request: {
      coefficients: zFromQi(p.exact).map(String),
      primesBelow: PRIME_BOUND,
      roots: p.roots.map(([x, y]) => [x, y] as const),
    },
  };
}

const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The power of an element of type λ that is an ℓ-cycle, or null: ℓ must occur exactly once and every
 * other part be coprime to it; the power is then the lcm of the other parts (1 if there are none but
 * fixed points).
 */
export function isolate(type: readonly number[], cycle: number): number | null {
  if (type.filter((x) => x === cycle).length !== 1) return null;
  let m = 1;
  for (const x of type) {
    if (x === cycle) continue;
    if (gcd(x, cycle) !== 1) return null;
    m = (m * x) / gcd(m, x);
  }
  return m;
}

/** The first witness (by prime, then preferring a direct one) of an ℓ-cycle among the types seen. */
function firstElement(
  seen: readonly CycleWitness[],
  cycle: number,
): ElementWitness | null {
  let best: ElementWitness | null = null;
  for (const w of seen) {
    const power = isolate(w.type, cycle);
    if (power === null) continue;
    const e = { cycle, prime: w.prime, type: w.type, power };
    if (!best || e.prime < best.prime || (e.prime === best.prime && e.power < best.power))
      best = e;
  }
  return best;
}

/**
 * The primitivity witness. The LONGEST qualifying cycle is preferred — for a prime degree that is an
 * n-cycle, which is the statement a reader recognises — then the first prime.
 */
function primitiveElement(
  seen: readonly CycleWitness[],
  n: number,
): ElementWitness | null {
  const lengths = new Set<number>();
  for (let l = n; l >= 2; l--)
    if ((isPrime(l) && 2 * l > n) || (l === n - 1 && l >= 2)) lengths.add(l);
  for (const l of [...lengths].sort((a, b) => b - a)) {
    const e = firstElement(seen, l);
    if (e) return e;
  }
  return null;
}

function discriminantOf(f: ZPoly): bigint {
  const q = zToQi(f);
  const list = Array.from({ length: f.length }, (_, k) => QiPoly.constant(q.coeff(k)));
  const d = discriminant(list).coeff(0);
  if (d.re.d !== 1n || !d.im.isZero())
    throw new Error("the discriminant of an integer polynomial came out non-integral");
  return d.re.n;
}

function cycleTypes(f: ZPoly, bound: number): { seen: CycleWitness[]; used: number } {
  const byType = new Map<string, { type: number[]; prime: number; count: number }>();
  let used = 0;
  for (const p of primesBelow(bound)) {
    const t = factorDegreesModP(f, p);
    if (!t) continue;
    used++;
    const key = t.join(",");
    const w = byType.get(key);
    if (w) w.count++;
    else byType.set(key, { type: t, prime: p, count: 1 });
  }
  return { seen: [...byType.values()].sort((a, b) => a.prime - b.prime), used };
}

/** Everything the theorems above can use, for one irreducible factor of degree n ≥ 2. */
export function factorGalois(
  f: ZPoly,
  bound: number,
  plotted: readonly (readonly [number, number])[] | null = null,
): NonNullable<FactorEvidence["galois"]> {
  const n = f.length - 1;
  const disc = discriminantOf(f);
  const discSquare = isSquare(disc);
  const { seen, used } = cycleTypes(f, bound);
  const primitive = primitiveElement(seen, n);
  const transposition = firstElement(seen, 2);
  const threeCycle = n >= 3 ? firstElement(seen, 3) : null;
  const verdict: Verdict =
    primitive && transposition
      ? "S"
      : primitive && threeCycle
        ? discSquare
          ? "A"
          : "S"
        : "open";
  return {
    discriminant: disc.toString(),
    discSquare,
    cycleTypes: seen,
    primesUsed: used,
    primitive,
    transposition,
    threeCycle,
    verdict,
    identification: identifyFactor(f, { verdict, discSquare, cycleTypes: seen }, plotted),
  };
}

/** The evidence for a request: what the worker computes. */
export function galoisEvidence(req: GaloisRequest): GaloisEvidence {
  const f = req.coefficients.map((c) => BigInt(c));
  const degree = f.length - 1;
  if (degree < 1)
    return { ok: false, reason: "a constant has no Galois group to speak of" };
  const { unit, factors } = factorOverZ(f);
  const irreducible = factors.length === 1 && factors[0].multiplicity === 1;
  // The reader's roots belong to a factor only when the factor is the whole polynomial.
  const plotted = irreducible && req.roots?.length === degree ? req.roots : null;
  return {
    ok: true,
    degree,
    unit: unit.toString(),
    irreducible,
    factors: factors.map(({ poly, multiplicity }) => ({
      coefficients: poly.map(String),
      degree: poly.length - 1,
      multiplicity,
      galois: poly.length - 1 >= 2 ? factorGalois(poly, req.primesBelow, plotted) : null,
    })),
  };
}
