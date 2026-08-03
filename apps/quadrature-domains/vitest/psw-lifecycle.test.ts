// =============================================================================
// psw-lifecycle -- cancel / supersede / crash / fallback coverage for
// QD.PrimarySolverWorker (qd-psw-untested-03).
//
// 381 lines driving THREE independent workers, and the only coverage was
// app/test/worker.test.js: fourteen `typeof … === 'function'` assertions plus one
// functional assertion nested inside `if (base.success)`. Nothing exercised a single
// lifecycle transition. That matters because the whole module exists to keep a
// 50-500 ms solve off the main thread, and every way it can go wrong — a superseded
// job that never settles, a cancel that leaks a running worker, a crash that leaves
// the UI spinning "Solving…" forever — is invisible to a shape check.
//
// Two halves, because they need opposite environments:
//
//   REAL WORKER PATH   via vitest/helpers/web-worker-shim.mjs (the node:worker_threads
//                      Worker facade the sym-worker suites already use). The app's own
//                      wrapper takes its worker branch, spawns the REAL
//                      workers/solver-worker-entry.mjs, and the round-trip is genuine.
//                      Terminate counts come from the shim, so "cancel terminated it"
//                      is asserted deterministically rather than timed.
//
//   FAULT INJECTION    with a stub Worker whose constructor fails on demand, on a
//                      freshly re-imported module so the latches start clean. This is
//                      the only way to reach the spawn-failure paths at all.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/solvers/primary-solver-worker.mjs";
import { installWorkerThreadsWorker, workerStats } from "./helpers/web-worker-shim.mjs";

const PSW: any = (_QD as any).PrimarySolverWorker;

/** A unit disk as quadrature data — h(w) = R²/w, the simplest solvable input. */
const DISK = (R = 1.4) => ({ poles: [{ a: { re: 0, im: 0 }, principal: [{ re: R * R, im: 0 }] }] });

/**
 * Options heavy enough that a solve is reliably still in flight a few ms later, so
 * cancel/supersede land on a RUNNING job rather than on an already-settled one.
 * (A trivial solve would make those assertions vacuously true.)
 */
const SLOW = { numRestarts: 400, newton: { maxIter: 400, tolerance: 1e-14 } };

const waitBusy = (probe: () => boolean) =>
  vi.waitFor(() => expect(probe()).toBe(true), { timeout: 8000, interval: 5 });

/** Settle a promise without letting a rejection escape — we assert ON the rejection. */
async function outcome(p: Promise<unknown>): Promise<{ ok: boolean; value: any }> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, value: e };
  }
}

describe("PrimarySolverWorker lifecycle (real worker path)", () => {
  let uninstall: () => void;

  beforeAll(async () => {
    uninstall = installWorkerThreadsWorker();
    await PSW.ensureReady();
    // Everything below is about the WORKER path; on the main-thread fallback most of it
    // is meaningless, so fail loudly here rather than passing vacuously.
    expect(PSW._isMainThreadFallback()).toBe(false);
    expect(PSW._hasWorker()).toBe(true);
  });

  afterAll(() => {
    for (const stop of [PSW.cancel, PSW.cancelAux, PSW.cancelLive]) {
      try { stop(); } catch { /* ignore */ }
    }
    if (uninstall) uninstall();
  });

  describe("primary lane", () => {
    it("round-trips a real solve through the worker", async () => {
      const res = await PSW.solve(DISK(), {});
      expect(res.success).toBe(true);
      expect(res.primary).toBeTruthy();
    });

    it("reports isBusy only while a job is outstanding", async () => {
      expect(PSW.isBusy()).toBe(false);
      const p = PSW.solve(DISK(), SLOW);
      await waitBusy(() => PSW.isBusy());
      await outcome(p);
      expect(PSW.isBusy()).toBe(false);
    });

    it("supersedes an in-flight solve, rejecting the old promise as { aborted, superseded }", async () => {
      // The distinction the UI depends on: a superseded job is NOT an error to surface, it is a
      // request the user replaced. Without `superseded` the caller cannot tell it from a crash.
      await PSW.ensureReady();
      const first = outcome(PSW.solve(DISK(1.4), SLOW));
      const second = outcome(PSW.solve(DISK(1.6), {}));
      const a = await first;
      expect(a.ok).toBe(false);
      expect(a.value).toMatchObject({ aborted: true, superseded: true });
      const b = await second;
      expect(b.ok).toBe(true);
      expect(b.value.success).toBe(true); // the replacement still completes
    });

    it("cancel() terminates the worker and settles the in-flight promise as { aborted }", async () => {
      await PSW.ensureReady();
      const before = workerStats.terminated;
      const p = outcome(PSW.solve(DISK(), SLOW));
      await waitBusy(() => PSW.isBusy());
      PSW.cancel();
      // Terminate is the point: a solve deep in nested Newton cannot be preempted any other way,
      // so "cancelled" that merely dropped the listener would leave a core burning.
      expect(workerStats.terminated).toBe(before + 1);
      expect(PSW._hasWorker()).toBe(false);
      const r = await p;
      expect(r.ok).toBe(false);
      expect(r.value).toMatchObject({ aborted: true });
      expect(r.value.superseded).toBeUndefined(); // a cancel is not a supersession
    });

    it("respawns after a cancel, so the next solve still works", async () => {
      // cancel() is terminate-and-recreate; if the recreate half broke, the app would fall silent
      // after the first cancelled edit.
      const res = await PSW.solve(DISK(), {});
      expect(res.success).toBe(true);
      expect(PSW._hasWorker()).toBe(true);
    });
  });

  describe("aux lane (background alternate search)", () => {
    it("round-trips a search through its own worker", async () => {
      const base = await PSW.solve(DISK(), {});
      const alts = await PSW.searchAlternates(DISK(), { w0: base.primary.phi.w0 }, [], { numRestarts: 2 });
      expect(Array.isArray(alts)).toBe(true);
      expect(PSW._hasAuxWorker()).toBe(true);
    });

    it("supersedes an in-flight search and terminates on cancelAux", async () => {
      const norm = { w0: { re: 0, im: 0 } };
      const first = outcome(PSW.searchAlternates(DISK(), norm, [], { numRestarts: 400, bgAltChunks: 40 }));
      await waitBusy(() => PSW.isAuxBusy());
      const second = outcome(PSW.searchAlternates(DISK(), norm, [], { numRestarts: 1 }));
      expect((await first).value).toMatchObject({ aborted: true, superseded: true });
      await second;
      const before = workerStats.terminated;
      const third = outcome(PSW.searchAlternates(DISK(), norm, [], { numRestarts: 400, bgAltChunks: 40 }));
      await waitBusy(() => PSW.isAuxBusy());
      PSW.cancelAux();
      expect(workerStats.terminated).toBe(before + 1);
      expect((await third).value).toMatchObject({ aborted: true });
    });
  });

  describe("live lane (per-drag-frame solve)", () => {
    it("round-trips a warm-started live step through its own worker", async () => {
      const base = await PSW.solve(DISK(), {});
      const seed = (_QD as any).clonePhi(base.primary.phi);
      const res = await PSW.liveSolve(DISK(), seed, { newton: { maxIter: 30 }, numSamples: 64 });
      expect(res.success).toBe(true);
      expect(PSW._hasLiveWorker()).toBe(true);
    });

    it("supersedes an in-flight live job as { aborted, superseded }", async () => {
      // The drag path fires one of these per frame, so supersession is the NORMAL case here, not
      // an edge case: every frame but the last is expected to be replaced.
      const base = await PSW.solve(DISK(), {});
      const seed = (_QD as any).clonePhi(base.primary.phi);
      const heavy = { newton: { maxIter: 4000, tolerance: 1e-15 }, numSamples: 4096 };
      const first = outcome(PSW.liveSolve(DISK(), seed, heavy));
      await waitBusy(() => PSW.isLiveBusy());
      const second = outcome(PSW.liveSolve(DISK(), seed, { newton: { maxIter: 20 }, numSamples: 32 }));
      expect((await first).value).toMatchObject({ aborted: true, superseded: true });
      expect((await second).ok).toBe(true);
    });

    it("cancelLive terminates only the live worker, leaving the primary lane's worker alive", async () => {
      // The three lanes are separate Workers precisely so one cannot disturb another.
      await PSW.ensureReady();
      await PSW.liveSolve(DISK(), null, { newton: { maxIter: 5 } }).catch(() => {});
      expect(PSW._hasLiveWorker()).toBe(true);
      PSW.cancelLive();
      expect(PSW._hasLiveWorker()).toBe(false);
      expect(PSW._hasWorker()).toBe(true); // untouched
    });
  });
});

// -----------------------------------------------------------------------------
// Fault injection — the spawn-failure paths, which no environment reaches naturally.
// -----------------------------------------------------------------------------

/** A Worker that is constructible but inert; `failNext` makes the next construction throw. */
function makeStubWorker(state: { failures: number }) {
  return class StubWorker {
    constructor() {
      if (state.failures > 0) {
        state.failures--;
        throw new Error("stub: worker failed to spawn");
      }
    }
    addEventListener(): void {}
    removeEventListener(): void {}
    postMessage(): void {}
    terminate(): void {}
  };
}

/**
 * Re-import the module with clean state. The latches are module-scope inside an IIFE, so a
 * previously-tripped fallback would otherwise leak into the next test and make it vacuous.
 */
async function freshPSW(): Promise<any> {
  vi.resetModules();
  const qd: any = (await import("../app/solvers/solver.mjs")).default;
  // The whole solver cluster, not just the core: the main-thread FALLBACK calls
  // QD.solveInverseQD on this thread, which needs every family registered — exactly what the
  // browser's main thread has, and what solver-worker-entry gets inside a worker. Importing only
  // solver.mjs would leave the fallback unable to solve, making the fallback tests vacuous.
  await import("../app/workers/solver-graph.mjs");
  await import("../app/solvers/primary-solver-worker.mjs");
  return qd.PrimarySolverWorker;
}

describe("PrimarySolverWorker fallback latches are per-lane (qd-psw-fallback-latch-01)", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("an aux-worker spawn failure does not demote the primary or live lanes", async () => {
    // The defect: ONE module-level `_mainThreadFallback` was written by all three catch blocks and
    // read by all three solve paths, so whichever lane failed first silently moved the other two
    // onto the main thread for the rest of the session — re-introducing the exact UI freeze the
    // primary worker exists to prevent, with no message naming it.
    const state = { failures: 1 };
    vi.stubGlobal("Worker", makeStubWorker(state));
    const psw = await freshPSW();

    // Aux goes first, and its spawn is the one that fails.
    await psw.searchAlternates({ poles: [] }, {}, [], {}).catch(() => {});
    expect(psw._isAuxFallback()).toBe(true);
    expect(psw._hasAuxWorker()).toBe(false);

    // The other two lanes must still take the worker path.
    await psw.ensureReady();
    expect(psw._isMainThreadFallback()).toBe(false); // was `true` pre-fix
    expect(psw._hasWorker()).toBe(true);

    psw.liveSolve({ poles: [] }, null, {}).catch(() => {});
    await vi.waitFor(() => expect(psw._hasLiveWorker()).toBe(true), { timeout: 4000, interval: 5 });
    expect(psw._isLiveFallback()).toBe(false); // was `true` pre-fix
  });

  it("a primary spawn failure does not demote the aux or live lanes", async () => {
    // The mirror direction, so the fix is not just "aux happens to be checked first".
    const state = { failures: 1 };
    vi.stubGlobal("Worker", makeStubWorker(state));
    const psw = await freshPSW();

    await psw.ensureReady();
    expect(psw._isMainThreadFallback()).toBe(true);
    expect(psw._hasWorker()).toBe(false);

    psw.searchAlternates({ poles: [] }, {}, [], {}).catch(() => {});
    await vi.waitFor(() => expect(psw._hasAuxWorker()).toBe(true), { timeout: 4000, interval: 5 });
    expect(psw._isAuxFallback()).toBe(false); // was `true` pre-fix
  });

  it("without any Worker at all, every lane falls back and still resolves", async () => {
    // The file:// / Node case the module was written for: no worker anywhere, but callers must not
    // have to special-case it — each lane resolves through its main-thread equivalent.
    vi.stubGlobal("Worker", undefined);
    const psw = await freshPSW();
    await psw.ensureReady();
    expect(psw._isMainThreadFallback()).toBe(true);

    const res = await psw.solve(DISK(), {});
    expect(res.success).toBe(true); // resolved by QD.solveInverseQD on this thread
    expect(psw._isAuxFallback()).toBe(false); // untouched until the aux lane is actually used
    const alts = await psw.searchAlternates(DISK(), { w0: res.primary.phi.w0 }, [], { numRestarts: 1 });
    expect(Array.isArray(alts)).toBe(true);
    expect(psw._isAuxFallback()).toBe(true); // …and now it has its own verdict
  });
});
