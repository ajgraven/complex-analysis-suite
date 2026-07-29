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

  it("includeNonUnivalent draws non-univalent members (with pts) via the direct solve", async () => {
    const ref = { kind: "poleRe", poleIdx: 0 };
    const scenario = { hData: {}, norm: {}, mode: "bounded" };
    // fake direct solver: value < 0.3 → non-univalent φ, value > 0.8 → no φ, else valid
    const solveDirect = (_sc: any, _ref: any, value: number) =>
      value > 0.8 ? null : { phi: { id: value }, univalent: value >= 0.3 };
    const sample = (phi: any, N: number) => Array.from({ length: N }, (_, k) => ({ re: phi.id, im: k }));
    const values = linspace(0, 1, 6); // 0 .2 .4 .6 .8 1
    const { curves, counts } = await sweepFamily({
      scenario, ref, values, sampleN: 3, includeNonUnivalent: true, solveDirect, sample,
    });
    expect(counts.valid).toBe(3); // .4 .6 .8
    expect(counts.nonUnivalent).toBe(2); // 0 .2 — now carry pts, so the card can dash them
    expect(counts.unsolved).toBe(1); // 1 → no φ
    const nonUniv = curves.filter((c) => c.nonUnivalent);
    expect(nonUniv.length).toBe(2);
    expect(nonUniv.every((c) => c.pts && c.pts.length === 3)).toBe(true); // drawable (dashed)
    expect(curves.filter((c) => c.ok).every((c) => c.nonUnivalent === false)).toBe(true);
  });

  it("includeNonUnivalent does NOT count a univalent-but-identity-failing member as valid (honest labelling)", async () => {
    const ref = { kind: "poleRe", poleIdx: 0 };
    const scenario = { hData: {}, norm: {}, mode: "bounded" };
    // solveInverseQD's "best-of-the-bad" primary can be univalent yet FAIL the
    // quadrature identity (identityOK:false). Such a member is NOT a quadrature
    // domain: it must be drawn dashed and excluded from the valid count, never
    // presented as valid. (Old code keyed `ok` off univalence alone and would
    // count it valid — this guards the honest-labelling fix.)
    const solveDirect = (_sc: any, _ref: any, value: number) =>
      value === 0.5
        ? { phi: { id: value }, univalent: true, identityOK: false } // univalent, identity FAILS
        : { phi: { id: value }, univalent: true, identityOK: true };  // genuine QD
    const sample = (phi: any, N: number) => Array.from({ length: N }, (_, k) => ({ re: phi.id, im: k }));
    const values = linspace(0, 1, 3); // 0, .5, 1
    const { curves, counts } = await sweepFamily({
      scenario, ref, values, sampleN: 3, includeNonUnivalent: true, solveDirect, sample,
    });
    expect(counts.valid).toBe(2);        // 0 and 1 (identityOK)
    expect(counts.nonUnivalent).toBe(1); // .5 — identity fails ⇒ dashed, NOT valid
    const bad = curves.find((c) => c.value === 0.5)!;
    expect(bad.ok).toBe(false);                 // never solid/valid
    expect(bad.nonUnivalent).toBe(true);        // dashed bucket
    expect(bad.pts && bad.pts.length).toBe(3);  // still drawable (dashed)
    expect(curves.find((c) => c.value === 0)!.ok).toBe(true); // genuine member stays valid
  });

  it("includeNonUnivalent treats a missing identityOK as OK (identity check disabled)", async () => {
    // defaultSolveDirect passes identityOK straight through; when the solver's
    // identity check is off it is undefined, which classifyResult (and this loop)
    // treat as OK — so a univalent member with no identityOK stays valid.
    const solveDirect = (_sc: any, _ref: any, value: number) => ({ phi: { id: value }, univalent: true });
    const sample = (phi: any, N: number) => Array.from({ length: N }, (_, k) => ({ re: phi.id, im: k }));
    const { counts } = await sweepFamily({
      scenario: { hData: {}, norm: {}, mode: "bounded" }, ref: { kind: "poleRe", poleIdx: 0 },
      values: linspace(0, 1, 3), sampleN: 2, includeNonUnivalent: true, solveDirect, sample,
    });
    expect(counts.valid).toBe(3); // undefined identityOK ⇒ treated OK (backward-compatible)
  });

  it("returns empty on missing inputs and stops on an abort signal", async () => {
    expect((await sweepFamily({})).counts.total).toBe(0);
    const solve = () => ({ cls: "valid", phiSerialized: {} });
    const { counts } = await sweepFamily({ scenario: {}, ref: {}, values: [1, 2, 3], solve, signal: { aborted: true } });
    expect(counts.valid).toBe(0); // aborted before any solve ran
  });
});
