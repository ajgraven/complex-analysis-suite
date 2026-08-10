/**
 * Share-links (catalog K2). The plotter's view-defining state round-trips through `@cas/interchange`'s
 * shared, versioned view-state codec under the app namespace "cfp" — so the transport/versioning
 * discipline is reused and a foreign link (another app's "#vs=") is rejected. Values are validated on
 * the way back in (a stale or hand-edited link must fail soft, not render garbage).
 */
import { encodeViewState, decodeViewState } from "@cas/interchange";
import { DEFAULT_ANIM, type AnimConfig } from "../ui/animate.js";

export const APP_NS = "cfp";

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
  };
}
