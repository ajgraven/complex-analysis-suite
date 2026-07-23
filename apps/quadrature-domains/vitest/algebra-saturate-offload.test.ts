// @vitest-environment node
//
// Q2 — the offloaded heavy ops must be byte-identical to running them inline: the worker runJob kind
// deserializes, calls the SAME sym-core function the store's sync path calls, and serializes back, so
// ONLY where it runs changes. This pins the 'saturate' kind (the ✦ Prove prelude op, wired first);
// runJob('saturate') must return exactly the generators S.saturate returns inline.
import { describe, it, expect, beforeAll } from "vitest";

let S: any;
beforeAll(async () => {
  const QD = (await import("../app/solver.mjs")).default;
  await import("../app/sym-core.mjs");   // populates QD.Sym (runJob, saturate, …) — must run BEFORE grabbing it
  S = QD.Sym;
});

describe("Q2 saturate worker kind is byte-identical to inline S.saturate", () => {
  it("runJob('saturate', …).generators === S.saturate(polys, f, …).map(termList)", () => {
    const z1 = S.mpolyVar("z1"), zb1 = S.mpolyVar("zb1");
    // A small conjugate-model system + the Möbius factor the store would build (1 − z̄1·z1).
    const polys = [z1.mul(z1).sub(zb1), z1.mul(zb1).sub(S.mpolyConst(S.gaussInt(1)).mul(zb1))];
    const f = S.mpolyConst(S.gaussInt(1)).sub(zb1.mul(z1));   // 1 − z̄1·z1
    const inline = S.saturate(polys, f, "_wsat", {}).map((g: any) => g.termList());
    const viaJob = S.runJob("saturate", {
      polys: polys.map((p: any) => p.termList()), satPoly: f.termList(), satVar: "_wsat", opts: {},
    }).generators;
    expect(viaJob).toEqual(inline);
  });

  it("an empty pole set (nothing to saturate) round-trips identically too", () => {
    const a = S.mpolyVar("a1"), b = S.mpolyVar("A1_1");
    const polys = [a.mul(a).sub(b)];
    const f = S.mpolyConst(S.gaussInt(1)).sub(a.mul(a));
    const inline = S.saturate(polys, f, "_wsat", {}).map((g: any) => g.termList());
    const viaJob = S.runJob("saturate", {
      polys: polys.map((p: any) => p.termList()), satPoly: f.termList(), satVar: "_wsat", opts: {},
    }).generators;
    expect(viaJob).toEqual(inline);
  });
});
