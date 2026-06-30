/**
 * profiles.ts — use-case "profiles": named bundles of display / quality / instrument settings the
 * user can apply with one click (and which are remembered across sessions).
 *
 * A profile is orthogonal to a *preset* (which chooses the map f and the view): applying a profile
 * re-skins the current exploration — it never changes f, c, or the centre/zoom. Pure data + helpers
 * so the set is unit-testable; main.ts writes these values into the controls and re-applies them.
 *
 * Note: the auto-suggestion tips and the colour theme are deliberately NOT governed here — they are
 * independent persistent preferences (a profile re-applied on load would otherwise clobber the user's
 * own choice). Profiles also never touch f / c / view.
 */

export type ProfileName =
  | "explore"
  | "artist"
  | "researcher"
  | "educator"
  | "performance"
  | "deepzoom";

/** The governed controls a profile sets. Everything else (f / c / view / theme / suggestions) is left untouched. */
export interface ProfileSettings {
  /** Coloring mode select value (a key of MODES). */
  mode: string;
  /** Palette select value. */
  palette: string;
  /** Anti-aliasing / supersampling factor ("1"–"4"). */
  aa: string;
  /** Relief lighting. */
  light: boolean;
  /** Post-processing (vignette + gamma). */
  post: boolean;
  /** Temporal anti-aliasing (refine while idle). */
  accumulate: boolean;
  /** Auto-iterations (raise the cap with zoom) + its strength. */
  autoiter: boolean;
  autoiterStrength: string;
  /** Perturbation deep zoom (z²+c only — no-ops elsewhere). */
  perturbation: boolean;
  /** Pedagogical overlays. */
  critorbit: boolean;
  farey: boolean;
  rays: boolean;
  /** Base iteration cap (both planes). */
  iterations: number;
  /** Live canvas size in px (both planes; capped to the viewport on small screens). */
  resolution: number;
  /** Open the Julia-properties panel. */
  juliaPanel: boolean;
}

/** Display order in the picker. */
export const PROFILE_ORDER: ProfileName[] = [
  "explore",
  "artist",
  "researcher",
  "educator",
  "performance",
  "deepzoom",
];

/** Default profile on first run. */
export const DEFAULT_PROFILE: ProfileName = "explore";

export const PROFILE_LABELS: Record<ProfileName, string> = {
  explore: "Explore",
  artist: "Artist",
  researcher: "Researcher",
  educator: "Educator",
  performance: "Performance",
  deepzoom: "Deep zoom",
};

/** One-line description for the picker tooltip / docs. */
export const PROFILE_BLURBS: Record<ProfileName, string> = {
  explore: "Balanced everyday browsing — good-looking and responsive.",
  artist: "Maximum visual quality for stills: lighting, post-processing, high anti-aliasing.",
  researcher: "Accuracy & figures: high iterations, a perceptual palette, and the metrics panel open.",
  educator: "Reveals the structure that teaches the maths: critical orbit, Farey labels, an external ray.",
  performance: "Minimal cost for slow devices or fast panning: low resolution, low cap, no extras.",
  deepzoom: "Dives into z²+c: perturbation and auto-iterations on, tuned for depth.",
};

export const PROFILES: Record<ProfileName, ProfileSettings> = {
  // Balanced default — today's look, a touch cleaner (anti-aliasing + idle refine on).
  explore: {
    mode: "smooth",
    palette: "classic",
    aa: "2",
    light: false,
    post: false,
    accumulate: true,
    autoiter: false,
    autoiterStrength: "1.5",
    perturbation: false,
    critorbit: false,
    farey: false,
    rays: false,
    iterations: 200,
    resolution: 500,
    juliaPanel: false,
  },
  // Beautiful stills: lighting + post-processing + max AA + a larger canvas. The slowest profile,
  // but the draft-during-drag system keeps it usable.
  artist: {
    mode: "smooth",
    palette: "magma",
    aa: "3",
    light: true,
    post: true,
    accumulate: true,
    autoiter: true,
    autoiterStrength: "1.5",
    perturbation: false,
    critorbit: false,
    farey: false,
    rays: false,
    iterations: 400,
    resolution: 720,
    juliaPanel: false,
  },
  // Rigour: high iterations + auto-scaling, a perceptually-uniform palette, the metrics panel open.
  researcher: {
    mode: "smooth",
    palette: "viridis",
    aa: "3",
    light: false,
    post: false,
    accumulate: true,
    autoiter: true,
    autoiterStrength: "1.5",
    perturbation: false,
    critorbit: false,
    farey: false,
    rays: false,
    iterations: 500,
    resolution: 700,
    juliaPanel: true,
  },
  // Teaching: structure-revealing overlays on, idle-refine off so live demos stay responsive.
  educator: {
    mode: "smooth",
    palette: "classic",
    aa: "2",
    light: false,
    post: false,
    accumulate: false,
    autoiter: false,
    autoiterStrength: "1.5",
    perturbation: false,
    critorbit: true,
    farey: true,
    rays: true,
    iterations: 200,
    resolution: 500,
    juliaPanel: false,
  },
  // Minimal cost: small canvas, low cap, no anti-aliasing or extras.
  performance: {
    mode: "smooth",
    palette: "classic",
    aa: "1",
    light: false,
    post: false,
    accumulate: false,
    autoiter: false,
    autoiterStrength: "1.5",
    perturbation: false,
    critorbit: false,
    farey: false,
    rays: false,
    iterations: 100,
    resolution: 350,
    juliaPanel: false,
  },
  // Deep dives into z²+c: perturbation + aggressive auto-iterations.
  deepzoom: {
    mode: "smooth",
    palette: "magma",
    aa: "2",
    light: false,
    post: false,
    accumulate: true,
    autoiter: true,
    autoiterStrength: "2.5",
    perturbation: true,
    critorbit: false,
    farey: false,
    rays: false,
    iterations: 400,
    resolution: 500,
    juliaPanel: false,
  },
};

/** Field-by-field equality (used to detect when the live controls match a named profile). */
export function sameSettings(a: ProfileSettings, b: ProfileSettings): boolean {
  return (
    a.mode === b.mode &&
    a.palette === b.palette &&
    a.aa === b.aa &&
    a.light === b.light &&
    a.post === b.post &&
    a.accumulate === b.accumulate &&
    a.autoiter === b.autoiter &&
    a.autoiterStrength === b.autoiterStrength &&
    a.perturbation === b.perturbation &&
    a.critorbit === b.critorbit &&
    a.farey === b.farey &&
    a.rays === b.rays &&
    a.iterations === b.iterations &&
    a.resolution === b.resolution &&
    a.juliaPanel === b.juliaPanel
  );
}

/** Name of the profile the given settings exactly match, or null ("Custom"). */
export function matchProfile(s: ProfileSettings): ProfileName | null {
  for (const name of PROFILE_ORDER) {
    if (sameSettings(PROFILES[name], s)) return name;
  }
  return null;
}
