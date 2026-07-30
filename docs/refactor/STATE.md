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
- **Phase D — Execute. Group A COMPLETE (A1/A2/A3 merged @ 3a5d18f).** User confirmed: proceed with Group B,
  auto-merge on green. **B1 branch `refactor/B1-parallelize-node-suite` cut (no commits) and fully DESIGNED
  (Next steps below); implementation NOT begun.**
- **Checkpoint before implementing B1** — it is a delicate assertion-parity test-infra port and the session
  is very long. Recommend implementing B1 with fresh context to verify parity carefully. Can proceed now if preferred.
- Cadence: auto-merge on green (user). `APPROVED: PLAN.md v1`. Deferred/open: QD-ALG-7 (→ Group D), QD-SOLV-6.
- `APPROVED: PLAN.md v1`; decisions recorded (D-1 align `{re:0}`, D-2 folderize late, D-3 include E1 last,
  D-4 keep `harness.ok` wrapped).
- A1 shipped: QD-SOLV-3 (centroid → `QD.poleCentroid`, D-1 behavior change, char-tested) + QD-SOLV-2
  (CONTRIBUTING doc). QD-ALG-7 & QD-SOLV-6 **deferred out of A1** (→ Group D / own analysis; both open).
- Roadmap (PLAN §8): A(quick wins)/B(test Stage 0, B4=net)/C(dup collapse)/D(god-module decomp)/
  E(state+folderize)/F(dependency-cruiser). Phase B complete; ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration branch: `refactor/main` @ 3a5d18f (cut from `master` @ b1e3004). Tree clean. **No PR in flight.**
- Merged stage PRs: A1 #178 (b331ae2), A3 #179 (e657769), A2 #180 (3a5d18f).

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

## Next concrete steps — Stage B1 (parallelize node-suite): DESIGN READY (verified feasible), implement next
Facts confirmed: `bootstrap.init()` memoized (test/bootstrap.js:127-130); harness counters per-worker
(harness.js:12,40); the 26 `TESTS` are order-independent (node-test.js:19-20); all run in **node** env (the 4
"DOM-ish" files run DOM-free today). Implementation:
1. Add `apps/quadrature-domains/vitest/node/_run.ts` exporting `runNodeSuiteFile(name)`: `import {beforeAll,test,
   expect}` from vitest + `createRequire(import.meta.url)`; `beforeAll(()=>require('../../app/test/bootstrap').init())`;
   `test(name, async ()=>{ const b=report(); const run=require('../../app/test/'+name+'.test.js'); await run();
   const a=report(); expect(a.pass+a.fail-(b.pass+b.fail)).toBeGreaterThanOrEqual(FLOORS[name]??3);
   expect(a.fail-b.fail).toBe(0); })`. Move the FLOORS map (node-test.js:85-91) into `_run.ts` — **KEEP it**
   (D-4 keeps `harness.ok` wrapped → per-file counts stay invisible to Vitest, so FLOORS still guards silent shrink).
2. Generate 26 thin specs `vitest/node/<name>.test.ts` via a bash loop over TESTS: line 1 `// @vitest-environment node`,
   then `import { runNodeSuiteFile } from "./_run"; runNodeSuiteFile("<name>");`.
3. Delete `vitest/node-suite.test.ts` (serial execFileSync wrapper). Keep `app/node-test.js` for standalone runs.
4. Verify: full green bar; **assertion PARITY** (sum per-file counts ≈ 2302, all pass); node-suite no longer one
   serial spec; measure wall-time drop (~40%). Watch: global visibility across Vitest workers; createRequire paths.
Then **B2** (shard `solvers.test.js` → ~25-30s) → **B4** (fake-Worker + jsdom net for `ui.mjs`/`ui-solve.mjs`).
Then C → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
