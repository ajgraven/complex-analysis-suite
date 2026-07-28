// The family-sweep engine (family-sweep.mjs): its ORCHESTRATION — warm-chaining
// from the previous valid member, honest counting of non-univalent / unsolved
// members, valid-only curve collection, and abort — tested with injected
// solve/sample fakes (no real solver needed; the real PS.solveOnePoint +
// QD.sampleBoundary path is exercised by the browser verification).
import { describe, it, expect } from "vitest";
import { sweepFamily, linspace } from "../app/family-sweep.mjs";

describe("family-sweep engine", () => {
  it("linspace spans [min,max] and collapses to one point for n<=1", () => {
    expect(linspace(0, 1, 1)).toEqual([0]);
    expect(linspace(0, 10, 3)).toEqual([0, 5, 10]);
    expect(linspace(-1, 1, 5)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });

  it("warm-chains valid members, collects their curves, and counts the rest honestly", async () => {
    const ref = { kind: "residueRe", poleIdx: 0, residueIdx: 0 };
    const scenario = { hData: {}, norm: {}, mode: "bounded" };
    const warmSeen: any[] = [];
    // fake solver: value < 0.3 → non-univalent, value > 0.8 → no-root, else valid
    const solve = (_sc: any, point: any, warm: any) => {
      warmSeen.push(warm);
      const v = point[0].value;
      if (v < 0.3) return { cls: "univalence-fail" };
      if (v > 0.8) return { cls: "no-root", errSample: "diverged" };
      return { cls: "valid", phiSerialized: { id: v } };
    };
    // fake boundary sampler: N points carrying an extra field to prove it's stripped
    const sample = (phi: any, N: number) =>
      Array.from({ length: N }, (_, k) => ({ re: phi.id + k, im: k, extra: 1 }));

    const values = linspace(0, 1, 6); // 0, .2, .4, .6, .8, 1
    const { curves, counts } = await sweepFamily({ scenario, ref, values, sampleN: 4, solve, sample });

    expect(counts.total).toBe(6);
    expect(counts.valid).toBe(3);        // .4 .6 .8
    expect(counts.nonUnivalent).toBe(2); // 0 .2
    expect(counts.unsolved).toBe(1);     // 1

    const valid = curves.filter((c) => c.ok);
    expect(valid.length).toBe(3);
    expect(valid[0].pts.length).toBe(4);
    expect(Object.keys(valid[0].pts[0]).sort()).toEqual(["im", "re"]); // extra stripped
    // non-valid members are recorded (as gaps) with ok:false and no pts
    expect(curves.filter((c) => !c.ok).every((c) => c.pts === null)).toBe(true);

    // warm-start chained: the v=.6 solve got the φ from v=.4; the failing v=1 solve
    // still carried the last VALID warm (v=.8), never a failed seed.
    expect(warmSeen[2]).toBeNull();          // first valid (.4) started cold
    expect(warmSeen[3]).toEqual({ id: 0.4 }); // .6 warm-started from .4
    expect(warmSeen[4]).toEqual({ id: 0.6 }); // .8 from .6
    expect(warmSeen[5]).toEqual({ id: 0.8 }); // 1 (unsolved) kept the last valid warm
  });

  it("returns empty on missing inputs and stops on an abort signal", async () => {
    expect((await sweepFamily({})).counts.total).toBe(0);
    const solve = () => ({ cls: "valid", phiSerialized: {} });
    const { counts } = await sweepFamily({ scenario: {}, ref: {}, values: [1, 2, 3], solve, signal: { aborted: true } });
    expect(counts.valid).toBe(0); // aborted before any solve ran
  });
});
