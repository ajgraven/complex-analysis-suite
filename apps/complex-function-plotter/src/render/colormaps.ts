/**
 * Phase colormaps as 256-entry lookup tables, baked into one small RGBA8 atlas so switching maps is a
 * single shader uniform (the v-row), not a texture rebuild. Phase 1 ships two: a perceptually-uniform
 * Oklch cyclic map (the default — equal arg steps look equal, and hue does not smuggle lightness into
 * the modulus channel) and the classic HSV wheel (familiar, and for DLMF-legacy comparison). Pure
 * module — no DOM, no WebGL — so the ramps are unit-testable. Later phases add CET / cmocean / a
 * colorblind-safe cyclic map (catalog C5/C6) as extra rows.
 */

export interface Colormap {
  id: string;
  label: string;
  /** RGB, each in [0, 1], for a cyclic phase parameter t in [0, 1). */
  sample(t: number): [number, number, number];
}

// --- Oklab -> linear sRGB (Björn Ottosson's matrices) --------------------------------------------
function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

const linearToSrgb = (c: number): number => {
  const x = clamp01(c);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
};

/** An Oklch colour (constant L, C; hue in degrees) converted to gamut-clamped sRGB in [0, 1]. */
function oklch(L: number, C: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const [r, g, b] = oklabToLinearSrgb(L, C * Math.cos(h), C * Math.sin(h));
  return [clamp01(linearToSrgb(r)), clamp01(linearToSrgb(g)), clamp01(linearToSrgb(b))];
}

// Constant-lightness, constant-chroma loop; hue offset so t = 0 (arg 0, the positive real axis) reads
// red, matching the common domain-coloring convention. C is kept modest so most hues stay in sRGB gamut.
const OKLCH_L = 0.68;
const OKLCH_C = 0.125;
const OKLCH_HUE0 = 29;

export const oklchCyclic: Colormap = {
  id: "oklch",
  label: "Perceptual (Oklch)",
  sample: (t) => oklch(OKLCH_L, OKLCH_C, OKLCH_HUE0 + 360 * t),
};

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const u = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, u, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, u];
    case 3:
      return [p, q, v];
    case 4:
      return [u, p, v];
    default:
      return [v, p, q];
  }
}

export const hsvCyclic: Colormap = {
  id: "hsv",
  label: "HSV (classic)",
  sample: (t) => hsvToRgb(t, 1, 1),
};

// Twilight-like: chroma roughly constant, but lightness varies around the loop (light near arg 0,
// dark near arg ±π) — the defining feature of matplotlib's "twilight". Not isoluminant, so it reads
// best with the "phase only" modulus mode.
export const twilightCyclic: Colormap = {
  id: "twilight",
  label: "Twilight",
  sample: (t) => {
    const L = 0.58 + 0.26 * Math.cos(2 * Math.PI * t);
    return oklch(L, 0.1, OKLCH_HUE0 + 210 + 360 * t);
  },
};

// Colorblind-safe cyclic: the loop runs mainly along the blue↔yellow axis (safe under red–green CVD),
// with lightness carrying extra cyclic information. Built directly in Oklab.
export const cvdSafeCyclic: Colormap = {
  id: "cvd-safe",
  label: "Colorblind-safe",
  sample: (t) => {
    const a = 2 * Math.PI * t;
    const [r, g, b] = oklabToLinearSrgb(0.6 + 0.22 * Math.cos(a), 0.055 * Math.sin(a), 0.13 * Math.cos(a));
    return [clamp01(linearToSrgb(r)), clamp01(linearToSrgb(g)), clamp01(linearToSrgb(b))];
  },
};

/** Ordered list of available colormaps; the index is the atlas row and the share-state value. */
export const COLORMAPS: Colormap[] = [oklchCyclic, hsvCyclic, twilightCyclic, cvdSafeCyclic];

/** Bake one colormap into a width×1 RGBA8 row. */
export function bakeRow(cm: Colormap, width = 256): Uint8Array {
  const out = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const [r, g, b] = cm.sample(i / width);
    out[i * 4] = Math.round(255 * r);
    out[i * 4 + 1] = Math.round(255 * g);
    out[i * 4 + 2] = Math.round(255 * b);
    out[i * 4 + 3] = 255;
  }
  return out;
}

export interface Atlas {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Bake every colormap into one width×N RGBA8 atlas; row i corresponds to COLORMAPS[i]. */
export function bakeAtlas(width = 256): Atlas {
  const height = COLORMAPS.length;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    data.set(bakeRow(COLORMAPS[row], width), row * width * 4);
  }
  return { data, width, height };
}
