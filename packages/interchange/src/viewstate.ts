// =============================================================================
// viewstate.ts -- the shareable UI view-state codec (a sibling to the map deep-link codec).
//
// Each app serializes its own view-defining state (control values, gauges, active view) into a
// permalink. This codec owns the shared TRANSPORT + VERSIONING discipline; each app owns its state
// SCHEMA (what the fields mean) and its own DOM / hash glue (interchange stays DOM-free). Distinct
// from the map Envelope (schema.ts): a view-state link is per-app (namespaced by `app`), not a
// cross-tool hand-off.
//
// Wire format: "#vs=<url-safe-base64-json>" of { v, app, state } -- a DIFFERENT hash key from the map
// codec's "#s=", so the two never collide and neither has to sniff the other's payload.
//
// FORWARD-COMPAT CONTRACT (every future version must honour this, so today's links keep opening in
// tomorrow's app): the decoder validates only the ENVELOPE shape, PRESERVES unknown fields inside
// `state`, and does NOT reject a higher `v`. A newer app therefore adds state fields (and/or bumps
// `v`) freely, and older readers keep working on the fields they understand; an app that needs a
// hard state migration branches on `env.v` itself.
// =============================================================================

import { toBase64Url, fromBase64Url } from "./base64url.js";

/** The current view-state envelope format version. Bump ONLY on a breaking envelope-shape change. */
export const VIEWSTATE_VERSION = 1;

/** A versioned, app-namespaced view-state permalink payload. */
export interface ViewStateEnvelope<S = Record<string, unknown>> {
  /** Envelope format version (this codec). */
  readonly v: number;
  /** App namespace, e.g. "cd" | "qd" | "correspondences" — guards against opening a foreign link. */
  readonly app: string;
  /** The app-specific state payload (opaque to this codec; a plain key→value object). */
  readonly state: S;
}

/**
 * Encode app view-state into a URL hash fragment: `#vs=<url-safe-base64-json>`. Lenient by design —
 * it wraps whatever `state` you pass; {@link decodeViewState} is the seatbelt on the way back.
 */
export function encodeViewState<S extends Record<string, unknown>>(
  app: string,
  state: S,
  version: number = VIEWSTATE_VERSION,
): string {
  const env: ViewStateEnvelope<S> = { v: version, app, state };
  return `#vs=${toBase64Url(JSON.stringify(env))}`;
}

/**
 * Decode a view-state hash / link back into its envelope, or `null` if absent or malformed. Accepts
 * `#vs=...`, `vs=...`, or a full URL/hash carrying a `vs=` parameter. Validates only the envelope
 * SHAPE ({ v:number, app:string, state:object }); the caller checks `app` (and `v`, if it cares) and
 * validates its own state fields. Unknown fields inside `state` are preserved (forward-compat).
 */
export function decodeViewState<S = Record<string, unknown>>(
  hashOrLink: string,
): ViewStateEnvelope<S> | null {
  const m = /(?:[#&?]|^)vs=([^&]+)/.exec(hashOrLink);
  if (!m) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(m[1]));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const env = parsed as Record<string, unknown>;
  const v = env.v;
  const app = env.app;
  const state = env.state;
  if (typeof v !== "number" || typeof app !== "string") return null;
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
  return { v, app, state: state as S };
}
