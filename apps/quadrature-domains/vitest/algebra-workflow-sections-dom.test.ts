// @vitest-environment jsdom
// Section targeting — the RENDERED half (refactor Phase 2, QD-ALG-3). "The workflow steps point at
// sections that exist" is now checked against the mounted sidebar: the sections render, and every
// WORKFLOW_STEPS.section (the step table exposed on QD_UI) resolves to a real
// details.algebra-section[data-section]. The source-level guards — no positional nth-of-type selector,
// openSection resolves by data-section, the verdict action routes through openSection — stay in the
// node companion algebra-workflow-sections.test.ts (they read function bodies, not the rendered DOM).
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, sectionNames, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

describe("workflow steps point at sections that exist (rendered)", () => {
  it("the sidebar renders its named sections", () => {
    // Guard the guard: if the section shape changes, the cross-check below would pass vacuously.
    const names = sectionNames(m);
    expect(names).toContain("Reduce");
    expect(names.length).toBeGreaterThanOrEqual(8);
  });

  it("every WORKFLOW_STEPS section resolves to a rendered section (by data-section)", () => {
    // A step pointing at a renamed/removed section simply stops opening anything — silent. Here it
    // fails loudly, against the actual data-section keys wireSectionPersistence writes at mount.
    const steps = m.QD_UI.WORKFLOW_STEPS as Array<{ section?: string }>;
    expect(steps.length).toBeGreaterThan(0);
    const rendered = new Set(
      m.$$("#alg-sections details.algebra-section").map((d) => (d as HTMLElement).dataset.section),
    );
    for (const s of steps) {
      if (!s.section) continue;
      expect(rendered, s.section + " is not a rendered section").toContain(s.section);
    }
  });
});
