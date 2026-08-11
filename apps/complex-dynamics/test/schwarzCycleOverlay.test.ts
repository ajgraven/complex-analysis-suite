// schwarzCycleOverlay.test.ts — the σ cycle painter (F4d). It strokes each cycle's closed loop + an arc marker
// per point; a recording mock captures the calls. We assert one arc per point, the loop segments for period>1,
// a fixed point (period 1) drawing only its marker, and the shared null-projection drop.
import { describe, expect, it } from "vitest";
import type { Complex, SchwarzCycle } from "@cas/schwarz";
import { drawSchwarzCycles, cycleHue } from "../src/render/schwarzCycleOverlay";
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
    arc: rec("arc"),
    fill: rec("fill"),
    stroke: rec("stroke"),
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
const count = (calls: Array<{ m: string }>, m: string): number => calls.filter((c) => c.m === m).length;
const view: SchwarzView = { center: [0, 0], zoom: 0.2 };
const size = 512;

describe("drawSchwarzCycles (F4d — the cycle painter)", () => {
  it("a period-2 cycle: an arc per point + a closed 2-segment loop", () => {
    const cycles: SchwarzCycle[] = [{ period: 2, points: [[0, 0], [1, 0]] }];
    const { ctx, calls } = recordingCtx();
    drawSchwarzCycles(ctx, cycles, view, size);
    expect(count(calls, "arc")).toBe(2); // one marker per point
    expect(count(calls, "moveTo")).toBe(2); // loop: 0→1 and 1→0 (wrap)
  });

  it("a fixed point (period 1) draws only its marker, no loop", () => {
    const cycles: SchwarzCycle[] = [{ period: 1, points: [[0.5, 0.5]] }];
    const { ctx, calls } = recordingCtx();
    drawSchwarzCycles(ctx, cycles, view, size);
    expect(count(calls, "arc")).toBe(1);
    expect(count(calls, "moveTo")).toBe(0); // no loop for a single point
  });

  it("drops a loop segment (and marker) whose projection is null", () => {
    const nullAtOrigin = (w: Complex): Complex | null => (w[0] === 0 && w[1] === 0 ? null : w);
    const cycles: SchwarzCycle[] = [{ period: 2, points: [[0, 0], [1, 0]] }];
    const { ctx, calls } = recordingCtx();
    drawSchwarzCycles(ctx, cycles, view, size, { toPlot: nullAtOrigin });
    expect(count(calls, "arc")).toBe(1); // the (0,0) marker dropped
    expect(count(calls, "moveTo")).toBe(0); // both loop segments touch (0,0) → dropped
  });

  it("no-ops for no cycles; cycleHue spreads by the golden angle", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzCycles(ctx, [], view, size);
    expect(count(calls, "arc")).toBe(0);
    expect(cycleHue(0)).toBe("hsl(0, 85%, 62%)");
    expect(cycleHue(1)).toBe("hsl(138, 85%, 62%)"); // 137.508 rounded
  });
});
