import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ParamSlicePool from "../app/param-slice/param-slice-pool.mjs";
import PS from "../app/param-slice/param-slice-common.mjs";

// Regression guard for the Parameter-slice ESM-port wiring defects (code-review CRITICAL findings).
// The port turned the classic `window.ParamSlice*` globals into module exports but left consumers
// reading the old identifiers, and the worker pool's cancel-latch was never reset for a reused pool.
// The headless numeric suite never drives this browser/worker path, so all three shipped silently:
//   1. param-slice-ui referenced an unimported `ParamSlicePool` -> ReferenceError on "Render slice".
//   2. param-slice-render read `global.ParamSlice` (never assigned) -> TypeError in the 2-D sweep.
//   3. the pool's `_cancelled` latch persisted across renders -> a render after a Cancel hung forever.

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const uiSrc = src("../app/param-slice/param-slice-ui.mjs");
const renderSrc = src("../app/param-slice/param-slice-render.mjs");

// A minimal well-conditioned bounded-QD scenario (a cardioid family), mirroring param-slice.test.js.
const SCENARIO = {
  hData: { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }], polyPart: [] },
  norm: { w0: { re: 0, im: 0 } },
  opts: {
    numRestarts: 1, identityTol: 1e-5, findAlternates: false,
    newton: { maxIter: 40, tolerance: 1e-9 },
    usePhases: { direct: true, continuation: false, multistart: true, diverse: false, deflation: false },
  },
};
const POINTS = [
  [{ ref: { kind: "poleRe", poleIdx: 0 }, value: -0.25 }],
  [{ ref: { kind: "poleRe", poleIdx: 0 }, value: 0.25 }],
];
// The pool dispatched and returned a classified result (a `cls` string label) per point. This
// guards the POOL + UI WIRING, not solve accuracy: a pure-ESM import of the kernel here doesn't
// register every family module the vm-bootstrapped headless suite does, so the solves may classify
// as "unclassified" — that's fine, the point is that solveBatch ran and produced one result/point.
const dispatched = (results: readonly ({ cls?: unknown } | null | undefined)[]) =>
  results.length === POINTS.length && results.every((r) => !!r && typeof r.cls === "string");

describe("param-slice pool + UI wiring (ESM-port regression guards)", () => {
  it("ParamSlicePool default export exposes create() + MainThreadPool", () => {
    expect(typeof ParamSlicePool.create).toBe("function");
    expect(typeof ParamSlicePool.MainThreadPool).toBe("function");
  });

  it("create() yields a usable pool that solves a batch (the path ensurePool() awaits)", async () => {
    // In Node/vitest there is no Web Worker, so create() falls back to the main-thread pool.
    const pool = await ParamSlicePool.create();
    expect(pool).toBeTruthy();
    expect(typeof pool.solveBatch).toBe("function");
    expect(typeof pool.arm).toBe("function");
    expect(dispatched(await pool.solveBatch(SCENARIO, "bounded", POINTS, null))).toBe(true);
    pool.terminate?.();
  });

  it("a Cancel persists across an in-flight batch, and arm() re-enables a reused pool (bug 3)", async () => {
    const pool = new ParamSlicePool.MainThreadPool();
    // A mid-render cancel MUST stop the in-flight batch (does no work) ...
    pool.cancel();
    const afterCancel = await pool.solveBatch(SCENARIO, "bounded", POINTS, null);
    expect(afterCancel.every((r: unknown) => r == null)).toBe(true);
    // ... but the NEXT render re-arms the cached pool -> full results again (the fix).
    pool.arm();
    expect(dispatched(await pool.solveBatch(SCENARIO, "bounded", POINTS, null))).toBe(true);
  });

  it("param-slice-ui imports ParamSlicePool (bug 1)", () => {
    expect(/import\s+ParamSlicePool\s+from\s+['"][^'"]*param-slice-pool\.mjs['"]/.test(uiSrc)).toBe(true);
  });

  it("param-slice-render uses the imported ParamSlice, not global.ParamSlice (bug 2)", () => {
    expect(/global\.ParamSlice\b/.test(renderSrc)).toBe(false);
    expect(/import\s+ParamSlice\s+from/.test(renderSrc)).toBe(true);
  });

  it("a crashed worker settles its in-flight tile and drops from the pool (QDW-1: no hang, no leak)", async () => {
    interface PoolLike {
      activeJobs: Map<number, unknown>;
      workers: unknown[];
      submitTile: (s: unknown, id: number, pts: unknown, hints: unknown) => Promise<unknown>;
      _onWorkerError: (w: unknown, msg: string) => void;
    }
    const PoolClass = (ParamSlicePool as unknown as { Pool: new (workers: unknown[], url: unknown) => PoolLike })
      .Pool;
    // A minimal worker stub — the pool only calls addEventListener/postMessage/terminate on it.
    const w = { addEventListener() {}, removeEventListener() {}, postMessage() {}, terminate() {} };
    const pool = new PoolClass([w], null);
    const p = pool.submitTile({}, 1, POINTS, null); // dispatched to w ⇒ now in-flight
    expect(pool.activeJobs.size).toBe(1);
    pool._onWorkerError(w, "boom"); // the worker dies mid-tile
    expect(pool.workers.length).toBe(0); // dead worker removed ⇒ no thread leak
    expect(pool.activeJobs.size).toBe(0); // its job settled ⇒ no hang
    await expect(p).resolves.toBeNull(); // the awaiting sweep unwinds instead of hanging forever (pre-fix)
  });
});

describe("canAccept + one-point batch — the hover live-solve offload (qd-paramslice-hover-01)", () => {
  // The hover preview used to run PS.solveOnePoint synchronously on the main thread. Over a cell
  // where no QD exists there is no warm hint to help and the solver spends its whole multistart
  // budget before reporting `no-root` — measured 86.6 ms, once per 150 ms settle. It now goes
  // through pool.solveBatch with a ONE-ELEMENT batch, which needs no new job kind because the tile
  // handler already runs exactly this solve per point. These pin the two claims that makes.
  const ONE = [POINTS[0]];

  it("a one-element batch returns the same result as the direct solveOnePoint call it replaced", async () => {
    // THE equivalence the offload rests on. If this drifts, hovering silently reports a different
    // classification than clicking the same cell does.
    const pool = new ParamSlicePool.MainThreadPool();
    const tag = (PS as any).MODE_FAMILY_TAG ? (PS as any).MODE_FAMILY_TAG["bounded"] : undefined;
    const direct: any = (PS as any).solveOnePoint(SCENARIO, POINTS[0], null, tag);
    const viaPool: any = (await pool.solveBatch(SCENARIO, "bounded", ONE, [null]))[0];
    expect(viaPool.cls).toBe(direct.cls);
    expect(!!viaPool.phiSerialized).toBe(!!direct.phiSerialized);
  });

  it("canAccept() reports the cancel latch, which is what gates the offload", async () => {
    // _dispatch refuses to run while the pool is cancel-latched, so a hover job pushed then would
    // sit in `pending` and never settle — the preview would hang. The UI asks first.
    const pool = new ParamSlicePool.MainThreadPool();
    expect(pool.canAccept()).toBe(true);
    pool.cancel();
    expect(pool.canAccept()).toBe(false);
    pool.arm();
    expect(pool.canAccept()).toBe(true);
  });

  it("a cancelled pool yields no result rather than a wrong one", async () => {
    // The UI treats a missing result as "not a solve failure" and leaves the cached preview alone.
    const pool = new ParamSlicePool.MainThreadPool();
    pool.cancel();
    const out = await pool.solveBatch(SCENARIO, "bounded", ONE, [null]);
    expect(out.every((r: unknown) => r == null)).toBe(true);
  });

  it("the real worker Pool exposes canAccept with the same contract", () => {
    // Both pool kinds must answer, or the UI's `typeof pool.canAccept === 'function'` guard would
    // silently keep the whole worker path on the main thread.
    const pool = new ParamSlicePool.Pool([{} as never], null);
    expect(pool.canAccept()).toBe(true);
    pool.cancel();
    expect(pool.canAccept()).toBe(false);
    pool.arm();
    expect(pool.canAccept()).toBe(true);
    pool.workers.length = 0; // every worker died
    expect(pool.canAccept()).toBe(false);
  });
});

// The worker Pool's own event-wiring + full-drain, pinned before the Group-C lane dedup (B4-2c, QD-UI-1).
// The existing cases above cover create/solveBatch, cancel+arm, the survivor≥1 crash drop, and canAccept.
// These add the two paths a lane refactor could still silently break: runSweep's row-dispatch → onTile →
// done tally, and the survivor=0 branch of _onWorkerError (the LAST worker dying must drain the pending
// queue, not just the in-flight tile — else a reused sweep hangs forever).
describe("param-slice worker Pool: runSweep event-wiring + last-worker drain (B4-2c, QD-UI-1)", () => {
  interface PoolLike {
    runSweep(cfg: unknown): { cancel(): void; done: Promise<{ tilesDone: number; totalTiles: number; msTotal: number }> };
    submitTile(s: unknown, id: number, pts: unknown, hints: unknown): Promise<unknown>;
    _onWorkerError(w: unknown, msg: string): void;
    activeJobs: Map<number, unknown>;
    pending: unknown[];
    workers: unknown[];
  }
  const PoolClass = (ParamSlicePool as unknown as { Pool: new (workers: unknown[], url: unknown) => PoolLike }).Pool;

  // A fake worker that answers each 'tile' post with one result per sweep point, so runSweep's
  // row-dispatch → onTile → done tally can be driven deterministically without a real thread.
  function echoWorker() {
    const listeners: Record<string, ((ev: unknown) => void)[]> = {};
    return {
      addEventListener(t: string, f: (ev: unknown) => void) { (listeners[t] ||= []).push(f); },
      removeEventListener(t: string, f: (ev: unknown) => void) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
      terminate() {},
      postMessage(msg: { jobId: number; sweepPoints: unknown[] }) {
        const results = msg.sweepPoints.map(() => ({ cls: "unclassified" }));
        queueMicrotask(() => { for (const f of [...(listeners["message"] || [])]) f({ data: { jobId: msg.jobId, results } }); });
      },
    };
  }

  it("runSweep dispatches one tile per row, fires onTile for each, and resolves done with the tally", async () => {
    const pool = new PoolClass([echoWorker()], null);
    const axes = [
      { ref: { kind: "poleRe", poleIdx: 0 }, min: -1, max: 1, n: 2 },
      { ref: { kind: "poleIm", poleIdx: 0 }, min: -1, max: 1, n: 2 },
    ]; // 2-D ⇒ n1 = 2 rows
    const rows: number[] = [];
    const { done } = pool.runSweep({
      scenario: SCENARIO, mode: "bounded", axes,
      onTile: (t: { row: number }) => rows.push(t.row),
      onError: () => {},
    });
    const summary = await done;
    expect(rows.slice().sort()).toEqual([0, 1]);       // one onTile per row
    expect(summary.totalTiles).toBe(2);
    expect(summary.tilesDone).toBe(2);
    expect(typeof summary.msTotal).toBe("number");
  });

  it("when the LAST worker dies, both the in-flight tile AND the queued tiles drain (no hang)", async () => {
    const w = { addEventListener() {}, removeEventListener() {}, postMessage() {}, terminate() {} };
    const pool = new PoolClass([w], null);
    const inflight = pool.submitTile({}, 1, POINTS, null);   // dispatched to the one worker ⇒ in-flight
    const queued = pool.submitTile({}, 1, POINTS, null);     // no idle worker ⇒ waits in `pending`
    expect(pool.activeJobs.size).toBe(1);
    expect(pool.pending.length).toBe(1);

    pool._onWorkerError(w, "boom");                          // the only worker dies

    expect(pool.workers.length).toBe(0);
    await expect(inflight).resolves.toBeNull();             // its in-flight tile settled
    await expect(queued).resolves.toBeNull();               // the pending tile drained (survivor=0 branch)
  });
});
