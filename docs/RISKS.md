# Risks, Guardrails & Open Questions

> **✅ Post-build note.** The suite is built. The phase-gated risks below were navigated, and
> the [Open questions](#open-questions-decisions-needed-from-you) are all **resolved** (that
> section now records the decisions). This stays the standing register: the honest-labeling
> discipline and the convention-collision guard are permanent, and the correspondence tool's
> genuinely hard math ([§3–4](#3-the-three-genuinely-hard-parts)) is exactly what the suite did
> *not* make easier — branch continuation through cusps remains exploratory and uncertified.

The last two sections — [Open questions](#open-questions-decisions-needed-from-you) and
[What you might be missing](#what-you-might-be-missing) — are the ones to read before
you start. The rest is the standing risk register and the hard-parts detail referenced
throughout the other docs.

## 1. Risk register

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Scope creep → "rewrite everything" → never ships** | High | Med-High | Working software at every phase gate; explicit "stop here" checkpoints; permission to leave app glue untyped; time-box each phase ([§5](#5-solo-developer-guardrails)) |
| **Convention collision** (factor-of-π/2πi silent error) | High | Med | Convention-neutral core; convert at edges; tag conventions in interchange; a test forbidding normalization constants in `core` ([below](#risk-convention-collision-silent-numerical-error)) |
| **Premature abstraction** (wrong seams baked in) | Med | Med | Extract only when a *second consumer* needs it; let the correspondence tool pull seams ([ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)) |
| **Performance regression** from extracting hot paths | Med | Med | Benchmark CPU orbit path before/after; GPU path unaffected ([Hard part 3](#hard-part-3-performance-regression-from-abstraction)) |
| **Dual-backend GLSL/JS drift** in `expr` | Med | Med-High | Property tests: GLSL ≈ JS on random inputs; now a suite-wide invariant ([Hard part 2](#hard-part-2-the-dualbackend-glsljs-sync-invariant-at-suite-scale)) |
| **ESM-ification subtly breaks QD** | Med | Med | Cluster-by-cluster with tests green each step; app keeps running ([Hard part 1](#hard-part-1-esm-ification-is-the-real-cost)) |
| **Share-link / URL-state backward-compat break** | Med | Med | Preserve or migrate each app's existing link format; verify formats before unifying |
| **Shared fix silently breaks the other consumer** | Med | Med | Ship packages *with* a golden-value corpus representing both apps' needs |
| **Losing QD's offline/no-build virtues** | Low | Low | `vite-plugin-pwa` restores offline + cache-busting; `base:"./"` keeps Pages deploy |
| **Deep-zoom expectation mismatch** (perturbation ≠ general) | Low | Med | df64 generalizes; perturbation is polynomial-specific — set expectations, keep it CD-internal |

## 2. The correctness landmine, elevated

### Risk: convention collision (silent numerical error)

This is the risk most worth naming loudly, because its failure mode is the worst kind
for a research tool: **a plausible-looking but wrong figure, with no error signal.**

The Quadrature app deliberately uses non-standard conventions — normalized area
(`dA = dx dy/π`, so the unit disk has area 1) and `1/(2πi)`-suppressed contour integrals.
The Dynamics app uses standard conventions. If shared code mixes them, an area comes out
`π×` wrong, or a contour integral `2πi×` wrong, and nothing crashes.

**Mitigations (all three, defense in depth):**
1. **`@cas/core` is convention-free** — a CI test (`packages/core/test/convention-neutral.test.ts`) asserts no
   `π`/`2πi` normalization constants live there ([ADR-0006](DECISIONS.md#adr-0006-convention-neutral-core-packages)).
   The scan is scoped to `@cas/core`; `@cas/expr`/`@cas/gpu` legitimately carry geometric/trig `π` (user
   formulas, shader math) and are not in scope.
2. Conversions happen at **app/domain edges**, in one place per app.
3. The `interchange` format is **canonical (standard) and convention-tagged**, so a
   mis-conversion at a hand-off boundary is loud, not silent ([INTERCHANGE §3](INTERCHANGE.md#3-numbers-maps-and-conventions)).

## 3. The three genuinely hard parts

These are the parts that will actually take real effort. None is a reason not to
proceed; all are reasons to sequence carefully and not underestimate.

### Hard part 1: ESM-ification is the real cost

The bulk of the Quadrature migration (Phase 2) is **not** adding type annotations — it
is converting the app's `QD.*` global namespace, `QD_UI.installX(ctx)` factory modules,
and script-load-order dependencies into explicit `import`/`export`. This is pervasive
and mechanical. The consolations: it is *exactly* what has to happen for any of that
code to be importable/shareable (so it is not wasted), and it *replaces* two hand-rolled
systems with first-class ones (the runtime-Blob Web Worker bundling becomes Vite module
workers; the manual `version:sync` cache-buster becomes `vite-plugin-pwa`). You are
deleting fragile bespoke infrastructure, not merely reformatting. Do it cluster by
cluster with the test suite green at each step.

### Hard part 2: the dualbackend GLSL/JS sync invariant at suite scale

`expr`'s power is that one AST emits **both** a GLSL shader body and a JS evaluator. The
Dynamics app already flags "keeping the GLSL/JS backends in sync" as a gotcha. As `expr`
becomes a **shared** package used by three tools — and especially as it grows
**multivalued/branch-aware** support for the correspondence tool, where *branch
selection* must agree between GPU and CPU — this invariant gets harder and more
important. Mitigation: **property tests** that evaluate random inputs on both backends
and assert agreement within tolerance, run in CI. Treat GLSL≈JS as a tested contract,
never an assumption.

### Hard part 3: performance regression from abstraction

Extracting the complex-arithmetic hot path into a package with a clean interface can
introduce overhead (call boundaries, object allocation) versus inlined code. This does
**not** matter for GPU code (it is GLSL), but it can matter for the CPU orbit/evaluator
paths, which both tools care about (real-time interaction, deep zoom). Mitigation:
benchmark the CPU orbit path **before and after** the `core` extraction (Phase 3); if
there is a regression, either inline the hottest primitives or accept it consciously.
Do not discover this after the fact.

## 4. Anti-holomorphic subtleties the existing code will hit

Specific to the correspondence tool (carried forward from the feasibility analysis).
These are *mathematical* subtleties the reused code will encounter:

- **Parameter dependence is only real-analytic, not holomorphic.** Anti-holomorphic
  families sit as the real slice `{a = b̄}` of biquadratic families. So the Dynamics
  app's holomorphic-only combinatorial machinery — Böttcher **parameter** rays, Farey
  labels, laminations, Yoccoz puzzles, the Thurston-pullback mating engine — does **not**
  port to the Tricorn verbatim; it needs genuine reformulation, not copy-paste. The
  `f`-agnostic paths (escape time, sphere, projections, the Benettin Lyapunov estimate)
  *do* carry over.
- **Branch management near cusps and parabolic points is the crux** of the
  correspondence engine. `core`'s formal-series arithmetic and the Quadrature app's
  near-cusp conditioning give a head start, but this is where most of the engine effort
  goes.
- **Discontinuity of straightening on odd-period parabolic arcs is a theorem**, not a
  numerical artifact (it is the subject of Mukherjee's thesis; flagged for the cubic
  Chebyshev "Family S" in the LLMM work). Represent model-space (parabolic-Tricorn)
  labels **separately** from raw parameters and **flag** arc crossings; do not render a
  false continuous straightening.
- **David surgery — the analytic engine behind the realization theorems — is not
  numerically automatable to proof level.** Any straightening/surgery output is
  exploratory. Keep the honest `= / ≤ / ≈` labeling so nothing reads as certified.
- **The Dynamics app's "teardrop Schwarz" / "exp Schwarz" presets are decorative
  misnomers** (its README says so) — *not* Schwarz-reflection dynamics. The real
  Schwarz-reflection machinery lives in the Quadrature app. Do not conflate them when
  wiring the correspondence tool.

## 5. Solo-developer guardrails

- **Working software at every step.** Never enter a multi-week "everything half-migrated"
  state. Each phase gate is a shippable point.
- **You are allowed to stop short of fully typing the Quadrature app.** Be strict on the
  shared packages (they are the contract); leave app-internal UI glue gradually-typed
  (`allowJs`, even `// @ts-nocheck`) indefinitely. Chasing 100% typing is a good way to
  burn weeks for little marginal safety.
- **Extract on evidence.** A primitive becomes a package when a *second* consumer needs
  it — not before.
- **One dependency direction.** Packages import downward only; apps import packages; no
  app imports an app; no cycles. Enforced with ESLint `no-restricted-imports` (a
  `dependency-cruiser` check is a planned follow-on, not yet wired).
- **Test-guard everything.** Consolidate on Vitest early; module never moves without its
  tests green before and after; shared packages ship with golden corpora.
- **Don't migrate all five tools at once.** Fold in the argument-principle applet, Arnold
  tongues, and the Zipper mapper opportunistically, after the first three are solid.
- **Time-box.** If a phase runs long, ship it at its current gate and continue later; the
  gates are designed so partial progress is still a working suite.

## Open questions (decisions needed from you)

> **RESOLVED (this session).** All of the questions below have been decided; they are
> retained as the record and rationale. The authoritative summary for the build agent is
> in [`CLAUDE.md`](../CLAUDE.md). The locked answers:
>
> 1. **Name:** repo `complex-analysis-suite`, scope `@cas/*`.
> 2. **Git history:** preserved via `git subtree` (Phase 0).
> 3. **Topology:** separate apps + a **unified menu** (launcher + shared nav); no unified
>    single-page shell — see [ARCHITECTURE §11](ARCHITECTURE.md#11-the-launcher-unified-menu-without-a-unified-shell).
> 4. **Correspondence tool:** a **separate** app (`apps/correspondences`).
> 5. **Package manager:** **pnpm** ([ADR-0004](DECISIONS.md#adr-0004-package-manager-pnpm-workspaces)).
> 6. **Correspondence degree:** **quadratic-first** (deltoid + circle-and-cardioid) as
>    proof-of-concept and ground truth; general `d:d` later.
> 7. **First goal:** reproduce the **deltoid** (known ground truth) before new families.
> 8. **Node:** pin **Node 22 LTS** (current LTS; also what Claude Code's npm install
>    wants — supersedes the "20" mentioned elsewhere in these docs).
> 9. **Deployment:** each app on **GitHub Pages, independently**; launcher at the top-level
>    Pages URL.
> 10. **Next step:** scaffold Phases 0–1 + the first `@cas/core` extraction in **Claude
>     Code** against the real repos.

The original framing (kept for the record): these were the choices to confirm; the plan
encoded a recommended answer for each, now ratified above.

1. **Repo & package-scope name.** Placeholders `complex-analysis-suite` / `@cas/*` are
   used throughout. Do you have a real name in mind? (Renaming a scope later is a
   mechanical find-replace, so this is low-stakes — but naming it now avoids churn.)
2. **Git history preservation.** The plan recommends `git subtree` to bring both apps in
   **with history preserved**. Confirm — or do you prefer a clean copy (simpler, but
   loses per-file provenance)?
3. **Separate apps + interop, or an eventual unified shell?** The plan's default is
   *separate apps that link to and hand off to each other* (your "pass off to each other"
   example fits this without one big app). A single unified shell is a heavier, later
   decision. Is separate-apps-with-links the right default? **(This is the one I'd most
   like you to confirm — see blind spot #1 below.)**
4. **Correspondence tool: separate app or a mode inside the Quadrature app?** Default:
   separate `apps/correspondences` depending on the `quadrature` package (keeps the
   "thin apps over shared packages" shape). A mode inside QD reuses its UI but couples it.
5. **Package manager.** The plan chose **pnpm** ([ADR-0004](DECISIONS.md#adr-0004-package-manager-pnpm-workspaces)) for its strictness (which enforces the layering rule) and speed. Both apps use npm today. Confirm pnpm, or prefer npm workspaces (least change)?
6. **Correspondence degree scope.** Start **quadratic-only** (deltoid + circle-and-cardioid, matching LLMM 2021/2023), or architect for general `d:d` (Mating I/II, and your Algebraic-QD direction) from the outset? This changes how the branch-enumeration is written.
7. **First correspondence goal.** Reproduce *known* pictures first (deltoid — essentially already reachable), or push toward *new* families (your algebraic QDs / Shabat slices)? The plan assumes deltoid-first as validation.
8. **Node version pin.** **RESOLVED → Node 22 LTS** (`.nvmrc` = `22`, `engines.node >= 22`, both workflows on `node-version: 22`; locked decision 10 supersedes the earlier Node 20 baseline).
9. **Deployment.** Keep both apps on **GitHub Pages, deployed independently** from the monorepo? (No single suite version.) Confirm.
10. **What do you want next from me?** (a) I write nothing more and you execute this plan;
    (b) you move into **Claude Code** on the repos and I scaffold Phase 0 + the first
    `core` extraction against the real files; or (c) I expand a specific doc (e.g. a
    literal Phase-0 command script, or the `expr` multivalued design) in more depth here.

## What you might be missing

Beyond the risks above, these are conceptual/big-picture points that are easy to
overlook and worth deciding deliberately:

1. **"Pass off to each other" ≠ "one application."** It is worth being explicit with
   yourself about which you want, because they are very different in cost. *Hand-off
   between separate apps* (export a Schwarz reflection from QD, open it in CD via
   interchange + a deep link) is cheap and is what this plan builds. *One unified
   application* with every tool as a tab is a much heavier product with its own
   navigation/state/shell problems. The plan assumes the former; if you actually want the
   latter, that changes the architecture materially. (Open question #3.)

2. **"Pull in both apps in current form" is a *starting state*, not the sharing goal.**
   Getting them coexisting (Phase 0) is easy; but the Quadrature app cannot *share* code
   until it is ESM-ified onto the build (Phase 2), because a no-build app can only consume
   pre-built artifacts. So "current form" buys coexistence and provenance, not yet reuse —
   and the ESM-ification (Hard part 1) is the gate to actual sharing. Sequence your
   expectations accordingly.

3. **The suite makes the *plumbing* cheap, not the *mathematics*.** The correspondence
   tool's genuine difficulty — branch management near cusps/parabolics, the real-analytic
   parameter dependence, the theorem-level discontinuity of straightening, the
   non-automatable David surgery — is unaffected by how well-factored the code is. The
   suite means you won't *reimplement* escape-time/GPU/root-finding; it does **not** mean
   the hard math gets easier. Guard against a false "the refactor will make this easy"
   expectation.

4. **Shared code is only safe with shared *tests*.** The payoff of a `core` package is
   "fix a bug once" — but that is only true if `core` carries a golden-value corpus
   representing *both* apps' needs. Without it, a well-meant change for one tool silently
   breaks the other. Budget the test consolidation as part of each extraction, not as an
   afterthought.

5. **Share-link backward-compatibility is a real constraint for a researcher.** You (and
   possibly a paper, talk, or notebook) may already have saved deep links / views in each
   app's *current* URL format. Unifying the share-link codec (Phase 4) can break those
   unless you preserve or migrate the old formats. Decide whether old links must keep
   working before you touch that code.

6. **A coherent citation/attribution story for the suite.** Both apps are MIT and both
   cite the thesis. As a suite they should have one clear attribution story — e.g. a
   root `CITATION.cff`, and a decision about whether the suite is cited as a whole or each
   tool individually. Minor, but worth setting up once rather than accreting inconsistently.

7. **Documentation drift is the quiet killer of a solo multi-tool project.** This plan is
   only useful if it stays alive: update the owning doc when a decision changes, and
   **supersede** ADRs rather than rewriting them. Your Quadrature repo already has a strong
   docs culture (`ARCHITECTURE.md`, `THEORY_MAP.md`, `CONTRIBUTING.md`, `HANDOFF.md`,
   per-module READMEs) — the suite should *inherit and extend* that culture, not fragment it.

8. **The Algebraic-QD synergy is a strategic opportunity, not just a deferral.** Your
   Quadrature app has Algebraic QD support (weight `|R'|²`, thesis Chapter VI) parked in
   `app/disabled/aqd/`. The frontier of the correspondence field — the Lyubich–Mazor–
   Mukherjee realization theorems and the *Mating II* Shabat-polynomial families — is
   precisely about **higher-degree correspondences from general rational/Shabat
   uniformizers**, which is the AQD direction. "Finish AQD" and "build general-degree
   correspondences" are the *same* arc (both want general rational `φ`). If you go for
   general `d:d` (open question #6), sequence these together rather than treating them as
   unrelated.

9. **Visual-regression testing is probably missing from both apps.** Unit tests guard the
   numerics, but the *renderers* (the actual pictures) can regress silently under a
   refactor. A pixel-diff harness over a fixed set of views is worth adding as the suite
   forms — named in [ARCHITECTURE §9](ARCHITECTURE.md#9-testing-architecture) and
   [MIGRATION Ongoing](MIGRATION.md#ongoing--later-not-gating) so it has a home.

10. **Future-you is the real beneficiary of the discipline.** Every guardrail here
    (working-software-per-phase, ADRs, the dependency rule, honest labeling) compounds
    into "I can put this down for three months and pick it back up." For a solo project
    that is not overhead — it is the single biggest determinant of whether the suite
    actually reaches four and five tools.
