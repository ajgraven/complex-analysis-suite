import { describe, it, expect } from "vitest";
import { drawDirectionTicks, type Vec2 } from "../src/canvasOverlay.js";

/**
 * A minimal recording CanvasRenderingContext2D stand-in: the helper only uses save/restore/translate/rotate,
 * the path builders, stroke/fill, and a handful of style setters. We count `fill()` calls (one per drawn
 * arrowhead) and capture translate targets to check placement, without needing a real canvas.
 */
function mockCtx() {
  const calls = { fill: 0, stroke: 0, save: 0, restore: 0 };
  const translates: [number, number][] = [];
  const ctx = {
    save: () => calls.save++,
    restore: () => calls.restore++,
    translate: (x: number, y: number) => translates.push([x, y]),
    rotate: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => calls.stroke++,
    fill: () => calls.fill++,
    lineJoin: "",
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, translates };
}

const identity = (w: Vec2): [number, number] => [w[0], w[1]];

describe("drawDirectionTicks", () => {
  it("draws exactly `count` arrowheads (each a halo stroke + a fill)", () => {
    const { ctx, calls } = mockCtx();
    const square: Vec2[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    drawDirectionTicks(ctx, identity, square, { closed: true, count: 4, fill: "#fff", halo: "#000" });
    expect(calls.fill).toBe(4);
    expect(calls.stroke).toBe(4); // halo outline per head
    expect(calls.save).toBe(calls.restore); // balanced
  });

  it("skips segments whose endpoints project to non-finite pixels", () => {
    const { ctx, calls } = mockCtx();
    const pts: Vec2[] = [
      [0, 0],
      [Number.POSITIVE_INFINITY, 0],
      [10, 10],
    ];
    // index mode, 2 arrows: one segment touches the infinite point and must be skipped.
    drawDirectionTicks(ctx, identity, pts, { closed: false, count: 2, fill: "#fff", halo: "#000" });
    expect(calls.fill).toBeLessThan(2);
  });

  it("returns without drawing for a degenerate (single-point) path", () => {
    const { ctx, calls } = mockCtx();
    drawDirectionTicks(ctx, identity, [[1, 1]], { count: 3, fill: "#fff", halo: "#000" });
    expect(calls.fill).toBe(0);
  });

  it("arc-length mode spaces arrows evenly along a non-uniformly-sampled line", () => {
    const { ctx, translates } = mockCtx();
    // Points bunched near the start, sparse after — index spacing would clump; arc-length must spread out.
    const line: Vec2[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [100, 0],
    ];
    drawDirectionTicks(ctx, identity, line, {
      closed: false,
      count: 2,
      fill: "#fff",
      halo: "#000",
      byArcLength: true,
    });
    expect(translates.length).toBe(2);
    // Total length 100; arrows target ~25% and ~75% → both land in the long final segment (x between 3 and 100).
    for (const [x] of translates) expect(x).toBeGreaterThan(3);
  });

  it("honours a non-identity toPx mapping", () => {
    const { ctx, translates } = mockCtx();
    const seg: Vec2[] = [
      [0, 0],
      [10, 0],
    ];
    drawDirectionTicks(ctx, (w) => [w[0] * 2 + 5, w[1] * 2 + 5], seg, {
      count: 1,
      fill: "#fff",
      halo: "#000",
    });
    // Single arrow at the segment midpoint: world midpoint (5,0) → px (15,5).
    expect(translates.length).toBe(1);
    expect(translates[0][0]).toBeCloseTo(15, 6);
    expect(translates[0][1]).toBeCloseTo(5, 6);
  });
});
