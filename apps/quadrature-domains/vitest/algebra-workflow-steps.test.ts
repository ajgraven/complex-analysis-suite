// @vitest-environment jsdom
//
// The ①②③④ workflow strip. It was four static <span>s: no handler, no state binding, no
// current-step marker. It asserted a fixed four-step procedure and then never said where you
// were in it, which steps you had done, or that ✦ Prove performs all four in one click — and two
// of the sections it named are collapsed by default, so it pointed at things it would not open.
//
// workflowStepStates is pure and exposed on QD_UI (the PROV_UI pattern), so the state machine is
// tested behaviourally rather than by reading source.
// Source-level checks (section names, no positional selectors) live in the node-environment
// companion algebra-workflow-sections.test.ts: jsdom rewrites import.meta.url to http:, so
// fileURLToPath throws here. Same split as algebra-shortcuts-focus / -table.
import { describe, it, expect, beforeAll } from "vitest";

let steps: any, stepStates: any;
beforeAll(async () => {
  await import("../app/solvers/solver.mjs");
  const reg: any = await import("../app/ui/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  steps = reg.QD_UI.WORKFLOW_STEPS;
  stepStates = reg.QD_UI.workflowStepStates;
});

/** An empty workspace: nothing seeded, nothing assumed, nothing reduced, nothing analyzed. */
const EMPTY = { seeded: false, staleSeed: false, hypotheses: 0, reductions: 0, resultAny: false, resultCurrent: false };
const f = (over: any) => Object.assign({}, EMPTY, over);

describe("the strip covers the workflow it claims", () => {
  it("has the four steps, in order, each with a key", () => {
    expect(steps.map((s: any) => s.key)).toEqual(["seed", "assume", "reduce", "analyze"]);
  });

  it("exactly one step has no section, and it is the seed step", () => {
    // Seeding lives in the pinned header, not a collapsible section — so ① focuses the seed button
    // instead of opening a panel. Any OTHER step losing its section would silently become inert.
    const sectionless = steps.filter((s: any) => !s.section).map((s: any) => s.key);
    expect(sectionless).toEqual(["seed"]);
  });
});

describe("state reflects what is actually in the workspace", () => {
  it("an empty workspace has everything to do, and seeding is next", () => {
    const { states, next } = stepStates(EMPTY);
    expect(states).toEqual({ seed: "todo", assume: "todo", reduce: "todo", analyze: "todo" });
    expect(next).toBe("seed");
  });

  it("seeding completes ① and moves the marker on", () => {
    const { states, next } = stepStates(f({ seeded: true }));
    expect(states.seed).toBe("done");
    expect(next).toBe("assume");
  });

  it("a stale seed is not 'done', and is the next action even with later work present", () => {
    // ensureSeed refuses every downstream operation while the seed is stale, so the strip must not
    // point at Reduce or Analyze — those buttons will not do anything. This is the case where
    // "next = first not-done" would give the wrong answer, which is why it is special-cased.
    const { states, next } = stepStates(f({ seeded: true, staleSeed: true, hypotheses: 2, reductions: 3 }));
    expect(states.seed).toBe("stale");
    expect(next).toBe("seed");
  });

  it("progress can go backwards: a result that no longer describes the system is stale, not done", () => {
    // The whole reason this is not a progress bar. Reducing after analyzing invalidates the
    // verdict — the drawer already says so, and the strip must agree rather than keep a tick.
    const analyzed = stepStates(f({ seeded: true, hypotheses: 1, reductions: 1, resultAny: true, resultCurrent: true }));
    expect(analyzed.states.analyze).toBe("done");
    const invalidated = stepStates(f({ seeded: true, hypotheses: 1, reductions: 2, resultAny: true, resultCurrent: false }));
    expect(invalidated.states.analyze).toBe("stale");
    expect(invalidated.next).toBe(null);       // nothing is 'todo' — the work exists, it is just old
  });

  it("no result at all is 'todo', which is different from a stale one", () => {
    // Conflating these would show a fresh workspace and an invalidated verdict identically.
    expect(stepStates(f({ seeded: true })).states.analyze).toBe("todo");
    expect(stepStates(f({ seeded: true, resultAny: true, resultCurrent: false })).states.analyze).toBe("stale");
  });

  it("a fully worked system marks every step done and nothing next", () => {
    const { states, next } = stepStates(
      f({ seeded: true, hypotheses: 3, reductions: 4, resultAny: true, resultCurrent: true }));
    expect(Object.values(states)).toEqual(["done", "done", "done", "done"]);
    expect(next).toBe(null);
  });

  it("the marker skips steps already done rather than always pointing at ②", () => {
    // Seeding + assumptions present but no reduction ⇒ Reduce is next.
    expect(stepStates(f({ seeded: true, hypotheses: 2 })).next).toBe("reduce");
    // …and with reductions too, Analyze.
    expect(stepStates(f({ seeded: true, hypotheses: 2, reductions: 1 })).next).toBe("analyze");
  });
});

