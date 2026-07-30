// Characterization tests for refactor stage A1 (finding QD-SOLV-3).
//
// Pins the behavior that must NOT change: the shared `QD.poleCentroid` helper contract and the
// `powerQD_singular` w0 default for the ordinary (non-empty-pole) case. The intended,
// D-1-approved behavior change — `powerQD_singular`'s EMPTY-pole fallback moving from {re:1} to
// the PQD-family-standard {re:0}, which then trips the w0!=0 guard and throws — is asserted
// separately, added together with the fix, so this file stays green before AND after the change.
//
// Loads the full solver graph headlessly in real Node ESM (same pattern as worker-entry.test.ts).
import { describe, it, expect, beforeAll } from "vitest";

let QD: any;
beforeAll(async () => {
  ({ default: QD } = await import("../app/workers/solver-graph.mjs"));
});

describe("QD.poleCentroid — shared helper contract (QD-SOLV-3)", () => {
  it("returns the arithmetic mean of pole positions for non-empty poles", () => {
    const hData = {
      poles: [{ a: { re: 2, im: 0 } }, { a: { re: 0, im: 4 } }, { a: { re: -2, im: 2 } }],
    };
    const c = QD.poleCentroid(hData, { re: 0, im: 0 });
    expect(c.re).toBeCloseTo(0, 12); // (2 + 0 - 2) / 3
    expect(c.im).toBeCloseTo(2, 12); // (0 + 4 + 2) / 3
  });

  it("returns the caller-supplied fallback (as a fresh object) when there are no poles", () => {
    const fb = { re: 1, im: 0 };
    expect(QD.poleCentroid({ poles: [] }, { re: 0, im: 0 })).toEqual({ re: 0, im: 0 });
    const c1 = QD.poleCentroid({ poles: [] }, fb);
    expect(c1).toEqual({ re: 1, im: 0 });
    expect(c1).not.toBe(fb); // fresh copy, never the fallback reference itself
  });

  it("defaults the empty-pole fallback to 0 when none is supplied", () => {
    expect(QD.poleCentroid({ poles: [] })).toEqual({ re: 0, im: 0 });
  });
});

describe("Family.powerQD_singular.normalizeOpts — w0 default (QD-SOLV-3 invariant)", () => {
  const fam = () => QD.Family.powerQD_singular;

  it("defaults w0 to the pole centroid for non-empty poles (unchanged by the fix)", () => {
    const hData = { poles: [{ a: { re: 3, im: 0 } }, { a: { re: 1, im: 2 } }] };
    const out = fam().normalizeOpts({ alpha: 2 }, hData);
    expect(out.w0.re).toBeCloseTo(2, 12); // mean(3, 1)
    expect(out.w0.im).toBeCloseTo(1, 12); // mean(0, 2)
    expect(out.alpha).toBe(2);
    expect(out.singular).toBe(true);
  });

  it("respects an explicit opts.w0", () => {
    const hData = { poles: [{ a: { re: 3, im: 0 } }] };
    const out = fam().normalizeOpts({ alpha: 2, w0: { re: 5, im: 1 } }, hData);
    expect(out.w0).toEqual({ re: 5, im: 1 });
  });
});
