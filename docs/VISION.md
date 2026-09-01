# Vision & Scope

> **✅ Realized.** This document is the *why*, written before the build and kept as the durable
> rationale. The plan it motivates has since been executed: ten apps now ride twelve shared
> `@cas/*` packages, the QD → CD Schwarz-reflection hand-off round-trips, and the correspondence
> tool reproduced the deltoid and grew a full mating visualizer — every item in
> [§6 "What success looks like"](#6-what-success-looks-like) now holds. The framing below is
> unchanged; see the root [README](../README.md) and [MIGRATION](MIGRATION.md) for current status.

## 1. The goal, stated precisely

Build a **suite of complex-analysis and complex-dynamics tools** that share a common
foundation, with one measurable property as the north star:

> **Each new tool added to the suite requires building fewer primitives from scratch
> than the previous one.**

Two capabilities make that property real, and they are *separable* — a point that
matters throughout this plan because they have very different costs:

1. **Shared foundation.** The hard, reusable machinery — complex arithmetic, formal
   power/Laurent series, polynomial and rational algebra, root-finding, the WebGL
   escape-time substrate, the expression compiler — lives in versioned packages that
   every app imports. Fixing a bug or adding a capability happens *once*.
2. **Interoperability / hand-off.** Tools pass structured objects to one another and
   "pass off" a computation when another tool is the right home for it. The concrete
   motivating example: **compute a Schwarz reflection map in the Quadrature Domains
   tool, then open it in the Complex Dynamics tool** to study its iteration with that
   tool's Böttcher / ray / deep-zoom machinery.

These are different problems. Interop is a *data-contract* problem: two programs can
hand off perfectly while sharing zero code, if they agree on a format. Sharing is a
*code-consolidation* problem, where most of the cost and risk live. We pursue both,
but we **front-load the cheap one (interop) and pace the expensive one (sharing)** by
actual need — see [§5](#5-the-strategic-thesis) and [ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need).

## 2. Why a monorepo, and why now

The two apps already share, informally, a large amount of *conceptual* surface —
complex arithmetic, Durand–Kerner root-finding (present in **both** apps, in fact in
several places), formal-series recurrences (Faber transforms in one, Böttcher
coefficients in the other), WebGL escape-time kernels, Riemann-sphere renderers.
Today those overlaps are **duplicated and drifting**: two complex libraries, two
root-finders, two sphere renderers, each maintained separately.

A monorepo with shared packages converts that duplication into a single source of
truth, and — just as importantly — lets each tool *borrow the other's specialties*.
The Complex Dynamics tool has df64 deep zoom and a superb expression compiler that
the Quadrature tool lacks; the Quadrature tool has Faber/quadrature machinery and
near-cusp conditioning that the Dynamics tool lacks. A suite lets each expose the
other's strengths. (See [ADR-0001](DECISIONS.md#adr-0001-monorepo-over-multi-repo) for the monorepo-vs-multirepo analysis.)

"Now" is the right time because a **third tool is imminent** (see §3), and building it
*inside* the shared structure is far cheaper than building it standalone and merging
later. The third tool is the forcing function that keeps this from being abstraction
for its own sake.

## 3. The correspondence tool as the forcing function

The near-term driver is an **anti-holomorphic correspondences / Schwarz-reflection
mating** tool, motivated by the Lee–Lyubich–Makarov–Mukherjee and
Lyubich–Mazor–Mukherjee program (and directly adjacent to the thesis work underlying
the Quadrature Domains app). Its feasibility was assessed in the research phase that
preceded this repo; the conclusion was that it should be built by **extending the
existing tools, not from scratch**, because they already contain most of what it needs.

Crucially, its requirements map cleanly onto the shared foundation:

| The correspondence tool needs… | …which already lives in |
|---|---|
| Complex arithmetic, polynomial root-finding (branch enumeration), formal-series local charts | Quadrature tool (`complex.js`, `taylor.js`, Durand–Kerner) |
| Single-valued Schwarz-reflection construction `σ = f∘η∘f⁻¹` | Quadrature tool (`QD.Schwarz`) |
| GPU escape-time rendering, deep zoom, sphere/projection views | Complex Dynamics tool |
| An expression language that compiles to GLSL **and** JS | Complex Dynamics tool (`src/expr`) |
| A parabolic-Tricorn model space to straighten against | Complex Dynamics tool (renders it already) |
| A parameter-space sweep + classify + adaptive-quadtree engine | Quadrature tool (`param-slice`) |

So the correspondence tool is not a reason to *invent* infrastructure; it is a reason
to **extract and share** the infrastructure that already exists in two places. This is
why the extraction order in the migration runbook is driven by the correspondence
tool's needs rather than by tidiness: we extract the packages that unblock it, in the
order it needs them. The single genuinely *new* work it requires — multivalued,
branch-aware iteration — is isolated and additive.

There is also a satisfying staging: the **single-valued** Schwarz reflection can be
handed off to the Complex Dynamics tool using the expression compiler **as it exists
today**, needing no new mathematics. The **multivalued** correspondence is the same
hand-off, extended. That gives an early, motivating win (hand-off of `σ`) well before
the hard math lands.

## 4. Guiding principles

1. **Working software at every step.** No phase leaves the suite broken. Each phase
   in the [migration runbook](MIGRATION.md) ends at a state you could ship. This is
   the single most important principle for a solo project, where a multi-week
   "everything is half-migrated" state is how momentum dies.
2. **Extract on evidence, not on speculation.** A primitive becomes a shared package
   when a *second* consumer actually needs it — not because it might be reused someday.
   Premature abstraction on a large, mature codebase bakes in the wrong seams.
   ([ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need).)
3. **Types are the contract.** TypeScript interfaces are how tools agree on hand-off
   formats and how shared packages guarantee their consumers agree with them. The
   suite's common language is TypeScript. ([ADR-0002](DECISIONS.md#adr-0002-typescript-as-the-common-language).)
4. **Core packages are convention-neutral.** Mathematical conventions (area
   normalization, contour-integral factors, escape predicates, parameter-space
   classifiers) live in the *app/domain* layer. Shared numeric packages must be
   free of them, or a change in one app silently corrupts another.
   ([ADR-0006](DECISIONS.md#adr-0006-convention-neutral-core-packages); this is a *correctness* concern, not a style one — see [RISKS §2](RISKS.md#risk-convention-collision-silent-numerical-error).)
5. **One dependency direction.** Packages import only from lower packages; apps import
   packages; no app imports another app; no cycles. This one rule is what makes "each
   new tool builds fewer libraries" actually hold over time.
6. **Test-guarded refactoring.** Both apps have real test suites. Consolidate them
   early onto one runner, and never move a module without its tests green before and
   after. Shared packages ship *with* consolidated golden-value tests so a fix in one
   place cannot silently break a consumer.
7. **Honest labeling of results.** Both apps already distinguish exact (`=`), rigorous
   bound (`≤`), and estimate (`≈`). The suite keeps this discipline everywhere,
   especially for the correspondence tool's straightening/surgery outputs, which are
   *exploratory* and must never read as certified. (The underlying analytic tools —
   David surgery, straightening — are not automatable to proof level; see [RISKS §3](RISKS.md#3-the-three-genuinely-hard-parts).)
8. **Documentation as durable memory.** For a solo project, the ADRs and this doc set
   *are* the mitigation for "why did I do this?" six months later. Keep them current;
   supersede rather than delete.

## 5. The strategic thesis

Do the **cheap, high-value infrastructure first**; **parallelize the expensive
infrastructure with the research**; **let the new tool's needs drive extraction**.

Concretely, this rejects two tempting extremes:

- **"Migrate everything first, then build the tool."** Cleanest foundation, but weeks
  of infrastructure during which no new *mathematics* ships — a real morale/momentum
  cost for a solo researcher, and it front-loads speculative abstraction.
- **"Build the tool in the current codebase, migrate later."** Fastest first result,
  but you build on a foundation you're about to replace and end up migrating the new
  tool's code too.

The chosen middle path (formalized in [ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)):
front-load only the *cheap* infrastructure that unblocks sharing (the workspace
skeleton, unified tooling, and getting the Quadrature app onto the shared build while
still all-JavaScript). Then build the correspondence tool **in parallel** with the
more expensive extraction (full TypeScript-ification of app internals, the GPU-core
extraction), so the tool's real requirements pull exactly the packages that prove
necessary.

## 6. What success looks like

- A single `pnpm install` at the root sets up everything; `pnpm test` / `pnpm build`
  operate over the whole workspace.
- The Complex Dynamics and Quadrature Domains apps both build through the same
  toolchain and both consume at least the shared `core` package.
- You can export a Schwarz reflection from the Quadrature app and open it in the
  Complex Dynamics app via a shared, versioned interchange format (and a deep link).
- The correspondence tool exists as a third app that reused the shared packages
  rather than reimplementing them, and its first milestone — reproducing a known
  dynamical picture (the deltoid Schwarz reflection) — validates the pipeline
  end-to-end.
- Adding a *fourth* tool (the argument-principle applet, Arnold tongues, or the Zipper
  conformal mapper — all genuinely complex-analysis visualizers) is visibly cheaper
  than the third was, because `core`, `gpu`, `expr`, `interchange`, `exact`, `schwarz`, `dynamics`,
  `export`, and `conformal` already exist.
  *(As built: `ui` was not extracted for a long time — no second consumer forced it. It was finally
  extracted as `@cas/ui`, the shared **browser shell** (canvas a11y, a fatal-error boundary, an
  off-thread compute client, a suite nav header), in [ADR-0032](DECISIONS.md#adr-0032-extract-casui-ahead-of-adoption-port-cds-product-shell)
  — an extract-*ahead*-of-adoption, since the demand was already proven across the apps by a UX review.
  See ADR-0007 and the "As built" note atop [ARCHITECTURE.md](ARCHITECTURE.md).)*

## 7. Non-goals (at least for now)

- **A single unified application *shell*.** **Decided:** the suite is *separate apps that
  hand off to each other*, fronted by a lightweight **unified menu** (a launcher page +,
  later, a shared navigation header) — **not** one single-page shell with a tab per tool
  that owns all cross-tool state and routing. The launcher gives the *experience* of a
  suite (one entry point, easy movement, hand-off) without the coupling of a merged
  application. A true unified shell remains out of scope; if ever wanted, it can be added
  later as another app that embeds the others. See
  [ARCHITECTURE §11](ARCHITECTURE.md#11-the-launcher-unified-menu-without-a-unified-shell).
- **Publishing packages to npm.** Internal `workspace:*` dependencies need no registry
  publishing. If a package later proves independently useful to others, publishing is
  a small additional step — not a goal now.
- **Proof-level automation.** The suite generates pictures, computes diagnostics, and
  suggests conjectures. It does not certify matings, local connectivity, conformal
  removability, or surgery existence. That boundary is permanent and is reflected in
  the honest-labeling principle.
- **Rewriting either app's mathematics.** Both apps are correct and mature. This is a
  *packaging and interoperability* effort, not a mathematical rewrite. The only new
  mathematics is in the correspondence tool.
- **Migrating all five tools at once.** The suite framing genuinely fits ≥5 tools, but
  the other three (argument principle, Arnold tongues, Zipper) are folded in
  *opportunistically*, after the first three are solid and the packages they'd reuse
  already exist.

## 8. A note on solo constraints

This is a solo project, which shapes several decisions:

- **Coordination overhead is nearly free** (one committer), which *lowers* the cost of
  a monorepo relative to a team. But **versioning/publishing overhead is pure tax** —
  hence `workspace:*` internal deps and no npm publishing.
- **Momentum is the scarce resource.** The plan is explicitly staged so that
  motivating wins (the `σ` hand-off; the deltoid reproduction) arrive early and often,
  and so that no phase requires a long "broken" interlude.
- **Future-you is the collaborator.** The doc set and ADRs exist so that returning to
  this after a break — or onboarding a future collaborator — is cheap. That is a
  first-class benefit, not overhead.
