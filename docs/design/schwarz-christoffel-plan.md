# Schwarz–Christoffel Engine — Construction & Implementation Plan

> **Status: v1 COMPLETE (Phases 0–3).** Roadmap **step E**: a Schwarz–Christoffel (SC) mapping engine in
> [`@cas/conformal`](../../packages/conformal) — the **second consumer** that retro-justifies the
> ahead-of-demand extraction of
> [ADR-0018](../DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore); the
> method-choice record is
> [ADR-0020](../DECISIONS.md#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode).
> **Precise mode reaches machine precision on convex + reentrant polygons — forward AND inverse (the
> fast-follow Phase F is now in); fast (lightning) mode is reliable for convex/mild corners and flags
> `degraded` on strongly reentrant ones** (a known limitation — the reentrant polygon lightning fit is
> deferred tuning). This document is the *how*;
> the *why* and the literature/ground-truth are in the companion
> [`schwarz-christoffel-research-notes.md`](schwarz-christoffel-research-notes.md). Guardrails:
> [`../../CLAUDE.md`](../../CLAUDE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) /
> [`../DECISIONS.md`](../DECISIONS.md).
>
> Mirrors the suite's proven runbook style ([`../MIGRATION.md`](../MIGRATION.md)): **phase gates that
> are each shippable, a motivating win early, a ground-truth validation per phase, and test-guarded
> shared-package changes.** Nothing here re-litigates a locked ADR; the one new decision (the method
> choice) is flagged as **ADR-0020 to write** at the first gate (§7).

---

## Build progress (living record)

> Filled as phases land, so a resumed session knows exactly where to pick up. Work lands as small,
> CI-green commits on branch `claude/riemann-map-visualization-5kal5n`. The package also has its own
> [`README`](../../packages/conformal/README.md).

| Phase | Status | Commits | Coverage |
|---|---|---|---|
| **0 — Gauss–Jacobi quadrature primitive** | ✅ done | _this commit_ | `gaussJacobi.ts` (Golub–Welsch GJ/GL rules) + `scQuadrature.ts` (compound `d<ℓ/(3√2)` subdivision); GT: regular-n-gon circumradii to ≥10 digits + the compound rule beating a single panel near a strong singularity |
| **1 — Forward SC map, given prevertices** | ✅ done | _this commit_ | `schwarzChristoffel.ts` — SC integrand + compound side integrals + A/C recovery + forward eval; GT: regular n-gons to ≥10 digits, the square recovering conformal radius 2/K(1/√2) with corners + edge midpoint |
| **2 — The parameter problem (general polygons)** | ✅ done | _this commit_ | `scParameterProblem.ts` — softmax gap parametrization (3 logits frozen for the gauge) + damped Gauss–Newton (finite-diff Jacobian, one `lstsqHouseholder` step each); seed pluggable (lightning wired in Phase 3). GT: scalene triangle, regular pentagon from a skewed seed, reentrant L-shape — all reproduced to ≥10 digits |
| **3 — Two-mode API + invariants + fast mode** | ✅ done | _this commit_ | public `fitSchwarzChristoffel` (`scMap.ts`, Option A): precise (machine precision, convex+reentrant), fast (lightning; convex reliable ~3–4 digits, reentrant `degraded`-flagged), warm-start continuation, quadrilateral modulus + centre; barrel export + README; [ADR-0020](../DECISIONS.md#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode) |
| **F (fast-follow) — inverse map** | ✅ done | _this commit_ | ODE+Newton (Driscoll–Trefethen §3.3): pull the centre→z segment back through `dw/dτ = (z−A)/f′(w)` (RK4), then Newton-refine `w ← w − (f(w)−z)/f′(w)`. Precise round-trips `f(f⁻¹(z))=z` to ≥9 digits on pentagon/square/L-shape; fast uses the lightning `f` fit |

---

## 0. Scope locked this session

The three question rounds settled the whole contract (full record in
[research-notes §1](schwarz-christoffel-research-notes.md)):

- **Domain class (v1):** bounded **simple** polygons, convex **and** reentrant. Exterior, unbounded,
  circular-arc, and crowding-robust are **deferred** (§8).
- **Canonical domain:** the **unit disk 𝔻**.
- **Method:** **lightning-seeded SC** — reuse the built lightning engine + `lstsq` + Arnoldi; add only
  Gauss–Jacobi quadrature.
- **Two modes (Option A):** **fast** *is* the existing lightning engine (instant, approximate
  prevertices, warm-startable → real-time); **precise** is the classical SC parameter solve, **seeded**
  by lightning's prevertices. One honestly-flagged result type spans both.
- **Precise-mode v1:** **forward only** (𝔻→polygon); **≥12-digit** forward, **≥10-digit** vs. the
  closed-form golden corpus; **~8–10:1 aspect ceiling** with honest degradation labeling past it.
- **Outputs:** prevertices + accessory constants A, C + conformal invariants (modulus, center) + honest
  residual.
- **Serialization:** **package API only** — no `@cas/interchange` form this step (deferred, §8).
- **Consumer:** `@cas/conformal`'s API; Riemann-map **app UI wiring is a later step**, not v1.

---

## 1. Architecture & cross-cutting decisions

### 1.1 Option A — two representations, one shared seed (the mode model)

Fast and precise are **different computations that share the prevertex seed**, presented behind one
result type:

```
FAST  : run lightning fit  →  prevertices zₖ = f(vₖ)/|f(vₖ)|  (forwardMap.ts:59, already computed)
        →  render via lightning's rational eval  (true boundary map, ~6–8 digits, instant, warm-start free)
PRECISE: seed the SC parameter problem with those zₖ  →  Gauss–Newton (each step = one lstsq)
        →  the exact SC integral map  (≥12 digits, converged, meaningful prevertices/A/C)
```

Natural UX (now wired in the app): **drag with lightning, release → SC refine.** The
representational seam — fast reports lightning's *approximate* prevertices, precise reports the
*SC-solved* ones — is made honest by a `converged` flag and the `≈` residual (§1.5), never hidden.
Rationale and the rejected alternative (one SC engine at two tolerances) are the ADR-0020 record (§7).

> **Shipped refinement (as built):** the precise mode's *default* seed is a **uniform cold start**, not
> the lightning prevertices — the parameter solve is robust to machine precision from uniform on convex
> **and** reentrant polygons, and cold-starting sidesteps a lightning-seed stall on strongly reentrant
> shapes. The lightning zₖ instead feed precise **through `warmStart`** (the "release → refine"
> continuation above), so the lightning-seeded path is opt-in rather than the default. Matches ADR-0020's
> "seeded via `warmStart` by a fast/prior solve."

### 1.2 The one new primitive stays in `@cas/conformal` (ADR-0007)

Gauss–Jacobi quadrature (Golub–Welsch + a symmetric-tridiagonal eigensolver) is SC's **only** new
numeric dependency. It lives **inside `@cas/conformal`**, not `@cas/core`: SC is its sole consumer, and
ADR-0007's discipline is to extract only on a *second* consumer. (Contrast `lstsq`, which earned
`@cas/core` in ADR-0018 precisely because QD carried a near-twin.) Record it as a future
core-extraction candidate; do **not** pre-extract. Everything else reuses
[`lstsqHouseholder`](../../packages/core/src/lstsq.ts) and
[`arnoldiBasis`](../../packages/conformal/src/vandermondeArnoldi.ts).

### 1.3 Reuse posture — seed, don't rebuild

The lightning engine is *not* touched or wrapped; SC **calls** `fitConformalMap` to obtain the seed and
otherwise stands beside it. `fitForwardMap`'s existing `corners?` hook (the ADR-0018 plug-in point)
already computes the seed — SC consumes the same quantity. No mature-math rewrite (VISION non-goal).

### 1.4 Convention neutrality (ADR-0006 holds)

SC is app-neutral geometry: **no** `π`/`2πi` normalization enters `@cas/conformal`. Angles are carried
as `αₖ` (interior/π); the map object is convention-free. (Interchange, when it later lands, travels
CANONICAL — deferred.)

### 1.5 Honest labeling (guardrail, first-class)

- **Angles** `αₖ` are `=` (exact geometry). **Prevertices, A, C, modulus** are `≈` — the map is
  numerical either way. Each `SCMap` carries a **residual** (max side-length-ratio error for precise;
  the lightning `boundaryResidual` for fast) as its `≈` accuracy tag.
- **Crowding wall:** monitor min prevertex spacing / parameter-Jacobian conditioning; past the ~8–10:1
  ceiling, set a `degraded` flag and label accuracy honestly rather than returning silent garbage.
  `converged: false` whenever the solve did not reach tolerance.

### 1.6 Dependency direction, testing, census

- **Down-only:** `@cas/conformal → @cas/core` (existing edge). No new package, no app edge. dep-cruiser
  stays green.
- **Vitest, node env** (pure math, no DOM) — the package's existing test model. Every new module ships
  golden-value tests from [research-notes §6](schwarz-christoffel-research-notes.md#6-ground-truth-golden-corpus-the-validation-spine).
  The census floor (`scripts/assert-test-census.mjs`, `conformal` project) is already registered from
  step D; new specs only raise the count.
- **Full gate each phase:** `pnpm typecheck` · `pnpm lint` (+ dep:check) · `pnpm test` · `pnpm build`.

---

## 2. Public API (the surface to design once)

Mirrors Driscoll's proven **construct = solve, then evaluate** model; disk-canonical; read-only solved
internals. Complex `C = [number, number]`.

```ts
// @cas/conformal — Schwarz–Christoffel surface (new)

export interface Polygon {
  readonly vertices: readonly C[];      // Ω-plane, counter-clockwise
  readonly angles?: readonly number[];  // interior angles / π (αₖ); inferred from vertices if omitted
}

export interface SCMap {
  readonly mode: "fast" | "precise";
  readonly converged: boolean;          // precise reached tol; fast is always false-by-nature
  readonly degraded: boolean;           // crowding wall hit → accuracy honestly reduced
  readonly angles: readonly number[];   // αₖ, exact (=)
  readonly prevertices: readonly C[];   // on ∂𝔻 (≈)
  readonly constant: C;                 // multiplicative C (≈)
  readonly center: C;                   // A = f(0), the conformal center (≈)
  readonly modulus?: number;            // conformal modulus for the quadrilateral case (≈)
  readonly residual: number;            // honest ≈ tag (max side-ratio error / boundaryResidual)
  forward(w: C): C;                      // 𝔻 → polygon
  forwardMany(ws: readonly C[]): C[];    // batched (one Arnoldi/quadrature pass)
  // inverse(z: C): C;                   // fast-follow (Phase F)
}

export interface SCOptions {
  mode?: "fast" | "precise";            // default "precise"
  tol?: number;                          // precise stop tolerance on ‖F‖ (default ~1e-12)
  maxIter?: number;
  warmStart?: SCMap | readonly C[];      // continuation: reuse a prior solve's prevertices (drag)
}

export function fitSchwarzChristoffel(poly: Polygon, opts?: SCOptions): SCMap;
```

Exported from [`packages/conformal/src/index.ts`](../../packages/conformal/src/index.ts) alongside the
lightning/forward surface. `warmStart` is what makes the fast mode real-time (§0).

---

## 3. Phase-by-phase runbook

Each phase ends **shippable** with a **ground-truth** check. Effort is relative (S/M/L). The golden
corpus's gift: symmetric cases have **known prevertices**, so Phases 0–1 validate the forward integral
*before* the parameter solve exists — the early motivating win.

### Phase 0 — Gauss–Jacobi quadrature primitive · effort M

**Goal:** SC's one new numeric primitive, standalone and golden-tested.

- `src/gaussJacobi.ts`: Jacobi three-term-recurrence coefficients (`a=0, b=−β`); the symmetric-
  tridiagonal Golub–Welsch eigensolver (implicit-QL + Wilkinson shift); node/weight cache per exponent.
- `src/scQuadrature.ts`: the compound rule — split a side at its midpoint; the ill-separation test
  `d(e) < ℓ(e)/(3√2)` with three-way subdivision; Gauss–Jacobi at a singular endpoint, Gauss–Legendre
  interior.
- **Gate:** quadrature reproduces closed-form integrals. **GT:** `∫₀¹(1−tⁿ)^{−2/n}dt = (1/n)B(1/n,1−2/n)`
  to ≥12 digits for `n=3,4,5,6`; a foreign-singularity-near-path case matches a high-order reference
  (the compound rule earns its keep).

### Phase 1 — Forward SC map with **given** prevertices · effort M · _first motivating win_

**Goal:** evaluate `f(w) = A + C∫₀ʷ∏(1−t/wₖ)^{αₖ−1}dt` for a supplied prevertex set — the whole forward
machine minus the nonlinear solve.

- `src/schwarzChristoffel.ts` (internal core): integrand `f'`, side integrals via Phase-0 quadrature,
  recover `A, C` from two vertices, `forward`/`forwardMany`.
- **Gate:** with prevertices set to the **nth roots of unity** (regular n-gon) and to the **rectangle
  prevertices** `±1, ±1/k`, the forward map reproduces the exact polygon. **GT** (research-notes §6):
  regular n-gon circumradii `Rₙ` (`n=3,4,5,6`) to ≥10 digits; the square's exact corner/edge-midpoint
  images; conformal radius `|f'(0)| = 2/K(1/√2) = 1.0787052023767587…` to ≥10 digits.

### Phase 2 — The parameter problem (general polygons) · effort L · _the core new work_

**Goal:** solve for the prevertices of an arbitrary bounded simple polygon, **seeded by lightning**.

- `src/scParameterProblem.ts`: the `n−3` side-length-ratio residuals `F`; the **softmax** gap
  substitution (ordering by construction); trust-region **Gauss–Newton** with each step an
  `lstsqHouseholder` solve; **seed = `fitConformalMap(...)` prevertices** (the lightning-seeded thesis).
- Crowding detection + `degraded`/`converged` flags (§1.5).
- **Gate:** convex + reentrant polygons to ≥12 digits. **GT:** an **L-shape** (regenerate accessory
  parameters / conformal modulus to ~30 digits via `mpmath`, cross-check the modulus against
  Papamichael–Stylianopoulos) to ≥10 digits; an **asymmetric Schwarz triangle** (closed-form Γ side
  ratios); a re-derivation of the regular-n-gon prevertices (roots of unity) *from a cold start* to
  confirm the solver, not just the integral.

### Phase 3 — Two-mode API, invariants, warm start · effort M

**Goal:** the public `fitSchwarzChristoffel` (§2) wiring Option A end to end.

- `src/scMap.ts`: `mode` dispatch — **fast** = lightning fit + prevertices + invariants (no parameter
  solve); **precise** = Phase-2 solve. The unified `SCMap` with `converged`/`degraded`/`residual`.
- Conformal **modulus** (quadrilateral case) and **center** `A`; `warmStart` continuation path (reuse
  prior prevertices → 1–2 Gauss–Newton steps).
- Barrel export from `index.ts`; README section.
- **Gate:** the two-mode API ships; fast returns instantly with `≈`/`converged:false`; precise refines
  to the corpus. **GT:** fast vs. precise agree to ~6–8 digits on the corpus; a warm-started re-solve
  after a small vertex perturbation converges in ≤2 steps (the real-time guarantee, engine-level).

---

## 4. Test strategy

- **Golden-value spine** = [research-notes §6](schwarz-christoffel-research-notes.md#6-ground-truth-golden-corpus-the-validation-spine):
  exact n-gon radii, the square map's exact corners/edges/conformal-radius, rectangle aspect↔modulus,
  and the regenerated L-shape. All solver-independent closed forms — no JS/TS incumbent to diff against
  (research-notes §5), which is why the corpus is self-sourced and exact.
- **Layered:** Phase 0 tests the quadrature alone; Phase 1 the forward integral with *known*
  prevertices (isolates integration error from solver error); Phase 2 the parameter solve
  (symmetric-case prevertices recovered cold; asymmetric side ratios); Phase 3 the mode wiring + warm
  start.
- **Honesty tests:** assert the `≈` residual is populated and monotone-shrinking fast→precise; assert
  the crowding `degraded` flag trips on a `>10:1` domain.
- **Oracle (optional):** Driscoll's BSD-3 SC Toolbox / `SchwarzChristoffel.jl` (MIT) may be run offline
  to generate extra reference prevertices; values are *pinned as data*, never imported at runtime.

---

## 5. Definition of done (v1)

- `fitSchwarzChristoffel` maps any **bounded simple polygon** (convex + reentrant, ≲30–50 vertices,
  aspect ≲8–10:1) from **𝔻 → polygon** in both modes.
- **Precise:** forward ≥12 digits; golden corpus ≥10 digits; crowding wall detected + labeled.
- **Fast:** instant, warm-startable, ~6–8 digits, honestly `≈`/`converged:false`.
- **Outputs:** prevertices, A, C, modulus, center, residual — read-only on `SCMap`.
- **ADR-0020 written** (§7). Full gate green; census raised. The inverse map landed as the Phase-F
  fast-follow; **no app UI, no interchange** (still deferred, by design).

---

## 6. Effort & sequencing

Phases 0→1→3 are the shortest path to a *shippable forward SC engine on the symmetric cases*; Phase 2
is the bulk of the genuinely new work (the nonlinear solver) and can land as its own reviewable step
between 1 and 3. Suggested commit cadence: one per phase (Phase 2 possibly split: solver core, then
crowding/flags). Pause at each gate for review per the suite's runbook discipline.

---

## 7. ADR to write (ADR-0020, at the Phase-1 gate)

Record the **method choice**, since it's a real decision with rejected alternatives:

- **Decision:** lightning-seeded SC; disk-canonical; Option A two-mode (fast = lightning, precise =
  seeded parameter solve); Gauss–Jacobi kept in `@cas/conformal` (ADR-0007); forward-only v1.
- **Options considered:** (A, chosen) lightning-seeded SC reusing the substrate; (B) one SC engine at
  two tolerances — *rejected:* spends effort making a nonlinear solve do the linear lightning solve's
  job, heavier per-frame, worse fit for the real-time fast mode; (C) skip SC, rely on lightning +
  AAA-LS — *rejected:* forfeits the exact analytic record / meaningful prevertices, which is the whole
  reason to build SC.
- **Consequence:** retro-justifies ADR-0018's extract-ahead (SC is the promised second consumer);
  `@cas/conformal` gains its second engine; the `corners?` hook's purpose is realized. Records the
  deferred roadmap (§8) and the Gauss–Jacobi core-extraction trigger.

Also flip [ADR-0018 Action Item 6](../DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore)
("Anticipated: build Schwarz–Christoffel…") to done, and sync the "second consumer" language in
CLAUDE.md / ARCHITECTURE.md / the package README once the engine lands.

---

## 8. Deferred / roadmap (explicit non-goals for v1)

Tracked so the seams are deliberate, not forgotten:

- ~~**Inverse map** (polygon→𝔻): ODE+Newton hybrid (research-notes §3). The immediate **fast-follow**
  (Phase F).~~ **Done** — see the Build-progress table.
- **CRDT** (cross-ratio + Delaunay) for **elongated/crowded** polygons past the ~10:1 wall.
- **Variants:** exterior maps, unbounded polygons (vertices at ∞), doubly-connected/annulus (DSCPACK
  ideas, reimplemented).
- **Generalized SC:** circular-arc polygons (Schwarzian-ODE) — the curved-boundary bridge toward QD /
  correspondence shapes.
- **`@cas/interchange` `form:"schwarz-christoffel"`** recipe (angles `=`, prevertices/A/C `≈`) — the
  natural next consumer; the analytic record is tailor-made for it (cf. the `form:"schwarz"` σ hand-off
  in [`SIGMA-HANDOFF.md`](SIGMA-HANDOFF.md)). Gate on a real receiving tool (ADR-0007).
- ~~**Riemann-map app wiring:** replace the smooth-only region source with the SC engine so a polygon
  domain is first-class in the studio UI.~~ **Done** — `fitRegion` routes polygon `corners` through
  `fitSchwarzChristoffel`; the region picker offers the polygon presets; the panel reports the SC method.
- **Zipper / geodesic engine** (Marshall–Rohde, clean-room): the curved/**fractal** Jordan-boundary
  sibling — a *different* Tier-3 engine, not part of SC. `ConformalMaps.jl` (MIT) is the oracle.
- **AAA-LS** pole-placement upgrade for the lightning engine's own robustness (research-notes §2, the
  smaller alternative to SC when the need is robustness, not representation).
