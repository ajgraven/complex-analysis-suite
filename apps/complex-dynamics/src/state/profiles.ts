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

export const PROFILES: Record<ProfileName, ProfileSettings> = {
  // Balanced default — anti-aliased by idle refine (temporal AA), so it stays responsive.
  explore: {
    mode: "smooth",
    palette: "classic",
    aa: "1", // temporal accumulation supplies the anti-aliasing (spatial AA would just cost more)
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
  // Beautiful stills: lighting + post-processing + a large canvas, anti-aliased by idle refine
  // (temporal AA, which converges to high quality without the per-frame cost of spatial supersampling).
  artist: {
    mode: "smooth",
    palette: "magma",
    aa: "1", // temporal accumulation supplies the AA (idle refine)
    light: true,
    post: true,
    accumulate: true,
    autoiter: true,
    autoiterStrength: "1.5",
    perturbation: false,
    critorbit: false,
    farey: false,
    rays: false,
    iterations: 300,
    resolution: 640,
    juliaPanel: false,
  },
  // Rigour: high iterations + auto-scaling, a perceptually-uniform palette, the metrics panel open;
  // anti-aliased by idle refine (temporal AA).
  researcher: {
    mode: "smooth",
    palette: "viridis",
    aa: "1", // temporal accumulation supplies the AA (idle refine)
    light: false,
    post: false,
    accumulate: true,
    autoiter: true,
    autoiterStrength: "1.5",
    perturbation: false,
    critorbit: false,
    farey: false,
    rays: false,
    iterations: 400,
    resolution: 600,
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
    aa: "1", // temporal accumulation supplies the AA (idle refine)
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
