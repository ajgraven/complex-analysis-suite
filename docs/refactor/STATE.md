# STATE — refactor engagement

> Living control file. Always current; keep under 100 lines. Committed directly to `refactor/main`
> at every checkpoint (it describes not-yet-merged work, so it must not sit behind an unmerged PR).
> Git and the working tree are authoritative for *what is true*; this file is authoritative only for
> *where we are*. On disagreement, trust git and correct this file.

## Objective
Multi-session architectural refactor of `complex-analysis-suite` — prioritizing maintainability/
extensibility, conceptual clarity, reliability/testability, and architectural coherence.
Behavior-preserving by default; no behavioral change without an explicit approval token.

## Phase / stage
- **Phase D — Execute. Groups A + B + C COMPLETE. Group D in progress.**
- **ui.mjs pure-seam extraction COMPLETE** — D-ui-seam (#193) + D-ui-seam-2 (#194) both MERGED (netted
  `ui-domain-mode.mjs` + `ui-geometry.mjs`; ui.mjs's first executable coverage, 25 tests).
- **installAlgebra decomposition UNDERWAY** (QD-ALG-1; user chose "Carve-outs (recommended)") — attack the
  ~4.2k-line god-function by its PURE sub-computations, each to a small netted module, one PR (the ui.mjs seam
  pattern). **Carve-out 1 (classifyVerdict + posDimDesc → NEW `app/algebra/algebra-labeling.mjs`) — MERGED (#195).**
  First executable coverage of the =/≤ honest-labeling verdict prose (11 tests, mutation-verified).
- **Correction to QD-ALG-5** ("built in two places → de-dup"): the verdict wording is built in THREE
  similar-but-DISTINCT places (doClassify @3521, doAutoSolve @3275, `_verdictBadge` @4693) — drifted strings, so
  merging is behavioral (needs an approval token). Carve-out 1 seamed ONE site verbatim; unification deferred.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-out 1 done, next TBD)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **1fc4a3d** (#195 merge; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs (18): A1 #178 … D-ui-seam #193, D-ui-seam-2 #194, **D-alg-carve-1 #195 (1fc4a3d)**.

## Validation state (green bar)
- **`refactor/main` @ 1fc4a3d — ALL GREEN (post-merge re-confirmed firsthand):** build/typecheck/lint exit 0;
  `pnpm test` **2150 passed / 245 files**. (Carve-out 1's `algebra-classify-verdict.test.ts` = 11 of those.)

## Uncommitted / unverified
- None. #195 merged + pulled; post-merge green re-confirmed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR. No blockers.
- installAlgebra is DOM-heavy (QD-ALG-2) with source-text tests (QD-ALG-3); the carve-out strategy sidesteps both
  by extracting only genuinely-PURE sub-computations (netted headlessly) — the DOM-bound bulk is not being moved.

## Next concrete steps
1. **Carve-out 2** from installAlgebra — investigating the cleanest next pure piece. Leading candidate: `_verdictBadge`
   (@4693, the chip badge `(r)→{badge,state,title}`, fully pure — deps posDimDesc[now in module]+sliceLabels) → its
   natural home is `algebra-labeling.mjs` (may pull sliceLabels/latexPlain along, consolidating the honest-labeling
   helpers). Alternatives: QD-ALG-6 realness/verify tolerance predicates. Each: net-first, own PR, merge on green.
2. Deferred (needs an approval token — changes strings): the char-first UNIFICATION of the 3 drifted verdict builders.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway)** → E (state+folderize) → F (dep-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
