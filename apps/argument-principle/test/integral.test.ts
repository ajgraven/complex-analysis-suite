import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { differentiate } from "@cas/expr/derivative";
import { sampleCircle } from "../src/contour.js";
import {
  logDerivIntegral,
  partialLogDerivIntegral,
  normalizeByTwoPiI,
  type Cplx,
} from "../src/integral.js";

// The analytic side of the theorem (§11 B4): (1/2πi)∮ f′/f dz computed by quadrature must round to Z − P,
// agreeing with the topological winding. These pin that the Riemann sum lands on the integer count.

function compile(src: string): { f: (z: Cplx) => Cplx; fp: (z: Cplx) => Cplx } {
  const fn = makeComplexFn(parse(src));
  const dfn = makeComplexFn(differentiate(parse(src), "z"));
  return {
    f: (z: Cplx): Cplx => {
      const w = fn([z[0], z[1]], [0, 0]);
      return [w[0], w[1]];
    },
    fp: (z: Cplx): Cplx => {
      const w = dfn([z[0], z[1]], [0, 0]);
      return [w[0], w[1]];
    },
  };
}

const circle = (r: number, n = 800): Cplx[] => sampleCircle({ centerRe: 0, centerIm: 0, radius: r }, n);

describe("logDerivIntegral — the analytic (1/2πi) ∮ f′/f dz", () => {
  it("counts the 3 zeros of z³−1 inside a radius-1.5 contour", () => {
    const { f, fp } = compile("z*z*z - 1");
    const val = normalizeByTwoPiI(logDerivIntegral(f, fp, circle(1.5)))[0];
    expect(val).toBeCloseTo(3, 1);
    expect(Math.round(val)).toBe(3);
  });

  it("counts a single zero of z over the unit circle", () => {
    const { f, fp } = compile("z");
    expect(normalizeByTwoPiI(logDerivIntegral(f, fp, circle(1)))[0]).toBeCloseTo(1, 2);
  });

  it("gives −1 for a simple pole enclosed by γ", () => {
    const { f, fp } = compile("1/(z - 0.3)");
    expect(Math.round(normalizeByTwoPiI(logDerivIntegral(f, fp, circle(1)))[0])).toBe(-1);
  });

  it("gives 0 when neither a zero nor a pole is enclosed", () => {
    const { f, fp } = compile("z - 5"); // its only zero sits at 5, outside r = 1
    expect(normalizeByTwoPiI(logDerivIntegral(f, fp, circle(1)))[0]).toBeCloseTo(0, 6);
  });

  it("the modulus (real) part of ∮ vanishes around a closed loop; the imaginary part is 2π(N−P)", () => {
    const { f, fp } = compile("z*z*z - 1");
    const I = logDerivIntegral(f, fp, circle(1.5));
    expect(I[0]).toBeCloseTo(0, 3); // Re ∮ f′/f dz = Δ log|f| = 0
    expect(I[1]).toBeCloseTo(2 * Math.PI * 3, 1); // Im ∮ f′/f dz = 2π·(zeros − poles)
  });

  it("partial integral is 0 at upto=0 and reaches the full loop at upto=1", () => {
    const { f, fp } = compile("z*z - 1");
    const zs = circle(1.5);
    expect(partialLogDerivIntegral(f, fp, zs, 0)).toEqual([0, 0]);
    const full = logDerivIntegral(f, fp, zs);
    const p1 = partialLogDerivIntegral(f, fp, zs, 1);
    expect(p1[0]).toBeCloseTo(full[0], 9);
    expect(p1[1]).toBeCloseTo(full[1], 9);
  });
});

describe("normalizeByTwoPiI", () => {
  it("maps 2πi·k to the real integer k", () => {
    expect(normalizeByTwoPiI([0, 2 * Math.PI])[0]).toBeCloseTo(1, 12);
    expect(normalizeByTwoPiI([0, 2 * Math.PI * 3])[0]).toBeCloseTo(3, 12);
    expect(normalizeByTwoPiI([0, -2 * Math.PI])[0]).toBeCloseTo(-1, 12);
  });
  it("sends the modulus (real) part of I to the imaginary output", () => {
    expect(normalizeByTwoPiI([2 * Math.PI, 0])[1]).toBeCloseTo(-1, 12);
  });
});
