// Aberth sweeps with p/p′ evaluated EXACTLY — the roots of the polynomial on screen, not of its
// floating-point evaluation.
//
// **Why this exists (measured, PRA-1).** Aberth's residual stopping rule says each root is an exact
// root of a polynomial within ~8ε of ours. On Wilkinson's `∏(z − k)` that is a region, not a point:
// the ε-pseudozero set around 10…19 is so wide that the solver "converged" to 11.23 − 0.15i and
// 11.66 − 0.03i — each individually backward-stable, together not conjugate-closed, and Smith's discs
// about them (with the EXACT integer coefficients) had radii up to 338, one component of 20. No
// floating-point evaluation can do better, because the error is in evaluating p. But every
// coefficient here is an exact rational (the typed polynomial) or dyadic (a float), and every iterate
// is dyadic, so p(z) and p′(z) can be evaluated with no error at all; with that, Aberth's iteration
// converges to the roots of THIS polynomial to the last bit a double can hold.
//
// Arithmetic as in @cas/exact's `smithDiscs`: `Cₖ = D·aₖ` Gaussian integers, each iterate `z = Z/2ᵉ`,
// homogenised Horner for `P = D·2^{en}·p(z)` and `P′ = D·2^{e(n−1)}·p′(z)`, and only the quotient
// p/p′ = P/(2ᵉ·P′) is rounded to a double. The repulsion sum stays in doubles: it steers, it does not
// decide where the root is.
import type { Gauss } from "@cas/exact";
import { bigGcd } from "@cas/exact";
import type { Cx } from "../types.js";

const EPS = 2.220446049250313e-16;

/** The double nearest to n/d (d > 0), robust to either side overflowing a double. */
function quotient(n: bigint, d: bigint): number {
  if (n === 0n) return 0;
  const neg = n < 0n;
  const a = neg ? -n : n;
  const bits = (x: bigint): number => x.toString(16).length * 4;
  const shiftA = Math.max(0, bits(a) - 64);
  const shiftD = Math.max(0, bits(d) - 64);
  const v =
    (Number(a >> BigInt(shiftA)) / Number(d >> BigInt(shiftD))) * 2 ** (shiftA - shiftD);
  return neg ? -v : v;
}

/** `x` as `m / 2ᵉ` with integer `m` (exact for a finite double). */
function dyadic(x: number): { m: bigint; e: number } {
  let e = 0;
  let v = x;
  while (!Number.isInteger(v)) {
    v *= 2;
    e++;
  }
  return { m: BigInt(v), e };
}

export interface Refined {
  readonly roots: Cx[];
  /** Every root's last exact Newton–Aberth step was below the resolution of a double. */
  readonly converged: boolean;
  readonly sweeps: number;
}

/**
 * Refine `roots` (pairwise distinct, one per root) against the EXACT ascending coefficients `coeffs`.
 * Returns the input unchanged if it is degenerate (a non-finite root).
 */
export function refineExactly(
  coeffs: readonly Gauss[],
  roots: readonly Cx[],
  maxSweeps = 60,
): Refined {
  const n = coeffs.length - 1;
  const z: [number, number][] = roots.map(([x, y]) => [x, y]);
  if (!z.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) || n < 1) {
    return { roots: z, converged: false, sweeps: 0 };
  }
  let D = 1n;
  for (const c of coeffs) for (const f of [c.re, c.im]) D = (D / bigGcd(D, f.d)) * f.d;
  const Cr = coeffs.map((c) => (c.re.n * D) / c.re.d);
  const Ci = coeffs.map((c) => (c.im.n * D) / c.im.d);

  const settled = new Array<boolean>(n).fill(false);
  for (let sweep = 1; sweep <= maxSweeps; sweep++) {
    let all = true;
    for (let k = 0; k < n; k++) {
      if (settled[k]) continue;
      const [x, y] = z[k];
      const dx = dyadic(x);
      const dy = dyadic(y);
      const e = Math.max(dx.e, dy.e);
      const X = dx.m << BigInt(e - dx.e);
      const Y = dy.m << BigInt(e - dy.e);
      const S = 1n << BigInt(e);
      // Homogenised Horner for P and P′ together: P = Σ Cⱼ Zʲ S^{n−j}, P′ = Σ j Cⱼ Z^{j−1} S^{n−j}.
      let pr = Cr[n];
      let pi = Ci[n];
      let dr = 0n;
      let di = 0n;
      let sPow = 1n; // S^{n−j} for the term being added
      for (let j = n - 1; j >= 0; j--) {
        sPow *= S;
        // With Qⱼ = Qⱼ₊₁·Z + Cⱼ·S^{n−j} (so P = Q₀), ∂Q/∂Z obeys Q′ⱼ = Q′ⱼ₊₁·Z + Qⱼ₊₁ — no power of S.
        const ndr = dr * X - di * Y + pr;
        const ndi = dr * Y + di * X + pi;
        dr = ndr;
        di = ndi;
        const npr = pr * X - pi * Y + Cr[j] * sPow;
        const npi = pr * Y + pi * X + Ci[j] * sPow;
        pr = npr;
        pi = npi;
      }
      if (pr === 0n && pi === 0n) {
        settled[k] = true; // an exact root
        continue;
      }
      // ratio = p/p′ = P/(S·P′) where P′ here is Σ j Cⱼ Z^{j−1} S^{n−j} (so p′ = P′/(D·S^{n−1})).
      const den = (dr * dr + di * di) * S;
      if (den === 0n) {
        all = false;
        continue;
      }
      const rr = quotient(pr * dr + pi * di, den);
      const ri = quotient(pi * dr - pr * di, den);
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        const ax = x - z[j][0];
        const ay = y - z[j][1];
        const a2 = ax * ax + ay * ay;
        if (a2 === 0) continue;
        sr += ax / a2;
        si -= ay / a2;
      }
      const wr = 1 - (rr * sr - ri * si);
      const wi = -(rr * si + ri * sr);
      const w2 = wr * wr + wi * wi;
      if (w2 === 0 || !Number.isFinite(w2)) {
        all = false;
        continue;
      }
      const stepR = (rr * wr + ri * wi) / w2;
      const stepI = (ri * wr - rr * wi) / w2;
      const nx = x - stepR;
      const ny = y - stepI;
      if (
        Math.hypot(stepR, stepI) <= 2 * EPS * Math.hypot(nx, ny) ||
        (nx === x && ny === y)
      )
        settled[k] = true;
      else all = false;
      z[k] = [nx, ny];
    }
    if (all) return { roots: z.map(flush), converged: true, sweeps: sweep };
  }
  return { roots: z.map(flush), converged: false, sweeps: maxSweeps };
}

/**
 * A component below one ulp of the root's modulus is set to zero. It is not information — the double
 * cannot hold the root that finely — and it is a false readout: without this, exact refinement leaves
 * Wilkinson's root 3 at 3 + 4.7e-38i in ℂ mode, and the Roots card would print that imaginary part
 * (measured over the sandbox corpus: 10 such components). *(An earlier draft of this comment blamed
 * such components for 2.5 s Smith discs; that measurement was taken against a stale @cas/exact build,
 * and with a current one the discs cost the same either way.)*
 */
function flush([x, y]: [number, number]): Cx {
  const tiny = EPS * Math.hypot(x, y);
  return [Math.abs(x) < tiny ? 0 : x, Math.abs(y) < tiny ? 0 : y];
}
