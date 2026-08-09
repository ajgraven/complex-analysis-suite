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

// σ-field coloring modes (S5-B1): WHAT the colormap ramp encodes. "escape" is the ADR-0009 default (the
// tiling coloured by its escape/K-entry count); "trap" and "stripe" are orbit STATISTICS accumulated over
// the σ-orbit σⁿ(w) the engine already produces — no new map math (that is B2's derivative modes). The ids
// are baked into the shader's fieldColor (render/schwarzGL.ts); keep them in sync. (CD's triangle-
// inequality average is deliberately absent — it is z²+c-specific, using |c| and the quadratic relation
// between |zₙ₊₁|, |zₙ|², |c|, which has no meaning for σ.)
export interface SchwarzColorMode {
  id: number;
  key: string;
  label: string;
}
export const SCHWARZ_COLOR_MODES: readonly SchwarzColorMode[] = [
  { id: 0, key: "escape", label: "Escape time" },
  { id: 1, key: "trap", label: "Orbit trap" },
  { id: 2, key: "stripe", label: "Stripe average" },
  // Derivative-dependent modes (S5-B2), on the ESCAPING set (orbits → ∞ like const·conj(w)^d). "smooth"
  // is the continuous escape count; "distance" is the analytic distance estimate to the σ-Julia set,
  // riding the numerically-inverted derivative |F'(z)|/|φ'(z)| — both are estimates (≈).
  { id: 3, key: "smooth", label: "Smooth escape (≈)" },
  { id: 4, key: "distance", label: "Distance estimate (≈)" },
];
export const DEFAULT_SCHWARZ_COLOR_MODE = "escape";

/** Color-mode id for a key, or the escape-time default (0) for an unknown key. */
export function schwarzColorModeId(key: string): number {
  return SCHWARZ_COLOR_MODES.find((m) => m.key === key)?.id ?? 0;
}

// Orbit-trap shapes (S5-B1, colorMode "trap"): the set whose closest approach by the σ-orbit colours the
// pixel. Mirrors CD's standard trap shapes (shaderBuilder.ts trapDistance); ids are baked into the σ
// shader's trapDistance — keep them in sync.
export interface SchwarzTrapShape {
  id: number;
  key: string;
  label: string;
}
export const SCHWARZ_TRAP_SHAPES: readonly SchwarzTrapShape[] = [
  { id: 0, key: "cross", label: "Cross (axes)" },
  { id: 1, key: "point", label: "Point (origin)" },
  { id: 2, key: "line", label: "Real axis" },
  { id: 3, key: "circle", label: "Unit circle" },
  { id: 4, key: "lattice", label: "Integer lattice" },
];
export const DEFAULT_SCHWARZ_TRAP_SHAPE = "cross";

/** Trap-shape id for a key, or the cross default (0) for an unknown key. */
export function schwarzTrapShapeId(key: string): number {
  return SCHWARZ_TRAP_SHAPES.find((m) => m.key === key)?.id ?? 0;
}
