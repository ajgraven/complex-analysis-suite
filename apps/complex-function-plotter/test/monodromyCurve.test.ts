import { describe, it, expect } from "vitest";
import type { Complex } from "@cas/expr/complex";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { computeMonodromy } from "@cas/monodromy";
import { detectAlgebraicCurve } from "../src/riemann/algebraicCurve.js";

// The plotter's half of the monodromy parity: the continuation engine moved to @cas/monodromy
// (ADR-0047 PRA-3, second consumer), and these two cases drive it through THIS app's algebraic-curve
// enumerator, which stays here.

/** A circle loop (M points) of `radius` centred at `(cx, cy)`. */
const circle = (cx: number, cy: number, radius: number, m = 96): Complex[] => {
  const out: Complex[] = [];
  for (let k = 0; k < m; k++) {
    const t = (2 * Math.PI * k) / m;
    out.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)]);
  }
  return out;
};

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

