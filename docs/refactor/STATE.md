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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 DONE, C2 DONE, C3a (golden net) MERGED.**
- **C3a (DONE, merged 8357d15):** the golden solver-family net (`vitest/solver-family-golden.test.ts`, 11) pins
  `residual`/`packPhi`/`computeTargets` per family on the deterministic `initialGuess` phi — the safety net for C3b.
  Green 2114/242; shells confirmed uniform (17-key base; +`sampleBoundary` on 4 PQD → 18; `{A,F,G}` only on
  unboundedLQD_singular; math per-family).
- **AWAITING USER GO for C3b (the defineFamily factoring)** — presented at this gate; do NOT auto-start. C3b:
  write `app/solvers/define-family.mjs` (`defineFamily(config)` builds the ~17-key record from config +
  normalizes the seed-arg convention), then retrofit the 10 `solver-*.mjs` to call it. **Math untouched**
  (evalPhi/phiTaylorAt/computeTargetA/residual/… injected, not unified). Guarded by the C3a golden net staying
  bit-(near)identical. Plan: incremental (~2–3 families/commit) to de-risk the solver core. This is the
  highest-stakes change of the engagement → present-and-confirm before implementing.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1✓, C2✓, C3a✓; C3b)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **8357d15** (C3a merge-commit; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, C1b #188, C2 #189, **C3a #190 (8357d15)**.

## Validation state (green bar)
- **`refactor/main` @ 8357d15 — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0; `pnpm test`
  **2114 passed / 242 files**. Golden family net 11/11; worker nets 54/54 + 11/11.

## Uncommitted / unverified
- None. C3a merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding at the C3b design gate** (await go). No blockers.
- **C3b is the delicate solver refactor** (10 files). Fully net-guarded (C3a); math injected, not touched;
  incremental commits + golden-vector re-check per family.

## Next concrete steps
1. **HOLD** — await user's go for C3b (or a redirect: C2b / Group D / pause).
2. **C3b:** `defineFamily(config)` module; retrofit the 10 `solver-*.mjs` incrementally; C3a golden net + full
   green bar identical throughout; own PR → refactor/main; merge on green.
3. Group order: C (C1✓, C2✓, C3a✓; C3b) → D (god-module decomp) → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2114/242
```
