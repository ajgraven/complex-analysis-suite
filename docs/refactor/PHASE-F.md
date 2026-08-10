# Phase F — σ-native depth (breakdown & reference)

> **Status:** planning reference. The A–E σ-view parity arc is complete (see
> [`LOG.md`](LOG.md)); Phase F is the optional, à-la-carte "depth" phase — where σ stops catching
> up to Complex Dynamics and starts doing things the z²+c plots can't. This doc is the **menu**:
> each item is its own gated, independently-shippable increment. Nothing here is committed to a
> schedule; pick items by value ÷ cost and stop wherever you like.
>
> **Governing rule (RISKS [§3–4](../RISKS.md)):** σ is a *numerical reconstruction* (φ⁻¹ by
> Newton / Durand–Kerner). **Everything σ-derived stays `(≈)`-labeled** — no view, curve, cycle,
> dimension, or limit set produced here may read as certified.

Phase F ports the σ explorer that already exists in the **Quadrature Domains (QD)** app
(`apps/quadrature-domains/app/schwarz/` — ~7,800 LOC — plus a ~1,600 LOC `sphere/` module) into
**Complex Dynamics (CD)**. CD is not starting from zero: the A–E arc + the earlier GPU-σ work
already built most of the substrate, so F is reuse-heavy assembly, not a rewrite.

## What CD already has (the substrate F builds on)

| Need | Already in CD | Where |
|---|---|---|
| σ engine (φ, σ, `escapeTime`) | `@cas/schwarz` | `packages/schwarz` |
| ∂Ω boundary polygon | `schwarzBoundaryPoly()` (already computed for the mask) | `src/render/schwarzView.ts` |
| forward φ(z) | `evalPhi` — the z-disk field needs **no** inverse | `@cas/schwarz` |
| sphere camera | `stereographic` / `stereographicInverse` + quaternions (plot-agnostic) | `src/render/sphereView.ts` |
| GPU σ shader | `schwarzGL.ts` (the lifted `@cas/schwarz/gpu` evaluator) | `src/render/schwarzGL.ts` |
| colormaps / relief lighting / custom gradient | `@cas/gpu` + CD's tone stack (CD is **ahead** of QD here) | `@cas/gpu`, `src/render/schwarzGL.ts` |
| progressive render, orbit tracer, `_sigma` state | Phases B / GPU-σ / E | `src/main.ts`, `src/state/schwarzState.ts` |

## What QD has that CD lacks (the port surface)

The z-disk & sphere **views**, the σ⁻¹ **preimage tree**, and ~10 **analysis tools**. Critically,
**σ⁻¹ lives only in QD** (`schwarz-inverse.mjs`) — porting it into `@cas/schwarz` is the one real
engine addition, and it gates the "reflection-structure" tier.

### The split that drives sequencing

- **Forward-only** (no σ⁻¹ — buildable anytime): **F1**, **F2**, and most of **F4**.
- **Inverse-dependent** (need σ⁻¹ ported first): **F3** tiling tree, **F4a** limit set.

---

## F0 — Groundwork (do first, XS)

- **ADR-0009 addendum.** ADR-0009 framed σ as a single peer *view*; F turns it into a
  **multi-view standalone explorer with σ-native instruments**. A short addendum legitimizes the
  expansion and re-states the honesty rule + the "no z²+c instruments" boundary. Written as part
  of F0 (see [`DECISIONS.md`](../DECISIONS.md) ADR-0009 addendum).
- **Extraction stance (ADR-0007).** `@cas/schwarz` gains pure σ-math **opportunistically, as each
  item needs it** (σ⁻¹, preimage tree, chaos game, level curves, cycles) — CD + QD +
  **correspondences** are all σ consumers, so the second-consumer bar is already cleared. Flag but
  **do not** commit to the larger play: CD's `schwarzGL`, correspondences' `gpu.ts`, and QD's
  `schwarz-webgl` are *three* σ shaders; consolidating them into one `@cas/schwarz/gpu` shader is
  genuine duplication paydown but a large cross-app refactor — leave it to its own future ADR.

## F1 — ∂Ω boundary overlay (S · high value · first)

Stroke `schwarzBoundaryPoly()` as a toggleable overlay in `paintSchwarz` (the same overlay layer
the σ-orbit already uses; `plotToPixel` maps plane→canvas). Instant orientation — you always see
where Ω is. The toggle travels in `_sigma`.
- **New:** a stroke pass + a checkbox. **Reuses** the polygon that already exists on the session.
- **Gate:** toggles cleanly, serializes, and leaves the field bytes unchanged (overlay-only — the
  CPU↔GPU agreement corpus is untouched).

## F2 — Plane / disk / sphere views (L · the flagship)

QD renders the **same** field in three coordinate views from one capture, selected by a
`viewMode ∈ {plane, z, sphere}`. Four gated slices:

- **F2a — view-mode shell (S–M).** A 3-button segment (`plane | z-disk | sphere`), a `viewMode`
  in `_sigma`, **independent** pan/zoom per view, and show/hide of view-specific control cards. No
  new render yet — just scaffolding.
- **F2b — z-disk field (M).** The fragment is a disk point `z`; lift forward `w = φ(z)` (an
  `evalPhi` the shader can do **without** the Newton inverse — *cleaner and faster* than the
  w-plane), then the existing σ escape-time runs in `w`. Add a `u_viewMode` to `schwarzGL` + a disk
  mask; mirror on the CPU path. **Requires a CPU↔GPU parity test** (extends the browser corpus).
- **F2c — z-disk overlays (M–L).** Overlays (orbit, boundary = unit circle, later the tree) are
  w-space objects pulled *back* through ψ (a per-point Newton solve, memoized by source identity).
  Fiddly — many overlay cases — but no new *field* math.
- **F2d — sphere view (M — reuse-lowered from L).** Reuse `sphereView.ts`'s camera; 3-pass FBO
  (render the σ field to a texture with the **existing** σ shader → sample onto a UV-sphere via
  inverse-stereographic → 3D boundary/pole/∞ markers). GPU-only (bail to the prior view without
  WebGL2). North-pole convention `∞ ↔ (0,0,+1)`.
- **Gate (per slice):** the view renders, transforms are independent, parity holds, and `_sigma`
  round-trips the active view + its window.

## F3 — Preimage / tiling tree (M–L · needs σ⁻¹)

First the engine: **port σ⁻¹ into `@cas/schwarz`** — σ⁻¹(w) = φ(F⁻¹(w̄)); polynomial-clear +
Durand–Kerner for the bounded/power families, seeded multi-start Newton for the rest, every
preimage round-trip validated `σ(σ⁻¹(w)) ≈ w`. Then `buildPreimageTree(seed, {depth, budget})` →
`{generations, edges, truncatedByBudget}`, double-click-seeded **only in the tiling set**
(`kind === 'fundamental'`), plasma-ramp paint + z-disk ψ-mirror + depth/budget controls in `_sigma`.
- **Gate:** σ⁻¹ unit-tested (round-trip + against QD goldens), tree renders and seeds only in-set,
  serializes.

## F4+ — Analysis cards (à la carte · pick what you reach for)

Each card is an independent increment. **Forward-only** unless flagged ⟲ (needs F3's σ⁻¹).

| Card | What / method | Cost | Reuses |
|---|---|---|---|
| **F4a** ⟲ Limit set | Chaos game on σ⁻¹ + box-counting dimension (log-log slope) | M | σ⁻¹ (F3) |
| **F4b** σ level curves | Marching squares of `\|σ\|` (solid) + `arg σ` (dashed, seam-rejected) | M | — |
| **F4c** Critical/canonical orbits | Per-family natural seeds (φ(0)=w₀, Blaschke centre…) → orbit tracer | S | orbit tracer |
| **F4d** Cycle finder | Grid-seeded Newton on σⁿ(w)=w, dedup + sub-period cull | M | — |
| **F4e** Orbit-family sweep | Line/circle of seeds → hue-ramped orbit family | S | orbit tracer |
| **F4f** Forward image of a drawn curve | Shift-drag a polyline in Ω → iterate forward under σ | M | drag interaction |
| **F4g** Domain coloring | Per-pixel HSL of σ(w) (hue = arg, lightness = σ(log·\|σ\|)) as a colour mode | S–M | colour-mode plumbing |
| **F4h** σ-singularities | σ-poles (F-pole pullback) + branch points (zeros of φ′), markers | S | — |
| **F4i** Explicit σ(w) form | Per-family closed-form φ/F/σ as text + KaTeX (CD has the φ recipe) | S | glossary / KaTeX |

**Card gate:** computes correctly (spot-checked vs QD where a golden exists), paints, toggles,
`(≈)`-labeled, and serializes if it is a view property.

---

## `@cas/schwarz` extraction thread (runs alongside)

As F needs them, these pure kernels move into `@cas/schwarz` (second consumer already exists —
CD + QD + correspondences): **σ⁻¹**, `buildPreimageTree`, `sampleLimitSet` + `boxCountingDimension`,
`computeSigmaLevelCurves`, `findCycles`, `findSigmaSingularities`. Keep them convention-neutral
(ADR-0006) and golden-tested against QD's outputs. The **shader** merge (one σ GLSL for all three
apps) is explicitly **out of scope for F** — its own future ADR.

## Recommended sequence & the smallest valuable path

**Value ÷ cost order:** F0 → **F1** → **F2a → F2b → F2d** → then either the **analysis wave**
(F4b, c, e, h, i are cheap forward-only wins) or the **structure wave** (σ⁻¹ → F3 → F4a). F2c
(z-disk overlays) and F3 are the two genuinely fiddly pieces — schedule them for depth, not a
quick win.

**If you only do three things:** F1 + F2b/F2d (disk + sphere) + F4i/F4h (explicit form +
singularities) — the biggest perceptual leap (you *see* Ω, its uniformization, and the whole
sphere) for the least new math, all forward-only.

## Cross-cutting gates & guardrails (every slice)

- Working software at each gate; small, reviewable commits; pause at each item for review.
- A new shader path (z-disk, sphere) ⇒ a CPU↔GPU **parity test**; defaults keep the existing
  agreement corpus byte-identical.
- Everything σ-derived is `(≈)`. df64 deep-zoom stays **deferred** (locked scope).
- **PQD caveat (from QD):** for off-axis bounded PQDs, interior σ-dynamics run on the principal
  αth-root sheet while the boundary is anchored, so advanced views can sit on a rotated sheet
  (`schwarz-common.mjs:699`). Only relevant if F later widens CD's σ family set (PQD/LQD are out
  of CD's current families).

---

## Appendix — QD source map (for the eventual porter)

QD's σ code, all under `apps/quadrature-domains/app/`. Cleanly split math-core / paint / features /
webgl / interaction / render — a clean seam for porting piecemeal.

| File | ~LOC | Role |
|---|---|---|
| `schwarz/schwarz-ui.mjs` | 1551 | Orchestration: view toggle, sidebar cards, φ-capture, wiring |
| `schwarz/schwarz-common.mjs` | 1233 | **Math core** — families; σ, ψ, `escapeTime`, `makeOrbit`, point-in-poly |
| `schwarz/schwarz-webgl.mjs` | 1145 | GPU escape-time shader (plane **and** z-disk via `u_viewMode`); mask texture |
| `schwarz/schwarz-paint.mjs` | 906 | 2D overlay layer + z-view ψ-pullback mirroring + colormaps |
| `sphere/sphere-webgl.mjs` | 847 | 3-pass FBO→sphere renderer (reuses the σ shader) |
| `schwarz/schwarz-inverse.mjs` | 572 | **σ⁻¹**, preimage tree, chaos-game limit set, box-counting dim |
| `sphere/sphere-ui.mjs` | 544 | Sphere view adapter (mount, camera, hover raycast) |
| `schwarz/schwarz-analysis.mjs` | 527 | Explicit σ form, σ-singularities, `\|σ\|`/`arg` level curves |
| `schwarz/schwarz-interaction.mjs` | 413 | Pan/zoom/hover-orbit/click-pin/curve-draw |
| `schwarz/schwarz-forward.mjs` | 369 | Canonical seeds, curve forward-iterate, cycle finder, sweep, domain coloring |
| `schwarz/schwarz-features.mjs` | 321 | Per-feature compute glue |
| `schwarz/schwarz-render.mjs` | 289 | Render dispatcher (GPU one-shot / CPU pyramid / worker) |
| `sphere/sphere-common.mjs` | 224 | Stereographic + UV mesh + mat4 (delegates to `@cas/core`) |

**Key entry points** (file:line, QD): view toggle `schwarz-ui.mjs:874`; z-disk field GPU
`schwarz-webgl.mjs:575`, CPU `schwarz-render.mjs:217`; boundary sample `schwarz-ui.mjs:1214`, stroke
`schwarz-paint.mjs:147`; σ⁻¹ `schwarz-inverse.mjs:235`, tree `:339`; limit set `:387`, box-dim
`:479`; level curves `schwarz-analysis.mjs:388`; cycles `schwarz-forward.mjs:147`; sweep `:275`;
curve forward `:106`; domain coloring `:306`; σ-singularities `schwarz-analysis.mjs:315`; explicit
form `:59`; sphere 3-pass `sphere-webgl.mjs:7`. QD→CD hand-off already exists:
`schwarz-export.mjs:291` (`exportSigmaDeepLink`).

## References

- [`DECISIONS.md`](../DECISIONS.md) — ADR-0006 (convention-neutral core), ADR-0007 (extract on 2nd
  consumer), ADR-0009 (σ peer view + Phase F addendum)
- [`RISKS.md`](../RISKS.md) §3–4 — why σ output stays `(≈)`
- [`design/SIGMA-HANDOFF.md`](../design/SIGMA-HANDOFF.md) — the σ hand-off + realized peer-view shape
- [`LOG.md`](LOG.md) — the A–E arc increments
