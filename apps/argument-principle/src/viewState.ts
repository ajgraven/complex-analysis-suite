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
  /** Pinned (§11 C7): the circle is fixed (isolate-a-root) and does NOT follow the cursor until released. */
  readonly pinned?: boolean;
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
 * The point w₀ the winding is measured about. The classic argument principle measures about the origin
 * (counting zeros of f); dragging the target to w₀ ≠ 0 counts solutions of f(z) = w₀ inside γ instead
 * (§11 D8). Optional on the wire and back-filled to the origin, so older permalinks keep opening.
 */
export interface TargetState {
  readonly re: number;
  readonly im: number;
}

/**
 * Pedagogy render toggles (§11). Each is wired by a later stage; all are optional on the wire and
 * back-filled from {@link DEFAULT_PEDAGOGY}, so a permalink written before a toggle existed still opens.
 */
export interface PedagogyState {
  /** A2 — draw γ with the same parameter-`t` color ramp as f(γ). */
  readonly coupleColor: boolean;
  /** A1 — the (always-on) argument strip-chart panel. */
  readonly showArgGraph: boolean;
  /** A3 — the swept-wedge in the w-plane. */
  readonly showWedge: boolean;
  /** B4 — the running ∮ f′/f integral trace/readout. */
  readonly showIntegral: boolean;
  /** B5 — per-root argument-decomposition vectors (an on-demand overlay). */
  readonly showDecomposition: boolean;
}

/** The winding target's default: the origin (the classic zero-counting argument principle). */
export const DEFAULT_TARGET: TargetState = { re: 0, im: 0 };

/** Pedagogy defaults: the always-on teaching surfaces on, the decomposition overlay off until asked. */
export const DEFAULT_PEDAGOGY: PedagogyState = {
  coupleColor: true,
  showArgGraph: true,
  showWedge: true,
  showIntegral: true,
  showDecomposition: false,
};

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
  /** The winding target w₀ (§11 D8). Optional for back-compat; back-filled to the origin on decode. */
  readonly target?: TargetState;
  /** Pedagogy render toggles (§11). Optional for back-compat; back-filled on decode. */
  readonly pedagogy?: PedagogyState;
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
  target: DEFAULT_TARGET,
  pedagogy: DEFAULT_PEDAGOGY,
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

/** Sampling resolution a decoded link may carry — bounded so a crafted link can't trigger a huge alloc. */
const MIN_RESOLUTION = 3;
const MAX_RESOLUTION = 5000;

/**
 * A well-formed freehand path: 3…MAX_RESOLUTION finite [x, y] vertices. The UPPER bound is the
 * load-bearing part of this defensive decode — without it a crafted `path` permalink could carry a
 * multi-million-vertex array that `cumulativeArg` / `logDerivCumulative` iterate every frame (the same
 * self-DoS `sampleCircle` caps for circles). A real freehand draw is decimated to a few hundred points.
 */
function isFinitePointArray(v: unknown): boolean {
  if (!Array.isArray(v) || v.length < 3 || v.length > MAX_RESOLUTION) return false;
  for (const p of v) {
    if (!Array.isArray(p) || p.length < 2) return false;
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false;
  }
  return true;
}

/** A well-formed target: absent is fine (back-filled to the origin); if present, finite re/im. */
function isTargetState(v: unknown): boolean {
  if (v === undefined) return true;
  if (v === null || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return Number.isFinite(t.re) && Number.isFinite(t.im);
}

/**
 * A well-formed pedagogy block: absent is fine (back-filled); if present it must be an object whose values
 * are all booleans. Unknown keys are tolerated so a newer permalink carrying extra toggles still opens.
 */
function isPedagogyState(v: unknown): boolean {
  if (v === undefined) return true;
  if (v === null || typeof v !== "object") return false;
  for (const val of Object.values(v as Record<string, unknown>)) {
    if (typeof val !== "boolean") return false;
  }
  return true;
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
  if (ct.kind === "path" && !isFinitePointArray(ct.points)) return false;
  if (!rn || typeof rn.showDomainCurve !== "boolean" || typeof rn.showImageCurve !== "boolean") {
    return false;
  }
  if (
    !Number.isFinite(rn.resolution) ||
    (rn.resolution as number) < MIN_RESOLUTION ||
    (rn.resolution as number) > MAX_RESOLUTION
  ) {
    return false;
  }
  if (!cv || cv.area !== "standard" || cv.contour !== "standard") return false;
  if (!isTargetState(s.target)) return false;
  if (!isPedagogyState(s.pedagogy)) return false;
  return true;
}

/**
 * Back-fill the optional fields ({@link TargetState}, {@link PedagogyState}) so a decoded state — including
 * an older permalink written before these fields existed — is always complete. Preserves every field the
 * link did carry, and merges pedagogy toggle-by-toggle so a partial (older) block still gets today's
 * defaults for any toggle it lacks.
 */
export function withDefaults(state: ArgPrincipleViewState): ArgPrincipleViewState {
  return {
    ...state,
    target: state.target ?? DEFAULT_TARGET,
    pedagogy: { ...DEFAULT_PEDAGOGY, ...(state.pedagogy ?? {}) },
  };
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
  return isArgPrincipleViewState(env.state) ? withDefaults(env.state) : null;
}
