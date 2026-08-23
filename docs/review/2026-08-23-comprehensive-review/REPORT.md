# Complex-Analysis-Suite — comprehensive re-review (2026-08-23)

**Date:** 2026-08-23 · **Branch:** `claude/comprehensive-codebase-review-8g26az` · **HEAD:** `300c775`
· **Requested by:** andrew@graven.com · **Posture:** report-only (no code changes)

**Method.** A full green/health baseline (`pnpm install → typecheck → lint → test → build`) plus **11
read-only reviewer agents** fanned out over the 8 apps + 10 `@cas/*` packages + all docs, each producing
a structured findings file in [`findings/`](findings/), plus an orchestrator hygiene sweep. Depth was
deep + domain-math (numerical methods re-derived, not just the engineering); consolidation and
performance were weighted heavily per the request. **This is a *re-review*:** a full suite-wide audit
landed 2026-08-17 (PR #283, in [`../2026-08-suite-review/`](../2026-08-suite-review/)) and most of its
~80 findings were fixed — so this pass targeted (1) the **unreviewed churn since Aug 17** (PRs #284–#296),
(2) the **coverage gaps** the prior review admitted skipping, and (3) genuinely new issues. Every claim
was hand-verified against source at HEAD; nothing was executed beyond the health suite.

---

## Executive summary

**The suite remains in genuinely good shape, and the risky recent work held up.** All CI gates are green
(383 test files / 3,197 tests). The two big Aug-22 perf rewrites — the CD WebGL render rewrite (#294) and
the QD live-solver rewrite (#292) — were the review's #1 target, and their **numeric cores were
independently re-derived and found correct** (QD's four S4 kernels bit-identical or FP-order-only; CD's
sqrt-free escape peephole and two-pass recolour byte-identical to the fused path for every covered mode).
The df64/BLA deep-zoom path and `@cas/dynamics`, both prior-review coverage gaps, were re-derived and are
**correct** (double-double transforms, glitch-free Zhuoran rebasing, external-ray Newton). The QD symbolic
core (`sym-core.mjs`, the other big coverage gap) is **exceptionally solid** — genuinely exact ℚ(i)
arithmetic, no π/2πi leak, honest labeling throughout. Hygiene is excellent (no `.only`/skipped tests, no
`@ts-nocheck`, `dist/` gitignored). **No CRITICAL or HIGH finding.**

Findings total ≈ **44** across all severities: **0 CRITICAL, 0 HIGH, 6 MEDIUM, ~23 LOW, ~15 NIT.** They
cluster into five themes. The single most important item is both a bug *and* the top consolidation win:
the `mapSpecToExpr` interchange→expr converter is triplicated across three apps and has already **diverged**
so that Complex Dynamics silently produces a wrong map where the plotter and Argument-Principle fail loudly.

### What to fix first (ranked)

| # | Item | Sev | Area | Type |
|---|------|-----|------|------|
| 1 | **`mapSpecToExpr` triplicated (CD+plotter+AP) and already diverged** — CD lacks the empty-denominator + pole-Laurent guards its siblings have ⇒ CD imports a NaN / silently-wrong map | MED | interchange/3 apps | bug + consolidation — [A10](findings/A10-ap-plotter.md) |
| 2 | **QD live-vs-authoritative race** — the live solver lane is never invalidated at drag-end, so a cheap `method:"live"` 96-sample / 160-pt result can persist over the authoritative settle | MED | quadrature-domains (#292 churn) | bug/race + perf — [A2](findings/A2-qd-solver-perf.md) |
| 3 | **CD `fieldAt` drops the periodicity bail-out `colorAt` has** — first appearance-change on an interior-heavy/high-iter view re-iterates every interior pixel to the full cap (≤20000, ×~13 df64): a multi-hundred-ms–second stall + GPU-watchdog risk | MED | complex-dynamics (#294 churn) | perf regression — [A1](findings/A1-cd-render-perf.md) |
| 4 | **Berlekamp–Zassenhaus recombination is uncapped exponential (2ʳ)** — reachable on the *main thread* via the factor probe (few-term high-degree like `x^40−2` slips the term-count guard) ⇒ frozen tab, no cancel | MED | quadrature-domains (algebra) | perf/robustness — [A3](findings/A3-qd-algebra-symcore.md) |
| 5 | **New GLSL `abs(E) op k` peephole has no in-package `@cas/expr` codegen test** — a keystone hot-loop optimization pinned only by the non-blocking browser corpus | MED | @cas/expr (#294 churn) | test-gap — [A6](findings/A6-core-pkgs.md) |
| 6 | **`constExp`/`constReal` duplicate const-folders** must stay in lockstep for JS↔GLSL fold-parity; the sanctioned hoist to `ast.ts` (per `nodeIsBool`) was never done | MED | @cas/expr | consolidation — [A6](findings/A6-core-pkgs.md) |
| 7 | **Honest-labeling seams** — `≈`-labeled results whose *value* can be silently wrong / self-contradictory (Ω→𝔻 hover; "machine precision" prose; AP B4 readout; core-entropy 2⁵³ overflow) | LOW×4 | RM, AP, CD | numerical/labeling — themes below |
| 8 | **CPU-oracle / default divergences** — perturbation CPU oracles hardcode escape >4; CPU σ library defaults ≠ GPU; z^a integer-parameter JS≠GLSL | LOW×3 | CD, @cas/expr | numerical parity — theme below |
| 9 | **Perf-consolidation & remaining perf LOWs** — sqrt-free escape not applied to correspondences; CD JuliaMetricsClient send-side coalescing; AP per-frame `cumulativeArg` recompute | LOW×3 | corr, CD, AP | perf |
| 10 | **Doc staleness residues** — README ADR cap "…0024"→0026; RM exterior-disk gallery (#288) undocumented + RM/AP have no README; faber corner-image comment fix incomplete (6 sites) | LOW | docs | stale-doc |

---

## Health baseline — ✅ all green

`pnpm install` (frozen lockfile) → `typecheck` → `lint` (eslint + dep-cruiser + per-pkg/app) → `test` →
`build` all exit 0. **383 test files, 3,197 tests passing** (~112s); census gate OK across 17 projects.
jsdom `getContext`/worker-unavailable lines in the log are expected test-env stubs, not failures. Logs in
[`health/`](health/). **Implication:** every finding below is *latent* (not caught by the current suite) —
which is exactly why the test-gap and domain-math findings carry weight.

---

## The five themes

### 1. Perf-rewrite regressions & gaps (the churn theme — highest value)

The two Aug-22 perf PRs are the newest, riskiest code. Their **numeric cores are correct** (see summary),
but the review found three seams around them:

- **[MEDIUM] CD `fieldAt` drops the periodicity early-out** (`shaderBuilder.ts:966-985` vs `colorAt`
  `:816-833`; build path `glPlot.ts:2031-2046`; cap `AUTO_ITER_MAX=20000`). `colorAt` bails interior
  points onto their attracting cycle after tens–hundreds of iterations; the new `fieldAt` field pre-pass
  has a bare loop, so the **first** appearance change on an interior-heavy view iterates every interior
  pixel to the full cap — a large first-recolour stall (and, at the extreme, a plausible GPU-watchdog
  context loss) where there was none, plus a latent parity edge (the two paths now only agree if the
  periodicity check never false-positives). **Fix:** mirror `periodInit`/`periodStep` into `fieldAt` so the
  loops are identical — restores the early-out *and* closes the parity edge by construction; then add an
  interior-heavy parity test case.
- **[MEDIUM] QD live-vs-authoritative race** (`ui-solve.mjs:140-282`, `:276-281` trailing `.finally`;
  `ui.mjs:484` `onPoleDragEnd`). The live lane (`_liveSolveToken`) and authoritative `solveAndRender`
  (`_solveAndRenderToken`) use separate tokens and neither invalidates the other; `onPoleDragEnd` never
  touches the live token, and O1's new `.finally` fires an *extra* live solve after a multi-frame drag. So
  a `method:"live"` result (96-sample identity verdict, 160-pt boundary vs the authoritative 500) can land
  after the settle. The "authoritative is the final writer" invariant the design comments assert holds
  only by *timing*, not construction; near a validity boundary the 96- and 500-sample checks can disagree,
  surfacing a less-certified verdict as final (a soft honest-labeling hit). **Fix:** at drag-end / top of
  `solveAndRender`, bump `_liveSolveToken` and clear `_liveDirty` (optionally `cancelLive()`); test with an
  artificially-slowed live lane asserting `state.current.primary.method !== 'live'` after settle.
- **[MEDIUM] GLSL peephole has no in-package test** (`@cas/expr/glsl.ts:103-119`). The `abs(E) op k ⟹
  cabs2(E) op k·k` lowering is mathematically sound and type-safe, but its contract (k≥0, emit `k·k`, mirror
  the reversed form) is pinned only by `@cas/gpu`/CD cross-package browser corpora — and `ci.yml`'s
  `browser` job is a non-blocker. **Fix:** a cheap `toContain` assertion in `@cas/expr` (`compileEscape(parse("abs(z)>2"))`
  emits `cabs2(` and `4.`; a *parameter* threshold does NOT fold; negative constant not squared). No source
  change.

Related lower-severity items on the same rewrites: two-pass recolour aborts temporal-AA accumulation and
reuses a stale-coloured pan collar (A1, LOW×2, both self-healing); `recolorParity.browser.test.ts` pins
only smooth/single/param — escape/histogram/decomposition/df64/dynamical/overlays are byte-identical by
inspection but untested (A1, LOW); the df64 periodicity check uses raw `dot()` instead of the sibling
`cabs2` (A1, NIT, ~1e-16, harmless); "allocation-free" is a doc overstatement — QD `branchTaylorAccumulate`
still allocates 8 typed arrays/call (A7, NIT).

### 2. Honest-labeling seams (guardrail — all LOW; no false `=` certification, but values can mislead)

Every item here is correctly `≈`-labeled, so the guardrail is *not* violated — but the number shown can be
silently wrong or self-contradictory:

- **[LOW] Ω→𝔻 hover discards the SC inverse's status** (riemann-map `main.ts:536-541`). #285 wired the exact
  SC inverse but keeps only `.w`, throwing away the `converged`/`residual` that `inverseWithStatus` was
  *added* to expose; a hover just outside Ω or a Newton stall shows a wrong preimage under an "exact inverse"
  card. **Fix:** propagate the status; prefix `f(z)` with `≈`/`⚠` when `!converged` or `|w|>1+ε`.
- **[LOW] "machine precision" prose vs `nGaussLegendre:12` solve** (riemann-map `main.ts:568,666`). The cards
  hard-code a machine-precision claim while the interactive solve runs at half the engine default; the `≈
  residual` stat is honest, the prose is not (a crowded hand-dragged polygon can report `converged:true`
  below machine precision). **Fix:** "≈ machine precision (subject to quadrature order)".
- **[LOW] AP B4 analytic readout lacks the reliability gate** the verdict panel uses (argument-principle
  `main.ts:1226-1232` vs `:1320-1322`). When γ grazes a root the B4 line asserts `round(val) = zeros−poles`
  and can contradict the panel's own `⚠ unreliable` one row up. **Fix:** gate the "→ N" tail on the same
  `reliable && windFinite`.
- **[LOW] Core-entropy `compare()` overflows 2⁵³** (complex-dynamics `combinatorics/angles.ts:56-58`,
  reached from the uncapped spider-angle box `main.ts:5689`). The exact-integer cross product silently
  rounds for denominators ≳10⁸ (e.g. `1/(2²⁷−1)`), so a plausible-but-wrong entropy `h`/`λ` is printed.
  **Fix:** cap/guard the denominator in `coreEntropy`, or make `compare` BigInt-exact.

### 3. Consolidation (into shared `@cas/*` — a weighted theme)

**The three consolidations the prior review landed are bit-clean** (verified: `pointInPolygon` →
`@cas/core/geometry.ts`, `rootsMonic` → `@cas/core`, corner-cluster → `@cas/conformal/cornerClustering.ts`
— all consumers delegate, no orphans, divergent policies correctly kept caller-side). New/remaining cases,
ADR-0007-labeled:

- **[MEDIUM · real ADR-0007] `mapSpecToExpr`/`envelopeToMapSpec` triplicated and diverged** (CD/plotter/AP
  `interchange/importMap.ts`). The `MapSpec`/`Envelope` → `@cas/expr`-string converter (6 functions) is
  copied in three apps, each header admitting the port. The plotter and AP copies added an empty-denominator
  guard and a pole-bearing-Laurent refusal; **CD's ancestor has neither**, so the same payload yields a
  NaN/silently-wrong map in CD and a loud failure in the other two. No ADR governs it (ADR-0025 defers only
  the winding/finder primitive). **This is both the top correctness fix (item #1) and the top DRY win.**
  **Fix:** extract to `@cas/interchange` (natural owner of `MapSpec`/`Envelope`) as `mapSpecToExpr(spec):
  string`, unifying the two guards; land with all three apps' import tests + a cross-consumer golden so CD
  picks up the guards.
- **[MEDIUM · in-package] `constExp`/`constReal` duplicate const-folders** (`@cas/expr` `derivative.ts:99`
  ↔ `glsl.ts:178`). Byte-identical bodies that decide "what is a compile-time real constant, and its value"
  — the gate for the exact-`intPow` GLSL fold *and* the derivative power-rule fold. Adding a future language
  constant to one silently desyncs JS↔GLSL fold decisions. The `nodeIsBool→ast.ts` precedent exists; the
  recommended hoist was not done. **Fix:** hoist one `constReal(node)` into `ast.ts`; import in both.
- **Speculative (single-consumer, NOT yet ADR-0007-forced) — labeled as such:** Faber's `mathText.ts`
  inline-math→DOM renderer (a 2nd consumer appears if AP's hand-written `<sub>` innerHTML is migrated —
  also an XSS-safety upgrade); a `toCCW`/`signedArea2` helper (faber's in-panel editor now wants what
  `polygonEditor.ts` has — small ADR-0007-clean lift, ties to the A4 drag-orientation LOW below); CD
  `bla.ts`'s private `binom` duplicates the exported `binomial` in `perturbationPoly.ts` (single-app);
  `makePoly.pow` naive-multiply vs sibling `linearPower`'s square-and-multiply (perf, no 2nd consumer). The
  prior review's roadmap #4 (trivial `cabs/cdiv/cmul/finite`) and #5 (`formatComplex`) remain open and
  remain correctly speculative.
- **Deferrals correctly respected & re-confirmed:** ADR-0008 (QD `sym-core` non-merge — no new `@cas/exact`
  duplication crept in), ADR-0018 (lstsq twins), ADR-0025 (plotter↔AP winding/finder defer — accumulators
  still hand-synced, no drift), ADR-0026 (QD `schwarz-common` — no LQD/PQD 2nd consumer appeared),
  ADR-0016 (GLSL substrate stays consolidated). The exterior SC engine reuses the interior solver's driver
  + parametrization — well-factored, not a copy.

### 4. CPU/GPU & default divergences (recurring latent-parity pattern)

A recurring class where two code paths meant to agree carry different constants/branches — all latent today
but each a future-refactor trap:

- **[LOW] Perturbation CPU oracles hardcode escape `>4`** (`perturbationPoly.ts:27,152,328`) while the
  shader uses `uPerturbEscape2`; the sibling `traverseBLA` was already fixed (cd-render-10) but the fix
  wasn't carried over — so no test can cover the shader's `escapeR≠4` single-step path. **Fix:** add an
  `escape2` option defaulting to 4 (mirror the `traverseBLA` fix) + a test.
- **[LOW] CPU σ library defaults ≠ GPU** (complex-dynamics `schwarzView.ts` `1e6`/`64` vs `schwarzGL.ts`
  `1e4`/`48`) — two functions documented to agree pixel-for-pixel. Masked because the app passes a shared
  opts object; a future caller/test using the defaults diverges. **Fix:** one shared `SCHWARZ_ESCAPE_DEFAULTS`.
- **[LOW] `z^a` integer-parameter JS≠GLSL** (`@cas/expr` `complexJs.ts:73` runtime `intPow` vs `glsl.ts`
  compile-time `constReal` only) — a bare parameter bound to integer 2 runs exact `intPow` on CPU and
  principal-branch `cpow` on GPU. Prior LOW, still open.
- Also in this family: the peephole's fp32-overflow cliff for `k·k>3.4e38` (a new failure mode the `length()`
  form didn't have; unreachable in practice — needs an escape radius ≳1.8e19); `arccosh` reflected branch on
  `(−∞,−1]` vs its "principal branch" docstring; `Frac.toNumber` returning Inf/0 for representable ratios in
  the [2¹⁰⁰⁰,2¹⁰²⁴) window (`KEEP_BITS=1000`). All LOW, all prior-review items re-confirmed open.

### 5. Robustness / hostile-input / remaining perf & docs

- **[MEDIUM] Berlekamp–Zassenhaus uncapped recombination** — see item #4 in the top table. The one place
  `sym-core.mjs` breaks its otherwise-universal cap-and-throw discipline; `_recombine`/`_combinations`
  (`:2194,:2200`) do full 2ʳ subset enumeration with no guard, reachable on the main thread because the
  probe guards only term-count and `doFactor` runs sync. **Fix:** cap `_recombine` (throw the file's own
  "use CAS export" error), add a degree cap to the univariate path, and/or route `doFactor` through the
  existing async worker.
- **Perf LOWs:** correspondences CPU escape loops never got the suite-wide sqrt-free treatment
  (`tricorn.ts:35` etc. — LOW because unpublished); CD `JuliaMetricsClient` has response-side stale-drop but
  no send-side coalescing (the QD-O1 pattern; mitigated by a 350ms debounce); AP per-frame `draw()`
  recomputes `cumulativeArg` 4–6× over the frame-constant contour (negligible at res 300, ~30k redundant
  atan2 + GC at the 5000 cap); RM every drag frame runs a full lightning re-fit + per-cell recolour, and
  builds filled cells + per-cell derivatives even in line-style / numeric-source (dead work). All
  low-risk mechanical fixes.
- **Robustness LOWs:** faber in-panel drag skips the `toCCW` normalization the sidebar applies (a
  reflex-flipping drag yields a spurious `⚠` the sidebar auto-repairs) and the residual guard can silently
  no-op edits on degraded fits with no user cue; RM has no explicit simple-polygon check (a bowtie/collinear
  drag can render a plausible wrong map without a distinct "not a simple polygon" signal); plotter
  `decodeState` leaves `span`/`colormap`/etc. unclamped (garbage figure, not a DoS).
- **Doc staleness (all LOW/NIT):** `README.md:159` ADR cap "…0024" → 0026; RM exterior-disk gallery (#288)
  undocumented everywhere + RM and AP are the only apps without a README; `docs/refactor/STATE.md` only
  partially current ("Always current" header + stale "▶ NEXT" while ~13 PRs go unmentioned); the faber
  corner-image comment fix is incomplete — 6 sites still say `wₖ = φ(zₖ)` incl. the package-internal
  `weighted.ts:50` (latent-corruption landmine); `sym-worker.mjs` doc lists 3 ops (14 now); exterior-SC
  `φ(z)~C·z` comment should be `−C·z` (code correct); corr README calls `deltoid.ts` "the σ engine" (moved
  to `@cas/schwarz`); one broken link `LOG.md:1751`; `ALGEBRA_MODULE.md:221` import path drift. The
  previously-unswept algebra docs (`docs/algebra-review/*`, `ALGEBRA_*`) turned out **well-maintained**.
- **Hygiene (NIT):** 3 leftover perf-timing `console.log`s in `param-slice-render.mjs`; otherwise
  exceptionally clean (no `.only`/skip, no `@ts-nocheck`, `dist/` gitignored, `eslint-disable`s justified).

---

## Consolidation roadmap (prioritized)

1. **`mapSpecToExpr` → `@cas/interchange`** (MEDIUM, real ADR-0007, 3 consumers, actively diverging) — the
   one that also fixes a correctness bug. Do first.
2. **`constExp`/`constReal` → `ast.ts`** (MEDIUM, in-package, JS↔GLSL fold-parity) — follows the `nodeIsBool`
   precedent exactly.
3. **`toCCW`/`signedArea2` → shared helper** (LOW, a 2nd consumer now exists: faber in-panel editor) — small,
   also fixes the faber drag-orientation robustness LOW.
4. Opportunistic-only (speculative, no forced trigger): `mathText` inline-math renderer (on a 2nd consumer),
   `bla.ts` `binom`, `makePoly.pow`, and the prior review's still-open #4/#5.

## Performance roadmap (prioritized)

1. **CD `fieldAt` periodicity early-out** (MEDIUM) — removes a real first-recolour stall + watchdog risk.
2. **QD drag-end live-lane teardown** (MEDIUM) — removes a guaranteed post-drag redundant live solve (and
   fixes the race).
3. **Berlekamp–Zassenhaus cap / worker-offload** (MEDIUM) — removes a main-thread freeze.
4. LOW perf: correspondences sqrt-free escape; AP single `cumulativeArg` per draw; RM defer per-cell recolour
   to drag-release + skip dead line-style/numeric-source cell builds; CD JuliaMetricsClient send-side gate.
   Optional micro: hoist QD `branchTaylorAccumulate` scratch buffers to module scope.

## Coverage & honest gaps

**Examined this pass:** all churned files (#284–#296) in depth; the CD render rewrite + df64/BLA + overlays
+ `@cas/dynamics`; the QD live-solver + numeric-core rewrites; QD `sym-core`/algebra kernels; Faber
app+package; Riemann-map SC studio + `@cas/conformal`; the four keystone packages; correspondences +
`@cas/schwarz`/`@cas/gpu`/`@cas/export`; AP + plotter; all docs incl. the previously-unswept algebra docs +
ADR bodies for supersession integrity; a hygiene sweep. **Not covered (per agents' Coverage sections):** the
QD per-family solver kernels not touched by S4 (`solver-pqd*/lqd*/uqd-lqd*/uqd-pqd*`, seeds, cmax,
continuation, faber); the deep interiors of `factorBivariate`/`factorMultivariate` (Gao nullspace / Hensel
lift — confirmed capped + verified-division-gated, not line-audited); many CD Julia/σ overlay modules and
`matingEngine.ts` internals; the QD algebra store/UI DOM glue (~7k lines) and `sym-radical.mjs`; the plotter
`render3d/*` + UI glue; DECISIONS ADR *bodies* end-to-end (headers/TOC/status verified consistent). Nothing
was executed beyond the health suite (read-only review); every numerical claim names a concrete confirming
test.

---

## Appendix — per-agent findings index

| File | Area | C/H/M/L/N |
|------|------|-----------|
| [A0-orchestrator-hygiene](findings/A0-orchestrator-hygiene.md) | suite hygiene sweep | 0/0/0/0/2 |
| [A1-cd-render-perf](findings/A1-cd-render-perf.md) | CD render rewrite (#294) | 0/0/1/3/2 |
| [A2-qd-solver-perf](findings/A2-qd-solver-perf.md) | QD live-solver rewrite (#292) | 0/0/1/0/2 |
| [A3-qd-algebra-symcore](findings/A3-qd-algebra-symcore.md) | QD algebra + sym-core (gap) | 0/0/1/2/0 |
| [A4-faber](findings/A4-faber.md) | Faber app + `@cas/faber` | 0/0/0/4/1 |
| [A5-riemann-sc](findings/A5-riemann-sc.md) | Riemann-map + `@cas/conformal` | 0/0/0/4/4 |
| [A6-core-pkgs](findings/A6-core-pkgs.md) | core/exact/expr/interchange | 0/0/2/5/2 |
| [A7-consolidation-perf](findings/A7-consolidation-perf.md) | cross-cutting consol + perf | 0/0/0/3/2 |
| [A8-cd-internals](findings/A8-cd-internals.md) | CD df64/BLA + dynamics (gap) | 0/0/0/3/4 |
| [A9-corr-schwarz-gpu](findings/A9-corr-schwarz-gpu.md) | corr + schwarz/gpu/export | 0/0/0/2/2 |
| [A10-ap-plotter](findings/A10-ap-plotter.md) | argument-principle + plotter | 0/0/1/2/2 |
| [A11-docs](findings/A11-docs.md) | all documentation | 0/0/0/3/2 |

**Positive results worth recording:** no π/2πi convention leak anywhere; DK NaN-stickiness + all prior
consolidations + interchange nested-payload validation confirmed correctly landed; the σ GPU 512→4096 cap
fix intact; df64/BLA/Zhuoran-rebasing/external-ray math re-derived correct; QD symbolic core exact and
honestly labeled; `@cas/schwarz` GPU shader uses the *correct* cap pattern (throws, never silently clamps);
PNG `tEXt` injection-safe; #296 faber wrong-vertex fix correct & complete; RM editor not subject to the
#296 bug class.
