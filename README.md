# complex-analysis-suite

> **Name.** The repository is **`complex-analysis-suite`**. Its packages use the internal
> workspace scope **`@cas/*`** (short for complex-analysis-suite; not published to npm —
> `workspace:*` only). The scope is an ergonomic alias, trivially renameable to
> `@complex-analysis-suite/*` if you prefer the full form.

A monorepo housing a growing **suite of complex-analysis and complex-dynamics
visualization tools** that share common underlying packages and can hand data off to one
another. The organizing goal — the **north star** — is that **each new tool added to the
suite requires building fewer primitives from scratch than the last**.

It currently hosts **ten** applications riding **twelve** shared `@cas/*` packages:

| App                                                | What it does                                                                                                                                                                                                                                                                                                  | Stack                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Complex Dynamics** (`apps/complex-dynamics`)     | GPU escape-time visualizer for parametrized families `f(z,c)` — Mandelbrot/multibrot, Julia sets, Tricorn/multicorn, rational & transcendental maps, Herman rings, Böttcher coordinates, external rays, df64 deep zoom                                                                                        | Vite + TypeScript       |
| **Quadrature Domains** (`apps/quadrature-domains`) | Solver + visualizer for (log-weighted) quadrature domains in the inverse and direct directions, plus **single-valued Schwarz-reflection dynamics**, limit sets, a Riemann-sphere view, a symbolic-elimination Algebra workspace, and a parameter-slice sweep engine                                           | Vite + JavaScript (ESM) |
| **Correspondences** (`apps/correspondences`)       | The new tool: **anti-holomorphic correspondences / Schwarz-reflection matings**. The deltoid Schwarz reflection σ (CPU + GPU), its deleted correspondence (branch engine + orbit trees + density render), a family parameter plane, a parabolic-Tricorn model space, and an interactive **mating visualizer** | Vite + TypeScript       |
| **Complex Function Plotter** (`apps/complex-function-plotter`) | Domain-coloring plotter for complex functions `f(z)` — phase portraits with modulus/phase enhancements and the conformal grid, a 3D modulus surface and a Riemann-sphere view, a live expression editor with named parameters, hi-res PNG export                          | Vite + TypeScript       |
| **Riemann Map** (`apps/riemann-map`)               | Pure-2D conformal-mapping studio: the image of the unit disk under a conformal map — from the editor, a numerical region map 𝔻 → Ω by the lightning method, an exterior (Böttcher) map imported from Complex Dynamics, or a Schwarz–Christoffel polygon map — plus the numerical Riemann map of a chosen domain            | Vite + TypeScript       |
| **Argument Principle** (`apps/argument-principle`) | Visualizes the argument principle: a closed contour and its winding image under `f(z)`, counting zeros minus poles enclosed, with a live expression editor and hi-res PNG export                                                                                                                              | Vite + TypeScript       |
| **Faber Transform** (`apps/faber-transform`)       | Visualizer for the exterior Faber transform Φφ: 𝒜(𝔻) → 𝒜(K): domain-colors an analytic `f` on the unit disk beside its Faber image `Σ bₙ Fₙ` on a cornered/curved `K` — ellipse, deltoid, finite-Laurent QDs, and **arbitrary polygons** (regular presets + a draggable editor via the exterior Schwarz–Christoffel engine), with per-corner norm annotations | Vite + TypeScript       |
| **2D Electrostatics** (`apps/2d-electrostatics`)   | The complex potential `W = φ + iψ` as an interactive field: drop/drag charges, sources, sinks, vortices, doublets, with an Electrostatic ↔ Fluid lens; plus a conformal-transplant polygon page — flow past or inside a polygon via Schwarz–Christoffel | Vite + TypeScript |
| **2D Hydrodynamics** (`apps/2d-hydrodynamics`)     | The hydrodynamic twin: ideal flow past a body as flow past the unit disk carried through a conformal map ψ: 𝔻* → ext(B) — the Joukowski/Kármán–Trefftz airfoil (the Kutta condition + Kutta–Joukowski lift) and a closed-form transplant gallery (flat plate, ellipse, deltoid, astroid, star), with `#vs=` permalinks + PNG export | Vite + TypeScript |
| **Hele-Shaw Flow** (`apps/hele-shaw-flow`)         | Free-boundary flow in a Hele-Shaw cell as a conformal map of the disk evolving in time: the exact Graven–Makarov "twisting" quadrature domain (a complex charge grows it to a double point or a (3,2)-cusp), and a numerical interior-droplet Polubarinova–Galin evolver (injection smooths; suction fingers into a cusp) | Vite + TypeScript |
| **Potential Theory** (`apps/potential-theory`)     | A compact set `K` as a grounded conductor: equilibrium charge, logarithmic capacity, and Green's-function equipotentials from the exterior conformal map, with Faber-polynomial zeros and Fekete/Leja points as two more roads to the equilibrium measure (exact `=` for SC polygons + closed forms, log-lightning `≈` for smooth blobs) | Vite + TypeScript |

The Correspondences tool was the **forcing function** for the whole suite: its
requirements deliberately drove which shared packages got extracted, and in what order.
See [docs/VISION.md](docs/VISION.md) for why that ordering was intentional rather than
incidental.

---

## Status

**Built.** The phased migration ([docs/MIGRATION.md](docs/MIGRATION.md), Phases 0–6) is
**fully executed and merged.** The workspace skeleton, unified tooling, the
Quadrature-app-onto-Vite ESM-ification, and the shared-package extractions
(`@cas/core` → `@cas/interchange` → `@cas/expr` + `@cas/gpu`, then `@cas/exact`, `@cas/schwarz`,
`@cas/dynamics`, and `@cas/export` on the ADR-0007 second-consumer rule, and `@cas/conformal`
extracted *ahead* of its second consumer per [ADR-0018](docs/DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore))
are all done; the Correspondences app exists through its parameter-space milestone plus a complete
interactive mating visualizer. The whole workspace is green (**3600 Vitest tests** across 436
files, lint, typecheck, and per-app builds).

What's **deferred / exploratory** (by design, not omission):

- **Branch continuation through cusps** in the correspondence engine is uncertified and
  labeled `≈` — the analytic tools behind it (straightening, David surgery) are not
  automatable to proof level ([RISKS §3](docs/RISKS.md#3-the-three-genuinely-hard-parts)).
- **Further correspondence families** (circle-and-cardioid → cubic Chebyshev → general
  `d:d`) beyond the deltoid.
- **QD Schwarz df64 deep-zoom** (the df64 substrate exists in `@cas/gpu`; wiring it into
  the Quadrature app's Schwarz renderer is not yet done).
- The broad **`quadrature` / `dynamics`** *domain* packages sketched in
  [ARCHITECTURE.md](docs/ARCHITECTURE.md) were **never extracted** whole — no second consumer
  needed all of either, which is exactly what [ADR-0007](docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)
  prescribes (the Correspondences app kept its σ-construction and Tricorn model local; the narrower
  inverse-Böttcher slice *did* ship as `@cas/dynamics`, ADR-0014). The would-be **`ui`** kit split too:
  its PNG-metadata half shipped as `@cas/export`, and the browser-shell primitives were later extracted as
  **`@cas/ui`** ([ADR-0032](docs/DECISIONS.md#adr-0032-extract-casui-ahead-of-adoption-port-cds-product-shell)).

---

## Quick start

Prerequisites: **Node 22** (see [`.nvmrc`](.nvmrc)) and **pnpm 9** via Corepack.

```bash
corepack enable                          # provides pnpm at the pinned version (9.15.9)
pnpm install                             # install the whole workspace

pnpm --filter complex-dynamics dev       # start an app's Vite dev server…
pnpm --filter quadrature-domains dev
pnpm --filter correspondences dev        # (serves two pages: the dynamical views + /mating.html)
pnpm --filter launcher dev               # the suite landing page

pnpm test                                # build packages, then run every Vitest suite
pnpm lint                                # ESLint across the workspace
pnpm typecheck                           # build packages, then tsc --noEmit everywhere
pnpm build                               # production build of every package + app
pnpm format                              # Prettier --write .
```

> The `test`, `typecheck`, and `build` scripts build the `@cas/*` packages first — apps
> and tests consume the packages' output — source `exports` (no `dist/`) for `@cas/conformal`,
> `@cas/dynamics`, `@cas/expr`, `@cas/flow`, `@cas/gpu`, `@cas/schwarz`, and `@cas/ui`, and built `dist/` for the
> other five (`@cas/core`, `@cas/exact`, `@cas/export`, `@cas/faber`, `@cas/interchange`) — so a change
> to a `dist/`-built package is picked up only after its build runs (the root scripts handle this for you).

Each app is an independent static Vite build (`base: "./"`), so its assets resolve from any path.
`.github/workflows/deploy-pages.yml` publishes on every push to `master`, gated on
lint + typecheck + test: one combined Pages site with the launcher at the root and
`complex-dynamics/`, `quadrature-domains/`, `complex-function-plotter/`, `riemann-map/`,
`argument-principle/`, `faber-transform/`, `2d-electrostatics/`, `2d-hydrodynamics/`, `hele-shaw-flow/`, and `potential-theory/` beneath it. Correspondences is built but not yet
published (the launcher lists it as "Coming soon"). `ci.yml` remains the separate
lint/typecheck/test/build gate plus a `browser` job for the WebGL2 GLSL harness. See
[ARCHITECTURE §8](docs/ARCHITECTURE.md#8-build--deployment-model).

---

## Repository layout

```
complex-analysis-suite/
├── README.md                 ← you are here
├── docs/                     ← the architecture + the executed migration plan (see the map below)
├── packages/                 ← shared libraries (the reuse surface); dependencies point downward only
│   ├── core/                 ← @cas/core        complex arithmetic, the ComplexAlgebra contract, Durand–Kerner, series, dense-poly + label formatting
│   ├── gpu/                  ← @cas/gpu         WebGL2 substrate: shader compile/link, df64 deep-zoom, complex-GLSL + shared GLSL snippets
│   ├── expr/                 ← @cas/expr        one AST → GLSL shader body + JS evaluator (dual-backend)
│   ├── interchange/          ← @cas/interchange typed hand-off schema (envelope + MapSpec/SchwarzReflection) + deep-link codec + golden corpus
│   ├── exact/                ← @cas/exact       exact polynomial arithmetic (CD + Correspondences)
│   ├── schwarz/              ← @cas/schwarz     the Schwarz-reflection σ engine (CD + Correspondences)
│   ├── dynamics/             ← @cas/dynamics    inverse-Böttcher exterior maps + external rays (Complex Dynamics)
│   ├── export/               ← @cas/export      PNG tEXt reproducibility metadata (CD + plotter + Riemann Map + Argument Principle + 2D Electrostatics)
│   ├── conformal/            ← @cas/conformal   the conformal-map builder: Vandermonde–Arnoldi + lightning + forward map + interior/exterior Schwarz–Christoffel (Riemann Map + Faber Transform + @cas/flow)
│   ├── faber/                ← @cas/faber       the exterior Faber-transform engine: Faber-polynomial recurrence, exact rational images, exterior-map Laurent jets (Quadrature Domains + Faber Transform + Potential Theory)
│   ├── ui/                   ← @cas/ui          the shared browser shell: accessible canvas, fatal-error boundary, off-thread compute, the suite nav header
│   └── flow/                 ← @cas/flow        the conformal-transplant kernel: reference flows + flow-net + interior/exterior SC glue + closed-form exterior-map gallery + Net2D line-art (2D Electrostatics + 2D Hydrodynamics + Hele-Shaw Flow + Potential Theory)
└── apps/                     ← thin applications; each a Vite build that consumes packages
    ├── launcher/             ← the unified menu: a static landing page linking to each app
    ├── complex-dynamics/
    ├── quadrature-domains/
    ├── correspondences/      ← the Phase-6 tool (dynamical views + the mating explorer)
    ├── complex-function-plotter/  ← domain-coloring plotter (2D portraits + 3D surface)
    ├── riemann-map/          ← pure-2D conformal-mapping studio (disk image + numeric Riemann map)
    ├── argument-principle/   ← argument-principle / winding-number visualizer
    ├── faber-transform/      ← exterior Faber-transform visualizer (curved + polygonal K)
    ├── 2d-electrostatics/    ← complex-potential field sandbox + the conformal-transplant polygon page
    ├── 2d-hydrodynamics/     ← ideal flow past a body via conformal transplant: the airfoil + a closed-form gallery
    ├── hele-shaw-flow/       ← free-boundary Hele-Shaw evolution: the twist + droplet showpieces
    └── potential-theory/     ← a compact set K as a grounded conductor (equilibrium measure, capacity, Green)
```

> **The twelve packages that exist** are `@cas/core`, `@cas/gpu`, `@cas/expr`,
> `@cas/interchange`, `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`, `@cas/export`, `@cas/conformal`, `@cas/faber`, `@cas/ui`, and `@cas/flow`.
> Packages were extracted **only as a second consumer proved it needed them**
> ([ADR-0007](docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)) — which is why the
> `quadrature` package that [ARCHITECTURE.md](docs/ARCHITECTURE.md) sketches as a target never
> fully materialized; the `ui` target split in two — its PNG-metadata half shipped as `@cas/export`, and the
> browser-shell primitives (canvas a11y, fatal boundary, off-thread compute, nav header) were later extracted
> as **`@cas/ui`** *ahead* of adoption ([ADR-0032](docs/DECISIONS.md#adr-0032-extract-casui-ahead-of-adoption-port-cds-product-shell)). And why
> `@cas/exact`, `@cas/schwarz`, `@cas/dynamics`, and `@cas/export` appeared *later* than the phase plan:
> each waited for its second consumer. The **one exception** is `@cas/conformal` — the lightning +
> forward-map conformal builder, carved out of the Riemann-map app *ahead* of its second consumer
> ([ADR-0018](docs/DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore))
> to give the Schwarz–Christoffel engine a home to be born into — since realized, with both an interior
> (Riemann Map directly; the split apps through `@cas/flow`) and an exterior (Faber Transform directly; the
> split apps through `@cas/flow`) SC builder now living there. `@cas/faber`, the tenth package, houses the
> exterior Faber-transform engine behind the Faber Transform and Potential Theory apps. The **twelfth** and
> newest package, `@cas/flow`, is the conformal-transplant kernel carved out of 2D Electrostatics when that app
> split into three ([ADR-0036](docs/DECISIONS.md#adr-0036-split-2d-electrostatics-into-three-apps-extract-casflow)).

> **Unified menu, not a unified shell.** The suite ships **separate apps that hand off to
> each other**, fronted by a lightweight **launcher** (`apps/launcher`) — deliberately
> _not_ a single-page shell with a tab per tool. See
> [ARCHITECTURE §11](docs/ARCHITECTURE.md#11-the-launcher-unified-menu-without-a-unified-shell).

Most packages and apps carry their own `README.md` with an API surface / feature list.

---

## Documentation map

The `docs/` set is the durable design record. `docs/MIGRATION.md` is the executed runbook;
the rest capture the _why_ (and remain the authoritative reasoning). Read in this order:

1. **[docs/VISION.md](docs/VISION.md)** — the long-term goal, guiding principles, non-goals,
   and the strategic reasoning (why a monorepo, why the correspondence tool drove the
   extraction order, what "done" looks like). Start here for the _why_.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the layered `packages/` + `apps/`
   design, the one-directional dependency rule, what each package owns, convention
   neutrality, and the `expr` + `interchange` keystone. The _where things live_.
3. **[docs/DECISIONS.md](docs/DECISIONS.md)** — the Architecture Decision Records
   (ADR-0001…0036): one decision each, with context, alternatives, trade-offs, and
   consequences. The _why each choice_.
4. **[docs/MIGRATION.md](docs/MIGRATION.md)** — the phase-by-phase runbook (Phases 0–6),
   now annotated with what actually shipped at each gate. The _how it was built_.
5. **[docs/INTERCHANGE.md](docs/INTERCHANGE.md)** — the hand-off data contract: the schema
   the apps use to pass objects (e.g. a Schwarz reflection) to each other, the deep-link
   codec, and versioning. The keystone spec.
6. **[docs/RISKS.md](docs/RISKS.md)** — the risk register, the three genuinely hard parts,
   solo-developer guardrails, and the (now-resolved) open questions.

> **Convention:** documents _link_ rather than duplicate. When a decision changes, update
> the owning doc — and for architectural decisions, add or supersede an ADR rather than
> silently rewriting history.

---

## License & provenance

The suite is **MIT** (Andrew Graven); both source applications were MIT as well. Complex
Dynamics and Quadrature Domains were brought in **with their git history preserved** (via
`git subtree`, [MIGRATION Phase 0](docs/MIGRATION.md#phase-0--genesis-the-workspace-skeleton)),
so authorship and provenance survive the merge. Each app's own `README` and math
references are retained under `apps/*`.
