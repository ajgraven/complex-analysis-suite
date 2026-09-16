// The names the argument's parts go by ON SCREEN — and the one place they are decided.
//
// The Closing Ledger's four constraints are `LEGALITY / CATCH / KILL / COVER` in the code, and they
// stay that way: they key the contrast ladder's rows (`CONSTRAINT/role#n`), the drill's mask, the
// permalink and every test that reads a row. What they must never be is a **label**. A mathematician
// meeting `KILL` in a column beside a claim reads house jargon, and the four words are not even
// descriptive of what they check — M8 step 0.2.
//
// So: ids are data, labels are display, and neither is derived from the other by spelling. The two
// id spaces the app already had — a `ConstraintId` for a ledger row and a `StageId` for a derivation
// heading — are declared HERE rather than in `ledger.ts` and `derivation.ts`, because both of those
// modules need the labels and a type-only import back would be a cycle (`.dependency-cruiser.cjs`'s
// `no-circular` runs over type-only edges too). Each re-exports its own id type, so no consumer
// changed.
import type { PieceRole } from "./contour/model.js";

/** One of the Closing Ledger's four constraints. A DATA KEY: see {@link constraintLabel}. */
export type ConstraintId = "LEGALITY" | "CATCH" | "KILL" | "COVER";

/** One step of the generated derivation. A DATA KEY: see {@link stageTitle}. */
export type StageId =
  "setup" | "legality" | "catch" | "kill" | "cover" | "solve" | "verdict";

/**
 * What each constraint is called on screen.
 *
 * Textbook names for what the group actually checks: that the theorem's hypotheses hold, that the
 * residues and winding numbers are known, that every piece which is not the target is disposed of,
 * and that the target is on the contour at all.
 */
const GROUP: Readonly<Record<ConstraintId, string>> = {
  LEGALITY: "Hypotheses",
  CATCH: "Residues",
  KILL: "Boundary terms",
  COVER: "Target",
};

export function constraintLabel(id: ConstraintId): string {
  return GROUP[id];
}

/**
 * The derivation's headings.
 *
 * The four middle stages read their titles OUT OF {@link GROUP} rather than repeating them, so a
 * ledger row and the derivation heading above the same claim cannot come to disagree.
 */
const STAGE_TITLE: Readonly<Record<StageId, string>> = {
  setup: "The problem",
  legality: GROUP.LEGALITY,
  catch: GROUP.CATCH,
  kill: GROUP.KILL,
  cover: GROUP.COVER,
  solve: "Solution",
  verdict: "Conclusion",
};

export function stageTitle(id: StageId): string {
  return STAGE_TITLE[id];
}

/**
 * What a piece's role is called on screen, as a noun phrase.
 *
 * One map for two contexts — the tag on a piece in the contour list, and the bucket naming a row of
 * the contrast grid (`Boundary terms · vanishing piece 2`) — so the same piece cannot be a `vanish`
 * in one panel and a "vanishing piece" in the other. `"argument"` is not a `PieceRole`: it is the
 * bucket the contrast grid files a row under when the row names no piece at all.
 */
const ROLE: Readonly<Record<PieceRole | "argument", string>> = {
  target: "target",
  vanish: "vanishing piece",
  reproduces: "multiple of the target",
  // `circleTemplate`'s whole closed loop, and only that: the ledger does not bound it or read a
  // multiple off it, it INTEGRATES it — "is computed directly", in the row's own words.
  residue: "computed directly",
  free: "free piece",
  argument: "argument",
};

export function roleLabel(role: PieceRole | "argument"): string {
  return ROLE[role] ?? role;
}

/**
 * Why the argument does not close, naming the group that failed.
 *
 * The clause is the group's, not the row's: the failing row is printed directly beneath and says
 * which piece and why. Each clause is true of everything that group can refuse —
 *
 *  - `LEGALITY` refuses a singularity on the contour, an unclosed contour, an inadmissible cut
 *    system, non-integral monodromy, and a piece crossing a cut with no side declared;
 *  - `CATCH` has exactly one failure, an undecided winding number, so its clause can be exact;
 *  - `KILL` refuses a piece no lemma disposes of;
 *  - `COVER` is `satisfied` or `unknown` and **never** `failed` (`ledger.ts`: the sandbox has no
 *    target, which is not a failure), so its clause is unreachable today. It is written out because
 *    the type is total and a `?? ""` would hide the day that changes.
 */
const FAILS: Readonly<Record<ConstraintId, string>> = {
  LEGALITY: "the residue theorem does not apply",
  CATCH: "a residue is not determined",
  KILL: "a boundary term does not vanish",
  COVER: "the target is not on the contour",
};

export function headlineFails(id: ConstraintId): string {
  return `The argument is incomplete: ${FAILS[id]}.`;
}

/**
 * The three headlines that name no constraint.
 *
 * Named here rather than written inline in `ledgerHeadline` so the M8 review document can read what
 * the app says instead of carrying a copy. The copy was the defect: step 0.5b applied all three
 * proposals and the document went on printing the pre-0.5b sentences as *today*, so a reader was
 * told that finished work was outstanding — and a review document that misreports the code is worse
 * than none, because it is believed.
 */
/**
 * The cards the two rails hold, by id.
 *
 * M8 step 1.1. Here for the reason the constraint labels and the derivation titles are here: this
 * file is the one place the reader's words are decided, so a heading and the rows beneath it cannot
 * drift (step 0.2's decision). The scaffold builds these as empty cards and Phase 1 fills them in
 * one at a time; a card whose title lived in its own module would be a title nothing could survey.
 */
export type CardId =
  | "target"
  | "integrand"
  | "parameters"
  | "contour"
  | "cuts"
  | "singularities"
  | "result"
  | "derivation"
  | "share"
  /**
   * The drill's task card — M8 step 1.7.
   *
   * Not in {@link RIGHT_CARDS}: it is the right rail's TOP SLOT and appears only while a rung is
   * open, where every other card is always present. A card that renders `null` inside a `map` would
   * make the list's contract "a card, or nothing" for one member's sake.
   */
  | "drill";

const CARD_TITLES: Readonly<Record<CardId, string>> = {
  target: "Target",
  integrand: "Integrand",
  parameters: "Parameters",
  contour: "Contour",
  cuts: "Branch cuts",
  singularities: "Singularities",
  result: "Result",
  derivation: "Derivation",
  share: "Share",
  drill: "Drill",
};

/** The cards of the LEFT rail — what is being integrated — in the order they are read. */
export const LEFT_CARDS: readonly CardId[] = [
  "target",
  "integrand",
  "parameters",
  "contour",
  "cuts",
  "singularities",
];

/** The cards of the RIGHT rail — what the argument proves. */
export const RIGHT_CARDS: readonly CardId[] = ["result", "derivation", "share"];

export function cardTitle(id: CardId): string {
  return CARD_TITLES[id];
}

export const HEADLINES = {
  /** A record: the argument determines the integral it set out to determine. */
  closes: "The argument is complete.",
  /** The sandbox: there is no target, so what was established is the closed-contour value itself. */
  sandbox: "$\\oint_\\gamma f(z)\\,dz$ is established exactly.",
  /** It does not close, and no single constraint is the one that stopped it. */
  incomplete: "The argument is incomplete.",
} as const;
