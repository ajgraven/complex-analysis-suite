// **DRIVES THE STRIP IN A REAL BROWSER AND MEASURES THE INK IT LAYS DOWN.**
//
// M8 step 1.6. `test/strip.test.ts` asserts everything the strip DECIDES — the step index, the
// panel's sentences, the cache — but jsdom has no 2-D context, so the whole second half of `drawNow`
// (`sized()`, `clearRect`, `drawAccumulator`) runs there with `ctx === null` and returns at once.
// Nothing in the node gate can tell a strip that draws from one that does not.
//
// What is asserted here is therefore the PRIMITIVE: that the trail's pixels arrive, that the scrub
// gates how many of them do, that a comparison adds its own, and that a withheld integral leaves the
// canvas empty. `test/accumulatorInk.browser.test.ts` measures the same renderer's FIT across the
// corpus; this measures the view's wiring to it.
//
// **THE DISCRIMINATOR IS CHROMA, AND THE FIRST DRAFT WAS WRONG TO USE ALPHA ALONE.**
// `drawAccumulator` opens with `clearRect`, so the canvas is TRANSPARENT rather than the panel
// colour, and `getImageData` returns un-premultiplied RGBA — the axes' `rgba(231, 233, 238, 0.16)`
// comes back as bright `(231, 233, 238, 41)`, which is why a filter reading RGB alone counts the
// axes across the whole canvas and passes with the trail blanked (the note in
// `accumulatorInk.browser.test.ts`). Splitting by alpha instead is not enough either, and this is
// measured rather than argued: a 2 px antialiased polyline spends most of its width at partial
// coverage, so with no comparison drawn at all the band `60 < a ≤ 200` already held **128 pixels**
// — the real trail's own edges, read as a comparison trail that was not there.
//
// So the two bands are separated by HUE, which survives antialiasing exactly because the un-
// premultiplied read gives back the source colour at reduced alpha:
//
//  - **`trail`** — chromatic (`PIECE_COLOURS`, e.g. `#6ea8fe`, chroma 144) above `a > 40`. It counts
//    the segment loop and NOTHING else: the head dot is white, so a run that drew no segments reads
//    exactly 0 rather than the ~60 pixels that dot is worth.
//  - **`compare`** — achromatic (`rgba(231, 233, 238, …)`, chroma 7) in `60 < a ≤ 200`, which is the
//    comparison trail (`0.42`) and its endpoint dot (`0.6`) with the axes (`0.16` → 41) below the
//    band and the opaque head dot above it.
//
// **The harness's layout is not the app's, and pretending otherwise is its own defect** (M7.2b).
// This mounts the strip outside the app's stylesheet, so nothing sizes `canvas.acc` — and a canvas
// with no CSS size takes its layout box from its `width` ATTRIBUTE, which `sized()` then writes back
// from that box times the device ratio, so on a 2× display every draw would double it. The two style
// lines below are the sheet's own `position: absolute; inset: 0` applied by hand, not a workaround.
import { describe, expect, it } from "vitest";

import { circleTemplate } from "../src/engine/contour/templates.js";
import { compile, defaultState, resolveState, type ShellState } from "../src/shell/state.js";
import { defaultSession } from "../src/shell/session.js";
import { createStripView, type StripDraw, type StripView } from "../src/shell/strip.js";
import { drawAccumulator } from "../src/ui/accumulator.js";
import { DARK_INK } from "../src/ui/inkTheme.js";
import type { Accumulation } from "../src/engine/contour/accumulate.js";

/** The box `.strip2` gives the canvas at a desktop width, with the side panel taking the rest. */
const W = 860;
const H = 255;
const SIDE = 240;

function mount(): StripView {
  const host = document.createElement("footer");
  host.className = "strip2";
  host.style.cssText = `position: relative; width: ${W + SIDE}px; height: ${H}px`;
  document.body.replaceChildren(host);
  const view = createStripView(host, {
    setScrub: () => undefined,
    setContrast: () => undefined,
    setShowStep: () => undefined,
    hover: () => undefined,
    announce: () => undefined,
  });
  view.canvas.style.cssText = `position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px`;
  return view;
}

function drawOf(over: Partial<ShellState> = {}): StripDraw {
  const state: ShellState = { ...defaultState(circleTemplate([0, 0], 1.5)), ...over };
  return { state, resolution: resolveState(state, compile(state.expr)), session: defaultSession() };
}

interface Ink {
  /** The real trail's segments, in per-piece colour. The head dot is white and is NOT in here. */
  readonly trail: number;
  /** The comparison trail and its dot. The axes are below the band, the head dot above it. */
  readonly compare: number;
  /** Anything at all, including the axes — the floor on "the canvas was drawn into". */
  readonly any: number;
}

function inkOf(view: StripView): Ink {
  const ctx = view.canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  const { width, height } = view.canvas;
  expect(width * height, "the canvas has no backing store to read").toBeGreaterThan(0);
  const d = ctx.getImageData(0, 0, width, height).data;
  let trail = 0;
  let compare = 0;
  let any = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    any++;
    const chroma = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    if (chroma > 30) {
      if (a > 40) trail++;
    } else if (a > 60 && a <= 200) compare++;
  }
  return { trail, compare, any };
}

describe("the strip draws its trail", () => {
  it("puts the walk's own colours on the canvas", () => {
    // **The primitive.** If `drawNow` never reached `drawAccumulator`'s segment loop — an early
    // return, a canvas it failed to size, a context it never asked for — `trail` is 0, and nothing
    // in the node gate can go red for it: `getContext` is null there and the draw half is skipped
    // entirely. Measured at 428 on this box; 200 is emphatic without being tuned to one record.
    const view = mount();
    view.drawNow(drawOf({ scrub: 1 }));
    const ink = inkOf(view);
    expect(ink.trail).toBeGreaterThan(200);
    // And the axes are there too, so a canvas that was sized but never drawn into is distinguishable
    // from one that was cleared — `any` counts the frame, `trail` counts the picture.
    expect(ink.any).toBeGreaterThan(ink.trail);
    view.destroy();
  });

  it("and the SCRUB gates how much of it is drawn", () => {
    // A separate fact from the trail being drawn at all: a view that passed a constant `upTo: 1`
    // would satisfy the assertion above perfectly and this one not at all. Measured: 0 / 210 / 428.
    const view = mount();
    view.drawNow(drawOf({ scrub: 0 }));
    const start = inkOf(view).trail;
    view.drawNow(drawOf({ scrub: 0.5 }));
    const half = inkOf(view).trail;
    view.drawNow(drawOf({ scrub: 1 }));
    const full = inkOf(view).trail;
    expect({ start: start < 20, ordered: start < half && half < full }).toEqual({ start: true, ordered: true });
    view.destroy();
  });

  it("CLEARS the canvas when the integral is withheld, leaving nothing standing", () => {
    // **A trail from the previous integrand beside a refusal is the number the refusal exists to
    // withhold, drawn.** And the repair is not "skip the call": `drawAccumulator` begins with
    // `clearRect`, so skipping it leaves the PREVIOUS frame's trail on screen — M7.3's finding about
    // the drill mask, the same defect in the same shape. Only a browser can see this; in jsdom there
    // is no canvas for anything to be left on.
    const view = mount();
    view.drawNow(drawOf({ scrub: 1 }));
    expect(inkOf(view).trail).toBeGreaterThan(200);
    const refused = drawOf({ expr: "1/(z - 1.5)" });
    expect(view.accumulation(refused), "a pole ON the contour withholds the value").toBe(null);
    view.drawNow(refused);
    expect(inkOf(view)).toEqual({ trail: 0, compare: 0, any: 0 });
    view.destroy();
  });
});

describe("the drawn trail ENDS on the step `stepAt` names", () => {
  /**
   * **The one coupling nothing else can check.** `stepIndex` transcribes `drawAccumulator`'s own
   * slice rule — `count = max(1, round(upTo·N))`, head at `steps[count − 1]` — and the two live in
   * different modules, so a node test comparing the readout to `stepAt` compares one formula with
   * itself: both go through `stepIndex` and would agree after any edit to it. What decides the
   * question is what the RENDERER drew.
   *
   * Asked as an exact picture comparison rather than by finding the head dot, and a measurement is
   * why: the walk is 240 terms over this box, so consecutive steps are **0.75 px apart** and the
   * head's centroid carries about half a pixel of bias from the pixel grid — a tolerance loose
   * enough to absorb antialiasing absorbed a whole one-term error too, and the off-by-one
   * `round(t·(N−1))` survived it. Re-drawing the panel with `upTo` set from the index instead of
   * from the slider needs no tolerance at all: if the two agree about which term is last, the two
   * canvases are byte-identical, and if they do not, they are not.
   */
  function bytesOf(canvas: HTMLCanvasElement): Uint8ClampedArray {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2-D context");
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  /** The panel drawn to a chosen LAST STEP, through the same renderer the strip uses. */
  function upToStep(view: StripView, d: StripDraw, acc: Accumulation, last: number): Uint8ClampedArray {
    const ref = document.createElement("canvas");
    ref.width = view.canvas.width;
    ref.height = view.canvas.height;
    const ctx = ref.getContext("2d");
    if (ctx === null) throw new Error("no 2-D context");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawAccumulator(ctx, acc, W, H, {
      theme: DARK_INK,
      upTo: (last + 1) / acc.steps.length,
      contrast: d.state.contrast,
      // The strip reads these off the contour, so the reference must too — a hardcoded `[0]` would
      // happen to be right for the circle and would make this a test of one template.
      pieceColours: d.state.contour.pieces.map((p) => p.colour),
    });
    return bytesOf(ref);
  }

  it.each([0, 0.25, 0.5, 0.75, 1])("at scrub %s", (scrub) => {
    const view = mount();
    const d = drawOf({ scrub });
    view.drawNow(d);
    const acc = view.accumulation(d);
    const at = view.stepAt(d);
    if (acc === null || at === null) throw new Error("no accumulation");
    expect([...bytesOf(view.canvas)]).toEqual([...upToStep(view, d, acc, at.index)]);
    // **And the comparison discriminates**, which is the half that makes the equality above worth
    // asserting: ending one term earlier is a different picture, so byte equality is not something
    // any two draws of this panel would satisfy.
    const other = at.index === 0 ? 1 : at.index - 1;
    expect([...bytesOf(view.canvas)]).not.toEqual([...upToStep(view, d, acc, other)]);
    view.destroy();
  });
});

describe("the comparison trail", () => {
  it("is drawn only when a toggle other than `none` is active", () => {
    // This measures the mode reaching `drawAccumulator`'s `contrast` option, which is a different
    // fact from the panel's `aria-pressed` (pinned in `test/strip.test.ts`) — a toggle can be lit
    // and change nothing. Measured: 12 with no comparison against 165 with `Σ Δz`.
    const view = mount();
    view.drawNow(drawOf({ scrub: 1, contrast: "none" }));
    const off = inkOf(view);
    expect(off.compare).toBeLessThan(40);

    view.drawNow(drawOf({ scrub: 1, contrast: "sumDz" }));
    const on = inkOf(view);
    expect(on.compare).toBeGreaterThan(100);
    // The real trail is still there: a comparison is drawn BESIDE the sum, never instead of it.
    expect(on.trail).toBeGreaterThan(200);
    view.destroy();
  });

  it("is a DIFFERENT picture for a different comparison", () => {
    // `Σ Δz` closes back to the origin on a closed contour and `Σ z` walks away from it, so the two
    // cannot lay down the same ink — and they share one frame, so the second even squeezes the real
    // trail (measured: 506 → 14). A view that ignored the mode and always drew one of them would
    // pass the test above and fail this one.
    const view = mount();
    view.drawNow(drawOf({ scrub: 1, contrast: "sumDz" }));
    const dz = inkOf(view);
    view.drawNow(drawOf({ scrub: 1, contrast: "sumZ" }));
    const z = inkOf(view);
    expect(z.compare).not.toBe(dz.compare);
    expect(z.compare).toBeGreaterThan(100);
    view.destroy();
  });
});

describe("the canvas's backing store", () => {
  it("matches its CSS box at the device ratio, and does not grow on redraw", () => {
    // The runaway the old shell's `.accWrap` exists to stop: `sized()` writes `canvas.width` from
    // the element's LAYOUT box, and a canvas with no CSS size takes its layout box from that same
    // attribute — so each draw would multiply it by the device ratio, and the old strip reached
    // 173,922 px tall before a definite containing block was put around it. Unreachable from jsdom,
    // where `clientWidth` is 0 and the `|| 1` guard answers instead of the layout.
    const view = mount();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.drawNow(drawOf());
    expect([view.canvas.width, view.canvas.height]).toEqual([Math.round(W * dpr), Math.round(H * dpr)]);
    view.drawNow(drawOf({ scrub: 0.5 }));
    view.drawNow(drawOf({ scrub: 0.25 }));
    expect([view.canvas.width, view.canvas.height]).toEqual([Math.round(W * dpr), Math.round(H * dpr)]);
    view.destroy();
  });
});
