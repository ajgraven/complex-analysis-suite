# A1 — Inverse-problem solver core (unweighted QD/UQD) + the numeric kernel

## Scope covered

**Read end to end:** `app/solvers/{solver.mjs, solver-qd.mjs, solver-uqd.mjs, solver-faber.mjs,
solver-continuation.mjs, solver-cmax.mjs, solver-taylor-common.mjs, define-family.mjs}`,
`app/qd/{qd-equations.mjs (generator + oracles), qd-varscheme.mjs}`, `app/core/{parse-h.mjs,
poly-helpers.mjs, taylor.mjs, complex.mjs}`, the `@cas/core` seams actually called
(`packages/core/src/poly.ts` `trim`, `series.mul`, `complex.ts` `div`), the `@cas/faber` seam
(`app/analysis/faber-analysis.mjs`), the interchange export edge
(`app/schwarz/schwarz-export.mjs`), and — reached *through* `solver-cmax.mjs` —
`app/analysis/critical-set.mjs` (A3's file; see SOLV-3, flagged cross-scope).
Docs: `THEORY_MAP.md`, `SCHWARZ_FORMULATION.md`, `CONTRIBUTING.md` (§Adding a new family).

**Thesis correspondence — re-done against the faithful extraction.** Per the coordinator's
correction I re-ran **every** thesis check against
`scratchpad/pdftool/thesis-pdfjs.txt`, not `apps/quadrature-domains/thesis.txt`. Nothing I
had concluded changed (all my thesis checks had come back *clean*, and the (★) derivation was
mine from eq. 2.9 plus numerics, not a reading of mangled glyphs) — but the faithful text
**sharpened two of them and produced a new closed-form oracle that the app fails** (SOLV-2).
Lines cited below are `thesis-pdfjs.txt` line numbers.

**Re-derived from the thesis and checked numerically:** the (★)/(●) system for a one-node QD,
a two-node QD, a node with a `C_{j,2}` derivative term, and the unbounded Laurent family
(finite poles, polynomial-at-∞ part, and both together); both conventions.

**In scope but NOT reached:** `app/solvers/seeds/*` beyond `seeds-qd.mjs`/`seeds-uqd.mjs`
(read, not probed); `app/core/qol.mjs`; `primary-solution.mjs` / `primary-solver-worker.mjs`
(read only — covered by the Aug-23 review, no churn in my paths); `qd-constraints.mjs` (A3's
univalence territory — I only checked that `generateSchwarzBounded` agrees with the numeric
solution); `h-text-roundtrip.test.js` / `riemann.test.js` ran inside the headless suite but
were not individually audited. No browser run — every finding below is reachable from node.

## Health

| command | result |
| --- | --- |
| `node app/node-test.js` | **2342 passed, 0 failed** (exit 0), baseline green |
| ESM probe harness (`scratch/A1/boot.mjs` — imports `solver.mjs` + the 22 family/seed modules directly) | 12 families registered, `solveInverseQD`/`QD.Faber` live |
| `git status --short` | empty before and after (no repo file touched) |

**Thesis checks that came back clean** (recorded as non-findings — a silent π/2πi error here
would be CRITICAL), all against the faithful extraction:

- **Conventions, verbatim** (`thesis-pdfjs.txt:502`, `:958`): "𝑑𝐴 The normalized area measure:
  𝑑𝐴 = 𝑑𝑥𝑑𝑦/𝜋" and "Contour integrals are normalized such that the standard factor of 2𝜋𝑖 is
  suppressed." Exactly what `THEORY_MAP.md`'s Conventions section claims. I verified them
  operationally: `∫_Ω f dA/π = Σ_{j,s} C_{j,s}·f^{(s−1)}(a_j)/(s−1)!` against an independent
  Gauss–Legendre × trapezoid pullback `(1/π)∫_𝔻 f(φ)|φ′|²`, for f ∈ {1, w, w², w³} on the disk,
  the cardioid (order-2 pole) and three two-node QDs (real, complex, mixed order):
  **max relative error 4.5e-11**, limited by my quadrature, not the app (`scratch/A1/t1.mjs`,
  `t2.mjs`).
- **Unbounded (`thesis-pdfjs.txt:963-979`: integrals over an unbounded Ω are Cauchy principal
  values).** Same check over 𝔻\* with absolutely convergent f = 1/(w−b)^n, n = 3,4,5 —
  finite-pole family (real and complex residues) **relerr < 1e-10**; the deltoid `h = w²`
  reproduces the residue-at-∞ term (−1) exactly; `h = 0.4w + 1/(w−3)` (both blocks at once)
  **relerr ≤ 8.9e-10** (`t3.mjs`, `t19.mjs`).
- **Theorem 3.2.2 eq. (3.6)** (`:3624-3645`): `𝜑 = 𝜑(0) + Φ⁻¹_𝜑(ℎ)^#` — exactly the ansatz in
  `solver-qd.mjs`'s header and in `THEORY_MAP.md`.
- **Equation (2.9)** (`:2650-2694`):
  `Φ⁻¹_𝜑[1/(𝑤−𝑤₀)ⁿ](𝑧) = (1/(𝑛−1)!)·[𝜓′(𝜉)/(𝑧−𝜓(𝜉))]^{(𝑛−1)}|_{𝜉=𝑤₀}`. Expanding
  `ψ′/(z−ψ)` in `(z−z_j)^{-k}` gives `A_k = Σ_{s≥k}(s/k)·C_s·[t^s]ψ̃^k` — literally
  `solver-faber.mjs:78-86`, and THEORY_MAP's `(s/k)` is the **ratio** `s÷k`, not a binomial.
  (The Bell-polynomial form eq. 2.10 at `:2700-2726` is the same statement.)
- `qd-equations.mjs`'s FORWARD dual `C_s = Σ_{k≥s}(k/s)A_k[t^k]φ̃^s` round-trips against
  `inverseFaberAtPole` to **7.0e-16** for m = 1..4 (`t4.mjs`).
- `QDEquations.generateClassicalBounded` **and** `generateSchwarzBounded` both evaluate to ≈0
  at the numeric solution for 6 configurations (1 node order 1/2/3; 2 nodes order 1, mixed
  order, complex): **max |eq| ≤ 5.7e-11** (`t5.mjs`).
- FD Jacobian is correct: against a 4-point Richardson central difference with per-variable
  step, forward mode errs `1.0e-7…3.5e-7` relative to the Jacobian scale and central mode
  `1.1e-12…9.5e-10` — exactly the O(ε)/O(ε²) split the code claims (`t9.mjs`).
- The Hele-Shaw interchange comment (`schwarz-export.mjs:313`) — "the QD normalizations touch
  the quadrature-COEFFICIENT interpretation `∫∫g dA = π·Σ residue·g(aₖ)`, not the residue
  itself" — is **arithmetically correct** under the verified convention, so `α = residue`
  rides the canonical wire with no conversion, as documented. It also matches the thesis's own
  one-point statement `∫ 𝑓 𝑑𝐴(𝑤) = 𝛼 𝑓(𝑤₀)` (`:1621`).

**Cross-agent confirmations (asked for by the coordinator):**

- **A5 / PSW-1 — confirmed and localised**, now reported as **SOLV-14** with the measured onset
  (ρ ≈ 0.965) and the fail-closed caveat.
- **A2's `h ≡ 0` claim — confirmed for `boundedQD` in one line:** `solveInverseQD({poles:[],
  polyPart:[]}, {bounded:true, w0:0})` returns `success:true, residual:0, branches:[],
  univalent:true, identityOK:true` with **every boundary sample equal to `{re:0,im:0}`** — i.e.
  the constant map φ ≡ 0 is certified a univalent quadrature domain, because the empty residual
  vector is trivially zero, the degenerate one-point "polygon" cannot self-intersect, and
  `maxRelDiff = 0` with `areaScale` floored to 1 (`scratch/A1/t31.mjs`). The right gate is a
  precondition in `normalizeOpts`: a bounded QD needs `Σ_j |C_{j,1}| > 0` (its area), so
  `h ≡ 0` should be refused by name, not solved.

---

## Findings

### SOLV-1 [HIGH] [confirmed] The quadrature-identity verifier's relative-difference floor has the wrong dimensions — it FALSELY REJECTS a correct bounded QD and FALSELY ACCEPTS a 10%-wrong unbounded one, purely as a function of the domain's scale

- **Where:** `app/solvers/solver-qd.mjs:281-288` (`areaScale = Σ|C_{j,1}|`) and `:340`
  (`const scale = Math.max(|lhs|, |rhs|, areaScale)`); the identical construction in
  `app/solvers/solver-uqd.mjs:157-161` and `:236`; consumed by
  `app/solvers/solver.mjs:1398` (`identityOK = identity.maxRelDiff < identityTol`),
  `IDENTITY_TOL = 1e-6` at `solver.mjs:120`, gated on by `isValidQD` (`solver.mjs:1518`) and
  by `solver-cmax.mjs:121`.
- **What:** the bounded verifier compares the boundary moment `M_k = (1/N)Σ w^k·conj(w)·φ′·z`
  against `Σ_j Σ_s C_{j,s}·binom(k,s−1)·a_j^{k−s+1}`. Both carry units of **w^{k+2}**. The
  floor it divides by is `areaScale = Σ|C_{j,1}|`, units **w²** — short by `|a|^k`. So
  whenever `rhs ≈ 0` (exactly what a symmetric domain gives at odd k) the reported `relDiff`
  is `≈ 1e-16·|a|^k` rather than `≈ 1e-16`. The unbounded verifier has the same floor against
  test functions `1/(w−b)^k`, whose magnitude *shrinks* like `w^{2−k−s+1}`, so there it
  over-normalises and the check goes **vacuous** at large scale.
- **Evidence:**
  *False reject (bounded).* Typed straight into the h box and routed through `parseH`
  (`scratch/A1/t21.mjs`):

  | h(w) | univalent | Newton residual | identityOK | maxRelDiff |
  | --- | --- | --- | --- | --- |
  | `0.5/(w-0.6) + 0.5/(w+0.6)` | true | 7.7e-14 | **true** | 1.45e-13 |
  | `4500000/(w-1800) + 4500000/(w+1800)` | true | 5.1e-13 | **false** | 2.92e-6 |
  | `12500000/(w-3000) + 12500000/(w+3000)` | true | 8.2e-13 | **false** | 1.06e-5 |

  Those are the *same domain* at s = 1, 3000, 5000 — the quadrature identity is exactly
  covariant under `a → s·a`, `C_{j,s} → s^{s+1}·C_{j,s}`, and the solved `A` then scale by `s`
  with `z` unchanged (measured to 8e-14, `t11.mjs`). Threshold **s ≈ 2500** (`t15.mjs`:
  s=2000 → 6.2e-7 pass; s=3000 → 2.9e-6 fail). Per-k dump at s=1e5 (`t14.mjs`): `k=3` has
  `rhs = 0` exactly, `lhs = 6.9e8`, `areaScale = 1e10` ⇒ `relDiff = 6.91e-2`, while
  k = 0,2,4 all read 5e-16.
  *Negative control:* an **asymmetric** domain at s = 1e5 (`0.6s²/(w−0.6s) + 0.4s²/(w+0.4s)`,
  `w0 = 0.1s`) reads `maxRelDiff = 6.4e-15` and passes — so this is the vanishing-moment
  normalisation, not generic large-scale float loss (`t15.mjs`).
  *False accept (unbounded).* `h = s²/(w − 2s)` at `c = 2s`, solved, then `A_{1,1}` perturbed
  by a fixed *relative* amount and re-verified (`t16.mjs`, `t17.mjs`):

  | s | φ exact | A×1.01 | A×1.1 | A×1.5 |
  | --- | --- | --- | --- | --- |
  | 1 | 1.2e-14 | 5.57e-3 rej | 5.70e-2 rej | 1.17e-1 rej |
  | 1e3 | 2.4e-17 | 5.57e-6 rej | 5.70e-5 rej | 3.10e-4 rej |
  | 1e4 | — | **5.57e-7 PASSES** | 5.70e-6 rej | 3.10e-5 rej |
  | 1e5 | — | **5.57e-8 PASSES** | **5.70e-7 PASSES** | 3.10e-6 rej |

  A Riemann map whose leading branch coefficient is **10% wrong** is certified as satisfying
  the quadrature identity at s = 1e5. Sensitivity falls exactly like 1/s.
- **Why it matters:** `identityOK` is the guardrail separating "a root of (★)/(●)" from "a
  genuine quadrature domain" — `isValidQD` requires it, the on-plot validity badge shows it,
  and `solver-cmax` anchors the c\* bracket on it. One direction tells a user their correct
  domain is not a QD; the other certifies a wrong one. Both break honest labelling.
- **Fix:** give the floor the right dimensions. Compute a domain radius once —
  `R = max(max_j |a_j − w₀|, max_n |w_n − w₀|)` over the boundary samples already in hand —
  and use `scale = Math.max(|lhs|, |rhs|, areaScale · R^k)` in the bounded verifier, and the
  reciprocal power in the unbounded one. Cheapest correct variant: non-dimensionalise first,
  `u = (w − w₀)/R` — the identity is exactly covariant under that, so every k lands at O(1)
  and one `1e-6` tolerance is meaningful again.
  **Pin it with two tests:** (a) the same domain at s = 1 and s = 1e4 must give `maxRelDiff`
  within one order of each other; (b) a φ with one `A` perturbed by 1% must be **rejected** at
  every scale — there is currently no test anywhere that asserts the classical verifier
  rejects a wrong φ (see Tests).
- **Prior:** new.

---

### SOLV-14 [HIGH] [confirmed] The BOUNDED identity verifier is a fixed 500-node trapezoid with no escalation, so a genuine QD whose Riemann-map pole nears the circle is badged "identity not satisfied" — false from ρ ≈ 0.965, and at ρ ≳ 0.98 the check stops discriminating at all `[cross-ref PSW-1 (A5)]`

- **Where:** `app/solvers/solver-qd.mjs:273` (`const N = options.numSamples ?? 500;` — a single
  pass; there is no `evalAtN` loop in this file) against
  `app/solvers/solver-uqd.mjs:433-445`, where the unbounded family *does* escalate
  (`while (res.ratio < CUSP_RATIO_GATE && … && N*2 <= cap) { N *= 2; … }`) and floors at
  `baseN = max(numSamples, 1500)` (`:88`). Consumed identically by `_computeIdentity`
  (`solver.mjs:1395-1401`) → `identityOK` → `isValidQD` (`:1518`), the on-plot validity badge,
  and `solver-cmax.mjs:121`.
- **What:** on `|z| = 1` the integrand `w^k·conj(w)·φ′·z` is analytic in an annulus bounded by
  φ's own pole at `1/conj(z_j)`, so the uniform trapezoid converges geometrically at rate
  `ρ^N` with **ρ = max_j |phi.branches[j].z|**. A fixed N = 500 therefore has a hard ceiling:
  once `ρ^500 ≳ 1e-6` (ρ ≳ 0.9726) the quadrature error alone exceeds `IDENTITY_TOL` and a
  correct domain is rejected. A5's `ρ`-based prediction is right, and the threshold is sharp.
- **Evidence:** (`scratch/A1/t30.mjs`, `t32.mjs`, `t33.mjs`) sweeping `h = C₁/(w−1) + 1.54/(w+1)`,
  which sweeps ρ; `maxRelDiff` for the SOLVED (correct) φ:

  | C₁ | ρ = max\|z_j\| | N = 500 | N = 16000 | verdict at N = 500 |
  | --- | --- | --- | --- | --- |
  | 0.90 | 0.76807 | 1.3e-15 | 6.6e-15 | ok |
  | 0.70 | 0.87502 | 5.6e-15 | 4.6e-15 | ok |
  | 0.65 | 0.91517 | 6.8e-13 | 2.9e-13 | ok |
  | 0.62 | 0.94451 | 3.2e-7 | 3.3e-10 | ok (last one) |
  | **0.60** | **0.96739** | **3.6e-3** | **1.5e-12** | **REJECTED** |
  | 0.59 | 0.98019 | 2.0e-1 | 5.6e-13 | REJECTED |
  | **0.58** | **0.99420** | **1.3e+0** | **1.4e-12** | **REJECTED** |

  So the false rejection starts at **ρ ≈ 0.965** — matching `ρ^500 = 1e-6` at ρ = 0.9726 — and
  A5's exact case (`0.58/(w−1) + 1.54/(w+1)`) reads 1.28 at the default and **1.33e-12 at
  N = 8000** (full convergence trace: 500→1.28, 1000→6.60e-1, 2000→8.45e-2, 4000→2.10e-5,
  8000→1.33e-12, `t30.mjs`). The Newton residual there is machine-level, `univalent` is true:
  **it is a genuine QD.** *Negative control:* the shipped preset as shipped
  (`1.5/(w−1)+1.5/(w+1)`, ρ = 0.618) reads 3.8e-14 at N = 500 — this only bites on an edited /
  dragged residue split, which is precisely what the slider and the parameter slice do.
- **The opposite error, measured rather than assumed.** I checked whether a too-coarse rule can
  also *pass* a wrong φ: perturbing `A_{1,1}` by 1 % at every ρ in the sweep is still rejected
  at N = 500 (`bad1% = 1.5e-2 … 1.3e+0`), because where the quadrature error first crosses 1e-6
  the perturbation error is already three orders larger. So **no masking window was observed**
  in this family — the honest statement is not "it certifies a wrong domain" but that
  **at ρ ≳ 0.98 `identityOK` is a constant `false`**: right and 20 %-wrong both read ~1e0
  (`t31.mjs`), so the check that exists to reject spurious algebraic roots carries **zero
  discriminating information** in that band. It has stopped being a test rather than become a
  wrong one. (Note this is a *different* failure axis from SOLV-1, which is about the
  normalising denominator and does go both ways.)
- **`estimateAccuracy.underResolved` cannot save it:** `app/analysis/observables.mjs:284` sets
  the flag by comparing the error at N and 2N, but it is page-side diagnostics read by the
  accuracy card — it is not on the `identityOK` path at all, so the badge is decided before
  anything can flag the resolution.
- **Why it matters:** the badge says a genuine quadrature domain is not one, on a shipped
  preset after one slider drag, and the parameter slice inherits the same verdict per pixel.
  This is the honest-labelling guardrail failing in the loudest possible place.
- **Fix — both, and in this order.** (1) **Derive the node count from ρ**, which is the
  principled part and is free: the required N for tolerance `τ` is `≈ log τ / log ρ` with a
  safety factor, and ρ is already in hand (`max_j |phi.branches[j].z|`, one pass over
  `phi.branches`). Set `N = clamp(500, ceil(2.5·log(τ)/log(ρ)), cap)`. Measured against the
  table above that gives N ≈ 1150 at ρ = 0.9726 and N ≈ 5900 at ρ = 0.994 — both sufficient.
  (2) **Then add the UQD-style escalation loop as the backstop**, so a shape the ρ estimate
  under-serves (a near-cusp φ, where the integrand sharpens for a reason ρ does not see) still
  converges; the unbounded family's `evalAtN` + doubling + `improved` guard is directly
  reusable and should be lifted into shared machinery rather than copied. (3) Report the node
  count actually used and whether it escalated, and make `underResolved` fail **closed** —
  `identityOK` should be `null`/indeterminate, not `false`, when the error is still falling at
  the cap. Pin with: `0.58/(w−1)+1.54/(w+1)` must come back `identityOK === true` at the
  default options, and a 1 %-perturbed φ on the same h must come back `false`.
- **Prior:** new; independently confirmed from A5's report (PSW-1). A5's `ρ` mechanism and node-count
  prediction are correct; the measured onset is ρ ≈ 0.965.

---

### SOLV-2 [HIGH] [confirmed] `estimateMaxConformalRadius` under-reports c\* by 1.6–2.8 % against the thesis's own closed form for the one-point family, and labels the mechanism `fold` where Theorem 3.3.1 proves a (3,2) cusp

- **Where:** `app/solvers/solver-cmax.mjs:296` (`mechanism = (loCrit >= CUSP_NEAR) ? 'cusp' : 'fold'`),
  `:127` (the cusp branch, gated on `g >= CUSP_NEAR = 0.95` from `critModulus`, `:88-99`),
  `:299` (`cMax: cLo`). Root cause is SOLV-3.
- **What:** the thesis gives this family in closed form. `thesis-pdfjs.txt:3773` — Theorem
  3.3.1 — and the explicit Riemann map at `:3990-4045`: for `ℎ = 𝛼/(𝑤 − 𝑤₀)` with `α > 0`,
  "*Such a 𝑧₀ can be shown to exist if and only if 0 < 𝑐 ≤ 𝑤₀ + √𝛼*", i.e.
  **c\* = w₀ + √α** exactly (with `t* = 𝑤₀(𝑤₀ + 2√𝛼)`), and Theorem 3.3.1(2): "*the family
  terminates with the formation of a (3, 2) cusp at 𝑡 = 𝑡\**". The app's estimator misses both:

  | α | w₀ | thesis c\* = w₀+√α | app `cMax` | rel. error | app `mechanism` | `confidence` |
  | --- | --- | --- | --- | --- | --- | --- |
  | 1 | 2 | 3.000000 | 2.943191 | **1.89e-2** | fold | 0.500 |
  | 0.5 | 2 | 2.707107 | 2.663283 | 1.62e-2 | fold | 0.500 |
  | 4 | 2 | 4.000000 | 3.902971 | **2.43e-2** | fold | 0.500 |
  | 1 | 1 | 2.000000 | 1.944411 | **2.78e-2** | fold | 0.500 |
  | 2 | 3 | 4.414214 | 4.339582 | 1.69e-2 | fold | 0.500 |

  `α = 1, w₀ = 2` is the app's own shipped preset `unb-1pt-pos`. The error is **25× the
  estimator's declared `relTol = 1e-3`**.
- **Evidence:** `scratch/A1/t26.mjs` (table above). Mechanism, from `t27.mjs` — a manual c-sweep
  of the real solver on `h = 1/(w−2)`:
  ```
   c      success univ  idOK  maxRelDiff   g = max|z| over φ′ zeros
   2.5     true    true  true  1.95e-14     0.922440
   2.8     true    true  true  2.74e-13     NaN (none found)
   2.9     true    true  true  3.58e-12     NaN (none found)
   2.943   true    true  true  9.06e-7      NaN (none found)
   2.95    true    true  false 5.97e-6      NaN (none found)
   2.99    true    true  false 1.21e+0      NaN (none found)
   3.0     false   —     —     —            —            ← solver itself stops here
  ```
  The solve **fails outright at c = 3.0**, i.e. the solver already knows the true boundary; the
  estimator stops at 2.943 because `critModulus` returns NaN for every c ≥ 2.6 (SOLV-3), the
  cusp branch can therefore never fire, and the gate falls back to the identity check — which
  degrades from 3.6e-12 to 1.2e+0 as the hole thins. That is *precisely* the failure mode the
  two-regime gate was written to prevent (`solver-cmax.mjs:38-49`), and it is inert.
- **Why it matters:** c\* is the headline number of the "Estimate max c" card and the boundary
  between "this domain exists" and "it does not" — the thesis's central one-point
  classification. A 2 % under-estimate with a *wrong* mechanism word and a confidence of 0.5
  reads as a soft answer to a question that has an exact one. It also means the app cannot
  reproduce Figure 3.1/3.3's critical time.
- **Fix:** (1) fix SOLV-3 so the cusp regime is reachable. (2) Add the closed form as a
  **test oracle**: `c* = w₀ + √α` for the one-point α>0 family, asserted to `relTol`. (3) Once
  the geometric criterion works, report `mechanism: 'cusp'` here and raise the confidence
  accordingly. (4) Consider solving `max_{φ′(z)=0}|z| = 1` for c directly by Newton (it is a
  scalar equation) with the bisection kept only as a bracket — that turns `≈` into a number
  with a residual.
- **Prior:** new. *(Thesis correspondence established against `thesis-pdfjs.txt`, not the
  broken `thesis.txt`, where this passage reads `0 <  ≤ 0 + √` and is unusable.)*

---

### SOLV-3 [HIGH] [confirmed] `QD.findCriticalPoints` returns an EMPTY set once φ′'s zeros approach |z| = 1 — the only regime it exists to report — so the cusp overlay and every cusp-gated verdict go silent exactly when the cusp forms `[cross-scope: A3's module, found through solver-cmax]`

- **Where:** `app/analysis/critical-set.mjs:193-247` (`findCriticalPoints`), its fixed seed grid
  `_defaultSeeds` (`:75-92`, 13 radii × 12 angles + origin = 157 seeds) and the undamped
  complex Newton `_newton` (`:136-153`). Consumers in my scope:
  `solver-cmax.mjs:88-99` (`critModulus`) → the two-regime gate; per `THEORY_MAP.md` also the
  inverse-tab critical-set overlay and `QD.estimateAccuracy`'s `nearCusp`/`cuspDistance`.
- **What:** for the one-point unbounded family `h = 1/(w−2)`, φ′ has two simple zeros that
  migrate outward toward |z| = 1 as the gauge c grows. `findCriticalPoints` finds them at
  c = 2.5 and then finds **nothing at all** from c = 2.6 on — `stats.nConverged = 0` out of
  157 seeds — although the zeros exist, are simple, and are well conditioned there.
- **Evidence:** (`scratch/A1/t28.mjs`, `t29.mjs`) For this family
  `φ′(z) = c + conj(A)/(1 − conj(z₁)z)²`, so the zeros are available in closed form. Measured
  against them:

  | c | `findCriticalPoints` | exact |z| of φ′ zeros | φ pole at 1/|z₁| | `nConverged` |
  | --- | --- | --- | --- | --- |
  | 2.5 | `[0.92244, 0.92244]` | 0.92244, 0.92244 | 0.889018 | 2 / 157 |
  | 2.6 | `[]` | 0.939799 | 0.913093 | **0 / 157** |
  | 2.7 | `[]` | 0.956199 | 0.936185 | **0 / 157** |
  | 2.9 | `[]` | 0.986259 | 0.979592 | **0 / 157** |
  | 2.99 | `[]` | 0.998663 | 0.997996 | **0 / 157** |

  These are genuine roots: at the c = 2.6 location `|φ′| = 8.9e-16` and `|φ″/2| = 11.7`
  (simple, well conditioned). The seed grid's nearest radii are 0.92 and 0.98, and φ's own
  **double pole** at 1/|z₁| sits 0.027 away from the zeros and closes to 0.0007 by c = 2.99 —
  every Newton path is captured by it, and `_newton` is undamped with no pole awareness, so it
  either diverges (`MAX_Z`) or hits `max-iter`. The failure is silent: `findCriticalPoints`
  returns `{points: [], stats: {...}}` and every caller reads that as "no critical points",
  which is the opposite of the truth.
  *Negative control:* c = 2.5 works and matches the closed form to 5 decimals.
- **Why it matters:** `THEORY_MAP.md` states the contract as "Zeros near |z| = 1 predict
  imminent failure as parameters vary" — the overlay is blank in exactly that band. It is the
  proximate cause of SOLV-2's wrong c\*, and it silences the near-cusp signalling
  (`estimateAccuracy.nearCusp`) that the #11 work built.
- **Fix:** for the classical families φ′ = 0 is a **polynomial** equation — clearing
  `∏_j (1 − z̄_j z)^{m_j+1}` (and `z^L` for the Laurent part) gives a polynomial whose roots
  are exactly the critical points — so use the app's existing global root finder
  (`QD.Direct.polynomialRoots`, Durand–Kerner + Newton polish, already used by
  `faber-analysis`) instead of a seeded local Newton. That is exact, seed-free and
  scale-free. If a local method must be kept for the weighted families, at minimum (a) add
  seeds on a small ring around each φ pole `1/conj(z_j)`, (b) damp the Newton step, and
  (c) **make an empty result distinguishable from a converged-empty one** — return
  `{points: [], complete: false}` when `nConverged === 0` while seeds were tried, and have
  `critModulus` treat that as "unknown" rather than "none".
  Test: assert `findCriticalPoints` reproduces the closed-form |z| for `h = 1/(w−2)` at
  c ∈ {2.5, 2.7, 2.9, 2.99} to 1e-6.
- **Prior:** new.

---

### SOLV-4 [HIGH] [confirmed] `sameDomain` / `phisEquivalent` ignore `c`, `polyA`, `z0`, `alpha` — two unbounded QDs with a 2× different conformal radius are reported as THE SAME DOMAIN

- **Where:** `app/solvers/solver.mjs:1755-1772` (`canonicalizeByRotation` builds
  `out = { unbounded, w0, branches }` — `c`, `polyA`, `lqdBeta`, `lqdGamma`, `z0`, `gamma`,
  `q`, `alpha` are all dropped), `solver.mjs:1726-1748` (`phisEquivalent` reads only
  `branches` and `w0`), `solver.mjs:1780` (`sameDomain`), and the de-duplication in
  `searchAlternates` at `solver.mjs:1708`.
- **What:** `phisEquivalent` compares branch `z`/`A` plus `w0`. For every UNBOUNDED family
  `unpackPhi_UQD` sets `w0: undefined` (`solver-uqd.mjs:232`) and the Laurent part lives in
  `polyA` + `c`, which the comparison never reads. `canonicalizeByRotation`'s doc and
  transformation law are explicitly the **bounded** ansatz, yet it is applied to every φ.
- **Evidence:** (`scratch/A1/t25.mjs`)
  ```
  c(a)= 2  c(b)= 4                  sameDomain = true   (should be FALSE)
  polyA2(a)= 0.16  polyA2(b)= 0.48  sameDomain = true   (should be FALSE)
  canonicalizeByRotation output keys: [ 'unbounded', 'w0', 'branches' ]
  ```
  First: the one-point UQD `h = 1/(w−2)` at c = 2 against the same branch data at c = 4 —
  visibly different domains. Second: the deltoid `h = w²` with its Laurent coefficient tripled.
  **Structural corollary:** for a pole-free unbounded QD (`branches: []` — the shipped
  `unb-deltoid` preset) `phisEquivalent` degenerates to comparing `{re:0,im:0}` with
  `{re:0,im:0}`, i.e. `true` for *any* two candidates, so `searchAlternates` can never report a
  second solution for that whole class.
- **Why it matters:** `THEORY_MAP.md` lists `sameDomain` as "the gauge quotient in the
  verdict", i.e. what turns a root count into **# GENUINE quadrature domains** — the
  uniqueness question the thesis is about. An equality test blind to the conformal radius
  merges distinct domains and under-reports non-uniqueness; the same predicate silently
  suppresses alternates.
- **Fix:** (1) `canonicalizeByRotation` should start from `clonePhi(phi)` and overwrite only
  `branches`, and should return the input unchanged when `phi.unbounded` — the unbounded
  rotation gauge is already pinned by `c > 0` real (`thesis-pdfjs.txt:3600-3606`:
  `𝜑′(∞) > 0`), so rotating branch coefficients there is not a symmetry of the ansatz at all.
  (2) Extend `phisEquivalent` to compare `c`, `polyA`, `z0`, `q`, `gamma`, `alpha`, and treat
  `w0: undefined` as absent rather than as the origin. Test:
  `sameDomain(deltoid@c=0.4, deltoid@c=0.1) === false`, with the existing cardioid-uniqueness
  assertions as the regression guard.
- **Prior:** new.

---

### SOLV-5 [HIGH] [confirmed] `parse-h`'s strict PFD accepts a denominator that is NOT `(w−a)^k`, because its verification tolerance scales like `|a|^k` — `1/((w−1000000)*(w−1000010))` silently parses as `1/(w−1000005)²`, an h that is 11 % wrong

- **Where:** `app/core/parse-h.mjs:325-341` (`classifySummand`, the
  `|expanded[i] − dMon[i]| > 1e-10 * (1 + |dMon[i]|)` check), reached from Phase 1 at
  `:446-464`; when Phase 1 "succeeds" the general-rational Phase 2 (`:504-511`) — which
  handles this case correctly — is never reached.
- **What:** after recovering `a = −Q_{k−1}/(k·Q_k)` the parser verifies `Q == (w−a)^k`
  **coefficient by coefficient with a tolerance relative to the coefficient's own magnitude**.
  For two simple roots `A` and `A+δ` the discrepancy is `δ²/4` in the constant coefficient
  while `|dMon[0]| ≈ A²`, so the test passes whenever `δ ≤ 2e-5·√(1+A²)` — the admissible
  merge distance grows **linearly with the pole's distance from the origin**. At |a| = 1e6 two
  poles **20 apart** are fused.
- **Evidence:** (`scratch/A1/t8.mjs`) reconstructing h from the parsed structure and comparing
  against the literal function:
  ```
  1/((w-1000000)*(w-1000010)) -> a=1000005 m=2 res=[0,1]   warn= none
      h(999990)  true=5.00000000e-3  parsed=4.44444444e-3  relerr=1.11e-1
      h(1000020) true=5.00000000e-3  parsed=4.44444444e-3  relerr=1.11e-1
  1/((w-1000000)*(w-1000001)) -> a=1000000.5 m=2 res=[0,1] warn= none
      h(999999.5) true=1.33333333e+0 parsed=1.00000000e+0  relerr=2.50e-1
  ```
  **Negative controls (nearby inputs where the code is right):** `1/((w-100)*(w-101))` and
  `1/((w-10)*(w-11))` fall to Phase 2 and give the correct two simple poles with residues ±1
  (`t7.mjs`); `1/((w-1)*(w-1.00001))` merges into a double pole, which *is* the right
  regularisation (δ = 1e-5; the functional `f′(a)` matches `1e5(f(a+δ)−f(a))` to O(δ²)). So
  the defect boundary is `δ/|a| ≳ 1e-5`, not "clustered roots" — 10 units apart is no cluster.
  The `warnings` channel is never exercised: Phase 1 hardcodes `warnings: []`
  (`parse-h.mjs:502`), so the cluster-spread warning at `:389-401` exists only on the Phase-2
  path and the UI (`ui-h-text.mjs:164`) has nothing to display.
- **Why it matters:** the parsed `h` is the *specification* of the whole solve. A user typing a
  two-point quadrature identity at large |a| gets a different functional (`f′(a)` instead of
  `C₁f(a₁)+C₂f(a₂)`), a different domain, and no warning of any kind.
- **Fix:** verify in the **root-centred** basis. After computing `a`, form
  `Qshift = polyShift(dMon, a)` (the helper already exists at `parse-h.mjs:126`) and require
  `|Qshift[i]| ≤ tol` for `i < k` with `Qshift[k] = 1` — this measures the actual root spread
  and is scale-free. On the two cases above `Qshift = [−25, 0, 1]` and `[−0.25, 0, 1]`, both
  correctly refused and falling through to the Durand–Kerner path that already gets them right;
  `(w−1)(w−1.00001)` gives `Qshift[0] = −2.5e-11` and still merges. Pin with
  `1/((w-1e6)*(w-1e6-10))` returning two simple poles with residues ±0.1.
- **Prior:** new.

---

### SOLV-6 [MEDIUM] [confirmed] Absolute `1e-14` cut-offs in `parse-h` and in `@cas/core`'s `poly.trim` silently delete small-but-legitimate terms; `1/(1e-200*w)` is rejected as "division by zero" `[cross-app]`

- **Where:** `app/core/parse-h.mjs:501` (the pole-drop `if (|c| > 1e-14) anyNonzero = true`),
  `:474` (same for the polynomial part), `:316` (the monomial-index scan), and the shared
  `trim` in `packages/core/src/poly.ts:61-65`
  (`while (out.length > 1 && alg.abs(out[out.length-1]) < 1e-14) out.pop()`), which
  `parse-h`'s trimming `polyAdd`/`polyMul` (`parse-h.mjs:100-101`) compose into every step.
- **What:** four absolute epsilons on quantities whose scale the user sets. Measured
  (`scratch/A1/t7.mjs`): `1e-13/w` parses to one pole with residue 1e-13; **`1e-14/w`,
  `1e-15/w`, `1e-16/w` all parse to `poles: []`** with no warning — h is silently replaced by
  0. `1e-15*w^2 + 1/(w-3)` in unbounded mode loses the `w²` term entirely. And `trim` turning
  `[0, 1e-200]` into the zero polynomial makes `accRat`'s divide-by-zero guard
  (`parse-h.mjs:216`) fire on `1/(1e-200*w)`, which is just `1e200/w`:
  ```
  "1/(1e-200*w)"   bounded   THROW: division by zero
  ```
- **Why it matters:** a research tool should not choose units for the user. The pole-drop is a
  silent change of the problem statement; the `trim` case is a package defect — `poly.ts`'s
  header calls the *no-trim* convention "load-bearing — do not fix" but says nothing about
  `trim`'s own absolute epsilon, and `@cas/core` is shared by six apps.
- **Fix:** make all four relative. In `parse-h`, scale the drop test by the largest coefficient
  in the expression and *warn* rather than drop. In `packages/core/src/poly.ts`, compare
  against `1e-14 * max|coefficient|` (a documented behaviour change; QD/CD callers all pass
  O(1)-scaled polynomials so the observable behaviour there is unchanged).
- **Prior:** new. (Related in kind to finding 07's `houseQR` absolute-pivot LOW, which is
  **still open** — the `1e-13` pivot gate at `solver.mjs:229` is now *documented* as absolute
  at `:213-217` but not changed.)

---

### SOLV-7 [MEDIUM] [confirmed] Newton's convergence tolerance is absolute (`1e-10` on ‖F‖), so the same domain at a different scale converges to a different relative accuracy — and at s ≈ 1e-5 the continuation thrashes 81 steps and then FAILS

- **Where:** `app/solvers/solver.mjs:487` (`tolerance = 1e-10`), used at `:560`
  (`if (Fnorm < tolerance) return success`); the continuation's per-step accept is the same
  flag via `solver-qd.mjs:205-241` and `solver-continuation.mjs:88-104`.
- **What:** ‖F‖ carries the units of w (the (●) rows are `φ(z_j) − a_j`, the (★) rows
  `A_k − target_k`), so an absolute floor is a *relative* floor of `1e-10/s`. Scaling the
  two-node QD by s and comparing the scale-normalised parameter vector against the s = 1
  solution (`scratch/A1/t11.mjs`):

  | s | default tol (1e-10) param err | with `newton.tolerance = 1e-14` |
  | --- | --- | --- |
  | 1e-1 | 2.6e-13 | 8.0e-14 |
  | 1e-2 | 3.0e-12 | 8.0e-14 |
  | 1e-3 | 4.1e-11 | 9.1e-14 |
  | 1e-4 | **4.1e-8** | 4.3e-12 |

  Worse, at s = 1e-5 and 1e-6 the achievable residual floor sits just *above* `1e-10`, so the
  continuation's accept test flips on noise: `t12.mjs`/`t13.mjs` show the trace oscillating
  between 6e-11 (`ok:true`) and 1.2e-10 (`ok:false`) for **81 steps**, after which the whole
  solve returns `"No algebraic root found by direct, continuation, or multistart"` — while
  s = 1e-4 succeeds in 5 steps and s = 1e-7 succeeds in 5. Non-monotone in scale, which is how
  you know it is a tolerance artefact and not geometry.
- **Why it matters:** the solver refuses geometrically identical problems and burns ~25× the
  work getting there. A user working in different units meets "no solution exists" for a domain
  the app solves happily one decimal away.
- **Fix:** make the tolerance relative. `newtonSolve` already receives `hData`; compute
  `hScale = max_j(|a_j|, |C_{j,1}|^{1/2})` once and test
  `Fnorm < tolerance * max(1, hScale)`. Pin: the two-node QD at s ∈ {1, 1e-3, 1e-6} must all
  succeed **and** agree on the scale-normalised parameter vector to 1e-11.
- **Prior:** new.

---

### SOLV-8 [MEDIUM] [confirmed] `phisEquivalent`'s absolute `tol = 1e-4` merges genuinely distinct QDs at small scale — at s = 1e-3 two maps differing by 5 % in every coefficient are "the same domain"

- **Where:** `app/solvers/solver.mjs:1726` (`phisEquivalent(a, b, tol = 1e-4)`), the
  accumulated `d = |Δz| + Σ_k |ΔA_k|` at `:1736-1739`, the `w0` test at `:1747`. Consumers:
  `sameDomain` (`:1780`), `searchAlternates` de-dup (`:1708`), and the Algebra tab's
  "# GENUINE quadrature domains" verdict per `THEORY_MAP.md`.
- **What:** an absolute threshold on a sum of coefficient differences carrying the units of w.
  Measured (`scratch/A1/t23.mjs`), two-node bounded QD scaled by s, compared against itself
  with every `A_{j,1}` multiplied by 1.05:
  ```
  s=1e+0  |A|=3.77e-1  sameDomain(phi, +5% A) = false   (correct)
  s=1e-1  |A|=3.77e-2  sameDomain(phi, +5% A) = false   (correct)
  s=1e-2  |A|=3.77e-3  sameDomain(phi, +5% A) = false   (correct)
  s=1e-3  |A|=3.77e-4  sameDomain(phi, +5% A) = TRUE    (wrong)
  ```
- **Why it matters:** same guardrail as SOLV-4 — this is the predicate behind the uniqueness
  count and the alternates list, and it fails in the direction that *hides* non-uniqueness.
- **Fix:** normalise `d` by `max(1, |z| + Σ|A_k|)` (or pass the problem scale in). SOLV-4 and
  SOLV-8 are the same function and should be fixed together.
- **Prior:** new.

---

### SOLV-9 [LOW] [code] `continuationInC`'s `minStep = 1e-4` is an absolute floor on **both** the step size and the c VALUE, so the warm-up shrink ladder is unavailable for any target `c ≲ 1e-3`

- **Where:** `app/solvers/solver-continuation.mjs:48` (`minStep = 1e-4`), used at `:70`
  (`if (c < minStep) return "warmup failed even at c=…"` — a test on the *value* of c) and at
  `:99` (`if (stepSize < minStep) return "step underflow"` — a test on the *step*).
- **What:** one constant gating two different quantities. For a target `c = 1e-6`,
  `startGuess = min(cTarget, 0.25·min|a|)` is already below `minStep`, so the first Newton miss
  aborts instead of halving; and the step can never shrink below 1e-4, 100× the whole interval.
- **Evidence:** code chain only — I could not make it bite, because the direct Newton succeeds
  for every small-c case I built (`scratch/A1/t20.mjs`: the scaled deltoid family `h = w²/s`,
  `c = 0.4s`, solves exactly down to s = 1e-5 with `polyA[2]` matching the closed form `c²/s`
  to 7 digits; `continuationInC` called directly with `cTarget ∈ {1, 1e-2, 1e-4, 1e-5}`
  succeeds in 1–3 steps). **Latent**, not reachable today.
- **Fix:** separate them: `cFloor = 1e-6 * cTarget` for the warm-up ladder and
  `minStep = 1e-4 * cTarget` for the step. Closing experiment: force `usePhases.direct = false`
  on a small-c unbounded solve and read the error string.
- **Prior:** new.

---

### SOLV-10 [LOW] [code] `scaleHDataPoles` drops `polyPart`

- **Where:** `app/solvers/solver.mjs:684-692` — the returned object has only `poles`. Its
  sibling `scaleHDataResidues` (`:700`) preserves it and says so in its comment.
- **What:** the pole-distance homotopy silently solves a problem with `h`'s whole polynomial
  part removed. Currently called only from `continuationSolve_QD`
  (`solver-qd.mjs:207,211,222,231`) — the bounded family, where `polyPart` must be empty — so
  it is latent; but it is exported on the QD namespace (`solver.mjs:1870`).
- **Fix:** `polyPart: (hData.polyPart || []).map(Complex.clone)` in the returned object.
- **Prior:** new.

---

### SOLV-11 [LOW] [confirmed] `THEORY_MAP.md`'s line references are stale in **all 29** rows I checked, two of them naming a file the symbol no longer lives in

- **Where:** `THEORY_MAP.md:25-26, 46-56, 118-124, 141-152, 192-206, 253-260`.
- **What:** the file says "Line numbers are accurate as of the P3 docs pass." Checked every
  `file:line` in the QD/inverse rows against the tree: 29/29 are wrong. Largest drifts:

  | claimed | actual | symbol |
  | --- | --- | --- |
  | `solver.mjs:790` | `solver.mjs:1463` | `solveInverseQD` (673 off) |
  | `solver-lqd-singular.mjs:549` | `:354` | `verifyQuadratureIdentity_LQDS` |
  | `solver-qd.mjs:427` | `:387` | `QD.registerFamily('boundedQD')` |
  | `solver.mjs:195` | `solver.mjs:234` | `houseQR` |

  Two rows are wrong about the **file**: `diskInitialGuess_QD` (`solver-qd.mjs:189`) and
  `diverseInitialGuess_LQDS` (`solver-lqd-singular.mjs:463`) moved to `app/solvers/seeds/` in
  the A6 split; those files now only re-export them (`solver-qd.mjs:188`,
  `solver-lqd-singular.mjs:309`).
- **Why it matters:** the map is the stated bridge from the thesis to the code, and its own
  caveat ("the symbol name is the source of truth") does not cover a wrong *file*.
- **Fix:** drop the `:line` suffixes (keep file + symbol, which the caveat already says is
  authoritative), or generate them — a ~20-line `scripts/` check that greps each row's symbol
  and fails on a wrong file or line keeps it honest for free.
- **Prior:** new.

---

### SOLV-12 [LOW] [code] `CONTRIBUTING.md`'s Family contract says `residual` returns a length-`(n+d)` real vector; it returns `2n + 2d + 1`

- **Where:** `CONTRIBUTING.md` §Adding a new family ("Length-(n+d) real residual vector;
  concatenates the (★) and (●) blocks") vs `solver-qd.mjs:103-128` (two reals per complex
  equation, plus the gauge row) and the app's own `counts.realEquations = 2*n + 2*d + 1`
  (`qd-equations.mjs:317`).
- **What:** `n+d` is the number of *complex* equations. The table also omits the gauge row,
  which is what makes the bounded system overdetermined — and hence why `newtonSolve` must go
  through least squares rather than a square solve.
- **Fix:** "Length-`2n + 2d + 1` real residual vector; the (●) locator block, the (★)
  principal-part block, and one gauge row."
- **Prior:** new.

---

### SOLV-13 [NIT] [confirmed] On the polynomial-h families `estimateMaxConformalRadius` reports a `cMax` slightly ABOVE the true c\*

- **Where:** `app/solvers/solver-cmax.mjs:299` (`cMax: cLo`, the largest c the gate accepted).
- **What:** for `h = w²` (φ = cz + c²/z², φ′ = 0 at |z| = (2c)^{1/3}) the exact c\* is **0.5**
  and the estimator returns **0.50001393825**; for `h = w³` the exact c\* is
  1/√3 = 0.5773503 and it returns 0.5773781 (`scratch/A1/t18.mjs`). Both inside the declared
  `relTol = 1e-4`, mechanism correctly `cusp`, confidence 0.99994 — so here the two-regime
  gate works (contrast SOLV-2). But `phiAtMax` is then marginally non-univalent
  (|z_crit| = 1.0000093), which the 500-sample polygon test cannot resolve.
- **Fix:** report the bracket `[cLo, cHi]` alongside `cMax` and label it `≈`, never `≤`; if a
  certified value is wanted, re-confirm univalence at a raised sample count before returning.
- **Prior:** new.

---

## Structural observations

- **`canonicalizePhi_QD` and `unpackPhi_QD` return partial φ structs.**
  `solver-qd.mjs:161-169` returns `{ w0, branches }` — no `family`, `unbounded`, `c`,
  `polyA`; `unpackPhi_QD` (`:130`) sets `c: undefined` and omits `family`. It works only
  because `_resolveFamily` (`solver.mjs:163`) falls back on `phi.unbounded` and `clonePhi`
  (`solver.mjs:1090`) defends every optional field. The φ struct has grown 11 optional slots
  across the families with no single constructor; SOLV-4 is what that costs. **Better:** one
  `makePhi(family, fields)` factory plus a dev-build `assertPhiComplete(phi)`, so a family
  cannot mint a φ missing its own parameters.
- **Scale-absolute constants are a systemic pattern, not five accidents.**
  `QR_SINGULAR_TOL = 1e-13` (`solver.mjs:229`, flagged by finding 07 and now merely
  documented), `tolerance = 1e-10` (SOLV-7), `phisEquivalent` `1e-4` (SOLV-8),
  `IDENTITY_TOL = 1e-6` against a mis-dimensioned floor (SOLV-1), `minStep = 1e-4` (SOLV-9),
  `parse-h`'s `1e-14`/`1e-10` (SOLV-5/6), `CONVERGED_RESID = 1e-6` (`solver-cmax.mjs:83`),
  `TOL_CONVERGE = 1e-10` on |φ′| (`critical-set.mjs:60`), `DEFAULT_FD_EPS = 1e-7` used as an
  *additive* step (`solver.mjs:475`). The inverse problem is exactly covariant under
  `w → s·w` (`a → s·a`, `C_{j,s} → s^{s+1}·C_{j,s}`, `A → s·A`, `z` fixed, `c → s·c`) — I
  verified that to 8e-14. **Better:** compute one `hScale` in `normalizeOpts` (every family
  already has that hook, `define-family.mjs:33`), store it on `norm`, and express every gate
  as a multiple of it. That single change closes SOLV-1, -7 and -8 and de-risks the rest.
- **`parse-h` Phase 1 cannot warn.** `result = { poles, polyCoeffs, warnings: [] }`
  (`parse-h.mjs:502`) is hardcoded empty while the UI (`ui-h-text.mjs:164`) is already wired to
  display `warnings[0]`. Every silent decision the strict walker makes — merging poles
  (SOLV-5), dropping a residue (SOLV-6) — has a ready-made channel it does not use.
- **A local root finder is the wrong tool for φ′ = 0.** `critical-set.mjs` runs a seeded,
  undamped Newton (SOLV-3) while the very same app already ships a global polynomial root
  finder (`QD.Direct.polynomialRoots`, Durand–Kerner + Newton polish) that `faber-analysis`
  uses. For every classical family φ′ = 0 clears to a polynomial. This is duplication with a
  correctness cost, not just duplication.
- **The identity verifier exists in two divergent copies and only one of them adapts.**
  `verifyQuadratureIdentity_QD` (`solver-qd.mjs:272-350`) and `verifyQuadratureIdentity_UQD`
  (`solver-uqd.mjs:~160-460`) share the same moment loop, the same `areaScale` floor (SOLV-1) and
  the same `1/N` sign conventions, but only the unbounded one has the `evalAtN` + node-doubling
  + `improved`-guard escalation and the `>= 1500` floor — the bounded one is a bare single pass
  at N = 500 (SOLV-14). Every weighted family's verifier is a further copy. **Better:** one
  shared `runIdentityCheck({ sampleAt, momentsAt, rhsAt, scaleAt })` in `solver.mjs` carrying the
  node-count policy (ρ-derived N + escalation + a fail-closed `underResolved`) once, with each
  family supplying only its moments and its RHS. That is ADR-0007's merge direction: the second
  consumer already exists, six times over.

- **`condEst` remains a diagonal-ratio lower bound** (`solver.mjs:222-226`), so the two
  triggers keyed off it (`ILL_COND_REFINE_THRESHOLD`, `CENTRAL_DIFF_COND_TRIGGER`) under-fire
  on a genuinely ill-conditioned R with a modest diagonal ratio. Finding 07's LOW, now
  documented in code but not fixed — one line, still open.
- **`Taylor.invert`'s conditioning limitation** (`app/core/taylor.mjs:96-105`) is likewise
  documented-and-deferred (QDS-3): an absolute `|c_1|² < 1e-30` guard where the failure mode is
  relative. Since `inverseFaberAtPole` divides by `c_1 = φ′(z_j)` at every order, a
  near-critical node silently amplifies error with no `≈` flag. Not re-reported as new; the
  right fix is the relative guard the comment itself describes.
- **ADR-0007 note:** `solver-continuation.mjs` is the right shape (three byte-identical copies
  merged behind one driver, per cd-dup-06), and the `@cas/faber` / `@cas/core` seams in scope
  are thin adapters with the QD-specific parts kept app-side — no layering violation found.

---

## Improvement proposals (core functionality)

1. **Non-dimensionalise the solver (S; prerequisite for 5, 7, 8).** Add `norm.hScale` in
   `define-family.mjs`'s `normalizeOpts` and route every accept/reject gate through it (Newton
   tolerance, identity floor, `phisEquivalent`, `condEst` pivot, continuation `minStep`).
   *Why:* closes SOLV-1, -7, -8 at once and makes the app usable in a user's own units — which
   matters directly for the Hele-Shaw hand-off, where physical units are the point.
   *Risk:* goldens that pin residual numbers move; mitigate by keeping the `hScale ≈ 1` path
   byte-identical.

2. **Solve φ′ = 0 globally, and make c\* exact where the thesis is (M).** Replace
   `critical-set.mjs`'s seeded Newton with the polynomial route (SOLV-3), then drive c\* by
   Newton on the scalar equation `max_{φ′(z)=0}|z| = 1` with the existing bisection kept only
   as a bracket. *Why:* it unlocks Theorem 3.3.1's exact answer — `c* = w₀ + √α`
   (`thesis-pdfjs.txt:4021-4045`), currently missed by 1.6–2.8 % (SOLV-2) — turns a
   confidence-0.5 `fold` into a certified `cusp`, and restores the critical-set overlay in the
   band it exists for. *Prerequisite:* none. *Risk:* low; keep the current gate as fallback for
   the weighted families.

3. **Implement Theorem 3.3.1's existence criterion as a pre-flight gate (S).** For
   `h = α/(w−w₀)` the thesis gives `QD(α/(w−w₀)) ≠ ∅ ⟺ |w₀|² + 2Re(α) > 2|α|`
   (`thesis-pdfjs.txt:3773-3781`, for `α ∈ ℂ∖ℝ≥0`). Today an inadmissible one-point request
   just burns the whole multistart pipeline and reports "No algebraic root found by direct,
   continuation, or multistart" — indistinguishable from a solver failure. *Why:* it turns a
   solver timeout into a **theorem**, which is the app's whole value proposition; it is also
   exactly the family the Hele-Shaw twist hand-off drives. *Size:* S. *Risk:* none — it is a
   closed-form inequality, gated to the one-point family and reported as an explanation, not a
   refusal.

4. **One identity verifier with a ρ-derived node count and a fail-closed resolution flag
   (S–M).** Lift the moment loop, the node-count policy and the escalation into shared
   machinery (see Structural) so `identityOK` means the same thing in all twelve families, set
   `N` from `ρ = max_j|z_j|` rather than from a constant, and return `null` rather than `false`
   when the error is still falling at the cap. *Why:* it closes SOLV-14 for every family at
   once instead of copying the UQD loop a seventh time, and it removes the worst
   honest-labelling failure in the app (a shipped preset badged invalid after one slider drag).
   *Prerequisite:* none; composes with proposal 1 and with the next item.

5. **A dimensionally-correct, per-k identity report (S).** Replace the single `maxRelDiff`
   with a per-k table already normalised by `R^k` and surface the *worst k*. *Why:* the
   verifier is the app's honest-labelling instrument and its number is currently not comparable
   between two domains. *Prerequisite:* SOLV-1's fix.

6. **Make `parse-h` report what it decided (S).** Emit warnings from Phase 1 — "two roots at
   1000000 and 1000010 were merged into a double pole", "a residue of 1e-15 was dropped" — and
   route the strict path through the root-centred verification of SOLV-5. *Why:* the parsed h
   is the problem statement and the user has no way to see the app changed it.

7. **An analytic Jacobian for the classical families (M).** `newtonSolve` already accepts
   `jacobianFn`, and the (★)/(●) blocks are elementary rational functions of
   `(z_j, A_{j,k})`; the derivative of `inverseFaberAtPole` w.r.t. `φ̃` comes from the same
   `psiPow` tower it already builds. *Why:* the FD Jacobian costs `n+1` residual evaluations
   per step and is accurate only to 3.5e-7 (measured), which is what forces the
   central-difference upgrade near a cusp and caps how far Newton can drive the residual.
   An analytic Jacobian removes both and would let the cusp regime — the hardest range for
   proposal 2 — be resolved much closer to c\*. *Risk:* medium; needs an FD cross-check test
   per family.

8. **A scale-and-rotation regression family (S).** One test file that takes each shipped
   preset, applies the exact covariance `a → s·a, C_{j,s} → s^{s+1}·C_{j,s}, c → s·c` for
   s ∈ {1e-3, 1, 1e3}, and asserts the scale-normalised solution is identical and every verdict
   (`univalent`, `identityOK`, `sameDomain` vs the s = 1 answer) agrees. *Why:* every finding
   here except SOLV-5 and SOLV-10 would have been caught by that one file.

---

## Documentation drift

| doc file:line | claims | reality (file:line) | severity |
| --- | --- | --- | --- |
| `THEORY_MAP.md:15` | "Line numbers are accurate as of the P3 docs pass" | 29/29 checked rows stale; `solveInverseQD` off by 673 lines (`solver.mjs:1463`) | LOW |
| `THEORY_MAP.md:~50` | `diskInitialGuess_QD` at `solver-qd.mjs:189` | moved to `app/solvers/seeds/seeds-qd.mjs`; `solver-qd.mjs:188` only re-exports | LOW |
| `THEORY_MAP.md:~150` | `diverseInitialGuess_LQDS` at `solver-lqd-singular.mjs:463` | moved to `seeds/seeds-lqd-singular.mjs`; `:309` re-exports | LOW |
| `THEORY_MAP.md` (Critical conformal radius) | "`c*` is found automatically … Returns `mechanism: 'cusp' \| 'fold'`" and "valid while `g < 1`" | the `g` path is dead for the one-point family — `findCriticalPoints` returns `[]` (SOLV-3), so `mechanism` reads `fold` and c\* is 2 % low (SOLV-2) | **HIGH** |
| `THEORY_MAP.md` (Critical-set image) | "Zeros near `\|z\| = 1` predict imminent failure as parameters vary" | the overlay is EMPTY for `\|z\| ≥ ~0.94` on the one-point unbounded family (SOLV-3) | **HIGH** |
| `CONTRIBUTING.md` (Family table) | `residual` returns "Length-(n+d) real residual vector" | `2n + 2d + 1` (`solver-qd.mjs:103-128`; `qd-equations.mjs:317`) | LOW |
| `CONTRIBUTING.md` (§Schema-driven pack/unpack) | `SCHEMA_LQDS` at `solver-lqd-singular.mjs:273` | `:276` | NIT |
| `solver.mjs:1755-1772` (doc comment) | "Rotate the domain's Riemann map by the disk rotation z ↦ μ·z", with the bounded transformation law | applied to unbounded / LQD / PQD φ too, where it is not a symmetry and silently drops `c`/`polyA` (SOLV-4) | MEDIUM |
| `packages/core/src/poly.ts:13-15` | documents the *no-trim* convention as load-bearing | says nothing about `trim`'s own absolute `1e-14` (SOLV-6), inherited by six apps | LOW |
| `THEORY_MAP.md` (Conventions) | `dA = dx dy/π`; `1/(2πi)` suppressed; unit-disk `h = 1/w` | **verified correct** against `thesis-pdfjs.txt:502,958` and numerically — recorded as a non-finding | — |

*(The broken `apps/quadrature-domains/thesis.txt` extraction is the coordinator's DOC-1 and is
not re-reported here. Worth noting for whoever fixes it: that file's damage is not only
cosmetic — Theorem 3.3.1's existence criterion reads `|0|2 + 2Re () > 2||` and eq. 3.11's
`c ≤ w₀ + √α` reads `0 <  ≤ 0 + √`, i.e. the two statements that falsify SOLV-2 are
*invisible* in it. Any past "checked against the thesis" claim based on `thesis.txt` should be
treated as unverified.)*

---

## Tests

**Coverage gap that directly enables SOLV-1: nothing anywhere asserts that the classical
bounded/unbounded quadrature-identity verifier REJECTS a wrong φ.** Every reference to
`maxRelDiff` / `identityOK` in `app/test/` and `vitest/` for `boundedQD` / `unboundedQD` is a
pass-direction assertion (`< 1e-6`) on a correct solution — `app/test/bootstrap.js:250`,
`cusp-accuracy.test.js:72`, `direct.test.js:338,511,528`, `solvers-1.test.js:109`. The weighted
families do have negative controls (`solvers-4.test.js:674,690` perturb `q` and require
`qRelDiff > 1e-2`), and the symbolic oracles do (`qd-equations.test.js:433`,
`cardioid-uniqueness.test.js:174`, `sym-radical.test.js:141`) — the classical identity verifier
is the one that does not. Adding "perturb `A_{1,1}` by 1 % ⇒ `identityOK === false`, at s = 1
**and** at s = 1e4" pins both halves of SOLV-1.

**Tests that pass for the wrong reason / surviving mutants:**

- `app/test/cmax.test.js:36-41` drives `estimateMaxConformalRadius` with a **synthetic stub**
  whose validity is a hand-written predicate, so it exercises the bracket/bisection logic but
  never the two-regime gate against the real verifier; the one real-solver case (`:128-153`)
  asserts only that the midpoint is valid. **Surviving mutant:** change `classify`'s cusp
  branch (`solver-cmax.mjs:127`) from `g < 1` to `g < 1.05`, or delete the whole cusp branch —
  the stub φ has no critical points (`critModulus` returns `NaN`, `:96`) so the branch is never
  taken, and the real-solver case is a single `relTol`-loose check. In fact SOLV-2 shows the
  branch is **already effectively deleted in production** on the one-point family and the suite
  is green. Closing tests: the closed forms `h = w²` ⇒ c\* = 0.5, `h = w³` ⇒ c\* = 1/√3, and
  Theorem 3.3.1's `h = α/(w−w₀)` ⇒ c\* = w₀ + √α — I ran all three by hand
  (`scratch/A1/t18.mjs`, `t26.mjs`); the suite contains none of them.
- **Nothing tests `findCriticalPoints` against a known answer.** `critical-set` has no
  closed-form oracle anywhere in the suite, which is why a 0-of-157 convergence failure ships
  green. Closing test: the exact |z| for `h = 1/(w−2)` at c ∈ {2.5, 2.7, 2.9, 2.99}.
- No test constructs a φ pair differing only in `c` or `polyA` and asserts
  `sameDomain === false` (SOLV-4); the existing `sameDomain` assertions
  (`cardioid-uniqueness.test.js`) are all **bounded** with non-empty branches — exactly the case
  the function handles. Surviving mutant: delete the `c`/`polyA` handling — it already is
  deleted.
- No test parses an h whose poles are far from the origin (SOLV-5). `parse-check.test.js` is a
  `node --check` syntax sweep and `h-text-roundtrip.test.js` round-trips on O(1)-scaled data, so
  `classifySummand`'s tolerance is never stressed. **Surviving mutant:** loosen
  `parse-h.mjs:339` from `1e-10` to `1e-6` — every current test still passes.
- **No test varies the identity verifier's node count against ρ.** `cusp-accuracy.test.js:94-121`
  does compare `adaptiveSamples:false` vs auto — but only for the **unbounded** family, which is
  the one that already escalates; the bounded verifier is never exercised above its default
  N = 500, so SOLV-14 ships green. **Surviving mutant:** change `solver-qd.mjs:273` from
  `?? 500` to `?? 120` — the whole headless suite still passes (every bounded fixture has
  ρ ≤ 0.73, where the error is ~1e-14 either way). Closing test: `0.58/(w−1)+1.54/(w+1)` must
  come back `identityOK === true` at the default options, and a 1 %-perturbed φ on the same h
  must come back `false`.
- **Nothing asserts that a degenerate `h` is refused.** `h ≡ 0` yields a certified-univalent
  constant map through `boundedQD` (see the cross-agent confirmation above) and no test notices.
  Closing test: `solveInverseQD({poles:[],polyPart:[]},{bounded:true})` must fail with a named
  reason.
- `app/test/faber.test.js` **is** a good oracle set (disk ⇒ ζⁿ, interval [−2,2] ⇒ 2·T_n(ζ/2),
  Chebyshev roots) — recorded as a non-finding; the `@cas/faber` seam is well pinned.

**Reproduction scripts** (read-only, in `scratchpad/scratch/A1/`): `boot.mjs` (harness),
`conv.mjs` + `t1`–`t3`, `t19` (convention verification), `t4` (Faber duality), `t5` (symbolic
oracle), `t6`–`t8` (parse-h adversarial), `t9` (Jacobian), `t10`–`t17`, `t21`–`t25` (scale
invariance, identity verifier, `sameDomain`), `t18` + `t26` (c\* oracles: polynomial families
and Theorem 3.3.1), `t20` (small-c continuation), `t27`–`t29` (`findCriticalPoints`
diagnosis).
