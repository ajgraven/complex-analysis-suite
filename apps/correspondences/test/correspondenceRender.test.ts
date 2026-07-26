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

// ---------------------------------------------------------------------------------------------
// The K-mask memo (review corr-density-01).
//
// densityToImage used to ray-cast the 256-gon deltoid boundary per zero-density pixel, on every one
// of the 22 progressive chunks — ~98 ms per full pass over 380², i.e. 1.2–2.2 s of redundant
// main-thread work per page load for a mask that never changes. It is now cached on (W, H, view).
//
// Caching is where the risk moved, so these pin the invalidation: same view must reuse, a different
// view or size must NOT.
describe("densityToImage — the K-mask cache is correct, not just fast", () => {
  const mk = (w: number, h: number): ImageData =>
    ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) as unknown as ImageData;
  const rgbAt = (img: ImageData, i: number): number[] => [
    img.data[i * 4],
    img.data[i * 4 + 1],
    img.data[i * 4 + 2],
  ];

  it("paints K darker-blue and the exterior near-black on an all-zero density", () => {
    const W2 = 48;
    const H2 = 48;
    const img = mk(W2, H2);
    densityToImage(new Float32Array(W2 * H2), img, DEFAULT_VIEW, false);
    // The centre of the default view lies inside the deltoid; a far corner does not.
    const centre = (H2 >> 1) * W2 + (W2 >> 1);
    expect(rgbAt(img, centre)).toEqual([20, 22, 34]); // K
    expect(rgbAt(img, 0)).toEqual([8, 8, 12]); // exterior
  });

  it("repeated calls at the same view are identical (a cache hit must change nothing)", () => {
    const W2 = 40;
    const H2 = 40;
    const d = new Float32Array(W2 * H2);
    const a = mk(W2, H2);
    const b = mk(W2, H2);
    densityToImage(d, a, DEFAULT_VIEW, false);
    densityToImage(d, b, DEFAULT_VIEW, false); // served from the memo
    expect(Array.from(b.data)).toEqual(Array.from(a.data));
  });

  it("a different view invalidates the mask — K is not painted in the stale place", () => {
    const W2 = 40;
    const H2 = 40;
    const d = new Float32Array(W2 * H2);
    const near = mk(W2, H2);
    const far = mk(W2, H2);
    densityToImage(d, near, DEFAULT_VIEW, false);
    // Pan far away from the deltoid: every pixel should now be exterior.
    densityToImage(d, far, { ...DEFAULT_VIEW, centerX: 500, centerY: 500 }, false);

    const centre = (H2 >> 1) * W2 + (W2 >> 1);
    expect(rgbAt(near, centre)).toEqual([20, 22, 34]); // was inside K
    expect(rgbAt(far, centre)).toEqual([8, 8, 12]); // stale mask would have kept it K
  });

  it("a different size invalidates the mask (no length mismatch, no stale reuse)", () => {
    const small = mk(24, 24);
    const large = mk(56, 56);
    densityToImage(new Float32Array(24 * 24), small, DEFAULT_VIEW, false);
    densityToImage(new Float32Array(56 * 56), large, DEFAULT_VIEW, false);
    expect(rgbAt(large, (56 >> 1) * 56 + (56 >> 1))).toEqual([20, 22, 34]);
    expect(rgbAt(large, 0)).toEqual([8, 8, 12]);
  });

  it("returning to the first view recomputes correctly (not poisoned by the pan)", () => {
    const W2 = 40;
    const H2 = 40;
    const d = new Float32Array(W2 * H2);
    const first = mk(W2, H2);
    const back = mk(W2, H2);
    densityToImage(d, first, DEFAULT_VIEW, false);
    densityToImage(d, mk(W2, H2), { ...DEFAULT_VIEW, centerX: 500 }, false);
    densityToImage(d, back, DEFAULT_VIEW, false);
    expect(Array.from(back.data)).toEqual(Array.from(first.data));
  });
});
