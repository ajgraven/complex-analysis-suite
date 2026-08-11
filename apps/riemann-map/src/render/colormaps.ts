// colormaps.ts — the perceptually-uniform colour ramps (roadmap A6). Each is a small set of anchor
// colours (0–255); @cas/gpu's buildColormapLUT/makeColormapTexture interpolate them to a 256×1 texture the
// shader samples, so adding a ramp is just adding a table — and the SAME tables drive the legend bar, so
// the chip always matches the picture. Replaces the shader's single hardcoded viridis polynomial.
import type { RGB } from "@cas/gpu/colormap";
import { buildColormapLUT } from "@cas/gpu/colormap";

export interface Colormap {
  readonly id: string;
  readonly name: string;
  readonly colors: readonly RGB[];
}

// Anchor subsamples of the matplotlib / Google-Turbo ramps (interpolated to 256 in the LUT).
const VIRIDIS: RGB[] = [
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
  [31, 158, 137], [53, 183, 121], [110, 206, 88], [181, 222, 43], [253, 231, 37],
];
const MAGMA: RGB[] = [
  [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
  [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
];
const INFERNO: RGB[] = [
  [0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85],
  [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164],
];
const PLASMA: RGB[] = [
  [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150], [203, 70, 121],
  [229, 107, 93], [248, 148, 65], [253, 195, 40], [240, 249, 33],
];
const TURBO: RGB[] = [
  [48, 18, 59], [65, 69, 171], [57, 118, 229], [27, 166, 204], [42, 199, 155],
  [122, 214, 86], [192, 220, 47], [249, 183, 52], [245, 120, 38], [216, 60, 18], [122, 4, 3],
];
const GRAYSCALE: RGB[] = [[0, 0, 0], [255, 255, 255]];

export const COLORMAPS: readonly Colormap[] = [
  { id: "viridis", name: "Viridis", colors: VIRIDIS },
  { id: "magma", name: "Magma", colors: MAGMA },
  { id: "inferno", name: "Inferno", colors: INFERNO },
  { id: "plasma", name: "Plasma", colors: PLASMA },
  { id: "turbo", name: "Turbo", colors: TURBO },
  { id: "grayscale", name: "Grayscale", colors: GRAYSCALE },
] as const;

const byId = new Map(COLORMAPS.map((c) => [c.id, c]));

/** The anchor colours for a colormap id (falls back to viridis). */
export function colormapColors(id: string): readonly RGB[] {
  return (byId.get(id) ?? COLORMAPS[0]).colors;
}

/** A CSS `linear-gradient` for the colormap, sampled from the same LUT the shader uses (for the legend). */
export function colormapGradientCss(id: string, n = 16): string {
  const lut = buildColormapLUT(colormapColors(id), n);
  const stops: string[] = [];
  for (let i = 0; i < n; i++) {
    stops.push(`rgb(${lut[i * 4]} ${lut[i * 4 + 1]} ${lut[i * 4 + 2]}) ${((100 * i) / (n - 1)).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
