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
- **Phase D — Execute. Group A + B1 + B2 + B4-1 MERGED.** B4-1 = #183 (merge `e1a148a`): 12-test `ui-solve.mjs`
  orchestration net (tests-only, mutation-verified). B2 = #182: solvers 4-way shard (long-pole 77s→37s).
- **Stage B4-2 (worker-lane characterization net) — IN FLIGHT on `refactor/B4-2-worker-lanes`.** Tests-only, no
  source change. Extract a shared `vitest/helpers/fake-worker.mjs` (from the inline fakes in `psw-lifecycle.test.ts`
  + `schwarz-cpu-worker-crash.test.ts`), then pin the 6 lanes' lifecycle (spawn-fault fallback / supersede / cancel
  / crash-settle) — the net for the Group-C worker-lane dedup (C1 `createWorkerLane` / C2 typed protocol). Scoping
  map in progress (existing coverage vs gaps).
- **B4 scope (from B4-1, unchanged):** narrowed to no-source-change net; **DEFERRED** ui.mjs seam (own stage before
  D2) + algebra source-text conversion (→ D1). Flagged to user; proceeding per "proceed"/"pick up".
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`. Roadmap §8: A✓/B(B1✓,B2✓,B3 skipped,B4-1✓,**B4-2 now**)/C/D/E/F.

## Branches / PR
- Integration `refactor/main` @ e1a148a (B4-1 merge). Tree clean. **Stage branch `refactor/B4-2-worker-lanes` cut.**
- Merged stage PRs: A1 #178, A3 #179, A2 #180, B1 #181, B2 #182, **B4-1 #183 (e1a148a)**.

## Validation state (green bar)
- **Re-confirming green on refactor/main @ e1a148a now** (post-merge). Pre-merge: B4-1 branch green (2071/237);
  PR #183 CI build+browser both success. Prior main green: 2059/236, oracle 2332/0.
- browser not run for B4 stages (jsdom/test-infra only, no GPU).

## Uncommitted / unverified
- None (this STATE commit direct to main). B4-2 has no commits yet; awaiting the scoping map before building.

## Known blockers / risks
- Scope forks deferred (ui.mjs-seam, algebra source-text) — flagged; user may redirect.
- B4-2 caution: extracting the shared fake-worker helper may mean editing the 2 existing (passing) lane tests to
  import it — prefer additive (new helper + new tests) unless the dedup is low-risk. Decide from the scoping map.

## Next concrete steps — Stage B4-2
1. Confirm re-check green. From the scoping map: build `vitest/helpers/fake-worker.mjs` + behavioral tests filling
   the lane-coverage gaps (per-lane spawn-fault fallback latch independence; supersede→{aborted,superseded}; cancel→
   terminate/settle; crash-settle; the aux/live missing-`messageerror` asymmetry; param-slice-pool spawn-fail; sym).
2. All tests pass against UNMODIFIED code (§2.2); mutation-verify the net bites. Green bar; PR → refactor/main; STOP.
3. Then the DEFERRED B4 items decision (ui.mjs-seam stage / algebra→D1), then C (dup collapse, incl. the lane factory
   this net guards) → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # @ e1a148a or later
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2071/237
# B4-2 work: git checkout refactor/B4-2-worker-lanes
```
