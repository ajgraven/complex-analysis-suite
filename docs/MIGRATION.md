# Migration Runbook

This is the executable plan. It is organized into **phases**, each of which ends at a
**working suite** — there is no interlude where nothing runs. Phases 0–4 are strictly
sequential; **Phase 6 (build the correspondence tool) is expected to run in parallel
with the tail of Phase 5 and the ongoing TypeScript-ification**, per
[ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need).

> ## ✅ Status: executed
>
> **All phases (0–6) are complete and merged**, plus a follow-on interactive mating
> visualizer in the Correspondences app. The runbook below is retained as the record of *how*
> the suite was built; read it as history, not a to-do list. What shipped:
>
> | Phase | Outcome |
> |---|---|
> | **0 Genesis** | Workspace skeleton; both apps pulled in via `git subtree` (history preserved); launcher stub. |
> | **1 Tooling** | Shared `tsconfig.base` + ESLint/Prettier + dependency-boundary lint; unified on **Vitest**; CI. |
> | **2 QD→Vite** | Quadrature app ESM-ified onto Vite (native module workers, `vite-plugin-pwa`); still all-JS. |
> | **3 `@cas/core`** | Extracted the numeric kernel (complex, the `ComplexAlgebra` contract, Durand–Kerner, series-multiply); both apps consume it. *(Newton/deflation and mat4/camera were **not** extracted — no second consumer forced them; ADR-0007.)* |
> | **4 `@cas/interchange`** | Schema + validator + deep-link codec; the QD → CD Schwarz-reflection hand-off round-trips. |
> | **5 `@cas/expr` + `@cas/gpu`** | Promoted the expression compiler and extracted the df64/complex-GLSL + shader substrate; dual-backend GLSL≈JS proven; both apps adopt them. |
> | **6 `apps/correspondences`** | Deltoid σ (CPU+GPU), the deleted-correspondence engine (orbit trees + density), the family parameter plane, the parabolic-Tricorn model, and the mating explorer. |
>
> **Deferred / exploratory** (as the plan intended): branch continuation through cusps
> (uncertified, `≈`); further correspondence families beyond the deltoid; QD Schwarz df64
> deep-zoom; and the `ui` / `quadrature` / `dynamics` packages (never needed a second consumer).
> The three `⚠ verify` grounding caveats below were resolved during execution.

> **Grounding caveat.** This runbook is written from the two apps' READMEs and stated
> architecture, not from their live source. Commands and file paths are concrete so you
> can execute, but **verify against the actual repos** at the points flagged
> `⚠ verify`. The safest way to run this is with the source in front of you (e.g. inside
> Claude Code on the repos), where each step can be checked against real files.

> **Universal rollback.** Every phase is done on a branch and merged only at its
> verification gate. If a gate fails, the rollback is "don't merge the branch." Nothing
> below deletes the original repos; they remain as provenance and as an escape hatch.

**Legend:** each phase has **Goal**, **Steps**, a **Gate** ("stop here and the suite
still works if…"), and **Notes**.

---

## Phase 0 — Genesis: the workspace skeleton

**Goal.** A new repo containing both apps *in their current form*, building/running
side by side, with git history preserved. No sharing yet.

**Steps.**

1. **Create the repo and workspace root.**
   ```bash
   mkdir complex-analysis-suite && cd complex-analysis-suite
   git init
   corepack enable                     # provides pnpm (ADR-0004)
   pnpm init                           # root package.json (private, no version)
   ```
   Root `package.json`: set `"private": true`, `"packageManager": "pnpm@9.x"`,
   and `"engines": { "node": ">=22" }`. Add `.nvmrc` with `22`. *(Shipped as Node 22 LTS —
   [ADR/decision #10](../CLAUDE.md) supersedes the "20" this runbook originally planned.)*

2. **Declare the workspace.** Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - "packages/*"
     - "apps/*"
   ```

3. **Pull in both apps with history preserved.** Use `git subtree` so authorship and
   provenance survive the merge (⚠ this is the recommended approach — confirm you want
   history preserved; see [RISKS Open Questions](RISKS.md#open-questions-decisions-needed-from-you)):
   ```bash
   git remote add cd-src <url-or-path-to-ComplexDynamicsJS>
   git subtree add --prefix=apps/complex-dynamics cd-src main

   git remote add qd-src <url-or-path-to-QuadratureDomains>
   git subtree add --prefix=apps/quadrature-domains qd-src main
   ```
   The Quadrature app's `app/` directory becomes `apps/quadrature-domains/app/` for now;
   its own README, `ARCHITECTURE.md`, `THEORY_MAP.md`, `CONTRIBUTING.md`, and
   `HANDOFF.md` come along and are preserved.

4. **Rename each app's package** to a scoped, unversioned workspace package:
   `apps/complex-dynamics/package.json` → `"name": "complex-dynamics"`;
   `apps/quadrature-domains/package.json` → `"name": "quadrature-domains"` (⚠ the QD app
   may not currently *have* a `package.json` at the app root — its build scripts live at
   the QD repo root; create/relocate one so pnpm sees it as a workspace member).

5. **Install and smoke-test both apps unchanged.**
   ```bash
   pnpm install
   pnpm --filter complex-dynamics dev     # CD runs on Vite as before
   ```
   The Quadrature app still runs by its **own legacy path** for now (its static
   `http.server` script), invoked via a workspace script — it does *not* yet go through
   Vite. That is intentional; Phase 2 moves it.

**Gate.** Both apps launch and behave exactly as they did in their original repos; git
history for both is present (`git log --follow` on a file from each). Nothing is shared
yet, and that is correct for Phase 0.

**Notes.** This phase is the "pull in both apps in their current form" you asked for.
Resist the urge to change any app code here — Phase 0 is *only* about coexistence and
provenance.

---

## Phase 1 — Unify tooling and the test harness

**Goal.** One toolchain and one green/red signal across the repo, without changing app
behavior.

**Steps.**

1. **Shared TypeScript config.** Root `tsconfig.base.json` with `"strict": true`,
   `"moduleResolution": "bundler"`, `"target": "ES2022"`. Each app/package gets a
   `tsconfig.json` that `extends` it. The Quadrature app's tsconfig adds
   `"allowJs": true` (and, initially, `"checkJs": false`) so its JS compiles untyped.

2. **Shared lint/format.** One root ESLint flat config and Prettier config. Add a
   **dependency-boundary rule** now, even before packages exist, so it is in place when
   they do: use `eslint-plugin-import`/`eslint-plugin-boundaries` (or
   `dependency-cruiser` as a separate check) to encode the
   [dependency rule](ARCHITECTURE.md#4-the-dependency-rule) (apps→packages, downward
   only, no cycles).

3. **One test runner: Vitest.** The Dynamics app already uses Vitest. Port the
   Quadrature app's headless suite (`node-test.js` + `test/*.test.js`, which uses a `vm`
   bootstrap and shared harness) onto Vitest (⚠ verify the harness's globals-injection
   approach; it may map to Vitest `setupFiles` cleanly, or run initially as a separate
   `vitest`-invoked wrapper). Root scripts:
   ```jsonc
   // root package.json "scripts"
   "test": "vitest run",
   "test:watch": "vitest",
   "lint": "eslint .",
   "typecheck": "tsc -b --noEmit",   // ⚠ or per-project tsc invocations
   "build": "pnpm -r --filter './apps/*' build"
   ```

4. **CI shell.** One GitHub Actions workflow: `pnpm install` → `lint` → `typecheck` →
   `test` → `build`, on push and PR. (The Dynamics app already has CI; generalize it to
   the workspace.)

**Gate.** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` is green from the
repo root; both apps' original tests pass under the unified runner; CI is green.

**Notes.** No app logic changes in Phase 1. This is the safety net that makes every
later refactor test-guarded. Do not skip the boundary-lint setup — it is far cheaper to
adopt now than to retrofit after packages exist.

---

## Phase 2 — Quadrature Domains onto Vite (still all-JavaScript)

**Goal.** The Quadrature app builds and runs through Vite, still 100% JS. This is the
prerequisite for it consuming shared packages. **This is the largest single chunk of
mechanical work in the plan** — but it is a build-system + module-system change, not a
typing change, so the app keeps working and tests guard it. See
[RISKS Hard Part 1](RISKS.md#hard-part-1-esm-ification-is-the-real-cost).

**Steps.**

1. **Add a Vite app shell.** Create `apps/quadrature-domains/vite.config.js` with
   `base: "./"` (static/Pages-friendly, matching CD) and an `index.html` entry that
   loads the app as an ES module.

2. **ESM-ify the module system.** Convert the `QD.*` global namespace and the
   `QD_UI.installX(ctx)` factory modules (documented in the app's `ARCHITECTURE.md`)
   from script-load-order globals to explicit `import`/`export`. This is pervasive and
   the bulk of the phase. Do it module-cluster by module-cluster, keeping tests green at
   each step (⚠ the exact module graph must be read from the repo — the READMEs list
   files but not every dependency edge).

3. **Replace bespoke infra with Vite-native equivalents:**
   - Runtime-Blob Web Worker bundling → Vite module workers:
     `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`.
     (⚠ the QD solver and the `param-slice` pool both build workers from source at
     runtime — both convert to this pattern.)
   - Hand-rolled `version:sync` cache-buster + service worker → `vite-plugin-pwa`
     (gives offline caching and cache invalidation as a first-class plugin).

4. **Preserve static/offline deploy.** Confirm `pnpm --filter quadrature-domains build`
   emits a static `dist/` with relative paths that works from a Pages sub-path.

5. **Retire the legacy static-server path** once the Vite path is at parity (delete the
   `http.server` script and the manual worker/SW machinery).

**Gate.** `pnpm --filter quadrature-domains dev` and `... build` work; the built app is
byte-for-byte behavior-equivalent to the legacy build (spot-check the thesis-example
oracle panel, the Schwarz dynamics tab, the param-slice sweep, and a Web Worker solve);
all tests still green.

**Notes.** What you give up: `file://`-without-a-server dev. What you keep:
static/offline/Pages deploy (via `vite-plugin-pwa`). What you gain: HMR, and the ability
to `import` shared packages — which Phase 3 begins.

---

## Phase 3 — Extract `@cas/core`

**Goal.** The first real shared package: the pure numeric kernel, consumed by **both**
apps, replacing their duplicated copies. This is where "fix a bug once" begins.

**Steps.**

1. **Scaffold the package.** `packages/core/` with its own `package.json`
   (`"name": "@cas/core"`, `"type": "module"`), a `tsconfig.json` extending
   the base with `strict`, and an entry `src/index.ts`.

2. **Migrate leaves-first, typing as you go.** Move, in order (each is a leaf with no
   internal deps, and each is convention-neutral — [ADR-0006](DECISIONS.md#adr-0006-convention-neutral-core-packages)):
   1. **Complex arithmetic** (from QD `complex.js` and CD's evaluator core). Pick the
      representation already fastest in each engine; benchmark the CPU orbit path
      before/after (see [RISKS Hard Part 3](RISKS.md#hard-part-3-performance-regression-from-abstraction)).
   2. **Formal power/Laurent series** (from QD `taylor.js`; reconcile with CD's Böttcher
      recurrences).
   3. **Polynomial & rational algebra + Durand–Kerner** (unifying the *four* current
      copies: QD `faber-analysis.js`, `direct-common.js`, `param-slice` worker, CD
      `render/critical.ts`).
   4. **Newton + line search + Brown–Gearhart deflation** (from QD `solver.js`).
   5. **mat4 / camera helpers** (from the sphere modules of both apps).

3. **Consolidate tests into a golden corpus.** Bring both apps' relevant unit tests into
   `packages/core/test/`, plus fixed golden values that represent *both* apps' needs.
   This corpus is what makes shared fixes safe.

4. **Point both apps at the package.** Replace the in-app copies with
   `import { ... } from "@cas/core"` (declared `"@cas/core":
   "workspace:*"` in each app). Delete the now-dead in-app copies.

5. **Begin TS-ifying QD leaves.** The modules you just extracted are exactly the ones to
   type first; the rest of QD stays `allowJs`.

**Gate.** Both apps import `core`; their duplicated numeric code is deleted; the `core`
golden corpus passes; both apps' full suites pass; a CPU-path benchmark shows no
meaningful regression (or the regression is understood and accepted).

**Notes.** Extract *only* `core` here — it is the highest-value, most convention-neutral,
lowest-risk shared surface. Do not reach for `gpu`/`expr` yet; those are Phase 5 and are
gated on the correspondence tool actually needing them.

---

## Phase 4 — `interchange` and the first hand-off

**Goal.** The first *interoperability* milestone and an early motivating win: export a
**single-valued Schwarz reflection** from the Quadrature app and open it in the Complex
Dynamics app. **No new mathematics required** — this rides `expr` as it exists today.

**Steps.**

1. **Scaffold `packages/interchange/`** with the minimal schema needed for this
   hand-off: `MapSpec`, `RationalMap`/`LaurentMap`, `QuadratureDomain`,
   `SchwarzReflection`, `Viewport`, and the envelope (`schema`, `version`, `kind`,
   `payload`, `provenance`). Full spec: [INTERCHANGE.md](INTERCHANGE.md). Add runtime
   validation (e.g. a small hand-written validator or Zod) *on top of* the static types.

2. **Emit from Quadrature.** In the Schwarz tab, add "Export map" → serialize the
   current `σ` (built by `QD.Schwarz.buildSchwarzFromPhi`/`FromRational`) to a
   `SchwarzReflection` payload, **converting from QD's normalized convention to the
   canonical interchange convention at the boundary** ([ADR-0006](DECISIONS.md#adr-0006-convention-neutral-core-packages)).
   Produce both a copyable JSON and a **deep link** (via the unified codec).

3. **Consume in Complex Dynamics.** Accept an imported `SchwarzReflection` (via pasted
   JSON or an opened deep link), compile its `MapSpec` through `expr`, and render its
   dynamical plane — reusing CD's escape-time, sphere, projection, and (where
   applicable) Böttcher/ray machinery.

4. **Unify the share-link/URL-state code** into (the beginnings of) `packages/ui` or a
   small `interchange` codec, so both apps encode/decode the same way. ⚠ Preserve
   backward-compatibility of each app's *existing* share-link format, or provide a
   migration — saved links may exist in your notes/papers.

**Gate.** You can round-trip a Schwarz reflection: export from QD, open in CD, and see
its dynamics; the payload validates; the deep link reproduces the view. The convention
conversion is correct (spot-check a known example against QD's own rendering of the same
`σ`).

**Notes.** This phase is deliberately *before* the hard extraction work, to bank a
concrete, motivating interop result early. It also exercises the keystone
([ARCHITECTURE §5](ARCHITECTURE.md#5-the-keystone-map-representation)) on the easy
single-valued case before the correspondence tool depends on it.

---

## Phase 5 — Extract `gpu` and promote `expr`

**Goal.** Extract the GPU substrate and promote the expression compiler to shared
packages — the machinery the correspondence tool needs. This is the **hardest**
extraction; sequence it here and let the correspondence tool's needs (Phase 6) pull it.

**Steps.**

1. **`packages/gpu/`** — extract from the Dynamics app: WebGL2 context management +
   loss recovery; the escape-time program scaffold (takes a GLSL iteration-step body →
   full program); **df64 deep-zoom**; sphere and projection (log-polar, Poincaré)
   remaps; colormaps; progressive rendering. ⚠ This code is sophisticated and tightly
   coupled to CD's renderer; extract behind a small, stable interface. Note:
   **perturbation** deep zoom is polynomial-specific and may stay CD-internal rather
   than generalize ([ARCHITECTURE §7](ARCHITECTURE.md#7-cross-pollination-the-upside-beyond-de-duplication)).

2. **`packages/expr/`** — promote CD's `src/expr` (one AST → GLSL + JS). Two extensions,
   staged:
   - **(a) Confirm anti-holomorphic coverage** (`conjugate` is already first-class;
     verify `z̄ᵈ+c` and Schwarz-reflection expressions compile on both backends).
   - **(b) Add multivalued / branch-aware maps** — the representation the correspondence
     tool requires. Design this *when Phase 6 begins*, against concrete needs.

3. **Adopt in both existing apps.** CD switches to the extracted `gpu`/`expr` (it is the
   source, so this is mostly relocation); the Quadrature app adopts `gpu` to **gain
   df64 deep zoom** on its Schwarz/limit-set renderer (a concrete cross-pollination win).

4. **Dual-backend invariant test.** Add property tests asserting GLSL ≈ JS evaluation
   across random inputs — now a shared, three-consumer concern
   ([RISKS Hard Part 2](RISKS.md#hard-part-2-the-dualbackend-glsljs-sync-invariant-at-suite-scale)).

**Gate.** CD runs on the extracted `gpu`/`expr` with no regression (visual spot-checks +
dual-backend tests); the Quadrature app renders its Schwarz dynamics with df64 deep
zoom; the multivalued `expr` extension is designed (even if not yet complete) against
the real correspondence requirements.

**Notes.** Extract `expr`/`gpu` *because Phase 6 needs them*, not for tidiness — the
correspondence tool is the second consumer that justifies the extraction
([ADR-0007](DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)).

---

## Phase 6 — Build `apps/correspondences` (in parallel with the tail of Phase 5)

**Goal.** The new tool, built on the shared packages, with a first milestone that
validates the whole pipeline: **reproduce a known dynamical picture (the deltoid
Schwarz reflection).**

**Steps.**

1. **Scaffold `apps/correspondences/`** depending on `core`, `gpu`, `expr`,
   `interchange`, `ui`, and — via extraction as needed — `quadrature` (for the
   Schwarz-reflection construction `σ = f∘η∘f⁻¹`) and `dynamics` (for the parabolic
   Tricorn model space). ⚠ Extracting `quadrature`/`dynamics` from the apps is itself
   demand-driven: do it when the correspondence app needs those functions, not before.

2. **Milestone A — reproduce the deltoid.** The deltoid Schwarz reflection uses the
   Laurent map `φ(ζ) = ζ + 1/(2ζ²)`, which the Quadrature app's unbounded-Laurent path
   plus `QD.Schwarz` can already build. Render its dynamical plane in the new app; check
   against the published picture. This validates that the shared σ-construction + `gpu` +
   `expr` pipeline works end-to-end before any multivalued code exists.

3. **Milestone B — the correspondence engine (the genuinely new work).**
   - Build the **deleted correspondence** `(f(w) − f(η(z)))/(w − η(z)) = 0` from the same
     `φ` (σ is its single-valued diagonal piece).
   - **Branch enumeration** via `core`'s Durand–Kerner (roots of `f(w) = f(η(z))`, minus
     the trivial `w = η(z)`).
   - **Branch-labelled orbit-tree** iteration — reuse the Quadrature Schwarz module's
     existing **"tree" painters**.
   - **Branch continuation** — template on the Mother Body Constructor's exclusive
     **bipartite root-matching**; add high-precision local charts near cusps/parabolics
     from `core`'s formal-series arithmetic (Fatou-coordinate-style).
   - Render on `gpu` (2-D, sphere, projections).

4. **Milestone C — parameter space & straightening.** Reuse the Quadrature
   `param-slice` engine's classify/adaptive-quadtree substrate for the correspondence
   family; add a model-coordinate readout mapping into the **parabolic Tricorn**
   (computed in / cross-checked against the Dynamics app). Label all straightening
   output as exploratory (`≈`), never certified — the analytic tools behind it (David
   surgery, straightening) are not automatable to proof level
   ([RISKS §3](RISKS.md#3-the-three-genuinely-hard-parts)).

5. **Benchmark families** in order: deltoid → circle-and-cardioid → cubic Chebyshev
   (Family S) → general `d:d`. Add each as a curated family with an analytic oracle
   (reusing the Quadrature app's thesis-example/oracle pattern).

**Gate (milestone-by-milestone).** A: deltoid dynamical plane matches the literature.
B: correspondence orbit trees iterate with stable branch labels through a cusp. C: a
Schwarz-reflection parameter slice renders alongside its parabolic-Tricorn model
coordinate, with honest labeling.

**Notes.** The hard part here is **mathematics** (branch management near
cusps/parabolics; the real-analytic — not holomorphic — parameter dependence; the
*theorem-level* discontinuity of straightening on odd-period parabolic arcs), not code
reuse — the reuse is what the prior phases bought you. See
[RISKS §Anti-holomorphic subtleties](RISKS.md#4-anti-holomorphic-subtleties-the-existing-code-will-hit).

---

## Ongoing / later (not gating)

- **Finish TS-ification** of Quadrature app internals opportunistically; leave gnarly UI
  glue gradually-typed (or `// @ts-nocheck`) indefinitely — full coverage is *not* a
  prerequisite for a sound suite ([ADR-0002](DECISIONS.md#adr-0002-typescript-as-the-common-language)).
- **Extract `quadrature` / `dynamics` domain packages** as the correspondence app (and
  any future tool) needs their mathematics.
- **`packages/ui`** — grow the shared UI kit as common UI patterns accrete (inspector
  cards, slider pads, glossary, theming).
- **Fold in the other three tools** (argument-principle applet, Arnold tongues, Zipper
  conformal mapper) — each should be visibly cheaper than the correspondence tool was,
  because `core`/`gpu`/`expr`/`ui`/`interchange` already exist. This is the north-star
  property paying off.
- **Visual-regression harness** — a pixel-diff over a fixed set of views, guarding the
  renderers.
- **(Optional) unified application shell** — only if you decide separate-apps-with-links
  isn't enough ([RISKS Open Questions](RISKS.md#open-questions-decisions-needed-from-you)).

---

## Phase dependency summary

```
0 Genesis ─► 1 Tooling ─► 2 QD→Vite ─► 3 core ─► 4 interchange+σ hand-off ─► 5 gpu+expr ─┐
                                                                                          ├─► 6 correspondences
                                                                          (5 tail ∥ 6) ───┘
Ongoing (non-gating): TS-ification · quadrature/dynamics packages · ui · other tools · visual regression · optional shell
```
