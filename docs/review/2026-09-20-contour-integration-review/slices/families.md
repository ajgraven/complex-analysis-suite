# Review — `apps/contour-integration/src/families/` (schema, loader, solves, all 28 records)

### Findings (ordered by severity: BUG > REGRESSION > STALE-DOC > TEST-GAP > PERF > IDEA)

- **[BUG] A record whose KILL row FAILS still prints an `=`-badged closed form — for a DIVERGENT integral. 15 reachable cases over 6 records.**
  - Where: `apps/contour-integration/src/families/runFamily.ts:386-398` (`solveWithin` gates Pass 5 on `legalityRefusal` and on nothing else) together with `apps/contour-integration/src/shell/cards/result.ts:124` (`integralRefusal` reads the *quadrature* verdict + LEGALITY) and `:320-327` (`levelOfSolved` reads `theorem.verdict`, the residue sum). Reachable because `apps/contour-integration/src/families/instantiate.ts:91` gives every family parameter the range `[-max(10, 2|v|), +…]` without ever consulting `parameters[].constraints`.
  - What: drag D1's `α` (record declares `alpha > 0, alpha < 1`; slider runs **−10 … 10**) to `1.5`. The ledger is right — `closes = false`, headline *"The argument is incomplete: a boundary term does not vanish"*, and the outer-arc row reads `KILL/failed/⚠ … it diverges as R → ∞: the bound is O(ρ^{1/2})`. But `solveFamily` still returns `ok: true`, and the Result card prints, directly under that headline:
    `= −π` · *"the integral this contour determines"* — for `∫₀^∞ x^{1/2}/(1+x) dx`, which **diverges**. Both certificates on the solved value are level `=`.
    Swept over every record × every parameter at five off-fixture values: **15 cases, 6 records, every failed row a KILL, every badge `=`** —
    `mellin-keyhole α∈{−0.3, 1.3, 2.3}`, `keyhole-two-poles s∈{−1.5, 2.5, 3.5, 4.5}`, `keyhole-x-to-the-n a∈{−1.5, 4.5}`, `dogbone-two-fractional-powers μ∈{2.25, 2.75}`, `strip-exponential-quasiperiod a∈{−0.3, 1.3, 2.3}`, `wedge-rational-power n=−3`. I checked each integrand by hand: **all fifteen integrals diverge** (e.g. `keyhole-two-poles` at `s = 2.5` is `~x^{−1/2}` at ∞ and prints `= −4π + π√2`; `dogbone-two-fractional-powers` at `μ = 2.75` has `(b−x)^{−7/4}`, non-integrable at `b`, and prints `= (−π·2^(−7/4)·5^(11/4) + 41π/4)/sin(3π/4)`).
  - Confidence: **CONFIRMED** (measured; script at `scratchpad/review/work/sweep.ts`, `d1out.ts`, `shellprobe.ts`).
  - Fix: `solveWithin`'s own comment — *"NOTHING MAY REPORT A VALUE WHILE A LEGALITY ROW REFUSES … Pass 5 reads the residue sum and the piece limits and knows nothing about whether the contour was legal"* — is the same argument one constraint over. Gate on `ledger.closes` (or on any `status === "failed"` row), or have `integralRefusal` return non-null when the ledger does not close. Secondarily, `instantiate.buildParams` could intersect the slider range with `parameters[].constraints` instead of leaving them write-only prose.

- **[STALE-DOC] `through: "halfIntegers"` is documented as unread in four places; it has been read since M8 step 3.2.**
  - Where: `src/families/schema.ts:505-514` — *"**DECLARED AND STILL UNREAD, and this note exists so that is not mistaken for done** … the field stays a statement of intent with no reader until a G record exists to declare it (M5.6)"*. It is read twice in `src/families/instantiate.ts` — `:64` (clamps the limit range to `MAX_SERIES_N = 256`) and `:133` (emits `admits: "integers"`) — and `instantiate.ts:129` says so explicitly (*"declared and DROPPED here until M8 step 3.2"*), so two comments in the same directory contradict each other. All three G records declare it. Also `docs/contour-integration/GALLERY.md:575-577`, `docs/contour-integration/PLAN.md:834`, `docs/contour-integration/M5-plan.md:358-360`.
  - Confidence: CONFIRMED (`test/halfIntegerParam.test.ts`'s own header states the change).
  - Fix: rewrite the schema note to say the field is read for the parameter lattice and the cost cap, and that the *bound* is still the stronger, geometry-side check.

- **[STALE-DOC] `SolvedResidueTerm` says `coth` has no formatter, in the file that formats it.**
  - Where: `src/families/solveResidueTerm.ts:90-98` — *"`π/sin` has a formatter and `coth` does not yet, so this carries a number and no form"*. `cothForm.ts` is imported at `:53` and `asHyperbolicForm` sets both `form` and `text` at `:400-412`; the golden corpus pins `series-cot-kernel → "(4π/3)·coth(3π/4)"` (`test/familyGolden.test.ts:397`).
  - Confidence: CONFIRMED.

- **[STALE-DOC] "No family in the corpus has [a `free` piece]" — two do.**
  - Where: `src/families/solveTarget.ts:194-201` and `:385-391`. Measured: `gaussian-shift-zero-residue/top` and `wedge-fresnel/ray1` are both `role: "free"` (each carrying a `knownValue`, which is why they route to `solveImported` before reaching either of these guards). The code is correct; the sentence is not.
  - Confidence: CONFIRMED.

- **[STALE-DOC] The `FAMILIES` docstring still describes the M4.2 corpus.**
  - Where: `src/families/index.ts:74-86` — *"**All of tiers A, B and C** … D1 joins them with M4.2 … **Tiers E–G, and the rest of D, need the machinery of M4.3 onward and M5** — a record loaded before its machinery exists would be a worked example that cannot be worked."* The array immediately below it holds all 28.
  - Confidence: CONFIRMED.

- **[STALE-DOC] `GALLERY.md`'s tier table credits tier E with the `reproduces` role; tier D introduced it.**
  - Where: `docs/contour-integration/GALLERY.md:72` (*"| **E** | E1–E3 | the `reproduces` role: …"*). Measured: all seven D records carry a `reproduces` piece, as do E1, E2 and F1; `solveTarget.ts:127-133` calls it *"THE KEYHOLE'S WHOLE MECHANISM, and folding it in here is what M4.2 added"*. What tier E actually adds is the quasi-periodic strip.
  - Also `GALLERY.md:76`: *"Six contour templates (circle, semicircle, indented semicircle, keyhole, dogbone, rectangle, wedge) plus `square`"* — that list is **seven**, and `TemplateId` has eight members, all eight used. The same "six" is copied into `src/families/schema.ts:29`.
  - Also `GALLERY.md:73` still cites *"the `§5.1 ≡ §7` cross-check"*, a research-document back-reference of exactly the kind §0 says was removed because *"no reader has"* it.
  - Confidence: CONFIRMED (measured, `scratchpad/review/work/roles.ts`).

- **[STALE-DOC] Two broken cross-references around the D-2 correction.**
  - Where: `GALLERY.md:102` says the "30–40 %" overstatement is corrected in **§5.8**; the correction is in **§5.6** (line 583). And `GALLERY.md:583` says *"**§6 above** says it fails 'by 30–40 % at every `N` tested'"* — there is no §6; the sentence is in §2 (line 101), which already carries the correction inline. `GALLERY.md:737` likewise attributes *"§5.8's lesson about assertions that cannot fire"* to a section about G2 loading.
  - Confidence: CONFIRMED.

- **[STALE-DOC] Two schema doc-comments claim readers that do not exist.**
  - `src/families/schema.ts:468-469`: `restrictions` — *"Scope the whole family's claim is restricted to; **travels into the verdict**."* Nothing reads `family.restrictions`, and **no record declares one** (`verdict.restrictions` in `engine/derivation.ts:248` is `@cas/rigor`'s field, not this one). Same claim in `DESIGN.md:458`.
  - `src/families/schema.ts:256-260`: `VanishingLemma.rigorOfLimit` — *"The limit statement pass 5 actually substitutes. **This is what the verdict consumes.**"* Nothing reads it (nor `rigorOfBound`, nor `rigorIfNumericOnly`); the only occurrences outside `schema.ts` are in two test helpers.
  - Confidence: CONFIRMED (`grep` over `src/` for each field).

- **[STALE-DOC] `DESIGN.md` §5 is the v1 schema and has not been back-ported.**
  - Where: `docs/contour-integration/DESIGN.md:472-527`. `branch` is spelled `branchPoints[]` / `cuts[].argRange` / `crossingPhase: string` / `admissibilityCheck` where `schema.ts` has `factors[]` (each with its own `argRange`), a tagged `CrossingPhase`, `rationalPart`, `constant`, `orientation`, `effectiveCut`. `closedForm` lacks `simplifiedWhen`; `Golden` lacks `label` and `refuses`; `FamilyPiece` lacks `knownValue`. `DESIGN.md:546` names the predicate namespaces as `{ algebraic, numeric, structural, symbolic }` — four — where `index.ts:140-154` has **thirteen**, and `index.ts:118-139` records precisely that the four-element version was wrong. `DESIGN.md:608-618` lists **four** loader invariants where `checkFamily` runs **five plus well-formedness** (invariant 5 is documented only in `GALLERY.md` §0).
  - Confidence: CONFIRMED.

- **[TEST-GAP] Nothing checks that `Golden.value` — the closed form the card prints — is the number beside it.**
  - Where: `src/families/describe.ts:174-192` (`closedFormClaim.atFixture`) and `src/families/latex.ts:96-105` (`identityLatex`/`identityText`) print `Golden.value` verbatim; the golden corpus asserts `solved.text` **only for the primary fixture** (`test/familyGolden.test.ts:325-412`'s `EXPECTED` map) and for every other fixture compares numbers alone (`:83-88`). So a wrong `value` string with a right `numeric` would ship, on the card, in the accessible name and in the front door's identity line. That is the M5.3d *"right value under a wrong form"* class at the record level.
  - Measured: I wrote the missing check externally (evaluate `Golden.value` at `Golden.params` with `@cas/expr`, compare to `Golden.numeric`) — **94/94 pass, 0 unreadable**. So this is a gap, not a live defect.
  - Confidence: CONFIRMED (script `scratchpad/review/work/goldenvalue.ts`; ~15 lines, would drop straight into `records.test.ts`).

- **[TEST-GAP] `contour.windings[]` is parsed and never evaluated — the loader says so, and no test closes it.**
  - Where: `src/families/index.ts:204-228` (*"Nothing evaluates them yet — which is exactly why this is checked here"*). The schema calls it *"Per-pole, not a prose blurb: the winding number the family asserts for each"* (`schema.ts:545`), and for D6 the assertion `n(γ, ±ia) = 0` is the record's entire point — yet nothing compares it to `run.integral.windings`.
  - Measured: I ran the comparison at each record's primary fixture — **45 declared windings compared, 28 of them non-zero, all agreeing with the engine**; the single non-comparison is D3's `exp(i*pi*(2*k+1)/n)`, parameterised over `k`. Gap, not a defect.
  - Confidence: CONFIRMED (script `scratchpad/review/work/windings.ts`).

- **[TEST-GAP] Loader invariant 3's bonus clause is vacuous over the entire corpus.**
  - Where: `src/families/index.ts:389-413`. `hasBonus` requires a `reproduces` piece with `bonus !== undefined`; measured, **0 of 28 records declare a `bonus` at all** — including D4 and D5, the log families the rule was bought from (their affine lower-edge row lives in `coefficients`, not `bonus`). `DESIGN.md:613-616` and `GALLERY.md:112-116` both present the clause as the live protection against the dropped `1/i = −i`. The mechanism is unit-tested on a synthetic record (`test/familyLoader.test.ts:83-116`), so the code works; what does not exist is any corpus record that exercises it.
  - Confidence: CONFIRMED (script `scratchpad/review/work/bonus.ts`).

- **[TEST-GAP] `residueSelection.rule` and `.set` are declared by 19 records and never read or cross-checked.**
  - Where: `src/families/schema.ts:557-560`; the only readers of `residueSelection` anywhere are `targetTerms`. B1 declares `rule: "upperHalfPlane"`, `set: "poles of R with sign(a)·Im z > 0"`; the engine decides inclusion from the computed winding numbers instead (which is the better source), but nothing compares the two, so a record could declare the wrong half-plane silently.
  - Confidence: CONFIRMED (grep).

- **[TEST-GAP] One assertion in `f2.test.ts` can go vacuous on a route change.**
  - Where: `apps/contour-integration/test/f2.test.ts:175-177` — `expect(e3.ok).toBe(true); if (!e3.ok || e3.route !== "imported") return;`. `ok` is asserted, `route` is not, so if E3 ever stopped taking the `imported` route the "same atom as E3" assertion would pass by returning. (Every other early return I checked across the 20-odd family tests is guarded — this is the only one.)
  - Confidence: CONFIRMED (reading + a scripted scan of all `if (!x.ok) return;` sites in the family tests).

- **[STALE-DOC] The schema's opening claim about prose is false for ~32 kB of record text.**
  - Where: `src/families/schema.ts:3-7` — *"Every field is either executable or renderable; nothing is prose-for-humans-only except `traps[].message` and the `note` fields."* Measured across the 28 records: **133 `hypotheses[]`** (`statement` never rendered — the Result card's "What was checked" table at `src/shell/cards/result.ts:241-296` is the computed LEDGER, not the record's hypotheses; `check` is namespace-validated only), **45 `vanishingLemmas[]`** (`sideCondition`, `discharge`, and all three `rigorOf*` unread), **136 `traps[]`** (`detect` namespace-validated only), plus `branch.admissibility` (7 records — the engine runs its own `checkAdmissibility` instead), `branch.effectiveCut` (2), `auxiliary.principalValue` (2), `halfPlaneLadder` (3), `family.rigor` (required on all 28, read by nothing), `parameters[].domain` and `parameters[].constraints`, `targets[].substitution.inverse`, and `contour.residueAtInfinity` (**zero producers and zero consumers**). Total unread string payload: **31,694 characters**.
  - Confidence: CONFIRMED (script `scratchpad/review/work/counts.ts`, plus per-field greps).
  - Fix: not to delete them — they are the specification — but to amend the header so a reader does not take "executable" on faith, and to say which of them are awaiting the predicate interpreter (`index.ts:242` already does this honestly for three).

- **[TEST-GAP/PLAUSIBLE] The Re/Im split is gated on the record's declaration on one path and not on the other.**
  - Where: `src/families/system.ts:318-328` refuses to realify unless `auxiliary.relation === "components"`, quoting the hypothesis that the unknowns are real; `src/families/linear.ts:345-357` says *"A family without that hypothesis must not call this."* But the ℚ path at `system.ts:410-416` builds `matrix = [Re row, Im row]` unconditionally, for any number of unknowns. E3 and F2 (`m = 2`) go through it and do declare `components`, so nothing is wrong today — but the guard the sibling path treats as load-bearing is absent here.
  - Confidence: PLAUSIBLE (reading; no corpus record violates it).

- **[PLAUSIBLE] `solveImported` gives every unknown the whole system's certificates — the thing the log route documents avoiding.**
  - Where: `src/families/solveImported.ts:277` pushes `certificates: []` and `:299` replaces it with the shared `certificates` array, which includes the `unknown(...)` entries minted from `invisible` at `:293-294`. `PiSolvedTarget`'s doc (`src/families/solveTarget.ts:302-317`) spells out why this must not happen — *"a caller that badged one answer with the whole system's evidence would cap an exact value at `?` on the strength of a statement about a DIFFERENT unknown"* — and computes dependence instead. Unreachable today: E3 and F2 both have an empty `invisible`.
  - Confidence: PLAUSIBLE.

- **[PERF] Nothing in `families/` is a hazard; the interactive cost is three records' quadrature.**
  - Measured (Node 22, this container): `loadFamilies()` over the whole corpus, all five invariants, **7.72 ms** — and it is memoised at `src/shell/state.ts:480`, so it is not O(28) per recompute. Slowest single `checkFamily`: `log-cubed-keyhole` 0.97 ms. `instantiate` + `contourIntegrandOf` per record: **≤ 0.048 ms**. What is slow is `runFamily` → `analyse`'s quadrature: `gaussian-shift-zero-residue` **1142 ms**, `removable-one-minus-cos` 738 ms, `wedge-fresnel` 793 ms, `series-cot-kernel` 51 ms, everything else ≤ 8 ms. Those three are a visible stall on every parameter move, and the first is driven by `instantiate.ts`'s `DEFAULT_LIMIT_VALUE.inf = 4` on a Gaussian rectangle; a record-level `limitParams[].start` (the field already exists, D2 uses it) would be the cheapest lever if it is worth one.
  - Confidence: CONFIRMED (`scratchpad/review/work/perf.ts`, `perf2.ts`).

- **[IDEA] `parameters[].domain: "integer"` is declared by 7 records and `Param.admits` already exists — wire them.**
  - `circle-cos-n-theta`, `circle-cif-taylor`, `keyhole-x-to-the-n`, `log-squared-keyhole`, `log-cubed-keyhole`, `wedge-rational-power`, `wedge-fresnel` all declare an integer parameter, and `instantiate` gives each a continuous linear slider. Measured at non-integer values the app behaves **honestly** — A3 refuses at the integrand (*"cos(…) has an argument that is not an integer multiple of theta"*), and the other four refuse Pass 5 and badge `≈` — so this is polish, not a bug: `admits: "integers"` is the same one-line translation `through: "halfIntegers"` already gets at `instantiate.ts:133`.

### Checked and found sound

- **Every one of the 28 records' closed forms and all 94 fixture values, verified independently.** I computed each integral/sum numerically from scratch in Python (tanh-sinh / exp-sinh, the `x = e^t` Mellin substitution, half-period alternating-segment acceleration for the oscillatory ones, Euler–Maclaurin for the sums) and compared against each fixture's `numeric`. **Agreement 1e-16 … 1e-12 everywhere**, including every tier-G record and D6/D7/E3/F2 (`D6 a=3.7` 6.4e-16, `D7 μ=0.25,b=4,c=10` 7.8e-16, `E3 b=6.5` 2.1e-17, `F2 n=3` 1.0e-15, `G2 a=0.2` 5.2e-13). The variant fixtures check out too (A5/A7 half-range, A6 closing down, B2/B3 companions = 0 by parity, C1's p.v. `iπ`, G1/G3 two-sided, G2 one-sided).
- Record `closedForm.simplified` forms re-derived independently for D2 (`(π/sin πs)(p^{s−1}−q^{s−1})/(q−p)`), D6 (`π/(a√(1+a²))`) and D7 (`(π/sin πμ)(c−(1−μ)b−c^μ(c−b)^{1−μ})`) — all exact.
- **Tier counts: A 7 · B 3 · C 3 · D 7 · E 3 · F 2 · G 3 = 28**, matching `GALLERY.md` §1 and `test/records.test.ts`.
- `Golden.value` strings all evaluate to their `numeric` (94/94) — see the TEST-GAP above; the values are right, only the check is missing.
- Declared `contour.windings` all agree with the engine (45 compared, 28 non-zero) — same shape.
- The golden corpus **does** assert closed forms by TEXT, not just numbers (`test/familyGolden.test.ts:325-412`), and the map is covered against `FAMILIES` in both directions, so a sign flip or a dropped `sin` on the primary fixture is caught.
- D5's prerequisite resolution borrows D4 at the **same** binding, measured: `p = 1 → T0 = π/2 → π³/8`, `p = 2 → T0 = π/4 → π³/16`, both with `=` certificates; `resolvePrerequisites` threads a cycle set and refuses self-borrowing (`runFamily.ts:477-481`).
- `knownValue` semantics: role gate (`free` only), closed-set resolution at *every* fixture, and rigor equality **in both directions** (`index.ts:298-341`); `importedValue` refuses division, two atoms, a non-rational Γ argument, and `sqrt(2)`-masquerading-as-`sqrt(pi)` by asking the argument rather than the function name. `solveImported` requires `∮ = 0` and every piece limit zero, by name.
- `Golden.refuses` is enforced in **both** directions (a refusing fixture that turns out determined is a violation) and the corpus test requires the engine to refuse with a matching reason, not to reproduce the number (`index.ts:502-511`, `familyGolden.test.ts:75-82`).
- `SolveReport.determined` is per-unknown, and invariant 4 uses it per-unknown with the three documented inversions (`refuses`, `cancels`, `input`, `targetTerms`) — D4's rank 2 in 3 unknowns and D5's borrowed column both come out right.
- The ℚ(i)(π) elimination: first-nonzero pivoting is correct in an exact field, `transform` tracks weights so `combination`/`contradictions` are readable, and `realifyRows`/`realifyRhs` share their ordering in one place. `describeKernel` is computed from `kernel`, not hand-written.
- `exactConstant` / `exactBasisConstant` / `exactPiConstant` all pass through the one differential cross-check (`crossCheck.ts`) against float64 — shared arithmetic nowhere.
- The D-1 correction is consistent between the docs and the engine: `kernel/bounds/linearMinorant.ts` decides only the SIDE CONDITION in exact ℚ, names the theorem in the certificate, and branches the two faces (`sin` folds at a cost of 2, `cos` has no bound past π/2) exactly as `GALLERY.md` §2 and `CLAUDE.md` describe.
- Variant fixtures are handled correctly end to end: disabled in the picker with a reason (`shell/cards/target.ts:82-90`), the target printed alone rather than as a false identity (`:54-57`), `closedFormClaim` withholds the general form (`describe.ts:180-186`), and `isVariant` keys on NAME (parameters ∪ target symbols) so A4's `g: "exp(z)"` is a binding and B2's `companion: "re"` is a variant.
- All 24 assigned test files run green here: `familyGolden` + 7 others (244 tests, 32 s) and `crossFamily/tierEFG/imported/basisConstant/residueTerm/d5-d7/e3/f1/f2/g1g3/g2/wedge/square/halfIntegerParam` (293 tests, 40 s). No vacuous early returns except the one noted; `latexCoverage` and `records` carry explicit anti-vacuity counts.

### Not covered

- The predicate DSL strings themselves (`hypotheses[].check`, `traps[].detect`, `vanishingLemmas[].discharge`) were checked for *namespace* well-formedness and for having no reader; I did not attempt to decide whether each one states the right predicate for its record.
- The gallery docs' per-record JSONC blocks were spot-checked (trap id sets, parameter ranges, tier membership, template names) rather than diffed field by field against the 28 `.ts` records; a full diff is a bigger job than this slice allowed and my bracket-matched extraction of the doc blocks was too noisy to trust.
- `collisionCheck.ts`, `piConstant.ts`, `stripFactor.ts` and `branchFactor.ts` were read but not independently exercised beyond the tests and the G/D records' own numbers.
- I did not render the Result card in jsdom for the top bug; the card path is established by reading `result.ts:124/136/164-175/320-327` together with the measured `integralRefusal === null`, `ledger.closes === false`, `solved.text = "−π"` and badge `=`.
