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
    // The accessible name is the sentence, because KaTeX's own output reads as nonsense.
    expect(chip?.getAttribute("aria-label")).toContain("\\le 4.928e-2");
    // **The badge is the claim's level, on the chip.** A bound shown without its `≤` is the
    // honest-labelling guardrail dropped at the one place the reader is looking.
    expect(chip?.querySelector(".badge")?.getAttribute("data-level")).toBe("≤");
    // Positioned from the CAMERA — it is placed, not in the flow.
    expect(chip?.getAttribute("style") ?? "").toMatch(/left:-?\d+px;top:-?\d+px/);
  });

  it("moves the callout when the step moves, and drops it where a step has none", () => {
    const { d } = draw("all");
    const { steps } = argumentOf(d);
    const seen = steps.map((_, k) => {
      const { root } = draw(k);
      return chips(root).map((c) => c.getAttribute("aria-label") ?? "");
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
