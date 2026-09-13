// `∮_{Γ_N} K·f dz = 2πi[ Σ_{|n|≤N} Res(K·f, n) + Σ_j Res(K·f, z_j) ]` — tier G's identity.
//
// The theorem is the ordinary residue theorem; what is different is the SINGULAR SET and what the
// identity is FOR. `π cot(πz)` has a pole at every integer, so the enclosed set grows with the
// contour, and the whole point is that the left-hand side tends to zero — so the identity is read
// backwards, as a statement about the sum on the right, and Pass 5's third route (`solveResidueTerm`)
// is what reads it that way.
//
// ── THE VALUE AT FINITE N IS `2πi[S_N − T]`, AND THAT IS WHY IT IS WORTH COMPUTING ────────────────
// `∮ → 0` is the limit; at the contour actually DRAWN it is `2πi` times the partial sum minus the
// infinite one, which is a number the quadrature can be asked about. So the tier gets the same
// independent corroboration every other tier has — and a strong one, because the two routes share
// nothing: one integrates four sides numerically, the other evaluates `2N+1` exact residues over ℚ(i)
// and a Möbius function of `e^{2πiz₀}`. It is the gallery's own `closedContour` probe, executed.
//
// ── ONE THING IT CANNOT DO: `piUnits` ─────────────────────────────────────────────────────────────
// Every other route reports the value in UNITS OF π, because every contribution is π times an
// algebraic number. Here the two halves carry different powers: `Res(K·f, n) = f(n)` is ALGEBRAIC (the
// kernel's π is spent on its own residue, `π·(1/π) = 1`) while `Res(K·f, z_j) = π·cot(πz_j)·Res(f,z_j)`
// carries one π and a quotient of exponentials besides. `solveResidueTerm.ts` has the finding in full:
// no ring in this app holds both, and none needs to, because Pass 5's third route reads the two halves
// separately. So this reports an exact value and an exact TEXT, and no `piUnits`.
//
// ── EVERY COFACTOR POLE MUST BE ENCLOSED, AND THAT IS CHECKED ─────────────────────────────────────
// `cofactorResidues` sums over all of them, unweighted — correct in the limit, which is what the
// record claims, but not for a contour small enough to leave one outside. The record's own words are
// "once N+½ > a"; this asks the winding question at each and refuses by name rather than reporting a
// sum for a different contour. `findPoles` sees no transcendental and so lists none of them, which is
// why the windings are computed here rather than looked up (the same reason `stripTheorem` takes
// `pieces` for its margin poles).
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { assembleVerdict, exact, refuse, type Certificate } from "@cas/rigor";
import { formatSqrtExt } from "../kernel/formatExact.js";
import { asHyperbolicForm } from "../kernel/cothForm.js";
import { formatSineForm } from "../kernel/sineForm.js";
import { cofactorResidues, ratioToTuple, scaleRatio, type ExpRatio } from "../kernel/kernelResidue.js";
import { kernelResidues, type SummationKernel } from "../kernel/summationKernel.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import { windingNumber } from "../kernel/winding.js";
import type { ContourIntegral } from "./contour/integrate.js";
import { checkAgainstQuadrature, type ResidueTheoremResult } from "./residueTheorem.js";

export const SUMMATION_THEOREM_IDENTITY =
  "∮ K·f dz = 2πi[ Σ_{|n|≤N} Res(K·f, n) + Σⱼ Res(K·f, zⱼ) ],  K = π cot(πz) or π csc(πz)";

export interface SummationTheoremInput {
  readonly kernel: SummationKernel;
  /** The widest `|n|` the contour can reach, from `analyse`'s own geometry read. */
  readonly band: bigint;
  readonly integral: ContourIntegral;
  /** The resolved contour — needed to ASK the winding question at each pole of the cofactor. */
  readonly pieces: readonly Resolved[];
}

const declined = (claim: string, reason: string): ResidueTheoremResult => ({
  verdict: assembleVerdict([refuse(claim, reason)]),
  identity: SUMMATION_THEOREM_IDENTITY,
});

/** `Σⱼ Res(K·f, zⱼ)/π` rendered as the gallery renders it — the named form, or a decimal. */
function describeCofactorSum(total: ExpRatio): string {
  const named = asHyperbolicForm(total);
  if (named.ok) return formatSineForm(named.form);
  return `${(Math.PI * ratioToTuple(total)[0]).toPrecision(10)}`;
}

export function applySummationTheorem(input: SummationTheoremInput): ResidueTheoremResult {
  const { kernel, band, integral, pieces } = input;
  if (!integral.closed) {
    return declined("the residue theorem", "it applies to a closed contour, and this one is not closed");
  }

  const windingOf = (at: Cx): { n: number; decided: boolean } => {
    const w = integral.windings.find((x) => Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < 1e-9);
    return w === undefined ? { n: 0, decided: false } : { n: w.n, decided: w.decided };
  };

  // ---- the kernel's own poles: `Res(K·f, n) = f(n)·Res(K, n)`, exact over ℚ(i) -------------------
  const integers = kernelResidues(kernel, band);
  if (!integers.ok) return declined("∮ K·f dz", integers.reason);

  let partial = Gauss.ZERO;
  let counted = 0;
  for (const t of integers.terms) {
    const w = windingOf([Number(t.n), 0]);
    if (!w.decided) {
      return declined(
        "∮ K·f dz",
        `the winding about the kernel's pole at z = ${t.n} could not be decided, so the contour may pass through it`,
      );
    }
    if (w.n === 0) continue;
    partial = partial.add(t.residue.mul(Gauss.int(w.n)));
    counted += 1;
  }

  // ---- the cofactor's poles: `π·cot(πzⱼ)·Res(f, zⱼ)`, exact as a quotient ------------------------
  const cofactor = cofactorResidues(kernel);
  if (!cofactor.ok) return declined("∮ K·f dz", cofactor.reason);

  for (const pole of cofactor.at) {
    const at: Cx = pole.z.toTuple();
    const w = windingNumber(pieces, at);
    if (!w.decided) {
      return declined(
        "∮ K·f dz",
        `the winding about the cofactor's pole at z = ${formatSqrtExt(pole.z)} could not be decided, so the contour may pass through it`,
      );
    }
    if (w.n !== 1) {
      return declined(
        "∮ K·f dz",
        `the contour winds ${w.n} time${w.n === 1 ? "" : "s"} about the cofactor's pole at z = ${formatSqrtExt(pole.z)}, ` +
          "and this identity sums every one of them exactly once — the record's own 'once N+½ > a'. " +
          "Summing them all against a contour that does not enclose them all would report a number for a different contour",
      );
    }
  }

  // `∮ = 2πi[partial + π·ρ]`. The two halves carry different powers of π and are combined here, once,
  // in the numeric plane — see the header for why no ring holds both.
  const [rr, ri] = ratioToTuple(cofactor.total);
  const [pr, pi] = partial.toTuple();
  const inner: Cx = [pr + Math.PI * rr, pi + Math.PI * ri];
  const value: Cx = [-2 * Math.PI * inner[1], 2 * Math.PI * inner[0]];

  // The TEXT is the gallery's own `closedContour` probe: `2πi[Σ_{|n|≤N} f(n) − T]`, with `T` the
  // infinite sum in its named form. `Σⱼ Res = −T/π·π = −T`, so the minus is the identity's own and
  // not a sign chosen to make the line read well.
  const infinite = scaleRatio(cofactor.total, SqrtExt.fromGauss(new Gauss(Frac.of(-1n), Frac.ZERO)));
  const text = `2πi(${formatSqrtExt(SqrtExt.fromGauss(partial))} − ${describeCofactorSum(infinite)})`;

  const certificates: Certificate[] = [
    exact(
      `∮ = 2πi[Σ over ${counted} integer pole${counted === 1 ? "" : "s"} + Σ over ${cofactor.at.length} pole${cofactor.at.length === 1 ? "" : "s"} of the cofactor]`,
      "the kernel's residue is exactly 1 (cot) or exactly (−1)ⁿ (csc) at every integer, so its term is f(n) evaluated exactly over ℚ(i); the cofactor's is K(zⱼ)·Res(f,zⱼ), exact as a quotient of basis elements",
      {
        provenance: [
          {
            ok: true,
            text: "every pole of the cofactor was asked for its winding number and is enclosed exactly once — the record's 'once N+½ > a', checked rather than assumed",
          },
          {
            ok: true,
            text: "at the contour drawn this is 2πi times the PARTIAL sum minus the infinite one; it is the limit N → ∞ that sends it to zero, and that limit is what the vanishing sides establish",
          },
        ],
      },
    ),
    integers.certificate,
    cofactor.certificate,
  ];

  const check = checkAgainstQuadrature(value, text, integral);
  if (check?.contradiction !== undefined) certificates.push(check.contradiction);

  return {
    exactValue: { value, text },
    ...(check === null ? {} : { disagreement: check.disagreement, agrees: check.agrees }),
    ...(check?.agrees === true ? { crossCheck: check.crossCheck } : {}),
    identity: SUMMATION_THEOREM_IDENTITY,
    verdict: assembleVerdict(certificates),
  };
}
