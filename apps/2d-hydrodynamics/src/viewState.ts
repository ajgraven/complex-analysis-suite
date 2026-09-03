// Shareable `#vs=` permalinks for the one-page app (HD-6.2, ADR-0038), on @cas/interchange's
// app-namespaced, forward-compatible view-state envelope. The unified `encodeHydro`/`decodeHydro` carry
// the whole page state (which body + every control), and `decodeHydro` ALSO reads the two legacy
// three-page schemas (`page:"airfoil"` / `page:"gallery"`) and the bare `#<id>` hub deep-links, so every
// permalink and PNG recipe minted under ADR-0037 still resolves. Decoding is defensive — a malformed or
// partial payload yields null and the page keeps its defaults. Ranges are NOT validated here; the page
// feeds decoded values through its range sliders, which clamp them.
import { encodeViewState, decodeViewState } from "@cas/interchange";

const APP = "2dh";

/** The body id for the Joukowski / Kármán–Trefftz airfoil (its own control set: thickness/camber/Kutta). */
export const AIRFOIL_ID = "airfoil";

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isBool = (x: unknown): x is boolean => typeof x === "boolean";
const isStr = (x: unknown): x is string => typeof x === "string";

// --- the unified, current schema ---------------------------------------------------------------------

/** The full one-page state: which body, plus every control (unused fields carry harmless defaults). */
export interface HydroVS {
  bodyId: string;
  alphaDeg: number;
  thickness: number;
  camber: number;
  teAngleDeg: number;
  kutta: boolean;
  gamma: number;
}

/** Encode the whole page state as a `#vs=` fragment (the unified `page:"body"` schema). */
export function encodeHydro(s: HydroVS): string {
  return encodeViewState(APP, { page: "body", ...s });
}

/**
 * Decode a `#vs=` link (or a bare `#<id>`) into the unified page state, or null if nothing usable. Reads,
 * in order: the unified `page:"body"` schema, then the legacy `page:"airfoil"` and `page:"gallery"`
 * schemas (mapped onto the unified shape), then a bare `#<id>` hub deep-link. Non-carried fields take the
 * airfoil defaults; the page validates the body id and clamps every value through its sliders.
 */
export function decodeHydro(hashOrLink: string): HydroVS | null {
  const env = decodeViewState(hashOrLink);
  if (env && env.app === APP) {
    const s = env.state as Record<string, unknown>;
    if (s.page === "body") {
      if (
        isStr(s.bodyId) &&
        isNum(s.alphaDeg) &&
        isNum(s.thickness) &&
        isNum(s.camber) &&
        isNum(s.teAngleDeg) &&
        isBool(s.kutta) &&
        isNum(s.gamma)
      ) {
        return {
          bodyId: s.bodyId,
          alphaDeg: s.alphaDeg,
          thickness: s.thickness,
          camber: s.camber,
          teAngleDeg: s.teAngleDeg,
          kutta: s.kutta,
          gamma: s.gamma,
        };
      }
      return null;
    }
  }
  // Legacy airfoil link → the airfoil body, carrying its five controls.
  const a = decodeAirfoil(hashOrLink);
  if (a) {
    return {
      bodyId: AIRFOIL_ID,
      alphaDeg: a.alphaDeg,
      thickness: a.thickness,
      camber: a.camber,
      teAngleDeg: a.teAngleDeg,
      kutta: a.kutta,
      gamma: 0,
    };
  }
  // Legacy gallery link → a closed-form body, carrying angle + circulation (airfoil fields default).
  const g = decodeGallery(hashOrLink);
  if (g) {
    return { bodyId: g.id, alphaDeg: g.alphaDeg, thickness: 0.12, camber: 0.06, teAngleDeg: 10, kutta: true, gamma: g.gamma };
  }
  // Bare `#<id>` (the old hub deep-linked closed-form bodies this way). Reject `#vs=…` (the `=` fails).
  const bare = hashOrLink.replace(/^#/, "");
  if (bare && /^[a-z0-9-]+$/i.test(bare)) {
    return { bodyId: bare, alphaDeg: 0, thickness: 0.12, camber: 0.06, teAngleDeg: 10, kutta: true, gamma: 0 };
  }
  return null;
}

// --- the legacy three-page schemas (READ path only; also the spec of the old links the tests replay) --

export interface AirfoilVS {
  thickness: number;
  camber: number;
  alphaDeg: number;
  teAngleDeg: number;
  kutta: boolean;
}

/** Encode the legacy airfoil state as a `#vs=` fragment (retained so the back-compat tests can mint an
 *  ADR-0037 airfoil link; the app itself only writes the unified schema). */
export function encodeAirfoil(s: AirfoilVS): string {
  return encodeViewState(APP, { page: "airfoil", ...s });
}

/** Decode a legacy airfoil `#vs=` link, or null if absent / malformed / not an airfoil payload. */
export function decodeAirfoil(hashOrLink: string): AirfoilVS | null {
  const env = decodeViewState(hashOrLink);
  if (!env || env.app !== APP) return null;
  const s = env.state as Record<string, unknown>;
  if (s.page !== "airfoil") return null;
  if (!isNum(s.thickness) || !isNum(s.camber) || !isNum(s.alphaDeg) || !isNum(s.teAngleDeg) || !isBool(s.kutta)) {
    return null;
  }
  return { thickness: s.thickness, camber: s.camber, alphaDeg: s.alphaDeg, teAngleDeg: s.teAngleDeg, kutta: s.kutta };
}

export interface GalleryVS {
  id: string;
  alphaDeg: number;
  gamma: number;
}

/** Encode the legacy gallery state as a `#vs=` fragment (retained for the back-compat tests, as above). */
export function encodeGallery(s: GalleryVS): string {
  return encodeViewState(APP, { page: "gallery", ...s });
}

/** Decode a legacy gallery `#vs=` link, or null if absent / malformed / not a gallery payload. */
export function decodeGallery(hashOrLink: string): GalleryVS | null {
  const env = decodeViewState(hashOrLink);
  if (!env || env.app !== APP) return null;
  const s = env.state as Record<string, unknown>;
  if (s.page !== "gallery") return null;
  if (typeof s.id !== "string" || !isNum(s.alphaDeg) || !isNum(s.gamma)) return null;
  return { id: s.id, alphaDeg: s.alphaDeg, gamma: s.gamma };
}
