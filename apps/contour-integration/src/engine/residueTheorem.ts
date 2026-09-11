// The residue theorem, applied exactly — and checked against the quadrature.
//
//     ∮γ f dz = 2πi · Σₖ n(γ, aₖ) · Res(f, aₖ)
//
// Two of the three ingredients are already exact by this point: the winding numbers are integers
// decided by sign predicates (M1), and the residues are elements of ℚ(i) (M2). So when every pole of
// `f` has been pinned exactly and every winding number decided, the whole right-hand side is exact,
// and `∮` can be reported as `=` rather than `≈` — from a formula, without integrating anything.
//
// The quadrature does not become redundant; it becomes a **check**. Two computations sharing no
// machinery — exact ℚ(i) arithmetic on one side, floating Gauss–Legendre panels on the other —
// arriving at the same number is strong evidence that both are right, and a disagreement is a bug
// report. This module is where they are compared, and a disagreement is reported as one.
import type { SqrtExt } from "@cas/exact";
import { assembleVerdict, bound, estimate, exact, refuse, type Certificate, type Verdict } from "@cas/rigor";
import type { Cx } from "../kernel/geom.js";
import { formatTwoPiISqrt } from "../kernel/formatExact.js";
import { weightedSum } from "../kernel/algebraic.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ContourIntegral } from "./contour/integrate.js";

export interface ResidueTheoremResult {
  /** `2πi Σ n·Res`, exact, present only when every pole and winding was exact. */
  readonly exactValue?: { readonly value: Cx; readonly text: string };
  /** Distance between the exact value and the quadrature, when both exist. */
  readonly disagreement?: number;
  /** True when the two independent computations agree to the quadrature's own estimate. */
  readonly agrees?: boolean;
  readonly verdict: Verdict;
}

/** How far apart the two routes may be before the disagreement is reported as an inconsistency. */
const AGREEMENT_SLACK = 32;

export function applyResidueTheorem(
  poles: PoleReport,
  integral: ContourIntegral,
): ResidueTheoremResult {
  const certificates: Certificate[] = [];

  if (integral.value === undefined) {
    return { verdict: assembleVerdict([refuse("the residue theorem", "the integral itself was refused")]) };
  }
  if (!integral.closed) {
    return {
      verdict: assembleVerdict([
        refuse("the residue theorem", "it applies to a closed contour, and this one is not closed"),
      ]),
    };
  }
  if (!poles.exactlyComplete || !poles.exactPoles) {
    return {
      verdict: assembleVerdict([
        estimate(
          "∮ from the residue theorem",
          poles.rational
            ? "not every pole of f is a Gaussian rational, so Σ Res is not exact"
            : "f is not a rational function of z, so its residues are not exact",
        ),
      ]),
    };
  }

  const undecided = integral.windings.filter((w) => !w.decided);
  if (undecided.length > 0) {
    return {
      verdict: assembleVerdict([
        refuse(
          "the residue theorem",
          "a winding number could not be decided, so the residues have no coefficients",
        ),
      ]),
    };
  }

  // n(γ, a) for an exact pole: match by position against the decided winding numbers. The lookup is
  // by distance because the winding list is keyed on the float locations the contour was measured
  // with; exactness enters through the residue, not through the search.
  const windingOf = (a: SqrtExt): number => {
    const at = a.toTuple();
    let best = 0;
    let bestDist = Infinity;
    for (const w of integral.windings) {
      const d = Math.hypot(w.at[0] - at[0], w.at[1] - at[1]);
      if (d < bestDist) {
        bestDist = d;
        best = w.n;
      }
    }
    return bestDist < 1e-6 ? best : 0;
  };

  const sum = weightedSum(poles.exactPoles, windingOf);
  // 2πi·(a + bi) = −2πb + 2πa·i, evaluated after the exact sum so the rounding happens once.
  const [sumRe, sumIm] = sum.toTuple();
  const twoPi = 2 * Math.PI;
  const value: Cx = [-twoPi * sumIm, twoPi * sumRe];
  const text = formatTwoPiISqrt(sum);

  certificates.push(
    exact(
      `∮ f dz = 2πi Σ n(γ,aₖ)·Res(f,aₖ) = ${text}`,
      "exact residues over ℚ(i), exact winding numbers, and the residue theorem",
    ),
  );

  const worst = Math.max(0, ...integral.pieces.map((p) => p.errorEstimate));
  const disagreement = Math.hypot(value[0] - integral.value[0], value[1] - integral.value[1]);
  const tolerance = Math.max(AGREEMENT_SLACK * worst, 1e-9 * Math.max(1, Math.hypot(...value)));
  const agrees = disagreement <= tolerance;

  certificates.push(
    agrees
      ? bound(
          "≤",
          `the quadrature agrees with it to ${disagreement.toExponential(2)}`,
          "independent cross-check: exact ℚ(i) arithmetic against floating Gauss–Legendre panels",
          { restriction: "agreement is evidence, not proof — the two share no machinery, which is the point" },
        )
      : refuse(
          "the two routes disagree",
          `the residue theorem gives ${text} but the quadrature gives a value ${disagreement.toExponential(2)} away, which is beyond its own error estimate — one of them is wrong`,
        ),
  );

  return { exactValue: { value, text }, disagreement, agrees, verdict: assembleVerdict(certificates) };
}
