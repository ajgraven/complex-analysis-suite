// The "Eliminate variables" sub-section of Reduce.
//
// Before this split, whole-system variable elimination was a hidden MODE of the button labelled
// "Gröbner basis (all eqns)": doGroebner read the module-level `elimSel` set, and switched to a
// block elimination order iff the `eliminate` picker — two collapsed levels down, inside Advanced
// inside Reduce — happened to be non-empty. Nothing in the UI said so. The checks below each pin
// one way that could silently come back.
//
// Node environment, source-only, matching algebra-canvas-chrome.test.ts: the markup lives inside
// mountSidebar() as a string concatenation, so there is no DOM to query without booting the whole
// module. Comments and string bodies are NOT blanked here (unlike the canvas test) because the
// markup under test *is* string literals — instead every check is anchored to markup-shaped text.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UI = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
const STRINGS = readFileSync(
  fileURLToPath(new URL("../app/ui-strings.mjs", import.meta.url)), "utf8");

/** Body of a top-level `function name(` in algebra-ui, up to the next same-indent function. */
function bodyOf(name: string): string {
  const start = UI.indexOf("function " + name + "(");
  expect(start, "function " + name + " not found").toBeGreaterThan(-1);
  const rest = UI.slice(start + 1);
  const next = rest.search(/\n {4}function [A-Za-z_]/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("the eliminate picker is reachable", () => {
  it("is mounted exactly once", () => {
    // Moving the picker up out of Advanced meant deleting the original. Two #alg-elim-pick spans
    // would leave buildPicker bound to whichever querySelector hit first, and the other rendering
    // as a permanently empty, permanently unresponsive widget.
    const mounts = [...UI.matchAll(/id="alg-elim-pick"/g)];
    expect(mounts.length).toBe(1);
  });

  it("is not inside the Advanced disclosure", () => {
    // The recorded complaint was that the picker sat two collapsed levels deep. If it drifts back
    // in, elimination becomes undiscoverable again while every other check here still passes.
    const advanced = UI.indexOf('<details class="algebra-advanced">');
    expect(advanced).toBeGreaterThan(-1);
    expect(UI.indexOf('id="alg-elim-pick"')).toBeLessThan(advanced);
  });

  it("sits under an Eliminate variables heading, above the buttons that use it", () => {
    const heading = UI.indexOf(">Eliminate variables ");
    const picker = UI.indexOf('id="alg-elim-pick"');
    const button = UI.indexOf('id="alg-eliminate-vars"');
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(picker);
    expect(picker).toBeLessThan(button);
  });
});

describe("the Gröbner button does one thing", () => {
  it("doGroebner no longer reads elimSel", () => {
    // This is the actual defect. While doGroebner consults elimSel, a button that says "Gröbner
    // basis" silently performs an elimination whenever a variable happens to still be picked from
    // an earlier step — including via the `g` accelerator, which the user never aimed at Reduce.
    expect(bodyOf("doGroebner")).not.toMatch(/elimSel/);
  });

  it("elimSel is read only by doEliminateVars", () => {
    // Stronger than the above and the one that survives refactoring: exactly one reader, and it is
    // the function behind the button whose label promises elimination. (The declaration and the
    // picker's own `selected:` wiring are the other two mentions.)
    const readers = [...UI.matchAll(/\[\.\.\.elimSel\]/g)];
    expect(readers.length).toBe(1);
    expect(bodyOf("doEliminateVars")).toMatch(/\[\.\.\.elimSel\]/);
  });

  it("doEliminateVars refuses an empty pick instead of silently running a plain basis", () => {
    // With no variables picked, forwarding to doGroebner would compute an ordinary Gröbner basis
    // and label the column an elimination — a false provenance claim on the graph.
    const body = bodyOf("doEliminateVars");
    expect(body).toMatch(/if\s*\(!elim\.length\)/);
    expect(body).toMatch(/return/);
  });

  it("passes the elimination through an explicit argument", () => {
    expect(bodyOf("doEliminateVars")).toMatch(/doGroebner\(\s*null\s*,\s*\{\s*eliminate:/);
  });
});

describe("the group captions describe what the buttons do to the solution set", () => {
  // Honest labeling is the project's central guardrail, and a group caption is a claim about
  // every button under it. "Same solutions, better shape" is true of a Gröbner basis and a
  // triangular chain; it is false of Saturate (deletes the |z_j|=1 stratum), Pin known data
  // (specializes the family to one domain) and Propagate constraints (adds nodes). Grouping all
  // five under the reassuring caption would misstate three of them.
  const between = (from: string, to: string) => UI.slice(UI.indexOf(from), UI.indexOf(to));

  it("the 'same solutions' claim covers only the solution-preserving ops", () => {
    const sameSolutions = between(">Rewrite the system ", ">Narrow the system ");
    expect(sameSolutions).toMatch(/id="alg-groebner"/);
    expect(sameSolutions).toMatch(/id="alg-triangular"/);
    for (const id of ["alg-saturate", "alg-pin-data", "alg-propagate-all"]) {
      expect(sameSolutions, id + " must not sit under a same-solutions caption").not.toMatch(
        new RegExp('id="' + id + '"'));
    }
  });

  it("the ops that change the solution set say so", () => {
    const narrow = between(">Narrow the system ", '<div id="alg-factor-out"');
    for (const id of ["alg-saturate", "alg-pin-data", "alg-propagate-all"]) {
      expect(narrow).toMatch(new RegExp('id="' + id + '"'));
    }
    expect(narrow).toMatch(/deliberately changes what solves it/);
  });
});

describe("the new control is wired like its neighbours", () => {
  it("is disabled while a worker op runs", () => {
    // setBusy's id list is hand-maintained (a known drift risk). A heavy op left clickable can
    // start a second worker run and orphan the in-flight derivation.
    const busy = bodyOf("setBusy");
    expect(busy).toMatch(/'alg-eliminate-vars'/);
  });

  it("has a click handler", () => {
    expect(UI).toMatch(/#alg-eliminate-vars'\)\.addEventListener\(\s*'click'\s*,\s*doEliminateVars/);
  });
});

describe("tooltip discipline", () => {
  it("the new button's tooltip comes from ui-strings, not a hardcoded title", () => {
    // ui-strings.mjs is the stated single source of truth; the module is already lopsided the
    // other way, so a new hardcoded title makes the imbalance worse.
    const btn = UI.slice(UI.indexOf('id="alg-eliminate-vars"'), UI.indexOf('id="alg-eliminate-vars"') + 220);
    expect(btn).toMatch(/data-str-title="tooltips\.eliminateVars"/);
    expect(btn).not.toMatch(/\stitle="/);
  });

  it("that string obeys the ~120-character rule", () => {
    // The hard rule from the tooltips-as-documentation finding. The substance that does not fit
    // belongs in the caption under the buttons, where it is selectable and reachable on touch.
    const m = STRINGS.match(/eliminateVars:\s*`([^`]*)`/);
    expect(m, "tooltips.eliminateVars not found").toBeTruthy();
    expect((m as RegExpMatchArray)[1].length).toBeLessThanOrEqual(120);
  });

  it("the substance is carried as a caption instead", () => {
    // If the caption is dropped, the explanation of what elimination actually computes is gone
    // from the UI entirely rather than merely relocated.
    expect(UI).toMatch(/class="hint algebra-elim-hint"/);
    expect(UI).toMatch(/algebra-elim-hint[^]*?elimination ideal/);
  });

  it("the caption points at the two-node resultant", () => {
    // Elimination between exactly two equations lives in the inspector and appears only when two
    // cards are selected. Without this pointer the sidebar looks like the only way to eliminate.
    expect(UI).toMatch(/algebra-elim-hint[^]*?Sylvester resultant/);
  });
});
