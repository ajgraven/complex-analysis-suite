// Colormap palettes + escape-time scale modes for the σ peer view (ADR-0009 item 3 — coloring parity
// with the standard fractals). σ colors its escape count `n` through a @cas/gpu colormap TEXTURE (the
// shared ramp-building primitive), exactly as QD's σ does — NOT through CD's standard-fractal palette
// GLSL, which is a set of procedural polynomial fits baked into the (byte-frozen) escape-time shader.
//
// The palette DATA is app-local by design: @cas/gpu shares only the "interpolate colours into a width×1
// ramp" machinery, not the tables (its header spells this out — CD's fits and QD's stop tables are
// different objects). These are the perceptually-uniform matplotlib ramps (+ Google Turbo) QD's σ
// already ships; the names overlap CD's standard palettes (viridis / magma / cividis / grayscale) so the
// picker reads consistently across the app.
import type { RGB } from "@cas/gpu/colormap";

/** Even-spaced colour tables (colour k sits at k/(n−1)); `@cas/gpu`'s makeColormapTexture lerps them into
 *  a 256×1 LINEAR ramp. */
export const SCHWARZ_COLORMAPS: Readonly<Record<string, readonly RGB[]>> = {
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 73, 137], [49, 104, 142], [38, 130, 142],
    [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
  ],
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
    [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ],
  inferno: [
    [0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85],
    [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164],
  ],
  plasma: [
    [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150], [203, 70, 121],
    [229, 107, 93], [248, 148, 65], [253, 195, 40], [240, 249, 33],
  ],
  cividis: [
    [0, 32, 76], [0, 52, 110], [40, 75, 124], [80, 100, 128], [120, 127, 128],
    [161, 156, 124], [197, 187, 108], [230, 219, 84], [253, 253, 51],
  ],
  turbo: [
    [48, 18, 59], [71, 118, 238], [26, 196, 231], [26, 231, 153], [97, 239, 71],
    [202, 231, 33], [255, 184, 33], [255, 113, 33], [224, 40, 9], [122, 4, 2],
  ],
  grayscale: [
    [0, 0, 0], [64, 64, 64], [128, 128, 128], [192, 192, 192], [255, 255, 255],
  ],
};

/** Display order for the picker; the first is the default. */
export const SCHWARZ_COLORMAP_NAMES = [
  "viridis",
  "magma",
  "inferno",
  "plasma",
  "cividis",
  "turbo",
  "grayscale",
] as const;

export const DEFAULT_SCHWARZ_COLORMAP = "viridis";

/** Colours for a named palette, falling back to the default for an unknown name (never throws — a bad
 *  saved name must not break a render). */
export function schwarzColormap(name: string): readonly RGB[] {
  return SCHWARZ_COLORMAPS[name] ?? SCHWARZ_COLORMAPS[DEFAULT_SCHWARZ_COLORMAP];
}

// Escape-time scale modes: how the integer escape count n maps to the colormap coordinate t∈[0,1] before
// the ramp lookup. The ids are baked into the shader's computeT (render/schwarzGL.ts); keep them in sync.
export interface SchwarzScaleMode {
  id: number;
  key: string;
  label: string;
}
export const SCHWARZ_SCALE_MODES: readonly SchwarzScaleMode[] = [
  { id: 0, key: "linear", label: "Linear" },
  { id: 1, key: "log", label: "Log" },
  { id: 2, key: "sqrt", label: "Sqrt" },
  { id: 3, key: "discrete", label: "Discrete" },
  { id: 4, key: "cyclic", label: "Cyclic" },
];
export const DEFAULT_SCHWARZ_SCALE = "linear";

/** Scale-mode id for a key, or the linear default for an unknown key. */
export function schwarzScaleId(key: string): number {
  return SCHWARZ_SCALE_MODES.find((m) => m.key === key)?.id ?? 0;
}
