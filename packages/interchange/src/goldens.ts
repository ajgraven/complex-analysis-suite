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

/** Frozen timestamp for the goldens — real exports use `new Date()`, which is not reproducible. */
export const GOLDEN_CREATED_AT = "2026-07-06T00:00:00Z";

/**
 * The deltoid φ(ζ) = ζ + 1/(2ζ²) — unbounded, c = 1, F = [0, 0, ½] — exactly as QD's
 * "Export map → copy link" button emits it. Decodes to an `Envelope<"quadrature-domain">`
 * whose payload.phi is the LaurentMap CD compiles and renders.
 */
export const QD_TO_CD_DELTOID_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuMC4wIiwia2luZCI6InF1YWRyYXR1cmUtZG9tYWluIiwicGF5bG9hZCI6eyJwaGkiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOlt7InJlIjowLCJpbSI6MH0seyJyZSI6MCwiaW0iOjB9LHsicmUiOjAuNSwiaW0iOjB9XX0sImJvdW5kZWQiOmZhbHNlLCJjb252ZW50aW9ucyI6eyJhcmVhIjoic3RhbmRhcmQiLCJjb250b3VyIjoic3RhbmRhcmQifX0sInByb3ZlbmFuY2UiOnsiYXBwIjoicXVhZHJhdHVyZS1kb21haW5zIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoifX0";

/** φ(2) for the deltoid golden: 2 + 0.5/4 = 2.125. The value CD's compiled expr must produce. */
export const QD_TO_CD_DELTOID_PHI_AT_2 = 2.125;
