// schwarzLevelCurveOverlay.ts — draw the σ level curves over the field (F4b). computeSigmaLevelCurves
// (@cas/schwarz) returns w-space segments: |σ| = const (MAGNITUDE, solid) + arg σ ≡ const (PHASE, dashed).
// This strokes them with the standard σ-overlay projection — the w-plane maps directly; the z-disk pulls each
// endpoint back through ψ = φ⁻¹ (`toPlot`, null off the uniformizing domain); the sphere projects to the ball
// (`toPixel`, null on the occluded far cap). A segment with an unmappable endpoint is dropped; so is one whose
// projected endpoints span an implausible jump (a sphere-wrap / ψ-pole artifact). σ is a numerical
// reconstruction, so the curves are `≈`.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import type { Complex, LevelSegment, SigmaLevelCurves } from "@cas/schwarz";

const MAG_COLOR = "#dfe9ff"; // cool near-white — iso-magnitude |σ| (solid)
const ARG_COLOR = "#ffcf8f"; // warm amber — iso-phase arg σ (dashed)

/** Per-view projection (parity with the orbit / tiling / limit-set overlays): `toPixel` (sphere) takes
 *  precedence, null on the occluded cap; else `toPlot` (z-disk ψ-pullback, null off the disk) then
 *  plotToPixel; omit both for the w-plane. */
export interface SchwarzLevelStyle {
  toPlot?: (w: Complex) => Complex | null;
  toPixel?: (w: Complex) => [number, number] | null;
}

/**
 * Stroke the σ level `curves` (w-space segments from computeSigmaLevelCurves) onto `ctx` (a size×size 2D
 * context showing the σ field for `view`). Magnitude lines are solid, phase lines dashed; each segment is
 * projected per view, and dropped if an endpoint is unmappable or the projected span is implausibly long
 * (a wrap artifact). No-op for empty curves.
 */
export function drawSchwarzLevelCurves(
  ctx: CanvasRenderingContext2D,
  curves: SigmaLevelCurves,
  view: SchwarzView,
  size: number,
  style: SchwarzLevelStyle = {},
): void {
  if (curves.magnitude.length === 0 && curves.phase.length === 0) return;
  const toPlot = style.toPlot;
  const toPixel = style.toPixel;
  const project = (w: Complex): [number, number] | null => {
    if (toPixel) return toPixel(w);
    const q = toPlot ? toPlot(w) : w;
    return q ? plotToPixel(view, q, size) : null;
  };
  const maxSpan = size * 0.12; // a legitimate grid segment is a few pixels; a wrap jumps across the canvas

  const strokeLayer = (segs: readonly LevelSegment[], color: string, dash: number[]): void => {
    if (segs.length === 0) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.75;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (const s of segs) {
      const a = project(s.a);
      const b = project(s.b);
      if (!a || !b) continue;
      if (Math.abs(a[0] - b[0]) > maxSpan || Math.abs(a[1] - b[1]) > maxSpan) continue; // wrap artifact
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.restore();
  };

  strokeLayer(curves.phase, ARG_COLOR, [3, 3]); // dashed phase first (under the magnitude lines)
  strokeLayer(curves.magnitude, MAG_COLOR, []); // solid magnitude on top
}
