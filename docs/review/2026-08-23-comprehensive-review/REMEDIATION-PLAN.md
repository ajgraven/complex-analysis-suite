# Remediation plan — 2026-08-23 comprehensive review

Sequenced plan to address **every** finding in [`REPORT.md`](REPORT.md). Organized into 8 work
packages (WPs), each a self-contained, independently-reviewable PR that leaves the suite green
(guardrail: *working software at every step*; *test-guard every refactor*). Ordered by value ÷ risk
and by dependency. Effort is rough (S = <½ day, M = ½–1 day, L = 1–2 days).

**Global rules honored throughout:** small reviewable commits; a module never moves without its tests
green before *and* after; shared-package changes ship with a golden corpus; one dependency direction
(packages import downward; no app imports another app; no cycles); honest labeling; every behavior fix
lands with the regression test that pins it (negative-control verified where practical).

**Suggested order:** WP1 → WP2 (quick, low-risk, unblock nothing) can go first or in parallel; then the
correctness/consolidation WPs 3–5; then the labeling/parity WPs 6–7; finish with WP8 (perf + robustness
+ NIT cleanup). Pause for review at each WP gate.

---

## WP1 — `@cas/expr` GLSL peephole: test + hardening  ·  effort S  ·  closes MED #5

**Why first:** cheapest MEDIUM to close; pure additive change in the package that owns the code; protects
a keystone hot-loop optimization that today is pinned only by the non-blocking browser job.

**Changes**
- `packages/expr/test/glsl*.test.ts` (new/extended): assert `compileEscape(parse("abs(z) > 2"))` emits
  `cabs2(` and the literal `4.` (and NOT `cabs(`/`length`); the mirror `2 > abs(z)`; that a **parameter**
  threshold `abs(z) > k` does **not** fold (stays `cre1(...)`); and that a negative constant is not squared
  into a flipped test. *(MED #5 — test-gap; A6.)*
- `packages/expr/src/glsl.ts` (`emitAbsSquaredCompare`, ~L107-119): guard the fold on `k*k` within float32
  range (`Number.isFinite(k*k) && k*k <= 3.4e38`), else fall back to the `cabsf`/`length` form. Add a test
  `compileEscape(parse("abs(z) > 2e19"))` does not emit an out-of-range literal. *(LOW — fp32 overflow cliff;
  A6/A9.)*
- `packages/expr/src/glsl.ts` comment + `docs/perf/cd-render-review.md` P1-c: widen the wording — the peephole
  fires for **every** `abs(E) op const` boolean in `compileF`/`compileEscape` (so the plotter inherits both
  the speedup and the ≤1-ulp boundary shift), not just CD's escape predicate. *(NIT — A6/A7.)*

**Guard/verify:** `pnpm -C packages/expr test` + full `pnpm test`. Fix-safety: test additions are safe-now;
the range guard is behavior-preserving for all real escape radii (≤~1e6).

---

## WP2 — Documentation & comment currency (safe-now batch)  ·  effort S  ·  doc/comment-only

**Why:** all safe-now, no behavior change; clears the stale-doc backlog + the one genuine *landmine*
(the faber corner-image comment). Ship as one comment/doc-only PR (gates re-run green trivially).

**Changes (all doc/comment)**
- `README.md:159` — ADR range "0001…0024" → "0001…0026". *(A11)*
- **Faber corner-image comment — finish the partial fix (6 sites):** `packages/faber/src/weighted.ts:50`,
  `apps/faber-transform/src/{polygon.ts:72,81, presets.ts:82, faber.ts:201, main.ts:459}` — replace every
  `wₖ = φ(zₖ) on |w|=1` with the correct *z-plane prevertices* `wₖ = 1/uₖ` phrasing already in
  `weighted.ts:20`. Prevents a maintainer "fix" that would silently corrupt every `Q_{n,m}`. *(LOW — A4)*
- `apps/quadrature-domains/app/algebra/sym-worker.mjs:2-3,13` — op list "3 ops" → the current 14 (or point
  at `runJob`). *(LOW — A3)*
- `packages/conformal/src/exteriorSchwarzChristoffel.ts:11,91` — `φ(z) ~ C·z` → `~ −C·z` (⇒ capacity =|C|);
  code is correct. *(LOW — A5)*
- `apps/correspondences/README.md:93` — rewrite the `deltoid.ts` row: it is now the deltoid instance +
  boundary sampler + `@cas/schwarz` re-exports; the σ engine + round-trip test live in `@cas/schwarz`.
  *(LOW — A9)*
- Seed **`apps/riemann-map/README.md`** and note the exterior-disk preset gallery + interactive image pane
  (#288); add a one-line Status mention in `CLAUDE.md`. Optionally seed `apps/argument-principle/README.md`
  (the other README-less app). *(LOW — A11)*
- `docs/refactor/STATE.md:3,92` — drop the "▶ NEXT — σ hand-off" marker and either soften "Always current"
  or add a "⛔ refactor engagement complete → see CLAUDE.md Status" banner (mirror
  `docs/algebra-review/STATE.md:3`). *(LOW — A11)*
- `docs/refactor/LOG.md:1751` — fix broken link `design/…` → `../design/SIGMA-HANDOFF.md`. *(NIT — A11)*
- `docs/ALGEBRA_MODULE.md:221` — `./solver.mjs` → `../solvers/solver.mjs`. *(NIT — A11)*
- `apps/complex-dynamics/src/interchange/exportMap.ts:70-71` — provenance note: bₖ **exact**, only the
  truncated-tail reconstruction is `≈`. *(NIT — A8)*
- `apps/quadrature-domains/app/param-slice/param-slice-render.mjs:260,295,340` — gate the 3 perf-timing
  `console.log`s behind a debug flag or remove. *(NIT — A0)*

**Guard/verify:** `pnpm lint` + `pnpm format:check` + full `pnpm test` (all comment/doc — trivially green).

---

## WP3 — Extract `mapSpecToExpr` → `@cas/interchange` (fix CD divergence)  ·  effort L  ·  closes MED #1

**Why:** the single highest-value item — a live correctness liability *and* the top ADR-0007 consolidation.
CD's copy silently imports a NaN / wrong map (all-zero denominator, pole-bearing Laurent) where plotter/AP
fail loudly. Three drifting copies of one bridge.

**Decision (record as a short ADR):** home = **`@cas/interchange`**. It already defines `MapSpec`/`Envelope`
and all three consumers already depend on it; interchange↔expr are currently independent, so the clean
option is for interchange to emit **`@cas/expr`-grammar text** (a plain `string` in a documented grammar —
no new package import, preserving the acyclic graph). Alternative (`@cas/expr` `fromMapSpec`, importing the
`MapSpec` type) would point expr → interchange, the wrong direction for a serialization→executable layering.
ADR should state the chosen coupling and that the two guards are now unified.

**Changes**
- New `packages/interchange/src/mapSpecToExpr.ts` exporting `coeffExpr`, `polyExpr`, `rationalExpr`,
  `laurentExpr`, `mapSpecToExpr(spec): string`, `envelopeToMapSpec(env)` — the **union** of the current
  copies' behavior, i.e. keeping the plotter/AP guards CD lacks: throw on empty/all-zero denominator (0/0)
  and on `m.branches?.length > 0` in the laurent case (pole-bearing QD). Export from `index.ts`.
- New `packages/interchange/test/mapSpecToExpr.test.ts` — golden pinning: (a) a normal poly/rational/laurent
  MapSpec → expected expr string; (b) all-zero denominator → throws (not `(…)/(0)`); (c) pole-bearing
  Laurent (`branches.length>0`) → throws. This is the cross-consumer golden that gives CD the guards.
- Rewire `apps/{complex-dynamics,complex-function-plotter,argument-principle}/src/interchange/importMap.ts`
  to import from `@cas/interchange` and delete the six local functions; keep each app's *outer* import glue
  (error surfacing/UI) — only the converter moves. Confirm each app's existing import tests stay green.
- Leave `apps/riemann-map/src/interchange/importMap.ts` untouched (a *different* converter — CD→RM Böttcher
  `LaurentMap`).
- ADR in `docs/DECISIONS.md` (next free number, update TOC + count) recording the extraction + home + guard
  unification.

**Guard/verify:** each app's `importMap`/interchange tests green before & after; new interchange golden;
`pnpm dep:check` (no cycle introduced); full `pnpm test` + `pnpm build`. Fix-safety: needs-review (behavior
change for CD — it now *rejects* the degenerate/pole payloads it used to mis-import; that is the intended
fix, so include a CD test asserting the new loud failure).

---

## WP4 — Hoist `constExp`/`constReal` → `ast.ts`  ·  effort S  ·  closes MED #6

**Why:** byte-identical duplicated const-folders that must stay in lockstep for JS↔GLSL fold-parity; the
`nodeIsBool→ast.ts` precedent already exists in the same file. In-package, no ADR needed.

**Changes**
- `packages/expr/src/ast.ts` — add one `constReal(node): number | null` beside `nodeIsBool` (the shared body:
  `num`/`const` e·pi·tau·phi·γ map, `neg`, `arith`, `default→null`).
- `packages/expr/src/derivative.ts:99-140` and `glsl.ts:178-220` — delete both local copies; import the shared
  one. Remove the now-stale "Mirrors glsl.ts's constReal" comment.
- Test: `packages/expr/test` — a case that a newly-added language constant folds identically in both the
  GLSL `intPow` gate and the derivative power-rule gate (guards against future desync).

**Guard/verify:** `pnpm -C packages/expr test` (existing derivative + glsl goldens must stay byte-identical) +
full `pnpm test`. Fix-safety: needs-review (behavior-neutral refactor; pinned by existing goldens).

---

## WP5 — Perf-rewrite fixes (CD `fieldAt`, QD live-lane, QD factoring)  ·  effort M–L  ·  closes MED #2, #3, #4

Three independent commits; can be one PR or three. Each is a behavior fix + its regression test.

**5a · CD `fieldAt` periodicity early-out (MED #3, A1)**
- `apps/complex-dynamics/src/render/shaderBuilder.ts` — mirror `periodInit`/`periodStep` (from `colorAt`
  `:641,:644,:816-833`) into `fieldAt` (`:966-985`) so the two loops are identical: restores the interior
  early-out (kills the first-recolour stall / watchdog risk) *and* closes the parity edge by construction.
- Test: extend `apps/complex-dynamics/test/recolorParity.browser.test.ts` with an interior-heavy view (inside
  the main cardioid / large Julia interior at a high iteration cap) to pin field↔fused parity there.
- Fix-safety: needs-review (shader change; the parity test is the guard). Note the real GL compile check runs
  in CI's browser job (headless-shell absent locally).

**5b · QD live-vs-authoritative race (MED #2, A2)**
- `apps/quadrature-domains/app/ui/ui.mjs` (`onPoleDragEnd`) and/or `app/ui/ui-solve.mjs` (top of
  `solveAndRender`): bump `_liveSolveToken` and set `_liveDirty = false` (optionally `PSW.cancelLive()`) so
  the authoritative solve is the guaranteed last writer.
- Test: drive a drag whose live lane is artificially slowed so a live solve is in flight at `change`; assert
  after both settle that `state.current.primary.method !== 'live'` and the drawn boundary length is
  `state.samples`-class, not `LIVE_DISPLAY_SAMPLES` (160). Negative-control against the current code.
- Fix-safety: needs-review (concurrency; the test pins the invariant).

**5c · Berlekamp–Zassenhaus uncapped recombination (MED #4, A3)**
- `apps/quadrature-domains/app/sym/sym-core.mjs` — add a guard/cap to `_recombine` (`:2200`) that throws the
  file's own "use CAS export" bounded-guard error past a trial cap; add a **degree** cap to the univariate
  `_qiFactor`/`_factorOverQ` path mirroring the bivariate/multivariate branches.
- `apps/quadrature-domains/app/algebra/algebra-ui.mjs` — make the render-path `_factorInfo` guard (`:2602`)
  consider **degree**, not just term count; and/or route `doFactor` (`:2398`) through the existing
  `factorNodeAsync` worker path (setBusy + Cancel), as `applyFactorAsync` already does.
- Test: `QD.Sym.factor("x^40 - 2")` (or `runJob('factor', …)`) returns a capped throw promptly instead of
  hanging / spiking memory; a normal small factor still succeeds.
- Fix-safety: needs-review (adds a cap where none existed; test pins prompt-return).

**Guard/verify (all 5x):** `pnpm test` + `pnpm build`; QD node-suite byte-identical for well-conditioned solves.

---

## WP6 — Honest-labeling seams  ·  effort M  ·  LOW (credibility of a math tool)

All correctly `≈`-labeled today, but the *value* can be wrong/self-contradictory. Group by app.

- **RM (A5):** `apps/riemann-map/src/main.ts` — (a) `domainMap.eval` (`:536-541`) return the SC inverse's
  `converged`/`residual` (or a NaN sentinel), and prefix the hover `f(z)` with `≈`/`⚠` when `!converged` or
  `|w|>1+ε`; (b) soften both method-card descs (`:568,:666`) "machine precision" → "≈ machine precision
  (subject to quadrature order)"; (c) add a cheap simple-polygon test (reuse
  `analysis/univalence.ts polylineSelfIntersects`) and a `⚠ non-simple polygon` state for bowtie/collinear
  drags; extend `test/domains.test.ts` with a bowtie + collinear triple. Also fix the crash-guard test
  comment (`test/domains.test.ts:102-103`) to name the zero-length-side mechanism.
- **AP (A10):** `apps/argument-principle/src/main.ts` — gate the B4 "→ round(val) = zeros−poles" tail
  (`:1226-1232`) on the same `reliable && windFinite` the verdict panel uses (`:1320-1322`); fall back to the
  raw `val` + "nudge γ". Optionally add a max-per-edge `|Δarg|` sentinel to `windingReliable` (`winding.ts`)
  so a coarse-`res` fast-spinning image is flagged. Test: γ tangent to a root ⇒ B4 tail suppresses
  `round(val)`.
- **CD (A8):** `apps/complex-dynamics/src/combinatorics/angles.ts` (`compare`, `:56-58`) + entry
  `coreEntropy.ts` — reject/cap denominators above a safe bound (e.g. `q > 2**26 → null`) or make `compare`
  BigInt-exact. Test: `coreEntropy(1, 2**27-1)` returns null or matches a BigInt reference; `compare(angle(1,
  2**27-1), angle(2, 2**27-1))` is correct.

**Guard/verify:** app test suites + full `pnpm test`. Fix-safety: needs-review (label/gating + a guard).

---

## WP7 — CPU/GPU & default divergences (latent-parity)  ·  effort S–M  ·  LOW

- **Perturbation CPU oracles (A8):** `apps/complex-dynamics/src/render/perturbationPoly.ts:27,152,328` — give
  `perturbMultibrot`/`perturbPoly` an `escape2` option defaulting to 4 (mirror the `traverseBLA` cd-render-10
  fix); test at `escape2 = 1e8` against a naive per-pixel loop. *(the pixel escape test only — leave the
  reference-orbit `BAILOUT2=4` truncation, which is correct.)*
- **CPU σ defaults (A8):** one shared `SCHWARZ_ESCAPE_DEFAULTS` read by both `schwarzView.ts` and
  `schwarzGL.ts` (currently `1e6`/`64` vs `1e4`/`48`); the app already passes matching state defaults.
- **`z^a` integer-parameter parity (A6):** document the residual JS(`intPow`)↔GLSL(`cpow`) gap by
  `constReal`, and/or have hosts feed integer-valued parameters as folded literals. *(doc + optional host
  change.)*
- **`arccosh` branch (A6):** switch to `log(z + √(z−1)·√(z+1))` in both JS (`complexJs.ts:128-129`) and the
  GLSL twin (keeps them agreeing) so the principal branch matches the docstring; or soften the docstring.
  Test: `arccosh([-2,0]) ≈ 1.31696 + πi`.
- **`Frac.toNumber` window (A6):** `packages/exact/src/gaussian.ts:98` — `KEEP_BITS = 1023` (or only report
  Inf/0 when the bit-gap ≥ 1024) so representable ratios in [2¹⁰⁰⁰,2¹⁰²⁴) aren't lost. Test the boundary.

**Guard/verify:** package + app tests. Fix-safety: needs-review (each pinned by a new test).

---

## WP8 — Perf LOWs, robustness LOWs, NIT cleanup  ·  effort M  ·  LOW/NIT

Mechanical, low-risk; batch as one "polish" PR or fold each into the nearest WP above.

**Perf (A5/A7/A10):**
- AP: compute `const turns = cumulativeArg(wPts, about)` once per `draw()` and thread it through the
  strip-chart/wedge/readout/anim; add `windingTurnsFrom(cArr)` / `partialWindingTurnsFrom(cArr, upto)` to
  `winding.ts`. *(removes 4–6× redundant O(n) atan2 + GC per frame at high res.)*
- RM: during `scDragging`, defer the per-cell `activeDeriv` recolour to release and/or downsample the grid;
  skip the filled-cell build in line style and the `minBulk`/`maxMag` loop when `diskSourceIsNumeric()`;
  hoist one `getBoundingClientRect()` per image-pane hover event.
- Correspondences: hoist `escapeR*escapeR` and compare squared magnitude in `tricorn.ts:35`,
  `family.ts escapeToInfinity`, `orbitTree.ts:49` (exact; pin the escape-count corpus before/after).
- CD: add a send-side busy-gate to `JuliaMetricsClient` (stash latest req while a compute is in flight),
  mirroring QD's `_pendingLiveArgs`.
- QD (optional micro): hoist `branchTaylorAccumulate`'s 6 scratch `Float64Array`s to module scope; soften
  the "allocation-free" comment to "per-term-allocation-free".

**Robustness (A4/A5/A10):**
- Faber in-panel drag: run `next` through `toCCW` before commit (`main.ts:772-774`) — or extract a shared
  `toCCW`/`signedArea2` helper (2nd consumer now exists) and have the exterior solver orient-check its input;
  surface a status when a drag is refused (`handleEdit.ts` residual guard) instead of a silent no-op; fold
  `r.map.c > 0` into the `finite` predicate (`main.ts:467`); raise the monomial slider `max` to
  `String(MAX_DEGREE)` (`main.ts:318`).
- Plotter: clamp `decodeState` fields (`viewState.ts:153-162`) — `span` to `[1e-9,1e6]`, `colormap`/`sectors`
  to valid discrete ranges (match the sibling `cleanV3d` discipline).
- Interchange: validate `View.c?` (`if present, isComplex`), `QuadratureDomain.bounded` (boolean), `weight?`
  (enum) in `validate.ts` (top-level + nested `sourceDomain`); test a `view` with `c:{re:"x"}` throws.

**NIT (A1/A8/A9):**
- CD: `dot(pd,pd)` → `cabs2(pd)` in the df64 periodicity check (`shaderBuilder.ts:644`); rename
  `lastConnectivityRigorous`/`rigorousConnectivity` → `…FromCriticalOrbits`; `bla.ts` import `binomial` from
  `perturbationPoly.ts` and drop the private `binom`; add "allocation-free hot-loop" notes at the
  perturbation/rays complex-op sites to deter a regressing cleanup.
- Correspondences: drop `DEFAULT_DENSITY.maxDepth` to ~9 or delete it; unify the maxIter-48-vs-64 default.
- `@cas/core`: (speculative) `makePoly.pow` → square-and-multiply if a large-`n` consumer ever appears
  (guard with a golden) — leave until then.

**Guard/verify:** full `pnpm test` + `pnpm build`; each perf change pinned by a before/after golden where a
value could shift.

---

## Cross-cutting notes

- **ADRs to write:** one for WP3 (mapSpecToExpr extraction + home + guard unification). WP4/WP7/WP8 are
  in-package or behavior-preserving and need none. If the faber `toCCW` helper is extracted (WP8), a one-line
  ADR-0007 note suffices.
- **Testing philosophy:** every `needs-review` item above lands with a regression test that fails against
  current code and passes after (negative-control), per the repo's test-guard guardrail. The browser-only
  parity tests (5a) run in CI's browser job.
- **What is explicitly *not* in scope** (deferrals correctly respected): merging QD `sym-core`/`schwarz-common`
  (ADR-0008/0026), the plotter↔AP winding/finder (ADR-0025), the lstsq twins (ADR-0018). Don't touch these.
- **Sequencing for reviewability:** WP1+WP2 are safe-now and can merge immediately. WP3 is the one large diff
  — keep it isolated. WP5's three fixes are independent and can land separately if one needs iteration.
