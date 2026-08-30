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
// — 1.0.0 → 1.1.0 (the `schwarz` MapSpec form, S3a), 1.1.0 → 1.2.0 (optional finite-pole `branches` on
// LaurentMap, Phase 2), 1.2.0 → 1.3.0 (the `bounded` φ form, S5-C2), and 1.3.0 → 1.4.0 (the `conformal`
// MapSpec form, M2.4c / ADR-0035). None of the five links below use the 1.4.0 `conformal` vocabulary, so
// the 1.4.0 bump changed ONLY the embedded `version` label — they stay byte-identical bar that label; the
// conformal golden (RM_TO_POTENTIAL_CONFORMAL_LINK, at the end) is the first to exercise the new form.
// Regenerated via QD's exportPhiLink/exportSigmaLink and CD's bottcherMapLink (below).

/** Frozen timestamp for the goldens — real exports use `new Date()`, which is not reproducible. */
export const GOLDEN_CREATED_AT = "2026-07-06T00:00:00Z";

/**
 * The deltoid φ(ζ) = ζ + 1/(2ζ²) — unbounded, c = 1, F = [0, 0, ½] — exactly as QD's
 * "Export map → copy link" button emits it. Decodes to an `Envelope<"quadrature-domain">`
 * whose payload.phi is the LaurentMap CD compiles and renders.
 */
export const QD_TO_CD_DELTOID_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuNC4wIiwia2luZCI6InF1YWRyYXR1cmUtZG9tYWluIiwicGF5bG9hZCI6eyJwaGkiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOlt7InJlIjowLCJpbSI6MH0seyJyZSI6MCwiaW0iOjB9LHsicmUiOjAuNSwiaW0iOjB9XX0sImJvdW5kZWQiOmZhbHNlLCJjb252ZW50aW9ucyI6eyJhcmVhIjoic3RhbmRhcmQiLCJjb250b3VyIjoic3RhbmRhcmQifX0sInByb3ZlbmFuY2UiOnsiYXBwIjoicXVhZHJhdHVyZS1kb21haW5zIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoifX0";

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
// PRODUCER STATUS: QD's "Export σ" button emits this (S3b) — `buildSigmaEnvelope`/`exportSigmaLink`
// reproduce it BYTE-FOR-BYTE, pinned from the QD side (apps/quadrature-domains/vitest/schwarz-export.test.ts
// "emits the exact deltoid-σ link stored as the cross-app golden") and decoded + reconstructed from the CD
// side. Regenerate only when the wire format INTENDS to change, via that exporter (like the φ golden above).

/**
 * The deltoid σ as an `Envelope<"schwarz-reflection">` deep link: payload.sigma is the `form:"schwarz"`
 * recipe over the deltoid's Laurent φ (c = 1, F = [0,0,½]), disk `D*`, inverse `newton-dk`, canonical
 * conventions. Decodes + validates through the same codec/seatbelt as φ; CD reconstructs σ from it (S4a).
 */
export const QD_TO_CD_DELTOID_SIGMA_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuNC4wIiwia2luZCI6InNjaHdhcnotcmVmbGVjdGlvbiIsInBheWxvYWQiOnsic2lnbWEiOnsiZm9ybSI6InNjaHdhcnoiLCJwaGkiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOlt7InJlIjowLCJpbSI6MH0seyJyZSI6MCwiaW0iOjB9LHsicmUiOjAuNSwiaW0iOjB9XX0sImRpc2siOiJEKiIsImludmVyc2UiOiJuZXd0b24tZGsiLCJhbnRpaG9sb21vcnBoaWMiOnRydWV9LCJjb252ZW50aW9ucyI6eyJhcmVhIjoic3RhbmRhcmQiLCJjb250b3VyIjoic3RhbmRhcmQifX0sInByb3ZlbmFuY2UiOnsiYXBwIjoicXVhZHJhdHVyZS1kb21haW5zIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoifX0";

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

// --- Single-exterior-pole σ golden — POLE-BEARING unbounded QD (Phase 2) ----------------------------
//
// The first hand-off carrying finite-pole `branches` (interchange 1.2.0): a clean fixture unbounded QD
// with c = 1 and one order-1 pole at z_j = 0.2, A = 0.3 — so φ(z) = z + 0.3·z/(1 − 0.2z). Its σ recipe's
// `sigma.phi.branches` is what CD must thread into @cas/schwarz's makeUnboundedLaurentSchwarz to
// reconstruct the pole-bearing σ (a reconstruction that dropped the branch would evaluate the pole-free
// φ = z and reproduce a DIFFERENT σ). Emitted by QD's exportSigmaLink over the same fixture; pinned
// byte-for-byte from the QD side and decoded + reconstructed from the CD side, exactly like the deltoid.

/** The single-exterior-pole σ as an `Envelope<"schwarz-reflection">` deep link. Its `sigma.phi` is a
 *  `laurent` map carrying one finite-pole branch (z_j = 0.2, A = [0.3]). */
export const QD_TO_CD_SINGLE_POLE_SIGMA_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuNC4wIiwia2luZCI6InNjaHdhcnotcmVmbGVjdGlvbiIsInBheWxvYWQiOnsic2lnbWEiOnsiZm9ybSI6InNjaHdhcnoiLCJwaGkiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOltdLCJicmFuY2hlcyI6W3sieiI6eyJyZSI6MC4yLCJpbSI6MH0sIkEiOlt7InJlIjowLjMsImltIjowfV19XX0sImRpc2siOiJEKiIsImludmVyc2UiOiJuZXd0b24tZGsiLCJhbnRpaG9sb21vcnBoaWMiOnRydWV9LCJjb252ZW50aW9ucyI6eyJhcmVhIjoic3RhbmRhcmQiLCJjb250b3VyIjoic3RhbmRhcmQifX0sInByb3ZlbmFuY2UiOnsiYXBwIjoicXVhZHJhdHVyZS1kb21haW5zIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoifX0";

/**
 * A frozen (w₀, σ(w₀)) pair for the single-pole σ golden — the value CD's reconstruction must reproduce.
 * z₀ = 2 ⇒ w₀ = φ(2) = 2 + 0.3·2/(1 − 0.4) = 3; σ(w₀) = conj(F(2)) = conj(1/2 + 0.3/(2 − 0.2)) = 2/3
 * (real, so no sign flip here — the anti-holomorphic conj is exercised by the deltoid golden). The value
 * is what pins the BRANCH: the pole-free φ = z would give conj(1/2)·… → conj(1/3) = 1/3, not 2/3.
 */
export const QD_TO_CD_SINGLE_POLE_SIGMA_W0 = { re: 3, im: 0 } as const;
export const QD_TO_CD_SINGLE_POLE_SIGMA_AT_W0 = { re: 2 / 3, im: 0 } as const;

// --- Bounded-QD σ golden — the first NON-Laurent family (S5-C2, interchange 1.3.0) ------------------
//
// A genuine single-lobe BOUNDED quadrature domain: φ(z) = ½·u, u = z/(1 − 0.3z), centre w₀ = 0, so
// φ: 𝔻 → Ω is bounded and its `sigma.phi` is the new `form:"bounded"` map (schema 1.3.0), tagged
// `disk:"D"`. CD rebuilds the σ evaluator from it via @cas/schwarz's makeBoundedSchwarz (NOT
// makeUnboundedLaurentSchwarz — the bounded engine uses the interior branch and F(z)=conj(w₀)+Σ A/(z−z_j)).
// PRODUCER STATUS: QD's "Export σ" emits this for a bounded-classical φ (S5-C2) — `buildSigmaEnvelope`
// reproduces it BYTE-FOR-BYTE, pinned from the QD side (schwarz-export.test.ts "emits the exact
// bounded-lobe σ link stored as the cross-app golden") and decoded + reconstructed from the CD side.

/** The bounded single-lobe σ as an `Envelope<"schwarz-reflection">` deep link: `sigma.phi` is a
 *  `form:"bounded"` map (w₀=0, one branch z_j=0.3, A=[0.5]), `disk:"D"`, `newton-dk`, version 1.3.0. */
export const QD_TO_CD_BOUNDED_LOBE_SIGMA_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuNC4wIiwia2luZCI6InNjaHdhcnotcmVmbGVjdGlvbiIsInBheWxvYWQiOnsic2lnbWEiOnsiZm9ybSI6InNjaHdhcnoiLCJwaGkiOnsiZm9ybSI6ImJvdW5kZWQiLCJ3MCI6eyJyZSI6MCwiaW0iOjB9LCJicmFuY2hlcyI6W3sieiI6eyJyZSI6MC4zLCJpbSI6MH0sIkEiOlt7InJlIjowLjUsImltIjowfV19XX0sImRpc2siOiJEIiwiaW52ZXJzZSI6Im5ld3Rvbi1kayIsImFudGlob2xvbW9ycGhpYyI6dHJ1ZX0sImNvbnZlbnRpb25zIjp7ImFyZWEiOiJzdGFuZGFyZCIsImNvbnRvdXIiOiJzdGFuZGFyZCJ9fSwicHJvdmVuYW5jZSI6eyJhcHAiOiJxdWFkcmF0dXJlLWRvbWFpbnMiLCJhcHBWZXJzaW9uIjoiMC4xLjAiLCJjcmVhdGVkQXQiOiIyMDI2LTA3LTA2VDAwOjAwOjAwWiJ9fQ";

/**
 * A frozen (w₀, σ(w₀)) pair for the bounded-lobe σ golden — the value CD's reconstruction must reproduce
 * (decode → build the engine from sigma.phi via makeBoundedSchwarz → evaluate σ at w). Derived via the
 * exact identity σ(φ(z₀)) = conj(F(z₀)) at z₀ = ½ (interior of 𝔻):
 *   w = φ(½) = ½·(½ / (1 − 0.15)) = 5/17 ,  σ(w) = conj(F(½)) = conj(0.5/(½ − 0.3)) = 2.5.
 * Pinned against the real bounded engine in packages/schwarz/test/bounded.test.ts.
 */
export const QD_TO_CD_BOUNDED_LOBE_SIGMA_W0 = { re: 5 / 17, im: 0 } as const;
export const QD_TO_CD_BOUNDED_LOBE_SIGMA_AT_W0 = { re: 2.5, im: 0 } as const;

// --- CD → Riemann-Map exterior-Böttcher-map golden (B) ---------------------------------------------
//
// The reverse direction of the corpus so far: Complex Dynamics EXPORTS a filled Julia set's exterior
// Riemann (Böttcher) map ψ(w) = γ₁·w + Σ bₖ·w⁻ᵏ as a bare `kind:"map"` `LaurentMap` (γ₁ → c, {bₖ} → F),
// and the Riemann-Map studio IMPORTS it as a disk-image source. A Laurent map is exterior by
// construction (Laurent at ∞), so the consumer renders it as an ext(𝔻) → ext(K) pushforward.
//
// The fixture is the deltoid exterior map ψ(w) = w + ½·w⁻² (lead γ₁ = 1, coeffs = [0, 0, ½]) — the same
// coefficients as the deltoid φ golden above, so the two directions are easy to eyeball against each
// other, and ψ(2) = 2.125 matches QD_TO_CD_DELTOID_PHI_AT_2.
//
// PRODUCER STATUS: CD's `bottcherMapLink` reproduces this BYTE-FOR-BYTE, pinned from the CD side
// (apps/complex-dynamics/test/exportMap.test.ts), and decoded + evaluated from the Riemann-Map side
// (apps/riemann-map/test/importMap.test.ts). Regenerate only when the wire format INTENDS to change,
// via `bottcherMapLink({lead:[1,0], coeffs:[[0,0],[0,0],[0.5,0]]}, { createdAt: GOLDEN_CREATED_AT })`.

/** The deltoid exterior map ψ(w) = w + ½·w⁻² as CD's "Send to Riemann Map" hand-off emits it: an
 *  `Envelope<"map">` whose payload is a `LaurentMap` (c = 1, F = [0,0,½]), app `complex-dynamics`. */
export const CD_TO_RM_BOTTCHER_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuNC4wIiwia2luZCI6Im1hcCIsInBheWxvYWQiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOlt7InJlIjowLCJpbSI6MH0seyJyZSI6MCwiaW0iOjB9LHsicmUiOjAuNSwiaW0iOjB9XX0sInByb3ZlbmFuY2UiOnsiYXBwIjoiY29tcGxleC1keW5hbWljcyIsImFwcFZlcnNpb24iOiIxLjAuMCIsImNyZWF0ZWRBdCI6IjIwMjYtMDctMDZUMDA6MDA6MDBaIiwibm90ZSI6IkV4dGVyaW9yIFJpZW1hbm4gbWFwIM-IKHcpPc6z4oKBwrd3K86jYuKClnfigbvhtY8gb2YgYSBmaWxsZWQgSnVsaWEgc2V0OiBjYXBhY2l0eSDOs-KCgSBleGFjdCwgdGFpbCB0cnVuY2F0ZWQgdG8gMyBlc3RpbWF0ZWQgYuKCliAo4omIKS4ifX0";

/** ψ(2) for the CD→RM golden: 2 + 0.5/4 = 2.125. The value the Riemann-Map consumer's ψ evaluator must
 *  produce from the decoded LaurentMap (γ₁·w + Σ bₖ·w⁻ᵏ at w = 2). */
export const CD_TO_RM_BOTTCHER_PSI_AT_2 = 2.125;

// --- Riemann-Map → 2D-Electrostatics polygon conformal-map golden (M2.4c, ADR-0035) ----------------
//
// The first `form:"conformal"` hand-off (interchange 1.4.0): the Riemann-Map studio EXPORTS a polygon
// Schwarz–Christoffel map as a bare `kind:"map"` `ConformalMap`, and 2D Electrostatics IMPORTS it to draw
// flow past that polygon. The portable geometry is the `polygon` corners; the `engine`/`angles` are the
// producer's fit provenance ("sc-interior" — RM fits f: 𝔻 → the bounded polygon). The consumer reads the
// corners and fits its OWN exterior map Ψ: 𝔻* → ext(K) via @cas/conformal — exactly the reconstruct-via-
// the-engine pattern of the schwarz goldens, with @cas/conformal in place of @cas/schwarz.
//
// The fixture is the side-2 square (corners (±1, ±1), all interior angles ½·π). Kept to EXACT rational
// coordinates + engine tag + converged flag (the optional prevertices/constant/capacity are omitted so
// the golden does not pin drift-prone solver output — the consumer re-derives them). The pinned value is
// the exterior logarithmic capacity the consumer computes, cap(square side 2) = 1.1803405990161 (plan §7).

/** The side-2 square as an `Envelope<"map">` whose payload is a `ConformalMap` (engine "sc-interior",
 *  polygon = (±1,±1), angles = [½,½,½,½], converged), app `riemann-map`. */
export const RM_TO_POTENTIAL_CONFORMAL_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuNC4wIiwia2luZCI6Im1hcCIsInBheWxvYWQiOnsiZm9ybSI6ImNvbmZvcm1hbCIsImVuZ2luZSI6InNjLWludGVyaW9yIiwicG9seWdvbiI6W3sicmUiOjEsImltIjotMX0seyJyZSI6MSwiaW0iOjF9LHsicmUiOi0xLCJpbSI6MX0seyJyZSI6LTEsImltIjotMX1dLCJhbmdsZXMiOlswLjUsMC41LDAuNSwwLjVdLCJjb252ZXJnZWQiOnRydWV9LCJwcm92ZW5hbmNlIjp7ImFwcCI6InJpZW1hbm4tbWFwIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoiLCJub3RlIjoiUG9seWdvbiBTY2h3YXJ64oCTQ2hyaXN0b2ZmZWwgbWFwIGhhbmRlZCB0byAyRCBFbGVjdHJvc3RhdGljcyBmb3IgZmxvdyBwYXN0IEsifX0";

/** cap(K) for the conformal golden: the exterior logarithmic capacity 2D-Electrostatics computes from the
 *  decoded side-2 square via @cas/conformal (fitExteriorSchwarzChristoffel → |leading coeff|). */
export const RM_TO_POTENTIAL_CONFORMAL_CAPACITY = 1.1803405990161;

// --- Quadrature-Domains → 2D-Electrostatics Hele-Shaw twist golden (M4d) ----------------------------
//
// QD hands a ONE-POINT unbounded quadrature domain to 2D Electrostatics' Hele-Shaw twist page, which
// drives the Graven–Makarov family QD(α/(w−w₀)) from the charge. It rides the existing `quadrature-domain`
// payload (NO schema bump — `hData` existed since 1.0.0, now populated for the first time): `phi` (the
// solved exterior map, provenance) + `hData` = the quadrature data h(w) = α/(w − w₀) as a `RationalMap`.
// The consumer reads the charge α (= the residue of h) and node w₀ straight from `hData` and drives the
// twist family — no φ inversion, no convention conversion (α is a convention-neutral rational residue).
//
// Fixture: the authored charge α = i at node w₀ = 2 (QD's `unb-1pt-imag`), so h = i/(w − 2) ⇒ num=[i],
// den=[−2, 1]. `phi` is a representative single-pole unbounded-Laurent map (c=1, one branch z=0.2, A=0.3);
// the twist consumer drives from `hData`, so the golden pins the wire format + the recovered (α, w₀).

/** A one-point unbounded QD as an `Envelope<"quadrature-domain">`: `phi` (laurent, one branch) + `hData`
 *  (h = i/(w−2)), app `quadrature-domains`. Emitted by `buildHeleShawEnvelope` / `exportHeleShawLink`. */
export const QD_TO_POTENTIAL_HELESHAW_LINK =
  "#s=eyJzY2hlbWEiOiJjb21wbGV4LWFuYWx5c2lzLXN1aXRlL2ludGVyY2hhbmdlIiwidmVyc2lvbiI6IjEuNC4wIiwia2luZCI6InF1YWRyYXR1cmUtZG9tYWluIiwicGF5bG9hZCI6eyJwaGkiOnsiZm9ybSI6ImxhdXJlbnQiLCJjIjp7InJlIjoxLCJpbSI6MH0sIkYiOltdLCJicmFuY2hlcyI6W3sieiI6eyJyZSI6MC4yLCJpbSI6MH0sIkEiOlt7InJlIjowLjMsImltIjowfV19XX0sImJvdW5kZWQiOmZhbHNlLCJoRGF0YSI6eyJmb3JtIjoicmF0aW9uYWwiLCJudW0iOlt7InJlIjowLCJpbSI6MX1dLCJkZW4iOlt7InJlIjotMiwiaW0iOjB9LHsicmUiOjEsImltIjowfV19LCJjb252ZW50aW9ucyI6eyJhcmVhIjoic3RhbmRhcmQiLCJjb250b3VyIjoic3RhbmRhcmQifX0sInByb3ZlbmFuY2UiOnsiYXBwIjoicXVhZHJhdHVyZS1kb21haW5zIiwiYXBwVmVyc2lvbiI6IjAuMS4wIiwiY3JlYXRlZEF0IjoiMjAyNi0wNy0wNlQwMDowMDowMFoifX0";

/** The charge the consumer recovers from the golden's `hData`: α = i (the residue of h = i/(w−2)). */
export const QD_TO_POTENTIAL_HELESHAW_ALPHA = { re: 0, im: 1 } as const;
/** The quadrature node the consumer recovers from the golden's `hData`: w₀ = 2. */
export const QD_TO_POTENTIAL_HELESHAW_NODE = { re: 2, im: 0 } as const;
