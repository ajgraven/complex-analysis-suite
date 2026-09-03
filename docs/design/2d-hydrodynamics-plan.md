# 2D Hydrodynamics — app plan

> **Status.** A new app established by [ADR-0037](../DECISIONS.md), anchored by the airfoil promoted out of
> **2D Electrostatics**. ADR-0037 *partially supersedes* [ADR-0036](../DECISIONS.md): the airfoil moves here,
> while 2D Electrostatics keeps the sandbox and the polygon transplant. This is the **forward plan** — what
> the app is, what it reuses, and where it goes. The airfoil's original construction record lives in
> [`complex-potential-studio-plan.md`](complex-potential-studio-plan.md) (the pre-split single-app plan, M2.2).

## What this app is

The **hydrodynamic twin of 2D Electrostatics**. Both apps render the *same* complex potential
**W(z) = φ + iψ**; they differ in which phenomena they showcase. 2D Electrostatics is the **field you build by
superposition and relabel through the electrostatic↔fluid lens**. 2D Hydrodynamics is **ideal (inviscid,
irrotational) flow past a body** — the one picture the lens can *not* reduce to dropped charges, because its
payload is aerodynamic: a stagnation streamline wrapping a wing, the Kutta condition, and lift.

The organizing object is a **conformal transplant**: flow past a body `B` is flow past the unit disk `𝔻*`
carried through a univalent map `ψ: 𝔻* → ext(B)`. The airfoil is the sharp-edged special case (Joukowski /
Kármán–Trefftz), where the Kutta condition fixes the circulation and Kutta–Joukowski gives the lift; the
gallery is the same construction for a family of closed-form bodies.

Since **HD-6 (ADR-0038)** the app is a **single page**: `index.html` renders every body through the unified
`ψ: 𝔻* → ext(B)` framework, switched by a **Body** selector. (This collapsed the original ADR-0037 three-page
shape — a hub + `airfoil.html` + `gallery.html`; those files are gone and their `#vs=` / bare-`#id` permalinks
are read by the unified decoder.)

| Page | Content | Honesty |
| --- | --- | --- |
| `index.html` | Flow past a body `ψ: 𝔻* → ext(B)`, one page, one two-pane disk↔body view. **Airfoil** (Joukowski / Kármán–Trefftz): thickness / camber / trailing-edge angle, the Kutta condition, and the Kutta–Joukowski lift `L = −ρUΓ`. **Closed-form gallery** (flat plate, ellipse, deltoid, astroid, 5-cusp star): a free-circulation slider. Shared angle-of-attack, permalink, and PNG export. | `=` closed form |

## The reuse foundation (north star: zero new packages)

- **The airfoil engine moves intact** — `airfoil.ts` (the closed-form Joukowski / Kármán–Trefftz maps, the
  cylinder-plane potential, the Kutta circulation, and the Kutta–Joukowski lift) and its GPU render
  (`render/airfoilView.ts` + `render/airfoilShader.ts`, on `@cas/gpu`).
- **`@cas/flow` is already the transplant substrate** — `flowNet(refFlow)` builds the streamline /
  equipotential net past `𝔻*`; `pushforward(curves, ψ)` carries it onto the body. The polygon page's exact
  mechanism, but with a *closed-form* `ψ` in place of an SC-fitted one, so no least-squares solve is needed.
- **The gallery's closed-form maps already exist** — Riemann-Map's `EXTERIOR_MAP_PRESETS`
  (`apps/riemann-map/src/presets.ts`): univalent `ψ(z) = z + Σ bₖ/zᵏ` for Joukowski `½(z+1/z)`, vertical slit
  `½(z−1/z)`, ellipse `z+1/(2z)`, deltoid `z+1/(2z²)`, astroid `z+1/(3z³)`, 5-cusp star `z+1/(4z⁴)`. Riemann-Map
  is **consumer 1** (its exterior *image* pane); this app is **consumer 2** (the flow *transplant*), so under
  [ADR-0007](../DECISIONS.md) they are extracted into `@cas/flow` and golden-pinned across both.
- **The shell** — `@cas/ui` (`mountNavHeader` + `runWithFatalBoundary` + `attachCanvasA11y`), and `@cas/export`
  (PNG figure metadata) from HD-3.

## The design spine

**One construction, made visible: `flow past 𝔻* ── ψ ──▶ flow past B`.** Every page is a two-pane
disk↔body view whose left pane shows the elementary reference flow (uniform + circulation, and — for a
sharp-edged body — the vortex the Kutta condition fixes) and whose right pane shows the *same* streamlines
carried onto the body by `ψ`. The airfoil is where this pays off physically: the map that carries the flow
also produces the lift, and the app shows both halves at once. Honest labelling throughout — `=` for the
closed-form airfoil and gallery; a body with no closed-form map (the polygon, if HD-4 brings it) keeps its
`≈` / `degraded` SC-fit tier.

## Roadmap

Milestones are numbered **HD-n**. Nothing below is committed beyond HD-0; each is a separately-approved gate,
green before and after (guardrail: working software at every step).

- **HD-0 — scaffold + wire the empty app (done).** `apps/2d-hydrodynamics` with the hub `index.html` + the
  nav header, the body roster (`src/bodies.ts`) previewed on the hub, and a smoke test. Wired into
  `SUITE_APPS`, `vitest.workspace.ts`, the census `PROJECTS`, a launcher card, the `deploy-pages.yml` `cp`, and
  the a11y roster. Proves the wiring against a trivial page before any code moves.
- **HD-1 — move the airfoil (`git mv`, history preserved; done).** The seven airfoil files (`airfoil.html`,
  `main-airfoil.ts`, `airfoil.ts`, `render/airfoilView.ts` + `airfoilShader.ts`, and the two tests) moved in;
  the page retitled to "2D Hydrodynamics · Airfoil", its nav retargeted (`current: "2d-hydrodynamics"`), and its
  back-link now points at the app hub. Its slice of 2D-E's shared stylesheet was ported to a dedicated
  `src/styles/airfoil.css` so the page looks identical; the app gained `@cas/gpu` (the airfoil renderer). Removed
  from 2D Electrostatics: the files, the airfoil `rollupOptions.input`, the two now-dangling cross-page links
  (the sandbox "Airfoil ↗" and the polygon "Airfoil →"), and the `2d-electrostatics-airfoil` a11y roster entry.
  URL: `2d-electrostatics/airfoil.html` → `2d-hydrodynamics/airfoil.html` (no known external users; the page is
  stateless, so no `#vs=` migration).
- **HD-2 — the transplant gallery (the reassigned ES-4 + the second-consumer extraction; done).** Extracted
  `EXTERIOR_MAP_PRESETS` from Riemann-Map into `@cas/flow` (`exteriorPresets.ts` — `id` + `name` + the
  `@cas/expr` display `expr` **and** a plain `ψ: Pt → Pt` closure for the transplant), rewired Riemann-Map to
  consume it (byte-identical `MapPreset` shape), and pinned it with a golden (ψ values in
  `@cas/flow`) plus an expr↔psi cross-check in Riemann-Map's `presets.test.ts` so the two forms can't drift.
  `gallery.html` (`main-gallery.ts`): pick a body → `flowNet` past 𝔻* → `pushforward` through the closed-form
  `ψ` → the two-pane disk↔body view on `Net2D` line-art, with angle-of-attack and a **free circulation Γ**
  slider (all `=`, closed form). The gallery is the exterior presets **minus** the Joukowski segment — the
  airfoil page IS the Joukowski family, and is the one place a **Kutta** condition is imposed (a flat plate
  with Kutta is the zero-thickness airfoil), so the gallery leaves Γ free rather than duplicating that.
  The bodies are the flat plate (vertical slit), ellipse, deltoid, astroid, and 5-cusp star. A GPU
  domain-color upgrade (generalizing `airfoilShader.ts` to a generic closed-form `ψ`) remains an HD-3 option.
- **HD-3 — parity + identity polish (done).** Both pages gained the suite's shareable/reproducible shell:
  `#vs=` **permalinks** + a **Copy link** button (a shared `viewState.ts` on `@cas/interchange`'s
  `encodeViewState`/`decodeViewState`, app id `2dh`; the gallery also still accepts the bare `#<id>` hub
  deep-links), and **PNG export** + a **Save PNG** button (a shared `pngExport.ts` compositing the two panes
  and stamping the permalink into the file's `tEXt` via `@cas/export` — the airfoil's WebGL panes get
  `preserveDrawingBuffer` so the capture is reliable). The gallery also gained **stagnation-point markers**
  (the roots of `W_ref'(ζ) = 0`, pushed through ψ — front/rear on the body for `|Γ| ≤ 4πU`, one detached
  beyond, honestly labelled). The app now consumes `@cas/export` and `@cas/interchange`. Still optional /
  deferred: animated tracers, a GPU domain-color render for the gallery (generalizing `airfoilShader.ts`),
  and a stagnation overlay on the airfoil's GL panes (the trailing-edge Kutta stagnation).
- **HD-4 — migrate the polygon transplant (deferred; the expensive move).** Move `polygon.html` +
  `importConformalMap.ts` here to make the app the complete "flow past any body" home. Deferred because it
  ripples: the [ADR-0035](../DECISIONS.md) `conformal` interchange form, the `RM_TO_POTENTIAL_CONFORMAL_LINK`
  golden, and Riemann-Map's "Send to 2D Electrostatics ↗" deep link all move with it. Gate on wanting to unify
  the transplant story.
- **HD-5 — the `flow` interchange kind (deferred; consume, don't define).** 2D Electrostatics' ES-2 defines the
  deferred `flow` envelope; this app becomes its **second consumer** (import a field/flow app-state and show
  the flow past a transplant body), which retro-justifies the kind under ADR-0007.
- **HD-6 — one page, domain-colored everywhere (in progress; [ADR-0038](../DECISIONS.md)).** Collapse the hub +
  `airfoil.html` + `gallery.html` into a **single page** with a Body selector, and render **every** body with
  the same domain-colored two-pane look. Rests on the identity that every body — the airfoil included — is a
  forward map `ψ: 𝔻* → ext(B)` driven by flow past the unit disk (the airfoil is `ψ(w) = J(ζ₀ + R·w)`,
  `U' = U·R`; the `R` cancels in `dW/dz = W_ref'(w)/ψ'(w)`). The render is the app's own forward idiom on the
  GPU: a per-pixel shader for the disk (left) and a **forward-mapped colored mesh** for the body (right) — CPU
  warps the disk-exterior tessellation through `ψ` and colors it by the exact velocity `W_ref'/ψ'`, the GPU
  interpolating; no per-pixel inverse (the cusped bodies have no closed-form `ψ⁻¹`). Staged, each a green gate:
  - **HD-6.0 — ADR-0038 + this plan (done).**
  - **HD-6.1 — the unified body model + the airfoil-equivalence golden (done).** `bodyModel.ts` maps the app
    state to `{ ψ, ψ', reference flow }` for every body; `@cas/flow`'s `ExteriorMapPreset` gains `psiPrime`. The
    golden pins that the airfoil-via-`ψ` physical velocity equals the existing `airfoil.ts` field — the linchpin
    that the unification changes no physics. Pure, no UI.
  - **HD-6.2 — the single-page shell (done).** One `index.html` + the Body selector + per-body controls + the
    unified `#vs=` (back-compat for old airfoil / gallery / `#<id>` links); deleted the two pages + hub; rewired
    `vite.config` + the a11y roster. Rendered on the line-art as a working placeholder (the structural
    unification). The unified page is a11y-clean (the stage is a `<main>` landmark).
  - **HD-6.3 — the domain-color render (done).** The left per-pixel disk shader (`diskView`/`diskShader`) + the
    right forward-mapped colored mesh (`bodyMesh` → `bodyMeshView`/`bodyMeshShader`) + the shared colormap
    (`fieldColor.glsl`) + a thin 2D overlay (`overlay2d`) for the obstacle outline + stagnation markers,
    replacing the placeholder (the visual unification — the payload of #2). The airfoil's old per-pixel `ktInverse`
    shader is gone; every body now renders through the same forward mesh. Colour value gauges the far-field speed
    and streamline spacing scales with `U`, so both panes read in the same colours and matched ψ-levels; the mesh
    geometry is node-tested, the GL shading browser-verified across all six bodies.
  - **HD-6.4 — polish.** Any remaining refinement: doc/README sweep, and a final browser-verified sweep incl. PNG
    export over the GPU+overlay. (All-body stagnation markers + the airfoil Kutta trailing-edge point + the lift
    readout already landed in HD-6.2/6.3 — they fall out of the unified `ψ`-framework for free.)

## Non-goals

Field superposition and the electrostatic↔fluid lens (that is 2D Electrostatics), time-evolving free
boundaries (Hele-Shaw Flow), conductor / equilibrium analysis (Potential Theory), viscous / rotational /
compressible flow, and three-dimensional flow. This app stays the **steady, ideal, complex-analytic
flow-past-a-body** tool.

## References

The author's paper *Complex Analysis as Two-Dimensional Electrostatics and Hydrodynamics* (Graven, 2026);
Milne-Thomson, *Theoretical Hydrodynamics*; Batchelor, *An Introduction to Fluid Dynamics* (the Joukowski
aerofoil and the Kutta condition); and the pre-split
[`complex-potential-studio-plan.md`](complex-potential-studio-plan.md) (§M2.2) for the airfoil's construction
record. The Hele-Shaw HS-6 milestone ([`hele-shaw-flow-plan.md`](hele-shaw-flow-plan.md)) is the one honest
mathematical bridge between this app's *steady* Kutta circulation and Hele-Shaw's *evolving* twist γ
(McKee–Bush 2024).
