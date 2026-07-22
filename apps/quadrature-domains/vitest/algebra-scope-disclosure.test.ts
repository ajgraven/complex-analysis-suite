// Operation scope: which sidebar ops narrow to the canvas selection, and whether they say so.
//
// Three sidebar buttons (Existence / uniqueness, Saturate, Triangular decomp.) silently use the
// canvas selection when one exists; their neighbours in the same sections always take the whole
// current column. The selection lives ~900px away on the canvas, so nothing indicated which you
// were about to get — and doClassify, which produces the rigor-badged verdict, disclosed the slice
// caveat, the factor-branch caveat and the incomplete-decomposition caveat but NOT this one.
//
// Node environment, source-only (see algebra-eliminate-section.test.ts for why the DOM is out of
// reach here). Comments are blanked so prose about a symbol cannot satisfy a check meant to find
// it in code — these checks are about handlers, not markup.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

function bodyOf(name: string): string {
  const start = CODE.indexOf("function " + name + "(");
  expect(start, "function " + name + " not found").toBeGreaterThan(-1);
  const rest = CODE.slice(start + 1);
  const next = rest.search(/\n {4}function [A-Za-z_]/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Handlers that read the canvas selection to scope their operation. */
const SCOPED = ["doClassify", "doSaturate", "doTriangular"];
/** Handlers in the same sections that always operate on the whole current column. */
const WHOLE_COLUMN = ["doDimension", "doSolve", "doDecompose", "doResolvent", "doBifurcation"];

describe("the scoped set is what we think it is", () => {
  it.each(SCOPED)("%s reads the canvas selection", (fn) => {
    expect(bodyOf(fn)).toMatch(/canvas.*getSelection\(\)/);
  });

  it.each(WHOLE_COLUMN)("%s does not read the canvas selection", (fn) => {
    // If one of these grows selection-awareness it must be added to SELECTION_SCOPED too, or the
    // banner will under-report and a verdict will narrow with nothing said. This test is the
    // tripwire for that.
    expect(bodyOf(fn)).not.toMatch(/getSelection\(\)/);
  });

  it("the registry lists exactly the scoped ops, by their button ids", () => {
    const reg = CODE.slice(CODE.indexOf("const SELECTION_SCOPED"),
                           CODE.indexOf("];", CODE.indexOf("const SELECTION_SCOPED")));
    for (const id of ["alg-classify", "alg-saturate", "alg-triangular"]) {
      expect(reg).toMatch(new RegExp("'" + id + "'"));
    }
    const entries = [...reg.matchAll(/id:\s*'/g)];
    expect(entries.length).toBe(SCOPED.length);
  });
});

describe("the verdict discloses a narrowed scope", () => {
  it("doClassify appends scopeCaveat", () => {
    // The defect: a count over 2 of 16 equations rendered with a full rigor badge and no way to
    // tell it was not about the whole system.
    expect(bodyOf("doClassify")).toMatch(/verdict\s*\+=\s*scopeCaveat\(sel\)/);
  });

  it("scopeCaveat is silent when nothing is selected", () => {
    // It must not decorate ordinary whole-column verdicts, or the caveat becomes noise and stops
    // being read — which is how the real ones get ignored too.
    expect(bodyOf("scopeCaveat")).toMatch(/if\s*\(!sel\s*\|\|\s*!sel\.length\)\s*return\s*''/);
  });

  it("scopeCaveat is silent when the whole column is selected", () => {
    // Selecting everything narrows nothing. A caveat there would be false.
    expect(bodyOf("scopeCaveat")).toMatch(/n\s*>=\s*cur\.length/);
  });

  it("only claims the bound direction when the selection is a subset of the current column", () => {
    // V(J) ⊇ V(I) for J ⊆ I, so dropping equations can only ADD solutions — the sub-system count is
    // an upper bound on the full one. That reasoning needs the selection to BE a subset; a
    // selection reaching into earlier columns is a different system and gets no bound claim.
    const body = bodyOf("scopeCaveat");
    expect(body).toMatch(/subsetOfCurrent/);
    const guard = body.indexOf("if (!subsetOfCurrent)");
    const bound = body.indexOf("UPPER BOUND");
    expect(guard).toBeGreaterThan(-1);
    expect(bound).toBeGreaterThan(guard);          // the bound claim sits after the non-subset bail
  });

  it("the mutating scoped ops carry the note into their toasts", () => {
    // Saturate asserts the count is now EXACT; triangular asserts zero- vs positive-dimensional.
    // Both are claims about "the system", so which system has to travel with them.
    expect(bodyOf("doSaturate")).toMatch(/scopeNote\(sel\)/);
    expect(bodyOf("doTriangular")).toMatch(/scopeNote\(sel\)/);
  });
});

describe("the banner warns before the click", () => {
  it("is refreshed from the single selection-change entry point", () => {
    // onSelect: renderInspector is the only selection callback, so the banner must refresh there —
    // including on the empty path, which is what clears it.
    const body = bodyOf("renderInspector");
    const call = body.indexOf("renderScopeBanner(sel)");
    const earlyReturn = body.indexOf("if (!sel.length)");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(earlyReturn);        // before the early return, or it never clears
  });

  it("names every scoped op from the registry rather than a hardcoded list", () => {
    // A second hardcoded list is how the warning and the behaviour drift apart.
    expect(bodyOf("renderScopeBanner")).toMatch(/SELECTION_SCOPED\.map/);
  });

  it("builds its text as nodes, not innerHTML", () => {
    const body = bodyOf("renderScopeBanner");
    expect(body).toMatch(/textContent/);
    expect(body).not.toMatch(/innerHTML/);
  });

  it("lives OUTSIDE #alg-sections so the inspector fade cannot dim it", () => {
    // A selection puts .is-behind-inspector on #alg-sections → opacity .55. `opacity` composites
    // the whole subtree, so a child CANNOT opt out: an `.algebra-scope { opacity: 1 }` rule inside
    // was measured in-browser still rendering at .55. The banner would then be faded by precisely
    // the state it exists to warn about. Sibling placement is the only thing that fixes it, which
    // makes the ordering here load-bearing rather than cosmetic.
    const banner = SRC.indexOf('id="alg-scope"');
    const sections = SRC.indexOf('<div id="alg-sections">');
    expect(banner).toBeGreaterThan(-1);
    expect(sections).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(sections);
  });

  it("has no opacity override that would imply the fade can be undone from inside", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../app/style.css", import.meta.url)), "utf8");
    expect(css).not.toMatch(/is-behind-inspector[^{]*\.algebra-scope[^{]*\{[^}]*opacity/);
  });
});
