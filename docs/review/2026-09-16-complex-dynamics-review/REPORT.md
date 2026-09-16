# Complex Dynamics — review (2026-09-16)

A full-app review of `apps/complex-dynamics`: code, docs, and the built app driven in headless
Chromium (SwiftShader WebGL2) at 1440×900, 1280×720 and 390×844. Every item carries how it was
established — **[browser]** reproduced in the running app, **[code]** confirmed by reading the code
path, **[measured]** reproduced numerically against the module in node. Nothing below is speculation
unless marked *likely*.

The app is in good shape structurally: 84 test files / 833 tests pass in 9.7 s, lint and typecheck
are silent, the a11y roster records zero findings for the default page, every `id` referenced from
TypeScript exists in the HTML and every control has a handler, and all nine localStorage keys are
read and written symmetrically. The problems are elsewhere: a handful of rendering defects that make
the picture on screen differ from the picture exported, several *instrument* readouts that print a
confident number that is wrong, a shell with real UX debt from feature accretion, and documentation
that has drifted a long way from the code.

---

## 1. Defects that change what the user sees or reads (fix first)

### 1.1 Rendering

**R1 [code+browser] "Refine while idle" applies the post-processing vignette and gamma even when
post-processing is OFF — and it is on by default, so the default view is vignetted.**
`renderAccumulate` always displays through `drawPost` (`src/render/glPlot.ts:2224`), and `drawPost`
uploads `_vignette`/`_gamma` unconditionally (`:1980-1981`); `setPost` stores the slider values
regardless of `on` (`:2540-2545`); `applyPost` passes the raw slider (`src/main.ts:2683-2689`), so
the default `_vignette` is 0.30. The share-link state confirms `"accumulate": true, "post": false`
at first load, and the corner darkening is visible in every screenshot. Exports and the non-
accumulated render carry no vignette, so **what you see is never what you save**. One-line fix:
pass `this._post ? this._vignette : 0` and `this._post ? this._gamma : 1` (or skip `drawPost` when
post is off and just blit the average).

**R2 [browser+code] The interaction "collar" (pre-rendered overscan margin) is dead: every attempt
fails with a GL feedback loop.** On load, both plots log
`interaction collar disabled (render failed) {err: 1282}` and Chrome reports
`GL_INVALID_OPERATION: Feedback loop formed between Framebuffer and active Texture`. Cause:
`ensureCollarTex` binds `collarTex` on texture unit 0 to allocate it and never unbinds
(`glPlot.ts:1890-1900`); `renderCollar` then attaches that same texture to the FBO and calls
`setupDraw`, which in the default (non-histogram) path binds nothing on unit 0 (`:1154-1165`), so
the `uCdf` sampler still points at the render target. The draw is rejected, `collarValid` stays
false, and the README's "a margin around the view is pre-computed … so newly-revealed area is
usually already there" never happens (the warning is one-shot, so it looks like a single hiccup).
Fix: `gl.bindTexture(gl.TEXTURE_2D, null)` after allocating, or bind unit 0 explicitly in
`setupDraw`. No test can see this: the node gate never creates a context and the browser suites
never exercise the collar.

**R3 [code] Four colour legends describe the opposite of what the shader draws.**
`src/render/legend.ts:104` says multiplier brightness is "dark = superattracting" while the shader is
`sqrt(1 − |λ|)` — bright at the centre (`shaderBuilder.ts:546`, and the README agrees with the
shader); `legend.ts:48` distance "high = close to the edge" vs the shader darkening at the boundary
(`:923`); `legend.ts:64` orbit-trap "high = stays away" vs `palette(1 − √trap·1.3)` (`:840`);
`legend.ts:97` shows a monotone "period 1 → higher" ramp for a non-monotone hash
`fract(period·0.618)` (`:867`). The legend is on by default, so these are the first explanation a
reader gets.

**R4 [code] Perturbation and df64 silently ignore the projection modes.** `usePerturbation`
checks only `_sphere` (`glPlot.ts:1315`), `desiredPrecision` ignores `_projection` (`:1007`), and
both kernels use the linear coordinate (`shaderBuilder.ts:315, 410`). With log-polar or Poincaré
selected the picture snaps to linear past the df64 threshold or when perturbation is on, while the
note still says "Poincaré disk view active", pointer hit-testing still inverse-projects
(`plotView.ts:427`), and the overlay stays hidden.

**R5 [code] Smooth colouring differs between the standard shader and the perturbation kernel for
general polynomials.** `compile()` passes only `_monicDegree` (`glPlot.ts:787`), so `z³−z+c` gets
`LOG_DEGREE = log 2` in the standard shader (`shaderBuilder.ts:392`) but `log 3` in the kernel
(`:353`, via `perturbDegree()`); toggling perturbation visibly re-bands the exterior.

**R6 [code] Exports can be internally inconsistent.** `renderToImageData` yields between strips and
each strip re-reads `_draft` for AA, outline, lighting and the histogram→smooth fallback
(`glPlot.ts:330, 1168, 1176`), so a pan or wheel during a multi-second export changes the look of
the remaining strips. The export path also draws the flat-plane overlay and scale bar on top of a
sphere/projection render (`plotView.ts:279, 320`) where the on-screen path clears it (`:380`), and
the histogram export does a synchronous full-size `readPixels` (268 MB at 8192²) before the
progress/Cancel UI can act (`:2245`), then rebuilds the CDF at screen size if a live render
intervenes.

**R7 [code] Temporal AA stops after any appearance change.** The recolour fast path runs before the
accumulate branch (`glPlot.ts:2131`); after a palette rotation / outline toggle the view shows one
un-jittered sample until the next content change (the comment at `:2129` concedes this). README
promises convergence "over a few frames".

**R8 [code] Robustness.** A failed df64 compile is retried on every frame with no latch
(`glPlot.ts:910-945`); `renderToImageData` has no context-loss or FBO-status check and can yield a
black PNG with valid metadata (`:2245`); the σ renderer has no `webglcontextlost` handling
(`schwarzGL.ts`); `set zoom`/`set center` accept NaN/0/Infinity (`:2420-2424`); the export-size cap
comes from a throwaway context that may be WebGL1 (`hiResExport.ts:71-76`) instead of the live
context's `maxTextureSize`.

**R9 [code] Performance.** Recording renders every frame twice (`main.ts:5408, 5426, 5492, 5573,
5597` set state *and* call `plot.render()`); the BLA table and the double-double reference orbit are
rebuilt on every zoom tick with auto-iterations on (`glPlot.ts:1334, 1436`); the field pre-pass
loses both interior shortcuts (`shaderBuilder.ts:641, 966`).

### 1.2 Instruments (numbers the app prints)

**I1 [measured] "Distance to set" in the inspector is off by one to two orders of magnitude.**
`escapeDistance` stops at the first `|z| > 2` hit and applies `½·|z|·log|z|/|D|`
(`src/render/inspect.ts:264-275`), a formula valid only for `|z_n| ≫` bailout. Measured on the
parameter plane: c = −2.01 (true d = 0.01) prints 0.70; c = 0.26 (true 0.01) prints 4.5e-4;
c = 0.2501 (true 1e-4) prints 4.3e-7. Printed with no `≈` (`main.ts:~418`). The test only asserts
positive and finite (`test/inspect.test.ts:76-89`). Fix: keep iterating to `|z| ~ 1e10` before
applying the formula.

**I2 [measured+browser] The Herman-ring detector "confirms" rings that do not exist.** The
quasiperiodicity test (`weightedBirkhoff.ts:348-360`) has a ~0 residual for periodic and
geometrically convergent orbits too, so `hermanRing.ts:122` only separates chaotic from
non-chaotic. On the shipped Blaschke family at τ = 0, 0.5, 0.25, 0.1 (Arnold tongues, attracting or
parabolic cycles, no rotation domain) it returns `isRing: true` with a rotation number and modulus,
and the panel prints **"Ring confirmed"** (`main.ts:6026`). The only test uses the golden-mean τ.

**I3 [measured] The lamination, the QML, "Angles of a point" and the Yoccoz puzzle are dominated by
clustering artefacts.** Leaves are landing points within `tol = 4e-3` (`lamination.ts:282,
295-318`); distinct (pre)periodic points of ∂K are routinely closer. Basilica at the default detail
6: 26 leaves, 24 spurious (only {1/3,2/3} and {1/6,5/6} are real); rabbit: 30 leaves, 24 spurious;
detail 8: 394 of 396, including a leaf joining the β-ray, which `test/lamination.test.ts:36` says
cannot happen (it passes only at period 6). QML: 8/52 spurious at detail 6, 126/260 at detail 8,
some pairing *unrefined* landings. `angleOfPoint.ts:67-68, 163-184` uses the same 5e-3 clustering:
at c = 0.1+0.1i (a Jordan curve, every point valence 1) it reports valence 4; near the tip on ∂M,
valence 6. `yoccozPuzzle.ts:75-76` seeds its α-angles from the same finder. README calls the leaves
"measured, not assumed … faithful", and `test/lamination.test.ts:33` (`> 3` leaves) pins the
artefacts. Fix: require the two Newton-refined landings to coincide to ~1e-9 and drop unrefined ones.

**I4 [measured] "Internal angle p/q", "Limb", "Show bulb rays" and the orbit portrait are computed
for components that are not cardioid bulbs.** `inspect.ts:189-230` takes the rotation of the cycle
about its centroid, which is the internal angle only for satellites of the main cardioid. At the
primitive period-4 centre c = −0.1565+1.0322i it prints "Internal angle 1/4", "Limb: conjugate 3/4",
enables "Show bulb rays" (which then draws the 1/4-bulb's 1/15, 2/15 rays) and offers the 1/4
portrait (`main.ts:407-417, 1427-1448`); `juliaProperties.ts:222` propagates the same p/q.

**I5 [measured] The Siegel / Cremer / parabolic verdicts are unreachable from a click, while Siegel
curves draw for attracting points.** `fatouComponentType` needs a multiplier that `inspect` only
gets when `classifyOrbit` converges to 1e-6 within 512 iterations (`overlay.ts:86-88`); at the
golden-mean Siegel c, at |λ| = 0.999, 0.99 and at c = −¾ every case is `undetermined`, so the
README's "Siegel disc / Cremer … with an estimated disc radius" never appears (the test feeds a
synthetic λ). Conversely `siegelCurves.ts:340, 361` accepts `||λ|−1| ≤ 0.02`, so at |λ| = 0.985 it
returns nine "invariant curves" for a spiralling attracting orbit. For z²+c the fixed points are
closed-form (already used in `yoccozPuzzle.ts:29`), so λ = 2α can be classified exactly.

**I6 [code] A custom polynomial's "critical orbit" is the orbit of 0.** `preset.criticalPoint ??
[0,0]` (`glPlot.ts:2314`) feeds the parameter-plane render, the critical-orbit overlay, the Julia
properties panel, the inspector, Find nucleus and Misiurewicz (`main.ts:1109, 2104, 5657, 6188`).
For `z³−3z+c` (critical points ±1) the panel prints "Lyapunov ≈ 1.0986" — log 3 at the *repelling*
fixed point 0. `findCriticalPoints` (`critical.ts:160`) exists and seeds nothing but connectivity.

**I7 [code] Smaller.** Ruelle's `1+|c|²/(4 ln 2)` is applied across the whole cardioid
(`juliaProperties.ts:205, 224-229`), not just small |c|; `findNucleus` from (−0.9, 0.05) with period
4 returns c = −1 (period 2) — no "converged to the intended root" guard (`inspect.ts:349-378`), and
`refineCycle` returns its last iterate after 30 steps with no convergence flag; `brjuno.ts:228, 305`
classifies θ = 355/113 as Siegel with a printed disc radius; `generalMate(1/7 ⊔ 2/7)` returns null
although README promises "any hyperbolic bulbs" (`matingEngine.ts`); the worker error path drops the
callback so Julia-properties rows can stay at "measuring…" forever (`packages/ui` `computeClient.ts:102`,
`juliaMetrics.worker.ts:327-329`).

### 1.3 Shell logic

**S1 [code] A global `keyup` Enter handler re-applies the whole app from anywhere.**
`document.addEventListener("keyup", e => e.key === "Enter" && applyChanges())` (`main.ts:5609-5611`)
has no target check: Enter in the formula textareas inserts a newline *and* re-applies; Enter in the
Views name box applies the plots instead of saving; keyboard-activating any button (Save view,
Delete, glossary ×, undo, a suggestion action) fires a full `applyChanges`; Enter on a focused plot
runs the plot's own Enter (`plotView.ts:785-793`) and then re-applies both plots.

**S2 [code] "Copy properties" copies stale rows.** `copyJuliaProperties` (`main.ts:2217-2231`)
posts to the metrics worker and reads the DOM synchronously on the next line, so the clipboard
usually holds "measuring…".

**S3 [code] Riemann-sphere state is dropped by share links, saved views, undo and PNG metadata.**
`sphere-param`, `sphere-dyn`, `sphere-light` are absent from `SHARE_IDS` (`src/state/appState.ts:15-72`;
the comment at `main.ts:6360-6362` admits it), and `renderMatedMap` switches to the sphere
(`:6120`), so a shared mating link reopens flat.

**S4 [code] The colouring mode is rewritten silently.** `updateDerivativeGating`
(`main.ts:2851-2861`) changes `#mode` to smooth/distance when the chosen mode becomes unavailable
(Newton, perturbation, non-holomorphic f) with no toast, and under perturbation the select still
lists Orbit trap / Distance / Stripe while the kernel renders every one of them as discrete escape
(`glPlot.ts:1492`); the note at `index.html:1757` is the only hint.

**S5 [code] Six independent document-level Escape listeners** (mobile sheet `573`, onboarding `621`,
plot expand `700`, glossary `880`, help `977`, σ `4539`) with no `stopPropagation`: Esc with the
glossary open while a plot is expanded closes both.

**S6 [code] Newton compile-error banner never clears** when Newton is unticked (`main.ts:2767-2773`
calls `reportCompileErrors` but not `clearInputErrors`); the σ error box survives an Esc exit
(`:4546` vs `:4684`); no `hashchange` listener, so pasting a new `#vs=` into the same tab does
nothing; keyframes store the f64 centre so a path through a >1e13× view cannot reproduce it
(`:5449`, `glPlot.ts:2424`).

**S7 [code] The inspector and the overlay disagree on the parameter-plane orbit start.** The drawn
orbit starts at `z₀ = c` (`overlay.ts:645`, matching the shader) while `fireInspect` uses the
critical point (`plotView.ts:450`), so "escapes (n=k)" differs by one for z²+c and is a different
orbit for presets with a non-zero critical point.

---

## 2. UI / UX

**U1 [browser] Choosing a preset does nothing.** `#fractal_presets` has no `change` handler
(`main.ts:6543` wires only `#apply_preset`); selecting "Herman ring" leaves `f = z^2+c` on screen
with no dirty highlight, no "unapplied" hint, and no ring on the Apply button (the deferred-edit
cue exists only for text inputs). A `<select>` that needs a separate button is the single most
surprising interaction in the app, and the tour text ("pick a preset below") implies otherwise.

**U2 [browser] First load is inconsistent about iterations.** Both iteration boxes read 200 (the
Explore profile) while both "applied …" chips read "100 it" (the preset). `updateViewChips`
(`main.ts:2240`) prints the *input's* value, not the applied one, and is not refreshed after the
profile writes the inputs; the suggestion "Raise to N" action (`:1251-1259`) and the profile label
(`:6834-6836` listens only on `.controls-pane`, but the boxes live in `.plots-pane`) desync the same
way.

**U3 [browser] The first thing a new user sees is a Cantor dust.** The default `c = −0.7−0.4i` is
outside M, so the dynamical plane opens on a disconnected Julia set whose legend still shows a black
"filled Julia set" swatch with no interior anywhere. A connected default (rabbit, basilica, or
c = −0.7+0.27i) would teach the coupling immediately. The same default's orbit label
`c=-0.7-i*0.4 · escapes (n=10)` uses a third complex-number format alongside the caption's
`−0.7 − 0.4i` and the input's `-.7-.4*i`; pick one for display.

**U4 [browser] The sidebar is a 2,200-px column of fourteen collapsibles with the Point inspector's
Siegel / Misiurewicz / Pin-note inputs at the very top before anything has been inspected**, and
the footer citation below "Save & animate". On the phone the "Controls" bottom sheet opens to this
same list and covers the plots entirely (the sheet starts under the app bar), contradicting
README's "so the plot stays visible while you adjust them". Group the sidebar into
*Function · Look · Precision · Instruments (z²+c) · Studio* tabs or a two-level accordion, move
the inspector's action inputs into the report they act on, and let the phone sheet open half-height.

**U5 [browser] No suite navigation.** CD never calls `mountNavHeader` (`.cas-nav` absent), so the
one app at the centre of two interchange hand-offs has no back-to-launcher link, and the two
hand-offs live in unrelated places — "Import map…" under the formula box (a native
`window.prompt`, `main.ts:5164-5171`) and "Riemann Map ↗" inside the Exterior-map panel
(`index.html:2078`). U7 (the nav header's hand-off picker) is wired in no app.

**U6 [browser+code] The σ view is a takeover, not a peer.** It hides both plots *and* the sidebar
(`main.css:454-458`); the mobile "Controls" FAB stays visible but toggles a `display:none` pane;
the entry button is a plain "Schwarz reflection σ…" under the formula with no tour step; every σ
analysis overlay (orbit family, level curves, cycles, forward curves, limit set, preimage tree) is
transient and dropped by share links (`main.ts:3123-3160`); and re-entering always regenerates from
the builder, discarding the previous σ window.

**U7 [code] "z²+c only" is stated in the group titles but not on the overlay checkboxes**, whose
caveat is in `title=` only (`index.html:1602, 1619, 1650, 1659, 1668`) — invisible on touch and to
most assistive tech; the seven z²+c panels stay enabled for any f and only toast on use.
Disabled controls (`#mode` options, `laurent-*`, keyframe buttons) carry no visible reason.

**U8 [browser] Overlay labels clip at the canvas edge** (`c=-0.122561+i*0.74` cut off after the
1/7 navigation); the Herman preset's parameter plane is a flat yellow field with the orbit
polyline mostly off-canvas — a poor first frame for the one preset whose parameter is a rotation
number; a custom f's legend reads "☐ the set".

**U9 [code] Honest labelling is uneven across panels.** The inspector prints "Multiplier λ",
"Distance to set", "Internal angle" and "Limb" with no `≈` while the Julia-properties card marks
the same quantities `≈` (`main.ts:356-419` vs `2167, 2185`); "Ring confirmed" sits beside `≈`
values (and is false per I2); the app is not on `@cas/rigor`, so every `=`/`≈`/`≤` is a hand-typed
string. The glossary says the Artist profile "maxes out anti-aliasing" but `PROFILES.artist.aa = "1"`
(`state/profiles.ts:341`).

**U10 Accessibility [browser+code].** axe is clean on the default page, but opening the
Exterior-map panel introduces `scrollable-region-focusable` (serious, `#exterior-param-list`,
`#exterior-dyn-list`) and twelve `region` findings — the CI roster audits default states only.
The gradient editor is pointer-only (`ui/gradient.ts:519-528`); the onboarding dialog has no focus
trap or return (`withModalFocus` is used only by glossary/help); `#inspector` is `aria-live` on a
region full of inputs, so each click announces the whole report; suggestion severity is
colour-only; `.schwarz-formula-note` at `--muted` × `opacity .6` × 10.5 px is ≈2.8:1 contrast
(*likely*, from tokens); the σ capture-phase keyboard handler pans the field when focus is on a
button, the glossary body or the BibTeX `<pre>` (`main.ts:4535-4614`).

**U11 [code] Duplication that will drift.** "Snap c and re-inspect" is copy-pasted five times
(`main.ts:5666, 5738, 5893, 6070, 6198`); the σ overlay stack six times (`paintSchwarz` vs
`buildSchwarzExportImage`, already diverging); `applyChanges`/`applyPreset` are near-identical
20-call sequences; control defaults live in the HTML, in `PROFILES` and in a hand-written
`reset_all`. `main.ts` is 6,881 lines with zero tests, `plotView.ts` 802 with zero tests, and the
σ enter/exit and `_sigma` round-trip are asserted only by a regex over `index.html`
(`test/schwarzPeerView.test.ts`) whose comment claims Playwright coverage that does not exist.
`no-shadow` (the rule contour-integration adopted after exactly this class of bug) is not enabled
for this app.

---

## 3. Documentation drift

- **README never mentions the σ peer view, the QD → CD import, the CD → Riemann-Map export, or six
  of the nine `@cas/*` packages it depends on**; the Architecture tree lists `src/expr/`, `src/glsl/`,
  `render/uniformize.ts`, `test/df64.test.ts` and four other paths that no longer exist, and omits
  `src/state/`, `src/combinatorics/`, `src/interchange/` and ~50 of the 60 render modules.
  CONTRIBUTING's "gotchas" tell contributors to edit files that now live in `@cas/expr`/`@cas/gpu`.
- **BLA is described as on-by-default (Architecture) and "staged … not yet wired to the GPU kernel"
  (Known limitations; CONTRIBUTING).** It is wired (`glPlot.ts:1431`, `shaderBuilder.ts:279`).
- The supported-function list omits the hyperbolic/reciprocal trig, `gamma`, `factorial`, `zeta`
  (`packages/expr/src/ast.ts:34-73`); "CI runs on every push" is false (build on PRs, browser on
  PRs + master); `npm install` cannot resolve `workspace:*` deps and a stale `package-lock.json` sits
  in the app dir.
- **The in-page citation, Help links, and the PNG `Software` tag still point at
  `github.com/ajgraven/ComplexDynamicsJS`** (`index.html:2644, 2834-2845`; `main.ts:2451, 4269`)
  while the README cites the suite; CD writes `cdjs:state` where `@cas/export` documents `cas:state`;
  two comments still say "PNG tEXt is Latin-1, ASCII only" (`main.ts:2441`, `schwarzState.ts:628`)
  after `@cas/export` gained iTXt.
- FEATURE_RESEARCH §0, FRONTIER_ROADMAP §4 A2 and PERFORMANCE_REVIEW still call perturbation
  "z²+c only" screens after their own shipped lists say general polynomials landed;
  `docs/design/SIGMA-HANDOFF.md`'s status header says "S3 — execute next … not deployed … S4b (GPU σ)
  deferred" when all of that shipped; the root README's CD row lists only "df64 deep zoom".
- README "Connectivity — the rigorous Fatou–Julia verdict" vs the code's own hedged estimate
  (`critical.ts:11-20`); "Fatou-component type … Siegel disc / Cremer" (unreachable, I5); "mate any
  two hyperbolic bulbs" (I7); "stripe average `sin(s·arg z)`" (the shader hard-codes `5.0`).

---

## 4. Conspicuously missing or half-built

Ordered by how close each is to what already exists.

1. **Suite nav header + hand-off picker** (`mountNavHeader` with `handoff:`) — the missing U7; CD is
   the natural first adopter since it already has both a producer and a consumer.
2. **Multi-critical parameter planes.** `findCriticalPoints` already returns every critical point;
   the parameter plane iterates one (0). A per-critical-point colour blend, or at least a picker,
   makes `z³+az+c` slices honest (I6).
3. **A `hashchange` listener and an in-app paste box for import** — permalinks and the QD hand-off
   are the app's interop story and both currently need a reload or a native prompt.
4. **Exact Siegel/Cremer/parabolic classification for z²+c** from the closed-form fixed point (I5),
   and an interior-DE for the Julia plane (`interiorDE.ts:21` is parameter-plane only).
5. **Internal rays, wakes/limbs overlay, Hubbard trees** — roadmap Tier 0/2, zero code; the
   stripping/address machinery makes wakes a small step.
6. **`z^d + c` rays, puzzles and laminations** — every combinatorial panel is z²+c only although
   `polynomialCoeffs`/`juliaExteriorCoeffs` already handle any polynomial.
7. **Deep zoom beyond holomorphic polynomials and 1e28×** — five of sixteen presets are abs-maps
   with no `diffabs` kernel; no BigInt/floatexp reference; no glitch detection.
8. **Rational-map exterior boundary overlay** (deferred at `main.ts:1806, 1967`) and the mating
   engine's Misiurewicz second parent / slow-mating homotopy (`matingEngine.ts:35, 258, 381`).
9. **Export parity** — post-processing in exports, tiled export past `MAX_TEXTURE_SIZE`, an export
   that freezes interaction state for its duration (R6).
10. **Palette studio / side-by-side compare / gallery-embed** — roadmap D-items with zero code;
    lower priority than everything above.

---

## 5. Suggested order of work

1. **One-line fixes with outsized effect:** R1 (vignette), R2 (collar unbind), S1 (gate the Enter
   handler on its target), R3 (legend text), U1 (`change` → apply, or at least a dirty cue).
2. **Instrument honesty:** I1 (iterate to a real DE radius), I2 (a periodicity check before
   "confirmed"), I3 (coincidence tolerance ~1e-9 on refined landings; drop unrefined), I4 (rotate
   about α, satellite-only), I5/I6 (closed-form λ for z²+c; seed from `findCriticalPoints`). Add
   `≈` to the inspector rows and put the app on `@cas/rigor` so the labels are typed.
3. **State integrity:** S2, S3, S4, S6, U2 — and a `test/shell.test.ts` for CD in the
   contour-integration mould (mount `main.ts` under jsdom with `getContext` stubbed) so the shell
   has *any* test; enable `no-shadow` for the app.
4. **Shell UX:** U4 sidebar regrouping and inspector layout, U5 nav header, U6 make σ a real peer
   (keep the sidebar; carry overlays in the link), U7 visible gating text.
5. **Docs:** rewrite README's Architecture/Known-limitations/CI paragraphs, add the σ and
   interchange sections, fix the ComplexDynamicsJS URLs and the `Software` tag, and refresh the
   three research docs' status headers.
6. **Then** the feature list in §4, top down.
