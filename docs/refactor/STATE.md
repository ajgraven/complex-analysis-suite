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
  posDimDesc → NEW `algebra-labeling.mjs`) — MERGED (#195).** **Carve-out 2 (`_verdictBadge`, IIFE lift) — MERGED (#196).**
  **Carve-out 3 (`exactValueStr` + `fmtRat` → NEW `algebra-format.mjs`) — PR #197 OPEN.** Two pure modules pulled out
  (verdict prose; exact ℚ(i) value formatter) + the in-file badge lift.
- **Shape chosen by deps each time:** a NEW MODULE when the dep is cleanly importable (1: posDimDesc; 3: QDEquations.ratApprox
  via a side-effect import → headless net); an IN-FILE IIFE lift when a dep is woven through installAlgebra (2: latexPlain ~50×).
- **QD-ALG-6 assessed + DECLINED** (carve-out 3): the ~6 tolerance literals sit at unrelated sites with different
  meanings — no single pure computation to net; left open as a constants cleanup, not a carve-out.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-outs 1✓ 2✓ 3(open))** / E / F.

## Branches / PR
- Integration `refactor/main` @ **4a02bce** (this STATE commit advances it). Tree clean.
- **OPEN PR #197** — `refactor/d-alg-carve-3-exact-format` @ b51e201 (off 4a02bce): carve-out 3. CI running
  (build in_progress / browser queued at open); subscribed + 12-min merge-on-green fallback armed (18:59Z).
- Merged stage PRs (19): A1 #178 … D-alg-carve-1 #195, **D-alg-carve-2 #196 (cc97481)**.

## Validation state (green bar)
- **`refactor/main` @ 4a02bce — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2160 passed / 246 files**.
- **PR #197 stage branch @ b51e201 — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2168 passed / 247 files** (+8, +1 file — new headless `algebra-exact-format.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 3 committed to its stage branch (b51e201) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #197 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra's remaining bulk is DOM-bound (QD-ALG-2 sidebar innerHTML) with source-text tests (QD-ALG-3); the
  pure-carve-out strategy is thinning out its low-hanging targets — deeper decomposition needs a different strategy.

## Next concrete steps
1. **Merge #197 on green** (fallback armed 18:59Z). On merge → advance `refactor/main`, re-confirm green, refresh STATE.
2. **Carve-out 4** — pure candidates thinning; needs a fresh scan (e.g. `fmtRatio`, other formatting/predicate helpers
   still inside installAlgebra). Or pivot: (a) the char-first UNIFICATION of the 3 now-netted verdict builders (needs an
   approval token — changes strings); (b) jsdom-drive the sidebar build (QD-ALG-2) — a bigger strategy shift.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway — 3 carve-outs done)** → E (state+folderize) → F (dep-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
