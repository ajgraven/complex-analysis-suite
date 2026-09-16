// The front door's contour thumbnails — M8 step 1.8.
//
// A card in the worked-examples panel carries a typeset integral and a sentence; the picture beside
// them answers a question neither does, which is *what shape is this argument*. Six of the 28
// records are a segment and an arc and nothing else, so the thumbnail is not what tells them apart —
// the integral is. What it tells apart is a keyhole from a dogbone from a strip from a square, which
// is the taxonomy the group rows are organised by.
//
// **No GL, and no analysis.** The plate is the ink layer alone, in the textbook palette, over a
// light ground — so it needs no WebGL2 context, no shader and no ledger. What it costs is measured
// below rather than asserted.
//
// WHAT IS DRAWN AND WHAT IS NOT. The contour and the axes come from the record's geometry; the pole
// rings come from `findPoles` on the contour integrand. **Branch cuts are not drawn**, and neither
// are the poles of a record whose integrand is multivalued — not an oversight, a cost. Both need the
// record's branch CHOICE, and the routing that decides which of `powerFactorOf` / `logFactorOf` /
// `multiFactorOf` a family takes is inline in `runFamily`, which is also the only thing that owns
// it. Reaching them means one of two things, both measured across all 28 records at their first
// fixture:
//
//   geometry + `findPoles`      27.4 ms total,  0.54 ms median   (this module)
//   `runFamily`, quadrature skipped  152.3 ms,  3.02 ms median
//   `runFamily`, as the shell runs it  3035 ms, 6.0 ms median (three records over 790 ms each)
//
// — or a second copy of that routing here, which is the two-readings-of-one-decision shape this app
// has been bitten by twice. So the cheap route stands, and a record whose singularities `findPoles`
// declines to decide gets no rings. **Drawing no ring is not a claim that there is no pole**: the
// card's integral carries the content, and the alternative — a confident empty plane for D1 — would
// be the claim. If cuts are wanted on the plate, the repair is to lift `runFamily`'s branch routing
// into a named function and call it from both places, not to copy it.
import { drawContour } from "../ui/stage/ink.js";
import { fitView, plotToScreen, type View, type Viewport } from "../kernel/camera.js";
import { instantiate, contourIntegrandOf } from "../families/instantiate.js";
import { LIGHT_INK, type InkTheme } from "../ui/inkTheme.js";
import { numericBindings, primaryGolden } from "../families/runFamily.js";
import { resolveAll, type Contour } from "../engine/contour/model.js";
import { findPoles } from "../kernel/poles.js";
import { FAMILIES } from "../families/index.js";
import type { Family } from "../families/schema.js";

/**
 * The plate, in CSS pixels. The plan's size, and it holds — see the legibility measurement in
 * `test/thumbnails.test.ts`.
 */
export const THUMBNAIL_SIZE: Viewport = { width: 240, height: 110 };

/**
 * The ground the textbook palette is drawn on: `theme.css`'s `--g-ground` under `[data-theme=light]`.
 *
 * A literal rather than a `getComputedStyle` read, for two reasons that point the same way. The
 * plate is the LIGHT one whatever the app's current theme is — `LIGHT_INK`'s halo is white, so a
 * dark ground would erase the halo and leave every stroke fighting the panel behind it — so reading
 * the live document would be reading the wrong value half the time. And a custom property resolves
 * to the empty string in jsdom, which is where this module is tested.
 */
export const THUMBNAIL_GROUND = "#f7f8fa";

/** Pole rings, in CSS pixels — half the stage's, because the plate is a fifth of the stage's width. */
const POLE_R = 4;

/** What a plate ended up containing. Returned so a caller can say so, and so a test can check it. */
export interface Thumbnail {
  /** The camera the contour was framed with — never a constant; see {@link drawThumbnail}. */
  readonly view: View;
  readonly pieces: number;
  /** Rings drawn, which is the number of poles `findPoles` decided AND placed inside the plate. */
  readonly poles: number;
}

/**
 * Draw one record's contour at its first fixture.
 *
 * **Takes a CONTEXT, not a canvas.** jsdom has no 2-D context at all (`getContext` returns null),
 * so a function that took a canvas would have to decide what an absent context means halfway through
 * drawing. Here there is one place that decides, {@link thumbnailFor}, and the drawing itself is a
 * pure function of the record, the viewport and the palette — which is what makes it testable
 * against a recording context in the node gate rather than only in a browser.
 *
 * **The camera is FRAMED, not fixed.** Measured across the corpus the framed half-height runs from
 * **0.58** (D6's dogbone, which lives on [−1, 1]) to **9.60** (D2's keyhole, whose poles sit at −2
 * and −4) — a factor of 16.6, so a constant view would show one of them as a smudge and clip the
 * other. That is `fitView`'s job and it is reused rather than re-derived, so a thumbnail frames a
 * contour by the same rule the stage does: the binding axis then fills 83.3% of the plate for every
 * one of the 28, which is exactly the 1.2 pad.
 *
 * Returns null when the record's contour cannot be built — see {@link thumbnailFor} on why nothing
 * is better than a blank plate. **The context is untouched in that case**: the refusal is decided
 * before the first draw call, so a caller that reuses a canvas is never left with half a picture.
 */
export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  family: Family,
  vp: Viewport = THUMBNAIL_SIZE,
  theme: InkTheme = LIGHT_INK,
): Thumbnail | null {
  const golden = primaryGolden(family);
  const bindings = { ...golden.params };

  let contour: Contour;
  try {
    contour = instantiate(family, { values: numericBindings(bindings) });
  } catch {
    // `instantiate` throws on a parameter with no value and on a derived expression that does not
    // evaluate — both of which are loader-level defects in the record, and both of which the loader
    // would have dropped the record for. Caught rather than propagated so one bad record cannot take
    // the whole panel down with it, which is the corpus's own refusal discipline.
    return null;
  }
  const pieces = resolveAll(contour);
  if (pieces.length === 0) return null;

  const view = fitView(pieces, vp);

  const built = contourIntegrandOf(family, bindings);
  const report = built.ok ? findPoles(built.ast) : null;

  drawContour(ctx, pieces, view, vp, {
    theme,
    colours: contour.pieces.map((p) => p.colour),
  });

  // The rings, over the contour: a pole ON the path is the one a reader most needs to see, and the
  // orientation arrowheads are what would be hidden by the reverse order. No order glyph — 10 px of
  // digit beside a 4 px ring is a smudge at this size, and the order is on the card.
  let drawn = 0;
  for (const pole of report?.poles ?? []) {
    const [x, y] = plotToScreen(pole.at[0], pole.at[1], view, vp);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < -POLE_R || y < -POLE_R || x > vp.width + POLE_R || y > vp.height + POLE_R) continue;
    ctx.beginPath();
    ctx.arc(x, y, POLE_R, 0, Math.PI * 2);
    ctx.strokeStyle = theme.haloStrong;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = theme.handleRing;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    drawn++;
  }

  // The axes and the ground go on LAST, underneath, through `destination-over`. `drawContour` opens
  // with `clearRect` — so anything laid down before it is gone, and the alternative is a second
  // clear in a module that does not own the first. The axes are what make a plate a plane: nearly
  // every contour in the corpus is placed against the real axis, and the one drawn without it reads
  // as an abstract loop.
  const composite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-over";
  const [ox, oy] = plotToScreen(0, 0, view, vp);
  ctx.strokeStyle = theme.accumulator.axes;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, oy);
  ctx.lineTo(vp.width, oy);
  ctx.moveTo(ox, 0);
  ctx.lineTo(ox, vp.height);
  ctx.stroke();
  ctx.fillStyle = THUMBNAIL_GROUND;
  ctx.fillRect(0, 0, vp.width, vp.height);
  ctx.globalCompositeOperation = composite;

  return { view, pieces: pieces.length, poles: drawn };
}

/**
 * The cache: record id and plate size → the SOURCE plate, or null for a record that has none.
 *
 * **What is cached is the PIXELS, never the element the caller gets.** A front-row record appears
 * twice in the front door — once across the top row and once inside its own taxonomy group — and one
 * DOM node cannot be in two places: adopting it into the second slot removes it from the first, in
 * silence, leaving the top card blank with nothing thrown. So every source canvas here stays
 * offscreen and unreachable, and {@link thumbnailFor} blits it into a fresh canvas per call.
 *
 * Keyed by size as well as by id, because the plate is drawn at whatever viewport it was asked for
 * and a cache keyed by id alone would hand a 240×110 blit back to a caller that asked for something
 * else.
 *
 * **Lifetime is the module's, which is the page session** — no eviction, because the corpus is 28
 * frozen records and the whole set of plates is 28 × 240 × 110 × 4 B ≈ 2.9 MB at worst, most of
 * which is never built (the front row is eight, and a group's cards are drawn when its disclosure
 * opens).
 *
 * A memo is safe because the drawing is a pure function of the record and its FIRST fixture, and
 * neither moves: `FAMILIES` is a module constant and `primaryGolden` picks by predicate rather than
 * by anything the reader can set. Dragging a record's parameters on the stage does not change its
 * thumbnail, which is the point — the plate is the record's portrait, not the reader's current view
 * of it.
 *
 * **A null is cached too.** A record that cannot be drawn cannot be drawn on the second attempt
 * either, and retrying it on every disclosure open would spend the whole failing path repeatedly to
 * reach the same answer.
 */
const cache = new Map<string, HTMLCanvasElement | null>();

/** The offscreen plate, drawn at most once per record per size. */
function sourcePlate(family: Family, vp: Viewport): HTMLCanvasElement | null {
  const key = `${family.id}@${vp.width}x${vp.height}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext("2d");
  const content = ctx === null ? null : drawThumbnail(ctx, family, vp);
  const out = content === null ? null : canvas;
  cache.set(key, out);
  return out;
}

/**
 * A fresh canvas carrying the record's plate — one the caller may adopt into the DOM.
 *
 * **A new element every call, the same pixels every call.** The expensive half is the contour
 * resolve and the ink render, which happen once. Measured in Chromium over the 28 records: a cold
 * call is a **1.40 ms** median (of which the ink render alone is 0.60 ms), a cached one **0.10 ms**
 * median and 0.119 ms mean over 280 calls — 12× cheaper, and filling all 28 cards from a warm cache
 * costs 3.3 ms. So the caller may ask as often as it likes; the blit is not the cost.
 *
 * `drawImage` rather than `putImageData`: at 1:1 with no scaling it is a straight copy that needs no
 * round trip through a JS-side `ImageData` (105 KB per record held live), and it respects the
 * destination's composite state, which `putImageData` does not.
 *
 * **null is the refusal, and it means the caller must show no picture at all** — not an empty box
 * with a border, which is a picture and would be read as one: a light rectangle in a card that
 * otherwise holds pictures of contours says "this contour is empty". The same null covers a missing
 * 2-D context, so a caller in an environment without canvas gets the cards with their mathematics
 * and no broken frames.
 */
export function thumbnailFor(family: Family, vp: Viewport = THUMBNAIL_SIZE): HTMLCanvasElement | null {
  const src = sourcePlate(family, vp);
  if (src === null) return null;

  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  ctx.drawImage(src, 0, 0);
  return canvas;
}

/**
 * The same, by record id — what the front door's `thumbnail(recordId)` input wants.
 *
 * The id → record lookup lives here rather than at the wiring, so the panel never has to hold a
 * corpus it does not otherwise need, and an id no record answers to returns null like any other
 * record with no picture.
 */
export function thumbnailById(id: string, vp: Viewport = THUMBNAIL_SIZE): HTMLCanvasElement | null {
  const found = FAMILIES.find((f) => f.id === id);
  return found === undefined ? null : thumbnailFor(found, vp);
}

/** Drop every cached plate. For tests, and for a later theme switch — nothing else calls it. */
export function clearThumbnailCache(): void {
  cache.clear();
}
