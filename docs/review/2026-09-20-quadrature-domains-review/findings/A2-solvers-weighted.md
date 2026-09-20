# A2 — weighted inverse-problem families (LQD / PQD, bounded & unbounded, singular & non-singular)

## Scope covered

**Read end to end:** `app/solvers/solver-lqd-common.mjs`, `solver-lqd.mjs`, `solver-lqd-singular.mjs`,
`solver-uqd-lqd.mjs`, `solver-uqd-lqd-singular.mjs`, `solver-pqd-common.mjs`, `solver-pqd.mjs`,
`solver-pqd-singular.mjs`, `solver-uqd-pqd.mjs`, `solver-uqd-pqd-singular.mjs`, `define-family.mjs`;
the family-routing parts of `primary-solver-worker.mjs`; the weighted sections of
`solver.mjs` (`newtonSolve` / `numericalJacobian` / `applySchemaClamps` / `IDENTITY_TOL` /
`isBoundaryUnivalent`); `app/schwarz/schwarz-export.mjs` (because it consumes weighted φ);
`app/ui/ui-presets.mjs` (weighted preset lists), `app/ui/ui-modes.mjs`, `app/core/parse-h.mjs`
(`modeAllowsPoly`); the weighted sections of `app/test/solvers-{1,3,4}.test.js`,
`app/analysis/thesis-examples.mjs`, `vitest/schwarz-export.test.ts`.
**Docs:** `README.md` (§families, §oracles, §deferred), `THEORY_MAP.md`, `CONTRIBUTING.md`,
thesis Ch. 4 + Ch. 5 — **re-checked against the faithful extraction**
`scratchpad/pdftool/thesis-pdfjs.txt` after the coordinator's correction (every equation claim
below is from that file, not from the broken `thesis.txt`).

**Ran:** a from-scratch ESM boot of the ten families (`scratch/A2/boot.mjs`) plus ~15 numeric
probes (α-limits, rotation equivariance, degenerate h, q-sweeps, export leakage, an independent
coincidence-equation check for all eight weighted families).

**Not got to, honestly:** the Schwarz/Sphere GPU adapters for the weighted families
(`schwarz/schwarz-webgl.mjs` `u_lqdBeta`, γ-merged branches) — I only established that the
*solver-side* numbers are right; the `seeds/seeds-*.mjs` files were read only where a probe led
there; `solver-cmax.mjs` interaction with weighted families; the unbounded-singular-LQD
higher-order-pole-at-0 (HANDOFF #24 case (b)) RHS formula was read but not independently re-derived;
the param-slice's weighted sweeps.

## Health

| command | result |
|---|---|
| `node app/node-test.js` (full headless QD suite, ~5 min) | **2342 passed, 0 failed** |
| `git status --short` at start and at finish | empty (no repo file touched) |
| boot of all 10 families from a scratch ESM script | all 10 register, dispatch order correct |

**Two positive controls worth recording, because they say the weighted mathematics is right.**

1. **The convention is exactly the thesis's, in all eight weighted families — no π / 2πi slip.**
   Thesis Eq. (4.3) (`thesis-pdfjs.txt:5629`) is `(1/a)·w̄·|w|^{2(a−1)} ≐ h(w) + G(w)`, and Eq. (5.2)/(5.3)
   (`:13821` / `:13889`) are `ln|w|²/w ≐ h(w) [+ q/w] + G(w)`, `G ∈ A(Ω)` (`A₀(Ω)` unbounded). I built the
   corresponding Schwarz function on ∂Ω from each solved φ and took the Fourier spectrum of `S − h`
   (`scratch/A2/schwarzcheck.mjs`). The half that must vanish does, on the first try, for every family:

   | family | c₀ | max over the vanishing half | max over the other half |
   |---|---|---|---|
   | boundedLQD | 1.00e+0 | neg 5.8e-12 | pos 2.7e+0 |
   | boundedLQD_singular | 3.70e-1 | neg 5.8e-12 | pos 1.6e-1 |
   | unboundedLQD | 3.2e-14 | pos 1.3e-14 | neg 1.8e+0 |
   | unboundedLQD_singular | 1.8e-12 | pos 7.5e-13 | neg 1.6e-1 |
   | powerQD (α=2) | 1.07e+0 | neg 4.3e-16 | pos 3.8e-1 |
   | powerQD_singular (α=2) | 1.21e+0 | neg 7.7e-13 | pos 3.7e-1 |
   | unboundedPQD (α=2) | 9.8e-16 | pos 9.4e-16 | neg 3.2e+0 |
   | unboundedPQD_singular (α=2) | 4.9e-13 | pos 2.7e-14 | neg 1.2e+0 |

   This also pins the **`q` convention**: the code's `phi.q` is the thesis's `q` in (5.3) with the same
   sign and no normalisation factor (`scratch/A2/p3.mjs`: correct `q` → 1.3e-16, `q + 0.3` → 1.57e-1).
   Same check over α ∈ {1.2, 1.5, 2, 3, 4} for `powerQD_singular` (`p17.mjs`): 6.1e-15 … 3.0e-11.

2. **Two cross-family limits the code never checks, both hold.** α→1 recovers `boundedQD`
   (`p1.mjs`: `max|φ_PQD − φ_QD| = 7.44e-5` at α = 1±1e-4, `7.4e-3` at 1±0.01 — clean O(|α−1|));
   α→0⁺ recovers `boundedLQD` (Thesis Thm 5.2.1) — `p2.mjs`: `1.50e-3` at α = 0.001, `1.49e-2` at
   α = 0.01, i.e. error ≈ 1.5·α. Thm 5.3.2's univalence edge reproduces to **3e-8 relative**:
   bisection on `boundedLQD` gives threshold **9.869604** vs `π² = 9.869604` (`p16.mjs`), and
   `φ(t)` matches `w₀e^{t√α}` to 1.1e-32 at α = π².

## Findings

### WGT-1 [CRITICAL] [confirmed] All four UNBOUNDED weighted families leak out of QD as a *classical* Laurent φ — three hand-offs carry numbers that are not this domain's map
- **Where:** `app/schwarz/schwarz-export.mjs:31` (`phiToMapSpec`), `:57` (`boundedClassicalMapSpec`, which
  *does* carry the missing guard), `:82` (`classifyPhiForExport`), `:107`/`:255` (`explainSigmaUnavailable`,
  `buildSigmaEnvelope`), `:342` (`buildHeleShawEnvelope`); reached from
  `app/schwarz/schwarz-ui.mjs:527` (`Export Riemann map φ`), `:570` (`Export σ`), and `_sendToHeleShaw`.
- **What:** `boundedClassicalMapSpec` refuses any φ that carries a `family` tag, which is exactly how the
  weighted bounded families are excluded. `phiToMapSpec` has no such guard: it accepts anything with
  `phi.unbounded` and a `branches`/`polyA`/`F` field and returns `{form:"laurent", c, F, branches}` —
  i.e. it reads an `unboundedLQD` (φ = c·z·exp(r#(z) − r#(∞) + B(1/z))) or an `unboundedPQD`
  (φ = z·(r#)^{1/α}, whose `polyA` are **r#'s** Laurent coefficients, not φ's) as the classical
  `φ = c·z + Σ F_l/z^l + Σ conj(A)u^k`. The error is O(1), not a rounding: on |z| = 2 the exported map
  differs from the family's own `evalPhi` by **0.906 / 0.704 / 0.670 / 1.733** for
  unboundedLQD / unboundedLQD_singular / unboundedPQD / unboundedPQD_singular
  (e.g. unboundedLQD: true φ(2) = **1.0341**, exported = **0.1283**).
  Consequences, all silent and all reachable from the Schwarz tab's buttons:
  (a) the `kind:"map"` φ hand-off ships a wrong map; (b) `buildSigmaEnvelope` emits a
  `form:"schwarz"` σ recipe (`explainSigmaUnavailable` returns `null` = "available"), so Complex
  Dynamics renders a Schwarz escape-time field for a domain that is not the user's;
  (c) `explainHeleShawUnavailable` returns `null` for an unbounded LQD/PQD with a single simple pole, so
  the Hele-Shaw twist page is driven as the classical Graven–Makarov one-point **unweighted** family with
  this h's residue. The file's own comment (`:245`) says "a rational φ, **or a weighted (LQD/PQD) bounded
  φ**, returns null" — the unbounded half of the weighted matrix was simply never considered.
- **Evidence:** `scratch/A2/p5.mjs` and `p6.mjs`.
  ```
  unboundedLQD            unbounded=true classify=unbounded-poles phiToMapSpec=laurent sigmaEnv=EMITTED
      exported-laurent vs true φ on |z|=2:  max|Δ| = 9.058e-1   true 1.0341  exported 0.1283
  unboundedLQD_singular   … max|Δ| = 7.041e-1     unboundedPQD … 6.703e-1
  unboundedPQD_singular   … max|Δ| = 1.733e+0
  ── Hele-Shaw ──
  classical      family=undefined     heleShawReason=NULL (available!)
  unboundedLQD   family=unboundedLQD  heleShawReason=NULL (available!)
  unboundedPQD   family=unboundedPQD  heleShawReason=NULL (available!)
  ```
  Negative control: the four *bounded* weighted families are correctly refused
  (`phiToMapSpec=null`, `sigmaEnv=null`) — the guard exists, one function over.
- **Why it matters:** wrong mathematics shipped across an app boundary with no label — the receiving app
  has no way to know. It breaks the honest-labelling guardrail and ADR-0006's "the interchange format is
  canonical": what rides the wire is not this Ω's φ.
- **Fix:** one line — `phiToMapSpec` must refuse a tagged φ the same way `boundedClassicalMapSpec` does.
  The classical unbounded family leaves `phi.family` unset, so
  `if (phi.family && phi.family !== 'unboundedQD') return null;` at `:31` is sufficient and preserves every
  current classical payload byte-for-byte. `classifyPhiForExport` then needs a `weighted` kind so
  `explainSigmaUnavailable` / `explainPhiUnavailable` / `explainHeleShawUnavailable` say why.
  **Pin it:** `vitest/schwarz-export.test.ts` already has a `boundedWeightedPhi` fixture (`:155`) and
  asserts refusal; add the four `{unbounded:true, family:'unboundedLQD'|…}` twins — the absence of those
  four fixtures is exactly why this shipped green.
- **Prior:** new.

### WGT-2 [MEDIUM] [confirmed] Every BOUNDED family silently ignores `hData.polyPart` and still certifies the answer
- **Where:** `app/solvers/solver-lqd.mjs` (`residual_LQD:121`, `verifyQuadratureIdentity_LQD:279`),
  `solver-lqd-singular.mjs` (`residual_LQDS:154`, `verifyQuadratureIdentity_LQDS:354`),
  `solver-pqd.mjs`, `solver-pqd-singular.mjs`, `solver-qd.mjs` — `grep -n polyPart` over all five
  returns **zero hits**, in the residual *and* in the verifier.
- **What:** a bounded domain cannot have a pole of h at ∞, so a non-empty `polyPart` is not a harder
  problem, it is an inconsistent input. The solver neither reads nor rejects it: it solves the
  finite-pole-only problem and the verifier's RHS is built from `hData.poles` alone, so both sides agree
  and the result is returned as certified. `h = w + 2/(w−1)` and `h = 2/(w−1)` give the **identical**
  `boundedLQD` solution and the identical `maxRelDiff = 4.1e-12`, `identityOK = true`.
  Same for `boundedLQD_singular` (4.4e-11), `powerQD_singular` (2.1e-15) and — shared machinery,
  A1's file — `boundedQD` (3.1e-15). `powerQD` is the one that happens to fail loudly
  (`maxRelDiff = Infinity`), and only via the R#-vanishing guard, not by noticing the input.
- **Evidence:** `scratch/A2/p14.mjs`, output above. Reachability: the UI *does* block it today —
  `QD.modeAllowsPoly` (`app/core/parse-h.mjs:78`) admits only the five unbounded modes, and
  `ui.mjs:261` gates the panel on it — so this is a missing guardrail at the engine boundary rather than
  a live wrong picture. It is reachable from `QD.solveInverseQD` / `PrimarySolverWorker.solve` directly
  (`primary-solver-worker.mjs:213` is a pure pass-through), which is the API the tests and any future
  caller use.
- **Why it matters:** the one place a bad input could be caught for free is the family's own
  `normalizeOpts`, and the app's defence currently lives two layers up in the UI. If a mode ever gains
  `cards.poly` by accident, the result is a certified answer to a different question.
- **Fix:** in each bounded family's `normalizeOpts(opts, hData)`, `throw` when
  `hData.polyPart?.length` — the same shape as `unboundedPQD`'s "no quadrature data" throw
  (`solver-uqd-pqd.mjs` `normalizeOpts`). One test per bounded family asserting the throw.
- **Prior:** new.

### WGT-3 [MEDIUM] [confirmed] `h ≡ 0` returns a CONSTANT φ certified `univalent` + `identityOK` — a point reported as a quadrature domain
- **Where:** shared machinery (A1's), found through the weighted families:
  `app/solvers/solver.mjs:711` `isBoundaryUnivalent`, `:1400` `_computeIdentity`, `:1519` `isValidQD`.
- **What:** with `h = 0/(w−1)` the (★) target is 0, Newton converges to `A = 0`, so
  `φ(z) = w₀·exp(0) ≡ w₀` — the image is the single point `w₀`
  (`|φ| on |z|=1`: min 0.9999999999989774, max 1.000000000000808). The identity is `0 = 0`, so
  `maxRelDiff = 8.4e-25`; the self-intersection test on a degenerate polygon reports univalent. The app
  answers `success / identityOK / univalent`. Thesis Thm 5.3.1 (`thesis-pdfjs.txt`, Ch. 5) says the only
  null LQDs are disks and exterior disks **centred at the origin**, which contain 0 and are therefore
  excluded from this family by hypothesis — so the correct answer here is "no such domain".
  Identical behaviour in `boundedQD`, so it is not weight-specific.
- **Evidence:** `scratch/A2/p8.mjs`. Boundary of the defect: at `C = 1e-6` the domain is genuinely tiny
  but real and the answer is right; only `C` exactly 0 degenerates. Note the *unbounded* h ≡ 0 case is a
  legitimate shipped preset (`lqd-u-trivial`, Ω = exterior disk) and is unaffected.
- **Why it matters:** honest-labelling. Anything downstream (area, symmetry, c*, the export in WGT-1)
  then operates on a degenerate map.
- **Fix:** a degeneracy gate in `isBoundaryUnivalent` / `_computeIdentity` — reject when the sampled
  boundary's diameter is below a relative floor (e.g. `max|w_i − w_j| < 1e-9·max|w|`), reported as its own
  reason rather than as non-univalence. Pin with a `C = 0` case per bounded family.
- **Prior:** new.

### WGT-4 [MEDIUM] [confirmed] `powerQD_singular` fails on isolated ROTATIONS of a problem it solves everywhere else
- **Where:** `app/solvers/solver-pqd-singular.mjs` (`evalPhi_PQDS:159` / `r0Const:122` →
  `Complex.cpow(phi.w0, phi.alpha)`, principal branch) + `QD.PqdCommon.argContAt` anchoring at
  `α·arg(w0)`; seeds in `app/solvers/seeds/seeds-pqd-singular.mjs`.
- **What:** the PQD problem is exactly rotation-equivariant (`ρ_a` is radial; `h̃(w) = e^{−iθ}h(e^{−iθ}w)`
  ⇒ `a_j → e^{iθ}a_j`, `C_{j,s} → e^{i(s−1)θ}C_{j,s}`, `w₀ → e^{iθ}w₀`), and `|z₀|` is a rotation
  invariant. Sweeping the canonical preset `h = (63/32)/(w−1), w₀ = 1, α = 2` over 49 angles:
  47 return `|z₀| = 0.666667` (= 2/3, the preset's documented value) with `identityOK`;
  **θ = 1.702 returns no solution at all**, and **θ = 1.582 converges to a different root,
  `|z₀| = 0.780581`, with `identityOK = false`** — its immediate neighbours at θ ± 0.02 both give
  0.666667. The other three weighted-bounded families and all four unbounded ones are clean at every
  angle tested.
- **Evidence:** `scratch/A2/p12.mjs` (8 families × 6 angles), `p13.mjs` (4 sweeps × 49 angles),
  `p15.mjs` (fine sweep, output quoted above). Negative control: `powerQD` at α = 2 has **zero**
  failures over the same 49 angles; the α = 3 row fails at *all* 49, which is realizability (no domain),
  not an angle defect — that is what makes the 2-of-49 pattern a solver failure and not non-existence.
- **Why it matters:** an existing domain reported as "no algebraic root found" (or, worse at θ = 1.582,
  a *different* domain returned and then correctly rejected) — reachable by dragging a pole through a
  particular angle in the PQD-singular tab. The failure is honest (nothing wrong is certified), which is
  why this is MEDIUM and not HIGH.
- **Fix:** the cheapest correct change is to make the seed rotation-equivariant: seed
  `powerQD_singular` from the θ = 0 solution rotated, or (better) anchor the αth-root continuation at
  the *real-positive-gauge* rotation of `w₀` rather than at `α·arg(w₀)` with a principal `cpow` in
  `r0Const`, so the branch choice cannot depend on where `arg w₀` sits relative to `±π/α`.
  A test that solves one preset at 8 rotations and asserts `|z₀|` is constant to 1e-9 would pin it —
  and is the general-purpose equivariance test **no weighted family currently has**.
- **Prior:** new.

### WGT-5 [LOW] [code] `THEORY_MAP.md` has no Chapter IV (PQD) section at all, and every weighted line number in it is stale
- **Where:** `THEORY_MAP.md` — §"LQD families (Thesis Chapter V)", §"Theorem 5.6.2", §"Polynomial-h …".
- **What:** four PQD families ship (`powerQD`, `powerQD_singular`, `unboundedPQD`,
  `unboundedPQD_singular`) and Chapter 4 is a whole chapter of the thesis (Prop. 4.1.1, Eq. 4.3,
  Thms 4.3.1–4.3.6, 4.5.1/4.5.3), but the file — whose stated job is "the bridge between the math … and
  the specific code" — contains **no PQD row anywhere**. Separately, every weighted `file:line` in it is
  wrong; the singular-LQD table is wrong by up to 195 lines and points one entry at a file the code left:

  | THEORY_MAP says | actual |
  |---|---|
  | `blaschkeEval` `solver-lqd-common.mjs:52` | `:54` |
  | `blaschkeTaylor` `:65` | `:67` |
  | `rHashLaurentAtInfinity` `:132` | `:134` |
  | `blaschkeLaurentAtInfinity` `:170` | `:172` |
  | `phiLaurentAtInfinity_UQDL` `:204` / `_UQDLS` `:237` | `:206` / `:239` |
  | `evalPhi_LQDS` `solver-lqd-singular.mjs:99` | `:102` |
  | `phiTaylorAt_LQDS` `:109` | `:112` |
  | `computeTargetA_LQDS` `:137` | `:140` |
  | `residual_LQDS` `:151` | `:154` |
  | `SCHEMA_LQDS` `:273` | `:276` (also `CONTRIBUTING.md:102`) |
  | `initialGuess_LQDS` `:299` | `:307` |
  | `diverseInitialGuess_LQDS` `:463` | `:309` — the function itself now lives in `seeds/seeds-lqd-singular.mjs` |
  | `verifyQuadratureIdentity_LQDS` `:549` | `:354` |
  | `QD.registerFamily('boundedLQD_singular')` `:629` | `:459` |
- **Evidence:** `grep -n` transcripts above; the file's own header says "Line numbers are accurate as of
  the P3 docs pass".
- **Fix:** add a Chapter IV section (Prop. 4.1.1/Eq. 4.3 → the four PQD `verifyQuadratureIdentity_*`
  kernels; Cor. 4.3.1/Thm 4.3.4 → `modifiedResidues_PQD` + `r0Const` per family) and refresh the lines.
  Better: drop line numbers for symbols the file already says are the source of truth.
- **Prior:** new.

### WGT-6 [LOW] [code] `solver-pqd.mjs`'s header states the *opposite* of the family's hypothesis
- **Where:** `app/solvers/solver-pqd.mjs:20` — "Parametrization used here (bounded, **0 ∈ Ω** so φ_in ≡ 1
  per Equation 4.9)".
- **What:** `Family.powerQD` is the NON-singular bounded family: `normalizeOpts` throws
  "w₀ = φ(0) must be nonzero (**0 ∉ Ω**; singular 0 ∈ Ω is a separate family)" 600 lines below, README's
  table says `0 ∉ Ω`, and `solver-pqd-common.mjs:9` says `powerQD (bounded, 0∉Ω)`. φ_in ≡ 1 is precisely
  the 0 ∉ Ω case (thesis Thm 4.3.4: `C = w₀^a` when 0 ∉ Ω, `C = w₀^a/|z₀|^a` when 0 ∈ Ω — the code's
  `r0Const` in `solver-pqd.mjs` is the former, in `solver-pqd-singular.mjs:122` the latter).
- **Fix:** `0 ∉ Ω`. One word; it is the first thing a reader of this family sees.
- **Prior:** new.

### WGT-7 [LOW] [code] The two bounded-LQD verifiers use two different integral conventions, and only one of them scales the relative-error floor
- **Where:** `app/solvers/solver-lqd.mjs:350` (`lhs *= 1/N`, RHS = Σ Res — the repo's
  1/(2πi)-suppressed `∮`) vs `solver-lqd-common.mjs:546` (`lhs *= 2π/N`, then `× i`; RHS = `2πi·Σ Res` —
  the literal line integral), with the shared floor `residueScaleFloor` at `:524` returning
  `Σ|C_{j,1}| + |q|` in **both** cases.
- **What:** each verifier is internally consistent (I checked both against Green's theorem with
  `dA = dx dy/π`: `∫_Ω f/|w|² dA = ∮ f·ln|w|²/w dw` suppressed, and the PQD form
  `(1/α)∮ f·w^{α−1}w̄^α dw` — and the coincidence check in **Health** confirms the numbers), so there is
  no factor error in a returned value. But `relDiff = absDiff / max(|lhs|, |rhs|, scaleRef)` mixes them:
  in the generic path `absDiff`, `|lhs|`, `|rhs|` are all 2π× larger while `scaleRef` is not, so whenever
  the floor binds (both sides near zero) the *same* physical error is graded 2π× more harshly against the
  single `IDENTITY_TOL = 1e-6` (`solver.mjs:120`) than in `boundedLQD`. Three of the four LQD families run
  the generic path, `boundedLQD` does not.
- **Fix:** have `verifyIdentityGeneric` scale `scaleRef` by `2π` (or, cleaner, drop the `2π·i` from both
  sides of the generic skeleton so all four LQD verifiers speak the repo's suppressed-`∮` convention —
  the RHS builders then lose their `twoPiI` / `minusTwoPiI` constants and the orientation sign stays).
  Whichever is chosen, say it once in `THEORY_MAP.md` §Conventions.
- **Prior:** new.

## Structural observations

- **The `phi.family` tag is the de-facto weighted/classical discriminator and only half the consumers
  check it.** `boundedClassicalMapSpec` (`schwarz-export.mjs:57`) checks it and is right; `phiToMapSpec`
  (`:31`) and `classifyPhiForExport` (`:82`) branch on `phi.unbounded` alone and are wrong (WGT-1).
  `clonePhi` (`solver.mjs:123`) propagates it correctly. Better: a single exported
  `QD.familyOf(phi)` / `QD.isWeighted(phi)` that every consumer calls, so "which family is this φ?" has
  one implementation rather than three ad-hoc structural sniffs.
- **`define-family.mjs` removed the scaffolding but not the *validation* asymmetry.** Each family's
  `normalizeOpts` hand-rolls its own checks: `unboundedPQD`/`unboundedPQD_singular` reject empty
  quadrature data, `unboundedLQD_singular` rejects `h = q/w` by name, and the four bounded families
  validate `w₀`/`α` only. None validates `hData.polyPart` (WGT-2). A `validateHData(hData, {bounded})`
  helper invoked by the factory would close a whole class of input holes without merging any engine
  (ADR-0007 is about extracting *primitives on a second consumer*; this is the factory's existing job).
- **Duplication is real but mostly benign; the divergences I could find are cosmetic.** Normalising away
  comments and blank lines, there are **77 distinct 8-line blocks shared across ≥ 2 of the 16
  `solver-*.mjs` files**, concentrated in `solver-uqd-pqd.mjs` ↔ `solver-uqd-pqd-singular.mjs`
  (17 blocks). Aligning the two files function-by-function
  (`scratch/A2` python diff): `shiftUp` is byte-identical (similarity 1.00) and could move to
  `PqdCommon`; `evalRHash_UPQD`/`_UPQDS` (0.90) and `rHashInS_UPQD`/`_UPQDS` (0.84) differ **only in
  trailing comments** — the code is identical, which is the copy-paste shape most likely to diverge next.
  `r0Const` exists three times and is genuinely different each time (`w₀^α/|z₀|^α`, `c^α`, `(c|z₀|)^α`) —
  correctly not merged. `computeTargetA` (0.85) and `residual` (0.73) diverge for real reasons.
  The honest recommendation is narrow: lift `shiftUp`, and delete the two comment-only deltas so a future
  `diff` of those pairs is empty and a real divergence becomes visible.
- **No weighted family supplies an analytic Jacobian** — `newtonSolve` (`solver.mjs:495`) always uses
  `numericalJacobian`, forward differences at `eps = 1e-7`, auto-upgrading to central on
  `condEst > CENTRAL_DIFF_COND_TRIGGER`. Note that `evalFRaw` (`:533`) goes through
  `unpackPhiBySchema`, which **clamps** (`applySchemaClamps:1120`); for the schema families
  (`boundedLQD_singular`'s `z₀` at `|z₀| ≤ 0.9999, ≥ 1e-3`, and the unbounded singular ones) a variable
  sitting on its clamp yields a one-sided or identically-zero FD column, silently. The hand-written
  `unpackPhi` families (`boundedLQD`, `powerQD`, `boundedQD`) do not clamp inside `residual`, so the
  Jacobian means two different things across the ten families. Worth either clamping in both or neither.
- **The identity verifiers' effective test class is thinner than the check count suggests.**
  `verifyQuadratureIdentity_LQD` reports 9 checks (3 test points × k = 1..3), but the two "far" points
  sit at `1.5·span + 1` from the centroid, where `1/(w−b)^k` is already tiny: perturbing `A_{1,1}` by
  1e-3 moves `relDiff` by **1.41e-3 at b = 0** and by **1.86e-6 / 4.35e-6 at the far points** — 760×
  less. For a one-pole `a = 1` case the three `k` at `b = 0` are numerically the same check.
  `verifyQuadratureIdentity_LQDS` is weaker still (monomials `w^k` only, no pole-localised functions).
  Improvement 1 below replaces both with a single check that is exhaustive by construction.
- **The `(●₀)` "INDEPENDENT origin-residue check"** (`solver-lqd-singular.mjs:~405`) is independent of the
  *monomial tests* (which are structurally blind to `q`) but is the **same equation the solve enforces**
  in `residual_LQDS:180`. It catches an unconverged block; it cannot catch an error in the formula. The
  comment should say so — as written it reads as corroboration.

## Improvement proposals (core functionality)

1. **Make the thesis coincidence equation the weighted families' identity verifier.** (S–M; no
   prerequisites; low risk — it can run *beside* the existing verifiers first.) Eq. (5.2)/(5.3) and (4.3)
   say the Schwarz function `S` (`ln|w|²/w` for LQDs, `(1/a)w̄|w|^{2(a−1)}` for PQDs) minus `h` extends
   analytically into Ω. Pulled back through φ that is one FFT: the negative-frequency mass must vanish
   for a bounded family, the positive-frequency mass **and `c₀`** for an unbounded one. Measured above for
   all eight families at 1e-11…1e-16. It buys three things the current verifiers cannot:
   (a) it tests *every* Fourier mode instead of 3–9 hand-chosen test functions;
   (b) it is the **only** check that sees `q` — no admissible test function can, since `f` must vanish at
   0 (`wrong q` reads 1.57e-1 against 1.3e-16);
   (c) it is a genuinely *independent* route, not a restatement of the residual. It is also the same
   idea the Direct tab already ships (README §"Verify" — Fourier negative-frequency mass), so this is
   bringing the weighted inverse tab up to the Direct tab's standard. `scratch/A2/schwarzcheck.mjs` is a
   40-line prototype.
2. **Ship the two limits as cross-family regression tests, and as a UI affordance.** (S.) α→1 ⇒
   `boundedQD` and α→0⁺ ⇒ `boundedLQD` (Thm 5.2.1) both hold to O(α) with the constants measured above.
   As tests they would have caught any future branch-choice or modified-residue regression in
   `powerQD`; as a UI affordance ("α → 0 shows the LQD limit") they make the chapter's own headline
   result visible. Prerequisite: none. Risk: none.
3. **A rotation-equivariance test for all eight weighted families** — solve one preset at 8 rotations
   and assert the rotation invariants (`|z₀|`, `|w₀|`, the boundary's weighted area) are constant to
   1e-9. This is the test that exposes WGT-4, it costs one loop, and it is the cheapest general check
   available for a family whose φ involves an αth root or a log. (S; prerequisite: WGT-4's fix, or it
   lands red.)
4. **Put the weighted closed forms in the analytic-oracle gallery.** (M.) `app/analysis/thesis-examples.mjs`
   ships **seven** examples, all classical (disk, D₂/D₃/D₄ multipoles, cardioid, deltoid, single exterior
   pole) — zero weighted, although the thesis's weighted chapters are exactly where the closed forms are:
   Thm 5.3.2 (`φ = w₀e^{z√α}`, `∂Ω = {|ln(w/w₀)|² = α}`, double point at `π²` — already reproduced to
   3e-8 here), Thm 5.6.1 (the unbounded one-point LQD with its univalence range), Example 4.3.1
   (`φ = c·z(1 − γ/z)^{1/α}`, `γ = −α·h₀/c^{2α−1}` — already a shipped preset with no oracle), and
   Thms 4.5.1/4.5.3 (monomial PQDs, `φ = c·z(1 − γ_k/z^k)^{1/α}`). Each is a `{mode, α, poles, c|w₀}`
   row plus expected area / symmetry / cusp count. This is the single highest-value gap I found in the
   weighted families' *analysis* surface: the oracle card currently cannot grade anything weighted.
5. **Close the singular-family degenerate corners the headers defer.** (M–L; risk: real.)
   `solver-lqd-singular.mjs:25` defers `z₀ = 0`, and `SCHEMA_LQDS:276` clamps `|z₀| ≥ 1e-3` — but `z₀ = 0`
   is exactly the **centred disk**, i.e. Thm 5.3.1's complete classification of null LQDs (`h = q/w`,
   `q = ln R²`), the chapter's one fully-solved family. The same corner is unreachable in
   `powerQD_singular`. A `z₀ = 0` branch (φ = γ·z·exp(r#), the Blaschke factor degenerating to `z`,
   `w₀ = 0` so the normalisation must move to `|φ'(0)| = |γ|`) would make the classification theorem
   demonstrable in-app. Prerequisite: the `(φ₀)` normalisation currently reads `γ·|z₀| = w₀`, which is
   vacuous at `z₀ = 0`, so this needs its own gauge — that is the work, and it is why it was deferred.
6. **Bounded-LQD polynomial-h is listed as "not yet shipped" (README:944) — the first step is to refuse
   it, not to build it.** WGT-2's fix is that step and is 10 lines; the β-machinery already exists for
   the unbounded pair (`phiLaurentAtInfinity_UQDL`, `lqdBeta`) but is meaningless for a bounded Ω, so
   the README entry should arguably be reworded from "deferred" to "not applicable".

## Documentation drift

| doc file:line | claims | reality (file:line) | severity |
|---|---|---|---|
| `THEORY_MAP.md` (whole file) | it is "the bridge between the math … and the specific code"; has a Chapter V section | **no Chapter IV / PQD section at all**, while 4 PQD families ship (`solver-pqd*.mjs`, `solver-uqd-pqd*.mjs`) | MEDIUM |
| `THEORY_MAP.md` §Thm 5.6.2 table | `verifyQuadratureIdentity_LQDS` at `solver-lqd-singular.mjs:549`; `registerFamily` at `:629`; `diverseInitialGuess_LQDS` at `:463` | `:354`, `:459`, and the function moved to `seeds/seeds-lqd-singular.mjs` | LOW |
| `THEORY_MAP.md` §LQD families table (6 rows) | `solver-lqd-common.mjs:52/65/132/170/204/237` | `:54/67/134/172/206/239` | LOW |
| `CONTRIBUTING.md:102` | `SCHEMA_LQDS` at `solver-lqd-singular.mjs:273` | `:276` | NIT |
| `app/solvers/solver-pqd.mjs:20` | "(bounded, **0 ∈ Ω** so φ_in ≡ 1 per Equation 4.9)" | the family requires `0 ∉ Ω` (`normalizeOpts` throw; `README.md:328`; `solver-pqd-common.mjs:9`); thesis Thm 4.3.4 pairs φ_in ≡ 1 with 0 ∉ Ω | LOW (WGT-6) |
| `app/schwarz/schwarz-export.mjs:245` | "A rational φ, **or a weighted (LQD/PQD) bounded φ**, returns null" | true for bounded; the four *unbounded* weighted families are exported as classical Laurent maps (`:31`) | CRITICAL (WGT-1) |
| `app/solvers/solver-lqd-singular.mjs` (QDS-5 comment) | "**INDEPENDENT** origin-residue check" | it re-evaluates the same `(●₀)` equation the solve enforces (`residual_LQDS:180`) — independent of the monomial tests only | LOW |
| `app/solvers/solver-pqd.mjs:12` | "α = 1 recovers classical bounded QDs"; non-integer α "fully supported (QA milestone)" | correct and measured (α→1: 7.4e-5 at 1e-4), but the thesis states its PQD Faber theorems 4.3.1/4.3.2 for `a ∈ Z⁺`; the general `a > 0` case rests on Prop. 4.1.1 / Thm 4.3.4. Worth one sentence saying which theorem covers non-integer α | LOW |

## Tests

- **Coverage gap that let WGT-1 ship green:** `vitest/schwarz-export.test.ts:155` builds a
  `boundedWeightedPhi = { unbounded:false, family:"boundedLQD", … }` and asserts refusal, and
  `app/test/cas-export.test.js` mentions no weighted family at all
  (`grep -in 'lqd\|pqd\|weighted'` → no hits). There is **no fixture with
  `{ unbounded:true, family:"unboundedLQD"|"unboundedLQD_singular"|"unboundedPQD"|"unboundedPQD_singular" }`**
  anywhere in the suite — which is exactly the half of the weighted matrix that leaks. Four one-line
  fixtures close it.
- **`app/test/solvers-1.test.js:415`** (Thm 5.3.2) tests α ∈ {0.3, 0.4, 0.5, 1.0, 2.0} — all far below
  `π² = 9.8696`. The comment at `:450` explicitly omits the critical-α case. The bisection above shows
  the app reproduces the threshold to **3e-8 relative**, and `φ` matches `w₀e^{t√α}` to 1.1e-32 *at*
  `α = π²` — so the strongest available assertion of the chapter's headline theorem is currently
  untested and would pass today.
- **No weighted family has a rotation-equivariance test** (WGT-4 / proposal 3), and no test anywhere
  exercises the α→1 or α→0⁺ limits (proposal 2), although both are thesis theorems and both hold.
- **`app/test/solvers-4.test.js:514-549`** runs `runFamilyBattery` for `boundedLQD`,
  `boundedLQD_singular` and `unboundedLQD_singular` — but **not** for `unboundedLQD`, `powerQD`,
  `powerQD_singular`, `unboundedPQD` or `unboundedPQD_singular`. Five of the eight weighted families
  have no battery row.
- **Bounded `q` is real-only in practice and nothing records it.** `boundedLQD_singular` solves for every
  real `q ∈ [0, 5]` tested but fails for **every** `Im q ≠ 0` down to 0.02, and fails outright for a
  complex residue `C = 0.5 + 0.1i` at any `q` (`scratch/A2/p9.mjs`, `p11.mjs`). For the *real* presets
  this is correct — an ℝ-symmetric domain forces `q ∈ ℝ` — but Thm 5.3.1's `q ∈ ℂ` is untested, and I
  could not separate "no such domain" from "seeds cannot reach it" in the time available.
  **[plausible]** — closing experiment: construct a singular LQD forward (pick `z₀`, `γ`, `A` with a
  genuinely complex `r#`), read off `h` and `q = ln|γ|² + r#(z₀) + conj(r#(1/z̄₀))` (which is then
  complex by construction), and feed that `(h, q)` back to the solver. If it fails, the defect is in the
  seeds; if `q` comes out real for every such construction, complex `q` is unreachable and the family
  should say so.
