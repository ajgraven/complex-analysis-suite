// schwarzOverlay.test.ts — the σ overlay draw helpers (F1 boundary, F2c z-disk). These stroke onto a 2D
// canvas context, so a recording mock ctx captures the path calls; we assert the geometry (unit-circle arc)
// and the F2c invariant that a null ψ-pullback BREAKS the orbit polyline instead of connecting across it.
import { describe, expect, it } from "vitest";
import type { Complex } from "@cas/schwarz";
import { drawSchwarzUnitCircle } from "../src/render/schwarzBoundaryOverlay";
import { drawSchwarzOrbit } from "../src/render/schwarzOrbitOverlay";
import { plotToPixel, type SchwarzOrbit, type SchwarzView } from "../src/render/schwarzView";

/** A CanvasRenderingContext2D stand-in that records the path-building calls (method name + args). Property
 *  sets (strokeStyle/lineWidth/…) are accepted and ignored — only the geometry matters here. */
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
    closePath: rec("closePath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    arc: rec("arc"),
    stroke: rec("stroke"),
    fill: rec("fill"),
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set lineJoin(_v: string) {},
    set lineCap(_v: string) {},
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const count = (calls: Array<{ m: string }>, m: string): number => calls.filter((c) => c.m === m).length;

describe("drawSchwarzUnitCircle (F2c — the z-disk image of ∂Ω)", () => {
  it("strokes an arc at z=0's pixel with radius = size·zoom/2 (plotToPixel's uniform scale)", () => {
    const view: SchwarzView = { center: [0, 0], zoom: 0.6 };
    const size = 512;
    const { ctx, calls } = recordingCtx();
    drawSchwarzUnitCircle(ctx, view, size);
    const arcs = calls.filter((c) => c.m === "arc");
    expect(arcs).toHaveLength(1);
    const [cx, cy] = plotToPixel(view, [0, 0], size);
    expect(arcs[0].a[0]).toBeCloseTo(cx, 6);
    expect(arcs[0].a[1]).toBeCloseTo(cy, 6);
    expect(arcs[0].a[2]).toBeCloseTo((size * view.zoom) / 2, 6); // |z| = 1 radius in pixels
    // A full circle (0 → 2π), stroked casing-under-colour like the boundary overlay.
    expect(arcs[0].a[3]).toBeCloseTo(0, 6);
    expect(arcs[0].a[4]).toBeCloseTo(2 * Math.PI, 6);
    expect(count(calls, "stroke")).toBe(2);
  });

  it("is a no-op for a degenerate (zero-radius) window", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzUnitCircle(ctx, { center: [0, 0], zoom: 0 }, 512);
    expect(count(calls, "arc")).toBe(0);
    expect(count(calls, "stroke")).toBe(0);
  });
});

describe("drawSchwarzOrbit toPlot pullback (F2c — ψ into the z-disk)", () => {
  // A 3-iterate orbit kept fully on-canvas by this window, so every mapped point would draw a dot.
  const view: SchwarzView = { center: [3, 0], zoom: 0.2 };
  const size = 512;
  const orbit: SchwarzOrbit = { kind: "escaped", n: 2, points: [[2, 0], [3, 0], [4, 0]] };

  it("with no pullback draws one connected polyline (identity — unchanged plane behaviour)", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzOrbit(ctx, orbit, view, size);
    expect(count(calls, "moveTo")).toBe(1); // one subpath: w₀ → w₁ → w₂
    expect(count(calls, "lineTo")).toBe(2);
  });

  it("BREAKS the polyline at an iterate whose pullback is null (in K / off the branch)", () => {
    const nullMiddle = (w: Complex): Complex | null => (w[0] === 3 ? null : w); // w₁ has no z-preimage
    const { ctx, calls } = recordingCtx();
    drawSchwarzOrbit(ctx, orbit, view, size, { toPlot: nullMiddle });
    // The pen lifts at the null, so the surviving points w₀ and w₂ each start a fresh subpath — two moveTo,
    // and crucially NO lineTo bridging across the gap.
    expect(count(calls, "moveTo")).toBe(2);
    expect(count(calls, "lineTo")).toBe(0);
  });

  it("drops the dot at the unmapped iterate (fewer fills than the identity draw)", () => {
    const nullMiddle = (w: Complex): Complex | null => (w[0] === 3 ? null : w);
    const full = recordingCtx();
    drawSchwarzOrbit(full.ctx, orbit, view, size);
    const broken = recordingCtx();
    drawSchwarzOrbit(broken.ctx, orbit, view, size, { toPlot: nullMiddle });
    // Each iterate dot is one fill (inner disc); the null iterate contributes none.
    expect(count(broken.calls, "fill")).toBeLessThan(count(full.calls, "fill"));
  });

  it("draws nothing structural when the seed itself has no preimage (all pullbacks null)", () => {
    const allNull = (): Complex | null => null;
    const { ctx, calls } = recordingCtx();
    drawSchwarzOrbit(ctx, orbit, view, size, { toPlot: allNull });
    expect(count(calls, "moveTo")).toBe(0); // no polyline subpaths
    expect(count(calls, "lineTo")).toBe(0);
    expect(count(calls, "arc")).toBe(0); // no dots, no seed ring/marker
  });
});
