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

// ── The census that PRODUCES those rows at runtime ─────────────────────────────────────────────
// The block above tests `variableRemovals` against hand-built fixtures — the pure routing table.
// `variableCensus`, the function that computes those rows from a live store, had no test, and that
// is how a real bug shipped: it called the RAW `QC.conjVarName`, which cannot know symbols
// introduced by "Define substitution". For a defined symbol `t` with a genuine conjugate `t̄`, the
// store registers the pair (in `substConj`) but the raw table returns `t̄` unchanged — so the census
// computed `conjOf: null` for `t̄` and its lens row silently dropped the "Assume t real" and "one
// pin removes both" routes. The fix routes the census through `store.conjNameOf` (overlay-aware).
describe("variableCensus finds a defined symbol's conjugate partner", () => {
  let census: any, remove: any, Store: any, S: any, QC: any;
  beforeAll(async () => {
    const _QD: any = (await import("../app/solver.mjs")).default;
    await import("../app/sym-core.mjs");
    await import("../app/qd-constraints.mjs");
    await import("../app/algebra/algebra-store.mjs");
    const reg: any = await import("../app/ui-registry.mjs");
    await import("../app/algebra/algebra-ui.mjs");
    census = reg.QD_UI.variableCensus;
    remove = reg.QD_UI.variableRemovals;
    Store = _QD.AlgebraStore; S = _QD.Sym; QC = _QD.QDConstraints;
  });

  // A store whose system contains z1² and z̄1², then abbreviates t := z1². Because z1² is NOT
  // self-conjugate, the store registers the barred partner tb (= z̄1²) in its overlay.
  // A store holding z1² − z̄1² = 0, so its current column contains z1 and z̄1 (the built-in pair).
  function seeded() {
    const st = Store.create();
    const z1 = S.mpolyVar("z1"), zb1 = S.mpolyVar("zb1");
    st.seedFromPolys({ polys: [z1.mul(z1).sub(zb1.mul(zb1))], vars: ["z1", "zb1"], model: "conjugate" });
    return { st, z1, zb1 };
  }
  // …then abbreviate t := z1². Because z1² is NOT self-conjugate the store registers the barred
  // partner tb (= z̄1²) in its overlay, AND substitutes both, so the current column becomes t − tb.
  function withDefinedSymbol() {
    const { st, z1 } = seeded();
    const d = st.defineSubstitution("t", z1.mul(z1));
    expect(d.ok, "defineSubstitution should register the pair: " + (d.reason || "")).not.toBe(false);
    return st;
  }

  it("the store knows the pair the raw table does not — this is the bug in one line", () => {
    const st = withDefinedSymbol();
    expect(st.conjNameOf("t")).toBe("tb");          // overlay-aware: knows the defined pair
    expect(st.conjNameOf("tb")).toBe("t");
    expect(QC.conjVarName("t")).toBe("t");          // raw table (what the census used to call): blind
  });

  it("the barred symbol's row offers 'Assume t real'", () => {
    const rows = census(withDefinedSymbol());
    const tb = rows.find((r: any) => r.name === "tb");
    expect(tb, "tb should be in the census").toBeTruthy();
    expect(tb.conjOf).toBe("t");
    const assume = remove(tb).find((o: any) => o.key === "assume-real");
    expect(assume, "the fix: the assume-real route must appear").toBeTruthy();
    expect(assume.label).toBe("Assume t real");
  });

  it("the primal symbol's pin route says one pin removes both", () => {
    const rows = census(withDefinedSymbol());
    const t = rows.find((r: any) => r.name === "t");
    expect(t.conjName).toBe("tb");
    expect(remove(t).find((o: any) => o.key === "pin").note).toContain("also fixes tb");
  });

  it("the built-in z/z̄ pair still resolves — the common case is not regressed", () => {
    // The whole point of overlay-awareness is to ADD the defined-symbol case without losing the
    // conjugate scheme the raw table already handled. Checked on the seeded store (no substitution),
    // whose current column still holds z1 and z̄1 — the define above substitutes them away.
    // Asserting only that the pair RESOLVES; whether assume-real is offered depends on reality
    // state (this toy z1²=z̄1² system pins z1 real), which is incidental to the regression concern.
    const rows = census(seeded().st);
    const zb1 = rows.find((r: any) => r.name === "zb1");
    const z1 = rows.find((r: any) => r.name === "z1");
    expect(zb1, "z̄1 should be in the seeded census").toBeTruthy();
    expect(zb1.conjOf).toBe("z1");        // barred → primal, via the fallback path of conjNameOf
    expect(z1.conjName).toBe("zb1");      // primal → barred, the pin-both direction
  });

  it("a self-conjugate symbol is NOT offered a self-referential route", () => {
    // conjNameOf returns a self-conjugate name unchanged; the `c !== name` guard must still hold on
    // real census output, not only on the hand-built fixtures above.
    const rows = census(withDefinedSymbol());
    for (const r of rows) {
      if (r.conjOf) expect(r.conjOf, r.name + " is its own partner").not.toBe(r.name);
      const offers = remove(r);
      const self = offers.find((o: any) => o.key === "assume-real" && o.note.includes(r.name + " ≡ " + r.name));
      expect(self, r.name + " offered 'identifies " + r.name + " ≡ " + r.name + "'").toBeFalsy();
    }
  });
});
