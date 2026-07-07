import { describe, expect, it } from "vitest";
import { accumulateBand, DEFAULT_DENSITY, type DensityOptions } from "../src/correspondenceRender.js";
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
