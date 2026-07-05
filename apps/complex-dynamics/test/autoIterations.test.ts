/**
 * Auto-iteration scaling law: the iteration cap grows linearly in log₁₀(zoom) (a constant
 * number of extra iterations per decade of magnification), depends on zoom alone (not the
 * view centre), never drops below the base, and is clamped to a hard ceiling.
 */
import { describe, it, expect } from "vitest";
import type { Vec2 } from "../src/arrays";
import {
  MAX_BUFFER,
  autoIterations,
  bufferScale,
  collarBufferSize,
  effectiveAA,
  previewTransform,
} from "../src/render/glPlot";

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

  it("forces a single sample while rendering a collar (shown only in motion)", () => {
    expect(effectiveAA(3, { ...idle, collar: true })).toBe(1);
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

describe("previewTransform (Google-Maps interaction warp: src_uv = scale·uv + offset)", () => {
  const C: Vec2 = [-0.5, 0.3];

  it("is the identity when the view is unchanged", () => {
    const t = previewTransform(C, 200, C, 200);
    expect(t.scale).toBe(1);
    expect(t.offset[0]).toBeCloseTo(0, 12);
    expect(t.offset[1]).toBeCloseTo(0, 12);
  });

  it("zooming in 2× samples the centre half of the old frame (magnifies about centre)", () => {
    const t = previewTransform(C, 400, C, 200); // zoom doubled
    expect(t.scale).toBe(0.5);
    expect(t.offset[0]).toBeCloseTo(0.25, 12); // src = 0.5·uv + 0.25 ⇒ uv∈[0,1] → src∈[0.25,0.75]
    expect(t.offset[1]).toBeCloseTo(0.25, 12);
    // the centre pixel stays fixed
    expect(0.5 * 0.5 + t.offset[0]).toBeCloseTo(0.5, 12);
  });

  it("zooming out 2× shrinks the old frame (borders map outside → background)", () => {
    const t = previewTransform(C, 100, C, 200); // zoom halved
    expect(t.scale).toBe(2);
    expect(t.offset[0]).toBeCloseTo(-0.5, 12); // src = 2·uv − 0.5 ⇒ uv=0 → −0.5 (outside)
    expect(2 * 0.5 + t.offset[0]).toBeCloseTo(0.5, 12); // centre still fixed
  });

  it("panning shifts the sampling by centreΔ·zoom (no scale change)", () => {
    const z = 200;
    const d = 0.01; // pan the centre right by d
    const moved: Vec2 = [C[0] + d, C[1]];
    const t = previewTransform(moved, z, C, z);
    expect(t.scale).toBe(1);
    expect(t.offset[0]).toBeCloseTo((d * z) / 2, 12); // src_x = uv_x + d·z/2
    expect(t.offset[1]).toBeCloseTo(0, 12);
  });

  it("a collar (rendered at zoom/(1+m)) warps back to the identity at its own view", () => {
    // The collar frame for margin 0.4 is captured at lastZoom = zoom/1.4; viewing it at the same
    // resting view samples the centre 1/1.4 of it, leaving a 0.4/1.4 border to pan into (no grey).
    const z = 200;
    const t = previewTransform(C, z, C, z / 1.4);
    expect(t.scale).toBeCloseTo(1 / 1.4, 12);
    // uv=0 samples src = (1 − 1/1.4)/2 ≈ 0.143 > 0 ⇒ there is real fractal to the left of the viewport
    expect(t.offset[0]).toBeGreaterThan(0);
    expect(t.scale * 0.5 + t.offset[0]).toBeCloseTo(0.5, 12); // centre still fixed
  });
});

describe("collarBufferSize (overscan buffer, budget-capped)", () => {
  it("is the viewport at margin 0, and grows with the margin (equal density)", () => {
    expect(collarBufferSize(500, 0, 1100)).toBe(500);
    expect(collarBufferSize(500, 0.4, 1100)).toBe(700);
    expect(collarBufferSize(500, 1.0, 1100)).toBe(1000);
  });

  it("caps at the buffer budget for large canvases / margins", () => {
    expect(collarBufferSize(800, 1.0, 1100)).toBe(1100); // 1600 → capped
    expect(collarBufferSize(720, 1.0, 1100)).toBe(1100); // 1440 → capped
    expect(collarBufferSize(720, 0.4, 1100)).toBe(1008); // 1008 ≤ 1100, uncapped
  });
});
