# A3 — Direct problem (φ → h) and the post-solve analysis modules

## Scope covered

**Read end to end:** `app/direct/{README.md, direct-common.mjs (2,222 l), direct-recompute.mjs,
direct-ui.mjs, direct-verify.mjs}`; `app/analysis/{univalence, cusps, critical-set, observables,
symmetry, thesis-examples, family-sweep, faber-analysis, riemann-latex}.mjs`;
`app/workers/analysis-worker-entry.mjs`; the consuming UI (`ui-solve.mjs` `renderGeomProps` /
`renderCusps` / `renderObservables` / `runStatusAnalyses`, `ui-strings.mjs` help text);
`app/test/{direct, cusps, cusp-accuracy, symmetry, thesis-examples, observables}.test.js`;
`THEORY_MAP.md` direct/analysis rows; the Aug-17 finding 07 + its PROGRESS follow-up.

**Ran:** the full headless suite, 8 purpose-built probe scripts (round-trips, counterexample
searches), and one reverted source mutant. Thesis correspondence checked against the **faithful**
extraction `scratchpad/pdftool/thesis-pdfjs.txt` (the coordinator's correction — Thm 3.2.2/3.2.3,
Def 3.0.2, the `Rat(Ω)`/`dA` conventions; I re-verified the one conclusion I had drawn from the
broken `thesis.txt` and it got *stronger*).

**Not covered, honestly:** (a) the eight **weighted** forward kernels were spot-checked
(`boundedPowerQD`, `boundedLogQD`, one round-trip each) rather than re-derived against Thm
4.3.5/4.3.7 — their `(★)`-inversion-by-probing construction is structurally self-consistent and
§DF pins them, so I spent the budget on the classical unbounded case where the defects were; (b)
no browser run (`test:browser`) — every finding below is reachable from node; (c) `@cas/core`'s
`dftOnCircle`/`taylorViaFFT` are **not used by direct mode** (it has its own naive O(N·K) DFT,
`direct-common.mjs:670`), so nothing to review there; `@cas/faber` is used only by
`analysis/faber-analysis.mjs` (a thin, correct adapter) and **not** by the direct engine, whose
"forward Faber" is QD's own `solver-faber.mjs` — no cross-app package finding; (d) `riemann-latex.mjs`
is display-only and KaTeX-`throwOnError`-tested — skimmed, no finding.

**Prior findings:** Aug-17 finding 07 (geometric moments mislabelled "QD harmonic moments") is
**closed** — `observables.mjs:35-41,146-147` now carries the ⚠ CONVENTION note verbatim to the
recommendation and `vitest/qd-m0-convention.test.ts` pins both numbers. Not re-reported.

## Health

| Command | Result |
| --- | --- |
| `node app/node-test.js` | **2342 passed, 0 failed** (exit 0) — green baseline |
| `node runone.js` (direct.test.js alone, via `app/test/bootstrap.js`) | all pass |
| `git status --short` at finish | empty; `git diff --stat -- app/direct app/analysis app/workers app/test` empty |

All probe scripts live in `scratchpad/scratch/A3/` (`boot.mjs` is the shared loader;
`repro-unbounded.mjs`, `univ.mjs`, `cusp.mjs`, `numeric.mjs`, `sym.mjs`, `sym2.mjs`, `pqdfwd.mjs`,
`rt1/rt2/rt5.mjs`, `dir2ctl.mjs`). Run any of them from `/home/user/complex-analysis-suite` with
`node scratchpad/scratch/A3/<name>.mjs`.

---

## Findings

### DIR-1 [CRITICAL] [confirmed] `Direct.unboundedQD` invents a finite pole of h **outside Ω** — the exterior of a disk gets an h the app's own verifier scores at 100 % relative error

- **Where:** `app/direct/direct-common.mjs:577-599` (the `FINITE POLES` block: `m === 0` →
  `finitePoles.push({a: 0, principal: [c²]})`; `allZero` → `finitePoles.push({a: F[0], principal: [c²]})`),
  documented as intended at `:528-535`; consumed unguarded by
  `app/direct/direct-recompute.mjs:405-410` (`lastH = result.hData` → `displayH`) and by
  `app/direct/direct-ui.mjs:1008-1021` (`Send to inverse`). Pinned as correct by
  `app/test/direct.test.js:263`, `:272`, `:282`.
- **What:** For the classical unbounded Laurent input `φ(z) = c·z + F₀ + F₁/z + …`, when `m ≤ 1`
  (or the tail is all-zero) the kernel adds `c²/(w − F₀)` to h. `F₀` is the **centre of the bounded
  complement K**, not a point of Ω. Thesis **Definition 3.0.2** requires `h ∈ Rat(Ω)` = "rational
  functions whose poles lie only in Ω" (`thesis-pdfjs.txt:401, 1017, 3420`), and **Theorem 3.2.3**
  gives `h = Φ_φ(C_𝔻 φ#)` with the explicit note **"`C_𝔻 φ#(z) = φ#(z) − c·z⁻¹`"**
  (`thesis-pdfjs.txt:3677-3712`) — i.e. the `c/z` term is *subtracted*, and `c²/(w−F₀)` is exactly
  `Φ_φ` of the term the theorem removes. For `φ = c·z` the theorem gives `C_𝔻φ# = c/z − c/z = 0`,
  so **h ≡ 0**. `THEORY_MAP.md:217-219` states the correct rule ("h is the sum of σ's principal
  parts at its finite poles **in Ω**") — the code contradicts the app's own spec.
- **Evidence:** `node scratchpad/scratch/A3/repro-unbounded.mjs`, grading the returned h with
  `QD.Family.unboundedQD.verifyQuadratureIdentity` **on the exact φ**, so any error is h's:

  | φ | h returned | identity(h returned) | identity(polyPart only) | Send-to-inverse |
  | --- | --- | --- | --- | --- |
  | `0.6 z` | `0.36/(w−0)` | **1** | **3.72e-16** | `FAIL: No algebraic root found` |
  | `0.6 z + (0.2+0.1i)` | `0.2−0.1i + 0.36/(w−0.2−0.1i)` | **1** | **6.50e-16** | `FAIL: No algebraic root found` |
  | `z + 0.3/z` | `0.3·w` | 3.93e-16 | 3.93e-16 | ok |
  | `0.45(z + 1/(2z²))` | `1.111·w²` | 2.41e-15 | 2.41e-15 | ok |

  `maxRelDiff = 1` is `|0 − RHS|/|RHS|`: for the exterior disk `∫_Ω f dA ≡ 0` for every
  `f ∈ A₀(Ω)`, and the invented pole contributes a non-zero RHS.
  **Negative control (mutation, applied then `git checkout`):** deleting the two
  `finitePoles.push` lines makes `direct.test.js` go `FAIL Direct unbounded exterior of unit disk:
  pole at 0 with residue 1` and then hard-`TypeError` at `:272` — three assertions pin the defect
  as intended behaviour. And `solveInverseQD({poles:[],polyPart:[]}, {unbounded:true, c:0.6})`
  succeeds instantly (`univ=true, id=3.72e-16, φ.c=0.600000`), which **falsifies the NB comment at
  `direct.test.js:299-305`** ("the existing unbounded-classical-QD inverse solver has trouble with
  the simple `c·z + F₀` shapes … a small basin-of-attraction issue"): the solver is fine, the h was
  wrong.
- **Why it matters:** The *simplest thing a user can type in the unbounded Direct tab* — `c`, no
  F coefficients, i.e. the exterior of a disk — produces a wrong h, displays it without any caveat,
  and then fails on `Send to inverse` with a message blaming the solver. A silently wrong quadrature
  function is precisely the class the honest-labelling guardrail exists to prevent, and this one is
  additionally green-lit by the Verify button (DIR-2).
- **Fix:** Delete both `finitePoles.push` calls and always return `{poles: [], polyPart}` for a
  Laurent φ (see DIR-3: a Laurent-polynomial φ is analytic on all of 𝔻*, so it can have **no**
  finite node at all). Replace `direct.test.js:259-284` with the thesis assertion — for `φ = c·z`,
  `h ≡ 0`; for `φ = c·z + F₀`, `h ≡ conj(F₀)` — and add the family-verifier assertion
  (`verifyQuadratureIdentity(exactφ, h).maxRelDiff < 1e-12`) so the check is against the identity
  rather than against a remembered pole.
- **Prior:** new.

### DIR-2 [HIGH] [confirmed] The Direct tab's **Verify** button measures the wrong Fourier side in unbounded mode — every valid non-trivial unbounded classical QD reads RED

- **Where:** `app/direct/direct-common.mjs:829-881` (`verifyBoundaryIdentity` returns
  `negMass`/`posMass`; the header at `:798-827` claims "For UNBOUNDED mode … Δ ≡ 0 and both negMass
  and zeroMass are ≈ 0"); the caller `app/direct/direct-verify.mjs:139-158` colours on
  `relNeg = negMass/scale` (`<1e-8` green, `<1e-2` amber, else red) for the classical path of
  **both** bounded and unbounded modes.
- **What:** The criterion is `σ − h` analytic **in Ω**, pulled back through φ. For a *bounded* φ
  (`𝔻 → Ω`) that means only non-negative frequencies on `|z| = 1` ⇒ `negMass ≈ 0` ✓. For an
  *unbounded* φ (`𝔻* → Ω`) it means only **non-positive** frequencies ⇒ the correct statistic is
  **`posMass`**. `Δ ≡ 0` holds only in the two degenerate cases `φ = c·z` and `φ = c·z + F₀`;
  for every other Laurent φ, Δ is a non-zero function of `1/z` — analytic in 𝔻*, exactly as
  required — and the app reports its magnitude as a failure.
- **Evidence:** `node scratchpad/scratch/A3/rt3.mjs` —

  ```
  phi = 0.6 z                          negMass= 2.39e-17  posMass= 1.76e-17   -> GREEN (but h is WRONG, DIR-1)
  phi = z + 0.3/z (ellipse)            negMass= 9.10e-1   posMass= 3.14e-16   -> RED   (h is exact, id 3.9e-16)
  phi = 0.45(z + 1/(2z^2)) deltoid     negMass= 2.32e-1   posMass= 7.50e-17   -> RED   (h is exact, id 2.4e-15)
  phi = z + 0.2/z + 0.1/z^3            negMass= 9.30e-1   posMass= 3.99e-16   -> RED   (h is exact)
  ```
  Closed form for the ellipse: `h(φ(z)) − conj(φ(z)) = 0.3(z+0.3/z) − (1/z + 0.3z) = −0.91/z`, so
  `negMass = 0.91` is the *expected* value of a correct answer.
  **Negative control** (`dir2ctl.mjs`): `posMass` is not vacuous — perturbing the polyPart to
  `0.45·w` (1.5×) gives `posMass = 1.50e-1` against `3.14e-16` for the correct h; an added constant
  is caught by `zeroMass = 1.00e-1`. (A pole placed at `0.5 ∈ K` is invisible to *both* sides —
  `posMass = 2.44e-16` — which is why this diagnostic cannot catch DIR-1 and the two findings need
  separate fixes.)
  The suite **pins the inversion**: `app/test/direct.test.js:718-723`,
  `'Verify: non-QD φ=z+0.3/z negMass > 0.1 (correctly flagged)'`, under the comment
  `// Non-QD case` — asserting that a genuine unbounded QD is flagged as a non-QD.
- **Why it matters:** The Verify button is the Direct tab's only honesty instrument, and on the
  unbounded family it is inverted: it green-lights the two cases whose h is wrong and red-lights
  every case whose h is right. A user typing the deltoid — one of the app's own thesis examples —
  sees `negative-freq mass = 2.32e-01` in red.
- **Fix:** Give `verifyBoundaryIdentity` an `unbounded` flag (the caller already knows
  `directState.mode`) and score `posMass` in that branch, keeping `zeroMass` as the constant check
  in both. Replace the `direct.test.js:718-723` assertion with `posMass < 1e-13` for the ellipse
  **and** an assertion that a perturbed polyPart gives `posMass > 0.1` (the negative control above),
  so the test pins the reason and not only the outcome.
- **Prior:** new.

### DIR-3 [HIGH] [confirmed] The "`F_l ≠ 0` ⇒ finite poles not computed; this Ω is unlikely to be a classical QD" warning is **always** a false alarm

- **Where:** `app/direct/direct-common.mjs:590-596` (the warning text), `:531-535` + `:2`-block
  header, and `app/direct/README.md` **Known limitations**, first bullet ("Classical unbounded
  *rational* φ is not implemented … a general Laurent tail emits a 'not yet implemented' warning").
  Surfaced to the user at `direct-recompute.mjs:407`. Pinned by `direct.test.js:293-297`.
- **What:** A Laurent-polynomial `φ(z) = c·z + Σ_{l<m} F_l/z^l` is analytic on the **whole** of
  `𝔻* = {|z|>1}` including ∞, so it has no pole in 𝔻* and therefore the unbounded family's
  `branches` list — the only source of finite quadrature nodes (`solver-uqd.mjs:12-22`, nodes are
  `a_j = φ(z_j)` with `z_j ∈ 𝔻*`) — is necessarily empty. `polyPart` alone **is** the complete h.
  The triangular back-substitution at `:544-572` matches every non-negative frequency of
  `conj(φ)` by construction, so `Δ = h∘φ − conj∘φ` has only strictly-negative frequencies, i.e.
  `σ − h` is analytic in Ω and vanishes at ∞ — which is exactly Theorem 3.2.3.
- **Evidence:** `repro-unbounded.mjs` rows 3 and 4 (above): both carry `finitePoleHandled = false`
  and the warning, while the *same* h scores `2.4e-15`/`3.9e-16` on the family identity verifier
  and **round-trips through `solveInverseQD` to `max|φ_inv − φ_orig| = 1.57e-16` (deltoid) and
  `2.29e-16` (ellipse)** on `|z| = 1` (`rt2.mjs`). The deltoid is the app's own
  `thesis-examples.mjs:100` showcase; the Direct tab tells the user it is "unlikely to be a
  classical QD".
- **Why it matters:** The two shapes the unbounded Direct tab exists to demonstrate (ellipse
  exterior, deltoid/hypocycloid exterior) are the two it disowns. Combined with DIR-1 and DIR-2 the
  unbounded classical direct problem is exactly inverted: right answer + warning + red badge, or
  wrong answer + no warning + green badge.
- **Fix:** Delete `finitePoleHandled` and the warning; state in the header and README that for a
  Laurent-polynomial φ, h is a polynomial in w (Thm 3.2.3) and finite nodes require φ to have poles
  in 𝔻, which this input shape cannot express. If the input is ever widened to unbounded *rational*
  φ, reinstate the branch there. Replace `direct.test.js:290-297` with an identity-verifier
  assertion on the ellipse.
- **Prior:** new.

### DIR-4 [HIGH] [confirmed] `classifyUnivalence` applies the minimum principle without its hypothesis — `z² − 0.5z` is certified **convex ✓, star-like ✓, spiral-like ✓** while being 2-to-1 on 𝔻

- **Where:** `app/analysis/univalence.mjs:104-140` (one boundary sweep; `starMargin = min Re(z φ′/(φ−c))`,
  `convexMargin = min Re(1 + z φ″/φ′)`), header claim at `:15-18` and `:31-33`; rendered as green
  `✓ yes` rows by `app/ui/ui-solve.mjs:753-766`; help text `app/ui/ui-strings.mjs:315-317`:
  *"The hierarchy is convex ⟹ star-like ⟹ spiral-like, all ⟹ univalent."*
- **What:** `Re g > 0` on `∂𝔻` implies `Re g > 0` in 𝔻 only when `g` is **analytic in 𝔻**. For the
  star function that needs `φ − c` to have exactly one zero in 𝔻; for `q` it needs `φ′` to have
  **no** zero in 𝔻. Both hypotheses fail precisely in the non-univalent regime the test is supposed
  to detect, so `g`/`q` acquire poles and the boundary minimum says nothing. The only guard,
  `convexIndeterminate`, fires on `|φ′|² < 1e-24` (`PHIP_FLOOR2`) — i.e. `|φ′| < 1e-12` at one of
  360 sampled θ — which essentially never happens.
- **Evidence:** `node scratchpad/scratch/A3/univ.mjs` (φ built in the app's own boundedQD
  representation, one branch at `z_j = 0`):

  ```
  A) phi = z^2 - 0.5 z      isBoundaryUnivalent=false
     star-like : true  margin = 1.666667
     convex    : {"is":true,"margin":1.8}
     spiral-like: true  arcWidth = 33.2 deg
     witness: phi(0.5700) = phi(-0.0700) to |dphi| = 8.85e-18   (phi'(0) = -0.5, so not a degenerate map)
  C) phi = z + 0.8 z^2      isBoundaryUnivalent=false
     star-like : false margin = -3.000000
     convex    : true  margin = 1.615385          <-- convex YES while star-like NO
  B) phi = z + 0.3 z^2      isBoundaryUnivalent=true      (negative control)
     convex    : false margin = -0.5              <-- correct: z+a z^2 is convex only for |a| <= 1/4
  ```
  Case **C** is self-contradictory *on the card*: the panel prints `convex: ✓ yes` beside
  `star-like: ✗ no` while the `?` help says convex ⟹ star-like. Case **B** is the negative control
  that shows the convexity test is not trivially true.
  Reachability: `runStatusAnalyses` (`ui-solve.mjs:604-660`) calls `classifyUnivalence` on
  `primary.phi` after **every** solve, and `solveInverseQD` returns a non-univalent "best of the
  bad" primary when no valid QD exists (`family-sweep.mjs:27-31` documents exactly this).
- **Why it matters:** A card whose whole purpose is to certify the shape of Ω reports a green ✓ for
  a map that folds. The single italic note (*"these sufficient conditions presuppose a univalent Ω"*)
  does not undo three ✓ rows plus a help string that states the implication.
- **Fix:** The winding numbers are free from the sweep that is already running. In the same loop
  accumulate `Δarg(φ − c)` and `Δarg(φ′)` over `|z| = 1`; `N₀ = Δarg(φ−c)/2π` and `N₁ = Δarg(φ′)/2π`
  are the zero counts in 𝔻 (exact integers for an analytic φ). Report `starLike` only when
  `N₀ === 1` and `convex` only when `N₁ === 0`, otherwise `{indeterminate: true}` with the reason
  ("φ − w₀ has 2 zeros in 𝔻 — the boundary test does not apply"). Drop `PHIP_FLOOR2`, which the
  winding count subsumes. Pin with the two cases above plus the `z + 0.3 z²` control.
- **Prior:** new.

### DIR-5 [MEDIUM] [confirmed] The two **bounded non-singular** weighted forward kernels never check univalence, so the realizability gate in `direct-recompute` is dead for them

- **Where:** `app/direct/direct-common.mjs:1273-1355` (`boundedPowerQD`) and `:1356-1411`
  (`boundedLogQD`) — neither calls `QD.isBoundaryUnivalent` (its five call sites are `:1542`
  singular-PQD, `:1813`, `:1878`, `:1991`, `:2030` — all singular or unbounded). The consumer gate is
  `app/direct/direct-recompute.mjs:261-264`, `if (result.univalent === false)`, which cannot fire on
  `undefined`. `app/direct/README.md` § *Weighted families* claims otherwise: *"**Realizability ⟺
  univalence of φ** (Thm 4.3.3): a non-univalent kernel returns `{ univalent:false, warnings }`
  rather than bad data"*.
- **What:** For a rational kernel `R#` analytic and non-vanishing on 𝔻̄ but whose `φ = (R#)^{1/α}`
  is not univalent, no PQD exists (Thm 4.3.3), yet `boundedPowerQD` returns finite-pole data with
  `univalent: undefined` and `warnings: []`; the tab draws the self-intersecting ∂Ω and offers
  `Send to inverse`.
- **Evidence:** `node scratchpad/scratch/A3/pqdfwd.mjs` sweeps `R# = (1+az)(1+bz)/(1−cz)²` over
  `a ∈ {.85,.9,.95}`, `b ∈ {−.85,−.9,−.95}`, `c ∈ {.85,.9,.95}`, `α ∈ {2,3,4}` (all roots strictly
  outside 𝔻̄, so the kernel's own validation passes) and samples φ with the **same** anchored-arg
  walk the UI uses (`sampleBoundedPhi`, `direct-recompute.mjs:50-64`):
  ```
  total non-univalent kernels accepted with no flag: 18   (of 27)
  e.g. R#=(1+0.85z)(1-0.95z)/(1-0.85z)^2, alpha=2
       boundary self-intersects: true | univalent field: undefined | warnings: []
       h poles: (order 2) @ 2.07507
  ```
  `boundedLogQD` has the same shape by inspection (no `isBoundaryUnivalent` call, no `univalent`
  key in its two `return`s at `:1371` and `:1410`).
- **Why it matters:** 2 of the 8 weighted forward kernels silently emit h for a domain that does not
  exist, and the README states the opposite. `originInside` is genuinely inapplicable here (φ never
  vanishes when R# does not), so that half of the README sentence is fine — the univalence half is not.
- **Fix:** Add the `isBoundaryUnivalent` check to both, built on the same anchored φ the kernels
  already construct (PQD already builds `anchorArg0`; LQD's φ is `w₀·exp(r#)`), and return
  `{univalent:false, warnings:[…]}` as the singular/unbounded siblings do. Pin with two §DF
  fixtures: the kernel above must be refused, and a nearby univalent one (e.g. `a=0.3, b=−0.2, c=0.4`)
  must not.
- **Prior:** new.

### DIR-6 [MEDIUM] [confirmed] `detectSymmetry` misses the mirror axis on **30 of 86** univalent real-coefficient quartics, and is structurally blind to 11-fold symmetry

- **Where:** `app/analysis/symmetry.mjs:105-127` — the reflection axis is tried only through the
  argmax-radius sample (`kFar`) and, failing that, the argmin (`kNear`); `:35` `DEFAULT_M = 2520`
  with `if (M % n !== 0) continue;` at `:89`.
- **What:** (a) For a mirror-symmetric Ω whose extreme boundary radii are attained at a **± pair**
  off the axis (which is generic), neither candidate is a symmetry axis and the function returns
  `reflectionAxes: []`, `confidence: 0`. (b) `2520 = 2³·3²·5·7` is not divisible by 11, so `n = 11`
  is skipped outright — the header notes this ("divisible by every order 2..12 except 11") but the
  return value says `rotationalOrder: 1` with no indication the order was never tested.
- **Evidence:** `node scratchpad/scratch/A3/sym2.mjs` — real-coefficient φ makes
  `φ(z̄) = conj(φ(z))` an *identity*, so Ω is exactly mirror-symmetric about ℝ:
  ```
  univalent real-coefficient quartics tested: 86;  mirror MISSED: 30
    phi = z -0.4 z^2 -0.2 z^3 +0.2 z^4  -> axes=0 order=1 conf=0.00   exact mirror residual = 0.00e+0
    phi = z -0.4 z^2 -0.1 z^3 +0.2 z^4  -> axes=0 order=1 conf=0.00   exact mirror residual = 0.00e+0
    phi = z -0.3 z^2 -0.2 z^3 +0.2 z^4  -> axes=0 order=1 conf=0.00   exact mirror residual = 0.00e+0
  ```
  (the residual is `max|φ(e^{iθ}) − conj(φ(e^{−iθ}))|` over 1440 samples — bit-zero).
  `node scratchpad/scratch/A3/sym.mjs` for the order gap:
  ```
  phi = z + 0.05 z^10  (D_9)   order= 9   axes= 9   conf= 1.000
  phi = z + 0.05 z^11  (D_10)  order= 10  axes= 10  conf= 1.000
  phi = z + 0.05 z^12  (D_11)  order= 1   axes= 1   conf= 0.300     <-- missed
  phi = z + 0.05 z^13  (D_12)  order= 12  axes= 12  conf= 1.000
  ```
- **Why it matters:** the detector drives the #9 symmetry-axis overlay and is an oracle field in
  `thesis-examples.checkOracle` (`reflectionAxesCount`), so a third of mirror-symmetric domains draw
  no axis and would grade `fail` if pinned. `confidence: 0` is reported for a domain that is exactly
  symmetric.
- **Fix:** (a) Axis candidates should not come from the radius extremes. The reflection is an index
  map `k ↦ K − k` for some `K ∈ {0,…,2M−1}` (the `2M` covers half-sample axes, which the current
  `2·kStar − k` cannot express at all); scan `K` with the existing early-break test — it exits after
  a few samples for a wrong `K`, so the amortised cost is ~`O(M)`. A cheaper seed that works for
  almost all shapes: `α = ½·arg(Σ_k pc[k]²)` and `α + π/2` (the principal axes of the second moment),
  verified exactly by the existing predicate. (b) For `n = 11`, take a second sweep at `M = 2530`
  (or set `M = 27720`); either way, when an order is not tested, say so rather than returning 1.
- **Prior:** new.

### DIR-7 [MEDIUM] [confirmed] Numerical mode shows a green `✓` on input whose own warning reads "the computed h is meaningless"; and the analyticity score cannot certify analyticity

- **Where:** `app/direct/direct-recompute.mjs:172-180` — `status.textContent = '✓'` with
  `style.color = '#2a8f2a'` is set unconditionally on any non-throwing
  `numericalBoundedQD` result, and the warning goes to a *separate* `warnBox`;
  `app/direct/direct-common.mjs:686-699` (the `analyticityScore = max_{1≤k≤10}|ĉ_{−k}|` diagnostic)
  and `:755` (`polynomialSuffices: analyticityScore < tol`).
- **What:** (a) A visibly non-analytic expression gets the same green ✓ as an exact polynomial.
  (b) The score is computed from samples on `|z| = 1` only, so it detects nothing that vanishes on
  the circle — `polynomialSuffices: true` is not evidence of analyticity, though the flag's name
  and the ✓ both read as if it were.
- **Evidence:** `node scratchpad/scratch/A3/numeric.mjs` (mathjs, the same parse/compile path as
  `direct-recompute.mjs:136-154`):
  ```
  z + 0.3*z^2        score=8.99e-17  h = 1.18/w + 0.3/w^2                      ✓  (correct)
  z + 0.1*conj(z)    score=1.00e-1   h = 1/w        ✓ GREEN   + "⚠ ... The computed h is meaningless for non-analytic φ."
  re(z) + i*im(z)^3  score=1.25e-1   h = 0.8125/w + 0/w^2 - 0.08374/w^3   ✓ GREEN + same ⚠
  abs(z)*z           score=9.60e-17  h = 1/w        ✓ GREEN   NO warning, polynomialSuffices = TRUE
  conj(z)            score=1.00e+0   h = (none)     ✓ GREEN   + "⚠ Inferred c_1 ≈ 0 ..."   (lastH = {poles:[]})
  1/(z-0.5)          score=1.00e+0   h = (none)     ✓ GREEN   + same ⚠
  ```
  `abs(z)*z` is the clean counterexample to the converse: it is non-analytic everywhere yet agrees
  with `z` on the sampling circle, so it scores `9.6e-17` and reads as an exactly analytic input.
- **Why it matters:** honest labelling. `✓` is the primary glyph; a reader who does not scan the
  warning box sees an accepted computation. Also, for the two `c_1 ≈ 0` returns `lastH` is set to
  `{poles: []}` (truthy), so `Send to inverse` will happily forward an empty h.
- **Fix:** Drive `status` from the result: `✓` only when `analyticityScore < tol` **and** the
  truncation tail is below tolerance; `⚠` amber when truncation is approximate; `✗` red when
  `analyticityScore > tol` or `c_1 ≈ 0`, and null `lastH` in the last case. Rename
  `polynomialSuffices` (or document it) as *"no non-analyticity is visible on `|z| = 1`"* — it is
  a boundary statement, not an interior one.
- **Prior:** new.

### DIR-8 [MEDIUM] [confirmed] `isCusp` ignores the module's own second estimator: a smooth near-cusp is drawn as a filled ● "ordinary 3⁄2-cusp", and `confidence` reaches a reader nowhere

- **Where:** `app/analysis/cusps.mjs:293` `const isCusp = Math.abs(dist) < cuspTol;` (`cuspTol = 5e-3`),
  `:289-291` (`pNum`, `confidence = max(0, 1 − |pNum − p|)`), header claim at `:26-29`
  ("a NUMERICAL log–log fit … distinguishes a genuine cusp, leading slope > 1, from a smooth
  near-cusp, slope ≈ 1"). Rendered at `app/ui/ui-solve.mjs:880-888` and
  `app/ui/ui-domain-plot.mjs:1311-1322` — **neither reads `confidence` or `numeric`**; a repo-wide
  grep finds `pLeading` only in `app/test/cusps.test.js:53,75,90`.
- **What:** (a) The `isCusp` verdict is purely geometric (`|‖z‖−1| < 5e-3`) and is contradicted by
  the module's own cross-check in exactly the band where it matters. (b) `confidence` is not merely
  unused — it is *anti*-correlated with correctness at higher order: a genuine exact `m = 3` cusp
  scores `0.000` because the log–log fit at those δ cannot resolve a 4th-order contact.
- **Evidence:** `node scratchpad/scratch/A3/cusp.mjs` (closed-form oracles, φ in the boundedQD
  representation):
  ```
  cardioid   phi = z + z^2/2            m=1 type=(2,3) isCusp=true  pNum=2.0000 conf=1.000   dist= 0.00e+0
  deltoid    phi = z + z^4/4            three cusps, all m=1 (2,3), pNum=2.0000 conf=1.000
  m=2        phi = z + z^2 + z^3/3      m=2 type=(3,4) isCusp=true  pNum=2.9463 conf=0.946   dist= 1.95e-6
  m=3        phi = z + 1.5z^2 + z^3 + z^4/4
                                        m=3 type=(4,5) isCusp=true  pNum=2.4820 conf=0.000   dist=-2.00e-5
  near-cusp  phi' zero at |z| = 1.005   m=1 type=(2,3) isCusp=TRUE  pNum=1.0138 conf=0.014   dist= 5.00e-3
  near-cusp  phi' zero at |z| = 1.02    m=1 type=(2,3) isCusp=false pNum=1.0009 conf=0.001   dist= 2.00e-2
  ```
  Row 5: `min|φ′|` on the circle is `4.98e-3` (not 0), the boundary is smooth there, the numerical
  estimator says slope `1.014`, and the app paints a filled magenta ● labelled *"ordinary 3⁄2-cusp"*.
  The exact (p,q) machinery itself is correct on all four oracles — the defect is the verdict, not
  the classification.
- **Why it matters:** "● filled = an actual boundary cusp" (`ui-solve.mjs:880-881`) is a claim of
  fact about ∂Ω, and the app holds the evidence that contradicts it. The advertised "two independent
  estimators" cross-check exists, is shipped through the analysis worker's payload, and is dropped
  on the floor.
- **Fix:** Require both: `isCusp = |dist| < cuspTol && pNum > 1 + margin` (or, keeping the geometric
  verdict, print the confidence in the row and downgrade the glyph below a floor). Separately, make
  `confidence` honest at higher order — either widen the δ ladder with `m` or report it as
  "numerical fit agrees / inconclusive" rather than a number that reads as 0 % certainty for an
  exact cusp. `cusps.test.js` already asserts `pLeading`; add one assertion that the near-cusp at
  `d = 4e-3` is **not** labelled an actual cusp.
- **Prior:** new.

### DIR-9 [MEDIUM] [code] `thesis-examples.mjs` is pinned to no thesis equation or figure, and two of its seven examples do not occur in the thesis at all

- **Where:** `app/analysis/thesis-examples.mjs:49-107` (the seven descriptors; no `thesisRef`,
  `equation` or `figure` field exists in the schema at `:15-28`); `app/test/thesis-examples.test.js`.
- **What:** Against the faithful extraction: the thesis contains **11 numbered Examples**
  (2.2.1, 4.1.1, 4.3.1, 4.5.1, 4.6.1, 5.2.1, 6.3.1, 6.3.2, 6.5.1, 6.5.2, 6.5.3) and 25 numbered
  Figures. **None** of them appears in the gallery, and the gallery's two marquee entries are not
  in the thesis: `grep -ic cardioid` → **0**, `deltoid` → **1** (a Schwarz-dynamics citation, not a
  QD example). Oracle status, entry by entry:

  | id | closed-form oracle? | what pins it |
  | --- | --- | --- |
  | `disk` | **yes** | `area = π`, `perimeter = 2π`, `M₀ = π`, uniform κ / harmonic measure |
  | `two-point-sym`, `triangle`, `square-4pole` | **no geometry** | only `rotationalOrder` / `reflectionAxesCount` integers + a `significantDigitsMin` floor |
  | `cardioid-unbounded` | **no** | `cMax: 1.449` — a **recomputed number** |
  | `deltoid-unbounded` | yes | `cMax: 0.5` — exact: `h = w²` ⇒ `F₂ = c²`, `φ′ = c − 2c²/z³`, cusp at `(2c)^{1/3} = 1` ⇒ `c* = ½` |
  | `single-pole-unbounded` | **no geometry** | `cuspCount: 0`, `reflectionAxesCount: 1` |

  The cardioid `c*` also **drifts across the repo**: `1.449` here vs `1.46` in
  `cusp-accuracy.test.js:161`, `cmax.test.js:145`, `solver-cmax.mjs:32`, `ui-strings.mjs:603`,
  `observables.test.js:72` — two numbers for one quantity, each with a tolerance wide enough to
  cover the other. And no example carries the `cusps: [{thetaDeg, type, orderM}]` oracle the schema
  defines, so the cusp-type engine (DIR-8) has no analytic anchor at all.
- **Why it matters:** the module's stated contract is *"each with an ANALYTIC ORACLE: the
  closed-form quantities a correct solve must reproduce"*. Four of seven have no closed-form
  geometry, and a test asserting a recomputed number to 6 % is not a golden.
- **Fix:** Add a `thesisRef` field and populate it; port at least Examples **4.3.1** (the
  `φ(z) = cz(1 − γ/z)^{1/a}` unbounded PQD family — a closed form with a stated univalence range)
  and **4.1.1** (`Ω_c = {|w³ − 1| > c³}`, WQD with `ρ = |w|⁴`) which are exactly the app's weighted
  families; derive and record the cardioid `c*` in closed form or relabel it `≈` with one agreed
  value; add `area`/`perimeter` oracles to the three symmetric bounded examples; add a `cusps:`
  oracle to the deltoid.
- **Prior:** new.

### DIR-10 [LOW] [code] `direct-common.mjs`'s derivation header states the QD identity in a **different area normalisation** from the thesis and from every other file in the app

- **Where:** `app/direct/direct-common.mjs:35` — `∫_Ω f dA = (1/(2i)) ∮ f·h dw`.
- **What:** The thesis fixes `dA = dxdy/π` and suppresses `1/(2πi)` in `∮`
  (`thesis-pdfjs.txt:502, 958-963`), which every solver header follows
  (`solver-qd.mjs:11`, `solver-uqd.mjs:12`, `solver-pqd.mjs:11`, …: `∫_Ω f dA = ∮_∂Ω f h dw`). The
  direct header writes an explicit `1/(2i)` **and** an unnormalised `dA`: for the unit disk its LHS
  is `π·f(0)` and its RHS is `π·Σ Res`, self-consistent but with `dA = dx dy`. The *computed* h is
  correct in the app's convention — verified: `boundedQD([0,1,a])` returns `C₁ = 1 + 2|a|²`,
  `C₂ = ā` (the closed form), giving `h = 1/w` for the unit disk, i.e. `Σ Res = 1 = ∫_𝔻 f dA` with
  `dA = dxdy/π`. So this is a doc finding, not a factor error — but it is the one place a reader
  looks for the direct problem's convention, and ADR-0006 exists to keep exactly this unambiguous.
- **Fix:** Rewrite line 35 as `∫_Ω f dA = ∮_∂Ω f·h dw   (dA = dx dy/π, 1/(2πi) suppressed — the
  app-wide convention; equivalently ∫_Ω f dx dy = (1/2i)∮_raw f·h dw)`.
- **Prior:** new.

### DIR-11 [LOW] [confirmed] Every sampled `file:line` reference in `THEORY_MAP.md` is stale

- **Where:** `THEORY_MAP.md:29,30,62-70,155-160,187-195,209,289,293`.
- **What:** 12 of 12 sampled references are wrong, from 2 lines off to 673:
  ```
  solver-faber.mjs/inverseFaberAtPole        doc=60   actual=62
  solver-faber.mjs/inverseFaberAtInfinity    doc=109  actual=111
  solver-qd.mjs/evalPhi_QD                   doc=36   actual=45
  solver-qd.mjs/phiTaylorAt_QD               doc=57   actual=73
  solver-qd.mjs/computeTargetA_QD            doc=93   actual=82
  solver-qd.mjs/residual_QD                  doc=114  actual=103
  solver-qd.mjs/verifyQuadratureIdentity_QD  doc=322  actual=272
  solver-qd.mjs/registerFamily               doc=427  actual=387
  solver.mjs/houseQR                         doc=195  actual=234
  solver.mjs/solveInverseQD                  doc=790  actual=1463
  solver-lqd-common.mjs/blaschkeEval         doc=52   actual=54
  solver-lqd-singular.mjs/verifyQuadratureIdentity_LQDS  doc=549  actual=354
  ```
  (This spans the whole table, not only my rows — flagged once; A1 owns the solver rows.)
- **Fix:** Drop the line numbers (the symbol name is stable and greppable) or generate them; a
  `scripts/` check that every `file.mjs:N` in `THEORY_MAP.md` lands within ±3 lines of the named
  symbol would keep it honest and costs one grep per row.
- **Prior:** new.

### DIR-12 [NIT] [code] `boundedQDRational`'s header names a function the body does not call

- **Where:** `app/direct/direct-common.mjs:1036-1038` — *"3. Apply `QD.Faber.inverseFaberAtPole(d,
  phiTilde)` to convert d → A"* — while the code at `:1177` calls
  `forwardLocalPrincipal(d, phiTilde)` (the *forward* primitive, correctly: this is the direct
  problem). `app/direct/README.md`'s "Rational P/Q" row says "per-pole principal parts via forward
  Faber", which is right.
- **Fix:** one-word edit.
- **Prior:** new.

---

## Structural observations

- **`app/direct/direct-common.mjs` is two files wearing one hat.** Lines 80-1005 are the classical
  kernels + generic polynomial/Taylor/parser utilities; 1190-2056 are the weighted families, which
  deliberately compute h by *probing and inverting the inverse solver's own `(★)` chain*
  (`:1339-1348`, `:1398-1406`, `forwardPolyPartAtInfinity` `:1772`). Those are two different
  *methods*, not two cases: the classical half derives h in closed form from φ's Taylor data, the
  weighted half never derives anything and is correct by construction against the solver. Splitting
  them (`direct-classical.mjs` / `direct-weighted.mjs`, with `trimTrailingZeros`/`reverseConjugate`/
  `polyTaylorAt`/`polynomialRoots`/`parseRationalInZ` moved to the existing `core/poly-helpers.mjs`)
  would make the asymmetry visible and put the parser next to its siblings. ADR-0007's second-consumer
  rule is already satisfied for the poly helpers — `param-slice` and `algebra` both parse polynomials.

- **The classical unbounded direct problem is the one place where "correct by construction against
  the solver" was *not* applied, and it is the one place that is wrong.** Every weighted kernel ends
  by building `phi`, calling `QD.isBoundaryUnivalent` and (for unbounded) `QD.originInsideOmega`;
  `unboundedQD` builds no φ at all and hand-rolls its finite-pole logic from a comment (`:525-535`).
  The smallest structural repair for DIR-1/2/3 is to make `unboundedQD` do what its siblings do:
  build the family φ (`{unbounded:true, c, polyA:F, branches:[]}` — the exact struct
  `solver-uqd.mjs` uses, which I used as the oracle in `repro-unbounded.mjs`) and grade its own h
  with `QD.Family.unboundedQD.verifyQuadratureIdentity` before returning. That single call would
  have caught all three findings at write time.

- **`classifyCusps`'s numerical estimator and `classifyUnivalence`'s margins are computed, shipped
  across the worker boundary (`analysis-worker-entry.mjs:16-33`), and half-consumed.** `confidence`,
  `numeric.pLeading` and `obs.moments`/`obs.centroid`/`obs.signedArea` reach the page and are
  rendered nowhere (`harmonicMeasure` is not even called by `analyze()`). Either surface them or stop
  paying for them — a cross-check nobody reads is not a cross-check. (`moments` has exactly one
  consumer, `thesis-examples.checkOracle:171`.)

- **Staleness handling in the analysis path is *good*, unusually so** — `runStatusAnalyses`
  (`ui-solve.mjs:604-652`) guards on both `_analysisToken` and object identity of `state.current`
  *and* `current.primary.phi`, so a worker payload can never attach to a newer φ. No race finding;
  worth keeping as the pattern the rest of the app should copy.

- **`family-sweep.mjs`'s two paths disagree about what "valid" costs.** The fast path classifies via
  `PS.solveOnePoint` (`cls === CLASS_VALID`) and the `includeNonUnivalent` path re-derives
  `univalent && identityOK !== false` by hand (`:63-71`, `:131-137`). The predicate is duplicated
  with a comment explaining that it must match; one exported `isValidMember(r)` on `param-slice-common`
  would make "must match" structural rather than aspirational.

- **`direct-verify.mjs` reads `directState.weight` in the bounded branch but `directState.lastWeight`
  in the unbounded one** (`:38` vs `:64`). Both toggles recompute (`direct-ui.mjs:314-338`), so the
  two are in step today — but the file is doing the same dispatch two different ways and only one of
  them is robust to a recompute that bailed early.

---

## Improvement proposals (core functionality)

1. **Make the unbounded classical direct problem correct, then widen it to rational φ.** (S for the
   fix, M for the widening.) Fixing DIR-1/2/3 restores the exterior-disk, ellipse and deltoid cases.
   The *real* gap the README's "Known limitations" should be describing is the one that actually
   exists: φ with poles in 𝔻 — `φ(z) = c·z + Σ F_l/z^l + Σ_j Σ_k conj(A_{j,k}) z^k/(1−conj(z_j)z)^k`,
   the family's own ansatz — which is the only way an unbounded QD acquires finite nodes. The
   bounded rational kernel (`boundedQDRational`) already does exactly this computation per pole;
   the unbounded twin is the same `forwardLocalPrincipal` applied at `z_j ∈ 𝔻*` plus the existing
   `polyPart` back-substitution. *Unlocks:* the whole unbounded one-point family of thesis §3.3
   from the φ side. *Prereq:* DIR-1. *Risk:* low — the identity verifier is the oracle.

2. **Turn the geometric-properties card from three asserted booleans into three certified ones.**
   (S.) DIR-4's winding-number guard is ~10 lines inside a sweep that already runs, and it converts
   "convex ✓" from a boundary heuristic into a statement with its hypothesis checked. The same two
   winding numbers give the card a genuinely new and *correct* row — `# zeros of φ′ in 𝔻` — which is
   the exact quantity `critical-set.mjs` currently estimates by seeding 157 Newton starts and
   deduplicating. *Unlocks:* a univalence claim the algebra tab's `certify univalence` path can be
   cross-checked against. *Risk:* low.

3. **Give the Direct tab the same validity verdict the Inverse tab has.** (M.) Today "is this h
   right?" is a button the user must press, whose criterion is wrong for one family (DIR-2) and
   blind to poles outside Ω (DIR-1's negative control). Since every family already exposes
   `verifyQuadratureIdentity` and the forward kernels can build φ, the direct pipeline can compute
   the same `maxRelDiff` + univalence verdict on every recompute and render the *same badge*
   (`qdValidityBadge`) the inverse view uses. The Fourier diagnostic stays as the cheap live-preview
   signal. *Unlocks:* one honest-labelling vocabulary across both directions; kills the whole class
   of DIR-1/2/5/7 defects at the point of display. *Prereq:* 1. *Risk:* medium — needs φ for the
   classical bounded polynomial/rational cases too (cheap: they are the boundedQD family with one
   branch at `z_j = 0` and at `z_j = 1/conj(r_i)` respectively).

4. **Pin the example gallery to the thesis.** (S–M.) DIR-9. Thesis Examples 4.3.1 and 4.1.1 are
   closed-form one-parameter *families* with stated univalence ranges — exactly what the parameter
   slice and `family-sweep` want, and the only oracles in the app that would test the weighted
   solvers against something other than themselves. *Unlocks:* a real regression anchor for PQD/LQD;
   the `cusps:` oracle field finally gets a user. *Risk:* low.

5. **Symmetry detection by index map rather than by extreme radius.** (S.) DIR-6's fix is a
   `2M`-candidate scan with the existing early-break predicate. It also naturally reports the
   *half-sample* axes the current `2·kStar − k` map cannot express, which is what a `D_n` domain
   whose axes fall between samples needs. *Risk:* low; the predicate and tolerance are unchanged.

---

## Documentation drift

| doc `file:line` | claims | reality (`file:line`) | severity |
| --- | --- | --- | --- |
| `app/direct/README.md` § Known limitations, bullet 1 | a general Laurent tail's finite poles are "not yet implemented" | a Laurent-polynomial φ has **no** finite node; `polyPart` is the complete h (`direct-common.mjs:544-572`; verified id `2.4e-15`) | HIGH (DIR-3) |
| `app/direct/README.md` § Weighted families | "a non-univalent kernel returns `{ univalent:false, warnings }` rather than bad data" | `boundedPowerQD` (`:1273-1355`) and `boundedLogQD` (`:1356-1411`) never check univalence; 18/27 sweep kernels returned `univalent: undefined, warnings: []` | MEDIUM (DIR-5) |
| `app/direct/README.md` § Verifier ("≈ 0 for any valid classical QD") | the Fourier negative-frequency check applies to classical QDs | correct for bounded; **inverted** for unbounded — `posMass` is the criterion there (`direct-common.mjs:798-827`) | HIGH (DIR-2) |
| `direct-common.mjs:529-532` | `m = 0/1 → single pole at w = 0 / F₀, residue c²` "(exterior of disk)" | that pole is in K, not Ω; thesis Def 3.0.2 requires `h ∈ Rat(Ω)`; Thm 3.2.3 subtracts exactly this term | CRITICAL (DIR-1) |
| `direct-common.mjs:35` | `∫_Ω f dA = (1/(2i)) ∮ f·h dw` | app-wide + thesis convention is `∫_Ω f dA = ∮ f h dw` with `dA = dxdy/π`, `1/(2πi)` suppressed (`thesis-pdfjs.txt:502, 958`) | LOW (DIR-10) |
| `direct-common.mjs:1036-1038` | step 3 applies `QD.Faber.inverseFaberAtPole` | body calls `forwardLocalPrincipal` (`:1177`) | NIT (DIR-12) |
| `app/test/direct.test.js:299-305` | "the existing unbounded-classical-QD inverse solver has trouble with the simple `c·z + F₀` shapes … a small basin-of-attraction issue" | the solver is fine; with the correct h it converges first try (`id = 3.72e-16`). The h was wrong. | HIGH (DIR-1) |
| `ui-strings.mjs:315-317` (geom help) | "convex ⟹ star-like ⟹ spiral-like, all ⟹ univalent" | the card prints `convex ✓` + `star-like ✗` for `z + 0.8z²`, and `convex ✓` for a 2-to-1 map | HIGH (DIR-4) |
| `ui-solve.mjs:880-881` | "● filled = an actual boundary cusp" | fires at `|‖z‖−1| = 4.99e-3` where `min|φ′| = 4.98e-3 ≠ 0` and the module's own `pLeading = 1.014` | MEDIUM (DIR-8) |
| `analysis/cusps.mjs:26-29` | "a NUMERICAL log–log fit cross-checks it … and distinguishes a genuine cusp from a smooth near-cusp" | `pLeading`/`confidence` are never read by any renderer (grep: only `cusps.test.js`) | MEDIUM (DIR-8) |
| `analysis/symmetry.mjs:19` | "M = 2520 points (divisible by every order 2..12 except 11)" — accurate, but the *return value* says `rotationalOrder: 1` | an untested order is indistinguishable from an absent one | MEDIUM (DIR-6) |
| `THEORY_MAP.md` (12 sampled `file:line` refs) | line numbers for named symbols | all 12 stale, worst 673 lines off | LOW (DIR-11) |

---

## Tests

**Tests that pin a defect as intended behaviour (the strongest category here):**

- `app/test/direct.test.js:263, 272, 282` — pin the spurious unbounded finite pole. **Mutant:**
  removing both `finitePoles.push` lines in `direct-common.mjs:580,588` makes `:263` FAIL and `:272`
  throw `TypeError: Cannot read properties of undefined (reading 'principal')`. So the correct
  behaviour is currently a test failure. (Applied and reverted; `git diff` clean.)
- `app/test/direct.test.js:718-723` — `'Verify: non-QD φ=z+0.3/z negMass > 0.1 (correctly flagged)'`,
  under the comment `// Non-QD case`. `z + 0.3/z` **is** a classical unbounded QD: its h scores
  `3.93e-16` on the family identity verifier and round-trips φ to `2.29e-16`. The test asserts the
  wrong verdict about a valid domain.

**Vacuous / near-vacuous:**

- `app/test/direct.test.js:704-716` — the two unbounded Verify fixtures assert
  `negMass < 1e-13 && zeroMass < 1e-13` for `φ = z` and `φ = 1.5z + (1+i)`. Both are the cases where
  `Δ ≡ 0` identically, so they pass under *either* Fourier convention and cannot distinguish the
  correct criterion from the inverted one. They are the only unbounded Verify coverage.
- `app/test/thesis-examples.test.js` — `[cardioid-unbounded] c*` compares a **recomputed** 1.449 at
  6 % pass tolerance. Nothing in the chain is independent of the code under test. Contrast
  `[deltoid-unbounded] c* = 0.5`, which is a genuine closed form.

**Coverage gaps that matter:**

- **No test anywhere composes the direct engine with the inverse solver for the classical families.**
  `direct.test.js:299-305` explicitly declines to, on a premise that is false (above). The §DF
  weighted section *does* round-trip (`:512`, `:520-527`, `:534`, `:551`, `:565`) — which is exactly
  why the weighted kernels are sound and the classical unbounded one is not. One
  `verifyQuadratureIdentity(exactφ, h)` assertion per classical fixture would have caught DIR-1,
  DIR-2 and DIR-3 together.
- **`classifyUnivalence` has no test file at all** (`grep -l classifyUnivalence app/test/` → none;
  it is exercised only indirectly through the worker). No test asserts the hierarchy the help text
  promises — `convex ⇒ star-like` fails on `z + 0.8z²` today and nothing notices.
- `boundedPowerQD` / `boundedLogQD` have no non-univalent-kernel fixture (DIR-5); the §DF battery
  only feeds them kernels that work.
- `symmetry.test.js` has no `D_11` case and no case whose extreme radii are off-axis — the two
  regimes where the detector is wrong (DIR-6).
- `cusps.test.js` asserts `pLeading` but never asserts the *verdict* it is supposed to inform: no
  fixture places a φ′-zero just inside `cuspTol` and checks that the app does not call it a cusp
  (DIR-8).
