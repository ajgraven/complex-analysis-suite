// @vitest-environment jsdom
//
// The amplitwist detail's READOUT — M8 step 3.3.
//
// The arrows are the stage's and the pixels are `test/stripInk.browser.test.ts`'s; what is reachable
// here is the other half of the same term — the four numbers the strip's side panel prints beside
// them, and the tri-state that decides whether any of it is on screen at all. The step's gate is
// *"the readout's numbers equal `acc.steps[k]`'s"*, so every number below is compared against the
// accumulation the view itself hands out (`stepAt`, `accumulation`) rather than against a constant
// transcribed from a run: a panel that computed its own `|f|` from `term/dz` would agree with a
// transcript and disagree with the walk in the last two digits, and the whole point of `stepAt`
// handing out the step OBJECT is that the three surfaces cannot drift apart like that.
//
// **`getContext` is stubbed to null, as `test/strip.test.ts` does** — the panel is DOM, and an
// absent 2-D context is a fact about the canvas alone.
import { describe, expect, it } from "vitest";

import { circleTemplate } from "../src/engine/contour/templates.js";
import type { AccumulationStep } from "../src/engine/contour/accumulate.js";
import { compile, defaultState, resolveState, type ShellState } from "../src/shell/state.js";
import { DRILL_TASKS } from "../src/shell/drill.js";
import { defaultSession } from "../src/shell/session.js";
import { fmtNum } from "../src/shell/format.js";
import { fmtCx } from "../src/kernel/decimal.js";
import { degrees, stepDetail } from "../src/shell/stepDetail.js";
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

/** The VALUE half of one numbered row — the label beside it is KaTeX-bound text, not a number. */
function num(root: ParentNode, key: string): string {
  const cell = q(root, `[data-testid=acc-${key}] .num`);
  if (cell === null) throw new Error(`no acc-${key} value in the panel`);
  return cell.textContent ?? "";
}

/** Is the four-number block on screen at all? */
const detailShowing = (root: ParentNode): boolean => q(root, "[data-testid=acc-mod]") !== null;

const scrubFor = (index: number, steps: number): number => (index + 1) / steps;

// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the four numbers ARE the step's own", () => {
  /**
   * The defect this pins: the panel has `acc.steps[k]` in hand and could just as easily print
   * something DERIVED from it — an argument taken off `term` rather than off `fz`, a modulus divided
   * out of `term/dz` — while the reader is being told that `f(z_k)·Δz_k` is `Δz_k` amplified by
   * exactly the printed `|f|` and twisted by exactly the printed angle. So the numbers are compared
   * against the walk's own object, which is what `stepAt` hands out.
   *
   * **How much of that this test can actually see, measured over all 240 steps of the fixture
   * below.** The ARGUMENT row is fully pinned: `arg(f·Δz)` differs from `arg f` at **240 of 240**
   * steps, because `Δz` turns with the contour, so substituting `term` for `fz` there is caught
   * everywhere. `Δz` and the term are pinned at `fmtCx`'s eight decimals. The MODULUS row is the one
   * that is not: `|term|/|dz|` and `|fz|` print identically at `fmtNum`'s four decimals at **0 of
   * 240** steps' worth of difference, so that one substitution is invisible here and would need a
   * test at a precision the panel does not print. Said out loud rather than left as a claim the
   * assertions do not support.
   *
   * `1/(z - 0.7)` rather than the default `1/z`: on a circle about the origin `|1/z|` is CONSTANT,
   * so a panel printing one fixed modulus would sail through the anti-vacuity half below. Off-centre,
   * all four numbers move.
   */
  const expr = "1/(z - 0.7)";

  it("prints |f|, arg f in degrees, Δz and the term at SEVERAL scrub positions", () => {
    const { host, view } = mount();
    const steps = view.accumulation(drawOf({ expr, scrub: 1 }))?.steps.length ?? 0;
    expect(steps, "there must be a walk to read").toBeGreaterThan(8);

    // **The positions are chosen against the integrand's own symmetry, measured.** `|1/(z − 0.7)|`
    // on a circle about the origin is a function of `cos θ` alone, so the obvious quarter-points
    // (and the two ends) come in equal PAIRS and the modulus reads three distinct values from four
    // positions — the anti-vacuity clause would then have to be weakened to say nothing. These four
    // angles — 0, π/4, 2π/3, π — have four distinct cosines.
    const indices = [0, Math.floor(steps / 8), Math.floor(steps / 3), Math.floor(steps / 2)];
    expect(`distinct positions: ${new Set(indices).size}`).toBe("distinct positions: 4");

    const seen: Record<string, Set<string>> = { mod: new Set(), arg: new Set(), dz: new Set(), term: new Set() };
    for (const index of indices) {
      const d = drawOf({ expr, scrub: scrubFor(index, steps), showStep: true });
      view.drawNow(d);
      const at = view.stepAt(d);
      if (at === null) throw new Error("there should be a step under the scrub");
      const acc = view.accumulation(d);
      if (acc === null) throw new Error("…and a walk it came from");
      // The panel is on the term the scrub names, and `stepAt` is the walk's own object at that
      // index — pinning the REASON the four numbers below are the right ones, not just that they
      // match something.
      expect(at.index, `the panel's index at ${index}`).toBe(index);
      expect(at.step).toBe(acc.steps[index]);

      const step: AccumulationStep = acc.steps[index];
      const at_ = `step ${index}`;
      expect(`${at_} |f|: ${num(host, "mod")}`).toBe(`${at_} |f|: ${fmtNum(Math.hypot(step.fz[0], step.fz[1]))}`);
      expect(`${at_} arg: ${num(host, "arg")}`).toBe(
        `${at_} arg: ${fmtNum(degrees(Math.atan2(step.fz[1], step.fz[0])), 1)}°`,
      );
      // …and it is `arg f`, not `arg(f·Δz)`: the two differ at every step of this walk because `Δz`
      // turns with the contour, so the row that NAMES `f` is required to differ from the term's own
      // angle rather than merely to match a number.
      expect(`${at_} arg is not the term's`).toBe(
        num(host, "arg") === `${fmtNum(degrees(Math.atan2(step.term[1], step.term[0])), 1)}°`
          ? `${at_} arg is the term's`
          : `${at_} arg is not the term's`,
      );
      expect(`${at_} dz: ${num(host, "dz")}`).toBe(`${at_} dz: ${fmtCx(step.dz)}`);
      expect(`${at_} term: ${num(host, "term")}`).toBe(`${at_} term: ${fmtCx(step.term)}`);

      seen.mod.add(num(host, "mod"));
      seen.arg.add(num(host, "arg"));
      seen.dz.add(num(host, "dz"));
      seen.term.add(num(host, "term"));
    }

    // **The anti-vacuity half, and it is per NUMBER rather than per row.** A panel that printed one
    // frozen term — the first, or the last, or a constant — satisfies every equality above at the
    // one position that happens to be cached, so each of the four slots is required to have MOVED
    // across the four positions. Four distinct values from four positions, in all four slots.
    for (const [key, values] of Object.entries(seen)) {
      expect(`${key}: ${values.size} distinct`).toBe(`${key}: 4 distinct`);
    }
  });

  it("follows the scrub to a DIFFERENT term when only the scrub moves", () => {
    // The same claim one step tighter: nothing but `scrub` differs between these two draws, so a
    // readout wired to the resolution rather than to the scrub — recomputed on a commit, frozen on a
    // drag — would print the same four numbers twice and pass the test above by drawing fresh mounts.
    const { host, view } = mount();
    const steps = view.accumulation(drawOf({ expr, scrub: 1 }))?.steps.length ?? 0;
    const first = Math.floor(steps / 3);
    const second = first + 1;
    expect(stepIndex(scrubFor(first, steps), steps), "the two scrubs must name different terms").toBe(first);
    expect(stepIndex(scrubFor(second, steps), steps)).toBe(second);

    view.drawNow(drawOf({ expr, scrub: scrubFor(first, steps), showStep: true }));
    const before = [num(host, "mod"), num(host, "arg"), num(host, "dz"), num(host, "term")];
    view.drawNow(drawOf({ expr, scrub: scrubFor(second, steps), showStep: true }));
    const after = [num(host, "mod"), num(host, "arg"), num(host, "dz"), num(host, "term")];
    expect(`moved: ${String(after.some((v, i) => v !== before[i]))}`).toBe("moved: true");

    const d = drawOf({ expr, scrub: scrubFor(second, steps), showStep: true });
    const stepAfter = view.accumulation(d)?.steps[second];
    if (stepAfter === undefined) throw new Error("no second step");
    expect(`term: ${after[3]}`).toBe(`term: ${fmtCx(stepAfter.term)}`);
  });
});

describe("the tri-state: the mode decides by default, the reader overrides", () => {
  /**
   * The defect a plain boolean would carry, and why `showStep` is `boolean | null`: with two states
   * there is no way to tell "off because Explore is off by default" from "off because I turned it
   * off", so a reader who deliberately turns the detail ON in Explore loses it the moment the app
   * touches the field, and one who turns it OFF in a worked example gets it back. Both halves are
   * asserted, because a resolver that ignored `showStep` entirely passes a defaults-only check and a
   * resolver that ignored the MODE passes an override-only one.
   */
  it("is on in Worked example and off in Explore when nothing was chosen", () => {
    const { host, view } = mount();
    view.drawNow(drawOf({ showStep: null, workedExample: true }));
    expect(`worked, unchosen: ${String(detailShowing(host))}`).toBe("worked, unchosen: true");
    view.drawNow(drawOf({ showStep: null, workedExample: false }));
    expect(`explore, unchosen: ${String(detailShowing(host))}`).toBe("explore, unchosen: false");
  });

  it("and an explicit choice beats the mode in BOTH directions", () => {
    const { host, view } = mount();
    view.drawNow(drawOf({ showStep: false, workedExample: true }));
    expect(`worked, turned off: ${String(detailShowing(host))}`).toBe("worked, turned off: false");
    view.drawNow(drawOf({ showStep: true, workedExample: false }));
    expect(`explore, turned on: ${String(detailShowing(host))}`).toBe("explore, turned on: true");
  });

  it("but a DRILL rung defaults to off, although a rung is a worked example", () => {
    // `showStepDetail`'s recorded decision: the fade is the point, and two arrows naming the very
    // term a rung is asking about is the app answering its own question. The pairing is what makes
    // it a claim about the DRILL rather than about the mode — the same state with `drill` cleared,
    // `workedExample` still true, shows the detail. So `drill` is read, and it wins.
    const task = DRILL_TASKS[0];
    if (task === undefined) throw new Error("the drill has no tasks to open");
    const { host, view } = mount();
    const rung = { showStep: null, workedExample: true, drill: { task: task.id, stage: 2 as const } };
    view.drawNow(drawOf(rung));
    expect(`at a rung: ${String(detailShowing(host))}`).toBe("at a rung: false");
    view.drawNow(drawOf({ ...rung, drill: null }));
    expect(`the same state, not at a rung: ${String(detailShowing(host))}`).toBe(
      "the same state, not at a rung: true",
    );
    // …and the reader can still ask for it at a rung, which is the other half of "unasked" being
    // the thing refused rather than the detail itself.
    view.drawNow(drawOf({ ...rung, showStep: true }));
    expect(`asked for at a rung: ${String(detailShowing(host))}`).toBe("asked for at a rung: true");
  });
});

describe("the toggle", () => {
  /**
   * The defect: the button owns no state — the shell does — so it must ask for the opposite of what
   * is CURRENTLY RESOLVED, not the opposite of `state.showStep`. Those differ exactly where the
   * tri-state earns its keep: in Worked example with nothing chosen, `showStep` is `null`, and a
   * toggle reading `!state.showStep` would ask for `true` while the detail is already showing —
   * a press that visibly does nothing.
   */
  it("asks for the opposite of what is SHOWING, from either side of the default", () => {
    const { host, view, input } = mount();
    view.drawNow(drawOf({ showStep: null, workedExample: true }));
    expect(detailShowing(host), "the fixture must start with the detail on").toBe(true);
    q(host, "[data-testid=acc-step-toggle]")?.click();
    expect(input.shown).toEqual([false]);
    expect(input.said).toEqual(["Step detail off."]);

    const second = mount();
    second.view.drawNow(drawOf({ showStep: null, workedExample: false }));
    expect(detailShowing(second.host), "…and the other fixture with it off").toBe(false);
    q(second.host, "[data-testid=acc-step-toggle]")?.click();
    expect(second.input.shown).toEqual([true]);
    expect(second.input.said).toEqual(["Step detail on."]);
  });

  it("carries aria-pressed, true AND false", () => {
    // The segmented control's rule, in the one button that is not part of it: the class the old shell
    // toggled is invisible to assistive tech. Both renderings, because an attribute hardcoded to
    // `"false"` — or missing, which reads as unpressed — passes a one-sided check perfectly.
    const { host, view } = mount();
    for (const [label, over] of [
      ["showing", { showStep: true }],
      ["hidden", { showStep: false }],
    ] as const) {
      view.drawNow(drawOf(over));
      const button = q(host, "[data-testid=acc-step-toggle]");
      if (button === null) throw new Error("the toggle must be offered whether or not the detail is on");
      expect(`${label}: aria-pressed=${String(button.getAttribute("aria-pressed"))}`).toBe(
        `${label}: aria-pressed=${String(over.showStep)}`,
      );
      expect(`${label}: detail=${String(detailShowing(host))}`).toBe(`${label}: detail=${String(over.showStep)}`);
    }
  });
});

describe("a term that is not a finite number", () => {
  /**
   * `removable-one-minus-cos` integrates `(1 − cos z)/z²` along `[−4, 4]`, and an even step count
   * puts a midpoint EXACTLY on the removable singularity, so `0/0` makes that term `NaN` and poisons
   * every running total after it. Taken through the real record rather than through a hand-built
   * `Accumulation` — the point of naming that record in `stepDetail`'s doc is that the corpus
   * reaches this, and a fabricated NaN would prove the branch runs without proving anything reaches
   * it.
   *
   * What it protects against: four rows reading `NaN`, or — worse, since `fmtApprox` drops a
   * component it cannot distinguish from zero — four rows reading `0.0000` for a term the walk does
   * not have. The honest-labelling guardrail one level below the verdict.
   */
  const gallery = { mode: "gallery" as const, record: "removable-one-minus-cos", fixture: 0, showStep: true };

  /** Where the walk goes non-finite, and one good step to contrast it with. */
  function poisoned(view: StripView): { readonly bad: number; readonly good: number; readonly steps: number } {
    const acc = view.accumulation(drawOf(gallery));
    if (acc === null) throw new Error("the record should accumulate");
    const bad = acc.steps.findIndex((s) => !Number.isFinite(s.term[0]) || !Number.isFinite(s.term[1]));
    if (bad < 0) throw new Error("this record is supposed to sample its own removable singularity");
    const good = bad === 0 ? 1 : bad - 1;
    const other = acc.steps[good];
    if (other === undefined || !Number.isFinite(other.term[0])) throw new Error("no finite neighbour to contrast");
    return { bad, good, steps: acc.steps.length };
  }

  it("gets one sentence instead of four blank slots", () => {
    const { host, view } = mount();
    const { bad, steps } = poisoned(view);
    const d = drawOf({ ...gallery, scrub: scrubFor(bad, steps) });
    view.drawNow(d);
    // The scrub really is on the poisoned term, so the refusal below is about THAT step and not
    // about a panel that shows the sentence at every position.
    expect(`the scrubbed index: ${String(view.stepAt(d)?.index)}`).toBe(`the scrubbed index: ${bad}`);
    const none = q(host, "[data-testid=acc-step-none]")?.textContent ?? "";
    expect(none.length, `the refusal must be a sentence, got ${JSON.stringify(none)}`).toBeGreaterThan(20);
    expect(none).toContain("not a finite number");
    expect(`the four numbers: ${String(detailShowing(host))}`).toBe("the four numbers: false");
    expect(q(host, "[data-testid=acc-term]")).toBe(null);
    // The toggle stands alone rather than disappearing with the rows it controls: a reader who
    // scrubbed onto a bad term and lost the control could not scrub off it with the panel's own UI.
    expect(q(host, "[data-testid=acc-step-toggle]")).not.toBe(null);
  });

  it("and the very next term along the SAME walk still gets its four numbers", () => {
    // The anti-vacuity half. Without it, a panel that printed the sentence unconditionally — or one
    // that never printed the rows at all under a gallery record — passes the test above.
    const { host, view } = mount();
    const { good, steps } = poisoned(view);
    const d = drawOf({ ...gallery, scrub: scrubFor(good, steps) });
    view.drawNow(d);
    expect(q(host, "[data-testid=acc-step-none]")).toBe(null);
    expect(`the four numbers: ${String(detailShowing(host))}`).toBe("the four numbers: true");
    const step = view.accumulation(d)?.steps[good];
    if (step === undefined) throw new Error("no step to compare");
    expect(`dz: ${num(host, "dz")}`).toBe(`dz: ${fmtCx(step.dz)}`);
    expect(`term: ${num(host, "term")}`).toBe(`term: ${fmtCx(step.term)}`);
  });
});

describe("when only one arrow can be drawn", () => {
  /**
   * The ratio of the two arrows is exactly `|f(z_k)|`, so one of them falls under
   * `MIN_ARROW_PX` whenever `|f|` is far from 1 — measured over the corpus, on **2,545 of 6,717**
   * finite steps, and on a vanishing-arc record it is most of them, because `|f| ≪ 1` out on the
   * arc is what makes the arc vanish. A reader then sees ONE arrow with four numbers beside it,
   * and without a sentence that reads as the picture being broken rather than as the KILL lemma
   * drawn. The mutation sweep found this one missing: removing the sentence left every other
   * assertion in this file green.
   */
  // **The fixture has to reach a ratio of 1/30, and the obvious ones do not.** The shorter arrow is
  // `60·min(|f|, 1/|f|)` px against a 2 px floor, so an arrow goes only where `|f|` leaves
  // `[1/30, 30]`. On the sandbox's circle of radius 1.5 a cubic pole at 0.99 gives `|f|` in
  // `[0.065, 7.5]` — a 115× spread and not one dropped arrow. A sixth power of the distance to a
  // point just outside the circle gives `[1e-6, 594]`, drops arrows at BOTH ends, and has no pole
  // to put on the contour.
  const strong = "(z - 1.4)^6";

  it("names the arrow that is missing, and says why", () => {
    const { host, view } = mount();
    const base = drawOf({ expr: strong, workedExample: true });
    const acc = view.accumulation(base);
    if (acc === null) throw new Error("the fixture must accumulate");
    // Find a step whose amplification is far enough from 1 to drop an arrow, and one that is not.
    let dropped = -1;
    let kept = -1;
    for (let k = 0; k < acc.steps.length; k += 1) {
      const d = stepDetail(acc.steps[k], k, 1);
      if (d === null) continue;
      if (dropped < 0 && (d.dz === null || d.term === null)) dropped = k;
      if (kept < 0 && d.dz !== null && d.term !== null) kept = k;
    }
    expect(`a dropped step exists: ${dropped >= 0}`).toBe("a dropped step exists: true");
    expect(`a kept step exists: ${kept >= 0}`).toBe("a kept step exists: true");

    view.drawNow(drawOf({ expr: strong, workedExample: true, scrub: scrubFor(dropped, acc.steps.length) }));
    const said = q(host, "[data-testid=acc-step-missing]");
    expect(`the sentence is there: ${said !== null}`).toBe("the sentence is there: true");
    // It NAMES the arrow rather than saying something is missing: which one it is, is the whole
    // content — the term's going is the lemma, the step's going is an amplification off the scale.
    const which = stepDetail(acc.steps[dropped], dropped, 1);
    const wanted = which !== null && which.term === null ? "f(z_k)" : "\\Delta z_k";
    expect(`names ${wanted}: ${(said?.textContent ?? "").includes(wanted.replace("\\\\", "\\"))}`).toBe(
      `names ${wanted}: true`,
    );
    // And the four numbers are STILL there — dropping an arrow is not dropping the term.
    expect(`the numbers survive: ${detailShowing(host)}`).toBe("the numbers survive: true");
  });

  it("and says nothing at a step where both arrows are drawn", () => {
    const { host, view } = mount();
    const base = drawOf({ expr: strong, workedExample: true });
    const acc = view.accumulation(base);
    if (acc === null) throw new Error("the fixture must accumulate");
    let kept = -1;
    for (let k = 0; k < acc.steps.length && kept < 0; k += 1) {
      const d = stepDetail(acc.steps[k], k, 1);
      if (d !== null && d.dz !== null && d.term !== null) kept = k;
    }
    view.drawNow(drawOf({ expr: strong, workedExample: true, scrub: scrubFor(kept, acc.steps.length) }));
    expect(`sentence at a two-arrow step: ${q(host, "[data-testid=acc-step-missing]") !== null}`).toBe(
      "sentence at a two-arrow step: false",
    );
    expect(`the numbers are there: ${detailShowing(host)}`).toBe("the numbers are there: true");
  });
});
