// Pass 5 when the unknown is INSIDE the residue sum — SG-1, and the whole of tier G.
//
// Every other tier puts the target on the left: `a·T + Σbᵢ = ∮`, solved by dividing. Tier G has no
// `target` piece at all. Its contour is a square whose four sides all vanish, so the left-hand side
// is identically zero and `∮ → 0` is the RESULT rather than the bookkeeping; the sum being evaluated
// sits among the residues on the right, as the kernel's own poles at the integers. Pass 5 as written
// computes `T = (0 − 0 − 0)/1 = 0` and is not wrong so much as answering a different question.
//
// ── THE GENERALISATION THE PLAN ASKS FOR CANNOT BE BUILT, AND NEVER NEEDS TO BE ────────────────────
// [M5-plan](../../../../docs/contour-integration/M5-plan.md) §M5.6 states it as one equation,
//
//     T·(1 + Σⱼcⱼ − 2πi·w) + ΣᵢVᵢ + ΣₗFₗ = 2πi Σ_known n·Res
//
// and that coefficient cannot be assembled. `1 + Σⱼcⱼ` is DIMENSIONLESS — a keyhole's is
// `1 − e^{2πiα}`, an element of the exponential basis, whose coefficients are `ℚ(i)(√d)` — while
// `2πi·w` carries a π, which that basis has no seat for; and ℚ(i)(π), which does, has no seat for
// `e^{2πiα}`. That is this app's standing position on the two rings, stated in `system.ts`: neither
// contains the other. So the sum of the two is not an element of anything here.
//
// It never arises. `a = 0` is not an accident of tier G but its DEFINITION — SG-1 is precisely "there
// is no target piece" — and `w` is absent everywhere else, so the two halves of the coefficient are
// never both present. The honest move is therefore a second route with the mixed case refused BY
// NAME, rather than a ring invented for a record that does not exist. The same argument disposes of
// `ΣᵢVᵢ`: a non-zero piece limit is `π` times an algebraic number, and dividing by `2πi·w` leaves it
// competing with `π·ρ` for the same slot.
//
// ── WHAT IS LEFT IS ONE LINE ───────────────────────────────────────────────────────────────────────
// With the left-hand side identically zero, the identity `∮ = 2πi Σ_all n·Res` splits as
//
//     0 = 2πi[ w·T + Σ_known n·Res ],    Σ_known n·Res = π·ρ
//
// — the `2πi` cancels (`kernelResidue.ts` says why that is structural), the kernel's own π is the one
// that survives, and
//
//     T/π = −ρ/w.
//
// `ρ` is an {@link ExpRatio} because `cot(πz₀)` is a Möbius function of `e^{2πiz₀}`, so the answer is
// a QUOTIENT of basis elements rather than an element of it. At `z₀ = ia` that quotient is `coth(πa)`,
// but the name is a property of the point; naming it is the formatter's job and not this file's.
//
// ── THE COLLISION TAKES A DIFFERENT RING, WHICH IS WHY IT IS A DIFFERENT SLICE ─────────────────────
// G1's `Σ_{n≥1}1/n²` excludes `n = 0` from its target terms, and `0` is where its cofactor `1/z²`
// merges with the kernel: the merged residue is `−π²/3`, an element of ℚ(i)(π). G1's cofactor has no
// OTHER pole, so `ρ = 0` and its whole identity lives in ℚ(i)(π) — a different solve, not a harder
// case of this one. An excluded integer at which the kernel is regular is the mixed case a third
// time (`Res(K·f, n) = f(n)` is algebraic, the kernel's π having been spent by its own residue
// `π·(1/π) = 1`), and it is refused here by name.
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import type { ExpSum } from "../kernel/expSum.js";
import { ratioToTuple, scaleRatio, type ExpRatio } from "../kernel/kernelResidue.js";
import { asHyperbolicForm } from "../kernel/cothForm.js";
import { formatSineForm, sineFormToNumber, type SineForm } from "../kernel/sineForm.js";
import type { SummationKernel } from "../kernel/summationKernel.js";
import type { Family } from "./schema.js";
import type { SolvedValue } from "./solveTarget.js";

/**
 * The predicates `residueSelection.targetTerms[].terms` may name, and what each selects.
 *
 * A CLOSED VOCABULARY rather than an expression language, for the same reason `halfPlaneLadder` and
 * `residueSelection.rule` are: the corpus writes exactly two of these, and a parser for a predicate
 * with two instances would be a language with one consumer. A record naming anything else is refused
 * with the vocabulary quoted, which is a better failure than a predicate that parses and selects the
 * wrong set.
 */
const TERM_PREDICATES: Readonly<Record<string, { readonly excludesZero: boolean }>> = {
  "poles(K) ∩ Z": { excludesZero: false },
  "poles(K) ∩ Z \\ {0}": { excludesZero: true },
};

export interface ResidueTermInputs {
  /** The kernel and its cofactor — needed for the STRUCTURAL checks, not for the arithmetic. */
  readonly kernel: SummationKernel;
  /** `Σ_j Res(K·f, z_j)/π` over the poles the record does not claim — `cofactorResidues`' total. */
  readonly known: ExpRatio;
  /** The exact limits of the pieces, in units of π. Every one must be zero; see the header. */
  readonly pieceLimits: readonly { readonly pieceId: string; readonly contribution: ExpSum }[];
}

/**
 * ── EXTENDS `SolvedValue`, AND THE COMPILER IS WHY ────────────────────────────────────────────────
 * Adding a third `ok: true` variant to `SolveFamilyResult` widened `r.solved` at every existing call
 * site, and `text` stopped being common to all of them — four test files and the derivation panel
 * went red at once. That is the right shape of complaint, and `SolvedValue` is the right answer to
 * it: it is already documented as "what every consumer of a solved family needs", and its `text` is
 * already OPTIONAL, which is exactly the sum route's position. `π/sin` has a formatter and `coth`
 * does not yet, so this carries a number and no form — a fact about the formatter, not about the
 * value, which is exact.
 */
export interface SolvedResidueTerm extends SolvedValue {
  readonly targetId: string;
  /** `1` for a two-sided sum, `2` for a one-sided sum of an even summand — derived AND checked. */
  readonly weight: 1 | 2;
  /** `T/π`, exactly — a RATIO, because `coth` is one. */
  readonly piUnits: ExpRatio;
  /**
   * The NAMED form, when `cothForm.ts` recognises the ratio — `c·coth(πr)` or `c·csch(πr)`.
   *
   * Absent is not a failure: the value is exact either way, and a ratio outside the declared shape
   * is reported as a decimal with the naming refused by name. `text` is derived from this and from
   * nothing else, so a value and a form cannot disagree (the E2 lesson).
   */
  readonly form?: SineForm;
}

export type SolveResidueTermResult =
  | { readonly ok: true; readonly solved: SolvedResidueTerm }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

const no = (reason: string): SolveResidueTermResult => ({
  ok: false,
  reason,
  certificate: refuse("the sum", reason),
});

/**
 * `p(−z)`, by negating the odd-degree coefficients. Local because this is its only consumer.
 *
 * **A RECORDED EQUIVALENT MUTANT.** Negating the EVEN coefficients instead — making this `−p(−z)` —
 * passes every test, and genuinely so rather than for want of one: {@link isEven} uses it once on
 * each side of an equality, so a global sign cancels and `N(−z)D(z) = N(z)D(−z)` is the same
 * predicate either way. The sweep cannot see the difference and no assertion here could. It is
 * written correctly because the NEXT consumer would be the one to suffer, and that consumer would
 * owe `reflect` a test of its own.
 */
const reflect = (p: QiPoly): QiPoly =>
  QiPoly.fromCoeffs(p.coeffs.map((c, k) => (k % 2 === 1 ? c.neg() : c)));

/**
 * Is the cofactor EVEN? — decided exactly, never sampled.
 *
 * `f(−z) = f(z)` iff `N(−z)D(z) = N(z)D(−z)` as polynomials over ℚ(i), which is a polynomial
 * identity and so a decision. It is asked of the COFACTOR rather than of the summand, and that is
 * right for both kernels: `csc`'s alternation `(−1)ⁿ` is itself even in `n`, so `(−1)ⁿf(n)` is even
 * exactly when `f` is.
 */
function isEven(kernel: SummationKernel): boolean {
  return reflect(kernel.num).mul(kernel.den).equals(kernel.num.mul(reflect(kernel.den)));
}

/**
 * The weight this target's own declared range forces, independent of what the record claims.
 *
 * **This is the tier's commonest error, made arithmetic.** Research 03 §8 names the halving
 * bookkeeping as the mistake tier G actually makes, and a `weight` merely read out of the record
 * would record the habit rather than check it. `Σ_{n∈ℤ}` is the residue sum itself (`w = 1`);
 * `Σ_{n≥1}` is half of it (`w = 2`) and ONLY when the summand is even and its `n = 0` term vanishes
 * — both conditions decided in exact ℚ(i) by the caller.
 */
function weightForRange(lower: string, upper: string): 1 | 2 | null {
  if (upper !== "inf") return null;
  if (lower === "-inf") return 1;
  if (lower === "1") return 2;
  return null;
}

/**
 * Solve `w·T + Σ_known = 0` for a target that is a TERM of the residue sum.
 *
 * Every refusal below is structural — a property of the record, decided without evaluating an
 * integral — except the last, which guards an engine fault.
 */
export function solveResidueTerm(family: Family, inputs: ResidueTermInputs): SolveResidueTermResult {
  const declared = family.residueSelection.targetTerms;
  if (declared === undefined || declared.length === 0) {
    return no("the record declares no `residueSelection.targetTerms`, so no unknown sits inside the residue sum");
  }
  if (declared.length !== 1) {
    return no(
      `this solve handles one unknown inside the sum; the record declares ${declared.length}, whose ` +
        "residue terms would have to be separated before either could be read",
    );
  }
  const entry = declared[0];
  const target = family.targets.find((t) => t.id === entry.targetId);
  if (target === undefined) {
    return no(`\`targetTerms\` names '${entry.targetId}', which is not one of this record's unknowns`);
  }

  // `a = 0` and `Σbᵢ = 0`, each refused by name: see the header for why the mixed coefficient is not
  // an element of any ring this app has.
  const onLeft = family.contour.pieces.find((p) => p.role === "target" || p.role === "reproduces");
  if (onLeft !== undefined) {
    return no(
      `piece '${onLeft.id}' carries the target on the LEFT of the identity while \`targetTerms\` puts ` +
        "it inside the residue sum on the right: its coefficient would be a dimensionless number plus " +
        "one carrying π, and neither the exponential basis nor ℚ(i)(π) holds both",
    );
  }
  const alive = inputs.pieceLimits.find((p) => !p.contribution.isZero());
  if (alive !== undefined) {
    return no(
      `piece '${alive.pieceId}' contributes a non-zero limit, which this route cannot carry: it is π ` +
        "times an algebraic number and would compete with the residue sum's own π for the same slot",
    );
  }

  const predicate = TERM_PREDICATES[entry.terms];
  if (predicate === undefined) {
    return no(
      `the term predicate '${entry.terms}' is not one this engine executes; it reads ` +
        `${Object.keys(TERM_PREDICATES).map((k) => `'${k}'`).join(" and ")}`,
    );
  }
  if (predicate.excludesZero) {
    return no(
      "the target terms exclude n = 0, so Res(K·f, 0) is a KNOWN term — and it is algebraic where the " +
        "cofactor's residues carry the kernel's π (a regular integer spends it on the kernel's own " +
        "residue π·(1/π) = 1), or, where the cofactor also has a pole there, the two MERGE and the " +
        "residue lands in ℚ(i)(π). Either way it does not belong to this route's ring",
    );
  }

  const forced = weightForRange(target.lower, target.upper);
  if (forced === null) {
    return no(
      `the target runs from '${target.lower}' to '${target.upper}', and this route reads only the ` +
        "two-sided sum (-inf, inf) and the one-sided (1, inf)",
    );
  }
  if (entry.weight !== forced) {
    return no(
      `the record declares weight ${entry.weight}, but a sum from '${target.lower}' to '${target.upper}' ` +
        `forces ${forced}: Σ_{targetTerms} Res = ${forced}·T, and the halving bookkeeping is what the ` +
        "weight IS rather than something it records",
    );
  }
  if (forced === 2) {
    if (!isEven(inputs.kernel)) {
      return no(
        "the target is one-sided and weight 2 claims Σ_{n∈ℤ} = 2·Σ_{n≥1}, which needs an EVEN summand; " +
          "N(−z)D(z) ≠ N(z)D(−z), so the cofactor is not even and the halving is invalid",
      );
    }
    // With `0` inside the target terms, `Σ_ℤ = 2Σ_{n≥1}` also needs its `n = 0` term to vanish —
    // otherwise the identity is `Σ_ℤ = f(0) + 2Σ_{n≥1}` and the weight silently absorbs `f(0)`.
    if (!inputs.kernel.num.eval(Gauss.ZERO).isZero()) {
      return no(
        "the target is one-sided and n = 0 is among the target terms, but f(0) ≠ 0: the identity is " +
          "Σ_{n∈ℤ} = f(0) + 2·Σ_{n≥1}, so weight 2 alone would absorb the n = 0 term into the answer",
      );
    }
  }

  // `w·(T/π) + ρ = 0`.
  const piUnits = scaleRatio(inputs.known, SqrtExt.fromGauss(new Gauss(Frac.of(-1n, BigInt(forced)), Frac.ZERO)));
  const [re, im] = ratioToTuple(piUnits);
  // The unknown is a sum of real terms, so this is zero by hypothesis — a guard against an engine
  // fault, not a claim about the record, and it is a measurement because `ExpRatio` carries no
  // conjugation to decide it with. `solvePiTargets` refuses its own realified contradiction for the
  // same reason: an imaginary part here would mean the identity does not hold.
  if (Math.abs(im) > 1e-9 * Math.max(1, Math.abs(re))) {
    return no(
      `the solved sum has imaginary part ${im}, but its terms are real: the residue sum and the ` +
        "vanishing sides cannot both be right",
    );
  }

  // NAMING IS THE LAST STEP, AND IT IS ALLOWED TO FAIL. `kernelResidue.ts` says why `coth` is a name
  // for a quotient at a particular `z₀` rather than a fact about the arithmetic: the value is exact
  // whether or not the shape is one this app writes down. A refusal here is a missing FORMATTER,
  // never a missing value, so the decimal stands and the reason is carried.
  const named = asHyperbolicForm(piUnits);
  const certificates: Certificate[] = [];
  if (named.ok) {
    certificates.push(named.certificate);
  }

  return {
    ok: true,
    solved: {
      targetId: entry.targetId,
      weight: forced,
      piUnits,
      ...(named.ok ? { form: named.form, text: formatSineForm(named.form) } : {}),
      value: named.ok ? sineFormToNumber(named.form, "re") : Math.PI * re,
      certificates: [
        ...certificates,
        exact(
          `${entry.targetId} = −(Σ_j Res(K·f, z_j))/${forced}`,
          "Pass 5 with the unknown INSIDE the residue sum: every side of the contour vanishes, so " +
            "0 = 2πi[w·T + Σ_j Res] and the 2πi divides out, leaving the kernel's own π",
          {
            provenance: [
              {
                ok: true,
                text: `the weight ${forced} is DERIVED from the target's own range ${target.lower}…${target.upper} and checked against the record, not read out of it`,
              },
              ...(forced === 2
                ? [
                    {
                      ok: true,
                      text: "the cofactor is even and f(0) = 0, both decided exactly over ℚ(i), which is what makes Σ_{n∈ℤ} = 2·Σ_{n≥1}",
                    },
                  ]
                : []),
            ],
          },
        ),
      ],
    },
  };
}
