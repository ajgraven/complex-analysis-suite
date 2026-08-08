import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Structural guard for ADR-0009: σ is a FIRST-CLASS PEER VIEW — its own #schwarz-plot section alongside
// #param-plot and #dyn-plot, holding the σ canvas + its own controls (the φ builder + an exit control),
// NOT an overlay bolted onto the dynamical plane. A regression that re-nested σ under #dyn-plot, or lost
// the peer section, would fail here (the runtime mode-switch is covered by the browser/Playwright checks).
const indexHtml = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

/** The markup of one `<section class="plot" id="…">…</section>` (plot sections don't nest sections here,
 *  so a non-greedy match to the first closing tag is exact). */
function plotSection(id: string): string {
  const m = indexHtml.match(new RegExp(`<section class="plot" id="${id}"[\\s\\S]*?</section>`));
  return m ? m[0] : "";
}

describe("σ is a first-class peer view (ADR-0009) — index.html structure", () => {
  it("has a #schwarz-plot peer .plot section, alongside #param-plot and #dyn-plot", () => {
    for (const id of ["param-plot", "dyn-plot", "schwarz-plot"]) {
      expect(plotSection(id), id).toContain(`id="${id}"`);
    }
  });

  it("the σ canvas, its φ builder, and an exit control live INSIDE #schwarz-plot", () => {
    const sp = plotSection("schwarz-plot");
    expect(sp).toContain('id="JCSSchwarz"'); // the σ raster is this pane's own canvas
    expect(sp).toContain('id="schwarz-builder"'); // the φ builder is the pane's controls section
    expect(sp).toContain('id="schwarz-generate"');
    expect(sp).toContain('id="schwarz-exit"'); // ↩ back to the plots
    expect(sp).toContain('id="dyn-schwarz-label"');
  });

  it("σ is no longer an overlay on the dynamical plane, and the sidebar keeps only the entry button", () => {
    // The refactor moved the σ canvas + builder OUT of #dyn-plot.
    expect(plotSection("dyn-plot")).not.toContain('id="JCSSchwarz"');
    expect(plotSection("dyn-plot")).not.toContain('id="schwarz-builder"');
    // The sidebar retains the entry point that opens the peer view, but not the builder form itself.
    expect(indexHtml).toContain('id="schwarz-open"');
  });
});
