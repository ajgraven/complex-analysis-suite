// The app's state object: one value the whole page is a function of.
//
// Kept separate from the shell so the permalink codec, the places and the tests can all name the same
// thing, and so "what the reader is looking at" has exactly one representation. Every field here is
// something a permalink must carry; anything derived — the loaded degrees, the statistics, the tone
// ramp — is computed from it and deliberately absent.
import type { AlphabetSpec } from "./engine/alphabet.js";

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
  readonly cx: number;
  readonly cy: number;
  readonly halfHeight: number;
  /** Half-width of the band around `|z| = 1` the near-circle statistic counts. */
  readonly circleDelta: number;
}

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
  cx: 0,
  cy: 0,
  halfHeight: 1.45,
  circleDelta: 0.02,
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
    cx: clampNum(s.cx, -1e6, 1e6, 0),
    cy: clampNum(s.cy, -1e6, 1e6, 0),
    halfHeight: clampNum(s.halfHeight, 1e-6, 1e4, DEFAULT_STATE.halfHeight),
    circleDelta: clampNum(s.circleDelta, 1e-4, 0.5, DEFAULT_STATE.circleDelta),
  };
}

function clampNum(x: number, lo: number, hi: number, fallback: number): number {
  if (typeof x !== "number" || !Number.isFinite(x)) return fallback;
  return Math.min(hi, Math.max(lo, x));
}
