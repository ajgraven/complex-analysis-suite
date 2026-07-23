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
