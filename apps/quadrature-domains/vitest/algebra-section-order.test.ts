// @vitest-environment jsdom
// Section order and kind (finding 4.4 — "section order contradicts the stated workflow").
//
// BEHAVIOURAL rewrite — refactor Phase 2 (QD-ALG-3). The prior version read algebra-ui.mjs as TEXT and
// regexed the sidebar HTML *string* (`class="algebra-section">' + '<summary>…`). That pinned the source,
// not the rendered UI, and would break the moment the sidebar is built as data instead of a concatenated
// string (the D1a refactor this phase enables). This mounts installAlgebra (via the shared jsdom harness)
// and asserts the REAL rendered sidebar, so it survives that refactor (same DOM, new construction).
//
// One source-only assertion from the old file is intentionally NOT carried over: "the header comments are
// contiguous 1..8" guarded COMMENT hygiene (a one-time renumbering), not behaviour — and the sections it
// stood in for are now verified directly in the DOM below.
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, sectionNames, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

/** true iff `a` precedes `b` in document order. */
const precedes = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
/** the top-level section <summary> element with this exact text. */
const summaryOf = (name: string): Element => {
  const s = m.$$("#alg-sections details.algebra-section > summary")
    .find((el) => (el.textContent || "").trim() === name);
  if (!s) throw new Error("no section summary named " + JSON.stringify(name));
  return s;
};

describe("the column workflow reads in the order it is performed", () => {
  it("counts sections, not every disclosure in the panel", () => {
    // There ARE nested <details> inside sections (e.g. Advanced), so a summary-count and a
    // section-count must differ — if they coincide, the query has stopped distinguishing them.
    const sections = sectionNames(m);
    const allSummaries = m.$$("#alg-sections summary").map((s) => (s.textContent || "").trim());
    expect(allSummaries.length).toBeGreaterThan(sections.length);
    expect(allSummaries).toContain("Advanced");
    expect(sections).not.toContain("Advanced");
  });

  it("has all eight sections, in DOM order", () => {
    expect(sectionNames(m)).toEqual([
      "Assume", "Pin values", "Edit system", "Reduce", "Analyze",
      "Univalence constraints", "Shape from moments", "Export",
    ]);
  });

  it("the four workflow steps are contiguous and in sequence", () => {
    expect(precedes(summaryOf("Assume"), summaryOf("Pin values"))).toBe(true);
    expect(precedes(summaryOf("Pin values"), summaryOf("Edit system"))).toBe(true);
    expect(precedes(summaryOf("Edit system"), summaryOf("Reduce"))).toBe(true);
    expect(precedes(summaryOf("Reduce"), summaryOf("Analyze"))).toBe(true);
  });

  it("Export is last", () => {
    expect(sectionNames(m).at(-1)).toBe("Export");
  });
});

describe("sections that are not workflow steps sit after it, behind a visible boundary", () => {
  it("Univalence constraints follows Analyze, and is NOT staged before Reduce", () => {
    expect(precedes(summaryOf("Analyze"), summaryOf("Univalence constraints"))).toBe(true);
    expect(precedes(summaryOf("Reduce"), summaryOf("Univalence constraints"))).toBe(true);
  });

  it("Shape from moments is out of the workflow run", () => {
    expect(precedes(summaryOf("Analyze"), summaryOf("Shape from moments"))).toBe(true);
  });

  it("a labelled divider marks where the main route ends, between Analyze and Univalence", () => {
    const divider = m.$("#alg-sections .algebra-section-divider");
    expect(divider, "the section divider renders").toBeTruthy();
    expect(divider!.textContent || "").toMatch(/Beyond the main route/);
    expect(precedes(summaryOf("Analyze"), divider!)).toBe(true);
    expect(precedes(divider!, summaryOf("Univalence constraints"))).toBe(true);
  });

  it("Shape from moments says it does not touch the workspace", () => {
    const shape = m.$$("#alg-sections details.algebra-section")
      .find((d) => (d.querySelector("summary")?.textContent || "").trim() === "Shape from moments");
    expect(shape, "the Shape from moments section renders").toBeTruthy();
    expect(shape!.textContent || "").toMatch(/does not touch the workspace/);
  });
});
