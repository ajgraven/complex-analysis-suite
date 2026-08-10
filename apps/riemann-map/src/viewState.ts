// =============================================================================
// viewState.ts — the single serializable view-state object (catalog item S2).
//
// Everything the tool can export or share (permalink, saved view, PNG-embedded state, TikZ/SVG
// metadata — §G of the plan) serializes THIS one object, so a figure always carries its own recipe.
// P0 defines the skeleton: the shape, the defaults, and the encode/decode round-trip over the shared
// `@cas/interchange` view-state codec (`#vs=`). Later phases GROW the `render`/`domain` unions and add
// fields; the codec's forward-compat contract (unknown `state` fields preserved, higher `v` accepted)
// means older permalinks keep opening.
//
// Convention tag (ADR-0006): every serialized state records the mathematical convention it was
// produced under, so an exported figure can never be silently re-normalized by a factor of π / 2πi.
// =============================================================================

import { encodeViewState, decodeViewState } from "@cas/interchange";

/** App namespace for the `#vs=` permalink — guards against opening a foreign app's link. */
export const APP_NS = "rm";

/** Mathematical-convention tag carried on every exported figure (ADR-0006). */
export interface ConventionTag {
  /** Area normalization. "standard" = unnormalized (canonical interchange convention). */
  readonly area: "standard";
  /** Contour-integral factor. "standard" = the 1/(2πi) factor is NOT suppressed. */
  readonly contour: "standard";
}

/** The map under study. P0 carries only the executable `expr` form; engine-specific reps arrive later. */
export interface MapState {
  /** An `@cas/expr`-language source string for φ (or φ⁻¹), e.g. "z + 1/z". */
  readonly expr: string;
  /** Which free variables the expression uses (`z` always; `c`/`a` for families). */
  readonly vars: readonly ("z" | "c" | "a")[];
  /** True if the map is anti-holomorphic (uses `conjugate`). */
  readonly antiholomorphic: boolean;
}

/** The complex-plane viewport. `centerHi/Lo` reserve a double-float slot for later df64 deep zoom. */
export interface ViewportState {
  /** Plane center, real part. */
  readonly centerRe: number;
  /** Plane center, imaginary part. */
  readonly centerIm: number;
  /** Zoom (plane half-width = 1/zoom · base); larger = closer. */
  readonly zoom: number;
}

/** How the field is coloured. The `mode` union grows per phase (phase portraits, |φ′|, Böttcher, …). */
export interface RenderState {
  /** Active render mode id. P0 seeds the map-agnostic "phase" portrait. */
  readonly mode: string;
  /** Named colormap ramp (perceptually-uniform families land in P1). */
  readonly palette: string;
}

/**
 * The whole serializable view-state. A `type` (not an `interface`) so it satisfies the codec's
 * `Record<string, unknown>` constraint structurally.
 */
export type RiemannViewState = {
  readonly map: MapState;
  readonly viewport: ViewportState;
  readonly render: RenderState;
  readonly conventions: ConventionTag;
};

/** The default view: the Joukowski map on a centred unit-scale window, phase-portrait coloured. */
export const DEFAULT_VIEW_STATE: RiemannViewState = {
  map: { expr: "z + 1/z", vars: ["z"], antiholomorphic: false },
  viewport: { centerRe: 0, centerIm: 0, zoom: 1 },
  render: { mode: "phase", palette: "viridis" },
  conventions: { area: "standard", contour: "standard" },
};

/** Structural guard: is `value` a well-formed {@link RiemannViewState}? (defensive decode, hostile links). */
export function isRiemannViewState(value: unknown): value is RiemannViewState {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  const map = s.map as Record<string, unknown> | undefined;
  const vp = s.viewport as Record<string, unknown> | undefined;
  const rn = s.render as Record<string, unknown> | undefined;
  const cv = s.conventions as Record<string, unknown> | undefined;
  if (!map || typeof map.expr !== "string" || !Array.isArray(map.vars)) return false;
  if (typeof map.antiholomorphic !== "boolean") return false;
  if (!vp || !Number.isFinite(vp.centerRe) || !Number.isFinite(vp.centerIm)) return false;
  if (!Number.isFinite(vp.zoom) || (vp.zoom as number) <= 0) return false;
  if (!rn || typeof rn.mode !== "string" || typeof rn.palette !== "string") return false;
  if (!cv || cv.area !== "standard" || cv.contour !== "standard") return false;
  return true;
}

/** Encode a view-state into a `#vs=…` permalink fragment via the shared interchange codec. */
export function encodeRiemannState(state: RiemannViewState): string {
  return encodeViewState(APP_NS, state);
}

/**
 * Decode a `#vs=…` hash / link back into a view-state, or `null` if absent, foreign, or malformed.
 * Rejects a link stamped for another app, and structurally validates the payload before trusting it.
 */
export function decodeRiemannState(hashOrLink: string): RiemannViewState | null {
  const env = decodeViewState<unknown>(hashOrLink);
  if (env === null || env.app !== APP_NS) return null;
  return isRiemannViewState(env.state) ? env.state : null;
}
