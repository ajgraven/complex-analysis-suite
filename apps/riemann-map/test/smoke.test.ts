import { describe, expect, it } from "vitest";
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { CANONICAL, SCHEMA_ID } from "@cas/interchange";
import { COMPLEX_SINGLE_GLSL, DF64_GLSL } from "@cas/gpu/glsl";
import { CD_TO_RM_BOTTCHER_LINK } from "@cas/interchange";
import { importExteriorMap } from "../src/interchange/importMap.js";

// P0 scaffold: prove the Riemann-map app can consume every shared package it depends on, exercising the
// exact capabilities the plan leans on — a user map compiled+evaluated via @cas/expr, root-finding via
// @cas/core, the GLSL stdlib via @cas/gpu, and the map hand-off via @cas/interchange (the piece most
// specific to this tool now: RM IMPORTS another tool's conformal map rather than computing dynamics).

describe("riemann-map scaffold — shared-package wiring", () => {
  it("@cas/expr compiles & evaluates a user map (Joukowski z + 1/z)", () => {
    const phi = makeComplexFn(parse("z + 1/z"));
    const [re, im] = phi([2, 0], [0, 0]); // 2 + 1/2
    expect(re).toBeCloseTo(2.5, 12);
    expect(im).toBeCloseTo(0, 12);
  });

  it("@cas/core Durand-Kerner finds the roots of the monic z^2 - 2 (±√2)", () => {
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

  it("@cas/gpu provides the complex + df64 GLSL stdlib", () => {
    expect(COMPLEX_SINGLE_GLSL.length).toBeGreaterThan(0);
    expect(DF64_GLSL.length).toBeGreaterThan(0);
  });

  it("@cas/interchange hand-off: imports another tool's exterior map (the CD→RM golden)", () => {
    const m = importExteriorMap(CD_TO_RM_BOTTCHER_LINK);
    if (!m) throw new Error("importExteriorMap returned null on the cross-app golden");
    expect(m.app).toBe("complex-dynamics");
    expect(m.lead).toEqual([1, 0]); // γ₁ = 1 (the deltoid ψ(w) = w + ½·w⁻²)
    expect(m.coeffs).toEqual([[0, 0], [0, 0], [0.5, 0]]);
  });
});
