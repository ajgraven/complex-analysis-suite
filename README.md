# complex-analysis-suite

> **Name.** The repository is **`complex-analysis-suite`**. Its packages use the internal
> workspace scope **`@cas/*`** (short for complex-analysis-suite; not published to npm —
> `workspace:*` only). The scope is an ergonomic alias, trivially renameable to
> `@complex-analysis-suite/*` if you prefer the full form.

A monorepo housing a growing **suite of complex-analysis and complex-dynamics
visualization tools** that share common underlying packages and can hand data off to one
another. The organizing goal — the **north star** — is that **each new tool added to the
suite requires building fewer primitives from scratch than the last**.

It currently hosts **three** applications riding **five** shared `@cas/*` packages:

| App                                                | What it does                                                                                                                                                                                                                                                                                                  | Stack                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Complex Dynamics** (`apps/complex-dynamics`)     | GPU escape-time visualizer for parametrized families `f(z,c)` — Mandelbrot/multibrot, Julia sets, Tricorn/multicorn, rational & transcendental maps, Herman rings, Böttcher coordinates, external rays, df64 deep zoom                                                                                        | Vite + TypeScript       |
| **Quadrature Domains** (`apps/quadrature-domains`) | Solver + visualizer for (log-weighted) quadrature domains in the inverse and direct directions, plus **single-valued Schwarz-reflection dynamics**, limit sets, a Riemann-sphere view, a symbolic-elimination Algebra workspace, and a parameter-slice sweep engine                                           | Vite + JavaScript (ESM) |
| **Correspondences** (`apps/correspondences`)       | The new tool: **anti-holomorphic correspondences / Schwarz-reflection matings**. The deltoid Schwarz reflection σ (CPU + GPU), its deleted correspondence (branch engine + orbit trees + density render), a family parameter plane, a parabolic-Tricorn model space, and an interactive **mating visualizer** | Vite + TypeScript       |

The Correspondences tool was the **forcing function** for the whole suite: its
requirements deliberately drove which shared packages got extracted, and in what order.
See [docs/VISION.md](docs/VISION.md) for why that ordering was intentional rather than
incidental.

---

## Status

**Built.** The phased migration ([docs/MIGRATION.md](docs/MIGRATION.md), Phases 0–6) is
**fully executed and merged.** The workspace skeleton, unified tooling, the
Quadrature-app-onto-Vite ESM-ification, and the five shared-package extractions
(`@cas/core` → `@cas/interchange` → `@cas/expr` + `@cas/gpu`) are all done; the
Correspondences app exists through its parameter-space milestone plus a complete
interactive mating visualizer. The whole workspace is green (**1820 Vitest tests** across 193
files, lint, typecheck, and per-app builds).

What's **deferred / exploratory** (by design, not omission):

- **Branch continuation through cusps** in the correspondence engine is uncertified and
  labeled `≈` — the analytic tools behind it (straightening, David surgery) are not
  automatable to proof level ([RISKS §3](docs/RISKS.md#3-the-three-genuinely-hard-parts)).
- **Further correspondence families** (circle-and-cardioid → cubic Chebyshev → general
  `d:d`) beyond the deltoid.
- **QD Schwarz df64 deep-zoom** (the df64 substrate exists in `@cas/gpu`; wiring it into
  the Quadrature app's Schwarz renderer is not yet done).
- The **`ui` / `quadrature` / `dynamics`** packages sketched in
  [ARCHITECTURE.md](docs/ARCHITECTURE.md) were **never extracted** — no second consumer
  ever needed them, which is exactly what [ADR-0007](docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)
  prescribes. The Correspondences app kept its σ-construction and Tricorn model local.

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
> and tests consume the packages' **built `dist/`**, so a package change is picked up only
> after its build runs (the root scripts handle this for you).

Each app is an independent static Vite build (`base: "./"`), so its assets resolve from any path.
`.github/workflows/deploy-pages.yml` publishes on every push to `master`, gated on
lint + typecheck + test: one combined Pages site with the launcher at the root and
`complex-dynamics/` + `quadrature-domains/` beneath it. Correspondences is built but not yet
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
│   ├── core/                 ← @cas/core        complex arithmetic, the ComplexAlgebra contract, Durand–Kerner, series-multiply
│   ├── gpu/                  ← @cas/gpu         WebGL2 substrate: shader compile/link, df64 deep-zoom, complex-GLSL
│   ├── expr/                 ← @cas/expr        one AST → GLSL shader body + JS evaluator (dual-backend)
│   ├── interchange/          ← @cas/interchange typed hand-off schema (envelope + MapSpec/SchwarzReflection) + deep-link codec
│   └── exact/                ← @cas/exact       exact polynomial arithmetic (CD + Correspondences)
└── apps/                     ← thin applications; each a Vite build that consumes packages
    ├── launcher/             ← the unified menu: a static landing page linking to each app
    ├── complex-dynamics/
    ├── quadrature-domains/
    └── correspondences/      ← the Phase-6 tool (dynamical views + the mating explorer)
```

> **The five packages that exist** are `@cas/core`, `@cas/gpu`, `@cas/expr`,
> `@cas/interchange`, and `@cas/exact`. Packages were extracted **only as a second consumer
> proved it needed them** ([ADR-0007](docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)) —
> which is why the `ui`, `quadrature`, and `dynamics` packages that
> [ARCHITECTURE.md](docs/ARCHITECTURE.md) sketches as a target never materialized, and why
> `@cas/exact` appeared *later* than the phase plan: it waited for its second consumer.

> **Unified menu, not a unified shell.** The suite ships **separate apps that hand off to
> each other**, fronted by a lightweight **launcher** (`apps/launcher`) — deliberately
> _not_ a single-page shell with a tab per tool. See
> [ARCHITECTURE §11](docs/ARCHITECTURE.md#11-the-launcher-unified-menu-without-a-unified-shell).

Each package and each app carries its own `README.md` with its API surface / feature list.

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
   (ADR-0001…0007): one decision each, with context, alternatives, trade-offs, and
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
