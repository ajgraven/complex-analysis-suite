# Agent 10 "CONSOL" — cross-cutting consolidation / duplication review

Scope: the whole repo, hunting code that duplicates or near-duplicates logic across `apps/*` and
`packages/*` and could move into a shared `@cas/*` package (ADR-0007 second-consumer rule). I read the
committed Batch-1 findings (01/02/03/04/05/09) for leads, then ran an independent cross-cutting grep hunt
over the candidate categories in the brief (complex-arithmetic helpers, color/domain-coloring, WebGL/GLSL
boilerplate, root-finding / quadrature / least-squares / polynomial ops, polygon geometry, share-link
codecs, number/label formatting). Each candidate is classified **(A) real ADR-0007** (a second consumer
already exists — actionable now), **(B) speculative** (single-consumer / low-payoff — *not yet justified
under ADR-0007*), or **(C) intentional non-merge / sanctioned deferral** (respect; do not merge). Every
extraction below is `Fix-safety: needs-review` — none are auto-applyable. **READ-ONLY**; no code run.

**Headline:** the GPU/GLSL substrate (`@cas/gpu`) and the interchange codec (`@cas/interchange`) are already
thoroughly consolidated — ADR-0016's GLSL fold is complete with no stragglers. The live duplication is
**geometry and polynomial-root plumbing** that predates or sidesteps the extraction rule: one clean win
(`pointInPolygon`, 5 copies incl. an existing package export), one real three-consumer primitive
(monic-Horner + Durand–Kerner seeding, the still-open `cd-dup-05`), and one triplication already named in
Batch-1 (corner-clustered SC poles). The plotter↔argument-principle singularity-finder overlap is a
**deliberately deferred** merge (ADR-0020) — I flag it as respected, not actionable.

---

## Prioritized consolidation roadmap (payoff vs effort)

| # | Candidate | Consumers (already exist) | Destination | Payoff | Effort | Class |
|---|-----------|---------------------------|-------------|--------|--------|-------|
| 1 | **`pointInPolygon`** even-odd test | `@cas/schwarz` (exported), `@cas/conformal`, `apps/riemann-map`, `apps/argument-principle` — **4 TS copies** | **`@cas/core`** (new tiny `geometry.ts`) | **High** — kills 3 copies, one is *already* a package export; unblocks #3 | **Low** (~10-line pure fn + golden; rewire 3 imports) | **A** |
| 2 | **Monic-Horner `evalPoly`/`trimPoly` + DK-seed-and-certify** (`cd-dup-05`) | `apps/complex-dynamics/critical.ts`, `apps/argument-principle/singularities.ts` (acknowledged mirror), `apps/correspondences/correspondence.ts` (looser) — **3 consumers** | **`@cas/core`** (beside `makeDurandKerner`) | **Med-High** — math-critical root-finding, acknowledged copy | **Med** (param the seed strategy; goldens for all 3; keep clear of ADR-0020's finder) | **A** |
| 3 | **Corner-clustered SC poles + outward-dirs + Chebyshev boundary** (Batch-1 finding 03) | `apps/riemann-map/domains.ts`, `@cas/conformal/scMap.ts`, `@cas/conformal/forwardMap.ts` — **3 copies** | **`@cas/conformal`** (export `clusteredCornerPoles`/`clusteredBoundary`) | **Med** — tuning-drift risk across app↔pkg | **Med** (depends on #1 landing first) | **A** |
| 4 | **Trivial complex helpers** `cabs`/`cdiv`/`cmul`/`finite` re-declared despite shared ops | AP, plotter, CD `matingEngine` (`cd-dup-10`), correspondences | *No new pkg* — import `@cas/expr/complexJs` / `@cas/core` `tupleAlgebra` | Low | Low | **B** |
| 5 | **`formatComplex` / `fmtComplex`** display formatter | CD, AP, QD (3–4 app copies) | `@cas/core/format` (already holds `subscript`/`superscript`) | Low (display, per-app precision) | Low-Med | **B** |
| — | Respected: ADR-0020 finder/winding defer · ADR-0008 sym-core · ADR-0018 lstsq twin · `cd-div-02` divScaled · `rays.ts` hot-loop · QD vanilla `pointInPolygon` | — | *leave as-is* | — | — | **C** |

**Sequencing:** do **#1 first** (it is the dependency of #3 and the lowest-risk, highest-clarity move), then
**#3** (rides #1), then **#2** (independent, but the largest test-surface). #4/#5 are opportunistic cleanups.

---

### [MEDIUM] `pointInPolygon` — one even-odd ray-cast test reimplemented 5×, one copy already a package export (real ADR-0007)
- **Area:** cross-cutting (`@cas/schwarz`, `@cas/conformal`, `apps/riemann-map`, `apps/argument-principle`, QD) · **Location:** `packages/schwarz/src/unbounded-laurent.ts:316` (exported), `packages/conformal/src/scMap.ts:100` (private), `apps/riemann-map/src/domains.ts:45` (exported), `apps/argument-principle/src/contour.ts:45` (exported), `apps/quadrature-domains/app/schwarz/schwarz-common.mjs:135`/`:185`
- **Type:** consolidation
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Five independent bodies of the identical crossing-number test. The four TS copies are
  semantically identical over `[re,im]` tuples — e.g. `@cas/schwarz` (`:323`)
  `yi > w[1] !== yj > w[1] && w[0] < ((xj-xi)*(w[1]-yi))/(yj-yi) + xi`, `@cas/conformal/scMap.ts:106` and
  `apps/argument-principle/contour.ts` byte-for-byte the same predicate, and `apps/riemann-map/domains.ts:51`
  the same test with the interpolation factored as `xi + ((p₁−yi)/(yj−yi))·(xj−xi)` (algebraically equal).
  **`@cas/schwarz` already *exports* it** (`packages/schwarz/src/index.ts:8`
  `export { … pointInPolygon … }`) and Complex Dynamics consumes that export
  (`apps/complex-dynamics/src/main.ts:172`, used at `:3635,:3734,:3818`) — so the primitive is *already*
  package-grade; three other TS sites just don't import it. None of conformal / riemann-map /
  argument-principle currently depends on `@cas/schwarz`, but **all four depend on `@cas/core`**, and
  `@cas/schwarz` itself depends on `@cas/core` — so lifting the function *down* to `@cas/core` reaches every
  consumer with no new cross-package edge and no dependency-direction violation (`@cas/schwarz` then re-exports
  or re-imports it). QD's copy (`schwarz-common.mjs`, `{re,im}` layout + a binned `pointInPolygonIndexed`
  accelerator + a `|| 1e-300` horizontal-edge guard) is the vanilla-JS QD side — leave it (see (C)).
- **Why it matters:** This is the cleanest ADR-0007 case in the repo: a pure, convention-neutral geometry
  primitive, already blessed as a package export, needlessly re-authored three more times. Each copy is a
  place a future robustness fix (the `1e-300` degenerate-edge guard QD added, a boundary-inclusive variant)
  can land on one and miss the others. It is also the **dependency of roadmap #3** — the corner-clustering
  `outwardDirs` helper (Batch-1 finding 03) does its inside/outside flip with a local `pointInPolygon`, so a
  shared geometry home wants this first.
- **Recommendation:** Add `packages/core/src/geometry.ts` exporting
  `pointInPolygon(p: [number,number], poly: readonly [number,number][]): boolean` (the schwarz body, with the
  `yj-yi === 0` guard folded in from QD's copy), export from `core/index.ts`, and rewire `@cas/schwarz`,
  `@cas/conformal/scMap.ts`, `apps/riemann-map/domains.ts`, and `apps/argument-principle/contour.ts` to import
  it. Golden: pin a known interior/exterior/on-vertex/on-horizontal-edge set (the riemann-map and schwarz
  test corpora already have interior/pole assertions to reuse). Leave QD's `{re,im}` + indexed variant.

---

### [MEDIUM] Monic-Horner poly-eval + Durand–Kerner seeding/certification duplicated across 3 apps — the still-open `cd-dup-05` (real ADR-0007)
- **Area:** `apps/complex-dynamics`, `apps/argument-principle`, `apps/correspondences` · **Location:** `apps/complex-dynamics/src/render/critical.ts:150` (`evalPoly`), `:157` (`trimPoly`), `:175` (`durandKerner`, seed `:178`); `apps/argument-principle/src/singularities.ts:58` (`evalPoly`), `:64` (`trimPoly`), `:71` (`polyRoots`, seed `:80`), header `:56`; `apps/correspondences/src/correspondence.ts:68` (`evalMonic`), `:73-77` (seeds), `:61` (`solveDeflated`)
- **Type:** consolidation
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Three apps each wrap `@cas/core`'s `makeDurandKerner(tupleAlgebra)` in the *same* private
  scaffolding: a little-endian **monic Horner** evaluator (`evalPoly`/`evalMonic`,
  `acc = C.add(C.mul(acc, z), p[i])`), a seed-array builder, a `dk(...)` call, and a residual/convergence
  certification. Two of them are a near-verbatim copy: `critical.ts` (CD) and `singularities.ts` (AP) share
  the **identical** geometric-spiral seed `[0.4, 0.9]^i` (`critical.ts:178` ≡ `singularities.ts:80`), the
  **identical** `trimPoly` (`while (n>1 && cabs(p[n-1])<1e-12) n--`), and the same
  `ROOT_RESIDUAL_TOL = 1e-6` residual gate — and AP's own header says so:
  `singularities.ts:56` *"shared polynomial helpers (**mirrors** complex-dynamics/render/critical.ts)"*.
  `correspondence.ts` is a looser third consumer of the same *pattern* — it wraps `makeDurandKerner(A)` with a
  Horner `evalMonic` and residual filter, but seeds from a **roots-of-unity ring** (radius 1.1,
  `[cos t·1.1, sin t·1.1]`) and adds closed forms for `d ≤ 2`. This is exactly the prior review's
  **`cd-dup-05`**, which Batch-1 finding 01 reconfirmed as *unaddressed* with destination `@cas/core`; my
  contribution is that it is now a **three-app** duplication and that the seed *strategy* is the only part
  that legitimately diverges (spiral vs ring), while monic-Horner + the DK-wrap-and-certify is common.
- **Why it matters:** Root-finding is math-critical and the copies must stay in lockstep — the `cd-dk-01`
  NaN-convergence class of bug (Batch-1 finding 01, HIGH) lives one layer down in `makeDurandKerner`, and the
  per-app certification wrappers are exactly what decides whether a non-converged/NaN root is trusted. Three
  hand-maintained certification copies is three places that guard can drift. The suite's north-star ("each new
  tool builds fewer primitives from scratch") is directly contradicted by AP re-deriving CD's root plumbing.
- **Recommendation:** Add to `@cas/core`, beside `makeDurandKerner`, a
  `rootsMonic(coeffs, { seed?, tol?, residualTol?, mode? })` that does trim → monic-Horner closure →
  `makeDurandKerner` → residual certification, returning `{ roots, converged }`, plus exported
  `evalPolyHorner`/`trimPoly` helpers. Let the seed be a parameter (default the `[0.4,0.9]^i` spiral; pass the
  roots-of-unity ring from correspondences) so the divergence stays caller-side — the same pattern ADR-0018
  used to keep the lstsq rank-policy caller-side. **Keep this distinct from the ADR-0020-deferred *finder***
  (next item): this extracts only the primitive polynomial-root helper, not the app-specific `{zeros,poles,
  critical}` finder or the winding accumulator ADR-0020 chose to leave app-local. Golden: pin each app's
  current roots on a shared corpus before and after.

---

### [MEDIUM] Corner-clustered SC pole placement + outward-direction + Chebyshev boundary triplicated (real ADR-0007 — echoing Batch-1 finding 03, in cross-cutting scope)
- **Area:** `apps/riemann-map`, `@cas/conformal` · **Location:** `apps/riemann-map/src/domains.ts:68` (`cornerBoundary`), `:87`/`:94-98` (`cornerPoles`, outward), `:100` (ρ law); `packages/conformal/src/scMap.ts:112` (`sampleBoundary`), `:132` (`outwardDirs`), `:146` (`cornerPoles`), `:150` (ρ law); `packages/conformal/src/forwardMap.ts:35` (`forwardPoles`), `:40` (ρ law)
- **Type:** consolidation
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Confirming Batch-1 finding 03 from the cross-cutting side: the root-exponential clustering law
  `ρ = L·exp(−σ·(√N − √k))` appears verbatim at `domains.ts:100`, `scMap.ts:150`, and `forwardMap.ts:40`; the
  outward-direction heuristic (interior angle-bisector + a `pointInPolygon` flip) is copied
  `domains.ts:94-98` ↔ `scMap.ts:132-143`; and the Chebyshev edge density
  `0.5·(1−cos(πk/perEdge))` is copied `domains.ts:75` ↔ `scMap.ts:119`. Two genuine consumers (the app's
  Ω→𝔻 lightning fit and the package's `fast`-mode fit) ⇒ ADR-0007 satisfied. Note the `outwardDirs` flip
  *uses* `pointInPolygon` — so this rides on roadmap #1.
- **Why it matters:** A change to σ / the √-spacing / the outward test must land in ≥3 spots or the app's map
  and the package's fast mode silently diverge — the "fix lands on one copy" trap.
- **Recommendation:** As finding 03 says: export `clusteredCornerPoles(vertices, {nPer, sigma})` and
  `clusteredBoundary(vertices, perEdge)` from `@cas/conformal`, parametrizing the pole side (outside ∂Ω vs
  outside ∂𝔻, which is `forwardPoles`'s only difference), and consume from `domains.ts`, `scMap.ts`,
  `forwardMap.ts`. Land roadmap #1 first so the shared `outwardDirs` can use core's `pointInPolygon`.

---

### [LOW] Trivial per-app complex helpers (`cabs`/`cdiv`/`cmul`/`finite`) re-declared despite two shared sources (speculative — a shared consumer exists, but low payoff)
- **Area:** `apps/argument-principle`, `apps/complex-function-plotter`, `apps/complex-dynamics`, `apps/correspondences` · **Location:** `apps/argument-principle/src/integral.ts:16,20` (`cdiv`,`cmul`), `apps/argument-principle/src/singularities.ts:51,137,52` (`cabs`,`cdiv`,`finite`), `apps/complex-function-plotter/src/analysis/singularities.ts:37,39,38`, `apps/complex-dynamics/src/render/critical.ts:31` (`cabs`), `apps/complex-dynamics/src/render/matingEngine.ts:47,51` (`cd-dup-10`), `apps/correspondences/src/correspondence.ts:29` (`csqrt`)
- **Type:** consolidation
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Both `@cas/expr/complexJs` (`abs`, `div`, `mul`, `sqrt` over `Complex = [number,number]`) and
  `@cas/core`'s `tupleAlgebra` (`abs`, `abs2`, `div`, `mul`, …) already ship these ops, and the same files
  often import one of them for *some* ops while re-declaring `cabs`/`cdiv` for others — e.g.
  `argument-principle/singularities.ts` imports `* as C from "@cas/expr/complexJs"` (uses `C.add`/`C.mul`/
  `C.div` in `evalPoly`/`polyRoots`) yet also defines its own `cabs`/`cdiv`/`finite`; `critical.ts` does the
  same. `matingEngine.ts`'s private `cmul`/`cdiv` are the prior review's `cd-dup-10`, still open. `cabs` is
  just `Math.hypot`; `finite` is `Number.isFinite(z[0]) && Number.isFinite(z[1])` (three identical copies).
- **Why it matters:** Real but minor — this is not a *new-package* opportunity (the shared ops already exist),
  it is a "use what's shared" cleanup. It is **B / speculative** because most copies are single-consumer
  convenience and a few are deliberate: `@cas/expr/complexJs` returns freshly-allocated tuples, so hot Newton
  loops (`packages/dynamics/src/rays.ts:33-35`, `cmulRe`/`cmulIm` split-real to avoid per-step allocation)
  keep their own — a documented, correct optimization (see (C)).
- **Recommendation:** Opportunistically replace the *non-hot-path* helpers (`cabs`→`C.abs`/`Math.hypot`,
  `cdiv`→`C.div`, `matingEngine` `cmul`/`cdiv`→`complexJs`) as those files are touched; optionally add a
  shared `finite(z)` next to the algebra. Don't churn hot loops. Reconcile the `cd-dup-10` log entry either
  way (import or explicit WONTFIX-for-clarity).

---

### [LOW] `formatComplex` / `fmtComplex` display formatter reimplemented per app (speculative — display code, per-app tuned)
- **Area:** `apps/complex-dynamics`, `apps/argument-principle`, `apps/quadrature-domains` · **Location:** `apps/complex-dynamics/src/complex.ts:50` (`formatComplex`), `apps/argument-principle/src/main.ts:674` (`fmtComplex`), `apps/quadrature-domains/app/direct/direct-common.mjs:500` (`formatComplex`) + `direct-recompute.mjs:34`→`QD.Complex.format`
- **Type:** consolidation
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** Each app renders a complex number to an `a + bi` string with its own copy;
  `packages/core/src/format.ts` exists but exports only the *sub-primitives* `subscript` (`:18`) and
  `superscript` (`:23`) — the shared bits that *were* already extracted. Notably QD already did its own
  internal consolidation: `apps/quadrature-domains/app/core/poly-helpers.mjs:42` documents `QD.Format` as
  *"Consolidated (long ago) from ~9 drifted inline copies"* — evidence both that the drift is real and that
  the fix is app-scoped there.
- **Why it matters:** Low — display formatting is legitimately per-app (precision, `≈`/`≤` honest-label
  prefixes, subscript style, `-0` normalization all differ), so a forced merge risks flattening intended
  differences. Worth recording so the drift is known.
- **Recommendation:** If a shared surface is wanted, add a minimal `formatComplex([re,im], opts)` to
  `@cas/core/format` (which already owns `subscript`/`superscript`) with precision/`+bi`-sign options, and let
  apps keep their honest-label prefixes on top. Otherwise leave as-is (B, not ADR-0007-forced).

---

### [LOW] Respected deferrals & intentional non-merges — considered and correctly left alone (class C)
- **Area:** cross-cutting · **Location:** see each item
- **Type:** consolidation (non-issue confirmation)
- **Confidence:** high
- **Fix-safety:** needs-review (informational; nothing to change)
- **Evidence:** These *look* like duplication but are sanctioned; I verified each and recommend **against**
  merging:
  1. **ADR-0020 — plotter↔AP singularity finder + winding accumulator (DEFERRED).** The transcendental grid
     finder (`refine`/`winding`/grid loop) in `apps/complex-function-plotter/src/analysis/singularities.ts:45,60,81`
     is copied into `apps/argument-principle/src/singularities.ts:143,158,184` (its header `:12` says
     *"Adapted from the complex-function-plotter's `analysis/singularities.ts` (the ADR-0007 first consumer)"*),
     and the arg-accumulation reappears a third time in `apps/argument-principle/src/winding.ts:38`
     (`cumulativeArg`, whose header `:13-15` pre-declares the extraction). **ADR-0020 (`docs/DECISIONS.md:1732`)
     explicitly evaluated this and chose to defer** — the two finders diverged (AP added a rational-exact path,
     critical points, an AST+Region interface) and the winding accumulators have *different singular-sample
     semantics* (plotter returns 0 on `|w|=0` for its classifier; AP accumulates unconditionally and exposes
     `windingReliable` separately). Its "revisit if" trigger is a **third** consumer of winding/zero-pole
     location, or a unification behind `windingNumber(points, { onSingular })`. The brief says respect
     sanctioned deferrals — so I do **not** recommend merging the finder. (The *polynomial-root primitive*
     underneath — roadmap #2 — is a distinct, non-deferred concern and can be extracted without touching the
     finder interface.)
  2. **ADR-0008 — QD `sym-core.mjs` vs `@cas/exact`.** QD's exact-arithmetic core
     (`apps/quadrature-domains/app/sym/sym-core.mjs`) is deliberately kept separate from `@cas/exact`. Leave.
  3. **ADR-0018 — lstsq near-twins.** `@cas/core`'s `lstsqHouseholder` and QD's least-squares solver
     (`apps/quadrature-domains/app/solvers/solver.mjs`) diverged on rank-deficiency policy (core zero-fills at
     `1e-300`; QD throws at `1e-13` with `condEst`-driven refinement its cusp Newton solver needs). Documented
     as the *deferred* second consumer — leave.
  4. **`cd-div-02` — `divScaled`.** Not actually duplicated: `Complex.div` (`packages/core/src/complex.ts:147`)
     and `tupleAlgebra.div` (`packages/core/src/algebra.ts:85`) **both call the shared `divScaled`**
     (`complex.ts:40`); only the thin return-wrapper differs (`{re,im}` obj vs `[re,im]` tuple) to avoid a
     per-call allocation. The numeric kernel is already shared. Leave.
  5. **`@cas/dynamics/rays.ts` hot-loop complex ops** (`:33-35`, split-real `cmulRe`/`cmulIm`/`cdiv`) — a
     deliberate allocation-free Newton inner loop (Batch-1 finding 05 NIT). Leave; a one-line "why" comment
     would prevent a future accidental "consolidation."
  6. **QD vanilla `pointInPolygon`** (`schwarz-common.mjs:135`/`:185`) — `{re,im}` layout + a binned
     `pointInPolygonIndexed` accelerator; the QD side is vanilla JS with its own perf variant. Keep separate
     from the roadmap-#1 `@cas/core` tuple extraction (like sym-core, it is the QD-edge copy).
  7. **`constExp`/`constReal` constant-folder** (Batch-1 finding 02) — a byte-identical pair, but **within one
     package** (`@cas/expr`, `derivative.ts:99` vs `glsl.ts:151`); it is an *internal* shared-helper hoist, not
     a cross-package `@cas/*` extraction, and belongs to the `@cas/expr` owner's scope. Noted, not in my
     cross-cutting lane.
- **Why it matters:** Records that these were examined so the user knows they were considered and the ADRs
  upheld — pre-empting a false "why didn't you merge these?" and a mistaken future merge that regresses tuned
  behavior.
- **Recommendation:** None (that's the point). If ADR-0020's finder is ever unified, do it behind
  `windingNumber(points, { onSingular })` per its own Option B, with both apps' suites green before/after.

---

## Negative confirmations (checked, NOT a consolidation opportunity)

- **WebGL2 / GLSL boilerplate — already consolidated (ADR-0016 complete).** `@cas/gpu` provides the shared
  shader compile/link (`@cas/gpu/shader` `createProgram`), the GLSL complex stdlibs
  (`COMPLEX_SINGLE_GLSL`/`COMPLEX_DF64_GLSL`/`COMPLEX_DERIVED_GLSL`), the fullscreen vertex program,
  `PLANE_FROM_FRAG_GLSL`, `HSV2RGB_GLSL`, `PHASE_COLORING_GLSL`, plus `@cas/gpu/colormap` and `@cas/gpu/mask`.
  These are consumed by CD (`shaderBuilder.ts`, `schwarzGL.ts`, `glPlot.ts`), the plotter (`colorShader.ts`,
  `render3d/*`), Faber (`render/gpu.ts`), and Correspondences (`gpu.ts:8`, `paramGpu.ts:14`) — the
  correspondences shaders' `cmul`/`cdiv`/`cconj`/`vec_` all come from the injected `COMPLEX_SINGLE_GLSL`, not a
  local copy. **No stragglers** except QD's `schwarz-webgl.mjs` (vanilla-JS QD edge — the ADR-0007 *second
  consumer that motivated the `@cas/gpu` extraction* in the first place; its remaining copy is the intentional
  QD side). No action.
- **Share-link / URL-state codecs — not duplicated.** Every app has its own hash schema
  (`state/appState.ts`, `state/viewState.ts`, `interchange/importMap.ts`, per-app `main.ts`), but the *codec
  mechanism* is already shared: `@cas/interchange` exports `toBase64Url`/`fromBase64Url`
  (`packages/interchange/src/base64url.ts:11,24`) and a view-state codec (`viewstate.ts`), and a grep for
  `base64url`/`btoa`/`atob` across `apps/**/src` returns **zero** app-local base64 implementations. The
  per-app URL *schemas* are legitimately distinct (different state shapes) — not an ADR-0007 case. No action.
- **`@cas/core/format`** already carries the extracted display sub-primitives (`subscript`/`superscript`); QD
  internally consolidated its own formatters into `QD.Format` (per its own comment). Only the top-level
  `formatComplex` remains per-app (roadmap #5, low value).

---

## Coverage

**Examined:** the six committed Batch-1 findings (01/02/03/04/05/09) for leads; repo app/package dependency
graph (`package.json` `@cas/*` edges for all 8 apps + 10 packages). Independent greps across `apps/**` and
`packages/**` for each brief category: complex-arithmetic helpers (`cmul`/`cdiv`/`cabs`/`csqrt`/… — read the
two `singularities.ts` files, `critical.ts`, `correspondence.ts`, `integral.ts` in full or in the relevant
spans); WebGL/GLSL (`createShader`/`compileProgram` — traced every `@cas/gpu` import site); color/
domain-coloring (`hsl`/`hsv`/colormap — confirmed shared in `@cas/gpu`); polygon geometry (`pointInPolygon`
— read all 5 bodies + the `@cas/schwarz` export + CD consumption); root-finding / DK seeding (read the 3
consumers + confirmed against `makeDurandKerner`); least-squares (`lstsq`/`householder`/`condEst` — located
the QD twin); quadrature (`gaussJacobi`/`gaussLegendre`/`trapezoid` — confirmed conformal's are in-package,
AP's contour integral is app-specific); share-link (`base64url`/`location.hash`/`encodeState` — confirmed
interchange-shared codec + distinct per-app schemas); number/label formatting (`formatComplex` — 3–4 copies;
`@cas/core/format` exports). Cross-referenced ADR-0007/0008/0016/0018 and **read ADR-0020 (winding-defer) in
full** (`docs/DECISIONS.md:1732`) to classify the finder overlap correctly.

**Verified by reading full source:** `apps/complex-function-plotter/src/analysis/singularities.ts`,
`apps/argument-principle/src/singularities.ts`, `apps/argument-principle/src/winding.ts`,
`apps/complex-dynamics/src/render/critical.ts` (lines 1–240), `apps/correspondences/src/correspondence.ts`,
`apps/correspondences/src/gpu.ts` (head), `packages/gpu/src/glsl/index.ts`, the 5 `pointInPolygon` bodies, and
`packages/schwarz/src/index.ts` / `packages/core/src/format.ts` exports.

**Not covered / honest gaps (out of the consolidation lane or lower-yield):** I did **not** exhaustively diff
every UI/event-glue helper across the mega-apps (`main.ts` files are 3–7k lines each — I targeted the
numerical/geometry hotspots); I did not audit the QD `.mjs` tree beyond `schwarz-common.mjs`,
`solver.mjs`, `sym-core.mjs`, `poly-helpers.mjs`, `direct-*.mjs` heads (QD is largely intentional-separate
per ADR-0008); I did not deep-compare the apps' domain-coloring *enhancement* passes (`coloring.ts`,
`colormaps.ts`) beyond confirming the GLSL primitives are shared — a subtle CPU-side ramp duplication could
remain there and is worth a dedicated pass. I ran no builds/tests (READ-ONLY); the "semantically identical"
claims for the `pointInPolygon` and DK-seeding copies are from reading the bodies, and each roadmap item names
the golden test that would pin the pre/post equivalence.
