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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 (worker-lane) DONE + C2 (typed protocol) DONE.**
- **C2 (DONE, merged 3cc3e0d):** NEW `app/workers/protocol.mjs` (`reply`/`replyError`/`dispatch`);
  `solver-worker-entry.mjs` 53→31. Char-net-first; known kinds byte-identical (round-trip net green before/after);
  **unknown-kind hang→error-reply was the one APPROVED change** (PLAN v1 C2). Also began closing QD-UI-5 (the
  entry dispatch had zero coverage). QD-UI-4 addressed on the primary path.
- **AWAITING USER DIRECTION for the next stage** (holding — do not auto-start). Options:
  - **(a) C3** — `defineFamily(config)` + seeds-common (QD-SOLV-4/5: ~10× re-typed solver Family shell + seeds
    mirror). Factor the SHELL only (locator/coeff skeleton, canonicalize, pack/unpack, register); NOT evalPhi/
    phiTaylorAt/computeTargetA math. Golden per-family residual-vector tests as the FIRST commit. Med risk. *(rec — finishes Group C)*
  - **(b) Group D** — god-module decomposition: installAlgebra (~4.2k-line fn, QD-ALG-1) + ui.mjs (~20 resp.,
    QD-UI-2). The biggest structural wins; high risk; the deferred **ui.mjs-seam** stage comes first (before D2).
  - **(c) C2b** — route the sym/param-slice/schwarz entry reply-envelopes through `protocol.mjs` (small DRY win;
    no hang there). 
  - **(d) pause.**
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1✓, C2✓; C3)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **3cc3e0d** (C2 merge-commit; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, C1b #188, **C2 #189 (3cc3e0d)**.

## Validation state (green bar)
- **`refactor/main` @ 3cc3e0d — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0; `pnpm test`
  **2103 passed / 241 files**. Worker nets: 6-lane lifecycle 54/54 + worker-protocol 11/11.

## Uncommitted / unverified
- None. C2 merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding for the next-stage direction** (C3 / Group D / C2b / pause). No blockers.
- C3 needs golden residual-vector tests FIRST (touches the solver shell — math left untouched). Group D needs the
  ui.mjs seam + net before D2.

## Next concrete steps
1. **HOLD** — await user's choice: (a) C3 / (b) Group D / (c) C2b / (d) pause.
2. Whichever: net-first, then the behavior-preserving change; own PR → refactor/main; merge on green.
3. Group order: C (C1✓, C2✓; C3 remains) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2103/241
```
