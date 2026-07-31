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
  pattern). **Carve-out 1 (classifyVerdict) — PR #195 OPEN.** A read-only map + firsthand verification picked the
  honest-labeling verdict prose as the best first target.
- **Correction to QD-ALG-5** ("built in two places → de-dup"): the verdict wording is built in THREE
  similar-but-DISTINCT places (doClassify @3521, doAutoSolve @3275, `_verdictBadge` @4693) — drifted strings, so
  merging is behavioral (needs an approval token). Carve-out 1 seams ONE site verbatim; unification deferred.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-out 1 of N)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **c34d978** (this STATE commit advances it). Tree clean.
- **OPEN PR #195** — `refactor/d-alg-carve-1-classify-verdict` @ e7153f8 (off c34d978): carve-out 1. CI running
  (build + browser in_progress at open); subscribed + 12-min merge-on-green fallback armed.
- Merged stage PRs (17): A1 #178 … C3b-p2 #192, D-ui-seam #193, D-ui-seam-2 #194.

## Validation state (green bar)
- **`refactor/main` @ c34d978 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2139 passed / 244 files**.
- **PR #195 stage branch @ e7153f8 — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2150 passed / 245 files** (+11, +1 file — new `algebra-classify-verdict.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 1 committed to its stage branch (e7153f8) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #195 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra is DOM-heavy (QD-ALG-2) with source-text tests (QD-ALG-3); the carve-out strategy sidesteps both
  by extracting only genuinely-PURE sub-computations (netted headlessly) — the DOM-bound bulk is not being moved.

## Next concrete steps
1. **Merge #195 on green** (fallback armed 15:56Z). On merge → advance `refactor/main`, refresh STATE.
2. **Next carve-out** from installAlgebra (candidates): a later char-first UNIFICATION of the 3 drifted verdict
   builders (needs an approval token — changes strings), or QD-ALG-6 realness/verify tolerance predicates, or
   another pure helper (e.g. `_verdictBadge` → the chip badge, also pure). Each: net-first, own PR, merge on green.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway)** → E (state+folderize) → F (dep-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
