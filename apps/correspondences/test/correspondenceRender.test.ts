import { describe, expect, it } from "vitest";
import {
  accumulateBand,
  blurDensity,
  densityToImage,
  DEFAULT_DENSITY,
  type DensityOptions,
} from "../src/correspondenceRender.js";
import { DEFAULT_VIEW } from "../src/render.js";

// `accumulateBand` is the pure, heavy core of the density render (colorizing needs a browser ImageData).
// Small grid for test speed.
const W = 64;
const H = 64;
const opts: DensityOptions = { ...DEFAULT_DENSITY, seedGrid: 16, maxNodes: 80, maxDepth: 12 };

describe("correspondence orbit-tree density accumulation", () => {
  it("accumulates a spread of orbit-tree points into the density buffer", () => {
    const d = new Float32Array(W * H);
    accumulateBand(d, W, H, DEFAULT_VIEW, opts, 0, opts.seedGrid);
    let total = 0;
    let nonzero = 0;
    for (const v of d) {
      total += v;
      if (v > 0) nonzero++;
    }
    expect(total).toBeGreaterThan(0); // points landed
    expect(nonzero).toBeGreaterThan(20); // spread across many pixels — structure, not a single dot
  });

  it("is deterministic — identical inputs give identical density (no RNG)", () => {
    const a = new Float32Array(W * H);
    const b = new Float32Array(W * H);
    accumulateBand(a, W, H, DEFAULT_VIEW, opts, 0, opts.seedGrid);
    accumulateBand(b, W, H, DEFAULT_VIEW, opts, 0, opts.seedGrid);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("blurDensity", () => {
  const sum = (a: Float32Array): number => {
    let s = 0;
    for (const v of a) s += v;
    return s;
  };

  it("spreads an interior spike to its neighbours while conserving mass and staying non-negative", () => {
    const W2 = 16;
    const H2 = 16;
    const d = new Float32Array(W2 * H2);
    d[8 * W2 + 8] = 100;
    const out = blurDensity(d, W2, H2);
    expect(out[8 * W2 + 8]).toBeLessThan(100); // peak spread out
    expect(out[8 * W2 + 9]).toBeGreaterThan(0); // ...into the 4-neighbours
    expect(out[8 * W2 + 7]).toBeGreaterThan(0);
    expect(out[9 * W2 + 8]).toBeGreaterThan(0);
    expect(out[7 * W2 + 8]).toBeGreaterThan(0);
    expect(sum(out)).toBeCloseTo(sum(d), 3); // mass conserved (spike stays interior over 2 passes)
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic", () => {
    const W2 = 12;
    const H2 = 12;
    const d = new Float32Array(W2 * H2);
    d[5 * W2 + 6] = 7;
    d[3 * W2 + 2] = 4;
    expect(Array.from(blurDensity(d, W2, H2))).toEqual(Array.from(blurDensity(d, W2, H2)));
  });
});

describe("densityToImage — the blur actually reaches the pixels (not a silent no-op)", () => {
  // ImageData is browser-only; densityToImage touches only {width,height,data}, so a duck-typed stand-in
  // with a Uint8ClampedArray is enough to exercise the colorizer headlessly.
  const mkImage = (w: number, h: number): ImageData =>
    ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) as unknown as ImageData;

  it("blur=true smooths an isolated spike into its neighbours; blur=false leaves them as background", () => {
    const W2 = 32;
    const H2 = 32;
    const cx = 16;
    const cy = 16;
    const density = new Float32Array(W2 * H2);
    density[cy * W2 + cx] = 50; // one isolated hit

    const sharp = mkImage(W2, H2);
    const smooth = mkImage(W2, H2);
    densityToImage(density, sharp, DEFAULT_VIEW, false);
    densityToImage(density, smooth, DEFAULT_VIEW, true);

    // A 4-neighbour of the spike has raw density 0, so the sharp render paints it as background; the
    // blur deposits real weight there, so the smooth render lights it. Pre-fix (the loop read the raw
    // `density`) these two renders were byte-identical — a silent no-op.
    const nb = (cy * W2 + (cx + 1)) * 4;
    const sharpRGB = [sharp.data[nb], sharp.data[nb + 1], sharp.data[nb + 2]];
    const smoothRGB = [smooth.data[nb], smooth.data[nb + 1], smooth.data[nb + 2]];
    expect(smoothRGB).not.toEqual(sharpRGB);
    expect(smooth.data[nb]).toBeGreaterThan(0); // heat()'s red channel — the neighbour is genuinely lit
  });
});
