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
- **installAlgebra decomposition UNDERWAY** (QD-ALG-1; user chose "Carve-outs" + "keep carving") — attack the
  ~4.2k-line god-function by its PURE sub-computations, net-first, one PR each. **Carve-out 1 (classifyVerdict +
  posDimDesc → `algebra-labeling.mjs`) — MERGED (#195).** **Carve-out 2 (`_verdictBadge`, IIFE lift) — MERGED (#196).**
  **Carve-out 3 (`exactValueStr` + `fmtRat` → NEW `algebra-format.mjs`) — MERGED (#197).** **Carve-out 4 (`fmtRatio` +
  `ratioStrRec` ratio-prefix formatters → extend `algebra-format.mjs`) — PR #198 OPEN.**
- **Shape chosen by deps each time:** a NEW MODULE when the dep is cleanly importable (1: posDimDesc; 3: QDEquations.ratApprox
  via a side-effect import → headless net; 4: the two formatters call the co-located `exactValueStr`); an IN-FILE IIFE lift
  when a dep is woven through installAlgebra (2: latexPlain ~50×).
- **QD-ALG-6 assessed + DECLINED** (carve-out 3): the ~6 tolerance literals sit at unrelated sites with different
  meanings — no single pure computation to net; left open as a constants cleanup, not a carve-out.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-outs 1✓ 2✓ 3✓ 4(open))** / E / F.

## Branches / PR
- Integration `refactor/main` @ **82d72b2** (this STATE commit advances it). Tree clean.
- **OPEN PR #198** — `refactor/d-alg-carve-4-ratio-format` @ d8dd94d (off 82d72b2): carve-out 4. CI running
  (build in_progress / browser queued at open); subscribed + 12-min merge-on-green fallback armed (19:23Z).
- Merged stage PRs (20): A1 #178 … D-alg-carve-2 #196, **D-alg-carve-3 #197 (82d72b2)**.

## Validation state (green bar)
- **`refactor/main` @ 82d72b2 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2168 passed / 247 files**.
- **PR #198 stage branch @ d8dd94d — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2174 passed / 248 files** (+6, +1 file — new headless `algebra-ratio-format.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 4 committed to its stage branch (d8dd94d) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #198 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra's remaining bulk is DOM-bound (QD-ALG-2 sidebar innerHTML) with source-text tests (QD-ALG-3); after
  carve-out 4 the pure low-hanging fruit is essentially exhausted — deeper decomposition needs a different strategy.

## Next concrete steps
1. **Merge #198 on green** (fallback armed 19:23Z). On merge → advance `refactor/main`, re-confirm green, refresh STATE.
2. **Carve-out 5 / pivot** — pure candidates essentially exhausted (a 5th would need a fresh scan for any remaining pure
   helper). Otherwise pivot: (a) the char-first UNIFICATION of the 3 now-netted verdict builders (needs an approval
   token — changes strings); (b) jsdom-drive the sidebar build (QD-ALG-2) or convert the source-text tests (QD-ALG-3) —
   a bigger strategy shift. Worth a check-in with the user on direction at this point.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway — 4 carve-outs)** → E (state+folderize) → F (dep-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
