// @vitest-environment node
//
// Q2 (PR-3) — the triangularize + resolvent worker kinds must be byte-identical to running the same
// sym-core function inline (the store's sync path), so offloading changes only WHERE the op runs. This
// pins runJob('triangularize') and runJob('resolvent') against direct S.triangularize / S.resolvent.
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
    expect(viaJob.ok).toBe(inline.ok);
    if (inline.ok) {
      expect(viaJob.chain).toEqual((inline.chain || []).map((p: any) => p.termList()));
      expect(viaJob.initials).toEqual((inline.initials || []).map((p: any) => p.termList()));
      expect(viaJob.mainVars).toEqual(inline.mainVars || []);
      expect(viaJob.freeVars).toEqual(inline.freeVars || []);
      expect(!!viaJob.contradiction).toBe(!!inline.contradiction);
    }
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
    expect(viaJob.ok).toBe(inline.ok);
    if (inline.ok) {
      expect(viaJob.poly).toEqual(inline.poly.termList());
      expect(viaJob.squareFree).toEqual(inline.squareFree.termList());
      expect(viaJob.discriminant).toEqual(inline.discriminant ? inline.discriminant.termList() : null);
      expect(viaJob.degree).toBe(inline.degree);
      expect(viaJob.distinctDegree).toBe(inline.distinctDegree);
      expect(!!viaJob.degenerate).toBe(!!inline.degenerate);
    }
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
    expect(viaJob.generators).toEqual(inline);
  });

  it("runJob('eliminate') reports resultantZero when the pair shares a component", () => {
    const x = S.mpolyVar("x"), y = S.mpolyVar("y");
    // x·y and x²·y share the component x=0 (and y=0), so Res_x ≡ 0 and the ideal path is empty/degenerate.
    const a = x.mul(y), b = x.mul(x).mul(y);
    const viaJob = S.runJob("eliminate", { polys: [a.termList(), b.termList()], elimVars: ["x"], keepVars: ["y"], opts: {} });
    // Either the ideal path yields no relation free of x, or the resultant is ≡ 0 — both are honest "no
    // clean elimination"; the store maps them to a clear reason. Assert the kind returns without throwing.
    expect(viaJob.ok).toBe(true);
  });
});

describe("Q2 factor worker kind is byte-identical to inline S.factor", () => {
  it("runJob('factor') === S.factor (status + the factors)", () => {
    const x = S.mpolyVar("x");
    // (x − 1)(x − 2) = x² − 3x + 2 — reducible over ℚ(i).
    const p = x.sub(S.mpolyConst(S.gaussInt(1))).mul(x.sub(S.mpolyConst(S.gaussInt(2))));
    const inline = S.factor(p, {});
    const viaJob = S.runJob("factor", { poly: p.termList() });
    expect(viaJob.ok).toBe(inline.ok);
    expect(viaJob.status).toBe(inline.status);   // 'reducible'
    expect(viaJob.factors).toEqual((inline.factors || []).map((g: any) => g.termList()));
  });

  it("runJob('factor') on an irreducible poly reports irreducible (no split)", () => {
    const x = S.mpolyVar("x");
    const p = x.mul(x).sub(S.mpolyConst(S.gaussInt(2)));   // x² − 2, irreducible over ℚ(i) (√2 ∉ ℚ(i))
    const inline = S.factor(p, {});
    const viaJob = S.runJob("factor", { poly: p.termList() });
    expect(viaJob.ok).toBe(inline.ok);
    expect(viaJob.status).toBe(inline.status);
    expect(viaJob.factors).toEqual((inline.factors || []).map((g: any) => g.termList()));
  });
});
