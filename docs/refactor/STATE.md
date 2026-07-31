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
- **Phase D — Execute. Group A COMPLETE (A1/A2/A3). Group B: B1 MERGED (#181, 08b0fab).** No stage in flight.
  B1 = node-suite → 26 parallel `vitest/node/*` specs (parity 2329/0; per-file isolation; HONEST: **neutral on
  wall time** — `solvers.test.js` ~77s long pole).
- **NEXT (fresh session): B2 — shard `solvers.test.js`** (the deferred speed win; user: "do B2 fresh"). Scope
  discovery: solvers is a **1,915-line monolithic `run()`** → parity-safe shard is **med-high risk**. Full
  resume plan in Next steps + LOG (2026-07-31 B1 entry).
- Cadence: auto-merge on green. `APPROVED: PLAN.md v1`. Deferred/open: QD-ALG-7 (→ Group D), QD-SOLV-6.
- `APPROVED: PLAN.md v1`; decisions recorded (D-1 align `{re:0}`, D-2 folderize late, D-3 include E1 last,
  D-4 keep `harness.ok` wrapped).
- A1 shipped: QD-SOLV-3 (centroid → `QD.poleCentroid`, D-1 behavior change, char-tested) + QD-SOLV-2
  (CONTRIBUTING doc). QD-ALG-7 & QD-SOLV-6 **deferred out of A1** (→ Group D / own analysis; both open).
- Roadmap (PLAN §8): A(quick wins)/B(test Stage 0, B4=net)/C(dup collapse)/D(god-module decomp)/
  E(state+folderize)/F(dependency-cruiser). Phase B complete; ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration branch: `refactor/main` @ 08b0fab (cut from `master` @ b1e3004). Tree clean. **No PR in flight.**
- Merged stage PRs: A1 #178 (b331ae2), A3 #179 (e657769), A2 #180 (3a5d18f), B1 #181 (08b0fab).

## Validation state (green bar) — established 2026-07-30 @ b1e3004; all green, no pre-existing failures
- build:      `pnpm build`      → exit 0
- typecheck:  `pnpm typecheck`  → exit 0
- lint:       `pnpm lint`       → exit 0
- test:       `pnpm test`       → exit 0  (206 files / 2017 tests, ~156s; QD node-suite ~128s of that)
- browser (not in core bar): `pnpm test:browser` (Chromium preinstalled; not yet run)
- format:     `pnpm format:check`

## Uncommitted / unverified
- None. A1 merged to `refactor/main`; tree clean.
- Green: A1 content was CI-green (build+browser) and locally green (2023 passed / 207 files). The merge
  commit adds only a docs-only STATE delta, so refactor/main is green by construction — re-confirm at next-stage start.

## Known blockers / risks
- CI health unknown (July review reported an exhausted GH Actions spending limit). Treat the LOCAL
  green bar as source of truth; report CI per PR without blocking on it.

## Next concrete steps (fresh session resumes here) — Stage B2: shard solvers.test.js (the deferred speed win)
0. Confirm PR #181 (B1) merged; `refactor/main` green + clean. (B1 done: node-suite = 26 parallel `vitest/node/*` specs.)
1. **B2 — shard `solvers.test.js` (QD-TEST-5).** It's a **1,915-line monolithic `run()`** (app/test/solvers.test.js:10-1915):
   shared helpers + `vm` setup (~10-676), then 8 `runFamilyBattery('X',[…preset array…])` blocks at
   677/688/714/1138/1735/1742/1755/1800, interleaved with inline tests. Plan: extract the shared helpers so
   shard fns can reuse them; split the 8 batteries (+ inline blocks) into ~4 balanced shards; wire each as a
   `vitest/node` spec (extend `_run.ts`). **Verify PARITY**: sum shard assertions == solvers' ~451 (oracle
   `node app/node-test.js` = 2329/0). Target: longest spec ~19-25s → suite ~128s→~25-35s. **Med-high risk → char-test-first.**
2. Then B3 (QD coverage), **B4** (fake-Worker + jsdom net for `ui.mjs`/`ui-solve.mjs` — the safety net gating C/D),
   then C (dup collapse) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
