// =============================================================================
// codec.ts -- the deep-link codec (INTERCHANGE.md section 6).
//
// A link produced by one tool can be OPENED by another (when the payload kind is one the opener
// understands). encodeLink serializes an envelope into a URL-safe hash fragment; decodeLink
// reverses it AND validates, so a stale or hand-edited link fails loudly at the boundary.
//
// v1 links are uncompressed URL-safe-base64 JSON. Compression (CompressionStream / pako) and
// reconciliation with each app's EXISTING share-link format land in the codec-unification step
// (Phase 4, step 4) — kept out of the initial contract on purpose. The base64 helpers use only
// the universal web globals TextEncoder / btoa / atob (browsers AND Node >= 18), so the one codec
// serves both apps and the headless tests.
// =============================================================================

import type { Envelope } from "./schema.js";
import { InterchangeError, validateEnvelope } from "./validate.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(json: string): string {
  const bytes = encoder.encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}

/** Encode an envelope into a URL-safe hash fragment: "#s=<url-safe-base64-json>". */
export function encodeLink(env: Envelope): string {
  return `#s=${toBase64Url(JSON.stringify(env))}`;
}

/**
 * Decode a link back into a VALIDATED Envelope. Accepts "#s=...", "s=...", or a full URL/hash
 * whose query/fragment carries an `s=` parameter. Throws InterchangeError on a missing, malformed,
 * or incompatible payload.
 */
export function decodeLink(link: string): Envelope {
  const m = /(?:[#&?]|^)s=([^&]+)/.exec(link);
  if (!m) throw new InterchangeError('interchange: no "s=" payload found in link');
  let json: string;
  try {
    json = fromBase64Url(m[1]);
  } catch {
    throw new InterchangeError("interchange: link payload is not valid base64");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InterchangeError("interchange: link payload is not valid JSON");
  }
  return validateEnvelope(parsed);
}
