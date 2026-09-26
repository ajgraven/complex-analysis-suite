// @vitest-environment jsdom
// The tour (PLAN §7 PRA-10): every step opens a state the app resolves, every claim is a certificate
// read off that state, and every prediction is graded against the run — not against an answer key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type App } from "../src/shell/app.js";
import { DEFAULT_STATE, resolveState } from "../src/shell/state.js";
import {
  TOUR_STEPS,
  onTourStep,
  tourState,
  type TourContext,
} from "../src/shell/tour.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { galoisEvidence, galoisRequest } from "../src/engine/galois/tier0.js";
import { DENYLIST, TOUR } from "../src/engine/vocabulary.js";
import { decodeViewState } from "@cas/interchange";

function context(k: number): TourContext {
  const s = tourState(k, DEFAULT_STATE);
  const res = resolveState(s);
  const req = res.poly ? galoisRequest(res.poly) : null;
  return { res, galois: req?.ok ? galoisEvidence(req.request) : null };
}

describe("the tour's steps, as states", () => {
  it("every step resolves, is on its own step, and makes at least one claim", () => {
    for (let k = 0; k < TOUR_STEPS.length; k++) {
      const s = tourState(k, DEFAULT_STATE);
      expect(s.tour).toBe(k);
      expect(onTourStep(k, s)).toBe(true);
      const ctx = context(k);
      expect(ctx.res.poly, TOUR_STEPS[k].id).not.toBeNull();
      if (s.ladder) expect(ctx.res.ladder?.ok, TOUR_STEPS[k].id).toBe(true);
      expect(TOUR_STEPS[k].claims(ctx).length, TOUR_STEPS[k].id).toBeGreaterThan(0);
    }
  });

  it("each prediction's answer is the run's, and is the lecture's point", () => {
    const answers = Object.fromEntries(
      TOUR_STEPS.flatMap((s, k) => (s.answer ? [[s.id, s.answer(context(k))]] : [])),
    );
    expect(answers).toEqual({
      swap: 0, // a formula in the coefficients comes back
      sqrt: 1, // √ changes sign along a swap
      commutator: 0, // √disc comes back along a commutator
      cardano: 1, // Cardano's cube root does not
      quintic: 0, // along a depth-2 word, every radical of a two-level formula comes back
    });
    // Every question has its choices, and every step that asks has an answer function.
    for (const s of TOUR_STEPS) {
      const t = TOUR.steps[s.id] as { question?: string; choices?: readonly string[] };
      expect(t.question !== undefined, s.id).toBe(s.answer !== undefined);
      if (t.question) expect(t.choices?.length).toBe(2);
    }
  });

  it("the claims name what the lecture says they show", () => {
    const text = (k: number): string =>
      TOUR_STEPS[k]
        .claims(context(k))
        .map((c) => `${c.level} ${c.claim}`)
        .join("\n");
    const at = (id: string): number => TOUR_STEPS.findIndex((s) => s.id === id);
    expect(text(at("cubicDone"))).toMatch(/6 → 3 → 1/);
    expect(text(at("quartic"))).toMatch(/24 → 12 → 4 → 1/);
    expect(text(at("everyDepth"))).toMatch(/120 → 60 → 60/);
    expect(text(at("galois"))).toMatch(/^= .*S₅/);
    expect(text(at("roots"))).toMatch(/^= /);
  });

  it("a step is left when the reader edits its state away", () => {
    const k = TOUR_STEPS.findIndex((s) => s.id === "cardano");
    const s = tourState(k, DEFAULT_STATE);
    expect(onTourStep(k, { ...s, ladder: { ...s.ladder!, word: "d2" } })).toBe(false);
    const r = TOUR_STEPS.findIndex((x) => x.id === "roots");
    const t = tourState(r, DEFAULT_STATE);
    expect(onTourStep(r, { ...t, poly: { kind: "text", text: "z^5 - z + 1" } })).toBe(
      false,
    );
    expect(onTourStep(r, { ...t, ladder: s.ladder })).toBe(false);
  });
});

function mount(hash = ""): { root: HTMLElement; app: App } {
  window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
  const root = document.createElement("div");
  root.id = "app";
  document.body.replaceChildren(root);
  return { root, app: mountApp(root) };
}
const card = (): HTMLElement | null =>
  document.querySelector("section[aria-labelledby='card-tour']");
const button = (text: string): HTMLButtonElement => {
  const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent === text,
  );
  if (!b) throw new Error(`no button ${text}`);
  return b;
};

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the Tour card", () => {
  it("the bar's button opens step 1; Next and Previous walk it; the ends are disabled", () => {
    const { app } = mount();
    expect(card()).toBeNull();
    button(TOUR.start).click();
    expect(app.currentState().tour).toBe(0);
    expect(card()?.textContent).toMatch(/Step 1 of 10/);
    expect(button(TOUR.previous).disabled).toBe(true);
    button(TOUR.next).click();
    expect(app.currentState().tour).toBe(1);
    expect(app.currentState().ladder).toMatchObject({ rung: 3, word: "d0" });
    button(TOUR.previous).click();
    expect(app.currentState().tour).toBe(0);
    app.actions().tour(TOUR_STEPS.length - 1);
    expect(button(TOUR.next).disabled).toBe(true);
    button(TOUR.leave).click();
    expect(app.currentState().tour).toBeNull();
    expect(card()).toBeNull();
  });

  it("a prediction hides the computation until it is made, then grades it from the run", () => {
    const { app } = mount();
    const k = TOUR_STEPS.findIndex((s) => s.id === "cardano");
    app.actions().tour(k);
    const before = card()?.textContent ?? "";
    expect(before).toMatch(TOUR.unanswered);
    expect(before).not.toMatch(TOUR.computed);
    expect(card()?.querySelectorAll(".claim")).toHaveLength(0);
    app.actions().predict(0);
    expect(card()?.querySelector(".grade")?.textContent).toBe(TOUR.wrong);
    expect(card()?.textContent).toMatch(TOUR.computed);
    expect(card()?.textContent).toMatch(/does not close/);
    app.actions().predict(1);
    expect(card()?.querySelector(".grade")?.textContent).toBe(TOUR.right);
    // Answers are this session's: leaving and coming back keeps them; the link never carries them.
    app.actions().tour(0);
    app.actions().tour(k);
    expect(card()?.querySelector(".grade")?.textContent).toBe(TOUR.right);
    const env = decodeViewState<Record<string, unknown>>(encodeShell(app.currentState()));
    expect(Object.keys(env?.state ?? {})).not.toContain("answers");
  });

  it("editing the state away says so and offers the way back, withholding the step's claims", () => {
    const { app } = mount();
    const k = TOUR_STEPS.findIndex((s) => s.id === "cubicDone");
    app.actions().tour(k);
    expect(card()?.querySelectorAll(".claim").length).toBeGreaterThan(0);
    app.actions().runWord("d1");
    expect(app.currentState().tour).toBe(k);
    expect(card()?.textContent).toMatch(TOUR.offStep);
    expect(card()?.querySelectorAll(".claim")).toHaveLength(0);
    button(TOUR.returnTo).click();
    expect(app.currentState().ladder?.word).toBe("d2");
    expect(card()?.textContent).not.toMatch(TOUR.offStep);
  });

  it("a tour step is a permalink, and a step the tour does not have is refused by name", () => {
    const { app } = mount();
    const k = TOUR_STEPS.findIndex((s) => s.id === "quartic");
    app.actions().tour(k);
    const hash = encodeShell(app.currentState());
    expect(decodeViewState<{ tu: number }>(hash)?.state.tu).toBe(k);
    const { app: again } = mount(hash);
    expect(again.currentState().tour).toBe(k);
    expect(again.currentState().ladder).toEqual(app.currentState().ladder);
    expect(card()?.textContent).toMatch(/Four roots need three levels/);
    // Trails and the tour are different fields on the wire.
    const trails = decodeShell(encodeShell({ ...app.currentState(), trails: true }));
    expect(trails?.ok && [trails.state.trails, trails.state.tour]).toEqual([true, k]);
    const bad = decodeShell(encodeShell({ ...app.currentState(), tour: 99 }));
    expect(bad?.ok === false && bad.reason).toBe("the tour has no step 99");
  });

  it("the Galois step reads the Galois card's evidence once it arrives", async () => {
    const { app } = mount();
    app.actions().tour(TOUR_STEPS.length - 1);
    await vi.waitFor(() => expect(app.galois()?.kind).toBe("done"), { timeout: 5000 });
    // The card re-renders when the evidence lands.
    expect(card()?.querySelector(".claim")?.textContent).toMatch(/S₅/);
  });

  it("no step's screen carries a method's house name", () => {
    const { app } = mount();
    for (let k = 0; k < TOUR_STEPS.length; k++) {
      app.actions().tour(k);
      if (TOUR_STEPS[k].answer) app.actions().predict(0);
      const t = document.body.textContent ?? "";
      for (const bad of DENYLIST) expect(t, TOUR_STEPS[k].id).not.toMatch(bad);
    }
  });
});
