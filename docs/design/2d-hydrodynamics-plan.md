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

| Page | Content | Honesty |
| --- | --- | --- |
| `index.html` | The app hub: what "flow past a body via conformal transplant" is, and the body gallery as a launcher. | — |
| `airfoil.html` | Flow past a Joukowski / Kármán–Trefftz airfoil — the cylinder↔wing transplant, thickness / camber / angle-of-attack, the Kutta condition, and the Kutta–Joukowski lift `L = −ρUΓ`. | `=` closed form |
| `gallery.html` | Flow past a closed-form body `ψ: 𝔻* → ext(B)` — vertical slit / flat plate, ellipse, deltoid, astroid, 5-cusp star — with a circulation slider (and the Kutta toggle where `B` has a sharp edge). | `=` closed form |

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
- **HD-1 — move the airfoil (`git mv`, history preserved).** The six airfoil files move in; the page retitles
  to "2D Hydrodynamics · Airfoil" and its nav retargets (`current: "2d-hydrodynamics"`). Removed from 2D
  Electrostatics: the files, the airfoil `rollupOptions.input`, and the `2d-electrostatics-airfoil` a11y roster
  entry. URL: `2d-electrostatics/airfoil.html` → `2d-hydrodynamics/airfoil.html` (no known external users; the
  page is stateless, so no `#vs=` migration).
- **HD-2 — the transplant gallery (the reassigned ES-4 + the second-consumer extraction).** Extract
  `EXTERIOR_MAP_PRESETS` from Riemann-Map into `@cas/flow` (id + label + the `@cas/expr` display string **and**
  a plain `ψ: Pt → Pt` closure for the transplant), rewire Riemann-Map to consume it, and pin the map values
  with a shared golden. Build `gallery.html`: pick a body → `flowNet` → `pushforward` through `ψ` → the
  two-pane view, with a circulation slider and the Kutta toggle enabled only where `B` has a sharp edge
  (Joukowski, slit). Ship on line-art (`Net2D`) first; a GPU domain-color upgrade (generalizing
  `airfoilShader.ts` to a generic closed-form `ψ`) is an HD-3 option, not an HD-2 requirement.
- **HD-3 — parity + identity polish.** Angle of attack, stagnation-point markers, a stream-function contour
  set, optional animated tracers, `#vs=` permalinks, and PNG export via `@cas/export`. Where the app stops
  being "the moved airfoil" and becomes its own tool.
- **HD-4 — migrate the polygon transplant (deferred; the expensive move).** Move `polygon.html` +
  `importConformalMap.ts` here to make the app the complete "flow past any body" home. Deferred because it
  ripples: the [ADR-0035](../DECISIONS.md) `conformal` interchange form, the `RM_TO_POTENTIAL_CONFORMAL_LINK`
  golden, and Riemann-Map's "Send to 2D Electrostatics ↗" deep link all move with it. Gate on wanting to unify
  the transplant story.
- **HD-5 — the `flow` interchange kind (deferred; consume, don't define).** 2D Electrostatics' ES-2 defines the
  deferred `flow` envelope; this app becomes its **second consumer** (import a field/flow app-state and show
  the flow past a transplant body), which retro-justifies the kind under ADR-0007.

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
