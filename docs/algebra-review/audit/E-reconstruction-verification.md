# Track E — Reconstruction & Exact Verification

Audit of the algebra tool's map-reconstruction and result-verification pipeline in the
Quadrature Domains app. **READ-ONLY** — no source was modified. All line references are to
the repo state on branch `refactor/provenance-ui-registry`.

Scope files: `apps/quadrature-domains/app/algebra/algebra-ui.mjs`
(`phiFromAlgebraSolution`, `doCertifyUnivalence`, `crossCheckPhis`),
`apps/quadrature-domains/app/solver.mjs` (`canonicalizeByRotation`, `sameDomain`,
`phisEquivalent`), `apps/quadrature-domains/app/qd-equations.mjs` (`boundaryCurve`,
`boundaryCurveFromPhi`, `residualAtSolution`, `_ratApprox`),
`apps/quadrature-domains/app/algebra/domain-mini-plot.mjs`, `sym-core.mjs`
(`resultant`, `certifiedRealToJSON`), the Schwarz files, and the named tests.

---

## 1. Summary & soundness

**The reconstruction/verification architecture is fundamentally sound.** The single most
important correctness property holds: `phiFromAlgebraSolution` is a **faithful direct
read-off** of the algebraic unknowns (z_j, A_{j,k}, w₀) — it performs **no φ⁻¹ inversion and
no square-root/branch selection**, so the classic "picked the wrong branch of φ⁻¹" failure
mode **cannot occur here** (Q3). Branch *completeness* is handled one level up, at the
system solve: every real algebraic solution becomes its own candidate φ, is univalence-tested
independently, and is then gauge-deduplicated. The exact boundary-curve elimination
(`boundaryCurve` = `Res_t`) is **empirically clean** — for every bounded-QD configuration I
tested (disk, cardioid, multi-pole, pole-at-origin, symmetric/odd, order-3, off-axis) the
resultant is the **irreducible** defining polynomial, vanishes on the sampled boundary to
~1e-15, and carries the correct Hermitian symmetry; the extracted rational Schwarz function
matches h's principal parts (Q2). `canonicalizeByRotation` correctly implements the rotation
gauge, and reflection is correctly *not* quotiented (mirror images are genuinely distinct
QDs) (Q4).

The findings below are therefore **not** "the tool computes the wrong domain." They are
**honest-labeling and completeness gaps** in the bridge between the exact *solve* and the
displayed *result*:

1. The only check that a *reconstructed* φ reproduces the prescribed data h is **numeric**
   (a floating-point residual, tolerance 1e-4). No exact symbolic check of the displayed φ
   exists; exactness is inherited *structurally* from the solve, not *verified* on the φ.
2. The "exact boundary curve" and the univalence certificate operate on a
   **`ratApprox`-rationalized approximation** of the solution — genuinely exact only for
   small-denominator *rational* solutions. The certified solve already computes an
   `allExact`/interval witness for exactly this question, but the reconstruction **discards
   it**.
3. The gauge-quotiented "K distinct genuine QDs" count is a **numeric** comparison
   (tol 1e-4), which sits awkwardly under the "certified count" framing.
4. A reconstructed φ that *fails* the numeric cross-check is **not removed** from the count.

These interact with — but are distinct from — Track D's univalence-labeling findings; where
they touch, I cross-reference rather than restate.

---

## 2. Confirmed strengths

- **S1 — No branch-selection bug in reconstruction (Q3).** `phiFromAlgebraSolution`
  (`algebra-ui.mjs:1667-1692`) reads each unknown directly: `num('z'+j)`, `num('A'+j+'_'+k)`,
  `num('w0')`. There is no inversion, no root choice, no sign ambiguity. Each real solution
  of the system *is* a complete φ. Missing map variables ⇒ `return null` (reported as
  "φ not reconstructable"), never a silent wrong branch.

- **S2 — Branch/node-relabel completeness handled at the right layer.** All candidate maps
  come from enumerating the real solutions (`doCertifyUnivalence`, `algebra-ui.mjs:1858`);
  `phisEquivalent` (`solver.mjs:1657-1676`) matches branches by a greedy nearest-assignment,
  so node relabeling among equal-order poles is absorbed. Missed solutions (clustered
  eigenvalues) are surfaced as a **PARTIAL / undercount** warning via `reconcileRealCount`
  (`:1906-1925`), so a dropped branch does not read as a clean count.

- **S3 — Boundary-curve elimination is clean for QDs (Q2).** `boundaryCurve`
  (`qd-equations.mjs:814-855`) forms `Q = Res_t(w·q − p, w̄·q̃ − p̃)`. I factored Q over ℚ(i)
  for 11 configurations (harness below); **every one was irreducible**, vanished on ∂Ω to
  ≤3.4e-13, and had the correct Hermitian symmetry (coeff of `wᵃw̄ᵇ` = conj of coeff of
  `wᵇw̄ᵃ`). This matches theory: for a *univalent* φ the parametrization t ↦ (φ(t), φ̃(t)) is
  birational onto its image, so the resultant is the irreducible curve — the leading-coeff
  degeneration that would add a spurious factor is codimension 2 (a point), not a component.
  The Schwarz function is returned **only** when `degWb === 1` (`:847`), which correctly
  distinguishes the single-valued (disk: S=(w+3)/(w−1), residue 4 at w=1 = C₁,₁) from the
  genuinely algebraic (cardioid: `schwarz=null`).

- **S4 — `canonicalizeByRotation` is correct (Q4).** The stored coefficients are conjugated
  on evaluation — `φ(z)=w₀+Σ conj(A_{j,k}) z^k/(1−conj(z_j)z)^k` (`solver-qd.mjs:13,37`) — so
  with `mu = φ′(0)/|φ′(0)|` and `A_k ↦ A_k·mu^k` (`solver.mjs:1691-1699`) the stored A₁ maps
  to `A₁·mu = |A₁| > 0`, making φ′(0) real-positive. The cardioid test confirms rotation
  pairs (π-rotation, z↦iz) merge while scaled copies and the disk do not
  (`cardioid-uniqueness.test.js:153-156`).

- **S5 — Reflection correctly *not* quotiented (Q4).** Mirror images conj(φ(conj·)) are a
  reflection, which `canonicalizeByRotation` does not fold in; for real-symmetric h with an
  off-axis domain these are two distinct QDs and are correctly counted as 2. In the
  symmetric on-axis case the reflection reduces to a rotation (same center) and *is* merged.

- **S6 — The numeric cross-check bites.** A perturbed φ (wrong A₁,₂) drives
  `residualAtSolution` above 1e-3 (`cardioid-uniqueness.test.js:173-175`), so the reduction-
  integrity guard is not vacuous.

- **S7 — The one exactness caveat that IS disclosed.** The boundary-curve verdict note reads
  "exact boundary curve Q(w,w̄)=0 (over ℚ(i), **rationalized solution**; order …)"
  (`algebra-ui.mjs:1957`) — honest about the `ratApprox` step (contrast Finding 2, where the
  univalence row omits the same caveat).

---

## 3. Findings

### FINDING E1 — The only verification that a *reconstructed* φ reproduces the quadrature data h is NUMERIC; there is no exact symbolic check of the displayed map. **[MEDIUM]**

**Q1.** After `doCertifyUnivalence` reconstructs each candidate φ, the sole tie between that
φ and the prescribed h is `crossCheckPhis` → `residualAtSolution`, which is
**floating-point**:

- `crossCheckPhis` (`algebra-ui.mjs:1985-1995`) builds a fresh conjugate-model system and
  loops `QE.residualAtSolution(system, phi, hData)`.
- `residualAtSolution` (`qd-equations.mjs:547-549`) → `residualWith` (`:529-542`), which
  evaluates each equation with `eq.evalComplex(vm)` on a **numeric float** var-map
  (`buildVarMap`, `:470-496`) and takes `Math.hypot(v.re, v.im)`. Pure double arithmetic.
- The gate is `cc.maxResidual < 1e-4` (`algebra-ui.mjs:1931`).
- The family-side identity verifier `verifyQuadratureIdentity_QD` (`solver-qd.mjs:286-330`)
  is likewise numeric — a 500-sample boundary quadrature compared to the RHS sum
  (`maxRelDiff`). A repo-wide grep finds **no** symbolic/exact residual check of a
  reconstructed φ.

**Why this matters.** The verdict presents existence as certified — e.g.
`'Unique quadrature domain ✓ — 1 genuine QD of ' + nReal + ' real solutions'`
(`algebra-ui.mjs:1917`) — and appends
`' · cross-check ✓ (residual ' + cc.maxResidual.toExponential(1) + '; matches the numeric solver)'`
(`:1931`). The existence/count is genuinely certified by the *solve* (RUR + Sturm, Track C),
and the equations are exact over ℚ(i), so the *underlying algebraic solution* satisfies the
quadrature identity by construction. But the **specific φ handed to the user, the thumbnail,
and the boundary curve** is a numeric read-off whose only tie back to h is this 1e-4
residual. The `✓` is honest for existence; it is **not** an exact certificate that
*this displayed map* reproduces h. The 1e-4 threshold is also loose — a genuinely-solved
system yields residuals ~1e-12, so a 5e-5 residual (100× worse than expected) still prints
`✓`. The magnitude *is* shown, so a careful reader can see it, but the marker reads as `=`.

**Fix direction.** Either (a) rationalize the reconstructed φ (`ratApprox`, already used for
the boundary curve) and run an **exact** `evalComplex`-over-ℚ(i) residual against the
generated system, reporting `= 0` only when it is exactly zero; or (b) keep the numeric
check but tighten the threshold and relabel it explicitly as `≈` (e.g. "numeric integrity
residual 1e-12"), reserving `✓`/`=` for the exact path.

---

### FINDING E2 — "exact boundary curve" and "Schur–Cohn certified" describe a `ratApprox`-rationalized *approximation* of the solution; the fidelity witness (`allExact`) exists but is discarded. **[MEDIUM]**

**Q1/Q2 — reconstruction fidelity.** The certified real solve returns, per coordinate,
`{ re: mid.re, im: mid.im, exact: !!c.exact, reLo, reHi, imLo, imHi }` and an aggregate
`allExact` (`certifiedRealToJSON`, `sym-core.mjs:1968-1979`) — i.e. it **knows** whether each
coordinate is an exact rational and it has a rigorous isolating box. But:

- `phiFromAlgebraSolution`'s `num()` reads only `re.re` (the box **midpoint**), dropping
  `exact`, `reLo`, `reHi` (`algebra-ui.mjs:1671-1676`). Same for `poleSubst`'s `num()`
  (`:1729-1734`), the input to the *exact* Schur–Cohn univalence test.
- `boundaryCurveFromPhi` then **re-rationalizes** the midpoint with `_ratApprox`
  (`qd-equations.mjs:863-873`), whose continued fraction has tolerance `1e-12·max(1,|x|)`
  **and a denominator cap `q > 1e6 ⇒ break`** (`:78-95`). For an irrational algebraic
  coordinate, or a rational with denominator > 1e6, `ratApprox` returns a **nearby** rational
  (or the 15-digit decimal fallback, `:96-97`), silently — with no check that the result
  lands in the certified box `[reLo, reHi]`.

Consequently the exact-ℚ(i) machinery downstream (`schurCohnFold` via `poleSubst`,
`boundaryCurveFromPhi`) is exact **for a rationalized map that may differ from the true
algebraic solution**. It is genuinely exact only when the true solution is rational with a
small denominator (the textbook cases — cardioid a=½ etc. — where `ratApprox` recovers the
value outright).

**Why this matters (labeling).** The per-row univalence tag reads
`'univalent ✓ — genuine quadrature domain' + … + ' (Schur–Cohn + real-count certified)'`
(`algebra-ui.mjs:1883-1884`) with **no** rationalization caveat, and the headline verdict
adds `' · real-solution count + locations certified (RUR + exact Sturm)'` (`:1938`). For an
*irrational* certified solution, "Schur–Cohn certified univalent" actually means "certified
univalent for a rational domain within ~ε of the true one" — an `≈` masquerading as `=`.
This is most fragile exactly where it matters: near a **cusp** (φ′ has a zero *on* ∂𝔻, e.g.
the cardioid), rationalizing the coordinate can push that zero just inside or just outside
the circle, flipping the univalence verdict. Track D notes the univalence engine is exact
"on the rationalized solution" (D:179) but *assumes* that rationalization is faithful; this
finding is that the assumption is unwitnessed for non-rational solutions.

**Fix direction.** Propagate `allExact`/the isolating box into reconstruction: when
`allExact` is true, take the exact rational directly (no `ratApprox` round-trip); when false,
downgrade the boundary-curve and univalence labels to `≈`/"rationalized numeric solution"
(the boundary-curve note already does this — mirror it on the univalence row and gate the
`✓`). Minimally, verify `ratApprox(mid) ∈ [lo, hi]` and flag when it isn't.

---

### FINDING E3 — The gauge-quotient "K distinct genuine QDs" count is decided by a NUMERIC comparison (tol 1e-4), not an exact one. **[LOW–MEDIUM]**

**Q4.** Deduplication is `sameDomain(a,b, tol=1e-4)` = `phisEquivalent(canon(a), canon(b),
1e-4)` (`solver.mjs:1709-1711`), and `phisEquivalent` sums coefficient distances and rejects
when `bestD > tol` (`:1657-1676`). The distinct set is built by
`genuinePhis.forEach(phi => if(!distinct.some(d => sameDomain(d,phi))) distinct.push(phi))`
(`algebra-ui.mjs:1889`), and `D = distinct.length` becomes the headline "distinct quadrature
domains" count.

**Why this matters.** The verdict frames this count as certified ("real-solution count +
locations certified", `:1938`), but the count is produced by a **1e-4 floating-point
merge**. Two *genuinely distinct* domains whose canonicalized coefficients happen to lie
within 1e-4 would be merged (**under-count**); this is a real risk near a bifurcation where
two QDs coalesce. Rotation pairs correctly merge (they canonicalize to within box precision,
≪1e-4), so there is no over-count from the gauge itself — the exposure is purely the coarse
absolute tolerance versus a "certified" claim. The tolerance is also **absolute**, not scaled
to the coefficient magnitudes, so it is simultaneously too loose for large domains and too
tight for tiny ones.

**Fix direction.** Deduplicate on the **rationalized** canonical coordinates with an exact
ℚ(i) equality (the coordinates are already rationalized for the univalence/boundary paths),
or at least make the tolerance relative and tie it to the certified box radius; label the
count `≈` if any compare fell within a "close but not equal" band.

---

### FINDING E4 — A reconstructed φ that FAILS the numeric cross-check is not removed from the distinct-domain count; only a global warning is emitted. **[LOW]**

**Q5.** `D` and the `distinct` set are fixed at `algebra-ui.mjs:1888-1890`, based solely on
univalence + `sameDomain`. `crossCheckPhis` runs **afterward** (`:1928`) and only appends
text: on failure it sets `bad = true` and adds
`' · ⚠ cross-check: residual … ≫ 0 — the reduction chain may be unsound'` (`:1932`), but
**does not drop the offending φ** from `D`. Moreover `oracleMatch` requires only that *some*
φ matches the numeric solver (`:1993` uses `phis.some(...)`), so with several candidates one
match masks the rest. So if the reduce→solve→reconstruct chain corrupts a single solution
(φ(z_j) ≠ a_j, poles misplaced), the count still includes it; the user sees a warning but the
number is unchanged. There is likewise no explicit assertion that `φ(z_j) = a_j` (the
thumbnail even *plots* `φ(z_j)`, `domain-mini-plot.mjs:32-35`, rather than comparing it to the
prescribed `a_j`); the constraint is only implied through the numeric locator-block residual.

**Fix direction.** Make the cross-check a **per-φ filter**: drop (or quarantine into a
separate "unverified" tally) any reconstructed φ whose residual exceeds threshold, and adjust
`D` accordingly, rather than emitting a single global banner over an unchanged count.

---

### FINDING E5 — `boundaryCurve` returns the raw resultant with no extraneous-factor stripping and no irreducibility guard; the Schwarz numerator/denominator are not reduced. **[LOW]**

**Q2.** `boundaryCurve` returns `Q = resultant(...)` directly (`qd-equations.mjs:843`), and
`resultant` is the bare Sylvester determinant (`sym-core.mjs:592-620`) — no content /
primitive-part / squarefree cleanup. This is in deliberate contrast to the codebase's own
`reducedDiscriminant`, which documents and strips the spurious `lc_v(p)=0` stratum that
`Res(p, ∂p/∂v)` carries (`sym-core.mjs:621-644`). Empirically (S3) no spurious factor arises
for univalent QDs, so this is **not** currently a wrong-curve bug — but the code relies on an
**undocumented** "the QD parametrization is birational ⇒ Q irreducible" invariant, and no
test asserts absence of spurious factors in general (the boundary-curve tests check only the
disk/cardioid goldens plus numeric vanishing, `qd-boundary-curve.test.ts`). A future
non-univalent or higher-order input could expose it. Separately, the Schwarz extraction
`schwarz = new RatFn(c[0].neg(), c[1])` (`:849`) does not gcd-reduce numerator against
denominator — cosmetically un-reduced if Q ever shares a w-factor across `Q0, Q1`.

**Fix direction.** Either document the irreducibility invariant with the univalence
precondition and add a squarefree/primitive-part reduction (or a "Q reducible ⇒ pick the
∂Ω-vanishing factor" step gated on the numeric boundary oracle), or add a test that factors Q
for a small corpus and asserts a single ∂Ω-vanishing component. Reduce `S` to lowest terms.

---

### FINDING E6 — Round-trip: the thumbnail and the exact curve come from the same φ but via different fidelity paths; the geometry-tab Schwarz uses a branch-dependent numeric inverse. **[LOW / INFO]**

**Q6/Q3.** The verdict thumbnail is `domainPlotData(distinct[0], QD.evalPhi)`
(`algebra-ui.mjs:1956`), i.e. a **forward** evaluation φ(∂𝔻) and nodes φ(z_j) of the *same*
reconstructed object used for the verdict (`domain-mini-plot.mjs:17-45`) — no re-solve, no
inversion, so the thumbnail cannot disagree with the verdict's φ. Good. Two minor caveats:

- The exact curve uses `boundaryCurveFromPhi(distinct[0])` = the **rationalized** φ, while the
  thumbnail uses the **raw-float** φ. For an irrational solution these are slightly different
  domains (Finding E2), so the drawn boundary and the "exact" curve are for maps ~ε apart.
- The **geometry-tab** Schwarz function (when the user opens "View in the QD plot",
  `:1966-1971`) is `buildSchwarzFromPhi` → `sigma(w) = conj(F(ψ(w)))` with `ψ = φ⁻¹` computed
  by a seed-dependent **Newton inversion** (`schwarz-common.mjs:1087-1114`,
  `newtonInvert`). This is a genuine branch choice on the *dynamics* side (distinct from the
  algebra reconstruction, which has none), and `explicitSigmaForm` displays it with 4-decimal
  numeric coefficients (`schwarz-analysis.mjs:59-104`) — honestly numeric, not exact. Not a
  reconstruction bug, but worth noting as the one place a φ⁻¹ branch is actually selected.

---

### FINDING E7 — If φ(0)=w₀ is a FREE solved variable, rotation-only dedup could over-count same-Ω maps related by a non-rotation disk automorphism. **[INFO / SUSPECTED]**

**Q4.** `canonicalizeByRotation` quotients only the **rotation** subgroup (stabilizer of 0 in
Aut(𝔻)). This is the complete residual gauge **iff** the center φ(0)=w₀ is fixed. When w₀ is
fixed (the default — `crossCheckPhis` reads `#alg-w0-fix` defaulting checked,
`algebra-ui.mjs:1987`, and `phiFromAlgebraSolution` falls back to `store.w0Fixed`,
`:1678-1681`), two Riemann maps of the same Ω sending 0↦w₀ differ only by a rotation, so the
quotient is exact. If instead w₀ is left free, two solutions could map onto the same Ω with
**different centers** — related by a Möbius automorphism, which rotation-canonicalization
would not merge ⇒ over-count. **Mitigation (why this is INFO, not a live bug):** a free
center enlarges the gauge, which typically makes the system **positive-dimensional**;
`doCertifyUnivalence` detects that and declines to count, instead prompting "fix the rotation
gauge (φ′(0) real-positive) or pin a forced variable" (`:1809`). So the over-count regime is
normally intercepted upstream. **What would confirm a live bug:** a zero-dimensional system
with w₀ genuinely free and two real solutions that are the same Ω at different centers —
`sameDomain` would report 2. I did not construct such a case; flagging as SUSPECTED.

---

## Appendix — reproduction

Extraneous-factor / Schwarz check (Findings S3, E5). Run with the repo's Node (ESM):

```
node <scratch>/bc-test.mjs      # imports app/solver.mjs, sym-core.mjs, qd-equations.mjs
```

For each spec it computes `QE.boundaryCurve(spec)`, factors `Q` over ℚ(i) via `S.factor`,
and independently samples 48 boundary points to measure `max|Q|` (and `max|factorᵢ|`). Result
across 11 configs (disk, cardioid, two poles incl. one at z=0, off-axis w₀, order-2 at z=⅓,
three simple poles, symmetric ±⅓, order-3): **every Q irreducible**, `max|Q| ≤ 3.4e-13`,
Hermitian symmetry present, Schwarz single-valued only at order 1. No spurious factor
observed.

Key evidence lines (all `apps/quadrature-domains/app/`):
- Direct read-off reconstruction: `algebra/algebra-ui.mjs:1667-1692`.
- Numeric residual verifier: `qd-equations.mjs:529-549`; gate `algebra/algebra-ui.mjs:1931`.
- `ratApprox` (1e-12 tol, denom cap 1e6): `qd-equations.mjs:78-97`.
- Certified-solve exact/interval witness discarded by reconstruction:
  `sym-core.mjs:1968-1979` vs `algebra/algebra-ui.mjs:1671-1676`.
- Boundary curve (raw resultant, no strip): `qd-equations.mjs:814-855`; `resultant`
  `sym-core.mjs:592-620`; contrast `reducedDiscriminant` `sym-core.mjs:621-644`.
- Rotation gauge + numeric dedup: `solver.mjs:1657-1676` (`phisEquivalent`, tol 1e-4),
  `:1683-1702` (`canonicalizeByRotation`), `:1709-1711` (`sameDomain`).
- Conjugated-coefficient convention (makes S4 correct): `solver-qd.mjs:13,37-47`.
- Thumbnail forward-eval: `algebra/domain-mini-plot.mjs:17-45`;
  numeric ψ=φ⁻¹ Schwarz: `schwarz/schwarz-common.mjs:1087-1114`.
