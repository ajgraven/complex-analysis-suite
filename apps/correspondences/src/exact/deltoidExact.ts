// The deltoid's EXACT deleted-correspondence scaffold (roadmap #16, PR-B) — the app-facing instance of the
// pure engine in this folder. The deltoid φ(z) = z + 1/(2z²) has Gaussian-rational coefficients (c = 1,
// F₂ = ½), so its whole 2:2 correspondence curve and cusp locus are exact:
//   curve      C(w, z̄) = 2w² − z̄²·w − z̄ = 0        (exact, in ℚ(i))
//   cusp locus disc_w C(z̄) = z̄⁴ + 8z̄               (its roots = branch points, where the two w-branches
//                                                     collide — the "cusps" of the correspondence dynamics)
//
// Only the ground-truth deltoid (a = 1) is exact here; the wider family φ_a = z + a/(2z²) has a complex
// parameter a, so its per-point branch solving stays numeric (correspondence.ts) — #16 gives the deltoid an
// exact, once-computed scaffold to validate that numeric engine against, not a wholesale replacement.
// Honest labelling (RISKS §3): the curve and branch points are exact (=); the dynamics on top stay ≈.
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";
import { correspondenceCurve, cuspLocus, Gauss, renderQiPolyText } from "./index.js";
import type { ExactCorrespondenceCurve, QiPoly } from "./index.js";

const A = tupleAlgebra;

/** The deltoid's exact 2:2 correspondence curve C(w, z̄) = 2w² − z̄²·w − z̄. */
export const DELTOID_EXACT_CURVE: ExactCorrespondenceCurve = correspondenceCurve(Gauss.ONE, [
  Gauss.ZERO,
  Gauss.ZERO,
  Gauss.rat(1n, 2n),
]);

/** The deltoid's exact cusp locus disc_w C = z̄⁴ + 8z̄ (a polynomial in z̄; roots = branch points). */
export const DELTOID_CUSP_LOCUS: QiPoly = cuspLocus(DELTOID_EXACT_CURVE);

/** The cusp locus as a prettified string, "z̄⁴ + 8z̄". */
export const DELTOID_CUSP_LOCUS_TEXT: string = prettyCurve(renderQiPolyText(DELTOID_CUSP_LOCUS, "z̄"));

/** A branch point of the correspondence: a z̄-root of the cusp locus and its z-plane point z = conj(z̄). */
export interface BranchPoint {
  /** The z̄ value (root of disc_w C). */
  zbar: ComplexTuple;
  /** The corresponding z-plane point z = conj(z̄) = 1/η. */
  z: ComplexTuple;
  /** z̄ = 0 is degenerate: η(0) = 1/z̄ = ∞, so it is not a finite branch point in the z-plane. */
  degenerate: boolean;
}

/**
 * Numeric roots z̄ of the exact cusp locus → the correspondence's branch points z = conj(z̄). Zero roots
 * (z̄ = 0, where η blows up) are peeled off exactly by their multiplicity; the rest come from Durand–Kerner
 * on the monic reduced polynomial (the same @cas/core solver the app already uses). For the deltoid this is
 * z̄⁴ + 8z̄ = z̄·(z̄³ + 8) → one degenerate root at 0 and three finite branch points on |z| = 2.
 */
export function deltoidBranchPoints(): BranchPoint[] {
  const coeffs = DELTOID_CUSP_LOCUS.coeffs.map((g) => g.toTuple());
  const wrap = (zbar: ComplexTuple): BranchPoint => ({
    zbar,
    z: [zbar[0], -zbar[1]],
    degenerate: A.abs(zbar) < 1e-12,
  });

  // Peel the zero root(s): leading (constant-side) zero coefficients are z̄ = 0 with that multiplicity.
  let v = 0;
  while (v < coeffs.length && A.abs(coeffs[v] ?? [0, 0]) < 1e-14) v++;
  const reduced = coeffs.slice(v);
  const out: BranchPoint[] = [];
  for (let i = 0; i < v; i++) out.push(wrap([0, 0]));

  const deg = reduced.length - 1;
  if (deg >= 1) {
    const lead = reduced[deg] ?? [1, 0];
    const monic = reduced.map((c) => A.div(c, lead)); // monic[deg] = 1
    const evalMonic = (z: ComplexTuple): ComplexTuple => {
      let acc: ComplexTuple = monic[deg] ?? [1, 0];
      for (let k = deg - 1; k >= 0; k--) acc = A.add(A.mul(acc, z), monic[k] ?? [0, 0]);
      return acc;
    };
    // Cauchy root bound → a generous seed circle so DK lands on all roots.
    let bound = 1;
    for (let k = 0; k < deg; k++) bound = Math.max(bound, 1 + A.abs(monic[k] ?? [0, 0]));
    const seeds: ComplexTuple[] = [];
    for (let k = 0; k < deg; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / deg;
      seeds.push([bound * Math.cos(t), bound * Math.sin(t)]);
    }
    const res = makeDurandKerner(A)(evalMonic, seeds, { tol: 1e-13, maxIter: 300 });
    if (res) for (const r of res.roots) out.push(wrap(r));
  }
  return out;
}

/** The engine's ASCII curve string prettified with unicode superscripts and a proper minus sign, for the
 *  app caption (e.g. "2 w^2 - z̄^2 w - z̄ = 0" → "2w² − z̄²w − z̄ = 0"). */
export function prettyCurve(text: string): string {
  return text
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/\^4/g, "⁴")
    .replace(/\^5/g, "⁵")
    .replace(/\^6/g, "⁶")
    .replace(/ - /g, " − ")
    .replace(/^- /, "−")
    .replace(/(\d) ([wz])/g, "$1$2") // drop the space between a coefficient and its variable
    .replace(/([²³⁴⁵⁶]) ([wz])/g, "$1$2"); // …and between a power and the next variable (z̄²w)
}
