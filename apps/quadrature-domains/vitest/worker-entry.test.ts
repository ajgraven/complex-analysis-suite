import { describe, it, expect } from "vitest";

// Headless validation of the native module-worker graphs (Phase 2, task #18).
//
// A real Web Worker can't run in Node (jsdom has no Worker either), so the live
// message round-trip is verified in the browser at the flip. But the worker-entry
// modules guard their `self.onmessage` install behind `typeof self !== 'undefined'`,
// so importing them here exercises the ENTIRE worker import graph — the solver-graph
// barrel (solver core + poly-helpers + all 23 families/seeds) plus the Schwarz and
// ParamSlice kernels — and proves it resolves in real Node ESM and wires the shared
// QD namespace. This is the first real-Node (non-vm) import of the full solver graph,
// so it also guards against any family twin that only works under the vm harness.
describe("native module-worker graphs load headlessly", () => {
  it("solver-graph barrel exposes the solver worker API", async () => {
    const { default: QD } = await import("../app/workers/solver-graph.mjs");
    expect(typeof QD.solveInverseQD).toBe("function");   // 'solve' jobs
    expect(typeof QD.searchAlternates).toBe("function"); // 'altSearch' jobs
    expect(typeof QD.liveSolveStep).toBe("function");    // 'liveSolve' jobs
    // Family registry populated (dispatch target for solveInverseQD).
    expect(typeof QD.selectFamily).toBe("function");
  });

  it("solver worker entry module graph resolves", async () => {
    const mod = await import("../app/workers/solver-worker-entry.mjs");
    expect(mod).toBeDefined();
  });

  it("deferred analysis worker entry wires every status analyzer", async () => {
    await import("../app/workers/analysis-worker-entry.mjs");
    const { default: QD } = await import("../app/workers/solver-graph.mjs");
    expect(typeof QD.findCriticalPoints).toBe("function");
    expect(typeof QD.classifyUnivalence).toBe("function");
    expect(typeof QD.classifyCusps).toBe("function");
    expect(typeof QD.boundaryObservables).toBe("function");
    expect(typeof QD.detectSymmetry).toBe("function");
  });

  it("schwarz worker entry wires the Schwarz kernel onto QD", async () => {
    await import("../app/workers/schwarz-worker-entry.mjs");
    const { default: QD } = await import("../app/workers/solver-graph.mjs");
    expect(typeof QD.Schwarz.buildSchwarzFromPhi).toBe("function");
    expect(typeof QD.Schwarz.escapeTime).toBe("function");
  });

  it("param-slice worker entry exposes the ParamSlice kernel", async () => {
    await import("../app/workers/param-slice-worker-entry.mjs");
    const { default: PS } = await import("../app/param-slice/param-slice-common.mjs");
    expect(typeof PS.solveOnePointWithScratch).toBe("function");
    expect(typeof PS.cloneScenario).toBe("function");
  });

  // The param-slice pool is a browser-only main-thread module (not in the vm harness), so
  // this is its only headless check: its module graph loads and it exports the pool factory
  // + the main-thread fallback the UI relies on. The live Worker pool is verified at the flip.
  it("param-slice pool module loads + exposes the factory", async () => {
    const { default: pool } = await import("../app/param-slice/param-slice-pool.mjs");
    expect(typeof pool.create).toBe("function");
    expect(typeof pool.MainThreadPool).toBe("function");
  });

  it("sym worker entry wires QD.Sym.runJob", async () => {
    await import("../app/workers/sym-worker-entry.mjs");
    const { default: QD } = await import("../app/workers/solver-graph.mjs");
    expect(typeof QD.Sym.runJob).toBe("function");
  });

  it("sym-worker main-thread module loads + exposes run()", async () => {
    const { default: QD } = await import("../app/workers/solver-graph.mjs");
    await import("../app/algebra/sym-worker.mjs"); // attaches QD.SymWorker
    expect(typeof QD.SymWorker.run).toBe("function");
  });
});
