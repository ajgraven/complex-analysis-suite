// @vitest-environment jsdom
//
// **THE PIECE LIST, EDITABLE** — M8 step 4.3.
//
// Driven through the mounted shell rather than through the card's description, because what this
// step adds is wiring: a control, an action, a pure operation in `engine/contour/edit.ts`, a
// commit, and an undo entry. `test/cards.test.ts` renders the card against a stub and asserts what
// each control ASKS FOR; this file asserts what the app then DOES, which is the half a stub cannot
// see — and step 1.4b's own finding is that a card whose actions were never driven through the
// shell was dead in the live app while both kinds of test passed.
import { afterEach, describe, expect, it } from "vitest";

import { mountShell2, type Shell2Handle } from "../src/shell/app.js";
import { roleLabel } from "../src/engine/vocabulary.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import { splitPieceAt, translateContour } from "../src/engine/contour/edit.js";
import type { Cx } from "../src/kernel/geom.js";
import { sameShape } from "../src/engine/contour/pen.js";
import { mathSpoken } from "../src/shell/math.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { compile, defaultState, resolveState, type ShellState } from "../src/shell/state.js";

const mounted: Shell2Handle[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  document.body.replaceChildren();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

/** The sandbox on a semicircle: a target, an arc, and room to edit both. */
function mount(): { root: HTMLElement; app: Shell2Handle } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", window.location.pathname);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  app.actions().toSandbox();
  app.actions().setTemplate("semicircle");
  app.actions().setExpr("1/(1+z^2)");
  return { root, app };
}

const ids = (app: Shell2Handle): string[] => app.currentState().contour.pieces.map((p) => p.id);
const rowOf = (root: ParentNode, id: string): HTMLElement => {
  const li = root.querySelector<HTMLElement>(`[data-card="contour"] li[data-piece="${id}"]`);
  if (li === null) throw new Error(`no row for ${id}`);
  return li;
};
/**
 * The piece's own name, read back out of the row's typeset copy of it.
 *
 * `mathText` splits `the $R \to \infty$ circle` into text nodes and `role="math"` spans carrying
 * `data-tex`, so re-joining them with the delimiters reconstructs the source string exactly — a
 * second route to the name, independent of the `aria-label` the assertion below is about.
 */
const pieceNameIn = (row: ParentNode): string => {
  const el = row.querySelector(".pieceName");
  if (el === null) throw new Error("no name on this row");
  return [...el.childNodes]
    .map((n) =>
      n.nodeType === 3 ? (n.nodeValue ?? "") : `$${(n as HTMLElement).getAttribute("data-tex") ?? ""}$`,
    )
    .join("");
};

/**
 * A row's tool, found by its verb and then judged on its WHOLE accessible name.
 *
 * **`startsWith` alone was the defect's hiding place** — the 2026-09-20 review. The tail of each of
 * these names is the piece's, and it was built with `mathPlain`, so `delete the $R \to \infty$
 * circle` announced its backslashes; matching on the prefix meant the broken half was never read.
 */
const toolIn = (row: ParentNode, label: string): HTMLButtonElement => {
  const b = [...row.querySelectorAll<HTMLButtonElement>("button.pieceTool")].find(
    (x) => (x.getAttribute("aria-label") ?? "").startsWith(label),
  );
  if (b === undefined) throw new Error(`no '${label}' control`);
  // The verb is what FINDS the control; the piece's name is what is then judged, against the row's
  // own typeset copy of it. `slice` rather than `endsWith` so a failure prints both strings.
  const aria = b.getAttribute("aria-label") ?? "";
  const tail = ` ${mathSpoken(pieceNameIn(row))}`;
  expect(aria.slice(-tail.length), `the '${label}' control's name past its verb`).toBe(tail);
  return b;
};

describe("the row's controls reach the contour", () => {
  it("names every control by the piece's SPOKEN name, on a contour whose names carry macros", () => {
    // **The semicircle cannot see this defect and that is why it survived** — the 2026-09-20
    // review's sweep. Its two pieces are `the real axis [−R, R]` and `the R→∞ upper semicircle`,
    // both already Unicode, so `mathSpoken` is a no-op on them and `mathPlain` would have read the
    // same. The KEYHOLE is where the template names are written in the `$…$` convention — `the $R
    // \to \infty$ circle`, `the $\varepsilon \to 0$ circle` — and that is what was being announced
    // with its backslashes.
    const { root, app } = mount();
    app.actions().setTemplate("keyhole");
    const withMacro = app
      .currentState()
      .contour.pieces.filter((p) => /\\/.test(p.name));
    expect(withMacro.length, "the keyhole's names no longer carry a macro").toBeGreaterThan(1);
    for (const piece of withMacro) {
      const row = rowOf(root, piece.id);
      // Every name this row offers: the rename box's, the role menu's, the verdict tag's, the tools'.
      const names = [...row.querySelectorAll("[aria-label]")].map((n) => n.getAttribute("aria-label") ?? "");
      expect(names.length, `${piece.id} offers no named control`).toBeGreaterThan(3);
      for (const name of names) {
        expect(name, `${piece.id}: a macro is announced`).not.toContain("\\");
        expect(name, `${piece.id}: a delimiter is announced`).not.toContain("$");
        // And it is the SPOKEN name rather than the name with its delimiters merely stripped —
        // `mathPlain` would leave `the R \to \infty circle`, which the two lines above catch, but
        // the positive form is what says which function it went through.
        expect(name).toContain(mathSpoken(piece.name));
      }
      // Anti-vacuity: the spoken name is not the empty string, and it really did change.
      expect(mathSpoken(piece.name).length).toBeGreaterThan(5);
      expect(mathSpoken(piece.name)).not.toBe(piece.name);
    }
    // No `title` anywhere on the row either: it was a tooltip AND the accessible description, and
    // it carried a whole certified bound's LaTeX.
    expect([...root.querySelectorAll('[data-card="contour"] [title]')]).toEqual([]);

    // **The rename box's name is only in the DOM while the box is open**, so it needs its own
    // gesture — the sweep above found it surviving for exactly that reason.
    const macro = withMacro[0];
    toolIn(rowOf(root, macro.id), "rename").click();
    const box = rowOf(root, macro.id).querySelector("input.pieceRename");
    expect(box, "the rename box did not open").not.toBeNull();
    expect(box?.getAttribute("aria-label")).toBe(`rename ${mathSpoken(macro.name)}`);
  });

  it("changes a piece's ROLE, and the ledger answers on the row", () => {
    const { root, app } = mount();
    const row = rowOf(root, "arc");
    const select = row.querySelector<HTMLSelectElement>("select.pieceRole");
    expect(select).not.toBeNull();
    if (select === null) return;
    // Jordan's lemma on a rational integrand. Step 4.1 refuses it by name, and the point here is
    // that the refusal reaches the ROW the reader made the choice on — a menu with the answer three
    // cards away is a menu of guesses.
    select.value = "L3";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(app.currentState().contour.pieces[1].lemma).toBe("L3");
    const status = rowOf(root, "arc").querySelector<HTMLElement>('.tag[data-status]');
    expect(status?.getAttribute("data-status")).toBe("failed");
    // **The SENTENCE is in the check list, not in a `title` on this tag.** There was one, built with
    // `mathPlain`, and the 2026-09-20 review measured it carrying a backslash 52 times across the
    // mounted states — a `title` is a tooltip a mouse user reads and the accessible DESCRIPTION
    // where an `aria-label` is present, so it is gone and the claim is asserted where it is typeset.
    expect(status?.getAttribute("title"), "the LaTeX-bearing tooltip is back").toBeNull();
    expect(root.querySelector('[data-card="result"]')?.textContent ?? "").toContain("Jordan's lemma");
    // And the pairing: the lemma that DOES apply certifies, on the same row, through the same
    // control. Without this the line above would pass on a row that always says "failed".
    const again = rowOf(root, "arc").querySelector<HTMLSelectElement>("select.pieceRole");
    if (again === null) return;
    again.value = "L2";
    again.dispatchEvent(new Event("change", { bubbles: true }));
    expect(rowOf(root, "arc").querySelector('.tag[data-status]')?.getAttribute("data-status")).toBe(
      "satisfied",
    );
  });

  it("REORDERS by Alt+↑/↓ on the row, and the piece list is what moved", () => {
    const { root, app } = mount();
    expect(ids(app)).toEqual(["diameter", "arc"]);
    rowOf(root, "arc").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }),
    );
    expect(ids(app)).toEqual(["arc", "diameter"]);
    // At the end of the list there is nowhere to go, and a wrap would move the piece the whole way
    // across on a keypress that means "one step".
    rowOf(root, "arc").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }),
    );
    expect(ids(app)).toEqual(["arc", "diameter"]);
    // **Without Alt the key belongs to whatever has focus** — a `<select>` most of all, where ↑
    // changes the role. A reorder on a bare arrow would make the role menu unusable.
    rowOf(root, "diameter").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(ids(app)).toEqual(["arc", "diameter"]);
  });

  it("DELETES a piece, joining its neighbours, and refuses below three", () => {
    const { root, app } = mount();
    app.actions().insertPiece("arc", "segment");
    expect(ids(app)).toHaveLength(3);
    toolIn(rowOf(root, "arc"), "delete").click();
    expect(ids(app)).not.toContain("arc");
    // **Still three, and that is the operation rather than a failure to delete.** Removing a piece
    // from a CLOSED chain opens exactly one seam, and `deletePiece`'s own rule fills it with a
    // straight join — so the count returns to `n` unless the piece removed was a full turn. Step
    // 4.1 measured that over the ten templates; this is the same fact reaching a reader's hand.
    expect(ids(app)).toHaveLength(3);

    // Below three there is no chain left to join, and the operation refuses by returning the
    // contour by reference. The semicircle the sandbox opened on is the case: two pieces.
    const { root: r2, app: a2 } = mount();
    expect(ids(a2)).toHaveLength(2);
    const before = a2.currentState().contour;
    toolIn(rowOf(r2, "diameter"), "delete").click();
    expect(a2.currentState().contour).toBe(before);
  });

  it("RENAMES inline: Enter commits, Escape abandons, and the row keeps its identity", () => {
    const { root, app } = mount();
    toolIn(rowOf(root, "diameter"), "rename").click();
    const box = rowOf(root, "diameter").querySelector<HTMLInputElement>("input.pieceRename");
    expect(box, "the rename control opened no box").not.toBeNull();
    if (box === null) return;
    box.value = "the base";
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(app.currentState().contour.pieces[0].name).toBe("the base");
    // **The row is keyed by piece id, so a rename does not rebuild it** — M8's own recompute rule:
    // a row rebuilt on every keystroke would take focus away from the box being typed into.
    expect(rowOf(root, "diameter").textContent ?? "").toContain("the base");

    toolIn(rowOf(root, "diameter"), "rename").click();
    const second = rowOf(root, "diameter").querySelector<HTMLInputElement>("input.pieceRename");
    if (second === null) return;
    second.value = "something else";
    second.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(app.currentState().contour.pieces[0].name).toBe("the base");
    expect(rowOf(root, "diameter").querySelector("input.pieceRename")).toBeNull();
  });

  it("does not let the rename's Escape leave the row", () => {
    // **Asserted against an ancestor, not against a consequence.** The first version of this test
    // opened the pen and checked the path survived — which passed with `stopPropagation` removed,
    // because the pen's Escape handler is on the stage canvas and a modal's is on its own backdrop,
    // so neither is an ancestor of the rename box and the event was never going to reach them. It
    // pinned the outcome without pinning the reason. What the line actually promises is the row's
    // own contract: a cancel key pressed in this box cancels this box and goes no further, whatever
    // the shell later hangs above it — so the listener the test installs IS the thing at risk.
    const { root, app } = mount();
    toolIn(rowOf(root, "diameter"), "rename").click();
    const box = rowOf(root, "diameter").querySelector<HTMLInputElement>("input.pieceRename");
    expect(box).not.toBeNull();
    if (box === null) return;
    let reached = 0;
    const listener = (ev: Event): void => {
      if ((ev as KeyboardEvent).key === "Escape") reached += 1;
    };
    document.addEventListener("keydown", listener);
    try {
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    } finally {
      document.removeEventListener("keydown", listener);
    }
    expect(rowOf(root, "diameter").querySelector("input.pieceRename"), "Escape did not abandon").toBeNull();
    expect(reached, "the rename's Escape carried on past the row").toBe(0);
    // And the control is not simply swallowing every key: Enter still reaches nothing above either,
    // but the app state it committed is the proof the handler ran rather than the event vanishing.
    expect(app.currentState().contour.pieces[0].name).toBe(semicircleTemplate(3).pieces[0].name);
  });

  it("opens the role menu ON the state the piece is actually in, undeclared lemma included", () => {
    // **The commonest state in the app**: every sandbox template makes a `vanish` piece with no
    // lemma, and step 4.1's rule is that an undeclared one keeps the shape-driven pick. Without an
    // entry for it the control opened on a DISABLED option and the state a reader starts in was the
    // one the menu could not return to. `value` rather than the rendered option, because that is
    // what a `<select>` with no matching entry gets wrong.
    const { root, app } = mount();
    expect(app.currentState().contour.pieces[1].role).toBe("vanish");
    expect(app.currentState().contour.pieces[1].lemma).toBeUndefined();
    const select = rowOf(root, "arc").querySelector<HTMLSelectElement>("select.pieceRole");
    expect(select?.value).toBe("vanish");
    expect(select?.selectedOptions[0]?.disabled ?? true).toBe(false);
    // And choosing it back is a real round trip: declare a lemma, then undeclare it.
    if (select === null) return;
    select.value = "L2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(app.currentState().contour.pieces[1].lemma).toBe("L2");
    const again = rowOf(root, "arc").querySelector<HTMLSelectElement>("select.pieceRole");
    if (again === null) return;
    again.value = "vanish";
    again.dispatchEvent(new Event("change", { bubbles: true }));
    expect(app.currentState().contour.pieces[1].lemma).toBeUndefined();
  });

  it("INSERTS a piece after the row, and the contour stays closed", () => {
    const { root, app } = mount();
    toolIn(rowOf(root, "diameter"), "insert a piece after").click();
    expect(ids(app)).toHaveLength(3);
    // The inserted piece sits between the row's end and the next piece's start, which is the only
    // place it can go without opening the chain.
    expect(ids(app)[1]).not.toBe("arc");
    expect(app.currentState().contour.pieces[2].id).toBe("arc");
  });

  it("does not offer the controls under a RECORD, where the contour is the record's", () => {
    // The card's own rule since step 1.4b, and it has to survive the row growing controls: swapping
    // a worked example's contour would leave an argument whose pieces no longer match it.
    const { root, app } = mount();
    app.actions().applyState({ ...app.currentState(), mode: "gallery", record: "semicircle-quartic", fixture: 0 });
    expect(root.querySelectorAll('[data-card="contour"] button.pieceTool')).toHaveLength(0);
    expect(root.querySelectorAll('[data-card="contour"] select.pieceRole')).toHaveLength(0);
    // And the role is still SAID, as a tag — the reader can see what each piece is for, they just
    // cannot change it.
    expect(root.querySelector('[data-card="contour"] .pieces2 .tag')?.textContent).toBe(
      roleLabel("target"),
    );
  });
});

describe("every edit is one undo entry", () => {
  it("does not merge two edits made inside the coalescing window", () => {
    // **Rule 7 coalesces by `changeKey`, which is the set of CHANGED FIELD NAMES** — and every
    // contour edit changes the same three fields, so two deletions inside 800 ms would look
    // identical to ten nudges of one handle and the second would absorb the first. A reader
    // pressing Ctrl+Z once would get neither back. `"edit-step"` is the caller saying this is a
    // discrete act; the inline rename deliberately stays an ordinary `"edit"`, because typing is
    // one adjustment continued.
    const { root, app } = mount();
    // **The first edit is spent deliberately**, and the sweep is why: `changeKey` is the set of
    // CHANGED FIELD NAMES, and until step 4.4b the first edit after a template also CLEARED
    // `contourSource` where later ones left it alone — so it had a different key from every edit
    // after it and could never have coalesced with one. A test that used it would pass with the
    // whole exception removed. The recipe now absorbs every structural edit, so all of them write
    // the same three fields; the edit is still spent, because a fixture whose stability depends on
    // which step it is read in is not one to rest an exception on.
    app.actions().insertPiece("arc", "segment");
    const three = ids(app);
    expect(three).toHaveLength(3);

    toolIn(rowOf(root, three[1]), "move later").click();
    const afterMove = ids(app);
    expect(afterMove).not.toEqual(three);
    toolIn(rowOf(root, three[0]), "move later").click();
    const afterSecond = ids(app);
    expect(afterSecond).not.toEqual(afterMove);

    app.actions().undo();
    expect(ids(app), "the second edit did not come back on its own").toEqual(afterMove);
    app.actions().undo();
    expect(ids(app), "the first edit was absorbed by the second").toEqual(three);
  });

  it("DOES merge two renames, because typing is one adjustment continued", () => {
    // The other side of the exception, and it is what stops `"edit-step"` being applied to
    // everything: a reader who types a name, pauses, and types more has made one edit, and undoing
    // it should not walk back through the keystrokes. Both renames carry the same `changeKey`, so
    // rule 7 is what decides — which is the condition the test above had to be built to reach.
    const { root, app } = mount();
    app.actions().insertPiece("arc", "segment");
    const start = app.currentState().contour.pieces[0].name;
    const depth = app.session().undo.length;
    app.actions().renamePiece("diameter", "one");
    app.actions().renamePiece("diameter", "two");
    expect(app.currentState().contour.pieces[0].name).toBe("two");
    expect(app.session().undo.length - depth, "two renames left two entries").toBe(1);
    app.actions().undo();
    expect(app.currentState().contour.pieces[0].name).toBe(start);
    expect(rowOf(root, "diameter").textContent ?? "").toContain(start);
  });

  it("neither absorbs nor is absorbed by an adjacent rename", () => {
    // **The exception is spelled twice, and each spelling has its own case.** The guard
    // (`why !== "edit-step"`) stops a discrete act merging INTO an ordinary edit before it; the
    // `lastKey = null` after the push stops an ordinary edit merging into the discrete act. Either
    // line alone satisfies a test that only repeats one kind, which is why the sweep survived both
    // — so the two orders are run separately, and each is a delta of two entries.
    //
    // A rename and a move carry the identical `changeKey` (both write `contour` + `sandboxContour`),
    // land well inside the 800 ms window, and differ only in the reason the caller gave. That is
    // exactly the pair rule 7 cannot tell apart on its own.
    const { app: a1 } = mount();
    a1.actions().insertPiece("arc", "segment"); // spends the edit that also clears `contourSource`
    const d1 = a1.session().undo.length;
    a1.actions().renamePiece("diameter", "one"); // "edit"
    a1.actions().movePiece("diameter", 1); // "edit-step" — must not merge into the rename
    expect(a1.session().undo.length - d1, "the move was absorbed by the rename before it").toBe(2);

    const { app: a2 } = mount();
    a2.actions().insertPiece("arc", "segment");
    const d2 = a2.session().undo.length;
    a2.actions().movePiece("diameter", 1); // "edit-step"
    a2.actions().renamePiece("diameter", "one"); // "edit" — must not merge into the move
    expect(a2.session().undo.length - d2, "the rename was absorbed by the move before it").toBe(2);
  });

  it("pushes NOTHING for an edit the operation refused", () => {
    // `editPieces` compares by reference, which is how every operation in `edit.ts` signals a
    // refusal — so a refused edit commits nothing and an undo does not spend a step undoing a
    // state that never moved (undo rule 4, one layer up).
    const { root, app } = mount();
    const before = app.currentState().contour;
    // The DEPTH before, not zero: `mount` itself makes three edits (the sandbox, the template, the
    // expression), and asserting an absolute length would be asserting how the fixture was built.
    const depth = app.session().undo.length;
    toolIn(rowOf(root, "diameter"), "delete").click();
    expect(app.currentState().contour).toBe(before);
    expect(app.session().undo).toHaveLength(depth);
  });
});

describe("the contour that is edited is the SANDBOX's", () => {
  it("KEEPS the template recipe through an annotation edit, and drops it on a structural one", () => {
    // **Revised at step 4.4, and measuring is why.** 4.3 cleared `contourSource` on every edit, on
    // the reading that an edited list is not that template any more. That is true of a STRUCTURAL
    // edit and false of a rename: a role or a name moves no point, so the recipe still rebuilds the
    // curve exactly and the codec carries the two annotations as a diff on top of it. Clearing it
    // cost the link entirely — `penPath` refuses a contour whose ids are not the pen's, so a
    // renamed template had no serialisation at all — and cost the template picker its own selection
    // and the drill its menu match, both of which read this field.
    const { root, app } = mount();
    expect(app.currentState().contourSource?.template).toBe("semicircle");
    toolIn(rowOf(root, "diameter"), "rename").click();
    const box = rowOf(root, "diameter").querySelector<HTMLInputElement>("input.pieceRename");
    if (box === null) return;
    box.value = "the base";
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(app.currentState().contour.pieces[0].name).toBe("the base");
    expect(app.currentState().contourSource?.template).toBe("semicircle");
    // The parked sandbox contour follows, so leaving for a record and coming back keeps the edit.
    expect(app.currentState().sandboxContour?.pieces[0].name).toBe("the base");
    // A role is the same kind of change and keeps it too.
    const select = rowOf(root, "arc").querySelector<HTMLSelectElement>("select.pieceRole");
    if (select === null) return;
    select.value = "L2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(app.currentState().contourSource?.template).toBe("semicircle");

    // **And the contrast, over ALL FOUR structural operations** — revised at step 4.4b, which is
    // where the recipe learned to absorb them. Until then each one CLEARED it, and the reader lost
    // the link; now each one appends the operation it made, so the field stays true in a stronger
    // sense than before: it says not only which template but what was done to it.
    //
    // On the KEYHOLE, because `reversePiece` applies to a full turn and to nothing else — reversing
    // any other piece swaps endpoints its neighbours still want, so the operation refuses and
    // `editPieces` commits nothing. The keyhole is the one template with four pieces, two of them
    // circles; on a semicircle the reverse case would silently be testing a refusal.
    for (const [what, kind, edit] of [
      ["insert", "i", (a: Shell2Handle) => a.actions().insertPiece("upper", "segment")],
      ["delete", "d", (a: Shell2Handle) => a.actions().deletePiece("upper")],
      ["move", "m", (a: Shell2Handle) => a.actions().movePiece("upper", 1)],
      ["reverse", "r", (a: Shell2Handle) => a.actions().reversePiece("outer")],
    ] as const) {
      const { app: fresh } = mount();
      fresh.actions().setTemplate("keyhole");
      expect(fresh.currentState().contourSource?.template).toBe("keyhole");
      const before = fresh.currentState().contour;
      edit(fresh);
      expect(fresh.currentState().contour, `the ${what} was refused, so the case is vacuous`).not.toBe(before);
      const source = fresh.currentState().contourSource;
      expect(source?.template, `${what} dropped the recipe`).toBe("keyhole");
      expect(source?.ops?.map((o) => o.k), `${what} recorded the wrong operation`).toEqual([kind]);
      // **And the link is the point of recording it.** The rebuild is compared against the contour
      // on screen before a link is minted, so a `true` here is the recipe reproducing the edit
      // rather than merely claiming to.
      const e = encodeShell(fresh.currentState());
      expect(e.ok, e.ok ? "" : e.reason).toBe(true);
    }
  });

  it("reopens an EDITED template's link with the same ledger rows — step 4.4b's gate", () => {
    // The step's own Done-when, and it is asserted on the LEDGER rather than on the contour: what a
    // reader loses when a recipe cannot carry an edit is the argument, not the picture. §4.4's
    // proposed carrier — serialise a structurally edited template as a pen wire — fails exactly
    // here for four of the ten templates, which is why the ops list exists.
    const { app } = mount();
    app.actions().setTemplate("semicircle");
    app.actions().setExpr("1/(1+z^2)");
    app.actions().insertPiece("arc", "segment");
    app.actions().movePiece("arc", -1);
    const before = app.currentState();
    const rows = (s: ShellState): string => {
      const r = resolveState(s, compile(s.expr));
      const a = r.kind === "plain" || r.kind === "declared" ? r.analysis : null;
      if (a === null) return `no analysis (${r.kind})`;
      return [
        `closes=${String(a.ledger.closes)}`,
        ...a.ledger.rows.map((x) => `${x.constraint}|${x.status}|${x.evidence.level}|${x.claim}`),
      ].join("\n");
    };
    const e = encodeShell(before);
    expect(e.ok, e.ok ? "" : e.reason).toBe(true);
    if (!e.ok) return;
    const back = decodeShell(e.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(back.state.contour.pieces.map((p) => p.id)).toEqual(before.contour.pieces.map((p) => p.id));
    expect(rows(back.state)).toBe(rows(before));
    // The recipe comes back too, so a second edit appends rather than starting over.
    expect(back.state.contourSource?.ops?.map((o) => o.k)).toEqual(["i", "m"]);
  });

  it("keeps the recipe through a REVERSAL, which is what the comment always claimed", () => {
    // `reverseContour`'s comment said the recipe is kept; the code had cleared it since the
    // cutover, and step 4.4a recorded the discrepancy with the repair it needed — a wire flag
    // rather than a lie about the recipe, since a reversal is one bit and commutes with both the
    // parameters and the shift. This is that flag, as an op like any other.
    const { app } = mount();
    expect(app.currentState().contourSource?.template).toBe("semicircle");
    const before = app.currentState().contour.pieces.map((p) => p.id);
    app.actions().reverseContour();
    expect(app.currentState().contour.pieces.map((p) => p.id)).not.toEqual(before);
    expect(app.currentState().contourSource?.ops?.map((o) => o.k)).toEqual(["R"]);
    const e = encodeShell(app.currentState());
    expect(e.ok, e.ok ? "" : e.reason).toBe(true);
    if (!e.ok) return;
    const back = decodeShell(e.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(back.state.contour.pieces.map((p) => p.id)).toEqual(
      app.currentState().contour.pieces.map((p) => p.id),
    );
  });

  it("mints a link for a contour DRAGGED and then divided, which the exact check refuses", () => {
    // **The only sequence where the two comparisons differ, and finding it took a measurement.** A
    // first draft edited and THEN dragged, which the exact check accepts — because every op but the
    // division commutes with translation exactly, and an insert applied before the shift is the very
    // same pieces as one applied after. The division is the exception, at 1.3e-15: replayed before
    // the shift it lands a last bit away from where the reader's own drag-then-divide put it. So the
    // recipe's verification uses `sameShape` whenever ops are present — measured, with the exact
    // check kept here this link is REFUSED — and a test that did not drag first pinned nothing.
    const shift: Cx = [1.5, -2.25];
    const dragged = translateContour(semicircleTemplate(4), shift);
    // **A SEGMENT, and that is the whole of it.** An arc's join is `lerpScalar(theta0, theta1, f)`,
    // which never touches the translated centre, so dividing one commutes with the shift exactly and
    // the fixture would again pin nothing. A segment's join is the lerp of two TRANSLATED endpoints
    // against the translate of their lerp — the same number to 1.3e-15 and not the same expression.
    const divided = splitPieceAt(dragged, "diameter", 0.3);
    expect(divided, "the fixture's own division was refused").not.toBe(dragged);
    const state: ShellState = {
      ...defaultState(semicircleTemplate(4)),
      expr: "1/(1+z^2)",
      contour: divided,
      sandboxContour: divided,
      contourSource: { template: "semicircle", shift, ops: [{ k: "s", id: "diameter", at: 0.3 }] },
    };
    const e = encodeShell(state);
    expect(e.ok, e.ok ? "" : e.reason).toBe(true);
    if (!e.ok) return;
    const back = decodeShell(e.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(back.state.contour.pieces.map((q) => q.id)).toEqual(divided.pieces.map((q) => q.id));
    expect(back.state.contourSource?.shift).toEqual(shift);
    expect(sameShape(back.state.contour, divided)).toBe(true);
    // And the gap is REAL rather than asserted: the two replay orders are not the same object, so
    // the shape comparison is doing work the structural one would refuse.
    expect(JSON.stringify(back.state.contour.pieces)).not.toBe(JSON.stringify(divided.pieces));
  });

  it("puts a RENAMED template contour in a link, which is what keeping the recipe buys", () => {
    // The consequence, at the surface a reader meets: step 4.3 left an edited template contour with
    // no permalink at all, because the recipe was gone and `penPath` refuses a contour whose pieces
    // are not the pen's. Asserted through `encodeShell` rather than through the button, so the
    // refusal's own reason is visible when it comes back.
    const { root, app } = mount();
    toolIn(rowOf(root, "diameter"), "rename").click();
    const box = rowOf(root, "diameter").querySelector<HTMLInputElement>("input.pieceRename");
    if (box === null) return;
    box.value = "the base";
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const e = encodeShell(app.currentState());
    expect(e.ok, e.ok ? "" : e.reason).toBe(true);
    if (!e.ok) return;
    const back = decodeShell(e.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(back.state.contour.pieces[0].name).toBe("the base");
    expect(back.state.contourSource?.template).toBe("semicircle");
  });

  it("leaves the template's own pieces alone until something is edited", () => {
    const { app } = mount();
    expect(app.currentState().contour.pieces.map((p) => p.name)).toEqual(
      semicircleTemplate(3).pieces.map((p) => p.name),
    );
  });
});
