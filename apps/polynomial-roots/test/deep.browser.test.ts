import { describe, it, expect } from "vitest";
import { GlStage, StageUnavailable } from "../src/stage/glStage";
import { DeepPass, DEEP_STRIDE } from "../src/stage/deepPass";
import { LimitPass } from "../src/stage/limitPass";
import { RAMPS } from "../src/stage/ramps";
import { buildToneMap } from "../src/stage/tone";
import { compileAlphabet } from "../src/engine/alphabet";
import { packFrame, runReference } from "../src/engine/deep/reference";
import { placeById } from "../src/places";
import { centreNumbers } from "../src/state";

// The deep pass's GLSL is compiled nowhere else, and neither is the claim the whole engine rests on:
// that an OFFSET survives float32 at a depth an absolute position does not.

const LITTLEWOOD = { preset: "littlewood" } as const;
const STORY_CX = "4.206512041286740015298812143756041e-1";
const STORY_CY = "4.8372964222232227103378339664795e-1";

interface Mounted {
  stage: GlStage;
  pass: DeepPass;
  canvas: HTMLCanvasElement;
  size: number;
}

function mount(size = 128): Mounted | null {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  document.body.append(canvas);
  let stage: GlStage;
  try {
    stage = new GlStage(canvas);
  } catch (err) {
    expect(err).toBeInstanceOf(StageUnavailable);
    return null;
  }
  stage.resize(size);
  stage.setRamp(RAMPS.density.stops);
  return { stage, pass: new DeepPass(stage.gl), canvas, size: stage.resolution };
}

/** Splat and read the density back. */
function splat(m: Mounted, points: Float32Array, halfHeight: number, aspect = 1): Float32Array {
  const target = m.stage.compositeTarget();
  m.pass.render(target.framebuffer, target.size, { points, halfHeight, aspect, pointSize: 4 });
  return m.stage.readDensity();
}

describe("the deep splat", () => {
  it("places a point by its OFFSET, with no centre anywhere in the shader", () => {
    const m = mount(64);
    if (m === null) return;
    const h = 1e-30;
    // One root at the centre, one at the right edge, one at the top.
    // `[dx, dy, weight, degree, |P′|, residual]` — the frame's own layout, which is the pass's too.
    const points = new Float32Array([0, 0, 1, 20, 1, 0, h * 0.9, 0, 1, 20, 1, 0, 0, h * 0.9, 1, 20, 1, 0]);
    expect(points.length).toBe(3 * DEEP_STRIDE);
    expect(DEEP_STRIDE).toBe(6);
    const density = splat(m, points, h);
    const at = (i: number, j: number): number => density[j * m.size + i];
    const half = m.size / 2;
    expect(at(half, half), "the centre").toBeGreaterThan(0);
    expect(at(m.size - 3, half), "the right edge").toBeGreaterThan(0);
    expect(at(half, m.size - 3), "the top").toBeGreaterThan(0);
    // And nothing where nothing was put.
    expect(at(4, 4)).toBe(0);
    m.pass.dispose();
    m.stage.dispose();
  });

  it("draws a 10⁻³⁰ view as a PICTURE, which an absolute float32 position could not", () => {
    // The milestone in one test. A float32 cannot tell the centre of this view from its edge — the whole
    // window is one float32 — so a shader handed absolute positions would draw every root in one texel.
    // Handed offsets it draws the picture.
    const m = mount(128);
    if (m === null) return;
    const halfHeight = 1e-30;
    const r = Math.hypot(Number(STORY_CX), Number(STORY_CY));
    const depth = Math.ceil(Math.log(halfHeight * 1.85) / Math.log(r)) + 4;
    const run = runReference({
      alphabet: LITTLEWOOD,
      cx: STORY_CX,
      cy: STORY_CY,
      halfHeight,
      aspect: 1.55,
      depth,
      precision: "dd",
    });
    if ("error" in run) throw new Error(run.error);
    const frame = packFrame(run);
    expect(frame.count).toBeGreaterThan(1000);
    // Every absolute position in this view rounds to the SAME float32; every offset does not.
    const absolutes = new Set(run.roots.map((root) => `${Math.fround(Number(STORY_CX) + root.dx)},${Math.fround(Number(STORY_CY) + root.dy)}`));
    const offsets = new Set(run.roots.map((root) => `${Math.fround(root.dx)},${Math.fround(root.dy)}`));
    expect(absolutes.size, "float32 sees this whole view as ONE point").toBe(1);
    // 140 distinct points from 2,223 polynomials: if `P` is Littlewood with a root here, so is
    // `P·(1 + z^(d+1))`, and so on for ever — the degrees run 26, 53, 80, 107, 134. What matters here is
    // that float32 resolves all 140 as OFFSETS and exactly one of them as an absolute position.
    expect(offsets.size, "and as this many, once the centre is taken out").toBeGreaterThan(100);
    expect(frame.distinct).toBe(offsets.size);

    const density = splat(m, frame.points, halfHeight, 1.55);
    let lit = 0;
    for (const v of density) if (v > 0) lit++;
    // Measured: a 1e-30 frame of the zoom story's root lights about 3% of a 128² grid.
    expect(lit, "the deep frame is blank").toBeGreaterThan(200);
    expect(lit, "the deep frame is a smear, not a scatter").toBeLessThan(density.length / 2);

    const tone = buildToneMap(density, 1, 1);
    m.stage.setTone(tone.lut, tone.width);
    m.stage.present({ maxDensity: tone.maxDensity, exposure: 1, byDegree: false, degreeRange: [0, 1] });
    const px = readCanvas(m.canvas);
    const seen = new Set<number>();
    for (let i = 0; i < px.length; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    expect(seen.size, "the deep frame renders flat").toBeGreaterThan(8);
    m.pass.dispose();
    m.stage.dispose();
  });

  it("every deep root lands where the limit-set engine says the set is", () => {
    // PR-2's inclusion, one engine further down: at a view both can draw, a polynomial with a root here
    // means a power series can vanish here, so every texel the reference walk lights must be in the
    // limit shader's in-set region. The two share the pruning rule and nothing else — one runs per
    // pixel in float32 GLSL, the other once on the CPU and solves what survives.
    const m = mount(128);
    if (m === null) return;
    const alphabet = compileAlphabet(LITTLEWOOD);
    if ("error" in alphabet) throw new Error(alphabet.error);
    const halfHeight = 1e-4;
    const aspect = 1;
    const depth = 40;
    const centre = { cx: Number(STORY_CX), cy: Number(STORY_CY) };

    const limit = new LimitPass(m.stage.gl);
    const target = m.stage.compositeTarget();
    limit.render(target.framebuffer, target.size, {
      view: { ...centre, halfHeight },
      aspect,
      alphabet: alphabet.alphabet,
      depth,
      annulus: false,
    });
    const reach = m.stage.readDensity();

    const run = runReference({
      alphabet: LITTLEWOOD,
      cx: STORY_CX,
      cy: STORY_CY,
      halfHeight,
      aspect,
      depth: 24,
      precision: "float64",
    });
    if ("error" in run) throw new Error(run.error);
    expect(run.roots.length).toBeGreaterThan(50);

    let outside = 0;
    for (const root of run.roots) {
      const i = Math.floor(((root.dx / (halfHeight * aspect) + 1) / 2) * m.size);
      const j = Math.floor(((root.dy / halfHeight + 1) / 2) * m.size);
      if (i < 0 || j < 0 || i >= m.size || j >= m.size) continue;
      if (reach[j * m.size + i] !== depth + 1) outside++;
    }
    expect(outside, "roots the limit-set engine does not cover").toBe(0);
    limit.dispose();
    m.pass.dispose();
    m.stage.dispose();
  });

  it("the deep place renders, and is not the black screen PR-1 shipped", () => {
    const m = mount(128);
    if (m === null) return;
    const place = placeById("deep-zoom-story");
    if (place === undefined) throw new Error("the deep place is gone");
    const r = Math.hypot(...Object.values(centreNumbers(place.state)));
    const depth = Math.ceil(Math.log(place.state.halfHeight * 1.85) / Math.log(r)) + 4;
    const run = runReference({
      alphabet: place.state.alphabet,
      cx: place.state.cx,
      cy: place.state.cy,
      halfHeight: place.state.halfHeight,
      aspect: 1.55,
      depth,
      precision: "dd",
    });
    if ("error" in run) throw new Error(run.error);
    const density = splat(m, packFrame(run).points, place.state.halfHeight, 1.55);
    const tone = buildToneMap(density, 1, 1);
    m.stage.setTone(tone.lut, tone.width);
    m.stage.present({ maxDensity: tone.maxDensity, exposure: 1, byDegree: false, degreeRange: [0, 1] });
    const px = readCanvas(m.canvas);
    let bright = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 24) bright++;
    expect(bright / (px.length / 4), "the deep place renders black").toBeGreaterThan(0.005);
    m.pass.dispose();
    m.stage.dispose();
  });
});

function readCanvas(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d");
  if (ctx === null) throw new Error("no 2D context");
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, off.width, off.height).data;
}
