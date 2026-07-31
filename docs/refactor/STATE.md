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
- **Phase D — Execute. Groups A + B + C COMPLETE. Group D STARTED (god-module decomposition).**
- **D-ui-seam — PR #193 OPEN (CI pending).** ui.mjs's first seam (QD-UI-2): extracted the pure domain-mode
  algebra (`composeMode`/`decomposeMode`/`modeSummary`) → NEW `app/ui-domain-mode.mjs` + a 19-test net
  (`vitest/ui-domain-mode.test.ts`, mutation-verified) — **ui.mjs's first executable coverage.** Behavior-
  preserving (green 2133/243; verbatim extraction, zero call-site edits).
- **Revised Group-D understanding (from a verified read-only map):** ui.mjs is the Phase-2 PORT — most
  responsibilities already live in sibling modules (installX factories); it's mostly DOM wiring. So ui.mjs
  "decomposition" is limited; the genuinely-big still-monolithic Group-D target is **`installAlgebra`**
  (algebra-ui.mjs, ~4.2k-line fn, QD-ALG-1). A runner-up ui.mjs pure seam (geometry pair) remains.
- **AWAITING nothing — cadence continues.** On #193 merge, present the next Group-D choice: (a) installAlgebra
  net-first stage (the big target; needs its own char strategy — it's DOM-heavy); (b) the ui.mjs geometry seam;
  (c) pause. Present at the gate; do not auto-start the big installAlgebra work without a nod.
- Cadence: merge on green (user delegates; user said "Proceed with Group D"). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui-seam in review; installAlgebra next)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **89e4fc7** (this STATE commit advances it). Tree clean.
- **PR #193 OPEN (CI pending):** `refactor/D-ui-seam-domain-mode` (a4be956) → `refactor/main`.
- Merged stage PRs (15): A1 #178 … C3b-p2 #192 (be6a51e). (Full list in prior STATE commits / LOG.)

## Validation state (green bar)
- **D branch @ a4be956 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2133 passed / 243 files**
  (+19, +1 file); ui-domain-mode net 19/19, mutation-verified.
- `refactor/main` @ 89e4fc7 (post-Group-C) green: 2114/242.

## Uncommitted / unverified
- None. D-ui-seam committed (a4be956) + pushed; PR #193 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #193 CI green**, then merge (per cadence). Behavior-preserving (pure-logic move + net).
- installAlgebra (the big D target) is DOM-heavy (builds the sidebar via innerHTML) — a behavioral net for it is
  harder than the solver golden nets; QD-ALG-3 flags its current tests are source-text. Needs a careful strategy.

## Next concrete steps
1. **When PR #193 CI greens → merge** (title + `(#193)`), pull, re-confirm green (2133/243).
2. Present the next Group-D choice (installAlgebra net-first / ui.mjs geometry seam / pause).
3. Group order: A✓ B✓ C✓ → **D (in progress)** → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #193 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2133/243
```
