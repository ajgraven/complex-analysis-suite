import { describe, it, expect } from "vitest";
import { GlStage, StageUnavailable } from "../src/stage/glStage";
import { RAMPS } from "../src/stage/ramps";
import { buildToneMap } from "../src/stage/tone";
import { sweepChunk } from "../src/engine/sweep";
import { compileAlphabet } from "../src/engine/alphabet";
import { orbitSpace } from "../src/engine/orbits";
import { PLACES, placeById } from "../src/places";
import type { StageTransform } from "../src/stage/glStage";

// **The only place this app's real GLSL is compiled, and the only place the accumulation can be seen at
// all.** The node gate has no WebGL2 context, so a shader that fails to link, a float target the driver
// will not allocate, or an additive blend that silently does not accumulate are all invisible to it — and
// each of the three would leave a blank stage that every node test still passes.

function mountStage(): { stage: GlStage; canvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  document.body.append(canvas);
  const stage = new GlStage(canvas);
  stage.resize(256);
  stage.setRamp(RAMPS.density.stops);
  return { stage, canvas };
}

const IDENTITY: StageTransform[] = [{ neg: false, rev: false, conj: false }];

/** Read the canvas back through a 2D context — what the PNG export and a reader both see. */
function readCanvas(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d");
  if (ctx === null) throw new Error("no 2D context");
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, off.width, off.height).data;
}

function distinctColours(px: Uint8ClampedArray): number {
  const seen = new Set<number>();
  for (let i = 0; i < px.length; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  return seen.size;
}

describe("the stage compiles and accumulates", () => {
  it("builds a WebGL2 context with the float extensions it needs, or refuses BY NAME", () => {
    let stage: GlStage | null = null;
    try {
      const mounted = mountStage();
      stage = mounted.stage;
    } catch (err) {
      // A refusal is a legitimate outcome on a driver without the extensions — but it must be the named
      // one, not a TypeError from reading a property of null.
      expect(err).toBeInstanceOf(StageUnavailable);
      expect(String(err)).toMatch(/WebGL2|float/);
      return;
    }
    expect(stage.gl.getParameter(stage.gl.VERSION)).toContain("WebGL 2");
    expect(["float32", "float16"]).toContain(stage.precision);
    expect(stage.resolution).toBe(256);
    stage.dispose();
  });

  it("ACCUMULATES: two points on the same pixel read brighter than one", () => {
    // The whole picture is this one property. `blendFunc(ONE, ONE)` into a float target is the only way
    // the app counts roots, and a driver that dropped the blend would paint every occupied pixel the same
    // colour — a picture that still looks like a root cloud and carries no density at all.
    const { stage } = mountStage();
    // One point at the origin; three stacked slightly off it.
    stage.addPoints(4, new Float32Array([-0.5, 0, 1, 0.5, 0, 1, 0.5, 0, 1, 0.5, 0, 1]));
    stage.paint({ cx: 0, cy: 0, halfHeight: 1 }, 1, IDENTITY);
    expect(stage.composeDegrees(1, 10)).toBe(true);
    const density = stage.readDensity();
    const values = Array.from(density).filter((d) => d > 0).sort((a, b) => b - a);
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values[0]).toBeCloseTo(3, 4);
    expect(values[1]).toBeCloseTo(1, 4);
    stage.dispose();
  });

  it("paints a real Littlewood sweep, and the picture RESPONDS to the data", () => {
    // **What this asserts, and what the first draft got wrong.** A threshold on the colour count ("more
    // than 30") looked like an anti-flatness check and was a guess: measured, the frame carries 10
    // colours at top degree 10, 15 at 12, 39 at 14 and 145 at 16. That is not a defect — equalising a
    // density that only TAKES a few values gives a few bands, and the density at degree 12 takes 102
    // distinct values over 27,688 occupied pixels with a maximum of 658, where at degree 16 it takes 382
    // with a maximum of 9,080. So the honest claim is the TREND: the tone map is built from the frame's
    // own distribution, so a deeper sweep must use more of the ramp. A fixed transfer curve would not
    // move, and a broken accumulation would not either.
    const compiled = compileAlphabet({ preset: "littlewood" });
    if ("error" in compiled) throw new Error(compiled.error);
    const alphabet = compiled.alphabet;

    const measure = (top: number): { colours: number; occupied: number; max: number } => {
      const { stage, canvas } = mountStage();
      for (let degree = 6; degree <= top; degree++) {
        const swept = sweepChunk({ spec: { preset: "littlewood" }, degree, lo: 0, hi: Infinity, circleDelta: 0.02 });
        if ("error" in swept) throw new Error(swept.error);
        stage.addPoints(degree, swept.points);
      }
      stage.paint({ cx: 0, cy: 0, halfHeight: 1.45 }, 1, alphabet.group);
      expect(stage.composeDegrees(6, top)).toBe(true);
      const density = stage.readDensity();
      const tone = buildToneMap(density);
      expect(tone.occupied).toBe(Array.from(density).filter((d) => d > 0).length);
      stage.setTone(tone.lut, tone.width);
      stage.present({ maxDensity: tone.maxDensity, exposure: 1, byDegree: false, degreeRange: [6, top] });
      const px = readCanvas(canvas);
      const out = { colours: distinctColours(px), occupied: tone.occupied, max: tone.maxDensity };

      // The picture is symmetric about the real axis — the group's own claim, checked in the pixels
      // rather than in the buffer, so it covers the vertex shader's transforms too.
      let asymmetric = 0;
      const w = canvas.width;
      const h = canvas.height;
      for (let y = 0; y < h / 2; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const a = (y * w + x) * 4;
          const b = ((h - 1 - y) * w + x) * 4;
          if (Math.abs(px[a] - px[b]) > 24) asymmetric++;
        }
      }
      expect(asymmetric, `asymmetry at top degree ${top}`).toBeLessThan((w * h) / 9 / 40);

      stage.dispose();
      canvas.remove();
      return out;
    };

    const shallow = measure(10);
    const deep = measure(16);
    // Not flat at either depth.
    expect(shallow.colours).toBeGreaterThan(4);
    // The cloud fills a real part of the frame, and deepens rather than merely spreading.
    expect(shallow.occupied).toBeGreaterThan(2000);
    expect(deep.occupied).toBeGreaterThan(shallow.occupied);
    expect(deep.max).toBeGreaterThan(shallow.max * 10);
    // And the ramp is used far more at depth — the assertion that a fixed transfer curve would fail.
    expect(deep.colours).toBeGreaterThan(shallow.colours * 4);
  });

  it("the reversal image really lands at 1/z", () => {
    // The stage applies the symmetry group in the VERTEX SHADER, so this arithmetic exists twice — once
    // in `mapRoot` for the statistics and once in GLSL for the picture. If they disagreed, the counts and
    // the image would describe different clouds and nothing in the node gate could tell.
    const { stage } = mountStage();
    stage.addPoints(3, new Float32Array([0.25, 0, 1]));
    stage.paint({ cx: 0, cy: 0, halfHeight: 4 }, 1, [
      { neg: false, rev: true, conj: false },
    ]);
    stage.composeDegrees(1, 10);
    const density = stage.readDensity();
    const size = stage.resolution;
    let found = -1;
    for (let i = 0; i < density.length; i++) if (density[i] > 0) found = i;
    expect(found).toBeGreaterThanOrEqual(0);
    const px = found % size;
    const py = Math.floor(found / size);
    // 1/0.25 = 4 is at the right edge of a half-height-4 window; y stays 0 (the middle row).
    const worldX = ((px + 0.5) / size - 0.5) * 8;
    const worldY = ((py + 0.5) / size - 0.5) * 8;
    expect(worldX).toBeCloseTo(4, 1);
    expect(Math.abs(worldY)).toBeLessThan(0.1);
    stage.dispose();
  });

  it("an empty stage presents black rather than failing", () => {
    const { stage, canvas } = mountStage();
    expect(stage.composeDegrees(1, 10)).toBe(false);
    stage.present({ maxDensity: 0, exposure: 1, byDegree: false, degreeRange: [1, 10] });
    const px = readCanvas(canvas);
    expect(distinctColours(px)).toBe(1);
    expect(px[0]).toBe(0);
    stage.dispose();
  });

  it("dropOutside keeps the scrub's degrees and forgets the rest", () => {
    const { stage } = mountStage();
    for (const d of [3, 4, 5, 6]) stage.addPoints(d, new Float32Array([0.1 * d, 0, 1]));
    expect(stage.loadedDegrees()).toEqual([3, 4, 5, 6]);
    stage.dropOutside(4, 5);
    expect(stage.loadedDegrees()).toEqual([4, 5]);
    stage.dispose();
  });
});

describe("a named place renders a picture, not a black screen", () => {
  /** Fraction of the canvas carrying any ink, at a given window round a place's centre. */
  function litFraction(spec: Parameters<typeof compileAlphabet>[0], degrees: [number, number], cx: number, cy: number, halfHeight: number): number {
    const compiled = compileAlphabet(spec);
    if ("error" in compiled) throw new Error(compiled.error);
    const alphabet = compiled.alphabet;
    const { stage, canvas } = mountStage();
    for (let degree = degrees[0]; degree <= degrees[1]; degree++) {
      const space = orbitSpace(alphabet, degree);
      const swept = sweepChunk({ spec, degree, lo: 0, hi: space.total, circleDelta: 0.02 });
      if ("error" in swept) throw new Error(swept.error);
      stage.addPoints(degree, swept.points);
    }
    stage.paint({ cx, cy, halfHeight }, canvas.width / canvas.height, alphabet.group);
    stage.composeDegrees(degrees[0], degrees[1]);
    const density = stage.readDensity();
    const tone = buildToneMap(density);
    stage.setTone(tone.lut, tone.width);
    stage.present({ maxDensity: tone.maxDensity, exposure: 1, byDegree: false, degreeRange: degrees });
    const px = readCanvas(canvas);
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 24) lit++;
    stage.dispose();
    canvas.remove();
    return lit / (px.length / 4);
  }

  it("the ω neighbourhood is visible, and the window it used to have is NOT", () => {
    // **The defect this is the regression test for.** The hexahole place first opened at half-height
    // 0.008 — CKW's own picture width — where the trinary cloud of bounded degree lands 1,610 roots in
    // 730,000 pixels: measured in a browser, 0.05% lit and TWO distinct colours, which is a black screen
    // with a scatter of dots. The node places test passed it, because "are there roots in this window"
    // and "is there a picture" are different questions and only a rendered frame answers the second.
    //
    // The pairing is what makes the floor mean something: the same alphabet, degrees and centre at the
    // two window sizes, with the wide one above the floor and the tight one below it. A floor that both
    // cleared would be asserting nothing.
    const place = placeById("hexaholes");
    expect(place).toBeDefined();
    if (place === undefined) return;
    const degrees: [number, number] = [8, 12]; // what this suite can afford; the app loads 8–16
    const wide = litFraction(place.state.alphabet, degrees, place.state.cx, place.state.cy, place.state.halfHeight);
    const tight = litFraction(place.state.alphabet, degrees, place.state.cx, place.state.cy, 0.008);
    expect(tight).toBeLessThan(0.004);
    expect(wide).toBeGreaterThan(0.004);
    expect(wide).toBeGreaterThan(tight * 8);
  });

  it("every place's window is at least as wide as the one that rendered black", () => {
    // Cheap and structural: nothing in the gallery may be tighter than the window measured above to be
    // unviewable at its own alphabet. A place that needs a tighter window needs PR-2's limit-set engine,
    // which is what that milestone's gate already names.
    for (const p of PLACES) {
      expect(p.state.halfHeight, p.id).toBeGreaterThanOrEqual(0.02);
    }
  });
});
