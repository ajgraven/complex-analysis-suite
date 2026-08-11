// schwarzLimitSetOverlay.test.ts — the σ limit-set cloud painter (F4a). It fillRects one dot per sample onto
// a 2D context, so a recording mock ctx captures the calls; we assert one fillRect per on-canvas sample, and
// the shared projection invariant that a null projection (ψ off the disk / sphere far cap) drops that sample.
import { describe, expect, it } from "vitest";
import type { Complex } from "@cas/schwarz";
import { drawSchwarzLimitSet } from "../src/render/schwarzLimitSetOverlay";
import { type SchwarzView } from "../src/render/schwarzView";

function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: Array<{ m: string; a: number[] }> } {
  const calls: Array<{ m: string; a: number[] }> = [];
  const rec =
    (m: string) =>
    (...a: number[]): void => {
      calls.push({ m, a });
    };
  const ctx = {
    save: rec("save"),
    restore: rec("restore"),
    fillRect: rec("fillRect"),
    set fillStyle(_v: string) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const count = (calls: Array<{ m: string }>, m: string): number => calls.filter((c) => c.m === m).length;

// Four samples, all kept on-canvas by this wide window.
const cloud = new Float64Array([0, 0, 1, 0, -1, 0, 0.5, 0.5]);
const view: SchwarzView = { center: [0, 0], zoom: 0.2 };
const size = 512;

describe("drawSchwarzLimitSet (F4a — the chaos-game cloud)", () => {
  it("fillRects one dot per on-canvas sample (plane identity projection)", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzLimitSet(ctx, cloud, view, size);
    expect(count(calls, "fillRect")).toBe(4);
  });

  it("drops the samples whose projection is null (ψ off the uniformizing disk)", () => {
    const nullOne = (w: Complex): Complex | null => (w[0] === 1 && w[1] === 0 ? null : w);
    const { ctx, calls } = recordingCtx();
    drawSchwarzLimitSet(ctx, cloud, view, size, { toPlot: nullOne });
    expect(count(calls, "fillRect")).toBe(3); // the [1,0] sample vanished
  });

  it("uses toPixel (sphere) in preference; a fully-occluded ball draws nothing", () => {
    const shown = recordingCtx();
    drawSchwarzLimitSet(shown.ctx, cloud, view, size, { toPixel: () => [100, 100] });
    expect(count(shown.calls, "fillRect")).toBe(4);
    const hidden = recordingCtx();
    drawSchwarzLimitSet(hidden.ctx, cloud, view, size, { toPixel: () => null });
    expect(count(hidden.calls, "fillRect")).toBe(0);
  });

  it("skips off-canvas samples (outside the size×size raster)", () => {
    // A tight window around the origin pushes the |w|=1 samples far off-canvas; only the near ones draw.
    const tight: SchwarzView = { center: [0, 0], zoom: 50 };
    const { ctx, calls } = recordingCtx();
    drawSchwarzLimitSet(ctx, cloud, tight, size);
    expect(count(calls, "fillRect")).toBeLessThan(4);
    expect(count(calls, "fillRect")).toBeGreaterThanOrEqual(1); // the origin sample stays centred
  });

  it("is a no-op for an empty cloud", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzLimitSet(ctx, new Float64Array(0), view, size);
    expect(count(calls, "fillRect")).toBe(0);
  });
});
