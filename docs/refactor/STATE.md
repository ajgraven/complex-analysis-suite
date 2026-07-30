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
- **Phase C — Plan: PLAN.md v1 WRITTEN. STOP — awaiting approval token `APPROVED: PLAN.md v1`.**
  Do NOT begin any implementation (not even Group-A quick wins) until the literal token arrives.
- Phase B (review) complete: ASSESSMENT §1–4, 36 findings in ISSUES; all claims re-verified (LOG).
- Round-2 scope (PLAN §4): broad structural sweep **concentrated on QD** (full god-module decomposition,
  folderize, S2 duplication collapse), **test-infra as Stage 0**, **CD = cheap type-only-cycle fix only**.
- Roadmap (PLAN §8): Groups A(quick wins)/B(test Stage 0, B4=net)/C(dup collapse)/D(god-module decomp)/
  E(state+folderize)/F(dependency-cruiser). ~15 PRs. 4 open decision points (PLAN §9): D-1 centroid fallback,
  D-2 folderize timing, D-3 E1 scope, D-4 harness style.

## Branches / PR
- Integration branch: `refactor/main` (cut from `master` @ b1e3004).
- Stage branches (later): `refactor/<stage-id>-<slug>` → one PR each → target `refactor/main`; never self-merge.
- Open PR: none.

## Validation state (green bar) — established 2026-07-30 @ b1e3004; all green, no pre-existing failures
- build:      `pnpm build`      → exit 0
- typecheck:  `pnpm typecheck`  → exit 0
- lint:       `pnpm lint`       → exit 0
- test:       `pnpm test`       → exit 0  (206 files / 2017 tests, ~156s; QD node-suite ~128s of that)
- browser (not in core bar): `pnpm test:browser` (Chromium preinstalled; not yet run)
- format:     `pnpm format:check`

## Uncommitted / unverified
- None after the scaffold commit.

## Known blockers / risks
- CI health unknown (July review reported an exhausted GH Actions spending limit). Treat the LOCAL
  green bar as source of truth; report CI per PR without blocking on it.

## Next concrete steps
1. **STOP — awaiting the literal token `APPROVED: PLAN.md v1`.** No implementation until then (Phase D).
2. On approval: confirm `refactor/main` green + clean; cut `refactor/A1-<slug>` (or A3) from `refactor/main`.
   Group A quick wins + Stage 0 test net (B) land first; ALL QD structural work (C/D/E) is gated behind B4.
3. Also resolve the 4 decision points (PLAN §9) — D-1 is a behavior-change sign-off; D-2/D-3/D-4 shape sequencing.
   Any revision → bump PLAN to v2 and re-request the token.

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
