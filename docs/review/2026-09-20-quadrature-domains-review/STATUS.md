# Remediation status — read first, update last

Plan: [`REMEDIATION-PLAN.md`](REMEDIATION-PLAN.md). Report: [`REPORT.md`](REPORT.md).
Integration branch: _set by the session that starts Wave 0_ (the session's designated branch).
Rule: do the wave named under **Current**, merge its WPs in the stated order, run the full gate after each
merge, update this file, push. Never end a session with unpushed work. A WP that cannot be done as written
is recorded under **Deviations**, not silently changed. Pause for the owner's review at every wave gate.

## Current

- **Wave 0 — not started.** Run WP0 alone first; it makes the gate safe for the parallel waves.

## Baseline (measured at `5ebfa54` on 2026-09-20)

| check | result |
| --- | --- |
| `node app/node-test.js` (in the app) | 2342 passed / 0 failed, 57 s idle, 91 s under load |
| Vitest project `quadrature-domains` | 136 spec files / 1256 tests |
| QD browser suite | 4 files / 17 tests |
| `pnpm lint && pnpm typecheck` | silent |
| built app in headless Chromium | 0 console errors, 0 unnamed interactive AX nodes |

## Waves and work packages

| Wave | WP | Closes | Effort | Status | Commits | Gate after merge |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | WP0 gate hygiene, thesis text, status scaffold | TEST-1, TEST-4, DOC-1 | S | not started | | |
| 1 | WP1 refuse weighted unbounded export | WGT-1 (producer), TEST-11 | S | not started | | |
| 1 | WP2 a zero row is not a node | UI-1 | S | not started | | |
| 1 | WP3 σ poles at the nodes | SCH-2, SCH-4, SCH-7 | S | not started | | |
| 1 | WP4 `factor` and perfect powers | ALG-1, ALG-4, ALG-8 | S | not started | | |
| 2 | WP5 unbounded direct problem | DIR-1/2/3/7/10/12, M18, TEST-8 | M | not started | | |
| 2 | WP6 certified geometric properties, honest cusps | DIR-4, DIR-8, M09/M10/M13 | M | not started | | |
| 2 | WP7 critical points globally, c\* exactly | SOLV-2, SOLV-3, SOLV-13, M15 | M | not started | | |
| 2 | WP8 structured refusals; a point is not a domain | WGT-2/3, PSW-2/3/12, M25/M26 tests | M | not started | | |
| 3 | WP9 one identity verifier, ρ-sized, fail-closed | PSW-1 (= SOLV-14), PSW-4/5/8/9 | M | not started | | |
| 3 | WP11 `parse-h` says what it decided | SOLV-5, SOLV-6 (parse-h), SOLV-10 | S | not started | | |
| 3 | WP10 non-dimensionalise the solver (after WP9 + WP11) | SOLV-1/4/7/8/9, M03/M04/M05/M07 | M | not started | | |
| 4 | WP12 the wire is this domain (cross-app) | UI-2, WGT-1 (consumer), UI-8 | M | not started | | |
| 4 | WP13 figures and links carry their recipe | UI-4, SCH-5, improvement 28 | M | not started | | |
| 4 | WP14 the mask stops shrinking Ω (cross-app) | SCH-1, SCH-3, SCH-6 | M | not started | | |
| 5 | WP18-pre widen the clean-realm battery | TEST-1 (second half) | S | not started | | |
| 5 | WP17 tests and CI as an instrument | TEST-3/5/6/7/9/12/13 | M | not started | | |
| 5 | WP15 algebra engine robustness | ALG-2/3/5/6/7/9/10/11 | M | not started | | |
| 5 | WP16 shell robustness and the slice UI | UI-5/6/7/9/10, PSW-6/7/10/11/13/14, SCH-9/10 | M | not started | | |
| 6 | WP18 app-local documentation | DOC-2…13 + all drift tables | M | not started | | |
| 6 | WP19 repo-level docs and the review loop | DOC-12, CLAUDE.md claims | S | not started | | |
| 7 | WP20 … WP31 research-facing improvements | report §9 | M–L each | awaiting owner go/no-go per WP | | |

## Decisions pending (plan § "Decisions to record")

1. `browser` job as a publish blocker — _undecided_
2. `weight` on the wire now / weighted MapSpec ADR later — _undecided_
3. Refuse `h ≡ 0` and bounded `polyPart` by name — _undecided (plan default: refuse)_
4. SW update banner: wire or delete — _undecided (plan default: wire)_
5. Wave 7 selection and order — _undecided_

## Deviations

_None yet._

## Findings during execution

_None yet._
