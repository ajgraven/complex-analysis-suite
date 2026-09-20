// **THE AMPLITWIST DETAIL, MEASURED ON A REAL CANVAS** — M8 step 3.3, the browser half of its gate.
//
// The gate is *scrubbing draws the two arrows (browser: pixels in the arrow colours appear only
// while the toggle is on)*. `shell/stepDetail.ts` is pure and the node suite has its arithmetic;
// what no node test can see is the DRAW, because `drawStepDetail` needs a
// `CanvasRenderingContext2D` and this app is not a jsdom project (`accumulatorInk.browser.test.ts`
// gives the reason at length). So `drawContour` is called here directly, with an EMPTY piece list,
// so the only ink on the canvas is the detail itself and every count below has exactly one source.
//
// **THE TRAP THIS SUITE HAS NOW FALLEN INTO THREE TIMES** (the accumulator's first draft, the
// drill's, the textbook plate's) has a new face here, and it is why every filter below carries an
// ALPHA clause. `drawContour` opens with `clearRect`, so the canvas is transparent and
// `getImageData` is un-premultiplied: a half-covered pixel of opaque `#ffd166` comes back as
// `(255, 209, 102)` at alpha 128 — *indistinguishable in RGB from the arc*, which is
// `rgba(255, 209, 102, 0.55)`, the same hue at alpha 140. RGB alone cannot tell the angle mark from
// the term arrow's own antialiased edge. What separates them is that an arrow's ink is stroked over
// a 5 px `halo` of `rgba(8, 10, 14, 0.85)`, so its partial-coverage pixels composite over near-black
// and come back DARK, while the arc, stroked straight onto transparency, keeps the pure hue at a
// partial alpha. So: **opaque + the hue is an arrow; translucent + the hue is the arc**, and neither
// filter can be bought by the other's mark.
//
// The pair is built BY HAND rather than through `stepDetail()`, because the one claim the whole
// picture makes is the RATIO of the two lengths, and a hand-built pair is the only way to know what
// that ratio should be.
import { describe, expect, it } from "vitest";
import { DARK_INK } from "../src/ui/inkTheme.js";
import { drawContour, type InkOptions } from "../src/ui/stage/ink.js";
import type { View, Viewport } from "../src/kernel/camera.js";
import type { Resolved } from "../src/kernel/geom.js";

// **Sized explicitly.** Vitest browser mode's viewport is 1280 × 900 here and 414 × 896 by default;
// neither is a layout this canvas is in, because it is never attached to the document at all.
const W = 800;
const H = 600;
const VP: Viewport = { width: W, height: H };
const VIEW: View = { center: [0, 0], halfHeight: 2 };
/** `H / (2·halfHeight)` — 150 screen px to the plot unit, which turns the vectors below into pixel lengths. */
const PX_PER_UNIT = H / (2 * VIEW.halfHeight);
/** `plotToScreen([0, 0])` at this camera: the point both arrows leave from. */
const ORIGIN: readonly [number, number] = [W / 2, H / 2];

/** Nothing else paints: no pieces, no cuts, no handles, no marker. */
const NO_PIECES: readonly Resolved[] = [];

type Detail = NonNullable<InkOptions["stepDetail"]>;
type Rgb = readonly [number, number, number];

/**
 * The theme's own hex, parsed — so these constants cannot drift from `inkTheme.ts`.
 *
 * A literal `[255, 209, 102]` here would keep passing after a repaint and would then be measuring a
 * colour the app no longer draws.
 */
const rgbOf = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
const DZ_RGB = rgbOf(DARK_INK.stepArrow.dz);
const TERM_RGB = rgbOf(DARK_INK.stepArrow.term);

function draw(detail: Detail | undefined, label?: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  const stepDetail = detail === undefined ? undefined : label === undefined ? detail : { ...detail, label };
  drawContour(ctx, NO_PIECES, VIEW, VP, {
    theme: DARK_INK,
    colours: [],
    ...(stepDetail === undefined ? {} : { stepDetail }),
  });
  return ctx.getImageData(0, 0, W, H);
}

const hueMatches = (d: Uint8ClampedArray, i: number, rgb: Rgb, tol: number): boolean =>
  Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol;

interface Mark {
  /** How many pixels the mark laid down. */
  readonly pixels: number;
  /** The farthest of them from {@link ORIGIN}, in px — the arrow's drawn extent along its own shaft. */
  readonly reach: number;
}

/** An ARROW's ink: the hue at full coverage. See the header for why the alpha clause is load-bearing. */
function arrowInk(img: ImageData, rgb: Rgb, tol = 12): Mark {
  const d = img.data;
  let pixels = 0;
  let reach = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 250 || !hueMatches(d, i, rgb, tol)) continue;
      pixels++;
      reach = Math.max(reach, Math.hypot(x + 0.5 - ORIGIN[0], y + 0.5 - ORIGIN[1]));
    }
  }
  return { pixels, reach };
}

/**
 * The ARC's ink, told from the arrows' by GEOMETRY rather than by colour.
 *
 * **This was an alpha test and the alpha went away.** The arc was the term's hue at 55 % on
 * transparency, which separated it cleanly from the arrows' opaque strokes — and then a real frame
 * showed the mark invisible: at `arg f = −44°` on the sandbox's circle the portrait behind it is
 * green, so 12 painted pixels read as nothing. It is opaque over a halo now, like every other
 * stroke on that canvas, and identical in colour to the term's arrow.
 *
 * What still separates them is where they are. The two vectors here are PERPENDICULAR by
 * construction, so each arrow's ink hugs its own axis (a 4.5 px stroke under a 7.25 px halo is
 * under 6 px from the axis at its widest) while the arc is a curve at radius 27 sweeping the
 * quadrant between them. Eight pixels clear of BOTH axes is therefore arc and nothing else.
 */
function arcInk(img: ImageData, tol = 12): number {
  const d = img.data;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 250 || !hueMatches(d, i, TERM_RGB, tol)) continue;
      const px = x + 0.5 - ORIGIN[0];
      const py = y + 0.5 - ORIGIN[1];
      // Clear of the horizontal shaft (|py| large) AND of the vertical one (|px| large), and inside
      // the shorter arrow, which is where the arc's radius puts it.
      if (Math.abs(px) > 8 && Math.abs(py) > 8 && Math.hypot(px, py) < DZ_PX) n++;
    }
  }
  return n;
}

/**
 * An arrow's own ink, told from the ARC's the same way {@link arcInk} tells the arc from the arrows.
 *
 * Needed because the arc is now the term's hue at full opacity, so a colour-only count of "the term
 * arrow" includes it — which is exactly how the pairing below started failing when it should not
 * have: 482 term-hued pixels with both arrows against 378 with one, a difference that IS the arc.
 */
function shaftInk(img: ImageData, rgb: Rgb, dir: readonly [number, number], tol = 12): number {
  const d = img.data;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 250 || !hueMatches(d, i, rgb, tol)) continue;
      const px = x + 0.5 - ORIGIN[0];
      const py = y + 0.5 - ORIGIN[1];
      if (Math.abs(px * dir[1] - py * dir[0]) <= 8 && px * dir[0] + py * dir[1] >= 0) n++;
    }
  }
  return n;
}

/**
 * Opaque pixels of `rgb` PAST `from` px along `dir`, within a 40 px corridor of that shaft.
 *
 * The corridor is what makes "beyond this arrow" a claim about *this* arrow: without it, a label
 * sitting past the vertical shaft would also count as past the horizontal one, since both are
 * measured from the same origin.
 */
function beyond(img: ImageData, rgb: Rgb, dir: readonly [number, number], from: number, tol = 12): number {
  const d = img.data;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 250 || !hueMatches(d, i, rgb, tol)) continue;
      const px = x + 0.5 - ORIGIN[0];
      const py = y + 0.5 - ORIGIN[1];
      const along = px * dir[0] + py * dir[1];
      const across = Math.abs(px * dir[1] - py * dir[0]);
      if (along > from && across < 40) n++;
    }
  }
  return n;
}

// **`|f| = 3`, with a quarter turn of twist, so the two arrows are perpendicular ON SCREEN.**
// `dz = 0.4` is 60 px to the right (`ARROW_PX`, as it happens); `f = 3i` makes `term = f·dz = 1.2i`,
// which `plotToScreen`'s y-flip draws as 180 px straight UP. Perpendicular is deliberate: it puts
// "past the long arrow's tip" and "past the short arrow's tip" in disjoint corridors, which is what
// the label test needs, and it keeps the arc — drawn at a radius inside the shorter arrow — clear of
// both shafts.
const DZ: readonly [number, number] = [0.4, 0];
const TERM: readonly [number, number] = [0, 1.2];
const DZ_PX = 0.4 * PX_PER_UNIT; // 60
const TERM_PX = 1.2 * PX_PER_UNIT; // 180
const BOTH: Detail = { at: [0, 0], dz: DZ, term: TERM };

describe("the amplitwist detail, in ink", () => {
  it("draws BOTH arrow colours when there is a step, and NEITHER when there is not", () => {
    // The gate's own sentence, and the second half is what makes the first mean anything: a count of
    // coloured pixels on a canvas that also carries a contour would prove nothing about this feature.
    //
    // Measured, 800 × 600, empty piece list, `halfHeight 2`, `|f| = 3`:
    //   with `stepDetail` — **132** opaque `#9aa4b8` pixels and **378** opaque `#ffd166` ones (a
    //     60 px and a 180 px shaft, each a 2.25 px stroke with a 9 px arrowhead; the counts are well
    //     under shaft-length × width because the alpha clause drops every antialiased edge pixel,
    //     which over the near-black halo is most of the stroke's width);
    //   without it — **0 and 0**, and **0 non-transparent pixels on the whole canvas**.
    // The blank control is stronger than the gate asks and is free here: with an empty piece list
    // `drawStepDetail` is the only thing that can paint at all.
    const on = draw(BOTH);
    const off = draw(undefined);

    const onDz = arrowInk(on, DZ_RGB);
    const onTerm = arrowInk(on, TERM_RGB);
    expect(`dz drawn: ${onDz.pixels > 0}`).toBe("dz drawn: true");
    expect(`term drawn: ${onTerm.pixels > 0}`).toBe("term drawn: true");
    // Both are a real mark rather than a stray pixel or two — a dot is ~10 px, a 60 px shaft is 132.
    expect(onDz.pixels).toBeGreaterThan(100);
    expect(onTerm.pixels).toBeGreaterThan(300);

    expect(`dz with no stepDetail: ${arrowInk(off, DZ_RGB).pixels}`).toBe("dz with no stepDetail: 0");
    expect(`term with no stepDetail: ${arrowInk(off, TERM_RGB).pixels}`).toBe("term with no stepDetail: 0");

    let painted = 0;
    for (let i = 3; i < off.data.length; i += 4) if (off.data[i] > 0) painted++;
    expect(`painted pixels with no stepDetail: ${painted}`).toBe("painted pixels with no stepDetail: 0");
  });

  it("draws the ANGLE only when there are two vectors to put an angle between", () => {
    // `MIN_ARROW_PX` nulls one arrow when `|f|` is far from 1 — over the corpus that is nearly always
    // the TERM's, on a vanishing arc by construction — and `drawStepDetail` then omits the arc,
    // because an angle between one vector and nothing is not an angle. This is that rule, in pixels.
    //
    // Measured: with both arrows the arc lays down term-hued pixels clear of both shafts (radius
    // `max(6, min(60, 180)·0.45)` = 27 px, a quarter turn, 1.75 px wide); with `dz: null` it lays
    // down **0**, while the term arrow is UNCHANGED in pixel count and in reach. The pairing is the
    // point — an arc count that fell to zero because the whole detail had stopped drawing would say
    // nothing about the rule.
    const both = draw(BOTH);
    const termOnly = draw({ at: [0, 0], dz: null, term: TERM });

    expect(arcInk(both)).toBeGreaterThan(15);
    expect(`arc with only one arrow: ${arcInk(termOnly)}`).toBe("arc with only one arrow: 0");

    const kept = arrowInk(termOnly, TERM_RGB);
    expect(`term arrow with dz null: ${kept.pixels > 0}`).toBe("term arrow with dz null: true");
    expect(`dz arrow with dz null: ${arrowInk(termOnly, DZ_RGB).pixels}`).toBe("dz arrow with dz null: 0");
    // The arc went away and the term arrow did not change — so the arc is what the rule removed.
    // Counted along the SHAFT, because the arc shares the term's hue and a colour-only count would
    // be comparing arrow-plus-arc against arrow and calling the difference a change in the arrow.
    const shaftBoth = shaftInk(both, TERM_RGB, [0, -1]);
    const shaftOnly = shaftInk(termOnly, TERM_RGB, [0, -1]);
    expect(`term shaft px, dz null vs both: ${shaftOnly} vs ${shaftBoth}`).toBe(
      `term shaft px, dz null vs both: ${shaftBoth} vs ${shaftBoth}`,
    );
    expect(Math.abs(kept.reach - arrowInk(both, TERM_RGB).reach)).toBeLessThan(0.01);
  });

  it("draws the two arrows in the ratio |f|, which is the one thing the picture asserts", () => {
    // `|f| = 3`: `dz` is 60 px, `term = f·dz` is 180. Measured reaches — the farthest OPAQUE pixel of
    // each hue from the shared start point — give a ratio of **2.92** against an exact 3.
    //
    // **The tolerance is about the MARK, not about the arithmetic, and the mark stopped being the
    // same on both arrows.** The two strokes are deliberately different widths — `Δz` at 4.5 under
    // the term's 2.25 — because at `|f| ≈ 1` equal strokes let the term hide the step completely.
    // A round `lineCap` overhangs the tip by half the width, so the wider arrow's reach runs
    // further past its own endpoint than the narrower one's: the bias is no longer a shared half
    // pixel and it now pushes the ratio DOWN, `(180 + ~1)/(60 + ~2)`. 0.12 covers it and is still
    // far tighter than the next ratio a plausible defect would produce — drawing both arrows at one
    // length gives 1.0, scaling each to its own gives 1.0, and `|f|²` or `√|f|` would give 8.9 or
    // 1.7.
    //
    // The arrowheads do not enter it: the barbs are drawn BACKWARD from the tip, so they can never
    // extend a reach.
    const img = draw(BOTH);
    const dz = arrowInk(img, DZ_RGB);
    const term = arrowInk(img, TERM_RGB);

    // Each arrow is where it was asked to be drawn, FIRST — a ratio of two wrong lengths is still a
    // ratio, and pinning the outcome without pinning the reason is how that ships.
    expect(Math.abs(dz.reach - DZ_PX)).toBeLessThan(3);
    expect(Math.abs(term.reach - TERM_PX)).toBeLessThan(3);

    const ratio = term.reach / dz.reach;
    expect(`|f| read off the ink: ${ratio.toFixed(2)}`).toBe("|f| read off the ink: 2.92");
    expect(Math.abs(ratio - 3)).toBeLessThan(0.12);
  });

  it("puts the label past the LONGER arrow's tip, and past nothing else", () => {
    // `drawStepDetail` steps 6 px past the longer arrow's tip along its own direction and 14 px
    // ACROSS it, and writes the magnification there. Here the longer one is `term` (`|f| = 3 > 1`),
    // pointing up the screen.
    //
    // **The across step is why this test is measured near the tip rather than beyond it.** The
    // first version of the drawing stepped 16 px further along the shaft and centred the box on
    // that point, and on A6 — where `arg f = 0`, so both arrows lie along the real axis — the box's
    // 90 px of dark halo covered the arrow's whole head and the contour under it. Sideways, the
    // label's ink straddles the tip instead of sitting past it, so "past the tip by 6" catches only
    // its upper half.
    //
    // Measured with `label: "arrows ×12"`, counting opaque term-hued pixels inside a 40 px corridor
    // of each shaft and past that shaft's tip: a handful past the term arrow, **0** past the `dz`
    // arrow, and — the pairing — **0** past the term arrow when no label is passed. The counts are
    // small because they are glyph interiors only: the label is written over its own `halo` rect, so
    // every antialiased edge of the 11 px type composites over near-black and fails the hue test,
    // exactly as an arrow's does. Without the no-label control they could have been the arrow's own
    // overhang; with it, the arrow contributes zero past its tip and they can only be the label.
    const labelled = draw(BOTH, "arrows ×12");
    const bare = draw(BOTH);

    const pastTerm = beyond(labelled, TERM_RGB, [0, -1], TERM_PX + 4);
    const pastDz = beyond(labelled, TERM_RGB, [1, 0], DZ_PX + 6);
    expect(pastTerm).toBeGreaterThan(5);
    expect(`label past the SHORT arrow: ${pastDz}`).toBe("label past the SHORT arrow: 0");
    expect(`ink past the LONG arrow with no label: ${beyond(bare, TERM_RGB, [0, -1], TERM_PX + 4)}`).toBe(
      "ink past the LONG arrow with no label: 0",
    );
    // And the label is ink the bare frame does not have at all, so it is drawn rather than merely
    // counted somewhere. The gain is larger than the "past the tip" count because the sideways step
    // puts most of the box level with the tip rather than beyond it.
    const gained = arrowInk(labelled, TERM_RGB).pixels - arrowInk(bare, TERM_RGB).pixels;
    expect(`term ink gained by the label: ${gained >= pastTerm && gained > 10}`).toBe(
      "term ink gained by the label: true",
    );
  });
});
