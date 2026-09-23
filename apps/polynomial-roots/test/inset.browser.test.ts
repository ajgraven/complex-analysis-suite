import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import { dragonBounds, dragonPlan, dragonSet, theoremOverlay } from "../src/engine/dragon";
import { drawInset, drawTheorem, inkStats, insetLayout, paintDragon, toCanvas } from "../src/stage/inset";
import { runReference } from "../src/engine/deep/reference";

// The canvas half of the inset. `paintDragon` and `insetLayout` are checked in the node gate; what only
// a browser can say is that the ink reached the bitmap — a canvas call that draws NOTHING (a zero alpha,
// a `putImageData` onto the wrong context, a fill colour that matches the background) leaves every pure
// test passing. Contour Integration M6.3's lesson: assert the primitive, not a number the compositing
// could have produced by itself.

const A = (preset: string) => {
  const r = compileAlphabet({ preset } as never);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};
const LITTLEWOOD = A("littlewood");
const BAEZ = { re: 0.375453, im: 0.544825 };

function frame(size = 200): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d context");
  return { canvas, ctx };
}

const distinct = (ctx: CanvasRenderingContext2D, size: number): number => {
  const d = ctx.getImageData(0, 0, size, size).data;
  const seen = new Set<number>();
  for (let i = 0; i + 3 < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return seen.size;
};

describe("the inset actually draws", () => {
  it("lays down a dragon over the frame, on the background it declares", () => {
    const size = 200;
    const { ctx } = frame(size);
    const plan = dragonPlan(LITTLEWOOD, BAEZ, 0.01);
    const points = dragonSet(LITTLEWOOD, BAEZ, plan.depth);
    const layout = insetLayout(dragonBounds(points), size, size);
    drawInset(ctx, points, layout, false);
    const data = ctx.getImageData(0, 0, size, size).data;
    // The background is opaque and named, so an empty frame is a KNOWN colour rather than transparency
    // that `getImageData` would report as bright un-premultiplied noise (the M5.1 accumulator finding).
    const corner = [data[0], data[1], data[2], data[3]];
    expect(corner).toEqual([0x0b, 0x0d, 0x12, 255]);
    // And the cloud is really there. The strongest form of that available: the frame carries EXACTLY
    // one colour per distinct per-pixel count, plus the background — measured, 16,384 values over 6,179
    // lit pixels with a busiest pixel of 9, so ten colours. A ">" threshold would pass on a flat fill
    // too; this cannot, because nothing but the count ramp produces that number.
    const expected = inkStats(paintDragon(points, layout));
    expect(expected.lit).toBe(6179);
    expect(expected.peak).toBe(9);
    expect(distinct(ctx, size)).toBe(expected.peak + 1);
    let lit = 0;
    for (let i = 0; i + 3 < data.length; i += 4) if (data[i] !== 0x0b || data[i + 1] !== 0x0d) lit++;
    expect(lit).toBeGreaterThan(1500);
  });

  it("marks the ORIGIN, which is the whole reason the inset is beside the stage", () => {
    // Bousch: the lamp is in the limit set exactly when the origin is inside the cloud. A cross nobody
    // draws makes the inset a decoration, so it is asserted at the pixel the layout puts it on.
    const size = 200;
    const plan = dragonPlan(LITTLEWOOD, BAEZ, 0.01);
    const points = dragonSet(LITTLEWOOD, BAEZ, plan.depth);
    const layout = insetLayout(dragonBounds(points), size, size);
    const o = toCanvas(layout, 0, 0);
    const at = (ctx: CanvasRenderingContext2D): number[] => {
      const d = ctx.getImageData(Math.round(o.x) + 4, Math.round(o.y), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const without = frame(size);
    drawInset(without.ctx, points, layout, false);
    const with_ = frame(size);
    drawInset(with_.ctx, points, layout, true);
    expect(at(with_.ctx)).not.toEqual(at(without.ctx));
    // The cross is the origin's colour, not the cloud's.
    const [r, g, b] = at(with_.ctx);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("theorem mode draws BOTH sets, and they land on each other", () => {
    // The picture's claim is that the two clouds coincide. Drawn, that means the actual points (small,
    // warm) sit on top of the predicted ones (large, cool), so almost every actual pixel has a
    // predicted pixel under it — which is checked by drawing the prediction alone and asking whether
    // the actual points fall on lit pixels.
    const run = runReference({
      alphabet: { preset: "littlewood" },
      cx: "0.375453",
      cy: "0.544825",
      halfHeight: 1e-5,
      aspect: 1.55,
      depth: 30,
      precision: "float64",
      budget: 4e6,
    });
    if ("error" in run) throw new Error(run.error);
    const root = run.roots.find((r) => r.degree >= 24);
    if (root === undefined) throw new Error("no prefix of degree ≥ 24");
    const overlay = theoremOverlay(LITTLEWOOD, {
      digits: root.digits,
      alpha: { re: Number(run.cx) + root.dx, im: Number(run.cy) + root.dy },
      extend: 8,
    });
    if ("error" in overlay) throw new Error(overlay.error);

    const size = 200;
    const both = new Float64Array(overlay.predicted.length + overlay.actual.length);
    both.set(overlay.predicted, 0);
    both.set(overlay.actual, overlay.predicted.length);
    const layout = insetLayout(dragonBounds(both), size, size);
    const { ctx } = frame(size);
    drawTheorem(ctx, overlay, layout);
    expect(distinct(ctx, size)).toBeGreaterThan(2); // background + two inks

    // Predicted alone, then ask where the actual points land.
    const predictedOnly = frame(size);
    drawTheorem(predictedOnly.ctx, { ...overlay, actual: new Float64Array(0) }, layout);
    const lit = predictedOnly.ctx.getImageData(0, 0, size, size).data;
    let on = 0;
    let off = 0;
    for (let i = 0; i + 1 < overlay.actual.length; i += 2) {
      const p = toCanvas(layout, overlay.actual[i], overlay.actual[i + 1]);
      const x = Math.min(size - 1, Math.max(0, Math.round(p.x)));
      const y = Math.min(size - 1, Math.max(0, Math.round(p.y)));
      const k = 4 * (y * size + x);
      if (lit[k] !== 0x0b || lit[k + 1] !== 0x0d) on++;
      else off++;
    }
    expect(on + off).toBe(overlay.actual.length / 2);
    expect(on / (on + off)).toBeGreaterThan(0.95);
  });
});
