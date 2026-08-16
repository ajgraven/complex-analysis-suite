// exteriorSchwarzChristoffel.ts — the EXTERIOR Schwarz–Christoffel map φ: 𝔻* → Ω, where Ω = ℂ∖P is the
// unbounded exterior of a bounded simple polygon P (roadmap step E, exterior variant / Faber M1b). Via the
// reciprocal u = 1/z the exterior map Ψ(u) = φ(1/u): 𝔻 → Ω has a pole at u = 0 (Ψ(0) = φ(∞) = ∞), and the
// D&T (2002, §4.2) exterior form is a straight-chord SC integral in the u-disk:
//
//     Ψ'(u) = C · u^{-2} · ∏ₖ (1 − u/uₖ)^{1 − αₖ},     uₖ ∈ ∂𝔻,   interior angles αₖ·π,
//
// so the whole interior quadrature machine (integrateSegment) applies verbatim — only the integrand
// changes: the exterior exponent is 1 − αₖ (the exterior region's angle is (2 − αₖ)π, sign-flipped from the
// interior α − 1; validated in the M0 spike), plus the u^{-2} pole, which enters `full` and is listed as a
// foreign singularity so panels stay clear of it. φ(z) ~ C·z at ∞ ⇒ capacity(P) = |C|.
//
// This module is the forward side of M1b (given prevertices → polygon vertices, capacity, side integrals);
// the exterior PARAMETER problem (polygon → prevertices) builds on `exteriorSideIntegrals`, and the
// Laurent-at-∞ extractor for the Faber ExteriorMap contract expands Ψ about u = 0. Pure; node-tested
// against the closed-form regular n-gon (M0 goldens). Convention-neutral (ADR-0006).
import { makeSeries, tupleAlgebra } from "@cas/core";
import type { C } from "./vandermondeArnoldi.js";
import { integrateSegment, type QuadratureOptions } from "./scQuadrature.js";

const series = makeSeries(tupleAlgebra);

const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const cpow = (z: C, p: number): C => {
  const r = Math.hypot(z[0], z[1]);
  if (r === 0) return [0, 0];
  const m = Math.exp(Math.log(r) * p);
  const th = Math.atan2(z[1], z[0]) * p;
  return [m * Math.cos(th), m * Math.sin(th)];
};

const ORIGIN: C = [0, 0];
const ONE: C = [1, 0];

// Default the quadrature to 24 nodes (matching the exterior parameter solve and the interior engine), so a
// no-options call doesn't silently fall through to integrateSegment's coarser 16-node default — otherwise
// the returned vertices/capacity/Laurent would be less accurate than the solve's reported residual.
const resolveQ = (o?: QuadratureOptions): QuadratureOptions => ({ ...o, nGaussJacobi: o?.nGaussJacobi ?? 24, nGaussLegendre: o?.nGaussLegendre ?? 24 });

interface ExtIntegrator {
  /** Ψ'/C : the exterior SC integrand u^{-2} ∏ⱼ (1 − u/uⱼ)^{1−αⱼ}, principal branch per factor. */
  full: (u: C) => C;
  /** Side integrals Sₖ = ∫_{uₖ}^{u_{k+1}} full du (integrand /C), one per polygon side. */
  sides: () => C[];
}

function makeExtIntegrator(prevertices: readonly C[], angles: readonly number[], q: QuadratureOptions): ExtIntegrator {
  const n = prevertices.length;
  // Ψ'/C : the u^{-2} pole times the exterior SC product, exponents 1 − αⱼ.
  const full = (u: C): C => {
    let acc: C = cdiv(ONE, cmul(u, u)); // u^{-2}
    for (let j = 0; j < n; j++) acc = cmul(acc, cpow(csub(ONE, cdiv(u, prevertices[j])), 1 - angles[j]));
    return acc;
  };
  // ∫_{uₖ}^{to} full du with the singular endpoint at prevertex k absorbed by the Gauss–Jacobi panel; the
  // u^{-2} pole at 0 is a FOREIGN singularity (subdivide to stay clear), alongside the other prevertices.
  const fromPrevertex = (k: number, to: C): C => {
    const uk = prevertices[k];
    const ek = 1 - angles[k]; // exterior exponent
    const regular = (u: C): C => cdiv(full(u), cpow(csub(u, uk), ek));
    const foreign: C[] = [ORIGIN];
    for (let j = 0; j < n; j++) if (j !== k) foreign.push(prevertices[j]);
    return integrateSegment({ full, nearEndpoint: { exponent: ek, regular } }, uk, to, foreign, q);
  };
  // Sₖ = ∫_{uₖ}^{mid} − ∫_{u_{k+1}}^{mid}, each half single-singular (mirrors the interior side split).
  const sides = (): C[] =>
    Array.from({ length: n }, (_, k) => {
      const kp = (k + 1) % n;
      const mid: C = [(prevertices[k][0] + prevertices[kp][0]) / 2, (prevertices[k][1] + prevertices[kp][1]) / 2];
      return csub(fromPrevertex(k, mid), fromPrevertex(kp, mid));
    });
  return { full, sides };
}

/** The exterior side integrals Sₖ = ∫_{uₖ}^{u_{k+1}} u^{-2}∏ⱼ(1−u/uⱼ)^{1−αⱼ} du (integrand /C), one per side. */
export function exteriorSideIntegrals(prevertices: readonly C[], angles: readonly number[], opts?: QuadratureOptions): C[] {
  return makeExtIntegrator(prevertices, angles, resolveQ(opts)).sides();
}

export interface ExteriorSCForwardMap {
  /** Prevertices uₖ ∈ ∂𝔻 (the u = 1/z reciprocal disk). */
  readonly prevertices: readonly C[];
  /** Interior angles / π (αₖ) of the polygon. */
  readonly angles: readonly number[];
  /** The accessory constant C (φ(z) ~ C·z at ∞). */
  readonly constant: C;
  /** Logarithmic capacity of the polygon, cap(P) = |C|. */
  readonly capacity: number;
  /** The polygon vertices φ(zₖ) = Ψ(uₖ), accumulated from the side integrals. */
  readonly vertices: readonly C[];
  /** The side integrals Sₖ (integrand /C). */
  readonly sides: readonly C[];
}

export interface ExteriorSCForwardOptions extends QuadratureOptions {
  /** Recover C so φ(z₀)…φ(z₁) match these two vertices (ordered like the prevertices); else use `constant`. */
  targetVertices?: readonly C[];
  /** Otherwise use this C (default [1, 0], giving capacity 1). */
  constant?: C;
  /** The base vertex φ(z₀); the polygon is accumulated from here (default: derived from targetVertices, else 0). */
  baseVertex?: C;
}

/**
 * Build the exterior forward map from a GIVEN prevertex set and angles. With `targetVertices` (≥ 2) the
 * accessory constant is recovered as C = (v₁ − v₀)/S₀ and the polygon is anchored at v₀; otherwise C
 * defaults to [1, 0] (capacity 1) and the polygon is a canonical similar copy. Returns the vertices
 * φ(zₖ) = Ψ(uₖ) accumulated from the side integrals, the capacity |C|, and the raw side integrals.
 */
export function buildExteriorForwardMap(
  prevertices: readonly C[],
  angles: readonly number[],
  opts?: ExteriorSCForwardOptions,
): ExteriorSCForwardMap {
  const n = prevertices.length;
  if (angles.length !== n) throw new Error(`buildExteriorForwardMap: ${n} prevertices but ${angles.length} angles`);
  const sides = makeExtIntegrator(prevertices, angles, resolveQ(opts)).sides();

  let constant: C;
  let base: C;
  const tv = opts?.targetVertices;
  if (tv && tv.length >= 2) {
    constant = cdiv(csub(tv[1], tv[0]), sides[0]);
    base = tv[0];
  } else {
    constant = opts?.constant ?? [1, 0];
    base = opts?.baseVertex ?? ORIGIN;
  }

  const vertices: C[] = new Array<C>(n);
  vertices[0] = base;
  for (let k = 0; k < n - 1; k++) vertices[k + 1] = cadd(vertices[k], cmul(constant, sides[k]));
  return { prevertices, angles, constant, capacity: Math.hypot(constant[0], constant[1]), vertices, sides };
}

/** The Laurent-at-∞ expansion of an exterior SC map: c = capacity, laurent[k] = c_k in φ(z) = c·z + Σ c_k z^{−k}. */
export interface ExteriorMapLaurent {
  /** Capacity c = |C| (leading coefficient), real ≥ 0 after rotating the domain so c is real-positive. */
  readonly c: number;
  /** Laurent tail c₀, c₁, …, c_order. c₀ = 0: the domain is centred at its conformal centre (a translation). */
  readonly laurent: C[];
}

/**
 * Extract the Laurent expansion of φ at ∞ — φ(z) = c·z + Σ_{k≥0} c_k z^{−k} — from a fitted exterior SC map,
 * truncated to `order` (laurent indices 0…order). Via u = 1/z, Ψ(u) = φ(1/u) has Ψ'(u) = C·u^{−2}·G(u) with
 * G(u) = ∏ₖ (1 − u/uₖ)^{1−αₖ} = Σ gₘ uᵐ (each factor a generalized-binomial series, multiplied with @cas/core's
 * truncated series product). Integrating term-by-term gives leading |C| and c_k = −|C|·g_{k+1}/k; the u^{−1}→log
 * term drops because g₁ = the (enforced) closure residual Σ(1−αₖ)/uₖ ≈ 0. Coefficients are rotated so c is real
 * (the domain rotates freely); c₀ is set to 0 (centre at the conformal centre — irrelevant to the Faber structure).
 */
export function exteriorMapLaurentAtInfinity(map: ExteriorSCForwardMap, order: number): ExteriorMapLaurent {
  const { prevertices, angles, constant } = map;
  const n = prevertices.length;
  const M = Math.max(1, Math.floor(order));
  // G(u) = ∏ₖ (1 − u/uₖ)^{1−αₖ}, each factor a generalized-binomial series to order M+1.
  let G: C[] = series.unit(M + 1);
  for (let k = 0; k < n; k++) {
    const beta = 1 - angles[k];
    const negInv = cmul([-1, 0], cdiv(ONE, prevertices[k])); // −1/uₖ
    const factor: C[] = new Array<C>(M + 2);
    factor[0] = [1, 0];
    let binom = 1; // binom(beta, m)
    let pw: C = [1, 0]; // (−1/uₖ)^m
    for (let m = 1; m <= M + 1; m++) {
      binom = (binom * (beta - m + 1)) / m;
      pw = cmul(pw, negInv);
      factor[m] = [binom * pw[0], binom * pw[1]];
    }
    G = series.mul(G, factor, M + 1);
  }
  const cap = Math.hypot(constant[0], constant[1]); // |C| = |C_eff|
  const laurent: C[] = new Array<C>(M + 1);
  laurent[0] = [0, 0];
  for (let k = 1; k <= M; k++) {
    const g = G[k + 1] ?? [0, 0];
    laurent[k] = [(-cap * g[0]) / k, (-cap * g[1]) / k]; // c_k = −|C|·g_{k+1}/k
  }
  return { c: cap, laurent };
}
