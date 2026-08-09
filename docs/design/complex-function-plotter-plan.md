# Complex Function Plotting Tool — Construction & Implementation Plan

> **Status:** proposed (planning). Scope approved 2026-08: **Core + v1 (67 items)** as the build
> target; **Later + Exploratory** tracked as a backlog to pull from. This document is the *how*;
> the *what* is the itemized catalog (IDs `A1…L8` are used throughout). Companion docs:
> [`complex-function-plotter-research-notes.md`](complex-function-plotter-research-notes.md) (the
> literature/tool survey), and the suite guardrails in [`../../CLAUDE.md`](../../CLAUDE.md) →
> [`../ARCHITECTURE.md`](../ARCHITECTURE.md) / [`../DECISIONS.md`](../DECISIONS.md).
>
> The plan mirrors the suite's proven runbook style ([`../MIGRATION.md`](../MIGRATION.md)):
> **phase gates that are each shippable, motivating wins early, a ground-truth validation per
> phase, and test-guarded shared-package changes.** Nothing here re-litigates a locked ADR;
> where a new decision is needed, it is flagged as an ADR to write.

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
  enhanced phase-portrait plates** (Wegert–Semmler, *Notices AMS* 2011) and a **DLMF Γ/ζ** plot;
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
The **top-down orthographic view of the 3D landscape *is* the 2D phase portrait.** Build the 2D
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
- **Function-library growth (B3 hyperbolics, B6 Γ/ζ, backlog erf/Airy/…):** *additive and
  low-risk.* Each function is added through the fixed 5-table checklist — `ast`
  (`COMPLEX_FUNCTIONS`), `complexJs`+`evaluate` (JS), `glsl` (`UNARY_GLSL`), `@cas/gpu`
  (`complexDerived` if expressible from base ops, else `complexSingle`+`complexDf64`), `latex`
  (`UNARY_TEX`), `derivative` (`chainOuter`, or explicitly non-differentiable) — and ships a
  **dual-backend parity test** (B9). Hyperbolics are expressible from `exp`/existing ops
  (precision-agnostic `complexDerived`) and are differentiable → cheap. Γ (Lanczos) and ζ
  (Euler–Maclaurin / Riemann–Siegel) are *real* GLSL implementations in both precisions → a focused
  effort (P4), and ζ in f32 needs an **honest precision badge** (see 1.7 / risks).
- **The named-parameter model (B4):** *the one non-trivial API change.* `@cas/expr` today hardcodes
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
  justifies it (CD has a quaternion *arcball for a ray-cast*; QD has a `mat4` *mesh kit* — two
  different shapes, never merged). Build app-local in P5 by adapting QD's `mat4` kit + CD's arcball;
  **once the API is proven, write an extraction ADR** (likely into `@cas/gpu`, or `@cas/core` whose
  index already reserves "mat4/camera"). Do **not** pre-extract.
- **Perceptual phase→hue + colormap data.** `@cas/gpu/colormap` owns LUT *machinery* but no palette
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
  reusing `@cas/gpu/dual-backend`'s 1×1-RGBA32F readback pattern. *(If added, wire the app into the
  root `test:browser` script and `ci.yml`'s `browser` job.)*
- **Visual-regression golden images** for the ground-truth plates: a small pixel-diff harness over a
  fixed set of views (Wegert plate, DLMF Γ/ζ, Γ landscape), tolerant of GPU differences. Numeric
  golden values cross-checked against ComplexPhasePortrait.jl / DomainColoring.jl.
- **Census floor:** ≥1 test from P0 (satisfies `scripts/assert-test-census.mjs`).

### 1.10 Dependency direction & lint boundaries
The app imports packages only (`@cas/expr`, `@cas/gpu`, `@cas/interchange`, `@cas/core`), never a
sibling app (lint-guarded `no-restricted-imports`; add `complex-function-plotter` to `APP_NAMES`).
Any extraction (1.6) moves code *downward* into a package. No cycles.

---

## 2. Phase-by-phase runbook

Each phase ends at a **shippable** state with a **ground-truth** check. Effort is relative
(S/M/L), not calendar time (solo project — momentum via early wins is the point).

### Phase 0 — Scaffold & walking skeleton  · effort S
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

### Phase 1 — Live 2D phase portrait (first motivating win)  · effort L
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

### Phase 2 — The instrumented 2D research tool  · effort L
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

### Phase 3 — Parameters & families  · effort M · *depends on the P3 expr change*
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

### Phase 4 — Special functions & the DLMF mode  · effort M/L
**Goal:** research-grade special-function coverage and DLMF-faithful figures.
- Γ (Lanczos) and ζ (Euler–Maclaurin / Riemann–Siegel) in `@cas/expr`, both GLSL precisions + JS,
  with dual-backend parity tests (**B6**, **B9**); ζ in f32 carries an **honest precision badge**.
- DLMF mode: four-color quadrant + continuous warped-hue + height colormap (**D8**).
**Reuse:** the 5-table checklist (1.4); `@cas/gpu/dual-backend` harness. **Gate:** Γ and ζ render and
evaluate correctly within stated precision. **GT:** DLMF Γ and ζ plates — pole at `s=1`, trivial
zeros, nontrivial zeros on the critical line for ζ; poles at non-positive integers for Γ — match
DLMF's coloring and structure.

### Phase 5 — The 3D engine  · effort L (largest net-new)  · *3D-extraction ADR decision here*
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

### Phase 6 — Export, interop, accessibility & publish  · effort M  → **publish gate**
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

| Backlog item | Natural phase | Note |
|---|---|---|
| L1 df64 deep-zoom (2D) | P1/P2 render core | substrate ready; add hi/lo center + precision badge |
| L2 df64 deep-zoom (3D) | P5 | origin-rebasing; hard — Exploratory |
| C8 bivariate 2D LUT | P2 | one-texture perceptual guarantee |
| D7 two-color B&W portraits | P2 | trivial overlay variant |
| E4 image-of-grid · E5 image-as-domain | P2 | forward map; E5 needs texture upload |
| E6 Pólya field / streamlines | P2 or P5 | integration audience |
| H3 residue · H4 winding · H5 contour ∮ · H6 critical pts · H8 Taylor/Laurent · H9 f′ overlay · H10 branch marks | P2/P5 | CPU instruments; H3/H5 **must tag 1/(2πi)** (1.5) |
| G3 cursor-`c` · G5 param-path · G6 homotopy · G7 video capture | P3/P5 | G7 = video export (deferred per priorities) |
| A6 MathLive editor · A8 composition/iteration | P3 | input depth |
| I5 bookmarks · I6 linked z↔w · I8 A/B split · I9 inset sphere | P2/P5 | I6 is a strong differentiator to pull forward |
| F9 Re/Im surfaces · F10 sphere-of-f · F11 ray-marched surface · F12 Riemann surfaces | P5 | F12 needs multivalued expr (out of scope) |
| B7 erf/Airy/ψ/Bessel · B8 θ/℘/elliptic | P4+ | same 5-table checklist; B8 hard numerics |
| K4 legend export · K5 hybrid raster+vector · K6 CSV grid · K10 print+citation | P6 | K5 = honest raster+vector |

---

## 4. ADRs to write (decisions this plan introduces)

1. **Complex Function Plotting Tool as a separate app** — a short peer to ADR-0009 recording the
   fourth app, its package deps, and the built-but-unpublished→published sequence.
2. **`@cas/expr` named-parameter generalization** — the backward-compatible scope change (1.4); the
   most consequential shared-package edit in this plan.
3. **Shared 3D slice extraction** *(deferred until P5 proves the API)* — `mat4`/mesh/orbit-camera
   into `@cas/gpu` (or `@cas/core`), on the ADR-0007 second-consumer rule.

*(Function-library growth and display-convention neutrality need no new ADR — they follow the
existing 5-table checklist and ADR-0006 respectively.)*

---

## 5. Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| **`@cas/expr` param change regresses Complex Dynamics** | P3 | Strict backward-compat (keep `z,c,a`, `a`→`uA`); CD's expr/paramA suites green before & after; ADR + review gate. |
| **ζ (and other special fns) unstable in f32 GLSL** | P4 | Choose stable algorithms (Riemann–Siegel/Euler–Maclaurin, Lanczos); **honest precision badge**; parity tests bound drift; restrict range where needed; CPU reference for instruments. |
| **Phong lighting desaturates phase hue in 3D** | P5 | Value-only multiply-shading; test that shaded hue == unshaded hue; specular optional/off by default. |
| **3D deep-zoom FP32 z-buffer jitter** | P5/backlog | Out of scope for v1; if pulled, origin-rebasing (values df64, camera-relative FP32) or the ray-march path (F11). |
| **Moiré/aliasing on contour & phase bands** | P1+ | `fwidth`-based analytic AA on the *banded quantity* + MSAA (the wgxli "anti-moiré" precedent). |
| **Perceptual color wrong in-shader (gamut/Oklch math)** | P1/P2 | Precompute perceptual maps as **LUT textures** offline; validate ΔE uniformity in a node test; never do gamut math in the hot shader. |
| **2D/3D duplicated f-evaluation drifts** | P5 | Single evaluate-to-texture pass feeds both; the P5 refactor is pixel-diff test-guarded. |
| **WebGL2 has no tessellation near poles** | P5 | Height clamping/compression makes uniform grids sufficient; CPU adaptive quadtree only if needed. |
| **Scope creep from the rich backlog** | all | Backlog is explicitly parked (§3); phase gates enforce shippable increments; pull items only at a gate. |
| **Honest-labeling omitted under delivery pressure** | all | J4 + `=`/`≤`/`≈` are P1/P2 deliverables, not polish; it is the suite's guardrail and a core differentiator. |

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
