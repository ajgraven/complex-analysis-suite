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
- **Phase D — Execute. Group A (A1/A2/A3) + B1 MERGED. Stage B2 IN FLIGHT** on `refactor/B2-shard-solvers`.
- **B2 — shard the 1,915-line monolithic `solvers.test.js` `run()`** into 4 contiguous parallel `vitest/node`
  specs (the deferred speed win; `solvers` ~77–98s is the QD long pole). User: "do B2 fresh" — this is that session.
- **Risk downgraded from med-high** by a verified statement-map of `run()`: clean seams — only ONE trivial
  cross-block binding (`const verifyQuadratureIdentity` @ line 62, used @ 77/129, BOTH in shard 1), NO shared
  mutable state, `run()` returns nothing (assertions tally via injected global `ok()` side-effect). ⇒ 4 EXACT
  contiguous slices are byte-identical to the original body (provable by diff) ⇒ behavior-preserving by construction.
- Cadence: auto-merge on green. `APPROVED: PLAN.md v1`. Decisions D-1..D-4 recorded. Deferred/open: QD-ALG-7 (→ D), QD-SOLV-6.
- Roadmap (PLAN §8): A✓ / B(B1✓, B2 now, B3, B4=net) / C / D / E / F. Phase B complete; ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration `refactor/main` @ d74fd2e (08b0fab B1 merge + docs). Tree clean.
- **Stage branch `refactor/B2-shard-solvers`** cut from d74fd2e. **No PR yet.**
- Merged stage PRs: A1 #178 (b331ae2), A3 #179 (e657769), A2 #180 (3a5d18f), B1 #181 (08b0fab).

## Validation state (green bar) — re-confirmed 2026-07-31 @ `refactor/main` d74fd2e; ALL GREEN
- build / typecheck / lint → exit 0; test → exit 0 (**233 files / 2056 tests**, ~157s).
- Oracle: `node app/node-test.js` → **2329/0** (27 runner lines ⇒ 2302 content assertions). `solvers` contributes **S=451**/0.
- browser (not in core bar): `pnpm test:browser` NOT run — B2 is test-infra only (no GPU/shader), not needed.

## Uncommitted / unverified
- This STATE commit = B2-in-flight checkpoint (direct to refactor/main). Implementation happens next on the stage branch.
- Parity contract for B2: Σ(4 shard contributions) == **451**; oracle 2329 → **2332** (+3 runner lines from +3 files, accounted);
  vitest 2056 → **2059**. All to be verified against actual output before the PR.

## Known blockers / risks
- CI health unknown (July review reported an exhausted GH Actions spending limit). Treat the LOCAL green bar as
  source of truth; report CI per PR without blocking on it.

## Next concrete steps — Stage B2 (on `refactor/B2-shard-solvers`)
1. Build 4 contiguous shards `app/test/solvers-{1..4}.test.js` (identical preamble; body slices at verified block
   boundaries near 676/1137/1734, ADJUSTED for TIME balance — measure each shard's runtime + contribution). Delete original.
2. Rewire: `app/node-test.js` TESTS ('solvers' → 4 names) + FLOORS; replace `vitest/node/solvers.test.ts` with 4 specs;
   `vitest/node/_run.ts` FLOORS. (`vitest.config.ts` globs `vitest/**/*.test.ts` — new specs auto-register.)
3. VERIFY: `diff` concat(shard bodies) == original body; oracle → 2332/0 with Σ=451; full green bar; measure QD-suite
   wall-time win (target longest shard ~20–30s, suite test phase well below the ~157s baseline).
4. Docs on branch: LOG (B2 outcomes), PLAN (§10 fix stale "B1 IN REVIEW" → merged; mark B2), ASSESSMENT/ISSUES (QD-TEST-5).
   STATE on refactor/main. Push; open PR; STOP for review.
5. Then B3 (QD coverage), B4 (the UI char-net gating C/D) → C → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/B2-shard-solvers    # or refactor/main if the B2 PR is already merged
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
node apps/quadrature-domains/app/node-test.js          # oracle: 2329/0 before B2 → 2332/0 after
```
