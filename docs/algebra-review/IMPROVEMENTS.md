# QD Algebra module — improvement investigation (2026-07-23)

> A six-agent parallel investigation of the Quadrature Domains **Algebra module**
> (`apps/quadrature-domains/app/algebra/` + `sym-core.mjs` + `qd-constraints.mjs`), covering
> mathematical extensions, UX/quality-of-life, correctness & honest-labeling, performance, code
> quality/architecture, and testing/interop. Each lane was given the full "already-shipped /
> deferred / rejected" list so findings are *new*, and each finding is grounded in `file:line`
> evidence with an explicit "already-checked" confirmation.
>
> **Verification.** The eight highest-stakes claims (all of Tier 0, plus the multi-domain and
> dead-code items) were re-verified at the source by hand — marked **✔ verified** below. The rest
> are agent-reported with cited evidence — marked **○ reported** — and should be reproduced before
> a fix lands, per the module's own rule (*reproduction, not code-reading, is the gate; check the
> producer, not just the consumer*). Confidence and effort are the investigating agent's, adjusted
> where my verification changed them.
>
> **Lens.** Honest labeling (`=` exact/certified · `≤`/`≥` rigorous bound · `≈` estimate) is the
> paramount value. Tier 0 is ordered first because a badge that overstates certainty is this
> project's worst bug class — and every Tier-0 item is a small fix.

## Priority summary

| # | Finding | Cat | Effort | Conf | Verified |
|---|---------|-----|--------|------|----------|
| **C1** | Verdict card renders a proven `≥` lower bound with a `≤` badge | Honest-label | S | High | ✔ |
| **C2** | Derivation transcript + SymPy export use raw `QC.conjVarName` (census bug, unswept) | Honest-label | S | High | ✔ |
| **C3** | Moment route stamps "No QD" `=` even when Schur–Cohn was unreliable | Honest-label | S | High | ✔ |
| **C4** | msolve export of a conjugate-model column lacks the Maple real-count warning | Honest-label | S | High | ✔ #137 |
| **C5** | ADR-0006 convention tag is decorative — no π/2πi guard on import | Honest-label | S | High | ✔ |
| **C6** | Bifurcation labels the reim real-count `=`; classify calls the same quantity `≤` | Honest-label | S–M | Med | ✔(basis) |
| **C7** | `specializationLedger` swallows errors — a restricting constraint can silently drop | Honest-label | S | Med | ✔ |
| **Q1** | Multi-domain verdict: inspect/plot/export locked to 1 of N certified domains | QoL+label | M | High | ✔ |
| **Q2** | Heavy ops (saturate/factor/triangular/resolvent/eliminate) freeze the UI, no cancel | Perf/QoL | M | High | ✔ #139–#142 |
| **Q3** | Destructive actions confirm via a text-only toast that can't offer Undo (Undo exists) | QoL | S–M | High | ✔ #138 |
| **Q4** | `doDimension`'s count flashes 750 ms and never enters the results drawer | QoL | S | High | ✔ #138 |
| **Q5** | Duplicate `_fmtComplex`: one dead, the live one lost its null-guard | Dead code | S | High | ✔ |
| **X1** | Certified univalence for irrational-algebraic domains (`≈`→`=`) via RUR + interval Schur–Cohn | Extension | M | High | ✔ #146–#151 |
| **X2** | Null-QD classifier + mother-body/balayage skeleton (honest QD-vs-not-a-QD) | Extension | S–M | High | ○ |
| **X3** | Exact Richardson/harmonic moments + area of a solved QD (`≈`→`=`) | Extension | M | High | ○ |
| **X4** | General-degree rational-φ prove route (honest resolution of deferred Phase C) | Extension | L | Med-High | ○ |
| **X5** | Inverse arrow S(w)→quadrature data + exact-Schwarz hand-off to sibling apps | Extension | M | Med | ○ |
| **X6** | Hele-Shaw evolution with certified cusp times | Extension | L–XL | Med | ○ |
| **X7** | Real-radical ideal for honest real-dimension reasoning | Extension | L | Low-Med | ○ |
| **P1** | ✦ Prove recomputes the same grevlex Gröbner basis 2–3× per leaf × branches | Perf | M | High | ○ |
| **P2** | Canvas `render()` tears down + rebuilds every card's DOM on every mutation | Perf | M | High/Med | ○ |
| **P3** | Buchberger/FGLM inner-loop data-structure + swell (profile-gated) | Perf | L | Med/Low | ○ |
| **T1** | Lift the honest-labeling verdict functions out of the closure + behavioral tests | Code-qual | M | High | ✔ #143–#145 |
| **T2** | Define-substitution differential harness (guards the C2 bug class) | Testing | M | High | ○ |
| **T3** | Behavioral test for the RCTD external-count `rigor:'unknown'` label | Testing | S | Med-High | ○ |
| **T4** | Weighted-QD export completeness (`weight`/`hData` never populated) | Interop | M | Med | ○ |
| **T5** | Route the 3 open-coded `katex.render` sites through `RL.render` | Code-qual | S | High | ○ |
| **U1** | Worked example / guided manual derivation + break up the wall-of-text guide | Onboarding | M–L | Med | ○ |
| **U2** | "No solve" canvas state is a soft dead-end; offer Prove-from-data | QoL | S | High | ○ |
| **U3** | Pinch-to-zoom on the canvas (touch) | QoL | M | Med-Low | ○ |
| — | `@cas/ui` seed (toast/complex-format/blob-download dup) — **defer** | Arch | M | Med | ○ |
| — | **Do NOT** split `algebra-store.mjs` — cohesive + unit-tested | Arch | — | High | ○ |

---

## Tier 0 — Honest-labeling correctness (verified; all small fixes)

> **Status (2026-07-23): all of Tier 0 (C1–C7) is IMPLEMENTED** on branch
> `fix/qd-algebra-honest-labeling-tier0`. C2/C3/C5 ship with behavioral tests (mutation-verified —
> reverting each fix fails exactly its test); C1/C4/C6/C7 are label/toast changes verified via the full
> green gate + a clean production-build load. Full QD suite 797 tests, interchange 30, CD 648,
> correspondences 85, build green.

These are the worst bug class in this project and each is a targeted fix. **C1–C3, C5, C7 personally
verified at source.**

### C1 — Verdict card renders a proven `≥` lower bound with a `≤` badge  ✔
`renderProofVerdict` builds the always-shown verdict payload without the bound direction —
`const vSet = { text, assumptions, rigor: pr.rigor }` at [`algebra-ui.mjs:3677`](../../apps/quadrature-domains/app/algebra/algebra-ui.mjs) — then `showResult(vSet)` at `:3711`. A truncated proof-tree walk returns `rigor:'bound', bound:'≥'` (`prove-plan.mjs:400,448`), but `rigorMeta('bound', undefined)` defaults to the `≤` glyph (`algebra-canvas.mjs:907-909`). So a positive-dimensional multi-QD result whose body text says **"the count is a LOWER BOUND"** wears a **`≤`** pill — the opposite direction. The developers *knew*: the "Show exact boundary curve" action callback threads `bound: pr.bound` with a comment saying the default `≤` "would state the opposite of the proof" (`:3640-3642`), and Export-proof includes it (`:3662`) — only the main card was missed. Clicking the action then re-shows the same proof with a `≥` pill: two contradictory badges.
- **Fix:** add `bound: pr.bound` to `vSet` at `:3677`. **Effort S · Confidence High.**
- Untested: `algebra-rigor-badge.test.ts:57-65` tests `rigorMeta('bound','≥')` in isolation; nothing asserts the UI threads `bound`.

### C2 — Derivation transcript + SymPy export use raw `QC.conjVarName` (the census bug, unswept)  ✔
Direct follow-on to the census fix just merged (c753e15/#135). `derivationSteps`' assume-real/imaginary replay uses `const c = QC.conjVarName(v)` at [`algebra-store.mjs:2720`](../../apps/quadrature-domains/app/algebra/algebra-store.mjs), and `_subsForRepro` (the reproducible-SymPy builder) uses `cj: (v) => QC.conjVarName(v)` at `:2746`. Both use the **raw** bar-toggle table. But the *actual* reductions use the overlay-aware `_conjName` (`:791` `assumeReal`, `:813` `assumeImaginary`; `_conjName` consults `substConj` at `:263-267`). For a **defined** symbol `t` (registered via "Define substitution"), `QC.conjVarName('t') = 't'` unchanged, so the replay hits `if (c === v) continue` and folds *nothing* — the transcript's final step ≠ the node polynomial, and the exported SymPy `SUBS` dict is empty. `derivationSteps` promises "the final step provably equals this node's polynomial" (`:2679`); `sympyDerivation` is advertised as reproducible (`:2775`). Both are silently false for defined symbols.
- **Fix:** use `_conjName` / `conjNameOf` at `:2720` and `:2746`. **Effort S · Confidence High.** Pair with **T2**.
- Untested: `algebra-store.test.js:435-441,1351-1355` only ever assume `z1` (built-in), which the raw table handles.

### C3 — Moment route stamps "No genuine QD" as certified `=` even when Schur–Cohn was unreliable  ✔
`assembleMomentVerdict` sets `const rigor = D === 0 ? 'exact' : …` **unconditionally** for the empty case at [`prove-plan.mjs:748`](../../apps/quadrature-domains/app/algebra/prove-plan.mjs). The sibling rational route gates the identical case on filter reliability — `D === 0 ? (allExactFilter ? 'exact' : 'estimate')` at `:880` (and triangle `:996`; general route `:275`). The moment route is the lone exception. `momentCertifyLeaf` sets `allExact=false` on an unreliable Schur–Cohn (`:697`) but still folds on `u.inside` with no numeric fallback (`:699`), where `inside` is then the raw, unreliable inertia count (`sym-core.mjs:4705-4706`). A wrongly-folded last candidate ⇒ empty genuine set ⇒ **"No quadrature domain exists" badged green `=`** — and the same call feeds `allExactFilter` into `rigorProvenance` (`:750`), so the "why this rigor" audit shows a ✗ on the univalence line *under* the `=` badge.
- **Fix:** change `:748` to `D === 0 ? (allExactFilter ? 'exact' : 'estimate')`, matching the siblings. **Effort S · Confidence High** (inconsistency); Med on reachability (needs a degenerate order-≥3 Schur–Cohn stratum).
- Untested: `prove-plan.test.ts:511-516` exercises moment `D===0` only with `allExact:true`.

### C4 — msolve export of a conjugate-model column lacks the Maple real-count warning  ○
The Maple export prepends a loud warning when a column carries complex ℚ(i) (conjugate-model) coefficients, because Maple's real triangularization counts a *different* quantity than the QD real count (`algebra-store.mjs:2622-2628`, toast `algebra-ui.mjs:2181`). The msolve path has the identical hazard — `systemToMsolve` maps ℚ(i)→ℚ by making `i` a variable with `i²+1` appended (`cas-export.mjs:285`) — but `msolveColumn` (`algebra-store.mjs:2647-2652`) and `copyMsolve` (`algebra-ui.mjs:2186-2194`) emit **no** warning. Worse, `i²+1=0` has no real root, so msolve's real-solution output for such a column is empty/degenerate rather than the QD count. A user trusting the Maple warning assumes parity.
- **Fix:** reuse `_columnHasComplexCoeffs` (the F5 detector `:2636`) to prepend a `#`-comment warning + toast, and a guard test. **Effort S · Confidence High.**

### C5 — ADR-0006 convention tag is decorative: no π/2πi guard on import  ✔
The interchange contract is "canonical on the wire" (`packages/interchange/src/schema.ts:35`), and ADR-0006 exists so a π/2πi mis-conversion is *loud, not silent*. But `isConventions` accepts **any** of the four `{standard,normalized}×{standard,suppressed-2pii}` combos — well-formedness, not canonicality — at [`packages/interchange/src/validate.ts:74-80`](../../packages/interchange/src/validate.ts), and the CD consumer never reads `payload.conventions` (`apps/complex-dynamics/src/interchange/importMap.ts:77-90`). QD always emits `CANONICAL` and φ is convention-neutral, so there is **no live bug** — but the sole guardrail against the two apps' differing area/contour conventions is inert. A hand-edited or future non-canonical payload crosses silently.
- **Fix:** `validateEnvelope` rejects a non-canonical wire payload (throw when `area!=="standard" || contour!=="standard"`), plus an accept/reject test. **Effort S · Confidence High.**
- Untested: `interchange.test.ts:76-80` tests a *missing* tag; no *non-canonical* case.

### C6 — Bifurcation labels the reim real-count `=`; classify labels the same quantity `≤`  ✔(basis)
`doBifurcation` renders each interval's real-solution count with `rigor: bifPartial ? 'partial' : 'exact'` (`algebra-ui.mjs:3816`). The identical reim real-solution-count quantity is deliberately labeled `'bound'` (→ `≤`) by `classifyRigor`, whose comment states it is "a rigorous UPPER BOUND on #QD" because it counts non-univalent maps, gauge copies, and the `{|z_j|=1}` stratum ([`algebra-ui.mjs:3116-3123`](../../apps/quadrature-domains/app/algebra/algebra-ui.mjs), verified). The bifurcation card carries neither the `≤` badge nor the "run Certify univalence for the genuine count" caveat classify appends (`:3167`). A green `=` beside "real-solution count = 1 on (0,∞)" reads as a certified unique QD across the range.
- **Fix:** map the clean bifurcation count to `'bound'` and append the upper-bound caveat, mirroring classify. **Effort S–M · Confidence Med.** (Bifurcation *does* correctly downgrade to `'partial'` on cross-check failure — only the certified path mislabels.)

### C7 — `specializationLedger` swallows errors — a restricting constraint can silently drop  ✔
The ledger scan that records active univalence constraints (so "a restricted count never reads as the full one", its own comment at `:3104`) is wrapped in `try { … } catch (e) { /* ignore */ }` at [`algebra-ui.mjs:3106-3112`](../../apps/quadrature-domains/app/algebra/algebra-ui.mjs). A throw inside the `store.list()`/filter/map chain silently drops the constraint line, so a count restricted to (say) convex domains could render with no caveat — reading as the general count. No behavioral test covers `specializationLedger` (see **T1**).
- **Fix:** narrow or remove the swallow (let a genuine failure surface, or log), and cover with a behavioral test. **Effort S · Confidence Med** (the swallow is real and verified; the throw path is currently only hypothetical — worth a defensive test regardless).

---

## Tier 1 — High-value quality-of-life & robustness

### Q1 — Multi-domain verdict locks inspect/plot/export to 1 of N certified domains  ✔  *(also honest-labeling)*
When ✦ Prove finds N genuine QDs, the verdict card's plot, "Show exact boundary curve", and "View in the QD plot" are all hard-wired to `distinct[0]`/`genuine[0]` (`algebra-ui.mjs:3634,3637,3684`; captions "showing 1 of N" `:3688,3698,3707`). The engine returns every map (`pr.distinctPhis`, `pr.genuine`), yet the user can only ever see, exactly reconstruct, or hand off domain #0 — so a certified *count* can be spot-checked for only one of the N it claims. Add a `◀ k/N ▶` stepper re-targeting the plot and all three actions.
- **Effort M · Confidence High.** Honest-labeling: strengthens (the certified count becomes verifiable across every domain).

### Q2 — Heavy ops freeze the UI thread with no progress or cancel  ○  *(merges perf + UX findings)*
`saturate`, node/column `factor`, pairwise `eliminate` (resultant/elimination-ideal), Wu `triangularize`, and `resolvent` run **synchronously on the main thread** — `runJob` has no worker kind for any (`sym-core.mjs:5199-5296`; store calls `algebra-store.mjs:2879/1723/1977/2297/1495`). `saturateMobius` builds `∏(1−z̄ₐz_b)` over all p² pole pairs (degree `2p²`; p=3 ⇒ degree-18) then runs an elimination Gröbner — on the UI thread, and it is on the ✦ Prove **prelude** (`algebra-ui.mjs:3338`), so it freezes before the async plan starts. Worse, `doSaturate`/`doTriangular`/`doFactor` never call `setBusy`, so there is no spinner, no cancel, no progress; `doResolvent` paints a label but still runs sync with a cosmetic Cancel. Separately, even the async ops give **no canvas-surface** busy signal — `setBusy` touches only the sidebar (`:2840-2853`), while the result lands on the static canvas.
- **Fix:** add `runJob` kinds + async store wrappers (modeled on `groebnerAsync`) for the five ops; add a `.is-busy` overlay on `#algebra-graph`. **Effort M · Confidence High.** Honest-labeling: none (worker move is byte-identical).

### Q3 — Destructive actions confirm via a text-only toast that can't offer Undo  ○
`deleteNode` removes a node *and all its descendants* and reports `toast('Deleted N node(s)')`, but `_showToast` renders only `textContent` and structurally cannot host a button (`qol.mjs:244-281`). Undo (Ctrl+Z) shipped but is invisible exactly when a user just destroyed a subtree. Extend the toast with an optional action button and wire `store.undo()` onto the ~3 destructive toasts (delete node, delete branch, Load-DAG replace).
- **Effort S–M · Confidence High.**

### Q4 — `doDimension`'s count flashes 750 ms and never enters the drawer  ○
"Dimension / count" reports via a bare `toast()` with no `showResult` — the lone analysis-op holdout (`algebra-ui.mjs:3910-3925`). A default toast is 750 ms (`qol.mjs:254`), too short to read a count plus variable tally, and the positive-dimensional branch carries an actionable hint ("assume more variables real or add constraints") that vanishes. Route it through `showResult` like every sibling (`:3189,3436,3609,…`).
- **Effort S · Confidence High.** The "computed-then-discarded" pattern the review set out to kill, surviving in one spot.

### Q5 — Duplicate `_fmtComplex`: one dead, the live one lost its null-guard  ✔
Two `_fmtComplex` in the same closure: `:932` (`if (!v) return '?'`, 1e-6 rounding) and `:3845` (no null-guard, 1e-10/1e-8). JS hoisting makes `:3845` win for all five call sites, so `:932` is dead and the live path would throw on a null value instead of yielding `'?'`. Also genuinely dead: `_factorable(id)` at `:2548` (defined, never called). Consolidate to one module-scope function with the intended guard/rounding, add a unit test, delete `_factorable`.
- **Effort S · Confidence High.** Not the previously-removed dead code — a distinct, still-present item.

---

## Tier 2 — Extensions (widen the certified `=` frontier / new capability)

Ranked by leverage; **X1 + X2 are the two that most serve the honest-labeling contract**, and both are cheap because the exact machinery already exists and is merely under-consumed.

### X1 — Certified univalence for irrational-algebraic domains (`≈`→`=`)  ○
Today the genuine-QD `=` badge is earned only when the solution is **rational** (`verifySolutionExact` snaps to ℚ(i), `qd-equations.mjs:589-628`); an irrational algebraic solution degrades the whole verdict to `estimate` and runs the Schur–Cohn fold at a *float approximation* of the true root (`prove-plan.mjs:203,276`). But the exact ingredients are computed on this very path and then discarded: `solveRealCertified` returns exact isolating boxes + a verified RUR (`sym-core.mjs:1943`), and `_intervalPolyEval` gives rigorous interval enclosures (`:1917`). Run the univalence test *at the algebraic root* via the RUR + interval Horner so irrational QDs earn `=`. The module doc names this "the remaining refinement" (`docs/ALGEBRA_MODULE.md:245`).
- **Effort M · Confidence High.** Honest-labeling: the single highest-value strengthening — converts falsely-`≈` verdicts to genuine `=` with an interval certificate. **Top extension.**

### X2 — Null-QD classifier + mother-body / balayage skeleton  ○
`boundaryCurve` already detects rational Schwarz (`deg_{w̄}Q = 1` ⇒ genuine QD) vs algebraic (`schwarz:null`, e.g. the ellipse — algebraic-Schwarz but *not* a QD) at `qd-equations.mjs:1024-1034`, but the UI treats the algebraic case as a throwaway string (`algebra-ui.mjs:3639`) with no honest "not a classical QD" label. Elevate it to a first-class classification, and for the algebraic case compute the exact branch points of `S` (roots of `disc_{w̄}Q` = mother-body/skeleton vertices) using shipped primitives (`discriminant`, `realRootIsolate`).
- **Effort S–M · Confidence High.** Honest-labeling: directly strengthens the `=`/not-a-QD line (prevents the ellipse-type false positive).

### X3 — Exact Richardson/harmonic moments + area of a solved QD (`≈`→`=`)  ○
Area moments `M_k = ∬ wᵏ dA` and area `M_0` are computed only by a numeric boundary sweep (`observables.mjs:14-38`). For a solved QD with rational `S(w)` they are exact ℚ(i) residue sums; the ingredients (`RatFn`, `QE.boundaryCurve`'s `schwarz`) are in hand. These are *the* Hele-Shaw/Richardson invariants and the foundation for X6.
- **Effort M · Confidence High.** Honest-labeling: strengthens (≈ readouts → =).

### X4 — General-degree rational-φ prove route (honest resolution of the deferred Phase C)  ○
`rationalMomentSystem` throws for any degree ≠ 2 and any off-real-axis data (`qd-equations.mjs:879,873`). The Phase C post-mortem established the blanket symmetry theorem is *false* (off-slice conjugate-pair QDs exist), so slice-completion can't reach `=` — but the moment/residue formulation *can* and is proven for degree 2. Generalize it to rational φ of arbitrary degree n + complex nodes (reim-split) so multi-node QDs earn a certified existence/uniqueness count.
- **Effort L · Confidence Med-High.** Honest-labeling: extends certified `=` to multi-node QDs now falling to `≈`/pin-split. Pairs with X1.

### X5 — Inverse arrow S(w)→quadrature data + exact-Schwarz hand-off  ○
The trinity's Schwarz→data arrow is missing: the exact rational `S(w)` `boundaryCurve` produces is used only for a LaTeX string (`qd-equations.mjs:1033`). Recover nodes (poles of `S` inside Ω via denominator factor + root isolation) and weights (exact residues), and ship the exact `S(w)` over `@cas/interchange` to the Schwarz-dynamics/CD tabs, which rebuild it numerically (`schwarz-ui.mjs:1146`). Distinct from `shapeFromMoments` (moments→nodes) and `phiFromAlgebraSolution` (coeffs→map).
- **Effort M · Confidence Med.**

### X6 — Hele-Shaw / Laplacian-growth evolution with certified cusp times  ○
The largest genuinely-new capability: polynomial-map time evolution `φ_t(z)` with conserved Richardson moments (X3) and the **cusp/blow-up time** as an exact root of a resultant in ℚ(i)[t] — a *certified* `=`/`≤` where the field reports floats. The one new primitive is an exact power-series/ODE-coefficient integrator; the cusp time reuses `resultant`/`discriminant`/`realRootIsolate`.
- **Effort L–XL · Confidence Med.** Honest-labeling discipline required: moments + cusp time are `=`; any numerically-integrated intermediate *shape* is `≈` and must be labeled so. Minimal slice: the Polubarinova–Galin polynomial-map case.

### X7 — Real-radical ideal for honest real-dimension reasoning  ○
The engine has only zero-dimensional radical (`radicalZeroDim`, `sym-core.mjs:1783`). A real-radical (real Nullstellensatz / Positivstellensatz, building on the shipped `verifySOS` at `:4527`) would let positive-dimensional real verdicts report a certified real dimension instead of a generic pin/split fallback. On the roadmap (`docs/ALGEBRA_EXTENSIONS.md:169`).
- **Effort L · Confidence Low-Med** (genuinely hard; minimal slice = hypersurface/curve case).

---

## Tier 3 — Performance & scalability

The engine core is mature (packed Int32Array Buchberger kernel with Gebauer–Möller + sugar + content removal). Remaining leverage is at the **worker boundary and orchestration/render layers**, not inside Buchberger. **Q2 above is the top performance item (UI-thread freezes).**

### P1 — ✦ Prove recomputes the same grevlex Gröbner basis 2–3× per leaf × branches  ○
`analyzeLeaf` runs `classify()` → `solveCertified()` → (fallback) `solveNumeric()`, each a separate worker round-trip recomputing the grevlex Buchberger of the same reim ideal from scratch; `runProofTree` re-enters per branch (`prove-plan.mjs:323-347,420-441`). The engine *already accepts* a precomputed basis (`radicalZeroDim`/RUR read `input.G`; `solveZeroDim` docs `{G,order}`); the barrier is that `classify`'s `runJob` returns counts only, never the generators (`sym-core.mjs:5294`). Fuse classify+certified-solve into one worker op that computes the GB once, or have `classify` return the GB term-list to cache and pass as `{G,order}`. This is *not* the settled warm-start (that seeded the numeric eigenvalue solver).
- **Effort M · Confidence High.** A 2–3×·(branches) multiplier on the single most expensive step.

### P2 — Canvas `render()` rebuilds every card's DOM on every mutation  ○
`render()` removes all column elements and rebuilds every card (elements + toolbar + listeners) for the whole active track, not just the changed column (`algebra-canvas.mjs:465,479,353`); only KaTeX *typesetting* is cached. Since the store is append-only/immutable and `doAutoSolve` re-renders several times per op, an M-column derivation is ~O(N·M) DOM churn. Keep a `Map<id, cardEl>` and append only new columns.
- **Effort M · Confidence High** (it's unoptimized); **Med** on magnitude — likely <100 ms at typical sizes; **measure** card-build time on a 60+ node track before investing.

### P3 — Buchberger/FGLM inner-loop data structures + coefficient swell (profile-gated)  ○
Three real algorithmic-shape observations, each plausibly dominated by ℚ(i) BigInt arithmetic — **profile before investing**: (a) `_ppNormalForm` re-scans the whole dividend for its leading term each step (O(S·T); `sym-core.mjs:2745,2769`) — a monomial-ordered heap would make it O(log T); (b) Buchberger pair selection is a linear scan of the pair queue each step (`:2911`) — a sugar/lcm heap; (c) FGLM's dense ℚ(i) elimination has no content control / intermediate-swell mitigation (`:3427`). All exact-preserving; steer clear of the settled modular/CRT and F4/F5 directions.
- **Effort L · Confidence Med/Low.** Measure the `_ppLeading`-vs-arithmetic split and max BigInt digit length on a 3-pole reim system first.

---

## Tier 4 — Testing, code-quality & onboarding

### T1 — Lift the honest-labeling verdict functions to module scope + behavioral tests  ✔(motivation)
`classifyRigor` (which *decides* `'exact'/'bound'/'unknown'`), `specializationLedger`, `scopeCaveat`, `sliceCaveat`, `sliceLabels`, `posDimDesc`, `droppedNote`, `scopeNote` are trapped in the 4200-line `installAlgebra` closure (`algebra-ui.mjs:2984-3124`) and have **no behavioral test**. Because they can't be invoked without a full mount, 11 of ~20 algebra test files `readFileSync` the UI and assert against its *source syntax* (e.g. `algebra-scope-disclosure.test.ts:73` matches a regex on the function body) — a test that passes if the source merely *contains* the right-looking text and can't catch a wrong returned string. Lift them to module scope on the proven `QD_UI` pattern (injecting `store`/`latexPlain`), staged with thin in-closure wrappers (zero call-site churn), and replace the source-regex tests with behavioral ones. This *strengthens* the paramount value and lets 11 files shed brittle `bodyOf` assertions; it also surfaces **C7**.
- **Effort M · Confidence High.** Low-risk if staged; do **not** attempt a wholesale split of `installAlgebra`.

### T2 — Define-substitution differential harness  ○
The `substConj` overlay drives conjugation, assume-real/imaginary, pin-both, gauge-eliminate, census, and both reproduction paths, but every store-level test seeds only the built-in `z1/zb1` pair — which the raw bar-toggle already handles — so the overlay branch is exercised only where it coincides with the non-overlay path. C2 is one escapee. A single seeded-`define-subst` fixture (define `t := …`, then conjugate / assume-`t`-real / pin-`t` / `derivationSteps` / `sympyDerivation`, asserting exact polynomials + reproduction) guards the whole family against the recurring raw-table-vs-overlay regression.
- **Effort M · Confidence High.** The census bug shipped precisely because this harness didn't exist.

### T3 — Behavioral test for the RCTD external-count `rigor:'unknown'` label  ○
`doImportRCTD` correctly labels the pasted-Maple count `rigor:'unknown'`, "not verified in-app" (`algebra-ui.mjs:2232`) — the single verdict sourced from an unverified external tool — but the verdict-labeling scanner only checks that a `rigor:` key is *present* and that ≤1 site is *unconditionally* `'exact'` (`algebra-verdict-labeling.test.ts:106-117`). A refactor to `'estimate'` or a *conditional* `'exact'` slips through. Add a behavioral test importing a fixture RCTD and asserting `rigor==='unknown'`.
- **Effort S · Confidence Med-High.**

### T4 — Weighted-QD export completeness  ○
The `QuadratureDomain` schema carries `weight?` and `hData?` (`packages/interchange/src/schema.ts:73-80`), but `buildExportEnvelope` sets only `{phi, bounded, conventions}` (`schwarz-export.mjs:49`) — every export is implicitly unweighted with no h. Safety rests on the *asserted* claim that weighted/LQD φ return `null` from the shape-only `phiToMapSpec`, untested for the weighted cases. Decide the contract (refuse vs. tag `weight`) and add a producer test per weighted family.
- **Effort M · Confidence Med** (the lossy omission is certain; whether a weighted φ can actually slip the shape gates was not fully traced).

### T5 — Route the 3 open-coded `katex.render` sites through `RL.render`  ○
`QD.RiemannLatex.render` is the designated shared KaTeX helper ("one helper so … don't each carry their own copy", `riemann-latex.mjs:357`), but three algebra-ui sites (`:1623,1673,3881`) re-implement the `typeof katex` + try/catch dance inline, so a future change to the katex-absent/parse-error fallback policy silently misses them. Add an optional `fallbackText` arg to `RL.render` and swap the three sites.
- **Effort S · Confidence High.**

### U1 — Worked example / guided derivation + restructure the guide  ○
The workspace lands pre-seeded and ✦ Prove is one click, but a newcomer wanting to *drive the manual toolkit* has no worked example or sample derivation, and the only prose guide (`algebra.help`) is a ~1000-char single paragraph (`ui-strings.mjs:549`). Add a "Load a worked example" affordance (e.g. a step-through cardioid derivation) and/or break the guide into scannable sections. (The ? shortcuts overlay shipped; this is the teaching gap it didn't address.)
- **Effort M–L · Confidence Med** (the gap is real; the remedy is a design call).

### U2 — "No solve" canvas state is a soft dead-end  ○
When `activeEnv === null` (unbounded/failed solve), the canvas empty-state's "Generate / re-seed" button calls `seedFromCurrent`, which bails to a faraway sidebar status line and returns `false` — the canvas doesn't change (`algebra-canvas.mjs:880` → `algebra-ui.mjs:1222`), and the empty-state text unconditionally claims it will generate from "the current bounded solve" even when there is none. ✦ Prove already supports proving *from data* (`fromData = !activeEnv`, `:3312`) but nothing surfaces it here. Branch the empty state on `!activeEnv`; add a QD-tab link + "Prove from data".
- **Effort S · Confidence High.**

### U3 — Pinch-to-zoom on the canvas  ○
Canvas pan works on touch (Pointer Events, `algebra-canvas.mjs:686`) but zoom is bound only to Ctrl/Cmd+wheel (`:712`), so a wide DAG can't be zoomed on a tablet. `zoomAt(zoom,x,y)` exists; add a two-pointer pinch handler. (The team invested in 360px narrow-viewport correctness, so touch is in scope.)
- **Effort M · Confidence Med-Low** (desktop-first tool).

### Architecture notes (not action items)
- **`@cas/ui` seed — defer.** Toast, complex-`a±bi` formatting, and blob-download are each duplicated across QD/CD and within QD, and the ADR-0007 second-consumer trigger is now met for toast + formatting. But the two toast/format APIs differ in shape (reconciling them is real work) and the payoff is trivial helpers with zero correctness stakes. **Defer** unless a third consumer or a shared-nav header forces it; blob-download + complex-format would be the cleanest first tenants.
- **Do NOT split `algebra-store.mjs`.** Despite 2999 lines, it is genuinely DOM-free, cohesive (one derivation-DAG model), directly unit-tested by dozens of `qd-*.test.ts`, and its provenance is already extracted to `PROV_STORE`. Its ~150 operations legitimately share private state; a split adds indirection and risks the most correctness-critical app code (ADR-0008 warns against exactly this). The size imposes no testing tax because behavior is reachable — unlike the UI file (see T1).

---

## Cross-lane corroboration (independent agents agreeing)
- **Q2** was surfaced by *both* the performance lane (ops run sync, no `runJob` kind) and the UX lane (canvas has no busy signal) — same failure, two angles.
- **C2 / T2** connect directly to the census fix (#135): the conjugate-overlay bug class the testing lane found unswept in `derivationSteps`/`sympyDerivation` is the same one just fixed in the census.
- **C7 / T1**: the code-quality lane's push to lift the verdict functions independently surfaced the honest-labeling hazard (the swallowed constraint-ledger error) that the correctness lens cares about most.
- The recurring **"computed-then-discarded"** motif (Q1 extra N−1 domains, Q4 dimension count) is the same pattern the shipped results-drawer work set out to kill, surviving in the spots that rework didn't reach.

## Suggested sequencing
1. **Tier 0 as one small honest-labeling pass** (C1, C2, C3, C4, C5, C6, C7 — all S/S–M) plus **Q5** (dead code) and the **T2/T3** guards. This is the highest value-per-risk: it closes verified badge-direction and mislabel defects, sweeps the census bug class, and enforces the π/2πi guardrail. C1 and C2 are near-immediate.
2. **Q1–Q4 + Q2** as a QoL/robustness pass (multi-domain stepper, worker-offload + busy, Undo-in-toast, dimension-in-drawer).
3. **X1 then X2** — the two honest-labeling extensions whose machinery already exists — as the first capability increment; **T1** (lift verdict fns) alongside to make the widened `=` decisions behaviorally testable.
4. **X3–X6 / P1 / P3** as larger, separately-scoped efforts, each measured/profiled first where noted.

*Investigation method: six parallel `general-purpose` agents (math extensions · UX/QoL · correctness/rigor · performance · code-quality/architecture · testing/interop), each grounded against the docs trail and the already-shipped list, returning structured file:line-cited findings. Tier-0 and the ✔ items re-verified at source by the synthesizing session.*

---

## Future directions (post-implementation, 2026-07-24)

> Written **after** implementing Tier 0 (#137), Tier 1 QoL Q1–Q5 (#138), the full Q2 worker offload —
> all five heavy ops — (saturate #139, triangularize+resolvent #140, eliminate #141, factor #142), and
> U2. These directions are grounded in what the *implementation itself* surfaced, not only the original
> investigation — so priorities have shifted from the tier order above.

### 1. Pay down the verdict-function testability debt (T1) — now proven costly, do first
T1 began as a Tier-4 nicety; the implementation promoted it. In #142 a one-word rename
(`applyFactor` → `applyFactorAsync`) broke `algebra-verdict-labeling.test.ts`, which asserts against
**literal source tokens**, and that brittleness recurred across Q2. The honest-labeling decision functions
(`classifyRigor`, `specializationLedger`, `scopeCaveat`, `sliceCaveat`, `sliceLabels`, `posDimDesc`,
`droppedNote`, `scopeNote`) are trapped in the 4200-line `installAlgebra` closure and guarded only by
regex. Lifting them to module scope on the proven `QD_UI` pattern makes the `=`/`≤`/`≈` decisions
**behaviorally** testable (the paramount value, currently untested), kills the rename-brittleness, and
unblocks safe refactoring of that file. Highest-leverage code-health item, now with direct evidence.
**✅ SHIPPED (T1, PRs #143–#145):** all nine — `classifyRigor`, `posDimDesc`, `scopeNote`, `droppedNote`,
`latexPlain`, `sliceLabels`, `sliceCaveat`, `scopeCaveat`, `specializationLedger` — are now module-scope on
`QD_UI` and behaviourally pinned in `vitest/algebra-verdict-rigor.test.ts`.

### 2. The honest-labeling frontier — X1 + X2 (highest capability value)
Both most advance the paramount value AND reuse machinery already shipped:
- **X1 — certified univalence for irrational-algebraic domains (`≈`→`=`). ✅ SHIPPED (PRs #146–#151).** The
  RUR + interval-Horner enclosures — already computed on the prove path — now drive the fold (interval
  Schur–Cohn over φ′ enclosed at the root's isolating box) and the boundary (an exact `count === 0` over an
  augmented `minPoly(t)` system) *at the true algebraic root*, so an irrational-algebraic QD earns a certified
  `=`, labeled honestly ("interval Schur–Cohn fold + augmented boundary count over ℚ(i)"). Design record:
  [`X1_BOUNDARY.md`](X1_BOUNDARY.md).
- **X2 — null-QD classifier + mother-body skeleton.** `boundaryCurve` already detects the algebraic-Schwarz
  (`schwarz:null`, e.g. the ellipse) case but discards it as a string; `discriminant` + `realRootIsolate`
  are shipped. Turns an ellipse-type false positive into an honest "not a classical QD."

### 3. Performance — P1 is now tractable; tune what was left heuristic
- **P1 — ✦ Prove recomputes the grevlex Gröbner basis 2–3× per leaf × branches.** Q2 mapped the worker
  boundary thoroughly, so threading the precomputed `{G, order}` across classify→solve is now a natural
  win (the engine already accepts it; the only barrier is `classify`'s runJob returning counts, not
  generators).
- **Tune `FACTOR_AUTO_CAP`** (`algebra-ui.mjs`, set to 120 terms in #142 **without profiling**). Measure
  factor latency vs. poly size and tune it, or replace the cap with a fully-lazy async badge. The
  deliberate behaviour change (a very large current-column system no longer auto-offers "Split into cases"
  on render) deserves an in-browser check.
- **P3** (Buchberger/FGLM inner-loop structures) stays **profile-first** — ℚ(i) BigInt arithmetic likely
  dominates.

### 4. New mathematics (the QD trinity) — longer horizon
**X3** exact Richardson/harmonic moments (`≈`→`=`, foundation for X6) → **X6** Hele-Shaw evolution with
certified cusp times (headline new math) · **X4** general-degree rational prove route (the honest
resolution of the deferred Phase C) · **X5** inverse arrow `S(w)`→quadrature data + exact-Schwarz hand-off
to the sibling apps · **X7** real-radical ideals.

### 5. Verification infrastructure — a UI-flow test harness
Across this round the UI honest-labeling flows (the C1/C6 badges, the Q2 spinners, the factor cap) could
not be browser-verified without a manual seed (now eased by U2) and there is **no headless harness that
drives the actual algebra handlers** — the source-scans are a poor substitute (see §1). A small
mounted/jsdom or Playwright harness would let the badges *and* the offload spinners be tested behaviorally.

### Reusable assets this round produced
The `plan → worker → finish` offload pattern and the `vitest/algebra-offload-kinds.test.ts` **differential
harness** (`runJob(kind)` === the inline sym-core call) are proven templates for any future heavy sync op
(or the sibling apps).

### Standing "don'ts" (do not re-propose)
Defer the `@cas/ui` seed (real duplication, trivial payoff); do **not** split `algebra-store.mjs`
(cohesive, DOM-free, unit-tested).

**Status (updated 2026-07-25):** T1 (§1) SHIPPED (#143–#145) and X1 (§2) SHIPPED (#146–#151) — an
irrational-algebraic QD now earns a certified `=`, its univalence checked at the true algebraic root. Earlier
this round: Tier-0 honest-labeling (C1–C7, #137), Tier-1 QoL (Q1/Q3/Q4/Q5, #138), and the Q2 heavy-op worker
offload (#139–#142). **Recommended next:** X2 (§2 — the null-QD classifier, prevents the ellipse-type false
positive) and P1 (§3 — the ✦ Prove Gröbner recompute, now tractable post-Q2).
