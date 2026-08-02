// @vitest-environment jsdom
// The "Eliminate variables" sub-section of Reduce — BEHAVIOURAL half (refactor Phase 2, QD-ALG-3).
//
// The DOM-structure assertions (picker placement, caption grouping, control wiring, tooltip source,
// caption text) now query the RENDERED sidebar via the mount harness, so they survive the D1a
// sidebar-as-data refactor (same DOM, new construction) instead of breaking on the HTML string. The
// source-structural half — doGroebner/elimSel/doEliminateVars function bodies, the click wiring, and
// the ~120-char ui-strings rule — stays in the node-env companion algebra-eliminate-section.test.ts:
// those guard function wiring and ui-strings DATA, not the sidebar markup (same split convention as
// workflow-sections/workflow-steps).
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

/** true iff `a` precedes `b` in document order. */
const precedes = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
/** the most specific element whose trimmed text starts with `s` (the caption/heading itself). */
const byTextStart = (s: string): Element => {
  const els = m.$$("#alg-sections *").filter((el) => (el.textContent || "").trim().startsWith(s));
  els.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
  if (!els[0]) throw new Error("no element with text starting " + JSON.stringify(s));
  return els[0];
};
const byId = (id: string): Element => {
  const el = m.$("#" + id);
  if (!el) throw new Error("no #" + id + " in the rendered sidebar");
  return el;
};

describe("the eliminate picker is reachable", () => {
  it("is mounted exactly once", () => {
    expect(m.$$("#alg-elim-pick").length).toBe(1);
  });

  it("is not inside the Advanced disclosure", () => {
    expect(m.$(".algebra-advanced"), "an Advanced disclosure exists").toBeTruthy();
    expect(byId("alg-elim-pick").closest(".algebra-advanced")).toBeNull();
  });

  it("sits under an Eliminate variables heading, above the buttons that use it", () => {
    const heading = byTextStart("Eliminate variables");
    expect(precedes(heading, byId("alg-elim-pick"))).toBe(true);
    expect(precedes(byId("alg-elim-pick"), byId("alg-eliminate-vars"))).toBe(true);
  });
});

describe("the group captions describe what the buttons do to the solution set", () => {
  it("the 'same solutions' caption covers only the solution-preserving ops", () => {
    const rewrite = byTextStart("Rewrite the system");
    const narrow = byTextStart("Narrow the system");
    const underSameSolutions = (id: string) =>
      precedes(rewrite, byId(id)) && precedes(byId(id), narrow);
    expect(underSameSolutions("alg-groebner")).toBe(true);
    expect(underSameSolutions("alg-triangular")).toBe(true);
    for (const id of ["alg-saturate", "alg-pin-data", "alg-propagate-all"]) {
      expect(underSameSolutions(id), id + " must not sit under a same-solutions caption").toBe(false);
    }
  });

  it("the ops that change the solution set sit under 'Narrow the system' and say so", () => {
    const narrow = byTextStart("Narrow the system");
    for (const id of ["alg-saturate", "alg-pin-data", "alg-propagate-all"]) {
      expect(precedes(narrow, byId(id)), id + " sits under Narrow").toBe(true);
    }
    expect(narrow.textContent || "").toMatch(/deliberately changes what solves it/);
  });
});

describe("the new control is wired and documented like its neighbours", () => {
  it("carries the js-busy-lock marker (disabled while a worker op runs)", () => {
    const btn = byId("alg-eliminate-vars");
    expect(btn.classList.contains("js-busy-lock") || !!btn.closest(".js-busy-lock")).toBe(true);
  });

  it("takes its tooltip from ui-strings — the rendered title IS the ui-strings value, not a hardcoded literal", () => {
    // The markup carries `data-str-title="tooltips.eliminateVars"`; QD.Strings.apply() materializes
    // that hook into the real `title` at mount. Asserting the rendered title equals the ui-strings
    // value is stronger than the old "no literal title= in the markup": it also catches a wired hook
    // that resolves to the wrong (or an empty) string.
    const btn = byId("alg-eliminate-vars");
    expect(btn.getAttribute("data-str-title")).toBe("tooltips.eliminateVars");
    const fromStrings = m.QD.Strings && m.QD.Strings.tooltips && m.QD.Strings.tooltips.eliminateVars;
    expect(fromStrings, "ui-strings has tooltips.eliminateVars").toBeTruthy();
    expect(btn.getAttribute("title")).toBe(fromStrings);
  });

  it("carries its substance in a reachable caption (elimination ideal + Sylvester resultant)", () => {
    const hint = m.$(".algebra-elim-hint");
    expect(hint, "the elim-hint caption renders").toBeTruthy();
    expect(hint!.textContent || "").toMatch(/elimination ideal/);
    expect(hint!.textContent || "").toMatch(/Sylvester resultant/);
  });
});
