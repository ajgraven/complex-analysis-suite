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
import { collisionsOf, kernelResidues, type SummationKernel } from "../kernel/summationKernel.js";
import { mergedResidue } from "../kernel/mergedResidue.js";
import { RatPi, formatRatPi } from "../kernel/ratPi.js";
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

/** `+ x`, or `− |x|` when the term is already negative — `2πi(205/72 + −π²/3)` reads as neither. */
const joinSigned = (text: string): string =>
  text.startsWith("−") ? `− ${text.slice(1)}` : `+ ${text}`;

export function applySummationTheorem(input: SummationTheoremInput): ResidueTheoremResult {
  const { kernel, band, integral, pieces } = input;
  if (!integral.closed) {
    return declined("the residue theorem", "it applies to a closed contour, and this one is not closed");
  }

  const windingOf = (at: Cx): { n: number; decided: boolean } => {
    const w = integral.windings.find((x) => Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < 1e-9);
    return w === undefined ? { n: 0, decided: false } : { n: w.n, decided: w.decided };
  };

  // ---- the COLLISIONS: integers where the cofactor has a pole too ------------------------------
  //
  // Their residues come from `mergedResidue` (orders ADD, and the value lands in ℚ(i)(π)), and they
  // are skipped in the ordinary pass below so no integer is summed twice and none is missed — one
  // list read by both, rather than two decisions about what a collision is.
  const collisions = collisionsOf(kernel, band);
  const merged: { n: bigint; value: RatPi }[] = [];
  const mergedCertificates: Certificate[] = [];
  for (const n of collisions) {
    const w = windingOf([Number(n), 0]);
    if (!w.decided) {
      return declined(
        "∮ K·f dz",
        `the winding about the merged pole at z = ${n} could not be decided, so the contour may pass through it`,
      );
    }
    if (w.n === 0) continue;
    const r = mergedResidue(kernel.kind, kernel.num, kernel.den, n);
    if (!r.ok) return declined("∮ K·f dz", r.reason);
    merged.push({ n, value: r.value.mul(RatPi.fromGauss(Gauss.int(w.n))) });
    mergedCertificates.push(r.certificate);
  }

  // ---- the kernel's own poles: `Res(K·f, n) = f(n)·Res(K, n)`, exact over ℚ(i) -------------------
  const integers = kernelResidues(kernel, band, new Set(collisions));
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
    // **TWO GUARDS, AND NEITHER IS REDUNDANT.** `kernelBand` is `floor(reach) + 1`, so the list
    // reaches one integer PAST the square's corner: `±(N+1)` are here with winding 0. The multiply
    // is what makes an enclosed pole's weight its winding — a clockwise contour negates every one —
    // and the skip is what keeps `counted` the number of poles actually SUMMED, which the certificate
    // reports. Dropping either alone changes nothing about the value; dropping both would add the
    // outside integers at full weight, which is why they read as redundant and are not.
    if (w.n === 0) continue;
    partial = partial.add(t.residue.mul(Gauss.int(w.n)));
    counted += 1;
  }

  // ---- the cofactor's poles: `π·cot(πzⱼ)·Res(f, zⱼ)`, exact as a quotient ------------------------
  const cofactor = cofactorResidues(kernel);
  if (!cofactor.ok) return declined("∮ K·f dz", cofactor.reason);

  //
  // **ONE WINDING FOR ALL OF THEM, AND IT NEED NOT BE `+1`.** `cofactorResidues` returns the total
  // UNWEIGHTED, so it can be scaled by a common winding and by nothing else — and requiring that
  // common value to be `+1` would refuse a CLOCKWISE square, which is a perfectly good contour the
  // residue theorem handles by weighting every residue with `−1`. What the identity genuinely needs
  // is that the contour treat every pole of the cofactor alike: "once N+½ > a" in the record's own
  // words, plus an orientation. A pole left outside, or two poles wound differently, makes the
  // unweighted total the wrong object rather than a scalable one.
  let cofactorWinding: number | null = null;
  for (const pole of cofactor.at) {
    const at: Cx = pole.z.toTuple();
    const w = windingNumber(pieces, at);
    if (!w.decided) {
      return declined(
        "∮ K·f dz",
        `the winding about the cofactor's pole at z = ${formatSqrtExt(pole.z)} could not be decided, so the contour may pass through it`,
      );
    }
    if (w.n === 0) {
      return declined(
        "∮ K·f dz",
        `the contour does not enclose the cofactor's pole at z = ${formatSqrtExt(pole.z)}, and this ` +
          "identity sums every one of them — the record's own 'once N+½ > a'. Summing them all " +
          "against a contour that leaves one outside would report a number for a different contour",
      );
    }
    // **A RECORDED DEFENSIVE BRANCH.** Reaching it needs a single closed loop that winds differently
    // about two poles of the cofactor, which means a self-intersection; none of the app's templates
    // produces one and a disjoint second loop is refused earlier as not closed. It is kept because it
    // is what makes `weight` well defined — without it a doubly-wound contour would silently take
    // whichever winding came last — and removing it would be trading a stated precondition for an
    // assumption no reader could see.
    if (cofactorWinding !== null && w.n !== cofactorWinding) {
      return declined(
        "∮ K·f dz",
        `the contour winds ${cofactorWinding} time(s) about one pole of the cofactor and ${w.n} about ` +
          `z = ${formatSqrtExt(pole.z)}: the residue total is computed unweighted, so it can be scaled ` +
          "by a common winding and not by two different ones",
      );
    }
    cofactorWinding = w.n;
  }
  const weight = cofactorWinding ?? 1;

  // `∮ = 2πi[partial + π·ρ]`. The two halves carry different powers of π and are combined here, once,
  // in the numeric plane — see the header for why no ring holds both.
  const weighted = scaleRatio(cofactor.total, SqrtExt.fromGauss(Gauss.int(weight)));
  // **A COLLISION FAMILY LIVES ENTIRELY IN ℚ(i)(π), AND SAYS SO.** `Σ f(n)` is rational and a merged
  // residue is in ℚ(i)(π), which CONTAINS it — so when the cofactor has no pole away from the
  // integers (`ρ = 0`) the whole identity is exact in the log families' ring and `exactInPi` is the
  // seat it already has. With both present the two halves are the mixed case `solveResidueTerm.ts`
  // refuses by name, and the refusal belongs here too: adding them in the numeric plane would
  // produce a decimal labelled exact.
  const mergedTotal = merged.reduce((acc, x) => acc.add(x.value), RatPi.ZERO);
  if (merged.length > 0 && !cofactor.total.num.isZero()) {
    return declined(
      "∮ K·f dz",
      "the contour encloses a MERGED pole, whose residue is in ℚ(i)(π), and a pole of the cofactor " +
        "away from the integers, whose residue carries the kernel's π times a quotient of " +
        "exponentials: no ring in this app holds both",
    );
  }

  const [rr, ri] = ratioToTuple(weighted);
  const [mr, mi] = mergedTotal.toNumber();
  const [pr, pi] = partial.toTuple();
  const inner: Cx = [pr + mr + Math.PI * rr, pi + mi + Math.PI * ri];
  const value: Cx = [-2 * Math.PI * inner[1], 2 * Math.PI * inner[0]];
  // `2πi·(Σ f(n) + Σ merged)` in ℚ(i)(π), present exactly when every residue is in that ring.
  const exactInPi =
    merged.length > 0
      ? RatPi.piPower(1, Gauss.int(0, 2)).mul(RatPi.fromGauss(partial).add(mergedTotal))
      : undefined;

  // The TEXT is the gallery's own `closedContour` probe: `2πi[Σ_{|n|≤N} f(n) − T]`, with `T` the
  // infinite sum in its named form. `Σⱼ Res = −T/π·π = −T`, so the minus is the identity's own and
  // not a sign chosen to make the line read well.
  const infinite = scaleRatio(weighted, SqrtExt.fromGauss(new Gauss(Frac.of(-1n), Frac.ZERO)));
  const text =
    exactInPi === undefined
      ? `2πi(${formatSqrtExt(SqrtExt.fromGauss(partial))} − ${describeCofactorSum(infinite)})`
      : `2πi(${formatSqrtExt(SqrtExt.fromGauss(partial))} ${joinSigned(formatRatPi(mergedTotal))})`;

  const certificates: Certificate[] = [
    ...mergedCertificates,
    exact(
      `∮ = 2πi[Σ over ${counted} integer pole${counted === 1 ? "" : "s"} + Σ over ${cofactor.at.length} pole${cofactor.at.length === 1 ? "" : "s"} of the cofactor]`,
      "the kernel's residue is exactly 1 (cot) or exactly (−1)ⁿ (csc) at every integer, so its term is f(n) evaluated exactly over ℚ(i); the cofactor's is K(zⱼ)·Res(f,zⱼ), exact as a quotient of basis elements",
      {
        provenance: [
          {
            ok: true,
            text: `every pole of the cofactor was asked for its winding number and is enclosed ${weight === 1 ? "once" : `with winding ${weight}`} — the record's 'once N+½ > a', checked rather than assumed`,
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
    ...(exactInPi === undefined ? {} : { exactInPi }),
    ...(check === null ? {} : { disagreement: check.disagreement, agrees: check.agrees }),
    ...(check?.agrees === true ? { crossCheck: check.crossCheck } : {}),
    identity: SUMMATION_THEOREM_IDENTITY,
    verdict: assembleVerdict(certificates),
  };
}
