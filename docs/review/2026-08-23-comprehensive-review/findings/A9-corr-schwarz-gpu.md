# A9 CORR-SCHWARZ-GPU — Correspondences + `@cas/schwarz` + `@cas/gpu` + `@cas/export`

Scope: the anti-holomorphic Correspondences app (`apps/correspondences/src/*` — deltoid σ CPU+GPU,
deleted-correspondence branch engine, orbit trees, density render, family parameter plane,
parabolic-Tricorn coordinate, the mating explorer), plus `@cas/schwarz` (bounded/unbounded-Laurent σ
reconstruction, preimage tree/limit set, GPU σ evaluator + probe), `@cas/gpu` (GLSL codegen, complex +
df64 stdlibs, shared shader snippets), and `@cas/export` (PNG `tEXt` metadata). This is a **re-review**:
I cross-referenced the prior passes `06-correspondences-schwarz.md` and `08-render-group.md` and did not
re-report fixed items. **The one code change in my entire scope since the last review** (base `6c43a92`,
`git diff --stat`) is the two `cabs2` GLSL stdlib additions from `0527fe5` — I scrutinized those hardest.
Both prior-review findings that touched my scope are **confirmed fixed**. The math is in very good shape:
no CRITICAL/HIGH/MEDIUM. Findings are one new stale-doc, two still-open trivia, and one unreachable
latent cliff. I extended coverage into the areas the prior review admitted it skipped (the mating
explorer internals, `gpu/probe.ts`, `df64.glsl.ts`, `phaseColoring.glsl.ts`) — all verified correct.

---

### [LOW] Correspondences README describes `deltoid.ts` as "the σ engine" — but the engine moved to `@cas/schwarz`
- **Area:** apps/correspondences · **Location:** `apps/correspondences/README.md:93` vs `apps/correspondences/src/deltoid.ts:1-19`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** the README source-layout table row reads: `deltoid.ts | the σ engine: `evalPhi ·
  invertPhi` (cold-seed Newton + exact Durand–Kerner fallback) `· sigma · escapeTime`; tests pin the
  identity σ(φ(z)) = conj(F(z))`. But `deltoid.ts` now says exactly the opposite in its own header
  (`:3-5`): *"The σ ENGINE now lives in @cas/schwarz (shared with Complex Dynamics …) — this module
  keeps only the deltoid instance + boundary sampler, and re-exports the engine surface its consumers
  already import from here."* The file is 44 lines: `DELTOID_C`/`DELTOID_F`, `DELTOID =
  makeUnboundedLaurentSchwarz(...)`, `deltoidBoundary()`, and re-exports. `invertPhi` / `sigma` /
  Durand–Kerner and the σ round-trip test all live in `@cas/schwarz` (`unbounded-laurent.ts` +
  `packages/schwarz/test/unbounded-laurent.test.ts`) now, not here — this is the same extraction the
  prior review noted ("the σ engine moved to @cas/schwarz", `06-…:88`).
- **Why it matters:** the table is the app's advertised file map; a maintainer looking for the Newton
  inverse / DK fallback / the σ-identity test is sent to the wrong file, and the row misrepresents the
  post-extraction architecture (the whole point of ADR-0009/SIGMA-HANDOFF).
- **Recommendation:** rewrite the row to what `deltoid.ts` is now — "the deltoid instance
  `φ(z)=z+1/(2z²)` (`DELTOID_C`/`DELTOID_F`/`DELTOID`), the boundary sampler `deltoidBoundary`, and the
  `@cas/schwarz` engine re-exports; the σ engine + its round-trip test live in `@cas/schwarz`." Doc-only.

---

### [LOW] `DEFAULT_DENSITY.maxDepth = 18` is still dead configuration (prior finding `corr-maxdepth-dead-08` still open)
- **Area:** apps/correspondences · **Location:** `apps/correspondences/src/correspondenceRender.ts:27`
- **Type:** style (dead config)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `DEFAULT_DENSITY = { seedGrid: 64, maxDepth: 18, maxNodes: 220, escapeR: 6 }` — unchanged
  since the 2026-07 and 2026-08-17 reviews (file untouched since `669d531`). The deleted correspondence
  is 2:2, so the orbit tree doubles per level; the `maxNodes = 220` cap binds at depth ≈ 7-8 (2⁸−1 = 255
  > 220), so `maxDepth = 18` is never reached.
- **Why it matters:** trivial — a knob that advertises depth-18 trees the node cap always wins over. No
  runtime effect. Recorded here only because it is a still-open prior finding, not a regression.
- **Recommendation:** drop `maxDepth` to ~9 or delete the field. Cosmetic; leave to a cleanup pass.

---

### [NIT] Two "default iteration cap" constants for the family classifier (prior finding still open)
- **Area:** apps/correspondences · **Location:** `apps/correspondences/src/paramPlane.ts:33` vs `apps/correspondences/src/family.ts:93`
- **Type:** style
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `DEFAULT_PARAM_OPTIONS = { maxIter: 48, escapeR: 1e3 }` (paramPlane.ts:33) is what the app
  actually passes (CPU `classifyParamBand` + GPU `renderParamPlane`), so `family.ts:93`'s
  `DEFAULT_MAX_ITER = 64` is exercised only by unit tests that call `criticalEscape` without opts.
  Unchanged since the prior review. CPU and GPU both use 48, so they agree — no bug, just two sources of
  truth for one default.
- **Why it matters:** invites drift if only one is edited. No current defect.
- **Recommendation:** have `family.ts` export the single default the app consumes, or add a one-line
  note that 48 is the app default and 64 the library default. Optional.

---

### [NIT] `abs(E) op k` → `cabs2(E) op k·k` peephole has an unreachable fp32-overflow cliff for gigantic escape radii
- **Area:** packages/expr (mechanism of the `@cas/gpu` `cabs2` change) · **Location:** `packages/expr/src/glsl.ts:112,116` + `glslFloat` `:53-57`; consumes `cabs2` from `packages/gpu/src/glsl/complexSingle.glsl.ts:19` / `complexDf64.glsl.ts:22`
- **Type:** numerical (latent) · **Confidence:** low · **Fix-safety:** needs-review
- **Evidence:** the new sqrt-free escape peephole emits `(cabs2(E) op ${glslFloat(k * k)})`. `glslFloat`
  rejects only JS-non-finite values (`:54`), and `k*k` is computed as a JS double, so for an escape
  radius `k` between ~1.8e19 and 1.8e308 the JS product `k*k` is finite (passes the guard) but the
  emitted GLSL float literal exceeds fp32 max (3.4e38) → compiles to `Inf` → `cabs2(E) > Inf` is
  permanently false and the escape test never fires (a black screen, not a crash).
- **Why it matters:** this is a real correctness cliff introduced with the peephole, but **it is not
  reachable in practice**: no complex-dynamics escape radius is anywhere near 1.8e19 (they are 2 … ~1e6,
  and 1e6² = 1e12 ≪ fp32 max). The correspondences shaders do not even use `cabs2` (they use inline
  `length()`), so nothing in my primary scope is exposed. I flag it because it is the direct mechanism of
  the one change in my scope, and it lives one file across the `@cas/gpu`↔`@cas/expr` seam.
- **Recommendation:** none required now. If hardening is wanted, have the peephole fall back to the
  non-squared `cabsf` form (or skip the rewrite) when `k*k > 3.4e38`. One line; EXPR agent's file.

---

## What I verified as CORRECT (assurance — with extra weight on areas the prior review skipped)

**The `cabs2` change — the only churn in scope (`0527fe5`).**
- `complexSingle` `cabs2(a) = dot(a,a)` = `a.x²+a.y²` = `cabsf(a)²` exactly (vec2 = re,im). Correct.
- `complexDf64` `cabs2(a) = dot(vec2(a.x,a.z), …)` uses **hi limbs only**, identical to the existing
  `cabsf(a) = length(vec2(a.x,a.z))`. So `cabs2 = cabsf²` in the same precision regime — **no df64
  precision regression** (the old escape test was already hi-limb-only). The comment's "escape tests
  near |z|~R need no df64 precision" is sound: |z|~R is O(R), fp32 hi-limb resolves it to ~7 digits.
- Peephole (`glsl.ts:107-152`): guards `k >= 0` (a negative k would flip `abs(E) op k` under squaring —
  correctly excluded); routes `==` through the whole-value compare BEFORE the peephole (`:143`), so
  equality is never squared; `!=`/`<`/`<=`/`>`/`>=` are all monotone-safe for non-negative operands. The
  ≤1-ulp boundary caveat (a pixel may escape ±1 iteration) is honestly disclosed and goldens regenerated.

**`df64.glsl.ts` (NOT covered by the prior review — its coverage note excluded the df64 GLSL body).**
Read in full; correct transliteration of the verified `df64Ref.ts` oracle:
- `twoSum` (Knuth 6-flop), `quickTwoSum` (Dekker fast-two-sum), `twoProd` (Dekker split product) — all
  standard and correct; `* uOne` optimization barriers correctly placed on every rounded intermediate
  that feeds a cancellation (prevents a reassociating compiler from collapsing df64→single).
- `splitf` — overflow-safe Dekker split; the `|a| > 4.15e34` path scales by 2⁻¹³ (`1.220703125e-4`),
  splits with 4097 = 2¹²+1, scales back by 2¹³ (8192) — all exact powers of two, bit-identical to the
  plain split in range, finite above it. Correct (Review H3 fix).
- `df_add`/`df_mul`/`df_div`/`df_sqrt` — standard double-double algorithms, correct.
- `df_exp` (round-to-nearest range reduce by ln2, 14-term Taylor, ·2^k; guard `a.x ≤ -88`),
  `df_log` (2 Newton steps `y += a·e^{-y} − 1`), `df_sincos` (reduce by π/2, all **four** quadrant
  selections re-derived and correct; `mod(q,4.0)` is non-negative in GLSL so `qm ∈ {0,1,2,3}`),
  `df_atan2` (single-precision seed + one Newton rotation correction; `(0,0)→0` guard) — all correct.

**`@cas/schwarz` GPU σ evaluator `sigma.glsl.ts` — the CD/Faber cap-mismatch bug is ABSENT (correctly).**
- Every uniform-array loop is `for (X = 0; X < MAX_*; ++X) { if (X >= u_runtime) break; }` where the
  static bound is the array size and `packPhi` (`probe.ts:102-121`) **throws** if the CPU data exceeds
  `MAX_LAURENT`/`MAX_BRANCHES`/`MAX_K` (caller falls back to CPU). So the runtime cap can never exceed
  the GLSL array size — no silent clamp. `SIGMA_CONSTS_GLSL` bakes the caps from the **same** exported JS
  constants `packPhi` reads (`:40-42`), so they cannot drift. This is the *correct* form of the pattern
  that bit CD's 512-σ cap and Faber's degree-47 cap.
- σ math verified term-by-term against the documented formulas and the CPU twin: `evalF`
  (conj(c)/z + Σ conj(F[l])zˡ + branch), `evalPhiDeriv` (c − Σ l·F[l]/z^{l+1}), `evalFDeriv`
  (−conj(c)/z² + Σ l·conj(F[l])z^{l−1} − Σ (k+1)A/(z−z_j)^{k+2}), `branchPhi`/`branchPhiDeriv`
  (u_j = z/(1−conj(z_j)z), the (k+1)-weighted derivative bookkeeping), the bounded seed
  φ'(0)=Σ conj(A_{j,1}). Newton solve + retry ladder + branch-accept (exterior |z|>1 / interior |z|<1)
  all consistent. The `cinv`/`cdiv` denominator floor at `EPS_DIV` (deliberately NOT `@cas/gpu`'s
  unguarded `cdiv`) is correctly justified for a pole-heavy map.

**`gpu/probe.ts`.** `packPhi` caps enforced with throws; flat `u_branchA[j*MAX_K+k]` packing matches the
shader indexing; `runProbe` releases program/VAO/buffer/texture/FBO in a `finally` (no GL leak across a
test run). The 1×1 RGBA32F readback of σ (RGB) + the |F'|/|φ'| DE factor (.w) is a like-for-like GPU↔CPU
net. Correct.

**Mating explorer (mostly uncovered by the prior review).**
- `models/idealTriangleGroup.ts`: ideal-triangle group Γ = ℤ/2∗ℤ/2∗ℤ/2. Orthogonal-circle geometry
  re-derived: for 120°-apart ideal vertices, center at distance sec(60°)=2, radius tan(60°)=√3,
  orthogonality |C|²=4=3+1 ✓. `reflect` = geometric circle inversion C + r²(z−C)/|z−C|² = C + r²/conj(z−C)
  — correctly **anti-conformal**. Reduced-word BFS (no adjacent repeats) is exactly the group (free
  product of involutions has only R_k²=id), tile counts 3·2^d−2 correct, `apply` closure chain composes
  R_{word[0]}∘…, `rep = g(0)` with 0 ∈ fundamental. `fundamentalEdges` short-arc selection verified.
- `mating/mapSide.ts`: `greenSigma` G(w)=lim log|σⁿ|/2ⁿ; the functional equation G(σ(w))=2·G(w) holds
  exactly in the implementation for points that take ≥1 iterate to escape (both share the same escape
  iterate; only points already past escapeR=1e6 — not drawn — see the near-∞ ~2G−log2 discrepancy).
  `sigmaExternalRay` RK2 gradient-flow tracing honestly `≈`-labeled.
- `mating/glue.ts`, `matingView.ts`, `matingMain.ts`: pure drawing/interaction; `resample` degenerate
  cases (n=1, poly.length=1) handled, endpoints preserved; doubling map θ↦−2θ mod 2π correct; static base
  cached offscreen, ray fan memoized. `drawSigmaEquipotentials` is ~700k σ-evals but drawn **once** to an
  offscreen base at load — acceptable, not a hot loop.

**`@cas/export/png.ts`.** No injection possible: chunks are length-prefixed with correct CRC, so `text`
content can never be mis-parsed as a chunk boundary regardless of its bytes. Latin-1 lossy (>U+00FF→'?')
by `tEXt` spec. `findIend`/`readPngText` use byte-offset-correct DataViews, bounded loops (`pos+8 ≤
len`), no OOB/infinite-loop on a giant/corrupt length field. `crc32` matches the canonical check value.
The `String.fromCharCode(...spread)` stack-overflow in `readPngText` (prior 08 NIT) is real but
**unreachable in production** — no consumer calls `readPngText`; it is write-only reproducibility
metadata (only `png.test.ts` reads back). Confirmed, not re-reported.

**`@cas/gpu/glsl/phaseColoring.glsl.ts`** (the newly-shared coloring core the prior render agent said it
did not give a dedicated pass). Correct: modulus transfers (linear/rational/log/log-log) clamp properly;
NaN/Inf sentinel `!(m < 3e37) || m != m` renders grey not black; `uncMetric` fwidth is hoisted into
uniform control flow while the in-branch `enhancement`/`line0` fwidth is honestly noted as GLSL-ES
technically-undefined-but-benign; the CVD matrices are labeled a preview, not a calibrated transform. No
correctness or honesty issue.

**Honest labeling (load-bearing here).** Every straightening/surgery/mating surface reads `≈`: the
mating fold is "schematic (≈ illustrative) homotopy … not a conformal map" (`matingView.ts:266-268`), the
σ ray fan is "≈ illustrative … NOT a certified Böttcher argument", `matingMain.ts:56-60` carefully warns
"NOT same dynamics on all three … σ fixes the deltoid curve pointwise (2.3e-14)", and the README honesty
section is exemplary. The only `=` claims are genuinely exact (the ℚ(i) curve/cusp locus; G∘σ=2G).

**`pointInPolygon` consolidation.** Re-export chain `@cas/core/geometry.ts:28` → `@cas/schwarz/index.ts:14`
→ `apps/correspondences/src/deltoid.ts:19` is clean; the even-odd ray cast is correct with the standard
straddle guard on the division. Dependency direction downward-only. Matches the prior consolidation.

**Correspondences GPU loop caps** (re-confirm prior 06). `gpu.ts:70` `for(n≤512){if(n>uMaxIter)break;}`
with `uMaxIter=96` (`:162`); `paramGpu.ts:103` `for(n≤256)` with `uMaxIter=48` — both static bounds are
far above the hardcoded (never-user-raisable) caps, so no silent clamp. The CD σ 512-cap bug does not
reproduce here.

## Prior-review status
- **FIXED — do not re-report:** (1) the 06 MEDIUM stale `√2` univalence bound in `gpuAgreement.test.ts` —
  now `:144-146` "univalent on {|z|>1} for |a| ≤ 1 … do NOT restate the old, disproven |a| ≤ √2 'area
  theorem' window" and `:198` "univalence window |a| ≤ 1". A repo-wide grep confirms **no** surviving
  place re-asserts the wrong bound (the only other √2 hits are `familyUnivalence.test.ts`, which uses it
  correctly as the *disproven* counterexample, and the unrelated correspondence golden `1 ± √2`).
  (2) the 08 LOW `@cas/gpu` README + `glsl/index.ts` header omitting `PHASE_COLORING_GLSL` — now both say
  "four … building blocks" and list it (`README.md:60-65`, `glsl/index.ts:1-8`).
- **STILL OPEN (trivial):** `corr-maxdepth-dead` and the maxIter-48-vs-64 NIT (findings above; files
  untouched since the prior review).
- **Deferrals respected & re-confirmed:** ADR-0009 (three σ shaders coexist — merge deferred; the
  correspondences `gpu.ts` inline deltoid evaluator remains a genuine but deferred 2nd consumer of
  `@cas/schwarz/gpu`'s `SIGMA_EVAL_GLSL`). ADR-0026 (QD `schwarz-common` weighted families) — **no** LQD/
  PQD second consumer has appeared in `@cas/schwarz`; the deferral still holds (`index.ts:6-10`,
  `sigma.glsl.ts:8-17`).

## Coverage
- **Read in full / verified this pass:** `packages/gpu/src/glsl/{complexSingle,complexDf64,df64,
  phaseColoring}.glsl.ts` and `glsl/index.ts` header; `packages/expr/src/glsl.ts:53-160` (the peephole
  consuming `cabs2` — for the change under review); `packages/schwarz/src/{index.ts,gpu/sigma.glsl.ts,
  gpu/probe.ts}` and `packages/core/src/geometry.ts`; `apps/correspondences/src/deltoid.ts` +
  `mating/{mapSide,glue,matingView,matingMain}.ts` + `models/idealTriangleGroup.ts`;
  `packages/export/src/png.ts`; `apps/correspondences/README.md` + `packages/gpu/README.md` GLSL section;
  the `√2`/univalence/cap greps repo-wide; `git diff --stat` to bound the churn.
- **Relied on the prior 06 pass (unchanged since, spot-checked only):** `@cas/schwarz`
  `unbounded-laurent.ts`/`bounded.ts`/`branches.ts`/`preimage-tree.ts`/`limit-set.ts`/`forward.ts`/
  `singularities.ts` CPU math (prior review verified term-by-term; files untouched since `607b5b7`), and
  the correspondences `correspondence.ts`/`family.ts`/`orbitTree.ts`/`paramPlane.ts`/`paramGpu.ts`/
  `gpu.ts`/`correspondenceRender.ts`/`tricorn.ts`/`main.ts` (untouched; prior 06 covered in full).
- **NOT covered:** the browser σ-GPU tests' assertions (`sigma-gpu.browser.test.ts`), the correspondences
  test suite's numeric constants beyond the ones cited, and `@cas/gpu` `colormap.ts`/`maskTexture.ts`/
  `dualBackend.ts`/`complexDerived.glsl.ts` bodies (prior 08 covered `df64Ref.ts` + grep-level; I added
  `df64.glsl.ts`). I ran no code (read-only rule) — the `cabs2`, df64, σ, and Green-identity claims are
  hand-derivations or reads of existing green tests; the k·k-overflow NIT is reasoned with the concrete
  bound `k > ~1.8e19` and a one-line fix.
