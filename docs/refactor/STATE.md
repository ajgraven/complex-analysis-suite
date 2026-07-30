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
- **Phase D — Execute. Cadence: AUTO-MERGE ON GREEN (user, 2026-07-30).** A1 (#178) + A3 (#179) MERGED.
  **Stage A2 IN FLIGHT — PR #180 open** (QD-SOLV-1 dispatch-order assertion; local green 2031/208).
  Auto-merges on green CI (send_later re-check @ 23:44Z). After A2, **Group A (quick wins) is done** →
  PAUSE to confirm the Group-B (test Stage 0) approach before B1 (a substantial node-suite migration).
- `APPROVED: PLAN.md v1`; decisions recorded (D-1 align `{re:0}`, D-2 folderize late, D-3 include E1 last,
  D-4 keep `harness.ok` wrapped).
- A1 shipped: QD-SOLV-3 (centroid → `QD.poleCentroid`, D-1 behavior change, char-tested) + QD-SOLV-2
  (CONTRIBUTING doc). QD-ALG-7 & QD-SOLV-6 **deferred out of A1** (→ Group D / own analysis; both open).
- Roadmap (PLAN §8): A(quick wins)/B(test Stage 0, B4=net)/C(dup collapse)/D(god-module decomp)/
  E(state+folderize)/F(dependency-cruiser). Phase B complete; ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration branch: `refactor/main` @ e657769 (cut from `master` @ b1e3004). Tree clean.
- **Stage in flight: `refactor/A2-dispatch-order` → PR #180** (auto-merge on green). A1 (#178) + A3 (#179) merged.
  https://github.com/ajgraven/complex-analysis-suite/pull/180

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

## Next concrete steps
1. Auto-merge PR #180 (A2) once CI is green — send_later re-check @ 23:44Z; subscribed for failures.
2. On merge: mark **Group A complete** (A1/A2/A3 merged; QD-ALG-7 & QD-SOLV-6 remain deferred/open),
   then **PAUSE and confirm the Group-B approach** with the user before starting B1.
3. **Group B (test Stage 0)** once confirmed: B1 port the 26-file node-suite → parallel Vitest (keep
   `harness.ok` wrapped, D-4); B2 shard `solvers.test.js` (~128s→~25-30s); B4 the `ui.mjs`/`ui-solve.mjs`
   characterization net. Gates all QD structural work (C/D/E). Then C → D → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
