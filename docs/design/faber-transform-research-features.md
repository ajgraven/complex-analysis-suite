# Faber Transform Visualizer — Research-Feature Proposal (literature-driven)

> A prioritized menu of extensions for `apps/faber-transform`, synthesized from a six-strand review of
> the Faber-transform literature (classical/convergence, numerical/matrix-functions, geometric function
> theory, potential theory & complex dynamics, quadrature domains & the maintainer's paper, and the
> Faber operator on function spaces + generalizations). This is a **proposal**, not a commitment; it
> complements `faber-transform-roadmap.md` (which tracks Phase A/§2/§3, now shipped). Difficulty is S/M/L;
> every item notes the existing `@cas/*` machinery it reuses. Honest-labeling guardrails (`=`/`≤`/`≈`)
> are called out where the math is asymptotic or truncation-bounded.

## The one fact that unifies everything

For the app's exterior map `φ(z) = c z + c₀ + c₁/z + …` (`𝔻* → Ω`, `K = ℂ∖Ω`), five objects are the
same thing viewed from different angles:

- **logarithmic capacity** `cap(K) = |c|` (leading coefficient — the app already holds it exactly);
- the **Green's function** `g_Ω(w,∞) = log|φ⁻¹(w)|`, whose **equipotentials `{g = log R}` are exactly
  `φ({|z| = R})`** and whose **external rays are `φ({arg z = θ})`**;
- the **equilibrium measure** `μ_K = φ_*(dθ/2π)` on `∂K`;
- the **Faber asymptotic** `|Fₙ(w)|^{1/n} → e^{g_Ω(w,∞)}`, with the phase winding along the external angle;
- the **Böttcher coordinate** of a filled Julia set (for a monic polynomial `ψ_P = φ⁻¹`, `cap = 1`).

So the sibling **Complex Dynamics** app + `@cas/dynamics` already compute (for Julia sets) most of what a
general Faber visualizer needs, and much of the "new" math below is a re-view of data the app has.

---

## Tier 1 — "Convergence & potential theory, made visible" (do first; S–M, near-pure reuse)

These three reuse the existing `φ`, the Faber recurrence, the exact rational image, the FFT/series
coefficient path, and the GPU phase-portrait pipeline, plus `@cas/dynamics`' equipotential/ray code. They
deliver the core pedagogical payload with almost no new math.

### T1.1 — Green's-function equipotentials + external rays + capacity readout ⭐
- **Shows:** on the K-panel, level curves `Γ_R = φ({|z|=R})` for a slider of `R`, and external rays
  `φ({arg z=θ})`; paired concentric circles / radial spokes on the disk-panel; a readout of
  `cap(K)=|c|` (exact `=`) and Robin constant `γ = −log|c|`.
- **Math:** `g_Ω = log|φ⁻¹|`; equipotential = image of a circle; ray = image of a radius. The critical
  level `R*` (largest `R` with `f` analytic inside) is the "boundary of convergence" of `Σ bₙ Fₙ`.
- **Why:** the single most legible bridge between the two panels — the disk's polar grid literally maps to
  the domain's potential-theoretic skeleton; makes "the radius of convergence becomes a Green's level
  curve" concrete.
- **Difficulty:** S. **Leverage:** `@cas/dynamics` external-ray + Green renderer (same computation); the
  app's `φ` evaluation and GPU grid.

### T1.2 — Animated partial-sum convergence + Faber-vs-Taylor + rate diagnostics ⭐
- **Shows:** a degree slider / autoplay of the truncated image `Sₙ = Σ_{k≤n} bₖ Fₖ` filling in, with a live
  error heatmap `|exact − Sₙ|` where an exact rational image exists, and the convergence "wavefront"
  tracking `Γ_{R*}`. A side-by-side "race" of the Faber image vs the naive monomial/Taylor image at equal
  degree, plus a small `|bₙ|^{1/n} → 1/R*` line chart.
- **Math:** Bernstein–Walsh: `‖f − Sₙ‖_K = O(R*^{−n} log n)` inside `Γ_{R*}`, divergent outside; Faber is
  geometry-adapted where Taylor is not (deltoid: `|Fₙ| ≲ 1` on `∂K`, `≳ (1/3)(1+√ε)ⁿ` just outside).
- **Why:** dramatizes the convergence theorem and answers "why Faber at all?" quantitatively; the
  wavefront hugging a level curve is a striking visual.
- **Difficulty:** S–M. **Leverage:** existing recurrence + exact `N(w)/D(w)` ground truth + adaptive-FFT
  coefficients + GPU difference shader; chart styling per the `dataviz` skill. Label `R*` `≈` when numeric,
  `=` when read from an exact rational pole.

### T1.3 — Faber-zero explorer: equidistribution & the cusp anomaly ⭐
- **Shows:** the Faber roots (already a feature) for increasing `n`, animating toward `∂K`, with the
  equilibrium density `μ_K` overlaid as a heat-strip in external angle `θ`; the `{|Fₙ|=1}` lemniscate that
  "learns" the domain shape. A toggle contrasts the smooth-boundary limit (zeros → `μ_K`) with the
  **cusp anomaly**: for the deltoid / Joukowski airfoil the zeros do **not** equidistribute to `μ_K` — they
  collapse onto an interior electrostatic skeleton (Levenberg–Wielonsky).
- **Math:** `μ_K = φ_*(dθ/2π)`; Ullman/Pritsker equidistribution vs the cusped exception.
- **Why:** beautiful *and* research-grade — the anomaly lives on the app's own flagship domain and is
  current (2018–2025) literature.
- **Difficulty:** S–M (root-finding stability at high `n` is the only risk). **Leverage:** existing
  Faber-root machinery + Argument-Principle root rendering; `μ_K` is a pushforward of uniform `θ`.
  **Guardrail:** the zero cloud is `≈`; surface a "skeleton, not equilibrium measure" note on cusped `K`.

---

## Tier 2 — Flagship invariant, first cross-app loop, domain-class expansion (M)

### T2.1 — Grunsky matrix / norm: univalence & quasidisk certificate ⭐ (flagship analytic result)
- **Shows:** for the current `φ`, the truncated Grunsky matrix `G_N = (√(mn) α_{mn})_{m,n≤N}` as a
  magnitude/phase heat-strip, plus its spectral norm `κ_N(φ)` with a verdict badge: `κ<1` "univalent /
  quasidisk", `κ→1` "borderline (cusp/slit forming)", `κ>1` "not univalent". Drive a domain knob and watch
  `κ` cross 1 as the boundary self-touches.
- **Math:** the Grunsky coefficients **are** the Faber Laurent data — `Fₙ(φ(ζ)) = ζⁿ + n Σ_k α_{nk} ζ^{−k}`
  — so the app already computes them. Grunsky's theorem: univalent `⇔ κ = ‖G‖ ≤ 1`; Kühnau–Pommerenke:
  `κ ≤ k` for a `k`-qc extension, `κ<1 ⇔ K` is a quasidisk. This is also the **operator-health meter**:
  Faber-operator boundedness/invertibility degrades exactly as `κ → 1` (Anderson–Clunie; Schippers–Staubach
  "isomorphism ⇔ quasicircle").
- **Why:** *the* geometric-function-theory certificate, and the app is one of very few places it could be
  shown live — and it costs almost nothing because it reuses the Faber recurrence's own output. Ties to the
  maintainer's QD/Faber work and the suite's Schwarz-reflection theme.
- **Difficulty:** M (matrix assembly + a few power-iteration steps for the top singular value).
  **Leverage:** exact Laurent/Faber coefficients already computed; GPU heatmap; CPU SVD.
  **Guardrail:** `κ_N` from a truncation is a **lower bound** on the true norm — label `≤/≈`, never a
  certified univalence proof. Validate against ellipse (Chebyshev) and deltoid (arXiv:2507.01885) golden values.

### T2.2 — QD → Faber interchange hand-off + Schwarz-function overlay (tightens the suite loop)
- **Shows:** (a) consume a `@cas/interchange` `form:"schwarz"` envelope emitted by the **Quadrature
  Domains** app (closed-form `φ` + inverse branch) and render the Faber image of an arbitrary `f` on that
  QD's `K`; conversely emit the app's `φ` as a `form:"laurent"`/`form:"bounded"` `MapSpec` for QD/CD to
  consume. (b) For the current domain, overlay the **Schwarz function** `S(w) = C_{Ω*}(w) + h(w)`, mark the
  boundary `S(w) ≐ w̄`, and render the potential triptych `C_Ω`, `h`, `C_Ω − h` (paper Fig. 3).
- **Math:** the exterior Faber transform needs exactly the Laurent jet of `φ`, which the interchange schema
  already carries; `h = Φφ(φ# − φ(0))` and `S∘φ = φ#` give `S` in closed form (paper Eq. 1.5, Thm 1.5/1.6).
- **Why:** closes the loop the roadmap keeps gesturing at — QD computes `σ`, CD renders its dynamics, Faber
  becomes the **third consumer** of the same serialized `φ` (ADR-0007). Makes the Schwarz function — the
  object the QD/Correspondences apps compute — visible as a *field*.
- **Difficulty:** S–M (schema + `@cas/faber` + `@cas/schwarz` all exist; mostly an adapter + a cross-app
  golden, mirroring `CD_TO_RM_BOTTCHER_LINK`). **Leverage:** highest of any item — `@cas/interchange`
  `form:"schwarz"`, `@cas/schwarz` (`makeBoundedSchwarz`/`makeUnboundedLaurentSchwarz`), `@cas/faber`.

### T2.3 — Faber on polygonal / cornered K via the Schwarz–Christoffel engine (biggest domain-class win) — **DONE (M1a + M1b + M2 + M3)**
> Full implementation plan (with M0 spike results): [`faber-polygonal-sc-plan.md`](faber-polygonal-sc-plan.md).
- **Shipped:** the app renders Faber images on cornered polygonal `K` — **M1a** regular-polygon presets
  (closed-form exterior map), **M1b** arbitrary convex **and** reentrant polygons via the new **exterior**
  Schwarz–Christoffel engine in `@cas/conformal` (`exteriorSchwarzChristoffel.ts` forward map +
  `exteriorScParameterProblem.ts` multi-seed damped Gauss–Newton solve + Laurent-at-∞ extractor), and
  **M2** adaptive Laurent truncation (geometry-aware order + tail-tolerance trim), per-corner norm
  annotations `Λ_k = max{λ_k, 2−λ_k}` (Miña-Díaz–Rubin–Wennman 2025), a draggable-vertex polygon editor, and
  (**M3**) the corner-**suppressing** weighted Faber polynomials `Q_{n,m}` — a toggle + strength slider that
  renders `Q_{n,m} = Σⱼ gⱼ F_{n−j}` for a monomial input, with a before/after `|Fₙ|` vs `|Q_{n,m}|` boundary
  profile. Polygon domains are honestly `≈`-labeled; a failed/degenerate fit shows `⚠` with blank panels.
- **How:** the exterior SC map serves as `φ`; its Laurent jet at `∞` (built via `@cas/core makeSeries`
  generalized-binomial expansion of the D&T §4.2 integrand, closure ⇔ `Σ(1−α_k)/u_k = 0`) feeds the
  existing Faber recurrence. Reentrant corners/cusps visibly stress convergence — flagged `degraded`. The
  `Q_{n,m}` weight `G_m = ∏_k (1 − w_k/φ)^{1/m}` (corner images `w_k = 1/u_k` from the SC prevertices) is a
  finite linear combination of the same `F_n` — no new numerics (eq. 1.9, ibid.).
- **Leverage realized:** the Riemann-map studio's SC engine in `@cas/conformal` — precisely the flagged
  synergy; the exterior variant is now a second family alongside its interior/bounded builders.

---

## Tier 3 — Realize the paper's theorems + research-frontier extensions (M–L)

### T3.1 — Inverse-problem panel: reconstruct Ω from its quadrature function h
- **Shows:** user enters a rational `h(w) = Σ α_k/(w−a_k)^{m_k+1}`; the app renders the reconstructed QD
  boundary `∂Ω` beside the disk.
- **Math:** paper Thm 1.5/1.6 — `φ = φ(0) + Φφ⁻¹(h)#` (bounded) / `φ(z) = c z + Φφ⁻¹(h)#(z)` (unbounded).
  Because `Φφ⁻¹` depends on `φ`, this is a fixed-point / algebraic solve (the cardioid reduces to
  `α₀ = a²+2|b|²`, `α₁ = b a²`). Seed with `φ = c z` and Newton-iterate, or solve the finite system.
- **Why:** makes the paper's *central* result interactive — "type a quadrature identity, watch its domain
  appear" — the natural inverse of what the app already does forward.
- **Difficulty:** M (fixed-point solver + univalence/existence gating). **Leverage:** `faberTransformRational`,
  `polynomialRoots` (Durand–Kerner), `lstsqHouseholder`, `exteriorMapJet`.

### T3.2 — One-point-QD parameter plane (Theorem 2.1 as a phase diagram)
- **Shows:** an `α`-plane explorer shading the **parabolic existence region** `|w₀|² + 2Re(α) > 2|α|`; for a
  chosen `α`, animate the monotone family `{Ωₜ}` from small `t` to `t*`, showing the terminal **double
  point** (`α>0`) vs **(3,2) cusp** (`α<0`/complex).
- **Math:** Riemann map `φₜ(z) = c z ((z−z₀+w₀/c)/(z−z₀))^{(|z₀|²−1)/|z₀|²}` with the quartics for
  `z₀(c)`, `c(t)` (paper Eqs. 2.2–2.4).
- **Why:** a complete classification theorem turned into a phase diagram — visually explains where QDs
  exist and how they die (cusp formation), the singular-boundary phenomenon the whole suite studies.
- **Difficulty:** M (root-tracking the quartics, cusp detection). **Leverage:** Durand–Kerner, `exteriorMapJet`,
  shared boundary tracer; parallels the Correspondences family parameter plane.

### T3.3 — Weighted-domain (PQD/LQD) generators + the transcendental teardrop
- **Shows:** add power-weighted `φ = φ_in · r#^{1/a}` (Thm 3.11) and log-weighted `φ = φ_in · e^{r#}`
  (Thm 4.8) families to the domain picker — including the **teardrop** `φ(z) = z e^{1/z}` and the
  `Z_k`-symmetric monomials. Then render the §5 preview: the tiling / non-escaping sets of the teardrop's
  Schwarz reflection `σ(w) = w⁻¹ e^{−W(−w⁻¹) − W(−w⁻¹)⁻¹}` (principal Lambert-W), juxtaposed with the
  filled Julia set of `w ↦ e^{1/w}` (paper Fig. 21).
- **Math:** the Faber machinery is unchanged (still just needs the Laurent jet of `φ`); new work is
  evaluating fractional-power/exponential-of-rational maps and their branch cuts, plus a Lambert-W.
- **Why:** extends the app to the paper's *new* weighted families and **builds the picture from the paper's
  own preview section**, pre-figuring the announced sequel — a headline QD → Correspondences/CD demo.
- **Difficulty:** M–L (branch handling; add Lambert-W to `@cas/core`). **Leverage:** `exteriorMapJet`
  extended; `@cas/schwarz` `escapeTime` + the existing GPU σ escape-field renderer (the CD peer-view), fed
  via the same `form:"schwarz"` interchange as T2.2 so CD renders `σ` with zero new dynamics code.

### T3.4 — "Faber polynomials of a Julia set" cross-app hand-off (flagship correctness cross-check)
- **Shows:** import a filled Julia set `K_P` from Complex Dynamics (its Böttcher map `ψ_P = φ⁻¹`) as a
  Faber domain; render its Faber polynomials, roots, and equipotentials, and compare to the dynamics app's
  own external rays / Green's function — the *same picture computed two independent ways*.
- **Math:** `ψ_P = φ⁻¹`, `cap(K_P) = 1`, external rays = Faber phase curves; Brolin ⇒ the zero limit should
  be `μ_{K_P}` (smooth-boundary case); `F_{d^k} ≈ P^{∘k}` (Faber polynomials interpolate the iterates).
- **Why:** the strongest "suite" story and a built-in correctness cross-check; realizes the north-star
  "hand data off to one another."
- **Difficulty:** L (needs an interchange form carrying `ψ_P` as a Böttcher/Laurent series and reconciling
  the monic `c=1` normalization; the CD → Riemann-Map Böttcher deep-link #257 is the template).
  **Leverage:** highest — `@cas/dynamics` already computes Böttcher + external rays + Green/escape-time and
  CD already *exports* a `kind:"map"` `LaurentMap`; Faber becomes a second consumer (ADR-0007).

### T3.5 — Matrix-function / accelerated-iteration applications tab
- **Shows:** place a matrix spectrum / field of values inside `K`; animate the Faber-series approximation
  of `exp(tA)v` (or `f(A)v`), the per-degree residual, the Beckermann–Reichel error bound vs the actual
  error, and (on the deltoid) the Cowal–Marshall–Pollock **momentum power-iteration** speedup.
- **Math:** `f(A) ≈ Σ bₙ Fₙ(A)v` via the recurrence (matvecs only); convergence set by `max g_Ω` over the
  spectrum; `‖Fₙ(A)‖ ≤ 2` for numerical-range containment (Beckermann–Crouzeix). exp via Faber
  interpolation at Faber zeros (Moret–Novati).
- **Why:** the *headline numerical application* of the exterior Faber transform — and the 2025
  deltoid-momentum papers use the app's exact flagship domain. Ties pure complex analysis to real numerical
  linear algebra (exponential integrators, stiff ODEs, Krylov solvers).
- **Difficulty:** M–L (small dense `A` on CPU/GPU; less "visual"). **Leverage:** the recurrence engine
  evaluated on matrices; the error-field renderer; the deltoid `φ`/`Fₙ` already exact.

---

## Tier 4 — Stretch / breadth

- **T4.1 — Arbitrary smooth Jordan domain via numerical φ.** Compute `φ`'s Laurent coefficients for a
  user-drawn smooth curve (Fornberg Newton iteration, FFT-based `O(N log N)`; or a Symm/Neumann-kernel
  boundary-integral equation), then run the full pipeline. The general "bring your own domain" unlock.
  Difficulty **L**. Leverage: Riemann-map BIE/conformal solvers.
- **T4.2 — Faber–Walsh mode for disconnected / multiply-connected K** (two intervals, disk+blob,
  disconnected Julia sets). Walsh's lemniscatic map `{|U|>μ}`; equipotentials become lemniscates. Start
  with the cheap **polynomial-preimage special case** (`b_{nk} ∝ F_k∘P`, no new solver). Difficulty **L**
  (general), **S–M** (preimage case). Refs: Sète–Liesen (arXiv:1502.07633).
- **T4.3 — Inverse Faber transform + Faber–Laurent two-sided view.** Paint/import `g` on `K`, recover its
  Faber coefficients `aₙ = FFT of g∘φ`, reconstruct + show residual; split a boundary function into
  interior-Faber + exterior Faber–Laurent (Cauchy/Plemelj jump). Completes the transform pair. Difficulty **M**.
- **T4.4 — Branch-aware / multivalued Faber (Faber–Tietz)** tied to the **Correspondences** branch engine /
  orbit trees — the roadmap's "multivalued/branch-aware later" item. Per-sheet Faber images with branch-cut
  coloring. Difficulty **L**. Refs: Schippers–Shirazi–Staubach (arXiv:2303.15677).
- **T4.5 — Grunsky/exponential-transform fingerprint & Widom-factor stress test.** `|Fₙ|=R` lemniscates
  converging to `∂K`; the exponential transform `E_Ω(z,w)` (rational for a QD, Gustafsson–Putinar) as a
  domain fingerprint; `‖Fₙ‖_K/cap(K)ⁿ` vs `n` flagging divergence when `κ≈1` or a sharp corner exists.
  Difficulty **S** (lemniscates) to **L** (exp-transform panel).

---

## Cross-cutting notes

- **Convention discipline (ADR-0006).** The app's `φ` is the *exterior generator* `𝔻*→Ω`; the
  bi-univalent/Bieberbach `aₙ` literature uses the *interior* map `z + Σ aₙ zⁿ`. Keep the two roles
  labeled — a silent inverse-swap is the classic bug. The paper's formulas use the QD-edge conventions
  (`dA = dx dy/π`, `2πi`-suppressed contours); normalize at the app/domain edge, never in `@cas/core`.
- **Honest labeling (guardrail).** `cap(K)=|c|` and exact rational images are `=`; Grunsky `κ_N`, Faber-zero
  clouds, truncation errors, `R*`, and all matrix-function/convergence-rate outputs are `≈`/`≤`. Faber
  zeros equal the equilibrium measure only for smooth boundaries — for cusped `K` (deltoid) they follow an
  interior skeleton.
- **Extraction discipline (ADR-0007).** Add packages only on a genuine second consumer. Lambert-W and any
  numerical-`φ`/lemniscatic solver land in `@cas/core`/`@cas/conformal` only when a second app needs them.

## Suggested first slice

**T1.1 + T1.2 + T1.3** (a self-contained "convergence & potential theory" release, all S–M, all reuse) →
**T2.1** (the Grunsky certificate, the flagship analytic invariant, from data already computed) →
**T2.2** (the QD → Faber interchange loop). That sequence maximizes payoff per unit of new math and sets up
every later tier.

## Key references

**Classical / convergence.** G. Faber (1903); P. K. Suetin, *Series of Faber Polynomials* (Gordon & Breach
1998) and the *Fundamental Properties…* survey (Russian Math. Surveys); J. H. Curtiss, *Faber Polynomials
and the Faber Series*, Amer. Math. Monthly 78 (1971); T. Kővári & C. Pommerenke, Math. Z. 99 (1967) 193;
D. Gaier, *Lectures on Complex Approximation* (Birkhäuser 1987).

**Numerical / matrix functions.** S. W. Ellacott, Math. Comp. 40 (1983) 575; B. Beckermann & L. Reichel,
*Error Estimates and Evaluation of Matrix Functions via the Faber Transform*, SIAM J. Numer. Anal. 47
(2009) 3849; I. Moret & P. Novati, J. Comput. Appl. Math. 131 (2001) 361; B. Beckermann & M. Crouzeix,
*Faber polynomials of matrices for non-convex sets*, arXiv:1310.1356; G. Starke & R. S. Varga, Numer. Math.
64 (1993) 213; T. Driscoll, K.-C. Toh, L. N. Trefethen, *From Potential Theory to Matrix Iterations…*, SIAM
Rev. 40 (1998); P. Cowal, N. F. Marshall, S. Pollock, *Faber polynomials in a deltoid region…*,
arXiv:2507.01885 (2025); L. C. Ravelo et al., arXiv:2211.00084 (2024); B. Fornberg, SIAM J. Sci. Stat.
Comput. (1980).

**Geometric function theory.** H. Grunsky (1939); I. Schur, Amer. J. Math. 67 (1945) 33; M. Schiffer,
*Faber polynomials in the theory of univalent functions* (Bull. AMS); P. L. Duren, *Univalent Functions*
(Springer 1983); N. A. Lebedev & I. M. Milin; L. de Branges, Acta Math. 154 (1985); H. Airault & A. Bouali,
Bull. Sci. Math. 130 (2006) 179; S. G. Hamidi & J. M. Jahangiri, C. R. Acad. Sci. Paris (2013–2016);
S. L. Krushkal, *The Grunsky operator and quasiconformality*, arXiv:2412.08018.

**Potential theory & dynamics.** E. B. Saff & V. Totik, *Logarithmic Potentials with External Fields*
(Springer 1997); T. Ransford, *Potential Theory in the Complex Plane* (CUP 1995); J. L. Ullman, Trans. AMS
94 (1960) 515; N. Levenberg & F. Wielonsky, *Zeros of Faber polynomials for Joukowski airfoils*,
arXiv:1809.10439; J. S. Christiansen, B. Simon, M. Zinchenko, *Asymptotics of Chebyshev Polynomials I–IV*;
J. Milnor, *Dynamics in One Complex Variable*; H. Brolin, Ark. Mat. 6 (1965) 103; K. Lindsey & M. Younsi,
*Fekete polynomials and shapes of Julia sets*, arXiv:1607.05055.

**Operator on function spaces & generalizations.** J. M. Anderson & J. Clunie, Math. Z. 188 (1985);
S. W. Ellacott, *The Faber Operator and its Boundedness*, J. Approx. Theory (1999); E. Schippers &
W. Staubach, *Analysis on quasidisks…*, EMS Surv. Math. Sci. 9 (2022), arXiv:2009.01954;
E. Miña-Díaz, O. Rubin, A. Wennman, *Norms of Chebyshev and Faber polynomials on curves with corners and
cusps*, arXiv:2509.22588 (2025); O. Sète & J. Liesen, *Properties and examples of Faber–Walsh polynomials*,
arXiv:1502.07633; E. Schippers, M. Shirazi, W. Staubach, *Faber–Tietz forms*, arXiv:2303.15677.

**Quadrature domains & the maintainer's paper.** A. J. Graven & N. G. Makarov, *Quadrature Domains and the
Faber Transform*, arXiv:2509.03777 (2025); D. Aharonov & H. S. Shapiro, J. Analyse Math. 30 (1976) 39;
P. J. Davis, *The Schwarz Function and its Applications* (MAA 1974); B. Gustafsson, J. Analyse Math. 55
(1990); M. Sakai, Acta Math. 166 (1991); S.-Y. Lee & N. Makarov, J. Amer. Math. Soc. 29 (2016) 333;
S.-Y. Lee et al., *Dynamics of Schwarz Reflections: The Mating Phenomena*, Ann. Sci. ÉNS (2018);
Y. Ameur, M. Helmer, F. Tellander, Comput. Methods Funct. Theory 21 (2021) 473; B. Gustafsson &
M. Putinar, *Hyponormal Quantization of Planar Domains: Exponential Transform…* (Springer LNM 2199, 2017).
