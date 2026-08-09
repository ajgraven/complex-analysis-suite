/**
 * Share-links (catalog K2). The plotter's view-defining state round-trips through `@cas/interchange`'s
 * shared, versioned view-state codec under the app namespace "cfp" — so the transport/versioning
 * discipline is reused and a foreign link (another app's "#vs=") is rejected. Values are validated on
 * the way back in (a stale or hand-edited link must fail soft, not render garbage).
 */
import { encodeViewState, decodeViewState } from "@cas/interchange";

export const APP_NS = "cfp";

export interface PlotterState extends Record<string, unknown> {
  expr: string;
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
  return {
    expr: s.expr,
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
  };
}
