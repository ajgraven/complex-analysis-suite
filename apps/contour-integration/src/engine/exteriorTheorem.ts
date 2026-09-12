// The residue theorem for a contour with a CUT INSIDE IT — of which the dogbone is the shape.
//
//     ∮γ f dz = 2πi [ Σₖ (n(γ,aₖ) − σ)·Res(f,aₖ)  −  σ·Res(f,∞) ],    σ = n(γ, branch point)
//
// **THE DOGBONE ENCLOSES NOTHING, AND IS NOT ZERO.** D6's first trap is this module's reason to
// exist: `n(D, ±ia) = 0` — the dogbone winds zero times about every pole — "and yet `∫_D f = 2T ≠ 0`.
// The residue theorem's hypothesis is not 'no poles inside' but 'holomorphic inside except at
// isolated singularities', and the CUT is inside." So `residueTheorem.ts` is not merely unhelpful
// here, it is INAPPLICABLE, and the number it would print (`2πi Σ 0·Res = 0`) is wrong. The two
// facts — *no pole is enclosed* and *the integral is not zero* — are reported as separate rows, and
// neither is ever allowed to imply the other (D7's `dogbone-alone-encloses-nothing` trap).
//
// WHERE THE IDENTITY COMES FROM, in one line each. `σ` is what the contour winds about the cut:
//
//   - `Z = γ − σ·C_R` winds `σ − σ = 0` about every point of the cut, so it is null-homologous in
//     the cut-free plane and the ORDINARY residue theorem applies to it — which is the only theorem
//     used anywhere in this file. Nothing new is assumed; a different cycle is chosen.
//   - `n(Z, aₖ) = n(γ,aₖ) − σ`, so `∮_Z f = 2πi Σ (nₖ − σ)·Res(f,aₖ)`.
//   - `∮_{C_R,ccw} f = −2πi·Res(f,∞)` is the DEFINITION of the residue at infinity, exact for every
//     `R` large enough to enclose the poles — not a limit, and not an approximation.
//   - Add `σ·∮_{C_R}` back. The crosscut's two traversals cancel because `f` is single-valued along
//     the route chosen for them.
//
// **σ = 0 GIVES THE RESIDUE THEOREM BACK**, which is the check that the weights are the right ones:
// a keyhole leaves its branch point outside, and this formula then reduces term by term to
// `2πi Σ nₖ·Res` with no residue at infinity in it. The general form is not a generalisation for its
// own sake — it is what makes `− σ` falsifiable, since a rational integrand can never see `σ` in the
// ANSWER (see below) but can see the pole weights immediately.
//
// **`Res(f,∞)` IS THE OUTER CIRCLE**, which is why the dogbone template has no fifth piece: drawing
// `C_R` would make it two disjoint loops called one path, and would make every winding number `1` —
// the one fact D6 exists to deny. D7 is where the choice has teeth: its `Res(f,∞)` carries a term of
// magnitude 18.9 in an answer of magnitude 1.2, so the row is most of the identity and an app that
// quietly dropped it would be wrong by an order of magnitude while still printing a real number.
//
// **WHAT A RATIONAL INTEGRAND CANNOT TEST.** `Σ_all Res + Res(f,∞) = 0` for every rational `f`, so
// the whole `σ`-dependent part of the identity — `−σ·(Σ Res + Res(f,∞))` — vanishes identically and
// the answer is `2πi Σ nₖ·Res` whatever `σ` is. The pole weights and the residue at infinity are each
// falsified by a rational fixture against the quadrature; **the SIGN of `σ` is not**, and pretending
// otherwise would be worse than saying so. What pins it is D6, whose answer is `π/(a√(1+a²))` and
// whose contour is clockwise. Until then `σ` is MEASURED rather than assumed — by the same exact-sign
// predicate every other winding number uses — and it is derived once and used for both the arithmetic
// and the sentence, so the two cannot drift apart.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { assembleVerdict, exact, refuse, type Certificate } from "@cas/rigor";
import type { Node } from "@cas/expr";
import { ExpSum, formatExpSum, formatTwoPiIExpSum } from "../kernel/expSum.js";
import { residueAtInfinityOf, type ResidueAtInfinity } from "../kernel/atInfinity.js";
import { exponentSum, multiBranchResidue, type MultiPowerFactor } from "../kernel/branchResidue.js";
import { toExactRational } from "../kernel/exactRational.js";
import { formatFrac, formatSqrtExt } from "../kernel/formatExact.js";
import type { BranchChoice } from "../kernel/branch/model.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import { windingNumber } from "../kernel/winding.js";
import type { ContourIntegral } from "./contour/integrate.js";
import { checkAgainstQuadrature, type ResidueTheoremResult } from "./residueTheorem.js";

/** `2πi` in units of π, i.e. `2i` — what the solve multiplies the residue sum by. */
const TWO_I = SqrtExt.fromGauss(new Gauss(Frac.ZERO, Frac.of(2n)));

/** An integer with the app's real minus sign, through the one place that owns it. */
const int = (n: number): string => formatFrac(Frac.of(BigInt(n)));

/**
 * What this module applies, in the form the derivation panel states it.
 *
 * Carried on EVERY return, refusals included: a reader who sees the argument stop needs to know which
 * equation it stopped inside, and a refusal labelled with the plain residue theorem would send them
 * looking for the wrong mistake.
 */
const EXTERIOR_IDENTITY = "∮ f dz = 2πi [ Σₖ (n(γ,aₖ) − σ)·Res(f,aₖ) − σ·Res(f,∞) ],  σ = n(γ, branch point)";

export interface ExteriorTheoremInput {
  /** The poles of the integrand (or, with a branch factor, of its rational cofactor), exactly. */
  readonly poles: PoleReport;
  readonly integral: ContourIntegral;
  /** The resolved contour — the dogbone itself, for the winding question at each branch point. */
  readonly pieces: readonly Resolved[];
  /**
   * The cut system. Required, and not for bookkeeping: the exterior identity is the one that applies
   * when the CUT is inside the contour, and with no cut there is nothing inside to make the ordinary
   * residue theorem fail. Its branch points are also what `σ` is measured at.
   */
  readonly branch: BranchChoice;
  /** The rational integrand (or cofactor) as an AST — what `Res(f,∞)` is read off. */
  readonly rational: Node;
  /**
   * The multi-point branch factor `c·∏(z − bⱼ)^{αⱼ}`, when the integrand carries one.
   *
   * This is the dogbone's own case and the reason the module exists: D6's `√(1−z²)` has TWO branch
   * points, and it is the pair of them summing to an integer exponent that makes the bounded cut — and
   * therefore this contour — legal at all. Present, every residue is `(the factor at z₀)·Res(R, z₀)`
   * and `Σ αⱼ` is what the order at infinity reads.
   */
  readonly multi?: MultiPowerFactor;
  /**
   * The branch factor's kind, when the integrand has one — and the reason this refuses.
   *
   * A `z^α` or `log^m z` factor on an exterior contour is D6 and D7, and both need a residue reader
   * this does not have yet: `z₀^α` in a determination pinned by a cut with TWO branch points, where
   * the individual arguments are not rational multiples of π and only the weighted sum is. Refusing
   * by name is the point — the alternative is summing `Res(R, z₀)` without the branch factor and
   * printing a plausible, wrong number.
   */
  readonly factor?: { readonly kind: "power" | "log" };
}

/**
 * Does this contour have (part of) the cut inside it?
 *
 * The routing question, and it is GEOMETRIC: a keyhole's `n(γ, 0) = +1 − 1 = 0` leaves its branch
 * point outside and takes the ordinary route, a dogbone's `n(D, ±1) = −1` does not. An undecided
 * winding counts as "yes" on purpose — the contour is then sitting on a branch point, and a refusal
 * naming it beats the ordinary theorem quietly answering for a picture it does not describe.
 */
export function enclosesTheCut(pieces: readonly Resolved[], branch: BranchChoice): boolean {
  return branch.points.some((point) => {
    const w = windingNumber(pieces, point.at);
    return !w.decided || w.n !== 0;
  });
}

/**
 * Apply the exterior residue theorem to a contour that hugs a cut.
 *
 * Shaped as a {@link ResidueTheoremResult} so the ledger's COVER row, Pass 5 and the derivation panel
 * read it exactly as they read the other three theorems.
 */
export function applyExteriorTheorem(input: ExteriorTheoremInput): ResidueTheoremResult {
  const { poles, integral, pieces, branch, rational } = input;
  const certificates: Certificate[] = [];

  if (!integral.closed) {
    return {
      identity: EXTERIOR_IDENTITY,
      verdict: assembleVerdict([
        refuse(
          "the exterior residue theorem",
          "it applies to a closed contour, and this one is not closed",
        ),
      ]),
    };
  }
  if (input.factor !== undefined && input.multi === undefined) {
    return {
      identity: EXTERIOR_IDENTITY,
      verdict: assembleVerdict([
        refuse(
          "the exterior residue theorem",
          `the contour encloses the cut and the integrand carries a ${input.factor.kind === "power" ? "z^α" : "log^m z"} factor, whose residues need the determination pinned by a cut with two branch points — that reader is not built yet, and summing the cofactor's residues without the factor would print a plausible wrong number`,
        ),
      ]),
    };
  }
  if (poles.exponentialFrequency !== undefined) {
    return {
      identity: EXTERIOR_IDENTITY,
      verdict: assembleVerdict([
        refuse(
          "the exterior residue theorem",
          "f carries a factor e^{iaz}, which is essentially singular at infinity: it has no Laurent expansion there and no residue at infinity to add",
        ),
      ]),
    };
  }

  const orientation = orientationAbout(pieces, branch);
  if (!orientation.ok) return { identity: EXTERIOR_IDENTITY, verdict: assembleVerdict([refuse("the exterior residue theorem", orientation.reason)]) };
  certificates.push(orientation.certificate);
  const sigma = orientation.sigma;

  const weighted = weighPoles(poles, pieces, sigma, input.multi);
  if (!weighted.ok) return { identity: EXTERIOR_IDENTITY, verdict: assembleVerdict([refuse("the exterior residue theorem", weighted.reason)]) };
  certificates.push(weighted.certificate, ...weighted.residues);

  const split = toExactRational(rational);
  if (!split.ok) {
    return {
      identity: EXTERIOR_IDENTITY,
      verdict: assembleVerdict([
        refuse("Res(f, ∞)", `the rational cofactor is not a quotient of polynomials over ℚ(i): ${split.reason}`),
      ]),
    };
  }
  const atInfinity: ResidueAtInfinity = residueAtInfinityOf(
    split.value.num,
    split.value.den,
    input.multi === undefined ? Frac.ZERO : exponentSum(input.multi),
  );
  certificates.push(atInfinity.certificate);
  if (!atInfinity.ok || atInfinity.value === undefined) {
    return {
      identity: EXTERIOR_IDENTITY,
      verdict: assembleVerdict([
        ...certificates,
        refuse("the exterior residue theorem", atInfinity.ok ? "Res(f, ∞) is not known exactly" : atInfinity.reason),
      ]),
    };
  }

  // `Σ (nₖ − σ)·Res(f,aₖ) − σ·Res(f,∞)`, in that order and with no second copy of either weight:
  // `sigma` is read once, above, and both halves of the identity are built from it here.
  const atInf = SqrtExt.fromGauss(atInfinity.value);
  const sum = weighted.sum.add(ExpSum.fromSqrtExt(sigma === 0 ? SqrtExt.ZERO : atInf.mul(SqrtExt.fromGauss(Gauss.int(-sigma)))));

  const piUnits = sum.scale(TWO_I);
  const [re, im] = piUnits.toTuple();
  const value: Cx = [Math.PI * re, Math.PI * im];
  const text = formatTwoPiIExpSum(sum);

  certificates.push(
    exact(
      `∮ f dz = 2πi [ Σ (n(γ,aₖ) − σ)·Res(f,aₖ) − σ·Res(f,∞) ] = ${text}`,
      "the ORDINARY residue theorem applied to γ − σ·C_R, which winds zero times about the cut and is therefore null-homologous in the cut-free plane; ∮_{C_R,ccw} = −2πi·Res(f,∞) by definition",
      {
        provenance: [
          {
            ok: true,
            text: `σ = ${int(sigma)}, Σ Res over the ${weighted.count} finite pole${weighted.count === 1 ? "" : "s"} = ${weighted.plainText}, and Res(f,∞) = ${formatSqrtExt(atInf)} is the outer circle exactly, not an estimate of it`,
          },
          {
            ok: true,
            text: "no pole is enclosed AND the integral is not zero: two rows, and neither implies the other — the hypothesis that fails is holomorphy, because the CUT is inside",
          },
          {
            ok: sigma === 0,
            text:
              sigma === 0
                ? "σ = 0: the cut is outside, every weight is n(γ,aₖ) and the residue at infinity drops out — this IS the residue theorem, recovered rather than restated"
                : "σ is measured at the BRANCH POINTS; that the contour winds the same way about every point of the cut between them is LEGALITY's business, which refuses an untagged crossing",
          },
          {
            ok: false,
            text: "the crosscut is not drawn: its two traversals cancel because f is single-valued along them, which is a fact about the route chosen (clear of the cut), not about every route",
          },
        ],
      },
    ),
  );

  const check = checkAgainstQuadrature(value, text, integral);
  if (check?.contradiction !== undefined) certificates.push(check.contradiction);

  return {
    exactValue: { value, text },
    piUnits,
    identity: EXTERIOR_IDENTITY,
    ...(check === null ? {} : { disagreement: check.disagreement, agrees: check.agrees }),
    ...(check?.agrees === true ? { crossCheck: check.crossCheck } : {}),
    verdict: assembleVerdict(certificates),
  };
}

type Orientation =
  | { readonly ok: true; readonly sigma: number; readonly certificate: Certificate }
  | { readonly ok: false; readonly reason: string };

/**
 * `σ = n(D, b)` at the branch points — which is to say, "is the cut inside, and which way round?"
 *
 * Every branch point must give the SAME `σ`, because a cut whose two ends are wound differently is
 * not hugged by this contour at all: the contour separates the branch points, some of the cut is
 * inside it and some is outside, and no exterior identity holds. Requiring agreement is what turns
 * that into a refusal instead of an answer computed from half a picture.
 */
function orientationAbout(pieces: readonly Resolved[], branch: BranchChoice): Orientation {
  if (branch.points.length === 0) {
    return {
      ok: false,
      reason:
        "there are no branch points, so there is no cut inside the contour and nothing for the exterior identity to repair — the ordinary residue theorem applies",
    };
  }
  let sigma: number | null = null;
  for (const point of branch.points) {
    const w = windingNumber(pieces, point.at);
    if (!w.decided) {
      return {
        ok: false,
        reason: `the winding number about the branch point ${point.label} could not be decided (${w.reason}) — move the contour clear of it, or move the branch point (for a dogbone: shrink η)`,
      };
    }
    if (sigma === null) sigma = w.n;
    else if (w.n !== sigma) {
      return {
        ok: false,
        reason: `the contour has winding ${int(sigma)} about one branch point and ${int(w.n)} about ${point.label}: it separates the ends of the cut instead of hugging it, so part of the cut is inside it and part outside, and no single σ describes the picture`,
      };
    }
  }
  if (sigma === null) return { ok: false, reason: "there are no branch points to measure σ at" };
  return {
    ok: true,
    sigma,
    certificate: exact(
      sigma === 0
        ? "the contour leaves the cut outside (σ = 0 at every branch point)"
        : `the contour encloses the cut ${sigma < 0 ? "clockwise" : "anticlockwise"} (σ = ${int(sigma)} at every branch point)`,
      "exact-sign crossing count at each branch point, the same predicate every winding number uses",
      {
        provenance: [
          {
            ok: true,
            text: "σ is MEASURED, not assumed — and it is read once, so the arithmetic and the sentence cannot disagree about it",
          },
          {
            ok: false,
            text: "a rational integrand cannot falsify the SIGN of σ: Σ Res + Res(f,∞) = 0 for such an f, so the whole σ-dependent term vanishes whatever σ is. D6 is what pins it",
          },
        ],
      },
    ),
  };
}

type Weighed =
  | {
      readonly ok: true;
      /** `Σ (n(γ,aₖ) − σ)·Res(f,aₖ)`, exact. */
      readonly sum: ExpSum;
      /** `Σ Res(f,aₖ)` unweighted, for the sentence — branch factor included, since that is what `f` is. */
      readonly plainText: string;
      readonly count: number;
      readonly certificate: Certificate;
      /** One per pole when a branch factor is present: what its value there was, and why. */
      readonly residues: readonly Certificate[];
    }
  | { readonly ok: false; readonly reason: string };

/**
 * `Σ (n(γ,aₖ) − σ)·Res(f,aₖ)`, and the row that says how many poles the contour actually encloses.
 *
 * The two are deliberately different numbers. D6's whole picture is `n = 0` at every pole with a
 * non-zero answer, and D7's `dogbone-alone-encloses-nothing` trap asks for the enclosed count and the
 * value as SEPARATE rows so that neither can be read off the other — so the certificate reports the
 * count and says, in as many words, that it implies nothing about the value.
 */
function weighPoles(
  poles: PoleReport,
  pieces: readonly Resolved[],
  sigma: number,
  multi?: MultiPowerFactor,
): Weighed {
  const exactPoles = poles.exactPoles;
  if (exactPoles === undefined || !poles.exactlyComplete) {
    return {
      ok: false,
      reason: poles.rational
        ? "not every pole was pinned exactly, so Σ Res is not exact and the identity has nothing exact to add Res(f,∞) to"
        : "f is not a rational function of z, so its residues are not exact",
    };
  }
  let sum = ExpSum.ZERO;
  let plain = ExpSum.ZERO;
  let enclosed = 0;
  const certificates: Certificate[] = [];
  for (const pole of exactPoles) {
    const w = windingNumber(pieces, pole.at.toTuple());
    if (!w.decided) {
      return {
        ok: false,
        reason: `the winding number about the pole ${formatSqrtExt(pole.at)} could not be decided (${w.reason})`,
      };
    }
    if (w.n !== 0) enclosed += 1;
    // **THE BRANCH FACTOR IS NOT A SEPARATE STEP.** `Res(c·∏(z−bⱼ)^{αⱼ}·R, z₀)` is the factor's value
    // at `z₀` times `Res(R, z₀)`, because the factor is holomorphic and non-zero there — and its
    // value is the one question the determination decides. D6's second trap is the whole of it: the
    // branch pinned on the upper lip takes `+√(1+a²)` at `+ia` and `−√(1+a²)` at `−ia`, and using `+`
    // at both makes the residues cancel and returns 0 for an integral that is not 0.
    let residue = ExpSum.fromSqrtExt(pole.residue);
    if (multi !== undefined) {
      const withFactor = multiBranchResidue(pole, multi);
      if (!withFactor.ok) return { ok: false, reason: withFactor.reason };
      residue = withFactor.value;
      certificates.push(withFactor.certificate);
    }
    plain = plain.add(residue);
    const weight = w.n - sigma;
    if (weight !== 0) sum = sum.add(residue.scale(SqrtExt.fromGauss(Gauss.int(weight))));
  }
  return {
    ok: true,
    sum,
    residues: certificates,
    plainText: formatExpSum(plain.foldSigns()),
    count: exactPoles.length,
    certificate: exact(
      `n(γ, aₖ) ≠ 0 at ${enclosed} of the ${exactPoles.length} pole${exactPoles.length === 1 ? "" : "s"}`,
      "exact-sign crossing count at each pole",
      {
        provenance: [
          {
            ok: true,
            text: "this row says what is ENCLOSED and says nothing whatever about the value: the dogbone encloses nothing and its integral is not zero",
          },
          {
            ok: true,
            text: `each residue is weighted by n(γ,aₖ) − σ = n(γ,aₖ) − ${int(sigma)}, which is its winding about γ − σ·C_R`,
          },
        ],
      },
    ),
  };
}
