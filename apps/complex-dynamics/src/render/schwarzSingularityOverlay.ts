// schwarzSingularityOverlay.ts — mark σ's singularities over the σ field (F4h): branch points (zeros of φ′,
// the cusps) as amber rings, σ-poles (bounded family) as red ×'s. Both come from `findSigmaSingularities`
// (@cas/schwarz). Projection mirrors the other σ overlays (plane plotToPixel · z-disk ψ-pullback · sphere
// planeToScreenUv), so the markers live coherently in all three views. σ is a numerical reconstruction, so
// the markers are `≈`.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import type { Complex, SigmaSingularities } from "@cas/schwarz";

const CASING = "rgba(0, 0, 0, 0.72)";
const BRANCH = "#f5c451"; // amber ring — a branch point (φ′ = 0), e.g. a cusp
const POLE = "#ff6b6b"; // red × — a σ-pole (bounded family)

export interface SchwarzSingularityStyle {
  toPlot?: (w: Complex) => Complex | null;
  toPixel?: (w: Complex) => [number, number] | null;
}

/**
 * Stroke `sing` (a findSigmaSingularities result) onto `ctx` (a size×size 2D context showing the σ field for
 * `view`). Branch points draw as amber rings, σ-poles as red ×'s, casing-under-colour so they read over any
 * field. Off-canvas / unmappable markers are skipped. No-op for an empty result.
 */
export function drawSchwarzSingularities(
  ctx: CanvasRenderingContext2D,
  sing: SigmaSingularities,
  view: SchwarzView,
  size: number,
  style: SchwarzSingularityStyle = {},
): void {
  const toPlot = style.toPlot;
  const toPixel = style.toPixel;
  const project = (w: Complex): [number, number] | null => {
    if (toPixel) return toPixel(w);
    const q = toPlot ? toPlot(w) : w;
    return q ? plotToPixel(view, q, size) : null;
  };
  const onCanvas = (x: number, y: number): boolean => x >= 0 && x <= size && y >= 0 && y <= size;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Branch points — amber rings (radius 5).
  for (const bp of sing.branchPoints) {
    const pt = project(bp.w);
    if (!pt || !onCanvas(pt[0], pt[1])) continue;
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], 5, 0, 2 * Math.PI);
    ctx.strokeStyle = CASING;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = BRANCH;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // σ-poles — red ×'s (arm 5), casing under colour.
  for (const p of sing.poles) {
    const pt = project(p.w);
    if (!pt || !onCanvas(pt[0], pt[1])) continue;
    const [x, y] = pt;
    const a = 5;
    const cross = (): void => {
      ctx.beginPath();
      ctx.moveTo(x - a, y - a);
      ctx.lineTo(x + a, y + a);
      ctx.moveTo(x - a, y + a);
      ctx.lineTo(x + a, y - a);
    };
    cross();
    ctx.strokeStyle = CASING;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    cross();
    ctx.strokeStyle = POLE;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
}
