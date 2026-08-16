// Evaluation of the exterior map φ and the closed-form (exact) exterior Faber transform of a rational
// input with a pole outside the unit disk. For a pole z₀ with |z₀| > 1 (so f = 1/(z−z₀)^m ∈ 𝒜(𝔻)):
//
//     Φφ( 1/(z−z₀)  )(w) = φ'(z₀) / (w − φ(z₀))
//     Φφ( 1/(z−z₀)² )(w) = φ''(z₀)/(w − φ(z₀)) + φ'(z₀)² / (w − φ(z₀))²
//
// The image is a rational function of w whose pole sits at φ(z₀) ∈ Ω — OUTSIDE K — so the image is
// genuinely analytic on K, and this closed form is EXACT (=), analytically continuing the truncated
// Faber series out to that image pole (plan §1, §3). Convention-neutral (ADR-0006).
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import type { ExteriorMap } from "./types.js";

/**
 * The derivative jet [φ(z), φ'(z), …, φ^(nDerivs)(z)] of the exterior map φ(z) = c·z + Σ_{k≥0} c_k z^{−k}
 * at a point z with |z| > 1. The k-th Laurent term contributes to the j-th derivative
 * c_k·(−1)^j·k(k+1)…(k+j−1)·z^{−(k+j)}; the leading c·z contributes c to φ and 0 above.
 */
export function exteriorMapJet(map: ExteriorMap, z: Cx, nDerivs: number): Cx[] {
  const out: Cx[] = [];
  for (let j = 0; j <= nDerivs; j++) out.push({ re: 0, im: 0 });
  out[0] = { re: map.c * z.re, im: map.c * z.im }; // c·z
  if (nDerivs >= 1) out[1] = { re: out[1].re + map.c, im: out[1].im };
  const zinv = Complex.inv(z);
  const lc = map.laurent;
  for (let k = 0; k < lc.length; k++) {
    const ck = lc[k];
    if (ck.re === 0 && ck.im === 0) continue;
    if (k === 0) {
      out[0] = Complex.add(out[0], ck); // constant term c₀ contributes only to φ itself
      continue;
    }
    for (let j = 0; j <= nDerivs; j++) {
      let coef = 1;
      for (let i = 0; i < j; i++) coef *= k + i; // rising factorial k(k+1)…(k+j−1)
      const sign = j % 2 === 0 ? 1 : -1;
      const zpow = Complex.pow(zinv, k + j); // z^{−(k+j)}
      out[j] = Complex.add(out[j], Complex.scale(Complex.mul(ck, zpow), sign * coef));
    }
  }
  return out;
}

/** The exact Faber image of a pole 1/(z−z₀)^order as a partial fraction Σ_{j=1}^{order} terms[j−1]/(w−poleAt)^j. */
export interface RationalImage {
  /** The image pole φ(z₀) ∈ Ω (outside K). */
  readonly poleAt: Cx;
  /** Numerators: `terms[j−1]` multiplies 1/(w−poleAt)^j. */
  readonly terms: Cx[];
}

/**
 * The exact exterior Faber transform of f(z) = 1/(z−z₀)^order, for a pole z₀ with |z₀| > 1. Supports
 * order 1 and 2 (the common cases); higher orders throw (their Faà-di-Bruno expansion is deferred).
 */
export function faberImageOfPole(map: ExteriorMap, z0: Cx, order = 1): RationalImage {
  if (order !== 1 && order !== 2) {
    throw new Error("faberImageOfPole: only order 1 and 2 are supported");
  }
  const jet = exteriorMapJet(map, z0, order); // [φ, φ', (φ'')]
  const poleAt = jet[0];
  if (order === 1) return { poleAt, terms: [jet[1]] };
  return { poleAt, terms: [jet[2], Complex.mul(jet[1], jet[1])] };
}

/** Evaluate a {@link RationalImage} at a world point w: Σ_{j≥1} terms[j−1]/(w−poleAt)^j. */
export function evalRationalImage(img: RationalImage, w: Cx): Cx {
  const d = Complex.sub(w, img.poleAt);
  let acc: Cx = { re: 0, im: 0 };
  let dpow: Cx = d; // (w−poleAt)^1
  for (let j = 0; j < img.terms.length; j++) {
    acc = Complex.add(acc, Complex.div(img.terms[j], dpow));
    dpow = Complex.mul(dpow, d);
  }
  return acc;
}
