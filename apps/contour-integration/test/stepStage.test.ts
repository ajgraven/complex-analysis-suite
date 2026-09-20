// @vitest-environment jsdom
//
// **The step, on the stage itself** — M8 step 3.1c, the jsdom half of the plan's gate.
//
// `test/stepFocus.test.ts` asserts what a step RESOLVES to over the whole corpus; this asserts that
// the stage draws it — that the overlay really carries the chip, that stepping moves it, and that
// the three suppressions hold. jsdom has no 2-D context, so nothing on the ink canvas is visible
// from here; the overlay is DOM and is drawn FIRST and unconditionally, which is the property step
// 1.3 made deliberate and this test is the second reader of.
//
// The pixels are the browser pass's: `M8/screens/3.1c-*`.
import { describe, expect, it } from "vitest";

import { createStageView, type StageDraw } from "../src/shell/stageView.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";
import { defaultSession, type Session } from "../src/shell/session.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { argumentOf } from "../src/shell/argument.js";

/** A6 — a semicircle, one vanishing arc, two enclosed poles: every step kind but the sum. */
const RECORD = "semicircle-quartic";

function draw(step: number | "all", over: Partial<StageDraw> = {}): { root: HTMLElement; d: StageDraw } {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const state = { ...defaultState(circleTemplate([0, 0], 1.5)), mode: "gallery" as const, record: RECORD, fixture: 0 };
  const resolution = resolveState(state, compile(state.expr));
  const session: Session = { ...defaultSession(), step };
  const view = createStageView(root);
  const d: StageDraw = { state, resolution, session, poles: null, ...over };
  view.drawNow(d);
  return { root, d };
}

const chips = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(".overlay2 .stageChip.callout")];

/**
 * What a callout SAYS, as its own source sentence — M8 step 3.6.
 *
 * A chip used to carry `mathPlain` of its text as an `aria-label`, and these tests read it there.
 * Step 3.6 took the label away and made the chip `aria-hidden` instead, on the measurement that a
 * callout is a FORMULA with no honest short spoken form and that everything it points at is on the
 * Derivation card on the same step. So the sentence is reassembled from the DOM — prose from the
 * text nodes, mathematics from `data-tex` — which is character for character the string the
 * `aria-label` used to hold.
 */
function saysOf(chip: Element | undefined): string {
  if (chip === undefined) return "";
  const clone = chip.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll('[role="math"]')) {
    m.replaceChildren(clone.ownerDocument.createTextNode(m.getAttribute("data-tex") ?? ""));
  }
  // The badge is the claim's LEVEL, not part of its sentence — it was never in the old name either.
  for (const b of clone.querySelectorAll(".badge")) b.remove();
  return clone.textContent ?? "";
}

describe("the stage, while the reader is stepping", () => {
  it("draws no callout at All, which is the Phase 1 picture unchanged", () => {
    const { root } = draw("all");
    expect(chips(root)).toEqual([]);
  });

  it("puts the arc's bound on the plane at the arc's own step, badged", () => {
    const { d } = draw("all");
    const { steps } = argumentOf(d);
    const at = steps.findIndex((s) => s.kind === "boundary");
    expect(at, "A6 has no boundary step").toBeGreaterThan(0);

    const { root } = draw(at);
    const [chip] = chips(root);
    expect(chip, "the boundary step drew no callout").toBeDefined();
    // **Typeset, and no delimiter on screen** — the rule every `$…$` sentence in this app follows.
    expect(chip?.querySelector(".katex"), "the bound was not typeset").not.toBeNull();
    expect(chip?.textContent ?? "").not.toContain("$");
    // **The bound's own number, in the sentence the chip was built from.** Read through `saysOf`
    // since step 3.6 — the chip is `aria-hidden` now and has no name to read — which keeps the
    // claim exactly: this chip carries THIS certified bound, not some other step's.
    expect(saysOf(chip)).toContain("\\le 4.928e-2");
    // **The badge is the claim's level, on the chip.** A bound shown without its `≤` is the
    // honest-labelling guardrail dropped at the one place the reader is looking.
    expect(chip?.querySelector(".badge")?.getAttribute("data-level")).toBe("≤");
    // Positioned from the CAMERA — it is placed, not in the flow.
    expect(chip?.getAttribute("style") ?? "").toMatch(/left:-?\d+px;top:-?\d+px/);
  });

  it("moves the callout when the step moves, and drops it where a step has none", () => {
    const { d } = draw("all");
    const { steps } = argumentOf(d);
    // `saysOf` rather than the chip's accessible name — step 3.6 made the chip `aria-hidden`, so
    // the sentence has to be read back out of the DOM it was rendered into. The claims below are
    // unchanged: which steps draw a chip, that the chips differ, and what two of them name.
    const seen = steps.map((_, k) => {
      const { root } = draw(k);
      return chips(root).map((c) => saysOf(c));
    });
    // Every step draws at most one chip, and the set of texts is not constant — a fixed chip would
    // satisfy "there is a callout" without saying anything about the step.
    for (const row of seen) expect(row.length).toBeLessThanOrEqual(1);
    expect(new Set(seen.flat()).size, "every step drew the same chip").toBeGreaterThan(2);
    // The problem step and the hypotheses are about the argument, not about an object on the plane.
    expect(seen[steps.findIndex((s) => s.kind === "problem")]).toEqual([]);
    expect(seen[steps.findIndex((s) => s.kind === "hypotheses")]).toEqual([]);
    // The residue step names its pole, the target step the answer.
    expect(seen[steps.findIndex((s) => s.kind === "residues")]?.[0]).toContain("Res = ");
    expect(seen[steps.findIndex((s) => s.kind === "target")]?.[0]).toContain("the integral = ");
  });

  it("pulses the limit step's chip, and only that one", () => {
    const { d } = draw("all");
    const { steps } = argumentOf(d);
    const pulsed = steps.map((_, k) => {
      const { root } = draw(k);
      return chips(root).filter((c) => c.classList.contains("pulse")).length;
    });
    expect(pulsed.filter((n) => n > 0).length, "A6 takes exactly one limit").toBe(1);
    expect(pulsed[steps.findIndex((s) => s.kind === "limit")]).toBe(1);
  });

  it("hides every callout while a gesture is running", () => {
    const { d } = draw("all");
    const at = argumentOf(d).steps.findIndex((s) => s.kind === "boundary");
    expect(chips(draw(at).root).length).toBe(1);
    for (const gesture of ["contour", "handle", "view"] as const) {
      const state = { ...defaultState(circleTemplate([0, 0], 1.5)), mode: "gallery" as const, record: RECORD, fixture: 0 };
      const resolution = resolveState(state, compile(state.expr));
      const root = document.createElement("div");
      document.body.replaceChildren(root);
      createStageView(root).drawNow({
        state,
        resolution,
        session: { ...defaultSession(), step: at, gesture },
        poles: null,
      });
      // A chip pinned to a piece's midpoint would be dragged a frame behind the curve it names.
      expect(chips(root), gesture).toEqual([]);
    }
  });

  it("draws no callout into an EXPORT PLATE, however the reader is stepping", () => {
    const { d } = draw("all");
    const at = argumentOf(d).steps.findIndex((s) => s.kind === "boundary");
    for (const plate of ["dark", "light", "print"] as const) {
      // A figure carries the whole contour: the permalink stamped into the same PNG does not carry
      // the step (it is the session's), so a plate dimmed to one step would be a picture the link
      // beside it cannot reopen.
      expect(chips(draw(at, { plate }).root), plate).toEqual([]);
    }
  });
});

describe("what the stage puts in the accessibility tree — M8 step 3.6", () => {
  it("HIDES the callout, because a certified bound has no honest short reading", () => {
    // It used to carry `mathPlain` of its own text, so a screen-reader user was read
    // `\\left|\\int g(z)e^{iaz}\\,dz\\right| \\le …` character by character. Nothing is lost by the
    // silence: all four callout kinds are drawn from something the Derivation card renders on the
    // SAME step — `step.lines`, `step.statements`, `step.poles`, the conclusion in its footer — and
    // a chip is a POINTER onto the plane, which is the one thing a screen reader cannot use.
    const steps = argumentOf({
      state: { ...defaultState(circleTemplate([0, 0], 1.5)), mode: "gallery", record: RECORD, fixture: 0 },
      resolution: resolveState(
        { ...defaultState(circleTemplate([0, 0], 1.5)), mode: "gallery", record: RECORD, fixture: 0 },
        null,
      ),
      poles: null,
    }).steps;
    const at = steps.findIndex((st) => st.kind === "boundary");
    expect(at, "no boundary step to put a chip on").toBeGreaterThanOrEqual(0);
    const { root } = draw(at);
    const chip = chips(root)[0];
    expect(chip, "the step drew no callout, so this asserts nothing").not.toBeUndefined();
    expect(chip?.getAttribute("aria-hidden")).toBe("true");
    // And it names nothing of its own either, so hiding it is not undone by a label above it.
    expect(chip?.hasAttribute("aria-label")).toBe(false);
  });

  it("SPEAKS the held handle's name, because a piece name is a name and not a formula", () => {
    // The two chips are treated oppositely and the reason is the content: `the circle $|z - a| = R$`
    // is a NAME, which the spoken map covers, where a callout is a claim. `mathPlain` left the
    // macros in both.
    const { root } = draw("all", {
      session: {
        ...defaultSession(),
        step: "all",
        held: { at: [0, 0], label: "the $R \\to \\infty$ semicircle" },
      } as Session,
    });
    const chip = root.querySelector<HTMLElement>(".overlay2 .stageChip.held");
    expect(chip, "no held chip was drawn").not.toBeNull();
    expect(chip?.getAttribute("aria-label")).toBe("the R to infinity semicircle");
  });
});

