// @vitest-environment jsdom
//
// The modal mechanics, against a panel whose body is three stub buttons — M8 step 1.8, widened at
// step 3.5.
//
// Written first for the part of the contract no consumer could reach — a dialog with no controls at
// all, a page that already carried `inert`, a build that is not idempotent — which is what made the
// mechanics worth separating from the content. **Step 3.5 deleted the contrasts dialog**, which had
// been asserting the rest of the contract through the ladder, and the rest of the contract moved
// here rather than going with it; the second block below says why, and where each test came from.
import { describe, expect, it, vi } from "vitest";

import { createModal, type Modal } from "../src/shell/modal.js";

/**
 * The default panel body: THREE controls, so the cycle is about something.
 *
 * Two would make "Tab steps forward inside the dialog" and "Tab wraps off the end" the same move,
 * and a trap that only ever wraps would pass both. Three is the smallest body in which the interior
 * step and the wrap are distinguishable in each direction.
 */
const threeControls = (d: HTMLElement): void => {
  d.append(button("Close"), button("Step"), button("Open in the app"));
};

function harness(body: (dialog: HTMLElement) => void = threeControls): {
  modal: Modal;
  host: HTMLElement;
  page: HTMLElement;
  opener: HTMLButtonElement;
  builds: () => number;
  /** How many times the consumer was told the panel is going away. */
  closes: () => number;
} {
  const host = document.createElement("div");
  const page = document.createElement("main");
  const opener = button("Open");
  // Something focusable BEHIND the dialog, in the element that is made `inert`. Without it "the page
  // is inert" would be a claim about an empty box.
  const behind = button("somewhere else entirely");
  page.append(behind);
  document.body.replaceChildren(host, page, opener);
  opener.focus();
  let builds = 0;
  let closes = 0;
  const modal = createModal({
    host,
    page,
    backdropClass: "back",
    dialogClass: "dlg",
    onClose: () => {
      closes += 1;
    },
    build: (dialog, titleId) => {
      builds += 1;
      const h2 = document.createElement("h2");
      h2.id = titleId;
      h2.textContent = "A panel";
      dialog.append(h2);
      body(dialog);
    },
  });
  return { modal, host, page, opener, builds: () => builds, closes: () => closes };
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  return b;
}

const dialogOf = (host: ParentNode): HTMLElement | null => host.querySelector<HTMLElement>('[role="dialog"]');

const key = (el: Element, k: string, shift = false): KeyboardEvent => {
  const e = new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

/**
 * Send a key to whatever has focus, the way a reader does. Returns `false` when it was cancelled.
 *
 * The trap is driven off `document.activeElement`, so a test that dispatched at a fixed element
 * would be testing the handler and not the cycle.
 */
const press = (k: string, shift = false): boolean => !key(document.activeElement ?? document.body, k, shift).defaultPrevented;

/** The mounted dialog, or a failure here rather than a confusing one three assertions later. */
function requireDialog(host: ParentNode): HTMLElement {
  const found = dialogOf(host);
  if (found === null) throw new Error("no dialog is mounted in the host");
  return found;
}

/**
 * What Tab must land on, in order.
 *
 * **Every control in these panels is a `<button>`, and that is what is queried — deliberately NOT
 * the module's own `FOCUSABLE` selector.** A helper that recomputes the expected list the way the
 * code computes it adapts to whatever the code decides is focusable, so it cannot see that decision
 * change: step 1.7's sweep found exactly that, with `dialog.tabIndex` changed from `-1` to `0` and
 * the mirror-selector version of this helper obligingly including the dialog in both lists. Naming
 * the elements independently is what makes "the cycle is the CONTROLS" an assertion.
 */
function focusables(dialog: HTMLElement): HTMLButtonElement[] {
  return [...dialog.querySelectorAll("button")];
}

describe("the modal's contract, where the ladder cannot reach it", () => {
  it("BUILDS ONCE, however many times it is opened", () => {
    // The ladder cannot see this: its `build` is a `patch` against an identical description, so a
    // second call is a no-op and the mutant that drops the `built` guard survives its whole suite.
    // A build is not free in general — the front door's draws a thumbnail per record — and a build
    // that is not idempotent is a defect the container must not be able to cause.
    const { modal, builds } = harness();
    modal.open();
    modal.close();
    modal.open();
    modal.close();
    modal.open();
    expect(builds()).toBe(1);
  });

  it("does not build at all until the FIRST open", () => {
    const { modal, builds, host } = harness();
    expect(builds(), "a panel nobody opened cost its content").toBe(0);
    expect(dialogOf(host), "the backdrop was in the document before it was opened").toBeNull();
    modal.open();
    expect(builds()).toBe(1);
  });

  it("holds focus on the dialog when there is NOTHING to cycle through", () => {
    // The `items.length === 0` branch, which the ladder's six buttons make unreachable — it was an
    // equivalent mutant there. Tab must not walk out into a page that is `inert` and therefore
    // cannot be interacted with; there is nowhere to send focus, so it stays.
    const { modal, host } = harness(() => undefined);
    modal.open();
    const dialog = dialogOf(host);
    if (dialog === null) throw new Error("no dialog");
    const event = key(dialog, "Tab");
    expect(event.defaultPrevented, "Tab was left to the browser, which has nowhere to send it").toBe(true);
    expect(document.activeElement).toBe(dialog);
  });

  it("RESTORES `inert` rather than clearing it, when the page already had it", () => {
    // Two modals over one page, or a page a later step makes inert for its own reasons: closing the
    // inner one must not hand the reader a page the outer one is still covering.
    const { modal, page } = harness();
    page.setAttribute("inert", "");
    modal.open();
    expect(page.hasAttribute("inert")).toBe(true);
    modal.close();
    expect(page.hasAttribute("inert"), "closing cleared an `inert` it did not set").toBe(true);
  });

  it("gives focus back to the opener, and only once", () => {
    const { modal } = harness();
    const opener = document.activeElement;
    modal.open();
    expect(document.activeElement).not.toBe(opener);
    modal.close();
    expect(document.activeElement).toBe(opener);
    // A second close must not move focus again — `dismiss()` is reached from Escape, a control, the
    // backdrop AND the consumer's re-render, so being called twice about one gesture is normal.
    const elsewhere = button("elsewhere");
    document.body.append(elsewhere);
    elsewhere.focus();
    modal.close();
    expect(document.activeElement, "a second close moved focus a second time").toBe(elsewhere);
  });

  it("names itself by the heading the CONSUMER put the title id on", () => {
    // `aria-labelledby` is generated here and resolved there; a modal whose id nobody used is a
    // dialog with no accessible name, which is the one thing `role="dialog"` must not be.
    const { modal, host } = harness();
    modal.open();
    const dialog = dialogOf(host);
    const id = dialog?.getAttribute("aria-labelledby") ?? "";
    expect(id).not.toBe("");
    expect(document.getElementById(id)?.textContent).toBe("A panel");
  });

  it("gives two modals over one page DIFFERENT heading ids", () => {
    // One sequence per module, so two panels mounted at once cannot both claim the same id — which
    // would make `aria-labelledby` resolve to whichever came first in the document.
    const a = harness();
    const first = (a.modal.open(), dialogOf(a.host)?.getAttribute("aria-labelledby"));
    const b = harness();
    const second = (b.modal.open(), dialogOf(b.host)?.getAttribute("aria-labelledby"));
    expect(first).not.toBe(second);
  });

  it("can be destroyed before it was ever opened, and closed after", () => {
    const { modal, page } = harness();
    expect(() => {
      modal.destroy();
    }).not.toThrow();
    expect(page.hasAttribute("inert")).toBe(false);
    expect(() => {
      modal.close();
    }).not.toThrow();
  });

  it("tells the consumer on EVERY dismissal, and never on a bare close", () => {
    // The split the consumer depends on: `close()` takes the DOM down, `dismiss()` also clears
    // whatever session flag the consumer renders from. A shell re-rendering its way to `close()`
    // must not re-enter its own `onClose`.
    const host = document.createElement("div");
    const page = document.createElement("main");
    document.body.replaceChildren(host, page);
    const onClose = vi.fn();
    const modal = createModal({
      host,
      page,
      backdropClass: "back",
      dialogClass: "dlg",
      onClose,
      build: (dialog, titleId) => {
        const h2 = document.createElement("h2");
        h2.id = titleId;
        dialog.append(h2, button("Close"));
      },
    });
    modal.open();
    modal.close();
    expect(onClose, "a bare close told the consumer, which would re-enter its own render").not.toHaveBeenCalled();
    modal.open();
    modal.dismiss();
    expect(onClose).toHaveBeenCalledTimes(1);
    // And the DOM really went, which is the half that matters: a modal that outlives its own Escape
    // has trapped the reader.
    expect(dialogOf(host)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// The half of the contract the CONTRAST LADDER used to hold — M8 step 3.5.
//
// Everything below ran in `test/contrasts.test.ts`, against the ladder's own dialog, until step 3.5
// turned the ladder into a strip of cards in the shell's grid and there was no contrasts dialog left
// to assert it through. The tests did not go with it, because none of them was ever about the
// ladder: where focus goes, what Tab does at the ends, whether the page behind is reachable and
// whether the thing shuts are this module's behaviour, borrowed by whichever consumer happened to be
// mounted.
//
// **Testing the module that OWNS the behaviour is strictly stronger than testing it through one
// consumer.** A consumer can be deleted — this one was — and the coverage goes with it silently,
// since nothing in the suite says which claims were only true by way of the ladder's six buttons.
// It can also satisfy a claim for its own reasons: the ladder's `build` is a `patch` against an
// identical description, so the `built` guard was an equivalent mutant there, and its six controls
// made the empty-`items` branch unreachable. Against a panel whose body is three stub buttons, what
// is asserted is the container.
// ---------------------------------------------------------------------------------------------

describe("the modal — focus", () => {
  it("moves focus INTO the dialog on open", () => {
    // A dialog that does not take focus leaves a keyboard reader tabbing through a page they cannot
    // see. `contains` rather than "not the opener", because focus dropped on `<body>` is not the
    // opener either and is just as wrong.
    //
    // The other half of the ladder's version of this property — that focus comes BACK to the opener,
    // and only once — is asserted above in "gives focus back to the opener, and only once" and is
    // deliberately not restated here.
    const { modal, host, opener } = harness();
    expect(document.activeElement).toBe(opener);
    modal.open();
    const dialog = requireDialog(host);
    expect(dialog.contains(document.activeElement), "focus stayed outside the dialog").toBe(true);
  });

  it("lands on the dialog itself, so the first Space does not shut it", () => {
    // The specific choice, asserted so a later change has to argue with it: focusing the first
    // control means focusing `Close`, and Space on a focused button ACTIVATES it — a reader who
    // opens the panel and presses Space to scroll it closes it again instantly.
    const { modal, host } = harness();
    modal.open();
    expect(document.activeElement).toBe(requireDialog(host));
    expect(document.activeElement?.tagName.toLowerCase(), "the container is not a button").not.toBe("button");
  });

  it("does not re-capture the return target on a second open", () => {
    // The defect: `open()` called again while open captures whatever is focused NOW — a control
    // inside the dialog — so closing focuses a node that has just left the document and the reader
    // is dropped on `<body>` with no announcement at all.
    const { modal, host, opener } = harness();
    modal.open();
    focusables(requireDialog(host))[0].focus();
    modal.open();
    modal.close();
    expect(document.activeElement, "the second open re-captured a control inside the dialog").toBe(opener);
  });

  it("cycles Tab within the dialog, in both directions", () => {
    // The trap. Without it Tab off the last control walks into the page the dialog is covering,
    // which is invisible to anyone using a mouse. Asserted at both ends AND in the interior: jsdom
    // performs no tab traversal, so a trap that stepped in only at the wrap would have exactly one
    // observable behaviour here and would pass a test written only at the ends whether it stepped
    // through the interior controls or not.
    const { modal, host } = harness();
    modal.open();
    const items = focusables(requireDialog(host));
    expect(items.length, "nothing to cycle").toBeGreaterThan(2);
    const last = items.length - 1;

    items[last].focus();
    press("Tab");
    expect(document.activeElement, "Tab off the last control did not wrap to the first").toBe(items[0]);

    press("Tab");
    expect(document.activeElement, "Tab did not step forward inside the dialog").toBe(items[1]);

    items[0].focus();
    press("Tab", true);
    expect(document.activeElement, "Shift+Tab off the first control did not wrap to the last").toBe(items[last]);

    press("Tab", true);
    expect(document.activeElement, "Shift+Tab did not step backward inside the dialog").toBe(items[last - 1]);
  });

  it("SKIPS everything inside a `[hidden]` panel, in both directions", () => {
    // **The premise `FOCUSABLE`'s comment stood on was false, and the front door is why** — the
    // 2026-09-20 review. *"Every control in these dialogs is visible by construction"* held while a
    // dialog was one panel; `frontDoor.ts` has two, and `syncTabs` hides the one it is leaving
    // WITHOUT emptying it. Measured on the mounted front door: Practice tab — 23 focusables, 16 of
    // them inside the hidden records panel. A browser will not focus a `display: none` element, so
    // `items[next].focus()` is a no-op and Tab stops advancing; jsdom focuses them happily, which
    // is exactly why every test above passed.
    const { modal, host } = harness((d) => {
      const shown = document.createElement("div");
      shown.append(button("Close"), button("Step"));
      const hidden = document.createElement("div");
      hidden.setAttribute("hidden", "");
      hidden.append(button("buried one"), button("buried two"), button("buried three"));
      d.append(shown, hidden);
    });
    modal.open();
    const dialog = requireDialog(host);
    const buried = [...dialog.querySelectorAll("button")].filter((b) => b.closest("[hidden]") !== null);
    expect(buried, "nothing is hidden, so this asserts nothing").toHaveLength(3);
    const visible = [...dialog.querySelectorAll("button")].filter((b) => b.closest("[hidden]") === null);
    expect(visible).toHaveLength(2);

    // Forward off the last VISIBLE control lands on the first visible one — not on the first buried
    // one, which is what sits next in document order.
    visible[visible.length - 1].focus();
    press("Tab");
    expect(document.activeElement, "Tab walked into the hidden panel").toBe(visible[0]);
    // And backwards, where the hidden three are the tail of the list.
    press("Tab", true);
    expect(document.activeElement, "Shift+Tab wrapped onto a hidden control").toBe(visible[visible.length - 1]);
    // Nothing buried is ever reached: four Tabs on a two-control cycle return to where they started.
    for (let i = 0; i < 4; i++) press("Tab");
    expect(buried).not.toContain(document.activeElement);
  });

  it("sends Tab from the container to the first control, and Shift+Tab to the last", () => {
    // Where `open()` leaves focus is not in the cycle (`tabIndex = -1`, so `querySelectorAll` never
    // returns it), which makes the two moves out of it their own case. Get this wrong and a reader
    // who opens the dialog and presses Tab goes nowhere at all — the one keystroke every keyboard
    // reader makes first.
    const { modal, host } = harness();
    modal.open();
    const dialog = requireDialog(host);
    const items = focusables(dialog);
    press("Tab");
    expect(document.activeElement).toBe(items[0]);

    dialog.focus();
    press("Tab", true);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

describe("the modal — the two keystrokes it takes over", () => {
  it("CANCELS the Tab it handled, so the browser does not move focus as well", () => {
    // **jsdom performs no tab traversal, so the trap looks right here whether or not it cancels the
    // event** — and in a real browser an uncancelled Tab moves focus a second time, on top of the
    // move the trap just made, landing two controls along or out of the dialog entirely. The
    // dispatch's return value is the one signal for that which this environment does have.
    const { modal, host } = harness();
    modal.open();
    focusables(requireDialog(host))[0].focus();
    expect(press("Tab"), "the Tab was not cancelled — the browser will move focus again").toBe(false);
    expect(press("Tab", true), "the Shift+Tab was not cancelled").toBe(false);
  });

  it("does not let Escape reach the rest of the app", () => {
    // The stage's own Escape abandons a half-drawn pen path. A reader shutting a dialog that happens
    // to be over the stage did not ask for that, and would have no way to connect the two.
    const seen: string[] = [];
    const spy = (event: Event): void => {
      seen.push((event as KeyboardEvent).key);
    };
    document.addEventListener("keydown", spy);
    try {
      const { modal } = harness();
      modal.open();
      press("Escape");
      expect(seen, "Escape bubbled out of the dialog and into the app").toEqual([]);
      // The listener really is wired: a key the modal does not take over reaches the document, so
      // the emptiness above is Escape being stopped rather than the spy never having been called.
      press("k");
      expect(seen, "nothing reaches the document at all — the assertion above says nothing").toEqual(["k"]);
    } finally {
      document.removeEventListener("keydown", spy);
    }
  });
});

describe("the modal — the page behind it", () => {
  it("marks the page `inert` while open and restores it after", () => {
    // **jsdom does not implement `inert`** — measured: `"inert" in document.createElement("div")` is
    // false, there is no accessor on `HTMLElement.prototype`, assigning the property creates an
    // expando that reflects to no attribute, and focus reaches a button inside an inert subtree. So
    // the ATTRIBUTE is what the module writes and what is asserted here; a property read would pass
    // against `el.inert = true` writing nothing anybody can see. What cannot be asserted in this
    // environment is the EFFECT — that focus and the accessibility tree really stop at the dialog —
    // and that is a browser's job, said plainly rather than faked with a property read.
    expect("inert" in document.createElement("div"), "jsdom grew inert — assert the effect, not the attribute").toBe(false);

    const { modal, page } = harness();
    expect(page.hasAttribute("inert")).toBe(false);
    modal.open();
    expect(page.hasAttribute("inert"), "the page behind the modal is still reachable").toBe(true);
    modal.close();
    expect(page.hasAttribute("inert"), "the page was left inert after the dialog went away").toBe(false);
  });

  it("closes on Escape", () => {
    // Escape is the one shortcut every reader tries, and a modal that ignores it is a trap. It must
    // also tell the consumer, or whatever session flag the panel is rendered from stays set and the
    // next render puts the dialog straight back up — so the ask is asserted alongside the DOM going
    // away. Escape reaches `dismiss` by its own listener, which is why this is not covered by the
    // direct `dismiss()` call in "tells the consumer on EVERY dismissal".
    const { modal, host, closes } = harness();
    modal.open();
    press("Escape");
    expect(modal.isOpen, "Escape did not shut it").toBe(false);
    expect(dialogOf(host), "the dialog is still in the document").toBeNull();
    expect(closes(), "the consumer was not told, so its next render reopens it").toBe(1);
  });

  it("closes on a Close button the consumer built", () => {
    // The pointer's route to the same place, from a control the module does not own — which is the
    // whole arrangement the `dismiss` half of the interface exists for. Separate from Escape because
    // they are separate listeners and the ladder's first draft wired only one of them through
    // `dismiss`. Focus is back on the opener BEFORE the consumer's `onClose` can re-render, which is
    // the ordering a consumer that tears its panel down depends on: `close()` runs first, so the
    // opener is still in the document to receive focus.
    const closeButton = button("Close");
    const h = harness((d) => {
      d.append(closeButton, button("Step"));
    });
    closeButton.addEventListener("click", () => {
      h.modal.dismiss();
    });
    h.modal.open();
    closeButton.click();
    expect(h.modal.isOpen).toBe(false);
    expect(dialogOf(h.host), "the dialog outlived its own Close button").toBeNull();
    expect(h.closes(), "the consumer was not told").toBe(1);
    expect(document.activeElement, "focus was not returned before the consumer re-rendered").toBe(h.opener);
  });
});
