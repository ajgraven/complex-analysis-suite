// Pass 5, applied: solve the contour identity for the real integral it was built to find.
//
// Tiers A and B never needed this. There the target piece IS the whole contour (A) or the arc
// vanishes and the real axis is all that is left (B), so `∮ f dz` and the target are the same number
// and reading the closed-contour value was enough. C1 is where that stops being true: the contour
// encloses NOTHING, `∮ = 0`, and the entire answer comes from the indentation's `iα·Res`. Reading
// `∮` there would report 0 for an integral whose value is π/2.
//
// UNITS OF π THROUGHOUT. Every contribution is π times an element of the exponential basis —
// `2πi Σ Res` is `π·(2iΣ)`, L4's `iα·Res` is `π·(i(α/π)Res)` — so the whole solve stays exact and π
// is never evaluated. `π/2` stays `π/2` instead of becoming 1.5707963.
//
// WHERE THIS LIVES, AND WHY NOT IN THE LEDGER. DESIGN §4 places Pass 5 among the ledger's passes, and
// it belongs there eventually. It is here for now because the coefficients `aᵢ` are FAMILY data — the
// runtime `Piece` has a role but no coefficient row — and the ledger also serves the sandbox, where
// there is no family at all. Moving it inward is a wiring change, not a redesign.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { exact, refuse, unknown, type Certificate } from "@cas/rigor";
import { ExpSum } from "../kernel/expSum.js";
import {
  divideCarryingSine,
  formatSineForm,
  sineFormToNumber,
  type SineForm,
} from "../kernel/sineForm.js";
import { exactBasisConstant } from "./basisConstant.js";
import type { Bindings } from "./system.js";
import { parse } from "@cas/expr";
import type { Family } from "./schema.js";

export interface SolvedTarget {
  /** `t/π`, exactly — the unknown in units of π, before the relation is applied. */
  readonly piUnits: ExpSum;
  /**
   * The unknown in units of π, INCLUDING a sine factor when the coefficient carried one.
   *
   * Tiers A–C never have one, so `form.sine` is absent there and `form.sum` is `piUnits`. A keyhole
   * has one, and it is not optional decoration: `π/sin(πα)` is the answer and `piUnits` alone cannot
   * express it.
   */
  readonly form: SineForm;
  /** The real number the target's relation extracts. `≈` by construction: π is evaluated here. */
  readonly value: number;
  /** The exact form, when the relation can be applied symbolically — `π/2`, not 1.5707963. */
  readonly text?: string;
  readonly certificates: readonly Certificate[];
}

export type SolveTargetResult =
  | { readonly ok: true; readonly solved: SolvedTarget }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

export interface SolveInputs {
  /** The closed-contour value in units of π — `applyResidueTheorem`'s `piUnits`. */
  readonly closedContourPiUnits: ExpSum;
  /** The exact limits of the pieces that do not vanish (L4, L5), in units of π. */
  readonly pieceLimits: readonly { readonly pieceId: string; readonly contribution: ExpSum }[];
  readonly bindings?: Bindings;
}

/**
 * The real-linear functional recovering the target from the contour value.
 *
 * The corpus uses four forms. `Re` and `Im` are the complexification step; the `/2` is the *evenness*
 * fold, `∫₀^∞ = ½∫_ℝ`, which A5's trap is emphatic holds only for an EVEN integrand. Anything else
 * refuses rather than being guessed at.
 */
const RELATIONS: Readonly<Record<string, { part: "re" | "im"; divisor: bigint }>> = {
  Re: { part: "re", divisor: 1n },
  Im: { part: "im", divisor: 1n },
  "Re/2": { part: "re", divisor: 2n },
  "Im/2": { part: "im", divisor: 2n },
};

/**
 * Re or Im of an element of ℚ(i)(√d), exactly.
 *
 * `a + b√d` with `d > 0` real: the real part is `Re(a) + Re(b)√d`, the imaginary part `Im(a) + Im(b)√d`.
 * That is only valid because `√d` is real, which `SqrtExt` guarantees for a positive radicand.
 */
function realPart(x: SqrtExt, part: "re" | "im"): SqrtExt {
  const pick = (g: Gauss): Gauss =>
    part === "re" ? new Gauss(g.re, Frac.ZERO) : new Gauss(g.im, Frac.ZERO);
  return SqrtExt.of(pick(x.a), pick(x.b), x.d);
}

/**
 * Re or Im of `Σ cₖ e^{βₖ}`, when it distributes over the terms — or null.
 *
 * It distributes exactly when every `βₖ` is REAL, since `e^{β}` is then real and
 * `Re(Σ cₖe^{βₖ}) = Σ Re(cₖ)e^{βₖ}`. B1's `e^{−1}` and C3's `1 − e^{−b}` qualify, which is what lets
 * their answers read `π/e` and `π − π/e` rather than as decimals.
 *
 * B3 is the case that does NOT: its exponents are `−√2/2 ± i√2/2`, so `e^{β}` carries `cos` and `sin`
 * of an irrational and the real part is not an element of this basis at all. Returning null there is
 * the record's own position — "`=` is earned on the form while the decimal remains `≈`".
 */
function realPartOfSum(sum: ExpSum, part: "re" | "im"): ExpSum | null {
  let out = ExpSum.ZERO;
  for (const t of sum.terms) {
    if (!t.exponent.isReal()) return null;
    out = out.add(ExpSum.of(realPart(t.coefficient, part), t.exponent));
  }
  return out;
}

/**
 * The total coefficient on the unknown — `Σ aᵢ` over the `target` pieces **plus `Σ cⱼ` over the
 * `reproduces` ones**, in the widened basis.
 *
 * THE `reproduces` ROLE IS THE KEYHOLE'S WHOLE MECHANISM, and folding it in here is what M4.2
 * added. Its lower edge is the target traversed backwards times `e^{2πi(α−1)}`, so it does not
 * cancel the upper edge — the two together multiply the unknown by `1 − e^{2πiα}`. A solve that
 * refused the role (as this one did for tiers A–C, none of which has one) can only ever handle a
 * contour on which the target appears once.
 *
 * The value is an `ExpSum` rather than a `Gauss` because that coefficient is not an algebraic
 * number. `exactConstant` refuses it by design and says so; `exactBasisConstant` is the walker
 * ADR-0041 chose instead.
 */
function targetCoefficient(
  family: Family,
  bindings: Bindings,
): { ok: true; a: ExpSum } | { ok: false; reason: string } {
  const targetIds = family.targets.map((t) => t.id);
  if (targetIds.length !== 1) {
    return { ok: false, reason: `this solve handles one unknown; the family declares ${targetIds.length}` };
  }
  let total = ExpSum.ZERO;
  let sawTarget = false;
  for (const piece of family.contour.pieces) {
    if (piece.role === "target") sawTarget = true;
    else if (piece.role !== "reproduces") continue;
    const rows =
      piece.coefficients ??
      (piece.role === "target" ? [{ targetId: targetIds[0], coefficient: "1" }] : undefined);
    if (rows === undefined) {
      return { ok: false, reason: `the 'reproduces' piece '${piece.id}' declares no coefficient row` };
    }
    for (const row of rows) {
      const value = exactBasisConstant(parse(row.coefficient), bindings);
      if (!value.ok) {
        return { ok: false, reason: `piece '${piece.id}': ${value.reason}` };
      }
      total = total.add(value.value);
    }
  }
  if (!sawTarget) return { ok: false, reason: "no piece carries the target role" };
  // NOT folded. `ExpSum.foldSigns` says why: folding `e^{irπ}` with `2r ∈ ℤ` into its coefficient
  // collapses the two-term shape the sine recogniser reads, and D1 at α = 3/4 has exactly that
  // exponent — its answer would come out as an algebraic multiple of π instead of `π/sin(3π/4)`.
  // The degenerate keyhole does not need folding either: at integer α the two exponents are EQUAL,
  // so the normal form combines them and the coefficient is exactly zero already.
  return { ok: true, a: total };
}

/**
 * Solve `a·t + Σbᵢ = S` for `t`, in units of π.
 *
 * `S` is the closed-contour value, `bᵢ` the known constants the non-target pieces contribute — zero
 * for a genuinely vanishing piece, `iα·Res` for an indentation. One equation, one unknown; the full
 * `M t = r` of `linear.ts` waits for the log keyhole, which is the first family with `m > 1`.
 */
export function solveTarget(family: Family, inputs: SolveInputs): SolveTargetResult {
  const bindings = inputs.bindings ?? {};

  const coefficient = targetCoefficient(family, bindings);
  if (!coefficient.ok) {
    return {
      ok: false,
      reason: coefficient.reason,
      certificate: refuse("the target", coefficient.reason),
    };
  }

  // A `free` piece would contribute a quadrature value, which is `≈` and would cap the result. No
  // family in the corpus has one, so this refuses rather than quietly downgrading. (`reproduces`
  // used to be refused alongside it and is now folded into the coefficient above.)
  const free = family.contour.pieces.filter((p) => p.role === "free");
  if (free.length > 0) {
    const reason = `piece '${free[0].id}' has role 'free', which this solve does not yet carry`;
    return { ok: false, reason, certificate: refuse("the target", reason) };
  }

  const certificates: Certificate[] = [];
  let constants = ExpSum.ZERO;
  for (const arc of inputs.pieceLimits) {
    constants = constants.add(arc.contribution);
  }

  // a·t = S − Σbᵢ, then divide — which for a keyhole is where the sine comes from.
  const numerator = inputs.closedContourPiUnits.sub(constants);
  const divided = divideCarryingSine(numerator, coefficient.a);
  if (!divided.ok) {
    return { ok: false, reason: divided.reason, certificate: divided.certificate };
  }
  certificates.push(divided.certificate);
  const piUnits = divided.form.sum;

  const relation = family.auxiliary?.relation ?? "Re";
  const spec = RELATIONS[relation];
  if (spec === undefined) {
    const reason = `the auxiliary relation '${relation}' has no evaluator`;
    return { ok: false, reason, certificate: refuse("the target", reason) };
  }

  const value = sineFormToNumber(divided.form, spec.part) / Number(spec.divisor);

  // The SYMBOLIC form survives only when no exponential did: Re of `c·e^{β}` is not an element of
  // ℚ(i)(√d) unless β = 0. When one does survive, the value is reported as a decimal and the
  // certificate says so — which is B3's situation stated as a rule rather than as a special case.
  const extracted = realPartOfSum(piUnits, spec.part);
  let text: string | undefined;
  let form: SineForm = divided.form;
  if (extracted !== null) {
    const folded = extracted.scale(SqrtExt.fromGauss(Gauss.rat(1n, spec.divisor)));
    form = divided.form.sine === undefined ? { sum: folded } : { sum: folded, sine: divided.form.sine };
    text = formatSineForm(form);
    certificates.push(
      exact(
        `the target is ${text}`,
        `Pass 5: a·t = ∮ − Σbᵢ solved in units of π, then ${relation} applied`,
      ),
    );
  } else {
    certificates.push(
      unknown(
        "the target's closed form",
        "the solved value carries an exponential with a COMPLEX exponent, so e^{β} contributes cos and sin of an irrational and the real part is not in this basis; the decimal stands",
      ),
    );
  }

  return { ok: true, solved: { piUnits, form, value, text, certificates } };
}
