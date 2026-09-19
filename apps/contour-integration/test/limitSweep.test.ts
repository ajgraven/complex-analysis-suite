// @vitest-environment jsdom
//
// **The scrubbable number and the limit's play control, on the card** — M8 step 3.2.
//
// `test/scrub.test.ts` pins the element and `test/sweep.test.ts` the driver's arithmetic; neither
// can see whether the Derivation card actually PUTS them anywhere, which is the failure mode a
// step like this has (step 3.1c's callouts were computed with a position and rendered without one).
// So this file drives the real card, through `render`, and presses the real controls.
//
// The harness is `derivationCard.test.ts`'s, duplicated for its own stated reason: both are small
// and a shared one is a second thing to keep in step.
import { describe, expect, it } from "vitest";

import { circleTemplate } from "../src/engine/contour/templates.js";
import { compile, defaultState, resolveState, type ShellState } from "../src/shell/state.js";
import { patch } from "../src/shell/dom.js";
import { render } from "../src/shell/render.js";
import { argumentOf, stepIndex } from "../src/shell/argument.js";
import { defaultSession, type Session, type SweepRow } from "../src/shell/session.js";
import { planSweep } from "../src/shell/sweep.js";
import type { ShellActions } from "../src/shell/cards/card.js";
import { mathPlain } from "../src/shell/math.js";

function spyActions(): ShellActions & { calls: string[] } {
  const calls: string[] = [];
  const push = (s: string): number => calls.push(s);
  return {
    calls,
    fitContour: () => push("fit"),
    setExpr: (s) => push(`expr:${s}`),
    setFixture: (i) => push(`fixture:${i}`),
    setParam: (n, v) => push(`param:${n}=${v}`),
    setScrubbing: (on) => push(`scrub:${on}`),
    hover: (p) => push(`hover:${p}`),
    setTemplate: (id) => push(`template:${id}`),
    reverseContour: () => push("reverse"),
    penStart: () => push("pen:start"),
    penStop: () => push("pen:stop"),
    penBack: () => push("pen:back"),
    penCommit: (c) => push(`pen:commit:${c}`),
    setBranch: () => push("branch"),
    setIso: (on) => push(`iso:${on}`),
    setStageMode: (m) => push(`stageMode:${m}`),
    declare: (id) => push(`declare:${id}`),
    undeclare: () => push("undeclare"),
    setDeclaration: () => push("declaration"),
    setOpen: (id, open) => push(`open:${id}:${open}`),
    setStep: (s) => push(`step:${String(s)}`),
    playSweep: (a) => push(`play:${a.stepId}:${a.param}:${a.pieceId ?? "-"}:${a.stepOnce === true}`),
    stopSweep: () => push("stopSweep"),
    copyLink: () => push("copyLink"),
    saveFigure: (t) => push(`saveFigure:${t}`),
    copyFigure: () => push("copyFigure"),
    setMode: (m) => push(`mode:${m}`),
    setRail: (side, folded) => push(`rail:${side}:${folded}`),
    toSandbox: () => push("toSandbox"),
    setContrastsOpen: (open) => push(`contrasts:${open}`),
    openContrast: (id: string) => push(`contrast:${id}`),
    applyState: () => push("applyState"),
    openFrontDoor: () => push("frontDoor"),
    notify: (text, level) => push(`notify:${level}:${text}`),
    redraw: () => push("redraw"),
    undo: () => push("undo"),
    redo: () => push("redo"),
  } as ShellActions & { calls: string[] };
}

function cardOf(state: ShellState, session: Session): { card: HTMLElement; actions: ReturnType<typeof spyActions> } {
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  const poles = resolution.kind === "gallery" ? (resolution.run?.poles ?? null) : compiled.ok ? compiled.poles : null;
  const actions = spyActions();
  const host = document.createElement("div");
  patch(host, render(state, resolution, session, actions, poles).right);
  const found = host.querySelector<HTMLElement>('[data-card="derivation"]');
  if (found === null) throw new Error("no Derivation card");
  return { card: found, actions };
}

const gallery = (record: string, fixture = 0): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  mode: "gallery",
  record,
  fixture,
});

/** The step index of the first step of a kind, for a record. */
function stepAt(state: ShellState, kind: string): number {
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  const at = argumentOf({ state, resolution, poles: null }).steps.findIndex((s) => s.kind === kind);
  if (at < 0) throw new Error(`no ${kind} step`);
  return at;
}

const A6 = "semicircle-quartic";
/** E1 — the strip, whose two vertical sides are certified APART. See the `worst` test below. */
const E1 = "strip-exponential-quasiperiod";

describe("the claim's number, scrubbable", () => {
  it("puts a slider in the arc's bound and nowhere in the sentence's other numbers", () => {
    const state = gallery(A6);
    const session: Session = { ...defaultSession(), step: stepAt(state, "boundary") };
    const { card } = cardOf(state, session);
    const scrubs = [...card.querySelectorAll('.pieceName [role="slider"]')];
    // **Exactly one.** A6's KILL sentence carries three numerals — the bound `4.928e-2`, the value
    // `R = 4`, and the degree gap `4 ≥ 2` — and only the middle one is a parameter. A locator that
    // matched a numeral rather than the claim's own `param` slot would have found the degree gap.
    expect(scrubs).toHaveLength(1);
    const el = scrubs[0] as HTMLElement;
    expect(el.getAttribute("aria-valuenow")).toBe("4");
    expect(el.getAttribute("aria-label") ?? "").toContain("R");
    expect(el.textContent).toBe("4");
  });

  it("does NOT print a raw dollar where the sentence was cut open", () => {
    // The defect this file exists for: `certificateClaimAt` cuts INSIDE a `$…$` group, so the head
    // ends on an unmatched delimiter. Handing that to `splitMath` prints `at $R = ` on screen.
    const state = gallery(A6);
    const session: Session = { ...defaultSession(), step: stepAt(state, "boundary") };
    const { card } = cardOf(state, session);
    const line = card.querySelector(".pieceName");
    expect(line?.textContent ?? "", "the cut printed its delimiter").not.toContain("$");
    // And the fragment that was reopened really was typeset, rather than falling back to plain text.
    expect(line?.querySelectorAll(".katex").length ?? 0).toBeGreaterThan(1);
  });

  it("writes through setParam — the same channel the slider and the stage handle use", () => {
    const state = gallery(A6);
    const session: Session = { ...defaultSession(), step: stepAt(state, "boundary") };
    const { card, actions } = cardOf(state, session);
    const el = card.querySelector<HTMLElement>('.pieceName [role="slider"]');
    if (el === null) throw new Error("no scrub");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const wrote = actions.calls.filter((c) => c.startsWith("param:R="));
    expect(wrote.length, "the key wrote nothing").toBe(1);
    expect(Number(wrote[0]?.split("=")[1]), "the key moved the wrong way").toBeGreaterThan(4);
  });
});

describe("the limit step's play control", () => {
  it("offers Play and Step on the limit step, and on no other step", () => {
    const state = gallery(A6);
    const steps = argumentOf({ state, resolution: resolveState(state, compile(state.expr)), poles: null }).steps;
    const withBar: string[] = [];
    for (let k = 0; k < steps.length; k++) {
      const { card } = cardOf(state, { ...defaultSession(), step: k });
      if (card.querySelector(".sweepBar") !== null) withBar.push(steps[k]?.kind ?? "?");
    }
    expect(withBar).toEqual(["limit"]);
  });

  it("asks for the parameter the step is about, and the piece its bound is about", () => {
    const state = gallery(A6);
    const at = stepAt(state, "limit");
    const { card, actions } = cardOf(state, { ...defaultSession(), step: at });
    const play = [...card.querySelectorAll<HTMLButtonElement>(".sweepBar button")][0];
    play?.click();
    // A6 takes `R` to infinity and the piece the limit must kill is the arc — not the target, and
    // not "whichever piece came first", which is what a card that had not read the bounds would say.
    expect(actions.calls.filter((c) => c.startsWith("play:"))).toEqual(["play:limit:R:R:arc:false"]);
  });

  it("offers Step as its own control, so the jump does not need an OS setting", () => {
    const state = gallery(A6);
    const at = stepAt(state, "limit");
    const { card, actions } = cardOf(state, { ...defaultSession(), step: at });
    const buttons = [...card.querySelectorAll<HTMLButtonElement>(".sweepBar button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Play the limit", "Step"]);
    buttons[1]?.click();
    expect(actions.calls.some((c) => c.endsWith(":true")), "Step did not ask for one checkpoint").toBe(true);
  });

  it("names the piece whose certified bound is the LARGEST, not the smallest", () => {
    // Which piece the limit has to kill is the one whose vanishing the limit ESTABLISHES, so it is
    // the largest of the bounds naming the parameter — the smallest is already dead and proves
    // nothing about the others. Tier G, which the rule was written for, cannot tell the two
    // reducers apart: measured over all three tier-G records × every fixture × N at 3, 9 and 21,
    // the square's four sides certify ONE number to the last bit (1.5659 at every side of
    // `series-cot-kernel`), so a reducer picking the minimum names the same piece. E1's strip
    // certifies its two sides 5× apart, and the larger is the SECOND in argument order, so a
    // "take the first" reducer falls off the same ladder.
    const state = gallery(E1);
    const at = stepAt(state, "limit");
    const arg = argumentOf({ state, resolution: resolveState(state, compile(state.expr)), poles: null });
    const bounds = (arg.derivation?.stages ?? [])
      .flatMap((stage) => stage.lines)
      .flatMap((line) =>
        line.evaluated?.param === "R" && line.pieceId !== undefined
          ? [{ id: line.pieceId, bound: line.evaluated.bound }]
          : [],
      );
    // ANTI-VACUITY, both halves: with one candidate, or with two that agree, every reducer returns
    // the same piece and the assertion below is about nothing.
    expect(bounds.length, "fewer than two certified bounds name R").toBeGreaterThan(1);
    expect(
      new Set(bounds.map((b) => b.bound)).size,
      `the candidates do not differ: ${bounds.map((b) => b.bound).join(", ")}`,
    ).toBe(bounds.length);
    const largest = bounds.reduce((a, b) => (b.bound > a.bound ? b : a));
    expect(
      `largest is first: ${largest.id === bounds[0]?.id}`,
      "the largest bound is also the first, so order alone would answer",
    ).toBe("largest is first: false");

    const id = arg.steps[at]?.id ?? "";
    const { card, actions } = cardOf(state, { ...defaultSession(), step: at });
    card.querySelector<HTMLButtonElement>(".sweepBar button")?.click();
    const asked = actions.calls.filter((c) => c.startsWith("play:"));
    expect(asked.length, "Play asked for nothing").toBe(1);
    // The whole ask, not the piece alone: a step that named the right piece under the wrong
    // parameter would be a sweep of something else.
    expect(asked[0]).toBe(`play:${id}:R:${largest.id}:false`);
  });

  it("says Stop while it is running, because a control that lies about its state is unusable", () => {
    const state = gallery(A6);
    const at = stepAt(state, "limit");
    const steps = argumentOf({ state, resolution: resolveState(state, compile(state.expr)), poles: null }).steps;
    const id = steps[at]?.id ?? "";
    const plan = planSweep(resolveGalleryParam(state, "R"));
    if (plan === null) throw new Error("R does not plan");
    const session: Session = {
      ...defaultSession(),
      step: at,
      sweep: { stepId: id, plan, rows: [], running: true },
    };
    const { card } = cardOf(state, session);
    expect(card.querySelector(".sweepBar button")?.textContent).toBe("Stop");
  });
});

const ROWS: SweepRow[] = [
  { at: 4, bound: 4.928e-2, measured: [1e-2, 0], target: [2.2, 0] },
  { at: 40, bound: 4.9e-5, measured: [1e-5, 0], target: [2.22, 0] },
];

describe("the checkpoint table", () => {

  function tableOf(extra: Partial<SweepRow>[] = []): HTMLElement | null {
    const state = gallery(A6);
    const at = stepAt(state, "limit");
    const steps = argumentOf({ state, resolution: resolveState(state, compile(state.expr)), poles: null }).steps;
    const plan = planSweep(resolveGalleryParam(state, "R"));
    if (plan === null) throw new Error("R does not plan");
    const session: Session = {
      ...defaultSession(),
      step: at,
      sweep: {
        stepId: steps[at]?.id ?? "",
        plan,
        rows: extra.length > 0 ? (extra as SweepRow[]) : ROWS,
        running: false,
      },
    };
    return cardOf(state, session).card.querySelector(".sweepTable");
  }

  it("is absent until the sweep has filled a row", () => {
    const state = gallery(A6);
    const at = stepAt(state, "limit");
    const { card } = cardOf(state, { ...defaultSession(), step: at });
    expect(card.querySelector(".sweepTable"), "an empty table is a table of nothing").toBeNull();
    expect(tableOf(), "and a filled one is absent too").not.toBeNull();
  });

  it("keeps the table when the sweep has FINISHED and the bar has gone", () => {
    // The defect this pins: a finished sweep leaves the parameter ON its endpoint, where
    // `planSweep` has nothing left to plan and returns `null` — and one `return []` covering the
    // bar AND the table took the evidence off the screen at the exact moment it was complete.
    // Measured in a browser: four presses of `Step` filled four rows whose bound column fell
    // 2.6e-5 → 1.5e-8 → 9.1e-12 → 5.3e-15, and the fifth press — the one that
    // reaches the limit — left the card with no table at all. The BUTTONS come and go with the
    // plan; the EVIDENCE stays.
    const base = gallery(A6);
    const plan = planSweep(resolveGalleryParam(base, "R"));
    if (plan === null) throw new Error("R does not plan");
    // `R` parked on the top of its own range, which is exactly where the sweep leaves it.
    const done: ShellState = { ...base, geometry: { R: plan.to } };
    expect(
      planSweep(resolveGalleryParam(done, "R")),
      "R still plans at its endpoint, so this is not the state the defect was in",
    ).toBeNull();
    const at = stepAt(done, "limit");
    const steps = argumentOf({ state: done, resolution: resolveState(done, compile(done.expr)), poles: null }).steps;
    const id = steps[at]?.id ?? "";

    const shape = (state: ShellState, session: Session): string => {
      const { card } = cardOf(state, session);
      return `table ${card.querySelector(".sweepTable") !== null} bar ${card.querySelector(".sweepBar") !== null}`;
    };
    const filled: Session = { ...defaultSession(), step: at, sweep: { stepId: id, plan, rows: ROWS, running: false } };
    expect(shape(done, filled), "the finished sweep's rows").toBe("table true bar false");
    // Two pairings, so the rule is neither "always render" nor "render whenever the rows are there".
    // With no rows the finished step carries nothing at all — an empty table is a table of
    // nothing — and BEFORE the sweep, where the parameter still plans, the bar is back.
    expect(shape(done, { ...defaultSession(), step: at }), "finished, with nothing measured").toBe(
      "table false bar false",
    );
    expect(shape(base, { ...defaultSession(), step: stepAt(base, "limit") }), "before the sweep").toBe(
      "table false bar true",
    );
  });

  it("badges the certified column `≤` and the measured ones `≈`, never alike", () => {
    // The honest-labelling guardrail, in the one place this step invites a reader to compare two
    // columns: a table that badged them alike would say the quadrature had been proved.
    const table = tableOf();
    const first = table?.querySelector("tbody tr");
    const levels = [...(first?.querySelectorAll(".badge") ?? [])].map((b) => b.getAttribute("data-level"));
    expect(levels).toEqual(["≤", "≈", "≈"]);
  });

  it("shows one row per checkpoint passed, in sweep order", () => {
    const table = tableOf();
    const body = [...(table?.querySelectorAll("tbody tr") ?? [])];
    expect(body).toHaveLength(2);
    expect(body[0]?.querySelector("td")?.textContent).toBe("4");
    expect(body[1]?.querySelector("td")?.textContent).toBe("40");
  });

  it("prints an em-dash rather than a number where a cell has none", () => {
    // A bound the producer could not establish is not a bound of zero, and the guardrail's whole
    // posture is that an absent number is said rather than fabricated.
    const table = tableOf([{ at: 4, bound: null, measured: null, target: null }]);
    const cells = [...(table?.querySelectorAll("tbody td") ?? [])].map((c) => c.textContent);
    expect(cells).toEqual(["4", "—", "—", "—"]);
    expect(table?.querySelectorAll("tbody .badge").length, "a badge on a cell with no number").toBe(0);
  });
});

/** The live `Param` for a record — the run's contour, which is where a record's parameters are. */
function resolveGalleryParam(state: ShellState, name: string): Parameters<typeof planSweep>[0] {
  const resolution = resolveState(state, compile(state.expr));
  const contour = resolution.kind === "gallery" ? (resolution.run?.contour ?? state.contour) : state.contour;
  const p = contour.params[name];
  if (p === undefined) throw new Error(`no param ${name}`);
  return p;
}

describe("the step index the table is keyed on", () => {
  it("shows a table only on the step it was filled from", () => {
    // A reader who steps away and back must not meet another step's evidence under this step's
    // heading — the table is keyed on the step id for the reason the callouts are.
    const state = gallery(A6);
    const at = stepAt(state, "limit");
    const plan = planSweep(resolveGalleryParam(state, "R"));
    if (plan === null) throw new Error("R does not plan");
    const session: Session = {
      ...defaultSession(),
      step: at,
      sweep: { stepId: "limit:somewhere-else", plan, rows: ROWS, running: false },
    };
    expect(cardOf(state, session).card.querySelector(".sweepTable")).toBeNull();
    expect(stepIndex(argumentOf({ state, resolution: resolveState(state, compile(state.expr)), poles: null }).steps, at)).toBe(at);
  });
});

describe("the stepper's accessible names", () => {
  it("speaks a step's title as words, never as its LaTeX source", () => {
    // Two steps of every record with a limit are titled `Let $R \to \infty$` and `Boundary terms
    // · the $R \to \infty$ semicircle`, and an `aria-label` is one of the places a typeset
    // fragment cannot go — so a screen-reader user heard the LaTeX source, dollars and
    // backslashes included. Older than the sweep control (it dates to step 3.1b) and found by
    // reading the accessible name in a browser, which is why nothing in the node gate had it.
    const state = gallery(A6);
    const at = stepAt(state, "limit");
    const steps = argumentOf({ state, resolution: resolveState(state, compile(state.expr)), poles: null }).steps;
    // ANTI-VACUITY: "no label carries a `$`" is true of a renderer that does nothing at all, on a
    // corpus whose titles are prose. A6's are not — two of its eight are mathematics.
    expect(
      steps.filter((s) => s.title.includes("$")).length,
      "no step title carries a `$`, so the raw titles would pass this too",
    ).toBeGreaterThan(1);

    const { card } = cardOf(state, { ...defaultSession(), step: at });
    const dots = [...card.querySelectorAll(".stepDot")].map((b) => b.getAttribute("aria-label") ?? "");
    expect(dots.length, "no step dots were drawn").toBe(steps.length);
    expect(dots.filter((l) => l.includes("$")), "a dot spoke its delimiters").toEqual([]);
    const spoken = [...card.querySelectorAll(".stepBar .srOnly")].map((s) => s.textContent ?? "");
    expect(spoken.length, "the open step has no spoken label").toBe(1);
    expect(spoken.filter((l) => l.includes("$")), "the open step spoke its delimiters").toEqual([]);

    // And the names are the TITLES with their delimiters taken off, rather than a blank or a
    // number: stripping the mathematics out altogether would pass every assertion above.
    const title = steps[at]?.title ?? "";
    expect(spoken[0]).toBe(`Step ${at + 1} of ${steps.length}: ${mathPlain(title)}`);
    expect(dots[at]).toBe(`step ${at + 1} of ${steps.length} — ${mathPlain(title)}`);
    expect(mathPlain(title), "the title lost its words as well as its dollars").toContain("Let");
  });
});
