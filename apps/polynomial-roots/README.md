# Polynomial Roots

Every root of every polynomial whose coefficients come from a small finite alphabet, painted by
density — the picture at the head of Baez, Christensen & Derbyshire's *The Beauty of Roots*. Littlewood
`{−1, +1}`, Newman `{0, 1}`, `{−1, 0, 1}`, integer ranges, roots of unity and a custom alphabet.

Decision record: [ADR-0046](../../docs/DECISIONS.md). Plan, with every milestone's findings and sweeps:
[`docs/design/polynomial-roots-plan.md`](../../docs/design/polynomial-roots-plan.md). The 2026-09-26
review and its remediation: [`docs/review/2026-09-26-polynomial-roots-review/`](../../docs/review/2026-09-26-polynomial-roots-review/REPORT.md).

## Running

```bash
pnpm --filter polynomial-roots dev            # Vite on :5184
pnpm --filter polynomial-roots test           # the node suite (part of the root gate)
pnpm --filter polynomial-roots test:browser   # the real-GLSL suite (Chromium; NOT in `pnpm test`)
```

The browser suite takes `CAS_CHROMIUM_EXECUTABLE ?? /opt/pw-browsers/chromium`, and runs in CI's
`browser` job through the root `pnpm test:browser`.

## Three engines on one coefficient tree

Every engine reads the same tree — a path is a polynomial's coefficients, lowest first — and the view
decides which one draws (`src/engine/limit/handover.ts`):

| Engine | Reads | Where | Files |
| --- | --- | --- | --- |
| **Roots** | the leaves: every polynomial to a degree, solved by Aberth–Ehrlich in a worker pool, one representative per symmetry orbit | the overview | `engine/{alphabet,orbits,aberth,sweep,pool,cost,scrub}.ts`, `stage/glStage.ts` |
| **Limit set** | the pruned tree, per pixel, in a generated fragment shader; paints the escape depth | the zoom, until a texel is finer than float32 | `engine/limit/{walk,walkGlsl,bandt}.ts`, `stage/limitPass.ts` |
| **Deep** | one double-double walk at the view's centre per frame; each survivor's root splatted as a float32 OFFSET | below a float32 texel, to `1e-30`, inside the unit disk | `engine/deep/{dd,num,reference}.ts`, `stage/deepPass.ts` |

Beside them: the **dragon** inset (`engine/dragon.ts`, `stage/inset.ts`) — the attractor `D_z` at a
lamp, the same predicate as the limit engine's by Bousch's criterion — with a Michelen–Yakir theorem
overlay under the deep engine; **Egan's hue** (`engine/egan.ts`); the Odlyzko–Poonen and Cauchy
**bounds** (`stage/bounds.ts`); the **places** and the zoom story (`places.ts`); the per-degree
**statistics** (`stats.ts`); the `#vs=` **permalink** (`viewState.ts`, tag `pr`) and **PNG export**
with `Software` + `cas:state` (`pngExport.ts`).

## What bounds a sweep

The cost of a sweep is the number of ROOTS it deposits — twelve bytes of GPU vertex data each — so that
is what is budgeted (`engine/cost.ts`): up to 1e7 sweeps at once, up to 5e7 behind **Compute**, and
beyond that the app refuses by name and says which highest degree fits. A degree scrub sweeps only the
degrees the stage does not already hold (`engine/scrub.ts`).

## Honest labelling

The picture is `≈` throughout: a finite degree, numerically solved; a limit set approximated from
above at a finite depth; a theorem illustrated rather than certified. A caption may say `=` only when
it quotes a cited theorem, and `test/places.test.ts` enforces that with a denylist.

## Packages

`@cas/ui`, `@cas/gpu`, `@cas/core`, `@cas/interchange`, `@cas/export`. Two second-consumer extractions
into `@cas/gpu` were made for it: `equalizedCdfLut` (`@cas/gpu/histogram`, from Complex Dynamics) and
`CET_C6` (`@cas/gpu/cet`, from Contour Integration).
