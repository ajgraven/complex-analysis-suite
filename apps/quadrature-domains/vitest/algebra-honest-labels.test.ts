// Tier 2 — labels that overstated their scope, controls that did nothing, exports that emitted
// nothing, and one destructive toggle that looked like a view option.
//
// SOURCE-STRUCTURAL half (refactor Phase 2, QD-ALG-3). The rendered button LABELS (Gröbner "current
// column", "Copy all LaTeX") moved to the behavioural companion algebra-honest-labels-dom.test.ts,
// which mounts the sidebar and reads them off the DOM — so they survive the D1a sidebar-as-data
// refactor. What stays here guards things a rendered snapshot cannot see: the button-passes-no-
// selection WIRING, the export guard-clause ORDERING, the ui-strings tooltip DATA, the canvas 2-node
// cap, and the fix-φ(0) confirmReplace flow.
//
// Node environment, source-only (jsdom rewrites import.meta.url to http:, breaking fileURLToPath).
// Comments are blanked so prose describing a defect cannot satisfy a check meant to find it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UI = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
const STRINGS = readFileSync(
  fileURLToPath(new URL("../app/ui-strings.mjs", import.meta.url)), "utf8");
const CODE = UI
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

function bodyOf(name: string): string {
  const start = CODE.indexOf("function " + name + "(");
  expect(start, "function " + name + " not found").toBeGreaterThan(-1);
  const rest = CODE.slice(start + 1);
  const next = rest.search(/\n {4}function [A-Za-z_]/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("2.1 — the Gröbner button names the scope it actually uses", () => {
  // (The rendered label "Gröbner basis (current column)" — and that no control still says "all eqns" —
  // is asserted in the -dom companion.)
  it("the sidebar button really does pass no selection", () => {
    // The label is only honest while this holds; the inspector's #alg-groebner-sel is the one
    // that passes a selection.
    expect(CODE).toMatch(/#alg-groebner'\)\.addEventListener\('click', \(\) => doGroebner\(null\)\)/);
  });

  it("the tooltip agrees with the label", () => {
    // Originally asserted on tooltips.groebner. Tier 5 moved that text into algebraOps and the
    // now-unreferenced tooltips.* entry was deleted — leaving the assertion pointed at dead prose
    // would have kept it green while guarding a string the app no longer reads.
    const rec = STRINGS.match(/'alg-groebner':\s*\{\s*section:\s*`([^`]*)`,\s*short:\s*`([^`]*)`,\s*detail:\s*`([^`]*)`/);
    expect(rec, "alg-groebner has no algebraOps record").toBeTruthy();
    const [, section, short, detail] = rec as RegExpMatchArray;
    expect(section).toBe("Reduce");
    expect(short).toMatch(/current column/);                 // agrees with the button's label
    expect(detail).toMatch(/with no selection, the current column/);
    expect(detail).not.toMatch(/\(or all of them\)/);
  });
});

describe("2.2 / 2.3 — exports state their scope and refuse when empty", () => {
  it("Copy LaTeX says it takes every branch and column", () => {
    // copyLatex walks store.list() — all columns, all branches — while sitting next to
    // "Copy derivation (LaTeX)", which is the active branch. The pair read as scoped and was not.
    //
    // The LABEL is still in the markup; the scope sentence is not. Tier 5 moved every over-length
    // title into QD.Strings.algebraOps, so this originally-145-char tooltip now lives there. That
    // relocation is exactly what this assertion had to follow — it failed the gate by still
    // looking at the markup, which is the guard working, not the content going missing.
    // (The rendered "Copy all LaTeX" label is asserted in the -dom companion; here we pin the scope
    // sentence in the ui-strings record it now reads its tooltip from.)
    const rec = STRINGS.match(/'alg-copy-latex':\s*\{[^}]*?detail:\s*`([^`]*)`/);
    expect(rec, "alg-copy-latex has no algebraOps record").toBeTruthy();
    expect((rec as RegExpMatchArray)[1]).toMatch(/all columns and all branches/);
  });

  it("both unguarded exports now refuse an empty workspace", () => {
    // Six of the eight export controls already guarded on store.size. A downloaded file that looks
    // normal and contains nothing is worse than a refusal — it gets filed and shared first.
    for (const fn of ["exportJson", "copyLatex"]) {
      const body = bodyOf(fn);
      expect(body, fn + " must guard on store.size").toMatch(/if \(!store\.size\)/);
      const guard = body.indexOf("if (!store.size)");
      const work = Math.max(body.indexOf("store.exportDAG"), body.indexOf("store.list()"));
      expect(work).toBeGreaterThan(guard);        // the guard precedes the work
    }
  });
});

// 2.4 was filed as "the 3+ selection silently no-ops": renderInspector branches on sel.length, and
// doEliminate returns immediately unless it is exactly 2, so a click at 3+ would do nothing.
//
// That state is UNREACHABLE. algebra-canvas caps the selection — `if (selected.length > 2)
// selected.shift()` — so the inspector never sees more than two. The finding came from reading
// renderInspector without checking what the canvas can produce, and a guard against it would have
// been dead code with tests claiming to close a live defect.
//
// The real defect is the cap's silence: ctrl+clicking a third card drops the oldest with no
// indication. Observed live — "(●)₁ × (●)₁ (conj)" became "(●)₁ (conj) × (★)₁,₁", the first
// equation simply gone.
describe("2.4 — the two-node selection cap is stated rather than surprising", () => {
  const CANVAS = readFileSync(
    fileURLToPath(new URL("../app/algebra/algebra-canvas.mjs", import.meta.url)), "utf8");

  it("the canvas really does cap the selection at two", () => {
    // The whole reframing rests on this. If the cap is ever lifted, the inspector's 2-node
    // assumption becomes wrong and this test is where that surfaces.
    expect(CANVAS).toMatch(/selected\.length > 2\) selected\.shift\(\)/);
  });

  it("the inspector states the rule", () => {
    expect(CODE).toMatch(/Two at a time — selecting a third replaces the older of these\./);
  });

  it("no dead 3+ branch was added to the inspector", () => {
    // sel.length is exactly 2 in this panel; branching on it would be unreachable code that
    // future readers would take as evidence 3+ happens.
    const panel = CODE.slice(CODE.indexOf("const a = store.get(sel[0]), b = store.get(sel[1]);"),
                             CODE.indexOf("function updateCost"));
    expect(panel).not.toMatch(/twoUp/);
  });
});

describe("2.5 — fix φ(0)=w₀ confirms before discarding a derivation", () => {
  it("the change handler goes through confirmReplace", () => {
    // It re-seeds, which throws the derivation away. The `s` accelerator already confirmed; a
    // checkbox reads as a view option, so it needs the warning more, not less.
    const h = CODE.slice(CODE.indexOf("const w0FixCb"), CODE.indexOf("const w0FixCb") + 700);
    expect(h).toMatch(/confirmReplace\(/);
    expect(h).toMatch(/seedFromCurrent\(\)/);
  });

  it("the checkbox is uncommitted until the re-seed happens", () => {
    // `change` has already flipped it. Reverting only in an onNo callback would miss the cases
    // where the strip is superseded by another confirm or simply left on screen — the box would
    // then show a gauge the system does not have. So it flips back at once and is restored inside
    // onYes, which covers every path.
    const h = CODE.slice(CODE.indexOf("const w0FixCb"), CODE.indexOf("const w0FixCb") + 700);
    const revert = h.indexOf("w0FixCb.checked = !want");
    const restore = h.indexOf("w0FixCb.checked = want;");
    expect(revert).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(revert);
    // …and the restore sits inside the confirm callback, ahead of the re-seed it enables.
    expect(restore).toBeLessThan(h.indexOf("seedFromCurrent()"));
  });

  it("an empty workspace still toggles freely", () => {
    // With nothing seeded there is no derivation to lose, and confirmReplace would be noise.
    const h = CODE.slice(CODE.indexOf("const w0FixCb"), CODE.indexOf("const w0FixCb") + 700);
    expect(h).toMatch(/if \(!store\.size\) return;/);
  });
});
