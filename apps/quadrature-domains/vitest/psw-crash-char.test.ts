// @vitest-environment node
//
// Characterization net (refactor Stage B4-2a) for the PrimarySolverWorker CRASH contract — the
// worker-level `error` / `messageerror` handling that has ZERO existing coverage (psw-lifecycle.test.ts
// covers round-trip / supersede / cancel / spawn-fault fallback; NOT crash-settle). This freezes the
// current behavior of the three PSW lanes so the Group-C worker-lane dedup (C1 `createWorkerLane`, C2
// typed protocol) can't silently change it — including the deliberate ASYMMETRY that only the primary
// lane has a `messageerror` handler (aux/live do not). Refs: QD-UI-1, primary-solver-worker.mjs.
//
// Driven with the shared vitest/helpers/fake-worker.mjs `FakeWorker` (stubbed as global `Worker`), whose
// `.fire('error'|'messageerror', ev)` delivers a worker-level event to the lane's real listeners. The
// lanes are module-scoped singletons on the QD namespace, so each test re-imports fresh (the freshPSW
// pattern from psw-lifecycle.test.ts) to avoid a tripped latch leaking between tests. Tests-only; no
// source change.
import { describe, it, expect, vi, afterAll } from "vitest";
import { FakeWorker } from "./helpers/fake-worker.mjs";

const tick = async (n = 5) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

async function freshPSW(): Promise<any> {
  vi.resetModules();
  const qd: any = (await import("../app/solvers/solver.mjs")).default;
  // The main-thread fallback calls QD.solveInverseQD/searchAlternates/liveSolveStep on this thread, which
  // need every family registered — same as the browser main thread. (See psw-lifecycle.test.ts freshPSW.)
  await import("../app/workers/solver-graph.mjs");
  await import("../app/solvers/primary-solver-worker.mjs");
  return qd.PrimarySolverWorker;
}

// Spawn a fresh PSW with FakeWorker installed, start a solve on `lane`, and advance to the in-flight
// state (a live FakeWorker instance + `_inflight` set). Returns the lane's fresh psw, the worker, and the
// (deliberately un-awaited) job promise. The promise is pre-`.catch`ed so a rejection during setup is not
// an unhandled rejection; each test still asserts on it explicitly.
async function armLane(lane: "primary" | "aux" | "live") {
  FakeWorker.reset();
  vi.stubGlobal("Worker", FakeWorker);
  const psw = await freshPSW();
  const promise: Promise<any> =
    lane === "primary" ? psw.solve({ poles: [] }, {})
    : lane === "aux"   ? psw.searchAlternates({ poles: [] }, {}, [], {})
    :                    psw.liveSolve({ poles: [] }, null, {});
  promise.catch(() => {});
  await tick(); // let ensureReady spawn the FakeWorker and post the job (sets _inflight)
  return { psw, worker: FakeWorker.lastInstance as FakeWorker | null, promise };
}

afterAll(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("PSW crash contract — a worker-level `error` settles the in-flight job (QD-UI-1)", () => {
  it("primary: `error` rejects the solve as a REAL crash (not an abort) and disposes the worker", async () => {
    const { psw, worker, promise } = await armLane("primary");
    expect(psw.isBusy()).toBe(true);
    expect(worker).toBeTruthy();
    worker!.fire("error", { message: "boom", filename: "w.js", lineno: 7 });
    await expect(promise).rejects.toThrow(/solver worker crashed/);
    expect(psw.isBusy()).toBe(false);
    expect(psw._hasWorker()).toBe(false); // disposed → a fresh solve respawns
    expect(psw._isMainThreadFallback()).toBe(false); // a crash is NOT a permanent fallback latch
    expect(worker!.terminated).toBe(true);
  });

  it("primary: `messageerror` (structured-clone failure) rejects the solve", async () => {
    const { worker, promise } = await armLane("primary");
    worker!.fire("messageerror", {});
    await expect(promise).rejects.toThrow(/structured-clone/);
  });

  it("aux: `error` rejects the alt-search and disposes the aux worker", async () => {
    const { psw, worker, promise } = await armLane("aux");
    expect(psw.isAuxBusy()).toBe(true);
    worker!.fire("error", { message: "boom" });
    await expect(promise).rejects.toThrow(/alt-search worker crashed/);
    expect(psw.isAuxBusy()).toBe(false);
    expect(psw._hasAuxWorker()).toBe(false);
  });

  it("live: `error` rejects the live solve and disposes the live worker", async () => {
    const { psw, worker, promise } = await armLane("live");
    expect(psw.isLiveBusy()).toBe(true);
    worker!.fire("error", { message: "boom" });
    await expect(promise).rejects.toThrow(/live-solve worker crashed/);
    expect(psw.isLiveBusy()).toBe(false);
    expect(psw._hasLiveWorker()).toBe(false);
  });
});

describe("PSW `messageerror` asymmetry — only primary has a handler (frozen for C2)", () => {
  it("aux: a `messageerror` does NOT settle the job — aux has no messageerror listener", async () => {
    const { psw, worker } = await armLane("aux");
    worker!.fire("messageerror", {});
    await tick();
    expect(psw.isAuxBusy()).toBe(true); // still in-flight (current behavior — no handler)
    expect(psw._hasAuxWorker()).toBe(true); // not disposed
  });

  it("live: a `messageerror` does NOT settle the job — live has no messageerror listener", async () => {
    const { psw, worker } = await armLane("live");
    worker!.fire("messageerror", {});
    await tick();
    expect(psw.isLiveBusy()).toBe(true);
    expect(psw._hasLiveWorker()).toBe(true);
  });
});

describe("PSW fallback-latch independence — the 3rd direction (live fails first)", () => {
  it("a live-worker spawn failure does not demote the primary or aux lanes", async () => {
    FakeWorker.reset();
    FakeWorker.failNext(1); // only the NEXT construction (live's) throws
    vi.stubGlobal("Worker", FakeWorker);
    const psw = await freshPSW();

    // Live goes first and its spawn fails → its OWN latch trips; it runs on the main thread.
    await psw.liveSolve({ poles: [] }, null, {}).catch(() => {});
    expect(psw._isLiveFallback()).toBe(true);
    expect(psw._hasLiveWorker()).toBe(false);

    // Primary + aux must still take the WORKER path (failNext already consumed), not be demoted.
    psw.solve({ poles: [] }, {}).catch(() => {});
    psw.searchAlternates({ poles: [] }, {}, [], {}).catch(() => {});
    await tick();
    expect(psw._isMainThreadFallback()).toBe(false);
    expect(psw._hasWorker()).toBe(true);
    expect(psw._isAuxFallback()).toBe(false);
    expect(psw._hasAuxWorker()).toBe(true);
  });
});
