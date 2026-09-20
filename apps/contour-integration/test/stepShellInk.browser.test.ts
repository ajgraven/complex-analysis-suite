// The amplitwist detail ON THE MOUNTED SHELL — M8 step 3.3, the half `stepArrowInk` cannot reach.
//
// `stepArrowInk.browser.test.ts` calls `drawContour` directly with an empty piece list, which is
// what makes its ratios exact — and is also why it says nothing about the questions below, each
// of which is about a WIRE rather than about a drawing:
//
//  - does `stageView`'s `inkDetail` consult the toggle at all (the step's own gate clause, *pixels
//    in the arrow colours appear only while the toggle is on*),
//  - does it hand the camera to `stepDetail` the right way up (`scale` is plot units per PIXEL and
//    the detail wants pixels per unit; they are reciprocals and both are a bare `number`),
//  - does `strip.ts` pass `step:` to `drawAccumulator`, and does `drawAccumulator` capture and then
//    draw that segment.
//
// A mutation sweep left one survivor for each, because each is a connection between two modules
// that are individually correct. So everything here mounts the real shell and reads the real
// canvases.
//
// **The harness is `figureInk.browser.test.ts`'s, for its three recorded reasons**: all four of the
// app's own stylesheets (a shell with no sheet does not lay out plainer, it lays out DIFFERENTLY,
// and every measurement below is in laid-out pixels); a desktop box on the root (the browser
// harness's viewport is 1280 x 900 but its body has no size, and M7.2 spent a slice discovering
// that a test aimed at an unsized stage is aimed at nothing); and a destroy after every test (the
// shell writes `#vs=` 250 ms after its last change and the next mount reads it at boot, so one
// test's parting state is otherwise the next one's subject).
//
// **Every count carries an ALPHA clause**, which is `stepArrowInk`'s finding met again on a
// different canvas: the ink layer is cleared to transparency, so `getImageData` is un-premultiplied
// and a half-covered pixel of an opaque hue comes back at that hue with a low alpha. Here the
// clause does a second job — the arrows are stroked over a near-black halo, so their partial
// coverage composites DARK and only their solid core carries the hue.
import { afterEach, describe, expect, it } from "vitest";
import { mountShell2 } from "../src/shell/app.js";
import { ARROW_PX } from "../src/shell/stepDetail.js";
import { DARK_INK } from "../src/ui/inkTheme.js";

// The stylesheets `main.ts` loads. `shell2.browser.test.ts` records why each one is load-bearing.
import "katex/dist/katex.min.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

/** Every shell this file mounts, torn down after the test that mounted it. */
const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

type Rgb = readonly [number, number, number];

/**
 * The theme's own hex, parsed — so these constants cannot drift from `inkTheme.ts`.
 *
 * A literal `[178, 235, 94]` here would keep passing after a repaint and would then be measuring a
 * colour the app no longer draws. `stepArrowInk.browser.test.ts` states the same rule.
 */
const rgbOf = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
const DZ_RGB = rgbOf(DARK_INK.stepArrow.dz);
const TERM_RGB = rgbOf(DARK_INK.stepArrow.term);
/** The trail's own hues — `PIECE_COLOURS` is `DARK_INK.pieces`, which `stage/ink.ts` records. */
const PIECE_RGB = DARK_INK.pieces.map(rgbOf);

/**
 * How far a channel may stray and still count as the hue.
 *
 * Tight on purpose. The arrows' two hues are `#2ed6c4` and `#b2eb5e`; the nearest thing the stage
 * otherwise draws is the third piece colour `#7fd1a8`, which is 53 away from the term's green in
 * the red channel and 51 from the teal's in blue. A tolerance of 10 therefore cannot be paid for by
 * a piece, a cut, a handle or the marker — and the detail-off frames below measure exactly that:
 * they count 0, on a canvas that is otherwise fully drawn.
 */
const TOL = 10;
/** Below this, a pixel is an antialiased edge rather than a stroke's core. */
const MIN_ALPHA = 200;

interface Mark {
  readonly count: number;
  /** The painted pixels' bounding box, or null when nothing matched. */
  readonly box: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } | null;
}

/** Every pixel of `img` at `rgb`, counted, with the box they live in. */
function mark(img: ImageData, rgb: Rgb, tol: number = TOL): Mark {
  const d = img.data;
  let count = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < MIN_ALPHA) continue;
    if (Math.abs(d[i] - rgb[0]) > tol || Math.abs(d[i + 1] - rgb[1]) > tol || Math.abs(d[i + 2] - rgb[2]) > tol) {
      continue;
    }
    const p = i / 4;
    const x = p % img.width;
    const y = (p - x) / img.width;
    count += 1;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { count, box: count === 0 ? null : { x0, y0, x1, y1 } };
}

/** How many pixels of a canvas carry ANY ink — the anti-vacuity floor under every count above. */
function painted(img: ImageData): number {
  const d = img.data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
  return n;
}

function read(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** The device ratio the stage sizes its canvases at — so a pixel count can be read back as CSS px. */
const dpr = (canvas: HTMLCanvasElement): number => canvas.width / (canvas.getBoundingClientRect().width || 1);

function mount(): ReturnType<typeof mountShell2> {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  return app;
}

/** Two frames and the shell's own settle window, so the scheduled draw has happened. */
async function settle(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 350));
}

const inkOf = (): HTMLCanvasElement => {
  const c = document.querySelector<HTMLCanvasElement>("canvas.ink");
  if (c === null) throw new Error("no ink canvas");
  return c;
};

const accOf = (): HTMLCanvasElement => {
  const c = document.querySelector<HTMLCanvasElement>("footer.strip2 canvas.acc");
  if (c === null) throw new Error("no accumulator canvas");
  return c;
};

describe("the amplitwist detail on the stage", () => {
  it("DRAWS ITS ARROWS ONLY WHILE THE TOGGLE IS ON — the step's own gate clause", async () => {
    const app = mount();
    await settle();
    // Worked example, where `showStepDetail` defaults the toggle ON with `showStep` still null —
    // the default, not an explicit `true`, because the mutant under test is the one that ignores
    // the resolution entirely and a state that had said `true` out loud would read the same either
    // way. The cold start is A6 (`∫dx/(1+x⁴)` by a semicircle) and `scrub` is 1, so the detail is
    // the walk's last term.
    app.applyState({ ...app.currentState(), workedExample: true });
    await settle();

    const ink = inkOf();
    const on = read(ink);
    const dzOn = mark(on, DZ_RGB);
    const termOn = mark(on, TERM_RGB);

    app.applyState({ ...app.currentState(), showStep: false });
    await settle();
    const off = read(ink);
    const dzOff = mark(off, DZ_RGB);
    const termOff = mark(off, TERM_RGB);

    // **What was measured.** With the toggle on, the ink layer carries **275** pixels of
    // `stepArrow.dz` and **28** of `stepArrow.term`; with it off, **0 and 0**. (The term's core is
    // the thinner of the two because its arrow runs nearly horizontally here, so a 2.25 px stroke
    // leaves one opaque row where the near-vertical `Δz` leaves a column at every scanline.)
    //
    // The zeros are only evidence because the canvas is still a whole picture in that frame —
    // **10,280 painted pixels with the detail off against 12,232 with it on**, the difference being
    // the two arrows and their halos — so "no arrow ink" cannot be bought by "no drawing at all",
    // which is the failure mode every ink suite in this app has hit at least once.
    expect(`${dzOn.count > 0} dz ink with the toggle ON`).toBe("true dz ink with the toggle ON");
    expect(`${termOn.count > 0} term ink with the toggle ON`).toBe("true term ink with the toggle ON");
    expect(`dz off: ${dzOff.count}`).toBe("dz off: 0");
    expect(`term off: ${termOff.count}`).toBe("term off: 0");
    expect(painted(off), "the stage is still drawn with the detail off").toBeGreaterThan(1000);
    expect(painted(on), "and was drawn with it on").toBeGreaterThan(1000);
  });

  it("SCALES THE ARROWS BY PIXELS-PER-UNIT, not its reciprocal — measured as a LENGTH", async () => {
    const app = mount();
    await settle();
    app.applyState({ ...app.currentState(), workedExample: true });
    await settle();

    const ink = inkOf();
    const img = read(ink);
    const ratio = dpr(ink);
    const dz = mark(img, DZ_RGB);
    const term = mark(img, TERM_RGB);
    expect(dz.box, "the Δz arrow is on the canvas").not.toBeNull();
    if (dz.box === null) return;

    // **The bounding box, not a hit test against `plotToScreen`, and deliberately.** Locating the
    // sample point from the camera would re-derive `stepDetail`'s own arithmetic in the test and
    // then compare it with itself; a box is read off the pixels alone and knows nothing about the
    // step, the camera or the walk. Each arrow is measured SEPARATELY, because the union's size
    // depends on the angle between them — which is `arg f(z_k)`, the record's number and not a
    // constant — while each arrow's own extent is `ARROW_PX` for the longer of the two and
    // `ARROW_PX·min(|f|, 1/|f|)` for the other, both bounded by 60 whatever the record does.
    //
    // **So the claim is a LENGTH, and "some pixels appeared" is the one thing it must not be.**
    // Passing `scale` where `1 / scale` is meant makes the magnification `60/s²` — tens of
    // thousands of pixels at this camera — and the stage draws the arrow clipped to the canvas
    // edge, which still puts plenty of ink in the right colour on the ink layer. Measured under
    // exactly that mutant: `Δz` becomes a **5 x 191** bar running off the bottom of the stage (696
    // pixels against 275) and the term's arrow disappears entirely, its magnified length having
    // taken it off the canvas.
    const extent = (box: { x0: number; y0: number; x1: number; y1: number }): number =>
      Math.hypot(box.x1 - box.x0, box.y1 - box.y0) / ratio;
    // Measured: `Δz` is 10 x 58 device px (58.9 CSS px on the diagonal) and the term 62 x 7 (62.4),
    // at a device ratio of 1 — each arrow its own 60 px, the pair nearly at right angles.
    //
    // **The order below is the reason, not tidiness.** Under that mutant the term's arrow is gone,
    // so a test that checked for its presence first would fail saying the arrow is MISSING — the
    // outcome pinned and the reason lost, which is this suite's own recurring finding. `Δz`'s
    // length is asserted before the term is looked for, so the mutant reports the bar.
    const dzPx = extent(dz.box);
    expect(dzPx, `the Δz arrow spans ${dzPx.toFixed(1)} CSS px`).toBeGreaterThan(0.5 * ARROW_PX);
    expect(dzPx, `the Δz arrow spans ${dzPx.toFixed(1)} CSS px`).toBeLessThan(1.5 * ARROW_PX);

    expect(term.box, "the term arrow is on the canvas").not.toBeNull();
    if (term.box === null) return;
    const termPx = extent(term.box);
    expect(termPx, `the term arrow spans ${termPx.toFixed(1)} CSS px`).toBeGreaterThan(0.5 * ARROW_PX);
    expect(termPx, `the term arrow spans ${termPx.toFixed(1)} CSS px`).toBeLessThan(1.5 * ARROW_PX);
  });
});

describe("the same term in the strip", () => {
  it("EMPHASISES THE SCRUBBED SEGMENT in the stage's term colour, and only while the toggle is on", async () => {
    const app = mount();
    await settle();
    // **Scrubbed to 0.2, and measuring is what forced it — the emphasis is the LAST DRAWN
    // segment, always.** `strip.ts` passes `stepIndex(scrub, steps.length)` and `drawAccumulator`
    // slices the walk at the same `scrub`, so `opts.step` is `shown.length - 1` at every scrub
    // position by construction; and the head is filled last, a 4.5 px white disc centred on that
    // very segment's far end. So the emphasis is visible only where the term is longer than the
    // disc. Swept over A6: **0 painted pixels at scrub 0.05, 0.1 and every position from 0.3 to 1,
    // and 45 at 0.2** — the one band where the diameter's terms are long. A test left at the
    // default `scrub` of 1 would have been red on correct code and would have looked exactly like
    // the defect it is aimed at.
    app.applyState({ ...app.currentState(), workedExample: true, scrub: 0.2 });
    await settle();

    const acc = accOf();
    const on = read(acc);
    const emphasisOn = mark(on, TERM_RGB);
    const trailOn = PIECE_RGB.reduce((n, rgb) => n + mark(on, rgb).count, 0);

    app.applyState({ ...app.currentState(), showStep: false });
    await settle();
    const off = read(acc);
    const emphasisOff = mark(off, TERM_RGB);
    const trailOff = PIECE_RGB.reduce((n, rgb) => n + mark(off, rgb).count, 0);

    // **What was measured.** The accumulator carries **45** pixels of `stepArrow.term` with the
    // detail on and **0** with it off — and the TRAIL is there in both frames, **262 and 278**
    // pixels in the six piece hues, which is what stops the zero from meaning "the strip drew
    // nothing". The 16-pixel gap between those two is itself the emphasis: the segment is stroked
    // at 3.2 over the trail's 2, so turning it on REPLACES piece-coloured pixels rather than adding
    // to them, and a trail that had merely got shorter would have moved both numbers together.
    //
    // Three separate mutants show here and they are indistinguishable from outside: `strip.ts` not
    // passing `step:`, `drawAccumulator` not capturing the segment, and the emphasis block
    // disabled. That they read alike is the point — the claim is that the wire is connected end to
    // end, and there is no way to hold two thirds of it.
    expect(`${emphasisOn.count > 0} emphasis with the toggle ON`).toBe("true emphasis with the toggle ON");
    expect(`emphasis off: ${emphasisOff.count}`).toBe("emphasis off: 0");
    expect(trailOn, "the trail is drawn with the detail on").toBeGreaterThan(50);
    expect(trailOff, "and is still drawn with it off").toBeGreaterThan(50);
  });
});
