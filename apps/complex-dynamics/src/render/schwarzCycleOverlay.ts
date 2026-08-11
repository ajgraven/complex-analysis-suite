// schwarzCycleOverlay.ts — draw the σ periodic cycles over the field (F4d). findCycles (@cas/schwarz) returns
// cycles { period, points }; this marks each cycle's points and connects them into their closed orbit loop,
// one distinct hue per cycle (golden-angle spread). Reuses the standard σ-overlay projection — the w-plane maps
// directly; the z-disk pulls each point back through ψ = φ⁻¹ (`toPlot`, null off the disk); the sphere projects
// to the ball (`toPixel`, null on the far cap). A point that fails to project is skipped; a loop segment with an
// unmappable end is dropped. The cycle finder is a coarse, numerical search, so the markers are `≈`.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import type { Complex, SchwarzCycle } from "@cas/schwarz";

/** Per-view projection (parity with the orbit / tiling / level-curve overlays). */
export interface SchwarzCycleStyle {
  toPlot?: (w: Complex) => Complex | null;
  toPixel?: (w: Complex) => [number, number] | null;
}

/** A distinct hue per cycle — the golden angle spreads successive cycles maximally around the wheel. */
export function cycleHue(i: number): string {
  return `hsl(${Math.round((i * 137.508) % 360)}, 85%, 62%)`;
}

/**
 * Stroke the periodic `cycles` onto `ctx` (a size×size 2D context showing the σ field for `view`). Each cycle
 * is its closed orbit loop (period > 1) plus a marker at every point, in one hue. No-op for no cycles.
 */
export function drawSchwarzCycles(
  ctx: CanvasRenderingContext2D,
  cycles: readonly SchwarzCycle[],
  view: SchwarzView,
  size: number,
  style: SchwarzCycleStyle = {},
): void {
  if (cycles.length === 0) return;
  const toPlot = style.toPlot;
  const toPixel = style.toPixel;
  const project = (w: Complex): [number, number] | null => {
    if (toPixel) return toPixel(w);
    const q = toPlot ? toPlot(w) : w;
    return q ? plotToPixel(view, q, size) : null;
  };

  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i];
    const color = cycleHue(i);
    const px = c.points.map(project);
    // The closed orbit loop (period > 1): connect consecutive points, wrapping the last back to the first.
    if (c.period > 1) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let k = 0; k < px.length; k++) {
        const a = px[k];
        const b = px[(k + 1) % px.length];
        if (!a || !b) continue;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
      ctx.restore();
    }
    // A filled marker at each point, dark-outlined for contrast against any field colour.
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#0b1020";
    ctx.lineWidth = 1;
    for (const p of px) {
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
