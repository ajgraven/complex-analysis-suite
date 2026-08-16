// Faber polynomials F_n(ζ) of the bounded complement K = ℂ∖Ω, read off the exterior map's Laurent
// expansion φ(z) = c·z + c₀ + c₁/z + … via the three-term-with-history recurrence
//
//     F₀ = 1,   F₁ = (ζ − c₀)/c,
//     c·F_{n+1} = (ζ − c₀)·F_n − Σ_{k=1}^{n} c_k·F_{n−k} − n·c_n
//
// (from ψ'(z)/(ψ(z)−ζ) = Σ F_n(ζ) z^{−n−1}; verified against the disk c_k=0 ⇒ F_n=ζ^n and the
// Joukowski/interval c₁=1 ⇒ F_n=2·T_n(ζ/2), Chebyshev). Ported from the Quadrature Domains app's
// faber-analysis.mjs; the only change is the input contract — a plain {c, laurent} instead of a QD
// φ struct + phiLaurentAtInfinity. Convention-neutral (ADR-0006).
import { makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import type { ExteriorMap, FaberPolynomials } from "./types.js";

// QD.Poly's exact historical surface, over the shared {re,im} algebra (objAlgebra).
const P = makePoly(objAlgebra);

/** Build the Faber polynomials F₀…F_N of K from the exterior map's Laurent coefficients. */
export function faberPolynomials(map: ExteriorMap, N: number): FaberPolynomials {
  const c = map.c;
  if (!(typeof c === "number" && c > 0 && Number.isFinite(c))) {
    throw new Error("faberPolynomials: capacity c = φ'(∞) must be a positive finite number");
  }
  N = Math.max(0, Math.floor(N || 0));

  const lc = map.laurent ?? [];
  const at = (k: number): Cx => (k < lc.length && lc[k] ? lc[k] : { re: 0, im: 0 });
  const c0 = at(0);
  const invC: Cx = { re: 1 / c, im: 0 };

  // ζ − c₀  as ascending [ −c₀ , 1 ].
  const zMinusC0: Cx[] = [
    { re: -c0.re, im: -c0.im },
    { re: 1, im: 0 },
  ];

  const coeffs: Cx[][] = [];
  coeffs[0] = [{ re: 1, im: 0 }]; // F₀ = 1
  if (N >= 1) {
    coeffs[1] = P.scale(zMinusC0.slice(), invC); // F₁ = (ζ − c₀)/c
  }
  for (let n = 1; n < N; n++) {
    // c·F_{n+1} = (ζ − c₀)·F_n − Σ_{k=1}^{n} c_k·F_{n−k} − n·c_n
    const term1 = P.mul(zMinusC0, coeffs[n]);
    let sum = P.zero();
    for (let k = 1; k <= n; k++) {
      sum = P.add(sum, P.scale(coeffs[n - k], at(k)));
    }
    const next = P.add(term1, P.neg(sum));
    const cn = at(n);
    next[0] = { re: next[0].re - n * cn.re, im: next[0].im - n * cn.im };
    coeffs[n + 1] = P.scale(next, invC);
  }
  return { c, c0, coeffs };
}

/** A single Faber polynomial F_n as an ascending-power `Cx[]`. */
export function faberPolynomial(map: ExteriorMap, n: number): Cx[] {
  return faberPolynomials(map, n).coeffs[n];
}
