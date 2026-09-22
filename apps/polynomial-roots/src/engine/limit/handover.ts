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

/** What the reader asked for. */
export type EngineMode = "auto" | "roots" | "limit";

/** What is actually drawing. */
export type EngineChoice = "roots" | "limit";

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
  const suggestedDepth =
    r <= 0 || r >= 1 || !(pixelSize > 0)
      ? MIN_DEPTH
      : Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.ceil(Math.log(pixelSize) / Math.log(r))));

  if (input.mode === "roots") {
    return { engine: "roots", reason: "you chose the root engine.", pixelSize, spacing, forced: true, suggestedDepth };
  }
  if (input.mode === "limit") {
    return {
      engine: "limit",
      reason: banded
        ? `you chose the limit-set engine, and this view is inside the band it does not enter — turn the band on, or it will be blank.`
        : "you chose the limit-set engine.",
      pixelSize,
      spacing,
      forced: true,
      suggestedDepth,
    };
  }
  if (banded) {
    return {
      engine: "roots",
      reason: `this view is in the band around |z| = 1 that the limit-set walk does not enter; the root engine covers it.`,
      pixelSize,
      spacing,
      forced: false,
      suggestedDepth,
    };
  }
  if (pixelSize < spacing) {
    return {
      engine: "limit",
      reason: `a pixel here is ${sig(pixelSize)} wide and degree-${input.maxDegree} roots are about ${sig(spacing)} apart, so the root cloud has come apart into dots.`,
      pixelSize,
      spacing,
      forced: false,
      suggestedDepth,
    };
  }
  return {
    engine: "roots",
    reason: `degree-${input.maxDegree} roots are about ${sig(spacing)} apart here and a pixel is ${sig(pixelSize)} wide, so they still fill the picture.`,
    pixelSize,
    spacing,
    forced: false,
    suggestedDepth,
  };
}
