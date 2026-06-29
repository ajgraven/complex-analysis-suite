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

// --- URL-hash codec (unicode-safe base64, no deprecated escape/unescape) -------

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Encode state to a compact, URL-hash-safe string. */
export function encodeState(state: AppState): string {
  return toBase64(JSON.stringify(state));
}

/** Decode a hash string back to state, or null if it's missing/corrupt. */
export function decodeState(encoded: string): AppState | null {
  try {
    const obj: unknown = JSON.parse(fromBase64(encoded));
    // Reject non-objects AND arrays (typeof [] === "object") — only a plain
    // key→value map is a valid AppState; a crafted permalink could be anything.
    return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as AppState) : null;
  } catch {
    return null;
  }
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
