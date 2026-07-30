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
- **Phase B — Review (read-only): COMPLETE.** Breadth (§1–2), all 5 depth passes (§3.1–3.5), and the
  systemic synthesis (§4) are written to ASSESSMENT.md; 36 findings registered in ISSUES.md. All
  subagent claims re-verified against code before recording (spot-checks in LOG.md).
- **Next: present Phase B findings in chat and STOP for user input before Phase C** (the 2nd checkpoint
  the user requested — "before architecting the final refactor plan"). Do NOT start Phase C / PLAN v1
  until the user weighs in.
- Approved mandate (PLAN.md v0 §4): fresh architectural review; focus = QD internals + testability +
  clarity; appetite = deeper redesign where warranted (ADR-bound, behavior-preserving unless approved).
- Headline: value is **concentrated in QD orchestration/UI + CD god-modules**; packages, prove-plan,
  algebra-store, solver math, correspondences are healthy. 6 systemic patterns (S1 god-modules from
  un-extracted orchestration; S2 parallel-family duplication — already shipped a bug; S3 informal state/
  contracts; S4 safety-net thinnest where debt deepest; S5 flat org; S6 doc drift). Recommend a narrow,
  seam-first, behavior-preserving intervention — NOT a rewrite.

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
1. **STOP — awaiting user input on the Phase B findings before Phase C** (the 2nd requested checkpoint).
2. On resume: write PLAN.md v1 (Phase C) — current-state assessment; classified findings; target
   architecture; a **seam-first, behavior-preserving, staged** roadmap; decision points. Bump to v1,
   then request `APPROVED: PLAN.md v1` before ANY implementation.
3. Roadmap shape to propose (seam-first): build QD test seams (QD-TEST-1/2/4 — port+shard the node-suite;
   fake-Worker tests) BEFORE any QD structural move; pair CD-4 (type-only cycle, cheap/safe) as an early
   quick win; then S1/S2 extractions behind the seams. Sequence per S4 (safety net before movement).

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
