# A6 — Schwarz dynamics (σ escape-time, CPU + GPU), Riemann sphere, exports, GPU/Schwarz package seams

## Scope covered

**Read end to end:** `app/schwarz/{schwarz-common,schwarz-webgl,schwarz-inverse,schwarz-analysis,
schwarz-render,schwarz-export-plan,schwarz-export}.mjs` (whole), `schwarz-features.mjs` (the PNG-export
+ limit-set/cycle halves), `schwarz-paint.mjs` (colormap/`cpuComputeT`/`paintField`), `schwarz-ui.mjs`
(state, `activeRenderer`, capture, export cards, view-mode switch, renderer select),
`schwarz-interaction.mjs` (wheel/hover/drag), `schwarz-forward.mjs` `findCycles`,
`workers/schwarz-worker-entry.mjs`, `sphere/{README,sphere-common,sphere-webgl,sphere-ui}.mjs`,
`packages/gpu/src/{maskTexture,colormap}.ts`, `apps/complex-dynamics/src/render/schwarzGL.ts:505-531`,
`packages/schwarz`'s QD-facing seam via `vitest/schwarz-differential.test.ts`.
**Docs:** `app/schwarz/README.md`, `app/sphere/README.md`, `PLAN-SPHERE.md` (387 lines),
`SCHWARZ_FORMULATION.md`, `docs/design/SIGMA-HANDOFF.md` (skimmed — producer side only).
**Prior reviews:** `07-quadrature-domains.md` §Schwarz, `A9-corr-schwarz-gpu.md` §Prior-review status.

**Ran:** the QD headless suite, the full QD browser suite, and five purpose-built Playwright probes
against the real GLSL (parity by class, parity by escape-time value, mask-erosion vs zoom, cusp
conditioning, the PQD stale-frame reproduction) plus three node probes (CPU `invalid` census, the
in-Ω/ψ invariant on a boundary band, σ-pole localisation).

**NOT covered, honestly:** the σ level-curve marching squares (`computeSigmaLevelCurves`) beyond a read;
the limit-set chaos game / box-counting numerics beyond a read; the sphere's camera/orbit maths and
hover tooltip were read but not driven in a browser; `schwarz-paint.mjs`'s preimage-tree and z-panel
painters; `explicitSigmaForm`'s LaTeX for the six LQD/PQD families; the interchange σ/φ hand-off
wire format (A-other's scope — I only checked that QD is the producer).

## Health

| Command | Result |
| --- | --- |
| `node app/node-test.js` | **2342 passed, 0 failed** (56.6 s) |
| `pnpm test:browser` (QD) | **4 files / 17 tests passed** (94.4 s); `schwarz-mask` 3/3, `schwarz-export` 6/6 |
| `git status --short` (final) | empty |

Probe harness: a scratch Vite bundle of the app's solver graph + `schwarz-common` + `schwarz-webgl`,
served over a local http server and driven with Playwright/Chromium (`/opt/pw-browsers/chromium`,
SwiftShader). Scripts in `scratchpad/scratch/A6/`.

---

## Findings

### SCH-1 [CRITICAL] [confirmed] The conservative in-Ω mask erodes Ω by a FIXED world distance, so the GPU σ picture gets progressively, silently wrong as you zoom — and the erosion applies at every iterate, not just at classification

- **Where:** `app/schwarz/schwarz-webgl.mjs:77` (`MASK_SIZE = 2048`), `:85` (`MASK_PAD = 1.05`),
  `:803-804`, `:834` (`ctx.lineWidth = 2`), `:1069-1090` (mask built once per `setPhi`, never per view);
  the shader's `inOmega()` at `:200-218` is called once per pixel **and once per σ-iterate**
  (`:620-640`). Same defect in the shared primitive: `packages/gpu/src/maskTexture.ts:133-142`
  (`conservativeOmega` stroke, `lineWidth = 2`), consumed by
  `apps/complex-dynamics/src/render/schwarzGL.ts:524-527` at `size: 1024` — *cross-app*.
- **What:** PR #337 fixed the salmon speckle by re-stroking ∂Ω in the NOT-in-Ω colour. That trades an
  unbiased ±½-texel classification error for a **signed** one: a band of Ω exactly one mask texel wide
  is declared Ω^c. For the deltoid the mask texel is **6.665e-4 world units** (measured), and it does
  not change when the camera zooms, so the band is 0.03 screen px at the default framing, **1 screen px
  at ≈7× (900-px canvas), and 41 px at 300×**. Because `inOmega` also decides when an ORBIT has left Ω,
  an orbit that passes within 6.7e-4 of ∂Ω is truncated — so the escape time itself comes out too
  small, everywhere, not just near the boundary.
- **Evidence:**
  - Straddling a *smooth* boundary point `φ(e^{iπ/3}) = 0.125 + 0.2165i`, deltoid, 400², maxIter 64
    (`scratch/A6/probe-band2.js`), CPU float64 exact-polygon engine as reference:

    | zoom vs fit | eroded fraction of Ω | GPU↔CPU class agreement |
    |---|---|---|
    | 1× (half 2.2) | 0.01 % | 100.00 % |
    | 4× | 0.26 % | 99.82 % |
    | 10× | 0.35 % | 99.83 % |
    | 30× | 1.06 % | 99.48 % |
    | 100× | 3.47 % | 98.28 % |
    | **300×** | **10.43 %** | **94.81 %** |

    For scale: the existing browser test's anti-vacuity note rejects a "grossly over-dilated" mask that
    scored **98.87 %** — the *shipped* mask is worse than that at a zoom the app lets you reach.
  - Near the cusp (`cx = 0.7495`, i.e. 5e-4 from the deltoid's cusp at `w = 0.75`), 200², maxIter 64
    (`probe-mask.js`, `probe-sign.js`): at half = 1e-3 the GPU puts **6,333 / 10,000** sampled pixels in
    the wrong class (`fundamental→outside` 4,431, `interior→outside` 1,466) and agrees on **0 %** of the
    remaining escape times (worst |Δn| = 40). At half = 1e-4 the GPU paints **all 40,000 pixels
    "outside"** while the CPU resolves 16 distinct escape classes there.
  - **The mask is the cause, not float32** — the decisive control (`probe-sign.js`): re-running the
    float64 CPU engine with Ω eroded by exactly one mask texel moves agreement from 48.9 % → **82.3 %**
    (half 1e-2) and 11.1 % → **76.1 %** (half 1e-3), and flips the signed error from "GPU always lower"
    (4,751 lower / 0 higher) to symmetric. Conditioning control (`probe-cond.js`): a 1e-7 perturbation of
    `w` changes the CPU escape time for only **0.3 %** of points there (max Δn = 1), so the region is
    well-conditioned and the disagreement is not chaotic sensitivity.
  - Negative control: at half ≥ 0.36 and away from ∂Ω, agreement is 100.0 % and every disagreement is
    `fundamental→outside` — the erosion and nothing else.
- **Why it matters:** the user zooms into the σ tiling — that is what the tab is for — and past ~7× the
  picture is a systematically shrunken Ω with systematically short escape times, labelled nothing. It is
  the RISKS §2 "plausible-but-wrong figure, no error signal" case. The `schwarz/README.md:118-124` claim
  that the cost is "a ≤1-texel outward bias of ∂Ω, which is the accuracy the mask had in any case" is
  true only at the framing the mask was measured at; and `packages/gpu`'s note (`maskTexture.ts:44-45`)
  covers *resolution* but not the signed erosion or its effect on iterates.
- **Fix:** smallest correct change — in the shader, when the mask says NOT-in-Ω, run ψ anyway if the
  point is within one texel of the stroke and accept it as in-Ω if an admissible preimage exists
  (`acceptZ` already decides the sheet exactly, so this is the *exact* test and the mask degrades to a
  fast pre-filter). Cheaper stopgap: rebuild the mask on view change, sizing `MASK_PAD`/`MASK_SIZE` so
  one texel ≤ one screen pixel, and refuse/annotate when it cannot be (the mask must still cover all of
  Ω for the orbit queries, so this only helps until the view is smaller than the bbox). Either way the
  browser test needs a third clause: **class agreement at 30× and 300×**, not only at 1× and 6×.
- **Prior:** new. (Not a re-report of the #337 speckle finding — that is fixed; this is the fix's cost,
  which was measured only at the framing where it is invisible.)

### SCH-11 [CRITICAL] [confirmed] The missing `phi.family` guard also poisons the σ RECIPE and the Hele-Shaw hand-off — the app's own picture is right, the wire is wrong (cross-ref WGT-1)

- **Where:** `app/schwarz/schwarz-export.mjs:31` (`phiToMapSpec`'s unbounded branch, no `phi.family`
  guard — A2's WGT-1) propagates to **three further exported surfaces**: `:256-259`
  `buildSigmaEnvelope` (`laurent && laurent.form === "laurent" ? laurent : boundedClassicalMapSpec(phi)`),
  `:99-101` `explainSigmaUnavailable` (same expression, so the UI reports "exportable"), and `:345-349`
  `buildHeleShawEnvelope` / `:385-388` `explainHeleShawUnavailable` (both gate only on
  `phiSpec.form === "laurent"`).
- **What:** for the four unbounded weighted families (`unboundedLQD`, `unboundedLQD_singular`,
  `unboundedPQD`, `unboundedPQD_singular`) the σ recipe is emitted as
  `sigma.phi = {form:"laurent", …}, disk:"D*"` — i.e. CD is told to reconstruct σ from a **classical**
  Laurent φ, dropping the `exp(r#)` / `(·)^{1/α}` factor entirely. CD then renders an escape-time field
  from that σ. The φ hand-off (WGT-1) at least hands over a *map*; this hands over a **σ**, which is the
  object the receiving app draws dynamics from.
- **Evidence** (`scratch/A6/wgt.mjs`, node, float64 — `σ_app` is the family-dispatched engine, `σ_recipe`
  is QD's own `_adaptUnbounded` applied to the emitted wire spec, evaluated at the same `w = φ_app(z)`
  over 24 angles × radii {1.5, 2.0, 3.0}):

  | family | recipe emitted? | UI says | max abs σ error | max rel σ error |
  |---|---|---|---|---|
  | `unboundedLQD` | yes, `form:"laurent"` | "exportable" | **16.35** | **2229×** |
  | `unboundedLQD_singular` | yes, `form:"laurent"` | "exportable" | **10.43** | 1.045 |
  | `unboundedPQD` | yes, `form:"laurent"` | "exportable" | **1.704** | 1.207 |

  `buildHeleShawEnvelope` emits for all three as well, and `explainHeleShawUnavailable` returns `null`
  ("available"). A2's WGT-1 measures 0.67–1.73 on the φ side; the σ side is an order of magnitude worse
  because the classical inverse lands on a different sheet entirely.
- **The in-app picture is NOT affected — checked.** `schwarz-common.mjs:1062-1075`
  (`buildSchwarzFromPhi`) and `schwarz-webgl.mjs:1003-1010` (`setPhi`'s `familyId`) both dispatch on
  `phi.family`, so the Schwarz tab renders the correct weighted σ for all four (and the node suite pins
  `σ(w) ≈ w` on ∂Ω at 3e-13 for the LQD cases). That makes this *harder* to notice, not easier: the
  screen and the exported recipe disagree, and only the recipe leaves the app.
- **Why it matters:** the σ hand-off is ADR-0009's whole point, and it silently ships a different σ for
  four of the ten families — a plausible fractal in Complex Dynamics with no error signal (RISKS §2). The
  `explainSigmaUnavailable` docstring (`:105-108`) even reasons about the weighted case — *"reaching here
  means a WEIGHTED bounded QD … not reconstructable yet"* — but the unbounded weighted φ never reaches
  that switch, because `phiToMapSpec` claimed it first.
- **Fix:** one guard, in `phiToMapSpec` (WGT-1's fix), fixes all four surfaces at once, since each defers
  its null-decision to it. Add the missing `explainSigmaUnavailable` / `explainHeleShawUnavailable`
  branches so the four families get a named reason rather than a silent "exportable". Pin it with a test
  that asserts `buildSigmaEnvelope` returns `null` for each of `unboundedLQD`,
  `unboundedLQD_singular`, `unboundedPQD`, `unboundedPQD_singular` — the same shape as the existing
  `boundedClassicalMapSpec` guard test.
- **Prior:** new; **cross-ref WGT-1** (A2 owns the `phiToMapSpec` / `buildExportEnvelope` half).

### SCH-2 [HIGH] [confirmed] `findSigmaSingularities` marks σ's poles in the wrong place — the reflection `1/conj(z_j)` is spurious; the true poles are `φ(z_j)` (= the quadrature nodes)

- **Where:** `app/schwarz/schwarz-analysis.mjs:329-341` — `:330` `z_jR = z_j/|z_j|²`, `:333`
  `wPole = schwarz.evalPhi(z_jR)`, `:329` `if (absZj < 1e-12) continue;`. Consumed by
  `schwarz-ui.mjs:770-779` (the "Show σ singularities" checkbox and the `n poles, m bp` readout) and
  drawn by `schwarz-paint.mjs:262-263, 651`.
- **What:** `F(z) = conj(w₀) + Σ A_{j,k}/(z − z_j)^k`, and `σ(w) = conj(F(ψ(w)))`, so σ has a pole
  exactly where `ψ(w) = z_j`, i.e. at `w = φ(z_j)`. The code evaluates φ at the *reflected* point
  `1/conj(z_j)`, which is (a) φ's own pole for the bounded family and (b) off φ's domain for the
  unbounded family. The app's own doc states the correct theory: *"Its poles sit at the quadrature nodes
  `a_j`"* (`SCHWARZ_FORMULATION.md:16-18`).
- **Evidence** (`scratch/A6/polecheck2.mjs`, `polecheck3.mjs` — node, float64, no GPU):
  - Bounded QD, `h = 0.6/(w−0.5) + 0.6/(w+0.5)`: true σ-poles at `w = ±0.5` (`|σ| = 6.00e3` at distance
    1e-4, i.e. a clean `1/d`). Reported: **`w = +0.5454`** (`|σ| = 13.9` at distance 1e-4 — no pole) and
    **`w = −9.83e15`** (outside Ω entirely). Both labelled `a₁`, `a₂`.
  - Unbounded one-point QD, `h = 1/(w−2)`, `c = 0.6`: true σ-pole at `w = 2` (`|σ| = 1.0000e4` at 1e-4);
    reported `w = 0.148`, where `|σ| = 0.023`. (Here `z_j = 4.054 ∈ 𝔻*`, so the header comment at
    `schwarz-common.mjs:293` — *"for unbounded … z_j ∈ 𝔻 stays in 𝔻"* — is also false.)
  - Single-pole bounded QD (`h = 1/(w−0.4)`): the solver normalises `z_1 = 0`, so the `absZj < 1e-12`
    guard drops it and **zero** poles are reported where `|σ|` blows up as `1/d` at `w = 0.4`.
- **Why it matters:** the σ-singularity overlay is the picture of the *defining data of a quadrature
  domain*. It shows markers at wrong points, at 1e16, or not at all — an exploratory overlay reading as
  a definite one. `φ(z_j)` being right also makes the overlay agree with the Inverse tab's own node
  markers, which is a visible cross-check the app currently fails.
- **Fix:** `wPole = schwarz.evalPhi(branches[j].z)` and delete the `absZj < 1e-12` guard (φ(0) is
  perfectly well defined for both families). Pin it with a test that asserts `|σ|` grows like `1/d`
  within 1e-3 of each reported pole and that the bounded two-pole fixture reports `±0.5`.
- **Prior:** new. (The prior review read `schwarz-common.mjs` in full and `schwarz-analysis.mjs` not at
  all — see its Coverage list.)

### SCH-3 [HIGH] [confirmed] With the renderer set explicitly to "GPU", a φ the shader refuses leaves the PREVIOUS domain's fractal on screen, under a status line that says it fell back to CPU

- **Where:** `app/schwarz/schwarz-ui.mjs:1403-1408` `activeRenderer()` — `:1406`
  `if (sState.grid.renderer === 'gpu') return sState.gpu ? 'gpu' : 'cpu';` ignores
  `capacityError()`, which only `:1407`'s `'auto'` branch consults. Renderer select at `:1133-1137`
  offers `gpu` explicitly. `schwarz-webgl.mjs:958-975` returns `false` from `setPhi` **before** touching
  `phiState`, so the old φ survives intact. `schwarz-render.mjs:72-104` then renders on the GPU.
- **What:** the four power-weighted families (`powerQD`, `powerQD_singular`, `unboundedPQD`,
  `unboundedPQD_singular`) are CPU-only; `setPhi` refuses them. On `auto` that routes to CPU correctly.
  On explicit `gpu` it does not, and the GPU redraws the last accepted φ.
- **Evidence** (`scratch/A6/probe-pqd.js`, real GLSL in Chromium): `setPhi(deltoid) → true`, render,
  hash the 120² frame; `setPhi(unboundedPQD, h = 1/(w−2.5), α = 2, c = 2) → false` with
  `capacityError() = "Family.unboundedPQD (α=2): GPU shader for (R#)^{1/α} not yet implemented; falling
  back to CPU."`; render again → **0 of 57,600 bytes differ**. The correct picture is a different domain
  (PQD ∂Ω bbox `[−1.91, 1.53] × [−1.90, 1.90]` against the deltoid's `[−0.375, 0.75] × [−0.65, 0.65]`;
  CPU classes 404 fundamental / 495 outside / 1 invalid over a 30² sample).
  Negative control: the sphere twin gets this right — `sphere-ui.mjs:197-209` clears `hasPhi` on refusal
  so the sphere renders empty rather than the previous domain.
- **Why it matters:** the app draws domain A's Schwarz fractal under domain B's caption with no error,
  while the one line it prints asserts a fallback that did not occur. On a *first* capture the same path
  renders against an all-default `phiState` (no mask, `nBranches = 0`) — a flat "everything outside"
  frame.
- **Fix:** `if (sState.grid.renderer === 'gpu') return (sState.gpu && !sState.gpu.capacityError()) ? 'gpu' : 'cpu';`
  — i.e. the same expression as the `auto` branch, and say "GPU cannot render this family; using CPU"
  rather than letting the capacity string speak for a fallback that the branch has to actually perform.
  A node test can pin `activeRenderer()` against a stubbed `gpu` whose `capacityError()` is non-null.
- **Prior:** new.

### SCH-4 [MEDIUM] [confirmed] The σ-pole test is vacuous — the whole pole computation can be deleted and the suite stays green

- **Where:** `app/test/schwarz.test.js:404-411`. The assertion is `s.poles.length <= 2`, and the comment
  above it *documents the SCH-2 defect as intended*: *"Reflection 1/conj(z_j) blows up — so we should get
  0 poles reported (filter at |z_j| < 1e-12). Either 0 or 1 pole is acceptable."*
- **What / Evidence:** in a throwaway edit of `schwarz-analysis.mjs:335-340` replacing the
  `polesOut.push({...})` with a no-op (so `poles` is always `[]`), `node app/node-test.js` printed
  `PASS  S4/cardioid: σ-pole count is reasonable — nPoles=0` and **2342 passed, 0 failed**. Reverted
  immediately; `git status --short` clean.
- **Why it matters:** this is the mechanism by which SCH-2 survived — a test that encodes a defect as the
  expected behaviour. The suite has no assertion anywhere that σ actually has a pole where the analyzer
  says it does.
- **Fix:** replace the count assertion with the localisation assertion in SCH-2's fix.
- **Prior:** new.

### SCH-5 [MEDIUM] [code] A Schwarz/sphere figure is unreproducible — no PNG metadata and no view state in the URL

- **Where:** `app/schwarz/schwarz-features.mjs:343-354` (`out.toBlob(... 'image/png')`, then a bare
  `<a download>`); `app/ui/ui-figure-export.mjs:268-269, 290-291` (the Inverse tab's PNG, same);
  `app/ui/ui-url-state.mjs:39-50` (`#vs=` carries mode, h-text, gauges and the active tab — nothing
  from `sState`); `package.json` has no `@cas/export`.
- **What:** the Schwarz export writes no `tEXt`/`iTXt` chunk, and the `#vs=` payload carries none of the
  Schwarz view state (camera `cx/cy/scale`, `viewMode`, `maxIter`, `colormap`, `scaleMode`, `modK`,
  resolution, renderer, or the sphere camera). Seven other apps in the suite stamp a reproducibility
  record via `@cas/export`; CI's M6 review made `Software` + `cas:state` the documented convention.
- **Why it matters:** the share link reproduces the *domain* but not the *picture*, and the PNG records
  nothing at all — so a figure taken from this tab cannot be regenerated, and (given SCH-1) cannot even
  be checked for which zoom it was taken at. The export card is careful to say what detail is *in* the
  file (`describeExportDetail`) while recording nothing about how it was made.
- **Fix:** add `@cas/export` as a dependency and stamp `Software` + `cas:state` with a Schwarz view-state
  hash; extend `#vs=` with a `schwarz` block under the existing `"qd"` namespace (a namespaced addition,
  so old links keep working — the back-compat guardrail is satisfied by construction).
- **Prior:** new.

### SCH-6 [MEDIUM] [code] Sphere: the `webglcontextlost` listener leaks one handler per loss/restore and per mount, and a restored context silently changes the escape radius

- **Where:** `app/sphere/sphere-webgl.mjs:132` — an **anonymous** `canvas.addEventListener('webglcontextlost', …)`
  that `destroy()` (`:825-839`) never removes; `app/sphere/sphere-ui.mjs:268-269` `_ensureGLCanvas`
  returns the existing `#sphere-gl-canvas`, and `:117-133` calls `QD.Sphere.createRenderer(glC)` again on
  every restore without destroying the old renderer. This is exactly the defect fixed in the plane twin
  under `qd-schwarz-gl-listener-01` (`schwarz-webgl.mjs:872-879`, named listener removed in `destroy()`).
- **Second half:** `sphere-ui.mjs:126` re-applies φ on restore as
  `r.setPhi(state.phiSnapshot, { boundaryPts: … })` — **without `escapeR`**, where the normal path
  (`:190-200`) passes `sw.escapeR`. `sphere-webgl.mjs:433-434` then falls back to
  `coverR * 6.0 = polyHalfExtent * 30`, which for the deltoid is **19.5** against the plane's
  `polygonBounds().radius * 30 + 10 = 32.5` (`schwarz-common.mjs:1149`). So after a context loss the
  sphere quietly draws a different escape-time field from the plane for the same φ.
- **Evidence:** code chain above; the escape-radius numbers are from `scratch/A6/t1.mjs`
  (`sw.escapeR = 32.5`) and the deltoid bbox measured in `probe-mask.js` (`polyHalfExtent = 0.65`).
  The stale comment at `sphere-webgl.mjs:416-418` — *"sphere-ui calls setPhi WITHOUT an escapeR, so this
  fallback is live"* — is false for the normal path and true only for the restore path.
- **Fix:** name the listener and remove it in `destroy()`; call `state.renderer.destroy()` before
  replacing it on restore; pass `escapeR` on the restore path (or, better, have `sphere-ui.setPhi` cache
  the value it computed instead of rebuilding a whole Schwarz handle each time).
- **Prior:** new.

### SCH-7 [LOW] [confirmed] `sigmaInverse`'s dispatch comment claims a closed-form polynomial inverse for `unboundedQD` that does not exist

- **Where:** `app/schwarz/schwarz-inverse.mjs:229-234` — *"unboundedQD : closed-form polynomial in 𝔻*
  (S2)"*. The actual dispatch (`:236-330`) has exactly two closed-form branches — `boundedQD` and
  integer-α `powerQD` — and routes `unboundedQD` into `_sigmaInverseViaNewton` with 24 seeds
  (`:322-326`), whose own header (`:122-140`) says it *"sacrifices the perfect closed-form root
  multiplicity … we may miss roots if seeding doesn't cover their basins"*.
- **Why it matters:** the preimage tree, the limit-set chaos game and the box-counting dimension all run
  through `sigmaInverse`; a reader who believes the comment will read a missing branch of the tree as
  mathematics rather than as a seeding miss. (`dim ≈` at `schwarz-features.mjs:118` is honestly
  labelled — this is a code-comment problem, not a UI one.)
- **Fix:** delete the claim, or implement it (`F(z) = c/z + Σ conj(F_l) z^l + Σ A/(z−z_j)^k` clears to a
  polynomial too, so it is a real option, not just a doc fix).
- **Prior:** new.

### SCH-8 [LOW] [code] `PLAN-SPHERE.md` still reads "ready for implementation" and describes a design that did not ship

- **Where:** `PLAN-SPHERE.md:3` (`**Status**: ready for implementation`), `:47-56` (a dedicated
  `data-tab="sphere"` tab with `#controls-sphere`), `:268` (extract `renderFractalToTarget(target, params)`
  in `schwarz-webgl.js`), `:330-333` (verification step 4: the bounded-φ warning banner).
- **What:** the sphere shipped as a **view mode inside the Schwarz tab** (segmented control,
  `schwarz-ui.mjs:332-341`), with a lazy-mounted `#schwarz-sphere-slot`. `grep -rn 'controls-sphere|data-tab="sphere"|renderFractalToTarget' app/`
  over the source returns **nothing** — no tab, no panel, no extraction (the sphere duplicates the FBO
  plumbing and imports `QD.Schwarz._shaders` / `_glHelpers` instead). Verification step 4's banner does
  not exist either (next finding).
- **Fix:** mark the plan `Status: implemented (as a Schwarz view mode, not a tab)` with a two-line delta,
  or archive it. A 387-line "ready for implementation" plan for shipped work is a trap for the next
  reader.
- **Prior:** new.

### SCH-9 [LOW] [confirmed] `sphere/README.md` promises a bounded-Ω warning chip that does not exist

- **Where:** `app/sphere/README.md:62-64` — *"A soft warning chip appears in the sphere sidebar in that
  case."* `grep -rn bounded app/sphere/sphere-ui.mjs` returns **nothing**; the only `bounded` hits in
  `app/sphere/` are family-id switches in `sphere-webgl.mjs`. `PLAN-SPHERE.md:37-39` scoped the same gate
  ("gated to unbounded families only with a soft warning").
- **Why it matters:** the README tells the reader a guard exists; a bounded capture just renders an
  uninformative cap with nothing said.
- **Fix:** add the chip (three lines in `sphere-ui.mjs`'s sidebar, driven by `phi.unbounded`), or delete
  the sentence from both documents.
- **Prior:** new.

### SCH-10 [NIT] [code] Sphere README documents a one-argument `buildSphereMesh(divisions)`

- **Where:** `app/sphere/README.md:21` vs `sphere-common.mjs:82` `buildSphereMesh(nLon, nLat)`.
- **Fix:** one word.
- **Prior:** new.

---

## Structural observations

- **The GPU/CPU split is duplicated three times over, and the sphere copy has already drifted.** The σ
  escape-time loop exists as float64 JS (`schwarz-common.mjs`), as GLSL (`schwarz-webgl.mjs`'s
  `FRAG_SRC`), and as a second GLSL *consumer* of the same string in `sphere-webgl.mjs` (via
  `QD.Schwarz._shaders`). Sharing the shader source was right; what was not shared is the **uniform
  packing**, which `sphere-webgl.mjs:290-440` reimplements ~150 lines of — including the family switch,
  the γ-branch merge, the capacity checks and the `rInfConj` recomputation. SCH-6's escape-radius drift
  is the first symptom. `PLAN-SPHERE.md:268` proposed exactly the right shape
  (`renderFractalToTarget(target, params)` on the plane renderer) and it was not built; that is the
  coherent fix, and it is a *second-consumer* extraction in ADR-0007's sense, not a speculative one.

- **`buildFromAdapter`'s `lastSeed` is a module-level mutable cache** (`schwarz-common.mjs:1096`,
  read at `:1099`) shared by every `psi(w)` call that supplies no `seedHint`. It is benign only because
  `acceptZ` + univalence make any accepted `z` *the* `z` — but it makes `psi` order-dependent, which is
  a hazard for anything that compares two runs (the differential guard, a golden). Worth a comment that
  states *why* it is safe, or a per-call seed.

- **`escapeTime`'s `opts` use `||` defaults** (`schwarz-common.mjs:1228-1229`): `maxIter: 0` silently
  becomes 64 and `escapeR: 0` becomes `schwarz.escapeR`. Not reachable from the UI today; `??` costs
  nothing.

- **QD is deliberately not a `@cas/ui` consumer (ADR-0032)** and the Schwarz canvas is consequently
  mouse-only — `schwarz-interaction.mjs:86-160` binds `mousemove`/`click`/`dblclick`/`wheel`/`mousedown`
  and no `keydown`, and the canvas is not focusable. That is a consequence of the ADR rather than a
  defect in this module, but it means the tab's entire interaction surface (pan, zoom, pin an orbit) has
  no keyboard path, which the non-blocking `axe` roster cannot see.

- **ADR-0026's deferral is holding and the guard is real.** `vitest/schwarz-differential.test.ts` is a
  genuine three-way check (QD engine · `@cas/schwarz` · an independent `@cas/core` reference · pinned at
  the hand-derived goldens) over the deltoid, a pole-bearing unbounded φ and a bounded lobe. Its stated
  exclusion — the near-boundary multivalued region — is the right one. I have no criticism of it beyond
  noting that it never builds a handle with `boundaryPts`, so `isInOmega` and `escapeR` are outside its
  reach; SCH-1 and SCH-6 both live there.

---

## Improvement proposals (core functionality)

1. **Make the in-Ω test exact, and retire the mask to a pre-filter. (M, unlocks SCH-1.)** For every
   family the app already has the exact predicate: `w ∈ Ω ⟺ ψ(w)` has an admissible preimage, which
   `invertPhi` + `acceptZ` decide. Keep the mask as the cheap first answer, but when it says "not in Ω"
   *and* the point is within one texel of ∂Ω, run the Newton ladder and believe it. Cost: one extra
   Newton on a one-texel band. Benefit: the σ picture stops degrading with zoom, `kind: 'invalid'`
   becomes a genuine diagnostic again, and the same change applies verbatim in `@cas/gpu` for Complex
   Dynamics. Risk: low — it can only *add* points to Ω, and `acceptZ` is the same predicate the fast path
   already trusts. Prerequisite: none.

2. **Put the Schwarz view in the share link and in the PNG. (S, closes SCH-5.)** `#vs=` already carries
   a namespaced `"qd"` block; add `{view, cx, cy, scale, maxIter, colormap, scaleMode, modK, resolution}`
   plus the sphere camera. Stamp the same payload into the PNG through `@cas/export` under the documented
   `Software` + `cas:state` keys. This is what makes a Schwarz figure citable, and it is the prerequisite
   for any future claim about a picture in a paper.

3. **Give the four power-weighted families a GPU path. (M.)** They are the only families the shader
   refuses (`schwarz-webgl.mjs:968-975`), and the refusal is one missing primitive: a principal-branch
   `cpow(v, 1/α)` — `exp(log(v)/α)` with `atan2`, which GLSL ES 3.0 has. `adaptPowerQD` /
   `adaptUnboundedPQD` already compute `φ`, `φ'` and `F` in exactly that form
   (`schwarz-common.mjs:470-500`), so the shader branch is a transcription. It would also remove SCH-3's
   whole failure mode rather than papering over it. Risk: the `α`-th root's branch cut must match the
   CPU's `C.cpow`; the parity harness in `scratch/A6/probe-n2.js` is the check.

4. **Extract `renderFractalToTarget` so the sphere stops re-packing the uniforms. (M, per ADR-0007 —
   the second consumer already exists.)** See the first structural observation. This is the change that
   makes SCH-6's escape-radius drift structurally impossible rather than fixed once.

5. **Unify the escape-radius definition. (S.)** `schwarz-common.mjs:1149` uses
   `polygonBounds().radius * 30 + 10` (max distance from the centroid); `schwarz-webgl.mjs:1088` and
   `sphere-webgl.mjs:426-434` use `polyHalfExtent * 30` (half the bbox's larger side). They coincide only
   by the UI passing the first one down. One exported function, called by all three.

---

## Documentation drift

| Doc `file:line` | Claims | Reality (`file:line`) | Severity |
| --- | --- | --- | --- |
| `app/schwarz/README.md:118-124` | the conservative stroke costs "a ≤1-texel outward bias of ∂Ω, which is the accuracy the mask had in any case" | true in magnitude, but it is *signed* and *fixed in world units*: 10.4 % of Ω misclassified at 300× and 63 % near the cusp (SCH-1, `probe-band2.js` / `probe-mask.js`) | **HIGH** |
| `app/schwarz/README.md:42` | "Float32 precision; banding at zoom > 1e6" | the picture is wrong long before float32 matters — the mask erodes measurably from ~4× and the limit is `2·half/N < mask texel`, i.e. ≈7× on a 900-px canvas (`schwarz-webgl.mjs:803-804, 834`) | **HIGH** |
| `app/schwarz/README.md:126-130` | "`kind: 'invalid'` … under a conservative mask it should not arise" | true, and that is the problem: the erosion *converts* the invalid pixels into confidently-wrong `outside` ones, so the visible diagnostic was removed along with the artefact | MEDIUM |
| `app/schwarz/schwarz-inverse.mjs:231` | "unboundedQD : closed-form polynomial in 𝔻* (S2)" | routed to `_sigmaInverseViaNewton` with 24 seeds (`:322-326`); no closed-form branch exists | LOW |
| `app/schwarz/schwarz-common.mjs:293` | "For unbounded … z_j ∈ 𝔻 stays in 𝔻" | measured `z_j = 4.054` for `h = 1/(w−2)`, `c = 0.6` — the unbounded branches sit in 𝔻* (`polecheck3.mjs`) | LOW |
| `app/sphere/README.md:62-64` | "A soft warning chip appears in the sphere sidebar" for bounded Ω | no `bounded` reference anywhere in `app/sphere/sphere-ui.mjs` | LOW |
| `app/sphere/README.md:21` | `buildSphereMesh(divisions)` | `buildSphereMesh(nLon, nLat)` (`sphere-common.mjs:82`) | NIT |
| `app/sphere/sphere-webgl.mjs:416-418` | "sphere-ui calls setPhi WITHOUT an escapeR, so this fallback is live" | the normal path passes it (`sphere-ui.mjs:197-200`); only the context-restore path (`:126`) omits it — and that omission is SCH-6 | LOW |
| `PLAN-SPHERE.md:3, 47-56, 268, 330-333` | "ready for implementation"; a dedicated sphere tab; a `renderFractalToTarget` extraction; a bounded-φ warning banner | shipped as a Schwarz view mode; no tab, no panel, no extraction, no banner (`grep` over `app/` returns nothing for all three identifiers) | LOW |
| `app/test/schwarz.test.js:406-410` | comment: "Reflection 1/conj(z_j) blows up — so we should get 0 poles reported … Either 0 or 1 pole is acceptable" | encodes SCH-2 as intended behaviour; contradicted by `SCHWARZ_FORMULATION.md:16-18` ("Its poles sit at the quadrature nodes `a_j`") | MEDIUM |

---

## Tests

**Vacuous, with the surviving mutant.** `app/test/schwarz.test.js:404-411` — see SCH-4. Mutant:
delete the `polesOut.push({...})` body in `schwarz-analysis.mjs:335-340`. `node app/node-test.js` →
`PASS  S4/cardioid: σ-pole count is reasonable — nPoles=0`, **2342 passed, 0 failed**. (Applied and
reverted in the main checkout; `git status --short` clean.)

**Coverage gaps that matter.**

1. **The browser mask suite pins classification, never the escape-time VALUE.** `schwarz-mask.browser.test.ts:135-165`'s
   `kindOf` folds every non-flat colour to `"fundamental"`, so a shader that is off by ten iterations
   everywhere passes. Measuring the value is cheap — render with `grayscale` + `scaleMode:"smooth"` and
   invert the 256-texel LUT (decode residual ≤ 0.48 grey levels, measured, so `n` is recovered
   unambiguously; `scratch/A6/probe-n2.js`). Doing that produced the whole SCH-1 evidence table.
2. **Class agreement is asserted at 1× and 6× only** (`:159-161`), which are precisely the framings where
   SCH-1's erosion is sub-pixel. The 30× view is checked for zero-`KIND_INV` (`:121`) — a property that
   *over*-erosion satisfies trivially — but not for agreement. A 30× and a 300× agreement clause would
   have caught this: I measure 99.48 % and **94.81 %** against the test's own "must fail" floor of 98.87 %.
3. **No finite-pole unbounded QD in the browser parity suite.** Only the pole-free deltoid and the
   bounded cardioid. I added `h = 1/(w−2)`, `c = 0.6` in `probe-n2.js`; it is clean (100.0 % class and
   value agreement at 6× and 60×, min `|φ'|` on `|z| = 1` = 0.49 against the deltoid's 0), which makes it
   a useful *control* showing that SCH-1's cusp numbers are about ∂Ω's geometry.
4. **Nothing asserts the CPU path is `invalid`-free.** Measured and it is, on the two families the
   browser suite uses (`scratch/A6/cpuinv.mjs`: 0 invalid in 48,400 pixels at each of five views; and
   `cpuband.mjs`: 0 of 1,202 in-Ω claims within 1e-7 of the sampled ∂Ω lack a `ψ` preimage). So the CPU
   engine needs no `conservativeOmega` equivalent — worth pinning, because it is the reference SCH-1's
   fix has to be measured against. (One exception found: the *unbounded-PQD* CPU field does produce a
   rare `invalid` — 1 in 900 sampled — presumably the `α`-th-root branch; not chased.)
5. **No test asserts a σ recipe is REFUSED for a family the shared engine cannot rebuild.** The suite
   has the positive cases (deltoid, pole-bearing unbounded, bounded-classical) and the bounded-weighted
   refusal, but nothing covers the four *unbounded* weighted families — which is how SCH-11 shipped.
6. **`sigmaInverse` has no completeness test for the five Newton-routed families.** The suite checks
   round-trips (`σ(σ⁻¹(w)) ≈ w`), which a *subset* of the preimages passes. The preimage tree, the limit
   set and `boxCountingDimension` all inherit that.

**Passing for the wrong reason.** `schwarz-mask.browser.test.ts`'s first two cases assert
`countInvalid(...) === 0`. Under the shipped conservative mask that is now guaranteed by construction at
every zoom, including zooms where the picture is 63 % wrong — the assertion has become true because Ω was
shrunk, which is the exact failure mode the third case's floors were written to reject, just displaced to
zooms the third case does not visit.
