// What a permalink must NOT carry.
//
// M8 step 1.1, plan §4.0. `ShellState` is the shareable half — the problem, the contour, the camera,
// the verdict a link reopens. This is the other half: where the pointer is, what is half-dragged,
// which rail is collapsed, what has been undone. The old shell kept all of it in roughly sixty
// module-level `let`s inside `mountApp`'s closure, and three of M7.4's defects were exactly that:
// `drillGraded` outlived its rung because `applyState` did not clear a local it could not see, and a
// half-drawn pen path survived leaving the sandbox because nothing owned it.
//
// Naming it makes those answerable. `applyState` resets the session's transient fields by
// construction rather than by remembering each one, and a field that should ride in a link is a
// field in the wrong object — a question with an answer instead of a habit.
import type { PenNode } from "../engine/contour/pen.js";
import type { Cx } from "../kernel/geom.js";
import type { ShellState } from "./state.js";

/** What the pointer is currently doing. `none` is not a gesture; it is the absence of one. */
export type Gesture = "none" | "contour" | "handle" | "branch" | "view" | "pen";

/** Which rails are folded to their 38 px labelled strip. */
export interface RailState {
  readonly left: boolean;
  readonly right: boolean;
}

/** What the pointer is over, for the readout and the three-way highlight (step 1.10). */
export interface Hover {
  /** The pointer in the plane, or null when it is not over the stage. */
  readonly z: Cx | null;
  /** The piece it is over or the row it is on — the same id from all three surfaces. */
  readonly piece: string | null;
  /** Which drag handle, when one is under the pointer. */
  readonly handle: number | null;
}

export const NO_HOVER: Hover = { z: null, piece: null, handle: null };

/**
 * A path being drawn, mid-gesture.
 *
 * **Not `PenPath`.** That is the finished object `penContour` reads — nodes and a `closed` flag. A
 * DRAFT additionally carries where the pointer is, which snap fired there, and which piece the
 * button is currently bowing, none of which survive committing. Declaring it here rather than inside
 * the controller is what lets the stage DRAW the snap chip without the controller reaching across to
 * paint it: the view reads the session, as it does for everything else transient.
 */
export interface PenDraft {
  nodes: PenNode[];
  /** The pending end, snapped. Null before the first click. */
  at: Cx | null;
  /** The constraint that fired, in words — research 07 rule 5: never snap silently. */
  snap: string | null;
  /** The piece a held button is bowing: the one ENDING at the vertex just placed (M7.2's defect). */
  drag: { readonly from: Cx; readonly index: number } | null;
}

/**
 * What the keyboard's arrows currently move, for the chip beside it.
 *
 * The plan's "a **visible label** of what is held (a small chip near the handle, not only the live
 * region)". A live region announces once and is then gone; a reader who tabs away and back, or who
 * is not using a screen reader at all, has no way to ask what Enter selected. `at` is in PLOT
 * coordinates, so the chip follows its handle through a pan and a zoom without the controller
 * having to move it.
 */
export interface Held {
  readonly label: string;
  readonly at: Cx;
}

export interface Session {
  gesture: Gesture;
  /** The path being drawn, or null. Deliberately not restorable: a half-drawn path is not a state. */
  pen: PenDraft | null;
  /** What the arrow keys move, or null when they pan. Set by `cycleGrab` and by a pointer grab. */
  held: Held | null;
  /**
   * Whether a SLIDER is being dragged.
   *
   * `gesture` covers the stage; a rail slider's scrub is the same thing happening somewhere the
   * stage cannot see, and the draft evaluation budget has to apply to both or a parameter drag
   * recomputes at full precision on every pointer move. The sliders that set it arrive with the
   * cards at steps 1.4 and 1.5; the budget reads it from here today.
   */
  scrubbing: boolean;
  hover: Hover;
  /**
   * Undo and redo hold whole `ShellState`s; the stacks are session-local and a link clears both.
   *
   * **Whole states, not diffs** — M8 step 1.11. A `ShellState` is plain data and `commit` already
   * replaces it wholesale, so an entry is the object that was current a moment ago and restoring it
   * is `commit`. A diff would have to know which fields exist, which is the one thing about this
   * state that keeps changing.
   */
  undo: ShellState[];
  redo: ShellState[];
  /** Whether the drill's current rung has been graded — which unmasks the derivation (M7.4's bug). */
  drillGraded: boolean;
  /**
   * Which derivation step the stepper is on, or `"all"` for every step at once — M8 step 3.1b.
   *
   * **SESSION, not state**, by the rule that decides every field here: `ShellState` is the argument
   * and this is where the reader's hands are. Two readers of the same permalink are looking at the
   * same integral; which step of its derivation each has open is theirs.
   *
   * `"all"` is the default and is the Phase 1 form — every step expanded, the whole argument at
   * once — so a reader who never touches the stepper sees exactly what they saw before it existed.
   * Worked-example mode opens at step 0 instead, which is the plan's *open by default at step 1*.
   * An out-of-range index is clamped where it is read rather than validated here, because the step
   * count changes with the record and a stale index is the ordinary case rather than an error.
   */
  step: number | "all";
  rails: RailState;
  /** Which `<details>` are open, by id. Read from here and never from the DOM, so a patch cannot
   *  silently close one — the old shell's disclosures lost their state whenever a card rebuilt. */
  open: Record<string, boolean>;
  /**
   * What just happened, for the reader — "Link copied", "Could not copy the figure".
   *
   * **Transient by construction**: it is the outcome of an action the reader took a moment ago, so a
   * restored state must not arrive claiming a link was copied. `level` is the honest-labelling
   * vocabulary rather than a severity, so a notice cannot claim more than the app knows.
   */
  notice: { readonly text: string; readonly level: "=" | "≤" | "≈" | "⚠" } | null;
  /**
   * Whether the contrasts dialog is open.
   *
   * SESSION, not state: a dialog is where the reader's hands are, and a permalink that reopened one
   * would hand someone else a modal over the thing they came to look at.
   */
  contrastsOpen: boolean;
  /**
   * Whether the front door — the worked-example picker — is open.
   *
   * SESSION, for {@link Session.contrastsOpen}'s reason: a dialog is where the reader's hands are,
   * and a permalink that reopened one would hand someone else a modal over the thing they came to
   * look at. Opening a card is an `applyState`, so `resetTransient` puts it away by construction.
   */
  frontDoorOpen: boolean;
  /**
   * The drill's answer sheet for the rung that is open — rung ii's pick per piece, rung iv's check.
   *
   * **HERE rather than in a `WeakMap` beside the panel**, which is where it first landed. That map
   * would be correct — keyed by the session, and internally by `task/stage` so a scratch cannot
   * outlive its rung — and it is still the shape this file exists to replace: the old shell kept
   * roughly sixty module-level `let`s inside `mountApp`'s closure, and three of M7.4's defects were
   * exactly that, a value the door could not see and therefore did not clear. `resetTransient`
   * clears by construction; a scratch that reset itself by deriving its own key is one more thing
   * to get right in a second place.
   */
  drillAnswers: Record<string, string | undefined>;
  /** Rung iv's last enclosure check, or null. Same reasoning as {@link Session.drillAnswers}. */
  drillDrawn: unknown;
  /**
   * Whether the drill's TASK LIST is showing in the right rail's top slot.
   *
   * SESSION, for {@link Session.contrastsOpen}'s reason and one of its own: a reader who is choosing
   * a task is not in the drill yet — `shellMode` says Drill when a RUNG is open — so this is where
   * their hands are rather than part of the argument, and a permalink that reopened the chooser
   * would hand someone else a menu over the thing they came to look at. Picking a task is an
   * `applyState`, so `resetTransient` puts the list away without anyone remembering to.
   */
  drillPicker: boolean;
  /**
   * Why the link this page was opened with could not be honoured, or null.
   *
   * **A refusal is not an absence** — M6.2's third finding. `decodeShell` returns `null` for *there
   * was no link* and a named reason for *there was one and I cannot honour it*, and the second must
   * be SHOWN: a link that cannot be opened must never open something plausible instead and say
   * nothing about it. It is not a {@link Session.notice} because it is not the outcome of anything
   * the reader did — it is a fact about how they arrived, and it outlives the six seconds a notice
   * would have got.
   */
  linkRefusal: string | null;
}

/**
 * The session the app boots with.
 *
 * A function rather than a constant: every field is mutable by design, so a shared object would let
 * one mounted shell's hover state reach another's — which the tests, mounting repeatedly into a
 * fresh root, would find in the least obvious way.
 */
export function defaultSession(): Session {
  return {
    gesture: "none",
    pen: null,
    held: null,
    scrubbing: false,
    hover: NO_HOVER,
    undo: [],
    redo: [],
    drillGraded: false,
    step: "all",
    rails: { left: false, right: false },
    open: {},
    notice: null,
    contrastsOpen: false,
    frontDoorOpen: false,
    drillAnswers: {},
    drillDrawn: null,
    drillPicker: false,
    linkRefusal: null,
  };
}

/**
 * Clear everything a restored state must not inherit.
 *
 * Called by `applyState`. **This is the list M7.4 found by reading rather than by failing**: a
 * grading that outlived its rung, a pen path the reader never drew, a hover pointing at a piece the
 * new state does not have. The rails, the disclosures and the figure theme are the reader's own
 * preferences and deliberately survive — opening a link should not fold their panels.
 *
 * **The undo stacks are NOT on the list, and were, until they had a second caller.** M8 step 1.11's
 * `restore` puts a state back from those stacks and has to clear the same transient half — and
 * clearing the stacks there wiped the redo stack the undo had just filled, so a reader could step
 * back and never forward. The two callers want different things, which is the sign that the stacks
 * do not belong here: a LINK must not inherit them, and `undo.ts`'s `"link"` rule clears them in
 * the module that owns them, which is the only place that knows what a run or a coalescing window
 * is. Measured: without this, redo after a drag returned the state it had just left.
 */
export function resetTransient(session: Session): void {
  session.gesture = "none";
  session.pen = null;
  session.held = null;
  session.scrubbing = false;
  session.hover = NO_HOVER;
  session.drillGraded = false;
  // **The step is the reader's place in an argument, and a new state is a new argument.** M7.4's
  // finding, in its own shape: `drillGraded` outlived its rung because a shell local was not
  // cleared here. A restored link, a contrast cell or a drill rung all arrive through `applyState`;
  // holding step 4 of the previous record's derivation open over them would be the same defect.
  session.step = "all";
  session.drillAnswers = {};
  session.drillDrawn = null;
  session.drillPicker = false;
  session.notice = null;
  session.contrastsOpen = false;
  session.frontDoorOpen = false;
  // The reader has gone somewhere else; a sentence about the link they arrived on is no longer
  // about them. `writeHash` clears it on the reader's first action for the same reason.
  session.linkRefusal = null;
}
