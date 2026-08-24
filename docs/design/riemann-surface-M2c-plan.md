# Riemann surfaces M2c — implicit algebraic surfaces `F(w, z) = 0` — implementation plan

> **Status: proposed — awaiting approval.** Extends the Complex Function Plotter's **Riemann** view from
> functions the user can *name* (M1 primitives, M2a/M2b radical expressions) to the **general algebraic curve**
> entered **implicitly** as a bivariate complex polynomial `F(w, z) = 0` — e.g. `w³ − w − z` (the classic
> cusp/fold) or `w² − (z³ − z)` (an elliptic curve, the same surface `√(z³−z)` draws, now from its defining
> equation). This is the natural home for the `@cas/*` machinery M2a/M2b deliberately did **not** need:
> per-vertex root-solving (**`@cas/core` `rootsMonic`**) and, optionally, the exact branch locus
> (**`@cas/exact` `discriminant`**). Specced originally in
> [`riemann-surface-M2-plan.md`](riemann-surface-M2-plan.md#9-m2c--implicit-fw-z--0-input-requested-deferred) §9
> and [ADR-0028](../DECISIONS.md#adr-0028-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing)
> Action Item 4. A new decision (the dependency additions + the input-mode UX) will be recorded as **ADR-0030**,
> drafted on approval. Guardrails: [`../../CLAUDE.md`](../../CLAUDE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) /
> [`../DECISIONS.md`](../DECISIONS.md).

---

## Build progress (living record)

> To be filled as milestones land, on branch `claude/riemann-surface-rendering-fvybo6` (or a fresh branch if
> the current PR has merged). Nothing is built until this plan is approved.

| Milestone | Status | Coverage |
|---|---|---|
| **M2c.0 — spike** | ⛔ not started | `w³ − w − z` end-to-end: coefficient extraction → per-vertex `rootsMonic` → existing `curveMesh` → render. Proves the pipeline + the reuse claim. |
| **M2c.1 — the deliverable** | ⛔ not started | input UX, dispatch, degree/leading-coeff handling, decline rules, honest badges, hover-pick / linked / monodromy / branch-marker carry-over, tests + goldens. |
| **M2c.2 — exact branch locus (optional)** | ⛔ not started | `@cas/exact discriminant` for Gaussian-rational `F` → ramification labeled `=` (vs. the `≈` scan). |

---

## 1. The seam: what M2/M3 already provide (the reuse claim)

M2c is mostly **plumbing into an engine that already exists**. The whole M2/M3 stack is parametrized by a
single enumerator:

```ts
// curveMesh.ts, pickMesh.ts, monodromy.ts, branchPoints.ts all consume this shape:
sheetsAt: (z: Complex) => Complex[]      // the sheet values over a base point
```

- **`buildCurveMesh({ sheetsAt, sheetCount }, view)`** — NPP proximity gluing, adaptive subdivision,
  ramification holes, budget cap. **Unchanged.**
- **`Plot.riemannSheetsAt(z)`** already dispatches: exact for the radical curve path, mesh census for the
  parametric path. M2c adds a third source — the **root-solve** enumerator — behind the same method, so the
  **baked-curve render, the M3.1 hover-pick, the M3.2 linked pane, the M3.3 monodromy explorer, and the M3.4
  branch-point markers all carry over for free.**

So M2c's real new work is narrow: (a) turn a typed `F(w, z)` into per-vertex coefficient lists, (b) solve
them, (c) wire the input + dispatch + honest labels. Crucially — unlike building `P(z,w)` from radical sums
by resultants (M2b's rejected Option B) — a **directly-entered `F` has no spurious branches**: every root of
`F(·, z)` is a genuine sheet. M2c is therefore *cleaner* than the general elimination path, not harder.

## 2. The gap M2c fills

M1/M2a/M2b render every algebraic surface the user can write as a **radical expression**. But most algebraic
curves have **no radical form** (by Abel–Ruffini, a general quintic `w⁵ + z·w + z = 0` has no expression in
radicals) — yet their Riemann surfaces are perfectly concrete. M2c lets the user enter the curve *by its
defining equation*, covering the whole class.

## 3. The method

For a bivariate polynomial `F(w, z) = Σₖ aₖ(z)·wᵏ` (degree `n = deg_w F`):

1. **Coefficient extraction (new, app-local).** Expand the parsed `F` AST into powers of `w`, collecting a
   coefficient AST `aₖ(z)` for each `k = 0 … n`. (`@cas/expr` has `fToRational` for one variable but no
   bivariate collector, so this is a small new `implicitPoly.ts` — an expand-and-collect over `+ − ×` and
   non-negative integer powers of `w`/`z` with constant coefficients. Anything else — division by `w`,
   transcendental, fractional power — makes it decline and fall back.)
2. **Per-vertex roots (`@cas/core`).** At each z-vertex, evaluate the coefficients `aₖ(z)` numerically
   (`makeComplexFn`), then `rootsMonic([aₙ, …, a₀])` → the `n` residual-certified roots = the `n` sheet
   values. This is the `sheetsAt` the existing mesh consumes.
3. **Leading-coefficient zeros.** Where `aₙ(z) = 0` the degree drops and a root escapes to ∞ — a pole/branch
   at infinity. Those vertices yield fewer finite roots; the mesh's existing **local-degeneracy + `wCap`**
   backstop drops them as holes (never a wall), exactly as for the radical paths.
4. **Branch locus.** The local-degeneracy test already resolves ramification (sheets colliding), so M2c.0/.1
   need **no discriminant**. M2c.2 (optional) adds the **exact** locus `disc_w F(z) = 0` via `@cas/exact`
   `discriminant` (Gaussian-rational `F` only) to seed subdivision and label the branch points `=` instead of
   the M3.4 `≈` scan.
5. **Height + colour + everything else:** identical to M2 (charisma height, shared `colorAt`, orbit camera),
   and all of M3's exploration tools ride along via `riemannSheetsAt`.

## 4. Architecture & components (app-local first, ADR-0007)

- **`src/riemann/implicitPoly.ts`** *(new)* — `parseImplicit(ast): { coeffs: Node[]; degreeW: number } | null`:
  expand/collect `F` into coefficient ASTs in `w` (constants only, like M1/M2); decline non-polynomial or
  parametric input.
- **`src/riemann/implicitCurve.ts`** *(new)* — `detectImplicitCurve(ast): ImplicitCurve | null`: recognizes
  an implicit `F(w,z)` (see §6 input decision), builds the `rootsMonic`-backed `sheetsAt`, reports `sheetCount
  = deg_w F` and a label. Declines degree < 2 or > a cap (legibility/perf).
- **`src/render/plot.ts`** — a third `riemannKind: "implicit"` that reuses the **curve** render path
  (`buildCurveMesh` + `buildCurveProgram` — no new shader); `riemannSheetsAt` routes to the root-solver;
  `compileSource` dispatch tries M1 → M2 radical → **M2c implicit**.
- **`main.ts` / `index.html`** — a dedicated **implicit-mode toggle** + its own `F(w,z)` box (§6): entering
  implicit mode switches to and pins the Riemann view and disables the inapplicable view tabs; leaving it
  restores the `f(z)` slot + views. Honest badge (label · `n` sheets · `≈`). New permalink field for the
  implicit source (back-compatible).
- **No new package** for the engine (stays in `src/riemann/`, ADR-0007). **New dependencies:** `@cas/core`
  (`rootsMonic`) — required; `@cas/exact` (`discriminant`) — only if M2c.2 is built.

### 4.1 Convention neutrality (ADR-0006) / honest labeling (guardrail)
- No π/2πi normalization enters `@cas/*`.
- **Roots `≈`** (residual-certified `rootsMonic`); **sheet count `n = deg_w F` exact**; **branch locus `≈`**
  (M3.4 scan) or **`=`** (M2c.2 discriminant). **Genus / connectivity are NOT claimed** (a visualizer, not a
  topology certifier — RISKS §3). Holes / budget cap / degree cap stay badged.

### 4.2 Dependency direction, testing, census
- **Adds `@cas/core` (and optionally `@cas/exact`) to the plotter** — the *first* consumers there, exactly as
  ADR-0028 §9 anticipated. `pnpm dep:check` stays green (packages import downward; no app→app; no cycles).
- **Node tests:** coefficient extraction (`w³−w−z` → `[−z, −1, 0, 1]`), roots satisfy `F(root, z) ≈ 0`,
  `w²−(z³−z)` reproduces the ±√(z³−z) sheet set, decline rules, leading-coeff-zero holes; (M2c.2) discriminant
  of `w²−(z³−z)` = `4(z³−z)` up to units. **Browser goldens:** `w³−w−z` renders non-blank through the real
  Plot. Existing tests (incl. top-down-3D≡2D) stay green; census floor kept.

## 5. Milestones (each gated: `typecheck · lint (+dep:check) · test · build` + browser goldens)

- **M2c.0 spike** — `implicitPoly.ts` + a `rootsMonic` `sheetsAt`; render `w³−w−z` through the existing
  `curveMesh`/Plot. Adds `@cas/core`. Exit: green + findings; **pause**.
- **M2c.1 deliverable** — the dedicated implicit-mode toggle + `F(w,z)` box + view pinning/gating (§6),
  dispatch, degree/leading-coeff handling, decline rules, honest badge, permalink field, all M3 tools verified
  to carry over, node + browser tests. Exit: full gate green; `w³−w−z`, `w²−(z³−z)`, a quintic render
  correctly; **pause for review**.
- **M2c.2 exact branch locus (optional)** — `@cas/exact discriminant` for Gaussian-rational `F`, `=`-labeled;
  falls back to the `≈` scan otherwise. Exit: full gate green; **pause**.

## 6. Input UX — DECIDED: a dedicated implicit-mode toggle (Option C)

**Decision (approved):** enter `F(w, z) = 0` through a **dedicated "Implicit `F(w,z)=0`" mode** — its own
input box and an explicit toggle, kept distinct from the ordinary `f(z)` slots because an implicit relation is
a *different kind of object* (not a function). This is the most discoverable and the most honest about the
mode switch; it costs the most new UI, which is accepted.

Concretely:
- A toggle (alongside the `f` / `g` slot buttons, or in the Riemann controls) switches the input into
  **implicit mode**: the box now reads `F(w, z)` (an implied `= 0`), typeset as `F(w,z) = 0`, with its own
  placeholder/preset (`w^3 - w - z`, `w^2 - (z^3 - z)`, a quintic).
- In implicit mode the only meaningful view is **Riemann** (the 2D/3D/sphere/linked tabs render a single-valued
  `f(z)` and don't apply) — so entering implicit mode **switches to and pins the Riemann view**, and the other
  view tabs are disabled with a short note. Leaving implicit mode restores the ordinary `f(z)` slot + views.
- The implicit source round-trips in the permalink as its own field (back-compatible via `cleanV3d`/state),
  distinct from `exprF`/`exprG`, so a shared implicit figure reopens in implicit mode.

The two alternatives considered and **not** chosen: **(A)** auto-detect any formula referencing `w` (lowest
friction, but silently repurposes the box), and **(B)** an explicit `… = 0` equation in the ordinary box
(uses the parser's compare node, but blurs the function/relation distinction). Both share the same engine; the
dedicated mode was preferred for clarity.

## 7. Risks & mitigations

- **Per-vertex root conditioning / ordering** → `rootsMonic` residual filtering; NPP nearest-match stitch
  already tolerates unordered roots; local-degeneracy backstop + `wCap` for near-branch/∞.
- **Leading-coefficient zeros (degree drop)** → detected per vertex; dropped as holes (badged), never walls.
- **High degree = perf + clutter** → a degree cap (badged), matching the M2 sheet cap philosophy.
- **New dependencies** → `@cas/core`/`@cas/exact` are existing, tested packages; this is the anticipated
  first-consumer moment, not new primitives (north-star preserved).
- **Over-claiming topology** → genus/connectivity never claimed; honest `≈`/`=` labels throughout (RISKS §3).

## 8. ADR

**ADR-0030 (to be written on approval):** the implicit `F(w,z)=0` input mode, the `@cas/core` (+ optional
`@cas/exact`) dependency additions to the plotter (ADR-0028 §9 realized), the reuse of the M2 curve
render/mesh + M3 exploration stack via the `sheetsAt` seam, and the input-UX decision from §6.

## 9. References

[`riemann-surface-M2-plan.md`](riemann-surface-M2-plan.md) §9, [`riemann-surface-research-notes.md`](riemann-surface-research-notes.md)
§2–§3 (NPP gluing, branch points), ADR-0008 (`@cas/exact` resultant/discriminant), ADR-0015 (`@cas/core`
`rootsMonic`), and [`../RISKS.md`](../RISKS.md) §3 (no certified topology).
