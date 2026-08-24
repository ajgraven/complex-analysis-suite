# Complex-Potential Studio — implementation plan

> Adds an **eighth app**, `apps/2d-electrostatics` (label **"2D Electrostatics"**) — an interactive realization of the
> author's paper *"Complex Analysis as Two-Dimensional Electrostatics and Hydrodynamics"*
> (Graven, May 2026). The user builds a complex potential `W(z) = φ + iψ` by dropping and
> dragging **charges / sources / sinks / vortices / doublets / a uniform background**, sees it
> as field-lines / streamlines, equipotentials, and a domain-colored field, and switches a
> single **lens** between the electrostatic and hydrodynamic readings of the *same* picture.
> Later phases add **conformal transplant** of flows, a **potential-theory** tab (equilibrium
> measure, capacity, Fekete points), and the **Hele-Shaw "twisting" showpiece** driven by a
> complex charge (the Graven–Makarov unbounded-QD family, made to move).
>
> **Framing: hybrid** — a physics-first sandbox core **plus a first-class "theorem gallery"**
> that walks the paper's dictionary (Gauss's law, the argument principle, Jensen, Bôcher,
> the Riemann map as a grounded cavity, method of images, quadrature-domain indistinguishability).
>
> **Approved scope for this pass: M0 + M1** (the render spike + the superposition sandbox — a
> first shippable app). **M2–M4 are specced here but deferred to later, separately-approved
> pushes.** Nothing here re-litigates a locked ADR.
>
> Mirrors the suite runbook style ([`../MIGRATION.md`](../MIGRATION.md)): **phase gates that are
> each shippable, a motivating win early, one ground-truth check per gate, test-guarded changes.**
> Work lands as small, CI-green commits on branch `claude/analysis-suite-app-ideas-2th42x`.
> Guardrails: [`../../CLAUDE.md`](../../CLAUDE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) /
> [`../DECISIONS.md`](../DECISIONS.md) / [`../RISKS.md`](../RISKS.md). New decisions recorded as
> **ADR-0033** (the app + hybrid framing + convention-at-edge + M4-lives-here) and **ADR-0034**
> (the `@cas/interchange` `ConformalMap` + `flow` forms).

---

## Build progress (living record)

> Filled as milestones land, so a resumed session knows where to pick up.

| Milestone | Status | Coverage |
|---|---|---|
| **M0 — holomorphic-field render spike** | ☐ approved, not started | `W` from superposed closed-form singularities → `@cas/expr` → GPU domain-color of `W'` + adaptive `φ`/`ψ` contours; GLSL↔JS dual-backend parity. |
| **M1 — superposition sandbox** | ☐ approved, not started | drop/drag palette, complex `c = q+iγ`, two-lens toggle, sensor puck, flux/circulation probes, even-spaced streamlines + optional motion, presets, `#vs=` permalink + PNG export, first theorem-gallery entries. |
| **M1 gate** | ☐ | full repo gate green (lint + dep:check, typecheck, test, build all apps + browser WebGL2); launcher card added; **pause for review.** |
| M2 — conformal transplant | ⛔ deferred | Joukowski / Kármán–Trefftz airfoils (two-pane, Kutta→lift) + interior/exterior SC; **opens the `ConformalMap` interchange form.** |
| M3 — potential-theory tab | ⛔ deferred | equilibrium measure `Ψ⁎(dθ/2π)`, capacity `\|lead coeff\|`, Green level curves `log\|Ψ⁻¹\|`, Fekete/Leja relaxation, Faber/Chebyshev-zero overlay. |
| M4 — Hele-Shaw "twisting" showpiece | ⛔ deferred | complex-`c₀` Polubarinova–Galin time-stepper, spiral equipotentials, moment monitor, cusp detection; **imports QD's σ / moments via interchange.** |

---

## 1. The seam: what the suite already provides

A complex-potential app is *additive composition + a new render mode*, not a new engine.

- **The shared browser shell** (`@cas/ui`, ADR-0032 — chartered + adopted suite-wide on `master` since
  this plan was drafted): `mountCanvas` (accessible render+overlay+live-region), `runWithFatalBoundary`
  (WebGL2-aware fatal banner + boot-overlay removal), `createComputeClient` (worker offload), and
  `mountNavHeader` over the `SUITE_APPS` registry. This new app **adopts the shell from day one** and
  **registers itself in `packages/ui/src/apps.ts`** — it does not hand-roll its own UI primitives.
- **Expression → GLSL and → JS closures** (`@cas/expr`): `compileF`/`makeComplexFn` emit the dual
  backend; `differentiate` gives `W'` symbolically. `W` is a first-class executable expression.
- **The GPU substrate** (`@cas/gpu`): `PHASE_COLORING_GLSL`, `COMPLEX_*_GLSL`, `PLANE_FROM_FRAG_GLSL`,
  `FULLSCREEN_VERTEX_GLSL`, colormap LUT textures, `df64` deep-zoom, and the **dual-backend GLSL↔JS
  parity harness** (`dualBackend.ts`) — the exact oracle for pinning a new flow shader.
- **Conformal maps** (`@cas/conformal`): lightning `fitConformalMap` (smooth Ω→𝔻), interior
  `fitSchwarzChristoffel` (two-mode), and **exterior** `fitExteriorSchwarzChristoffel` +
  `exteriorMapLaurentAtInfinity` — the transplant engines *and* the source of capacity / equilibrium
  measure (§M3).
- **Potential-theory quantities for free** (`@cas/faber` + `@cas/conformal`): the exterior map `Ψ`'s
  leading Laurent coefficient **is** `cap(K)`; uniform-`θ` boundary samples of `Ψ` **are** the
  equilibrium charge density; `log|Ψ⁻¹|` **is** the Green's function; Faber polynomials + zeros are
  already computed.
- **Schwarz reflection + moments** (`@cas/schwarz` + the QD app's `sym-core.mjs`): the σ engine and
  Richardson-moment machinery the M4 showpiece imports.
- **Cross-cutting**: `#vs=` per-app view-state codec + `#s=` map hand-off (`@cas/interchange`),
  `injectPngText` recipe-in-PNG (`@cas/export`), KaTeX labels — all inherited.

## 2. The gap

No app yet renders a **field** (Dictionary I: a meromorphic function *is* the field, poles are the
sources) or the **flow/electrostatic** reading of one. The argument-principle app counts zeros; the
plotter colors `f(z)`; neither draws streamlines, equipotentials, sources, or vortices. And nothing in
the suite exposes the potential-theory layer (capacity, equilibrium measure) or the complex-charge
Hele-Shaw growth, despite the machinery sitting one relabel away. Online the gap is real too:
elementary-flow toys exist (potentialflow.com, airfoil playgrounds, Falstad), but **transplant through
arbitrary suite maps, interactive equilibrium-measure/capacity, and complex-charge QD twisting do not.**

## 3. Architecture

### 3.1 The holomorphic, closed-form field engine

`W(z)` is always a finite sum: `U·e^{−iα} z  +  Σₖ cₖ·log(z−aₖ)  +  Σₖ (multipole terms)`, optionally
composed with a conformal map (§M2). Because it is holomorphic and closed-form, `W`, the complex
velocity `W'(z)`, and the drawn velocity `conj(W')` evaluate **exactly per-fragment** — no
velocity-texture sampling, analytic derivatives available. This single fact sets the whole render
strategy and makes mid-drag recomputation free.

Elementary terms (app-edge normalization, §3.3):

| element | `W(z)` | drives |
|---|---|---|
| uniform, speed `U`, angle `α` | `U e^{−iα} z` | background stream |
| charge/source `q` at `a` | `q · log(z−a)` | radial field / source |
| vortex `γ` at `a` | `i γ · log(z−a)` | circulation (circles) |
| **charge+vortex** `c = q+iγ` | `c · log(z−a)` | **logarithmic spiral**, pitch `arctan(γ/q)` |
| doublet `μ`, axis `β` | `μ e^{iβ}/(z−a)` | dipole |
| order-`m` multipole | `cₘ/(z−a)ᵐ` | quadrupole, … |

`c = q + iγ` = **charge + vortex** is the organizing primitive (paper §1.7, Remark 1.6).

### 3.2 Render layers (cost-tiered)

1. **Base (every frame, mid-drag):** domain-color `W'` (hue = flow direction, log-contoured
   magnitude = speed) + **Reusser `fwidth`-normalized adaptive contours** of `φ` and `ψ` in one pass.
   Contour `ψ/(2π/N)` so the `2π` branch jumps around vortices/sources are **artifact-free**;
   local-octave spacing absorbs the crowding near singularities.
2. **Textbook (CPU, cached, re-placed only when a singularity moves):** **Jobard–Lefer evenly-spaced
   streamlines** (RK4 on `conj(W')`, the anvaka/streamlines pattern), arrowheads at fixed arc length,
   with explicit ring/separatrix seeds around each source/vortex and each stagnation point (`W'=0`,
   via `@cas/core` `rootsMonic`).
3. **Motion (ping-pong, optional):** **IBFV** (van Wijk 2002) or Agafonkin-style GPU tracer particles
   with faded trails + random respawn.

Field **strength is encoded by brightness/opacity, never by arrow length or line spacing** (the one
lesson shared by Falstad and PhET — it fixes the near-singularity blob), with a legend + hover readout.

### 3.3 Conventions (ADR-0006-aligned, ADR-0033)

Adopt the paper's normalizations **at the app/domain edge**, exactly as the QD app does — `∮ dz/z = 1`
(absorbs `1/2πi`) and `dA = dx dy/π` (absorbs `1/π`) — so residues, flux/circulation, charge, and
capacity read prefactor-free. `@cas/core`/`@cas/gpu` stay convention-neutral. Signs follow the paper
(`E = Eₓ − iE_y`; `∫_Γ E dz = circulation + i·flux`; `c = q + iγ`, circulation `−2πγ`), pinned by
GLSL↔JS parity and closed-form ground truth.

### 3.4 The two lenses (no recompute)

One toggle relabels the same `W` between readings — potential `φ` ↔ velocity potential, field lines ↔
streamlines, charge/flux ↔ source strength, `Im` residue ↔ circulation/vortex — changing axis labels,
legend, and readouts only. This is the paper's parallel Electrostatic / Fluid-Dynamical interpretations,
and is a differentiator none of the surveyed single-domain tools offer.

### 3.5 The theorem gallery (hybrid framing, ADR-0033)

A first-class tab that turns the paper's dictionary into guided, live pictures layered on the sandbox.
Each entry is an overlay + a short honest caption. Entries attach to the milestone that first supports
them: **M1** — residue theorem = Gauss's law / Kelvin circulation (the drag-rectangle flux/circulation
probes), the argument principle = charge counting, Jensen's formula (circular-average vs. central
potential + enclosed charges), the maximum principle / Liouville, method of images (Schwarz reflection,
Blaschke = image charges for a grounded disk); **M2** — the Riemann map as *a unit test charge in a
grounded cavity* (`|F| = e^{−G}`), Runge (exterior sources synthesize interior fields); **M3** —
Faber/Chebyshev zeros → equilibrium measure, capacity/Green's function; **M4** — quadrature-domain
exterior indistinguishability and mother bodies. The gallery is scaffolded in M1 with its M1 entries.

## 4. Milestones

### M0 — holomorphic-field render spike *(approved)*

Superpose closed-form singularities → build `W` as `@cas/expr` → GPU domain-color of `W'` + adaptive
`φ`/`ψ` contours; verify the flow shader against the JS twin with `dualBackend.ts`.
*Ground truth:* exact uniform / single-source / single-vortex / dipole fields; the source+vortex
streamline is a logarithmic spiral of pitch `= arctan(γ/q)` (pure source → radial, pure vortex →
circles, equal → 45°). *Findings to record:* whether the base layer holds mid-drag at full res.
De-risks the whole render path; retained as M1's foundation.

### M1 — the superposition sandbox *(approved — first shippable app)*

- **Interaction:** drag a token (charge/source/sink/vortex/doublet/uniform) from a palette onto the
  canvas; thereafter drag the element to reposition with **live recompute**; select → side panel to
  edit strength, sign, doublet axis `β`, and split a residue into `q` (charge) + `γ` (vortex); each
  element keeps a grabbable handle even where the field is dense (PhET/Falstad model).
- **Two-lens toggle** (§3.4); **complex-`c` spiral rendering** with the honest decomposition
  `residue = flux + i·circulation` surfaced.
- **Sensor puck** (PhET): a draggable probe reading `|E|`/speed, direction, `φ`, `ψ`, that can "drop a
  streamline / equipotential through here" — contours are summoned, not auto-dense (declutter).
- **Flux/circulation probes:** drag a rectangle → real part = enclosed charge (Gauss), imaginary part =
  enclosed circulation (Kelvin) — the residue theorem, live. First **theorem-gallery** entries hang here.
- **Presets:** Rankine half-body / oval, cylinder in a stream with circulation.
- **Motion (optional):** IBFV or tracer particles.
- **Persistence:** `#vs=` per-app view-state (namespaced `cp`, forward-compatible) + hi-res PNG with
  `injectPngText` recipe + scale bar.

*Ground truth:* Rankine-oval streamline shape; cylinder stagnation points coalescing at the top at
`Γ = 4πUa`; probe sums = enclosed charge/vorticity for known configurations.
*Honest labels:* `=` closed-form fields; `≈` marching/integrated contours and any traced streamline.
**Gate → pause for review.**

### M2 — conformal transplant *(deferred)*

General recipe `W_phys(z) = W_ref(Φ(z))`, `dW_phys/dz = W_ref'(Φ)·Φ'` (source/vortex strengths are
conformally invariant; place singularities at images; circulation needs the compensating-vortex
bookkeeping the Kutta condition later *chooses*).
- **(a) Closed-form:** Joukowski + **Kármán–Trefftz** airfoils, a **two-pane cylinder↔wing** view with
  colour-matched streamlines (reusing the suite's prevertex-linking idiom), **Milne-Thomson circle
  theorem**, **Kutta condition → circulation → lift** `L = ρUΓ`, isotachs.
- **(b) Numerical:** consume `@cas/conformal` interior SC (flow inside a polygon) + exterior SC (flow
  past a polygon; **flat plate = degenerate 2-gon** cross-check); lightning mode while dragging, precise
  on release. **Opens the `ConformalMap` interchange form** (§6) → Riemann-Map becomes producer.
*Ground truth:* Kutta–Joukowski lift `∝ sin(α+β)`; flat-plate flow vs. closed form.

### M3 — potential-theory tab *(deferred)*

- **Equilibrium measure** = `Ψ⁎(dθ/2π)` — plot `Ψ(e^{iθ})` for uniform `θ`; the dot density on `∂K`
  *is* the charge density. **Capacity** = `|leading coeff of Ψ|`. **Green level curves** = images of
  `|w| = e^{t}`. All `=` for the SC/closed-form domain classes.
- **Fekete/Leja relaxation** — gradient flow on `−Σ log|zᵢ−zⱼ|` projected to `∂K`, or greedy Leja
  (O(1) incremental for an `n`-slider), or QR-pivot approximate Fekete (Sommariva–Vianello). `≈`,
  converging to `μ_K`.
- **Faber/Chebyshev-zero overlay** — the picture *is* the theorem `(1/n)log|Pₙ| → g_K + log cap`,
  `ν(Pₙ) →* μ_K`; reuse `@cas/faber` zeros.
- For general `K` with no closed-form `Ψ`: the **log-lightning** least-squares capacity/Green solver
  (Baddoo–Trefethen) on the existing `lstsqHouseholder` stack (`≈`).
*Ground truth:* the golden capacity table (§7); arcsine law on `[−1,1]`.

### M4 — Hele-Shaw "twisting" showpiece *(deferred; lives in this app, imports from QD — ADR-0033)*

Time-step the **Polubarinova–Galin** equation `Re[ġ · conj(g')] = Re c₀` on `|w|=1` with a **complex
source** `c₀ = q+iγ` (rational/Laurent `g(w,t)`): spiral equipotentials `Re W = q log|z−a| − γ arg(z−a)`,
a **twisted** growing QD boundary, **Richardson moments monitored** as a conserved-quantity correctness
check, **cusp detection** (`min|g'|→0` → honest `⚠` at the singular time), optional surface-tension
regularization → tip-splitting. Imports QD's σ / unbounded-QD complex-charge recipe + moments via
interchange (§6); reuses `@cas/schwarz`. Key refs: Bazant–Crowdy; Gustafsson–Vasil'ev; McKee–Bush 2024
("Hele-Shaw with spin"), which draws the airfoil-Kutta analogy inside a Hele-Shaw cell — the M2↔M4
bridge; Zabrodin (Coulomb-gas droplet).
*Ground truth:* conserved `Mₙ`; Saffman–Taylor `λ=½`; the Graven–Makarov one-point unbounded-QD family
(real `c₀` symmetric → imaginary `c₀` maximally twisted, cusp at the admissible-region edge).
*Honest labels:* evolution past a cusp and any surface-tension regularization are `≈`/`⚠` — ill-posed,
never certified (RISKS §3 discipline).

## 5. Package touch-points & dependencies

- **M0–M1:** `@cas/ui`, `@cas/expr`, `@cas/gpu`, `@cas/core`, `@cas/interchange`, `@cas/export`. New code is
  app-local: the **singularity data model**, the flow shaders, the sensor/probe UI, the Jobard–Lefer
  placement, the gallery scaffold. **No new package** (ADR-0007 — extract only on a second consumer).
  Wiring: register in `packages/ui/src/apps.ts` (`SUITE_APPS`), `vitest.workspace.ts`, the census
  `PROJECTS` list (`scripts/assert-test-census.mjs`), a launcher card, and the `deploy-pages.yml` `cp`.
- **M2:** add `@cas/conformal`. **M3:** add `@cas/faber`. **M4:** add `@cas/schwarz`.
- Dependency direction respected (app imports packages; no app imports another app — QD hand-off is via
  `@cas/interchange` goldens, not a cross-app import).

## 6. Interchange delta (interchange → 1.4.0, ADR-0034) — lands in M2

- **`ConformalMap`** variant of `MapSpec` (kind stays `"map"`): engine tag
  (`lightning|sc-interior|sc-exterior`), polygon, prevertices `wₖ`, interior angles `αₖ`, constant `C`,
  capacity, mode + `converged`/`degraded`/`residual`. Reconstructed via `@cas/conformal`, exactly as
  `form:"schwarz"` is via `@cas/schwarz`. Shared forward with future apps (#3 Fingerprints, #7 Circle
  packing — see [`future-app-ideas.md`](future-app-ideas.md)).
- **`flow`** envelope kind (singularity list + optional map reference + uniform background + convention
  tag) — full app-state hand-off, extending the `form:"schwarz"` recipe pattern.
- **QD → potential recipe** (M4): reuse QD's existing `form:"schwarz"` export + a complex-`c₀`/moment
  payload.
- Goldens: `RM_TO_POTENTIAL_CONFORMAL_LINK`, `QD_TO_POTENTIAL_SIGMA`. Both sides pinned (the dependency
  rule forbids a producer→consumer test in either app).

## 7. Ground-truth corpus (golden values to hard-code)

| Quantity | Value |
|---|---|
| `cap` unit disk / `[-1,1]` / `[-2,2]` / ellipse `a,b` | `1` / `0.5` / `1` / `(a+b)/2` |
| `cap` unit square (side 1) / side-2 square | `0.5901702995080` / `1.1803405990161` |
| `cap` equilateral triangle side 1 / lemniscate `{|z²−1|≤1}` | `0.4217539346484` / `1` (exact) |
| `μ_[-1,1]` density / potential on `E` / Green fn | `1/(π√(1−x²))` / `log 2` / `log|z+√(z²−1)|` |
| disk radius `r`: `μ` / `g(z,∞)` | uniform on `|z|=r` / `log(|z|/r)` |
| identities to unit-test | `cap=|lead Ψ|`, `g_K=log|Ψ⁻¹|`, `μ_K=Ψ⁎(dθ/2π)` |
| spiral pitch of `c=q+iγ` | `arctan(γ/q)` |
| cylinder stagnation coalescence | `Γ = 4πUa` |
| airfoil lift | `L = ρUΓ`, `Γ = −4πUR sin(α+β)` |
| conserved Hele-Shaw moments | `Mₙ` (`n≥1`) fixed; `M₀` linear in `t` |

## 8. Open items / risks

- **Naming (decided).** App dir / id `apps/2d-electrostatics`, launcher + nav label **"2D Electrostatics"**,
  badge "Electrostatics" (subtitle "Fields · Flow · Potential theory"). The hydrodynamic lens rides the
  same app under the two-lens toggle.
- **Multi-valued `ψ`.** Handled on the GPU by contouring `ψ/(2π/N)`; the CPU streamline placer must skip
  branch-cut edges (`|Δψ| > π·strength`). Flagged so it isn't rediscovered.
- **Near-singularity integration.** Fixed-step RK4 breaks where `|v|` spans orders of magnitude; switch
  to adaptive RK45 near sources, cap the integrand inside a capture disk.
- **M4 ill-posedness.** Zero-surface-tension Laplacian growth is ill-posed past a cusp; the plan treats
  the cusp time as a hard honest stop (`⚠`), with surface-tension regularization strictly `≈`.

## 9. References (curated; full bibliography carried into the ADRs)

- **Foundational (this repo):** the author's paper *Complex Analysis as Two-Dimensional Electrostatics
  and Hydrodynamics* (Graven, 2026); Graven–Makarov, *Quadrature domains and the Faber transform*
  (arXiv:2509.03777); Graven, *Analysis of log-weighted quadrature domains* (arXiv:2604.10394).
- **Rendering:** Cabral–Leedom (LIC, SIGGRAPH '93); van Wijk (IBFV, SIGGRAPH 2002); Jobard–Lefer
  (evenly-spaced streamlines, '97); Reusser (adaptive `fwidth` contouring, Observable); Agafonkin
  (WebGL wind map).
- **Transplant / Hele-Shaw:** Milne-Thomson, *Theoretical Hydrodynamics*; Batchelor; Driscoll–Trefethen,
  *Schwarz–Christoffel Mapping*; Bazant–Crowdy, *Conformal Mapping Methods for Interfacial Dynamics*;
  Gustafsson–Vasil'ev, *Conformal and Potential Analysis in Hele-Shaw Cells*; Richardson (1972);
  McKee–Bush (arXiv:2410.07366); Zabrodin (arXiv:0907.4929).
- **Potential theory:** Ransford, *Potential Theory in the Complex Plane*; Saff–Totik, *Logarithmic
  Potentials with External Fields*; Saff survey; Baddoo–Trefethen, *Log-lightning computation of
  capacity*; Sommariva–Vianello (approximate Fekete points); Garnett–Marshall, *Harmonic Measure*.
- **Tools to learn from:** Falstad field applets; PhET *Charges and Fields*; potentialflow.com; Airfoil
  Playground (dimanov); NASA FoilSim; Needham, *Visual Complex Analysis* (Pólya vector fields).
