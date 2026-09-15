// `∮ e^{az}·R(e^z) dz = 2πi Σ n(γ,zₖ)·Res(f,zₖ)` — the residue theorem on a quasi-periodic strip.
//
// The theorem is the ordinary one; what is different is the singular set. `e^z = ρ` has infinitely
// many solutions, so `f` has a vertical LATTICE of poles rather than finitely many, and any honest
// application has to say which of them the contour encloses and why the rest cannot matter
// (`kernel/expLattice.ts`).
//
// **THE RECORD DECLARES THE STRIP, AND THIS CHECKS IT.** The declared height picks the poles that
// enter the sum; the poles just outside it — the MARGIN — are then asked for their winding numbers
// too, and any one of them the contour actually encloses REFUSES the whole computation. Without
// that, a contour dragged a period upwards would quietly sum the wrong lattice points and report a
// number with nothing wrong on its face. The check costs one winding query per margin pole and turns
// "the strip is what the record says" from an assumption into a row.
//
// It is E1's `wrong-strip-height` trap read at run time rather than at load time: "*Height 4π here
// reproduces with λ² but encloses z = iπ and z = 3iπ*". A record whose strip and whose contour
// disagree is not a record with a small error in it; it is two different arguments.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { LATEX } from "../kernel/notation.js";
import { assembleVerdict, exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatTwoPiIExpSum } from "../kernel/expSum.js";
import type { LatticePole } from "../kernel/expLattice.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import { windingNumber } from "../kernel/winding.js";
import type { ContourIntegral } from "./contour/integrate.js";
import { checkAgainstQuadrature, type ResidueTheoremResult } from "./residueTheorem.js";

/** `2πi` in units of π, i.e. `2i` — what the solve multiplies the residue sum by. */
const TWO_I = SqrtExt.fromGauss(new Gauss(Frac.ZERO, Frac.of(2n)));

export interface StripTheoremInput {
  /** The poles inside the DECLARED strip, with exact residues. */
  readonly poles: readonly LatticePole[];
  /**
   * Lattice poles just OUTSIDE the declared strip.
   *
   * Not summed. Asked for their winding numbers, so that a contour enclosing one refuses rather than
   * silently summing a set the record did not declare.
   */
  readonly margin: readonly LatticePole[];
  readonly integral: ContourIntegral;
  /**
   * The resolved contour — needed only to ASK the winding question at each MARGIN pole.
   *
   * `integral.windings` covers the poles that were handed to the quadrature, which are the strip's
   * own; a margin pole is deliberately not among them (it must not be summed, and a "pole on the
   * contour" refusal about one would be about the wrong contour). So the check has to compute its
   * winding directly — the same reason `branchTheorem` takes `pieces` for its cyclotomic roots.
   */
  readonly pieces: readonly Resolved[];
  /** `polesInStrip`'s own certificate, carried through so the derivation can show the substitution. */
  readonly certificate: Certificate;
}

export function applyStripTheorem(input: StripTheoremInput): ResidueTheoremResult {
  const { poles, margin, integral, pieces, certificate } = input;
  const certificates: Certificate[] = [certificate];

  if (!integral.closed) {
    return {
      verdict: assembleVerdict([
        refuse("the residue theorem", "it applies to a closed contour, and this one is not closed"),
      ]),
    };
  }

  const windingOf = (at: Cx): { n: number; decided: boolean } => {
    const w = integral.windings.find((x) => Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < 1e-9);
    return w === undefined ? { n: 0, decided: false } : { n: w.n, decided: w.decided };
  };

  for (const outside of margin) {
    // Computed here rather than looked up: see `pieces`. A margin pole whose winding cannot be
    // DECIDED is itself a refusal — it means the contour passes through a lattice point the record
    // did not declare, which is worse than enclosing one.
    const w = windingNumber(pieces, [outside.at[0], outside.at[1]]);
    if (!w.decided) {
      return {
        verdict: assembleVerdict([
          refuse(
            "∮ f dz",
            `the winding about z = 2πi·${outside.turns.n}/${outside.turns.d} — a lattice pole just outside the declared ` +
              "strip — could not be decided, so the contour may pass through it",
          ),
        ]),
      };
    }
    if (w.n !== 0) {
      return {
        verdict: assembleVerdict([
          refuse(
            "∮ f dz",
            `the contour encloses z = 2πi·${outside.turns.n}/${outside.turns.d}, which lies OUTSIDE the declared strip — ` +
              "so the declared strip is not the set of poles this contour actually catches, and summing the " +
              "declared ones would report a number for a different contour",
          ),
        ]),
      };
    }
  }

  let sum = ExpSum.ZERO;
  let counted = 0;
  for (const pole of poles) {
    const w = windingOf(pole.at);
    if (!w.decided) {
      return {
        verdict: assembleVerdict([
          refuse("$\\oint_\\gamma f(z)\\,dz$", "the winding number about a pole of the strip was not decided, so its residue cannot be weighted"),
        ]),
      };
    }
    if (w.n === 0) continue;
    sum = sum.add(pole.residue.scale(SqrtExt.fromGauss(Gauss.int(w.n))));
    counted += 1;
  }

  const residueSum = sum.foldSigns();
  const piUnits = residueSum.scale(TWO_I);
  const [re, im] = piUnits.toTuple();

  certificates.push(
    exact(
      `∮ = 2πi Σ n(γ,zₖ)·Res(f,zₖ) over ${counted} pole${counted === 1 ? "" : "s"} of the strip`,
      "$w = e^z$ makes $f$ rational in $w$; each root of $D(w)$ generates a vertical lattice, and the declared strip selects finitely many of them",
      {
        provenance: [
          {
            ok: true,
            text: `${margin.length} lattice pole${margin.length === 1 ? "" : "s"} just outside the strip were asked for their winding numbers and enclose nothing`,
          },
          {
            ok: true,
            text: "each residue is $\\operatorname{Res}_w(N/D, w_0)/w_0$ times $e^{az_0}$, exact in $\\mathbb{Q}(i)(\\sqrt{d}) \\times e^{\\mathbb{Q}(i)\\pi}$",
          },
        ],
      },
    ),
  );

  const value: Cx = [Math.PI * re, Math.PI * im];
  const text = formatTwoPiIExpSum(residueSum);
  const latex = formatTwoPiIExpSum(residueSum, LATEX);
  const check = checkAgainstQuadrature(value, text, integral);
  if (check?.contradiction !== undefined) certificates.push(check.contradiction);

  return {
    exactValue: { value, text, latex },
    piUnits,
    ...(check === null ? {} : { disagreement: check.disagreement, agrees: check.agrees }),
    ...(check?.agrees === true ? { crossCheck: check.crossCheck } : {}),
    verdict: assembleVerdict(certificates),
  };
}
