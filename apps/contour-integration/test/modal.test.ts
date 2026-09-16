// @vitest-environment jsdom
//
// The modal mechanics, against a panel whose body is one button — M8 step 1.8.
//
// `test/contrasts.test.ts` asserts all of this through the ladder, and keeps doing so: that file is
// the no-op standard for the extraction, unchanged across it. What it CANNOT reach is the part of
// the contract that depends on a consumer the ladder is not — a dialog with no controls at all, a
// page that already carried `inert`, a build that is not idempotent. Those are the reasons the
// mechanics were worth separating from the content, so they are asserted where the content is a
// stub.
import { describe, expect, it, vi } from "vitest";

import { createModal, type Modal } from "../src/shell/modal.js";

function harness(body: (dialog: HTMLElement) => void = (d) => d.append(button("Close"))): {
  modal: Modal;
  host: HTMLElement;
  page: HTMLElement;
  builds: () => number;
} {
  const host = document.createElement("div");
  const page = document.createElement("main");
  const opener = button("Open");
  document.body.replaceChildren(host, page, opener);
  opener.focus();
  let builds = 0;
  const modal = createModal({
    host,
    page,
    backdropClass: "back",
    dialogClass: "dlg",
    onClose: () => undefined,
    build: (dialog, titleId) => {
      builds += 1;
      const h2 = document.createElement("h2");
      h2.id = titleId;
      h2.textContent = "A panel";
      dialog.append(h2);
      body(dialog);
    },
  });
  return { modal, host, page, builds: () => builds };
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
