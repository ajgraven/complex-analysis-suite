// Roadmap #19 (n-variate factorizer) Phase 1 — the exact-ℚ(i) infrastructure the reduction-to-univariate +
// iterated-Hensel-lift method builds on (docs/NVARIATE_FACTORING.md): multivariate content / primitive part
// / squarefree part in a chosen main variable, a main-variable chooser, and the univariate evaluation-point
// search. Pure engine. The P0 spike validated the design these support.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const {
  MPoly, multivariateContent, multivariatePrimitivePart, multivariateSquarefreeInX,
  multivariateSquarefreePart, nvarMainVariable, nvarEvaluationPoint,
} = S;

const x = MPoly.variable("x");
const y = MPoly.variable("y");
const z = MPoly.variable("z");
const I = (k: number) => MPoly.fromInt(k);
const eq = (a: any, b: any): boolean => a.sub(b).isZero();

describe("multivariate content / primitive part in a main variable (trivariate)", () => {
  it("content_x( y·z·(x²+1) ) = y·z,  primitive = x²+1", () => {
    const f = y.mul(z).mul(x.pow(2).add(I(1)));
    expect(eq(multivariateContent(f, "x"), y.mul(z))).toBe(true);
    expect(eq(multivariatePrimitivePart(f, "x"), x.pow(2).add(I(1)))).toBe(true);
  });
  it("an x-primitive trivariate (x²−y·z) has unit content and is unchanged", () => {
    const f = x.pow(2).sub(y.mul(z));
    expect(multivariateContent(f, "x").vars().size).toBe(0);   // a unit
    expect(eq(multivariatePrimitivePart(f, "x"), f)).toBe(true);
  });
});

describe("squarefree test + squarefree part in a main variable", () => {
  it("x² − y·z is squarefree in x; (x−y)²·(x+z) is NOT", () => {
    expect(multivariateSquarefreeInX(x.pow(2).sub(y.mul(z)), "x")).toBe(true);
    expect(multivariateSquarefreeInX(x.sub(y).pow(2).mul(x.add(z)), "x")).toBe(false);
  });
  it("squarefree part of (x−y)²·(x+z) in x = (x−y)·(x+z)", () => {
    const f = x.sub(y).pow(2).mul(x.add(z));
    expect(eq(multivariateSquarefreePart(f, "x"), x.sub(y).mul(x.add(z)))).toBe(true);
  });
  it("a squarefree input is returned unchanged", () => {
    const f = x.pow(2).sub(y.mul(z));
    expect(eq(multivariateSquarefreePart(f, "x"), f)).toBe(true);
  });
});

describe("main-variable choice (prefers a monic variable, then smaller degree)", () => {
  it("x² − y·z → 'x' (the only monic variable)", () => {
    expect(nvarMainVariable(x.pow(2).sub(y.mul(z)))).toBe("x");
  });
  it("y·x² − z → 'z' (monic in z, degree 1; x has leading coeff y, not constant)", () => {
    expect(nvarMainVariable(y.mul(x.pow(2)).sub(z))).toBe("z");
  });
  it("a constant has no main variable", () => {
    expect(nvarMainVariable(I(3))).toBe(null);
  });
});

describe("univariate evaluation-point search (degree-preserving + squarefree)", () => {
  const sqfreeInX = (g: any): boolean =>
    !g.derivativeIn("x").isZero() && S.univariateGCD(g, g.derivativeIn("x"), "x").degreeIn("x") === 0;

  it("x² − y·z: finds a point with a degree-2 squarefree univariate, substituting back exactly", () => {
    const f = x.pow(2).sub(y.mul(z));
    const r = nvarEvaluationPoint(f, "x");
    expect(r.ok).toBe(true);
    expect(r.f0.degreeIn("x")).toBe(2);
    expect(sqfreeInX(r.f0)).toBe(true);
    // the returned point substitutes back into f to give exactly f0
    const sub: any = {};
    for (const p of r.point) sub[p.var] = MPoly.constant(p.value);
    expect(eq(f.subst(sub), r.f0)).toBe(true);
    expect(new Set(r.point.map((p: any) => p.var))).toEqual(new Set(["y", "z"]));
  });

  it("z·x² + x + 1: skips the degree-dropping z=0 and keeps x-degree 2", () => {
    const f = z.mul(x.pow(2)).add(x).add(I(1));
    const r = nvarEvaluationPoint(f, "x");
    expect(r.ok).toBe(true);
    expect(r.f0.degreeIn("x")).toBe(2);        // NOT the degree-1 z=0 specialization
    expect(sqfreeInX(r.f0)).toBe(true);
  });

  it("a univariate input (x²−1, no other variables) passes through with an empty point", () => {
    const r = nvarEvaluationPoint(x.pow(2).sub(I(1)), "x");
    expect(r.ok).toBe(true);
    expect(r.point).toHaveLength(0);
    expect(eq(r.f0, x.pow(2).sub(I(1)))).toBe(true);
  });

  it("rejects a variable of no positive degree", () => {
    expect(nvarEvaluationPoint(x.pow(2).sub(y.mul(z)), "w").ok).toBe(false);
  });
});
