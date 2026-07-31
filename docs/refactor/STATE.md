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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 DONE + C2 DONE; C3 started (net-first).**
- **C3a (golden solver-family net) — PR #190 OPEN (CI pending).** Tests-only net for QD-SOLV-4/5, laid FIRST
  (C3 is the delicate SOLVER stage; mirrors B4→C1). `vitest/solver-family-golden.test.ts` (11) pins
  `residual`/`packPhi`/`computeTargets` per family on the deterministic `initialGuess` phi (test-derived inputs).
  Mutation-verified; green 2114/242. Shells confirmed uniform (17-key base; +`sampleBoundary` on 4 PQD → 18;
  `{A,F,G}` only on unboundedLQD_singular; math per-family) → `defineFamily` feasible.
- **C3b (the factoring) is NEXT** — `defineFamily(config)` + seeds-common: factor the ~17-key record scaffolding
  across all 10 `solver-*.mjs` + normalize the seed-arg convention (3 unwrap `norm` positionally, 7 pass whole).
  **Math untouched** (evalPhi/phiTaylorAt/computeTargetA/residual — injected, not unified). Guarded by the C3a net
  staying bit-(near)identical. On #190 merge I'll present the C3b design for a quick confirm, then implement.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓ / B✓ / **C (C1✓, C2✓; C3a in review, C3b)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **0a05ae5** (this STATE commit advances it). Tree clean.
- **PR #190 OPEN (CI pending):** `refactor/C3a-family-golden-net` (ec12c05 net + 7c57b23 docs) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, C1b #188, **C2 #189 (3cc3e0d)**.

## Validation state (green bar)
- **C3a branch @ 7c57b23 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2114 passed / 242 files**
  (+11, +1 file). Golden net 11/11 on unmodified families; mutation-verified.
- `refactor/main` @ 0a05ae5 (post-C2) green: 2103/241.

## Uncommitted / unverified
- None. C3a committed (ec12c05, 7c57b23) + pushed; PR #190 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #190 CI green**, then merge (per cadence). Tests-only, zero behavior risk.
- **C3b is the delicate solver refactor** (10 files). Net-guarded by C3a; math injected, not touched; will present
  its design at the post-merge gate before implementing.

## Next concrete steps
1. **When PR #190 CI greens → merge** (merge-commit, title + `(#190)`), pull, re-confirm green (2114/242).
2. **C3b:** write `app/solvers/define-family.mjs` (`defineFamily(config)`); retrofit the 10 `solver-*.mjs` to
   call it; prove the C3a golden net stays identical + full green bar. Present the 1-para design at the gate first.
3. Group order: C (C1✓, C2✓; C3a✓/C3b) → D (god-module decomp) → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #190 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2114/242
```
