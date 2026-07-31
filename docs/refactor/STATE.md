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
- **Phase D — Execute. Groups A + B + C COMPLETE. Group D in progress: D-ui-seam MERGED (29a7f97).**
- **D-ui-seam (DONE):** ui.mjs's first seam (QD-UI-2) — pure domain-mode algebra (`composeMode`/`decomposeMode`/
  `modeSummary`) → `app/ui-domain-mode.mjs` + 19-test net (ui.mjs's first executable coverage). Behavior-preserving
  (green 2133/243).
- **AWAITING USER DIRECTION for the next Group-D stage** (holding — do not auto-start). Options:
  - **(a) installAlgebra** (algebra-ui.mjs, ~4.2k-line fn, QD-ALG-1) — the big still-monolithic target. DOM-heavy
    (builds the sidebar via one innerHTML string, QD-ALG-2), and its current tests are source-text (QD-ALG-3), so a
    behavioral net is harder than the solver golden nets — needs a careful char-strategy proposal FIRST (likely:
    carve pure helpers out to netted modules, jsdom-drive the sidebar wiring, or both). Highest value, highest risk.
  - **(b) ui.mjs geometry seam** — extract the pure `boundarySelfIntersectsSimple`/`segmentsIntersect` pair
    (another small, safe pure extraction like D-ui-seam). Low value, low risk.
  - **(c) pause** — Groups A/B/C done + Group D started; a clean point.
- Cadence: merge on green (user delegates; user said "Proceed with Group D"). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui-seam✓; installAlgebra / geometry-seam next)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **29a7f97** (D-ui-seam merge; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs (16): A1 #178 … C3b-p2 #192, **D-ui-seam #193 (29a7f97)**. (Full list in prior STATE/LOG.)

## Validation state (green bar)
- **`refactor/main` @ 29a7f97 — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0; `pnpm test`
  **2133 passed / 243 files**; ui-domain-mode net 19/19.

## Uncommitted / unverified
- None. D-ui-seam merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding for the next Group-D choice**. No blockers.
- installAlgebra (option a) is the hardest net-first target of the whole engagement (DOM-heavy, source-text tests
  today) — it warrants a proposed char-strategy + a scope agreement before implementation, not an auto-start.

## Next concrete steps
1. **HOLD** — await user's choice: (a) installAlgebra (propose its net-first strategy first) / (b) ui.mjs geometry
   seam / (c) pause.
2. Whichever: net-first, behavior-preserving, own PR → refactor/main; merge on green.
3. Group order: A✓ B✓ C✓ → **D (in progress)** → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2133/243
```
