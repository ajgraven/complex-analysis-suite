// @vitest-environment node
//
// Q2 (PR-3) — the triangularize + resolvent worker kinds must be byte-identical to running the same
// sym-core function inline (the store's sync path), so offloading changes only WHERE the op runs. This
// pins runJob('triangularize') and runJob('resolvent') against direct S.triangularize / S.resolvent.
//
// ⚠ A differential test alone is NOT enough here, and this file learned that the hard way. Each runJob
// kind calls the SAME sym-core function the sync path does — that is exactly what makes them identical,
// and it is also what makes `expect(viaJob.ok).toBe(inline.ok)` tautological: break the shared function
// and BOTH sides return ok:false, so the comparison holds and the `if (inline.ok)` content block never
// runs. Verified, not assumed: making `triangularize` return {ok:false} unconditionally — a completely
// dead feature — left all 6 tests green. So every differential below now PINS THE EXPECTED OUTCOME
// first (inline.ok === true, and the specific status/degree the fixture must produce) and only then
// compares the two paths. Agreement is checked against a known-good result, never against a shared
// failure.
import { describe, it, expect, beforeAll } from "vitest";

let S: any;
beforeAll(async () => {
  const QD = (await import("../app/solver.mjs")).default;
  await import("../app/sym-core.mjs");   // populates QD.Sym (runJob, triangularize, resolvent, …)
  S = QD.Sym;
});

describe("Q2 triangularize worker kind is byte-identical to inline S.triangularize", () => {
  it("runJob('triangularize') === S.triangularize (chain + main/free vars + contradiction)", () => {
    const z1 = S.mpolyVar("z1"), zb1 = S.mpolyVar("zb1");
    const polys = [z1.mul(z1).sub(zb1), z1.mul(zb1).sub(S.mpolyConst(S.gaussInt(1)))];
    const vars = ["z1", "zb1"];
    const inline = S.triangularize(polys, vars, {});
    const viaJob = S.runJob("triangularize", { polys: polys.map((p: any) => p.termList()), vars, opts: {} });
    // Pin the outcome BEFORE comparing: this fixture has a Wu chain, so a run that fails on both
    // paths is a regression, not agreement.
    expect(inline.ok).toBe(true);
    expect((inline.chain || []).length).toBeGreaterThan(0);
    expect(viaJob.ok).toBe(true);
    expect(viaJob.chain).toEqual((inline.chain || []).map((p: any) => p.termList()));
    expect(viaJob.initials).toEqual((inline.initials || []).map((p: any) => p.termList()));
    expect(viaJob.mainVars).toEqual(inline.mainVars || []);
    expect(viaJob.freeVars).toEqual(inline.freeVars || []);
    expect(!!viaJob.contradiction).toBe(!!inline.contradiction);
  });
});

describe("Q2 resolvent worker kind is byte-identical to inline S.resolvent", () => {
  it("runJob('resolvent') === S.resolvent (poly + square-free + disc + scalars)", () => {
    // x² = y, y² = 2  ⇒ resolvent in x is x⁴ − 2 (degree 4).
    const x = S.mpolyVar("x"), y = S.mpolyVar("y");
    const polys = [x.mul(x).sub(y), y.mul(y).sub(S.mpolyConst(S.gaussInt(2)))];
    const vars = ["x", "y"];
    const inline = S.resolvent(polys, "x", vars, {});
    const viaJob = S.runJob("resolvent", { polys: polys.map((p: any) => p.termList()), resVar: "x", vars, opts: {} });
    // Pin the outcome BEFORE comparing — the resolvent of this system is x⁴ − 2, so degree 4 is a
    // fact about the fixture, not about either code path.
    expect(inline.ok).toBe(true);
    expect(inline.degree).toBe(4);
    expect(viaJob.ok).toBe(true);
    expect(viaJob.degree).toBe(4);
    expect(viaJob.poly).toEqual(inline.poly.termList());
    expect(viaJob.squareFree).toEqual(inline.squareFree.termList());
    expect(viaJob.discriminant).toEqual(inline.discriminant ? inline.discriminant.termList() : null);
    expect(viaJob.distinctDegree).toBe(inline.distinctDegree);
    expect(!!viaJob.degenerate).toBe(!!inline.degenerate);
  });
});

describe("Q2 eliminate worker kind is byte-identical to inline S.eliminationIdeal", () => {
  it("runJob('eliminate') === S.eliminationIdeal (the ideal path)", () => {
    const x = S.mpolyVar("x"), y = S.mpolyVar("y");
    // x² − y = 0, x − 1 = 0  ⇒ eliminate x ⇒ ⟨x²−y, x−1⟩ ∩ ℚ[y] = ⟨y−1⟩.
    const a = x.mul(x).sub(y), b = x.sub(S.mpolyConst(S.gaussInt(1)));
    const inline = (S.eliminationIdeal([a, b], ["x"], ["y"]) || []).filter((p: any) => !p.isZero()).map((p: any) => p.termList());
    const viaJob = S.runJob("eliminate", { polys: [a.termList(), b.termList()], elimVars: ["x"], keepVars: ["y"], opts: {} });
    expect(viaJob.ok).toBe(true);
    expect(viaJob.method).toBe("ideal");
    expect(inline.length).toBe(1);          // ⟨y−1⟩ — the elimination really produced a relation
    expect(viaJob.generators).toEqual(inline);
  });

  // The ideal path can find no relation free of x while the resultant fallback is never consulted.
  // This is the honest "no clean elimination" the store surfaces — and it is NOT the resultantZero
  // branch, which the test below reaches deliberately.
  it("runJob('eliminate') returns an empty ideal when the pair shares a component", () => {
    const x = S.mpolyVar("x"), y = S.mpolyVar("y");
    const a = x.mul(y), b = x.mul(x).mul(y);   // share x=0 and y=0
    const viaJob = S.runJob("eliminate", { polys: [a.termList(), b.termList()], elimVars: ["x"], keepVars: ["y"], opts: {} });
    expect(viaJob.ok).toBe(true);
    expect(viaJob.method).toBe("ideal");
    expect(viaJob.generators).toEqual([]);
  });

  // The resultant fallback (sym-core `if (res.isZero()) … resultantZero: true`) runs only when the
  // Gröbner elimination THROWS — in production, when it blows a cap on a large system. `maxBasis: 1`
  // reaches that deterministically with a tiny input, so the branch is exercised rather than assumed.
  //
  // ⚠ This is the branch the previous test *claimed* to cover. It did not: with default opts the
  // elimination succeeds, so that call returned {method:'ideal', generators:[]} and `resultantZero`
  // was never even defined — the flag the store reads (algebra-store.mjs, "resultant ≡ 0 (the
  // equations share a component)") had no coverage at all.
  it("runJob('eliminate') sets resultantZero when the forced resultant fallback finds Res ≡ 0", () => {
    const x = S.mpolyVar("x"), y = S.mpolyVar("y");
    const a = x.mul(y), b = x.mul(x).mul(y);   // Res_x(xy, x²y) ≡ 0
    const viaJob = S.runJob("eliminate", { polys: [a.termList(), b.termList()], elimVars: ["x"], keepVars: ["y"], opts: { maxBasis: 1 } });
    expect(viaJob.ok).toBe(true);
    expect(viaJob.method).toBe("resultant");
    expect(viaJob.resultantZero).toBe(true);
    expect(viaJob.generators).toEqual([]);
  });

  it("runJob('eliminate') does NOT set resultantZero when the fallback resultant is nonzero", () => {
    const x = S.mpolyVar("x"), y = S.mpolyVar("y");
    const c = x.sub(S.mpolyConst(S.gaussInt(1))), d = x.add(y);   // Res_x(x−1, x+y) = 1+y ≠ 0
    const viaJob = S.runJob("eliminate", { polys: [c.termList(), d.termList()], elimVars: ["x"], keepVars: ["y"], opts: { maxBasis: 1 } });
    expect(viaJob.ok).toBe(true);
    expect(viaJob.method).toBe("resultant");
    expect(viaJob.resultantZero).toBeFalsy();
    // …and the generator really is the resultant, not an empty "gave up".
    expect(viaJob.generators).toEqual([S.resultant(c, d, "x").termList()]);
  });
});

describe("Q2 factor worker kind is byte-identical to inline S.factor", () => {
  it("runJob('factor') === S.factor (status + the factors)", () => {
    const x = S.mpolyVar("x");
    // (x − 1)(x − 2) = x² − 3x + 2 — reducible over ℚ(i).
    const p = x.sub(S.mpolyConst(S.gaussInt(1))).mul(x.sub(S.mpolyConst(S.gaussInt(2))));
    const inline = S.factor(p, {});
    const viaJob = S.runJob("factor", { poly: p.termList() });
    expect(inline.ok).toBe(true);
    expect(inline.status).toBe("reducible");     // pinned: both sides returning undefined is not agreement
    expect((inline.factors || []).length).toBe(2);
    expect(viaJob.ok).toBe(true);
    expect(viaJob.status).toBe("reducible");
    expect(viaJob.factors).toEqual((inline.factors || []).map((g: any) => g.termList()));
  });

  it("runJob('factor') on an irreducible poly reports irreducible (no split)", () => {
    const x = S.mpolyVar("x");
    const p = x.mul(x).sub(S.mpolyConst(S.gaussInt(2)));   // x² − 2, irreducible over ℚ(i) (√2 ∉ ℚ(i))
    const inline = S.factor(p, {});
    const viaJob = S.runJob("factor", { poly: p.termList() });
    // ⚠ `ok` here means "a nontrivial factorization was produced", NOT "the call succeeded": an
    // irreducible input legitimately returns ok:false with status:'irreducible'. That is precisely
    // why comparing `viaJob.ok === inline.ok` proves nothing on this fixture — false === false is
    // both the correct answer AND what two crashed paths return. `status` is the discriminating
    // field, so pin it directly on each side.
    expect(inline.status).toBe("irreducible");
    expect(inline.ok).toBe(false);
    expect((inline.factors || []).length).toBe(1);   // the polynomial itself, unsplit
    expect(viaJob.status).toBe("irreducible");
    expect(viaJob.ok).toBe(false);
    expect(viaJob.factors).toEqual((inline.factors || []).map((g: any) => g.termList()));
  });
});
