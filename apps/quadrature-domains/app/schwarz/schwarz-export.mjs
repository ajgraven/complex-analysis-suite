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
  // Unbounded classical Laurent φ = c·z + Σ_{l≥0} F_l/z^l ( + Σ_j Σ_k conj(A_{j,k})·u_j(z)^k ) — the
  // pole-free deltoid AND the pole-bearing unbounded QDs (single exterior pole, cardioid, …). The
  // interchange `laurent` form gained optional `branches` in 1.2.0; @cas/schwarz reconstructs the σ.
  if (phi.unbounded && (phi.polyA || phi.F || (phi.branches && phi.branches.length))) {
    const cRaw = phi.c;
    const c = typeof cRaw === "number" ? { re: cRaw, im: 0 } : cRaw ? cc(cRaw) : { re: 1, im: 0 };
    const F = (phi.polyA || phi.F || []).map(cc);
    const spec = { form: "laurent", c, F };
    // Emit `branches` ONLY when present, so a pole-free φ stays byte-identical to the pre-1.2.0 wire.
    if (phi.branches && phi.branches.length) {
      spec.branches = phi.branches.map((br) => ({ z: cc(br.z), A: (br.A || []).map(cc) }));
    }
    return spec;
  }
  return null;
}

/**
 * QD bounded-CLASSICAL φ -> interchange `BoundedMap` (`form:"bounded"`, schema 1.3.0), or null when φ is
 * not a bounded-classical QD. φ(z) = w₀ + Σ_j Σ_k conj(A_{j,k})·u_j(z)^k maps 𝔻 → Ω onto a BOUNDED domain;
 * @cas/schwarz's makeBoundedSchwarz reconstructs its σ from these coefficients (interior branch, disk "D").
 *
 * DELIBERATELY SEPARATE from phiToMapSpec: `BoundedMap` is NOT a `MapSpec` (it is valid only as a `schwarz`
 * map's `phi`), so it must never ride the φ / quadrature-domain hand-off — only the σ recipe. Detection:
 * the classical families leave `phi.family` UNSET (LQD/PQD/rational-bounded all tag it — schwarz-common's
 * family dispatch, gotcha #1), so an untagged, non-unbounded φ carrying finite-pole branches is exactly the
 * partial-fraction bounded QD this reconstructs. A real bounded QD has ≥1 branch; w₀ defaults to 0.
 */
function boundedClassicalMapSpec(phi) {
  if (!phi || phi.unbounded || phi.family) return null;
  const branches = phi.branches || [];
  if (branches.length === 0) return null;
  const w0 = phi.w0 ? cc(phi.w0) : { re: 0, im: 0 };
  return { form: "bounded", w0, branches: branches.map((br) => ({ z: cc(br.z), A: (br.A || []).map(cc) })) };
}

// ---------------------------------------------------------------------------
// Export availability — WHY a φ can't be handed off (Phase 1, σ-export legibility).
//
// phiToMapSpec()/buildSigmaEnvelope() collapse every unsupported φ to a bare `null`; the UI then
// showed ONE blind line ("needs an unbounded-Laurent φ (e.g. the deltoid)") for all of them. But the
// real reasons are distinct — nothing captured, a Direct rational map (φ-exportable, but no σ), or a
// bounded domain (not exportable yet). ALL unbounded QDs export now, pole-free and pole-bearing alike
// (Phase 2). These helpers name the real reason, and live beside phiToMapSpec so the availability
// verdict stays in lockstep with the actual serializer (the ok-decision below IS phiToMapSpec).

/**
 * Structural classification of a captured φ, independent of export target. Pure.
 * @returns {{kind:"none"|"rational"|"bounded"|"unbounded-laurent"|"unbounded-poles"|"unbounded-degenerate", poleCount?:number, branchTerms?:number}}
 */
export function classifyPhiForExport(phi) {
  if (!phi) return { kind: "none" };
  if (Array.isArray(phi.P) && Array.isArray(phi.Q)) return { kind: "rational" };
  if (!phi.unbounded) return { kind: "bounded" };
  const branches = phi.branches || [];
  const poleCount = branches.length;
  const branchTerms = branches.reduce((n, b) => n + (b && b.A ? b.A.length : 0), 0);
  if (branchTerms > 0) return { kind: "unbounded-poles", poleCount, branchTerms };
  if ((phi.polyA || phi.F || []).length > 0) return { kind: "unbounded-laurent" };
  return { kind: "unbounded-degenerate" };
}

// The one place capture-flow prose lives, so both the message and the button it names ("Use this φ")
// stay together. Referenced by the "nothing captured" branch of both explainers.
const CAPTURE_HINT =
  'No φ captured yet — solve a domain on the Inverse tab, then click "Use this φ" above to capture it.';

/**
 * The user-facing reason σ export is unavailable for `phi`, or null when σ IS exportable (the caller
 * should then proceed). The null-decision defers to phiToMapSpec so it can never disagree with the
 * actual σ builder (buildSigmaEnvelope emits iff the MapSpec is `laurent` — now including pole-bearing).
 */
export function explainSigmaUnavailable(phi) {
  const spec = phiToMapSpec(phi);
  // σ IS exportable for the unbounded-Laurent family (→ laurent) AND the bounded-classical family
  // (→ a bounded map, S5-C2). Deferring the null-decision to the real builders keeps this in lockstep.
  if ((spec && spec.form === "laurent") || boundedClassicalMapSpec(phi)) return null;
  switch (classifyPhiForExport(phi).kind) {
    case "none":
      return CAPTURE_HINT;
    case "rational":
      return 'This is a Direct-tab rational map (P/Q). σ export covers the unbounded-Laurent and ' +
             'bounded-classical families; use "Export Riemann map φ" for this map instead.';
    case "bounded":
      // Bounded-classical now σ-exports (returns null above); reaching here means a WEIGHTED bounded QD
      // (log-/power-weighted, LQD/PQD), whose σ needs the exp/power machinery not yet lifted to @cas/schwarz.
      return "σ export covers unbounded-Laurent and bounded-classical domains; this captured domain is a " +
             "weighted (log-/power-weighted) bounded QD, not reconstructable yet.";
    default:
      return "σ export needs an unbounded-Laurent or bounded-classical φ; this captured map isn't one.";
  }
}

/**
 * The user-facing reason φ export is unavailable for `phi`, or null when φ IS exportable. φ export is
 * broader than σ — a Direct rational map exports too — so the null-decision is `phiToMapSpec(phi) != null`.
 */
export function explainPhiUnavailable(phi) {
  if (phiToMapSpec(phi)) return null; // φ IS exportable (rational or unbounded-laurent, incl. pole-bearing)
  switch (classifyPhiForExport(phi).kind) {
    case "none":
      return CAPTURE_HINT;
    case "bounded":
      // A bounded φ is not carried on the φ / quadrature-domain hand-off — `form:"bounded"` is σ-only
      // (not a MapSpec). Bounded-classical QDs DO hand off, via Export σ; point the user there.
      return "φ export covers unbounded-Laurent maps and Direct rational maps; this captured domain is " +
             'bounded — bounded QDs hand off via "Export σ", not as a φ map.';
    default:
      return "No exportable φ yet — this captured family isn't a closed-form map.";
  }
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

// ---------------------------------------------------------------------------
// σ (Schwarz reflection) hand-off — S3b (SIGMA-HANDOFF.md). The φ export above hands off the Riemann
// map; this hands off σ(w)=conj(F(φ⁻¹(w))) as a RECIPE (interchange `form:"schwarz"`, v1.1.0): the
// closed-form φ plus which disk it uniformizes and how φ⁻¹ is taken. σ is not a closed-form map (its
// inverse is numerical), so CD reconstructs the evaluator from `sigma.phi` via @cas/schwarz (S4a) —
// it does NOT compile through the expr pipeline. Two families reconstruct today: the UNBOUNDED-LAURENT
// family — the deltoid AND the pole-bearing unbounded QDs (its `sigma.phi` may carry finite-pole
// `branches`, 1.2.0), rebuilt by the exterior-branch engine (`disk:"D*"`) — and the BOUNDED-CLASSICAL
// family (S5-C2), rebuilt by makeBoundedSchwarz's interior branch (`sigma.phi` is `form:"bounded"`,
// `disk:"D"`, schema 1.3.0). A rational φ, or a weighted (LQD/PQD) bounded φ, returns null (we do not
// emit a σ recipe no consumer can rebuild). The payload is CANONICAL: φ is a geometric map, so no
// convention conversion — the QD normalizations touch h / areas, not φ's coefficients.

/**
 * Build an interchange Envelope<"schwarz-reflection"> carrying σ as a `form:"schwarz"` recipe, or null
 * when φ is neither an unbounded-Laurent map nor a bounded-classical map (the two families the shared σ
 * engine reconstructs today). The `disk` tag records which branch φ⁻¹ takes: "D*" (exterior) for a
 * Laurent φ, "D" (interior) for a bounded φ.
 */
export function buildSigmaEnvelope(phi, opts = {}) {
  // Unbounded-Laurent (→ a `laurent` MapSpec, exterior branch {|z|>1} → Ω) OR bounded-classical (→ a
  // `bounded` map, interior branch 𝔻 → Ω). Rational/weighted-bounded/non-exportable φ ⇒ null.
  const laurent = phiToMapSpec(phi);
  const mapSpec = laurent && laurent.form === "laurent" ? laurent : boundedClassicalMapSpec(phi);
  if (!mapSpec) return null;
  const disk = mapSpec.form === "bounded" ? "D" : "D*";
  return {
    schema: SCHEMA_ID,
    version: VERSION,
    kind: "schwarz-reflection",
    payload: {
      sigma: {
        form: "schwarz",
        phi: mapSpec,
        disk, // "D*" (Laurent ⇒ exterior of the unit disk) or "D" (bounded ⇒ the unit disk)
        inverse: "newton-dk",
        antiholomorphic: true,
      },
      conventions: CANONICAL,
    },
    provenance: {
      app: "quadrature-domains",
      appVersion: opts.appVersion || "0.1.0",
      createdAt: opts.createdAt || new Date().toISOString(),
      ...(opts.note ? { note: opts.note } : {}),
    },
  };
}

/** The σ envelope as a copyable deep-link hash ("#s=..."), or null. */
export function exportSigmaLink(phi, opts = {}) {
  const env = buildSigmaEnvelope(phi, opts);
  return env ? encodeLink(env) : null;
}

/**
 * Full copyable hand-off URL that opens the current σ in the Complex Dynamics app, or null when φ is
 * not σ-exportable. Mirrors exportPhiDeepLink: prepends the resolved CD base to the σ payload hash.
 * @returns {{url:string, resolvable:boolean, reason:string} | null}
 */
export function exportSigmaDeepLink(phi, loc, opts = {}) {
  const hash = exportSigmaLink(phi, opts);
  if (!hash) return null;
  const { base, resolvable, reason } = resolveHandoffBase(loc, opts.cdBase);
  return { url: base + hash, resolvable, reason };
}
