import { describe, expect, it } from "vitest";
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { CANONICAL, SCHEMA_ID } from "@cas/interchange";
import { COMPLEX_SINGLE_GLSL, DF64_GLSL } from "@cas/gpu/glsl";
import { makeUnboundedLaurentSchwarz } from "@cas/schwarz";

// P0 scaffold: prove the Riemann-map app can consume every shared package it depends on, exercising the
// exact capabilities the plan leans on — a user map compiled+evaluated via @cas/expr, root-finding via
// @cas/core, the GLSL stdlib via @cas/gpu, the hand-off contract via @cas/interchange, and (the piece
// most specific to this tool) a numerical Riemann-map inverse φ⁻¹ via @cas/schwarz.

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

  it("@cas/schwarz gives a numerical Riemann-map inverse φ⁻¹ (deltoid φ = z + 1/(2z²))", () => {
    // Deltoid Laurent coefficients: φ(z) = c·z + Σ_l F[l]/z^l with c = 1, F = [0, 0, 1/2].
    const schwarz = makeUnboundedLaurentSchwarz(1, [
      [0, 0],
      [0, 0],
      [0.5, 0],
    ]);
    const z: ComplexTuple = [2, 0]; // exterior point (|z| > 1)
    const w = schwarz.evalPhi(z); // 2 + 0.5/4 = 2.125
    expect(w[0]).toBeCloseTo(2.125, 10);
    const back = schwarz.invertPhi(w); // exterior-branch inverse must recover z
    if (!back) throw new Error("invertPhi returned null on an exterior point");
    expect(back[0]).toBeCloseTo(2, 8);
    expect(back[1]).toBeCloseTo(0, 8);
  });
});
