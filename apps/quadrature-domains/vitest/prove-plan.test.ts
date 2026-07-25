// =============================================================================
// prove-plan — the pure existence/uniqueness proof ENGINE extracted from algebra-ui's
// doCertifyUnivalence (fuller-orchestrator Phase A; docs/algebra-review/ORCHESTRATOR_REDESIGN.md).
//
// Phase A is a NO-BEHAVIOR-CHANGE extraction, so this began as the safety net that locks the moved
// logic byte-for-byte before Phases B–E build on it. It has since GROWN WITH THE ENGINE — there are
// now 12 `describe` blocks, not the original three, because each later phase added its coverage
// here rather than in a new file. Blocks 1–4 are the original Phase-A net:
//   (1) the pure per-solution helpers (reconstructPhi / poleSubst / nodeInsideDisk / gaugeQuotient)
//       on hand-built + real-engine inputs;
//   (2) a CHARACTERIZATION of assembleVerdict — the risky verdict-string assembly — with fake
//       minimal deps, so every verdict shape is pinned deterministically;
//   (3) runCertifyPlan's control flow (regime short-circuits + a full zero-dim pass) with fake
//       injected ops, plus one REAL-seed disk end-to-end that must read "Unique quadrature domain ✓".
// Blocks 5–12 came later and are roughly 70% of the file: runProofTree (Phase B), the optional
// numeric-oracle path (Phase D), rigorProvenance (Phase E), and the C1 moment / C2 rational-φ /
// C3 triangle prove routes. Read the block headers rather than this list — it is the part most
// likely to fall behind next.
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

  it("X1: an IRRATIONAL-algebraic QD certified at the true root (intervalCertified) earns rigor exact + the honest interval note", () => {
    // This is the ≈→= flip: leaf.allExactVerified is satisfied by the interval Schur–Cohn fold ∧ augmented
    // boundary count at the true algebraic root, and leaf.intervalCertified marks that it was NOT a rational
    // root — so the verdict must say so honestly, never claim "exact ℚ(i) root", and never keep the estimate caveat.
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }], gaugeMerged: 0, leaf: leafClean({ intervalCertified: true }),
      cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.rigor).toBe("exact");
    expect(asm.verdict).toContain("certified at the true algebraic root (interval Schur–Cohn fold + augmented boundary count over ℚ(i))");
    expect(asm.verdict).not.toContain("exact ℚ(i) root");            // NOT the rational-root wording
    expect(asm.verdict).not.toContain("RATIONALIZED coordinates");   // NOT the estimate caveat
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

describe("prove-plan (6) from-data: the numeric cross-check oracle is OPTIONAL (Phase D)", () => {
  // A deps bag whose QE supports the cross-check (residual + system regen) but with NO numeric solver.
  const dataDeps = () => ({
    QD: { sameDomain: (x: any, y: any) => x === y },
    QE: { residualAtSolution: () => ({ max: 0 }), generateClassicalBounded: () => ({}) },
    w0Fixed: false, caps: { maxPoleOrder: 6 },
  });
  const args = (over: any) => Object.assign({
    distinct: [{ k: 1 }], gaugeMerged: 0, leaf: leafClean(),
    cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
    deps: dataDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
  }, over);

  it("no numeric oracle ⇒ the residual alone certifies (cross-check ✓, rigor stays exact)", () => {
    const asm = PROVE.assembleVerdict(args({ oracle: null }));   // from-data: numPhi absent
    expect(asm.verdict).toContain("reduction integrity — no numeric solve to corroborate");
    expect(asm.verdict).not.toContain("matches the numeric solver");
    expect(asm.rigor).toBe("exact");   // NOT penalized for the absent oracle
    expect(asm.bad).toBe(false);
  });

  it("a numeric oracle that DOESN'T match still fails the cross-check (unchanged)", () => {
    const asm = PROVE.assembleVerdict(args({ oracle: { numPhi: { k: 99 }, w0Sel: undefined } }));
    expect(asm.verdict).toContain("⚠ cross-check: no match to the numeric solver");
    expect(asm.bad).toBe(true);
    expect(asm.rigor).not.toBe("exact");
  });

  it("a numeric oracle that matches reads 'matches the numeric solver' (unchanged)", () => {
    const phi = { k: 1 };
    const asm = PROVE.assembleVerdict(args({ distinct: [phi], oracle: { numPhi: phi, w0Sel: undefined } }));
    expect(asm.verdict).toContain("matches the numeric solver");
    expect(asm.rigor).toBe("exact");
  });

  it("crossCheckPhis reports oracleAvailable=false when no numPhi is supplied", () => {
    const cc = PROVE.crossCheckPhis([{ k: 1 }], diskH, dataDeps(), null);
    expect(cc.checked).toBe(true);
    expect(cc.oracleAvailable).toBe(false);
    expect(cc.oracleMatch).toBe(false);
  });
});

describe("prove-plan (7) rigorProvenance — the audit trail behind the badge (Phase E)", () => {
  it("an exact verdict ⇒ every binding condition is met (all ✓)", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }], gaugeMerged: 0, leaf: leafClean(),
      cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.rigor).toBe("exact");
    expect(asm.rigorProvenance.length).toBeGreaterThanOrEqual(3);
    expect(asm.rigorProvenance.every((s: string) => s.startsWith("✓ "))).toBe(true);
    expect(asm.rigorProvenance.join(" ")).toContain("certified real count (RUR + exact Sturm)");
  });

  it("a numeric-fold fallback ⇒ the exact-filters line is marked ✗", () => {
    const asm = PROVE.assembleVerdict({
      distinct: [{ k: 1 }], gaugeMerged: 0, leaf: leafClean({ allExactFilter: false, allExactVerified: false }),
      cl: { realCount: 1 }, real: [{}], r: { certified: true, complete: true },
      deps: fakeDeps(), hData: diskH, sliceCaveat: noSlice, oracle: null,
    });
    expect(asm.rigor).toBe("estimate");
    expect(asm.rigorProvenance.some((s: string) => s.startsWith("✗ ") && /univalence filters/.test(s))).toBe(true);
  });

  it("rigorProvenance(flags) marks each condition and notes a truncated tree + residual-only cross-check", () => {
    const p = PROVE.rigorProvenance({ certified: true, allExactFilter: false, allExactVerified: true, ccChecked: true, ccOk: true, ccAvailable: false, truncated: true });
    expect(p.find((s: string) => /certified real count/.test(s))).toMatch(/^✓/);
    expect(p.find((s: string) => /univalence filters/.test(s))).toMatch(/^✗/);
    expect(p.find((s: string) => /cross-check/.test(s))).toMatch(/residual integrity/);
    expect(p.some((s: string) => /every branch of the case tree closed/.test(s))).toBe(true);
  });
});

describe("prove-plan (8) moment route — point-functional / Aharonov–Shapiro (Phase C1)", () => {
  const buildCtx = (moments: any, order: number) => {
    const sys = QE.pointFunctionalSystem(moments, { order });
    const store = AS.create();
    store.seedFromPolys({ polys: sys.polys, vars: sys.vars });
    return {
      order, momentPolys: sys.polys, deps: { QE, QC, QD, caps: { maxPoleOrder: 6 } },
      sliceCaveat: () => "", posDimDesc: (cl: any) => (cl.numVars + " vars"),
      classify: async () => store.classify(null, {}),
      solveCertified: async () => store.solveRealCertifiedSync(null, {}),
    };
  };

  it("reconstructMomentW extracts [null, w1, {re,im}₂] from a reim solution", () => {
    const sol = { w1__re: { re: 1.5, im: 0 }, u2__re: { re: 0.5, im: 0 }, v2__re: { re: -0.2, im: 0 } };
    const w = PROVE.reconstructMomentW(sol, 2);
    expect(w[1]).toBeCloseTo(1.5);
    expect(w[2].re).toBeCloseTo(0.5);
    expect(w[2].im).toBeCloseTo(-0.2);
  });

  it("momentUnivalence: φ=z (w1=1) has no fold; w1≪2|w2| folds; w1≥2|w2| is univalent", () => {
    const deps = { QE, QD };
    expect(PROVE.momentUnivalence([null, 1], 1, deps).inside).toBe(0);                    // disk
    expect(PROVE.momentUnivalence([null, 0.5, { re: 1, im: 0 }], 2, deps).inside).toBeGreaterThan(0); // fold
    expect(PROVE.momentUnivalence([null, 3, { re: 0.5, im: 0 }], 2, deps).inside).toBe(0);            // ok
  });

  it("cardioid {M0:1.5,M1:0.5} ⇒ Unique quadrature domain ✓ (A&S), rigor exact", async () => {
    const pr = await PROVE.runMomentPlan(buildCtx({ M0: 1.5, M1: 0.5 }, 2));
    expect(pr.kind).toBe("moment");
    expect(pr.count).toBe(1);
    expect(pr.verdict).toContain("Unique quadrature domain ✓");
    expect(pr.verdict).toContain("Aharonov–Shapiro");
    expect(pr.rigor).toBe("exact");
  });

  it("complex moment {M0:2,M1:0.7+0.3i} (OFF-SLICE) ⇒ one genuine QD, folds rejected", async () => {
    const pr = await PROVE.runMomentPlan(buildCtx({ M0: 2, M1: { re: 0.7, im: 0.3 } }, 2));
    expect(pr.kind).toBe("moment");
    expect(pr.count).toBe(1);   // the off-slice domain the real slice can't see
    expect(pr.rows.filter((r: string) => /fold/.test(r)).length).toBeGreaterThanOrEqual(1);
  });

  it("{M0:1,M1:0.4} ⇒ no real moment solution ⇒ No quadrature domain", async () => {
    const pr = await PROVE.runMomentPlan(buildCtx({ M0: 1, M1: 0.4 }, 2));
    expect(pr.kind).toBe("no-real");
    expect(pr.verdict).toContain("No quadrature domain");
  });

  // ---- C1-ext-A: exact boundary double-point count (global univalence for order ≥ 3) ----------
  const bdeps = { QE, QD };

  it("momentBoundarySimple: cardioid (order 2, 1 cusp) is boundary-simple (count === cusps)", () => {
    const w = [null, 1, { re: 0.5, im: 0 }];               // φ = z + z²/2, cusp at z=-1
    const u = PROVE.momentUnivalence(w, 2, bdeps);
    expect(u.onCircle).toBe(1);
    const bs = PROVE.momentBoundarySimple(w, 2, u.onCircle, bdeps);
    expect(bs).not.toBeNull();
    expect(bs.simple).toBe(true);
  });

  it("momentBoundarySimple: a locally-univalent order-3 φ (no cusp) is boundary-simple", () => {
    const w = [null, 1, { re: 0.2, im: 0.1 }, { re: 0.1, im: 0 }];  // φ′≠0 in 𝔻̄ (dominant w1)
    const u = PROVE.momentUnivalence(w, 3, bdeps);
    expect(u.inside).toBe(0);
    expect(u.onCircle).toBe(0);
    const bs = PROVE.momentBoundarySimple(w, 3, u.onCircle, bdeps);
    expect(bs).not.toBeNull();
    expect(bs.simple).toBe(true);        // certifies GLOBAL univalence exactly (beyond A&S order ≤ 2)
  });

  it("momentBoundarySimple returns null when the exact deps are unavailable", () => {
    expect(PROVE.momentBoundarySimple([null, 1], 1, 0, {})).toBeNull();
    expect(PROVE.momentBoundarySimple([null, 1], 1, 0, { QD })).toBeNull();  // missing QE.ratApprox
  });

  it("momentCertifyLeaf order-3: a locally-univalent w is genuine + boundary-certified (allBoundaryExact)", () => {
    // reim solution literal for φ = z + (0.2+0.1i)z² + 0.1z³
    const sol3: any = { w1__re: { re: 1, im: 0 }, u2__re: { re: 0.2, im: 0 }, v2__re: { re: 0.1, im: 0 }, u3__re: { re: 0.1, im: 0 }, v3__re: { re: 0, im: 0 } };
    const leaf = PROVE.momentCertifyLeaf([sol3], 3, bdeps, null);
    expect(leaf.genuine.length).toBe(1);
    expect(leaf.allBoundaryExact).toBe(true);
    expect(leaf.selfInt).toBe(0);
    expect(leaf.genuine[0].boundaryExact).toBe(true);
    expect(leaf.rows[0]).toContain("boundary-simple");
  });

  it("assembleMomentVerdict order-3 WITHOUT the boundary count ⇒ estimate + honest 'candidate' wording (not ✓)", () => {
    const leaf: any = { genuine: [{}], folded: 0, selfInt: 0, gaugeDropped: 0, allExact: true, allVerified: true, allBoundaryExact: false };
    const asm = PROVE.assembleMomentVerdict({ genuine: leaf.genuine, real: [{}], leaf, order: 3, deps: {}, sliceCaveat: () => "", cl: null });
    expect(asm.rigor).toBe("estimate");
    expect(asm.bound).toBe("≈");                                          // #6
    expect(asm.verdict).toContain("locally-univalent candidate");        // #3: no "Unique ✓ genuine" for local-only
    expect(asm.verdict).not.toContain("genuine QD");
    expect(asm.verdict).not.toContain("Unique quadrature domain ✓");
    expect(asm.verdict).toContain("LOCAL univalence certified");
    expect(asm.verdict).toContain("order ≥ 3");
    expect(asm.rigorProvenance.some((p: string) => /^✗ global univalence/.test(p))).toBe(true);
  });

  it("assembleMomentVerdict order-2 falls back to A&S when the boundary count is unavailable (still exact ✓)", () => {
    const leaf: any = { genuine: [{}], folded: 0, selfInt: 0, gaugeDropped: 0, allExact: true, allVerified: true, allBoundaryExact: false };
    const asm = PROVE.assembleMomentVerdict({ genuine: leaf.genuine, real: [{}], leaf, order: 2, deps: {}, sliceCaveat: () => "", cl: null });
    expect(asm.rigor).toBe("exact");
    expect(asm.verdict).toContain("Unique quadrature domain ✓");         // order ≤ 2 stays certified via A&S
    expect(asm.verdict).toContain("Aharonov–Shapiro, order ≤ 2");
  });

  it("assembleMomentVerdict lists self-intersecting rejects in the tail", () => {
    const leaf: any = { genuine: [], folded: 0, selfInt: 1, gaugeDropped: 0, allExact: true, allVerified: true, allBoundaryExact: true };
    const asm = PROVE.assembleMomentVerdict({ genuine: [], real: [{}, {}], leaf, order: 3, deps: {}, sliceCaveat: () => "", cl: null });
    expect(asm.bad).toBe(true);
    expect(asm.verdict).toContain("1 self-intersecting");
  });

  it("assembleMomentVerdict: an empty result on an UNRELIABLE filter reads 'estimate', not a certified '=' (C3)", () => {
    // momentCertifyLeaf clears allExact when a candidate's Schur–Cohn was unresolved but still folds on the
    // raw inertia count, so a genuine QD can be mis-rejected there. When that empties the set, "no genuine
    // QD" must NOT wear a green '='. Previously the moment route stamped D===0 as unconditional 'exact';
    // now it gates on the filter's reliability, matching the rational/triangle routes.
    const unreliable: any = { genuine: [], folded: 1, selfInt: 0, gaugeDropped: 0, allExact: false, allVerified: false, allBoundaryExact: false };
    const asmU = PROVE.assembleMomentVerdict({ genuine: [], real: [{}], leaf: unreliable, order: 3, deps: {}, sliceCaveat: () => "", cl: null });
    expect(asmU.bad).toBe(true);
    expect(asmU.rigor).toBe("estimate");   // was 'exact' before the fix — this is the regression guard
    expect(asmU.bound).toBe("≈");
    // …but a RELIABLE filter that empties the set still certifies "no QD" exactly:
    const reliable: any = { genuine: [], folded: 1, selfInt: 0, gaugeDropped: 0, allExact: true, allVerified: true, allBoundaryExact: true };
    const asmR = PROVE.assembleMomentVerdict({ genuine: [], real: [{}], leaf: reliable, order: 3, deps: {}, sliceCaveat: () => "", cl: null });
    expect(asmR.rigor).toBe("exact");
    expect(asmR.bound).toBe("=");
  });
});

describe("prove-plan (9) rational-φ univalence — the multi-node route (Phase C2-2)", () => {
  const rdeps = { QE, QD };

  it("rationalUnivalence: the ground-truth shape (t=½, d=¼) is locally univalent, poles outside 𝔻̄", () => {
    // φ=(z+¼z²)/(1−¼z²): φ′ numerator 1+½z+¼z² has roots −1±i√3 (|z|=2), so no fold.
    const u: any = PROVE.rationalUnivalence(0.5, 0.25, rdeps);
    expect(u).not.toBeNull();
    expect(u.inside).toBe(0);
    expect(u.onCircle).toBe(0);
    expect(u.poleOk).toBe(true);       // c = t² = ¼ < 1
    expect(u.reliable).toBe(true);     // #1: exact Schur–Cohn resolved (a degree-2 numerator, well within the cap)
  });

  it("rationalUnivalence: a large-d shape folds (φ′ numerator vanishes inside 𝔻)", () => {
    // t=½ (c=¼), d=2: 1+4z+¼z² has a root at ≈ −0.25 (inside 𝔻) ⇒ inside ≥ 1.
    const u: any = PROVE.rationalUnivalence(0.5, 2, rdeps);
    expect(u.inside).toBeGreaterThanOrEqual(1);
  });

  it("rationalUnivalence: a pole inside 𝔻̄ (t ≥ 1 ⇒ c ≥ 1) is flagged not-analytic", () => {
    const u: any = PROVE.rationalUnivalence(1.5, 0, rdeps);   // c = 2.25 ≥ 1
    expect(u.poleOk).toBe(false);
  });

  it("rationalBoundarySimple: the asymmetric ground truth φ(∂𝔻) is simple (count === cusps = 0)", () => {
    const u: any = PROVE.rationalUnivalence(0.5, 0.25, rdeps);
    const bs: any = PROVE.rationalBoundarySimple(0.5, 0.25, u.onCircle, rdeps);
    expect(bs).not.toBeNull();
    expect(bs.simple).toBe(true);
  });

  it("rationalBoundarySimple: the symmetric shape (d=0) is simple", () => {
    const u: any = PROVE.rationalUnivalence(0.5, 0, rdeps);
    const bs: any = PROVE.rationalBoundarySimple(0.5, 0, u.onCircle, rdeps);
    expect(bs.simple).toBe(true);
  });

  it("boundarySimpleFromN returns null without the Sym engine", () => {
    expect(PROVE.boundarySimpleFromN(null, 0, {})).toBeNull();
    expect(PROVE.rationalUnivalence(0.5, 0.25, {})).toBeNull();      // missing deps
  });

  it("boundarySimpleFromN returns null when the exact real-count can't resolve (positive-dim torus) — honest fallthrough", () => {
    // N = Z₁ + Z₂ ⇒ the torus double-point system {x₁+x₂, y₁+y₂, |z₁|²−1, |z₂|²−1} is a 1-parameter
    // family (z₂ = −z₁ on ∂𝔻), so Sym.realSolutionCount can't count it and returns not-ok ⇒ null (NOT a
    // spurious {simple:true}). That null is exactly what drives allBoundaryExact=false ⇒ an honest
    // 'estimate' downstream, never a bogus '='. Locks the labeling guard at its source.
    const Sym: any = QD.Sym;
    const Z1 = Sym.mpolyVar("Z1"), Z2 = Sym.mpolyVar("Z2");
    expect(PROVE.boundarySimpleFromN(Z1.add(Z2), 0, { QE, QD })).toBeNull();
  });
});

describe("prove-plan (10) rational-φ verdict assembly + plan (Phase C2-3)", () => {
  const rdeps = { QE, QD };
  // ASYMMETRIC ground truth: nodes 3/5, −7/15 (the +t / −t pair); shape (t=½, d=¼).
  const asymNodes = { nodes: [{ re: 3 / 5, im: 0 }, { re: -7 / 15, im: 0 }], weights: [{ re: 28 / 25, im: 0 }, { re: 52 / 225, im: 0 }] };
  const rsol = (t: number, d: number) => ({ t__re: { re: t, im: 0 }, d__re: { re: d, im: 0 } });

  it("reconstructRationalMap recovers c=t², R≈1, w0≈0 from the shape + nodes", () => {
    const m: any = PROVE.reconstructRationalMap(rsol(0.5, 0.25), asymNodes);
    expect(m.c).toBeCloseTo(0.25, 9);
    expect(m.R).toBeCloseTo(1, 6);        // (a₁−a₂)(1−t⁴)/(2t) = (16/15)(15/16)/1 = 1
    expect(m.w0).toBeCloseTo(0, 6);       // (a₁+a₂)/2 − R·d·t²/(1−t⁴) = 1/15 − 1/15 = 0
  });

  it("#4: reconstructRationalMap canonicalizes node order ⇒ R>0 regardless of the caller's ordering", () => {
    const swapped = { nodes: [{ re: -7 / 15, im: 0 }, { re: 3 / 5, im: 0 }], weights: [{ re: 52 / 225, im: 0 }, { re: 28 / 25, im: 0 }] };
    const m: any = PROVE.reconstructRationalMap(rsol(0.5, 0.25), swapped);   // node[0] is the SMALLER node
    expect(m.R).toBeCloseTo(1, 6);        // still +1 (a₁ re-sorted to the larger node), not −1
    expect(m.c).toBeCloseTo(0.25, 9);
  });

  it("rationalCertifyLeaf: keeps the genuine QD, drops the t≤0 gauge copy + the pole-inside candidate", () => {
    const real = [rsol(0.5, 0.25), rsol(-0.5, 0.25), rsol(1.5, 0)];   // genuine, gauge copy, pole-in-𝔻̄
    const leaf: any = PROVE.rationalCertifyLeaf(real, asymNodes, null, rdeps);
    expect(leaf.genuine.length).toBe(1);
    expect(leaf.gaugeDropped).toBeGreaterThanOrEqual(1);
    expect(leaf.poleRej).toBeGreaterThanOrEqual(1);
    expect(leaf.allBoundaryExact).toBe(true);
    expect(leaf.genuine[0].c).toBeCloseTo(0.25, 6);
  });

  it("#9: a REJECTED (pole-inside, irrational) candidate does NOT pollute allVerified — only GENUINE candidates gate it", () => {
    // Real sysPolys so exact-verify actually runs over ℚ: (a) the ground-truth rational shape (t=½,d=¼)
    // exact-verifies at the TRUE root (exactPoint); (b) an IRRATIONAL t=√2 (c=2≥1) candidate whose
    // exact-verify FAILS is rejected at the pole-in-𝔻̄ gate BEFORE the `allVerified` update — the #9 fix.
    // So the rejected one's failed verify must not drag allVerified down (that would spuriously → 'estimate').
    const sys = QE.rationalMomentSystem(asymNodes, { degree: 2 });
    const real = [rsol(0.5, 0.25), rsol(Math.SQRT2, 0.3)];
    const leaf: any = PROVE.rationalCertifyLeaf(real, asymNodes, sys.polys, rdeps);
    expect(leaf.genuine.length).toBe(1);
    expect(leaf.genuine[0].exactPoint).toBe(true);        // the kept shape IS exact-verified over ℚ
    expect(leaf.poleRej).toBeGreaterThanOrEqual(1);       // the irrational √2 candidate was rejected (pole in 𝔻̄)
    expect(leaf.allVerified).toBe(true);                  // …and its failed exact-verify did NOT pollute allVerified
  });

  it("assembleRationalVerdict: no boundary count ⇒ estimate + honest 'candidate' wording; pole rejects in the tail", () => {
    const leaf: any = { genuine: [{ c: 0.25, d: 0.25 }], folded: 0, selfInt: 0, poleRej: 2, gaugeDropped: 0, allExact: true, allVerified: true, allBoundaryExact: false };
    const asm = PROVE.assembleRationalVerdict({ genuine: leaf.genuine, real: [{}, {}, {}], leaf, deps: {}, sliceCaveat: () => "", cl: null });
    expect(asm.rigor).toBe("estimate");
    expect(asm.bound).toBe("≈");
    expect(asm.verdict).toContain("locally-univalent candidate");        // #3
    expect(asm.verdict).not.toContain("Unique quadrature domain ✓");
    expect(asm.verdict).toContain("LOCAL univalence certified");
    expect(asm.verdict).toContain("2 pole-in-𝔻̄");
  });

  it("runRationalPlan E2E: the asymmetric 2-node data proves a genuine QD over the real engine", async () => {
    const sys = QE.rationalMomentSystem(asymNodes, { degree: 2 });
    const store = AS.create();
    store.seedFromPolys({ polys: sys.polys, vars: sys.vars });
    const pr: any = await PROVE.runRationalPlan({
      sysPolys: sys.polys, nodeData: asymNodes, deps: { QE, QC, QD, caps: {} },
      sliceCaveat: () => "", posDimDesc: (cl: any) => cl.numVars + " vars",
      classify: async () => store.classify(null, {}),
      solveCertified: async () => store.solveRealCertifiedSync(null, {}),
    });
    expect(pr.kind).toBe("rational");
    expect(pr.count).toBeGreaterThanOrEqual(1);
    // the genuine set includes the ground-truth shape (c≈¼, d≈¼)
    expect(pr.genuine.some((g: any) => Math.abs(g.c - 0.25) < 1e-4 && Math.abs(g.d - 0.25) < 1e-4)).toBe(true);
    expect(pr.rigor).toBe("exact");
  });
});

describe("prove-plan (11) equilateral-triangle univalence — degree-3 route (Phase C3-2)", () => {
  const tdeps = { QE, QD };

  it("triangleUnivalence: c=1/5 (< ½) is locally univalent with poles outside 𝔻̄", () => {
    // φ=z/(1−z³/5): φ′ numerator 1+2z³/5 has roots at |z|=(5/2)^{1/3}≈1.36 ⇒ no fold.
    const u: any = PROVE.triangleUnivalence(0.2, tdeps);
    expect(u).not.toBeNull();
    expect(u.inside).toBe(0);
    expect(u.onCircle).toBe(0);
    expect(u.poleOk).toBe(true);
  });

  it("triangleUnivalence: c=0.7 (> ½) folds (φ′ numerator vanishes inside 𝔻)", () => {
    const u: any = PROVE.triangleUnivalence(0.7, tdeps);   // 1+1.4z³ root at |z|≈0.89 (inside)
    expect(u.inside).toBeGreaterThanOrEqual(1);
  });

  it("triangleUnivalence: |c| ≥ 1 ⇒ a pole inside 𝔻̄ (not analytic)", () => {
    expect(PROVE.triangleUnivalence(1.5, tdeps).poleOk).toBe(false);
  });

  it("triangleBoundarySimple: the c=1/5 triangle φ(∂𝔻) is simple (count === cusps = 0)", () => {
    const u: any = PROVE.triangleUnivalence(0.2, tdeps);
    const bs: any = PROVE.triangleBoundarySimple(0.2, u.onCircle, tdeps);
    expect(bs).not.toBeNull();
    expect(bs.simple).toBe(true);
  });

  it("returns null without the Sym engine", () => {
    expect(PROVE.triangleUnivalence(0.2, {})).toBeNull();
    expect(PROVE.triangleBoundarySimple(0.2, 0, {})).toBeNull();
  });
});

describe("prove-plan (12) triangle verdict assembly + plan (Phase C3-3)", () => {
  const W = 0.8660254037844386;
  // GROUND TRUTH (rational shape): R=63/32, s=½, c=⅛ ⇒ cube-root nodes (magnitude 1), weight 11/8.
  const triNodes = { nodes: [{ re: 1, im: 0 }, { re: -0.5, im: W }, { re: -0.5, im: -W }], weights: [{ re: 11 / 8, im: 0 }, { re: 11 / 8, im: 0 }, { re: 11 / 8, im: 0 }] };
  const P0 = (63 / 32) * (63 / 32);   // P = R²
  const tsol = (P: number, s: number) => ({ P__re: { re: P, im: 0 }, s__re: { re: s, im: 0 } });

  it("reconstructTriangleMap: R = √P, c = s³ from the shape (P, s)", () => {
    const m: any = PROVE.reconstructTriangleMap(tsol(P0, 0.5));
    expect(m.R).toBeCloseTo(63 / 32, 9);
    expect(m.s).toBeCloseTo(0.5, 9);
    expect(m.c).toBeCloseTo(0.125, 9);
  });

  it("triangleCertifyLeaf: keeps the genuine QD, drops the s≤0 gauge copy + the pole-inside candidate", () => {
    const real = [tsol(P0, 0.5), tsol(P0, -0.5), tsol(4, 1.2)];   // genuine, gauge copy (s<0), pole (s>1 ⇒ c>1)
    const leaf: any = PROVE.triangleCertifyLeaf(real, triNodes, null, { QE, QD });
    expect(leaf.genuine.length).toBe(1);
    expect(leaf.gaugeDropped).toBeGreaterThanOrEqual(1);
    expect(leaf.poleRej).toBeGreaterThanOrEqual(1);
    expect(leaf.allBoundaryExact).toBe(true);
    expect(leaf.genuine[0].c).toBeCloseTo(0.125, 6);
  });

  it("runTrianglePlan E2E: the equilateral triangle proves a Unique ✓ genuine QD over the real engine", async () => {
    const sys = QE.triangleMomentSystem(triNodes);
    const store = AS.create();
    store.seedFromPolys({ polys: sys.polys, vars: sys.vars });
    const pr: any = await PROVE.runTrianglePlan({
      sysPolys: sys.polys, nodeData: triNodes, deps: { QE, QC, QD, caps: {} },
      sliceCaveat: () => "", posDimDesc: (cl: any) => cl.numVars + " vars",
      classify: async () => store.classify(null, {}),
      solveCertified: async () => store.solveRealCertifiedSync(null, {}),
    });
    expect(pr.kind).toBe("triangle");
    expect(pr.count).toBe(1);
    expect(pr.verdict).toContain("Unique quadrature domain ✓");
    expect(pr.genuine.some((g: any) => Math.abs(g.c - 0.125) < 1e-3)).toBe(true);   // c = ⅛ recovered
    // #9: the rational shape (c=⅛) is exact-verified at the true root and its rejected candidates no longer
    // pollute allVerified, so this earns a certified `=` (was a spurious 'estimate' before the pollution fix).
    expect(pr.rigor).toBe("exact");
    expect(pr.bound).toBe("=");
  });
});

// The three Phase-C verdict assemblers (moment / rational / triangle) mirror each other: given a
// CERTIFIED count with allExact + allVerified + allBoundaryExact, D=1 reads "Unique ✓" and D≥2 reads
// "N distinct quadrature domains" — both exact / bound '='. Only the formulation string and the
// solution noun differ per route. This table drives the shared D=1 / D≥2 characterization, folding
// what were three copy-pasted "allBoundaryExact ⇒ Unique ✓" `it`s into one place AND adding the
// previously-untested D≥2 template. Route-specific locks (moment's order/A&S fallback, the estimate
// wording, the reject tails, the E2E plans) stay in blocks (8)/(10)/(12).
const routeVerdictCases = [
  {
    route: "moment", solWord: "moment solution", form: "point-functional / Aharonov–Shapiro",
    call: (leaf: any, real: any[]) => PROVE.assembleMomentVerdict({ genuine: leaf.genuine, real, leaf, order: 3, deps: {}, sliceCaveat: () => "", cl: null }),
  },
  {
    route: "rational", solWord: "shape solution", form: "rational-φ (degree-2 multi-node, Gustafsson)",
    call: (leaf: any, real: any[]) => PROVE.assembleRationalVerdict({ genuine: leaf.genuine, real, leaf, deps: {}, sliceCaveat: () => "", cl: null }),
  },
  {
    route: "triangle", solWord: "shape solution", form: "equilateral triangle, degree-3, Gustafsson",
    call: (leaf: any, real: any[]) => PROVE.assembleTriangleVerdict({ genuine: leaf.genuine, real, leaf, sliceCaveat: () => "", cl: null }),
  },
];

describe.each(routeVerdictCases)(
  "prove-plan (13) $route verdict template — D=1 vs D≥2 (allBoundaryExact ⇒ exact '=')",
  ({ solWord, form, call }) => {
    // A fully-certified genuine pool: exact filters, every genuine root exact-verified, boundary exact.
    const exactLeaf = (nGenuine: number, over: any = {}) => Object.assign(
      { genuine: Array.from({ length: nGenuine }, () => ({})), folded: 0, selfInt: 0, poleRej: 0, gaugeDropped: 0, allExact: true, allVerified: true, allBoundaryExact: true },
      over,
    );

    it("D=1 ⇒ 'Unique quadrature domain ✓' (exact, bound '=', globally univalent, gauge tail)", () => {
      const leaf = exactLeaf(1, { gaugeDropped: 1 });   // 1 genuine + 1 rotation copy of 2 real solutions
      const asm: any = call(leaf, [{}, {}]);
      expect(asm.count).toBe(1);
      expect(asm.bad).toBe(false);
      expect(asm.rigor).toBe("exact");
      expect(asm.bound).toBe("=");
      expect(asm.verdict).toContain("Unique quadrature domain ✓");
      expect(asm.verdict).toContain("globally univalent");
      expect(asm.verdict).toContain("boundary double-point count");
      expect(asm.verdict).toContain(form);                        // route-specific formulation preserved
      expect(asm.verdict).toContain("1 gauge copy rejected");     // gauge-copy tail rendering
      expect(asm.rigorProvenance.some((p: string) => /global univalence/.test(p) && /^✓/.test(p))).toBe(true);
    });

    it("D≥2 ⇒ 'N distinct quadrature domains' (NOT 'Unique'), still exact / bound '='", () => {
      const asm: any = call(exactLeaf(2), [{}, {}]);
      expect(asm.count).toBe(2);
      expect(asm.bad).toBe(false);
      expect(asm.rigor).toBe("exact");
      expect(asm.bound).toBe("=");
      expect(asm.verdict).toContain("2 distinct quadrature domains");
      expect(asm.verdict).not.toContain("Unique");
      expect(asm.verdict).toContain("of 2 real " + solWord + "s");
      expect(asm.verdict).toContain("globally univalent");
      expect(asm.verdict).toContain(form);
    });
  },
);
