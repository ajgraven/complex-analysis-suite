/**
 * Auto-iteration scaling law: the iteration cap grows linearly in log₁₀(zoom) (a constant
 * number of extra iterations per decade of magnification), depends on zoom alone (not the
 * view centre), never drops below the base, and is clamped to a hard ceiling.
 */
import { describe, it, expect } from "vitest";
import { MAX_BUFFER, autoIterations, bufferScale, effectiveAA } from "../src/render/glPlot";

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

describe("bufferScale (DPR buffer budget)", () => {
  it("keeps the full 2× DPR for a small canvas (under the budget)", () => {
    expect(bufferScale(2, 500)).toBe(2); // 500·2 = 1000 ≤ 1100
    expect(bufferScale(2, 350)).toBe(2);
  });

  it("caps the supersampling so a large canvas stays within the budget", () => {
    const s = bufferScale(2, 700); // would be 1400 at 2×
    expect(s).toBeCloseTo(MAX_BUFFER / 700, 10); // 700·s = MAX_BUFFER
    expect(700 * s).toBeCloseTo(MAX_BUFFER, 6);
    expect(s).toBeLessThan(2);
  });

  it("never renders below 1:1 (a canvas larger than the budget stays crisp)", () => {
    expect(bufferScale(2, 1500)).toBe(1); // capped to 1:1, not blurrier than the chosen res
    expect(bufferScale(1, 1500)).toBe(1);
  });

  it("is a no-op on a non-HiDPI (dpr = 1) display", () => {
    expect(bufferScale(1, 720)).toBe(1);
    expect(bufferScale(1, 500)).toBe(1);
  });

  it("caps the DPR at 2× and preserves sub-1 device ratios", () => {
    expect(bufferScale(3, 400)).toBe(2); // dpr capped at 2
    expect(bufferScale(0.75, 400)).toBe(0.75); // low-density display kept 1:1 to device px
  });
});
