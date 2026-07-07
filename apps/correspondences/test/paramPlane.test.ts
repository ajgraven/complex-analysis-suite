import { describe, expect, it } from "vitest";
import {
  classifyParamBand,
  DEFAULT_PARAM_VIEW,
  pixelToParam,
  type ParamView,
} from "../src/paramPlane.js";

// classifyParamBand is the pure, heavy core (colouring needs a browser ImageData). Small grid + a
// modest cap for test speed.
const W = 40;
const H = 40;
const OPTS = { maxIter: 32, escapeR: 1e3 };

function classify(view: ParamView = DEFAULT_PARAM_VIEW): Float32Array {
  const field = new Float32Array(W * H);
  classifyParamBand(field, W, H, view, OPTS, 0, H);
  return field;
}

const nearestPixel = (target: [number, number], view: ParamView): number => {
  let best = 0;
  let bestD = Infinity;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const a = pixelToParam(px, py, W, H, view);
      const d = Math.hypot(a[0] - target[0], a[1] - target[1]);
      if (d < bestD) {
        bestD = d;
        best = py * W + px;
      }
    }
  }
  return best;
};

describe("parameter-plane classifier", () => {
  it("pixelToParam maps the grid centre to the view centre and respects orientation (up = +Im)", () => {
    const c = pixelToParam(W / 2, H / 2, W, H, DEFAULT_PARAM_VIEW);
    expect(c[0]).toBeCloseTo(DEFAULT_PARAM_VIEW.centerX, 1);
    expect(c[1]).toBeCloseTo(DEFAULT_PARAM_VIEW.centerY, 1);
    const top = pixelToParam(W / 2, 0, W, H, DEFAULT_PARAM_VIEW);
    const bot = pixelToParam(W / 2, H - 1, W, H, DEFAULT_PARAM_VIEW);
    expect(top[1]).toBeGreaterThan(bot[1]); // screen-top is larger Im a
  });

  it("the field has both an in-locus body and an escaping exterior (structure, not uniform)", () => {
    const field = classify();
    let locus = 0;
    let escaped = 0;
    for (const n of field) {
      if (n >= OPTS.maxIter) locus++;
      else escaped++;
    }
    expect(locus).toBeGreaterThan(20); // a real body, not a speck
    expect(escaped).toBeGreaterThan(20); // and a real exterior
  });

  it("the deltoid a = 1 and the round disk a = 0 sit in the locus; a large-|a| corner escapes", () => {
    const field = classify();
    expect(field[nearestPixel([1, 0], DEFAULT_PARAM_VIEW)]).toBe(OPTS.maxIter); // deltoid: bounded
    expect(field[nearestPixel([0, 0], DEFAULT_PARAM_VIEW)]).toBe(OPTS.maxIter); // disk: bounded
    expect(field[0]).toBeLessThan(OPTS.maxIter); // top-left corner (|a| large) escapes
  });

  it("is deterministic — identical inputs give an identical field (no RNG)", () => {
    expect(Array.from(classify())).toEqual(Array.from(classify()));
  });
});
