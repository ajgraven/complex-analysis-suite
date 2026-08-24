# Riemann surfaces M3 — exploration tools (hover-pick · linked base-plane · monodromy) — implementation plan

> Extends the Complex Function Plotter's **Riemann** view (M1 parametric primitives + M2 algebraic curves,
> [`riemann-surface-plan.md`](riemann-surface-plan.md) / [`riemann-surface-M2-plan.md`](riemann-surface-M2-plan.md),
> [ADR-0027](../DECISIONS.md#adr-0027-riemann-surface-mode-in-the-plotter-parametrize-by-w-branch-machinery-in-app) /
> [ADR-0028](../DECISIONS.md#adr-0028-algebraic-curve-riemann-surfaces-m2a-single-radical-npp-proximity-gluing))
> from **rendering** the surface to **exploring** it: read the multi-sheeted value under the cursor
> (**M3.1**), see the branch point / cut structure on a linked base-plane pane (**M3.2**), and trace how a
> loop in the base plane permutes the sheets (**M3.3**, the monodromy explorer — honestly `≈`, opt-in, and
> confined so the never-certified continuation-through-collisions problem [`../RISKS.md`](../RISKS.md) §3
> never leaks into the rest of the tool). Colour polish (**M3.4**) is foldable anywhere and is **not** in
> this pass's ordering. New decision recorded as
> [ADR-0029](../DECISIONS.md#adr-0029-riemann-surface-exploration-tools-m3-hover-pick-linked-base-plane-monodromy).
> Guardrails: [`../../CLAUDE.md`](../../CLAUDE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) /
> [`../DECISIONS.md`](../DECISIONS.md).
>
> Approved scope for this pass: **M3.1 + M3.2 first, then M3.3.** M3.4 and M2c (implicit `F(w,z)=0`,
> [M2 plan §9](riemann-surface-M2-plan.md#9-m2c--implicit-fw-z--0-input-requested-deferred)) stay deferred.

---

## Build progress (living record)

> Work lands as small, CI-green commits on branch `claude/riemann-surface-rendering-fvybo6`.

| Milestone | Status | Coverage |
|---|---|---|
| **M3.1 — multi-sheet hover-pick value inspector** | ✅ done | `src/riemann/pickMesh.ts` (pure geometry): one uniform `PickMesh` (`xy`, `w`, height-basis `hb`) for BOTH render paths; `pickRiemannSurface` = double-sided Möller–Trumbore nearest hit + point-in-triangle sheet census → `{ z, w, sheetCount, sheetIndex }`; `buildParamPickMesh` (M1) + `pickMeshFromCurve` (M2). `Plot`: caches the curve arrays, lazily samples the param pick mesh (`paramPickDirty`), shares `riemannCamera()` with the paint, `pickRiemann(clientX, clientY, rect)`. `main.ts`: `updateProbeRiemann` fills the readout (`z`/`w`/`\|w\|`/`arg w`, all `≈`) + the new **sheet** row (`k / N`, local ordinal); shown only in the Riemann view. Node: 7 tests (single/stacked-sheet ray-cast, height-axis flip, miss/empty → null, √(z²−1) curve mesh = 2 sheets, param √z = 2 sheets). |
| **M3.1 gate** | ✅ green · pushed | full repo gate green — typecheck · lint (+dep:check, **no new edges**) · **387 files / 3244 tests** · build (all apps); plotter browser goldens (37) pass; existing tests (incl. top-down-3D≡2D) unchanged. |
| **M3.2 — linked base-plane pane** | ✅ done | a **"Base-plane pane"** toggle splits the Riemann view: the flat base-plane portrait (left) beside the surface (right), scissored like `paintLinked`. **Bidirectional hover-linking**: picking the surface marks the touched sheet's base point on the base plane (a crosshair); hovering the base plane reads the principal value there and marks it. `Plot`: `riemannLinked`, parameterized `paintRiemann*(vx,vy,vw,vh)` + `paintRiemannLinked`, `frameRiemannBaseView` (frames the base pane to the parametric surface's z-extent; the curve mesh already spans `view`). `main.ts`: pane-aware `effMode`/rects + `navMode` (drag/wheel orbit the surface from either pane), a light left-pane overlay (divider + label + crosshair), permalink `riemannLinked` (back-compat). **Branch-point markers deferred to M3.4** (honest branch-point *location* — `≈`/`=` per path, dedup — pairs with the colour/legibility polish; the linked-pane + hover-correspondence is the headline and stands alone). Browser golden: the linked split renders real structure in both panes + differs from surface-only. |
| **M3.2 gate** | ✅ green · pushed | full repo gate green — typecheck · lint (+dep:check, **no new edges**) · **387 files / 3244 tests** · build (all apps); plotter browser goldens (38, +1 linked) pass; existing tests unchanged. |
| **M3.3 — monodromy explorer** | ✅ done | an **opt-in** "Monodromy explorer" toggle (auto-enables the base-plane pane): drag a closed loop on the base plane and the sheet **permutation** is estimated by nearest-match continuation and reported in cycle notation. New pure engine `src/riemann/monodromy.ts` (`computeMonodromy(sheetsAt, loop)` — arc-length resample + nearest-match track + cycle decomposition + confidence flags: gap-min, single-step jump ratio, count-drift, bijection check). `Plot.riemannSheetsAt(z)` is the enumerator — **exact** for algebraic curves (evaluate every branch combo), a **mesh census** (`sheetsOverZ`) for parametric primitives — behind `Plot.computeRiemannMonodromy(loop)`. `main.ts`: loop-draw on the base pane (pointer path), overlay loop rendering, and a result line. **Fenced per RISKS §3**: `≈`, low-confidence-flagged, and **quarantined** — never in the badge, the permalink, or any export. Node: 10 tests (√z→2-cycle, z^(1/3)→3-cycle, non-enclosing→identity, through-branch→low-confidence, single-valued/degenerate→null, resample; **real √(z²−1)** enumerator: one branch point→transposition, both→identity). |
| **M3.3 gate** | ✅ green · pushed | full repo gate green — typecheck · lint (+dep:check, **no new edges**) · **388 files / 3254 tests** · build (all apps); plotter browser goldens (38) pass; existing tests unchanged. **M3 (approved scope) complete.** |
| M3.4 — colour / legibility polish | ⛔ deferred (unordered) | per-sheet tint option, cut-shadow, sheet-count legend, **branch-point markers** (moved here from M3.2) — foldable anywhere; not in this pass. |

---

## 1. The seam: what M1 + M2 already provide

The Riemann view is complete as a **renderer**: `Plot.mode "riemann"` dispatches to a parametric surface
(M1 — a grid over the value plane, `z = gZFn(t)`, charisma from the uniformizer `t`) or a baked
algebraic-curve soup (M2 — CPU `buildCurveMesh` positions + per-vertex `w`), through one orbit camera
(`render3d/camera.ts`), coloured by the shared `colorAt`, with an honest form/monodromy/cut badge
(`riemannDescriptor`) and a forward-compatible permalink. M3 adds **no new geometry and no new packages** —
it reads the geometry that is already there.

Two reusable pieces do most of the work:

- **Ray pick** (`render3d/pick.ts`, `pickHeightField`) inspects the 3D **landscape** by ray-marching a
  *single-valued* height field `z = h(re, im)`. A Riemann surface is **multi-valued** in `(re, im)` (that is
  the whole point — sheets stack over the same base point), so the height-field march cannot be reused; M3.1
  adds a **triangle-mesh ray-cast** instead. The camera / NDC / world-ray math is shared in spirit with
  `pick.ts` (same perspective ray construction).
- **Split viewports** (`Plot.paintLinked`) already draw the 2D portrait and the 3D landscape side by side,
  scissored, both from the same `view`. M3.2 reuses exactly this scaffold, pairing the flat base plane with
  the Riemann surface.

## 2. The gap M3 fills

The surface is beautiful but **mute**: you cannot ask "what value is *this* point?", you cannot see where
the branch points sit relative to the sheets, and you cannot watch a loop swap sheets — the three things a
Riemann surface is *for*. M3 makes it interrogable, in increasing order of subtlety and risk:

1. **M3.1 hover-pick** — the value inspector the 2D and 3D views already have (catalog H1), now honest on a
   self-overlapping multi-sheet surface. **Low risk** (pure geometry, no continuation).
2. **M3.2 linked base-plane** — spatial context: which base point is under the sheet you're touching, and
   where the ramification lives. **Low risk** (reuses `paintLinked`).
3. **M3.3 monodromy** — the genuinely subtle one. Analytic continuation around a loop is the
   never-certified operation the repo flags (RISKS §3). M3 does it as an **explicitly labeled estimate**,
   in an **opt-in** explorer, so it can never masquerade as certified structure.

## 3. M3.1 — multi-sheet hover-pick (the method)

**Problem.** The surface overlaps itself in the base plane, so "the value under the cursor" is the value of
the **front-most sheet the eye actually sees**, not a base-plane lookup. This needs a real ray-cast against
the drawn triangles, with self-occlusion resolved by depth.

**One uniform pick mesh for both paths.** Both render paths reduce to a CPU triangle soup of vertices
carrying three complex quantities:

| per-vertex | M1 parametric | M2 baked curve |
|---|---|---|
| `xy` = world `(Re z, Im z)` | `z = gZFn(t)` on a grid over the `t`-window | `positions` from `buildCurveMesh` |
| `w` = value (colour + readout) | `w = gWFn(t)` | `values` from `buildCurveMesh` |
| `hb` = **height basis** | the uniformizer `t` | the value `w` |

The world height of a vertex is `(heightSource == Im ? hb.im : hb.re) · heightScale` — **exactly** the
shader's law (`riemannSurface.ts`: param lifts by `t`, curve lifts by `w`), so storing `hb` lets the pick
recompute height without a mesh rebuild when the height axis / exaggeration changes (matching the render's
live-uniform behaviour). The M2 arrays are **cached** from the existing `buildCurveMesh` (they were
uploaded-and-discarded before); the M1 mesh is **sampled** on the CPU with `makeComplexFn(zFromT/wFromT)`
over the current `t`-window at a fixed modest grid.

**The pick** (`riemann/pickMesh.ts`, pure geometry — no DOM/GL, unit-tested):

1. **Ray-cast.** Build a world ray from the orbit camera + cursor NDC (perspective, same construction as
   `pick.ts`). Möller–Trumbore against every triangle (double-sided — projected sheets face both ways); keep
   the **nearest** positive hit. Barycentric-interpolate `xy` → `z_hit` and `w` → `w_hit`.
2. **Sheet census.** A vertical line at `z_hit` pierces the surface once per sheet, each piercing inside one
   triangle whose `xy`-projection contains `z_hit`. Scan the mesh for those triangles, barycentric-interpolate
   `w` at `z_hit` in each → the set of sheet values over `z_hit`; cluster near-equals → `N` distinct;
   the hovered sheet's ordinal `k` = rank (by `arg`, then `|·|`) of the value nearest `w_hit`.

`N` and `k` are a **local branch ordinal** — well-defined at this `z`, exactly computable from the drawn
mesh, and genuinely useful ("you're on branch 2 of 3 over this point"). It is *not* a global sheet number:
global numbering is exactly what monodromy permutes (M3.3), so M3.1 never claims one. Near a branch point
sheets merge and `N` honestly drops (they really do coincide there). Everything is resolution-limited, so
the whole readout is labeled `≈`.

**Wiring.** `Plot.pickRiemann(clientX, clientY, rect)` returns `{ z, w, sheetCount, sheetIndex } | null`;
`main.ts` formats it into the existing cursor-readout `dl.probe` (its `z / f(z) / |f| / arg f` rows map
one-to-one to `z / w / |w| / arg w`) plus one extra **sheet** row shown only in the Riemann view. The hover
handler's current `renderProbe(null)` for Riemann mode is replaced by this pick.

## 4. M3.2 — linked base-plane pane

> **As built:** a **"Base-plane pane"** toggle (`plot.riemannLinked`), not a new top-level view mode — less
> invasive and discoverable in context. The Riemann-linked split draws the flat base-plane portrait
> (`paint2D`) on the left, the Riemann surface on the right, scissored like `paintLinked`. **Bidirectional
> hover-linking**: a pick on the surface marks the touched sheet's base point `z` on the flat pane with a
> crosshair; hovering the flat pane reads the principal value there and marks it. The base pane reads
> `plot.view` — the curve mesh is already built over it, and `frameRiemannBaseView` frames it to the
> parametric surface's z-extent. Drag/wheel orbit the surface from either pane (`navMode`); only hover is
> pane-specific (`effMode`). Reuses `paintLinked`'s viewport plumbing, the `leftHalf`/`rightHalf` rects, and
> `effMode` dispatch in `main.ts`. No new engine, no new package.
>
> **Branch-point markers were deferred to M3.4.** Honest branch-point *location* is its own mini-problem
> (per-path method, `≈`/`=` labeling, dedup) and pairs naturally with the colour/legibility polish; the
> linked pane + hover-correspondence is the headline and is complete without them. (Precedent: the existing
> 2D↔3D linked mode carries no overlay markers either.)

## 5. M3.3 — monodromy explorer (sketch, formalized at build)

An **opt-in** mode: drag a closed loop in the base plane; sample it densely; continue each of the `N` sheet
values around the loop by **nearest-match** step-to-step (the same proximity principle as M2's gluing);
report the permutation the sheets return in (a cycle notation). Explicitly `≈` and **uncertified** — near a
branch point the nearest-match can hop (RISKS §3), so the explorer flags low-confidence steps and never
writes a monodromy claim into the badge, the permalink, or any export. Confined to its own panel so nothing
elsewhere inherits the uncertainty.

## 6. Architecture & components (app-local, ADR-0007)

- **`src/riemann/pickMesh.ts`** *(new, M3.1)* — pure geometry: the `PickMesh` type (`xy`, `w`, `hb` flat
  arrays + `triangleCount`), `buildParamPickMesh(zFromT, wFromT, window, grid)`, and
  `pickRiemannSurface(mesh, ray, heightSource, heightScale)` → `{ z, w, sheetCount, sheetIndex } | null`
  (Möller–Trumbore nearest hit + point-in-triangle sheet census). No DOM/GL — unit-tested headless.
- **`src/render/plot.ts`** — cache the M2 curve arrays (`positions`/`values`) for the pick; build/refresh the
  M1 param pick mesh on form change / reframe; add `pickRiemann(clientX, clientY, rect)` that builds the ray
  from the Riemann orbit camera and calls `pickRiemannSurface`.
- **`src/main.ts`** — a `renderRiemannProbe(hit)` path; hover in Riemann mode calls `plot.pickRiemann` and
  fills the readout + the new sheet row (`≈`); blanks it off-surface.
- **`index.html`** — one extra `dl.probe` row (`<dt>sheet</dt><dd id="pbranch">`), shown only in the Riemann
  view.
- **`state/viewState.ts`** — no change for M3.1 (the pick is transient, like the 2D/3D cursor readout).
  M3.2/M3.3 may add a mode string / opt-in flag (formalized then, kept back-compatible via `cleanV3d`).

### 6.1 Convention neutrality (ADR-0006)
No π / 2πi normalization enters `@cas/*`. The pick is geometry; constants are geometric thresholds, app-side.

### 6.2 Honest labeling (guardrail, first-class)
- The hover value `w`, `|w|`, `arg w` are **`≈`** (barycentric-interpolated from a finite mesh), matching how
  the surface itself is drawn.
- The branch ordinal `k / N` is a **local** ordering — labeled as such (the hint notes monodromy, M3.3, is
  what permutes sheets globally); never presented as a global sheet identity.
- M3.3's monodromy permutation is **`≈` and uncertified**, opt-in, and quarantined from the badge / permalink
  / exports (RISKS §3).

### 6.3 Dependency direction, testing, census
- **No new package deps.** M3 reads existing geometry; `pnpm dep:check` stays green; no app imports another
  app; no cycles. `pickMesh.ts` is app-local (ADR-0007: no second consumer).
- **Node tests** (`test/riemann-pick.test.ts`): Möller–Trumbore hits a hand-built triangle at the known
  point; a two-flat-sheet mesh returns the **nearer** sheet with `sheetCount = 2` and the correct ordinal; a
  ray that misses returns `null`; the M2 `sqrt(z^2-1)` curve mesh → `PickMesh` gives `sheetCount = 2` over a
  generic base point and `1` (merged) near a branch point; the param `√z` pick mesh round-trips a known point.
- **Browser tests:** unchanged — the pick is pure CPU. Existing riemann/curve render goldens (and the
  top-down-3D≡2D golden) stay green; the test-census floor is kept.

## 7. Milestones (each gated)

Each gate: **`pnpm typecheck` · `pnpm lint` (+`dep:check`) · `pnpm test` · `pnpm build`** + browser goldens.

- **M3.1 — hover-pick (this deliverable).** `pickMesh.ts` + `Plot.pickRiemann` + `main.ts` readout + the
  sheet row; node tests; both render paths. Exit: full gate green; hovering √z / `√(z²−1)` / `log z` reads
  the correct on-surface value and a sane branch ordinal; **pause for review**.
- **M3.2 — linked base-plane.** The Riemann-linked split + hover-linking + branch-point markers. Exit: full
  gate green + a golden; **pause for review**.
- **M3.3 — monodromy explorer.** Opt-in loop-drag + nearest-match continuation + permutation readout, `≈`
  and confined. Exit: full gate green; the `√z` loop reports the 2-cycle, `z^(1/3)` the 3-cycle; **pause**.

## 8. Risks & mitigations

- **Self-occlusion / picking the wrong sheet** → real depth-sorted ray-cast (nearest hit), not a base-plane
  lookup; double-sided triangles (projected sheets face both ways).
- **Pick cost on a large M2 mesh** → the hover is already throttled; the census is O(triangles) point-in-
  triangle, fine for M2a/M2b grids; a spatial index is a later optimization if a mesh ever gets huge.
- **Branch-ordinal instability near ramification** → sheets genuinely merge there; `N` drops honestly and the
  readout is `≈`. No global numbering is claimed (that is M3.3's subject).
- **Monodromy over-claim (M3.3)** → opt-in, `≈`, low-confidence flags, quarantined from badge/permalink/export
  (RISKS §3). This is the one place the plan deliberately buys usefulness at the cost of certification, and
  fences it accordingly.

## 9. ADR

[ADR-0029](../DECISIONS.md#adr-0029-riemann-surface-exploration-tools-m3-hover-pick-linked-base-plane-monodromy):
the M3 exploration tools — the uniform pick-mesh + triangle ray-cast (vs. reusing the single-valued
height-field march), the local-branch-ordinal readout (vs. a global sheet number), reuse of `paintLinked`
for the base-plane pane, and the confinement of the `≈`/uncertified monodromy explorer (RISKS §3). No new
packages (ADR-0007); convention-neutral (ADR-0006); permalink stays back-compatible.

## 10. References

[`riemann-surface-research-notes.md`](riemann-surface-research-notes.md) §2 (parametrize-by-w + NPP gluing),
§3 (branch points as zeros/poles of the radicand), and [`../RISKS.md`](../RISKS.md) §3 (analytic continuation
through collisions is never certified — the fence M3.3 respects).
