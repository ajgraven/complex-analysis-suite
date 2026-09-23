// `∮ R(z)·log^m z dz = 2πi Σ n(γ,zₖ)·Res(R log^m, zₖ)` — the residue theorem with a log factor.
//
// The same two departures from `residueTheorem.ts` as the power case, for the same reasons, and one
// that is different.
//
// **THE BRANCH POINT IS NOT A POLE.** `log^m z` has a branch point at the origin, not a pole: there
// is no Laurent series there and no residue to take. So the singular set is the poles of the
// RATIONAL COFACTOR `R`, and the log enters at each of them — never as a singularity of its own.
//
// **THERE IS NO QUADRATURE CROSS-CHECK.** Sampling `log^m z` needs a determination, and a compiled
// evaluator uses the principal one — which disagrees with the keyhole's `[0, 2π)` on the whole lower
// half-plane. A check that compares an answer against a different branch of the integrand is not a
// second opinion, it is a second question.
//
// **THE VALUE IS NOT IN UNITS OF π.** Tiers A–C divide π out because every contribution there is π
// times an algebraic number. A log family's residues are polynomials in π of degree up to `m`, so
// there is no single power to divide out, and the value comes back as an element of ℚ(i)(π) —
// `exactInPi` rather than `piUnits`. That is the same ring the family's `M` lives in, which is why
// Pass 5 can solve the two together without leaving exact arithmetic.
import { Gauss, Frac, toExactRational } from "@cas/exact";
import { LATEX } from "../kernel/notation.js";
import { assembleVerdict, exact, refuse, type Certificate } from "@cas/rigor";
import { logResidue, type LogFactor } from "../kernel/logResidue.js";
import { RatPi, formatRatPi } from "../kernel/ratPi.js";
import type { Node } from "@cas/expr";
import type { PoleReport } from "../kernel/poles.js";
import type { ContourIntegral } from "./contour/integrate.js";
import { checkAgainstQuadrature, type ResidueTheoremResult } from "./residueTheorem.js";

/** `2πi`, as an element of ℚ(i)(π). */
const TWO_PI_I = RatPi.piPower(1, new Gauss(Frac.ZERO, Frac.of(2n)));

export interface LogTheoremInput {
  /** The poles of the RATIONAL cofactor `R`, exactly — not of `R·log^m z`. */
  readonly poles: PoleReport;
  /** The winding numbers the contour integral already decided, by exact-sign predicates. */
  readonly integral: ContourIntegral;
  readonly factor: LogFactor;
  /** The rational cofactor's AST — the residue needs its whole principal part, not just its poles. */
  readonly rational: Node;
}

const declined = (reason: string, also?: Certificate): ResidueTheoremResult => ({
  verdict: assembleVerdict(also === undefined ? [refuse("$\\oint_\\gamma f(z)\\,dz$", reason)] : [refuse("$\\oint_\\gamma f(z)\\,dz$", reason), also]),
});

export function applyLogTheorem(input: LogTheoremInput): ResidueTheoremResult {
  // As in `branchTheorem.ts`, and for the same reason: five of the six routes have stated this
  // since they were written and these two did not, so an open contour reached an `exactValue` for a
  // theorem that does not apply (2026-09-20 review).
  if (!input.integral.closed) {
    return declined("it applies to a closed contour, and this one is not closed");
  }

  const split = toExactRational(input.rational);
  if (!split.ok) {
    return declined(`the rational cofactor is not an exact rational function: ${split.reason}`);
  }
  const { num, den } = split.value;

  const exactPoles = input.poles.exactPoles;
  if (exactPoles === undefined || !input.poles.exactlyComplete) {
    return declined(
      "the rational cofactor's poles were not all pinned exactly, so log z₀ cannot be evaluated in the declared determination",
    );
  }

  const windingOf = (at: readonly [number, number]): { n: number; decided: boolean } => {
    const w = input.integral.windings.find((x) => Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < 1e-9);
    return w === undefined ? { n: 0, decided: false } : { n: w.n, decided: w.decided };
  };

  const certificates: Certificate[] = [];
  let sum = RatPi.ZERO;
  let counted = 0;
  for (const pole of exactPoles) {
    const w = windingOf(pole.at.toTuple());
    if (!w.decided) {
      return declined(
        "the winding number about a pole of the rational cofactor was not decided, so its residue cannot be weighted",
      );
    }
    if (w.n === 0) continue;
    const at = pole.at.asGauss();
    if (at === null) {
      return declined(
        `the pole ${pole.at.toTuple().join(" + ")}i lies in a quadratic extension of ℚ(i), and the log residue is assembled from a Laurent expansion over ℚ(i)`,
      );
    }
    const residue = logResidue(num, den, at, input.factor);
    if (!residue.ok) return declined(residue.reason, residue.certificate);
    certificates.push(residue.certificate);
    sum = sum.add(residue.value.mul(RatPi.fromGauss(Gauss.int(w.n))));
    counted += 1;
  }

  const value = TWO_PI_I.mul(sum);
  const [re, im] = value.toNumber();

  certificates.push(
    exact(
      `∮ = 2πi Σ n(γ,zₖ)·Res(R log^${input.factor.power} z, zₖ) = ${formatRatPi(value)} over ${counted} pole${counted === 1 ? "" : "s"}`,
      "each pole of the rational cofactor contributes its Laurent principal part convolved with the expansion of log^m about it, in the declared determination",
      {
        provenance: [
          {
            ok: true,
            text: "the branch point at the origin is not a pole: there is no Laurent series at it and no residue to take",
          },
          {
            ok: false,
            text: "no quadrature cross-check: sampling log^m z needs a determination, and a compiled evaluator would use the principal branch and answer a different question",
          },
        ],
      },
    ),
  );

  const text = formatRatPi(value);
  const latex = formatRatPi(value, LATEX);
  // **THE CROSS-CHECK, WHICH THIS ROUTE COULD NEVER HAVE (M5.0).** The quadrature was skipped for
  // every branch record, so there was nothing to compare against and no comparison was written.
  // `kernel/branch/declared.ts` now samples the DECLARED determination, with each piece's `side`
  // pinning the limit on the cut — so two computations sharing no machinery (exact residues in the
  // output basis; floating Gauss–Legendre over the declared branch) can be put side by side, which
  // is what tiers A–C have always had and tier D never did.
  //
  // Corroboration never strengthens the label and a contradiction still refuses it —
  // `checkAgainstQuadrature`'s own contract, unchanged.
  const check = checkAgainstQuadrature([re, im], text, input.integral);
  if (check?.contradiction !== undefined) certificates.push(check.contradiction);

  return {
    exactValue: { value: [re, im], text, latex },
    exactInPi: value,
    ...(check === null ? {} : { disagreement: check.disagreement, agrees: check.agrees }),
    ...(check?.agrees === true ? { crossCheck: check.crossCheck } : {}),
    verdict: assembleVerdict(certificates),
  };
}
