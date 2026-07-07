# Correspondences

The suite's third tool: a visualizer for **anti-holomorphic correspondences and
Schwarz-reflection matings**, motivated by the Lee–Lyubich–Makarov–Mukherjee (LLMM) and
Lyubich–Mazor–Mukherjee program. It is the app the whole monorepo was factored to enable —
it rides the four shared packages (`@cas/core`, `@cas/expr`, `@cas/gpu`, `@cas/interchange`)
rather than reimplementing complex arithmetic, root-finding, GLSL, or the map compiler.

Built in [Phase 6](../../docs/MIGRATION.md#phase-6--build-appscorrespondences-in-parallel-with-the-tail-of-phase-5),
**deltoid-first**: the deltoid Schwarz reflection is the ground-truth milestone that
validates the pipeline before any new families.

## Running

From the repo root:

```bash
pnpm --filter correspondences dev      # Vite dev server (two pages)
pnpm --filter correspondences build    # static build into dist/
pnpm --filter correspondences test     # Vitest suite
```

It is a **two-page** Vite app (`base: "./"`, `rollupOptions.input`):

| Page          | Entry                      | Contents                         |
| ------------- | -------------------------- | -------------------------------- |
| `index.html`  | `src/main.ts`              | the four dynamical views (below) |
| `mating.html` | `src/mating/matingMain.ts` | the interactive mating explorer  |

## The four dynamical views (`index.html`)

1. **Deltoid Schwarz reflection σ.** The reflection `σ = φ∘η∘φ⁻¹` of the deltoid, where
   `φ(z) = z + 1/(2z²)` conformally maps `{|z|>1}` onto the deltoid exterior and
   `η(z) = 1/z̄` is unit-circle reflection; equivalently `σ(w) = conj(F(φ⁻¹(w)))` with `F`
   the Schwarz extension. Rendered by escape time — the filled set K (deltoid interior)
   black, the tiling exterior coloured by escape generation. **GPU** (WebGL2 via `@cas/gpu`,
   per-pixel Newton inversion of φ) with a **CPU** fallback that is pixel-consistent with it
   (a node-safe agreement test guards the two).

2. **Deleted correspondence.** The genuinely multivalued object: the non-trivial branches of
   `φ(w) = φ(η(z))` (a 2:2 correspondence for the degree-3 deltoid, after deleting the
   trivial `w = η(z)` root). An **orbit tree** is expanded breadth-first from a seed grid and
   splatted to a **density** render (a hot colormap over every visited node). The full point
   cloud is genuine; the per-branch _labels_ are provisional — they are ordered by argument,
   **not** by analytic branch continuation, so near cusps a label can swap (see _Honest
   labeling_ below).

3. **Family parameter plane.** The family `φ_a(z) = z + a/(2z²)` (a = 1 is the deltoid,
   a → 0 a round disk), coloured by the escape time of the **critical orbits under σ_a**.
   GPU + CPU, cross-validated against each other. The picture is _conjecturally_ related to
   the LLMM connectedness locus — a relationship the code never asserts as a theorem.

4. **Parabolic-Tricorn model space.** `z ↦ conj(z²) + c`, the model the family is expected to
   straighten into — compiled through `@cas/expr` (`parse("conjugate(z^2)+c")`), so it is
   semantically identical to the Complex Dynamics app's `tricorn` preset. The `a → c`
   straightening is deliberately **not** computed: it is discontinuous on odd-period
   parabolic arcs and a naive germ conjugacy is provably wrong.

## The mating explorer (`mating.html`)

An interactive realization of the theorem that the deltoid σ is the **conformal mating** of
the anti-polynomial **z̄²** (the map side) and the **Nielsen map of the ideal triangle
group** Γ = ℤ/2 ∗ ℤ/2 ∗ ℤ/2 (the group side), welded along an equator. The three cusps
`1.5·{1, ω, ω²}` are simultaneously the deltoid cusps, Γ's ideal vertices, and z̄²'s
Julia-circle fixed points.

- **Three synchronized panels** — z̄² on the disk, the Γ-tessellation of the disk, and σ on
  the deltoid (the group tessellation carried in by `Ψ = φ∘η`, plus the map-side Böttcher
  grid — equipotentials `{G = const}` and external rays `{arg B = const}` — transported into
  the σ-plane).
- **Interactivity** — hovering any panel lights the shared equator angle θ in all three;
  clicking traces the degree-2 equator map **θ ↦ −2θ** (which both z̄² and the group's
  Nielsen map realize on the circle) as a synchronized orbit.
- **The unmating/folding animation** — a fourth canvas with a scrub slider that runs a
  homotopy folding the two flat disks into the single σ-plane along the equator (exact
  endpoints via `equatorPoint` / `glue` / `sigmaExternalRay`; the straight-line path between
  them is `≈` illustrative).

## Source layout (`src/`)

The pattern: a small set of **verified math engines** (each with isolated tests pinning
correctness), thin **image-band renderers** over them (pure, chunkable, GPU-or-CPU), and the
mating **drawing layer**.

| File                            | Role                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deltoid.ts`                    | the σ engine: `evalPhi · invertPhi` (cold-seed Newton + exact Durand–Kerner fallback) `· sigma · escapeTime`; tests pin the identity `σ(φ(z)) = conj(F(z))` |
| `render.ts` / `gpu.ts`          | σ dynamical-plane renderers (CPU band / WebGL2 shader)                                                                                                      |
| `correspondence.ts`             | the deleted correspondence: η, algebraic deflation of `φ(w) = φ(η(z))`, exact d ≤ 2 / Durand–Kerner d > 2                                                   |
| `orbitTree.ts`                  | breadth-first multivalued orbit-tree iteration with (deterministic, non-continuation) branch labels                                                         |
| `correspondenceRender.ts`       | bilinear-splat density accumulation + heat colormap + final blur                                                                                            |
| `family.ts`                     | `φ_a`, its critical points/values, the critical-orbit escape classifier                                                                                     |
| `paramPlane.ts` / `paramGpu.ts` | parameter-plane renderers (CPU band / WebGL2 shader)                                                                                                        |
| `tricorn.ts`                    | the parabolic-Tricorn model via `@cas/expr`                                                                                                                 |
| `mating/idealTriangleGroup.ts`* | Γ: reflection circles, inversions, fundamental region, BFS tessellation                                                                                     |
| `mating/glue.ts`                | `Ψ = φ∘η` and the tessellation transport onto the σ-plane                                                                                                   |
| `mating/mapSide.ts`             | the σ-plane Böttcher structure: Green's function `G` (with `G∘σ = 2G`), z̄² external rays, and their transport into σ                                        |
| `mating/matingView.ts`          | the three-panel + fold drawing routines and interaction state                                                                                               |
| `mating/matingMain.ts`          | the `mating.html` entry: builds panels, wires hover/click/scrub                                                                                             |

*`idealTriangleGroup.ts` lives under `src/models/`.

## Honest labeling

The straightforward facts are computed exactly and tested (the σ identity, the mating's
tessellation/equator/cusp correspondence, `G∘σ = 2G`, the θ↦−2θ transport). Everything from
the **straightening / branch-continuation** side is exploratory and labeled `≈` — never
certified — because the analytic tools behind it (David surgery, straightening) are not
automatable to proof level
([RISKS §3–4](../../docs/RISKS.md#3-the-three-genuinely-hard-parts)). Branch continuation
through cusps in particular is deferred and uncertified.

## Tests

`test/` — 14 Vitest files. The math engines carry the bulk (the σ round-trip identity as the
correctness anchor; the correspondence branches; the group and glue; the map-side Green's
function and rays), plus a GPU↔CPU agreement guard for the σ and parameter-plane renderers.
