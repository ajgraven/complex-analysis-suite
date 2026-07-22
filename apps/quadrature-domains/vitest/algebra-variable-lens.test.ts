// @vitest-environment jsdom
//
// The elimination lens (Tier 4, slice 1). Thirteen operations remove a variable, spread across
// Assume / Pin values / Edit system / Reduce / Analyze / the node inspector / a header checkbox.
// The lens asks from the variable's end instead: pick one, be told which acts apply and where.
//
// variableRemovals is pure and exposed on QD_UI (the PROV_UI pattern), so the routing table is
// tested behaviourally. The single most important property is the conjugate asymmetry — see below.
import { describe, it, expect, beforeAll } from "vitest";

let removals: any;
beforeAll(async () => {
  await import("../app/solver.mjs");
  const reg: any = await import("../app/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  removals = reg.QD_UI.variableRemovals;
});

/** A plain non-conjugate variable appearing in 3 equations. */
const PLAIN = {
  name: "A1_1", uses: 3, total: 6, isBase: true, conjName: null, conjOf: null,
  isReal: false, isImag: false, isPinned: false, inGauge: false, isW0: false,
};
const v = (over: any) => Object.assign({}, PLAIN, over);
const keys = (x: any) => removals(x).map((r: any) => r.key);
const byKey = (x: any, k: string) => removals(x).find((r: any) => r.key === k);

describe("assuming real removes the CONJUGATE, and the lens says whose", () => {
  it("for a conjugate variable, the offer names its primal partner", () => {
    // This is the reason the lens is worth building rather than documenting. Identifying v̄ ≡ v
    // drops v̄ and keeps v — so the honest answer to "how do I remove z̄₁" is "assume z₁ real",
    // which names a DIFFERENT variable than the one asked about. A row reading just "Assume real"
    // would send the user to the wrong variable.
    const zb = v({ name: "zb1", isBase: false, conjOf: "z1" });
    const r = byKey(zb, "assume-real");
    expect(r).toBeTruthy();
    expect(r.label).toBe("Assume z1 real");
    expect(r.note).toContain("zb1 ≡ z1");
    expect(r.where).toBe("Assume");
  });

  it("for a base variable, the offer says it removes the conjugate, not itself", () => {
    // The mirror error: offering bare "Assume real" on z₁ implies z₁ goes away. It does not.
    const z = v({ name: "z1", isBase: true, conjName: "zb1" });
    const r = byKey(z, "assume-real-partner");
    expect(r).toBeTruthy();
    expect(r.note).toContain("removes zb1");
    expect(r.note).toContain("z1 itself stays");
  });

  it("a variable already assumed real gets neither offer", () => {
    expect(keys(v({ name: "zb1", isBase: false, conjOf: "z1", isReal: true }))).not.toContain("assume-real");
    expect(keys(v({ name: "z1", conjName: "zb1", isReal: true }))).not.toContain("assume-real-partner");
    // …and the same for imaginary, which is the other identification.
    expect(keys(v({ name: "zb1", isBase: false, conjOf: "z1", isImag: true }))).not.toContain("assume-real");
  });
});

describe("pinning is the mirror case — one pin removes two", () => {
  it("says so when the variable has a conjugate", () => {
    // substituteValues fixes a value AND its conjugate. A row that did not say so would understate
    // what the act does by exactly one variable.
    expect(byKey(v({ name: "z1", conjName: "zb1" }), "pin").note).toContain("also fixes zb1");
  });

  it("does not claim a partner when there is none", () => {
    expect(byKey(PLAIN, "pin").note).not.toContain("also fixes");
  });

  it("is not offered for an already-pinned variable", () => {
    expect(keys(v({ isPinned: true }))).not.toContain("pin");
  });
});

describe("the state-dependent offers appear only when they apply", () => {
  it("gauge elimination only when the gauge equation shares the variable", () => {
    expect(keys(v({ inGauge: true }))).toContain("gauge");
    expect(keys(v({ inGauge: false }))).not.toContain("gauge");
  });

  it("the resultant only when at least two equations hold it, and it names the count", () => {
    // The Sylvester resultant is a two-node act; with one occurrence there is no pair to take.
    expect(keys(v({ uses: 1 }))).not.toContain("resultant");
    expect(byKey(v({ uses: 4 }), "resultant").note).toContain("4 equations");
  });

  it("fix φ(0) only for w₀", () => {
    expect(keys(v({ name: "w0", isW0: true }))).toContain("fix-w0");
    expect(keys(PLAIN)).not.toContain("fix-w0");
  });

  it("eliminate is always available for a live variable", () => {
    expect(keys(PLAIN)).toContain("eliminate");
    expect(keys(v({ isPinned: true, isReal: true, uses: 1 }))).toContain("eliminate");
  });
});

describe("every offer routes somewhere real", () => {
  it("`where` is a sidebar section name or explicitly null", () => {
    // openSection resolves by section name; a typo would silently open nothing. null marks the
    // acts that genuinely do not live in a section (the header checkbox, the canvas selection).
    const SECTIONS = ["Assume", "Pin values", "Edit system", "Reduce", "Analyze",
                      "Univalence constraints", "Shape from moments", "Export"];
    const every = [PLAIN, v({ name: "zb1", isBase: false, conjOf: "z1" }), v({ name: "z1", conjName: "zb1" }),
                   v({ inGauge: true }), v({ uses: 5 }), v({ name: "w0", isW0: true })];
    for (const x of every) {
      for (const r of removals(x)) {
        if (r.where === null) continue;
        expect(SECTIONS, r.key + " routes to a section that does not exist").toContain(r.where);
      }
    }
  });

  it("the acts that are not in a section say where they are instead", () => {
    expect(byKey(v({ name: "w0", isW0: true }), "fix-w0").note).toContain("header");
    expect(byKey(v({ uses: 3 }), "resultant").note).toContain("canvas");
  });

  it("every offer carries a note explaining what it does", () => {
    for (const r of removals(v({ name: "zb1", isBase: false, conjOf: "z1", inGauge: true, uses: 3 }))) {
      expect(r.note, r.key + " has no note").toBeTruthy();
    }
  });
});
