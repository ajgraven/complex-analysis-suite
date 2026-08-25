// The @cas/interchange hand-off for the polygon transplant (M2.4c, ADR-0034). This app is a CONSUMER of
// the `form:"conformal"` map — decode a `#s=` link (e.g. a polygon handed off from the Riemann-Map
// studio) and read its polygon corners, then re-fit the EXTERIOR flow map via @cas/conformal
// (polygonMap.ts) to draw flow past that polygon. It is also a PRODUCER — export the current transplant
// polygon as a `kind:"map"` ConformalMap so the picture is shareable and can be handed on. Mirrors how
// Complex Dynamics consumes a `form:"schwarz"` recipe via @cas/schwarz — the polygon corners are the
// portable geometry; the consumer always re-derives its own exterior fit.
import { decodeLink, encodeLink, SCHEMA_ID, VERSION, type Envelope, type MapSpec, type ConformalMap } from "@cas/interchange";
import type { Pt } from "./transplant.js";
import type { PolygonFlowMap } from "./polygonMap.js";

/** A polygon imported from a conformal-map deep link. */
export interface ImportedPolygon {
  readonly corners: Pt[];
  readonly engine: ConformalMap["engine"];
  readonly converged: boolean;
}

/** Decode a `#s=` (or full-URL) link and, if it carries a `form:"conformal"` map, return its polygon
 *  corners + provenance. Returns null for any other payload (a non-conformal map, a different kind, or a
 *  malformed link — decodeLink throws on malformed, which we swallow to a null so the caller can ignore a
 *  bad hash rather than crash the page). */
export function conformalPolygonFromLink(hashOrLink: string): ImportedPolygon | null {
  let env: Envelope;
  try {
    env = decodeLink(hashOrLink);
  } catch {
    return null;
  }
  if (env.kind !== "map") return null;
  const map = env.payload as MapSpec;
  if (map.form !== "conformal") return null;
  const corners: Pt[] = map.polygon.map((c) => [c.re, c.im]);
  if (corners.length < 2) return null;
  return { corners, engine: map.engine, converged: map.converged };
}

/**
 * Build a `kind:"map"` ConformalMap deep link for the current transplant polygon. Engine is
 * `"sc-exterior"` — this app fits the exterior map Ψ: 𝔻* → ext(K) — and the recorded prevertices / angles
 * / constant / capacity come from the fit so a consumer can rebuild it exactly (or just re-fit from the
 * corners). `createdAt` defaults to now; pass a frozen value for reproducible tests/goldens.
 */
export function buildConformalLink(corners: readonly Pt[], map: PolygonFlowMap, opts: { createdAt?: string; appVersion?: string } = {}): string {
  const payload: ConformalMap = {
    form: "conformal",
    engine: "sc-exterior",
    polygon: corners.map((p) => ({ re: p[0], im: p[1] })),
    angles: map.angles.slice(),
    prevertices: map.cornerPreimages.map((p) => ({ re: p[0], im: p[1] })),
    capacity: map.capacity,
    converged: map.converged,
    degraded: map.degraded,
    residual: map.residual,
  };
  const env: Envelope<"map"> = {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "map",
    payload,
    provenance: {
      app: "2d-electrostatics",
      appVersion: opts.appVersion ?? "0.1.0",
      createdAt: opts.createdAt ?? new Date().toISOString(),
      note: "Flow past a polygon — exterior Schwarz–Christoffel transplant",
    },
  };
  return encodeLink(env);
}
