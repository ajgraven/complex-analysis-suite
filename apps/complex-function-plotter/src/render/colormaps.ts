/**
 * Phase colormaps as 256-entry lookup tables, baked into one small RGBA8 atlas so switching maps is a
 * single shader uniform (the v-row), not a texture rebuild. The default is a perceptually-uniform Oklch
 * cyclic map (equal arg steps look equal, and hue does not smuggle lightness into the modulus channel);
 * alongside it the classic HSV wheel, a twilight, a colorblind-safe cyclic map, and the two **DLMF**
 * schemes (D8): the continuous warped-hue and the four-colour quadrant indicator (see below). Pure
 * module — no DOM, no WebGL — so the ramps are unit-testable, and each is just a row appended to the
 * atlas (indices are stable, so a share-link's colormap number keeps its meaning).
 */

export interface Colormap {
  id: string;
  label: string;
  /** RGB, each in [0, 1], for a cyclic phase parameter t in [0, 1). */
  sample(t: number): [number, number, number];
  /** Whether `sample` is continuous around the loop. Undefined = continuous (the common case). The
   *  DLMF four-colour map is a step function — a deliberate discontinuity at the positive real axis
   *  (the Q4→Q1 seam) — so it sets this `false`, and continuity checks skip it. */
  continuous?: boolean;
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
    const [r, g, b] = oklabToLinearSrgb(
      0.6 + 0.22 * Math.cos(a),
      0.055 * Math.sin(a),
      0.13 * Math.cos(a),
    );
    return [clamp01(linearToSrgb(r)), clamp01(linearToSrgb(g)), clamp01(linearToSrgb(b))];
  },
};

// --- DLMF schemes (D8) ---------------------------------------------------------------------------
// The NIST DLMF's domain-coloring conventions (dlmf.nist.gov/help/vrml/aboutcolor), so a plot here can
// be read directly against the DLMF's Γ / ζ figures. Two phase schemes; |f| (the DLMF's "height") is
// carried by the modulus→lightness transfer, exactly as for the other maps — a faithful DLMF density
// plot is one of these maps × a modulus mode.

// Continuous "warped-hue": phase → an HSV hue via the DLMF's piecewise-linear warp. With q = 4·t
// (t = arg/2π ∈ [0, 1)), hue° = 60·f(q) where f = q | 2q−1 | q+1 | 2q−2 across the four quarters — so the
// anchors are red (arg 0), yellow (π/2), cyan (π), blue (3π/2), and the hue lingers on red/yellow and
// cyan/blue while rushing through green and magenta (the "warp" vs. an even HSV wheel).
export const dlmfWarped: Colormap = {
  id: "dlmf-warped",
  label: "DLMF warped-hue",
  sample: (t) => {
    const q = 4 * t;
    const f = q < 1 ? q : q < 2 ? 2 * q - 1 : q < 3 ? q + 1 : 2 * q - 2;
    return hsvToRgb(f / 6, 1, 1); // hue° = 60·f ⇒ HSV hue-fraction = 60·f / 360 = f / 6 ∈ [0, 1)
  },
};

// Four-colour quadrant indicator: which quadrant the function VALUE lies in — blue / green / red /
// yellow for Q1 / Q2 / Q3 / Q4 (the DLMF's alphabetical mnemonic). A step function, so it is not
// continuous at the positive real axis (`continuous: false`). These are saturated indicator colours,
// not perceptual or CVD-safe — inherent to the scheme; the CVD preview reveals that honestly.
const Q_BLUE: [number, number, number] = [0.15, 0.35, 0.95];
const Q_GREEN: [number, number, number] = [0.1, 0.64, 0.22];
const Q_RED: [number, number, number] = [0.9, 0.16, 0.16];
const Q_YELLOW: [number, number, number] = [0.96, 0.82, 0.15];
export const dlmfQuadrant: Colormap = {
  id: "dlmf-quadrant",
  label: "DLMF four-colour",
  continuous: false,
  sample: (t) => (t < 0.25 ? Q_BLUE : t < 0.5 ? Q_GREEN : t < 0.75 ? Q_RED : Q_YELLOW),
};

/** Ordered list of available colormaps; the index is the atlas row and the share-state value. New maps
 *  are appended so existing indices stay stable (a saved share-link's `colormap` keeps its meaning). */
export const COLORMAPS: Colormap[] = [
  oklchCyclic,
  hsvCyclic,
  twilightCyclic,
  cvdSafeCyclic,
  dlmfWarped,
  dlmfQuadrant,
];

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
