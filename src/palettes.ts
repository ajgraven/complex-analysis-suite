/**
 * Gradient model for custom colouring. A list of colour stops is interpolated into
 * a 256×1 RGBA ramp and uploaded as the `uGradient` texture, sampled by the shader
 * when the "Custom gradient" palette (uPalette == 4) is selected. The built-in
 * palettes (classic/viridis/magma/grayscale) stay in the shader; this powers the
 * user-editable gradient and recolours without recompiling.
 */

/** A colour stop: position `t` in [0,1] and an RGB colour with channels in 0..255. */
export type GradientStop = { t: number; color: [number, number, number] };

/** A vivid default gradient (deep blue → cyan → pale yellow → orange → dark red). */
export const DEFAULT_GRADIENT: GradientStop[] = [
  { t: 0.0, color: [8, 12, 80] },
  { t: 0.25, color: [32, 140, 200] },
  { t: 0.5, color: [240, 240, 150] },
  { t: 0.75, color: [220, 90, 30] },
  { t: 1.0, color: [120, 10, 40] },
];

/**
 * Linear-interpolate colour stops into a `width`×1 RGBA8 ramp (opaque). Stops are
 * sorted by `t`; samples before the first / after the last stop clamp to its colour.
 */
export function buildGradient(stops: GradientStop[], width = 256): Uint8Array {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const out = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    let color: [number, number, number];
    if (t <= first.t) {
      color = first.color;
    } else if (t >= last.t) {
      color = last.color;
    } else {
      let lo = first;
      let hi = last;
      for (let k = 0; k < sorted.length - 1; k++) {
        if (t >= sorted[k].t && t <= sorted[k + 1].t) {
          lo = sorted[k];
          hi = sorted[k + 1];
          break;
        }
      }
      const span = hi.t - lo.t;
      const f = span > 1e-6 ? (t - lo.t) / span : 0;
      color = [
        lo.color[0] + (hi.color[0] - lo.color[0]) * f,
        lo.color[1] + (hi.color[1] - lo.color[1]) * f,
        lo.color[2] + (hi.color[2] - lo.color[2]) * f,
      ];
    }
    out[i * 4] = Math.round(color[0]);
    out[i * 4 + 1] = Math.round(color[1]);
    out[i * 4 + 2] = Math.round(color[2]);
    out[i * 4 + 3] = 255;
  }
  return out;
}
