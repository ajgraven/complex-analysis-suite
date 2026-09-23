// The app's state object: one value the whole page is a function of.
//
// Kept separate from the shell so the permalink codec, the places and the tests can all name the same
// thing, and so "what the reader is looking at" has exactly one representation. Every field here is
// something a permalink must carry; anything derived — the loaded degrees, the statistics, the tone
// ramp — is computed from it and deliberately absent.
import type { AlphabetSpec, Cx } from "./engine/alphabet.js";
import { ddAdd, ddFromString, ddMul, ddToNumber, ddToString } from "./engine/deep/dd.js";
import type { DD } from "./engine/deep/dd.js";
import type { EngineMode } from "./engine/limit/handover.js";
import { MAX_DEPTH as WALK_MAX_DEPTH, MIN_DEPTH as WALK_MIN_DEPTH } from "./engine/limit/walk.js";

/** How the density is coloured. */
export type ColourMode = "density" | "degree";

/** Everything the reader can change. */
export interface AppState {
  readonly alphabet: AlphabetSpec;
  /** The degree scrub, inclusive. `min ≥ 1`; degree 0 has no roots. */
  readonly minDegree: number;
  readonly maxDegree: number;
  readonly colour: ColourMode;
  /** Multiplies the density before the log — lifts faint structure without changing the equalisation. */
  readonly exposure: number;
  /** Bends the equalised result; 1 leaves it alone. */
  readonly gamma: number;
  /**
   * The view centre, as DECIMAL STRINGS.
   *
   * A JSON number is a double, and a double cannot hold a centre to the 32 significant figures a
   * 1e-30 view needs — so the centre would be the one thing a deep permalink could not carry. Strings
   * also keep the camera honest: every move is `centre + (a small increment)` in double-double, where
   * a float64 `View` would have to recover the increment by subtracting two numbers 30 orders apart.
   * The shallow engines read `centreNumbers`, which is the nearest double and all they can use.
   */
  readonly cx: string;
  readonly cy: string;
  readonly halfHeight: number;
  /** Half-width of the band around `|z| = 1` the near-circle statistic counts. */
  readonly circleDelta: number;
  /** Which engine draws: the root cloud, the limit-set walk, or whichever the zoom calls for. */
  readonly engine: EngineMode;
  /** The limit-set walk's depth cap. Nothing to do with the degree scrub — a different object. */
  readonly depth: number;
  /** Walk inside the excluded band around `|z| = 1`, under the node budget. */
  readonly annulus: boolean;
  /**
   * The dragon's pinned point, or null for none.
   *
   * A HOVER is not state — it is where the mouse happens to be — so the inset follows the cursor
   * without touching this, and pinning is the explicit act that makes a dragon shareable. The field is
   * a plain pair of doubles rather than the centre's decimal strings: the attractor at `z` and at
   * `z + 1e-17` are the same picture to every pixel of an inset, so the precision the camera needs
   * buys nothing here.
   */
  readonly lamp: Cx | null;
  /**
   * Draw the probed root's Michelen–Yakir overlay instead of the plain attractor.
   *
   * Only the deep engine has a probed root, so the mode is inert elsewhere; it is in the state rather
   * than in the shell because a rung of an argument nothing can link to is a rung nothing audits
   * (Contour Integration M7.4), and the a11y roster opens the overlay through its own permalink.
   */
  readonly theorem: boolean;
  /** Extension digits the overlay enumerates: `|A|^extend` paired points. */
  readonly extend: number;
  /** Draw the alphabet's cited root bound over the picture, where it has one. */
  readonly bounds: boolean;
}

/** Most extension digits the overlay will enumerate. `2^14` is 16,384 Newton solves, about 0.4 s. */
export const MAX_EXTEND = 14;

/** Highest degree the app will sweep without being asked twice (ADR-0046: live to 20). */
export const LIVE_DEGREE_CAP = 20;

/** Highest degree the app will sweep at all in this milestone. */
export const MAX_DEGREE = 24;

/**
 * The opening view: the whole cloud.
 *
 * `halfHeight = 1.45` frames the annulus `½ < |z| < 2` that Bousch's bound puts every Littlewood root
 * inside, with the real axis's bright line across the middle — the picture the article opens with.
 */
export const DEFAULT_STATE: AppState = {
  alphabet: { preset: "littlewood" },
  minDegree: 1,
  maxDegree: 16,
  colour: "density",
  exposure: 1,
  gamma: 1,
  cx: "0",
  cy: "0",
  halfHeight: 1.45,
  circleDelta: 0.02,
  engine: "auto",
  depth: 28,
  annulus: false,
  lamp: null,
  theorem: false,
  extend: 8,
  bounds: false,
};

/** Clamp a state into what the engine and the stage can actually do. Pure; the codec relies on it. */
export function clampState(s: AppState): AppState {
  const minDegree = Math.max(1, Math.min(MAX_DEGREE, Math.round(s.minDegree)));
  const maxDegree = Math.max(minDegree, Math.min(MAX_DEGREE, Math.round(s.maxDegree)));
  return {
    alphabet: s.alphabet,
    minDegree,
    maxDegree,
    colour: s.colour === "degree" ? "degree" : "density",
    exposure: clampNum(s.exposure, 0.05, 40, 1),
    gamma: clampNum(s.gamma, 0.2, 5, 1),
    cx: clampCoordinate(s.cx),
    cy: clampCoordinate(s.cy),
    halfHeight: clampNum(s.halfHeight, MIN_HALF_HEIGHT, 1e4, DEFAULT_STATE.halfHeight),
    circleDelta: clampNum(s.circleDelta, 1e-4, 0.5, DEFAULT_STATE.circleDelta),
    engine: s.engine === "roots" || s.engine === "limit" || s.engine === "deep" ? s.engine : "auto",
    depth: Math.round(clampNum(s.depth, WALK_MIN_DEPTH, WALK_MAX_DEPTH, DEFAULT_STATE.depth)),
    annulus: s.annulus === true,
    lamp: clampLamp(s.lamp),
    theorem: s.theorem === true,
    extend: Math.round(clampNum(s.extend, 0, MAX_EXTEND, DEFAULT_STATE.extend)),
    bounds: s.bounds === true,
  };
}

/**
 * The tightest view the app will open — ADR-0046 decision 3's stated floor, reached.
 *
 * The WALK goes further: at a half-height of 1e-31 it still returns 3,919 roots at a residual of
 * 1.8e-32, because its arithmetic is about `|P(z)|` rather than about resolving the centre. **The
 * CAMERA is what binds.** A double-double's ulp at `|z| ≈ 0.42` is `0.42·2⁻¹⁰⁶ ≈ 5.2e-33`, so at a
 * half-height of 1e-30 a 1024-texel view has a texel of 2e-33 and the centre moves in steps of about
 * two and a half texels; one decade further it moves in steps of twenty-five. A view the reader cannot
 * pan smoothly across is not a view, so the floor is here and not at the walk's own limit.
 */
export const MIN_HALF_HEIGHT = 1e-30;

/** A lamp the inset can draw at, or none. A non-finite pair is no lamp rather than a lamp at NaN. */
function clampLamp(lamp: Cx | null | undefined): Cx | null {
  if (lamp === null || lamp === undefined) return null;
  if (!Number.isFinite(lamp.re) || !Number.isFinite(lamp.im)) return null;
  if (Math.abs(lamp.re) > 1e6 || Math.abs(lamp.im) > 1e6) return null;
  return { re: lamp.re, im: lamp.im };
}

/** A coordinate string the walk can read, or the default. Never silently truncates one that parses. */
function clampCoordinate(text: string): string {
  if (typeof text !== "string") return "0";
  const v = ddFromString(text);
  if (v === null) return "0";
  const n = ddToNumber(v);
  if (!Number.isFinite(n) || Math.abs(n) > 1e6) return "0";
  return text;
}

/** The centre as the nearest pair of doubles — what the root and limit engines draw with. */
export function centreNumbers(s: { cx: string; cy: string }): { cx: number; cy: number } {
  return { cx: ddToNumber(ddFromString(s.cx) ?? [0, 0]), cy: ddToNumber(ddFromString(s.cy) ?? [0, 0]) };
}

/** The centre in double-double, for the camera. */
export function centreDd(s: { cx: string; cy: string }): { cx: DD; cy: DD } {
  return { cx: ddFromString(s.cx) ?? [0, 0], cy: ddFromString(s.cy) ?? [0, 0] };
}

/**
 * The world offset, from the view centre, of a point at `(px, py)` in a `width × height` canvas.
 *
 * An OFFSET rather than a position, because at depth the position is not representable and the offset
 * always is: it is view-scale by construction, so a double carries it with every bit it has.
 */
export function offsetAtPixel(
  px: number,
  py: number,
  width: number,
  height: number,
  halfHeight: number,
): { dx: number; dy: number } {
  const aspect = width / Math.max(1, height);
  return {
    dx: ((2 * px) / Math.max(1, width) - 1) * halfHeight * aspect,
    dy: (1 - (2 * py) / Math.max(1, height)) * halfHeight,
  };
}

/** Move the centre by a small world increment. Exact at any depth. */
export function shiftCentre(s: AppState, dx: number, dy: number): AppState {
  const c = centreDd(s);
  return { ...s, cx: ddToString(ddAdd(c.cx, [dx, 0])), cy: ddToString(ddAdd(c.cy, [dy, 0])) };
}

/**
 * Zoom by `factor` about the point at world offset `(dx, dy)` from the centre.
 *
 * The centre moves by `offset·(1 − 1/factor)` — an increment, so the double-double add is the whole of
 * the arithmetic and nothing ever subtracts two nearly-equal absolute positions.
 */
export function zoomAbout(s: AppState, dx: number, dy: number, factor: number): AppState {
  const k = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const t = 1 - 1 / k;
  const c = centreDd(s);
  return {
    ...s,
    cx: ddToString(ddAdd(c.cx, ddMul([dx, 0], [t, 0]))),
    cy: ddToString(ddAdd(c.cy, ddMul([dy, 0], [t, 0]))),
    halfHeight: s.halfHeight / k,
  };
}

function clampNum(x: number, lo: number, hi: number, fallback: number): number {
  if (typeof x !== "number" || !Number.isFinite(x)) return fallback;
  return Math.min(hi, Math.max(lo, x));
}
