// The @cas/interchange consumer for the Hele-Shaw twist hand-off (M4d). The twist page is a CONSUMER of a
// `quadrature-domain` payload whose `hData` carries a one-point QD's quadrature data h(w) = α/(w − w₀):
// decode a `#s=` link handed off from the Quadrature Domains app, recover the charge α, and drive the
// growing/twisting family from it. The charge is the RESIDUE of h — a convention-neutral rational-function
// coefficient — read straight off the CANONICAL wire with NO π/2πi conversion (the QD producer,
// schwarz-export.mjs, carries the same reasoning). Mirrors importConformalMap.ts: a malformed / irrelevant
// hash swallows to null so a bad link never crashes the page.
import { decodeLink, type Envelope, type MapSpec } from "@cas/interchange";
import { admissible, W0, type Cx } from "./heleShawOnePoint.js";

/** The outcome of decoding a Hele-Shaw hand-off: the recovered charge, or an honest reason it can't drive
 *  the one-point twist family. The loader returns `null` (not this hand-off) — the page keeps its presets. */
export type HeleShawImport =
  | { readonly ok: true; readonly alpha: Cx }
  | { readonly ok: false; readonly reason: string };

const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/**
 * Decode a `#s=` (or full-URL) link and, if it is a QD Hele-Shaw hand-off (a `quadrature-domain` payload
 * carrying `hData`), recover the one-point charge α and validate it drives the twist family. Returns null
 * for anything that ISN'T this hand-off (a malformed hash, a different kind, or a φ-only quadrature domain
 * with no `hData`) so the caller falls back to the built-in presets; returns `{ok:false, reason}` when it
 * IS a Hele-Shaw recipe the one-point engine can't drive (v1: a single simple pole at the node w₀ = 2).
 */
export function heleShawFromLink(hashOrLink: string): HeleShawImport | null {
  let env: Envelope;
  try {
    env = decodeLink(hashOrLink);
  } catch {
    return null;
  }
  if (env.kind !== "quadrature-domain") return null;
  const h = (env.payload as { hData?: MapSpec }).hData;
  if (!h) return null; // a φ-only quadrature domain (the QD → CD hand-off) — not a Hele-Shaw recipe
  // The one-point family: h = α/(w − w₀), a rational with num = [α], den = [−w₀, 1] (a single simple pole).
  if (h.form !== "rational" || h.num.length !== 1 || h.den.length !== 2) {
    return { ok: false, reason: "The twist page drives the one-point family QD(α/(w−w₀)); this recipe isn’t a single simple pole." };
  }
  const num0: Cx = [h.num[0].re, h.num[0].im];
  const den0: Cx = [h.den[0].re, h.den[0].im];
  const den1: Cx = [h.den[1].re, h.den[1].im];
  if (den1[0] === 0 && den1[1] === 0) return { ok: false, reason: "Malformed quadrature data (degenerate denominator)." };
  const alpha = cdiv(num0, den1); // α = num[0]/den[1]
  const node = cdiv([-den0[0], -den0[1]], den1); // w₀ = −den[0]/den[1]
  if (Math.hypot(node[0] - W0, node[1]) > 1e-6) {
    return { ok: false, reason: `The twist engine is normalized to the node w₀ = ${W0}; this domain’s node is elsewhere (a general node is a later extension).` };
  }
  if (!admissible(alpha)) {
    return { ok: false, reason: "The imported charge is outside the admissible parabola |w₀|² + 2·Re α > 2|α| — no domain exists." };
  }
  return { ok: true, alpha };
}
