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
// slice 2 — the slice/scope caveat helpers + their pure formatter
let latexPlain: (name: string) => string;
let sliceLabels: (r: unknown) => string[];
let sliceCaveat: (r: unknown) => string;
let scopeCaveat: (sel: unknown, curIds: unknown) => string;
// slice 3 — the assumptions ledger (store snapshot injected)
let specializationLedger: (r: unknown, ctx: unknown) => string[];

beforeAll(async () => {
  await import("../app/solvers/solver.mjs");
  const reg: any = await import("../app/ui/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  classifyRigor = reg.QD_UI.classifyRigor;
  posDimDesc = reg.QD_UI.posDimDesc;
  scopeNote = reg.QD_UI.scopeNote;
  droppedNote = reg.QD_UI.droppedNote;
  latexPlain = reg.QD_UI.latexPlain;
  sliceLabels = reg.QD_UI.sliceLabels;
  sliceCaveat = reg.QD_UI.sliceCaveat;
  scopeCaveat = reg.QD_UI.scopeCaveat;
  specializationLedger = reg.QD_UI.specializationLedger;
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

// ── T1 slice 2 — the slice/scope caveat helpers. These are the strings that keep a count computed on a
// specialization (a reality/imaginary slice, or a canvas selection) from reading as the general
// quadrature-domain count. The lower-bound vs upper-bound vs different-system distinction is the whole
// point, so it is exactly what these assertions pin.

describe("QD_UI.latexPlain — the pure conjugate-model var-name formatter", () => {
  it("routes scheme vars through plainVar (bar → combining macron)", () => {
    expect(latexPlain("z1")).toBe("z1");
    expect(latexPlain("zb1")).toBe("z̄1");   // the bar partner renders with the macron, not a stray 'b'
  });
  it("falls back to the ζ-constraint rendering for non-scheme names", () => {
    expect(latexPlain("Z1")).toBe("ζ1");
  });
});

describe("QD_UI.sliceLabels — human labels of the active reality/imaginary slices", () => {
  it("labels a real slice (z̄≡z) with its formatted vars", () => {
    expect(sliceLabels({ realVars: ["z1", "z2"] })).toEqual(["real slice (z̄≡z: z1, z2)"]);
  });
  it("labels an imaginary slice (z̄≡−z), formatting the bar vars", () => {
    expect(sliceLabels({ imagVars: ["zb1"] })).toEqual(["imaginary slice (z̄≡−z: z̄1)"]);
  });
  it("emits BOTH labels when both slices are active", () => {
    expect(sliceLabels({ realVars: ["z1"], imagVars: ["z2"] })).toHaveLength(2);
  });
  it("is empty for the general system (no slice vars)", () => {
    expect(sliceLabels({})).toEqual([]);
    expect(sliceLabels(null)).toEqual([]);
  });
});

describe("QD_UI.sliceCaveat — a slice count is a LOWER BOUND on the general one", () => {
  it("declares the lower-bound direction and names the slice", () => {
    const c = sliceCaveat({ realVars: ["z1"] });
    expect(c.startsWith("  [on the real slice (z̄≡z: z1)")).toBe(true);
    expect(c).toContain("LOWER BOUND");
    expect(c).toContain("rules out only on-slice solutions");
  });
  it("is empty for the general system — no caveat, so no spurious bound label", () => {
    expect(sliceCaveat({})).toBe("");
    expect(sliceCaveat(null)).toBe("");
  });
});

describe("QD_UI.scopeCaveat — a selection count's UPPER-BOUND vs different-system distinction", () => {
  it("a strict subset of the current column is an UPPER BOUND on the full system", () => {
    // Dropping generators enlarges the variety (V(J) ⊇ V(I) for J ⊆ I), so counting fewer equations
    // over-counts the full system — the claim that holds, and the one the old code sometimes withdrew.
    const c = scopeCaveat(["a"], ["a", "b", "c"]);
    expect(c).toContain("UPPER BOUND");
    expect(c).toContain("not the whole current system (3)");
  });

  it("a selection reaching OUTSIDE the current column is a different system, with NO bound claim", () => {
    // 'x' is not in the current column, so the selection is not a subset — the honest statement is that
    // it says nothing directly about the current system, and it must NOT assert an upper bound.
    const c = scopeCaveat(["a", "x"], ["a", "b", "c"]);
    expect(c).toContain("not all part of the current system");
    expect(c).toContain("system of their own");
    expect(c).not.toContain("UPPER BOUND");
  });

  it("the whole column selected ⇒ same scope ⇒ no caveat", () => {
    expect(scopeCaveat(["a", "b", "c"], ["a", "b", "c"])).toBe("");
  });

  it("no selection ⇒ empty (whole-column scope needs no caveat)", () => {
    expect(scopeCaveat([], ["a", "b"])).toBe("");
    expect(scopeCaveat(null, ["a", "b"])).toBe("");
  });

  it("uses the singular 'equation' for a single selected node", () => {
    expect(scopeCaveat(["a"], ["a", "b"])).toContain("selected equation only");
  });
});

// ── T1 slice 3 — the assumptions LEDGER. Every entry is a specialization that narrows the verdict, so
// that no slice/branch/constraint count on the card ever reads as the certified GENERAL count. This is
// the honest-labeling banner in list form; the store reads it needs are injected as a { w0Fixed,
// activeTrack, nodes } snapshot, which is exactly what makes each branch testable here.
describe("QD_UI.specializationLedger — the narrowing-assumptions ledger", () => {
  it("is empty for the general system (no slice, no gauge, no branch, no constraint)", () => {
    // [] is load-bearing: a non-empty ledger is what tells the card its count is NOT the general one.
    expect(specializationLedger({}, {})).toEqual([]);
  });

  it("capitalizes the active slice labels", () => {
    const led = specializationLedger({ realVars: ["z1"] }, {});
    expect(led[0].startsWith("Real slice (z̄≡z: z1)")).toBe(true);
  });

  it("records the φ(0) = w₀ gauge fix when w0Fixed is set", () => {
    const led = specializationLedger({}, { w0Fixed: true });
    expect(led.some((s) => s.startsWith("φ(0) = w₀ fixed"))).toBe(true);
  });

  it("records a factor-case branch that adds UP (a complete decomposition)", () => {
    expect(specializationLedger({ partialBranch: true, caseIndex: 0, caseCount: 3 }, {}))
      .toContain("Factor case 1 of 3 (branches add up)");
  });

  it("flags an INCOMPLETE component branch as a LOWER BOUND (the cap was hit)", () => {
    const led = specializationLedger(
      { partialBranch: true, branchOp: "component", caseIndex: 1, caseCount: 2, branchIncomplete: true }, {});
    expect(led).toContain("Component 2 of 2 (branches add to a LOWER BOUND — the decomposition hit a cap)");
  });

  it("scans the nodes for active univalence constraints and names the forms", () => {
    const led = specializationLedger({}, {
      activeTrack: "t0",
      nodes: [
        { track: "t0", provenance: { op: "constraint", form: "convex" } },
        { track: "t0", provenance: { op: "constraint", form: "star" } },
      ],
    });
    expect(led.some((s) => s.startsWith("Univalence constraints active (convex, star)"))).toBe(true);
  });

  it("only counts constraints on the ACTIVE track", () => {
    const led = specializationLedger({}, {
      activeTrack: "t0",
      nodes: [{ track: "t1", provenance: { op: "constraint", form: "convex" } }],
    });
    expect(led.some((s) => s.includes("Univalence constraint"))).toBe(false);
  });

  it("emits an honest CAVEAT (not silence) if the constraint scan throws", () => {
    // The scan records active constraints so a restricted count never reads as full. If it throws, the
    // ledger must SAY the count may be restricted — swallowing the error is the exact mislabel it prevents.
    const throwingNodes = { filter() { throw new Error("scan failed"); } };
    const led = specializationLedger({}, { activeTrack: "t0", nodes: throwingNodes });
    expect(led.some((s) => s.startsWith("⚠ could not scan for active univalence constraints"))).toBe(true);
  });
});
