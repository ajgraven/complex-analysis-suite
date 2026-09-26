# Quadrature Domains review, 2026-09-26: agent brief

Every reviewer gets this brief. You own one slice (named in your prompt).

## Goals (from the owner)

1. Errors, bugs, stale documentation.
2. Structural issues; confused or poorly implemented functionality.
3. Possible improvements to the app's CORE functionality (the mathematics and what a researcher can do with it).

## The app

`apps/quadrature-domains` (QD). About 88.5k lines of vanilla ESM JS (`allowJs`, deliberately NOT a `@cas/ui` consumer),
built with Vite. It visualises simply connected quadrature domains: bounded (QD), unbounded (UQD), power-weighted (PQD),
log-weighted (LQD), mixed variants and singular/cusp cases. Views: inverse solve, direct, parameter slice, Schwarz reflection
fractal (WebGL), Riemann sphere, and an algebra/CAS workspace.
Theory references: `thesis.txt` (the owner's Caltech 2026 thesis, plain text), `THEORY_MAP.md`,
`SCHWARZ_FORMULATION.md`, `AHARONOV_SHAPIRO.md`, `prop463.txt`.

## Binding project rules to review against (CLAUDE.md)

- **ADR-0006 conventions.** QD uses `dA = dx dy/π` and a suppressed `1/(2πi)` contour factor. These must live at the app
  edge. Anything QD sends over `@cas/interchange` must be canonical and convention-tagged. A silent factor of π or 2πi
  is a top-severity finding.
- **Honest labelling.** `=` exact, `≤` rigorous bound, `≈` estimate. A value shown as more certain than its computation earns is a bug.
- **Share-link backward compatibility.** Old URL formats must still open.
- **One dependency direction.** No app imports another app.

## Prior reviews (do not re-report fixed items; DO flag items reported but still unfixed)

`docs/review/2026-08-23-comprehensive-review/`, `docs/review/2026-08-suite-review/`, `docs/review/CODEBASE_REVIEW_2026-07.md`,
`docs/review/RAW_FINDINGS_2026-07.md`, `docs/algebra-review/` (especially `audit/`, `FINAL_REPORT.md`). grep them for QD items in your slice.

## Baseline

Deps are installed and `packages/*` are built. `npx vitest run --project quadrature-domains` is green:
**165 files / 1285 tests** (about 20 min). `app/node-test.js` runs the legacy headless suite standalone.

## Rules of engagement

- **Do NOT edit any tracked file.** The only exception is your own slice report (below). Several agents share this checkout.
- Put probe scripts and scratch output under
  `/tmp/claude-0/-home-user-complex-analysis-suite/7d83a4a1-9cc2-5097-8eba-a8efea56452d/scratchpad/<your-slice>/`.
- Do NOT run the root `pnpm build`, `pnpm test`, `pnpm lint`, the full gate, or anything that rewrites `packages/*/dist`.
  Run targeted specs only: `npx vitest run --project quadrature-domains <path-or-filter>` from the repo root, or node probe
  scripts that import the `.mjs` modules. (The `infra` slice alone may run `pnpm -C apps/quadrature-domains build`
  and `lint`/`typecheck` for QD. The `schwarz` slice alone may run the QD browser suite.)
- **Evidence over assertion.** For a bug or maths error, give a reproduction: a command or probe plus its actual output, or an
  exact file:line with the reasoning. Say what you measured versus what you inferred. Re-derive maths independently
  (from the thesis or first principles). Do not trust a comment's claim about the code.
- Check a claim against the code before reporting it; code comments and docs in this repo are sometimes stale.
- Prefer fewer, well-evidenced findings over a long speculative list. Mark uncertain ones `confidence: low`.

## Severity

- **P0**: wrong mathematics shown to the user as correct; a silent convention (π/2πi) error; an honest-labelling
  violation on a headline value; data or share-link loss; a crash on a mainstream path.
- **P1**: a user-visible bug or incorrect behaviour on a less-central path; a test that passes vacuously on an important property.
- **P2**: structural or maintainability problems, confused design, dead code, missing test coverage of a real risk, perf.
- **P3**: nits, minor doc staleness.
- **IMP**: an improvement to core functionality (not a defect). Give value and cost (S/M/L).

## Report format

Write `docs/review/2026-09-26-quadrature-domains-review/slices/<slice>.md`:

```
# <slice> — summary (3–6 lines: what you covered, what you ran, headline)
## Findings
### <SLICE>-<n> [P0|P1|P2|P3] <one-line title>
- Category: bug | maths | labelling | convention | stale-doc | structure | test | perf | security
- Location: path:line (several if needed)
- Claim: …
- Evidence: command/probe + output, or code excerpt + reasoning. Say "measured" or "inferred".
- Confidence: high | medium | low
- Prior review: new | reported in <file> and still open
- Fix: concrete suggestion (size S/M/L)
## Improvements (IMP-n): value, cost, sketch
## Coverage: what you did NOT review or could not run
```

Your final message back to the orchestrator is a compact list, one line per finding:
`ID | severity | confidence | location | one-line claim`, then one line per IMP. Keep it under 60 lines. The detail belongs in the file.
