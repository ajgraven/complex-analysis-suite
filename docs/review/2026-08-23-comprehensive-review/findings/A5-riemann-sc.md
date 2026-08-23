# A5 RIEMANN-SC — Riemann Map app + `@cas/conformal` Schwarz–Christoffel review (re-review)

Scope: the Riemann-map studio (`apps/riemann-map/src/*`) and its use of the `@cas/conformal` interior/exterior
SC engine, with heaviest scrutiny on the unreviewed churn since 2026-08-17 — PR #285 (SC studio: reentrant
presets, exact-both-directions, prevertex viz, draggable editor), #286 (degenerate-polygon crash guard +
label/doc fixes), #288 (exterior-disk preset gallery + interactive image pane), and the #296 conformal change
(`exteriorScParameterProblem.ts` `orderedVertices`). Cross-referenced against
`docs/review/2026-08-suite-review/findings/03-conformal-riemann-map.md`. **Headline: I found no hard numerical
or correctness bug in the new churn.** The draggable editor is not subject to the #296 wrong-vertex class of
bug (the interior engine preserves input vertex order, unlike the exterior one), the crash guard covers the real
throw source, and the "both directions exact for polygons" claim is genuinely backed by the code. Findings are
honest-labeling / doc / perf nits, plus two prior findings still open.

---

### [LOW] Region/domain method-card still says "machine precision" while the app solves at `nGaussLegendre: 12` (prior finding still open)
- **Area:** apps/riemann-map · **Location:** `apps/riemann-map/src/main.ts:568` (domain-map desc), `:666` (region desc); solve order set at `:280`, `:284`
- **Type:** convention (honest-labeling)
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** `solvePolygon` runs the precise SC solve with `{ mode: "precise", nGaussLegendre: 12 }` (half the
  engine default 24, for interactivity). Both cards hard-code a machine-precision claim: computeDomain's desc
  ("…it reaches machine precision even at the reentrant corners…", `:568`) and fitRegion's desc ("…machine
  precision, with meaningful prevertices & accessory constants.", `:666`). This is the same overclaim the prior
  review flagged (03, LOW #5, then at `main.ts:497-517`); #285 relocated the 12-node solve into `solvePolygon`
  but kept the "machine precision" wording. The displayed `residual` (`≈`) IS honest, and the shipped presets are
  verified to ≥8 digits at nGL=12 (`test/domains.test.ts:115-129`), so this is latent, not wrong for shipped
  content — but a hand-dragged crowded custom polygon can report `converged: true` with interior pushforward
  accuracy below "machine precision."
- **Why it matters:** "machine precision" next to a deliberately reduced-quadrature fit is exactly the fixed-label
  overclaim the honesty guardrail warns against; the residual number rescues it but the prose does not.
- **Recommendation:** Soften both descs to "≈ machine precision (subject to quadrature order)", or drop "machine
  precision" and let the `≈ residual` stat carry the accuracy.

### [LOW] Ω→𝔻 hover discards the SC inverse's `converged`/`residual`, so a query outside Ω shows a silent wrong preimage
- **Area:** apps/riemann-map · **Location:** `apps/riemann-map/src/main.ts:536-541` (domainMap.eval) consumed at `:1316-1324`
- **Type:** convention (honest-labeling)
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** #285 made the app call the exact SC inverse for the domain-map direction: `domainMap.eval = (z) =>
  sc.inverseWithStatus([z[0], z[1]]).w` — it keeps only `.w` and throws away the `converged`/`residual` that
  `inverseWithStatus` was specifically added to expose (`scMap.ts:60-63`, `schwarzChristoffel.ts` ODE+Newton).
  The domain-map hover then prints `f(z)` (plain) and `|f(z)|` (`≈`) under a method card tagged "exact inverse"
  (`:566`). A hover point outside Ω, or a Newton stall near a reentrant corner, returns a wrong preimage with no
  ⚠ marker — the honest signal exists and is dropped. (The prior review's LOW #4 called this a package-API gap
  "not a live app defect" because the app only called `sc.forward` then; #285 turned it into a live surface.)
- **Why it matters:** The panes tempt hovering just off ∂Ω; the readout reads as authoritative under an "exact
  inverse" label even when the inverse did not converge.
- **Recommendation:** Have `domainMap.eval` return the status (or a NaN sentinel when `!converged`) and prefix the
  hover `f(z)` with `≈`/`⚠` when the round-trip residual is above tol or `|w| > 1 + ε`.

### [LOW] Crash guard covers throws + coincident vertices, but no explicit simple-polygon check for self-intersecting / zero-area drags
- **Area:** apps/riemann-map · **Location:** `apps/riemann-map/src/main.ts:273-293` (`solvePolygon`), `:1409-1416` (drag `move`); test `test/domains.test.ts:101-113`
- **Type:** bug (robustness / honesty) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** The #286 guard wraps the precise solve in try/catch → non-throwing lightning fallback, and the
  regression test pins the coincident-vertex case (precise throws, fast does not, `:111-112`). But a drag can
  produce a **self-intersecting** (bowtie) or **collinear/zero-area** polygon that does NOT throw: `toCCW`
  (`domains.ts:164-173`) only inspects the signed-area sign and cannot un-cross a non-simple polygon, and a
  bowtie's `Σαₖ ≠ n−2` makes the parameter solve fail to reach tolerance → `converged: false` → the card reads
  "check residual" rather than warning the shape is not a valid Jordan domain. A collinear drag drives
  `lightningFit`'s `areaCentroid` (`scMap.ts:88-103`) to divide by ~0 → a NaN map, which the overlay's finite
  guards (`overlay2d.ts:105,127`) skip silently. No crash (the guard's stated goal is met), but a non-simple
  shape can render a plausible-looking wrong map, and the test corpus only exercises coincident vertices.
- **Why it matters:** The studio is exploratory; a self-intersecting polygon has no conformal map, yet the UI can
  present one without a distinct "not a simple polygon" signal.
- **Recommendation:** Add a cheap segment-crossing / near-zero-area simplicity test on the custom polygon (reuse
  `analysis/univalence.ts`'s `polylineSelfIntersects`) and surface a `⚠ non-simple polygon` state; extend the
  regression test to a bowtie and a collinear triple.

### [LOW] Exterior SC map sign-convention comment still says `φ(z) ~ C·z` (should be `−C·z`) (prior finding still open)
- **Area:** packages/conformal · **Location:** `packages/conformal/src/exteriorSchwarzChristoffel.ts:11`, `:91`
- **Type:** convention (doc) · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** `Ψ'(u) = C·full(u)` with `full ≈ u⁻²` near `u=0` ⇒ `Ψ(u) ≈ −C·u⁻¹`, and `z = 1/u` ⇒ `φ(z) ~ −C·z`
  at ∞ (capacity `= |C|` is unaffected). Lines 11 and 91 still assert "φ(z) ~ C·z at ∞". This is exactly prior
  finding 03 LOW #4; the **code is correct** (the Laurent extractor rotates the leading `−C` to `+|C|`, square
  golden `c₃=1/6` passes) — only the two comments are sign-wrong, and they were not fixed. Not consumed by
  Riemann Map (interior-only); flagged as an unfixed package-scope doc landmine for the Faber consumer.
- **Recommendation:** Change both to "φ(z) ~ −C·z at ∞ (⇒ capacity = |C|)".

### [NIT] Every drag frame runs a full lightning re-fit + a full per-cell recolour; the recolour could be release-only
- **Area:** apps/riemann-map · **Location:** `main.ts:1409-1416` (drag→invalidate), `:1087-1095` (schedule), `:633-698` (fitRegion→solvePolygon fast), `:731-751` (computeDiskImage per-cell `activeDeriv`)
- **Type:** perf · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** A vertex `move` sets `regionDirty|domainDirty|diskDirty` and invalidates; the rAF then does (a) a
  fast lightning fit — two `lstsqHouseholder` QR solves (`fitConformalMap` + `fitForwardMap`, ~40 samples/edge ×
  n rows) — every frame, and (b) `computeDiskImage`, which rebuilds all cells AND calls `activeDeriv` (a central
  finite-diff = 2 region-map evals) per cell (18×36 = 648 cells default) for the colour. This is the intended
  "fast mode" interactive path (not a regression), but for a 16-vertex polygon at a dense grid it is heavy per
  frame.
- **Why it matters:** Potential drag jank on larger custom polygons / denser grids.
- **Recommendation:** Optional — during `scDragging`, redraw the moved geometry but defer the per-cell recolour
  (`activeDeriv` loop) to release; and/or downsample the grid while dragging.

### [NIT] Filled cells + per-cell derivative are computed even in line-style and for region/import sources that never draw or fold-check them
- **Area:** apps/riemann-map · **Location:** `main.ts:731-751` vs draw at `:895-896`, fold-check gated at `:773-779`
- **Type:** perf · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** `computeDiskImage` always builds `diskSourceCells`/`diskImageCells` and the `maxMag`/`minBulk`
  `activeDeriv` loop ("always built — the per-cell φ′ also powers the interior critical-point check", `:731`),
  but in **line** style `drawOverlays` draws `diskSrcLines`/`diskImgLines` and never fills the cells (`:895`), and
  for a **region/import** source the fold check is skipped entirely (`diskFoldReason = null`, `:774`). So
  line-style + numeric-source rebuilds the whole filled-cell set and derivative field as dead work. Pre-existing
  (not new churn), but it compounds the drag cost above.
- **Recommendation:** Skip the filled-cell build in line style, and skip the `minBulk`/`maxMag` loop when
  `diskSourceIsNumeric()`.

### [NIT] Image-pane corner hover calls `getBoundingClientRect` once per corner per pointermove
- **Area:** apps/riemann-map · **Location:** `main.ts:1492-1494` (hover loop) and `render/overlay2d.ts:85-89` (`worldToClient`)
- **Type:** perf · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** The image-pane hover loops `rightPane.worldToClient(scCorr.corners[k])` for every corner, and
  `worldToClient` reads `this.canvas.getBoundingClientRect()` on each call — up to n layout reads per mousemove
  over the pane. Cheap when layout is clean, but n× redundant.
- **Recommendation:** Hoist one `getBoundingClientRect()` per event and pass the rect in, or hit-test the pointer
  in world space once (mirror the domain-pane path, which converts the pointer once at `:1442-1444`).

### [NIT] `domains.test.ts` crash-guard comment mis-states the throw mechanism
- **Area:** apps/riemann-map · **Location:** `apps/riemann-map/test/domains.test.ts:102-103`
- **Type:** stale-doc · **Confidence:** medium · **Fix-safety:** safe-now
- **Evidence:** The comment says the coincident-vertex case throws "out of gaussJacobi (interior angle → 0)", but
  for those vertices (`[1,1],[1,1],[-1,-1],[1,-1]`) `interiorAngles` returns αₖ ≈ 1 (the zero-length edge gives
  `atan2(0,0)=0` turns), so the Jacobi exponent is ~0, not near −1. The throw is driven by the zero-length side
  `L[0]=0` ⇒ `L[k]/L[0]=∞` in the parameter residual (`scParameterProblem.ts:129`) → NaN prevertices, not by an
  angle→0 Jacobi-exponent violation. The test's assertion is correct; only its explanatory comment is off.
- **Recommendation:** Reword to "a zero-length side makes the side-ratio residual non-finite → the precise solve
  fails/throws".

---

## Confirmed clean / prior findings resolved (no action)

- **No #296-style wrong-vertex bug in the Riemann-map draggable editor.** The interior engine keeps prevertices
  in **input vertex order** (`scParameterProblem.ts:150` builds them from ascending-θ logits; `scMap.ts:259`
  returns `sol.prevertices`; no `toExteriorOrder` reversal). Only the **exterior** engine reverses
  (`exteriorScParameterProblem.ts:51-62`), which is why #296's `orderedVertices` fix was needed there and NOT
  here. Combined with `toCCW` being a no-op when the polygon is already CCW (`domains.ts:164-173`) and the drag
  invariant of re-CCW-ing on release (`main.ts:1425`), the hit index from `currentDomain().corners` always maps
  to the same physical `customPolygon[k]` (verified for both the Ω-pane `:1437-1458` and image-pane `:1462-1481`
  handlers, and for the named-preset → custom fork in `ensureCustomEditable` `:1393-1401`). `setShape` is a pure
  value setter that fires no `change` event, so it cannot clobber `customPolygon` mid-drag (`controls.ts:650-652`).
- **"Both directions exact for polygons" verified true.** Ω→𝔻 point queries route through
  `sc.inverseWithStatus` (ODE+Newton, `main.ts:538`) and the drawn conformal grid through `sc.forwardMany`
  (`:547-548`); 𝔻→Ω through `sc.forward` (`:654`). Both use the **precise** SC engine when not dragging — not the
  lightning fit. The `#296` `orderedVertices` change to `exteriorScParameterProblem.ts` is correct and does not
  touch Riemann Map.
- **cornerClustering consolidation complete (prior 03 MEDIUM #2 fixed).** `clusteredRadii`,
  `clusteredEdgeSamples`, `outwardCornerDir` now live in `packages/conformal/src/cornerClustering.ts` and are
  consumed by `scMap.ts:21`, `forwardMap.ts:13`, and the app's `domains.ts:9` — the root-exponential law is no
  longer triplicated. No remaining interior/exterior SC duplication of note (the exterior solver reuses
  `prevertsFromLogits`/`logitsFromPrevertices`/`minGap`/`uniformPrevertices` from the interior module and shares
  `gaussNewton.ts`).
- **Crash guard covers the real throw source.** The throw path is `gaussJacobi` in the **precise** solve, which is
  in the try/catch; the **fast** (drag) path uses only lightning `lstsqHouseholder`, which throws solely on
  `m<n`/length-mismatch (`core/src/lstsq.ts:25-26`) — not reachable with ≥40 samples/edge — so the unguarded
  fast branch cannot kill the render loop. Pinned by `test/domains.test.ts:101-113`.
- **Prior stale-doc findings fixed.** The `@cas/conformal` README now marks the exterior engine as shipped and
  lists Faber Transform as its consumer (`README.md:76-77,88-89`; prior 03 MEDIUM #1), and the SC plan doc §8
  now annotates exterior as "since landed" (`schwarz-christoffel-plan.md:301`; prior 03 NIT).
- **Exterior-disk preset gallery (#288) is mathematically correct.** All six `EXTERIOR_MAP_PRESETS`
  (`presets.ts:47-54`) are univalent on 𝔻* with critical points on/inside ∂𝔻 (Joukowski/vslit `z=±1`,
  ellipse `|z|=1/√2`, deltoid/astroid/star `|z|=1`); the ellipse semi-axes (3/2, 1/2) and the (n+1)-cusp
  hypocycloid mapping match the comments. The gallery-swap logic preserves a hand-typed formula and only
  auto-loads a canonical map when leaving a stock preset (`controls.ts:510-525`).
- **Custom-polygon `#vs=` round-trip is defensive.** `sanitizeCustom` (`main.ts:250-259`) enforces 3–40 finite
  vertices, clamps to `MAX_POLYGON_COORD`, and re-CCWs; a coincident-vertex permalink boots through the guarded
  precise→fast fallback (confirmed by the #286 headless note). `syncShapeState` serialises `customPolygon` only
  when the shape is custom.

## Coverage

**Examined in depth:** `main.ts` — `solvePolygon` (fast/precise/warm-start/cold-retry/try-catch), `computeDomain`,
`fitRegion`, `computeDiskImage`, `schedule`/dirty-flag flow, `diskPolarLines`, `drawCornerDots` (area-centroid
anchor), both pointerdown vertex-drag handlers + `runVertexDrag`/`ensureCustomEditable`/`syncShapeState`, the
hover/hit-test paths, `onShape`/`onEditPolygon`; `domains.ts` (toCCW/makeCustomDomain/cornerBoundary/cornerPoles/
polygonRadius/areaCentroid); `viewState.ts` (encode/decode + guard); `presets.ts`; `ui/controls.ts` gallery-swap
& polygon-tools wiring; `render/overlay2d.ts` client/world transforms + finite-guards; `render/nav.ts` pan-lock
gate. `@cas/conformal`: `scMap.ts`, `scParameterProblem.ts`, `exteriorScParameterProblem.ts` (incl. the #296
diff), `cornerClustering.ts`, `forwardMap.ts` (consolidation), and `@cas/core` `lstsq.ts` (throw behavior).
Cross-checked all against `findings/03-conformal-riemann-map.md`.

**Not deeply re-covered (prior review verified the numerics; unchanged since):** `gaussJacobi.ts`,
`scQuadrature.ts`, `schwarzChristoffel.ts` forward/ODE-inverse internals, `exteriorSchwarzChristoffel.ts` forward
+ Laurent extractor, `vandermondeArnoldi.ts`/`lightning.ts` (re-read only enough to confirm no throw on the fast
path). `interchange/importMap.ts` (CD→RM Böttcher import — different feature, skimmed). `map.ts` finite-diff
(spot-checked `activeDeriv` only). I did not run any code (read-only); the two numeric claims I could not execute
(self-intersecting-polygon behavior; nGL=12 interior accuracy on a crowded custom shape) are flagged with the
reasoning and a concrete test to confirm.
