/**
 * σ-view state serialization (ADR-0009 item 2). The Schwarz peer view is not control-based like the
 * standard fractal state, so it can't ride `SHARE_IDS`; instead `main.ts` layers this compact record onto
 * the `AppState` as `_sigma` — exactly as `_z0` / `_grad` / `_proj` layer their non-control state — so a
 * permalink, a saved view, and a PNG's embedded state all reproduce the σ view.
 *
 * The recipe is CD's own σ engine input (leading `c`, Laurent `F`, finite-pole `branches`) plus the view
 * + coloring — NOT an interchange `MapSpec` (that canonical, convention-tagged format is for cross-app
 * hand-off; this is a CD-internal layer, already inside the `"cd"`-namespaced view-state envelope).
 *
 * `parseSigmaState` is hostile-link hard: it comes from a URL, so it rejects anything non-finite or
 * structurally wrong, caps every coefficient list, enforces the engine's `|z_j| < 1` pole invariant
 * (schwarzPhiForm.parsePoles), and clamps zoom — a corrupt link yields `null` (ignored by the caller),
 * never a hung engine or a NaN render. Unknown colormap / scale names normalise to the defaults.
 */
import type { SchwarzPhi } from "../render/schwarzPhiForm";
import type { Complex, SchwarzBranch } from "@cas/schwarz";
import { SCHWARZ_ZOOM_MIN, SCHWARZ_ZOOM_MAX } from "../render/schwarzView";
import {
  SCHWARZ_COLORMAPS,
  DEFAULT_SCHWARZ_COLORMAP,
  SCHWARZ_SCALE_MODES,
  DEFAULT_SCHWARZ_SCALE,
} from "../render/schwarzColormaps";

/** Everything needed to reproduce a σ view: the φ recipe, the window, and the coloring (colormap + scale
 *  + image-space tone). The tone fields (S5-A3) are identity at their defaults. */
export interface SigmaViewState {
  phi: SchwarzPhi;
  center: Complex;
  zoom: number;
  colormap: string;
  scale: string;
  /** Colormap-coordinate rotation ∈[0,1); 0 = none. */
  rotation: number;
  /** Output gamma; 1 = identity. */
  gamma: number;
  /** Radial edge darkening ∈[0,1]; 0 = off. */
  vignette: number;
}

/** Identity/default image-space tone — a view with no tone adjustments (also the fallback for old links). */
export const SIGMA_TONE_DEFAULTS = { rotation: 0, gamma: 1, vignette: 0 } as const;

/** Hostile-link cap on each coefficient list (F, a pole's A, the pole count) — keep the engine bounded. */
const MAX_TERMS = 64;

/** Serialize to a compact JSON string (short keys keep the base64 permalink small). The tone keys are
 *  omitted when they hold their identity default, so a plain view's link stays as small as before A3. */
export function encodeSigmaState(s: SigmaViewState): string {
  const out: Record<string, unknown> = {
    c: s.phi.c,
    F: s.phi.F,
    b: s.phi.branches.map((br) => ({ z: br.z, A: br.A })),
    ctr: s.center,
    z: s.zoom,
    cm: s.colormap,
    sc: s.scale,
  };
  if (s.rotation !== SIGMA_TONE_DEFAULTS.rotation) out.rot = s.rotation;
  if (s.gamma !== SIGMA_TONE_DEFAULTS.gamma) out.gam = s.gamma;
  if (s.vignette !== SIGMA_TONE_DEFAULTS.vignette) out.vig = s.vignette;
  return JSON.stringify(out);
}

/**
 * A human-readable one-line summary of a σ view, for a PNG's `cdjs:sigma` tEXt chunk. ASCII-safe — PNG
 * tEXt is Latin-1, so no σ / ≈ / Unicode minus (matching buildStampMetadata's ASCII-only rule).
 */
export function schwarzStampParams(s: SigmaViewState): string {
  const r = (x: number): string => Number.parseFloat(x.toPrecision(6)).toString();
  const cplx = (z: Complex): string => `${r(z[0])}${z[1] >= 0 ? "+" : "-"}${r(Math.abs(z[1]))}i`;
  const F = s.phi.F.map(cplx).join(", ");
  return (
    `plane=Schwarz reflection sigma (approx); c=${r(s.phi.c)}; F=[${F}]; poles=${s.phi.branches.length}; ` +
    `center=${cplx(s.center)}; zoom=${s.zoom.toExponential(3)}; colormap=${s.colormap}; scale=${s.scale}; ` +
    `rotation=${r(s.rotation)}; gamma=${r(s.gamma)}; vignette=${r(s.vignette)}`
  );
}

function fin(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
function complex(x: unknown): Complex | null {
  return Array.isArray(x) && x.length === 2 && fin(x[0]) && fin(x[1]) ? [x[0], x[1]] : null;
}
function complexList(x: unknown): Complex[] | null {
  if (!Array.isArray(x) || x.length > MAX_TERMS) return null;
  const out: Complex[] = [];
  for (const e of x) {
    const c = complex(e);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/** Parse an untrusted `_sigma` string back to a validated view state, or `null` if it is not usable. */
export function parseSigmaState(json: string): SigmaViewState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  if (!fin(o.c) || o.c === 0) return null; // c must be a real, non-zero leading coefficient (engine requires it)
  const F = complexList(o.F);
  if (!F) return null;

  const branches: SchwarzBranch[] = [];
  if (o.b !== undefined) {
    if (!Array.isArray(o.b) || o.b.length > MAX_TERMS) return null;
    for (const e of o.b) {
      if (!e || typeof e !== "object") return null;
      const br = e as Record<string, unknown>;
      const z = complex(br.z);
      if (!z || Math.hypot(z[0], z[1]) >= 1) return null; // the engine's exterior-pole invariant |z_j| < 1
      const A = complexList(br.A);
      if (!A || A.length === 0) return null; // a pole needs at least one principal-part coefficient
      branches.push({ z, A });
    }
  }

  const center = complex(o.ctr);
  if (!center) return null;
  if (!fin(o.z)) return null;
  const zoom = Math.min(SCHWARZ_ZOOM_MAX, Math.max(SCHWARZ_ZOOM_MIN, o.z));

  const colormap = typeof o.cm === "string" && o.cm in SCHWARZ_COLORMAPS ? o.cm : DEFAULT_SCHWARZ_COLORMAP;
  const scale =
    typeof o.sc === "string" && SCHWARZ_SCALE_MODES.some((m) => m.key === o.sc) ? o.sc : DEFAULT_SCHWARZ_SCALE;

  // Image-space tone (S5-A3) — cosmetic + optional, so a bad/absent value clamps to the identity default
  // rather than rejecting the whole (otherwise-valid) view.
  const clampOr = (x: unknown, def: number, lo: number, hi: number): number =>
    fin(x) ? Math.min(hi, Math.max(lo, x)) : def;
  const rotation = clampOr(o.rot, SIGMA_TONE_DEFAULTS.rotation, 0, 1);
  const gamma = clampOr(o.gam, SIGMA_TONE_DEFAULTS.gamma, 0.2, 5);
  const vignette = clampOr(o.vig, SIGMA_TONE_DEFAULTS.vignette, 0, 1);

  return { phi: { c: o.c, F, branches }, center, zoom, colormap, scale, rotation, gamma, vignette };
}
