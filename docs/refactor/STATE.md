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
- **Phase B — Review (read-only).** Breadth pass **complete** (ASSESSMENT §1–2 written & committed).
  5 depth targets prioritized. **Next: depth pass 1 — QD `algebra/` subsystem.**
- Approved mandate (Phase A Q&A → PLAN.md v0 §4): fresh architectural review (do NOT re-derive the
  July-2026 line findings); focus = QD internal structure + testability/dev-loop + clarity/onboarding;
  appetite = deeper redesign where warranted (ADR-bound, behavior-preserving unless separately approved).
- Headline breadth findings: QD ~60% of code & untyped; QD `app/` is a flat 102-file/~57k-line pile;
  god-modules (sym-core 6k, algebra-ui 5k/churn 20×, cd main.ts 4.6k, algebra-store 3k); QD 0 import
  cycles (coupling hides in store/worker/globals); CD `render/` has a 2-cycle knot; packages healthy.

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
1. Depth pass 1 — QD `algebra/` (algebra-ui, algebra-store, prove-plan, algebra-canvas): delegate
   read to a subagent, verify claims, write ASSESSMENT §3 + ISSUES; commit.
2. Depth pass 2 — QD core solve/UI + store/worker coupling layer.
3. Depth pass 3 — test infra & the ~128s node-suite.
4. Depth pass 4 — CD `main.ts` + `render/` cycles. Depth pass 5 — sym-core/@cas-exact boundary (structural only).
5. Light pass — packages + correspondences (confirm health). Then systemic patterns (ASSESSMENT §4).
6. STOP before Phase C (architecting the plan) to present findings and take input, per user request.

## Resume commands
```
git fetch && git checkout refactor/main && git log --oneline -10 refactor/main
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
