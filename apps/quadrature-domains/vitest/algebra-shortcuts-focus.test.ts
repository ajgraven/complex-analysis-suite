// @vitest-environment jsdom
//
// The `?` cheatsheet and the focus contract behind it.
//
// openShortcutsOverlay(items) has accepted a custom list since it was written, but no caller
// ever passed one — so `?` opened the same three generic lines (?, Esc, and a Param-slice
// binding) on every tab, while ui-strings advertised "Press ? for shortcuts" and the Algebra
// workspace quietly grew fourteen bindings none of which were listed. The overlay now composes
// 'global' + whichever tab is ACTIVE WHEN THE KEY IS PRESSED, which is the property most of
// these lock: registering is not the same as showing.
//
// The focus half is the other missing contract: nothing in the app called .focus() except the
// `/` search binding, so every popup opened without focus and dismissed by dropping it on
// <body> — which on this page restarts tabbing at the tab bar.
// The accelerator table and its source-scan guards live in the node-environment twin,
// algebra-shortcuts-table.test.ts — jsdom rewrites import.meta.url to http:, so a test that
// reads its own module's source cannot run here.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import _QD from "../app/solver.mjs";

let QoL: any;
beforeAll(async () => {
  await import("../app/qol.mjs");
  QoL = (_QD as any).QoL;
});

// A tab bar the registry can read. _activeTabId() looks up `.tab-btn.active`, the same idiom
// four other modules use to decide which tab they are on.
function setActiveTab(id: string) {
  document.body.innerHTML = "";
  const bar = document.createElement("div");
  ["qd", "algebra", "schwarz"].forEach((t) => {
    const b = document.createElement("button");
    b.className = "tab-btn" + (t === id ? " active" : "");
    b.dataset.tab = t;
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
}
const overlay = () => document.querySelector(".shortcuts-overlay");
const rows = () =>
  Array.from(document.querySelectorAll(".shortcuts-table tr")).map((tr) => ({
    key: (tr.querySelector("td:first-child") as HTMLElement).textContent,
    desc: (tr.querySelector("td:last-child") as HTMLElement).textContent,
  }));
const descs = () => rows().map((r) => r.desc);

beforeEach(() => setActiveTab("qd"));
afterEach(() => { QoL.closeShortcutsOverlay(); document.body.innerHTML = ""; });

describe("the cheatsheet is composed per tab, at press time", () => {
  it("falls back to the genuinely global entries when nothing is registered", () => {
    QoL.openShortcutsOverlay();
    // 'qd' has no registration of its own, so only the global defaults show — and those are
    // now only the keys that really are global. A Param-slice binding used to be listed here,
    // which meant the Algebra tab advertised a key with nothing to act on.
    expect(descs()).toEqual([
      "Show / hide this shortcut list",
      "Close help popovers and tooltips",
    ]);
  });

  it("adds the ACTIVE tab's registration to the global list", () => {
    QoL.registerShortcuts("schwarz", [{ key: "r", desc: "Repaint the σ field" }]);
    setActiveTab("schwarz");
    QoL.openShortcutsOverlay();
    expect(descs()).toContain("Repaint the σ field");
    expect(descs()).toContain("Show / hide this shortcut list");   // global still present
  });

  // The bug this whole change exists to close: a registration that is never consulted.
  it("shows a DIFFERENT tab's list once the active tab changes", () => {
    QoL.registerShortcuts("schwarz", [{ key: "r", desc: "Repaint the σ field" }]);
    QoL.registerShortcuts("algebra", [{ key: "g", desc: "Gröbner basis" }]);

    setActiveTab("schwarz");
    QoL.openShortcutsOverlay();
    expect(descs()).toContain("Repaint the σ field");
    expect(descs()).not.toContain("Gröbner basis");
    QoL.closeShortcutsOverlay();

    setActiveTab("algebra");
    QoL.openShortcutsOverlay();
    expect(descs()).toContain("Gröbner basis");
    expect(descs()).not.toContain("Repaint the σ field");
  });

  it("still honours an explicit list, overriding both scopes (back-compat)", () => {
    QoL.registerShortcuts("qd", [{ key: "z", desc: "registered" }]);
    QoL.openShortcutsOverlay([{ key: "q", desc: "explicit only" }]);
    expect(descs()).toEqual(["explicit only"]);
  });

  it("renders group captions, in registration order, and skips the ungrouped heading", () => {
    QoL.registerShortcuts("algebra", [
      { key: "a", desc: "no group" },
      { key: "b", desc: "second", group: "Actions" },
      { key: "c", desc: "third", group: "Navigate" },
    ]);
    setActiveTab("algebra");
    QoL.openShortcutsOverlay();
    const caps = Array.from(document.querySelectorAll(".shortcuts-group")).map((e) => e.textContent);
    expect(caps).toEqual(["Actions", "Navigate"]);   // 'no group' contributes no caption
  });
});

describe("descriptions are text, not markup", () => {
  // The rows used to be interpolated into an innerHTML template. Algebra descriptions carry
  // math, and a bare `<` there silently ate the rest of the row.
  it("a '<' in a description survives as a literal character", () => {
    QoL.registerShortcuts("qd", [{ key: "c", desc: "condense when zoom < 0.8 & wide" }]);
    QoL.openShortcutsOverlay();
    expect(descs()).toContain("condense when zoom < 0.8 & wide");
  });

  it("markup in a description is not parsed into elements", () => {
    QoL.registerShortcuts("qd", [{ key: "x", desc: "<b>bold</b>" }]);
    QoL.openShortcutsOverlay();
    expect(descs()).toContain("<b>bold</b>");
    expect(overlay()!.querySelector("b")).toBeNull();
  });
});

describe("the overlay is a dialog, and gives focus back", () => {
  it("announces itself as a modal dialog", () => {
    QoL.openShortcutsOverlay();
    const el = overlay()!;
    expect(el.getAttribute("role")).toBe("dialog");
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(el.getAttribute("aria-label")).toBe("Keyboard shortcuts");
  });

  it("takes focus on open and returns it to the opener on close", () => {
    const btn = document.querySelector(".tab-btn") as HTMLElement;
    btn.focus();
    expect(document.activeElement).toBe(btn);

    QoL.openShortcutsOverlay();
    expect(document.activeElement).toBe(overlay());

    QoL.closeShortcutsOverlay();
    expect(document.activeElement).toBe(btn);
  });

  it("does not force focus onto <body> when nothing was focused", () => {
    QoL.openShortcutsOverlay();
    const el = overlay();
    QoL.closeShortcutsOverlay();
    expect(el!.isConnected).toBe(false);             // closed cleanly…
    expect(document.activeElement).toBe(document.body);   // …and restored nothing that was nothing
  });

  it("offers a pointer route out, not just Esc", () => {
    QoL.openShortcutsOverlay();
    const x = overlay()!.querySelector(".shortcuts-close") as HTMLElement;
    expect(x).toBeTruthy();
    x.click();
    expect(overlay()).toBeNull();
  });
});

describe("the ? key toggles the overlay without a caller passing a list", () => {
  // wireGlobalKeyboardShortcuts runs on import, so this exercises the real binding — the one
  // that never passed `items` and is why the cheatsheet was generic for every tab.
  it("opens on ? and shows the active tab's rows", () => {
    QoL.registerShortcuts("algebra", [{ key: "g", desc: "Gröbner basis" }]);
    setActiveTab("algebra");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    expect(overlay()).toBeTruthy();
    expect(descs()).toContain("Gröbner basis");
  });

  it("closes again on ?, and on Esc", () => {
    QoL.openShortcutsOverlay();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    expect(overlay()).toBeNull();

    QoL.openShortcutsOverlay();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(overlay()).toBeNull();
  });
});
