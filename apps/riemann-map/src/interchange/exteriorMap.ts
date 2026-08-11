// exteriorMap.ts — emit a filled Julia set's exterior conformal map as an @cas/interchange payload (G8/B7).
//
// The exterior Riemann map ψ: ext(𝔻) → ext(K) of a filled Julia set is ψ(w) = γ₁·w + Σ_k b_k·w^{-k}
// (analysis/exterior.ts). That is EXACTLY the interchange `LaurentMap` shape (φ = c·z + Σ_l F_l·z^{-l}),
// so K's exterior map hands off to any suite tool that speaks @cas/interchange with no bespoke wire type:
// Complex Dynamics imports a `kind:"map"` envelope and compiles the Laurent form straight through `expr`.
//
// Honesty (guardrail): the leading coefficient γ₁ is exact, but the tail b_k are truncated series
// estimates — the provenance `note` says so rather than letting the payload read as a certified map.
//
// Producer half only. The consumer half (MapSpec → expr source) lives in Complex Dynamics; the app
// dependency rule forbids importing it here, and a second consumer would be an ADR-0007 extraction — a
// later increment, not this one. Pure (createdAt is injected, never read from the clock) → node-tested.
import type { Envelope, LaurentMap } from "@cas/interchange";
import { SCHEMA_ID, VERSION, encodeLink } from "@cas/interchange";
import type { ExteriorAnalysis } from "../analysis/exterior.js";

/** This app's interchange producer id (schema.ts `Provenance.app` accepts it via `string & {}`). */
const APP = "riemann-map";
/** Default app version stamped into provenance (package.json is 0.0.0 pre-release). */
const APP_VERSION = "0.0.0";

/** Optional provenance overrides; `createdAt` is injectable so the producer stays pure + testable. */
export interface ExteriorMapOpts {
  readonly appVersion?: string;
  readonly createdAt?: string;
  /** The φ source the exterior map was computed from, recorded in the human-readable note. */
  readonly sourceExpr?: string;
}

/** The exterior Riemann map ψ of K as an interchange `LaurentMap` (γ₁ → c, {b_k} → F). */
export function exteriorLaurentMap(analysis: ExteriorAnalysis): LaurentMap {
  return {
    form: "laurent",
    c: { re: analysis.lead[0], im: analysis.lead[1] },
    F: analysis.coeffs.map((b) => ({ re: b[0], im: b[1] })),
  };
}

/** Build the `kind:"map"` envelope carrying K's exterior Riemann map, ready to encode or hand off. */
export function exteriorMapEnvelope(analysis: ExteriorAnalysis, opts: ExteriorMapOpts = {}): Envelope<"map"> {
  const src = opts.sourceExpr ? ` of the filled Julia set of ${opts.sourceExpr}` : " of a filled Julia set";
  return {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "map",
    payload: exteriorLaurentMap(analysis),
    provenance: {
      app: APP,
      appVersion: opts.appVersion ?? APP_VERSION,
      createdAt: opts.createdAt ?? new Date().toISOString(),
      note:
        `Exterior Riemann map ψ(w)=γ₁·w+Σbₖw⁻ᵏ${src}: leading coefficient γ₁ exact, ` +
        `tail truncated to ${analysis.coeffs.length} estimated bₖ (≈).`,
    },
  };
}

/** Encode {@link exteriorMapEnvelope} as an interchange deep-link fragment ("#s=…"). */
export function exteriorMapLink(analysis: ExteriorAnalysis, opts: ExteriorMapOpts = {}): string {
  return encodeLink(exteriorMapEnvelope(analysis, opts));
}
