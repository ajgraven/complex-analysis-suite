/**
 * Export side of the suite hand-off (catalog K8): package the current map + view as an `@cas/interchange`
 * `view` Envelope and hand it to another app. The map travels as an `expr` MapSpec — the user's own source
 * string, the lossless representation — with `vars` narrowed to the interchange-known scope (z / c / a).
 * Coefficients are convention-neutral and a `view` payload carries no π / 2πi normalization, so the
 * hand-off is canonical by construction (ADR-0006). A deep link opens Complex Dynamics with the map
 * preloaded — CD reads an `#s=` hash on load.
 *
 * Note: the cross-app `#s=` link carries the MAP + viewport, not live parameter VALUES (interchange's
 * `expr` map has no parameter-value slot); the plotter's own `#vs=` share-link is what round-trips a
 * parameterised view exactly. `zoom` carries the plotter's world half-height (an app-defined scale, per
 * Viewport.zoom) so a plotter→plotter round-trip restores the frame; another app reads it as its own scale.
 */
import {
  encodeLink,
  SCHEMA_ID,
  VERSION,
  type Complex,
  type Envelope,
} from "@cas/interchange";

const APP = "complex-function-plotter";
const APP_VERSION = "0.1.0";

/** The interchange-known variable scope an `expr` MapSpec may declare. */
export type InterchangeVar = "z" | "c" | "a";

export interface ViewExport {
  expr: string;
  vars: InterchangeVar[];
  center: Complex;
  /** The plotter's world half-height, carried in `Viewport.zoom` as an app-defined scale. */
  span: number;
  coloring?: string;
  /** ISO-8601 timestamp, supplied by the caller (`new Date().toISOString()`), so this stays pure. */
  createdAt: string;
}

/** Build the `view` Envelope for the current map + frame. Validates through `@cas/interchange`'s
 *  `validateEnvelope` by construction (see the interop tests). */
export function buildViewEnvelope(v: ViewExport): Envelope<"view"> {
  return {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "view",
    payload: {
      map: { form: "expr", expr: v.expr, vars: v.vars.length ? v.vars : ["z"] },
      viewport: { center: v.center, zoom: v.span },
      ...(v.coloring ? { coloring: v.coloring } : {}),
    },
    provenance: { app: APP, appVersion: APP_VERSION, createdAt: v.createdAt },
  };
}

/** The `#s=…` interchange deep-link for the current view. */
export function encodeViewLink(v: ViewExport): string {
  return encodeLink(buildViewEnvelope(v));
}

/**
 * A deep link that opens Complex Dynamics — a sibling app under the launcher root — with this view
 * preloaded. `base` is the plotter's current page URL (e.g. `…/complex-function-plotter/`); CD sits at
 * `../complex-dynamics/`. Falls back to a bare relative path if `base` isn't a usable URL.
 */
export function cdHandoffUrl(base: string, link: string): string {
  try {
    return new URL(`../complex-dynamics/${link}`, base).toString();
  } catch {
    return `../complex-dynamics/${link}`;
  }
}
