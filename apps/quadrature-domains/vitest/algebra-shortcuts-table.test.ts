// The Algebra accelerator table, and the structural guards behind the keyboard contract.
//
// Node environment (no jsdom): these read algebra-ui's own source, and jsdom rewrites
// import.meta.url to http:. The DOM-level behaviour lives in the twin file,
// algebra-shortcuts-focus.test.ts.
//
// Most of the keyboard work happens inside installAlgebra, which needs a full DOM + solver
// to reach — so where a contract cannot be driven directly, it is pinned as a source guard.
// These are deliberately narrow: each names one property whose loss would be silent.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
// The variable-picker widget (buildPicker + the _openMenu/_closeOpenMenu coordinator) moved to its
// own module in D1d seam 3; the escapability + aria-honesty source pins below follow it there.
const PICKER = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-picker.mjs", import.meta.url)), "utf8");

let UI: any;
beforeAll(async () => {
  await import("../app/solvers/solver.mjs");                 // installs the QD namespace
  const reg: any = await import("../app/ui/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");     // IIFE side-effect: attaches the helpers
  UI = reg.QD_UI;
});

describe("KEY_ACTIONS is the single source for the handler and the cheatsheet", () => {
  it("every accelerator targets a button the module actually builds", () => {
    // Dispatching through the button is the safety property: the keystroke inherits every
    // gate the click path has (setBusy disables these mid-worker). A renamed id would turn
    // the shortcut into a silent no-op, so pin each selector to an id that exists.
    //
    // Two spellings, because the sidebar is built from a markup string while the canvas
    // toolbar is built from DOM calls — `id="alg-seed"` vs `focusBtn.id = 'alg-focus'`.
    // What matters is that the id is created somewhere, not which style created it.
    const created = (id: string) =>
      SRC.includes('id="' + id + '"') || new RegExp("\\.id\\s*=\\s*['\"]" + id + "['\"]").test(SRC);
    const missing = Object.entries(UI.ALGEBRA_KEY_ACTIONS as Record<string, any>)
      .filter(([, a]) => !created(a.sel.slice(1)))
      .map(([k, a]) => k + " → " + a.sel);
    expect(missing).toEqual([]);
  });

  it("dispatches by clicking the button rather than calling the handler", () => {
    // Calling doGroebner() directly would work — and would bypass the disabled state, letting
    // a keypress start a second worker job mid-solve. Keep the indirection.
    expect(/if\s*\(b\.disabled\)/.test(SRC)).toBe(true);
    expect(/else\s+b\.click\(\);/.test(SRC)).toBe(true);
  });

  it("the cheatsheet documents every bound key", () => {
    const listed = new Set(UI.algebraShortcutItems().map((i: any) => i.key));
    expect(Object.keys(UI.ALGEBRA_KEY_ACTIONS).filter((k) => !listed.has(k))).toEqual([]);
  });

  it("documents the keys bound outside the table too", () => {
    const listed = new Set(UI.algebraShortcutItems().map((i: any) => i.key));
    ["f", "m", "/", "Esc", "Ctrl+Z", "Delete"].forEach((k) => expect(listed.has(k)).toBe(true));
  });

  it("every cheatsheet row carries a key and a description", () => {
    UI.algebraShortcutItems().forEach((i: any) => {
      expect(typeof i.key).toBe("string"); expect(i.key.length).toBeGreaterThan(0);
      expect(typeof i.desc).toBe("string"); expect(i.desc.length).toBeGreaterThan(0);
    });
  });

  it("groups every row, so the composed list stays scannable", () => {
    UI.algebraShortcutItems().forEach((i: any) => expect(i.group).toBeTruthy());
  });
});

describe("a keystroke cannot silently discard a derivation", () => {
  it("marks exactly the reseeding action", () => {
    const acts = UI.ALGEBRA_KEY_ACTIONS as Record<string, any>;
    expect(Object.keys(acts).filter((k) => acts[k].reseeds)).toEqual(["s"]);
    expect(acts.s.sel).toBe("#alg-seed");
  });

  it("routes that one through the confirm strip", () => {
    // Clicking a labelled button is aimed; brushing a key is not. The keystroke path must
    // reach confirmReplace even though the click path does not.
    expect(/act\.reseeds\s*\)\s*confirmReplace/.test(SRC)).toBe(true);
  });
});

describe("an open card menu owns the keyboard", () => {
  it("the document-level accelerators bail while it is up", () => {
    // Without this, skimming the menu with `p` would launch a proof behind it.
    expect(/if\s*\(_ctxMenu\)\s*return;/.test(SRC)).toBe(true);
  });

  it("can be opened from the keyboard at all", () => {
    // It was pointer-only: right-click opened it and nothing else did, so a keyboard user
    // could select a card and reach none of its ten actions.
    expect(SRC).toContain("'ContextMenu'");
    expect(/ev\.shiftKey\s*&&\s*ev\.key === 'F10'/.test(SRC)).toBe(true);
  });

  it("carries menu semantics and returns focus when dismissed", () => {
    expect(/setAttribute\('role', 'menu'\)/.test(SRC)).toBe(true);
    expect(/setAttribute\('role', 'menuitem'\)/.test(SRC)).toBe(true);
    expect(/_ctxReturn/.test(SRC)).toBe(true);
  });

  it("handles its own arrows instead of letting them scroll the graph underneath", () => {
    expect(/ev\.key === 'ArrowDown'/.test(SRC)).toBe(true);
    expect(/stopPropagation/.test(SRC)).toBe(true);
  });
});

describe("the variable picker is escapable", () => {
  it("binds Escape and hands focus back to its button", () => {
    // The pickers had exactly one way out: click elsewhere. For a keyboard user that is no
    // way out at all.
    expect(/ev\.key !== 'Escape'/.test(PICKER)).toBe(true);
    expect(/btn\.focus\(\)/.test(PICKER)).toBe(true);
  });

  it("keeps aria-expanded honest through every close path", () => {
    // Three sites hid the menu directly; they now route through _closeOpenMenu so the button
    // cannot be left claiming the list is still open. (Widget in algebra-picker.mjs — D1d seam 3.)
    expect(/function _closeOpenMenu\(\)/.test(PICKER)).toBe(true);
    const directHides = PICKER.match(/_openMenu\.classList\.add\('hidden'\)/g) || [];
    expect(directHides.length).toBe(1);   // the one inside _closeOpenMenu itself
  });
});
