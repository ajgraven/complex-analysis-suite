import { describe, expect, it } from "vitest";
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { CANONICAL, SCHEMA_ID } from "@cas/interchange";
import { DF64_GLSL } from "@cas/gpu/glsl";

// P6-C1 scaffold: prove the correspondence app can consume all four shared packages the runbook says
// it depends on. Milestone A builds directly on exactly these — branch enumeration via @cas/core's
// Durand-Kerner, the map via @cas/expr, the σ hand-off via @cas/interchange, the render via @cas/gpu.

describe("correspondences scaffold — shared-package wiring", () => {
  it("@cas/core Durand-Kerner finds the roots of the monic z^2 - 1", () => {
    const alg = tupleAlgebra;
    const dk = makeDurandKerner(alg);
    const evalMonic = (z: ComplexTuple): ComplexTuple => alg.sub(alg.mul(z, z), alg.make(1, 0));
    // Seeds off the real axis so the symmetric pair ±1 does not stall.
    const res = dk(evalMonic, [alg.make(0.5, 0.3), alg.make(-0.4, -0.6)]);
    if (!res) throw new Error("Durand-Kerner returned null");
    expect(res.converged).toBe(true);
    const reals = res.roots.map((r) => r[0]).sort((a, b) => a - b);
    expect(reals[0]).toBeCloseTo(-1, 6);
    expect(reals[1]).toBeCloseTo(1, 6);
    for (const r of res.roots) expect(Math.hypot(r[0], r[1])).toBeCloseTo(1, 6);
  });

  it("@cas/expr evaluates the deltoid Laurent map φ(z) = z + 1/(2 z^2)", () => {
    const phi = makeComplexFn(parse("z + 1/(2*z^2)"));
    const v = phi([1, 0], [0, 0]); // 1 + 1/2
    expect(v[0]).toBeCloseTo(1.5, 12);
    expect(v[1]).toBeCloseTo(0, 12);
  });

  it("@cas/interchange exposes the canonical conventions + schema id", () => {
    expect(SCHEMA_ID).toContain("interchange");
    expect(CANONICAL).toBeTruthy();
  });

  it("@cas/gpu provides the df64 GLSL stdlib", () => {
    expect(DF64_GLSL.length).toBeGreaterThan(0);
  });
});
