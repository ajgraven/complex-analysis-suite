import { describe, it, expect } from "vitest";
import { GlStage, NEUTRAL_EXCLUDED, StageUnavailable } from "../src/stage/glStage";
import { LimitPass } from "../src/stage/limitPass";
import { RAMPS } from "../src/stage/ramps";
import { buildToneMap } from "../src/stage/tone";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet } from "../src/engine/alphabet";
import { walkAt, walkSpec } from "../src/engine/limit/walk";
import { STATUS_EXCLUDED, STATUS_EXHAUSTED } from "../src/engine/limit/walkGlsl";
import { placeById } from "../src/places";
import "../src/styles/app.css";

// **The only place the generated walk shader is compiled at all.** `walkGlsl.test.ts` checks what the
// generator writes; nothing in the node gate can check that a driver accepts it — an explicit stack of
// `vec2 sm[D + 1]` with dynamic indexing, a loop bound in the tens of thousands, and a `const vec2[]`
// the fragment shader indexes by a runtime value are each a thing a compiler may refuse. And the parity
// against the float64 walk can only be run here, because one half of it is GLSL.

const compile = (spec: Parameters<typeof compileAlphabet>[0]): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

interface Mounted {
  stage: GlStage;
  pass: LimitPass;
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
  return { stage, pass: new LimitPass(stage.gl), canvas, size: stage.resolution };
}

/** Render one limit-set frame and read the escape depth back, one entry per texel, row 0 at the bottom. */
function renderReach(m: Mounted, alphabet: Alphabet, view: { cx: number; cy: number; halfHeight: number }, depth: number, annulus = false): Float32Array {
  const target = m.stage.compositeTarget();
  m.pass.render(target.framebuffer, target.size, { view, aspect: 1, alphabet, depth, annulus });
  return m.stage.readDensity();
}

describe("the shell's own stylesheet", () => {
  it("actually hides a hidden row", () => {
    // `[hidden]` is a UA rule and `.row { display: grid }` is an author rule, so the class won and four
    // rows the shell hides were on screen — the depth slider and the band toggle under the root engine,
    // and, since PR-1, the `n` spinner and the custom-alphabet box under every preset that has neither.
    // jsdom cannot decide this and neither can the node gate; a real cascade can.
    const row = document.createElement("div");
    row.className = "row";
    row.hidden = true;
    document.body.append(row);
    expect(getComputedStyle(row).display).toBe("none");
    row.hidden = false;
    expect(getComputedStyle(row).display).toBe("grid");
    row.remove();
  });
});

describe("the generated walk shader", () => {
  it("compiles and links for every preset the app offers", () => {
    // Nine programs the node gate structurally cannot build. A generated shader that a driver rejects
    // would reach the reader as a blank stage inside the fatal boundary, and no other test would fail.
    const m = mount(64);
    if (m === null) return;
    for (const spec of [
      { preset: "littlewood" },
      { preset: "zero-one" },
      { preset: "trinary" },
      { preset: "range", n: 2 },
      { preset: "range", n: 9 },
      { preset: "roots-of-unity", n: 3 },
      { preset: "roots-of-unity", n: 12 },
      { preset: "custom", custom: "1, -1, i, -i" },
      { preset: "custom", custom: "1, 0.5+0.5i, -1" },
    ] as const) {
      const reach = renderReach(m, compile(spec), { cx: 0, cy: 0, halfHeight: 1.45 }, 20);
      expect(reach.length, JSON.stringify(spec)).toBe(m.size * m.size);
      let lit = 0;
      for (const v of reach) if (v > 0) lit++;
      expect(lit, `${JSON.stringify(spec)} drew nothing`).toBeGreaterThan(50);
    }
    // One program per (alphabet, depth), cached — a slider drag must not recompile.
    expect(m.pass.cached).toBe(9);
    renderReach(m, compile({ preset: "littlewood" }), { cx: 0, cy: 0, halfHeight: 1.45 }, 20);
    expect(m.pass.cached).toBe(9);
    renderReach(m, compile({ preset: "littlewood" }), { cx: 0, cy: 0, halfHeight: 1.45 }, 21);
    expect(m.pass.cached).toBe(10);
    m.pass.dispose();
    m.stage.dispose();
  });

  it("agrees with the float64 walk, texel for texel", () => {
    // The two are the same algorithm written twice — same prologue, same stack, same order of the prune
    // and the cap test — so what is being measured here is the arithmetic width and nothing else. Every
    // texel is compared, and the disagreements are counted rather than tolerated in bulk.
    const m = mount(128);
    if (m === null) return;
    const cases = [
      ["littlewood overview", { preset: "littlewood" }, { cx: 0, cy: 0, halfHeight: 1.45 }, 22],
      ["the dragon", { preset: "littlewood" }, { cx: 0.372, cy: -0.542, halfHeight: 0.075 }, 26],
      ["Bandt's M", { preset: "trinary" }, { cx: 0, cy: 0, halfHeight: 1.0 }, 20],
      ["{0,1}", { preset: "zero-one" }, { cx: 0, cy: 0, halfHeight: 1.45 }, 22],
    ] as const;
    let total = 0;
    let differing = 0;
    let classDiffering = 0;
    for (const [name, spec, view, depth] of cases) {
      const alphabet = compile(spec);
      const gpu = renderReach(m, alphabet, view, depth);
      const cpuSpec = walkSpec(alphabet);
      const half = view.halfHeight;
      const pixelRadius = half / m.size;
      let caseDiffering = 0;
      let caseLit = 0;
      for (let j = 0; j < m.size; j++) {
        for (let i = 0; i < m.size; i++) {
          const x = view.cx + half * ((2 * (i + 0.5)) / m.size - 1);
          const y = view.cy + half * ((2 * (j + 0.5)) / m.size - 1);
          const absz = Math.hypot(x, y);
          const folded = absz > 1 ? 1 / absz : absz;
          const gap = Math.max(1 - Math.min(folded, 1 - 1e-6), 1e-6);
          const eps = (pixelRadius * cpuSpec.maxAbs) / (gap * gap);
          const cpu = walkAt(cpuSpec, x, y, { depth, eps });
          const at = j * m.size + i;
          const got = gpu[at];
          if (cpu.excluded) {
            expect(got, `${name} excluded at ${i},${j}`).toBe(STATUS_EXCLUDED);
            continue;
          }
          if (cpu.exhausted || got === STATUS_EXHAUSTED) continue;
          total++;
          if (cpu.reach === depth + 1) caseLit++;
          if (got !== cpu.reach) {
            caseDiffering++;
            const gpuIn = got === depth + 1;
            const cpuIn = cpu.reach === depth + 1;
            if (gpuIn !== cpuIn) classDiffering++;
          }
        }
      }
      expect(caseLit, `${name} has nothing in the set`).toBeGreaterThan(200);
      differing += caseDiffering;
      expect(caseDiffering, name).toBe(0);
    }
    // **Measured: 46,532 texels compared, ZERO disagreements** — 5,704 / 6,996 / 3,352 / 2,400 of them
    // in the set on the four views. So the assertion is equality and not a tolerance, and it is worth
    // saying why float32 is enough: `reach` is a DISCRETE quantity decided by `|s_k| > tail + ε`, and
    // float32 can only move it where that comparison is within ~1e-7 of a tie, which on a grid of
    // 46,532 sample points it never was. A disagreement here is a finding to be reproduced and
    // explained, not a number to widen this line by.
    expect(differing).toBe(0);
    expect(classDiffering).toBe(0);
    expect(total).toBeGreaterThan(40000);

    // And the comparison has to be able to fail. Reading the same frame against the walk one level
    // shallower must disagree, or the loop above would be asserting that two things it never compared
    // are equal.
    const alphabet = compile({ preset: "littlewood" });
    const gpu = renderReach(m, alphabet, { cx: 0, cy: 0, halfHeight: 1.45 }, 22);
    const cpuSpec = walkSpec(alphabet);
    let wrongDepthDiffering = 0;
    for (let j = 0; j < m.size; j += 4) {
      for (let i = 0; i < m.size; i += 4) {
        const x = 1.45 * ((2 * (i + 0.5)) / m.size - 1);
        const y = 1.45 * ((2 * (j + 0.5)) / m.size - 1);
        const cpu = walkAt(cpuSpec, x, y, { depth: 21, eps: (1.45 / m.size) * cpuSpec.maxAbs });
        if (!cpu.excluded && gpu[j * m.size + i] !== cpu.reach) wrongDepthDiffering++;
      }
    }
    expect(wrongDepthDiffering).toBeGreaterThan(50);
    m.pass.dispose();
    m.stage.dispose();
  });

  it("paints an uncomputed texel differently from an empty one", () => {
    // Three statements, three colours: black is "walked, nothing found", the cool neutral is "not
    // walked", the warm one is "walked and ran out". A picture that painted the band black would be
    // claiming the roots are not dense where Bousch proved they are.
    const m = mount(128);
    if (m === null) return;
    const alphabet = compile({ preset: "littlewood" });
    const off = renderReach(m, alphabet, { cx: 0, cy: 0, halfHeight: 1.45 }, 20, false);
    let excluded = 0;
    for (const v of off) if (v === STATUS_EXCLUDED) excluded++;
    expect(excluded).toBeGreaterThan(1000);

    const on = renderReach(m, alphabet, { cx: 0, cy: 0, halfHeight: 1.45 }, 20, true);
    let stillExcluded = 0;
    for (const v of on) if (v === STATUS_EXCLUDED) stillExcluded++;
    expect(stillExcluded).toBe(0);

    // And on screen. The read-back is a COPY and the composite is live state, so the band-walked frame
    // above has to be drawn over before the band-excluded one can be presented — the first draft
    // presented the wrong frame and measured zero neutral pixels, correctly.
    renderReach(m, alphabet, { cx: 0, cy: 0, halfHeight: 1.45 }, 20, false);
    const tone = buildToneMap(off, 1, 1);
    m.stage.setTone(tone.lut, tone.width);
    m.stage.present({ maxDensity: tone.maxDensity, exposure: 1, byDegree: false, degreeRange: [0, 21] });
    const px = readCanvas(m.canvas);
    const seen = new Set<number>();
    for (let i = 0; i < px.length; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    // `reach` is an integer in `0 … depth + 1`, so the ramp has at most that many steps to hand out;
    // measured at 15 distinct colours over this frame, which is what a stepped quantity looks like.
    expect(seen.size).toBeGreaterThan(10);
    // The excluded neutral is on screen, and it is neither black nor anything the ramp produces.
    const neutral = NEUTRAL_EXCLUDED.map((c) => Math.round(c * 255));
    let neutralPixels = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i] - neutral[0]) <= 1 && Math.abs(px[i + 1] - neutral[1]) <= 1 && Math.abs(px[i + 2] - neutral[2]) <= 1) {
        neutralPixels++;
      }
    }
    expect(neutralPixels, "the excluded band is not painted its own colour").toBeGreaterThan(5000);
    expect(neutral[0] + neutral[1] + neutral[2]).toBeGreaterThan(90);
    m.pass.dispose();
    m.stage.dispose();
  });

  it("the hexahole is VISIBLE on screen, not merely present in the buffer", () => {
    // PR-1's own lesson, applied to this engine: "are there roots in this window" and "is there a
    // picture" are different questions, and only a rendered frame answers the second. The pairing is the
    // place's window against the same centre one depth step shallower, where the hole has not opened —
    // a floor both cleared would assert nothing.
    const m = mount(128);
    if (m === null) return;
    const place = placeById("hexaholes");
    if (place === undefined) throw new Error("the hexahole place is gone");
    const alphabet = compile(place.state.alphabet);
    const view = { cx: place.state.cx, cy: place.state.cy, halfHeight: place.state.halfHeight };

    const darkFraction = (depth: number): number => {
      const reach = renderReach(m, alphabet, view, depth);
      const tone = buildToneMap(reach, 1, 1);
      m.stage.setTone(tone.lut, tone.width);
      m.stage.present({ maxDensity: tone.maxDensity, exposure: 1, byDegree: false, degreeRange: [0, depth + 1] });
      const px = readCanvas(m.canvas);
      let dark = 0;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        n++;
        if (px[i] + px[i + 1] + px[i + 2] < 90) dark++;
      }
      return dark / n;
    };
    const deep = darkFraction(place.state.depth);
    const shallow = darkFraction(12);
    expect(deep, "the hole is not dark on screen").toBeGreaterThan(0.005);
    expect(shallow, "the hole is open at a depth where it should be closed").toBeLessThan(deep / 3);
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
