// @vitest-environment jsdom
//
// PROV_UI — the UI-side provenance-op registry (companion to the store's PROV_OPS). The three
// UI label functions (provText/columnLabel/edgeLabel) are private to installAlgebra and had NO
// test coverage; this lifts their per-op logic into a table exposed as QD_UI.PROV_UI and guards
// it two ways: COVERAGE (every op in the provenance contract has a record) + GOLDEN labels
// (behavior-preserving — the expressions were copied verbatim). The UI helpers are injected via
// ctx, so we test with DETERMINISTIC mocks (independent of the real latexPlain regex / valStr
// rounding) — verifying the interpolation STRUCTURE the refactor moved.
import { describe, it, expect, beforeAll } from "vitest";

let PU: any;
beforeAll(async () => {
  await import("../app/solvers/solver.mjs");             // installs the QD namespace
  const reg: any = await import("../app/ui/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs"); // IIFE side-effect: QD_UI.PROV_UI = PROV_UI
  PU = reg.QD_UI.PROV_UI;
});

describe("PROV_UI provenance-op registry (UI side)", () => {
  const ctx: any = {
    latexPlain: (v: string) => "L<" + v + ">",
    valStr: (rec: any) => "V<" + (rec && rec.approx ? rec.approx.re : "?") + ">",
    substList: (p: any) => (p.variables || []).map((r: any) => "L<" + r.name + ">=Vx").join(", "),
    ratioStrRec: (rec: any, sign: number) => (rec ? "R·" : (sign != null && sign < 0 ? "−" : "")),
    ns: [], c: 3,
  };
  // The provenance contract the UI labels (matches the store header's op list; 'resolvent' has
  // no custom UI label — it renders via the default — so it is intentionally not listed here).
  const CONTRACT = ["generate", "fork", "conjugate", "resultant", "groebner", "constraint",
    "duplicate", "substitute", "linear-reduce", "assume-real", "assume-imaginary", "identify",
    "identify-conj", "fix-w0", "define-subst", "add-equation", "triangular", "factor", "component", "rctd", "propagate"];

  const text = (op: string, p: any) => { const d = PU[op]; return d && d.text ? d.text({ op, ...p }, ctx) : op; };
  const col = (op: string, p: any, extra: any = {}) => { const d = PU[op]; return d && d.column ? d.column({ op, ...p }, { ...ctx, ...extra }) : "↳ column " + ctx.c; };
  const edge = (op: string, p: any) => { const d = PU[op]; return d && d.edge ? d.edge({ op, ...p }, ctx) : (op || null); };

  it("is exposed on QD_UI", () => { expect(PU && typeof PU === "object").toBe(true); });

  it("every contract op has a record (a bare-label fallthrough is a loud failure)", () => {
    expect(CONTRACT.filter((op) => !(op in PU))).toEqual([]);
  });

  it("text() labels are behavior-preserving (golden)", () => {
    expect(text("generate", { block: "locator" })).toBe("generated (locator block)");
    expect(text("fork", { fromTrack: "t0", fromColumn: 2 })).toBe("forked from t0 · column 2");
    expect(text("conjugate", { inputs: ["n1", "n2"] })).toBe("conjugate companion of n1, n2");
    expect(text("constraint", { form: "star" })).toBe("univalence constraint (star)");
    expect(text("resultant", { variable: "z1", inputs: ["n1"] })).toBe("eliminated L<z1> from n1");
    expect(text("groebner", { eliminate: ["z1"], inputs: ["n1"] })).toBe("Gröbner basis (elim L<z1>) of n1");
    expect(text("groebner", { order: "lex", inputs: ["n1"] })).toBe("Gröbner basis (lex) of n1");
    expect(text("substitute", { variables: [{ name: "A1_1" }] })).toBe("set L<A1_1>=Vx");
    expect(text("assume-real", { vars: ["z1", "a1"] })).toBe("assumed L<z1>, L<a1> real");
    expect(text("identify", { drop: "A1_2", keep: "A1_1", ratio: { re: [1, 1] } })).toBe("identified L<A1_2> = R·L<A1_1>");
    expect(text("identify-conj", { var: "A1_2", other: "A1_1", ratio: { re: [1, 1] } })).toBe("identified L<A1_2> = R·conj(L<A1_1>)");
    expect(text("fix-w0", { value: { approx: { re: 1.5 } } })).toBe("fixed φ(0) = V<1.5>");
    expect(text("factor", { caseIndex: 0, caseCount: 2 })).toBe("factor: case 1 of 2 (V(p)=⋃V(fᵢ))");
    expect(text("propagate", { from: 1 })).toBe("propagated from column 1");
  });

  it("column() labels are behavior-preserving (golden)", () => {
    expect(col("resultant", { variable: "z1" })).toBe("↳ eliminate L<z1>");
    expect(col("assume-real", { vars: ["z1"] })).toBe("↳ assume real · L<z1>");
    expect(col("groebner", { eliminate: ["z1"] })).toBe("↳ Gröbner · elim L<z1>");
    expect(col("fix-w0", { value: { approx: { re: 1.5 } } })).toBe("↳ fix φ(0) = V<1.5>");
    expect(col("factor", { caseIndex: 0, caseCount: 2 }, { ns: [] })).toBe("↳ factor · case 1/2");
    expect(col("rctd", {}, { ns: [] })).toBe("↳ RCTD · 0 parameter cells");
    // an op with no column record falls back to '↳ column ' + c
    expect(col("conjugate", {})).toBe("↳ column 3");
  });

  // fork.column exists specifically so a forked branch's lane is NOT labeled "Original system".
  // forkTrack writes the copied nodes at column 0, so columnLabel's `c === 0` case would otherwise
  // claim a five-reductions-deep branch is the starting point — beside the assumptions it inherited.
  it("fork gets a column label naming its parent (never 'Original system')", () => {
    const s = col("fork", { fromTrack: "t0", fromColumn: 5 }, { trackLabelOf: (t: string) => "T<" + t + ">" });
    expect(s).toBe("↳ forked from T<t0> · column 5");
    expect(s).not.toMatch(/original/i);
  });
  it("fork.column degrades to the raw track id when ctx has no trackLabelOf", () => {
    expect(col("fork", { fromTrack: "t2", fromColumn: 1 })).toBe("↳ forked from t2 · column 1");
  });

  // A component column is ONE BRANCH of V(I)=⋃ₖV(componentₖ). The lane has to say so — and has to
  // say when the decomposition was capped, because then the branches may not even cover V(I).
  describe("component (a variety split, one level up from a factor split)", () => {
    const P = { caseIndex: 1, caseCount: 3 };
    it("names the case in both the node text and the lane label", () => {
      expect(text("component", P)).toMatch(/component 2 of 3/);
      expect(col("component", P, { ns: [] })).toBe("↳ component 2/3");
    });
    it("marks a CAPPED decomposition in both places", () => {
      expect(text("component", { ...P, complete: false })).toMatch(/capped|may not cover/i);
      expect(col("component", { ...P, complete: false }, { ns: [] })).toMatch(/capped/i);
    });
    it("says nothing about capping when the decomposition completed", () => {
      expect(text("component", { ...P, complete: true })).not.toMatch(/capped/i);
      expect(col("component", { ...P, complete: true }, { ns: [] })).not.toMatch(/capped/i);
    });
    it("distinguishes a regular-chain split from a minimal-primes one", () => {
      expect(col("component", { ...P, method: "regularChains" }, { ns: [] })).toMatch(/regular chain/);
      expect(col("component", { ...P, method: "minimalPrimes" }, { ns: [] })).not.toMatch(/regular chain/);
    });
    it("a carried side condition is not labeled as the split itself", () => {
      expect(text("component", { ...P, carried: true })).toMatch(/carried/i);
      expect(text("component", { ...P, carried: true })).not.toMatch(/component 2 of 3/);
    });
  });

  it("edge() labels are behavior-preserving (golden)", () => {
    expect(edge("conjugate", {})).toBe("conj");
    expect(edge("fork", {})).toBe("fork");
    expect(edge("resultant", { variable: "z1" })).toBe("elim L<z1>");
    expect(edge("groebner", { eliminate: ["z1"] })).toBe("Gröbner · elim L<z1>");
    expect(edge("substitute", { variables: [{ name: "A1_1" }] })).toBe("set L<A1_1>");
    expect(edge("fix-w0", {})).toBe("fix φ(0)");
    expect(edge("factor", { carried: true })).toBe("carry");
    // an op with no edge record falls back to op
    expect(edge("generate", {})).toBe("generate");
  });
});
