// **THE TEXTBOOK PLATE'S INK, MEASURED ON A REAL CANVAS** — M8 step 1.9.
//
// `drawTextbookPlate` and `drawPoleGlyph` are unreachable from the node gate for the reason
// `accumulatorInk.browser.test.ts` gives: they need a `CanvasRenderingContext2D`, and this app is
// not a jsdom project. What is asserted here is only what a real 2-D context can show — that the
// grid, the axes, the ⊗'s cross and a dashed cut put pixels down, and that each of those four
// things is the one putting them there.
//
// **THE TRAP THIS SUITE HAS FALLEN INTO TWICE** (the accumulator's first draft, and the drill's).
// A canvas that `drawContour` cleared is TRANSPARENT, and `getImageData` is un-premultiplied, so a
// faint stroke comes back as bright RGB at low alpha — an RGB-only filter reads a blank canvas as
// full of colour and passes with the subject removed. Two defences, one per plate. The textbook
// plate is drawn over a canvas the caller FILLS with paper, so there is no transparency to misread
// and the discriminator is "darker than the paper" — **measured on a blank plate: 0 pixels**, which
// is the clause that makes every count below mean something. The cut test runs on a transparent
// canvas, so its discriminator carries the alpha channel instead.
//
// Every number in a comment here was measured before the bound beside it was written, and every
// count has a control that MOVES when the thing it measures is taken away.
import { describe, expect, it } from "vitest";
import { LIGHT_INK } from "../src/ui/inkTheme.js";
import { drawContour, drawPoleGlyph, drawTextbookPlate } from "../src/ui/stage/ink.js";
import type { View, Viewport } from "../src/kernel/camera.js";
import type { Resolved } from "../src/kernel/geom.js";

/** The light ground the plate is printed on — `#f7f8fa`, the value `ink.ts` names for it. */
const PAPER = "#f7f8fa";
const PAPER_LUM = 0.2126 * 247 + 0.7152 * 248 + 0.0722 * 250;

const W = 800;
const H = 600;
const VP: Viewport = { width: W, height: H };

/** A canvas the CALLER has cleared to paper — which is the contract `drawTextbookPlate` draws under. */
function plate(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  return ctx;
}

/** Pixels meaningfully darker than the paper. The plate's only ink is dark, so this IS the ink. */
function darkPixels(ctx: CanvasRenderingContext2D, threshold = 6): number {
  const d = ctx.getImageData(0, 0, W, H).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < PAPER_LUM - threshold) n++;
  }
  return n;
}

describe("the textbook plate's furniture", () => {
  it("lays down ink, and the grid is the part that goes away", () => {
    // The blank control, first and in the test rather than only in the header: if this were not 0
    // then every other count in the file would be measuring the paper.
    expect(darkPixels(plate()), "paper alone is not ink").toBe(0);

    const view: View = { center: [0, 0], halfHeight: 2 };
    const gridded = plate();
    drawTextbookPlate(gridded, view, VP, { theme: LIGHT_INK, grid: true });
    const withGrid = darkPixels(gridded);

    const bare = plate();
    drawTextbookPlate(bare, view, VP, { theme: LIGHT_INK, grid: false });
    const axesOnly = darkPixels(bare);

    // **Measured: 7,790 with the grid, 3,016 without.** The axes alone are two 1.25 px rules across
    // an 800 x 600 canvas (1,750 px of stroke before antialiasing), two arrowheads and two words,
    // which is the right order for 3,016. At `halfHeight` 2 the ladder's step is 1 unit — 150 px
    // apart, so 5 verticals and 3 horizontals over this canvas — and those are the other 4,774.
    expect(axesOnly, "the axes and their labels are ink").toBeGreaterThan(2000);
    expect(withGrid, "the grid adds to them").toBeGreaterThan(6000);
    // **The non-vacuity clause**, and deliberately not "the two differ": a lossier assertion would
    // be satisfied by two calls drawing the same furniture in a different order. The grid is
    // strictly MORE ink, by a margin no antialiasing difference could account for.
    expect(withGrid - axesOnly, "the grid's own contribution").toBeGreaterThan(3500);
  });

  it("climbs the 1-2-5 ladder, so a wide view is not a grey wash", () => {
    // `halfHeight` 40 on a 600 px canvas is 7.5 px per plot unit, so a 1-unit grid
    // would be 107 verticals at 7.5 px apart over this width. That is the wash the ladder exists to
    // prevent. The ladder climbs 1 → 2 → 5 and stops at 5 (37.5 px ≥ 28).
    const ctx = plate();
    drawTextbookPlate(ctx, { center: [0, 0], halfHeight: 40 }, VP, { theme: LIGHT_INK, grid: true });

    // A row clear of the horizontal axis (y = 300) and, at the ladder's step, of every horizontal
    // rule (those land on 0, 38, 75, 113, 150, 188, 225, 263, 300, …) — so what it counts is the
    // VERTICALS. The threshold is 2 rather than 6 because a grid rule is faint by design.
    const row = 120;
    const d = ctx.getImageData(0, row, W, 1).data;
    let columns = 0;
    for (let x = 0; x < W; x++) {
      const i = 4 * x;
      if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < PAPER_LUM - 2) columns++;
    }

    // **Measured: 22 inked columns** — 21 grid verticals plus the vertical axis, one column each
    // because `drawTextbookPlate` snaps every rule to a half-pixel. With the ladder disabled
    // (`MIN_SPACING` forced to 0, so the step stays at 1) the same row reads **800**: every column,
    // because at a 1-unit step the horizontal rules are 7.5 px apart and this row lands on one —
    // and even discounting that, the 107 verticals alone would be five times the bound. Either way
    // the row is telling you the picture has stopped being a grid.
    expect(columns, "the grid is ruled, not washed").toBeLessThan(40);
    expect(columns, "and it is actually drawn").toBeGreaterThan(10);

    // The same claim without depending on which row was picked. **Measured: 26,640 with the ladder
    // against 121,027 without** — a 4.5× difference over the whole plate, which is the wash itself
    // rather than a proxy for it.
    expect(darkPixels(ctx), "the whole plate, not just one row").toBeLessThan(60000);
  });
});

describe("the pole glyph", () => {
  /** How dark the exact centre is. A ring leaves it paper; a ⊗'s cross runs through it. */
  function centreLum(ctx: CanvasRenderingContext2D): number {
    const d = ctx.getImageData(W / 2, H / 2, 1, 1).data;
    return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
  }

  it("is a ring WITH a cross — the centre is inked where a plain ring leaves it clear", () => {
    const glyph = plate();
    drawPoleGlyph(glyph, W / 2, H / 2, { theme: LIGHT_INK, r: 7, hot: false });
    const crossed = centreLum(glyph);

    // **The control is drawn by hand rather than through an option.** A flag on `drawPoleGlyph`
    // that suppressed the cross would be exercising a branch nothing ships; this is the plain ring
    // the ⊗ has to be distinguishable FROM, in the same ink at the same radius and weight.
    const ring = plate();
    ring.beginPath();
    ring.arc(W / 2, H / 2, 7, 0, 2 * Math.PI);
    ring.strokeStyle = LIGHT_INK.handleRing;
    ring.lineWidth = 1.6;
    ring.stroke();
    const clear = centreLum(ring);

    // **Measured: 47.9 at the centre of the ⊗ against 247.9 at the centre of the ring** — the ink's
    // own luminance against the paper's, because the two diameters cross exactly there. A ⊗ whose
    // cross was dropped would read 247.9 and fail the first line by 200.
    expect(crossed, "the cross passes through the centre").toBeLessThan(PAPER_LUM - 100);
    expect(clear, "and a plain ring does not").toBeGreaterThan(PAPER_LUM - 6);
  });

  it("raises a `base^{sup}` label, and that is real ink rather than a longer string", () => {
    const sup = plate();
    drawPoleGlyph(sup, W / 2, H / 2, { theme: LIGHT_INK, r: 7, hot: false, label: "e^{iπ/4}" });
    const withSup = darkPixels(sup);

    const plain = plate();
    drawPoleGlyph(plain, W / 2, H / 2, { theme: LIGHT_INK, r: 7, hot: false, label: "e" });
    const withoutSup = darkPixels(plain);

    const bare = plate();
    drawPoleGlyph(bare, W / 2, H / 2, { theme: LIGHT_INK, r: 7, hot: false });
    const noLabel = darkPixels(bare);

    // **Measured: 146 (glyph only), 171 (`e`), 220 (`e` with a raised `iπ/4`).** The middle number
    // is what makes the third mean something: `splitSuperscript` returning an empty `sup` for
    // `e^{iπ/4}` would draw `e` and read 171, which is why the claim is a margin over the plain
    // label rather than over the bare glyph.
    expect(noLabel, "the glyph itself").toBeGreaterThan(100);
    expect(withoutSup, "a label is ink").toBeGreaterThan(noLabel);
    expect(withSup, "and the superscript is more of it").toBeGreaterThan(withoutSup + 20);
  });
});

describe("a cut on the plate", () => {
  const CUT: readonly (readonly [number, number])[] = [
    [-1.5, 0.6],
    [1.5, 0.6],
  ];

  /**
   * Cut-coloured pixels, on a TRANSPARENT canvas — so this filter carries the alpha channel.
   *
   * `drawContour` opens with `clearRect`, which is the header's trap. `LIGHT_INK.cutInk` is
   * `#7b28c4`: blue-dominant with red above green. The halo is `(255, 255, 255)` at any alpha and
   * fails `b − g > 60`, and the piece list is empty, so nothing else on this canvas can match.
   */
  function cutPixels(ctx: CanvasRenderingContext2D): number {
    const d = ctx.getImageData(0, 0, W, H).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 8 && d[i + 2] - d[i + 1] > 60 && d[i] > d[i + 1]) n++;
    }
    return n;
  }

  function draw(dashCuts: boolean): number {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2-D context");
    const pieces: readonly Resolved[] = [];
    const view: View = { center: [0, 0], halfHeight: 2 };
    drawContour(ctx, pieces, view, VP, {
      theme: LIGHT_INK,
      colours: [],
      dashCuts,
      cuts: [{ points: CUT, refused: false, label: "J = 1/2" }],
    });
    return cutPixels(ctx);
  }

  it("is dashed rather than hatched, and that is strictly less ink", () => {
    const hatched = draw(false);
    const dashed = draw(true);

    // **Measured: 1,393 hatched against 793 dashed**, a ratio of 0.57. Two effects in one number
    // and both expected — the `[6, 4]` duty cycle removes 40 % of the 2.5 px stroke, and the
    // hatching's ticks are gone entirely. The two `> 0` clauses are what stop "fewer" from being
    // satisfiable by drawing no cut at all, which is the failure mode a bare inequality has.
    expect(hatched, "the hatched cut is drawn").toBeGreaterThan(1100);
    expect(dashed, "and so is the dashed one").toBeGreaterThan(550);
    expect(dashed, "dashing removes ink, it does not add it").toBeLessThan(hatched * 0.75);
  });
});
