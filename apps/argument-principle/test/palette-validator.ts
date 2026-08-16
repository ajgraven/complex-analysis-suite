// palette-validator.ts — a self-contained CVD/contrast validator for the app's categorical MARK tokens
// (ADR-0023 action item 4). It vendors the exact algorithm the house dataviz validator uses — OKLab ΔE
// over the Machado-Oliveira-Fernandes (2009) severity-1.0 CVD simulation, plus OKLCH lightness/chroma and
// WCAG contrast — so `palette.test.ts` can gate the ○/✕/◆ palette in CI without a runtime dependency on the
// (ephemeral) bundled skill. Kept app-local per ADR-0007; extract only if a second app needs the same set.

export type RGB = readonly [number, number, number];

/** Machado, Oliveira & Fernandes (2009) CVD transforms at severity 1.0 (linear RGB). */
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;
export type CVDKind = keyof typeof MACHADO;

export function hexToSrgb(hex: string): RGB {
  const h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a 6-digit hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as unknown as RGB;
}
const s2lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (hex: string): RGB => hexToSrgb(hex).map(s2lin) as unknown as RGB;
const clamp01 = (c: number): number => Math.max(0, Math.min(1, c));

const relLum = (hex: string): number => {
  const [r, g, b] = lin(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function oklabFromLin([r, g, b]: RGB): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const oklab = (hex: string): RGB => oklabFromLin(lin(hex));
/** OKLCH lightness (L) and chroma (C) of a hex colour. */
export function oklch(hex: string): { L: number; C: number } {
  const [L, a, b] = oklab(hex);
  return { L, C: Math.hypot(a, b) };
}

function simulate(hex: string, kind: CVDKind): RGB {
  const [r, g, b] = lin(hex);
  const M = MACHADO[kind];
  return [
    clamp01(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp01(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp01(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ];
}
/** Euclidean ΔE in OKLab ×100. Omit `kind` for unsimulated (normal) vision. */
export function deltaE(h1: string, h2: string, kind?: CVDKind): number {
  const a = oklabFromLin(kind ? simulate(h1, kind) : lin(h1));
  const b = oklabFromLin(kind ? simulate(h2, kind) : lin(h2));
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** The worst (smallest) CVD ΔE over every pair in `colors`, taken as min across protan + deutan. */
export function worstCvdDeltaE(colors: readonly string[]): { dE: number; kind: CVDKind; i: number; j: number } {
  let worst: { dE: number; kind: CVDKind; i: number; j: number } | null = null;
  for (const kind of ["protan", "deutan"] as const) {
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const dE = deltaE(colors[i], colors[j], kind);
        if (!worst || dE < worst.dE) worst = { dE, kind, i, j };
      }
    }
  }
  if (!worst) throw new Error("worstCvdDeltaE needs at least two colours");
  return worst;
}
/** The worst (smallest) unsimulated ΔE over every pair in `colors`. */
export function worstNormalDeltaE(colors: readonly string[]): number {
  let worst = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) worst = Math.min(worst, deltaE(colors[i], colors[j]));
  }
  return worst;
}
