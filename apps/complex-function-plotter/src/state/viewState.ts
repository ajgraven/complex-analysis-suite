/**
 * Share-links (catalog K2). The plotter's view-defining state round-trips through `@cas/interchange`'s
 * shared, versioned view-state codec under the app namespace "cfp" — so the transport/versioning
 * discipline is reused and a foreign link (another app's "#vs=") is rejected. Values are validated on
 * the way back in (a stale or hand-edited link must fail soft, not render garbage).
 */
import { encodeViewState, decodeViewState } from "@cas/interchange";
import { DEFAULT_ANIM, type AnimConfig } from "../ui/animate.js";
import { DEFAULT_CAMERA } from "../render3d/camera.js";

export const APP_NS = "cfp";

/** The 3D-view state (catalog F5–F7): the render mode plus the orbit-camera and surface-height settings,
 *  so a shared landscape / linked figure reopens as it was framed. The sphere's arcball rotation is
 *  interactive-only and not persisted — a sphere link reopens in sphere mode at the default orientation. */
export interface View3dState {
  mode: "2d" | "3d" | "sphere" | "linked";
  azimuth: number;
  elevation: number;
  distance: number;
  ortho: boolean;
  heightMode: number;
  heightScale: number;
  specular: boolean;
  opacity: number;
}

/** The default 3D-view state: 2D mode with the default orbit camera and a log-height surface. */
export const DEFAULT_V3D: View3dState = {
  mode: "2d",
  azimuth: DEFAULT_CAMERA.azimuth,
  elevation: DEFAULT_CAMERA.elevation,
  distance: DEFAULT_CAMERA.distance,
  ortho: DEFAULT_CAMERA.ortho,
  heightMode: 0,
  heightScale: 1,
  specular: false,
  opacity: 1,
};

export interface PlotterState extends Record<string, unknown> {
  /** The ACTIVE (plotted) function's source — kept as the primary field for backward-compat: a
   *  pre-A7 link (only `expr`) still opens, its expression becoming slot `f`. */
  expr: string;
  /** The two function slots (catalog A7) and which is active. `expr` mirrors the active slot. */
  exprF: string;
  exprG: string;
  active: "f" | "g";
  cx: number;
  cy: number;
  span: number;
  colormap: number;
  modulus: number;
  enhance: number;
  sectors: number;
  crisp: number;
  hueShift: number;
  hueSign: number;
  /** Live named-parameter values (ADR-0011 / catalog G1): `{ a: [re, im], … }`. Absent on a
   *  parameter-free map and on pre-parameter links (which decode to `{}`, so they still render). */
  params: Record<string, [number, number]>;
  /** Animation-variable `t` transport config (catalog G2). Playback state is not persisted — a loaded
   *  link opens paused at the saved `t` (which travels in `params`). */
  anim: AnimConfig;
  /** Render mode + 3D camera/height (catalog F5–F7), so a shared landscape / linked / sphere figure
   *  reopens in its view. Absent on a pre-3D-persist link → decodes to the 2D default. */
  v3d: View3dState;
}

/** Validate a decoded `anim` blob, falling back to {@link DEFAULT_ANIM} field-by-field. */
function cleanAnim(raw: unknown): AnimConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const numOr = (v: unknown, d: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  return {
    t0: numOr(o.t0, DEFAULT_ANIM.t0),
    t1: numOr(o.t1, DEFAULT_ANIM.t1),
    speed: Math.max(0, numOr(o.speed, DEFAULT_ANIM.speed)),
    loop: typeof o.loop === "boolean" ? o.loop : DEFAULT_ANIM.loop,
  };
}

/** Validate a decoded `params` blob: keep only `name → [finite, finite]` entries, drop anything else
 *  (a stale or hand-edited link must fail soft). */
function cleanParams(raw: unknown): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(v) &&
      v.length === 2 &&
      typeof v[0] === "number" &&
      typeof v[1] === "number" &&
      Number.isFinite(v[0]) &&
      Number.isFinite(v[1])
    ) {
      out[name] = [v[0], v[1]];
    }
  }
  return out;
}

/** Validate a decoded `v3d` blob, falling back to the 2D default view + default camera field-by-field. */
function cleanV3d(raw: unknown): View3dState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const numOr = (v: unknown, d: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  const boolOr = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
  const mode =
    o.mode === "3d" || o.mode === "sphere" || o.mode === "linked" ? o.mode : "2d";
  return {
    mode,
    azimuth: numOr(o.azimuth, DEFAULT_CAMERA.azimuth),
    // clamp to [0, π/2]: the orbit drag stays under 90°, but the discrete top-down snap is exactly π/2.
    elevation: Math.min(Math.PI / 2, Math.max(0, numOr(o.elevation, DEFAULT_CAMERA.elevation))),
    distance: Math.min(60, Math.max(0.3, numOr(o.distance, DEFAULT_CAMERA.distance))),
    ortho: boolOr(o.ortho, DEFAULT_CAMERA.ortho),
    heightMode: Math.min(2, Math.max(0, Math.round(numOr(o.heightMode, 0)))),
    heightScale: Math.min(3, Math.max(0.1, numOr(o.heightScale, 1))),
    specular: boolOr(o.specular, false),
    opacity: Math.min(1, Math.max(0.1, numOr(o.opacity, 1))),
  };
}

export function encodeState(state: PlotterState): string {
  return encodeViewState(APP_NS, state);
}

/** A full shareable URL (origin + path + `#vs=…`) for the given state. */
export function shareUrl(state: PlotterState): string {
  return `${location.origin}${location.pathname}${encodeState(state)}`;
}

/** Decode plotter state from a hash / URL, or null if absent, not ours, or malformed. */
export function decodeState(hashOrLink: string): PlotterState | null {
  const env = decodeViewState<Partial<PlotterState>>(hashOrLink);
  if (!env || env.app !== APP_NS) return null;
  const s = env.state;
  if (!s || typeof s.expr !== "string") return null;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" ? v : fallback;
  // Reconstruct the two slots (A7). A pre-A7 link carries only `expr`, which becomes slot f.
  const active: "f" | "g" = s.active === "g" ? "g" : "f";
  const exprF = str(s.exprF, active === "f" ? s.expr : "z^2");
  const exprG = str(s.exprG, active === "g" ? s.expr : "1/z");
  return {
    expr: active === "f" ? exprF : exprG,
    exprF,
    exprG,
    active,
    cx: num(s.cx, 0),
    cy: num(s.cy, 0),
    span: num(s.span, 2),
    colormap: num(s.colormap, 0),
    modulus: num(s.modulus, 2),
    enhance: num(s.enhance, 0),
    sectors: num(s.sectors, 12),
    crisp: num(s.crisp, 1),
    hueShift: num(s.hueShift, 0),
    hueSign: num(s.hueSign, 1),
    params: cleanParams(s.params),
    anim: cleanAnim(s.anim),
    v3d: cleanV3d(s.v3d),
  };
}
