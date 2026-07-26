# Raw review findings — recovered agent output

> **This file is the unedited output of the review sweep**, recovered from the workflow
> journal after the run hit a usage limit part-way through. It is committed verbatim so
> the work survives any future interruption. **It is raw material, not conclusions** —
> the adjudicated, verified, prioritized findings live in
> [`CODEBASE_REVIEW_2026-07.md`](CODEBASE_REVIEW_2026-07.md).
>
> **Verification status:** 11 of 12 finder scopes completed. The adversarial-verifier
> stage was cut short by the usage limit — only the `ux-a11y` scope was machine-verified.
> Findings below are therefore marked `UNVERIFIED` unless a verdict is shown. Treat an
> UNVERIFIED finding as a *lead with cited evidence*, not an established defect.

**124 findings** across 11 scopes — 1 critical, 25 high, 59 medium, 39 low.

The `qd-algebra` scope did not complete (killed by the limit). It was the deliberately
light re-pass over already-reviewed code, so it is the least costly scope to have lost.

---

## Scope: build-ci — build, tooling, config, CI, dependencies

**Reviewer's summary of what was read and overall impression:**

I read the root package.json, pnpm-workspace.yaml, .npmrc, .nvmrc, .gitignore, .prettierignore/.prettierrc.json, tsconfig.base.json and all 9 package/app tsconfigs, the root eslint.config.js plus all 8 member ESLint configs, vitest.config.ts, vitest.workspace.ts, all 5 vite/vitest app configs, packages/gpu/vitest.browser.config.ts, both GitHub workflows, scripts/bootstrap-subtrees.sh, the importers section of pnpm-lock.yaml, and every workspace member's package.json. I also verified behaviour rather than reading it: ran `eslint --print-config` and `--stdin` probes to prove which files actually get rules, ran the root `eslint .` with `--format json` to count what it traverses, enumerated every `@cas/*` subpath specifier against the declared `exports` maps, and inspected the checked-out `dist/` trees byte-for-byte. Overall health is good — the two claims I was asked to verify both hold (all four apps set `base: "./"`, confirmed in both config and built HTML; `apps/correspondences` is built but deliberately absent from the `_site` assemble step), the deploy gate genuinely runs lint+typecheck+test+build, the `browser` job is wired and cannot silently pass (no `--passWithNoTests`), the QD headless suite really is gated via the wrapper spec's exit-code check, no build outputs are tracked, all package `exports` subpaths resolve to real files, and there are no dependency-direction violations. The boundary ESLint rule is also stronger than it looks — gitignore-style `group` matching catches relative `../../apps/...` paths, not just bare specifiers. The real problems are concentrated in two places: QD's ESLint config was never updated for the Phase-2 ESM flip and now applies zero rules to 97 of 98 production `.mjs` files, and QD's PWA manifest is silently broken in the shipped build by Vite asset hashing (CD gets this right — a copy-paste divergence).

### `bt-lint-mjs-01` — QD's ESLint config applies ZERO rules to 97 of 98 .mjs files — the entire 56k-line production source is unlinted

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | medium | `apps/quadrature-domains/eslint.config.mjs:96` | `UNVERIFIED` |

**Evidence**

Every rule-bearing block in this config targets filenames that the Phase-2 ESM flip renamed to `.mjs` or deleted:

  line 82:  files: ['app/sw.js'],                       // app/sw.js NO LONGER EXISTS (retired for vite-plugin-pwa)
  line 96:  files: ['app/**/*.js'],
  line 97:  ignores: ['app/sw.js', 'app/node-test.js', 'app/qd.mjs'],
  line 132: files: ['app/complex.js', 'app/taylor.js', 'app/schwarz/schwarz-common.js', 'app/ui.js'],  // ALL FOUR are now .mjs
  line 149: files: ['app/node-test.js', 'app/bench.js'],  // app/bench.js NO LONGER EXISTS

`find app -name '*.mjs'` returns 98 files / 56,259 lines; `find app -name '*.js'` returns 28 files / 12,396 lines and EVERY ONE of them is a test (app/node-test.js + app/test/*.js). Only `app/qd.mjs` (line 137) has a rule block, so 97 .mjs files match no `files` pattern at all.

Proven, not inferred. `eslint --print-config app/main.mjs` returns:
  { "linterOptions": {...}, "rules": {}, ... }

And an identical-content stdin probe:
  content: `o = { rigor: "=", rigor: "~=" }; ... undefinedGlobalThing ... if (NaN === NaN)`
  as `app/algebra/algebra-store.js`  -> 4 errors (no-dupe-keys, no-undef, no-self-compare, use-isnan), exit 1
  as `app/algebra/algebra-store.mjs` -> 0 problems, exit 0

Nothing else covers the gap: apps/quadrature-domains/tsconfig.json sets `"checkJs": false`, so TypeScript puts the .mjs files in the program but never checks them, and the root eslint.config.js contributes only `no-restricted-imports`.

**Failure scenario**

A developer editing `apps/quadrature-domains/app/algebra/algebra-store.mjs` writes a verdict object literal with a duplicated key, e.g. `{ label: '≈', rigor: 'estimate', ..., rigor: 'certified' }`. JavaScript silently keeps the LAST value, so the verdict is stored as certified. `no-dupe-keys` — which this very config lists under its "Correctness (we want these to fire)" block — would have caught it in a `.js` file, but fires on nothing in `.mjs`. `pnpm lint` exits 0, `pnpm typecheck` exits 0 (checkJs:false), and the only remaining defence is whether some unit test happens to assert that exact field. The same hole silently accepts `no-undef` typos (`store.conjNameOf` vs a misspelling — precisely the class of bug that shipped as the #135 elimination-lens defect), `use-isnan`, `valid-typeof`, and `no-unreachable` across all of app/algebra, app/schwarz, app/solvers, app/param-slice, and every worker entry.

**Proposed fix**

Retarget the config at the post-flip file layout. Change the main block (line 96) to `files: ['app/**/*.{js,mjs}']` with `languageOptions.sourceType: 'module'` for the `.mjs` half — cleanest as two blocks: keep the existing `sourceType: 'script'` block narrowed to `files: ['app/test/**/*.js', 'app/node-test.js']`, and add a new block `files: ['app/**/*.mjs']` with `sourceType: 'module'`, the same rule set, and `globals: { ...browserGlobalsClean, ...QD_GLOBALS }`. Delete the now-dead blocks for `app/sw.js` (line 82) and `app/bench.js` (line 149), and update the `no-redeclare: off` override (line 132) to the `.mjs` names (`app/complex.mjs`, `app/taylor.mjs`, `app/schwarz/schwarz-common.mjs`, `app/ui.mjs`). Expect a first-run backlog; land it as `warn` for the noisier rules and `error` for no-dupe-keys/no-undef/use-isnan immediately.

### `bt-pwa-manifest-02` — QD's shipped PWA manifest has broken scope/start_url/icon URLs — Vite hashes it into assets/, so the app is not installable

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/quadrature-domains/vite.config.mjs:33` | `UNVERIFIED` |

**Evidence**

The config opts out of vite-plugin-pwa's generated manifest and relies on the hand-written one linked from HTML:

  vite.config.mjs:15-16  // Uses the existing app/manifest.webmanifest (linked in index.html), so
  vite.config.mjs:33     manifest: false,
  app/index.html:10      <link rel="manifest" href="manifest.webmanifest">

But Vite treats `<link rel="manifest">` as a hashable asset. The checked-out build shows the relocation:

  dist/index.html:  <link rel="manifest" href="./assets/manifest-DGRKEIyY.webmanifest">
  dist/assets/      manifest-DGRKEIyY.webmanifest, icon-Cvb3xz71.svg   (no manifest.webmanifest or icon.svg at dist root)

Vite does NOT rewrite the manifest's CONTENTS — `dist/assets/manifest-DGRKEIyY.webmanifest` is byte-identical to the source and still says:

  "start_url": "./index.html",
  "scope": "./",
  "icons": [ { "src": "icon.svg", ... }, { "src": "icon.svg", ... } ]

Per the Web App Manifest spec these are resolved against the MANIFEST's URL, not the document's. Complex-Dynamics does not have this bug because it uses VitePWA's `manifest: {...}` generator (vite.config.ts:26-49), which emits `dist/manifest.webmanifest` at the dist ROOT alongside a real `dist/images/icon.svg` — verified present in apps/complex-dynamics/dist.

**Failure scenario**

A user opens https://ajgraven.github.io/complex-analysis-suite/quadrature-domains/. The manifest loads from /quadrature-domains/assets/manifest-DGRKEIyY.webmanifest, so `"scope": "./"` resolves to /quadrature-domains/assets/. The document at /quadrature-domains/ is outside that scope, so Chrome discards the manifest entirely ("Page is not in the manifest's scope") — no install prompt, no standalone display mode, no app name/theme_color. Even if scope were fixed, `"src": "icon.svg"` resolves to /quadrature-domains/assets/icon.svg (404 — the real file is icon-Cvb3xz71.svg) and `"start_url": "./index.html"` resolves to /quadrature-domains/assets/index.html (404). QD advertises itself as an installable PWA and is not one; the regression was introduced by the Phase-2 Vite flip, since pre-Vite the manifest sat next to index.html where every relative URL was correct.

**Proposed fix**

Two clean options. (a) Match CD: drop `manifest: false` and move the manifest's fields into VitePWA's `manifest: {...}` option, deleting `app/manifest.webmanifest` and the `<link rel="manifest">` from app/index.html (the plugin injects its own). (b) Keep the hand-written file but stop Vite hashing it: create `apps/quadrature-domains/public/` (or set `publicDir`) containing `manifest.webmanifest` + `icon.svg`, which Vite copies verbatim to the dist root, leaving all relative URLs valid. Either way, add a build assertion — a Vitest spec that reads `dist/index.html`, follows the manifest href, and asserts `scope`/`start_url`/`icons[].src` resolve to files that exist in dist — so this cannot silently regress again.

### `bt-lint-worktrees-03` — Root `eslint .` lints .claude/worktrees/** — 47% of files linted are other branches' code, so the local gate can fail on code not in the working tree

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | trivial | `eslint.config.js:36` | `UNVERIFIED` |

**Evidence**

The root config's ignore list omits the Claude Code worktree directory:

    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vite/**",
      "**/coverage/**",
    ],

ESLint 9 flat config no longer ignores dot-directories by default, and `.claude/worktrees/` is excluded only via `.git/info/exclude:7` (a local, untracked mechanism ESLint never consults). Measured by running the actual gate:

  $ eslint . --format json  ->  total files linted: 886
                                under .claude/: 415   (46.8%)
  e.g. .claude/worktrees/bold-hopper-697a2a/packages/core/src/algebra.ts

`git worktree list` confirms these are checkouts of other commits (one is at a242f73, detached). Six worktree directories are present.

**Failure scenario**

A developer on master runs `pnpm lint`. A stale worktree at `.claude/worktrees/brave-euler-dc4009` contains a mid-refactor file that imports `../../apps/complex-dynamics/src/main` — the boundary rule fires and `pnpm lint` exits 1, reporting an error in a file the developer's branch does not contain and cannot fix by editing their own tree. CI is green (a fresh checkout has no worktrees), so the local gate and the CI gate disagree, and the only way forward is to guess that the error is phantom. Separately, ~47% of every local lint run is wasted work, and the per-worktree `node_modules` symlinks make this directory the one place the guidance says never to delete.

**Proposed fix**

Add `"**/.claude/**"` (or at minimum `"**/.claude/worktrees/**"`) to the `ignores` array in eslint.config.js:36. Also add `.claude/worktrees/` to the tracked `.gitignore` rather than leaving it only in the untracked `.git/info/exclude`, so every clone gets the same behaviour, and mirror the entry into `.prettierignore`.

### `bt-precache-fonts-04` — Both PWAs precache KaTeX .ttf and .woff — 798 KB of never-fetched font bytes per app, 1.6 MB across the deployed site

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | trivial | `apps/quadrature-domains/vite.config.mjs:37` | `UNVERIFIED` |

**Evidence**

Both apps' Workbox glob patterns pull in all three font formats KaTeX's CSS declares:

  apps/quadrature-domains/vite.config.mjs:37
      globPatterns: ["**/*.{js,css,html,svg,ttf,woff,woff2,webmanifest}"],
  apps/complex-dynamics/vite.config.ts:20
      globPatterns: ["**/*.{js,css,html,svg,ico,png,ttf,woff,woff2}"],

Measured against the checked-out builds — the numbers are identical in both apps because both self-host the same KaTeX font set:

  ttf:   20 files, 502 KB
  woff:  20 files, 296 KB
  woff2: 19 files, 250 KB

KaTeX's @font-face rules list woff2 first, and every browser that supports service workers and WebGL2 supports woff2 — so the 798 KB of ttf+woff is downloaded by the service worker and never requested by the page. QD's generated sw.js has 70 precache entries and QD's total dist is 3.8 MB, meaning dead fonts are ~21% of QD's precache and ~38% of CD's 2.1 MB.

**Failure scenario**

A user's first visit to the combined Pages site and then to both apps triggers two service-worker installs. Each downloads its full precache before reporting ready: QD pulls 3.8 MB including 798 KB of ttf/woff that no request will ever hit, CD pulls 2.1 MB including another 798 KB. That is 1.6 MB of pure waste on first load, and the whole precache is re-fetched on every deploy that changes the content hashes (which a KaTeX bump or any font-affecting change does). On a throttled mobile connection this is several extra seconds of install time and ~1.6 MB of the user's data allowance per deploy.

**Proposed fix**

Drop `ttf` and `woff` from both `globPatterns` (keep `woff2`). The files stay in dist — Vite still emits them because KaTeX's CSS references them, so a hypothetical woff2-less browser degrades to a network fetch rather than breaking. Same one-token edit in apps/quadrature-domains/vite.config.mjs:37 and apps/complex-dynamics/vite.config.ts:20.

### `bt-precache-cap-05` — QD's Workbox config omits maximumFileSizeToCacheInBytes; its 1.36 MB main chunk is 65% of the 2 MiB default, and crossing it drops the bundle from precache with a green build

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | trivial | `apps/quadrature-domains/vite.config.mjs:34` | `UNVERIFIED` |

**Evidence**

QD's workbox block sets only globPatterns:

      workbox: {
        // Bundled JS/CSS/fonts (incl. self-hosted mathjs + KaTeX + KaTeX fonts) are
        // precached — the app is fully offline-capable with no third-party runtime cache.
        globPatterns: ["**/*.{js,css,html,svg,ttf,woff,woff2,webmanifest}"],
      },

Workbox's `maximumFileSizeToCacheInBytes` defaults to 2 MiB (2,097,152 bytes) and silently EXCLUDES any larger file from the precache manifest, emitting only a build-log warning — the build still exits 0. Complex-Dynamics hit this and guarded against it explicitly:

  apps/complex-dynamics/vite.config.ts:21-22
        // The WebGL engine + KaTeX make the main chunk large; precache it anyway.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

QD's current main chunk is larger than CD's and has no such guard:

  $ stat -c '%s' apps/quadrature-domains/dist/assets/index-C6P5SEJC.js
    1358452        # 64.8% of the 2 MiB cap, 716 KiB of headroom
  $ grep 'index-C6P5SEJC' dist/sw.js  ->  url:"assets/index-C6P5SEJC.js"   (currently precached)

The comment above globPatterns asserts "the app is fully offline-capable", which is exactly the property the default cap will silently revoke.

**Failure scenario**

Someone lands a feature that adds ~720 KB to QD's main chunk — plausible given the algebra roadmap (the exact ℚ(i) kernel, factorizer, and orchestrator all live in it, and the chunk already grew past CD's). `pnpm build` succeeds, `pnpm lint`/`typecheck`/`test` succeed, deploy-pages publishes, and CI is entirely green because Workbox only logs `assets/index-XXXX.js is 2.1 MB, and won't be precached`. The deployed service worker now precaches index.html, the CSS, the fonts and the workers but NOT the main bundle. Users who load the app offline (or on a flaky connection after the SW claims control) get the boot overlay from the cached HTML and then a failed fetch for the only script that matters — a blank app with no error, and no signal anywhere in CI that anything changed.

**Proposed fix**

Add `maximumFileSizeToCacheInBytes: 4 * 1024 * 1024` to the workbox block in apps/quadrature-domains/vite.config.mjs (matching CD's value and rationale). Better still, make the silent-drop case loud: after `vite build`, assert in a test that every `dist/assets/*.js` file appears in the generated `dist/sw.js` precache manifest — that turns any future cap breach (or glob typo) into a red build in both apps.

### `bt-phantom-deps-06` — quadrature-domains declares neither `typescript` nor `vitest` yet its typecheck script and 89 test files require them — both resolve only by walking up to the workspace root

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | maintainability | trivial | `apps/quadrature-domains/package.json:10` | `UNVERIFIED` |

**Evidence**

The package declares a TypeScript script and ships TypeScript tests, but neither tool:

  package.json:10   "typecheck": "tsc -p tsconfig.json",
  devDependencies:  eslint, globals, jsdom, vite, vite-plugin-pwa, @cas/exact   (no typescript, no vitest)

  $ ls apps/quadrature-domains/node_modules/typescript  ->  No such file or directory
  $ ls apps/quadrature-domains/node_modules/vitest      ->  No such file or directory
  $ ls apps/quadrature-domains/node_modules/.bin        ->  browserslist eslint katex mathjs rollup terser vite   (no tsc, no vitest)

  $ grep -rl "from 'vitest'|from \"vitest\"" apps/quadrature-domains/vitest | wc -l  ->  89

Both work today only because Node/pnpm walk up to the workspace-root `node_modules`, which happens to contain `typescript` (there for typescript-eslint's peer and the packages' builds) and `vitest`. This is precisely the phantom-dependency pattern .npmrc:1-3 claims the layout prevents: "We keep pnpm's strict, non-hoisted node_modules (ADR-0004): it refuses phantom/undeclared dependencies, which actively enforces the dependency-layering rule." That claim holds for module imports inside packages but not for the root's ancestor `.bin` and `node_modules` walk-up.

**Failure scenario**

Someone tidies the root devDependencies — `typescript` looks redundant now that every package declares its own, so it is removed. `pnpm install` succeeds, the packages still build (each has its own typescript), `pnpm lint` still passes, but `pnpm typecheck` now fails at the LAST step with `sh: tsc: command not found` from apps/quadrature-domains, in a package whose package.json gives no hint it ever needed TypeScript. The vitest case is worse: removing the root `vitest` devDependency leaves 89 QD spec files that cannot resolve their own test framework, and the root `vitest run` that would have reported it is itself gone.

**Proposed fix**

Add `"typescript": "^5.7.2"` and `"vitest": "^2.1.4"` to apps/quadrature-domains/package.json devDependencies (matching the versions the other members declare — see the version-skew finding). This is documentation as much as installation: pnpm will link the same resolved 5.9.3 / 2.1.9 instances the lockfile already pins, so nothing changes about what is installed, but the package now states its real toolchain and survives root-level cleanup.

### `bt-version-skew-07` — Two KaTeX majors ship in one deployed site (QD pins 0.16.47, CD floats ^0.17.0), plus four devDependency ranges drifting across members

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | small | `apps/quadrature-domains/package.json:19` | `UNVERIFIED` |

**Evidence**

The two published apps depend on different KaTeX majors, and the lockfile installs both:

  apps/quadrature-domains/package.json:19   "katex": "0.16.47",     <- exact pin, no caret
  apps/complex-dynamics/package.json:37     "katex": "^0.17.0"

  $ grep -n '^  katex@' pnpm-lock.yaml
    2256:  katex@0.16.47:
    2260:  katex@0.17.0:

Both apps self-host and precache the full font set (verified identical: 20 ttf + 20 woff + 19 woff2, 1,048 KB each), so the combined Pages site ships two complete, mutually incompatible KaTeX payloads under different content hashes — no cross-app HTTP cache reuse is possible.

Secondary drift across the same lockfile-resolved versions: eslint is declared `^9.13.0` (CD) / `^9.17.0` (root, corr, all packages) / `^9.39.4` (QD); typescript `^5.6.3` (CD) vs `^5.7.2` (everyone else); globals `^15.11.0` / `^15.14.0` / `^15.15.0`; prettier `^3.3.3` (CD) vs `^3.4.2` (root). All currently collapse to one resolved version each (9.39.4 / 5.9.3 / 15.15.0 / 3.9.4), so this is declaration drift rather than duplicate installs — unlike katex.

**Failure scenario**

A KaTeX rendering or CSS fix lands via `pnpm update katex` in Complex-Dynamics and moves it to 0.17.x. Quadrature-Domains does not move at all — its exact pin `0.16.47` makes it invisible to any range-based update — so the same equation renders differently in the two apps of one suite, and a user who has visited both has downloaded ~2 MB of KaTeX assets. Because the pin is exact, the divergence is silent: no lockfile churn, no CI signal, and nothing in the suite tests cross-app typesetting consistency.

**Proposed fix**

Align on one KaTeX version across both apps and use the same range style (`^0.17.0` in both, or an exact pin in both with a single note explaining why). If the exact pin exists for a reason, record it in a comment or ADR — as written it reads as an accident of the pre-monorepo QD repo. Separately, normalise the eslint / typescript / globals / prettier ranges to the values the packages already agree on (`^9.17.0`, `^5.7.2`, `^15.14.0`, `^3.4.2`) so a future `pnpm update` moves every member together.

### `bt-ci-nocache-08` — No pnpm store cache in either workflow — every push to master performs three cold `pnpm install --frozen-lockfile` runs

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | performance | trivial | `.github/workflows/ci.yml:33` | `UNVERIFIED` |

**Evidence**

All three jobs across the two workflows set up Node with no dependency cache and then install cold:

  ci.yml:33-39 (build job)
      - uses: actions/setup-node@v4
        with:
          node-version: 22          # <- no `cache: pnpm`, no cache-dependency-path
      - run: corepack enable
      - name: Install (frozen lockfile)
        run: pnpm install --frozen-lockfile

  ci.yml:61-68 (browser job)   — same pattern
  deploy-pages.yml:35-42       — same pattern

The only caching anywhere is for the Playwright browser binary (ci.yml:70-74), which explicitly keys on the lockfile — so the pattern is understood, just not applied to the dependency store itself. pnpm-lock.yaml is 221 KB and resolves the full Vite + Vitest + Workbox + typescript-eslint + Playwright tree.

**Failure scenario**

Every push to master runs ci.yml `build`, ci.yml `browser`, and deploy-pages.yml `build` — three full cold installs of the same lockfile, in parallel, on three runners. Each re-downloads and re-extracts the entire dependency tree from the registry (tens of MB, hundreds of packages) before any useful work starts. That is roughly 30-60s of avoidable wall-clock on each of the three jobs per push, paid on every commit, and it makes the deploy path slower to reach the live site than it needs to be.

**Proposed fix**

Add pnpm store caching to all three jobs. Because `corepack enable` currently runs AFTER setup-node, `cache: 'pnpm'` on actions/setup-node would fail (it shells out to `pnpm store path`); the simplest fix is to move `- run: corepack enable` ABOVE the setup-node step and then add `cache: 'pnpm'` + `cache-dependency-path: pnpm-lock.yaml` to the `with:` block. Alternatively use `pnpm/action-setup@v4` before setup-node. Either way keep the existing `--frozen-lockfile`.

### `bt-boundary-dynamic-09` — The dependency-boundary rule does not cover dynamic `import()`, so a cross-app lazy import passes lint

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | small | `eslint.config.js:62` | `UNVERIFIED` |

**Evidence**

The boundary guardrail is a single `no-restricted-imports` rule:

  eslint.config.js:61-63
    rules: {
      "no-restricted-imports": ["error", { patterns: noCrossAppImports }],
    },

I probed it with `--stdin --stdin-filename packages/core/src/probe3.ts` on a file containing BOTH forms:

  line 1: import s from "../../apps/complex-dynamics/src/a";               -> CAUGHT (no-restricted-imports)
  line 2: const m = await import("../../apps/complex-dynamics/src/main");  -> NOT caught

  result: 1 problem (1 error), exit 1  — only line 1 reported, and the file parsed cleanly.

(The good news, also verified: the `group` patterns use gitignore-style matching, so relative paths like `../../apps/complex-dynamics/...` and `../../../apps/quadrature-domains/app/main.mjs` ARE caught for static imports — the rule is stronger than a naive reading of `complex-dynamics/*` suggests. The gap is specifically the dynamic form.) Dynamic import is not hypothetical in this codebase: apps/quadrature-domains/app/vendor-globals.mjs already uses `import('mathjs')` for code-splitting, so it is an idiom developers here reach for.

**Failure scenario**

Someone lazy-loads a heavy view across the boundary — e.g. correspondences code-splits a shared panel with `const m = await import('../../complex-dynamics/src/render/legend')` to avoid a static dependency. `pnpm lint` passes, `pnpm typecheck` passes, and Vite happily bundles it because the path resolves on disk. The one-dependency-direction invariant (ARCHITECTURE.md §4, CLAUDE.md guardrail 3) is now violated in the shipped bundle with no CI signal, and it will not be noticed until someone tries to build or move an app independently.

**Proposed fix**

Two layers. Cheap: add `"no-restricted-modules"`-style coverage by pairing the rule with `import/no-restricted-paths` (eslint-plugin-import) or a small `no-restricted-syntax` entry matching `ImportExpression[source.value=/(complex-dynamics|quadrature-domains|correspondences|launcher)/]`. Durable: wire the dependency-cruiser check that MIGRATION.md already lists under "Ongoing" — it inspects the resolved module graph, so it catches static imports, dynamic imports, and `new URL(..., import.meta.url)` worker references uniformly, and it also gives you the cycle detection the root config comment says is out of scope.

### `bt-dead-testhtml-10` — apps/quadrature-domains/app/test.html is dead — it sits in the Vite root but is not a build input and is referenced nowhere

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/quadrature-domains/app/test.html:1` | `UNVERIFIED` |

**Evidence**

The file is a pre-Vite in-browser test page:

  app/test.html:5   <title>QD Solver — Backend Tests</title>
  app/test.html:19  <h1>Quadrature Domain Solver — Backend Tests</h1>

It lives inside the Vite `root` (vite.config.mjs:25 `root: resolve(here, "app")`) but the config sets no `build.rollupOptions.input`, so Vite builds only `app/index.html` — confirmed: `ls apps/quadrature-domains/dist` yields only `assets/ index.html registerSW.js sw.js workbox-*.js`, no test.html. And nothing points at it:

  $ grep -rn "test\.html" apps/quadrature-domains --include=*.mjs --include=*.js --include=*.html --include=*.json --include=*.ts
    (no matches outside node_modules)

The QD test story moved on twice since: `app/node-test.js` (28 files, ~2200 assertions) is the headless runner, and the DOM tests moved to Vitest+jsdom (app/node-test.js:47-49 documents this migration). Note it is also invisible to the lint gate for the same reason as the .mjs files — QD's eslint config ignores `**/*.html` (eslint.config.mjs:78).

**Failure scenario**

A contributor exploring the app opens app/test.html expecting a working in-browser test harness, since it sits next to index.html in the Vite root. It cannot work: the page predates the ESM flip and the classic `<script>` / asset-manifest loader it depends on was retired (vite.config.mjs:8 documents the removal), and it is never built so it cannot even be served from `vite preview`. The cost is wasted investigation and a misleading second testing entry point in a repo that has deliberately consolidated on one runner.

**Proposed fix**

Delete apps/quadrature-domains/app/test.html. If an in-browser smoke page is still wanted, the honest replacement is a `build.rollupOptions.input` entry (the pattern apps/correspondences/vite.config.ts:8-12 already uses for mating.html) pointing at a page that actually loads main.mjs — but given node-test.js plus 89 Vitest specs, deleting is the right call.

### `bt-unused-exports-11` — Two package `exports` subpaths have no consumer (@cas/expr "./latex", @cas/gpu "./dual-backend")

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `packages/expr/package.json:20` | `UNVERIFIED` |

**Evidence**

I enumerated every `@cas/*` specifier used anywhere in apps/ and packages/ and cross-checked it against the declared export maps. Every subpath that IS used resolves to a real file (no broken entries), but two declared entries have zero consumers:

  packages/expr/package.json:20   "./latex": "./src/latex.ts",        -> 0 uses of "@cas/expr/latex"
  packages/gpu/package.json:23    "./dual-backend": "./src/dualBackend.ts",  -> 0 uses of "@cas/gpu/dual-backend"

Usage census (occurrences of each specifier across all .ts/.mjs/.js): @cas/core 72, @cas/exact 31, @cas/interchange 29, @cas/expr/parser 29, @cas/expr 29, @cas/gpu 28, @cas/expr/evaluate 18, @cas/expr/ast 14, @cas/expr/complexJs 12, @cas/gpu/shader 7, @cas/gpu/glsl 6, @cas/expr/derivative 6, @cas/expr/rational 5, @cas/expr/glsl 4, @cas/gpu/colormap 2, @cas/expr/complex 2, @cas/gpu/df64 1, @cas/expr/lexer 1.

Both are reachable another way, which is why nothing broke: `toLatex` is re-exported from the barrel (packages/expr/src/index.ts:14 `export { toLatex } from "./latex.js";`), and the browser harness imports dualBackend by relative path from within the package.

**Failure scenario**

Not a runtime failure — it is a maintenance trap. The export map is the package's public API surface, so `"./dual-backend"` reads as a supported entry point that consumers may depend on. A future refactor that renames src/dualBackend.ts, or moves runGLSL behind a browser-only guard, will update the one relative import in the browser test and leave the export map pointing at a path that no test exercises — a broken public entry point that lint, typecheck, and the whole test suite pass straight through, because nothing imports it.

**Proposed fix**

Delete the two unused entries from packages/expr/package.json and packages/gpu/package.json. If either is meant to stay public, add a one-line test that imports through the subpath specifier (`import { runGLSL } from "@cas/gpu/dual-backend"`) so the export map is actually exercised — that is the only thing that keeps an export map honest.

---

## Scope: cd-core — Complex Dynamics shell, state, UI, presets, combinatorics

**Reviewer's summary of what was read and overall impression:**

I read `apps/complex-dynamics/src/main.ts` in full (all 4329 lines, in five chunks), `src/state/appState.ts`, `src/state/places.ts`, `src/state/profiles.ts`, `src/presets.ts`, every file in `src/ui/` (controls, dom, validate, toast, gradient, recorder, dataExport, plotLegend, suggestions, glossary), `src/combinatorics/` (angles, orbitPortrait, coreEntropy, dynatomic — stripping only via its call sites), `src/interchange/importMap.ts`, `src/hiResExport.ts`, and the control-id inventory of `index.html`. To verify claims I also read the relevant parts of `src/render/glPlot.ts` (perturbation-eligibility probe, center/zoom setters, centerDD), `plotView.ts` (overlay setters, onViewChanged), `juliaProperties.ts`, `juliaMetricsClient.ts`, `uniformize.ts`, `farey.ts`, `inverseJulia.ts`, `yoccozPuzzle.ts`, `rays.ts`, `angleParameter.ts`, `dd.ts`, plus `CONTRIBUTING.md` §"adding a control" and the appState/places tests.

Overall health is high. The shell is unusually disciplined for a 4.3k-line entry point: listeners are wired exactly once in `init()`, every rAF is one-shot or guarded by a `previewScheduled`/`recording` flag, every `localStorage` access is try/caught, MediaRecorder tracks and WebGL probe contexts are explicitly released, untrusted permalink payloads (`_grad`, `_z0`, `_notes`, `_pcdd`) are validated and capped, and the debounced-history/undo interaction has clearly already survived a review pass (there is a comment explaining the exact clearTimeout ordering). I found no listener, RAF, worker, or WebGL-context leak in this scope, and no stale-closure bug — the module-level `let openGlossary/refreshProfileLabel/adoptProfile/scheduleSuggestions` late-binding pattern is used correctly.

The real problems cluster in three places. (1) `perturbationEligible` — which is true for every monic z^d+c up to degree 8 and for general additive-c polynomials — is being used throughout as a "f is z²+c" predicate, so the shipped `cubic` and `biomorph` presets (z³+c) unlock nine quadratic-only combinatorial overlays that then draw mathematically wrong objects as fact; `monicDegree === 2` is the correct predicate and is already used correctly four other places in the same file. (2) The double-double centre carried in `_pcdd` silently overrides the recentre in "Self-similar zoom". (3) The Julia-properties panel labels a numerically located cycle's multiplier with `=`, which the project's honest-labeling rule reserves for exact/certified values, and which contradicts the `≈`/`≤`/`(exact)` convention every other row in that same panel follows. Secondary issues are state-fidelity drift (SHARE_IDS / reset_all missing the Yoccoz + lamination + inverse-Julia + Siegel + projection controls, added after the convention was written down) and a duplicated panel-refresh path in `applyChanges`/`applyPreset`.

### `cd-shell-01` — z²+c-only overlays are gated on `perturbationEligible`, which is true for z^d+c (d ≤ 8) — the shipped cubic preset draws quadratic-family combinatorics as fact

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/complex-dynamics/src/main.ts:2468` | `UNVERIFIED` |

**Evidence**

`glPlot.ts:791-795` sets eligibility for ANY monic z^d+c and for general additive-c polynomials:
```ts
this._perturbEligible =
  (this._monicDegree !== null && this._monicDegree <= MAX_PERTURB_DEGREE) ||   // MAX_PERTURB_DEGREE = 8
  this._polyPerturb !== null;
```
yet its getter is documented `/** Whether the current f is z²+c ... */` and main.ts uses it as exactly that in eleven places, e.g.
```ts
// main.ts:2467-2472  applyInverseJulia
const eligible = dynamicalView.plot.perturbationEligible;
const cb = byId<HTMLInputElement>("inverse-julia");
cb.disabled = !eligible;
dynamicalView.setInverseJulia(eligible && cb.checked);
```
```ts
// main.ts:1439 updateYoccoz / 1529 updateLamination
const eligible = dynamicalView.plot.perturbationEligible; // z²+c (both planes share f)
```
```ts
// main.ts:2352 legendSetName
return view.plot.perturbationEligible ? "Mandelbrot set" : "the set";
```
The drawn objects are hard-coded quadratic: `inverseJulia.ts` iterates `z ↦ ±√(z−c)` from `betaFixedPoint = (1+√(1−4c))/2`; `yoccozPuzzle.ts` uses `alphaFixedPoint = (1−√(1−4c))/2` and doubling-map angles; `farey.ts` `bulbRoot` uses `c = μ/2 − μ²/4`; `rays.ts` traces the Böttcher approximation `z_m ≈ Φ^(2^m)`. Note main.ts already has the right predicate and uses it correctly at lines 2571, 3272, 3392, 3553 (`monicDegree === 2`).

**Failure scenario**

Select the built-in "cubic" preset (`presets.ts:137`, f = `z^3+c`) and press Apply. `probeMonicDegree()` returns 3, so `perturbationEligible` is true. The Farey-bulb, external-ray, ray-pair, inverse-Julia, Siegel-curve, Yoccoz-puzzle, parapuzzle, lamination and QML checkboxes all become enabled. Tick "Inverse-iteration Julia": a 12 000-point cloud of the Julia set of z²+c is drawn on top of the z³+c Julia set. Tick "Yoccoz puzzle": rays around the *quadratic* α = (1−√(1−4c))/2 are drawn with q·2ⁿ doubling angles (z³+c needs tripling and a different α) while the note reads "Depth n: N rays around α (valence q…)" — the UI's own caveat string "The Yoccoz puzzle is defined for z²+c" is never shown because the gate passed. Tick "Farey bulb labels": p/q labels are placed at μ/2 − μ²/4, points that are not on the cubic connectedness locus at all. The parameter-plane legend chip reads "Mandelbrot set". Same for the `biomorph` preset (also z³+c) and for any typed additive-c polynomial such as `z^3-z+c`.

**Proposed fix**

Introduce a single `isQuadratic` predicate (`view.plot.monicDegree === 2`) and use it for every z²+c-only gate: main.ts lines 1253, 1272, 1439, 1529, 2352, 2438, 2446, 2460, 2468, 2476, 3336. Leave `perturbationEligible` only at lines 1146 and 2526, where perturbation itself is the subject. Also correct the stale docstring on `GLPlot.perturbationEligible` (glPlot.ts:2363) — it says "z²+c" but the flag covers z^d+c up to degree 8 plus general additive-c polynomials.

### `cd-shell-02` — "Self-similar zoom" never recentres: the stale `_pcdd` double-double centre in the copied state overwrites the new centre after applyAllControls

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | trivial | `apps/complex-dynamics/src/main.ts:3748` | `UNVERIFIED` |

**Evidence**

The handler copies the *current* full state (which includes the current double-double centre) and then overwrites only the plain-f64 centre field:
```ts
// main.ts:3748-3751
const state = readFullState();
state.inpparamcenter = `${c0[0]},${c0[1]}`;
state.inpparamzoom = String(parameterView.plot.zoom * mag);
applyFullState(state);
```
`readFullState` attaches the exact centre whenever the view is not pristine:
```ts
// main.ts:2633-2635
const pc = parameterView.plot.centerDD;
if (parameterView.plot.zoom > 1e3 || pc[0][1] !== 0 || pc[1][1] !== 0)
  state._pcdd = ddCenterToString(pc[0], pc[1]);
```
and `applyFullState` restores `_pcdd` *after* the controls have been applied, deliberately clobbering whatever centre they set:
```ts
// main.ts:2687-2695
applyAllControls();
// applyAllControls reset each centre from the rounded f64 input; if the state carries an exact
// double-double centre (a deep zoom), restore it now so the view reproduces to full precision.
if (typeof state._pcdd === "string") {
  const c = ddCenterFromString(state._pcdd);
  if (c && ...) parameterView.plot.setCenterDD(c[0], c[1]);
}
```

**Failure scenario**

Load the default Mandelbrot view and pan the parameter plane once by dragging. `GLPlot.shift` folds the delta in with `ddAddNumber` (dd.ts:71), whose `twoSum` leaves a non-zero low limb, so `pc[0][1] !== 0` from then on regardless of zoom. Now click a Misiurewicz-type point (|λ| > 1.0001) so "Self-similar zoom" appears, and press it. The view magnifies by |ρ| but stays centred on the *old* centre — `setCenterDD` restores it — so the user is zoomed ×|ρ| into empty filaments rather than into the self-similar copy around c₀. The toast still claims "Self-similar zoom ×N about the Misiurewicz-type point (ρ = λ)", which is false. The same latent trap exists for any future caller that edits `inpparamcenter`/`inpdyncenter` on a state object returned by `readFullState()`.

**Proposed fix**

In the `inspector-rho-zoom` handler, delete the exact centre alongside the f64 one: `delete state._pcdd;` right after setting `state.inpparamcenter` (the dynamical centre is untouched, so `_dcdd` should stay). Better still, add a helper `setParamCenterInState(state, c)` that writes `inpparamcenter` and drops `_pcdd` together, so the two fields can never disagree; a regression test asserting `applyFullState` lands on the requested centre when the plot has a non-zero DD low limb would lock it in.

### `cd-shell-03` — Julia-properties panel prints `|λ| =` for a numerically located cycle multiplier, violating the project's exact/bound/estimate labelling rule and the panel's own convention

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | trivial | `apps/complex-dynamics/src/main.ts:1935` | `UNVERIFIED` |

**Evidence**

```ts
// main.ts:1931-1935
else if (p.paramClass === "hyperbolic" && p.cycle)
  ptype =
    p.cycle.multiplierMag < 1e-6
      ? `superattracting · period ${p.cycle.period}`
      : `attracting · period ${p.cycle.period} · |λ| ${holo ? "=" : "≈"} ${jNum(p.cycle.multiplierMag, 3)}`;
```
```ts
// main.ts:1949 — same `holo` proxy, no marker at all in the holomorphic branch
: `${holo ? "" : "≈ "}${jNum(p.lyapunov, 4)} nats/iter`,
```
`holo` is `parameterView.plot.holomorphic` (line 1881), i.e. "an analytic f′ exists" — not "this number is exact". The value comes from `computeJuliaProperties` → `inspect()` (juliaProperties.ts:167), which iterates the critical orbit to a numeric attractor, Newton-*refines* the cycle points to f64 tolerance, and returns `|∏ f′(z_k)|` as a float64 (inspect.ts:305-322). For a holomorphic f the printed Lyapunov is `Math.log(multiplierMag)/period` (juliaProperties.ts:187) — the same estimate. Every other numeric row in the same panel is marked honestly: `jp-dimension` → `≈ … (small-c)` / `≈ … (box-count)` (line 1784-1787), `jp-area` → `≈ … (pixel)` / `≤ … (bound)` (1796-1799), `jp-bounding` → `|z| ≤ R (disk)` (1954), `jp-capacity` → `≈ …` or `… (exact)` (1966). Only `|λ|` gets a bare `=`. The explanatory footnote is empty for the monic family: `jSet("julia-props-note", d === null ? "For a general f these are numerical estimates; …" : "")` (1968-1973), so on the Mandelbrot set the `=` carries no caveat at all.

**Failure scenario**

Load the default Mandelbrot preset (holomorphic z²+c, `d = 2`, so the footnote is blank), open "Julia set properties", and click a c inside a period-3 bulb. The panel reports `attracting · period 3 · |λ| = 0.412` and `Lyapunov: -0.2954 nats/iter`. Both are float64 outputs of a finite Newton refinement of a numerically located cycle — neither is exact or a rigorous bound — but under this repo's stated convention `=` asserts "exact/certified", and a researcher using "Copy properties" (main.ts:1981) gets that `=` verbatim in their clipboard text. The `holo`/non-`holo` split makes the mislabel systematic rather than incidental: it fires for every holomorphic map, which is most of the presets.

**Proposed fix**

Stop using `holo` as an exactness proxy. Print `|λ| ≈ …` unconditionally (keep a separate note that the non-holomorphic magnitude is a Jacobian spectral-radius estimate rather than ∏f′, since that is a real distinction but not an exactness one), and prefix the Lyapunov value with `≈ ` in both branches. The one genuinely exact reading here — `superattracting` at a nucleus — can keep its bare wording since it is a classification, not a measured number.

### `cd-shell-04` — The Julia-properties panel computes with the parameter plane's f but the dynamical plane's c — after "Render mating" the two diverge and the panel describes a different map than the one on screen

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | medium | `apps/complex-dynamics/src/main.ts:1882` | `UNVERIFIED` |

**Evidence**

```ts
// main.ts:1879-1889 updateJuliaProperties
const d = parameterView.plot.monicDegree;
const c = dynamicalView.plot.cValue;
const holo = parameterView.plot.holomorphic;
const p = computeJuliaProperties({
  degree: d, c,
  fAst: parameterView.plot.fAst,
  escAst: parameterView.plot.escAst,
  criticalPoint: parameterView.plot.criticalPoint,
  a: parameterView.plot.paramA,
});
```
The mixing is safe only because both planes normally share f. `renderMatedMap` breaks that invariant — it re-presets ONLY the dynamical plot:
```ts
// main.ts:3599-3610
function renderMatedMap(fString: string, label: string): void {
  dynamicalView.applyPreset({ f: fString, c: "0", z0: "0", n: "120", nplot: "6",
    escape: "abs(z)>10000", mode: "marty", zoom: 0.6, center: [0, 0] });
```
with the deliberate comment at 3587-3590 "The parameter plane is left as the Mandelbrot for context". The `#inpf` control is likewise never updated, so `readFullState().inpf` still says `z^2+c`.

**Failure scenario**

Press "Render mating" (e.g. `1/3 ⊔ basilica`); the dynamical sphere now shows the rational map (z²−x₁)/(z²−1). Open "Julia set properties". `updateJuliaProperties` runs with `fAst` = z²+c and `c` = the mated preset's c = 0, and the header reads `Julia set properties — c = 0`, followed by "connected (c ∈ Mandelbrot set)", "superattracting · period 1", "|z| ≤ 1 (disk)", "central (z → −z) · real axis", "1 (exact)" — a complete description of the unit disk, presented as the properties of the mated rational map filling the screen. "Copy properties" exports that as fact. Separately, pressing Enter or Apply at any point silently replaces the mated map with `z^2+c` from the untouched `#inpf`.

**Proposed fix**

Either drive the panel from the plane it describes (`dynamicalView.plot.fAst/escAst/criticalPoint`, with `parameterView.plot.monicDegree` replaced by the dynamical plot's) — which is also more correct in the normal shared-f case — or have `renderMatedMap` mark the divergence and blank/annotate the c-dependent readouts (Julia properties, exterior map, Yoccoz, lamination) with "describing the parameter-plane map" until the next `applyChanges`. Also write the mated `fString` into `#inpf` (or disable Apply) so an accidental Enter doesn't wipe the render.

### `cd-shell-05` — Selecting a "Place" silently deletes every pinned annotation

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | trivial | `apps/complex-dynamics/src/main.ts:2706` | `UNVERIFIED` |

**Evidence**

`applyFullState` clears the notes array unconditionally and only refills it if the incoming state happens to carry `_notes`:
```ts
// main.ts:2706-2728
notes = [];
const MAX_NOTES = 256;
const MAX_NOTE_TEXT = 2000;
if (typeof state._notes === "string") {
  try { const parsed: unknown = JSON.parse(state._notes); … } catch { }
}
refreshNotes();
```
Every other caller passes a state produced by `readFullState()`, which round-trips notes (`if (notes.length > 0) state._notes = JSON.stringify(notes);`, line 2639). `setupPlaces` is the exception — it passes the curated partial state straight through:
```ts
// main.ts:2654-2658
sel.addEventListener("change", () => {
  const place = PLACES.find((p) => p.name === sel.value);
  sel.value = "";
  if (place) applyFullState(place.state);
});
```
and `places.ts:16-23` builds each state from six control ids only — no `_notes`.

**Failure scenario**

Inspect three interesting parameters and pin a gold note at each ("Pin note", main.ts:3777). Then pick "Seahorse Valley" from the Places dropdown to compare. All three pins vanish from both planes with no warning and no toast. They are recoverable only by noticing and pressing Ctrl+Z (the select's `change` event reaches the document-level `scheduleRecord` listener, so a history entry does get written) — but nothing tells the user that anything was lost, and a second Place selection before undoing pushes the loss past the visible affordance.

**Proposed fix**

Preserve state the incoming object does not mention. Either treat `_notes` like the other underscore keys — only replace when the key is present (`if (typeof state._notes === "string") { notes = …; refreshNotes(); }`) — or, since undo snapshots genuinely need to be able to restore an *empty* notes list, have `readFullState` always emit `_notes` (even as `"[]"`) so absence unambiguously means "not specified" and Places leaves pins alone. The same reasoning applies to `_grad`, `_z0` and `_profile`, which already use the present-only rule.

### `cd-shell-06` — Keyframe scrubbing moves the plot without writing back the centre/zoom inputs, so the sidebar, view chip, share link and history all keep the pre-scrub view

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | trivial | `apps/complex-dynamics/src/main.ts:3038` | `UNVERIFIED` |

**Evidence**

```ts
// main.ts:3037-3043
/** Seek the parameter plane to the scrub position along the keyframe path. */
function applyScrub(): void {
  if (keyframes.length < 2) return;
  const v = interpolateView(keyframes, Number(byId<HTMLInputElement>("kf-scrub").value));
  parameterView.plot.center = v.center;
  parameterView.plot.zoom = v.zoom;
}
```
`GLPlot`'s `set center` / `set zoom` (glPlot.ts:2126-2133) do call `scheduleRender()`, so the picture updates — but `onViewChanged` is fired only from the pointer/keyboard interaction handlers in `plotView.ts` (lines 648, 675, 695, 742, 799), never from a programmatic assignment. So none of `setParamCenterInput` / `setParamZoomInput` / `updateViewChips` / `scheduleSuggestions` runs. Contrast every other programmatic view move, which either calls `onViewChanged`'s work explicitly or restores the pre-move view (`recordZoomMovie`, `recordKeyframePath`).

**Failure scenario**

Add two keyframes and drag the "scrub" slider to the middle. The parameter plot flies to the interpolated view, but the sidebar still shows the old `center`/`zoom` and the view chip still reads the old "center … · zoom … · N it". The `input` event reaches the document-level `scheduleRecord` (line 3982), so 350 ms later `recordHistory()` writes a snapshot built from those stale inputs — the scrubbed view is not in the undo stack. Pressing "Share link" now produces a permalink to the pre-scrub view. Pressing Apply, or Enter anywhere (line 3181), re-reads the stale inputs and snaps the plot back, discarding the scrub.

**Proposed fix**

Have `applyScrub` mirror the interaction path: after setting `center`/`zoom`, call `setParamCenterInput(parameterView.plot.center)`, `setParamZoomInput(parameterView.plot.zoom)` and `updateViewChips()`. Cleanest is to extract the body of the `onViewChanged` hook passed to `parameterView` (main.ts:995-1002) into a named `syncParamViewInputs()` and call it from both places, so any future programmatic view move cannot forget it.

### `cd-shell-07` — Nine view-defining controls are missing from SHARE_IDS (and five from `reset_all`), so permalinks, saved views and undo silently drop the Yoccoz/lamination/inverse-Julia/Siegel/projection state

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/complex-dynamics/src/state/appState.ts:15` | `UNVERIFIED` |

**Evidence**

`SHARE_IDS` (appState.ts:15-58) lists 34 ids and stops at `perturbation`, `param-a`. Absent, though all are live view-defining controls with their own `applyX()`: `inverse-julia`, `siegel-curves`, `yoccoz-toggle`, `parapuzzle-toggle`, `yoccoz-depth`, `yoccoz-critical`, `lamination-toggle`, `qml-toggle`, `lamination-detail`, `projection-mode`. `readAppState`/`applyAppState` iterate SHARE_IDS only, so anything outside it is invisible to `encodeState`, saved views and `recordHistory`. The repo's own contributor rule says otherwise — CONTRIBUTING.md:193-196: "For a **live control** (toggle / select / slider): give it an `applyX()` wired on `change`/`input` and called at init, and add its id to `SHARE_IDS` … so permalinks / saved views / undo round-trip it". The existing test only checks the converse direction (`test/appState.test.ts:43` — "every SHARE_IDS id exists in index.html"), so the drift is unguarded. Separately, `reset_all` (main.ts:4003-4073) resets `inverse-julia`, `siegel-curves` and `projection-mode` but never touches `yoccoz-toggle`, `parapuzzle-toggle`, `yoccoz-critical`, `lamination-toggle` or `qml-toggle`, despite its own comment "Reset every option".

**Failure scenario**

Turn on "Yoccoz puzzle" at depth 4 with the critical piece shaded, plus the QML lamination widget, and press "Share link". Open the copied URL in a new tab: the view, colouring and every other overlay come back, but both instruments are off — the recipient sees a different picture from the one that was shared, with no indication anything was dropped. Same for "Save view" and for Ctrl+Z (undoing across a Yoccoz toggle does not restore it). Separately, with those overlays on, press "Reset all": the puzzle rays and lamination disk stay drawn on top of the freshly reset default view.

**Proposed fix**

Append the ten ids to `SHARE_IDS`, and re-run `updateYoccoz()` / `updateLamination()` from `applyAllControls()` so a restored state is actually pushed to the overlays (they are currently reached only via `refreshDynPanels`). Add the five puzzle/lamination ids to `reset_all` alongside the existing `inverse-julia` / `siegel-curves` block. To stop the drift recurring, extend `test/appState.test.ts` with the forward check: scrape `index.html` for control ids that main.ts wires to an `applyX`/`update*` on `change`/`input` and assert each is either in `SHARE_IDS` or on an explicit opt-out list (the deliberate exclusions are the persisted prefs `suggestions`, `legend-toggle`, `bla-toggle`, `orbit-preview-toggle` and the documented sphere MVP exclusions).

### `cd-shell-08` — `applyChanges` and `applyPreset` recompute the exterior map, Laurent boundary and Julia properties a second time — `syncDynamicalC()` already ran all five panel refreshes

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | redundancy | trivial | `apps/complex-dynamics/src/main.ts:2134` | `UNVERIFIED` |

**Evidence**

`syncDynamicalC` → `updateDynCaption` → `refreshDynPanels` already runs the whole set:
```ts
// main.ts:1400-1407
function refreshDynPanels(): void {
  window.clearTimeout(dynPanelsTimer);
  updateExteriorMap();
  applyLaurent();
  updateJuliaProperties();
  updateYoccoz();
  updateLamination();
}
```
```ts
// main.ts:1414-1422
function updateDynCaption(): void { … if (coupledDrafting) scheduleDynPanels(); else refreshDynPanels(); }
```
yet both commit paths call three of them again after `syncDynamicalC()` (which is not drafting at that point, so `refreshDynPanels` ran synchronously):
```ts
// main.ts:2120 … 2136 (applyChanges)
syncDynamicalC();
…
updateExteriorMap(); // a new f may change the degree / coefficients
applyLaurent();
updateJuliaProperties();
```
```ts
// main.ts:2151 … 2173 (applyPreset) — same duplication
```

**Failure scenario**

With the "Exterior map" and "Julia set properties" panels open (the Researcher profile opens the latter by default), press Apply or load any preset. `dynExterior(n)` runs twice — each run does `polynomialConnectivity` (a full critical-orbit sweep) plus `juliaExteriorCoeffs` / a DFT extraction — `mandelbrotExteriorCoeffs(d, n)` runs twice unmemoised, and `computeJuliaProperties` (which itself calls `inspect` and `analyticAreaUpperBound` with 64 Böttcher coefficients) runs twice. Every preset switch and every Apply therefore pays roughly double the panel cost on the main thread, and `updateJuliaProperties` also resets `lastBoxDim`/`lastPixelArea` and re-arms `scheduleJuliaMeasure` twice.

**Proposed fix**

Delete lines 2134-2136 and 2171-2173; `syncDynamicalC()` above them already covers all five panels (and additionally refreshes Yoccoz/lamination, which the duplicated block omits — so removing it is strictly more correct, not just cheaper). If the explicit calls are wanted for readability, invert it instead: drop `refreshDynPanels()` from `updateDynCaption` for the commit paths by making the caption update and the panel refresh separate calls.

### `cd-shell-09` — The Laurent boundary-radius slider re-derives all dynamical exterior coefficients on every input event, though only `r` changed

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | small | `apps/complex-dynamics/src/main.ts:3923` | `UNVERIFIED` |

**Evidence**

```ts
// main.ts:3923-3926
byId("laurent-r").addEventListener("input", () => {
  updateLaurentR();
  applyLaurent();
});
```
`applyLaurent` memoises the *parameter* side by a `${dMonic}:${n}` key but recomputes the dynamical side unconditionally:
```ts
// main.ts:1739-1755
if (dMonic !== null) {
  const key = `${dMonic}:${n}`;
  if (key !== lastBoundaryKey) { lastBoundaryParam = mandelbrotExteriorCoeffs(dMonic, n); lastBoundaryKey = key; }
  parameterView.setLaurentBoundary(lastBoundaryParam, r);
} …
const dyn = dynExterior(n);           // ← no memo
if (dyn.kind === "ok" && dyn.source === "polynomial") dynamicalView.setLaurentBoundary(dyn.coeffs, r, dyn.lead);
```
`dynExterior` → `juliaExteriorCoeffs(d, c, n)` (uniformize.ts:136-153) loops `m = 1..n+1` calling `seriesPow(g, d, m)`, and `seriesPow` is binary exponentiation over `seriesMul`, which is O(m²) — so the whole call is ~O(n³) complex multiplies. The `laurent-n` slider caps n at 128 (main.ts:1736).

**Failure scenario**

Set "boundary order" to its maximum (128) with the Laurent boundary overlay on, then drag the "radius" slider. Each pointer move fires `input`, and each event runs ~Σ_{m≤129} O(m²) ≈ 7×10⁵ complex multiplies on the main thread for a value that does not enter the coefficients at all — plus, for a non-monic polynomial f, a fresh `polynomialConnectivity` critical-orbit sweep and DFT per event. The slider drag stutters and the GL render is starved even though the only thing that needed to change is the scalar `r` passed to `setLaurentBoundary`.

**Proposed fix**

Give the dynamical side the same memo the parameter side already has: cache `{ key: `${n}:${c[0]},${c[1]},${fAstIdentity}`, result }` around the `dynExterior(n)` call in `applyLaurent`, or split `applyLaurent` into `recomputeLaurentCoeffs()` (on toggle / order / c / f) and `applyLaurentRadius(r)` (on the radius slider) and wire the `laurent-r` handler to the latter.

### `cd-shell-10` — A document-level `keyup` Enter handler fires `applyChanges()` on every keyboard button activation and inside every text field

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | usability | small | `apps/complex-dynamics/src/main.ts:3180` | `UNVERIFIED` |

**Evidence**

```ts
// main.ts:3180-3182
document.addEventListener("keyup", (event) => {
  if (event.key === "Enter") applyChanges();
});
```
There is no target filter (contrast the Ctrl+Z handler two hundred lines later, which explicitly skips INPUT/TEXTAREA: `if (tag === "INPUT" || tag === "TEXTAREA") return; // leave native text undo alone`, line 3986). Buttons activate on Enter *keydown*, so the subsequent keyup always reaches this handler; and `applyChanges` re-applies `#inpf` to both plots (`dynamicalView.applyPreset(dynPreset)`, line 2116).

**Failure scenario**

Press "Render mating" and get the mated rational map on the dynamical sphere. Now type a bulb into any text field — say `2/7` in `#mate-render-pq` — and press Enter, expecting the p/q mating to render. Instead the document handler runs `applyChanges()`, which re-applies `#inpf` (still `z^2+c`, since `renderMatedMap` never updates it) to the dynamical plot: the mating is replaced by an ordinary Julia set with no message. Similarly, tabbing to "Apply preset" and pressing Enter runs `applyPreset(name)` and then immediately `applyChanges()`, doing the whole two-plane recompile and panel refresh twice; and Enter in `#strip-address` runs Apply rather than "Strip & draw rays".

**Proposed fix**

Scope the shortcut: skip when the event target is an element with its own Enter semantics (`BUTTON`, `SELECT`, `TEXTAREA`, or an `INPUT` outside `INPUT_IDS`/`CENTER_SUB_IDS`), i.e. only commit when Enter is pressed in one of the deferred parameter fields. That also lets the feature-specific inputs get their own Enter handlers (`strip-address` → Strip, `mate-render-pq` → render, `view-name` → Save).

### `cd-shell-11` — `navigator.clipboard` is dereferenced without a guard in four copy handlers — a synchronous TypeError that the attached `.catch()` cannot see

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `apps/complex-dynamics/src/main.ts:1991` | `UNVERIFIED` |

**Evidence**

Four handlers use the same shape, where the property access happens *before* any promise exists:
```ts
// main.ts:1991-1994 (copyJuliaProperties)
void navigator.clipboard
  .writeText(lines.join("\n"))
  .then(() => showToast("Julia properties copied to the clipboard.", "info"))
  .catch(() => showToast("Couldn't access the clipboard.", "warn"));
```
repeated at main.ts:3760 (`inspector-copy`), 3804 (`copyCoords`) and 3886 (`copyCoeffs`). `navigator.clipboard` is `undefined` outside a secure context, so `.writeText` throws `TypeError: Cannot read properties of undefined` synchronously and the `.catch` never runs. The file already contains the correct pattern in two other places — `shareLink` (2736-2741) and the `cite-copy` handler (3863-3870) both `await navigator.clipboard.writeText(...)` inside a `try`/`catch`, which does swallow the TypeError.

**Failure scenario**

Serve the built app over plain HTTP on a LAN address (`http://192.168.1.20:5173`, the usual way to check the layout on a phone) — a non-secure context, so `navigator.clipboard` is undefined. Tap "Copy report" in the inspector: an uncaught TypeError lands in the console, no toast appears at all, and the user has no idea whether the copy succeeded. The three sibling buttons behave identically. On the deployed HTTPS Pages site this is latent, which is exactly why it will survive unnoticed.

**Proposed fix**

Extract the working pattern into one helper — `async function copyText(text: string, okMsg: string): Promise<void> { try { await navigator.clipboard.writeText(text); showToast(okMsg, "info"); } catch { showToast("Couldn't access the clipboard.", "warn"); } }` — and route all six call sites (including `shareLink` and `cite-copy`) through it.

### `cd-shell-12` — Two concurrent exports share one progress overlay and one cancel button, so the first to finish hides the dialog out from under the second

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | usability | small | `apps/complex-dynamics/src/main.ts:820` | `UNVERIFIED` |

**Evidence**

`beginExport` claims the single `#export-progress` overlay with no re-entrancy guard, and its `done()` unconditionally hides it:
```ts
// main.ts:820-850
function beginExport(label: string): { … } {
  const overlay = byId("export-progress");
  const bar = byId<HTMLProgressElement>("export-progress-bar");
  const cancelBtn = byId<HTMLButtonElement>("export-cancel");
  let cancelled = false;
  const onCancel = (): void => { cancelled = true; cancelBtn.disabled = true; text.textContent = "Cancelling…"; };
  …
  cancelBtn.addEventListener("click", onCancel);
  overlay.hidden = false;
  return { onProgress: (fraction) => { bar.value = fraction; }, isCancelled: () => cancelled,
           done: () => { overlay.hidden = true; cancelBtn.removeEventListener("click", onCancel); } };
}
```
`runExport`/`runCopy` (2204, 2242) only disable their *own* button, and both are launched as `void runExport(...)` from independent handlers (`print_param_space` at 4074, `print_dyn_plane` at 4084), so the two async tile loops interleave.

**Failure scenario**

Click "Export PNG" under the parameter plot, then immediately click "Export PNG" under the dynamical plot. Two `beginExport` calls run: the label and progress bar flip back and forth between the two jobs, the cancel button now carries two `onCancel` closures so one press aborts both, and when the faster export finishes its `done()` hides the overlay while the second export is still tiling — leaving that job with no progress display and no way to cancel, while its button stays stuck on "Rendering…".

**Proposed fix**

Make `beginExport` re-entrancy-safe with a module-level counter: refuse (or queue) a second call while one is active, or key the overlay to a job id and only hide it when the count returns to zero. Simplest correct fix given the shared `recording` precedent elsewhere in the file: add an `exporting` flag and have `runExport`/`runCopy` bail with a toast ("An export is already running.") when it is set.

---

## Scope: cd-render — Complex Dynamics render/ (glPlot, shaders, overlays, perturbation/BLA)

**Reviewer's summary of what was read and overall impression:**

I read every file named in the scope brief in full — glPlot.ts (2450 lines, all of it), shaderBuilder.ts (all 966, including both GLSL kernels), overlay.ts, plotView.ts, juliaProperties.ts (Tier-1 + the interface), matingEngine.ts, uniformize.ts, perturbationPoly.ts, perturbation.ts, bla.ts, critical.ts, inspect.ts, sphereView.ts, angleParameter.ts, angleOfPoint.ts — plus the supporting render files they lean on (dd.ts, histogram.ts, rays.ts) and the main.ts / index.html call sites needed to judge reachability and how results are labelled to the user. I verified four claims numerically with throwaway Node scripts (cardioid-cusp escape times vs. the 512/400-iteration classifiers; BLA table rebuild cost at orbitLen 20000; DD reference-orbit cost; external-ray enumeration cost at the shipped bounds). Overall health is high: the WebGL resource lifecycle is genuinely careful (context-loss handlers recreate everything, programs are deleted before replacement, pending async df64 builds are generation-guarded and disposed, the collar/last-frame textures are kept separate on purpose), the df64/dd arithmetic is textbook-correct, the BLA radius derivations are right for both the monic and the general-polynomial cases, and the mating engine is unusually disciplined about refusing rather than guessing. The defects cluster in three places: (a) the live parameter `a` is baked into the perturbation setup at rebuild time and never refreshed, and the escape probes ignore `a` entirely; (b) two connectivity verdicts derived from fixed-iteration escape tests are presented to the user as definite mathematical facts; (c) the perturbation deep-zoom path rebuilds its whole CPU-side reference orbit + BLA tree on every interaction frame.

### `cd-render-01` — setParamA never rebuilds, so perturbation renders with stale `a` coefficients — the image freezes while the slider moves

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/complex-dynamics/src/render/glPlot.ts:2321` | `UNVERIFIED` |

**Evidence**

`setParamA` only stores and re-renders:
```ts
  setParamA(re: number, im = 0): void {
    this._paramA = [re, im];
    this.scheduleRender();
  }
```
but the perturbation data is extracted once, inside `rebuild()`, with `a` baked into the numeric coefficients (glPlot.ts:786-790):
```ts
    this._polyPerturb =
      this._monicDegree === null
        ? extractPolyPerturbation(this._iterAst, this._paramA, MAX_PERTURB_DEGREE)
        : null;
```
and `extractPolyPerturbation` bakes it in via `fToRational(fAst, [0, 0], a)` (perturbationPoly.ts:213). Nothing else on the perturbation path reads `_paramA`: `setupPerturbDraw` uploads `poly.coeffs`/`poly.dcCoeff` (glPlot.ts:1380-1388) and `ensureOrbit` computes the reference orbit from `this._polyPerturb.coeffs` (glPlot.ts:1255-1258). `main.ts:3935` wires the slider straight to `applyParamA`, which calls only `setParamA` on both plots (main.ts:2590-2595) — no `rebuild()` anywhere.

**Failure scenario**

Type `f = a*z^2+c` (the `a` slider appears, since `usesParamA` is true). `probeMonicDegree` returns null (f(2,0) = 0 at a=0), so `extractPolyPerturbation` succeeds with coeffs `[0, 0, [a,0]]`, degree 2, B = 1 ⇒ `_perturbEligible = true`. Tick "perturbation (deep zoom)". Now drag the `a` slider from 1 to 3: `uPolyCoeffs` still holds a=1 and the reference orbit still iterates P(z)=1·z², so the rendered fractal is byte-identical to the a=1 picture and does not change at all, while the `a` readout, the orbit overlay, the inspector and the Julia-properties panel (all of which read `plot.paramA` live) show a=3. The user is shown the wrong fractal, silently, with no error and no `≈` caveat.

**Proposed fix**

Call `this.rebuild()` before `this.scheduleRender()` in `setParamA` (guarded by `if (isFreeParameter(this._fAst, "a") || isFreeParameter(this._escAst, "a"))` so the common a-independent case still avoids a shader recompile). A slider `input` event fires at pointer rate, so debounce the rebuild or split out a cheap `refreshPerturbationData()` that re-runs `extractPolyPerturbation` + `probeEscapeRadius2` and sets `orbitDirty`/`blaDirty` without recompiling the fragment program (the compiled shader reads `a` through the `uA` uniform, so only the CPU-side perturbation data is stale).

### `cd-render-02` — `connected` conflates "undetermined" with "bounded", so an iteration-limited estimate is printed as a definite "c ∈ Mandelbrot set"

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/complex-dynamics/src/render/juliaProperties.ts:171` | `UNVERIFIED` |

**Evidence**

```ts
  const info = inspect(fAst, escAst, "param", criticalPoint, c, a);
  const escapes = info.fate === "escaped";
  const connected = !escapes;
```
`inspect` → `classifyOrbit(fAst, escapeAst, z0, c, a)` uses the default `maxIter = 512` (overlay.ts:148), and `classifyWalk` returns `fate: "undetermined"` when the orbit neither escapes nor closes within that budget — explicitly documented there as "NOT a claim of boundedness" (overlay.ts:131-134). `connected: boolean` has no third state, so "undetermined" silently becomes `connected = true`, and main.ts:1921-1926 prints it unqualified:
```ts
        p.connected
          ? `connected (c ∈ ${d === 2 ? "Mandelbrot set" : `multibrot M${d}`})`
          : "totally disconnected — Cantor dust",
```

**Failure scenario**

Verified numerically. Take the default z²+c preset (d = 2) and set c = 0.25 + 1e-5 — just outside the main-cardioid cusp, so K_c is a Cantor set and c ∉ M. The critical orbit creeps through the parabolic bottleneck and escapes at iteration 991, well past the 512-iteration budget; my simulation of `classifyWalk` at that c returns `{fate:"undetermined"}`. So `escapes = false`, `connected = true`, and the Julia-properties panel states "connected (c ∈ Mandelbrot set)" for a parameter that is provably outside it. (c = 0.25 + 1e-6 escapes at 3140, c = 0.25 + 1e-7 at 9933 — the whole parabolic neighbourhood is mislabelled.) The same `!escapes` also drives `analyticArea: monic ? (escapes ? 0 : analyticAreaUpperBound(degree, c)) : null` (line 204), so a "≤ … (bound)" Gronwall area is emitted for a set whose connectedness — the theorem's hypothesis — was never established.

**Proposed fix**

Widen the field to a tri-state, e.g. `connected: boolean | null` (or add `connectivityDetermined: boolean`), set from `info.fate`: `"escaped" → false`, `"converged"/"periodic" → true`, `"undetermined" → null`. In main.ts print "connected (c ∈ Mandelbrot set)" only for `true`, and "not resolved in 512 iterations (may be a slow escaper)" for `null`; suppress `analyticArea` and `smallCDimension` when it is `null`, since both assume K_c connected. Optionally raise `classifyOrbit`'s cap for this call and report the cap in the label.

### `cd-render-03` — `polynomialConnectivity` is documented and consumed as RIGOROUS but is a 400-iteration escape test that suppresses the fallback estimate

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/complex-dynamics/src/render/critical.ts:259` | `UNVERIFIED` |

**Evidence**

Module header: "Critical points and **RIGOROUS** connectivity for a polynomial map f"; the function doc: "**Rigorous** connectivity of a polynomial filled Julia set, from the fate of every critical orbit". The implementation is a fixed-budget escape walk:
```ts
const CONN_ITERS = 400; // orbit length to decide a critical point's fate
...
    for (let k = 0; k < CONN_ITERS; k++) {
      if (esc(z, c) || cabs(z) > 1e6) { leaves = true; break; }
      z = f(z, c);
      ...
    }
    if (leaves) escaped++;
    else bounded++;
  }
  if (escaped === 0) return "connected";
```
There is no "did not resolve" outcome: not-escaped-within-400 is counted as `bounded`. The caller treats a non-null return as authoritative and switches off the honest image-based estimate (main.ts:1908-1918): `lastConnectivityRigorous = pc !== null;` … `pc === "connected" ? "connected (all critical orbits bounded)" : …`, and `computeJuliaImageMetrics` then skips `connectivity` entirely (`if (!opts.rigorousConnectivity) out.connectivity = describeConnectivity(...)`, juliaProperties.ts:752).

**Failure scenario**

Verified numerically. Enter `f = 2*z^2+c` (a genuine polynomial that `probeMonicDegree` rejects, so `d === null` and this path runs). Under w = 2z it conjugates to w²+2c, so its connectedness locus is {c : 2c ∈ M} and the cusp sits at c = 0.125. Take c = 0.125 + 5e-6, i.e. 2c = 0.25 + 1e-5: the single critical orbit escapes at iteration 991 > CONN_ITERS = 400, so `escaped === 0` and the function returns "connected". The panel prints the unqualified "connected (all critical orbits bounded)", and because `lastConnectivityRigorous` is true the image-based estimate that would have disagreed is never run. A Cantor-dust parameter is reported as a proven-connected one.

**Proposed fix**

Add an `"indeterminate"` outcome: track a third counter for critical points that neither escaped nor were shown to be bounded within `CONN_ITERS`, and return `"indeterminate"` whenever that counter is non-zero (a cheap improvement is to also detect an attracting cycle — reuse `classifyOrbit`'s relative-tolerance return test — so genuinely bounded orbits are *proved* bounded rather than merely not-yet-escaped). In main.ts, treat `"indeterminate"` like `null`: leave `lastConnectivityRigorous = false` so the image estimate still fills the row, and label it as iteration-limited. Also soften the "RIGOROUS"/"Rigorous" wording in the module and function docs to match what is actually established.

### `cd-render-04` — The escape-predicate probes evaluate at a = 0, ignoring the live parameter, so `_perturbEscape2` and the periodicity/cardioid bailouts can be wrong for an a-dependent escape

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | trivial | `apps/complex-dynamics/src/render/glPlot.ts:1176` | `UNVERIFIED` |

**Evidence**

Both probes compile the escape closure without passing `this._paramA`:
```ts
      const esc = makeEscapeFn(this._iterEscAst, this._iterAst);            // probeDivergenceEscape, :1176
```
```ts
      return radialEscapeSq(makeEscapeFn(this._iterEscAst, this._iterAst)); // probeEscapeRadius2, :1214
```
`makeEscapeFn(escapeAst, fAst, a: Complex = [0, 0])` (packages/expr/src/evaluate.ts:377-381) defaults `a` to the origin, so the probe answers for a = 0 no matter what the slider (or the preset) says. Their results drive real render decisions: `this._interiorBailout = this._monicDegree === 2 && divergenceEscape;` and `this._periodicityBailout = divergenceEscape;` (:796-797), which gate the cardioid/bulb interior shortcut and the in-loop periodicity bailout compiled into the fragment shader, and `this._perturbEscape2 = this.probeEscapeRadius2() ?? 4.0;` (:799), which is the perturbation kernel's `uPerturbEscape2`. Note `probeMonicDegree` deliberately probes with two different `a` values to reject a-dependence (:1124-1128) — these two probes do not.

**Failure scenario**

Enter `f = z^2+c` with `escape = abs(z) > 2*(1-a)` and a = 0.9 (the slider appears because `usesParamA` also checks `_escAst`). The probes run at a = 0, i.e. against `abs(z) > 2`: `probeDivergenceEscape` returns true and `radialEscapeSq` returns 4. So `_interiorBailout` and `_periodicityBailout` are compiled ON, and the shader paints every c in the main cardioid / period-2 bulb solid interior (`inMainCardioidOrBulb ⇒ return vec3(0.0)`) and short-circuits any orbit that stops moving — but at a = 0.9 the real bailout is |z| > 0.2, under which those orbits *do* escape. The whole cardioid is rendered as interior when it should be exterior bands. Symmetrically, with perturbation on, the kernel bails at R² = 4 while the standard shader bails at 0.04, so toggling perturbation changes the picture.

**Proposed fix**

Pass the live parameter: `makeEscapeFn(this._iterEscAst, this._iterAst, this._paramA)` in both `probeDivergenceEscape` and `probeEscapeRadius2` (and re-run them whenever `_paramA` changes — see cd-render-01). Belt-and-braces: mirror `probeMonicDegree`'s trick and additionally evaluate the predicate at a second `a` value, returning the conservative `false`/`null` when the two disagree, so an a-dependent escape can never enable the exactness-critical bailouts.

### `cd-render-05` — Perturbation rebuilds the whole double-double reference orbit and BLA tree on every draft frame of a deep-zoom pan/zoom

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | medium | `apps/complex-dynamics/src/render/glPlot.ts:1300` | `UNVERIFIED` |

**Evidence**

`setupPerturbDraw` unconditionally runs both builders every draw (:1352-1353):
```ts
    this.ensureOrbit(fullN); // computed at the full cap so it's reused across draft/refine
    this.ensureBLA(); // (re)build the BLA skip-table for the current orbit + zoom
```
`shift()` and the `zoom` setter both call `scheduleRender()` with the default `invalidateContent = true`, which sets `this.orbitDirty = true` (:959-962). `ensureOrbit` then recomputes the DD orbit and forces a BLA rebuild (`this.blaDirty = true; // the reference changed ⇒ rebuild the BLA table`, :1272), and `ensureBLA` rebuilds level 0 and the entire merge tree from a freshly materialised array of `orbitLen` two-element arrays:
```ts
    const ref: Complex[] = new Array(this.orbitLen);
    for (let i = 0; i < this.orbitLen; i++) ref[i] = [this.orbitXY[2 * i], this.orbitXY[2 * i + 1]];
```
followed by `packBLATable` (a fresh `Float32Array`) and a full `gl.texImage2D` upload. At deep zoom `canUsePreview()` is false (`desiredPrecision() === "single"` fails), so the cheap warp path is skipped and this runs on every draft frame.

**Failure scenario**

Perturbation on, auto-iterations on, zoom ≈ 1e14 ⇒ `targetIterations()` near AUTO_ITER_MAX so `orbitLen ≈ 20000`. Drag-panning fires one draft render per animation frame; each one re-runs, on the main thread: `computeReferenceOrbitDDFrom` for 20000 double-double steps (measured 3.7 ms for 8000 steps ⇒ ≈9 ms at 20000), then `ensureBLA` — 20000 fresh `[x,y]` arrays, 19999 `singleStep` calls, ≈20000 `mergeBLA` calls and a `Float32Array` pack (measured 18.4 ms in Node at orbitLen 20000) — then a 1.31 MB RGBA32F `texImage2D` upload. That is ≈28 ms of JS per frame before a single GPU pixel, capping the interaction at ~35 fps and churning ~1.3 MB of texture plus ~20000 short-lived arrays per frame. At a more typical orbitLen 5000 it is still ≈7 ms/frame.

**Proposed fix**

Three independent, cheap wins. (1) Don't recompute the reference orbit every draft frame: keep the current orbit while `_draft` is true and rebuild once on release (rebasing already makes a slightly stale reference correct, just less efficient), or gate the recompute on the centre having moved by more than a fraction of the view width. (2) Cache the level-0 BLAs — `singleStep`/`singleStepPoly` do not depend on `maxC`, only `mergeBLA` does — so a zoom-only change can reuse level 0, and a pan-only change (zoom unchanged) needs no radius change at all. (3) Build `ref` once into a reusable flat Float64Array-backed structure instead of allocating `orbitLen` tuples per rebuild, and use `texSubImage2D` into a pre-sized texture instead of reallocating with `texImage2D`.

### `cd-render-06` — `_perturbEscape2` silently falls back to |z|>2 for a non-radial escape, so perturbation renders a different escape criterion than the standard shader

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/complex-dynamics/src/render/glPlot.ts:799` | `UNVERIFIED` |

**Evidence**

Eligibility is decided from the map alone; the escape predicate is never consulted (:791-794):
```ts
    this._perturbEligible =
      (this._monicDegree !== null && this._monicDegree <= MAX_PERTURB_DEGREE) ||
      this._polyPerturb !== null;
```
and the bailout silently defaults when the probe cannot certify a radial test (:798-799):
```ts
    // Match the perturbation kernel's bailout to the map's actual escape radius (default |z| > 2).
    this._perturbEscape2 = this.probeEscapeRadius2() ?? 4.0;
```
`radialEscapeSq` returns null unless the threshold is the same in every probed direction (:154-159). The kernel then tests `if (dot(z, z) > uPerturbEscape2) { escaped = true; break; }` (shaderBuilder.ts:264) — a circle — while the standard program compiles and runs the user's actual predicate. Related: the CPU reference orbit hard-codes its own bailout at 4 (`const BAILOUT2 = 4;` in perturbation.ts:29 and perturbationPoly.ts:27) regardless of `_perturbEscape2`, so even a genuinely radial R > 2 truncates the stored orbit at |Z| > 2.

**Failure scenario**

Load the shipped `biomorph` preset: `f = "z^3+c"`, `escape = "if(abs(re(z))>10,true,abs(im(z))>10)"` (presets.ts:174-180). `_monicDegree = 3 ≤ 8` ⇒ `_perturbEligible = true`. `radialEscapeSq` bisects the +real axis to R = 10, then probes the diagonal at 1.1·R: z = (7.78, 7.78) has |Re| and |Im| both under 10, so the "just outside must escape" check fails and it returns null ⇒ `_perturbEscape2 = 4.0`. Tick "perturbation (deep zoom)": the picture changes — the box-escape lobes that make it a biomorph vanish (the kernel now uses a circular |z| > 2 bailout) and every escape count shifts, because a cubic that has just crossed |z| = 2 needs roughly one more step to leave the |Re|,|Im| ≤ 10 box. No warning is shown; the toggle is presented as a pure speed/precision option.

**Proposed fix**

Gate eligibility on a certified bailout: `this._perturbEligible = (…) && this.probeEscapeRadius2() !== null;` so a map whose escape is not a clean radial test falls through to the standard/df64 renderer, and surface the reason in the existing `perturbation-note` element (main.ts already toasts when the map is ineligible). Separately, thread `_perturbEscape2` into the reference-orbit builders instead of the hard-coded `BAILOUT2 = 4` in perturbation.ts / perturbationPoly.ts, so a radial R > 2 keeps a full-length reference rather than truncating at |Z| > 2 and losing the perturbation precision benefit through constant rebasing.

### `cd-render-07` — renderToImageData holds two full-size RGBA buffers at once, doubling peak export memory

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | memory | small | `apps/complex-dynamics/src/render/glPlot.ts:1964` | `UNVERIFIED` |

**Evidence**

The strips are read into one full-size buffer:
```ts
    const rowBytes = size * 4;
    const pixels = new Uint8Array(size * size * 4);
```
and then the whole thing is copied, flipped, into a second full-size buffer that lives simultaneously:
```ts
    // WebGL reads bottom-up; ImageData is top-down, so flip rows.
    const out = new Uint8ClampedArray(size * size * 4);
    for (let row = 0; row < size; row++) {
      const src = row * rowBytes;
      out.set(pixels.subarray(src, src + rowBytes), (size - 1 - row) * rowBytes);
    }
    return new ImageData(out, size, size);
```
`pixels` is only freed after `out` is fully populated, and the caller (`plotView.renderExportCanvas`) then does `ctx.putImageData(image, 0, 0)` into a third full-size surface plus an optional fourth overlay canvas.

**Failure scenario**

Select the 8000 px option in the export dropdown (index.html:1769) and export. Peak CPU memory is `pixels` 256 MB + `out` 256 MB simultaneously, on top of the 256 MB GPU RGBA8 export texture, the 256 MB destination canvas, the 256 MB overlay canvas when "overlays" is ticked, and the PNG blob from `toBlob`. On a mobile or 4 GB device this OOM-kills the tab; on desktop it triggers a long GC pause mid-export. Half of it — the 256 MB `pixels` staging buffer — is pure overhead.

**Proposed fix**

Read each strip into a small reusable scratch buffer (`STRIP` rows = 256 × size × 4, i.e. 8 MB at size 8000) and copy its rows straight into the flipped position in `out` inside the strip loop; drop `pixels` entirely. That removes one full-size allocation and also removes the second full-image pass at the end. If `mode === 5`, also consider shrinking `histoTex` back to the live size after the export, since `updateCdf(size, size)` reallocates it at export resolution and leaves it there.

### `cd-render-08` — "Find angles" re-traces every enumerated external ray from scratch on each click, with no memoization of a pure function

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | small | `apps/complex-dynamics/src/render/angleOfPoint.ts:113` | `UNVERIFIED` |

**Evidence**

```ts
function landAll(
  land: (p: number, q: number) => Vec2 | null,
  maxPeriod: number,
  maxPreperiod: number,
): Landed[] {
  const out: Landed[] = [];
  for (const angle of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const point = land(angle.p, angle.q);
    if (point) out.push({ angle, point });
  }
  return out;
}
```
Nothing is cached across calls, yet `parameterLanding(p, q)` depends on nothing but `(p, q)` and `dynamicalLanding(p, q, c)` on nothing but `(p, q, c)`. Each `parameterLanding` traces a full `parameterRay` (depth 28, up to 60 Newton steps with an O(m) inner orbit walk, rays.ts:50-79); for a periodic angle with no primary-bulb match it *also* traces a `dynamicalLanding` ray and runs `refineParabolicRoot`, and for every preperiodic angle it runs `findMisiurewicz` — 80 Newton iterations, each walking the tree-based AST evaluator `preperiod + period` times for both f and f′ (angleParameter.ts:131-146).

**Failure scenario**

Click a point on the parameter plane and press "Find angles" (main.ts:3335-3354, `maxPeriod: 6`): `enumerateLandingAngles(6, 2)` yields 420 distinct angles, whose raw parameter-ray tracing alone I measured at 34.5 ms in Node; adding the per-angle `findMisiurewicz` refine for the ~350 preperiodic angles (≈350 × 80 × 8 ≈ 224k tree-walking evaluator calls for f and f′) pushes the click well past a frame budget. On the dynamical plane (`maxPeriod: 8`) the enumeration is 1884 angles and the raw ray tracing alone measured 95.8 ms. All of it is synchronous on the main thread with no progress indication, and pressing the button twice repeats the identical work — the parameter-plane landings never change at all.

**Proposed fix**

Memoize `landAll` per (plane, bounds) and, for the dynamical plane, per `c` — a `Map` keyed by `"param:6:2"` / `"dyn:8:2:cx,cy"` holding the `Landed[]`. The parameter-plane table is a global constant of the app and can even be computed once lazily. Additionally, `nearestCluster` only needs the landing *positions*, so consider a two-pass form: trace the cheap ray seed for all angles, snap, and only run the expensive `findMisiurewicz` / `refineParabolicRoot` refinement for the handful of angles in the winning cluster.

### `cd-render-09` — `smallCDimension` is documented as "Exact" but is an O(|c|³) asymptotic

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `apps/complex-dynamics/src/render/juliaProperties.ts:51` | `UNVERIFIED` |

**Evidence**

The interface field doc claims exactness:
```ts
  /** Exact small-c Hausdorff dimension 1 + |c|²/(4 ln d); null unless monic and in the principal
   *  (period-1) cardioid, where the perturbative formula applies. */
  smallCDimension: number | null;
```
while the implementation comment 155 lines later says the opposite (:205-208): "Ruelle / Bodart–Zinsmeister small-|c| asymptotic, dim_H J_c = 1 + |c|²/(4 ln 2) + O(|c|³). … exact only at c = 0". main.ts:1784 does render it honestly as `≈ … (small-c)`, so today's UI label is fine.

**Failure scenario**

A future consumer of `JuliaProperties` (a worker readout, an export metadata field, a new panel) reads the field doc, believes the value is exact, and prints it with `=`. At c = 0.2 the formula gives 1.0144 while the true dim_H J_c differs in the third decimal — an estimate published as certified, which is precisely the failure mode this codebase treats as unacceptable.

**Proposed fix**

Change the field doc to match the implementation comment: "Small-|c| ASYMPTOTIC Hausdorff dimension 1 + |c|²/(4 ln 2) + O(|c|³) — an estimate, exact only at c = 0; null unless d = 2 and c is in the principal cardioid." Consider renaming the field `smallCDimensionEstimate` so the type itself carries the caveat to every consumer.

### `cd-render-10` — `traverseBLA` claims to be the canonical mirror of the GPU kernel but hard-codes the degree-2 step and a bailout of 4

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | small | `apps/complex-dynamics/src/render/bla.ts:182` | `UNVERIFIED` |

**Evidence**

The doc states it is "the **canonical BLA render loop** for one perturbed pixel — the reference the GPU kernel (D2b) mirrors", but the body is z²+c only:
```ts
    if (z[0] * z[0] + z[1] * z[1] > 4) return { iters: k, escaped: true, z };
...
      // Single perturbation step: δz ← 2·Z·δz + δz² + cAdd.
      dz = [
        2 * (Z[0] * dz[0] - Z[1] * dz[1]) + (dz[0] * dz[0] - dz[1] * dz[1]) + cAdd[0],
        2 * (Z[0] * dz[1] + Z[1] * dz[0]) + 2 * dz[0] * dz[1] + cAdd[1],
      ];
```
The shipped kernel it claims to mirror supports d = 2…8 and general-polynomial mode via `perturbStep` (shaderBuilder.ts:189-218) and takes its bailout from `uPerturbEscape2` (shaderBuilder.ts:264). Meanwhile `buildBLATable(ref, maxC, degree)` and `buildBLATablePoly` in the same file *do* support those cases. A grep confirms `traverseBLA` has no production caller — only `test/bla.test.ts`; the degree-3/4/5 tests use their own local `truePerturbMultibrot` instead.

**Failure scenario**

A maintainer adding a regression test for a degree-5 multibrot or for a `polyMode` map reaches for the function advertised as the canonical reference, feeds it a degree-5 BLA table from `buildBLATable(ref, maxC, 5)`, and gets escape counts computed with a quadratic step and a |z|>2 bailout. The test either fails confusingly or — worse — passes against a wrong oracle and blesses a genuine kernel bug.

**Proposed fix**

Either generalise it to match the shipped kernel (take `degree`/`coeffs`/`dcCoeff` and an `escape2` argument, delegating the step to `multibrotStep`/`polyStep` from perturbationPoly.ts), or narrow the contract: rename it `traverseBLAQuadratic`, drop the "canonical … the GPU kernel mirrors" claim, and state that it covers z²+c with |z|>2 only. Also note that the `if (levels.length === 0)` early-return in glPlot's `ensureBLA` (:1314-1317) is unreachable — `buildTree` always returns at least one level once `orbitLen ≥ 2`, which the guard above already ensures — and it would leave `blaDirty` true (rebuilding every frame) if it ever were reached.

### `cd-render-11` — `restoreContext` nulls the histogram handles twice

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/complex-dynamics/src/render/glPlot.ts:564` | `UNVERIFIED` |

**Evidence**

Lines 564-566 already clear them:
```ts
    this.histoFbo = null;
    this.histoTex = null;
    this.cdfTex = null;
```
and lines 596-598 repeat the identical three assignments under a comment that reads as if it were the first time:
```ts
    // Histogram pre-pass resources were lost with the context; drop the stale handles
    // and invalidate the CDF cache so it rebuilds against the restored context.
    this.histoTex = null;
    this.histoFbo = null;
    this.cdfTex = null;
```

**Failure scenario**

No runtime effect — both writes are idempotent. The cost is maintenance: the function is a long flat list of ~30 field resets whose completeness is checked by eye, and a duplicated triple makes it harder to see which fields are covered. A future field added next to the first block would look covered by the second comment and vice versa (the neighbouring `blaNumLevels`, `blaWidth` and `blaBuiltZoom` are in fact never reset here — harmless today only because `ensureBLA`'s `orbitXY`/`blaDirty` guards happen to cover it, which is exactly the kind of accidental coverage a tidier reset would make obvious).

**Proposed fix**

Delete the second block (keep the explanatory comment on the first), and add `this.blaNumLevels = 0; this.blaWidth = 0; this.blaBuiltZoom = 0;` so the BLA state is explicitly reset rather than relying on the `orbitXY === null` guard in `ensureBLA`.

---

## Scope: corr — the Correspondences app

**Reviewer's summary of what was read and overall impression:**

Cross-cutting performance/memory pass over all three apps and the five shared packages. I read the real hot paths rather than sampling: CD's `render/glPlot.ts` (render loop, progressive ladder, temporal-AA accumulation, `ensureOrbit`/`ensureBLA`/`updateCdf`, texture + FBO lifecycle), `render/bla.ts`, `render/overlay.ts` (all seven overlay caches), `render/plotView.ts` (pointer/wheel/draft handling), `render/rays.ts`, `render/juliaProperties.ts` + `juliaMetricsClient.ts`; QD's Schwarz stack (`schwarz-render.mjs` pyramid, `schwarz-paint.mjs`, `schwarz-cpu-worker.mjs`, `workers/schwarz-worker-entry.mjs`, `schwarz-webgl.mjs`, `schwarz-interaction.mjs`, `schwarz-features.mjs`/`schwarz-forward.mjs`), `sphere/sphere-webgl.mjs`, `ui-domain-plot.mjs`, `param-slice/*` (pool + adaptive renderer), `solver.mjs` self-intersection/boundary paths, and `algebra/algebra-ui.mjs` / `algebra-store.mjs` / `algebra-canvas.mjs`; correspondences' `main.ts`, `correspondenceRender.ts`, `orbitTree.ts`, `gpu.ts`/`paramGpu.ts`, and the whole `mating/` set; plus `@cas/gpu/shader.ts`, `@cas/expr/evaluate.ts`, `@cas/core/durand-kerner.ts`, `@cas/exact`. Overall health is genuinely good and clearly the product of prior optimization passes: rAF coalescing, dirty flags, WeakMap memoisation, transferable worker payloads, a packed exponent-vector Gröbner kernel, spatial-grid self-intersection, bucketed phi caches, and bounded caches are all already in place, and I found no unbounded cache growth and no WebGL resource leaks. The remaining inefficiency is concentrated in three places: (1) redundant recomputation of *static* per-pixel layers across progressive chunks, (2) small-object allocation inside per-pixel and per-frame loops that could use scratch buffers, and (3) per-frame rebuild + re-upload of GPU tables whose inputs only partly changed. I deliberately avoided the QD exact-algebra kernel (six closed review passes; the packed kernel already removes the `monoKey`/`monoCmp` churn I would otherwise have flagged) and did not propose any TS migration, package extraction, or app merging.

### `corr-density-01` — densityToImage recomputes the static deltoid K-mask (256-gon ray cast) for every background pixel on all 22 progressive chunks

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | performance | small | `apps/correspondences/src/correspondenceRender.ts:136` | `UNVERIFIED` |

**Evidence**

Inside the per-pixel colorize loop of `densityToImage`:

```ts
      if (dens[i] > 0) {
        [r, g, b] = heat(Math.log(1 + dens[i]) * norm);
      } else {
        const wx = view.centerX + ((px + 0.5) / W - 0.5) * 2 * view.halfSpan * aspect;
        if (pointInPolygon([wx, wy], BOUNDARY)) {
```

`BOUNDARY` is `deltoidBoundary(256)` (module constant, line 15) and `pointInPolygon` (apps/correspondences/src/deltoid.ts:189) is an O(256) ray cast with a float division per edge. The K-shading it produces depends only on (W, H, view) — all three are constant for the whole render — yet `densityToImage` is called once per progressive chunk from apps/correspondences/src/main.ts:191 (`densityToImage(density, image, DEFAULT_VIEW, isFinal);`). Each call also allocates a fresh `[wx, wy]` tuple per background pixel.

**Failure scenario**

Loading apps/correspondences (index.html) with the shipped constants — `CORR = 380` (main.ts:22) and `DEFAULT_DENSITY.seedGrid = 64` with `sy1 = Math.min(opts.seedGrid, sy + 3)` (main.ts:187) — runs 22 chunks. The canvas is 380² = 144,400 pixels; for the first several chunks essentially every pixel still has zero density, so each `densityToImage` call performs ~144,400 × 256 ≈ 37 M polygon-edge tests (each with a divide) plus ~144,400 `[wx, wy]` array allocations. Across the 22 chunks that is ~800 M edge tests and ~3.2 M throwaway tuples — on the order of seconds of main-thread CPU — to redraw a background layer that is byte-identical every single time. The user sees the correspondence panel take far longer to finish than the orbit-tree accumulation itself costs.

**Proposed fix**

Compute the K mask once into a `Uint8Array(W*H)` (memoised on W/H/view identity, e.g. a module-level `let kMaskKey/kMask`) and replace the per-pixel `pointInPolygon([wx, wy], BOUNDARY)` with an index lookup `kMask[i]`. That also removes the per-pixel `[wx, wy]` allocation and the now-unneeded `wx` computation in the loop. Output is bit-identical.

### `qd-paintfield-01` — Schwarz CPU field painter allocates a 3-element RGB array per pixel via colormap()/interpStops()

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | performance | trivial | `apps/quadrature-domains/app/schwarz/schwarz-paint.mjs:132` | `UNVERIFIED` |

**Evidence**

`paintField` (line 111) per-pixel body:

```js
      else if (kind === KIND_FUND + 1) {
        const t = cpuComputeT(n, maxIter, sState.grid.scaleMode, sState.grid.modK);
        const c = colormap(cmap, t);
        r = c[0]; g = c[1]; b = c[2];
      }
```

and `interpStops` (line 855) returns a freshly built array on every call:

```js
    return [
      Math.round(a[0] + (b[0] - a[0]) * u),
      Math.round(a[1] + (b[1] - a[1]) * u),
      Math.round(a[2] + (b[2] - a[2]) * u),
    ];
```

The surrounding code already goes to trouble to avoid churn — `ensureOffscreen` (line 103) caches the ImageData explicitly "avoids allocating a few MB on every paint during the progressive pyramid passes" — but the per-pixel colour path defeats that.

**Failure scenario**

Select the Schwarz tab with a PQD family (which forces `activeRenderer() === 'cpu'`, schwarz-render.mjs:71) and Resolution = 768 (schwarz-ui.mjs:943). The field is 768×768 = 589,824 cells, most of them KIND_FUND. `paintAll()` → `paintField()` is invoked once per ~14 ms rAF slice of the in-process pyramid (schwarz-render.mjs:247-250 `if (performance.now() - tStart > 14) { requestAnimationFrame(chunk); paintAll(); return; }`) and once per worker pass (schwarz-render.mjs:175). That is ~70 paints/second, each allocating up to 589,824 three-element arrays — ~41 M short-lived arrays per second of rendering (roughly 1.6 GB/s of nursery traffic). The result is GC pauses that make the progressive pyramid visibly stutter, on top of the escape-time work it is supposed to be displaying.

**Proposed fix**

Give the colour path an out-parameter: add a module-level `const _rgb = [0, 0, 0];` and have `interpStops(t, stops, out)` write into it (`colormap` forwards `out`), so `paintField` reads `_rgb[0..2]` with zero allocation. Byte-identical output. Optional further win: since the destination is 8-bit anyway, build a 256-entry `Uint8Array` LUT once per `paintField` keyed on (cmap, scaleMode, maxIter, modK) and index it by escape count — but the out-parameter alone removes the allocation without changing a single pixel.

### `cd-bla-01` — Perturbation BLA table is fully rebuilt and re-uploaded (≈1 MB texImage2D) on every zoom-changed frame, including the maxC-independent level 0

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | performance | medium | `apps/complex-dynamics/src/render/glPlot.ts:1305` | `UNVERIFIED` |

**Evidence**

```ts
    if (!this.blaDirty && this._zoom === this.blaBuiltZoom && this.blaNumLevels > 0) return;
    const gl = this.gl;
    const ref: Complex[] = new Array(this.orbitLen);
    for (let i = 0; i < this.orbitLen; i++) ref[i] = [this.orbitXY[2 * i], this.orbitXY[2 * i + 1]];
    const maxC = Math.SQRT2 / this._zoom; // largest |δc| over the viewport (a corner pixel)
```
…then `const packed = packBLATable(levels, Math.min(this.maxTextureSize, 2048));` (line 1318) and a full `gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, packed.width, packed.height, 0, gl.RGBA, gl.FLOAT, packed.data)` (line 1321).

The guard keys on `this._zoom`, and every wheel tick assigns `this.plot.zoom = newZoom` (plotView.ts:735) → `scheduleRender()` → `orbitDirty = true` → `ensureOrbit` sets `this.blaDirty = true` (line 1272). Crucially, `maxC` only enters `mergeBLA` (bla.ts:102); the level-0 table built by `singleStep`/`singleStepPoly` (bla.ts:129/143) does not depend on it at all, so on a zoom-only change the entire level 0 is recomputed to identical values. `packBLATable` also allocates a fresh `new Float32Array(width * height * 4)` every call (bla.ts:255).

**Failure scenario**

Enable perturbation deep zoom on the parameter plane and wheel-zoom continuously at a depth where auto-iterations has pushed the reference orbit to the `maxTextureSize` cap (`refIter = Math.min(maxIter, this.maxTextureSize)`, line 1245 — typically 16384). Each rAF frame of the gesture rebuilds: 16,384 `Complex` tuples for `ref`; ~32,764 BLA objects across the binary tree, each holding two more 2-element arrays (~115,000 objects per frame, ≈7 M objects/s at 60 fps); a fresh 2048×33 RGBA32F `Float32Array` of 270,336 floats (1.08 MB) in `packBLATable`; and a full `texImage2D` *storage reallocation* plus 1.08 MB upload per frame (≈65 MB/s of driver traffic). All of this sits directly in the frame path that is already the tightest in the app.

**Proposed fix**

Three independent changes, all behaviour-preserving: (1) drop the `ref: Complex[]` materialisation — pass `this.orbitXY` + `this.orbitLen` into `buildBLATable`/`buildBLATablePoly` and index the flat Float32Array; (2) cache the level-0 array on the orbit (it is `maxC`-independent) and, when only `_zoom` changed, re-run just `buildTree(level0, maxC)`; (3) keep a reusable packed `Float32Array` and swap `texImage2D` for `texSubImage2D` whenever `packed.width`/`packed.height` match the currently allocated texture, so the GPU storage is allocated once instead of every frame.

### `qd-dc-imagedata-01` — paintDomainColoring allocates a fresh ImageData and re-copies the buffer on every paint, despite the comment claiming it is cached

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | memory | trivial | `apps/quadrature-domains/app/schwarz/schwarz-paint.mjs:672` | `UNVERIFIED` |

**Evidence**

```js
  // S5 / F6: paint domain-coloring field into the canvas. Caches an
  // offscreen W×H ImageData and stretches to the current viewport.
  let _dcOffCanvas = null, _dcOffCtx = null;
  function paintDomainColoring() {
    ...
    const img = _dcOffCtx.createImageData(dc.W, dc.H);
    img.data.set(dc.buf);
    _dcOffCtx.putImageData(img, 0, 0);
```

Only the *canvas* is cached (lines 666-671); the ImageData is recreated and the whole buffer re-copied every call. `dc.buf` only changes when `_recomputeDomainColoring` runs, which is debounced to 120 ms (schwarz-interaction.mjs:213-217) and produces a fixed 256×256 field (schwarz-features.mjs:46).

**Failure scenario**

Switch the Schwarz tab to domain-coloring mode and wheel-zoom or pan. `liveDomainColoringRepaint` schedules `paintAll()` once per animation frame (schwarz-interaction.mjs:208-211), and `paintAll` → `paintDomainColoring`. At W=H=256 that is a fresh 256 KB `ImageData` allocation plus a 256 KB `TypedArray.set` copy plus a `putImageData` upload every frame — ~15 MB/s of garbage and ~15 MB/s of pointless copying at 60 fps — for a buffer that is guaranteed unchanged between the debounced recomputes. During the gesture the only thing that actually varies is the `drawImage` destination rect.

**Proposed fix**

Cache the ImageData next to `_dcOffCanvas` (allocate it in the same `if` that creates the canvas), and only run `img.data.set(dc.buf); putImageData(...)` when `sState.domainColor` is a different object than the one last blitted (store `_dcLastBuf = dc.buf`). The pan/zoom path then costs exactly one `drawImage`.

### `cd-overlay-01` — The whole 2D overlay is redrawn from afterRender on every progressive and temporal-accumulation frame, even when none of its inputs changed

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | small | `apps/complex-dynamics/src/render/plotView.ts:114` | `UNVERIFIED` |

**Evidence**

```ts
    this.plot.afterRender = () => this.drawOverlay();
```

`drawOverlay()` (plotView.ts:380) has no change detection — it unconditionally calls the full `drawOverlay(this.octx, {...})`. Meanwhile `GLPlot.render()` fires `this.afterRender?.()` on every path: the preview warp (glPlot.ts:1840), each accumulation frame (glPlot.ts:1851), and each progressive rung (glPlot.ts:1885), with `renderAccumulate` re-arming itself up to `MAX_ACCUM = 16` (glPlot.ts:257, 1931) and the ladder `PROGRESSIVE_LADDER = [0.5, 1.0]` (glPlot.ts:254) giving two passes. Across those frames the overlay inputs (center, zoom, c, size, toggles) are identical by construction — only the GPU jitter changes.

**Failure scenario**

Turn on temporal anti-aliasing and the inverse-Julia cloud, then release a pan on the dynamical plane. The view settles and `renderAccumulate` runs 16 frames; each one re-invokes `drawOverlay`, which in `drawInverseJulia` (overlay.ts:503-507) issues 12,000 `plotToPx` calls (one `Vec2` allocation each) and up to 12,000 individual `ctx.fillRect` calls. That is ~192,000 fillRects and ~192,000 array allocations — on the order of 20 ms of main-thread canvas work — to redraw 16 pixel-identical overlays. Even without accumulation, the two-rung progressive ladder doubles every overlay redraw.

**Proposed fix**

Give `PlotView` an overlay content key built from the values it already passes into `drawOverlay` (center, zoom, size, c, paramA, nplot, and the boolean/array toggles), store it after each draw, and early-return from `drawOverlay()` when it is unchanged and the 2D canvas has not been resized. A cheap subset fix: in the `afterRender` hook, skip the redraw when `plot` reports `accumCount > 1`.

### `cd-invjulia-01` — c-keyed overlay caches (inverse-Julia cloud, Siegel curves, portrait rays) miss on every frame of a coupled parameter drag and are fully recomputed at 60 Hz

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | small | `apps/complex-dynamics/src/render/overlay.ts:481` | `UNVERIFIED` |

**Evidence**

```ts
const invJuliaCache = { key: "", pts: [] as Vec2[] };
function cachedInverseJulia(c: Complex): Vec2[] {
  const key = `${c[0]},${c[1]}`;
  if (invJuliaCache.key !== key) {
    invJuliaCache.key = key;
    invJuliaCache.pts = inverseJuliaCloud(c, 12000, 30, 1);
  }
  return invJuliaCache.pts;
}
```

The same c-keying appears in `cachedSiegelCurves` (line 513) and `cachedPortraitRay` (`const ck = `${c[0]},${c[1]}:${depth}`; ... portraitRayCache.clear();`, line 446). The comments correctly note these are "view-independent (depends only on c)" — but on the dynamical plane during a coupled drag, c is exactly what is changing. `coupling.setC` (main.ts:982) → `setCValue` → `invalidateInteractionPreview()` + `scheduleRender()` (glPlot.ts:2094-2101); `invalidateInteractionPreview` sets `lastFrameValid = false`, so `canUsePreview()` is false and the frame goes through a real render → `afterRender` → `drawOverlay`.

**Failure scenario**

With the inverse-Julia overlay enabled, drag the parameter point on the parameter plane (the coupled drag). Every frame the dynamical overlay redraws with a new c, `invJuliaCache.key` misses, and `inverseJuliaCloud(c, 12000, 30, 1)` re-runs its full 12,030-step random-preimage walk — a complex `sqrt` plus ~4 array allocations per step, ~48,000 allocations and 12,030 `Math.hypot`-class operations per frame, i.e. ~2.9 M allocations/s at 60 fps, all on the main thread and all discarded. With the orbit portrait on, `portraitRayCache.clear()` additionally forces every displayed dynamic ray to be re-traced by Newton continuation each frame (rays.ts:87-115). The drag becomes visibly janky exactly when the user is trying to scrub c smoothly.

**Proposed fix**

`PlotView` already knows it is mid-coupled-drag — `coupling.setDraft` (main.ts:989) sets `coupledDrafting`. Thread that flag into `OverlayParams` and, while drafting, either skip the c-dependent clouds entirely or reuse the last computed cloud (draw it at the stale c and mark nothing), then recompute once on release in the existing `if (!on) refreshDynPanels()` branch. This mirrors the policy the QD domain plot already uses for its vector field (`ui-domain-plot.mjs:_vfInteracting` / `_settleVectorField`).

### `qd-ctxmenu-leak-01` — Every algebra context-menu interaction leaks a permanent capture-phase document pointerdown listener

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | memory | trivial | `apps/quadrature-domains/app/algebra/algebra-ui.mjs:2902` | `UNVERIFIED` |

**Evidence**

```js
      setTimeout(() => {
        const off = (ev) => { if (_ctxMenu && !_ctxMenu.contains(ev.target)) { closeNodeMenu(); document.removeEventListener('pointerdown', off, true); } };
        document.addEventListener('pointerdown', off, true);
      }, 0);
```

`closeNodeMenu` (line 2842) tears down the DOM and nulls `_ctxMenu` but never removes `off`:
```js
    function closeNodeMenu() {
      if (!_ctxMenu) return;
      _ctxMenu.remove(); _ctxMenu = null;
```
and it is reached from three routes that all bypass the removal: a menu-item click (line 2870), the Escape/Tab key handler (line 2895), and the `closeNodeMenu()` at the top of `openNodeMenu` (line 2853).

**Failure scenario**

Right-click an equation card in the algebra workspace and pick any action. The `pointerdown` that lands on the menu item fires while `_ctxMenu` is still set and `_ctxMenu.contains(ev.target)` is true, so `off` does nothing and is not removed; the subsequent `click` then runs `closeNodeMenu()` and nulls `_ctxMenu`, after which `off`'s `_ctxMenu && …` guard short-circuits forever and the listener can never remove itself. Only the 'click outside the menu' dismissal path ever unregisters. A working session that opens the node menu 200 times — routine in this workspace — leaves 200 permanently attached capture-phase listeners, so every pointerdown anywhere in the app (including canvas drags, which fire them at pointer rate) dispatches 200 dead closures before the real handlers run.

**Proposed fix**

Hoist the handler to a module-scoped `let _ctxOff = null;`, assign it when installing, and remove it unconditionally at the top of `closeNodeMenu()`: `if (_ctxOff) { document.removeEventListener('pointerdown', _ctxOff, true); _ctxOff = null; }`. Keep the existing self-removal too, or drop it since `closeNodeMenu` now owns the lifetime.

### `corr-orbittree-01` — expandOrbitTree allocates two wrapper objects and runs a comparator sort per node for a 2-element branch list; orbitPoints copies the whole node array again

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | small | `apps/correspondences/src/orbitTree.ts:51` | `UNVERIFIED` |

**Evidence**

```ts
    const children = corr.branches(node.point);
    const ordered = children
      .map((p) => ({ p, arg: Math.atan2(p[1], p[0]) }))
      .sort((a, b) => a.arg - b.arg);
```
and line 69:
```ts
  return expandOrbitTree(corr, seed, opts).map((n) => n.point);
```

The deltoid correspondence is 2:2 (`DELTOID_CORRESPONDENCE`), so `children.length` is 2 in the overwhelming majority of nodes — `Array.prototype.sort` with a JS comparator is an order of magnitude more expensive than the single comparison it performs. `orbitPoints` then throws away the node objects it just built, after allocating a second array of the same length.

**Failure scenario**

The correspondence density render (`accumulateBand`, correspondenceRender.ts:65) expands one tree per seed over a `seedGrid: 64` grid = 4,096 seeds, each capped at `maxNodes: 220` — up to ~900,000 nodes per render. Each node allocates 2 `{p, arg}` wrappers plus the intermediate `map` array plus the sorted array, and invokes `Array.prototype.sort` with a comparator (~900,000 comparator-driven sorts on 2-element arrays). On top of that, `orbitPoints` allocates a second ~220-entry array per seed. That is several million avoidable allocations and ~100–200 ms of pure sort overhead added to a render that is already the slowest panel on the page.

**Proposed fix**

Special-case the common width: when `children.length === 2`, compute the two `atan2` values and push in order directly (no wrappers, no `sort`); fall back to the existing map+sort only for length > 2. Separately, add an `orbitPointsInto(corr, seed, opts, sink)` (or have `accumulateBand` iterate `expandOrbitTree(...)` and read `n.point` directly) so the `.map(n => n.point)` copy disappears.

### `cd-metricsworker-01` — JuliaMetricsClient.disableWorker drops the Worker reference without terminating it, leaking the thread

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | memory | trivial | `apps/complex-dynamics/src/render/juliaMetricsClient.ts:65` | `UNVERIFIED` |

**Evidence**

```ts
  /** Drop the worker and re-run the in-flight request on the main thread (worker became unusable). */
  private disableWorker(): void {
    this.worker = null;
    if (this.last && this.cb) this.cb(runSync(this.last));
  }
```

This is the `onerror` path (line 48: `this.worker.onerror = (): void => this.disableWorker();`). Setting the field to `null` drops the only reference the client holds, but a live `Worker` is a GC root of its own — the OS thread and its module graph stay resident for the lifetime of the page.

**Failure scenario**

The metrics worker fails to load or throws (e.g. a module-worker load failure behind a strict CSP, or a transient runtime error inside `computeJuliaImageMetrics`). `disableWorker` runs, the client silently falls back to synchronous compute — correct behaviour — but the worker thread plus its imported `@cas/expr` parser and `juliaProperties` module graph is never reclaimed. One leaked thread per client instance; permanent for the session.

**Proposed fix**

Terminate before dropping: `try { this.worker?.terminate(); } catch { /* ignore */ } this.worker = null;`. Also clear `onmessage`/`onerror` so the closure over `this` is released.

### `qd-fillcoarse-01` — The in-process Schwarz pyramid runs fillFromCoarseSamples on the stride-1 pass, a full W·H no-op scan

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | performance | trivial | `apps/quadrature-domains/app/schwarz/schwarz-render.mjs:255` | `UNVERIFIED` |

**Evidence**

At the end of every `chainPass`, unconditionally:
```js
      // After this pass: fill in any cells skipped by larger stride with the
      // nearest sampled value (for the coarse-display effect).
      fillFromCoarseSamples(stride);
```
but `_renderCpuPyramid` chains strides `4 → 2 → 1` (lines 137-139), and after the stride-1 pass every cell has `fieldKind[idx] !== 0`, so `fillFromCoarseSamples` (line 264) walks all W·H cells and does nothing. The worker-fed path already gets this right — `if (m.stride > 1) fillFromCoarseSamples(m.stride);` (line 174).

**Failure scenario**

On a browser where `QD.SchwarzCpuWorker.isUsable()` is false (file:// or no Worker support, schwarz-cpu-worker.mjs:99-104) the in-process pyramid runs. At Resolution 768 the final pass ends with a 589,824-iteration double loop plus a modulo per cell that writes nothing — a pointless main-thread scan at exactly the moment the render is supposed to be finishing.

**Proposed fix**

Mirror the worker path: `if (stride > 1) fillFromCoarseSamples(stride);` at line 255.

### `corr-mating-render-01` — Mating explorer re-renders all three panels on every pointermove without rAF coalescing, and the σ panel adds a 360-sample linear search per event

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | performance | trivial | `apps/correspondences/src/mating/matingMain.ts:169` | `UNVERIFIED` |

**Evidence**

```ts
    p.canvas.addEventListener("pointermove", (e) => {
      orbitToken++; // moving cancels any running orbit and resumes hover
      state.orbit = null;
      state.theta = pointerTheta(p, e);
      render();
    });
```
`render()` (line 61) loops all three panels doing `clearRect` + `drawImage(p.base)` + `overlay(...)` at `SIZE` = 380. And for the σ panel, `pointerTheta` → `pointerToTheta` does a brute-force scan (matingView.ts:213-221):
```ts
  for (let i = 0; i < 360; i++) {
    const th = (i / 360) * 2 * Math.PI;
    const q = DELTOID.evalPhi([Math.cos(th), Math.sin(th)]);
```
There is no rAF coalescing anywhere on this path — unlike the equivalent QD surface, which explicitly coalesces (`ui-domain-plot.mjs:306`, "Coalesces bursts of render() calls … into a single paint per animation frame").

**Failure scenario**

Sweep the pointer across the σ panel with a 120 Hz mouse or trackpad. Each of the ~120 events per second runs 360 `evalPhi` evaluations (each allocating a `[cos, sin]` tuple and a result tuple) and then three full-canvas composites — 3 × 380² ≈ 433,000 pixels blitted per event, ~52 Mpx/s — of which at most half the frames can ever be displayed. The panels feel laggy under fast hover for work that is thrown away.

**Proposed fix**

Wrap `render()` in the same rAF-coalescing guard used by `QD_UI.DomainPlot.render` (a `_renderScheduled` flag plus a single `requestAnimationFrame` that calls the real `_renderNow`). Optionally precompute the 360 deltoid boundary samples once into a module constant so `pointerToTheta` becomes a lookup-and-compare instead of 360 `evalPhi` calls.

---

## Scope: corr-claims — Correspondences mathematical claims + labeling

**Reviewer's summary of what was read and overall impression:**

I read essentially all of `apps/correspondences` — every file under `src/` (deltoid.ts, correspondence.ts, orbitTree.ts, correspondenceRender.ts, render.ts, gpu.ts, family.ts, paramPlane.ts, paramGpu.ts, tricorn.ts, main.ts, exact/*, models/idealTriangleGroup.ts, mating/*) and all 16 files under `test/`, plus index.html, mating.html, vite.config.ts, package.json, README.md, and the two `@cas/core` modules it leans on (algebra.ts, durand-kerner.ts). I then ran a throwaway Vitest harness (since deleted) inside the app to measure every claim before reporting it: CPU-vs-GPU σ agreement over the real 560² render grid, orbit-level classification agreement, parameter-plane body composition, orbit-tree depth/node caps, render timings, boundary-polygon fidelity, and σ's action on the deltoid curve.

Overall health is genuinely good. The core σ engine is the strongest part: the cold-seed Newton plus exact Durand–Kerner fallback never once landed on the wrong branch across 71,406 in-Ω probes, and GPU-vs-CPU orbit classification matched on 36,449/36,449 pixels. The exact ℚ(i) correspondence-curve layer is clean and well-pinned (`2w² − z̄²w − z̄`, cusp locus `z̄⁴ + 8z̄`), the coarse 256-gon boundary disagrees with a 4096-gon on only 2/160,000 pixels, GPU contexts are deliberately page-lifetime with the orphan path releasing via `WEBGL_lose_context`, `tupleAlgebra.div`'s throw-on-zero is never reached (0 throws over a full parameter sweep), and the orbit tree is finite, deterministic and NaN-free. Test coverage of the math engines is unusually thorough for a 4k-line app.

The problems cluster where the code stops computing and starts *asserting*. Two claims fail: a false univalence theorem shown to the user with the word "proven", and a parameter-plane "connectedness body" that is measurably the disk |a| ≤ 1 produced by undefined orbits rather than bounded ones. Three more are labeling/perf issues around the σ render and the mating page. The straightening story itself is handled well — `tricorn.ts` explicitly ships no a↦c map and says so loudly; the honest-labeling failures here are in the *family/univalence* claims, not in straightening.

EXTENSIONS (brief, not filed as findings): (1) the σ dynamical plane has no interaction at all — a click-to-seed orbit overlay reusing `escapeTime` would make the tiling/limit-set structure legible; (2) `paramPlane` has no click-through to a dynamical plane for the chosen a, though `familyMember(a)` already supplies everything needed; (3) `expandOrbitTree` returns `parent`/`label` edges that no renderer draws — a single-seed tree view would use the structure that is already computed and tested; (4) `deltoidBranchPoints()` is recomputed on both call sites in `main.ts` and would be worth memoizing if a third consumer appears; (5) `orbitTree.ts`'s argument-ordered labels are the natural place to later hang the deferred analytic branch continuation (RISKS §3), and the existing `label` field already carries the slot.

### `corr-univalence-01` — The "φ_a univalent for |a| ≤ √2" claim is false, is shown to the user as "proven", and is load-bearing for a shader guard

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/correspondences/src/family.ts:5` | `UNVERIFIED` |

**Evidence**

family.ts:5 — `// area theorem (Σ n|bₙ|² = |a|²/2 ≤ 1) keeps φ_a univalent on {|z|>1} for |a| ≤ √2, so the deltoid sits`

This uses the area theorem backwards. Σ n|bₙ|² ≤ 1 is a NECESSARY condition for univalence, never sufficient. The claim propagates verbatim into two user-visible captions:

main.ts:220 — `` `≈ exploratory — not a certified connectedness locus (φ_a proven univalent only for |a| ≤ √2).`, ``
main.ts:237 — `` `(φ_a proven univalent only for |a| ≤ √2).`, ``

and into the justification for a shader branch guard:

paramGpu.ts:69-71 — `// Exterior branch only: φ_a is univalent on {|z|>1} for the entire family window (area theorem, // |a| ≤ √2), so a preimage inside the closed unit disk is the WRONG branch.`

and a test comment, gpuAgreement.test.ts:121 — `// The deltoid plus three off-axis members inside the univalence window |a| ≤ √2.`

The true range is |a| ≤ 1: φ_a'(z) = 1 − a/z³ vanishes at |z| = |a|^{1/3}, which is > 1 as soon as |a| > 1, so φ_a is not even locally injective on {|z|>1} there. The code already computes exactly those points — `criticalPoints(a)` returns ζ_k = a^{1/3} — so the module contradicts its own univalence claim.

**Failure scenario**

Take a = 1.2, comfortably inside the asserted window (|a| = 1.2 < √2 ≈ 1.4142). Measured with the app's own engine: `criticalPoints([1.2,0])[0] = [1.0626585691826111, 0]`, `evalPhiDeriv` there = `[1.11e-16, 0]`, so φ_{1.2} has a critical point strictly inside the claimed domain of univalence. An explicit collision follows: z1 = 1.1126585691826112 and z2 = 1.0156098630676487 are 0.097049 apart, both with |z| > 1, and |φ_{1.2}(z1) − φ_{1.2}(z2)| = 2.22e-16. A reader of the parameter-plane caption is told this is "proven" and will trust the picture over the whole |a| ≤ √2 annulus, where the exterior branch of φ_a⁻¹ that σ_a is built on is not even well defined.

**Proposed fix**

Replace the claim everywhere with the provable one: φ_a' = 1 − a/z³ is zero-free on {|z|>1} exactly when |a| ≤ 1, and (via φ_a(z1) − φ_a(z2) = (z1−z2)[1 − (a/2)(z1+z2)/(z1²z2²)], whose bracket is nonzero for |z1|,|z2| > 1 when |a| ≤ 1) φ_a is univalent there; the area theorem contributes only the necessary bound |a| ≤ √2. Update family.ts:5, main.ts:220, main.ts:237, paramGpu.ts:69-71 and gpuAgreement.test.ts:121, and drop the word "proven" from anything covering |a| > 1. Note that `DEFAULT_PARAM_VIEW` spans |a| up to ≈ 3, i.e. well past even the false bound, so the caption should say the picture is outside any univalence guarantee over most of its area.

### `corr-param-body-02` — The parameter plane's "connectedness body" is the disk |a| ≤ 1, produced by counting an UNDEFINED critical orbit as bounded

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | medium | `apps/correspondences/src/family.ts:98` | `UNVERIFIED` |

**Evidence**

family.ts:96-102 —
```
  for (let n = 1; n <= maxIter; n++) {
    const next = schwarz.sigma(w);
    if (!next) return maxIter;
    w = next;
    if (!A.isFinite(w) || A.abs(w) > escapeR) return n;
  }
  return maxIter;
```
A `null` from `sigma` at n = 1 — i.e. the marked point is not in Ω_a at all — is indistinguishable from "iterated 48 times without escaping". Both return `maxIter`, and `paramFieldToImage` (paramPlane.ts:74) paints `n >= maxIter` as the dark body.

The marked point is chosen by family.ts:9-11 — `// their images m_k = φ_a(ζ_k) = 1.5·a^{1/3}·{1,ω,ω²} are the CUSPS — the critical values of the Schwarz // reflection σ_a` — and family.ts:67 `return criticalPoints(member.a).map((z) => member.schwarz.evalPhi(z));`. For |a| < 1, ζ_k = a^{1/3} has |ζ| < 1, i.e. it is OUTSIDE φ_a's domain {|z|>1}: it is not a critical point of the conformal map, its image is not a cusp of ∂Ω_a, and m_k lands inside K_a.

User-visible caption, main.ts:219 — `` `Dark body ≈ critical/cusp orbits bounded (a=1 deltoid, a=0 disk); exterior by escape speed. ` ``

**Failure scenario**

Measured with the app's own `familyMember`/`criticalEscape` at DEFAULT_PARAM_OPTIONS: for a = 0.2, 0.5, 0.9 and 0.5+0.5i, all three `sigma(m_k)` return null on the FIRST step (|ζ| = 0.585, 0.794, 0.966, 0.891 — all inside the unit disk), and `criticalEscape` reports `{escaped:false, n:48}` in every case. Sweeping a 200×200 grid of `DEFAULT_PARAM_VIEW`: 8788 body pixels, of which 8699 are inside |a| ≤ 1 — and 8699/8699 = 100% of the |a| ≤ 1 pixels are body. The advertised "body" is a geometric disk of radius 1 plus an 89-pixel fringe, not a computed locus; `DEFAULT_PARAM_VIEW`'s comment about "room above and below for the body's lobes" describes lobes that do not exist. For contrast, at a = 1 the classifier is genuinely meaningful (the cusp 1.5 is a fixed point of σ, so the orbit really is bounded), and at a = 1.2/1.4 it genuinely escapes at n = 9/7 — so the picture is real only on |a| ≥ 1.

**Proposed fix**

Give the degenerate case its own classification. Add a third kind to `ParamEscapeResult` (e.g. `undefinedOrbit`) returned when `sigma` is null on the first iterate — i.e. the marked point is not in Ω_a — and give it a distinct colour in `paramFieldToImage`/`shade` so the |a| ≤ 1 disk stops reading as a connectedness body. Separately, correct family.ts:9-11: m_k = 1.5·a^{1/3} is a cusp/critical value only at |a| = 1. If a marked orbit is wanted for |a| < 1, the genuine σ_a critical point is where F_a'(z) = −1/z² + conj(a)·z = 0, i.e. z³ = 1/conj(a), |z| = |a|^{−1/3} > 1 — which IS in the domain (checked: a = 0.5 gives w = φ_a(1.26) ≈ 1.4175, comfortably in Ω_a). Finally, soften main.ts:219 so it does not claim "orbits bounded" where no orbit exists.

### `corr-density-recolour-03` — The correspondence render re-runs a full-frame point-in-polygon colorize on every progressive tick — ~4.2 s of ~4.8 s is redundant

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | small | `apps/correspondences/src/main.ts:191` | `UNVERIFIED` |

**Evidence**

main.ts:186-193 —
```
  chunk((next) => {
    const sy1 = Math.min(opts.seedGrid, sy + 3);
    accumulateBand(density, CORR, CORR, DEFAULT_VIEW, opts, sy, sy1);
    sy = sy1;
    const isFinal = sy >= opts.seedGrid;
    densityToImage(density, image, DEFAULT_VIEW, isFinal); // blur only the final frame
```
With `DEFAULT_DENSITY.seedGrid = 64` and 3 seed-rows per tick that is 22 ticks, each doing a complete 380×380 recolorize. The cost is dominated by correspondenceRender.ts:135-136, run for every pixel whose density is still zero:
```
        const wx = view.centerX + ((px + 0.5) / W - 0.5) * 2 * view.halfSpan * aspect;
        if (pointInPolygon([wx, wy], BOUNDARY)) {
```
`BOUNDARY = deltoidBoundary(256)`, so that is a 256-segment ray-cast per zero pixel per tick. The K mask is completely static — it depends only on the view and the boundary, neither of which changes.

**Failure scenario**

Measured at the app's real CORR = 380: `densityToImage` costs 243 ms on an empty buffer, 192 ms on a partially filled one, and only 133 ms with `blur = true` — the blur ADDS four full-frame passes yet the call gets FASTER, because the blur leaves fewer zero-density pixels and therefore fewer `pointInPolygon` calls. That inversion pins the polygon scan as the dominant cost. Meanwhile `accumulateBand` for one 3-row chunk — the work the tick actually exists to do — costs 25 ms. So the render spends ≈ 22 × 192 ms ≈ 4.2 s recolouring versus ≈ 22 × 25 ms ≈ 0.55 s computing: roughly 8× more time on redundant recomputation than on the correspondence itself, all on the main thread in 200 ms bursts that block input.

**Proposed fix**

Hoist the K mask out of the per-tick path: build a `Uint8Array(W*H)` once (either in `renderCorrespondence` before the `chunk` loop, or lazily memoized inside `correspondenceRender.ts` keyed on W/H/view) and have `densityToImage` index it instead of calling `pointInPolygon`. That alone removes essentially all 4.2 s. Optionally also skip the intermediate colorize on most ticks (e.g. repaint every 4th tick) since the progressive frames are transient by design.

### `corr-sigma-tiling-label-04` — The σ render paints the ∞-basin with the tiling-set palette and the caption names only the tiling set — 31% of the picture is mislabeled

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/correspondences/src/render.ts:49` | `UNVERIFIED` |

**Evidence**

render.ts:49-51 —
```
  } else if (kind === "escaped" || kind === "fundamental") {
    // A tile: the orbit left Ω after n steps (into K or toward ∞). Colour by tile generation.
    [r, g, b] = pal(0.11 * n);
```
`escapeTime` carefully distinguishes `escaped` (|σⁿ| > escapeR) from `fundamental` (orbit entered K), then `paint` merges them into one ramp. The GPU shader does the same, gpu.ts:81 — `if (length(w) > uEscapeR || inK(w)) { escaped = true; break; }   // left Omega (to infinity or into K) -> a tile`.

The caption names only one of the two, main.ts:133 — `` `K at the centre; tiling set coloured by escape time; the non-escaping set (≈ the limit set) in black.` ``

The comment is also wrong on its own terms: Ω = ℂ \ K contains a neighbourhood of ∞, and ∞ is a super-attracting fixed point of σ (σ(w) ≈ ½·w̄² near ∞), so an orbit "toward ∞" never leaves Ω. The app itself treats that basin as the MAP side of the mating elsewhere — `mapSide.ts` builds σ's Green's function `greenSigma` on exactly this ∞-basin and `matingView.drawSigmaEquipotentials` draws its equipotentials.

**Failure scenario**

Measured over a 240×240 sweep of `DEFAULT_VIEW` with maxIter 64, escapeR 40: 5128 pixels are K itself, 34561 are `fundamental` (the genuine tiling set), and 17911 are `escaped` — 31% of the frame. Those 17911 pixels are the ∞-basin, not tiles: the σ-orbit of w = 3 (just outside the right cusp at 1.5) runs 4.668 → 11.004 → 60.587 → 1835.380 → 1684310.233 and never enters K. A user reading the caption concludes the coloured region is one object (σ's tiling set) when it is the union of the two complementary halves of the mating — the group-side tiling set and the map-side ∞-basin — rendered in the same palette with the same "tile generation" meaning attached to two different quantities.

**Proposed fix**

Split the two classes visually and verbally: give `escaped` its own ramp (or a hue offset) in `render.ts:paint` and the matching branch in `gpu.ts` (the shader already knows which test fired), and reword main.ts:133 to something like "tiling set (orbits falling into K) and the ∞-basin coloured by escape generation; the non-escaping limit set in black". Also fix render.ts:50's comment — orbits going to ∞ do not leave Ω.

### `corr-mating-orbit-label-05` — The mating explorer claims "same dynamics on all three" panels, but σ fixes the deltoid curve pointwise

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/correspondences/src/mating/matingMain.ts:55` | `UNVERIFIED` |

**Evidence**

matingMain.ts:55 —
```
    readout.textContent = `orbit  θ ↦ −2θ  ·  ${state.orbit.length} points  ·  from ${start}°  (same dynamics on all three)`;
```
matingView.ts:10-11 — `// it live: the shared angle θ. Hover any panel → the corresponding equator point lights up in all three; the // degree-2 equator map θ ↦ −2θ (which BOTH z̄² and the group's Nielsen map realise on the circle) is traced // as an orbit on all three at once.`

On the σ panel the plotted points are `equatorPoint("sigma", θ) = DELTOID.evalPhi([cos θ, sin θ])` (matingView.ts:203-206), i.e. points of the deltoid curve ∂K. But σ is a Schwarz reflection, so it is the IDENTITY on ∂K — it does not move those points at all.

**Failure scenario**

Measured with the app's own engine over 12 equator angles: max |σ(φ(e^{iθ})) − φ(e^{iθ})| = 4.74e-13. Concretely at θ = 0.524, the panel's marker jumps from (1.11603, 0.06699) to the θ ↦ −2θ image (0.25000, −0.43301), while the actual σ-image of (1.11603, 0.06699) is (1.11603, 0.06699) — it does not move. A user watching the three panels animate in lockstep, told "same dynamics on all three", concludes σ realises the degree-2 angle map on the deltoid curve. It does not: the deltoid curve is the boundary of the fundamental tile, whereas the mating's equator (the welding curve, where the degree-2 dynamics lives) is σ's limit set — the black fractal that `render.ts`/`gpu.ts` already draw and that `escapeTime` already isolates.

**Proposed fix**

Reword the readout and the matingView header to say what is actually shown: the same ANGLE orbit θ ↦ −2θ displayed in three coordinates (z̄² realises it literally; the Nielsen map is topologically conjugate to it; on σ the marker traces the corresponding φ-parameter, and σ itself fixes ∂K pointwise). Given honest labeling is the paramount guardrail here, this warrants an explicit ≈ marker on the σ panel similar to the one already carried by `mapSide.sigmaExternalRay` and the M5 fold. Separately, the identification "equator = deltoid curve" in matingView.ts:5-8 and the assertion in glue.ts:5 that Ψ = φ∘η carries the Γ-tessellation "onto σ's tiling of Ω" should be reviewed against LLMM: substituting w = Ψ(u) gives σ(Ψ(u)) = φ(u), not Ψ(N(u)), so Ψ is a schematic transport rather than the conjugacy — and glue.ts's own hedge ("visually evident but NOT asserted") should probably become the primary statement.

### `corr-mating-blocking-06` — mating.html blocks the main thread for ~0.8 s of unyielded σ evaluation before painting anything

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | performance | small | `apps/correspondences/src/mating/matingMain.ts:164` | `UNVERIFIED` |

**Evidence**

matingMain.ts:164 — `    if (bctx) drawPanel(bctx, SIZE, space); // the expensive static layer, drawn once` — called inside a synchronous `SPACES.map(...)` in `build()`, which itself runs at module scope (matingMain.ts:208 `build();`).

For `space === "sigma"` that reaches matingView.ts:180-181:
```
  drawSigmaEquipotentials(ctx, size); // the map-side Böttcher modulus, behind the group tessellation
  drawSigmaRays(ctx, size); // the map-side external angles, transported in
```
`drawSigmaEquipotentials` evaluates `greenSigma` on a 132×132 grid (17,424 σ-orbit evaluations); `drawSigmaRays` → `sigmaRayFan()` traces 24 rays, each step costing 9 `greenSigma` calls (two central-difference gradients plus the acceptance test). None of it yields. This is in pointed contrast to index.html, where `main.ts` routes every comparable pass through `chunk`/`chunkImageBands` specifically so "the page stays responsive".

**Failure scenario**

Measured in Node at the app's exact parameters: the 24-ray fan takes 314 ms (rays are 99–109 steps each) and the 132² equipotential grid 495 ms — ≈ 0.8 s of unyielded work, before the tessellation stroking and before the first paint. In a browser the user sees an empty `#app` for that whole time with no progress caption, and any pointer input queued during it is stalled; on a slower device (or with the WebGL-free 2D path competing with the index page's chunked renders) this stretches proportionally.

**Proposed fix**

Draw the two cheap disk panels (`map`, `group`) first and paint them, then run the sigma panel's base layer through the same `chunk`-style yielding loop `main.ts` already uses — e.g. accumulate `drawSigmaEquipotentials` in row bands and `sigmaRayFan` a few rays at a time, blitting `base` into the visible canvas after each batch. A one-line progress caption in `#readout` during the build would also match the index page's behaviour.

### `corr-param-gpu-claim-07` — paramGpu claims pixel-for-pixel cross-validation against the CPU classifier; 0.22% of pixels differ and no test covers escape counts

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `apps/correspondences/src/paramGpu.ts:10` | `UNVERIFIED` |

**Evidence**

paramGpu.ts:9-10 — `// Dogfoods @cas/gpu (the complex stdlib + shared compile/link). Colours match paramFieldToImage exactly, // so this is cross-validated PIXEL-FOR-PIXEL against the CPU classifier (criticalEscape).`

The shader's inverse stops at a loose tolerance and has no exact fallback (paramGpu.ts:53-62: 24 Newton steps, accept at `length(fz) < 1e-6`, post-loop `ok = length(csub(phi_a(z, a), w)) < 1e-4`), whereas the CPU path uses `NEWTON_TOL = 1e-12` and, on any miss, the exact Durand–Kerner `exteriorRoot` (deltoid.ts:146-150).

The differential guard cannot see the gap: `gpuAgreement.test.ts:147-181` compares a SINGLE σ_a step on a 32×32 grid for 4 parameter values and asserts only `worst < 1e-4` and `branchDisagree === 0` — never the escape COUNT that actually determines the pixel colour.

**Failure scenario**

Mirroring the shader exactly in TS and sweeping a 200×200 grid of `DEFAULT_PARAM_VIEW` at `DEFAULT_PARAM_OPTIONS`: 87 of 40,000 pixels (0.22%) get a different escape count, and every one is the shader escaping one step EARLIER than the CPU (gpuMoreBounded = 0, gpuLessBounded = 87). Examples: a = [0.1010, 1.6150] → CPU 6, shader 5; a = [−0.8490, 1.8620] → CPU 5, shader 4. Since `t = min(1, n/24)` these sit on the escape-band contours, so the GPU render shows the band boundaries displaced by one step relative to the CPU fallback — a visible hairline mismatch if a user compares a WebGL and a non-WebGL browser. Body membership never flips (0/40,000), so the impact is cosmetic, but the source claim is measurably false.

**Proposed fix**

Downgrade the comment to what is true ("colours and classifier match; escape counts agree except on band boundaries, where the shader's 1e-6/1e-4 Newton tolerance can differ by one step from the CPU's 1e-12 + Durand–Kerner path"), and extend `gpuAgreement.test.ts` with a small full-escape-count comparison (e.g. a 40×40 param grid asserting body membership identical and |Δn| ≤ 1) so the claim is actually guarded.

### `corr-maxdepth-dead-08` — DEFAULT_DENSITY.maxDepth = 18 is dead configuration — the node cap always binds at depth ≤ 8

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/correspondences/src/correspondenceRender.ts:27` | `UNVERIFIED` |

**Evidence**

correspondenceRender.ts:27 — `export const DEFAULT_DENSITY: DensityOptions = { seedGrid: 64, maxDepth: 18, maxNodes: 220, escapeR: 6 };`

The correspondence is 2:2, so a breadth-first tree reaches 220 nodes at depth ≈ 7–8 (2⁸ − 1 = 255). `expandOrbitTree`'s loop condition (orbitTree.ts:45) `while (head < queue.length && nodes.length < maxNodes)` therefore terminates on the node cap long before `if (node.depth >= maxDepth) continue;` (orbitTree.ts:48) can fire.

**Failure scenario**

Measured over 64 seeds drawn from the real `accumulateBand` seed grid at `DEFAULT_DENSITY`: every single tree returns exactly 220 nodes (avgNodes = 220.0) and the deepest node reached across all of them is depth 8, against the configured 18. Anyone tuning the density render by raising or lowering `maxDepth` will observe no change whatsoever and will conclude the knob is broken; conversely anyone reading the constant will believe the cloud reaches depth 18 when it reaches 8.

**Proposed fix**

Either set `maxDepth` to a value that can actually bind (≈ 8, documenting that it is the node cap that governs) or raise `maxNodes` if deeper trees are wanted. A one-line comment on the constant recording which cap dominates would prevent the next tuner from chasing a no-op.

### `corr-dk-null-dead-09` — Three unreachable null-guards after makeDurandKerner calls

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/correspondences/src/deltoid.ts:113` | `UNVERIFIED` |

**Evidence**

deltoid.ts:112-113 —
```
    const res = dk(evalMonic, seeds, { tol: 1e-13, maxIter: 200 });
    if (!res) return null;
```
correspondence.ts:78-79 —
```
    const res = dk(evalMonic, seeds, { tol: 1e-12, maxIter: 200 });
    if (!res) return [];
```
exact/deltoidExact.ts:79-80 —
```
    const res = makeDurandKerner(A)(evalMonic, seeds, { tol: 1e-13, maxIter: 300 });
    if (res) for (const r of res.roots) out.push(wrap(r));
```
But `durandKerner` returns null only under one option, packages/core/src/durand-kerner.ts:123 — `        if (bail && !alg.isFinite(ziNext)) return null;` — where `bail = opts.bailOnNonFinite ?? false` (line 84). None of the three call sites passes `bailOnNonFinite`, so all three guards are unreachable.

**Failure scenario**

No runtime misbehaviour — the cost is comprehension. A maintainer reading `exteriorRoot` sees an explicit "DK can fail" path and reasons about a failure mode that cannot occur, while the genuine unconverged-solve handling sits three lines further down (deltoid.ts:128) and is easy to conflate with it. Worse, if someone later adds `bailOnNonFinite: true` to make the solver bail on divergence, `correspondence.ts`'s `return []` would silently drop all branches for that point and the orbit tree would grow a hole with no diagnostic.

**Proposed fix**

Drop the three `if (!res)` / `if (res)` guards (the return type is non-null without `bailOnNonFinite`), or pass `bailOnNonFinite: true` deliberately and keep them — but not the current state where the guard exists and can never fire.

### `corr-readme-stale-10` — README undercounts the shared packages the app consumes and overstates GPU/CPU pixel consistency

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | maintainability | trivial | `apps/correspondences/README.md:6` | `UNVERIFIED` |

**Evidence**

README.md:6 — `it rides the four shared packages (`@cas/core`, `@cas/expr`, `@cas/gpu`, `@cas/interchange`)`

But `src/exact/correspondenceCurve.ts:19` imports `{ discriminant, Gauss, integerPrimitive, QiPoly, renderGaussMag } from "@cas/exact"` and `src/exact/index.ts:6` re-exports it — a fifth shared package, and the one the roadmap-#17 extraction created. Meanwhile `@cas/interchange`, listed as a runtime dependency in package.json:23, is imported only from `test/smoke.test.ts:5`, never from `src/`.

README.md:36-38 also states the CPU σ fallback "is pixel-consistent with it (a node-safe agreement test guards the two)". The agreement test (`test/gpuAgreement.test.ts`) guards the σ ALGORITHM, not pixels, and the two paths use different iteration caps: `gpu.ts:167` `gl.uniform1i(uMaxIter, 96);` versus `render.ts:27` `const MAX_ITER = 64;`.

**Failure scenario**

A reader auditing the ADR-0007 "second consumer" rule from the README will conclude `@cas/exact` has only two consumers (complex-dynamics and correspondences per CLAUDE.md) while missing that this app is one of them via `src/exact/`, and will not realise `@cas/interchange` is a test-only dependency here. Separately, someone trusting "pixel-consistent" will not investigate when the GPU and CPU renders differ near the limit set. (In practice the caps agree: over a 240² sweep, 0 pixels remained unclassified at maxIter 64, so raising to 96 changes nothing — but the guarantee the README states is not the one the test provides.)

**Proposed fix**

Update README.md:6 to list the five packages and note that `@cas/interchange` is currently exercised only by the smoke test (and consider moving it to devDependencies in package.json). Reword README.md:36-38 to "the CPU fallback and the shader run the same σ algorithm (guarded by a node-safe agreement test); they use different iteration caps (64 vs 96), which is immaterial because the >64-step set is measure-zero".

---

## Scope: duplication — cross-cutting duplicate logic, divergence, dead code

**Reviewer's summary of what was read and overall impression:**

I swept the whole workspace for cross-cutting duplication using three mechanical passes plus targeted reading: (a) an N-line normalized-window duplicate detector over every tracked .ts/.mjs/.js file (windows of 5/7/8/12 lines, aggregated per file and per file-pair), (b) an export-reference scan classifying every `export` as externally-used / test-only / unreferenced, and (c) a CSS custom-property + class-selector liveness scan (whose hits I then hand-checked against dynamic `'prefix-' + kind` construction, which killed most of them as false positives). I then read the surrounding code for every candidate before reporting. Files read in full or in large part: packages/core (sphere.ts, durand-kerner.ts, complex.ts), packages/gpu (colormap.ts, shader.ts, dualBackend.ts), packages/interchange (viewstate.ts, base64url.ts, schema.ts), packages/expr (complexJs.ts, evaluate.ts, glsl.ts), CD's perturbation.ts / perturbationPoly.ts / dd.ts / overlay.ts / plotView.ts / glPlot.ts (shader region) / matingEngine.ts / bla.ts / rays.ts / interiorDE.ts / dynatomic.ts / lamination.ts / yoccozPuzzle.ts / toast.ts, corr's deltoid.ts / render.ts / gpu.ts / paramGpu.ts / paramPlane.ts / family.ts / deltoidExact.ts and test/gpuAgreement.test.ts, and QD's solver-{qd,uqd,pqd,pqd-singular,uqd-pqd,uqd-pqd-singular,uqd-lqd,uqd-lqd-singular}.mjs, seeds/*, schwarz-{webgl,paint,render,ui,cpu-worker,export}.mjs, sphere-{webgl,ui,common}.mjs, workers/schwarz-worker-entry.mjs, primary-solver-worker.mjs, param-slice-pool.mjs, algebra/sym-worker.mjs, qol.mjs, ui.mjs and the two colormap/shader parity tests.

Overall health of this scope is good and better than I expected. The demand-driven extraction discipline (ADR-0007) has clearly been applied: @cas/core's stereographic kernel, Durand–Kerner, @cas/gpu's colormap + shader plumbing and @cas/interchange's view-state codec are genuinely adopted by their second consumers, with the old local copies deleted and comments recording why the remaining local variants stay local. There is essentially no commented-out code, exactly one orphan file (a vite-env.d.ts shim, which is correct), and near-zero dead CSS. The real debt is concentrated in three places: (1) the QD solver family, where 20–37% of each solver file's substantive lines are verbatim copies of a sibling (continuation-in-c triplicated, the branch-Taylor accumulation 8×); (2) copy-paste TWINS where a later fix landed on only one copy — schwarz-cpu-worker.mjs missing the "worker crashed ⇒ settle the in-flight job" fix its three sibling worker wrappers all have, and sphere-webgl's setPhi being a clone of schwarz-webgl's that dropped the capacity-error reporting; and (3) CPU↔GPU mirrors that are maintained by hand with only partial test cover — QD's 10 colormap tables live twice with parity pinned for only 4, and correspondences' "GPU shader ↔ CPU engine agreement" test actually exercises a hand-copied TypeScript replica of the shader rather than the shader. Nothing I found produces a dishonestly-labelled `=`; the closest is the stale-sphere-render issue, which shows one domain's dynamics under another domain's caption.

### `cd-dup-01` — schwarz-cpu-worker's worker-error handler never settles the in-flight render — the Schwarz CPU render hangs forever, and only this one of four worker wrappers is missing the fix

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/quadrature-domains/app/schwarz/schwarz-cpu-worker.mjs:82` | `UNVERIFIED` |

**Evidence**

The whole error handler is:

```js
      const w = new Worker(new URL('../workers/schwarz-worker-entry.mjs', import.meta.url), { type: 'module' });
      w.addEventListener('error', (ev) => {
        console.error('[schwarz-cpu worker] error: '
          + (ev.message || ev) + ' @ ' + (ev.filename || 'bundle') + ':' + (ev.lineno || '?'));
      });
```

It logs and returns. `_inflight` is not cleared, `_disposeWorker()` is not called, and none of the caller's callbacks fire. There is no `messageerror` listener at all.

This file is the copy-paste twin of `primary-solver-worker.mjs`, where the identical block was fixed and the reason written down (primary-solver-worker.mjs:92-105):

```js
      w.addEventListener('error', (ev) => {
        const detail = (ev.message || ev) + ' @ ' + (ev.filename || 'bundle') + ':' + (ev.lineno || '?');
        console.error('[primary-solver worker] error: ' + detail);
        // A worker-level error (bundle load/syntax error, crash, OOM) posts NO
        // {error} message, so without this the in-flight solve() promise would
        // never settle and the UI would spin "Solving…" forever. …
        if (_inflight) { const job = _inflight; _inflight = null; … job.reject(new Error('solver worker crashed: ' + detail)); }
        _disposeWorker();
      });
```

The other two wrappers have it too: `apps/quadrature-domains/app/algebra/sym-worker.mjs:59-71` (rejects the job, tears down, and permanently falls back on a load failure) and `apps/quadrature-domains/app/param-slice/param-slice-pool.mjs:243-245` (routes both `error` and `messageerror` into `pool._onWorkerError`). schwarz-cpu-worker is the only one of the four that drops the event.

The worker entry only guards `buildSchwarzFromPhi` — everything after it is unprotected (`apps/quadrature-domains/app/workers/schwarz-worker-entry.mjs:26-32`, then an unguarded `for` over `S.escapeTime(...)` at lines 41-86). Note `@cas/core`'s `Complex.div` THROWS on a zero denominator (`packages/core/src/complex.ts:105`), so a throw escaping `onmessage` is reachable, as is an allocation failure at large W×H.

**Failure scenario**

Schwarz tab, CPU renderer active (e.g. a power-QD capture, which schwarz-webgl refuses), resolution raised so the worker path is taken. `schwarz-render.mjs:112-113` sets `sState.rendering = true` and `setProgress('Pass 1/3 (coarse) ...')`, then `_renderCpuViaWorker` (schwarz-render.mjs:169-181) hands off and waits purely on `onPass` / `onError` / `onUnavailable`. If the worker throws inside the escape-time loop (uncaught → a worker `error` event, no `schwarzError` message) or is killed for memory, the handler above only console.errors. `_inflight` stays non-null, so `isBusy()` is permanently true and `cancel()` is the only escape; none of the three callbacks fires, so the promised recovery — schwarz-render.mjs:151-152 "Any failure path falls back to the in-process pyramid so the tab always renders" — never happens. The user sees "Pass 1/3 (coarse) …" and a blank/stale canvas indefinitely, and every subsequent pan or parameter change re-enters the same dead worker.

**Proposed fix**

Mirror primary-solver-worker.mjs:92-114 into schwarz-cpu-worker.mjs: in the `error` listener, capture and clear `_inflight`, remove its message listener, invoke `cbs.onError` (or `onUnavailable`, so schwarz-render falls back to the in-process pyramid), then `_disposeWorker()`; add the matching `messageerror` listener. Better still, since all four wrappers now share this exact lifecycle, hoist the spawn+error+messageerror+settle skeleton into one small QD-internal helper that each wrapper parameterizes with its entry URL and its settle callback — that is what stops the next fix from landing on three of four copies again.

### `cd-dup-02` — sphere-webgl's setPhi is a clone of schwarz-webgl's that dropped the capacity-error reporting; on rejection the sphere keeps rendering the PREVIOUS domain under the new domain's caption

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/quadrature-domains/app/sphere/sphere-webgl.mjs:313` | `UNVERIFIED` |

**Evidence**

`sphere-webgl.mjs` setPhi (line 294) is a hand-copy of `schwarz-webgl.mjs` setPhi (line 891) — same `phiState` shape (sphere-webgl.mjs:216-241 vs schwarz-webgl.mjs:865-887, even the comment "matches phiState in schwarz-webgl.js"), same γ-branch merge, same family switch, same packing loops. But the rejection paths were compressed:

```js
      // Validate capacity (same as schwarz-webgl.js).
      const nb    = effBranches.length;
      const polyA = phi.polyA || phi.F || [];
      const beta  = phi.lqdBeta || [];
      if (nb > MAX_BRANCHES || polyA.length > MAX_LAURENT) return false;
      if (beta.length > MAX_BETA) return false;
      for (let j = 0; j < nb; j++) { if (effBranches[j].A.length > MAX_K) return false; }
      if (phi.family === 'powerQD' || phi.family === 'powerQD_singular'
          || phi.family === 'unboundedPQD' || phi.family === 'unboundedPQD_singular') return false;
```

where schwarz-webgl.mjs:912/917/922/927/939 instead set a diagnostic (`phiState.capacityError = 'Too many branches (…); falling back to CPU.'` etc.) that schwarz-ui surfaces (`schwarz-ui.mjs:1158-1159`: `sState.gpuMsg = sState.gpu.capacityError() || 'GPU rejected this φ.'`).

Every one of those `return false` fires BEFORE any `phiState` mutation, and `hasPhi` is only ever set true (sphere-webgl.mjs:289 `let hasPhi = false;`, line 408 `hasPhi = true;` — no reset anywhere), so the previously-built `fractalFBO` texture and boundary overlay survive and keep being drawn (`sphere-webgl.mjs:477`, `:504`).

Both callers throw the return value away. `schwarz-ui.mjs:1168-1172`:

```js
    if (sState.sphereView) {
      sState.sphereView.setPhi(sState.phiSnapshot,
                                sState.hDataSnapshot,
                                sState.boundarySnapshot);
    }
```

and `schwarz-ui.mjs:893-897` on first activation. The middle layer only logs: `sphere-ui.mjs:170-173` → `console.warn('sphere-ui: setPhi rejected (GPU capacity exceeded).')`.

**Failure scenario**

In the Schwarz tab: capture a classical unbounded QD φ₁ and switch to sphere view — the sphere renders φ₁'s escape-time field correctly. Go back to the Inverse tab, solve a power-weighted QD (Family.powerQD, α ≥ 2), and hit Capture φ. `captureFromInverseTab` (schwarz-ui.mjs:1116) sets `sState.phiSnapshot = φ₂`, calls `refreshSourceStatus()` (line 1174) so the on-screen source label now names φ₂, and — because `sState.viewMode === 'sphere'` — falls to line 1180-1181 `sState.sphereView.requestRender()`. But `sphere-webgl.setPhi` bailed at line 321-322 on the powerQD family, so `phiState`, the mask, the overlay geometry and the cached fractal texture are all still φ₁'s. The sphere redraws φ₁'s Schwarz dynamics under a caption that says φ₂ is loaded, with the only diagnostic in the devtools console. The same happens for any φ with more than MAX_BRANCHES branches or an over-long Laurent tail. On the identical rejection the Schwarz plane view instead says "Family.powerQD (α=2): GPU shader for (R#)^{1/α} not yet implemented; falling back to CPU" and renders φ₂ on the CPU.

**Proposed fix**

Two changes. (1) In sphere-webgl.mjs, on any rejection path set `hasPhi = false` and clear/free the stale mask + fractal FBO so the renderer falls back to `defaultFractalTex` (the neutral placeholder sphere) rather than the previous domain; also adopt schwarz-webgl's `capacityError` string and expose a `capacityError()` accessor. (2) Have sphere-ui.setPhi propagate that string and schwarz-ui render it next to the source label the way `sState.gpuMsg` is rendered for the plane view. Longer term the two setPhi bodies should be one shared `packPhiState(phi, opts) -> {phiState, error}` helper in a sphere/schwarz-common module, since they are already required to agree on the family ids, the γ-merge and the capacity limits.

### `cd-dup-03` — The ten Schwarz colormap tables exist verbatim in both the CPU painter and the GPU renderer, and the CPU↔GPU parity test only covers four of them

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/quadrature-domains/app/schwarz/schwarz-paint.mjs:867` | `UNVERIFIED` |

**Evidence**

The CPU painter carries its own copy of every palette:

```js
  const CMAP = {
    magma:      [[0,0,4],[28,16,68],[79,18,123],…,[252,253,191]],
    inferno:    [[0,0,4],[31,12,72],…],
    plasma:     […], viridis: […], cividis: […], turbo: […],
    grayscale:  […], rainbow: […], iceandfire: […], twotone: […],
  };
```

and the GPU renderer carries the same ten arrays as separate consts — `schwarz-webgl.mjs:642` `const MAGMA = […]`, `:646 INFERNO`, `:650 PLASMA`, `:654 VIRIDIS`, `:658 CIVIDIS`, `:663 TURBO`, `:667 GRAYSCALE`, `:670 RAINBOW`, `:674 ICEANDFIRE`, `:678 TWOTONE` — dispatched by `pickColormap` at `:721-736`. I diffed all ten pairs: they agree today, byte for byte. The painter's header states the contract explicitly (`schwarz-paint.mjs:821-822`): "Colormaps + scale modes. Tables match schwarz-webgl.js so CPU and GPU outputs render the same colors for the same input."

The guard test enumerates only four (`apps/quadrature-domains/vitest/schwarz-colormap.test.ts:79-86`):

```ts
  it("does not regress the other palettes (still interpStops(t, base))", () => {
    for (const name of ["magma", "viridis", "turbo", "grayscale"]) {
      const base = pickColormap(name);
      for (const t of SWEEP) expect(colormap(name, t)).toEqual(interp(t, base));
    }
  });
```

inferno, plasma, cividis, rainbow, iceandfire and twotone are unguarded. The sibling test `vitest/schwarz-shader-parity.test.ts:33-51` checks only that the GPU-side stop lists are well-formed 0..255 triples — it never compares them to the CPU's CMAP. (The same test file also contains a third hand-copy of `interpStops`, at lines 38-49.)

This is exactly the failure class the existing `cyclic` fix documents: `schwarz-paint.mjs:844-850` records that these two tables had already silently diverged once and "made the CPU render a visibly different image … breaking the header's CPU↔GPU parity invariant."

**Failure scenario**

Adjust the `iceandfire` ramp (say to lift the mid-tone) in `schwarz-webgl.mjs:674-677` and forget the twin in `schwarz-paint.mjs:876`. Every test stays green. A user on a WebGL2 machine renders a domain with the iceandfire palette and gets the new colours; the same user on a machine that falls back to CPU (or on any power-QD / over-capacity φ, which schwarz-webgl.mjs:939 forces to the CPU path) gets the old colours for the identical escape-time field — and, because the field itself is not shown, has no way to tell that the difference is a palette bug rather than a difference in the computed dynamics.

**Proposed fix**

Either (a) extend the parity test's palette list to all ten names — `pickColormap` already enumerates them, so iterate that list rather than a hardcoded subset; or better (b) delete the CPU's `CMAP` object and have `schwarz-paint.mjs` read the tables through the already-exported `QD.Schwarz._glHelpers.pickColormap` (which the parity test itself imports), leaving one copy of the data. `interpStops` then becomes the only mirrored piece and it is already a per-sample restatement of `@cas/gpu`'s `buildColormapLUT` (packages/gpu/src/colormap.ts:88-114), so it can delegate there.

### `cd-dup-04` — correspondences' "GPU shader ↔ CPU engine agreement" test exercises a hand-copied TypeScript replica of the shader, not the shader — so the GLSL can drift while the test stays green

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | medium | `apps/correspondences/test/gpuAgreement.test.ts:16` | `UNVERIFIED` |

**Evidence**

The deltoid σ inverse now exists in four places: the authoritative CPU engine (`src/deltoid.ts:132-151`, Newton + an exact Durand–Kerner `exteriorRoot` fallback), the dynamical-plane GLSL (`src/gpu.ts:42-54`), the parameter-plane GLSL (`src/paramGpu.ts:49-63`), and two TypeScript replicas of the two shaders inside this test:

```ts
/** Mirror of gpu.ts `invertPhi`: cold-seed Newton for the exterior branch of φ⁻¹ (24 iters, 1e-6 tol). */
function coldInvert(w: Complex): Complex {
  const r = A.abs(w);
  let z: Complex = r > 1.3 ? w : [(w[0] * 1.3) / Math.max(r, 1e-6), (w[1] * 1.3) / Math.max(r, 1e-6)];
  …
}
const shaderSigma = (w: Complex): Complex => conj(DELTOID.evalF(coldInvert(w)));
```

(and `shaderSigmaA` at :102-119 for paramGpu). The file's own header states the manual-sync contract: "If someone changes gpu.ts's inverse, keep this mirror in sync." The `describe` blocks are named "GPU deltoid shader σ algorithm ↔ CPU engine agreement" and assert `worst < 1e-4` over a 48×48 grid — but nothing in the assertion path ever reads `gpu.ts` or `paramGpu.ts`. I diffed both replicas against the GLSL line by line and they are in sync today (the extra `|z| < 1e-12` guard and `Number.isFinite` check in the TS versions are documented and behaviourally inert), so this is currently a fidelity gap, not a live bug.

The only browser-backed GLSL job in the repo is `packages/gpu/vitest.browser.config.ts` + `packages/gpu/test/dualBackend.browser.test.ts`; there is no browser test that compiles or runs either correspondences shader.

**Failure scenario**

Change the cold seed threshold in `src/gpu.ts:44` from 1.3 to, say, 1.05 (matching `deltoid.ts`'s `seedFor`) without touching the test. `pnpm test` reports "agrees with the CPU engine across a dense grid of Ω (no drift anywhere)" — because it is still running the 1.3 replica. On a real GPU, mid-radius points 1.05 < |w| < 1.3 now seed Newton in a different basin; where it converges to an interior preimage the shader's `if (length(z) < 0.999) break` marks the pixel non-escaping and paints it as limit set (gpu.ts:78, 83). The user sees exactly the spurious non-escaping "wings" the header at gpu.ts:37-41 says were fixed, on a page whose test suite claims shader/engine agreement.

**Proposed fix**

Retitle the describe blocks to say what they test ("the cold-seed Newton STRATEGY, mirrored in TS") so the guarantee is not overstated, and add a source-level guard in the spirit of `apps/quadrature-domains/vitest/schwarz-shader-parity.test.ts` — import the FRAG string from gpu.ts/paramGpu.ts and assert the seed constants, iteration cap, tolerances and the `length(z) < 0.999` / `1.0 - 1e-4` branch guards appear in it, so a silent edit to the GLSL fails CI. The stronger fix is to extend the existing `packages/gpu` browser job to compile and run these two shaders against the CPU engine, which is the only thing that actually closes the gap.

### `cd-dup-05` — Identical Cauchy-bound Durand–Kerner seeding + monic Horner block duplicated across complex-dynamics and correspondences — a genuine ADR-0007 second-consumer case for @cas/core

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | redundancy | small | `apps/complex-dynamics/src/combinatorics/dynatomic.ts:111` | `UNVERIFIED` |

**Evidence**

complex-dynamics (`dynatomic.ts:111-125`):

```ts
  const monic = coeffs.map((c) => A.div(c, lead));
  const evalMonic = (z: ComplexTuple): ComplexTuple => {
    let acc: ComplexTuple = monic[deg] ?? [1, 0];
    for (let k = deg - 1; k >= 0; k--) acc = A.add(A.mul(acc, z), monic[k] ?? [0, 0]);
    return acc;
  };
  let bound = 1;
  for (let k = 0; k < deg; k++) bound = Math.max(bound, 1 + A.abs(monic[k] ?? [0, 0]));
  const seeds: ComplexTuple[] = [];
  for (let k = 0; k < deg; k++) {
    const t = (2 * Math.PI * (k + 0.5)) / deg;
    seeds.push([bound * Math.cos(t), bound * Math.sin(t)]);
  }
  const res = makeDurandKerner(A)(evalMonic, seeds, { tol: 1e-13, maxIter: 400 });
```

correspondences (`apps/correspondences/src/exact/deltoidExact.ts:65-79`) is the same fifteen lines with `maxIter: 300`:

```ts
    const monic = reduced.map((c) => A.div(c, lead)); // monic[deg] = 1
    const evalMonic = (z: ComplexTuple): ComplexTuple => {
      let acc: ComplexTuple = monic[deg] ?? [1, 0];
      for (let k = deg - 1; k >= 0; k--) acc = A.add(A.mul(acc, z), monic[k] ?? [0, 0]);
      return acc;
    };
    // Cauchy root bound → a generous seed circle so DK lands on all roots.
    let bound = 1;
    for (let k = 0; k < deg; k++) bound = Math.max(bound, 1 + A.abs(monic[k] ?? [0, 0]));
    …
    const res = makeDurandKerner(A)(evalMonic, seeds, { tol: 1e-13, maxIter: 300 });
```

Both are the "roots of an exact ℚ(i) polynomial" path (Gleason/dynatomic polynomials in CD, the cusp locus in corr), both consume `@cas/exact` output, and both feed `@cas/core`'s `makeDurandKerner`. `packages/core/src/durand-kerner.ts:12-13` deliberately says "Callers own seeding / monic-normalization / polish; this owns the iteration" — which was right when there was one caller per style, but there are now two callers of the *same* style in two different apps. A third variant with a different seeding policy (radius `max(1.2, |w|/|c|)`) lives at `apps/correspondences/src/deltoid.ts:106-112` and should stay local; this pair should not.

**Failure scenario**

The two copies already disagree on `maxIter` (400 vs 300) with no stated reason. Raise the seed ring to a tighter Fujiwara bound in CD to fix a convergence failure on a high-degree Gleason polynomial G_n and corr's `deltoidBranchPoints` keeps the looser Cauchy ring: the two apps then report different numeric branch points / centres for polynomials of the same shape, and the corr overlay (`main.ts:158-160`, drawn as the EXACT branch points from @cas/exact) silently keeps the worse numerics behind an "exact" caption. Because the seeding is what decides whether DK converges at all, a divergence here shows up as one app finding all roots and the other returning `[]` (dynatomic.ts:125 `return res ? res.roots : []`).

**Proposed fix**

Add `rootsOfMonicCauchy(alg, coeffs, opts)` (or `solveMonic`) to `packages/core/src/durand-kerner.ts` next to `makeDurandKerner`: normalize to monic, build the Horner evaluator, compute the Cauchy bound `1 + max|a_k|`, lay the `(k+0.5)·2π/n` seed ring, run the kernel, return roots-or-null. Have both `dynatomic.ts:rootsOfQiPoly` and `deltoidExact.ts:deltoidBranchPoints` call it (agreeing on one `maxIter`), and golden-test it in packages/core against both apps' current outputs. Leave `deltoid.ts:exteriorRoot` alone — its seed radius is w-dependent and its residual gate is specific to the exterior-branch problem.

### `cd-dup-06` — continuationInC is triplicated verbatim across three QD solvers — ~85 lines each, identical tuning constants, already drifting in its error text

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | redundancy | medium | `apps/quadrature-domains/app/solver-uqd.mjs:286` | `UNVERIFIED` |

**Evidence**

`continuationInC_UQD` (solver-uqd.mjs:286-368), `continuationSolve_UQDL` (solver-uqd-lqd.mjs:297-379) and `continuationSolve_UQDLS` (solver-uqd-lqd-singular.mjs:537-613) are the same routine. Identical option defaults in all three:

```js
    const { cStart = null, growFactor = 1.6, shrinkFactor = 0.5,
            minStep = 1e-4, maxSteps = 80, newton = {} } = options;
```

identical start-guess derivation (`startGuess = cStart ?? Math.min(cTarget, isFinite(minA) ? 0.25 * minA : 0.25)` over `minA = min |p.a|`), identical warm-up-with-shrink loop, and a byte-identical main loop:

```js
    let lastSuccessC = c;
    let stepSize = Math.max((cTarget - c) * 0.4, minStep);
    for (let step = 0; step < maxSteps; step++) {
      if (lastSuccessC >= cTarget - 1e-12) break;
      const nextC = Math.min(cTarget, lastSuccessC + stepSize);
      const phiNext = QD.clonePhi(phi);
      phiNext.c = nextC;
      const result = QD.newtonSolve(phiNext, hData, newton);
      if (result.success) { phi = result.phi; lastSuccessC = nextC; trace.push(…); stepSize *= growFactor; }
      else { stepSize *= shrinkFactor; trace.push(…); if (stepSize < minStep) return { success:false, error: "…step underflow at c=" + …, phi, trace, lastC: lastSuccessC }; }
    }
```

The only differences are the initial-guess function, the `method` label, and the error prefix — and the copies have ALREADY started to drift: solver-uqd.mjs:349-350 appends `" (target c=" + cTarget.toFixed(4) + ")"` to the underflow message, which the other two lack. `solver-cmax.mjs:156` also says it is "mirroring continuationInC_UQD", making the pattern a fourth-order concern.

**Failure scenario**

A user reports that unbounded LQDs fail to reach the target c on a stiff domain and the fix is to raise `maxSteps` from 80 to 200 and soften `shrinkFactor`. Edited in solver-uqd.mjs only, the classical unbounded path now succeeds while the LQD and singular-LQD paths keep failing with "continuationInC (LQD): max steps reached at c=…" on the same domain — a solver-capability difference driven purely by which copy the patch landed in, invisible to any test because each copy has its own call path. Conversely, tuning only the LQD copy makes the classical path the odd one out.

**Proposed fix**

Extract the loop into `solver-lqd-common.mjs` (or a new `solver-continuation.mjs`) as `continuationInC({ hData, cTarget, initialGuess, label, options })`, taking the initial-guess builder and the label/method prefix as parameters. All three call sites reduce to a few lines and the tuning constants exist once. The existing headless suite (`app/test/solvers.test.js`) already covers these paths, so the extraction is test-guarded before and after.

### `cd-dup-07` — The finite-pole branch-Taylor accumulation is copy-pasted eight times across six QD solver files

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | redundancy | medium | `apps/quadrature-domains/app/solver-qd.mjs:63` | `UNVERIFIED` |

**Evidence**

The block

```js
    for (const br of phi.branches) {
      const zjC = Complex.conj(br.z);
      const alpha = Complex.sub(Complex.ONE(), Complex.mul(zjC, z0));
      const alphaInv = Complex.inv(alpha);
      const uT = Taylor.zero(L + 1);
      uT[0] = Complex.mul(z0, alphaInv);
      if (L >= 1) {
        let zjcPow = { re: 1, im: 0 };                              // conj(z_j)^0
        let alphaInvPow = Complex.mul(alphaInv, alphaInv);          // 1/α^2
        for (let l = 1; l <= L; l++) {
          uT[l] = Complex.mul(zjcPow, alphaInvPow);
          zjcPow = Complex.mul(zjcPow, zjC);
          alphaInvPow = Complex.mul(alphaInvPow, alphaInv);
        }
      }
      let uPow = Taylor.truncate(uT, L);                            // u^1
      for (let k = 1; k <= br.A.length; k++) {
        const AkC = Complex.conj(br.A[k - 1]);
        for (let i = 0; i <= L; i++) result[i] = Complex.add(result[i], Complex.mul(AkC, uPow[i]));
        if (k < br.A.length) uPow = Taylor.mul(uPow, uT, L);
      }
    }
```

appears at solver-qd.mjs:63, solver-uqd.mjs:108, solver-pqd.mjs:111, solver-pqd-singular.mjs:136, solver-uqd-pqd.mjs:114 and :243, and solver-uqd-pqd-singular.mjs:104 and :226. I hashed the normalized accumulation loop at all eight sites: they collapse to three hashes that differ only in the accumulator's name (`result` vs `out`) and brace style — the arithmetic is identical everywhere. My duplicate-window scan puts 106/288 (37%) of solver-uqd-pqd.mjs, 99/327 (30%) of solver-uqd.mjs, 73/232 (31%) of solver-qd.mjs and 79/335 (24%) of solver-uqd-pqd-singular.mjs's substantive lines inside a block shared verbatim with a sibling, with this cluster the largest contributor.

**Failure scenario**

Suppose a numerical improvement is needed — e.g. guarding `Complex.inv(alpha)` when a pole z_j approaches the boundary and α = 1 − conj(z_j)·z₀ underflows (`@cas/core`'s `Complex.inv` throws on an exactly-zero denominator, packages/core/src/complex.ts:100). Applied at solver-qd.mjs:65-66 only, bounded classical QDs get the guard while the power-weighted (solver-pqd.mjs:113), unbounded-power (solver-uqd-pqd.mjs:116) and both singular variants still throw or produce Inf coefficients for the same near-boundary pole configuration. The user gets a solver that works for one family and reports "Complex.inv: division by zero" for the algebraically equivalent problem in another.

**Proposed fix**

Add `branchTaylorAccumulate(result, branches, z0, L)` to `solver-qd.mjs`'s shared surface (or a new `solver-taylor-common.mjs`) and have all eight sites call it — each caller keeps only its own constant term (`phi.w0`, `cpowA(phi.w0, phi.alpha)`, the Laurent-at-∞ part). Each call site currently produces byte-identical output, so the extraction is verifiable by pinning current outputs in `app/test/solvers.test.js` before and after.

### `cd-dup-08` — Four different HTML escapers with three different character sets coexist in QD, despite QD.QoL.escapeHTML being the documented consolidation point

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | redundancy | small | `apps/quadrature-domains/app/ui-thesis.mjs:21` | `UNVERIFIED` |

**Evidence**

Five distinct escapers, three distinct escaped-character sets:

- `qol.mjs:480` — the designated home, 5 chars: `String(s).replace(/[&<>"']/g, …)`, headed "in ui.js and param-slice-ui.js (HANDOFF #35). Escapes the full attribute-safe set so it's correct in both text-content and attribute-value positions."
- `ui.mjs:375` and `param-slice/param-slice-ui.mjs:823` — thin delegations to it with an inline 5-char fallback. Correct.
- `ui.mjs:329` — `function escapeAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }` (2 chars).
- `direct/direct-ui.mjs:756` — `escapeAttr` with 3 chars (`& " <`).
- `ui-thesis.mjs:21`, `ui-faber.mjs:23`, `ui-qd-equations.mjs:29` — three byte-identical private copies of a 4-char `esc`:

```js
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
```

I checked every call site of the three `esc` copies (ui-thesis.mjs:52-114, ui-faber.mjs:112-200, ui-qd-equations.mjs:203-356) — all are text content or DOUBLE-quoted attribute values, so none is exploitable today. This is a redundancy finding with a live divergence hazard, not a current vulnerability.

**Failure scenario**

Someone adds a single-quoted attribute to one of the three copies' templates — e.g. `content.innerHTML += \`<button data-id='${esc(ex.id)}'>…\`` in ui-thesis.mjs, matching the style already used for `class=` attributes there. `esc` does not escape `'`, so an example id or a solver-produced label containing an apostrophe breaks out of the attribute; with `qol.escapeHTML` (which escapes `'` → `&#39;`) it would not. The same edit made against a file that delegates to QoL is safe. Because the three copies are private and byte-identical, a reviewer reading one has no signal that a stricter escaper is the house standard three files away.

**Proposed fix**

Delete `esc` from ui-thesis.mjs, ui-faber.mjs and ui-qd-equations.mjs and the two ad-hoc `escapeAttr`s from ui.mjs:329 and direct-ui.mjs:756; route all six through `QD.QoL.escapeHTML` using the same guarded-delegation shape ui.mjs:375 and param-slice-ui.mjs:823 already use. One escaper, the strictest set, correct in both text and attribute position.

### `cd-dup-09` — nodeIsBool is duplicated between @cas/expr's two backends — the one predicate the JS↔GLSL equivalence depends on, kept in sync only by a comment

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | redundancy | trivial | `packages/expr/src/glsl.ts:191` | `UNVERIFIED` |

**Evidence**

`packages/expr/src/evaluate.ts:182-195`:

```ts
/** Is this node boolean-valued (vs complex-valued)? Mirrors the GLSL backend's split. */
function nodeIsBool(node: Node): boolean {
  switch (node.kind) {
    case "bool": case "not": case "compare": return true;
    case "if": return nodeIsBool(node.then) || nodeIsBool(node.otherwise);
    case "seq": return nodeIsBool(node.stmts[node.stmts.length - 1]);
    default: return false;
  }
}
```

and `packages/expr/src/glsl.ts:188-204` is the identical function, with a comment naming the invariant it protects:

```ts
/** Whether a node is boolean-valued (vs complex). Mirrors evaluate.ts's nodeIsBool so both backends
 *  agree on which statements are boolean (a bool middle-statement must go through emitBool, not
 *  emitComplex, which throws on it). */
```

Both are module-private, in the same package, and no test asserts they agree. The AST they switch over is a single closed union (`packages/expr/src/ast.ts:17-28`), so any new bool-producing kind must be added to both.

**Failure scenario**

Add a short-circuit `{ kind: "and"; left: Node; right: Node }` (or an `isnan`-style predicate call) to `ast.ts` and teach evaluate.ts's `nodeIsBool` about it, missing glsl.ts's. The CPU overlay and the inspector evaluate the expression correctly; the GLSL backend classifies the node as complex-valued, routes it through `emitComplex`, and emits `return <cvec>;` from a `bool escapeFn` — a GLSL type error, so the shader fails to COMPILE at runtime for that map while every node test passes. That is precisely the H1 regression class the package already has a corpus for (`packages/gpu/src/dualBackend.ts:194-198`, ESCAPE_REGRESSION_CORPUS), which is evidence the failure mode is real rather than hypothetical.

**Proposed fix**

Move `nodeIsBool` into a shared module both backends import — `ast.ts` is the natural home (it already owns the Node union and `isFreeParameter` / `referencesVar`) — export it, and delete both private copies. One line each at the call sites (evaluate.ts:206, glsl.ts's emitBody path), and the AST union and its bool-classifier then live next to each other so adding a kind forces the update.

### `cd-dup-10` — Four private copies of complex divide/multiply/add in complex-dynamics restate @cas/expr/complexJs, which the same directory already imports elsewhere

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | small | `apps/complex-dynamics/src/render/matingEngine.ts:51` | `UNVERIFIED` |

**Evidence**

`packages/expr/src/complexJs.ts:33-36` is the canonical tuple divide:

```ts
export const div = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
```

Four byte-identical private restatements sit in the same app: `render/matingEngine.ts:51-54`, `render/interiorDE.ts:35-38`, `render/perturbationPoly.ts:179-182`, `render/rays.ts:35-38` (the last typed `Vec2`, the same shape). `cmul` is likewise duplicated at bla.ts:36, interiorDE.ts:29, matingEngine.ts:47 and perturbationPoly.ts:86, and `cadd` at bla.ts:40, interiorDE.ts:33, matingEngine.ts:45 and perturbationPoly.ts:177. The app is not avoiding the package — `render/inspect.ts:25`, `render/critical.ts:15`, `render/lamination.ts:31`, `render/yoccozPuzzle.ts:22`, `render/siegelCurves.ts:19` and `render/inverseJulia.ts:16` all already import from `@cas/expr/complexJs`. All copies agree today; I diffed them.

**Failure scenario**

Harden `complexJs.div` against overflow with Smith's algorithm (the standard fix: scale by the larger of |b0|,|b1| so a divisor near the double range does not square to Infinity). Every module importing the package gets the fix; matingEngine's `rationalInvariant`, which divides by Q(z)² at fixed points (`matingEngine.ts:559`), keeps the naive form and returns NaN multipliers for a map whose denominator is large — silently corrupting the (σ₁,σ₂) conjugacy invariant that the mating reduction oracle rests on, while the modules next door behave correctly. Beyond that, four copies is four places a future reader must check to know what CD's complex divide does.

**Proposed fix**

Delete the private `cadd`/`cmul`/`cdiv`/`cabs` in bla.ts, interiorDE.ts, matingEngine.ts, perturbationPoly.ts and rays.ts and import `add`/`mul`/`div` from `@cas/expr/complexJs` (aliasing at the import site if the short names are wanted). Purely mechanical, and the existing tests for each module pin the numerics either side.

### `cd-dup-11` — Six exports are dead: pxToPlot, renderDeltoid, exportPhiJSON, MapForm, and the two "largest offered" caps that nothing enforces

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/complex-dynamics/src/render/overlay.ts:33` | `UNVERIFIED` |

**Evidence**

An export-reference scan over every tracked source file (excluding tests, then re-run including them) found these referenced nowhere at all:

- `apps/complex-dynamics/src/render/overlay.ts:33` `export function pxToPlot(…)` — the sibling `plotToPx` has 15 call sites in the same file; `pxToPlot` has zero. The live pixel→plot inverse is `plotView.ts:435-446 uvToPlot`, which additionally inverts the active projection (`return inverseProject(view, this.plot.projCentre, proj === 2 ? "poincare" : "logpolar")`). The dead copy does not, so wiring it up under a Poincaré/log-polar projection would put hover and click-to-inspect on the wrong point.
- `apps/correspondences/src/render.ts:80` `export function renderDeltoid(image, view = DEFAULT_VIEW)`, documented "used off the UI thread / in tests" — no caller in src or test.
- `apps/quadrature-domains/app/schwarz/schwarz-export.mjs:66` `export function exportPhiJSON(phi, opts = {})` — its siblings `phiToMapSpec` and `exportPhiLink` are used; this one is not.
- `packages/interchange/src/schema.ts:68` `export type MapForm = MapSpec["form"]` — not used and not re-exported from `index.ts`.
- `apps/complex-dynamics/src/render/lamination.ts:60` `export const MAX_LAMINATION_DETAIL = 8;` — "Largest detail (period bound) offered". Never read. `main.ts:1543` takes the value straight from the slider: `const maxPeriod = Number(detailInput.value);`. The only real cap is `max="8"` in `apps/complex-dynamics/index.html:1530`.
- `apps/complex-dynamics/src/render/yoccozPuzzle.ts:26` `export const MAX_PUZZLE_DEPTH = 6;` — same story; the cap lives in `index.html:1499` `max="6"`, read at `main.ts:1435-1459`.

Also `.param-field-wide input { width: 7rem; }` at `apps/complex-dynamics/src/styles/main.css:631` — the class appears in no HTML and no TS (I verified the other scan hits, e.g. `.toast-info` and QD's `.k-*` / `.v-*` / `.algebra-<kind>`, ARE built by string concatenation and are live).

**Failure scenario**

Raise the lamination slider to `max="10"` in index.html to offer more detail. Nothing in TypeScript objects, because `MAX_LAMINATION_DETAIL` — the constant that documents the ceiling and explains it ("beyond this the landing cost climbs without much gain") — is consulted by no code path. `parameterLamination({ maxPeriod: 10 })` then enumerates denominators up to 2¹⁰−1, roughly a 16× jump in ray-landing work, on the main thread via `main.ts:1557-1558`, freezing the tab. The dead constant reads like an enforced invariant and is not one; the same holds for MAX_PUZZLE_DEPTH.

**Proposed fix**

Delete `pxToPlot`, `renderDeltoid`, `exportPhiJSON`, `MapForm` and the `.param-field-wide` rule. For the two caps, either delete them or make them load-bearing: clamp in TS (`const maxPeriod = Math.min(MAX_LAMINATION_DETAIL, Number(detailInput.value))`, likewise for depth) so the markup and the constant cannot disagree.

### `cd-dup-12` — The double-double reference-orbit loop exists three times in complex-dynamics, differing only in the per-step map

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | small | `apps/complex-dynamics/src/render/perturbationPoly.ts:259` | `UNVERIFIED` |

**Evidence**

Three functions share the same 20-line body — allocate `(cap+1)*2` floats, walk n, store `ddToNumber` samples, bail on `|Z|² > BAILOUT2`, return `{length, xy, escaped}` — and differ only in the step:

- `render/perturbation.ts:65-97 computeReferenceOrbitDDFrom` — inlines Z² (`x2 = ddSub(ddMul(zx,zx), ddMul(zy,zy)); zxzy = ddMul(zx,zy); y2 = ddAdd(zxzy, zxzy)`).
- `render/perturbationPoly.ts:52-82 computeMultibrotOrbitDD` — `const [px, py] = ddCPow(zx, zy, degree);`
- `render/perturbationPoly.ts:251-281 computePolyOrbitDD` — `const [px, py] = ddPolyEval(coeffs, zx, zy);`

The escape/store/length logic is character-for-character identical in all three (`const cap = Math.max(1, Math.floor(maxIter)); … if (rx*rx + ry*ry > BAILOUT2) { escapedAt = n; break; } … return { length, xy, escaped: escapedAt < 0 ? length : escapedAt };`), and each restates the bailout constant (`perturbation.ts:29 const BAILOUT2 = 4;` and `perturbationPoly.ts:27 const BAILOUT2 = 4; // (matches perturbation.ts)`). `glPlot.ts:1258-1266` picks among them at render time. The general one subsumes the other two: `computePolyOrbitDD(z0x, z0y, [[0,0],[0,0],[1,0]], …)` is the degree-2 case. Note the outputs are stored as f32 (`xy[2*n] = rx`), so the last-ulp differences from `ddMul`'s non-commutative low limb are far below the stored precision — this is redundancy, not a numerical discrepancy. The traversal half of the module (`perturbMultibrot:137`, `perturbPoly:312`, which are also near-identical to each other) is referenced only by tests, as the documented CPU ground truth for the GLSL kernel.

**Failure scenario**

The escape criterion in this loop is the CPU half of the GPU perturbation kernel's contract. Change the bailout in `perturbation.ts` (say to a radius-4 bailout so the smooth-iteration count matches the shader's), and the z²+c deep zoom stores an orbit truncated at the new radius while the multibrot and general-polynomial paths in perturbationPoly.ts still truncate at |Z|>2. Because `glPlot.ts:1265-1266` routes degree 2 to one function and everything else to another, the same view rendered as `z^2+c` and as the algebraically identical `z*z+c` (which takes the poly path via `extractPolyPerturbation`) can then disagree on where the reference orbit ends — and a too-short reference orbit forces early rebasing, showing up as banding artifacts at depth rather than as an obvious error.

**Proposed fix**

Collapse to one `ddOrbit(z0x, z0y, step, maxIter)` in perturbation.ts taking the per-step map as a callback (or one `computePolyOrbitDD` used everywhere, with the degree-2 and monomial cases passing the corresponding coefficient arrays), export a single `BAILOUT2`, and keep the specialized fast paths only if the render profile shows the indirection matters. `test/perturbationPoly.test.ts` already pins that these agree at degree 2, so the merge is guarded.

---

## Scope: perf — cross-cutting performance + memory

**Reviewer's summary of what was read and overall impression:**

I read every vitest config (root `vitest.config.ts`, `vitest.workspace.ts`, the five package configs, both app `vite.config.ts` test blocks, `apps/quadrature-domains/vitest.config.ts`, `packages/gpu/vitest.browser.config.ts`), both CI workflows, the QD headless runner (`app/node-test.js`, `app/test/bootstrap.js`, `app/test/harness.js`) and its 25 registered subsystem files (in depth: schwarz, direct, worker, observables, algebra-store), the ~90 QD vitest specs (in depth: prove-plan, algebra-honest-labels, algebra-verdict-labeling, algebra-verdict-rigor, algebra-rigor-badge, algebra-fold-wire, algebra-boundary-wire, qd-certified-verdict-store, sym-worker-lifecycle, param-slice-pool, worker-entry, schwarz-ui, schwarz-export, schwarz-shader-parity, qd-design-tokens, algebra-canvas-chrome, algebra-offload-kinds), the CD suite (67 files, read ~15), the correspondences suite (15 files), and all package suites. I also ran the five shared-package projects green (209 tests / 6s) and ran an independent probe of the `@cas/expr` parser's recursion limits.

Overall the suites are in unusually good health for a repo this size: the honest-labeling surface (`classifyRigor`, `rigorMeta`, `assembleVerdict`, the X1 interval Schur–Cohn / boundary certificates) is behaviourally tested rather than source-scanned, the source-scanning tests that do exist are self-guarding (the `showResult` scanner even cross-checks its own call-site count), CD's `if (!x) return` guards are all preceded by a real assertion, and there is no shared-mutable-state or timing flakiness of any consequence. The defects cluster in one specific shape: **silent-skip paths that convert a regression into a PASS**, and **hand-written mirrors standing in for code no test ever executes**. The single worst instance is `app/test/schwarz.test.js`, where seven LQD/UQD blocks turn a solver failure into an unconditional `ok(..., true)` — disarming the only regression guard for the HANDOFF #26 `phi.lqdBeta` fix exactly when it regresses. The largest untested high-risk surface is `PrimarySolverWorker` (three workers, terminate/supersede/crash paths, 381 lines) which has only `typeof x === 'function'` coverage, and no app-level GLSL is compiled anywhere in CI.

### `qd-schwarz-skip-01` — Seven LQD/UQD blocks in schwarz.test.js turn a solver failure into a PASS, disarming the HANDOFF #26 regression guard

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | trivial | `apps/quadrature-domains/app/test/schwarz.test.js:1152` | `UNVERIFIED` |

**Evidence**

Seven blocks gate every assertion on `if (r.success)` with an else branch that records a PASS, and — unlike the PQD blocks at lines 575/648/694/748/796 which do `ok('Schwarz/powerQD: solve success', r.success, r.success ? '' : r.error)` — none of them asserts that the solve succeeded:

  1151:  const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 1 });
  1152:  if (r.success) {
  ...
  1158:    ok('Schwarz/unboundedLQD-polyPart h=1 c=1: phi.lqdBeta carried through',
  1159:       (phi.lqdBeta || []).length > 0,
  1160:       'lqdBeta=' + JSON.stringify(phi.lqdBeta || []));
  ...
  1171:  } else {
  1172:    ok('Schwarz/unboundedLQD-polyPart h=1 c=1: skipped (solver failed: ' + r.error + ')', true);
  1173:  }

The same shape at 904/964, 974/1014, 1022/1081, 1091/1140, 1183/1200, 1218/1238. Lines 900–1262 contain 35 `ok(` calls, 7 of which are these skip-passes. The per-file floor in node-test.js:64 is `schwarz: 20` while the file contributes ~149 assertions, so losing 28 real assertions never trips it.

**Failure scenario**

Break the polyPart-only unbounded-LQD path so `solveInverseQD({poles:[], polyPart:[{re:1,im:0}]}, {lqd:true, unbounded:true, c:1})` returns `{success:false}` (e.g. re-introduce the pre-HANDOFF-#26 bug that dropped `phi.lqdBeta`, which also makes the solve's identity check fail). Line 1152 goes false, line 1172 records a PASS, and the `phi.lqdBeta carried through` assertion — the ONLY place in the whole repo that guards HANDOFF #26 for this configuration (grep for `lqdBeta` finds it nowhere else in app/test or vitest except param-slice fixtures) — never runs. `solvers.test.js` does not cover this hData/opts pair (its polyPart cases at 1197/1256/1289 are unboundedPQD_singular, not lqd), so `node app/node-test.js` still prints "0 failed" and the Vitest wrapper passes.

**Proposed fix**

In each of the seven blocks, hoist an unconditional success assertion before the guard, matching the PQD blocks: `ok('Schwarz/unboundedLQD-polyPart h=1 c=1: solve success', r.success, r.success ? '' : r.error); if (r.success) { … }` and delete the `else { ok(..., true) }` arm. A genuinely optional block should use a skip marker that is *not* keyed on the thing under test (e.g. an absent optional dep), never on the solver's own result.

### `corr-shader-mirror-02` — gpuAgreement.test.ts tests a hand-written TS clone of the correspondences GLSL; the real shader is never compiled or run anywhere

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | testing | small | `apps/correspondences/test/gpuAgreement.test.ts:16` | `UNVERIFIED` |

**Evidence**

The file's own header concedes the coupling is manual: "If someone changes gpu.ts's inverse, keep this mirror in sync."

  15: /** Mirror of gpu.ts `invertPhi`: cold-seed Newton for the exterior branch of φ⁻¹ (24 iters, 1e-6 tol). */
  16: function coldInvert(w: Complex): Complex {
  17:   const r = A.abs(w);
  18:   let z: Complex = r > 1.3 ? w : [(w[0] * 1.3) / Math.max(r, 1e-6), …];
  19:   for (let it = 0; it < 24; it++) { … }

and at line 98 the same for `paramGpu.ts`. Nothing in the file reads or compiles `apps/correspondences/src/gpu.ts:42-54` (`cvec invertPhi(cvec w) { … for (int it = 0; it < 24; it++) …}`) or `gpu.ts:78` (`if (length(z) < 0.999) break;` — the CORR-2 exterior-branch guard the second describe block claims to pin). `find apps -name "*.browser.test.ts"` returns nothing, and CI's `browser` job runs `pnpm test:browser` = `pnpm -C packages/gpu run test:browser`, whose config includes only `packages/gpu/test/**/*.browser.test.ts`.

**Failure scenario**

Edit `apps/correspondences/src/gpu.ts:45` from `for (int it = 0; it < 24; it++)` to `it < 6`, or delete the `if (length(z) < 0.999) break;` guard at gpu.ts:78. `pnpm test` stays 100% green (the TS mirror in the test file is unchanged), `pnpm build` succeeds (the shader is a template string, never compiled at build time), and the GPU deltoid render silently regains the branch-drift "wings" the test's header says it exists to prevent — while `gpuAgreement.test.ts` reports agreement.

**Proposed fix**

Two options, cheapest first: (a) add a source-scan cross-check in the same file that reads `src/gpu.ts` / `src/paramGpu.ts` and asserts the parameters the mirror encodes (`it < 24`, seed radius `1.3`, tolerance `1e-6`, and the literal `length(z) < 0.999` guard) still appear — so a shader edit fails the mirror loudly instead of silently; (b) better, add `apps/correspondences/test/*.browser.test.ts` reusing `@cas/gpu`'s `createProgram` to at minimum COMPILE both FRAG strings in headless WebGL2, and extend the CI `browser` job to run it (`pnpm -r --filter "./apps/*" run test:browser`).

### `qd-psw-untested-03` — PrimarySolverWorker's cancel/supersede/crash lifecycle (3 workers, 381 lines) is covered only by typeof-is-a-function assertions

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | testing | medium | `apps/quadrature-domains/app/test/worker.test.js:11` | `UNVERIFIED` |

**Evidence**

14 of the file's 15 assertions are existence checks:

  11:   ok('PrimarySolverWorker: has solve()', typeof PSW.solve === 'function');
  13:   ok('PrimarySolverWorker: has cancel()', typeof PSW.cancel === 'function');
  17:   ok('PrimarySolverWorker: has searchAlternates()', typeof PSW.searchAlternates === 'function');
  21:   ok('PrimarySolverWorker: has liveSolve()', typeof PSW.liveSolve === 'function');

The one functional assertion is itself conditional (`if (base.success) { … ok('liveSolve fallback resolves…') }`, lines 30-37), so a solver regression removes it too. Nothing anywhere exercises `_disposeWorker`'s `if (_inflight) { _inflight.reject({ aborted: true }); }` (primary-solver-worker.mjs:79-82), the supersede path `_inflight.reject({ aborted: true, superseded: true })` (:141), the worker-crash rejection (:99-103, :106-113), or the aux/live twins (:200-210, :293-303). This is precisely the surface that IS tested for `SymWorker` (vitest/sym-worker-lifecycle.test.ts, incl. a deterministic `workerStats.terminated` assertion) and for the param-slice pool (vitest/param-slice-pool.test.ts:74-92, the QDW-1 crashed-worker test) — and a reusable `vitest/helpers/web-worker-shim.mjs` already exists. Separately, the documented `runOpts.signal` branch (:159-166) is DEAD: all four call sites (`ui-solve.mjs:308`, `ui-thesis.mjs:127`, `ui.mjs:1129`, `ui.mjs:1509`) call `PSW.solve(h, o)` with no third argument.

**Failure scenario**

Delete the `_inflight.reject({ aborted: true })` line at primary-solver-worker.mjs:80 (an easy casualty of any refactor of `_disposeWorker`). `PSW.cancel()` then terminates the worker and clears `_inflight` without settling the caller's promise, so `ui-solve.mjs`'s awaited solve never resolves and the Inverse tab shows "Solving…" forever after any edit that cancels an in-flight solve. `node app/node-test.js` still passes all 15 worker assertions and the whole gate is green.

**Proposed fix**

Add `apps/quadrature-domains/vitest/primary-solver-lifecycle.test.ts` modelled on sym-worker-lifecycle.test.ts: install `helpers/web-worker-shim.mjs`, then assert (1) `cancel()` rejects the in-flight `solve()` with `{aborted:true}` and clears `isBusy()`, (2) a second `solve()` rejects the first with `{aborted:true, superseded:true}` and the new one still resolves, (3) the same for `searchAlternates`/`cancelAux` and `liveSolve`/`cancelLive`, (4) a synthetic `error` event on the shim worker rejects the in-flight job with a real Error (not an abort). Also either wire the `signal` option at the call sites or delete it plus its doc block at :16-21.

### `expr-parser-depth-04` — parser.test.ts's "not a stack overflow" test covers 1 of 3 recursion paths; unary and power chains still throw RangeError

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | small | `packages/expr/test/parser.test.ts:59` | `UNVERIFIED` |

**Evidence**

The test claims the general property but exercises only parenthesis nesting:

  59:  it("rejects pathologically nested input with a clean error (not a stack overflow)", () => {
  62:    const deep = "(".repeat(5000) + "z" + ")".repeat(5000);
  63:    expect(() => parse(deep)).toThrow(/nested too deeply/);

The MAX_DEPTH counter is bumped only in `parseExpr` (parser.ts:77-86: `if (this.depth >= Parser.MAX_DEPTH) throw new ExprError("Expression nested too deeply", …); this.depth++;`). `parseUnary` (parser.ts:118) recurses into itself and `parsePower` (parser.ts:126) recurses right-associatively, neither touching `this.depth`. I verified this empirically by running `parse` on four inputs under Vitest:
  unary minus x50000 => RangeError : Maximum call stack size exceeded
  paren x5000        => ExprError  : Expression nested too deeply
  pow chain x20000   => RangeError : Maximum call stack size exceeded
  not() nest x3000   => ExprError  : Expression nested too deeply

**Failure scenario**

A CD permalink (`decodeState` → `inpf`) or an imported `form:"expr"` interchange payload containing `"-".repeat(50000)+"z"` — well under `MAX_EXPR_LEN` (8000 chars is checked by isMapSpec but not by `parse`; 50000 dashes exceeds it, ~7900 dashes does not and still overflows on a smaller stack) — reaches `parse()` and throws `RangeError` instead of `ExprError`. `apps/complex-dynamics/src/ui/validate.ts:28` special-cases `err instanceof ExprError` to report the position, so the user gets a bare, positionless "Maximum call stack size exceeded" instead of the intended "Expression nested too deeply". The EXPR-5 hardening test passes throughout.

**Proposed fix**

Move the depth check into a shared `enter()/exit()` helper called by `parseExpr`, `parseUnary` and `parsePower` (or simply increment `this.depth` in `parseUnary`/`parsePower` too), and extend the test at parser.test.ts:59 with `expect(() => parse("-".repeat(5000)+"z")).toThrow(/nested too deeply/)` and `expect(() => parse(Array(5000).fill("z").join("^"))).toThrow(/nested too deeply/)`.

### `qd-floors-optional-dep-05` — node-test.js FLOORS of 1 for `direct` and `riemann` cannot detect the mathjs-absent degradation they were written for

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | trivial | `apps/quadrature-domains/app/node-test.js:66` | `UNVERIFIED` |

**Evidence**

The floors mechanism exists to catch a file that "drops its contribution to ~0", but the two files with an optional-dep gate are floored at 1:

  66:  riemann: 1, 'parse-check': 3, worker: 3,
  67:  'ui-inputs': 1, cmax: 3, observables: 5, …
  63:  const FLOORS = { solvers: 30, direct: 1, schwarz: 20, …

bootstrap.js:28 does `try { mathjs = require('mathjs'); } catch (e) { /* optional — sections skip if absent */ }`, and direct.test.js:22 emits `if (!mathjs) ok('Direct parser tests (mathjs not installed — skipped)', true);` plus three more skip-passes at :89, :942, :1167. Counting `ok(` inside the three mathjs-gated regions of direct.test.js gives 23 + 8 + 26 = 57 of its 162 assertions. mathjs is not optional: it is a hard entry in `apps/quadrature-domains/package.json:20` (`"dependencies": { … "mathjs": "^12.4.1" }`).

**Failure scenario**

Bump mathjs to a major that ships ESM-only (or move it to a workspace-level dependency that pnpm hoists differently, or lose it from `apps/quadrature-domains/node_modules`). `require('mathjs')` throws, is swallowed at bootstrap.js:28, and 57 of direct.test.js's parser/rational-parser/parse-h assertions plus riemann.test.js's KaTeX section become 4 unconditional passes. `direct` still contributes ~105 assertions vs a floor of 1 and `riemann` still contributes ≥1, so the suite prints "0 failed" — the whole `Direct.parsePolynomialInZ` and `QD.parseH/formatH` surface goes untested with no signal.

**Proposed fix**

Either (a) make the dep non-optional in the harness — replace the try/catch at bootstrap.js:28 with a hard `require('mathjs')` so a resolution failure crashes the runner (it is a `dependencies` entry, so absence is a broken install, not a legitimate skip) — or (b) keep the guard but set `direct: 150` and `riemann: 3` so the floors actually bracket the mathjs-present counts. (a) is preferable and simpler.

### `qd-urlstate-untested-06` — QD's share-link codec (installUrlState) has zero tests, despite share-link preservation being a stated guardrail

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | small | `apps/quadrature-domains/app/ui-url-state.mjs:26` | `UNVERIFIED` |

**Evidence**

`grep -rn "ui-url-state\|installUrlState\|writeUrlState\|applyUrlState" apps/quadrature-domains/vitest apps/quadrature-domains/app/test` returns nothing. The whole write/read field mapping is untested:

  74:  const s = { mode: state.mode };
  80:  if (state.alpha != null && state.alpha !== 1) s.a = state.alpha;
  82:  if (state.q && state.q !== '0') s.q = state.q;
  84:  if (tab && tab !== 'qd') s.tab = tab;
…and on restore:
  131:  if (s.agg != null && PRESETS[String(s.agg)]) { state.aggressiveness = String(s.agg); … }
  144:  if (tab && SWITCHABLE_TABS.has(String(tab))) { … }

`packages/interchange/test/viewstate.test.ts` covers only the envelope (encode/decode/versioning/security), never QD's field names or the write→apply round-trip. CLAUDE.md lists "preserve or migrate each app's existing share-link URL formats" as a non-negotiable guardrail. `installUrlState(ui)` takes every dependency by injection (`state`, `MODES`, `PRESETS`, `$`, four apply-helpers), so it is directly testable in jsdom with a stub `ui`.

**Failure scenario**

Rename an aggressiveness preset key in `ui-presets.mjs` (or drop one). Every previously-shared link carrying `agg` now fails the `PRESETS[String(s.agg)]` gate at line 131 and silently restores the default aggressiveness instead — a different domain than the sender saw. Likewise renaming a `SWITCHABLE_TABS` id silently lands the recipient on the QD tab. No test fails in either case.

**Proposed fix**

Add `apps/quadrature-domains/vitest/qd-url-state.test.ts` (jsdom): stub `ui` with a plain `state`, the real `MODES`/`PRESETS` imported from their modules, a `$` over a minimal DOM, and spy apply-helpers; then assert (1) writeUrlState → applyUrlState round-trips mode/h/w0m/w0/c/alpha/q/agg/tab, (2) every key writeUrlState can emit is consumed by applyUrlState (enumerate both sides and diff — this is what catches a rename), (3) the crafted-link seatbelts (`a <= 0`, `c <= 0`, unknown mode, unknown tab) are ignored rather than applied.

### `cd-shader-uncompiled-07` — CD's buildFragmentShader output is only string-asserted; no app shader is compiled in any CI job

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | medium | `apps/complex-dynamics/test/glslCodegen.test.ts:62` | `UNVERIFIED` |

**Evidence**

The df64 multiplier-map branch — the most GLSL-fragile path in a 966-line generator — is guarded only by negative substring assertions:

  62:  it("uses df64-safe barrier ops only on λ (no raw cvec arithmetic / length)", () => {
  63:    const src = buildFragmentShader(f, esc, "df64", fz, fc);
  64:    expect(src).toContain("vec3 multiplierColor(");
  65:    expect(src).not.toMatch(/lam\s*\*/);
  66:    expect(src).not.toContain("length(lam)");

Nothing ever calls `createProgram` on this string. `.github/workflows/ci.yml`'s `browser` job runs `pnpm test:browser`, which package.json:17 defines as `pnpm -C packages/gpu run test:browser`, and `packages/gpu/vitest.browser.config.ts` sets `include: ["test/**/*.browser.test.ts"]` — so only @cas/gpu's own probe shaders are ever compiled. `find apps -name "*.browser.test.ts"` is empty.

**Failure scenario**

Introduce a GLSL syntax or type error inside the `multiplierColor` emission that only appears in the `df64` build and only for a holomorphic `f` (e.g. call a `cvec`-returning helper where the df64 build expects a `vec4` barrier op). All three glslCodegen assertions still pass — they only check that certain substrings are present or absent — `pnpm typecheck` passes (it is a template string), `pnpm build` passes, and the broken program ships. Because CD is a `registerType: "autoUpdate"` PWA, the broken bundle is precached to users on next load; the multiplier map renders black or the whole plot fails to link.

**Proposed fix**

Add `apps/complex-dynamics/test/shaderCompile.browser.test.ts` that calls `createProgram(gl, VERT, buildFragmentShader(...))` over a small matrix (single/df64 × holomorphic/anti-holomorphic f × with/without fz,fc) and asserts the link succeeds; add `test:browser` scripts to the app packages and change the root script to `pnpm -r --filter "./packages/*" --filter "./apps/*" run test:browser` (missing scripts are skipped by pnpm -r). Same treatment closes the corresponding gaps for QD's Schwarz frag and correspondences (see corr-shader-mirror-02).

### `qd-interchange-e2e-08` — The QD→CD hand-off is tested as two independent hand-written literals; no test connects the real producer to the real consumer

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | small | `apps/complex-dynamics/test/importMap.test.ts:28` | `UNVERIFIED` |

**Evidence**

The CD side builds the "QD-style" envelope by hand rather than calling QD's exporter:

  28: function qdStyleLink(): string {
  29:   const env: Envelope<"quadrature-domain"> = {
  33:     payload: { phi: deltoidPhi, bounded: false, conventions: CANONICAL } as QuadratureDomain,
  36:   return encodeLink(env);

and `deltoidPhi` at :22-26 is a literal that duplicates what `apps/quadrature-domains/vitest/schwarz-export.test.ts:17` independently pins (`expect(phiToMapSpec(deltoidPhi)).toEqual({ form: "laurent", c: C(1), F: [C(0), C(0), C(0.5)] })`). The two literals agree today by hand, not by construction. QD's producer is plain `.mjs` (`schwarz-export.mjs`), so TypeScript provides no coupling either.

**Failure scenario**

Extend `phiToMapSpec` (schwarz-export.mjs:22-36) to export a family it currently returns null for — e.g. bounded-classical partial fractions as a new MapSpec form, or a `laurent` payload with a nonempty `branches` tail. `schwarz-export.test.ts` is updated alongside it and passes; CD's `envelopeToMapSpec`/`mapSpecToExpr` has no branch for the new shape and returns null or emits an unparseable expr string. `importMap.test.ts` still passes because it only ever sees its own hand-built `deltoidPhi`. The "Export map" button produces a link that CD silently refuses to open.

**Proposed fix**

Make one test import across the boundary: in `apps/complex-dynamics/test/importMap.test.ts`, replace `qdStyleLink()` with a direct call to QD's `exportPhiLink` (the QD app is a workspace sibling; a relative import of `apps/quadrature-domains/app/schwarz/schwarz-export.mjs` needs no new dependency) so the CD test decodes a link the real producer emitted. Add one case per MapSpec form `phiToMapSpec` can return, driven off its own branch list, so a new form fails CD's consumer test the day it lands.

### `cd-glcontext-restore-09` — restoreContext()'s hand-maintained 17-field GL-handle reset list has no regression guard

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | testing | small | `apps/complex-dynamics/src/render/glPlot.ts:560` | `UNVERIFIED` |

**Evidence**

Context loss is expected on this code path — attachContextHandlers' own comment at :545 says "deep df64 renders can trip the watchdog" — and recovery depends on a flat list of nulls:

  560: private restoreContext(): void {
  561:   this.programs = { single: null, df64: null };
  564:   this.histoFbo = null;
  565:   this.histoTex = null;
  …  (17 GL-handle fields in all, through)
  601:   this.quadBuffer = null; // the old handle died with the context; setupQuad makes a fresh one

I cross-checked every `private …(Tex|Fbo|Buffer|Program)` field declaration (lines 357, 358, 359, 361, 363, 364, 372, 385, 407, 408, 412, 413, 423, 424, 435, 437, 438) against the reset body: all 17 are currently present, so there is no live bug. But `grep -rln "webgl\|contextlost" apps/complex-dynamics/test` matches only importMap.test.ts (for an unrelated reason) — nothing guards the list.

**Failure scenario**

Add an 18th GPU resource (say `this.dePassTex = gl.createTexture()` for a new overlay) and forget the corresponding `this.dePassTex = null;` in restoreContext. After a GPU driver reset or a deep df64 render that trips the watchdog, `webglcontextrestored` fires, `restoreContext()` runs, and the stale texture handle from the dead context is bound on the next draw → `INVALID_OPERATION` and a black or garbage plot until reload. No test fails at any point.

**Proposed fix**

Add a source-scan guard in the CD suite (the repo already uses this idiom well — see apps/quadrature-domains/vitest/qd-design-tokens.test.ts): read `src/render/glPlot.ts`, collect every `private <name>: WebGL(Texture|Framebuffer|Buffer|Program)|null` declaration plus the `…Program: { program: WebGLProgram …}|null` shapes, and assert each identifier appears inside the `restoreContext()` body. That turns the forgotten-field class into a CI failure without needing a GL context.

### `qd-offload-tautology-10` — An offload differential test names a behaviour it never asserts, and its comparisons pass when both sides fail

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | testing | trivial | `apps/quadrature-domains/vitest/algebra-offload-kinds.test.ts:65` | `UNVERIFIED` |

**Evidence**

The test title promises a specific report; the body checks only that nothing threw:

  65:  it("runJob('eliminate') reports resultantZero when the pair shares a component", () => {
  …
  71:    // … Assert the kind returns without throwing.
  72:    expect(viaJob.ok).toBe(true);

`resultantZero` never appears in an assertion. Separately, the three genuine differentials guard their comparison bodies on the inline result being healthy:

  22:    expect(viaJob.ok).toBe(inline.ok);
  23:    if (inline.ok) { … }

so if a regression made `S.triangularize` (or `S.resolvent`) return `{ok:false}`, `viaJob.ok === inline.ok` holds with both false and the entire comparison is skipped — the test reports "byte-identical" having compared nothing.

**Failure scenario**

A change to `S.triangularize` that makes it bail out (`{ok:false}`) on the two-variable input at lines 17-19. Both the worker kind and the inline call return `{ok:false}`, line 22 passes, lines 24-28 never run, and the test named "Q2 triangularize worker kind is byte-identical to inline S.triangularize" is green while asserting nothing about chain/initials/mainVars/freeVars.

**Proposed fix**

Assert the expected shape unconditionally rather than mirroring it: add `expect(inline.ok).toBe(true)` (and the same for `resolvent`) before the differential body, so a degraded inline result fails instead of disarming the comparison. In the resultant case, assert the actual contract — e.g. `expect(viaJob.resultantZero).toBe(true)` or `expect(viaJob.generators).toEqual([])` with the documented reason field — so the test name matches what it checks.

### `qd-exact-count-guard-11` — The unconditional-rigor:'exact' guard counts call sites instead of identifying them, so the exemption can migrate silently

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | testing | trivial | `apps/quadrature-domains/vitest/algebra-verdict-labeling.test.ts:114` | `UNVERIFIED` |

**Evidence**

This is the file's own strongest honest-labeling assertion, and it is a bound on a count:

  112:  // 'exact' is the only level that claims certification, so an unconditional one is the shape a
  113:  // false '=' would take. The resolvent is the single legitimate case…
  114:  it("at most one call site asserts rigor:'exact' unconditionally", () => {
  115:    const hard = calls.filter((c) => /rigor\s*:\s*'exact'/.test(c));
  116:    expect(hard.length).toBeLessThanOrEqual(1);
  117:  });

The rest of the file is unusually careful (the scanner cross-checks its own call-site total at :99 precisely so the guard cannot silently shrink), which makes this one assertion the weak link.

**Failure scenario**

Convert the resolvent card's `rigor: 'exact'` to a conditional expression and, in the same change, hard-code `rigor: 'exact'` on a different card whose exactness is conditional (e.g. a count that is exact only when the exact filters all succeeded). `hard.length` is still 1, the test passes, and a card that is an estimate now renders the certified '=' pill — the one unacceptable bug in this codebase, with its dedicated guard green.

**Proposed fix**

Pin the identity, not the cardinality: capture a distinguishing substring from the resolvent payload (e.g. its `title`/`headline` literal) and assert `hard.length === 1 && /resolvent/i.test(hard[0])`, so moving the unconditional 'exact' anywhere else fails. Optionally assert every OTHER call site's rigor is either a conditional expression or a non-'exact' literal.

---

## Scope: pkg-core-exact — @cas/core + @cas/exact

**Reviewer's summary of what was read and overall impression:**

I read every source and test file in `packages/core` (complex.ts, algebra.ts, durand-kerner.ts, series.ts, sphere.ts, index.ts, bench.mjs, README, all 4 test files = 43 passing tests) and `packages/exact` (gaussian.ts, qiPoly.ts, biPoly.ts, resultant.ts, render.ts, index.ts, README, both test files = 20 passing tests), plus every consumer call site (CD critical.ts / matingEngine.ts / dynatomic.ts / uniformize.ts / sphereView.ts, QD faber-analysis.mjs / direct-common.mjs / taylor.mjs / sphere-common.mjs / ui-faber.mjs, corr correspondence.ts / deltoid.ts / deltoidExact.ts / correspondenceCurve.ts). Everything below was verified by running the built `dist/` under Node, not by reading alone. ADR-0006 compliance is clean: a grep for `Math.PI` / `TAU` / `2*pi*i` across both `src/` trees returns nothing but a comment about string tokenizing. The exact-arithmetic algebra is genuinely sound — I differentially validated `bareissDet` against an independent cofactor-expansion oracle over 400 random QiPoly matrices (205 of them with zero diagonals, forcing the pivot-swap branch): zero mismatches, and it does not mutate its input. `resultant`, `discriminant`, `QiPoly.divmod/gcd/squarefreePart`, `BiPoly.divmodMonic`, `Frac`/`Gauss` normalization, and both stereographic branches all check out. The serious problems are concentrated in the FLOATING-POINT kernel, not the exact one, and they share one root cause: `@cas/core` has no range discipline. `Complex.div` computes `|b|²` unscaled, so it silently produces NaN above ~1.3e154; Durand–Kerner then swallows that NaN because `NaN > maxDelta` is false, and reports `converged: true` with all-NaN roots. That is an estimate — in fact a non-answer — wearing a certification, and I reproduced it through QD's *shipping* Faber root-finder at an in-range order. Overall health: the exact package is in good shape apart from one dead sign line, one BigInt→double conversion cliff, and a whole untested module; the numeric package needs the convergence-honesty fix before anything else. Worth considering as follow-on extensions (not reported as findings): a `DurandKernerResult.nonFinite` flag plus an optional post-hoc residual check so consumers can distinguish "diverged" from "hit the iteration cap", and a shared `residualOf` helper — corr's `correspondence.ts` already hand-rolls one and CD's `dynatomic.ts` would benefit from the same guard.

### `cd-dk-01` — Durand–Kerner reports `converged: true` with all-NaN roots — a non-answer labelled certified

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **critical** | correctness | trivial | `packages/core/src/durand-kerner.ts:120` | `UNVERIFIED` |

**Evidence**

Lines 117-121:
```ts
const delta = alg.div(evalMonic(zi), denom);
ziNext = alg.sub(zi, delta);
const dm = alg.abs(delta);
if (dm > maxDelta) maxDelta = dm;
```
and line 127: `if (maxDelta < tol && !skipped) { converged = true; ... }`.

When any intermediate goes non-finite, `delta` is NaN, so `dm` is NaN. `NaN > maxDelta` evaluates to **false**, so `maxDelta` is never updated and stays at its initialiser `0`. Then `0 < tol` succeeds and the kernel declares convergence. `alg.isFinite` is consulted ONLY under the opt-in `bailOnNonFinite` flag (line 123), which four of the six call sites do not set.

Verified against the built dist:
```
dk(() => ({re: NaN, im: 0}), [z0, z1], {maxIter: 50})
  -> converged = true  iterations = 1  roots = [{re:NaN,im:NaN},{re:NaN,im:NaN}]
```
and through real polynomials (roots on a circle, seeds at 1.2R):
```
 n=80  R=10   : converged=true iters=19 nonFiniteRoots=80/80
 n=200 R=2    : converged=true iters=41 nonFiniteRoots=200/200
 n=40  R=1e5  : converged=true iters=1  nonFiniteRoots=40/40
```
Identical through both reference algebras (obj and tuple), and `onCoincident:"nudge"` does not rescue it (`abs2(NaN) < 1e-300` is false, so the coincidence branch is never taken).

**Failure scenario**

Reproduced through QD's SHIPPING root-finder, at an order the UI allows. `apps/quadrature-domains/app/ui-faber.mjs:158` clamps the Faber order to 1..30; `faber-analysis.mjs:163` calls this kernel. Feeding `QD.FaberAnalysis.polynomialRoots` a degree-30 monic whose coefficients have magnitude 1e6 (an ordinary Cauchy bound for a domain with capacity > 1) gives:
```
  coeff scale=1e4: converged=false iters=200 nonFiniteRoots=0/30   <- correct behaviour
  coeff scale=1e6: converged=true  iters=1   nonFiniteRoots=30/30  <- WRONG
  coeff scale=1e8: converged=true  iters=1   nonFiniteRoots=30/30  <- WRONG
```
The Newton polish at faber-analysis.mjs:170-180 does not repair it (NaN in, NaN out). `ui-faber.mjs:142-145` then renders `"✓ root-finder converged for all orders shown"` while plotting 30 NaN roots — the exact opposite of the warning path at lines 146-150 that the module's own docstring (faber-analysis.mjs:112) promises: "on a failure to converge we return converged:false (callers surface a warning) rather than emitting garbage silently".

The blast radius is every consumer's safety net, because they all key off this one flag. `apps/correspondences/src/correspondence.ts:78-80` filters spurious branches by residual ONLY on the non-converged path (`res.converged ? res.roots : res.roots.filter(...)`) — so the filter is bypassed precisely when it is needed. `apps/complex-dynamics/src/combinatorics/dynatomic.ts:125` discards the flag entirely (`return res ? res.roots : []`), feeding NaN parabolic parameters into `main.ts:788-791`, which prints them in a sentence that opens `"(= exact)"`. `apps/complex-dynamics/src/render/matingEngine.ts:541-542` carries a comment asserting "onCoincident:'skip' keeps every iterate finite (no bailOnNonFinite)" — that assertion is false. Only `apps/complex-dynamics/src/render/critical.ts:172` is safe, because it passes `bailOnNonFinite: true`.

**Proposed fix**

Make non-finiteness block convergence unconditionally, independent of the `bailOnNonFinite` opt-in. Two one-line changes: (1) replace line 120 with the NaN-propagating comparison `if (!(dm <= maxDelta)) maxDelta = dm;` so a NaN delta poisons `maxDelta`, making `maxDelta < tol` false; (2) move the finiteness check out from under the flag — `if (!alg.isFinite(ziNext)) { if (bail) return null; nonFinite = true; }` — and add `&& !nonFinite` to the guard on line 127, mirroring the existing `skipped` guard (which was added for exactly this class of bug, per the comment on line 114). Both keep every currently-converging input bit-identical, since `dm` is finite there. Then add a golden test asserting `converged === false` for `evalMonic = () => NaN` and for the degree-80/R=10 case above — the existing `bailOnNonFinite` test at durand-kerner.test.ts:115 covers only the opt-in path and is why this survived.

### `cd-div-02` — `Complex.div` / `tupleAlgebra.div` compute |b|² unscaled: NaN above 1.3e154, spurious "division by zero" below 1.5e-162

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `packages/core/src/complex.ts:104` | `UNVERIFIED` |

**Evidence**

complex.ts:103-107:
```ts
div(a: Cx, b: Cx): Cx {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new Error("Complex.div: division by zero");
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
},
```
and the byte-identical copy in `packages/core/src/algebra.ts:76-80` (`tupleAlgebra.div`). `Complex.inv` (complex.ts:98-102) has the same shape.

Squaring halves the usable exponent range: `d` overflows to `Infinity` for |b| ≳ 1.34e154 and underflows to exactly 0 for |b| ≲ 1.49e-162, in both cases for a perfectly representable, perfectly ordinary complex number. Measured on the built dist:
```
Complex.div({re:1e200,im:0}, {re:1e200,im:0}) -> {re: NaN, im: 0}   (true answer: 1)
Complex.div({re:1,im:0},     {re:1e200,im:0}) -> {re: 0,   im: 0}   (true answer: 1e-200)
Complex.div({re:1,im:0},     {re:1e-200,im:0}) -> THROWS "Complex.div: division by zero"
tupleAlgebra.abs2([1e200,0]) -> Infinity ;  tupleAlgebra.abs2([1e-200,0]) -> 0
```
The overflow case is the silent one and is the direct cause of finding cd-dk-01: the Durand–Kerner denominator is a product of (n−1) differences, so |denom| crosses 1.34e154 at very ordinary sizes — degree 40 with roots on |z| = 1e5, or degree 200 on |z| = 2.

**Failure scenario**

Two distinct wrong behaviours from one line. (a) Silent: any consumer dividing two large-but-finite complex numbers gets NaN instead of a finite quotient — `Complex.div({re:1e200,im:0}, {re:1e200,im:0})` returns `{re: NaN, im: 0}` where the answer is exactly 1. Inside `makeDurandKerner` this is the NaN that finding cd-dk-01 then mislabels as convergence. (b) Loud but wrong: `Complex.div({re:1,im:0}, {re:1e-200,im:0})` throws "division by zero" for a denominator that is manifestly nonzero, so a caller's legitimate `try/catch` around a genuine zero-divisor now also fires on a healthy tiny one. QD's PQD/Schwarz solvers call `C.div` in Newton residual loops where a near-converged residual of 1e-200 is exactly the expected magnitude.

**Proposed fix**

Keep the existing fast path so every currently-well-defined input stays bit-identical, and add a scaled fallback only where the current code is already broken. In both `Complex.div`/`inv` and `tupleAlgebra.div`: after computing `d`, replace the `if (d === 0) throw` with `if (d === 0 || !Number.isFinite(d))`, and inside that branch first test whether `b` is actually zero (`b.re === 0 && b.im === 0` → throw as today), otherwise fall through to Smith's algorithm — divide numerator and denominator through by the larger of |b.re|, |b.im| before forming the quotient. This is a self-contained change to three functions, and it removes the overflow half of cd-dk-01 at the source rather than only masking it.

### `cd-alias-03` — `Complex.addMulInto` silently corrupts the imaginary part when aliased, contradicting the block comment that explicitly promises aliasing is safe

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | trivial | `packages/core/src/complex.ts:92` | `UNVERIFIED` |

**Evidence**

The in-place group is introduced by this contract at complex.ts:63-69:
```ts
// In-place arithmetic variants. ... Use in tight inner loops
// (per-pixel solver, branch sums) to remove allocator + GC pressure.
// SAFE TO ALIAS: `out` may be the same object as `a` or `b`.
```
Every member honours it except the accumulator, complex.ts:92-96:
```ts
addMulInto(a: Cx, b: Cx, out: Cx): Cx {
  out.re += a.re * b.re - a.im * b.im;
  out.im += a.re * b.im + a.im * b.re;
  return out;
},
```
When `out === a`, line 93 overwrites `a.re` before line 94 reads it, so the imaginary part is computed from the already-updated real part. `mulInto` (lines 70-75) gets this right by staging `const re = ...` in a temp first — `addMulInto` simply omits that stage.

Measured on the built dist:
```
a=(1,2) b=(3,4)
  addMulInto(a,b,a) -> {re:-4, im:-8}   want {re:-4, im:12}   *** WRONG ***
  addMulInto(a,b,b) -> {re:-2, im: 4}   want {re:-2, im:14}   *** WRONG ***
  addMulInto(a,a,a) -> {re:-2, im:-6}   want {re:-2, im: 6}   *** WRONG ***
  addMulInto(a,b,o) -> {re:-4, im:12}   OK  (disjoint out only)
  mulInto(a,b,a) / mulInto(a,b,b) -> both OK (control)
```
The real part is always correct, so the corruption is confined to the imaginary component — it will not show up in any magnitude-only smoke test.

**Failure scenario**

Latent today (I grepped every call site: `addMulInto` appears only in `packages/core/test/complex.test.ts:43` and `apps/quadrature-domains/app/test/param-slice.test.js:245-246`, both with a disjoint `out`), but it is a live trap because the documented contract invites exactly the misuse. The canonical zero-allocation Horner loop for the per-pixel solver the comment advertises is `Complex.addMulInto(acc, z, acc)` — accumulate `acc += acc·z`. Written that way against the stated guarantee, a caller evaluating p(z) = (1+2i) at z = (3+4i) gets `{re:-4, im:-8}` instead of `{re:-4, im:12}`: a silently wrong polynomial value on the hot path, in the one component nobody eyeballs. The package's own test at complex.test.ts:34 is titled "in-place ops match their functional twins **and may alias**" yet exercises aliasing only for `mulInto` (line 40), which is why the promise was never checked against the accumulator.

**Proposed fix**

Stage both components before writing, exactly as `mulInto` already does:
```ts
addMulInto(a: Cx, b: Cx, out: Cx): Cx {
  const re = a.re * b.re - a.im * b.im;
  const im = a.re * b.im + a.im * b.re;
  out.re += re;
  out.im += im;
  return out;
},
```
No behaviour change for disjoint `out` (same operands, same operation order, bit-identical). Then extend the aliasing assertions in complex.test.ts:34-45 to cover `out===a`, `out===b`, and `out===a===b` for **every** member of the in-place group, not just `mulInto`.

### `cd-perf-04` — `Gauss.mul` always runs the 4-multiplication complex form — 4.1× the real-only cost, and CD's entire exact tower is real

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | trivial | `packages/exact/src/gaussian.ts:130` | `UNVERIFIED` |

**Evidence**

gaussian.ts:130-136:
```ts
mul(o: Gauss): Gauss {
  // (a+bi)(c+di) = (ac − bd) + (ad + bc) i
  return new Gauss(
    this.re.mul(o.re).sub(this.im.mul(o.im)),
    this.re.mul(o.im).add(this.im.mul(o.re)),
  );
}
```
Unconditionally: 4 `Frac.mul` + 1 `Frac.sub` + 1 `Frac.add` = 6 `Frac.of` calls, each running a `bigGcd` normalisation (gaussian.ts:38-46) and allocating. When both imaginary parts are zero the answer needs exactly one of those six.

Measured on the built dist, 300 000 iterations with 30-digit BigInt operands, both operands real:
```
  Gauss.mul (full complex form, both im = 0): 118ms
  real-only shortcut equivalent             :  29ms   (4.1x)
  Frac.of with d = 1 (the bigGcd)           :  28ms
  QiPoly.mul(deg120, deg120), all-real      : 9.0ms per multiply
```
I also confirmed this is the dominant cost and NOT the repeated `leadingCoeff().inv()` inside `divmod` (2 ms per 2000 calls vs 3631 ms for the divmods themselves), so hoisting that inverse would be noise — the multiply is the target.

**Failure scenario**

CD's whole `apps/complex-dynamics/src/combinatorics/dynatomic.ts` tower — critical orbit, Gleason G_n, dynatomic Φ_n, `multiplierMap`, and the Sylvester/Bareiss resultant — is built from `QiPoly.variable()` and `Gauss.int(...)`, so every single Gauss in it has `im = Frac.ZERO`. It pays the 4× on 100% of its multiplies. Measured end-to-end on the same pipeline: `multiplierSpecializationPoly(3, 1)` = 31 ms, `(4)` = 823 ms. `main.ts:786-791` runs the n ≤ 3 case **twice** (λ₀ = 1 and λ₀ = −1) plus `mandelbrotCenters(n)`, synchronously, from the `input` event handler at main.ts:796 — so every keystroke in the period box blocks the main thread on ~70 ms of BigInt arithmetic that is ~4× larger than it needs to be. Correspondences' curve is likewise real for the deltoid.

**Proposed fix**

Add a real-real fast path at the top of `Gauss.mul`: `if (this.im.isZero() && o.im.isZero()) return new Gauss(this.re.mul(o.re), Frac.ZERO);`. Six `Frac.of`/`bigGcd` normalisations collapse to one, and the result is bit-identical by construction (the dropped terms are exactly zero, and `Frac` is normalised, so the values cannot differ). Optionally add the mixed real×complex case (`this.im.isZero()` alone → `new Gauss(this.re.mul(o.re), this.re.mul(o.im))`, 4 ops → 2). `Gauss.add`/`sub` already do only 2 Frac ops and need nothing.

### `cd-cpow-05` — `Complex.cpow` squares the modulus first, so |a| < 1e-150 returns exactly 0 and |a| > 1.3e154 returns {Infinity, NaN}

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | trivial | `packages/core/src/complex.ts:141` | `UNVERIFIED` |

**Evidence**

complex.ts:141-147:
```ts
cpow(a: Cx, p: number): Cx {
  const mag2 = a.re * a.re + a.im * a.im;
  if (mag2 < 1e-300) return { re: 0, im: 0 };
  const r = Math.pow(mag2, 0.5 * p);
  const ang = Math.atan2(a.im, a.re) * p;
  return { re: r * Math.cos(ang), im: r * Math.sin(ang) };
},
```
The docstring above it justifies the guard as "a = 0 returns 0 (valid for p > 0)" — but the guard fires for every |a| below 1e-150, which is 150 orders of magnitude away from zero, and forming `mag2` at all costs half the exponent range on the other end.

Measured on the built dist:
```
cpow({re:1e-160, im:0}, 0.5) -> {re: 0, im: 0}                (true answer: 1e-80)
cpow({re:1e-160, im:0}, -1 ) -> {re: 0, im: 0}                (true answer: 1e160)
cpow({re: 1e200, im:0}, 0.5) -> {re: Infinity, im: NaN}       (true answer: 1e100)
```
The `{Infinity, NaN}` case is the nastiest shape: `r*cos(0)` = Infinity but `r*sin(0)` = Infinity*0 = NaN, so the two components disagree about what went wrong.

**Failure scenario**

`Complex.cpow` is the shared principal-branch power behind QD's entire power-weighted-QD family — ~30 call sites across `solver-pqd.mjs`, `solver-pqd-singular.mjs`, `solver-uqd-pqd.mjs`, `schwarz-common.mjs`, `schwarz-analysis.mjs`, `direct-common.mjs` and `seeds-pqd.mjs`, most of them of the form `C.cpow(v, 1/alpha)` (the αth-root). Take `schwarz-common.mjs:465` `cRoot = (v) => C.cpow(v, 1/alpha)` with α = 4 and an argument of modulus 1e-160: the correct 4th root is 1e-40, comfortably representable and numerically meaningful, but the function returns exactly 0 — the subsequent division or comparison then sees a hard zero instead of a small number, with no error, no NaN, and nothing to notice. Symmetrically, `C.cpow(w0, alpha)` with α = 0.5 and |w0| = 1e200 returns `{Infinity, NaN}` where 1e100 is representable.

**Proposed fix**

Keep the squared-modulus fast path so the normal range stays bit-identical, and fall back to the full-range form only outside it. Replace the guard with `if (mag2 === 0) return { re: 0, im: 0 };` and compute `const r = (mag2 > 1e-300 && Number.isFinite(mag2)) ? Math.pow(mag2, 0.5 * p) : Math.pow(Math.hypot(a.re, a.im), p);`. `Math.hypot` is itself overflow/underflow-safe, so this covers the whole double range. Add golden cases at complex.test.ts:60-67 (which today has four assertions, all with |a| ∈ [1, 4]) pinning `cpow(1e-160, 0.5) === 1e-80` and `cpow(1e200, 0.5) === 1e100`.

### `cd-disc-06` — `discriminant`'s `(−1)^{d(d−1)/2}` sign line is dead — `primitivePoly` overwrites the sign, so the returned value is not the discriminant the docstring promises

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `packages/exact/src/resultant.ts:129` | `UNVERIFIED` |

**Evidence**

resultant.ts:121-131, whose docstring states the contract as "disc(A) = (−1)^{d(d−1)/2} · Res(A, A′) / lc(A)":
```ts
const res = resultant(coeffs, B);
const lead = coeffs[d] ?? QiPoly.zero();
let disc = res.divExact(lead);
if (Math.floor((d * (d - 1)) / 2) % 2 === 1) disc = disc.neg();
return primitivePoly(disc);
```
Line 130's `primitivePoly` → `integerPrimitive([p])` re-derives the sign from scratch at resultant.ts:38-47, choosing `sign` so the leading coefficient comes out positive. Whatever line 129 did is therefore discarded: `primitivePoly(disc.neg()) === primitivePoly(disc)` for every input. Line 129 is provably dead code.

Verified on the built dist:
```
discriminant([1, 1, c])  (i.e. c·x² + x + 1) -> -1 + 4c      true disc = 1 - 4c   (sign flipped)
discriminant([-1, 0, 0, 1]) (i.e. x³ - 1)    -> 1            true disc = -27
discriminant([1, 0, 1])     (i.e. x² + 1)    -> 1            true disc = -4
```
The magnitude is intentionally cleared (documented as "content-cleared (primitive) form"), but the *sign* is not — the docstring names a specific sign convention that the implementation does not deliver.

**Failure scenario**

Harmless for the one shipped consumer and dangerous for the next. `apps/correspondences/src/exact/correspondenceCurve.ts:196` uses `discriminant` only for the cusp locus — the ZERO SET of disc_w C — where sign is irrelevant (and indeed `disc_w(2w² − z̄²w − z̄)` correctly comes out as z̄⁴ + 8z̄). But the returned object is a `QiPoly` advertised by its own docstring as the discriminant, and the classic second use of a discriminant is its sign: for a real quadratic, disc > 0 ⟺ two distinct real roots. A caller reaching for `discriminant([−2, 0, 1])` (x² − 2, true disc = +8, two real roots) and `discriminant([1, 0, 1])` (x² + 1, true disc = −4, complex pair) gets `1` for **both** and concludes both have real roots. In a package whose README opens with "there are exactly two real solutions" as its motivating claim, a sign-destroying discriminant that documents itself as sign-carrying is a live trap.

**Proposed fix**

Pick one and make the code and docstring agree. Either (a) delete the dead line 129 and change the docstring to say the return value is the content-cleared *zero-locus generator*, sign not meaningful — cheapest, matches every current use; or (b) keep the sign convention and stop normalising it away: split `integerPrimitive`'s two jobs so `discriminant` uses a content-clearing helper that scales by |1/(L·G)| without the leading-coefficient sign flip at resultant.ts:38-47. Either way add the golden values `disc(x²+1) = −4`, `disc(x²−2) = 8`, `disc(x³−1) = −27` to a resultant test file (see cd-test-08 — there is none today).

### `cd-frac-07` — `Frac.toNumber()` returns NaN when numerator and denominator both exceed 1.8e308 — and it is the only bridge from the exact engine to the numeric plane

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `packages/exact/src/gaussian.ts:81` | `UNVERIFIED` |

**Evidence**

gaussian.ts:81-83:
```ts
toNumber(): number {
  return Number(this.n) / Number(this.d);
}
```
`Number(bigint)` saturates to `Infinity` past ~1.8e308. When only the numerator saturates the result is ±Infinity; when both do it is Infinity/Infinity = **NaN**, even though the ratio itself is perfectly ordinary — and `Frac` is stored in lowest terms, so "both huge" is a normal state (2^1400 / 3^900 is already in lowest terms).

Verified on the built dist:
```
const f = Frac.of(10n**400n, 3n*10n**400n + 1n);   // ~1/3, lowest terms, 401 digits each
f.toNumber()          -> NaN            (true value ≈ 0.3333)
new Gauss(f, Frac.ZERO).toTuple() -> [NaN, 0]
```
`Gauss.toTuple()` (gaussian.ts:163-165) inherits it verbatim, and `toTuple` is the *sole* crossing point between the exact and numeric halves of the suite.

**Failure scenario**

`apps/complex-dynamics/src/combinatorics/dynatomic.ts:108` is the crossing: `const coeffs = p.coeffs.map((c) => c.toTuple());`, immediately followed by `A.div(c, lead)` at line 111 to monicise and a Durand–Kerner solve at line 124. A single NaN coefficient makes every seed evaluation NaN, and by finding cd-dk-01 the solver then returns `converged: true` with NaN roots, which `rootsOfQiPoly` hands straight to `mandelbrotCenters` / `multiplierSpecializationRoots` and thence to the read-out at main.ts:791 that begins `"(= exact)"`. I confirmed the shipped caps do not reach it today — G_1..G_6 top out at 4-digit coefficients, and the n ≤ 3 multiplier specialisation at 7 — but the growth is super-exponential and the margin is thinner than it looks: the very next case, n = 4, already produces 19-digit coefficients from an unchanged code path, and any `monic()` / `gcd()` / `squarefreePart()` (dynatomic.ts:229 calls the last of these) introduces a large denominator alongside the large numerator, which is exactly the both-huge shape that yields NaN rather than a merely-clipped Infinity.

**Proposed fix**

Divide out the shared magnitude before converting. Compute the bit lengths of |n| and |d| (`BigInt(x.toString(2).length)` or a shift loop), and if either exceeds ~1000 bits, right-shift both by `max(bitLen(n), bitLen(d)) − 1000` before the `Number()` conversion; the shift cancels in the ratio, so the result is accurate to full double precision instead of NaN. Keep the existing one-liner as the fast path for the overwhelmingly common small case. Add a test pinning `Frac.of(10n**400n, 3n*10n**400n).toNumber()` ≈ 1/3 and `Gauss.int(10n**400n).toTuple()[0] === Infinity` (a saturating value is acceptable; NaN is not).

### `cd-test-08` — `resultant.ts` has zero package-level tests, and the README claims tests for it that do not exist

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | medium | `packages/exact/test/exact.test.ts:1` | `UNVERIFIED` |

**Evidence**

`packages/exact/src/resultant.ts` is 131 lines exporting five public symbols — `integerPrimitive`, `primitivePoly`, `bareissDet`, `resultant`, `discriminant` (all re-exported from `packages/exact/src/index.ts:20`). A grep for `resultant|discriminant|bareiss|Primitive` across `packages/exact/test/` returns **nothing**. The suite is `exact.test.ts` (Frac / Gauss / QiPoly / render, 14 tests) and `biPoly.test.ts` (BiPoly, 6 tests) — 20 tests, all green, none touching the module.

Worse, `packages/exact/README.md:72-73` asserts otherwise:
> "`test/exact.test.ts` and `test/biPoly.test.ts` — golden values plus algebraic identities (e.g. `resultant(f, g)` vanishing exactly when `f` and `g` share a root)."

That identity is not tested anywhere in the package. The README then argues "Exactness makes these assertions unusually strong: there is no tolerance to tune, so a regression cannot hide inside one" — a guarantee resting on tests that do not exist.

This matters most for the zero-pivot row-swap branch at resultant.ts:70-78 (`while (r < n && a[r][k].isZero()) r++;` plus the `sign = -sign` swap), the one place in the module where fraction-free elimination could plausibly lose exactness. I wrote the differential test the package lacks — `bareissDet` vs an independent cofactor-expansion oracle, 400 random QiPoly matrices of size 1..5, half seeded with 45% zero entries so 205 trials forced the swap branch — and got **0 mismatches**, plus confirmation that the input matrix is not mutated. So the code is correct today; nothing pins it there.

**Failure scenario**

A refactor of `bareissDet`'s pivoting (say, adding a degree-minimising pivot choice to control coefficient swell — a natural optimisation for the n = 4 case that currently takes 823 ms) changes `sign` handling or breaks the `divExact(prev)` exactness invariant. `pnpm -C packages/exact test` stays green at 20/20 because nothing in the package exercises the module. The break surfaces only downstream: corr's cusp locus silently becomes `−(z̄⁴ + 8z̄)` or an inexact-division throw, CD's `multiplierSpecializationPoly` returns a wrong-degree polynomial, and the first signal is a wrong picture — the failure lands two packages away from the edit, which is precisely the multiplication effect a shared package's corpus exists to prevent.

**Proposed fix**

Add `packages/exact/test/resultant.test.ts` pinning what I verified by hand: `Res(x−1, x−2) = −1`, `Res(x²+1, x²−1) = 4`, `Res(2x+1, 3x+2) = 1`, `Res(x²−1, x−1) = 0` (the shared-root identity the README already claims), the degenerate-degree cases `Res(A, const) = const^deg A` and `Res(const, B)`, `disc_w(2w² − z̄²w − z̄) = z̄⁴ + 8z̄` (the deltoid, currently pinned only in the corr app's tests), `disc(c·x² + x + 1)`, `bareissDet` against a cofactor oracle **including matrices with zero diagonals** so the swap branch at lines 70-78 is covered, non-mutation of the input matrix, and `integerPrimitive`'s two documented behaviours (joint scaling across the list; sign taken from the LAST polynomial and applied to all — note this flips earlier polynomials too, e.g. `integerPrimitive([1+2x, 1−3x])` returns `[−1−2x, −1+3x]`, which no test records). Then correct README.md:72-73 to describe the tests that actually exist.

### `cd-doc-09` — `@cas/core` README claims the series multiply uses "error-free splits for accuracy" — it is a plain convolution

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | maintainability | trivial | `packages/core/README.md:66` | `UNVERIFIED` |

**Evidence**

README.md:64-66:
> "**Formal series** — `makeSeries(alg)` returns `{ zeros, unit, mul }` for truncated power-series arithmetic (`Series<C>` = coefficient array, index `i` = coefficient of `xⁱ`), using error-free splits for accuracy."

The implementation, `packages/core/src/series.ts:50-64`, is an ordinary schoolbook convolution with plain accumulation:
```ts
out[i + j] = alg.add(out[i + j], alg.mul(ai, bj));
```
There is no error-free transformation anywhere in the package: grepping `packages/core/src/` for `error-free|two.?product|dekker|fma|split` matches exactly one line — complex.ts:170, a comment about splitting a *string* on `+`/`-` during parsing. `series.ts`'s own header (lines 10-12) states the opposite of the README, and correctly: "the two apps' multiplies are bit-for-bit identical (same convolution, same accumulation order; a zero-coefficient skip is just a `+0` no-op), so sharing it changes no numerics in either app."

**Failure scenario**

A maintainer extending the series layer — CD's `uniformize.ts` inverse-Böttcher recurrences at orders in the hundreds (`seriesMul` at uniformize.ts:55, called from `seriesPow`, `seriesInverse`, and the Lagrange-inversion loop at line 101), or QD's `taylor.mjs:46` — reads the kernel README, believes the shared multiply is compensated, and skips the error analysis for a long recurrence where rounding accumulates over ~n² additions. Concretely, a 1024-order multiply performs ~525 000 unguarded complex fused accumulations; nothing in the code bounds that error, but the README says accuracy is handled. In a repo whose paramount rule is that `=` means exact and `≈` means estimate, an unbacked numerical-accuracy claim in the README of the highest-trust package is the documentation form of the same defect.

**Proposed fix**

Delete the "using error-free splits for accuracy" clause from README.md:66 and replace it with what `series.ts:10-12` already says accurately — a truncated dense convolution, bit-identical to the two apps' former inline loops, with zero-coefficient skips as a pure `+0` no-op. (If compensated summation is genuinely wanted later, that is a separate change with its own golden tests; it must not be claimed before it exists.)

### `cd-dead-10` — Unused in-place exports (`addInto`/`subInto`/`scaleInto`) and `BiPoly.monomial` — untested, unconsumed API, and the vector by which cd-alias-03 survived

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `packages/core/src/complex.ts:76` | `UNVERIFIED` |

**Evidence**

complex.ts:76-90 declares three in-place variants:
```ts
addInto(a: Cx, b: Cx, out: Cx): Cx { ... }
subInto(a: Cx, b: Cx, out: Cx): Cx { ... }
scaleInto(a: Cx, s: number, out: Cx): Cx { ... }
```
Grepping every `.ts`/`.mjs`/`.js` under `apps/` and `packages/` (excluding `node_modules` and `dist`): `subInto` and `scaleInto` have **zero** occurrences outside their own declaration — no consumer, no test. `addInto` has exactly one, and it is a stale comment: `apps/quadrature-domains/app/test/param-slice.test.js:228` reads `// ---- Complex.mulInto / addInto / addMulInto: in-place variants ----`, but the block below it (lines 229-250) calls only `mulInto` and `addMulInto`. `packages/core/README.md:52-53` advertises all five.

Same pattern in the exact package: `BiPoly.monomial` (biPoly.ts:46-51) has zero call sites and zero tests. `QiPoly.monomial` and `makeSeries().unit` are each referenced only by their own package's test (exact.test.ts:44, series.test.ts:58) — used to check themselves, by nothing else.

**Failure scenario**

This is what let cd-alias-03 ship. The in-place group carries a single shared contract comment (complex.ts:66, "SAFE TO ALIAS") covering five functions; `complex.test.ts:34-45` verifies the aliasing claim for exactly one of them, and three of the five have no consumer to notice. `addMulInto` is broken under aliasing and nobody found out, because the only code that could have is the tests that were never written for the API that nobody uses. Under ADR-0007's demand-driven rule these primitives should not have been added ahead of a second consumer; having been added, they are unverified surface that the README tells consumers to rely on.

**Proposed fix**

Either delete `addInto`/`subInto`/`scaleInto` and `BiPoly.monomial` (and their README lines) under the demand-driven rule, re-adding them the day a caller needs them — or, if the group is kept for API symmetry, cover all five in-place variants in `complex.test.ts` with the full aliasing matrix (`out===a`, `out===b`, `out===a===b`), which is the change that would have caught cd-alias-03. Also fix the stale comment at param-slice.test.js:228 to name only the functions the block actually exercises.

### `cd-res-11` — `resultant` returns 1 instead of 0 for a zero-polynomial argument, contradicting its own "Res = 0 ⟺ shared root" contract

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `packages/exact/src/resultant.ts:101` | `UNVERIFIED` |

**Evidence**

resultant.ts:100-104:
```ts
export function resultant(A: readonly QiPoly[], B: readonly QiPoly[]): QiPoly {
  const p = A.length - 1;
  const q = B.length - 1;
  const N = p + q;
  if (N <= 0) return QiPoly.int(1);
```
Degrees are taken as `length − 1` with no check that the list is non-empty or that the top entry is nonzero. An empty list gives `p = −1`, which drives `N` down and short-circuits to the constant 1. The docstring three lines above states: "Res = 0 ⟺ A and B share a root (in the outer variable) over the algebraic closure" — and the zero polynomial shares every root with everything.

Verified on the built dist:
```
resultant([-1, 1], [])   ->  [1]      // Res(x−1, 0); correct answer is 0
```
For contrast, the non-degenerate cases are all correct: `Res(x−1, x−2) = −1`, `Res(x²+1, x²−1) = 4`, `Res(x²−1, x−1) = 0`, `Res(x−1, 5) = 5`, `Res(3, 5) = 1`.

**Failure scenario**

Not reachable from either current consumer — corr passes `curve.wCoeffs` whose top entry is provably the nonzero `c` (correspondenceCurve.ts:99 via `deflateTrivial`), and CD passes `phi.coeffs` / `mMinus.coeffs` from trimmed BiPolys — but it is a public export with a stated contract. A caller eliminating between two curves where one degenerates (a specialisation that collapses B to zero, e.g. `multiplierMap(n) − λ₀` at a parameter where the map is constant) gets `Res = 1`, reads it through the documented equivalence as "these curves share no root", and concludes the two curves are disjoint when in fact they coincide everywhere. That is a false negative on an elimination result — the one direction that reads as a certified absence.

**Proposed fix**

Guard the degenerate inputs explicitly at the top of `resultant`: if either list is empty, or if its top entry is the zero polynomial (i.e. it was passed untrimmed and its true degree is lower), return `QiPoly.zero()` for the genuinely-zero case rather than falling through to the `N <= 0` short-circuit. Pin `Res(A, 0) = 0` and `Res(0, B) = 0` in the new resultant test file from cd-test-08.

### `cd-disc-12` — `discriminant` throws an internal-sounding "division by zero polynomial" on an untrimmed coefficient list

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | usability | trivial | `packages/exact/src/resultant.ts:127` | `UNVERIFIED` |

**Evidence**

resultant.ts:121-128:
```ts
export function discriminant(coeffs: readonly QiPoly[]): QiPoly {
  const d = coeffs.length - 1;
  if (d < 2) return QiPoly.int(1);
  ...
  const lead = coeffs[d] ?? QiPoly.zero();
  let disc = res.divExact(lead);
```
`d` is the list length, not the true degree, and `lead` is taken on faith. If the caller passes a list whose top entry happens to be the zero polynomial, `divExact(QiPoly.zero())` reaches `QiPoly.divmod` (qiPoly.ts:140) and throws.

Verified on the built dist:
```
discriminant([QiPoly.int(1), QiPoly.int(1), QiPoly.zero()])
  -> throws "QiPoly.divmod: division by zero polynomial"
```
The message names an internal helper the caller never invoked and says nothing about the actual problem (an untrimmed input list), so the failure is hard to attribute. Note `QiPoly.fromCoeffs` trims *within* a polynomial but nothing trims the outer coefficient LIST that `discriminant`/`resultant` take.

**Failure scenario**

A caller building a coefficient list positionally — the natural shape when eliminating in a variable whose top coefficient can vanish at special parameters (e.g. `[a0, a1, a2]` for a quadratic-in-w family where a2 → 0 on a degeneracy locus) — passes `[p, q, QiPoly.zero()]` at that locus. Instead of getting the degree-1 discriminant (or a clear "degree dropped" signal), they get `QiPoly.divmod: division by zero polynomial` bubbling out of `@cas/exact`, pointing at a function that is not in their stack. Given `discriminant` is what backs corr's cusp locus, the natural next move is to swallow the throw, which turns a degeneracy into silence.

**Proposed fix**

Trim the incoming list to its true degree at the top of both `discriminant` and `resultant` (drop trailing entries that are the zero polynomial, then recompute `d`), so a degree-dropped input yields the correct lower-degree discriminant instead of an error. If a throw is preferred, make it name the contract: `throw new Error("discriminant: leading coefficient is zero (pass a trimmed coefficient list)")`. Either way, pin the behaviour in the new resultant test file.

---

## Scope: pkg-expr-gpu-ic — @cas/expr + @cas/gpu + @cas/interchange

**Reviewer's summary of what was read and overall impression:**

I read all 21 source files and 11 test files across packages/expr (ast, lexer, parser, evaluate, glsl, derivative, rational, latex, complexJs, complex, index), packages/gpu (df64Ref, df64.glsl, complexSingle.glsl, complexDf64.glsl, complexDerived.glsl, shader, colormap, dualBackend), and packages/interchange (schema, validate, codec, base64url, viewstate), plus the consuming call sites in apps/complex-dynamics (glPlot.rebuild, shaderBuilder, perturbationPoly, viewAdvisories, interchange/importMap, main.ts import path) and apps/quadrature-domains/app/schwarz/schwarz-export.mjs. I ran throwaway probes inside packages/expr to verify claims empirically rather than by reading alone (they measured fToRational's cost curve, dumped the emitted GLSL for the parameter-alias and if-condition cases, compared the JS intPow tree against the emitted inline chain, and confirmed the parser's unary-chain stack overflow); the probe file was deleted afterwards and the tree is clean of my changes. Overall health is high: these are unusually well-commented, well-tested packages, and every past review finding I could re-check (H1/H2 emitBody, H3 split overflow, GPU-2 cdiv floor, PKG-gpu-B-02 hypot, the ADR-0006 canonical-wire assertion, prototype-pollution walking) is genuinely fixed and genuinely guarded. The residual defects cluster in three places: (a) one unbounded-work path (fToRational) that is reachable from ordinary typed input and can freeze the tab; (b) the dual-backend parity story has two structural holes — the probe shaders cannot compile any map using the live parameter `a`, and the df64 "reference" for log/atan2 is not the algorithm the GLSL runs, so its tests cannot detect a convergence regression; (c) interchange's validator, which was hardened field-by-field, still leaves three optional payload fields (including a nested conventions tag that the ADR-0006 pi-factor guard is supposed to police) entirely untrusted. I found no honest-labeling defect in these packages.

### `expr-rational-01` — fToRational raises polynomials by repeated multiply with no exponent cap — `z^40000+c` freezes the CD tab for minutes

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | performance | small | `packages/expr/src/rational.ts:116` | `UNVERIFIED` |

**Evidence**

rational.ts:52-56 — `function pPow(a: Poly, k: number): Poly { let r: Poly = [[1, 0]]; for (let i = 0; i < k; i++) r = pMul(r, a); return r; }` — a linear loop of quadratic-cost multiplies, i.e. O(k^2) element operations and O(k) intermediate array allocations whose sizes grow to k.
rational.ts:112-116 — `case "^": { if (referencesVar(node.right, "z")) return null; const e = constValue(node.right, c, a); if (!e || Math.abs(e[1]) > 1e-9 || !Number.isInteger(e[0])) return null; return ratPow(left, e[0]); }` — the ONLY guard on `e[0]` is integrality; magnitude is unbounded.
Measured with a throwaway vitest probe against the real module: `fToRational(parse("z^100+c"))` = 10 ms, `z^1000` = 242 ms, `z^4000` = 3213 ms — clean O(k^2). Extrapolating, `z^40000` is ~320 s.
The cap that exists is applied too late: perturbationPoly.ts:213-219 calls `const rat = fToRational(fAst, [0, 0], a);` and only THEN checks `if (degree < 1 || degree > maxDegree) return null;`. viewAdvisories.ts:65 (`escapeIsMeaningless`) has no cap at all.

**Failure scenario**

In apps/complex-dynamics the user types `z^40000 + c` into the f field. glPlot.ts:2102-2108 (`set f`) calls `this.rebuild()`; rebuild (glPlot.ts:783-789) first calls `probeMonicDegree()`, which returns null because `f([2,0],[0,0])` = 2^40000 = Infinity fails its `Number.isFinite(f20[0])` test, so it falls through to `extractPolyPerturbation(this._iterAst, ...)` → `fToRational` → `ratPow(Z, 40000)` → `pPow` loops 40000 times building polynomials of degree up to 40000. The main thread blocks for ~5 minutes (and allocates ~8e8 Complex array slots), with a second identical stall for the other plot. The same path is reachable without typing: interchange validation permits MAX_COEFF_LEN = 4096 coefficients (validate.ts:33), CD's importMap.ts:33-41 turns that into `... + (c)*z^4095`, and `fToRational` then pays sum over k of O(k^2) ≈ 1.1e10 element ops — an unrecoverable hang from a pasted share link.

**Proposed fix**

Bound the work inside rational.ts before doing it: in the `^` case reject an exponent whose magnitude exceeds a cap (e.g. `if (!Number.isInteger(e[0]) || Math.abs(e[0]) > 256) return null;`), and additionally bail out of `evalRat` when an intermediate `Rat`'s num/den length exceeds a degree budget so that a product of many moderate powers cannot accumulate past it. Returning null is already the documented "not a rational function I can use" answer, and every caller (perturbationPoly, viewAdvisories, main.ts's exterior panel, critical.ts) already handles null. Optionally also switch `pPow` to binary exponentiation, but the cap is the load-bearing part.

### `expr-glsl-01` — An f that reads `a` before assigning it emits a self-referential `cvec a = ...(a)...` — GLSL fails to compile while the JS backend works

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `packages/expr/src/glsl.ts:215` | `UNVERIFIED` |

**Evidence**

glsl.ts:215 — `const declared = new Set<string>(["z", "c"]);` with the comment "`a` is deliberately NOT seeded: when used it is a read-only alias (see paramAlias); when assigned it is a genuine new local that must be declared."
glsl.ts:245-247 — `function paramAlias(ast: Node): string { return isFreeParameter(ast, "a") ? "  cvec a = vec_(uA.x, uA.y);\n" : ""; }` and ast.ts:71-73 — `isFreeParameter` = `referencesVar(node, name) && !assignsVar(node, name)`.
So when `a` is BOTH read and assigned, neither branch declares it before use. Verified output for `f = "a = a*2; z^2 + a"`:
  cvec fFn(cvec z, cvec c) {
    cvec a = cmul(a, vec_(2.0, 0.0));
    return cadd(cmul(z, z), a);
  }
The JS backend for the same AST returns [2,0] with a = 1 (evaluate.ts:230 `if (name === "a") return (s) => s.a;` resolves every read of `a` to the uniform value regardless of assignment).

**Failure scenario**

With the live-parameter slider in use, the user enters `f(z,c) = a = a*2; z^2 + a` (or any map that scales/perturbs the live parameter into a local of the same name, e.g. `a = a + c; z^2 + a`). The CPU paths — hover orbit, inspect panel, Julia-properties, critical-point tracking, all of which go through getComplexFn — compute correct values, but glPlot's `compile("single")` throws "Shader compile error: 'a' : undeclared identifier" (shader.ts:23) and glPlot.ts:806-808 keeps the previous program, so the rendered image silently stays on the OLD map while every overlay shows the NEW one. This is exactly the H1/H2 GPU-only divergence class the emitBodyHighs regression corpus was created for.

**Proposed fix**

Make the two `a` cases mutually exclusive at the point of decision rather than by two independent predicates. Simplest correct rule: if `referencesVar(ast, "a")` is true at all, always emit the uniform alias under a reserved name and seed `declared` accordingly — e.g. keep `paramAlias` emitting `cvec a = vec_(uA.x, uA.y);` whenever `a` is referenced, and add `"a"` to `declared` in emitBody when the alias was emitted, so a later `a = ...` becomes an assignment (`a = cmul(a, ...)`) instead of a redeclaration. That matches the JS semantics exactly (a read of `a` before assignment yields the uniform). Add `a = a*2; z^2 + a` to F_REGRESSION_CORPUS so the browser harness pins it — but see the harness finding below, which must be fixed first.

### `gpu-dual-01` — The dual-backend probe shaders declare `uA` after the compiled function (or not at all), so no map using the live parameter `a` can ever be tested

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | trivial | `packages/gpu/src/dualBackend.ts:60` | `UNVERIFIED` |

**Evidence**

dualBackend.ts:53-65 (buildProbeGLSL) emits, in order:
  ${COMPLEX_SINGLE_GLSL}
  ${COMPLEX_DERIVED_GLSL}
  ${fFn}                <-- compileF output; contains `cvec a = vec_(uA.x, uA.y);` when `a` is free
  uniform vec2 uZ;
  uniform vec2 uC;
  uniform vec2 uA;      <-- declared AFTER the function that references it
GLSL ES 3.00 requires a declaration before use, so this is a compile error. By contrast the real renderer gets it right — shaderBuilder.ts:691 has `uniform vec2 uA; // live parameter a — declared before fFn/escapeFn, which reference it when free` placed before `${compileF(fAst)}`.
dualBackend.ts:204-215 (buildEscapeProbeGLSL) is worse: it declares `uniform vec2 uZ;` and `uniform vec2 uC;` and NO `uA` at all.
Verified emitted bodies that would go into those probes: `compileEscape(parse("abs(z) > a"))` = `bool escapeFn(cvec z, cvec c) {\n  cvec a = vec_(uA.x, uA.y);\n  return (cre1(cabs(z)) > cre1(a));\n}` and `compileF(parse("a*z*(1-z)"))` likewise opens with `cvec a = vec_(uA.x, uA.y);`.
runGLSL also never sets uA (dualBackend.ts:102-108 fetches only uZ and uC).

**Failure scenario**

Someone adds the logistic family `a*z*(1-z)` (already in packages/expr/test/evaluateCompile.test.ts's F_EXPRS, so it is a map the suite considers in-scope) to DUAL_BACKEND_CORPUS to close the gap flagged above. dualBackend.browser.test.ts:52 calls runGLSL, createProgram throws "Shader compile error: 'uA' : undeclared identifier", and the test fails with a shader-compile message that reads like a codegen bug in @cas/expr rather than a defect in the probe assembly. Net effect today: `paramAlias` — the single codegen branch carrying an explicit df64-specific hazard note (glsl.ts:241-244, "a raw `cvec a = uA;` would be a vec4=vec2 type error that silently fails df64 compilation") — is the one branch the GLSL-agreement harness structurally cannot exercise.

**Proposed fix**

Move `uniform vec2 uZ; uniform vec2 uC; uniform vec2 uA;` above `${fFn}` in buildProbeGLSL, add the same three uniforms above `${escFn}` in buildEscapeProbeGLSL, and have runGLSL look up and set uA (`gl.uniform2f(uA, a[0], a[1])`) with an `a` threaded through Sample or DualCase so jsReference/makeComplexFn get the same value. Then add at least one `a`-using case to DUAL_BACKEND_CORPUS and one to ESCAPE_REGRESSION_CORPUS.

### `gpu-df64-01` — df64Ref's dfLog/dfAtan2 seed from float64 Math, not the fp32 seed the GLSL uses — so the tests cannot detect a convergence failure in df_log/df_atan2

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | testing | small | `packages/gpu/src/glsl/df64Ref.ts:142` | `UNVERIFIED` |

**Evidence**

The file header (df64Ref.ts:1-13) states: "This is the canonical spec for the algorithms — the GLSL in ./df64.glsl transliterates these line-for-line. The unit tests (test/df64.test.ts) check that these operations extend precision well beyond single float, which gives confidence in the GLSL port (whose precision can't be unit-tested directly)."
But df64Ref.ts:141-147 — `export function dfLog(a: DF): DF { let y = df(Math.log(a[0])); for (let i = 0; i < 2; i++) { y = dfAdd(y, dfSub(dfMul(a, dfExp(dfNeg(y))), [1, 0])); } return y; }` — `df(x)` (df64Ref.ts:22-25) is `[fround(x), fround(x - fround(x))]`, i.e. it splits a FULL float64 `Math.log` into two limbs, giving a ~46-bit seed.
df64.glsl.ts:112-118 — `vec2 df_log(vec2 a) { vec2 y = vec2(log(a.x), 0.0); ... }` — GLSL `log()` is fp32, and the lo limb is hard 0, giving a ~24-bit seed.
Identical mismatch in dfAtan2: df64Ref.ts:175-179 uses `const t0 = Math.atan2(y[0], x[0]);` (float64) then `dfSinCos(df(t0))` and `dfAdd(df(t0), ...)`, while df64.glsl.ts:143-149 uses `float t0 = atan(y.x, x.x);` (fp32) then `df_sincos(vec2(t0, 0.0))` and `df_add(vec2(t0, 0.0), ...)`.

**Failure scenario**

test/df64.test.ts:69-73 asserts `toNumber(dfLog(df(x)))` is within 11 decimals of `Math.log(x)` for x in {1, 2, 0.5, 10, 1e-4, 1234.5}. Because the reference's seed is already accurate to ~1e-16, that assertion passes even if the two Newton refinement steps were deleted entirely — it is testing `df(Math.log(...))`, not the iteration. Concretely: if someone reduces `for (let i = 0; i < 2; i++)` to one iteration in BOTH files (or the GLSL loop is unrolled/miscompiled to one pass), the JS test still passes at 11 decimals while the GLSL, starting from a ~5e-7 absolute error at |y| ≈ 9, lands at ~1.5e-13 instead of the df64 floor ~6e-14 — a silent precision regression in every deep-zoom clog/cpow/clambertw with no failing test anywhere in the suite.

**Proposed fix**

Make the reference an actual transliteration: seed with `let y: DF = [Math.fround(Math.log(a[0])), 0];` in dfLog and `const t0 = Math.fround(Math.atan2(y[0], x[0]));` plus `dfSinCos([t0, 0])` / `dfAdd([t0, 0], ...)` in dfAtan2. Then tighten test/df64.test.ts's log and atan2 assertions to the df64 floor (~1e-13 relative) so they actually pin the convergence of the iteration count the GLSL runs. Expect the existing 11-decimal assertions to still pass after the change — if any do not, that is itself the bug this finding is about.

### `interchange-validate-01` — validatePayload leaves hData, sourceDomain and tilingSetHint.fundamentalTile completely untrusted — including a nested conventions tag the ADR-0006 pi-factor guard never inspects

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `packages/interchange/src/validate.ts:141` | `UNVERIFIED` |

**Evidence**

validate.ts:141-149, the schwarz-reflection branch, checks exactly three things:
  if (!isMapSpec(payload.sigma)) throw ...
  if (!isConventions(payload.conventions)) throw ...
  assertCanonicalWire(payload.conventions, "schwarz-reflection");
  if (payload.escape !== undefined && !isEscapeSpec(payload.escape)) throw ...
SchwarzReflection (schema.ts:86-92) also declares `sourceDomain?: QuadratureDomain` and `tilingSetHint?: { fundamentalTile?: Complex[] }` — neither is touched. QuadratureDomain (schema.ts:73-80) declares `hData?: MapSpec`, and the quadrature-domain branch (validate.ts:150-158) validates phi, conventions and boundarySamples but not hData.
The boundarySamples check exists precisely because of this hole — validate.ts:154-155: "boundarySamples is optional, but when present must be a bounded Complex[] (the MAX_COEFF_LEN cap the other Complex[] fields carry — a crafted mega-array otherwise validated and slipped past the cap)". `tilingSetHint.fundamentalTile` is the same `Complex[]` with no cap.
Most importantly, assertCanonicalWire (validate.ts:89-96) documents itself as the ADR-0006 guard — "a well-formed-but-non-canonical tag means a producer failed to convert to canonical before export ... an un-caught non-canonical payload becomes a mis-scaled picture with no other guardrail in the path" — yet it is only ever applied to the TOP-LEVEL conventions, never to `sourceDomain.conventions`.

**Failure scenario**

A hand-edited or third-party envelope arrives as `{kind:"schwarz-reflection", payload:{sigma:<valid>, conventions:CANONICAL, sourceDomain:{phi:{form:"rational",num:"not-an-array",den:[]}, conventions:{area:"normalized",contour:"suppressed-2pii"}}, tilingSetHint:{fundamentalTile:[/* 1e6 junk entries */]}}}`. validateEnvelope returns it as a validated Envelope: the nested QD carries QD-internal dA = dx dy/pi and suppressed 1/(2 pi i) quantities while claiming to be on a canonical wire — the exact silent factor-of-pi ADR-0006 exists to make loud — and fundamentalTile bypasses the MAX_COEFF_LEN cap entirely. Note this reaches an entry point with NO transport size cap: apps/complex-dynamics/src/main.ts:2754 does `env = t.startsWith("{") ? validateEnvelope(JSON.parse(t)) : decodeLink(t);`, so the pasted-JSON path never sees base64url.ts's MAX_BASE64URL_LEN.

**Proposed fix**

In validate.ts, extend validatePayload: (1) factor the quadrature-domain body into `validateQuadratureDomain(qd, path)` and call it for `payload.sourceDomain` when present — which brings both isMapSpec(phi) and assertCanonicalWire(conventions) with it; (2) validate `payload.hData` with isMapSpec when present in the quadrature-domain branch; (3) validate `payload.tilingSetHint` when present — object, and `fundamentalTile === undefined || isComplexArray(fundamentalTile)`. Add the three rejection cases to the existing "validatePayload — the non-MapSpec structural fields" describe block in test/interchange.test.ts, and specifically assert that a non-canonical `sourceDomain.conventions` throws /non-canonical/.

### `expr-eval-01` — A complex-valued `if` condition throws in the interpreter but coerces in both production backends, so the "bitwise-identical" fuzz contract is unverified for that node

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `packages/expr/src/evaluate.ts:109` | `UNVERIFIED` |

**Evidence**

Interpreter — evaluate.ts:61-65 `private bool(node: Node): boolean { const v = this.eval(node); if (isComplex(v)) throw new ExprError("Expected a boolean, got a number", 0); return v; }` and evaluate.ts:108-109 `case "if": return this.bool(node.cond) ? this.eval(node.then) : this.eval(node.otherwise);`.
Compiled backend — evaluate.ts:327-332 `default: { // A complex expression used as a condition: true when its real part is non-zero (mirrors the interpreter's escape coercion and the GLSL backend's emitBool). const c = compileComplex(node, fRef); return (s, d) => c(s, d)[0] !== 0; }`, reached from evaluate.ts:259 `const cond = compileBool(node.cond, fRef);`.
GLSL backend — glsl.ts:96-99 `default: // A complex expression used as a condition: true when its real part is non-zero. return \`(cre1(${emitComplex(node)}) != 0.0)\`;`.
Verified: for `parse("if(z, 1, 2)")` at z = [3,0], `evaluate` throws "Expected a boolean, got a number", `makeComplexFn` returns [1, 0], and compileF emits `return (((cre1(z) != 0.0)) ? (vec_(1.0, 0.0)) : (vec_(2.0, 0.0)));`. The comment at evaluate.ts:163-169 nonetheless claims the closure tree gives results "bitwise-identical to the interpreter (fuzz-tested)".

**Failure scenario**

The fuzz harness in test/evaluateCompile.test.ts patched exactly one instance of this asymmetry — line 110, `const interp = Array.isArray(v) ? v[0] !== 0 : v;` — for the top-level escape value, but F_EXPRS contains no `if` with a complex condition, so the `if`-condition instance is unguarded. Consequence: `evaluate` is the documented reference the GLSL and closure backends are both checked against, and for `f(z,c) = if(re(z) - 1, c, z^2+c)` (a plausible "branch on a sign" spelling) the reference refuses to produce a value at all while both production backends silently return one. Any future test written against `evaluate` for such an expression asserts a throw that production does not perform, and a real drift between the two production backends on this node would go undetected because the reference can't run it.

**Proposed fix**

Pick one semantics and make all three agree. The production behaviour (coerce via real part != 0) is the one that ships, so change `Evaluator.bool` to coerce rather than throw — `if (isComplex(v)) return v[0] !== 0;` — which makes the interpreter match compileBool's default and emitBool's default exactly. Then add `if(re(z) - 1, c, z^2+c)` and `if(z, 1, 2)` to F_EXPRS and drop the now-unnecessary Array.isArray shim at evaluateCompile.test.ts:110 (or keep it; it becomes a no-op).

### `expr-glsl-02` — `==` in the df64 build compares only the hi limbs, silently reducing equality to float32 exactly where df64 matters

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `packages/expr/src/glsl.ts:91` | `UNVERIFIED` |

**Evidence**

glsl.ts:86-92 — "Compare real AND imaginary parts via the limb accessors. A raw `cvec == cvec` is correct in single precision (vec2) but in df64 (vec4) it also compares the error limbs, so equal values with different hi/lo splits would test unequal" followed by `if (node.op === "==") return \`(cre1(${a}) == cre1(${b}) && cre1(cim(${a})) == cre1(cim(${b})))\`;`.
complexDf64.glsl.ts:20 — `float cre1(cvec a) { return a.x; }` — the hi limb ONLY. So in the df64 build the emitted test is `a.x == b.x && a.z == b.z`, i.e. a 24-bit comparison of a ~47-bit value.
The stated rationale does not hold: every df64 value the stdlib produces is normalized — constructed by `vec_(re, im)` = `vec4(re, 0.0, im, 0.0)` (complexDf64.glsl.ts:14) or returned from `quickTwoSum` (df64.glsl.ts:39-42), which forces `hi = fl(hi+lo)` and `|lo| <= ulp(hi)/2`. Normalized double-floats have a canonical representation, so `a.xy == b.xy && a.zw == b.zw` is both exact and full-precision.
The JS backend compares full float64s: evaluate.ts:305-309 `return (s, d) => { const a = l(s, d); const b = r(s, d); return a[0] === b[0] && a[1] === b[1]; };`.

**Failure scenario**

At a df64 deep zoom (zoom past ~1e7, which is the whole reason the df64 program exists), two complex values that differ by 1e-9 relative have IDENTICAL fp32 hi limbs — that is precisely the regime df64 was built for. An escape predicate or branch such as `if(z == c, 0, z^2+c)` therefore takes the equal branch on the GPU for every pixel in a neighbourhood where the JS overlay correctly reports unequal, so the rendered image and the hover-orbit / inspect readouts disagree in a region rather than at a point. Below the df64 threshold the single-precision build is unaffected (cre1 there is the whole float).

**Proposed fix**

Emit a full-width comparison instead of a hi-limb one. Add a precision-agnostic `bool ceq(cvec a, cvec b)` to each base stdlib — `return a == b;` in complexSingle.glsl.ts and `return all(equal(a, b));` in complexDf64.glsl.ts — and have glsl.ts's `==` branch emit `ceq(a, b)`. That is exact in both builds, keeps the codegen precision-agnostic as designed, and removes the special-cased `cre1(cim(...))` spelling. Update the comment, which currently justifies the wrong fix.

### `expr-parser-01` — The parser's MAX_DEPTH guard misses the unary chain, so a long run of minus signs throws RangeError instead of the intended clean ExprError

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `packages/expr/src/parser.ts:121` | `UNVERIFIED` |

**Evidence**

parser.ts:26-29 states the intent — "Cap nesting recursion so a pathologically nested input can't overflow the stack. 256 levels is far beyond any real map expression yet well under the engine's stack limit (~7 frames per level). See parseExpr. (EXPR-5, defense-in-depth — call sites already catch, this just makes it a clean error.)"
The counter is incremented only in parseExpr (parser.ts:77-88): `if (this.depth >= Parser.MAX_DEPTH) { throw new ExprError("Expression nested too deeply", this.peek().pos); } this.depth++; try { return this.parseComparison(); } finally { this.depth--; }`.
But parser.ts:118-124 recurses without going through it — `private parseUnary(): Node { if (this.peek().type === "op" && this.peek().value === "-") { this.next(); return { kind: "neg", operand: this.parseUnary() }; } return this.parsePower(); }` — and parsePower's right operand (parser.ts:131) re-enters parseUnary the same way.
Verified: `parse("-".repeat(50000) + "z")` throws `RangeError: Maximum call stack size exceeded`, not ExprError.

**Failure scenario**

A pasted or crafted expression such as 50000 leading minus signs, or `2^-2^-2^-...`, hits the engine stack limit. Callers that discriminate on the error type get the wrong one: apps/complex-dynamics's `tryParse` (glPlot.ts:2104) catches broadly so behaviour there is merely a confusing message, but the ExprError contract (an error carrying a `pos` for caret placement in the editor) is broken, and the guard the EXPR-5 note says exists does not in fact cover this input class. A RangeError from stack exhaustion is also the one exception class that can leave partially-built state in an unrelated frame further up.

**Proposed fix**

Increment the same counter in parseUnary: wrap its recursive branch the way parseExpr does (`if (this.depth >= Parser.MAX_DEPTH) throw new ExprError("Expression nested too deeply", this.peek().pos); this.depth++; try { return { kind: "neg", operand: this.parseUnary() }; } finally { this.depth--; }`), or hoist the depth check into a small `guarded<T>(fn)` helper used by both parseExpr and parseUnary. Add `parse("-".repeat(1000) + "z")` to test/parser.test.ts asserting an ExprError.

### `interchange-codec-01` — The link transport cap is far below what the validator accepts, and decodeLink reports the resulting size failure as "not valid base64"

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | usability | trivial | `packages/interchange/src/codec.ts:35` | `UNVERIFIED` |

**Evidence**

base64url.ts:18-25 — `export const MAX_BASE64URL_LEN = 64 * 1024;` with `if (s.length > MAX_BASE64URL_LEN) throw new RangeError("base64url: payload too large to decode");` — 64 KB of base64 is ~48 KB of JSON.
validate.ts:31-33 — `const MAX_COEFF_LEN = 4096;` applied per Complex[] field (rational num AND den, laurent F, boundarySamples). A single Complex serializes to ~47 bytes (`{"re":-0.7436438870371587,"im":0.13182590420533}`), so 4096 entries is ~190 KB of JSON in ONE field — roughly 4x the entire transport budget, before the other fields.
codec.ts:33-37 — `try { json = fromBase64Url(m[1]); } catch { throw new InterchangeError("interchange: link payload is not valid base64"); }` — the catch is untyped and swallows the explicit RangeError along with genuine atob/UTF-8 failures.

**Failure scenario**

A producer builds an envelope whose coefficient arrays total more than ~1000 Complex entries (well within what validateEnvelope accepts and encodeLink happily emits — encodeLink has no size check at all, codec.ts:20-22). The recipient pastes the link and gets "interchange: link payload is not valid base64", which is false and sends them looking for a truncated/mangled URL rather than for a payload that is simply too big for the transport. Because encode is unchecked, the producing app also has no way to learn its own output is undecodable.

**Proposed fix**

Two small changes in codec.ts: rethrow the size case with its own message (`catch (e) { throw new InterchangeError(e instanceof RangeError ? "interchange: link payload exceeds the transport size limit" : "interchange: link payload is not valid base64"); }`), and add the symmetric check to encodeLink so a producer fails at export time rather than shipping a dead link (`const s = toBase64Url(JSON.stringify(env)); if (s.length > MAX_BASE64URL_LEN) throw new InterchangeError(...); return \`#s=${s}\`;`). Separately, reconcile MAX_COEFF_LEN with the transport budget or document that oversized envelopes are JSON-only.

### `expr-glsl-03` — The inline GLSL power chain uses a different multiply tree than JS intPow, contradicting its own comment, and the dual-backend corpus cannot detect it

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | maintainability | trivial | `packages/expr/src/glsl.ts:171` | `UNVERIFIED` |

**Evidence**

glsl.ts:171-174 emits a LEFT-LINEAR chain for n <= 8 — `if (n <= INTPOW_INLINE_MAX && baseExpr.length <= INTPOW_INLINE_MAX_BASE_LEN) { let acc = baseExpr; for (let k = 1; k < n; k++) acc = \`cmul(${acc}, ${baseExpr})\`; return acc; }` — i.e. ((z*z)*z)*z.
complexJs.ts:75-86 `intPow` uses square-and-multiply — `while (k > 0) { if (k & 1) result = mul(result, base); k >>= 1; if (k > 0) base = mul(base, base); }` — i.e. z^4 = (z^2)^2.
complexDerived.glsl.ts:13-16 nonetheless claims: "Integer power via binary exponentiation (square-and-multiply), matching the JS intPow multiply tree exactly. The codegen routes integer exponents with |n| in [9, 1024] here (small n is inlined as repeated cmul; ...)" — the parenthetical concedes the inline path is different while the sentence claims exactness.
Measured at z = [0.7436438870371587, -0.13182590420533]: n=2,3,4,5 happen to agree bitwise; n=6, 7 and 8 differ in the last float64 ulp (e.g. n=8 js = 0.01761659220656403 vs inline = 0.017616592206564034). In float32 the corresponding gap is ~1e-7 relative.
DUAL_BACKEND_CORPUS (dualBackend.ts:155-162) contains only `z^2` and `z^3` as powers — the two exponents for which the trees coincide.

**Failure scenario**

The numerical impact today is ~1 ulp, well inside the browser harness's 2e-6 tolerance, so this is not a live wrong answer. It is a testing/documentation hole: if the inline emitter is ever changed (say the base-length guard is retuned, or INTPOW_INLINE_MAX is raised past the cintpow crossover) so that a whole class of exponents silently routes differently, DUAL_BACKEND_CORPUS's z^2/z^3 cannot see it, and the comment asserting bitwise tree parity would keep a reviewer from looking.

**Proposed fix**

Either make the inline path emit the same square-and-multiply tree as complexJs.intPow (cheap: build the chain with the same `k & 1` / squaring order), or correct the comment in complexDerived.glsl.ts:13-16 to say that only the cintpow path (|n| in [9,1024]) matches the JS tree and that the inline path is a left-linear chain agreeing to float32 epsilon. Either way, add `z^6 + c` or `z^8 + c` to DUAL_BACKEND_CORPUS so the inline path is actually executed by the browser harness.

---

## Scope: qd-app — Quadrature Domains outside the algebra module

**Reviewer's summary of what was read and overall impression:**

I read the QD app end-to-end outside `app/algebra/` and `sym-core.mjs`: the full solver core (`solver.mjs` — Newton driver, Householder QR + refinement, disk clamps, boundary sampling/univalence, `_solveOnce`/`solvePQDWithAutoSwitch`, `chooseHoleTestPoints`), the family kernels I could reach for dispatch/verifier questions (`solver-qd`, `solver-uqd`, `solver-lqd*`, `solver-pqd*`, `solver-cmax`), all four worker front-ends and their entry modules (`primary-solver-worker`, `schwarz-cpu-worker`, `param-slice-pool`, `workers/solver-worker-entry`), the whole UI orchestration layer (`ui.mjs`, `ui-solve.mjs`, `ui-domain-plot.mjs`, `ui-state`, `qd-constraints`, `observables`, `univalence`), the Schwarz stack (`schwarz-ui`, `schwarz-render`, `schwarz-webgl` incl. the GLSL, `schwarz-common` escapeTime), the sphere stack (`sphere-ui`, `sphere-webgl`), param-slice (`-common`, `-pool`, `-ui`), and the direct tab (`direct-verify`, the `direct-ui` send path). I also built-verified the PWA precache (all chunks are under the 2 MiB Workbox default and every worker entry is in the manifest — no caching hazard there). Overall health is high: the codebase is unusually disciplined about supersede tokens, fail-closed NaN handling in the identity verifiers, disk-clamp invariants, and GL texture deletion, and the param-slice pool already has a correct worker-crash handler. The defects that remain cluster at the *edges* between subsystems rather than in the math: two places where a verdict crosses a tab/family boundary and loses its provenance (the Direct-tab log-weighted round-trip silently dispatching to `Family.boundedQD`, and `showQDSolution` hardcoding `univalent/identityOK: true` for an algebra-tab φ) — both honest-labeling violations; three worker/renderer lifecycle inconsistencies where one path's failure mode was fixed but its siblings were not (schwarz CPU worker error handling, the shared `_mainThreadFallback` latch, sticky `gpuMsg` sniffing); one estimator that conflates budget exhaustion with a proven bound; and the post-solve analysis + param-slice hover being the two heavy operations that were never moved off the main thread even though workers exist for exactly that.

### `qd-direct-verify-01` — Direct-tab "Verify" round-trip for bounded LOG-weighted maps dispatches to the CLASSICAL solver and reports the wrong family's verdict as a pass

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/quadrature-domains/app/direct/direct-verify.mjs:95` | `UNVERIFIED` |

**Evidence**

```js
      const opts = (directState.weight === 'power')
        ? { alpha: parseFloat(directState.alpha) }
        : { weight: 'log', w0: parseComplex(directState.logW0) };
      let r;
      try { r = QD.solveInverseQD(directState.lastH, opts); }
```
No family's `matches()` predicate ever reads `opts.weight`. The LQD families gate on `opts.lqd`:
`app/solver-lqd.mjs:398  matches(opts) { return !!(opts && opts.lqd && !opts.unbounded); }`
`app/solver-lqd-singular.mjs:432  return !!(opts && opts.lqd && opts.singular && !opts.unbounded);`
and `grep -rn "opts.weight|options.weight" app/*.mjs app/solvers/` returns **nothing** in any solver file. `QD.selectFamily` therefore walks `familyDispatchOrder` (none of `boundedLQD`/`powerQD`/`unboundedQD` match `{weight:'log', w0}`) and falls through to the catch-all `Family.boundedQD` (`app/solver-qd.mjs:357  matches(opts) { return true; }`).

The sibling "Send to inverse tab" handler in the SAME feature gets it right — `app/direct/direct-ui.mjs:1008-1009`:
```js
      } else if (directState.lastWeight === 'log') {
        opts.lqd = true;
```
so this is a copy-paste divergence between two dispatch sites.

The verdict text then attributes the classical result to the log-weighted construction (`direct-verify.mjs:106-108`):
```js
      resBox.innerHTML = okStrong
        ? 'Round-trip ✓ — the inverse solver reconstructs a univalent Ω; quadrature identity closes (maxRelDiff = <strong>' + id.toExponential(2) + '</strong>).'
```

**Failure scenario**

Direct tab → mode `bounded`, weight `log`, singular OFF, w₀ = 2 (the default `directState.logW0`). Compute a forward log-weighted h, then click **Verify**. The branch at line 65 (`mode === 'bounded' && weight !== 'classical'`) is taken; `lastSingular` is false so control reaches line 95 and runs `QD.solveInverseQD(lastH, {weight:'log', w0:2})`. `selectFamily` cannot see `lqd`, so `Family.boundedQD` solves the CLASSICAL inverse problem ∫_Ω f dA = Σ residues — a different equation from the log-weighted identity ∫_Ω f dA/|w|² the forward kernel built. The reported `maxRelDiff` is the classical identity residual on a log-weighted h. If it happens to fall below 1e-6 the user is told "Round-trip ✓ … quadrature identity closes" for an identity that was never checked; the far more common outcome is "Round-trip weak: solved but NOT univalent", i.e. a false FAILURE that makes a correct log-weighted forward map look broken. Either way the verdict describes `boundedQD`, not `boundedLQD`, and the UI never says so.

**Proposed fix**

Build the options with the same family tag the Send path uses: replace `{ weight: 'log', w0: … }` with `{ lqd: true, w0: parseComplex(directState.logW0) }` (and add `singular: true` + `q` when `directState.lastSingular`). Better: extract the `lastWeight → opts` mapping from `direct-ui.mjs:1003-1012` into one shared `buildInverseOptsFromDirectState()` in `dCtx` and call it from BOTH the Send button and `runVerify`, so the two can never diverge again. Additionally, have `runVerify` assert the family it actually got (`QD.selectFamily(opts).name`) and print it in the verdict line, so a future mis-dispatch is visible instead of silent.

### `qd-ui-algebra-badge-01` — `showQDSolution` hardcodes `univalent:true, identityOK:true`, so an algebra-tab φ whose verdict was `≈`/`≥` renders in the QD tab as an unqualified "✓ Valid quadrature domain"

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | small | `apps/quadrature-domains/app/ui.mjs:1621` | `UNVERIFIED` |

**Evidence**

```js
uiCtx.showQDSolution = function (phi, hData) {
  try {
    if (!phi || !hData || typeof showSolution !== 'function') return false;
    state.current = { success: true, primary: { phi, univalent: true, identityOK: true, identity: null, method: 'algebra' }, alternates: [], hData };
```
Both validity fields are literals — nothing is recomputed. `showSolution` (`app/ui-solve.mjs:891`) then calls `renderValidityBadge(sol)`, and `qdValidityBadge` (`app/ui-solve.mjs:813-819`) reads exactly those two fields:
```js
  if (sol.univalent && sol.identityOK)   return { cls: 'ok',   text: '✓ Valid quadrature domain' };
```
The caller is `app/algebra/algebra-ui.mjs:3766-3771`, which offers "View in the QD plot" for `pr.kind === 'zero-dim' | 'tree'` **without gating on `pr.rigor`** — the same `pr` object whose rigor badge is rendered separately as `rigor: pr.rigor` (line 3765) and can be `'estimate'`, `'bound'`, or `'unknown'`. The rigor level is dropped at the tab boundary; the QD tab has no `≈`/`≥` qualifier and `identity: null` suppresses the identity line that would otherwise expose that nothing was measured.

**Failure scenario**

Algebra tab → prove a system whose verdict comes back with `rigor: 'estimate'` (e.g. a numeric-root leaf where `intervalCertified` was refused, so `assembleVerdict` reports `≈`). Click "View in the QD plot". The QD tab switches over and the status-panel badge reads "✓ Valid quadrature domain" in the OK colour, with no `≈`, no identity `maxRelDiff` line, and `method: algebra`. A user who arrives at the QD tab (or shares a screenshot of it) sees a certified-looking verdict for a φ whose univalence and quadrature identity were only estimated — the exact estimate-reads-as-certified failure the project treats as unacceptable.

**Proposed fix**

Two independent fixes, either sufficient, both cheap: (a) actually measure — replace the literals with `univalent: QD.isBoundaryUnivalent(phi, state.samples)` and `identity`/`identityOK` from `QD.selectFamily(QD.normFromPhi(phi)).verifyQuadratureIdentity(phi, hData, {})`; both already run in ~ms for a solved φ and are what every other entry point into `state.current` does. (b) propagate provenance — extend the signature to `showQDSolution(phi, hData, { rigor, note })`, store it on `state.current.primary.rigor`, and have `qdValidityBadge` emit `'≈ Valid quadrature domain (from algebra, not re-verified here)'` for anything that is not `rigor === 'exact'`. Do (a) at minimum; the recomputed values are the honest ones regardless of what the algebra tab claimed.

### `qd-schwarz-cpuworker-01` — Schwarz CPU worker's `error` listener only logs — a worker-level failure leaves the render permanently stuck at "Pass 1/3" with no fallback

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/quadrature-domains/app/schwarz/schwarz-cpu-worker.mjs:82` | `UNVERIFIED` |

**Evidence**

```js
      const w = new Worker(new URL('../workers/schwarz-worker-entry.mjs', import.meta.url), { type: 'module' });
      w.addEventListener('error', (ev) => {
        console.error('[schwarz-cpu worker] error: '
          + (ev.message || ev) + ' @ ' + (ev.filename || 'bundle') + ':' + (ev.lineno || '?'));
      });
      _worker = w;
```
The handler never calls `cbs.onError` / `cbs.onUnavailable`, never clears `_inflight`, and never sets `_mainThreadFallback`. The caller (`app/schwarz/schwarz-render.mjs:169-181`) wires fallbacks that can therefore never fire on this path:
```js
    sState._cpuWorkerHandle = QD.SchwarzCpuWorker.renderField(params, {
      onPass(m) { … if (m.done) { sState.rendering = false; setProgress(''); } … },
      onUnavailable: fallback,
      onError(e) { console.warn('[schwarz cpu worker]', e); fallback(); },
    });
```
`isUsable()` (line 99-104) is a *static* gate (Worker exists && not `file:`), so it still returns true and `doRecompute` commits to the worker path at `schwarz-render.mjs:127-130`.

The sibling pool in the same app already fixed exactly this — `app/param-slice/param-slice-pool.mjs:231-236` routes `error` and `messageerror` into `pool._onWorkerError(w, …)` which settles the in-flight promise. This module was not updated.

**Failure scenario**

The app is a PWA with `registerType: "autoUpdate"` (vite.config.js), so a new service worker claims an already-open page and purges the old precache. The live page still holds the OLD `assets/schwarz-worker-entry-<oldhash>.js` URL baked into `import.meta.url`. On the next Schwarz recompute that needs the CPU path (any PQD family — `setPhi` returns false for `powerQD*`, so `activeRenderer()` is `'cpu'`), `new Worker(...)` resolves a 404. The constructor does NOT throw; the failure arrives asynchronously as an `error` event, which this handler swallows. Result: `sState.rendering` stays `true` forever, the progress line stays "Pass 1/3 (coarse) ...", the canvas never paints a field, and the in-process pyramid fallback never runs. Every subsequent `requestRecompute` calls `_disposeWorker()` → spawns another doomed worker, so the tab is permanently dead until a hard reload.

**Proposed fix**

Mirror `param-slice-pool._onWorkerError`: keep a reference to the active callbacks on `_inflight`, and in the `error` (and a new `messageerror`) handler call `_finish()`-equivalent cleanup, set `_mainThreadFallback = true` (so `isUsable()` starts returning false and future recomputes go straight in-process), then invoke `cbs.onError(detail)` so `schwarz-render.mjs`'s `fallback()` runs `_renderCpuPyramid`. Store `cbs` on `_inflight` at line 132 (`_inflight = { jobId, onMessage, cbs }`) so the module-scope error handler can reach it.

### `qd-psw-fallback-latch-01` — One `_mainThreadFallback` latch is shared by three independent worker lifecycles, so an aux/live-worker failure silently pushes the interactive solve back onto the main thread and leaks the healthy primary worker

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/quadrature-domains/app/primary-solver-worker.mjs:233` | `UNVERIFIED` |

**Evidence**

The single module-level flag is written from all three `ensure*Ready()` catch blocks:
```js
// line 116-121 (primary)
    })().catch((err) => {
      console.warn('[primary-solver-worker] Worker unavailable (' + … );
      _mainThreadFallback = true;
// line 230-234 (aux / alternate search)
    })().catch((err) => {
      console.warn('[primary-solver-worker] Aux worker unavailable (' + … );
      _mainThreadFallback = true;
// line 323-327 (live / drag)
    })().catch((err) => {
      console.warn('[primary-solver-worker] Live worker unavailable (' + … );
      _mainThreadFallback = true;
```
and read by the interactive solve path, which then ignores a perfectly healthy `_worker`:
```js
// line 128-136
    return ensureReady().then(() => {
      if (_mainThreadFallback || !_worker) {
        return Promise.resolve().then(() => {
          return _QD.solveInverseQD(hData, opts || {});
        });
      }
```
`ensureReady()` also short-circuits on the flag (`line 86: if (_mainThreadFallback) return;`), so `_worker` is never terminated — it stays parked as a live thread that nothing will ever post to again.

**Failure scenario**

The three workers are created at different times: `_worker` on the first solve, `_auxWorker` when `startBackgroundAltSearch` runs after that solve, `_liveWorker` on the first pole drag. If the second or third `new Worker(...)` throws — e.g. the user has already opened the Param-slice tab, which spawns `min(navigator.hardwareConcurrency, 16)` pool workers (`param-slice-pool.mjs:262-265`), plus the sym worker and the schwarz worker, hitting a per-page worker cap on Safari/iOS or under memory pressure — the catch sets `_mainThreadFallback = true`. From that moment every debounced full solve runs `QD.solveInverseQD` synchronously on the main thread (the module header measures this at 50–500 ms on hard h), freezing input and repaint on every keystroke burst, and the already-created, still-idle primary worker thread is leaked for the life of the page. Nothing in the UI indicates the downgrade — only a `console.warn` naming the *aux* worker.

**Proposed fix**

Give each lifecycle its own latch: `_mainFallback`, `_auxFallback`, `_liveFallback`, set only from its own catch and read only by its own `ensure*Ready` / `solve|searchAlternates|liveSolve` pair. When a lifecycle does latch, tear down its own worker (`_disposeAux()` / `_disposeLive()`) rather than leaving a thread parked. Optionally surface the downgrade through the existing `_isMainThreadFallback()` diagnostic so `showSolveBusy` can label a main-thread solve.

### `qd-cmax-ceiling-01` — c* estimator reports solve-budget exhaustion as `no-invalid-below-ceiling`, and the UI turns that into a `≤` validity claim over c values that were never probed

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | correctness | small | `apps/quadrature-domains/app/solver-cmax.mjs:246` | `UNVERIFIED` |

**Evidence**

The growth loop has TWO exit conditions but only one reported reason:
```js
    let cHi = cLo * stepFactor();
    let bracketed = false;
    while (cHi <= cCeiling && solves < maxSolves) {
      …
      } else {
        bracketed = true;
        break;
      }
    }
    if (!bracketed) {
      return { found: false, cMax: null, cLowValid: cLo, phiAtMax: loPhi,
               trace, reason: 'no-invalid-below-ceiling', ceiling: cCeiling,
               critAtMax: loCrit, solves };
    }
```
`solves >= maxSolves` (default 80, line 150) exits with the identical `reason` as `cHi > cCeiling`. The UI then states a bound over the whole `[cStart, ceiling]` range (`app/ui.mjs:1139-1149`):
```js
        if (res.reason === 'no-invalid-below-ceiling') {
          showResult('No finite maximum found',
                     'the unbounded QD stays valid up to the search ceiling c ≤ ' + res.ceiling.toFixed(2) + '.');
          setStatus({ kind: 'ok',
            text: 'No critical c found below the ceiling — the unbounded QD remains valid up to c ≤ ' + res.ceiling.toFixed(2) + '.' });
```
`res.cLowValid` — the largest c the estimator actually proved valid — is returned but never displayed.

**Failure scenario**

Unbounded family, c-slider at 1.0 ⇒ `cCeiling = Math.max(100, 1.0*256) = 256`. The branch enters the near-cusp regime early (`loCrit ≥ CUSP_NEAR = 0.95`), so `stepFactor()` drops to `cuspGrow = 1.06`. Reaching 256 from 1.0 needs `log(256)/log(1.06) ≈ 95` growth steps, but only ~79 solves remain after the `bracket-lo` phase. The loop exits on `solves < maxSolves`, having verified validity only up to `cLo ≈ 1.06^79 ≈ 89`. The status line then reads, in the OK colour, "No critical c found below the ceiling — the unbounded QD remains valid up to c ≤ 256.00" — a `≤` bound asserted over c ∈ (89, 256], none of which was ever solved. The user may then dial c to 200 believing a valid domain exists there.

**Proposed fix**

Distinguish the exits: set `const outOfBudget = solves >= maxSolves && cHi <= cCeiling;` and return `reason: outOfBudget ? 'budget-exhausted' : 'no-invalid-below-ceiling'`, always including `cLowValid`. In `ui.mjs`, render the budget case as "Search budget exhausted — valid up to c ≈ <cLowValid> (tested); no critical c found below that" and change the ceiling case to quote `cLowValid` as the tested bound with the ceiling only as the search cap: "valid at every tested c up to <cLowValid>; search ceiling was <ceiling>". Never print `≤ ceiling` for an untested range.

### `qd-chooseholetestpoints-01` — `chooseHoleTestPoints` is O(61 × N) per identity verify and is re-run at every escalation level, dominating unbounded-family verification cost

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | medium | `apps/quadrature-domains/app/solver.mjs:1272` | `UNVERIFIED` |

**Evidence**

The candidate set is fixed at 61 points (`1 + radii.length(5) × nAngles(12)`), and each surviving candidate walks the ENTIRE sampled boundary twice:
```js
  const ranked = [];
  for (const b of cand) {
    if (origEps > 0 && Math.hypot(b.re, b.im) < origEps) continue;  // origin ∈ Ω
    if (!inside(b.re, b.im)) continue;
    const clr = Math.min(distBoundary(b.re, b.im), distPole(b.re, b.im));
```
with (lines 1236-1254)
```js
  const inside = (x, y) => { let cr = 0; for (let i = 0, j = m - 1; i < m; j = i++) { … } };
  const distBoundary = (x, y) => { let mn = Infinity; for (const w of polygonPts) { const d = Math.hypot(w.re - x, w.im - y); … } };
```
The unbounded verifier calls it once per `evalAtN` (`app/solver-uqd.mjs:416`), and `evalAtN` runs inside a doubling escalation loop up to `cap = 8000` (`app/solver-uqd.mjs:389, 492-503`), on a polygon whose length is the CURRENT `N` (`samples.map(s => s.w)`), with a hard floor of 1500 (`line 380`).

**Failure scenario**

A near-cusp unbounded QD: `evalAtN(1500)` → `evalAtN(3000)` → `evalAtN(6000)`. The test-point ranking alone costs 61 × 2 × (1500 + 3000 + 6000) ≈ 1.28 M `hypot`/crossing iterations — recomputed from scratch each level even though the candidate grid (centroid + 5 radii × 12 angles) is IDENTICAL and the boundary is just a refinement of the previous one. `_solveOnce` runs `attachIdentity` on every candidate (up to ~30 across direct/multistart/diverse/deflation), and `estimateMaxConformalRadius` drives up to `maxSolves = 80` such solves with `identitySamples: 3000` (`app/solver-cmax.mjs:152, 188`) — so one "Estimate max c" click can spend order 10⁸–10⁹ iterations purely in test-point ranking, dwarfing the contour integrals it is preparing.

**Proposed fix**

Two independent wins: (1) stop re-ranking per escalation level — hoist the chosen `testPoints` out of `evalAtN` and reuse them across the doubling loop (the geometry is the same φ; only the quadrature resolution changes), passing them in as `options.testPoints`; (2) make the per-candidate scan sub-linear — `distBoundary` currently measures distance to boundary VERTICES, so a coarse subsample (every ⌈m/512⌉-th vertex) is numerically equivalent at these densities, and `inside` can reuse the existing `QD.Schwarz.buildPolygonIndex` / `pointInPolygonIndexed` bucketing already in `schwarz-common.mjs`. Either change alone removes most of the cost; (1) is a ~10-line refactor.

### `qd-accuracy-mainthread-01` — The post-solve "Geometry & accuracy" pass runs two escalating ≥1500-node identity verifies plus a critical-point solve on the MAIN thread after every solve

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | medium | `apps/quadrature-domains/app/ui-solve.mjs:753` | `UNVERIFIED` |

**Evidence**

```js
      } else {
        acc = (hData && QD.estimateAccuracy) ? QD.estimateAccuracy(sol.phi, hData, {}) : null;
      }
      res = { obs, acc };
```
running inside an idle callback that is force-fired after 250 ms (`app/ui-solve.mjs:766-767`):
```js
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
  idle(run, { timeout: IDLE_ANALYSIS_TIMEOUT_MS });
```
`estimateAccuracy` does, per call (`app/observables.mjs:246-282`): a `QD.findCriticalPoints(phi)` root-solve, `QD.residual(phi, hData)`, and
```js
        const vN  = fam.verifyQuadratureIdentity(phi, hData, { numSamples: N });
        const v2N = fam.verifyQuadratureIdentity(phi, hData, { numSamples: 2 * N });
```
with `N = Math.max(256, opts.samples || 600)` — but for unbounded families the verifier floors at 1500 (`app/solver-uqd.mjs:380`) and, with `adaptiveSamples` left undefined (⇒ enabled), escalates by doubling to `cap = 8000` (`app/solver-uqd.mjs:389, 492-503`). It is preceded in the same idle slice by `QD.boundaryObservables(sol.phi, { samples: 1024 })` (`ui-solve.mjs:747`). This is the one heavy stage of the pipeline that was never moved off-thread, even though the solve itself was (see the `primary-solver-worker.mjs` header rationale).

**Failure scenario**

Solve an unbounded QD sitting near its cusp (e.g. right after "Estimate max c" sets the slider to c*). `runStatusAnalyses` fires; `scheduleObservables` runs `boundaryObservables` at 1024 samples, then `estimateAccuracy` runs the identity verifier twice, each escalating 1500 → 3000 → 6000 nodes, each level performing N `phiTaylorAt` evaluations, 3 test points × 3 orders × N complex-power contour terms, and a fresh 61-candidate × N test-point ranking. All of it is one uninterruptible main-thread task inside a `requestIdleCallback` whose 250 ms timeout guarantees it runs even when the thread is busy — so the tab locks up for a visible fraction of a second (multiple seconds on a slow machine) immediately after each solve, and again on every drag-end. `scheduleGeomClassification`, `scheduleCuspClassification` and `scheduleSymmetry` queue three more unchunked idle callbacks behind it.

**Proposed fix**

Move the accuracy pass to the existing aux worker. `QD.estimateAccuracy` takes plain data (`phi`, `hData`) and is already loaded in the solver graph, so add an `'accuracy'` job kind to `app/workers/solver-worker-entry.mjs` alongside `solve`/`altSearch`/`liveSolve`, an `accuracyAsync()` on `QD.PrimarySolverWorker` mirroring `searchAlternatesAsync`, and have `scheduleObservables` await it (token-guarded exactly as now). Short of that, pass `{ adaptiveSamples: false }` through `estimateAccuracy` to the verifier — this display only needs a stable digit count, not the near-cusp escalation, and it caps the cost at the 1500/3000 floor.

### `qd-paramslice-hover-01` — Param-slice hover preview runs a full `solveInverseQD` synchronously on the main thread while the idle worker pool sits right there

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | performance | medium | `apps/quadrature-domains/app/param-slice/param-slice-ui.mjs:429` | `UNVERIFIED` |

**Evidence**

```js
    let r;
    try {
      r = PS.solveOnePoint(sceneWithOpts, point, warmHint, expectedFamilyTag);
    } catch (e) {
      r = { cls: 'unclassified', errSample: String(e && e.message || e) };
    }
```
`PS.solveOnePoint` → `_solveScenarioBody` (`app/param-slice/param-slice-common.mjs:359`), and when the hovered cell has no cached φ (`canWarm` false) it takes the cold branch at line 445:
```js
        resultBag = _wrapFullSolve(QD.solveInverseQD(s.hData, Object.assign({ bootstrapW0: false }, opts)));
```
The render opts enable multistart (`param-slice-ui.mjs:889-895`: `direct: true, multistart: true`) with `numRestarts: 1`, `univalenceSamples: quality.univalenceSamples` (128 standard, 512 rigorous) and `newton: { maxIter: 40 }`. The pool that could absorb this already exists on `sliceState` and exposes `solveBatch(scenario, mode, points, warmHints)` (`param-slice-pool.mjs:100`) — it is idle whenever a render is not running, which is exactly when hovering happens.

**Failure scenario**

After a 2-D sweep finishes, move the cursor across the grey/red (`no-root` / `newton-diverged`) region of the map. Those cells have no cached φ, so each hover settle (`LIVE_SOLVE_SETTLE_MS`) fires a cold `solveInverseQD` on the main thread: direct Newton + multistart restarts, each followed by `isBoundaryUnivalent` and `verifyQuadratureIdentity` at 128 samples (512 on `rigorous`). Every one of those is a synchronous block, so a slow sweep of the mouse produces a train of tens-to-hundreds-of-ms freezes — the pointer stutters and the mini-canvas repaint lags, on a tab whose entire architecture exists to keep solves off the main thread.

**Proposed fix**

Route the hover solve through the pool: `sliceState.pool.solveBatch(sceneWithOpts, scenario.mode, [point], [warmHint])` returns the same `{cls, iterations, phiSerialized}` shape (`Pool.solveBatch` → the worker's `solveOnePointWithScratch`), so `runLiveSolve` only has to become async and keep its existing `ls.token !== myToken` guard after the await. Keep the synchronous `PS.solveOnePoint` call as the fallback for `pool.kind === 'main-thread'`. Note `Pool.cancel()` latches `_cancelled`, so call `pool.arm()` (already used at `param-slice-ui.mjs:930`) before dispatching a hover job on a pool that was cancelled mid-render.

### `qd-schwarz-gpumsg-01` — GPU→CPU fallback is decided by sniffing `'failed'` in a sticky `sState.gpuMsg`, so one transient GPU exception permanently double-renders every frame

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `apps/quadrature-domains/app/schwarz/schwarz-render.mjs:86` | `UNVERIFIED` |

**Evidence**

```js
      } catch (e) {
        // GPU render failed (e.g. context lost). Fall through to CPU path.
        sState.gpuMsg = 'GPU render failed; using CPU. ' + (e.message || e);
        // Continue below — CPU pyramid.
      }
      if (!sState.gpuMsg || sState.gpuMsg.indexOf('failed') === -1) {
```
The decision reads a *persistent* state field rather than a local flag set by this frame's `catch`. `sState.gpuMsg` is only cleared on a new φ capture (`app/schwarz/schwarz-ui.mjs:1162  sState.gpuMsg = '';`) or a WebGL context restore (`schwarz-ui.mjs:1224`); nothing in the render loop resets it. `activeRenderer()` (`schwarz-ui.mjs:1244-1249`) does NOT consult `gpuMsg`, so the GPU branch keeps being entered and keeps succeeding.

**Failure scenario**

A single `gl` call inside the try block throws — e.g. `setColormap` fails to allocate the 256×1 texture under GPU memory pressure, or a context-loss race where `gl.isContextLost()` returned false at entry but the driver rejected the draw. `sState.gpuMsg` is now permanently `'GPU render failed; using CPU. …'`. On every subsequent `doRecompute` the GPU path runs to completion (drawing a correct frame), then the `indexOf('failed') === -1` test fails, so control falls to line 111 `showGLLayer(false)` — hiding the freshly rendered GPU image — and re-renders the whole field on the CPU pyramid. Both renderers now run on every pan/zoom/param change for the rest of the φ's life, and the stale error string is appended to the progress text.

**Proposed fix**

Use a frame-local boolean: `let gpuOk = true;` set `gpuOk = false` in the `catch`, and branch on `if (gpuOk) { … return; }`. Keep `sState.gpuMsg` purely as display text, and clear it at the top of a successful GPU render so a recovered context stops advertising a stale failure.

### `qd-schwarz-gl-listener-01` — `createGPURenderer` attaches a `webglcontextlost` listener that `destroy()` never removes, accumulating one per context-loss/restore cycle

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | memory | trivial | `apps/quadrature-domains/app/schwarz/schwarz-webgl.mjs:829` | `UNVERIFIED` |

**Evidence**

```js
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
```
and the teardown (`schwarz-webgl.mjs:1100-1106`) frees only GL objects:
```js
    function destroy() {
      if (phiState.mask) gl.deleteTexture(phiState.mask);
      if (colormapTex) gl.deleteTexture(colormapTex);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(prog);
      gl.deleteShader(vs); gl.deleteShader(fs);
    }
```
The owner re-invokes the factory on the SAME long-lived canvas after each loss (`app/schwarz/schwarz-ui.mjs:1223-1232`): the restore handler sets `sState.gpu = null` then calls `ensureGPU()`, whose `if (!glC)` guard skips re-creating the canvas but whose `sState.gpu = QD.Schwarz.createGPURenderer(glC)` runs unconditionally. `destroy()` is in fact never called anywhere in the Schwarz UI (`grep -rn "gpu.destroy" app/schwarz/` is empty), so even removing the listener there would not help. `app/sphere/sphere-webgl.mjs:131` has the identical pattern, re-invoked from `sphere-ui.mjs:117-119`.

**Failure scenario**

A machine that loses the WebGL context repeatedly (integrated GPU under memory pressure, laptop sleep/wake, GPU driver reset) cycles lost→restored N times over a long session. Each cycle adds one more anonymous `webglcontextlost` closure to `#schwarz-gl-canvas` (and one to `#sphere-gl-canvas`), each capturing its now-dead renderer scope — the `phiState` typed arrays (`branchA` alone is `MAX_BRANCHES*MAX_K*2 = 192` floats, plus `polyA`/`lqdBeta`/mask handles) stay reachable and cannot be collected. After ~20 cycles the next loss dispatches 20 handlers and retains 20 dead renderer closures.

**Proposed fix**

Name the handler and detach it in `destroy()`: `const onLost = (e) => e.preventDefault(); canvas.addEventListener('webglcontextlost', onLost, false);` … `canvas.removeEventListener('webglcontextlost', onLost, false);`. Then have the owner actually call it — in `schwarz-ui.mjs` the `webglcontextlost` handler should do `if (sState.gpu && sState.gpu.destroy) sState.gpu.destroy();` before `sState.gpu = null`, and `sphere-ui.mjs`'s restore handler should destroy the old renderer before replacing it. Alternatively guard the attach with a canvas sentinel (`if (!canvas._ctxLostWired)`) exactly as `sphere-ui.mjs:115` already does for its restore listener.

### `qd-psw-signal-dead-01` — `PrimarySolverWorker.solve`'s AbortSignal support is unreachable dead code — no caller passes a third argument

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/quadrature-domains/app/primary-solver-worker.mjs:159` | `UNVERIFIED` |

**Evidence**

```js
        // Forward AbortSignal -> cancel(). The signal can be supplied by the
        // caller (e.g. ui.js when a fresh edit supersedes the prior solve).
        const signal = runOpts.signal;
        if (signal) {
          if (signal.aborted) { cancel(); return; }
          const onAbort = () => { cancel(); };
          signal.addEventListener('abort', onAbort, { once: true });
        }
```
The comment names `ui.js` as the supplier, but every call site passes exactly two arguments, so `runOpts` is always `{}`:
- `app/ui-solve.mjs:308  if (PSW && typeof PSW.solve === 'function') return PSW.solve(built, opts);`
- `app/ui.mjs:1509  ? await PSW.solve(built, opts)`
- `app/ui.mjs:1129  ? (h, o) => PSW.solve(h, o)`
`grep -rn "AbortController" app/ui*.mjs app/direct app/param-slice app/schwarz` returns nothing outside `app/algebra/`, and the algebra module does not call `PSW.solve`. Supersession is instead handled by the `_inflight.reject({aborted:true, superseded:true})` path at line 140-144 plus `_solveAndRenderToken`.

**Failure scenario**

Not a runtime failure — a maintenance hazard. The block also hides a latent bug for whoever first wires it up: `onAbort` is registered on the caller's signal but never removed when the job settles normally, so a controller aborted AFTER its solve resolved (the natural "abort the previous request" idiom) calls `cancel()` → `_disposeWorker()`, terminating the worker that is currently serving a NEWER solve and rejecting it with `{aborted:true}`. A developer following the comment's invitation to pass a signal from `ui.js` would introduce exactly that cross-job cancellation.

**Proposed fix**

Either delete the block and the `runOpts` parameter (supersession already works via the `_inflight` reject + `_solveAndRenderToken` guard), or make it correct before anyone uses it: capture the job id in the closure and no-op if `_inflight?.jobId !== jobId`, and `signal.removeEventListener('abort', onAbort)` inside `onMessage` when the job settles. Deleting is the honest option given the comment describes a caller that does not exist.

### `qd-solverqd-centroid-01` — `Family.boundedQD.normalizeOpts` open-codes the pole centroid that `QD.poleCentroid` was extracted to be the single source of

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/quadrature-domains/app/solver-qd.mjs:359` | `UNVERIFIED` |

**Evidence**

```js
    normalizeOpts(opts, hData) {
      let w0 = opts.w0;
      if (!w0) {
        let sumRe = 0, sumIm = 0;
        for (const p of hData.poles) { sumRe += p.a.re; sumIm += p.a.im; }
        const n = hData.poles.length;
        w0 = n > 0 ? { re: sumRe / n, im: sumIm / n } : { re: 0, im: 0 };
      }
      return { w0 };
    },
```
The shared helper exists and documents itself as having already absorbed the other copies (`app/solver.mjs:1713-1725`):
```js
// Arithmetic mean of the pole positions a_j — the default Riemann-map center φ(0) for the
// bounded families … Single source for what were three open-coded copies (ui.js buildW0,
// solver-pqd bootstrap, solver-lqd normalizeOpts).
function poleCentroid(hData, fallback) { … }
```
and the sibling families were migrated — `app/solver-lqd.mjs:405  w0 = QD.poleCentroid(hData, { re: 1, im: 0 });`. `boundedQD` — the catch-all default family, i.e. the most-executed one — was missed.

**Failure scenario**

Divergence risk rather than a live bug: `poleCentroid` is the documented single source, so a future change to the default-centre rule (e.g. area-weighting the poles by |C_{j,1}|, or excluding poles at ∞) will be made there and will silently NOT apply to `Family.boundedQD` — the classical bounded QD, which is also the fallback every unmatched `opts` bag lands on via `selectFamily`. The two default centres would then disagree between the classical family and every weighted family, changing which root the classical solve converges to while the LQD/PQD solves change with the helper.

**Proposed fix**

Replace the body with `let w0 = opts.w0 || QD.poleCentroid(hData); return { w0 };` — `poleCentroid`'s no-pole fallback already returns `{re:0, im:0}`, which is exactly the current behaviour, so this is byte-identical today.

### `qd-altpanel-null-01` — `refreshAlternatesPanel` dereferences `state.current` unguarded, throwing if a display-only search-option is toggled before the first solve lands

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | correctness | trivial | `apps/quadrature-domains/app/ui-solve.mjs:988` | `UNVERIFIED` |

**Evidence**

```js
function refreshAlternatesPanel() {
  const card = $('#alternates-card');
  const list = $('#alternates-list');
  list.innerHTML = '';

  const all = state.current.success
    ? [state.current.primary, ...(state.current.alternates || [])]
    : [];
```
`state.current` starts as `null` (`app/ui-state.mjs:70  current: null,`). Two callers reach it without establishing a solve first — the display-only search-option handlers (`app/ui.mjs:1371-1385`):
```js
  const displayOnly = new Set(['#so-show-non-univalent', '#so-show-id-failing']);
  …
      if (displayOnly.has(sel)) {
        refreshAlternatesPanel();
```
and `startBackgroundAltSearch`'s `stop()` (`ui-solve.mjs:1069-1074, 1079`), whose own guard `if (!state.current || !state.current.success) { stop(); return; }` calls straight into the unguarded deref. Every other caller in the file sits after a `state.current = …` assignment, which is why this has not surfaced.

**Failure scenario**

Load the app with a share link whose config yields no poles (or edit the h-text to empty). `solveAndRender()` bails at `if (!built) { setStatus({kind:'err', text:'No poles entered.'}); return; }` (`ui-solve.mjs:275-278`) WITHOUT assigning `state.current`, so it stays `null`. The user then opens the "Search options" card and ticks "Show non-univalent": the change handler calls `refreshAlternatesPanel()`, which throws `TypeError: Cannot read properties of null (reading 'success')`. The checkbox state is already flipped in the DOM but `readSearchOptions()` ran first, so the UI is left inconsistent and the exception surfaces as an uncaught error in the console. The same window exists on a cold load between the initial `solveAndRender()` dispatch and the worker's first reply.

**Proposed fix**

Make the read null-safe: `const all = (state.current && state.current.success) ? [state.current.primary, ...(state.current.alternates || [])] : [];`. One line, and it also makes `stop()`'s existing `!state.current` branch actually work as written.

---

## Scope: ux-a11y — usability, accessibility, error-handling UX (VERIFIED)

**Reviewer's summary of what was read and overall impression:**

I read the four apps' entry markup and stylesheets end to end (apps/complex-dynamics/index.html 2255 lines + src/styles/main.css 1757 lines; apps/quadrature-domains/app/index.html 733 lines + style.css 1705 lines; apps/correspondences/index.html + mating.html + src/main.ts; apps/launcher/index.html), then the UI modules that drive them: CD's src/main.ts (modal/onboarding/mobile-sheet/layout/export/saved-views/validation wiring), src/ui/{toast,controls,glossary}.ts, src/render/{glPlot,plotView}.ts; QD's qol.mjs, ui.mjs, ui-solve.mjs, ui-h-text.mjs, ui-url-state.mjs, ui-modes.mjs, ui-presets.mjs, parse-h.mjs, ui-domain-plot.mjs, ui-faber.mjs, ui-qd-equations.mjs, critical-set.mjs plus the schwarz/direct/param-slice UI shells. Overall health of this scope is good and clearly deliberate: CD has real ARIA on its interactive canvases with a matching keyboard implementation, `aria-invalid` + an assertive error region for input validation, progress+cancel on high-res export, and a toast for essentially every failure path; QD has fixed its 750 ms error-toast bug, has a global uncaught-error surface, wires tab↔panel ARIA programmatically, traps focus in its shortcuts overlay, and has an explicitly documented contrast token. The defects that remain cluster in three places: (a) modal/off-screen focus management in CD (dialogs declare `aria-modal` but never move, trap, or restore focus; the mobile sheet parks ~190 focusable controls off-screen), (b) two lists that must agree but do not in QD (the h(w) polynomial-part mode predicate), which breaks shipped presets and share links, and (c) state-only-in-CSS custom widgets plus a handful of inline colours that bypass the token that was introduced to fix exactly that contrast failure. I checked and deliberately did NOT report several near-misses: QD's silent catches around the critical-point/curvature overlays (findCriticalPoints is fully defensive and cannot realistically throw), CD's WebGL init failure (handled with a real banner), and QD's `--c-muted` token itself (correctly computed and AA-clean).

### `qd-polyh-01` — QD: the polynomial-part mode list in parse-h disagrees with the UI's, so five shipped PQD-unbounded presets cannot be re-parsed and their share links silently fail to restore

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | correctness | trivial | `apps/quadrature-domains/app/parse-h.mjs:410` | **CONFIRMED** (severity → high) |

> **Verifier:** Reproduced empirically. `node` probe importing app/solver.mjs + poly-helpers.mjs + parse-h.mjs and calling QD.parseH('0.3', math, {mode}) gives: unbounded OK, lqd-unbounded OK, lqd-unbounded-singular OK, but pqd-unbounded and pqd-unbounded-singular both THROW 'polynomial part of h is only valid in unbounded mode'. The two lists genuinely disagree: parse-h.mjs:410-412 `const allowPoly = (mode === 'unbounded' || mode === 'lqd-unbounded' || mode === 'lqd-unbounded-singular');` (throw at :502) vs ui-h-text.mjs:42-48 modeAllowsPoly which also returns true for 'pqd-unbounded' and 'pqd-unbounded-singular'. Wiring confirmed end to end: ui.mjs:700-711 composeMode makes state.mode literally 'pqd-unbounded'; ui-modes.mjs:164 and :189 both carry `cards: { w0: false, c: true, poly: true, ... }` so ui.mjs:650 `$('#poly-part-section').classList.toggle('hidden', !desc.cards.poly)` leaves the poly editor visible; ui-pole-grid.mjs:107/:158 call refreshHText after every preset/grid render, and ui-h-text.mjs:61-65 writes the poly part into #h-text under modeAllowsPoly; ui-h-text.mjs:105 then feeds it back as `QD.parseH(expr, math, { mode: state.mode })` and :106-108 returns on throw before ui.scheduleSolve() at :162. Exactly five shipped presets are affected — ui-presets.mjs:132/152/159/166 (QD_PRESETS_UNBOUNDED_PQD) and :177 (QD_PRESETS_UNBOUNDED_PQD_SINGULAR); the sixth polyCoeffs hit at :209 is the classical-unbounded deltoid, which parseH allows. Share-link restore is affected as claimed: ui-url-state.mjs:75-76 serializes the #h-text string and :137-139 does `inp.value = String(s.h); parseAndApplyHText();`.

**Evidence**

parse-h.mjs:410 allows a polynomial part in exactly three modes:

    const allowPoly = (mode === 'unbounded' ||
                       mode === 'lqd-unbounded' ||
                       mode === 'lqd-unbounded-singular');
    ...
    if (!allowPoly && result.polyCoeffs.length > 0) { ... throw new Error("polynomial part of h is only valid in unbounded mode (switch the mode or remove the w^k terms)"); }

but the UI predicate that *generates* the text, ui-h-text.mjs:43, allows five:

    return mode === 'unbounded' ||
           mode === 'pqd-unbounded' ||
           mode === 'pqd-unbounded-singular' ||
           mode === 'lqd-unbounded' ||
           mode === 'lqd-unbounded-singular';

and ui-modes.mjs:164/189 give both PQD-unbounded modes `cards: { ... poly: true ... }`, so #poly-part-section is visible and editable there. Five shipped presets carry a nonzero polyCoeffs in those two modes — ui-presets.mjs:132 (`polyCoeffs: ['0.3']`, the FIRST entry in QD_PRESETS_UNBOUNDED_PQD), :152, :159, :166, :177. refreshHText (ui-h-text.mjs:61-65) writes that polynomial part into #h-text, and parseAndApplyHText (:105) then feeds it straight back to `QD.parseH(expr, math, { mode: state.mode })`.

**Failure scenario**

Set Weight = PQD, Domain = Unbounded, pick the default preset "α=2 constant: h = 0.3, c = 1 (Example 4.3.1)". #h-text now reads "0.3". Press Enter in that box (ui.mjs:1030) or click Parse (ui.mjs:1028): parseH throws, parseAndApplyHText returns at ui-h-text.mjs:107 after setHTextMsg, so the pole grid is not rebuilt and scheduleSolve() is never reached — the app reports, in red, that a polynomial part 'is only valid in unbounded mode' while the user is standing in an unbounded mode. Worse, the same call is the share-link restore path: ui-url-state.mjs:139 does `inp.value = String(s.h); parseAndApplyHText();`, so opening a #vs= link for any of those five presets throws, drops the entire quadrature datum, never solves, and leaves the app on its default h with only an inline red line as the signal.

**Proposed fix**

Make the two lists one source of truth. Either export ui-h-text's modeAllowsPoly (or a shared MODES[x].cards.poly lookup) and have parseH consume it, or extend parse-h.mjs:410 to `mode === 'pqd-unbounded' || mode === 'pqd-unbounded-singular'` and fix the stale 'exactly the three unbounded family panels' comment above it. Add a regression test that round-trips every entry of every QD_PRESETS_* list through formatH → parseH under its own mode. Separately, reword the throw so it names the offending mode instead of asserting the user is not in an unbounded one.

### `cd-modal-focus-01` — CD: the Glossary and Help modals declare aria-modal but never move, trap, or restore focus — a keyboard user cannot scroll the glossary and must tab through ~190 hidden background controls to reach Close

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **high** | usability | small | `apps/complex-dynamics/src/main.ts:707` | **OVERSTATED** (severity → medium) |

> **Verifier:** The focus-management half is real and verified: main.ts:704-717 (glossary) and :802-817 (help) only flip `overlay.hidden`; the single `.focus()` call in the whole of apps/complex-dynamics/src is main.ts:527 (onboarding); `grep -rn 'inert|tabindex' src/ index.html` returns only two authored tabindex="0" attributes (index.html:198, :372) and one prose use of the word 'inert' in a comment — so no focus move, no trap, no restore, and aria-modal="true" (index.html:1917, :2244) is asserted over a non-inert background of 197 form controls. But two load-bearing claims in the write-up are wrong or browser-dependent. (a) The headline 'a keyboard user cannot scroll the glossary': .glossary-body (main.css:1224-1227) has zero focusable descendants, which is exactly the condition under which Chrome 127+ and Firefox make a scroll container keyboard-focusable and arrow-scrollable — so on the two dominant engines the content IS reachable, just after a long tab walk. (b) 'both #glossary and #help-ref sit at the very END of <body>' is false for #help-ref: index.html:1913 is mid-document inside the controls pane, with the comment at :1910-1912 stating the placement is deliberate ('its place in the DOM is immaterial; it stays here next to the controls it documents'). Escape (main.ts:723-725, :814-816) and backdrop click (:720-722, :811-813) both close, so the user is never stuck. Real WCAG 2.4.3/4.1.2 defect, but medium rather than high.

**Evidence**

main.ts:704-717 is the whole open/close implementation:

    const close = (): void => { overlay.hidden = true; };
    openGlossary = (termId?: string): void => {
      overlay.hidden = false;
      if (termId) { ... t.scrollIntoView({ block: "center" }); ... }
    };

and setupHelpReference (main.ts:802-817) is identical: `byId("help-ref-btn").addEventListener("click", () => { overlay.hidden = false; });`. Neither calls .focus(), neither traps Tab, neither restores. A repo-wide grep for `.focus()` under apps/complex-dynamics/src returns exactly one hit — main.ts:527, the onboarding dismiss button. Meanwhile index.html:1913-1919 and :2240-2246 declare `role="dialog" aria-modal="true"`, main.css:1134 makes the overlay `position: fixed; inset: 0; background: rgba(0,0,0,0.45)`, and both #glossary and #help-ref sit at the very END of <body> (lines 2240 and 1913) after all 197 form controls. The glossary body is its own scroll container with no tab stop: main.css:1224 `.glossary-body { overflow-y: auto; }` inside `.glossary-card { max-height: 80vh }` (main.css:1195), and #glossary-body is populated with 34 entries of plain <div>/<strong>/<p> (main.ts:675-702) — zero focusable descendants.

**Failure scenario**

A keyboard-only user clicks (or presses Enter on) the app-bar 'Glossary' button. The overlay opens; focus stays on #help-btn, behind the backdrop. Pressing ↓ / PageDown scrolls the document, not .glossary-body, so the user can read only the first screen of a ~7000-word glossary and can never reach 'Mating', 'Perturbation', or the Conventions section. Pressing Tab walks into the ~190 controls behind the darkened overlay — invisible, but still focusable and clickable via Enter/Space — before finally arriving at #glossary-close. A screen-reader user gets nothing announced on open, and because aria-modal="true" is asserted while the background is not inert, AT-constrained virtual cursors and the real Tab order disagree.

**Proposed fix**

On open: remember document.activeElement, add `tabindex="-1"` to .glossary-body (and #help-ref's) so the scroll container is focusable, focus the close button or the body, and set `inert` on `.page` (or aria-hidden + a Tab-cycle trap over the card, like QD's own openShortcutsOverlay in qol.mjs:418-428 already does). On close, restore focus to the remembered element. Apply the same to #export-progress (index.html:2185), which likewise never focuses its Cancel button.

### `cd-sheet-offscreen-01` — CD: the mobile controls sheet is parked off-screen with transform only, leaving ~190 focusable controls in the tab order while it is closed

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | usability | trivial | `apps/complex-dynamics/src/styles/main.css:1708` | **CONFIRMED** (severity → medium) |

> **Verifier:** Verified verbatim. main.css:1695-1713 inside `@media (max-width: 720px)`: `.controls-pane { position: fixed; left:0; right:0; bottom:0; z-index:96; max-height:85dvh; overflow-y:auto; ... transform: translateY(100%); transition: transform .25s ease; }` and `.controls-pane.is-open { transform: translateY(0); }` — no display, visibility, or hidden. main.ts:470-473 setOpen only does `pane.classList.toggle("is-open", open)` + `fab.setAttribute("aria-expanded", ...)`; the doc comment at main.ts:461-464 confirms the slide is purely CSS-class-driven. `grep -rn 'inert' src/` finds only the word in a prose comment (main.ts:463), never the attribute. index.html:507 `<div class="controls-pane" id="controls-pane">` opens before the point inspector at :522 and every control group, and the file has 197 <input>/<select>/<button>/<textarea> elements. transform does not remove elements from the tab order, and position:fixed prevents scroll-into-view, so the focus ring is genuinely off-screen. Note this also bites desktop users who narrow the window below 720 CSS px, not only phones.

**Evidence**

main.css:1695-1712, inside `@media (max-width: 720px)`:

    .controls-pane {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 96;
      ...
      transform: translateY(100%);
      transition: transform 0.25s ease;
    }
    .controls-pane.is-open { transform: translateY(0); }

The only JS state change is the class (main.ts:470-473):

    const setOpen = (open: boolean): void => {
      pane.classList.toggle("is-open", open);
      fab.setAttribute("aria-expanded", open ? "true" : "false");
    };

No `display: none`, no `visibility: hidden`, no `inert`, no `hidden` attribute — and #controls-pane (index.html:507) wraps the entire sidebar: the point inspector plus every control group. index.html contains 197 <input>/<select>/<button>/<textarea> elements, essentially all of them inside this pane.

**Failure scenario**

On a phone (viewport ≤ 720px) with the sheet closed, a keyboard or switch-control user tabs off the last app-bar button. Focus enters #controls-pane, which is translated fully below the viewport. Because the element is position:fixed, the browser cannot scroll it into view, so the focus ring is simply invisible: the user presses Tab ~190 more times through iteration boxes, palette selects, and the Delete-view button with no visual feedback and no way to tell where they are. A screen reader likewise reads out the whole closed sheet as ordinary page content, contradicting the FAB's aria-expanded="false".

**Proposed fix**

In the same media query add `visibility: hidden` to `.controls-pane` and `visibility: visible` to `.controls-pane.is-open` (transition `transform 0.25s ease, visibility 0s linear 0.25s` so the slide-out still animates), or set the `inert` attribute in setOpen() when the media query matches. Keep the desktop path untouched — the rule is already scoped to max-width: 720px.

### `cd-aria-hidden-focus-01` — CD: aria-hidden="true" wraps the focusable mobile-sheet close button, so its only visible dismiss control is invisible to assistive tech

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | usability | trivial | `apps/complex-dynamics/index.html:509` | **CONFIRMED** (severity → medium) |

> **Verifier:** index.html:509-520 is exactly as quoted: `<div class="sheet-handle" aria-hidden="true">` wrapping `<span class="sheet-grip">`, `<span class="sheet-title">Controls</span>`, and the focusable `<button type="button" id="controls-close" class="sheet-close" aria-label="Close controls">`. The button is a live control (main.ts:475 `closeBtn.addEventListener("click", () => setOpen(false));`) and main.css:1716-1727 sets `.sheet-handle { display: flex; ... }` inside `@media (max-width: 720px)` while the base rule main.css:1670-1673 keeps it display:none on desktop — so on mobile it is displayed, focusable, and aria-hidden: the axe `aria-hidden-focus` / WCAG 4.1.2 violation. One narrowing: the ✕ is not strictly the *only* dismiss path — Escape works (main.ts:476-478) and the FAB toggles (main.ts:474) — but the FAB is z-index 95 (main.css:1680) under the sheet's z-index 96 (main.css:1700), so while the sheet is open the ✕ is the only *visible* control, as claimed.

**Evidence**

index.html:509-520:

    <div class="sheet-handle" aria-hidden="true">
      <span class="sheet-grip"></span>
      <span class="sheet-title">Controls</span>
      <button
        type="button"
        id="controls-close"
        class="sheet-close"
        aria-label="Close controls"
      >
        ✕
      </button>
    </div>

The button is wired as a real control — main.ts:475 `closeBtn.addEventListener("click", () => setOpen(false));` — and main.css:1716 gives `.sheet-handle { display: flex; ... }` inside `@media (max-width: 720px)`, so on a phone the container is displayed and the button is focusable while its ancestor is removed from the accessibility tree. That is the `aria-hidden-focus` violation (WCAG 4.1.2); the carefully-written `aria-label="Close controls"` on the button can never be read.

**Failure scenario**

On a phone with the controls sheet open, a VoiceOver/TalkBack user swipes or tabs to the sheet's ✕. The AT announces nothing (or 'blank') because the whole .sheet-handle subtree is aria-hidden, so the user cannot tell the control exists or what it does — and the sheet's title 'Controls', which is the only label identifying the region, is hidden too.

**Proposed fix**

Drop aria-hidden from .sheet-handle and instead put aria-hidden="true" on the purely decorative <span class="sheet-grip"> alone. Give the sheet region an aria-labelledby pointing at the .sheet-title span so the pane is named for AT.

### `qd-seg-aria-01` — QD: every segmented control signals its selection through a CSS class only — no aria-pressed/aria-checked, so the current weight, domain, and view mode are unreadable to assistive tech

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | usability | small | `apps/quadrature-domains/app/ui.mjs:714` | **CONFIRMED** (severity → medium) |

> **Verifier:** Verified. index.html:109-120 declares `role="group" aria-label="Weight class"` / `"Domain extent"` with plain `<button class="seg-btn active">` children and no state attribute; ui.mjs:714-715 `$$('#dm-weight .seg-btn').forEach(b => b.classList.toggle('active', ...))` is the only state write, and ui.mjs:975-982 does the same on click. `grep -rn "aria-pressed|aria-checked|role=\"radio\"" app/index.html app/*.mjs` returns exactly two hits, both for an unrelated control (index.html:616 #sp-dock, ui.mjs:1448) — so no segmented button anywhere carries an accessible selected state. The other five groups check out: direct/direct-ui.mjs:220/224 (finding cites direct-ui.mjs; the real path is app/direct/direct-ui.mjs, same lines), schwarz/schwarz-ui.mjs:325-327, :351-352, :423, :806. CSS claims verified: style.css:1668-1671 `.segmented .seg-btn.active { background: var(--c-accent); color: #fff; }` is the sole visual cue, style.css:1652-1657 `.segmented { ... overflow: hidden; }`, style.css:616-620 `button:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }` — an outline-offset ring on a child of an overflow:hidden ancestor does get clipped. The 'no confirmation that anything changed' claim also survives: applyModeVisuals writes a plain-language summary to #dm-summary (ui.mjs:680-681) but index.html:128 declares it as `<div class="hint" id="dm-summary">` with no aria-live, and no ancestor is a live region (the only ones in the file are :58, :446, :613, :713).

**Evidence**

The markup (index.html:109-120) declares a group but no state:

    <div class="segmented" id="dm-weight" role="group" aria-label="Weight class">
      <button type="button" class="seg-btn active" data-weight="classical" ...>QD</button>
      <button type="button" class="seg-btn" data-weight="pqd" ...>PQD</button>
      <button type="button" class="seg-btn" data-weight="lqd" ...>LQD</button>
    </div>

and the only state update is the class (ui.mjs:714-715):

    $$('#dm-weight .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.weight === d.weight));
    $$('#dm-domain .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.domain === d.domain));

The same pattern repeats in direct-ui.mjs:220/224 (#dir-dm-weight, #dir-dm-domain) and schwarz-ui.mjs:325-327 (plane / z-disk / sphere), :351-352 (fractal / domain color), :423, :806 — six groups in all. The only visual cue is likewise class-driven: style.css:1669 `.segmented .seg-btn.active { background: var(--c-accent); color: #fff; }`.

**Failure scenario**

A screen-reader user lands on the 'Weight class' group and hears three plain buttons — 'QD', 'PQD', 'LQD' — with no indication that QD is the current one. Since the whole downstream UI (which hint text shows, whether #dm-singular is enabled, which preset list loads, which solver family runs) is keyed off that selection, the user cannot determine what problem they are about to solve, and after pressing 'LQD' gets no confirmation that anything changed.

**Proposed fix**

These are single-select groups, so give each button `aria-pressed` (toggle-button pattern) or `role="radio" + aria-checked` inside `role="radiogroup"`, and set it in the same forEach that toggles .active — e.g. `b.setAttribute('aria-pressed', String(b.dataset.weight === d.weight))`. Do it in all six sites. While there, note that style.css:1655 sets `.segmented { overflow: hidden }` while style.css:617 draws the keyboard ring as `outline: 2px solid; outline-offset: 2px` — an ancestor's overflow clip trims descendant outlines, so add an inset ring (e.g. `box-shadow: inset 0 0 0 2px var(--c-primary)`) for `.segmented .seg-btn:focus-visible`.

### `cd-ctxlost-01` — CD: WebGL context loss is logged to the console only — the fractal freezes while overlays and readouts keep updating, with no user-visible signal and no recovery prompt

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | usability | small | `apps/complex-dynamics/src/render/glPlot.ts:547` | **OVERSTATED** (severity → low) |

> **Verifier:** The narrow factual claim holds: glPlot.ts:547-551 only sets `this.contextLost = true` and console.warn()s, glPlot.ts:1834 `if (this.contextLost) return;` is the only draw-path consumer (plus :1721), and showFatalBanner (main.ts:174-180) / #webgl-error (index.html:175) are reached only from the init try/catch at main.ts:4314-4325 — so nothing user-facing fires on context loss. But the severity rests on a scenario the code contradicts. The finding's evidence block stops at line 551 and omits the very next handler, glPlot.ts:552-556: `this.canvas.addEventListener("webglcontextrestored", () => { this.contextLost = false; this.restoreContext(); ... })`, with restoreContext() at :559+ rebuilding every GL resource — the doc comment at :544-545 says the pair exists precisely 'so a dropped context (deep df64 renders can trip the watchdog) recovers instead of leaving a dead canvas.' The stated failure requires the browser to never fire webglcontextrestored, which is the uncommon permanent-loss case. The 'stale image the user reads as current' framing is also dubious: per spec the drawing buffer is lost on context loss, so the WebGL canvas goes blank rather than freezing on the last frame — the user sees the overlay polyline over an empty plot, which is a visible (if unexplained) signal, not a silently wrong picture. Real gap, but low.

**Evidence**

glPlot.ts:547-556:

    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); // required for the context to become restorable
      this.contextLost = true;
      console.warn(`[${this.fractType}] WebGL context lost`);
    });

and the only consumer of that flag on the draw path is glPlot.ts:1834:

    render(): void {
      if (this.contextLost) return;

Nothing writes to the UI. #webgl-error (index.html:175, `class="banner" role="alert" hidden`) and showFatalBanner (main.ts:174-180) already exist but are used only by the init try/catch at main.ts:4314-4325 — they are never reached from context loss. The 2D overlay canvases (#MCSOverlay / #JCSOverlay) are drawn by plotView/overlay and never consult contextLost, so they keep repainting.

**Failure scenario**

A deep df64 or perturbation render trips the GPU watchdog (or the user has burned through the browser's per-page context budget), and the browser does not fire webglcontextrestored. Every subsequent pan, zoom, iteration change, or drag of the white point now no-ops in render(), but the hover readout, the orbit polyline, and the point inspector all keep updating over the stale image. The app looks fully alive while showing a picture that no longer corresponds to the stated centre, zoom, or c — the user's only clue is a console warning they will not see, and the honest reading of the on-screen fractal (which the caption and readouts label with the current parameters) is now wrong.

**Proposed fix**

In the webglcontextlost handler, surface the state: call the existing showFatalBanner/#webgl-error path (or showToast(..., "error")) with 'The GPU dropped this plot's rendering context; reload to restore it', and clear it from webglcontextrestored. Optionally gate the overlay repaint on contextLost too, so the overlays do not advertise a view the fractal is no longer showing.

### `qd-tryharder-cancel-01` — QD: 'Try harder (exhaustive search)' — by far the heaviest operation — has no Cancel and no elapsed-time readout, while the cheaper ordinary solve has both

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | usability | small | `apps/quadrature-domains/app/ui.mjs:1485` | **CONFIRMED** (severity → medium) |

> **Verifier:** Verified on every point. ui.mjs:1485-1533 sets only `btn.disabled = true; busy.classList.remove('hidden');` and the markup it drives is index.html:455-457 `<span id="try-harder-busy" class="hidden" ...><span class="search-spinner"></span> running…</span>` — no cancel, no timer. The ordinary solve has both: index.html:449-453 #solve-busy-row carries #solve-phase, #solve-elapsed, and #solve-cancel-btn; ui-solve.mjs:456-477 showSolveBusy() runs a 100 ms setInterval into #solve-elapsed; ui-solve.mjs:485-496 cancelSolve() calls PSW.cancel() and bumps the token. try-harder never calls showSolveBusy, so that row stays hidden and its Cancel is unreachable during the heaviest run. Budgets confirmed at ui-modes.mjs:383-388 (standard: 8 restarts / maxIter 80 / 20x6) vs :402-408 (exhaustive: 60 restarts / maxIter 200 / 60x10), plus `buildSolverOptions(preset, { findAlternates: true })` at ui.mjs:1500. The sub-claim about the misleading comment is also correct: ui.mjs:1505-1506 says 'the spinner above + the async wrap let it still paint', but the async IIFE body runs synchronously to its first await, and in the no-worker branch `QD.solveInverseQD(built, opts)` (ui.mjs:1510) is reached with no preceding await, so the class change at :1488 cannot be painted before the main thread blocks. Also note ui.mjs:1526 `if (e && e.aborted) return;` implies the run is abortable — only the affordance is missing.

**Evidence**

ui.mjs:1485-1533 shows only a static spinner:

    $('#try-harder-btn').addEventListener('click', () => {
      const btn = $('#try-harder-btn');
      const busy = $('#try-harder-busy');
      btn.disabled = true;
      busy.classList.remove('hidden');
      (async () => { ... const preset = PRESETS.exhaustive; ...
        const result = (PSW && typeof PSW.solve === 'function')
          ? await PSW.solve(built, opts)
          : QD.solveInverseQD(built, opts);

The markup it drives (index.html:456-458) is `<span id="try-harder-busy" ...><span class="search-spinner"></span> running…</span>` — no cancel, no timer. The ordinary solve, which is cheaper, gets both: ui-solve.mjs:456-477 showSolveBusy() starts a 100 ms elapsed ticker into #solve-elapsed, and ui-solve.mjs:485-496 cancelSolve() aborts the warm worker behind #solve-cancel-btn (index.html:452). The budget gap is large: ui-modes.mjs:402-408 gives `exhaustive: { numRestarts: 60, newton: { maxIter: 200, ... }, bgAltChunks: 60, bgAltChunkSize: 10 }` versus `standard: { numRestarts: 8, newton: { maxIter: 80 }, bgAltChunks: 20, bgAltChunkSize: 6 }`, and try-harder additionally passes `{ findAlternates: true }`.

**Failure scenario**

A 3–4-pole unbounded QD fails to solve, so the user takes the app's own advice (ui-strings.mjs:615, 'try the “Try harder (exhaustive search)” button') and clicks it. The exhaustive preset runs 60 restarts × 200 Newton iterations plus a full alternates sweep in the worker for tens of seconds. The user sees an unchanging 'running…' with no elapsed time, cannot tell progress from hang, and has no way to stop it short of reloading the page — which discards the whole session (poles, mode, gauges, view). The comment at ui.mjs:1505-1506 also claims 'the spinner above + the async wrap let it still paint' for the no-worker fallback, but the async IIFE body runs synchronously to `QD.solveInverseQD(...)` with no await before it, so no paint happens and the main thread hard-freezes.

**Proposed fix**

Reuse the existing machinery: call showSolveBusy()/hideSolveBusy() around the try-harder run (it already renders the elapsed ticker and the Cancel button), and have #solve-cancel-btn's handler cancel whichever run is in flight. Delete or correct the inaccurate 'let it still paint' comment, and add a `await new Promise(r => setTimeout(r, 0))` before the synchronous fallback if that path is to be kept.

### `qd-htextmsg-live-01` — QD: h(w) parse failures write only to a plain <div> with no role/aria-live and no aria-invalid, so a failed Parse is completely silent to assistive tech

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | usability | trivial | `apps/quadrature-domains/app/index.html:185` | **CONFIRMED** (severity → medium) |

> **Verifier:** Verified verbatim. index.html:185 is `<div id="h-text-msg" class="hint" style="margin-bottom: 8px; min-height: 1em; color: #b53030;"></div>` — no role, no aria-live; index.html:179-180 `<input type="text" id="h-text" ...>` has no aria-describedby and no aria-invalid. ui-h-text.mjs:72-77 setHTextMsg sets only textContent and style.color, and all four failure paths funnel into it and return (:87 empty, :88 length cap, :94-100 math.js unavailable, :106-108 the parseH throw) with no toast. No ancestor live region exists: the only aria-live/role=status/role=alert declarations in app/index.html are :58 (#boot-loading), :446 (#status), :613 (#status-panel), :713 (#sw-update-banner) — none contains #h-text-msg, which sits in the #controls-qd panel opened at :94. The contrast cases cited are real: index.html:446 `<div id="status" role="status" aria-live="polite" aria-atomic="true">` and qol.mjs:265 `t.setAttribute('role', kind === 'error' ? 'alert' : 'status');` with the comment at :264-265 giving exactly this rationale. `input.invalid` exists unused for this field at style.css:555 (finding said 554, off by one).

**Evidence**

index.html:185 is the sole failure channel for the h(w) input:

    <div id="h-text-msg" class="hint" style="margin-bottom: 8px; min-height: 1em; color: #b53030;"></div>

No role="alert", no aria-live, no aria-describedby from #h-text (index.html:180). The writer, ui-h-text.mjs:72-77, only sets text and colour:

    function setHTextMsg(msg, kind) {
      const el = document.getElementById('h-text-msg');
      if (!el) return;
      el.textContent = msg || '';
      el.style.color = (kind === 'warn') ? '#9a6a00' : '#b53030';
    }

Every failure path in parseAndApplyHText routes here and returns — the empty-expression case (:87), the length cap (:88), the math.js-unavailable case (:94-100), and the parse throw (:106-108) — with no QD.QoL.toast, no `.invalid` class, and no aria-invalid on the input. Contrast this with the app's own patterns: #status (index.html:446) has role="status" aria-live="polite", and qol.mjs:265 sets role="alert" on error toasts precisely because 'without this a screen-reader user gets no signal at all that an operation failed'.

**Failure scenario**

A screen-reader user types `1/(w-2` into the h(w) box and presses Enter. parseH throws, setHTextMsg paints a red line, and parseAndApplyHText returns without scheduling a solve. The AT announces nothing: focus stays in the still-unmarked text input, the plot is unchanged, and there is no other cue anywhere in the page. The user has no way to learn the expression was rejected or why. The same silence covers the 'Loading math engine…' / 'Could not load the math engine.' states.

**Proposed fix**

Add `role="alert"` (or aria-live="assertive" aria-atomic="true") to #h-text-msg, add `aria-describedby="h-text-msg"` to #h-text, and have setHTextMsg toggle `aria-invalid` and the existing `.invalid` class (style.css:554) on #h-text so the failure is visible, announced, and tied to the field. Drive the colour off `--c-err` / `--c-warn` rather than the inline literals while you are in there.

### `cd-views-destructive-01` — CD: deleting a saved view is irreversible with no confirmation or undo, and saving over an existing name silently destroys the old view

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **medium** | usability | small | `apps/complex-dynamics/src/main.ts:2837` | **OVERSTATED** (severity → low) |

> **Verifier:** Both code claims are accurate — main.ts:2836-2845 deleteSelectedView does `delete views[name]; saveSavedViews(views);` with no confirm (`grep -rn 'confirm(' src/` returns nothing), main.ts:2814-2816 overwrites `views[name]` unconditionally then toasts plain success at :2821, and ui/toast.ts:23 `showToast(message, type, timeoutMs)` genuinely cannot host an action button. But the mis-click scenario (a) is materially weaker than described. index.html:161-168 ships the Delete button `disabled` and with `class="danger"`; it is re-disabled on every dropdown refresh (main.ts:2803) and enabled only by main.ts:2827 inside loadSelectedView (the #saved-views change handler, wired at main.ts:3947) or by main.ts:2819 right after a save. So Delete cannot fire on a view the user has not just loaded or just saved — 'they open Views, mean to load it, and click the adjacent Delete' is not reachable, and at the moment Delete becomes clickable the deleted view's full state is still live in the app, so re-typing the name and clicking Save reconstructs it exactly (degraded only if the user panned away first). Claim (b), the silent overwrite, stands unqualified. Real but low.

**Evidence**

main.ts:2836-2845:

    function deleteSelectedView(): void {
      const name = byId<HTMLSelectElement>("saved-views").value;
      if (!name) return;
      const views = loadSavedViews();
      delete views[name];
      saveSavedViews(views);
      populateViewSelect();
      showToast(`Deleted view “${name}”.`, "info");
    }

No confirm, no undo affordance on the toast (showToast in ui/toast.ts:23 takes only a message/type/timeout — it cannot host an action button), and the deletion is committed straight to localStorage. The Delete button sits directly beside the Saved-views select inside the same small popover (index.html:158-169). The save path is worse still — main.ts:2814-2816:

    const views = loadSavedViews();
    views[name] = readFullState();
    saveSavedViews(views);

an unconditional overwrite, followed by `showToast(\`Saved view “${name}”.\`, "info")` at :2821 with no hint that anything was replaced. Note QD has already solved this shape of problem — qol.mjs:258 gained an optional `{ label, onClick }` toast action explicitly so 'a destructive act's recovery affordance' is visible right after the act.

**Failure scenario**

A user has a hand-tuned 1e13 deep-zoom saved as 'spiral'. (a) They open Views, mean to load it, and click the adjacent Delete — the view is gone from localStorage permanently, with no confirm and no undo; the full state (formula, centre, zoom, palette, toggles) is unrecoverable. (b) Or, weeks later, they save a different view under the name 'spiral' again; the original is silently replaced and the toast reports plain success.

**Proposed fix**

Give the delete toast an Undo action (extend showToast with an optional `{label, onClick}` like QD's, restoring the removed entry from a captured copy), or require a confirmation. For save, check `name in views` first and either warn ('Replaced the saved view “spiral”.') or prompt before overwriting.

### `qd-inline777-01` — QD: eleven inline color:#777 sites bypass the --c-muted token that was introduced specifically to fix that colour's 4.48:1 AA failure

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | redundancy | trivial | `apps/quadrature-domains/app/index.html:286` | **CONFIRMED** (severity → low) |

> **Verifier:** Verified. style.css:13-18 carries the rationale comment verbatim ('#777 measured 4.48:1 on --c-surface and 4.07:1 on --c-bg — under WCAG AA's 4.5 for normal text ... #6f6f6f is the LIGHTEST neutral grey clearing 4.5 on both (5.02 / 4.57)') followed by `--c-muted: #6f6f6f;` at :19, and the token block's own header at :1-5 says 'Add new shared values here rather than inlining literals.' `grep -rn '#777' --include=*.mjs --include=*.html --include=*.css` (dist excluded) confirms every cited site: index.html:197, :286, :292, :456, :549; schwarz/schwarz-ui.mjs:379, :614, :708; ui-solve.mjs:1003, :1021, :1022. All are 11px normal-weight DOM text, i.e. the 4.5:1 threshold applies. Two corrections, neither fatal: the count is 12 not 11 — the reviewer missed schwarz/schwarz-ui.mjs:1103 `el.style.color = '#777';` — and two further hits (schwarz/schwarz-paint.mjs:43, ui-domain-plot.mjs:661) are canvas fillStyle, correctly excluded.

**Evidence**

style.css:14-19 records the fix and the measurement:

    /* 5.5: #777 measured 4.48:1 on --c-surface and 4.07:1 on --c-bg — under WCAG AA's 4.5 for
       normal text ... #6f6f6f is the LIGHTEST neutral grey clearing 4.5 on both (5.02 / 4.57) */
    --c-muted:         #6f6f6f;

but eleven call sites still hard-code the rejected value, all of them 11–12px text on --c-surface (#fff, the controls column) or on a card:

    index.html:197  <span style="font-size: 11px; color: #777;">(−1 = no polynomial part)</span>
    index.html:286  <span id="c-estimate-busy" ... style="... font-size: 11px; color: #777;">
    index.html:292  <span id="c-estimate-note" style="display: block; color: #777; font-size: 11px; ...">
    index.html:456  <span id="try-harder-busy" ... style="... font-size: 11px; color: #777;">
    index.html:549  <span style="font-size: 11px; color: #777; ...">searching…</span>
    schwarz-ui.mjs:379, :614, :708
    ui-solve.mjs:1003  note.style.cssText = 'font-size: 11px; color: #777;';
    ui-solve.mjs:1021, :1022  <span style="color:#777"> · ${flag} ${desc}</span> / · id ${...}

**Failure scenario**

A low-vision user on the QD tab reads the solver's per-solution diagnostics — ui-solve.mjs:1021-1022 renders the acceptance flag, its description, and the identity residual in #777 at 11px, i.e. 4.48:1, below the 4.5:1 AA floor for normal text. Same for the 'searching…' and 'running…' busy labels and the c-estimate note, which are exactly the strings that tell the user whether a long operation is still in flight. The project already measured and rejected this colour; only the token was updated.

**Proposed fix**

Replace all eleven `#777` literals with `var(--c-muted)`. For the two in ui-solve.mjs:1021-1022 that are inside interpolated HTML, use a class (e.g. `class="hint-inline"`) styled from the token rather than an inline style, so the next token change cannot miss them again.

### `launcher-soon-contrast-01` — Launcher: opacity 0.62 on the 'Coming soon' card drops its body text to ~3.5:1, below AA — the one card whose text explains why an app is missing

| severity | category | effort | location | verdict |
| --- | --- | --- | --- | --- |
| **low** | usability | trivial | `apps/launcher/index.html:88` | **CONFIRMED** (severity → low) |

> **Verifier:** Verified including the arithmetic. apps/launcher/index.html:76 `.card p { margin: 0; color: var(--muted); font-size: 0.94rem; }`, :88 `.card.soon { opacity: 0.62; }`, :89 the badge rule, with `--panel: #171a21` (:31) and `--muted: #99a1b3` (:33), `.card { background: var(--panel); ... }` at :59-62, and the body radial-gradient at :43. Recomputing WCAG relative luminance: #99a1b3 on #171a21 un-dimmed is 6.72:1 (reviewer said 6.87 — same conclusion, comfortably AA). Compositing at alpha 0.62 over a backdrop of roughly #141720 gives text ≈#666d7b on card ≈#161921, i.e. 3.38:1 — matching the reviewer's ~3.5 estimate and failing the 4.5:1 floor. 0.94rem = 15.04px normal weight, so 'normal text' applies and there is no large-text exemption. The affected paragraph is index.html:126-131, the only text explaining why Correspondences is not clickable, and the two live sibling cards render at full contrast.

**Evidence**

index.html:76 and :88-89:

    .card p { margin: 0; color: var(--muted); font-size: 0.94rem; }
    ...
    .card.soon { opacity: 0.62; }
    .card.soon .badge { color: var(--muted); background: rgba(153, 161, 179, 0.12); }

with `--muted: #99a1b3` and `--panel: #171a21` (index.html:31-33). Un-dimmed, #99a1b3 on #171a21 is 6.87:1 — comfortably AA. The `opacity: 0.62` composites the whole card, text and background alike, over the page's radial gradient (index.html:43), which drops the effective pair to roughly #666d7b on #161921 ≈ 3.5:1 — below the 4.5:1 AA floor for 0.94rem (≈15px) normal-weight text. The 0.72rem uppercase 'Coming soon' badge (index.html:77-87) is dimmer still.

**Failure scenario**

A low-vision visitor lands on the suite's front page and cannot comfortably read the only paragraph that explains what Correspondences is and why it is not clickable — index.html:126-131, 'Built and tested, but not yet part of the published site.' They are left with an unexplained dead card. The two live cards next to it, which need no dimming, read at full contrast.

**Proposed fix**

Drop `opacity` from `.card.soon` and dim only the non-text affordances: keep the card background/border muted (e.g. a slightly darker --panel and a `filter: grayscale(1)` on the badge) while leaving `.card.soon h2` and `.card.soon p` at their normal token colours. Since the card is a <div> and not a link, the missing hover/pointer already communicates 'not available'.

---
