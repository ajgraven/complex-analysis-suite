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
import { LATEX } from "../kernel/notation.js";
import { exact, refuse, unknown, type Certificate } from "@cas/rigor";
import { ExpSum } from "../kernel/expSum.js";
import {
  divideCarryingSine,
  formatSineForm,
  sineFormToNumber,
  type SineForm,
} from "../kernel/sineForm.js";
import { exactBasisConstant } from "./basisConstant.js";
import { combineOver, describeKernel, realifyRhs, solveOver } from "./linear.js";
import { RAT_PI_FIELD } from "./field.js";
import { RatPi, formatRatPi } from "../kernel/ratPi.js";
import { buildSystem, withoutColumns } from "./system.js";
import type { Bindings } from "./system.js";
import { parse } from "@cas/expr";
import type { Family } from "./schema.js";

/**
 * What every consumer of a solved family needs: a number, its exact form when there is one, and the
 * evidence for both.
 *
 * The two Pass-5 routes agree on exactly this much and on nothing else. The scalar route works in
 * UNITS OF π and carries a sine; the system route works in ℚ(i)(π) and carries several unknowns at
 * once, one of which is the primary. A caller that only wants to print the answer takes this.
 */
export interface SolvedValue {
  /** The real number the target's relation extracts. `≈` by construction: π is evaluated here. */
  readonly value: number;
  /** The exact form, when the relation can be applied symbolically — `π/2`, not 1.5707963. */
  readonly text?: string;
  /** The same form typeset (M8 step 0.5b-ii), from the same formatter at `LATEX`. */
  readonly latex?: string;
  readonly certificates: readonly Certificate[];
}

export interface SolvedTarget extends SolvedValue {
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
  let latex: string | undefined;
  let form: SineForm = divided.form;
  if (extracted !== null) {
    const folded = extracted.scale(SqrtExt.fromGauss(Gauss.rat(1n, spec.divisor)));
    // **SPREAD, NOT REBUILD.** This line rebuilt the form field by field and carried only `sine`, so
    // when M5.3d added `cosh` the VALUE (computed above, from `divided.form`) divided by it while
    // the TEXT did not — E2 printed `π` for a number that was `π/cosh(π)`. A right number under a
    // wrong form is the worst shape a bug here can take, since nothing about it looks wrong.
    form = { ...divided.form, sum: folded };
    text = formatSineForm(form);
    latex = formatSineForm(form, LATEX);
    certificates.push(
      exact(
        `the target is $${latex}$`,
        `solved from $\\sum_i (a_i t + b_i) = \\oint_\\gamma f\\,dz$ in units of $\\pi$, then ${relation} applied`,
      ),
    );
  } else {
    certificates.push(
      unknown(
        "the target's closed form",
        "the closed form involves $e^{\\beta}$ with complex $\\beta$, so its real part is not in this basis; only the decimal is given",
      ),
    );
  }

  return { ok: true, solved: { piUnits, form, value, text, latex, certificates } };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// Pass 5 over ℚ(i)(π): a LOG family, several unknowns at once.
//
// Everything above solves `a·t = S − Σbᵢ` — one unknown, one division, and a sine recogniser for the
// keyhole's `1 − e^{2πiα}`. D4 is the first record that cannot be put in that shape: its lower edge
// reproduces `−(T2 + 4πi·T1 − 4π²·T0)`, an AFFINE COMBINATION of three real integrals, so there is
// no single `a` to divide by. It is `M t = r`, and `linear.ts` has been over a `Field` since M4.3a
// precisely so that `M` can carry the `4π²`.
//
// NOT IN UNITS OF π. The solve above works in units of π throughout because every contribution there
// is π times an algebraic number. Here that is false and unnecessary in the same breath: the
// residues of `R(z)log²z` are polynomials in π, and `RatPi` holds π natively, so `π/4` is an element
// of the coefficient ring rather than a convention about how to read one.
//
// WHAT COMES BACK IS PER-UNKNOWN, AND THE GAPS ARE NAMED. D4's contour determines two of its three
// unknowns and is CORRECT to say nothing about the third. A solve that returned one value would have
// to choose between reporting the bonus integral it also establishes and refusing the record; a
// solve that returned three would have to invent `∫R log²x`. So it returns what it determined, plus
// one sentence per combination it did not — computed from `kernel`, not written by hand.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface PiSolveInputs {
  /** `∮ f dz`, exactly, as an element of ℚ(i)(π). */
  readonly closedContour: RatPi;
  /** The exact limits of the pieces that do not vanish (L4, L5). Zero for a vanishing piece. */
  readonly pieceLimits: readonly { readonly pieceId: string; readonly contribution: RatPi }[];
  /**
   * Unknowns supplied from elsewhere — a record's resolved `prerequisites`.
   *
   * Each one moves its column across the equals sign: `M t = r` becomes `M′ t′ = r − M[:,j]·tⱼ`.
   * That is only valid because the unknowns are real, which is the same hypothesis the Re/Im split
   * rests on. The certificate travels with the value so the answers that depend on it can meet it.
   */
  readonly known?: readonly {
    readonly targetId: string;
    readonly value: RatPi;
    readonly certificate: Certificate;
  }[];
  readonly bindings?: Bindings;
}

export interface PiSolvedTarget {
  readonly targetId: string;
  /**
   * The evidence for THIS unknown — its own, plus every borrowed input it actually DEPENDS ON.
   *
   * Separated from `PiSolvedTargets.certificates` because a verdict is a meet: a caller that badged
   * one answer with the whole system's evidence would cap an exact value at `?` on the strength of a
   * statement about a DIFFERENT unknown. `residueTheorem.ts` records the same lesson about
   * corroboration — a claim is never weakened by something it does not depend on.
   *
   * Dependence is COMPUTED, not assumed: the unknown is `weights·r`, so it depends on a borrowed
   * `tⱼ` exactly when `Σ_row weights[row]·M[row][j] ≠ 0`. D5 is the record that makes the difference
   * visible — its `∫R log x` comes off the real part alone and stays exact on its own contour, while
   * its `∫R log²x` comes off the imaginary part, where the borrowed `∫R dx` sits, and inherits that
   * value's verdict. A blanket meet would have downgraded the bonus for no reason.
   */
  readonly certificates: readonly Certificate[];
  /** The exact value: `π/4`, not `0.7853981`. */
  readonly text: string;
  readonly exact: RatPi;
  /** The decimal, which is `≈` by construction: π is evaluated here and nowhere before. */
  readonly value: number;
}

export interface PiSolvedTargets {
  readonly solved: readonly PiSolvedTarget[];
  /** One sentence per combination of unknowns this contour cannot see. Usually empty. */
  readonly invisible: readonly string[];
  /**
   * The unknowns that came from elsewhere, with the evidence they arrived with.
   *
   * Reported rather than absorbed, because a borrowed input is part of the argument: D5's own trap
   * asks for "the prerequisite as its own row with its own verdict", and a result that showed only
   * the answer would hide the one step a reader most needs to audit.
   */
  readonly borrowed: readonly { readonly targetId: string; readonly text: string; readonly certificate: Certificate }[];
  readonly certificates: readonly Certificate[];
}

export type SolvePiResult =
  | { readonly ok: true; readonly targets: PiSolvedTargets }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/**
 * A ledger's piece limits, carried from UNITS OF π into ℚ(i)(π).
 *
 * Everywhere else in the app a piece's limit is `π` times an algebraic number, because every
 * contribution in tiers A–C is; here the values are elements of ℚ(i)(π) and **the multiplication by
 * π has to be done rather than assumed**. That factor is precisely the kind of silent error the
 * suite's convention-neutrality guardrail exists to prevent, so it is a function with a test rather
 * than a line inside a longer one. A limit that is not π times a Gaussian rational refuses, because
 * carrying it would mean guessing which power of π it is.
 */
export function piPieceLimits(
  limits: readonly { readonly pieceId: string; readonly contribution: ExpSum }[],
):
  | { readonly ok: true; readonly limits: readonly { pieceId: string; contribution: RatPi }[] }
  | { readonly ok: false; readonly pieceId: string } {
  const out: { pieceId: string; contribution: RatPi }[] = [];
  for (const arc of limits) {
    const algebraic = arc.contribution.asSqrtExt()?.asGauss() ?? null;
    if (algebraic === null) return { ok: false, pieceId: arc.pieceId };
    out.push({ pieceId: arc.pieceId, contribution: RatPi.piPower(1, algebraic) });
  }
  return { ok: true, limits: out };
}

/** Solve `M t = r` over ℚ(i)(π) for every unknown this contour determines. */
export function solvePiTargets(family: Family, inputs: PiSolveInputs): SolvePiResult {
  const bindings = inputs.bindings ?? {};

  const built = buildSystem(family, bindings);
  if (!built.ok) {
    return { ok: false, reason: built.reason, certificate: refuse("the targets", built.reason) };
  }
  if (built.system.field !== "Q(i)(pi)") {
    const reason =
      "this solve is for a log family, whose crossing phase is additive; a family over ℚ(i) or " +
      "the exponential basis goes through `solveTarget`";
    return { ok: false, reason, certificate: refuse("the targets", reason) };
  }
  const system = built.system;

  // A `free` piece would contribute a quadrature value, which is `≈` and would cap every unknown in
  // the system rather than just one. No family in the corpus has one.
  const free = family.contour.pieces.filter((p) => p.role === "free");
  if (free.length > 0) {
    const reason = `piece '${free[0].id}' has role 'free', which this solve does not yet carry`;
    return { ok: false, reason, certificate: refuse("the targets", reason) };
  }

  // `M t = S − Σbᵢ`, then the same Re/Im split the matrix was built with.
  const total = inputs.pieceLimits.reduce(
    (acc, piece) => acc.sub(piece.contribution),
    inputs.closedContour,
  );

  // A borrowed unknown moves its column across the equals sign. The column is found by name, and a
  // name this system does not carry is a refusal rather than a silent no-op — a prerequisite naming
  // the wrong target would otherwise leave the system rank-deficient for no visible reason.
  const known = inputs.known ?? [];
  const columnOf = new Map(system.targetIds.map((id, j) => [id, j]));
  for (const supplied of known) {
    if (!columnOf.has(supplied.targetId)) {
      const reason = `'${supplied.targetId}' is supplied as a known value, but this family has no such unknown`;
      return { ok: false, reason, certificate: refuse("the targets", reason) };
    }
  }

  const rhs = realifyRhs([total]).map((value, row) =>
    known.reduce(
      (acc, supplied) => acc.sub(system.matrix[row][columnOf.get(supplied.targetId) ?? 0].mul(supplied.value)),
      value,
    ),
  );
  const reduced =
    known.length === 0 ? system : withoutColumns(system, known.map((x) => x.targetId));
  const report = solveOver(RAT_PI_FIELD, reduced.matrix, reduced.unknowns, rhs);

  // CONTRADICTION IS NOT RANK DEFICIENCY. A zero row against a non-zero right-hand side means the
  // identity does not hold — for these families that is the reality condition failing, and the
  // honest response is to report it rather than to solve the rows that did survive.
  if (report.contradictions.length > 0) {
    // WHICH part, read off the weights rather than the row index. `rref` swaps rows, so a reduced
    // row number names nothing; the weights say which of the two realified equations — the value or
    // the reality condition — the residue sum failed.
    const parts = report.contradictions.map((c) => {
      const live = c.weights.flatMap((w, j) => (w.isZero() ? [] : [j]));
      if (live.length !== 1) return "a combination of its real and imaginary";
      return live[0] % 2 === 0 ? "real" : "imaginary";
    });
    const reason =
      `the contour identity is contradicted in its ${parts.join(" and ")} part: the row reads ` +
      "`0 = (non-zero)`, so the residue sum and the piece limits cannot both be right";
    return { ok: false, reason, certificate: refuse("the targets", reason) };
  }

  const solved = report.determined.map((d) => {
    const pinned = combineOver(RAT_PI_FIELD, d.weights, rhs);
    const targetId = reduced.targetIds[d.column];
    const text = formatRatPi(pinned);
    const [re, im] = pinned.toNumber();
    // Which borrowed inputs this answer actually rests on: `Σ_row weights[row]·M[row][j]`, decided
    // in the field rather than assumed from the fact that a prerequisite exists.
    const borrowed = known.filter((supplied) => {
      const j = columnOf.get(supplied.targetId) ?? 0;
      const reach = d.weights.reduce(
        (acc, w, row) => acc.add(w.mul(system.matrix[row][j])),
        RatPi.ZERO,
      );
      return !reach.isZero();
    });
    const certificates = [
      exact(
        `${targetId} is ${text}`,
        "$Mt = \\oint_\\gamma f\\,dz - \\sum_i b_i$ over $\\mathbb{Q}(i)(\\pi)$, split into its real and imaginary parts and solved exactly",
        borrowed.length === 0
          ? undefined
          : {
              provenance: borrowed.map((supplied) => ({
                ok: true,
                text: `${supplied.targetId} was supplied from elsewhere; its own verdict meets into this one`,
              })),
            },
      ),
      ...borrowed.map((supplied) => supplied.certificate),
    ];
    // The unknowns of a log family are real by hypothesis, and the realified system says so: a
    // non-zero imaginary part here would be an engine fault, not a value to report.
    return { targetId, certificates, text, exact: pinned, value: im === 0 ? re : Number.NaN };
  });

  const certificates: Certificate[] = solved.flatMap((x) => x.certificates);

  const invisible = describeKernel(RAT_PI_FIELD, report, reduced.targetIds);
  for (const sentence of invisible) {
    certificates.push(unknown("an unknown of this system", sentence));
  }

  const borrowed = known.map((supplied) => ({
    targetId: supplied.targetId,
    text: formatRatPi(supplied.value),
    certificate: supplied.certificate,
  }));

  return { ok: true, targets: { solved, invisible, borrowed, certificates } };
}
