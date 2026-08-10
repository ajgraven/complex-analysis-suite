# Complex Function Plotting Tool — Construction & Implementation Plan

> **Status:** IN PROGRESS — **Phases 0–4 complete**; **Phase 5 (the 3D engine) core landed** — analytic
> **landscape** (5A), **shading** (5B: analytic `f'/f` normals + specular), the **∞-inspector** (F8), and
> the **Riemann sphere** (5C / F7); linked 2D↔3D nav (5D) + the 3D-slice extraction ADR are **parked**.
> **Phase 6 (export, interop, a11y → publish) underway** — **hi-res PNG export + reproducibility metadata +
> copy-image (6A)**, **suite interop (6B: import/export a map, → Complex Dynamics)**, and **keyboard / touch
> / CVD accessibility (6C)** have landed; only the **publish flip (6D)** remains. See the Build-progress
> record below. Scope approved 2026-08: **Core + v1 (67 items)** as the build target; **Later + Exploratory**
> tracked as a backlog.
> This document is the _how_;
> the _what_ is the itemized catalog (IDs `A1…L8` are used throughout). Companion docs:
> [`complex-function-plotter-research-notes.md`](complex-function-plotter-research-notes.md) (the
> literature/tool survey), and the suite guardrails in [`../../CLAUDE.md`](../../CLAUDE.md) →
> [`../ARCHITECTURE.md`](../ARCHITECTURE.md) / [`../DECISIONS.md`](../DECISIONS.md).
>
> The plan mirrors the suite's proven runbook style ([`../MIGRATION.md`](../MIGRATION.md)):
> **phase gates that are each shippable, motivating wins early, a ground-truth validation per
> phase, and test-guarded shared-package changes.** Nothing here re-litigates a locked ADR;
> where a new decision is needed, it is flagged as an ADR to write.

---

## Build progress (living record)

> Updated as phases land, so a resumed session knows exactly where to pick up. Work lands as small,
> CI-green commits on branch `claude/complex-function-plotter-mntjsq` (built-but-unpublished). Item IDs
> are the [catalog](complex-function-plotter-research-notes.md)'s. The app also has its own
> [`README`](../../apps/complex-function-plotter/README.md); this table is the phase-level record.
> The new app is recorded in [ADR-0010](../DECISIONS.md#adr-0010-complex-function-plotting-tool-as-a-separate-app).

| Phase                                   | Status             | Commits                                    | Coverage (item IDs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 — Scaffold & walking skeleton**     | ✅ done            | `d47e815`                                  | app registered; fixed `z²` phase portrait proving the `@cas/expr → @cas/gpu` chain; L5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **`@cas/expr` hyperbolics (B3)**        | ✅ done            | `f74a9b7`                                  | sinh/cosh/tanh, arc-versions, sec/csc/cot added suite-wide (5-table checklist + parity tests)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **1 — Live 2D domain coloring**         | ✅ done            | `1f98005` (1A), `d98c57d` (1B)             | A1–A4, B10, C1–C4, D1, H1, I1–I4, J1–J2, K1(basic)/K2, L3/L5/L6 · GT: Wegert plate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **2 — Instrumented 2D research tool**   | ✅ done            | `cfca14d`, `f3eb87b`, `2b72e63`, `e894be1` | D2–D6, C5–C7, E1–E3, H2, H7, J3, J4, L4 · GT: conformal grid (exp→square, z²→pinch), zero/pole counts, `\|z²−1\|=1` lemniscate, `e^(1/z)` uncertainty hatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`@cas/expr` named params (B4)**       | ✅ done            | `554c734`                                  | [ADR-0011](../DECISIONS.md#adr-0011-casexpr-named-parameters); `freeParameters`, JS param-map + legacy positional `a`, GLSL `uParam_<name>` aliases (legacy `a→uA`); CD `expr`/`glslCodegen` + `paramA` green before & after                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **G1 — parameter controls**             | ✅ done            | `2886f3d`                                  | per-`freeParameter` ℂ-pad + re/im + real slider (`ui/params.ts`), `uParam_<name>` uniforms (re-uniform on drag), params in the share-link, instruments track the values; headless-verified (`a*z*(1-z)+b` compiles + renders)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **G2 — animation variable `t`**         | ✅ done            | `8a019dc`                                  | `t` transport (play/scrub/loop/speed, `ui/animate.ts`) driving the `uParam_t` uniform; anim config in the share-link; pure `stepT` unit-tested; headless-verified (`a*z*exp(i*t)` plays, `t` excluded from the ℂ-pad list)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **G4 — parameter sweep**                | ✅ done            | `58dc934`                                  | small-multiples montage across a parameter's range (`ui/sweep.ts` + `Plot.renderThumbnail`), click-a-cell to jump; pure `sweepValues` unit-tested; headless-verified (9 distinct thumbnails, pick sets the value, no flicker)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **`@cas/expr` literals & consts (B5)**  | ✅ done            | `ae9be23`                                  | imaginary literal `2i` (lexer `imag` → `num·i`, binds as a unit under `^`) + constants `tau`/`phi`/`γ` across evaluate/glsl/derivative/latex; dual-backend parity tests; headless-verified (all four compile + render on GPU)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **A5/A7/A9 — input niceties**           | ✅ done            | `72bb04f`                                  | name autocomplete (`ui/autocomplete.ts`), two function slots `f`/`g` with a toggle, copy-as-LaTeX; pure `wordAt`/`filterCandidates` unit-tested; headless-verified (toggle, autocomplete insert, clipboard `f(z) = z^{2}`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **3 — Parameters & families**           | ✅ **done**        | _all items landed_                         | ~~B4~~ · ~~G1~~ · ~~G2~~ · ~~G4~~ · ~~B5~~ · ~~A5/A7/A9~~ ✅ · GT: Blaschke `(z−a)/(1−ā z)` family animates (drag `a`, or drive `a=0.6·exp(i·t)`), zeros stay in the disk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Γ — gamma (B6, part 1)**              | ✅ done            | `b57339b`                                  | Lanczos `gamma` — JS + derived GLSL `cgamma` (both precisions, reflection branch); dual-backend corpus entry; JS known-value tests + numeric GLSL probe (rel err ≤ 2e-5, both branches); non-differentiable (no digamma)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **ζ — zeta (B6, part 2)**               | ✅ done            | `5ec772c`                                  | Borwein `zeta` — JS + derived GLSL `czeta` (`d_k` recurrence, reflection reuses `cgamma`); corpus entry; tests (ζ(2/4/0/−1/−3), trivial + first nontrivial zeros, pole at 1) + numeric GLSL probe (both branches); non-diff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **f32 precision badge**                 | ✅ done            | `1efefb1`                                  | honest-labeling for float32 special fns: `calledFunctions(node)` in `@cas/expr` + pure `ui/precision.ts` policy (ζ warn ~1e-6, Γ note) → a badge under the formula labels a ζ/Γ map `≈`; unit tests both sides; headless-verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **D8 — DLMF colouring mode**            | ✅ done            | `a795708`                                  | two DLMF phase colormaps (`dlmf-warped` = the piecewise hue warp, anchors red/yellow/cyan/blue; `dlmf-quadrant` = the blue/green/red/yellow four-colour indicator, a step map) appended as atlas rows; height = the modulus transfer; unit tests + headless Γ/ζ GT (quadrant colours at sampled pixels)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **4 — Special functions & DLMF**        | ✅ **done**        | _all items landed_                         | ~~Γ~~ ✅ · ~~ζ~~ ✅ · ~~ζ/Γ f32 precision badge~~ ✅ · ~~D8 (DLMF colouring mode)~~ ✅ · GT: DLMF Γ/ζ plates (four-colour + warped-hue × height)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **5A-i — 3D math kit**                  | ✅ done            | `82fb254`                                  | app-local `render3d/` foundation: typed column-major `mat4` (+ `ortho`/`transformPoint`, ported from QD `sphere-common`), the F5 orbit camera (Z-up; exact top-down ortho = 2D portrait, unit-proven), and `buildGridMesh`; pure + fully unit-tested (no renderer yet — the 2D app is untouched)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **5A-ii — analytic landscape**          | ✅ done            | `f08b8fe` (+ `859cc3a` sweep-scrim fix)    | the surface render (F1/F5/F6): grid mesh vertex-displaced by height (log \| linear \| stereographic), fragment recomputes `f` + reuses `colorAt`; `Plot` gains a 2d/3d `mode` + orbit/dolly + height UI; simple dFdx/dFdy shading (off top-down). Headless GT: **top-down == 2D pixel-for-pixel (maxDiff 0)**, orbit works                                                                                                                                                                                                                                                                                                                                                                                                      |
| **5B — on-surface shading**             | ✅ done            | `eab62e4`                                  | **analytic normal** from `f'/f` (F4, `differentiate`→`fpFn`; geometric fallback for Γ/ζ/anti-holo), wrap-diffuse + optional **specular** (F2), on-surface enhancement (F3, free via `colorAt`). Fixed a link error: `uHeightMode` (int, both stages) needed `precision highp int` — a unit-test guard now pins it. Headless GT: z² analytic + Γ geometric render, specular brightens, top-down still == 2D                                                                                                                                                                                                                                                                                                                      |
| **5C-i — ∞-inspector (F8)**             | ✅ done            | `bf84300`                                  | plot **f(1/z)** so the origin shows the map near ∞: a new `@cas/expr` `substitute(node, name, repl)` (capture-safe) does `z → 1/z` on the AST, so the 2D + surface GPU and the CPU instruments all track the same map; an `Inspect ∞` checkbox. Headless GT: on `f(z)=z` the origin flips from a dark zero to a bright pole, the portrait inverts (98.7%), restores                                                                                                                                                                                                                                                                                                                                                             |
| **5C-ii — Riemann sphere (F7)**         | ✅ done            | `11e8f35`                                  | the extended plane ℂ∪{∞} as a literal **sphere**: a fullscreen per-fragment **ray-cast** of the unit sphere, stereographically projected (south=0, equator=\|z\|=1, **north=∞**) and coloured by the same `colorAt`; a quaternion **arcball** drag (ported from CD `sphereView`) + dolly, added as a third `mode` behind a 3-way **View** toggle. Control flow stays uniform (masked miss, normalized hit) so `colorAt`'s `fwidth` is defined. Headless GT: lit silhouette on the app bg, z=0 centre dark, arcball rotates 51.7%, dollies, 2D restores                                                                                                                                                                          |
| **5 — 3D engine**                       | 🔨 **in progress** | _5A + 5B + 5C done; 5D linked nav next_    | F1–F8, I7 (+ the 3D-slice extraction ADR) · ~~5A-i kit~~ ✅ · ~~5A-ii landscape (F1/F5/F6)~~ ✅ · ~~5B shading (F2/F3/F4)~~ ✅ · ~~F8 ∞-inspector~~ ✅ · ~~5C-ii Riemann sphere (F7)~~ ✅ · next: 5D linked nav (I7) + extraction ADR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **6A — publication export**             | ✅ done            | `150464b`                                  | **hi-res PNG export** (K1): any view (2D / landscape / sphere) re-renders at a chosen long-edge — clamped to the GPU `MAX_TEXTURE_SIZE` — via `Plot.exportBlob` (the `preserveDrawingBuffer` context means grow-buffer→paint→`toBlob`, no FBO); **reproducibility metadata** (K3): the share-link is embedded as PNG `tEXt` (`render/pngMetadata.ts`, ported from CD) so a figure carries its exact map/view; **copy-image** (K9) writes the same to the clipboard. Pure size algebra in `render/exportImage.ts`. Headless GT: a 2000px portrait downloads with `Software` + `cfp:url` tEXt, clipboard copy works, live view restores                                                                                           |
| **6B — suite interop (K7/K8)**          | ✅ done            | `ec5de49`                                  | the `@cas/interchange` `#s=` hand-off. **Import** (K7, `interchange/importMap.ts` ported from CD): a QD φ / a saved View / a bare rational·Laurent·expr map → an `@cas/expr` source; a numerical Schwarz **σ isn't a closed form**, so the plotter plots its generating **φ**, honestly labelled. **Export** (K8, `interchange/exportView.ts`): the current map+view → a `view` Envelope + `#s=` link, and **→ Dynamics** opens it in Complex Dynamics (which reads `#s=` on load). Every converted coeff string is re-parsed through `@cas/expr` (no silent factor error; ADR-0006 CANONICAL). Round-trip GT: the deltoid φ imports+renders, a z² link round-trips in the plotter AND re-opens in CD (`#inpf` = z²), no errors |
| **6C — accessibility (L7/L8)**          | ✅ done            | _⚠ backfill hash next commit_              | **keyboard nav** (L7, `ui/navigation.ts` pure `keyToNav`): the focusable canvas takes arrows (pan / orbit / arcball), `+`/`-` (zoom / dolly), `0`/`Home` (reset) — mode-aware, same ops as the pointer path; **two-finger pinch-zoom** (pure `pinchFactor`) added to the pointer handlers; canvas `role`/`aria-label`. **L8**: a UI note points to the colorblind-safe colormap + CVD preview (DLMF four-colour honestly flagged not-CVD-safe). Headless GT: 2D pan/zoom + **Home restores exactly (diff 0.000)**, 3D orbit, sphere arcball, pinch-zoom all change the image; canvas focusable + labelled                                                                                                                       |
| **6 — Export, interop, a11y & publish** | 🔨 **in progress** | _6A + 6B + 6C done; 6D publish next_       | K1, K3, K7, K8, K9, L7, L8 → **publish** · ~~6A export (K1/K3/K9)~~ ✅ · ~~6B interop (K7/K8)~~ ✅ · ~~6C a11y (L7/L8)~~ ✅ · next: **6D publish** (launcher card → link + `deploy-pages.yml`; re-surface 5D + the extraction ADR)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Workspace state at the Phase-2 gate:** green — `pnpm typecheck` / `pnpm lint` (+ dependency-cruiser) /
`pnpm test` (**2406** tests, incl. the app's `smoke` / `colormaps` / `colorShader` / `viewState` /
`presets` / `singularities` specs) / `pnpm build`.

**Local render verification** (used to validate each phase — the string tests don't compile GLSL): build,
serve `apps/complex-function-plotter/dist` with a static server, and drive the **pre-installed** Chromium
via Playwright — `chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args:
["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] })`
(do **not** run `playwright install`). A `/favicon.ico` 404 from the static server is expected/harmless.

**Resume notes — Phase 5 underway (3D engine): 5A landscape + 5B shading + F8 ∞-inspector + 5C Riemann sphere landed; linked 2D↔3D nav (5D) next:**

- **✅ Phase 3 is complete (B4 · G1 · G2 · G4 · B5 · A5/A7/A9).** `@cas/expr` named parameters
  ([ADR-0011](../DECISIONS.md#adr-0011-casexpr-named-parameters)) are backward-compatible:
  `freeParameters(ast)` lists the bindable names; `makeComplexFn(ast, { a, b, … })` / `getComplexFn` take
  a name→value map (legacy positional `Complex` for `a` still works); `compileF(ast, "fFn", { params })`
  aliases each from a `uParam_<name>` uniform. In the app, `Plot` owns the parameter names/values/locations
  (`compileSource` preserves a surviving parameter's value across formula edits, defaults a new one to
  `[1, 0]`) plus `renderThumbnail`; `ui/params.ts` = ℂ-pad + re/im + slider per name; `t` gets a transport
  (`ui/animate.ts`); `ui/sweep.ts` = the small-multiples montage; `ui/autocomplete.ts` = the name
  autocomplete; `main.ts` holds the `f`/`g` slots + toggle and rebuilds the instruments
  (`makeComplexFn(fAst, plot.paramsRecord())`) so CPU ≡ GPU. `state/viewState.ts` round-trips
  `exprF`/`exprG`/`active` + `params` + `anim` (the sweep is transient). B5 added `2i` / `tau` / `phi` / `γ`
  to `@cas/expr`. (Phase-3 GT: the Blaschke `(z−a)/(1−ā z)` family animates with its zero in the disk.)
- **Phase 4 underway — special functions & DLMF.** **✅ Γ and ζ done**, both as derived functions in
  `@cas/gpu` (`cgamma` = Lanczos g=7; `czeta` = Borwein with a `d_k` recurrence, its reflection reusing
  `cgamma` — GLSL has no recursion, so each splits a `…Core` out) with JS twins sharing the algorithm;
  wired through ast/evaluate/glsl/latex; both non-differentiable (no digamma / ζ′). Verified per function:
  JS known-value tests + a numeric GLSL probe over both branches (Γ ≤ 2e-5; ζ core ~1e-7, reflection via
  cgamma exact to f32, first nontrivial zero ≈ 3e-5). Both registered in `@cas/gpu` `DUAL_BACKEND_CORPUS`.
- **✅ f32 precision badge done (honest-labeling).** Because the renderer evaluates in GLSL `float`, a map
  that calls a precision-limited special function is now labelled. `@cas/expr` gained `calledFunctions(node)`
  (the call-side companion to `freeParameters`); the app's pure `ui/precision.ts` maps that set to the
  strongest note — ζ **warns** (Borwein f32, ~1e-6, degrading up the strip), Γ gets a milder **note** — and
  `main.ts` shows a badge under the formula (`updatePrecisionBadge` on each `applyExpr`). Both sides
  unit-tested; headless-verified (`zeta(z)` shows the warn badge, `gamma(z)` the note, `z^2` none).
- **✅ D8 — DLMF colouring mode done (Phase 4 complete).** The NIST DLMF's conventions
  ([`aboutcolor`](https://dlmf.nist.gov/help/vrml/aboutcolor)) land as **two colormaps** appended to the
  atlas — `dlmf-warped` (the piecewise hue warp `hue° = 60·f(4t)`, anchors red/yellow/cyan/blue) and
  `dlmf-quadrant` (the blue/green/red/yellow four-colour indicator, a step map flagged `continuous:false`
  so the continuity test skips it). No shader/uniform/state change — the dropdown, atlas, index-clamping,
  phase-wheel legend, and share-link all key off `COLORMAPS`, and a DLMF figure is one of these maps × a
  modulus transfer (the DLMF's "height"). GT: Γ and ζ rendered in both DLMF maps, quadrant colours checked
  at sampled pixels (headless). The DLMF 3D height-rainbow surface is a Phase-5 concern.
- **Phase 5 underway — the 3D engine (sub-milestones 5A landscape → 5B shading → 5C sphere → 5D linked
  nav + extraction ADR).** **✅ 5A-i, the pure 3D math kit, is landed**: app-local `render3d/` — typed
  column-major `mat4.ts` (identity/multiply/lookAt/perspective/`ortho`/`transformPoint`, ported from QD's
  `sphere-common.mjs`), `camera.ts` (the F5 orbit camera in a **Z-up** world: world `(re, im, height)`;
  `azimuth`/`elevation`/`distance`/`fov`/`ortho`; the `TOP_DOWN` ortho preset projects `(re, im)` to the
  same screen point as the flat shader, so **top-down = the 2D portrait** — unit-proven), and `mesh.ts`
  (`buildGridMesh(n)`). Pure + fully unit-tested; the 2D app is untouched.
- **✅ 5A-ii, the analytic-landscape render, is landed (5A complete).** `render3d/height.ts` +
  `surfaceShader.ts` add the F1 height law (`heightAt` / GLSL `surfaceHeight`: log|f| clamped · linear ·
  bounded stereographic) and the surface program: the vertex evaluates `f` at each grid point and lifts
  it by the height; the fragment **recomputes `f` from the interpolated world `(re, im)` and reuses the
  exact same `colorAt`** (the UV→world map is affine, so the interpolated coordinate is exact — the colour
  is pixel-crisp at any mesh resolution). `Plot` grew a `mode` (2d/3d), the orbit camera, height mode/scale,
  a grid VAO, and the surface program (rebuilt with `f`); `main.ts`/`index.html` got a **2D/3D toggle**,
  height controls, a **Top-down** snap, and orbit-drag / dolly-wheel (pan/zoom stay in 2D). Shading is a
  hue-preserving dFdx/dFdy Lambert, **off in top-down** (`uShaded`) so it equals the 2D portrait. Headless
  GT (`gamma(z)`): **top-down == 2D pixel-for-pixel (maxDiff 0)**, the landscape renders, orbit changes the
  image, 2D restores. (A pre-existing bug surfaced here: `.sweep-overlay {display:flex}` overrode the
  `hidden` attribute, so the sweep scrim covered the plot — fixed in `859cc3a`.)
- **✅ 5B, on-surface shading, is landed (F2/F3/F4).** `Plot.compileSource` now also compiles
  `differentiate(ast, "z")` → `fpFn` (or null for Γ/ζ/anti-holomorphic); the surface fragment uses the
  **analytic normal** `n = normalize(−H'(|f|)·∇|f|, 1)` with `∇|f| = (Re,−Im)(conj(f)·f')/|f|` (F4, smooth
  per-pixel), falling back to the geometric screen-space normal when there's no `f'`. Lighting is a wrap-
  diffuse hue-preserving multiply + an optional **specular** highlight (F2, a `Specular` checkbox); the
  on-surface enhancement overlay (F3) comes free from the reused `colorAt`. Both light terms are gated off
  in top-down (`uShaded`), so **top-down still == 2D**. `height.ts` gained `heightSlopeAt` (the GLSL
  `surfaceHeightSlope` mirror). **Bug found + fixed:** `uHeightMode` (an `int` in both stages) needs an
  explicit `precision highp int` or the program fails to _link_ — the Plot ctor threw and `main()` bailed,
  and the too-loose GT (lit-fraction / maxDiff) was fooled by the blank canvas; the GT now asserts `#error`
  is empty and a unit test pins the `highp int`. Headless GT: z² (analytic) + Γ (geometric) render, specular
  brightens ~36% of pixels, top-down maxDiff 0.
- **✅ F8, the ∞-inspector, is landed (5C-i).** A new `@cas/expr` `substitute(node, name, replacement)`
  (capture-safe — it walks the original and never re-traverses the inserted subtree, so `z → 1/z`
  terminates) lets the plotter plot **f(1/z)** on an `Inspect ∞` toggle: `Plot.compileSource` substitutes
  when `inspectInfinity` is set (so the 2D program **and** the surface program get `f(1/z)`), and `main.ts`
  applies the same substitution to the instrument AST — GPU and CPU track one map. Headless GT: on `f(z)=z`
  the origin flips from a dark **zero** to a bright **pole** (f near ∞), the portrait inverts (98.7% of
  pixels), no compile error, and it restores.
- **✅ 5C-ii, the Riemann sphere, is landed (5C complete).** `render3d/sphere.ts` (a quaternion + arcball +
  stereographic kit **ported from CD's `sphereView.ts`** — apps can't import each other) and
  `render3d/sphereShader.ts` (a fullscreen **ray-cast** fragment) add a third `mode` = `"sphere"`: the fixed
  `+Z` camera shoots a ray per pixel, intersects the unit sphere, maps the world hit into the sphere's frame
  via `uWorldToModel` (the inverse of the drag's accumulated orientation quaternion), stereographically
  projects it (`sphereToZ`: south pole = 0, equator = |z| = 1, **north pole = ∞**), evaluates `f`, and colours
  it with the **same `colorAt`** — so ∞ is a literal point you can rotate to the top. Control flow is kept
  **uniform** (a miss is masked, not an early `return`, and the hit is normalized) so `colorAt`'s `fwidth`
  stays defined at the silhouette and a miss can't NaN. `Plot` grew `sphereProgram`/`sphereVao`/
  `sphereRotation`/`sphereDist` + `rebuildSphereProgram`/`paintSphere`/`rotateSphere`/`dollySphere`/
  `resetSphere`; `main.ts`/`index.html` got the **3-way View toggle** (2D / 3D / Sphere) with arcball-drag +
  dolly-wheel on the sphere. `sphere.test.ts` pins the quaternion/arcball identities, the `worldToModel`
  inverse-orientation invariant, and the JS↔GLSL `sphereToZ` parity. Headless GT: a lit silhouette on the app
  bg, the z = 0 centre dark (for `f(z)=z`), arcball rotation changes 51.7% of pixels, dolly works, 2D
  restores. (Note: the naive `sphereToZ` floor caps a real unit point at |z| ≈ 1414; the `1e8` clamp is a
  guard against a degenerate GPU hit, unit-tested with an off-sphere input.)
- **⏸ 5D is parked (linked 2D↔3D navigation I7 + the 3D-slice extraction ADR).** The Phase-5 gate (an
  orbitable, correctly-shaded landscape + sphere; top-down == the 2D portrait) is met, so at the user's
  direction Phase 6 went first. Two items remain: **I7** — a synced side-by-side (pan/zoom in the flat view
  drives the surface's domain and back); and the **3D-slice extraction ADR** — QD, CD, and the plotter now
  each carry a mat4 / sphere kit (three consumers), so the ADR-0007 trigger is met, but the extraction itself
  is a downward-refactor (likely into `@cas/gpu`, or `@cas/core` whose index already reserves "mat4/camera";
  §1.6 / §4) that should be a deliberate, asked-for step — **re-surface both at the publish gate (6D)** so the
  Definition of Done (§7, "three ADRs written") isn't silently marked complete. Persisting the 3D view
  (mode/camera/height/sphere rotation) in the share-link is a small deferred polish (those views are
  transient, like the sweep).
- **✅ 6A, publication export, is landed (Phase 6 begins).** `Plot.exportBlob(longEdge, metadata)` re-renders
  **any** mode at a chosen long-edge (clamped to the GL `MAX_TEXTURE_SIZE`) and reads it back as a PNG —
  simpler than CD's strip-FBO path because the plotter's context is `preserveDrawingBuffer`, so it's just
  grow-the-buffer → `paint()` → `toBlob` → restore with a normal `draw()`. Two pure app-local modules back it:
  `render/pngMetadata.ts` (K3 — the `tEXt` inject/read **ported from CD**, apps can't import; this deliberate
  copy is the ADR-0007 second consumer to watch) embeds the share URL so a figure reproduces itself, and
  `render/exportImage.ts` (K1 — clamp / aspect-preserving dims / filename sanitising). `main.ts` gains a size
  `<select>`, upgrades **Save PNG** to `exportBlob`, and adds **Copy image** (K9; the export promise is handed
  straight to `ClipboardItem` so the blob resolves inside the user gesture). Headless GT: a 2000px portrait
  downloads at the right dims with `Software` + `cfp:url` tEXt, the clipboard copy carries the same, and the
  live view restores. (Export is the bare GL figure — axes/legend overlays aren't composited; a later polish.)
- **✅ 6B, suite interop, is landed (K7/K8).** `interchange/importMap.ts` (K7) — ported from CD's
  `mapSpecToExpr` + `envelopeToMapSpec`, minus the `@cas/schwarz` engine — decodes an `#s=` link or JSON
  Envelope into an `@cas/expr` source: a QD `quadrature-domain` φ, a `view`'s map, a bare `map`, or the
  rational/Laurent/expr forms directly. Two shapes it **refuses loudly rather than mis-render**: a `schwarz`
  σ (numerical inverse — the plotter instead plots its generating **φ** with an honest note) and a
  pole-bearing Laurent map (finite-pole `branches`). `interchange/exportView.ts` (K8) packages the current
  map+view as a `view` Envelope (`expr` map + viewport, provenance, CANONICAL by construction — `view`
  carries no conventions to mis-tag) → an `#s=` link; `cdHandoffUrl` builds the sibling-app deep-link, and
  CD reads `#s=` on load (`main.ts:3508`, verified) so **→ Dynamics** works. `main.ts` adds an Import / Copy
  hand-off / → Dynamics group + an honest `#interopNote`. The key correctness guard: every converted
  coefficient string is **re-parsed through the same `@cas/expr`** the render uses (a factor/syntax error
  can't slip a wrong map past — the ADR-0006 silent-error class). GT (two real apps): the deltoid φ imports
  - renders (`(1)*z + (0.5)/z^2`), a z² hand-off link round-trips in the plotter AND re-opens in CD
    (`#inpf` = `z^2`), no page errors. (Note: the cross-app `#s=` link carries the map + viewport, not live
    parameter VALUES — interchange's `expr` map has no value slot — the plotter's own `#vs=` link does that.)
- **✅ 6C, accessibility, is landed (L7/L8).** `ui/navigation.ts` (pure) gives `keyToNav(key)` → a
  mode-agnostic intent and the `pinchFactor`/`pointerDistance`/`pointerMidpoint` pinch math. `main.ts` makes
  the canvas focusable (`tabindex`/`role`/`aria-label`) and adds a `keydown` handler that dispatches the
  intent per View mode — arrows pan (2D) / orbit (3D) / arcball-step (sphere), `+`/`-` zoom-about-centre or
  dolly, `0`/`Home` reset — reusing the very `zoomAt`/`orbit`/`dolly`/`rotateSphere`/`resetCamera` the
  pointer path uses. Touch: the pointer handlers now track an `activePointers` map, so a **second finger
  starts a pinch** (abandon the single drag, seed the span; `pinchFactor` → `zoomAt`/`dolly`/`dollySphere`);
  single-finger pan/orbit/arcball already came free from PointerEvents. **L8**: an `index.html` note points
  colorblind users at the colorblind-safe colormap + the CVD-sim preview (the DLMF four-colour map stays
  honestly flagged not-CVD-safe). Headless GT: 2D pan/zoom + **Home restores the start exactly (diff 0.000)**,
  3D orbit, sphere arcball, and a two-finger pinch all change the image; the canvas is focusable + labelled.
- **Next — 6D, publish (the phase gate).** Flip the launcher card from "Coming soon" to a `complex-function-plotter/`
  link (mirror the CD/QD cards) and add one `cp -r apps/complex-function-plotter/dist _site/complex-function-plotter`
  line to `deploy-pages.yml`'s assemble step (the plotter ships **no workers**, so `check-built-artifacts.mjs`
  needs no change — verified). **Before** flipping, re-surface the two parked items to the user: **5D**
  linked-nav (I7) and the **3D-slice extraction ADR** (three consumers now: QD/CD/plotter) — §7's Definition
  of Done lists "three ADRs written", so publishing shouldn't silently mark it complete with that ADR
  outstanding. Publishing is outward-facing — pause for an explicit go-ahead on the flip itself.
- **Adding a render knob** follows the established `ColorState` pattern in `render/plot.ts`: field +
  `Uniforms` entry + default + `getUniformLocation` + a `gl.uniform*` in `render()`; then a control in
  `index.html` + wiring in `main.ts`; persist via `state/viewState.ts` (`PlotterState` + `decodeState`
  default) **unless** it is a transient viewing aid (CVD, zero/pole markers, and level sets are
  deliberately _not_ persisted). Multi-parameter sliders (G1) reuse the single-`a` uniform-refresh idea
  but need the expr change first.
- **Instruments** compute on the CPU via `@cas/expr` `makeComplexFn` (+ `differentiate` for `f'`);
  `analysis/singularities.ts` is the template. GPU coloring is the layered `colorAt`
  (`render/colorShader.ts`): phase LUT × modulus transfer × `fwidth`-AA enhancement, then level sets,
  the uncertainty hatch, and the CVD pass.

---

## 0. Scope locked this session

- **App:** a new, separate app `apps/complex-function-plotter` (peer to the other three; **not** a
  mode inside another app). Human title **"Complex Function Plotting Tool"**; package id
  `complex-function-plotter`; dev port `5176`.
- **Mathematical scope:** **principal-branch only** — elementary holo/meromorphic + hyperbolics +
  anti-holomorphic (`conjugate`) + a staged special-function set (Γ, ζ first). **No** multivalued /
  branch-cut / Riemann-surface machinery (that stays a roadmap item tied to a future `@cas/expr`
  multivalued phase, ADR-0005).
- **Representations:** 2D domain coloring first; then a 3D analytic-landscape surface + Riemann
  sphere. **Hand-rolled on `@cas/gpu`** — no 3D framework.
- **Priorities:** real-time interactivity + publication-quality export are core; **df64 deep-zoom is
  backlog** (substrate exists, not wired); real-time parameter animation (`t` scrubber, G2) is v1,
  **video capture (G7) is backlog**.
- **Suite citizenship:** consume/emit `@cas/interchange`; **built-but-unpublished** until a quality
  gate (exactly as Correspondences was), then flipped to published.
- **Ground-truth references** (the "deltoid-equivalent" validation, approved default): **Wegert
  enhanced phase-portrait plates** (Wegert–Semmler, _Notices AMS_ 2011) and a **DLMF Γ/ζ** plot;
  golden numeric values cross-checked against **ComplexPhasePortrait.jl / DomainColoring.jl**.

---

## 1. Architecture & cross-cutting decisions

These shape every phase; settle them once.

### 1.1 The layered coloring shader (core rendering model)

Every 2D coloring "mode" is a **composition of shared primitives**, not a bespoke shader:

```
finalColor = phaseColor( arg w )                       // 1D LUT texture (swappable colormap)
           × modulusLightness( |w| )                   // selectable transfer function (D1)
           × Π overlayₖ( Re w, Im w, |w|, arg w )      // fwidth-AA isoline / tile layers (D2–D6, E1–E3)
```

Factor this into one GLSL chunk — `vec3 colorAt(cvec w, cvec dwdz)` — that is `#include`-style
concatenated into **both** the 2D fullscreen-quad fragment shader **and** the 3D surface fragment
shader. Consequences: a new coloring mode is a uniform switch, not a recompile; the same colors
appear in 2D, on the 3D surface, and on the sphere; and the colormap set lives behind a
`sampler2D` LUT so swapping HSV↔perceptual is one texture bind (C3/C4/C5/C6).

### 1.2 One renderer, two views

The **top-down orthographic view of the 3D landscape _is_ the 2D phase portrait.** Build the 2D
tool first as its own fast path, but design `colorAt` and the coordinate handling so the 3D pass in
P5 reuses them unchanged. When 3D lands, introduce **evaluate-to-texture + vertex-texture-fetch**:
one fragment pass writes `f(z)` (and `f'(z)`) into an RGBA32F texture; the 2D display samples it,
and the 3D vertex shader samples it for height. This makes a single evaluation feed both views and
gives df64 (backlog L1/L2) exactly one home. **The refactor is test-guarded**: the 2D image must be
pixel-identical (within tolerance) before and after.

### 1.3 CPU/GPU split & the dual-backend guarantee

GPU fragment shaders do all per-pixel work (coloring, threshold overlays, level sets). **CPU** does
everything sequential/adaptive (root-finding, contour integrals, residues) using `@cas/expr`'s JS
evaluator (`makeComplexFn`) and `@cas/core` (Durand–Kerner, Newton). Because `@cas/expr` guarantees
its GLSL and JS backends agree (tested to ~1e-7), the instruments and the picture never disagree.
**Every function added to `@cas/expr` extends the dual-backend corpus** (B9) — the suite's drift
guardrail ([RISKS §hard-part-2](../RISKS.md)).

### 1.4 `@cas/expr` extension strategy (the one shared-package risk)

Two kinds of change, very different risk:

- **Function-library growth (B3 hyperbolics, B6 Γ/ζ, backlog erf/Airy/…):** _additive and
  low-risk._ Each function is added through the fixed 5-table checklist — `ast`
  (`COMPLEX_FUNCTIONS`), `complexJs`+`evaluate` (JS), `glsl` (`UNARY_GLSL`), `@cas/gpu`
  (`complexDerived` if expressible from base ops, else `complexSingle`+`complexDf64`), `latex`
  (`UNARY_TEX`), `derivative` (`chainOuter`, or explicitly non-differentiable) — and ships a
  **dual-backend parity test** (B9). Hyperbolics are expressible from `exp`/existing ops
  (precision-agnostic `complexDerived`) and are differentiable → cheap. Γ (Lanczos) and ζ
  (Euler–Maclaurin / Riemann–Siegel) are _real_ GLSL implementations in both precisions → a focused
  effort (P4), and ζ in f32 needs an **honest precision badge** (see 1.7 / risks).
- **The named-parameter model (B4):** _the one non-trivial API change._ `@cas/expr` today hardcodes
  the free-variable scope to `z, c, a` (`a`→`uA`). Generalizing to arbitrary named parameters
  (`a, b, k, …`, each bound to a uniform) is a change to a package **Complex Dynamics also
  depends on**, so it must be **strictly backward-compatible** (keep `z, c, a`; keep `a`→`uA`) and
  guarded by CD's existing `paramA`/expr tests green before and after. **→ Write an ADR.**

### 1.5 Convention neutrality (ADR-0006 holds)

Phase→hue and modulus→height/lightness are **display conventions** — they live app-local and are
**tagged, never baked** into `@cas/core`/`@cas/gpu`/`@cas/expr`. Interchange payloads travel in the
**CANONICAL** convention (K7/K8). No π/2πi normalization enters a shared package. This matters the
moment an instrument that carries a convention lands — residues/contour integrals (backlog H3/H5)
must tag their `1/(2πi)` explicitly.

### 1.6 Extraction posture (ADR-0007: app-local first)

Build new primitives **inside the app**, extract only when a **second consumer** proves the API.
Named candidates and their triggers, recorded now so the seams are deliberate:

- **A shared 3D slice (`mat4` + mesh + orbit camera).** The plotter is the consumer that finally
  justifies it (CD has a quaternion _arcball for a ray-cast_; QD has a `mat4` _mesh kit_ — two
  different shapes, never merged). Build app-local in P5 by adapting QD's `mat4` kit + CD's arcball;
  **once the API is proven, write an extraction ADR** (likely into `@cas/gpu`, or `@cas/core` whose
  index already reserves "mat4/camera"). Do **not** pre-extract.
- **Perceptual phase→hue + colormap data.** `@cas/gpu/colormap` owns LUT _machinery_ but no palette
  data and no phase→hue helper; grow it there if CD later wants the perceptual maps.
- **The `colorAt` domain-coloring chunk.** App-local until a second consumer wants domain coloring.

### 1.7 Honest labeling (guardrail, first-class from P1)

The **uncertainty layer (J4)** and `=`/`≤`/`≈` provenance are a design stance, not a late feature:

- Flag fragments where per-sample rendering is unreliable — near poles and **essential
  singularities** (high local variance / Picard chaos) — with a masked/hatched overlay rather than
  pretending resolved structure.
- Every computed quantity (probe H1, zero/pole counts H2, later residues/winding) carries its
  status: `=` when exact (e.g. a rational map's roots via Durand–Kerner), `≈` when a numerical
  estimate, `≤` for bounds. This is the surveyed field's biggest gap and the suite's signature.

### 1.8 State & reproducibility schema (versioned from commit one)

The `#vs=` view-state (K2) uses `@cas/interchange`'s shared `encodeViewState`/`decodeViewState`
under app namespace `"cfp"`, **versioned and forward-compatible** from the first commit (unknown
fields preserved). PNG-embedded metadata (K3) reuses CD's `pngMetadata` `tEXt` pattern. Treat the
schema as a migratable format (the suite's share-link guardrail).

### 1.9 Testing architecture

- **Node Vitest** for all pure modules: the coloring math (transfer functions, LUT builders, phase
  mapping), the parameter model, the instruments (root-finding, winding), the view-state codec,
  and the `@cas/expr` additions. Pure-first design is what keeps them testable (the suite's
  discipline).
- **Browser Vitest** (`test:browser`, headless Chromium): real WebGL2 **shader compile** of the
  assembled coloring/surface programs, and a **dual-backend probe** (JS `colorAt` reference vs GLSL)
  reusing `@cas/gpu/dual-backend`'s 1×1-RGBA32F readback pattern. _(If added, wire the app into the
  root `test:browser` script and `ci.yml`'s `browser` job.)_
- **Visual-regression golden images** for the ground-truth plates: a small pixel-diff harness over a
  fixed set of views (Wegert plate, DLMF Γ/ζ, Γ landscape), tolerant of GPU differences. Numeric
  golden values cross-checked against ComplexPhasePortrait.jl / DomainColoring.jl.
- **Census floor:** ≥1 test from P0 (satisfies `scripts/assert-test-census.mjs`).

### 1.10 Dependency direction & lint boundaries

The app imports packages only (`@cas/expr`, `@cas/gpu`, `@cas/interchange`, `@cas/core`), never a
sibling app (lint-guarded `no-restricted-imports`; add `complex-function-plotter` to `APP_NAMES`).
Any extraction (1.6) moves code _downward_ into a package. No cycles.

---

## 2. Phase-by-phase runbook

Each phase ends at a **shippable** state with a **ground-truth** check. Effort is relative
(S/M/L), not calendar time (solo project — momentum via early wins is the point).

### Phase 0 — Scaffold & walking skeleton · effort S

**Goal:** a registered, CI-green app that renders one hardcoded compiled function, proving the
`@cas/expr → @cas/gpu` chain in a fresh app.

- Create `apps/complex-function-plotter/` from the `apps/correspondences` template (single-page):
  `package.json` (deps `@cas/core`, `@cas/expr`, `@cas/gpu`, `@cas/interchange`), `vite.config.ts`
  (`base:"./"`, port 5176), strict `tsconfig.json`, `index.html`, `src/main.ts`, `test/smoke.test.ts`.
- Registration change-set (the 7 steps): app dir · `vitest.workspace.ts` +1 · `eslint.config.js`
  `APP_NAMES` +1 · `scripts/assert-test-census.mjs` `PROJECTS` +1 · launcher **"Coming soon"** card
  · (deploy `cp` deferred to P6) · `pnpm install`.
- `main.ts`: WebGL2 context + loss/restore (**L5**), fullscreen triangle, concatenate `@cas/gpu`
  complex stdlib + `compileF(parse("z^2"))`, render a fixed HSV phase portrait.
  **Reuse:** `apps/correspondences/src/gpu.ts` (181-line renderer template), `@cas/gpu/shader`+`glsl`,
  `@cas/expr/glsl`. **Gate:** `pnpm lint/typecheck/test/build` green; page shows a fixed phase
  portrait; smoke test asserts `@cas/expr` wiring. **GT:** n/a (skeleton).

### Phase 1 — Live 2D phase portrait (first motivating win) · effort L

**Goal:** type a function, see its live, honest phase portrait; pan/zoom; share a link. A genuinely
useful 2D tool.

- **1A — input + coloring.** Expression box (**A1**), live KaTeX preview via the existing-but-unused
  `toLatex` (**A2**), inline error highlighting via `ExprError.pos` (**A3**). The layered `colorAt`
  (1.1): plain phase portrait (**C1**), full domain coloring (**C2**), perceptual cyclic default +
  HSV legacy as LUTs (**C3/C4**), modulus transfer functions (**D1**). NaN/Inf sentinels (**L6**),
  fwidth AA (**L4**). Add **hyperbolics** to `@cas/expr` with parity tests (**B3**, first exercise of
  the 5-table checklist + B9 discipline).
- **1B — navigate, read, share.** Pan/zoom-to-cursor + drag (**I1**), home/jump-to-coordinate
  (**I2**), axes/grid/scale bar (**I3**), aspect-lock (**I4**), progressive/HiDPI loop adapted from
  CD `glPlot` (**L3**). Phase-wheel legend (**J1**), modulus-scale legend (**J2**). Cursor value
  probe `z, f(z), |f|, arg f` (**H1**). Versioned `#vs=` permalink (**K2**). Preset gallery (**A4**).
  Basic canvas-PNG snapshot (down-payment on "export core"; full export in P6).
  **Reuse:** CD `shaderBuilder` `uMode==4` (lift & generalize), CD `glPlot` render loop, CD
  `projection.ts` if alternate 2D projections are wanted, `@cas/interchange` viewstate, `@cas/expr`
  `evaluate`/`toLatex`. **Gate:** shippable 2D phase portrait, live custom input, shareable link.
  **GT:** reproduce ≥2 Wegert phase-portrait plates (visual-regression golden).

### Phase 2 — The instrumented 2D research tool · effort L

**Goal:** the honest, enhanced, instrumented 2D tool — the research-grade 2D release.

- Enhanced portraits: modulus contour rings (**D2**), phase sawtooth (**D3**), the flagship
  **conformal proportional grid** (**D4**), crisp-banding toggle (**D5**), polar/Cartesian
  chessboards (**D6**) — all `fwidth`-AA overlay layers on `colorAt`.
- Colormap library + controls: CET-C/twilight/cmocean (**C5**), colorblind-safe + CVD-sim preview
  (**C6**), hue origin/direction/offset (**C7**).
- Conformal preimage grids: Cartesian (**E1**), polar (**E2**), reference-curve preimages (**E3**).
- Level sets `|f|=c`, `arg f=c` at user-set c (**H7**); zeros & poles located/counted/marked with
  order via argument principle + Newton/Durand–Kerner, labeled `=`/`≈` (**H2**).
- Pedagogy & honesty: "what am I looking at" explainer (**J3**); the **uncertainty layer** (**J4**).
  **Reuse:** `@cas/core` Durand–Kerner/Newton for H2; `@cas/gpu/colormap` LUT builders. **Gate:** a
  research-grade, honestly-labeled 2D tool. **GT:** enhanced-portrait plate match (proportional grid
  squares where conformal); zero/pole counts match argument-principle ground truth on rational maps.

### Phase 3 — Parameters & families · effort M · _depends on the P3 expr change_

**Goal:** turn a static plot into a live family. **Write the named-parameter ADR (1.4) first.**

- Generalize `@cas/expr`'s free-variable scope to **named parameters** (**B4**, backward-compatible;
  CD tests green before/after); complex literals & extra constants `2i`, `tau`, `phi`, `γ` (**B5**).
- Auto-detected parameter sliders — real on a segment, complex as a draggable ℂ-pad (**G1**);
  reserved animation variable `t` with scrub/play/loop/speed (**G2**); parameter sweep (**G4**).
- Input niceties: function-name autocomplete (**A5**), multiple functions f/g (**A7**), copy-as-LaTeX
  (**A9**).
  **Reuse:** CD's non-recompiling uniform-refresh pattern for live params; CD parameter-coupling
  pattern for G-series. **Gate:** live parameter/animation exploration; expr change shipped without
  regressing CD. **GT:** a Blaschke/Möbius family `(z−a)/(1−ā z)` animates correctly as `a` moves;
  zeros stay on/inside the disk as predicted.

### Phase 4 — Special functions & the DLMF mode · effort M/L

**Goal:** research-grade special-function coverage and DLMF-faithful figures.

- Γ (Lanczos) and ζ (Euler–Maclaurin / Riemann–Siegel) in `@cas/expr`, both GLSL precisions + JS,
  with dual-backend parity tests (**B6**, **B9**); ζ in f32 carries an **honest precision badge**.
- DLMF mode: four-color quadrant + continuous warped-hue + height colormap (**D8**).
  **Reuse:** the 5-table checklist (1.4); `@cas/gpu/dual-backend` harness. **Gate:** Γ and ζ render and
  evaluate correctly within stated precision. **GT:** DLMF Γ and ζ plates — pole at `s=1`, trivial
  zeros, nontrivial zeros on the critical line for ζ; poles at non-positive integers for Γ — match
  DLMF's coloring and structure.

### Phase 5 — The 3D engine · effort L (largest net-new) · _3D-extraction ADR decision here_

**Goal:** the analytic-landscape surface and the Riemann sphere, reusing `colorAt`.

- Introduce evaluate-to-texture + VTF (1.2), test-guarded (2D image unchanged).
- Colored analytic landscape: height = log|f| with a compression/clamp selector incl. bounded
  stereographic `(|f|²−1)/(|f|²+1)` (**F1**); hue-preserving multiply-shading, specular optional
  (**F2**); on-surface enhanced overlay (**F3**); **analytic normals from `f'/f`** via `differentiate`
  (**F4**); orbit/pan/dolly camera, cursor-locked pivot, ortho + snap, **top-down = the 2D portrait**
  (**F5**); height clamping + in-shader singularity guards (**F6**).
- Riemann sphere: per-fragment ray-cast + `colorAt` (adapt CD `sphereView`) so ∞ is literal (**F7**);
  cheap `f(1/z)` ∞-inspector first (**F8**). 2D↔3D side-by-side with synced navigation (**I7**).
- **Build the `mat4`/mesh/camera app-local** (adapt QD kit + CD arcball); **then write the extraction
  ADR** (1.6) if the API is clean.
  **Reuse:** QD `sphere-common.mjs` `mat4` kit + `buildSphereMesh`; CD `sphereView` arcball;
  `@cas/core` `planeToSphere`; `@cas/expr` `differentiate` for normals. **Gate:** orbitable, correctly
  shaded landscape + sphere; top-down matches the 2D portrait pixel-for-pixel. **GT:** the analytic
  landscape of Γ (the Jahnke–Emde plate) and a `ComplexPlot3D` comparison.

### Phase 6 — Export, interop, accessibility & publish · effort M → **publish gate**

**Goal:** publication-quality output, first-class suite citizenship, then go live.

- Export: high-res supersampled + tiled PNG (**K1**, adapt CD `hiResExport`); PNG reproducibility
  metadata (**K3**, adapt CD `pngMetadata`); copy-image-to-clipboard (**K9**).
- Interop: import a `MapSpec` — plot a Schwarz σ from QD or any `f(z,c)` from CD (**K7**, reuse CD's
  `importMap` path); export a `View` + "send to Complex Dynamics" (**K8**).
- Accessibility: keyboard + touch (**L7**); surface CVD-safe defaults in the UI (**L8**).
- **Publish:** flip the launcher card from "Coming soon" to a link; add one `cp` line to
  `deploy-pages.yml`. (Add the app to `scripts/check-built-artifacts.mjs` only if it ships workers.)
  **Reuse:** CD `hiResExport`/`pngMetadata`/`importMap`, `@cas/interchange`. **Gate:** published in the
  combined Pages site; CI green incl. any browser tests. **GT:** an interop **round-trip** — a σ
  imported from QD renders, and a View exported to CD re-opens identically.

---

## 3. Backlog insertion points (Later + Exploratory)

Parked, but each has a known home so pulling it in is cheap:

| Backlog item                                                                                                    | Natural phase     | Note                                                |
| --------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------- |
| L1 df64 deep-zoom (2D)                                                                                          | P1/P2 render core | substrate ready; add hi/lo center + precision badge |
| L2 df64 deep-zoom (3D)                                                                                          | P5                | origin-rebasing; hard — Exploratory                 |
| C8 bivariate 2D LUT                                                                                             | P2                | one-texture perceptual guarantee                    |
| D7 two-color B&W portraits                                                                                      | P2                | trivial overlay variant                             |
| E4 image-of-grid · E5 image-as-domain                                                                           | P2                | forward map; E5 needs texture upload                |
| E6 Pólya field / streamlines                                                                                    | P2 or P5          | integration audience                                |
| H3 residue · H4 winding · H5 contour ∮ · H6 critical pts · H8 Taylor/Laurent · H9 f′ overlay · H10 branch marks | P2/P5             | CPU instruments; H3/H5 **must tag 1/(2πi)** (1.5)   |
| G3 cursor-`c` · G5 param-path · G6 homotopy · G7 video capture                                                  | P3/P5             | G7 = video export (deferred per priorities)         |
| A6 MathLive editor · A8 composition/iteration                                                                   | P3                | input depth                                         |
| I5 bookmarks · I6 linked z↔w · I8 A/B split · I9 inset sphere                                                   | P2/P5             | I6 is a strong differentiator to pull forward       |
| F9 Re/Im surfaces · F10 sphere-of-f · F11 ray-marched surface · F12 Riemann surfaces                            | P5                | F12 needs multivalued expr (out of scope)           |
| B7 erf/Airy/ψ/Bessel · B8 θ/℘/elliptic                                                                          | P4+               | same 5-table checklist; B8 hard numerics            |
| K4 legend export · K5 hybrid raster+vector · K6 CSV grid · K10 print+citation                                   | P6                | K5 = honest raster+vector                           |

---

## 4. ADRs to write (decisions this plan introduces)

1. **Complex Function Plotting Tool as a separate app** — a short peer to ADR-0009 recording the
   fourth app, its package deps, and the built-but-unpublished→published sequence.
2. **`@cas/expr` named-parameter generalization** — the backward-compatible scope change (1.4); the
   most consequential shared-package edit in this plan.
3. **Shared 3D slice extraction** _(deferred until P5 proves the API)_ — `mat4`/mesh/orbit-camera
   into `@cas/gpu` (or `@cas/core`), on the ADR-0007 second-consumer rule.

_(Function-library growth and display-convention neutrality need no new ADR — they follow the
existing 5-table checklist and ADR-0006 respectively.)_

---

## 5. Risk register

| Risk                                                    | Phase      | Mitigation                                                                                                                                                                            |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@cas/expr` param change regresses Complex Dynamics** | P3         | Strict backward-compat (keep `z,c,a`, `a`→`uA`); CD's expr/paramA suites green before & after; ADR + review gate.                                                                     |
| **ζ (and other special fns) unstable in f32 GLSL**      | P4         | Choose stable algorithms (Riemann–Siegel/Euler–Maclaurin, Lanczos); **honest precision badge**; parity tests bound drift; restrict range where needed; CPU reference for instruments. |
| **Phong lighting desaturates phase hue in 3D**          | P5         | Value-only multiply-shading; test that shaded hue == unshaded hue; specular optional/off by default.                                                                                  |
| **3D deep-zoom FP32 z-buffer jitter**                   | P5/backlog | Out of scope for v1; if pulled, origin-rebasing (values df64, camera-relative FP32) or the ray-march path (F11).                                                                      |
| **Moiré/aliasing on contour & phase bands**             | P1+        | `fwidth`-based analytic AA on the _banded quantity_ + MSAA (the wgxli "anti-moiré" precedent).                                                                                        |
| **Perceptual color wrong in-shader (gamut/Oklch math)** | P1/P2      | Precompute perceptual maps as **LUT textures** offline; validate ΔE uniformity in a node test; never do gamut math in the hot shader.                                                 |
| **2D/3D duplicated f-evaluation drifts**                | P5         | Single evaluate-to-texture pass feeds both; the P5 refactor is pixel-diff test-guarded.                                                                                               |
| **WebGL2 has no tessellation near poles**               | P5         | Height clamping/compression makes uniform grids sufficient; CPU adaptive quadtree only if needed.                                                                                     |
| **Scope creep from the rich backlog**                   | all        | Backlog is explicitly parked (§3); phase gates enforce shippable increments; pull items only at a gate.                                                                               |
| **Honest-labeling omitted under delivery pressure**     | all        | J4 + `=`/`≤`/`≈` are P1/P2 deliverables, not polish; it is the suite's guardrail and a core differentiator.                                                                           |

---

## 6. Deployment & publish gate

Built into CI from P0 (the `apps/*` glob builds it; gates on lint→typecheck→test). **Unpublished**
(launcher "Coming soon" card) through P5. **Publish at P6**: flip the card to a link + add
`cp -r apps/complex-function-plotter/dist _site/complex-function-plotter` to `deploy-pages.yml`'s
assemble step. `base:"./"` keeps assets path-independent. No workers planned → no
`check-built-artifacts.mjs` change unless that changes.

---

## 7. Definition of done (v1)

All **67 Core + v1** items shipped; each phase's ground-truth check passing; `@cas/expr` extended
backward-compatibly with parity tests for every added function; the honest-labeling/uncertainty
layer present; interop round-trip (QD σ → plot → View → CD) green; visual-regression goldens for the
Wegert plate, DLMF Γ/ζ, and the Γ landscape committed; the app **published** in the combined Pages
site; three ADRs written (§4, the 3D one when P5 proves the API). Later + Exploratory remain a
tracked backlog with known insertion points (§3).
