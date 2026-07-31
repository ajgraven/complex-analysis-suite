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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 (worker-lane) DONE — C1a + B4-2c + C1b.**
- **C1b — PR #188 OPEN (CI pending).** The QD-UI-1 close-out: extracted `formatWorkerErrorDetail(ev)` (NEW
  `app/workers/worker-crash-detail.mjs`), the one primitive all 6 lanes share; retrofit the 4 lane wrappers.
  Behavior-preserving (6-lane net 54/54; full 2092/240 unchanged). C1a collapsed the 3 verbatim PSW lanes; the
  residual per-lane divergence (sym/schwarz/pool) is documented as legitimate distinct abstractions.
  **QD-UI-1 resolved. Group-C worker-lane work is DONE.** Merge on green.
- **AWAITING USER DIRECTION for the next stage** (after #188 merges). Remaining Group C: **C2** (typed worker
  protocol, QD-UI-4 — unknown-kind hangs; needs its own char net first, à la B4→C1) and **C3** (defineFamily,
  QD-SOLV-4/5 — solver shell; needs golden residual-vector tests first). Or advance to **Group D** (god-module
  decomposition: installAlgebra, ui.mjs — the biggest items) / the deferred ui.mjs-seam stage / pause.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1✓; C2/C3)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **8df5487** (this STATE commit advances it). Tree clean.
- **PR #188 OPEN (CI pending):** `refactor/C1b-worker-crash-detail` (00feae9) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  **B4-2c #187 (551c9c6)**.

## Validation state (green bar)
- **C1b branch @ 00feae9 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2092 passed / 240 files**
  (unchanged — source refactor). The 6-lane worker net = **54/54** before AND after.
- `refactor/main` @ 8df5487 (post-B4-2c) green: 2092/240.

## Uncommitted / unverified
- None. C1b committed (00feae9) + pushed; PR #188 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #188 CI green**, then merge (per cadence). Behavior-preserving; net-guarded (54/54).
- Next-stage direction open (C2 / C3 / Group D / ui.mjs-seam / pause) — decision at the post-merge gate.

## Next concrete steps
1. **When PR #188 CI greens → merge** (merge-commit, title + `(#188)`), pull, re-confirm green (2092/240).
2. Then the next stage (user's call): **C2** (typed protocol — char-net-first) / **C3** (defineFamily —
   golden-residual-first) / **Group D** (installAlgebra + ui.mjs decomp; ui.mjs-seam stage first) / pause.
3. Group order: C (DONE: C1; C2/C3 remain) → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #188 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2092/240
```
