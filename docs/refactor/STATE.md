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
- **Phase D — Execute. Stage A1: MERGED** into `refactor/main` (#178 → merge commit b331ae2, CI green:
  build + browser). No stage in flight. **Awaiting user go-ahead on the next stage.**
- `APPROVED: PLAN.md v1`; decisions recorded (D-1 align `{re:0}`, D-2 folderize late, D-3 include E1 last,
  D-4 keep `harness.ok` wrapped).
- A1 shipped: QD-SOLV-3 (centroid → `QD.poleCentroid`, D-1 behavior change, char-tested) + QD-SOLV-2
  (CONTRIBUTING doc). QD-ALG-7 & QD-SOLV-6 **deferred out of A1** (→ Group D / own analysis; both open).
- Roadmap (PLAN §8): A(quick wins)/B(test Stage 0, B4=net)/C(dup collapse)/D(god-module decomp)/
  E(state+folderize)/F(dependency-cruiser). Phase B complete; ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration branch: `refactor/main` @ **b331ae2** (cut from `master` @ b1e3004). Tree clean.
- **Open PR: none.** A1 merged (#178). Stage branch `refactor/A1-confirmed-defects` is merged (safe to delete).

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
1. **Awaiting user go-ahead on the next stage** (and which). Recommended: **A3** (CD type-only cycle,
   zero-risk quick win) or straight to **Group B** (test Stage 0 — the net that gates C/D/E).
2. At next-stage start (§7.2): re-confirm `refactor/main` green (build/typecheck/lint/test) + clean,
   then cut `refactor/<stage>-<slug>` from `refactor/main`; characterization tests first.

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
