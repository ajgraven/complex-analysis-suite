# Complex Function Plotting Tool — research notes (working)

> Working notes gathered while scoping the Complex Function Plotting Tool
> (`apps/complex-function-plotter`). Source: codebase investigation + web/literature
> survey, 2026-08. These feed the functionality catalog and the build plan. Not yet an ADR.

## Confirmed scope (from Andrew, this session)

- **Functions:** elementary holo/meromorphic **+** hyperbolics/inverse-hyperbolics/reciprocal-trig
  **+** anti-holomorphic (conjugate) **+** special functions (Γ, ζ, ℘/θ, erf, Bessel, Airy…) as a
  staged milestone. **No** multivalued / branch-cut machinery — principal branches only.
- **3D:** 2D-first, then modulus landscape + Riemann sphere; hand-rolled on `@cas/gpu` (no 3D framework).
- **Suite integration:** consume/emit `@cas/interchange`; built-then-published at a quality gate;
  app-local-but-extraction-ready per ADR-0007.
- **Priorities:** real-time + publication export core; df64 deep-zoom strong nice-to-have; animation later.
- **Name:** "Complex Function Plotting Tool"; dir `apps/complex-function-plotter`; pkg `complex-function-plotter`.
- Open: a specific reference image/paper to validate the first milestone (default: Wegert phase-portrait
  plates + a DLMF-style special-function plot).

## Reuse surface (codebase)

- `@cas/expr`: parse `f(z,c)` → GLSL (`compileF`/`compileEscape`) + JS (`makeComplexFn`); symbolic
  `differentiate` (holomorphic only), `newtonIteration`, `toLatex`, `ExprError.pos`. Fixed ~20-fn
  principal-branch library over `z,c,a`. No hyperbolics/special-fns/branch-cuts. Extending = edit ~5
  parallel tables across `@cas/expr` + `@cas/gpu`; no registry.
- `@cas/gpu`: `createProgram`/`compileShader`/`linkProgram`; complex GLSL stdlib (single + df64 +
  derived); `DF64_GLSL` deep-zoom (set `uOne=1.0`); `@cas/gpu/colormap` LUT builders; `@cas/gpu/mask`;
  `@cas/gpu/dual-backend` GLSL≈JS harness. NO context mgmt, NO program scaffold, NO sphere/projection,
  NO progressive/HiDPI, NO phase→hue, **NO 3D geometry anywhere in the suite** (even spheres are
  fragment ray-casts). Cleanest domain-coloring template: `apps/correspondences/src/gpu.ts` (181 lines).
- CD app: domain-coloring already exists (`shaderBuilder.ts` `uMode==4`); sphere ray-cast + quaternion
  arcball (`sphereView.ts`); log-polar/Poincaré (`projection.ts`); progressive/HiDPI loop (`glPlot.ts`);
  PNG metadata (`pngMetadata.ts`); hi-res tiled export (`hiResExport.ts`); `#vs=`/`#s=` via
  `@cas/interchange`; KaTeX present but `toLatex` unused.
- QD app: **true 3D** sphere — real WebGL mesh + hand-rolled `mat4` kit (lookAt/perspective) +
  `buildSphereMesh` in `apps/quadrature-domains/app/sphere/*.mjs`. `mat4`/camera is NOT a shared package
  (a 3rd consumer would trigger extraction). Stereographic kernel `planeToSphere` lives in `@cas/core`.
- Scaffolding change-set (to publish a new app): app dir (template = `apps/correspondences`) + 1 line in
  `vitest.workspace.ts` + `APP_NAMES` in `eslint.config.js` + `PROJECTS` in
  `scripts/assert-test-census.mjs` (needs ≥1 test) + launcher card + 1 `cp` in `deploy-pages.yml` +
  `pnpm install`.

## 2D coloring taxonomy (Wegert / Farris / Lundmark / Poelke–Polthier / cplot / DLMF)

- Core: plain phase portrait (hue=arg f); full domain coloring (phase→hue + modulus→lightness).
- Enhanced portraits: modulus contour rings (sawtooth on log₂|f|); phase sawtooth (n sectors, shows
  winding sense → zero vs pole); combined **conformal "proportional" grid** (Δlog|f| = Δarg = 2π/n →
  near-square cells where f is conformal) — flagship; polar/Cartesian chessboards.
- Modulus transfer: constant/linear/arctan (x/(x+1))/log/log-log/sawtooth; monotone-bounded ⇒ dark
  zeros / bright poles.
- Color spaces: HSV is NOT perceptually uniform (false bright bands, contaminates lightness). Prefer
  perceptual cyclic LUTs: Oklch constant-L, cmocean `phase`, CET-C1/C2/C4, CET-CBC (colorblind), twilight.
- Singularities: zeros/poles by hue-winding sense + order = #cycles; essential singularities render as
  aliased chaos → label `≈`; branch cuts = hue discontinuity (principal branch); ∞ via sphere or z→1/z.
- DLMF mode: 4-color quadrant (Q1 blue, Q2 green, Q3 red, Q4 yellow) + continuous warped-hue + height
  colormap; DLMF renders |f| surface colored by phase.
- Conformal overlays: preimage grids (level sets of Re/Im f; of |f|/arg f); image-of-grid; reference
  curves (axes, unit circle); Pólya field conj(f) + streamlines.
- GLSL: layer = phase-color LUT × modulus-lightness transfer × N fwidth-AA isoline/tile overlays.

## Existing tools — differentiators & gaps

- Well-served: static 2D enhanced phase portraits (Wolfram ComplexPlot(3D), cplot, Sage `complex_plot`,
  ComplexPortraits.jl, viscomplexr, GeoGebra, jcponce).
- Under-served / differentiators for a GPU browser tool: perceptual+CVD-safe coloring on the GPU;
  **unified 2D ↔ 3D-landscape ↔ Riemann-sphere with linked navigation**; quantitative probing
  (residues, winding number, contour integrals — only wgxli); an **honesty/uncertainty layer**;
  a **portable executable+serializable form of the function itself** (nothing in the field resembles
  `@cas/expr` + `@cas/interchange`). df64 deep-zoom for domain coloring is essentially absent.
- Reference web tools: wgxli/complex-function-plotter (residue/contour readouts, anti-moiré),
  person594 (Earth-sphere, mouse `c`, time `t`), David Bau (conformal, grid ∝ 1/|f′|), DLMF (cutting
  plane, surface↔density toggle).

## Interaction / analysis / export

- Input: text box + live typeset preview + inline error highlight; presets; autocomplete; optional
  MathLive; multiple fns; composition/iteration.
- Params: auto-detected sliders (real segment; complex ℂ-pad); reserved `t` animation; cursor-bound `c`;
  sweep; path-trace (monodromy); homotopy (1−t)f+t·g; record to WebM/GIF with burned-in state.
- Instruments (GPU per-pixel; root-find/integrals on CPU, GPU-seeded): cursor readout; zeros/poles via
  argument principle + Newton (order, honest =/≈); residue via FFT-on-a-circle (Bornemann); winding
  number of drawn contour; critical points f′=0; level sets; conformal image/preimage; branch marks
  (convention-labeled); Pólya field; contour integration; Taylor/Laurent + convergence radius.
- Views: linked z↔w; 2D↔3D side-by-side synced; split A/B; inset sphere.
- Nav: pan/zoom-to-cursor/deep-zoom; home; jump-to-coord; bookmarks; axes/grid/scale-bar; aspect-lock.
- Export/repro: hi-res PNG (supersampled, tiled); permalink (#vs=, versioned); PNG metadata; legend
  export; hybrid raster+vector SVG/PDF (color field can't be cleanly vectorized — honest note); CSV grid;
  clipboard; print mode + citation/BibTeX.
- Legends/pedagogy: phase wheel (state convention); modulus scale; "what am I looking at"; honesty
  overlay (=/≤/≈); tours; glossary.
- A11y/robustness: perceptual + CVD-safe palettes + CVD-sim preview; keyboard/touch; NaN/Inf sentinels
  (pole→white, hole→neutral/hatch, not black); progressive/HiDPI; context-loss recovery.

## 3D techniques (analytic landscapes, sphere)

- Colored analytic landscape (Jahnke–Emde): height = |f| or **log|f|** (compress) or bounded
  stereographic (|f|²−1)/(|f|²+1) ∈[−1,1] (zeros→−1, poles→+1, natural clamp, ties to sphere); hue=phase.
  = Wolfram ComplexPlot3D `{cfunc,sfunc}` (hue=phase, value=lighting+modulus bands).
- **Hue-preserving shading**: multiply base hue by scalar diffuse (value-only); keep specular monochrome/
  optional — naive Phong desaturates phase (the primary data channel). Critical for "research-grade" look.
- On-surface enhanced overlay (phase steps + log|f| sawtooth), fwidth-AA.
- **Analytic normals from f′/f**: for height=log|f|, slope field = Re(f′/f), −Im(f′/f) — exact, cheap
  (reuse `differentiate`), vastly better than finite-diff near singularities.
- Camera: orbit/pan/dolly, cursor-locked pivot, ortho + snap; **top-down ortho = the 2D phase portrait**
  (one renderer, two views). Reuse QD `mat4` kit + CD arcball.
- Riemann sphere: wrap domain coloring on sphere (u,v,w stereographic; origin→S pole, ∞→N pole); or
  "sphere of f" (color by f's position on target sphere). ∞ inspection via f(1/z) toggle (cheap first).
- Re/Im harmonic surfaces (saddles); ray-marched height surface (enables 3D deep-zoom in fragment path);
  Riemann surfaces of multivalued f (branched sheets) — OUT of current scope, roadmap only.
- WebGL2 risks: no tessellation/geometry/compute shaders (adaptive refinement = CPU quadtree or clamp);
  **deep-zoom×3D harder than ×2D** (FP32 rasterizer/z-buffer jitters even if f in df64) → origin-rebasing
  (values df64, camera-relative FP32 geometry) or ray-march; hue/lighting collision; moiré → fwidth+MSAA;
  singularities → clamp + NaN guards + analytic normals; prefer evaluate-to-texture + vertex-texture-fetch
  so one f-eval feeds both 2D and 3D and df64 lives in one place; convention leakage (ADR-0006) — phase→hue
  and modulus→height are display conventions, tag not bake.

## Key references

Wegert *Visual Complex Functions* (Birkhäuser 2012) & Wegert–Semmler Notices AMS 2011 (arXiv:1007.2295);
Farris (coined "domain coloring", 1998; PRIMUS 2017); Lundmark (2004); Poelke–Polthier (IEEE CG&A 2012;
Lifted DC, CGF 2009); Schlömer cplot; Kovesi CET (arXiv:1509.03700); cmocean phase (Thyng 2016);
endolith/complex_colormap (CIECAM02); ComplexPortraits.jl / ComplexPhasePortrait.jl / DomainColoring.jl;
DLMF (dlmf.nist.gov/help/vrml/aboutcolor); Sandoval-Romero (Riemann-sphere DC, Math. J. 2015); Jahnke–Emde
(1909); Bornemann (FFT Cauchy coeffs, arXiv:0910.1841); Nieser–Poelke–Polthier (GPU algebraic Riemann
surfaces, arXiv:1507.04571); Lowry-Duda (modular forms, arXiv:2002.05234); wgxli/complex-function-plotter.
