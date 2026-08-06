// @vitest-environment node
//
// Characterization net (refactor Stage B4-2b) for the SymWorker CRASH contract — the worker-level
// `error` handling of the Algebra tab's heavy-symbolic-op lane (Gröbner / solveZeroDim). Complements
// B4-2a (PSW lanes): `sym-worker-lifecycle.test.ts` / `sym-worker-thread.test.ts` cover cancel /
// supersede / the CAUGHT-job-error path (an `m.error` message), but NOT a worker-level `error` event.
// Driven with the shared vitest/helpers/fake-worker.mjs. Refs: QD-UI-1, sym-worker.mjs.
//
// UPDATE (QD-SYM-LOAD, post-ship bug): a worker `error` BEFORE the worker ever returned a message is a
// LOAD failure (bundle 404 / stale-cache chunk hash / syntax error). It now SELF-HEALS — the in-flight op
// is re-run via QD.Sym.runJob on the main thread and its promise RESOLVES, and the lane latches to the
// permanent fallback — instead of rejecting with "sym-worker crashed". The old reject hard-failed
// ★ Auto-reduce & solve on the deployed PWA when a lazily-spawned worker chunk 404'd (autoUpdate SW swap
// after a hash-changing deploy). A worker that HAD returned a message then errors is a transient crash and
// still rejects + respawns. Mirrors the PSW lanes' `_everWorked` split (#227). Tests-only harness.
import { describe, it, expect, vi, afterAll } from "vitest";
import { FakeWorker } from "./helpers/fake-worker.mjs";

const tick = async (n = 5) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

// Returns the QD namespace (SymWorker is qd.SymWorker). A stub QD.Sym.runJob lets the main-thread
// fallback settle deterministically without importing the real exact-symbolic core — the fallback just
// echoes its args, so a test can prove the in-flight op re-ran on the main thread and with what.
async function freshSym(): Promise<any> {
  vi.resetModules();
  const qd: any = (await import("../app/solvers/solver.mjs")).default;
  await import("../app/algebra/sym-worker.mjs"); // side effect: registers qd.SymWorker
  qd.Sym = { runJob: (op: string, payload: any) => ({ mainThread: true, op, payload }) };
  return qd;
}

afterAll(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("SymWorker crash contract (QD-UI-1)", () => {
  it("a LOAD-failure `error` (worker never returned a message) SELF-HEALS the in-flight op to the main thread + latches fallback", async () => {
    FakeWorker.reset();
    vi.stubGlobal("Worker", FakeWorker);
    const qd = await freshSym();
    const sym = qd.SymWorker;
    const p = sym.run("groebner", { g: 1 }, {});
    p.catch(() => {});
    await tick();
    const w = FakeWorker.lastInstance;
    expect(sym.isBusy()).toBe(true);
    expect(w).toBeTruthy();
    // Errors before ever posting a message → the bundle never loaded; the bare event a 404 produces.
    w!.fire("error", { message: "", filename: "", lineno: 0 });
    // The op does NOT hard-fail: it re-runs on the main thread and RESOLVES with the fallback's result.
    await expect(p).resolves.toEqual({ mainThread: true, op: "groebner", payload: { g: 1 } });
    expect(sym.isBusy()).toBe(false);
    expect(sym._hasWorker()).toBe(false);
    expect(sym._isFallback()).toBe(true); // a never-loaded worker latches to the main thread permanently
    // Sticky: a subsequent run() goes STRAIGHT to the main thread — no re-spawn, no re-error.
    const before = FakeWorker.instances.length;
    await expect(sym.run("dimension", { d: 2 }, {})).resolves.toEqual({ mainThread: true, op: "dimension", payload: { d: 2 } });
    expect(FakeWorker.instances.length).toBe(before);
  });

  it("an `error` AFTER the worker returned a message (transient crash) rejects the job and does NOT latch", async () => {
    FakeWorker.reset();
    vi.stubGlobal("Worker", FakeWorker);
    const qd = await freshSym();
    const sym = qd.SymWorker;
    const p = sym.run("groebner", {}, {});
    p.catch(() => {});
    await tick();
    const w = FakeWorker.lastInstance;
    // The worker proves it loaded by posting a progress message, THEN crashes.
    w!.fire("message", { data: { kind: "progress", jobId: 1, info: { basis: 3, pairs: 5 } } });
    await tick();
    w!.fire("error", { message: "boom", filename: "s.js", lineno: 3 });
    await expect(p).rejects.toThrow(/sym-worker crashed/);
    expect(sym.isBusy()).toBe(false);
    expect(sym._hasWorker()).toBe(false);
    expect(sym._isFallback()).toBe(false); // a worked-then-crash is transient → NOT the permanent latch
  });

  it("F4: an IDLE `error` (no job in flight) latches `_fallback` PERMANENTLY", async () => {
    FakeWorker.reset();
    vi.stubGlobal("Worker", FakeWorker);
    const qd = await freshSym();
    const sym = qd.SymWorker;
    await sym.ensureReady(); // spawn the worker with NO job outstanding
    const w = FakeWorker.lastInstance;
    expect(w).toBeTruthy();
    expect(sym._isFallback()).toBe(false);

    w!.fire("error", { message: "module load failed" }); // an idle/load error, no job to reject
    expect(sym._isFallback()).toBe(true); // F4: fall back to the main thread permanently
    expect(sym._hasWorker()).toBe(false);

    // Sticky: a subsequent ensureReady() must NOT spawn a fresh worker (don't rebuild-and-re-error).
    const before = FakeWorker.instances.length;
    await sym.ensureReady();
    expect(FakeWorker.instances.length).toBe(before);
    expect(sym._hasWorker()).toBe(false);
  });

  it("a `messageerror` does NOT settle the job — sym has no messageerror handler (frozen for C2)", async () => {
    FakeWorker.reset();
    vi.stubGlobal("Worker", FakeWorker);
    const qd = await freshSym();
    const sym = qd.SymWorker;
    const p = sym.run("groebner", {}, {});
    p.catch(() => {});
    await tick();
    const w = FakeWorker.lastInstance;
    expect(sym.isBusy()).toBe(true);
    w!.fire("messageerror", {});
    await tick();
    expect(sym.isBusy()).toBe(true); // still in-flight (current behavior — no handler)
    expect(sym._hasWorker()).toBe(true);
  });
});
