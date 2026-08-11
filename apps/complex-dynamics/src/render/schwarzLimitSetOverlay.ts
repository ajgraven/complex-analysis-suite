// schwarzLimitSetOverlay.ts — draw the σ limit-set chaos-game cloud over the σ field (F4a). `sampleLimitSet`
// (@cas/schwarz) returns an interleaved Float64Array of points densely sampling the limit set — the fractal
// the tiling converges to, ≈ the field's non-escaping (black) set. This paints them as a bright translucent
// dust so overlapping samples build density, highlighting WHERE the limit set lies. σ⁻¹ is a numerical
// reconstruction, so the cloud is `≈`.
//
// Projection mirrors the σ-orbit / tiling overlays EXACTLY: the w-plane maps with plotToPixel; the z-disk
// pulls each point back through ψ = φ⁻¹ (`toPlot`, null off the uniformizing domain); the sphere projects to
// the ball (`toPixel`, null on the occluded far cap). A point that fails to map is simply skipped.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import type { Complex } from "@cas/schwarz";

const LIMIT_COLOR = "#c8fbff"; // a bright near-white cyan — reads as fractal "dust" over the dark non-escaping set

/** Per-view projection (parity with the orbit / tiling overlays): `toPixel` (sphere) takes precedence, null
 *  on the occluded cap; else `toPlot` (z-disk ψ-pullback, null off the disk) then plotToPixel; omit both for
 *  the w-plane. */
export interface SchwarzLimitStyle {
  toPlot?: (w: Complex) => Complex | null;
  toPixel?: (w: Complex) => [number, number] | null;
}

/**
 * Stroke the limit-set `cloud` (interleaved [re, im, …] from sampleLimitSet) onto `ctx` (a size×size 2D
 * context showing the σ field for `view`). Each sample is a ~1px translucent dot, so density accumulates
 * where the set folds. Off-canvas / unmappable samples are skipped. No-op for an empty cloud.
 */
export function drawSchwarzLimitSet(
  ctx: CanvasRenderingContext2D,
  cloud: Float64Array,
  view: SchwarzView,
  size: number,
  style: SchwarzLimitStyle = {},
): void {
  const n = cloud.length >> 1; // 2 floats per point
  if (n === 0) return;
  const toPlot = style.toPlot;
  const toPixel = style.toPixel;
  const project = (w: Complex): [number, number] | null => {
    if (toPixel) return toPixel(w);
    const q = toPlot ? toPlot(w) : w;
    return q ? plotToPixel(view, q, size) : null;
  };

  ctx.save();
  ctx.fillStyle = LIMIT_COLOR;
  ctx.globalAlpha = 0.6; // overlapping dots build density; the fractal reads brighter where it is dense
  for (let i = 0; i < n; i++) {
    const pt = project([cloud[2 * i], cloud[2 * i + 1]]);
    if (!pt) continue;
    const [x, y] = pt;
    if (x < 0 || x > size || y < 0 || y > size) continue;
    ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); // a small dot; fillRect keeps a 10k-point cloud cheap
  }
  ctx.restore();
}
