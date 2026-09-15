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
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { LATEX } from "../kernel/notation.js";
import { assembleVerdict, bound, estimate, exact, refuse, type Certificate, type Verdict } from "@cas/rigor";
import type { Node } from "@cas/expr";
import type { Cx } from "../kernel/geom.js";
import { ExpSum, formatTwoPiIExpSum, weightedExpSum } from "../kernel/expSum.js";
import { asCyclotomic, cyclotomicWeightedSum } from "../kernel/cyclotomic.js";
import { toExactRational } from "../kernel/exactRational.js";
import type { RatPi } from "../kernel/ratPi.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ContourIntegral } from "./contour/integrate.js";

export interface ResidueTheoremResult {
  /**
   * `2πi Σ n·Res`, exact, present only when every pole and winding was exact.
   *
   * `latex` is the SAME value in the LaTeX notation — the same formatter at `LATEX`, not a second
   * rendering (M8 step 0.4b), so the card and the typeset page cannot come to disagree.
   */
  readonly exactValue?: { readonly value: Cx; readonly text: string; readonly latex: string };
  /**
   * The same value in UNITS OF π — i.e. `2i Σ n·Res`.
   *
   * Pass 5 adds this to L4's `iα·Res`, which is also π times an algebraic number, and divides by the
   * target coefficient. Working in these units is what keeps the whole solve exact: π is never
   * evaluated, so `π/2` stays `π/2` instead of becoming 1.5707963.
   */
  readonly piUnits?: ExpSum;
  /**
   * `2πi Σ n·Res` itself as an element of ℚ(i)(π) — the LOG families' route.
   *
   * Not the same field in different clothes. `piUnits` is the value DIVIDED by π, because every
   * contribution in tiers A–C is π times an algebraic number and working in those units is what
   * keeps π unevaluated. A log family's residues are polynomials in π of degree up to `m`, so there
   * is no single power to divide out — `Res(log²z/(1+z²)², i) = −π/4 + iπ²/16` — and ℚ(i)(π) holds
   * the value directly instead. Exactly one of the two is present.
   */
  readonly exactInPi?: RatPi;
  /** Distance between the exact value and the quadrature, when both exist. */
  readonly disagreement?: number;
  /** True when the two independent computations agree to the quadrature's own estimate. */
  readonly agrees?: boolean;
  /**
   * The corroboration, when the two routes AGREE — deliberately not part of {@link verdict}.
   *
   * `meet` is the label of a claim that DEPENDS on two sub-claims, and `∮` does not depend on the
   * quadrature: the residue theorem computes it from exact residues and exact winding numbers, and
   * the quadrature is a second opinion about the same number. Folding the agreement's `≤` into the
   * verdict met `=` with `≤` and capped an exact value at `≤` — which is why the shell was reduced
   * to hand-writing a `=` badge beside it, the one thing `@cas/rigor` exists to make impossible.
   *
   * Corroboration never weakens a claim. **Contradiction still refuses it**: when the two routes
   * disagree beyond the quadrature's own error estimate, the refusal goes into the verdict and
   * absorbs it, because then one of them is wrong and no number may be printed.
   */
  readonly crossCheck?: Certificate;
  /**
   * The identity this result was computed FROM, as the derivation panel should state it.
   *
   * Absent means the plain residue theorem, which is what three of the four routes apply (the branch
   * and log theorems change what a residue IS, not the identity it is summed in). `exteriorTheorem.ts`
   * applies a different one, and a panel that printed `∮ = 2πi Σ n·Res` above a dogbone's answer
   * would be stating the very equation D6 exists to show is inapplicable.
   */
  readonly identity?: string;
  readonly verdict: Verdict;
}

/** What the derivation says it is applying when a result does not name its own identity. */
export const RESIDUE_THEOREM_IDENTITY = "∮ f dz = 2πi Σₖ n(γ,aₖ)·Res(f,aₖ)";

/** How far apart the two routes may be before the disagreement is reported as an inconsistency. */
const AGREEMENT_SLACK = 32;

/** The corroboration, and the refusal that replaces it when the two routes contradict each other. */
export interface QuadratureCheck {
  readonly disagreement: number;
  readonly agrees: boolean;
  /** The `≤` corroboration. Belongs BESIDE the verdict, never inside it — see {@link ResidueTheoremResult.crossCheck}. */
  readonly crossCheck: Certificate;
  /** Present only on disagreement, and then it goes INTO the verdict: one of the two is wrong. */
  readonly contradiction?: Certificate;
}

/**
 * Compare an exact value against the quadrature of the same contour.
 *
 * Extracted for its second consumer (`engine/exteriorTheorem.ts`), where the same comparison is
 * available and is worth more, not less: the exterior identity moves a term from the contour to
 * infinity, so a sign error there is invisible to every other check and obvious to this one.
 */
export function checkAgainstQuadrature(
  value: Cx,
  text: string,
  integral: ContourIntegral,
): QuadratureCheck | null {
  if (integral.value === undefined) return null;
  const worst = Math.max(0, ...integral.pieces.map((p) => p.errorEstimate));
  const disagreement = Math.hypot(value[0] - integral.value[0], value[1] - integral.value[1]);
  const tolerance = Math.max(AGREEMENT_SLACK * worst, 1e-9 * Math.max(1, Math.hypot(...value)));
  const agrees = disagreement <= tolerance;
  const crossCheck = bound(
    "≤",
    `the quadrature agrees with it to ${disagreement.toExponential(2)}`,
    "independent cross-check: exact ℚ(i) arithmetic against floating Gauss–Legendre panels",
    { restriction: "agreement is evidence, not proof — the two share no machinery, which is the point" },
  );
  return {
    disagreement,
    agrees,
    crossCheck,
    ...(agrees
      ? {}
      : {
          contradiction: refuse(
            "the two routes disagree",
            `the residue theorem gives ${text} but the quadrature gives a value ${disagreement.toExponential(2)} away, which is beyond its own error estimate — one of them is wrong`,
          ),
        }),
  };
}

export function applyResidueTheorem(
  poles: PoleReport,
  integral: ContourIntegral,
  /**
   * The integrand, when the caller has it — which opens the CYCLOTOMIC route below.
   *
   * Optional for the same reason `applyBranchTheorem`'s `rational` is: every caller that can supply
   * it does, and a caller that cannot still gets the per-pole route rather than an error.
   */
  ast?: Node,
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
    // **THE CYCLOTOMIC ROUTE, AND IT IS A FALLBACK ON PURPOSE.** `1/(1 + zⁿ)` has exact poles in
    // ℚ(i)(√d) at `n = 2, 3, 4` and none at `n = 5, 7` — `ℚ(ζ₁₀)` has degree 4 over ℚ — so F1
    // reaches an answer at the first three through the per-pole sum above and at the others only
    // through the structure. Trying the structure FIRST would work too, and would be worse: the
    // per-pole route returns `2π/(3√3)` in the algebraic basis where the structural one returns
    // `π/(3·sin(π/3))`, the same number carrying a transcendental it does not need. The record's own
    // goldens say exactly this — a radical at `n = 2, 3` and a sine at `n = 5, 7` — and the ordering
    // falls out of the existing flow rather than needing a preference.
    const cyclotomic = ast === undefined ? null : asCyclotomicDenominator(ast);
    if (cyclotomic !== null) {
      const sum = cyclotomicWeightedSum(cyclotomic, Frac.ZERO, undefined, (root) => {
        const w = integral.windings.find(
          (x) => Math.hypot(x.at[0] - root.at[0], x.at[1] - root.at[1]) < 1e-6,
        );
        // A root the contour was never asked about is not a root it encloses: `integrateContour`
        // weighs every pole the report found, and these ARE those poles — found numerically even
        // where they could not be pinned exactly. A missing entry means the geometry said nothing,
        // which is `null` (a refusal) rather than 0.
        if (w === undefined) return null;
        return w.decided ? w.n : null;
      });
      if (sum.ok) {
        const piUnits = sum.value.scale(SqrtExt.fromGauss(Gauss.int(0, 2)));
        const [re, im] = piUnits.toTuple();
        const value: Cx = [Math.PI * re, Math.PI * im];
        const text = formatTwoPiIExpSum(sum.value);
        const latex = formatTwoPiIExpSum(sum.value, LATEX);
        const check = checkAgainstQuadrature(value, text, integral);
        return {
          exactValue: { value, text, latex },
          piUnits,
          ...(check === null ? {} : { disagreement: check.disagreement, agrees: check.agrees }),
          ...(check?.agrees === true ? { crossCheck: check.crossCheck } : {}),
          verdict: assembleVerdict([
            sum.certificate,
            ...(check?.contradiction === undefined ? [] : [check.contradiction]),
          ]),
        };
      }
      // A cyclotomic denominator whose sum REFUSED is not a case to fall through on: the refusal is
      // about an undecided winding, which the per-pole route below would meet identically.
      return { verdict: assembleVerdict([refuse("∮ f dz", sum.reason), sum.certificate]) };
    }
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

  // The exponential basis when f = g(z)·e^{iaz}, and plain ℚ(i)(√d) otherwise — `weightedExpSum`
  // with no frequency is `weightedSum` lifted, so the rational families are byte-identical.
  const sum = weightedExpSum(poles.exactPoles, windingOf, poles.exponentialFrequency);
  // 2πi·(a + bi) = −2πb + 2πa·i, evaluated after the exact sum so the rounding happens once.
  const [sumRe, sumIm] = sum.toTuple();
  const twoPi = 2 * Math.PI;
  const value: Cx = [-twoPi * sumIm, twoPi * sumRe];
  const text = formatTwoPiIExpSum(sum);
  const latex = formatTwoPiIExpSum(sum, LATEX);

  certificates.push(
    exact(
      `∮ f dz = 2πi Σ n(γ,aₖ)·Res(f,aₖ) = ${text}`,
      "exact residues over ℚ(i), exact winding numbers, and the residue theorem",
    ),
  );

  const check = checkAgainstQuadrature(value, text, integral);
  if (check?.contradiction !== undefined) certificates.push(check.contradiction);

  return {
    exactValue: { value, text, latex },
    // 2πi·Σ = π·(2i·Σ), and the scaling stays inside the exponential basis.
    piUnits: sum.scale(SqrtExt.fromGauss(Gauss.int(0, 2))),
    ...(check === null ? {} : { disagreement: check.disagreement, agrees: check.agrees }),
    ...(check?.agrees === true ? { crossCheck: check.crossCheck } : {}),
    verdict: assembleVerdict(certificates),
  };
}

/**
 * `f` read as `1/(b_n zⁿ + b₀)`, or null.
 *
 * A NUMERATOR OF DEGREE ZERO ONLY, and it is the same restriction `branchTheorem.ts` states: the
 * closed form `Res = −zₖ^a/(n b₀)` comes from `P/Q′` with `P` constant, and a numerator with a `z`
 * in it is a different sum with no such form. A constant other than 1 scales through, so it is
 * allowed here where the branch reader (which composes with `z^α`) required exactly 1.
 */
function asCyclotomicDenominator(ast: Node): ReturnType<typeof asCyclotomic> {
  const split = toExactRational(ast);
  if (!split.ok) return null;
  if (split.value.num.degree() !== 0) return null;
  const form = asCyclotomic(split.value.den);
  if (form === null) return null;
  // `c/(b_n zⁿ + b₀)` is `1/((b_n/c) zⁿ + (b₀/c))`, which has the same roots and scaled
  // coefficients — so divide through rather than carry the numerator into the residue formula.
  const c = split.value.num.coeff(0);
  if (c.isZero()) return null;
  return { ...form, constant: form.constant.div(c), leading: form.leading.div(c) };
}
