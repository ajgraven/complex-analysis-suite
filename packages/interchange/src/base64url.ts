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

/** URL-safe base64 → UTF-8 string. Throws (via atob) on malformed input; callers catch. */
export function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}
