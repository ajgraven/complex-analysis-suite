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
export type StageId = "setup" | "legality" | "catch" | "kill" | "cover" | "solve" | "verdict";

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
  LEGALITY: "the hypotheses do not hold",
  CATCH: "a winding number could not be decided",
  KILL: "a boundary term is not disposed of",
  COVER: "the target is not a piece of the contour",
};

export function headlineFails(id: ConstraintId): string {
  return `This argument does not close: ${FAILS[id]}.`;
}
