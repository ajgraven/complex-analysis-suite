# Riemann surfaces — fundamental group & monodromy group (generator loops · permutation diagram · genus) — implementation plan

> Extends the Complex Function Plotter's **Monodromy explorer** (M3.3,
> [`riemann-surface-M3-plan.md`](riemann-surface-M3-plan.md),
> [ADR-0030](../DECISIONS.md#adr-0030-riemann-surface-exploration-tools-m3-hover-pick-linked-base-plane-monodromy))
> from tracing **one** loop to reading the **whole covering**: one-click **generator loops** around each branch
> point (a generating set of the base's fundamental group), a **permutation diagram** for each, and the
> derived **monodromy group**, connectedness, product-one consistency check, and the **surface's genus** via
> Riemann–Hurwitz. New decision:
> [ADR-0033](../DECISIONS.md#adr-0033-monodromy-group-and-fundamental-group-tools-generator-loops-permutation-diagram-genus).
> Guardrails: [`../../CLAUDE.md`](../../CLAUDE.md) → [`../ARCHITECTURE.md`](../ARCHITECTURE.md) /
> [`../DECISIONS.md`](../DECISIONS.md) / [`../RISKS.md`](../RISKS.md).
>
> **North-star tension made explicit:** every sheet permutation this feature composes is the M3.3 estimate —
> **never certified** (RISKS §3). So the whole tower (generators → group → genus) is `≈` *as computed from
> estimated permutations*, and stays quarantined exactly like M3.3. What is genuinely `=` is the *combinatorial
> topology* (π₁ is free on `m` generators; the product-one relation; Riemann–Hurwitz **given** the cycle
> structure) and the winding numbers (B2). The design's first job is to keep that line bright.

---

## Build progress (living record)

> Work lands as small, CI-green commits on branch `claude/riemann-surface-rendering-fvybo6`. Each phase is
> opt-in (inside the already-opt-in explorer), additive, test-guarded, and paused for review at its gate.

| Milestone | Status | Coverage |
|---|---|---|
| **C0 — design doc + ADR-0033** | ✅ this document | scope, math, the `=`/`≈` line, the non-degradation contract, phase order, tests, risks. No app code. |
| **C1 — one-click generator loops** | ✅ done | `src/riemann/generatorLoop.ts` (`generatorLoopAround` + `generatorRadius`, winding-certified, 6 tests); a **GENERATOR LOOPS (π₁)** chip row in the explorer (one γᵢ per branch point, disabled + hinted when a neighbour is too close to isolate); `runGenerator` shares `applyLoop` with the hand-drawn path, so a chip lifts + arrows + winds exactly like a manual loop. |
| **C2 — permutation diagram** | ⏳ planned | inline SVG per σᵢ: sheet-coloured nodes `1…n`, arrows `k → σᵢ(k)`. |
| **C3 — monodromy group + genus** | ✅ done | `src/riemann/permGroup.ts` (compose/inverse/cycles/`generatedGroup` capped closure + orbit transitivity/`riemannHurwitzGenus`/`namedGroup`, 12 tests) + lasso/enclosing loops in `generatorLoop.ts` (common-labeling generators + the ∞ loop, 5 tests) + `Plot.riemannSheetCount`. A **Monodromy group & genus** button computes ⟨σᵢ⟩ ≤ Sₙ (order · name · transitive⇒connected) and the Riemann–Hurwitz genus, `≈`, with the exact parity/bound consistency check. Verified: √(z²−1) → C₂, genus 0; **w²=z³−z → genus 1 (torus)**. |
| **C4 — monodromy report panel (optional)** | ⏳ planned | the generators + diagrams + group + genus as one educational summary. |

---

## 1. The mathematics this exposes

Let `f`'s Riemann surface be an `n`-sheeted branched cover of the base (the `z`-plane, or the Riemann sphere
`Ĉ` once we include `∞`), branched over the points `B = {b₁, …, bₘ}` the explorer already locates (M3.4 scan,
or the exact discriminant locus for a Gaussian-rational implicit `F`).

- **Fundamental group of the base minus branch points.** `π₁(ℂ ∖ B)` is the **free group on `m` generators**
  `⟨γ₁, …, γₘ⟩`, where `γᵢ` is a small counter-clockwise loop around `bᵢ` (and nothing else). On the sphere,
  `π₁(Ĉ ∖ (B ∪ {∞}))` is free on `m` generators too, with the single relation `γ₁ γ₂ ⋯ γₘ γ_∞ = 1`. This is
  **exact combinatorial topology** (`=`).
- **The monodromy homomorphism.** Continuation along a loop permutes the `n` sheets, giving a group
  homomorphism `ρ : π₁ → Sₙ`, `γᵢ ↦ σᵢ`. Each `σᵢ` is what M3.3 already estimates for a hand-drawn loop —
  here we draw the *canonical* generator loops. Every `σᵢ` is `≈`.
- **The monodromy group.** `G = ⟨σ₁, …, σₘ⟩ ≤ Sₙ`, the image of `ρ`. Its order, and whether it acts
  **transitively** on `{1, …, n}` ⇔ the surface is **connected**. `≈` (built from estimated `σᵢ`).
- **The product-one relation.** `σ₁ σ₂ ⋯ σₘ · σ_∞ = id`, where `σ_∞` is the monodromy of a large loop enclosing
  all finite branch points (equivalently `(σ₁⋯σₘ)⁻¹`). This is a *checkable identity*: it holds exactly for the
  true permutations, so if the **estimated** product ≠ id, at least one `σᵢ` is mis-estimated — a free,
  built-in self-check.
- **The genus, via Riemann–Hurwitz.** For a cover of the sphere,
  `2 − 2g = 2n − Σₖ (eₖ − 1)`, summed over all ramification points, where the local ramification indices `eₖ`
  at `bᵢ` are exactly the **cycle lengths** of `σᵢ` (a `k`-cycle contributes `eₖ = k`, i.e. `k − 1`). So from
  the cycle structures we read the surface's **genus** — `=` *given* the cycle data (which is `≈`). Include the
  ramification at `∞` from `σ_∞`.

The pedagogical payoff: from clicking a few loops the user sees the generators of `π₁`, how each acts on the
sheets, the group they generate, whether the surface is connected, and its genus — the covering's whole
topological fingerprint.

## 2. The seam: what already exists

| Need | Already have |
|---|---|
| Branch points `B` | `Plot.riemannBranchPoints()` (`≈` scan, M3.4) and `Plot.riemannBranchPointsExact()` (`=` discriminant locus for Gaussian-rational `F`, M2c.2). |
| One loop's permutation `σ` | `computeMonodromy(sheetsAt, loop, {expected})` → `MonodromyResult` (permutation, cycles, confidence). |
| Sheet enumerator `sheetsAt(z)` | `Plot.riemannSheetsAt` (exact for curves/implicit, census for parametric). |
| Draw / lift / arrow / wind a loop | D1/D2/real-time + B1/B2 (this arc): base-plane + surface arrows, live lift, per-branch-point winding. |
| Winding numbers | `windingNumber(loop, center)` (`=`, B2) — used to *verify* a generator encloses exactly its own branch point (winding 1) and no other (winding 0). |

So C reuses the entire M3/D/B stack; the only genuinely new logic is **(a)** generating a clean loop around a
chosen branch point, **(b)** finite-permutation-group algebra (compose, subgroup closure, cycle type), and
**(c)** the Riemann–Hurwitz arithmetic. All three are small, pure, and unit-testable in isolation.

## 3. Honesty labeling (the guardrail)

| Quantity | Label | Why |
|---|---|---|
| `π₁(base ∖ B)` is free on `m` generators | `=` | exact topology of the punctured base |
| winding of a generator loop about its branch point | `=` | B2 — exact integer (used to certify the loop is a clean generator) |
| product-one relation form `σ₁⋯σₘσ_∞ = id` | `=` | exact identity that *must* hold; used as a check |
| Riemann–Hurwitz formula | `=` | exact **given** the cycle lengths |
| each `σᵢ`, the group `G = ⟨σᵢ⟩`, its order/transitivity, the genus value | `≈` | all are built from continuation — never certified (RISKS §3) |

Everything `≈` stays **quarantined** (never in the badge, permalink, or any export), identical to M3.3. The
product-one check is surfaced prominently: a green "consistent" or a "⚠ estimates inconsistent — a generator
was mis-tracked" makes the uncertainty legible rather than hidden.

## 4. Phases

### C1 — one-click generator loops
For each branch point `bᵢ`, a clickable chip ("γ around bᵢ") that:
1. Auto-sizes a radius `r = min(0.4 · dist to nearest other branch point, 0.25 · view span)` and generates a
   CCW circle of `~64` points centered on `bᵢ`.
2. Runs it through the **existing** pipeline (`computeRiemannMonodromy` + `setRiemannLoop`), so the loop lifts
   onto the surface with arrows and the winding label — no new render code.
3. **Certifies the generator** with B2: assert winding `= +1` about `bᵢ` and `= 0` about every other `bⱼ`;
   if not (branch points too close), disable the chip with a "points too close — draw by hand" note.

Prefer exact branch points (`riemannBranchPointsExact`) when available. New pure module
`src/riemann/generatorLoop.ts` (`generatorLoopAround(center, radius, n)` + the radius/exclusion policy).
Files: `generatorLoop.ts` (+ test), a chip row in the explorer UI (`main.ts`, gated on the explorer being on).

### C2 — permutation diagram
A small inline **SVG** per `σᵢ`: `n` nodes in the **sheet colours** already used on the surface, arrows
`k → σᵢ(k)`, cycles laid out as arcs. Pure render from a `MonodromyResult`. New `src/riemann/permDiagram.ts`
(returns SVG markup / draws to a canvas — TBD in C2, canvas keeps it dependency-free) (+ test on the
node/arrow structure). Reuses the `hsvToRgb` sheet-hue law so the diagram, the lifted arcs, and the surface
agree colour-for-colour.

### C3 — monodromy group + genus
New pure module `src/riemann/permGroup.ts`:
- `compose(a, b)`, `inverse(a)`, `cycleType(p)` on permutations (arrays).
- `generatedGroup(gens, {cap})` — BFS closure in `Sₙ`, **capped** (e.g. 100 000 elements); returns
  `{ order, capped, transitive }`. `transitive` via a union-find / orbit of `{0…n−1}`.
- `productOne(gens, sigmaInf)` → boolean (is `σ₁⋯σₘσ_∞ = id`?).
- `riemannHurwitzGenus(cycleTypes, n)` → integer genus (`2 − 2g = 2n − Σ(eₖ−1)`), including `∞`.
Wired into a summary block in the explorer: generators list, `G` (order · transitive? · a name when
recognizable — `Cₙ`, `Sₙ`, `Dₙ`, `Aₙ`), the product-one check, and the genus. All `≈`, quarantined.

### C4 — monodromy report panel (optional)
Collapsible panel binding C1–C3 into one educational summary. No new math; layout only.

## 5. Non-degradation contract (explicit)

1. **Gated behind the existing opt-in explorer.** Explorer off (the default) ⇒ no chips, no group math, no
   extra render, no module executed. The default plotter is byte-for-byte unaffected.
2. **Additive modules only.** `generatorLoop.ts`, `permDiagram.ts`, `permGroup.ts` are new and pure; no
   existing render path is rewritten. New UI is a collapsible sub-section of the explorer.
3. **Bounded cost.** `generatedGroup` is BFS-capped (reports "order ≥ cap" past it) so a high-degree implicit
   surface (large `n`) cannot hang the UI; generator monodromies are `m` cheap loops computed on demand
   (per chip click), never in the render loop.
4. **Test-guarded, phase-gated.** Every pure module ships with golden tests *before* wiring; the full gate
   (lint · typecheck · full suite · build · browser check) runs per phase; one reviewable commit per phase,
   paused for review.
5. **Honesty preserved.** `≈` outputs stay quarantined (no badge/permalink/export); the product-one check
   surfaces inconsistency instead of hiding it.

## 6. Golden test cases (pin the math before it ships)

| Map | Branch points | Generators σᵢ | Group `G` | Genus |
|---|---|---|---|---|
| `√z` | `{0}` (+∞) | `(1 2)` | `C₂` | 0 |
| `z^(1/3)` | `{0}` (+∞) | `(1 2 3)` | `C₃` | 0 |
| `√(z²−1)` | `{−1, +1}` | two transpositions; product = id at ∞ | `C₂` | 0 |
| `w² = z³−z` (elliptic) | `{−1, 0, 1, ∞}` | four transpositions, product-one holds | `C₂` | **1** |
| high-degree implicit | many | — | order hits cap ⇒ "≥ cap" | reported with the `≈` caveat |

The elliptic case is the headline: four transpositions of two sheets, Riemann–Hurwitz `2 − 2g = 2·2 − 4·1 = 0`
⇒ `g = 1` — the tool *derives* that `w² = z³ − z` is a torus.

## 7. Risks + mitigations

- **Clustered / off-screen branch points** → generator radius keyed to nearest-neighbor distance; B2 winding
  self-certifies the loop (encloses exactly one), else the chip is disabled with a "draw by hand" hint.
- **`≈` branch-point detection** (scan misses/spurious) → prefer the exact discriminant locus; the product-one
  relation flags a missing/extra generator.
- **A mis-estimated σᵢ** → the product-one check catches it and is shown, not trusted silently.
- **Sₙ blow-up** for large `n` → hard BFS cap with an honest "≥ cap" report.
- **Scope creep into a CAS** → we stop at order/transitivity/named-when-obvious + genus; no general group
  classification.

## 8. Open questions (for review)

1. **Keep or drop the genus / Riemann–Hurwitz piece?** It's the deepest payoff but the most machinery; C3 can
   ship group-only first and add genus behind it.
2. **Diagram medium** — canvas (dependency-free, matches the app) vs inline SVG (crisper, easier a11y). Leaning
   canvas for C2, revisit if a11y wants SVG.
3. **`∞` handling** — infer `σ_∞ = (σ₁⋯σₘ)⁻¹` (cheap, exact-relation) vs draw a big enclosing loop and measure
   it (more literal, another `≈`). Leaning inferred, with the big-loop as an optional cross-check.
4. **Package extraction** — `permGroup.ts` is a plausible future `@cas/core` citizen, but single-consumer today,
   so it stays app-local per ADR-0007 until a second consumer appears.
