# Complex-Analysis-Suite — comprehensive review (2026-08)

**Date:** 2026-08-17 · **Branch:** `claude/complex-analysis-suite-review-f9ytea` (HEAD carries
PRs through #282) · **Requested by:** andrew@graven.com

**Method.** A green/health baseline (full `pnpm install/typecheck/lint/test/build`) plus **ten
read-only reviewer agents** fanned out over the 8 apps + 10 `@cas/*` packages + all docs, each
producing a structured findings file in [`findings/`](findings/). Depth was **deep + domain-math**
(the numerical methods themselves were re-derived, not just the engineering) and consolidation
scope **included speculative** candidates. Per-area detail lives in the ten `findings/NN-*.md`
files; this report synthesizes them. Every claim below was hand-verified by an agent against source
at HEAD; nothing was executed beyond the health suite (read-only review).

---

## Executive summary

**The suite is in genuinely good shape.** All CI gates are green (375 test files / 3137 tests),
and — the headline result for a math suite — **every heavy numerical engine was independently
re-derived and found correct**, with **no silent factor-of-π / 2πi error** anywhere. The
convention-neutrality design (ADR-0006) is working: the one place conventions live (QD's
`dA=dx dy/π`, `1/(2πi)`) exports **canonically and is byte-golden-tested**.

Findings total ≈ **80** across all severities: **2 HIGH, 23 MEDIUM, ~37 LOW, ~18 NIT**. They cluster
into five themes (below). Only **one** is a genuine latent *correctness* bug (Durand–Kerner can still
certify a NaN root); the rest are parity/robustness gaps, honest-labeling seams, a clean consolidation
roadmap, and stale documentation.

### What to fix first (ranked)

| Rank | Item | Sev | Area | Fix-safety |
|------|------|-----|------|-----------|
| 1 | **Durand–Kerner still returns `converged:true` with a NaN root** (PR #154 fix not NaN-sticky) | HIGH | `@cas/core` | needs-review (1-line fix + new test) — [01](findings/01-core-exact.md) |
| 2 | **CLAUDE.md et al. say the σ hand-off is "awaiting review"** — it shipped to master (#246/#255) | HIGH | docs | **safe-now** ✅ applied — [09](findings/09-documentation-staleness.md) |
| 3 | **GPU σ caps orbit at 512** while CPU honors maxIter→4096 (silent parity break) | MED | complex-dynamics | needs-review — [05](findings/05-complex-dynamics-dynamics.md) |
| 4 | **Faber GPU truncates series at degree 47** while order slider reaches 128 | MED | faber-transform | needs-review — [04](findings/04-faber.md) |
| 5 | **`findCycles` runs holomorphic Newton on the anti-holomorphic σ** (wrong for odd n; n=1 degenerate) + no ≈ caveat | MED | quadrature-domains | needs-review — [07](findings/07-quadrature-domains.md) |
| 6 | **Freehand `path` permalink bypasses the vertex cap** circles enforce (client self-DoS) | MED | argument-principle | needs-review — [08](findings/08-render-group.md) |
| 7 | **Nested `sourceDomain`/`hData`/`tilingSetHint` bypass the ADR-0006 canonical-wire guard** (+ DoS cap) | MED | `@cas/interchange` | needs-review — [02](findings/02-expr-interchange.md) |
| 8 | **Duplicate ADR-0020** — two different ADRs share the number (~10 inbound refs) | MED | docs | needs-review (renumber) — [09](findings/09-documentation-staleness.md) |
| 9 | **Consolidation roadmap** (`pointInPolygon` ×5, DK-seed ×3, SC corner-cluster ×3) | MED | cross-cutting | needs-review — [10](findings/10-consolidation-duplication.md) |
| 10 | **Stale-doc batch** (README/ARCHITECTURE/ci.yml/package READMEs/comments) | LOW–MED | docs | **safe-now** ✅ mostly applied — [09](findings/09-documentation-staleness.md) |

---

## Health baseline — ✅ all green

`pnpm install` (frozen lockfile) → `typecheck` → `lint` (eslint + dep-cruiser + per-pkg/app) →
`test` → `build` all exit 0. **375 test files, 3137 tests passing** (~100s); census gate OK across
17 projects. Worker-unavailable lines in the test log are expected test-env stubs (main-thread
fallback), not failures. Logs in [`health/`](health/). **Implication:** every finding below is
*latent* (not caught by the current suite) — which is why the domain-math pass and the test-gap
findings carry weight.

---

## The five themes

### 1. Numerical correctness — one real latent bug, otherwise sound

- **[HIGH] Durand–Kerner certifies NaN roots** (`packages/core/src/durand-kerner.ts:126`). The PR
  #154 fix for the earlier CRITICAL `cd-dk-01` is **not NaN-sticky**: `if (!(dm <= maxDelta)) maxDelta = dm;`
  lets a later small finite `dm` overwrite a `maxDelta` that had gone NaN, so a mixed
  blow-up/converge sweep returns `converged:true` with `roots[0]={NaN,NaN}`. Agent 01 hand-traced a
  deterministic repro (monic cubic, seeds `[1e160,1,-1]`). 7/8 call sites leave `bailOnNonFinite=false`,
  so it's reachable. **Fix:** `maxDelta = Math.max(maxDelta, dm)` (NaN-propagating) or a `sawNonFinite`
  gate, **plus** the mixed-scenario regression test the current corpus lacks. *(needs-review — the fix
  is a clear one-liner but is not covered by an existing test, so it's out of the auto-apply boundary.)*
- **[MED] `findCycles` applies holomorphic Newton to the anti-holomorphic σ**
  (`apps/quadrature-domains/app/schwarz/schwarz-forward.mjs:202`). A single real-axis finite
  difference is treated as σⁿ's complex derivative — valid only for **even** n; for n=1 the fixed-point
  set is the *entire boundary curve* (non-isolated), so isolated-root Newton is degenerate exactly where
  the comment claims it's "typically reliable". The UI shows a bare cycle count with no ≈ caveat.
- Everything else re-derived **correct**: inverse-Böttcher recurrences (monic/general/rational/multibrot),
  Gronwall/capacity/bounding-radius, smooth-iteration, parabolic-root Newton (agent 05); Faber recurrence
  incl. the subtle `−n·cₙ` term, exact rational images, the `Q_{n,m}` principal `1/m`-root branch (agent
  04); Gauss–Jacobi/Golub–Welsch, compound subdivision, interior+exterior SC parameter solves,
  Laurent-at-∞ (agent 03, validated against mpmath n-gon circumradii, `2/K(1/√2)`, `Γ(1/4)` capacity,
  `c₃=1/6`); deltoid σ inverse + the exact ℚ(i) correspondence curve/cusp locus (agent 06); the
  argument-principle `(1/2πi)∮ f′/f = Z−P` (agent 08); the ζ/Γ/Borwein special functions (agent 02).

### 2. GPU-uniform-cap vs CPU-limit mismatch (recurring, app-local)

A GLSL `uniform X[N]` fixed array whose size silently disagrees with the CPU iteration/degree limit,
producing a mislabeled render past the cap — found **independently twice**:
- **[MED]** CD σ GPU loop caps at 512 while the σ maxIter input clamps to 4096; CPU honors the full
  value → GPU misclassifies deep points as "interior", violating the module's own pixel-parity invariant
  (`render/schwarzGL.ts:259`).
- **[MED]** Faber GPU `MAXC=48` truncates the series image while the order slider reaches
  `MAX_TRUNCATION=128`; the readout, root markers, and CPU path use the full degree
  (`faber-transform/src/render/gpu.ts:21`).
- **Scoping (good news):** agent 06 confirmed the correspondences σ shaders do **not** reproduce it
  (their `uMaxIter` is hardcoded far below the static loop bound, no user control), and agent 08
  confirmed `@cas/gpu` has **no** shared cap pattern — so this is **app-local, two instances**, not a
  package defect. Recommend a documented "CPU-limit must equal GLSL-array-size" convention note in the
  `@cas/gpu` README (speculative, no in-package second consumer yet) and clamping N in each app.

### 3. Honest-labeling seams (guardrail — all low/med, no false `=` certification)

- **[MED, ✅ applied]** A **disproven** univalence bound (`|a|≤√2`, "area theorem") is re-asserted in a
  correspondences **test comment** (`gpuAgreement.test.ts:145`), the exact claim the app was built to
  fix and that `family.ts:12` explicitly forbids — it slipped the code-only guard. (True bound `|a|≤1`.)
- **[MED] dual meaning of "M₀"** in QD: `observables.mjs` computes *geometric* moments (unit-disk
  M₀=π) but labels them "QD harmonic moments", while the solver uses the π→1 convention (M₀=1). No
  active cross-contamination (agent traced consumers), but it's the ADR-0006 factor-of-π ambiguity
  living at the doc layer — recommend loud relabeling.
- **[LOW]** Faber's `=` "exact rational image" path numerically roots the denominator (Durand–Kerner +
  `1e-4` clustering) — exact *given* the located poles; over-claims for high-degree/near-coincident user
  input. **[LOW]** riemann-map tags a reduced-quadrature (`nGaussLegendre:12`) region fit "exact /
  machine precision". **[LOW]** AP's analytic-integral readout asserts `→ round(val)=Z−P` without the
  reliability gate the verdict panel uses (the two honest readouts can disagree near a singularity).
- **[LOW/stale]** CD's `// Rigorous` comment + `lastConnectivityRigorous` flag survive though the
  user-facing verdict is now correctly `≈`-hedged (2026-07 finding #5 only partially closed).

### 4. Consolidation roadmap (agent 10 — ADR-0007-aware)

Real ADR-0007 cases (second consumer already exists), prioritized by payoff/effort:

1. **[MED] `pointInPolygon` — 5 copies**, one already a `@cas/schwarz` export consumed by CD. All TS
   consumers depend on `@cas/core` → lift a tiny `geometry.ts` there; rewire schwarz/conformal/
   riemann-map/argument-principle. Cleanest win; **unblocks #3**. (Leave QD's vanilla `{re,im}` variant.)
2. **[MED] Monic-Horner + Durand–Kerner seeding/certification — 3 apps** (CD `critical.ts`, AP
   `singularities.ts` — its header literally says "mirrors complex-dynamics", correspondences looser).
   The still-open `cd-dup-05`. Extract `rootsMonic(coeffs,{seed,...})` into `@cas/core` beside
   `makeDurandKerner`, seed stays caller-side (ADR-0018 pattern). **Kept distinct from the ADR-0020-
   deferred *finder*.** Also the natural home for the HIGH DK-NaN fix's regression coverage.
3. **[MED] Corner-clustered SC poles + outward-dirs + Chebyshev boundary — triplicated**
   (`riemann-map/domains.ts` + `conformal/scMap.ts` + `forwardMap.ts`; corroborated by agents 03 & 10).
   Export `clusteredCornerPoles`/`clusteredBoundary` from `@cas/conformal`; rides on #1.

Speculative / lower-value (labeled **not yet ADR-0007-forced**): trivial `cabs/cdiv/cmul/finite`
re-declarations (incl. `cd-dup-10`); per-app `formatComplex`; the `@cas/expr`-internal
`constExp`/`constReal` byte-identical constant-folder (an *internal* hoist, not a cross-package
extract). **Newly surfaced real case:** **[MED] QD's `schwarz-common.mjs` near-duplicates `@cas/schwarz`**
(bounded + unbounded-Laurent + preimage-tree/limit-set) yet QD never imports the package — a genuine
ADR-0007 second consumer that reads as *forgotten* duplication (QD keeps an LQD/PQD superset, so only a
partial rewire; **record the decision as an ADR either way**).

**Correctly respected (do NOT merge):** ADR-0020 plotter↔AP winding/finder defer; ADR-0008 QD
`sym-core`; ADR-0018 lstsq twins; `cd-div-02` `divScaled` (verified: both `.div` wrappers already call
one shared kernel — not actually duplicated); `@cas/dynamics/rays.ts` hot-loop ops. And confirmed
**already fully consolidated**: `@cas/gpu`/GLSL (ADR-0016 complete, no stragglers) and the
`@cas/interchange` base64url codec (no app-local base64 anywhere).

### 5. Stale documentation (the bulk of the safe-fix work)

Agent 09 verified counts against the tree (10 packages / 7 apps + launcher / deploy list / Node 22 are
all **correct**); staleness is concentrated in specific paragraphs — see "Safe fixes applied" below and
[findings/09](findings/09-documentation-staleness.md). The one HIGH: CLAUDE.md (mirrored in `STATE.md`
and `SIGMA-HANDOFF.md`) still calls the σ hand-off "awaiting review" on a feature branch though it
shipped (#246/#255; interchange 1.3.0) — self-contradictory within its own paragraph.

---

## Safe fixes applied in this review

Per the agreed posture (**report + safe fixes**), only doc-only corrections, comment fixes, and
obvious-and-covered items were auto-applied; each was re-verified against source before editing. See
the commit(s) tagged `review(2026-08): apply safe stale-doc/comment fixes`. The list is maintained in
[`PROGRESS.md`](PROGRESS.md) and appended here once applied.

_(This section is completed by the fix commit that follows this report.)_

---

## Report-only items awaiting your triage (substantive — not auto-applied)

These need a design/behavior decision or new tests, so they were left for you:

- **Durand–Kerner NaN fix** (HIGH) — 1-line change + new regression test (theme 1).
- **Two GPU-cap parity fixes** (MED×2) — clamp N or raise the GLSL array bound; each needs a
  CPU↔GPU parity test (theme 2).
- **`findCycles` anti-holomorphic Newton** (MED) — use the full 2×2 real Jacobian or the holomorphic
  σ²ᵏ route + an ≈ caveat in the UI (theme 1).
- **AP freehand-path vertex cap** (MED) — bound `points.length` in `isFinitePointArray` (theme:
  hostile-input; [08](findings/08-render-group.md)).
- **Interchange nested-payload validation** (MED) — factor `validateQuadratureDomain` and apply it to
  `sourceDomain`/`hData`/`tilingSetHint` (`interchange-validate-01`, still open; [02]).
- **Duplicate ADR-0020 renumber** (MED) — renumber the SC-engine ADR (→ next free) + sweep ~10 refs.
- **The three consolidation extractions** (MED) — `pointInPolygon`, `rootsMonic`, SC corner-cluster
  (theme 4); each with a before/after golden.
- **M₀ relabeling** (MED), **QD↔`@cas/schwarz` partial rewire + ADR** (MED), and the LOW numerical
  test-gaps (lstsq near-singular coverage, precise-mode `degraded`/`invertMap` failure signal, QD
  `houseQR` rcond framing, QD `Math.random` recovery seed).

---

## Appendix — per-agent findings index & coverage

| File | Area | Findings (C/H/M/L/N) |
|------|------|----------------------|
| [01-core-exact](findings/01-core-exact.md) | `@cas/core` + `@cas/exact` | 0/1/1/3/1 |
| [02-expr-interchange](findings/02-expr-interchange.md) | `@cas/expr` + `@cas/interchange` | 0/0/2/5/1 |
| [03-conformal-riemann-map](findings/03-conformal-riemann-map.md) | `@cas/conformal` + riemann-map | 0/0/3/2/3 |
| [04-faber](findings/04-faber.md) | `@cas/faber` + faber-transform | 0/0/2/4/3 |
| [05-complex-dynamics-dynamics](findings/05-complex-dynamics-dynamics.md) | complex-dynamics + `@cas/dynamics` | 0/0/1/3/3 |
| [06-correspondences-schwarz](findings/06-correspondences-schwarz.md) | correspondences + `@cas/schwarz` | 0/0/1/3/1 |
| [07-quadrature-domains](findings/07-quadrature-domains.md) | quadrature-domains (85k, strategic) | 0/0/3/4/1 |
| [08-render-group](findings/08-render-group.md) | plotter + argument-principle + `@cas/gpu` + `@cas/export` | 0/0/2/5/3 |
| [09-documentation-staleness](findings/09-documentation-staleness.md) | all docs | 0/1/5/5/2 |
| [10-consolidation-duplication](findings/10-consolidation-duplication.md) | cross-cutting | 0/0/3/3/0 |

**Known coverage gaps (honest, from the agents' Coverage sections):** the QD mega-app's algebra tab
(~4.6k lines) + Gröbner/FGLM interior of `sym-core` + per-family solver kernels; CD's UI/event glue,
`glPlot.ts`/`bla.ts` df64 internals, and the many Julia/σ overlay modules; the `docs/algebra-review/*`
+ `ALGEBRA_*`/factoring docs (a QD-Algebra sub-project ~1400 lines) were not swept for currency; and
DECISIONS.md ADR *bodies* were not each read end-to-end. These are candidates for a follow-up pass.
