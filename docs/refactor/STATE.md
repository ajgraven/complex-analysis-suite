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
- **Phase D — Execute. Group A + B COMPLETE. Group C: C1 DONE, C2 DONE, C3a DONE; C3b in progress.**
- **C3b part 1 — PR #191 OPEN (CI pending).** NEW `app/solvers/define-family.mjs` (`defineFamily(config)` factors
  the record scaffolding — enforce flags, computeTargets composition, default diverseInitialGuess, key layout) +
  3/10 families retrofit (boundedQD/unboundedQD/boundedLQD, spanning the divergences). Behavior-preserving
  (C3a golden net 11/11; node oracle 2332/0; 2114/242). **Math untouched** (injected verbatim).
- **FINDING:** the shells diverge more than the C3a map showed — `diverseInitialGuess` is per-family for LQD (own
  kernel, not the shared delegation); seed/continuation arg conventions vary. So defineFamily **injects** those
  (default diverse only when omitted) — a scaffolding-factor, not a collapse. Modest-but-real DRY win.
- **C3b part 2 (NEXT, on #191 merge):** retrofit the remaining 7 families — unboundedLQD, boundedLQD_singular,
  unboundedLQD_singular (`{A,F,G}` → computeTargetG), powerQD (positional w0+alpha), powerQD_singular, unboundedPQD,
  unboundedPQD_singular (the `sampleBoundary` key). Same proven pattern; golden net + green bar per batch. Then
  QD-SOLV-4/5 is RESOLVED (all 10 on defineFamily).
- Cadence: merge on green (user delegates; user chose "Go — incremental" for C3b). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / **C (C1✓, C2✓, C3a✓; C3b 3/10 in review, part 2)** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **94a37db** (this STATE commit advances it). Tree clean.
- **PR #191 OPEN (CI pending):** `refactor/C3b-define-family` (c7a1192 refactor + b9c4efc docs) → `refactor/main`.
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, C1b #188, C2 #189, **C3a #190 (8357d15)**.

## Validation state (green bar)
- **C3b branch @ b9c4efc — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2114/242** (unchanged — source
  refactor, guarded by the C3a golden net staying 11/11); node oracle **2332/0**.
- `refactor/main` @ 94a37db (post-C3a) green: 2114/242.

## Uncommitted / unverified
- None. C3b part 1 committed (c7a1192, b9c4efc) + pushed; PR #191 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #191 CI green**, then merge (per cadence). Behavior-preserving; net-guarded (golden 11/11 + suite).
- Intermediate state after merge: 3 families on defineFamily, 7 on literals (both green) — completed by part 2.

## Next concrete steps
1. **When PR #191 CI greens → merge** (title + `(#191)`), pull, re-confirm green (2114/242).
2. **C3b part 2:** retrofit the remaining 7 families onto defineFamily, ~3–4/commit, golden net + green bar per
   batch; own PR → refactor/main. Resolves QD-SOLV-4/5.
3. Group order: C (C1✓, C2✓, C3a✓; C3b) → D (god-module decomp) → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #191 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2114/242
```
