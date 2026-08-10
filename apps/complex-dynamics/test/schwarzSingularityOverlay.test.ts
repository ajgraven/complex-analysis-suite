// schwarzSingularityOverlay.test.ts — the σ-singularity markers (F4h). Branch points draw as rings (arc),
// σ-poles as ×'s (moveTo/lineTo); a recording mock ctx captures the calls. Also pins the shared projection
// invariant that a null projection drops the marker.
import { describe, expect, it } from "vitest";
import type { Complex, SigmaSingularities } from "@cas/schwarz";
import { drawSchwarzSingularities } from "../src/render/schwarzSingularityOverlay";
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
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    arc: rec("arc"),
    stroke: rec("stroke"),
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set lineJoin(_v: string) {},
    set lineCap(_v: string) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const count = (calls: Array<{ m: string }>, m: string): number => calls.filter((c) => c.m === m).length;

const SING: SigmaSingularities = {
  branchPoints: [
    { w: [1, 0], z: [1, 0] },
    { w: [0, 1], z: [0, 1] },
  ],
  poles: [{ w: [-1, 0], order: 1, label: "a₁" }],
};
const view: SchwarzView = { center: [0, 0], zoom: 0.2 };
const size = 512;

describe("drawSchwarzSingularities (F4h)", () => {
  it("draws a ring per branch point and a × per pole (plane identity projection)", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzSingularities(ctx, SING, view, size);
    expect(count(calls, "arc")).toBe(2); // two branch-point rings
    expect(count(calls, "moveTo")).toBe(4); // the one × = two cross() calls × two moveTo each
    expect(count(calls, "lineTo")).toBe(4);
  });

  it("drops a marker whose projection is null (ψ off the disk)", () => {
    const nullBranch = (w: Complex): Complex | null => (w[0] === 1 && w[1] === 0 ? null : w);
    const { ctx, calls } = recordingCtx();
    drawSchwarzSingularities(ctx, SING, view, size, { toPlot: nullBranch });
    expect(count(calls, "arc")).toBe(1); // the [1,0] branch point vanished; the [0,1] one remains
  });

  it("uses toPixel (sphere) in preference; a fully-occluded ball draws nothing", () => {
    const shown = recordingCtx();
    drawSchwarzSingularities(shown.ctx, SING, view, size, { toPixel: () => [100, 100] });
    expect(count(shown.calls, "arc")).toBe(2);
    const hidden = recordingCtx();
    drawSchwarzSingularities(hidden.ctx, SING, view, size, { toPixel: () => null });
    expect(count(hidden.calls, "arc")).toBe(0);
    expect(count(hidden.calls, "moveTo")).toBe(0);
  });

  it("is a no-op for an empty result", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzSingularities(ctx, { branchPoints: [], poles: [] }, view, size);
    expect(count(calls, "arc")).toBe(0);
    expect(count(calls, "moveTo")).toBe(0);
  });
});
