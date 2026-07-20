// Canvas chrome invariants: focus mode, and the corner slot the φ/h reference sits in.
//
// Node environment (no jsdom): these read algebra-canvas's source. Both features live inside
// create(), which needs a live container plus a rendered store to reach, so the properties that
// would break silently are pinned structurally. Each names one specific failure.
//
// The module is NOT imported here. Unlike algebra-ui.mjs (which uses its imported QD binding),
// algebra-canvas.mjs touches `window.QD` at module scope, so importing it in the node
// environment throws — and jsdom is not an option because it rewrites import.meta.url to http:,
// which breaks reading the file. Source-only it is.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-canvas.mjs", import.meta.url)), "utf8");
// Blank comments and string bodies while preserving offsets, so a phrase discussed in prose
// cannot satisfy a check meant to find it in code.
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

describe("focus mode", () => {
  it("is exported from create()", () => {
    // The whole point is that computeLineage's set becomes reachable; an unexported setFocus
    // would leave it doing what it did before — tinting borders.
    expect(/setAllCollapsed[\s\S]{0,200}setFocus/.test(CODE)).toBe(true);
  });

  it("only bites when there is a selection", () => {
    // With nothing selected the lineage set is empty, so dimming "everything outside it" would
    // blank the canvas. Verified in-browser: focus on + no selection leaves 0 of 22 dimmed.
    expect(/_focus\s*&&\s*selected\.length\s*>\s*0/.test(CODE)).toBe(true);
  });

  it("has exactly one writer of .is-dimmed, so search and focus compose", () => {
    // Search and focus both want to fade nodes out. Two writers means whichever runs last
    // silently undoes the other — applyFilter sets the class unconditionally from the query, so
    // a separate focus writer would be cleared on every keystroke. Measured in-browser:
    // focus alone dims 16 of 22, focus + query dims 18 — strictly narrower than either alone.
    const writes = [...CODE.matchAll(/classList\.toggle\(\s*['"]is-dimmed['"]/g)];
    expect(writes.length).toBe(2);            // one for nodes, one for edges
    const applyStart = CODE.indexOf("function applyFilter");
    const applyEnd = CODE.indexOf("function setQuery");
    expect(applyStart).toBeGreaterThan(-1);
    expect(applyEnd).toBeGreaterThan(applyStart);
    writes.forEach((m) => {
      expect(m.index!, "every .is-dimmed write belongs to applyFilter")
        .toBeGreaterThan(applyStart);
      expect(m.index!).toBeLessThan(applyEnd);
    });
  });

  it("redraws when the selection changes", () => {
    // Focus is DEFINED by the selection. Without this, focusing one node then clicking another
    // leaves the first node's lineage lit while the inspector describes the second.
    const rs = CODE.slice(CODE.indexOf("function renderSelection"), CODE.indexOf("function toggleSelect"));
    expect(/if\s*\(_focus\)\s*applyFilter\(\)/.test(rs)).toBe(true);
  });

  it("fades edges with their endpoints", () => {
    // A lineage chain whose arrows stayed at full strength reads as floating cards.
    expect(/path\.algebra-edge[\s\S]{0,300}is-dimmed/.test(CODE)).toBe(true);
  });
});

describe("the corner slot", () => {
  it("is created and exported", () => {
    expect(/const corner = div\('algebra-corner'\)/.test(CODE)).toBe(true);
    expect(/rail,\s*corner/.test(CODE)).toBe(true);
  });

  it("is a plain container the UI fills, like rail", () => {
    // The canvas owns the seat, the UI layer owns the tenant — same split as `rail`. The card's
    // content needs activeEnv and the solve envelope, which the canvas has no business knowing.
    // (The canvas does render math via RiemannLatex for the cards themselves; the line drawn
    // here is about the reference CARD, not about math rendering in general.)
    expect(CODE).not.toContain("alg-refcard");
    expect(CODE).not.toContain("activeEnv");
  });

  it("is listed in the header's public API, which is how callers find it", () => {
    // The header went stale once already (it described free-floating overlays after P3 made the
    // chrome a grid, and omitted ten API members). Keep new members documented as they land.
    const header = SRC.slice(0, SRC.indexOf("import "));
    expect(header).toContain("corner");
    expect(header).toContain("setFocus");
  });
});
