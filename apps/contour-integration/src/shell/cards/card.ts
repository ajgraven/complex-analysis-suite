// What a card IS — M8 step 1.4, plan §4.0.
//
// `(state, resolution, session, actions) → description`. Four arguments and no closure: a card never
// reaches into the shell, so everything it can do is a named function on {@link ShellActions} and
// everything it can read is one of the three objects above. That is what lets every card be rendered
// and asserted in jsdom without mounting anything, and what stops the old shell's habit of a render
// path recomputing a number the ledger already decided.
//
// **The card builds its own `<section>`**, heading included, so the rail is a `map` rather than a
// list of special cases — and the page's heading outline (one of the four structural invariants
// `test/shell2.test.ts` asserts) holds by construction rather than by each card remembering.
import type { StageMode } from "../../ui/stage/mode.js";
import { cardTitle, type CardId } from "../../engine/vocabulary.js";
import type { BranchChoice } from "../../kernel/branch/model.js";
import type { PoleReport } from "../../kernel/poles.js";
import type { DeclarationState } from "../../shell/state.js";
import type { ShellMode, ShellState, StateResolution } from "../../shell/state.js";
import { h, type Child, type Desc } from "../dom.js";
import type { Session } from "../session.js";

/** Everything a card may CALL. Implemented once, in `mountShell2`. */
export interface ShellActions {
  /** Frame the whole contour. Also on double-click — one function, two ways to ask for it. */
  readonly fitContour: () => void;
  /** Replace the sandbox expression (the integrand, or the cofactor under a declaration). */
  readonly setExpr: (src: string) => void;
  /** Choose a record's fixture, by index into `family.golden`. */
  readonly setFixture: (index: number) => void;
  /** Move one parameter, through whichever channel owns it (`withParam`). */
  readonly setParam: (name: string, value: number) => void;
  /**
   * A slider's pointer is down, or up.
   *
   * The stage's `gesture` cannot see a rail slider, and without this a parameter scrub recomputes at
   * full precision on every pointer move. It redraws rather than recomputing: the flag is read by
   * the NEXT commit, which the slider's own `input` handler makes.
   */
  readonly setScrubbing: (on: boolean) => void;
  /** What the pointer is over, by piece id or `pole:x,y` — the three-way highlight (step 1.10). */
  readonly hover: (piece: string | null) => void;

  // ── the contour (step 1.4b) ───────────────────────────────────────────────────────────────
  /** Replace the contour with a template, seeding whatever cut system its shape presupposes. */
  readonly setTemplate: (id: string) => void;
  /** The same curve, walked the other way — `∮` changes sign. Sandbox only. */
  readonly reverseContour: () => void;
  /** The pen. Straight through to the stage controller, which owns the drawing state. */
  readonly penStart: () => void;
  readonly penStop: () => void;
  readonly penBack: () => void;
  readonly penCommit: (closed: boolean) => void;

  // ── the branch cuts (step 1.4b) ───────────────────────────────────────────────────────────
  /**
   * Replace the whole cut system.
   *
   * ONE action for add / remove / order / join / split / shadow / sheet, because every one of those
   * is already a pure `BranchChoice → BranchChoice` in `engine/branchEdit.ts`. Seven actions that
   * each re-derived the same write would be seven places for the recompute to be forgotten.
   */
  readonly setBranch: (next: BranchChoice) => void;
  /** The modulus-contour overlay. `null` in the state means "whatever the determination implies". */
  readonly setIso: (on: boolean) => void;
  /**
   * Which portrait the stage draws — `ui/stage/mode.ts`.
   *
   * A VIEW action: it cannot reach a number, and `resolveState` does not read the field. It is an
   * action rather than a session write because the mode is in the state and therefore in a link —
   * what the reader is LOOKING at is part of what a permalink shares.
   */
  readonly setStageMode: (mode: StageMode) => void;
  /** Declare a factor on a branch point: the box then holds `R(z)`. */
  readonly declare: (pointId: string) => void;
  /** Put the whole integrand back in the box — the expression that was TYPED, not the cofactor. */
  readonly undeclare: () => void;
  /**
   * Edit the declared factor, optionally rebuilding the cut with it.
   *
   * The second argument is not a convenience: **declaring the determination IS declaring the cut**,
   * so a window change that left the geometry alone would make the two disagree about where the
   * discontinuity is. Passing them together is what makes that unrepresentable.
   */
  readonly setDeclaration: (next: DeclarationState, cut?: BranchChoice) => void;

  // ── the right rail (step 1.5) ─────────────────────────────────────────────────────────────
  /**
   * Open or close a disclosure, by id.
   *
   * Recorded in the SESSION rather than read off the DOM, because a patch that rebuilt a
   * `<details>` would otherwise silently close it — the old shell's disclosures lost their state
   * whenever a card re-rendered. It redraws nothing: the state is read on the next render, and the
   * element the reader just clicked is already in the state they clicked it into.
   */
  readonly setOpen: (id: string, open: boolean) => void;
  /**
   * Put the permalink for the CURRENT state on the clipboard.
   *
   * The card asks `encodeShell` itself for the REFUSAL, because that is a pure question about the
   * state and belongs in the description; this is the side effect, and it reports its own outcome
   * through `session.notice` rather than returning one — a description cannot await a promise.
   */
  readonly copyLink: () => void;
  /** Download the figure as a PNG, in the named plate theme. */
  readonly saveFigure: (theme: "dark" | "light" | "print") => void;
  /** The same plate, onto the clipboard. Refuses by name where the browser cannot. */
  readonly copyFigure: () => void;

  // ── modes, the bar and the panels (step 1.7) ──────────────────────────────────────────────
  /**
   * Put the app in a mode.
   *
   * The mode is DERIVED from the state (`shellMode`), so this writes whichever field that
   * derivation reads: Drill sets `drill`, Worked example sets `workedExample`, Explore clears
   * both. One action rather than three toggles, because two toggles can be true at once and a
   * derived mode cannot.
   */
  readonly setMode: (mode: ShellMode) => void;
  /** Fold or unfold a rail. The reader's own preference, so it survives a link. */
  readonly setRail: (side: "left" | "right", folded: boolean) => void;
  /** Leave whatever record is open and go to the sandbox, keeping the parked sandbox contour. */
  readonly toSandbox: () => void;
  /** Open or shut the contrasts dialog. */
  readonly setContrastsOpen: (open: boolean) => void;
  /** Apply a whole state — a contrast cell, a drill rung, a front-door card. */
  readonly applyState: (next: ShellState) => void;
  /**
   * Step back and forward through the reader's own edits — M8 step 1.11.
   *
   * Actions rather than a keyboard handler's private business, for the reason every other control
   * here is one: the keyboard is a way of asking, not the thing being asked. A test drives them
   * directly, and a button in a later step would drive the same pair.
   */
  readonly undo: () => void;
  readonly redo: () => void;
  /**
   * Open the front door — step 1.8 builds it.
   *
   * Declared now and **deliberately inert**, so the bar's record button exists in the shape it will
   * keep. It announces that it is not built rather than doing nothing silently: a control that
   * swallows a click teaches a reader the app is broken.
   */
  readonly openFrontDoor: () => void;
  /** Say something in the honest-labelling vocabulary — the Share card's notice channel, shared. */
  readonly notify: (text: string, level: "=" | "≤" | "≈" | "⚠") => void;
  /**
   * Repaint the chrome without recomputing.
   *
   * For a change that is the SESSION's — a grading, a rung's answer sheet, a fold — where `commit`
   * would re-resolve the whole state to redraw a panel and `applyState` would clear the very
   * session fields the caller just wrote. The drill panel had been reporting a grading through
   * `notify` for want of this, which made a sentence out of a repaint.
   */
  readonly redraw: () => void;
}

/** What every card is handed. */
export interface CardContext {
  readonly state: ShellState;
  readonly resolution: StateResolution;
  readonly session: Session;
  /**
   * The poles, passed in rather than read off the resolution — the stage's own reason (1.3): a
   * record's come from its `run`, the sandbox's from the cached `compile`, and `resolveState`
   * returns neither, since `Analysis` carries the ledger and not the pole report.
   */
  readonly poles: PoleReport | null;
  readonly actions: ShellActions;
}

export type Card = (ctx: CardContext) => Desc;

/**
 * A card's shell: the keyed `<section>`, its `<h2>`, and whatever the card put in it.
 *
 * `data-card` is how every test addresses a card, and `key` is what keeps the node — and so the
 * focus in its inputs — across a patch (`dom.ts` rule 1).
 */
export function card(id: CardId, ...body: Child[]): Desc {
  return h(
    "section",
    { key: `card:${id}`, class: "card2", "data-card": id },
    h("h2", { key: "t" }, cardTitle(id)),
    ...body,
  );
}

/** The em-dash a card shows where there is nothing to show. Never a number, never a blank. */
export function nothing(reason: string): Desc {
  return h("p", { key: "none", class: "placeholder" }, reason);
}

/**
 * A disclosure whose default is a COMPUTED fact and whose explicit state is the reader's.
 *
 * `session.open[id]` is tri-state on purpose: `undefined` is "never touched", which is what lets the
 * hypothesis table open itself the moment a row fails and STAY closed afterwards if the reader has
 * shut it. A boolean with a false default cannot express that, and one with a true default would
 * re-open on every recompute — and a derivation recomputes on every frame of a contour drag, so the
 * second failure mode is a panel that will not stay shut while the reader is dragging.
 *
 * **Here since M8 step 2.2, where the Target card became the third consumer.** `result.ts` and
 * `derivation.ts` carried byte-identical copies, differing only in the last sentence of the comment
 * above; the second-consumer rule was already past when the second one was written.
 */
export function disclosure(
  ctx: CardContext,
  id: string,
  byDefault: boolean,
  summary: Child,
  ...body: Child[]
): Desc {
  const open = ctx.session.open[id] ?? byDefault;
  return h(
    "details",
    {
      key: `d:${id}`,
      open,
      onToggle: (e: Event) => {
        const el = e.target as HTMLDetailsElement;
        if (el.open !== (ctx.session.open[id] ?? byDefault)) ctx.actions.setOpen(id, el.open);
      },
    },
    h("summary", { key: "s" }, summary),
    ...body,
  );
}
