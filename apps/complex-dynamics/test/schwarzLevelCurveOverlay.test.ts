// schwarzLevelCurveOverlay.test.ts — the σ level-curve painter (F4b). It strokes w-space segments (|σ| solid,
// arg σ dashed) onto a 2D context, one moveTo+lineTo per drawn segment, so a recording mock captures the
// calls. We assert one segment per on-canvas line, the shared projection invariant (a null projection drops
// the segment), and that a wrap-length span is rejected.
import { describe, expect, it } from "vitest";
import type { Complex, SigmaLevelCurves } from "@cas/schwarz";
import { drawSchwarzLevelCurves } from "../src/render/schwarzLevelCurveOverlay";
import { type SchwarzView } from "../src/render/schwarzView";

function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: Array<{ m: string; a: unknown[] }> } {
  const calls: Array<{ m: string; a: unknown[] }> = [];
  const rec =
    (m: string) =>
    (...a: unknown[]): void => {
      calls.push({ m, a });
    };
  const ctx = {
    save: rec("save"),
    restore: rec("restore"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    setLineDash: rec("setLineDash"),
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const count = (calls: Array<{ m: string }>, m: string): number => calls.filter((c) => c.m === m).length;
const view: SchwarzView = { center: [0, 0], zoom: 0.2 };
const size = 512;

// Two short magnitude segments near the origin + one short phase segment — all on-canvas at this window.
const curves: SigmaLevelCurves = {
  magnitude: [
    { a: [0, 0], b: [0.1, 0] },
    { a: [0.1, 0], b: [0.1, 0.1] },
  ],
  phase: [{ a: [0, 0], b: [0, 0.1] }],
  magnitudeLevels: [1],
};

describe("drawSchwarzLevelCurves (F4b — the level-curve painter)", () => {
  it("strokes one segment per line: 2 magnitude + 1 phase = 3 moveTo/lineTo pairs", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzLevelCurves(ctx, curves, view, size);
    expect(count(calls, "moveTo")).toBe(3);
    expect(count(calls, "lineTo")).toBe(3);
  });

  it("draws the phase layer dashed and the magnitude layer solid (two setLineDash calls)", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzLevelCurves(ctx, curves, view, size);
    const dashes = calls.filter((c) => c.m === "setLineDash").map((c) => (c.a[0] as number[]).length);
    expect(dashes).toContain(2); // phase: [3,3]
    expect(dashes).toContain(0); // magnitude: [] (solid)
  });

  it("drops a segment whose endpoint projection is null (ψ off the uniformizing disk)", () => {
    const nullAtOrigin = (w: Complex): Complex | null => (w[0] === 0 && w[1] === 0 ? null : w);
    const { ctx, calls } = recordingCtx();
    drawSchwarzLevelCurves(ctx, curves, view, size, { toPlot: nullAtOrigin });
    // The two origin-touching segments (magnitude #1 and the phase line) drop; magnitude #2 survives.
    expect(count(calls, "moveTo")).toBe(1);
  });

  it("prefers toPixel (sphere) and drops the segment on a fully-occluded ball", () => {
    const shown = recordingCtx();
    drawSchwarzLevelCurves(shown.ctx, curves, view, size, { toPixel: () => [100, 100] });
    // All endpoints collapse to one pixel → zero span → drawn (3 segments).
    expect(count(shown.calls, "moveTo")).toBe(3);
    const hidden = recordingCtx();
    drawSchwarzLevelCurves(hidden.ctx, curves, view, size, { toPixel: () => null });
    expect(count(hidden.calls, "moveTo")).toBe(0);
  });

  it("rejects a wrap-length span (an endpoint flung across the canvas)", () => {
    // Project the second endpoint of each segment far away → every span exceeds the wrap threshold.
    let flip = false;
    const wrap = (): [number, number] | null => {
      flip = !flip;
      return flip ? [256, 256] : [500, 10]; // alternate near/far → each segment spans ~canvas width
    };
    const { ctx, calls } = recordingCtx();
    drawSchwarzLevelCurves(ctx, curves, view, size, { toPixel: wrap });
    expect(count(calls, "moveTo")).toBe(0);
  });

  it("no-ops for empty curves", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzLevelCurves(ctx, { magnitude: [], phase: [], magnitudeLevels: [] }, view, size);
    expect(count(calls, "stroke")).toBe(0);
  });
});
