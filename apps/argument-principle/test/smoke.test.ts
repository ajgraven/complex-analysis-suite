import { describe, expect, it } from "vitest";
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { CANONICAL, SCHEMA_ID } from "@cas/interchange";

// P0 scaffold: prove the Argument Principle app can consume every shared package it depends on, exercising
// the exact capabilities the plan leans on — a user f(z) compiled + evaluated via @cas/expr, and exact
// rational root-finding via @cas/core (the Phase-2 zero/pole finder). The @cas/interchange hand-off
// (importing an f(z) from a sibling tool) and @cas/export land in Phase 3, so this pins the schema id only.

describe("argument-principle scaffold — shared-package wiring", () => {
  it("@cas/expr compiles & evaluates a user f(z) (z + 1/z at z = 2 → 2.5)", () => {
    const f = makeComplexFn(parse("z + 1/z"));
    const [re, im] = f([2, 0], [0, 0]);
    expect(re).toBeCloseTo(2.5, 12);
    expect(im).toBeCloseTo(0, 12);
  });

  it("@cas/expr evaluates the default preset z³ − 1 (a root at z = 1 → 0)", () => {
    const f = makeComplexFn(parse("z*z*z - 1"));
    const [re, im] = f([1, 0], [0, 0]);
    expect(re).toBeCloseTo(0, 12);
    expect(im).toBeCloseTo(0, 12);
  });

  it("@cas/core Durand-Kerner finds the roots of the monic z² − 2 (±√2)", () => {
    const alg = tupleAlgebra;
    const dk = makeDurandKerner(alg);
    const evalMonic = (z: ComplexTuple): ComplexTuple => alg.sub(alg.mul(z, z), alg.make(2, 0));
    const res = dk(evalMonic, [alg.make(0.7, 0.4), alg.make(-0.6, -0.5)]);
    if (!res) throw new Error("Durand-Kerner returned null");
    expect(res.converged).toBe(true);
    const reals = res.roots.map((r) => r[0]).sort((a, b) => a - b);
    expect(reals[0]).toBeCloseTo(-Math.SQRT2, 6);
    expect(reals[1]).toBeCloseTo(Math.SQRT2, 6);
  });

  it("@cas/interchange exposes the canonical conventions + schema id", () => {
    expect(SCHEMA_ID).toContain("interchange");
    expect(CANONICAL).toBeTruthy();
  });
});
