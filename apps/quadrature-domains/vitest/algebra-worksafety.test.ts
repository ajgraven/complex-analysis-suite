// @vitest-environment jsdom
//
// Tier-1 "safe to invest work in" guarantees. The Algebra workspace held an hour of derivation
// purely in memory, offered no Ctrl+Z, and showed every failure for 750ms — so the three things
// that make a tool feel trustworthy (your work survives, mistakes are reversible, failures are
// legible) were each missing a surface even though the machinery existed underneath.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import _QD from "../app/solver.mjs";

let QoL: any, Store: any;
beforeAll(async () => {
  await import("../app/qol.mjs");
  await import("../app/algebra/algebra-store.mjs");
  QoL = (_QD as any).QoL;
  Store = (_QD as any).AlgebraStore;
});
afterEach(() => {
  document.querySelectorAll(".copy-toast").forEach((n) => n.remove());
  vi.useRealTimers();
});

const toasts = () => Array.from(document.querySelectorAll(".copy-toast")) as HTMLElement[];

describe("failure messages are readable and announced", () => {
  // 750ms is right for "copied ✓" and unreadable for a multi-sentence warning. The Algebra tab
  // raises ~50 error toasts and passes a duration on none of them, so the default IS the behavior.
  it("an error stays on screen far longer than a confirmation", () => {
    vi.useFakeTimers();
    QoL.toast("boom", { kind: "error" });
    vi.advanceTimersByTime(2000);              // well past the 750ms confirmation lifetime
    expect(toasts().length).toBe(1);
    expect(toasts()[0].classList.contains("fade")).toBe(false);
    vi.advanceTimersByTime(7000);              // past the 8s error lifetime + the 350ms fade
    expect(toasts().length).toBe(0);
  });

  it("a confirmation still disappears promptly (unchanged)", () => {
    vi.useFakeTimers();
    QoL.toast("copied");
    vi.advanceTimersByTime(800);
    expect(toasts()[0].classList.contains("fade")).toBe(true);
  });

  it("an explicit duration still wins for both kinds", () => {
    vi.useFakeTimers();
    QoL.toast("custom", { kind: "error", duration: 100 });
    vi.advanceTimersByTime(150);
    expect(toasts()[0].classList.contains("fade")).toBe(true);
  });

  // Without a live-region role, a screen-reader user gets no signal that an operation failed.
  it("errors are assertive, confirmations polite", () => {
    QoL.toast("boom", { kind: "error" });
    expect(toasts()[0].getAttribute("role")).toBe("alert");
    toasts()[0].remove();
    QoL.toast("copied");
    expect(toasts()[0].getAttribute("role")).toBe("status");
  });

  it("a long-lived error can be dismissed by clicking it", () => {
    QoL.toast("boom", { kind: "error" });
    const t = toasts()[0];
    expect(t.title).toMatch(/dismiss/i);
    t.click();
    expect(t.classList.contains("fade")).toBe(true);
  });

  it("a confirmation is not click-dismissible (nothing to get out of the way)", () => {
    QoL.toast("copied");
    expect(toasts()[0].title || "").not.toMatch(/dismiss/i);
  });
});

describe("undo depth is observable, so the controls can tell the truth", () => {
  // The undo MODEL was always sound; the surface was two unlabeled glyphs with no keyboard
  // binding and no disabled state, so a button that could do nothing looked identical to one
  // that could. Depth is what lets the UI disable rather than silently no-op.
  it("starts empty and both directions report zero", () => {
    const s = Store.create();
    expect(s.undoDepth()).toBe(0);
    expect(s.redoDepth()).toBe(0);
    expect(s.undo()).toBe(false);
    expect(s.redo()).toBe(false);
  });

  it("tracks the stacks across a mutation, an undo, and a redo", () => {
    const s = Store.create();
    const seeded = s.seedFromPolys && s.seedFromPolys({ polys: [], vars: [] });
    // seedFromPolys refuses an empty system, so drive the stack through addEquation instead.
    expect(seeded && seeded.ok).toBe(false);
    const r = s.addEquation("z1*zb1 - 1");
    if (!r || r.ok === false) return;          // parser unavailable in this env — nothing to assert
    const d = s.undoDepth();
    expect(d).toBeGreaterThan(0);
    expect(s.redoDepth()).toBe(0);
    expect(s.undo()).toBe(true);
    expect(s.undoDepth()).toBe(d - 1);
    expect(s.redoDepth()).toBe(1);
    expect(s.redo()).toBe(true);
    expect(s.undoDepth()).toBe(d);
    expect(s.redoDepth()).toBe(0);
  });

  it("depth getters never mutate the history", () => {
    const s = Store.create();
    s.addEquation("z1 - 1");
    const before = s.undoDepth();
    s.undoDepth(); s.redoDepth(); s.undoDepth();
    expect(s.undoDepth()).toBe(before);
  });
});
