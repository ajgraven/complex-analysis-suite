// The results drawer, and the labelling decision underneath it.
//
// Eleven analyses (solve, classify, dimension, prove, bifurcation, resolvent, univalence, RCTD
// import, shape-from-moments, …) shared ONE docked verdict slot, so running Dimension after
// Classify destroyed Classify's answer with no way back — on results that cost tens of seconds.
// Keeping them is the easy half. The hard half is saying, of a result you kept, whether it still
// describes the system on screen: a verdict from three reductions ago, redisplayed beside today's
// column still wearing its original '=' pill, is a false attribution — the worst class of bug in
// this project (CLAUDE.md honest labeling).
//
// resultStateOf is that decision, made pure so it can be tested directly rather than scanned for.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
// The results-drawer subsystem moved to its own module in D1d seam 2; the structural invariants
// below (only showResult/reshowResult touch the canvas, the (track,sig) key, the stale-demotion,
// the surfaced cap) follow the code there. The rerender + autosave pins stay on algebra-ui.mjs.
const DRAWER = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-results-drawer.mjs", import.meta.url)), "utf8");
// The autosave core moved to its own module in D1d seam 4; the "results are not autosaved" cross-check
// below follows `function _writeAutosave` there.
const AUTOSAVE = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-autosave.mjs", import.meta.url)), "utf8");

let UI: any;
beforeAll(async () => {
  await import("../app/solver.mjs");
  const reg: any = await import("../app/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  UI = reg.QD_UI;
});

describe("resultStateOf — does this result still describe what I am looking at?", () => {
  const S = (a: string, b: string, c: string, d: string) => UI.resultStateOf(a, b, c, d);

  it("same branch, same frontier → current", () => {
    expect(S("t0", "2|n7,n8", "t0", "2|n7,n8")).toBe("current");
  });

  it("same branch, frontier moved → stale, not current", () => {
    // One more reduction on the same branch. The result described the previous column.
    expect(S("t0", "2|n7,n8", "t0", "3|n9,n10")).toBe("stale");
  });

  it("a reordered frontier is a different frontier", () => {
    // _branchSig is column + the ordered id list, so a reorder changes the system's presentation
    // and the signature with it. Treating it as current would be a guess.
    expect(S("t0", "2|n7,n8", "t0", "2|n8,n7")).toBe("stale");
  });

  it("another branch → branch, even when the signatures happen to match", () => {
    // Two forks can share a frontier signature right after the fork. They are still different
    // systems, and calling this 'current' would attribute one branch's proof to another.
    expect(S("t1", "2|n7,n8", "t0", "2|n7,n8")).toBe("branch");
  });

  it("another branch outranks a stale frontier", () => {
    // Both differ; 'branch' is the more specific and more honest of the two, because "the
    // derivation has changed since" implies a history the viewed branch does not have.
    expect(S("t1", "2|n7,n8", "t0", "9|nZ")).toBe("branch");
  });

  it("only ever returns the three known states", () => {
    const cases: [string, string, string, string][] = [
      ["t0", "a", "t0", "a"], ["t0", "a", "t0", "b"],
      ["t1", "a", "t0", "a"], ["t1", "a", "t0", "b"],
    ];
    cases.forEach((c) => expect(["current", "stale", "branch"]).toContain(S(...c)));
  });

  it("is pure — no store, no DOM", () => {
    // Called twice with the same arguments in any order, always the same answer.
    expect(S("t0", "a", "t0", "b")).toBe(S("t0", "a", "t0", "b"));
    expect(S("t0", "a", "t0", "a")).toBe("current");
  });
});

describe("results are recorded, not overwritten", () => {
  it("every verdict-producing site routes through the recorder", () => {
    // The failure this closes: eleven callers writing straight into one slot. If a new analysis
    // is added later and calls canvas.setVerdict directly, its result is invisible to the drawer
    // AND unkeyed — so it could never be marked stale. Only the drawer's own machinery may touch
    // the canvas directly — and since D1d seam 2 that machinery lives in algebra-results-drawer.mjs,
    // so the ~13 analysis call sites in algebra-ui.mjs reach it only through the showResult facade.
    const direct = [...DRAWER.matchAll(/canvas\.setVerdict\(/g)];
    expect(direct.length, "only showResult and reshowResult may call setVerdict").toBe(3);
    const showAt = DRAWER.indexOf("function showResult");
    direct.forEach((m) => expect(m.index!).toBeGreaterThan(showAt));
    expect([...SRC.matchAll(/canvas\.setVerdict\(/g)].length,
      "no analysis in algebra-ui.mjs may call setVerdict directly — all route through showResult").toBe(0);
  });

  it("records the branch AND the frontier, not just the result", () => {
    expect(/_results\.unshift\(\{[^}]*track[^}]*sig:/.test(DRAWER)).toBe(true);
  });

  it("re-showing anything but a current result demotes it", () => {
    // The pristine payload is kept; the demotion is applied to a COPY at display time, so a
    // result cannot be permanently downgraded by having been looked at on the wrong branch.
    expect(/if \(st === 'current'\) \{ canvas\.setVerdict\(r\.data\); return; \}/.test(DRAWER)).toBe(true);
    expect(/Object\.assign\(\{\}, r\.data, \{[\s\S]{0,80}stale: true/.test(DRAWER)).toBe(true);
  });

  it("says a different thing for a cross-branch result", () => {
    // "the derivation has changed since" is the same-branch sentence and is wrong here.
    expect(DRAWER).toContain("staleNote");
    expect(/st === 'branch'[\s\S]{0,200}describes that branch/.test(DRAWER)).toBe(true);
  });

  it("re-evaluates state on every rerender", () => {
    // State is relative to the current branch and frontier, and rerender is what changes both.
    const rr = SRC.slice(SRC.indexOf("function rerender"), SRC.indexOf("function refreshStatusBar"));
    expect(rr).toContain("renderDrawer()");
  });

  it("does not silently forget — the cap is surfaced", () => {
    // A drawer that quietly drops the oldest entries reads as "that is everything you ran".
    expect(/_resultsDropped\+\+/.test(DRAWER)).toBe(true);
    expect(/_resultsDropped[\s\S]{0,400}dropped/.test(DRAWER)).toBe(true);
  });

  it("is session-scoped, not autosaved", () => {
    // Restoring a verdict across a reload restores a claim about a system state that may no
    // longer exist — the same false attribution with a longer fuse.
    const auto = AUTOSAVE.slice(AUTOSAVE.indexOf("function _writeAutosave"), AUTOSAVE.indexOf("function _writeAutosave") + 1400);
    expect(auto).not.toContain("_results");
  });
});
