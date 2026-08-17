# Review findings — `apps/complex-dynamics` + `@cas/dynamics` (agent 05, "CD")

Scope: the Complex Dynamics mega-app (~34.5k lines) — escape-time/smooth Julia & Mandelbrot,
Böttcher exterior maps, external rays, the σ Schwarz-reflection peer view (CPU + GPU), the
"Riemann Map ↗" interchange producer, native σ φ-form authoring — plus the `@cas/dynamics`
package (inverse-Böttcher uniformization + external-ray tracing). Emphasis per the prompt:
Böttcher/uniformization correctness, escape-time/smooth/potential formulas, honest `≈`/`≤`/`=`
labeling, σ reconstruction fidelity and GPU-vs-CPU parity, the `CD_TO_RM_BOTTCHER_LINK`
cross-app golden, and convention (π / 2πi) factors.

**Headline: the core mathematics is in excellent shape.** I verified — by re-deriving the
functional equations and checking the golden corpus — that the inverse-Böttcher recurrences
(monic `z^d+c`, general polynomial, rational, and multibrot), the Gronwall area bound, the
capacity formula, the bounding-disk radius, the smooth-iteration formula, the parabolic-root
Newton system, and the σ escape-degree heuristic are all correct, and that the honest-labeling
guardrail (`=`/`≤`/`≈`) is respected throughout. **No CRITICAL or HIGH issue, and no π / 2πi
convention error, was found.** The findings below are one MEDIUM parity bug, two LOW
correctness/robustness items, and several stale-doc / consolidation notes.

---

### [MEDIUM] GPU σ render silently caps the orbit at 512 iterations while the maxIter input allows 4096 — GPU and CPU diverge for maxIter > 512
- **Area:** apps/complex-dynamics (σ peer view) · **Location:** `apps/complex-dynamics/src/render/schwarzGL.ts:259` and `:304`; input clamp `apps/complex-dynamics/src/main.ts:5029`; CPU path `apps/complex-dynamics/src/render/schwarzView.ts:296`
- **Type:** bug / numerical
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** The GPU σ escape loop is a fixed-bound loop:
  ```glsl
  for (int n = 1; n <= 512; ++n) {           // 512 ≫ any maxIter; the real bound is u_maxIter below
    if (n > u_maxIter) break;
  ```
  `fieldHeight()` (relief) has the same `n <= 512` bound (`schwarzGL.ts:304`). But the σ iterations
  input is clamped to **4096**, not 512: `schwarzEscape.maxIter = Math.min(4096, v)` (`main.ts:5029`).
  The CPU twin has no such cap — `renderSchwarzField` → `@cas/schwarz`'s `escapeTime` iterates to the
  full `maxIter` (`schwarzView.ts:272,296`), as do `schwarzEscapeAt`/`schwarzOrbitAt`. The app feeds
  the *same* `schwarzEscape.maxIter` to both paths (`main.ts:3254` GPU, `main.ts:3280` CPU).
- **Why it matters:** For any σ maxIter in (512, 4096], the GPU returns "interior" (deep-indigo,
  non-escaping) for every point whose σ-orbit only enters K (fundamental tiling) or escapes to ∞
  *after* step 512, while the CPU path classifies those points correctly. The result is a **silently
  wrong** GPU field (fewer tiling bands / an oversized "interior" blob) that disagrees with both the
  CPU render and the true σ dynamics — directly contradicting this module's stated invariant that
  "GPU and CPU renders agree pixel-for-pixel on WHICH set each point is in" (`schwarzGL.ts:8,48`). The
  loop comment "512 ≫ any maxIter" is the author's assumption; the 4096 input clamp violates it.
  Raising σ iterations is exactly what a user does to resolve deeper tiling structure, so the path is
  plausible, and the failure is unwarned.
- **Recommendation:** Make the bound consistent. Cleanest: clamp the maxIter *passed to the GPU* (and
  the input, if 512 is acceptable) to the shader's loop bound, or raise the GPU loop bound to match the
  input max (accepting the shader cost), or expose the cap as a `#define` fed from the input maximum.
  A regression test: pick a `c`/φ and a `w` whose σ-orbit enters K at step ~600, render both paths at
  maxIter = 1024, and assert the classification (fundamental vs interior) agrees.

### [LOW] CPU and GPU σ library defaults diverge (escapeR 1e6 vs 1e4, maxIter 64 vs 48)
- **Area:** apps/complex-dynamics (σ peer view) · **Location:** `apps/complex-dynamics/src/render/schwarzView.ts:157,182-183,272,275` vs `apps/complex-dynamics/src/render/schwarzGL.ts:516-517`
- **Type:** bug (latent) / numerical
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** The CPU σ functions default `escapeR ?? 1e6` and `maxIter ?? 64`
  (`schwarzEscapeAt`, `schwarzOrbitAt`, `renderSchwarzField`). The GPU `render` defaults
  `opts.escapeR ?? 1e4` and `opts.maxIter ?? 48` (`schwarzGL.ts:516-517`). The two functions are
  documented to "agree pixel-for-pixel" (`schwarzGL.ts:8`), yet their fall-back parameters differ.
- **Why it matters:** Currently **masked** — the app always passes a single shared
  `schwarzEscape = { maxIter: 48, escapeR: 1e4 }` (`main.ts:3038`) to both paths, so no user-visible
  divergence today. But any caller (a future consumer, a test, or a refactor that drops the explicit
  opts) that relies on defaults gets *different classification thresholds* on the two paths — a latent
  version of the MEDIUM bug above.
- **Recommendation:** Define one shared `SCHWARZ_ESCAPE_DEFAULTS` (the app already has the constant at
  `main.ts:3038`) and have both the CPU and GPU entry points read the same values, so the parity
  invariant cannot be broken by omission.

### [LOW] Stale "Rigorous" comment + `lastConnectivityRigorous` naming for what the code now (correctly) hedges as an estimate
- **Area:** apps/complex-dynamics · **Location:** `apps/complex-dynamics/src/main.ts:2124` (comment) and `:1992,2132,2148` (variable)
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now (comment text only); the variable rename is needs-review
- **Evidence:** `main.ts:2124`: `// Rigorous (Fatou–Julia) connectivity from all critical orbits when f is a polynomial;`
  and the flag `lastConnectivityRigorous` (`:1992,2132`). The actual output is correctly hedged —
  `"≈ connected (all critical orbits bounded to the iteration cap)"` / `"≈ disconnected (mixed critical
  orbits)"` (`:2140,2144`) — and `critical.ts:270-271` documents honestly that "only 'cantor' is a
  determination; 'connected' and 'disconnected' are estimates" (the verdict rests on a 400-iteration
  cap, `CONN_ITERS`, `critical.ts:263,288`).
- **Why it matters:** The 2026-07 review flagged item #5 — *"`polynomialConnectivity` documented
  'Rigorous', is a 400-iteration escape test."* The user-facing wording was fixed (now `≈`), but the
  internal comment and the `Rigorous`-named flag still carry the exact word the review called out, so
  the finding is only **partially** closed and the comment now contradicts the code 11 lines below it.
- **Recommendation:** Reword `main.ts:2124` (e.g. "Critical-orbit connectivity … `connected`/`disconnected`
  are iteration-cap estimates; only all-escaped 'cantor' is decisive") and consider renaming
  `lastConnectivityRigorous` → `lastConnectivityFromCriticalOrbits` (or `…Determined`).

### [LOW] Consolidation: `matingEngine.ts` re-implements complex mul/div (prior finding cd-dup-10, still open)
- **Area:** apps/complex-dynamics · **Location:** `apps/complex-dynamics/src/render/matingEngine.ts:47,51`
- **Type:** consolidation
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** `const cmul = …` and `const cdiv = …` are private tuple-complex ops that restate
  `@cas/expr/complexJs`'s `mul`/`div` (`packages/expr/src/complexJs.ts:35…`). The 2026-07 review logged
  this as `cd-dup-10` (low/small); it is still present.
- **Why it matters:** Not ADR-0007-blocked — `@cas/expr/complexJs` is an existing shared consumer, so
  this is a genuine (if minor) duplication that could just import the shared ops. It is a *speculative*
  cleanup, not a load-bearing bug.
- **Recommendation:** Replace the private helpers with `@cas/expr/complexJs` imports, or leave as-is if
  the review closes it as WONTFIX for hot-path clarity — either way, reconcile with the prior log entry.

### [NIT] `@cas/dynamics` `rays.ts` rolls its own complex helpers instead of `@cas/expr/complexJs`
- **Area:** packages/dynamics · **Location:** `packages/dynamics/src/rays.ts:33-35`
- **Type:** consolidation / style
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** `rays.ts` defines `cmulRe`/`cmulIm`/`cdiv` on bare `Vec2`, whereas its sibling
  `uniformize.ts` in the same package uses `@cas/expr/complexJs` (`C.add`, `C.mul`, …). The split
  real/imag helpers avoid per-step tuple allocation inside the Newton loops (`rays.ts:64-68,99-103`).
- **Why it matters:** This looks like a *deliberate* hot-loop micro-optimization (allocation-free
  Newton iteration), so it is a documentation/consistency nit rather than a defect — worth a one-line
  comment saying so, so a future reader does not "consolidate" it and regress the ray-tracer's speed.
- **Recommendation:** Add a short "// allocation-free complex ops for the Newton inner loop" note, or
  leave untouched. No behavior change.

### [NIT] `schwarzPhiFromMapSpec` dispatches only on `phi.form`, ignoring the `disk`/`inverse` tags
- **Area:** apps/complex-dynamics (σ import) · **Location:** `apps/complex-dynamics/src/interchange/importMap.ts:118-132,140-145`
- **Type:** bug (latent robustness)
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** `schwarzEngineFromMapSpec` picks the engine purely from `phi.form` (`"laurent"` →
  exterior `makeUnboundedLaurentSchwarz`, `"bounded"` → interior `makeBoundedSchwarz`). The interchange
  `SchwarzMap.phi` also carries `disk` (`"D*"` exterior / `"D"` interior) and `inverse` (`"newton-dk"`)
  tags (see the goldens, `packages/interchange/src/goldens.ts:66,115`), which are read as *informational*
  and never cross-checked against `form`.
- **Why it matters:** For today's sole producer (QD) `form` and `disk` always agree, so this is correct
  in practice. But a hand-authored or future map with `form:"laurent"` + `disk:"D"` would be
  reconstructed with the *exterior* engine regardless of its declared interior disk — a silent
  branch/orientation mismatch rather than a validation error.
- **Recommendation:** Either assert `disk` is consistent with `form` (throw on mismatch, matching the
  "fail loudly" stance already taken for a schwarz map hitting `mapSpecToExpr`, `importMap.ts:87-89`),
  or document at the function that `disk`/`inverse` are advisory and `form` is authoritative.

### [NIT] Böttcher export note labels the exact (truncated) `b_k` as "estimated (≈)"
- **Area:** apps/complex-dynamics (interchange producer) · **Location:** `apps/complex-dynamics/src/interchange/exportMap.ts:13-14,70-71`
- **Type:** stale-doc / labeling
- **Confidence:** medium
- **Fix-safety:** safe-now (provenance text only)
- **Evidence:** The provenance note reads "capacity γ₁ exact, tail truncated to N estimated bₖ (≈)"
  (`exportMap.ts:70-71`), and the header comment calls the `b_k` "truncated series estimates". In fact
  each `b_k` from `juliaExteriorCoeffs` / `polynomialJuliaExteriorCoeffs` is an **exact** value of a
  rational recurrence; only the *reconstruction* ψ(e^{iθ}) from finitely many terms is an approximation.
- **Why it matters:** This is the *conservative* (safe) direction — it understates precision rather than
  overstating it, so it does not violate the honesty guardrail. Purely a wording nicety.
- **Recommendation:** If touched, reword to "coefficients bₖ exact; the tail is truncated to N terms, so
  the reconstructed boundary is an estimate (≈)." Low priority.

---

## Positively verified (no action needed)

These are the load-bearing pieces I checked closely and believe are correct — recorded so the next
reviewer need not re-derive them:

- **Inverse-Böttcher recurrences (`@cas/dynamics/uniformize.ts`).** Re-derived the functional equation
  `g(u^d) = g(u)^d + c·u^d` for monic `z^d+c` (`juliaExteriorCoeffs`, gives ψ = w − c/(2w) at order 1, as
  the tests pin) and the general Laurent identity `g(u^D) = g(u)^D + Σ β_j u^{D−j} g^j` with
  γ₁ = a_D^{−1/(D−1)} (`exteriorFromLaurent`); both index the recursion correctly (triangular, divisor
  D ≠ 0). `rationalLaurentAtInfinity` (P̃/Q̃ power series) and `mandelbrotExteriorCoeffs` (Böttcher-product
  reversion → −1/2, 1/8, −1/4, 15/128) both check out. The test corpus is strong (functional-equation
  residuals + independent numeric-Böttcher round-trips).
- **`CD_TO_RM_BOTTCHER_LINK` producer.** `bottcherLaurentMap` maps `{lead:γ₁, coeffs:b_k}` → `{form:
  "laurent", c, F}` faithfully, reproduces the golden byte-for-byte, and ψ(2)=2.125 round-trips
  (`test/exportMap.test.ts`). Correctly omits the `conventions` tag — a Böttcher map carries no
  area/contour normalization, so there is no π / 2πi ambiguity to tag.
- **Gronwall area bound** `π(1 − Σ_{k≥1} k|b_k|²)` (`juliaProperties.ts:104`): π convention correct, sum
  correctly excludes the k=0 translation term, truncation yields a genuine **upper** bound, and the UI
  labels it `≤ … (bound)` (`main.ts:2023`). **Capacity** |a_d|^{−1/(d−1)} (`:116-128`) and **bounding
  radius** (real root of R^d−R−|c|=0, `:74-89`) are both correct and honestly labeled.
- **Smooth-iteration formula** `n + 1 − log(log|z|)/log d` (shaderBuilder + schwarzGL): the omitted
  `/log R` normalization is a global constant offset that is immaterial for palette coloring; degree
  normalization uses `log(monicDegree)` correctly, and the perturbation path reads the reconstructed
  full orbit value at escape (`shaderBuilder.ts:262,294`).
- **σ escape degree** = highest nonzero Laurent index of φ (`schwarzGL.ts:486-488`): re-derived that
  F(z) ~ conj(F_L)·z^L ⇒ σ(w) ~ const·conj(w)^L, so the heuristic is exactly right (L=2 for the deltoid).
- **σ CPU/GPU coordinate parity:** `pixelToPlot`/`plotToPixel` are exact inverses, and the GPU `fragToW`
  y-up→+Im mapping matches the CPU raster after `drawImage`. The escaping σ set is explicitly `≈`-labeled
  (`schwarzGL.ts:146-149`), and `schwarzOrbitLabel` is honest.
- **Parabolic-root Newton** (`angleParameter.ts:173+`): the (z,c) system P=f^n−z, Q=(f^n)′−1 with the
  four carried derivatives (p,q,r,s) and Jacobian [[p_n−1,q_n],[r_n,s_n]] is derived correctly, with a
  sound residual-based acceptance for satellite (linear-convergence) roots.

## Coverage

**Examined closely:** all of `@cas/dynamics` (`uniformize.ts`, `rays.ts`, `index.ts`, and both test
files); the interchange producer/consumer (`interchange/exportMap.ts`, `interchange/importMap.ts`) and
the `packages/interchange/src/goldens.ts` cross-app corpus; the CD-side exterior-map driver
(`main.ts` `dynExterior`/`dynExteriorUncached`/`updateExteriorMap`/`applyLaurent`, ~1780–1980);
`render/juliaProperties.ts` (area/capacity/bounding/smallC/Lyapunov analytic tier); `render/critical.ts`
connectivity gate (`findCriticalPoints`, `polynomialConnectivity`); the smooth/escape/potential shader
math in `render/shaderBuilder.ts` (escape loops, perturbation, distance-estimate, multiplier) and the
σ GPU renderer `render/schwarzGL.ts` in full; the σ CPU path `render/schwarzView.ts` in full; the σ
render/iteration wiring in `main.ts` (~3030–3290, 4030–4200, 5000–5030); the state/share-link codec
(`state/appState.ts`, `main.ts` `loadFromHash`/`encodeState`); `render/angleParameter.ts` ray-landing +
parabolic-root refinement; and the connectivity-honesty labeling readouts.

**Cross-referenced** the 2026-07 review for CD/dynamics/Böttcher/σ items (findings #4, #5, cd-dup-05/10/11/12,
cd-shell-08/09): #5 is partially open (LOW stale-doc above); cd-dup-10 still open (LOW above); cd-shell-09
(Laurent-radius memo) confirmed done (`main.ts:1821-1854`).

**Spot-checked / NOT deeply audited (honest gaps):** the bulk of `main.ts` (6856 lines — mostly UI/event
glue) beyond the numerical sections above; `render/glPlot.ts` (2527 lines — WebGL setup, perturbation
BLA-table build/upload, sphere camera) beyond the `perturbDegree`/uniform wiring; `render/overlay.ts`,
`render/matingEngine.ts` internals, `render/plotView.ts`, `render/bla.ts` (double-double BLA numerics),
`render/perturbationPoly.ts`, `render/inspect.ts`, `render/dd.ts` (df64/double-double kernels); the
`combinatorics/*` modules (`coreEntropy`, `stripping`, `dynatomic`, `orbitPortrait`, `angles`) — I
verified `angleParameter.ts`'s use of them but not their internals; the many σ overlay modules
(`schwarz*Overlay.ts`, `schwarzTreeOverlay`, `schwarzLimitSetOverlay`, etc.); and the numerous
Julia-analysis overlays (`yoccozPuzzle`, `lamination`, `hermanRing`, `siegelCurves`, `weightedBirkhoff`,
`brjuno`, `farey`). I also did **not** verify the `@cas/schwarz` engine internals (out of scope — a
separate agent), only CD's consumption of it. No `git`/build/test execution was performed (read-only).
