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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 DONE, C2 DONE, C3a DONE, C3b part 1 MERGED.**
- **C3b part 1 (DONE, merged 3ac7dc2):** NEW `app/solvers/define-family.mjs` + 3/10 families on it
  (boundedQD/unboundedQD/boundedLQD). Behavior-preserving (golden net 11/11 post-merge; oracle 2332/0).
- **C3b part 2 IN PROGRESS** — retrofit the remaining 7 families onto `defineFamily`, same proven pattern
  (math untouched; golden net + green bar per batch). The 7: unboundedLQD, boundedLQD_singular,
  unboundedLQD_singular (`{A,F,G}` → computeTargetG), powerQD (positional w0+alpha), powerQD_singular,
  unboundedPQD, unboundedPQD_singular (the `sampleBoundary` key). Branch `refactor/C3b2-define-family`.
  On completion → PR, then QD-SOLV-4/5 RESOLVED (all 10 on the factory).
- **FINDING (part 1):** shells diverge more than the C3a map showed (per-family `diverseInitialGuess`; varying
  seed/continuation arg conventions) → defineFamily injects those; a scaffolding-factor, not a collapse.
- Cadence: merge on green (user delegates; chose "Go — incremental" for C3b). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / **C (C1✓, C2✓, C3a✓, C3b-1✓; C3b-2 in progress)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **3ac7dc2** (C3b-p1 merge; this STATE commit advances it). Tree clean.
- **C3b part 2:** branch `refactor/C3b2-define-family` (in progress, not yet PR'd). No other open PR.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, C1b #188, C2 #189, C3a #190, **C3b-p1 #191 (3ac7dc2)**.

## Validation state (green bar)
- **`refactor/main` @ 3ac7dc2 — green:** golden family net 11/11 (post-merge sanity check); CI `build` job (full
  build/typecheck/lint/test) was green on the merged code; expected full `pnpm test` **2114/242**, node oracle **2332/0**.

## Uncommitted / unverified
- None on `refactor/main`. C3b part 2 work proceeds on its own branch (verified per batch before any PR).

## Known blockers / risks
- No open PR. C3b part 2 is a behavior-preserving solver retrofit, net-guarded (golden 11/11 must hold + oracle
  2332/0). Any golden-vector shift = a wiring mismatch → stop+fix that batch; never widen the tolerance.

## Next concrete steps
1. **C3b part 2:** retrofit the 7 remaining families onto `defineFamily` (~3–4/commit); golden net + green bar per
   batch; PR "refactor(C3b part 2): remaining 7 families — QD-SOLV-4/5 resolved" → refactor/main; merge on green.
2. Then **Group D** (god-module decomposition: installAlgebra, ui.mjs — ui.mjs-seam stage first) or pause.
3. Group order: C (C1✓, C2✓, C3✓ on part-2 completion) → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2114/242
```
