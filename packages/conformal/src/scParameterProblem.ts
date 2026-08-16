// scParameterProblem.ts — the Schwarz–Christoffel parameter problem (roadmap step E, Phase 2):
// solve for the prevertices of an arbitrary bounded simple polygon so the forward SC map reproduces
// it. Angles are automatic in the SC map, so only side-length RATIOS must be matched: with C = 1 the
// side vectors Sₖ = ∫_{wₖ}^{w_{k+1}} ∏(1−t/wⱼ)^{αⱼ−1} dt already have the right directions and close
// automatically (∮ f′ = 0), leaving n−3 real conditions. The prevertices are parametrized by their
// angular gaps through a softmax (ordering by construction — Trefethen 1980's constraint elimination),
// with 3 gap-logits FROZEN at the seed to fix the 3-dim disk-automorphism gauge. The n−1 side-ratio
// residuals are driven to zero by damped Gauss–Newton — each step a finite-difference Jacobian and one
// @cas/core `lstsqHouseholder` least-squares solve. The seed defaults to a uniform cold start (robust on
// its own); an explicit prevertex guess may be passed (Phase 3 forwards a warm-start / prior fast solve
// here). Pure; node-tested against closed-form polygons (a regular n-gon from a skewed seed; a reentrant
// L-shape).
import { lstsqHouseholder } from "@cas/core";
import type { C } from "./vandermondeArnoldi.js";
import { sideIntegrals, type SCQuadratureOptions } from "./schwarzChristoffel.js";

const TWO_PI = 2 * Math.PI;

/** Interior angles / π (αₖ) at each vertex of a counter-clockwise simple polygon. */
export function interiorAngles(vertices: readonly C[]): number[] {
  const n = vertices.length;
  return Array.from({ length: n }, (_, k) => {
    const p = vertices[(k - 1 + n) % n];
    const c = vertices[k];
    const q = vertices[(k + 1) % n];
    const ux = c[0] - p[0];
    const uy = c[1] - p[1];
    const vx = q[0] - c[0];
    const vy = q[1] - c[1];
    const turn = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); // exterior turn ∈ (−π, π]
    return 1 - turn / Math.PI; // αₖ = interior/π = 1 − turn/π
  });
}

export interface SCSolveResult {
  /** The solved prevertices on ∂𝔻. */
  readonly prevertices: C[];
  /** Interior angles / π (αₖ), computed from the polygon. */
  readonly angles: number[];
  /** Whether ‖F‖∞ reached the tolerance. */
  readonly converged: boolean;
  /** Crowding wall: a prevertex gap fell below resolution, so accuracy is honestly reduced (≈). */
  readonly degraded: boolean;
  /** Gauss–Newton iterations taken. */
  readonly iterations: number;
  /** Final ‖F‖∞ — the max side-length-ratio error. */
  readonly residual: number;
}

export interface SCSolveOptions extends SCQuadratureOptions {
  /** Initial prevertex guess (else a uniform cold start); Phase 3 forwards a warm-start / prior fast solve here. */
  seedPrevertices?: readonly C[];
  /** Stop tolerance on ‖F‖∞ (default 1e-11). */
  tol?: number;
  /** Gauss–Newton iteration cap (default 60). */
  maxIter?: number;
}

/** Prevertices from softmax gap-logits: θ₀ = 0, gaps ∝ exp(tₖ) summing to 2π. */
function prevertsFromLogits(t: readonly number[]): C[] {
  const n = t.length;
  const mx = Math.max(...t);
  const ex = t.map((v) => Math.exp(v - mx));
  const sum = ex.reduce((a, b) => a + b, 0);
  const pv: C[] = new Array<C>(n);
  let theta = 0;
  for (let k = 0; k < n; k++) {
    pv[k] = [Math.cos(theta), Math.sin(theta)];
    theta += (TWO_PI * ex[k]) / sum;
  }
  return pv;
}

/** Gap-logits tₖ = log(θ_{k+1} − θₖ) of a prevertex set (the inverse of prevertsFromLogits up to shift). */
function logitsFromPrevertices(pv: readonly C[]): number[] {
  const n = pv.length;
  const th = pv.map((w) => Math.atan2(w[1], w[0]));
  return Array.from({ length: n }, (_, k) => {
    let gap = th[(k + 1) % n] - th[k];
    while (gap <= 0) gap += TWO_PI;
    return Math.log(gap);
  });
}

const uniformPrevertices = (n: number): C[] =>
  Array.from({ length: n }, (_, k): C => [Math.cos((TWO_PI * k) / n), Math.sin((TWO_PI * k) / n)]);

/** Three spread-out gap-logit indices to freeze (fixes the disk-automorphism gauge). */
function chooseFrozen(n: number): number[] {
  const set = Array.from(new Set([0, Math.round(n / 3), Math.round((2 * n) / 3)].map((i) => Math.min(i, n - 1))));
  return set.length === 3 ? set : [0, 1, 2];
}

function minGap(pv: readonly C[]): number {
  const n = pv.length;
  const th = pv.map((w) => Math.atan2(w[1], w[0]));
  let m = Infinity;
  for (let k = 0; k < n; k++) {
    let g = th[(k + 1) % n] - th[k];
    while (g <= 0) g += TWO_PI;
    m = Math.min(m, g);
  }
  return m;
}

/**
 * Solve the SC parameter problem for a bounded simple polygon (vertices counter-clockwise). Returns the
 * prevertices on ∂𝔻 and honest diagnostics. Feed the result to `buildForwardMap` with the same polygon
 * as `targetVertices` to obtain the fully-normalized map.
 */
export function solveParameterProblem(vertices: readonly C[], opts?: SCSolveOptions): SCSolveResult {
  const n = vertices.length;
  if (n < 3) throw new Error(`solveParameterProblem: need ≥ 3 vertices, got ${n}`);
  const angles = interiorAngles(vertices);
  const L = Array.from({ length: n }, (_, k) =>
    Math.hypot(vertices[(k + 1) % n][0] - vertices[k][0], vertices[(k + 1) % n][1] - vertices[k][1]),
  );
  const q: SCQuadratureOptions = { nGaussJacobi: opts?.nGaussJacobi ?? 24, nGaussLegendre: opts?.nGaussLegendre ?? 24 };
  const tol = opts?.tol ?? 1e-11;
  const maxIter = opts?.maxIter ?? 60;

  const tSeed = logitsFromPrevertices(opts?.seedPrevertices ?? uniformPrevertices(n));

  // Residual F: the n−1 side-length ratios relative to side 0, minus the polygon's target ratios.
  const residual = (t: readonly number[]): number[] => {
    const S = sideIntegrals(prevertsFromLogits(t), angles, q);
    const s0 = Math.hypot(S[0][0], S[0][1]);
    const F: number[] = [];
    for (let k = 1; k < n; k++) F.push(Math.hypot(S[k][0], S[k][1]) / s0 - L[k] / L[0]);
    return F;
  };
  const norm = (F: readonly number[]) => F.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  if (n === 3) {
    // No free parameters: a triangle is fixed by its angles (AAA), so any prevertices reproduce it.
    const res = norm(residual(tSeed));
    return { prevertices: prevertsFromLogits(tSeed), angles, converged: res < tol, degraded: false, iterations: 0, residual: res };
  }

  const frozen = chooseFrozen(n);
  const free: number[] = [];
  for (let i = 0; i < n; i++) if (!frozen.includes(i)) free.push(i);
  const nFree = free.length;
  const logits = (y: readonly number[]): number[] => {
    const t = tSeed.slice();
    free.forEach((i, j) => (t[i] = y[j]));
    return t;
  };

  let y = free.map((i) => tSeed[i]);
  let F = residual(logits(y));
  const h = 1e-6;
  let iter = 0;
  for (; iter < maxIter && norm(F) >= tol; iter++) {
    const m = F.length;
    const J: number[][] = Array.from({ length: m }, () => new Array<number>(nFree).fill(0));
    for (let j = 0; j < nFree; j++) {
      const yj = y.slice();
      yj[j] += h;
      const Fj = residual(logits(yj));
      for (let i = 0; i < m; i++) J[i][j] = (Fj[i] - F[i]) / h;
    }
    const delta = lstsqHouseholder(J, F.map((v) => -v));
    let lam = 1;
    let yTry = y.map((v, j) => v + lam * delta[j]);
    let FTry = residual(logits(yTry));
    while (norm(FTry) >= norm(F) && lam > 1e-4) {
      lam /= 2;
      yTry = y.map((v, j) => v + lam * delta[j]);
      FTry = residual(logits(yTry));
    }
    if (norm(FTry) >= norm(F)) break; // stalled — no further descent
    y = yTry;
    F = FTry;
  }

  const prevertices = prevertsFromLogits(logits(y));
  const finalRes = norm(F);
  return {
    prevertices,
    angles,
    converged: finalRes < tol,
    degraded: minGap(prevertices) < 1e-6,
    iterations: iter,
    residual: finalRes,
  };
}
