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
  /** Undo and redo hold whole `ShellState`s; the stacks are session-local and a link clears both. */
  undo: unknown[];
  redo: unknown[];
  /** Whether the drill's current rung has been graded — which unmasks the derivation (M7.4's bug). */
  drillGraded: boolean;
  rails: RailState;
  /** Which `<details>` are open, by id. Read from here and never from the DOM, so a patch cannot
   *  silently close one — the old shell's disclosures lost their state whenever a card rebuilt. */
  open: Record<string, boolean>;
  /** The theme the figure export draws in; not a property of the argument, so not in the link. */
  figureTheme: "light" | "dark";
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
    rails: { left: false, right: false },
    open: {},
    figureTheme: "light",
    notice: null,
    contrastsOpen: false,
  };
}

/**
 * Clear everything a restored state must not inherit.
 *
 * Called by `applyState`. **This is the list M7.4 found by reading rather than by failing**: a
 * grading that outlived its rung, a pen path the reader never drew, a hover pointing at a piece the
 * new state does not have. The rails, the disclosures and the figure theme are the reader's own
 * preferences and deliberately survive — opening a link should not fold their panels.
 */
export function resetTransient(session: Session): void {
  session.gesture = "none";
  session.pen = null;
  session.held = null;
  session.scrubbing = false;
  session.hover = NO_HOVER;
  session.undo = [];
  session.redo = [];
  session.drillGraded = false;
  session.notice = null;
  session.contrastsOpen = false;
}
