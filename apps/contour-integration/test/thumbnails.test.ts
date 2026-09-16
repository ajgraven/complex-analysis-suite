// @vitest-environment jsdom
// The front door's thumbnails — M8 step 1.8.
//
// **jsdom has no 2-D context**, so the plate cannot be rasterised here: `getContext("2d")` returns
// null unless the `canvas` npm package is installed, and it is not (see `thumbnails.ts` on why the
// drawing therefore takes a context rather than a canvas). Two consequences, both deliberate.
//
// The plan's primitive assertion — *"a thumbnail canvas draws > 12 distinct colours for the
// keyhole"*, M6.3's form — is a statement about PIXELS, and antialiasing is most of what produces
// those pixels. Measured in Chromium against this module, `mellin-keyhole` reads **347 distinct
// RGB values over 3,083 non-ground pixels of the 26,400**, and the whole corpus spans 165
// (`gaussian-shift-zero-residue`) to 498 (`wedge-rational-power`) — so the threshold is met with two
// orders to spare, but it is met somewhere this file cannot look. What is asserted here instead is
// the thing a pixel count is a PROXY for and which a recording context can decide exactly: which
// inks were committed, and where on the plate they landed.
//
// The control is the other half of M6.3's lesson — *a number is only evidence if nothing else could
// have produced it*. A count of committed colours would be satisfied by four strokes in one corner,
// or by four strokes off the edge of the plate, or by a palette committed with an empty path. So
// every legibility assertion is paired with a SPAN assertion, and the refusal case is required to
// commit nothing at all.
import { beforeEach, describe, expect, it } from "vitest";
import { DARK_INK, LIGHT_INK } from "../src/ui/inkTheme.js";
import { FAMILIES } from "../src/families/index.js";
import {
  clearThumbnailCache,
  drawThumbnail,
  THUMBNAIL_GROUND,
  THUMBNAIL_SIZE,
  thumbnailById,
  thumbnailFor,
} from "../src/shell/thumbnails.js";
import type { Family } from "../src/families/schema.js";

/** One committed mark: the ink it was laid down in, where it landed, and how it was composited. */
interface Mark {
  readonly op: "stroke" | "fill" | "fillRect" | "fillText";
  readonly style: string;
  readonly points: readonly (readonly [number, number])[];
  /**
   * The composite mode AT COMMIT. Recorded because the ground is drawn last and only
   * `destination-over` puts it underneath — without this the recorder cannot tell the plate from a
   * flat rectangle painted over the whole drawing, which is what dropping that one line produces.
   */
  readonly composite: string;
}

interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  readonly marks: Mark[];
  readonly clears: number;
  /** Sources blitted in with `drawImage` — how a cached call is told from a cold one. */
  readonly blits: unknown[];
}

/**
 * A 2-D context that records rather than rasterises.
 *
 * It implements exactly the surface `drawContour` and `drawThumbnail` use, and it is faithful about
 * the two things being asserted: a mark takes the style that was set at the moment it was COMMITTED
 * (so a `strokeStyle` assigned and then overwritten before `stroke()` is not counted), and `save`/
 * `restore` carry the style stack, which `drawContour` uses around every arrowhead.
 *
 * An `arc` contributes its four extreme points rather than a sampled curve: every span assertion
 * below is about a bounding box, and four points give that box exactly.
 */
function recorder(): Recorder {
  const marks: Mark[] = [];
  const blits: unknown[] = [];
  const state = { strokeStyle: "", fillStyle: "", lineWidth: 1, composite: "source-over" };
  const stack: (typeof state)[] = [];
  let path: [number, number][] = [];
  let clears = 0;

  const ctx = {
    lineJoin: "round",
    lineCap: "round",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    get strokeStyle(): string {
      return state.strokeStyle;
    },
    set strokeStyle(v: string) {
      state.strokeStyle = v;
    },
    get fillStyle(): string {
      return state.fillStyle;
    },
    set fillStyle(v: string) {
      state.fillStyle = v;
    },
    get lineWidth(): number {
      return state.lineWidth;
    },
    set lineWidth(v: number) {
      state.lineWidth = v;
    },
    get globalCompositeOperation(): string {
      return state.composite;
    },
    set globalCompositeOperation(v: string) {
      state.composite = v;
    },
    save: (): void => {
      stack.push({ ...state });
    },
    restore: (): void => {
      Object.assign(state, stack.pop() ?? state);
    },
    setLineDash: (): void => {},
    clearRect: (): void => {
      clears++;
    },
    beginPath: (): void => {
      path = [];
    },
    closePath: (): void => {},
    moveTo: (x: number, y: number): void => {
      path.push([x, y]);
    },
    lineTo: (x: number, y: number): void => {
      path.push([x, y]);
    },
    arc: (x: number, y: number, r: number): void => {
      path.push([x - r, y], [x + r, y], [x, y - r], [x, y + r]);
    },
    stroke: (): void => {
      marks.push({ op: "stroke", style: state.strokeStyle, points: [...path], composite: state.composite });
    },
    fill: (): void => {
      marks.push({ op: "fill", style: state.fillStyle, points: [...path], composite: state.composite });
    },
    fillRect: (x: number, y: number, w: number, h: number): void => {
      marks.push({
        op: "fillRect",
        style: state.fillStyle,
        points: [[x, y], [x + w, y + h]],
        composite: state.composite,
      });
    },
    fillText: (_t: string, x: number, y: number): void => {
      marks.push({ op: "fillText", style: state.fillStyle, points: [[x, y]], composite: state.composite });
    },
    drawImage: (src: unknown): void => {
      blits.push(src);
    },
    measureText: (t: string): { width: number } => ({ width: t.length * 6 }),
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    marks,
    blits,
    get clears(): number {
      return clears;
    },
  };
}

/** Every ink committed with a non-empty path, minus the ground — i.e. what a reader can see. */
const inks = (marks: readonly Mark[]): Set<string> =>
  new Set(marks.filter((m) => m.points.length > 0 && m.style !== THUMBNAIL_GROUND).map((m) => m.style));

/**
 * The bounding box of the CONTOUR's ink, in plate pixels.
 *
 * **The ground and the axes are excluded, and the second exclusion is the point.** The axes are a
 * full-width and a full-height rule, so a box that counted them would read 100% of the plate for
 * every record — and the span control below, whose whole job is to fail when the drawing collapses,
 * would have been satisfied by two lines drawn at the edges with no contour at all. Measured with
 * them in: every record read 100% × 100%. With them out the binding axis reads exactly 83.3%, which
 * is `fitView`'s 1/1.2 and could have come from nothing else.
 */
function span(marks: readonly Mark[]): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const mark of marks) {
    if (mark.style === THUMBNAIL_GROUND || mark.style === LIGHT_INK.accumulator.axes) continue;
    for (const [x, y] of mark.points) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, x1, y0, y1 };
}

const family = (id: string): Family => {
  const found = FAMILIES.find((f) => f.id === id);
  if (found === undefined) throw new Error(`no record ${id}`);
  return found;
};

/** The one record that cannot be drawn: its contour has no pieces, so there is nothing to frame. */
const pieceless = (): Family => {
  const base = family("mellin-keyhole");
  return { ...base, id: "pieceless", contour: { ...base.contour, pieces: [] } };
};

/** …and the one that throws on the way: a declared parameter the fixture does not bind. */
const unbound = (): Family => {
  const base = family("mellin-keyhole");
  return {
    ...base,
    id: "unbound",
    parameters: [...base.parameters, { name: "nowhere", domain: "real", constraints: [] }],
  };
};

beforeEach(() => {
  clearThumbnailCache();
});

describe("the plate", () => {
  it("draws the keyhole in many inks, spread across the plate", () => {
    const rec = recorder();
    const content = drawThumbnail(rec.ctx, family("mellin-keyhole"));

    expect(content).not.toBeNull();
    expect(content?.pieces).toBe(4);

    // **Six distinct inks: four piece hues, the halo under them, and the axes** — on a plate whose
    // rasterisation carries 347 colours in Chromium. The floor is stated as the count AND as the
    // membership, because a count alone cannot tell four piece colours from four greys.
    //
    // The hues come from `LIGHT_INK.pieces`, the theme this plate is drawn in — which it did not
    // until the repair recorded in the palette test below.
    const ink = inks(rec.marks);
    expect(ink.size).toBeGreaterThanOrEqual(6);
    const used = family("mellin-keyhole").contour.pieces.map((p) => LIGHT_INK.pieces[p.colour % 6]);
    for (const hue of new Set(used)) expect(ink.has(hue)).toBe(true);
    expect(ink.has(LIGHT_INK.halo)).toBe(true);
    expect(ink.has(LIGHT_INK.accumulator.axes)).toBe(true);

    // THE CONTROL. Colours alone are bought by four strokes in one corner, or by four strokes off
    // the edge, or by a palette committed with an empty path — this rules out all three. The keyhole
    // is framed with a 1.2 pad, so its ink must cover most of the plate and none of it may land
    // outside: an absent or collapsed drawing fails here even when every colour was set.
    const box = span(rec.marks);
    // Measured: the keyhole's ink runs x 70.6→165.8 and y 9.2→100.8, so it fills 39.7% of the
    // width and 83.3% of the height — the outer circle is framed by the SHORT axis, and the plate
    // is 2.18:1, so the width it does not use is arithmetic rather than a defect.
    expect((box.y1 - box.y0) / THUMBNAIL_SIZE.height).toBeGreaterThan(0.8);
    expect((box.x1 - box.x0) / THUMBNAIL_SIZE.width).toBeGreaterThan(0.35);
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.y0).toBeGreaterThanOrEqual(0);
    expect(box.x1).toBeLessThanOrEqual(THUMBNAIL_SIZE.width);
    expect(box.y1).toBeLessThanOrEqual(THUMBNAIL_SIZE.height);
  });

  it("is the textbook palette EVERYWHERE, the piece strokes included", () => {
    const rec = recorder();
    drawThumbnail(rec.ctx, family("semicircle-quartic"));
    const ink = inks(rec.marks);

    // What `drawContour` reads off the theme it is handed: the halo (which flips polarity, so a
    // dark one on this ground would read as a second stroke), and here the axes and the ground.
    expect(ink.has(LIGHT_INK.halo)).toBe(true);
    expect(ink.has(DARK_INK.halo)).toBe(false);

    // **AND THE PIECES, WHICH IT DID NOT.** `drawContour` took the piece stroke from the module-level
    // `PIECE_COLOURS` — `DARK_INK.pieces` — so the theme decided the halo, the cuts, the handles, the
    // marker and a refused contour's amber, and did not decide the six colours the pieces are
    // actually drawn in, two lines from a `t.refusedInk` that does. Handing it `LIGHT_INK` gave a
    // light plate stroked in the stage's hues: measured on `#f7f8fa` at **1.61:1 to 2.27:1** where
    // the light palette's own darkened hues sit at **5.11:1 to 7.22:1**, 2.6x to 3.6x better, and
    // `inkTheme.ts`'s comment for that palette says it was darkened for exactly this reason.
    //
    // This test pinned the defect, so the repair failed HERE, at the sentence that says what
    // changed — which is what a pinned finding is for. It now pins the repair.
    expect(ink.has(LIGHT_INK.pieces[0])).toBe(true);
    expect(ink.has(DARK_INK.pieces[0])).toBe(false);
  });

  it("lays the ground under everything, once, and leaves the composite as it found it", () => {
    const rec = recorder();
    drawThumbnail(rec.ctx, family("circle-poisson"));

    const ground = rec.marks.filter((m) => m.style === THUMBNAIL_GROUND);
    expect(ground).toHaveLength(1);
    expect(ground[0].points).toEqual([
      [0, 0],
      [THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height],
    ]);
    // LAST, not first: `drawContour` opens with `clearRect`, so a ground laid before it is erased.
    expect(rec.marks[rec.marks.length - 1]).toBe(ground[0]);
    expect(rec.clears).toBe(1);

    // **UNDER `destination-over`, which is the whole of what makes it a ground.** Dropping that one
    // line leaves the same mark in the same place and paints the plate flat over the contour — a
    // mutant that survives every assertion above it, because order and position are unchanged and
    // only the compositing differs.
    expect(ground[0].composite).toBe("destination-over");
    expect(rec.marks.filter((m) => m.composite === "source-over").length).toBeGreaterThan(0);
    expect(rec.ctx.globalCompositeOperation).toBe("source-over");

    // The axes are two RULES, corner to corner — a plate whose axes commit the right colour over a
    // stale path looks like a scribble and passes any assertion about colour alone.
    //
    // Asserted as the four POINTS rather than as a bounding box: a box is satisfied by a rule whose
    // ends are at different heights, which is a skew a reader sees and a bbox does not. Measured —
    // moving one end of the horizontal rule survived the box assertion and fails this one.
    const axes = rec.marks.filter((m) => m.style === LIGHT_INK.accumulator.axes);
    expect(axes).toHaveLength(1);
    const [hl, hr, vt, vb] = axes[0].points;
    expect(hl[0]).toBe(0);
    expect(hr[0]).toBe(THUMBNAIL_SIZE.width);
    expect(hl[1]).toBe(hr[1]);
    expect(vt[1]).toBe(0);
    expect(vb[1]).toBe(THUMBNAIL_SIZE.height);
    expect(vt[0]).toBe(vb[0]);
  });

  it("rings the poles it can place, and none it cannot", () => {
    const rec = recorder();
    // A6's four quartic poles: two in the upper half-plane, two below — and the contour is the upper
    // semicircle, so the frame holds exactly two of them. A plate that rang all four would be drawing
    // outside its own camera.
    const content = drawThumbnail(rec.ctx, family("semicircle-quartic"));
    expect(content?.poles).toBe(2);
    const rings = rec.marks.filter((m) => m.style === LIGHT_INK.handleRing);
    expect(rings).toHaveLength(2);
    for (const ring of rings) {
      for (const [x, y] of ring.points) {
        expect(x).toBeGreaterThanOrEqual(-4);
        expect(y).toBeGreaterThanOrEqual(-4);
        expect(x).toBeLessThanOrEqual(THUMBNAIL_SIZE.width + 4);
        expect(y).toBeLessThanOrEqual(THUMBNAIL_SIZE.height + 4);
      }
    }
  });
});

describe("the framing", () => {
  it("frames every record inside the plate, and none of them as a dot", () => {
    for (const fam of FAMILIES) {
      const rec = recorder();
      const content = drawThumbnail(rec.ctx, fam);
      expect(content, fam.id).not.toBeNull();
      const box = span(rec.marks);
      // Inside: `fitView`'s pad is 1.2, so nothing may be clipped.
      expect(box.x0, fam.id).toBeGreaterThanOrEqual(0);
      expect(box.y0, fam.id).toBeGreaterThanOrEqual(0);
      expect(box.x1, fam.id).toBeLessThanOrEqual(THUMBNAIL_SIZE.width);
      expect(box.y1, fam.id).toBeLessThanOrEqual(THUMBNAIL_SIZE.height);
      // …and not a dot: whichever axis binds must be filled. Measured, the binding axis is **83.3% of
      // the plate for all 28**, which is exactly `fitView`'s 1/1.2 and nothing else — the few records
      // reading up to 90.2% are the arrowheads and the pole rings standing off the path. A collapsed
      // drawing cannot produce that number, and neither can a framing rule that is not this one.
      const fill = Math.max(
        (box.x1 - box.x0) / THUMBNAIL_SIZE.width,
        (box.y1 - box.y0) / THUMBNAIL_SIZE.height,
      );
      expect(fill, fam.id).toBeGreaterThan(0.83);
      // **The upper bound is the half that bites.** Measured maximum 0.9023; with the axes counted
      // in the box every record reads exactly 1.0, so this is the assertion that fails if the span
      // ever stops measuring the contour.
      expect(fill, fam.id).toBeLessThan(0.91);
    }
  });

  it("is a camera per record, not one camera", () => {
    // The corpus spans a contour framed at half-height 0.58 (D6's dogbone, which lives on [−1, 1])
    // and one at 9.60 (D2's keyhole, whose poles sit at −2 and −4), a factor of 16.6. A constant view
    // would show one of them as a smudge and clip the other — which is the whole reason `fitView` is
    // reused here rather than a fixed extent.
    const heights = FAMILIES.map((f) => drawThumbnail(recorder().ctx, f)?.view.halfHeight ?? 0);
    expect(Math.max(...heights) / Math.min(...heights)).toBeGreaterThan(10);
  });
});

describe("a record that cannot be drawn", () => {
  // Sweep: 17 of 18 mutants killed. The survivor is equivalent — replacing the `catch`'s `return
  // null` with an empty contour falls straight through to the `pieces.length === 0` refusal, so both
  // paths return null having committed nothing and no assertion can separate them. It is kept
  // because the two refusals are about different things, and a reader who deleted the first would be
  // relying on the second to notice.
  it("returns null and commits NOTHING", () => {
    // Nothing rather than a blank plate: a light rectangle in a card that otherwise holds pictures
    // of contours is itself a picture, and would be read as one. The context must also be untouched,
    // so a caller reusing a canvas is never left with a half-drawn refusal.
    for (const broken of [pieceless(), unbound()]) {
      const rec = recorder();
      expect(drawThumbnail(rec.ctx, broken), broken.id).toBeNull();
      expect(rec.marks, broken.id).toHaveLength(0);
      expect(rec.clears, broken.id).toBe(0);
    }
  });
});

describe("the cache", () => {
  it("hands back a FRESH canvas every call, and draws once", () => {
    // jsdom returns null from `getContext`, so the memo is stubbed onto a recording context — the
    // house idiom (`shell.test.ts` stubs the same method to null) pointed at a context that records
    // instead of one that refuses. Without this the test would compare null with null and prove
    // nothing.
    const rec = recorder();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => rec.ctx) as never;
    try {
      const first = thumbnailFor(family("mellin-keyhole"));
      const drew = rec.marks.length;
      const second = thumbnailFor(family("mellin-keyhole"));

      expect(first).not.toBeNull();
      expect(first?.width).toBe(THUMBNAIL_SIZE.width);
      expect(first?.height).toBe(THUMBNAIL_SIZE.height);

      // **DIFFERENT NODES, and that is the contract rather than a nicety.** A front-row record's card
      // appears twice in the front door — the top row and its taxonomy group — and adopting one node
      // into the second slot removes it from the first in silence: the top card goes blank and
      // nothing throws.
      expect(second).not.toBe(first);
      expect(first?.parentElement).toBeNull();
      expect(second?.parentElement).toBeNull();

      // …and the same PIXELS, blitted rather than redrawn. Both halves are needed: identity alone
      // would be satisfied by drawing the whole plate twice, and a blit count alone would be
      // satisfied by blitting an empty source.
      expect(rec.marks.length).toBe(drew);
      expect(rec.blits).toHaveLength(2);
      expect(rec.blits[0]).toBe(rec.blits[1]);

      // A refusal is cached as well: the second ask must not spend the whole failing path again to
      // reach the same null.
      const before = rec.marks.length;
      expect(thumbnailFor(pieceless())).toBeNull();
      expect(thumbnailFor(pieceless())).toBeNull();
      expect(rec.marks.length).toBe(before);

      // And the id-keyed door onto the same cache, which is what the front door's `thumbnail(id)`
      // input is wired to. An id no record answers to is a record with no picture.
      const byId = thumbnailById("mellin-keyhole");
      expect(byId).not.toBeNull();
      expect(byId).not.toBe(first);
      expect(rec.marks.length).toBe(before);
      expect(thumbnailById("no-such-record")).toBeNull();

      // **The cache is keyed by SIZE as well as by id.** Asking for a different plate must draw a
      // different plate; a key on the id alone hands back a 240×110 blit under a 120×55 canvas and
      // the picture is silently wrong rather than absent.
      const drewBefore = rec.marks.length;
      const small = thumbnailFor(family("mellin-keyhole"), { width: 120, height: 55 });
      expect(small?.width).toBe(120);
      expect(small?.height).toBe(55);
      expect(rec.marks.length).toBeGreaterThan(drewBefore);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("is null all the way down where there is no 2-D context", () => {
    // The environment this suite runs in — a caller gets its cards with their mathematics and no
    // broken frames, rather than an exception on the panel's open path.
    //
    // `getContext` is stubbed to null rather than left alone, which is what jsdom returns anyway:
    // unstubbed it ALSO writes a "Not implemented" stack to the virtual console on every call, and a
    // gate whose output carries a stack trace beside a passing test is a gate people learn to skim.
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    try {
      expect(thumbnailFor(family("mellin-keyhole"))).toBeNull();
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});
