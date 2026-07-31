// @vitest-environment node
//
// Characterization net (refactor Stage B4-2b) for the SymWorker CRASH contract — the worker-level
// `error` handling of the Algebra tab's heavy-symbolic-op lane (Gröbner / solveZeroDim). Complements
// B4-2a (PSW lanes): `sym-worker-lifecycle.test.ts` / `sym-worker-thread.test.ts` cover cancel /
// supersede / the CAUGHT-job-error path (an `m.error` message), but NOT a worker-level `error` event,
// and not the sym-unique F4 latch. This freezes those before the Group-C lane dedup. Tests-only; driven
// with the shared vitest/helpers/fake-worker.mjs. Refs: QD-UI-1, sym-worker.mjs.
import { describe, it, expect, vi, afterAll } from "vitest";
import { FakeWorker } from "./helpers/fake-worker.mjs";

const tick = async (n = 5) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

async function freshSym(): Promise<any> {
  vi.resetModules();
  const qd: any = (await import("../app/solver.mjs")).default;
  await import("../app/algebra/sym-worker.mjs"); // side effect: registers qd.SymWorker
  return qd.SymWorker;
}

afterAll(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("SymWorker crash contract (QD-UI-1)", () => {
  it("a worker `error` WHILE A JOB is in flight rejects it as /sym-worker crashed/ and disposes", async () => {
    FakeWorker.reset();
    vi.stubGlobal("Worker", FakeWorker);
    const sym = await freshSym();
    const p = sym.run("groebner", {}, {});
    p.catch(() => {});
    await tick();
    const w = FakeWorker.lastInstance;
    expect(sym.isBusy()).toBe(true);
    expect(w).toBeTruthy();
    w!.fire("error", { message: "boom", filename: "s.js", lineno: 3 });
    await expect(p).rejects.toThrow(/sym-worker crashed/);
    expect(sym.isBusy()).toBe(false);
    expect(sym._hasWorker()).toBe(false);
    expect(sym._isFallback()).toBe(false); // a crash-WITH-a-job is NOT the sticky latch (that's F4, no-job)
  });

  it("F4: an IDLE `error` (no job in flight) latches `_fallback` PERMANENTLY", async () => {
    FakeWorker.reset();
    vi.stubGlobal("Worker", FakeWorker);
    const sym = await freshSym();
    await sym.ensureReady(); // spawn the worker with NO job outstanding
    const w = FakeWorker.lastInstance;
    expect(w).toBeTruthy();
    expect(sym._isFallback()).toBe(false);

    w!.fire("error", { message: "module load failed" }); // an idle/load error, no job to reject
    expect(sym._isFallback()).toBe(true); // F4: fall back to the main thread permanently
    expect(sym._hasWorker()).toBe(false);

    // Sticky: a subsequent ensureReady() must NOT spawn a fresh worker (that's the whole point of F4 —
    // don't rebuild-and-re-error on every op).
    const before = FakeWorker.instances.length;
    await sym.ensureReady();
    expect(FakeWorker.instances.length).toBe(before);
    expect(sym._hasWorker()).toBe(false);
  });

  it("a `messageerror` does NOT settle the job — sym has no messageerror handler (frozen for C2)", async () => {
    FakeWorker.reset();
    vi.stubGlobal("Worker", FakeWorker);
    const sym = await freshSym();
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
