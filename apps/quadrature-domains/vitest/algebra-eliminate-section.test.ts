// The "Eliminate variables" sub-section of Reduce — SOURCE-STRUCTURAL half (refactor Phase 2, QD-ALG-3).
//
// Before this split, whole-system variable elimination was a hidden MODE of the button labelled
// "Gröbner basis (all eqns)": doGroebner read the module-level `elimSel` set, and switched to a block
// elimination order iff the `eliminate` picker happened to be non-empty. Nothing in the UI said so.
//
// The DOM-structure checks (picker placement, caption grouping, the control's marker/tooltip/caption)
// moved to the behavioural companion algebra-eliminate-section-dom.test.ts, which mounts the sidebar and
// queries the rendered DOM — so they survive the D1a sidebar-as-data refactor. What stays HERE guards
// things a rendered snapshot cannot see: the SHAPE of the handler functions (doGroebner must not read
// elimSel; doEliminateVars is the sole reader and refuses an empty pick) and the ui-strings DATA (the
// ~120-char tooltip rule). Node environment: jsdom rewrites import.meta.url to http:, breaking
// fileURLToPath. Same split convention as algebra-workflow-sections / -workflow-steps.
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

describe("the Gröbner button does one thing", () => {
  it("doGroebner no longer reads elimSel", () => {
    // This is the actual defect. While doGroebner consults elimSel, a button that says "Gröbner
    // basis" silently performs an elimination whenever a variable happens to still be picked from an
    // earlier step — including via the `g` accelerator, which the user never aimed at Reduce.
    expect(bodyOf("doGroebner")).not.toMatch(/elimSel/);
  });

  it("elimSel is read only by doEliminateVars", () => {
    // Stronger than the above and the one that survives refactoring: exactly one reader, and it is the
    // function behind the button whose label promises elimination. (The declaration and the picker's
    // own `selected:` wiring are the other two mentions.)
    const readers = [...UI.matchAll(/\[\.\.\.elimSel\]/g)];
    expect(readers.length).toBe(1);
    expect(bodyOf("doEliminateVars")).toMatch(/\[\.\.\.elimSel\]/);
  });

  it("doEliminateVars refuses an empty pick instead of silently running a plain basis", () => {
    // With no variables picked, forwarding to doGroebner would compute an ordinary Gröbner basis and
    // label the column an elimination — a false provenance claim on the graph.
    const body = bodyOf("doEliminateVars");
    expect(body).toMatch(/if\s*\(!elim\.length\)/);
    expect(body).toMatch(/return/);
  });

  it("passes the elimination through an explicit argument", () => {
    expect(bodyOf("doEliminateVars")).toMatch(/doGroebner\(\s*null\s*,\s*\{\s*eliminate:/);
  });
});

describe("the new control's wiring and tooltip data (node-checked invariants)", () => {
  it("has a click handler bound to doEliminateVars", () => {
    // The behavioural companion pins that the button EXISTS and is marked/labelled; this pins that the
    // click is wired to the elimination handler, not left inert or pointed at doGroebner.
    expect(UI).toMatch(/#alg-eliminate-vars'\)\.addEventListener\(\s*'click'\s*,\s*doEliminateVars/);
  });

  it("the eliminateVars tooltip string obeys the ~120-character rule", () => {
    // The hard rule from the tooltips-as-documentation finding. The substance that does not fit belongs
    // in the caption under the buttons (verified rendered in the -dom companion), where it is
    // selectable and reachable on touch.
    const m = STRINGS.match(/eliminateVars:\s*`([^`]*)`/);
    expect(m, "tooltips.eliminateVars not found").toBeTruthy();
    expect((m as RegExpMatchArray)[1].length).toBeLessThanOrEqual(120);
  });
});
