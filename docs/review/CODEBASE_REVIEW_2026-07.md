# Whole-codebase review — 2026-07-25

> **Status: IN PROGRESS.** This file is the running log of a comprehensive review of the whole
> monorepo for errors, redundancies, inefficiencies, and optimization/extension opportunities.
> It is written incrementally so that findings survive a context loss. The prioritized summary
> lives at the end, in [§ Prioritized report](#prioritized-report), and is filled in last.

## Commission

- **Scope:** full sweep, *weighted* — most effort on the under-reviewed surface
  (`apps/complex-dynamics`, `apps/correspondences`, the five `@cas/*` packages, `apps/launcher`,
  build/CI/tooling), a lighter re-pass on `apps/quadrature-domains`' algebra module (which has
  already had six exhaustive, closed review passes).
- **Output mode:** report **plus safe fixes applied inline**. Trivial / zero-risk items
  (dead code, typos, obvious micro-optimizations) are fixed as they are found and recorded here;
  anything substantive stays a recommendation for explicit approval.
- **Method:** multi-agent — 12 scoped finder agents, each immediately followed by an
  *adversarial verifier* that tries to refute its findings against the actual source. Only
  findings that survive verification enter the report.
- **Emphasis:** **hardening** — correctness bugs, redundancy, and performance/memory come first;
  extension ideas are kept brief.

## Standing constraints applied to every finding

The reviewers were told these are locked and must not be re-litigated:

| Constraint | Source |
| --- | --- |
| Monorepo + pnpm workspaces + `packages/*` + `apps/*` | ADR-0001 / ADR-0004 |
| App internals stay incrementally-typed; full TS typing is **not** a goal | ADR-0002 |
| `@cas/core` is convention-neutral — no `π` / `2πi` constants | ADR-0006 |
| Extraction only on a genuine **second consumer** | ADR-0007 |
| Separate apps + launcher; no unified single-page shell | Decision 8 |
| **Honest labeling** (`=` exact, `≤` bound, `≈` estimate) is paramount | Guardrails |

Also declared out of bounds because they were already investigated and rejected or already closed:
multi-modular/CRT Gröbner and F4/F5; re-reporting the six closed QD-algebra review passes; merging
CD and Correspondences dynamical math (holomorphic ≠ anti-holomorphic); moving per-app GLSL into a
shared package.

## Baseline

Measured at review start, master @ `c2f5777`:

| Area | Files | Lines |
| --- | ---: | ---: |
| `apps/quadrature-domains` | 220 | 78 329 |
| `apps/complex-dynamics` | 135 | 26 787 |
| `apps/correspondences` | 37 | 4 115 |
| `packages/expr` | 23 | 2 465 |
| `packages/gpu` | 18 | 1 501 |
| `packages/core` | 13 | 1 158 |
| `packages/exact` | 10 | 951 |
| `packages/interchange` | 10 | 799 |
| `apps/launcher` | 1 | 8 |

Gate at baseline, measured directly:

| Check | Result |
| --- | --- |
| `pnpm -r --filter "./packages/*" run build` | **green** (exit 0) |
| `pnpm lint` | **green** (exit 0, zero warnings) |
| `pnpm typecheck` | **green** (exit 0) |
| `pnpm test` | deferred — run at the end, to avoid the known Windows forks-pool flake under agent CPU contention |

So every finding below is a latent issue, not a currently-red gate.

> **Local environment note (not a code defect):** the dev machine runs Node **v21.5.0** while
> `engines.node` is `>=22`, so every pnpm invocation emits an `Unsupported engine` warning. CI
> uses 22. Worth aligning locally to keep the warning noise from masking a real one.

---

## Review scopes

Twelve scopes, each find→verify:

| # | Scope | Covers |
| --- | --- | --- |
| 1 | `cd-core` | CD shell/state: `main.ts`, `state/`, `ui/`, `presets.ts`, `combinatorics/` |
| 2 | `cd-render` | CD `render/`: `glPlot`, `shaderBuilder`, `overlay`, `plotView`, `matingEngine`, perturbation/BLA |
| 3 | `corr` | the whole Correspondences app (youngest, least reviewed) |
| 4 | `pkg-core-exact` | `@cas/core` + `@cas/exact` |
| 5 | `pkg-expr-gpu-ic` | `@cas/expr` + `@cas/gpu` + `@cas/interchange` |
| 6 | `qd-app` | QD outside the algebra module: solvers, UI, `direct/`, `schwarz/`, `param-slice/`, `sphere/` |
| 7 | `qd-algebra` | QD algebra — light re-pass, weighted to the newest (X1) code + known perf debt |
| 8 | `duplication` | cross-cutting duplicate logic, divergence, dead code |
| 9 | `perf` | cross-cutting performance + memory |
| 10 | `build-ci` | build, tooling, config, CI, dependencies, dependency direction |
| 11 | `tests` | test-suite quality: vacuous tests, untested high-risk paths, flake patterns |
| 12 | `ux-a11y` | usability, accessibility, error-handling UX across all four apps |

---

## Findings log

_(populated as scopes report in; each entry records the adversarial verdict)_

### Scope 0 — direct observations (reviewer's own, pre-sweep)

These were established first-hand from the workspace manifests and configs, independent of the
agent sweep.

#### 0-1 — Gate coverage holes in the workspace manifests · MEDIUM · maintainability

`pnpm lint` reports `Scope: 4 of 10 workspace projects`, and `typecheck`/`test` are similarly
partial, because several workspace members simply do not declare the script:

| Member | `lint` | `typecheck` | `test` | `build` |
| --- | :-: | :-: | :-: | :-: |
| `apps/launcher` | ✗ | ✗ | ✗ | ✓ |
| `@cas/expr` | ✓ | ✓ | ✓ | **✗** |
| `@cas/gpu` | ✓ | ✓ | ✓ | **✗** |

`pnpm -r run <script>` **silently skips** members that lack the script, so these holes are
invisible in a green run.

- **`apps/launcher`** is the published root of the combined Pages site yet is excluded from
  lint, typecheck, and test entirely. It contains no JS source (only `index.html`,
  `vite.config.js`, `package.json`, `README.md`), so the exposure is limited to the landing
  page's markup and links — but a broken link or malformed tag at the site root is exactly the
  kind of thing nothing currently catches.
- **`@cas/expr` and `@cas/gpu` have no `build` script and no `dist/`.** Their `exports` maps
  point straight at `./src/*.ts`. This works (Vite/Vitest transpile on the fly) but it is an
  undocumented asymmetry with `core`/`exact`/`interchange`, and it makes
  [README.md:74](README.md:74) — "apps and tests consume the packages' **built `dist/`**" —
  false for two of the five packages.

#### 0-2 — The dependency-boundary rule does not cover `.js` files · LOW · maintainability

[eslint.config.js:57-63](eslint.config.js:57) applies `no-restricted-imports` to
`apps/**/*.{ts,tsx,mts,cts,mjs}` and `packages/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}`. The app
glob omits `.js`, so the 31 `.js` files under `apps/` — chiefly QD's `app/test/*.test.js`
harness suite — are outside the one rule the root config exists to enforce. The risk is small
(no current violation), but the guard has a hole in exactly the file type the QD app uses for
its headless tests. Adding `js` to the app glob costs nothing.

#### 0-3 — CI runs the full gate two-to-four times per change · MEDIUM · efficiency

Verified by reading both workflows:

- [ci.yml:11-14](.github/workflows/ci.yml:11) triggers on `push: branches: ["**"]` **and** on
  `pull_request`. The `concurrency.group` is `ci-${{ github.ref }}`, and a push ref
  (`refs/heads/x`) differs from a PR ref (`refs/pull/N/merge`) — so opening a PR from a branch in
  this repo runs the whole `build` + `browser` gate **twice** in parallel, on identical code.
- On a push to `master`, [deploy-pages.yml:47-59](.github/workflows/deploy-pages.yml:47) re-runs
  `lint` + `typecheck` + `test` + `build` a second time, in addition to `ci.yml`'s `build` job.
  That duplication is deliberate and documented (direct pushes bypass branch protection), but it
  means the merge of a PR costs a **third and fourth** full gate run.
- **Neither workflow caches the pnpm store.** Only the Playwright browser binary is cached
  ([ci.yml:70-74](.github/workflows/ci.yml:70)). `actions/setup-node@v4` supports
  `cache: "pnpm"`, and all three jobs do a cold `pnpm install --frozen-lockfile` every run.

Combined, a routine PR-and-merge cycle pays for roughly four cold installs and three full gates.
Fix: add `cache: "pnpm"` to all three `setup-node` steps, and restrict the `ci.yml` push trigger
to `branches-ignore: [master]` or gate it with
`if: github.event_name == 'push' && github.ref == 'refs/heads/master' || github.event_name == 'pull_request'`
so a branch push and its PR don't both fire.

#### 0-4 — KaTeX is installed twice at incompatible versions · LOW · maintainability

`apps/complex-dynamics` declares `katex: "^0.17.0"`; `apps/quadrature-domains` declares
`katex: "0.16.47"` (an exact pin, no caret). Both are physically installed
(`node_modules/.pnpm/katex@0.16.47` and `katex@0.17.0`), so the two apps render math through
different major-ish KaTeX versions with different APIs and CSS. Every other shared tool
(eslint, typescript, vite, vitest, prettier, globals) *declares* a different range per member but
pnpm resolved each to a single version, so those are cosmetic — KaTeX is the one real split.

Not urgent (each app bundles its own, so there is no single-bundle bloat), but it means a KaTeX
fix applied in one app silently does not reach the other. Worth aligning on one version.

#### 0-5 — Both published apps ship one oversized eager chunk; no code splitting · HIGH · performance

Measured from a real production build (`pnpm build`, exit 0):

| App | `dist` total | Largest JS chunk | Dynamic imports in source |
| --- | ---: | ---: | ---: |
| `quadrature-domains` | 3.8 MB | **1 326 KB** (`assets/index-C6P5SEJC.js`) | **1** (mathjs only) |
| `complex-dynamics` | 2.1 MB | **608 KB** (`assets/index-C_eRkfdf.js`) | **0** |
| `correspondences` | 76 KB | 42 KB | splits into 3 chunks |
| `launcher` | 8 KB | — | — |

Both CD and QD trip Vite's chunk-size warning on every build:

```
apps/complex-dynamics build: (!) Some chunks are larger than 500 kB after minification.
apps/quadrature-domains build: (!) Some chunks are larger than 500 kB after minification.
```

and **neither configures `manualChunks` or `chunkSizeWarningLimit`** — the warning is simply
being absorbed. (`apps/correspondences/vite.config.ts:9` is the only `rollupOptions` in the repo,
and Correspondences is consequently the only app that splits properly.)

What is in the eager chunks, verified by grepping the built bundles:

- **QD's 1 326 KB chunk contains the entire symbolic-algebra engine** — `Buchberger`, `groebner`,
  and KaTeX identifiers are all present. That is `sym-core.mjs` (6 017 lines) + `algebra-ui.mjs`
  (4 935) + `algebra-store.mjs` (3 133) + `prove-plan.mjs` (1 151) ≈ **15 k lines of exact-CAS
  code parsed on first paint**, for a user who may only ever look at a domain plot. The one
  dynamic import QD does have (mathjs) correctly split into its own 620 KB chunk — proving the
  mechanism works and is simply not applied to the algebra workspace.
- **CD's 608 KB chunk has zero dynamic imports** — KaTeX is inlined, alongside the whole
  4 329-line `main.ts` and every render module. `driver.js` (guided tour) and `gif.js` (GIF
  export) are declared dependencies used on rare user actions; both are prime `import()`
  candidates.

**Failure scenario:** a first-time visitor on a mid-range phone over 4G downloads and parses
~1.3 MB of JavaScript before the Quadrature Domains canvas draws, the bulk of it a computer-algebra
system they have not asked for. Time-to-interactive is dominated by parse/compile of code that is
dead for that session.

**Fix:** `await import()` the Algebra workspace entry in QD (it is already a self-contained module
group behind a panel), and lazy-load KaTeX, `driver.js`, and `gif.js` in CD at first use. Both are
localized changes with no architectural consequence. Optionally set an explicit
`build.chunkSizeWarningLimit` afterwards so the warning stays meaningful rather than permanent.

#### 0-6 — checked and *not* a defect

Recorded so it is not re-investigated:

- `apps/quadrature-domains` declares `@cas/exact` as a **devDependency** while the others are
  runtime dependencies. This is correct and deliberate — the only usage is
  [vitest/exact-symcore-differential.test.ts:31](apps/quadrature-domains/vitest/exact-symcore-differential.test.ts:31),
  and the file documents the choice.
- QD appears to reference `@cas/expr` without declaring it, but the sole occurrence
  ([direct-common.mjs:966](apps/quadrature-domains/app/direct/direct-common.mjs:966)) is inside a
  comment. Not an undeclared dependency.
- `mathjs` in QD is genuinely used (51 references across `direct-common.mjs`, `main.mjs`,
  `ui-h-text.mjs`, `vendor-globals.mjs`, and tests). Not dead weight.

#### 0-7 — `docs/` and `README.md` test-count claim to re-verify · LOW · documentation

[README.md:35](README.md:35) claims "**1550+ Vitest tests**". This is re-measured at the end of
this review against an actual full run.

<!-- FINDINGS-LOG -->

---

## Fixes applied inline

_(trivial / zero-risk changes made during the review)_

<!-- FIXES-LOG -->

---

## Prioritized report

_(written last, once every scope has been verified)_

<!-- PRIORITIZED-REPORT -->
