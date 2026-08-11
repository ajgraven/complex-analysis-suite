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
  /** Value of the family parameter `c` (for maps that reference it), draggable in the disk view. */
  readonly c?: readonly [number, number];
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

/** How the view is drawn. The two modes are "disk-image" (the default) and "domain-map" (numeric). */
export interface RenderState {
  /** Active render mode id: "disk-image" (default) | "domain-map". An unknown id falls back to disk-image. */
  readonly mode: string;
  /** Selected domain preset for the numerical Riemann-map mode. Optional for older permalinks. */
  readonly domain?: string;
  /** Disk-image mode: which side of ∂𝔻 to map — "interior" (default) | "exterior". */
  readonly disk?: string;
  /** Disk-image mode: radial subdivisions of the polar grid. Optional; default 18. */
  readonly diskDensity?: number;
  /** Disk-image mode: angular subdivisions. Optional; defaults to 2× the radial count. */
  readonly diskSectors?: number;
  /** Disk-image mode: "filled" cells keyed by arg φ′ (default) | "lines" (circle/ray curves). */
  readonly diskStyle?: string;
  /** Disk-image mode, line style: which curves — "both" (default) | "circles" | "rays". */
  readonly diskShow?: string;
  /** Disk-image source: "expression" (φ from the editor, default) | "region" (numerical 𝔻→Ω map). */
  readonly diskSource?: string;
  /** Disk-image region source: the target domain Ω id (smooth presets only). Default "ellipse". */
  readonly region?: string;
  /** Disk-image layout: "split" (disk + image, default) | "image" (image only, presentation). */
  readonly diskLayout?: string;
  /** Disk-image "import" source (B2): the received exterior map's coefficients, carried IN the view-state
   *  so a permalink of an imported figure is self-contained — it reopens the map without the original
   *  `#s=` hand-off link. `lead` = γ₁, `coeffs` = the bₖ tail (ψ(w) = γ₁·w + Σ bₖ·w⁻ᵏ). */
  readonly imported?: {
    readonly lead: readonly [number, number];
    readonly coeffs: readonly (readonly [number, number])[];
    readonly app?: string;
    readonly note?: string;
  };
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

/**
 * The default view — the tool's primary purpose: the IMAGE OF THE UNIT DISK under a conformal map.
 * φ = z + z²/2 carries 𝔻 onto a smooth cardioid-like region; the disk-image mode draws its polar grid
 * pushed forward, coloured by the local rotation arg φ′. zoom 0.75 ⇒ world half-height 1.33, framing 𝔻.
 */
export const DEFAULT_VIEW_STATE: RiemannViewState = {
  map: { expr: "z + z*z/2", vars: ["z"], antiholomorphic: false },
  viewport: { centerRe: 0, centerIm: 0, zoom: 0.75 },
  render: {
    mode: "disk-image",
    disk: "interior",
    diskDensity: 18,
    diskSectors: 36,
    diskStyle: "filled",
    diskShow: "both",
  },
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
  if (!rn || typeof rn.mode !== "string") return false;
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
