// Roadmap #19 (multivariate factorizer) Phase 1 — the exact-ℚ(i) infrastructure Gao's method builds on:
// the kernel-basis routine (the Ruppert-nullspace step) and content / primitive-part / squarefree-in-x
// (the pre-processing). See docs/MULTIVARIATE_FACTORING.md. Pure engine; validated by the Phase-0 spike.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, nullspaceRational, bivariateContent, bivariatePrimitivePart, bivariateSquarefreeInX } = S;

const x = MPoly.variable("x");
const y = MPoly.variable("y");
const I = (k: number) => MPoly.fromInt(k);
const eqPoly = (a: any, b: any): boolean => a.sub(b).isZero();

// complex row·vector, for verifying A·v = 0 on the returned basis.
const cval = (e: any): { re: number; im: number } => (typeof e === "number" ? { re: e, im: 0 } : e);
const dot = (row: any[], v: { re: number; im: number }[]): number => {
  let re = 0, im = 0;
  for (let j = 0; j < row.length; j++) {
    const a = cval(row[j]);
    re += a.re * v[j].re - a.im * v[j].im;
    im += a.re * v[j].im + a.im * v[j].re;
  }
  return Math.hypot(re, im);
};

describe("nullspaceRational — exact ℚ(i) kernel basis", () => {
  it("full column rank ⇒ empty basis", () => {
    expect(nullspaceRational([[1, 0], [0, 1]])).toHaveLength(0);
  });

  it("[[1,1]] ⇒ 1-dim kernel spanned by (−1, 1)", () => {
    const b = nullspaceRational([[1, 1]]);
    expect(b).toHaveLength(1);
    expect(dot([1, 1], b[0])).toBeLessThan(1e-12);
  });

  it("[[1,0,−1],[0,1,−1]] ⇒ 1-dim kernel spanned by (1,1,1)", () => {
    const A = [[1, 0, -1], [0, 1, -1]];
    const b = nullspaceRational(A);
    expect(b).toHaveLength(1);
    for (const row of A) expect(dot(row, b[0])).toBeLessThan(1e-12);
  });

  it("complex entries: [[1, i]] ⇒ kernel (−i, 1)", () => {
    const A = [[1, { re: 0, im: 1 }]];
    const b = nullspaceRational(A);
    expect(b).toHaveLength(1);
    expect(dot(A[0], b[0])).toBeLessThan(1e-12);
    // the basis vector is (−i, 1): v0 = −i, v1 = 1.
    expect(Math.hypot(b[0][0].re - 0, b[0][0].im - -1)).toBeLessThan(1e-12);
    expect(Math.hypot(b[0][1].re - 1, b[0][1].im - 0)).toBeLessThan(1e-12);
  });

  it("a 2-dim kernel: [[1,1,1,1]] over 4 columns ⇒ 3 basis vectors, all annihilated", () => {
    const A = [[1, 1, 1, 1]];
    const b = nullspaceRational(A);
    expect(b).toHaveLength(3);
    for (const v of b) expect(dot(A[0], v)).toBeLessThan(1e-12);
  });
});

describe("bivariate content / primitive part in a chosen variable", () => {
  it("content_x( y·(x²+1) ) = y,  primitive = x²+1", () => {
    const f = y.mul(x.pow(2).add(I(1)));
    expect(eqPoly(bivariateContent(f, "x"), y)).toBe(true);
    expect(eqPoly(bivariatePrimitivePart(f, "x"), x.pow(2).add(I(1)))).toBe(true);
  });

  it("content_x( (y+1)·(x−y) ) = y+1,  primitive = x−y", () => {
    const f = y.add(I(1)).mul(x.sub(y));
    expect(eqPoly(bivariateContent(f, "x"), y.add(I(1)))).toBe(true);
    expect(eqPoly(bivariatePrimitivePart(f, "x"), x.sub(y))).toBe(true);
  });

  it("an x-primitive input has unit content and is returned unchanged", () => {
    const f = x.pow(2).sub(y.pow(2)); // x² − y²
    expect(bivariateContent(f, "x").vars().size).toBe(0); // a unit
    expect(eqPoly(bivariatePrimitivePart(f, "x"), f)).toBe(true);
  });
});

describe("squarefree-in-x test (Gao's gcd(f, f_x) = 1 precondition)", () => {
  it("x² − y² is squarefree in x", () => {
    expect(bivariateSquarefreeInX(x.pow(2).sub(y.pow(2)), "x")).toBe(true);
  });
  it("(x − y)² is NOT squarefree in x", () => {
    expect(bivariateSquarefreeInX(x.sub(y).pow(2), "x")).toBe(false);
  });
  it("x² + 1 (free of y) is squarefree in x", () => {
    expect(bivariateSquarefreeInX(x.pow(2).add(I(1)), "x")).toBe(true);
  });
  it("(y+1)·(x−y) is squarefree in x (the repeated factor is pure-y content, not an x-repeat)", () => {
    expect(bivariateSquarefreeInX(y.add(I(1)).mul(x.sub(y)), "x")).toBe(true);
  });
});
