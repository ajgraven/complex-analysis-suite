// Section order and kind (finding 4.4 — "section order contradicts the stated workflow").
//
// Node environment, source-only (jsdom breaks fileURLToPath via import.meta.url). Comments are
// blanked for checks that forbid a pattern, since the comments explain what was corrected.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UI = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
const CODE = UI
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

/** Section names in DOM order. */
const ORDER = [...CODE.matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) => m[1])
  .filter((n) => n !== "Advanced");
const at = (name: string) => ORDER.indexOf(name);

describe("the column workflow reads in the order it is performed", () => {
  it("has all eight sections", () => {
    expect(ORDER).toEqual([
      "Assume", "Pin values", "Edit system", "Reduce", "Analyze",
      "Univalence constraints", "Shape from moments", "Export",
    ]);
  });

  it("the four workflow steps are contiguous and in sequence", () => {
    // Assume/Pin values/Edit system are the three panels 4.7 split "Assumptions" into, so they
    // form one stage; then reduce, then analyze.
    expect(at("Assume")).toBeLessThan(at("Pin values"));
    expect(at("Pin values")).toBeLessThan(at("Edit system"));
    expect(at("Edit system")).toBeLessThan(at("Reduce"));
    expect(at("Reduce")).toBeLessThan(at("Analyze"));
  });

  it("Export is last", () => {
    expect(at("Export")).toBe(ORDER.length - 1);
  });
});

describe("sections that are not workflow steps sit after it, behind a visible boundary", () => {
  it("Univalence constraints follows Analyze, and is NOT staged before Reduce", () => {
    // The original 4.4 sketch proposed Assumptions → Constraints → Reduce. 1.2 established that
    // any basis reduction discards these inequality nodes, so that order would have put the
    // user's modelling work directly in front of the thing that destroys it. It feeds Analyze —
    // add a condition, then count — so it belongs after.
    expect(at("Univalence constraints")).toBeGreaterThan(at("Analyze"));
    expect(at("Univalence constraints")).toBeGreaterThan(at("Reduce"));
  });

  it("Shape from moments is out of the workflow run", () => {
    expect(at("Shape from moments")).toBeGreaterThan(at("Analyze"));
  });

  it("a labelled divider marks where the main route ends", () => {
    // A bare reorder would satisfy the ordering checks above while leaving the panel looking like
    // one undifferentiated list — 4.4's complaint is about KIND, not just sequence.
    expect(CODE).toMatch(/class="algebra-section-divider">Beyond the main route</);
    const divider = CODE.indexOf("algebra-section-divider");
    const analyze = CODE.indexOf("<summary>Analyze</summary>");
    const univ = CODE.indexOf("<summary>Univalence constraints</summary>");
    expect(divider).toBeGreaterThan(analyze);
    expect(divider).toBeLessThan(univ);
  });

  it("Shape from moments says it does not touch the workspace", () => {
    // doShapeFromMoments calls shapeFromMomentsAsync and renders to #alg-moments-out; it adds no
    // column and leaves the graph alone. Without saying so it reads like another reduction.
    const sec = CODE.slice(CODE.indexOf("<summary>Shape from moments</summary>"),
                           CODE.indexOf("<summary>Export</summary>"));
    expect(sec).toMatch(/does not touch the workspace/);
  });
});

describe("the section comments no longer misnumber the run", () => {
  it("the header comments are contiguous 1..8", () => {
    // They read 1, 3, 4, 4b, 5, 6 — no 2 (an artefact of 4.7 splitting "Assumptions" into three)
    // and a "4b" implying Shape-from-moments was a sub-step of Analyze, which it is not.
    const nums = [...UI.matchAll(/^\s+\/\/ (\d+)[a-z]?\. (?:Assume|Pin values|Edit system|Reduce|Analyze|Univalence|Shape|Export)/gm)]
      .map((m) => Number(m[1]));
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
