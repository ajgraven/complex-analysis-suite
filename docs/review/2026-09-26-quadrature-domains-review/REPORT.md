# Quadrature Domains review (2026-09-26)

**Scope.** Everything in `apps/quadrature-domains` (app code, tests, build, the 14 app docs), what the suite-level
docs claim about QD, and the hand-offs from QD to Complex Dynamics and Hele-Shaw.

**What was measured, not only read:**

| Check                                  | Result                        |
| -------------------------------------- | ----------------------------- |
| QD's own Vitest project                | 165 files / 1285 tests, green |
| Legacy suite (`node app/node-test.js`) | 2342 assertions, green        |
| QD browser suite                       | 17/17, green                  |
| QD lint, typecheck, build              | green                         |
| Coverage over `app/**`                 | 63 % of lines                 |
| Mutation sweep (in a worktree)         | 18 mutants, 7 killed          |

**Method.** Eight parallel reviewers each worked one slice and wrote `slices/<slice>.md`. Every P0 and P1 finding
then went to an independent adversarial verifier, who tried to refute it with their own probes. The verifier for
the UI slice drove the built app in Chromium. Verdicts are in `verification/`. **Every P0/P1 below survived
verification.** Where a verifier changed a severity, the change is noted.

**Finding counts.** 115 across the slices, plus 9 new items the verifiers raised.

| Severity | Count                                                   |
| -------- | ------------------------------------------------------- |
| P0       | 2 after verification (3 as reported; ANA-1 moved to P1) |
| P1       | about 28                                                |
| P2       | about 40                                                |
| P3       | the rest                                                |

## The headline

**The core mathematics is sound.** No π or 2πi leak from the app's conventions was found anywhere. The solvers
reproduce independently built φ to 1e-11–1e-12 for QD, UQD, LQD (Thm 5.3.2 up to α = π²), singular LQD and
UQD-LQD. The following were all re-derived and agree:

- the forward/inverse duality (★)
- the Schwarz system (★_S)
- the Aharonov–Shapiro resolvent
- the moment Stokes formula
- harmonic measure and curvature
- the Gröbner, Hermite, Schur–Cohn, RUR and Sturm cores (checked against sympy)
- the classical σ hand-off (≤ 2.7e-12)
- the Hele-Shaw hand-off (Res S = α to 1e-10)

The defects sit in three places:

1. **The edges of the solution space.** Branch sheets, univalence near the fold, and high-order poles.
2. **What is displayed about a result.** Closed forms, badges, `=` pills, and export payloads.
3. **Tests that cannot fail.** The σ ≈ id checks evaluate zero points, the Schwarz drift guard lets conjugation
   mutants through, and interval soundness is never tested.

This is the same pattern the contour-integration review found (ADR-0045): the engine is right, and it gates what
may be shown only on some surfaces.

## Priority 1: fix first

These put wrong mathematics or unearned certainty in front of a user, or corrupt data leaving the app.

### 1. Weighted unbounded QDs are exported to other apps as the classical map (SCH-1, P0, confirmed)

- **What happens.** Export φ/σ to Complex Dynamics and Send-to-Hele-Shaw are wired unconditionally. For unbounded
  LQD, singular LQD, PQD and singular PQD, `phiToMapSpec` (`schwarz-export.mjs:31`) never checks `phi.family`.
  It serialises the PQD's G coefficients (and the LQD's polynomial part) as Laurent `F`, and tags the result
  `standard/standard`.
- **Example.** Thesis Ex. 4.3.1 is exported as φ = z + 0.6, a translated circle.
- **What the receivers do.** Complex Dynamics renders the wrong map. Hele-Shaw accepts the LQD at node 2 and runs
  the unweighted evolution.
- **Fix now (S).** Make `explainSigmaUnavailable` and `explainHeleShawUnavailable` refuse any
  `phi.family ∉ {classical}`.
- **Fix later (L).** Build a real weighted export on the interchange `weight` tag (SCH IMP-4).

### 2. Direct mode is wrong for classical unbounded φ (ANA-2, P0, confirmed)

- **What is wrong.** Every one of the 5 unbounded Direct presets gives a wrong result, in three ways:
  - It adds a spurious pole c²/(w−F₀) inside K, so Send-to-inverse fails.
  - It labels valid UQDs "(Not a classical QD)", including the ellipse exterior z + 0.3/z.
  - Its Verify measures the k < 0 Fourier half, which is the wrong half for unbounded Ω, so valid domains paint red.
- **The theory.** Thm 3.2.3 and §3.3 give h = Φ(φ# − c/z), which is just the polynomial part.
- **The tests enforce the bug.** `test/direct.test.js:718-722` asserts the wrong verdict.
- **Fix (S).** Return `poles: []`, pass an `unbounded` flag to the verifier, flip the tests, and add direct→inverse
  round-trip tests for the deltoid and the ellipse.

### 3. Univalence is decided by a sampled polygon, and nothing downstream qualifies it (one root cause, many symptoms)

The only evidence of univalence is `isBoundaryUnivalent`, an N-sample self-intersection test. The sample count
varies by caller: 64 on param-slice warm pixels, 96 during a drag, 500 for a full solve.

**Symptoms:**

| ID             | Severity | What the user sees                                                                                                                                     |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-4           | P1       | "✓ Valid quadrature domain" is unqualified on every solve, and a test pins it byte-for-byte. An algebra `≈` result gets ⚠, so the labels are inverted. |
| ANA-5          | P1       | Direct Verify is green for non-univalent φ (z + 0.7z², 1.5e-16). The singular-LQD kernel prints "✓ — h reproduces the weighted identity".              |
| ANA-8          | P2       | Param-slice paints "Valid QD" 0.5–1.6 % past the fold.                                                                                                 |
| SOLV-6         | P2       | A continuation branch has a φ′ zero at \|z\| = 1.00003, yet reads univalent at 5000 samples.                                                           |
| ANA-3 / ANA-10 | P2       | The convex, star-like and spiral-like ✓ are shown without a winding gate; the unbounded star-like test is taken about w = 0.                           |

**Latent P0 (SOLV-5 × SOLV-6).** The UQD identity check is capped at 6000 nodes, and its doubling loop exits early.
So near c* a genuine QD reads "⚠ identity not satisfied". This is also why "Estimate max c" lands on a c* that the
QD tab calls a failure. The obvious fix, raising the cap, would turn a non-univalent continuation branch into
"✓ Valid" (identity 3.3e-8 at 64k samples). **The univalence certificate must ship first.**

**Fix (S, highest leverage in the review).**

- Count the zeros of φ′ in 𝔻 (or in 𝔻*) with the argument principle. The count must be 0, together with a simple,
  positively oriented boundary (ANA IMP-1, SOLV IMP-3).
- Wire that count into:
  - the solver's accept step
  - Direct's kernels
  - the param-slice warm path
  - classifyUnivalence
- Report the certified margin 1 − max\|z_crit\| on every result, and qualify the badge (`≈ sampled` vs `= certified`).

### 4. Algebra verdicts that read `=` without being earned

| ID                  | Severity        | Problem                                                                                                                                                                                                                                                                                                                               | Fix                                                  |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **N1** (verifier)   | P1, arguably P0 | `runProofTree` treats every `no-real` leaf as certified-empty, whatever that leaf's own rigor. A leaf marked "⚠ PARTIAL" becomes a tree verdict of "No genuine quadrature domain" with `=`. It is reached whenever the root system is positive-dimensional. (Demonstrated with injected dependencies; not yet with a real QD system.) | Carry each leaf's rigor into the aggregate. S.       |
| **ALG-4**           | P1              | Shape-from-moments parses floats, then prints "the exact QD-order" and an "exact" Prony polynomial. Realistic 4-decimal data yields a phantom node, and the residual of about 1e-16 cannot flag it.                                                                                                                                   | Parse exactly, and add a `≈` numerical-rank mode. S. |
| **ALG-1**           | P1              | `_qiFactor` gives up after 2·deg + 8 shifts, then reports "Irreducible over ℚ(i) ✓". deg² + 1 shifts are provably enough. The trigger is contrived.                                                                                                                                                                                   | One line.                                            |
| ALG-6, ALG-5, ALG-3 | P2              | `=` on "No real QD" when realCount is null; `=` on a rationalised boundary curve; the "branches add up" and "LOWER BOUND" prose points in the wrong direction.                                                                                                                                                                        |                                                      |

### 5. The Riemann-map card prints a wrong closed form (ANA-1, ANA-7, P1)

- For unbounded PQD and LQD whose h has a polynomial part, the card omits Σ G_l/z^l and B(1/z). This affects the
  shipped presets, including Ex. 4.3.1.
- Bounded PQD shows w₀^⌈α⌉ for non-integer α.
- The solved φ and the plot are both correct; only the displayed formula is wrong.
- **Fix (S).** Add a test that evaluates the substituted formula against `QD.evalPhi` for every family.

### 6. PQD with non-integer α uses the principal branch where the thesis needs the continuous sheet (SOLV-1, SOLV-2, SCH-2, P1)

This is one defect class that appears at **three sites**. The thesis (Def/Thm 4.2.1) states the identity
single-valued, so the anchored sheet is the correct one.

| ID     | Site                | What the user sees                                                          |
| ------ | ------------------- | --------------------------------------------------------------------------- |
| SOLV-1 | Locator             | Poles that straddle ℝ₋ give "No algebraic root found" for a genuine domain. |
| SOLV-2 | Realizability guard | A false "no bounded PQD with φ(0) = w₀ exists" for a closed-form domain.    |
| SCH-2  | Schwarz adapter     | 70–100 % of Ω paints invalid once the pole angle exceeds π/α.               |

- **The trap.** Fixing one site leaves the other two broken.
- **Fix (S–M).** Use a branch-free locator φ_anchored(z_j) = a_j (the LQD path already does this). Set
  p^{1−α} := a_j/R#(z_j). Evaluate σ from factored principal powers (SCH IMP-2).

### 7. Share links and state (P1 cluster, confirmed in a real browser)

| ID                 | Problem                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **UI-3**           | Every typed h is silently rounded to 6 significant figures before the solve, then written back into the box and the link. `0.123456789` becomes `0.123457`. The app solves a different problem from the one typed. |
| **UI-1**           | There is no `hashchange` listener. A link pasted into an open tab is ignored, and the next zoom overwrites it.                                                                                                     |
| **UI-2**           | A `tab:"schwarz"` link opens the Schwarz sidebar, but the canvas shows the QD plot. No σ view state is carried.                                                                                                    |
| **UI-5**           | The link carries the problem, not the solution: no selected alternate, no search options, no φ.                                                                                                                    |
| **New (verifier)** | The Algebra tab says "No classical bounded QD solved yet" on first open, because `PrimarySolution.subscribe` does not replay the current solve to the lazily loaded tab. Mainstream, and S to fix.                 |
| UI-8               | Restoring an autosave bypasses the stale-seed guard.                                                                                                                                                               |
| UI-6               | The default h is published briefly on every restore.                                                                                                                                                               |
| TST-7              | No frozen `#vs=` string is decoded in any test, so the round trip could be lossy and still pass.                                                                                                                   |

### 8. Concurrency and deploys (P1)

- **INF-2.** Editing during "Estimate max c" gives c* ≈ 1.394 at 99 % confidence; the true value is 1.450. A
  superseded job is read as `success:false`.
- **INF-3 (P2).** A cancelled solve keeps running, and the next solve queues behind it (22 ms becomes 955 ms).
- **INF-1.** The PWA combines `skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches` with no reload. After a
  deploy that changes QD's chunks, an open page loses its lazy chunks. The Algebra tab goes blank, and newly
  spawned workers 404.
- **Fix (S).** Give interactive and batch solves separate lanes, and cancel superseded jobs outright. Add a reload
  prompt on update, and show a build ID.

### 9. Other P1 maths or UX

- **SOLV-3.** `parse-h` splits a combined rational with a pole of order ≥ 3 into several simple poles, with
  residues around 1e11 and no warning. The same parse runs on share-link restore.
  Fix (S): exact square-free parsing.
- **SCH-3.** On the singular-LQD presets, ψ is seeded from a constant, so 15–46 % of Ω paints invalid on the CPU.
  A seed grid finds 100 % of these points. Fix (S).
- **ANA-4 (P1/P2).** The symmetry detector misses reflection axes that are not on its 2520-point grid, and it uses
  w₀ as the centre. Fix (S–M): compute symmetry exactly from the Taylor coefficients after recentring.
- **ANA-6.** Singular-PQD Send-to-inverse drops the origin term r₀/w, then says "Sent." in green.

### 10. Tests that cannot fail on the properties they name (P1)

- **SCH-5.** In `app/test/schwarz.test.js`, the σ ≈ id checks probe exactly on \|z\| = 1, where `acceptZ` rejects
  every root. Of the 17 checks, **14 evaluate 0 points and 3 evaluate 1**. Scaling σ by 1.5 still passes, and the
  test prints "maxErr=0.00e+0".
- **SCH-6.** The ADR-0026 σ drift guard has only real, order-1 fixtures. Five conjugation mutants pass all 116
  Schwarz tests. Its "exterior pole" fixture is not a QD.
- **TST-1.** Interval soundness is untested. An unsound `_riMul` mutant survives and produces 8 false Schwarz–Cohn
  certificates, which is a potential false `=`.
- **TST-2.** Loosening the bounded-QD identity tolerance 1000× survives.
- **DOC-1 / TST-3.** `worker-graph-cleanrealm.test.js` has no Vitest wrapper, so neither the gate nor CI runs it.
  Deleting an import survives the whole gate.
- **TST-8.** About 25 `if (r.success) { ok… }` guards turn a failed solve into zero assertions, not a failure.

## Priority 2: structure and correctness debt

| Area                                          | Findings                                                                                                                                                                                                                                                                                                                                           | Recommendation                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicated engines that have already diverged | ANA-12 (about 250 lines in `direct-common`; the copies lost the univalence gate); SOLV-8 (five unbounded identity verifiers with different test points, floors, escalation and fail-open/closed behaviour; SOLV-4 fails open); SCH-7 (a line-for-line copy of `@cas/gpu`'s conservative mask builder, plus a monkey-patched `buildSchwarzFromPhi`) | One adaptive, fail-closed identity driver (SOLV IMP-4). Direct kernels routed through the shared helpers. QD calls `@cas/gpu`'s mask builder (S). |
| God modules                                   | UI-12 (`algebra-ui` has 148 inner functions; `bootQdUi` takes about 40 injected functions; there are four writers of `state.current`, three hData→grid mappings, and seven escape helpers, one of which does not escape)                                                                                                                           | Split along the writer boundaries, and give `state.current` a single writer.                                                                      |
| Cards describe the wrong solution             | New (verifier): after "view Alt k", the geometry, cusp, observables and symmetry cards still describe the primary. UI-9: "View in QD plot" and "Try harder" bypass the solve lanes.                                                                                                                                                                | Re-run the analyses on the shown solution.                                                                                                        |
| CPU-side σ                                    | SCH-4 (P2 after verification): the CPU chord mask over-claims Ω, but only at deep zoom. SCH-8: shader families 2–5 have no numeric test.                                                                                                                                                                                                           | SCH IMP-1: decide in-Ω near ∂Ω by whether ψ has an admissible root.                                                                               |
| Algebra resource safety                       | ALG-2 (an uncapped `gcdMV` on the render path; on presets ≤ 1.3 s), ALG-12 (a 9-digit exponent typed in the preview box freezes the tab), ALG-9 (no squarefree step before the bivariate path)                                                                                                                                                     | Deadlines, and a cap on the exponent.                                                                                                             |
| sym-core vs `@cas/exact`                      | resultant, discriminant and squarefree now exist twice, and ADR-0047 plans a third Berlekamp–Zassenhaus. The differential test covers only field arithmetic.                                                                                                                                                                                       | Extend the differential test past field arithmetic before ADR-0047 lands. Include multi-shift ℚ(i) and repeated-factor cases in its golden set.   |
| Cusp and critical-point reporting             | ANA-9 (misses 4–30 of 19–39 critical points, so the card can read "✓ smooth"), ANA-11 (a near-boundary zero is drawn as an actual cusp; m ≥ 2 is reported for a Jordan domain)                                                                                                                                                                     | Count with the argument principle, and label `≈ cusp (d = …)`.                                                                                    |
| Test hygiene                                  | TST-4 (a wall-clock assertion flakes 5 of 21 runs), TST-5 (the thesis oracle counts `warn` as pass with a 12 % c* error), TST-6, TST-9 (moments are never pinned; a ×π mutant survives), TST-11 (0 % coverage on Direct Verify)                                                                                                                    | See IMP T1–T3 below.                                                                                                                              |

## Priority 3: documentation (P2 items first)

- **DOC-3.** `thesis.txt`, described as the ground-truth reference, has **every formula stripped**: it contains no
  Greek or math-italic characters. `prop463.txt` is untraceable and covers different pages from its name.
  Replace it with a maths-preserving extraction that has page markers.
- **DOC-2.** The "tiling set" is defined backwards in THEORY_MAP, the Schwarz README and the main README. It is
  given as orbits that never escape, which contradicts thesis §5.8 and the code.
- **DOC-20.** No document defines hData. The claim that "the residue is convention-neutral" holds only if h means
  the principal part of S. That leaves a gap in ADR-0006's guard. Define it in README Conventions.
- **DOC-9 / DOC-19.** The README omits the weighted Direct problem, all three interchange hand-offs, and 3 of the
  4 runtime `@cas` dependencies. MIGRATION claims QD adopts `@cas/expr`, which it does not.
- **DOC-18.** HANDOFF.md has grown to 5,908 lines (up 44 % in a month). It calls itself historical, yet its
  "current" sections contradict the README. Open work is tracked in four places that disagree. Consolidate per
  DOC IMP-1:
  - README holds the current state.
  - HANDOFF §7 becomes a CHANGELOG, keeping the `#N` anchors that 117 code comments cite.
  - Everything else moves to `docs/history/`.
  - There is one tracker for open work.
- **DOC-4.** The KaTeX and math.js licence notices, which the README says ship in `dist/`, are not there.
- **P3 batch.**
  - Stale `.js` names in 68 module headers.
  - THEORY_MAP line references: 19 of 29 have drifted.
  - About 14 shipped features are still listed as open in TODO.
  - Dead UI: a version label reading a retired manifest, and a service-worker banner that is never wired.
  - `test.html` loads deleted scripts.
  - The stale `repository` URL, and a stray npm lockfile.
  - UI-7: the pre-2026-07-08 link format was deliberately dropped (commit d15f944). Record that in MIGRATION.

## Improvements to core functionality (ranked by value per cost)

| #   | Improvement                                                                                                                                                                                                                                                                        | Value           | Cost    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- |
| I1  | **Argument-principle univalence and cusp-distance certificate**, reported on every result and wired into every verdict. It closes P1-§3 and makes the SOLV-5 fix safe.                                                                                                             | very high       | S       |
| I2  | **Reproducible share link.** Carry a compact φ plus the selected alternate, warm-start from it and verify the match. Embed the permalink and verdict in exported PNGs (`cas:state` via `@cas/export`). Add Schwarz and param-slice view state.                                     | high            | M       |
| I3  | **Certified existence ball per numeric solve** (Krawczyk/Kantorovich). This turns "success" into `=`/`≤`, and flags degenerate cusp roots that are good only to √tol (SOLV-7).                                                                                                     | high            | M       |
| I4  | **Exact boundary-curve geometry.** Build Q(w, w̄) at irrational roots via the RUR, then certify its singular points and δ-invariants: nodes, cusps, isolated points, with genus = arithmetic genus − Σδ. This is the algebraic side of QD that `curveGenus` currently cannot reach. | high            | M       |
| I5  | **Deep, exact Schwarz rendering.** Decide in-Ω by an admissible ψ root instead of the raster mask, then add `@cas/gpu/df64` deep zoom. This removes the mask's resolution cap on 4× and 8× exports.                                                                                | medium-high     | M → M-L |
| I6  | **Weighted σ export.** Lift the LQD and PQD adapters into `@cas/schwarz` and use the interchange `weight` tag, so Complex Dynamics can study the weighted families.                                                                                                                | medium-high     | L       |
| I7  | **Pseudo-arclength continuation in c and α**, with c* read from the branch geometry (fold vs cusp) and a bracketed label.                                                                                                                                                          | medium          | M       |
| I8  | **Exact symmetry detection** from Taylor coefficients after recentring at the area centroid.                                                                                                                                                                                       | medium          | S-M     |
| I9  | **A real thesis example set** with oracles: Ex 4.3.1, the Ex 4.5.1 non-uniqueness pair, Ex 6.5.1 (negative PQD) and the §5.7 two-point LQD family. The current "Thesis examples" contains none from the thesis.                                                                    | medium          | S-M     |
| I10 | **Multiply connected (annular) QDs**, the thesis Fig. 4.1 regime.                                                                                                                                                                                                                  | high (research) | L       |
| T1  | **Moment-identity property test across all 10 families.** Check the Stokes integrator against π·Σ C·binom·aᵏ; this also pins ADR-0006's factor of π for every k.                                                                                                                   | high            | S       |
| T2  | **Closed-form golden corpus** pinned to about 1e-10: disk, cardioid, Neumann oval, deltoid, LQD exp, UQD ellipse.                                                                                                                                                                  | high            | M       |
| T3  | **Seeded containment tests** for every interval primitive, plus a committed mutation harness with its kill map.                                                                                                                                                                    | high            | S       |

## Suggested order of work

1. **Stop the bleeding (all S).**
   - Gate the weighted exports (SCH-1).
   - Fix Direct classical-unbounded (ANA-2).
   - Carry leaf rigor into the proof tree (N1).
   - Stop rounding h to 6 significant figures (UI-3).
   - Add the `hashchange` listener (UI-1).
   - Replay the solve to the Algebra tab (first-open bug).
2. **Make the tests able to fail.** SCH-5, SCH-6, TST-1, TST-2, DOC-1, and the `if (success)` guards. This comes
   before the maths fixes, so that each fix lands against a test that can fail.
3. **Build the I1 univalence certificate**, then the SOLV-5 escalation fix, then qualify the badge (UI-4).
4. **Fix PQD branches at all three sites together** (SOLV-1/2, SCH-2), fix the Riemann card (ANA-1/7), and fix
   `parse-h` (SOLV-3).
5. **Concurrency lanes** (INF-2/3) and **the PWA reload prompt** (INF-1).
6. **Structural consolidation** (P2 table), then **docs consolidation** (DOC-18), then **improvements I2–I10**.

## Coverage gaps (not reviewed, or not run)

- A full real-browser pass across every tab. The verifier drove the built app for the UI and infra findings only.
- triangularize, discriminantVariety, CGS, FGLM, the series and Padé layer.
- The unbounded singular LQD against a closed form. The singular PQD Schwarz families (the probe parameters failed
  to solve).
- Performance on real hardware (the numbers were measured under headless SwiftShader).
- The brief's "about 20 min" for the QD project is stale: the full project runs in about 2 minutes of wall time.
