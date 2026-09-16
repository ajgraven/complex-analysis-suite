// The undo stacks — M8 step 1.11.
//
// **No mounted app anywhere in this file**, deliberately. `createUndo` takes the two arrays and a
// clock, and every rule it implements is a statement about a pair of states and a `CommitReason`.
// Driving it through a real drag would test jsdom's pointer events; driving it through the states
// the call sites actually commit tests the policy, which is what the module is.
//
// So every case below is built from a call site in `src/shell2/stageController.ts` or `app.ts`, and
// the comment says which one — a test that invents a commit shape can pass while the app's own
// shapes coalesce into one entry or into none.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";

import { circleTemplate } from "../src/engine/contour/templates.js";
import { translateContour } from "../src/engine/contour/edit.js";
import { defaultState, type ShellState } from "../src/shell/state.js";
import type { BranchChoice } from "../src/kernel/branch/model.js";
import type { Session } from "../src/shell2/session.js";
import { cameraOnly, changeKey, createUndo } from "../src/shell2/undo.js";

const base = (): ShellState => defaultState(circleTemplate());

/** The two arrays `createUndo` writes to — the session's, minus everything it never reads. */
const stacks = (): Pick<Session, "undo" | "redo"> => ({ undo: [], redo: [] });

describe("changeKey", () => {
  it("is null for a state that did not move", () => {
    const s = base();
    expect(changeKey(s, s)).toBe(null);
    // `endGesture` commits `getState()` — literally the same object — so this is the case that
    // decides whether a finished drag leaves an entry that undoes nothing.
    expect(changeKey(s, { ...s })).toBe(null);
  });

  it("names the field that moved, sorted and joined", () => {
    const s = base();
    expect(changeKey(s, { ...s, expr: "1/z^2" })).toBe("expr");
    expect(changeKey(s, { ...s, view: { ...s.view, halfHeight: 4 } })).toBe("view");
    expect(changeKey(s, { ...s, scrub: 0.5, expr: "1/z^2" })).toBe("expr+scrub");
  });

  it("sorts the key, so two states built in different field orders agree about it", () => {
    const s = base();
    // **Spreading is not enough to make this observable**, which is what a mutation sweep found:
    // `{ ...s, expr, scrub }` reassigns fields `s` already has, and that leaves them where they
    // were, so `Object.keys` comes back in `defaultState`'s order however the spread was written.
    // What does reorder them is a state built from scratch — a decoded link assembling its own
    // object — and reversed is the worst case of that. Without the sort the same two edits would
    // key "expr+scrub" from one and "scrub+expr" from the other, and ten nudges that straddled a
    // link would be two entries for no reason a reader could see.
    const reversed = Object.fromEntries(Object.entries(s).reverse()) as unknown as ShellState;
    expect(Object.keys(reversed)[0]).not.toBe(Object.keys(s)[0]);
    expect(changeKey(s, { ...s, expr: "1/z^2", scrub: 0.5 })).toBe("expr+scrub");
    expect(changeKey(reversed, { ...reversed, expr: "1/z^2", scrub: 0.5 })).toBe("expr+scrub");
    expect(changeKey(reversed, { ...s, expr: "1/z^2", scrub: 0.5 })).toBe("expr+scrub");
  });

  it("compares equal objects that are not the same object", () => {
    const s = base();
    // A decoded link rebuilds every field, so nothing is identical by reference and the structural
    // half of the comparison is the only thing standing between that and a spurious entry.
    const rebuilt: ShellState = { ...s, view: { center: [0, 0], halfHeight: s.view.halfHeight } };
    expect(changeKey(s, rebuilt)).toBe(null);
  });

  it("compares a state carrying a Frac, which plain JSON.stringify cannot", () => {
    const s = base();
    const withPoint = (alpha: Frac): ShellState => ({
      ...s,
      branch: {
        ...s.branch,
        points: [{ id: "b", at: [0, 0], order: { kind: "power", alpha }, label: "z^α" }],
      } satisfies BranchChoice,
    });
    const half = withPoint(Frac.of(1n, 2n));
    // MEASURED, and the reason `stable`'s replacer exists: `Frac.n` and `Frac.d` are bigints, and
    // `JSON.stringify` throws on one rather than skipping it. Without the replacer every comparison
    // of a state with a branch point declared — which is every tier-D record and every declared
    // sandbox — would throw out of `commit`.
    expect(() => JSON.stringify(half.branch)).toThrow(TypeError);
    expect(changeKey(s, half)).toBe("branch");
    // Two separately built points with the same exponent are the same declaration.
    expect(changeKey(half, withPoint(Frac.of(1n, 2n)))).toBe(null);
    expect(changeKey(half, withPoint(Frac.of(1n, 3n)))).toBe("branch");
  });

  it("says camera-only only when the camera is the only thing", () => {
    const s = base();
    const panned = { ...s, view: { ...s.view, center: [1, 0] as const } };
    expect(cameraOnly(s, panned)).toBe(true);
    expect(cameraOnly(s, s)).toBe(false);
    expect(cameraOnly(s, { ...panned, expr: "1/z^2" })).toBe(false);
  });
});

describe("what becomes an entry", () => {
  it("pushes one entry for an edit, and walks back and forward through it", () => {
    const u = createUndo(stacks());
    const s0 = base();
    const s1 = { ...s0, expr: "1/z^2" };
    u.record(s0, s1, "edit", 0);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });

    expect(u.undo(s1)).toBe(s0);
    expect(u.depth).toEqual({ undo: 0, redo: 1 });
    expect(u.redo(s0)).toBe(s1);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });

    expect(u.undo(s1)).toBe(s0);
    expect(u.undo(s0)).toBe(null);
    // A refused undo takes nothing with it: the stacks are exactly where the last real one left them.
    expect(u.depth).toEqual({ undo: 0, redo: 1 });
  });

  it("takes a whole gesture as one entry, and its end as none", () => {
    const u = createUndo(stacks());
    // `app.ts`'s `setScrub` commits "gesture" per frame and `setScrubbing(false)` commits the
    // UNCHANGED state as "gesture-end" — the shape of every scrub run in the app.
    const s0 = base();
    let live = s0;
    for (let i = 1; i <= 40; i++) {
      const next = { ...live, scrub: i / 40 };
      u.record(live, next, "gesture", i);
      live = next;
    }
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
    u.record(live, live, "gesture-end", 41);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
    // The entry is the state BEFORE the run, not a frame inside it.
    expect(u.undo(live)).toBe(s0);
  });

  it("starts a new entry for the next gesture after the run closed", () => {
    const u = createUndo(stacks());
    const s0 = base();
    const s1 = { ...s0, scrub: 0.5 };
    u.record(s0, s1, "gesture", 0);
    u.record(s1, s1, "gesture-end", 10);
    const s2 = { ...s1, scrub: 0.75 };
    u.record(s1, s2, "gesture", 20);
    expect(u.depth).toEqual({ undo: 2, redo: 0 });
  });

  it("makes ten keyboard nudges one entry, and the eleventh a second", () => {
    const u = createUndo(stacks());
    // `stageController.ts`'s `moveGrab` radius branch: one "edit" per keypress, writing
    // `geometry[param]` and nothing else — so the key is "geometry" on all ten.
    const s0 = base();
    let live = s0;
    for (let i = 1; i <= 10; i++) {
      const next = { ...live, geometry: { ...live.geometry, R: 1 + i * 0.05 } };
      // 80 ms apart, so the ten span 720 ms — inside the 800 ms window measured from the first push.
      u.record(live, next, "edit", i * 80);
      live = next;
    }
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
    expect(u.undo(live)).toBe(s0);
    u.redo(s0);

    // 900 ms after the tenth is 1,620 ms after the push at t = 80, which is past the window.
    const late = { ...live, geometry: { ...live.geometry, R: 2 } };
    u.record(live, late, "edit", 10 * 80 + 900);
    expect(u.depth).toEqual({ undo: 2, redo: 0 });
  });

  it("coalesces by target, not by time alone", () => {
    const u = createUndo(stacks());
    const s0 = base();
    // Two nudges of the same handle, then a nudge of a branch point, all inside one window: the
    // third is a different thing to take back, so it is a different entry.
    const s1 = { ...s0, geometry: { R: 1.1 } };
    const s2 = { ...s1, geometry: { R: 1.2 } };
    const s3 = { ...s2, branch: { ...s2.branch, basePoint: [0, 2] as const } };
    u.record(s0, s1, "edit", 0);
    u.record(s1, s2, "edit", 100);
    u.record(s2, s3, "edit", 200);
    expect(u.depth).toEqual({ undo: 2, redo: 0 });
  });

  it("never takes the camera, whatever moved it", () => {
    const u = createUndo(stacks());
    const s0 = base();
    // A wheel zoom and a keyboard pan commit "edit" with only `view`; a pointer pan commits
    // "gesture" with only `view`; `fitContour` commits "edit" with only `view`.
    const s1 = { ...s0, view: { ...s0.view, halfHeight: 3 } };
    u.record(s0, s1, "edit", 0);
    const s2 = { ...s1, view: { ...s1.view, center: [1, 1] as const } };
    u.record(s1, s2, "gesture", 10);
    u.record(s2, s2, "gesture-end", 20);
    expect(u.depth).toEqual({ undo: 0, redo: 0 });

    // …and "only" means only. A commit that moves the camera AND the argument is an entry.
    const s3 = { ...s2, view: { ...s2.view, halfHeight: 6 }, expr: "1/z^2" };
    u.record(s2, s3, "edit", 30);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
    expect(u.undo(s3)).toBe(s2);
  });

  it("takes a drag of the curve, which is not the camera", () => {
    const u = createUndo(stacks());
    // `stageController.ts`'s body grab: the contour, the parked sandbox copy and the recipe's
    // accumulated shift, all three in one commit.
    const s0 = base();
    const moved = translateContour(s0.contour, [0.25, 0]);
    const s1: ShellState = {
      ...s0,
      contour: moved,
      sandboxContour: moved,
      contourSource: { template: s0.contourSource?.template ?? "circle", shift: [0.25, 0] },
    };
    expect(changeKey(s0, s1)).toBe("contour+contourSource+sandboxContour");
    u.record(s0, s1, "gesture", 0);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
  });

  it("takes nothing for init, for a state that did not move, or after a link", () => {
    const u = createUndo(stacks());
    const s0 = base();
    u.record(s0, s0, "init", 0);
    expect(u.depth).toEqual({ undo: 0, redo: 0 });

    const s1 = { ...s0, expr: "1/z^2" };
    u.record(s0, s1, "edit", 10);
    u.undo(s1);
    expect(u.depth).toEqual({ undo: 0, redo: 1 });

    // A link is an arrival: both stacks go, including the redo the reader had earned.
    const s2 = { ...s1, expr: "1/(1+z^4)" };
    u.record(s0, s2, "link", 20);
    expect(u.depth).toEqual({ undo: 0, redo: 0 });

    // Even when it lands on the state already showing — how the reader got here is what changed.
    const s3 = { ...s2, expr: "1/(z-1)" };
    u.record(s2, s3, "edit", 30);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
    u.record(s3, s3, "link", 40);
    expect(u.depth).toEqual({ undo: 0, redo: 0 });

    // And an edit that changes nothing is not an edit.
    u.record(s3, s3, "edit", 50);
    expect(u.depth).toEqual({ undo: 0, redo: 0 });
  });

  it("refuses init and gesture-end on the REASON, not on the state they happen to carry", () => {
    const u = createUndo(stacks());
    const s0 = base();
    const s1 = { ...s0, expr: "1/z^2" };
    // The app commits both of these with the state it already has — `commit(state, "init")` at the
    // mount and `commit(getState(), "gesture-end")` at the end of every drag — so the "nothing
    // changed" rule already refuses them and neither line below is reachable through the app today.
    // Asserted directly anyway: the reason each one is refused is its own, and a rule that is only
    // true because another module happens to pass the same object is a rule nothing is holding.
    u.record(s0, s1, "init", 0);
    expect(u.depth).toEqual({ undo: 0, redo: 0 });
    u.record(s0, s1, "gesture-end", 10);
    expect(u.depth).toEqual({ undo: 0, redo: 0 });
  });

  it("takes nothing for a restored state, and leaves the stacks where the move left them", () => {
    const u = createUndo(stacks());
    const s0 = base();
    const s1 = { ...s0, expr: "1/z^2" };
    u.record(s0, s1, "edit", 0);
    const back = u.undo(s1);
    expect(back).toBe(s0);

    // `app.ts`'s `restore` puts the popped state back through `commit`, keeping the reader's own
    // camera. An `"edit"` there would push `s1` straight back onto the undo stack and the second
    // press of Ctrl+Z would return the reader to where they had just left.
    u.record(s1, { ...s0, view: s1.view }, "restore", 10);
    expect(u.depth).toEqual({ undo: 0, redo: 1 });

    // …so the redo the reader earned is still there to take.
    expect(u.redo(s0)).toBe(s1);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
  });

  it("drops the redo stack on the next push", () => {
    const u = createUndo(stacks());
    const s0 = base();
    const s1 = { ...s0, expr: "1/z^2" };
    u.record(s0, s1, "edit", 0);
    expect(u.undo(s1)).toBe(s0);
    expect(u.depth).toEqual({ undo: 0, redo: 1 });

    const s2 = { ...s0, expr: "1/(1+z^2)" };
    u.record(s0, s2, "edit", 1000);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
  });

  it("does not coalesce an edit into an entry an undo has moved", () => {
    const u = createUndo(stacks());
    // Same key and well inside the window, but the entry it would merge into is on the REDO stack
    // now, so merging would silently discard the edit.
    const s0 = base();
    const s1 = { ...s0, expr: "a" };
    u.record(s0, s1, "edit", 0);
    u.undo(s1);
    const s2 = { ...s0, expr: "b" };
    u.record(s0, s2, "edit", 100);
    expect(u.depth).toEqual({ undo: 1, redo: 0 });
    expect(u.undo(s2)).toBe(s0);
  });

  /** `n` states, each one edit on from the last — `states[0]` is the start, so the array is `n + 1`. */
  function chain(n: number): ShellState[] {
    const states: ShellState[] = [base()];
    for (let i = 1; i <= n; i++) states.push({ ...states[i - 1], expr: `1/z^${i}` });
    return states;
  }

  it("caps at 100 entries and drops the oldest", () => {
    const u = createUndo(stacks());
    const states = chain(120);
    // A second apart, so the coalescing window never fires and all 120 are distinct edits.
    for (let i = 1; i <= 120; i++) u.record(states[i - 1], states[i], "edit", i * 1000);
    expect(u.depth).toEqual({ undo: 100, redo: 0 });

    // 120 pushes trimmed to the newest 100 leaves `states[20] … states[119]`, so walking all the
    // way back lands on `states[20]` and the twenty before it are gone.
    let at = states[120];
    for (let i = 0; i < 100; i++) {
      const back = u.undo(at);
      if (back === null) throw new Error(`the stack ran out after ${i} steps, with 100 expected`);
      at = back;
    }
    expect(at).toBe(states[20]);
    expect(at.expr).toBe("1/z^20");
    expect(u.undo(at)).toBe(null);
  });

  it("takes its cap and its window from the caller", () => {
    const u = createUndo(stacks(), { limit: 3, coalesceMs: 50 });
    const states = chain(5);
    for (let i = 1; i <= 5; i++) u.record(states[i - 1], states[i], "edit", i * 60);
    expect(u.depth).toEqual({ undo: 3, redo: 0 });
  });

  it("clears on demand", () => {
    const u = createUndo(stacks());
    const s0 = base();
    const s1 = { ...s0, expr: "1/z^2" };
    u.record(s0, s1, "edit", 0);
    u.undo(s1);
    u.clear();
    expect(u.depth).toEqual({ undo: 0, redo: 0 });
    expect(u.undo(s1)).toBe(null);
    expect(u.redo(s1)).toBe(null);
  });

  it("writes to the session's own arrays, so resetTransient empties it", () => {
    const session = stacks();
    const u = createUndo(session);
    const s0 = base();
    u.record(s0, { ...s0, expr: "1/z^2" }, "edit", 0);
    expect(session.undo).toHaveLength(1);
    // `resetTransient` assigns fresh arrays rather than emptying these, so the stacks it clears are
    // the ones the app reads — `depth` is read off the session on every call for exactly that
    // reason, and a cached length would survive the reset.
    session.undo = [];
    session.redo = [];
    expect(u.depth).toEqual({ undo: 0, redo: 0 });
  });
});
