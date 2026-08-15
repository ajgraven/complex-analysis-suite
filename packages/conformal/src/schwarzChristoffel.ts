// schwarzChristoffel.ts — the forward Schwarz–Christoffel map f: 𝔻 → polygon (roadmap step E,
// Phase 1), evaluated for a GIVEN set of prevertices. This is the whole forward machine minus the
// nonlinear parameter solve (Phase 2): the SC integrand, its side integrals via compound
// Gauss–Jacobi quadrature (scQuadrature.ts), recovery of the accessory constants A and C, and the
// forward evaluator.
//
//     f(w) = A + C · ∫₀ʷ ∏ₖ (1 − t/wₖ)^{αₖ−1} dt ,     f'(w) = C · ∏ₖ (1 − t/wₖ)^{αₖ−1}
//
// with prevertices wₖ ∈ ∂𝔻 and interior angles αₖ·π. Branch note: for |t| ≤ 1 each factor
// (1 − t/wₖ) lies in the closed right half-plane (it reaches 0 only AT the prevertex), so the
// principal branch of every factor is globally continuous on 𝔻 — the disk needs none of the
// half-plane's branch bookkeeping. The one place a singular factor is peeled for the Gauss–Jacobi
// panel, the remainder is taken as full(t)/(t−wₖ)^{αₖ−1}; along a straight sub-segment from wₖ the
// argument of (t−wₖ) is constant, so the constant branch factor cancels the panel's (Δ/2)^{αₖ}
// mapping factor exactly and integrateSegment returns the true value. Pure; node-tested against
// closed-form regular-n-gon and square maps.
import type { C } from "./vandermondeArnoldi.js";
import { integrateSegment } from "./scQuadrature.js";

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

export interface SCForwardMap {
  /** Prevertices on ∂𝔻, counter-clockwise. */
  readonly prevertices: readonly C[];
  /** Interior angles / π (αₖ). */
  readonly angles: readonly number[];
  /** The multiplicative accessory constant C (scale + rotation); f′(0) = C. */
  readonly constant: C;
  /** The additive accessory constant A = f(0), the conformal centre. */
  readonly center: C;
  /** The polygon vertices f(wₖ), accumulated from the side integrals. */
  readonly vertices: readonly C[];
  /** f: 𝔻 → polygon at one point. */
  forward(w: C): C;
  /** f at many points. */
  forwardMany(ws: readonly C[]): C[];
}

export interface SCForwardOptions {
  /** Recover C and A so f(wₖ) matches these vertex images (needs ≥ 2, ordered like the prevertices). */
  targetVertices?: readonly C[];
  /** Otherwise use this C (default [1, 0]). */
  constant?: C;
  /** …and this A (default [0, 0]). */
  center?: C;
  nGaussJacobi?: number;
  nGaussLegendre?: number;
}

/**
 * Build the forward SC map from a GIVEN prevertex set and angles. Normalization: pass `targetVertices`
 * to recover A, C from the polygon (C = (z₁−z₀)/S₀, A = z₀ − C·∫₀^{w₀}); otherwise C, A default to
 * 1, 0 (⇒ f′(0)=1, f(0)=0), which places a canonical similar copy of the polygon.
 */
export function buildForwardMap(
  prevertices: readonly C[],
  angles: readonly number[],
  opts?: SCForwardOptions,
): SCForwardMap {
  const n = prevertices.length;
  if (angles.length !== n) throw new Error(`buildForwardMap: ${n} prevertices but ${angles.length} angles`);
  const qopts = { nGaussJacobi: opts?.nGaussJacobi ?? 24, nGaussLegendre: opts?.nGaussLegendre ?? 24 };

  // f′/C : the SC integrand ∏ⱼ (1 − t/wⱼ)^{αⱼ−1}, principal branch per factor.
  const full = (t: C): C => {
    let acc: C = [1, 0];
    for (let j = 0; j < n; j++) acc = cmul(acc, cpow(csub([1, 0], cdiv(t, prevertices[j])), angles[j] - 1));
    return acc;
  };

  // ∫_{wₖ}^{to} full dt with the singular endpoint at prevertex k absorbed by the Gauss–Jacobi panel.
  const integrateFromPrevertex = (k: number, to: C): C => {
    const wk = prevertices[k];
    const ek = angles[k] - 1;
    const regular = (t: C): C => cdiv(full(t), cpow(csub(t, wk), ek));
    const foreign = prevertices.filter((_, j) => j !== k);
    return integrateSegment({ full, nearEndpoint: { exponent: ek, regular } }, wk, to, foreign, qopts);
  };

  // Side integral Sₖ = ∫_{wₖ}^{w_{k+1}} full dt = ∫_{wₖ}^{mid} − ∫_{w_{k+1}}^{mid} (each half single-singular).
  const sideIntegral = (k: number): C => {
    const kp = (k + 1) % n;
    const mid: C = [(prevertices[k][0] + prevertices[kp][0]) / 2, (prevertices[k][1] + prevertices[kp][1]) / 2];
    return csub(integrateFromPrevertex(k, mid), integrateFromPrevertex(kp, mid));
  };

  // I(wₖ) = ∫₀^{wₖ} full dt = − ∫_{wₖ}^0 full dt.
  const integralToPrevertex = (k: number): C => {
    const neg = integrateFromPrevertex(k, [0, 0]);
    return [-neg[0], -neg[1]];
  };

  const sides = Array.from({ length: n }, (_, k) => sideIntegral(k));
  const I0 = integralToPrevertex(0);

  let constant: C;
  let center: C;
  const tv = opts?.targetVertices;
  if (tv && tv.length >= 2) {
    constant = cdiv(csub(tv[1], tv[0]), sides[0]);
    center = csub(tv[0], cmul(constant, I0));
  } else {
    constant = opts?.constant ?? [1, 0];
    center = opts?.center ?? [0, 0];
  }

  const vertices: C[] = new Array<C>(n);
  vertices[0] = cadd(center, cmul(constant, I0));
  for (let k = 0; k < n - 1; k++) vertices[k + 1] = cadd(vertices[k], cmul(constant, sides[k]));

  const integralTo = (w: C): C => {
    for (let k = 0; k < n; k++) {
      if (Math.hypot(w[0] - prevertices[k][0], w[1] - prevertices[k][1]) < 1e-12) return integralToPrevertex(k);
    }
    return integrateSegment({ full }, [0, 0], w, prevertices, qopts);
  };
  const forward = (w: C): C => cadd(center, cmul(constant, integralTo(w)));

  return { prevertices, angles, constant, center, vertices, forward, forwardMany: (ws) => ws.map(forward) };
}
