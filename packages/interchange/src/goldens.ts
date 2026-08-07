// Cross-app golden corpus for the interchange contract.
//
// WHY THIS EXISTS. The QD -> CD hand-off used to be tested as two independent hand-written
// literals: QD's suite asserted what its exporter produces, and CD's suite decoded an envelope
// CD itself had constructed. Nothing connected the real producer to the real consumer, so a
// change on the QD side could be absorbed by updating QD's expectation while CD kept passing
// against a literal no exporter had emitted for months — the two apps agreeing about a format
// neither one was actually speaking.
//
// A direct end-to-end test has nowhere to live: an app may not import another app
// (ARCHITECTURE.md §4, enforced by no-restricted-imports), and a package may not import an app.
// So the wire artifact itself is the contract, and it lives here — the shared package the two
// apps already both depend on. This is the "shared packages ship WITH a golden-value corpus
// representing both apps' needs" rule in CLAUDE.md.
//
// HOW TO USE IT. QD asserts its real exporter reproduces the link; CD decodes that same link
// through its real import path. Both sides fail on drift, and — the part that matters — anyone
// who regenerates the golden to satisfy QD immediately has CD consuming the NEW bytes, so a
// genuine incompatibility surfaces instead of hiding in a stale duplicate.
//
// REGENERATING. Only when the wire format INTENDS to change. Call QD's
// `exportPhiLink(phi, { createdAt: GOLDEN_CREATED_AT, appVersion: "0.1.0" })` and paste the
// result. A diff here is a format change and should be reviewed as one.
//
// VERSION NOTE: the links below carry the schema `version` field, so each MINOR bump regenerates them
// — 1.0.0 → 1.1.0 (the `schwarz` MapSpec form, S3a) and 1.1.0 → 1.2.0 (optional finite-pole `branches`
// on LaurentMap, Phase 2). Both bumps changed ONLY the embedded `version` (the deltoid uses none of the
// new vocabulary — it is pole-free). Regenerated via QD's exportPhiLink/exportSigmaLink (below).

/** Frozen timestamp for the goldens — real exports use `new Date()`, which is not reproducible. */
export const GOLDEN_CREATED_AT = "2026-07-06T00:00:00Z";

/**
 * The deltoid φ(ζ) = ζ + 1/(2ζ²) — unbounded, c = 1, F = [0, 0, ½] — exactly as QD's
 * "Export map → copy link" button emits it. Decodes to an `Envelope<"quadrature-domain">`
 * whose payload.phi is the LaurentMap CD compiles and renders.
 */
export const QD_TO_CD_DELTOID_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuMi4wIiwia2luZCI6InF1YWRyYXR1cmUtZG9tYWluIiwicGF5bG9hZCI6eyJwaGkiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOlt7InJlIjowLCJpbSI6MH0seyJyZSI6MCwiaW0iOjB9LHsicmUiOjAuNSwiaW0iOjB9XX0sImJvdW5kZWQiOmZhbHNlLCJjb252ZW50aW9ucyI6eyJhcmVhIjoic3RhbmRhcmQiLCJjb250b3VyIjoic3RhbmRhcmQifX0sInByb3ZlbmFuY2UiOnsiYXBwIjoicXVhZHJhdHVyZS1kb21haW5zIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoifX0";

/** φ(2) for the deltoid golden: 2 + 0.5/4 = 2.125. The value CD's compiled expr must produce. */
export const QD_TO_CD_DELTOID_PHI_AT_2 = 2.125;

// --- Deltoid σ (Schwarz reflection) golden — new in S3a --------------------------------------------
//
// The σ counterpart of the φ golden above. Where φ hands off the Riemann map as a `laurent` MapSpec,
// this hands off the *Schwarz reflection* σ(w) = conj(F(φ⁻¹(w))) as the new `form:"schwarz"` recipe
// (schema.ts SchwarzMap): its `sigma.phi` is the SAME deltoid Laurent φ, tagged with which disk φ
// uniformizes (`D*`, the exterior) and how φ⁻¹ is taken (`newton-dk`). σ is NOT expr-compilable — a
// consumer rebuilds the evaluator from `sigma.phi` via @cas/schwarz (CD does this in S4a), it does not
// go through `mapSpecToExpr`.
//
// PRODUCER STATUS: no QD button emits this yet — S3b adds "Export σ". Until then this hand-built
// envelope is the CANONICAL artifact and S3b's `buildSigmaEnvelope` must reproduce it byte-for-byte
// (then this comment moves to the exportSigmaLink regeneration recipe, like the φ golden above).

/**
 * The deltoid σ as an `Envelope<"schwarz-reflection">` deep link: payload.sigma is the `form:"schwarz"`
 * recipe over the deltoid's Laurent φ (c = 1, F = [0,0,½]), disk `D*`, inverse `newton-dk`, canonical
 * conventions. Decodes + validates through the same codec/seatbelt as φ; CD reconstructs σ from it (S4a).
 */
export const QD_TO_CD_DELTOID_SIGMA_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuMi4wIiwia2luZCI6InNjaHdhcnotcmVmbGVjdGlvbiIsInBheWxvYWQiOnsic2lnbWEiOnsiZm9ybSI6InNjaHdhcnoiLCJwaGkiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOlt7InJlIjowLCJpbSI6MH0seyJyZSI6MCwiaW0iOjB9LHsicmUiOjAuNSwiaW0iOjB9XX0sImRpc2siOiJEKiIsImludmVyc2UiOiJuZXd0b24tZGsiLCJhbnRpaG9sb21vcnBoaWMiOnRydWV9LCJjb252ZW50aW9ucyI6eyJhcmVhIjoic3RhbmRhcmQiLCJjb250b3VyIjoic3RhbmRhcmQifX0sInByb3ZlbmFuY2UiOnsiYXBwIjoicXVhZHJhdHVyZS1kb21haW5zIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoifX0";

/**
 * A frozen (w₀, σ(w₀)) pair for the deltoid σ golden — the value CD's S4a reconstruction must reproduce
 * (decode → build the engine from sigma.phi → evaluate σ at w₀). Complex form ({re,im}), the interchange
 * idiom. Derived via the exact identity σ(φ(z₀)) = conj(F(z₀)) at z₀ = 1 + i, chosen because it exercises
 * the anti-holomorphic conj (σ's imaginary part flips sign, +0.5 → −0.5 — a holomorphic twin would not):
 *   w₀ = φ(1 + i) = 1 + 0.75i ,  σ(w₀) = conj(F(1 + i)) = conj(0.5 + 0.5i) = 0.5 − 0.5i.
 * Pinned against the real numerical engine in packages/schwarz/test/unbounded-laurent.test.ts.
 */
export const QD_TO_CD_DELTOID_SIGMA_W0 = { re: 1, im: 0.75 } as const;
export const QD_TO_CD_DELTOID_SIGMA_AT_W0 = { re: 0.5, im: -0.5 } as const;
