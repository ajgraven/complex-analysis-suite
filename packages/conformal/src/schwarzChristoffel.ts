// schwarzChristoffel.ts — the forward Schwarz–Christoffel map f: 𝔻 → polygon (roadmap step E),
// plus the side-integral primitive the parameter problem (Phase 2) is built on. For a GIVEN set of
// prevertices this is the whole forward machine:
//
//     f(w) = A + C · ∫₀ʷ ∏ₖ (1 − t/wₖ)^{αₖ−1} dt ,     f'(w) = C · ∏ₖ (1 − t/wₖ)^{αₖ−1}
//
// with prevertices wₖ ∈ ∂𝔻 and interior angles αₖ·π. Branch note: for |t| ≤ 1 each factor
// (1 − t/wₖ) lies in the closed right half-plane (it reaches 0 only AT the prevertex), so the
// principal branch of every factor is globally continuous on 𝔻 — the disk needs none of the
// half-plane's branch bookkeeping. Where a singular factor is peeled for the Gauss–Jacobi panel the
// remainder is full(t)/(t−wₖ)^{αₖ−1}; along a straight sub-segment from wₖ the argument of (t−wₖ) is
// constant, so the constant branch factor cancels the panel's (Δ/2)^{αₖ} mapping factor exactly and
// integrateSegment returns the true value. Pure; node-tested against closed-form n-gon and square maps.
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

const clampDisk = (w: C): C => {
  const r = Math.hypot(w[0], w[1]);
  return r >= 1 ? [(w[0] / r) * (1 - 1e-12), (w[1] / r) * (1 - 1e-12)] : w;
};

/** The result of an inverse solve, with an honest convergence signal (guardrail: a silent wrong preimage
 *  — from a `z` outside Ω, or a Newton stall near a corner — must be detectable, not read as exact). */
export interface SCInverseResult {
  /** The preimage w ∈ 𝔻 (the best iterate reached, even when `converged` is false). */
  readonly w: C;
  /** True iff the final forward residual |f(w) − z| fell below tolerance (1e-9). */
  readonly converged: boolean;
  /** The final forward residual |f(w) − z| — the honest ≈ error of the returned preimage. */
  readonly residual: number;
}

/** Convergence tolerance for the inverse's forward residual — comfortably above the 1e-13 Newton target,
 *  far below the coarse-fit regime, so a genuine stall (z ∉ Ω / corner) reads as `converged: false`. */
const INVERSE_TOL = 1e-9;

/**
 * f⁻¹ by the Driscoll–Trefethen ODE + Newton hybrid (2002, §3.3): pull the straight segment from the
 * conformal centre f(0) = A to `z` back through dw/dτ = (z − A)/f′(w) with RK4 (a global initial guess),
 * then Newton-refine w ← w − (f(w) − z)/f′(w) to machine precision. `z` must lie inside the polygon (the
 * segment A → z is assumed to as well — true for polygons star-shaped from their conformal centre). Returns
 * an honest `converged`/`residual` signal: a `z` outside Ω or a Newton stall leaves the residual above tol.
 */
function invertMap(z: C, center: C, forward: (w: C) => C, derivative: (w: C) => C): SCInverseResult {
  const dz = csub(z, center);
  const rhs = (w: C): C => cdiv(dz, derivative(w)); // dw/dτ (f′ is the cheap product form)
  let w: C = [0, 0]; // f(0) = A
  const N = 40;
  const dt = 1 / N;
  for (let i = 0; i < N; i++) {
    const k1 = rhs(w);
    const k2 = rhs([w[0] + (dt / 2) * k1[0], w[1] + (dt / 2) * k1[1]]);
    const k3 = rhs([w[0] + (dt / 2) * k2[0], w[1] + (dt / 2) * k2[1]]);
    const k4 = rhs([w[0] + dt * k3[0], w[1] + dt * k3[1]]);
    w = clampDisk([
      w[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      w[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    ]);
  }
  for (let it = 0; it < 20; it++) {
    const diff = csub(forward(w), z);
    if (Math.hypot(diff[0], diff[1]) < 1e-13) break;
    w = clampDisk(csub(w, cdiv(diff, derivative(w))));
  }
  // Measure the residual on the FINAL iterate (the loop's check is pre-step, so the last step is unmeasured
  // when it runs to the cap): this is the single honest error signal for both the early-break and stall cases.
  const finalDiff = csub(forward(w), z);
  const residual = Math.hypot(finalDiff[0], finalDiff[1]);
  return { w, converged: residual < INVERSE_TOL, residual };
}

export interface SCQuadratureOptions {
  /** Gauss–Jacobi node count for the singular-endpoint panels (default 24). */
  nGaussJacobi?: number;
  /** Gauss–Legendre node count for regular panels (default 24). */
  nGaussLegendre?: number;
}
const resolveQ = (o?: SCQuadratureOptions) => ({ nGaussJacobi: o?.nGaussJacobi ?? 24, nGaussLegendre: o?.nGaussLegendre ?? 24 });

interface Integrator {
  /** The SC integrand ∏ⱼ(1 − t/wⱼ)^{αⱼ−1} = f′/C. */
  full: (t: C) => C;
  sides: () => C[];
  integralToPrevertex: (k: number) => C;
  integralTo: (w: C) => C;
}

function makeIntegrator(prevertices: readonly C[], angles: readonly number[], q: Required<SCQuadratureOptions>): Integrator {
  const n = prevertices.length;
  // f′/C : the SC integrand ∏ⱼ (1 − t/wⱼ)^{αⱼ−1}, principal branch per factor.
  const full = (t: C): C => {
    let acc: C = [1, 0];
    for (let j = 0; j < n; j++) acc = cmul(acc, cpow(csub([1, 0], cdiv(t, prevertices[j])), angles[j] - 1));
    return acc;
  };
  // ∫_{wₖ}^{to} full dt with the singular endpoint at prevertex k absorbed by the Gauss–Jacobi panel.
  const fromPrevertex = (k: number, to: C): C => {
    const wk = prevertices[k];
    const ek = angles[k] - 1;
    const regular = (t: C): C => cdiv(full(t), cpow(csub(t, wk), ek));
    const foreign = prevertices.filter((_, j) => j !== k);
    return integrateSegment({ full, nearEndpoint: { exponent: ek, regular } }, wk, to, foreign, q);
  };
  // Side integral Sₖ = ∫_{wₖ}^{w_{k+1}} full dt = ∫_{wₖ}^{mid} − ∫_{w_{k+1}}^{mid} (each half single-singular).
  const sides = (): C[] =>
    Array.from({ length: n }, (_, k) => {
      const kp = (k + 1) % n;
      const mid: C = [(prevertices[k][0] + prevertices[kp][0]) / 2, (prevertices[k][1] + prevertices[kp][1]) / 2];
      return csub(fromPrevertex(k, mid), fromPrevertex(kp, mid));
    });
  const integralToPrevertex = (k: number): C => {
    const neg = fromPrevertex(k, [0, 0]); // ∫_{wₖ}^0
    return [-neg[0], -neg[1]];
  };
  const integralTo = (w: C): C => {
    for (let k = 0; k < n; k++) {
      if (Math.hypot(w[0] - prevertices[k][0], w[1] - prevertices[k][1]) < 1e-12) return integralToPrevertex(k);
    }
    return integrateSegment({ full }, [0, 0], w, prevertices, q);
  };
  return { full, sides, integralToPrevertex, integralTo };
}

/** The side integrals Sₖ = ∫_{wₖ}^{w_{k+1}} ∏ⱼ(1−t/wⱼ)^{αⱼ−1} dt (integrand /C), one per polygon side. */
export function sideIntegrals(prevertices: readonly C[], angles: readonly number[], opts?: SCQuadratureOptions): C[] {
  return makeIntegrator(prevertices, angles, resolveQ(opts)).sides();
}

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
  /** f′(w) = C·∏ₖ(1 − w/wₖ)^{αₖ−1} (the cheap product form; no quadrature). */
  derivative(w: C): C;
  /** f⁻¹: polygon → 𝔻 by the ODE + Newton hybrid. `z` must lie inside the polygon. */
  inverse(z: C): C;
  /** f⁻¹ with the honest convergence signal (a `z` outside Ω / a Newton stall reads as `converged: false`). */
  inverseWithStatus(z: C): SCInverseResult;
}

export interface SCForwardOptions extends SCQuadratureOptions {
  /** Recover C and A so f(wₖ) matches these vertex images (needs ≥ 2, ordered like the prevertices). */
  targetVertices?: readonly C[];
  /** Otherwise use this C (default [1, 0]). */
  constant?: C;
  /** …and this A (default [0, 0]). */
  center?: C;
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
  const integ = makeIntegrator(prevertices, angles, resolveQ(opts));
  const sides = integ.sides();
  const I0 = integ.integralToPrevertex(0);

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

  const forward = (w: C): C => cadd(center, cmul(constant, integ.integralTo(w)));
  const derivative = (w: C): C => cmul(constant, integ.full(w));
  const inverseWithStatus = (z: C): SCInverseResult => invertMap(z, center, forward, derivative);
  const inverse = (z: C): C => inverseWithStatus(z).w;
  return { prevertices, angles, constant, center, vertices, forward, forwardMany: (ws) => ws.map(forward), derivative, inverse, inverseWithStatus };
}
