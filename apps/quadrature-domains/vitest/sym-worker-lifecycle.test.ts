// =============================================================================
// sym-worker-lifecycle -- cancel / abort-signal / supersede coverage for QD.SymWorker,
// exercised on the REAL worker path via the node:worker_threads shim (see
// sym-worker-thread.test.ts for the differential that path is built on). Before this,
// cancel + supersession had ZERO coverage, and superseding an in-flight job did NOT
// terminate the worker -- because the entry runs runJob synchronously, the discarded
// computation kept burning a core and the new job queued behind its full remaining
// runtime. This suite locks the fixed behavior: cancel()/abort terminate + reject
// {aborted}, and a superseding run() rejects the old promise {aborted,superseded} AND
// terminates its worker (asserted deterministically via the shim's terminate counter,
// not a flaky wall-clock timing).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/faber-analysis.mjs";
import "../app/algebra/sym-worker.mjs";
import { installWorkerThreadsWorker, workerStats } from "./helpers/web-worker-shim.mjs";

const S: any = (_QD as any).Sym;
const SymWorker: any = (_QD as any).SymWorker;
const { MPoly, Gaussian } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const tl = (polys: any[]) => polys.map((p) => p.termList());
const waitBusy = () => vi.waitFor(() => expect(SymWorker.isBusy()).toBe(true), { timeout: 8000, interval: 5 });

// A job heavy enough to stay in flight across the few ms it takes a cancel/supersede to
// land (cyclic-5 = ~112 S-pair steps, ~30ms compute + worker startup >> the cancel latency).
function cyclic5Payload() {
  const a = V("a"), b = V("b"), c = V("c"), d = V("d"), e = V("e");
  const prod = (...xs: any[]) => xs.reduce((p, x) => p.mul(x));
  const polys = [
    a.add(b).add(c).add(d).add(e),
    prod(a, b).add(prod(b, c)).add(prod(c, d)).add(prod(d, e)).add(prod(e, a)),
    prod(a, b, c).add(prod(b, c, d)).add(prod(c, d, e)).add(prod(d, e, a)).add(prod(e, a, b)),
    prod(a, b, c, d).add(prod(b, c, d, e)).add(prod(c, d, e, a)).add(prod(d, e, a, b)).add(prod(e, a, b, c)),
    prod(a, b, c, d, e).sub(I(1)),
  ];
  return { polys: tl(polys), orderSpec: { kind: "grevlex", varOrder: ["a", "b", "c", "d", "e"] } };
}
// A trivial job for the superseding op.
const quickDim = () => ({ polys: tl([V("x").pow(2).sub(I(1))]), vars: ["x"] });

describe("sym-worker lifecycle: cancel / abort / supersede (real worker path)", () => {
  let uninstall: () => void;

  beforeAll(async () => {
    uninstall = installWorkerThreadsWorker();
    await SymWorker.ensureReady();
    expect(SymWorker._isFallback()).toBe(false); // cancel/supersede only mean anything on the worker path
  });

  afterAll(() => {
    try { SymWorker.cancel(); } catch { /* ignore */ }
    if (uninstall) uninstall();
  });

  it("cancel() aborts the in-flight job (rejects {aborted}, clears busy)", async () => {
    const p = SymWorker.run("groebner", cyclic5Payload(), {});
    await waitBusy();
    SymWorker.cancel();
    await expect(p).rejects.toMatchObject({ aborted: true });
    expect(SymWorker.isBusy()).toBe(false);
  });

  it("a pre-aborted signal rejects immediately with {aborted}", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(SymWorker.run("groebner", cyclic5Payload(), { signal: ctrl.signal })).rejects.toMatchObject({ aborted: true });
    expect(SymWorker.isBusy()).toBe(false);
  });

  it("aborting the signal mid-flight cancels the job", async () => {
    const ctrl = new AbortController();
    const p = SymWorker.run("groebner", cyclic5Payload(), { signal: ctrl.signal });
    await waitBusy();
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ aborted: true });
    expect(SymWorker.isBusy()).toBe(false);
  });

  it("superseding an in-flight job rejects it {aborted,superseded} AND terminates its worker; the new job still completes", async () => {
    const quick = quickDim();
    const terminatedBefore = workerStats.terminated;
    const spawnedBefore = workerStats.spawned;

    const a = SymWorker.run("groebner", cyclic5Payload(), {}); // job A: stays busy
    await waitBusy();
    const b = SymWorker.run("dimension", quick, {}); // job B supersedes A

    // A is rejected as superseded (a distinct flag from a user cancel)...
    await expect(a).rejects.toMatchObject({ aborted: true, superseded: true });
    // ...and B, on a freshly rebuilt worker, returns the correct result.
    expect(await b).toEqual(S.runJob("dimension", quick));

    // THE design-flaw fix: A's worker was terminated (pre-fix it kept running, so the
    // discarded Gröbner burned a core and B queued behind its full remaining runtime) and
    // a fresh worker was spawned for B.
    expect(workerStats.terminated).toBeGreaterThan(terminatedBefore);
    expect(workerStats.spawned).toBeGreaterThan(spawnedBefore);
  });

  it("keeps serving jobs after a supersede (rebuilt worker is healthy)", async () => {
    const dim = quickDim();
    expect(await SymWorker.run("dimension", dim, {})).toEqual(S.runJob("dimension", dim));
    const grid = { polys: tl([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))]), vars: ["x", "y"] };
    expect(await SymWorker.run("classify", grid, {})).toEqual(S.runJob("classify", grid));
  });
});
