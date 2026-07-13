# Track C — Certified Real Solving & Counting (audit)

> Read-only audit. Scope: `apps/quadrature-domains/app/sym-core.mjs` (solveZeroDim,
> solveByEigenvalues, multiplicationMatrix, fglm, rationalUnivariateRep, realSolutionCount /
> _rationalInertia, realRootIsolate / realRootCount / sturmHabicht, solveRealCertified,
> schurCohn / unitCircleRootCount / _hermitianInertia, parametricRealCount1D,
> discriminantVariety) and its drivers in `app/algebra/algebra-store.mjs` +
> `app/algebra/algebra-ui.mjs`. Line numbers are as of the audited tree.

## 1. Summary & soundness

The **certified real-solving and counting kernel is mathematically sound and, at the
primitive level, honestly labeled.** Positive-dimensional gating is complete and consistent
across *every* zero-dim consumer (each checks `isZeroDimensional` / `standardMonomials===null`
and fails closed with `{ok:false}` or a thrown error; `buchberger`'s caps *throw* rather than
return a truncated basis, so the gate always runs on a complete Gröbner basis). The Hermite
trace-form count (`realSolutionCount`) correctly counts **distinct** real/complex points and —
correctly — does **not** require the radical. The RUR (`rationalUnivariateRep`) takes the
radical, checks that its linear form actually separates, and **exactly self-certifies its
output** mod √I with no floating point. `solveRealCertified` is genuinely certified
end-to-end (RUR → exact Sturm isolation → interval Horner → rigorous rational coordinate
boxes) and never merges clustered roots. The numeric solvers (`solveZeroDim`,
`solveByEigenvalues`) are honestly presented as **non-certified** and reconciled against the
certified count by a self-checking oracle (`reconcileRealCount`).

The findings are **not in the counting primitives** but at the **workflow/labeling edge**:

- **HIGH-1** — the flagship existence/uniqueness verdicts (`doClassify` count==1;
  `★ Auto-reduce & solve` for all counts) print the certified algebraic-solution count as the
  **quadrature-domain** count ("Unique quadrature domain", "N real quadrature domains")
  **without** the univalence/admissibility filter. The count is a certified *upper bound* on
  #QD, not an equality. This is precisely the over-claim the mission flags. (An honest path —
  `doCertifyUnivalence`, and `doClassify`'s own count>1 branch — already exists; the count==1
  and auto-solve verdicts are inconsistent with it.)
- **MEDIUM-1** — the "exact / Schur–Cohn certified" univalence test runs on a **rationalized
  numeric** coordinate (`ratApprox` of a box midpoint / numeric root), not the exact algebraic
  solution; the exact RUR boxes that would make it rigorous are discarded first.
- **MEDIUM-2** — `discriminantVariety` (≥2 params) assumes the separating form is generic
  **without a separation certificate**; a missed separating form silently yields an
  **incomplete boundary**.
- **LOW-1** — `parametricRealCount1D` can miss a real-count transition inside a cell if the
  projection degenerates off the `disc·lc` border.

Net: **the counting/solving is certified and correct; the QD-existence/uniqueness *verdict*
over-reaches the certified fact in two of its three surfaces.**

---

## 2. Confirmed strengths

**S1 — Positive-dim gating is complete, honest, and cannot be bypassed by a truncated basis.**
Every zero-dim consumer checks dimensionality and fails closed:
- `solveZeroDim` — `if (!isZeroDimensional(G1,o1,vars)) return {ok:false, reason:'…not zero-dimensional…'}` (sym-core.mjs:3554). The `linearReduce` pre-pass additionally rejects a *requested* variable left unconstrained after elimination (:3517–3521), closing the `[y−1]` over `['x','y']` false-finite hole.
- `solveByEigenvalues` — `isZeroDimensional` (:4014) + `standardMonomials===null` → `'positive-dimensional ideal'` (:4020).
- `realSolutionCount` — `isZeroDimensional` (:4147) **and** `standardMonomials===null` (:4150) both `fail(...)`.
- `rationalUnivariateRep` → `radicalZeroDim` → `resolvent`, which gates on `isZeroDimensional` (:4823, `'…not zero-dimensional…no finite resolvent'`).
- `coordinateMoments` (:3719), `multiplicationMatrix` (throws, :3644), `fglm` (`standardMonomials===null` → throw, :3379).

The gate is trustworthy because (a) `buchberger`'s caps **throw** (`maxBasis`/`maxSteps`/`maxDegree`/`maxTerms`, sym-core.mjs:2864–2887) — it never returns a silently-incomplete basis, so `isZeroDimensional` always sees a complete GB; and (b) `_ambientVars(G, vars)` returns the passed `vars` verbatim (:3235), so a genuinely free variable (no pure-power leading monomial) correctly forces `isZeroDimensional → false`. The store passes the true ambient set (`reim.vars`, the variables actually appearing). Test `qd-krull-verdict.test.ts` pins the honest behavior: `⟨xy⟩` → `zeroDim:false`, `realCount` null, `krullDim:1`.

**S2 — `realSolutionCount` counts DISTINCT solutions and correctly does NOT take the radical.** It returns `realCount = pos−neg` (signature = distinct **real** points), `complexCount = pos+neg` (rank = distinct **complex** points), `multiplicityCount = D` (sym-core.mjs:4189–4191). The Hermite/Pedersen–Roy–Szpirglas theorem makes the trace-form rank/signature **multiplicity-insensitive**, so the radical is unnecessary — the distinct count (the right notion for counting domains) is obtained directly. The build is exact (`_rationalInertia`, ℚ), and non-real (Hermitian-only) systems are rejected (`hasImag` → `fail('…requires a real-coefficient (reim) system')`, :4189). `_rationalInertia`'s zero-pivot handling (swap-before-fold, with the documented `[[0,a],[a,−2a]]` counterexample motivating swap-first) is correct (:4101–4131).

**S3 — RUR is genuinely self-certifying (matches the project-memory claim).** `rationalUnivariateRep` (1) takes the **radical** first (`radicalZeroDim`, :1868), (2) accepts a linear form only if `squareFreePart(f).degreeIn(t) === D` — i.e. it **actually separates** (:1885), and (3) with `opts.verify` (default on) **exactly** certifies the output: `normalForm(f.subst(t=Σcx), G) === 0` and `normalForm(g_v.subst(t=…) − v, G) === 0` mod √I, over ℚ(i), no floats (:1900–1906, `verified:true`). A candidate that fails to certify is rejected (:1904).

**S4 — `solveRealCertified` is certified end-to-end and never merges clustered roots.** RUR (exact) + `realRootIsolate` Sturm boxes (exact) + `_intervalPolyEval` interval Horner (exact) → per-coordinate rational boxes; point boxes flagged `exact:true` (= exact), genuine brackets `exact:false` (≤ a rigorous bound) (:1943–1962). No floating-point eigenvalue step. `qd-solve-real-certified.test.ts` proves the anti-merge guarantee (roots `1` and `1+1e-6` both isolated), rigorous irrational brackets, empty real set, and a cross-check vs `solveByEigenvalues`.

**S5 — Sturm isolation is textbook and genuinely isolating.** `_sturmChain` builds the standard chain on the square-free part; `_sturmV` counts sign variations; `realRootIsolate` brackets by the `V(lo)−V(hi)` drop, splits at non-root midpoints, and refines each **count-1** bracket to width < tol by exact bisection (or reports the exact rational root) (:865–967). One proven root per output bracket.

**S6 — `schurCohn` is honest about its ambiguous (singular) case.** A nonzero nullity is *not* certified; it is resolved exactly by peeling the self-inversive factor and counting on-circle roots via `unitCircleRootCount` (itself the Hermite form over the circle relation), or it falls back to `degenerate:true, resolved:false` with the raw (unreliable) inertia (:4634–4655). Clean cases (e.g. `(z−½)(z−2)`) certify `degenerate:false`.

**S7 — The numeric solvers are honestly non-certified and reconciled.** `solveZeroDim`/`solveByEigenvalues` carry a `complete` flag (`solutions.length >= univariateDegree` / `>= D`, :3616 / :4077) and are labeled `method:'eigenvalue'`. `reconcileRealCount` (:4388–4410) prefers the certified Hermite count as the authoritative denominator, flags `partial` only on a **genuine** undercount, and correctly notes that `complete:false` alone (non-radical ideal, all distinct points found) is *not* a miss.

**S8 — Slice specialization is labeled as a LOWER BOUND.** `assumeReal`/`assumeImaginary` restrict the system to a slice; `sliceCaveat` appends "…a count here is a LOWER BOUND on the general one, and an empty/inconsistent verdict rules out only on-slice solutions." (algebra-ui.mjs:1515–1521), with a `specializationLedger`. Factor-branch columns are labeled "case k of n … the branches add up" (:1651). This is exactly the honest labeling the mission requires for slices.

**S9 — `parametricRealCount1D` counts per cell with the Hermite ground truth, not the eliminant.** The border is `reducedDisc_u(f)·lc_u(f)` (both the real-double-root **and** escape-to-∞ strata, sym-core.mjs:4250–4253); the per-cell count is `realSolutionCount` at a rational interior sample — **independent of** the eliminant `f` (:4282–4293); critical values are honestly labeled `≤` (isolating boxes); the `crosschecked` flag compares `f`'s own Sturm real-root count to Hermite at each sample (:4285–4286). Goldens in `qd-parametric-count.test.ts` (x²−t, the x³−3x−t fold, a two-fold quartic, circle∩moving-line with irrational tangents) all pass with `crosschecked:true`.

---

## 3. Findings

### HIGH-1 — Existence/uniqueness verdict presents the certified algebraic-solution count as the quadrature-domain count, without the admissibility (univalence) filter

**Severity: HIGH** (over-claims existence and a uniqueness verdict — the mission's binding
rule: "a uniqueness verdict must mean uniqueness among ALL admissible domains… never
'unique among solutions found'"; and honest labeling `=` exact).

**Evidence.** The count that reaches the verdict is `realSolutionCount(reim system)` —
certified as the number of distinct real algebraic solutions (`_classifyImpl`,
algebra-store.mjs:1774–1779). Two of the three verdict surfaces then equate that count with
the QD count:

- `doClassify`, count==1 (algebra-ui.mjs:1647):
  ```js
  else if (r.realCount === 1) verdict = 'Unique quadrature domain — exactly 1 real solution' + tail + '.';
  ```
- `★ Auto-reduce & solve` (`doAutoSolve`, algebra-ui.mjs:1574–1578):
  ```js
  else verdict = (cl.realCount == null ? cl.multiplicity + ' solution(s) with multiplicity'
    : (cl.realCount === 0 ? 'No real quadrature domain'
      : cl.realCount === 1 ? 'Unique quadrature domain (1 real solution)'
        : cl.realCount + ' real quadrature domains')      // ← ≥2 also called "quadrature domains"
    + (cl.complexCount != null ? ' of ' + cl.complexCount + ' distinct complex' : '')) + '.';
  ```
- The equivalence is asserted in prose throughout the driver: store header "classify… # REAL solutions = # quadrature domains" (algebra-store.mjs:39), "The real solutions of the result are the actual quadrature domains" (:1724), "the number of REAL solutions (= actual QDs…)" (:1736–1737); UI button title "count the REAL solutions (= actual quadrature domains)" (algebra-ui.mjs:907) and the bifurcation picker "(= quadrature domains)" (:915).

**The math (why it's an over-claim, not an equality).** Each genuine bounded QD with the
given data yields a real solution of the inverse-problem system (●)`φ(z_j)=a_j` + (★)
A-equations, so **#QD ≤ realCount**. The converse fails: a real algebraic solution is a QD
only if its reconstructed Riemann map φ is **univalent (schlicht) on 𝔻** with poles/nodes in
the right place — a further constraint that is *not* an algebraic equality in the counted
ideal. Additionally, residual **discrete gauge copies** (e.g. the ±φ′(0) pair) map to the
*same* domain, further inflating `realCount` above #QD. Hence:
- `realCount === 0` ⟹ `#QD === 0` — **exact and sound** ("No real quadrature domain" is correct).
- `realCount === k ≥ 1` ⟹ `#QD ≤ k`, and `#QD` may be **0** — so "Unique quadrature domain"
  and "N real quadrature domains" assert existence/QD-ness the certified count does not
  establish.

The app *knows* this: the honest end-state exists in `doCertifyUnivalence`, which reconstructs
each φ, runs the fold + boundary tests, gauge-quotients, and reports "K genuine quadrature
domain(s)" vs "N real algebraic solutions" (algebra-ui.mjs:1785–1917); and `doClassify`'s own
**count>1** branch is already honest (:1648): `r.realCount + ' real algebraic solutions … —
run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones
filtered).'` The defect is that the **count==1** verdict and the **entire auto-solve** verdict
are inconsistent with that honest branch — they drop the "algebraic solution / upper bound /
run Certify univalence" framing exactly where a user is most likely to read the one-click
result as a proof.

**Fix direction.** Make the count-1 and auto-solve verdicts consistent with the honest count>1
branch: report `realCount` as "**at most** one / N candidate quadrature domain(s) (real
algebraic solutions) — run *Certify univalence* for the genuine-QD count," reserving "Unique
quadrature domain" for the `doCertifyUnivalence` output (post-filter, post-gauge-quotient).
Keep "No real quadrature domain" for count 0 (it is exact). Optionally have `★ Auto-reduce &
solve` chain into the univalence certification so its headline verdict is the admissible one.

---

### MEDIUM-1 — "Exact / Schur–Cohn certified" univalence runs on a rationalized *numeric* coordinate, not the exact algebraic solution

**Severity: MEDIUM** (a numeric step inside a path labeled certified `=` — audit question 6;
straddles Track C labeling and Track D semantics).

**Evidence.** The per-solution fold and boundary tests are labeled certified in the verdict —
`'#… univalent ✓ — genuine quadrature domain … (Schur–Cohn + real-count certified)'` /
`'(φ′≠0 in 𝔻 certified)'` (algebra-ui.mjs:1883–1884). Their input is built by `poleSubst`,
which **rationalizes a numeric coordinate**:
```js
const ratG = (v) => { const a = QE.ratApprox(v.re || 0), b = QE.ratApprox(v.im || 0); return Sym.gauss(Sym.rat(a[0],a[1]), Sym.rat(b[0],b[1])); };   // algebra-ui.mjs:1735
```
`sol[...]` here is the **numeric** coordinate — a box *midpoint* (`certifiedRealToJSON` emits
`mid`, sym-core.mjs:1957/1974) or a numeric eigenvalue/Durand–Kerner root. `schurCohnFold`
(:1705–1716) and `boundarySimpleExact` (:1758–1765) then run exact `Sym.schurCohn` /
`boundaryDoublePointCount` on that rationalized point.

**The math.** `ratApprox` returns a continued-fraction convergent — a rational **near**, not
**on**, an irrational algebraic coordinate. φ′ is therefore evaluated at a point off the
variety. The fold count (#zeros of φ′ in 𝔻) and boundary double-point count are discrete and
robust, so for a good-enough approximant they *generically* equal the true counts — but **no
enclosure or continuity certificate links the approximant to the true solution.** Near a
critical configuration (φ′ with a zero *on* ∂𝔻 — a cusp — or a near-double boundary point) the
rationalized point can fall on the wrong side, and the "certified" verdict is then wrong. The
exact-rational case (`box.exact === true`) *is* genuinely certified, because `ratApprox`
recovers the exact rational; the gap is specifically **irrational (degree ≥ 2 algebraic)**
coordinates, which are common for QD solutions. Notably, `solveRealCertified` already produces
the rigorous rational **boxes** (and the RUR exact coordinate maps `g_v(t) mod minPoly`) that
would make this rigorous — they are collapsed to numeric midpoints *before* the univalence
test discards the certificate.

**Fix direction.** Feed the exact RUR coordinate maps into the fold/boundary tests — evaluate
`num(φ′)` and the boundary form in `ℚ(i)[t]/(minPoly)` (so the Schur–Cohn / circle count is
over the true algebraic point), or run interval arithmetic on the certified boxes with a
robustness margin; otherwise **downgrade the per-solution label to ≈ / "verified at a
rationalized approximant"** for non-exact coordinates.

---

### MEDIUM-2 — `discriminantVariety` assumes the separating form is generic without certifying it; a missed form yields a silently incomplete boundary

**Severity: MEDIUM** (completeness of a result presented as *the* boundary equation).

**Evidence.** For ≥2 parameters, the separating univariate eliminant is chosen by **maximum
u-degree** over up to `formTries` (default 6) candidate forms, with no separation check
(sym-core.mjs:4330–4343):
```js
let f = null, fdeg = -1;
const cands = [..._sepCandidates(solveVars.length, opts.maxTries||24)].slice(0, opts.formTries||6);
for (const cs of cands) { … prod = squareFreePart(prod, uName); const d = prod.degreeIn(uName);
  if (d > fdeg) { f = prod; fdeg = d; } }                        // "max degree ⇒ generically separating"
```
The header comment (:4327–4329) states the genericity assumption explicitly ("the separating
form achieves the full fiber size, so max degree ⇒ generically separating"). Contrast
`parametricRealCount1D`, which **certifies** separation before trusting `f`: it accepts a form
only when `du === h.complexCount` (the eliminant's u-degree equals the Hermite distinct fiber
count) at generic parameter samples (sym-core.mjs:4243–4245).

**The math.** If none of the 6 tried forms separates (two fiber points always share the linear
value), the retained `f` **under-represents** the fiber, and the border `reducedDisc_u(f)·
lc_u(f)` misses exactly the components where an invisible collision changes the real count.
The routine emits no downgrade — the returned `boundary`/`components` read as the complete
discriminant variety. (Scope is otherwise honest: it disclaims per-region counting and defers
to CAD/RCTD.)

**Fix direction.** Port `parametricRealCount1D`'s certificate: check the chosen `f`'s u-degree
against a Hermite distinct-count at a random rational parameter sample; if it under-counts,
either try more forms or flag the boundary as **possibly incomplete** (a `separating:false` /
`≤` marker) rather than presenting it as exact.

---

### LOW-1 — `parametricRealCount1D` can miss an intra-cell transition where the projection degenerates off the `disc·lc` border

**Severity: LOW** (narrow, well-mitigated; the count *shown* is exact at each sample).

**Evidence / math.** `f` is certified separating only at the generic `t` used to accept it
(sym-core.mjs:4243–4245), not for all `t`. At a special `t*` where two fiber points genuinely
merge (a real-count transition) **but `f` already identifies them there** (non-separating at
`t*`), `disc_u(f)` need not vanish at `t*`, so no border is placed → two sub-cells of differing
count are merged and represented by a **single** interior Hermite sample. `crosschecked`
compares `f`'s Sturm count to Hermite **at the samples**, not at the hidden transition, so it
need not detect this.

**Why LOW.** Per-cell counts are Hermite-authoritative (exact for the sampled sub-cell);
over-inclusion of borders is explicitly harmless; and for a generically-separating `f` all
generic collisions *do* show up in `disc_u(f)`, so the miss requires a measure-zero coincidence
(a genuine fiber merge that is simultaneously a projection collision) — measure-zero within an
already measure-zero border set. Critical values remain honestly labeled `≤`.

**Fix direction.** Sample two distinct interior points per cell and compare their Hermite
counts (a mismatch exposes a hidden border), or state the separating-form genericity assumption
in the returned object.

---

## 4. Question-by-question ledger

1. **Positive-dim gating (critical):** Complete and honest at every entry point (S1). A
   positive-dim input yields a thrown/`{ok:false}` honest error, never a silent finite count.
   `buchberger` caps throw, so the gate never runs on a truncated basis. **No over-claim.**
2. **`realSolutionCount` radical/multiplicity:** Correctly counts **distinct** real solutions
   via the trace-form signature and correctly does **not** need/take the radical (S2). Distinct
   is the right notion for #QD. **Sound.**
3. **RUR self-certification & Sturm isolation:** The separating form is checked to separate
   (`sqfree deg == D`), the radical is taken, and the output is exactly certified mod √I with
   no floats (S3); Sturm boxes are genuinely one-root-each (S5). **Matches the memory claim.**
4. **Certified vs found:** `classify`/`solveRealCertified` counts come from the certified
   Hermite/Sturm machinery (a count over the whole variety), not from enumeration; the numeric
   enumerators are labeled non-certified and reconciled (S7). **But** the *verdict strings* then
   relabel the certified algebraic count as the QD count without the admissibility filter
   (**HIGH-1**). Exact claim strings quoted above.
5. **`parametricRealCount1D` / `discriminantVariety` borders:** 1-D border is complete
   (`disc·lc`, both strata) with Hermite-authoritative per-cell sampling and a self-cert of the
   separating form (S9); residual intra-cell gap is **LOW-1**. The ≥2-param `discriminantVariety`
   lacks the separation certificate — **MEDIUM-2**.
6. **Numeric step inside a certified path:** The counting/solving certified paths are float-free
   (`realSolutionCount`, `solveRealCertified`, `schurCohn`, the Hermite per-cell counts). The
   one leak is the univalence fold/boundary test labeled "certified" while fed a rationalized
   numeric coordinate — **MEDIUM-1**.

## 5. Cross-references
- Univalence/admissibility semantics proper (the fold/boundary/gauge tests themselves, φ
  reconstruction) belong to **Track D**; HIGH-1 and MEDIUM-1 are raised here only for their
  **labeling/certification** consequences on the certified *count*.
- Gröbner completeness/caps (the linchpin of S1) belong to the **Gröbner track**; confirmed
  here only enough to trust the zero-dim gate (caps throw, sym-core.mjs:2864–2887).
