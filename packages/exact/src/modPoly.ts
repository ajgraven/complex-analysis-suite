// modPoly.ts — polynomials over the prime field 𝔽ₚ (ADR-0047 PRA-4).
//
// Two consumers in one app: Dedekind's theorem reads a CYCLE TYPE of the Galois group off the degrees of
// the irreducible factors of f mod p (distinct-degree factorisation alone is enough for that), and the
// factorisation over ℤ lifts a factorisation mod p (which needs the equal-degree split as well).
//
// Representation: a `number[]` of coefficients in [0, p), ascending, trimmed (no trailing zeros; the zero
// polynomial is `[]`). p is required to be below 2²⁵, so a product of two residues is below 2⁵⁰ and a
// double holds it exactly — every operation here is exact integer arithmetic, only carried in doubles.
// A caller with a larger prime gets a refusal, not a silently rounded product.

export type ModPoly = number[];

export const MAX_MOD_PRIME = 2 ** 25;

function check(p: number): void {
  if (!(Number.isInteger(p) && p >= 2 && p < MAX_MOD_PRIME))
    throw new Error(`modPoly: the modulus ${p} is not an integer in [2, 2^25)`);
}

const mod = (a: number, p: number): number => ((a % p) + p) % p;
const mulmod = (a: number, b: number, p: number): number => (a * b) % p;

export function mpTrim(a: ModPoly): ModPoly {
  let n = a.length;
  while (n > 0 && a[n - 1] === 0) n--;
  return n === a.length ? a : a.slice(0, n);
}

export const mpDeg = (a: ModPoly): number => a.length - 1;

/** Reduce integer coefficients (ascending) mod p. */
export function mpFromBig(coeffs: readonly bigint[], p: number): ModPoly {
  check(p);
  const P = BigInt(p);
  return mpTrim(coeffs.map((c) => Number(((c % P) + P) % P)));
}

/** a⁻¹ mod p, by the extended Euclidean algorithm; throws on a ≡ 0. */
export function invModP(a: number, p: number): number {
  let [r0, r1] = [mod(a, p), p];
  let [s0, s1] = [1, 0];
  if (r0 === 0) throw new Error("invModP: zero has no inverse");
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return mod(s0, p);
}

export function mpAdd(a: ModPoly, b: ModPoly, p: number): ModPoly {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = ((a[i] ?? 0) + (b[i] ?? 0)) % p;
  return mpTrim(out);
}

export function mpSub(a: ModPoly, b: ModPoly, p: number): ModPoly {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = mod((a[i] ?? 0) - (b[i] ?? 0), p);
  return mpTrim(out);
}

export function mpScale(a: ModPoly, c: number, p: number): ModPoly {
  const k = mod(c, p);
  return mpTrim(a.map((x) => mulmod(x, k, p)));
}

export function mpMul(a: ModPoly, b: ModPoly, p: number): ModPoly {
  if (a.length === 0 || b.length === 0) return [];
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++)
      out[i + j] = (out[i + j] + mulmod(a[i], b[j], p)) % p;
  }
  return mpTrim(out);
}

export function mpDivmod(a: ModPoly, b: ModPoly, p: number): { q: ModPoly; r: ModPoly } {
  if (b.length === 0) throw new Error("mpDivmod: division by the zero polynomial");
  const r = a.slice();
  const db = b.length - 1;
  if (r.length - 1 < db) return { q: [], r: mpTrim(r) };
  const q = new Array<number>(r.length - db).fill(0);
  const inv = invModP(b[db], p);
  for (let i = r.length - 1; i >= db; i--) {
    const c = mulmod(r[i], inv, p);
    q[i - db] = c;
    if (c === 0) continue;
    for (let j = 0; j <= db; j++)
      r[i - db + j] = mod(r[i - db + j] - mulmod(c, b[j], p), p);
  }
  return { q: mpTrim(q), r: mpTrim(r.slice(0, db)) };
}

export const mpRem = (a: ModPoly, b: ModPoly, p: number): ModPoly => mpDivmod(a, b, p).r;

export function mpMonic(a: ModPoly, p: number): ModPoly {
  if (a.length === 0) return a;
  return mpScale(a, invModP(a[a.length - 1], p), p);
}

/** The monic gcd (the zero polynomial when both are zero). */
export function mpGcd(a: ModPoly, b: ModPoly, p: number): ModPoly {
  let [x, y] = [mpTrim(a), mpTrim(b)];
  while (y.length > 0) [x, y] = [y, mpRem(x, y, p)];
  return mpMonic(x, p);
}

/** Monic gcd g with s·a + t·b = g. */
export function mpExtGcd(
  a: ModPoly,
  b: ModPoly,
  p: number,
): { g: ModPoly; s: ModPoly; t: ModPoly } {
  let [r0, r1] = [mpTrim(a), mpTrim(b)];
  let [s0, s1]: [ModPoly, ModPoly] = [[1], []];
  let [t0, t1]: [ModPoly, ModPoly] = [[], [1]];
  while (r1.length > 0) {
    const { q, r } = mpDivmod(r0, r1, p);
    [r0, r1] = [r1, r];
    [s0, s1] = [s1, mpSub(s0, mpMul(q, s1, p), p)];
    [t0, t1] = [t1, mpSub(t0, mpMul(q, t1, p), p)];
  }
  if (r0.length === 0) return { g: [], s: s0, t: t0 };
  const inv = invModP(r0[r0.length - 1], p);
  return { g: mpScale(r0, inv, p), s: mpScale(s0, inv, p), t: mpScale(t0, inv, p) };
}

export function mpDeriv(a: ModPoly, p: number): ModPoly {
  return mpTrim(a.slice(1).map((c, k) => mulmod(c, (k + 1) % p, p)));
}

/** baseᵉ mod m, by squaring. */
export function mpPowMod(base: ModPoly, e: bigint, m: ModPoly, p: number): ModPoly {
  let result: ModPoly = mpRem([1], m, p);
  let b = mpRem(base, m, p);
  let k = e;
  while (k > 0n) {
    if (k & 1n) result = mpRem(mpMul(result, b, p), m, p);
    k >>= 1n;
    if (k > 0n) b = mpRem(mpMul(b, b, p), m, p);
  }
  return result;
}

/** Is `f` squarefree over 𝔽ₚ (gcd(f, f′) = 1, and f′ ≠ 0)? */
export function mpSquarefree(f: ModPoly, p: number): boolean {
  const d = mpDeriv(f, p);
  if (d.length === 0) return f.length <= 1;
  return mpGcd(f, d, p).length === 1;
}

/**
 * Distinct-degree factorisation of a MONIC SQUAREFREE f: for each d, the product of its irreducible
 * factors of degree d. x^(pᵈ) − x is the product of every monic irreducible of degree dividing d, so
 * gcd(x^(pᵈ) − x, f) collects the degree-d factors once the smaller ones are divided out.
 */
export function distinctDegree(
  f: ModPoly,
  p: number,
): { degree: number; product: ModPoly }[] {
  check(p);
  const out: { degree: number; product: ModPoly }[] = [];
  let g = mpTrim(f);
  let xp: ModPoly = [0, 1]; // x^(p^d) mod g
  for (let d = 1; 2 * d <= mpDeg(g); d++) {
    xp = mpPowMod(xp, BigInt(p), g, p);
    const h = mpGcd(mpSub(xp, [0, 1], p), g, p);
    if (h.length > 1) {
      out.push({ degree: d, product: h });
      g = mpDivmod(g, h, p).q;
      xp = mpRem(xp, g, p);
    }
  }
  if (mpDeg(g) > 0) out.push({ degree: mpDeg(g), product: g });
  return out;
}

/** A small deterministic generator, so a split is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Cantor–Zassenhaus equal-degree split of a monic squarefree f whose irreducible factors all have
 * degree d, for ODD p: gcd(a^((pᵈ−1)/2) − 1, f) is a proper factor with probability ≈ ½ for random a.
 */
export function equalDegree(f: ModPoly, d: number, p: number, seed = 1): ModPoly[] {
  check(p);
  if (p === 2)
    throw new Error("equalDegree: characteristic 2 is not supported (use an odd prime)");
  const n = mpDeg(f);
  if (n === d) return [f];
  const rand = rng(seed + n * 7919 + d);
  const e = (BigInt(p) ** BigInt(d) - 1n) / 2n;
  for (let tries = 0; tries < 200; tries++) {
    const a = mpTrim(Array.from({ length: n }, () => Math.floor(rand() * p)));
    if (a.length < 2) continue;
    const g = mpGcd(mpSub(mpPowMod(a, e, f, p), [1], p), f, p);
    if (g.length > 1 && g.length < f.length) {
      return [
        ...equalDegree(g, d, p, seed + 1),
        ...equalDegree(mpDivmod(f, g, p).q, d, p, seed + 2),
      ];
    }
  }
  throw new Error("equalDegree: no split found in 200 tries");
}

/** The monic irreducible factors of a monic squarefree f over 𝔽ₚ (p odd), sorted by degree. */
export function factorModP(f: ModPoly, p: number): ModPoly[] {
  const out: ModPoly[] = [];
  for (const { degree, product } of distinctDegree(f, p))
    out.push(...equalDegree(product, degree, p));
  return out.sort((a, b) => a.length - b.length || compareLex(a, b));
}

function compareLex(a: ModPoly, b: ModPoly): number {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The degrees of the irreducible factors of f mod p — Dedekind's cycle type — or `null` when p divides
 * the leading coefficient or f mod p is not squarefree (p divides the discriminant), where the theorem
 * says nothing. Sorted longest first.
 */
export function factorDegreesModP(f: readonly bigint[], p: number): number[] | null {
  const fp = mpFromBig(f, p);
  if (mpDeg(fp) !== f.length - 1 || !mpSquarefree(fp, p)) return null;
  const degs: number[] = [];
  for (const { degree, product } of distinctDegree(mpMonic(fp, p), p))
    for (let k = 0; k < mpDeg(product) / degree; k++) degs.push(degree);
  return degs.sort((a, b) => b - a);
}

/** The primes below n, by sieve. */
export function primesBelow(n: number): number[] {
  const sieve = new Uint8Array(Math.max(0, n));
  const out: number[] = [];
  for (let i = 2; i < n; i++) {
    if (sieve[i]) continue;
    out.push(i);
    for (let j = i * i; j < n; j += i) sieve[j] = 1;
  }
  return out;
}
