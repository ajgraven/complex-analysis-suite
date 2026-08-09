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
    expect(frag).toContain("cmul(u_c, z)"); // φ's leading c·z (u_c is a complex vec2 since S5-C1)
    expect(frag).toContain("cconj(u_polyA[l])");
    expect(frag).toContain("uniform vec2 uW;");
    expect(frag).toContain("uniform vec2  u_c;"); // complex leading coefficient (S5-C1)
    // F reflects the leading term to conj(c)/z — the S5-C1 correctness point (= c/z only for real c); a
    // dropped cconj here fails the boundary-reflection golden on the CPU and the GPU↔CPU parity net.
    expect(frag).toContain("cmul(cconj(u_c), cinv(z))");
    // F''s leading −conj(c)/z² term (S5-B2 distance estimator + S5-C1 conj). A sign/term error here is the
    // kind of silent derivative bug the CPU finite-difference golden + the GPU↔CPU parity net guard against.
    expect(frag).toContain("cmul(vec2(-u_c.x, u_c.y), cmul(zInv, zInv))");
  });

  it("carries the unbounded + bounded families only — QD's LQD/PQD/singular/β machinery did NOT ride along", () => {
    // The shader now dispatches TWO families on u_family: unbounded-Laurent (0) and bounded (1, S5-C2). It
    // must still carry NONE of QD's remaining four families (the power-weighted / log / singular variants).
    for (const forbidden of ["u_gamma", "u_lqdBeta", "u_alpha", "cexp", "blaschke", "evalBOverZ", "cpow"]) {
      expect(frag, `must NOT contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("dispatches the bounded family (S5-C2): u_family / u_w0, conj(w₀) in F, and the interior-branch accept", () => {
    expect(frag).toContain("uniform int   u_family;");
    expect(frag).toContain("uniform vec2  u_w0;");
    // φ = w₀ + branches, F = conj(w₀) + branches, and the inverse accepts the INTERIOR branch |z| < 1.
    expect(frag).toContain("(u_family == 1) ? u_w0 : cmul(u_c, z)");
    expect(frag).toContain("(u_family == 1) ? cconj(u_w0) : cmul(cconj(u_c), cinv(z))");
    expect(frag).toContain("length(z) < 1.0 - 1e-4"); // bounded interior-branch acceptance
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

    expect(p.c).toEqual([2, 0]); // real c packs to the [re, im] tuple uploaded to the vec2 u_c (S5-C1)
    expect(packPhi({ c: [1, 0.5], F, branches }).c).toEqual([1, 0.5]); // a complex c packs through unchanged
    expect(p.family).toBe(0); // default family is unbounded (S5-C2)
    expect(p.w0).toEqual([0, 0]);
    expect(p.polyALen).toBe(2);
    expect(p.nBranches).toBe(2);

    // A bounded φ packs family=1 + its centre w₀ (S5-C2).
    const b = packPhi({ family: "bounded", w0: [0.1, -0.2], branches });
    expect(b.family).toBe(1);
    expect(b.w0).toEqual([0.1, -0.2]);
    expect(b.polyALen).toBe(0); // bounded has no Laurent tail

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
