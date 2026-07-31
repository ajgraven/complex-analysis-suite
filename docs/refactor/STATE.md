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
- **Phase D — Execute. Group A (A1/A2/A3) + B1 + B2 MERGED.** B2 = #182 (merge `e74d3e6`): `solvers.test.js`
  sharded into 4 contiguous parallel node specs; `pnpm test` 157s→109s (−30%), long-pole 77s→37s; parity oracle
  2332/0, byte-identical reconstruction. §PB [826-935] (~38s atomic) caps further gains (noted, unscheduled).
- **NEXT = Stage B4 — the QD-UI characterization NET** (user: "merge when green, then proceed"). Skipping the
  optional B3 (coverage visibility). B4 builds behavior-pinning tests (fake-`Worker` + jsdom) for `ui.mjs` /
  `ui-solve.mjs` / the worker lanes + converts ~15 source-text tests to behavioral (QD-TEST-2/3/4, QD-ALG-3,
  QD-UI-5). **This is the safety net that GATES Groups C & D** — the load-bearing Stage-0 item. Medium-large.
- Cadence: auto-merge on green (user delegates the merge to me on green CI). `APPROVED: PLAN.md v1`. D-1..D-4 recorded.
- Roadmap (PLAN §8): A✓ / B(B1✓, B2✓, B3 skipped-optional, **B4 next**) / C / D / E / F.

## Branches / PR
- Integration `refactor/main` @ **e74d3e6** (B2 merge). Tree clean. **No stage branch in flight yet (B4 to be cut).**
- Merged stage PRs: A1 #178 (b331ae2), A3 #179 (e657769), A2 #180 (3a5d18f), B1 #181 (08b0fab), **B2 #182 (e74d3e6)**.

## Validation state (green bar)
- **Re-confirming green on refactor/main @ e74d3e6 now** (post-merge). Pre-merge signals: B2 branch was fully
  green (236 files / 2059 tests, 109s; oracle 2332/0); PR #182 CI **build + browser both success**.
- browser (not in core bar): `pnpm test:browser` runs in CI (was green on #182); B4 is test-infra/jsdom — no GPU.

## Uncommitted / unverified
- None (this STATE commit direct to refactor/main). B4 not started; branch not yet cut.

## Known blockers / risks
- CI health: PR #182 CI was green (build+browser), so the July "exhausted GH Actions budget" note may be resolved
  or intermittent. Still treat the LOCAL green bar as source of truth; report CI per PR.
- **B4 is the largest Stage-0 item and may split into 2–4 sub-PRs.** A scoping map (ui.mjs/ui-solve.mjs seams,
  worker lanes, existing jsdom+fake-worker test templates like `vitest/psw-lifecycle.test.ts`) is in progress.

## Next concrete steps — Stage B4 (UI characterization net)
1. Confirm the green re-check passes; then cut `refactor/B4-ui-charnet` from `refactor/main` @ e74d3e6; STATE → B4 in flight.
2. From the scoping map: decide the sub-PR decomposition (net is tests-ONLY; must pass against UNMODIFIED code per §2.2).
   Prime targets: `ui-solve.mjs` solve orchestration (input→dispatch→worker→render, supersede, error-settle) and the
   worker-lane fallback behavior (the class that shipped the "Pass 1/3" bug), reusing the repo's existing jsdom +
   worker-stub patterns. Convert source-text tests (QD-ALG-3/QD-TEST-3) to behavioral where feasible.
3. If B4 needs to touch non-test source to be testable → STOP and ask (scope expansion). Otherwise implement the
   first coherent sub-unit, green bar, PR → refactor/main, STOP for review.
4. After B4 merges: C (dup collapse) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull    # @ e74d3e6 or later
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 236 files / 2059 tests
node apps/quadrature-domains/app/node-test.js           # oracle 2332/0
```
