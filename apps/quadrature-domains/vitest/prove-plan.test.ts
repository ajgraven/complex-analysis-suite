// =============================================================================
// prove-plan — the pure existence/uniqueness proof ENGINE extracted from algebra-ui's
// doCertifyUnivalence (fuller-orchestrator Phase A; docs/algebra-review/ORCHESTRATOR_REDESIGN.md).
//
// Phase A is a NO-BEHAVIOR-CHANGE extraction, so this is the safety net that locks the moved
// logic byte-for-byte before Phases B–E build on it. Three layers:
//   (1) the pure per-solution helpers (reconstructPhi / poleSubst / nodeInsideDisk / gaugeQuotient)
//       on hand-built + real-engine inputs;
//   (2) a CHARACTERIZATION of assembleVerdict — the risky verdict-string assembly — with fake
//       minimal deps, so every verdict shape is pinned deterministically;
//   (3) runCertifyPlan's control flow (regime short-circuits + a full zero-dim pass) with fake
//       injected ops, plus one REAL-seed disk end-to-end that must read "Unique quadrature domain ✓".
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/faber-analysis.mjs";      // Durand–Kerner (solveZeroDim / certified solve)
import "../app/qd-equations.mjs";        // QDEquations (QE)
import "../app/qd-constraints.mjs";      // QDConstraints (QC): phiPrimeNumerator, boundaryDoublePointCount
import "../app/algebra/algebra-store.mjs";
import * as PROVE from "../app/algebra/prove-plan.mjs";

const QD: any = _QD;
const QE: any = QD.QDEquations;
const QC: any = QD.QDConstraints;
const AS: any = QD.AlgebraStore;

// The unit disk h = 1/w: one simple pole a=0, principal part {1}. Its unique bounded QD is the
// disk itself, φ = identity (w0=0, z1=0, A_{1,1}=1). (Same fixture as qd-verify-exact.)
const diskH = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
const identityPhi = { unbounded: false, family: "boundedQD", w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }] }] };

// A reim solution literal in the engine's shape: each coordinate is a complex {re, im}; a real
// solution carries im=0 (the engine's real-filter requires |im|<1e-4 on every coordinate).
const sol = (m: Record<string, number>) => {
  const out: any = {};
  for (const k of Object.keys(m)) out[k + "__re"] = { re: m[k], im: 0 };
  return out;
};

describe("prove-plan (1) pure per-solution helpers", () => {
  it("reconstructPhi rebuilds a boundedQD φ from a reim solution (disk identity)", () => {
    const phi = PROVE.reconstructPhi(sol({ w0: 0, z1: 0, A1_1: 1 }), diskH, { known: {} });
    expect(phi).toBeTruthy();
    expect(phi.family).toBe("boundedQD");
    expect(phi.w0).toEqual({ re: 0, im: 0 });
    expect(phi.branches).toHaveLength(1);
    expect(phi.branches[0].z).toEqual({ re: 0, im: 0 });
    expect(phi.branches[0].A[0]).toEqual({ re: 1, im: 0 });
  });

  it("reconstructPhi reads a fixed φ(0) from deps.w0Fixed when w0 is not a solved var", () => {
    const phi = PROVE.reconstructPhi(sol({ z1: 0, A1_1: 1 }), diskH, { known: {}, w0Fixed: { approx: { re: 0, im: 0 } } });
    expect(phi).toBeTruthy();
    expect(phi.w0).toEqual({ re: 0, im: 0 });
  });

  it("reconstructPhi returns null when a map variable is missing (eliminated, no known value)", () => {
    expect(PROVE.reconstructPhi(sol({ w0: 0, A1_1: 1 }), diskH, { known: {} })).toBeNull(); // no z1
  });

  it("poleSubst builds the exact barred substitution {z̄1, Ā_{1,1}} over ℚ(i) (real engine)", () => {
    const deps = { QE, QC, QD, known: {}, caps: { maxPoleOrder: 6 } };
    const subMap = PROVE.poleSubst(sol({ w0: 0, z1: 0, A1_1: 1 }), diskH, deps);
    expect(subMap).toBeTruthy();
    expect(subMap["zb1"]).toBeTruthy();
    expect(subMap["Ab1_1"]).toBeTruthy();
  });

  it("nodeInsideDisk gates |z_j|≥1: interior passes, exterior is an offender (real engine)", () => {
    const deps = { QE, QC, QD, known: {}, caps: { maxPoleOrder: 6 } };
    expect(PROVE.nodeInsideDisk(sol({ z1: 0 }), diskH, deps)).toEqual({ insideAll: true, offenders: [] });
    const out = PROVE.nodeInsideDisk(sol({ z1: 2 }), diskH, deps);      // z1 = 2 ⇒ pole in 𝔻
    expect(out.insideAll).toBe(false);
    expect(out.offenders[0].j).toBe(1);
  });

  it("gaugeQuotient collapses same-domain φ's (fake sameDomain) and counts the merges", () => {
    const a = { id: "A" }, b = { id: "A" }, c = { id: "C" };  // a,b same domain
    const deps = { QD: { sameDomain: (x: any, y: any) => x.id === y.id } };
    const q = PROVE.gaugeQuotient([a, b, c], deps);
    expect(q.distinct).toHaveLength(2);
    expect(q.gaugeMerged).toBe(1);
  });
});

// Fake minimal deps: no Sym ⇒ reconcile falls back; no QE.residualAtSolution ⇒ cross-check
// not run; a trivial sameDomain. This isolates the verdict-STRING assembly (the riskiest piece).
const fakeDeps = (w0Fixed = false) => ({ QD: { sameDomain: (x: any, y: any) => x === y }, QE: {}, w0Fixed, caps: {} });
const noSlice = () => "";
const leafClean = (over: any = {}) => Object.assign({ folded: 0, selfInt: 0, unrec: 0, poleOut: 0, allExactFilter: true, allExactVerified: true, rows: [] }, over);

describe("prove-plan (2) assembleVerdict characterization (locks the verdict strings)", () => {
  it("unique + a gauge copy merged, certified & exact", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }], gaugeMerged: 1, leaf: leafClean(),
      cl: { realCount: 2, complexCount: 2 }, real: [{}, {}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.verdict).toBe(
      "Unique quadrature domain ✓ — 1 genuine QD of 2 real solutions (1 gauge/rotation copy merged). · real-solution count + locations certified (RUR + exact Sturm) · exact ℚ(i) root — univalence certified at the true algebraic root · class: classical bounded quadrature domains, up to the rotation gauge",
    );
    expect(asm.rigor).toBe("exact");
    expect(asm.count).toBe(1);
    expect(asm.bad).toBe(false);
  });

  it("no genuine QD (a fold rejected), certified", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [], gaugeMerged: 0, leaf: leafClean({ folded: 1 }),
      cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.verdict).toBe("No genuine quadrature domain: 1 real algebraic solution, none univalent (1 fold rejected).");
    expect(asm.rigor).toBe("exact");
    expect(asm.bad).toBe(true);
  });

  it("multiple distinct QDs, certified & exact", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }, { k: 2 }], gaugeMerged: 0, leaf: leafClean(),
      cl: { realCount: 2 }, real: [{}, {}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.verdict).toBe(
      "2 distinct quadrature domains of 2 real solutions. · real-solution count + locations certified (RUR + exact Sturm) · exact ℚ(i) root — univalence certified at the true algebraic root · class: classical bounded quadrature domains, up to the rotation gauge",
    );
    expect(asm.rigor).toBe("exact");
    expect(asm.count).toBe(2);
  });

  it("a numeric fold fallback (allExactFilter=false) downgrades the rigor to estimate", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }], gaugeMerged: 0, leaf: leafClean({ allExactFilter: false, allExactVerified: false }),
      cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.rigor).toBe("estimate");
    // No "exact ℚ(i) root" clause when the filter wasn't fully exact.
    expect(asm.verdict).not.toContain("exact ℚ(i) root");
  });

  it("the injected sliceCaveat is appended verbatim (honest slice labeling preserved)", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }], gaugeMerged: 0, leaf: leafClean(),
      cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: () => "  [on the real slice only — LOWER BOUND.]", oracle: null,
    });
    expect(asm.verdict.endsWith("  [on the real slice only — LOWER BOUND.]")).toBe(true);
  });

  it("the w₀-pinned class note states the containment restriction", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }], gaugeMerged: 0, leaf: leafClean(),
      cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
      deps: fakeDeps(true), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.verdict).toContain("up to the rotation gauge (among domains whose interior contains the fixed w₀)");
  });
});

describe("prove-plan (3) runCertifyPlan control flow (fake injected ops)", () => {
  const base = (over: any) => Object.assign({
    hData: diskH, deps: fakeDeps(), oracle: null, sliceCaveat: noSlice, posDimDesc: () => "3 real variables",
    classify: async () => ({ ok: true, zeroDim: true, realCount: 0 }),
    solveCertified: async () => ({ ok: false }),
    solveNumeric: async () => ({ ok: true, solutions: [] }),
  }, over);

  it("inconsistent ⇒ 'No quadrature domain … inconsistent (1 ∈ I)'", async () => {
    const pr = await PROVE.runCertifyPlan(base({ classify: async () => ({ ok: true, inconsistent: true }) }));
    expect(pr.kind).toBe("inconsistent");
    expect(pr.verdict).toBe("No quadrature domain: the system is inconsistent (1 ∈ I).");
    expect(pr.rigor).toBe("exact");
    expect(pr.bad).toBe(true);
  });

  it("positive-dimensional ⇒ underdetermined + posDimDesc", async () => {
    const pr = await PROVE.runCertifyPlan(base({ classify: async () => ({ ok: true, zeroDim: false }) }));
    expect(pr.kind).toBe("positive-dim");
    expect(pr.verdict).toContain("Underdetermined: a positive-dimensional family (3 real variables).");
    expect(pr.rigor).toBe("unknown");
  });

  it("zero-dim but the solver separated no real solution ⇒ 'No real quadrature domain'", async () => {
    const pr = await PROVE.runCertifyPlan(base({ classify: async () => ({ ok: true, zeroDim: true, realCount: 0, complexCount: 2 }) }));
    expect(pr.kind).toBe("no-real");
    expect(pr.verdict).toBe("No real quadrature domain (of 2 distinct complex).");
    expect(pr.rigor).toBe("exact");
  });

  it("aborted classify ⇒ kind 'aborted'; a failed classify ⇒ kind 'error' with the reason", async () => {
    expect((await PROVE.runCertifyPlan(base({ classify: async () => ({ aborted: true }) }))).kind).toBe("aborted");
    const err = await PROVE.runCertifyPlan(base({ classify: async () => ({ ok: false, reason: "over a cap" }) }));
    expect(err.kind).toBe("error");
    expect(err.reason).toBe("over a cap");
  });

  it("a full zero-dim pass (fake solve → one genuine φ via the numeric-fallback filter) ⇒ Unique", async () => {
    // deps with no Sym/critical-point/boundary machinery ⇒ certifyLeaf takes the numeric-fallback
    // path (no fold, boundary simple) and the candidate is genuine; the gauge quotient keeps 1.
    const deps = { QD: { sameDomain: () => false }, QE: {}, w0Fixed: { approx: { re: 0, im: 0 } }, caps: { maxPoleOrder: 6 } };
    const pr = await PROVE.runCertifyPlan(base({
      deps,
      classify: async () => ({ ok: true, zeroDim: true, realCount: 1 }),
      solveCertified: async () => ({ ok: true, solutions: [sol({ z1: 0, A1_1: 1 })] }),
    }));
    expect(pr.kind).toBe("zero-dim");
    expect(pr.count).toBe(1);
    expect(pr.verdict).toContain("Unique quadrature domain ✓ — 1 genuine QD of 1 real solution");
    expect(pr.rigor).toBe("estimate");   // numeric-fallback filter ⇒ not fully certified
    expect(pr.certified).toBe(true);
  });
});

describe("prove-plan (4) real-seed end-to-end: the unit disk certifies over the real engine", () => {
  it("seed → runCertifyPlan: S1 admissibility gate fires + genuine QD certified + cross-check ✓", async () => {
    const store = AS.create();
    store.seedFromSystem(QE.generateClassicalBounded(diskH, { maxPoleOrder: 6, w0: { re: 0, im: 0 } }));
    // Mirror doProveExistenceUniqueness's cheap prelude: the disk's h = 1/w is real-axis symmetric,
    // so assume the base variables real (this collapses the conjugate-model freedom = the rotation
    // gauge, without which the bare (●)/(★) system is positive-dimensional) and propagate the linear
    // cascade to a fixpoint. This is what turns the disk into a determined, zero-dimensional system.
    store.assumeReal(store.baseVariables());
    for (let i = 0; i < 4; i++) { const rp = store.reducePropagate(); if (!rp || !rp.ok) break; }
    try { store.saturateMobius(); } catch { /* best-effort, as in the app prelude */ }
    const params = { a1: { re: 0, im: 0 }, ab1: { re: 0, im: 0 }, C1_1: { re: 1, im: 0 }, Cb1_1: { re: 1, im: 0 } };
    const deps = { QE, QC, QD, known: store.knownValues(), w0Fixed: store.w0Fixed, caps: { maxPoleOrder: 6 } };
    const pr = await PROVE.runCertifyPlan({
      hData: diskH, deps,
      oracle: { numPhi: identityPhi, fixW0: true, w0Sel: { re: 0, im: 0 } },
      sliceCaveat: noSlice, posDimDesc: () => "",
      classify: async () => store.classify(null, { paramValues: params }),
      solveCertified: async () => store.solveRealCertifiedSync(null, { paramValues: params }),
      solveNumeric: async () => store.solveReal(null, { paramValues: params }),
    });
    expect(pr.kind).toBe("zero-dim");
    // S1 admissibility gate (the CRITICAL review fix) fires through the extracted engine: the two
    // |z_j| = 1 spurious solutions are rejected as a pole in 𝔻, not counted as bounded QDs.
    expect(pr.rows.filter((r: string) => r.includes("not a bounded quadrature domain"))).toHaveLength(2);
    // ≥1 genuine disk certified — exact Schur–Cohn + real-count at the true ℚ(i) root.
    expect(pr.rows.filter((r: string) => r.includes("univalent ✓ — genuine quadrature domain")).length).toBeGreaterThanOrEqual(1);
    expect(pr.count).toBeGreaterThanOrEqual(1);
    expect(pr.rigor).toBe("exact");
    // The reconstructed QD satisfies the ORIGINAL generated system (residual 0) and matches the
    // numeric solver — the reduce/solve/reconstruct chain is sound end to end.
    expect(pr.verdict).toContain("cross-check ✓");
    expect(pr.verdict).toContain("real-solution count + locations certified");
  });
});

describe("prove-plan (5) runProofTree — branch walk + pool-then-quotient (Phase B)", () => {
  // A scripted store: the fake classify/solve read the currently-entered case; fork.enter/leave
  // push/pop cases. deps use a numeric-fallback filter (no Sym/QC), so every real solution becomes a
  // genuine φ, and sameDomain compares the reconstructed A_{1,1} (two cases yielding the same A = the
  // same domain). This exercises the tree walk + aggregation deterministically, no real engine.
  const P = (A: number) => sol({ w0: 0, z1: 0, A1_1: A });
  const treeCtx = (root: any, cases: any, opts: any = {}) => {
    const stack: string[] = [];
    const cur = () => (stack.length ? cases[stack[stack.length - 1]] : root);
    return {
      hData: diskH,
      deps: { QD: { sameDomain: (x: any, y: any) => x.branches[0].A[0].re === y.branches[0].A[0].re }, QE: {}, w0Fixed: false, caps: { maxPoleOrder: 6 } },
      oracle: null, sliceCaveat: () => "", posDimDesc: () => "1 variable",
      classify: async () => cur().classify,
      solveCertified: async () => cur().solve || { ok: false },
      solveNumeric: async () => cur().solve || { ok: true, solutions: [] },
      fork: {
        detectSplits: () => (cur().splits || []).map((id: string) => ({ id })),
        enter: (c: any) => { stack.push(c.id); return true; },
        leave: () => { stack.pop(); },
      },
      ...opts,
    };
  };
  const posDim = (splits: string[]) => ({ classify: { ok: true, zeroDim: false }, splits });
  const zero = (A: number) => ({ classify: { ok: true, zeroDim: true, realCount: 1 }, solve: { ok: true, solutions: [P(A)] } });

  it("a zero-dim root needs no forking (single leaf)", async () => {
    const pr = await PROVE.runProofTree(treeCtx(zero(1), {}));
    expect(pr.kind).toBe("tree");
    expect(pr.count).toBe(1);
    expect(pr.truncated).toBe(false);
  });

  it("SEAM DEDUP: two factor cases reaching the SAME domain are counted ONCE (pool-then-quotient)", async () => {
    const pr = await PROVE.runProofTree(treeCtx(posDim(["a", "b"]), { a: zero(1), b: zero(1) }));
    expect(pr.kind).toBe("tree");
    expect(pr.count).toBe(1);                       // NOT 2 — the shared domain is deduped across the seam
    expect(pr.verdict).toContain("across 2 branches");
  });

  it("two cases reaching DISTINCT domains sum to 2", async () => {
    const pr = await PROVE.runProofTree(treeCtx(posDim(["a", "b"]), { a: zero(1), b: zero(2) }));
    expect(pr.count).toBe(2);
  });

  it("an inconsistent case contributes NOTHING to the union (0 + 1 = 1)", async () => {
    const pr = await PROVE.runProofTree(treeCtx(posDim(["a", "b"]), { a: { classify: { ok: true, inconsistent: true } }, b: zero(7) }));
    expect(pr.count).toBe(1);
  });

  it("maxBranches cap truncates ⇒ a LOWER BOUND (rigor 'bound')", async () => {
    const pr = await PROVE.runProofTree(treeCtx(posDim(["a", "b", "c"]), { a: zero(1), b: zero(2), c: zero(3) }), { maxBranches: 2 });
    expect(pr.truncated).toBe(true);
    expect(pr.rigor).toBe("bound");
    expect(pr.verdict).toContain("LOWER BOUND");
  });

  it("a positive-dim root with no factorable cause ⇒ truncated (can't auto-close)", async () => {
    const pr = await PROVE.runProofTree(treeCtx(posDim([]), {}));
    expect(pr.truncated).toBe(true);
    expect(pr.count).toBe(0);
  });

  it("an abort mid-walk surfaces as kind 'aborted'", async () => {
    const pr = await PROVE.runProofTree(treeCtx({ classify: { aborted: true } }, {}));
    expect(pr.kind).toBe("aborted");
  });
});
