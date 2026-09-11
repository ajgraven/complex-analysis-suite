// `∮ z^α·R(z) dz = 2πi Σ n(γ,zₖ)·Res(z^α R, zₖ)` — the residue theorem with a branch factor.
//
// The theorem itself is unchanged; the poles and the residues are not. Two things differ from
// `residueTheorem.ts` and both come straight out of D1's traps.
//
// **THE BRANCH POINT IS NOT A POLE.** D1's `branch-point-is-not-a-pole` trap: "z = 0 is a BRANCH
// POINT of z^{α−1}, not a pole: there is no Laurent series there and no residue to take. […] Asking
// for Res(f, 0) is a category error, and a numeric residue routine will happily return a meaningless
// number from a circle that crosses the cut." So the singular set is the poles of the RATIONAL
// COFACTOR `R`, found exactly by the machinery that already exists, and the branch factor enters as
// a multiplier at each of them — never as a pole of its own.
//
// **THERE IS NO QUADRATURE CROSS-CHECK.** `residueTheorem.ts` corroborates its exact value against a
// numeric integral of the same contour, and that is the strongest evidence the app has. It is not
// available here: quadrature of `z^{α−1}` needs a determination of `z^{α−1}` at every sample, so a
// naive evaluator silently uses the PRINCIPAL branch and disagrees with the keyhole's declared
// `(0, 2π)` on the whole lower half-plane. A cross-check that compares an answer against a different
// branch of the integrand is not a second opinion, it is a second question — so this reports its
// exact value with no corroboration rather than with a misleading one. D3's `wedge-disagreement`
// trap describes the cross-check that IS available for a keyhole (the same integral by the `2π/n`
// wedge), and it is a job for M4.2e onward, not a float comparison.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { assembleVerdict, exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatTwoPiIExpSum } from "../kernel/expSum.js";
import { branchResidue, type PowerFactor } from "../kernel/branchResidue.js";
import { asCyclotomic, cyclotomicResidueSum } from "../kernel/cyclotomic.js";
import { toExactRational } from "../kernel/exactRational.js";
import type { Node } from "@cas/expr";
import type { PoleReport } from "../kernel/poles.js";
import type { ContourIntegral } from "./contour/integrate.js";
import type { Resolved } from "../kernel/geom.js";
import { windingNumber } from "../kernel/winding.js";
import type { ResidueTheoremResult } from "./residueTheorem.js";

/** `2πi` in units of π, i.e. `2i` — what the solve multiplies the residue sum by. */
const TWO_I = SqrtExt.fromGauss(new Gauss(Frac.ZERO, Frac.of(2n)));

export interface BranchTheoremInput {
  /** The poles of the RATIONAL cofactor `R`, exactly — not of `z^α R`. */
  readonly poles: PoleReport;
  /** The winding numbers the contour integral already decided, by exact-sign predicates. */
  readonly integral: ContourIntegral;
  readonly factor: PowerFactor;
  /**
   * The rational cofactor's AST, when the caller has it.
   *
   * Opens the cyclotomic route: for `1 + z^n` the residue sum has a closed form even where no
   * individual root is expressible, and D3's `n = 5` and `n = 7` fixtures reach their answers no
   * other way. Omitted, the per-pole route is the only one.
   */
  readonly rational?: Node;
  /** The resolved contour — needed only to ASK the winding question at each cyclotomic root. */
  readonly pieces?: readonly Resolved[];
}

/**
 * Apply the residue theorem to `z^α·R(z)`.
 *
 * Shaped as a {@link ResidueTheoremResult} so everything downstream — the ledger's COVER row, Pass
 * 5, the derivation panel — reads it exactly as it reads the rational case.
 */
export function applyBranchTheorem(input: BranchTheoremInput): ResidueTheoremResult {
  const { poles, integral, factor } = input;
  const certificates: Certificate[] = [];

  // THE CYCLOTOMIC ROUTE FIRST, because it needs strictly less. `Σₖ Res` over the roots of
  // `b_n z^n + b₀` has a closed form built from the structure alone, so it works where the poles are
  // not individually representable — which for D3 at `n = 5` and `n = 7` is the difference between
  // an exact answer and no answer at all.
  const cyclotomic = input.rational === undefined ? null : asCyclotomicCofactor(input.rational);
  if (cyclotomic !== null) {
    const enclosed = everyRootEnclosed(cyclotomic, input.pieces ?? []);
    if (enclosed !== null) {
      const sum = cyclotomicResidueSum(cyclotomic, factor.alpha, factor.argRange);
      if (!sum.ok) {
        return { verdict: assembleVerdict([refuse("∮ f dz", sum.reason), sum.certificate]) };
      }
      const piUnits = sum.value.scale(TWO_I);
      const [re, im] = piUnits.toTuple();
      return {
        exactValue: { value: [Math.PI * re, Math.PI * im], text: formatTwoPiIExpSum(sum.value) },
        piUnits,
        verdict: assembleVerdict([sum.certificate, enclosed]),
      };
    }
  }

  const exactPoles = poles.exactPoles;
  if (exactPoles === undefined || !poles.exactlyComplete) {
    const reason =
      "the rational cofactor's poles were not all pinned exactly, so z₀^α cannot be evaluated in the declared determination";
    return { verdict: assembleVerdict([refuse("∮ f dz", reason)]) };
  }

  const windingOf = (at: readonly [number, number]): { n: number; decided: boolean } => {
    const w = integral.windings.find(
      (x) => Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < 1e-9,
    );
    return w === undefined ? { n: 0, decided: false } : { n: w.n, decided: w.decided };
  };

  let sum = ExpSum.ZERO;
  let counted = 0;
  for (const pole of exactPoles) {
    const w = windingOf(pole.at.toTuple());
    if (!w.decided) {
      const reason = `the winding number about a pole of the rational cofactor was not decided, so its residue cannot be weighted`;
      return { verdict: assembleVerdict([refuse("∮ f dz", reason)]) };
    }
    if (w.n === 0) continue;
    const residue = branchResidue(pole, factor);
    if (!residue.ok) {
      return { verdict: assembleVerdict([refuse("∮ f dz", residue.reason), residue.certificate]) };
    }
    certificates.push(residue.certificate);
    sum = sum.add(residue.value.scale(SqrtExt.fromGauss(Gauss.int(w.n))));
    counted += 1;
  }

  // `foldSigns` on the way out, for the same reason the sine recogniser folds: a residue at `z₀ = −1`
  // carries `e^{iπα}`, and several of them can combine into a sign that belongs in the coefficient.
  const residueSum = sum.foldSigns();
  const piUnits = residueSum.scale(TWO_I);
  const [re, im] = piUnits.toTuple();

  certificates.push(
    exact(
      `∮ = 2πi Σ n(γ,zₖ)·Res(z^α R, zₖ) over ${counted} pole${counted === 1 ? "" : "s"}`,
      "the branch point carries no residue; each pole of the rational cofactor contributes z₀^α·Res(R, z₀) in the declared determination",
      {
        provenance: [
          { ok: true, text: "the branch point is NOT a pole: there is no Laurent series at it and no residue to take" },
          {
            ok: false,
            text: "no quadrature cross-check: sampling z^α needs a determination, and a naive evaluator would use the principal branch and answer a different question",
          },
        ],
      },
    ),
  );

  return {
    exactValue: { value: [Math.PI * re, Math.PI * im], text: formatTwoPiIExpSum(residueSum) },
    piUnits,
    verdict: assembleVerdict(certificates),
  };
}

/** The cofactor read as `1/(b_n z^n + b₀)`, or null. A numerator of degree > 0 is a different sum. */
function asCyclotomicCofactor(rational: Node): ReturnType<typeof asCyclotomic> {
  const split = toExactRational(rational);
  if (!split.ok) return null;
  if (split.value.num.degree() !== 0) return null;
  if (!split.value.num.coeff(0).equals(Gauss.ONE)) return null;
  return asCyclotomic(split.value.den);
}

/**
 * A certificate that the contour encircles every root exactly once — or null, meaning it does not.
 *
 * The residues stay symbolic; only the WINDING is asked of the geometry, and it is decided by the
 * same exact-sign predicates every other winding number uses. A keyhole with `ε < 1 < R` encloses
 * the whole unit circle, which is where these roots live, so this is a check rather than a hope: a
 * contour that missed one would produce a confident sum over poles it never enclosed.
 */
function everyRootEnclosed(
  form: NonNullable<ReturnType<typeof asCyclotomic>>,
  pieces: readonly Resolved[],
): Certificate | null {
  if (pieces.length === 0) return null;
  for (let k = 0; k < form.n; k++) {
    const theta = (Math.PI * (form.psi.toNumber() + 2 * k)) / form.n;
    const w = windingNumber(pieces, [Math.cos(theta), Math.sin(theta)]);
    if (!w.decided || w.n !== 1) return null;
  }
  return exact(
    `the contour encircles each of the ${form.n} roots exactly once`,
    "exact-sign crossing count at each root of the rotated n-gon",
    {
      provenance: [
        {
          ok: true,
          text: "the roots are located numerically only to ASK the winding question; their residues are never evaluated",
        },
      ],
    },
  );
}
