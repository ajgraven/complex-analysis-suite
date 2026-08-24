# Riemann-surface rendering in the Complex Function Plotter — implementation plan

> Adds a **true multi-sheeted Riemann-surface** view to `apps/complex-function-plotter`, with honest
> branch-cut handling, built entirely on top of the app's existing engine. The headline method is
> **parametrize-by-w** (sample the value plane, invert `z = g(w)`, lift by a real "charisma" coordinate),
> which glues the sheets automatically — no branch-tracking, and never the never-certified
> continuation-through-collisions problem the repo flags in [`../RISKS.md`](../RISKS.md) §3. This is the
> *how*; the *why* + the literature/ground-truth corpus are in the companion
> [`riemann-surface-research-notes.md`](riemann-surface-research-notes.md). The new decision (the mode +
> the two-method choice + keeping the machinery in-app) is recorded as
> [ADR-0027](../DECISIONS.md#adr-0027-riemann-surface-mode-in-the-plotter-parametrize-by-w-branch-machinery-in-app).
> Guardrails: [`../../CLAUDE.md`](../../CLAUDE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) /
> [`../DECISIONS.md`](../DECISIONS.md).
>
> Mirrors the suite runbook style ([`../MIGRATION.md`](../MIGRATION.md)): **phase gates that are each
> shippable, a motivating win early, a ground-truth check per phase, test-guarded changes.** Nothing here
> re-litigates a locked ADR. Approved scope for this pass: **M0 + M1**; M2/M3 are specced but deferred to
> a later, separately-approved push.

---

## Build progress (living record)

> Filled as milestones land, so a resumed session knows where to pick up. Work lands as small, CI-green
> commits on branch `claude/riemann-surface-rendering-fvybo6`.

| Milestone | Status | Coverage |
|---|---|---|
| **M0 — parametrize-by-w de-risk spike** | ✅ done | `src/riemann/inverse.ts` registry + `src/render3d/riemannSurface.ts` shader. Node: 22 tests — recognition/rejection, inverse geometry satisfies each primitive's defining equation (w²=z, eʷ=z, sin w=z, wᵍ=zᵖ) via `makeComplexFn`, √z two-sheet ±Re-w interlock, log Im-w helicoid (z=1 at h=0 and 2π), affine wraps. Browser: the parametrize-by-w program builds+links in live WebGL2 for √, ⁿ√, `z^(p/q)`, arcsin/arccos/arctan, affine forms. Findings: architecture holds unchanged — retained as M1's foundation (not throwaway) |
| **M1 — parametrize-by-w Riemann-surface mode** | ⏳ pending | new `Plot.mode "riemann"` + `paintRiemann`; inverse registry (√, ⁿ√, `z^(p/q)`, log, arcsin/arccos, arctan + affine wrap); height-source (Re w / Im w); sheet-count control (badged truncation); coloring parity + enhanced portraits; camera orbit/dolly; auto-detect + honest badge; permalink extension; node + browser tests |
| **M1 gate** | ⏳ pending | full gate green (typecheck · lint +dep:check · test · build + browser goldens); existing tests incl. top-down-3D≡2D unchanged; pushed; **pause for review** |
| M2 — algebraic-curve surfaces (Kranich proximity gluing) | ⛔ deferred | later, separately-approved |
| M3 — monodromy explorer + polish | ⛔ deferred | later, separately-approved |

---

## 1. The seam: what the plotter already provides

The plotter is a WebGL2 app whose whole render + evaluation stack is reusable, so a Riemann-surface mode
is *additive geometry*, not a new engine.

- **Expression → GLSL and → JS closures** (`@cas/expr`): `compileF(ast, name, { params })` emits a
  `cvec name(cvec z, cvec c)` GLSL function; `makeComplexFn(ast, params)` builds the CPU twin. Both drive
  the same map — the dual-backend contract. (`packages/expr/src/glsl.ts`, `.../evaluate.ts`.)
- **Shared coloring** `colorAt(w)` (`render/colorShader.ts` → `@cas/gpu/glsl` `PHASE_COLORING_GLSL`): phase
  LUT × modulus transfer × `fwidth`-AA enhancement (rings / sectors / conformal grid) + level sets + CVD.
  Any geometry can call it on any complex value.
- **A tested 3D stack** (`render3d/`): an orbit camera with perspective/ortho MVP (`camera.ts`,
  `mat4.ts`), an indexed depth-tested grid mesh with field-adaptive tessellation (`mesh.ts`), the
  analytic-landscape surface program (`surfaceShader.ts`), and ray pick (`pick.ts`).
- **Mode dispatch** (`render/plot.ts`): `mode ∈ {2d,3d,sphere,linked}`, one `paint*` per mode; programs
  rebuilt together in `rebuildProgram()`; shared color/param uniform setters (`applyColorUniforms`,
  `applyParamUniforms`).
- **A forward-compatible permalink** `#vs=` (`state/viewState.ts` → `@cas/interchange`): the decoder
  tolerates unknown fields, whitelists the 3D `mode` string in `cleanV3d`, and fills missing fields
  field-by-field — a new mode/field is a non-breaking additive change.

## 2. The gap

`@cas/expr` is **principal-branch, single-valued end to end** — no branch node, no sheet index, no
all-branches enumeration (confirmed: `packages/expr/src/complexJs.ts`; ADR-0005 deferred multivalued
`expr`; the plotter's own [`complex-function-plotter-plan.md`](complex-function-plotter-plan.md) tags
"Riemann surfaces" as *needs multivalued expr (out of scope)*). The existing analytic landscape is a
single-sheet graph of `|f|`, so branch cuts show only as tears/cliffs. A true Riemann surface needs a
representation of the multivalued relation and geometry that glues its sheets.

## 3. The method: parametrize-by-w (M0/M1)

For a function `w = f(z)` whose inverse `z = g(w)` is **single-valued**, sample a regular grid in the
**value plane** and plot the surface over it. Concretely, parametrize the mesh by the primitive's value
`W`, and at each grid vertex compute:

- **position** `(Re z, Im z, H)` where `z = g(W)` — the only nonlinear, per-vertex quantity;
- **color** `colorAt(w)` where `w = A·W + B` is the function value (affine in `W`);
- **height** `H = charisma(W)`: `Re W` (interlocking algebraic sheets — √z, ⁿ√z, `z^{p/q}`) or `Im W`
  (the log helicoid, inverse-trig ramps).

Because `w` and `H` are **affine in `W`** (hence affine in the grid UV), they interpolate *exactly* across
each triangle — coloring and height stay crisp on a coarse mesh; only the `xy` surface is curved. Because
the `W`-domain is one connected sheet, the surface's sheets **glue themselves** — there is no cut to heal
and no branch-tracking. (Corless–Jeffrey / Trott; see research notes §2.1.)

### 3.1 The general recognized form (affine wrap)

The app recognizes `w = A · P(α·z + β) + B` for a core primitive `P` and complex constants `A, B, α, β`
(any absent), where `P ∈ { sqrt, log, arcsin, arccos, arctan }` **or** a fractional power `z^{p/q}` (q>1).
Writing `W = P(α z + β) = (w − B)/A`, the inverse is

```
z = ( P⁻¹(W) − β ) / α
```

with `P⁻¹`: sqrt→`W²`, log→`e^W`, arcsin→`sin W`, arccos→`cos W`, arctan→`tan W`, `z^{p/q}`→`W^{q/p}`.
`P⁻¹` is built as an `@cas/expr` AST in the formal variable, so it rides the existing `compileF` (GPU) and
`makeComplexFn` (CPU) with zero new numeric code. The value map `w = A·W + B` is a second tiny AST.

### 3.2 Sheets, windows, branch points (per primitive)

| `P` | sheets | default height | `W`-window (from sheet count `N`) | branch points (in z) | monodromy |
|---|---|---|---|---|---|
| `sqrt` | 2 | `Re W` | square about 0 | radicand = 0; ∞ | (1 2) |
| `z^{p/q}` (lowest terms) | q | `Re W` | square about 0 | 0; ∞ | q-cycle; phase winds p× |
| `log` | ∞ (→ `N`) | `Im W` | strip: `Im W ∈ [−Nπ, Nπ]` | arg = 0 or ∞ | shift `k↦k+1` |
| `arcsin`/`arccos` | ∞ (→ `N`) | `Re W` | `Re W ∈ [−Nπ, Nπ]` | ±1; ∞ | — |
| `arctan` | ∞ (→ `N`) | `Re W` | `Re W ∈ [−Nπ/2·…]` | ±i | — |

Branch points are detected by composing over the AST (research notes §3.1); for M1 they are used for
honest labeling / an optional cut indicator, not for continuation.

## 4. Architecture & components (M1)

Additive, mirroring the existing surface/sphere fan-out.

- **`src/riemann/inverse.ts`** — the inverse registry. `detectRiemannForm(ast): RiemannForm | null`
  recognizes §3.1; a `RiemannForm` carries the inverse AST `z=g(W)`, the value AST `w=A·W+B`, sheet kind
  + count law, default height source, the `W`-window law, branch-point info, a human label, and a rigor
  note. Pure; unit-tested against `makeComplexFn` for CPU↔(intended GPU) parity.
- **`src/render3d/riemannSurface.ts`** — `buildRiemannProgram(gGlsl, wGlsl, paramNames)`: a vertex shader
  mapping grid UV → `W` over the window, `z = gFn(W)`, position `(z.x, z.y, height(W))`, passing `w =
  wFn(W)` to the fragment; the fragment does `colorAt(w)` + a geometric (screen-space) normal shade.
  Mirrors `surfaceShader.ts`.
- **`render/plot.ts`** — `mode "riemann"`, `rebuildRiemannProgram()` (called from `rebuildProgram`),
  `paintRiemann()`, a `wView` (center + half-span in the `W`-plane) + `riemannHeight` + `riemannSheets`
  state, reusing the orbit camera, mesh buffers, atlas, and shared uniform setters.
- **`main.ts`** — a "Riemann" View toggle (enabled only when `detectRiemannForm` succeeds for the active
  map, else disabled with a "principal-branch only" hint), a height-source select + sheet-count control,
  the honest badge, orbit/dolly pointer + keyboard wiring (reusing the 3D path), and a hover readout
  (`W`, `z=g(W)`, `w`, `|w|`, `arg w`).
- **`state/viewState.ts`** — add `"riemann"` to the `V3dState.mode` union and the `cleanV3d` whitelist;
  add optional `riemannHeight` / `riemannSheets` fields (validated, defaulted). Back-compat preserved.

### 4.1 Convention neutrality (ADR-0006)

No `π`/`2πi` normalization enters `@cas/*`. The only `π` here is the geometric strip width for log /
inverse-trig sheet windows, which lives entirely in the app-side registry — the shared packages are
untouched.

### 4.2 Honest labeling (guardrail, first-class)

- The surface **topology** is exact (a known single-valued inverse), so the glued cover is faithful;
  sampled **values** are float32 on the GPU — labeled `≈`.
- **Sheet truncation** (log / inverse-trig show `N` of infinitely many) is surfaced as a badge (`N sheets
  shown`), never silent.
- The mode is **only offered** when the map is a recognized invertible primitive; otherwise the UI says
  "principal-branch only — not the full surface" and stays on the existing views. No unlabeled cliff.
- The `RiemannForm` carries the rigor note the badge renders, matching the `=`/`≈` discipline the SC and
  Faber engines already use.

### 4.3 Dependency direction, testing, census

- No new package edges in M1 (the registry uses only `@cas/expr`, already a dependency). `pnpm dep:check`
  stays green; no app imports another app; no cycles.
- **Node tests:** `detectRiemannForm` recognition + rejection; inverse correctness (round-trip
  `g(P(z))≈z` via `makeComplexFn`); sheet-count/window laws; `riemannSurface` GLSL assembly asserts;
  permalink round-trip + back-compat for the new fields. **Browser tests:** the `riemann` program links in
  a live WebGL2 context; render invariants (√z two-sheet reflection symmetry; log helicoid monotone
  height). The existing top-down-3D≡2D golden and all current tests stay green (test-census floor kept).

## 5. Milestones (each gated)

Each gate: **`pnpm typecheck` · `pnpm lint` (+`dep:check`) · `pnpm test` · `pnpm build`** + the browser
goldens + a visual/headless render check.

- **M0 — de-risk spike.** Inverse registry (√, log) + `riemannSurface.ts`; prove CPU↔GPU parity and that
  sheets glue with Re/Im-w height (no z-fighting). Exit: green + findings recorded here.
- **M1 — parametrize-by-w mode (headline).** The full §4 feature for all recognized primitives. Exit: full
  gate green + new goldens; textbook √z / log surfaces; **pause for review**.
- **M2 — algebraic curves (deferred).** AST→`P(z,w)=0`; all-roots-per-vertex (`@cas/core`); proximity
  gluing; `@cas/exact` discriminant-driven subdivision + ramification holes; Web Worker + mesh cache.
- **M3 — explorer/polish (deferred).** Monodromy "walk a loop" (`≈`, RISKS §3 caveats); exponent /
  branch-point sliders; Riemann-sphere-of-the-surface; HSLuv color; adaptive screen-space contours.

## 6. Deferred / non-goals

- ODE-patch (Trott) tier; topologically-exact monodromy (Deconinck algcurves): beyond a viz tool.
- Serializable multivalued interchange: gated on a receiving tool (ADR-0005 stays deferred).
- df64 deep-zoom on surfaces; a separate app (this is an addition *to the plotter*, per the request).
- Extracting `render3d/` or a `@cas/branch` package: only on a real second consumer (ADR-0007); the
  `mat4.ts` "third consumer" note already anticipates the former.

## 7. ADR to write

[ADR-0027](../DECISIONS.md#adr-0027-riemann-surface-mode-in-the-plotter-parametrize-by-w-branch-machinery-in-app):
the Riemann-surface mode, the parametrize-by-w-first method choice (vs. algebraic triangulation vs.
z-grid continuation), keeping the branch machinery in-app under ADR-0007, and the continued deferral of
multivalued interchange (ADR-0005). Recorded at the M0 gate.

## 8. References

See [`riemann-surface-research-notes.md`](riemann-surface-research-notes.md) for the full corpus:
Corless–Jeffrey / Trott (parametrize-by-w, `RiemannSurfacePlot3D`), Nieser–Poelke–Polthier / Kranich
(algebraic proximity gluing), Jeffrey (the "charisma" height coordinate), Wegert (phase portraits), and
DLMF §4.2 / §4.23 (principal-branch cut conventions).
