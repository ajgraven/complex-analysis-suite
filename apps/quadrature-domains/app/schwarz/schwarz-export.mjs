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

// ---------------------------------------------------------------------------
// QD -> CD hand-off TARGET. encodeLink()/exportPhiLink() above produce only the
// payload hash ("#s=..."); this section decides which app URL that hash rides on.
// The bug it fixes: the hash was concatenated onto QD's own location, so the link
// re-opened QD instead of the Complex Dynamics app (which reads "#s=" on load).
//
// Combined Pages deploy: the apps are siblings under one origin
//   .../quadrature-domains/  (this app)      .../complex-dynamics/  (target)
// so CD's base is resolved by swapping the path segment. Local dev runs each app on
// its own Vite port (separate origins), so the sibling is NOT resolvable from here:
// callers pass an explicit base (import.meta.env.VITE_CD_BASE) or receive
// resolvable:false and must tell the user the link is unverified — never claim success.
//
// One source of truth (QD is the only app that links to a sibling today). Promote to
// @cas/interchange when a second app needs sibling links (ADR-0007). CD_APP_ID equals
// the interchange provenance `app` id / deploy subpath — see packages/interchange/src/schema.ts.
export const CD_APP_ID = "complex-dynamics";
const QD_APP_ID = "quadrature-domains";

/**
 * Resolve the Complex Dynamics app's base URL for a hand-off deep link.
 * @param {{origin?:string, pathname?:string}} loc  current location (window.location in the app)
 * @param {string} [cdBase]  explicit CD base override (dev/config); wins when set
 * @returns {{base:string, resolvable:boolean, reason:("override"|"sibling"|"unresolved")}}
 *   `base` ends with "/". resolvable=false (reason "unresolved") = best-effort only (local
 *   split-port dev): the caller must warn instead of claiming the link resolves.
 */
export function resolveHandoffBase(loc, cdBase) {
  if (cdBase) {
    return { base: cdBase.endsWith("/") ? cdBase : cdBase + "/", resolvable: true, reason: "override" };
  }
  const origin = (loc && loc.origin) || "";
  const pathname = (loc && loc.pathname) || "/";
  const seg = `/${QD_APP_ID}/`;
  const i = pathname.indexOf(seg);
  if (i !== -1) {
    // Combined deploy: swap ".../quadrature-domains/..." -> ".../complex-dynamics/".
    return { base: origin + pathname.slice(0, i) + `/${CD_APP_ID}/`, resolvable: true, reason: "sibling" };
  }
  // No QD segment (local dev root / unusual host): best-effort relative sibling, unverified.
  return { base: origin + `/${CD_APP_ID}/`, resolvable: false, reason: "unresolved" };
}

/**
 * Full copyable hand-off URL that opens the current φ in the Complex Dynamics app, or null when
 * φ is not closed-form-exportable. Leaves exportPhiLink()'s golden-pinned payload byte-unchanged;
 * only prepends the resolved CD base. `opts.cdBase` = explicit CD base override (dev/config).
 * @returns {{url:string, resolvable:boolean, reason:string} | null}
 */
export function exportPhiDeepLink(phi, loc, opts = {}) {
  const hash = exportPhiLink(phi, opts);
  if (!hash) return null;
  const { base, resolvable, reason } = resolveHandoffBase(loc, opts.cdBase);
  return { url: base + hash, resolvable, reason };
}

/** The exported envelope as pretty-printed JSON, or null. */
export function exportPhiJSON(phi, opts = {}) {
  const env = buildExportEnvelope(phi, opts);
  return env ? JSON.stringify(env, null, 2) : null;
}
