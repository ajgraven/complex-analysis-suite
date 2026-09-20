# Review — `src/kernel/bounds/` and `src/kernel/branch/`

Scope: `bounds/{mlRational,ratBound,certifiedSqrt,linearMinorant,wedgeArc,branchArc,logArc,squareSide,stripSide,gaussianSide,smallArc,largeArcLimit}.ts`
and `branch/{model,admissibility,crossing,correction,monodromy,declaration,declared,lift}.ts`, plus their 22 node test files
(all green: 365 tests). Measurements ran from `apps/contour-integration` through a throwaway vitest config in the scratch dir.

### Findings (ordered by severity)

- **[BUG] Jordan's lemma is applied to an arc that leaves its half-plane — a certified `≤` that is false by 88×**
  - Where: `apps/contour-integration/src/kernel/bounds/mlRational.ts:261-360` (`jordanArcBound`), reached from
    `apps/contour-integration/src/engine/ledger.ts:372` and `:430` (`disposeArc`)
  - What: `jordanArcBound` takes `R` and `half` and **never sees the arc's angular extent** — it hardcodes
    `SEMICIRCLE = Frac.ONE` (`mlRational.ts:259`). `disposeArc` computes `extent = arcExtent(g)` and passes it to
    `mlArcBound`, but the two Jordan call sites drop it, and `half` is read from `Math.sin(mid) >= 0` without
    checking that the arc *lies* in that half-plane. Reproduced end to end: circle template at `R = 4`,
    integrand `exp(i*z)/(1+z^2)`, piece role set to **"vanishes by L3"** in the Contour card
    (`src/shell/cards/contour.ts:67` offers exactly that) — the ledger prints, at level **`≤`**, status
    **satisfied**: `the upper semicircle: |∫ g e^{iaz} dz| ≤ (π/|a|)max|g| ≤ 2.094e-1 at R = 4, and → 0 as R → ∞`.
    The true value over that piece is `|∮ f dz| = 7.384` and `∫|f||dz| = 1.841e+1` — **88× the claimed bound**, and
    the integrand grows like `e^{R}` on the lower half rather than vanishing. Measured at three sweeps with the same
    bound `2.094e-1`: `[0,π] → 1.284e-1` (ok), `[0,3π/2] → 9.268e+0` (violated), `[0,2π] → 1.841e+1` (violated).
    It is reached by **both** routes — the declared-`L3` route and the shape-driven chain with no lemma declared
    (`ledger.ts:430`). The sentence is wrong too: it says "the upper semicircle" about a full circle.
    Jordan is the only producer in the directory that ignores the arc's geometry; `mlArcBound`, `branchArcBound`,
    `logArcBound` all take `piMultiple`, `wedgeArcBound` refuses `arc.from ≠ 0` by name, and `arcRadius` already
    refuses an off-origin centre. This is the "certification theatre" the D-2 finding is named for, inside the engine.
  - Confidence: CONFIRMED (reproduced through `evaluateLedger`; numbers above)
  - Fix: give `jordanArcBound` the arc's `from`/`to` in units of π (as `wedgeArcBound` has) and refuse — by name —
    anything not contained in `[0, π]` for `"upper"` / `[−π, 0]` (or `[π, 2π]`) for `"lower"`; a sub-arc of the
    correct half-plane stays sound, so only the containment has to be decided.

- **[BUG] Six of the nine bound producers return a REFUSAL carrying `asymptotics: "vanishes"`, and the ledger reads only that field — so a KILL row is marked *satisfied* and the argument reports a wrong value**
  - Where: `apps/contour-integration/src/engine/ledger.ts:1609` (`const ok = disposal.asymptotics === "vanishes"`),
    against `bounds/mlRational.ts:191-205` and `:304-316`, `bounds/branchArc.ts:99-110` and `:245-266`,
    `bounds/logArc.ts:72-95`, `bounds/stripSide.ts:112-137` — i.e. `mlArcBound`, `jordanArcBound`, `branchArcBound`, `dogboneArcBound`, `logArcBound`, `stripSideBound`
  - What: those refusal returns carry the asymptotics computed from the degree gap, which for a vanishing lemma is
    `"vanishes"`. `isRefusal` only catches `LemmaRefusal` (a `{missing}` object), not an `ArcBound` whose certificate
    is a `⚠`. Reproduced: `1/(1+z^2)` on the semicircle at `R = 0.5` (the `R` slider's range is `[0.1, 1e6]`, so this
    is one drag away) gives a KILL row with **`status = satisfied`** beside a **`⚠`** certificate reading
    *"the reverse triangle inequality gives no positive lower bound on |Q| there, so a pole may lie on or outside the
    arc — take a larger R"*, and then `closes = true`, `failedAt = null`, headline **"The argument is complete."**,
    `target = 0`. The true `∫_{−0.5}^{0.5} dx/(1+x²) = 0.9273`. Same for `1/(1+z^4)` at `R = 0.9`. The number does
    carry a `⚠` badge (`ledger.verdict.level` is the meet), so the honest-labelling guardrail catches the *value* —
    but `closes`, `failedAt`, `ledgerHeadline` and the row's own status all say the argument stands, and the
    headline is what M8 calls "the product". `squareSideBound`, `gaussianSideBound` and `wedgeArcBound` already
    return `"bounded"`/`"diverges"` on every refusal, which is the pattern the other six should follow.
  - Confidence: CONFIRMED (reproduced through `evaluateLedger`)
  - Fix: either have each refusal return `asymptotics: "diverges"` (or a new `"unestablished"`), or — better, since it
    cannot be forgotten again — let the ledger's `ok` require `disposal.certificate.level !== "⚠"` as well as
    `asymptotics === "vanishes"`. The two fields disagreeing is itself the defect.

- **[BUG] `signedSweepOverPi` still uses the angle whitelist that M5.4 replaced with a cap — the same "false in the worst direction" failure, on L4 and L5**
  - Where: `apps/contour-integration/src/kernel/bounds/smallArc.ts:211-229`, against
    `apps/contour-integration/src/engine/ledger.ts:180-201` (`MAX_PI_DENOMINATOR`, `asPiMultiple`)
  - What: CLAUDE.md's M5.4 paragraph records replacing the angle whitelist with a cap because at `n = 5` an arc
    "could not be MEASURED and KILL reported that no lemma applied *to the integrand* — which was false". That repair
    landed in `ledger.ts` only. `signedSweepOverPi` — the reader for the indentation lemma (L4) and the large-arc
    lemma (L5) — still holds an eight-entry list `{1, 1/2, 1/3, 2/3, 1/4, 3/4, 1/6, 2}`. Measured, it returns
    `null` for `2/5, 1/5, 5/6, 1/12, 1/8, 3/2, 4/3`, and `largeArcLimit` on a `2π/5` arc of `1/(1+z^5)` refuses with
    *"the swept angle is not a recognised rational multiple of π"* — the integrand being perfectly fine. Two readers
    of "this arc's angle as a multiple of π" now have different domains.
  - Confidence: CONFIRMED (measured)
  - Fix: route `signedSweepOverPi` through the same cap (`|denominator| ≤ 12`, `1e-12` window), keeping the sign;
    the uniqueness argument in `ledger.ts:165-179` applies unchanged.

- **[STALE-DOC] `squareSide.ts` still states the D-2 shortfall as "30–40% at every `N` tested", which CLAUDE.md and GALLERY.md both correct**
  - Where: `apps/contour-integration/src/kernel/bounds/squareSide.ts:27-32`; corrected in
    `docs/contour-integration/GALLERY.md:583` and in CLAUDE.md's M5.5 paragraph
  - What: the comment's own numbers refute it — `3.392 vs 3.567` at `N = 3` is 4.9 %, `0.356 vs 0.493` at `N = 25` is
    27.8 %. CLAUDE.md: *"measured, it is 4.9% at N = 3 and 27.8% at N = 25, GROWING, because the ratio between the two
    bounds is exactly `π·(N/(N+½))^k` — so 30% is the asymptote, not the typical case."* The correction is recorded
    everywhere except in the file the finding is about.
  - Confidence: CONFIRMED
  - Fix: replace the sentence with the measured pair and the `π·(N/(N+½))^k` asymptote.

- **[STALE-DOC] `MAX_CUT_SEGMENTS` says an over-long cut system is "truncated and SAID to be"; nothing says it**
  - Where: `apps/contour-integration/src/kernel/branch/correction.ts:52-59` and `:235-243`
  - What: `cutCorrection` does `Math.min(segments.length, MAX_CUT_SEGMENTS)` and returns; no caller reports the
    truncation and no string anywhere in `src/` mentions it (grepped). Measured: 40 branch points, one ray each,
    produce **80 segments**, of which `cutCorrection` reads 64 — the picture is then drawn in a *different*
    determination with nothing said, which is exactly what the comment promises will not happen.
  - Confidence: CONFIRMED (measured)
  - Fix: return the truncation (or refuse) so the stage can say the picture is not the declared determination;
    or state honestly in the comment that it is silent, with the reachability argument.

- **[STALE-DOC] `mlRational.ts` cites a test file that does not exist**
  - Where: `apps/contour-integration/src/kernel/bounds/mlRational.ts:325` — "`test/jordanUnified.test.ts` pins that it is"
  - What: no such file; `grep -rn jordanUnified` matches only that comment. The claim it names (Jordan's bound is
    byte-for-byte the one `dampedArcIntegral` replaces) *is* pinned, but in `test/wedgeArc.test.ts:176-184`.
  - Confidence: CONFIRMED
  - Fix: point at `test/wedgeArc.test.ts`.

- **[STALE-DOC] `wedgeArc.ts`'s header says its two records are "neither loaded yet" and the wedge template "is M5.4"**
  - Where: `apps/contour-integration/src/kernel/bounds/wedgeArc.ts:30-33`
  - What: F2 (`∫₀^∞cos(x²)dx`) is the 28th record and loaded since M5.8, and the wedge template landed in M5.4. The
    paragraph reads as a to-do for work that is done.
  - Confidence: CONFIRMED (CLAUDE.md M5.4/M5.8; `test/f2.test.ts` exists)

- **[STALE-DOC] CLAUDE.md calls the crossing classifier "three-valued on purpose"; it has five values**
  - Where: CLAUDE.md, M4.1 paragraph, against `apps/contour-integration/src/kernel/branch/crossing.ts:9-23,50`
  - What: the file's own header is explicit — *"FIVE ANSWERS, AND D1 IS WHY. The first version of this file had three
    — `clear`, `crosses`, `touches` — and refused the keyhole outright"*. `CrossingKind` is
    `clear | endpoint | along | crosses | touches`, and `endpoint`/`along` are what make the keyhole legal. The
    CLAUDE.md sentence describes the version that was replaced in the same milestone it is describing.
  - Confidence: CONFIRMED

- **[STALE-DOC] `ArcBound.exponent`'s contract ("the bound behaves like `R^exponent`") is false for two of its producers**
  - Where: `apps/contour-integration/src/kernel/bounds/mlRational.ts:44-45`, against `stripSide.ts:99` (`e^{κR}`) and
    `gaussianSide.ts:303` (`e^{κR²}`)
  - What: both write a rate into `exponent`, not a power. The sign convention still works ("negative ⇒ it vanishes"),
    which is why nothing has broken, but a reader (or a scrub) taking the field at its documented word about a strip
    side would be off by an exponential.
  - Confidence: CONFIRMED (from reading; both files say so in their own headers)
  - Fix: widen the doc to "the bound behaves like `R^exponent`, or `e^{exponent·R^k}` for the exponential producers —
    only the SIGN is contractual".

- **[TEST-GAP] `branchArc.test.ts` and `logArc.test.ts` never check that the bound is a bound**
  - Where: `apps/contour-integration/test/branchArc.test.ts`, `test/logArc.test.ts`
  - What: every other producer in the directory has a dominance test — `mlRational.test.ts`'s `sampledMax`,
    `wedgeArc.test.ts`'s `majorant`/`arcIntegral`, `dogboneArc.test.ts`'s *"IS a bound: it dominates the cap's actual
    integral"*, `gaussianSide.test.ts`'s *"dominates the integral it bounds at every radius"*, `stripSide.test.ts`'s
    `sideIntegral`, `linearMinorant.test.ts`'s quadrature. The two that have none are precisely the two whose value is
    a **float** (`Math.pow`, `Math.log`, `Math.PI` — `branchArc.ts:114-120`, `logArc.ts:106-115`), i.e. the two least
    defended by construction. Their 22 tests run in 17 ms and 8 ms, which is the tell. Measured them myself against
    `∫|f||dz|` on the circle (400k-panel Simpson): branchArc ratios 1.0000–1.1768 over D1/D2/D3 fixtures at
    `ρ ∈ {0.01, 40}`, logArc 1.88–6.69 over D4/D5/principal at `m ∈ {1,2,3}` — **both sound**, so this is a gap
    rather than a defect.
  - Confidence: CONFIRMED (measured; no failure found)
  - Fix: port `dogboneArc.test.ts`'s dominance block to both.

- **[PERF] `piUpper()` is recomputed from Machin's series on every call — 0.83 ms, and 61 % of a semicircle ledger recompute**
  - Where: `packages/exact/src/piBounds.ts:54-73` (no memo), consumed by
    `bounds/mlRational.ts:209,330`, `bounds/wedgeArc.ts:187`, `bounds/squareSide.ts:161`
  - What: measured — `piBounds()` 0.83 ms/call over 200 calls; `piUpper()` 1.06 ms/call over 20 000;
    `mlArcBound` 1.23 ms/call over 2 000 (essentially all of it the π); `squareSideBound` 4.4 ms/call;
    `evaluateLedger` on `1/(1+z^4)` + semicircle **1.37 ms**, of which one `piUpper()` is ~0.83 ms. The ledger
    recomputes on every frame of a contour drag and a keyhole/dogbone/square has several such pieces, so this is the
    same class of defect M5.5 already fixed one level up ("the ledger spent 3.1 s per square side recomputing a
    CONSTANT") — `cothHalfPi` was memoised (`squareSide.ts:78`) and the π underneath it was not.
  - Confidence: CONFIRMED (measured)
  - Fix: memoise `piBounds` per `terms` in `@cas/exact` (one `Map`), or a module-level cache in `kernel/bounds/`.
    It is a pure function of an integer.

- **[IDEA] `branchArcEstimate` is dead code**
  - Where: `apps/contour-integration/src/kernel/bounds/branchArc.ts:167-173`
  - What: exported, no consumer in `src/` or `test/` (grepped). `branchArcBound` already puts the same number in
    `evaluated.bound` and in its claim.
  - Confidence: CONFIRMED

- **[IDEA] `branchArc.ts`/`logArc.ts` spend `Math.PI` where `piUpper().toNumber()` is free and keeps the direction**
  - Where: `branchArc.ts:116,168,282`, `logArc.ts:106,112`
  - What: `Math.PI < π`, so the printed `≤` is a few ulps below the true ML bound — harmless at the measured slack
    (1.00–6.7×) and honestly labelled `≈` in the provenance, but the surrounding directory's whole claim is that π
    enters only through a certified upper bracket. `piUpper().toNumber()` rounds *to nearest* of a rational above π,
    so it is above π for any realistic precision and costs nothing once the memo above exists.
  - Confidence: PLAUSIBLE (reading; the effect is ≤ 1 ulp and was not reproduced as a violation)

### Checked and found sound

- **ML bound (`mlArcBound`) dominates `∫|f||dz|`** on 4 integrands × `R ∈ {5,10,50}`: ratios 1.000–1.077, never below.
- **Jordan's bound on the arc it is stated for** (`[0,π]`): ratios 1.50–2.80 over 4 fixtures × 3 radii, never below.
- **`dogboneArcBound`** vs the cap's measured integral (D6's geometry, `η ∈ {0.5,0.2,0.05}`): 1.52, 1.10, 1.02 — and the
  `others` product takes `d−η` for a negative exponent and `d+η` for a positive one, which is the correct extremum.
- **`denominatorLowerBound` / `denominatorLowerBoundNearZero`** swap "keep the leading term" for "keep the lowest" in
  the right direction; `sqrtUp`/`sqrtDown` are exact on rational squares and monotone in the safe direction (their own
  test verifies `sqrtDown(c)² ≤ c ≤ sqrtUp(c)²` in ℚ, which is a proof rather than a sample).
- **`expPiLower`** is genuinely a lower bound on `e^π` (π truncated DOWN at 20 digits, series truncated early, both
  downward) and `coth(π/2) = 1 + 2/(e^π − 1)` decreases in `e^π`, so `kernelSupBound` errs upward; the test asserts the
  bracket in ℚ because float64 cannot see the 2.5e-22 gap.
- **`squareSideBound`'s refusals are all safe** (`"bounded"`/`"diverges"`), and `asHalfInteger` enforces `N + ½` from the
  geometry rather than from the schema field — stronger, as documented.
- **`gaussianSide`'s `realPartAlongLine`** is algebraically correct (`A = −Re q₂`, `B = −2c·Im q₂ − Im q₁`,
  `C = Re q₂ c² + Re q₁ c + Re q₀`) and `maximumOn` only admits the vertex when `A < 0`, which is the downward case.
- **`linearMinorant`'s side condition**: `MINORANT_RANGE = 1/2`, `SIN_RANGE = 1`, the `cos` face refused past `π/2` at
  the first rational past it (`51/100`), the `sin` fold at exactly twice the constant — D-1 is structural, not checked.
- **`wedgeArcBound`** refuses `arc.from ≠ 0`, a general `w`, `w = 0`, the wrong sign, a clockwise sweep, a semicircle and
  a full circle — each by name, and sets `exponent = +∞` rather than `1 − n` on every growth path.
- **`admissibility.ts`**: rules (a)/(b)/(c) over a union–find forest, `log` ⇒ `sum = null` ⇒ no bounded component;
  a cut `∞ → ∞` is caught as a cycle; the dogbone's two orientations agree because `α₁ + α₂ ∈ ℤ`.
- **`jumpWeights`** walks the `from` side with the arc removed and reports `null` on a cycle or a log; `cutSegments`
  adds the declared arcs at `+J` and the reference rays at `−α`, skipping integral exponents and points with no
  declared direction — so Γ = reference is exactly zero term by term.
- **`argCut`** counts turns rather than taking a modulus and returns `atan2` bit-identical off the cut (verified at
  `[3,4]`, difference 0); it disagrees with C99 only ON ℝ₋ (`−π` vs `+π`), and `test/cutCorrection.test.ts:53-77`
  already states that as the half-open window rather than leaving it to be found.
- **`declaration.ts`**: the one-turn window check, the positive-integer `log` multiplicity and the `b ≠ 0` refusal all
  fire with named reasons; `turnsMod2` reduces before the trigonometry so the cut geometry is bit-identical on every
  sheet, and the sheet is applied as `[lo+2s, hi+2s]` in `engine/declaredRun.ts:237` with `choice.sheet` left at 0.
- **`declared.ts`'s `SIDE_DISPLACEMENT = 1e-30`** and `sideResolves`' refusal of a cut running along the displacement;
  `test/declaredSide.test.ts` (45 tests) pins that every corpus record resolves and that the two lips differ by the
  declared factor.
- **`crossing.ts`**: the degenerate-bend test runs before everything else, `withoutStraightVertices` makes the answer
  independent of the cut's discretisation, and the order `along → crosses → grazed → endpoint → near` is what keeps the
  keyhole legal.
- **`lift.ts`**: split-then-test at the golden-ratio conjugate defeats the dyadic resonance family; the certificate is
  `≤` rather than `=` and the residual is reported.
- All 22 assigned test files pass: **365 tests**.

### Not covered

- The GLSL twin of the correction (`src/ui/stage/cut.glsl.ts`) and `test/cutParity.browser.test.ts` — browser suite,
  out of scope for this pass; the `MAX_CUT_SEGMENTS` truncation finding above applies to both halves.
- `smallArc.ts`'s `CENTRE_TOLERANCE = 1e-12` is an ABSOLUTE distance while contours reach `R = 1e6`; not exercised,
  and no record has an indentation at that scale, but it is the one tolerance in the directory that is not relative.
- No mutation sweeps (brief forbids them).
