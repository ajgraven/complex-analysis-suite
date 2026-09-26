// The discriminant, and where it vanishes as ONE coefficient moves: the branch points of aⱼ
// (DESIGN §4.3). A loop in the aⱼ-plane around one of these swaps roots; that is PRA-3's subject, and
// these points are what it will lasso.
//
// Two routes, compared in the suite:
//   exact  — disc of p with aⱼ as an indeterminate t, by @cas/exact's Bareiss resultant, a
//            polynomial in t whose roots are isolated by Smith's discs. Needs an EXACT layer: on rational
//            coefficients it costs 0.1–0.3 s at degree 15–24, but on dyadic ones the reductions explode
//            (1.1 s at degree 8, 21 s at degree 12 — measured), so a float polynomial never takes it.
//   numeric — with q = p − aⱼzʲ, a double root at z needs z·q′(z) − j·q(z) = 0, and then aⱼ = −q(z)/zʲ.
import { QiPoly, discriminant, yunSquarefree, type Gauss } from "@cas/exact";
import type { Polynomial } from "../polynomial.js";
import { evalAt } from "../polynomial.js";
import type { Cx } from "../types.js";
import { discsFor, type DiscReport } from "../roots/discs.js";
import { solveAndRefine, solveRoots } from "../roots/solve.js";

const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** disc(p), exactly — only for a polynomial with an exact layer. */
export function exactDiscriminant(p: Polynomial): Gauss | null {
  if (!p.exact) return null;
  const list = Array.from({ length: p.degree + 1 }, (_, k) =>
    QiPoly.constant((p.exact as QiPoly).coeff(k)),
  );
  return discriminant(list).coeff(0);
}

export type BranchPoints =
  | {
      readonly route: "exact";
      /** The DISTINCT branch points. */
      readonly points: readonly Cx[];
      /** How many double-root collisions meet at each (its multiplicity as a root of the discriminant). */
      readonly multiplicity: readonly number[];
      /** Per point, the Smith disc of its own squarefree factor: exactly one branch point inside. */
      readonly discs: readonly DiscReport[];
      /** disc(p) as a polynomial in t = aⱼ, exactly. */
      readonly poly: QiPoly;
    }
  | { readonly route: "numeric"; readonly points: readonly Cx[] };

/**
 * The numeric route: aⱼ at every double-root configuration reachable by moving aⱼ alone.
 *
 * For j = 0 the condition is q′(z) = 0 and a₀ = −q(z) — the critical points, z = 0 included when it is
 * one (the first draft solved z·q′ and discarded z = 0 for all j, which dropped z⁴ − 4z² + t's branch
 * point t = 0: a test comparing the two routes found it). For j ≥ 1 it is h(z) = z·q′ − j·q = 0 with
 * aⱼ = −q(z)/zʲ; h(0) = −j·a₀, so z = 0 is a candidate only when a₀ = 0, where the double root at 0 needs
 * a₁ = 0 as well — reachable by moving a₁ (the value 0) and by no other coefficient.
 */
export function branchPointsNumeric(p: Polynomial, j: number): Cx[] {
  const q = p.coeffs.map((c, k) => (k === j ? ([0, 0] as Cx) : c));
  const isZero = (c: Cx): boolean => c[0] === 0 && c[1] === 0;
  const trim = (h: Cx[]): Cx[] => {
    const out = [...h];
    while (out.length > 1 && isZero(out[out.length - 1])) out.pop();
    return out;
  };
  if (j === 0) {
    const dq = trim(q.slice(1).map(([a, b], k) => [(k + 1) * a, (k + 1) * b] as Cx));
    if (dq.length < 2) return [];
    return solveRoots(dq).roots.map((z) => {
      const v = evalAt(q, z);
      return [-v[0], -v[1]] as Cx;
    });
  }
  // h(z) = z·q′(z) − j·q(z): coefficient of zᵏ is (k − j)·qₖ.
  const h = trim(q.map(([a, b], k) => [(k - j) * a, (k - j) * b] as Cx));
  const out: Cx[] = [];
  let lead = 0;
  while (lead < h.length - 1 && isZero(h[lead])) lead++;
  if (lead > 0 && j === 1) out.push([0, 0]);
  const rest = h.slice(lead);
  if (rest.length < 2) return out;
  for (const z of solveRoots(rest).roots) {
    let zj: Cx = [1, 0];
    for (let k = 0; k < j; k++) zj = cmul(zj, z);
    const qz = evalAt(q, z);
    out.push(cdiv([-qz[0], -qz[1]], zj));
  }
  return out;
}

/** The exact route, when there is an exact layer; the numeric one otherwise. */
export function branchPoints(p: Polynomial, j: number): BranchPoints {
  if (!p.exact) return { route: "numeric", points: branchPointsNumeric(p, j) };
  const list = Array.from({ length: p.degree + 1 }, (_, k) =>
    k === j ? QiPoly.variable() : QiPoly.constant((p.exact as QiPoly).coeff(k)),
  );
  const poly = discriminant(list);
  return { route: "exact", ...isolateRoots(poly), poly };
}

/**
 * The distinct roots of an exact polynomial, each in a Smith disc of its own squarefree factor, with
 * its multiplicity. Solved factor by squarefree factor (Yun), so every root is a SIMPLE root of what is
 * solved: z⁴ − 4z² + t² … has double roots in t (z and −z reach the same aⱼ), and refining the whole
 * discriminant there converges only to √ε — 8.6e-9 against the numeric route, measured. Shared by the
 * branch points of aⱼ and, since PRA-7, those of a family's t.
 */
export function isolateRoots(poly: QiPoly): {
  points: Cx[];
  multiplicity: number[];
  discs: DiscReport[];
} {
  const points: Cx[] = [];
  const multiplicity: number[] = [];
  const discs: DiscReport[] = [];
  for (const { factor, multiplicity: m } of yunSquarefree(poly)) {
    if (factor.degree() < 1) continue;
    const coeffs: Gauss[] = Array.from({ length: factor.degree() + 1 }, (_, k) =>
      factor.coeff(k),
    );
    const floats: Cx[] = coeffs.map((g) => g.toTuple());
    const roots = solveAndRefine(floats, coeffs).roots;
    const rep = discsFor(floats, coeffs, roots);
    for (const r of roots) {
      points.push(r);
      multiplicity.push(m);
      discs.push(rep);
    }
  }
  return { points, multiplicity, discs };
}
