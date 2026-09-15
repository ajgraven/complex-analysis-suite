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
import type { PenPath } from "../engine/contour/pen.js";
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

export interface Session {
  gesture: Gesture;
  /** The path being drawn, or null. Deliberately not restorable: a half-drawn path is not a state. */
  pen: PenPath | null;
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
    hover: NO_HOVER,
    undo: [],
    redo: [],
    drillGraded: false,
    rails: { left: false, right: false },
    open: {},
    figureTheme: "light",
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
  session.hover = NO_HOVER;
  session.undo = [];
  session.redo = [];
  session.drillGraded = false;
}
