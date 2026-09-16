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

import { mountShell2 } from "../src/shell2/app.js";
import { CET_C6 } from "../src/ui/stage/cetC6.js";
import { LIGHT_INK } from "../src/ui/inkTheme.js";
import type { StageMode } from "../src/ui/stage/mode.js";

import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/app.css";
import "../src/ui/theme.css";
import "../src/ui/shell2.css";

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
