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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 (worker-lane dedup) COMPLETE — C1a + B4-2c + C1b MERGED.**
- **QD-UI-1 RESOLVED.** C1a collapsed the 3 verbatim PSW lanes onto `createWorkerLane` (−40%); B4-2c pinned the
  schwarz/pool lane contracts; C1b extracted the one shared primitive `formatWorkerErrorDetail` (`app/workers/
  worker-crash-detail.mjs`) across all 4 lane wrappers. Behavior-preserving throughout (6-lane net 54/54).
  Residual per-lane divergence (sym/schwarz/pool) documented as legitimate distinct abstractions, not debt.
- **AWAITING USER DIRECTION for the next stage** (holding — do not auto-start). Options:
  - **(a) C2** — typed worker protocol (QD-UI-4: untyped envelope hand-repeated ~11×; unknown `kind` silently
    hangs). Char-net-first (unknown-kind test), then `workers/protocol.mjs`. Self-contained; low-med risk. *(rec)*
  - **(b) C3** — `defineFamily` (QD-SOLV-4/5: ~10× re-typed solver Family shell). Touches the solver → golden
    residual-vector tests as the FIRST commit. Med risk.
  - **(c) Group D** — god-module decomposition (installAlgebra ~4.2k-line fn; ui.mjs ~20-responsibility module —
    the biggest structural wins). High value, high risk; the deferred **ui.mjs-seam** stage comes first (before D2).
  - **(d) pause.**
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1✓; C2/C3)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **a6332d5** (C1b merge-commit; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, **C1b #188 (a6332d5)**.

## Validation state (green bar)
- **`refactor/main` @ a6332d5 — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0; `pnpm test`
  **2092 passed / 240 files**. The 6-lane worker net (psw 7+13, sym 3+5, schwarz 5+9, param-slice-pool 12) = 54/54.

## Uncommitted / unverified
- None. C1b merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding for the next-stage direction** (C2 / C3 / Group D / pause). No blockers.
- C2/C3/D each need their own characterization net FIRST (the B4→C1 discipline): C2 an unknown-kind test; C3 golden
  residual vectors; D2 the ui.mjs seam + net.

## Next concrete steps
1. **HOLD** — await user's choice: (a) C2 / (b) C3 / (c) Group D / (d) pause.
2. Whichever: net-first, then the behavior-preserving change; own PR → refactor/main; merge on green.
3. Group order: C (C1 done; C2/C3 remain) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2092/240
```
