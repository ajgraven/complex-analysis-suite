// The roots of a monic integer polynomial to S bits, CERTIFIED (DESIGN §4.6 step 1): Newton in
// fixed point (BigInt mantissas, S fractional bits) from the plotted roots, then Smith's discs about
// the result computed exactly, each required to hold exactly one root. What comes out is one disc per
// root, in the order of the approximations it started from — so root i here is the root the reader
// sees labelled i, and the suite checks that too (`labelsHold`).
//
// Newton is not trusted: it only moves the centres. The claim "the i-th root lies within rᵢ of cᵢ"
// is Smith's theorem, evaluated exactly on the dyadic centres.
import {
  Frac,
  Gauss,
  discsDisjoint,
  gaussOfDoubles,
  isqrt,
  smithDiscs,
} from "@cas/exact";
import type { Disc } from "./discArith.js";

type Cx = readonly [number, number];

export type PreciseRoots =
  | { readonly ok: true; readonly S: number; readonly roots: readonly Disc[] }
  | { readonly ok: false; readonly reason: string };

/** A finite double as an exact fixed-point mantissa at S fractional bits (rounded toward −∞ past S). */
export function fixedOfDouble(x: number, S: number): bigint {
  if (!Number.isFinite(x)) throw new Error("fixedOfDouble: non-finite input");
  let m = x;
  let e = 0;
  while (!Number.isInteger(m)) {
    m *= 2;
    e++;
  }
  const big = BigInt(m);
  return S >= e ? big << BigInt(S - e) : big >> BigInt(e - S);
}

/** F(z) and F′(z) at a fixed-point z (Horner), F monic with integer coefficients, ascending. */
function horner(
  F: readonly bigint[],
  zr: bigint,
  zi: bigint,
  s: bigint,
): { pr: bigint; pi: bigint; dr: bigint; di: bigint } {
  const n = F.length - 1;
  let pr = F[n] << s;
  let pi = 0n;
  let dr = 0n;
  let di = 0n;
  for (let k = n - 1; k >= 0; k--) {
    const ndr = ((dr * zr - di * zi) >> s) + pr;
    const ndi = ((dr * zi + di * zr) >> s) + pi;
    dr = ndr;
    di = ndi;
    const npr = ((pr * zr - pi * zi) >> s) + (F[k] << s);
    const npi = (pr * zi + pi * zr) >> s;
    pr = npr;
    pi = npi;
  }
  return { pr, pi, dr, di };
}

const isqrtCeil = (m: bigint): bigint => {
  const r = isqrt(m);
  return r * r === m ? r : r + 1n;
};

/**
 * Refine `approx` (one per root, the order kept) to S fractional bits and certify each in its own
 * Smith disc. Refuses by name when a root cannot be isolated at this precision.
 */
export function preciseRoots(
  F: readonly bigint[],
  approx: readonly Cx[],
  S: number,
): PreciseRoots {
  const n = F.length - 1;
  if (F[n] !== 1n) throw new Error("preciseRoots: the polynomial must be monic");
  if (approx.length !== n) throw new Error("preciseRoots: one approximation per root");
  const s = BigInt(S);
  const zr = approx.map(([x]) => fixedOfDouble(x, S));
  const zi = approx.map(([, y]) => fixedOfDouble(y, S));
  // Quadratic convergence from ~50 correct bits: log₂(S/50) steps, plus a margin for a slow start.
  const steps = Math.ceil(Math.log2(Math.max(2, S / 40))) + 4;
  for (let it = 0; it < steps; it++) {
    for (let i = 0; i < n; i++) {
      const { pr, pi, dr, di } = horner(F, zr[i], zi[i], s);
      const den = dr * dr + di * di;
      if (den === 0n) continue; // at a critical point: leave it, and let Smith judge the result
      // p/p′ = p·conj(p′)/|p′|², back at scale S.
      const qr = ((pr * dr + pi * di) << s) / den;
      const qi = ((pi * dr - pr * di) << s) / den;
      zr[i] -= qr;
      zi[i] -= qi;
    }
  }
  const denom = 1n << s;
  const centres = zr.map((re, i) => new Gauss(Frac.of(re, denom), Frac.of(zi[i], denom)));
  const coeffs = F.map((c) => new Gauss(Frac.of(c), Frac.ZERO));
  const smith = smithDiscs(coeffs, centres);
  if (!smith.ok) return { ok: false, reason: smith.reason };
  if (smith.discs.some((d) => d.count !== 1))
    return {
      ok: false,
      reason: `the roots could not be separated from one another at ${S} bits`,
    };
  const roots = smith.discs.map((d, i) => ({
    re: zr[i],
    im: zi[i],
    // √(rNum/rDen)·2ˢ, rounded up.
    r: isqrtCeil(-(-(d.rNum << (2n * s)) / d.rDen)) + 1n,
  }));
  return { ok: true, S, roots };
}

/**
 * Do the plotted approximations name the SAME roots the refined discs hold? The plotted points' own
 * Smith discs (exact, about the doubles) must isolate every root; then every root lies in exactly one
 * plotted disc, so a refined disc DISJOINT from every plotted disc but its own holds the root the
 * reader sees as rᵢ. Exact.
 */
export function labelsHold(
  F: readonly bigint[],
  approx: readonly Cx[],
  roots: readonly Disc[],
  S: number,
): boolean {
  const coeffs = F.map((c) => new Gauss(Frac.of(c), Frac.ZERO));
  const plotted = smithDiscs(
    coeffs,
    approx.map(([x, y]) => gaussOfDoubles(x, y)),
  );
  if (!plotted.ok || plotted.discs.some((d) => d.count !== 1)) return false;
  const denom = 1n << BigInt(S);
  return roots.every((z, i) => {
    const centre = new Gauss(Frac.of(z.re, denom), Frac.of(z.im, denom));
    const rSq = Frac.of(z.r * z.r, denom * denom);
    return plotted.discs.every(
      (d, j) => j === i || discsDisjoint(centre, rSq, d.centre, d.radiusSq),
    );
  });
}
