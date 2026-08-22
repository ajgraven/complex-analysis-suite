// render/coloring.ts — CPU domain coloring (phase portrait) for one panel, and the coloring-option
// contract shared with the GPU path. Hue encodes arg; a modulus→lightness transfer and an enhancement
// overlay (modulus rings / phase sectors / conformal grid / polar chessboard / Re-Im grid) match the
// shared @cas/gpu PHASE_COLORING_GLSL (the shaded, non-antialiased branches — CPU has no fwidth). Used
// for the free-form left panel and as the no-WebGL fallback; recomputed only on a state change.
import type { Cx } from "@cas/core";
import type { PlaneMap } from "./plane.js";

/** Coloring controls, mirrored onto the GPU shader uniforms (and applied on the CPU path). */
export interface ColoringOptions {
  /** 0 none, 1 modulus rings, 2 phase sectors, 3 conformal grid, 4 polar chessboard, 5 Re/Im grid. */
  readonly enhance: number;
  /** Sectors per turn / grid density (modes 2–5). */
  readonly sectors: number;
  /** Crisp antialiased lines (GPU only) vs shaded bands. */
  readonly crisp: boolean;
  /** Modulus→lightness: 0 constant, 1 linear, 2 rational, 3 log, 4 log-log. */
  readonly modulus: number;
  /** Reference |f| for the linear / log / log-log transfers. */
  readonly modScale: number;
}

export const DEFAULT_COLORING: ColoringOptions = {
  enhance: 0, // "none (flat hue)" — a clean phase portrait by default; overlays are opt-in
  sectors: 6,
  crisp: false,
  modulus: 0,
  modScale: 1,
};

export interface ColorFillOptions {
  readonly bg?: readonly [number, number, number];
  readonly coloring?: ColoringOptions;
}

const TWO_PI = 2 * Math.PI;
const frac = (v: number): number => v - Math.floor(v);
const sawShade = (v: number, aMin: number): number => aMin + (1 - aMin) * frac(v);

// Full saturation/value HSV hue wheel (matches the GPU LUT), h ∈ [0,1) → [r,g,b] in [0,1].
function hueRgb(h: number): [number, number, number] {
  const x = 1 - Math.abs(((h * 6) % 2) - 1);
  const hp = h * 6;
  if (hp < 1) return [1, x, 0];
  if (hp < 2) return [x, 1, 0];
  if (hp < 3) return [0, 1, x];
  if (hp < 4) return [0, x, 1];
  if (hp < 5) return [x, 0, 1];
  return [1, 0, x];
}

function modulusLightness(m: number, mode: number, scale: number): number {
  if (mode === 0) return 1;
  if (mode === 1) return Math.min(1, Math.max(0, m / scale));
  if (mode === 2) return m / (1 + m);
  if (mode === 3) return Math.min(1, Math.max(0, Math.log(1 + m) / Math.log(1 + scale)));
  return Math.min(1, Math.max(0, Math.log(1 + Math.log(1 + m)) / Math.log(1 + Math.log(1 + scale))));
}

function enhancement(re: number, im: number, m: number, arg: number, enhance: number, sectors: number): number {
  if (enhance === 0) return 1;
  const lm = Math.log(Math.max(m, 1e-30));
  if (enhance === 1) return sawShade(Math.log2(Math.max(m, 1e-30)), 0.6);
  if (enhance === 2) return sawShade(sectors * (arg / TWO_PI + 0.5), 0.6);
  if (enhance === 3) {
    const step = TWO_PI / sectors;
    return sawShade(lm / step, 0.72) * sawShade(arg / step, 0.72);
  }
  if (enhance === 4) {
    const step = TWO_PI / sectors;
    const par = ((Math.floor(lm / step) + Math.floor(arg / step)) % 2 + 2) % 2;
    return 0.68 + 0.32 * par;
  }
  return sawShade(re, 0.7) * sawShade(im, 0.7);
}

/** The phase-portrait color of a complex value under `opts`: hue × modulus-lightness × enhancement. */
export function phaseColor(v: Cx, opts: ColoringOptions = DEFAULT_COLORING): [number, number, number] {
  const m = Math.hypot(v.re, v.im);
  if (!Number.isFinite(m)) return [77, 77, 84];
  const arg = Math.atan2(v.im, v.re);
  const hue = (arg / TWO_PI + 1) % 1;
  const [hr, hg, hb] = hueRgb(hue);
  const f = Math.min(
    1,
    Math.max(0, modulusLightness(m, opts.modulus, opts.modScale) * enhancement(v.re, v.im, m, arg, opts.enhance, opts.sectors)),
  );
  return [Math.round(hr * f * 255), Math.round(hg * f * 255), Math.round(hb * f * 255)];
}

/**
 * Fill `ctx` with the phase portrait of `g` over the panel. `g(w)` returns the complex value at world
 * point `w`, or `null` when `w` is outside the panel's domain — those pixels get the background color.
 */
export function fillPhasePortrait(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  g: (w: readonly [number, number]) => Cx | null,
  opts: ColorFillOptions = {},
): void {
  const { widthPx, heightPx } = map;
  if (widthPx <= 0 || heightPx <= 0) return;
  const bg = opts.bg ?? [22, 24, 30];
  const coloring = opts.coloring ?? DEFAULT_COLORING;
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
        const [r, g2, b] = phaseColor(val, coloring);
        data[idx] = r;
        data[idx + 1] = g2;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
