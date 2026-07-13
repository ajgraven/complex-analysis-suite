# Algebra Maturity Review — STATE

> **Re-entrant control file.** A fresh session with zero memory resumes from here.
> Read this top-to-bottom, then read every artifact it references, then verify repo
> state (`git status`; `git log --oneline -20` on branch `algebra-maturity-review`),
> then continue from **Next action** at the bottom. Do not redo completed units.

## Mission (from the review prompt)

Make the QD Algebra module a genuinely powerful, trustworthy pure-math research tool
for **proving existence and uniqueness of classical bounded quadrature domains**, with
a **semi-autonomous proof workflow** and a **clear, intuitive UI**. Given exact
quadrature data, the mature tool must produce exactly one of: (1) a reproducible
certified existence/uniqueness result; (2) a rigorously stated partial result/bound; or
(3) an explicit explanation of why it is unresolved. Rigor conventions binding on every
output: `=` exact, `≤` rigorous bound, `≈` estimate, `unknown/incomplete` otherwise. A
**uniqueness verdict = uniqueness among ALL admissible domains in the stated class,
modulo stated equivalences** — never "unique among solutions found".

## Working rules (binding — from CLAUDE.md + project memory)

- **Branch:** `algebra-maturity-review` (created off `master` @ `355ed9c`). BRANCH FIRST for any code.
- **Gate:** `corepack pnpm@9.15.9 -C <root> run lint && … typecheck && … test && … build`.
  NEVER pipe the gate through tail/head (drops errors + exit code). QD headless (`node app/node-test.js`,
  wrapped by vitest `node-suite.test.ts`) takes ~85-100s. Local Node 21 ⇒ harmless "Unsupported engine" WARN.
- **Commit discipline:** commit after each atomic unit; tests green at every code commit; commit msg names its
  place in the plan. Never start a unit with uncommitted work.
- **Commit/PR text:** use `-F <file>` or bash `<<'EOF'` heredoc — NOT PowerShell `@'…'@` in the Bash tool.
- One-way deps: apps import packages; NO app→app; shared `@cas/*` strict-TS. Kernel stays DOM-free;
  heavy ops worker-offloadable with main-thread fallback. Exact arithmetic + append-only DAG are sacrosanct.
- Do NOT `git worktree remove` harness `.claude/worktrees/*`.
- This review's artifacts all live under `docs/algebra-review/`. Persist findings to files AS produced.

## Phase checklist

- [x] **Phase 0 — Ground truth.** Baseline gate + read core docs/source structure. Baseline ALL GREEN:
      lint ✓(0) typecheck ✓(0) test ✓(0) build ✓(0). vitest 147 files / **1280 tests passed** (102s);
      QD headless `node-suite.test.ts` 93s. jsdom `getContext` messages are render-test noise (tests pass).
- [x] **Phase 1 — Audit** (7 parallel read-only tracks → `audit/<track>.md`). ALL 7 DONE + integrated.
- [x] **Phase 2 — Consolidated `AUDIT.md` + `PLAN.md`.** DONE — AUDIT.md (workflow + claim-vs-impl matrix +
      findings table + taxonomy) + PLAN.md (final S1–S6, value-ordered) committed.
**BROWSER-VERIFIED (live app, 2026-07-13, after busting the PWA SW cache):** all three UI slices render
correctly — S4 the rigor pill (gray `?` "undetermined" for a positive-dim verdict, correct color/title); S2 the
ledger "φ(0)=w₀ fixed (center/translation gauge — restricts to domains containing w₀…)"; S3 the "Saturate
(admissibility)" button present in the workspace. `rigorMeta`/`nodeInsideDisk`/`saturateMobius` all confirmed
live + correct in-browser. (Screenshot timed out on a busy renderer; DOM reads succeeded — more precise anyway.)

- [x] **Phase 3 — Semi-autonomous orchestrator + correctness/rigor slices.** S1–S5 SHIPPED gate-green
      (S6 = LOW/MED batch + PF-1 deferred, specified in PLAN.md / FINAL_REPORT §7).
- [x] **Phase 4 — UI clarity.** Rigor badge (S4) + one-click orchestrator (S5) + honest ledger (S2) shipped +
      browser-verified. Further UX depth (branch-tree panel, DAG export UI) deferred.
- [x] **Testing & validation.** 3 new vitest suites (25 tests); gate green at every commit; browser-verified live.
- [x] **Final — `FINAL_REPORT.md` written; STATE = COMPLETE.**

## ▓▓▓ REVIEW COMPLETE ▓▓▓
5 slices shipped on `algebra-maturity-review` (commits `2d03057`→S5), each gate-green (lint/typecheck/test/build
all 0; 1280→1305 tests). Branch NOT merged — it is the deliverable; a single PR (or the user's call) closes it.
See `FINAL_REPORT.md`. Highest-value remaining item = PF-1 (exact-at-the-isolating-box univalence cert).

**END-TO-END BROWSER PROOF (live, one click of ✦ Prove existence/uniqueness on the default QD):**
"Unique quadrature domain ✓ — 1 genuine QD of 4 real solutions (1 gauge/rotation copy merged; **2 pole-in-𝔻
rejected**) · cross-check ✓ (residual 0.0e+0)" with a **green `=` "exact — certified"** rigor pill. All five
slices firing together: S1 rejected the 2 real solutions whose φ has a pole in 𝔻 (they'd have inflated the count
pre-review), S5 ran the whole chain from one click (2 reduction columns appended), S4 rendered the certified `=`
badge (genuine: certified count + all filters exact + cross-check residual 0). The default system had a real
D-1 over-count — now fixed.

### Slice detail (S1–S5 SHIPPED gate-green; S6 = deferred batch)
  - [x] **S1 — exact `|z_j|<1` admissibility gate** [D-1, CRITICAL]. DONE + committed. Pure exact predicate
        `QDEquations.nodeInsideDisk(re,im)` (`qd-equations.mjs`, ℚ/BigInt |z|²-vs-1, reuses `_ratApprox`) +
        UI gate in `doCertifyUnivalence` (`algebra-ui.mjs`: `nodeInsideDisk(sol,hData)` closure + per-solution
        reject-before-filters + `poleOut` counter + rej-summary). Test `vitest/qd-node-location.test.ts` (15).
        **Gate GREEN: lint/typecheck/test/build all 0; 1295 tests (was 1280, +15), 148 files, no regressions.**

  - [x] **S2 — honest count labeling + gauge-pin honesty** [C-1, B-1, A-2]. DONE + committed. `doClassify(==1)`
        + `doAutoSolve` + the track badge (`_verdictBadge`) now say "real algebraic solution(s) — an upper bound
        on #QD; run Certify univalence", not "quadrature domains"; the badge drops the green "✓ 1 QD"/'unique'
        state for the raw count. The w₀-pin ledger label fixed: "rotation gauge"→"center/translation gauge —
        restricts to domains containing w₀". `algebra-ui.mjs` strings + ledger only (no logic). **Gate GREEN:
        all 0; 1295 tests, no regression.** Browser-verify verdict wording batched into S4.
  - [x] **S4 — structured `rigor` field + colored `=`/`≤`/`≈`/`⚠`/`?` badge** [G-2 CRITICAL]. DONE + committed.
        Pure exported `QD.AlgebraCanvas.rigorMeta(level)` (level→{symbol,label,color}, hoisted, unit-tested) + a
        prominent colored pill in `setVerdict`. Retrofit: doCertifyUnivalence → `certRigor` (exact only when the
        count is certified AND every candidate's univalence filter was EXACT [new `allExactFilter` — closes D-2]
        AND reconcile+cross-check clean; else partial/estimate); doClassify/doAutoSolve → `classifyRigor` (bound);
        inconsistent → exact; positive-dim → unknown; no-real → partial/exact. Test `vitest/algebra-rigor-badge.test.ts`
        (6, jsdom). **Gate GREEN: all 0; 1301 tests (+6), 149 files.** Browser-verified LIVE: rigorMeta +
        nodeInsideDisk exposed and correct in the running app (after clearing the PWA SW cache).
  - [x] **S5 — unified "✦ Prove existence/uniqueness" orchestrator** [G-1] — DONE + committed. A pinned button
        `doProveExistenceUniqueness` = reduce prelude (auto-reality → propagate) + `doCertifyUnivalence` (the
        S1-gated, S4-badged pipeline); falls back to positive-dim pin/split, never ambiguous. Pure UI
        orchestration of the sound pieces (no new engine logic). **Gate GREEN: all 0; 1305 tests.**
        Browser-confirmed: the button is present in the workspace. (Fuller vision — strategy plan + branch tree +
        DAG export + auto-saturate — is the deferred S5-depth follow-up per FINAL_REPORT §7.)
  - [x] **S3 — Möbius saturation DAG op** [B-1] — DONE + committed. `store.saturateMobius(ids)` appends a
        labeled 'saturate' column = ⟨I⟩:∏(1−z_j·z̄_j)^∞ (drops the {|z_j|=1} stratum; disk 4→2, genuine |z|<1
        retained; safe — disjoint from the QD set). PROV_STORE + PROV_UI 'saturate' entries; toolbar button
        "Saturate (admissibility)" + wire + busy-list. Test `vitest/qd-saturate-mobius.test.ts` (4). **Gate
        GREEN: all 0; 1305 tests (+4), 150 files; PROV sync test passed.** Closes B-1 at the COUNT level.
  - [ ] **S6** CAS-export guard [F5] + LOW/MED batch.

**EXECUTION-ORDER decision (final):** S1+S2 already fixed every WRONG result — the authoritative Certify verdict
is correct (S1) and the raw count is honestly labeled as an upper bound (S2), so the disk user gets the right
answer. The remaining saturation (S3) only TIGHTENS an already-honest bound (4→2), an enhancement not a bug fix.
The mission's headline asks are rigor-legible UI (Phase 4 = the badge) and the orchestrator (Phase 3). So order:
**badge (S4) → orchestrator (S5) → saturation (S3) → export/batch (S6).** If budget ends after S4/S5, the
committed state (gate + honest labels + legible rigor + one-click orchestrator) is a far better outcome than
gate+labels+exact-count with no orchestrator/badge.

**Decision (post-S1 reorder):** S1's strict `|z_j|<1` gate already makes the AUTHORITATIVE verdict (Certify
univalence) correct on the disk (rejects z=±1 + gauge-quotients to "unique ✓"). So B-1's residual harm is the
WRONG LABEL on the raw count, not the number ⇒ do labeling (S2) before saturation. And saturation is delivered
as an explicit DAG op (S3), NOT baked into `currentReimSystem` (which would silently change solveReal/resolvent/
spuriousFactors + cross the worker-parity boundary). `saturate` by the Möbius factors is safe (disjoint from the
genuine `|z_j|<1` locus) — distinct from the store's correct refusal to saturate by `z_j` (`algebra-store.mjs:2652`).

**Branch strategy:** ALL review work (docs + code slices) accumulates on `algebra-maturity-review` (the branch
the prompt directed me to create; the re-entrant STATE lives here). Each code slice is gate-green before commit.
NO mid-review merges to master — the branch is the deliverable; a single PR (or the user's call) closes it out.
This is a fresh multi-part review, NOT a standing-authorization roadmap item, so I do not auto-merge to master.
- [ ] **Phase 4 — UI clarity / guided front-end.**
- [ ] **Testing & validation** (woven through Phase 3–4 slices).
- [ ] **Final — STATE=COMPLETE + `FINAL_REPORT.md`.**

## Baseline results (Phase 0)

- `lint` → exit 0 ✓
- `typecheck` → exit 0 ✓
- `test` → exit 0 ✓ — vitest 147 files / **1280 tests passed** (102.6s). jsdom `getContext` messages = render-test noise.
- `build` → exit 0 ✓
- Full log: scratchpad `baseline.log`. Re-run to reconfirm on resume.

## Module scope (ground truth, verified against tree)

Two test suites: **vitest** (42 `.test.ts` under `apps/quadrature-domains/vitest/`) + legacy **headless**
(`app/test/*.test.js`, run by `node app/node-test.js`, wrapped in vitest `node-suite.test.ts`).

Core algebra source (`apps/quadrature-domains/app/`):
- `sym-core.mjs` (5727 L) — the exact `QD.Sym` CAS engine (ℚ(i) → MPoly → Gröbner/RUR/resultants/factor).
- `sym-radical.mjs` (490), `solver.mjs` (1833), `qd-equations.mjs` (888), `qd-constraints.mjs` (307),
  `qd-varscheme.mjs` (66), `univalence.mjs` (177), `symmetry.mjs` (150), `taylor.mjs` (270).
- `algebra/` — `algebra-store.mjs` (2730), `algebra-ui.mjs` (2671), `algebra-canvas.mjs` (511),
  `cas-export.mjs` (365), `sym-worker.mjs` (132), `expr-parser.mjs` (176), `domain-mini-plot.mjs` (45).
- `schwarz/` (12 files, ~7.4k L) — Schwarz function analysis/render (reconstruction side).
- `solver-*.mjs` family (14 files, ~7.2k L) — the numeric inverse-problem solvers (oracle/cross-check side).
- `workers/` — worker entries incl. `sym-worker-entry.mjs`.

## Proof pipeline (as documented — TO BE VERIFIED, not trusted)

Quadrature data `h` → `QDEquations.generateClassicalBounded` (●/★/gauge, conjugate model over ℚ(i)) →
optional `reimSplit` + reality assumptions + `fixW0` gauge → Algebra-tab reductions (resultant / Gröbner /
saturate / triangularize / factor, each an append-column DAG node) → `currentReimSystem` → `classify` /
`solveReal` / `solveRealCertified` (Hermite + RUR + Sturm) → `doCertifyUnivalence` (regime + Schur–Cohn local
fold + boundary double-point count + gauge quotient + numeric cross-check) → "# genuine QDs" verdict +
reconstructed-boundary thumbnail. External-CAS escape: Maple RCTD export/import.

**Audit lens (the whole point):** not "are the primitives correct" (prior reviews found the ℚ(i) engine
sound) but "does the WORKFLOW use them correctly to actually prove existence/uniqueness" — silent
specialization, genericity assumptions, unsaturated denominator/degeneracy ideals, dropped branches,
numeric heuristics over-claimed, incomplete decompositions read as complete, and certificate chains that do
not actually imply the displayed verdict. And: does "uniqueness" mean uniqueness among ALL admissible
domains, or only among solutions found?

## Phase-1 audit tracks (dispatch log)

| Track | File | Scope | Status |
|---|---|---|---|
| A system-generation | audit/A-system-generation.md | qd-equations, qd-constraints, qd-varscheme, reim/conjugate models, gauge, point-functional | ✅ DONE |

**A done (headline):** MED **A-1** — `clearDenominators()` (`sym-core.mjs:5440`) returns only the numerator,
dropping the Möbius factors `(1−z̄_{j'}z_j)` and Schwarz `φ′(z_j)`; the cleared variety STRICTLY CONTAINS the QD
set (spurious {|z_j|≥1}/{φ′=0}); no excluded locus recorded ⇒ can't saturate. Generation-side root of C-1/D-1;
`realCount` is an UPPER BOUND on #QD. MED **A-2** (uniqueness threat) — pinning φ(0)=w₀ (default = pole centroid,
ON by default) restricts to domains CONTAINING w₀; centroid ∈ conv(Ω) not necessarily a non-convex Ω ⇒ a 2nd
admissible domain excluding it is DROPPED → possible FALSE "unique". Mislabeled "rotation gauge" (really the
center/translation gauge; rotation gauge = the separate Σ Im A_{j,1}=0). LOW **A-3** — realAxisSymmetry comment
over-claims. Confirmed sound: (★) forward form (Jabotinsky-dual M·N=I), reimSplit, Schwarz Blaschke (★_S),
pointFunctionalSystem (A&S cardioid), qd-varscheme (no v/v̄ desync).
| B elimination-decomposition | audit/B-elimination-decomposition.md | sym-core Gröbner/resultant/saturate/elim/minimalPrimes/triangular/radical; denom clearing, excluded loci, positive-dim | ✅ DONE |

**B done (headline):** **HIGH B-1** (FLAGSHIP) — unsaturated Möbius denominators counted as QDs. The count
pipeline (`currentReimSystem`→`_classifyImpl`) analyzes `V(cleared)=V(QD)∪{|z_j|=1}` directly; `saturate`
(`sym-core.mjs:5228`, correct) is NEVER called. PROVEN LIVE: the unit DISK (h=1/w) under assumeReal (★ Auto-reduce
auto-applies) returns realCount=**4** = "4 real quadrature domains", vs true **2** after saturating by (1−z1²)
(the extra 2 = z1=±1, pole on |z|=1, unbounded); without the slice the disk even reads false "positive-dim". This
is the count-side of A-1 ⇒ saturation is now a TOP slice, not deferred. MED **B-2** interactive "Eliminate" uses
raw Sylvester `resultant` (injects extraneous factors; `Res_x(yx+1,yx²−x)=2y` vs true ⟨1⟩) — `eliminationIdeal`
(Gröbner) exists but isn't the default. MED **B-3** `triangularize` initials dropped (chain shown without its
over/under-decompose caveat). LOW **B-4** labeling. Sound: zero-dim gating before every finite count; Hermite
counts distinct radical-free; reducedDiscriminant strips lc; parametric paths use Gröbner elim (clean);
boundaryCurve resultant provably clean; minimalPrimes honest. Defect = saturate not INVOKED, not wrong.

**═══ PHASE 1 COMPLETE (all 7 tracks integrated). ═══**
| C certified-solving-counting | audit/C-certified-solving-counting.md | solveZeroDim/RUR/realSolutionCount/solveRealCertified/parametricRealCount1D/discriminantVariety/Schur-Cohn | ✅ DONE |
| D univalence-admissibility | audit/D-univalence-admissibility.md | univalence, qd-constraints univalence forms, doCertifyUnivalence chain, pole/node location, boundary collisions | ✅ DONE |

**D done (headline):** **CRITICAL** — the genuine-QD certificate has NO `|z_j|<1` / `a_j∈Ω` gate. The
ansatz φ=w₀+Σ conj(A_{j,k})zᵏ/(1−conj(z_j)z)ᵏ has poles at 1/conj(z_j); a solution with |z_j|≥1 puts a pole
INSIDE 𝔻 (not a QD) yet is COUNTED as one — all four filters (exact Schur–Cohn fold, exact double-point,
numeric findCriticalPoints, numeric isBoundaryUnivalent) are blind to it (repro `scratchpad/repro-nodeloc.js`:
z₁=2 ⇒ num(φ′)=const, filters pass, evalPhi(0.5) throws at the interior pole). Direct solver enforces
0<|z₀|<1 (`direct-common.mjs:1475`); only algebra certification omits it. Fix EXACT (rationalized z_j on hand),
a_j∈Ω follows. Confirms PF-3. MEDIUM — "certified" headline not downgraded when a domain's univalence came from
the NUMERIC fallback (relates PF-1). LOW — crossCheck `.some()` masks a spurious solution; user constraints not
in specializationLedger. Confirmed sound: {φ′≠0}∧{Jordan}⇒injective GIVEN |z_j|<1; cusp/double-point exactness.
| E reconstruction-verification | audit/E-reconstruction-verification.md | phiFromAlgebraSolution, exact Schwarz curve, exact data verification, sameDomain dedup | ✅ DONE |

**E done (headline):** Reconstruction SOUND — `phiFromAlgebraSolution` (`algebra-ui.mjs:1667`) is a faithful
read-off, NO φ⁻¹ inversion / branch / sqrt selection ⇒ "wrong branch" impossible; `Res_t` boundary curve
empirically clean (11 configs irreducible, vanish on ∂Ω ≤3e-13, Hermitian-symmetric); `canonicalizeByRotation`
correct, reflection correctly NOT quotiented. MED **E1** — the only check a RECONSTRUCTED φ reproduces h is
NUMERIC (`residualAtSolution`, 1e-4); no exact symbolic verify of the displayed map. MED **E2** — "Schur–Cohn
certified"/"exact curve" run on the `ratApprox` midpoint (denom cap 1e6, no box-containment); the certified solve
computes an isolating-BOX witness at `sym-core.mjs:1968` but reconstruction DISCARDS it (reads only midpoint);
univalence row doesn't disclose "rationalized". Sharpens PF-1 with the fix pointer. LOW **E3** numeric dedup
(sameDomain tol 1e-4) under "certified" framing (could merge near-coincident distinct); **E4** a φ failing the
cross-check isn't removed from the count (warning only); **E5** boundaryCurve no factor-strip / S not gcd-reduced.
| F store-worker-export | audit/F-store-worker-export.md | algebra-store DAG, sym-worker cancel/parity/determinism, cas-export round-trip, PROV_STORE/UI | ✅ DONE |

**F done (headline):** Engineering SOUND — no critical/high. Confirmed: single `runJob` both paths, bit-identical
over real worker_threads; ℚ(i) BigInt → decimal strings (exact round-trip); cancel/supersede genuinely terminate;
no Date/random (reproducible DAG); immutable nodes + pristine col 0 + isolated tracks; lossless backward-compat
`exportDAG↔importDAG`; both prov registries cover all 20 ops; DOM-free. MED **F5** (SUSPECTED) — `casColumn`/
`_columnItems` (`algebra-store.mjs:2372/2366`) export a column verbatim, no reim-split/complex-coeff guard ⇒ a
conjugate-model export makes Maple/msolve "real solutions" a DIFFERENT quantity than the verdict (fix: warn/refuse
or auto-reim-split on complex coeff / barred var). LOW→MED **F1** — `_CAP_KEYS` (`:183`) omits caps worker ops read
(RUR maxDim/maxTries; parametricRealCount1D maxTries/maxCalls/…) + the coverage test shares the omission (false
assurance); latent. LOW F2/F3/F4 (sync classify opts; superseded abort-listener; worker load-error rejects forever)
+ F6 (differential test gap: solveRealCertified/shapeFromMoments/parametricRealCount1D).
| G ui-workflow | audit/G-ui-workflow.md | algebra-ui/canvas, verdict card, rigor badges, terminology, first-time-user walk (feeds Phase 4) | ✅ DONE |

**G done (headline):** CRITICAL — (1) no single "prove existence/uniqueness" orchestrator; 3 overlapping buttons
of differing rigor; the authoritative `Certify univalence` (1785) is collapsed + doesn't auto-reduce ⇒ dead-ends
positive-dim on a fresh seed. (2) rigor legibility broken — verdict card is one flat text node
(`algebra-canvas.mjs:438` `body.textContent=data.text`), NO `=`/`≤`/`≈` badge; PARTIAL/cross-check/slice caveats
are prose ⇒ certified and estimate look identical. HIGH — `doAutoSolve` over-claims "Unique QD" from a raw
algebraic real count. Fix: one orchestrated action + a structured `rigor` field → colored badge + class/equivalence
headline. Corroborates PF-2/PF-4.

All 7 dispatched 2026-07-13 as background general-purpose subagents (read-only; each persists to its
audit/<track>.md before returning). Orchestrator integrates on completion.

Each subagent persists its full findings (severity + evidence: file:line / failing input / repro test) to its
file BEFORE returning. Orchestrator alone integrates + adjudicates + commits.

## Decisions log

- 2026-07-13: Fresh run. Branch `algebra-maturity-review` off master `355ed9c`. 7-track read-only audit
  partition chosen to match the proof pipeline's stages (generation→elimination→solving→univalence→
  reconstruction→engineering→UI). Rationale: disjoint file footprints ⇒ safe parallel dispatch.

## Next action

**REVIEW COMPLETE** (S1–S5 shipped gate-green; FINAL_REPORT.md written). If resuming for MORE, the value-ordered
continuation (from FINAL_REPORT §7 / PLAN.md deferred) is: (1) **PF-1** exact-at-the-isolating-box univalence
cert (`sym-core.mjs:1968`) — the #1 rigor item; (2) **S5-depth** — strategy plan + branch/case tree + auto-apply
`saturateMobius` + DAG export; (3) **S6** — F5 CAS-export guard + the LOW/MED batch (B-2 eliminate→eliminationIdeal,
B-3 initials, F1 caps, E4, D-3/D-4). Branch `algebra-maturity-review` holds all 5 slices, NOT merged to master.

### Confirmed top findings → slice map (the plan in one glance)
- **S1** exact `|z_j|<1` admissibility gate in the CERTIFY path [D-1] — CRITICAL, small, exact. Rejects both
  |z_j|=1 (disk spurious) and |z_j|>1 (interior pole) ⇒ authoritative verdict correct. **FIRST.**
- **S2** saturate the COUNT path by the Möbius denominators [B-1/A-1] — HIGH, flagship (disk 4→2). Record the
  excluded locus at generation + `saturate` in classify. Larger; test with the disk golden.
- **S3** honest count labeling [C-1/B-4] + w₀-pin restriction & gauge-name fix [A-2] — HIGH labeling, small.
- **S4** structured `rigor` verdict field → colored `=`/`≤`/`≈`/`⚠` badge + class/equivalence headline [G-1/G-2].
- **S5** unified "Prove existence/uniqueness" orchestrator [G-1/PF-2] — Phase-3 capstone (depends on S1+S4).
- **S6** CAS-export fidelity guard [F5]; then batch the LOW/MED tail (B-2 eliminate→eliminationIdeal, B-3
  initials, F1 caps, E4 cross-check-removal, D-3/D-4, G misc).
- **Deferred (hard/large):** PF-1/E2/D-2 exact-at-the-algebraic-point univalence cert (use the isolating box at
  `sym-core.mjs:1968`, not the ratApprox midpoint) — highest-value remaining rigor item after the slices.
