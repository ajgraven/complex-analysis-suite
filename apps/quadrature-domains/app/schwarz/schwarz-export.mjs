// schwarz-export.mjs — Phase 4 (interchange). Serialize the current φ into an @cas/interchange
// envelope for the QD -> CD hand-off.
//
// PLUMBING-FIRST (the resolved Phase-4 design): QD's Schwarz reflection σ(w) = conj(F(φ⁻¹(w))) has a
// NUMERICAL inverse (Newton) — it is not a closed-form MapSpec for any family — so we hand off φ
// itself, which QD DOES hold in closed form (rational P/Q, or Laurent c + F). CD compiles + renders φ
// as a keystone-pipeline proof (encode -> deep link -> decode -> validate -> expr -> render). The
// faithful σ dynamics wait for Phase 6's shared σ-builder (extract buildSchwarzFromPhi + the inverse).
//
// φ is a GEOMETRIC map (Riemann map D -> Ω), convention-neutral: the QD normalizations (dA = dx dy/π,
// 1/(2π i) suppression) touch h / areas, not φ's coefficients. So the payload is tagged CANONICAL with
// no numeric conversion.
import { CANONICAL, SCHEMA_ID, VERSION, encodeLink } from "@cas/interchange";

const cc = (x) => ({ re: x.re, im: x.im });

/**
 * QD φ object -> interchange MapSpec (rational | laurent), or null when φ is not one of the
 * closed-form forms this first hand-off supports (bounded-classical partial fractions, power-weighted,
 * and LQD families return null — they are not exported as a closed-form map yet).
 */
export function phiToMapSpec(phi) {
  if (!phi) return null;
  // Direct-tab rational φ = P(z)/Q(z) (coefficients low-order-first, matching interchange).
  if (Array.isArray(phi.P) && Array.isArray(phi.Q)) {
    return { form: "rational", num: phi.P.map(cc), den: phi.Q.map(cc) };
  }
  // Unbounded classical Laurent φ = c·z + Σ_{l≥0} F_l / z^l — pure Laurent only (no pole branches).
  if (phi.unbounded && (phi.polyA || phi.F) && !(phi.branches && phi.branches.length)) {
    const cRaw = phi.c;
    const c = typeof cRaw === "number" ? { re: cRaw, im: 0 } : cRaw ? cc(cRaw) : { re: 1, im: 0 };
    const F = (phi.polyA || phi.F).map(cc);
    return { form: "laurent", c, F };
  }
  return null;
}

/**
 * Build an interchange Envelope<"quadrature-domain"> carrying φ, or null if φ can't be serialized to
 * a closed-form map. `opts.createdAt` defaults to now (pass a fixed value in tests for determinism).
 */
export function buildExportEnvelope(phi, opts = {}) {
  const mapSpec = phiToMapSpec(phi);
  if (!mapSpec) return null;
  return {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "quadrature-domain",
    payload: { phi: mapSpec, bounded: !phi.unbounded, conventions: CANONICAL },
    provenance: {
      app: "quadrature-domains",
      appVersion: opts.appVersion || "0.1.0",
      createdAt: opts.createdAt || new Date().toISOString(),
      ...(opts.note ? { note: opts.note } : {}),
    },
  };
}

/** The exported envelope as a copyable deep-link hash ("#s=..."), or null. */
export function exportPhiLink(phi, opts = {}) {
  const env = buildExportEnvelope(phi, opts);
  return env ? encodeLink(env) : null;
}

/** The exported envelope as pretty-printed JSON, or null. */
export function exportPhiJSON(phi, opts = {}) {
  const env = buildExportEnvelope(phi, opts);
  return env ? JSON.stringify(env, null, 2) : null;
}
