// schwarzTreeOverlay.test.ts — the σ⁻¹ preimage-tiling tree painter (F3c). Like the σ orbit/boundary
// overlays it strokes onto a 2D context, so a recording mock ctx captures the path calls; we assert that
// edges become moveTo→lineTo segments, that nodes are drawn, and — the load-bearing F2c/F2d invariant — that
// a null projection (ψ-pullback off the disk / sphere far cap) DROPS the node and every edge touching it.
import { describe, expect, it } from "vitest";
import type { Complex, PreimageTree } from "@cas/schwarz";
import { drawSchwarzTree } from "../src/render/schwarzTreeOverlay";
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
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const count = (calls: Array<{ m: string }>, m: string): number => calls.filter((c) => c.m === m).length;

// A hand-built 3-generation tree (seed → 2 → 2), edges linking each parent to its child. A wide window keeps
// every node on-canvas so nothing is clipped out of the assertions.
const TREE: PreimageTree = {
  generations: [
    [[0, 0]], // gen 0 — the seed
    [[1, 0], [-1, 0]], // gen 1
    [[2, 0], [-2, 0]], // gen 2
  ],
  edges: [
    { fromGen: 0, fromIdx: 0, toGen: 1, toIdx: 0 },
    { fromGen: 0, fromIdx: 0, toGen: 1, toIdx: 1 },
    { fromGen: 1, fromIdx: 0, toGen: 2, toIdx: 0 },
    { fromGen: 1, fromIdx: 1, toGen: 2, toIdx: 1 },
  ],
  truncatedByBudget: false,
};
const view: SchwarzView = { center: [0, 0], zoom: 0.2 };
const size = 512;

describe("drawSchwarzTree (F3c — the σ⁻¹ tiling overlay)", () => {
  it("strokes one moveTo→lineTo per edge (plane identity projection) and draws the nodes", () => {
    const { ctx, calls } = recordingCtx();
    drawSchwarzTree(ctx, TREE, view, size);
    expect(count(calls, "moveTo")).toBe(TREE.edges.length); // one subpath per edge
    expect(count(calls, "lineTo")).toBe(TREE.edges.length);
    expect(count(calls, "arc")).toBeGreaterThan(0); // node dots + the ringed seed
    expect(count(calls, "fill")).toBeGreaterThan(0);
  });

  it("drops a node and BOTH edges touching it when its projection is null (ψ off the disk)", () => {
    // Null the gen-1 node [1,0]: its incoming edge (seed→it) and outgoing edge (it→its child) both vanish.
    const nullOne = (w: Complex): Complex | null => (w[0] === 1 && w[1] === 0 ? null : w);
    const { ctx, calls } = recordingCtx();
    drawSchwarzTree(ctx, TREE, view, size, { toPlot: nullOne });
    expect(count(calls, "moveTo")).toBe(TREE.edges.length - 2); // two edges dropped
    expect(count(calls, "lineTo")).toBe(TREE.edges.length - 2);
  });

  it("uses toPixel (sphere) in preference, and a fully-occluded ball draws nothing", () => {
    // toPixel maps everything to a fixed pixel ⇒ every edge is drawn (via the sphere path, not plotToPixel).
    const allVisible = (): [number, number] => [100, 100];
    const shown = recordingCtx();
    drawSchwarzTree(shown.ctx, TREE, view, size, { toPixel: allVisible });
    expect(count(shown.calls, "moveTo")).toBe(TREE.edges.length);
    // A null everywhere (whole tree behind the horizon) ⇒ no edges, no node arcs, no seed.
    const hidden = recordingCtx();
    drawSchwarzTree(hidden.ctx, TREE, view, size, { toPixel: () => null });
    expect(count(hidden.calls, "moveTo")).toBe(0);
    expect(count(hidden.calls, "lineTo")).toBe(0);
    expect(count(hidden.calls, "arc")).toBe(0);
  });

  it("is a no-op for an empty tree (no generations)", () => {
    const empty: PreimageTree = { generations: [], edges: [], truncatedByBudget: false };
    const { ctx, calls } = recordingCtx();
    drawSchwarzTree(ctx, empty, view, size);
    expect(count(calls, "moveTo")).toBe(0);
    expect(count(calls, "arc")).toBe(0);
  });

  it("draws the ringed seed for a seed-only tree (depth 0), with no edges", () => {
    const seedOnly: PreimageTree = { generations: [[[0, 0]]], edges: [], truncatedByBudget: false };
    const { ctx, calls } = recordingCtx();
    drawSchwarzTree(ctx, seedOnly, view, size);
    expect(count(calls, "moveTo")).toBe(0); // no edges
    expect(count(calls, "arc")).toBeGreaterThan(0); // the seed marker (fill discs + the ring)
  });
});
