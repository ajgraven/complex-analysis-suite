/**
 * Auto-iteration scaling law: the iteration cap grows linearly in log₁₀(zoom) (a constant
 * number of extra iterations per decade of magnification), depends on zoom alone (not the
 * view centre), never drops below the base, and is clamped to a hard ceiling.
 */
import { describe, it, expect } from "vitest";
import { autoIterations, effectiveAA } from "../src/render/glPlot";

describe("autoIterations", () => {
  it("returns the base count when not zoomed in (zoom ≤ 1)", () => {
    expect(autoIterations(100, 1, 1.5)).toBe(100);
    expect(autoIterations(100, 0.5, 1.5)).toBe(100); // zoom < 1 → no extra iterations
    expect(autoIterations(100, 1e-5, 1.5)).toBe(100); // never below base
  });

  it("grows linearly with each decade of zoom (strength = extra ×base per decade)", () => {
    expect(autoIterations(100, 1e3, 1.5)).toBe(550); // 100·(1 + 1.5·3)
    expect(autoIterations(100, 1e6, 1.5)).toBe(1000); // 100·(1 + 1.5·6)
    expect(autoIterations(100, 1e12, 1.5)).toBe(1900); // 100·(1 + 1.5·12)
  });

  it("is monotonic in zoom and scales with the base count", () => {
    expect(autoIterations(100, 1e6, 1.5)).toBeGreaterThan(autoIterations(100, 1e3, 1.5));
    expect(autoIterations(200, 1e6, 1.5)).toBe(2000); // 200·(1 + 1.5·6)
  });

  it("strength 0 disables scaling (stays at base)", () => {
    expect(autoIterations(100, 1e9, 0)).toBe(100);
    expect(autoIterations(100, 1e9, -3)).toBe(100); // negative strength clamped to 0
  });

  it("clamps to the 20000 hard ceiling at extreme zoom / high base", () => {
    expect(autoIterations(2000, 1e13, 4)).toBe(20000); // 2000·53 = 106000 → capped
  });
});

describe("effectiveAA (samples per frame)", () => {
  const idle = { mode: 0, draft: false, accumulating: false };

  it("uses the requested spatial AA on an ordinary idle frame", () => {
    expect(effectiveAA(3, idle)).toBe(3);
    expect(effectiveAA(1, idle)).toBe(1);
    expect(effectiveAA(4, idle)).toBe(4);
  });

  it("forces a single sample while accumulating — the jitter is the anti-aliasing", () => {
    // The key fix: aa=3 + accumulate must NOT render 9 samples/frame (that was ~9× wasted work).
    expect(effectiveAA(3, { ...idle, accumulating: true })).toBe(1);
    expect(effectiveAA(4, { ...idle, accumulating: true })).toBe(1);
  });

  it("forces a single sample while drafting and for the histogram pre-pass (mode 6)", () => {
    expect(effectiveAA(3, { ...idle, draft: true })).toBe(1);
    expect(effectiveAA(3, { mode: 6, draft: false, accumulating: false })).toBe(1);
  });

  it("never returns less than one sample", () => {
    expect(effectiveAA(0, idle)).toBe(1);
  });
});
