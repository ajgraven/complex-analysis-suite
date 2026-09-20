# Quadrature Domains — review (2026-09-20)

A full review of `apps/quadrature-domains` at `5ebfa54`: the code, the mathematics against the thesis,
the documentation, and the built app driven in headless Chromium. Scope, agreed with the owner before
work began: the app plus the QD-facing surfaces of the packages it consumes (`@cas/core`, `@cas/faber`,
`@cas/gpu`, `@cas/interchange`, `@cas/schwarz`, `@cas/exact`) and the two cross-app hand-offs (QD → Complex
Dynamics σ, QD → Hele-Shaw); tests run and suspected bugs reproduced rather than read; priority for
_improvements_ on the inverse + direct solvers and on the algebra engine + parameter slice.

Nine reviewers worked disjoint scopes under one brief ([`AGENT_BRIEF.md`](AGENT_BRIEF.md)); their full
evidence is in [`findings/`](findings/) — **106 findings, 81 of them reproduced and 25 established by reading the code path**. Every item below carries
how it was established: **[confirmed]** reproduced with a script, a test run or a browser session, with the
command and the number in the findings file; **[code]** established by reading the code path end to end.
Nothing here is speculation. The orchestrator independently re-ran the reproductions for the six items
marked ★ before writing this page. Reproduction scripts lived in the session scratchpad and are not
committed; each findings file records the command, the inputs and the output.

**Health at HEAD, measured:** `node app/node-test.js` **2342 passed / 0 failed** (57 s idle, 91 s under
load); the Vitest project **136 spec files / 1256 tests green**; the browser suite **4 files / 17 tests
green**; lint and typecheck silent; 0 console errors across 4 tabs × 2 viewports in the built app; 0 unnamed
interactive nodes in the accessibility tree across 8 page states. **Everything below shipped green.**

**What is right, and was checked rather than assumed** (recorded so nobody re-checks it):

- The conventions are clean. `dA = dx dy/π` and the suppressed `1/(2πi)` were verified verbatim against
  the thesis and operationally end to end — equation builder, residue extraction, the `h` parser, the
  Hele-Shaw wire — to ≤ 1e-10 on one-node, two-node, derivative-term and unbounded-with-polynomial cases.
  **No factor-of-π or 2πi error anywhere in the app.**
- The weighted mathematics is right. All eight LQD/PQD families satisfy the thesis's own coincidence
  equations (4.3, 5.2, 5.3) to 1e-11…1e-16 when checked by an independent Fourier route; α → 1 recovers
  the classical family and α → 0⁺ the LQD family; Theorem 5.3.2's univalence edge at α = π² reproduces to
  3e-8.
- The exact core of the algebra engine is solid: Buchberger (300 fuzz + 195 sympy differential cases),
  resultants (600 vs closed form), Bareiss (200 vs Laplace), `schurCohn` (600 vs numpy), and the
  multivariate real-solution count (145/145, once beating sympy's `solve`). The Aharonov–Shapiro cardioid
  reproduction is correct and its resolvent test is non-vacuous.
- The parameter slice's classification _boundaries_ are right where a closed form exists (the one-node disk
  at `C = 0`; the cardioid fold at `C₂ = 0.5`, located to better than 0.005).
- Every prior QD finding recorded as fixed (2026-08-17 follow-up; the Aug-23 A2 live-vs-authoritative race
  and A3 recombination cap) **is** fixed at HEAD. Two documented-not-fixed LOWs from Aug-17 remain
  (`condEst` diagonal-ratio bound; `Taylor.invert` absolute guard).

The picture is therefore consistent: **the mathematics is right and the _verdict layer_ around it is not.**
The engine finds the correct domain; what the app then says about it — is it a QD, is it univalent, is
this equation irreducible, where are σ's poles, is this share link the same domain, is this export this
domain — is wrong in a dozen independent places, each of them a false certificate.

---

## 1. Wrong mathematics shown as certain (fix first)

### 1.1 The unbounded classical direct problem is inverted — ★ DIR-1 CRITICAL, DIR-2 HIGH, DIR-3 HIGH

For `φ = c·z` and `φ = c·z + F₀`, `Direct.unboundedQD` adds a pole `c²/(w − F₀)` to `h`
(`direct-common.mjs:577-599`). That pole lies in K, not Ω; thesis Def. 3.0.2 requires `h ∈ Rat(Ω)` and
Theorem 3.2.3's explicit note `C_𝔻 φ# = φ# − c·z⁻¹` subtracts exactly this term, so the exterior of a disk
has `h ≡ 0`. The app's own UQD identity verifier scores the returned `h` at **`maxRelDiff = 1`** against
**3.7e-16** for the polynomial part alone, and `Send to inverse` fails with a message blaming the solver.
Meanwhile the ellipse (`z + 0.3/z`) and the deltoid — one of the app's own thesis examples — get an
_exact_ `h` (2.4e-15, round-trips φ to 1.6e-16) and are told "unlikely to be a classical QD" with the
Verify button **red**, because `verifyBoundaryIdentity` measures negative- instead of positive-frequency
mass for an exterior map (`direct-common.mjs:829-881`). So the unbounded direct tab is exactly inverted:
wrong answer + green, or right answer + warning + red. Three `direct.test.js` assertions pin the spurious
pole (removing it makes them FAIL), one pins the ellipse as a "non-QD case", and the comment at
`direct.test.js:299-305` blames the inverse solver, which is innocent. Fix: delete both `finitePoles.push`
calls, score `posMass` in unbounded mode, drop the `finitePoleHandled` warning, and make `unboundedQD` do
what every weighted kernel already does — build the family φ and grade its own `h` with
`verifyQuadratureIdentity` before returning. [`A3`](findings/A3-direct-analysis.md)

### 1.2 `factor` issues a false irreducibility certificate — ★ ALG-1 CRITICAL

When the radical factorisation has exactly one distinct factor, `factor()` discards it, returns the
_input_ and labels it `irreducible` (`sym-core.mjs:2446`); the UI prints **"Irreducible over ℚ(i) ✓ — no
nontrivial factorization exists"** for `w₁²`, `(w₁−1)²`, `(2s−1)³`. A double root is the cusp's own
fingerprint (`AHARONOV_SHAPIRO.md` item 2). Found by a 500-case differential against sympy (14 false
certificates); the same design mistake sits at two more sites in `sym-radical.mjs:443,449`, where
`solveByRadicals((x³−x−1)²)` refuses with Abel–Ruffini (ALG-8). Fix: the primitive is "did the degree
drop?", and `squareFreePart` / `multivariateSquarefreePart` already exist. [`A4`](findings/A4-algebra.md)

### 1.3 `classifyUnivalence` certifies non-univalent maps — DIR-4 HIGH (+ TEST-2 M09/M10)

`φ = z² − 0.5z` is reported **convex ✓, star-like ✓, spiral-like ✓** while `φ(0.57) = φ(−0.07)` to
8.9e-18; `φ = z + 0.8z²` reports convex ✓ beside star-like ✗, contradicting the app's own help text
("convex ⟹ star-like ⟹ spiral-like"). The minimum principle is applied without its hypothesis (no zeros of
`φ − c` / `φ′` in 𝔻), and `runStatusAnalyses` runs this after **every** solve, including the non-univalent
"best of the bad" primary. The mutation sweep confirms the exposure: making spiral-like unconditionally true
survives the whole gate (§25 tests only the positive direction). Fix: accumulate the two winding numbers in
the sweep that already runs (~10 lines) and report `indeterminate` when the hypothesis fails.
[`A3`](findings/A3-direct-analysis.md), [`A9`](findings/A9-tests-tooling.md)

### 1.4 `findCriticalPoints` returns nothing exactly where it matters, and c\* is wrong — SOLV-3 HIGH, SOLV-2 HIGH

For `h = 1/(w−2)` the seeded undamped Newton in `critical-set.mjs:193-247` finds both zeros of φ′ at
`c = 2.5` and **0 of 157 seeds converge for every c ≥ 2.6**, although the zeros exist at |z| = 0.94…0.999
(closed form; `|φ′| = 9e-16`, well conditioned) — φ's own double pole captures every Newton path. Every
caller reads `[]` as "no critical points". Consequence: `estimateMaxConformalRadius` under-reports c\* by
**1.6–2.8 %** (25× its declared `relTol`) against Theorem 3.3.1's exact `c* = w₀ + √α`, and labels the
mechanism `fold` where the thesis proves a (3,2) cusp; the critical-set overlay is blank in the band
`THEORY_MAP.md` says it predicts failure. Fix: for the classical families φ′ = 0 clears to a polynomial —
use the app's existing `Direct.polynomialRoots` (global, seed-free) and make an empty result distinguishable
from a converged-empty one. Add the closed form as a test oracle. [`A1`](findings/A1-solvers-unweighted-core.md)

### 1.5 σ's singularities are drawn at the wrong points — SCH-2 HIGH, SCH-4 MEDIUM

`findSigmaSingularities` evaluates φ at the reflected point `1/conj(z_j)` instead of `z_j`
(`schwarz-analysis.mjs:333`); measured markers at `w = +0.5454` and `w = −9.8e15` where the true poles (the
quadrature nodes) are `±0.5`. `SCHWARZ_FORMULATION.md:16-18` states the correct theory. The test guarding
it is vacuous: the whole pole computation can be deleted and the suite stays 2342/0.
[`A6`](findings/A6-schwarz-sphere-gpu.md)

### 1.6 A point is certified a quadrature domain — WGT-3 MEDIUM (confirmed for `boundedQD` too)

`h ≡ 0` returns a constant φ certified `univalent` + `identityOK` through shared machinery. Bounded families
also silently ignore `hData.polyPart` and certify the answer to a different question (WGT-2; the UI blocks
it today, the engine does not). Fix: refuse in each family's `normalizeOpts`.
[`A2`](findings/A2-solvers-weighted.md)

## 2. The identity verifier — the app's honest-labelling instrument — is not one

These are one theme and should be fixed together.

**★ PSW-1 CRITICAL / SOLV-14 HIGH — the bounded verifier is a fixed 500-node trapezoid with no
escalation** (`solver-qd.mjs:272`; the unbounded twin at `solver-uqd.mjs:436` does escalate). Convergence is
geometric at rate `ρ^N` with `ρ = maxⱼ|phi.branches[j].z|`, so a correct domain is rejected from
**ρ ≈ 0.965**. On the shipped `two-point-sym` preset, one slider drag to `0.58/(w−1) + 1.54/(w+1)` opens
the Inverse tab with **"⚠ Quadrature identity not satisfied"** on a domain whose residual at N = 8000 is
1.3e-12. The parameter slice inherits the verdict per pixel: over its own default axis range the slice paints
**85.3 % of the image wrong on "Fast" (zero green pixels)** and **9.7 % on the default "Standard"**, where
the true identity-fail count is **zero** (2224/2224 verify < 1e-6 at a ρ-predicted node count). At
ρ ≳ 0.98 right and 20 %-wrong both read ~1e0, so the check carries no information; `estimateAccuracy.
underResolved`, the guard for this, is not on the `identityOK` path and cannot fire (PSW-9). Fix: size N
from ρ (`≈ log τ / log ρ` with a safety factor; measured cost +59 % on a ~0.38 ms/px slice render), add the
UQD escalation as backstop, and report `unresolved`/`null` rather than `false` when the cap binds.
[`A5`](findings/A5-param-slice-workers.md), [`A1`](findings/A1-solvers-unweighted-core.md)

**SOLV-1 HIGH — the verifier's relative-difference floor has the wrong dimensions.** `areaScale = Σ|C_{j,1}|`
has units w² against moments of units w^{k+2}, so the check depends on the domain's scale: the same
symmetric two-node QD **passes at s = 1 and is rejected from s ≈ 2500**, while an unbounded φ whose
leading coefficient is **10 % wrong passes at s = 1e5**. This is one of nine scale-absolute constants in a
problem that is exactly scale-covariant (measured to 8e-14): Newton's `1e-10` (SOLV-7), `phisEquivalent`'s
`1e-4` (SOLV-8), `parse-h`'s `1e-14` which turns `1e-15/w` into `h ≡ 0` with no warning (SOLV-6),
`continuationInC`'s `minStep` (SOLV-9), and `@cas/core`'s `poly.trim` (cross-app). One `hScale` in
`normalizeOpts` closes SOLV-1/7/8 at once. [`A1`](findings/A1-solvers-unweighted-core.md)

**SOLV-4 HIGH — `sameDomain` ignores `c`, `polyA`, `z0`, `alpha`.** Two unbounded QDs with a 2× different
conformal radius are "the same domain"; for a pole-free unbounded φ (the shipped deltoid preset) the predicate
is `true` for _any_ pair, so `searchAlternates` can never report a second solution for that class. This is
the gauge quotient behind "# genuine quadrature domains" — the uniqueness question the thesis is about.

**SOLV-5 HIGH — `parse-h` merges distinct poles into a double pole** when `δ/|a| ≲ 1e-5`:
`1/((w−1000000)(w−1000010))` parses as `1/(w−1000005)²`, 11 % wrong, no warning (Phase 1 hardcodes
`warnings: []` while the UI is wired to show them).

**PSW-2 HIGH — the slice classifies refusals by regex on the error string**, which matches the _family
name_: the identical `opts.c must be positive` refusal (~24 % of a default `c` sweep) is red "Newton
diverged" for `*_singular` families and magenta "Unclassified" for the others; 6 of 10 real solver strings
mis-bucket. **PSW-8 MEDIUM** — the Inverse tab computes `trustedSignal: 'geometry'` for a near-cusp solution
and ignores it in the badge. **DIR-8 MEDIUM** — `isCusp` ignores the module's own second estimator, so a
smooth near-cusp is drawn as a filled ● "ordinary 3⁄2-cusp". **DIR-7 MEDIUM** — numerical mode shows a
green ✓ beside its own "the computed h is meaningless" warning. **DIR-5 MEDIUM** — the two bounded
non-singular weighted forward kernels never check univalence, so the realizability gate is dead for them
(18/27 swept kernels accepted silently). **ALG-7 MEDIUM** — three prove plans stamp `rigor: 'exact'` on "no
real solution" decided by a `1e-4` float test.

## 3. What crosses the wire is not this domain — cross-app

**★ WGT-1 CRITICAL (= SCH-11 = UI-3) — the four unbounded weighted families leak as classical Laurent
maps.** `phiToMapSpec` (`schwarz-export.mjs:31`) lacks the `phi.family` guard its bounded twin at `:57` has,
so `unboundedLQD`, `unboundedLQD_singular`, `unboundedPQD`, `unboundedPQD_singular` are serialised as
`form:"laurent"` — φ error **0.67–1.73 absolute on |z| = 2**, σ error up to **16.35 absolute / 2229×**.
It reaches three surfaces: the φ `kind:"map"` export, the σ recipe to Complex Dynamics
(`explainSigmaUnavailable` returns null = "exportable"), and the Hele-Shaw twist link. The consumer side
confirmed **nothing on the wire can refuse**: `weight` is undefined and `sourceDomain` absent; CD renders
all four silently (φ(2) error up to 87.6 %), Hele-Shaw accepts three of four. The in-app picture is right
(both dispatchers key on `phi.family`), so screen and wire disagree. It shipped green because no test
fixture in the repo has `{unbounded:true, family:"unbounded*"}`. Fix: one guard line + a `weighted` kind in
`classifyPhiForExport` so the explainers say why + four fixtures; emit `weight` so already-shared links can
be refused at the consumer. The schema has no seat for a weighted φ (`QuadratureDomain.weight` exists but
carries no α; no `MapSpec` form; nothing on the σ payload) — so **refuse at the producer** is the honest
fix now, and a `form:"weighted-laurent"` is the ADR-sized follow-on.
[`A2`](findings/A2-solvers-weighted.md), [`A6`](findings/A6-schwarz-sphere-gpu.md), [`A7`](findings/A7-ui-state-handoffs.md)

**UI-2 HIGH — QD and Hele-Shaw pick different roots of the same quartic for a negative charge.** On the
shipped `unb-1pt-neg` (α = −0.5, c = 0.7) QD returns z₀ = 2.2539 and Hele-Shaw's `realRootGeq1` takes
z₀ = 1.8478; the two φ differ by **37 %** (areas 0.4549 vs 0.3438). Both are genuine QDs (independent
boundary-integral check, ratio 1.000000000 each) and both pass the thesis's `φ(1) < w₀` selector, so the
consumer's claim that it "disambiguates" is false. Confined to α < 0 (0/296 ambiguous c-values at α > 0;
29/296 at α = −0.5). Fix is free on the wire: `phi.branches[0].z` is already carried and ignored — seed from
it and verify. The `QD_TO_HELESHAW_LINK` golden pins only `(α, w₀)` and nothing geometric.

**UI-4 MEDIUM — the exported figure PNG carries no reproducibility metadata**; QD is the one
figure-producing app not on `@cas/export` (SCH-5: the Schwarz/sphere view is also in neither the URL nor
the PNG). `@cas/export` has no DOM surface, so QD's deliberate non-adoption of `@cas/ui` does not apply.

## 4. Pictures that are wrong without saying so

**SCH-1 CRITICAL (cross-app) — the σ-mask fix from PR #337 erodes Ω by a _fixed world distance_.** The
2048² mask is built once per φ over the bbox, so its texel (6.665e-4 world units for the deltoid) never
shrinks on zoom, and the conservative stroke turns an unbiased ±½-texel error into a signed one-texel band
declared Ω^c — **at every σ-iterate**, so orbits are truncated too. Measured GPU↔CPU class agreement on the
deltoid: 100.00 % at 1×, 99.48 % at 30×, **94.81 % at 300×** — below the 98.87 % "grossly over-dilated,
must fail" floor the existing browser test was built to reject; near the cusp 63 % of pixels are in the
wrong class and the frame goes entirely "outside" at 1e-4 half-extent. Decisive control: re-running the
float64 CPU engine with Ω eroded by one texel recovers agreement 11 % → 76 %, and a 1e-7 perturbation moves
the CPU escape time for 0.3 % of points — so it is the mask, not float32 or conditioning. The shared
`@cas/gpu` `conservativeOmega` at Complex Dynamics' `size: 1024` has the same defect with a 2× wider band.
The mask test's zero-`KIND_INV` clause is now satisfied _by_ the erosion. Fix: when the mask says "not in Ω"
within one texel of the stroke, run ψ and let `acceptZ` decide (the exact predicate the fast path already
trusts); add class-agreement clauses at 30× and 300× to the browser test.
[`A6`](findings/A6-schwarz-sphere-gpu.md)

**SCH-3 HIGH** — with the renderer forced to "GPU", a φ the shader refuses (the four PQD families) leaves
the **previous domain's fractal on screen** under a status line saying it rendered. **UI-10 LOW** — the
boundary polyline is never re-sampled on zoom; past ~2× the curve is a visible polygon. **SCH-6 MEDIUM** —
the sphere leaks a `webglcontextlost` handler per loss and a restored context silently changes the escape
radius.

## 5. Shell, state and robustness

**★ UI-1 HIGH — every pure-polynomial preset's share link opens as "No quadrature domain found", the
deltoid included.** `parseAndApplyHText` inserts a placeholder grid row `{a:'0', order:1, residues:['0']}`
when `h` has no finite poles (`ui-h-text.mjs:119-122`) and `buildHData` (`ui.mjs:241-253`) feeds it to the
solver as a real node at the origin — unsolvable for an unbounded family. 5 of 41 presets (`unb-deltoid`,
`upqd-const-a2`, `upqd-mono-a2`, `upqd-mono2-a2`, `upqds-mono-a2`) regress on reload and on the plain
**Parse** button; the other 36 round-trip byte-identically. The deltoid is CLAUDE.md's named ground-truth
milestone and the headline of the σ hand-off; a reader following its link cannot capture φ or export σ. The
455-line `qd-url-state.test.ts` is green because it stubs `parseAndApplyHText` — the field-equality-not-verdict
trap CLAUDE.md's M6.2 already names. Fix: drop rows whose whole principal part is zero in `buildHData`, and
extend `h-text-roundtrip.test.js` one layer up to compare rebuilt `hData` against each preset's own.
[`A7`](findings/A7-ui-state-handoffs.md)

**PSW-3 HIGH** — one worker dying mid-sweep kills the whole parameter-slice render with a `TypeError`,
despite the pool's comment claiming a clean unwind (the test asserts the promise settles; production throws on
the `null` it settles with). **ALG-2 HIGH** — `MPoly.fromTermList` validates no exponent: a string exponent
makes `x^"2"` square to `x^22`, reachable through `importDAG`, autosave restore and the documented Maple
round trip. **ALG-3 HIGH** — `ExprParser` has no exponent cap and `MPoly.pow` is a naive loop:
`(z1+zb1)^6000` runs **131 s on the main thread** from the per-keystroke live preview. **ALG-6 MEDIUM** —
a latched worker-load failure (the realistic PWA stale-cache case) is never surfaced; Cancel stays visible and
does nothing. **UI-5/UI-7 MEDIUM** — the service-worker "new version available" banner and `#app-version`
are dead markup; a mid-session deploy silently breaks lazy chunks. **UI-6 MEDIUM** — the domain-plot canvas
is absent from the accessibility tree with no keyboard path (the Schwarz canvas is mouse-only too). **UI-8/9
LOW** — reload loses preset provenance; blocked `localStorage` changes the first-visit domain. **WGT-4 MEDIUM**
— `powerQD_singular` fails on 2 of 49 rotations of a problem it solves at the other 47 (no
rotation-equivariance test exists for any weighted family). **PSW-13 LOW** — a failed lazy chunk leaves a
silently blank tab.

---

## 6. Structural issues

- **The verdict layer is nine absolute constants on a scale-covariant problem.** `IDENTITY_TOL`,
  `QR_SINGULAR_TOL`, Newton `tolerance`, `phisEquivalent` `tol`, `minStep`, `parse-h`'s two epsilons,
  `CONVERGED_RESID`, `TOL_CONVERGE`, `DEFAULT_FD_EPS` as an additive step. A `norm.hScale` computed once in
  `define-family.mjs`'s `normalizeOpts` (every family already has the hook) is the single change most of §2
  hangs on. [`A1`](findings/A1-solvers-unweighted-core.md)
- **The identity verifier exists in six divergent copies and only one escalates.** ADR-0007's merge rule in
  the direction it is usually not read: the second consumer exists six times over. One shared
  `runIdentityCheck({momentsAt, rhsAt, scaleAt})` carrying the node-count policy, escalation and a fail-closed
  `underResolved`, with each family supplying only its moments and RHS.
- **`phi.family` is the de-facto weighted/classical discriminator and only half the consumers check it**
  (WGT-1). One `QD.familyOf(phi)` / `QD.isWeighted(phi)`. The φ struct has grown 11 optional slots with no
  constructor; `canonicalizePhi_QD` returns partial structs and works only because `clonePhi` defends every
  field (SOLV-4 is what that costs). A `makePhi(family, fields)` factory with a dev-build completeness assert.
- **`direct-common.mjs` is two files wearing one hat**: a classical half that derives `h` in closed form
  and never checks it, and a weighted half that computes `h` by probing the inverse solver's own `(★)` chain
  and is correct by construction. The one place the second discipline was not applied is the one place that
  is wrong (§1.1). Split, and move the generic polynomial helpers to `core/poly-helpers.mjs` (second
  consumers exist: `param-slice`, `algebra`).
- **A local root finder is the wrong tool for φ′ = 0** while the app ships a global polynomial root finder
  next door (`Direct.polynomialRoots`, used by `faber-analysis`). Duplication with a correctness cost (§1.4).
- **Sphere re-packs ~150 lines of Schwarz uniforms** (family switch, γ-branch merge, capacity checks,
  `rInfConj`) instead of the `renderFractalToTarget` extraction `PLAN-SPHERE.md:268` proposed; SCH-6's
  escape-radius drift is the first symptom, and the escape radius itself is defined three different ways.
  A genuine ADR-0007 second-consumer extraction.
- **A large, well-built part of `Sym` has no door.** `comprehensiveGroebnerSystem`, `radicalZeroDim`,
  `rationalUnivariateRep`, `padeApproximant`, `rationalReconstruct`, `verifySOS`, `curveGenus`,
  `idealIntersect`, `idealQuotient`, `hankelRank`, `seriesLog`, `seriesExp` — zero app callers, several
  `runJob`-dispatchable and so worker-ready. `AHARONOV_SHAPIRO.md` says the parametric step "is not in-engine";
  CGS runs on that exact system in 22 ms (`defective: true`). See §9.
- **The parameter slice runs a different solver from the Inverse tab and nothing says so** (1 restart,
  continuation/diverse/deflation off vs 8 restarts and all five phases). Measured class effect: nil once
  node counts match — but "No algebraic root" is a certainty claim made by a survey search. The
  warm-start's claimed 187× is measured at 1.0–1.2× (classical) and 4.6× (PQD). `param-slice-worker-entry`
  is the one worker entry not on `workers/protocol.mjs`, so an unknown message kind hangs its caller.
- **Cross-app duplication that hides bugs:** `family-sweep.mjs` re-derives "valid" by hand beside a
  comment saying it must match `param-slice-common`'s; `direct-verify.mjs` dispatches on `directState.weight`
  in one branch and `directState.lastWeight` in the other; the Hele-Shaw envelope serialises φ "for a future
  cross-check" and the consumer discards it (UI-2).
- **Test manifests are hand-synced three ways** (`node-test.js` `TESTS`, `vitest/node/*`, `_run.ts`
  `FLOORS`), which is how `worker-graph-cleanrealm` — the only test for "an ESM module uses a kernel
  without importing it", the shipped `solver-pqd-common.mjs` `ReferenceError` — has **no wrapper and never
  runs in CI** (TEST-1 HIGH). [`A9`](findings/A9-tests-tooling.md)
- Recorded as sound, so nobody re-litigates it: the staleness guards in `runStatusAnalyses` (token +
  identity, the pattern the rest of the app should copy); the ADR-0026 σ differential guard (a genuine
  three-way check); the ADR-0008 boundary (`sym-core` imports only `solver.mjs`, `@cas/exact` is a
  devDependency for the differential spec); `hardwareConcurrency` handling; `worker-crash-detail` as the
  right minimal shared primitive; the 197-leaf `QD.Strings` table has no dead strings.

## 7. Documentation drift

Full tables in [`A8`](findings/A8-docs.md) and in each agent's file. The drift is **entirely inside
`apps/quadrature-domains/`** — every repo-level QD statement checked (CLAUDE.md's jsdom count, chromium
probe, `@cas/ui` non-consumption, σ-mask and Hele-Shaw paragraphs; `docs/INTERCHANGE.md`'s version history;
ADR-0003/0006/0008/0009/0026 action items; `deploy-pages.yml`; `launch.json`) holds, with two exceptions
below.

- **DOC-1 HIGH — `thesis.txt` has had every mathematical symbol stripped**: 0 Greek, 0 math-alphanumeric,
  0 sub/superscript characters in 460,147. Theorem 3.2.2 reads `= (0) + -1()#.`; Theorem 3.3.1's criterion
  reads `|0|2 + 2Re () > 2||`. The two statements that falsify SOLV-2 are invisible in it, so **any past
  "checked against the thesis" claim based on this file is unverified.** A pdf.js extraction of the PDF
  keeps the math (2,340 Greek, 16,094 math-alphanumeric); `prop463.txt` (0 referrers) was evidently a
  one-page workaround. Replace it, and assert in a test that it contains Greek.
- **DOC-2 HIGH — `app/disabled/` does not exist at HEAD** (disk or `git ls-files`) and README points at it
  three times, HANDOFF nine, including a "re-enable checklist".
- **`THEORY_MAP.md`: 30 of 30 `file:line` references are stale**, three past end-of-file, worst +673
  (`solveInverseQD`); **no Chapter IV (PQD) section at all** while four PQD families ship. 164/164 _symbol_
  references resolve, which argues for dropping the line numbers rather than regenerating them.
- **519 of 1,052 backticked paths across the app-local docs are dead** — 496 in the three self-declared
  archives, **23 in live docs**. `HELPTEXT.md` names five files that moved; `ui-strings.mjs:36` tells
  editors to run a retired `version:sync` script; `app/test.html` loads three files the ESM migration
  deleted and README documents it twice as live.
- **README is classical-only on the Direct tab** (8 weighted forward kernels, the QD/PQD/LQD selector and
  26 of 26 `QD.Direct` exports absent); **the app's entire cross-app hand-off surface — three buttons,
  including the Hele-Shaw producer — is documented in no app-local doc**; `ARCHITECTURE.md` lists 6 of 10
  registered families.
- **`TODO.md` has five shipped items unchecked**, including `#21 URL state encoding` — the app's own
  share link. `PLAN-SPHERE.md` still reads "Status: ready for implementation" for a design that shipped as
  something else. `HANDOFF.md` is a well-maintained live changelog (current to PR #338) with **eleven
  `## (most recent)` headings**.
- **Two repo-level claims are false at HEAD:** CLAUDE.md and `vitest.workspace.ts` both say the QD maths
  "runs as one Vitest spec wrapping `node app/node-test.js`" — nothing spawns it; there are 29 per-file
  wrappers (`vitest.config.ts` describes this correctly and now contradicts the other two). README and
  ARCHITECTURE say the eager graph is "only the inverse solver"; `main.mjs:56-59` puts the exact-algebra
  kernel there (56.3 kB gzip of a 254.4 kB entry).
- Code comments stating the opposite of the code: `solver-pqd.mjs:20` ("0 ∈ Ω" for a family requiring
  0 ∉ Ω); `schwarz-inverse.mjs:231` (a closed-form inverse that does not exist); `schwarz-common.mjs:293`
  (unbounded `z_j ∈ 𝔻`; measured 4.054); `direct-common.mjs:35` (a different area normalisation from every
  other file); `param-slice-render.mjs` ("~0.03 ms vs ~5.6 ms"); `eslint.config.mjs` ("~294 findings"
  keep `no-unused-vars` at warn — the backlog is 0); `GROEBNER_INVESTIGATION.md` L2's premise is superseded
  by the elimination-ideal path it says does not exist.
- The Aug-23 review has no follow-up section; two of its six MEDIUMs are fixed and nothing says so.

## 8. Tests

The suite's assertions are tight (1,791 `ok()` calls, 13 skip markers, `approxEq` default 1e-8; 3.2 % weak
matchers in 2,849 `expect()`s; no order dependence; no idle flakiness). **Its weakness is what it does not
reach, and what it pins as intended.**

- **Tests that pin a defect as intended behaviour:** `direct.test.js:263,272,282` (the spurious unbounded
  pole — removing it makes them FAIL), `direct.test.js:718-723` (a genuine QD asserted as "non-QD"),
  `schwarz.test.js:404-411` (σ poles: "either 0 or 1 pole is acceptable"), `qd-url-state.test.ts` (stubs the
  function the bug is in), `param-slice-pool.test.ts:75-93` (asserts the promise settles; production throws on
  what it settles with), `schwarz-mask.browser.test.ts` (its zero-invalid clause is now satisfied by the
  erosion it was written to reject).
- **Mutation sweep, 26 mutants against both halves of the gate: 14 killed, 12 survived** (TEST-2).
  Survivors worth naming: `residualNorm` skipping a component — it **is** Newton's stopping criterion and is
  used in tests only as a helper; a dropped `conj` in `direct-common.mjs:566` that is 38 % wrong on `m ≥ 3`
  complex input and bit-identical on every existing fixture; spiral-like made unconditionally true; the
  boundary sampler's θ closure and endpoint ε (×10⁶); `continuationInC` never growing its step. Plus the
  per-agent survivors: `solver-qd.mjs:273`'s `?? 500` → `?? 120` (every bounded fixture has ρ ≤ 0.73);
  `parse-h.mjs:339`'s `1e-10` → `1e-6`; `solver-cmax.mjs`'s cusp branch deleted (it already is, in effect);
  `sym-core`'s single-factor path (already present).
- **Coverage gaps that let §1–§3 ship:** nothing asserts the classical identity verifier _rejects_ a wrong
  φ, at any scale; nothing composes direct with inverse for the classical families (the weighted section
  does, which is why it is sound); `classifyUnivalence`, `findCriticalPoints`, `continuationInC`,
  `direct-verify.mjs` and `classifyResult` have no test of their own; no fixture has an unbounded weighted φ;
  no test compares a slice pixel's class to a known answer; `QD_TO_HELESHAW_LINK` pins nothing geometric;
  20 files / 3,829 lines are reached by no test (the Direct and Sphere UI plus the lazy entries).
- **Infrastructure:** `worker-graph-cleanrealm` never runs in CI (TEST-1 HIGH);
  `sym-factor-recombine-cap.test.ts:33` asserts wall-clock < 4 s and goes red under load (5 false kills
  in the sweep); `typecheck` checks **one** file of 159 and the 149 Vitest `.ts` specs are outside the
  program; `perf:measure` cannot run on Linux/macOS; the `browser` job — the app's only boot test and only
  real-GLSL compile — is not a publish blocker, so the SCH-1 class ships (TEST-9); `solvers-3` at 33.5 s is
  3.2× `solvers-1` and sets the critical path.

## 9. Improvements to the core functionality

Grounded in what was observed; sizes S/M/L; prerequisites named. Ordered by value.

**Inverse + direct solvers**

1. **One identity verifier, ρ-sized, fail-closed (S–M).** §2's fix as a capability: `identityOK` means the
   same thing in all twelve families, N derives from `ρ = maxⱼ|zⱼ|` with UQD-style escalation as backstop,
   and `null` is returned when the error is still falling at the cap. Closes PSW-1, SOLV-14, PSW-8/9 and the
   slice's yellow class at once; measured +59 % on a slice render, −100 % of the false yellow.
2. **Non-dimensionalise the solver (S; prerequisite for most of §2).** `norm.hScale` in `normalizeOpts`,
   every gate a multiple of it. Also what makes the app usable in a user's own units, which the Hele-Shaw
   hand-off needs. Keep the `hScale ≈ 1` path byte-identical so goldens do not move.
3. **Make c\* exact where the thesis is (M).** Solve φ′ = 0 globally via `Direct.polynomialRoots`, then
   drive c\* by Newton on the scalar `max_{φ′=0}|z| = 1` with bisection as bracket. Unlocks Theorem 3.3.1's
   `c* = w₀ + √α` (missed by 1.6–2.8 % today), turns a confidence-0.5 `fold` into a certified `cusp`, and
   restores the critical-set overlay in the band it exists for.
4. **Theorem 3.3.1's existence criterion as a pre-flight gate (S).** `QD(α/(w−w₀)) ≠ ∅ ⟺ |w₀|² + 2Re α > 2|α|`.
   Today an inadmissible one-point request burns the whole multistart pipeline and reports "No algebraic
   root", indistinguishable from a solver failure. It turns a timeout into a theorem — the app's value
   proposition — on exactly the family the Hele-Shaw hand-off drives.
5. **Make the thesis coincidence equation the weighted families' verifier (S–M).** Eq. 4.3 / 5.2 / 5.3 as
   one FFT: negative-frequency mass must vanish for bounded, positive plus `c₀` for unbounded. Measured at
   1e-11…1e-16 on all eight families. It tests every Fourier mode instead of 3–9 hand-chosen functions and is
   the **only** check that sees `q` (wrong `q` reads 1.6e-1 against 1.3e-16); the current LQD verifier's
   far test points are 760× less sensitive than its near one. A 40-line prototype exists in A2's evidence.
6. **Fix the unbounded direct problem, then widen it to rational φ (S then M).** After §1.1, the real gap
   the README should describe is φ with poles in 𝔻* — the family's own ansatz and the only way an unbounded
   QD acquires finite nodes; `boundedQDRational` already does the per-pole computation, the unbounded twin is
   `forwardLocalPrincipal` at `zⱼ ∈ 𝔻*` plus the existing back-substitution. Unlocks §3.3's one-point family
   from the φ side.
7. **Give the Direct tab the same validity verdict the Inverse tab has (M; prereq 6).** Every family exposes
   `verifyQuadratureIdentity` and every kernel can build φ, so the direct pipeline can render the _same_
   badge on every recompute. One honest-labelling vocabulary across both directions; kills the DIR-1/2/5/7
   class at the point of display.
8. **Certify the geometric-properties card (S).** Two winding numbers in the sweep that already runs (§1.3)
   also give a new correct row — `# zeros of φ′ in 𝔻` — the quantity `critical-set.mjs` estimates with 157
   seeds.
9. **Put the weighted closed forms in the analytic-oracle gallery (M).** `thesis-examples.mjs` ships seven
   examples, all classical, two of which do not occur in the thesis (DIR-9). Theorems 5.3.2, 5.6.1,
   Example 4.3.1 (already a shipped preset with no oracle) and Theorems 4.5.1/4.5.3 are closed-form
   one-parameter families with stated univalence ranges — the only oracles that would test the weighted
   solvers against something other than themselves, and exactly what `family-sweep` and the slice want.
10. **Ship the two weighted limits and a rotation-equivariance test as regression tests (S)**: α → 1 ⇒
    `boundedQD`, α → 0⁺ ⇒ `boundedLQD` (both hold to O(α)); eight rotations per weighted preset with
    `|z₀|`, `|w₀|` and weighted area invariant to 1e-9 (this is the test that exposes WGT-4).
11. **An analytic Jacobian for the classical families (M).** `newtonSolve` already accepts `jacobianFn`; the
    FD Jacobian costs `n+1` residual evaluations per step and is accurate to 3.5e-7, which is what forces the
    central-difference upgrade near a cusp and caps how close to c\* Newton can reach. Note the schema
    families clamp inside `residual` and the hand-written ones do not, so the FD Jacobian already means two
    different things (A2).
12. **Close the singular-family `z₀ = 0` corner (M–L).** `solver-lqd-singular.mjs:25` defers it and the
    schema clamps `|z₀| ≥ 1e-3`, but `z₀ = 0` is the centred disk — Theorem 5.3.1's complete classification
    of null LQDs, the chapter's one fully-solved family, unreachable in-app. The `(φ₀)` normalisation is
    vacuous there, so it needs its own gauge; that is the work and why it was deferred.
13. **A scale-and-rotation regression family (S).** Each preset under the exact covariance
    `a → s·a, C_{j,s} → s^{s+1}·C_{j,s}, c → s·c` at s ∈ {1e-3, 1, 1e3} with every verdict asserted equal.
    Every §2 finding except SOLV-5 and PSW-2 would have been caught by that one file.

**Algebra engine**

14. **Expose the parametric case-split that is already built (S/M).** `comprehensiveGroebnerSystem` runs on
    the A&S parametric system in 22 ms (2 segments over `M₀, m₁, n₁`), and `parametricRealCount1D` is
    already wired for the real count on each 1-parameter segment. Turns "export to Maple and paste back" into
    an in-app answer for the slices the parameter-slice tab already sweeps. Step 0 is making CGS non-defective
    on that input (it duplicates a generator across segments), which is the real work; the doc claim that it
    is "not in-engine" is wrong.
15. **A radical/squarefree normalisation pass on every derived node (S; prereq ALG-1's fix).** `c·fᵏ` carries
    `k`× the degree into every later Gröbner/resultant/Hermite step and counts with multiplicity where the user
    wants domains; `radicalZeroDim` exists with no caller. An explicit, audit-trailed "replace by its radical
    (same variety)" reduction.
16. **Certify that a numerically-found QD is exactly algebraic (M; prereq 15).** All pieces exist and only the
    last link is unwired: numeric φ → the rational snap `prove-plan.mjs` already does → `padeApproximant` /
    `rationalReconstruct` (no callers) → clear denominators → `Sym.inIdeal`. `docs/ALGEBRA_MODULE.md:138`
    already advertises exactly this ("honest `=`").
17. **`MPoly.pow` by repeated squaring + a size budget shared by parser, `defineSubstitution` and
    `addEquation` (S).** Fixes ALG-3 and is on the hot path of every resultant and the monic transform;
    `previewCost` already exists as the seam.
18. **Cost-aware elimination-variable choice (S).** `eliminateWithGauge` takes `shared[0]` alphabetically;
    lowest-degree (preferring a degree-1 generator so `linearReduce` substitutes) lets the gauge batch succeed
    on systems that currently hit the Sylvester cap of 10.

**Parameter slice**

19. **α as a sweepable axis (M).** `listAvailableParams` enumerates residues, positions, coefficients, `c`,
    `q`, `w₀` — not α, the PQD family's defining parameter and the variable of the thesis's realizability
    statement. `diagnosePQDRealizability` already traces the α-branch fold for one point; an (α, C) slice
    would draw the curve. Risk: α crossing 1 changes family.
20. **Boundary tracing as an overlay (M).** The classification boundaries are smooth curves the quadtree
    spends its budget rasterising (37.5 % of cells coverage-filled at worst); a predictor–corrector march
    with the existing continuation machinery gives the curve to machine precision (the cardioid case is
    exactly `C₂ = 0.5`). Ship beside the raster, not instead of it.
21. **Slice state in the share link, an `unresolved` class, and an exported image with provenance (S each).**
    `#vs=` already carries `tab: 'param-slice'` and opens a blank canvas; ~15 lines add axes and ranges.
    The export should stamp the `h`, both `ParamRef`s, the quality preset and the identity node count
    actually used per pixel — the metadata PSW-1 shows is missing from the picture.
22. **Make the 1-D sweep first-class (S).** It is the default and has no per-pixel readout (PSW-6). A 1-D
    sweep is a curve, so plot the ordered class transitions with bracketing values — "univalent for
    C₂ ∈ [0, 0.500 ± 0.005]" is a theorem-shaped output the raster cannot give.
23. **Warm-start where it pays (S).** Gate the warm path on the family tag (1.0–1.2× classical, 4.6× PQD),
    which also removes the warm/cold rigor split (PSW-5).

**Schwarz / sphere / shell** (lower priority by the owner's brief)

24. Exact in-Ω test with the mask as pre-filter (§4; M; applies verbatim in `@cas/gpu`). 25. A GPU path
    for the four PQD families — one missing `cpow(v, 1/α)` primitive; removes SCH-3's failure mode (M).
26. Schwarz view in the `#vs=` link and the PNG via `@cas/export` (S). 27. `renderFractalToTarget`
    extraction so the sphere stops re-packing uniforms (M). 28. Share links carry `selectedSolutionIdx`, so
    a specific branch of a non-unique QD can be discussed in writing (S). 29. Refuse weighted exports now;
    a `form:"weighted-laurent"` MapSpec + a weighted σ engine in `@cas/schwarz` later (ADR-sized; unlocks
    Chapters 4–5 for Complex Dynamics).

**Tests, tooling, docs**

30. The eight unit tests that take the sweep from 14/26 to 22/26 (~60 lines); `continuationInC` under
    direct test via its trace; a wrapper for `worker-graph-cleanrealm` and a spec deriving the wrapper set
    from `TESTS`; the browser job as a publish blocker, then a `direct.browser.test.ts` covering 2,128 of
    the 3,829 unreached lines; one `resolveChromium()` for every Playwright entry point in the repo (CLAUDE.md
    already asks for it); rebalance the `solvers-*` shards by time (33.5 s → ~22 s critical path).
31. Replace `thesis.txt` with a faithful extraction and assert it contains Greek; a doc-path sweep against
    `git ls-files` in the lint step; a family-count assertion against `registerFamily(` sites; drop the line
    numbers from `THEORY_MAP.md`; a stated reading order at the top of README with the UI manual split into
    `USER-GUIDE.md`; `historical/` for `ESM-MIGRATION.md`, `PLAN-SPHERE.md`, `prop463.txt`; an app-local
    record of the three hand-off contracts; a follow-up table for the Aug-23 review.

---

## 10. Suggested order of work

Sized to one session each, ordered by value ÷ risk and by dependency. Every item lands with the regression
test that pins it and a negative control.

1. **The four one-line certificates.** WGT-1 guard + four fixtures (§3); UI-1 zero-row filter + the
   roundtrip test one layer up (§5); SCH-2 `evalPhi(z_j)` + a non-vacuous pole test (§1.5); ALG-1 single-factor
   path + `radicalReduced` (§1.2). Each is hours; together they remove the four false certificates a user is
   most likely to meet today.
2. **The unbounded direct problem** — DIR-1/2/3 as one commit with the direct↔inverse composition test the
   classical section never had (§1.1, improvement 6 stage 1).
3. **The verifier** — ρ-sized N + escalation + fail-closed `unresolved` in one shared `runIdentityCheck`
   (improvement 1), then `hScale` (improvement 2) and the dimensionally-correct floor (SOLV-1). The
   scale-and-rotation regression family (improvement 13) lands with it.
4. **Critical points and c\*** (improvement 3) with the three closed-form oracles the suite lacks.
5. **Univalence and cusps** — DIR-4's winding numbers, DIR-8's second estimator, DIR-5's dead gate, WGT-2/3's
   refusals, PSW-2's structured refusal tags.
6. **The wire** — UI-2 (seed from `phi.branches[0].z`, verify, pin z₀ in the golden), emit `weight`,
   `@cas/export` metadata on both figure paths (UI-4, SCH-5), `selectedSolutionIdx` in the link.
7. **The mask** — SCH-1's exact fallback in QD and `@cas/gpu`, with 30×/300× agreement clauses in both
   browser suites; SCH-3's stale frame; SCH-6's handler leak.
8. **Robustness** — PSW-3, ALG-2, ALG-3/17, ALG-6, UI-5/7, `param-slice-worker-entry` onto the protocol.
9. **Tests and CI** — improvement 30, in the order listed (TEST-1's wrapper first; it is one file).
10. **Docs** — improvement 31; DOC-1 and DOC-2 first.
11. **Then the research-facing improvements** in §9's order: 4, 5, 9, 14, 19, 20, 16.

## Finding index

Severity as assigned by the reviewing agent; duplicates across agents are noted. Ids link to the findings
files: [A1 solvers/core](findings/A1-solvers-unweighted-core.md) · [A2 weighted](findings/A2-solvers-weighted.md) ·
[A3 direct/analysis](findings/A3-direct-analysis.md) · [A4 algebra](findings/A4-algebra.md) ·
[A5 slice/workers](findings/A5-param-slice-workers.md) · [A6 Schwarz/sphere/GPU](findings/A6-schwarz-sphere-gpu.md) ·
[A7 UI/state/hand-offs](findings/A7-ui-state-handoffs.md) · [A8 docs](findings/A8-docs.md) · [A9 tests/tooling](findings/A9-tests-tooling.md).

| Severity | Ids |
| --- | --- |
| CRITICAL (6, 4 distinct) | DIR-1 · ALG-1 · WGT-1 (= SCH-11 = UI-3) · PSW-1 (= SOLV-14) · SCH-1 |
| HIGH (21) | DIR-2 · DIR-3 · DIR-4 · SOLV-1 · SOLV-2 · SOLV-3 · SOLV-4 · SOLV-5 · SOLV-14 · SCH-2 · SCH-3 · SCH-11 · UI-1 · UI-2 · UI-3 · PSW-2 · PSW-3 · ALG-2 · ALG-3 · DOC-1 · DOC-2 · TEST-1 |
| MEDIUM (43) | SOLV-6/7/8 · WGT-2/3/4 · DIR-5/6/7/8/9 · ALG-4/5/6/7/8 · PSW-4/5/6/7/8/9 · SCH-4/5/6 · UI-4/5/6/7 · DOC-3…8 · TEST-2…9 |
| LOW / NIT (36) | SOLV-9…13 · WGT-5/6/7 · DIR-10/11/12 · ALG-9/10/11 · PSW-10…14 · SCH-7…10 · UI-8…11 · DOC-9…13 · TEST-10…13 |

Three prior findings are re-reported as still open, one line each in the agents' files: 07-#7 (share-link
legacy fallback), 07's `condEst` diagonal-ratio bound and `Taylor.invert` absolute guard (documented, not
fixed). Everything else from the two 2026-08 reviews touching this app was verified fixed.
