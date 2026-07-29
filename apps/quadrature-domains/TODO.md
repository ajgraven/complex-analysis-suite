# Feature TODO

Curated wishlist of future features for the Quadrature Domain Solver.
Numbers in brackets reference the original suggestion list compiled during
the post-LQD review (see HANDOFF.md change #13 for context).

---

## High priority

Parameter-space cartography and shareability — these are the features that
would most expand the app's research utility and audience reach.

- [x] **#1 — Parameter-slice "Mandelbrot view"**  ✅ shipped
  New "Parameter slice" tab supports both 1-D sweeps and 2-D slices over any
  parameter of h(w) (residue Re/Im, pole position, polynomial coefficient,
  c, q, or w₀). Pixels are categorically classified — valid QD (green,
  brightness ∝ 1/iter), identity-failed (yellow), univalence-failed
  (orange), Newton-diverged (red), no-root (gray), capability-refused
  (slate). Click any pixel to load that φ into the Inverse tab.
  Implementation: `app/param-slice/{param-slice-common,param-slice-pool,
  param-slice-ui}.js`. The Worker pool (#A1 prerequisite, also resolved)
  inline-bundles the solver source as a Blob URL — no build step.
  *(Worker mechanism superseded by the ESM flip — now native module workers;
  see ESM-MIGRATION.md.)*

- [x] **#14 — Riemann-sphere view (unbounded Ω)**  ✅ shipped
  New "Riemann sphere" tab applies stereographic projection so ∞ becomes
  a finite point (north pole). The Schwarz fractal wraps around the sphere
  as a texture; ∂Ω appears as a closed polyline on the surface; finite
  poles and the north-pole ∞-marker are overlaid as billboard markers.
  Orbit/zoom camera controls; soft warning when a bounded φ is captured
  (math is valid, but a spherical-cap view is less informative).
  Implementation: `app/sphere/{sphere-common,sphere-webgl,sphere-ui}.js`.
  Reuses the existing Schwarz GPU shader source via `QD.Schwarz._shaders`
  / `QD.Schwarz._glHelpers` (compiled into the sphere renderer's own GL
  context). Three-pass WebGL 2 renderer: fractal→FBO (cached), textured
  sphere, overlay lines/markers.

- [ ] **#21 — URL state encoding**
  Shareable links: `?tab=schwarz&family=boundedQD&h=...&view=...&iter=64&...`,
  base64-compressed when long. Round-trips the full UI state for sharing in
  chat / papers / lecture notes.

---

## Medium priority

Mathematical structure visualization + dynamics views + output quality.

- [ ] **#2 — Bifurcation diagram**
  For a 1-parameter family, plot some scalar (boundary length, smallest
  |φ′| on ∂𝔻, smallest pole–boundary distance, Hausdorff dim of the
  Schwarz limit set, …) as the parameter sweeps. Companion to #1.

- [x] **#5 — Critical-set image**  ✅ shipped
  Opt-in overlay on the Inverse-tab canvas showing the w-plane images of
  `{z : φ'(z) = 0}`. Each marker is color-coded by severity: **red** for
  zeros strictly inside the relevant disk (univalence is lost), **orange**
  for zeros within 0.05 of `|z|=1` (imminent degeneracy as parameters
  vary), and **gray hollow** for harmless out-of-domain zeros. The
  `|z|` value is labeled next to each non-safe marker so cusps and
  near-cusps are easy to spot.
  Implementation: `app/critical-set.js` (pure-math kernel: complex Newton
  on `φ'(z) = 0` seeded from a polar grid in `|z| ∈ [0.1, 2.4]`, root
  dedup at 1e-5 tolerance, severity classifier). Wired via a checkbox in
  the QD display-options card; results are cached per `phi` reference
  identity in `state.current.criticalSet`. Pairs with #1's parameter
  slice — critical points migrating inside the disk are exactly what the
  classifier flags as `univalence-failed`.

- [ ] **#8 — Cusp / corner detector on ∂Ω**
  Scan the sampled boundary for κ → ∞ (cusps), discontinuous tangent
  (corners), self-intersections. Auto-flag with markers on the canvas.

- [ ] **#10 — Schwarz-function singularity analyzer**
  Auto-tabulate poles, branch points, and essential singularities of S
  inside Ω. Display them on the canvas, labeled. Doubles as a debugging
  aid for the Schwarz tab.

- [ ] **#13 — Side-by-side z↔w view (Schwarz tab)**
  Left panel: 𝔻 (or 𝔻*) with orbits in z-space; right panel: current
  w-plane fractal. Sync clicked-orbit overlays across both.

- [ ] **#16 — Preimage / tile-tree mode**
  Starting from a clicked point in Ω^c, plot all n-th preimages under σ
  as a generation-colored tree, up to a chosen depth. *The* picture of
  the tiling-set construction.

- [ ] **#18 — Domain coloring of σ**
  Color each pixel by `arg(σ(w))` (hue) and `|σ(w)|` (brightness).
  Orthogonal information to escape time; classic complex-function viz.

- [ ] **#22 — PNG / SVG export**
  **PNG shipped** (Figure & export card — high-res off-screen re-render +
  clipboard copy; #171–#175). SVG remains: emit boundary curves + overlays as
  vector primitives. Vector-perfect for papers.

- [ ] **#23 — High-res Schwarz render**
  Render the fractal at 4096² (or custom) in an off-screen GPU buffer,
  download as PNG. Most of the infrastructure already exists.

---

## Low priority

Polish, breadth, and educational layers — nice to have once the higher-
priority features are in.

- [ ] **#3 — Side-by-side comparison (two φs)**
  Hold two captured φs and view them in twin panels with synchronized
  pan/zoom.

- [ ] **#7 — Multiply-connected QDs (annular)**
  Doubly-connected case from the literature. Substantial mathematical
  extension; major effort.

- [ ] **#9 — Curvature plot along ∂Ω**
  Color the boundary by signed curvature; display κ(θ) as a side panel.

- [ ] **#11 — Symmetry detector**
  Auto-detect rotational symmetry order, reflection axes from the h
  data. Display as faint dashed lines on canvas.

- [ ] **#12 — Classical-type classifier**
  Best-match against a library of named examples (cardioid, deltoid,
  ellipse-image, n-cusp epicycloid, …). 30-line lookup with high
  pedagogical value.

- [ ] **#15 — Critical-orbit tracker (Schwarz tab)**
  Overlay deterministic orbits of canonical points: `w₀ = φ(0)` or the
  Blaschke center for singular families.

- [ ] **#20 — Orbit-family sweep**
  Plot orbits starting from a swept line/circle of initial points,
  animated.

- [ ] **#24 — Animation export**
  Encode parameter sweeps / orbit playbacks as WebM/GIF via WebCodecs.

- [ ] **#27 — "Show the math" toggle**
  Per-panel reveal of the actual formulas being used (Faber inversion,
  φ closed form, Newton update, boundary identity). *Partially absorbed
  by HANDOFF #33: every card now has a "?" help button with 1–3 sentence
  explanations. The remaining ask — full formula reveals with current
  numerical values plugged in — is still open.*

- [x] **#28 — Glossary popovers**  ✅ shipped (in spirit) — see HANDOFF #33
  Every card has a "?" button that opens a popover with a brief plain-
  English explanation of what the card does. The original "hover-on-
  terms-in-prose" glossary variant is not implemented; in practice the
  card-level help covers the same need with less plumbing.

- [x] **#32 — Keyboard shortcuts**  ✅ shipped (minimal subset) — HANDOFF #33
  `?` toggles a shortcuts overlay, `Esc` closes popovers and the hover
  tooltip, `Enter` in Param-slice axis inputs triggers Render slice.
  Browser-conflicting shortcuts (Ctrl+S etc.) deliberately omitted.

- [ ] **#33 — Snapshot manager / history**
  Auto-snapshot every successful solve; sidebar shows the last N
  thumbnails; click to restore.

- [ ] **#35 — Touch / mobile gestures**
  Pinch-zoom, two-finger pan, double-tap orbit.

---

## Deferred mathematical work (known TODOs)

These are mathematical gaps surfaced by usage. The UI exposes the controls
honestly (panel visible, inputs editable) but the solver throws a clear
"not yet implemented" error rather than silently producing a wrong φ.

- [ ] **UQDPS-origin-pole — Higher-order pole at 0 for singular power-QDs**
  `app/solver-uqd-pqd-singular.js` (z₀-closure block, ~L329). The current
  `(●_{z₀})` constraint `r(z₀) = 0` (Prop 4.6.3) handles only `h` with **no**
  pole at the origin. The general case — `h` with a pole of order `m₀` at 0 ⇒
  `r` has an order-(m₀-related) root/pole at `z₀` — is not yet derived/handled.
  Surfaced as an in-code TODO; not a bug (the unsupported config is refused).

- [ ] **PQD-branch-tracking — Continuous αth-root branch for α ≥ 3 power-QDs**
  `app/solver-uqd-pqd*.js` boundary sampler + identity verifier (test note at
  `app/test/solvers.test.js` ~L708). `phiTaylorAt_PQD` uses `Taylor.log`'s
  principal branch independently at each boundary sample, which discontinuously
  flips sheets when `R#(z)` winds around 0 on ∂𝔻 (typical for non-trivial
  α ≥ 3 PQDs). Newton still converges, but the boundary samples land on
  inconsistent sheets, so identity verification can fail. Needs continuous
  branch-tracking of the αth root along ∂𝔻. Only α = 2 single-pole presets are
  currently tested.

- [x] **L-poly-h — Polynomial-h support for unbounded LQDs (non-singular)**  ✅ shipped
  Andrew Graven derived the correct formula: apply `Φ_φ⁻¹` not to `h(w)`
  but to `w·h(w)`. The decomposition collapses the finite-pole part of
  `w·h` to exactly the existing modified residues `D_{j,s} = a_j·C_{j,s}
  + C_{j,s+1}` (so the (★)_A equations are unchanged), while the
  augmented polynomial-at-∞ `P̃ = [Σ_j C_{j,1}, C_∞,0, …, C_∞,m_∞]` is
  fed to the *existing* `QD.Faber.inverseFaberAtInfinity` primitive to
  produce the (★)_F targets. Empirically, `β_l = F̃_l` (no Laurent-of-r#
  subtraction); the F̃₀ output is the gauge-absorbed constant and
  discarded. Implementation in `solver-uqd-lqd.js` + new helpers in
  `solver-lqd-common.js` (`rHashLaurentAtInfinity`,
  `phiLaurentAtInfinity_UQDL`, `blaschkeLaurentAtInfinity`,
  `phiLaurentAtInfinity_UQDLS`). 41 new tests; identity verifier
  achieves maxRelDiff ≈ 1e-13 on solved polyPart cases.

- [x] **L-poly-h-singular — Polynomial-h for the SINGULAR unbounded LQD**  ✅ shipped
  Andrew Graven derived the full q-formula via the logarithmic generalized
  Schwarz function S₀(w) = ln(φ·φ#)(ψ(w))/w. The Blaschke identity
  b·b# ≡ 1 makes the numerator finite at w = 0, and the residue gives
  q = ln(c²|z₀|²) + R(z₀) + R#(z₀) where R = r̃# + B(1/z) is the FULL
  exponent including the polynomial-h β-correction. The existing
  `(●₀)` residual equation in `solver-uqd-lqd-singular.js` was the
  β = 0 special case; extending it to add `B(1/z₀) + conj(B(conj(z₀)))`
  gives the correct constraint. With this fix plus the same `β = F̃_l`
  `(★)_F` equations as the non-singular family (computed from
  `phiLaurentAtInfinity_UQDLS` which folds in the Blaschke Laurent at ∞),
  Newton converges at machine precision across all tested polyPart cases.

- [x] **UQDLS-no-finite-poles — Allow `h = q/w + polyPart` (HANDOFF #23)**  ✅ shipped
  The rejection check at `solver-uqd-lqd-singular.js` `normalizeOpts` was
  widened to allow `hData.poles.length === 0` when `polyPart` is nonempty.
  10 new tests; Newton converges at machine precision.

- [x] **LQD-sing-higher-order — Higher-order pole at 0 for singular LQDs**
  Shipped in HANDOFF #24 (synthetic-branch attempt 2). The wrong-form
  `C(1/z)` plumbing was ripped out and replaced with the correct
  synthetic-branch form `r̃#_syn(z) = Σ conj(c_l)·z^l/(1−conj(z₀)·z)^l`
  anchored at z = z₀. `phi.lqdGamma = [c_1, …, c_{m₀}]` is the new
  Newton-vector slot. The (●₀) q-equation gains two closed-form γ-
  correction sums; the new `(★)_Γ` block matches via
  `inverseFaberAtPole(principal, phiTilde_at_z0)` directly (Option A).
  529 tests passing. See HANDOFF.md §7 entry #24 for full detail.

- [x] **LQD-identity-polyPart — polyPart contribution to identity-verifier RHS**
  Shipped in HANDOFF #25 (same session as #24). Closed-form
  `Res_∞(f · h_polyPart) = -polyPart[i] · binom(i+1, i+2−k) · b^{i+2−k}`
  added to `verifyQuadratureIdentity_UQDLS.buildTestFunctions`. All
  HANDOFF #22 UQDLS poly-h tests now check identity at 1e-7 (passing
  at 1e-10 to 1e-14). β-γ interaction case (b) test now checks identity
  and passes at 1e-15. 534 tests total. The polyPart-only-no-finite
  edge case is a separate numerical-conditioning issue, documented in
  HANDOFF.md §10.

- [x] **Schwarz-LQD-polyPart-γ — Schwarz dynamics tab support for
  unbounded LQDs with polyPart and higher-order pole at origin**
  Shipped in HANDOFF #26. The Schwarz module (`app/schwarz/`) had a
  three-layer gap that silently dropped `phi.lqdBeta` (HANDOFF #22) and
  `phi.lqdGamma` (HANDOFF #24): `clonePhi` skipped both fields; CPU
  adapters' `adaptUnboundedLQD` / `adaptUnboundedLQD_singular` omitted
  the B(1/z) term and the γ-merged synthetic branch; GPU shader (`schwarz-
  webgl.js`) similarly lacked β uniforms and γ-merge. Fixed by adding
  `evalBOverZ` / `evalBOverZDeriv` / `evalBConjOfZ` helpers (both CPU
  and GLSL), `MAX_BETA=16` shader constant + `u_lqdBeta`/`u_lqdBetaLen`
  uniforms, and a `withSyntheticBranch` γ-merge idiom mirroring the
  solver's `_phiWithSyntheticBranch`. 5 new Schwarz round-trip tests
  (σ(w) ≈ w on ∂Ω at 3e-13 or better) — including the user-reported
  `h(w)=1, c=1` case that motivated the fix. 542 tests total.

- [x] **CR3 — Code review + README refresh (HANDOFF #27)**
  Targeted cleanup pass after the HANDOFF #22–#26 ship cadence. README
  refreshed (test count, "Known limitations" rewrite, Riemann-sphere
  tab section, recently-shipped section); dead `checkLqdPolynomialGap`
  removed; stale comments fixed; `phi.q` added to Schwarz `clonePhi`;
  `evalB_OverZ` + `bOverZTaylorAt` centralized in `QD.LqdCommon`;
  named constants (`ZERO_THRESHOLD`, `DISK_CLAMP_OUT`, `DISK_CLAMP_IN`,
  `Z0_MAX_RADIUS`, `DEFAULT_FD_EPS`) extracted and exposed on `QD`;
  `_phiWithSyntheticBranch` memoized via a per-phi cache. Tests:
  542 passing (behavior-preserving). See HANDOFF.md #27 for the full
  retrospective + the list of deferred low-priority items.

- [x] **Direct-tab-merge — Fold Direct-problem tab into QD view-toggle**
  Shipped in HANDOFF #30. Direct analog of the sphere → Schwarz merger
  (HANDOFF #29): the standalone Direct tab is now an `inverse | direct`
  segmented control inside the renamed `QD` tab (formerly `QD / LQD`).
  `direct-ui.js`'s `tab-changed` listener is replaced by
  `QD.Direct._mountUI` + `QD.Direct._activate` hooks called from
  `ui.js`'s new `setViewMode()` orchestrator. The `_sendHToInverseTab`
  hook's old `tab-btn.click()` line is now a `setViewMode('inverse')`
  call, preserving the one-click round-trip. 542 tests passing
  (UI consolidation only; no solver/math changes).

- [x] **Sphere-tab-merge — Fold Riemann-sphere tab into Schwarz view-toggle**
  Shipped in HANDOFF #29. Two views of the same σ-iteration are now
  inside one tab: a `plane | sphere` segmented control at the top of
  the Schwarz sidebar switches between them. SphereView is lazy-mounted
  on first toggle to sphere mode. Captured φ + render params (maxIter,
  colormap, scale, modK) shared across both views — no re-capture
  needed. `sphere-ui.js` rebuilt as a `QD.SphereView.mount(opts) →
  handle` adapter (~290 LOC removed). The standalone Riemann-sphere
  tab button + panel removed from `index.html`. 542 tests still
  passing (UI consolidation; no solver/math changes).

- [x] **Sphere-LQD-polyPart-γ — Riemann-sphere tab support for
  unbounded LQDs with polyPart and higher-order pole at origin**
  Shipped in HANDOFF #28. Direct analog of the HANDOFF #26 Schwarz-tab
  fix, applied to the sphere module: `sphere-ui.js` `_clonePhi` now
  carries `lqdBeta` / `lqdGamma` / `q` through; `sphere-webgl.js`
  `setPhi` uploads `u_lqdBeta` / `u_lqdBetaLen` and merges the γ-branch
  into the uploaded branches list for family 5; `schwarz-webgl.js`
  `_gpuCaps` export now includes `MAX_BETA`. Before the fix, the
  sphere shader fell back to `φ = c·z` for any φ with `lqdBeta`,
  rendering `h(w)=1, c=1` as a perfect equator that split the sphere
  into two hemispheres. 542 tests passing (sphere isn't exercised by
  node-test — no WebGL in node — so the gate is solver / Schwarz
  regression).

- [x] **Schwarz-black-circle — Resolved: browser cache**
  Confirmed by Andrew: a hard reload picked up the HANDOFF #26 ship
  and the Schwarz tab now renders correctly for `h(w)=1, c=1` (and
  by extension all other unbounded-LQD polyPart / γ cases). The
  pre-fix code had `φ = c·z` for this configuration (no β-correction
  applied), which gave a unit-disk K rendered as a solid black region
  — exactly matching the reported symptom. No code change required.

---

## Additional suggestions (proposed in this session)

In the spirit of the high- and medium-priority items above: more parameter-
space cartography, more visualization of mathematical structure, more output
support.

### Parameter-space cartography (extends #1, #2, #4)

- [x] **#A1 — Worker-pool inverse solver**  ✅ shipped (with #1)
  Implemented as `app/param-slice/param-slice-pool.js`. Concatenates the
  solver source files into a Blob URL at runtime (no build step), spawns
  `navigator.hardwareConcurrency` workers, and dispatches row-tiled jobs
  with per-row warm-start chaining. Currently used only by the
  parameter-slice tab; trivially reusable by future features.
  *(Blob/no-build mechanism superseded by the ESM flip — now native module
  workers via `app/workers/param-slice-worker-entry.mjs`; see ESM-MIGRATION.md.)*

- [x] **#A2 — Adaptive mesh refinement on parameter slices**  ✅ shipped
  Core quadtree refinement landed under in-conversation task `PS-OPT1`
  (`runAdaptive2D` in `app/param-slice/param-slice-ui.js`) with
  cross-cell warm-start hints from a 16×16 bucket spatial index
  (`PS-OPT3`, `PS-OPT6`). The HANDOFF #31 enhancement bundle closed
  two gaps: (i) the original `cornersAgree` predicate ignored the
  iter-count modulation of VALID-class brightness, so uniform-VALID
  regions with iter-gradient showed coarse stair-stepping — fixed by
  a new `cellIsHomogeneous` predicate that also vetoes the skip when
  iter spread > `REFINE_ITER_DELTA = 8`; (ii) refined sub-pixels now
  consume the coarse pass's iter count via a `_coarseIter` field
  on the warm hint, letting `_solveScenarioBody` speculatively
  tighten `maxIter = min(40, max(12, 2·hintIter))` with a one-shot
  retry on miss to guarantee no misclassification. 11 new tests
  (553 total). See HANDOFF.md §7 entry #31 for the full design.

- [x] **Param-slice identity-rigor knob — false-positive fix**  ✅ shipped
  Users were seeing simple valid QDs marked yellow (`identity-fail`)
  because the worker's per-pixel scenario hardcoded
  `univalenceSamples: 32, identityTol: 1e-5` — 16× / 10× more lenient
  than the inverse tab. Fixed in HANDOFF #32 by raising the default
  to `(N=128, tol=1e-6)` (matches inverse-tab tolerance) and adding
  a 3-preset `Quality` dropdown (Fast / Standard / Rigorous) in the
  Run card. Both warm and cold paths in `_solveScenarioBody` already
  routed `opts.univalenceSamples` / `opts.identityTol` to the
  verifier, so no plumbing changes were needed. 4 new wiring tests
  (557 total).

- [x] **Quality-of-life feature bundle (HANDOFF #33)**  ✅ shipped
  Hover tooltips, "?" help buttons on every card, mini-QD preview card
  in Param-slice, h(w) form / axis-label card, inverse-tab pole-
  proximity hover, Schwarz GPU-mode readout parity, copy-to-clipboard
  on h(w), and a minimal keyboard-shortcut set (`?`, `Esc`, `Enter` in
  axis inputs). Built on a new `app/qol.js` shared primitive module
  exposing `QD.QoL.{attachHelp, attachHoverTooltip, copyButton,
  openShortcutsOverlay, wireGlobalKeyboardShortcuts}`. 9 new tests
  (566 total). See HANDOFF.md §7 entry #33.

- [ ] **#A3 — Continuation path through parameter space**
  Drag from one valid Ω-configuration to another (or click two points in
  a parameter slice) and the app traces a curve through parameter space,
  showing every intermediate Ω as an animation. Uses the existing
  continuation-solver path that already powers warm-start across nearby
  parameters.

- [ ] **#A4 — Critical-c locus for unbounded families**
  In unbounded mode, automatically compute and overlay the critical
  conformal radius c_max(h) beyond which no simply-connected QD exists.
  Plotting this as a curve in the (parameter, c) plane reveals the QD
  family boundary directly.

- [ ] **#A5 — Solution-branch coloring**
  When alternates exist (multiple φ satisfying the same h), color
  parameter-slice pixels by *which* branch the inverse solver lands on.
  Reveals the structure of the solution manifold.

### Mathematical structure visualization (extends #5, #8, #10)

- [ ] **#A6 — Schwarz function level curves**
  Toggle to overlay `|S(w)| = const` and `arg(S(w)) = const` contours on
  Ω. Companion to the domain-coloring (#18). On ∂Ω these become the
  unit-circle level set of conj(w).

- [ ] **#A7 — Branch-locus / ramification visualization**
  Mark on the canvas any point where φ fails to be injective (i.e. where
  φ' = 0 inside the disk). Pairs with #5 (their φ-images on Ω) to give
  the full picture of how the conformal map degenerates.

- [ ] **#A8 — Green's-function level curves**
  Plot equipotentials of the Green's function with pole at φ(0). These
  are the φ-images of the |z|=const circles in 𝔻, useful for showing
  "concentric" structure of the conformal map.

- [ ] **#A9 — Pole–boundary distance gauge**
  For each finite pole a_j of h, display the closest distance from a_j
  to ∂Ω. Small values often predict trouble (poles trying to migrate
  through the boundary as parameters vary). Real-time during edits.

- [ ] **#A10 — Degenerate-configuration auto-detector**
  Bundles #8 (cusps), #5 (critical-set image collisions with ∂Ω), and
  #A9 (close-poles) into a single sidebar "Health" panel that flags
  borderline configurations with explanations.

### Schwarz-dynamics visualization (extends #13, #16, #18)

- [ ] **#A11 — Forward-image of curves under σ**
  Click and drag to draw a curve in Ω; the app shows σ-images of the
  curve under iteration as a family of warped copies. Reveals stretching
  / folding of the dynamics.

- [ ] **#A12 — Limit-set numerical approximation**
  Iterate σ⁻¹ from a seed point and accumulate sampled iterates — the
  classical "chaos game" for limit sets. Overlay on the fractal. Gives a
  quantitative anchor to the tiling-set boundary.

- [ ] **#A13 — Hausdorff-dimension box-counting**
  Numerically estimate dim_H(limit set) via box counting on the iterated
  preimage cloud (or on a thresholded escape-time field). Display the
  log–log plot and slope alongside the fractal. Pairs naturally with
  the bifurcation feature (#2) — track dim_H along a parameter sweep.

- [ ] **#A14 — Cycle finder (periodic orbits)**
  For chosen n, numerically solve σⁿ(w) = w via 2-D Newton; mark the
  period-n points and their cycles on the canvas. Adds the "where are
  the fixed points" picture missing from current dynamics view.

### Output and reproducibility (extends #21, #22, #23, #24)

- [ ] **#A15 — Session JSON export / import**
  Single button "save session" / "load session" that round-trips the
  entire app state (φ snapshot, view, tab, renderer settings, all
  parameters). Complements #21 for sessions too large for a URL.

- [ ] **#A16 — Reproducible "math notebook" export**
  Bundle the session JSON (from #A15) with a markdown description, the
  rendered PNG (from #22), and a list of the parameter values used.
  Output as a single .zip or .json+files. The natural way to attach a
  computational experiment to a paper draft.

- [ ] **#A17 — Citation panel**
  One-click copy of a BibTeX entry for the thesis and the app; plus
  LaTeX export of the current h(w) / φ(z) formulas in `\frac{}{}` form.
  Five minutes to implement, surprisingly useful.

- [ ] **#A18 — Embeddable iframe mode**
  Strip chrome to just the canvas + minimal controls, lock to a specific
  URL-encoded configuration (#21). Suitable for embedding in lecture
  notes / blog posts. ~½ session.
