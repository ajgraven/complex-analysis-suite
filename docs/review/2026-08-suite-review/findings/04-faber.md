# Faber review (agent 04 "FABER") — `@cas/faber` + `apps/faber-transform`

Scope: the tenth package `@cas/faber` (Faber recurrence, exact rational pole/monomial images,
exterior-map Laurent jets, corner-suppressing weighted Faber `Q_{n,m}`) and the seventh app
`apps/faber-transform` (ellipse/deltoid/QD/regular-polygon/arbitrary-polygon domains, adaptive Laurent
truncation, corner-norm `Λₖ` annotations, polygon editor, `Q_{n,m}` toggle + before/after profile). I read
every `src/` file in both, the ADR-0024 + polygonal-SC plan, the weighted/recurrence/rational tests, and the
`@cas/conformal` exterior-SC boundary it consumes. **The heavy math is sound** — the Faber recurrence, the
exact rational-image residues, the `1/m`-root branch, and the SC-extractor conventions all check out (see
"Verified correct" near the end). The findings below are one rendering bug, a pervasive-but-harmless
notational contradiction with a latent-corruption risk, and a cluster of honesty/stale-doc items. No CRITICAL
or HIGH issue found; no convention (π/2πi) problem — this transform is genuinely convention-neutral.

---

### [MEDIUM] GPU coefficient array (MAXC = 48) silently truncates the series image while N reaches 128
- **Area:** apps/faber-transform · **Location:** `src/render/gpu.ts:21` (`const MAXC = 48`), `src/render/gpu.ts:80-88` (`packCoeffs`), `src/viewState.ts:46` (`MAX_TRUNCATION = 128`), `src/main.ts:519,533`
- **Type:** bug
- **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** The fragment shader declares `uniform vec2 uNum[${MAXC}]` / `uDen[${MAXC}]` with `MAXC = 48`, and `packCoeffs` clamps `deg = Math.min(MAXC - 1, ...)`. The free-form series path builds `poly = transformCoeffs(map, b)` whose degree is `effN = b.length - 1`, and `effN ≤ N ≤ MAX_TRUNCATION = 128` (the `series order N` slider is `min String(MIN_TRUNCATION) max String(MAX_TRUNCATION)` = 1…128, `main.ts:299`). For `effN > 47` the GPU renders only degrees 0…47, yet the readout asserts `Φφ(f) ≈ Σ_{n≤${effN}} bₙ Fₙ` (`main.ts:533`) and the Faber-root markers `transformRoots(poly)` (`main.ts:531`) and the CPU fallback (`evalRational`, full `poly`) use the *full* degree. A high-degree polynomial/rational input (e.g. `z^60` via the expr box, which routes through the exact `=` rational path) overflows the same way while labeled `=`.
- **Why it matters:** For a slowly-converging `f` (nearest singularity just outside the disk, `R ≈ 1.05`), the dropped terms `n = 48…128` are *not* negligible near ∂K (`R^{-47} ≈ 0.1`), so the GPU image visibly stops changing past N≈48 while the readout, root markers, and CPU path keep advancing — an internally inconsistent, mislabeled render. The K-mask hides it for fast-decaying `f`, which is why it likely went unnoticed.
- **Recommendation:** Either cap the *rendered/claimed* order at `MAXC-1` (clamp `N`/`effN` and adjust the readout), or raise `MAXC` — but note raising it to 128 makes `uNum[128]+uDen[128]` ≈ 256+ uniform vectors, over the WebGL2-guaranteed `GL_MAX_FRAGMENT_UNIFORM_VECTORS` floor of 224, so clamping N (documented in the readout) is the safe fix. Test: set the deltoid domain, `f = 1/(z-1.05)`, N=120; assert the GPU pixel buffer equals the CPU `evalRational` render on ∂K to a tolerance the degree-47 truncation cannot meet (they will diverge).

### [MEDIUM] "Corner images wₖ = φ(zₖ)" is contradictory notation — math is correct, but it invites a silent `Q_{n,m}` corruption
- **Area:** @cas/faber + apps/faber-transform · **Location:** `packages/faber/src/weighted.ts:20`, `apps/faber-transform/src/polygon.ts:72`, `src/presets.ts:82-83`, `src/faber.ts:201`, `src/main.ts:408`
- **Type:** stale-doc / convention · **Confidence:** high (that it is misleading; the computation is correct)
- **Fix-safety:** safe-now (comment-only edits)
- **Evidence:** `weighted.ts:20`: *"The corner images w_k = φ(z_k) are the exterior Schwarz–Christoffel prevertices' reciprocals (w_k = 1/u_k, |w_k| = 1)."* But the package's own `ExteriorMap` φ maps **𝔻\* → Ω** (`types.ts:8-13`), so `φ(prevertex zₖ)` is a **polygon corner on ∂K** (`|·| ≠ 1`), not `1/uₖ`. The value actually fed is `polygon.ts:124-127`, `cornerImages = fit.prevertices.map(u ⇒ 1/u)` (the z-plane prevertices, `|w| = 1`) — which is the *correct* weighted-Faber data. So `w_k = φ(z_k)` only makes sense if `φ` secretly denotes the inverse map Ω→𝔻\* (the paper's φ) and `z_k` denotes the corner — the opposite of the package's convention. The phrasing is copy-pasted across five files.
- **Why it matters:** The brief flagged exactly this weight for a silent-corruption risk. The branch itself is fine (verified below), but a maintainer trusting the comment **and** the package's φ=𝔻\*→Ω convention could "correct" the app to pass `evalPhi(map, prevertex)` (the true corners, `|w|≠1`) into `weightSeries`, which would silently produce the wrong `G_m` (wrong magnitudes, and the series `(1−wₖ·s)^{1/m}` would no longer be the intended prevertex product) — corrupting every `Q_{n,m}` with no test catching it (the package tests only ever pass roots-of-unity, `weighted.test.ts:20-21`).
- **Recommendation:** Rewrite the comments to state plainly: `wₖ` are the **z-plane prevertices** `= 1/uₖ` on `|w|=1` (equivalently the *external* images `Φ(cornerₖ)` under the inverse map), the series variable is `s = 1/z` on `𝔻\*`, and `Gₘ = ∏ₖ(1 − wₖ/z)^{1/m}`. Do **not** call them `φ(zₖ)` under this package's φ.

### [LOW] The `=` "exact rational image" path roots the denominator numerically (Durand–Kerner + 1e-4 clustering)
- **Area:** @cas/faber + apps/faber-transform · **Location:** `packages/faber/src/rational.ts:117-141` (`partialFractions` → `polynomialRoots`), `rational.ts:92` (`clusterRoots(tol = 1e-4)`), `apps/faber-transform/src/main.ts:499-505` (badge `exactBadge`, readout "exact rational image on K")
- **Type:** numerical / honesty · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** For a closed-form domain the expr rational branch is labeled `=` / "exact rational image on K", but `faberTransformRational` obtains the input's poles by `polynomialRoots(denT)` (Durand–Kerner, numerical) and then **merges roots within `1e-4`** (`clusterRoots`). The image is exact *given* those poles, but the poles are approximate, and two genuinely-distinct poles closer than `1e-4` are silently merged into one higher-multiplicity pole.
- **Why it matters:** The honesty guardrail reserves `=` for exact results. For the shipped presets (`1/(z-2)`, `1/(1+z²/4)` — low degree, well-separated) the roots are machine-exact so `=` is defensible, but a user-typed rational with a high-degree or near-coincident denominator gets a numerically-rooted, possibly mis-clustered image still stamped `=`.
- **Recommendation:** Either downgrade to `≈` when `den` degree exceeds a small threshold (or when a cluster absorbed >1 root at a non-trivial gap), or word the readout as "exact given the located poles". Test: `f = 1/((z-2)(z-2.00005))` — the two poles cluster into a double pole, changing the image, while the badge stays `=`.

### [LOW] `packages/faber/README.md` export table is stale/incomplete (misses the entire M3 + rational surface)
- **Area:** @cas/faber · **Location:** `packages/faber/README.md:14-24`
- **Type:** stale-doc · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** The "What it does" table lists only `faberPolynomials`, `faberTransform`, `polynomialRoots`, `formatFaberPoly`, `faberConvergence`. It omits the actually-exported `weightedFaberPolynomial(s)` / `weightSeries` (M3), `faberTransformRational` / `partialFractions`, and `faberImageOfPole` / `exteriorMapJet` / `evalRationalImage` (all in `index.ts:17-22`). Line 24 also says the app "passes each curated preset's **closed-form** Laurent", which no longer covers the polygon domains (truncated SC series, `polygon.ts`).
- **Why it matters:** The README is the package's front door; the corner-suppression engine and the exact rational-image path — the newest, most subtle code — are invisible in it.
- **Recommendation:** Add the missing rows and soften the "closed-form Laurent" line to include the truncated exterior-SC (`≈`) polygon path.

### [LOW] Docs say polygon coords "≤ 20"; the code enforces `MAX_POLYGON_COORD = 2`
- **Area:** apps/faber-transform · **Location:** `apps/faber-transform/src/viewState.ts:52-53`, vs `CLAUDE.md` (Status, "coords ≤ 20") and `docs/design/faber-polygonal-sc-plan.md:143` (M2 bullet, "coords ≤ 20")
- **Type:** stale-doc · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** `viewState.ts:53` sets `MAX_POLYGON_COORD = 2` ("matches the editor's editable world extent"), and the editor's `VIEW_HALF = MAX_POLYGON_COORD + 0.3` (`polygonEditor.ts:13`) confirms 2 is intended. Two design docs say the permalink bound is "coords ≤ 20".
- **Why it matters:** A reader sizing an external `#vs=` link or reasoning about the crafted-link safety bound gets a 10× wrong figure.
- **Recommendation:** Change "≤ 20" to "≤ 2" in `CLAUDE.md` and `faber-polygonal-sc-plan.md` (the code is self-consistent).

### [LOW] No `c > 0` guard before `transformCoeffs` on a converged+finite polygon fit (`faberPolynomials` throws, uncaught)
- **Area:** apps/faber-transform · **Location:** `src/main.ts:414-418` (the `finite` guard), `src/main.ts:446` (`transformCoeffs`/`weightedMonomialCoeffs`), vs `packages/faber/src/recurrence.ts:21-23`
- **Type:** bug · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** The custom-polygon guard accepts the fit when `r.converged && finite`, where `finite` only checks `Number.isFinite` on `c` and every laurent entry. `faberPolynomials` additionally requires `c > 0` and **throws** otherwise (`recurrence.ts:22`). The monomial/rational/series branches call into it with no `try/catch` around `computeModel()` (`main.ts:619`), unlike the rational branch which is wrapped (`main.ts:498-509`).
- **Why it matters:** A converged, finite, but non-positive-capacity fit (`c = 0`, e.g. a near-degenerate solve) would throw out of `render()` and break the app rather than showing the `⚠` blank panel. In practice the capacity of a valid converged polygon is positive, so this is a latent/near-unreachable edge, not an observed crash.
- **Recommendation:** Fold `r.map.c > 0` into the `finite` predicate (`main.ts:414`) so a non-positive capacity takes the existing `⚠`-blank path.

### [NIT] `regularPolygonMap` comment says "capacity = |C|" but returns `c: C`; `C` is unvalidated
- **Area:** apps/faber-transform · **Location:** `src/polygon.ts:14,59`
- **Type:** style/stale-doc · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** The header says "capacity = |C|" but the return is `{ c: C, ... }` (not `|C|`), and `C` is never checked `> 0`. Correct only because every caller uses the default `C = 1`. Recommend returning `Math.abs(C)` for `c`, or asserting `C > 0`, to match `ExteriorMap`'s `c > 0` contract.

### [NIT] Monomial degree slider max is hardcoded `"12"` while the state/permalink bound is `MAX_DEGREE = 40`
- **Area:** apps/faber-transform · **Location:** `src/main.ts:273` (`max: "12"`) vs `viewState.ts:40` + `main.ts:718` (clamp to `MAX_DEGREE = 40`)
- **Type:** style · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** The slider caps at 12, but decoded links and the input clamp allow up to 40. A shared `degree: 40` link renders `F₄₀` correctly yet the slider snaps its displayed value to 12. Harmless (render uses state, not the slider), but the ranges should agree — either raise the slider `max` to `String(MAX_DEGREE)` or lower `MAX_DEGREE`.

### [NIT] `radiusOfConvergence` entire-detection can misclassify a large finite R as ∞
- **Area:** apps/faber-transform · **Location:** `src/faber.ts:141`
- **Type:** numerical · **Confidence:** low · **Fix-safety:** needs-review
- **Evidence:** `if (last > 4 && last > 1.5 * first) return Infinity;` reports "entire" whenever the reliable-coefficient ratios climb, which a function with large-but-finite `R` (and a mild prefactor) can trigger. Impact is confined to the readout wording ("f entire") and the FFT sample-radius choice (falls back to the safe probe radius 0.9 < R), so the render stays correct; only the reported R is cosmetically wrong.

---

## Verified correct (scrutinized per the brief; no action)

- **Faber recurrence** (`recurrence.ts:42-53`): derived from `ψ'(w)/(ψ(w)−ζ) = Σ Fₙ(ζ)w^{−n−1}`; equating `w^{−m}` gives `c·F_{n+1} = (ζ−c₀)Fₙ − Σ_{k=1}^{n} cₖF_{n−k} − n·cₙ` **exactly** as coded, including the subtle `−n·cₙ` constant-term correction. Disk (`cₖ=0 ⇒ Fₙ=ζⁿ`) and Joukowski (`c₁=1 ⇒ F₂=ζ²−2, F₃=ζ³−3ζ`) special cases confirmed by hand.
- **Exact rational pole image** (`exteriorMap.ts:64-93`): `terms[k−1] = [s^{m−1}](Φ(s)^{k−1}Φ'(s))` is `Res_{s=0}[s^{−m}Φ^{k−1}Φ']`, the correct principal-part coefficient; matches the `∂/∂z₀` derivatives of the Cauchy-kernel transform for m=1,2. Derivative jet `exteriorMapJet` uses the correct rising factorial and `(−1)^j` sign.
- **`Q_{n,m}` fractional-power branch** (`weighted.ts:33-58`): `(1−wₖ·s)^{1/m}` is built via the generalized binomial `Σ C(1/m,j)(−wₖ)ʲsʲ` = the **principal** branch (`=1` at `s=0`); with `|wₖ|=1`, each factor `1−wₖ/z` stays in `Re>0` for `|z|>1`, so the product of principal roots is single-valued on 𝔻\* and equals `Gₘ` with `Gₘ(∞)=1`. The convolution `Q_{n,m}=Σ gⱼF_{n−j}` and `g₀=1` (degree + leading `cap⁻ⁿ` preserved) are correct. **Branch selection is right.**
- **SC-extractor consistency** (`@cas/conformal` `exteriorMapLaurentAtInfinity` / `interiorAngles` vs `@cas/faber`): the `{c, laurent}` convention matches (`laurent[k]=cₖ`, `c=|C|>0`, `c₀=0`); `interiorAngles` returns `αₖ` in units of π (matching `cornerNorms` `Λₖ=max{αₖ,2−αₖ}` and the extractor exponent `1−αₖ`); the M1a closed form `laurent[nm−1]=C·dₘ/(1−nm)` reproduces the general extractor; and `cornerImages = 1/uₖ` gives `|w|=1`, the correct weighted-Faber data. I re-derived the extractor's `cₖ=−|C|·g_{k+1}/k` (with `C=−cap`, no-log `g₁=0`) and it is consistent.
- **Honest labeling**: polygon domains force `≈` (`main.ts:432`, even for rational `f`, per plan §6 — a conservative downgrade); degenerate/non-converged fits render `⚠` with blank panels (`main.ts:415-417`); non-converged Durand–Kerner returns `[]` roots rather than scatter (`faber.ts:251-255`). The cornerProfile plots `|Fₙ|` on ∂K, which equals the theorem's `|φ⁻ⁿFₙ|` there because `|φ|=1` on the boundary — correct.
- **ADR-0007 second-consumer**: QD genuinely consumes `@cas/faber` (`apps/quadrature-domains/package.json:18` `workspace:*`; `faber-analysis.mjs:1-13` delegates to the package). No duplication to consolidate; the app-only exports (transform/weighted/rational) cohabit the package correctly per ADR-0007.

## Coverage

**Examined in full:** all of `packages/faber/src/*` (recurrence, weighted, rational, exteriorMap, transform,
convergence, roots, format, types, index) and its `weighted.test.ts`; all of `apps/faber-transform/src/*`
(faber, polygon, presets, series, main, viewState, render/{gpu,coloring,cornerProfile,polygonEditor}); the
`@cas/conformal` exterior boundary (`exteriorSchwarzChristoffel.ts` extractor, `scParameterProblem.ts`
`interiorAngles`); ADR-0024 and `faber-polygonal-sc-plan.md`; both READMEs; the QD adapter.
**Cross-referenced:** the 2026-07 prior review (Faber post-dates it; only unrelated QD `faber-analysis.mjs`
hits — no regressions to flag).
**Did NOT deep-read:** the CPU `coloring.ts` enhancement/`fwidth`-free shading branches (rendering, not
math; shared `@cas/gpu` GLSL is another agent's scope), `render/plane.ts` (pan/zoom), and `series.ts`'s full
special-function recurrence set (spot-checked `exp`/`log`/`sin`/`pow-scalar` — standard and correct;
did not exhaustively verify `tanh`/`sinh` closure). I did **not** execute any code (read-only); the two
numerical suspicions (GPU truncation, "exact" rational label) include concrete tests to confirm them.
