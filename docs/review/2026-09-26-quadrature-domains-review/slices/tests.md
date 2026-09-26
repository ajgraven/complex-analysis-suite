# tests — summary

Covered `app/test/` (legacy CJS suite + bootstrap/harness), `app/node-test.js`, all of `vitest/` (29 wrappers, `_run.ts`,
`_algebra-mount.ts`, the 136 native specs), `vitest/browser/` (read only) and both configs. Ran: the full QD project
(165 files / 1285 tests, green, **1 m 56 s wall** on a loaded 4-core box, not ~20 min), `node app/node-test.js`
(2342 assertions, green), a v8 coverage run, instrumented RNG runs, and an **18-mutant sweep** in a detached git worktree
(full QD project per mutant): **7 killed, 11 survived** (one equivalent in outcome). Headline: the suite pins the *happy path*
well and the *acceptance boundaries* poorly — the identity-tolerance gate, the univalence crossing window, the domain-dedupe
tolerance, the share-link value domain, and, most seriously, the **soundness of the interval arithmetic behind a certified `=`**
all survive mutation. One spec is wall-clock flaky (5 of 21 full runs failed under load, one on a clean tree).

Mutation table (full QD project; "flaky" = only `sym-factor-recombine-cap` failed, see TST-4, so counted as survived):

| id | site | mutant | result |
|---|---|---|---|
| M1 | `solvers/solver.mjs:1403` | site-A identity gate → `identityOK: true` | killed (param-slice, solvers-4 only) |
| M2 | `solvers/solver.mjs:735` | `isBoundaryUnivalent` → `return true` | killed (cmax, thesis-examples only — indirect) |
| M3 | `solvers/solver.mjs:750` | `SEG_ENDPOINT_EPS` 1e-9 → 0.05 | **survived** |
| M4 | `solvers/solver-qd.mjs:340` | bounded-QD identity `scale` ×1000 | **survived** |
| M5 | `analysis/observables.mjs:159` | ×π on moments k ≥ 1 | **survived** (flaky) |
| M6 | `analysis/cusps.mjs:72` | `DEFAULT_CUSP_TOL` 5e-3 → 5e-2 | killed (cusps) |
| M7 | `ui/ui-modes.mjs:252` | rename mode key `lqd-unbounded` | killed (3 files) |
| M8 | `ui/ui-url-state.mjs:143` | restore α only if `a > 1` | **survived** |
| M9 | `schwarz/schwarz-inverse.mjs:224` | σ⁻¹ round-trip check `< 1e-3` → `< 1e3` | **survived** |
| M10 | `solvers/solver-pqd-common.mjs:502` | continuation identity default 1e-6 → 1e-2 | survived — equivalent in outcome (`evalCandidate` re-verifies, `solver.mjs:1523-1527`) |
| M11 | `qd/qd-equations.mjs:851` | drop `2!` in the moment equation | killed (qd-equations) |
| M12 | `sym/sym-core.mjs:4799` (`_riMul`) | min/max over 2 of the 4 endpoint products | **survived** |
| M12b | `sym/sym-core.mjs:1923` (`_intervalPolyEval`) | same, in interval Horner | **survived** |
| M13 | `solvers/solver.mjs:110` | `UNIVALENCE_SAMPLES` 500 → 24 | killed (6 files) |
| M14 | `solvers/solver.mjs:1779` | `sameDomain` tol 1e-4 → 1e-1 | **survived** |
| M15 | `schwarz/schwarz-export.mjs:329` | ×π on the Hele-Shaw residue α (ADR-0006 control) | killed (schwarz-export, 4 tests) |
| M16 | `solvers/solver-pqd-common.mjs:2` | delete `import { Complex }` | **survived** (flaky) — only `node-test.js` catches it |
| M17 | `ui/ui-url-state.mjs:145` | restore c only if `c > 1` | **survived** |

## Findings

### TST-1 [P1] The soundness of the interval arithmetic behind a certified `=` is untested — two unsound mutants survive
- Category: test
- Location: `app/sym/sym-core.mjs:4796-4801` (`_riMul`, used by `schurCohnInterval` / `_hermitianInertiaInterval`),
  `app/sym/sym-core.mjs:1917-1926` (`_intervalPolyEval`, the RUR coordinate-box enclosure); `vitest/algebra-interval-schur-cohn.test.ts`.
- Claim: the file's own header says "a false `inside` here would become a false `=` on the verdict — the one unacceptable error".
  Every interval test uses point boxes (`pt(g)`, lo = hi) or a "tiny widening" around one polynomial, so the min/max over the four
  endpoint products is never exercised with sign-mixed intervals. Making either multiplication unsound (keep only 2 of the 4
  products) leaves the whole QD project green.
- Evidence (measured): M12 and M12b survive the full project (table). Seeded property probe (`iv-probe.mjs` in my scratch dir:
  3000 random degree-1..3 ℚ(i) polynomials, each coefficient widened to a ±1..3/64 box, certify with `schurCohnInterval`, compare
  with exact `schurCohn` at the box centre, which lies in the box):
  clean tree `{"certified":2096,"wrongCertificates":0}`; with M12 `{"certified":2771,"wrongCertificates":8}` — e.g. the box
  around `(-15/16+3i) + (7/4+13/16i)z + (-11/8+1/16i)z²` is certified `inside=1` while the exact count at its centre is `0`.
  The code is sound today (0 wrong); the tests would not notice if it stopped being.
- Confidence: high
- Prior review: new (the algebra slice checked the interval path against oracles, not its soundness under mutation)
- Fix: add the probe as a seeded Vitest property test (certified ⇒ equals the exact count at the centre and at the box corners),
  plus a containment test for `_riMul`/`_intervalPolyEval` (sample exact rationals in the box and assert every value lies in the
  enclosure). Expose the two helpers on `QD.Sym._internals` for the purpose. (S)

### TST-2 [P1] The bounded-QD quadrature-identity acceptance threshold is not pinned: a 1000× looser verifier passes everything
- Category: test
- Location: `app/solvers/solver-qd.mjs:340` (`scale` in `verifyQuadratureIdentity_QD`); `vitest/solver-identity-tol.test.ts:15-18`.
- Claim: `solver-identity-tol.test.ts` asserts `IDENTITY_TOL === 1e-6` and that a disk passes, and states "the accept/REJECT
  boundary at the 1e-6 threshold is already pinned comprehensively by the node batteries". For the bounded classical family it is
  not: multiplying the verifier's relative scale by 1000 (effective acceptance ≈1e-3) survives. The only tests that bite on the gate
  at all (M1: gate disabled) are two legacy files (param-slice, solvers-4). No test holds a candidate whose residual lies between the
  tolerance and 1e-3 and asserts it is rejected, so the number the "Valid QD" label rests on can drift by three orders unseen.
- Evidence (measured): M4 survives the full project; M1 is killed by 2 of 165 files only.
- Confidence: high
- Prior review: new
- Fix: near-miss test per family: solve, perturb one coefficient by δ chosen so `maxRelDiff ≈ 1e-5` (and ≈ 1e-7), assert
  `identityOK` false (true); pin the measured `maxRelDiff` of one known spurious root as a golden. Correct the spec comment. (S)

### TST-3 [P1] Deleting a kernel import from a solver module (the shipped "Complex is not defined" regression) passes the gate
- Category: test
- Location: `app/node-test.js:56` vs `vitest/node/` (no `worker-graph-cleanrealm.test.ts`); `vitest/node/_run.ts:27-35` (FLOORS
  copied from `node-test.js:88-96`, without the clean-realm entry).
- Claim: same root cause as **DOC-1** (docs slice); this adds the mutation evidence. With `import { Complex }` removed from
  `solver-pqd-common.mjs`, every powerQD solve in the browser worker throws, the full QD Vitest project stays green (its only
  failure was the flaky TST-4 spec), and only `node app/test/worker-graph-cleanrealm.child.mjs` catches it
  (`ReferenceError: Complex is not defined`). No Vitest spec runs a PQD solve outside the bootstrap's global leak.
- Evidence (measured): M16 in a second worktree → `M16 files 165 failed 1 [ 'vitest/sym-factor-recombine-cap.test.ts' ]`;
  child → `ReferenceError: Complex is not defined`.
- Confidence: high
- Prior review: reported in `slices/docs.md` DOC-1 (this review), open
- Fix: add the wrapper; derive `TESTS` in `node-test.js` and the wrapper set from one list (or a spec asserting
  `vitest/node/*.test.ts` == `TESTS`); keep FLOORS in one module both runners import. (S)

### TST-4 [P2] `sym-factor-recombine-cap.test.ts` is wall-clock flaky: 5 of 21 full-project runs failed, including a clean tree
- Category: test
- Location: `vitest/sym-factor-recombine-cap.test.ts:26-34` (`expect(ms).toBeLessThan(4000)`) and `:59-66`;
  `app/sym/sym-core.mjs:2215-2226` (`RECOMBINE_DEADLINE_MS = 2000`, comment "so the test's <4 s holds on ANY machine").
- Claim: the 4 s bound is measured around the whole `S.factor` call (norm, Hensel lifting, then the 2 s recombination deadline), and
  only the last part is bounded. Under load it overruns. The comment's "on ANY machine" is false. Secondary (algebra-slice territory):
  a wall-clock cap makes `factor`'s verdict (`reducible` vs `undetermined`) depend on machine speed, honestly labelled but not
  reproducible.
- Evidence (measured): failures `expected 4624 / 4108 / 4709 / 4116 to be less than 4000` in the M5, M6, M16 runs and the first
  (unmutated) coverage run; baseline duration 2.9 s. Load average was 9–12 on 4 cores (other agents).
- Confidence: high
- Prior review: new
- Fix: assert the mechanism, not the clock — count subset trials (expose `trials`/a `_recombineStats` hook) and assert the cap
  fired and the status is `undetermined`; if a clock must stay, bound it at ≥30 s, which still separates "capped" from "2^r
  enumeration". Better still, cap by a trial budget, making the verdict deterministic. (S)

### TST-5 [P2] The thesis-example "analytic oracle" test accepts 2% area errors, 12% c* errors, and silently drops rows whose detector throws
- Category: test / labelling
- Location: `app/analysis/thesis-examples.mjs:135-138, 158-260` (`_status`, `checkOracle`, `allPass = rows.every(r => r.status !== 'fail')`);
  `app/test/thesis-examples.test.js:44-52`; the same `allPass` drives the in-app oracle card (`ui/ui-thesis.mjs:111`).
- Claim: `warn` counts as pass, and the warn bands are wide: area/perimeter/M₀ pass up to relErr 2e-2, c* up to 1.2e-1, significant
  digits at `want − 2`. Every detector call is wrapped in `try { … } catch { /* skip */ }`, so a throwing `detectSymmetry`,
  `harmonicMeasure`, `estimateAccuracy` or `estimateMaxConformalRadius` removes its rows, and the test only asserts `rows.length > 0`.
  Three of the seven examples (two-point, triangle, square) pin no geometric number at all, only integers (cusp count, symmetry order)
  plus the solver's self-reported digits.
- Evidence (measured, `oracle-probe.cjs`): disk area relErr 6.3e-6, perimeter 1.6e-6, M₀ 0; cardioid c* 1.448 vs 1.449
  (relErr 6.6e-4); deltoid c* relErr 8.6e-5. So the accepted band is ~3000× (area) and ~180× (c*) wider than the measured error.
  Code reading: `_status(0.10, 6e-2, 1.2e-1) === 'warn'` ⇒ a c* 10% off is a passing row, in the test and on the card.
- Confidence: high
- Prior review: new
- Fix: in the test, require `status === 'pass'` and one row per oracle key (missing row = fail); tighten pass bands to ~100× the
  measured error; in `checkOracle`, emit a `status:'error'` row instead of skipping when a detector throws, so the card cannot show
  "all pass" over a crash. Add area/perimeter oracles for the two-point and polygonal examples (closed forms or high-N references). (S)

### TST-6 [P2] The univalence crossing window and the same-domain dedupe tolerance have no boundary tests
- Category: test
- Location: `app/solvers/solver.mjs:748-763` (`segmentsCross`, `SEG_ENDPOINT_EPS`), `:1727-1781` (`phisEquivalent`/`sameDomain`);
  `app/test/param-slice.test.js:563-609` (BSI battery), `app/test/cardioid-uniqueness.test.js:150-160`.
- Claim: widening the excluded end-zone of each segment from 1e-9 to 5% (M3) survives. That ignores any crossing within 5% of a sample
  vertex, i.e. misses a real self-intersection whenever it lands near a sample — plausibly ~10–20% of single-crossing boundaries at
  N = 500. The BSI battery compares grid vs brute force (both call `segmentsCross`) on crossings at segment midpoints, so it cannot
  see it. M2 (univalence check always true) is caught only indirectly, by c* bracketing. Likewise `sameDomain` at tol 0.1 (M14)
  survives: the only distinct-domain cases are a disk and a 2×-scaled cardioid, far apart, so the count of distinct QDs
  (alternate search, gauge quotient) is unguarded against merging nearby genuine solutions.
- Evidence (measured): M3, M14 survive; M2 killed only by `cmax` and `thesis-examples`.
- Confidence: high (survival) / medium (the 10–20% miss estimate is inferred)
- Prior review: new
- Fix: a figure-eight polyline whose crossing sits at t ≈ 0.01 of a segment (flagged), plus a solved non-univalent φ asserted
  `univalent === false` directly; two genuinely distinct QDs at coefficient distance ~1e-3 asserted `sameDomain === false`. (S)

### TST-7 [P2] Share links: the value domain is untested and no frozen link string is decoded
- Category: test
- Location: `app/ui/ui-url-state.mjs:143, 145`; `vitest/qd-url-state.test.ts:150-330`.
- Claim: the codec test is good on key coverage, but every value it round-trips is one fixture (`α = 1.5`, `c = 2`). Restricting the
  decoder to α > 1 (M8) or c > 1 (M17) survives, so links carrying the common α ∈ (0,1) or c ∈ (0,1] (e.g. the shipped
  `single-pole-unbounded` example has c = 0.6) could silently reopen at the defaults. There is also no literal `#vs=…` fixture: a
  change that renames a key or re-encodes a value **on both sides** round-trips perfectly — the CLAUDE.md "consistently lossy round
  trip is still a fixed point" trap — while breaking every link already shared.
- Evidence (measured): M8, M17 survive. `grep '#vs=' vitest/qd-url-state.test.ts` finds only the corrupt-input case.
- Confidence: high
- Prior review: the 2026-08 suite review (07, "no legacy-format fallback") asked about pre-monorepo formats; the frozen-corpus gap is new
- Fix: commit a corpus of `#vs=` strings minted by today's writer (every mode, α ∈ {0.5, 2}, c ∈ {0.6, 1.4}, figure/view keys) and
  decode each in a test forever; parametrise the round trip over boundary values. (S)

### TST-8 [P2] Legacy batteries can lose whole sub-batteries while staying green: unasserted success guards, "skipped" passes, loose floors
- Category: test
- Location: unasserted `if (r.success) { ok(…) }` guards (no preceding assertion that the solve succeeded):
  `cusp-accuracy.test.js:115,176,187` (the near-cusp honest-reporting §5 and the no-escalation §2 checks), `solvers-4.test.js:197,205,211,270,388,421,460,492,623`,
  `solvers-1.test.js:102,481,603`, `solvers-2.test.js:115`, `solvers-3.test.js:119`, `param-slice.test.js:843,952`, `qd-equations.test.js:438`,
  `algebra-store.test.js:130,326,533,726`, `worker.test.js:33`; seven `ok('…: skipped (solver failed…)', true)` in `schwarz.test.js:969-1249`;
  eight `if (!ok) return;` in `vitest/qd-component-branch.test.ts:32-97` (the `branchIncomplete` honesty guard); floors in
  `node-test.js:88-96` / `_run.ts:27-35`.
- Claim: if a solve regresses to failure, those assertions vanish rather than fail. The per-file floors, meant to catch that, sit far
  below what files contribute (measured contributed / floor): schwarz 149/20, param-slice 161/15, thesis-examples 52/8, cusps 51/5,
  cusp-accuracy 40/5, cmax 32/3, observables 24/5, symmetry 15/2, worker 21/3, h-text-roundtrip 60/15. The runner's own comment
  (`node-test.js:61-74`) makes exactly this argument for `direct`/`riemann`/`ui-inputs` and fixed only those three.
- Evidence (measured): `node app/node-test.js` runner lines (e.g. `schwarz.test.js contributed ≥ 20 assertions — contributed 149`);
  the guard list from a scripted scan of `app/test/*.test.js` (guards with no `ok(…success…)` in the 4 preceding lines). No skip
  marker fires today (the `schwarz` run prints none).
- Confidence: high
- Prior review: new
- Fix: turn each guard into `ok(tag+' solves', r.success, r.error); if (!r.success) continue;`; make the "skipped" branches fail;
  add `expect(ok).toBe(true)` to `seeded()`; raise floors to ~80% of measured counts. (S)

### TST-9 [P2] Observables' moments M₁…M₄ are computed, shipped through the worker, consumed nowhere and pinned nowhere
- Category: test / structure
- Location: `app/analysis/observables.mjs:145-159`; consumers: only `thesis-examples.mjs:171` (M₀); tests: `app/test/observables.test.js:42`,
  `vitest/qd-m0-convention.test.ts` (M₀ only, and only for the disk, where M₁…M₄ are 0).
- Claim: multiplying M₁…M₄ by π (the ADR-0006 failure shape) survives (M5). The values are correct today — I checked them against
  closed forms — but they are an unguarded convention-bearing output, and dead in the UI.
- Evidence (measured, `moments-probe.mjs`): bounded cardioid φ = z + ½z²: M/π = [1.5, 0.5, 0, 0, 0] (exact:
  ∫f dA = π(1.5 f(0) + 0.5 f′(0))); solved two-point QD (nodes ±½, residues 0.3): M/π = [0.6, 0, 0.15, 0, 0.0375], matching
  π·Σ cⱼ aⱼᵏ to 1e-10.
- Confidence: high
- Prior review: new
- Fix: either drop M₁…M₄ or pin them with the two goldens above (and IMP-1). (S)

### TST-10 [P2] The σ⁻¹ branch-validation filter never rejects anything in the suite
- Category: test
- Location: `app/schwarz/schwarz-inverse.mjs:219-226` (`_validatePreimage`, called at `:256,289,321`).
- Claim: `_validatePreimage` re-checks σ(w_pre) ≈ w along a different path (σ inverts φ itself, so a preimage on the wrong branch
  fails the check). Loosening it to 1e3 (M9) survives. Either no test input produces a wrong-branch candidate, or the filter is
  redundant; the suite cannot tell which. Related: SCH-5/SCH-6 (schwarz slice) on σ tests that test zero points.
- Evidence (measured): M9 survives.
- Confidence: medium
- Prior review: new
- Fix: a case with a known wrong-branch Newton root (e.g. a multi-sheeted φ with a seed near the other sheet) asserting it is
  filtered; if none can be built, document the filter as belt-and-braces. (S/M)

### TST-11 [P2] Maths- and labelling-bearing modules with zero coverage
- Category: test
- Location: `app/direct/direct-verify.mjs` (207 lines: the Direct tab "Verify" verdict), `app/direct/direct-recompute.mjs` (473: its
  own copy of weighted-boundary sampling, φ = (R#)^{1/α} with arg continuation and φ = (b/|z₀|)·w₀·exp(r#), separate from the
  families' `evalPhi`), `app/ui/ui-thesis.mjs` (oracle card), `param-slice-render/ui`, `sphere-ui/webgl`.
- Claim: no test imports these. `vitest/direct-verify-dispatch.test.ts` re-derives the option bag instead of loading
  `direct-verify.mjs`. The analysis slice's ANA-5 ("Verify then reads green" for non-univalent φ) lives in exactly this module.
- Evidence (measured): v8 coverage of the QD project (`app/**/*.mjs`): 63.0% lines overall; 0% for the files above plus `main.mjs`,
  `ui-faber`, `ui-h-text`, `ui-pole-grid`, `ui-qd-equations`; `ui.mjs` 4.8%. (Coverage of modules loaded by the legacy bootstrap may be
  under-counted, e.g. `cusps.mjs` 45% despite 51 assertions; the 0% files are confirmed by grep: no test names them.)
- Confidence: high
- Prior review: new
- Fix: jsdom specs for `installDirectVerify`/`installDirectRecompute` with a stub `dCtx` (pattern: `qd-url-state.test.ts`); a parity
  test `sampleBoundedPhi` vs `Family.*.evalPhi` on |z| = 1 for each weight. (M)

### TST-12 [P3] `IDENTITY_TOL` is not the single source it claims: a fourth site hard-codes `|| 1e-6`
- Category: structure
- Location: `app/solvers/solver-pqd-common.mjs:502`; `solver.mjs:116-120` ("single source for the three gate sites").
- Claim: the α-continuation endpoint gate uses `(options.identityTol || 1e-6)` — a literal, and `||` makes an explicit
  `identityTol: 0` mean 1e-6. It is a pre-filter only (M10 equivalent in outcome: `evalCandidate` re-verifies at `solver.mjs:1523-1527`).
- Evidence: code reading + M10.
- Confidence: high
- Prior review: new (QD-SOLV-6 centralised three sites)
- Fix: `options.identityTol ?? QD.IDENTITY_TOL`. (S)

### TST-13 [P3] The unseeded Newton-recovery RNG is still exercised by 13 legacy call sites
- Category: test
- Location: `app/solvers/solver.mjs:516, 601`; hit from `solvers-1.test.js:579,599,663`, `solvers-3.test.js:280,285,290`,
  `solvers-4.test.js:38,58,68,77,348`, `param-slice.test.js:992`, `bootstrap.js:240`.
- Claim: the 2026-08 fix threaded an `rng` option but kept `Math.random` as the default, and no production or test caller passes one.
- Evidence (measured): `node -r rngcount.cjs app/node-test.js` → `MATH_RANDOM_CALLS 159`, 158 from `solver.mjs:601`. Forcing
  `Math.random` to 0, 0.5 and 0.999999 leaves solvers-1/3/4 + param-slice at 602/0, so the outcomes are insensitive today; the
  risk is latent.
- Confidence: high
- Prior review: reported in `2026-08-suite-review/findings/07-quadrature-domains.md` (LOW, RNG) — partly fixed
- Fix: default to a fixed-seed PRNG inside `newtonSolve` (reproducible research runs), or pass one from `solveInverseQD`. (S)

### TST-14 [P3] Suite hygiene: 600 s timeouts, a 17 s syntax spawn loop, duplicated floors, 2342 PASS lines of console noise
- Category: test / perf
- Location: `vitest.config.ts:25-29`; `app/test/parse-check.test.js:24-36`; `node-test.js:88-96` + `vitest/node/_run.ts:27-35`; `app/test/harness.js:14-17`.
- Claim: `testTimeout`/`hookTimeout` 600 000 were sized for the retired single child process; the slowest spec now takes 22 s
  (`solvers-3`), so a hang costs 10 minutes before it is reported. `parse-check` spawns `node --check` ~200 times (9–17 s, one of the
  three slowest specs) for what `eslint app` and `vite build` already parse. FLOORS live in two files that already disagree (the
  clean-realm entry). `ok()` prints every PASS, burying a FAIL line in ~2.3k lines. (Stale config comments: see DOC-16.)
- Evidence (measured): baseline JSON durations (solvers-3 22.2 s, parse-check 17.5 s, solvers-4 16.8 s); whole project 1 m 56 s.
- Confidence: high
- Prior review: new
- Fix: timeouts ~60 s; parse the files in-process with `new vm.SourceTextModule`/`acorn` or drop the loop; one FLOORS module; print
  only FAIL lines unless `QD_TEST_VERBOSE`. (S)

### TST-15 [P3] Two tests disagree on the cardioid c* and each tolerance admits the other
- Category: test
- Location: `app/test/cusp-accuracy.test.js:161` (`approxEq(res.cMax, 1.46, 4e-2)`, labelled "tight");
  `app/analysis/thesis-examples.mjs:98` (`cMax: 1.449`); `app/test/cmax.test.js`.
- Claim: the solver measures 1.448; one test pins 1.46 at ±0.04 (2.7%, called "tight"), the other 1.449 at 6% pass / 12% warn. Neither
  is tight, and they do not agree on the constant.
- Evidence (measured): oracle probe `c* pass 1.449 1.448 0.00065725726916168`.
- Confidence: high
- Prior review: new
- Fix: derive c* once (closed form, or a converged high-resolution bracket recorded with its method) and pin it at ~1e-3 in both. (S)

## Improvements (IMP-n)

- **IMP-1 Moment-identity property test across all ten families (value high, cost S).** For seeded random admissible hData per family,
  solve, then compare `boundaryObservables(φ).moments[k]` (an independent Stokes integrator, standard dA) with
  π·Σⱼ Σₛ Cⱼ,ₛ·C(k, s−1)·aⱼ^{k−s+1} (bounded) or the family's analogue. It tests the solver against an integrator it does not share,
  pins the ADR-0006 factor of π for every k (not only M₀), and kills M4/M5-type mutants. The probe in TST-9 already does this for two cases.
- **IMP-2 Closed-form golden corpus from the thesis (value high, cost M).** Pin coefficients at ~1e-10, not integers: disk; the A&S
  cardioid φ = z + ½z² (already partly in cardioid-uniqueness at 1e-3); a two-point Neumann oval; the deltoid (c* = ½, cusp); LQD
  φ = w₀·exp(z√α) (solvers-1 already has this pattern); an unbounded ellipse from a polynomial h. Each is a thesis example with a known
  map, which would replace the self-referential "identity verifier is the oracle" (`solvers-4.test.js:221`) with real ground truth.
- **IMP-3 Interval-containment property tests for every interval primitive (value high, cost S).** See TST-1: seeded boxes, exact
  sample points, assert containment; certified results must agree with exact results at the centre and corners.
- **IMP-4 Commit the worktree mutation harness and the curated mutant list (value medium, cost S).** The 18 sites above with their
  expected kill map, runnable on demand (`git worktree add`, symlinked `node_modules`, full QD project per mutant: ~2–4 min each here).
  Contour-integration already treats sweeps as part of a slice's gate; QD has no equivalent.
- **IMP-5 Move the maths batteries off the `ok()` harness (value medium, cost L).** Each legacy file is one Vitest test, so 2342
  assertions are invisible to the census, one failure reports as "recorded failing assertions: expected 1 to be +0", and a guard that
  skips assertions needs a floor to be noticed. Converting solvers-1..4, cusp-accuracy and schwarz to `describe`/`it` (leaving the
  bootstrap in place) removes the floor mechanism for those files.

## Coverage: what I did NOT review or could not run
- Did not run the browser suite (`vitest/browser/`, schwarz slice's job); read it only.
- The mutation sweep is a sample (18 sites). Each mutant ran the full QD project once under heavy shared load; a mutant counted as
  "killed" was never re-run, and "flaky-only" failures were counted as survived.
- v8 coverage of modules loaded through the legacy bootstrap's native `import()` looks under-counted; I relied on it only for 0% files,
  confirmed by grep.
- Did not independently derive the cardioid c* (TST-15) or check the thesis text for it (`thesis.txt` has no symbols; see DOC-3).
- Did not audit `algebra-*` specs beyond vacuity patterns; ~18 of them are source-regex structural tests (pinning code shape rather than
  behaviour), noted but not scored.
