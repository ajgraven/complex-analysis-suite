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
  lifted to IIFE scope) — MERGED (#196).** All three drifted verdict builders now have honest-labeling coverage
  (doClassify prose #195, `_verdictBadge` chip #196; doAutoSolve's inline prose remains — a future carve/unify).
- **Two shapes, chosen by deps:** carve-out 1 → a NEW MODULE (its dep posDimDesc was cleanly movable). Carve-out 2 →
  an IN-FILE lift to IIFE scope (the T1 pattern), because `_verdictBadge`→`sliceLabels`→`latexPlain` and `latexPlain`
  is referenced ~50× across installAlgebra — a module move's blast radius. Both shrank the god-FUNCTION + added coverage.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-outs 1✓ 2✓)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **cc97481** (#196 merge; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs (19): A1 #178 … D-alg-carve-1 #195, **D-alg-carve-2 #196 (cc97481)**.

## Validation state (green bar)
- **`refactor/main` @ cc97481 — ALL GREEN (post-merge re-confirmed firsthand):** build/typecheck/lint exit 0;
  `pnpm test` **2160 passed / 246 files**. (Carve-outs 1+2 nets: algebra-classify-verdict 11 + algebra-verdict-badge 10.)

## Uncommitted / unverified
- None. #196 merged + pulled; post-merge green re-confirmed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR. No blockers.
- installAlgebra is DOM-heavy (QD-ALG-2) with source-text tests (QD-ALG-3); the carve-out strategy sidesteps both
  by extracting only genuinely-PURE sub-computations (netted headlessly) — the DOM-bound bulk is not being moved.

## Next concrete steps
1. **Carve-out 3** (natural continuation; session is very long — a fresh one is fine). Candidates: QD-ALG-6
   realness/verify tolerance predicates (magic literals → a pure threshold helper), or the ℚ(i) value formatter
   `exactValueStr`/`fmtRat` (dep QE.ratApprox, importable). Each: net-first, own PR, merge on green.
2. Deferred (needs an approval token — changes strings): the char-first UNIFICATION of the 3 drifted verdict builders
   (doClassify/doAutoSolve/`_verdictBadge`) — now all three are netted, so a later unification is well-guarded.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway — 2 carve-outs done)** → E (state+folderize) → F (dep-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
