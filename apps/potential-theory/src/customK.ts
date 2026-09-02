// apps/potential-theory — the "draw your own K" custom-polygon editor (PT-6a). A user-editable polygon,
// routed through the app's exact exterior Schwarz–Christoffel path (polygonDomain → @cas/flow's
// fitPolygonFlow), so a hand-drawn K earns the same `=` capacity / equilibrium measure / Green's function
// as the presets. This module is the PURE part — hit-testing, add/remove, orientation, and a compact
// view-state codec for the permalink; the DOM wiring (drag handlers, controls, view lock) lives in
// main-potential.ts. Kept pure so it is node-testable without a canvas.
import type { Pt } from "@cas/flow";

/** The starting shape when the user switches to "Custom polygon": a gentle pentagon, well-conditioned for
 *  the exterior SC fit and obviously editable. Counter-clockwise. */
export const DEFAULT_CUSTOM_CORNERS: readonly Pt[] = Array.from({ length: 5 }, (_, k): Pt => {
  const t = Math.PI / 2 + (2 * Math.PI * k) / 5;
  return [Math.round(1.3 * Math.cos(t) * 1e4) / 1e4, Math.round(1.3 * Math.sin(t) * 1e4) / 1e4];
});

const dist2 = (a: Pt, b: Pt): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Index of the vertex within `tol` world units of `world` (nearest wins), or −1 if none is close. */
export function nearestVertex(corners: readonly Pt[], world: Pt, tol: number): number {
  let best = -1;
  let bestD = tol * tol;
  for (let i = 0; i < corners.length; i++) {
    const d = dist2(corners[i], world);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Insert a vertex at the midpoint of the longest edge (a simple, predictable "add a corner"). */
export function addVertex(corners: readonly Pt[]): Pt[] {
  const n = corners.length;
  let li = 0;
  let lLen = -1;
  for (let i = 0; i < n; i++) {
    const len = dist2(corners[i], corners[(i + 1) % n]);
    if (len > lLen) {
      lLen = len;
      li = i;
    }
  }
  const a = corners[li];
  const b = corners[(li + 1) % n];
  const out = corners.map((p): Pt => [p[0], p[1]]);
  out.splice(li + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  return out;
}

/** Remove vertex `i`. No-op at ≤ 3 vertices (a polygon needs at least a triangle) or for a bad index. */
export function removeVertex(corners: readonly Pt[], i: number): Pt[] {
  const out = corners.map((p): Pt => [p[0], p[1]]);
  if (out.length <= 3 || i < 0 || i >= out.length) return out;
  out.splice(i, 1);
  return out;
}

/** Twice the signed area (shoelace); > 0 ⇔ counter-clockwise. */
export function signedArea2(corners: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

/** Orient the corners counter-clockwise — the convention the exterior-SC solver expects. */
export function ensureCCW(corners: readonly Pt[]): Pt[] {
  const out = corners.map((p): Pt => [p[0], p[1]]);
  return signedArea2(out) < 0 ? out.reverse() : out;
}

// --- view-state permalink codec ---------------------------------------------------------------------
// A compact, forward-tolerant hash — `#vs=` + base64url(JSON) of { d: domainId, k?: rounded corners }.
// The app had no permalink before PT-6a, so this is deliberately minimal (the selected domain + a
// hand-drawn K, the one shareable artifact) and trivial to extend. Content is ASCII (an id + numbers),
// so plain btoa/atob suffice (available in the browser and in Node ≥ 16, so this stays node-testable).

export interface ViewState {
  domain: string;
  corners?: Pt[];
}

const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

const b64urlEncode = (s: string): string => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s: string): string => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export function encodeViewState(v: ViewState): string {
  const o: { d: string; k?: number[][] } = { d: v.domain };
  if (v.corners && v.corners.length >= 3) o.k = v.corners.map((p) => [round4(p[0]), round4(p[1])]);
  return "#vs=" + b64urlEncode(JSON.stringify(o));
}

export function decodeViewState(hash: string): ViewState | null {
  const m = /[#&]vs=([A-Za-z0-9\-_]+)/.exec(hash || "");
  if (!m) return null;
  try {
    const o = JSON.parse(b64urlDecode(m[1])) as { d?: unknown; k?: unknown };
    if (typeof o.d !== "string") return null;
    const out: ViewState = { domain: o.d };
    if (Array.isArray(o.k)) {
      const corners: Pt[] = [];
      for (const p of o.k) {
        if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) corners.push([Number(p[0]), Number(p[1])]);
      }
      if (corners.length >= 3) out.corners = corners;
    }
    return out;
  } catch {
    return null;
  }
}
