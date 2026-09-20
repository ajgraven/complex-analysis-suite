// The four stage modes, measured on the GL canvas — M8 step 1.9.
//
// The node gate structurally cannot see any of this: jsdom has no WebGL2, so `mountShell2` takes its
// fatal-boundary catch and there is no drawing buffer to read. That is CLAUDE.md's standing warning
// about this app, and a colour map is exactly the kind of change it warns about — every claim here
// is about NUMBERS a shader produced.
//
// **Read at the canvas's NATIVE size, never downscaled.** The first draft read a 128×128 thumbnail
// of a 592×624 buffer, which is a 21× area reduction: the phase isolines are about two pixels wide,
// so nearest-neighbour sampling threw away fifteen of every sixteen of them and the mode that draws
// them measured as the mode that does not.
import { afterEach, expect, describe, it } from "vitest";

import { mountShell2 } from "../src/shell/app.js";
import { CET_C6 } from "../src/ui/stage/cetC6.js";
import { DARK_INK, LIGHT_INK, type InkTheme } from "../src/ui/inkTheme.js";
import type { StageMode } from "../src/ui/stage/mode.js";
import { plotToScreen } from "../src/kernel/camera.js";

import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  // The address bar, put back — `shell2.browser.test.ts` records why: a shell writes `#vs=` 250 ms
  // after its last change and the NEXT mount reads it at boot, so one test's parting state becomes
  // the next one's subject.
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

interface Frame {
  readonly px: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** The app as it opens — A6, `∫dx/(1+x⁴)` — with the stage put into `mode`, and its portrait read. */
async function portrait(mode: StageMode): Promise<Frame> {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  await settled();
  app.actions().setStageMode(mode);
  await settled();

  const gl = root.querySelector<HTMLCanvasElement>("canvas.gl");
  if (gl === null) throw new Error("no GL canvas");
  const readback = document.createElement("canvas");
  readback.width = gl.width;
  readback.height = gl.height;
  const ctx = readback.getContext("2d");
  if (ctx === null) throw new Error("no 2d context to read the portrait with");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(gl, 0, 0);
  return { px: ctx.getImageData(0, 0, gl.width, gl.height).data, width: gl.width, height: gl.height };
}

/** Wait for the rAF coalescer to have drawn. */
const settled = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

/** Rec. 709 luma of the pixel starting at byte `i`. */
const luma = (px: Uint8ClampedArray, i: number): number =>
  0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

const distinctColours = (f: Frame): number => {
  const set = new Set<number>();
  for (let i = 0; i < f.px.length; i += 4) set.add((f.px[i] << 16) | (f.px[i + 1] << 8) | f.px[i + 2]);
  return set.size;
};

describe("the stage modes", () => {
  it("draws no portrait at all in TEXTBOOK — one colour, and it is the paper", async () => {
    const f = await portrait("textbook");
    // Asserting the COLOUR and not only the count, because a stage that never rendered is also one
    // colour: `expect(colours).toBe(1)` alone passes on a dead canvas. Measured: `#f7f8fa`, which is
    // `LIGHT_INK.paper` and the same ground the front door's thumbnails are drawn on.
    expect(distinctColours(f)).toBe(1);
    const hex = `#${[f.px[0], f.px[1], f.px[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    expect(hex).toBe(LIGHT_INK.paper);
  });

  it("orders the colour counts full > quiet > textbook — the dials reach the shader", async () => {
    const full = await portrait("full");
    const quiet = await portrait("quiet");
    const textbook = await portrait("textbook");
    // A6 is `1/(1+x⁴)`, four poles off the axes, so the hue circle is swept several times over.
    // Measured at 592×624: full 85,722 · quiet 42,863 · textbook 1. Chroma ×0.42 and lightness ×0.78
    // compress the map into a smaller corner of the 8-bit cube, which is why quiet is strictly
    // fewer — and is the assertion that fails if `uMode` never reaches the shader, since the first
    // two would then be equal rather than 2.0× apart.
    expect(distinctColours(full)).toBeGreaterThan(60000);
    expect(distinctColours(quiet)).toBeGreaterThan(20000);
    expect(distinctColours(full)).toBeGreaterThan(distinctColours(quiet));
    expect(distinctColours(quiet)).toBeGreaterThan(distinctColours(textbook));
  });

  it("draws the 30° phase isolines in ISO — a sparse dark minority under an overall LIGHTER frame", async () => {
    const full = await portrait("full");
    const iso = await portrait("iso");
    expect(iso.width).toBe(full.width);

    // **The plan's own test for this is false, and measuring is what showed it.** It asked for "the
    // iso mode has more dark pixels than full"; measured, iso has FEWER at every absolute threshold
    // (below luma 60: 3,328 against 7,875). The cause is not a missing isoline but the mode's other
    // dial: dropping chroma to 0.75 moves a saturated hue toward the neutral AT THE SAME Oklab L,
    // and a neutral is LIGHTER than a saturated colour of equal L in Rec. 709 luma. 92% of the frame
    // goes up, which buries a feature covering 6% of it.
    //
    // So the claim is differential and per pixel, which is what identifies a LINE rather than a
    // dial: the frame as a whole is lighter, and a sparse minority is much darker.
    const ratios: number[] = [];
    let darkerBy30 = 0;
    for (let i = 0; i < full.px.length; i += 4) {
      const a = luma(full.px, i);
      // Skip the shader's pole anchors and any near-black: a ratio against ~0 is not a measurement.
      if (a < 5) continue;
      const r = luma(iso.px, i) / a;
      ratios.push(r);
      if (r < 0.7) darkerBy30++;
    }
    ratios.sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    const darkest = ratios[0];

    // The dial: overall lighter. Measured median ratio 1.043.
    expect(median).toBeGreaterThan(1.0);
    // The lines: measured 15,563 pixels of 369,408 (4.2%) at least 30% darker.
    expect(darkerBy30).toBeGreaterThan(0.02 * ratios.length);
    // **AT STRENGTH, and that clause is load-bearing.** The first draft asked only for the darkest
    // pixel, which a line drawn at a few per cent of its weight still supplies somewhere — and a
    // mutation sweep proved it: reverting the ramp to measure from the MIDPOINT between lines,
    // which is what made them nearly invisible on screen, left every assertion here green. What a
    // reader can see is a population, so the population is what is asserted: measured 6,886 pixels
    // (1.9%) at or past half the full frame's luma.
    expect(ratios.filter((r) => r < 0.5).length).toBeGreaterThan(0.01 * ratios.length);
    // And the darkest pixel lands on the multiply's own factor — 0.42, measured 0.423. This is the
    // clause a removed isoline block fails: without it the minimum ratio is the dial's, ~0.75.
    expect(darkest).toBeLessThan(0.5);
    expect(darkest).toBeGreaterThan(0.35);
  });

  it("keeps the `dark` threshold clear of CET-C6's own darkest entry", () => {
    // Not a rendering claim — a guard on the numbers above. The published table's darkest entry has
    // a Rec. 709 luma of 93.1, which is why the isoline test is differential rather than absolute:
    // an absolute "dark pixel" threshold placed anywhere useful sits INSIDE the map's own range and
    // counts hues rather than ink. The first draft asserted 96 and this test is what caught it.
    let darkest = 255;
    for (const [r, g, b] of CET_C6) {
      darkest = Math.min(darkest, (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255);
    }
    expect(darkest).toBeGreaterThan(90);
    expect(darkest).toBeLessThan(100);
  });
});

// ── the plate, as the app draws it ──────────────────────────────────────────────────────────────
//
// Everything above is about the GL canvas. These are about the INK canvas, and about `stageView`'s
// wiring rather than about `ink.ts`'s drawing, which `textbookInk.browser.test.ts` covers directly:
// a sweep found that every one of those primitives could be left uncalled, drawn over the contour,
// or fed the wrong theme without a test noticing.

/** The ink canvas of a mounted app, at its native size. */
async function inkLayer(mode: StageMode, sandbox: boolean, template?: string): Promise<{
  readonly px: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly app: ReturnType<typeof mountShell2>;
}> {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  await settled();
  if (sandbox) {
    app.actions().toSandbox();
    await settled();
  }
  if (template !== undefined) {
    app.actions().setTemplate(template as never);
    await settled();
  }
  app.actions().setStageMode(mode);
  await settled();
  const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
  if (ink === null) throw new Error("no ink canvas");
  const readback = document.createElement("canvas");
  readback.width = ink.width;
  readback.height = ink.height;
  const ctx = readback.getContext("2d");
  if (ctx === null) throw new Error("no 2d context to read the ink with");
  ctx.drawImage(ink, 0, 0);
  return { px: ctx.getImageData(0, 0, ink.width, ink.height).data, width: ink.width, height: ink.height, app };
}

const rgbOf = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** How many pixels carry a colour within `tol` of `hex`, at an alpha a reader would see. */
function countNear(px: Uint8ClampedArray, hex: string, tol = 26): number {
  const [r, g, b] = rgbOf(hex);
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 60 && Math.abs(px[i] - r) <= tol && Math.abs(px[i + 1] - g) <= tol && Math.abs(px[i + 2] - b) <= tol) n++;
  }
  return n;
}

const piecePixels = (px: Uint8ClampedArray, theme: InkTheme): number =>
  theme.pieces.reduce((n, hex) => n + countNear(px, hex), 0);

describe("the textbook plate, as the stage draws it", () => {
  it("LAYS THE PLATE DOWN — axes and a unit grid that the portrait modes do not have", async () => {
    const plate = await inkLayer("textbook", false);
    const overPortrait = await inkLayer("full", false);
    // Measured on A6: 1,857 plate-ink pixels against 152 in `full`, where the only things in that
    // colour are the handle rings and the marker. An uncalled `drawTextbookPlate` reads like the
    // second number.
    expect(countNear(plate.px, LIGHT_INK.plateInk)).toBeGreaterThan(1000);
    expect(countNear(overPortrait.px, DARK_INK.plateInk)).toBeLessThan(600);
  });

  it("puts the plate UNDER the contour, which is what `destination-over` is for", async () => {
    // **A6 is the decisive record, because its target piece lies exactly ON the real axis.** The
    // plate draws that axis at full strength, and `drawContour` has already cleared the canvas — so
    // the plate has to go beneath what is on it or the `Re` rule paints out the whole segment the
    // argument is about. Measured: 1,829 piece-coloured pixels on the plate against 1,837 in
    // `full`, 99.6% — the contour is untouched.
    const plate = await inkLayer("textbook", false);
    const overPortrait = await inkLayer("full", false);
    expect(piecePixels(plate.px, LIGHT_INK)).toBeGreaterThan(0.9 * piecePixels(overPortrait.px, DARK_INK));
  });

  it("marks a pole with ⊗ on the plate, and with a bare ring over a portrait", async () => {
    // The ink canvas is transparent at a ring's centre and inked at a ⊗'s. Over a portrait the pole
    // is already the white anchor the shader paints, so a ring is an annotation on something
    // visible; on a plate with no portrait behind it the glyph is the only mark there is, and a
    // bare ring would be indistinguishable from a grabbable handle — which `drawContour` draws in
    // the same shape on the same canvas.
    // **The pole is moved OFF both axes, and the first draft of this test was vacuous without it.**
    // `1/z`'s pole sits at the origin, which on the textbook plate is exactly where the `Re` and
    // `Im` rules cross — so the centre pixel is inked whether the glyph has a cross through it or
    // not, and a sweep proved it: removing the ⊗ branch entirely left this green. At `0.7 + 0.7i`
    // the glyph is the only thing there.
    const at = async (mode: StageMode): Promise<number> => {
      const f = await inkLayer(mode, true);
      f.app.actions().setExpr("1/(z-0.7-0.7i)");
      await settled();
      const ink = document.querySelector<HTMLCanvasElement>("canvas.ink");
      if (ink === null) throw new Error("no ink canvas");
      const rb = document.createElement("canvas");
      rb.width = ink.width;
      rb.height = ink.height;
      const c = rb.getContext("2d");
      if (c === null) throw new Error("no 2d context");
      c.drawImage(ink, 0, 0);
      const px = c.getImageData(0, 0, ink.width, ink.height).data;
      const dpr = ink.width / (ink.getBoundingClientRect().width || ink.width);
      const view = f.app.currentState().view;
      const vp = { width: ink.width / dpr, height: ink.height / dpr };
      const [sx, sy] = plotToScreen(0.7, 0.7, view, vp);
      const i = (Math.round(sy * dpr) * ink.width + Math.round(sx * dpr)) * 4;
      return px[i + 3];
    };
    expect(await at("textbook")).toBeGreaterThan(60);
    expect(await at("full")).toBeLessThan(40);
  });

  it("dashes a cut on the plate and hatches it everywhere else", async () => {
    // The keyhole template seeds a cut system (M4.6), so this is the reader's own route to one.
    // Measured: 276 cut-coloured pixels hatched against 132 dashed — the hatching's ticks are the
    // difference, and both are far from zero, which is what stops this passing on a cut that was
    // not drawn at all.
    const plate = await inkLayer("textbook", true, "keyhole");
    const overPortrait = await inkLayer("full", true, "keyhole");
    const hatched = countNear(overPortrait.px, DARK_INK.cutInk, 40);
    const dashed = countNear(plate.px, LIGHT_INK.cutInk, 40);
    expect(hatched).toBeGreaterThan(150);
    expect(dashed).toBeGreaterThan(60);
    expect(dashed).toBeLessThan(0.75 * hatched);
  });
});
