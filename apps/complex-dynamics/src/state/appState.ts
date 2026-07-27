/**
 * Shareable application state (Phase 16). The UI controls already hold the full
 * view-defining state, so an "AppState" is just the values of an allow-list of controls.
 * `readAppState`/`applyAppState` move between the DOM and a plain object; `encodeState`/
 * `decodeState` round-trip that object through a URL-hash-safe string for permalinks.
 *
 * This module captures the allow-listed DOM controls. The dynamical orbit-start z₀ and
 * the custom-gradient stops can't be reached by an id list, so `main.ts` layers them onto
 * the state object as `_z0`/`_grad` (see readFullState/applyFullState) before encoding —
 * a shared link / saved view / undo step reproduces those too.
 */
import { encodeViewState, decodeViewState } from "@cas/interchange";

/** Control element ids whose values define a shareable view. */
export const SHARE_IDS = [
  "inpc",
  "inpf",
  "inpmn",
  "inpjn",
  "inpme",
  "inpje",
  "inpparamcenter",
  "inpparamzoom",
  "inpdyncenter",
  "inpdynzoom",
  "inpParamRes",
  "inpDynRes",
  "mode",
  "palette",
  "trap",
  "aa",
  "paletteRotation",
  "light",
  "lightAz",
  "lightEl",
  "lightHeight",
  "post",
  "postVignette",
  "postGamma",
  "outline",
  "outlineWidth",
  "critorbit",
  "farey",
  "rays",
  "ray-angle",
  "ray-pairs",
  "equipotential",
  "equiDensity",
  "laurent",
  "laurent-n",
  "laurent-r",
  "newton",
  "autoiter",
  "autoiter-strength",
  "accumulate",
  "perturbation",
  "param-a",
  // Instruments and the coordinate remap. These define the picture just as much as the colouring
  // does, so a permalink / saved view / undo step has to carry them (CONTRIBUTING.md's live-control
  // rule). The overlays are re-applied by applyAllControls → applyChanges → refreshDynPanels; the
  // projection additionally needs plot-side state no id can reach, layered on as `_proj`.
  "inverse-julia",
  "siegel-curves",
  "yoccoz-toggle",
  "parapuzzle-toggle",
  "yoccoz-depth",
  "yoccoz-critical",
  "lamination-toggle",
  "qml-toggle",
  "lamination-detail",
  "projection-mode",
] as const;

export type AppState = Record<string, string | boolean>;

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isCheckbox(el: Control): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "checkbox";
}

/** Read the shareable state from the DOM controls. */
export function readAppState(): AppState {
  const state: AppState = {};
  for (const id of SHARE_IDS) {
    const el = document.getElementById(id) as Control | null;
    if (!el) continue;
    state[id] = isCheckbox(el) ? el.checked : el.value;
  }
  return state;
}

/** Write a shareable state onto the DOM controls (does not itself re-render). */
export function applyAppState(state: AppState): void {
  for (const id of SHARE_IDS) {
    if (!(id in state)) continue;
    const el = document.getElementById(id) as Control | null;
    if (!el) continue;
    if (isCheckbox(el)) el.checked = Boolean(state[id]);
    else el.value = String(state[id]);
  }
}

// --- URL-hash codec: CD's view-state permalink, on @cas/interchange's shared versioned codec ------
// encodeState returns the full "#vs=..." fragment (app-namespaced "cd"); decodeState accepts a hash
// or full URL and yields CD's state only for a "cd" link (a foreign or malformed link → null). The
// URL-safe base64 transport, envelope versioning, and forward-compat contract live in @cas/interchange.

/** Encode CD's state to a URL hash fragment ("#vs=..."). */
export function encodeState(state: AppState): string {
  return encodeViewState("cd", state);
}

/** Decode a hash / URL back to CD's state, or null if absent, corrupt, or not a "cd" link. */
export function decodeState(hashOrLink: string): AppState | null {
  const env = decodeViewState<AppState>(hashOrLink);
  return env && env.app === "cd" ? env.state : null;
}

// --- saved named views (localStorage-backed) ----------------------------------

const VIEWS_KEY = "cdjs.savedViews";

/** Load the map of saved views (name → state) from localStorage; {} if unavailable. */
export function loadSavedViews(): Record<string, AppState> {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    const obj: unknown = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, AppState>)
      : {};
  } catch {
    return {};
  }
}

/** Persist the map of saved views to localStorage (no-op if unavailable). */
export function saveSavedViews(views: Record<string, AppState>): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* storage unavailable (private mode / quota) — keep the in-memory map only */
  }
}
