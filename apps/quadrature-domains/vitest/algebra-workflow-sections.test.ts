// Section targeting — the source-level half of the workflow-strip work.
//
// Node environment (no jsdom): jsdom rewrites import.meta.url to http:, which makes fileURLToPath
// throw, so anything reading a source file has to live here. Its behavioural companion is
// algebra-workflow-steps.test.ts. Same split as algebra-shortcuts-focus / algebra-shortcuts-table.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UI = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
// Comments blanked (offsets preserved) for checks that forbid a pattern: openSection's own comment
// quotes the broken `:nth-of-type(2)` selector to explain what it replaced, and prose about a
// defect must not count as the defect.
const CODE = UI
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

/** Section identity is the <summary> text — wireSectionPersistence keys data-section off it. */
const SUMMARIES = [...UI.matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) => m[1]);
/** The `section:` field of each WORKFLOW_STEPS entry, source-read so the two files agree. */
const STEP_SECTIONS = [...UI.matchAll(/section:\s*'([^']+)'/g)].map((m) => m[1]);

describe("workflow steps point at sections that exist", () => {
  it("finds the sidebar's sections", () => {
    // Guard the guard: if the <summary> shape changes, the checks below would pass vacuously.
    expect(SUMMARIES).toContain("Reduce");
    expect(SUMMARIES.length).toBeGreaterThanOrEqual(8);
  });

  it("every named step section exists", () => {
    // Silent failure otherwise: a step pointing at a renamed section simply stops opening anything.
    expect(STEP_SECTIONS.length).toBeGreaterThan(0);
    for (const s of STEP_SECTIONS) expect(SUMMARIES, s + " is not a section").toContain(s);
  });
});

describe("sections are reached by name, never by position", () => {
  it("no caller uses nth-of-type on a workflow section", () => {
    // The bug this replaces. `details.algebra-section:nth-of-type(2)` meant "Reduce" when written,
    // because Assumptions was then a single section. Splitting it into Assume / Pin values / Edit
    // system pushed Reduce from 2nd to 4th, and the selector went on silently opening whichever
    // section now sat at index 2 ("Pin values") while running a decomposition whose controls live
    // in Reduce. Nothing threw; the wrong panel just unfolded. Confirmed in-browser before the fix.
    expect(CODE).not.toMatch(/algebra-section:nth-of-type/);
    // …and the explanation of it survives in the source, so the next reader knows why.
    expect(UI).toMatch(/algebra-section:nth-of-type/);
  });

  it("openSection resolves by data-section", () => {
    const body = UI.slice(UI.indexOf("function openSection("), UI.indexOf("function rerender("));
    expect(body).toMatch(/data-section="/);
    expect(body).toMatch(/d\.open = true/);
  });

  it("the verdict action that opens Reduce goes through openSection", () => {
    // This call site is the one that was broken; pin it to the helper so it cannot regress to a
    // hand-rolled query.
    expect(UI).toMatch(/openSection\('Reduce'\);\s*doDecompose\('components'\)/);
  });
});
