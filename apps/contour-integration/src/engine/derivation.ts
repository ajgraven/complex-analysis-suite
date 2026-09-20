// The derivation: the argument in order, with every line carrying its own evidence.
//
// WHAT THIS IS NOT. It is not a prose generator. Everything it renders already exists — the ledger's
// rows each carry a `Certificate`, and a certificate carries `claim`, `method`, an optional
// `restriction` and a `provenance` trail of ✓/✗ steps that no surface in this app has ever shown.
// `mlRational.ts` already writes its row exactly as DESIGN §3 specifies it —
// "|∫ over the arc| ≤ 3.2e-4 at R = 50, and → 0 as R → ∞, because deg Q − deg P = 3 ≥ 2 makes the
// bound O(R^-2)" — so a generator would be rewriting, in a renderer, sentences the engine composed
// where it had the facts.
//
// THE RULE, therefore: **every line traces to a certificate, and a line that cannot is not a line.**
// Anything the engine knows but did not certify appears as a `Statement` (the target, the contour
// integrand, a structural identity) or as a `PoleRow` (Pass 2's per-pole data), neither of which
// carries a `Level`. That separation is the whole defence against PLAN §9's R2, *certification
// theatre*: a renderer that minted its own certificates could choose its own labels, and the
// `@cas/rigor` branding exists to make exactly that impossible.
//
// LAYERING. This file is `engine/`, so it knows nothing about `families/` — which sits above it, and
// which the sandbox does not have at all. The problem statements arrive as plain data from the
// caller, and Pass 5's result arrives as `SolvedSummary`, a structural supertype of
// `families/solveTarget.ts`'s `SolvedTarget`. No upward import, no adapter.
import {
  assembleVerdict,
  unknown,
  type Certificate,
  type Level,
  type Step,
  type Verdict,
} from "@cas/rigor";
import type { Claim } from "./claims.js";
import type { Cx } from "../kernel/geom.js";
import { formatPiExpSum } from "../kernel/expSum.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ContourIntegral } from "./contour/integrate.js";
import type { Piece } from "./contour/model.js";
import { LATEX } from "../kernel/notation.js";
import { constraintLabel, stageTitle, type StageId } from "./vocabulary.js";
import { valueRefusal, type ConstraintId, type LedgerResult, type LedgerRow } from "./ledger.js";
import { RESIDUE_THEOREM_IDENTITY, type ResidueTheoremResult } from "./residueTheorem.js";

// Declared in `vocabulary.ts` beside the titles it maps to (M8 step 0.2), re-exported here.
export type { StageId };

export interface StageSpec {
  readonly id: StageId;
  readonly title: string;
  /** Why this step is in the argument at all. Fixed text: it is a property of the METHOD, not of
   *  any particular integral, which is why it can be data rather than computed. */
  readonly why: string;
}

/**
 * The argument's shape, as data.
 *
 * Borrowed from QD's `prove-plan.mjs` `CERTIFY_STAGES` — an ordered, introspectable list whose
 * `run` the orchestrator walks — minus its orchestration: here the stages are already evaluated by
 * the ledger and Pass 5, so this array supplies only the ordering and the standing rationale.
 * DESIGN §4's six passes, with `setup` in front because a reader needs to know what is being
 * integrated before being told what vanishes.
 */
export const DERIVATION_STAGES: readonly StageSpec[] = [
  {
    id: "setup",
    title: stageTitle("setup"),
    why: "The integral to be evaluated, the integrand on the contour, and how the two are related.",
  },
  {
    id: "legality",
    title: stageTitle("legality"),
    why: "The contour is closed and meets no singularity; with a branch cut, the integrand is single-valued along it.",
  },
  {
    id: "catch",
    title: stageTitle("catch"),
    why: "The singularities, their winding numbers $\\operatorname{Ind}_\\gamma(a)$, and their residues.",
  },
  {
    id: "kill",
    title: stageTitle("kill"),
    why: "Each piece other than the target: a bound at finite $R$ (or $\\varepsilon$), and its limit.",
  },
  {
    id: "cover",
    title: stageTitle("cover"),
    why: "The target integral as a piece of the contour.",
  },
  {
    id: "solve",
    title: stageTitle("solve"),
    why: "The residue theorem, solved for the target.",
  },
  {
    id: "verdict",
    title: stageTitle("verdict"),
    why: "The rigor of the conclusion is the weakest of its steps: $=$ exact, $\\le$ rigorous bound, $\\approx$ numerical.",
  },
];

/** A statement of the PROBLEM, or a structural identity. Never levelled: nothing was established. */
export interface Statement {
  readonly label: string;
  readonly text: string;
}

/** One claim, with the evidence for it. Every field is read off a certificate. */
export interface DerivationLine {
  readonly text: string;
  /**
   * The same sentence as typed ARGUMENTS — M8 step 3.2.
   *
   * `text` is `renderClaim(claim)` and stays the line's display string; this is beside it so the
   * Derivation card can typeset a piece name as a name and put a scrub on a parameter's value,
   * instead of parsing a sentence back into its parts. Absent on the lines that come from a whole
   * VERDICT rather than from a ledger row — `lineFromVerdict` composes its text here and has no
   * claim to carry.
   */
  readonly claim?: Claim;
  /** The bound this line reports, as three numbers — see `LedgerRow.evaluated`. What a scrub writes. */
  readonly evaluated?: LedgerRow["evaluated"];
  readonly level: Level;
  readonly method: string;
  readonly status: "satisfied" | "failed" | "unknown";
  readonly restriction?: string;
  readonly provenance: readonly Step[];
  /** The piece this is about, when it is about one. */
  readonly pieceName?: string;
  /**
   * The same piece's ID — added at M8 step 1.5b so a derivation line can HIGHLIGHT its piece.
   *
   * The name is what a reader sees and the id is what the three surfaces agree on: the piece list,
   * the stage and the accumulator all key their highlight on `Piece.id`, and matching by name would
   * make the link break the first time two pieces were named alike (a keyhole's two lips are).
   */
  readonly pieceId?: string;
  readonly repair?: string;
}

/**
 * One pole, as data.
 *
 * DESIGN §4 Pass 2 requires the winding number and the enclosed count to be reported as separate
 * rows; this is that row. It carries **no `Level`**, deliberately: the levelled claim about the
 * residues is the CATCH line above it, whose certificate was minted in `kernel/poles.ts` where the
 * residues were actually computed. `basis` reports which path produced the number, which is a fact
 * about the data rather than a rigor label chosen here.
 */
export interface PoleRow {
  readonly at: Cx;
  readonly order: number;
  readonly orderCertain: boolean;
  readonly winding?: number;
  readonly windingDecided: boolean;
  /** The exact residue, when there is one. */
  readonly residue?: string;
  readonly basis: "exact" | "numeric";
  readonly possiblyRemovable: boolean;
}

export interface DerivationStage extends StageSpec {
  readonly statements: readonly Statement[];
  readonly lines: readonly DerivationLine[];
  readonly poles: readonly PoleRow[];
  /** True when any line in this stage failed — what a renderer opens by default. */
  readonly failed: boolean;
}

/**
 * Pass 5's result, in the shape this file needs.
 *
 * A structural supertype of `families/solveTarget.ts`'s `SolvedTarget`, so a caller passes that
 * straight in. Declared here rather than imported because `families/` is above `engine/` and the
 * sandbox has no family — an engine that needed one could not serve the sandbox at all.
 */
export interface SolvedSummary {
  readonly value: number;
  readonly text?: string;
  /** The same form typeset. */
  readonly latex?: string;
  readonly certificates: readonly Certificate[];
}

export interface DerivationInput {
  readonly ledger: LedgerResult;
  readonly poles: PoleReport;
  readonly integral: ContourIntegral;
  readonly theorem: ResidueTheoremResult;
  readonly spec: readonly Piece[];
  /** The problem as the caller can state it — a record has fields to read, the sandbox has an
   *  expression and nothing else. */
  readonly statements?: readonly Statement[];
  readonly solved?: SolvedSummary;
}

export interface Derivation {
  readonly stages: readonly DerivationStage[];
  readonly verdict: Verdict;
  /** Whether the argument finishes — which, when there is a target, requires Pass 5 as well. */
  readonly closes: boolean;
  readonly failedAt: ConstraintId | null;
  /** What the argument establishes, when it closes — badged from its OWN evidence. */
  readonly conclusion?: Conclusion;
}

export interface Conclusion extends Statement {
  readonly level: Level;
}

/**
 * The level an ANSWER carries — the badge beside the value, never the argument-wide meet.
 *
 * Lifted out of `shell/cards/result.ts` at the 2026-09-20 review, where it was the card's private
 * rule and this file had a second one (`assembleVerdict(solved.certificates)`). Its own reason is
 * unchanged: the record's verdict about the solved value is the THEOREM's where there is one,
 * because the ledger's meet carries a vanishing arc's `≤` — a true statement about the weakest step
 * and a false one about the answer (DESIGN §4 Pass 3).
 *
 * `engine/` rather than `shell/` because two surfaces read it and the card is only one of them; the
 * sandbox keeps its own `≈`, which is a fact about the sandbox and not about this function.
 */
export function levelOfSolved(
  theorem: Pick<ResidueTheoremResult, "exactValue" | "verdict">,
  integral: Pick<ContourIntegral, "verdict">,
): Level {
  return theorem.exactValue !== undefined ? theorem.verdict.level : integral.verdict.level;
}

const STAGE_OF: Readonly<Record<ConstraintId, StageId>> = {
  LEGALITY: "legality",
  CATCH: "catch",
  KILL: "kill",
  COVER: "cover",
};

/** A line from a ledger row. Nothing is composed: the row already holds a claim and a certificate. */
function lineFromRow(row: LedgerRow, spec: readonly Piece[]): DerivationLine {
  const piece =
    row.pieceId === undefined ? undefined : spec.find((p) => p.id === row.pieceId);
  return {
    text: row.claim,
    claim: row.claimData,
    ...(row.evaluated === undefined ? {} : { evaluated: row.evaluated }),
    level: row.evidence.level,
    method: row.evidence.method,
    status: row.status,
    ...(row.evidence.restriction === undefined
      ? {}
      : { restriction: row.evidence.restriction }),
    provenance: row.evidence.provenance,
    ...(piece === undefined ? {} : { pieceName: piece.name, pieceId: piece.id }),
    ...(row.repair === undefined ? {} : { repair: row.repair }),
  };
}

/**
 * A line for a quantity whose evidence is a whole verdict rather than one certificate.
 *
 * The level is the verdict's own — `assembleVerdict`'s meet — so nothing is asserted here; the
 * methods and provenance are the union of what the contributing certificates said.
 */
function lineFromVerdict(
  text: string,
  verdict: Verdict,
  status: DerivationLine["status"],
  opts?: { readonly method?: string; readonly onlyFailedSteps?: boolean },
): DerivationLine {
  const methods = [...new Set(verdict.certificates.map((c) => c.method))];
  const restriction = verdict.restrictions.join("; ");
  const steps = verdict.certificates.flatMap((c) => c.provenance);
  return {
    text,
    level: verdict.level,
    method:
      opts?.method ??
      (methods.length > 0 ? methods.join(" · ") : "no evidence was supplied"),
    status,
    ...(restriction === "" ? {} : { restriction }),
    // `onlyFailedSteps` is what `@cas/rigor`'s `failures()` is for: on a summary line the ✓ steps are
    // already shown against the stage that produced them, and repeating all of them buries the ✗.
    provenance: opts?.onlyFailedSteps === true ? steps.filter((x) => !x.ok) : steps,
  };
}

/** Pass 2's per-pole rows, from the pole report and the exactly-decided windings beside it. */
function poleRows(poles: PoleReport, integral: ContourIntegral): PoleRow[] {
  return poles.poles.map((pole) => {
    // Matched on the coordinate rather than on the index: `analyse` builds the two lists in step,
    // but a caller that did not would otherwise get a winding number attributed to the wrong pole.
    // Coordinate equality holds because the values are copied, not recomputed — and when it fails
    // the row reads "undecided" rather than reading a confident number off the wrong pole.
    const w = integral.windings.find(
      (x) => x.at[0] === pole.at[0] && x.at[1] === pole.at[1],
    );
    return {
      at: pole.at,
      order: pole.order,
      orderCertain: pole.orderCertain,
      ...(w !== undefined && w.decided ? { winding: w.n } : {}),
      windingDecided: w?.decided ?? false,
      ...(pole.residue === undefined ? {} : { residue: pole.residue.text }),
      basis: pole.isExact ? ("exact" as const) : ("numeric" as const),
      possiblyRemovable: pole.possiblyRemovable,
    };
  });
}

export function buildDerivation(input: DerivationInput): Derivation {
  const { ledger, poles, integral, theorem, spec, solved } = input;

  const lines = new Map<StageId, DerivationLine[]>();
  const statements = new Map<StageId, Statement[]>();
  const add = (id: StageId, line: DerivationLine): void => {
    const list = lines.get(id) ?? [];
    list.push(line);
    lines.set(id, list);
  };
  const say = (id: StageId, statement: Statement): void => {
    const list = statements.get(id) ?? [];
    list.push(statement);
    statements.set(id, list);
  };

  // ---- setup: the caller's statement of the problem -----------------------------------------
  for (const s of input.statements ?? []) say("setup", s);

  // ---- the four constraints: the ledger's own rows, verbatim --------------------------------
  for (const row of ledger.rows) add(STAGE_OF[row.constraint], lineFromRow(row, spec));

  // ---- SOLVE --------------------------------------------------------------------------------
  // The identity comes from the RESULT, not from this file: an exterior contour is solved by a
  // different equation, and printing the plain one above its answer would state the very thing D6
  // exists to show is inapplicable.
  say("solve", {
    label: "the residue theorem",
    text: theorem.identity ?? RESIDUE_THEOREM_IDENTITY,
  });
  // **THE GATE, and it is the app's — ADR-0045.** This card used to add the `∮` line on
  // `theorem.exactValue !== undefined` alone, so a LEGALITY refusal the result card beside it
  // honoured reached a reader here as `= 2πi`: measured on `1/(z+3)` over `|z+3| = 1` with a cut
  // down ℝ₋ and no side declared, where the ledger withholds its own `value` and this line printed
  // one anyway. The refusal takes the line's place rather than leaving a silence, because a reader
  // who saw a number here yesterday needs to be told why there is none today.
  const withheld = valueRefusal(integral, ledger, "contour");
  if (withheld !== null) {
    say("solve", {
      label: "no value",
      text:
        withheld.repair === undefined
          ? withheld.claim
          : `${withheld.claim} — ${withheld.repair}`,
    });
  } else if (theorem.exactValue !== undefined) {
    add(
      "solve",
      lineFromVerdict(
        `$\\oint_\\gamma f(z)\\,dz = ${theorem.exactValue.latex}$`,
        theorem.verdict,
        "satisfied",
      ),
    );
  }
  // The cross-check is a STATEMENT, not a levelled line. "The two routes agree to 2.7e-15" is an
  // observation about two computed numbers; no certificate was minted for the comparison, and
  // inventing a level for it here is the exact move this file exists to avoid. Its force comes from
  // the two routes sharing no machinery, which the text says outright.
  // Under the same gate: "the two routes agree to 2.7e-15" is a claim about a number, and a number
  // the app is refusing to print is not one it may corroborate either.
  if (theorem.agrees !== undefined && withheld === null) {
    say("solve", {
      label: "independent cross-check",
      text:
        theorem.crossCheck !== undefined
          ? `${theorem.crossCheck.claim} — ${theorem.crossCheck.restriction ?? "corroboration"}`
          : `numerical check: the quadrature differs by ${(theorem.disagreement ?? 0).toExponential(2)}; no value is reported`,
    });
  }

  // Pass 5 proper. The pieces that do NOT vanish are its input, and each one's evidence is already
  // rendered on its own KILL line above — so these are statements pointing back at it, not a second
  // levelled copy of the same claim.
  if (ledger.pieceLimits.length > 0) {
    for (const limit of ledger.pieceLimits) {
      const piece = spec.find((p) => p.id === limit.pieceId);
      // Pass 5's `bᵢ`. Worth stating separately because it is the term a reader would not expect: a
      // `vanish` piece that does not vanish. C1's indentation and C2's arc are the same π, arriving
      // on different pieces, and both are the whole difference between π/2 and 0.
      say("solve", {
        label: `${constraintLabel("KILL").toLowerCase()} · ${piece?.name ?? limit.pieceId}`,
        text: `contributes $${formatPiExpSum(limit.contribution, LATEX)}$ — a known limit, not zero`,
      });
    }
  }
  if (solved !== undefined) {
    say("solve", {
      label: "the system",
      text: "$\\sum_i (a_i t + b_i) = \\oint_\\gamma f(z)\\,dz$, solved for $t$",
    });
    add(
      "solve",
      lineFromVerdict(
        solved.text === undefined
          ? `$I \\approx ${solved.value}$`
          : `$I = ${solved.latex ?? solved.text}$`,
        assembleVerdict(solved.certificates),
        "satisfied",
      ),
    );
  }

  // ---- VERDICT ------------------------------------------------------------------------------
  //
  // WHEN `∮` IS THE ANSWER, AND WHEN IT IS NOT. `∮ f dz` and the target coincide exactly when every
  // non-target piece contributed nothing — the upper semicircle over `1/(1+z⁴)`, where the arc
  // vanishes and the diameter is all that is left. C1 is where that stops: its indentation pays
  // `−iπ·Res`, so reading `∮` there reports 0 for an integral whose value is π/2 (GALLERY §5.0b).
  // `pieceLimits` is precisely the list of pieces carrying a known non-zero limit, so it decides
  // this without a special case; a `reproduces` or `residue`-at-∞ piece breaks the coincidence too,
  // and is checked directly since it contributes no limit row.
  const extraPieces = spec.some((p) => p.role === "reproduces" || p.role === "residue");
  const targetIsClosedContour = ledger.pieceLimits.length === 0 && !extraPieces;
  const targetUnreached =
    ledger.hasTarget && solved === undefined && !targetIsClosedContour;

  // THE ONE CERTIFICATE THIS FILE MINTS, and the reason it is allowed to: `unknown` is the weakest
  // level that is not a refusal, so minting it can only ever WEAKEN a verdict. A renderer that could
  // mint `exact` or `bound` would be choosing its own labels, which is the failure `@cas/rigor`'s
  // branding exists to prevent; `unknown` cannot manufacture a claim, only withhold one.
  const extra = targetUnreached
    ? [
        unknown(
          "the target integral",
          "$\\oint_\\gamma f(z)\\,dz$ is established, but the target was not solved for",
        ),
      ]
    : [];

  // The meet over EVERYTHING, Pass 5 included. The ledger's own verdict cannot include Pass 5's
  // certificates, because Pass 5 runs outside it — so a record's label was previously assembled from
  // a strict subset of its own evidence.
  const verdict = assembleVerdict([
    ...ledger.verdict.certificates,
    ...(solved?.certificates ?? []),
    ...extra,
  ]);
  const closes = ledger.closes && !targetUnreached;
  add(
    "verdict",
    lineFromVerdict(
      closes ? "this argument closes" : "this argument does not close",
      verdict,
      closes ? "satisfied" : "failed",
      {
        method: `the meet over ${verdict.certificates.length} certificate${verdict.certificates.length === 1 ? "" : "s"} — the weakest step in the argument, not the label of the answer`,
        onlyFailedSteps: true,
      },
    ),
  );

  // Named for what it IS, and badged from ITS OWN evidence. When Pass 5 ran, the conclusion is the
  // integral; when it did not and `∮` is the answer, the conclusion is `∮` and says so — never the
  // closed-contour number wearing the integral's label.
  //
  // The level here is NOT the argument-wide meet above, and the difference is the one DESIGN §4
  // Pass 3 is emphatic about: a vanishing arc owes a `≤` bound at finite R and an `=` for the limit,
  // and Pass 5 consumes only the limit. Carrying the argument's meet onto the answer would cap every
  // gallery result at `≤` and contradict PLAN §2's own worked ledger, which prints `[≤]` on the KILL
  // row and `[=]` on the conclusion.
  //
  // It is {@link levelOfSolved} and not `assembleVerdict(solved.certificates)`, which is the 2026-09-20
  // review's B3: the result card has always used the first and this card used the second, and over the
  // 28 records × 94 fixtures they disagree exactly once — `jordan-quartic`, where the card read `=`
  // off the exponential-basis `∮` and this card read `?` off Pass 5's *"the target's closed form"*
  // certificate. One answer, two surfaces, two labels; the level now comes from one function.
  const conclusion: Conclusion | undefined = !closes
    ? undefined
    : solved !== undefined
      ? {
          label: "the integral",
          // `latex` before the decimal: a form the record found and could not spell in text is
          // still a form. (Measured on the one record that reaches the fallback — B3, whose
          // `solved` carries NEITHER, correcting the review's reading that its `latex` was present
          // and dropped — so this guards a shape the corpus does not currently have.) The `≈` on
          // the last fallback stays and is not a second badge: it labels the DECIMAL, the way the
          // result card's numerics block prints `≈ …` under an exact `∮`.
          text: solved.text ?? solved.latex ?? `≈ ${solved.value}`,
          level: levelOfSolved(theorem, integral),
        }
      : ledger.value !== undefined
        ? { label: "∮ f dz", text: ledger.value.text, level: theorem.verdict.level }
        : undefined;

  const stages = DERIVATION_STAGES.map((stage) => {
    const stageLines = lines.get(stage.id) ?? [];
    return {
      ...stage,
      statements: statements.get(stage.id) ?? [],
      lines: stageLines,
      poles: stage.id === "catch" ? poleRows(poles, integral) : [],
      failed: stageLines.some((l) => l.status === "failed"),
    };
  }).filter((s) => s.statements.length > 0 || s.lines.length > 0 || s.poles.length > 0);

  return {
    stages,
    verdict,
    closes,
    failedAt: ledger.failedAt,
    ...(conclusion === undefined ? {} : { conclusion }),
  };
}
