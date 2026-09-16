// @vitest-environment jsdom
//
// The contrasts dialog — M8 step 1.7.
//
// **What is asserted here is the MODAL, not the ladder.** `test/contrastGrid.test.ts` already
// derives the real difference set from the engine and requires it to match the declared one in both
// directions; re-checking any of that here would be a second copy of a claim that already has an
// owner. What has no owner until this file is the part a reader's hands meet: where focus goes, what
// Tab does at the ends, whether the page behind is reachable, and whether the thing shuts.
//
// Every test below names the defect it prevents. **Four of them had to be rewritten once the sweep
// showed the first version passing with the feature removed**, and each says so where it stands: the
// `$…$` rule (no ladder label carries a dollar, so only the claim TOOLTIPS can falsify it), the
// hidden glyph (`some` matched the absent-row cells and let an exposed status glyph through), the
// per-column Open buttons (pressing the first one and checking the state was plausible), and the
// focus-trap helper, which computed the expected list with the module's own selector and so could
// not see that selector change. A test that would pass with the feature absent is worth nothing.
import { afterEach, describe, expect, it } from "vitest";

import { CONTRAST_CELLS, contrastTable } from "../src/shell/contrastGrid.js";
import { createContrastsDialog, type ContrastsDialog } from "../src/shell/contrasts.js";
import type { ShellState } from "../src/shell/state.js";

/** What a mounted dialog is tested against: a real page, a real opener, and a record of the asks. */
interface Harness {
  readonly dialog: ContrastsDialog;
  readonly host: HTMLElement;
  readonly page: HTMLElement;
  readonly opener: HTMLButtonElement;
  /** `apply` and `close`, in the order they were called — the whole point of the cell test. */
  readonly calls: string[];
  readonly applied: ShellState[];
}

let live: ContrastsDialog | null = null;

afterEach(() => {
  live?.destroy();
  live = null;
  document.body.replaceChildren();
});

function mount(): Harness {
  const page = document.createElement("main");
  // Something focusable BEHIND the dialog. Without it "the page is inert" would be a claim about an
  // empty box, and the focus-return test would have nothing to return to.
  const opener = document.createElement("button");
  opener.textContent = "Contrasts";
  const behind = document.createElement("button");
  behind.textContent = "somewhere else entirely";
  page.append(opener, behind);

  const host = document.createElement("div");
  document.body.append(page, host);

  const calls: string[] = [];
  const applied: ShellState[] = [];
  const dialog = createContrastsDialog(host, page, {
    apply: (next) => {
      calls.push("apply");
      applied.push(next);
    },
    close: () => calls.push("close"),
  });
  live = dialog;
  return { dialog, host, page, opener, calls, applied };
}

/** The dialog's own element, or null when it is not in the document. */
const dialogOf = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');

/**
 * What Tab must land on, in order.
 *
 * **Every control in this dialog is a `<button>`, and that is what is queried — deliberately NOT the
 * module's own focusable selector.** A test that recomputes the expected list the way the code
 * computes it adapts to whatever the code decides is focusable, so it cannot see the decision
 * change: the sweep found exactly that, with `tabIndex = -1` on the dialog changed to `0` and the
 * mirror-selector version of this helper obligingly including the dialog in both lists. Naming the
 * elements independently is what makes "the cycle is the CONTROLS" an assertion.
 */
function focusables(): HTMLElement[] {
  const d = dialogOf();
  return d === null ? [] : [...d.querySelectorAll("button")];
}

/** Send a key to whatever has focus. Returns `false` when the handler called `preventDefault`. */
function press(key: string, shiftKey = false): boolean {
  const target = document.activeElement ?? document.body;
  return target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
}

describe("the contrasts dialog — what it announces itself as", () => {
  it("is a dialog, is modal, and its label RESOLVES to text", () => {
    // The defect: `aria-labelledby` pointing at an id that is not in the document. It is invisible
    // in every browser and in every screenshot — the dialog simply has no name, and a reader is told
    // "dialog" and nothing more. Asserting the attribute's presence would not catch it, so the id is
    // dereferenced and the text it lands on is read.
    const { dialog } = mount();
    dialog.open();
    const d = dialogOf();
    expect(d, "no element carries role=dialog").not.toBeNull();
    expect(d?.getAttribute("aria-modal")).toBe("true");
    const id = d?.getAttribute("aria-labelledby") ?? "";
    expect(id, "no aria-labelledby at all").not.toBe("");
    const label = document.getElementById(id);
    expect(label, `aria-labelledby names '${id}', which is in no document`).not.toBeNull();
    expect((label?.textContent ?? "").trim().length, "the dialog's name is empty").toBeGreaterThan(0);
    // The heading is INSIDE the dialog. A label that resolves to a node the dialog does not contain
    // resolves fine and still names something the reader cannot reach.
    expect(d?.contains(label)).toBe(true);
  });

  it("draws the five columns and a row for every ledger row", () => {
    // Not a claim about the ladder's content — that is `contrastGrid.test.ts`'s. This is the claim
    // that the dialog RENDERED it: the first draft built its content in the constructor and a later
    // change deferred it to the first open, which is exactly the edit that can leave an empty box
    // behind a correct-looking `role="dialog"`.
    const { dialog } = mount();
    dialog.open();
    const head = dialogOf()?.querySelectorAll("thead th") ?? [];
    expect(head.length, "corner cell plus five columns").toBe(6);
    expect((dialogOf()?.querySelectorAll("tbody tr") ?? []).length).toBeGreaterThan(3);
  });

  it("gives EVERY header cell a non-empty accessible name, the corner included", () => {
    // M7.1 ran axe against the open panel and found `empty-table-header` on the corner cell — found
    // by hand, because the a11y roster audits a page in its DEFAULT state and a panel nothing opens
    // is never audited. This is that audit made part of the blocking gate.
    const { dialog } = mount();
    dialog.open();
    const headers = [...(dialogOf()?.querySelectorAll("th") ?? [])];
    expect(headers.length).toBeGreaterThan(5);
    for (const th of headers) {
      const name = (th.getAttribute("aria-label") ?? th.textContent ?? "").trim();
      expect(name, `an empty <th> (scope=${th.getAttribute("scope") ?? "none"})`).not.toBe("");
    }
    // And the corner specifically, by position — a loop over all of them would still pass if the
    // corner cell were simply absent, which is the other way to get a table with no row headings.
    expect((headers[0].textContent ?? "").trim()).not.toBe("");
    expect(headers[0].getAttribute("scope")).not.toBeNull();
  });

  it("prints mathematics, never `$…$` source — in the cells AND in their tooltips", () => {
    // `.katex-mathml` carries the LaTeX source, so `textContent` is not what a reader sees — strip
    // it and read what is actually drawn.
    //
    // **The tooltips are where this test has teeth, and measuring said so.** None of the ladder's
    // five column labels, five notes, four `because` sentences or nine row labels contains a `$`
    // today, so the assertion on the visible text below cannot currently fail however the module
    // sets them — it is an obligation on the convention rather than a guard, and saying otherwise
    // would be the vacuous test M6.3 took three attempts to stop writing. The LEDGER CLAIMS do
    // carry them: 11 of the grid's 37 entries are `$…$` sentences, and each is a cell's `title`.
    // A module that put the raw claim there would show `$\operatorname{Ind}_\gamma(a) \neq 0$` in
    // a tooltip, and that is what the second half of this test catches.
    const { dialog } = mount();
    dialog.open();
    const clone = dialogOf()?.cloneNode(true) as HTMLElement;
    for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
    const text = clone.textContent ?? "";
    expect(text, "LaTeX delimiters reached the screen").not.toContain("$");
    expect(text, "LaTeX source reached the screen").not.toMatch(/\\pi|\\frac|\\oint|\\cdot/);

    // **The anti-vacuity clause, read off the ENGINE rather than off the screen**: the claims this
    // grid is built from really do carry `$…$`, so "no title contains a `$`" is a statement about
    // stripping and not about there being nothing to strip. If the engine's wording ever loses its
    // mathematics this line goes red and says so, instead of the test quietly stopping to bite.
    const claims = contrastTable()
      .rows.flatMap((r) => r.cells)
      .filter((c) => c !== null)
      .map((c) => c.claim);
    expect(claims.filter((c) => c.includes("$")).length, "no ledger claim carries `$…$` — this test no longer bites").toBeGreaterThan(5);

    const titles = [...(dialogOf()?.querySelectorAll("td[title]") ?? [])].map((td) => td.getAttribute("title") ?? "");
    expect(titles.length, "no cell carries its claim at all").toBeGreaterThan(20);
    // Only the DELIMITERS: `mathPlain` is `splitMath(...).join("")` and deliberately keeps the
    // LaTeX body, which is what every `aria-label` in this app carries (`stageView.ts`'s chips).
    // A tooltip is not a place to typeset, and inventing a second stripping rule here would be a
    // second place for the `$…$` convention to live.
    for (const t of titles) expect(t, "a raw `$…$` claim reached a tooltip").not.toContain("$");
  });
});

describe("the contrasts dialog — what each cell says", () => {
  it("names every status in text, not in a glyph alone", () => {
    // A grid of ✓ and ✗ names nothing: the glyph is `aria-hidden` and the word beside it is the
    // cell's whole accessible content. Remove that word and a screen reader reads 37 empty cells —
    // which looks perfect on screen and is the exact shape of a11y defect nobody notices.
    const { dialog } = mount();
    dialog.open();
    const cells = [...(dialogOf()?.querySelectorAll("tbody td") ?? [])];
    expect(cells.length).toBeGreaterThan(20);
    for (const td of cells) {
      const spoken = [...td.querySelectorAll("span")]
        .filter((sp) => sp.getAttribute("aria-hidden") === null)
        .map((sp) => sp.textContent ?? "")
        .join(" ")
        .trim();
      expect(spoken, `a cell whose only content is a glyph (status=${td.getAttribute("data-status") ?? "?"})`).not.toBe("");
    }
    // And EVERY glyph is really hidden — a ✓ announced as "check mark" beside the word "satisfied"
    // is the same claim twice. **`some` is not enough and the sweep proved it**: the absent-row
    // cells carry their own hidden em-dash, so a status glyph left exposed still left one cell
    // matching and the assertion passed. `aria-hidden=""` is the way it happens, because the keyed
    // builder writes a boolean `true` prop as an empty attribute value and an empty value is
    // invalid ARIA — the element stays exposed.
    for (const td of cells) {
      expect(td.querySelector('[aria-hidden="true"]'), "a cell's glyph is exposed to a screen reader").not.toBeNull();
    }
  });

  it("marks the DECLARED difference apart from a mere rewording", () => {
    // M7.1's finding, and the one loophole that would empty the declaration of content: a row whose
    // wording moved without the argument doing so must never be drawn as the step's change. The two
    // markers are therefore disjoint by construction, and both must actually appear — a module that
    // marked nothing would satisfy "disjoint" perfectly.
    const { dialog } = mount();
    dialog.open();
    const declared = [...(dialogOf()?.querySelectorAll('td[data-change="declared"]') ?? [])];
    const reworded = [...(dialogOf()?.querySelectorAll('td[data-change="wording"]') ?? [])];
    expect(declared.length, "the ladder declares differences and none is marked").toBeGreaterThan(3);
    expect(reworded.length, "the ladder declares reworded rows and none is marked").toBeGreaterThan(0);
    expect(declared.some((td) => reworded.includes(td)), "a cell is both the change and a rewording").toBe(false);
    // Not by outline alone. The stylesheet may not exist yet and the reader may not see outlines;
    // the sentence is the part that is true either way.
    for (const td of declared) expect(td.textContent ?? "").toContain("declared change");
    for (const td of reworded) expect(td.textContent ?? "").toContain("reworded");
  });
});

describe("the contrasts dialog — focus", () => {
  it("moves focus INTO the dialog on open and RETURNS it to the opener on close", () => {
    // Two defects in one property. A dialog that does not take focus leaves a keyboard reader
    // tabbing through a page they cannot see; one that does not give it back drops them at the top
    // of the document with no announcement, which is the more common and the harder to notice.
    const { dialog, opener } = mount();
    opener.focus();
    expect(document.activeElement).toBe(opener);

    dialog.open();
    const d = dialogOf();
    expect(d, "the dialog is not in the document").not.toBeNull();
    expect(d?.contains(document.activeElement), "focus stayed outside the dialog").toBe(true);

    dialog.close();
    expect(document.activeElement, "focus did not come back to the control that opened it").toBe(opener);
  });

  it("lands on the dialog itself, so the first Space does not shut it", () => {
    // The specific choice, asserted so a later change has to argue with it: focusing the first
    // control means focusing `Close`, and Space on a focused button ACTIVATES it — a reader who
    // opens the panel and presses Space to scroll the grid closes it again instantly.
    const { dialog } = mount();
    dialog.open();
    expect(document.activeElement).toBe(dialogOf());
    expect(document.activeElement?.tagName.toLowerCase(), "the container is not a button").not.toBe("button");
  });

  it("does not re-capture the return target on a second open", () => {
    // The defect: `open()` called again while open captures whatever is focused NOW — a control
    // inside the dialog — so closing focuses a node that has just left the document and the reader
    // is dropped on `<body>`.
    const { dialog, opener } = mount();
    opener.focus();
    dialog.open();
    focusables()[0]?.focus();
    dialog.open();
    dialog.close();
    expect(document.activeElement).toBe(opener);
  });

  it("cycles Tab within the dialog, in both directions", () => {
    // The trap. Without it Tab from the last control walks into the page the dialog is covering —
    // which is the whole difference between this and the old shell's overlay, and is invisible to
    // anyone using a mouse. Asserted at both ends AND in the interior, because a trap that only
    // handles the wrap has no interior behaviour to be wrong about in jsdom and would pass a test
    // written only at the ends whether it stepped through the controls or not.
    const { dialog } = mount();
    dialog.open();
    const items = focusables();
    expect(items.length, "nothing to cycle").toBeGreaterThan(2);

    items[items.length - 1].focus();
    press("Tab");
    expect(document.activeElement, "Tab off the last control did not wrap to the first").toBe(items[0]);

    press("Tab");
    expect(document.activeElement, "Tab did not step forward inside the dialog").toBe(items[1]);

    items[0].focus();
    press("Tab", true);
    expect(document.activeElement, "Shift+Tab off the first control did not wrap to the last").toBe(items[items.length - 1]);

    press("Tab", true);
    expect(document.activeElement, "Shift+Tab did not step backward inside the dialog").toBe(items[items.length - 2]);
  });

  it("sends Tab from the container to the first control, and Shift+Tab to the last", () => {
    // Where `open()` leaves focus is not in the cycle (`tabIndex = -1`), so the two moves out of it
    // are their own case. Get this wrong and a reader who opens the dialog and presses Tab goes
    // nowhere at all — the one keystroke every keyboard reader makes first.
    const { dialog } = mount();
    dialog.open();
    const items = focusables();
    press("Tab");
    expect(document.activeElement).toBe(items[0]);

    dialogOf()?.focus();
    press("Tab", true);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

describe("the contrasts dialog — the two keystrokes it takes over", () => {
  it("CANCELS the Tab it handled, so the browser does not move focus as well", () => {
    // **jsdom performs no tab traversal, so the trap looks right here whether or not it cancels the
    // event** — and in a real browser an uncancelled Tab moves focus a second time, on top of the
    // move the trap just made, landing two controls along or out of the dialog entirely. The
    // dispatch's return value is the one signal for that which this environment does have.
    const { dialog } = mount();
    dialog.open();
    focusables()[0].focus();
    expect(press("Tab"), "the Tab was not cancelled — the browser will move focus again").toBe(false);
    expect(press("Tab", true), "the Shift+Tab was not cancelled").toBe(false);
  });

  it("does not let Escape reach the rest of the app", () => {
    // The stage's own Escape abandons a half-drawn pen path. A reader shutting a dialog that happens
    // to be over the stage did not ask for that, and would have no way to connect the two.
    const seen: string[] = [];
    const spy = (e: Event): void => {
      seen.push((e as KeyboardEvent).key);
    };
    document.addEventListener("keydown", spy);
    try {
      const { dialog } = mount();
      dialog.open();
      press("Escape");
      expect(seen, "Escape bubbled out of the dialog and into the app").toEqual([]);
    } finally {
      document.removeEventListener("keydown", spy);
    }
  });
});

describe("the contrasts dialog — the page behind it", () => {
  it("marks the page `inert` while open and restores it after", () => {
    // **jsdom does not implement `inert`** — measured: `"inert" in document.createElement("div")` is
    // false, there is no accessor on `HTMLElement.prototype`, assigning the property creates an
    // expando that reflects to no attribute, and focus reaches a button inside an inert subtree.
    // So the ATTRIBUTE is what the module writes and what is asserted here; the property test would
    // pass against `el.inert = true` writing nothing anybody can see. What cannot be asserted in
    // this environment is the EFFECT — that focus and the accessibility tree really stop at the
    // dialog — and that is a browser's job, said plainly rather than faked with a property read.
    expect("inert" in document.createElement("div"), "jsdom grew inert — assert the effect, not the attribute").toBe(false);

    const { dialog, page } = mount();
    expect(page.hasAttribute("inert")).toBe(false);
    dialog.open();
    expect(page.hasAttribute("inert"), "the page behind the modal is still reachable").toBe(true);
    dialog.close();
    expect(page.hasAttribute("inert"), "the page was left inert after the dialog went away").toBe(false);
  });

  it("RESTORES `inert` rather than clearing it, when the page already had it", () => {
    // The defect: closing this dialog clears an `inert` somebody else set — a second modal above it,
    // a loading state — and the page comes back alive underneath something still covering it. The
    // dialog remembers what it found rather than assuming it found nothing.
    const { dialog, page } = mount();
    page.setAttribute("inert", "");
    dialog.open();
    expect(page.hasAttribute("inert")).toBe(true);
    dialog.close();
    expect(page.hasAttribute("inert"), "the dialog cleared an inert it did not set").toBe(true);
  });

  it("closes on Escape", () => {
    // Escape is the one shortcut every reader tries, and a modal that ignores it is a trap. It must
    // also tell the shell, or `session.contrastsOpen` stays true and the next render puts the dialog
    // straight back up — so the ask is asserted alongside the DOM going away.
    const { dialog, calls } = mount();
    dialog.open();
    press("Escape");
    expect(dialog.isOpen, "Escape did not shut it").toBe(false);
    expect(dialogOf(), "the dialog is still in the document").toBeNull();
    expect(calls, "the shell was not told, so the next render reopens it").toEqual(["close"]);
  });

  it("closes on the Close button", () => {
    // The pointer's route to the same place. Separate from Escape because they are separate
    // listeners and the first draft wired only one of them through `dismiss`.
    const { dialog, calls } = mount();
    dialog.open();
    const button = [...(dialogOf()?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").includes("Close"));
    expect(button, "no Close button").not.toBeUndefined();
    button?.click();
    expect(dialog.isOpen).toBe(false);
    expect(calls).toEqual(["close"]);
  });
});

describe("the contrasts dialog — opening a cell", () => {
  it("shuts FIRST and applies second, with a real state", () => {
    // The order is the assertion. `applyState` runs `resetTransient`, which clears
    // `session.contrastsOpen` and re-renders — so applying first has the shell decide the dialog is
    // shut while its DOM is still up, the page still `inert` and focus still inside a panel the
    // shell has stopped drawing. Shutting first leaves one order, and the opener is still in the
    // document to receive focus because nothing has re-rendered yet.
    const { dialog, opener, calls, applied } = mount();
    opener.focus();
    dialog.open();
    const open = [...(dialogOf()?.querySelectorAll("button") ?? [])].find((b) =>
      (b.getAttribute("aria-label") ?? "").startsWith("open "),
    );
    expect(open, "no per-column Open button").not.toBeUndefined();
    open?.click();

    expect(calls, "apply ran before the dialog came down").toEqual(["close", "apply"]);
    expect(dialog.isOpen).toBe(false);
    expect(document.activeElement, "focus was not returned before the shell re-rendered").toBe(opener);
    // A real `ShellState`, not a placeholder: the cell is a state (M7.1), and a handler that passed
    // an empty object would satisfy "apply was called" exactly.
    expect(applied.length).toBe(1);
    expect(applied[0].mode === "gallery" || applied[0].mode === "sandbox").toBe(true);
    expect(applied[0].contour.pieces.length).toBeGreaterThan(0);
  });

  it("opens the column whose button was pressed, and not the first one", () => {
    // The sweep's finding: binding every button to `CONTRAST_CELLS[0]` survived a test that pressed
    // the first button and checked only that a plausible state arrived. A reader would press the
    // fifth column and be shown the first, with nothing on screen to say so — and four of the five
    // states are gallery records at the same record, so only the third (a SANDBOX state, because
    // B1's contour derives its closing side and cannot be closed wrongly) differs at a glance.
    // Every column is therefore checked against its own cell.
    CONTRAST_CELLS.forEach((cell, i) => {
      document.body.replaceChildren();
      const { dialog, applied } = mount();
      dialog.open();
      const buttons = [...(dialogOf()?.querySelectorAll("button") ?? [])].filter((b) =>
        (b.getAttribute("aria-label") ?? "").startsWith("open "),
      );
      buttons[i].click();
      const want = cell.state();
      expect(applied.length, `column ${i} asked for nothing`).toBe(1);
      expect(
        { mode: applied[0].mode, record: applied[0].record, expr: applied[0].expr, bindings: applied[0].bindings },
        `column ${i} (${cell.id}) opened a different cell`,
      ).toEqual({ mode: want.mode, record: want.record, expr: want.expr, bindings: want.bindings });
      dialog.destroy();
    });
  });

  it("offers one Open button per column, each naming its own column", () => {
    // Five buttons all reading "Open" name nothing, and a screen reader's element list is then five
    // identical rows. The names must also be plain text: an `aria-label` is read aloud, so a `$`
    // in it is spelled out.
    const { dialog } = mount();
    dialog.open();
    const names = [...(dialogOf()?.querySelectorAll("button") ?? [])]
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((n) => n.startsWith("open "));
    expect(names.length).toBe(5);
    expect(new Set(names).size, "two columns offer the same button name").toBe(5);
    // Each name is its OWN column's, checked against the table rather than against a shape: five
    // distinct names are still five wrong names if the buttons were built off the wrong index.
    // **The `$`-freeness of these labels is NOT asserted here**, because none of the five column
    // labels carries one, so the assertion could not fail and would say nothing — the falsifiable
    // half of that rule is the claim tooltips, above.
    const labels = contrastTable().cells.map((c) => c.label);
    expect(names).toEqual(labels.map((l) => `open ${l} in the app`));
  });
});

describe("the contrasts dialog — closing twice", () => {
  it("does not throw and does not move focus a second time", () => {
    // `dismiss()` is reached from Escape, from the button, from the backdrop AND from the shell's
    // own re-render, so being called twice about one gesture is the normal case. The defect a guard
    // prevents is not the throw — it is the SECOND focus move: without it, closing after the reader
    // has clicked somewhere else yanks them back to the opener out of nowhere.
    const { dialog, opener } = mount();
    opener.focus();
    dialog.open();
    dialog.close();
    expect(document.activeElement).toBe(opener);

    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    expect(() => dialog.close()).not.toThrow();
    expect(document.activeElement, "a second close yanked focus back to the opener").toBe(elsewhere);
    expect(dialog.isOpen).toBe(false);
  });

  it("can be closed before it was ever opened, and destroyed after", () => {
    // The lifecycle's edges. `destroy()` on an open dialog must take the page's `inert` off with it,
    // or unmounting the shell leaves the whole page unreachable with nothing on screen to explain it.
    const { dialog, page } = mount();
    expect(() => dialog.close()).not.toThrow();
    dialog.open();
    expect(page.hasAttribute("inert")).toBe(true);
    dialog.destroy();
    expect(page.hasAttribute("inert"), "destroy left the page inert").toBe(false);
    expect(dialogOf()).toBeNull();
    expect(dialog.isOpen).toBe(false);
  });
});
