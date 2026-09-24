// smith.ts — Smith's inclusion discs, computed exactly.
//
// B. T. Smith, "Error bounds for zeros of a polynomial based upon Gerschgorin's theorems" (JACM 17,
// 1970): let p have degree n and leading coefficient aₙ, and let z₁ … zₙ be pairwise DISTINCT points.
// With the Weierstrass correction
//
//     Wᵢ = p(zᵢ) / (aₙ · ∏_{j≠i} (zᵢ − zⱼ)),
//
// every root of p lies in the union of the discs D(zᵢ, n·|Wᵢ|), and a connected component of that
// union made of k discs contains EXACTLY k roots, counted with multiplicity.
//
// The points a floating-point root-finder returns are dyadic rationals, so every quantity above is an
// element of ℚ(i) and can be computed with no rounding at all. That is the whole idea (ADR-0047
// decision 5): the certificate is not an error analysis of the float computation that produced the
// zᵢ, it is Smith's theorem applied, in exact arithmetic, to the very numbers on screen. A disc here
// is carried by its SQUARED radius `n²·|Wᵢ|²`, which is rational where the radius is not.
//
// Added for Polynomial Root Analysis (ADR-0047, PRA-1); `@cas/monodromy`'s certified tracker is the
// planned second consumer (PRA-3).
import { bigGcd, Frac, Gauss } from "./gaussian.js";

/** The exact value of a finite double, as the dyadic rational it already is. */
export function fracOfDouble(x: number): Frac {
  if (!Number.isFinite(x)) throw new Error("fracOfDouble: non-finite input");
  if (Number.isInteger(x)) return Frac.of(BigInt(x));
  // Doubling a double is exact until it becomes an integer, which happens within 1074 steps.
  let scaled = x;
  let k = 0n;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    k++;
  }
  return Frac.of(BigInt(scaled), 1n << k);
}

/** The exact Gaussian rational `re + i·im` of two finite doubles. */
export function gaussOfDoubles(re: number, im: number): Gauss {
  return new Gauss(fracOfDouble(re), fracOfDouble(im));
}

/** Sign of `a − b`: −1, 0 or 1. (`Frac` keeps its denominator positive.) */
export function compareFrac(a: Frac, b: Frac): number {
  const n = a.sub(b).n;
  return n > 0n ? 1 : n < 0n ? -1 : 0;
}

/** ⌈√m⌉ for a non-negative BigInt. */
function isqrtCeil(m: bigint): bigint {
  if (m < 0n) throw new Error("isqrtCeil: negative input");
  if (m < 2n) return m;
  // Newton from above converges to ⌊√m⌋.
  let x = 1n << BigInt(Math.ceil(m.toString(2).length / 2));
  for (;;) {
    const y = (x + m / x) >> 1n;
    if (y >= x) break;
    x = y;
  }
  return x * x === m ? x : x + 1n;
}

/**
 * A rational UPPER bound on `√s` for `s ≥ 0`, within a relative 2⁻⁵⁰ of it: `√(n/d) = √(n·d)/d`,
 * scaled by `4ᵏ` so the integer square root carries at least 110 bits before it is rounded up.
 * Used to DISPLAY a radius; every decision is taken on the squared radius itself.
 */
export function sqrtUpperBound(s: Frac): Frac {
  if (s.n < 0n) throw new Error("sqrtUpperBound: negative input");
  if (s.n === 0n) return Frac.ZERO;
  const nd = s.n * s.d;
  const k = Math.max(0, Math.ceil((110 - nd.toString(2).length) / 2));
  const root = isqrtCeil(nd << BigInt(2 * k));
  return Frac.of(root, s.d << BigInt(k));
}

/** The least common multiple of positive BigInts. */
function lcm(values: Iterable<bigint>): bigint {
  let l = 1n;
  for (const v of values) l = (l / bigGcd(l, v)) * v;
  return l;
}

/**
 * A bracket `[lo, hi]` on `log₂ x` for a BigInt `x > 0`, from `m·2ᵏ ≤ x < (m + 1)·2ᵏ` with
 * `m = ⌊x / 2ᵏ⌋` the top ~56 bits. It is only as good as `Number(m)` and `Math.log2` — a few ulps of an
 * absolute error of at most ~1e-11 for any bit length this file meets — and {@link pairVerdict}'s
 * margin of 1e-6 is what makes a verdict built on it rigorous.
 */
function log2Bracket(x: bigint): readonly [number, number] {
  const bits = x.toString(16).length * 4; // ≥ the bit length, within 3
  const k = Math.max(0, bits - 56);
  const m = Number(x >> BigInt(k)); // < 2⁵⁶, and a double holds it to within one ulp either way
  return [Math.log2(m * (1 - 2 ** -52)) + k, Math.log2((m + 1) * (1 + 2 ** -52)) + k];
}

/** Bracket on `log₂ √(a/b)` (−∞ for `a = 0`). */
function halfLog2Ratio(a: bigint, b: bigint): readonly [number, number] {
  if (a === 0n) return [-Infinity, -Infinity];
  const la = log2Bracket(a);
  const lb = log2Bracket(b);
  return [(la[0] - lb[1]) / 2, (la[1] - lb[0]) / 2];
}

/**
 * Decide disjointness of two discs from brackets alone, or return `null` when they are too close to
 * call. The margin `1e-6` dwarfs every floating-point error in the brackets and the few `log2`/`2**`
 * evaluations here (each within a few ulps), so a verdict returned is a theorem about the exact values.
 */
function pairVerdict(
  N: bigint,
  logS2: readonly [number, number],
  ra: readonly [number, number],
  rb: readonly [number, number],
): boolean | null {
  const ln = log2Bracket(N);
  const dLo = (ln[0] - logS2[1]) / 2; // log₂ of a lower bound on δ
  const dHi = (ln[1] - logS2[0]) / 2;
  const MARGIN = 1e-6;
  const hiMax = Math.max(ra[1], rb[1]);
  if (hiMax === -Infinity) return true; // two points, and they are distinct
  const sumHi = hiMax + Math.log2(1 + 2 ** (Math.min(ra[1], rb[1]) - hiMax)); // log₂(ρa + ρb), from above
  if (dLo > sumHi + MARGIN) return true;
  const loMax = Math.max(ra[0], rb[0]);
  if (loMax > -Infinity) {
    const sumLo = loMax + Math.log2(1 + 2 ** (Math.min(ra[0], rb[0]) - loMax)); // log₂(ρa + ρb), from below
    if (dHi < sumLo - MARGIN) return false;
  }
  return null;
}

/**
 * One of Smith's discs. The squared radius is carried UNREDUCED as `rNum / rDen` (`rDen > 0`), because
 * reducing a few-thousand-bit fraction costs more than everything else here put together; `radiusSq`
 * reduces it on first read.
 */
export class SmithDisc {
  private reduced: Frac | null = null;
  constructor(
    /** The approximation zᵢ, exactly. */
    readonly centre: Gauss,
    /** Numerator of `n²·|Wᵢ|²`. */
    readonly rNum: bigint,
    /** Denominator of `n²·|Wᵢ|²`, positive. */
    readonly rDen: bigint,
    /** Index of the connected component of the union this disc belongs to (0-based, first-seen order). */
    readonly component: number,
    /** How many discs — hence, by Smith's theorem, how many roots — that component holds. */
    readonly count: number,
  ) {}

  /** `n²·|Wᵢ|²`, the squared radius, in lowest terms. Reduced on first read — a gcd on thousands of bits. */
  get radiusSq(): Frac {
    this.reduced ??= Frac.of(this.rNum, this.rDen);
    return this.reduced;
  }

  /**
   * A double that is ≥ the radius, for DRAWING the disc: `√(rNum/rDen)` from the top 64 bits of each
   * side, bumped by a relative 1e-12 that dwarfs the few roundings on the way. Costs no gcd, which is
   * the point — reading `radiusSq` to draw it took 18 ms a frame at degree 24 against Smith's own 0.9.
   */
  radiusUpper(): number {
    if (this.rNum === 0n) return 0;
    const bits = (x: bigint): number => x.toString(16).length * 4;
    const sn = Math.max(0, bits(this.rNum) - 64);
    const sd = Math.max(0, bits(this.rDen) - 64);
    // Both shifted parts are at most one unit below their true values, so round the quotient UP.
    const num = Number(this.rNum >> BigInt(sn)) + 1;
    const den = Number(this.rDen >> BigInt(sd));
    const log2 = Math.log2(num) - Math.log2(den) + (sn - sd);
    return 2 ** (log2 / 2) * (1 + 1e-12);
  }
}

export type SmithResult =
  | {
      readonly ok: true;
      readonly discs: readonly SmithDisc[];
      readonly components: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Are the closed discs `D(a, √sa)` and `D(b, √sb)` provably DISJOINT? Exact and tight: with
 * `δ² = |a − b|²`, disjoint ⟺ `√sa + √sb < δ` ⟺ `δ² − sa − sb > 0` and `(δ² − sa − sb)² > 4·sa·sb`.
 */
export function discsDisjoint(a: Gauss, sa: Frac, b: Gauss, sb: Frac): boolean {
  const gap = a.sub(b).norm2().sub(sa).sub(sb);
  if (gap.n <= 0n) return false;
  return compareFrac(gap.mul(gap), Frac.of(4n).mul(sa).mul(sb)) > 0;
}

/** Is `z` in the closed disc `D(centre, √radiusSq)`? Exact. */
export function inDisc(
  z: Gauss,
  disc: { readonly centre: Gauss; readonly radiusSq: Frac } | SmithDisc,
): boolean {
  const d2 = z.sub(disc.centre).norm2();
  if (disc instanceof SmithDisc) return d2.n * disc.rDen <= disc.rNum * d2.d;
  return compareFrac(d2, disc.radiusSq) <= 0;
}

/**
 * Smith's discs for the polynomial with EXACT ascending coefficients `coeffs` (`coeffs[k]` the
 * coefficient of zᵏ, the last one non-zero) about the approximations `approx` (one per root, pairwise
 * distinct). Refuses by name when the theorem's hypotheses fail rather than returning a disc it cannot
 * stand behind.
 *
 * **Arithmetic.** Everything is scaled to integers once and no fraction is reduced inside the loops:
 * with `D` the common denominator of the coefficients and `S` that of the approximations (a power of
 * two when they came from doubles), `Cₖ = D·aₖ` and `Zᵢ = S·zᵢ` are Gaussian integers,
 * `Pᵢ = Σ Cₖ Zᵢᵏ S^{n−k}` = `D·Sⁿ·p(zᵢ)` by homogenised Horner, `Nᵢⱼ = |Zᵢ − Zⱼ|²`, and
 *
 *     sᵢ = n²·|Pᵢ|² / (S²·|Cₙ|²·∏_{j≠i} Nᵢⱼ).
 *
 * The first version reduced every intermediate `Frac` by gcd and took 8.2 s at degree 24 (measured);
 * see ADR-0047's PRA-1 finding.
 */
export function smithDiscs(
  coeffs: readonly Gauss[],
  approx: readonly Gauss[],
): SmithResult {
  const n = coeffs.length - 1;
  if (n < 1)
    return { ok: false, reason: "a constant polynomial has no roots to enclose" };
  if (coeffs[n].isZero()) return { ok: false, reason: "the leading coefficient is zero" };
  if (approx.length !== n) {
    return {
      ok: false,
      reason: `${approx.length} approximations were given for a polynomial of degree ${n}`,
    };
  }

  const D = lcm(coeffs.flatMap((c) => [c.re.d, c.im.d]));
  const S = lcm(approx.flatMap((z) => [z.re.d, z.im.d]));
  const C = coeffs.map((c) => [(c.re.n * D) / c.re.d, (c.im.n * D) / c.im.d] as const);
  const Z = approx.map((z) => [(z.re.n * S) / z.re.d, (z.im.n * S) / z.im.d] as const);
  const sPow: bigint[] = [1n];
  for (let m = 1; m <= n; m++) sPow.push(sPow[m - 1] * S);

  // Nᵢⱼ, once per pair.
  const N: bigint[][] = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = Z[i][0] - Z[j][0];
      const dy = Z[i][1] - Z[j][1];
      const v = dx * dx + dy * dy;
      if (v === 0n) {
        return {
          ok: false,
          reason: `approximations ${i + 1} and ${j + 1} coincide, so no disc can separate them`,
        };
      }
      N[i][j] = v;
      N[j][i] = v;
    }
  }

  const leadNorm = C[n][0] * C[n][0] + C[n][1] * C[n][1];
  const nSq = BigInt(n * n);
  const rNum: bigint[] = [];
  const rDen: bigint[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = Z[i];
    let re = C[n][0];
    let im = C[n][1];
    for (let k = n - 1; k >= 0; k--) {
      const nr = re * x - im * y + C[k][0] * sPow[n - k];
      im = re * y + im * x + C[k][1] * sPow[n - k];
      re = nr;
    }
    let den = S * S * leadNorm;
    for (let j = 0; j < n; j++) if (j !== i) den *= N[i][j];
    rNum.push(nSq * (re * re + im * im));
    rDen.push(den);
  }

  // Components of the union: union–find over the pairs that are NOT provably disjoint. Most pairs are
  // decided by `pairVerdict`'s rigorous log₂ brackets; only a pair within a factor ~1 + 1e-6 of touching
  // reaches the exact test, which is discsDisjoint's cleared of denominators: with sₐ = a/b,
  // s_b = a′/b′ and δ² = N/S², G = N·b·b′ − S²(a·b′ + a′·b), and disjoint ⟺ G > 0 and
  // G² > 4·a·a′·S⁴·b·b′.
  const S2 = S * S;
  const logS2 = log2Bracket(S2);
  const logR = rNum.map((a, i) => halfLog2Ratio(a, rDen[i]));
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    return r;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let disjoint = pairVerdict(N[i][j], logS2, logR[i], logR[j]);
      if (disjoint === null) {
        const G =
          N[i][j] * rDen[i] * rDen[j] - S2 * (rNum[i] * rDen[j] + rNum[j] * rDen[i]);
        disjoint = G > 0n && G * G > 4n * rNum[i] * rNum[j] * S2 * S2 * rDen[i] * rDen[j];
      }
      if (!disjoint) parent[find(i)] = find(j);
    }
  }
  const componentOf = new Map<number, number>();
  const size = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!componentOf.has(r)) componentOf.set(r, componentOf.size);
    size.set(r, (size.get(r) ?? 0) + 1);
  }
  const discs = approx.map((centre, i) => {
    const r = find(i);
    return new SmithDisc(
      centre,
      rNum[i],
      rDen[i],
      componentOf.get(r) ?? 0,
      size.get(r) ?? 1,
    );
  });
  return { ok: true, discs, components: componentOf.size };
}
