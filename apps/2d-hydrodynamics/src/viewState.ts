// Shareable `#vs=` permalinks for the two transplant pages (HD-3), on @cas/interchange's app-namespaced,
// forward-compatible view-state envelope. Decoding is defensive — a malformed or partial payload yields
// null and the page keeps its defaults. Each page tags its payload with `page` so a link is applied only
// on its own page. Ranges are NOT validated here; the pages feed decoded values through their range
// sliders, which clamp them.
import { encodeViewState, decodeViewState } from "@cas/interchange";

const APP = "2dh";

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isBool = (x: unknown): x is boolean => typeof x === "boolean";

export interface AirfoilVS {
  thickness: number;
  camber: number;
  alphaDeg: number;
  teAngleDeg: number;
  kutta: boolean;
}

/** Encode the airfoil state as a `#vs=` fragment. */
export function encodeAirfoil(s: AirfoilVS): string {
  return encodeViewState(APP, { page: "airfoil", ...s });
}

/** Decode an airfoil `#vs=` link, or null if absent / malformed / not an airfoil payload. */
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

/** Encode the gallery state as a `#vs=` fragment. */
export function encodeGallery(s: GalleryVS): string {
  return encodeViewState(APP, { page: "gallery", ...s });
}

/** Decode a gallery `#vs=` link, or null if absent / malformed / not a gallery payload. */
export function decodeGallery(hashOrLink: string): GalleryVS | null {
  const env = decodeViewState(hashOrLink);
  if (!env || env.app !== APP) return null;
  const s = env.state as Record<string, unknown>;
  if (s.page !== "gallery") return null;
  if (typeof s.id !== "string" || !isNum(s.alphaDeg) || !isNum(s.gamma)) return null;
  return { id: s.id, alphaDeg: s.alphaDeg, gamma: s.gamma };
}
