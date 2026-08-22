// Characterization + spec for the primary-solver worker message protocol (QD-UI-4 / refactor C2).
//
// solver-worker-entry.mjs dispatches the 3 primary job kinds (solve / altSearch / liveSolve) and echoes
// `{ kind, jobId, result | error }`. Pre-C2 its `if / else if` chain had NO `else`, so a message whose
// `kind` matched nothing was silently DROPPED — the caller's kind-filtered listener never settled and the
// UI hung (QD-UI-4). This net pins the known-kind round-trip (the invariant C2 must preserve) and the
// unknown-kind handling (the one behavior C2 deliberately changes, per PLAN v1: drop -> error reply).
//
// The entry is driven with a stubbed `self` + stubbed solver methods, so the dispatch/envelope logic runs
// without doing any real solving. Mutation-verified.
import { describe, it, expect, vi, afterEach } from "vitest";
import { reply, replyError, dispatch } from "../app/workers/protocol.mjs";

interface FakeSelf {
  onmessage: ((e: { data: unknown }) => void) | null;
  postMessage: (m: unknown) => void;
}

// Load the real solver-worker-entry against a stubbed `self` (Node has none) + sentinel solver methods.
async function loadSolverEntry(): Promise<{ posted: any[]; fire: (msg: unknown) => void; QD: Record<string, any> }> {
  vi.resetModules();
  const posted: any[] = [];
  const fakeSelf: FakeSelf = { onmessage: null, postMessage: (m) => posted.push(m) };
  (globalThis as Record<string, unknown>).self = fakeSelf;
  const QD = (await import("../app/workers/solver-graph.mjs")).default as Record<string, any>;
  QD.solveInverseQD = (hData: any, opts: any) => ({ tag: "solve", hData, opts });
  QD.searchAlternates = (hData: any, norm: any, known: any) => ({ tag: "alt", norm, known });
  QD.liveSolveStep = (hData: any, initPhi: any) => ({ tag: "live", initPhi });
  await import("../app/workers/solver-worker-entry.mjs"); // installs fakeSelf.onmessage
  return { posted, fire: (msg: unknown) => fakeSelf.onmessage!({ data: msg }), QD };
}

async function loadAnalysisEntry(): Promise<{ posted: any[]; fire: (msg: unknown) => void; QD: Record<string, any> }> {
  vi.resetModules();
  const posted: any[] = [];
  const fakeSelf: FakeSelf = { onmessage: null, postMessage: (m) => posted.push(m) };
  (globalThis as Record<string, unknown>).self = fakeSelf;
  const QD = (await import("../app/workers/solver-graph.mjs")).default as Record<string, any>;
  await import("../app/workers/analysis-worker-entry.mjs");
  return { posted, fire: (msg: unknown) => fakeSelf.onmessage!({ data: msg }), QD };
}

afterEach(() => { delete (globalThis as Record<string, unknown>).self; });

describe("solver-worker-entry dispatch — known kinds round-trip (invariant, C2 must preserve)", () => {
  it("solve -> { kind:'solve', jobId, result }", async () => {
    const { posted, fire } = await loadSolverEntry();
    fire({ kind: "solve", jobId: 7, hData: { h: 1 }, opts: { o: 2 } });
    expect(posted).toEqual([{ kind: "solve", jobId: 7, result: { tag: "solve", hData: { h: 1 }, opts: { o: 2 } } }]);
  });

  it("altSearch and liveSolve echo their own kind + jobId", async () => {
    const { posted, fire } = await loadSolverEntry();
    fire({ kind: "altSearch", jobId: 8, hData: {}, norm: { w0: 0 }, known: [1], opts: {} });
    fire({ kind: "liveSolve", jobId: 9, hData: {}, initPhi: { p: 1 }, opts: {} });
    expect(posted[0]).toMatchObject({ kind: "altSearch", jobId: 8, result: { tag: "alt" } });
    expect(posted[1]).toMatchObject({ kind: "liveSolve", jobId: 9, result: { tag: "live" } });
  });

  it("a thrown solver error becomes { kind, jobId, error:<string> } (settles, not a hang)", async () => {
    const { posted, fire, QD } = await loadSolverEntry();
    QD.solveInverseQD = () => { throw new Error("boom"); };
    fire({ kind: "solve", jobId: 10, hData: {}, opts: {} });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: "solve", jobId: 10 });
    expect(String(posted[0].error)).toContain("boom");
  });

  it("a falsy message is ignored (no post)", async () => {
    const { posted, fire } = await loadSolverEntry();
    fire(null);
    expect(posted).toEqual([]);
  });
});

describe("analysis-worker-entry dispatch", () => {
  it("analyze returns the consolidated status-panel payload", async () => {
    const { posted, fire, QD } = await loadAnalysisEntry();
    QD.classifyUnivalence = vi.fn(() => ({ convex: { is: true } }));
    QD.classifyCusps = vi.fn(() => ({ cusps: [] }));
    QD.boundaryObservables = vi.fn(() => ({ area: 1 }));
    QD.estimateAccuracy = vi.fn(() => ({ significantDigits: 12 }));
    QD.detectSymmetry = vi.fn(() => ({ rotationalOrder: 1 }));

    fire({ kind: "analyze", jobId: 10, phi: { family: "boundedQD" }, hData: { poles: [] }, opts: { samples: 96 } });

    expect(posted).toEqual([{
      kind: "analyze", jobId: 10,
      result: {
        geom: { convex: { is: true } }, cuspProps: { cusps: [] },
        observables: { obs: { area: 1 }, acc: { significantDigits: 12 }, hasSeries: false },
        symmetry: { rotationalOrder: 1 },
      },
    }]);
  });

  it("a thrown analysis error becomes { kind, jobId, error:<string> }", async () => {
    const { posted, fire, QD } = await loadAnalysisEntry();
    QD.classifyUnivalence = () => { throw new Error("boom"); };
    fire({ kind: "analyze", jobId: 10, phi: {}, hData: {}, opts: {} });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: "analyze", jobId: 10 });
    expect(String(posted[0].error)).toContain("boom");
  });
});

describe("solver-worker-entry dispatch — unknown kind (QD-UI-4 fix, C2)", () => {
  it("an unrecognized kind now replies with an error envelope (echoing kind + jobId) instead of dropping", async () => {
    // Approved behavior change (PLAN v1 C2): pre-C2 this posted nothing and the caller hung; now the
    // caller receives a settling error reply. The reply echoes the request kind so the lane's
    // kind-filtered listener matches it and rejects.
    const { posted, fire } = await loadSolverEntry();
    fire({ kind: "bogus", jobId: 11, hData: {} });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: "bogus", jobId: 11 });
    expect(String(posted[0].error)).toMatch(/unhandled worker message kind: bogus/);
  });
});

describe("workers/protocol.mjs — envelope + dispatch (C2)", () => {
  it("reply builds { kind, jobId, result }", () => {
    expect(reply("solve", 3, { x: 1 })).toEqual({ kind: "solve", jobId: 3, result: { x: 1 } });
  });

  it("replyError stringifies the error (stack when present; the raw value otherwise)", () => {
    expect(replyError("solve", 3, new Error("nope")).error).toContain("nope");
    expect(replyError("solve", 3, "plain")).toEqual({ kind: "solve", jobId: 3, error: "plain" });
  });

  it("dispatch runs the matching handler and posts its result", () => {
    const posted: any[] = [];
    dispatch({ kind: "a", jobId: 1, v: 2 }, { a: (m: any) => m.v * 10 }, (x) => posted.push(x));
    expect(posted).toEqual([{ kind: "a", jobId: 1, result: 20 }]);
  });

  it("dispatch turns a handler throw into an error reply (settles, no hang)", () => {
    const posted: any[] = [];
    dispatch({ kind: "a", jobId: 1 }, { a: () => { throw new Error("bad"); } }, (x) => posted.push(x));
    expect(posted).toHaveLength(1);
    expect(String(posted[0].error)).toContain("bad");
  });

  it("dispatch replies with an error for an unhandled kind (QD-UI-4 fix), not silence", () => {
    const posted: any[] = [];
    dispatch({ kind: "ghost", jobId: 5 }, { a: () => 1 }, (x) => posted.push(x));
    expect(posted).toEqual([{ kind: "ghost", jobId: 5, error: "unhandled worker message kind: ghost" }]);
  });

  it("dispatch ignores a falsy message", () => {
    const posted: any[] = [];
    dispatch(null, { a: () => 1 }, (x) => posted.push(x));
    expect(posted).toHaveLength(0);
  });
});
