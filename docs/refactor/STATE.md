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
- **Phase D — Execute. Cadence: AUTO-MERGE ON GREEN (user, 2026-07-30).** A1 merged (#178, b331ae2).
  **Stage A3 IN FLIGHT — PR #179 open** (CD-4: type-only render cycle broken via `render/laminationTypes.ts`;
  local green + madge 2→0). Auto-merges on green CI (send_later re-check @ 23:25Z), then continues to A2.
- `APPROVED: PLAN.md v1`; decisions recorded (D-1 align `{re:0}`, D-2 folderize late, D-3 include E1 last,
  D-4 keep `harness.ok` wrapped).
- A1 shipped: QD-SOLV-3 (centroid → `QD.poleCentroid`, D-1 behavior change, char-tested) + QD-SOLV-2
  (CONTRIBUTING doc). QD-ALG-7 & QD-SOLV-6 **deferred out of A1** (→ Group D / own analysis; both open).
- Roadmap (PLAN §8): A(quick wins)/B(test Stage 0, B4=net)/C(dup collapse)/D(god-module decomp)/
  E(state+folderize)/F(dependency-cruiser). Phase B complete; ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration branch: `refactor/main` @ 3f26a6f (cut from `master` @ b1e3004). Tree clean.
- **Stage in flight: `refactor/A3-cd-cycle` → PR #179** (auto-merge on green). A1 (#178) merged.
  https://github.com/ajgraven/complex-analysis-suite/pull/179

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
1. Auto-merge PR #179 (A3) once CI (build+browser) is green — send_later re-check @ 23:25Z; subscribed for failures.
2. Then **A2** (QD-SOLV-1): add a startup assertion that every `_singular` family outranks its base in
   `familyDispatchOrder` (+ characterization test); auto-merge on green.
3. Then **Group B** (test Stage 0): B1 port node-suite → parallel Vitest, B2 shard solvers, B4 the
   characterization net for `ui.mjs`/`ui-solve.mjs` (gates all QD structural work C/D/E).

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
