// @vitest-environment jsdom
// The faded drill and the front door (PLAN §7 PRA-10). The drill's answers are the ladder's, and its
// masked stages leak nothing; the door opens only states the app already computes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type App } from "../src/shell/app.js";
import { DEFAULT_STATE, resolveState } from "../src/shell/state.js";
import {
  DRILL_TASKS,
  PROGRESS_KEY,
  clearStage,
  drillAnswer,
  drillState,
  onDrillTask,
  openingStage,
  readProgress,
  type KeyStore,
} from "../src/shell/drill.js";
import { CLASSICS } from "../src/shell/frontDoor.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { DENYLIST, DOOR, DRILL } from "../src/engine/vocabulary.js";

const memory = (
  init: Record<string, string> = {},
): KeyStore & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
};

describe("the drill's answers are the ladder's", () => {
  it("each task's answer is the shallowest word the theorem says rules it out", () => {
    const answers = Object.fromEntries(
      DRILL_TASKS.map((t) => [t.id, drillAnswer(t).word]),
    );
    expect(answers).toEqual({
      quadratic: null, // one swap, and √ follows it
      mean: "d0", // no radicals: a single swap rules it out
      sqrt3: "d1", // one level: the 3-cycle commutator
      cardano: null, // two levels are enough for three roots
      sqrt4: "d1",
      ferrari: null, // three levels are enough for four
      q2: "d2",
      q3: "d3",
    });
  });

  it("no task grades against a measurement: nothing measured comes before the theorem's word", () => {
    for (const t of DRILL_TASKS) {
      const a = drillAnswer(t);
      const upTo =
        a.word === null
          ? a.rows
          : a.rows.slice(0, a.rows.findIndex((r) => r.id === a.word) + 1);
      for (const r of upTo) {
        expect(r.run, `${t.id} ${r.id}`).not.toBeNull();
        expect(r.run?.outcome?.kind, `${t.id} ${r.id}`).not.toBe("refutedMeasured");
        expect(r.run?.outcome?.kind, `${t.id} ${r.id}`).not.toBe("contradiction");
      }
      const answer = a.rows.find((r) => r.id === a.word);
      if (answer) expect(answer.verdict?.level).toBe("=");
    }
  });

  it("every task's state resolves, on its task; the worked stage runs the answer and the others run nothing", () => {
    for (const t of DRILL_TASKS)
      for (const stage of [0, 1, 2] as const) {
        const s = drillState(t.id, stage, DEFAULT_STATE);
        expect(onDrillTask(t.id, s)).toBe(true);
        expect(resolveState(s).poly).not.toBeNull();
        expect(s.ladder?.word).toBe(stage === 0 ? drillAnswer(t).word : null);
      }
  });
});

describe("drill progress", () => {
  it("absence and garbage read as none; a clear never lowers; the opening stage follows it", () => {
    expect(readProgress(null)).toEqual({});
    expect(readProgress(memory())).toEqual({});
    for (const bad of ["{", "[1]", "null", '"x"', '{"cardano": 7}', '{"nope": 1}'])
      expect(readProgress(memory({ [PROGRESS_KEY]: bad }))).toEqual({});
    const thrower: KeyStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readProgress(thrower)).toEqual({});
    expect(clearStage(thrower, "cardano", 0)).toEqual({ cardano: 1 });
    const m = memory();
    clearStage(m, "cardano", 1);
    expect(readProgress(m)).toEqual({ cardano: 2 });
    clearStage(m, "cardano", 0);
    expect(readProgress(m)).toEqual({ cardano: 2 });
    expect(openingStage(readProgress(m), "cardano")).toBe(2);
    expect(openingStage(readProgress(m), "q3")).toBe(0);
    clearStage(m, "cardano", 2);
    expect(openingStage(readProgress(m), "cardano")).toBe(2);
  });
});

function mount(hash = ""): { root: HTMLElement; app: App } {
  window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
  const root = document.createElement("div");
  root.id = "app";
  document.body.replaceChildren(root);
  return { root, app: mountApp(root) };
}
const card = (id: string): HTMLElement | null =>
  document.querySelector(`section[aria-labelledby='card-${id}']`);
const button = (text: string): HTMLButtonElement => {
  const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent === text,
  );
  if (!b) throw new Error(`no button ${text}`);
  return b;
};

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the Drill card", () => {
  it("a new task opens worked; reading it moves to guided and remembers so", () => {
    const { app } = mount();
    app.actions().drill("q2");
    expect(app.currentState().drill).toEqual({ task: "q2", stage: 0 });
    expect(card("drill")?.textContent).toMatch(DRILL.worked("d2"));
    expect(app.currentState().ladder?.word).toBe("d2");
    button(DRILL.studied).click();
    expect(app.currentState().drill).toEqual({ task: "q2", stage: 1 });
    expect(JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({
      q2: 1,
    });
    // A fresh mount opens the task where the reader left it.
    const { app: again } = mount();
    again.actions().drill("q2");
    expect(again.currentState().drill?.stage).toBe(1);
  });

  it("a masked stage leaks nothing until answered: no run, no verdict, no word list, no depth at stage 2", () => {
    const { app } = mount();
    app.actions().drill("q3", 2);
    const ladder = card("ladder")?.textContent ?? "";
    const drill = card("drill")?.textContent ?? "";
    expect(app.currentState().ladder?.word).toBeNull();
    expect(app.braid()).toBeNull();
    expect(card("ladder")?.querySelector(".words")).toBeNull();
    expect(card("ladder")?.querySelector(".verdict")).toBeNull();
    expect(ladder).not.toMatch(/\d levels? of radicals/);
    expect(ladder).not.toMatch(/three levels/);
    expect(ladder).not.toMatch(/never runs out/);
    expect(drill).not.toMatch(/depth \d/);
    expect(drill).not.toMatch(DRILL.worked("d3"));
    expect(card("drill")?.querySelectorAll(".level")).toHaveLength(0);
    // Stage 1 shows the depths.
    app.actions().drill("q3", 1);
    expect(card("drill")?.textContent).toMatch(/depth 3:/);
    expect(card("ladder")?.textContent).toMatch(/3 levels of radicals/);
  });

  it("an answer is graded from the ladder and reveals the runs; a right one clears the stage", () => {
    const { app } = mount();
    app.actions().drill("sqrt3", 1);
    app.actions().drillChoose("d0");
    expect(card("drill")?.querySelector(".grade")?.textContent).toBe(DRILL.wrong);
    // A wrong answer does not move the reader on.
    expect(
      [...(card("drill")?.querySelectorAll("button") ?? [])].some(
        (b) => b.textContent === DRILL.nextStage,
      ),
    ).toBe(false);
    expect(readProgress(window.localStorage).sqrt3 ?? 0).toBe(0);
    app.actions().drillChoose("d1");
    expect(card("drill")?.querySelector(".grade")?.textContent).toBe(DRILL.right);
    expect(readProgress(window.localStorage).sqrt3).toBe(2);
    expect(card("drill")?.querySelector(".answer")?.textContent).toMatch(/^=/);
    // Answered, the Ladder card is unmasked.
    expect(card("ladder")?.querySelector(".words")).not.toBeNull();
    button(DRILL.nextStage).click();
    expect(app.currentState().drill).toEqual({ task: "sqrt3", stage: 2 });
    app.actions().drillChoose("none");
    expect(card("drill")?.querySelector(".grade")?.textContent).toBe(DRILL.wrong);
    app.actions().drill("cardano", 2);
    app.actions().drillChoose("none");
    expect(card("drill")?.querySelector(".grade")?.textContent).toBe(DRILL.right);
  });

  it("editing the formula away pauses the drill and lifts the mask; returning restores it", () => {
    const { app } = mount();
    app.actions().drill("sqrt4", 1);
    app.actions().setFormula("cbrt(a0)");
    expect(card("drill")?.textContent).toMatch(DRILL.offTask);
    expect(card("ladder")?.querySelector(".words")).not.toBeNull();
    button(DRILL.returnTo).click();
    expect(app.currentState().ladder?.formula).toBe("sqrt(disc)");
    expect(card("ladder")?.querySelector(".words")).toBeNull();
  });

  it("a drill stage is a permalink; an unknown task or stage is refused by name", () => {
    const { app } = mount();
    app.actions().drill("ferrari", 2);
    const hash = encodeShell(app.currentState());
    const { app: again } = mount(hash);
    expect(again.currentState().drill).toEqual({ task: "ferrari", stage: 2 });
    expect(card("ladder")?.querySelector(".words")).toBeNull();
    const s = app.currentState();
    const bad = decodeShell(encodeShell({ ...s, drill: { task: "nope", stage: 1 } }));
    expect(bad?.ok === false && bad.reason).toBe("the drill has no task 'nope'");
    const badStage = decodeShell(
      encodeShell({ ...s, drill: { task: "q2", stage: 5 as 1 } }),
    );
    expect(badStage?.ok === false && badStage.reason).toBe("the drill has no stage 5");
  });

  it("leaving the drill, or taking the tour, ends it", () => {
    const { app } = mount();
    app.actions().drill("mean");
    button(DRILL.leave).click();
    expect(app.currentState().drill).toBeNull();
    expect(card("drill")).toBeNull();
    app.actions().drill("mean");
    app.actions().tour(0);
    expect(app.currentState().drill).toBeNull();
  });
});

describe("the front door", () => {
  it("opens as a modal over an inert page, and closes on Escape", () => {
    const { root } = mount();
    button(DOOR.open).click();
    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.querySelectorAll(".classic")).toHaveLength(CLASSICS.length);
    expect(root.hasAttribute("inert")).toBe(true);
    dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("a family classic, like every classic, leaves the tour and the drill", () => {
    const { app } = mount();
    app.actions().tour(2);
    app.actions().classic("family");
    expect(app.currentState().family?.open).toBe(true);
    expect(app.currentState().tour).toBeNull();
    app.actions().drill("q2");
    app.actions().classic("sottile");
    expect(app.currentState().drill).toBeNull();
  });

  it("every classic opens a state that resolves, and clicking one shuts the door", () => {
    const { app, root } = mount();
    for (const c of CLASSICS) {
      app.actions().classic(c.id);
      const res = app.live();
      expect(res.poly, c.id).not.toBeNull();
      if (c.does.kind === "family")
        expect(app.currentState().family?.open, c.id).toBe(true);
      if (c.does.kind === "tour") expect(app.currentState().tour, c.id).toBe(0);
      if (c.does.kind === "drill")
        expect(app.currentState().drill?.task, c.id).toBe("quadratic");
      if (c.does.kind === "open" && c.does.opens.kind === "ladder")
        expect(res.ladder?.ok, c.id).toBe(true);
      if (c.does.kind === "open" && c.does.lattice)
        expect(app.currentState().lattice).toBe(true);
    }
    button(DOOR.open).click();
    const pick = [...document.querySelectorAll<HTMLButtonElement>(".classic")].find((b) =>
      b.textContent?.startsWith("x⁵ + 20x + 16"),
    );
    pick?.click();
    expect(root.hasAttribute("inert")).toBe(false);
    expect(app.currentState().poly).toEqual({ kind: "text", text: "z^5 + 20z + 16" });
    expect(app.currentState().ring).toBe("Q");
  });

  it("the classics name what their states then compute", async () => {
    const { app } = mount();
    const expected: Record<string, RegExp> = {
      s5: /S₅/,
      a5: /A₅/,
      d5: /order 10/,
      trinks: /order 168/,
    };
    for (const [id, re] of Object.entries(expected)) {
      app.actions().classic(id);
      await vi.waitFor(() => expect(app.galois()?.kind).toBe("done"), { timeout: 10000 });
      expect(card("galois")?.textContent, id).toMatch(re);
    }
  });

  it("no drill stage or classic puts a method's house name on screen", () => {
    const { app } = mount();
    for (const t of DRILL_TASKS)
      for (const st of [0, 1, 2] as const) {
        app.actions().drill(t.id, st);
        if (st) app.actions().drillChoose("none");
        for (const bad of DENYLIST) expect(document.body.textContent).not.toMatch(bad);
      }
    button(DOOR.open).click();
    for (const bad of DENYLIST) expect(document.body.textContent).not.toMatch(bad);
  });
});
