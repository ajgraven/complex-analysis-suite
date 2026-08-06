// @vitest-environment jsdom
//
// Behavioural net for the variable-picker widget (the dropdown checklist). Written NET-FIRST for
// refactor Phase 3 · D1d seam 3, which lifts buildPicker + the single-open-menu coordinator
// (_openMenu / _closeOpenMenu) into app/algebra/algebra-picker.mjs. The widget had no RUNTIME
// coverage — the #210 snapshot pins only the static host, and algebra-shortcuts-table pins the
// coordinator's SOURCE shape. This drives the behaviour: open → render the current variables as a
// checklist, toggle → mutate the selection Set + relabel the button, one-menu-open-at-a-time, and
// Esc / outside-click close. It must pass against the UNMODIFIED algebra-ui.mjs, then guard the carve.
//
// Feasible headlessly: #alg-seed-moment seeds the A–S moment system (store.seedFromPolys, no solve),
// so store.variables() / baseVariables() return real names; the pickers live in the sidebar
// (#alg-elim-pick / #alg-real-pick), so no canvas is needed.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mountAlgebra, seedMoments, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
const $ = (s: string) => m.$(s) as HTMLElement;
const pickerBtn = (host: string) => $(host).querySelector("button.algebra-picker-btn") as HTMLButtonElement;
const pickerMenu = (host: string) => $(host).querySelector(".algebra-picker-menu") as HTMLElement;
const isOpen = (host: string) => !pickerMenu(host).classList.contains("hidden");
const boxes = (host: string) =>
  Array.from(pickerMenu(host).querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];

beforeAll(async () => {
  m = await mountAlgebra();     // sidebar-only — the pickers live in the sidebar, no canvas needed
  seedMoments(m);               // populate store.variables() / baseVariables()
});
// Start each test with every menu closed — a prior test may have left one open (an outside click
// routes through the same document-level close handler the widget installs).
beforeEach(() => { document.body.click(); });

describe("the picker opens into a checklist of the current variables", () => {
  it("both pickers rendered their button (harness precondition)", () => {
    expect(pickerBtn("#alg-elim-pick")).toBeTruthy();
    expect(pickerBtn("#alg-real-pick")).toBeTruthy();
  });

  it("clicking the button opens the menu and renders one checkbox per variable", () => {
    expect(isOpen("#alg-elim-pick")).toBe(false); // starts closed
    pickerBtn("#alg-elim-pick").click();
    expect(isOpen("#alg-elim-pick")).toBe(true);
    expect(pickerBtn("#alg-elim-pick").getAttribute("aria-expanded")).toBe("true");
    expect(boxes("#alg-elim-pick").length).toBeGreaterThan(0); // eliminate lists all current vars
  });

  it("toggling a checkbox selects the variable and updates the button count", () => {
    pickerBtn("#alg-elim-pick").click(); // open
    const cb = boxes("#alg-elim-pick")[0];
    expect(cb).toBeTruthy();
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    // The button label carries the count of selected vars — the visible signal the Set changed.
    expect(pickerBtn("#alg-elim-pick").textContent).toMatch(/\(1\)/);
    cb.checked = false; // leave the selection Set clean for the other tests
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    expect(pickerBtn("#alg-elim-pick").textContent).not.toMatch(/\(1\)/);
  });
});

describe("only one picker menu is open at a time, and it closes on Esc / outside click", () => {
  it("opening a second picker closes the first (single-flight menu)", () => {
    pickerBtn("#alg-elim-pick").click();
    expect(isOpen("#alg-elim-pick")).toBe(true);
    pickerBtn("#alg-real-pick").click();
    expect(isOpen("#alg-real-pick")).toBe(true);
    expect(isOpen("#alg-elim-pick")).toBe(false); // the coordinator closed the first
  });

  it("Escape inside the menu closes it and restores aria-expanded", () => {
    pickerBtn("#alg-elim-pick").click();
    expect(isOpen("#alg-elim-pick")).toBe(true);
    pickerMenu("#alg-elim-pick").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(isOpen("#alg-elim-pick")).toBe(false);
    expect(pickerBtn("#alg-elim-pick").getAttribute("aria-expanded")).toBe("false");
  });

  it("a click elsewhere in the document closes the open menu", () => {
    pickerBtn("#alg-elim-pick").click();
    expect(isOpen("#alg-elim-pick")).toBe(true);
    document.body.click(); // the document-level close handler the widget installs
    expect(isOpen("#alg-elim-pick")).toBe(false);
  });
});
