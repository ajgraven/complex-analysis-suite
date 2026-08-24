import { describe, it, expect } from "vitest";
import type { Complex } from "@cas/expr/complex";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { computeMonodromy, resampleClosedLoop } from "../src/riemann/monodromy.js";
import { detectAlgebraicCurve } from "../src/riemann/algebraicCurve.js";

/** Principal complex square root (both roots returned as the sheet set). */
const csqrt = (z: Complex): Complex => {
  const r = Math.hypot(z[0], z[1]);
  const re = Math.sqrt((r + z[0]) / 2);
  const im = (z[1] >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, (r - z[0]) / 2));
  return [re, im];
};
/** The two sheets of √z. */
const sqrtSheets = (z: Complex): Complex[] => {
  const p = csqrt(z);
  return [p, [-p[0], -p[1]]];
};
/** The three sheets of z^(1/3). */
const cbrtSheets = (z: Complex): Complex[] => {
  const r = Math.hypot(z[0], z[1]);
  const a = Math.atan2(z[1], z[0]);
  const rho = Math.cbrt(r);
  return [0, 1, 2].map((k) => {
    const ang = (a + 2 * Math.PI * k) / 3;
    return [rho * Math.cos(ang), rho * Math.sin(ang)] as Complex;
  });
};

/** A circle loop (M points) of `radius` centred at `(cx, cy)`. */
const circle = (cx: number, cy: number, radius: number, m = 96): Complex[] => {
  const out: Complex[] = [];
  for (let k = 0; k < m; k++) {
    const t = (2 * Math.PI * k) / m;
    out.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)]);
  }
  return out;
};

describe("computeMonodromy — nearest-match continuation (M3.3)", () => {
  it("√z: a loop around 0 swaps the two sheets (a 2-cycle)", () => {
    const res = computeMonodromy(sqrtSheets, circle(0, 0, 1));
    expect(res).not.toBeNull();
    if (!res) throw new Error("expected a result");
    expect(res.sheetCount).toBe(2);
    expect(res.isPermutation).toBe(true);
    expect(res.permutation).toEqual([1, 0]); // the sheets swap
    expect(res.cycles).toEqual([[0, 1]]);
    expect(res.lowConfidence).toBe(false);
  });

  it("z^(1/3): a loop around 0 is a single 3-cycle", () => {
    const res = computeMonodromy(cbrtSheets, circle(0, 0, 1));
    expect(res).not.toBeNull();
    if (!res) throw new Error("expected a result");
    expect(res.sheetCount).toBe(3);
    expect(res.isPermutation).toBe(true);
    expect(res.cycles).toHaveLength(1); // one cycle…
    expect(res.cycles[0]).toHaveLength(3); // …of all three sheets
    expect(res.lowConfidence).toBe(false);
  });

  it("√z: a loop NOT enclosing 0 is the identity (no swap)", () => {
    const res = computeMonodromy(sqrtSheets, circle(5, 0, 0.5));
    expect(res).not.toBeNull();
    if (!res) throw new Error("expected a result");
    expect(res.permutation).toEqual([0, 1]); // each sheet returns to itself
    expect(res.cycles).toEqual([[0], [1]]);
    expect(res.lowConfidence).toBe(false);
  });

  it("flags low confidence when the loop passes through the branch point", () => {
    // A degenerate back-and-forth through 0: the resampled path lands on the branch point, where the two
    // sheets merge — the count drifts, so the estimate is flagged unreliable.
    const res = computeMonodromy(sqrtSheets, [
      [1, 0],
      [-1, 0],
    ]);
    expect(res).not.toBeNull();
    if (!res) throw new Error("expected a result");
    expect(res.lowConfidence).toBe(true);
  });

  it("returns null for a single-valued enumerator (nothing to permute)", () => {
    expect(computeMonodromy((z) => [z], circle(0, 0, 1))).toBeNull();
  });

  it("returns null for a degenerate (zero-length) loop", () => {
    expect(computeMonodromy(sqrtSheets, [[1, 1]])).toBeNull();
  });
});

describe("computeMonodromy — over the real algebraic-curve enumerator (√(z²−1))", () => {
  const curve = detectAlgebraicCurve(parse("sqrt(z^2 - 1)"));
  const sheetsAt = (z: Complex): Complex[] => {
    if (!curve) throw new Error("expected an algebraic curve");
    return curve.sheetExprs.map((e) => makeComplexFn(e, {})(z, [0, 0]));
  };

  it("a loop around one branch point (+1) swaps the two sheets", () => {
    const res = computeMonodromy(sheetsAt, circle(1, 0, 0.5)); // encloses +1, excludes −1
    expect(res).not.toBeNull();
    if (!res) throw new Error("expected a result");
    expect(res.sheetCount).toBe(2);
    expect(res.permutation).toEqual([1, 0]); // a transposition
    expect(res.lowConfidence).toBe(false);
  });

  it("a loop around BOTH branch points is trivial (the transpositions compose to identity)", () => {
    const res = computeMonodromy(sheetsAt, circle(0, 0, 2)); // encloses ±1
    expect(res).not.toBeNull();
    if (!res) throw new Error("expected a result");
    expect(res.permutation).toEqual([0, 1]); // identity
    expect(res.lowConfidence).toBe(false);
  });
});

describe("resampleClosedLoop", () => {
  it("resamples a square to N evenly-spaced points, closed back to the start", () => {
    const square: Complex[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const out = resampleClosedLoop(square, 8);
    expect(out).toHaveLength(9); // 8 samples + the closing point
    expect(out[8][0]).toBeCloseTo(out[0][0], 12);
    expect(out[8][1]).toBeCloseTo(out[0][1], 12);
  });

  it("returns [] for a degenerate loop", () => {
    expect(resampleClosedLoop([[2, 3]], 8)).toEqual([]);
  });
});
