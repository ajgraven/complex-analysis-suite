// Shareable `#vs=` permalinks, on @cas/interchange's app-namespaced, forward-compatible envelope.
//
// Two rules taken from Contour Integration's codec, because both earn their keep here:
//
//   · **A link that cannot be honoured REFUSES BY NAME.** `null` means "there was no link"; a string
//     means "there was one and here is why it is not being opened". They are different events and the
//     shell shows them differently — an unreadable alphabet or a degree past the cap must not silently
//     become the default picture, because the reader would then be looking at something other than what
//     they were sent while believing otherwise.
//   · **The payload is a DIFF against the defaults.** Everything here is a small scalar, so this is not
//     the space saving it was there; it is the version tolerance. A field added later is absent from an
//     older link and takes its default, and an older app reading a newer link ignores what it does not
//     know — which is what `decodeViewState` already promises about the envelope.
//
// Ranges are not validated here beyond what `clampState` does; the shell's controls clamp, and a link
// from a future version with a wider slider should open at this version's limit rather than refuse.
import { decodeViewState, encodeViewState } from "@cas/interchange";
import type { AlphabetSpec } from "./engine/alphabet.js";
import { compileAlphabet } from "./engine/alphabet.js";
import { MAX_DEPTH as WALK_MAX_DEPTH, MIN_DEPTH as WALK_MIN_DEPTH } from "./engine/limit/walk.js";
import { clampState, DEFAULT_STATE, MAX_DEGREE } from "./state.js";
import type { AppState } from "./state.js";

const APP = "pr";

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";

/** What a decode produced: a state, nothing, or a refusal with its reason. */
export type DecodeResult = { state: AppState } | { refused: string } | null;

/** Encode a state as a `#vs=` fragment, carrying only what differs from the defaults. */
export function encodeState(state: AppState): string {
  const s = clampState(state);
  const d = DEFAULT_STATE;
  const payload: Record<string, unknown> = {};
  if (s.alphabet.preset !== d.alphabet.preset) payload.preset = s.alphabet.preset;
  if (s.alphabet.n !== undefined) payload.n = s.alphabet.n;
  if (s.alphabet.custom !== undefined) payload.custom = s.alphabet.custom;
  if (s.minDegree !== d.minDegree) payload.dmin = s.minDegree;
  if (s.maxDegree !== d.maxDegree) payload.dmax = s.maxDegree;
  if (s.colour !== d.colour) payload.colour = s.colour;
  if (s.exposure !== d.exposure) payload.exposure = round(s.exposure);
  if (s.gamma !== d.gamma) payload.gamma = round(s.gamma);
  if (s.cx !== d.cx) payload.cx = round(s.cx);
  if (s.cy !== d.cy) payload.cy = round(s.cy);
  if (s.halfHeight !== d.halfHeight) payload.h = round(s.halfHeight);
  if (s.circleDelta !== d.circleDelta) payload.delta = round(s.circleDelta);
  if (s.engine !== d.engine) payload.engine = s.engine;
  if (s.depth !== d.depth) payload.depth = s.depth;
  if (s.annulus !== d.annulus) payload.annulus = s.annulus;
  return encodeViewState(APP, payload);
}

/** Nine significant figures: far beyond what a 1024-pixel stage can show, and short in the URL. */
function round(x: number): number {
  return Number(x.toPrecision(9));
}

/**
 * Decode a `#vs=` link into a state.
 *
 * Returns `null` when there is no link for this app at all, `{ refused }` when there is one that cannot
 * be honoured, and `{ state }` otherwise.
 */
export function decodeState(hashOrLink: string): DecodeResult {
  const env = decodeViewState(hashOrLink);
  if (env === null) {
    // There IS something that looks like a view-state link but it did not parse: say so rather than
    // treating a truncated paste as an absence.
    return /(?:[#&?]|^)vs=/.test(hashOrLink) ? { refused: "this link is truncated or damaged" } : null;
  }
  if (env.app !== APP) return { refused: `this link is for another app in the suite ("${env.app}")` };

  const s = env.state as Record<string, unknown>;
  const preset = s.preset;
  const alphabet: AlphabetSpec = {
    preset: isStr(preset) ? (preset as AlphabetSpec["preset"]) : DEFAULT_STATE.alphabet.preset,
    ...(isNum(s.n) ? { n: s.n } : {}),
    ...(isStr(s.custom) ? { custom: s.custom } : {}),
  };
  // The alphabet is the one field whose validity cannot be clamped into range — an unknown preset or an
  // unreadable custom list has no nearest legal value, so it refuses with the engine's own reason.
  const compiled = compileAlphabet(alphabet);
  if ("error" in compiled) return { refused: `the alphabet in this link cannot be read: ${compiled.error}` };

  if (isNum(s.dmin) && (s.dmin < 1 || s.dmin > MAX_DEGREE)) {
    return { refused: `this link asks for degree ${s.dmin}, outside the range 1–${MAX_DEGREE} this app computes` };
  }
  if (isNum(s.dmax) && (s.dmax < 1 || s.dmax > MAX_DEGREE)) {
    return { refused: `this link asks for degree ${s.dmax}, outside the range 1–${MAX_DEGREE} this app computes` };
  }
  if (s.colour !== undefined && s.colour !== "density" && s.colour !== "degree") {
    return { refused: `this link asks for a colour mode this app does not have ("${String(s.colour)}")` };
  }
  if (s.engine !== undefined && s.engine !== "auto" && s.engine !== "roots" && s.engine !== "limit") {
    return { refused: `this link asks for an engine this app does not have ("${String(s.engine)}")` };
  }
  if (isNum(s.depth) && (s.depth < WALK_MIN_DEPTH || s.depth > WALK_MAX_DEPTH)) {
    return {
      refused: `this link asks for limit-set depth ${s.depth}, outside the range ${WALK_MIN_DEPTH}–${WALK_MAX_DEPTH} this app walks`,
    };
  }
  if (s.annulus !== undefined && typeof s.annulus !== "boolean") {
    return { refused: `this link carries an unreadable value for "annulus"` };
  }
  for (const key of ["exposure", "gamma", "cx", "cy", "h", "delta", "depth"] as const) {
    if (s[key] !== undefined && !isNum(s[key])) {
      return { refused: `this link carries an unreadable value for "${key}"` };
    }
  }

  return {
    state: clampState({
      alphabet,
      minDegree: isNum(s.dmin) ? s.dmin : DEFAULT_STATE.minDegree,
      maxDegree: isNum(s.dmax) ? s.dmax : DEFAULT_STATE.maxDegree,
      colour: s.colour === "degree" ? "degree" : "density",
      exposure: isNum(s.exposure) ? s.exposure : DEFAULT_STATE.exposure,
      gamma: isNum(s.gamma) ? s.gamma : DEFAULT_STATE.gamma,
      cx: isNum(s.cx) ? s.cx : DEFAULT_STATE.cx,
      cy: isNum(s.cy) ? s.cy : DEFAULT_STATE.cy,
      halfHeight: isNum(s.h) ? s.h : DEFAULT_STATE.halfHeight,
      circleDelta: isNum(s.delta) ? s.delta : DEFAULT_STATE.circleDelta,
      engine: s.engine === "roots" || s.engine === "limit" ? s.engine : "auto",
      depth: isNum(s.depth) ? s.depth : DEFAULT_STATE.depth,
      annulus: s.annulus === true,
    }),
  };
}
