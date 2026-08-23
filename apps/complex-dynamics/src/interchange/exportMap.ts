// exportMap.ts — Complex Dynamics' hand-off of a filled Julia set's exterior Riemann (Böttcher) map (B1).
//
// The inverse Böttcher map ψ: ext(𝔻) → ext(K) of a filled Julia set is ψ(w) = γ₁·w + Σ_k b_k·w^{-k}
// (@cas/dynamics' uniformize kernel; CD's dynExterior computes {lead: γ₁, coeffs: b_k}). That is EXACTLY
// the interchange `LaurentMap` shape (φ = c·z + Σ_l F_l·z^{-l}) — a Laurent map is exterior by
// construction (Laurent at ∞) — so K's exterior map hands off to any suite tool that speaks
// @cas/interchange with no bespoke wire type. The Riemann-Map studio imports it as a disk-image source.
//
// PRODUCER half. CD already carries a CONSUMER half (importMap.ts, the QD→CD φ/σ hand-off); the two are
// independent glue over the shared @cas/interchange codec — the repo's pattern is app-local interchange
// glue, no shared producer package until a second producer needs one (ADR-0007).
//
// Honesty (guardrail): the capacity γ₁ is exact, but the tail b_k are truncated series estimates — the
// provenance `note` says so rather than letting the payload read as a certified map. Pure (`createdAt`
// is injectable, never read from the clock in tests) → node-tested.
import type { Envelope, LaurentMap } from "@cas/interchange";
import { SCHEMA_ID, VERSION, encodeLink } from "@cas/interchange";
import type { Complex } from "../complex.js";

/** This app's interchange producer id (schema.ts `Provenance.app` accepts it as a literal). */
const APP = "complex-dynamics";
/** Default app version stamped into provenance (apps/complex-dynamics/package.json). */
const APP_VERSION = "1.0.0";
/** Combined-deploy path segments, for resolving the sibling Riemann-Map base (see {@link riemannMapBase}). */
const CD_APP_ID = "complex-dynamics";
const RM_APP_ID = "riemann-map";

/** The exterior-map data CD hands off: capacity γ₁ and the Böttcher tail b_k (CD `[re,im]` tuples). */
export interface BottcherExport {
  /** Leading coefficient γ₁ = capacity of K (complex in general; 1 for a monic z^d+c). */
  readonly lead: Complex;
  /** The Böttcher tail b_0, b_1, … (ψ(w) = γ₁·w + Σ b_k·w^{-k}). */
  readonly coeffs: readonly Complex[];
}

/** Optional provenance overrides + human-readable source context. `createdAt` is injectable for tests. */
export interface BottcherMapOpts {
  readonly appVersion?: string;
  readonly createdAt?: string;
  /** The f(z,c) whose filled Julia set this is, recorded in the note. */
  readonly sourceExpr?: string;
  /** The parameter c, recorded in the note. */
  readonly c?: Complex;
}

/** CD tuple `[re,im]` → interchange wire `{re,im}`. */
const wire = (z: Complex): { re: number; im: number } => ({ re: z[0], im: z[1] });

const fmt = (z: Complex): string => `${z[0]}${z[1] < 0 ? "" : "+"}${z[1]}i`;

/** K's exterior Riemann map ψ as an interchange `LaurentMap` (γ₁ → c, {b_k} → F). */
export function bottcherLaurentMap(ex: BottcherExport): LaurentMap {
  return { form: "laurent", c: wire(ex.lead), F: ex.coeffs.map(wire) };
}

/** Build the `kind:"map"` envelope carrying K's exterior Riemann map, ready to encode or hand off. */
export function bottcherMapEnvelope(ex: BottcherExport, opts: BottcherMapOpts = {}): Envelope<"map"> {
  const of = opts.sourceExpr ? ` of the filled Julia set of f=${opts.sourceExpr}` : " of a filled Julia set";
  const at = opts.c ? ` at c=${fmt(opts.c)}` : "";
  return {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "map",
    payload: bottcherLaurentMap(ex),
    provenance: {
      app: APP,
      appVersion: opts.appVersion ?? APP_VERSION,
      createdAt: opts.createdAt ?? new Date().toISOString(),
      note:
        `Exterior Riemann map ψ(w)=γ₁·w+Σbₖw⁻ᵏ${of}${at}: capacity γ₁ exact, ` +
        `tail truncated to ${ex.coeffs.length} estimated bₖ (≈).`,
    },
  };
}

/** Encode {@link bottcherMapEnvelope} as an interchange link fragment ("#s=…"). */
export function bottcherMapLink(ex: BottcherExport, opts: BottcherMapOpts = {}): string {
  return encodeLink(bottcherMapEnvelope(ex, opts));
}

/**
 * Resolve the Riemann-Map studio's base URL from CD's `location`, swapping the app segment on the
 * combined Pages deploy (…/complex-dynamics/… → …/riemann-map/…). `resolvable:false` flags a best-effort
 * guess (local dev root / unusual host) so the caller can warn. Mirrors QD's `resolveHandoffBase`.
 */
export function riemannMapBase(
  loc: { origin?: string; pathname?: string } | null,
  override?: string,
): { base: string; resolvable: boolean; reason: string } {
  if (override) return { base: override, resolvable: true, reason: "override" };
  const origin = (loc && loc.origin) || "";
  const pathname = (loc && loc.pathname) || "/";
  const seg = `/${CD_APP_ID}/`;
  const i = pathname.indexOf(seg);
  if (i !== -1) {
    return { base: origin + pathname.slice(0, i) + `/${RM_APP_ID}/`, resolvable: true, reason: "sibling" };
  }
  return { base: origin + `/${RM_APP_ID}/`, resolvable: false, reason: "unresolved" };
}

/** Full hand-off URL that opens the exterior map in the Riemann-Map studio (base + "#s=…"). */
export function bottcherMapDeepLink(
  ex: BottcherExport,
  loc: { origin?: string; pathname?: string } | null,
  opts: BottcherMapOpts & { rmBase?: string } = {},
): { url: string; resolvable: boolean; reason: string } {
  const hash = bottcherMapLink(ex, opts);
  const { base, resolvable, reason } = riemannMapBase(loc, opts.rmBase);
  return { url: base + hash, resolvable, reason };
}
