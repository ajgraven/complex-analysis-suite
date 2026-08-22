# Faber Transform

A browser visualizer for the **exterior Faber transform** Φ<sub>φ</sub>: 𝒜(𝔻) → 𝒜(K). Pick an exterior conformal
map φ: 𝔻\* → Ω (so `K = ℂ∖Ω` is the bounded complement) and an analytic input `f` on the unit disk; the
app domain-colors `f` on the disk beside its Faber image **Φ<sub>φ</sub>(f) = Σ bₙ Fₙ** on `K`. It rides the shared
`@cas/*` packages rather than reimplementing them:

- **`@cas/faber`** — the exterior Faber engine: the Faber-polynomial recurrence from φ's Laurent-at-∞ jet,
  exact rational images of monomial / pole inputs, the truncated-series path for free-form `f`, and the
  corner-suppressing weighted Faber polynomials `Q_{n,m}` (M3).
- **`@cas/conformal`** — the **exterior Schwarz–Christoffel** engine (𝔻\* → Ω for a bounded polygon), used
  to build φ for arbitrary polygonal `K`.
- **`@cas/core`** — complex / dense-polynomial algebra, generalized-binomial series (`makeSeries`).
- **`@cas/expr`** — the free-form `f(z)` path (one expression → JS evaluator).
- **`@cas/interchange`** — the `#vs=` share-link codec (app namespace `ft`).
- **`@cas/gpu`** — the WebGL2 phase-portrait coloring shader.

Motivated by **Graven & Makarov, *Quadrature Domains and the Faber Transform*, arXiv:2509.03777**.

Design record: the research / extension survey
[`docs/design/faber-transform-research-features.md`](../../docs/design/faber-transform-research-features.md),
the base build plan [`faber-transform-plan.md`](../../docs/design/faber-transform-plan.md), and the
polygonal-domain runbook (with the M0 de-risk spike)
[`faber-polygonal-sc-plan.md`](../../docs/design/faber-polygonal-sc-plan.md). Architecture decision:
[ADR-0024](../../docs/DECISIONS.md#adr-0024-faber-transform-app--casfaber--polygonal-k-via-the-exterior-sc-engine).

## Running

From the repo root:

```bash
pnpm --filter faber-transform dev      # Vite dev server (http://localhost:5178)
pnpm --filter faber-transform build    # static build into dist/
pnpm --filter faber-transform test     # Vitest suite
```

Single-page Vite app, `base: "./"` so it serves from any sub-path (it publishes under
`faber-transform/` beneath the launcher).

## Domains (φ presets)

| Preset | φ | Faber image labeled |
| --- | --- | --- |
| Interval, Ellipse, Deltoid, 5-star | closed-form Laurent maps | exact `=` |
| Triangle / Square / Pentagon / Hexagon | **regular polygons**, closed-form exterior map (M1a) | exact `=` |
| Rectangle, isosceles triangle, house, L-shape (reentrant) | **arbitrary polygons** via the exterior SC solve (M1b) | `≈` |
| **Custom polygon** | design `K` up to similarity (M2) — drag the vertex handles **directly on the right K panel**, or use the companion mini-editor (add / remove / reset) | `≈` / `⚠` on a failed fit |

Polygonal domains are honestly `≈`-labeled (the exterior SC map is a numerical solve); a degenerate,
self-intersecting, or non-converged polygon renders `⚠` with blank panels rather than NaN garbage.

For the custom domain, the corners of the rendered `K` carry draggable handles. Because `K` is the
**canonical** (centred / rotated / capacity-scaled) SC image of the drawn polygon, a dragged corner is
mapped back to the raw editor vertex through the recovered similarity, then the map is refit on release
(the shape settles slightly, since `K` is defined only up to similarity). The status badge is coloured by
result state: `=` exact (green), `≈` approximate (blue), `⚠` failed fit (amber).

## Inputs (f on the disk)

- **Monomial** `f(z) = zⁿ` → Φ<sub>φ</sub>(f) = Fₙ, the nth Faber polynomial (exact `=`).
- **Pole** `f(z) = 1/(z − z₀)^m`, `|z₀| > 1` → closed-form rational image (exact `=`).
- **Free-form** `f(z)` via `@cas/expr` → Σ_{n≤N} bₙ Fₙ, a truncated series (`≈`).

## Source layout (`src/`)

| File | Role |
| --- | --- |
| `main.ts` | wires the two panels, controls, domain resolution (preset vs custom polygon), the render model + status badge, the share-link |
| `faber.ts` | the app-side adapter over `@cas/faber` — builds the Faber image (or `Q_{n,m}`) for the chosen input on the chosen φ |
| `series.ts` | the free-form truncated-series path (bₙ extraction) |
| `polygon.ts` | `regularPolygonMap` (M1a closed form), `polygonMap` (M1b exterior SC fit + adaptive Laurent truncation + corner images `wₖ`), `cornerNorms` (Λₖ = max{αₖ, 2−αₖ}) |
| `presets.ts` | the curated φ gallery (closed-form + regular + arbitrary polygons), lazily fitted and cached (with lazy corner images for M3) |
| `viewState.ts` | the serializable view-state + defensive guard + `#vs=` codec (custom-polygon bounds + the M3 suppression fields) |
| `mathText.ts` | inline-math renderer — turns `_{…}`/`^{…}` markup into real `<sub>`/`<sup>` DOM (text nodes only, no `innerHTML`), so the header, panel titles, readout, and the corner-profile caption typeset Φᵩ / zⁿ / Qₙ,ₘ / Σ-bounds properly |
| `handleEdit.ts` | the pure math for in-panel vertex editing — recovers the raw↔canonical similarity from the matched corner sets and inverts it, mapping a corner dragged on the K panel back to the raw editor vertex |
| `render/coloring.ts` | the phase-portrait coloring options (shared with the GPU shader) |
| `render/gpu.ts` | the WebGL2 phase-portrait renderer for one panel, over `@cas/gpu` |
| `render/plane.ts` | the 2D plane / axes / mask painting |
| `render/polygonEditor.ts` | the M2 companion mini-editor (add / remove / reset; refit on commit) — kept in sync with the in-panel handle drags |
| `render/cornerProfile.ts` | the M3 before/after corner-overshoot profile — `|Fₙ|` vs `|Q_{n,m}|` along ∂K (paper Fig. 2) |

## Tests

`test/` — `faber.test.ts` (the Faber image on the closed-form domains), `series.test.ts` (the truncated-series
bₙ path), `polygon.test.ts` (the regular-polygon closed form + the exterior SC fit: capacities, corner norms,
convergence / degradation flags, reentrant L-shape, and the M3 corner-images + `Q_{n,m}` suppression seam),
`cornerProfile.test.ts` (the M3 before/after profile compute), `presets.test.ts` (every preset builds),
`coloring.test.ts` (the coloring options), `expr.test.ts` (the free-form path), `viewState.test.ts`
(share-link round-trip + namespace guard + custom-polygon validation + the M3 suppression fields),
`mathText.test.ts` (the inline-math tokenizer), and `handleEdit.test.ts` (the in-panel drag
similarity-inversion math). The exterior SC numerics and the `Q_{n,m}` engine themselves are unit-tested in
[`@cas/conformal`](../../packages/conformal) and [`@cas/faber`](../../packages/faber).

## Status

**T2.3 (Faber on polygonal / cornered K) is DONE (M1a + M1b + M2 + M3)** — regular-polygon presets (M1a),
arbitrary convex + reentrant polygons via the exterior SC engine (M1b), adaptive Laurent truncation +
corner-norm annotations + the draggable editor (M2), and the corner-suppressing weighted Faber polynomials
`Q_{n,m}` — a "suppress corners" toggle + strength slider for monomial inputs, with a before/after boundary
profile (M3). See the [polygonal-SC plan](../../docs/design/faber-polygonal-sc-plan.md).
