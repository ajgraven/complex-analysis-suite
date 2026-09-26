# infra — summary

Covered: every QD worker entry and main-thread wrapper (`app/workers/*`, `primary-solver-worker.mjs`,
`param-slice-pool.mjs`, `schwarz-cpu-worker.mjs`, `sym-worker.mjs`, `prewarm.mjs`) and their UI callers; `vite.config.mjs`,
`package.json`, `tsconfig.json`, `eslint.config.mjs`, `public/`, the generated service worker; CI/deploy wiring,
`check-built-artifacts.mjs`, the a11y roster entry and `.claude/launch.json`. Ran `pnpm -C apps/quadrature-domains build` / `lint` /
`typecheck` (all green), `node app/node-test.js` (2342 passed, 54 s), `perf/measure.mjs` (headless Chromium 141), a sourcemap
build into scratch for bundle attribution, and four Playwright probes against the built `dist/`. Probe scripts are in
`scratchpad/infra/` (`sw-probe.mjs`, `queue-probe.mjs`, `cmax-probe2.mjs`, `spawn-probe.mjs`).
**Headline:** two P1s, both measured in a real browser. (1) After every deploy, a returning visitor's session runs old code:
lazy tabs 404 and freshly spawned workers 404, which silently latches solver lanes onto the main thread. (2) The one primary
solve lane is shared by independent callers, and supersession corrupts both sides. "Estimate max c" returns a wrong c*
(1.377 instead of 1.449, still labelled `found: true, bracketed`) when the user edits while it runs, and every user solve
posted during the estimate is dropped without a message. Security (XSS through share links) is clean.

## Findings

### INF-1 [P1] PWA autoUpdate purges the running page's own chunks after a deploy, so lazy tabs and new workers 404
- Category: bug
- Location: `apps/quadrature-domains/vite.config.mjs:35-54` (`registerType: "autoUpdate"`, which generates `self.skipWaiting()` and
  `clientsClaim()` in `dist/sw.js`); `app/lazy-features.mjs:19-31` (a failed load is only logged to the console);
  `solvers/primary-solver-worker.mjs:117-123` (a lane that never worked latches to the main thread). There is no
  `controllerchange` or `vite:preloadError` handler anywhere in the app.
- Claim: a visitor who has the app installed opens it after a deploy. The page is served by the OLD service worker from its
  precache. `registerSW.js` then finds the new service worker, which calls skipWaiting, claims the page, and deletes the
  precache entries missing from its manifest. That includes every old hashed chunk the running page still references,
  and Pages no longer hosts the old files either. From then on, every lazy tab and every worker spawned for the first
  time 404s. The Algebra, Schwarz, Parameter-slice and Direct tabs open empty, with no message to the user. A lane
  whose first spawn 404s latches to main-thread solving for the rest of the session. Nothing reloads the page.
- Evidence (measured, `scratchpad/infra/sw-probe.mjs`): a local server serves `dist/` as deploy A. Deploy B is the same
  files with `algebra-*.js` and `solver-worker-entry-*.js` renamed and `sw.js` updated to match. Visit 1 installs SW-A.
  The server then switches to B and the page is reloaded:
  ```
  after reload+6s: {"active":".../sw.js","waiting":false,"installing":false}   <- SW-B already active, page still runs index-xesut0F_.js (A)
  server 404s: ["404 assets/solver-worker-entry-CqOvvD8y.js","404 assets/algebra-CNu4rvdj.js"]
  console: "[primary-solver live worker] error: [object Event] @ bundle:?"
           "[qd] optional feature failed to load: algebra TypeError: Failed to fetch dynamically imported module: .../algebra-CNu4rvdj.js"
  algebra panel: tab-algebra:7:Algebra          <- only the heading renders
  live lane fallback latched: true              <- drag solves now run on the main thread
  ```
  The live worker was spawned by `prewarm.mjs` on the first pointerdown, which here was the tab click. The primary lane
  survives only because the boot solve spawned it before SW-B activated. Any later `cancel()` (the Cancel button, or the
  analysis lane's terminate-on-supersede) respawns into a 404 and latches that lane too.
- Confidence: high
- Prior review: the mechanism was noted for the Schwarz worker in `RAW_FINDINGS_2026-07.md:3454`, and only that consequence
  was fixed. The lazy-tab and lane-latch consequences, and the root cause, are new.
- Fix (S–M): drop silent autoUpdate. Either use `registerType: "prompt"` with a small "new version, reload" banner, or keep
  autoUpdate and add `navigator.serviceWorker.addEventListener('controllerchange', …)` plus
  `window.addEventListener('vite:preloadError', …)`, each triggering one guarded `location.reload()`. `lazy-features.mjs` should
  show a user-visible "reload to update" message instead of only `console.error`. Also make the lane latch conditional on
  the entry URL being reachable, or clear the latch after a reload. CD has the same config
  (`apps/complex-dynamics/vite.config.ts:21`). Add the probe as a Playwright spec so this regression is caught.

### INF-2 [P1] Independent callers share one primary solve lane; supersession drops user solves and corrupts "Estimate max c"
- Category: bug
- Location: `solvers/primary-solver-worker.mjs:153-165` (a new `run()` rejects the in-flight job with
  `{aborted:true, superseded:true}` no matter who posted it); `ui/ui-solve.mjs:473`
  (`if (e && e.aborted) return;` makes solveAndRender return silently, although it still owns its token);
  `solvers/solver-cmax.mjs:199-206` (`callSolve` turns ANY rejection into `{success:false}`, which the estimator reads as
  "no valid QD at this c"). The lane's other callers: `ui/ui.mjs:1090` (Estimate max c), `ui/ui.mjs:1496` (Try harder),
  `ui/ui-thesis.mjs:129` (Verify c*).
- Claim: while a batch caller (the c* estimator, Try harder or the thesis oracle) runs, any solveAndRender (an h edit, a
  drag end or a slider change) supersedes the batch's current probe, and the batch's next probe supersedes the user's
  solve. The user's solve is dropped: status stays "Solving…", the plot keeps the previous h, the busy row disappears,
  and no error is shown. On the estimator's side a superseded probe counts as an INVALID c, so the bisection moves to a
  wrong c* and still reports `found: true, reason: "bracketed"`.
- Evidence (measured, `scratchpad/infra/cmax-probe2.mjs`, real app in Chromium): the cardioid h is
  `{0: [1.5, 0.5]}` with `{unbounded: true}`, and the estimate calls the real `PSW.solve`. A second caller posts an
  easy solve every `period` ms (40 at most):
  ```
  clean:        cMax 1.449381685  found true  bracketed
  period 20 ms: cMax null         found false no-valid-at-start   user solves ok 0 / aborted 8
  period 45 ms: cMax null         found false no-valid-at-start   user solves ok 0 / aborted 8
  period 90 ms: cMax 1.377251026  found true  bracketed           user solves ok 0 / aborted 10
  period 300ms: cMax 1.449381685  found true  bracketed           user solves ok 0 / aborted 2
  ```
  In a real session the interfering caller is the 60 ms-debounced `scheduleSolve`.
- Confidence: high (both effects measured). How often a user edits during an estimate is not measured.
- Prior review: new
- Fix (S–M): give batch callers their own lane, for example a `createWorkerLane` instance named `batch` on the same
  entry, so they never supersede the interactive solve. `callSolve` must re-throw `e.aborted` rather than classify it. Until
  then, solveAndRender should treat `superseded` from a foreign caller as "retry", not "return".

### INF-3 [P2] A superseded primary or aux solve is not preempted: the new job waits behind the whole discarded job
- Category: perf / stale-doc
- Location: `solvers/primary-solver-worker.mjs:153-165` (supersede reuses the busy worker; only the analysis lane sets
  `terminateOnSupersede`); `ui/ui-solve.mjs:385-386`, whose comment says "The worker preempts any prior in-flight solve",
  which is false.
- Claim: a worker cannot run a posted message until its current `onmessage` returns. Each superseded solve is therefore
  computed in full and thrown away, and the latest edit's result waits behind it. `sym-worker.mjs:109-125` already fixed
  exactly this by terminating on supersede. The primary and aux lanes never got that fix.
- Evidence (measured, `scratchpad/infra/queue-probe.mjs`):
  `easyAlone 22.5 ms · hardAlone 1528 ms · easy posted 50 ms after hard (supersede) 955 ms · same after cancel() 87 ms`.
  Here "hard" is two poles with the exhaustive preset (see `slow.mjs`, 1.2–1.5 s in node), and the extra 87 ms is one
  respawn. Worker spawn to first reply measured 14–28 ms for both entries (`spawn-probe.mjs`), so terminating is cheap.
- Confidence: high
- Prior review: new
- Fix (S): set `terminateOnSupersede: true` on the primary and aux lanes, as sym-worker does, and correct the ui-solve comment.

### INF-4 [P3] Worker-failure diagnostics and latching are inconsistent across lanes
- Category: bug / structure
- Location: `workers/worker-crash-detail.mjs:12-14`; `schwarz/schwarz-cpu-worker.mjs:98-122`; `solvers/primary-solver-worker.mjs:122`.
- Claim: (a) a module-load failure raises a plain `Event`, not an `ErrorEvent`, so the logged detail is
  `[object Event] @ bundle:?` (measured in INF-1) and gives no URL. (b) The Schwarz wrapper settles the in-flight render
  but never sets `_mainThreadFallback`, so after a load failure EVERY recompute spawns a doomed worker and then falls
  back. The earlier proposed fix included the latch, and it was not applied. (c) The "never returned a message ⇒ load
  failure" heuristic also latches permanently for a genuine OOM on a lane's first job.
- Evidence: the INF-1 console output; code read.
- Confidence: medium
- Prior review: (b) was reported in `RAW_FINDINGS_2026-07.md:1880` ("set `_mainThreadFallback = true`") and is partially open.
- Fix (S): format with `ev.type`, plus the worker URL captured at spawn. Latch the Schwarz lane on its first load failure.

### INF-5 [P3] The param-slice pool never replaces dead workers; a zero-worker pool silently renders all-unclassified
- Category: bug
- Location: `param-slice/param-slice-pool.mjs:154-172` (`_onWorkerError` drops the worker for good) and `:101-123`
  (`nChunks = Math.min(0, n) = 0` gives `chunkSize = Infinity`, no tiles, and an array of `undefined`);
  `param-slice/param-slice-ui.mjs:1141-1149` (`ensurePool` returns the cached dead pool).
- Claim: a worker-level error (OOM or clone failure) removes that worker for the whole session. Once all workers are gone,
  every render returns undefined results with no message, and hover previews are skipped because `canAccept()` is false.
- Evidence: inferred from code. The tile body catches solver throws (`param-slice-common.mjs:383-446`), so worker-level
  errors are rare.
- Confidence: medium (on how likely it is)
- Prior review: new
- Fix (S): respawn a replacement worker in `_onWorkerError`, or have `ensurePool` rebuild the pool when `workers.length === 0`.

### INF-6 [P3] The message protocol is centralized for the PSW entries only; three other entries keep the silent-hang class
- Category: structure
- Location: `workers/param-slice-worker-entry.mjs:17-18`, `schwarz-worker-entry.mjs:18-19` and `sym-worker-entry.mjs:15-16` drop unknown
  kinds silently (the QD-UI-4 class that `protocol.mjs` closed for the solver entries). The Schwarz render loop
  (`schwarz-worker-entry.mjs:41-86`) has no try/catch. The analysis body is duplicated in
  `analysis-worker-entry.mjs:17-36` and `primary-solver-worker.mjs:253-268`, and the two copies have already diverged (a
  `Math.max(64, …)` sample clamp in one only). The PSW abort listener (`primary-solver-worker.mjs:182-186`) is never detached
  when the job settles; sym-worker's F3 fix was not ported. `cancelSolve` (`ui-solve.mjs:577-590`) stops the alternate search
  by token only, and the aux worker keeps computing.
- Evidence: code read. The abort path is dead because no caller passes `signal`.
- Confidence: high
- Prior review: the dead `signal` was reported as `qd-psw-signal-dead-01` in `CODEBASE_REVIEW_2026-07.md:103` and is still open.
  The rest is new.
- Fix (S): route every entry through `protocol.dispatch`, export `analyze` from one module for both the worker and the
  fallback, and either delete `getSignal` or detach it the way sym-worker does.

### INF-7 [P3] Worker wrapper headers describe the retired Blob/fetch bundle and a file:// path that cannot boot
- Category: stale-doc
- Location: `param-slice/param-slice-pool.mjs:4-7, 41-43` (dead `bundleURL`), `:263-264` and `:342-350`;
  `schwarz/schwarz-cpu-worker.mjs:41-45` and `:139` ("bundle URL is cached → cheap"); `algebra/sym-worker.mjs:5, 21, 60` (still
  requires `Blob` and `fetch`, which it no longer uses); `solvers/primary-solver-worker.mjs:44-49`; `schwarz-cpu-worker.mjs:132`.
- Claim: since Phase 2 the workers are native module chunks. The built app is a `<script type="module" crossorigin>`
  page, which Chromium refuses to load from `file://`, so every "file:// fallback" rationale describes a path that cannot
  occur in the browser. The fallbacks now serve only Node tests.
- Evidence: code read, and `dist/index.html` (`<script type="module" crossorigin src="./assets/index-….js">`).
- Confidence: high
- Prior review: sym-worker's op list was reported in 2026-08-23 A3 and has since been fixed. The Blob and file:// text is new.
- Fix (S): rewrite the headers.

### INF-8 [P3] The build/version label is permanently empty, and the SW-registration comment is stale
- Category: stale-doc / bug
- Location: `app/index.html:759-763` and `:889-896` read `window.QD_ASSET_MANIFEST.CACHE_VERSION`, which no longer exists
  (asset-manifest.js was retired at the ESM flip). `app/index.html:885-886` says PWA registration "is added … in a follow-up
  step", but it exists now. `eslint.config.mjs:29` still declares the global.
- Claim: `#app-version` always renders empty, so the one tool meant to answer "which build are you seeing?" is gone,
  exactly the question INF-1 raises.
- Evidence: grep finds no definition of `QD_ASSET_MANIFEST` anywhere under `app/`, and the element is empty in `dist/index.html`.
- Confidence: high
- Prior review: new
- Fix (S): `define: { __QD_BUILD__: JSON.stringify(gitSha + date) }` in `vite.config.mjs`, written into `#app-version`.

### INF-9 [P3] package.json and the lockfile carry stale identity, a misleading `test` script and phantom dependencies
- Category: stale-doc / structure
- Location: `apps/quadrature-domains/package.json:6, 20, 39`; `apps/quadrature-domains/package-lock.json`.
- Claim: (a) `package-lock.json` is a tracked npm lockfile from the standalone repo: `"name": "quadrature-domain-solver"`,
  `engines >=20`, no vite and no `@cas/*`, added by accident in #300 (c19ec92) in a pnpm workspace. `npm install` in that
  directory would honour it. (b) `repository.url` points to the old `Quadrature-Domains-Visualization-Tool` repo.
  (c) `"test": "node app/node-test.js"` runs the legacy runner (2342 passed, 54 s, measured), not the 29 gated per-file
  Vitest specs, so `pnpm -C apps/quadrature-domains test` is not the gate. (d) mathjs is `^12.4.1` (resolves to 12.4.3)
  while KaTeX is exact-pinned, and mathjs is two majors behind. (e) `typescript` (the `typecheck` script) and `playwright`
  (`perf/*.mjs`, `vitest.browser.config.ts`) are used but not declared; they resolve by walking up to the root.
- Evidence: `head package-lock.json`; `git show c19ec92 --stat`; `grep mathjs@ pnpm-lock.yaml` gives `mathjs@12.4.3`.
- Confidence: high
- Prior review: (e) typescript was reported as `bt-phantom-deps-06` in RAW_FINDINGS and is still open. The rest is new.
- Fix (S): delete package-lock.json, fix the URL, rename the script to `test:legacy` (or point it at the Vitest project),
  exact-pin mathjs, and declare the two dev dependencies.

### INF-10 [P3] `typecheck` checks one file; the 136 Vitest specs are in no tsconfig
- Category: test / tooling
- Location: `apps/quadrature-domains/tsconfig.json` (`checkJs: false`; the comment says "handful of files that already opt in").
- Claim: exactly 1 of about 126 app modules has `// @ts-check` (`app/core/qd.mjs`), so the gated `pnpm typecheck` verifies
  almost nothing for QD (it runs in 3.6 s). The `vitest/*.ts` specs are covered by no tsconfig and are only transpiled.
- Evidence (measured): a scratch tsconfig over `vitest/**/*.ts` gives **22 latent errors** (18× TS2339, 2× TS2493, 1× TS2352,
  1× TS2345). `checkJs: true` over `app/**/*.mjs` in loose mode gives 432 errors.
- Confidence: high
- Prior review: new
- Fix (S): add a `vitest/` include with `noEmit`, fix the 22 errors, and opt the worker and protocol modules into
  `@ts-check` first (ADR-0002 leaves-first).

### INF-11 [P3] eslint.config.mjs targets seven files that do not exist, and its "non-blocking backlog" comment is false
- Category: stale-doc
- Location: `apps/quadrature-domains/eslint.config.mjs:81, 97, 130-133, 142-181, 186-189`.
- Claim: `app/sw.js`, `app/complex.js`, `app/taylor.js`, `app/schwarz/schwarz-common.js`, `app/ui.js`, `app/bench.js` and `app/qd.mjs`
  are all missing, so their blocks are dead (`qd.mjs` moved to `core/qd.mjs`, which now gets the generic ESM rules). The
  comment "no-unused-vars stays at WARN … ~294 findings … visible but non-blocking" is false on both counts: lint runs
  with `--max-warnings 0` and currently reports **0 warnings / 0 errors over 159 files** (measured), so warnings block.
- Evidence: `test -e` over each path; `eslint app --format json`.
- Confidence: high
- Prior review: RAW_FINDINGS_2026-07 (line 61) asked for the dead blocks to be deleted. The `.mjs` half was done and the dead
  blocks remain, so that part is still open.
- Fix (S): delete the dead blocks and correct the comment. Consider promoting `no-unused-vars` to error now that it is clean.

### INF-12 [P3] QD's precache has no size guard, so a chunk over 2 MiB would silently leave the offline app broken
- Category: structure
- Location: `vite.config.mjs:47-53` (no `maximumFileSizeToCacheInBytes`); CD set it (`apps/complex-dynamics/vite.config.ts:33`).
- Claim: Workbox skips any file over 2 MiB and only logs it, and no build step checks that every `dist/assets/*.js` is in
  `sw.js`. The largest chunk today is 786 kB, so the risk is low but still unguarded.
- Evidence: config read; the build log says "precache 35 entries (3027.22 KiB)".
- Confidence: high
- Prior review: reported in RAW_FINDINGS_2026-07 (lines 195-205) and still open for QD.
- Fix (S): set the cap as CD does, and assert full coverage in `check-built-artifacts.mjs`.

### INF-13 [P3] The eager bundle carries the exact-symbolic core, and five workers each duplicate the solver graph
- Category: perf
- Location: `app/main.mjs:56-57`; `vite.config.mjs` (worker bundles).
- Claim (measured from a sourcemap build): the entry chunk is 786 kB (254 kB gzip): KaTeX 254 kB, `sym/sym-core.mjs` 124 kB,
  `sym-radical.mjs` 12 kB, and `ui/*` 158 kB. The symbolic core is eager only for the inverse tab's equations card
  (`qd-equations.mjs` and `qd-constraints.mjs` read `QD.Sym`). Lazy tabs really are lazy: algebra 301 kB, Schwarz 175 kB,
  Direct 78 kB, param-slice 33 kB, mathjs 636 kB on idle prefetch. Each worker is its own Rollup build (solver 124 kB,
  analysis 138 kB, param-slice 133 kB, Schwarz 141 kB, sym 160 kB), which is about 700 kB of mostly shared code, all
  precached (3,027 KiB in total).
- Evidence: `scratchpad/infra/attr.cjs` over `dist-sm/assets/index-*.js.map`.
- Confidence: high
- Prior review: CODEBASE_REVIEW_2026-07:730 recorded a 1,326 KB entry chunk, which has since been split. The sym-core
  placement is new.
- Fix (M): load the equations card (and `QD.Sym`) behind its first render. Fold the analysis modules into the solver
  entry behind a worker-side `import()`.

### INF-14 [P3] A preset change costs about 1.1 s of main-thread long tasks against a 7 ms worker solve
- Category: perf
- Location: the `perf/measure.mjs` "warm UI preset selection" interaction.
- Claim: `presetChangeToSettledPaintMs` has a median of 879 ms, with `longTaskMs` 1120 over 4 tasks, while
  `warmSolveMs` is 6.7 ms. JS hot spots in the CPU profile: KaTeX rendering about 145 ms and `history.replaceState` 118 ms.
  Most of the rest is "(program)", 746 ms of native layout, paint and raster.
- Evidence: measured, 3 runs. This is headless Chromium 141 with SwiftShader on a 4-core container, which inflates
  canvas and paint work; `drawPoles` showing 81 ms is almost certainly first-font resolution.
- Confidence: low (the environment dominates)
- Prior review: new
- Fix: re-measure on the target laptop (`--profile`). If KaTeX dominates there too, cache the rendered Riemann-map and
  equation HTML keyed by φ.

### INF-15 [P3] Tooling gaps: the a11y roster and the dev launch entry
- Category: test / tooling
- Location: `scripts/a11y-audit.mjs:103-108`; `.claude/launch.json:5-16`.
- Claim: the a11y roster audits QD only in its default state (one page, baseline of 1 color-contrast and 4
  nested-interactive), so the Schwarz, param-slice, Algebra and Direct surfaces are never audited, although `#vs` can open
  the first three (`ui-url-state.mjs:52`). `qd-esm` is `vite preview`, which serves whatever `dist/` last contained, not
  the source.
- Evidence: config read.
- Confidence: high
- Prior review: new
- Fix (S): add three roster entries with `tab` permalinks and a selector each must find. Add a `qd-dev` launch entry
  (`vite`, port 5199).

## Improvements
- **IMP-1 Interactive and batch solve lanes.** Value: removes the INF-2 corruption class structurally, and lets a
  multi-second c* estimate run while the user keeps editing. Cost: S. Sketch: a `batch` `createWorkerLane` on
  `solver-worker-entry.mjs`; the estimator, Try harder and Verify c* take it; solveAndRender keeps `primary` with
  `terminateOnSupersede: true` (INF-3).
- **IMP-2 Update handshake plus build ID.** Value: after a deploy, users get new code instead of half-old code, and bug
  reports can name the build. Cost: S. Sketch: INF-1 and INF-8 together. Show a "New version, reload" banner on
  `onNeedRefresh`, and write `__QD_BUILD__` into the sidebar and into PNG export metadata.
- **IMP-3 A deploy-update regression spec.** Value: the only way to see INF-1, since node and jsdom cannot. Cost: S. Sketch:
  port `scratchpad/infra/sw-probe.mjs` to a Playwright test run in the `browser` CI job.
- **IMP-4 A self-healing param-slice pool.** Value: long sweeps survive a worker crash. Cost: S (INF-5).
- **IMP-5 A lean entry graph.** Value: about 136 kB less eager JS, and about 250 kB less precache from worker de-duplication.
  Cost: M (INF-13).
- **IMP-6 (speculative) OffscreenCanvas for the CPU Schwarz field and the param-slice raster.** The worker would paint an
  `ImageBitmap` instead of transferring Int16 fields for a main-thread fill and paint. Value is modest because the GPU
  path is primary. Cost: M. WASM for the Newton inner loops is not justified without a profile on target hardware.

## Coverage: not reviewed or not run
- The QD Vitest browser suite (the schwarz slice's job) and the root gate (not permitted).
- Share-link backward compatibility for pre-`#vs` formats (the URL and state slice). I checked only that URL-sourced
  strings (`h`, `w0`, `q`, `tab`, `fig`, `view`) reach `.value`, `textContent`, whitelisted selectors or validated fields, and
  never `innerHTML`. `h` goes through `math.parse` (an AST walk; no `evaluate` on URL input) under a 2000-character cap.
  No `eval`/`new Function` and no KaTeX `trust: true` exist in `app/`. I did not audit all 132 `innerHTML` sinks, only
  those reachable from the URL, the h text, solver status and error messages.
- The correctness of the Schwarz and param-slice mathematics inside the workers (other slices).
- The perf measurement on real GPU hardware (INF-14).
- The mathjs 12.4.3 advisory status (not checked against a CVE database).
