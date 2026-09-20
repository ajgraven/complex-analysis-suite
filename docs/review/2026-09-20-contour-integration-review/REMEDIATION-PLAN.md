# Contour Integration — remediation plan (2026-09-20)

Executes [`REPORT.md`](REPORT.md). Item numbers below are the report's. Nine work packages run in
parallel, each in its own git worktree off `master`, each owning a disjoint set of files; the
coordinator merges them in dependency order, runs the full gate after each merge, and closes with
the browser suite, `pnpm a11y --strict`, the census and the docs' measured numbers.

## Decisions taken (owner, 2026-09-20)

1. **One gate on showing a value, recorded as ADR-0045.** `mayShowValue(integral, ledger)` is the
   single predicate every surface consults — the Result card, the figure caption, the Derivation
   card, the Stepper, the accumulator, Pass 5. It refuses on a LEGALITY row, on a FAILED row of any
   constraint, and on an undecided winding. Five surfaces deciding this separately is how §1 of the
   report happened.
2. **The GPU cut-correction layer is WIRED** (2.4), not recorded as deferred: `stageView.drawNow`
   uploads `cutSegments(effectiveBranch(branch), …)`; the shader half already exists and is gated
   by `cutParity.browser.test.ts`.
3. **`reproduces` is verified numerically** (1.5): `∫_piece ≈ μ·∫_target` from
   `integral.pieces[].value`, `splitCheck.ts`'s posture; `unknown(…)` when the comparison cannot be
   made. Not downgraded wholesale to `unknown`.
4. **`piBounds` is memoised in `@cas/exact`** (4.6) — a pure function of an integer, no consumer sees
   a difference (ADR-0007 does not bar it).
5. **Sliders clamp to the record's declared `constraints`** (1.2b / 1.10). The trap fixtures still
   reach their refusals through their own bindings; outside the declared range the record has
   nothing to say.

## Mechanics

- Each WP is one agent in its own worktree on its own branch. Preflight measured:
  `pnpm install --offline --frozen-lockfile` 2.3 s, `pnpm -r --filter "./packages/*" build` 2.4 s,
  a targeted vitest file 0.8 s. Disk: 29 GB free.
- **Definition of done per WP**: the fix; a test that FAILS without it and pins the reason (a refusal
  by name, a level, a position — never `toContain` on a sentence a later row also carries); the WP's
  targeted suites green; a mutation sweep over the changed lines (every survivor killed or recorded
  as equivalent with its reason, every mutant verified to have applied); stale comments in the WP's
  own files corrected; one commit with the measurements in its message.
- **Shared files split by line region**: `families/runFamily.ts` lines 380–400 belong to WP1b, the
  rest to WP3; `shell/cards/cuts.ts:83` (the iso default) belongs to WP6, the rest of the file to WP4.
- **Integration order**: 2b → 2a → 1a → 1b → 3 → 4 → 5 → 6 → 7. Full gate (never piped) after each
  merge; browser suite and `pnpm a11y --strict` once at the end; then the census, `docs/refactor/LOG.md`,
  CLAUDE.md's *Done* paragraph and the placeholders WP7 leaves, all from measured numbers.
- **The denylist extension lands last, on the integrated tree**: scanning `src/kernel/**` and
  `src/families/**`, reading interpolations, sweeping `aria-label`/`title`/`placeholder`. It can only
  go green after WP2a, WP3 and WP4 have reworded their strings.

## Work packages

| WP | Owns | Fixes |
|---|---|---|
| **1a Ledger** | `engine/ledger.ts`, `test/ledger*.test.ts` | 1.3 (`ok` requires `level !== "⚠"` too), 1.5 (numeric `reproduces`), the dead `value` fallback at `:1712`, the orphaned `HEADLINES` doc in `vocabulary.ts` |
| **1b Derivation & the gate** | `engine/derivation.ts`, `steps.ts`, `contour/accumulate.ts`, `branchTheorem.ts`, `logTheorem.ts`, `residueTheorem.ts` (`windingOf`), `shell/argument.ts`, `strip.ts` (`withheldBecause`), `runFamily.ts:380–400`, `docs/DECISIONS.md` (ADR-0045 only) | 1.6, 1.7, 1.2(a), 1.9's derivation half, the `runFamily.ts:396` string, `mayShowValue`, ADR-0045 |
| **2a Bounds & branch** | `kernel/bounds/*`, `kernel/branch/*`, their tests | 1.4, 1.3 producer side, 1.15, 3.3's `KILL`/`GROWS`, `MAX_CUT_SEGMENTS` reported, dominance tests for `branchArc`/`logArc`, stale headers |
| **2b Geometry & arithmetic** | `kernel/geom.ts`, `winding.ts`, `exactRational.ts`, `expLattice.ts`, `kernelResidue.ts`, `quadrature.ts`, `cyclotomic.ts`, `exactPredicates.ts`, `exactResidue.ts`, `summationKernel.ts`, `contour/edit.ts` (`JOIN_TOL`, `setParam` clamp), `packages/exact/src/piBounds.ts` | 1.11, 1.12, 1.13, 1.14, 4.5, 4.6, `quadrature.test.ts`, dead code |
| **3 Families** | `families/**` (not `runFamily.ts:380–400`), `test/records`, `familyGolden`, `f2`, `onScreenClaims`, `halfIntegerParam` | 1.2(b), 1.10 (incl. the D7 loop cap — coordinate with 2b if it lives in `kernel/`), `Golden.value` and `windings` tests, `f2` guard, schema/`index.ts`/solve* doc comments |
| **4 Cards & names** | `shell/cards/*` (not `cuts.ts:83`), `figure.ts`, `modal.ts`, `frontDoor.ts`, `errors.ts`, `viewState.ts`, `math.ts`, their tests | 1.1, 1.8, 1.9 card half, 1.7's numerics disclosure, 3.1, 3.2, 3.4, 3.5, `viewState` interpolations + decode clamp + `v`, attribute sweep test, bounded KaTeX cache |
| **5 State & control** | `shell/app.ts`, `undo.ts`, `session.ts`, `render.ts`, `stageController.ts`, `sweep.ts`, tests `sweepApp`, `shell2State`, `shell2`, `undo` | 4.1, 4.2, 4.3, 4.4, 2.1's grab gating, Escape releases a grab, `saveFigure` rejection, comments |
| **6 Stage & GPU** | `shell/stageView.ts`, `ui/**`, `cards/cuts.ts:83`, `*.browser.test.ts` | 2.1 (draw `run.branch`), 2.2, 2.3, 2.4 (wire), 2.5, 2.6, 4.7, buffer leak, `layout(location=0)`, dynamic `declaredParity` count, dead CSS |
| **7 Docs** | Everything outside `src/`/`test/` in REPORT §5 except `docs/DECISIONS.md`'s ADR-0045 | Every §5 row that is not a `src` comment; counts left as `⚠ measured at integration` |

## Executed (2026-09-20)

| WP | commit | sweep | note |
|---|---|---|---|
| 2b | `f58228e` | 33/33 | first merged; `ledger-dump.txt` regenerated (every cross-check number smaller) |
| 2a | `f1013d6` | 29/31 | needed three `ledger.ts` lines from 1a (the arc window to Jordan) |
| 1a | `2606d9d` | 23/25 | carried 2a's three lines; `disposalEstablishes` exported |
| 3 | `6faada3` | 24/24 | the D7 cost was `N = 2·lcm` at denominator 4.7e14, capped at 10 000 in `families/` |
| 5 | `c454099` | 21/22 | `endSweep` from `applyStateNow`/`restore`/`destroy`; a `"resolve"` and a `"type"` commit reason |
| 4 | `e5bc9a0` | 39/42 | the Target card drops the identity's RHS off-fixture (`identityLatex` builds from a constant) |
| 6 | `e6b35d8` | 26/26 | browser suite 20/220 → 22/232; two `declaredReference` defects worked around in `stageView` |
| 1b | `861e1f5` | 24/25 | `valueRefusal`; its clause 4 (`closes === false`) dropped by measurement |
| 7 | `7f3a29a` | — | six placeholders filled at integration |

Integration commits: two reworded-refusal assertions; the cuts card's monodromy block through
`drawnBranch`; `valueRefusal(…, of)` two-tiered (the first draft withheld `z/(1+z²)`'s exact `∮ = πi`
on the semicircle); the Result card and caption on the gate, `levelOfSolved` imported from the engine;
the census. **Gate 599 / 6818, browser 22 / 232, a11y 682 / 0.** Open items are listed in
`docs/refactor/LOG.md`'s entry of this date; the denylist's `src/families/**` widening (30 non-record
and 181 record-file offenders under its rules, most never rendered) was deliberately not done here.
