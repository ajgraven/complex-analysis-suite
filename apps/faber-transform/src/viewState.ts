// viewState.ts — the single serializable view-state object. Everything the tool can share (the `#vs=`
// permalink) serializes THIS one object, so a figure carries its own recipe. Encode/decode round-trips
// over the shared @cas/interchange codec, with a defensive structural guard + back-fill so older or
// crafted links open safely (or are rejected).
//
// Convention tag (ADR-0006): the exterior Faber transform is convention-neutral (no π / 2πi), but the
// state still records a `normalization: "standard"` tag for provenance parity with the sibling apps.
import { encodeViewState, decodeViewState } from "@cas/interchange";

/** App namespace for the `#vs=` permalink — guards against opening a foreign app's link. */
export const APP_NS = "ft";

/** Provenance tag carried on every serialized state (ADR-0006). */
export interface ConventionTag {
  readonly normalization: "standard";
}

/** A complex-plane viewport for one panel. */
export interface Viewport {
  readonly centerRe: number;
  readonly centerIm: number;
  readonly zoom: number;
}

/**
 * The input function f on the unit disk. Two exact families:
 *   - monomial:  f(z) = zⁿ                     → Φφ(f) = Fₙ (polynomial, exact)
 *   - pole:      f(z) = 1/(z−z₀)^order, |z₀|>1 → Φφ(f) = closed-form rational image (exact)
 * (Free-form @cas/expr input with the truncated-series path arrives at M3.)
 */
export type InputState =
  | { readonly kind: "monomial"; readonly degree: number }
  | { readonly kind: "pole"; readonly re: number; readonly im: number; readonly order: number };

/** Bounds so a crafted permalink can't request a runaway-degree Faber build. */
export const MIN_DEGREE = 0;
export const MAX_DEGREE = 40;
/** Pole magnitude bounds: strictly outside the unit disk, and finite. */
export const MIN_POLE_R = 1.0001;
export const MAX_POLE_R = 1000;

export type FaberViewState = {
  /** Exterior-map preset id (see presets.ts). */
  readonly phi: string;
  /** Shape-slider value (ignored by fixed presets). */
  readonly shape: number;
  readonly input: InputState;
  /** Unit-disk (left) panel view. */
  readonly zView: Viewport;
  /** K-side (right) panel view. */
  readonly wView: Viewport;
  readonly conventions: ConventionTag;
};

/** The default view — the interval preset with f(z) = z³, so the right panel shows F₃ of [−2, 2]. */
export const DEFAULT_VIEW_STATE: FaberViewState = {
  phi: "interval",
  shape: 0.5,
  input: { kind: "monomial", degree: 3 },
  zView: { centerRe: 0, centerIm: 0, zoom: 1.5 },
  wView: { centerRe: 0, centerIm: 0, zoom: 0.78 },
  conventions: { normalization: "standard" },
};

function isViewport(v: Record<string, unknown> | undefined): boolean {
  return (
    !!v &&
    Number.isFinite(v.centerRe) &&
    Number.isFinite(v.centerIm) &&
    Number.isFinite(v.zoom) &&
    (v.zoom as number) > 0
  );
}

/** A well-formed input block (monomial or pole). */
function isInputState(input: Record<string, unknown> | undefined): boolean {
  if (!input) return false;
  if (input.kind === "monomial") {
    const d = input.degree;
    return (
      Number.isFinite(d) &&
      Number.isInteger(d) &&
      (d as number) >= MIN_DEGREE &&
      (d as number) <= MAX_DEGREE
    );
  }
  if (input.kind === "pole") {
    if (!Number.isFinite(input.re) || !Number.isFinite(input.im)) return false;
    const r = Math.hypot(input.re as number, input.im as number);
    if (!(r >= MIN_POLE_R && r <= MAX_POLE_R)) return false;
    return input.order === 1 || input.order === 2;
  }
  return false;
}

/** Structural guard: is `value` a well-formed {@link FaberViewState}? (defensive decode). */
export function isFaberViewState(value: unknown): value is FaberViewState {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  if (typeof s.phi !== "string") return false;
  if (!Number.isFinite(s.shape)) return false;
  if (!isInputState(s.input as Record<string, unknown> | undefined)) return false;
  if (!isViewport(s.zView as Record<string, unknown> | undefined)) return false;
  if (!isViewport(s.wView as Record<string, unknown> | undefined)) return false;
  const cv = s.conventions as Record<string, unknown> | undefined;
  if (!cv || cv.normalization !== "standard") return false;
  return true;
}

/** Encode a view-state into a `#vs=…` permalink fragment via the shared interchange codec. */
export function encodeFaberState(state: FaberViewState): string {
  return encodeViewState(APP_NS, state);
}

/** Decode a `#vs=…` hash/link back into a view-state, or `null` if absent, foreign, or malformed. */
export function decodeFaberState(hashOrLink: string): FaberViewState | null {
  const env = decodeViewState<unknown>(hashOrLink);
  if (env === null || env.app !== APP_NS) return null;
  return isFaberViewState(env.state) ? env.state : null;
}
