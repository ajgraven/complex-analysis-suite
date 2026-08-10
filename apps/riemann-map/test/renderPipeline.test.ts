import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { compileF } from "@cas/expr/glsl";
import { buildProbeGLSL, DUAL_BACKEND_CORPUS } from "@cas/gpu/dual-backend";

// P0 seed for the dual render pipeline (S3/S4) and the GLSL≈JS parity guard (S5). The tool's whole
// rendering rests on ONE source of truth producing BOTH a JS evaluator (curve pushforward, orbits,
// tests) and a GLSL body (per-pixel shader). Here we prove both backends are reachable from one parsed
// map, and that the shared dual-backend harness — which will assert the two AGREE once real shaders
// exist — is wired. The actual GLSL-vs-JS EXECUTION runs in the CI `browser` job (real WebGL2), added
// alongside the first shaders in P1.

describe("riemann-map — one map, two backends (S3/S4) + parity harness (S5)", () => {
  it("compiles one parsed φ into BOTH a JS evaluator and a GLSL body", () => {
    const ast = parse("z + 1/z");

    // JS backend.
    const phi = makeComplexFn(ast);
    const [re, im] = phi([2, 0], [0, 0]);
    expect(re).toBeCloseTo(2.5, 12);
    expect(im).toBeCloseTo(0, 12);

    // GLSL backend — same AST.
    const glsl = compileF(ast);
    expect(glsl).toMatch(/\bfFn\b/); // the emitted function name
    expect(glsl).toContain("cvec"); // written in the abstract complex-vector type
    expect(glsl.length).toBeGreaterThan(20);
  });

  it("the @cas/gpu dual-backend parity harness is importable (execution is the CI browser job)", () => {
    expect(typeof buildProbeGLSL).toBe("function");
    expect(Array.isArray(DUAL_BACKEND_CORPUS)).toBe(true);
    expect(DUAL_BACKEND_CORPUS.length).toBeGreaterThan(0);
  });
});
