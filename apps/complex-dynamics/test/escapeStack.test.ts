// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { escapeLayerCount, pushEscapeLayer, resetEscapeLayers } from "../src/ui/escapeStack";

// WP8/S5 (review 2026-09-16). Escape had six independent document-level handlers, each testing its
// own visibility and closing itself — so one press closed every open layer at once. The σ handler
// already carried a hand-written exception for one of the five pairs, which is what a missing stack
// looks like just before it is written.

afterEach(() => resetEscapeLayers());

const esc = (): void =>
  void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

describe("escapeStack", () => {
  it("closes the TOP layer only", () => {
    const closed: string[] = [];
    pushEscapeLayer(() => closed.push("plot"));
    pushEscapeLayer(() => closed.push("glossary"));
    esc();
    expect(closed).toEqual(["glossary"]); // the expanded plot survives — the whole point
  });

  it("uncovers the one beneath, in order", () => {
    const closed: string[] = [];
    const a = pushEscapeLayer(() => {
      closed.push("plot");
      a();
    });
    const b = pushEscapeLayer(() => {
      closed.push("glossary");
      b();
    });
    esc();
    esc();
    esc(); // nothing left — must not throw or repeat
    expect(closed).toEqual(["glossary", "plot"]);
    expect(escapeLayerCount()).toBe(0);
  });

  it("a layer that closes by its own button releases its place", () => {
    const closed: string[] = [];
    const release = pushEscapeLayer(() => closed.push("glossary"));
    release(); // the ✕, a backdrop click, anything
    expect(escapeLayerCount()).toBe(0);
    esc();
    expect(closed).toEqual([]);
  });

  it("releasing twice is harmless, and does not take someone else's place", () => {
    const first = pushEscapeLayer(() => {});
    const closed: string[] = [];
    pushEscapeLayer(() => closed.push("second"));
    first();
    first(); // the same release again
    expect(escapeLayerCount()).toBe(1);
    esc();
    expect(closed).toEqual(["second"]);
  });

  it("stops the event, so a handler still listening underneath does not also fire", () => {
    // This is what made the old arrangement wrong: every listener saw every Escape.
    let underneath = 0;
    document.addEventListener("keydown", () => void underneath++);
    pushEscapeLayer(() => {});
    esc();
    expect(underneath).toBe(0);
  });

  it("with nothing open, Escape is somebody else's event", () => {
    let underneath = 0;
    document.addEventListener("keydown", () => void underneath++);
    esc();
    expect(underneath).toBe(1);
  });
});
