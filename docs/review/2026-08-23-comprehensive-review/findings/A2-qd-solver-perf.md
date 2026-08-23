# A2 — Quadrature Domains live-solver / perf re-review

**Scope.** The QD live-solver pipeline with heaviest scrutiny on the Aug-20…22 perf work:
PR #292 + the split-out perf commits `5f6cbbe` (Tier-1 live/authoritative split), `345c99a`
(O5 suppress-live-analyses), `3de0af5` (S1, later reverted), `c1d666e` (O4 warm live lane),
`46f5bbc`/`4bb98f5`/`43bd076`/`edbedda` (S4 parts 1–4: verify inner loops, sqrt-free
clearance, branch-tail convolution, `evalPhi` scalar-ize), the `7348e32` code-review fix
(revert S1 + `markAsCustom`), plus the earlier #287 (singular-recovery→least-squares),
#289 (`Complex` import), #290 (singular-PQD sweep 512→256), and the `d68d933` worker-lane
factory + lazy-load refactor. I verified the perf design note
(`docs/perf/qd-live-solver-review.md`) against the actual code and re-derived the rewritten
numeric kernels by hand. Files read closely:
`app/solvers/{solver.mjs,solver-qd.mjs,solver-uqd.mjs,solver-taylor-common.mjs,prewarm.mjs,primary-solver-worker.mjs}`,
`app/core/{complex.ts (pkg),taylor.mjs}`, `packages/core/src/series.ts`,
`app/ui/ui-solve.mjs`, `app/ui/ui.mjs`. Cross-referenced
`docs/review/2026-08-suite-review/findings/07-quadrature-domains.md` — the prior LOW on
`Math.random()` recovery is now **fixed** (seedable `rng`, `solver.mjs:601`); I did not
re-report it.

**Headline.** The numeric-core rewrites (S4 parts 1–4) are **correct** — I re-derived each
and they are either bit-identical (evalPhi, sqrt-free clearance) or differ only by
FP-summation order (verify loops, branch-tail convolution). The one genuine issue is a
**latent live-vs-authoritative race** left by the Tier-1 split + O1 coalescing: the live
lane is never torn down at drag-end, so a cheap `method:"live"`, reduced-verification,
reduced-resolution result can (and after a slow drag *will*, transiently) land after the
authoritative settle. It is masked in the common case by timing, not enforced by construction.

---

### [MEDIUM] Live and authoritative solves use separate tokens and the live lane is never invalidated at drag-end — a `method:"live"` / 160-sample result can persist over the authoritative settle
- **Area:** apps/quadrature-domains · **Location:** `app/ui/ui-solve.mjs:140-282` (live path), `:276-281` (`.finally` trailing reschedule), `:343-372` (`solveAndRender`, bumps a *different* token), `app/ui/ui.mjs:484` (`onPoleDragEnd = () => scheduleSolve()`)
- **Type:** bug (race / invariant) + perf
- **Confidence:** medium (reasoned; could not execute to trigger the window)
- **Fix-safety:** needs-review
- **Evidence:** The live path guards its paint with `_liveSolveToken` (`ui-solve.mjs:200,211`);
  the authoritative `solveAndRender` guards with a *separate* `_solveAndRenderToken`
  (`:372`). **Neither invalidates the other**, and nothing at drag-end cancels the live
  lane — `onPoleDragEnd` only calls `scheduleSolve()` (debounced `solveAndRender`, 60 ms),
  which never touches `_liveSolveToken`/`_liveInFlight`/`_liveDirty` (grep confirms these
  symbols appear only in the live block). On drag-end the live `.then` still runs
  (`:210-274`): it sets `state.current.primary = sol` with `method:'live'`, `identity`/
  `identityOK` from the reduced `LIVE_SAMPLES=96` check, and repaints the boundary at
  `LIVE_DISPLAY_SAMPLES=160` (`:1039-1047,1060-1064`) — and it does **not**
  `publishPrimarySolution` (O3). Worse, O1's new `.finally` (`:276-281`) fires **one more**
  live solve after drag-end whenever `_liveDirty` was set (routine when a live solve spans
  >1 frame, i.e. at 4× throttle — the very target hardware). So after such a drag there is a
  guaranteed extra live solve + a transient 160-sample repaint, racing the 500-sample
  authoritative paint.
- **Why it matters:** The design comments assert "every drag gesture ends with a full
  solveAndRender … which publishes authoritatively" (`:261-265`) and "the drag-end full solve
  re-renders at full resolution" (`:103-110`) — i.e. that the authoritative solve is the
  **final writer**. That invariant is not enforced; it holds only because the authoritative
  solve (multistart + full-sample verify) is normally *slower* than a warm live step, so it
  wins the `state.current` race by finishing last. When that ordering does not hold — a
  trivially-fast warm authoritative solve, or the authoritative *failure* cascade taking a
  different path — the shown solution can be left `method:"live"` with a 96-sample identity
  verdict and a coarse (160-pt) boundary, and the on-plot validity badge
  (`renderValidityBadge`, `:955-963`, change-guarded) can be left showing the cheaper live
  verdict. Near a validity boundary the 96-sample and 500-sample identity checks can disagree,
  so this can surface a less-certified verdict as the settled one — a soft hit to the
  honest-labeling guardrail. Even in the benign ordering, the guaranteed post-drag extra live
  solve + coarse repaint is exactly the "redundant re-solve on incremental change" the perf
  work set out to remove. This is fresh churn (Tier-1 + O1 both created/worsened it: pre-Tier-1
  a late live result painted at full res and *published*, so it was visually consistent).
- **Recommendation:** Make the authoritative solve the guaranteed last writer. At drag-end
  (in `onPoleDragEnd` and the slider `change` handlers) and/or at the top of `solveAndRender`,
  bump `_liveSolveToken` (drops any in-flight live `.then`) and set `_liveDirty = false`
  (kills the trailing `.finally` reschedule); optionally `PSW.cancelLive()`. A concrete test:
  drive a drag whose live lane is artificially slowed so a live solve is in flight at
  `change`, then assert that after both lanes settle `state.current.primary.method !== 'live'`
  and the drawn boundary length is `state.samples`-class, not `LIVE_DISPLAY_SAMPLES`.

---

### [NIT] Typo in the sqrt-free clearance comment ("monotincreasing")
- **Area:** apps/quadrature-domains · **Location:** `app/solvers/solver.mjs:1280`
- **Type:** stale-doc / style · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** `// below use only the ORDER and sign of the clearance, and x↦x² is monotincreasing`
- **Why it matters:** Cosmetic only; the surrounding reasoning (squared clearance preserves
  ranking + the `>0` filter) is correct.
- **Recommendation:** "monotonically increasing".

---

### [NIT] Confirmations / non-findings worth recording (the perf work is largely clean)
- **S4 part 1 (verify inner loops, `46f5bbc`) — CORRECT.** Bounded `solver-qd.mjs:300-322`:
  `g = conj(w)·φ'·z`, `Σ_k w^k·g` with `w^k` accumulated incrementally from `w^0=1`, then
  `lhs = lhsRe[k]/N` — matches the former `(1/N)Σ w^k conj(w) φ' z`. Unbounded
  `solver-uqd.mjs`: `dinv=1/(w−b)`, `dinv^k` from `k=1`, `lhs = -lhsRe[k]/N` — sign and
  `−1/N` preserved. `w≠b` (b strictly interior) guarantees a nonzero denom. Differs from the
  original only by FP summation order (~1e-15); RHS + `maxRelDiff` downstream unchanged.
- **S4 part 2 (sqrt-free clearance, `4bb98f5`) — CORRECT.** `distBoundarySq`/`distPoleSq`
  drop `Math.hypot`; `clr = min(dist²,poleDist²)` and `min(a²,b²)=(min(a,b))²` for `a,b≥0`,
  so the `>0` filter and the descending sort select the **exact same** points; only `b` is
  returned (`solver.mjs:1321`), so the squared value never leaks as a distance. The
  origin-exclusion guard correctly stays a true `Math.hypot < origEps` (`:1313`).
- **S4 part 3 (branch-tail convolution, `43bd076`) — CORRECT + no aliasing.** The inlined
  truncated convolution `t[i]=Σ_{j≤i} pow[j]·uT[i−j]` matches `@cas/core` `series.mul`
  (`packages/core/src/series.ts:50-63`) which the old `Taylor.mul` called; `uT[l]=conj(z_j)^{l−1}·αInv^{l+1}`
  reproduced exactly; scratch buffers are fully overwritten per branch, the convolution reads
  `pow`/`uT` and writes a separate `t` (no self-aliasing), and `result[i]` is replaced with
  **fresh** objects at the end (caller originals only read — same replace-not-mutate contract
  as the old `Complex.add`). The removed `Complex`/`Taylor` imports leave **no** live
  references (only comments) — no bundled-worker `ReferenceError` regression (grep confirmed).
- **S4 part 4 (`evalPhi` scalar-ize, `edbedda`) — genuinely bit-identical.** I initially
  suspected the inlined naive division diverged from `Complex.div`, but `Complex.div`
  (`packages/core/src/complex.ts:138-149`) has a **naive fast path** `(a·b̄)/|b|²` taken
  whenever `|b|²` is finite & nonzero; `divScaled` (Smith) is only the `d===0||Infinity`
  tail, unreachable for these O(1) operands. The inlined `u=z/denom` and `polyA[l]/z^l`
  formulas match that fast path term-for-term. `phi.c` is a **positive real**
  (`solver-uqd.mjs:465` throws otherwise; `:100` stores `{re:phi.c,im:0}`), so `re=zr*phi.c`
  is correct — not a latent complex-c bug.
- **S1 (`3de0af5`) fully reverted (`7348e32`).** `liveSolveStep` again passes only
  `{numSamples}` (`solver.mjs:1843`); the ≥1500/2000/4000 floors + adaptive escalation are
  restored in `solver-uqd.mjs`/`solver-uqd-pqd.mjs`/`solver-uqd-pqd-singular.mjs`. Good call —
  the reverted floor would have false-flagged near-cusp/singular unbounded families every
  frame.
- **`markAsCustom` fix (`7348e32`) — CORRECT.** Gated on `_qdCustomSincePublish` (reset in
  `publishPrimarySolution`, `ui.mjs`), so per-frame calls coalesce but a fresh edit after a
  publish re-invalidates the side cards. Fixes the Tier-1 over-idempotency that left stale
  Faber roots / exportable equations.
- **O4 warm-lane (`c1d666e`/`prewarm.mjs`) — no double-spawn race.** `ensureReady`
  (`primary-solver-worker.mjs:99-144`) shares `_readyPromise`, so a `pointerdown`
  `ensureLiveReady` and a concurrent first `liveSolve` spawn **one** worker. Fire-and-forget
  with `.catch`. Independent per-lane fallback latches preserved (`createWorkerLane`).
- **O5 (`345c99a`) — no stale status after drag.** `scheduleLiveAnalysis` (`ui-solve.mjs:681-700`)
  early-returns unless an overlay is on, and drops (never respawns) while `isAnalysisBusy()`;
  the drag-end `solveAndRender` runs the one authoritative `runStatusAnalyses`, so cards
  refresh on settle.
- **#287 — CORRECT.** Singular-recovery now `solveLeastSquares(Jnudged, …)` (`solver.mjs:611`),
  overdetermined-capable, identical to `solveLinearSystem` on square systems, confined to the
  post-"singular" recovery branch. The prior `Math.random` LOW is resolved (`rng()` at `:601`).
- **#289 — CORRECT and hardening.** Adds the missing `Complex` import to
  `solver-pqd-common.mjs` and removes the ambient-global masking from the ESLint allowlist +
  a clean-realm graph test, closing the blind spot that hid it.
- **#290 (sweep 512→256) — acceptable.** Trapezoidal on the analytic/periodic mass integrand
  converges spectrally; the independent 500-sample convergence-time verifier still certifies
  every returned φ, so the correctness gate is unchanged. Minor residual risk only for a
  *non-smooth* near-cusp singular ∂Ω (spectral convergence degrades), but the verifier bounds
  it; not flagged.
- **Convention factors intact.** The perf rewrites preserved every `1/N`, the `−1/N` sign,
  and the residue-sum RHS verbatim; no `π`/`2πi` constant migrated out of the app edge.

---

## Coverage

**Examined closely (read / re-derived):** all four S4 numeric-core rewrites and their
integration with the RHS/`maxRelDiff` (`solver-qd.mjs`, `solver-uqd.mjs` verify + `evalPhi`
+ `residual`); `branchTaylorAccumulate` (`solver-taylor-common.mjs`) vs `taylor.mjs` +
`@cas/core` `series.mul`; `Complex.div`/`divScaled` fast-path (`packages/core/src/complex.ts`);
`chooseHoleTestPoints` sqrt-free change (`solver.mjs:1250-1322`); `newtonSolve`
singular-recovery (`solver.mjs:570-614`); the whole live path + Tier-1 split + O1 coalescing
+ O5 in `ui-solve.mjs` (and the `markAsCustom`/`publishPrimarySolution` gate in `ui.mjs`);
`prewarm.mjs` + `createWorkerLane`/`ensureReady`/`run` lane lifecycle
(`primary-solver-worker.mjs`); drag-end wiring in `ui.mjs`; the S1 revert and #287/#289/#290
diffs; and a churn scan of `d68d933` (worker-lane factory + lazy-load).

**Not covered (honest gaps):** the per-family kernels I did *not* re-derive beyond the shared
core and the reverted S1 floors — `solver-pqd*.mjs`, `solver-lqd*.mjs`, `solver-uqd-lqd*.mjs`,
`solver-uqd-pqd*.mjs`, `seeds/`, `solver-cmax.mjs`, `solver-continuation.mjs`,
`solver-faber.mjs` (their `evalPhi`/verify kernels were **not** touched by the S4
scalar-ize, which is bounded-QD + base-unbounded only). `qd-equations.mjs` and
`direct/direct-common.mjs` — named in the brief but had **zero churn** since the last review
(`git log 6c43a92..HEAD` empty), so not re-audited here (the prior review's M₀ label note on
`qd-equations` stands unchanged). The `d68d933` lazy-load / code-split (L1) import-placement
change was scanned, not golden-verified. The draw-loop `toScreen` `{x,y}`-per-point
allocation (R3) and the FD-Jacobian per-live-iter cost (S5/S6) remain **unimplemented/deferred**
per the design note — pre-existing perf items, not regressions. GPU/schwarz/sphere render
paths out of scope.
