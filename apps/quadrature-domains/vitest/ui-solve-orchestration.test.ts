// @vitest-environment jsdom
//
// Characterization net (refactor Stage B4-1) for the ui-solve.mjs SOLVE ORCHESTRATION —
// the token/supersede/settle/dispatch/busy/cancel invariants that later decomposition of
// `ui.mjs`/`ui-solve.mjs` must preserve. These pin CURRENT behavior of the UNMODIFIED code.
//
// Seam: `QD_UI.installSolve(uiCtx)` (ui-solve.mjs:51) — a DI factory. We drive it with a fake
// `uiCtx` (fake builders + a real `$` over jsdom) and control the solve outcome by stubbing the
// worker lane / fallback on the shared `QD` namespace (imported from solver.mjs, so mutating the
// imported object is what ui-solve.mjs sees). No real solver math and no real Worker are used, and
// no solve is allowed to SUCCEED here, so the heavy success-render path is intentionally not
// exercised (that belongs to a later slice) — this slice pins orchestration only.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QD_UI } from "../app/ui/ui-registry.mjs";
import "../app/ui/ui-solve.mjs"; // side effect: installs QD_UI.installSolve + imports solver.mjs
import _QD from "../app/solvers/solver.mjs";

const QD = _QD as any;

// A promise whose settlement we control from the test.
function deferred<T = any>() {
  let resolve!: (v: T) => void, reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
// Flush queued microtasks (promise continuations) without advancing fake timers.
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

// The DOM ids ui-solve reads in the orchestration paths (busy row, phase, elapsed, try-harder,
// alt-search indicator) + a few more so any incidental query resolves.
const DOM = `
  <div id="solve-busy-row" class="hidden"></div>
  <div id="solve-phase"></div>
  <div id="solve-elapsed"></div>
  <button id="try-harder-btn"></button>
  <div id="alt-search-indicator" class="hidden"></div>
  <div id="alternates-card" class="hidden"></div>
  <div id="alternates-list"></div>
  <div id="status-panel"></div>
  <div id="sp-badge"></div>
`;

const $ = (sel: string, parent: ParentNode = document) => parent.querySelector(sel);

function makeCtx(over: Record<string, any> = {}) {
  const setStatus = vi.fn();
  const publishPrimarySolution = vi.fn();
  const writeUrlState = vi.fn();
  const ctx: any = {
    state: {
      aggressiveness: "standard",
      mode: "pqd-bounded",
      altSearchToken: 0,
      altSearchActive: false,
      searchOptions: { autoEscalate: true },
      current: null,
      autoSwitchSingular: false,
      selectedSolutionIdx: 0,
    },
    $,
    MODES: {},
    PRESETS: { standard: { tag: "standard" }, exhaustive: { tag: "exhaustive" } },
    modeDescriptor: () => ({ autoEscalate: false, familyTag: "pqd-bounded" }),
    debounce: (fn: any) => fn,
    plot: { clear: vi.fn() },
    setStatus,
    escapeHTML: (s: any) => String(s),
    escapeAttr: (s: any) => String(s),
    formatExp: (s: any) => String(s),
    applyModeVisuals: vi.fn(),
    buildHData: vi.fn(() => ({ poles: [{ principal: [{ re: 1, im: 0 }] }] })),
    buildNormalization: vi.fn(() => ({ w0: { re: 0, im: 0 }, c: 1, unbounded: false })),
    buildSolverOptions: vi.fn(() => ({})),
    buildAltSearchOptions: vi.fn(() => ({})),
    applyNormToOpts: vi.fn(),
    publishPrimarySolution,
    writeUrlState,
  };
  Object.assign(ctx, over);
  // convenience handles for assertions
  ctx._spies = { setStatus, publishPrimarySolution, writeUrlState };
  return ctx;
}

let origPSW: any;
let origSolveInverse: any;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = DOM;
  origPSW = QD.PrimarySolverWorker;
  origSolveInverse = QD.solveInverseQD;
});

afterEach(() => {
  QD.PrimarySolverWorker = origPSW;
  QD.solveInverseQD = origSolveInverse;
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("ui-solve orchestration — input guards (no dispatch, no busy)", () => {
  it("no built hData → 'No poles entered' error, and never dispatches", () => {
    const solveSpy = vi.fn();
    QD.PrimarySolverWorker = { solve: solveSpy, cancel: vi.fn() };
    const ctx = makeCtx({ buildHData: () => null });
    const api = QD_UI.installSolve(ctx) as any;
    api.solveAndRender();
    expect(ctx._spies.setStatus).toHaveBeenLastCalledWith({ kind: "err", text: "No poles entered." });
    expect(solveSpy).not.toHaveBeenCalled();
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(true);
  });

  it("built.error → surfaces that error and never dispatches", () => {
    const solveSpy = vi.fn();
    QD.PrimarySolverWorker = { solve: solveSpy, cancel: vi.fn() };
    const ctx = makeCtx({ buildHData: () => ({ error: "bad h(w)" }) });
    (QD_UI.installSolve(ctx) as any).solveAndRender();
    expect(ctx._spies.setStatus).toHaveBeenLastCalledWith({ kind: "err", text: "bad h(w)" });
    expect(solveSpy).not.toHaveBeenCalled();
  });

  it("normalization error → surfaces that error and never dispatches", () => {
    const solveSpy = vi.fn();
    QD.PrimarySolverWorker = { solve: solveSpy, cancel: vi.fn() };
    const ctx = makeCtx({ buildNormalization: () => ({ error: "w0 must be nonzero" }) });
    (QD_UI.installSolve(ctx) as any).solveAndRender();
    expect(ctx._spies.setStatus).toHaveBeenLastCalledWith({ kind: "err", text: "w0 must be nonzero" });
    expect(solveSpy).not.toHaveBeenCalled();
  });
});

describe("ui-solve orchestration — dispatch target", () => {
  it("dispatches to the PrimarySolverWorker when present (with built + opts) and shows busy", () => {
    const d = deferred();
    const solveSpy = vi.fn(() => d.promise);
    QD.PrimarySolverWorker = { solve: solveSpy, cancel: vi.fn() };
    const ctx = makeCtx();
    (QD_UI.installSolve(ctx) as any).solveAndRender();
    expect(solveSpy).toHaveBeenCalledTimes(1);
    const [builtArg, optsArg] = solveSpy.mock.calls[0];
    expect(builtArg).toBe(ctx.buildHData.mock.results[0].value);
    expect(optsArg).toBeTypeOf("object");
    // busy indicator up while the (still-pending) solve runs
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(false);
    expect(ctx._spies.writeUrlState).toHaveBeenCalledTimes(1);
  });

  it("falls back to QD.solveInverseQD when no worker lane is present", async () => {
    QD.PrimarySolverWorker = undefined;
    const d = deferred();
    QD.solveInverseQD = vi.fn(() => d.promise); // keep it pending → no success render
    const ctx = makeCtx();
    (QD_UI.installSolve(ctx) as any).solveAndRender();
    await flush();
    expect(QD.solveInverseQD).toHaveBeenCalledTimes(1);
  });
});

describe("ui-solve orchestration — settle semantics", () => {
  it("a solver rejection settles as a visible 'Solver error' and clears busy", async () => {
    const d = deferred();
    QD.PrimarySolverWorker = { solve: vi.fn(() => d.promise), cancel: vi.fn() };
    const ctx = makeCtx();
    (QD_UI.installSolve(ctx) as any).solveAndRender();
    d.reject(new Error("boom"));
    await flush();
    expect(ctx._spies.setStatus).toHaveBeenLastCalledWith({ kind: "err", text: "Solver error: boom" });
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(true);
    expect(ctx._spies.publishPrimarySolution).not.toHaveBeenCalled();
  });

  it("an ABORTED rejection settles SILENTLY (no error status) — user cancel/supersede", async () => {
    const d = deferred();
    QD.PrimarySolverWorker = { solve: vi.fn(() => d.promise), cancel: vi.fn() };
    const ctx = makeCtx();
    (QD_UI.installSolve(ctx) as any).solveAndRender();
    // last status before settle is the 'Solving…' info line
    expect(ctx._spies.setStatus).toHaveBeenLastCalledWith({ kind: "info", text: "Solving…" });
    d.reject({ aborted: true });
    await flush();
    // no 'Solver error' was appended
    const calls = ctx._spies.setStatus.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((s: any) => s && typeof s.text === "string" && s.text.startsWith("Solver error"))).toBe(false);
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(true);
  });
});

describe("ui-solve orchestration — supersede (stale results are dropped)", () => {
  it("a superseded solve's late rejection does NOT paint an error", async () => {
    const d1 = deferred();
    const d2 = deferred();
    const solve = vi
      .fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    QD.PrimarySolverWorker = { solve, cancel: vi.fn() };
    const ctx = makeCtx();
    const api = QD_UI.installSolve(ctx) as any;

    api.solveAndRender(); // solve #1 (token N) — pending
    api.solveAndRender(); // solve #2 (token N+1) — supersedes #1
    expect(solve).toHaveBeenCalledTimes(2);

    d1.reject(new Error("stale-boom")); // #1 completes AFTER being superseded
    await flush();
    // #1 was superseded → its catch returns before setStatus; no stale error painted
    const errs = ctx._spies.setStatus.mock.calls
      .map((c: any[]) => c[0])
      .filter((s: any) => s && typeof s.text === "string" && s.text.startsWith("Solver error"));
    expect(errs).toEqual([]);
  });

  it("the busy indicator stays up when a STALE solve settles — the newer solve still owns it", async () => {
    const d1 = deferred();
    const d2 = deferred();
    const solve = vi
      .fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    QD.PrimarySolverWorker = { solve, cancel: vi.fn() };
    const ctx = makeCtx();
    const api = QD_UI.installSolve(ctx) as any;
    api.solveAndRender(); // #1
    api.solveAndRender(); // #2 supersedes #1; busy re-shown, owned by #2
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(false);

    d1.reject({ aborted: true }); // stale #1 settles — its finally must NOT hide busy
    await flush();
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(false);

    d2.reject(new Error("boom2")); // the owning solve settles — now busy hides
    await flush();
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(true);
  });
});

describe("ui-solve orchestration — auto-escalation", () => {
  it("re-dispatches with the exhaustive preset when the first pass fails and escalation is enabled", async () => {
    const d1 = deferred();
    const d2 = deferred();
    const solve = vi
      .fn()
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    QD.PrimarySolverWorker = { solve, cancel: vi.fn() };
    // enable escalation via the mode descriptor; state.searchOptions.autoEscalate defaults true,
    // state.aggressiveness is 'standard' (!= 'exhaustive') → the escalation gate opens.
    const ctx = makeCtx({ modeDescriptor: () => ({ autoEscalate: true, familyTag: "pqd-bounded" }) });
    (QD_UI.installSolve(ctx) as any).solveAndRender();

    d1.resolve({ success: false, error: "no root", attempts: [] }); // first pass fails
    await flush();

    expect(solve).toHaveBeenCalledTimes(2); // escalated dispatch fired (second one left pending → no render)
    expect(solve.mock.calls[1][1]).toBeTypeOf("object");
    expect(($("#solve-phase") as HTMLElement).textContent).toContain("escalating");
  });
});

describe("ui-solve orchestration — live vs authoritative race (WP5b / review A2)", () => {
  it("an in-flight live solve resolving AFTER solveAndRender does NOT clobber state.current with a live result", async () => {
    // Drive the rAF-scheduled live lane synchronously.
    const origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    const origSelectFamily = QD.selectFamily;
    try {
      const phi = { family: "pqd-bounded", unbounded: false, branches: [], w0: { re: 0, im: 0 } };
      QD.selectFamily = vi.fn(() => ({ initialGuess: () => phi }));

      const liveD = deferred();
      const authD = deferred();
      const liveSolve = vi.fn(() => liveD.promise);
      const solve = vi.fn(() => authD.promise);
      QD.PrimarySolverWorker = { liveSolve, solve, cancel: vi.fn() };

      const ctx = makeCtx();
      ctx.state.samples = 500;
      const api = QD_UI.installSolve(ctx) as any;

      api.scheduleQuickSolve(); // live lane dispatched (live token 1), left in flight
      expect(liveSolve).toHaveBeenCalledTimes(1);

      api.solveAndRender(); // authoritative solve starts → WP5b bumps the live token to 2
      expect(solve).toHaveBeenCalledTimes(1);

      // The live solve now settles successfully — but it was superseded by the authoritative solve.
      liveD.resolve({
        success: true,
        phi,
        univalent: true,
        identity: 1,
        identityOK: true,
        residual: 0,
        iterations: 3,
      });
      await flush();

      // Its `.then` guard (myToken !== _liveSolveToken) must have bailed BEFORE writing state.current, so
      // the cheap method:'live' / LIVE_DISPLAY_SAMPLES result never lands. The authoritative solve (still
      // pending) stays the sole writer. Pre-fix, state.current.primary.method would be 'live'.
      expect(ctx.state.current == null || ctx.state.current.primary?.method !== "live").toBe(true);
    } finally {
      globalThis.requestAnimationFrame = origRaf;
      QD.selectFamily = origSelectFamily;
    }
  });
});

describe("ui-solve orchestration — cancelSolve", () => {
  it("cancels the worker, bumps the alt-search token, hides busy, and reports cancelled", () => {
    const cancel = vi.fn();
    const d = deferred();
    QD.PrimarySolverWorker = { solve: vi.fn(() => d.promise), cancel };
    const ctx = makeCtx();
    const api = QD_UI.installSolve(ctx) as any;
    api.solveAndRender();
    const altTokenBefore = ctx.state.altSearchToken;
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(false);

    api.cancelSolve();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(ctx.state.altSearchToken).toBe(altTokenBefore + 1);
    expect(ctx.state.altSearchActive).toBe(false);
    expect(($("#alt-search-indicator") as HTMLElement).classList.contains("hidden")).toBe(true);
    expect(($("#solve-busy-row") as HTMLElement).classList.contains("hidden")).toBe(true);
    expect(ctx._spies.setStatus).toHaveBeenLastCalledWith({ kind: "warn", text: "Solve cancelled." });
  });

  it("after cancel, the in-flight solve's late rejection is treated as superseded (no error)", async () => {
    const d = deferred();
    QD.PrimarySolverWorker = { solve: vi.fn(() => d.promise), cancel: vi.fn() };
    const ctx = makeCtx();
    const api = QD_UI.installSolve(ctx) as any;
    api.solveAndRender();
    api.cancelSolve(); // bumps _solveAndRenderToken
    d.reject({ aborted: true });
    await flush();
    const errs = ctx._spies.setStatus.mock.calls
      .map((c: any[]) => c[0])
      .filter((s: any) => s && typeof s.text === "string" && s.text.startsWith("Solver error"));
    expect(errs).toEqual([]);
  });
});
