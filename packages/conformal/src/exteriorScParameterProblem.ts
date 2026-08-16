// exteriorScParameterProblem.ts — the EXTERIOR Schwarz–Christoffel parameter problem (Faber M1b, step 2):
// solve for the prevertices uₖ ∈ ∂𝔻 of the reciprocal map Ψ(u) = φ(1/u): 𝔻 → Ω = ℂ∖P so the exterior
// forward map reproduces a bounded simple polygon P. Mirrors scParameterProblem.ts (softmax gap-logits,
// damped Gauss–Newton, one @cas/core lstsqHouseholder per step), with ONE structural change:
//
//   The exterior integrand Ψ'/C = u^{-2}∏(1−u/uⱼ)^{1−αⱼ} has a POLE at u=0, so ∮ Ψ' = 2πi·res₀ ≠ 0 in
//   general — the polygon no longer closes automatically. Closure ⇔ the residue vanishes:
//        Σₖ (1 − αₖ)/uₖ = 0        (the no-log-at-∞ condition, 2 real equations),
//   appended to the residual. The disk-exterior gauge is a single rotation (φ(∞)=∞ kills the interior
//   Möbius translations), already fixed by prevertsFromLogits placing u₀ at angle 0, so we freeze only
//   ONE gap-logit (the softmax shift null) — leaving n−1 free vs n+1 residuals, the same +2 least-squares
//   margin as the interior solver.
//
// Orientation: φ maps the CW-traversed unit circle to ∂P with Ω on the left ⇒ CW around P; via u=1/z the
// CCW-traversed u-circle corresponds to that same CW polygon traversal. So an input CCW polygon is
// reversed (keeping v₀) to the exterior CW order, with the interior angles permuted to match, before the
// solve. Pure; node-tested against the regular n-gon (skewed seed) and a chiral convex quadrilateral.
import type { C } from "./vandermondeArnoldi.js";
import { buildExteriorForwardMap, exteriorSideIntegrals, type ExteriorSCForwardMap } from "./exteriorSchwarzChristoffel.js";
import { dampedGaussNewton } from "./gaussNewton.js";
import { interiorAngles, logitsFromPrevertices, minGap, prevertsFromLogits, uniformPrevertices } from "./scParameterProblem.js";
import type { QuadratureOptions } from "./scQuadrature.js";

export interface ExtSCSolveResult {
  /** The solved prevertices uₖ ∈ ∂𝔻 (u = 1/z reciprocal disk), one per polygon vertex in exterior order. */
  readonly prevertices: C[];
  /** Interior angles / π (αₖ) in the exterior (CW) vertex order the prevertices correspond to. */
  readonly angles: number[];
  /** The polygon vertices in the exterior (CW) order the prevertices correspond to. */
  readonly orderedVertices: C[];
  /** Whether ‖F‖∞ reached the tolerance. */
  readonly converged: boolean;
  /** Crowding wall: a prevertex gap fell below resolution ⇒ accuracy honestly reduced (≈). */
  readonly degraded: boolean;
  /** Gauss–Newton iterations taken. */
  readonly iterations: number;
  /** Final ‖F‖∞ (max of the side-ratio and closure residuals). */
  readonly residual: number;
}

export interface ExtSCSolveOptions extends QuadratureOptions {
  /** Initial prevertex guess (else a uniform cold start). */
  seedPrevertices?: readonly C[];
  /** Stop tolerance on ‖F‖∞ (default 1e-10). */
  tol?: number;
  /** Gauss–Newton iteration cap (default 80). */
  maxIter?: number;
}

/** Reverse a CCW polygon to the exterior CW order (keeping v₀ first), permuting the interior angles to match. */
function toExteriorOrder(vertices: readonly C[]): { verts: C[]; angles: number[] } {
  const n = vertices.length;
  const anglesCCW = interiorAngles(vertices);
  const verts: C[] = new Array<C>(n);
  const angles: number[] = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    const src = (n - k) % n; // v₀, v_{n-1}, v_{n-2}, …, v₁
    verts[k] = vertices[src];
    angles[k] = anglesCCW[src];
  }
  return { verts, angles };
}

/**
 * Solve the exterior SC parameter problem for a bounded simple polygon (vertices counter-clockwise).
 * Returns the prevertices on ∂𝔻 (in the exterior CW order), the matching angles and ordered vertices, and
 * honest diagnostics. Feed prevertices + `angles` to `buildExteriorForwardMap` with `orderedVertices` as
 * `targetVertices` to obtain the fully-normalized exterior map.
 */
export function solveExteriorParameterProblem(vertices: readonly C[], opts?: ExtSCSolveOptions): ExtSCSolveResult {
  const n = vertices.length;
  if (n < 3) throw new Error(`solveExteriorParameterProblem: need ≥ 3 vertices, got ${n}`);
  const { verts, angles } = toExteriorOrder(vertices);
  const L = Array.from({ length: n }, (_, k) => Math.hypot(verts[(k + 1) % n][0] - verts[k][0], verts[(k + 1) % n][1] - verts[k][1]));
  const q: QuadratureOptions = { nGaussJacobi: opts?.nGaussJacobi ?? 24, nGaussLegendre: opts?.nGaussLegendre ?? 24 };
  const tol = opts?.tol ?? 1e-10;
  const maxIter = opts?.maxIter ?? 80;

  const tSeed = logitsFromPrevertices(opts?.seedPrevertices ?? uniformPrevertices(n));

  // Residual F: the n−1 side-length ratios (relative to side 0) minus the polygon's, then the 2 real
  // components of the closure/no-log residue Σₖ (1−αₖ)/uₖ (division by uₖ on the unit circle = conjugate).
  // Normalize the closure residual by Σ|1−αₖ| so it is dimensionless and O(1) like the side-length ratios,
  // making the single ‖F‖∞ tolerance mean the same thing for both residual families.
  const closureScale = angles.reduce((s, a) => s + Math.abs(1 - a), 0) || 1;
  const residual = (t: readonly number[]): number[] => {
    const pv = prevertsFromLogits(t);
    const S = exteriorSideIntegrals(pv, angles, q);
    const s0 = Math.hypot(S[0][0], S[0][1]);
    const F: number[] = [];
    for (let k = 1; k < n; k++) F.push(Math.hypot(S[k][0], S[k][1]) / s0 - L[k] / L[0]);
    let cr = 0;
    let ci = 0;
    for (let k = 0; k < n; k++) {
      const w = 1 - angles[k];
      cr += w * pv[k][0]; // (1−αₖ)/uₖ = (1−αₖ)·conj(uₖ); Σ … = 0 ⇔ Σ (1−αₖ)uₖ = 0
      ci += w * pv[k][1];
    }
    F.push(cr / closureScale, ci / closureScale);
    return F;
  };

  // Freeze ONE gap-logit (the softmax shift null); the disk-exterior rotation gauge is already fixed by
  // prevertsFromLogits (u₀ at angle 0). All other logits are free.
  const frozen = 0;
  const free: number[] = [];
  for (let i = 0; i < n; i++) if (i !== frozen) free.push(i);
  const logits = (y: readonly number[]): number[] => {
    const t = tSeed.slice();
    free.forEach((i, j) => (t[i] = y[j]));
    return t;
  };

  const gn = dampedGaussNewton((y) => residual(logits(y)), free.map((i) => tSeed[i]), { tol, maxIter });
  const prevertices = prevertsFromLogits(logits(gn.y));
  const finalRes = gn.residual.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return {
    prevertices,
    angles,
    orderedVertices: verts,
    converged: finalRes < tol,
    degraded: minGap(prevertices) < 1e-6,
    iterations: gn.iterations,
    residual: finalRes,
  };
}

/** The exterior SC map — solve + honest ≈ diagnostics — over `buildExteriorForwardMap`'s forward result. */
export interface ExteriorSCMap extends ExteriorSCForwardMap {
  /** Whether the parameter solve reached tolerance. */
  readonly converged: boolean;
  /** Crowding wall hit ⇒ accuracy honestly reduced (≈). */
  readonly degraded: boolean;
  /** Final parameter-solve residual ‖F‖∞. */
  readonly residual: number;
}

/**
 * Fit the exterior SC map φ: 𝔻* → Ω of a bounded simple polygon P (vertices counter-clockwise): solve the
 * parameter problem, then build the normalized forward map anchored to P. Returns the prevertices, the
 * accessory constant, `capacity = |C|`, the reproduced vertices, and honest `converged`/`degraded`/`residual`
 * tags. The Laurent-at-∞ extractor (M1b step 3) expands this map's Ψ about u = 0 for the Faber contract.
 */
export function fitExteriorSchwarzChristoffel(vertices: readonly C[], opts?: ExtSCSolveOptions): ExteriorSCMap {
  const sol = solveExteriorParameterProblem(vertices, opts);
  const fwd = buildExteriorForwardMap(sol.prevertices, sol.angles, {
    targetVertices: sol.orderedVertices,
    nGaussJacobi: opts?.nGaussJacobi,
    nGaussLegendre: opts?.nGaussLegendre,
  });
  return { ...fwd, converged: sol.converged, degraded: sol.degraded, residual: sol.residual };
}
