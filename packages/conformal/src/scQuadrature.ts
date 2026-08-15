// scQuadrature.ts — the compound Gauss–Jacobi rule for Schwarz–Christoffel side integrals
// (Trefethen 1980; the subdivision constant is Driscoll–Vavasis 1998). A side integral
//     ∫_{z0}^{z1} f(t) dt,   f(t) = C·∏ⱼ (t − wⱼ)^{αⱼ−1}
// has an algebraic branch point at EVERY prevertex. Splitting each polygon side at its midpoint
// leaves each half with a singular endpoint at only ONE prevertex (z0 here); that endpoint is
// absorbed by a Gauss–Jacobi weight (gaussJacobi.ts). The remaining danger is a FOREIGN
// (non-endpoint) prevertex lying near the path, which makes the analytic remainder nearly
// singular and silently destroys a fixed-order rule. The fix: subdivide any interval `e` that is
// "ill-separated" — d(e) < ℓ(e)/(3√2) — into three equal pieces and recurse (Driscoll–Vavasis
// 1998, eq. 2). The piece touching the singular endpoint keeps the Gauss–Jacobi rule; the rest use
// Gauss–Legendre on the full integrand, with z0 now itself a foreign singularity to stay clear of.
//
// This module is branch-agnostic: the caller supplies `full` (the integrand) and, for a singular
// near endpoint, its analytic remainder `regular` = f(t)/(t−z0)^{exponent} and the `exponent`.
// Getting those branches consistent is the SC integrand's job (roadmap step E, Phase 1); here we
// only place panels. Pure; node-tested against closed-form regular-n-gon integrals.
import type { C } from "./vandermondeArnoldi.js";
import { gaussJacobi, gaussLegendre } from "./gaussJacobi.js";

/** A segment integrand: the full value `full(t)`, and — if the near end is singular — its analytic remainder. */
export interface SegmentIntegrand {
  /** f(t), evaluated by the Gauss–Legendre panels on regular sub-intervals. */
  full: (t: C) => C;
  /** Present iff the near endpoint z0 is an algebraic singularity `f(t) ~ (t − z0)^exponent`. */
  nearEndpoint?: {
    /** The corner exponent αₖ − 1 at z0 (must be > −1). */
    readonly exponent: number;
    /** The analytic remainder H(t) = f(t)/(t − z0)^exponent, evaluated by the Gauss–Jacobi panel. */
    regular: (t: C) => C;
  };
}

export interface QuadratureOptions {
  /** Gauss–Jacobi node count for the singular-endpoint panel (default 16). */
  nGaussJacobi?: number;
  /** Gauss–Legendre node count for regular panels (default 16). */
  nGaussLegendre?: number;
  /** Ill-separation threshold: subdivide when d(e) < separation·ℓ(e). Default 1/(3√2) ≈ 0.2357. */
  separation?: number;
  /** Recursion cap on three-way subdivision (default 10; legitimate corners need ~3, this bounds
   *  the pathological crowded case that would otherwise blow up as 3^depth panels). */
  maxDepth?: number;
}

const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const abs = (a: C): number => Math.hypot(a[0], a[1]);

/** Principal complex power z^p for real p (z ≠ 0). */
function cpowReal(z: C, p: number): C {
  const r = Math.hypot(z[0], z[1]);
  if (r === 0) return [0, 0];
  const m = Math.exp(Math.log(r) * p);
  const th = Math.atan2(z[1], z[0]) * p;
  return [m * Math.cos(th), m * Math.sin(th)];
}

/** Shortest distance from point `p` to the segment [a, b]. */
function distSegmentPoint(a: C, b: C, p: C): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}

/**
 * Integrate `spec` along the straight segment from `z0` (the possibly-singular near end) to `z1`
 * (a regular end), applying compound Gauss–Jacobi subdivision so no panel comes within
 * `separation·ℓ` of any point in `foreign`. Returns the complex integral. `foreign` should list the
 * other (non-endpoint) singularities of `full`; pass `[]` for a smooth integrand.
 */
export function integrateSegment(
  spec: SegmentIntegrand,
  z0: C,
  z1: C,
  foreign: readonly C[],
  opts?: QuadratureOptions,
): C {
  const nGJ = opts?.nGaussJacobi ?? 16;
  const nGL = opts?.nGaussLegendre ?? 16;
  const sep = opts?.separation ?? 1 / (3 * Math.SQRT2);
  const maxDepth = opts?.maxDepth ?? 10;
  const gl = gaussLegendre(nGL);

  const legendrePanel = (full: (t: C) => C, a: C, b: C): C => {
    const half: C = [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2];
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < gl.nodes.length; i++) {
      const s = gl.nodes[i];
      const v = full([a[0] + half[0] * (1 + s), a[1] + half[1] * (1 + s)]);
      sx += gl.weights[i] * v[0];
      sy += gl.weights[i] * v[1];
    }
    return [half[0] * sx - half[1] * sy, half[0] * sy + half[1] * sx]; // (b−a)/2 · Σ w f
  };

  const jacobiPanel = (ne: NonNullable<SegmentIntegrand["nearEndpoint"]>, a: C, b: C): C => {
    const gj = gaussJacobi(nGJ, 0, ne.exponent);
    const half: C = [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2];
    const factor = cpowReal(half, ne.exponent + 1); // [(b−a)/2]^{exponent+1}
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < gj.nodes.length; i++) {
      const s = gj.nodes[i];
      const h = ne.regular([a[0] + half[0] * (1 + s), a[1] + half[1] * (1 + s)]);
      sx += gj.weights[i] * h[0];
      sy += gj.weights[i] * h[1];
    }
    return [factor[0] * sx - factor[1] * sy, factor[0] * sy + factor[1] * sx];
  };

  const recur = (sp: SegmentIntegrand, a: C, b: C, fs: readonly C[], depth: number): C => {
    const len = abs(sub(b, a));
    let d = Infinity;
    for (const p of fs) d = Math.min(d, distSegmentPoint(a, b, p));
    if (depth >= maxDepth || fs.length === 0 || d >= sep * len) {
      return sp.nearEndpoint ? jacobiPanel(sp.nearEndpoint, a, b) : legendrePanel(sp.full, a, b);
    }
    const m1: C = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
    const m2: C = [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3];
    const near = recur({ full: sp.full, nearEndpoint: sp.nearEndpoint }, a, m1, fs, depth + 1);
    const farForeign = sp.nearEndpoint ? [...fs, a] : fs; // a is now a foreign singularity of `full`
    const mid = recur({ full: sp.full }, m1, m2, farForeign, depth + 1);
    const far = recur({ full: sp.full }, m2, b, farForeign, depth + 1);
    return [near[0] + mid[0] + far[0], near[1] + mid[1] + far[1]];
  };

  return recur(spec, z0, z1, foreign, 0);
}
