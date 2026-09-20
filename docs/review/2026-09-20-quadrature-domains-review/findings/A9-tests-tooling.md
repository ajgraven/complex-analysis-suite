# A9 — the test suite as an instrument, and the build/lint/type/CI tooling

## Scope covered

Read and ran: `app/node-test.js`, `app/test/bootstrap.js`, `app/test/harness.js`, all 30
`app/test/*.test.js` (read the vacuity-relevant parts, not every assertion), the 29 `vitest/node/*`
wrappers + `_run.ts`, the 135 direct `vitest/*.test.ts` (surveyed; read ~12 in full), `vitest/leaves/`,
all 4 `vitest/browser/*`, `vitest/helpers/*`, `vitest.config.ts`, `vitest.browser.config.ts`,
`tsconfig.json`, `eslint.config.mjs`, root `eslint.config.js`, `vite.config.mjs`, `package.json`,
`perf/measure.mjs`, root `vitest.workspace.ts` / `package.json` / `scripts/assert-test-census.mjs` /
`scripts/a11y-audit.mjs` + baseline, `.github/workflows/{ci,deploy-pages}.yml`, README /
CONTRIBUTING / ARCHITECTURE test sections.

Ran: the headless suite (3 orders), the Vitest project ×3, the browser project, `tsc`, `eslint`,
`vite build` (twice, once patched to measure the eager graph), `perf/measure.mjs`, a
**26-mutant sweep** against BOTH halves of the QD gate (78 full-suite runs total), and an
import-reachability graph.

**Not covered, honestly:** I did not read the assertion bodies of the ~1000 individual `ok()` calls
in `solvers-*.test.js` / `algebra-store.test.js` (other agents own those); I did not measure real
line coverage (no instrumentation — I used a static import graph plus mutation, both stated as
methods); `perf/drag-bench.mjs` and `perf/live-drag-bench.mjs` were read but not run (same Chromium
problem as `measure.mjs`); I did not audit the `@cas/*` packages' own suites.

## Health

| command | result |
|---|---|
| `node app/node-test.js` (main checkout) | **2342 passed, 0 failed**, exit 0, **83 s** wall (container is 4-core and shared with 8 other agents; the brief's 57 s baseline is a quieter machine) |
| `pnpm --filter quadrature-domains exec vitest run` ×3 | **473 suites / 1285 tests, 1285 passed, 0 failed** every run; wall 137 s / 105 s / 198 s. Per-test status sets byte-identical across all three → **no flakiness at idle** |
| `pnpm --filter quadrature-domains test:browser` | **4 files / 17 tests passed**, 46.6 s; `/opt/pw-browsers/chromium` picked up by the config as documented |
| `npx tsc -p tsconfig.json` | exit 0, 3.2 s, 257 files in the program |
| `npx eslint app --max-warnings 0` | exit 0, **zero output** (0 errors, 0 warnings) over 159 files (126 `.mjs` + 33 `.js`) |
| `npx vite build` | exit 0, 21.2 s, one `(!) chunks larger than 500 kB` warning; no "dynamic import cannot be analysed" |
| `node perf/measure.mjs --runs 1` | **exit 1** — `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/...` (see TEST-5) |
| `node app/node-test.js` with `TESTS` **reversed** | 2342 passed, 0 failed, 70 s |
| `node app/node-test.js` with `TESTS` **shuffled** (seeded) | 2342 passed, 0 failed, 67 s |

Five slowest Vitest files (run 1), and what they spend it on — all five are node-suite wrappers, i.e.
real solver numerics, not harness overhead:

| file | s | content |
|---|---|---|
| `vitest/node/solvers-3.test.ts` | 33.5 | LQD/UQD-LQD family batteries + `solveInverseQD` retries |
| `vitest/node/solvers-2.test.ts` | 23.0 | UQD continuation-in-c homotopies |
| `vitest/node/solvers-4.test.ts` | 21.7 | PQD families + §25 univalence classification |
| `vitest/node/qd-equations.test.ts` | 11.0 | exact ℚ(i) system generation + `verifySolutionExact` |
| `vitest/node/solvers-1.test.ts` | 10.6 | classical bounded battery + cmax traces |

The B2 four-way shard of `solvers.test.js` was split by **assertion count** (187/10/71/183) and is
therefore badly unbalanced in **time**: 10.6 / 23.0 / 33.5 / 21.7 s, so `solvers-3` is 3.2× the
shortest shard and sets the project's critical path. Rebalancing by measured time would cut the
QD project's wall by roughly the 33.5 → ~22 s difference.

`git status --short` in the main checkout is **empty**; all three scratch worktrees were removed
(`git worktree list` shows only the main checkout).

## Findings

### TEST-1 [HIGH] [confirmed] `worker-graph-cleanrealm` — the one test that catches an un-imported kernel — never runs in CI
- **Where:** `apps/quadrature-domains/app/test/worker-graph-cleanrealm.test.js` (registered in
  `app/node-test.js:52` `TESTS`); **no** `apps/quadrature-domains/vitest/node/worker-graph-cleanrealm.test.ts`
  (29 wrappers for 30 files); `apps/quadrature-domains/vitest/node/_run.ts:25-35` `FLOORS` omits it too;
  `vitest.config.ts:25` `include: ["vitest/**/*.test.ts"]` cannot match a `.js` under `app/test/`;
  `.github/workflows/ci.yml` (`Test: pnpm test`) and `deploy-pages.yml:64-65` (`Test: pnpm test`) run
  only the Vitest workspace.
- **What:** Its own header states the bug class it exists for and why nothing else can see it: every
  other file runs *after* `test/bootstrap.js` leaks `Complex`/`Taylor` onto `globalThis`, so ESM
  free-variable lookup silently backfills a missing `import`, while the bundled browser worker throws
  `ReferenceError: Complex is not defined` — the shipped `solver-pqd-common.mjs` regression. It
  spawns a clean `node` realm to catch exactly that. It is reachable **only** by a developer typing
  `node app/node-test.js` by hand; neither CI job nor the publish gate runs it. So the regression it
  was written for can reach `master` and Pages green.
- **Evidence:** `for f in app/test/*.test.js; do [ -f "vitest/node/$(basename $f .test.js).test.ts" ] || echo NO WRAPPER; done`
  → `NO WRAPPER: worker-graph-cleanrealm` (the only one). `grep -rn "node-test" vitest/` finds only
  comments — no spec spawns `app/node-test.js`. Both workflows' test step is `pnpm test` = root
  `vitest run` over `vitest.workspace.ts`.
- **Why it matters:** A dead production worker ships. `scripts/assert-test-census.mjs` cannot see it
  either: its per-project floor is 1 collected file, so nothing notices a missing spec.
- **Fix:** add `vitest/node/worker-graph-cleanrealm.test.ts` = `runNodeSuiteFile("worker-graph-cleanrealm")`
  and its floor (`2`) to `_run.ts`'s `FLOORS`. Then make the wrapper set *derived*: a spec that reads
  `TESTS` out of `app/node-test.js` and asserts every name has a wrapper, so the next added file
  cannot be silently unwrapped.
- **Prior:** new

### TEST-2 [MEDIUM] [confirmed] 12 of 26 mutants across the solver/analysis core survive the WHOLE QD gate
- **Where:** each survivor is named below with `file:line`.
- **What:** 26 hand-picked mutants (sign flips, dropped conjugates, off-by-one loop bounds,
  tolerance ×10, π→π/2 at convention sites, a skipped residual) were each run against **both** halves
  of the QD gate: `node app/node-test.js` (2342 assertions) and the 136 direct Vitest specs
  (1256 tests). 14 were killed, **12 survived everything**.
- **Evidence:** `scratchpad/scratch/A9/{mutants.json,sweep-results.txt,sweep2-results.txt}`; each
  mutant applied in a throwaway `git worktree`, `git checkout -- .` between mutants. Kill/survive
  table (`node` = the 2342-assertion suite, `vitest` = the 136 direct specs):

| id | site | mutation | node | vitest | verdict |
|---|---|---|---|---|---|
| M01 | `solvers/solver.mjs:120` | `IDENTITY_TOL` 1e-6 → 1e-5 | survive | **kill** (`solver-identity-tol.test.ts` pins the literal) | killed |
| M02 | `solvers/solver.mjs:735` | `isBoundaryUnivalent` → `true` | **kill** (3) | — | killed |
| M03 | `solvers/solver.mjs:733` | drop the non-finite-boundary fail-closed guard | survive | survive | **SURVIVOR** |
| M04 | `solvers/solver.mjs:741` | `sampleBoundary` θ = 2πi/**(N+1)** (ring not closed) | survive | survive | **SURVIVOR** |
| M05 | `solvers/solver.mjs:750` | `SEG_ENDPOINT_EPS` 1e-9 → 1e-3 (×10⁶) | survive | survive | **SURVIVOR** |
| M06 | `solvers/solver.mjs:1519` | drop `identityOK` from `isValidQD` | **kill** (2) | — | killed |
| M07 | `solvers/solver.mjs:191` | `residualNorm` skips the LAST residual | survive | survive | **SURVIVOR** |
| M08 | `solvers/solver.mjs:1624` | candidate ranking prefers NON-univalent | **kill** (2) | — | killed |
| M09 | `analysis/univalence.mjs:59` | `MARGIN_TOL` 1e-6 → 1e-2 (×10⁴) | survive | survive | **SURVIVOR** |
| M10 | `analysis/univalence.mjs:141` | spiral bound `arcWidth < π` → `< 2π` | survive | survive | **SURVIVOR** |
| M11 | `analysis/univalence.mjs:123` | star margin reads `Im(g)` not `Re(g)` | **kill** (5) | — | killed |
| M12 | `analysis/univalence.mjs:84` | `arcWidth = 2π − maxGap` → `maxGap` | **kill** (4) | — | killed |
| M13 | `analysis/cusps.mjs:74` | `DEFAULT_REL_TOL` 1e-2 → 1e-1 | survive | survive | **SURVIVOR** |
| M14 | `analysis/cusps.mjs:118` | cusp order off by one | **kill** (6) | — | killed |
| M15 | `analysis/critical-set.mjs:84` | seed ring `2π` → `π` (half the circle) | survive | survive | **SURVIVOR** |
| M16 | `direct/direct-common.mjs:145` | bounded `C_k`: drop `conj(c_l)` | **kill** (1) | — | killed |
| M17 | `direct/direct-common.mjs:571` | unbounded: `c^l` → `c^{l+1}` | **kill** (2) | — | killed |
| M18 | `direct/direct-common.mjs:566` | unbounded: drop `conj(C_∞,lp)` | survive | survive | **SURVIVOR** |
| M19 | `direct/direct-common.mjs:198` | polynomial sampler `2π` → `π` | **kill** (2) | — | killed |
| M20 | `qd/qd-equations.mjs:186` | `conjMPoly` stops conjugating coefficients | survive | survive | **SURVIVOR** (dead code — TEST-3) |
| M21 | `qd/qd-equations.mjs:84` | `_ratApprox` loses the sign | **kill** (5) | — | killed |
| M22 | `qd/qd-equations.mjs:126` | `nodeInsideDisk` admits \|z\| = 1 | survive | **kill** (`qd-node-location.test.ts`, 4) | killed |
| M23 | `sym/sym-core.mjs:2665` | `sPoly` adds instead of subtracts | **kill** (1) | — | killed |
| M24 | `sym/sym-core.mjs:600` | Sylvester matrix one row short | **kill** (crash) | — | killed |
| M25 | `solvers/solver-continuation.mjs:97` | continuation never grows its step | survive | survive | **SURVIVOR** |
| M26 | `solvers/solver-continuation.mjs:56` | `Math.min` → `Math.max` on the start `c` | survive | survive | **SURVIVOR** |

  **14/26 killed (54%).** Two mutants (M01, M22) are killed *only* by direct Vitest specs, not by the
  headless suite — so a reviewer measuring against `node app/node-test.js` alone would over-report.
  Notes per survivor, in descending order of what I would fix first:

  - **M07 — `residualNorm` is the Newton stopping criterion and has no test of its own.**
    `solver.mjs:557` `Fnorm = residualNorm(F)` and `solver.mjs:563` `if (Fnorm < tolerance) return { success: true … }`.
    `grep -rn residualNorm app/test/ vitest/` finds it exactly twice: as an injected harness global
    (`bootstrap.js:279`) and as a **helper that computes an expected value** (`solvers-1.test.js:805`)
    — never as the subject of an assertion. Dropping one component of the norm lets Newton declare
    convergence with one equation unsatisfied, and the whole gate stays green.
    *Fix:* a three-line unit test (`residualNorm([3,4]) === 5`, and a length-N vector whose last
    component dominates).
  - **M18 — a dropped conjugate in the unbounded-direct `C_∞` recursion, unobservable on every
    existing input.** `direct-common.mjs:566` `C.mul(C.conj(polyPart[lp]), C.conj(M))`. Every test
    case is `unboundedQD(c, F)` with `F.length ≤ 2` (`direct.test.js:260,271,279,290,703,710,720`),
    and for `m ≤ 2` the only `M = gPow[1][1]` is `F[0]`, which is `0` in the one 2-term case — so
    `term = 0` and the conjugation cannot be seen. Measured directly (`scratchpad/scratch/A9/m18.mjs`):
    clean vs mutant on `c=1.2, F=[0.2+0.1i, 0.3−0.2i, 0.1+0.05i]` gives
    `C_∞,0 = 0.1368056−0.0982639i` vs `0.0729167−0.0906250i` (**38.2% relative error**) and
    `C_∞,1 = 0.2152778+0.1666667i` vs `0.2291667+0.1388889i` (11.4%); on the existing 2-term cases the
    two are **bit-identical**, which is the negative control.
    *Fix:* one test case with `m ≥ 3` and complex `F[0]`, `F[1]` and its `hData.polyPart` pinned.
  - **M10 — `spiralLike.is` can be made unconditionally true and nothing notices.**
    `univalence.mjs:141` `is: arc.arcWidth < Math.PI - MARGIN_TOL` → `< 2*Math.PI - MARGIN_TOL` makes
    every φ spiral-like, since `arcWidth ≤ 2π` by construction (`univalence.mjs:84`). The §25 block
    (`solvers-4.test.js:150-`) asserts only the POSITIVE direction (a disk IS spiral-like, the
    hierarchy holds) — M12 kills, M10 does not. This is a mathematical claim shown to the user on
    the status card, so it is an honest-labelling exposure.
    *Fix:* one NEGATIVE case — a φ that is univalent but **not** spiral-like, with `is === false`.
    The same shape of gap covers M09 (`MARGIN_TOL` ×10⁴) and M13 (`cusps` `DEFAULT_REL_TOL` ×10).
  - **M03/M04/M05 — the boundary sampler and the self-intersection predicate are pinned only through
    their consumers.** M02 (`isBoundaryUnivalent → true`) dies loudly, so the *outcome* is guarded;
    but the θ grid's closure (M04), the endpoint-exclusion ε (M05, moved by 10⁶) and the
    fail-closed non-finite guard (M03, whose comment at `solver.mjs:730-731` names the exact
    mislabelling it prevents) have no direct test. *Fix:* three unit tests on `sampleBoundary` /
    `segmentsCross` / `isBoundaryUnivalent`-on-a-NaN-φ; they are all exported.
  - **M15 — `critical-set.mjs:84`'s Newton seed ring can cover half the circle** and every test still
    finds every critical point. Real (the presets are symmetric), but a genuine robustness gap.
  - **M25/M26 — `solver-continuation.mjs` has no test of its stepping logic.** It is exercised only
    transitively (via `solver-uqd*.mjs`), and `continuationInC` is never named in any test file. Its
    adaptive grow/shrink and its start-`c` clamp are both freely mutable.
- **Why it matters:** These are the "improvements to core functionality" surfaces the owner named.
  The suite is strong on OUTCOMES (a family solves, an identity closes) and weak on the PRIMITIVES
  under them, so a refactor of a primitive is unguarded even though the family battery is green.
- **Fix:** the eight unit tests listed above (all on already-exported functions) take the sweep from
  14/26 to 22/26 by construction.
- **Prior:** new

### TEST-3 [MEDIUM] [confirmed] `qd-equations.mjs`'s conjugation trio is entirely dead code, and its comment says otherwise
- **Where:** `apps/quadrature-domains/app/qd/qd-equations.mjs:183` (`conjVarName`), `:186`
  (`conjMPoly`), `:193` (`conjFR`), and the claim at `:189-192`.
- **What:** `conjFR` is never called (it carries an explicit
  `eslint-disable-next-line no-unused-vars -- intentional: completes the documented local trio`).
  Its justification reads *"Its two siblings are used; dropping only the third would leave a half-set"*
  — but `conjMPoly` is called **only** from `conjFR`, and `conjVarName` **only** from `conjMPoly`. So
  all three are unreachable, and the comment's premise is false. That is the whole explanation for
  M20's survival: I mutated a function nothing can call.
- **Evidence:** `grep -n "conjFR\|conjMPoly(\|conjVarName(" app/qd/qd-equations.mjs` →
  definitions at 183/186/193, one call of `conjVarName` (inside 186), two calls of `conjMPoly`
  (both inside 194), zero calls of `conjFR` outside comments; `grep -rn "\bconjFR\b" app/` outside
  `qd-constraints.mjs` finds nothing else. The live copies are
  `qd/qd-constraints.mjs:68-71` (exported at `:332`) and `algebra/algebra-store.mjs:269-270`.
- **Why it matters:** ~13 lines of unreachable exact-algebra arithmetic with a comment that will
  send the next reader looking for the callers, plus a **third** independent copy of the
  conjugate-model bar with nothing pinning the three against each other. If a future caller picks the
  `qd-equations` copy up, M20 shows the gate will not notice a divergence.
- **Fix:** delete the trio (the live pair is `QD.QDConstraints.{conjVarName,conjMPoly,conjFR}` and
  loads after, which is the only stated obstacle — and nothing here needs it at load time). If any of
  it is kept, add one differential test that the two/three copies agree on a sample MPoly; that is
  the ADR-0008 idiom (two engines, one guard) applied to a 3-line helper.
- **Prior:** new

### TEST-4 [MEDIUM] [confirmed] `sym-factor-recombine-cap.test.ts` asserts wall-clock time, and fails under load for reasons unrelated to the code
- **Where:** `apps/quadrature-domains/vitest/sym-factor-recombine-cap.test.ts:33`
  — `expect(ms).toBeLessThan(4000)`.
- **What:** The test measures `Date.now()` around `S.factor(x^40 − 2)` and fails if it exceeds 4000 ms.
  At idle it reads 3.2 s (run 1's slowest single non-wrapper test) — **80% of the limit**. Under
  contention it exceeds it: it went red in 5 of my 14 parallel mutant runs, for mutants in
  `solver.mjs`'s NaN guard, `univalence.mjs`'s tolerance, `univalence.mjs`'s spiral bound and
  `qd-equations.mjs`'s dead `conjMPoly` — none of which `factor()` can reach.
- **Evidence:** `scratchpad/scratch/A9/sweep2-parallel.txt` (3 concurrent Vitest runs) shows M03,
  M09, M10, M20 "KILLED" with the sole failure
  `sym-factor-recombine-cap.test.ts > x^40 − 2 returns promptly …`, file durations 4531/4834/5027/5090 ms.
  Re-run **serially** (`scratchpad/scratch/A9/sweep2-results.txt`), the same four mutants are
  `SURVIVED ec=0 [Tests 1256 passed (1256)]` at 38–44 s. Same code, opposite verdict, decided by
  machine load.
- **Why it matters:** It is a merge-blocking check (`pnpm test` in `ci.yml` and in the publish gate)
  whose verdict depends on the runner's other tenants — a red master that is not a defect, which is
  how a gate stops being read. It also corrupted a measurement made *about* this suite, which is the
  concrete cost.
- **Fix:** the test's own header names three properties — `ok === false`, `status === "undetermined"`,
  `reason` names the CAS escape hatch — and those are the content. Replace the timing assertion with
  the mechanism: assert the cap fired (the `caps` entry / a recombination-subset counter the cap
  already has), which is what "promptly" is a proxy for. If a time bound is wanted, keep it as a
  Vitest `timeout` on the test (a hang then fails, a slow runner does not) rather than an assertion.
- **Prior:** new

### TEST-5 [MEDIUM] [confirmed] `pnpm perf:measure` cannot run on Linux or macOS — it is the one Playwright entry point that does not probe the container's Chromium
- **Where:** `apps/quadrature-domains/perf/measure.mjs:37-42` (`chromeCandidates`) and `:55`
  (`chromium.launch`); contrast `apps/quadrature-domains/vitest.browser.config.ts:9-10`, which does
  `existsSync("/opt/pw-browsers/chromium")`.
- **What:** `chromeCandidates` is `[QD_CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\…", "C:\\Program Files (x86)\\…"]`.
  On any non-Windows machine with no `QD_CHROME_PATH`, `executablePath` is `undefined` and Playwright
  falls back to its own pinned build, which `pnpm install` does not fetch. The script builds the app
  (21 s) and then throws.
- **Evidence:** `node perf/measure.mjs --runs 1` → exit 1,
  `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`
  (`scratchpad/scratch/A9/perf-measure.log`). The QD **browser suite** ran fine in the same container
  moments later, because its config probes `/opt/pw-browsers/chromium`.
- **Why it matters:** `README.md:65` and `:75-80` present `perf:measure` as the app's repeatable
  baseline, and `docs/perf/qd-live-solver-review.md:507-508` gives exact invocations. It is the
  documented instrument for the owner's own perf work and it is broken by default off Windows.
  This is the same class CLAUDE.md already records for complex-function-plotter and `packages/schwarz`
  ("still take neither, so their suites cannot run in such a container — unify them when one is next
  touched"); `perf/measure.mjs` is a fourth instance nobody has listed.
- **Fix:** add `/opt/pw-browsers/chromium` and `CAS_CHROMIUM_EXECUTABLE` to `chromeCandidates` (three
  lines), keeping `QD_CHROME_PATH` first. Better: one shared `resolveChromium()` helper that the two
  vitest configs, `perf/measure.mjs` and the two drag benches all call — the unification CLAUDE.md
  already asks for.
- **Prior:** new

### TEST-6 [MEDIUM] [confirmed] `pnpm --filter quadrature-domains typecheck` type-checks exactly ONE file of 159, and the 149 Vitest `.ts` specs are neither type-checked nor meaningfully linted
- **Where:** `apps/quadrature-domains/tsconfig.json` (`allowJs: true`, `checkJs: false`,
  `include: ["app/**/*.js","app/**/*.mjs"]`); `apps/quadrature-domains/eslint.config.mjs` (every
  `files:` glob is `app/**`); root `eslint.config.js:60-67` (the only rule reaching `apps/**/*.ts` is
  `no-restricted-imports`); `package.json:"typecheck": "tsc -p tsconfig.json"`.
- **What:** With `checkJs: false`, only files carrying `// @ts-check` are checked. There is exactly
  **one**: `app/core/qd.mjs` (80 lines). `app/solvers/solver.mjs:1` is `// @ts-nocheck` (it reads as
  a `@ts-check` to a grep, which is how I mis-measured it first). And the `include` names no `.ts` at
  all, so the **149** `.ts` files under `vitest/` are outside the program; the app's own ESLint config
  never globs them either, so they get a parser and one import rule and nothing else.
- **Evidence:** appending `noSuchFunction_zzz(1,2,3);` to a file and running `tsc -p tsconfig.json`:
  `app/analysis/univalence.mjs` → exit 0 (invisible); `app/solvers/solver.mjs` → exit 0 (invisible);
  `app/core/qd.mjs` → **exit 2**, `error TS2304: Cannot find name 'noSuchFunction_zzz'`.
  `tsc --listFiles` → 257 files, 159 under `app/`, **0** under `vitest/`. `@ts-nocheck` count: 4
  (`solvers/solver.mjs`, `solvers/primary-solution.mjs`, `solvers/primary-solver-worker.mjs`,
  `schwarz/schwarz-cpu-worker.mjs`).
- **Why it matters:** The app half is a *deliberate* decision (ADR-0002 — full typing is explicitly
  not a goal), so that is a documentation problem, not a defect. The **test** half is not covered by
  any ADR: 149 TypeScript files, the ones that decide whether the gate is honest, are the only
  TypeScript in the repo that nothing type-checks. A spec with a typo in a property name compiles to
  `undefined` and its `expect` can pass vacuously.
- **Fix:** add `"vitest/**/*.ts"` to `tsconfig.json`'s `include` (they are already strict-clean
  as authored — they run under Vitest's esbuild, which strips types without checking them, so this is
  a one-line change plus whatever it surfaces). Separately, give `eslint.config.mjs` a
  `files: ["vitest/**/*.ts"]` block so the correctness rules the config carefully picks
  (`no-unreachable`, `use-isnan`, `no-dupe-keys`, `no-self-compare`) reach the specs too. State in
  `tsconfig.json`'s header that exactly one file is checked, so the next reader does not assume the
  `include` means coverage.
- **Prior:** new

### TEST-7 [MEDIUM] [confirmed] `app/test.html` is dead — it loads three files the ESM migration deleted — and the README documents it twice as live
- **Where:** `apps/quadrature-domains/app/test.html:~25` (`<script src="complex.js">`,
  `taylor.js`, `solver.js`); `README.md:134-135` ("`app/test.html` is an in-browser test page with
  small per-test visualizations, complementary to the headless runner"); `README.md:315`
  ("`test.html` — in-browser test harness").
- **What:** All three sources moved in the Phase-2 ESM migration (`app/core/complex.mjs`,
  `app/core/taylor.mjs`, `app/solvers/solver.mjs`). Opening the page now produces three 404s and an
  empty result list. It is not in `dist/` (Vite's single HTML entry is `index.html`), so it does not
  ship — it is simply a 315-line file the docs point developers at.
- **Evidence:** `grep -oE 'src="[^"]+"' app/test.html` → `complex.js`, `taylor.js`, `solver.js`;
  each `[ -f app/<p> ]` → **MISSING**. `ls dist/` → no `test.html`.
- **Why it matters:** A reader following the README lands on a silently blank page and concludes the
  suite is broken.
- **Fix:** delete `app/test.html` and both README references (the headless suite plus the browser
  project supersede it), or repoint its three `<script>` tags at a `<script type="module">` import of
  `app/main.mjs`'s kernels. Deleting is the honest option — nothing has maintained it since the flip.
- **Prior:** new

### TEST-8 [MEDIUM] [confirmed] `direct-verify.mjs` has zero test coverage, and the spec named after its bug never imports it
- **Where:** `apps/quadrature-domains/app/direct/direct-verify.mjs` (208 lines);
  `apps/quadrature-domains/vitest/direct-verify-dispatch.test.ts`.
- **What:** `direct-verify.mjs` is reachable only through `app/lazy/direct.mjs:5`, which no test
  loads. `direct-verify-dispatch.test.ts` documents a real shipped bug — *"`direct-verify` built
  `{ weight: 'log', w0 }` … NO solver reads `opts.weight`, so that bag matched nothing specific, fell
  through to the classical `boundedQD`, and the round-trip reported the classical solver's verdict as
  a pass for the log-weighted construction"* — and then asserts the **solver registry's** dispatch
  keys instead. Nothing checks that `direct-verify.mjs` still builds the corrected bag.
- **Evidence:** the import-reachability graph (`scratchpad/scratch/A9/reach.mjs`, seeded from
  `app/test/bootstrap.js`'s two manifests and every relative import in `vitest/**`, closed
  transitively) lists `app/direct/direct-verify.mjs` among 20 unreached files.
  `grep -rn "direct-verify" vitest/` → three comment hits and no import.
- **Why it matters:** The test pins the *outcome* (`lqd: true` selects `boundedLQD`) without pinning
  the *caller* — exactly the failure mode the repo's own M5.2/M6.2/M8 notes call "pinning the outcome
  without pinning the reason". Reverting `direct-verify.mjs` to `{ weight: 'log' }` leaves the gate
  green and the Verify round-trip silently wrong again.
- **Fix:** import the real `buildVerifyOpts` (or whatever `direct-verify.mjs` exposes) and assert the
  BAG it produces, then feed that bag through `selectFamily`. Two assertions, one import.
- **Prior:** new

### TEST-9 [MEDIUM] [confirmed] The `browser` job is not a publish blocker, so the σ-mask class of defect can ship — and nothing cheaper covers the app's only boot test
- **Where:** `.github/workflows/ci.yml` (`browser:` job, no `needs`, and `build:` is `if: github.event_name != 'push'`);
  `.github/workflows/deploy-pages.yml:58-72` (`lint` → `typecheck` → `test` → `build`, then
  `deploy: needs: build`) — `deploy-pages.yml` never runs `pnpm test:browser`.
- **What:** The QD browser project is the only thing that (a) boots the app at all, (b) compiles its
  real GLSL, (c) checks the σ in-Ω mask, and (d) checks the high-resolution export's readback. All 17
  tests, 46.6 s. None of it gates publishing. CLAUDE.md's σ-mask paragraph is a defect that shipped
  and was measured at 1.14% of a 512² frame; the test written for it
  (`vitest/browser/schwarz-mask.browser.test.ts`) still cannot block a deploy.
- **Evidence:** `ci.yml`'s own comment says it: *"the `browser` job below is deliberately NOT
  skipped: deploy-pages.yml does not run it"*. `pnpm test` (both workflows) = `vitest run` over
  `vitest.workspace.ts`, which the browser config is explicitly **not** registered in.
- **Why it matters:** The publish gate cannot see a shader that does not compile (a dead canvas), an
  app that throws at boot, or the mask class of numeric defect.
- **Fix (and the honest answer to "is there a cheap GPU-free guard?"):** for the *shader numbers*,
  **no** — the σ mask's defect is a disagreement between a rasterised approximation of ∂Ω and an
  exact partial ψ, and neither side exists without a GL context, so any node-level stand-in would be
  a second implementation to keep in step. Two things are genuinely cheap, in this order:
  1. **Make `browser` a publish blocker**: add a `browser` job to `deploy-pages.yml` (or gate
     `deploy: needs: [build, browser]`). Cost is one cached-Chromium job (~4 min) per push to
     master — zero new tests, and it closes (a), (b), (c) and (d) at once. This is the change worth
     making.
  2. A **node-level** guard for the *CPU half* of the mask: `buildPolygonMaskTexture`'s `conservativeOmega`
     path is pure CPU (polygon → texture bytes) and could be asserted in the node gate against the
     float64 σ engine's own in-Ω predicate on the same sample grid — it would catch a regression in the
     pad/stroke decision, but **not** the shader's uv classification, and the report should say so.
- **Prior:** new

### TEST-10 [LOW] [confirmed] `main.mjs` eagerly imports the exact-algebra kernel, costing the entry chunk 56 kB gzip — and the docs say the eager graph is the inverse solver
- **Where:** `apps/quadrature-domains/app/main.mjs:56-59` (`sym/sym-core.mjs`, `sym/sym-radical.mjs`,
  `qd/qd-equations.mjs`, `qd/qd-constraints.mjs`); `README.md:20` ("**Startup loading:** the
  inverse-QD solver is the initial module graph"); `ARCHITECTURE.md:23-24` ("`main.mjs` eagerly loads
  only the inverse-QD path"); `app/lazy-features.mjs` (the Algebra tab is one of the four
  demand-loaded features).
- **What:** The Algebra *UI* is lazy but its *kernel* is eager. Measured by building twice:

  | | entry chunk | gzip | lazy `algebra` chunk | gzip |
  |---|---|---|---|---|
  | HEAD | 786.00 kB | 254.35 kB | 300.95 kB | 93.11 kB |
  | four imports removed | 618.15 kB | 198.09 kB | 320.34 kB | 100.35 kB |
  | delta | **−167.85 kB (−21.4%)** | **−56.26 kB (−22.1%)** | +19.39 kB | +7.24 kB |

  So the whole kernel moves into the lazy chunk for +7.2 kB gzip there and −56.3 kB gzip on the
  critical path. (The 618 kB build is a *size* measurement only, not a working app: the eager
  `ui/ui-qd-equations.mjs` reads `QD.Sym` / `QD.QDEquations` off the namespace at runtime, which is
  exactly why rollup let the modules go, and why it would then read `undefined`.)
- **Evidence:** `scratchpad/scratch/A9/{perf-measure.log,build-nosym.log}`; the entry is
  `assets/index-xesut0F_.js` per `dist/index.html`, and it contains `fromTermList`, the
  `if(l==="groebner")` job dispatcher and Buchberger — `grep -c` in the entry: `fromTermList` 1,
  `Buchberger` 1, while the lazy `algebra` chunk has 0. The four other lazy features do NOT leak:
  `buildSchwarzFromPhi`, `boundedPowerQDSingular` and `ParamSlice` are all 0 in both index chunks.
  `index-Ca2AC7N0.js` (635.86 kB) is **mathjs**, correctly behind `vendor-globals.mjs`'s
  `import('mathjs')` and idle-prefetched. `vite build` emits one warning (`chunks larger than 500 kB`)
  and no "dynamic import cannot be analysed" / worker-URL warning.
- **Why it matters:** A 22% gzip cut on the first-screen parse path, and two docs that state the
  opposite of what ships.
- **Fix:** give `ui/ui-qd-equations.mjs` (and `algebra/prove-plan.mjs`'s eager readers) an
  `await ensureSym()` at first use — the pattern `vendor-globals.mjs` already uses for mathjs — and
  drop the four `main.mjs` imports; or, if the eager QD-equations panel must stay synchronous, correct
  `README.md:20` and `ARCHITECTURE.md:23` to say the eager graph is the inverse solver **plus the
  exact-algebra kernel**, and record why.
- **Prior:** new

### TEST-11 [LOW] [confirmed] `exportSigmaDeepLink` is the only one of the three hand-off deep-link wrappers with no test — and it is the twin of the one that shipped a bug
- **Where:** `apps/quadrature-domains/app/schwarz/schwarz-export.mjs:223` (`exportPhiDeepLink`),
  `:296` (`exportSigmaDeepLink`), `:372` (`exportHeleShawDeepLink`);
  `vitest/schwarz-handoff-link.test.ts`.
- **What:** All three are thin wrappers `hash + resolveHandoffBase(loc, opts.<x>Base[, appId])`.
  `schwarz-handoff-link.test.ts` exists *because* the φ one shipped a bug (the copied link stapled the
  payload onto QD's own location, so it re-opened QD). It covers `exportPhiDeepLink` and
  `exportHeleShawDeepLink`. `exportSigmaDeepLink` — the QD → Complex-Dynamics σ recipe link, the
  ADR-0009 peer-view hand-off — is named in no test. `exportPhiJSON` (`:231`) likewise.
- **Evidence:** `for f in exportPhiDeepLink exportSigmaDeepLink exportHeleShawDeepLink; do grep -rl $f vitest/; done`
  → `schwarz-handoff-link.test.ts`, *(nothing)*, `schwarz-handoff-link.test.ts`.
  `grep -c exportSigmaDeepLink vitest/schwarz-export*.test.ts` → 0, 0, 0.
- **Why it matters:** Low risk today (its two ingredients are tested), but it is the one wrapper that
  could regress to the exact bug the sibling test was written for, on the hand-off CLAUDE.md
  describes as a first-class peer view.
- **Fix:** three lines in `schwarz-handoff-link.test.ts` — the deploy sibling-swap, the `cdBase`
  override and the unresolved local-dev case, mirroring the φ block.
- **Prior:** new

### TEST-12 [LOW] [confirmed] 20 `app/**/*.mjs` (3,829 lines) are reached by no test, and the set is almost exactly "the Direct and Sphere UI plus the lazy entries"
- **Where:** listed below.
- **What:** Import-reachability from the union of `app/test/bootstrap.js`'s two manifests and every
  relative import in `vitest/**` (transitive closure over static + dynamic `import()` + `new URL`):
  126 `.mjs` total, 106 reached, **20 unreached (3,829 lines)**:

  ```
  1078  app/direct/direct-ui.mjs          208  app/direct/direct-verify.mjs   (TEST-8)
   576  app/sphere/sphere-ui.mjs          175  app/ui/ui-h-text.mjs
   474  app/direct/direct-recompute.mjs   164  app/ui/ui-pole-grid.mjs
   390  app/ui/ui-qd-equations.mjs        148  app/ui/ui-thesis.mjs
   238  app/ui/ui-faber.mjs                81  app/core/qd.mjs
    53  app/lazy-features.mjs              45  app/ui/ui-qol-help.mjs
    47  app/test/worker-graph-cleanrealm.child.mjs (TEST-1)
    39  app/core/vendor-globals.mjs        39  app/ui/ui-copy-buttons.mjs
    34  app/solvers/prewarm.mjs            17  app/lazy/schwarz.mjs
     9  app/lazy/algebra.mjs                7  app/lazy/direct.mjs
     7  app/lazy/param-slice.mjs
  ```

  Three of these are partly covered elsewhere and should not be double-counted: `ui-qol-help.mjs` and
  `ui-copy-buttons.mjs` are asserted *indirectly* by `vitest/browser/boot.browser.test.ts`
  ("mounts the inverse-tab '?' help buttons at boot", "mounts the QoL copy buttons at boot"), and
  `app/core/qd.mjs` is the one file `tsc` checks. The `lazy/*.mjs` entries are 4-to-17-line
  side-effect barrels. What is left is the real gap: **2,128 lines of Direct-tab UI + recompute
  (`direct-ui` + `direct-recompute` + `direct-verify`)** and **576 lines of Sphere UI**, plus the
  `ui-qd-equations` / `ui-faber` / `ui-thesis` / `ui-h-text` / `ui-pole-grid` panels.
- **Evidence:** `scratchpad/scratch/A9/reach.mjs` (the script states its seeds and its closure rule).
  Method caveat stated honestly: this is *static* reachability, so a module reached only through a
  string-keyed runtime lookup would be mis-listed — I spot-checked all 20 by grep and found only the
  three qualifications above.
- **Secondary measure — exported names never mentioned in any test** (`scratchpad/scratch/A9/exports.mjs`):
  51 names across 30 files. Most are false positives (family internals invoked through the
  `QD.Family` registry by `solveInverseQD`, so executed without being named; the `algebra/*` factories
  are driven through `_algebra-mount`). The ones that are real gaps and not already covered above:
  `solver-uqd.mjs`'s `continuationInC` re-export (TEST-2 M25/M26) and `schwarz-export.mjs`'s two
  (TEST-11).
- **Why it matters:** The Direct tab is one of the two solver surfaces the owner named as "core", and
  its whole presentation + recompute layer is executed by nothing — not the node suite, not the Vitest
  specs, not the browser suite (which boots the Inverse tab only, since Direct is lazy).
- **Fix:** the browser suite already boots the app and dispatches `tab-changed`; one
  `direct.browser.test.ts` that switches to the Direct tab and asserts it mounted + recomputed would
  cover 2,128 of the 3,829 lines. That is also the only place it *can* be covered, which is another
  argument for TEST-9's fix.
- **Prior:** new

### TEST-13 [LOW] [confirmed] `eslint.config.mjs`'s stated reason for keeping `no-unused-vars` at `warn` — "~294 findings" — is false at HEAD; the backlog is empty
- **Where:** `apps/quadrature-domains/eslint.config.mjs` (the `.mjs` block's comment: *"no-unused-vars
  stays at WARN … deliberately: turning it on surfaces ~294 findings across this tree, and a green
  gate that shows them beats a red gate that blocks everything until a 294-item cleanup lands"*).
- **What:** `npx eslint app` (no `--max-warnings`) produces **zero bytes of output** over 159 files —
  0 errors and 0 warnings. The cleanup landed; the comment did not notice.
- **Evidence:** `wc -c` on both lint logs → 0. Negative control, so "0" is not a silent no-op:
  appending `const zzzUnusedConst = 5; function zzzUnusedFn(){ return 1; }` to
  `app/analysis/univalence.mjs` gives exactly
  `2 problems (0 errors, 2 warnings) … no-unused-vars`. (A first control using `__`-prefixed names
  produced nothing, correctly — `varsIgnorePattern: '^_'` matches them.)
- **Why it matters:** The rule can be promoted to `error` for free, and the app's lint gate would then
  catch dead code (e.g. TEST-3's trio, were its `eslint-disable` removed) instead of tolerating it.
  A comment that overstates a backlog also deters the next person from trying.
- **Fix:** flip `no-unused-vars` to `'error'` in the `.mjs` and `.js` blocks and replace the comment
  with the measurement. Note `no-shadow` is **not** enabled for this app (CLAUDE.md records it as an
  error for `apps/contour-integration/**` only, after a shadowed-`let` bug there); QD's solver files
  are also long closures over mutable namespace state, so it is worth measuring here — I did not.
- **Prior:** new

## Structural observations

- **The wrapper set is hand-maintained and one entry short.** `app/node-test.js`'s `TESTS` (30
  names) and `vitest/node/*.test.ts` (29 files) are two hand-synced lists, and `_run.ts`'s `FLOORS`
  is a third (it is a verbatim copy of `node-test.js:93-101`'s, minus `worker-graph-cleanrealm`).
  The file's own header brags that the loader lists "are now DERIVED from asset-manifest.js — no more
  hand-synced copies"; the *test* lists went the other way. One generated wrapper per `TESTS` entry,
  or one spec asserting the two sets are equal, removes the class (TEST-1).
- **Three stale claims about how the QD suite runs, in three places, all contradicting each other and
  HEAD.** `CLAUDE.md` ("the Quadrature-Domains maths runs as a separate headless runner wrapped as
  one Vitest spec (`node app/node-test.js`)"), `vitest.workspace.ts:8-10` ("wrapped in a single
  Vitest spec"), and `vitest.config.ts:4-9` (which correctly describes the 29-wrapper replacement and
  says the single-spec form was *retired*). At HEAD no spec spawns `node app/node-test.js` at all.
  See the drift table.
- **The `solvers.test.js` four-way shard is balanced by assertion count, not time**, so `solvers-3`
  (33.5 s) is 3.2× `solvers-1` (10.6 s) and sets the project's critical path. The split's own comment
  says the four bodies "concatenate byte-for-byte", which is the right invariant to keep — a
  rebalance can move whole `{ … }` blocks between shards and preserve it.
- **The `.ok`-marker "skip" idiom is safe, and I checked rather than assumed.** All 13
  `ok(…, true)` calls are skip markers, and each of the seven `schwarz.test.js` ones sits in an
  `else` branch *after* an `ok('… solve success', r.success, …)` that already fires — so a solver
  regression goes red, and the marker only preserves the per-file assertion count against
  `FLOORS.schwarz = 20`. Worth recording as a non-finding because it looks like a defect.
- **Two source-text idioms that are better than they look.** The 19 direct specs that `readFileSync`
  an app module and regex it are not lazy tests: six of them are the explicitly-declared
  *source-structural half* of a pair whose *behavioural half* mounts the real DOM through
  `vitest/_algebra-mount.ts`, the split is documented on both sides, and the node halves **blank
  comments before matching** (`algebra-honest-labels.test.ts:22-24`) "so prose describing a defect
  cannot satisfy a check meant to find it". Likewise `solver-family-golden.test.ts` is honestly
  labelled a characterization net (goldens captured from the code, for a shell refactor) and
  `vitest/fixtures/gen-cas-corpus.py` is a genuinely independent Sympy oracle. Nothing to fix.
- **The suite is deliberately a main-thread suite, and says so.** `vitest/helpers/web-worker-shim.mjs`
  states that the "2100+ headless assertions" hit the synchronous main-thread fallback, "proving
  nothing about the worker path"; only `sym-worker-thread.test.ts` and the two lifecycle specs drive a
  real worker round-trip. That is a reasonable trade, but it means the five bundled
  `*-worker-entry.mjs` graphs are protected only by `worker-graph-cleanrealm` — which is the file CI
  does not run (TEST-1). The two findings compound.
- **Assertion-vacuity is low, measured rather than assumed.** 1,791 `ok()` calls in the node suite:
  13 are skip markers, 140 pass a bare identifier, and spot-reading ~40 of those found them all to be
  booleans computed above (`allVanish`, `paired`, `threw`, `r.ok`) — none is a truthy object. 2,849
  `expect()` calls in the direct specs: 79 `toBeTruthy()`, 9 `not.toThrow()`, 2 `toBeDefined()` = 3.2%
  weak, 0 `expect(true).toBe(true)`, 0 matcher-less `expect(x);`. Tolerances are tight
  (`approxEq`'s default is `1e-8`; only 8 call sites loosen past `1e-2`, all with a stated reason).
  The suite's weakness is **what it does not reach**, not what it asserts.
- **The vm-context bootstrap leaks by design and the leak is the point.** `bootstrap.js` installs the
  kernels on `global` so the CommonJS files read bare names; `worker-graph-cleanrealm` exists precisely
  to catch what that leak hides. Order is genuinely not load-bearing: 2342/0 with `TESTS` reversed
  and shuffled, matching the header's claim ("bootstrap eagerly loads every kernel, so each file's
  `run()` only reads already-resolved globals"). No inter-file order dependence found.
- **Console noise in a green run is 13 lines out of 2,398**, all either a worker-unavailable notice
  (expected in node), a param-slice CAPABILITY-bucket message naming an unimplemented family, or a
  deliberate diagnostic print. Nothing to clean.
- **No flakiness at idle**, 3× identical (1285/1285, same per-test status set) — the one flake is
  load-induced and is TEST-4.
- **jsdom opt-in count**: 33 spec files carry `// @vitest-environment jsdom` on line 1, plus
  `vitest/_algebra-mount.ts` at line 10 — which is **not** a spec (Vitest's glob excludes it) and
  whose header says so and tells importers to declare the docblock themselves. All 11 importers do.
  CLAUDE.md's "~34" is accurate; nothing to fix.

## Improvement proposals (core functionality)

1. **The eight unit tests that take the mutation sweep from 14/26 to 22/26 (S).** All on
   already-exported functions, all node-env, ~60 lines total: `residualNorm` over a vector whose last
   component dominates (M07 — it is the Newton stopping criterion); `unboundedQD` with `m ≥ 3` and
   complex `F[0]` (M18 — 38% error today, unobservable on every existing input); a univalent-but-NOT-
   spiral-like φ (M10) and a NOT-star-like / NOT-convex one (M09); a near-cusp at the `relTol`
   boundary (M13); `sampleBoundary`'s θ closure (M04); `segmentsCross`'s endpoint exclusion (M05);
   `isBoundaryUnivalent` on a φ with a non-finite boundary sample (M03). *Why:* the suite currently
   guards outcomes and not primitives, so any refactor of a primitive is unguarded. *Prereq:* none.
   *Risk:* none — pure additions.
2. **Put `continuationInC` under direct test (S–M).** `solver-continuation.mjs` is the shared
   continuation-in-c homotopy for three unbounded families and has no test of its own stepping
   logic: M25 (never grow the step) and M26 (start past the target) both survive. It is a clean
   pure-ish function — `(hData, cTarget, {initialGuess, label, method, options})` → `{success, phi,
   trace}` — so a test can assert the **trace**: monotone `c`, at least one grow, a shrink on an
   injected Newton failure, and the documented underflow refusal. *Why:* continuation is how the
   UQD/UQD-LQD families reach large `c` at all; a silent regression to "never grows" turns a 5-step
   homotopy into an 80-step one and looks only like a slowdown. *Prereq:* none. *Risk:* low.
3. **Make the publish gate see the browser suite (S), then cover the Direct tab in it (M).** TEST-9's
   fix 1 is six lines of YAML and closes the app's only boot check, its only real-GLSL compile, and
   the σ-mask net. With that in place, one `direct.browser.test.ts` that dispatches `tab-changed` →
   `direct` and asserts the tab mounted and recomputed covers 2,128 of the 3,829 unreached lines
   (TEST-12) — and it is the *only* place they can be covered, since the Direct UI needs a DOM and a
   2D context. *Why:* the Direct solver is one of the two surfaces the owner named core, and its whole
   UI + recompute layer is executed by nothing. *Prereq:* TEST-9 fix 1. *Risk:* adds ~50 s to the
   master-push gate.
4. **Derive the wrapper set instead of hand-syncing it (S).** One spec that reads `TESTS` out of
   `app/node-test.js`, asserts a `vitest/node/<name>.test.ts` exists for each, and asserts
   `_run.ts`'s `FLOORS` keys match `node-test.js`'s. That turns TEST-1 from a fix into an invariant,
   and it is the same "derived, not hand-synced" move the loader manifests already made.
   *Prereq:* TEST-1's wrapper. *Risk:* none.
5. **One `resolveChromium()` for every Playwright entry point in the repo (S).** QD's
   `vitest.browser.config.ts` probes `/opt/pw-browsers/chromium`; contour-integration reads
   `CAS_CHROMIUM_EXECUTABLE`; complex-dynamics and `packages/gpu` take both; complex-function-plotter,
   `packages/schwarz` and QD's three `perf/*.mjs` take neither. CLAUDE.md already asks for this
   ("unify them when one is next touched") and lists two of the five gaps. A tiny shared helper —
   `[env.QD_CHROME_PATH, env.CAS_CHROMIUM_EXECUTABLE, "/opt/pw-browsers/chromium", …Windows paths]
   .find(existsSync)` — fixes TEST-5 and the two CLAUDE.md gaps at once. *Prereq:* none (it is below
   every consumer, so no ADR-0007 question). *Risk:* none.
6. **Rebalance the four `solvers-*` shards by measured time (S).** 10.6 / 23.0 / 33.5 / 21.7 s today;
   moving whole `{ … }` blocks between shards (preserving the byte-for-byte concatenation invariant
   the split documents) would put the project's critical path near 22 s instead of 33.5 s. *Why:* it
   is the QD project's longest pole and the cheapest wall-clock win in the gate. *Risk:* low, and the
   concatenation invariant is checkable by `cat`.

## Documentation drift

| doc `file:line` | claims | reality (`file:line`) | severity |
|---|---|---|---|
| `CLAUDE.md` (setup §) | "the Quadrature-Domains maths runs as a separate headless runner wrapped as one Vitest spec (`node app/node-test.js`)" | No spec spawns it. 29 per-file wrappers via `vitest/node/_run.ts`; `vitest.config.ts:4-9` says the single-spec form was replaced (finding QD-TEST-1) | MEDIUM |
| `vitest.workspace.ts:8-10` | "quadrature-domains runs its original headless node-test.js suite unchanged, wrapped in a single Vitest spec" | same as above; this file and `vitest.config.ts` now contradict each other | MEDIUM |
| `README.md:134-135`, `README.md:315` | "`app/test.html` is an in-browser test page … complementary to the headless runner" | Loads `complex.js`/`taylor.js`/`solver.js`, all deleted in the ESM migration → three 404s, empty results (TEST-7) | MEDIUM |
| `README.md:20`; `ARCHITECTURE.md:23-24` | "the inverse-QD solver is the initial module graph"; "`main.mjs` eagerly loads **only** the inverse-QD path" | `main.mjs:56-59` also loads `sym-core` + `sym-radical` + `qd-equations` + `qd-constraints` — 56.3 kB gzip of the 254.4 kB entry (TEST-10) | MEDIUM |
| `app/qd/qd-equations.mjs:189-192` | "Its two siblings are used; dropping only the third would leave a half-set" | `conjMPoly` is called only by the dead `conjFR`, `conjVarName` only by `conjMPoly` — all three unreachable (TEST-3) | MEDIUM |
| `eslint.config.mjs` (`.mjs` block) | "turning [`no-unused-vars`] on surfaces ~294 findings across this tree" | `npx eslint app` = 0 errors, 0 warnings over 159 files; the backlog is empty (TEST-13) | LOW |
| `CONTRIBUTING.md:157-160` | the suite lives in "`solvers.test.js`, `direct.test.js`, …" | `solvers.test.js` was split into `solvers-1..4` at Stage B2 and no longer exists | LOW |
| `CONTRIBUTING.md:164-165` | "Fast (well under 30 s for the full battery + parse-checks)" | 83 s measured here (67–70 s reordered, 57 s on the brief's quieter machine) — 2–3× the claim | LOW |
| `CONTRIBUTING.md:150` | "`node app/node-test.js` (also `pnpm test`) is the entry" | true in-package, false at the repo root, where `pnpm test` is the Vitest workspace and never runs `node-test.js`. Worth disambiguating given TEST-1 | LOW |
| `vitest.config.ts:4`; `vitest/node/_run.ts:4` | "26 CommonJS files" / "required all 26" | 30 files in `TESTS` (29 wrapped + `worker-graph-cleanrealm`) | LOW |
| `tsconfig.json` header | describes `allowJs`/`checkJs:false` and "the handful of files that already opt in via `// @ts-check`" | exactly **one** file does (`app/core/qd.mjs`); `solver.mjs:1` is `@ts-nocheck`. Also: `include` names no `.ts`, so the 149 Vitest specs are outside the program (TEST-6) | LOW |
| `README.md:75-80` | `perf:measure` "builds, serves, and measures the production app in local Chrome … `QD_CHROME_PATH` to select a Chromium executable" | exits 1 on Linux/macOS without that env var; the container's documented `/opt/pw-browsers/chromium` is not probed (TEST-5) | LOW |

## Tests

**Vacuous or wrong-reason tests found.** Two, plus one method defect in the suite's own gate:

1. **`vitest/direct-verify-dispatch.test.ts` pins the outcome without pinning the reason** (TEST-8) —
   it documents a bug in `direct-verify.mjs` and asserts the solver registry instead; the module it
   is named after is imported by nothing. Surviving mutation: revert `direct-verify.mjs`'s opts bag
   to `{ weight: 'log', w0 }` and the gate stays green. (I did not apply this mutant — the module is
   statically unreachable from every test, which is the stronger statement.)
2. **`vitest/sym-factor-recombine-cap.test.ts:33` asserts wall-clock time** (TEST-4) — its verdict is
   decided by machine load, not by the code. Demonstrated in both directions: the same four mutants
   read `KILLED` under 3-way contention (file duration 4.5–5.1 s vs the 4.0 s assertion) and
   `SURVIVED` when re-run serially.
3. **The per-file assertion floors do not cover the direct specs.** `_run.ts`'s `FLOORS` guard the 29
   wrapped files against silently shrinking to ~0 assertions, and `scripts/assert-test-census.mjs`
   guards the project against collecting **zero** files — its floor is 1. Between those two there is
   no guard: the 136 direct specs (1256 tests) could collapse to one and both gates stay green. A
   per-project floor near the real number (e.g. 120 files) in `assert-test-census.mjs` costs one
   line.

**The mutation sweep** is TEST-2's table: **26 mutants, 14 killed, 12 survived** the full QD gate
(2342 headless assertions + 1256 Vitest tests). Survivors, with the one-line reason each:

| id | site | why it survives |
|---|---|---|
| M03 | `solver.mjs:733` | no test builds a φ with a non-finite boundary sample |
| M04 | `solver.mjs:741` | nothing pins the boundary sampler's θ grid, only its consumers |
| M05 | `solver.mjs:750` | `SEG_ENDPOINT_EPS` movable by 10⁶; `segmentsCross` has no direct test |
| M07 | `solver.mjs:191` | `residualNorm` — the Newton stopping criterion — is used as a test *helper*, never asserted |
| M09 | `univalence.mjs:59` | `MARGIN_TOL` ×10⁴; no test near the star/convex margin boundary |
| M10 | `univalence.mjs:141` | §25 asserts only the POSITIVE direction — no NOT-spiral-like case exists |
| M13 | `cusps.mjs:74` | `DEFAULT_REL_TOL` ×10; no near-cusp at the tolerance boundary |
| M15 | `critical-set.mjs:84` | every preset is symmetric, so a half-circle seed ring still finds every critical point |
| M18 | `direct-common.mjs:566` | every `unboundedQD` test has `m ≤ 2`, where the conjugated factor is `0` or real (38% error on `m = 3` complex — measured) |
| M20 | `qd-equations.mjs:186` | the function is **dead code** (TEST-3), not a coverage gap |
| M25 | `solver-continuation.mjs:97` | `continuationInC`'s stepping logic has no direct test |
| M26 | `solver-continuation.mjs:56` | same |

Two mutants (M01 `IDENTITY_TOL`, M22 `nodeInsideDisk`) are killed **only** by direct Vitest specs and
not by `node app/node-test.js` — worth knowing for anyone measuring against the headless suite alone.
M01's killer (`solver-identity-tol.test.ts`) pins the literal `1e-6` rather than a behaviour, which is
the right choice for a single-source constant.

**Coverage gaps that matter**, ranked: (1) `worker-graph-cleanrealm` outside CI (TEST-1) — a whole
bug class, zero cost to fix; (2) the primitives under the solver (TEST-2) — eight small tests;
(3) 2,128 lines of Direct-tab UI + recompute and 576 of Sphere UI reached by nothing (TEST-12),
coverable only in the browser suite, which does not gate publishing (TEST-9); (4) the 149 Vitest
`.ts` specs neither type-checked nor linted (TEST-6).

**Instrument-quality note on my own method:** the parallel first pass of the mutation sweep produced
five false kills, all from the one timing assertion (TEST-4), and I only caught them because the
failing test could not possibly reach the mutated code. A sweep run in parallel on a shared machine
against a suite containing a wall-clock assertion is not a sweep. Serial re-runs are in
`scratchpad/scratch/A9/sweep2-results.txt`; the corrupted parallel pass is kept in
`sweep2-parallel.txt` as the evidence for TEST-4.
