# complex-analysis-suite

> **Name.** The repository is **`complex-analysis-suite`**. Its packages use the
> internal workspace scope **`@cas/*`** (short for complex-analysis-suite; not published
> to npm — `workspace:*` only). The scope is an ergonomic alias and is trivially
> renameable to `@complex-analysis-suite/*` if you prefer the full form.

A monorepo housing a growing **suite of complex-analysis and complex-dynamics
visualization tools** that share common underlying packages and can hand data off
to one another. The organizing goal: **each new tool added to the suite should
require building fewer primitives from scratch than the last.**

The suite currently unifies two mature, independently-developed applications:

| App | What it does | Current stack |
|---|---|---|
| **Complex Dynamics** (`apps/complex-dynamics`) | GPU escape-time visualizer for parametrized families `f(z,c)` — Mandelbrot/multibrot, Julia sets, Tricorn/multicorn, rational & transcendental maps, Böttcher coordinates, external rays, holomorphic matings, deep zoom | Vite + TypeScript |
| **Quadrature Domains** (`apps/quadrature-domains`) | Solver + visualizer for (log-weighted) quadrature domains in both the inverse and direct directions, plus **single-valued Schwarz-reflection dynamics**, limit sets, Riemann-sphere view, and a parameter-slice sweep engine | Vanilla JS (no build) |

The near-term forcing function for the suite is a **third** application — an
**anti-holomorphic correspondences / Schwarz-reflection mating** tool — whose
requirements deliberately drive which shared packages get extracted first. See
[docs/VISION.md](docs/VISION.md) for why this ordering is intentional rather than incidental.

---

## Status

**Planning.** This repository currently contains the *plan*: an architecture and a
phased migration runbook. No code has been merged yet. The plan is written to be
executed incrementally, with a working suite at the end of **every** phase — there
is no "big-bang rewrite" step, by design.

Start here → [docs/MIGRATION.md](docs/MIGRATION.md), Phase 0.

---

## Documentation map

Read in roughly this order:

1. **[docs/VISION.md](docs/VISION.md)** — The long-term goal, guiding principles,
   non-goals, and the strategic reasoning (why a monorepo, why the correspondence
   tool drives the extraction order, what "done" looks like). Start here for the *why*.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — The target architecture: the
   `packages/` + `apps/` layout, the dependency-layering rule, what each package
   owns, the convention-neutrality principle, and the `expr` + `interchange`
   keystone. The *where we're going*.
3. **[docs/DECISIONS.md](docs/DECISIONS.md)** — The Architecture Decision Records
   (ADR-0001…0007). Each captures one decision with its context, the alternatives
   considered, the trade-offs, and the consequences. The *why each choice*.
4. **[docs/MIGRATION.md](docs/MIGRATION.md)** — The step-by-step runbook: Phases 0–6
   with concrete commands, verification gates, and rollback notes. The *how, exactly*.
5. **[docs/INTERCHANGE.md](docs/INTERCHANGE.md)** — The hand-off data contract: the
   TypeScript schema the apps use to pass objects (e.g. a Schwarz reflection) to each
   other, the deep-link codec, and schema versioning. The keystone spec.
6. **[docs/RISKS.md](docs/RISKS.md)** — The risk register, the three genuinely hard
   parts, solo-developer guardrails, the **open questions I need you to decide**, and
   **"what you might be missing."** Read the last two sections before you start.

> **Convention:** documents *link* rather than duplicate. If a fact lives in one doc,
> the others reference it. When a decision changes, update the owning doc (and, for
> architectural decisions, add or supersede an ADR — never silently rewrite history).

---

## Quick start (once Phase 0 lands)

```bash
# prerequisites: Node 20+ (see .nvmrc) and pnpm 9+ (see ADR-0004)
corepack enable            # provides pnpm at the pinned version
pnpm install               # installs the whole workspace

pnpm --filter complex-dynamics dev      # start the CD dev server
pnpm --filter quadrature-domains dev    # start the QD dev server

pnpm test                  # run every package's + app's test suite (Vitest)
pnpm lint                  # ESLint across the workspace
pnpm typecheck             # tsc --noEmit across the workspace
pnpm build                 # production build of every app into its dist/
```

During the transition (Phase 0–2), the Quadrature Domains app may still run through
its own legacy static-server path in parallel; see
[docs/MIGRATION.md](docs/MIGRATION.md#phase-2--quadrature-domains-onto-vite-still-all-javascript).

---

## Repository layout (target)

```
complex-analysis-suite/
├── README.md                 ← you are here
├── docs/                     ← the plan (this set of documents)
├── packages/                 ← shared, versioned libraries (the reuse surface)
│   ├── core/                 ← complex numbers, formal series, polynomials, root-finding
│   ├── gpu/                  ← WebGL2 escape-time substrate, df64 deep zoom, sphere/projection
│   ├── expr/                 ← expression compiler: one AST → GLSL + JS evaluator
│   ├── interchange/          ← typed hand-off schemas + deep-link codec
│   ├── ui/                   ← shared UI kit (KaTeX helpers, inspector cards, share-links…)
│   ├── quadrature/           ← (domain) Faber transform, QD/LQD solvers, Schwarz reflection
│   └── dynamics/             ← (domain) escape-time / Böttcher / external rays / classification
└── apps/                     ← thin applications; each is a Vite build that consumes packages
    ├── launcher/             ← the unified menu: a small landing page linking to each app
    ├── complex-dynamics/
    ├── quadrature-domains/
    └── correspondences/      ← the new tool (Phase 6)
```

> **Unified menu.** The suite ships **separate apps that hand off to each other**, with a
> lightweight **launcher** (`apps/launcher`) that lets you pick which app to open, plus
> (later) a shared navigation header so each app can jump to the others. This is
> deliberately *not* a single unified single-page shell — see
> [ARCHITECTURE §Launcher](docs/ARCHITECTURE.md#11-the-launcher-unified-menu-without-a-unified-shell).

Not every package on this list exists from day one. Packages are extracted **as the
apps prove they are needed** — see [ADR-0007](docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)
and the [migration runbook](docs/MIGRATION.md).

---

## License & provenance

Both source applications are MIT-licensed (Andrew Graven). The suite is MIT.
The two apps are being brought in **with their git history preserved** (see
[docs/MIGRATION.md, Phase 0](docs/MIGRATION.md#phase-0--genesis-the-workspace-skeleton))
so authorship and provenance survive the merge.
