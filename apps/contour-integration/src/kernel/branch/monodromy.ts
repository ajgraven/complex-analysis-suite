// **WHAT A CROSSING COSTS** — the factor, named, in both of the two forms research 06 insists on.
//
// §3.2 is categorical about the UI contract: "a cut crossing is not a numerical event — nothing
// happens to `θₖ` — it is a bookkeeping and UI event", and the app must "either **refuse** the
// crossing or **change sheet and say so**, with the multiplicative factor shown … Silently
// continuing is the misconception generator." The app has refused since M4.1; this is the half that
// was missing, because a refusal that does not say what the crossing would cost teaches nothing
// about why the contour may not go there.
//
// **AND IN BOTH FORMS, WHICH IS THE PEDAGOGY AND NOT A FLOURISH.** §3.4: with the cut on `ℝ₊` and
// `arg z ∈ (0, 2π)`, `f(x − i0) = e^{2πi(α−1)} f(x + i0) = e^{2πiα} f(x + i0)`. The two exponents
// are EQUAL, since `e^{−2πi} = 1` — the first is the literal form coming from the exponent the
// integrand actually has, the second the reduced one. Show only the reduced form and students
// "mis-generalise it to `x^s` integrands, where the factor is `e^{2πis}` and the `−1` does not
// appear". So both are printed, together with the reason they are the same number.
//
// **A LOG DOES NOT MULTIPLY.** Its monodromy is additive — `log(x − i0) = log(x + i0) + 2πi` — and
// of infinite order, which is the same fact that forbids it a bounded cut (`admissibility.ts` rule
// (c)) and the same fact that makes `jumpWeights` report `null` for its side. Writing that crossing
// as `exp(2πi·something)` is a type error, which D4's own record says out loud; so the two cases are
// different shapes here rather than one shape with a flag, and the additive one carries no factor to
// print.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { LATEX } from "../notation.js";
import { exact, type Certificate } from "@cas/rigor";
import { formatFrac, formatSqrtExt } from "../formatExact.js";
import { Exponent } from "../exponent.js";
import { jumpWeights } from "./correction.js";
import type { BranchChoice } from "./model.js";

/** `f` on the far side of the cut, relative to `f` on this side. */
export type CrossingMonodromy =
  | {
      readonly kind: "multiplicative";
      readonly cut: string;
      /** The arc's jump weight `J = Σ α` over one side, exactly — `jumpWeights`' own number. */
      readonly jump: Frac;
      /** `2πi·J`, in the output basis, so the fold below is the basis's and not a special case. */
      readonly exponent: Exponent;
      /** `e^{2πi·J}` with `J` exactly as the integrand's exponent gives it. */
      readonly literal: string;
      /** The same number with the integer part of `J` dropped. Equal, because `e^{−2πi} = 1`. */
      readonly reduced: string;
      /** `1`, `i`, `−1` or `−i` when `4J ∈ ℤ`; null when the factor is not algebraic in ℚ(i). */
      readonly value: SqrtExt | null;
      /** One line, renderable: what the integrand becomes across this cut. */
      readonly detail: string;
      readonly certificate: Certificate;
    }
  | {
      readonly kind: "additive";
      readonly cut: string;
      readonly detail: string;
      readonly certificate: Certificate;
    };

/** `J` reduced into `[0, 1)` — the same point of the circle, written the other way. */
const reduce = (j: Frac): Frac => {
  const floor = j.n < 0n ? -((-j.n + j.d - 1n) / j.d) : j.n / j.d;
  return j.sub(Frac.of(floor));
};

const asFactor = (j: Frac): { exponent: Exponent; value: SqrtExt | null } => {
  // `e^{2πi·J}` is `e^{iπ·(2J)}`, so the exponent is `π` times the Gaussian `2J·i` and the fold is
  // `Exponent.asAlgebraicFactor`'s: it cycles through 1, i, −1, −i whenever `4J ∈ ℤ`, which is
  // every jump weight tier D has. Nothing here special-cases a value.
  const twice = j.mul(Frac.of(2n));
  const exponent = Exponent.piTimes(new Gauss(Frac.ZERO, twice));
  return { exponent, value: exponent.asAlgebraicFactor() };
};

/**
 * What crossing `cutId` multiplies the integrand by — or that it adds, for a log.
 *
 * Null when the cut does not exist, or when its jump weight is an integer: then there is no
 * discontinuity to cross at all, which is admissibility's own arithmetic (research 06 §5.1's last
 * paragraph — "a candidate arc is a real cut iff its jump weight is ∉ ℤ") and the reason a factor
 * of 1 must not be announced as one.
 */
export function crossingMonodromy(branch: BranchChoice, cutId: string): CrossingMonodromy | null {
  const weights = jumpWeights(branch);
  if (!weights.has(cutId)) return null;
  const jump = weights.get(cutId);

  if (jump === null) {
    const detail =
      `crossing '${cutId}' adds $2\\pi i$ to the logarithm: its monodromy has infinite order, so no ` +
      "factor multiplies the integrand and no sheet count closes the loop";
    return {
      kind: "additive",
      cut: cutId,
      detail,
      certificate: exact(detail, "$\\log(x - i0) = \\log(x + i0) + 2\\pi i$"),
    };
  }
  if (jump === undefined || jump.d === 1n) return null; // integral weight: no discontinuity here

  const { exponent, value } = asFactor(jump);
  const reduced = reduce(jump);
  const literal = `e^{2\\pi i \\cdot ${formatFrac(jump, LATEX)}}`;
  const reducedText = `e^{2\\pi i \\cdot ${formatFrac(reduced, LATEX)}}`;
  const asNumber = value === null ? "" : ` = ${formatSqrtExt(value, LATEX)}`;
  const detail =
    `crossing '${cutId}' multiplies the integrand by $${literal}${asNumber}$` +
    (reduced.equals(jump) ? "" : `, which is $${reducedText}$ with the integer part of $J$ dropped`);

  return {
    kind: "multiplicative",
    cut: cutId,
    jump,
    exponent,
    literal,
    reduced: reducedText,
    value,
    detail,
    certificate: exact(detail, "the jump across the cut is $e^{2\\pi i \\sum\\alpha}$, over the arc's \"from\" side", {
      provenance: [
        { ok: true, text: `$J = ${formatFrac(jump, LATEX)}$, exactly — $\\sum\\alpha$ over the arc's "from" side` },
        // BOTH forms, and the reason they agree. Dropping the integer part is what turns D1's
        // literal `e^{2πi(α−1)}` into the textbook `e^{2πiα}`, and a reader who only ever sees the
        // second carries it over to an `x^s` integrand where the `−1` is not there to cancel.
        {
          ok: true,
          text: reduced.equals(jump)
            ? `$${literal}$ is already reduced: $J \\in [0, 1)$`
            : `$${literal} = ${reducedText}$, because $e^{-2\\pi i} = 1$ — the same number, and the literal form is the one the integrand's exponent gives`,
        },
        ...(value === null
          ? [{ ok: true, text: "$4J \\notin \\mathbb{Z}$, so the factor is carried as an exponential rather than folded" }]
          : [{ ok: true, text: `$4J \\in \\mathbb{Z}$, so the factor folds to $${formatSqrtExt(value, LATEX)}$ in $\\mathbb{Q}(i)$` }]),
      ],
    }),
  };
}

/**
 * Every cut's crossing factor, in the order the cuts are declared.
 *
 * For the readout and the refusal alike: a system with two cuts has two answers, and picking one to
 * print would make the app's sentence depend on which cut the reader happened to drag.
 */
export const allCrossingMonodromy = (branch: BranchChoice): readonly CrossingMonodromy[] =>
  branch.cuts.map((cut) => crossingMonodromy(branch, cut.id)).filter((m): m is CrossingMonodromy => m !== null);

/**
 * The certificate for the OTHER half of north-star #3 — "nothing changes".
 *
 * `∮γ f dz` does not depend on where an admissible cut system runs, so long as it never meets `γ`.
 * The reason is the correction itself: `f_Γ = f_Γ' · exp(2πi·[m_Γ − m_Γ'])` and `m` is a count of
 * jump-weighted crossings of `[z₀, z]`, so deforming Γ without touching γ changes no crossing count
 * at any point OF γ and leaves the integrand there pointwise identical. Not approximately equal —
 * identical, which is why this is stated as a certificate rather than left for a reader to infer
 * from a number that does not move.
 *
 * **The invariance is what makes the jump meaningful.** If the value drifted as the cut was dragged,
 * a jump on crossing would be one more wobble; because it is exactly constant until the crossing,
 * the jump is the whole content of the monodromy.
 */
export const cutGeometryInvariance = (cuts: number): Certificate =>
  exact(
    "∮ is invariant under any deformation of the cut system that keeps it clear of the contour",
    "the correction is a count of jump-weighted crossings of [z₀, z], so a deformation that never meets γ changes no crossing count at any point of γ and the integrand there is pointwise identical",
    {
      provenance: [
        { ok: true, text: `${cuts} cut(s), none of which meets the contour` },
        {
          ok: true,
          text: "so dragging a cut moves the picture's seam and not the answer — until it crosses the contour, where the factor above applies",
        },
      ],
    },
  );
