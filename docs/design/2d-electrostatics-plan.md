# 2D Electrostatics — app plan

> **Status.** Reshaped by [ADR-0036](../DECISIONS.md): the time-evolving Hele-Shaw pages and the
> potential-theory conductor view split into their own apps (see
> [`hele-shaw-flow-plan.md`](hele-shaw-flow-plan.md) and
> [`potential-theory-plan.md`](potential-theory-plan.md)), leaving 2D Electrostatics as the
> **interactive field-and-flow** app: the free-field sandbox + the conformal-transplant polygon. The
> airfoil transplant has since moved to its own app, 2D Hydrodynamics
> ([ADR-0037](../DECISIONS.md), [`2d-hydrodynamics-plan.md`](2d-hydrodynamics-plan.md)). The full
> M0–M4 construction record — including the parts that moved — lives in
> [`complex-potential-studio-plan.md`](complex-potential-studio-plan.md), the original single-app plan
> this and its two siblings were split out of. This document is the **forward plan** for what remains.

## What this app is now

An interactive realization of the complex potential **W(z) = φ + iψ**. You build a field by dropping and
dragging charges / sources / sinks / vortices / doublets over a uniform background, read it as field
lines, equipotentials, streamlines, and a domain-colored field, and flip one **lens** between the
electrostatic and hydrodynamic readings of the same picture. Then you carry that flow through a conformal
map — past/inside a polygon via Schwarz–Christoffel. Two pages, both **steady** (a fixed field or a fixed
map); the *evolving* free-boundary story is Hele-Shaw Flow's, the *analysis* of a conductor is Potential
Theory's, and *flow past a body* (the airfoil + the closed-form gallery) is 2D Hydrodynamics'.

| Page | Content |
| --- | --- |
| `index.html` | The free-field sandbox (drag charges/sources/…; lens; flux/circulation probe; sensor puck; tracer flow; presets; permalinks + PNG). |
| `polygon.html` | Flow past OR inside a polygon via Schwarz–Christoffel — a producer AND consumer of the `@cas/interchange` conformal-map hand-off (ADR-0035). |

## Carried-over foundation (built)

- **M0/M1 — the sandbox.** `field.ts` (uniform + monopoles `c = q+iγ` + doublets) on a WebGL2 fragment
  shader (`@cas/gpu/glsl`), the adaptive φ/ψ contour net, the Electrostatic↔Fluid lens, the residue-as-
  Gauss/Kelvin probe, the draggable sensor, animated tracers, presets, permalinks, PNG export.
- **M2 — conformal transplant.** The exterior + interior Schwarz–Christoffel polygon transplant (now via
  `@cas/flow`); the `ConformalMap` interchange form (ADR-0035) — the app is producer (Copy link) and
  consumer (import a `#s=` polygon) and the Riemann-map SC studio is the cross-app producer
  (`RM_TO_POTENTIAL_CONFORMAL_LINK` golden). *(The closed-form Joukowski/Kármán–Trefftz airfoil engine,
  also built at M2, moved to 2D Hydrodynamics — ADR-0037.)*

## The design spine — the theorem gallery

The through-line the paper asks for, and the app's next headline: a first-class **theorem gallery** that
walks the paper's dictionary on the live field — Gauss's law (flux = enclosed charge), the argument
principle (winding = zeros − poles), Jensen's formula, Bôcher's theorem, the Riemann map as a grounded
cavity, the method of images, and quadrature-domain indistinguishability. The sandbox is the substrate;
each gallery entry is a curated state + an overlay that *shows the theorem happening*. (The gallery was
scoped in the original studio plan but never materialized — reviving it as the app's spine is the
agreed direction.)

## Roadmap

Milestones are numbered **ES-n**. Nothing below is committed beyond ES-0.

- **ES-0 — reshape (done, ADR-0036 stage 3).** Hele-Shaw + Potential-Theory split out; 2D Electrostatics
  trimmed to sandbox + airfoil + polygon; now-unused deps pruned (`@cas/core`, `@cas/expr`, `@cas/faber`,
  `@cas/conformal`), leaving `@cas/export`, `@cas/flow`, `@cas/gpu`, `@cas/interchange`, `@cas/ui`; the shared
  **nav header** (`mountNavHeader`) adopted on all three pages.
- **ES-1 — the theorem gallery** (the spine, above). A gallery index + per-theorem curated state and
  overlay, built on the sandbox. Honest labelling throughout (`=`/`≈`).
- **ES-2 — the `flow` interchange kind.** The free-field state as an `@cas/interchange` payload (deferred
  at M2.4c / ADR-0007, "gate on a second consumer") — export a field, and accept one from a sibling; the
  natural wiring target for the nav header's U7 hand-off picker.
- **ES-3 — worker offload for the SC fit.** The polygon exterior/interior Schwarz–Christoffel solve runs
  on the main thread today; move it onto `@cas/ui`'s `createComputeClient` (worker offload + coalescing)
  so a reentrant refit never janks the drag (a review finding).
- **ES-4 — more transplant families. _(Reassigned to 2D Hydrodynamics, ADR-0037.)_** Additional closed-form
  maps (slit, ellipse, star) as first-class transplant targets are now that app's gallery (HD-2), alongside
  its airfoil; 2D Electrostatics keeps only the polygon transplant.

## Non-goals

Time evolution (that is Hele-Shaw Flow), conductor/equilibrium analysis (that is Potential Theory),
three-dimensional fields, and any non-holomorphic field model. This app stays the steady,
complex-analytic field-and-flow sandbox.

## References

The author's paper *Complex Analysis as Two-Dimensional Electrostatics and Hydrodynamics* (Graven, 2026);
Milne-Thomson, *Theoretical Hydrodynamics*; Driscoll–Trefethen, *Schwarz–Christoffel Mapping*; and the
original [`complex-potential-studio-plan.md`](complex-potential-studio-plan.md) for the full M0–M4 record.
