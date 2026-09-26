// zPoly.ts — polynomials over ℤ and their factorisation into irreducibles (ADR-0047 PRA-4).
//
// `factorOverZ` is Berlekamp–Zassenhaus in its textbook shape (von zur Gathen & Gerhard, ch. 15):
// content and squarefree decomposition first; then, for each squarefree part, a prime p for which it
// stays squarefree and of full degree, its factorisation mod p (distinct- then equal-degree), Hensel
// lifting of that factorisation to pᴷ past a bound on the coefficients of any true factor, and
// recombination of the lifted factors by trial division over ℤ. Every factor it returns has been
// verified by EXACT division, so the output is a factorisation whatever the choices along the way; what
// the algorithm adds is that each factor is irreducible — a subset of lifted factors that divides is
// found before any larger one, and recombination tries every subset.
//
// Representation: `bigint[]`, ascending, trimmed. The leading coefficient is non-zero.
//
// Quadrature Domains' sym-core carries an independent Berlekamp–Zassenhaus (ADR-0008's standing
// exception: two implementations in two languages that share no code). A differential test in QD's
// suite factors the same corpus with both.
import { Frac, Gauss } from "./gaussian.js";
import { QiPoly } from "./qiPoly.js";
import { yunSquarefree } from "./squarefree.js";
import {
  factorModP,
  mpAdd,
  mpDivmod,
  mpExtGcd,
  mpFromBig,
  mpMonic,
  mpMul,
  mpSquarefree,
  primesBelow,
  type ModPoly,
} from "./modPoly.js";

export type ZPoly = bigint[];

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function zTrim(a: readonly bigint[]): ZPoly {
  let n = a.length;
  while (n > 0 && a[n - 1] === 0n) n--;
  return a.slice(0, n);
}

export const zDeg = (a: readonly bigint[]): number => a.length - 1;

/** gcd of the coefficients, with the sign of the leading one (0 for the zero polynomial). */
export function zContent(a: readonly bigint[]): bigint {
  let g = 0n;
  for (const c of a) g = gcd(g, c);
  return a.length && a[a.length - 1] < 0n ? -g : g;
}

/** The primitive part, leading coefficient positive. */
export function zPrimitive(a: readonly bigint[]): ZPoly {
  const c = zContent(a);
  return c === 0n ? [] : zTrim(a.map((x) => x / c));
}

export function zMul(a: readonly bigint[], b: readonly bigint[]): ZPoly {
  if (!a.length || !b.length) return [];
  const out = new Array<bigint>(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return zTrim(out);
}

/** a / b over ℤ when b divides a EXACTLY, else null. */
export function zDivExact(a: readonly bigint[], b: readonly bigint[]): ZPoly | null {
  const r = zTrim(a).slice();
  const db = b.length - 1;
  if (db < 0) return null;
  if (r.length - 1 < db) return r.length === 0 ? [] : null;
  const q = new Array<bigint>(r.length - db).fill(0n);
  const lb = b[db];
  for (let i = r.length - 1; i >= db; i--) {
    if (r[i] % lb !== 0n) return null;
    const c = r[i] / lb;
    q[i - db] = c;
    if (c !== 0n) for (let j = 0; j <= db; j++) r[i - db + j] -= c * b[j];
  }
  for (let i = 0; i < db; i++) if (r[i] !== 0n) return null;
  return zTrim(q);
}

export function zEval(a: readonly bigint[], x: bigint): bigint {
  let v = 0n;
  for (let k = a.length - 1; k >= 0; k--) v = v * x + a[k];
  return v;
}

/** ⌊√n⌋ for n ≥ 0. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrt: negative input");
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Is n the square of an integer? (Negative numbers are not.) */
export function isSquare(n: bigint): boolean {
  if (n < 0n) return false;
  const r = isqrt(n);
  return r * r === n;
}

/** The integer polynomial ∝ a QiPoly with rational coefficients (primitive, lc > 0); throws on i. */
export function zFromQi(p: QiPoly): ZPoly {
  let L = 1n;
  for (const c of p.coeffs) {
    if (!c.im.isZero()) throw new Error("zFromQi: a coefficient is not rational");
    L = (L * c.re.d) / gcd(L, c.re.d);
  }
  return zPrimitive(p.coeffs.map((c) => (c.re.n * L) / c.re.d));
}

export const zToQi = (a: readonly bigint[]): QiPoly =>
  QiPoly.fromCoeffs(a.map((c) => new Gauss(Frac.of(c), Frac.ZERO)));

// ── Hensel lifting ─────────────────────────────────────────────────────────────────────────────────

const smod = (x: bigint, m: bigint): bigint => {
  const r = ((x % m) + m) % m;
  return r > m / 2n ? r - m : r;
};
const reduce = (a: readonly bigint[], m: bigint): ZPoly =>
  zTrim(a.map((c) => ((c % m) + m) % m));
const toMod = (a: readonly bigint[], p: number): ModPoly => mpFromBig(a as bigint[], p);
const fromMod = (a: ModPoly): ZPoly => a.map((c) => BigInt(c));

/** Divide a polynomial with integer coefficients all divisible by d. */
const divAll = (a: readonly bigint[], d: bigint): ZPoly => zTrim(a.map((c) => c / d));

/**
 * Lift f ≡ g·h (mod p), g and h MONIC and coprime mod p, f monic, to f ≡ G·H (mod pᴷ), one power of p
 * at a time: with s·g + t·h ≡ 1 (mod p) and e = (f − G·H)/pʲ, the corrections A = e·t mod g and
 * B = e·s + q·h (where e·t = q·g + A) give G + pʲA, H + pʲB, which agree with f to one more power.
 */
function henselPair(
  f: ZPoly,
  g: ZPoly,
  h: ZPoly,
  p: number,
  K: number,
): { G: ZPoly; H: ZPoly } {
  const P = BigInt(p);
  const { g: one, s, t } = mpExtGcd(toMod(g, p), toMod(h, p), p);
  if (one.length !== 1) throw new Error("henselPair: the factors are not coprime mod p");
  let G = g.slice();
  let H = h.slice();
  let pj = P;
  for (let j = 1; j < K; j++) {
    const GH = zMul(G, H);
    const diff = f.map((c, k) => c - (GH[k] ?? 0n));
    const e = toMod(divAll(reduce(diff, pj * P), pj), p);
    // e = e·s·g + e·t·h, and e·t = q·g + A, so e = (e·s + q·h)·g + A·h.
    const { q, r: A } = mpDivmod(mpMul(e, t, p), toMod(G, p), p);
    const B = mpAdd(mpMul(e, s, p), mpMul(q, toMod(H, p), p), p);
    G = addScaled(G, A, pj);
    H = addScaled(H, B, pj);
    pj *= P;
  }
  const m = pj;
  return { G: reduce(G, m), H: reduce(H, m) };
}

/** a + c·b, b's residues read as integers. */
function addScaled(a: ZPoly, b: ModPoly, c: bigint): ZPoly {
  const out = new Array<bigint>(Math.max(a.length, b.length)).fill(0n);
  for (let k = 0; k < out.length; k++) out[k] = (a[k] ?? 0n) + c * BigInt(b[k] ?? 0);
  return zTrim(out);
}

/** Lift a full factorisation f ≡ ∏ gᵢ (mod p) (f and the gᵢ monic) to pᴷ, pair by pair. */
function henselAll(f: ZPoly, gs: readonly ModPoly[], p: number, K: number): ZPoly[] {
  if (gs.length === 1) return [f];
  const g = fromMod(gs[0]);
  let rest: ModPoly = [1];
  for (const x of gs.slice(1)) rest = mpMul(rest, x, p);
  const { G, H } = henselPair(f, g, fromMod(rest), p, K);
  return [G, ...henselAll(H, gs.slice(1), p, K)];
}

// ── Recombination ──────────────────────────────────────────────────────────────────────────────────

function* subsets(
  n: number,
  k: number,
  start = 0,
  acc: number[] = [],
): Generator<number[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= n - (k - acc.length); i++) {
    acc.push(i);
    yield* subsets(n, k, i + 1, acc);
    acc.pop();
  }
}

/** The irreducible monic factors over ℤ of a MONIC squarefree F, from its lifted factors mod m. */
function recombine(F: ZPoly, lifted: ZPoly[], m: bigint): ZPoly[] {
  const out: ZPoly[] = [];
  let rest = F;
  let pool = lifted.slice();
  for (let k = 1; 2 * k <= pool.length;) {
    let found = false;
    for (const S of subsets(pool.length, k)) {
      let cand: ZPoly = [1n];
      for (const i of S) cand = reduce(zMul(cand, pool[i]), m);
      cand = zTrim(cand.map((c) => smod(c, m)));
      // Cheap necessary test first: the constant term must divide.
      if (cand[0] !== 0n && rest[0] % cand[0] !== 0n) continue;
      const q = zDivExact(rest, cand);
      if (!q) continue;
      out.push(cand);
      rest = q;
      pool = pool.filter((_, i) => !S.includes(i));
      found = true;
      break;
    }
    if (!found) k++;
  }
  out.push(rest);
  return out;
}

/** 2ⁿ·‖F‖₂, rounded up — Mignotte's bound on the coefficients of a monic factor of F. */
function mignotte(F: ZPoly): bigint {
  let n2 = 0n;
  for (const c of F) n2 += c * c;
  return (1n << BigInt(F.length - 1)) * (isqrt(n2) + 1n);
}

/** The irreducible factors of a PRIMITIVE SQUAREFREE f over ℤ (each primitive, lc > 0). */
function factorSquarefree(f: ZPoly): ZPoly[] {
  const n = zDeg(f);
  if (n <= 1) return [f];
  const lc = f[n];
  // Monic transform F(y) = lcⁿ⁻¹·f(y/lc): factors of F are monic and map back by primitive(G(lc·x)).
  const F: ZPoly = f.map((c, k) => (k === n ? 1n : c * lc ** BigInt(n - 1 - k)));
  // A few good primes, keeping the one with fewest factors mod p (the recombination is exponential in it).
  let best: { p: number; factors: ModPoly[] } | null = null;
  let good = 0;
  for (const p of primesBelow(2000)) {
    if (p === 2) continue;
    const Fp = mpFromBig(F, p);
    if (Fp.length - 1 !== n || !mpSquarefree(Fp, p)) continue;
    const factors = factorModP(mpMonic(Fp, p), p);
    if (!best || factors.length < best.factors.length) best = { p, factors };
    if (factors.length === 1) return [f]; // irreducible mod p ⇒ irreducible over ℤ
    if (++good >= 5) break;
  }
  if (!best)
    throw new Error("factorOverZ: no prime below 2000 keeps the polynomial squarefree");
  const P = BigInt(best.p);
  const need = 2n * mignotte(F) + 1n;
  let K = 1;
  let m = P;
  while (m < need) {
    m *= P;
    K++;
  }
  const lifted = henselAll(F, best.factors, best.p, K);
  return recombine(F, lifted, m)
    .map((G) => zPrimitive(G.map((c, k) => c * lc ** BigInt(k))))
    .sort(byDegreeThenCoeffs);
}

function byDegreeThenCoeffs(a: ZPoly, b: ZPoly): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export interface ZFactorisation {
  /** The integer unit and content: f = unit · ∏ factorᵐ. */
  readonly unit: bigint;
  /** Irreducible, primitive, leading coefficient positive; sorted by degree, then coefficients. */
  readonly factors: readonly { readonly poly: ZPoly; readonly multiplicity: number }[];
}

/**
 * The complete factorisation of a non-zero f ∈ ℤ[x] into irreducibles over ℤ (Gauss's lemma makes this
 * the factorisation over ℚ as well, up to units). A constant returns no factors.
 */
export function factorOverZ(fIn: readonly bigint[]): ZFactorisation {
  const f = zTrim(fIn);
  if (f.length === 0)
    throw new Error("factorOverZ: the zero polynomial has no factorisation");
  const unit = zContent(f);
  const prim = zPrimitive(f);
  if (zDeg(prim) === 0) return { unit, factors: [] };
  const factors: { poly: ZPoly; multiplicity: number }[] = [];
  for (const { factor, multiplicity } of yunSquarefree(zToQi(prim)))
    for (const g of factorSquarefree(zFromQi(factor)))
      factors.push({ poly: g, multiplicity });
  factors.sort(
    (a, b) => byDegreeThenCoeffs(a.poly, b.poly) || a.multiplicity - b.multiplicity,
  );
  return { unit, factors };
}

/** The rational roots of f, from its linear factors over ℤ (so the list is complete and exact). */
export function rationalRoots(f: readonly bigint[]): Frac[] {
  return factorOverZ(f)
    .factors.filter((x) => x.poly.length === 2)
    .map((x) => Frac.of(-x.poly[0], x.poly[1]));
}
