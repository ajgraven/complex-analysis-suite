# Verification: schwarz slice (adversarial pass)

An independent verifier wrote its own probes (p1–p10 in `scratchpad/verify-schwarz/`) and ran worktree
mutants. It edited no tracked file.

| ID | Verdict | Final severity |
|---|---|---|
| SCH-1 | CONFIRMED | P0 (P1 arguable: a cross-app path limited to four advanced families) |
| SCH-2 | CONFIRMED | P1 |
| SCH-3 | CONFIRMED (CPU) | P1 |
| SCH-4 | CONFIRMED, severity lowered | P2 |
| SCH-5 | CONFIRMED, broader than reported | P1 |
| SCH-6 | CONFIRMED | P1 |

## SCH-1: weighted unbounded QDs are exported as the classical map
**Reachability.** Reachable from the UI with no gate. `schwarz-ui.mjs:490-500` wires Export φ, Export σ and
Send-to-Hele-Shaw unconditionally. The two "why unavailable" helpers return null because `phiToMapSpec:31`
never tests `phi.family`.

**Evidence** (own formula evaluation, not CD's engine):
- Unbounded LQD, h = (0.8+0.2i)/(w−3−0.5i): the wire boundary lies 0.78 from the true ∂Ω; the classical
  control lies 0.00 from it.
- Thesis Ex. 4.3.1 (`upqd-const-a2`): the wire carries `{c:1, F:[0.6]}`, i.e. φ = z + 0.6, a translated circle.
  The true boundary is c·z·(1−γ/z)^{1/2}.

**What the payload claims.** It is tagged standard/standard and has no `weight` field.
- CD's engine renders it without complaint.
- Hele-Shaw accepts an unbounded LQD at node 2 (`{ok:true, alpha:[1,0]}`, byte-identical to the classical QD)
  and draws the unweighted family.

**Correction to the slice.** Hele-Shaw refuses the PQD node-2.5 presets ("node elsewhere"). So the wrong
Hele-Shaw drawing happens only for node w₀ = 2.

## SCH-2: bounded PQD with a pole off the positive axis
**Reachability.** A bounded PQD pole entered off the positive axis. The presets are all on the axis. The GPU
refuses every PQD, so the CPU is the only path.

**Evidence.** For α = 2:
- pole at 100°: boundary error 2.56, 70.2% invalid
- pole at 135° or 170°: 100% invalid

For α = 3:
- pole at 45°: 8.2% invalid
- pole at 100°, 135° or 170°: 100% invalid

**Root cause.** `adaptPowerQD` uses r0 = w₀^α and the principal cpow(·, 1/α), so φ_adapter(0) ≠ w₀ once
|arg w₀| > π/α. This shares its root cause with SOLV-1 and SOLV-2.

## SCH-3: ψ seeding on the singular-LQD presets
**Reachability.** The presets `lqd-s-thm-562` and `lqd-us-1pt`. The CPU path serves hover, orbits and the
seed gate.

**Evidence.** CPU invalid share:
- lqd-s-thm-562: 39.9% / 14.9% / 3.3% at q = 0.1 / 0.3 / 0.5
- lqd-us-1pt: 43–46% across q

A seed-grid Newton finds an admissible root for 60 of 60 failures. `seedFor` returns the constant (0.3, 0.3),
and the CPU `psi` has two tries where the GPU has a 4-seed ladder. The GPU share was not re-measured.

## SCH-4: the CPU mask over-claims Ω (severity lowered to P2)
**Where the CPU mask is used.** PQD renders, a forced-CPU renderer, the hover readout, orbits and the seed
gate. The classical and LQD renders and the export go through the GPU.

**Evidence.** In the default view at 400², at most 4 pixels are affected (≤ 0.003%). Only windows of
half-width 1e-3 on ∂Ω reach 0.32–0.35%. The mechanism is real but invisible at default zoom.

## SCH-5: vacuous σ ≈ id checks (broader than reported)
**Evidence.** Instrumenting `app/test/schwarz.test.js`, the 12 `if (sv)` loops evaluate:

| Lines | Points evaluated |
|---|---|
| 70, 852, 898, 922, 992, 1041, 1111, 1205, 1244 | 0 |
| 258, 525, 1176 | 1 |

The five PQD σ ≈ id checks (:597, 669, 716, 770, 816) are also vacuous, evaluating 0 of 16 points each.

**Mutant.** Scaling `adaptBoundedLQD.evalF` by 1.5 leaves 149/149 passing, with the test printing "maxErr=0.00e+0".

## SCH-6: the drift guard does not bite
**The fixtures.** `schwarz-differential.test.ts:82-127` has only real, order-1 fixtures with w₀ = 0. The
unbounded fixture (z_j = 0.2) has a pole at z = 5 ∈ 𝔻*, so it is not a QD.

**Mutants that survive all 13 Schwarz spec files (116 tests):**
- M1: conj(A) → A
- M2: conj(z_j) → z_j
- M3: conj(w₀) → w₀
- M5: conj(F_l) → F_l
- M6: R## uses conj(A)

**The check that kills them.** σ(φ(z)) = φ(1/z̄) at |z| = 0.98 and 1.02 on complex order-2 bounded and 2-pt
unbounded QDs. Baseline ≤ 4.4e-16; M1 0.575, M2 0.558, M3 0.200, M6 0.83.
