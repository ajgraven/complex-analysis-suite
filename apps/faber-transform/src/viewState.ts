// viewState.ts — the single serializable view-state object. Everything the tool can share (the `#vs=`
// permalink) serializes THIS one object, so a figure carries its own recipe. Encode/decode round-trips
// over the shared @cas/interchange codec, with a defensive structural guard + back-fill so older or
// crafted links open safely (or are rejected).
//
// Convention tag (ADR-0006): the exterior Faber transform is convention-neutral (no π / 2πi), but the
// state still records a `normalization: "standard"` tag for provenance parity with the sibling apps.
import { encodeViewState, decodeViewState } from "@cas/interchange";
import { DEFAULT_COLORING } from "./render/coloring.js";
import type { ColoringOptions } from "./render/coloring.js";

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
 * The input function f on the unit disk. Three families:
 *   - monomial:  f(z) = zⁿ                     → Φφ(f) = Fₙ (polynomial, exact `=`)
 *   - pole:      f(z) = 1/(z−z₀)^order, |z₀|>1 → Φφ(f) = closed-form rational image (exact `=`)
 *   - expr:      free-form f(z) via @cas/expr  → Φφ(f) ≈ Σ_{n≤N} bₙ Fₙ (truncated series, `≈`)
 */
export type InputState =
  | { readonly kind: "monomial"; readonly degree: number }
  | { readonly kind: "pole"; readonly re: number; readonly im: number; readonly order: number }
  | { readonly kind: "expr"; readonly expr: string; readonly N: number };

/** Bounds so a crafted permalink can't request a runaway-degree Faber build. */
export const MIN_DEGREE = 0;
export const MAX_DEGREE = 40;
/** Pole magnitude bounds: strictly outside the unit disk, and finite. */
export const MIN_POLE_R = 1.0001;
export const MAX_POLE_R = 1000;
/** GPU coefficient-array cap (render/gpu.ts `uNum[]`/`uDen[]` length): a Faber-image polynomial or
 *  rational is uploaded — and thus faithfully rendered — only up to degree `GPU_COEFF_CAP − 1`. The
 *  series truncation below and the monomial degree (`MAX_DEGREE = 40`) must fit under it, or the GPU
 *  silently truncates while the CPU / root markers / readout do not. */
export const GPU_COEFF_CAP = 48;
/** Truncation-order bounds for the free-form series path (capped to what the GPU can upload). */
export const MIN_TRUNCATION = 1;
export const MAX_TRUNCATION = GPU_COEFF_CAP - 1;
/** Max length of a free-form expression carried in a permalink (a crafted-link safety bound). */
export const MAX_EXPR_LEN = 256;
/** Custom-polygon bounds (crafted-link safety + solver sanity): 3–16 vertices, coordinates in [−COORD, COORD]. */
export const MIN_POLYGON_VERTS = 3;
export const MAX_POLYGON_VERTS = 16;
/** Coordinate bound — matches the editor's editable world extent, so a decoded polygon is always on-canvas. */
export const MAX_POLYGON_COORD = 2;
/** Consecutive vertices must be at least this far apart (rejects coincident/degenerate polygons). */
export const MIN_POLYGON_EDGE = 0.03;
/** The domain id that draws φ from `customPolygon` (the editor) rather than a preset. */
export const CUSTOM_PHI = "custom";
/** The domain id that builds φ from the typed formula `phiExpr` (a symbolic exterior map) rather than a preset. */
export const CUSTOM_FORMULA = "custom-formula";
/** Default φ formula shown when the user first switches to the custom-formula domain (a deltoid-like map). */
export const DEFAULT_PHI_EXPR = "z + 0.4/z^2";
/** Corner-suppression strength m for the weighted Faber Q_{n,m} (M3): m=1 over-corrects, so the floor is 2. */
export const MIN_SUPPRESS_M = 2;
export const MAX_SUPPRESS_M = 8;
/** Default suppression strength when the toggle is first turned on. */
export const DEFAULT_SUPPRESS_M = 4;

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
  /** Scatter the transform's zeros (the Faber roots) on the right panel. Optional; defaults true. */
  readonly showRoots?: boolean;
  /** Phase-portrait coloring style (shared with the GPU shader). Optional; back-filled with DEFAULT_COLORING. */
  readonly coloring?: ColoringOptions;
  /** The editor polygon (counter-clockwise `[x,y]` vertices), used as the domain when `phi === "custom"`. */
  readonly customPolygon?: readonly (readonly [number, number])[];
  /** The typed exterior-map formula φ(z), used as the domain when `phi === "custom-formula"`. */
  readonly phiExpr?: string;
  /** Corner suppression (M3): render Q_{n,m} instead of Fₙ for a monomial input on a polygonal K. */
  readonly suppressCorners?: boolean;
  /** Suppression strength m ∈ [2, 8] (larger = milder weight, closer to Fₙ but provably lower overshoot). */
  readonly suppressStrength?: number;
  /** Boundary-correspondence overlay: hue-match ∂𝔻 ↔ ∂K by θ and drop matched dots. Optional; default off. */
  readonly boundaryCorr?: boolean;
  /** Transplant grid overlay (monomial input): the φ-image of the disk's polar grid (Fₙ∘φ ≈ zⁿ). Default off. */
  readonly transplant?: boolean;
};

/** The default view — the deltoid domain with f(z) = z³, so the right panel shows F₃ on the deltoid K. */
export const DEFAULT_VIEW_STATE: FaberViewState = {
  phi: "deltoid",
  shape: 0.85,
  input: { kind: "monomial", degree: 3 },
  zView: { centerRe: 0, centerIm: 0, zoom: 1.5 },
  wView: { centerRe: 0, centerIm: 0, zoom: 1.18 },
  conventions: { normalization: "standard" },
  showRoots: true,
  coloring: DEFAULT_COLORING,
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
  if (input.kind === "expr") {
    if (typeof input.expr !== "string" || input.expr.length === 0 || input.expr.length > MAX_EXPR_LEN) {
      return false;
    }
    const n = input.N;
    return (
      Number.isFinite(n) && Number.isInteger(n) && (n as number) >= MIN_TRUNCATION && (n as number) <= MAX_TRUNCATION
    );
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
  if (s.showRoots !== undefined && typeof s.showRoots !== "boolean") return false;
  if (s.coloring !== undefined && !isColoringOptions(s.coloring as Record<string, unknown> | undefined)) return false;
  if (s.customPolygon !== undefined && !isCustomPolygon(s.customPolygon)) return false;
  if (s.phi === CUSTOM_PHI && !isCustomPolygon(s.customPolygon)) return false; // "custom" needs a valid polygon
  if (s.phiExpr !== undefined && !isPhiExpr(s.phiExpr)) return false;
  if (s.phi === CUSTOM_FORMULA && !isPhiExpr(s.phiExpr)) return false; // "custom-formula" needs a formula string
  if (s.suppressCorners !== undefined && typeof s.suppressCorners !== "boolean") return false;
  if (
    s.suppressStrength !== undefined &&
    !(Number.isInteger(s.suppressStrength) && (s.suppressStrength as number) >= MIN_SUPPRESS_M && (s.suppressStrength as number) <= MAX_SUPPRESS_M)
  ) {
    return false;
  }
  if (s.boundaryCorr !== undefined && typeof s.boundaryCorr !== "boolean") return false;
  if (s.transplant !== undefined && typeof s.transplant !== "boolean") return false;
  return true;
}

/** A well-formed editor polygon: 3–16 finite in-bounds `[x,y]` vertices, no two consecutive ones coincident. */
function isCustomPolygon(value: unknown): value is readonly (readonly [number, number])[] {
  if (!Array.isArray(value) || value.length < MIN_POLYGON_VERTS || value.length > MAX_POLYGON_VERTS) return false;
  const ok = value.every(
    (v) =>
      Array.isArray(v) &&
      v.length === 2 &&
      Number.isFinite(v[0]) &&
      Number.isFinite(v[1]) &&
      Math.abs(v[0]) <= MAX_POLYGON_COORD &&
      Math.abs(v[1]) <= MAX_POLYGON_COORD,
  );
  if (!ok) return false;
  // Reject coincident consecutive vertices (a degenerate polygon the exterior SC solve can't fit).
  for (let i = 0; i < value.length; i++) {
    const a = value[i] as [number, number];
    const b = value[(i + 1) % value.length] as [number, number];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < MIN_POLYGON_EDGE) return false;
  }
  return true;
}

/** A well-formed φ formula: a non-empty string within the crafted-link length bound. */
function isPhiExpr(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_EXPR_LEN;
}

/** A well-formed coloring block: finite enhancement/modulus modes in range, positive sectors/scale. */
function isColoringOptions(c: Record<string, unknown> | undefined): boolean {
  if (!c || typeof c !== "object") return false;
  const enh = c.enhance;
  const mod = c.modulus;
  if (!Number.isInteger(enh) || (enh as number) < 0 || (enh as number) > 5) return false;
  if (!Number.isInteger(mod) || (mod as number) < 0 || (mod as number) > 4) return false;
  if (!Number.isFinite(c.sectors) || (c.sectors as number) <= 0 || (c.sectors as number) > 64) return false;
  if (!Number.isFinite(c.modScale) || (c.modScale as number) <= 0) return false;
  if (typeof c.crisp !== "boolean") return false;
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
