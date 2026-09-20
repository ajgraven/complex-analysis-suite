// Undo and redo — M8 step 1.11, plan §1.11.
//
// **The arrays are four lines; the module is the question "was that an EDIT?"** `commit(next, why)`
// is the app's one door, so everything comes past here: a body drag's two hundred frames, a wheel
// spin's dozens, a keypress's one, and `endGesture`'s commit of the state it was already in. A stack
// that took them all would leave a reader two hundred presses away from where they were a second
// ago, which is not an undo stack — it is a recording.
//
// So the rules below all say one thing: **an entry must be somewhere a reader could want to go back
// to.** A frame of a drag is not; the state before the drag is. The camera is not, ever, and that is
// not a convenience — `ShellState` files `view` under *"none of this can change a number"*, so
// undoing a pan would restore nothing about the argument while costing the reader the edit they
// actually meant to take back.
//
// **The stacks live on the {@link Session}**, not in this closure. `resetTransient` already empties
// them, which is the M7.4 lesson the whole of `shell2/` is built on: a value the door cannot see is
// a value the door does not clear. This module owns the POLICY; the session owns the data.
import type { ShellState } from "./state.js";
import type { Session } from "./session.js";
import { stableKey } from "./stableKey.js";

/**
 * Why a commit happened.
 *
 * **Declared HERE and re-exported by `app.ts`, which used to own it.** `app.ts` imports this module,
 * and `dependency-cruiser`'s `no-circular` runs with `tsPreCompilationDeps: true` — type-only edges
 * are in the graph — so importing the name the other way would be a cycle. The first draft of this
 * module answered that by declaring a second copy, which drifted within the hour: `"restore"` was
 * added to `app.ts`'s copy and the two stopped being the same union. One declaration, in the module
 * whose whole job is to read it.
 */
export type CommitReason =
  | "init"
  | "edit"
  /**
   * An edit that is ALWAYS its own entry — M8 step 4.3.
   *
   * **Rule 7's coalescing is about one control moved repeatedly**, which is what it says: ten arrow
   * nudges of one handle are one entry, because the reader is making one adjustment and expects one
   * step back from it. A list editor's controls are not that. Deleting two pieces inside a second is
   * two deletions of two different pieces, and `changeKey` cannot tell them apart — every contour
   * edit changes the same three fields, so under `"edit"` the second would silently absorb the
   * first and one press of Ctrl+Z would bring back neither.
   *
   * So the distinction is the CALLER's, because only the caller knows whether a repeat is the same
   * adjustment continued or a second act. Inline renaming still commits as `"edit"` for exactly that
   * reason: typing is one adjustment.
   */
  | "edit-step"
  | "gesture"
  | "gesture-end"
  | "link"
  /**
   * A state put back by undo or redo.
   *
   * Its own reason because it is the one commit that must NOT become an entry: an `"edit"` here
   * would push the state the reader has just stepped away from, and the second press of Ctrl+Z
   * would bring it back. It is not `"link"` either, which clears the stacks — and a redo with
   * nothing to go forward to is what that would leave.
   */
  | "restore";

/** The plan's cap. Whole `ShellState`s, so a hundred of them is the thing being bounded. */
const DEFAULT_LIMIT = 100;

/** The plan's coalescing window, in ms. See {@link UndoStacks.record} rule 6 for what it buys. */
const DEFAULT_COALESCE_MS = 800;

/** What {@link changeKey} returns when the camera moved and nothing else did. */
const CAMERA_KEY = "view";

export interface UndoStacks {
  /**
   * Note that the state moved from `prev` to `next` for reason `why`. Decides for itself whether
   * that is an undo entry.
   *
   * The rules, in the order they are applied:
   *
   *  1. **`link`** clears both stacks. A link is an arrival, not an edit: the states before it
   *     belong to a different reading, and going "back" into them from a link someone else sent
   *     would be going somewhere the reader has never been. It clears even when the link happens to
   *     land on the state already showing — how the reader got here is what changed.
   *  2. **`init`** is no entry. There is no previous state to go back to.
   *  3. **`gesture-end` and `edit` close any open run** (rule 5), before anything below can return.
   *  4. **Nothing changed** is no entry. `endGesture` commits the state it already has, and an entry
   *     there would be an undo that does nothing — worse than no undo, because the reader presses it
   *     again and loses the edit before.
   *  5. **Camera-only** is no entry, whatever the reason: pan, wheel and keyboard zoom, and the
   *     double-click fit, which all commit `view` alone.
   *  6. **`gesture`** pushes on the first frame and marks a run open; the rest of the drag pushes
   *     nothing. `gesture-end` closes the run and never pushes — the state before the drag was taken
   *     at its first frame, and that is the one entry a drag is worth.
   *  7. **`edit`** pushes, unless the previous PUSH carried the same {@link changeKey} less than
   *     `coalesceMs` ago, in which case the earlier entry stands. That is what makes ten arrow
   *     nudges of one handle a single entry.
   *  8. Any push clears the redo stack and trims the undo stack to `limit` from the OLD end.
   */
  record(prev: ShellState, next: ShellState, why: CommitReason, now?: number): void;
  /** The state to go back to, or `null`. Moves `current` onto the redo stack. */
  undo(current: ShellState): ShellState | null;
  /** The state to go forward to, or `null`. Moves `current` onto the undo stack. */
  redo(current: ShellState): ShellState | null;
  clear(): void;
  readonly depth: { readonly undo: number; readonly redo: number };
}

/** The stacks live on the SESSION, so `resetTransient` keeps clearing them. */
export function createUndo(
  session: Pick<Session, "undo" | "redo">,
  opts?: { readonly limit?: number; readonly coalesceMs?: number },
): UndoStacks {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const coalesceMs = opts?.coalesceMs ?? DEFAULT_COALESCE_MS;

  /** Whether a pointer gesture has already put its entry on the stack. */
  let runOpen = false;
  /** What the last PUSH was of, and when — rule 7's window. Null means nothing may coalesce. */
  let lastKey: string | null = null;
  let lastAt = 0;

  function clear(): void {
    session.undo.length = 0;
    session.redo.length = 0;
    runOpen = false;
    lastKey = null;
  }

  function push(state: ShellState, key: string, now: number): void {
    session.undo.push(state);
    // From the OLD end: the cap bounds how far back a reader can go, and the entry they are most
    // likely to want is the one they just made.
    while (session.undo.length > limit) session.undo.shift();
    session.redo.length = 0;
    lastKey = key;
    lastAt = now;
  }

  return {
    record(prev, next, why, now = Date.now()): void {
      // `now` is a parameter, and defaulted here rather than at the call site, so the coalescing
      // window can be driven from a test without a fake clock — the app never passes it.
      if (why === "link") {
        clear();
        return;
      }
      if (why === "init") return;
      // A restored state is not an edit. It also leaves the stacks exactly as `undo`/`redo` left
      // them, which is what lets a reader step back and forth rather than only back.
      if (why === "restore") return;
      // Rule 3, and it has to run before every return below: `endGesture` commits an UNCHANGED
      // state, so a run closed after the rule-4 return would never close at all.
      if (why !== "gesture") runOpen = false;

      const key = changeKey(prev, next);
      if (key === null) return;
      if (key === CAMERA_KEY) return;
      if (why === "gesture-end") return;

      if (why === "gesture") {
        if (runOpen) return;
        runOpen = true;
        push(prev, key, now);
        return;
      }

      // Rule 7, and `edit-step` is the exception with its own note on the type: an edit that says
      // it is a discrete act never merges, and it closes the window behind it so the NEXT ordinary
      // edit cannot merge into it either.
      if (why !== "edit-step" && lastKey === key && now - lastAt < coalesceMs) return;
      push(prev, key, now);
      // And it closes the window BEHIND it, so an ordinary edit landing within `coalesceMs` cannot
      // merge into a discrete act either — the comment above said so before the line existed, which
      // is the shape of claim this file's own rules are written to make checkable.
      if (why === "edit-step") lastKey = null;
    },

    undo(current): ShellState | null {
      const prev = session.undo.pop();
      if (prev === undefined) return null;
      session.redo.push(current);
      // A move through the stacks ends both the run and the coalescing window: the entry an edit
      // would have merged into is no longer the top of the stack.
      lastKey = null;
      runOpen = false;
      return prev;
    },

    redo(current): ShellState | null {
      const next = session.redo.pop();
      if (next === undefined) return null;
      session.undo.push(current);
      lastKey = null;
      runOpen = false;
      return next;
    },

    clear,

    get depth(): { readonly undo: number; readonly redo: number } {
      return { undo: session.undo.length, redo: session.redo.length };
    },
  };
}

/**
 * What changed between two states, as a stable key, or `null` when nothing did.
 *
 * The sorted names of the differing top-level fields, joined — so *which* fields moved is the
 * identity of the change, and two presses of the same key produce the same key here.
 *
 * **The contour's three fields are NOT collapsed into one**, which was the obvious move and is the
 * wrong one. Measured against the call sites in `stageController.ts`: every keyboard nudge writes
 * the same SET of fields on every repeat — a radius nudge writes `geometry`, a branch nudge writes
 * `branch`, a body nudge writes `contour` + `sandboxContour` and, when the contour came from a
 * template, `contourSource` as well (the accumulated shift) — so the sorted join is already stable
 * across a run of ten without any collapsing. What collapsing would additionally do is merge two
 * changes that are genuinely different: `penCommit` writes the curve AND sets `contourSource` to
 * `null`, so committing a drawn path and then nudging it would become one entry, and the reader
 * could no longer step back to the path they had drawn. Keeping the sets apart distinguishes them
 * because the sets really are different.
 */
export function changeKey(a: ShellState, b: ShellState): string | null {
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  const names = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  const changed: string[] = [];
  for (const name of names) if (!same(ra[name], rb[name])) changed.push(name);
  return changed.length === 0 ? null : changed.sort().join("+");
}

/** Whether the ONLY difference is the camera. */
export function cameraOnly(a: ShellState, b: ShellState): boolean {
  // Through {@link changeKey} rather than by comparing `view` and counting the rest, so the two
  // cannot come to disagree about what a field is — a field added to `ShellState` is covered here
  // the moment it is covered there.
  return changeKey(a, b) === CAMERA_KEY;
}

function same(x: unknown, y: unknown): boolean {
  // The common case by far, and it costs nothing: every commit is `{ ...state, field: value }`, so
  // every field the commit did not name is the IDENTICAL object.
  if (Object.is(x, y)) return true;
  if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) return false;
  return stable(x) === stable(y);
}

/** {@link stableKey}, which `stageView.ts` became the second consumer of at step 2.1. */
const stable = stableKey;
