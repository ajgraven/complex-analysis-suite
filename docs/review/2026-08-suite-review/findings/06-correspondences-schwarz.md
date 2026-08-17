# Agent 06 (CORR) — `apps/correspondences` + `@cas/schwarz` review

Scope: the anti-holomorphic correspondence tool (deltoid Schwarz reflection σ CPU+GPU, the
deleted correspondence / orbit trees / density render, the family parameter plane, the
parabolic-Tricorn model coordinate, and the mating explorer's map side) plus the deep review of
`@cas/schwarz` (`bounded.ts`, `unbounded-laurent.ts`, `branches.ts`, `forward.ts`,
`singularities.ts`, `preimage-tree.ts`, `limit-set.ts`, `level-curves.ts`, `gpu/`). I verified the
σ closed-form + branch selection by hand, traced the exact correspondence-curve algebra, checked
CPU↔GPU parity and the honest-labeling guardrail, and cross-referenced the 2026-07 review. **The
math is in very good shape** — no correctness or convention bug found. The findings below are one
stale comment that re-asserts a specifically-forbidden false bound, plus low-severity parity/consolidation/dead-config items. The headline prior-review finding (family univalence shown as
"proven") is **resolved**.

---

### [MEDIUM] Stale `√2` univalence bound re-asserted in `gpuAgreement.test.ts` — the one error the code went out of its way to forbid
- **Area:** apps/correspondences · **Location:** `apps/correspondences/test/gpuAgreement.test.ts:145-147` and `:197`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** Line 145-147: `// … φ_a is univalent on {|z|>1} for / the whole window (area theorem, |a|≤√2), so a preimage inside the unit disk is the WRONG branch …`. Line 197: `// The deltoid plus three off-axis members inside the univalence window |a| ≤ √2.` This is the exact claim the codebase corrected and **explicitly forbids**: `family.ts:12` — `// ⚠ Do NOT restate the old "univalent for |a| ≤ √2" bound. It came from reading the area theorem … backwards`; `paramGpu.ts:78-82` — `// This comment previously claimed the area theorem gave that for the whole window at |a| ≤ √2 — it does not; the area theorem is necessary for univalence, not sufficient`. The true bound is `|a| ≤ 1` (φ_a′ = 1 − a/z³ vanishes at |z| = |a|^{1/3}). The dedicated guard `familyUnivalence.test.ts:13` says it "fails if anyone restores the √2 claim **in code that these assertions can see**" — comments are invisible to it, so these two slipped through. (The four `A_VALUES` tested are all |a| ≤ 1, so test *behavior* is correct; only the justifying comment is wrong.)
- **Why it matters:** This app's whole point was to *fix* a HIGH-severity mislabel where the wrong univalence bound was shown to users as "proven" (2026-07 review, `family.ts` finding; fixed in #170). The honest-labeling guardrail is called out as "especially load-bearing here." A maintainer editing the GPU shader opens this test, reads "the univalence window |a| ≤ √2 (area theorem)", and can re-trust a bound the rest of the repo proves false (`familyUnivalence.test.ts:51` gives the a = 1.2 counterexample).
- **Recommendation:** Rewrite both comments to the true window `|a| ≤ 1` (and drop the "area theorem gives univalence" phrasing), matching `paramGpu.ts:77-82`. Comment-only; no code/behavior change.

---

### [LOW] Dynamical σ GPU renders at `uMaxIter = 96`, the CPU fallback at `MAX_ITER = 64` — a benign depth mismatch (and the CD 512-cap does NOT reproduce here)
- **Area:** apps/correspondences · **Location:** `apps/correspondences/src/gpu.ts:162` vs `apps/correspondences/src/render.ts:27`
- **Type:** numerical (parity)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** GPU sets `gl.uniform1i(uMaxIter, 96)` (gpu.ts:162) with `uEscapeR = 40`; the CPU band render uses `MAX_ITER = 64`, `ESCAPE_R = 40` (render.ts:24-27). The two paths therefore resolve a different number of tile generations near the limit set for the *same* view. This is documented as intentional (gpu.ts:162 "afford deeper tiles"; render.ts:25-27 "the GPU pass affords more"), and the fallback also renders at a different resolution (SIGMA_GPU = 560 vs SIGMA_CPU = 240, main.ts:20-21), so it is cosmetic, not a correctness bug.
- **Why it matters (and the Batch-1 cross-check):** The brief asked me to check whether the correspondences σ GPU path reproduces the **512-iter silent cap** found in complex-dynamics' σ view. **It does not.** Both correspondences shaders use the same defensive pattern as CD (`for (int n = 1; n <= 512/256; …) { if (n > uMaxIter) break; }`, gpu.ts:70 / paramGpu.ts:103, mirroring `schwarzGL.ts:259,304`), but here the effective `uMaxIter` is a small hardcoded constant far below the static bound — **96 < 512** (dynamical, never user-adjustable) and **48 < 256** (param, `DEFAULT_PARAM_OPTIONS.maxIter`, paramPlane.ts:33). So the static loop bound can never silently clamp the real cap. CD's bug requires a user-raisable `u_maxIter` that can exceed 512 (`overlay.ts:141,158` default 512); correspondences has no such control. The only residual parity gap is the benign 96-vs-64 depth difference above.
- **Recommendation:** Optional: set the CPU fallback `MAX_ITER` to 96 to match, or document the intended divergence in one place. No functional risk either way.

---

### [LOW] Consolidation: `gpu.ts` bakes an inline σ evaluator (φ, φ′, F, Newton-invert) while `@cas/schwarz/gpu` already provides a general one consumed by complex-dynamics
- **Area:** apps/correspondences + packages/schwarz · **Location:** `apps/correspondences/src/gpu.ts:32-53` vs `packages/schwarz/src/gpu/sigma.glsl.ts` (`SIGMA_EVAL_GLSL`, consumed by `apps/complex-dynamics/src/render/schwarzGL.ts:40`)
- **Type:** consolidation (ADR-0007 second-consumer — **already acknowledged and deferred**)
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** `gpu.ts` hand-writes `phi`, `dphi`, `fSch`, `invertPhi` in GLSL for the fixed deltoid φ(z)=z+1/(2z²). `@cas/schwarz/gpu` exposes a coefficient-uniform σ evaluator (`SIGMA_EVAL_GLSL` + `packPhi`/`uploadPhi`, gpu/index.ts) for exactly the unbounded-Laurent family, already used by CD. That makes correspondences a genuine *second consumer* of an already-extracted GPU σ path — an ADR-0007 duplication.
- **Why it matters:** Three σ shaders now coexist (CD `schwarzGL.ts`, correspondences `gpu.ts`, `@cas/schwarz/gpu`). This is real duplication paydown, **but it is explicitly recorded as deferred** in ADR-0009 ("Merging the three apps' σ shaders into one `@cas/schwarz/gpu` is genuine duplication paydown but a large cross-app effort"). Flagging per the brief, not recommending violating the deferral. Note the *dynamical* shader (fixed deltoid coeffs) is the tractable half; `paramGpu.ts` varies `a` per-pixel and cannot use a fixed-uniform evaluator without a shader change, so it is not a clean target.
- **Recommendation:** Leave deferred per ADR-0009; if/when the σ-shader merge is scheduled, migrate `gpu.ts` (deltoid dynamical) onto `SIGMA_EVAL_GLSL` first. Do not touch `paramGpu.ts`.

---

### [LOW] `DEFAULT_DENSITY.maxDepth = 18` is dead configuration (prior finding `corr-maxdepth-dead-08` still open)
- **Area:** apps/correspondences · **Location:** `apps/correspondences/src/correspondenceRender.ts:27`
- **Type:** style (dead config)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `DEFAULT_DENSITY = { seedGrid: 64, maxDepth: 18, maxNodes: 220, escapeR: 6 }`. The deleted correspondence is 2:2, so the orbit tree branches ×2 per level (orbitTree.ts): the `maxNodes = 220` cap binds at depth ≈ 7-8 (2^8−1 = 255 > 220), so `maxDepth = 18` is never reached. Confirmed still present (2026-07 review flagged it; unchanged).
- **Why it matters:** Trivial — a misleading knob that suggests depth-18 trees are produced when the node cap always wins. No runtime effect.
- **Recommendation:** Drop `maxDepth` to a value that reflects reality (~9) or delete the field. Cosmetic.

---

### [NIT] `DEFAULT_PARAM_OPTIONS.maxIter = 48` silently overrides `family.ts` `DEFAULT_MAX_ITER = 64`
- **Area:** apps/correspondences · **Location:** `apps/correspondences/src/paramPlane.ts:33` vs `apps/correspondences/src/family.ts:93`
- **Type:** style
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** The parameter plane (both CPU `classifyParamBand` and the GPU via `renderParamPlane`, main.ts:217) passes `DEFAULT_PARAM_OPTIONS` (maxIter 48), so `family.ts`'s own `DEFAULT_MAX_ITER = 64` is never exercised by the app — only by unit tests that call `criticalEscape` without opts. Two "default iteration cap" constants for the same classifier invite drift.
- **Why it matters:** No bug (CPU and GPU both use 48, so they agree); just two sources of truth for one default.
- **Recommendation:** Have `family.ts` export the single default the app consumes, or note that 48 is the app default and 64 the library default. Optional.

---

## What I verified as CORRECT (no finding — recorded for assurance, per the brief's depth emphasis)

- **σ reflection closed-form + branch (unbounded-Laurent, `unbounded-laurent.ts`).** φ(z)=c·z+ΣF[l]/zˡ, F(z)=conj(c)/z+Σconj(F[l])zˡ, σ=conj(F(φ⁻¹)) with the **exterior** branch |z|>1. The cleared inverse polynomial for the deltoid is `z³ − w z² + 0.5 = 0` (exteriorRoot, unbounded-laurent.ts:151-180) — hand-verified from φ(z)=z+0.5/z². `conj(c)` (not c) in F is correct and pinned by the boundary-reflection golden (test:226-234, 291-297). Durand-Kerner "outermost root" fallback is the right cure for warm-seed branch drift, with residual-gated null on non-convergence (unbounded-laurent.ts:178).
- **Bounded family (`bounded.ts`).** Interior branch |z|<1, F carries `conj(w₀)` and the shared finite-pole principal parts. Consistent with the unbounded engine; branch math is shared (`branches.ts`).
- **Shared branch math (`branches.ts`).** All four helpers (φ, φ′, F, F′ contributions) verified term-by-term against the documented formulas; `branchFDeriv` power/coefficient bookkeeping (−(k+1)A[k]/(z−z_j)^{k+2}) is correct.
- **σ∘σ = id (brief question).** Correctly holds **only as the boundary property** σ|∂Ω = id (tested: test/unbounded-laurent.ts:306-311, and the bounded/complex-c analogues) — a *global* involution would make σ² = id and destroy the tiling dynamics the whole app is about (render.ts:52-54 documents σ(3)→4.67→11→… staying in Ω, i.e. σ∘σ ≠ id off the boundary, by design). The test suite pins the right invariants: the defining identity σ(φ(z₀)) = conj(F(z₀)), σ|∂Ω = id, and σ(σ⁻¹(w)) ≈ w. This is correct, not a gap.
- **Deltoid ground truth.** Hand-computed φ/F/φ′/F′ values and the frozen interchange goldens (σ([2.125,0])=[2.5,0], σ([1,0.75])=[0.5,−0.5]) are pinned (test:41-79).
- **Deleted correspondence (`correspondence.ts`).** Deflation of φ(w)=φ(η(z)) by the exact known root (z̄·w−1), closed-form d≤2, DK d≥3, all correct; the monic assumption b[2]=1 holds exactly.
- **Exact correspondence-curve scaffold (`exact/correspondenceCurve.ts`, `exact/deltoidExact.ts`).** I re-derived it end-to-end: P(w,z̄) for the deltoid deflates by (z̄w−1) to **2w² − z̄²w − z̄**, disc_w = **z̄⁴ + 8z̄** (roots z̄=0 + three at |z̄|=2 ⇒ branch points on |z|=2). Matches the code and the `= in ℚ(i)` caption exactly. Labeling is honest: the curve/cusp locus are `=` (genuine exact algebra); the dynamics on top are `≈`.
- **Family classifier + parameter plane (`family.ts`, `paramPlane.ts`, `paramGpu.ts`).** Critical points ζ_k=a^{1/3}·{1,ω,ω²}, critical values m_k=1.5ζ_k (re-derived: a/ζ²=ζ ⇒ φ(ζ)=1.5ζ), and the escape-to-∞ classifier are correct. `sigma`-null-⇒-bounded (family.ts:108) is the right reading (orbit fell into K, not escape to ∞). CPU/GPU shading thresholds (÷24, body at n≥maxIter) match.
- **Parabolic-Tricorn model (`tricorn.ts`).** `conjugate(z^2)+c` via `@cas/expr` (matches CD's tricorn preset, no app→app import). Honesty is exemplary: `⚠⚠ STRAIGHTENING IS NOT COMPUTED`, the a↦c map ships as `≈`, and the "deltoid a=1 → c≈0.75 outside the Tricorn" is called out as provably wrong (tricorn.ts:12-17).
- **Honest-labeling guardrail (load-bearing here).** Every straightening/surgery/branch-continuation surface reads `≈`, never `=`/`≤`: family/param captions (main.ts:222-224, 240-242 — the corrected "read |a|>1 as unclassified, not membership"), orbitTree.ts label note, correspondenceRender density, mating map side. The only `=` claims are genuinely exact (the ℚ(i) curve/cusp locus; the Green's identity G∘σ=2G, which is a true functional identity of the escape-time potential — `mating/mapSide.ts:19-37`, verified).
- **Convention factors.** No π / 2πi anywhere in scope. The density render (`correspondenceRender.ts`) is a pure unit-weight point histogram, log-normalized **for display only** — there is no measure/area computation, so no convention factor is needed or missing.
- **GPU↔CPU σ agreement.** `gpuAgreement.test.ts` binds a TS mirror to the *real* shader constants (worst |Δσ| < 1e-4 across Ω) — a solid guard, correctly caveated that it validates the algorithm, not compiled GLSL (the browser job does that). Escape-count parity (fp32 vs f64, ~0.22% of pixels) is honestly disclaimed in `paramGpu.ts:9-13` and the README, not overclaimed.

## Prior-review status
- **RESOLVED:** the 2026-07 HIGH "family univalence bound wrong + shown as *proven*" — fixed in #170 (`family.ts`, `paramGpu.ts`, `main.ts` all corrected to |a| ≤ 1 with honest `≈`; `familyUnivalence.test.ts` guards it, incl. the a=1.2 counterexample). Only residue is the stale comment above.
- **STILL OPEN (trivial):** `corr-maxdepth-dead-08` (finding above). `corr-dk-null-dead-09` was at the old `deltoid.ts:113`, which no longer exists — the σ engine moved to `@cas/schwarz`, and the surviving null-guards there (`unbounded-laurent.ts:163,178`) are reachable (DK can fail/not-converge), so that finding is effectively obsolete.

## Coverage
- **Read in full & verified:** `@cas/schwarz` — `bounded.ts`, `unbounded-laurent.ts`, `branches.ts`, `forward.ts`, `singularities.ts`, `preimage-tree.ts`, `limit-set.ts` (header+core), `level-curves.ts`, `gpu/index.ts`; `apps/correspondences/src` — `deltoid.ts`, `correspondence.ts`, `family.ts`, `orbitTree.ts`, `tricorn.ts`, `render.ts`, `gpu.ts`, `paramPlane.ts`, `paramGpu.ts`, `correspondenceRender.ts`, `main.ts`, `exact/deltoidExact.ts`, `exact/correspondenceCurve.ts`, `mating/mapSide.ts`; tests `unbounded-laurent.test.ts`, `gpuAgreement.test.ts`, `familyUnivalence.test.ts`.
- **Skimmed / spot-checked:** `packages/schwarz/src/gpu/sigma.glsl.ts` (structure, consumers), `probe.ts`, `forward.ts` cycle finder (the odd-n anti-holomorphic finite-difference derivative is a documented heuristic, results culled by true-period tracing — honestly advisory).
- **NOT covered (out of the brief's depth emphasis / time):** the mating explorer beyond `mapSide.ts` — `mating/matingView.ts` (353 lines drawing/interaction), `matingMain.ts`, `models/idealTriangleGroup.ts`, `mating/glue.ts`; the `@cas/schwarz` GPU **probe harness** internals (`gpu/probe.ts` pack/upload) and the browser σ-GPU tests; per-test numeric assertions were sampled, not exhaustively re-derived. I did not run any code (read-only); numeric claims above are hand-derivations or reads of existing green tests.
