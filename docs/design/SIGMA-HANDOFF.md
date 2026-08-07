# Design — Faithful σ (Schwarz-reflection) hand-off, QD → CD

> **Status: APPROVED (2026-08-07) — executing.** Maintainer-approved; the approved decisions and the
> refined PR sequence are in the "Approved implementation plan" section at the end. Not an ADR yet.
> Supersedes the "plumbing-first" φ-only hand-off documented at
> `apps/quadrature-domains/app/schwarz/schwarz-export.mjs:4-8`. Grounded in a three-part code audit
> (QD σ machinery, `@cas/interchange`, CD + `@cas/expr`); file:line anchors throughout are the
> evidence. Governing decisions it touches: ADR-0005 (expr/interchange keystone; *single-valued
> first*), ADR-0006 (convention-neutral wire), ADR-0007 (extract on the second consumer).

## 0. TL;DR

Today "Export map → copy link" hands off **φ (the Riemann map), not σ (the Schwarz reflection)** —
which is why an exported deltoid renders as its Riemann map. That was a deliberate stopgap because
**σ has no closed form**: σ(w) = conj(F(φ⁻¹(w))) needs a *numerical* inverse of φ.

**Recommendation:** don't try to ship a closed-form σ. Instead **hand off φ (richly) plus a
"reconstruct as a Schwarz reflection" marker, and reconstruct σ in CD via a new shared
`@cas/schwarz` package** that both apps (and correspondences) call. This is feasible and largely
*already written* — the work is extraction + wiring, not greenfield math. Stage it deltoid-first,
label σ honestly as an estimate (`≈`), and keep the φ-only link working for old clients.

## 1. Problem & current state

- **What ships now.** `buildExportEnvelope` serializes `payload: { phi: mapSpec }` in a
  `quadrature-domain` envelope (`schwarz-export.mjs:42-57`); `phiToMapSpec` only understands
  `rational` (P/Q) and pure `laurent` (c + F, no branches) and returns `null` otherwise
  (`schwarz-export.mjs:22-36`). CD installs that φ as its iterated map with no special-casing
  (`apps/complex-dynamics/src/main.ts:2926-2944`). So the user gets φ, faithfully — just not σ.
- **The schema already *anticipated* σ, optimistically.** `@cas/interchange` has a
  `schwarz-reflection` envelope kind whose payload is `{ sourceDomain?, sigma: MapSpec, escape?, … }`
  (`packages/interchange/src/schema.ts:86-92`), documented as *"sigma is single-valued, so it
  compiles through `expr` as-is"* (`schema.ts:82-85`). **That assumption is false for the real σ**
  (see §2) — the field exists but cannot be populated with any of the three current MapSpec forms.

## 2. The math — why σ can't just be serialized

From the QD implementation (`schwarz-common.mjs:1097`, the single evaluator `sigma`):

```
σ(w) = conj( F( ψ(w) ) ),   ψ = φ⁻¹
```

- **φ** is the Riemann map 𝔻→Ω (or 𝔻*→Ω), closed-form per family (rational P/Q; Laurent c + Σ F_l/z^l;
  or branch/exp/α forms). For the **deltoid**, φ(ζ) = ζ + 1/(2ζ²) — a `laurent` map, `c=1, F=[0,0,½]`
  (this is the existing interchange golden, `packages/interchange/src/goldens.ts:28-34`).
- **F** is a *distinct* closed-form function — φ's meromorphic Schwarz extension across ∂𝔻, built from
  **the same coefficients** as φ but a different kernel (e.g. φ uses `u_j=z/(1−z̄_j z)`, F uses
  `1/(z−z_j)^k`; `schwarz-common.mjs:245,286`). On ∂𝔻, F(z)=conj(φ(z)), so σ = identity on ∂Ω.
- **ψ = φ⁻¹ is numerical.** Plain complex Newton, 40 iters @ tol 1e-12 with a retry (`newtonInvert`,
  `schwarz-common.mjs:100`), per-family seed, and **branch selection** via `acceptZ` (bounded keeps
  |z|<1, unbounded |z|>1). φ has degree ≥ 2, so φ⁻¹ is multivalued — choosing the branch continuous
  with the reflection is the genuinely hard, *uncertified* part (RISKS §3).
- **σ is iterated escape-time** (Julia-like): smallest n with σⁿ(w) ∉ Ω / escaped / interior /
  invalid (`escapeTime`, `schwarz-common.mjs:1166`).

**Consequence (the load-bearing constraint):** `@cas/expr` is a **straight-line language with no loops
of any kind** — the `Node` union has an `if` ternary but no `while`/`for` (`packages/expr/src/ast.ts:16-28`).
It supports `conjugate` on both GLSL and JS backends (so the anti-holomorphic *outer* wrap is free),
but it **cannot express an iterate-to-convergence Newton inverse.** Therefore **σ is not an `expr`
MapSpec** in general — it must be *reconstructed from φ by a real evaluator*, not compiled from a string.

## 3. What's already built (the de-riskers)

This design is unusually low-risk because the σ math exists **three times** already:

| Asset | Where | What it proves |
|---|---|---|
| **CPU σ builder** `buildSchwarzFromPhi(phi,…)` | `schwarz-common.mjs:1056` (+ adapters, `newtonInvert`) | σ for **all 10 QD families** from φ alone; the reference semantics. |
| **Full GPU σ shader** incl. **in-shader 40-iter Newton inverse** | `schwarz-webgl.mjs` `FRAG_SRC` (`invertPhi`:427, `sigma`:489) | GPU σ escape-time is **already working** (float32, **6 of 10** families; PQD & df64 are the known gaps), CPU↔GPU parity to 3e-13. |
| **TS σ engine on `@cas/core`** `makeUnboundedLaurentSchwarz` | `apps/correspondences/src/deltoid.ts:14` (`evalPhi/evalF/invertPhi/sigma` via `makeDurandKerner`) | The deltoid σ is **already reconstructed from φ in strict TS** — a copy of QD's math (`deltoid.ts:6-8` says so) because "correspondences may not import another app." |

So CD would be the **third** consumer of the same σ math. Under **ADR-0007** (extract a primitive when a
second consumer needs it) the extraction trigger is not merely met — it is overdue. CD's kernel already
does **anti-holomorphic escape-time**, **nested bounded GLSL loops** (perturbation/BLA), and **df64
deep-zoom** (`render/shaderBuilder.ts:763-779, 341-356`), so the target environment can host σ.

## 4. Design decision — reconstruct σ from φ (not ship a closed-form σ)

Three options were considered:

- **A. Closed-form σ as an `expr`.** Only possible when φ⁻¹ is closed-form (low degree). Even the
  deltoid needs a cubic (2ζ³ − 2wζ² + 1 = 0) solved by Cardano *with* exterior-branch selection — ugly,
  and it does **not** generalize past a few families. **Rejected as the general path** (keep as a
  micro-optimization note for trivially-invertible cases only).
- **B. Reconstruct σ from φ via a shared numerical σ-engine + a bespoke (non-expr) render path.**
  General, faithful, and *mostly already implemented* (§3). **Recommended.**
- **C. Sample σ numerically → hand off a rational/AAA approximant.** Lossy; must be labeled `≈`; loses
  exactness and the pole structure. **Rejected** except as a possible fallback for a family whose
  evaluator isn't ported yet.

**We choose B.** The rest of the doc designs it.

## 5. Architecture

Three coordinated pieces, mirroring the existing **interchange-spec / expr-executable** keystone split
(ADR-0005): the wire carries *data*, a package carries the *executable* σ.

### 5a. New shared package `@cas/schwarz` (depends on `@cas/core`)

The **executable** half. Scope: construct + evaluate σ from φ, family-dispatched, with two backends.

- **API (extracted from `schwarz-common.mjs` + `deltoid.ts`):**
  `buildSchwarzFromPhi(phi) → { evalPhi, derivPhi, evalF, invertPhi, sigma, escapeTime, isInOmega, escapeR, … }`,
  plus the family adapters and the generic `newtonInvert`/Durand-Kerner (already in `@cas/core` as
  `makeDurandKerner`, `tupleAlgebra` — `packages/core/src/index.ts:16-19`).
- **Two backends, one source of truth:** a **JS** evaluator (CPU reference, restores CD's overlay/orbit
  parity — see §5c) and a **GLSL codegen** backend that emits the escape-time σ kernel (ported from
  QD's proven `FRAG_SRC`). The JS path is the oracle the GLSL is fuzz-checked against (the same contract
  `@cas/expr` uses, `packages/expr/src/index.ts:1-2`).
- **Consumers:** QD (drops the app-local `schwarz-common`/`-inverse` duplication over time), CD (new),
  and **correspondences (deletes `deltoid.ts`'s reimplementation)** — the concrete second/third
  consumers that justify the package.
- **Extraction frictions to plan for** (from the audit): QD's module is a global-IIFE that mutates
  `QD.Schwarz`, pulls in the solver graph, and is monkey-patched by `schwarz-inverse.mjs:548`. The clean
  package takes a **plain φ object + `@cas/core` algebra** and returns a handle with no namespace side
  effects. Start from `deltoid.ts` (already clean TS-on-core) and widen to more families.

### 5b. Interchange representation (`@cas/interchange`)

The **data** half. σ isn't closed-form, so the wire carries **φ + a "this is a Schwarz reflection"
marker**, and CD reconstructs σ via `@cas/schwarz`. Two shapes were considered; **recommended:**

> **Add a fourth `MapSpec` form, `form: "schwarz"`, and carry it in the existing
> `schwarz-reflection` kind's `sigma` field.**

```ts
// schema.ts — MapSpec is a discriminated union on `form` (schema.ts:42-68); add:
export interface SchwarzMap {
  form: "schwarz";
  phi: RationalMap | LaurentMap | SchwarzPhi;  // the closed-form φ (family coeffs)
  disk: "D" | "D*";                            // where φ lives ⇒ branch side (|z|<1 vs >1)
  inverse: "newton" | "newton+durand-kerner";  // reconstruction policy
  antiholomorphic: true;                       // σ contains conj(...)
  // future: branch-continuation policy (uncertified — RISKS §3)
}
```

Why this shape:
- **Reuses the `schwarz-reflection` kind** (already in `KNOWN_KINDS`, already returned by
  `envelopeToMapSpec` — `validate.ts:21`, `importMap.ts:82-83`), so the *kind* gate needs no change.
- **`sigma` stays a valid `MapSpec`** — a discriminated-union extension is the schema's natural
  extension point (`isMapSpec` gets one `case "schwarz":`, `validate.ts:98-111`).
- **CD routes `form:"schwarz"` to the `@cas/schwarz` evaluator**, *not* `mapSpecToExpr` (which only
  emits closed-form strings, `importMap.ts:61-70`).
- **Provenance:** keep φ *also* in `SchwarzReflection.sourceDomain` (already a field, `schema.ts:87`)
  for round-trip/debug.
- **Deltoid needs nothing richer:** its φ is already a `laurent` map. Only the *other* families need
  `SchwarzPhi` (the full `clonePhi` coefficient set: `family`, `unbounded`, `branches[{z,A[]}]`, `w0`,
  `c`, `polyA/F`, `alpha`, `z0`, `gamma`, `lqdBeta`, `lqdGamma` — `solvers/solver.mjs:123`). Ship the
  laurent/rational subset first (M2), widen later (M3).
- **Conventions:** tag `CANONICAL` — σ is geometric like φ (no π/2πi weighting), so `assertCanonicalWire`
  passes unchanged (`validate.ts:89-96`; ADR-0006).

Change surface (spec side): `schema.ts` (form) + `validate.ts:98-111` (`isMapSpec` case, with
`MAX_COEFF_LEN` caps) + a **new σ golden** in `goldens.ts` (there is none today — the sole golden is the
deltoid *φ*). Version: **minor bump, stay major 1** (§7).

### 5c. CD render path

- **A non-expr σ mode.** `envelopeToMapSpec` returns the `schwarz-reflection` `sigma`; when
  `sigma.form === "schwarz"`, CD **bypasses `mapSpecToExpr`** and installs a σ kernel from
  `@cas/schwarz`'s GLSL codegen as `fFn`/`escapeFn` (the render loop at `shaderBuilder.ts:763-779` is
  otherwise unchanged — it already iterates an arbitrary compiled step and already handles
  anti-holomorphic maps). The one genuinely new GLSL element is the **in-kernel Newton inverse of φ**,
  and QD's `FRAG_SRC` is the working reference to port.
- **CPU reference restored.** Provide the JS σ from `@cas/schwarz` so CD's overlay/orbit/inspect paths
  (which go through `evaluate`, also loop-free) have a matching oracle — otherwise the JS↔GLSL parity
  contract has no σ reference.
- **Fix two latent bugs found in the audit** (independently worth doing):
  1. **`conj` vs `conjugate`.** The schema's examples spell `conj` (`schema.ts:62`) but `@cas/expr` only
     knows `conjugate` (`ast.ts:31-50`); an `ExprMap` using `conj` reaches CD's parser as an unknown
     function. Add a `conj` alias, or normalize on import.
  2. **`antiholomorphic` flag ignored.** `rationalExpr`/`laurentExpr` always emit in `z` and drop the
     flag (`importMap.ts:43-70`), so an anti-rational map would silently render as its holomorphic twin.
     Honor it (wrap the argument in `conjugate(z)`).

## 6. Honest labeling (non-negotiable — CLAUDE.md guardrail)

σ here is produced by a **numerical, branch-selected** inverse. It is an **estimate**, never a
certified object. Concretely:
- Label the exported/rendered σ **`≈`** in CD (title, legend), matching QD's own honest labeling.
- The **branch-continuity through cusps is uncertified** (RISKS §3, ADR-0005 "single-valued first"):
  the first cut takes the **principal exterior branch** and must say so; multivalued/branch-aware
  continuation is explicitly out of scope (M4).
- Provenance `note` on the envelope records "σ reconstructed by numerical inverse; principal branch;
  not certified."

## 7. Backward compatibility & versioning

- **Old CD builds fail loud, don't crash.** `KNOWN_KINDS`/`isMapSpec` hard-reject an unknown kind/form
  even at the same major version (`validate.ts:108-109,191-193`); CD's `importInterchange` catches the
  throw and boots to default (silent on load; a generic toast on paste — `main.ts:2926-2966`). There is
  **no** "ignore unknown kind" path, and only *additive optional fields* are forward-compatible
  (pinned by `interchange.test.ts:59-62`).
- **Levers:** (a) keep the version **minor** (stay `1.x`) so the version gate passes; (b) **keep the
  φ-only export path** as a user-selectable fallback so links open *something* on old clients; (c) treat
  the hard reject as intended "please update" behavior, but **improve the paste toast** to say
  "this link needs a newer Complex Dynamics build" instead of the current generic message.
- We are **not** shipping σ by silently overloading φ — fail-loud beats render-wrong (ADR-0006 ethos).

## 8. Testing (net-first, deltoid = ground truth)

- **New cross-app golden** in `packages/interchange/src/goldens.ts`: the deltoid σ envelope + a frozen
  σ(w₀) value (mirrors the existing `QD_TO_CD_DELTOID_PHI_AT_2 = 2.125`). QD asserts its exporter
  reproduces the bytes; CD decodes the same bytes and reproduces σ(w₀).
- **CPU↔GPU parity** for `@cas/schwarz` (QD's 3e-13 precedent), mutation-verified.
- **Deltoid ground truth end-to-end**: QD export → deep link → CD decode → reconstruct σ → escape-time
  matches QD's own render. The deltoid is the right first milestone — it's already the interchange
  golden *and* already reconstructed in `correspondences/deltoid.ts`.
- Every stage green + behavior-preserving before the next (the repo's standing guardrail).

## 9. Milestones

| # | Milestone | Deliverable | Risk |
|---|---|---|---|
| **M0** | **Honest relabel (now)** | Button/card say "Export **Riemann map φ**", state σ isn't exported yet. Fix `conj`/`antiholomorphic` bugs. Behavior-preserving. | low |
| **M1** | **Extract `@cas/schwarz`** | Shared σ engine on `@cas/core`, seeded from `deltoid.ts`; correspondences switches to it (dedup); CPU parity net. ADR-0007 satisfied. | med |
| **M2** | **Deltoid σ end-to-end** | `form:"schwarz"` (laurent/rational subset) + `schwarz-reflection` export in QD; CD reconstructs deltoid σ (CPU, then port GPU kernel); σ golden; `≈` labeling. | med |
| **M3** | **Broaden families + GPU** | `SchwarzPhi` full-family coeffs; port QD's `FRAG_SRC` to `@cas/schwarz` GLSL codegen for the 6 GPU-supported families. Flag PQD (no GPU αth-root) + df64 as gaps. | med-high |
| **M4** | **Branch-aware / multivalued (deferred, exploratory)** | Continuation through cusps; uncertified — RISKS §3 / ADR-0005. Not scheduled. | high |

Ordering rationale: M0 stops the tool from lying immediately; M1 pays the extraction the second consumer
already earned; M2 gets a *real σ on the live site for the deltoid* using assets that already exist; M3
generalizes; M4 is research.

## 10. Risks & open questions

- **Branch selection is the hard core** and is uncertified — the principal-branch first cut may be wrong
  near cusps; must be labeled and scoped (RISKS §3).
- **GPU cost is multiplicative** (`AA² × escape × Newton`), data-dependent Newton trip counts cause warp
  divergence, and **df64 σ compiles are already the slowest programs** in CD (`glPlot.ts:744-745`).
  Deep-zoom σ is a later, separate effort.
- **PQD families have no GPU αth-root** (QD falls back to CPU, `schwarz-webgl.mjs:942`) — CD GPU σ covers
  6 of 10 families at first, same as QD.
- **Old-client UX:** hard-reject is safe but blunt; the φ-fallback + better toast are the mitigations.
- **Open:** new `form` vs new `kind`? (Recommend `form:"schwarz"` in the existing `schwarz-reflection`
  kind — §5b.) Extract into `@cas/schwarz` vs grow `@cas/core`? (Recommend a new package — the engine is
  too high-level for core's primitive scope, and three consumers justify it.)

## 11. Recommendation

Do **M0 now** (it closes the honest-labeling bug you hit and is a few lines), and treat **M1 (extract
`@cas/schwarz`) as the real start** — it's demanded by the ADR-0007 second-consumer rule regardless of σ,
and it turns M2's deltoid σ into a wiring job on top of code that already exists in three places. Ship σ
`≈`-labeled, deltoid-first, φ-fallback intact.

## Approved implementation plan (2026-08-07)

**Maintainer-approved.** Decisions: **(1)** first shippable = **through S4a** — the deltoid's σ
reconstructed and CPU-rendered in CD, `≈`-labeled (S4b GPU + S5 other families follow as separate
approvals); **(2)** export σ **alongside** the existing φ export (keeps the φ pipeline-proof + old-client
fallback); **(3)** σ ships **`≈`, principal exterior branch only**, with the univalence caveat that
`correspondences/deltoid.ts` already documents.

### Progress (updated 2026-08-07 — read this first on resume)
**Shipped to `refactor/main`:**
- **S0a #235** — QD honest relabel (button/card say "Export **Riemann map φ**", disclaim σ).
- **S0b #236** — CD `mapSpecToExpr` honors the `antiholomorphic` flag (builds on `conjugate(z)`); schema
  example `conj`→`conjugate`.
- **S2a #237** — **NEW `@cas/schwarz`** (on `@cas/core`): the unbounded-Laurent σ engine
  `makeUnboundedLaurentSchwarz(c, F) → { evalPhi, evalPhiDeriv, evalF, invertPhi, sigma }` + `escapeTime`
  + `pointInPolygon`, lifted verbatim from `correspondences/deltoid.ts`. **correspondences deduped onto it**
  (its `deltoid.ts` re-exports the engine; 18 consumers unchanged) — **ADR-0007 second-consumer met, so the
  original S2e is already done**. Golden net (round-trip identity + exterior branch), mutation-verified.
  Green bar **2255 / 268** (census 9 projects, `schwarz:1`).
- **S3a #238** — **`@cas/interchange` v1.1.0**: the wire now carries σ as a RECIPE. `SchwarzMap`
  (`form:"schwarz"; phi:LaurentMap|RationalMap; disk:"D"|"D*"; inverse:"newton-dk"; antiholomorphic:true`)
  in the `MapSpec` union + `isMapSpec` `case "schwarz"` (recurse `phi` [laurent|rational only], `disk` enum,
  `inverse` whitelist, flag). `VERSION` **1.0.0→1.1.0** (honest-label; major-gated ⇒ old links still decode) —
  φ golden regenerated from QD's real exporter (version field only), + a NEW deltoid-σ golden
  (`QD_TO_CD_DELTOID_SIGMA_LINK` + frozen `σ(1+0.75i)=0.5−0.5i`, pinned against the real engine in
  `@cas/schwarz`). **Minimal CD guard** (forced by the enlarged union, NOT S4a's feature): `mapSpecToExpr`
  throws on `schwarz` + `importInterchange` declines gracefully — closed a latent `inpf=undefined` crash.
  Net-first, mutation-verified (×3). Green bar **2259 / 268**.

**REORDER (in effect — the PR table below is annotated):** went **deltoid-direct** (S2a before S1).
**S1** (`@cas/core` poly/polynomialRoots) and the **full QD σ lift/cutover (S2b–d)** are **DEFERRED** to a
later "generalize + dedupe QD" phase — they are *not* on the deltoid-σ critical path, and S1 touches
load-order-sensitive QD glue + the legacy `node-test` harness. The `PhiData` / full-family / S2d-cutover
material in this doc stays as the eventual plan for that phase.

**Remaining to the goal (deltoid σ live in CD):** ~~S3a~~ ✅ → **S3b → S4a** — see "S3 — execute next" below.

### What the dependency trace changed (the extraction is cleaner than §3–5 assumed)
- QD's σ path **already runs on `@cas/core`** (its `Complex` is a re-export shim, `app/core/complex.mjs`),
  so **~1,630 LOC of σ math lifts almost verbatim**; the only blockers are namespace plumbing (the
  `QD.Schwarz` IIFE + the `schwarz-inverse.mjs` monkey-patch) and **four pure helpers**. `hData` is a dead
  parameter — σ is a pure function of `(phi, boundaryPts)`.
- The real shared input is a plain-data **`PhiData`** interface (`family, unbounded, w0, c,
  branches[{z,A[]}], polyA/F, alpha, z0, gamma, lqdBeta, lqdGamma, P, Q`) — *the same fields the GPU
  shader already reads*, which is one more reason to formalize it as the package's public input type.
- Two **`@cas/core` extractions ADR-0007 already justifies** (independently valuable, and they shrink the
  σ surface): `@cas/core/poly` (from `app/core/poly-helpers.mjs`) and `@cas/core polynomialRoots(coeffs)`
  (from `direct-common.mjs`, wrapping the existing `makeDurandKerner`).

### PR sequence (net-first, one concern per PR, mutation-verified, merge-on-green; BP = behavior-preserving)

(BP = behavior-preserving unless noted.)

| PR | Scope | Status |
|----|-------|--------|
| S0a | QD relabel: button/card say "Export **Riemann map φ**", disclaim σ (labels; bug-report authorized) | ✅ **#235** |
| S0b | CD honors the `antiholomorphic` flag (build on `conjugate(z)`); schema `conj`→`conjugate` | ✅ **#236** |
| S1a | Extract `@cas/core/poly`; repoint QD consumers | ⏸ DEFERRED (reorder) |
| S1b | Extract `@cas/core polynomialRoots`; repoint Direct + inverse | ⏸ DEFERRED (reorder) |
| S2a | NEW `@cas/schwarz` (unbounded-Laurent σ engine lifted from `deltoid.ts`) | ✅ **#237** |
| S2b | Lift full `schwarz-common` σ kernel (11 adapters, Newton, `buildSchwarzFromPhi`, `escapeTime`) | ⏸ DEFERRED (generalize phase) |
| S2c | Lift `schwarz-inverse` (σ⁻¹, preimage tree, limit set); fold monkey-patch into the builder | ⏸ DEFERRED |
| S2d | **QD → `@cas/schwarz`** re-publish adapter (handle-shape compatible) — **highest-risk** | ⏸ DEFERRED |
| S2e | correspondences → `@cas/schwarz` (dedup `deltoid.ts` engine) | ✅ done early in **#237** |
| S3a | `@cas/interchange`: add `form:"schwarz"` + `isMapSpec` case + caps + deltoid σ golden + minor VERSION | ✅ **#238** |
| S3b | QD export: `schwarz-reflection` envelope + "Export **σ**" button **alongside** φ (token granted) | ▶ **NEXT** |
| S4a | **CD reconstructs deltoid σ (CPU)** via `@cas/schwarz`; end-to-end ground truth; `≈` labeling | pending |

**Deferred to separate approvals:** S4b (CD GPU σ — port QD's `FRAG_SRC` GLSL), S5 (non-Laurent families
on the wire, branch-aware continuation through cusps [uncertified — RISKS §3], df64 σ, PQD GPU αth-root).

### Highest-risk step
**S2d** — QD's entire Schwarz UI (`schwarz-ui/paint/render/interaction/forward`) reads `QD.Schwarz`'s exact
handle shape (`{ family, sigma, psi, evalPhi, evalF, isInOmega, escapeR, unbounded, w0, adapter, _phi,
_boundaryPts }`); the re-publish adapter must be byte-compatible, gated by the full existing QD suite +
the browser render net. **(Deferred by the reorder — not the immediate next step.)**

### S3 — execute next (resume here after compaction)

The remaining path to the goal (deltoid σ live in CD). `@cas/schwarz` already exists (S2a, #237) with
`makeUnboundedLaurentSchwarz(c, F) → { evalPhi, evalPhiDeriv, evalF, invertPhi, sigma }` + `escapeTime` +
`pointInPolygon`. For the deltoid, **φ is the existing `laurent` MapSpec** (`c = 1`, `F = [0,0,0.5]`) — no
richer `PhiData` needed yet. Each step is its own net-first PR → `refactor/main`, merge-on-green.

**S3a — `@cas/interchange`: add `form:"schwarz"`** — ✅ **DONE (#238)**; the spec below records what shipped.
(additive; minor `VERSION` bump, stay major 1):
- `packages/interchange/src/schema.ts`: add `interface SchwarzMap { form:"schwarz"; phi: LaurentMap |
  RationalMap; disk:"D"|"D*"; inverse:"newton-dk"; antiholomorphic:true }` to the `MapSpec` union. (Deltoid:
  `phi` = the laurent map, `disk:"D*"` = the exterior.) Full-family `PhiData` is deferred with S2b+.
- `packages/interchange/src/validate.ts`: add `case "schwarz":` to `isMapSpec` (recurse `isMapSpec(v.phi)`;
  `disk` ∈ {"D","D*"}; `inverse` a known string). The existing `schwarz-reflection` kind + its `sigma:
  MapSpec` field already validate — `sigma` now just holds a `form:"schwarz"` map.
- `packages/interchange/src/goldens.ts`: add a **deltoid σ golden** — a `schwarz-reflection` envelope whose
  `sigma` is the `form:"schwarz"` deltoid, plus a frozen `σ(w₀)` value (mirror `QD_TO_CD_DELTOID_PHI_AT_2`).
  Compute it with `makeUnboundedLaurentSchwarz(1, [[0,0],[0,0],[0.5,0]]).sigma(w₀)` from `@cas/schwarz`
  (dev-only import in a script, or hard-code the computed value with a comment showing the derivation).
- Net: encode/decode round-trip + `isMapSpec` accepts the new form + the golden decodes to the frozen σ(w₀).

**S3b — QD "Export σ" button, alongside φ** (behavior change — token granted, decision 2):
- `apps/quadrature-domains/app/schwarz/schwarz-export.mjs`: add `buildSigmaEnvelope(phi, opts)` →
  `{ kind:"schwarz-reflection", payload:{ sigma:{ form:"schwarz", phi:<phiToMapSpec(phi)>, disk, inverse:
  "newton-dk", antiholomorphic:true }, sourceDomain:<the quadrature-domain payload>, conventions:CANONICAL }}`,
  and `exportSigmaDeepLink(phi, loc, opts)` reusing `resolveHandoffBase` (S0/QD-HANDOFF-1 code).
- `apps/quadrature-domains/app/schwarz/schwarz-ui.mjs` `makeOverlaysCard`: add a second button
  **"Export σ (Schwarz reflection) → copy link"** next to the φ button; wire to an `_exportSigma` handler
  mirroring `_exportMap`. Net: extend `schwarz-ui.test.ts` (both buttons present, honest labels) +
  `schwarz-export.test.ts` (the σ envelope round-trips + matches the golden).

**S4a — CD reconstructs the deltoid σ (CPU), the ground-truth milestone** (additive):
- Add `@cas/schwarz` to `apps/complex-dynamics/package.json` deps (`pnpm install`).
- `apps/complex-dynamics/src/interchange/importMap.ts`: `envelopeToMapSpec` already returns the
  `schwarz-reflection` `sigma`. When `sigma.form === "schwarz"`, do **not** call `mapSpecToExpr` (σ is not an
  expr — see §2/§3); instead build the engine from `sigma.phi` via `makeUnboundedLaurentSchwarz` and expose
  a σ evaluator. Render/overlay the σ **escape-time field on the CPU** (a canvas overlay or CPU field is
  fine for this milestone), **`≈`-labeled**, principal exterior branch. Net: the S3a σ golden reproduces
  σ(w₀) through CD's import path. **This is the approved end state (S4a).** S4b (GPU σ) is a separate approval.

**Reference points (file:line anchors gathered by the S2/S3 audits, valid as of 2026-08-07):** interchange
`schema.ts:42-92` (MapSpec union + `schwarz-reflection` kind), `validate.ts:21` (`KNOWN_KINDS`) / `:98-111`
(`isMapSpec`), `goldens.ts` (the sole deltoid-φ golden today); CD `importMap.ts:61-90` (the bridge),
`main.ts:2926-2966` (`importInterchange`). `@cas/schwarz` public API: `packages/schwarz/src/index.ts`.
