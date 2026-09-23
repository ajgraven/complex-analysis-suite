// Which engine draws this view, and the sentence that says why.
//
// The two engines answer the same question at different resolutions. The root engine enumerates
// polynomials of degree up to `d` and splats their roots; near a point `z` inside the disk those roots
// sit about `|z|^(d+1)` apart — Michelen and Yakir's magnification `T_{n,α}(w) = (w − α)/α^(n+1)` is
// exactly that statement — so once a pixel is SMALLER than that spacing the cloud stops being a cloud
// and becomes a scatter of separate dots. That is the moment to hand over to the limit-set walk, which
// has no degree at all and resolves as far as the arithmetic does.
//
// **The spacing is read at the view CENTRE, not over the view.** Taking the maximum `|z|` across the
// window would hand every overview to the limit engine, because a view framing the whole cloud reaches
// `|z| ≈ 1` at its corners where the spacing is O(1); taking the minimum would never hand over at all.
// The centre is what the reader is looking at, and at the opening view it is the origin, where the
// spacing is zero and the root engine keeps the picture — which is right, since that IS the picture the
// article opens with.
//
// **The excluded band overrides everything automatic.** The walk does not enter it (`walk.ts`), so a
// view centred there would hand over to an engine that paints the whole frame neutral. The root engine
// covers exactly that region well, so `auto` keeps it there and says so.
import { ANNULUS_INNER, MAX_DEPTH, MIN_DEPTH } from "./walk.js";
import { MAX_REFERENCE_DEPTH } from "../deep/reference.js";
import type { Precision } from "../deep/num.js";

/** What the reader asked for. */
export type EngineMode = "auto" | "roots" | "limit" | "deep";

/** What is actually drawing. */
export type EngineChoice = "roots" | "limit" | "deep";

/**
 * How many float32 ulps of the view CENTRE a texel must span for the limit-set shader to place its own
 * grid, below which the deep engine takes over.
 *
 * The shader computes `z = centre + halfExtent·(2uv − 1)` in float32, so the whole row is rounded onto
 * a lattice of spacing `ulp32(centre)` however fine the texels are. Measured at `|z| ≈ 0.42`, counting
 * distinct float32 `z` values across a 1024-texel row: **1024 of 1024 down to a half-height of 1e-5,
 * then 329 at 1e-5.5, 105 at 1e-6 and 11 at 1e-7.** One ulp a texel is exactly where it collapses, so
 * four is the margin at which the picture is still the picture.
 */
export const FLOAT32_TEXEL_ULPS = 4;

/**
 * Levels beyond what the view's own scale demands that the deep walk explores.
 *
 * Roots of degree `d` near `α` are spaced about `|α|^(d+1)`, so `log(radius)/log|α|` is the degree that
 * first reaches the view and every level beyond it roughly doubles the count. Measured at the zoom
 * story's root, at a half-height of 1e-8: margin 0 gives 35 roots from 303 nodes, margin 4 gives 551
 * from 2,511, and margin 8 gives 8,679 from 36,187 and takes 1.8 s. Four is the picture; eight is the
 * same picture at ten times the price.
 */
export const DEEP_DEPTH_MARGIN = 4;

/**
 * Below this half-height the reference walk runs in double-double rather than float64.
 *
 * Measured against each other on the zoom story's root, pairing roots by their coefficient vectors:
 * the two agree on the root SET exactly from 1e-10 to 1e-13, with the offsets differing by 9.1e-7 of a
 * view height at 1e-10 and 1.0e-3 at 1e-13; at 1e-14 the sets part (6 roots one way, 4 the other); at
 * 1e-16 the offsets differ by a whole view height; and by 1e-24 float64 finds nothing at all. The
 * switch sits at 1e-11, where the disagreement is a hundredth of a texel.
 */
export const DOUBLE_DOUBLE_BELOW = 1e-11;

/** One float32 ulp at `x`. */
function ulp32(x: number): number {
  const a = Math.abs(x);
  if (!(a > 0)) return Math.pow(2, -149);
  return Math.pow(2, Math.floor(Math.log2(a)) - 23);
}

/** The stage's aspect, for the radius the deep walk prunes against. Close enough for a depth. */
const ASPECT_GUESS = 1.55;

/** The view and the state the choice is made from. */
export interface HandoverInput {
  readonly mode: EngineMode;
  readonly cx: number;
  readonly cy: number;
  readonly halfHeight: number;
  /** The highest degree the root engine has loaded. */
  readonly maxDegree: number;
  /** The reader has asked for the excluded band to be walked. */
  readonly annulus: boolean;
  /** The stage's accumulation resolution, in texels down the height. */
  readonly pixels: number;
}

/** The choice, with everything the legend needs to justify it. */
export interface Handover {
  readonly engine: EngineChoice;
  /** Why, in one sentence a reader can act on. */
  readonly reason: string;
  /** One texel down the height, in world units. */
  readonly pixelSize: number;
  /** `|z|^(d+1)` at the view centre — the root spacing the pixel is compared against. */
  readonly spacing: number;
  /** True when the choice was the reader's rather than the rule's. */
  readonly forced: boolean;
  /** The depth the deep walk would use here. */
  readonly deepDepth: number;
  /** The arithmetic the deep walk would use here. */
  readonly precision: Precision;
  /** How many float32 ulps of the centre one texel spans — below `FLOAT32_TEXEL_ULPS` the shader blurs. */
  readonly texelUlps: number;
  /**
   * The depth at which the walk's own resolution matches one texel.
   *
   * The depth-`D` approximation cannot distinguish points closer than about `|z|^D`, for the same
   * reason the degree-`d` root cloud cannot: that is the scale the tail bound has shrunk to. A view
   * whose texel is far below it therefore OVER-REPORTS — the window is inside one undecided cell of
   * the approximation, so everything in it survives — and the honest depth is `log(pixel) / log|z|`.
   * Measured at the zoom story, `0.42065 + 0.48354i` at half-height 4e-4: depth 16 calls 50% of the
   * frame in-set, depth 24 calls 18%, and 34 and 48 both call 16%, where it has converged.
   *
   * It is a SUGGESTION and not a clamp, for two reasons. Watching the picture fill in as the depth
   * falls is the point of the slider — the hexahole caption says so — and a deeper walk is not always
   * an answer: at the dragon below half-height 1e-3 the window misses the limit set entirely, and 0%
   * is what depths 16, 24, 34 and 48 all return. What that view needs is the panel saying so, which
   * `measureLimit` does.
   */
  readonly suggestedDepth: number;
}

const sig = (x: number): string => (x === 0 ? "0" : x.toExponential(1));

/** Decide which engine owns this view. Pure; the shell and the tests both read it. */
export function chooseEngine(input: HandoverInput): Handover {
  const pixelSize = (2 * input.halfHeight) / Math.max(1, input.pixels);
  const absz = Math.hypot(input.cx, input.cy);
  // The fold: the walk runs at `1/z` outside the disk, and the root spacing is symmetric with it.
  const r = absz > 1 ? 1 / absz : absz;
  const spacing = r === 0 ? 0 : Math.pow(r, input.maxDegree + 1);
  const banded = r > ANNULUS_INNER && !input.annulus;
  const radius = Math.hypot(input.halfHeight * ASPECT_GUESS, input.halfHeight);
  const deepDepth =
    r <= 0 || r >= 1
      ? MIN_DEPTH
      : Math.max(1, Math.min(MAX_REFERENCE_DEPTH, Math.ceil(Math.log(radius) / Math.log(r)) + DEEP_DEPTH_MARGIN));
  const precision: Precision = input.halfHeight < DOUBLE_DOUBLE_BELOW ? "dd" : "float64";
  const texelUlps = pixelSize / ulp32(Math.max(Math.abs(input.cx), Math.abs(input.cy), r));
  const suggestedDepth =
    r <= 0 || r >= 1 || !(pixelSize > 0)
      ? MIN_DEPTH
      : Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.ceil(Math.log(pixelSize) / Math.log(r))));
  const base = { pixelSize, spacing, suggestedDepth, deepDepth, precision, texelUlps };

  if (input.mode === "roots") {
    return { ...base, engine: "roots", reason: "you chose the root engine.", forced: true };
  }
  if (input.mode === "deep") {
    return {
      ...base,
      engine: "deep",
      reason: "you chose the deep engine: one walk at the view's centre, and the roots it finds there.",
      forced: true,
    };
  }
  if (input.mode === "limit") {
    return {
      ...base,
      engine: "limit",
      reason: banded
        ? `you chose the limit-set engine, and this view is inside the band it does not enter — turn the band on, or it will be blank.`
        : "you chose the limit-set engine.",
      forced: true,
    };
  }
  if (banded) {
    return {
      ...base,
      engine: "roots",
      reason: `this view is in the band around |z| = 1 that the limit-set walk does not enter; the root engine covers it.`,
      forced: false,
    };
  }
  if (texelUlps < FLOAT32_TEXEL_ULPS) {
    // Deeper than the limit-set shader can place its own texels — see `FLOAT32_TEXEL_ULPS`. Checked
    // BEFORE the limit test, because it is the strictly deeper of the two conditions.
    return {
      ...base,
      engine: "deep",
      reason: `a texel here spans ${sig(texelUlps)} float32 ulps of the centre, so the limit-set shader can no longer place its own grid; one walk at the centre, in ${precision === "dd" ? "double-double" : "float64"}, takes over.`,
      forced: false,
    };
  }
  if (pixelSize < spacing) {
    return {
      ...base,
      engine: "limit",
      reason: `a pixel here is ${sig(pixelSize)} wide and degree-${input.maxDegree} roots are about ${sig(spacing)} apart, so the root cloud has come apart into dots.`,
      forced: false,
    };
  }
  // At the origin the estimate `|z|^(d+1)` is 0, and "roots about 0 apart" is a sentence the screen
  // printed for every overview centred there (found on the Newman place's legend). There are no roots
  // near the origin to be apart at all — a proper polynomial's roots stay outside a disk about it — so
  // the estimate says nothing there, and the reason says that instead.
  if (!(spacing > 0)) {
    return {
      ...base,
      engine: "roots",
      reason: "the view is centred on the origin, where the root-spacing estimate |z|^(d+1) says nothing; the root engine draws the overview.",
      forced: false,
    };
  }
  return {
    ...base,
    engine: "roots",
    reason: `degree-${input.maxDegree} roots are about ${sig(spacing)} apart here and a pixel is ${sig(pixelSize)} wide, so they still fill the picture.`,
    forced: false,
  };
}
