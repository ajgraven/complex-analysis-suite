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

const re = (x: number): Cx => ({ re: x, im: 0 });

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
