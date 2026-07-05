/**
 * Viewport-aware initial render resolution: the desktop default (500) on wide viewports, a clamped
 * smaller value on a phone. Desktop returning 500 unchanged is the key property — it keeps existing
 * share links reproducible.
 */
import { describe, it, expect } from "vitest";
import { initialRes } from "../src/render/glPlot";

describe("initialRes", () => {
  it("returns the desktop default (500) on wide viewports", () => {
    expect(initialRes(1440)).toBe(500);
    expect(initialRes(700)).toBe(500); // tablet/desktop threshold
    expect(initialRes(1200)).toBe(500);
  });

  it("shrinks on a phone, clamped to [280, 500]", () => {
    expect(initialRes(390)).toBe(350); // 390 − 40
    expect(initialRes(360)).toBe(320);
    expect(initialRes(320)).toBe(280); // 320 − 40 = 280
    expect(initialRes(300)).toBe(280); // clamped up to the floor
  });

  it("falls back to 500 for a non-finite width", () => {
    expect(initialRes(NaN)).toBe(500);
    expect(initialRes(Infinity)).toBe(500);
  });
});
