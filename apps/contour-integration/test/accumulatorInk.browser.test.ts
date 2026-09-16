// **DRAWS THE PARTIAL-SUM PANEL IN A REAL CANVAS AND MEASURES THE INK.**
//
// `src/ui/accumulator.ts` had no coverage of any kind before this slice, and `drawAccumulator` is
// unreachable from the node suite: it needs a `CanvasRenderingContext2D`, and this app is not a
// jsdom project (`packages/ui` is the only one). So the arithmetic of the fit is asserted in
// `test/accumulatorFrame.test.ts`, and what is asserted HERE is the thing only a real 2-D context
// can show — that the pixels land where the fit says, over the corpus, through the actual draw call.
//
// The claim is specifically about SIZE, because that was the defect: the trail was drawn at a scale
// set by a frame symmetric about the origin, so D1's one-quadrant walk was 68 × 67 px inside a
// 908 × 191 panel. Measuring ink rather than calling the fit again is what makes this a check on the
// renderer instead of a restatement of `accumulatorFrame`.
//
// It rides the Playwright/Chromium harness M4.7a wired up — no new infrastructure.
import { describe, expect, it } from "vitest";
import { DARK_INK } from "../src/ui/inkTheme.js";
import { accumulatorFrame, drawAccumulator } from "../src/ui/accumulator.js";
import type { Cx } from "../src/kernel/geom.js";
import { accumulate, type Accumulation } from "../src/engine/contour/accumulate.js";
import { offeredFamilies, primaryGolden, runFamily } from "../src/families/runFamily.js";
import { FAMILIES } from "../src/families/index.js";

/** The panel as the shell lays it out at a desktop width: `--strip` tall, less `.accSide`. */
const W = 860;
const H = 255;
const PAD = 18;

interface Ink {
  readonly pixels: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Draw into a real context and report the bounding box of the TRAIL.
 *
 * **The discriminator is the ALPHA channel, and the first draft of this helper was vacuous without
 * it.** `drawAccumulator` opens with `clearRect`, so the canvas is transparent, not the panel colour
 * — and `getImageData` returns un-premultiplied RGBA, so the axes' `rgba(231, 233, 238, 0.16)`
 * stroke comes back as `(231, 233, 238, 41)`: bright RGB with low alpha. A filter that looked only
 * at RGB therefore counted the axes, which span the entire canvas, and reported a full-panel
 * bounding box no matter what the trail did. Blanking the trail entirely still passed.
 *
 * The trail and its endpoint dot are stroked and filled at full alpha; the axes are not, and neither
 * is the contrast trail (`0.42`). So `a > 200` separates them cleanly and without depending on how
 * the browser composites anything.
 */
function inkOf(acc: Accumulation, pieceColours: readonly number[], w = W, h = H): Ink {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  drawAccumulator(ctx, acc, w, h, { theme: DARK_INK, upTo: 1, contrast: "none", pieceColours });

  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let pixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] <= 200) continue;
      pixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (pixels === 0) return { pixels: 0, width: 0, height: 0 };
  return { pixels, width: maxX - minX, height: maxY - minY };
}

/**
 * The endpoint dot alone, as a floor on what counts as "a trail was drawn".
 *
 * `drawAccumulator` draws the dot after the loop, so a run that drew NO segments still leaves ~60
 * opaque pixels at the origin. Asserting `pixels > 0` would accept that. This is measured rather
 * than assumed: the dot has radius 4.5, and an empty accumulation produces exactly it.
 */
const DOT_ONLY = inkOf(
  { steps: [], total: [0, 0], contrasts: { sumZ: [], sumFz: [], sumDz: [] } },
  [0],
).pixels;

/** Every record the loader offers, with its walk accumulated exactly as the shell does it. */
function drawn(): { id: string; acc: Accumulation; colours: readonly number[] }[] {
  const out: { id: string; acc: Accumulation; colours: readonly number[] }[] = [];
  for (const family of offeredFamilies().tiers.flatMap((t) => t.families)) {
    const r = runFamily(family, primaryGolden(family));
    if (!r.ok) continue;
    const sides = r.run.declared === undefined ? undefined : r.run.sides;
    out.push({
      id: family.id,
      acc: accumulate(r.run.f, r.run.resolved, 240, sides),
      colours: r.run.contour.pieces.map((p) => p.colour),
    });
  }
  return out;
}

const CASES = drawn();

describe("the trail is drawn at the size the fit promises", () => {
  it("covers every loaded record", () => {
    // **DERIVED, NOT HARDCODED — and this assertion is why.** It read `toHaveLength(20)` and had
    // been RED since M5.3d: E1, E2, F1 and G2 each added a record, and nothing in the node gate can
    // see a browser suite that `pnpm test` deliberately does not run. The claim worth making is
    // COVERAGE — that every record the app offers is drawn here — which is self-maintaining, so the
    // next record cannot make it stale rather than false.
    expect(CASES.map((c) => c.id)).toEqual(FAMILIES.map((f) => f.id));
  });

  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s fills its binding dimension",
    (id, { acc, colours }) => {
      const ink = inkOf(acc, colours);
      // `removable-one-minus-cos` is the one record whose walk goes NaN partway — a midpoint lands
      // exactly on the removable singularity of `(1 − cos z)/z²` and the compiled expression returns
      // `0/0`, so every partial sum after it is undefined and the trail stops. That is a known,
      // pre-existing gap recorded in `engine/contour/accumulate.ts`; what matters here is that the
      // FRAME is still set by the good prefix, so the part that can be drawn is drawn full size.
      const usableW = W - 2 * PAD;
      const usableH = H - 2 * PAD;
      const fill = Math.max(ink.width / usableW, ink.height / usableH);
      // Emphatically more than the endpoint dot: a 240-segment 2 px polyline is hundreds of pixels,
      // and blanking the loop leaves only the dot.
      expect({ id, drew: ink.pixels > 4 * Math.max(1, DOT_ONLY) }).toEqual({ id, drew: true });
      // Measured across the corpus the worst binding-dimension fill is 95%; 0.8 leaves room for the
      // endpoint dot's radius and the line width without making the bound vacuous.
      expect({ id, fills: fill > 0.8 }).toEqual({ id, fills: true });
    },
  );

  it("and stays inside the canvas — nothing is drawn off-panel", () => {
    for (const { id, acc, colours } of CASES) {
      const ink = inkOf(acc, colours);
      expect({ id, w: ink.width <= W, h: ink.height <= H }).toEqual({ id, w: true, h: true });
    }
  });
});

describe("what the old fit would have drawn, in the same canvas", () => {
  it("D1's keyhole is more than 3× the area it used to be", () => {
    // The regression guard with teeth: not "the trail is big" but "it is bigger than the thing it
    // replaced", measured through the renderer rather than argued from the formula. The old panel
    // was 908 × 191 and the old frame was symmetric about the origin; both are reproduced here.
    const kase = CASES.find((c) => c.id === "mellin-keyhole");
    if (kase === undefined) throw new Error("mellin-keyhole should be offered");
    const now = inkOf(kase.acc, kase.colours);
    // The old fit, replayed by pre-scaling the walk so the CURRENT fit reproduces it: the legacy
    // scale is `min(w, h) − 36` over `2·max`, which for this walk is the height, so the trail
    // occupied `2·max` of the panel's short side and the same number of pixels in both directions.
    const pts = kase.acc.steps.map((s) => s.running).filter((p) => Number.isFinite(p[0]));
    let max = 1e-9;
    for (const p of pts) max = Math.max(max, Math.abs(p[0]), Math.abs(p[1]));
    const legacyScale = Math.min((908 - 36) / (2 * max), (191 - 36) / (2 * max));
    const legacyW = (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) * legacyScale;
    const legacyH = (Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))) * legacyScale;
    expect((now.width * now.height) / (legacyW * legacyH)).toBeGreaterThan(3);
  });
});


// **THE HIGHLIGHT** — `AccumulatorOptions.highlight`, the strip's half of M8 step 1.10's hover link
// between the piece list, the contour on the stage, and this trail.
//
// The claim is not "something changed": it is that what changed is the highlighted piece's OWN
// segments and nothing else. So every count here comes with the control the header demands — the
// difference is measured against a draw with the option off, and the region it is compared to is one
// the piece does not occupy. A highlight that were silently ignored makes `changed` zero, which
// fails; a highlight that thickened the whole trail puts changed pixels in the other region, which
// also fails.

/** The raw RGBA of one draw, so two draws can be compared byte for byte. */
function pixelsOf(
  acc: Accumulation,
  pieceColours: readonly number[],
  highlight?: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  drawAccumulator(ctx, acc, W, H, {
    theme: DARK_INK,
    upTo: 1,
    contrast: "none",
    pieceColours,
    ...(highlight === undefined ? {} : { highlight }),
  });
  return ctx.getImageData(0, 0, W, H).data;
}

/**
 * Every pixel within `NEAR` of one piece's drawn segments.
 *
 * Built from `accumulatorFrame` directly rather than from anything the highlight touches, so the two
 * regions being compared are geometry rather than a restatement of the thing under test. `NEAR = 4`
 * is a real margin: the stroke goes from 2 px to 3.2 px, so at most 1.6 px of centre-line offset
 * plus about a pixel of antialiasing can move, and the mask is more than twice that.
 */
const NEAR = 4;

function regionOf(acc: Accumulation, piece: number): Uint8Array {
  const f = accumulatorFrame(acc.steps.map((s) => s.running), W, H);
  const mask = new Uint8Array(W * H);
  let from: Cx = [0, 0];
  for (const step of acc.steps) {
    const to = step.running;
    const ax = f.toX(from[0]);
    const ay = f.toY(from[1]);
    const bx = f.toX(to[0]);
    const by = f.toY(to[1]);
    from = to;
    if (step.piece !== piece) continue;
    // `removable-one-minus-cos` goes NaN partway (see above), and a NaN endpoint is drawn as nothing
    // — so it is in no region, which is what makes `neither === 0` below a real claim about it.
    if (!Number.isFinite(ax + ay + bx + by)) continue;
    const n = Math.max(1, Math.ceil(2 * Math.hypot(bx - ax, by - ay)));
    for (let i = 0; i <= n; i++) {
      const cx = Math.round(ax + ((bx - ax) * i) / n);
      const cy = Math.round(ay + ((by - ay) * i) / n);
      for (let dy = -NEAR; dy <= NEAR; dy++) {
        for (let dx = -NEAR; dx <= NEAR; dx++) {
          if (dx * dx + dy * dy > NEAR * NEAR) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          mask[y * W + x] = 1;
        }
      }
    }
  }
  return mask;
}

interface Spread {
  readonly id: string;
  readonly piece: number;
  /** Pixels the highlight changed, in total. */
  readonly changed: number;
  /** …of which: on this piece alone, on another piece alone, on both, on neither. */
  readonly onPiece: number;
  readonly onOther: number;
  readonly onBoth: number;
  readonly onNeither: number;
}

function spreadOf(
  id: string,
  acc: Accumulation,
  colours: readonly number[],
  piece: number,
  pieces: readonly number[],
): Spread {
  const plain = pixelsOf(acc, colours);
  const lit = pixelsOf(acc, colours, piece);
  const mine = regionOf(acc, piece);
  const theirs = new Uint8Array(W * H);
  for (const q of pieces) {
    if (q === piece) continue;
    const m = regionOf(acc, q);
    for (let i = 0; i < m.length; i++) if (m[i] === 1) theirs[i] = 1;
  }

  let changed = 0;
  let onPiece = 0;
  let onOther = 0;
  let onBoth = 0;
  let onNeither = 0;
  for (let i = 0; i < W * H; i++) {
    let moved = false;
    for (let c = 0; c < 4; c++) {
      if (plain[i * 4 + c] !== lit[i * 4 + c]) {
        moved = true;
        break;
      }
    }
    if (!moved) continue;
    changed++;
    const a = mine[i] === 1;
    const b = theirs[i] === 1;
    if (a && b) onBoth++;
    else if (a) onPiece++;
    else if (b) onOther++;
    else onNeither++;
  }
  return { id, piece, changed, onPiece, onOther, onBoth, onNeither };
}

const SPREADS: readonly Spread[] = CASES.flatMap(({ id, acc, colours }) => {
  const pieces = [...new Set(acc.steps.map((s) => s.piece))].sort((a, b) => a - b);
  return pieces.map((p) => spreadOf(id, acc, colours, p, pieces));
});

describe("the highlight emphasises one piece of the trail, and nothing else", () => {
  it("covers every loaded record, every piece", () => {
    // Derived, for the reason the coverage assertion above is: a record added later cannot make this
    // stale rather than false.
    expect(new Set(SPREADS.map((s) => s.id))).toEqual(new Set(CASES.map((c) => c.id)));
    // 84 pairs over the 28 records, as the corpus stands.
    expect(SPREADS.length).toBeGreaterThan(2 * CASES.length);
  });

  it("changes pixels — and every one of them is on the highlighted piece", () => {
    // **Measured before the bound was written**, over all 84 (record, piece) pairs: the pixels the
    // highlight changes that lie near ANOTHER piece and not near this one number **0**, and the
    // pixels near neither number **0** as well. Everything that moved is within 4 px of a segment of
    // the piece that was named. The largest single case is `wedge-fresnel` piece 0 at 4,801 changed
    // pixels (4,629 on the piece alone, 172 where two pieces run within 4 px of each other).
    const stray = SPREADS.filter((s) => s.onOther > 0 || s.onNeither > 0);
    expect(stray).toEqual([]);
    // **The control, and without it the line above is satisfied by doing nothing.** Each record has
    // at least one piece whose emphasis is plainly visible; the weakest is `series-cot-kernel` at
    // 358 changed pixels, so 300 is a floor the corpus clears rather than a number chosen to pass.
    const bestPerRecord = CASES.map(({ id }) => {
      const mine = SPREADS.filter((s) => s.id === id);
      return { id, best: Math.max(...mine.map((s) => s.changed)) };
    });
    expect(bestPerRecord.filter((r) => r.best <= 300)).toEqual([]);
  });

  it("concentrates the change on the piece it names — 1,210 pixels against 0", () => {
    // One pair written out, because the sweep above states the invariant and this states the SIZE of
    // it. `indented-sinc` has four pieces and its walk doubles back over itself, so it is the case
    // where a region test could most easily have leaked: measured, piece 0's highlight changes 1,210
    // pixels, of which 1,051 are near piece 0 alone, 159 are in the band where piece 0 runs within
    // 4 px of another piece, and **0** are near another piece and not this one.
    const s = SPREADS.find((x) => x.id === "indented-sinc" && x.piece === 0);
    if (s === undefined) throw new Error("indented-sinc piece 0 should be measured");
    expect({ changed: s.changed > 800, onPiece: s.onPiece > 500, onOther: s.onOther, onNeither: s.onNeither })
      .toEqual({ changed: true, onPiece: true, onOther: 0, onNeither: 0 });
  });

  it("an index no step carries changes nothing at all", () => {
    // The clause that says the option is READ rather than accepted: if `highlight` were ignored this
    // passes, but the sweep above fails — and if the emphasis were applied unconditionally this
    // fails. Byte-identical, measured at 0 differing bytes out of 877,200.
    const kase = CASES.find((c) => c.id === "mellin-keyhole");
    if (kase === undefined) throw new Error("mellin-keyhole should be offered");
    const plain = pixelsOf(kase.acc, kase.colours);
    const absent = pixelsOf(kase.acc, kase.colours, 99);
    let differing = 0;
    for (let i = 0; i < plain.length; i++) if (plain[i] !== absent[i]) differing++;
    expect({ bytes: plain.length, differing }).toEqual({ bytes: 4 * W * H, differing: 0 });
  });

  it("and an explicit `highlight: undefined` is the drawing that was there before", () => {
    // `drawAccumulator` sets the stroke width per segment now rather than once before the loop, so
    // the no-op is worth asserting directly as well as through the untouched tests above.
    const kase = CASES.find((c) => c.id === "mellin-keyhole");
    if (kase === undefined) throw new Error("mellin-keyhole should be offered");
    const omitted = pixelsOf(kase.acc, kase.colours);
    const explicit = pixelsOf(kase.acc, kase.colours, undefined);
    let differing = 0;
    for (let i = 0; i < omitted.length; i++) if (omitted[i] !== explicit[i]) differing++;
    expect(differing).toBe(0);
  });
});
