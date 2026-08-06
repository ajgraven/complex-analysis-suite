// @vitest-environment jsdom
//
// Q1 — the multi-domain stepper's selector (QD_UI.selectDomain). A ✦ Prove verdict counts N genuine QDs
// and the engine returns every map, but the plot + boundary-curve + QD-plot actions used to be hard-wired
// to index 0 — so a certified COUNT could be plotted / exported / verified for only ONE of the N it claims.
// selectDomain picks the k-th, WRAPPING so ◀/▶ cycle, from distinctPhis for the distinct-map kinds and
// from genuine for the reconstruction kinds. This pins that pure selection (the DOM stepper wires to it).
import { describe, it, expect, beforeAll } from "vitest";

let selectDomain: (pr: unknown, k: number) => { N: number; index: number; domain: unknown };
beforeAll(async () => {
  await import("../app/solvers/solver.mjs");
  const reg: any = await import("../app/ui/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  selectDomain = reg.QD_UI.selectDomain;
});

describe("QD_UI.selectDomain — the ◀ k/N ▶ stepper selector", () => {
  const distinctPr = { kind: "zero-dim", distinctPhis: ["φ0", "φ1", "φ2"], genuine: [{ w: "gA" }] };
  const momentPr = { kind: "moment", genuine: [{ w: "m0" }, { w: "m1" }], distinctPhis: [] };

  it("a distinct-map kind (zero-dim / tree) selects from distinctPhis", () => {
    expect(selectDomain(distinctPr, 0)).toEqual({ N: 3, index: 0, domain: "φ0" });
    expect(selectDomain(distinctPr, 2)).toEqual({ N: 3, index: 2, domain: "φ2" });
  });

  it("a reconstruction kind (moment / rational / triangle) selects from genuine, NOT distinctPhis", () => {
    expect(selectDomain(momentPr, 1)).toEqual({ N: 2, index: 1, domain: { w: "m1" } });
  });

  it("wraps so ◀ from 0 lands on the last and ▶ past the end lands on 0", () => {
    expect(selectDomain(distinctPr, -1).index).toBe(2);   // ◀ from 0
    expect(selectDomain(distinctPr, 3).index).toBe(0);    // ▶ past the end
    expect(selectDomain(distinctPr, 5).index).toBe(2);    // 5 mod 3
  });

  it("no domains ⇒ { N: 0, index: 0, domain: null } (the stepper is not shown)", () => {
    expect(selectDomain({ kind: "zero-dim", distinctPhis: [] }, 0)).toEqual({ N: 0, index: 0, domain: null });
    expect(selectDomain({ kind: "moment" }, 0)).toEqual({ N: 0, index: 0, domain: null });
    expect(selectDomain(null, 0)).toEqual({ N: 0, index: 0, domain: null });
  });
});
