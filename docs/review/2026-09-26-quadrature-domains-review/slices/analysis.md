# analysis — summary

_(Saved by the orchestrator from the reviewer's hand-back. The reviewer's own Write was refused.)_

**Scope.** `app/analysis/*` (univalence, critical-set, cusps, observables, symmetry, riemann-latex,
thesis-examples, family-sweep, faber-analysis), `app/direct/*` (common, recompute, verify, and direct-ui's
Send-to-inverse), `param-slice-common/render`, and `ui/ui-faber` together with `@cas/faber`.

**What was run.** The 14 listed specs (14 files, 47 tests, all green) and 18 node probes against closed-form
cases: polynomial, limaçon and deltoid maps, the exterior of an ellipse, rotated symmetric QDs, and unbounded
PQD/LQD with a polynomial h. The probes are
`/tmp/claude-0/-home-user-complex-analysis-suite/7d83a4a1-9cc2-5097-8eba-a8efea56452d/scratchpad/analysis/p1–p18.cjs`,
which boot the real modules through `app/test/bootstrap.js`.

**What is sound.** Every computation re-derived here checked out: the bounded forward-Faber principal parts,
the moment Stokes formula, harmonic measure, curvature, the PQD weighted area, and the Laurent-at-∞ expansion
used for Faber.

**Where the defects are.** They are in what is displayed and in the verdicts:

- The Riemann card shows a wrong φ for unbounded PQD/LQD whenever h has a polynomial part.
- Classical-unbounded Direct mode calls valid UQDs "not a QD" and paints them red.
- Several verdicts are not gated on univalence: the convex/star-like ✓, the Direct Verify ✓, and the
  param-slice "Valid QD" at 64 samples.
- The symmetry detector misses reflection axes that do not fall on its sample grid.

## Findings

### ANA-1 [P0] The Riemann-map card shows a wrong φ for unbounded PQD/LQD whose h has a polynomial part

- **Category:** maths / labelling
- **Location:** `app/analysis/riemann-latex.mjs:223-259` (unboundedPQD[_singular]), `:103-148`
  (unboundedLQD[_singular]), `:333-352` (params)
- **Claim.** The builder never reads `phi.polyA` (PQD) or `phi.lqdBeta` (LQD), yet the solver's `evalPhi_UPQD`
  (`solver-uqd-pqd.mjs:67-72`) includes Σ G_l/z^l and `evalPhi_UQDL` (`solver-uqd-lqd.mjs:99`) includes B(1/z).
  So the "closed form with values substituted" is a different function from the solved φ. The params table also
  prints `c` twice, labels the G block `F_0…` when it starts at G_1, and omits β for LQD.
- **Evidence (measured, p7.cjs, h = 0.3w², c = 1).**
  - unboundedPQD, α = 2: the card shows `φ(z) ≈ z·(1)^{1/2}` with params `c c α F₀ F₁ F₂`, while
    `polyA = [0, 0, 0.6]`. At z = 1.3+0.4i, evalPhi gives 1.4327+0.3177i and the displayed formula gives
    1.3+0.4i.
  - unboundedLQD: the card shows `1·z·exp(0 − 0)` and leaves out `lqdBeta = [0, 0, 0.3]`. At the same z,
    evalPhi gives 1.4346+0.2989i and the formula gives 1.3+0.4i.
  - `test/riemann.test.js:45` has an unboundedPQD fixture that carries `polyA`, but it only asserts that KaTeX
    parses the output.
- **Confidence:** high. **Prior review:** new.
- **Fix (S).**
  - Add Σ G_l/z^l (inside the root) and Σ β_l/z^l (inside the exp) to both the symbolic and the numeric form.
  - Give each family its own G_l / β_l param rows, and drop the duplicate `c` row.
  - Add a test that evaluates the substituted form numerically against `QD.evalPhi` for every family.

### ANA-2 [P0] Classical-unbounded Direct mode contradicts the inverse solver

It adds a spurious pole in K, calls valid UQDs "not a QD", and its Verify checks the wrong half of the spectrum.

- **Category:** maths / bug / test
- **Location:** `direct-common.mjs:569-598, 798-880`; `direct-verify.mjs:143-173`; `direct/README.md`;
  `test/direct.test.js:286-296, 716-722`
- **Claim.** For a Laurent polynomial φ = cz + Σ F_l z^{-l} on 𝔻*, the reflected map φ# = c/z + Σ conj(F_l) z^l
  has no singularity in 𝔻* other than ∞. So σ has only its pole at ∞, and h = polyPart. The back-substitution
  already computes that part correctly. The defects are three additions on top of it:
  - (a) The `m=0/allZero` branch adds c²/(w−F₀), a node inside K. The inverse solver has no way to represent it;
    its own convention for the exterior of a disk is h = conj(F₀).
  - (b) Any F_l ≠ 0 with l ≥ 1 triggers a false warning that Ω is "unlikely to be a classical QD". Two
    counterexamples are the exterior of an ellipse (z+0.3/z) and the deltoid (0.45z+0.2025/z²).
  - (c) For unbounded Ω, R∘φ is analytic in 𝔻* and vanishes at ∞, so Δ = h∘φ − conj φ should carry only k<0
    frequencies. The verifier measures the k<0 mass, which is the wrong half for unbounded mode.
- **The tests lock this in.** They assert "Non-QD case: φ = z+0.3/z … correctly flagged".
- **Evidence (measured, p11/p12.cjs).**
  - Deltoid: h = w² is correct, but `finitePoleHandled` is false, the warning appears, and Verify gives
    relNeg 0.415 (red). The inverse solver with h = w² and c = 0.45 rebuilds exactly this φ, univalent and
    with identityOK.
  - F = [0, 0.2]: relNeg 0.80 (red), yet the inverse solver rebuilds it.
  - c = 1 with F = [], and c = 1 with F = [0.3]: Direct gives h = 1/w and 0.3 + 1/(w−0.3) with a green Verify,
    and `solveInverseQD` then fails. Solving with polyPart [] or [0.3] instead produces exactly these domains.
- **Confidence:** high. **Prior review:** new.
- **Fix (S).**
  - Return `poles: []` for any Laurent φ, remove the warning, and set `finitePoleHandled = true`.
  - Pass an `{unbounded}` flag to the verifier and measure the k ≥ 0 mass in that case.
  - Correct the README, invert the two test assertions, and add direct→inverse round-trip tests for the deltoid
    and the ellipse.

### ANA-3 [P1] The convex / star-like ✓ is shown for non-univalent maps

- **Category:** labelling / maths
- **Location:** `univalence.mjs:30-31` (the claim), `:150-159` (no gate), `ui-solve.mjs:752-771`
- **Claim.**
  - Re(zφ′/(φ−c)) > 0 on ∂𝔻 only makes arg(φ−c) monotone; it gives star-like univalence only when the winding
    number is 1.
  - Likewise, convexity needs total turning 2π, which means no zeros of φ′ in 𝔻.
  - The code sets `is` from the margin alone and only appends a note.
- **Evidence (measured, p3.cjs).**
  - φ = z+2z² has φ′(−1/4) = 0 (a limaçon with an inner loop). `isBoundaryUnivalent` is false, yet star-like,
    convex and spiral-like are all reported true (margins 1.667 and 1.8).
  - φ = z+0.5z³ is reported convex with two critical points inside 𝔻.
- **Confidence:** high.
- **Prior review:** the defect is new. The prior audit (`algebra-review/audit/D` §Q7) accepted the header's
  claim that a "yes" is only asserted when φ is univalent.
- **Fix (S).** Require winding 1 of φ−c for star-like, and winding 0 of φ′ for convex. At minimum, set
  `is &&= univalent !== false` and render "n/a".

### ANA-4 [P1] The symmetry detector misses reflection axes off its 2520-point grid, and loses all symmetry when w₀ is not the centre

- **Category:** bug / maths
- **Location:** `symmetry.mjs:61-72, 101-116`
- **Claim.**
  - An axis at angle α crosses ∂𝔻 at θ = α. If α is not a multiple of 2π/2520, the index map k ↦ 2k*−k is off
    by about |φ′|·2π/2520 ≈ 2.5e-3 × scale, which is 25× the tolerance.
  - The centre is taken as the mean of the boundary samples, which equals φ(0) = w₀. In the bounded families
    that is a user-chosen gauge, not the symmetry centre.
- **Evidence (measured, p5.cjs).**
  - Two-point symmetric data on the real axis: order 2, axes 0° and 90° (correct).
  - The same data rotated by 0.3 rad: order 2, no axes.
  - A triangle rotated by 0.1: order 3, no axes.
  - The two-point data with w₀ = 0.3+0.2i: order 1, no axes, for the same domain.
  - The overlay draws this wrong group. The oracles only use axis-aligned data.
- **Confidence:** high. **Prior review:** new.
- **Fix (S–M):** see IMP-2.

### ANA-5 [P1] Direct returns h for non-univalent φ with no warning, and Verify then reads green

- **Category:** labelling / maths
- **Location:** `direct-common.mjs:163-181` (an 8-point |φ′| probe at radius 0.99), `:1042-1187`, `:1273-1411`,
  `:1599-1653`; `direct-recompute.mjs:246`; `direct-verify.mjs:57-81, 143-173`
- **Claim.** The README says realizability ⟺ univalence (Thm 4.3.3), but only the singular-PQD and the unbounded
  weighted kernels check it.
  - For a classical polynomial φ, the Fourier Verify passes by construction whenever φ does not take the value
    φ(0) twice.
  - For singular LQD, the family verifier passes non-univalent φ.
- **Evidence (measured, p2/p13.cjs).**
  - z+0.7z² (critical point at −0.714): h = 1.98/w + 0.7/w², no warning, Verify relNeg 1.5e-16 (green).
  - The rational map (z+0.8z²)/(1−0.3z): residue −2.67 at w₀ (a negative area/π), no warning.
  - `boundedLogQDSingular(3z/(1−0.5z), 1, 0.3)`: the map is not univalent, `univalent` is undefined, and the
    verifier returns 6.1e-9 with "✓ — h reproduces the weighted identity".
- **Confidence:** high. **Prior review:** new.
- **Fix (S).** Build φ in every kernel, run `isBoundaryUnivalent` plus the IMP-1 test, return
  `univalent:false`, and gate Verify's ✓ on it.

### ANA-6 [P1] Singular PQD: Send-to-inverse drops the origin term r₀/w, and the displayed h omits it

- **Category:** bug / labelling
- **Location:** `direct-ui.mjs:1004-1020`, `direct-recompute.mjs:258-266`, `displayH`;
  `solver-pqd-singular.mjs:13-16` (the inverse family has "NO point charge")
- **Evidence (measured, p14.cjs).** R# = (4−0.7z)/(1−0.3z), α = 2, z₀ = 0.5 gives r₀ = 13.96 and residue −4.52.
  The inverse solve of the forwarded h returns "No algebraic root found", while the button reports "Sent." in
  green.
- **Confidence:** high.
- **Fix (S).** Show the origin term in h, warn or disable Send when r₀ ≠ 0, and document it in the README.

### ANA-7 [P1] The bounded-PQD Riemann card uses w₀^⌈α⌉ for non-integer α

- **Location:** `riemann-latex.mjs:171-176` (an integer loop). The singular fragment correctly uses cpow.
- **Evidence (p8.cjs, w₀ = 0.8+0.3i).**
  - α = 1.5: the card shows w₀² = 0.55+0.48i against the true 0.678+0.405i.
  - α = 2.5: the card shows w₀³ against the true 0.421+0.527i.
- **Fix (S).** Use `cpow` on the anchored branch.

### ANA-8 [P2] Param-slice "Valid QD" on warm pixels uses a 64-sample self-intersection test whatever the preset

- **Location:** `param-slice-common.mjs:36, 419-433`. The cold path and `param-slice-ui.mjs:176-178` promise 512
  samples for "rigorous". The comment at `:415` says the identity check uses the full preset N; the code passes
  `univalenceSamples`.
- **Evidence (p6.cjs).** Verdicts at N = 32 / 64 / 128 / 512 / 4096 (U = univalent, x = fails):

  | φ                                 | 32  | 64  | 128 | 512 | 4096 | φ′ zero in 𝔻 at \|z\| |
  | --------------------------------- | --- | --- | --- | --- | ---- | --------------------- |
  | z+0.334z³ (univalent iff b ≤ 1/3) | U   | U   | U   | x   | x    | 0.999                 |
  | z+0.501z²                         | U   | U   | x   | x   | x    | 0.998                 |
  | z+0.168z⁶                         | U   | U   | x   | x   | x    | 0.998                 |

  Every one of these maps has a φ′ zero inside 𝔻, so all three are non-univalent; at 64 samples all three pass.

- **Consequence (inferred):** pixels just past the fold are painted valid.
- **Fix (S).** Use the preset's N on the warm path, or combine the sampled test with IMP-1.

### ANA-9 [P2] findCriticalPoints misses critical points, so the cusp panel can read "✓ smooth boundary"

- **Location:** `critical-set.mjs:77-95` (13 radii × 12 angles, Newton, no completeness count)
- **Evidence (p16.cjs).**

  | φ          | critical points found |
  | ---------- | --------------------- |
  | z+z²⁰/25   | 15 of 19              |
  | z+0.025z³⁰ | 17 of 29              |
  | z+0.03z⁴⁰  | 9 of 39               |

- **Fix (M).** Count the zeros with the argument principle, use the polynomial root finder for rational φ′, and
  report "k of K found".

### ANA-10 [P2] "Star-like (∞)" and spiral-like for unbounded Ω are taken about w = 0, so they depend on translation

- **Location:** `univalence.mjs:106-117`
- **Evidence (p17.cjs).** The deltoid gives ✓ (margin 0.069). The same deltoid translated by +1
  (h = (w−1)²+1) gives ✗ (margin −1.14), and spiral-like becomes ✗ too.
- **Fix (S).** Use zφ′/(φ−c₀), where c₀ is the Laurent constant.

### ANA-11 [P2] Cusp labelling

- **Location:** `cusps.mjs:60, 272`; `ui-solve.mjs:877-888`
- **Claim.**
  - A φ′ zero with |d| < 5e-3 is drawn as an actual cusp (● m=1) and the distance d is not shown, so an `≈`
    reads as `=`.
  - Points with |d| ≤ 0.05 are listed under "singular points on ∂Ω".
  - m ≥ 2 would mean an interior angle (m+1)π > 2π, which a Jordan domain cannot have, yet it is reported as a
    cusp type.
- **Evidence:** inferred from the code. **Confidence:** medium.
- **Fix (S).** Label near-boundary zeros "≈ cusp (d=…)", and label m ≥ 2 as a fold.

### ANA-12 [P2] About 250 duplicated lines in the Direct kernels

- **Duplications.**
  - `boundedQD` (`:106-158`) is `forwardLocalPrincipal` (`:2141-2187`) inlined; the two agree to 2.3e-16
    (p18.cjs).
  - The rational residue extraction (`:1112-1130`) duplicates `localPrincipalResidues`.
  - The non-singular kernels validate inline instead of calling `parseKernel`.
  - The ζ→z_j→A branch loop appears in five places.
  - `family-sweep.mjs:51-61` copies `_solveScenarioBody`'s opts mapping.
- **Consequence.** The copies have already diverged; that divergence is how the univalence gate went missing
  (ANA-5).
- **Fix (S–M).** Route every kernel through the shared helpers.

### ANA-13 [P3] The param-slice classifier fails open and mislabels input errors

- **Location:** `param-slice-common.mjs:288-297`
- **Claim.**
  - `univalent` and `identityOK` are tested as `!== false`, so undefined counts as valid. This is latent today,
    since nothing sets `identityCheck:false`.
  - The regex `/iter|…|singular/` also matches input errors such as "powerQD… w₀ … singular 0∈Ω", so those
    are painted "Newton diverged".
- **Fix.** Require an explicit `=== true`, and anchor the regex.

### ANA-14 [P3] Stale or contradictory docs and labels

- The observables header says unbounded φ is traced clockwise with signedArea < 0. Measured on the deltoid:
  +0.3785 = area(K) = π(c²−2c⁴). So the unbounded moments are +∬_K.
- The card labels area(K) as "area".
- The oracle label "M₀ = ∬ dA" with value π uses dA = dx dy, while `ui-strings.mjs:340, 387` uses QD's
  dA = dx dy/π. The 08-suite-review moments item was fixed only in the docstring.
- The blurb gives c* ≈ 1.46; the oracle uses 1.449.
- The comment "preserve the leading C_n" (`direct-common.mjs:151`) sits above code that trims C_n.
- "Thesis examples" contains no example from thesis.txt.

## Improvements

- **IMP-1 (value high, cost S). A winding certificate for univalence.** The winding of φ′(e^{iθ}) counts the
  critical points in 𝔻, and univalence forces it to be 0. Together with a simple, positively oriented boundary,
  winding 0 is also sufficient. Refine the sampling adaptively, and wire the test into the Direct kernels, the
  param-slice warm path, and classifyUnivalence.
- **IMP-2 (value high, cost S–M). Exact symmetry from the Taylor coefficients.** Recentre at the area centroid
  with a disk automorphism. Then rotation of order n holds ⟺ a_k = 0 for k ≢ 1 (mod n), and reflection about
  axis α holds ⟺ a_k·e^{i(k−1)α} ∈ ℝ, with α read off the dominant a_k.
- **IMP-3 (value medium, cost M). Classical unbounded rational φ in Direct mode.** Apply forwardLocalPrincipal
  at the 𝔻*-poles of φ#.
- **IMP-4 (value high, cost M–L). Certified boundary simplicity.** A Lipschitz/interval chain of discs, with
  the badge reading `=` only when certified.
- **IMP-5 (value medium, cost S–M). Real thesis examples with thesis oracles.** Ex 4.3.1, the Ex 4.5.1
  non-uniqueness pair, Ex 6.5.1 (negative PQD), and the §5.7 two-point LQD family.
- **IMP-6 (value medium, cost M). Fold-aware slice refinement.** Refine on the sign of min|z_crit|−1 even when
  all four corners agree. Today, thin tongues inside agreeing 32-px cells are never sampled
  (`param-slice-render.mjs:150-170`).

## Coverage (not reviewed)

- The weighted (★)-probe inversions were only spot-checked. The PQD-singular weighted area was confirmed to
  3e-11 against an exact-derivative quadrature.
- Solver internals (`isBoundaryUnivalent`, `boundarySelfIntersects`), `shapeFromMomentsJSON`, and the non-Send
  parts of direct-ui were not reviewed.
- The c* = 1.449 oracle was not rigorously verified. Measured: the identity check fails from c ≈ 1.44 while
  the solution stays univalent (p10).
- Nothing was rendered in a browser. The UI effects are inferred from the rendering code and the measured
  analysis outputs.
