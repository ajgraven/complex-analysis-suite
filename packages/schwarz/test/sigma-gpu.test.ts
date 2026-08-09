import { describe, expect, it } from "vitest";
import {
  MAX_BRANCHES,
  MAX_K,
  MAX_LAURENT,
  SIGMA_CONSTS_GLSL,
  buildSigmaProbeGLSL,
  packPhi,
} from "../src/gpu/index.js";
import type { Complex } from "../src/index.js";

// NODE-side guard for the GPU σ evaluator (S4b). The float32 NUMERIC parity — GPU σ(w) vs the CPU
// engine — is test/sigma-gpu.browser.test.ts (a real WebGL2 context, `pnpm test:browser`). This half,
// which runs in the default gate WITHOUT a GPU, pins what a node test structurally can:
//   · the shader is the SPECIALIZED family-1 cut (has the unbounded-Laurent math, NOT QD's other five
//     families) — a drift that dragged an LQD/singular/β term back in would fail here;
//   · the JS-side uniform packing (packPhi) is byte-correct, since a mis-packed uniform silently feeds
//     the GPU the wrong φ and the browser test can't tell that from a codegen bug.

describe("@cas/schwarz/gpu σ shader — the specialized unbounded-Laurent cut (node guard)", () => {
  const frag = buildSigmaProbeGLSL();

  it("assembles the family-1 σ evaluator — φ, φ', F, the inverse, and σ itself", () => {
    for (const fn of [
      "void branchPhi", // out-param form (φ and φ' in one pass)
      "vec2 branchSchwarz",
      "vec2 evalPhi(",
      "vec2 evalPhiDeriv(",
      "vec2 evalF(",
      "vec2 evalFDeriv(",
      "vec2 invertPhi(",
      "vec2 newtonSeedFresh(",
      "bool acceptZ(",
      "vec2 sigma(",
    ]) {
      expect(frag, fn).toContain(fn);
    }
    // The load-bearing family-1 formula fragments: φ's leading c·z, and F's anti-holomorphic
    // conj(F[l])·zˡ (the Schwarz reflection). A dropped conj here is exactly the silent factor bug
    // the honest-labeling guardrail exists to prevent.
    expect(frag).toContain("u_c * z");
    expect(frag).toContain("cconj(u_polyA[l])");
    expect(frag).toContain("uniform vec2 uW;");
    // F''s leading −c/z² term (S5-B2 distance estimator). A sign/term error here is exactly the kind of
    // silent derivative bug the CPU finite-difference golden + the GPU↔CPU parity net guard against.
    expect(frag).toContain("-u_c * cmul(zInv, zInv)");
  });

  it("is the SPECIALIZED cut — none of QD's other five families rode along (ADR-0007)", () => {
    // The QD shader dispatches six families on u_family and carries bounded/LQD/singular/β machinery.
    // CD reconstructs only the unbounded-Laurent family, so none of that vocabulary may appear here.
    for (const forbidden of [
      "u_family",
      "u_w0",
      "u_unbounded",
      "u_gamma",
      "u_lqdBeta",
      "cexp",
      "blaschke",
      "evalBOverZ",
    ]) {
      expect(frag, `must NOT contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("bakes the compile-time caps as GLSL constants matching the JS packing (and QD's caps)", () => {
    // These MUST equal QD's Schwarz._gpuCaps so a φ that fits QD's GPU path fits this one too.
    expect([MAX_BRANCHES, MAX_K, MAX_LAURENT]).toEqual([12, 8, 12]);
    expect(SIGMA_CONSTS_GLSL).toContain(`const int   MAX_BRANCHES = ${MAX_BRANCHES};`);
    expect(SIGMA_CONSTS_GLSL).toContain(`const int   MAX_K        = ${MAX_K};`);
    expect(SIGMA_CONSTS_GLSL).toContain(`const int   MAX_LAURENT  = ${MAX_LAURENT};`);
  });
});

describe("@cas/schwarz/gpu packPhi — φ → fixed-size uniform arrays (pure, node)", () => {
  const F: Complex[] = [
    [1, 2],
    [3, 4],
  ];
  const branches = [
    { z: [0.2, 0.1] as Complex, A: [[0.5, 0.6] as Complex] },
    { z: [-0.3, 0] as Complex, A: [[1, 0] as Complex, [0, 1] as Complex] },
  ];

  it("packs c / Laurent / branches at the right offsets, zero-filled to the caps", () => {
    const p = packPhi({ c: 2, F, branches });

    expect(p.c).toBe(2);
    expect(p.polyALen).toBe(2);
    expect(p.nBranches).toBe(2);

    // Fixed-size arrays sized exactly to the shader's uniform arrays.
    expect(p.polyA.length).toBe(MAX_LAURENT * 2);
    expect(p.branchZ.length).toBe(MAX_BRANCHES * 2);
    expect(p.branchA.length).toBe(MAX_BRANCHES * MAX_K * 2);
    expect(p.branchACount.length).toBe(MAX_BRANCHES);

    // Laurent coefficients, interleaved (re, im); the tail is zero.
    expect(p.polyA[0]).toBeCloseTo(1, 6);
    expect(p.polyA[1]).toBeCloseTo(2, 6);
    expect(p.polyA[2]).toBeCloseTo(3, 6);
    expect(p.polyA[3]).toBeCloseTo(4, 6);
    expect(p.polyA[4]).toBe(0);

    // Branch pole locations z_j.
    expect(p.branchZ[0]).toBeCloseTo(0.2, 6);
    expect(p.branchZ[1]).toBeCloseTo(0.1, 6);
    expect(p.branchZ[2]).toBeCloseTo(-0.3, 6);
    expect(p.branchZ[3]).toBe(0);

    // Per-branch order.
    expect(Array.from(p.branchACount)).toEqual([1, 2, ...Array(MAX_BRANCHES - 2).fill(0)]);

    // Branch coefficients A_{j,k}: branch 0 at flat index j*MAX_K+k = 0; branch 1 at 8, 9.
    expect(p.branchA[2 * 0]).toBeCloseTo(0.5, 6); // A_{0,1}.re
    expect(p.branchA[2 * 0 + 1]).toBeCloseTo(0.6, 6); // A_{0,1}.im
    expect(p.branchA[2 * (1 * MAX_K + 0)]).toBeCloseTo(1, 6); // A_{1,1}.re
    expect(p.branchA[2 * (1 * MAX_K + 0) + 1]).toBe(0); // A_{1,1}.im
    expect(p.branchA[2 * (1 * MAX_K + 1)]).toBe(0); // A_{1,2}.re
    expect(p.branchA[2 * (1 * MAX_K + 1) + 1]).toBeCloseTo(1, 6); // A_{1,2}.im
  });

  it("a pole-free φ (no branches) packs to zero branches", () => {
    const p = packPhi({ c: 1, F: [[0.5, 0]] });
    expect(p.nBranches).toBe(0);
    expect(Array.from(p.branchACount)).toEqual(Array(MAX_BRANCHES).fill(0));
    expect(p.branchA.every((x) => x === 0)).toBe(true);
  });

  it("throws when a dimension exceeds its cap (CD falls back to CPU, as QD's setPhi does)", () => {
    const long: Complex[] = Array.from({ length: MAX_LAURENT + 1 }, () => [0, 0]);
    expect(() => packPhi({ c: 1, F: long })).toThrow(/Laurent length/);

    const manyBranches = Array.from({ length: MAX_BRANCHES + 1 }, () => ({
      z: [0.1, 0] as Complex,
      A: [[0.1, 0] as Complex],
    }));
    expect(() => packPhi({ c: 1, F: [], branches: manyBranches })).toThrow(/branches/);

    const deepBranch = [{ z: [0.1, 0] as Complex, A: Array.from({ length: MAX_K + 1 }, () => [0.1, 0] as Complex) }];
    expect(() => packPhi({ c: 1, F: [], branches: deepBranch })).toThrow(/MAX_K/);
  });
});
