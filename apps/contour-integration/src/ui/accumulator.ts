// The accumulator panel: the partial sum walking in its own plane.
//
// Two linked planes, never a 3-D surface (research 02, P0 #4) — the Stage shows where `z` is, this
// shows where the sum has got to. The trail is a head-to-tail vector walk of `f(zₖ)·Δzₖ`, so the
// *shape* of the walk is the answer taking form: a closed contour around a simple pole spirals out
// to `2πi` and stops there.
//
// The three contrast trails are the sums students revert to under coordination load. They are drawn
// faintly, on the same axes, and `Σ Δz` closing to the origin on a closed contour is the cheapest
// striking thing in the whole app.
import type { Cx } from "../kernel/geom.js";
import type { Accumulation } from "../engine/contour/accumulate.js";
import { PIECE_COLOURS } from "./stage/ink.js";

export type ContrastMode = "none" | "sumZ" | "sumFz" | "sumDz";

export const CONTRAST_LABELS: Record<ContrastMode, string> = {
  none: "none",
  sumZ: "Σ z",
  sumFz: "Σ f(z)",
  sumDz: "Σ Δz",
};

export interface AccumulatorOptions {
  readonly upTo: number;
  readonly contrast: ContrastMode;
  readonly pieceColours: readonly number[];
}

interface Frame {
  readonly toX: (re: number) => number;
  readonly toY: (im: number) => number;
}

function frameFor(points: readonly Cx[], w: number, h: number): Frame {
  let max = 1e-9;
  for (const p of points) max = Math.max(max, Math.abs(p[0]), Math.abs(p[1]));
  const pad = 18;
  const scale = Math.min((w - 2 * pad) / (2 * max), (h - 2 * pad) / (2 * max));
  return {
    toX: (re) => w / 2 + re * scale,
    toY: (im) => h / 2 - im * scale,
  };
}

function polyline(ctx: CanvasRenderingContext2D, pts: readonly Cx[], f: Frame): void {
  ctx.beginPath();
  ctx.moveTo(f.toX(0), f.toY(0));
  for (const p of pts) ctx.lineTo(f.toX(p[0]), f.toY(p[1]));
}

export function drawAccumulator(
  ctx: CanvasRenderingContext2D,
  acc: Accumulation,
  w: number,
  h: number,
  opts: AccumulatorOptions,
): void {
  ctx.clearRect(0, 0, w, h);
  if (acc.steps.length === 0) return;

  const count = Math.max(1, Math.round(opts.upTo * acc.steps.length));
  const shown = acc.steps.slice(0, count);
  const contrast =
    opts.contrast === "none" ? [] : acc.contrasts[opts.contrast].slice(0, count);

  // One frame for everything on screen, so the contrast trail is drawn to the same scale as the
  // real one. Comparing two walks at different scales would be a lie by presentation.
  const frame = frameFor([...acc.steps.map((s) => s.running), ...contrast], w, h);

  // Axes.
  ctx.strokeStyle = "rgba(231, 233, 238, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, frame.toY(0));
  ctx.lineTo(w, frame.toY(0));
  ctx.moveTo(frame.toX(0), 0);
  ctx.lineTo(frame.toX(0), h);
  ctx.stroke();

  if (contrast.length > 0) {
    polyline(ctx, contrast, frame);
    ctx.strokeStyle = "rgba(231, 233, 238, 0.42)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.setLineDash([]);

    const end = contrast[contrast.length - 1];
    ctx.beginPath();
    ctx.arc(frame.toX(end[0]), frame.toY(end[1]), 3, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(231, 233, 238, 0.6)";
    ctx.fill();
  }

  // The real trail, in per-piece colour so a segment of the walk can be traced back to the arc that
  // produced it — one of the three linked representations (arc ↔ term ↔ accumulator segment).
  ctx.lineWidth = 2;
  let from: Cx = [0, 0];
  for (const step of shown) {
    ctx.beginPath();
    ctx.moveTo(frame.toX(from[0]), frame.toY(from[1]));
    ctx.lineTo(frame.toX(step.running[0]), frame.toY(step.running[1]));
    ctx.strokeStyle = PIECE_COLOURS[(opts.pieceColours[step.piece] ?? step.piece) % PIECE_COLOURS.length];
    ctx.stroke();
    from = step.running;
  }

  // Where the sum has got to.
  ctx.beginPath();
  ctx.arc(frame.toX(from[0]), frame.toY(from[1]), 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(8, 10, 14, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
}
