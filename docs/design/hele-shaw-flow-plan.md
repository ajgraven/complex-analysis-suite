# Hele-Shaw Flow — app plan

> **Status.** Split out of **2D Electrostatics** per [ADR-0036](../DECISIONS.md). The built work carried
> over intact — it originated as 2D-Electrostatics milestones **M4a–M4d**, whose full construction record
> stays in [`complex-potential-studio-plan.md`](complex-potential-studio-plan.md). This document is the
> **forward plan** for the app now that it is its own thing: what it is, what is built, and where it goes.

## What this app is

The **time-evolving free-boundary** corner of the old single app. A Hele-Shaw cell is two closely-spaced
plates; a blob of viscous fluid between them moves so that its boundary is the conformal image of the unit
disk, and that image **changes in time**. Everything else that came out of the original app
(sandbox / airfoil / polygon / conductor) is *steady* — a fixed field or a fixed map. The fault line the
split follows is exactly **steady vs. evolving**, and this app is the evolving side.

Two facets of the one physics, one per page:

| Page | Model | Honesty | Engine |
| --- | --- | --- | --- |
| `twist.html` | The exact Graven–Makarov one-point *unbounded* QD `QD(α/(w−w₀))` (w₀ = 2), driven by a **complex** charge α = q + iγ; grows and twists to a double point (α > 0) or a (3,2)-cusp. | `=` closed form | `heleShawOnePoint.ts` |
| `droplet.html` | The classical *bounded* interior droplet, grown from a central source by numerically integrating the Polubarinova–Galin equation; injection smooths, suction fingers. | `≈` numerical | `heleShawInterior.ts` + `heleShawInteriorStepper.ts` |

## Carried-over foundation (built)

- **The twist showpiece (M4a engine + M4b page).** `admissible` / `solveZ0` / `onePointMap` /
  `recoverCharge` / `criticalTime` / `buildFamily`; the growing/twisting boundary, the spiralling exterior
  grid, the driving charge's equipotentials, a `t → t*` play/scrub that stops hard at the critical time
  (⚠, never past the ill-posed cusp). The **conserved quadrature charge** (recovered = α at every t) is the
  honest conservation monitor.
- **The interior-droplet evolver (M4c).** The Galin–Kufarev spectral velocity solve (one `@cas/core`
  `dftOnCircle` + analytic completion — **no least squares**), RK4 in coefficient space with an adaptive
  step, the conserved **Richardson moments** `Mₖ` as the honest error bar (reported as `|Mₖ|` drift so a
  rigid spin reads as conserved), and a hard ⚠ cusp / suction-opt-in stop.
- **The QD → Hele-Shaw hand-off (M4d).** The Quadrature Domains app hands a one-point unbounded QD to
  `twist.html` via an `@cas/interchange` `quadrature-domain` link whose `hData` = h(w) = α/(w−w₀) carries
  the charge (convention-neutral residue, no π/2πi conversion). Pinned by the `QD_TO_HELESHAW` golden
  (producer half in QD's `schwarz-export.test.ts`, consumer half here in `importHeleShaw.test.ts`).
- **The shared kernel.** `@cas/flow` (the conformal-transplant reference flows + the `Net2D` line-art
  drawer), `@cas/core` (`dftOnCircle`), `@cas/interchange` (the hand-off), `@cas/ui` (the browser shell).

## The design spine

The through-line that makes these two pages one app is the **conserved-quantity monitor**: the exact page
watches the quadrature charge stay fixed while the area grows; the numerical page watches the Richardson
moments hold (or honestly drift) as the boundary evolves. Every readout is labelled `=` (closed form),
`≈` (numerical), or ⚠ (ill-posed / past a critical time) — the ill-posedness of suction and of the cusp
edge is a *feature to show*, never a failure to hide (RISKS §3).

## Roadmap

Milestones are numbered **HS-n** (the old **M4x** numbering belongs to 2D Electrostatics). Nothing below is
committed beyond HS-0; each is a separately-approved pass.

- **HS-0 — carve the app (done, ADR-0036 stage 1).** `apps/hele-shaw-flow`; the twist + droplet pages and
  their engines moved off `2d-electrostatics`; the QD hand-off retargeted to `hele-shaw-flow/twist.html`
  (golden renamed `QD_TO_POTENTIAL_HELESHAW` → `QD_TO_HELESHAW`, hash unchanged); a landing hub `index.html`.
- **HS-1 — the shell.** Adopt `mountNavHeader` (`@cas/ui`) on both pages (back-to-launcher + sibling nav +
  the "send to" picker) — one of the review's findings the split is meant to fix — and promote the hub from
  static links to a proper landing with the nav header.
- **HS-2 — one timeline.** Factor the scrub/play + conservation-monitor UI the two pages now each hand-roll
  into a single app-local component (a shared `<timeline>` + a `<conserved-quantity>` readout), so the exact
  and numerical pages present the same controls. Candidate for a fifth `@cas/flow` (or app-local) primitive
  only if a second consumer appears (ADR-0007).
- **HS-3 — the `flow` / evolving-family interchange kind.** The `flow` envelope kind was deferred at M2.4c
  and M4d "gate on a second consumer" (ADR-0007). The split now makes this app the natural home for an
  **evolving-family** hand-off: round-trip a Hele-Shaw family (charge/initial-shape + timeline), and deepen
  the QD import beyond the v1 single-simple-pole-at-w₀=2 (bounded QDs; nodes other than w₀ = 2; multi-point
  h). Design the kind here; promote shared decode to `@cas/interchange`.
- **HS-4 — droplet extensions.** Off-centre source (the Poisson-kernel RHS already supports |a| < 1);
  multiple / moving sources; a stiffer time integrator and a convergence/​self-refinement readout on the
  Galin–Kufarev solve; a moment-drift budget that auto-flags loss of accuracy before the cusp.
- **HS-5 — surface tension (M4e).** Regularize the ill-posed suction/​cusp edge with surface tension →
  tip-splitting fingers (Saffman–Taylor λ = ½). Strictly `≈` / ⚠ — a research view, never certified.
- **HS-6 — the steady↔evolving bridge.** Relate the airfoil-Kutta circulation of the *steady* transplant
  (2D Hydrodynamics, ADR-0037) to the *twist* γ here — McKee–Bush (2024), "Hele-Shaw with spin". A didactic
  overlay, not a new engine; the one honest place the two apps touch mathematically.

## Non-goals

Three-dimensional flow, non-Newtonian rheology, and the full multiply-connected (many-blob) problem are out
of scope — this app is the single-boundary, complex-analytic Hele-Shaw story. Certified rigor on any
suction / cusp / surface-tension evolution is explicitly **not** claimed (RISKS §3).

## References

Polubarinova-Kochina & Galin (1945); Richardson (1972); Gustafsson–Vasil'ev, *Conformal and Potential
Analysis in Hele-Shaw Cells*; Howison, *Complex variable methods in Hele-Shaw moving boundary problems*;
McKee–Bush (2024), "Hele-Shaw with spin"; and the author's paper *Complex Analysis as Two-Dimensional
Electrostatics and Hydrodynamics* (§2.2.3, §3.3) for the one-point family and the charge relation.
