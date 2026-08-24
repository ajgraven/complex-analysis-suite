# A8 — Complex Dynamics internals (df64 / BLA deep-zoom · `@cas/dynamics` · overlays · state/interchange)

Scope: the CD internals the 2026-08-17 review explicitly skipped — the df64 double-double path
(`render/dd.ts`), the bivariate-linear-approximation deep-zoom (`render/bla.ts`,
`render/perturbation*.ts`, the BLA/reference-orbit/precision wiring in `render/glPlot.ts`), external-ray
/ Böttcher tracing (`packages/dynamics/src/rays.ts`), the combinatorics modules
(`combinatorics/*`), the σ / Julia overlays, and CD's state / interchange glue
(`state/*`, `interchange/*`). I avoided the #294 WebGL recolour hot loop (agent A1's scope). Read-only;
no builds/tests run. Cross-referenced `docs/review/2026-08-suite-review/findings/05-complex-dynamics-dynamics.md`.

**Headline: the numerically-delicate paths are in excellent shape.** I re-derived and verified the
double-double error-free transforms, the BLA merge/radius/traverse logic (incl. the glitch-free Zhuoran
rebasing), the perturbation step kernels, and the external-ray Newton recurrences — all correct. **No
CRITICAL or HIGH issue, no π/2πi convention error, and no missing-glitch-check wrong-image bug was
found.** One prior MEDIUM (σ GPU 512 cap) is now **fixed**. The findings below are LOW/NIT: one genuine
(if hard-to-reach) silent numerical-correctness bug, a test-oracle consistency gap, two prior LOW/NIT
items still open, and small consolidation/doc notes.

---

### [LOW] `angles.ts` `compare()` overflows 2⁵³ for large denominators → silently wrong core entropy (reachable, unguarded user input)
- **Area:** apps/complex-dynamics (combinatorics) · **Location:** `apps/complex-dynamics/src/combinatorics/angles.ts:56-58`; reached from `apps/complex-dynamics/src/main.ts:5689-5692` via `combinatorics/coreEntropy.ts:119`
- **Type:** numerical / bug
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `compare(a,b) = Math.sign(a.p*b.q - b.p*a.q)` uses the exact-integer cross product, valid
  only while both products stay ≤ `Number.MAX_SAFE_INTEGER` (2⁵³ ≈ 9.0e15). `coreEntropy(p,q)` is called
  with **raw user input** — the spider-angle box parses `(\d+)/(\d+)` (`main.ts:5684,5689-5692`) with **no
  cap on q**. `coreEntropy` gates only on the *forward-orbit length* (`n > maxOrbit` where maxOrbit=40,
  `coreEntropy.ts:111`), not on the denominator, and the orbit of `p/(2ⁿ−1)` has length = ord₂(2ⁿ−1) which
  divides n. So `θ = 1/(2²⁷−1)` (`1/134217727`) has orbit length 27 ≤ 40 and proceeds. Inside, `inArc`
  calls `compare(c1, x)` with `c1 = angle(θ.p, 2·θ.q)` (denominator ≈ 2.7e8) against orbit angles `x`
  (numerator up to ≈1.3e8): the cross product `x.p·c1.q ≈ 1.3e8 · 2.7e8 ≈ 3.6e16 > 2⁵³`, so it rounds to
  the wrong integer and `Math.sign` can return the wrong ordering. `inArc` then misclassifies "separated"
  pairs, the Thurston transition matrix is built wrong, and a **plausible-but-wrong** `h`/`λ`/`B` is
  printed (`main.ts:5693-5694`). It is `≈`-labeled, so the honesty guardrail is not violated — but the
  *value* is silently incorrect.
- **Why it matters:** A silent wrong numerical result with no error/guard, exactly the "looks plausible but
  is wrong" failure class the brief prioritizes. Practical reachability is low (needs an 8-digit
  denominator; ordinary inputs like `1/7`, `3/7` are far inside the safe range), which is why this is LOW
  rather than MEDIUM.
- **Recommendation:** Guard the entry: in `coreEntropy` (and/or `angle`) reject or cap denominators above a
  safe bound (e.g. `q > 2**26` → return null), or make `compare` overflow-safe (BigInt cross product, or a
  float fallback with an exact tie-break). A concrete test: assert `coreEntropy(1, 2**27 - 1)` either
  returns `null` or matches a BigInt-reference computation, and that `compare(angle(1, 2**27-1), angle(2,
  2**27-1))` returns `-1`.

### [LOW] Perturbation CPU oracles `perturbMultibrot` / `perturbPoly` hardcode the escape radius `> 4`, while the shipped shader uses `uPerturbEscape2` — same defect class as the already-fixed `traverseBLA` (cd-render-10)
- **Area:** apps/complex-dynamics (deep-zoom) · **Location:** `apps/complex-dynamics/src/render/perturbationPoly.ts:27,152,328`
- **Type:** test-gap / numerical (latent)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `perturbMultibrot`/`perturbPoly` document themselves as "the exact loop the GPU single-step
  path runs, so it is the ground truth Stage 2's shader must reproduce" (`perturbationPoly.ts:131-135`,
  `:308-311`), yet their **pixel** escape test is `z·z > BAILOUT2` with `BAILOUT2 = 4` hardcoded
  (`:27,152,328`). The production single-step kernel bails at `uPerturbEscape2 = probeEscapeRadius2() ??
  4.0` (`glPlot.ts:885,1504`), which is explicitly "*not* always 4" for the `abs(z)>10⁴` divergence-guard
  families. The sibling BLA oracle `traverseBLA` was already fixed for exactly this reason — it now reads
  `escape2` from `opts` (`bla.ts:183-190,235`, finding cd-render-10) — but the fix was not carried to
  `perturbMultibrot`/`perturbPoly`. (The *reference-orbit* `BAILOUT2 = 4` in `perturbation.ts` /
  `perturbationPoly.ts` is a fine design choice — an escaping reference is truncated at |Z|>2 and the
  exact Zhuoran rebase continues correctly past it; this note is only about the **pixel** escape test in
  the two oracle traversals.)
- **Why it matters:** A maintainer reaching for `perturbMultibrot`/`perturbPoly` as the shader oracle for
  a non-`|z|>2` map would be silently handed the wrong escape counts, and no test can currently cover the
  shader's `escapeR ≠ 4` single-step path on the CPU. No production wrong-image (the GPU is correct; these
  functions are used only by `test/perturbation*.test.ts`).
- **Recommendation:** Give both functions an `escape2` option defaulting to 4 (mirroring the cd-render-10
  fix to `traverseBLA`), and add a test at, e.g., `escape2 = 1e8` that pins the oracle against a naive
  per-pixel loop with the same bailout.

### [LOW] Prior finding #52 still open: CPU vs GPU σ library defaults diverge (escapeR 1e6 vs 1e4, maxIter 64 vs 48)
- **Area:** apps/complex-dynamics (σ peer view) · **Location:** `apps/complex-dynamics/src/render/schwarzView.ts:157,182-183,272,275` vs `apps/complex-dynamics/src/render/schwarzGL.ts:522-523`
- **Type:** bug (latent) / numerical
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Unchanged since the 2026-08-17 review (its LOW #52): the CPU σ entry points still default
  `escapeR ?? 1e6`, `maxIter ?? 64` while `schwarzGL.render` defaults `maxIter ?? 48`, `escapeR ?? 1e4` —
  two functions documented to "agree pixel-for-pixel." Still masked in production because the app passes a
  single shared `schwarzEscape` opts object to both paths, so no user-visible divergence today.
- **Why it matters:** Latent parity trap — any future caller/test/refactor that relies on the defaults gets
  different classification thresholds on the two paths. Recorded here only to confirm it is **still open**
  (not a regression).
- **Recommendation:** As the prior review said — one shared `SCHWARZ_ESCAPE_DEFAULTS` read by both entry
  points. (Note: the app-level input clamps in `state/schwarzState.ts:93,300` — `maxIter` default 48,
  `escapeR` default 1e4 — already match the GPU, so it is the CPU-library defaults that are the outlier.)

### [NIT] `lastConnectivityRigorous` / `rigorousConnectivity` naming still stale for what the code hedges as `≈` (comment now fixed)
- **Area:** apps/complex-dynamics · **Location:** `apps/complex-dynamics/src/main.ts:1992,2071,2133,2149`
- **Type:** stale-doc / naming
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** The prior review's LOW #70 is **partially closed**: the offending `// Rigorous
  (Fatou–Julia)…` comment was reworded honestly (`main.ts:2124-2126` now: "only all-escaped 'cantor' is a
  determination; 'connected'/'disconnected' are iteration-cap estimates … surfaced to the user as ≈"), and
  the user-facing verdicts are correctly `≈ connected` / `≈ disconnected` (`:2141,2145`). But the flag is
  still named `lastConnectivityRigorous` and is now also passed to the metrics worker as
  `rigorousConnectivity` (`:2071`). Its actual meaning is "a critical-orbit verdict exists, so skip the
  image-based fallback" — behaviorally fine (the worker leaves the `≈` verdict untouched, `:2079-2083`),
  but the word "rigorous" contradicts the (correctly hedged) verdict it gates.
- **Why it matters:** Cosmetic; a future reader may over-trust a value literally named "rigorous." No
  user-facing labeling defect.
- **Recommendation:** Rename to `…FromCriticalOrbits` / `…Determined` (both the local flag and the worker
  message field), as the prior review already suggested.

### [NIT] Böttcher export note labels the exact (truncated) `bₖ` as "estimated (≈)" — still open, conservative direction
- **Area:** apps/complex-dynamics (interchange producer) · **Location:** `apps/complex-dynamics/src/interchange/exportMap.ts:13-14,70-71`
- **Type:** stale-doc / labeling
- **Confidence:** medium
- **Fix-safety:** safe-now (provenance text only)
- **Evidence:** Unchanged since the prior review's final NIT: the provenance note still reads "tail
  truncated to N estimated bₖ (≈)" (`exportMap.ts:70-71`). Each `bₖ` is an *exact* rational-recurrence
  coefficient; only the reconstructed boundary from finitely many terms is an approximation.
- **Why it matters:** Understates precision (the safe direction) — does not violate the honesty guardrail.
  Purely a wording nicety; noted only to confirm it is still present.
- **Recommendation:** If touched, "coefficients bₖ exact; the tail is truncated to N terms, so the
  reconstructed boundary is an estimate (≈)."

### [NIT] `binom` in `bla.ts` duplicates the exported `binomial` in `perturbationPoly.ts` (byte-identical body)
- **Area:** apps/complex-dynamics (deep-zoom) · **Location:** `apps/complex-dynamics/src/render/bla.ts:46-51` vs `apps/complex-dynamics/src/render/perturbationPoly.ts:92-97`
- **Type:** consolidation (single-app, speculative — not an ADR-0007 second-consumer case)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Both are `if (k<0||k>n) return 0; let c=1; for (j=1..k) c=(c*(n-j+1))/j; return Math.round(c)`
  — identical. `perturbationPoly.ts` already **exports** `binomial` (imported by `glPlot.ts:1506`), and
  `bla.ts` already imports `multibrotStep`/`polyStep` from that same module — so `bla.ts` could drop its
  private `binom` and import `binomial`. Both are cold (table-build) paths, so there is no hot-loop reason
  to keep the copy.
- **Why it matters:** Trivial duplication; a future edit to the coefficient formula could touch one and
  miss the other. Not package-worthy (both live in CD; `@cas/expr` has no binomial primitive today).
- **Recommendation:** Have `bla.ts` import `binomial` from `./perturbationPoly` and delete `binom`. Or
  leave as-is (WONTFIX) — either way, minor.

### [NIT] Complex-arithmetic helpers re-rolled across `bla.ts` / `perturbationPoly.ts` / `rays.ts` (deliberate; document to prevent a regressing "cleanup")
- **Area:** apps/complex-dynamics + packages/dynamics · **Location:** `apps/complex-dynamics/src/render/bla.ts:37-43`, `apps/complex-dynamics/src/render/perturbationPoly.ts:86-89,177-182`, `packages/dynamics/src/rays.ts:33-38`
- **Type:** consolidation / style
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** Each defines its own `cmul`/`cadd`/`cabs`/`cdiv` on bare tuples rather than using
  `@cas/expr/complexJs`. In `rays.ts` (prior review's NIT) and the perturbation single-step loops these are
  allocation-free / split-re-im micro-optimizations inside Newton / per-step iteration; in `bla.ts` (cold
  table build) the motive is weaker. Same duplication the prior review logged for `matingEngine.ts`
  (cd-dup-10, still open at `render/matingEngine.ts:47,51`).
- **Why it matters:** Consistency + a trap for a well-meaning consolidator who could regress a hot loop by
  routing it through the allocating shared ops.
- **Recommendation:** Add a one-line "allocation-free complex ops for the perturbation/Newton inner loop"
  note at each hot-loop site (as suggested for `rays.ts`); the cold `bla.ts` helpers could genuinely move
  to `@cas/expr/complexJs`. No behavior change either way.

---

## Confirmed FIXED since the prior review (regression check — clean)

- **Prior MEDIUM #22 (GPU σ silently caps the orbit at 512 while the input allows 4096) is FIXED.** Both σ
  escape loops now bound on the shared constant `SIGMA_MAX_ITER = 4096`
  (`schwarzGL.ts:57,265,310` — `for (int n = 1; n <= ${SIGMA_MAX_ITER}; ++n)`), and the iterations input
  clamps to the *same* constant (`main.ts:5048` — `Math.min(SIGMA_MAX_ITER, v)`), with the state parser
  clamping to 4096 too (`schwarzState.ts:299`). The GPU loop bound and the input maximum can no longer
  diverge. The `schwarzGL.ts:54` comment now states the invariant ("that bound MUST be ≥ the input's max").
- **Prior LOW #70 comment** ("// Rigorous (Fatou–Julia)…") is reworded honestly (see the naming NIT above
  for the residual variable-name half).
- **WebGL resource lifecycle is sound**, including the new #294 two-pass-recolour resources: `restoreContext`
  nulls every cached texture/FBO/program handle — `fieldFbo`/`fieldTex`/`colorizeProgram` included
  (`glPlot.ts:647-653`) — so a lost-and-restored context recreates cleanly; `rebuild` deletes the old
  single/df64 programs (`:889,898`); async df64 builds are disposed on a generation bump or lost context
  (`:936-937,948-955,1000-1004`). No context/texture leak regression from the perf PRs.

## Positively verified (load-bearing, checked closely — recorded so the next reviewer needn't re-derive)

- **Double-double kernels (`render/dd.ts`).** `twoSum` (Knuth), `quickTwoSum`, `twoProd` (Dekker split,
  `SPLIT = 2²⁷+1`, correct with no FMA in JS) are the standard error-free transforms; `ddAdd` matches the
  accurate Bailey/Hida-Li two-two-sum, `ddAddNumber` the dd+double form, `ddMul` the correct
  cross-term-with-`quickTwoSum` product (dropping the negligible lo·lo term). `ddCenterFromString` even
  guards the `Number("")===0` blank-limb trap (`:103-106`). Correct.
- **BLA deep-zoom (`render/bla.ts`).** Verified the single-step radius `EPS·(2/(d−1))·|Z|` (= `EPS·|A|` at
  d=2) as the k=2-term bound (higher terms are ~EPS² smaller at that radius, so the monomial simplification
  is safe); the general-poly radius `min_k (EPS·|A|/|cₖ|)^{1/(k−1)}`; the merge `A=A_y·A_x`, `B=A_y·B_x+B_y`,
  `r=min(r_x, max(0,(r_y−|B_x|·maxC)/|A_x|))`; the binary-tree alignment (level k ↔ index m/2ᵏ, `m%2ᵏ==0`);
  and `traverseBLA`'s "cannot escape mid-skip" precondition (`m+bla.l ≤ refMax`, `k+bla.l ≤ maxIter`).
- **No missing glitch check.** The perturbation traversals (`perturbationPoly.ts:159-163,334-338`,
  `bla.ts:271-275`) use the **Zhuoran rebasing** criterion — rebase to Z₀ via the exact identity
  `δz ← (Z_m+δz)−Z₀` when `|z| < |δz|` or `m ≥ refMax` — which is a correct, glitch-free alternative to
  Pauldelbrot glitch detection. The reference-orbit `BAILOUT2=4` truncation of an escaping reference is
  handled correctly by that exact rebase, so a `_perturbEscape2 ≠ 4` map still renders correctly. Confirmed
  no wrong-deep-zoom-image path.
- **`@cas/dynamics/rays.ts`.** Re-derived both angle-doubling schedules — parameter ray targets
  `2^(m−1)·θ` (critical orbit z₀=0, double *after* use, `:57-77`), dynamic ray targets `2^m·θ` (double
  *before* use, `:92-94`) — and both Newton derivative recurrences (`d←2zd+1`, `d₀=0` for the param
  critical orbit; `d←2zd`, `d₀=1` for the dynamic orbit), with correct simultaneous z/d updates. Edge cases
  handled: `d==0` breaks the Newton step, non-finite result stops the ray, `rayDepthForZoom` clamps to the
  f64 angle-doubling budget [28,50], `parseAngle` rejects q=0. Correct; matches the prior review's finding 05.
- **Combinatorics.** `coreEntropy.ts` — the Thurston pair-transition rules (separated ⇒ two chords through
  θ; not-separated ⇒ {2a,2b}), the sparse column matvec, and the exact `spectralRadiusExceedsOne` λ=1 test
  (Tarjan SCC; for integer weights an SCC has λ=1 iff intraWeight==nodeCount, correct) all check out.
  `angles.ts` exact-rational ops correct (modulo the `compare` overflow above). `orbitPortrait.ts`
  (`MAX_DOUBLING_Q=20` keeps denominators ≤ 2²⁰, so `compare` is safe there), `stripping.ts`
  (`externalAnglePairs` integer kneading enumeration bounded by `MAX_STRIP_PERIOD=24`) verified.
- **State/interchange glue.** `state/schwarzState.ts` is thoroughly hostile-link-hardened (finiteness +
  structural checks, per-list `MAX_TERMS=64` cap, the `|z_j|<1` exterior-pole invariant, sane clamps,
  unknown enum → default, byte-identical omit-at-default encoding for backward compat). `state/appState.ts`
  rides the shared `@cas/interchange` versioned codec and is namespaced `"cd"`. `interchange/exportMap.ts`
  (Böttcher `LaurentMap` producer) reproduces the `CD_TO_RM_BOTTCHER_LINK` golden and correctly omits the
  `conventions` tag (no area/contour normalization ⇒ no π/2πi ambiguity). No share-link backward-compat
  break found.

## Coverage

**Examined closely:** `render/dd.ts` (full), `render/bla.ts` (full), `render/perturbation.ts` (full),
`render/perturbationPoly.ts` (full), the BLA / reference-orbit / precision / escape-radius / context-loss
/ program-lifecycle sections of `render/glPlot.ts` (≈140-210, 580-653, 874-1004, 1290-1530 — i.e. the
df64/BLA path, deliberately **not** the #294 recolour hot loop, A1's scope); `packages/dynamics/src/rays.ts`
+ `index.ts` (full); `combinatorics/coreEntropy.ts`, `angles.ts`, `orbitPortrait.ts` (full) and
`stripping.ts` (the enumeration/tower half); `state/schwarzState.ts` + `state/appState.ts` (full);
`interchange/exportMap.ts` (full); the connectivity-honesty readouts in `main.ts` (~2050-2210) and the
core-entropy call site (~5670-5710); `render/schwarzTreeOverlay.ts` (full, as a representative overlay).

**Cross-referenced** the 2026-08-17 review (finding 05): its MEDIUM #22 is now fixed; LOW #52 and the
naming half of LOW #70 remain open (above); its uniformize.ts re-derivations were not re-audited (no churn
there since — `git log` shows the only in-scope churn since the last review is the two #294 perf commits,
neither in the df64/BLA/dynamics paths).

**Spot-checked / NOT deeply audited (honest gaps):** `combinatorics/dynatomic.ts` (polynomial
z-elimination — read the constants/caps but did not re-derive the resultant algebra); the remaining σ
overlays (`schwarzOrbitOverlay`, `schwarz{Boundary,Cycle,Level,Forward,Singularity,LimitSet}Overlay`,
`schwarzOrbitFamily`, `schwarzLegend`) beyond the shared projection idiom verified in
`schwarzTreeOverlay.ts`; the Julia-analysis overlays (`yoccozPuzzle`, `lamination`, `hermanRing`,
`siegelCurves`, `weightedBirkhoff`, `brjuno`, `farey`, `underIteration`, `jacobian`, `inspect`); the bulk
of `render/overlay.ts` (961 lines) and `render/plotView.ts` / `render/sphereView.ts` coordinate math;
`render/matingEngine.ts` internals (prior cd-dup-10 confirmed still present, not re-derived);
`state/profiles.ts` / `ui/*` glue; `interchange/importMap.ts` internals (prior review covered — the
disk/inverse-tag NIT was not re-examined). No `git`/build/test execution (read-only).
