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
    expect(posted).toHaveLength(0);
  });
});

describe("solver-worker-entry dispatch — unknown kind (QD-UI-4)", () => {
  it("CURRENT (pre-C2): an unrecognized kind is silently dropped — the hang C2 fixes", async () => {
    const { posted, fire } = await loadSolverEntry();
    fire({ kind: "bogus", jobId: 11, hData: {} });
    expect(posted).toHaveLength(0); // pre-fix: nothing posted back -> the caller's promise never settles
  });
});
