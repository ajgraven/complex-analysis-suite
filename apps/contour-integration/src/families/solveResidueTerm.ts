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
import { RatPi, formatRatPi } from "../kernel/ratPi.js";
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
  /**
   * `Σ Res(K·f, n)` over the EXCLUDED integers, in ℚ(i)(π) — the collisions.
   *
   * Absent for a record whose target terms are every integer (G2). Present, it is the other ring,
   * and the two are mutually exclusive by the check below rather than by convention.
   */
  readonly excluded?: RatPi;
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
  /**
   * The exact value, IN THE RING IT WAS SOLVED IN — tagged, because there are two and they are
   * incomparable.
   *
   * `exponential` is G2's: the cofactor's residues make `T/π` a quotient of basis elements, because
   * `cot(πz₀)` is a Möbius function of `e^{2πiz₀}`. `Q(i)(pi)` is G1's: every residue comes from a
   * COLLISION, where the kernel's even Laurent expansion puts the value in ℚ·π^{2k}. A single
   * optional field for each would leave "exactly one is present" as an unenforced convention; this
   * makes a reader pick.
   */
  readonly solvedIn:
    | { readonly ring: "exponential"; readonly piUnits: ExpRatio }
    | { readonly ring: "Q(i)(pi)"; readonly exact: RatPi };
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

/** What {@link residueTermShape} establishes about a record, without a kernel or a residue. */
export interface ResidueTermShape {
  readonly targetId: string;
  readonly weight: 1 | 2;
  /** True when the predicate leaves `n = 0` out of the target's own terms. */
  readonly excludesZero: boolean;
}

export type ShapeResult =
  | { readonly ok: true; readonly shape: ResidueTermShape }
  | { readonly ok: false; readonly reason: string };

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
 * The STRUCTURAL half — everything decidable from the record alone, with no kernel and no residue.
 *
 * Separated because invariant 4 needs exactly this and nothing more. SG-1 INVERTS that invariant:
 * `M` is identically zero for a tier-G record by construction (no piece touches the unknown), so
 * `rank(M) = m` would drop every one of them, and full rank would mean the record ALSO puts its
 * target on the contour — the mixed case this route refuses. The check that belongs there is
 * therefore "does the declaration make sense?", which is this, plus `rank(M) = 0`. The same shape
 * as D5's borrowing, where the honest test is the system with a column REMOVED rather than the one
 * the record does not claim.
 */
export function residueTermShape(family: Family): ShapeResult {
  const declared = family.residueSelection.targetTerms;
  if (declared === undefined || declared.length === 0) {
    return {
      ok: false,
      reason: "the record declares no `residueSelection.targetTerms`, so no unknown sits inside the residue sum",
    };
  }
  if (declared.length !== 1) {
    return {
      ok: false,
      reason:
        `this solve handles one unknown inside the sum; the record declares ${declared.length}, whose ` +
        "residue terms would have to be separated before either could be read",
    };
  }
  const entry = declared[0];
  const target = family.targets.find((t) => t.id === entry.targetId);
  if (target === undefined) {
    return { ok: false, reason: `\`targetTerms\` names '${entry.targetId}', which is not one of this record's unknowns` };
  }

  // `a = 0`, refused by name: see the header for why the mixed coefficient is not an element of any
  // ring this app has.
  const onLeft = family.contour.pieces.find((p) => p.role === "target" || p.role === "reproduces");
  if (onLeft !== undefined) {
    return {
      ok: false,
      reason:
        `piece '${onLeft.id}' carries the target on the LEFT of the identity while \`targetTerms\` puts ` +
        "it inside the residue sum on the right: its coefficient would be a dimensionless number plus " +
        "one carrying π, and neither the exponential basis nor ℚ(i)(π) holds both",
    };
  }

  const predicate = TERM_PREDICATES[entry.terms];
  if (predicate === undefined) {
    return {
      ok: false,
      reason:
        `the term predicate '${entry.terms}' is not one this engine executes; it reads ` +
        `${Object.keys(TERM_PREDICATES).map((k) => `'${k}'`).join(" and ")}`,
    };
  }

  const forced = weightForRange(target.lower, target.upper);
  if (forced === null) {
    return {
      ok: false,
      reason:
        `the target runs from '${target.lower}' to '${target.upper}', and this route reads only the ` +
        "two-sided sum (-inf, inf) and the one-sided (1, inf)",
    };
  }
  if (entry.weight !== forced) {
    return {
      ok: false,
      reason:
        `the record declares weight ${entry.weight}, but a sum from '${target.lower}' to '${target.upper}' ` +
        `forces ${forced}: Σ_{targetTerms} Res = ${forced}·T, and the halving bookkeeping is what the ` +
        "weight IS rather than something it records",
    };
  }
  return { ok: true, shape: { targetId: entry.targetId, weight: forced, excludesZero: predicate.excludesZero } };
}

/**
 * Solve `w·T + Σ_known = 0` for a target that is a TERM of the residue sum.
 *
 * Every refusal below is structural — a property of the record, decided without evaluating an
 * integral — except the last, which guards an engine fault.
 */
export function solveResidueTerm(family: Family, inputs: ResidueTermInputs): SolveResidueTermResult {
  const structural = residueTermShape(family);
  if (!structural.ok) return no(structural.reason);
  const { targetId, weight: forced, excludesZero } = structural.shape;

  const excluded = inputs.excluded;
  if (excluded !== undefined && !inputs.known.num.isZero()) {
    return no(
      "the residue sum has a term in ℚ(i)(π) (a merged pole) and a term in the exponential basis (a " +
        "pole of the cofactor away from the integers), and no ring in this app holds both",
    );
  }

  const alive = inputs.pieceLimits.find((p) => !p.contribution.isZero());
  if (alive !== undefined) {
    return no(
      `piece '${alive.pieceId}' contributes a non-zero limit, which this route cannot carry: it is π ` +
        "times an algebraic number and would compete with the residue sum's own π for the same slot",
    );
  }
  // **THE EXCLUDED INTEGER IS A KNOWN TERM, AND WHICH RING IT LANDS IN DECIDES THE WHOLE SOLVE.**
  // At a regular integer `Res(K·f, n) = f(n)` is ALGEBRAIC (the kernel's π spent on its own residue
  // `π·(1/π) = 1`); where the cofactor also has a pole the two MERGE and the residue is in ℚ(i)(π).
  // Only the second is carried, and the first is refused rather than given a third ring: a cofactor
  // whose only poles are at integers has them all collide, and one with a pole elsewhere is the
  // mixed case above — so an algebraic excluded term belongs to no convergent record.
  if (excludesZero && excluded === undefined) {
    return no(
      "the target terms exclude n = 0, so Res(K·f, 0) is a KNOWN term — and none was supplied, which " +
        "means the cofactor is regular there and the residue is f(0), an ALGEBRAIC number where the " +
        "rest of the sum carries the kernel's π",
    );
  }
  if (!excludesZero && excluded !== undefined) {
    return no(
      "a merged residue was supplied, but the target terms claim every integer — so the collision's " +
        "own term is on BOTH sides of the identity",
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
    // **Not asked when 0 is EXCLUDED**, which is G1: there `Σ_{n≠0} = 2Σ_{n≥1}` needs only evenness,
    // and `f(0)` is not merely non-zero but infinite.
    if (!excludesZero && !inputs.kernel.num.eval(Gauss.ZERO).isZero()) {
      return no(
        "the target is one-sided and n = 0 is among the target terms, but f(0) ≠ 0: the identity is " +
          "Σ_{n∈ℤ} = f(0) + 2·Σ_{n≥1}, so weight 2 alone would absorb the n = 0 term into the answer",
      );
    }
  }

  // `w·(T/π) + ρ = 0`.
  // ---- ℚ(i)(π): every known residue came from a COLLISION (G1, G3) -------------------------------
  //
  // `w·T + Σ merged = 0`, and there is no π to divide out — a merged residue is already `−π²/3`
  // rather than π times something. So the value is the answer itself and `T/π` never appears, which
  // is the clearest statement of why this is a second ROUTE and not a different formatter.
  if (excluded !== undefined) {
    const value = excluded.neg().mul(RatPi.fromGauss(Gauss.rat(1n, BigInt(forced))));
    const [re, im] = value.toNumber();
    if (im !== 0) {
      return no(`the solved sum is ${formatRatPi(value)}, which is not real, but its terms are`);
    }
    return {
      ok: true,
      solved: {
        targetId,
        weight: forced,
        solvedIn: { ring: "Q(i)(pi)", exact: value },
        text: formatRatPi(value),
        value: re,
        certificates: [
          exact(
            `${targetId} = −(Σ Res at the merged poles)/${forced} = ${formatRatPi(value)}`,
            "the unknown sits inside the residue sum, over $\\mathbb{Q}(i)(\\pi)$: every side of the contour " +
              "vanishes, so $0 = 2\\pi i[wT + \\sum \\text{merged}]$ and the $2\\pi i$ divides out",
            {
              provenance: [
                {
                  ok: true,
                  text: `the weight $${forced}$ is derived from the target's own declared range and checked, not read out of it`,
                },
                {
                  ok: true,
                  text:
                    "the kernel is odd about every integer, so $uK(n+u)$ is even in $u$ and the coefficient of $u^{2k-1}$ is a rational multiple of $\\pi^{2k}$; the merged residue is therefore a rational multiple of an even power of $\\pi$ — this ring, and not the exponential basis the hyperbolic families solve in",
                },
                ...(forced === 2
                  ? [
                      {
                        ok: true,
                        text: "the cofactor is even, decided exactly over $\\mathbb{Q}(i)$, which is what makes $\\sum_{n \\ne 0} = 2\\sum_{n \\ge 1}$; $f(0)$ is not asked about, because n = 0 is excluded from the target's own terms",
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

  // ---- the exponential basis: the cofactor's poles carry the answer (G2) -------------------------
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
      targetId,
      weight: forced,
      solvedIn: { ring: "exponential", piUnits },
      ...(named.ok ? { form: named.form, text: formatSineForm(named.form) } : {}),
      value: named.ok ? sineFormToNumber(named.form, "re") : Math.PI * re,
      certificates: [
        ...certificates,
        exact(
          `${targetId} = −(Σ_j Res(K·f, z_j))/${forced}`,
          "the unknown sits inside the residue sum: every side of the contour vanishes, so " +
            "$0 = 2\\pi i[wT + \\sum_j \\mathrm{Res}]$ and the $2\\pi i$ divides out, leaving the kernel's own $\\pi$",
          {
            provenance: [
              {
                ok: true,
                text: `the weight $${forced}$ is derived from the target's own declared range and checked, not read out of it`,
              },
              ...(forced === 2
                ? [
                    {
                      ok: true,
                      text: "the cofactor is even and $f(0) = 0$, both decided exactly over $\\mathbb{Q}(i)$, which is what makes $\\sum_{n \\in \\mathbb{Z}} = 2\\sum_{n \\ge 1}$",
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
