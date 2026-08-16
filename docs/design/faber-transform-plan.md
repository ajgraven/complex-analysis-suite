# Faber Transform Visualizer — Feasibility & Construction Plan

> **Status: research / proposal.** Investigates adding `apps/faber-transform`, a visualizer for the
> **exterior Faber transform**, plus a shared **`@cas/faber`** package extracted from Quadrature
> Domains' existing Faber engine. Requirements were elicited interactively with the author (see
> §12 for the answered decisions). No app code exists yet; this doc is the gate before scaffolding.
>
> Motivating reference: Graven & Makarov, *Quadrature Domains and the Faber Transform*
> ([arXiv:2509.03777](https://arxiv.org/abs/2509.03777)).

## 0. Why this fits the suite (the reuse story is unusually strong)

This is close to the cheapest genuinely-new app the suite can add, because **the hard math already
exists in-repo and correct**:

- QD's `app/analysis/faber-analysis.mjs` already computes the Faber polynomials $F_n$ of the bounded
  complement $K$ via the exterior-map Laurent recurrence, **verified** against the two ground-truth
  cases (disk $\Rightarrow F_n=\zeta^n$; interval $\Rightarrow F_n=2T_n(\zeta/2)$, Chebyshev).
- QD's `app/solvers/solver-faber.mjs` already has the *inverse* transform machinery
  (`inverseFaberAtPole`, `inverseFaberAtInfinity`) — the reconstruction direction from the paper.
- The engine is **convention-neutral** (no $dA=dx\,dy/\pi$, no $1/2\pi i$ appears in either file — those
  QD normalizations live upstream in the solver), so it is safe to lift into a package under ADR-0006.
- Function input (`@cas/expr`), complex/series/polynomial algebra and Durand–Kerner
  (`@cas/core`), phase-portrait GLSL building blocks (`@cas/gpu`), share-links (`@cas/interchange`),
  and PNG provenance (`@cas/export`) are all already in the stack.

The only genuinely new code is (a) the **forward transform of an arbitrary input** $\Phi_\varphi(f)=\sum
b_n F_n$ (neither app computes this yet — QD only builds the $F_n$ themselves), and (b) the two-panel
domain-coloring UI. This is exactly the north-star: **a new tool building fewer primitives than the last.**

## 1. The mathematics (the object the app draws)

**Setup.** $\varphi:\mathbb{D}^*\to\Omega$ is the exterior Riemann map — exterior disk
$\mathbb{D}^*=\{|z|>1\}$ onto an unbounded simply-connected $\Omega$, $\varphi(\infty)=\infty$,
$\varphi'(\infty)=c>0$ (the capacity), with Laurent expansion at $\infty$

$$\varphi(z)=c\,z+c_0+\frac{c_1}{z}+\frac{c_2}{z^2}+\cdots$$

The compact set is the **bounded complement** $K=\Omega^{c}$. Its **Faber polynomials** $F_n$ satisfy the
three-term-with-history recurrence (derived from $\psi'(z)/(\psi(z)-\zeta)=\sum F_n(\zeta)z^{-n-1}$):

$$F_0=1,\quad F_1=\tfrac{\zeta-c_0}{c},\quad
c\,F_{n+1}=(\zeta-c_0)F_n-\sum_{k=1}^{n}c_k F_{n-k}-n\,c_n.$$

**The transform maps disk → bounded complement.** The exterior Faber transform is an isomorphism

$$\Phi_\varphi:\ \mathcal{A}(\mathbb{D})\ \longrightarrow\ \mathcal{A}(K),\qquad \mathbb{D}=\{|z|<1\}.$$

For $f\in\mathcal{A}(\mathbb{D})$ with Taylor series $f(z)=\sum_{n\ge0}b_n z^n$,

$$\boxed{\ \Phi_\varphi(f)(w)=\sum_{n\ge0}b_n\,F_n(w)\ }$$

analytic on $K$ — precisely, on the region interior to the **convergence equipotential**
$\Gamma_R=\varphi(\{|z|=R\})$, where $R\ge1$ is $f$'s radius of convergence. (For the interval,
$\Gamma_R$ is the Bernstein ellipse; as $R\to1^{+}$ it collapses onto the slit $[-2,2]$.) This "sum
against the Faber basis" **is the definition**, which is why the coefficient-series method is exact
arithmetic, not a quadrature approximation.

**Rational building blocks (closed form, exact).** For a simple pole *outside* the unit disk
($|z_0|>1$, so $f=\tfrac1{z-z_0}\in\mathcal{A}(\mathbb{D})$ and $z_0\in\mathbb{D}^*$):

$$\Phi_\varphi\!\Big(\tfrac{1}{z-z_0}\Big)(w)=\frac{\varphi'(z_0)}{w-\varphi(z_0)},\qquad
\Phi_\varphi\!\Big(\tfrac{1}{(z-z_0)^2}\Big)(w)=\frac{\varphi''(z_0)}{w-\varphi(z_0)}+\frac{\varphi'(z_0)^2}{(w-\varphi(z_0))^2}.$$

The image pole sits at $\varphi(z_0)\in\Omega$ — **outside $K$** — so the image is genuinely analytic on
$K$, and the closed form analytically continues the truncated series out to $\varphi(z_0)$.

## 2. The two-panel visual spec (both panels bounded)

| | Left panel | Right panel |
|---|---|---|
| Region | unit disk $\{\lvert z\rvert<1\}$ | neighborhood of $K$ out to $\Gamma_R$ |
| Colors | $f(z)$ | $\Phi_\varphi(f)(w)$ |
| Overlays | unit circle $\partial\mathbb{D}$ | $\partial K$ and the convergence equipotential $\Gamma_R$ |

- **Coloring:** phase portrait (HSL by $\arg$) with **log-spaced modulus contour bands** by $|\cdot|$ — the
  informative default the author chose. Synced hover (readout of $z\mapsto f(z)$ and $w\mapsto\Phi_\varphi(f)(w)$) and synced zoom where meaningful.
- **No compactification needed.** Both sides are bounded; the earlier "show $\mathbb{D}^*$ on a sphere" idea
  was a dead end from an input-side mistake — the input is the *actual* unit disk.
- **Honesty on the right panel:** inside $\Gamma_R$ the render is trustworthy; outside it the truncated
  series diverges. Draw $\Gamma_R$ explicitly and fade/hatch/mask beyond it, so `=` (exact rational),
  vs `≈` (truncated transcendental), vs "outside domain of convergence" are visually distinct.
- **Faber roots (optional overlay, cheap):** `faberConvergence` already returns the roots of each
  $F_n$; scattering them on the right panel shows the classic "roots cluster on/around $K$" picture.

## 3. Compute architecture (three paths, one renderable output)

The renderer only ever needs *a complex function of $w$* to color on the right. Three input classes,
picked automatically from the parsed `@cas/expr` AST, feed it:

1. **Polynomial $f=\sum_{n=0}^{d}b_nz^n$** → $\Phi_\varphi(f)=\sum_{n=0}^{d}b_nF_n(w)$, an **exact**
   degree-$d$ polynomial in $w$ (assemble by summing scaled $F_n$ coefficient arrays). Label `=`.
2. **Rational $f$** (detected via `@cas/expr`'s `fToRational`) → partial-fraction into polynomial part
   + $\sum a_{jk}/(z-z_{0j})^k$ with $|z_{0j}|>1$; transform termwise via path 1 and the closed-form
   pole images of §1. Result is an **exact rational** function of $w$ with poles at $\varphi(z_{0j})$.
   Label `=`. (This path is analytic on a *larger* region than any truncation — up to the nearest image pole.)
3. **General / transcendental $f$** → truncate to order $N$: obtain $b_0,\dots,b_N$ by **FFT of samples**
   $f(r e^{i\theta})$ on a circle $r\lesssim1$ (via `@cas/expr`'s `makeComplexFn` evaluator), then
   $\Phi_\varphi(f)\approx\sum_{n=0}^{N}b_nF_n(w)$, a degree-$N$ polynomial in $w$. Label `≈`; draw $\Gamma_R$.

**Left panel** always colors $f(z)$ directly from `@cas/expr` (JS eval on CPU, or `compileF` GLSL on GPU).
**Right panel** colors a polynomial (paths 1/3, Horner) or a rational (path 2, num/den) — both trivial in
GLSL with the coefficients passed as uniforms, or in JS.

## 4. Architecture & reuse

### What stays at the app edge (ADR-0006)
Nothing convention-laden is needed: the Faber engine carries no $\pi$/$2\pi i$ factors. The app owns only
UI, the **curated preset $\varphi$'s** (each a closed-form Laurent, so **no numerical Riemann solver**),
the preset/free-form $f$ gallery, coloring parameters, and share-link/viewState serialization (which still
records a `ConventionTag` for provenance, mirroring `apps/argument-principle/src/viewState.ts`).

### Reuse map (downward only)
| Need | Source |
|---|---|
| Faber polynomials $F_n$, forward transform $\sum b_nF_n$, roots, formatting | **`@cas/faber`** (new, §5) |
| Complex/poly algebra, Durand–Kerner, truncated series-multiply | `@cas/core` |
| Parse $f$, JS evaluator (`makeComplexFn`), rational decomposition (`fToRational`), GLSL (`compileF`), LaTeX | `@cas/expr` |
| Phase-portrait GLSL stdlib (`COMPLEX_SINGLE_GLSL`, `HSV2RGB_GLSL`, `PLANE_FROM_FRAG_GLSL`), LUTs | `@cas/gpu` |
| `#vs=` view-state codec / share links | `@cas/interchange` |
| PNG `tEXt` reproducibility metadata | `@cas/export` |

**One caveat on GPU coloring (decided):** the *composition* that turns the stdlib into a finished
phase-portrait (`COLORING_GLSL`/`colorAt`, with the modulus-band enhancement) currently lives **inside
`apps/complex-function-plotter`**, not in a package. **Decision: extract `colorAt`/`COLORING_GLSL` into
`@cas/gpu`** as a shared phase-portrait module, with `complex-function-plotter` becoming the second consumer
under ADR-0007 — sequenced as its own small extraction between M1 and M2 (green before/after for the plotter,
exactly as with the QD rewire).

## 5. The extraction: `@cas/faber` (ADR-0007 second consumer)

**Genesis is earned:** QD is the first consumer (existing), this app the second — the standard rule fires.

**Package shape:** **Flavor B (dist-built)**, modeled on `@cas/exact`/`@cas/core` — `exports` →
`dist/index.js`+`dist/index.d.ts`, a `build` script (`tsc -p tsconfig.build.json`), scripts
`typecheck`/`test`/`lint`, dep `@cas/core: workspace:*`. **Not** Flavor A as first sketched: Quadrature
Domains consumes it in its **raw-Node** node-test runner (that's why QD's `.mjs` resolves `@cas/core` to
`dist/index.js`), and raw Node cannot load a `.ts` source export — so a source-exported package would crash
the QD suite. Wire into `vitest.workspace.ts` and `scripts/assert-test-census.mjs`. Convention-neutral
(ADR-0006); depends only on `@cas/core` (never up into an app — enforced by `.dependency-cruiser.cjs`
`no-package-to-app`).

**Moves in (pure math, IIFE/`QD.*` registration → ESM `export`), taking `@cas/core` primitives directly
(`makeDurandKerner`, `makePoly`, `makeSeries`, `subscript/superscript`, `objAlgebra`):**
- from `faber-analysis.mjs`: `faberPolynomials`, `faberPolynomial`, `polynomialRoots`, `formatFaberPoly`,
  `faberConvergence`;
- from `solver-faber.mjs`: `inverseFaberAtPole`, `inverseFaberAtInfinity` (the reconstruction direction —
  not needed for v1's forward view, but it belongs with the engine and unlocks later QD↔Faber hand-off);
- **new**: `faberTransform(laurent, taylorCoeffs, N)` → coefficients of $\sum b_nF_n$ (path 1/3), and
  `faberTransformRational(laurent, poles)` → the closed-form rational image (path 2).

**The key decoupling — a plain Laurent-coefficient contract.** Today `faberPolynomials(phi, N)` reaches into
QD's `phi` struct via `QD.phiLaurentAtInfinity(phi, N)`. The package API instead takes the coefficients
directly: `faberPolynomials({ c, laurent: [c0, c1, …] }, N)`. Then:
- QD's adapter passes `phiLaurentAtInfinity(phi, N)` (its existing φ-struct bridge stays QD-side — it is
  intrinsic to the solved-map representation and must not enter the package);
- the new app passes each **preset's closed-form Laurent** — no solver.

**`Taylor` (series inversion) question.** `@cas/core`'s `makeSeries` deliberately ships only truncated
*multiply*; QD's `app/core/taylor.mjs` adds `invert`/`reciprocal`/`log`/`exp`/`compose` (pure,
`@cas/core`-backed) and is what `inverseFaberAtPole` needs. v1's **forward** paths do *not* need series
inversion (path 1 is polynomial sums; path 2 is closed-form; path 3 is FFT coefficients). So: bring
`Taylor` into `@cas/faber` **only if** we also move the inverse transform in M-later; otherwise defer.
(Longer term `Taylor` is a natural `@cas/core` citizen once a second consumer beyond QD appears.)

**QD rewire (green before/after — the guardrail).** After extraction, QD's `faber-analysis.mjs`/
`solver-faber.mjs` become thin adapters: keep `QD.FaberAnalysis`/`QD.Faber` as namespace shims delegating to
`@cas/faber`, feeding `phiLaurentAtInfinity(phi,N)` in. QD's golden suite (`app/test/faber.test.js`:
$\zeta^n$, $2T_n(\zeta/2)$, root goldens, $F_6$ interval roots $=2\cos\frac{(2k-1)\pi}{12}$, format `"ζ² − 2"`)
must pass **unchanged** both before and after; the same goldens are copied into `@cas/faber/test/` as the
package's own corpus.

## 6. Suite interoperability (deferred for v1)

v1 is **standalone** (curated presets, no cross-app import) per the author's choice. Natural later hooks,
none of which v1 blocks:
- **Import $\varphi$ from Quadrature Domains** — QD already produces unbounded-QD exterior maps; over
  `@cas/interchange` its solved $\varphi$ could drive the transform for *any* QD, not just presets.
- **Reconstruction hand-off** — with `inverseFaberAtPole`/`inverseFaberAtInfinity` in the package, the app
  could take a quadrature function $h$ and show the recovered $\partial\Omega$ (the paper's headline result),
  handing domains back to QD.
- Import a conformal map from `riemann-map` for the bounded companion transform, if the bounded variant is
  added later.

## 7. ADRs to record
- **ADR — extract `@cas/faber`** (ADR-0007 second-consumer; QD + faber-transform). Note the plain
  Laurent-coefficient input contract and that `phiLaurentAtInfinity` stays QD-side.
- **ADR — `apps/faber-transform`** as a separate app (locked topology: separate apps + launcher), unbounded
  exterior variant first, curated univalent presets, standalone (interchange deferred).
- **ADR — lift `colorAt`/`COLORING_GLSL` into `@cas/gpu`** (decided; `complex-function-plotter` as ADR-0007 second consumer).

## 8. Phased build (each phase a shippable, tested gate)

- **M0 — Package genesis, QD green.** Create `@cas/faber` (Flavor A). Move the pure functions; convert
  registration to ESM; port the QD goldens into `test/`. Rewire QD to delegate; QD suite green before/after.
  Nothing user-visible yet. *Gate: `pnpm -w test` green across QD + new package.*
- **M1 — App shell + the Chebyshev anchor.** `apps/faber-transform` from the `argument-principle` skeleton
  (pure-2D to start). Interval preset ($\varphi=z+1/z$), monomial input $z^n$; render $F_n$ on the right.
  Assert on-screen against $2T_n(\zeta/2)$. *Gate: deploy-shaped build; anchor test passes.*
- **M1.5 — Extract the phase-portrait shader into `@cas/gpu`.** Lift `colorAt`/`COLORING_GLSL` out of
  `complex-function-plotter` into `@cas/gpu`; plotter delegates (green before/after). *Gate: plotter suite +
  browser test green; new app can import the shared coloring.*
- **M2 — Coloring + preset domains + poles.** Phase+modulus coloring on the extracted `@cas/gpu` module,
  $\partial K$/$\partial\mathbb{D}$/$\Gamma_R$ overlays. Curated presets: interval, ellipse $z+m/z$ (one
  clamped slider), $k$-cusped star, general $m$-fold — each with its clamped shape control. Exact rational
  path (simple + higher poles, `=`). *Gate: preset gallery renders; rational images match closed form.*
- **M3 — Free-form + numeric — DONE.** A third **input mode**: free-form `f(z)` via `@cas/expr`
  (`compileExprF` → JS evaluator), with a datalist of unit-disk-analytic presets and an `N` slider
  (default 32, cap 128). The left panel CPU-renders `f`; the right panel GPU-renders the truncated series
  `Σ_{n≤N} bₙ Fₙ`. Coefficients come from `taylorViaFFT` (DFT of samples on `|z|=0.9`); `trimTail` drops the
  noise-dominated tail before summing (a coefficient at the ~1e-14 roundoff floor times a geometrically
  growing `Fₙ` is O(1) garbage — the tests caught it); `radiusOfConvergence` estimates `R` from index-gap
  coefficient ratios (robust for lacunary/even series and prefactor-unbiased), reported as `∞` for entire
  `f`. The convergence equipotential `Γ_R = φ({|z|=R})` is drawn dashed; the `=`/`≈` badge flips to `≈`,
  parse errors show `⚠`. **Gate met:** a package test pins `Σ bₙ Fₙ` for `1/(z−2)` against the M2 exact
  pole image inside `Γ_R`. Verified in-browser: `1/(z−2)` draws the Bernstein ellipse `Γ₂` with the series
  smooth inside and honestly diverging (rainbow) outside; `exp(z)` reads "entire" (trimmed to n≤13);
  `1/(1+z²/4)` recovers `R≈2`. 29 app tests; typecheck/lint clean.
- **M4 — Polish, share-links, provenance.** viewState `#vs=` codec, PNG export metadata, KaTeX formula
  readouts, glossary, **Faber-root overlay (in v1)** as a toggle. Launcher tile as **"Coming soon"**
  (unpublished, per §12); publish only on the author's go.

## 9. Scaffold & wiring

**Files to create — package** (mirror `packages/exact`, Flavor-B): `packages/faber/package.json`,
`tsconfig.json`, **`tsconfig.build.json`**, `vitest.config.ts`, `eslint.config.js`, `README.md`,
`src/index.ts` (barrel, `.js` specifiers), `src/types.ts` (the `{c, laurent}` contract), `src/recurrence.ts`
(F_n), `src/transform.ts` (forward), `src/roots.ts`, `src/format.ts`, `src/convergence.ts`,
`src/inverse.ts` (reconstruction, later), `test/*.test.ts` (ported goldens).

**Files to create — app** (mirror `apps/argument-principle`): `package.json` (deps `@cas/core`,
`@cas/expr`, `@cas/faber`, `@cas/interchange`, `@cas/export`, `katex`, **`@cas/gpu` iff GPU coloring**),
`vite.config.ts` (`base:"./"`, new unused port, e.g. 5178), `tsconfig.json`, `index.html`, `src/main.ts`,
`src/viewState.ts`, `src/presets.ts` (φ presets + f gallery), `src/faber.ts` (glue over `@cas/faber`),
`src/render/*` (two panels, coloring, overlays, nav), `src/interchange/importMap.ts`, `src/styles/main.css`,
`test/*.test.ts`.

**Registration edits (the rest auto-discovers via `packages/*` / `apps/*` globs):**
1. `vitest.workspace.ts` — add `./packages/faber/vitest.config.ts` **and** `./apps/faber-transform/vite.config.ts`;
   `scripts/assert-test-census.mjs` — add the matching `{ name, match, floor }` project rows.
2. `eslint.config.js` — add `"faber-transform"` to `APP_NAMES` (so the no-cross-app rule covers it).
3. App `package.json` — `"@cas/faber": "workspace:*"` (+ the other deps).
4. `apps/launcher/index.html` — add a card (a `.card.soon` "Coming soon" `<div>`, no `href`, until publish).
5. `.github/workflows/deploy-pages.yml` — **omit** the `cp -r apps/faber-transform/dist …` line to hold it
   back (exactly how `correspondences` stays built-but-unpublished); add that one line to publish.

## 10. Testing & honest labeling
- **Package goldens (ported):** $\varphi=z\Rightarrow F_n=\zeta^n$; $\varphi=z+1/z\Rightarrow F_n=2T_n(\zeta/2)$
  (spot-check $F_2=\zeta^2-2$); root-finder goldens; $F_6$ interval roots real in $[-2,2]$; format `"ζ² − 2"`.
- **New transform tests:** rational closed form vs Faber-series truncation agree inside $\Gamma_R$;
  $\Phi_\varphi(z^n)=F_n$; linearity; the ellipse/star presets' first few $F_n$ against hand computation.
- **Labeling:** `=` exact (polynomial/rational), `≈` truncated (transcendental), and an explicit "outside
  domain of convergence" state beyond $\Gamma_R$ — never let a divergent tail read as signal.

## 11. Risks & non-goals
- **Truncation near $\partial K$** (path 3): the Faber series converges slowly at the equipotential boundary.
  Mitigation: honest $\Gamma_R$ masking; prefer the exact rational path whenever `fToRational` succeeds.
- **Monomial-basis root conditioning** at high degree: `polynomialRoots` already returns `converged:false`
  rather than garbage — surface it as a warning, cap default $N$.
- **Non-univalent $\varphi$**: avoided by construction — only curated univalent presets with clamped sliders
  ship (no free coefficient entry), so $\Omega$ is always a real domain.
- **GPU coloring extraction scope** (§4): the phase-portrait composition isn't packaged yet; treat its
  extraction as an optional, separable sub-project, with pure-2D as the guaranteed fallback.
- **Non-goals for v1:** bounded-$\Omega$ variant, interchange import/export, reconstruction-from-$h$ view,
  weighted (PQD/LQD) Faber, deep-zoom. All have named later homes; none are blocked.

## 12. Answered decisions (from the requirements dialogue)
1. **Object:** exterior Faber transform, **unbounded** $\Omega$ via curated univalent **Laurent** $\varphi$.
2. **Panels:** $f$ on the unit disk $\{|z|<1\}$ → $\Phi_\varphi(f)$ on the bounded complement $K$
   (interior/neighborhood out to $\Gamma_R$; Bernstein-region around the slit for the interval).
3. **Input $f$:** free-form (`@cas/expr`) **+** preset library — monomials, simple poles, higher/compound
   rational, transcendental samples.
4. **Compute:** exact (Faber recurrence / closed-form rational, `=`) where possible; **Faber-coefficient
   series** (`≈`) for general $f$.
5. **Engine:** extract into **`@cas/faber`**, **rewire QD now** (green before/after).
6. **Coloring:** phase + log-spaced modulus contours; **GPU** substrate.
7. **Domains (v1):** interval (Joukowski), ellipse $z+m/z$, $k$-cusped star, general $m$-fold — each with one
   clamped univalent shape slider.
8. **Deploy:** slug `faber-transform`; **built but unpublished** ("Coming soon") until the author approves.

### Resolved (second dialogue round)
- **A. GPU coloring source:** **extract `colorAt`/`COLORING_GLSL` into `@cas/gpu`** (plotter = second
  consumer). Sequenced as M1.5.
- **B. $\mathbb{D}^*$-view:** void — both panels are bounded; **no sphere/inversion view**.
- **C. Truncation order:** **$N=32$ default, user-adjustable** up to a ~128 cap, surfacing the
  non-convergence warning as conditioning degrades.
- **D. Faber-root overlay:** **included in v1** (M4 toggle; nearly free via `faberConvergence`).

## Build progress (living record)

- **M0 — `@cas/faber` genesis + QD rewire — DONE.** Created `packages/faber` (Flavor-B, dist-built):
  `recurrence.ts` (F_n), `transform.ts` (the new forward `Φφ(f)=Σ b_nF_n`), `roots.ts` (Durand–Kerner +
  Newton), `format.ts`, `convergence.ts`, over the `{c, laurent}` `ExteriorMap` contract; depends only on
  `@cas/core`. 20 package tests green (the ported ζⁿ / 2·Tₙ(ζ/2) / F₂=ζ²−2 / F₆-roots / root-finder / format
  / convergence oracles + new transform tests: `Φφ(zⁿ)=Fₙ`, disk-identity, linearity). QD's
  `faber-analysis.mjs` is now a **thin adapter** delegating to `@cas/faber` — it keeps the `QD.FaberAnalysis`
  surface, the "unbounded map" gate, and the `phiLaurentAtInfinity` φ→`{c,laurent}` bridge (the one piece that
  stays QD-side). **QD suite green before AND after: 2334 passed, 0 failed.** Full workspace: **2998 tests
  passed**, `typecheck` clean, `lint` clean (dependency-cruiser: no violations — `@cas/faber` imports only
  `@cas/core`). Wired into `vitest.workspace.ts` + `scripts/assert-test-census.mjs` (`faber:4`). The inverse
  transform (`inverseFaberAtPole`/`inverseFaberAtInfinity` in QD's `solver-faber.mjs`, which needs QD's
  series-inversion `Taylor`) was **deliberately left in QD** — demand-driven (ADR-0007): it moves when the
  reconstruction view is built, not before.
- **M1 — App shell + Chebyshev anchor — DONE.** Scaffolded `apps/faber-transform` from the
  `argument-principle` skeleton (pure-2D, no WebGL yet): two CPU phase-portrait panels — `f(z)=zⁿ` on the
  unit disk (masked outside |z|<1) beside `Φφ(zⁿ)=Fₙ` on the bounded complement `K`, with `∂𝔻`/`∂K`
  overlays and a live formula readout. Curated presets: **interval** (Joukowski, the anchor) + **ellipse**
  `z+m/z` with a clamped `m∈[0,0.95)` shape slider; a monomial-degree control; a `#vs=` permalink over
  `@cas/interchange`. All glue routes through `src/faber.ts` over `@cas/faber`. **16 app tests green** —
  the on-screen anchor asserts `Φφ(zⁿ)=2·Tₙ(w/2)` (with the `F₀=1≠2·T₀` subtlety pinned), `∂K` on the
  interval segment, the ellipse semi-axes `1±m`, and the viewState round-trip/guard. **Verified in a real
  headless Chromium**: both panels paint correct phase portraits (`Φφ(z³)=w³−3w`, `Φφ(z⁵)=w⁵−5w³+5w`), the
  Faber roots visibly cluster inside `K`, the permalink updates, and the ellipse shape slider appears — zero
  console errors (bar the default-favicon 404). Wired into `vitest.workspace.ts`, `eslint.config.js`
  `APP_NAMES`, and the test-census (`faber-transform:3`). Held back from publishing (no launcher card, no
  deploy `cp` — like `correspondences`). Full workspace: **3014 tests**, typecheck / lint / build all green.
- **M1.5 — Extract the phase-portrait shader into `@cas/gpu` — DONE.** Lifted the plotter's
  `COLORING_GLSL` (the `colorAt` core: phase-LUT + modulus transfer + `fwidth`-antialiased enhancement +
  level sets + uncertainty + CVD) verbatim into `@cas/gpu/glsl` as `PHASE_COLORING_GLSL` (ADR-0007:
  `complex-function-plotter` + the Faber app). The plotter's `colorShader.ts` now re-exports it under the
  historical name `COLORING_GLSL`, so `buildFragmentShader` and the 3-D sphere/surface shaders are
  untouched and the assembled GLSL is byte-identical. Added a `@cas/gpu` string-shape test. **Plotter green
  before AND after** (node 166; typecheck/lint clean) and **verified in real WebGL** (full headless
  Chromium): the plotter renders Γ(z)'s domain-colored 3-D surface with zero shader-compile/link errors —
  the extracted `colorAt` works. (The plotter's own vitest-browser job needs `chrome-headless-shell`, absent
  in this sandbox; CI runs it.) Full workspace: **3018 tests**, typecheck / lint / build all green.
- **M2 — presets → exact rational input → GPU renderer → pan/zoom** (author-specified order):
  - **Step 1 — remaining presets — DONE.** Added the deltoid `z + a/(2z²)` (3 cusps at a→1) and the
    5-cusped star `z + a/(4z⁴)`, each with a clamped amplitude slider inside the area-type univalence bound
    `Σ n|cₙ| ≤ 1`. Preset switch reframes the right panel to `K` (via `kHalf`).
  - **Step 2 — exact rational input path — DONE.** New `@cas/faber` `exteriorMapJet` (φ and its
    derivatives from the Laurent) + `faberImageOfPole` / `evalRationalImage`: the exact closed-form image of
    `1/(z−z₀)^k` (k = 1, 2), a rational function whose pole sits at `φ(z₀) ∈ Ω` outside `K`. Pinned by a
    package test against the truncated Faber series (the generating identity) — 25 package tests. The app
    gains a monomial/pole **input-mode toggle** (pole via polar `r>1`, `θ` so `|z₀|>1` always), an image-pole
    marker, and a `=` (exact) badge. Verified in-browser: a double pole outside the disk maps to a double
    pole at `φ(z₀)` in the deltoid's exterior. 20 app tests; typecheck/lint clean.
  - **Step 3 — GPU renderer — DONE.** Each panel now layers a **WebGL2 phase-portrait canvas** (the shared
    `@cas/gpu` `colorAt` — a 256×1 HSV LUT + log₂ modulus rings) under a 2-D overlay canvas (axes, ∂𝔻/∂K,
    markers), with the CPU portrait as an automatic fallback when WebGL2 is absent. A single fragment kernel
    evaluates any case as a rational `num(z)/den(z)` (two Horner loops, coeffs as uniforms): the monomial,
    the Faber-image polynomial, the pole input `1/(z−z₀)^k`, and its rational image all pack into it. Added
    `render/gpu.ts` (`createGpuRenderer`) and the `Rational` builders in `faber.ts`; the app now depends on
    `@cas/gpu`. Verified in real WebGL (SwiftShader): both panels compile+paint with zero shader errors, and
    `Φφ(z⁸)` over the deltoid shows all eight Faber zeros clustered on `K` at plotter-quality. 20 app tests;
    typecheck/lint clean.
  - **Step 4 — pan/zoom — DONE.** Independent per-panel pan (pointer drag) and zoom-about-cursor (wheel) on
    each overlay canvas, sharing the `plane.ts` viewport helpers (`viewPxToWorld`/`panTo`/`zoomAboutCursor`);
    the permalink write is trailing-debounced so a drag/slider sweep doesn't thrash `history`. Smooth on the
    GPU (re-render per frame). Verified in-browser: wheel zoomed the right panel 1.18→4.97× into a single
    Faber zero (crisp at depth), drag panned the left panel — no console errors. **M2 complete.**
