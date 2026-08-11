import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { makeComplexFn } from "../src/evaluate.js";
import { differentiate } from "../src/derivative.js";
import { compileF } from "../src/glsl.js";
import { toLatex } from "../src/latex.js";
import * as C from "../src/complexJs.js";
import type { Complex } from "../src/complex.js";

// Phase 4 / B6: Riemann ζ(s) via Borwein's alternating-series acceleration, with the functional
// equation (reusing Γ) for Re(s) < 0. JS is the float64 reference (checked here against special values,
// trivial + first nontrivial zeros, and the pole); the GLSL twin shares the algorithm and is
// render-/probe-checked headlessly.

const close = (a: Complex, b: Complex, p = 6): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

describe("ζ — special values (JS reference)", () => {
  it("matches the even-integer closed forms", () => {
    close(C.zeta([2, 0]), [(Math.PI * Math.PI) / 6, 0]);
    close(C.zeta([4, 0]), [Math.pow(Math.PI, 4) / 90, 0]);
  });

  it("gives ζ(0) = −½ (Borwein core, no functional-equation 0·∞)", () => {
    close(C.zeta([0, 0]), [-0.5, 0]);
  });

  it("gives the negative-integer values via the functional equation", () => {
    close(C.zeta([-1, 0]), [-1 / 12, 0]); // -0.0833…
    close(C.zeta([-3, 0]), [1 / 120, 0]); // 0.00833…
  });

  it("vanishes at the trivial zeros s = −2, −4, −6", () => {
    for (const n of [-2, -4, -6]) expect(C.abs(C.zeta([n, 0]))[0]).toBeLessThan(1e-6);
  });

  it("is ≈ 0 at the first nontrivial zero ½ + 14.134725i", () => {
    expect(C.abs(C.zeta([0.5, 14.134725]))[0]).toBeLessThan(1e-3);
  });

  it("blows up at the pole s = 1 (huge or NaN, never moderate)", () => {
    expect(C.abs(C.zeta([1, 0]))[0] < 1e6).toBe(false);
  });

  it("matches a known off-axis value ζ(2 + i)", () => {
    close(C.zeta([2, 1]), [1.1503556, -0.4375309], 5);
  });
});

describe("ζ — language wiring", () => {
  it("parses, evaluates, and renders to LaTeX", () => {
    close(makeComplexFn(parse("zeta(z)"))([2, 0], [0, 0]), [(Math.PI * Math.PI) / 6, 0]);
    expect(toLatex(parse("zeta(z)"))).toBe("\\zeta\\left(z\\right)");
  });

  it("compiles to the GLSL czeta builtin", () => {
    expect(compileF(parse("zeta(z)"))).toContain("czeta(z)");
  });

  it("is reported non-differentiable (no ζ′ builtin)", () => {
    expect(() => differentiate(parse("zeta(z)"), "z")).toThrow(/not differentiable/);
  });
});
