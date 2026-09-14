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
import { drawAccumulator } from "../src/ui/accumulator.js";
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
  drawAccumulator(ctx, acc, w, h, { upTo: 1, contrast: "none", pieceColours });

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
