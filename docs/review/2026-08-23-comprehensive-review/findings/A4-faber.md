# A4 FABER — re-review of `apps/faber-transform` + `@cas/faber`

Scope: the Faber Transform app and the `@cas/faber` package, with heaviest scrutiny on the
unreviewed churn since 2026-08-17 — PR #293 (typeset UI math + `formatFaberPoly` `sup` option),
#295 (in-panel polygon editing + flat-hue default + neutral blank panel + badge colour), #296 (fix
"in-panel editing moving the wrong vertex"), plus `packages/faber/src/format.ts` and
`packages/expr/src/glsl.ts` recent changes. I read the full #296/#295/#293 diffs, `handleEdit.ts`,
`polygon.ts`, `mathText.ts`, `format.ts`, `render/{gpu,coloring,plane,polygonEditor}.ts`, the
`@cas/conformal` exterior-SC solver boundary (`exteriorScParameterProblem.ts` /
`exteriorSchwarzChristoffel.ts`), and cross-referenced the prior review
(`docs/review/2026-08-suite-review/findings/04-faber.md`). **Headline: the #296 fix is correct and
complete, the GPU/CPU cap parity fix still holds, and the recent churn introduced no math
regressions.** Findings are one new low-severity behavioural gap, several confirmed-still-open prior
items (chiefly the corner-image comment contradiction, which the "fix" only partially applied), and
notes on prior items now genuinely fixed. No CRITICAL/HIGH; no convention (π/2πi) issue.

---

### [LOW] Corner-image "wₖ = φ(zₖ) on |w| = 1" contradiction is only partially fixed — 6 sites still open, INCLUDING a package-internal one the fix missed
- **Area:** @cas/faber + apps/faber-transform · **Location:** `packages/faber/src/weighted.ts:50`, `apps/faber-transform/src/polygon.ts:72,81`, `src/presets.ts:82`, `src/faber.ts:201`, `src/main.ts:459`
- **Type:** stale-doc / convention · **Confidence:** high · **Fix-safety:** safe-now (comment-only)
- **Evidence:** The prior review flagged (its finding #2, MEDIUM) that "the corner images wₖ = φ(zₖ) on |w| = 1" is contradictory: under this package's own `φ: 𝔻*→Ω` (`types.ts`), `φ(prevertex)` is a polygon corner on ∂K (`|·| ≠ 1`), not `1/uₖ`. The `weighted.ts` **module header** (lines 20-21) was corrected to "the z-plane SC prevertices w_k = 1/u_k on |w_k| = 1 (NOT φ(z_k) — …)". But the fix stopped there. Still contradictory:
  - `weighted.ts:50` (the `weightSeries` JSDoc, **inside the very package that claims to be fixed**): *"where `cornerImages` are the corner images w_k = φ(z_k) (|w_k| = 1)."*
  - `polygon.ts:72` — #296 rewrote this line for ordering but kept *"The corner images wₖ = φ(zₖ) on |w| = 1 — the exterior-SC prevertex reciprocals (wₖ = 1/uₖ)"*, now stating both the contradictory and the correct form in one sentence.
  - `polygon.ts:81`, `presets.ts:82`, `faber.ts:201`, `main.ts:459` — all still `wₖ = φ(zₖ) on |w| = 1`.
- **Why it matters:** The brief asked me to confirm whether the 4 app-side echoes were auto-applied. They were **not**, and additionally the package's own `weightSeries` JSDoc was missed. The latent-corruption risk the prior review named stands: a maintainer trusting `w_k = φ(z_k)` + the package's `φ=𝔻*→Ω` convention could "correct" the app to feed `evalPhi(map, prevertex)` (true corners, `|w|≠1`) into `weightSeries`, silently corrupting every `Q_{n,m}` — no test catches it (`weighted.test.ts` only passes roots-of-unity). The computation itself remains **verified correct** (see below).
- **Recommendation:** Apply the corrected phrasing (already in `weighted.ts:20` and the package README) to all six sites: `wₖ` are the **z-plane prevertices `= 1/uₖ`** on `|w|=1`; `Gₘ = ∏ₖ(1 − wₖ·s)^{1/m}`, `s = 1/z`. Do not write `φ(zₖ)` under this package's φ.

### [LOW] In-panel drag commit stores the reshaped polygon WITHOUT the `toCCW` normalization the sidebar editor applies
- **Area:** apps/faber-transform · **Location:** `src/main.ts:772-774` (`commitVertexDrag`), vs `src/render/polygonEditor.ts:136` (`emit = () => onChange(toCCW(...))`) and `packages/conformal/src/exteriorScParameterProblem.ts:51-62` (`toExteriorOrder` reverses unconditionally, assuming CCW)
- **Type:** bug · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** The sidebar `createPolygonEditor` commits every change through `toCCW(verts…)`, so `state.customPolygon` from that path is always counter-clockwise. The new in-panel path does not: `commitVertexDrag` builds `next = raw.map((v,i) => i===index ? [clamp…] : …)` and calls `commit({…, customPolygon: next})` with **no** orientation normalization. `polygonMap → fitExteriorSchwarzChristoffel → solveExteriorParameterProblem → toExteriorOrder` reverses `[v₀,v₁,…]→[v₀,v_{n-1},…,v₁]` **unconditionally** and reads `interiorAngles` off the raw input — both correct only for CCW input. A drag that pulls one vertex across the polygon so the signed area flips sign yields a CW `next`; the solve then gets exterior (reflex) angles and a mis-reversed order.
- **Why it matters:** The honesty guardrail catches the consequence — a CW/degenerate `next` drives a non-convergent fit and the panel shows the `⚠` "polygon fit failed" blank (`main.ts:468-470`) — so nothing is *mislabeled*. But it is strictly less robust than the sidebar editor, which would have auto-repaired the same shape to a valid reflected polygon. The user sees an unexplained failure for a drag the sidebar handles.
- **Recommendation:** Run `next` through the same CCW normalization before commit (extract `toCCW`/`signedArea2` from `polygonEditor.ts` — a second consumer now exists, a small ADR-0007-clean shared helper), or have `solveExteriorParameterProblem` orient-check its input instead of assuming CCW.

### [LOW] In-panel edit silently no-ops (no feedback) when the defensive residual guard or a degraded fit refuses the drag
- **Area:** apps/faber-transform · **Location:** `src/handleEdit.ts:97-98` (`if (resid > 0.15 * extent) return null`), `src/main.ts:766-769` (`if (!rawV …) { render(); return; }`)
- **Type:** style / UX · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** `commitVertexDrag` discards the drag (repaints the committed model, vertex snaps back) whenever `rawVertexFromHandleDrag` returns null — undetermined similarity, `|a|≈0`, **or** the #296 residual guard `resid > 0.15·extent`. The guard's premise (handles ≈ a·raw + b) is sound and for converged fits the residual is ~6e-5 (per `polygon.test.ts`), so 15% is generous. But `handles[i] = evalPhi(r.map, cornerImages[i])` uses the **truncated** Laurent map; on a strongly reentrant / `degraded` (crowding) fit the truncation can distort the reproduced corners enough that the similarity residual climbs, and then *every* drag on that polygon is refused with no visible cue.
- **Why it matters:** A user editing a reentrant custom domain can find the handles simply unresponsive. Correctness is preserved (better to refuse than scramble), but the failure is silent.
- **Recommendation:** When a drag is refused, surface it (e.g. `editor.setStatus("edit refused — fit too degraded to map back", true)` or a brief handle flash) instead of a bare no-op.

### [LOW] (confirmed still-open, prior finding) No `c > 0` in the custom-polygon `finite` guard — `faberPolynomials` can throw uncaught
- **Area:** apps/faber-transform · **Location:** `src/main.ts:467` (`finite = Number.isFinite(r.map.c) && …`), vs `packages/faber/src/recurrence.ts` (throws unless `c > 0`)
- **Type:** bug · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** Unchanged since the prior review flagged it (its finding #6). The guard accepts a converged, finite fit with `c ≤ 0`; the monomial/series/pole branches then call `faberPolynomials`/`transformCoeffs`/`weightedMonomialCoeffs` with no try/catch (unlike the rational branch at `main.ts:569-584`), so a non-positive capacity throws out of `render()` instead of taking the `⚠`-blank path.
- **Why it matters:** Latent — a valid converged polygon has positive capacity, so this is near-unreachable in practice.
- **Recommendation:** Fold `r.map.c > 0` into the `finite` predicate.

### [NIT] (confirmed still-open, prior finding) Monomial degree slider max hardcoded `"12"` while `MAX_DEGREE = 40`
- **Area:** apps/faber-transform · **Location:** `src/main.ts:318` (`max: "12"`) vs `viewState.ts:40` (`MAX_DEGREE = 40`)
- **Type:** style · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** Unchanged since the prior review (its NIT). A decoded `#deg=40` link renders `F₄₀` correctly (render reads state) but the slider snaps its displayed value to 12. Ranges should agree — raise the slider `max` to `String(MAX_DEGREE)` (and note `MAX_DEGREE = 40 < GPU_COEFF_CAP = 48`, so it fits the GPU cap).

---

## Verified correct / clean (scrutinized per the brief; no action)

- **#296 "moving the wrong vertex" fix — CORRECT AND COMPLETE.** I traced the full index chain end-to-end. `exteriorScParameterProblem.ts` `toExteriorOrder` produces `orderedVertices = [v₀, v_{n-1}, …, v₁]` as **exact references** to the input vertices (`verts[k] = vertices[(n-k)%n]`), and `buildExteriorForwardMap` returns `prevertices` **unreordered**, so `fit.prevertices[k]` aligns with `fit.orderedVertices[k]`. `polygon.ts:126-149` then places `cornerImages[nearestInput(orderedVertices[k])] = 1/uₖ`; because `orderedVertices[k]` is an exact input coordinate, `nearestInput` is a distance-0 match, so `cornerImages[i]` is unambiguously the image of input vertex `i`. Downstream, `handles[i] = evalPhi(map, cornerImages[i])` is the canonical image of `customPolygon[i]`, and `rawVertexFromHandleDrag(raw=customPolygon, canonical=handles, world)` fits an index-matched `handles[i] ≈ a·raw[i] + b` and inverts `raw = (world−b)/a` (algebra verified: `(px·aRe+py·aIm)/|a|²`, `(py·aRe−px·aIm)/|a|²`). No off-by-one, no stale index (the drag freezes `model`; no re-solve between down and up). The added residual guard is a sound defensive check. Golden + guard tests (`polygon.test.ts`, `handleEdit.test.ts`, `exteriorScParameterProblem.test.ts`) cover the fix.
- **"Editing on the other pane" — non-issue for this app.** In-panel editing is attached **only** to the right/K panel (`attachNav(right.panel.ov, "wView", {…})`); the left panel (𝔻, domain of f) gets no edit hooks. K is the pane that shows the edited domain, so there is no cross-pane mapping to get wrong (unlike Riemann Map). Left/right pan + right-panel pan for presets all still work (verified the `attachNav` refactor: `edit` undefined ⇒ `handleAt` returns −1 ⇒ pan path).
- **GPU/CPU cap parity — STILL CONSISTENT (prior MEDIUM #1 fixed).** `MAX_TRUNCATION = GPU_COEFF_CAP − 1 = 47 < MAXC = GPU_COEFF_CAP = 48` (`viewState.ts:48-51`, `gpu.ts:23`), `MAX_DEGREE = 40 < 48`, and `capForGpu` (`main.ts:500-506`) clamps num/den to the cap and downgrades the badge `=`→`≈` with an honest "truncated to degree 47 (GPU coefficient cap)" readout. All paths (GPU · CPU `evalRational` · root markers · readout) agree.
- **`format.ts` `sup` option — default genuinely unchanged.** `const sup = opts.sup ?? ((k) => superscript(k))` (line 29); with no `opts.sup` the Unicode-superscript behaviour is byte-identical to before.
- **`mathText.ts` — safe and correct.** Content is set only via text nodes / `<sub>`/`<sup>` elements (never innerHTML), so there is no markup-injection surface even for dynamic parser-error text; a lone `_`/`^` not followed by `{` passes through literally. Grammar is non-nested but all readout markup is non-nested (`z^{n}`, `Q_{n,m}`, `Σ_{n≤…}`).
- **`glsl.ts` peephole (`emitAbsSquaredCompare`) — algebraically correct, zero Faber impact.** For `op` an ordering and real constant `k ≥ 0`, `|E| op k ⟺ |E|² op k²` (monotonic squaring on [0,∞)), and `cabs2(E)=|E|²`; the `k ≥ 0` guard is required (a negative `k` correctly falls through to the real-part compare). Faber uses `@cas/expr` only for `parse`/`makeComplexFn`/`fToRational` + AST series arithmetic — it never invokes the GLSL codegen (its shader is `@cas/gpu` `PHASE_COLORING_GLSL` over hand-written Horner loops), so this change cannot affect Faber output.
- **#295 blank-panel NaN + flat-hue default — correct.** `blankPanel.g` now returns `{NaN,NaN}`; `fillPhasePortrait:112` and `phaseColor:80` both guard non-finite → neutral background (not arg-0 red). The opaque (alpha 255) CPU overlay fully covers any stale GPU portrait beneath. `enhance: 0` (flat) is a valid documented mode on both CPU (`enhancement` returns 1) and GPU; existing `#vs=` links keep their stored `coloring`.
- **Perf — well-behaved, no regression.** The SC solve is memoized (`getCustomMap` keys on `JSON.stringify(poly)`), so panning a custom-polygon view reuses the fit; the refit runs once on drag *release* (`commitVertexDrag`), not per pointermove (preview only repaints the frozen portrait + overlay). Permalink writes stay debounced (200 ms). The O(n²) `nearestInput` reorder is on n ≤ 16.
- **Core Faber math — unchanged since the prior review verified it.** `recurrence.ts` (incl. the `−n·cₙ` term), `weighted.ts` `Q_{n,m}` / `1/m`-principal-root branch, `rational.ts`, `exteriorMap.ts` jets, and `exteriorSchwarzChristoffel.ts` extractor were not touched by #293/#295/#296 (all dated 2026-08-22 03:55; only `format.ts` changed). The `weightSeries` product `∏ₖ(1−wₖ·s)` is order-agnostic, so #296's reordering of `cornerImages` cannot change `Q_{n,m}`.
- **Prior items now genuinely FIXED:** the "coords ≤ 20" doc drift → `faber-polygonal-sc-plan.md:143` now reads "coords ≤ 2 — `MAX_POLYGON_COORD`" (and CLAUDE.md no longer states 20); `packages/faber/README.md` export table now lists the full M3 + rational surface with the **correct** `w_k = 1/u_k` weight phrasing.

## Coverage

**Examined in full:** the #296/#295/#293 diffs; `apps/faber-transform/src/{handleEdit,polygon,mathText,main(edit+model+nav sections),viewState(caps)}.ts`; `render/{gpu,coloring,plane,polygonEditor}.ts`; `packages/faber/src/{format,weighted}.ts` + `index.ts` export surface; `@cas/conformal` `exteriorScParameterProblem.ts` + `exteriorSchwarzChristoffel.ts`; the `glsl.ts` peephole; both READMEs and the polygonal-SC plan doc; the #296/#295/#293 tests. Cross-referenced the prior Faber review and the root CLAUDE.md status.
**Did NOT deep-read (unchanged by this churn; prior review verified):** the interiors of `recurrence.ts` / `rational.ts` / `exteriorMap.ts` numerics (re-derivation), `series.ts` special-function recurrences, `cornerProfile.ts`, and the shared `@cas/gpu` GLSL (another agent's scope). Did not execute code (read-only); the reasoning for the LOW findings includes the reproduction path.
