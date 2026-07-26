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
| `pnpm test` | **green** — 1820 tests / 193 files, exit 0 (run at the end, after agent CPU contention subsided) |
| `pnpm build` | **green** (exit 0; two chunk-size warnings — see 0-5) |

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

## What happened to the sweep (and what that means for confidence)

The 12-scope find→verify workflow **hit a usage limit mid-run**. Outcome:

- **11 of 12 finder scopes completed** and returned **124 findings** (1 critical, 25 high,
  59 medium, 39 low). All are recovered verbatim into
  [`RAW_FINDINGS_2026-07.md`](RAW_FINDINGS_2026-07.md) and committed, so they cannot be lost again.
- **The `qd-algebra` finder did not complete.** That was the deliberately light re-pass over the
  most heavily reviewed code in the repo, so it is the cheapest scope to have lost.
- **The adversarial-verifier stage was almost entirely killed** — only `ux-a11y` was
  machine-verified. Verification therefore falls to the reviewer, by hand.

**This matters for how the report should be read.** The verifier existed to kill plausible-but-wrong
findings, and its absence is the single largest caveat here. Consequently every finding below
carries an explicit status:

| Status | Meaning |
| --- | --- |
| **VERIFIED** | The reviewer opened the cited code and confirmed the defect first-hand. |
| **VERIFIED — corrected** | Real, but narrower or less severe than the finder claimed; severity restated. |
| **REFUTED** | Checked and *not* a defect. Recorded so it is not re-investigated. |
| `UNVERIFIED` | Cited evidence looks sound but the reviewer has not personally confirmed it. **Treat as a lead, not a fact.** |

---

## Findings log

### Reviewer-verified findings

#### V-1 — `cd-dk-01` — Durand–Kerner returns `converged: true` with all-NaN roots · **CRITICAL** · **VERIFIED** · ✅ FIXED

The single most serious finding, and squarely in the class this project calls the one unacceptable
bug: a non-answer labelled certified.

[durand-kerner.ts:84](packages/core/src/durand-kerner.ts:84) defaults `bailOnNonFinite` to `false`.
When a delta becomes NaN (e.g. `evalMonic` overflows to `Infinity` and `Infinity/Infinity → NaN`),
the accumulator

```ts
if (dm > maxDelta) maxDelta = dm;   // NaN > 0  ===  false
```

never fires, because **every** NaN comparison is false. `maxDelta` stays `0`, the sweep's
`maxDelta < tol` test passes, and the kernel returns `{ converged: true, roots: [NaN, NaN, …] }`.

**Exposure is wide.** `bailOnNonFinite: true` is set at exactly **one of eight** call sites
([critical.ts:172](apps/complex-dynamics/src/render/critical.ts:172)). The other seven —
`dynatomic.ts:124`, `matingEngine.ts`, `correspondence.ts:58`, `deltoid.ts:44`,
`deltoidExact.ts:79`, QD's `direct-common.mjs:73` and `faber-analysis.mjs:57` — all run on the
default and consume `converged` as a trustworthy flag.

**The codebase had already fixed this bug's sibling.**
[durand-kerner.test.ts:142](packages/core/test/durand-kerner.test.ts:142) guards the identical
"`maxDelta` stays 0 → false convergence" trap on the *coincident-root* path. The non-finite path
was simply missed.

**Fix applied** (PR [#154](https://github.com/ajgraven/complex-analysis-suite/pull/154)): `if (!(dm <= maxDelta)) maxDelta = dm;` — NaN now reaches `maxDelta`,
and `NaN < tol` is false, so convergence is correctly withheld. Guarded by a new test **proven to
fail against the old code** (old: `maxDelta = 0 → converged = true`; new: `maxDelta = NaN →
converged = false`).

#### V-2 — `cd-alias-03` — `addMulInto` violates its own documented aliasing contract · HIGH → **MEDIUM** · **VERIFIED — corrected** · ✅ FIXED

[complex.ts:66](packages/core/src/complex.ts:66) states, for the whole in-place family:
*"SAFE TO ALIAS: `out` may be the same object as `a` or `b`."* `mulInto` honours it with a temp;
`addMulInto` did not — it wrote `out.re`, then read `a.re` (the same field, now updated) to form the
imaginary part. Proven: aliased `acc += acc*i` on `1+i` returned `0+1i` instead of `0+2i`.

**Severity corrected down from HIGH.** `addMulInto` has **no production call site** — the only
reference in the entire repo is the package's own test. This is a latent trap in a shared API, not
a live bug. (It is also the vector by which finding `cd-dead-10` — the unused in-place exports —
went unnoticed.)

**Fix applied** (PR [#154](https://github.com/ajgraven/complex-analysis-suite/pull/154)): both products are now formed before either component of `out` is
written. Guarded by a test proven to fail against the old code.

#### V-3 — `bt-lint-mjs-01` — 97 of QD's 98 production `.mjs` files have **zero** lint rules · **HIGH** · **VERIFIED — corrected**

Confirmed empirically rather than by reading, via `eslint --print-config`:

| File | Active rules |
| --- | ---: |
| `app/ui.mjs` | **0** |
| `app/sym-core.mjs` | **0** |
| `app/main.mjs` | **0** |
| `app/qd.mjs` | 1 |
| `app/test/harness.js` | 14 |

Every `files:` glob in [eslint.config.mjs](apps/quadrature-domains/eslint.config.mjs) targets
`app/**/*.js` or a named `.js` file; the sole `.mjs` glob is `app/qd.mjs`. The correctness rules the
config deliberately enumerates — `no-undef`, `no-unused-vars`, `no-unreachable`, `use-isnan`,
`valid-typeof`, `no-dupe-keys` — therefore apply only to the legacy `.js` files, which after the
ESM migration are mostly tests.

**Root cause is visible in the config itself.** The comment at
[eslint.config.mjs:100](apps/quadrature-domains/eslint.config.mjs:100) reads *"classic `<script>`
tags; ESM lives in qd.mjs"* — true before the Phase-2 ESM migration. The migration moved the whole
app to `.mjs`; the lint config never followed.

**Severity corrected: the hole is real, but it is not hiding live bugs.** Applying QD's own rule
set to the `.mjs` tree surfaces **306 findings across 57 of 126 files**, and the breakdown is
reassuring:

| Rule | Count | Assessment |
| --- | ---: | --- |
| `no-unused-vars` | 294 | dead bindings — cleanup, low risk |
| `no-undef` | 12 | **all false positives of the probe** — every one is `katex` or `math`, which the real config declares as globals at [eslint.config.mjs:51-53](apps/quadrature-domains/eslint.config.mjs:51) |

Zero parse errors, so the config change is mechanically viable. This makes closing the hole a
**schedulable cleanup, not an emergency** — but it should be closed, because right now the largest
body of source in the repo has no static analysis at all.

#### V-4 — `qd-schwarz-skip-01` — test blocks convert solver failure into a silent PASS · **HIGH** · **VERIFIED**

[schwarz.test.js:1149-1152](apps/quadrature-domains/app/test/schwarz.test.js:1149) wraps its
assertions in `if (r.success) { … }`:

```js
const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 1 });
if (r.success) {
  …
  ok('Schwarz/unboundedLQD-polyPart h=1 c=1: builder + family tag', …);
  ok('Schwarz/unboundedLQD-polyPart h=1 c=1: phi.lqdBeta carried through', …);
```

If the solver regresses and `r.success` becomes false, **every assertion inside is skipped and the
suite reports success**. The block's own comment says it exists to guard the HANDOFF #26 regression
(where the Schwarz adapter silently dropped `phi.lqdBeta`) — so the guard disarms itself in exactly
the scenario it was written to catch.

Fix: assert `r.success` first, then unconditionally run the body.

#### V-5 — `corr-univalence-01` + `corr-param-body-02` — the `|a| ≤ √2` univalence bound is false, and it explains the parameter plane's shape · **HIGH** · **VERIFIED**

These arrived as two findings. They are **one defect with two symptoms**, and the maths checks out.

**The bound is wrong.** [family.ts:5](apps/correspondences/src/family.ts:5) reasons:

> "The area theorem (Σ n|bₙ|² = |a|²/2 ≤ 1) keeps φ_a univalent on {|z|>1} for |a| ≤ √2"

The arithmetic is right (`b₂ = a/2`, so `2·|a/2|² = |a|²/2 ≤ 1 ⟺ |a| ≤ √2`) but **the implication runs
backwards**. The area theorem is a *necessary* condition satisfied *by* univalent functions; it does
not *imply* univalence. The actual bound is immediate from the derivative:

$$\varphi_a'(z) = 1 - a/z^3 = 0 \iff |z| = |a|^{1/3}$$

Univalence on `{|z|>1}` requires no critical point there, i.e. `|a|^{1/3} ≤ 1`, i.e. **`|a| ≤ 1`**.
For `1 < |a| ≤ √2` a critical point sits *inside* the exterior domain, so φ_a is not even locally
injective — decisively not univalent. (The deltoid, `a = 1`, sits exactly on the true boundary.)

**It is shown to the user as "proven."** [main.ts:220](apps/correspondences/src/main.ts:220) and
[main.ts:237](apps/correspondences/src/main.ts:237) both render:

> `≈ exploratory — not a certified connectedness locus (φ_a proven univalent only for |a| ≤ √2).`

The `≈` caveat covers the *locus*; the parenthetical asserts the univalence bound as **proven**, and
it is false. [paramGpu.ts:69](apps/correspondences/src/paramGpu.ts:69) repeats it as the
justification for an exterior-branch shader guard — "univalent on {|z|>1} for the entire family
window" — so it is load-bearing, not decorative.

**And it explains the picture.** [family.ts:98](apps/correspondences/src/family.ts:98):

```ts
const next = schwarz.sigma(w);
if (!next) return maxIter;   // σ undefined ⇒ same sentinel as "never escaped"
```

`maxIter` is the *did-not-escape* return, i.e. **in the connectedness locus**. Past `|a| = 1` the
σ construction breaks (critical point in the exterior), `sigma` returns null, and every such
parameter is silently counted as a member. The rendered "connectedness body" is therefore the disk
`|a| ≤ 1` — an artifact of undefined-treated-as-bounded, not a computed locus.

**This is the most consequential correctness finding after V-1**, because the app's central visual
is showing an artifact while a caption asserts something "proven" that is false. Fix: correct the
bound to `|a| ≤ 1` in all three sites, and give `sigma`-undefined its own return value distinct from
"did not escape" so those parameters render as *unknown* rather than as members.

#### V-6 — `cd-render-02` — `"undetermined"` is collapsed into "connected" · **HIGH** · **VERIFIED**

[overlay.ts:67](apps/complex-dynamics/src/render/overlay.ts:67) declares four outcomes:

```ts
export type OrbitFate = "escaped" | "converged" | "periodic" | "undetermined";
```

[juliaProperties.ts:173-174](apps/complex-dynamics/src/render/juliaProperties.ts:173) then reduces
them to a boolean:

```ts
const escapes = info.fate === "escaped";
const connected = !escapes;
```

So **`"undetermined"` — the explicit "the iteration cap ran out and we do not know" state — becomes
`connected: true`.** An unresolved estimate is reported as a determination, and downstream
`paramClass` reads `"bounded"` from it. The type system is carrying the honest answer and the
boolean discards it.

#### V-7 — `cd-render-03` — `polynomialConnectivity` is documented "Rigorous" but is a 400-iteration escape test · **HIGH** · **VERIFIED**

[critical.ts:255-256](apps/complex-dynamics/src/render/critical.ts:255):

```ts
const CONN_ITERS = 400; // orbit length to decide a critical point's fate

/**
 * Rigorous connectivity of a polynomial filled Julia set, from the fate of every critical orbit
```

A critical orbit that stays bounded for 400 iterations is **not** proof of boundedness — it is an
estimate with a cap. The docstring's "Rigorous" is the exact word the project's labeling rule
reserves for `=`, and the finder notes the function is consumed as rigorous (it suppresses the
image-based fallback estimate when it returns non-null). Fix: either rename/redocument as an
estimate, or return an explicit "undetermined" for orbits that neither escape nor resolve.

### Reviewer-refuted findings

Recorded so they are not re-investigated.

- **The 12 `no-undef` hits in the QD lint probe** (see V-3) are probe artifacts, not defects.
  `math` and `katex` are declared globals at
  [eslint.config.mjs:51-53](apps/quadrature-domains/eslint.config.mjs:51).
- **QD's `@cas/exact` devDependency**, the apparent undeclared `@cas/expr` import, and `mathjs`
  as dead weight — all checked and correct; see § 0-6.

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

#### 0-7 — `README.md` test count was stale · LOW · documentation · ✅ FIXED

[README.md:35](README.md:35) claimed "**1550+ Vitest tests**". A full run measures **1820 tests
across 193 files** (exit 0). The old figure was not *wrong* — it carried a `+` — but it understated
the suite by ~17%. Updated to the measured number.

<!-- FINDINGS-LOG -->

---

## Fixes

> **These land in two separate pull requests, not in this one.** This document is the review
> record; the code changes it describes are reviewed on their own merits in
> [#154](https://github.com/ajgraven/complex-analysis-suite/pull/154) (the `@cas/core` defects) and
> [#155](https://github.com/ajgraven/complex-analysis-suite/pull/155) (the honest-labeling sweep).
> If you are reading this before those merge, treat the rows below as *proposed and gate-verified*
> rather than as already on `master`.

### Pass 1 — the two defects fixed inline during the review

| PR | Change | Guarded by |
| --- | --- | --- |
| [#154](https://github.com/ajgraven/complex-analysis-suite/pull/154) | Durand–Kerner withholds convergence on non-finite iterates (V-1) | new test, proven to fail against the old code |
| [#154](https://github.com/ajgraven/complex-analysis-suite/pull/154) | `addMulInto` honours its aliasing contract (V-2) | new test, proven to fail against the old code |

### Pass 2 — the honest-labeling sweep (Tier 1, step 1)

All seven mislabels, each with a regression test.

| PR | Finding | Change |
| --- | --- | --- |
| [#155](https://github.com/ajgraven/complex-analysis-suite/pull/155) | `corr-univalence-01` + `corr-param-body-02` | The `\|a\| ≤ √2` bound shown to users as **"proven"** is false — the area theorem is necessary, not sufficient. True bound `\|a\| ≤ 1` from `φ_a'(z) = 1 − a/z³`. Corrected in `family.ts`, both captions, `paramGpu.ts`, and `deltoid.ts`'s `exteriorRoot`. Captions now say to read `\|a\| > 1` as unclassified rather than as membership. |
| [#155](https://github.com/ajgraven/complex-analysis-suite/pull/155) | `cd-render-02` | `OrbitFate`'s explicit `"undetermined"` no longer collapses to `connected: true`; added `connectivityUndetermined` and the row hedges it. |
| [#155](https://github.com/ajgraven/complex-analysis-suite/pull/155) | `cd-render-03` | `critical.ts`'s "RIGOROUS connectivity" corrected — only `cantor` (all orbits escaped) is a determination; `connected`/`disconnected` rest on the 400-iteration cap and now render with `≈`. |
| [#155](https://github.com/ajgraven/complex-analysis-suite/pull/155) | `cd-shell-03` | `\|λ\| =` → `≈` on both paths. `holo` means "an analytic f′ exists", not "exact"; the analytic-vs-finite-difference distinction moved to a `(finite-diff)` suffix. `jp-lyapunov` had the same bug in reverse (bare number, no marker). |
| [#155](https://github.com/ajgraven/complex-analysis-suite/pull/155) | `qd-ui-algebra-badge-01` | `showQDSolution` no longer hardcodes `univalent: true`; the hand-off carries the verdict's rigor and only `'exact'` earns the ✓. Absent opts ⇒ **not** certified, so a future caller cannot inherit a certified badge. `qdValidityBadge` lifted to module scope for testing. |
| [#155](https://github.com/ajgraven/complex-analysis-suite/pull/155) | `qd-direct-verify-01` | `{ weight: 'log' }` is not a dispatch key — **no solver reads `opts.weight`** — so bounded log-weighted round-trips fell through to the classical catch-all and reported the wrong family's verdict as a pass. Now `{ lqd: true, w0 }`, matching the sibling handler. |

**A counterexample was computed, not asserted.** For `a = 1.2` (inside the old √2 claim) the distinct
exterior points `z = 1.052307+0.208604i` and `w = 1.02−0.2i` satisfy `φ_a(z) = φ_a(w)` to 2e-16 —
pinned as a golden in `familyUnivalence.test.ts`.

**One finding was deliberately *not* "fixed".** `family.ts:98`'s `if (!next) return maxIter` looks
like the σ-undefined bug, but its comment gives a sound reason: the orbit left Ω *inward*, which
genuinely is not an escape to ∞. The honest correction there is the labeling, not the bookkeeping.

### Still recommendations, not applied

V-3 (the lint hole — a 294-item backlog), V-4 (the disarmed test guard), and the Tier 2/3 items.
None qualify as "trivial and zero-risk".

---

## Prioritized report

### Tier 1 — fix now (mislabelled results: the project's one unacceptable bug class)

Every item here presents an estimate as a determination, which
[CLAUDE.md](../../CLAUDE.md)'s honest-labeling guardrail treats as the highest-severity defect
in the repo.

| # | Finding | Where | Status |
| --- | --- | --- | --- |
| 1 | **Durand–Kerner returns `converged: true` with all-NaN roots.** 7 of 8 call sites exposed. | `packages/core` | ✅ **FIXED** — PR [#154](https://github.com/ajgraven/complex-analysis-suite/pull/154) |
| 2 | **`φ_a` "proven univalent for \|a\| ≤ √2" is false** (true bound `\|a\| ≤ 1`), shown to users as *proven*, and load-bearing for a shader guard. | `apps/correspondences` | VERIFIED |
| 3 | **σ-undefined is counted as "in the connectedness locus"**, so the parameter plane's central body is an artifact. Same root cause as #2. | `apps/correspondences` | VERIFIED |
| 4 | **`"undetermined"` orbit fate collapses to `connected: true`.** | `apps/complex-dynamics` | VERIFIED |
| 5 | **`polynomialConnectivity` documented "Rigorous", is a 400-iteration escape test**, and suppresses the fallback estimate. | `apps/complex-dynamics` | VERIFIED |

Items 2–5 are all small, localized edits. #2 and #3 should ship together — they are one defect.

### Tier 2 — structural risks that let defects through undetected

| # | Finding | Impact | Status |
| --- | --- | --- | --- |
| 6 | **97 of QD's 98 production `.mjs` files have zero lint rules** — 56 k lines, no static analysis. Cost to close: 294 `no-unused-vars`, **no live bugs hidden**. | `apps/quadrature-domains` | VERIFIED |
| 7 | **Test blocks convert solver failure into a silent PASS** (`if (r.success) { …assertions… }`), disarming the HANDOFF #26 regression guard in exactly the case it was written for. | `apps/quadrature-domains` | VERIFIED |
| 8 | **`apps/launcher` is in no gate** (no lint/typecheck/test script) despite being the published root of the Pages site. `@cas/expr` + `@cas/gpu` have no `build` script — `pnpm -r run` skips missing scripts silently, so the holes are invisible in a green run. | workspace | VERIFIED |

### Tier 3 — performance, with measured numbers

| # | Finding | Measured | Status |
| --- | --- | --- | --- |
| 9 | **Both published apps ship one oversized eager chunk.** QD 1 326 KB (contains the entire ~15 k-line symbolic-algebra engine — `Buchberger`/`groebner` verified present in the bundle); CD 608 KB with **zero** dynamic imports. Both trip Vite's 500 KB warning; neither configures `manualChunks`. Correspondences, the one app with `rollupOptions`, is 76 KB total. | real `pnpm build` | VERIFIED |
| 10 | **CI runs the full gate 3–4× per change** (push + PR triggers don't share a concurrency group; `deploy-pages.yml` re-runs it on master) and **no job caches the pnpm store**. | read both workflows | VERIFIED |

### Tier 4 — the remaining findings, now fully adjudicated

**The verifier stage was re-run to completion** (10 scope verifiers, 0 errors). Every one of the
105 outstanding findings now carries a verdict, joined into
[`RAW_FINDINGS_2026-07.md`](RAW_FINDINGS_2026-07.md) alongside the original evidence.

| | Count |
| --- | ---: |
| **confirmed** | 84 |
| **overstated** (real, but narrower than claimed) | 28 |
| **refuted** | 4 |
| **surviving** | **112** — 12 high, 43 medium, 57 low |

**Severity moved in one direction only: 26 revisions, all downward, none upward.** That asymmetry
is itself the useful signal — the original sweep was systematically over-severe, which is exactly
the failure mode an adversarial pass exists to correct. Read alongside the 4 refutations, it says
the finder agents were reliable about *locating* things and unreliable about *grading* them.

#### The four refutations are worth reading

They are the strongest evidence the verification was real rather than ceremonial:

- **`qd-paintfield-01`** (was HIGH) — "allocates a 3-element RGB array per pixel." The quoted code
  is accurate, but the verifier *benchmarked it*: the tuple never escapes, so V8 scalar-replaces
  it. At 768² × 60 repaints — the exact scenario claimed to produce ~1.1 GB of nursery traffic —
  `node --trace-gc` showed **zero scavenges**, and the proposed out-parameter fix measured
  10.57 vs 10.72 ms/paint (1.4%, within noise). The reviewer missed escape analysis.
- **`corr-mating-render-01`** — "no rAF coalescing on pointermove." Browsers already coalesce
  pointermove to the frame rate and expose the raw stream only via `getCoalescedEvents()`, which
  this code does not call. There is no burst to coalesce.
- **`corr-dk-null-dead-09`** — "three unreachable null-guards." `makeDurandKerner` is *declared*
  `DurandKernerResult<C> | null`, and Correspondences is `strict: true`. Deleting the guards is a
  compile error, not a cleanup.
- **`bt-unused-exports-11`** — "two `exports` subpaths have no consumer." Both packages export
  one subpath per module by convention (11 modules ↔ 11 entries in `@cas/expr`); the maps are not
  curated by demand, and both packages are `private: true` with no external contract.

#### The 12 surviving HIGH findings

> **4 of these are now fixed** in [#158](https://github.com/ajgraven/complex-analysis-suite/pull/158):
> `qd-polyh-01`, `qd-schwarz-skip-01`, `cd-shell-02` (the three trivial-effort ones) and
> `expr-rational-01`. **8 remain open**, listed unchanged below.
>
> Three notes worth carrying forward, because each corrected something the finding got wrong or
> under-stated:
>
> - **`qd-schwarz-skip-01` was right at seven, and it is easy to miscount as twelve.** There are
>   twelve `if (r.success)` blocks and none has an `else` — but five are *preceded* by an
>   `ok(…, r.success, …)` assertion, which is a correct pattern. Check for the preceding assertion,
>   not a trailing `else`.
> - **`expr-rational-01` was two stacked defects, not one.** `pPow` was O(k²) (~7.4 min at k=40 000),
>   *and* its dominant caller `escapeIsMeaningless` builds the whole polynomial to read two degrees,
>   on every view change. Fixed at the algorithm (zero-skipping multiply + binary exponentiation,
>   z^40000 → 14 ms) rather than by capping the exponent. A degree-only fast path for the caller was
>   considered and **rejected as unsound** — leading coefficients cancel under `+`/`−`, so degree
>   arithmetic gives only an upper bound.
> - **Some things at that scale are inherently expensive.** With the exterior-map or connectivity
>   panels open, `critical.ts` runs Durand–Kerner on the derivative, so `z^40000+c` means locating
>   39 999 roots. No representation change fixes that; it is real computation.

| id | Where | What |
| --- | --- | --- |
| `cd-shell-01` | `main.ts:2468` | z²+c-only overlays gated on `perturbationEligible` (true for z^d+c, d ≤ 8) — the shipped **cubic** and **biomorph** presets unlock nine quadratic-family overlays and draw them as fact. The correct predicate `monicDegree === 2` is already used correctly four other places in the same file. |
| `cd-shell-02` | `main.ts:3748` | "Self-similar zoom" never recentres — the stale `_pcdd` double-double centre is restored *after* `applyAllControls`, clobbering the requested one. Triggered by any pan (a non-zero low limb) or zoom > 1e3. |
| `cd-shell-03` | `main.ts:1935` | Julia panel prints `\|λ\| =` for a numerically-located cycle multiplier. `holo` is an "f′ exists" flag, not an exactness flag. Every sibling row is hedged (`≈`, `≤`, `(exact)`); this one is not, and `copyJuliaProperties` exports the `=` verbatim. |
| `cd-render-01` | `glPlot.ts:2321` | `setParamA` never rebuilds — perturbation renders with stale `a`; the image freezes while the slider moves. |
| `cd-dup-01` | `schwarz-cpu-worker.mjs:82` | Worker `error` listener is a bare `console.error`: `_inflight` never cleared, no watchdog anywhere in `schwarz-render`/`schwarz-ui`. The tab sticks on "Pass 1/3 (coarse)…" forever. Three sibling wrappers have the fix, with the reason written down. |
| `cd-dup-02` | `sphere-webgl.mjs:313` | `setPhi` clone dropped capacity-error reporting — on rejection the sphere keeps rendering the **previous** domain under the **new** domain's caption. |
| `qd-direct-verify-01` | `direct-verify.mjs:95` | Direct-tab "Verify" for bounded **log-weighted** maps dispatches to the **classical** solver and reports the wrong family's verdict as a pass. |
| `qd-ui-algebra-badge-01` | `ui.mjs:1621` | `showQDSolution` hardcodes `univalent:true, identityOK:true` — an algebra-tab φ whose verdict was `≈`/`≥` renders in the QD tab as an unqualified "✓ Valid quadrature domain". |
| `qd-polyh-01` | `parse-h.mjs:410` | Polynomial-part mode list disagrees with the UI's, so five shipped PQD-unbounded presets cannot be re-parsed — their share links silently fail to restore. |
| `bt-pwa-manifest-02` | `vite.config.mjs:33` | `manifest: false` + a plain `<link rel="manifest">` ⇒ Vite hashes it into `assets/`, so `scope`/`start_url`/icon URLs all resolve one directory too deep. Verified against a fresh build by md5: contents are **not** rewritten. QD is not installable. |
| `corr-density-01` | `correspondenceRender.ts:136` | `densityToImage` recomputes the static deltoid K-mask (256-gon ray cast) for **every background pixel on all 22 progressive chunks**. |
| `expr-rational-01` | `rational.ts:116` | `fToRational` raises polynomials by repeated multiply with no exponent cap — `z^40000+c` freezes the CD tab for minutes. |

Note that three of these (`cd-shell-03`, `qd-ui-algebra-badge-01`, `qd-direct-verify-01`) are
**further honest-labeling violations**, joining the four already in Tier 1.

### What is healthy

Worth stating, because a defect list is not a portrait. The finders' scope summaries independently
described the shell as "unusually disciplined for a 4.3 k-line entry point": listeners wired once,
rAF guarded, `localStorage` uniformly try-caught, untrusted permalink payloads validated and capped,
MediaRecorder tracks and probe contexts explicitly released. No listener, RAF, worker, or
WebGL-context leak was found in that scope. Lint, typecheck, and the full production build are green
at `c2f5777`. And the two `@cas/core` defects fixed here were each *one instance of a bug class the
codebase had already identified and guarded elsewhere* — the coincident-root convergence guard and
`mulInto`'s aliasing temp both exist. The engineering instincts are right; these were misses, not
absences.

### Suggested sequencing

1. **Tier 1 items 2–5** — small, localized, and they are the ones that make the apps *say false
   things*. One PR each, or one PR for the linked pair #2/#3.
2. **Tier 2 item 7** then **item 6** — restore the disarmed test guard first (cheap), then close the
   lint hole and burn down the 294-item backlog incrementally.
3. **Tier 3 item 9** — code-split QD's algebra workspace and CD's KaTeX/tour/GIF. Highest
   user-visible win per line changed; the mechanism is already proven in-repo.
4. **Re-run the killed verifier stage** over Tier 4 before acting on any of it.
