// =============================================================================
// sym-worker-thread -- the FIRST headless exercise of the live SymWorker message
// round-trip. worker-entry.test.ts proves the worker module graph *imports* in Node
// but explicitly punts the live round-trip to the browser ("A real Web Worker can't
// run in Node ... verified in the browser at the flip"); the 2100+ node-suite
// assertions only ever hit QD.SymWorker's synchronous main-thread FALLBACK, so
// `groebnerAsync === groebner` there proves nothing about the worker path.
//
// This closes that gap. web-worker-shim installs a node:worker_threads-backed global
// `Worker`, forcing the REAL app wrapper (app/algebra/sym-worker.mjs) onto its worker
// branch; the spawned worker loads the REAL entry (app/workers/sym-worker-entry.mjs)
// via an adapter that only bridges self<->parentPort. We then assert the worker path
// is genuinely taken (_isFallback()===false -- WITHOUT this guard the differential
// degrades to runJob-vs-runJob and is vacuous) and that every runJob op returns output
// bit-identical to a direct main-thread runJob across the postMessage boundary --
// covering serialization/clone-safety, the error path, and progress throttling.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs"; // QD.Sym.runJob + MPoly (the main-thread reference)
import "../app/analysis/faber-analysis.mjs"; // Durand-Kerner used by solveZeroDim
import "../app/algebra/sym-worker.mjs"; // attaches QD.SymWorker
import { installWorkerThreadsWorker } from "./helpers/web-worker-shim.mjs";

const S: any = (_QD as any).Sym;
const SymWorker: any = (_QD as any).SymWorker;
const { MPoly, Gaussian } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const sc = (p: any, k: number) => p.scale(Gaussian.fromInt(k));
const tl = (polys: any[]) => polys.map((p) => p.termList());

// One differential case per runJob branch + result shape. Each is tiny/fast; the point
// is COVERAGE of the serialized boundary, not load. `direct` is the main-thread oracle.
const CASES: { label: string; op: string; payload: any }[] = [
  {
    label: "groebner: twisted-cubic ⟨x²−y, xy−1⟩ (grevlex) → generator term-lists",
    op: "groebner",
    payload: { polys: tl([V("x").pow(2).sub(V("y")), V("x").mul(V("y")).sub(I(1))]), orderSpec: { kind: "grevlex", varOrder: ["x", "y"] } },
  },
  {
    label: "groebner: block elimination order (kind:'block')",
    op: "groebner",
    payload: { polys: tl([V("x").pow(2).sub(V("y")), V("x").mul(V("y")).sub(I(1))]), orderSpec: { kind: "block", blocks: [["x"], ["y"]] } },
  },
  {
    label: "solveZeroDim: shape ideal ⟨x²−2, y−x⟩ → 2 solutions x=±√2 (JSON floats)",
    op: "solveZeroDim",
    payload: { polys: tl([V("x").pow(2).sub(I(2)), V("y").sub(V("x"))]), vars: ["x", "y"], solveVar: "x" },
  },
  {
    label: "solveZeroDim: non-shape grid ⟨x²−1, y²−1⟩ → eigenvalue fallback, 4 solutions (method/complete flags)",
    op: "solveZeroDim",
    payload: { polys: tl([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))]), vars: ["x", "y"] },
  },
  {
    label: "dimension: zero-dim ⟨x²−1, y²−1⟩ → {zeroDim:true, dimension:4}",
    op: "dimension",
    payload: { polys: tl([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))]), vars: ["x", "y"] },
  },
  {
    label: "dimension: positive-dim ⟨x⟩ in (x,y) → {zeroDim:false, dimension:null} (Infinity→null JSON-safety)",
    op: "dimension",
    payload: { polys: tl([V("x")]), vars: ["x", "y"] },
  },
  {
    label: "classify: ⟨x²−1, y²−1⟩ → zero-dim, 4 real solutions",
    op: "classify",
    payload: { polys: tl([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))]), vars: ["x", "y"] },
  },
  {
    label: "classify: inconsistent ⟨x−1, x⟩ (1 ∈ I) flagged",
    op: "classify",
    payload: { polys: tl([V("x").sub(I(1)), V("x")]), vars: ["x"] },
  },
  {
    label: "classify: positive-dim ⟨x⟩ in (x,y) → realCount null",
    op: "classify",
    payload: { polys: tl([V("x")]), vars: ["x", "y"] },
  },
  // F6: extend the differential to the remaining runJob branches (were untested across the boundary).
  {
    label: "solveRealCertified: shape ⟨x²−2, y−x⟩ → certified real solutions (RUR + Sturm boxes, JSON-safe)",
    op: "solveRealCertified",
    payload: { polys: tl([V("x").pow(2).sub(I(2)), V("y").sub(V("x"))]), vars: ["x", "y"] },
  },
  {
    label: "shapeFromMoments: geometric moments [1,2,4,8] → order-1 Prony (single node), JSON-safe",
    op: "shapeFromMoments",
    payload: { moments: [1, 2, 4, 8] },
  },
  {
    label: "parametricRealCount1D: ⟨x²−t⟩ over t → border at t=0 (cell counts + criticalValues, Infinity→null)",
    op: "parametricRealCount1D",
    payload: { polys: tl([V("x").pow(2).sub(V("t"))]), paramVar: "t", vars: ["x"] },
  },
];

describe("sym-worker live round-trip via node:worker_threads (worker path === main-thread runJob)", () => {
  let uninstall: () => void;

  beforeAll(async () => {
    uninstall = installWorkerThreadsWorker();
    await SymWorker.ensureReady();
    // The guard that makes every assertion below meaningful: prove we are on the REAL
    // worker branch, not the sync fallback (which would make the differential vacuous).
    expect(SymWorker._isFallback()).toBe(false);
    expect(SymWorker._hasWorker()).toBe(true);
  });

  afterAll(() => {
    try { SymWorker.cancel(); } catch { /* ignore */ }
    if (uninstall) uninstall();
  });

  for (const { label, op, payload } of CASES) {
    it(label, async () => {
      const direct = S.runJob(op, payload); // main-thread oracle
      const viaWorker = await SymWorker.run(op, payload, {});
      expect(viaWorker).toEqual(direct); // bit-identical across the postMessage boundary
    });
  }

  it("surfaces a thrown error across the boundary (unknown op → rejection, not a hang)", async () => {
    await expect(SymWorker.run("definitely-not-an-op", {}, {})).rejects.toThrow(/unknown/i);
    // The worker survives a caught job error and still serves the next request.
    const after = await SymWorker.run("dimension", { polys: tl([V("x").pow(2).sub(I(1))]), vars: ["x"] }, {});
    expect(after).toEqual(S.runJob("dimension", { polys: tl([V("x").pow(2).sub(I(1))]), vars: ["x"] }));
  });

  it("routes throttled progress callbacks across the thread boundary (cyclic-5)", async () => {
    // cyclic-5 does 112 buchberger S-pair steps; the entry posts every 64th onProgress,
    // so ≥1 progress message must cross the boundary. Also checks the {basis,pairs,steps}
    // info survives serialization.
    const a = V("a"), b = V("b"), c = V("c"), d = V("d"), e = V("e");
    const prod = (...xs: any[]) => xs.reduce((p, x) => p.mul(x));
    const polys = [
      a.add(b).add(c).add(d).add(e),
      prod(a, b).add(prod(b, c)).add(prod(c, d)).add(prod(d, e)).add(prod(e, a)),
      prod(a, b, c).add(prod(b, c, d)).add(prod(c, d, e)).add(prod(d, e, a)).add(prod(e, a, b)),
      prod(a, b, c, d).add(prod(b, c, d, e)).add(prod(c, d, e, a)).add(prod(d, e, a, b)).add(prod(e, a, b, c)),
      prod(a, b, c, d, e).sub(I(1)),
    ];
    let progressCount = 0;
    let lastInfo: any = null;
    const res = await SymWorker.run(
      "groebner",
      { polys: tl(polys), orderSpec: { kind: "grevlex", varOrder: ["a", "b", "c", "d", "e"] } },
      { onProgress: (info: any) => { progressCount++; lastInfo = info; } },
    );
    expect(progressCount).toBeGreaterThanOrEqual(1);
    expect(typeof lastInfo?.basis).toBe("number");
    expect(typeof lastInfo?.pairs).toBe("number");
    expect(typeof lastInfo?.steps).toBe("number");
    // And the worker still returned the correct basis alongside the progress stream.
    expect(res).toEqual(S.runJob("groebner", { polys: tl(polys), orderSpec: { kind: "grevlex", varOrder: ["a", "b", "c", "d", "e"] } }));
  });
});
