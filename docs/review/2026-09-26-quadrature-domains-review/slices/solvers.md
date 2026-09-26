# solvers — summary

Scope: `app/solvers/**`, `app/core/{parse-h,taylor,qd,qol,poly-helpers,complex}`, `app/qd/*`. I re-derived the quadrature
identity, the φ ansatz, (●)/(★) and the verifier LHS/RHS for QD, UQD, LQD, LQD-singular, UQD-LQD, PQD, PQD-singular and
UQD-PQD. I then checked each one numerically with an **independent direct solver**: build φ, take h's principal parts
from contour integrals of S∘φ, run `solveInverseQD`, and compare φ. QD, UQD (with polynomial part), LQD
(Thm 5.3.2, including the α = π² edge), LQD-singular and UQD-LQD (with β) all come back at 1e-11–1e-12. `dA = dx dy/π` and the
suppressed `1/(2πi)` are applied the same way everywhere. I found **no π/2πi leak**. I ran 12 node specs (solvers-1..4, cusps,
cusp-accuracy, cmax, faber, qd-equations, qd-constraints, parse-check, thesis-examples): all green, 12 files, 52 s.
**Headline:** bounded power-weighted QDs with non-integer α fail whenever a node and w₀ lie on opposite sides of the
negative real axis. The (●) locator and the realizability guard use principal powers, while φ uses the anchored sheet. A
real-axis-symmetric PQD on the negative axis, the mirror image of a domain that solves, returns "No algebraic root
found". The realizability guard rejects such domains outright with a false "no bounded PQD exists". Also found: a
silent `parse-h` mis-decomposition of poles of order ≥ 3, and a vacuous identity pass in one unbounded verifier. Probe
scripts are in `/tmp/claude-0/-home-user-complex-analysis-suite/7d83a4a1-9cc2-5097-8eba-a8efea56452d/scratchpad/solvers/` (`p*.mjs`, `direct.mjs`, `load.mjs`).

## Findings

### SOLV-1 [P1] Bounded PQD (non-integer α): the (●) locator uses principal `a_j^α` / `w₀^α`, off the anchored sheet. Domains that straddle the negative real axis cannot be solved

- Category: maths
- Location: `app/solvers/solver-pqd.mjs:348-352` (`cpowA(a,α)` in `residual_PQD`), `:94-95,106` (`r0 = cpowA(w0,α)`), `:281` (`Complex.cpow(p, 1-α)` in `modifiedResidues_PQD`); same pattern in `solver-pqd-singular.mjs:260-262` (`(a_j/b(z_j))^α` principal).
- Claim: φ = (R#)^{1/α} is evaluated on the branch anchored at φ(0) = w₀ (`PqdCommon.phiAnchored`). The locator instead demands R#(z_j) = the **principal** a_j^α, and the constant term of R# is the principal w₀^α. When w₀ and a_j (or two nodes) lie on opposite sides of ℝ₋, the true solution has R#(z_j) = |a|^α e^{iα(Arg a ± 2π)}, which is not a zero of the residual. So Newton cannot find it. HANDOFF's "the algebraic locator is unchanged … branch-free/correct" is true only when w₀ and every a_j lie on the same principal sheet. The §PB tests only use single poles with w₀ = a, which never straddle the cut.
- Evidence (measured, `p7b.mjs`, `p7c.mjs`, `p7d.mjs`). The weight is rotation-invariant, so Ω ↦ −Ω maps a PQD for h = C/(w−a) to one for C/(w+a). The mirror of every solvable case below is therefore a genuine PQD:
  ```
  poles −1±0.05i (C=0.1), auto w0:   α=2 ✓   α=1.5 "No algebraic root found"   α=0.7 "No algebraic root found"
  poles +1±0.05i (mirror):           α=2 ✓   α=1.5 ✓ (id 1.4e-13)           α=0.7 ✓ (id 1.9e-14)
  poles −1+0.05i, −1.1+0.08i, w0=−1.05+0.02i: α=1.5 ✓ ; same poles, w0=−1.05−0.02i: "No algebraic root found"
  singular (0∈Ω) α=1.5: poles +0.5±0.3i, w0=0.4 ✓ (continuation) ; mirror −0.5±0.3i, w0=−0.4: no root
  ```
  With autoSwitch on, the negative-axis case spends 4 s and still fails.
- Confidence: high
- Prior review: new (HANDOFF §"PQD off-axis fix" asserts the opposite)
- Fix: lift consistently. Either enforce φ_anchored(z_j) = a_j directly and set p^{1−α} := a_j / R#(z_j) in D, or pick the α-power branch of a_j nearest `argContAt(R#(z_j))`. Simpler still: exploit rotation invariance and solve in a frame where w₀ lies on ℝ₊ (w ↦ e^{−iθ}w, with h's C unchanged at the rotated nodes), then rotate back. Add the mirror pair above as a regression. Size M.

### SOLV-2 [P1] PQD realizability guard throws a false "no bounded PQD with φ(0)=w₀ exists" for realizable domains

- Category: labelling / bug
- Location: `app/solvers/solver-pqd.mjs:672-683`
- Claim: the one-pole guard `C > (|a^α − w₀^α|/α)²` is correct (u = w^α maps Ω to a disk of radius α√C centred at a^α). But it evaluates both powers on the principal branch. For w₀ and a across ℝ₋ it compares points on different sheets and rejects valid input with a definitive, user-facing "no … exists" message.
- Evidence (measured, `p7.mjs`): a = −1+0.05i, C = 0.1, w₀ = −1−0.02i, α = 1.5 → `THROW … realizability: C=0.1000 ≤ … =1.7767`. The consistent-branch distance is ≈0.1, so the bound is ≈0.004 and the domain exists. With w₀ = −1+0.02i (same side) it solves, identity 3.4e-14. α = 0.7 gives the same false throw (bound 5.54). α = 2 is unaffected.
- Confidence: high
- Prior review: new
- Fix: compute w₀^α on the sheet continuous with a^α (for example rotate so a lies on ℝ₊ first), or drop the guard for non-integer α. Size S.

### SOLV-3 [P1] `parse-h` Phase 2 splits a pole of order ≥ 3 into several simple poles with ~1e11 residues, silently

- Category: bug
- Location: `app/core/parse-h.mjs:338-394` (`phase2Decompose`: Durand–Kerner and `groupRootsByMultiplicity(rawRoots, clusterTol=1e-6)`)
- Claim: a root of multiplicity m spreads by about ε^{1/m} (≈6e-6 for m = 3), which is above the absolute 1e-6 cluster tolerance. The group is then split into m simple poles whose residues blow up with opposite signs. The spread warning only examines groups that already have multiplicity ≥ 2, so nothing is reported. Phase 1 catches a pure (w−a)^k, but any factored denominator falls through to Phase 2. This path also runs on share-link restore (`#h-text` is re-parsed).
- Evidence (measured, `p12.mjs`):
  ```
  1/((w-1)^3*(w+1))  -> 4 simple poles: a≈1±1e-6 with residues ≈ -7.3e10+1.26e11i, 1.38e11, -5.2e8-9.1e8i ; warnings: []
  1/((w-1)^4*(w+2))  -> 5 simple poles, residues up to 6.9e14 ; warnings: []
  (w^2+1)/((w-0.5)^3*(w+0.5)) -> residues 2.1e13 … ; warnings: []
  1/((w-1)^2*(w+1))  -> correct (order 2)
  ```
- Confidence: high
- Prior review: new
- Fix: square-free decomposition (gcd(Q, Q′) iterated) before root-finding. Alternatively cluster at a scale-aware tolerance ~|Q|^{1/m} and confirm the multiplicity via Q^{(k)}(a) ≈ 0. At minimum, warn or throw when a residue exceeds, say, 1e6 × the scale of P/Q. Size S.

### SOLV-4 [P2] `verifyQuadratureIdentity_UPQDS` passes vacuously when no test point is found (`maxRelDiff = 0`)

- Category: labelling
- Location: `app/solvers/solver-uqd-pqd-singular.mjs:421-447`
- Claim: the test points are the first of 25 fixed candidates that the ray-cast places inside K. There is no clearance ranking and no empty-set guard. If none lands inside K (a thin or crescent K, which is likely when 0 ∈ Ω sits near K), then `checks=[]`, `maxRelDiff=0`, and `identityOK = 0 < 1e-6 = true`. The twins fail closed: UQD (`solver-uqd.mjs:347`), UPQD (`solver-uqd-pqd.mjs:422`) and UQDLS (`:628`) return `Infinity` with a warning.
- Evidence (measured, `p13.mjs`, synthetic φ with a degenerate K): `testPoints 0 checks 0 identity maxRelDiff 0` for three different z₀. There, univalence is (correctly) false, so the combined verdict was still invalid. I did not construct a univalent crescent case (`p13b.mjs` tried).
- Confidence: high (code), medium (reachability with a univalent φ)
- Prior review: new
- Fix: use `QD.chooseHoleTestPoints` with `avoidOriginEps` and return `Infinity` on an empty set, as the siblings do. Size S.

### SOLV-5 [P2] UQD identity escalation cannot go past 6000 nodes, so a genuine near-cusp QD is labelled identity-failing

- Category: bug (under-claim)
- Location: `app/solvers/solver-uqd.mjs:315` (`cap = max(baseN, maxSamples ?? 8000)`), `:440-447` (doubling from 1500 ⇒ 3000 ⇒ 6000; 12000 exceeds the cap)
- Evidence (measured, `p11e.mjs`), h = 1.5/w + 0.5/w², c = 1.44 (a φ′ zero at |z| = 0.99977, still a valid QD by `p11d.mjs`):
  `solveInverseQD` → `idOK false, maxRelDiff 1.16e-3, escalatedTo 6000`; the same φ at N = 32000 gives 1.09e-10, and at 128000 gives 1.09e-10. So the primary badge reads "not a QD" for a QD. The c\* estimator avoids this by switching to its cusp gate, but ordinary solves do not.
- Confidence: high
- Prior review: new
- Fix: raise the cap (the integrand is cheap), or better, grade by arclength or use adaptive panels near min|φ′|. Keep the "converging" test. Size S.

### SOLV-6 [P2] The polygon univalence test accepts φ with a φ′ zero just inside the parameter domain (just past a cusp)

- Category: labelling
- Location: `app/solvers/solver.mjs:716-742` (`isBoundaryUnivalent`), `:762-771` (`segmentsCross`)
- Evidence (measured). (a) `p11d.mjs`/`p11c.mjs`: h = 1.5/w + 0.5/w², c = 1.48 (warm continuation). φ′ has a zero at |z| = 1.00002 ∈ 𝔻\*, so φ is not locally univalent on 𝔻\*. Yet `isBoundaryUnivalent` returns true at both 500 and 5000 samples (the swallowtail loop is ~(|z|−1)^{3/2} in size). (b) `p3b.mjs`: bounded φ = z + a e^{iβ} z², a = 0.5001–0.501, reads univalent at the 96-sample live budget. The algebra badge honestly says "univalence ≈ estimated", but `solveInverseQD`'s `isValidQD` gate relies on this test.
- Confidence: high
- Prior review: related to the algebra-review univalence items. This numeric path is new.
- Fix: add a local-univalence test: count φ′ zeros in 𝔻 (bounded) or 𝔻\* (unbounded) by the argument principle on the unit circle, refining adaptively near min|φ′|. Report `cuspDistance = 1 − max|z_crit|` on the result so the badge can say "within δ of a cusp". Size M.

### SOLV-7 [P2] Degenerate (cusp) roots: Newton reports success at a residual below 1e-10 while the coefficients are only correct to about √tol

- Category: labelling
- Location: `app/solvers/solver.mjs:580-583` (convergence = `Fnorm < 1e-10`, absolute); no forward-error estimate on the result
- Evidence (measured, `p2.mjs`, `p14.mjs`). The cardioid h = 1.5/w + 0.5/w² (φ = z + z²/2): with x = A₁² the (★) system reduces to (x−1)²(x+½) = 0, a double root. The solver returns A₁ = 1.0000043665, A₂ = 0.4999956335 (error 4.4e-6), residual 9e-11, identity 3.8e-11 (also quadratic in the error), `method: direct`, `univalent: true`. z + z³/3 gives A₁ error 3.2e-6. At a = 0.49 the error is 7e-13. These are exactly the thesis's boundary cases.
- Confidence: high
- Prior review: new
- Fix: return `condEst` and a forward-error estimate (for example ‖J⁺‖·‖F‖ from the final QR, or detect a rank drop and report residual^{1/2}). Surface "≈ k digits". Optionally polish with a deflated or bordered Newton at the singular root. Size S–M.

### SOLV-8 [P2] Five unbounded identity verifiers with five divergent policies; THEORY_MAP says they are "shared"

- Category: structure
- Location: `solver-uqd.mjs:299` (hole points via `chooseHoleTestPoints`, floor 1500, escalation to 6000, fail-closed); `solver-uqd-pqd.mjs:400` (`chooseHoleTestPoints`, floor 1500, **no** escalation); `solver-uqd-pqd-singular.mjs:385` (own 25-candidate ray-cast, no clearance ranking, 2000/4000 → 16000 adaptive, **fail-open**, SOLV-4); `solver-uqd-lqd-singular.mjs:559` (own clearance ranking, N = 500, no floor); `solver-uqd-lqd.mjs:312` (single test point b = 0, N = 500). THEORY_MAP §Numerical primitives: "`chooseHoleTestPoints` … shared by the unbounded identity verifiers", and the `solver.mjs:1255` comment "now shared so all families agree". Only two of the five use it.
- Claim: the fixes (the ≥1500 floor, clearance ranking, the empty-set guard, escalation) were made family by family, and the twins drifted. SOLV-4 and SOLV-5 are instances.
- Confidence: high
- Prior review: A2 (2026-08-23) noted the per-family kernels were not reviewed.
- Fix: one `unboundedIdentity(samplesFn, kernel, rhsFn, opts)` driver owning the test points, fail-closed behaviour and N-escalation, with each family supplying LHS kernel and RHS. Size M.

### SOLV-9 [P2] Bounded singular PQD closes |z₀| with a 256-point quadrature inside the Newton residual, where the exact algebraic closure R(z₀) = 0 exists (and the unbounded twin uses it)

- Category: maths / structure
- Location: `app/solvers/solver-pqd-singular.mjs:100,296-298,391-` (`massResidual_PQDS`), cf. `solver-uqd-pqd-singular.mjs` header (Prop 4.6.3, `r(z₀)=0`)
- Claim: S_α∘φ = (1/α) R(z) R#(z)/φ(z) with R = (R#)#. So Res_{w=0} S_α = (1/α) R(z₀) R#(z₀)/(φ′(z₀)·…) ∝ R(z₀) (R# does not vanish on 𝔻̄). "h analytic at 0", which is what (M) enforces, is therefore exactly R(z₀) = conj R#(1/z̄₀) = 0: two real equations, exact and cheap. The mass residual instead injects trapezoid error into F, and therefore into the attainable Newton residual and the FD Jacobian, for strongly shaped domains.
- Evidence (measured, `p16.mjs`): at solved PQDS φ (α = 2 and 3), |R(z₀)| = 9.4e-13 and 1.2e-13. This confirms the derivation (the solutions satisfy R(z₀) ≈ 0).
- Confidence: medium-high (derivation plus numerical agreement; I did not demonstrate a case where 256 samples bias the solution)
- Prior review: new
- Fix: replace (M) with R(z₀) = 0, keep mass as a verifier row, and share the closure with UPQDS. Size S.

### SOLV-10 [P3] The Newton singular-recovery RNG is seedable in name only: no caller passes `rng`

- Category: bug (reproducibility)
- Location: `app/solvers/solver.mjs:516` (`rng = Math.random`); `grep -rn "rng:" app` finds no callers
- Claim: the 2026-08 fix added the parameter, but `_solveOnce`, `liveSolveStep`, cmax and the continuations all forward `options.newton` without it. Recovery remains non-deterministic in every product solve. (No recovery triggered in my probes.)
- Confidence: high
- Prior review: reported in `2026-08-suite-review/findings/07-quadrature-domains.md` ("un-seeded Math.random()"). Partially fixed; still open in effect.
- Fix: default `rng` to `mulberry32(fixedSeed)` created per solve. Size S.

### SOLV-11 [P3] The warm-start family guard is vacuous for the two classical families (their φ carry no `family` tag)

- Category: bug (latent)
- Location: `app/solvers/solver.mjs:1543-1547` (`warmPhi.family === probe.family`); `unpackPhi_QD`/`unpackPhi_UQD` and the seeds never set `family`
- Evidence (measured, `p17.mjs`): a UQD φ passed as `warmPhi` to a bounded solve is accepted (`undefined === undefined`) and Newton runs on the **unbounded** family with bounded data. It happened not to converge (residual 1e-3), so the solve fell through. If it had converged, `evalCandidate` would canonicalize and verify an unbounded φ with bounded kernels.
- Confidence: high (code), low (UI reachability)
- Prior review: new
- Fix: compare `_resolveFamily(warmPhi)` with `family` (the selected record), or stamp `family` in every unpack and seed. Size S.

### SOLV-12 [P3] `phisEquivalent` / `canonicalizeByRotation` only know the classical-bounded fields; deflation removes only the canonical gauge copy

- Category: structure
- Location: `app/solvers/solver.mjs:1726-1776`, `:1609-1623`, `searchAlternates:1689`
- Claim: (a) `phisEquivalent` ignores `polyA`, `z0`, `gamma`, `lqdBeta`, `lqdGamma`, `c`, so pole-free unbounded φ (branches = []) always compare equal, and alternates can never be recorded for those families. (b) `canonicalizeByRotation` drops `alpha`, `c`, `polyA`, `z0` (a PQD φ would evaluate to NaN). Today it is only called on classical bounded φ from the algebra tab (`prove-plan.mjs:238,320`), so this is latent. (c) Deflation roots are packed from **canonicalized** φ. The z ↦ −z twin is an equally valid root of the residual (the gauge fixes only Im ΣA₁), so deflated and alternate restarts can re-find the same domain in the flipped gauge (inferred, perf only).
- Confidence: medium
- Prior review: new
- Fix: compare family-specific packed vectors after canonicalization; deflate both gauge copies. Size S.

### SOLV-13 [P3] Stale or misleading documentation in scope

- Category: stale-doc
- Location and evidence:
  - `THEORY_MAP.md` line anchors are wrong throughout: `solveInverseQD — solver.mjs:790` (actually 1463), `houseQR — solver.mjs:195` (234), `registerFamily('boundedQD') solver-qd.mjs:427` (387; the file has 397 lines), `boundedLQD_singular … :629` (459). It also claims `chooseHoleTestPoints` is shared by all unbounded verifiers (SOLV-8).
  - `solver.mjs:13-20` header lists 6 families; 10 are registered.
  - `solver-lqd.mjs:30-31` header gives the locator as "r#(z_j) = ln(a_j/w₀) (principal branch)". The code (`:128-133`) uses the branch-free φ(z_j) − a_j (the better choice).
  - `solver-lqd.mjs:180-183` and `solver-pqd.mjs:392-396` say the gauge yields the standard φ′(0) > 0. It actually fixes r#′(0) (respectively R#′(0)) real-positive, and φ′(0) = w₀·r#′(0) (respectively (1/α)w₀^{1−α}R#′(0)), which is not real unless w₀ is. The "Z/α ambiguity" wording is also inaccurate.
  - `primary-solution.mjs:30`: "success — true iff a valid solve completed". `solveInverseQD` returns `success:true` for any converged candidate, including non-univalent ones (`solver.mjs:1654`), and `hasSolution()` inherits this.
  - `core/qd.mjs` is dead (no importer). Its header says solver.mjs publishes `QD` on `globalThis`, but solver.mjs only sets `window.QD`. `eslint.config.mjs:126,182,211` still reference the old path `app/qd.mjs`. `core/qol.mjs` is a DOM helper sitting in `core/`.
  - `diagnosePQDRealizability` (`solver-pqd-common.mjs:~330`) treats `seed.success` as "valid at α≈1", but success is true for non-univalent candidates. A non-realizable classical case that nonetheless yields a candidate would be reported as `fold-below-target` rather than `invalid-even-classical` (inferred; `p18.mjs` hit the correct branch because no candidate was found).
- Confidence: high (except the last item: low)
- Fix: doc edits; delete `core/qd.mjs` or wire it up; gate the diagnostic seed on `univalent && identityOK`. Size S.

## Improvements (IMP-n)

- **IMP-1: Certified existence ball for a numeric solution.** Value: high. It turns "residual < 1e-10" into a `≤` claim: a Krawczyk or Newton–Kantorovich test on the (●)/(★) map around the Newton root, using the interval Schur–Cohn machinery the algebra tab already has. It also flags degenerate roots (SOLV-7) automatically. Cost: M.
- **IMP-2: Branch-robust PQD** (fixes SOLV-1 and SOLV-2). Solve in a frame rotated so that w₀ lies on ℝ₊, since the weight is rotation-invariant. This removes every principal-branch hazard in the bounded PQD families and the Schwarz adapter's documented "principal-root sheet flips". Cost: S–M.
- **IMP-3: Local-univalence and cusp-distance certificate.** Count φ′ zeros in 𝔻 or 𝔻\* by the argument principle with adaptive refinement, and report `1 − max|z_crit|` on every result (SOLV-6). This also gives the c\* estimator a cheap, exact cusp signal in the worker (it currently needs page-side `findCriticalPoints`). Cost: S–M.
- **IMP-4: One unbounded-identity driver with adaptive quadrature.** Panel-adaptive Gauss/trapezoid in θ, refined where |φ′| dips, with clearance-ranked test points and fail-closed behaviour. This closes SOLV-4, SOLV-5 and SOLV-8 together. Cost: M.
- **IMP-5: Exact z₀-closure R(z₀) = 0 for bounded singular PQD** (SOLV-9), shared with UPQDS. Cost: S.
- **IMP-6: Square-free rational parsing** in `parse-h` (SOLV-3): gcd(P, Q) cancellation plus a square-free split of Q before Durand–Kerner, which gives exact multiplicities. Cost: S.
- **IMP-7: Pseudo-arclength continuation in c and α.** Continue through folds and report the mechanism from the branch geometry (turning point versus a φ′ zero crossing), with a bracketed `c* ∈ [cLo, cHi]` label. The h = 1.5/w + 0.5/w² family shows a φ′ zero crossing |z| = 1 at c ≈ 1.47–1.48 and Newton losing the branch at 1.4878 (`p11b.mjs`/`p11d.mjs`). Cost: M.
- **IMP-8: Multiply connected (annular) QDs.** The thesis's Fig 4.1 (monomial PQD transitioning from multiply to simply connected) is out of reach for the simply connected ansatz. An annulus/Schottky-type ansatz or a boundary-integral solver would open that regime. Cost: L.

## Coverage: what I did NOT review or could not run

- `app/qd/qd-constraints.mjs`, `qd-varscheme.mjs` and most of `qd-equations.mjs`: I verified only the forward (★) formula (derived by residue calculus and checked on the cardioid) and ran the specs. I left the algebra/CAS generation to the algebra slice.
- The unbounded singular LQD (`solver-uqd-lqd-singular.mjs`, 849 lines, γ/β machinery) was read in part and NOT independently probed with a closed form. The same holds for the higher-order-pole-at-origin (`lqdGamma`) path.
- The seed files beyond `seeds-qd.mjs`; `primary-solver-worker.mjs` and `prewarm.mjs` (skimmed only; the prior A2 review covered the worker race); `solver-taylor-common.mjs` (A2 verified it).
- I did not run the full QD suite, the browser suite, or `app/node-test.js`. I did not attempt to reproduce the unseeded-recovery non-determinism, because no probe triggered recovery.
