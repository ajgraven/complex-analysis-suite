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
- **Phase D — Execute. Groups A + B + C COMPLETE.** C3b part 2 MERGED (be6a51e) → all 10 solver families on
  `defineFamily`. **Group C (duplication collapse) is done:** C1 worker lanes (createWorkerLane +
  formatWorkerErrorDetail), C2 typed worker protocol, C3 family factory.
- **AWAITING USER DIRECTION for the next block** (holding — do not auto-start). Options:
  - **(a) Group D — god-module decomposition** (the biggest remaining structural wins): `installAlgebra`
    (~4.2k-line fn, QD-ALG-1) + `ui.mjs` (~20 responsibilities, QD-UI-2). High value, high risk, multi-stage.
    **Prereq:** the deferred **ui.mjs-seam** stage FIRST (add a testable seam + a characterization net — QD-UI-2/
    QD-TEST-2 have zero coverage today) before decomposing (D2). installAlgebra (D1) needs its own net too.
  - **(b) small Group-C follow-ons:** QD-SOLV-5 `seeds-common` (the seed strategy files stay per-family) and/or
    C2b (route the sym/param-slice/schwarz worker entries through `protocol.mjs`). Low risk, modest value.
  - **(c) pause** at this Groups-A/B/C-complete milestone.
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: **A✓ / B✓ / C✓** / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **be6a51e** (C3b-p2 merge; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs (14): A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, B4-1 #183, B4-2a #184, B4-2b #185, C1a #186,
  B4-2c #187, C1b #188, C2 #189, C3a #190, C3b-p1 #191, **C3b-p2 #192 (be6a51e)**.

## Validation state (green bar)
- **`refactor/main` @ be6a51e — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0; `pnpm test`
  **2114 passed / 242 files**; golden family net 11/11; worker nets 54/54 + 11/11; node oracle 0 failed.

## Uncommitted / unverified
- None. C3b part 2 merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding for next-block direction** (Group D / small follow-ons / pause). No blockers.
- Group D is the highest-risk work (god-modules, ~20 responsibilities); it needs seams + characterization nets
  FIRST (net-first discipline, as B4→C and C3a→C3b proved).

## Next concrete steps
1. **HOLD** — await user's choice: (a) Group D (ui.mjs-seam first) / (b) QD-SOLV-5 or C2b follow-ons / (c) pause.
2. Whichever: net-first, behavior-preserving, own PR(s) → refactor/main; merge on green.
3. Group order: A✓ B✓ C✓ → **D (god-module decomp)** → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2114/242
```
