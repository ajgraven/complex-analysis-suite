// exportMap.ts — Riemann-Map's PRODUCER hand-off of a polygon Schwarz–Christoffel map to 2D Electrostatics.
//
// The Riemann-Map studio fits the interior SC map f: 𝔻 → K of a polygon region (@cas/conformal). Its
// corners + interior angles are exactly the portable geometry of a `@cas/interchange` `form:"conformal"`
// map (ADR-0034), so a polygon shaped here hands off to 2D Electrostatics, which re-fits its own EXTERIOR
// map and draws the flow past / inside K. RM is otherwise a consumer (importMap.ts, the CD→RM Böttcher
// hand-off); this is its first producer — app-local interchange glue over the shared codec (ADR-0007).
//
// The payload is deliberately MINIMAL — polygon corners + engine + angles + converged only. It omits the
// drift-prone prevertices/constant/capacity/residual (the consumer re-derives whatever it needs from the
// corners), which keeps the wire artifact stable across solver changes. Pure (`createdAt` is injectable,
// never read from the clock in tests) → node-tested and pinned byte-for-byte against the cross-app golden.
import type { Envelope, ConformalMap } from "@cas/interchange";
import { SCHEMA_ID, VERSION, encodeLink } from "@cas/interchange";

/** RM's interchange producer id (schema.ts `Provenance.app` accepts it as a literal). */
const APP = "riemann-map";
/** Default app version stamped into provenance (the id 2D-Electrostatics' consumer golden pins). */
const APP_VERSION = "0.1.0";
/** Combined-deploy path segments, for resolving the sibling 2D-Electrostatics base. */
const RM_APP_ID = "riemann-map";
const ES_APP_ID = "2d-electrostatics";

/** The polygon data RM hands off: Ω-plane corners (counter-clockwise) + interior angles αₖ/π + the fit's
 *  converged flag. */
export interface ConformalExport {
  readonly corners: readonly (readonly [number, number])[];
  readonly angles: readonly number[];
  readonly converged: boolean;
}

/** Optional provenance overrides. `createdAt` is injectable for tests. */
export interface ConformalMapOpts {
  readonly appVersion?: string;
  readonly createdAt?: string;
}

/** RM's polygon SC fit as an interchange `ConformalMap` (minimal payload — engine "sc-interior", corners,
 *  angles, converged). Key order (form, engine, polygon, angles, converged) is significant: encodeLink is
 *  base64url(JSON.stringify(env)), so this order is what the cross-app golden pins. */
export function conformalMapPayload(ex: ConformalExport): ConformalMap {
  return {
    form: "conformal",
    engine: "sc-interior",
    polygon: ex.corners.map((p) => ({ re: p[0], im: p[1] })),
    angles: ex.angles.slice(),
    converged: ex.converged,
  };
}

/** Build the `kind:"map"` envelope carrying the polygon SC map, ready to encode or hand off. */
export function conformalMapEnvelope(ex: ConformalExport, opts: ConformalMapOpts = {}): Envelope<"map"> {
  return {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "map",
    payload: conformalMapPayload(ex),
    provenance: {
      app: APP,
      appVersion: opts.appVersion ?? APP_VERSION,
      createdAt: opts.createdAt ?? new Date().toISOString(),
      note: "Polygon Schwarz–Christoffel map handed to 2D Electrostatics for flow past K",
    },
  };
}

/** Encode {@link conformalMapEnvelope} as an interchange link fragment ("#s=…"). */
export function conformalMapLink(ex: ConformalExport, opts: ConformalMapOpts = {}): string {
  return encodeLink(conformalMapEnvelope(ex, opts));
}

/**
 * Resolve 2D Electrostatics' base URL from RM's `location`, swapping the app segment on the combined Pages
 * deploy (…/riemann-map/… → …/2d-electrostatics/…). `resolvable:false` flags a best-effort guess (local
 * dev root / unusual host) so the caller can warn. Mirrors CD's `riemannMapBase`.
 */
export function electrostaticsBase(
  loc: { origin?: string; pathname?: string } | null,
  override?: string,
): { base: string; resolvable: boolean; reason: string } {
  if (override) return { base: override, resolvable: true, reason: "override" };
  const origin = (loc && loc.origin) || "";
  const pathname = (loc && loc.pathname) || "/";
  const seg = `/${RM_APP_ID}/`;
  const i = pathname.indexOf(seg);
  if (i !== -1) {
    return { base: origin + pathname.slice(0, i) + `/${ES_APP_ID}/`, resolvable: true, reason: "sibling" };
  }
  return { base: origin + `/${ES_APP_ID}/`, resolvable: false, reason: "unresolved" };
}

/** Full hand-off URL that opens the polygon flow view in 2D Electrostatics (base + "polygon.html#s=…"). */
export function sendToElectrostaticsDeepLink(
  ex: ConformalExport,
  loc: { origin?: string; pathname?: string } | null,
  opts: ConformalMapOpts & { esBase?: string } = {},
): { url: string; resolvable: boolean; reason: string } {
  const hash = conformalMapLink(ex, opts);
  const { base, resolvable, reason } = electrostaticsBase(loc, opts.esBase);
  return { url: base + "polygon.html" + hash, resolvable, reason };
}
