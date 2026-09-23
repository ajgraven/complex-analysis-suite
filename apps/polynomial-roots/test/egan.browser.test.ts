import { describe, it, expect } from "vitest";
import { CET_C6 } from "@cas/gpu/cet";
import { GlStage, StageUnavailable } from "../src/stage/glStage";
import { RAMPS } from "../src/stage/ramps";
import { buildToneMap } from "../src/stage/tone";

// Egan's hue on the GPU. The node gate pins WHICH hue each image carries (`egan.test.ts`, against brute
// force); only a browser can say the stage READ it — that each of the |G| draws bound the hue attribute
// at its own offset, and that disagreeing roots come out grey rather than at a mean hue nothing has.

const SIZE = 64;
const H = 2;
const IDENTITY = { neg: false, rev: false, conj: false };
const REVERSAL = { neg: false, rev: true, conj: false };

function mount(): GlStage | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  document.body.append(canvas);
  try {
    const stage = new GlStage(canvas);
    stage.resize(SIZE);
    stage.setRamp(RAMPS.density.stops);
    return stage;
  } catch (err) {
    expect(err).toBeInstanceOf(StageUnavailable);
    return null;
  }
}

/** The world point at the centre of texel (i, j) — so a splat lands on exactly one texel. */
const at = (i: number, j: number): [number, number] => [((i + 0.5) / SIZE) * 2 * H - H, ((j + 0.5) / SIZE) * 2 * H - H];

/** The texel a world point lands in. */
const texel = (x: number, y: number): [number, number] => [
  Math.floor(((x / H + 1) / 2) * SIZE),
  Math.floor(((y / H + 1) / 2) * SIZE),
];

/** Paint, tone-map and present in Egan mode; returns the canvas's RGBA. */
function show(stage: GlStage, transforms: readonly (typeof IDENTITY)[]): Uint8Array {
  expect(stage.paintEgan({ cx: 0, cy: 0, halfHeight: H }, 1, transforms, 1, 30)).toBe(true);
  const tone = buildToneMap(stage.readDensity(), 1, 1);
  stage.setTone(tone.lut, tone.width);
  stage.present({ maxDensity: tone.maxDensity, exposure: 1, byDegree: false, egan: true, degreeRange: [1, 30] });
  const gl = stage.gl;
  const px = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}

const rgbAt = (px: Uint8Array, [i, j]: [number, number]): [number, number, number] => {
  const o = 4 * (j * SIZE + i);
  return [px[o], px[o + 1], px[o + 2]];
};

/** CET-C6 as the stage samples it: LINEAR over 256 texels, REPEAT. */
function cetAt(u: number): [number, number, number] {
  const x = u * 256 - 0.5;
  const i0 = Math.floor(x);
  const f = x - i0;
  const a = CET_C6[(i0 + 256) % 256];
  const b = CET_C6[(i0 + 1) % 256];
  return [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * f) as [number, number, number];
}

/** A colour's CHROMA direction — the brightness factor is one scalar, so it cancels. */
const direction = (c: readonly number[]): number[] => {
  const m = Math.max(...c);
  return c.map((v) => v / m);
};

describe("Egan's hue, drawn", () => {
  it("draws each symmetry image with ITS OWN hue — the attribute offset per draw", () => {
    const stage = mount();
    if (stage === null) return;
    const [x, y] = at(40, 36);
    stage.addPoints(10, new Float32Array([x, y, 1]), new Float32Array([0.1, 0.6]));
    const px = show(stage, [IDENTITY, REVERSAL]);
    const d = x * x + y * y;
    const inside = texel(x, y);
    const outside = texel(x / d, -y / d);
    for (const [where, hue] of [
      [inside, 0.1],
      [outside, 0.6],
    ] as const) {
      const got = direction(rgbAt(px, where));
      const want = direction(cetAt(hue));
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c] - want[c]), `hue ${hue} channel ${c}`).toBeLessThan(0.04);
    }
    // Anti-vacuity: the two hues really are different colours, so the check above could have failed.
    const a = direction(cetAt(0.1));
    const b = direction(cetAt(0.6));
    expect(Math.max(...[0, 1, 2].map((c) => Math.abs(a[c] - b[c])))).toBeGreaterThan(0.3);
    stage.dispose();
  });

  it("draws disagreeing roots GREY — a circular mean over opposite hues is no hue at all", () => {
    const stage = mount();
    if (stage === null) return;
    const [x1, y1] = at(20, 20);
    const [x2, y2] = at(44, 20);
    // Texel (20, 20): two roots whose hues are half a turn apart. Texel (44, 20): two that agree.
    stage.addPoints(10, new Float32Array([x1, y1, 1, x1, y1, 1, x2, y2, 1, x2, y2, 1]), new Float32Array([0.0, 0.5, 0.3, 0.3]));
    const px = show(stage, [IDENTITY]);
    const mixed = rgbAt(px, texel(x1, y1));
    const agreed = rgbAt(px, texel(x2, y2));
    const spread = (c: readonly number[]): number => Math.max(...c) - Math.min(...c);
    expect(Math.max(...mixed)).toBeGreaterThan(30); // lit, not empty
    expect(spread(mixed)).toBeLessThanOrEqual(2); // r = g = b to within 8-bit rounding
    expect(spread(agreed)).toBeGreaterThan(40); // a real colour
    stage.dispose();
  });

  it("does not draw a chunk that was swept without hues, rather than guessing its colour", () => {
    const stage = mount();
    if (stage === null) return;
    const [x, y] = at(10, 10);
    stage.addPoints(10, new Float32Array([x, y, 1]));
    expect(stage.hasHues()).toBe(false);
    expect(stage.paintEgan({ cx: 0, cy: 0, halfHeight: H }, 1, [IDENTITY], 1, 30)).toBe(false);
    stage.dispose();
  });
});
