// importMap.ts — Riemann-Map's consumer of an @cas/interchange exterior map (B2).
//
// The mirror of Complex Dynamics' export (apps/complex-dynamics/src/interchange/exportMap.ts): decode a
// "#s=" deep link and, if it carries an exterior `LaurentMap` ψ(w) = c·w + Σ F_l·w^{-l} (a Böttcher map
// of a filled Julia set, or an unbounded QD's uniformizer), return its coefficients as RM's [re,im]
// tuples for the disk-image "import" source to push the exterior grid through. A Laurent map is exterior
// by construction (Laurent at ∞), so RM renders it as an ext(𝔻) → ext(Ω) pushforward.
//
// CONSUMER half only — the producer lives in CD (the app-dependency rule forbids importing it), and the
// wire type is the shared @cas/interchange `LaurentMap`. Only the `laurent` form is imported (the
// exterior maps this source renders); other forms return null (a future increment could add interior
// forms). Pure (no DOM, decode + validate via the shared codec) → node-tested.
import { decodeLink } from "@cas/interchange";
import type { Envelope, MapSpec } from "@cas/interchange";

/** An imported exterior map's coefficients, in RM's `[re,im]` tuple convention. */
export interface ImportedExterior {
  /** γ₁ (leading coefficient). */
  readonly lead: [number, number];
  /** The Laurent tail b_0, b_1, … (ψ(w) = γ₁·w + Σ bₖ·w⁻ᵏ). */
  readonly coeffs: [number, number][];
  /** Producing app (provenance.app), for the readout. */
  readonly app: string;
  /** Human-readable provenance note (honest-labeling text travels with the map), for the readout. */
  readonly note?: string;
}

/** The single map an envelope carries, by kind (a bare map, a saved view's map, or a QD's φ). null for a
 *  schwarz-reflection σ (not a plain pushforward — its inverse is numerical) or an unknown kind. */
function envelopeMapSpec(env: Envelope): MapSpec | null {
  switch (env.kind) {
    case "map":
      return env.payload as MapSpec;
    case "view":
      return (env.payload as { map: MapSpec }).map;
    case "quadrature-domain":
      return (env.payload as { phi: MapSpec }).phi;
    default:
      return null;
  }
}

/**
 * Decode an interchange "#s=" link and, if it carries an exterior `LaurentMap`, return its coefficients
 * as RM tuples. Returns null for a missing/foreign/malformed link (a `#vs=` view-state permalink has no
 * `s=` payload, so it returns null too), an incompatible major version, or a non-Laurent map (which this
 * exterior disk-image source does not render).
 */
export function importExteriorMap(link: string): ImportedExterior | null {
  let env: Envelope;
  try {
    env = decodeLink(link); // throws on no s= payload, bad base64/JSON, or incompatible major version
  } catch {
    return null;
  }
  const spec = envelopeMapSpec(env);
  if (!spec || spec.form !== "laurent") return null;
  return {
    lead: [spec.c.re, spec.c.im],
    coeffs: spec.F.map((f) => [f.re, f.im] as [number, number]),
    app: env.provenance.app,
    note: env.provenance.note,
  };
}
