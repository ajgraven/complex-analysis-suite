// @vitest-environment jsdom
//
// The accumulator strip — M8 step 1.6.
//
// jsdom has no 2-D context, so nothing here can assert a pixel; `test/stripInk.browser.test.ts` does
// that. What IS reachable here is everything the strip decides before it draws — which index the
// scrub points at, what the panel says, whether the walk was recomputed — and those are the
// properties the two views agreeing rests on.
//
// **`getContext` is stubbed to null, as `test/shell2.test.ts` does**, and that is a test of its own:
// the strip must lay out its panel and name its canvas with no context at all, because the panel is
// DOM and an absent context is a fact about the canvas alone (`stageView.ts`'s rule).
import { describe, expect, it } from "vitest";

import { semicircleTemplate, circleTemplate } from "../src/engine/contour/templates.js";
import type { Contour } from "../src/engine/contour/model.js";
import { compile, defaultState, resolveState, type ShellState } from "../src/shell/state.js";
import type { Cx } from "../src/kernel/geom.js";
import { defaultSession } from "../src/shell/session.js";
import { taskById, taskState, type DrillTask } from "../src/shell/drill.js";
import { createStripView, stepIndex, type StripDraw, type StripInput, type StripView } from "../src/shell/strip.js";
import type { ContrastMode } from "../src/ui/accumulator.js";

HTMLCanvasElement.prototype.getContext = (() => null) as never;

/** What the strip asked the shell to do — the strip never writes the state itself. */
interface Recorded extends StripInput {
  readonly scrubs: number[];
  readonly contrasts: ContrastMode[];
  readonly said: string[];
  readonly hovered: (string | null)[];
  /** Every `setShowStep` the panel asked for — M8 step 3.3's toggle. */
  readonly shown: boolean[];
}

function mount(): { host: HTMLElement; view: StripView; input: Recorded } {
  const host = document.createElement("footer");
  host.className = "strip2";
  document.body.replaceChildren(host);
  const scrubs: number[] = [];
  const contrasts: ContrastMode[] = [];
  const shown: boolean[] = [];
  const said: string[] = [];
  const hovered: (string | null)[] = [];
  const input: Recorded = {
    scrubs,
    contrasts,
    shown,
    said,
    hovered,
    setScrub: (t) => scrubs.push(t),
    setContrast: (m) => contrasts.push(m),
    setShowStep: (on) => shown.push(on),
    hover: (p) => hovered.push(p),
    announce: (m) => said.push(m),
  };
  return { host, view: createStripView(host, input), input };
}

/** A sandbox state, resolved exactly as the shell resolves it. */
function drawOf(over: Partial<ShellState> = {}): StripDraw {
  const state: ShellState = { ...defaultState(circleTemplate([0, 0], 1.5)), ...over };
  return { state, resolution: resolveState(state, compile(state.expr)), session: defaultSession() };
}

const q = (root: ParentNode, sel: string): HTMLElement | null => root.querySelector<HTMLElement>(sel);
const text = (root: ParentNode, sel: string): string => q(root, sel)?.textContent ?? "";

// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the accumulation is cached by VALUE", () => {
  /**
   * The defect: every scrub tick is a commit, and a commit builds a FRESH resolution object even
   * though the integrand and the geometry have not moved. A guard on object identity would miss on
   * every tick and re-walk the whole contour — 240 calls into the compiled integrand — sixty times
   * a second, which is M5.1's GLSL-relink finding in the one other place its shape recurs.
   *
   * Observed WITHOUT any test-only API: the resolution's own `f` is wrapped in a counter after
   * `resolveState` has finished with it, so the only calls counted are the accumulator's.
   */
  function counting(state: ShellState, calls: { n: number }): StripDraw {
    const r = resolveState(state, compile(state.expr));
    if (r.kind !== "plain") throw new Error(`expected a plain resolution, got ${r.kind}`);
    const inner = r.f;
    const f = (z: Cx): Cx => {
      calls.n++;
      return inner(z);
    };
    return { state, resolution: { ...r, f }, session: defaultSession() };
  }

  it("walks the contour ONCE across two draws of equal value", () => {
    const { view } = mount();
    const state = defaultState(circleTemplate([0, 0], 1.5));
    const calls = { n: 0 };
    // Two INDEPENDENT draws: separate `resolveState` calls, so the resolutions are equal and not
    // identical. An identity guard passes a test that reuses one object and fails this one.
    const first = view.accumulation(counting(state, calls));
    const after = calls.n;
    expect(after, "the first draw should have walked the contour").toBeGreaterThan(100);
    const second = view.accumulation(counting(state, calls));
    expect(calls.n, "the second draw re-walked the contour").toBe(after);
    expect(second).toBe(first);
  });

  it("but DOES recompute when the integrand changes — the anti-vacuity half", () => {
    // Without this, a cache that never invalidates passes the test above perfectly.
    const { view } = mount();
    const calls = { n: 0 };
    view.accumulation(counting(defaultState(circleTemplate([0, 0], 1.5)), calls));
    const after = calls.n;
    const moved = { ...defaultState(circleTemplate([0, 0], 1.5)), expr: "1/(z*z)" };
    view.accumulation(counting(moved, calls));
    expect(calls.n).toBeGreaterThan(after);
  });

  it("and when PERMISSION is withdrawn, with nothing else moving at all", () => {
    // **The key's last component, and it is the only one a ledger can move** — ADR-0045. Every
    // other component (the expression, the declaration, the cut system, the resolved pieces, the
    // sides) is identical between these two draws; what differs is that the second one's argument
    // does not close. A cache keyed on the rest alone hands back the first draw's trail, which is
    // the number the refusal exists to withhold, drawn.
    //
    // The ledger is edited rather than provoked, because provoking it MOVES something else: a cut
    // that crosses, a contour dragged onto a pole, a parameter — each of which the key already
    // sees. This is the case the component is for.
    const { view } = mount();
    const state = defaultState(circleTemplate([0, 0], 1.5));
    const ok = resolveState(state, compile(state.expr));
    if (ok.kind !== "plain") throw new Error(`expected a plain resolution, got ${ok.kind}`);
    expect(view.accumulation({ state, resolution: ok, session: defaultSession() })).not.toBeNull();

    const rows = ok.analysis.ledger.rows;
    expect(rows.length, "the fixture must have a row to fail").toBeGreaterThan(0);
    const refusing = {
      ...ok,
      analysis: {
        ...ok.analysis,
        ledger: {
          ...ok.analysis.ledger,
          closes: false,
          failedAt: rows[0].constraint,
          rows: [{ ...rows[0], status: "failed" as const }, ...rows.slice(1)],
        },
      },
    };
    expect(view.accumulation({ state, resolution: refusing, session: defaultSession() })).toBeNull();
  });

  it("and when the CONTOUR moves, with the expression untouched", () => {
    // The geometry half of the key. A drag changes nothing the expression can see, and the walk is
    // a different walk; keying on the expression alone would freeze the trail under the hand.
    const { view } = mount();
    const calls = { n: 0 };
    view.accumulation(counting(defaultState(circleTemplate([0, 0], 1.5)), calls));
    const after = calls.n;
    view.accumulation(counting(defaultState(circleTemplate([0.25, 0], 1.5)), calls));
    expect(calls.n).toBeGreaterThan(after);
  });
});

describe("the scrub is a STEP INDEX, and the readout is on it", () => {
  /**
   * The defect: `drawAccumulator` ends its trail at `steps[max(1, round(upTo·N)) − 1]`, and a
   * readout deriving its own index from the same slider by any other formula points at a different
   * term — as does the stage's marker, which reads `stepAt`. Three views of one sum, disagreeing.
   */
  it("agrees with the step counter at 0, 0.5 and 1", () => {
    const { host, view } = mount();
    for (const scrub of [0, 0.5, 1]) {
      const d = drawOf({ scrub });
      view.drawNow(d);
      const at = view.stepAt(d);
      if (at === null) throw new Error("there should be an accumulation for 1/z on a circle");
      const acc = view.accumulation(d);
      if (acc === null) throw new Error("…and it should be readable");
      expect(at.index).toBe(stepIndex(scrub, acc.steps.length));
      expect(text(host, "[data-testid=acc-step]")).toBe(`step ${at.index + 1} of ${acc.steps.length}`);
      // And the marker is drawn at THAT step's point, not at an interpolated position — now read
      // off the step object itself, which is what `stepAt` hands out since M8 step 3.3, so the
      // point, the `Δz` the stage draws and the `|f|` the panel prints are one term and not three.
      expect(at.step).toBe(acc.steps[at.index]);
      expect(at.step.z).toEqual(acc.steps[at.index].z);
    }
  });

  it("puts the readout at the ends where the picture puts them", () => {
    const { host, view } = mount();
    const full = drawOf({ scrub: 1 });
    view.drawNow(full);
    const acc = view.accumulation(full);
    if (acc === null) throw new Error("no accumulation");
    expect(view.stepAt(full)?.index).toBe(acc.steps.length - 1);
    // `∮ dz/z = 2πi`: the completed walk reads as the imaginary 6.28…, with the real part below the
    // sum's own rounding and therefore dropped. A readout pointing anywhere else cannot say this.
    const end = text(host, "[data-testid=acc-value]");
    expect(end).toMatch(/6\.283/);
    expect(end.endsWith("i"), `the finished walk should be imaginary, not ${end}`).toBe(true);

    const start = drawOf({ scrub: 0 });
    view.drawNow(start);
    expect(view.stepAt(start)?.index).toBe(0);
    expect(text(host, "[data-testid=acc-step]")).toBe(`step 1 of ${acc.steps.length}`);
    // **Not `≠ end`, and a mutation sweep is why**: a readout that printed `acc.total` at every
    // position — the whole walk, wherever the scrub is — still differs from the string above,
    // because `roundingFloor` grows with the step count and the two are the same number at
    // different precisions. So the claim is about the VALUE: one term of a 240-term walk toward
    // `2πi` is about 0.026, and nothing near 6.28 may appear at the start.
    const first = text(host, "[data-testid=acc-value]");
    expect(first).not.toMatch(/6\.28/);
    expect(first).not.toBe(end);
  });

  it("is a function of the INDEX and not of the slider position", () => {
    // Two different scrub values that `stepIndex` sends to the same term must read identically. This
    // is what fails if the readout interpolates, or rounds differently from the trail: the numbers
    // would move continuously with the slider while the drawn head stayed on one term.
    const { host, view } = mount();
    const n = view.accumulation(drawOf({ scrub: 1 }))?.steps.length ?? 0;
    expect(n).toBeGreaterThan(8);
    const k = stepIndex(0.5, n);
    const exact = (k + 1) / n;
    const nudged = exact + 0.4 / n;
    expect(stepIndex(nudged, n), "the two positions must share a step for this to test anything").toBe(k);
    view.drawNow(drawOf({ scrub: exact }));
    const a = text(host, "[data-testid=acc-value]");
    const aStep = text(host, "[data-testid=acc-step]");
    view.drawNow(drawOf({ scrub: nudged }));
    expect(text(host, "[data-testid=acc-value]")).toBe(a);
    expect(text(host, "[data-testid=acc-step]")).toBe(aStep);
  });

  it("clamps a scrub outside [0, 1] instead of indexing past the end", () => {
    // `drawAccumulator` slices, which is harmless past the end; an INDEX past the end is `undefined`
    // and the readout would throw on a state a permalink could carry.
    const { view } = mount();
    const n = view.accumulation(drawOf({ scrub: 1 }))?.steps.length ?? 0;
    expect(stepIndex(1.4, n)).toBe(n - 1);
    expect(stepIndex(-3, n)).toBe(0);
    expect(stepIndex(Number.NaN, n)).toBe(0);
    expect(() => view.drawNow(drawOf({ scrub: 1.4 }))).not.toThrow();
  });
});

describe("when there is nothing to accumulate", () => {
  it("says so in one sentence and draws no controls — an unparseable expression", () => {
    // The defect this prevents is a slider and a `0` beside a picture that is not there: a control
    // for an absent trail invites a reader to move it and conclude the app is broken, and a `0` in
    // the value slot is a number nothing computed.
    const { host, view } = mount();
    const d = drawOf({ expr: "1/(" });
    expect(() => view.drawNow(d)).not.toThrow();
    expect(view.accumulation(d)).toBe(null);
    expect(view.stepAt(d)).toBe(null);
    const none = text(host, "[data-testid=acc-none]");
    expect(none.length).toBeGreaterThan(20);
    expect(none.startsWith("Nothing is plotted")).toBe(true);
    // **And the reason is the app's sentence, not `@cas/expr`'s** — M8 step 2.6, found at the
    // Phase 2 gate: this line read *Nothing is plotted — Unexpected token 'eof'.* until the strip
    // was routed through `shell/errors.ts`, so the one surface that says why named a token — and
    // `eof` at that, which is the parser's name for the end of the input and not a thing a reader
    // has typed.
    expect(none).toBe("Nothing is plotted — the expression ends before it is finished.");
    expect(none).not.toContain("Unexpected token");
    expect(q(host, "[data-testid=acc-value]")).toBe(null);
    expect(q(host, "input[type=range]")).toBe(null);
  });

  it("invites an integrand where the box is EMPTY, rather than reporting an empty expression", () => {
    // An empty box is not an error, and this line said it was: `compile("")` refuses with `Empty
    // expression`, which landed here verbatim. The clause form rather than the card's sentence,
    // because it is embedded — *Nothing is plotted — ⟨x⟩.*
    const { host, view } = mount();
    const d = drawOf({ expr: "" });
    view.drawNow(d);
    const none = text(host, "[data-testid=acc-none]");
    expect(none).toBe("Nothing is plotted — there is nothing in the integrand box.");
  });

  it("and when the INTEGRAL was withheld, with the engine's own reason", () => {
    // `accumulateForIntegral` returns null when `integral.value` is undefined — a contour through a
    // singularity. That is a real case and not an error, and the sentence must be the engine's:
    // a partial sum beside a refusal is the number the refusal exists to withhold.
    const { host, view } = mount();
    const d = drawOf({ expr: "1/(z - 1.5)" });
    view.drawNow(d);
    expect(view.accumulation(d), "a pole ON the contour should withhold the value").toBe(null);
    const none = text(host, "[data-testid=acc-none]");
    expect(none.startsWith("Nothing is plotted — ")).toBe(true);
    // Not the generic fallback: the engine said why, and the panel repeated it.
    expect(none).toContain("lies on the contour");
    expect(none).not.toContain("there is nothing to accumulate");
  });

  it("and at the drill's rung iii, where the contour is the QUESTION — M8 step 3.4", () => {
    // **The strip is a picture of the contour**, and rung iii masks the contour: the stage draws an
    // empty piece list there, the ledger, the derivation and the value all say "hidden", and this
    // canvas went on drawing the record's own walk — a semicircle, unmistakably — with
    // `1.15565557035` printed beside it, which is `π/e` to eleven figures. Found by opening the
    // rung in a browser, at the step that put a forced choice on it.
    //
    // Through the SAME path a refusal takes rather than a second branch, which is what this test
    // pins: the canvas is cleared by `acc === null` and the sentence is the panel's one sentence,
    // so a mask that cleared it some other way would be the masking-by-omission `drillPanel.ts`'s
    // header warns about.
    const { host, view } = mount();
    const record = taskState(taskById("oscillatory") as DrillTask, 3);
    const masked: StripDraw = {
      state: record,
      resolution: resolveState(record, compile(record.expr)),
      session: defaultSession(),
    };
    view.drawNow(masked);
    expect(text(host, "[data-testid=acc-none]")).toBe("Nothing is plotted — the contour is the question.");
    // **`accumulation()` is NOT masked, and that is right rather than a gap.** It is the accessor
    // the STAGE reads for the amplitwist step, which `stageView` gates on the same `drillMask`
    // answer — so masking it here would be the second reader of one decision that `drillMask`'s own
    // header exists to prevent. What is masked is the DRAWING, which is what a reader sees.
    expect(view.accumulation(masked), "the walk is still computable, and not drawn").not.toBeNull();
    expect(q(host, "[data-testid=acc-value]"), "and no partial sum, which is π/e at the end").toBe(null);

    // **The pairing**: the same record at a rung that masks nothing draws the whole walk. Without
    // it, "nothing is plotted" could be a record this strip cannot accumulate at all.
    const open = { ...masked, state: taskState(taskById("oscillatory") as DrillTask, 1) };
    view.drawNow(open);
    expect(q(host, "[data-testid=acc-none]")).toBe(null);
    expect(text(host, "[data-testid=acc-value]").length).toBeGreaterThan(3);
  });
});

describe("the compare toggles", () => {
  it("carry aria-pressed, and exactly the active one is true", () => {
    // The defect: the old shell toggled an `on` CLASS, which is invisible to assistive tech — a
    // reader was told there were four buttons and never which one was in effect.
    for (const mode of ["none", "sumZ", "sumFz", "sumDz"] as const) {
      const { host, view } = mount();
      view.drawNow(drawOf({ contrast: mode }));
      const buttons = [...host.querySelectorAll<HTMLElement>("button[data-mode]")];
      expect(buttons).toHaveLength(4);
      for (const b of buttons) {
        expect(b.getAttribute("aria-pressed"), `${b.dataset.mode} under ${mode}`).toBe(
          b.dataset.mode === mode ? "true" : "false",
        );
      }
    }
  });

  it("report a press to the shell rather than writing the state themselves", () => {
    const { host, view, input } = mount();
    view.drawNow(drawOf({ contrast: "none" }));
    q(host, "button[data-mode=sumDz]")?.click();
    expect(input.contrasts).toEqual(["sumDz"]);
    expect(input.said).toHaveLength(1);
    // The button did NOT repaint itself: the state is the shell's, and a toggle that flipped its own
    // `aria-pressed` would claim a comparison the shell may not have committed.
    expect(q(host, "button[data-mode=sumDz]")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("show the ACTIVE explanation and no other", () => {
    // Four explanations at once is a legend, and a legend is read once and then ignored.
    const distinct: Record<ContrastMode, RegExp> = {
      none: /Only the sum being computed/,
      sumZ: /sample points/,
      sumFz: /without the/,
      sumDz: /steps alone/,
    };
    for (const mode of ["none", "sumZ", "sumFz", "sumDz"] as const) {
      const { host, view } = mount();
      view.drawNow(drawOf({ contrast: mode }));
      expect(host.querySelectorAll("[data-testid=acc-why]")).toHaveLength(1);
      const why = text(host, "[data-testid=acc-why]");
      for (const [other, pattern] of Object.entries(distinct) as [ContrastMode, RegExp][]) {
        expect(pattern.test(why), `${mode} shows ${other}'s line: ${why}`).toBe(other === mode);
      }
    }
  });

  it("NEVER claims Σ Δz closes to 0 on a contour that is not closed — and now draws nothing at all", () => {
    // The honest-labelling guardrail, in the one sentence most likely to be written as a constant.
    // `Σ Δz` closing to the origin is the cheapest striking thing in the app and it is FALSE on an
    // open path, where the same sum is the displacement from the start to the end.
    //
    // **ADR-0045 made the whole PICTURE go, not just the sentence**, and that is a deliberate loss:
    // *the contour is not closed* is a failing LEGALITY row, so the accumulator is refused along
    // with every other value. What the app said here before — the trail with `Σ Δz` explained as a
    // displacement — is not reachable any more. The claim the test protects survives and is
    // stronger: the app makes NO claim, and names the reason rather than going quietly blank.
    const semicircle = semicircleTemplate(3, "upper");
    const open: Contour = { ...semicircle, pieces: [semicircle.pieces[0]] };
    const { host, view } = mount();
    const d = drawOf({ contour: open, sandboxContour: open, contourSource: null, expr: "1/(z - 10)", contrast: "sumDz" });
    view.drawNow(d);
    expect(host.querySelectorAll("[data-testid=acc-why]")).toHaveLength(0);
    // The REASON, not merely the absence: the closure row's own claim, which is what tells a reader
    // that joining the path back up is the repair.
    expect(text(host, "[data-testid=acc-none]")).toContain("the contour is not closed");
    expect(text(host, "[data-testid=acc-none]")).not.toContain("closes to");

    // …and the explanation still appears on a closed one, so the branch is not simply dead.
    const { host: h2, view: v2 } = mount();
    v2.drawNow(drawOf({ contrast: "sumDz" }));
    expect(text(h2, "[data-testid=acc-why]")).toContain("closes to");
  });
});

describe("the canvas", () => {
  it("is a named role=img whose sentence carries the step count", () => {
    // Research 02 §8's P0 picture was completely unannounced before M6.4, and the name must be
    // GENERATED: a hand-written alternative drifts the first time a record changes.
    const { view } = mount();
    const d = drawOf({ scrub: 1 });
    view.drawNow(d);
    const acc = view.accumulation(d);
    if (acc === null) throw new Error("no accumulation");
    expect(view.canvas.getAttribute("role")).toBe("img");
    const label = view.canvas.getAttribute("aria-label") ?? "";
    expect(label).toContain(`${acc.steps.length} steps`);
    expect(label).toContain(`step ${acc.steps.length} of ${acc.steps.length}`);
    // The `$…$` convention has no reader in an `aria-label`; a dollar here would be read aloud.
    expect(label).not.toContain("$");
  });

  it("re-names itself when the scrub moves, and says so honestly when there is nothing", () => {
    const { view } = mount();
    view.drawNow(drawOf({ scrub: 1 }));
    const full = view.canvas.getAttribute("aria-label") ?? "";
    view.drawNow(drawOf({ scrub: 0 }));
    expect(view.canvas.getAttribute("aria-label")).not.toBe(full);
    view.drawNow(drawOf({ expr: "1/(" }));
    const empty = view.canvas.getAttribute("aria-label") ?? "";
    expect(empty).toContain("Nothing is plotted");
    expect(empty.length).toBeGreaterThan(20);
  });

  it("is removed by destroy, along with the panel it built", () => {
    const { host, view } = mount();
    view.drawNow(drawOf());
    expect(host.querySelector("canvas.acc")).not.toBe(null);
    view.destroy();
    expect(host.querySelector("canvas.acc")).toBe(null);
    expect(host.querySelector(".accSide")).toBe(null);
  });
});

describe("the scrub control", () => {
  it("reports its position to the shell in [0, 1]", () => {
    const { host, view, input } = mount();
    view.drawNow(drawOf({ scrub: 1 }));
    const slider = q(host, "input[type=range]") as HTMLInputElement | null;
    if (slider === null) throw new Error("no scrub");
    slider.value = "250";
    slider.dispatchEvent(new Event("input"));
    expect(input.scrubs).toEqual([0.25]);
  });

  it("keeps the SAME input element across a redraw", () => {
    // Builder rule 1, in the one control where losing it would fire continuously: a panel rebuilt
    // with `replaceChildren` on every tick takes the focus out of the slider being dragged.
    const { host, view } = mount();
    view.drawNow(drawOf({ scrub: 1 }));
    const before = q(host, "input[type=range]");
    view.drawNow(drawOf({ scrub: 0.5 }));
    expect(q(host, "input[type=range]")).toBe(before);
  });
});
