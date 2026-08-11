// schwarzForwardCurveOverlay.ts — draw a user-drawn polyline and its forward σ-images (F4f). iterateCurveForward
// (@cas/schwarz) returns [curve₀ (the drawn seed), σ(curve₀), σ²(curve₀), …]; this strokes each as a polyline —
// the seed bright white, each successive image hue-ramped (warm → cool) — with the standard σ-overlay
// projection (w-plane direct · z-disk ψ-pullback · sphere ball), so the family lives in all three views. A
// vertex that fails to project breaks the polyline there. σ is a numerical reconstruction, so the images are `≈`.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import type { Complex } from "@cas/schwarz";

/** Per-view projection (parity with the orbit / cycle / level-curve overlays). */
export interface SchwarzForwardStyle {
  toPlot?: (w: Complex) => Complex | null;
  toPixel?: (w: Complex) => [number, number] | null;
}

const SEED_COLOR = "#ffffff"; // the drawn curve (iteration 0) — bright white

/** Hue for forward image i (1…n−1): a warm → cool ramp so each iteration is distinguishable. */
export function forwardImageHue(i: number, n: number): string {
  const t = n > 2 ? (i - 1) / (n - 2) : 0;
  return `hsl(${Math.round(20 + 280 * t)}, 85%, 62%)`;
}

/**
 * Stroke the forward-curve family `curves` (from iterateCurveForward) onto `ctx` (a size×size 2D context
 * showing the σ field for `view`). Each curve is a polyline; the seed is white + slightly bolder, the images
 * hue-ramped. A vertex that fails to project breaks the line (a fresh moveTo resumes it). No-op for no curves.
 */
export function drawSchwarzForwardCurves(
  ctx: CanvasRenderingContext2D,
  curves: readonly Complex[][],
  view: SchwarzView,
  size: number,
  style: SchwarzForwardStyle = {},
): void {
  if (curves.length === 0) return;
  const toPlot = style.toPlot;
  const toPixel = style.toPixel;
  const project = (w: Complex): [number, number] | null => {
    if (toPixel) return toPixel(w);
    const q = toPlot ? toPlot(w) : w;
    return q ? plotToPixel(view, q, size) : null;
  };

  for (let i = 0; i < curves.length; i++) {
    const pts = curves[i];
    if (pts.length === 0) continue;
    ctx.save();
    ctx.strokeStyle = i === 0 ? SEED_COLOR : forwardImageHue(i, curves.length);
    ctx.lineWidth = i === 0 ? 2 : 1.4;
    ctx.globalAlpha = i === 0 ? 0.95 : 0.85;
    ctx.beginPath();
    let started = false;
    for (const w of pts) {
      const p = project(w);
      if (!p) {
        started = false; // an unmappable vertex breaks the polyline
        continue;
      }
      if (started) ctx.lineTo(p[0], p[1]);
      else {
        ctx.moveTo(p[0], p[1]);
        started = true;
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}
