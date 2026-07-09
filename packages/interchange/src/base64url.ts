// URL-safe base64 for the suite's codecs (map deep-links + view-state permalinks). Uses only the
// universal web globals TextEncoder / btoa / atob (browsers AND Node >= 18), so one implementation
// serves both apps and the headless tests. Unicode-safe: encodes to UTF-8 bytes first.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** UTF-8 string → URL-safe base64 (no padding; `+`/`/` → `-`/`_`). */
export function toBase64Url(json: string): string {
  const bytes = encoder.encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Max URL-safe-base64 payload accepted for decode. A legitimate map / view-state link is a few KB;
 *  this bounds a crafted mega-payload BEFORE atob / JSON.parse do O(n) work on it (~48 KB decoded). */
export const MAX_BASE64URL_LEN = 64 * 1024;

/** URL-safe base64 → UTF-8 string. Throws (via the size guard or atob) on oversized / malformed input;
 *  callers catch. */
export function fromBase64Url(s: string): string {
  if (s.length > MAX_BASE64URL_LEN) throw new RangeError("base64url: payload too large to decode");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}
