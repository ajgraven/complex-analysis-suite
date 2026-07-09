import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ParamSlicePool from "../app/param-slice/param-slice-pool.mjs";

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
