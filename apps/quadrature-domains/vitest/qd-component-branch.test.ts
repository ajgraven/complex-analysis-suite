// @vitest-environment jsdom
//
// Entering a component is a CASE SPLIT: V(I) = ⋃ₖ V(componentₖ), so a count taken on one component
// is that branch's count, not the system's. The store already had this honesty for factor splits
// (`partialBranch` via _factorBranchInfo); a component split must inherit it, or decomposing an
// underdetermined system would silently turn "one branch of a union" into "the answer".
//
// The component case also carries a hazard the factor case does not: if the decomposition itself
// hit a cost cap, the components may not even COVER V(I), so the branches can sum to LESS than the
// total. That is `branchIncomplete`, and losing it would convert a lower bound into a total.
import { describe, it, expect, beforeAll } from "vitest";
import _QD from "../app/solver.mjs";

let Store: any, S: any;
beforeAll(async () => {
  await import("../app/sym-core.mjs");
  await import("../app/algebra/algebra-store.mjs");
  S = (_QD as any).Sym;
  Store = (_QD as any).AlgebraStore;
});

// A store holding V(xy) — the two axes — with the x-axis component ready to enter.
function seeded() {
  const st = Store.create();
  const r = st.addEquation("x*y");
  return { st, ok: !!(r && r.ok !== false) };
}
const xComponent = () => [S.MPoly.variable("x").termList()];

describe("applyComponent — entering one branch of V(I) = ⋃ₖ V(componentₖ)", () => {
  it("appends a new column carrying the component's generators", () => {
    const { st, ok } = seeded(); if (!ok) return;
    const before = st.maxColumn();
    const r = st.applyComponent(xComponent(), 0, 2, { complete: true });
    expect(r.ok).toBe(true);
    expect(r.column).toBe(before + 1);
    expect(r.created.length).toBeGreaterThanOrEqual(1);
    expect(r.caseIndex).toBe(0);
    expect(r.caseCount).toBe(2);
  });

  it("is undoable — the escape hatch must be reversible", () => {
    const { st, ok } = seeded(); if (!ok) return;
    const before = st.maxColumn();
    st.applyComponent(xComponent(), 0, 2, { complete: true });
    expect(st.maxColumn()).toBe(before + 1);
    expect(st.undo()).toBe(true);
    expect(st.maxColumn()).toBe(before);
  });

  it("refuses an empty component instead of silently emptying the system", () => {
    const { st, ok } = seeded(); if (!ok) return;
    const r = st.applyComponent([], 0, 2, { complete: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/whole space|nothing/i);
  });

  it("stamps every generator with component provenance", () => {
    const { st, ok } = seeded(); if (!ok) return;
    const r = st.applyComponent(xComponent(), 1, 3, { complete: true });
    for (const n of r.created) {
      expect(n.provenance.op).toBe("component");
      expect(n.provenance.caseIndex).toBe(1);
      expect(n.provenance.caseCount).toBe(3);
    }
  });
});

describe("the branch caveat propagates to the verdict", () => {
  it("a component column reports partialBranch, tagged as a component (not a factor)", () => {
    const { st, ok } = seeded(); if (!ok) return;
    st.applyComponent(xComponent(), 0, 2, { complete: true });
    const cl = st.classify();
    expect(cl.partialBranch).toBe(true);
    expect(cl.branchOp).toBe("component");
    expect(cl.caseIndex).toBe(0);
    expect(cl.caseCount).toBe(2);
  });

  // The distinction that matters most: a COMPLETE decomposition's branches add to the total; a
  // capped one's add to a lower bound. Only the latter sets branchIncomplete.
  it("a COMPLETE decomposition does not claim incompleteness", () => {
    const { st, ok } = seeded(); if (!ok) return;
    st.applyComponent(xComponent(), 0, 2, { complete: true });
    expect(st.classify().branchIncomplete).toBeFalsy();
  });

  it("a CAPPED decomposition marks the branch counts as a lower bound", () => {
    const { st, ok } = seeded(); if (!ok) return;
    st.applyComponent(xComponent(), 0, 2, { complete: false });
    const cl = st.classify();
    expect(cl.partialBranch).toBe(true);
    expect(cl.branchIncomplete).toBe(true);
  });

  it("an ordinary column claims no branch at all", () => {
    const { st, ok } = seeded(); if (!ok) return;
    const cl = st.classify();
    expect(cl.partialBranch).toBeFalsy();
    expect(cl.branchIncomplete).toBeFalsy();
  });
});
