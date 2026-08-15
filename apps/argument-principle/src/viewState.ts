// =============================================================================
// viewState.ts — the single serializable view-state object.
//
// Everything the tool can share or export (permalink, PNG-embedded state) serializes THIS one object,
// so a figure always carries its own recipe. P0 defines the skeleton: the shape, the defaults, and the
// encode/decode round-trip over the shared `@cas/interchange` view-state codec (`#vs=`). Later phases
// GROW the `contour`/`render` shapes (freehand paths, the `res` slider, the imported-map source) and add
// fields; the codec's forward-compat contract (unknown `state` fields preserved, higher `v` accepted)
// means older permalinks keep opening.
//
// Convention tag (ADR-0006): every serialized state records the mathematical convention it was produced
// under — here the 1/(2πi) contour-integral factor is NOT suppressed (standard) — so an exported figure
// can never be silently re-normalized by a factor of π / 2πi.
// =============================================================================

import { encodeViewState, decodeViewState } from "@cas/interchange";

/** App namespace for the `#vs=` permalink — guards against opening a foreign app's link. */
export const APP_NS = "ap";

/** Mathematical-convention tag carried on every exported figure (ADR-0006). */
export interface ConventionTag {
  /** Area normalization. "standard" = unnormalized (canonical interchange convention). */
  readonly area: "standard";
  /** Contour-integral factor. "standard" = the 1/(2πi) factor is NOT suppressed. */
  readonly contour: "standard";
}

/** The function f under study. P0 carries only the executable `expr` form. */
export interface MapState {
  /** An `@cas/expr`-language source string for f, e.g. "z*z*z - 1". */
  readonly expr: string;
  /** Which free variables the expression uses (`z` always; `c`/`a` for families, later). */
  readonly vars: readonly ("z" | "c" | "a")[];
  /** True if f is anti-holomorphic (uses `conjugate`) — no argument principle then. */
  readonly antiholomorphic: boolean;
}

/** A complex-plane viewport for one pane (z-plane or w-plane). */
export interface Viewport {
  /** Plane center, real part. */
  readonly centerRe: number;
  /** Plane center, imaginary part. */
  readonly centerIm: number;
  /** Zoom (world half-height = base / zoom); larger = closer. */
  readonly zoom: number;
}

/**
 * The contour γ. P0 carries the default circle (P1 makes it follow the cursor; P2 adds the freehand
 * `kind:"path"` with a `points` polyline). An unknown `kind` falls back to a circle.
 */
export interface ContourState {
  /** "circle" (default) | "path" (freehand, P2). */
  readonly kind: string;
  /** Circle center + radius (also the fallback frame for a path). */
  readonly centerRe: number;
  readonly centerIm: number;
  readonly radius: number;
  /** Freehand path vertices in world coordinates (P2); absent for a circle. */
  readonly points?: readonly (readonly [number, number])[];
}

/** Render toggles + numerical resolution (the `res` slider). */
export interface RenderState {
  /** Draw the contour γ in the z-plane. */
  readonly showDomainCurve: boolean;
  /** Draw the image f(γ) in the w-plane. */
  readonly showImageCurve: boolean;
  /** Sample count for the contour (and, later, the finder grid density) — the `res` slider. */
  readonly resolution: number;
}

/**
 * The whole serializable view-state. A `type` (not an `interface`) so it satisfies the codec's
 * `Record<string, unknown>` constraint structurally.
 */
export type ArgPrincipleViewState = {
  readonly map: MapState;
  readonly zView: Viewport;
  readonly wView: Viewport;
  readonly contour: ContourState;
  readonly render: RenderState;
  readonly conventions: ConventionTag;
};

/**
 * The default view — f = z³ − 1, whose three zeros are the cube roots of unity. A contour of radius 1.5
 * about the origin encloses all three, so the image f(γ) winds three times about 0: the argument
 * principle's N − P = winding, visible on load.
 */
export const DEFAULT_VIEW_STATE: ArgPrincipleViewState = {
  map: { expr: "z*z*z - 1", vars: ["z"], antiholomorphic: false },
  zView: { centerRe: 0, centerIm: 0, zoom: 1 },
  wView: { centerRe: 0, centerIm: 0, zoom: 0.4 },
  contour: { kind: "circle", centerRe: 0, centerIm: 0, radius: 1.5 },
  render: { showDomainCurve: true, showImageCurve: true, resolution: 300 },
  conventions: { area: "standard", contour: "standard" },
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

/** Structural guard: is `value` a well-formed {@link ArgPrincipleViewState}? (defensive decode). */
export function isArgPrincipleViewState(value: unknown): value is ArgPrincipleViewState {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  const map = s.map as Record<string, unknown> | undefined;
  const ct = s.contour as Record<string, unknown> | undefined;
  const rn = s.render as Record<string, unknown> | undefined;
  const cv = s.conventions as Record<string, unknown> | undefined;
  if (!map || typeof map.expr !== "string" || !Array.isArray(map.vars)) return false;
  if (typeof map.antiholomorphic !== "boolean") return false;
  if (!isViewport(s.zView as Record<string, unknown> | undefined)) return false;
  if (!isViewport(s.wView as Record<string, unknown> | undefined)) return false;
  if (!ct || typeof ct.kind !== "string") return false;
  if (!Number.isFinite(ct.centerRe) || !Number.isFinite(ct.centerIm)) return false;
  if (typeof ct.radius !== "number" || !(ct.radius > 0)) return false;
  if (!rn || typeof rn.showDomainCurve !== "boolean" || typeof rn.showImageCurve !== "boolean") {
    return false;
  }
  if (!Number.isFinite(rn.resolution)) return false;
  if (!cv || cv.area !== "standard" || cv.contour !== "standard") return false;
  return true;
}

/** Encode a view-state into a `#vs=…` permalink fragment via the shared interchange codec. */
export function encodeArgPrincipleState(state: ArgPrincipleViewState): string {
  return encodeViewState(APP_NS, state);
}

/**
 * Decode a `#vs=…` hash / link back into a view-state, or `null` if absent, foreign, or malformed.
 * Rejects a link stamped for another app, and structurally validates the payload before trusting it.
 */
export function decodeArgPrincipleState(hashOrLink: string): ArgPrincipleViewState | null {
  const env = decodeViewState<unknown>(hashOrLink);
  if (env === null || env.app !== APP_NS) return null;
  return isArgPrincipleViewState(env.state) ? env.state : null;
}
