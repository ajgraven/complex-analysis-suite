// @vitest-environment jsdom
//
// T1 — the four PURE honest-labeling helpers lifted from installAlgebra to module scope (exposed on
// QD_UI). classifyRigor is the load-bearing one: it maps a classify/count RESULT to the =/≤/unknown
// rigor level the verdict pill renders, which is the project's central guardrail (a false '=' is the
// worst bug). It was previously reachable only through a full DOM+solver mount, so it was guarded by
// source-regex — which broke silently on the applyFactor→applyFactorAsync rename in #142. These
// behavioural assertions replace that brittleness: they exercise the actual function, so a logic
// change fails loudly and a rename cannot.
import { describe, it, expect, beforeAll } from "vitest";

let classifyRigor: (r: unknown) => string;
let posDimDesc: (r: unknown) => string;
let scopeNote: (sel: unknown) => string;
let droppedNote: (skipped: unknown) => string;

beforeAll(async () => {
  await import("../app/solver.mjs");
  const reg: any = await import("../app/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  classifyRigor = reg.QD_UI.classifyRigor;
  posDimDesc = reg.QD_UI.posDimDesc;
  scopeNote = reg.QD_UI.scopeNote;
  droppedNote = reg.QD_UI.droppedNote;
});

describe("QD_UI.classifyRigor — the =/≤/unknown decider for a classify/count result", () => {
  it("a zero-dimensional system with a real-solution count is a rigorous UPPER BOUND (≤ ⇒ 'bound')", () => {
    // The reim real-solution count bounds #QD from above but need not equal it, so the card must
    // never render '='. This is the single most important row in the table.
    expect(classifyRigor({ ok: true, zeroDim: true, realCount: 4 })).toBe("bound");
    expect(classifyRigor({ ok: true, zeroDim: true, realCount: 0 })).toBe("bound");
  });

  it("an inconsistent system CERTIFIES 'no QD' — the only exact classify verdict", () => {
    // 1 ∈ I ⇒ V(I) = ∅ over ℂ ⇒ certainly no real point: this is a genuine '='(=0), not a bound.
    // inconsistent wins even if the other fields look bound-ish.
    expect(classifyRigor({ ok: true, inconsistent: true })).toBe("exact");
    expect(classifyRigor({ ok: true, inconsistent: true, zeroDim: true, realCount: 3 })).toBe("exact");
  });

  it("a positive-dimensional system is undetermined ('unknown' — no count to bound)", () => {
    expect(classifyRigor({ ok: true, zeroDim: false, realCount: 2 })).toBe("unknown");
  });

  it("a missing real count (over cap / not computed) is 'unknown', never a silent bound", () => {
    expect(classifyRigor({ ok: true, zeroDim: true, realCount: null })).toBe("unknown");
    expect(classifyRigor({ ok: true, zeroDim: true })).toBe("unknown");
  });

  it("a failed or absent result is 'unknown' (defensive default is the ambiguous level, not a claim)", () => {
    expect(classifyRigor({ ok: false })).toBe("unknown");
    expect(classifyRigor(null)).toBe("unknown");
    expect(classifyRigor(undefined)).toBe("unknown");
  });
});

describe("QD_UI.posDimDesc — honest one-line size of a positive-dimensional verdict", () => {
  it("names the true Krull DIMENSION when the result carries one (≥ 1)", () => {
    expect(posDimDesc({ krullDim: 2, numVars: 4 })).toBe("dimension 2, 4 real variables");
    expect(posDimDesc({ krullDim: 1, numVars: 3 })).toBe("dimension 1, 3 real variables");
  });

  it("degrades to the ambient variable count alone when no dimension is carried", () => {
    expect(posDimDesc({ numVars: 4 })).toBe("4 real variables");
    expect(posDimDesc({ krullDim: 0, numVars: 4 })).toBe("4 real variables"); // dim 0 is not positive-dim
  });

  it("shows '?' for the variable count when it is absent rather than inventing a number", () => {
    expect(posDimDesc({})).toBe("? real variables");
    expect(posDimDesc(null)).toBe("? real variables");
  });
});

describe("QD_UI.scopeNote — the scoped-mutating-op toast disclosure", () => {
  it("names the selected-equation count so a mutated 'system' claim travels with its scope", () => {
    expect(scopeNote([{}, {}, {}])).toBe(" · on the 3 selected equations only");
    expect(scopeNote([{}])).toBe(" · on the 1 selected equation only"); // singular
  });

  it("is empty when there is no selection (whole-column scope needs no caveat)", () => {
    expect(scopeNote([])).toBe("");
    expect(scopeNote(null)).toBe("");
  });
});

describe("QD_UI.droppedNote — basis-replacement dropped-node toast wording", () => {
  it("names inequality nodes a basis replacement consumed by omission", () => {
    const note = droppedNote([{ cause: "inequality", label: "|φ'| > 0" }]);
    expect(note).toContain("1 inequality node");
    expect(note).toContain("|φ'| > 0");
    expect(note).toContain("> and ≠ conditions do not carry forward");
    expect(note.startsWith(" · ⚠ dropped ")).toBe(true);
  });

  it("names out-of-scope equations separately from inequalities (different cause)", () => {
    const note = droppedNote([
      { cause: "inequality", label: "ineqA" },
      { cause: "out-of-scope", label: "eqB" },
    ]);
    expect(note).toContain("inequality node");
    expect(note).toContain("outside the selection");
    expect(note).toContain("; and "); // the two halves are joined, not merged
  });

  it("caps names at two and reports the remainder as '+N more'", () => {
    const note = droppedNote([
      { cause: "out-of-scope", label: "a" },
      { cause: "out-of-scope", label: "b" },
      { cause: "out-of-scope", label: "c" },
      { cause: "out-of-scope", label: "d" },
    ]);
    expect(note).toContain("(a; b; +2 more)");
  });

  it("is empty when nothing was dropped", () => {
    expect(droppedNote([])).toBe("");
    expect(droppedNote(null)).toBe("");
  });
});
