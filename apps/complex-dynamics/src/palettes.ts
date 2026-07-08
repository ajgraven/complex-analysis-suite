/**
 * Gradient model for custom colouring. A list of colour stops is interpolated into
 * a 256×1 RGBA ramp and uploaded as the `uGradient` texture, sampled by the shader
 * when the "Custom gradient" palette (uPalette == 4) is selected. The built-in
 * palettes (classic/viridis/magma/grayscale) stay in the shader; this powers the
 * user-editable gradient and recolours without recompiling.
 */
import { buildGradientLUT, sampleStops } from "@cas/gpu/colormap";

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
 * Linear-interpolate colour stops into a `width`×1 RGBA8 ramp (opaque) — the render ramp for the
 * custom gradient. Delegates to @cas/gpu's shared, golden-tested positioned-stop builder; the ramp
 * machinery is shared across the suite, while the palette DATA stays app-local.
 */
export function buildGradient(stops: GradientStop[], width = 256): Uint8Array {
  return buildGradientLUT(stops, width);
}

/** Sample custom colour stops at t∈[0,1] → an [r,g,b] triple (0..255); the @cas/gpu twin of
 *  {@link buildGradient}'s clamp-and-lerp, so the legend swatch matches the render. */
export function sampleGradient(stops: GradientStop[], t: number): [number, number, number] {
  return sampleStops(stops, t);
}

/** The colour-palette select values (mirrors the `uPalette` ints the shader keys off). */
export type PaletteName = "classic" | "viridis" | "magma" | "grayscale" | "cividis" | "custom";

type RGB = [number, number, number];
// The built-in colormaps live in the shader (src/render/shaderBuilder.ts COLOR_GLSL); these are the
// exact JS twins so the legend swatch reproduces the on-screen ramp (viridis/magma degree-6 fits,
// cividis piecewise-linear anchors, the classic CindyScript ramp).
const VIRIDIS: readonly RGB[] = [
  [0.2777273272234177, 0.005407344544966578, 0.3340998053353061],
  [0.1050930431085774, 1.404613529898575, 1.384590162594685],
  [-0.3308618287255563, 0.214847559468213, 0.09509516302823659],
  [-4.634230498983486, -5.799100973351585, -19.33244095627987],
  [6.228269936347081, 14.17993336680509, 56.69055260068105],
  [4.776384997670288, -13.74514537774601, -65.35303263337234],
  [-5.435455855934631, 4.645852612178535, 26.3124352495832],
];
const MAGMA: readonly RGB[] = [
  [-0.002136485053939, -0.000749655052795, -0.005386127855323],
  [0.2516605407371642, 0.6775232436837668, 2.494026599312351],
  [8.353717279216625, -3.577719514958484, 0.3144679030132573],
  [-27.66873308576866, 14.26473078096533, -13.64921318813922],
  [52.17613981234068, -27.94360607168351, 12.94416944238394],
  [-50.76852536473588, 29.04658282127291, 4.234152993845878],
  [18.65570506591883, -11.48977351997711, -5.601961508734096],
];
const CIVIDIS: readonly RGB[] = [
  [0.0, 0.133, 0.306],
  [0.231, 0.286, 0.424],
  [0.439, 0.443, 0.451],
  [0.647, 0.612, 0.455],
  [0.824, 0.757, 0.353],
  [1.0, 0.918, 0.275],
];

function poly6(t: number, c: readonly RGB[]): RGB {
  const at = (k: number): number => c[6][k] * t + c[5][k];
  const horner = (k: number): number =>
    c[0][k] + t * (c[1][k] + t * (c[2][k] + t * (c[3][k] + t * (c[4][k] + t * at(k)))));
  return [horner(0), horner(1), horner(2)];
}

function cividisRGB(t: number): RGB {
  const u = Math.min(1, Math.max(0, t)) * 5;
  const seg = Math.min(4, Math.floor(u));
  const f = u - seg;
  const lo = CIVIDIS[seg];
  const hi = CIVIDIS[seg + 1];
  return [lo[0] + (hi[0] - lo[0]) * f, lo[1] + (hi[1] - lo[1]) * f, lo[2] + (hi[2] - lo[2]) * f];
}

function classicRGB(t: number): RGB {
  const s = (3 * t) / (2 * t + 1);
  return [4 * s, 1.3 * s, (1 - s) * (1 - s) * 0.7];
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Sample a palette at `t` → an [r,g,b] triple (0..255), the JS twin of the shader's `palette(t)`.
 * `t` is clamped to [0,1] so the legend shows the full ramp (t=1 → the bright end, not a wrap back
 * to 0); a caller wanting the palette-rotation offset folds it in first via `fract(t + offset)`.
 * `custom` supplies the stops for the custom gradient (falls back to {@link DEFAULT_GRADIENT}).
 */
export function paletteRGB(name: PaletteName, t: number, custom?: GradientStop[]): RGB {
  const u = Math.min(1, Math.max(0, t));
  if (name === "custom") {
    const c = sampleGradient(custom ?? DEFAULT_GRADIENT, u);
    return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
  }
  let c: RGB;
  if (name === "viridis") c = poly6(u, VIRIDIS);
  else if (name === "magma") c = poly6(u, MAGMA);
  else if (name === "grayscale") c = [u, u, u];
  else if (name === "cividis") c = cividisRGB(u);
  else c = classicRGB(u);
  return [clamp255(c[0] * 255), clamp255(c[1] * 255), clamp255(c[2] * 255)];
}
