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
import type { Cx } from "../kernel/geom.js";
import { formatPiExpSum, type ExpSum } from "../kernel/expSum.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ContourIntegral } from "./contour/integrate.js";
import type { Piece } from "./contour/model.js";
import type { ConstraintId, LedgerResult, LedgerRow } from "./ledger.js";
import type { ResidueTheoremResult } from "./residueTheorem.js";

export type StageId = "setup" | "legality" | "catch" | "kill" | "cover" | "solve" | "verdict";

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
    title: "The problem",
    why: "What is being integrated, and over what. The contour integrand is not the posed integrand whenever the substitution has a Jacobian, and conflating the two is the single commonest error in the subject.",
  },
  {
    id: "legality",
    title: "LEGALITY",
    why: "The right to print anything at all: no piece may pass through a singularity, the contour must close, and its orientation must be declared. Run first, because everything downstream is meaningless if it fails.",
  },
  {
    id: "catch",
    title: "CATCH",
    why: "The singular set and the residue sum. The winding number and the enclosed-pole count are separate rows on purpose — one number implying the other is the conflation the dogbone exists to break.",
  },
  {
    id: "kill",
    title: "KILL",
    why: "Per-piece disposal. A vanishing piece owes two distinct statements: a bound at the finite limit parameter, and the limit itself. Only the second enters the solve.",
  },
  {
    id: "cover",
    title: "COVER",
    why: "The target appears as a labelled piece, under the declared substitution. In the sandbox there is no target, COVER is vacuous, and the closed-contour value is the result.",
  },
  {
    id: "solve",
    title: "SOLVE",
    why: "The contour identity, solved for the real integral it was built to find. Worked in units of π throughout, so π is never evaluated and π/2 stays π/2.",
  },
  {
    id: "verdict",
    title: "VERDICT",
    why: "The label is the meet over every step's certificate — computed from what was established, never chosen. One unknown step makes the whole claim unknown; one refusal refuses it.",
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
  readonly level: Level;
  readonly method: string;
  readonly status: "satisfied" | "failed" | "unknown";
  readonly restriction?: string;
  readonly provenance: readonly Step[];
  /** The piece this is about, when it is about one. */
  readonly pieceName?: string;
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
  /** `t/π`, exactly. Printed as the identity Pass 5 actually solved. */
  readonly piUnits: ExpSum;
  readonly value: number;
  readonly text?: string;
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

const STAGE_OF: Readonly<Record<ConstraintId, StageId>> = {
  LEGALITY: "legality",
  CATCH: "catch",
  KILL: "kill",
  COVER: "cover",
};

/** A line from a ledger row. Nothing is composed: the row already holds a claim and a certificate. */
function lineFromRow(row: LedgerRow, spec: readonly Piece[]): DerivationLine {
  const piece = row.pieceId === undefined ? undefined : spec.find((p) => p.id === row.pieceId);
  return {
    text: row.claim,
    level: row.evidence.level,
    method: row.evidence.method,
    status: row.status,
    ...(row.evidence.restriction === undefined ? {} : { restriction: row.evidence.restriction }),
    provenance: row.evidence.provenance,
    ...(piece === undefined ? {} : { pieceName: piece.name }),
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
    method: opts?.method ?? (methods.length > 0 ? methods.join(" · ") : "no evidence was supplied"),
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
    const w = integral.windings.find((x) => x.at[0] === pole.at[0] && x.at[1] === pole.at[1]);
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
  say("solve", {
    label: "the residue theorem",
    text: "∮ f dz = 2πi Σₖ n(γ,aₖ)·Res(f,aₖ)",
  });
  if (theorem.exactValue !== undefined) {
    add("solve", lineFromVerdict(`∮ f dz = ${theorem.exactValue.text}`, theorem.verdict, "satisfied"));
  }
  // The cross-check is a STATEMENT, not a levelled line. "The two routes agree to 2.7e-15" is an
  // observation about two computed numbers; no certificate was minted for the comparison, and
  // inventing a level for it here is the exact move this file exists to avoid. Its force comes from
  // the two routes sharing no machinery, which the text says outright.
  if (theorem.agrees !== undefined) {
    say("solve", {
      label: "independent cross-check",
      text:
        theorem.crossCheck !== undefined
          ? `${theorem.crossCheck.claim} — ${theorem.crossCheck.restriction ?? "corroboration"}`
          : `the quadrature DISAGREES by ${(theorem.disagreement ?? 0).toExponential(2)} — one of the two is wrong, so no value is reported`,
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
        label: `from KILL · ${piece?.name ?? limit.pieceId}`,
        text: `contributes ${formatPiExpSum(limit.contribution)} — a known limit, not zero`,
      });
    }
  }
  if (solved !== undefined) {
    say("solve", {
      label: "the system",
      text: "Σᵢ (aᵢ·t + bᵢ) = ∮ f dz, solved for t — worked in units of π, so π is never evaluated and π/2 stays π/2",
    });
    add(
      "solve",
      lineFromVerdict(
        solved.text === undefined
          ? `the integral ≈ ${solved.value}`
          : `the integral = ${solved.text}`,
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
  const targetUnreached = ledger.hasTarget && solved === undefined && !targetIsClosedContour;

  // THE ONE CERTIFICATE THIS FILE MINTS, and the reason it is allowed to: `unknown` is the weakest
  // level that is not a refusal, so minting it can only ever WEAKEN a verdict. A renderer that could
  // mint `exact` or `bound` would be choosing its own labels, which is the failure `@cas/rigor`'s
  // branding exists to prevent; `unknown` cannot manufacture a claim, only withhold one.
  const extra = targetUnreached
    ? [
        unknown(
          "the target integral",
          "the closed-contour value is established, but a piece carries a known non-zero limit and Pass 5 did not run — so the target was never extracted from it",
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
  const conclusionVerdict = solved !== undefined ? assembleVerdict(solved.certificates) : theorem.verdict;
  const conclusion: Conclusion | undefined = !closes
    ? undefined
    : solved !== undefined
      ? { label: "the integral", text: solved.text ?? `≈ ${solved.value}`, level: conclusionVerdict.level }
      : ledger.value !== undefined
        ? { label: "∮ f dz", text: ledger.value.text, level: conclusionVerdict.level }
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
