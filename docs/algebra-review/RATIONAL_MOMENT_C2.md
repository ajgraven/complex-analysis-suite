# C2 — the rational-φ moment route (multi-node existence/uniqueness)

> Continuation of [`ORCHESTRATOR_REDESIGN.md`](ORCHESTRATOR_REDESIGN.md) Phase C. **C1** made the
> single-node (point-functional / Aharonov–Shapiro) case rigorous via a **polynomial** Riemann map
> φ = Σ wₖzᵏ. **C2** extends the same idea to **multi-node** quadrature data, where the Riemann map is
> **rational**. This doc is the design + phased plan; the tractability is already proven (two spikes, §3).

## 1. Why C1 doesn't cover multi-node, and why the conjugate model is a dead end

A classical bounded quadrature domain Ω with the identity `∫_Ω f dA = Σ_j Σ_p c_{j,p} f^(p)(a_j)` has a
Riemann map φ : 𝔻 → Ω that is **rational**, of degree = the QD order n (Gustafsson). Two structural facts:

- **C1 is single-node by construction.** `pointFunctionalSystem` builds the moments about ONE point with a
  **polynomial** φ; a polynomial φ = Σ_{k≥1} wₖzᵏ has φ(𝔻) a single-node QD (all quadrature weight at
  φ(0)). It provably cannot represent two nodes.
- **The conjugate `(●)/(★)` model is intractable for multi-node.** Its inverse system keeps each z̄ⱼ, Āⱼ
  INDEPENDENT of zⱼ, Aⱼ (the two-point-symmetric preset yields 8 unknowns `[z₁,z̄₁,A₁₁,Ā₁₁,z₂,z̄₂,A₂₁,Ā₂₁]`)
  → positive-dimensional, the certified solve hangs, the cardioid Gröbner blows past 300 generators (the C0
  grounding finding). "Add the imaginary slice" is identically positive-dimensional — a dead end.

So C2 needs the **rational-φ analog of the moment route**: a REAL, zero-dimensional system in the rational
map's coefficients, solved + counted by the existing exact engine, filtered for univalence, gauge-quotiented.

## 2. The formulation

**Degree-2 map (the first increment).** Parametrize the general order-2 QD map, gauge-fixed by φ(0)=w₀ and
the rotation φ′(0)=R>0:

```
        R (z + d z²)
φ(z) = w₀ + ───────────         (d, c, w₀ ∈ ℂ ;  R ∈ ℝ_{>0} ;  |c| < 1 so the poles ±1/√c lie outside 𝔻̄)
          1 − c z²
```

Real-parameter count 7 (w₀:2, R:1, d:2, c:2) matches the moduli of degree-2 rational maps mod Aut(𝔻)
(10 − 3), so this is a faithful general parametrization of degree-2 QD maps (not a special family).

**The data map (Schwarz residues).** On |z|=1, z̄ = 1/z, so `S(φ(z)) = conj-coefficient φ evaluated at 1/z`
is rational in z with poles at the preimages zⱼ of the nodes. For the w₀=0, real case φ=(z+dz²)/(1−cz²):

- `S(φ(z)) = (z + d)/(z² − c)` → poles at z = ±√c (inside 𝔻).
- **Nodes** `a_± = φ(±√c) = (±√c + dc)/(1 − c²)` (asymmetric when d≠0; symmetric family = the d=0 special case).
- **Weights** `b_± = Res_{a_±} S = (√c ± d)/(2√c) · φ′(±√c)`, with `φ′(z) = (1 + 2dz + cz²)/(1−cz²)²` (unequal).

The **inverse problem** (what ✦ Prove solves): given the node data (a_j, b_j) from h, solve for (w₀,R,d,c),
filter univalence, gauge-quotient. With t = √c the equations are polynomial over ℚ(i); clearing denominators
keeps integer coefficients (⚠ `mpolyConst` wants a `gauss`, and rats are BigInt — use `mpolyInt`).

**Validation oracles (the two ground-truth families).** Both hand-derived + numerically validated (Green's
area + the moment identity `∫_Ω wᵏ dA = π Σ_j b_j a_jᵏ`, k=0,1,2), used as fixtures for the builder:

| family | φ | data (exact) | inverse |
|---|---|---|---|
| symmetric | `R z/(1−cz²)`, R=1, c=¼ | a=8/15, b=136/225 | `8(1−t⁴)−15Rt=0`, `272(1−t⁴)²−225R²(1+t⁴)=0` |
| asymmetric | `(z+dz²)/(1−cz²)`, c=¼, d=¼ | a₊=3/5, a₋=−7/15, b₊=28/25, b₋=52/225 | node eqns in (t,d) + weight eqns |

## 3. Tractability — proven (spikes, 2026-07-15)

- **Symmetric:** the (R,t) system is zero-dim (12 finite complex roots); the only gauge-canonical real root
  is (R=1, t=½) = the truth; all others are sign/gauge copies or out-of-range (c=1 degenerate, c=4 pole-in-𝔻).
- **Asymmetric:** nodes-only zero-dim (2 real → filter t∈(0,1) ⇒ unique (½,¼)); **full data (4 eqns) ⇒
  realCount = 1** — the weights disambiguate the gauge copy. Exact, ~1 s on the existing engine.

So the rational-φ moment-match is **zero-dimensional, exact, and yields a unique gauge-canonical solution** —
the multi-node analog of C1, with a rational φ. Fully-complex-coefficient nodes-off-axis (e.g. the triangle
preset) is untested but has the same structure (reim-split like C1) and is expected to work.

## 4. The phased plan (one PR each, gate-green, branch-first — like C1)

- **C2-1 — the system builder.** `rationalMomentSystem(nodeData, {degree:2})` in `qd-equations.mjs`: the
  rational-φ analog of `pointFunctionalSystem`. Emits the real moment-match `{polys, vars, params}` from the
  node/weight data. Unit-tested against BOTH §2 oracles (recovers the exact system + the truth). **This is the
  crux: the node/weight↔coefficient derivation must be correct. Tractability is proven; correctness is the
  work — the oracles are the guard.** Real coefficients first, then the complex (reim-split) generalization.
- **C2-2 — univalence for rational φ.** φ′≠0 in 𝔻 (rational φ′: numerator zeros inside 𝔻 via Schur–Cohn +
  the pole-outside-𝔻̄ constraint |c|<1) and global boundary-simple (reuse the C1-ext-A exact double-point
  count — the divided difference N is formulation-agnostic once φ is sampled).
- **C2-3 — gauge quotient + verdict.** Quotient the rotation/sign gauge (R>0; the ±t, ±R copies the spikes
  showed) → `assembleRationalVerdict` with honest `=`/`≤`/`≈` + `rigorProvenance`, mirroring
  `assembleMomentVerdict`.
- **C2-4 — UI + thumbnail.** `pointFunctionalMoments`'s sibling detects multi-node data → routes ✦ Prove to
  the rational plan; reuse `momentPlotData` for the thumbnail (sample φ(e^{iθ}) from P/Q instead of Σwₖzᵏ).

## 5. Rigor semantics + honest scope

- **`=`** only when: zero-dim + certified real count + the exact ℚ(i) root verification (PF-1) + univalence
  (Schur–Cohn φ′≠0 in 𝔻 AND exact boundary-simple) + gauge quotient. Anything weaker reads `≤`/`≈`, per the
  project's binding honest-labeling vocabulary.
- **Scope:** degree-2 (2-node) FIRST — covers `two-point-symmetric` + general 2-node. Higher degree
  (triangle = 3-node ⇒ degree-3 rational) is a later increment. The general multi-node beyond what the
  builder covers stays an honest LOWER BOUND via the Phase-B tree.

## 6. Status — C2 route SHIPPED (degree-2 real)

All four phases merged: **C2-1** `rationalMomentSystem` (builder), **C2-2** `rationalUnivalence` +
`rationalBoundarySimple` (+ the shared `boundarySimpleFromN`), **C2-3** `reconstructRationalMap` /
`rationalCertifyLeaf` / `assembleRationalVerdict` / `runRationalPlan`, **C2-4** the UI
(`multiNodeRationalData` → `doProveRational`; `renderProofVerdict` kind `'rational'`; `rationalPlotData`
thumbnail). ✦ Prove on 2-real-node data now routes here instead of the intractable `(●)/(★)` tree.

**Convention finding (browser + node verified):** the app's h-data residue **IS** the quadrature weight
b_j — NO π factor (the app's `dA = dxdy/π` convention makes ∫_Ω f dA_app = Σ b_j f(a_j)). So
`multiNodeRationalData` passes the pole residues straight through as weights. `two-point-symmetric`
(nodes ±1, weight 1.5) ⇒ **Unique QD ✓**, recovering the exact golden-ratio shape R=(1+√5)/2,
c=(3−√5)/2, d=0, φ(1)=√5.

**Honest-labeling note:** `two-point-symmetric`'s shape is IRRATIONAL (c=(3−√5)/2), so the rational PF-1
snap can't certify `=` — it correctly reads **`≈` (estimate)**. Rational-shape QDs (e.g. the c=¼,d=¼ test
family) read `=`. Upgrading these irrational shapes to `=` needs the interval certifier — now **BUILT (X1, PRs
#146–#151)** and wired into the `(●)/(★)` route, but **not yet wired to these C1/C2/C3 moment/rational routes**,
so their irrational shapes still read `≈` here.

**Deferred:** general (asymmetric / off-centre) complex node data; wiring the X1 interval `=` certifier (built
for the main route) into the C1/C2/C3 routes for irrational shapes.

## 7. C3 — the equilateral triangle (3-fold symmetric, degree 3)

A 3-node QD is degree-3 rational. The **equilateral** case (3 nodes at |a|·{1,ω,ω²}, equal weight b, centroid 0)
is 3-fold equivariant (φ(ωz)=ωφ(z)), so — the degree-3 analog of the symmetric 2-node — it is
**φ(z) = R·z/(1 − c·z³)**, a SINGLE real shape parameter c (poles ±c^{−1/3}·{1,ω,ω²} outside 𝔻̄ ⟺ c<1). The
3-fold symmetry collapses the three OFF-AXIS nodes to a REAL system, avoiding the complex reim-split.

- Data map (Schwarz residues): nodes at `R·c^{1/3}/(1−c²)·{1,ω,ω²}`, weight `b = R²(1+2c²)/(3(1−c²)²)`.
  Validated numerically (Green's area + the ∫w³ moment `∫_Ω w³ dA = π·3·b·|a|³`).
- Divided difference collapses to `N(z₁,z₂) = 1 + c·z₁z₂(z₁+z₂)` (a cubic) — the degree-3 analog of the
  degree-2 `1 + c·z₁z₂ + d(z₁+z₂)`.
- Inverse: with s=c^{1/3} AND **P = R²** (both equations are even in R — solving in P keeps them LINEAR in P,
  eliminating P gives a univariate in s: fast + non-degenerate; the raw R² form degenerates the RUR resolvent
  and the certified solve returns null coordinates), the eq for |a| SQUARED to stay over ℚ gives the ZERO-DIM
  system in (P, s): `P·s² − |a|²(1−s⁶)² = 0`, `P(1+2s⁶) − 3b(1−s⁶)² = 0`; c=s³, R=√P. The equilateral-triangle
  preset (|a|=1, b=1) recovers c ≈ 0.221 (a root of 2v³−3v+1, v=c^{2/3}); its shape is irrational ⇒ honest `≈`.

**C3-1 + C3-2 + C3-3 SHIPPED:** `QE.triangleMomentSystem(data)` — the reduced (P, s) system, guarded by the
rational ground-truth oracle (P=(63/32)²=3969/1024, s=½, c=⅛ ⇒ cube-root nodes, weight 11/8) + zero-dim + the
symmetry rejections (non-equilateral / off-centre / unequal weights); `triangleUnivalence(c)` (Schur–Cohn on
1+2cz³ + pole |c|<1) + `triangleBoundarySimple(c)` (N=1+c·z₁z₂(z₁+z₂) → `boundarySimpleFromN`);
`reconstructTriangleMap`/`triangleCertifyLeaf`/`assembleTriangleVerdict`/`runTrianglePlan` (kind `'triangle'`,
E2E: the preset proves Unique ✓ recovering c=⅛, fast). ⚠ PF-1 snaps SIMPLE certified roots to `=`; a Sturm-
floated complex rational (e.g. P=3969/1024) may miss the snap ⇒ honest `≈` (the same interval/number-field
`=` gap noted for irrational shapes). **C3-4 SHIPPED (the C3 route is COMPLETE):** `multiNodeTriangleData(hData)`
(3 equal-magnitude real-weight nodes, centroid 0) → `doProveTriangle` (seed `triangleMomentSystem` →
`runTrianglePlan`), routed AFTER the 2-node rational check; `renderProofVerdict` handles kind `'triangle'`;
`trianglePlotData` samples φ=Rz/(1−cz³) for the thumbnail. **Browser-verified:** the equilateral-triangle preset
(nodes 1,ω,ω², weight 1) routes here, reads *"Unique quadrature domain ✓ … rational-φ (equilateral triangle,
degree-3, Gustafsson)"*, and draws the rounded-triangle domain (3 nodes, φ(1)≈2.019); honest `≈` (irrational
shape c≈0.221). Degree-3 EQUILATERAL only; general asymmetric 3-node stays the frontier.

## 8. Overall status — Phase C is COMPLETE

The **whole ✦ Prove routing** now handles, in order: single quadrature node with real M₀ → **C1** (moment /
Aharonov–Shapiro, polynomial φ); 2 real nodes → **C2** (rational φ=w₀+R(z+dz²)/(1−cz²)); 3 equal-magnitude
real-weight nodes → **C3** (equilateral triangle, φ=Rz/(1−cz³)); everything else → the honest `(●)/(★)` tree
(lower bound). Each tractable route is REAL, zero-dimensional, certified-solvable, univalence-filtered
(Schur–Cohn + exact boundary double-point count via the shared `boundarySimpleFromN`), gauge-quotiented, and
draws its reconstructed-φ thumbnail. `=` when PF-1 snaps the exact root, honest `≈` otherwise.

**Deferred frontier:** general asymmetric / off-centre multi-node (needs the complex reim-split builder +
higher-degree ansätze); wiring the interval certifier — **built as X1 (PRs #146–#151)** for the main route —
into these C-routes to upgrade their irrational-shape `≈` to `=`.
