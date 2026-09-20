# Reviewer agent brief (shared) — Quadrature Domains review, 2026-09-20

You are a meticulous **code + mathematics** reviewer. Repo: `/home/user/complex-analysis-suite`
(branch `claude/brave-pascal-ejuewx`, HEAD `5ebfa54`). The app under review is
`apps/quadrature-domains` (~88k lines of `.mjs`/`.js`/`.ts`, vanilla ES modules, `allowJs`, Vite-built,
`window.QD` namespace). Your prompt names your **assigned scope** and your **one output file**.
Everything else is here. Read `CLAUDE.md` at the repo root first (skim; the QD-relevant parts are the
locked decisions, the guardrails, and the "σ mask defect" paragraph), then the app-local
`apps/quadrature-domains/README.md`, `ARCHITECTURE.md`, and whatever per-module README your scope has.

## Owner's goals for this review (verbatim intent)

1. Identify **errors, bugs, and stale documentation**.
2. Identify **structural issues and confused or poorly implemented functionality**.
3. Propose **improvements to the core functionality** of the app. The owner's stated priorities for
   "core" are the **inverse + direct solvers** (the thesis mathematics: QD/LQD/PQD/UQD families,
   continuation, Faber machinery, univalence, cusps) and the **algebra engine + parameter slice**.
   Schwarz/Sphere and UI are in scope for bugs and structure but are lower priority for
   "improvements".

Scope decision: the app **plus the QD-facing surfaces of the packages it consumes** (`@cas/core`,
`@cas/faber`, `@cas/gpu`, `@cas/interchange`, `@cas/schwarz`, `@cas/exact`) and the cross-app hand-offs
(QD→Complex-Dynamics σ recipe, QD→Hele-Shaw one-point unbounded QD). A package is reviewed only where
QD calls into it; a package finding is flagged `cross-app`.

## Evidence standard — this is the part that matters

The owner chose "run the tests and reproduce suspected bugs" over a read-only review. So:

- **Every finding carries a label**: `[confirmed]` (you reproduced it — a script, a test run, a
  numeric check, a browser run — and you say how, with the command and the number), `[code]`
  (established by reading the code path end to end, with `file:line` for every link in the chain),
  or `[plausible]` (a suspicion you could not close; say what would close it). A `[plausible]`
  finding with no stated closing experiment is not worth reporting.
- **Numbers, not adjectives.** "Slow" is not a finding; "12.4 s on the default preset, 9.9 s of it in
  `foo()` per `--cpu-prof`" is. "Inaccurate" is not a finding; "returns 0.4998 where the closed form
  is 0.5, relative error 4e-4, at these inputs" is.
- **Negative controls.** When you claim a test is vacuous or a check is dead, show the mutation that
  should fail it and does not. When you claim a numeric defect, show a nearby input where the code is
  right, so the defect's boundary is known.
- **Do not re-report closed findings.** Two prior reviews covered this app:
  `docs/review/2026-08-suite-review/findings/07-quadrature-domains.md` (Aug 17) and
  `docs/review/2026-08-23-comprehensive-review/findings/{A2-qd-solver-perf,A3-qd-algebra-symcore,A7-consolidation-perf}.md`
  (Aug 23), plus `docs/perf/qd-live-solver-review.md`. Read the one(s) touching your scope and that
  review's `PROGRESS.md` "follow-up" status. A prior finding that is still open may be re-reported
  in ONE line with its original id and "still open" — verify it is still open first. A finding the
  prior review made and that was fixed must not reappear.
- **The thesis is the specification** for the mathematics: `apps/quadrature-domains/thesis.txt`
  (plain text of the PhD thesis) and `THEORY_MAP.md` (thesis equations → file:line). Where the code
  and the thesis disagree, say which equation, and check `THEORY_MAP.md` against BOTH — a stale
  line reference there is a documentation finding.
- **Conventions.** `@cas/core` is convention-neutral (no π / 2πi constants, ADR-0006). QD's
  `dA = dx dy/π` and `1/(2πi)`-suppressed contour conventions live at the app edge. A silent
  factor-of-π / 2πi error anywhere is CRITICAL; a correct one that is undocumented is a doc finding.
- **Honest labelling** (`=` exact, `≤` bound, `≈` estimate) is a guardrail. A UI string or a doc that
  overstates certainty is a real finding, not a nit.

## How to run things

- Baseline is green: `pnpm install` done, `packages/*` dists built. The QD headless suite is
  `cd apps/quadrature-domains && node app/node-test.js` (~3–7 min; prints "N passed, M failed"). The
  Vitest wrappers are `pnpm --filter quadrature-domains exec vitest run` (config `vitest.config.ts`,
  node env; ~34 specs under `vitest/` opt into jsdom with a line-1 docblock). Run a single spec with
  `pnpm --filter quadrature-domains exec vitest run vitest/<name>.test.ts`.
- The browser suite is `cd apps/quadrature-domains && pnpm test:browser` (Playwright + the
  pre-installed Chromium at `/opt/pw-browsers/chromium`; the config already points at it). Do NOT run
  `playwright install`. It compiles the real GLSL. It is the ONLY thing that exercises the app's boot.
- To drive the built app yourself, `pnpm --filter quadrature-domains build` then serve
  `apps/quadrature-domains/dist` (e.g. `python3 -m http.server`) and use Playwright from a node
  script (`import { chromium } from 'playwright'` with `executablePath: '/opt/pw-browsers/chromium'`).
  The dev server via `.claude/launch.json` is also fine; do not leave servers running.
- Throwaway scripts and outputs go in your own subdirectory of
  `/tmp/claude-0/-home-user-complex-analysis-suite/c6dab71d-d093-5356-89e2-b720851d0ab1/scratchpad/`
  (make `scratch/<your-agent-id>/`). **Do not add, edit, or delete any file under the repo**, do not
  commit, do not touch git state. If you need a mutant to prove a test vacuous, apply it, run, and
  `git checkout -- <file>` immediately; confirm `git status --short` is clean when you finish.
- Node modules the app loads through a vm-context harness (`app/test/bootstrap.js`); for ad-hoc
  numeric probes you can `import` the `.mjs` modules directly from a node ESM script in your scratch
  dir (the barrel is `apps/quadrature-domains/app/core/qd.mjs`; solvers attach onto `QD`). Look at
  how `app/test/bootstrap.js` boots before reinventing it.

## Output — one Markdown file, this exact shape

Write `scratchpad/findings/<your-file>.md` (the path is in your prompt). Structure:

```
# <Agent id> — <scope title>

## Scope covered
<what you actually read and ran; what in your scope you did NOT get to, honestly>

## Health
<commands you ran for baseline + results, one line each>

## Findings
### <ID> [<severity>] [<evidence label>] <one-line title>
- **Where:** `path:line` (every link in the chain)
- **What:** the defect, in two to six sentences, with the numbers
- **Evidence:** the command/script and its output, or the code chain
- **Why it matters:** user-visible consequence / which guardrail
- **Fix:** concrete, smallest correct change; say if a test should pin it
- **Prior:** "new" | "re-report of <id>, still open" 
(repeat)

## Structural observations
<confused or poorly implemented functionality, duplication, dead code, layering violations —
each with file:line and a sentence on what better looks like. Cite ADR-0007/0008/0026 where
relevant: extraction only on a second consumer; QD sym-core deliberately separate; QD is
deliberately NOT a @cas/ui consumer.>

## Improvement proposals (core functionality)
<numbered; each: what, why (which user / which thesis result it unlocks), rough size S/M/L,
prerequisites, risk. Ground each in something you observed — a missing family, a solver that
refuses inputs the theory covers, an analysis the thesis has that the app lacks, a parameter
the slice cannot sweep.>

## Documentation drift
<table: doc file:line | claims | reality (file:line) | severity>

## Tests
<vacuous tests found (with the surviving mutant); coverage gaps that matter; tests that pass
for the wrong reason>
```

Severity: **CRITICAL** (wrong mathematics shown as certain, data loss, silent factor error),
**HIGH** (wrong number or picture the user would act on; crash on a reachable path), **MEDIUM**
(wrong in an edge case, misleading label, real structural debt), **LOW** (cosmetic, minor drift),
**NIT**. Order findings by severity. Ids are `<your-prefix>-<n>`.

Aim for depth over breadth: five confirmed findings with reproductions beat twenty suspicions.
Report the scope you skipped honestly. When you are done, `git status --short` must be empty, and
your final message to the orchestrator is at most ten lines: the file path, the finding count by
severity, and the one or two things the orchestrator must not miss.
