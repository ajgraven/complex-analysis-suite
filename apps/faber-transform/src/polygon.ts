// polygon.ts — exterior conformal maps φ: 𝔻* → Ω of REGULAR polygons, as truncated Laurent series for
// the @cas/faber ExteriorMap contract. This is the M1a slice of the polygonal-SC plan
// (docs/design/faber-polygonal-sc-plan.md): regular polygons need no parameter solve — by symmetry the
// prevertices are the n-th roots of unity and every interior angle is α = (n−2)/n, so the exterior SC map
// is closed-form. (General polygons — the exterior parameter problem — are M1b, in @cas/conformal.)
//
// Exterior SC derivative (exponent 1 − α = 2/n — the EXTERIOR region's angle is (2−α)π, so the exponent is
// sign-flipped from the interior engine's α−1; validated in the M0 spike):
//
//     φ'(z) = C·(1 − z^{−n})^{2/n} = C·Σ_{m≥0} d_m z^{−nm},   d_m = C(2/n, m)(−1)^m
//     φ(z)  = C·z + C·Σ_{m≥1} [d_m/(1−nm)]·z^{−(nm−1)}
//
// with d_m = d_{m−1}·(m−1−2/n)/m, d_0 = 1. K is the filled regular n-gon; capacity = |C|. The series is
// truncated at `order` blocks, so a polygon domain is ≈ (not exact) — corners give algebraically-decaying
// coefficients c_k ~ k^{−1−2/n}, so the tail is small but never zero.
import type { Cx } from "@cas/core";
import type { ExteriorMap } from "@cas/faber";
import { exteriorMapLaurentAtInfinity, fitExteriorSchwarzChristoffel } from "@cas/conformal";

const re = (x: number): Cx => ({ re: x, im: 0 });

/** Per-corner Faber-norm bounds Λₖ = max{αₖ, 2−αₖ} and their max (Miña-Díaz–Rubin–Wennman 2025). */
export interface CornerNorms {
  /** Λₖ per corner (1 at a straight vertex, → 2 as a corner sharpens either way). */
  readonly lambdas: readonly number[];
  /** maxₖ Λₖ — the limsupₙ ‖Fₙ‖_∂K overshoot bound (the sharpest corner dominates). */
  readonly maxLambda: number;
}

/**
 * The corner-norm bounds for a polygon with interior angles `angles` (in units of π): Λₖ = max{αₖ, 2−αₖ},
 * governing the Faber-polynomial overshoot near each corner — `limsupₙ ‖Fₙ‖_∂K ≤ maxₖ Λₖ`. A straight
 * vertex (αₖ=1) gives 1 (no overshoot); a sharp convex (αₖ→0) or reentrant (αₖ→2) corner approaches 2.
 */
export function cornerNorms(angles: readonly number[]): CornerNorms {
  const lambdas = angles.map((a) => Math.max(a, 2 - a));
  return { lambdas, maxLambda: Math.max(...lambdas, 1) };
}

/**
 * The exterior map φ: 𝔻* → Ω of a regular n-gon (n ≥ 3), truncated to `order` Laurent blocks. Returns the
 * `{c, laurent}` contract: `c = C` is the capacity (leading coefficient), `laurent[nm−1] = C·d_m/(1−nm)`,
 * every other entry 0. Faber polynomials F_k for k ≤ n·order are unaffected by the truncation (the
 * recurrence only reads `laurent[0..k]`), so low-degree images are effectively exact; the truncation shows
 * only in the boundary trace and in high-order / transcendental inputs.
 */
export function regularPolygonMap(n: number, order = 120, C = 1): ExteriorMap {
  if (!Number.isInteger(n) || n < 3) throw new Error("regularPolygonMap: n must be an integer ≥ 3");
  if (!Number.isInteger(order) || order < 1) throw new Error("regularPolygonMap: order must be a positive integer");
  const beta = 2 / n;
  const laurent: Cx[] = [re(0)]; // index 0 = c₀ = 0 (the polygon is centred at the origin)
  let d = 1; // d_0
  for (let m = 1; m <= order; m++) {
    d = (d * (m - 1 - beta)) / m; // d_m = d_{m−1}·(m−1−2/n)/m
    const k = n * m - 1; // Laurent index of this block: z^{−(nm−1)}
    while (laurent.length < k) laurent.push(re(0)); // zero-fill the gap between blocks
    laurent.push(re((C * d) / (1 - n * m)));
  }
  return { c: C, laurent };
}

/** A fitted polygon exterior map plus the exterior SC fit's honest diagnostics (for the ≈ guardrail). */
export interface PolygonMapResult {
  readonly map: ExteriorMap;
  /** The parameter solve reached tolerance. */
  readonly converged: boolean;
  /** A prevertex-crowding wall was hit ⇒ accuracy honestly reduced. */
  readonly degraded: boolean;
  /** Final parameter-solve residual. */
  readonly residual: number;
  /**
   * The z-plane SC prevertices wₖ = 1/uₖ on |w| = 1 (NOT φ(zₖ); under φ: 𝔻*→Ω a prevertex maps to a
   * corner on ∂K) — in INPUT-vertex order: `cornerImages[i]` is the prevertex of the input polygon's
   * vertex `i` (the name is legacy; the values are prevertices). These
   * drive the corner-suppressing weighted Faber polynomials Q_{n,m} (M3): `@cas/faber`'s `weightSeries`
   * consumes exactly this set (order-agnostically); the in-panel editor relies on the per-vertex alignment.
   * Empty when the fit did not converge.
   */
  readonly cornerImages: readonly Cx[];
}

/** The z-plane prevertices wₖ = 1/uₖ of a regular n-gon: the n-th roots of unity (closed-form; NOT φ(zₖ)). */
export function regularPolygonCornerImages(n: number): Cx[] {
  return Array.from({ length: n }, (_, k) => ({ re: Math.cos((2 * Math.PI * k) / n), im: Math.sin((2 * Math.PI * k) / n) }));
}

/** Options for {@link polygonMap}. */
export interface PolygonMapOptions {
  /** Cap on the Laurent extraction order before adaptive trimming (default: geometry-aware, 200 convex / 400 reentrant). */
  readonly maxOrder?: number;
  /** Keep coefficients until the tail falls below this fraction of the peak magnitude (default 1e-4). */
  readonly tailTol?: number;
  /** Always keep at least this many coefficients (Faber-degree coverage; default 48). */
  readonly minOrder?: number;
}

/**
 * The exterior map φ: 𝔻* → Ω of an ARBITRARY bounded simple polygon (M1b/M2), as a truncated Laurent series
 * for the @cas/faber ExteriorMap contract. Fits the exterior Schwarz–Christoffel map (`@cas/conformal`) —
 * solving for the prevertices, reentrant corners (αₖ>1) included — then extracts φ's Laurent-at-∞
 * coefficients (leading c = capacity, tail centred at the conformal centre, rotated so c is real). Vertices
 * are `[x, y]` counter-clockwise.
 *
 * **Adaptive truncation (M2):** reentrant/sharp corners give algebraically-decaying coefficients, so the
 * series is extracted generously and then trimmed to the last coefficient above `tailTol·max` (a sharp
 * boundary) — convex polygons trim to a few dozen terms, an L-shape keeps a few hundred. Faber polynomials
 * up to `minOrder` are always covered and are unaffected by the truncation, so low-degree images stay exact.
 * The fit's `converged`/`degraded`/`residual` tags are returned so a caller (e.g. the M2 editor) can surface
 * a bad fit.
 */
export function polygonMap(vertices: readonly (readonly [number, number])[], opts?: PolygonMapOptions): PolygonMapResult {
  const tailTol = opts?.tailTol ?? 1e-4;
  const minOrder = opts?.minOrder ?? 48;
  const input = vertices.map((v) => [v[0], v[1]] as [number, number]);
  const fit = fitExteriorSchwarzChristoffel(input);
  // Geometry-aware extraction order: convex corners give fast-decaying coefficients (≤ ~150 terms for the
  // presets), reentrant corners decay slowly (need the full cap). Trimming below removes any excess.
  const reentrant = fit.angles.some((a) => a > 1.0001);
  const maxOrder = opts?.maxOrder ?? (reentrant ? 400 : 200);
  const { c, laurent } = exteriorMapLaurentAtInfinity(fit, maxOrder);
  // Trim the slowly-decaying tail: keep up to the last index above tailTol·max, but at least minOrder.
  const mag = laurent.map((z) => Math.hypot(z[0], z[1]));
  const peak = Math.max(...mag, Number.MIN_VALUE);
  let last = Math.min(minOrder, laurent.length - 1);
  for (let k = 0; k < laurent.length; k++) if (mag[k] > tailTol * peak) last = Math.max(last, k);
  const kept = laurent.slice(0, last + 1);
  // Corner images wₖ = 1/uₖ (the prevertex reciprocals, on |w| = 1), returned in INPUT-vertex order:
  // cornerImages[i] is the corner image of vertices[i]. The exterior SC solver traverses the polygon in a
  // reversed order (toExteriorOrder), so prevertices[k] serves the input vertex fit.orderedVertices[k];
  // match that back to the input by nearest coordinate (vertices are distinct ⇒ unambiguous, even for a
  // symmetric polygon). M3's weight ∏ₖ (1 − wₖ·s) uses the set and is order-agnostic; the in-panel editor's
  // per-vertex handles rely on this alignment (cornerImages[i] ↔ vertices[i]).
  const nearestInput = (p: readonly [number, number]): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < input.length; i++) {
      const d = Math.hypot(input[i][0] - p[0], input[i][1] - p[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const cornerImages: Cx[] = new Array<Cx>(fit.prevertices.length);
  for (let k = 0; k < fit.prevertices.length; k++) {
    const u = fit.prevertices[k];
    const d = u[0] * u[0] + u[1] * u[1]; // |u|² (= 1 on ∂𝔻); 1/u = ū/|u|²
    cornerImages[nearestInput(fit.orderedVertices[k])] = { re: u[0] / d, im: -u[1] / d };
  }
  return {
    map: { c, laurent: kept.map(([r, i]): Cx => ({ re: r, im: i })) },
    converged: fit.converged,
    degraded: fit.degraded,
    residual: fit.residual,
    cornerImages,
  };
}
