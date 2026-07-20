// What a reduction actually DID to a column (P6c).
//
// A lane header read "17 eqns · 6 vars", which answers how big the system is and not what the
// step changed. Between two columns those are different questions: a Gröbner step can leave the
// equation count identical while replacing every generator, and a propagate step can add three
// equations while touching nothing that was already there. Both looked the same.
//
// columnDiff is the counting, made pure so the semantics are pinned here rather than inferred
// from a rendered string. Identity is by exact polynomial key (sym-core's poly.key(), the same
// canonical key the factorizer uses), not by label or position.
import { describe, it, expect, beforeAll } from "vitest";

let UI: any;
beforeAll(async () => {
  await import("../app/solver.mjs");
  const reg: any = await import("../app/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  UI = reg.QD_UI;
});

describe("columnDiff — added / carried / removed", () => {
  const D = (a: string[], b: string[]) => UI.columnDiff(a, b);

  it("an untouched column is all carried", () => {
    expect(D(["a", "b", "c"], ["a", "b", "c"])).toEqual({ added: 0, carried: 3, removed: 0 });
  });

  it("a propagate step adds without disturbing what was there", () => {
    expect(D(["a", "b"], ["a", "b", "c"])).toEqual({ added: 1, carried: 2, removed: 0 });
  });

  it("a Gröbner step can replace everything while the COUNT stays put", () => {
    // The case the size counts cannot express: 3 in, 3 out, nothing in common.
    expect(D(["a", "b", "c"], ["x", "y", "z"])).toEqual({ added: 3, carried: 0, removed: 3 });
  });

  it("an elimination removes without adding", () => {
    expect(D(["a", "b", "c"], ["a", "c"])).toEqual({ added: 0, carried: 2, removed: 1 });
  });

  it("order is irrelevant — identity is by content, not position", () => {
    expect(D(["a", "b", "c"], ["c", "a", "b"])).toEqual({ added: 0, carried: 3, removed: 0 });
  });

  // The reason this is a multiset and not a set.
  it("counts duplicates: two copies in, one out, is one carried and one gone", () => {
    expect(D(["a", "a"], ["a"])).toEqual({ added: 0, carried: 1, removed: 1 });
  });

  it("counts duplicates the other way: one in, two out, is one carried and one new", () => {
    expect(D(["a"], ["a", "a"])).toEqual({ added: 1, carried: 1, removed: 0 });
  });

  it("a set-based diff would have hidden both of those", () => {
    // Guards the choice itself: if someone 'simplifies' this to Sets, these two collapse to
    // {added:0, carried:1, removed:0} and the header stops reporting a real change.
    expect(D(["a", "a"], ["a"]).removed).toBeGreaterThan(0);
    expect(D(["a"], ["a", "a"]).added).toBeGreaterThan(0);
  });

  it("handles the empty edges", () => {
    expect(D([], [])).toEqual({ added: 0, carried: 0, removed: 0 });
    expect(D([], ["a"])).toEqual({ added: 1, carried: 0, removed: 0 });
    expect(D(["a"], [])).toEqual({ added: 0, carried: 0, removed: 1 });
    expect(UI.columnDiff(null, null)).toEqual({ added: 0, carried: 0, removed: 0 });
  });

  it("conserves the totals it is given", () => {
    const prev = ["a", "b", "b", "c"], cur = ["b", "c", "d", "e", "e"];
    const d = D(prev, cur);
    expect(d.carried + d.added).toBe(cur.length);       // everything current is one or the other
    expect(d.carried + d.removed).toBe(prev.length);    // …and everything previous likewise
  });
});

describe("columnDiffLabel — the wording", () => {
  const L = (d: any) => UI.columnDiffLabel(d);

  it("reads as a sentence about the step", () => {
    expect(L({ added: 3, carried: 14, removed: 2 })).toBe("+3 new · 14 carried · −2 gone");
  });

  it("omits zero parts rather than printing '0 gone'", () => {
    // "0 gone" is noise, and worse, it reads as a claim that something was checked and found
    // absent — where the honest rendering is to say nothing.
    expect(L({ added: 3, carried: 14, removed: 0 })).toBe("+3 new · 14 carried");
    expect(L({ added: 0, carried: 14, removed: 0 })).toBe("14 carried");
    expect(L({ added: 2, carried: 0, removed: 0 })).toBe("+2 new");
  });

  it("says nothing at all when nothing changed", () => {
    expect(L({ added: 0, carried: 0, removed: 0 })).toBe("");
    expect(L(null)).toBe("");
  });

  it("signs the directions so they cannot be misread as counts", () => {
    const s = L({ added: 1, carried: 1, removed: 1 });
    expect(s).toContain("+1 new");
    expect(s).toContain("−1 gone");
  });
});
