import { describe, expect, it } from "vitest";
import { CONTROL_TIPS } from "../src/render/tooltip.js";

// The control tooltip copy is plain data so it can be gated here (the DOM wiring in createTooltip is
// verified in the browser). Every control the app attaches a tip to must have an entry, and each tip
// stays a short, plain-text line — long enough to explain, short enough not to become a paragraph.

const KEYS = [
  "move",
  "draw",
  "isolate",
  "clear",
  "fit",
  "reset",
  "png",
  "help",
  "simple",
  "explore",
  "theme",
  "play",
  "stop",
  "preset",
  "expr",
  "radius",
  "res",
  "speed",
  "chkDomain",
  "chkImage",
  "chkVectors",
] as const;

describe("CONTROL_TIPS (control tooltip copy)", () => {
  it("has exactly one tip per control, no missing or stray keys", () => {
    expect(Object.keys(CONTROL_TIPS).sort()).toEqual([...KEYS].sort());
  });

  it("each tip is a concise, non-empty, plain-text line", () => {
    for (const [key, text] of Object.entries(CONTROL_TIPS)) {
      expect(text.trim(), key).not.toBe("");
      expect(text.length, key).toBeLessThanOrEqual(120);
      expect(text, key).not.toMatch(/[<>]/); // plain text, not HTML
    }
  });
});
