// **THE CUT, ON THE STAGE** — the pixels behind `cutStage.test.ts`.
//
// Two things the node gate structurally cannot see, and both of them shipped:
//
//  1. A gallery record's branch CUT was not drawn at all. `stageView` read `ShellState.branch`,
//     which is the SANDBOX's system, so all seven tier-D records mounted with no hatched curve, no
//     `J = …` label and no admissibility colour — the only trace of D7's dogbone or D1's keyhole
//     being the colour seam.
//  2. The GPU cut-correction layer was dead. `uCutCount` was written as a literal 0 and the segment
//     uniforms were not even in the location list, so `cutParity.browser.test.ts` had been gating a
//     shader path the app never ran: a dragged cut moved the hatching and left the phase seam where
//     it was, and shadow-cut mode swung the drawn rays while the portrait did not move at all.
//
// The claims here are about the CANVAS in both cases — ink pixels in the cut's own colour, and the
// portrait's own colour at points the CPU twin says the correction moved.
import { afterEach, describe, expect, it } from "vitest";
import "katex/dist/katex.min.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

import { COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";
import { mountShell2 } from "../src/shell/app.js";
import { CUT_GLSL, MAX_CUT_SEGMENTS_GLSL } from "../src/ui/stage/cut.glsl.js";
import { PHASE_VERT } from "../src/ui/stage/phase.glsl.js";
import { compile, defaultState, offeredCorpus, resolveState, type ShellState } from "../src/shell/state.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { stageCuts } from "../src/shell/stageView.js";
import { cutCorrection, type CutSegment } from "../src/kernel/branch/correction.js";
import { DARK_INK } from "../src/ui/inkTheme.js";
import { plotToScreen } from "../src/kernel/camera.js";
import type { Cx } from "../src/kernel/geom.js";

const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  // A shell writes `#vs=` 250 ms after its last change and the next mount reads it at boot, so one
  // test's parting state is the next one's subject unless the address bar is put back.
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

/** Every record that declares a branch factor — derived, never a literal seven. */
const BRANCH_RECORDS = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .filter((f) => f.branch !== undefined)
  .map((f) => f.id);

const settle = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 150));
};

function mount(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  try {
    window.localStorage.clear();
  } catch {
    /* nothing to clear */
  }
  const app = mountShell2(root);
  mounted.push(app);
  return { root, app };
}

const canvasOf = (root: Element, which: "gl" | "ink"): HTMLCanvasElement => {
  const c = root.querySelector<HTMLCanvasElement>(`canvas.${which}`);
  if (c === null) throw new Error(`no ${which} canvas`);
  return c;
};

/** A canvas's pixels, through an offscreen copy — the GL one yields no 2-D context of its own. */
function pixels(c: HTMLCanvasElement): { data: Uint8ClampedArray; width: number; height: number } {
  const copy = document.createElement("canvas");
  copy.width = c.width;
  copy.height = c.height;
  const ctx = copy.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context to read with");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * How many ink pixels are the CUT's own colour.
 *
 * `cutInk` is a purple nothing else on this canvas uses — `inkTheme.ts` says so directly ("a piece
 * colour names a piece, `cutInk` a barrier"), and the branch handles are deliberately the same
 * purple because they are marks ON the cut system. So zero means the cut system is not on the stage
 * at all, which is what shipped, and a count above zero cannot be bought by the contour, the poles
 * or the axes. The window is tight enough that `refusedInk`'s amber is nowhere near it.
 */
function cutInkPixels(root: Element): number {
  const [r0, g0, b0] = hexRgb(DARK_INK.cutInk);
  const { data } = pixels(canvasOf(root, "ink"));
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) <= 24) n += 1;
  }
  return n;
}

describe("a record's own branch cut reaches the stage", () => {
  it("draws it in the cut's colour for every tier-D record, and not for a record without one", async () => {
    const { root, app } = mount();
    await settle();

    // **The control comes first**, and it is a record with no branch at all: were the count below
    // bought by the contour, the handles or the axes it would be non-zero here too.
    app.applyState({ ...app.currentState(), mode: "gallery", record: "semicircle-quartic", fixture: 0 });
    await settle();
    expect(cutInkPixels(root), "a record with no branch drew something in the cut's colour").toBe(0);

    for (const id of BRANCH_RECORDS) {
      app.applyState({ ...app.currentState(), mode: "gallery", record: id, fixture: 0 });
      await settle();
      // Not "more ink" — ink in the CUT's colour, which nothing else on this canvas draws in.
      // Measured across the seven: 63 (keyhole-two-poles) to 187 (mellin-keyhole). It is a hairline
      // with a halo under it and the contour drawn over it, so the floor is well under the smallest
      // of them and still two orders above the control's zero.
      expect({ id, drew: cutInkPixels(root) > 40 }).toEqual({ id, drew: true });
    }
  }, 120000);
});

// ── the correction, on the GPU ────────────────────────────────────────────────────────────────

/** `cutFactor(z)` on the real GLSL, with a cut system uploaded — `cutParity.browser.test.ts`'s harness. */
function cutFactorAt(segments: readonly CutSegment[], base: Cx, samples: readonly Cx[]): Float32Array[] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float unavailable");
  const frag = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uZ;
${COMPLEX_SINGLE_GLSL}
${CUT_GLSL}
void main() { fragColor = vec4(cutFactor(uZ), 0.0, 1.0); }
`;
  const program = createProgram(gl, PHASE_VERT, frag);
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(program);
    const flat = new Float32Array(MAX_CUT_SEGMENTS_GLSL * 4);
    const jumps = new Float32Array(MAX_CUT_SEGMENTS_GLSL);
    const n = Math.min(segments.length, MAX_CUT_SEGMENTS_GLSL);
    for (let j = 0; j < n; j++) {
      flat[4 * j] = segments[j].a[0];
      flat[4 * j + 1] = segments[j].a[1];
      flat[4 * j + 2] = segments[j].b[0];
      flat[4 * j + 3] = segments[j].b[1];
      jumps[j] = segments[j].jump;
    }
    gl.uniform1i(gl.getUniformLocation(program, "uCutCount"), n);
    gl.uniform2f(gl.getUniformLocation(program, "uCutBase"), base[0], base[1]);
    gl.uniform4fv(gl.getUniformLocation(program, "uCutSeg"), flat);
    gl.uniform1fv(gl.getUniformLocation(program, "uCutJump"), jumps);
    const uZ = gl.getUniformLocation(program, "uZ");
    const out: Float32Array[] = [];
    for (const z of samples) {
      gl.uniform2f(uZ, z[0], z[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      out.push(px);
    }
    return out;
  } finally {
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);
  }
}

describe("Γ equal to the reference leaves the portrait alone", () => {
  const VIEW = { center: [0.4, 0] as [number, number], halfHeight: 3 };
  const VP = { width: 600, height: 400 };
  const SAMPLES: Cx[] = [];
  for (let k = 0; k < 48; k++) SAMPLES.push([2.7 * Math.cos(k * 0.53) + 0.31, 2.7 * Math.sin(k * 0.53) - 0.11]);

  const galleryState = (record: string): ShellState => ({
    ...defaultState(circleTemplate([0, 0], 1.5)),
    mode: "gallery",
    record,
    fixture: 0,
  });

  it("returns a factor of 1 at every sample, for every tier-D record", () => {
    // The claim that makes wiring the upload safe: a record's declared cut geometry IS its window
    // rays, so the arcs at `+J` and the rays at `−α` cancel term by term, the correction is an
    // integer, and `exp(2πi·integer)` is 1. Nothing a reader has not dragged can move.
    //
    // **The floor is `sin`/`cos`, not float32** — `cutParity.browser.test.ts`'s own finding. GLSL ES
    // 3.0 §4.5.1 allows an ABSOLUTE `2^-11` on both, four orders looser than float32's eps, so an
    // integer correction of 1 — D6, whose bounded cut and window rays are DIFFERENT geometry —
    // arrives through `cos(2π)` and is not bit-exactly 1. The bound is that allowance and not a
    // fitted number.
    const BOUND = Math.SQRT2 * 2 ** -11;
    let worst = 0;
    let checked = 0;
    for (const id of BRANCH_RECORDS) {
      const state = galleryState(id);
      const cuts = stageCuts(state, resolveState(state, compile(state.expr)), VIEW, VP);
      if (cuts.segments.length === 0) continue; // a log record corrects nothing — see the node test
      checked += 1;
      for (const px of cutFactorAt(cuts.segments, cuts.base, SAMPLES)) {
        worst = Math.max(worst, Math.hypot(px[0] - 1, px[1]));
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
    expect({ worst, under: worst < BOUND }).toEqual({ worst, under: true });
  });

  it("and is FAR from 1 once a cut is dragged off its window ray — or the claim above is empty", () => {
    // The anti-vacuity clause: a half-turn jump is `exp(iπ) = −1`, a distance of 2 from 1, four
    // orders above the bound above. A correction nobody could measure would satisfy both.
    const segments: CutSegment[] = [
      { a: [0, 0], b: [0, 40], jump: 0.5 },
      { a: [0, 0], b: [40, 0], jump: -0.5 },
    ];
    const got = cutFactorAt(segments, [0.3, -2], [[2, 0.5]]);
    expect(Math.hypot(got[0][0] - 1, got[0][1])).toBeGreaterThan(1.5);
  });
});

// ── the seam, in the app ──────────────────────────────────────────────────────────────────────

describe("the phase seam follows the cut that is drawn", () => {
  /**
   * A declared sandbox keyhole, with the lamp moved OFF the branch point.
   *
   * The base point starts at the origin, which is where the keyhole template puts its branch point —
   * and a correction counts PROPER crossings of `[z₀, z]`, so with `z₀` on the cut's own endpoint
   * nothing crosses anything and the correction is identically zero whatever the cuts do. M4.7d
   * recorded the same default as the reason shadow mode refused on its first click.
   */
  async function declaredKeyhole(): Promise<{ root: HTMLElement; app: ReturnType<typeof mountShell2> }> {
    const { root, app } = mount();
    await settle();
    app.actions().toSandbox();
    app.actions().setExpr("z^(-0.5)/(1+z)");
    app.actions().setTemplate("keyhole");
    const pointId = app.currentState().branch.points[0].id;
    app.actions().declare(pointId);
    app.actions().setExpr("1/(1+z)");
    app.applyState({
      ...app.currentState(),
      branch: { ...app.currentState().branch, basePoint: [0.3, -2] },
      view: { center: [0, 0], halfHeight: 3 },
    });
    await settle();
    return { root, app };
  }

  /** The portrait's colour at a point of the plane, read out of the GL canvas. */
  function colourAt(root: Element, app: ReturnType<typeof mountShell2>, z: Cx): [number, number, number] {
    const host = root.querySelector<HTMLElement>("div.stage2");
    if (host === null) throw new Error("no stage host");
    const gl = canvasOf(root, "gl");
    const vp = { width: host.clientWidth, height: host.clientHeight };
    const dpr = gl.width / Math.max(vp.width, 1);
    const [sx, sy] = plotToScreen(z[0], z[1], app.currentState().view, vp);
    const { data, width } = pixels(gl);
    const i = 4 * (Math.round(sy * dpr) * width + Math.round(sx * dpr));
    return [data[i], data[i + 1], data[i + 2]];
  }

  const apart = (a: readonly number[], b: readonly number[]): number =>
    Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

  /** What the CPU twin says the correction is at `z`, for the state the app is holding. */
  function correctionAt(app: ReturnType<typeof mountShell2>, z: Cx): number {
    const state = app.currentState();
    const cuts = stageCuts(state, resolveState(state, compile(state.expr)), state.view, { width: 600, height: 400 });
    return cutCorrection(z, cuts.base, cuts.segments);
  }

  /** Where the correction moves when the keyhole's ray is swung up, and where it does not. */
  const MOVED: Cx = [2, 0.6];
  const STILL: Cx = [-2, 0.6];

  it("MOVES the colour where the determination moved, and leaves it where it did not", async () => {
    const { root, app } = await declaredKeyhole();
    // At rest the drawn cut IS the window ray, so the correction is zero everywhere: this is the
    // picture `casDeclared` draws on its own, and the two probe points start in it.
    expect(correctionAt(app, MOVED)).toBe(0);
    expect(correctionAt(app, STILL)).toBe(0);
    const before = { moved: colourAt(root, app, MOVED), still: colourAt(root, app, STILL) };

    // The drag: one cut vertex, which is exactly what `branchHandles` offers per `cut.via` entry.
    const branch = app.currentState().branch;
    app.actions().setBranch({
      ...branch,
      cuts: branch.cuts.map((c) => ({ ...c, via: [[0, 4] as Cx] })),
    });
    await settle();

    // **The CPU twin decides which point is which**, so neither probe is a hand-placed guess: one
    // is a point the swung ray now separates from the lamp, the other is not.
    expect(Math.abs(correctionAt(app, MOVED))).toBeCloseTo(0.5, 12);
    expect(correctionAt(app, STILL)).toBe(0);

    const after = { moved: colourAt(root, app, MOVED), still: colourAt(root, app, STILL) };
    // A half-turn on `z^{-1/2}` is a factor of `−1`: the phase moves by π and the hue by half the
    // wheel. 40/255 is far below what that costs and far above the ramp's own quantisation.
    expect(apart(before.moved, after.moved)).toBeGreaterThan(40);
    // And the far side of the plane is untouched — which is what makes the line above about the
    // CUT rather than about the stage having been redrawn at all.
    expect(apart(before.still, after.still)).toBeLessThanOrEqual(2);
  }, 60000);

  it("SWINGS with the lamp in shadow-cut mode, which is the same wiring seen from the other end", async () => {
    // Shadow mode derives the cuts as rays away from the base point, so moving the lamp moves every
    // cut at once. Before the upload existed the drawn rays swung and the portrait did not move at
    // all — the defect at its most visible, and the one a reader would read as the picture lying.
    const { root, app } = await declaredKeyhole();
    const probe: Cx = [2, 0.6];
    // The lamp below the origin casts the shadow ray straight UP, so the probe is on the far side
    // of the window ray from it and the correction is a half turn.
    app.actions().setBranch({ ...app.currentState().branch, shadow: true, basePoint: [0, -2] });
    await settle();
    const wasM = correctionAt(app, probe);
    const before = colourAt(root, app, probe);

    // The lamp to the upper LEFT swings the ray down and to the right, and the probe is then on the
    // lamp's own side of everything.
    app.actions().setBranch({ ...app.currentState().branch, basePoint: [-2, 0.4] });
    await settle();
    const nowM = correctionAt(app, probe);
    // Derived, not asserted as a literal: the claim is that the lamp MOVED the determination here,
    // and the size of the move is the half turn the drag test also sees.
    expect(Math.abs(nowM - wasM)).toBeGreaterThanOrEqual(0.4);
    expect(apart(before, colourAt(root, app, probe))).toBeGreaterThan(40);
  }, 60000);
});
