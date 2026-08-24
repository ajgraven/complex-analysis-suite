# Riemann surfaces M2 — algebraic-curve surfaces (single-radical class) — implementation plan

> Extends the Complex Function Plotter's **Riemann** view (M1, [`riemann-surface-plan.md`](riemann-surface-plan.md),
> [ADR-0027](../DECISIONS.md#adr-0027-riemann-surface-mode-in-the-plotter-parametrize-by-w-branch-machinery-in-app))
> from single invertible primitives to **algebraic** functions — the class M1 declines because no single
> global inverse exists. M2 renders the true multi-sheeted surface by the **Nieser–Poelke–Polthier /
> Kranich** proximity-gluing algorithm over a triangulated z-domain (research notes §2.2). Delivered:
> **M2a** (single-radical `w = R(z)^(p/q)`, R rational) **and M2b** (arithmetic combinations of radicals —
> sums / products / ratios — via root-of-unity branch injection). **M2c** — a direct implicit `F(w,z)=0`
> (bivariate complex polynomial) input mode — is requested for later and specced in §9.
> New decision recorded as [ADR-0028](../DECISIONS.md#adr-0028-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing).
> Guardrails: [`../../CLAUDE.md`](../../CLAUDE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) /
> [`../DECISIONS.md`](../DECISIONS.md).

---

## Build progress (living record)

> Work lands as small, CI-green commits on branch `claude/riemann-surface-rendering-fvybo6`.

| Milestone | Status | Coverage |
|---|---|---|
| **M2.0 — algebraic-curve spike** | ✅ done | `src/riemann/algebraicCurve.ts` (recognizer) + `src/riemann/curveMesh.ts` (NPP proximity-gluing mesh: `sheetsOf` = the q values of `R^(p/q)`; nearest-match stitch; local near-degeneracy → holes; triangle-budget cap) + `buildCurveProgram` (baked-mesh shader, shared fragment). Node: 9 tests — recognition/decline, `sheetsOf` satisfies `w^q=r^p`, `sqrt(z^2−1)` mesh is two-sheet with holes at ±1, all kept triangles on-sheet (max edge < 0.6, no cut-jump), budget cap badged. Browser: the curve program builds+links in live WebGL2. Findings: NPP proximity gluing works as-is; local degeneracy test alone resolves branch points for polynomial radicands (no deps). Retained as M2.1's foundation. Render-through-Plot + screenshots land at M2.1 (same staging as M0→M1). |
| **M2.1 — R(z)^(p/q) engine (M2a)** | ✅ done | `algebraicCurve.ts` recognition (R rational via `@cas/expr fToRational`); `curveMesh.ts` with **local-degeneracy-driven adaptive subdivision** + ramification holes + triangle-budget cap; `buildCurveProgram` baked-mesh render; `Plot.riemannKind` dispatch (**M1 param preferred**, curve when M1 declines) + curve VBO/framing + `paintRiemannCurve`; `main.ts` auto-select + unified `riemannDescriptor` badge (holes/`⚠ capped` surfaced); mesh rebuilt over the current z-view on mode entry. **No new package deps** — branch points of this class are zeros/poles of R, caught by the local degeneracy test + `wCap` (so `@cas/core rootsMonic` proved unnecessary; it/`@cas/exact` are the M2b tools). **Sync** mesh-gen (fast enough for M2a grids; Web Worker deferred). Node: recognition/decline, `w^q=r^p`, mesh (two-sheet, holes, on-sheet continuity, budget cap). Browser: curve program links; `√(z²−1)` / `√(z³−z)` render non-blank through the real Plot. Verified in the app (screenshots). |
| **M2.1 gate** | ✅ green · pushed | full repo gate green — lint (+dep:check, no new edges) · **386 files / 3234 tests** · build (all apps); browser goldens pass; existing tests (incl. top-down-3D≡2D) unchanged. Pushed. **Paused for review before M2b/M2c.** |
| **M2b — radical sums / products / ratios** | ✅ done | `√z + √(z−1)` (4 sheets), `√(z²−1) + z^(1/3)` (6), `1/√z`, `2·√(z²−1)`, shared-radical dedup. **Not** via `@cas/exact` resultants — instead **root-of-unity branch injection**: the k-th branch of `Rᵢ^(pᵢ/qᵢ)` is its principal value × `ωᵢ^{pᵢk}`, so every sheet is the principal expression with a constant factor at each radical node; `detectAlgebraicCurve` enumerates all `∏qᵢ` combos (cap 16, structurally-equal radicals deduped) as ASTs, reusing `makeComplexFn`. Exact, spurious-branch-free, **still no new deps**. The `curveMesh` was generalized to a `sheetsAt` spec (subsumes M2a). |
| M2c — implicit `F(w,z)=0` input mode (bivariate complex polynomial) | ⛔ deferred | requested for later; see §9 |

---

## 1. The seam: what M1 already provides

M1 built the `riemann` render mode, the orbit camera + framing, the shared `colorAt` coloring, the honest
badge, the permalink extension, and the pointer/keyboard nav — all reusable. M1 parametrizes the surface
by the value plane (a smooth grid); M2 keeps everything **except** the geometry source: instead of a
parametric grid it uploads a **baked, indexed mesh** (world positions + a per-vertex value `w` for
`colorAt`) generated on the CPU/worker. So the delta is a mesh builder + a second render path + a
recognizer — no new camera, coloring, or UI scaffolding.

## 2. The gap M2a fills

M1 recognizes `w = A·P(α z + β) + B` — one primitive of an **affine** inner. It declines the moment the
inner is nonlinear or the map couples radicals: `sqrt(z^2−1)`, `sqrt(z^3−z)`, `(z^2−1)^(1/3)`,
`sqrt((z−1)/(z+1))`. These are **algebraic functions**; their Riemann surfaces are the classical objects.
M2a covers the **single-radical** subclass — one fractional power of a rational function — which is large,
high-value, and free of the elimination pathologies that make general algebraic curves hard.

## 3. The method (M2a): NPP proximity gluing, sheets as roots-of-unity

For `w = R(z)^(p/q)` (lowest terms, `q ≥ 2`, R rational with constant coefficients), the `q` sheet values
over a point z are **elementary** — the `q` distinct values of `R(z)^(p/q)`:

```
r = R(z);   w_k = |r|^(p/q) · exp( i · p · (arg r + 2π k) / q ),   k = 0 … q−1
```

so there is **no per-vertex polynomial solve** (that is M2b's general-`P` path). The mesh:

1. **Triangulate** the z-domain over the view rectangle (uniform seed).
2. **Per vertex:** evaluate `R(z)` (`@cas/expr makeComplexFn` of the radicand) → the `q` sheet values above.
3. **Proximity-stitch:** for each domain triangle, for each sheet, connect the nearest sheet-value across
   its three vertices (argmin `|w_i − w_j|`) → `q` surface triangles. Valid where `w(z)` is continuous
   (a.e.).
4. **Branch points** = zeros of `R` and its poles (zeros of N and D of `R = N/D`) whose order isn't a
   multiple of `q`. Found exactly-in-structure via `@cas/core rootsMonic` on N and D
   (`@cas/expr fToRational` gives N, D). Domain triangles near a branch point are **adaptively subdivided**
   (up to a max depth); a triangle that still straddles a ramification point is **dropped** (a hole that
   shrinks with depth — the cut is never a wall). A **local** near-degenerate test (min sheet separation
   small relative to edge length) is the backstop that also catches anything the branch-point list misses.
5. **Height = Re w** (charisma); **color = `colorAt(w)`**. Self-intersections are honest 4D→3D projection
   artifacts (research notes §2.2).
6. **Performance:** mesh-gen (the cost) runs in a **Web Worker**; the result is cached, so rotate / change
   height axis / re-color are instant. A **triangle-budget cap** bounds work; if hit, it is **badged**
   (honest — never a silent truncation).

M2.0 (the spike) uses only steps 1–3 + the **local** degeneracy test of step 4 (so `sqrt(z^2−1)`, a
polynomial radicand whose only branch points are the radicand's zeros, needs no root solver) — proving the
worker → baked-mesh → render pipeline with **zero new deps**. M2.1 adds the `@cas/core` branch-point
location for robust handling of rational radicands (poles) and cleaner subdivision.

## 4. Architecture & components (app-local first, ADR-0007)

> **As built (M2a + M2b):** the components below match the code, with these refinements found during the
> build (see the progress table + ADR-0028): `detectAlgebraicCurve` returns **one `sheetExpr` AST per branch
> combo** (root-of-unity injection) rather than `(p,q)` + a solver; `curveMesh` takes a `sheetsAt` spec (not
> `{R,p,q}`); **no Web Worker** (sync mesh-gen is fast enough) and **no `@cas/core`/`@cas/exact`** (the local
> degeneracy test + `wCap` resolve branch points). Those two remain the M2c tools (§9).

- **`src/riemann/algebraicCurve.ts`** — `detectAlgebraicCurve(ast): AlgebraicCurve | null`: recognizes an
  arithmetic combination (`+ − × ÷`, integer powers) of radicals `Rᵢ^(pᵢ/qᵢ)` (each `Rᵢ` rational, no live
  parameters); structurally dedups shared radicals, enumerates the `∏qᵢ` branch combos (cap 16) as
  `sheetExprs` ASTs. Declines transcendental / nested / parametric maps (→ fall back to M1 / principal).
- **`src/riemann/curveMesh.ts`** — pure NPP mesh builder (triangulate / sheets / proximity-stitch /
  subdivide / holes / budget cap); returns `{ positions: Float32Array, values: Float32Array, indices:
  Uint32Array, meta }`. Unit-tested headless.
- **`src/riemann/curveMesh.worker.ts`** — runs the builder off the main thread; posts the typed arrays back
  (transferable). A synchronous fallback path keeps it testable in node.
- **`render3d/riemannSurface.ts`** — a `buildCurveProgram` variant: attributes `aPos` (vec3 world) + `aW`
  (vec2 value), `colorAt(aW)` fragment + geometric normal. (The M1 parametric program stays.)
- **`render/plot.ts`** — `riemannKind: "param" | "curve"`; the curve path owns a VBO/IBO uploaded from the
  worker mesh; `paintRiemann` dispatches on `riemannKind`. Framing reuses the M1 orbit camera, fed by the
  baked mesh's bounds.
- **`main.ts`** — auto-select: **M1 param preferred** (cleaner/exact for single primitives); the curve
  path is offered when M1 declines but `detectAlgebraicCurve` succeeds; else principal-branch only. The
  existing height-source / reset controls apply; the badge names the curve, `q` sheets, branch points, and
  the honest labels. A worker-busy indicator covers mesh-gen.
- **`state/viewState.ts`** — the `riemann` mode already round-trips; add nothing unless a curve-specific
  control appears (sheet count is fixed = `q` for M2a, so likely no new field).

### 4.1 Convention neutrality (ADR-0006)
No π / 2πi normalization enters `@cas/*`. The only constants are geometric (mesh thresholds), app-side.

### 4.2 Honest labeling (guardrail, first-class)
- Sheets are the exact `q`-th powers of `R(z)` — `≈` at the float level, but the **sheet count and gluing
  topology are exact** (a proven property of `w^q = R^p`).
- Branch-point coordinates are `≈` (residual-certified `rootsMonic` roots); the *fact* that they are
  branch points (zeros/poles of R with order ∤ q) is structural/exact.
- **Ramification holes**, **max subdivision depth**, and any **triangle-budget cap** are surfaced in the
  badge — never silent. The mode is offered only for a recognized algebraic curve; else "principal-branch
  only". No unlabeled cliff.

### 4.3 Dependency direction, testing, census
- **No new package deps (revised at M2.1).** M2a's branch points are exactly the zeros/poles of R, which
  the mesh's local degeneracy test (`minSep → 0`) and `wCap` catch directly — so `@cas/core rootsMonic`
  proved unnecessary and was not pulled. **`@cas/core` / `@cas/exact` remain the M2b tools** (per-vertex
  root-solving + bivariate elimination/discriminant for radical sums / general `P(z,w)=0`). The plotter's
  dependency set is unchanged; `pnpm dep:check` stays green; no app imports another app; no cycles.
- **Node tests:** recognition/decline; sheet values satisfy `w^q = R^p`; proximity continuity on a known
  curve; mesh invariants (sheet count, hole near a branch point, budget-cap flag); worker builder parity
  with the sync path. **Browser tests:** the curve program links; `sqrt(z^2−1)` renders non-blank with
  two sheets meeting at ±1. Existing tests (incl. top-down-3D≡2D) stay green; test-census floor kept.

## 5. Milestones (each gated)

Each gate: **`pnpm typecheck` · `pnpm lint` (+`dep:check`) · `pnpm test` · `pnpm build`** + browser
goldens + a headless render check.

- **M2.0 — spike.** `sqrt(z^2−1)` through the full new pipeline (recognizer → worker mesh → baked-mesh
  render), local degeneracy test only, zero new deps. Exit: green + findings recorded here.
- **M2.1 — R(z)^(p/q) (the deliverable).** The full §4 feature: rational radicands, `@cas/core`
  branch points, subdivision + holes + budget cap, dispatch + auto-select, honest badges, node + browser
  tests. Exit: full gate green + goldens; `sqrt(z^2−1)` / `sqrt(z^3−z)` / `(z^2−1)^(1/3)` /
  `sqrt((z−1)/(z+1))` render correctly; **pause for review**.
- **M2b — done (radical sums / products / ratios).** Root-of-unity branch injection (§4 As-built),
  generalizing the recognizer + `curveMesh` `sheetsAt` spec; no resultants, no new deps. Exit: full gate
  green + goldens; `√z + √(z−1)` (4 sheets), `√(z²−1) + z^(1/3)` (6) render correctly.
- **M2c — deferred (requested).** A direct implicit `F(w,z)=0` (bivariate complex polynomial) input mode —
  the first place per-vertex root-solving (`@cas/core`) and exact discriminant (`@cas/exact`) are actually
  needed. Specced in §9; separate approval + follow-on ADR.

## 6. Risks & mitigations

- **Root/pole conditioning near branch points** → `rootsMonic` residual filtering + subdivision + the
  local degeneracy backstop.
- **Proximity mis-stitching when a branch point sits inside a triangle** → discriminant-free branch-point
  list + local test drive subdivision; unresolved cells become holes (badged), never walls.
- **Performance / mesh size** → Web Worker + cache + triangle-budget cap (badged if hit).
- **Irrational / parametric coefficients** → M2a requires constant, rational-expressible radicands (same
  constant-only discipline as M1); otherwise it declines and falls back honestly.
- **Overlap with M1** → dispatch prefers M1's exact parametric surface; the curve path only takes maps M1
  declines, so `sqrt(z)` stays on the cheaper, exact M1 path.

## 7. ADR

[ADR-0028](../DECISIONS.md#adr-0028-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing):
the algebraic-curve method (NPP proximity gluing), the M2a single-radical scope + the roots-of-unity sheet
specialization (vs. general per-vertex root-solving, deferred to M2b), the `@cas/core` dependency, and the
continued deferral of `@cas/exact`-based elimination (M2b) and multivalued interchange (ADR-0005).

## 8. References

See [`riemann-surface-research-notes.md`](riemann-surface-research-notes.md) §2.2 (Nieser–Poelke–Polthier /
Kranich proximity gluing, adaptive subdivision at `disc_w P = 0`, Re-w height) and §3 (branch points as
zeros/poles of the radicand).

## 9. M2c — implicit `F(w, z) = 0` input (requested; deferred)

A future want: let the user enter an **implicit bivariate complex polynomial** `F(w, z) = 0` directly and
render its Riemann surface — the general algebraic curve, beyond what any radical expression can name (e.g.
`w^3 − w − z = 0`). This is the natural home for the `@cas/*` machinery M2a/M2b did **not** need:

- **New input affordance:** an "implicit `F(w,z)=0`" entry mode (a second box, or an `=0` right-hand side),
  parsed as a polynomial in the two variables `w`, `z` (constant / Gaussian-rational coefficients).
- **Sheets = all roots per vertex:** at each z-vertex, solve `F(·, z) = 0` for all `n = deg_w F` roots via
  **`@cas/core` `rootsMonic`** (residual-certified) — the general case where the roots are genuinely coupled
  (no closed form), so the root-of-unity shortcut does not apply. Feed them to the existing `curveMesh`
  `sheetsAt` spec unchanged — the NPP proximity gluing, subdivision, holes, and render all carry over.
- **Exact branch locus:** `disc_w F(z)` via **`@cas/exact`** (Bareiss) gives the exact ramification locus
  to seed subdivision (labeled `=`), improving on the local-degeneracy backstop for high-degree curves.
- **Honest labeling:** roots `≈` (residual-certified); branch locus `=`; holes / budget cap badged; `n`
  from `deg_w F`. Genus / connectivity are *not* claimed (a viz, not a topology certifier — RISKS §3).
- **Bridge from M2a/M2b:** the radical recognizer could optionally *emit* an `F(w,z)` (via `@cas/exact`
  resultant elimination) so both paths share the implicit engine — but that is an internal unification, not
  required for the user-facing implicit mode.

Deferred pending approval; it warrants its own ADR (the `@cas/core` + `@cas/exact` dependency additions and
the input-mode UX) and is the recommended next algebraic step after M3.
