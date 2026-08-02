// @vitest-environment jsdom
// Tier 2 honest-labelling — the RENDERED-LABEL half (refactor Phase 2, QD-ALG-3). The button labels
// that overstated their scope are now asserted against the mounted sidebar, so they survive the D1a
// sidebar-as-data refactor (same DOM, new construction). The source-structural half — the
// sidebar-button-passes-no-selection wiring, the export guard-clause ordering, the ui-strings tooltip
// records, the canvas 2-node cap, the fix-φ(0) confirmReplace flow — stays in the node-env companion
// algebra-honest-labels.test.ts (function bodies and ui-strings DATA a rendered snapshot cannot see).
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

describe("2.1 — the Gröbner button names the scope it actually uses", () => {
  it("the label says current column, not 'all eqns'", () => {
    // doGroebner(null) falls back to store.currentColumnIds() — the LAST column's equalities. "all
    // eqns" invited the reading that earlier columns were included.
    expect((m.$("#alg-groebner")!.textContent || "").trim()).toBe("Gröbner basis (current column)");
    expect(m.container.textContent || "", "no control still says 'all eqns'").not.toMatch(/all eqns/);
  });
});

describe("2.2 / 2.3 — Copy LaTeX states it takes every branch and column", () => {
  it("the button is labelled 'Copy all LaTeX'", () => {
    // copyLatex walks store.list() — all columns, all branches — while sitting next to "Copy
    // derivation (LaTeX)", which is the active branch. The pair read as scoped and was not.
    expect((m.$("#alg-copy-latex")!.textContent || "").trim()).toBe("Copy all LaTeX");
  });
});
