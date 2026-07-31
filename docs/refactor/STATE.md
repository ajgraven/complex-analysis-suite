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
  ~4.2k-line god-function by its PURE sub-computations, net-first, one PR each. **Carve-out 1 (classifyVerdict +
  posDimDesc → NEW `app/algebra/algebra-labeling.mjs`) — MERGED (#195).** **Carve-out 2 (`_verdictBadge` chip badge,
  lifted to IIFE scope) — PR #196 OPEN.** All three drifted verdict builders now have honest-labeling coverage
  (doClassify prose #195, `_verdictBadge` chip #196; doAutoSolve's inline prose remains).
- **Two shapes, chosen by deps:** carve-out 1 → a NEW MODULE (its dep posDimDesc was cleanly movable). Carve-out 2 →
  an IN-FILE lift to IIFE scope (the T1 pattern), because `_verdictBadge`→`sliceLabels`→`latexPlain` and `latexPlain`
  is referenced ~50× across installAlgebra — a module move's blast radius. Both shrink the god-FUNCTION + add coverage.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-outs 1✓ 2(open))** / E / F.

## Branches / PR
- Integration `refactor/main` @ **6954965** (this STATE commit advances it). Tree clean.
- **OPEN PR #196** — `refactor/d-alg-carve-2-verdict-badge` @ a544e33 (off 6954965): carve-out 2. CI running
  (browser in_progress / build queued at open); subscribed + 12-min merge-on-green fallback armed (16:27Z).
- Merged stage PRs (18): A1 #178 … D-ui-seam-2 #194, **D-alg-carve-1 #195 (1fc4a3d)**.

## Validation state (green bar)
- **`refactor/main` @ 6954965 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2150 passed / 245 files**.
- **PR #196 stage branch @ a544e33 — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2160 passed / 246 files** (+10, +1 file — new `algebra-verdict-badge.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 2 committed to its stage branch (a544e33) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #196 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra is DOM-heavy (QD-ALG-2) with source-text tests (QD-ALG-3); the carve-out strategy sidesteps both
  by extracting only genuinely-PURE sub-computations (netted headlessly) — the DOM-bound bulk is not being moved.

## Next concrete steps
1. **Merge #196 on green** (fallback armed 16:27Z). On merge → advance `refactor/main`, re-confirm green, refresh STATE.
2. **Carve-out 3** candidates: QD-ALG-6 realness/verify tolerance predicates (magic literals → a pure threshold helper),
   or another pure helper (e.g. the ℚ(i) value formatter `exactValueStr`/`fmtRat`, dep QE.ratApprox). Each: net-first, own PR.
3. Deferred (needs an approval token — changes strings): the char-first UNIFICATION of the 3 drifted verdict builders.
4. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway)** → E (state+folderize) → F (dep-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
