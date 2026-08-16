// render/coloring.ts — CPU domain coloring (phase portrait) for one panel. Hue encodes arg(g), and a
// log-spaced sawtooth on |g| draws faint modulus contour bands (Wegert-style). Recomputed only on a
// state change (not per frame). This is the M1 renderer; M2 moves it onto the extracted @cas/gpu
// phase-portrait shader for speed and smooth zoom (plan §4, M1.5).
import type { Cx } from "@cas/core";
import type { PlaneMap } from "./plane.js";

export interface ColorOptions {
  /** Background (masked/out-of-domain) color as [r,g,b], 0..255. */
  readonly bg?: readonly [number, number, number];
}

// A branchless HSL→RGB for full-saturation hues (s = 1). h ∈ [0,1), l ∈ [0,1].
function hslToRgb(h: number, l: number): [number, number, number] {
  const a = 1 - Math.abs(2 * l - 1); // chroma at s=1
  const hp = (h % 1) * 6;
  const x = a * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [a, x, 0];
  else if (hp < 2) [r, g, b] = [x, a, 0];
  else if (hp < 3) [r, g, b] = [0, a, x];
  else if (hp < 4) [r, g, b] = [0, x, a];
  else if (hp < 5) [r, g, b] = [x, 0, a];
  else [r, g, b] = [a, 0, x];
  const m = l - a / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** The phase-portrait color of a complex value: hue = arg, lightness banded by log₂|·|. */
export function phaseColor(v: Cx): [number, number, number] {
  const arg = Math.atan2(v.im, v.re); // −π..π
  const hue = (arg / (2 * Math.PI) + 1) % 1; // 0..1
  const mag = Math.hypot(v.re, v.im);
  let l = 0.5;
  if (mag > 0 && Number.isFinite(mag)) {
    const t = Math.log2(mag);
    const frac = t - Math.floor(t); // sawtooth 0..1 across each octave
    l = 0.42 + 0.16 * frac; // brighten toward the top of each octave → contour bands
  } else if (!Number.isFinite(mag)) {
    l = 0.5;
  }
  return hslToRgb(hue, l);
}

/**
 * Fill `ctx` with the phase portrait of `g` over the panel. `g(w)` returns the complex value at world
 * point `w`, or `null` when `w` is outside the panel's domain (e.g. outside the unit disk) — those
 * pixels get the background color, so the domain's shape reads at a glance.
 */
export function fillPhasePortrait(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  g: (w: readonly [number, number]) => Cx | null,
  opts: ColorOptions = {},
): void {
  const { widthPx, heightPx } = map;
  if (widthPx <= 0 || heightPx <= 0) return;
  const bg = opts.bg ?? [22, 24, 30];
  const img = ctx.createImageData(widthPx, heightPx);
  const data = img.data;
  for (let py = 0; py < heightPx; py++) {
    for (let px = 0; px < widthPx; px++) {
      const w = map.toWorld(px, py);
      const val = g(w);
      const idx = 4 * (py * widthPx + px);
      if (val === null || !Number.isFinite(val.re) || !Number.isFinite(val.im)) {
        data[idx] = bg[0];
        data[idx + 1] = bg[1];
        data[idx + 2] = bg[2];
        data[idx + 3] = 255;
      } else {
        const [r, g2, b] = phaseColor(val);
        data[idx] = r;
        data[idx + 1] = g2;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
