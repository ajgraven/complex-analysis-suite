// schwarzForwardCurveOverlay.test.ts — the σ forward-curve painter (F4f). It strokes each curve (the drawn
// seed + its σ-images) as a polyline; a recording mock captures the calls. We assert one moveTo per curve
// start + a lineTo per subsequent vertex, that an unmappable vertex breaks the polyline, and the hue ramp.
import { describe, expect, it } from "vitest";
import type { Complex } from "@cas/schwarz";
import { drawSchwarzForwardCurves, forwardImageHue } from "../src/render/schwarzForwardCurveOverlay";
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
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
const count = (calls: Array<{ m: string }>, m: string): number => calls.filter((c) => c.m === m).length;
const view: SchwarzView = { center: [0, 0], zoom: 0.2 };
const size = 512;

describe("drawSchwarzForwardCurves (F4f — the forward-curve painter)", () => {
  it("strokes each curve as a polyline: a moveTo per curve, a lineTo per subsequent vertex", () => {
    const curves: Complex[][] = [
      [[0, 0], [0.1, 0], [0.2, 0]], // seed, 3 vertices
      [[0, 0.1], [0.1, 0.1]], // σ-image, 2 vertices
    ];
    const { ctx, calls } = recordingCtx();
    drawSchwarzForwardCurves(ctx, curves, view, size);
    expect(count(calls, "moveTo")).toBe(2); // one per curve
    expect(count(calls, "lineTo")).toBe(3); // (3−1) + (2−1)
  });

  it("breaks the polyline at an unmappable vertex (a fresh moveTo resumes it)", () => {
    const nullMiddle = (w: Complex): Complex | null => (w[0] === 0.1 && w[1] === 0 ? null : w);
    const curves: Complex[][] = [[[0, 0], [0.1, 0], [0.2, 0]]];
    const { ctx, calls } = recordingCtx();
    drawSchwarzForwardCurves(ctx, curves, view, size, { toPlot: nullMiddle });
    expect(count(calls, "moveTo")).toBe(2); // (0,0) then (after the break) (0.2,0)
    expect(count(calls, "lineTo")).toBe(0); // the break severed both potential segments
  });

  it("no-ops for no curves; forwardImageHue ramps warm → cool over the images", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzForwardCurves(ctx, [], view, size);
    expect(count(calls, "stroke")).toBe(0);
    expect(forwardImageHue(1, 3)).toBe("hsl(20, 85%, 62%)"); // first image — warm
    expect(forwardImageHue(2, 3)).toBe("hsl(300, 85%, 62%)"); // last image — cool
  });
});
