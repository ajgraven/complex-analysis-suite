# Review — `apps/contour-integration/src/engine/`

All findings below are reproduced by running the app's own modules through `npx vitest run` with a
scratch config rooted at the app (no repo files touched). Numbers are measured, not read.

### Findings (ordered by severity: BUG > REGRESSION > STALE-DOC > TEST-GAP > PERF > IDEA)

---

**[BUG] The Derivation card and the Stepper print `∮ f dz = …` at level `=` past a LEGALITY refusal — the one thing `legalityRefusal` exists to prevent**

- Where: `apps/contour-integration/src/engine/derivation.ts:317-325` (the `solve` stage), reached
  through `src/engine/steps.ts` (`target` step) and `src/shell/argument.ts:95,113` (no gate).
  Contradicts `src/engine/ledger.ts:1770-1780` ("**Nothing may report a value while this exists**")
  and `test/ledger.test.ts:551` (`describe("legalityRefusal — the one gate on printing a value at all")`).
- What: `buildDerivation` adds the `∮` line whenever `theorem.exactValue !== undefined`, without ever
  asking `integralRefusal`/`legalityRefusal`. Reproduced on `ledger.test.ts`'s own fixture —
  `1/(z+3)` on the circle `|z+3| = 1` with a cut down ℝ₋:

  ```
  legalityRefusal: the circle |z - a| = R crosses the cut Γ with no side assigned
  integralRefusal: {claim: "…crosses the cut Γ with no side assigned", repair: "Assign the piece…"}
  ledger.value:    undefined
  [legality] ⚠ failed :: the circle |z - a| = R crosses the cut Γ with no side assigned
  [solve]    =  satisfied :: $\oint_\gamma f(z)\,dz = 2\pi i$      ← printed anyway
  STEP target "Solution"  =  $\oint_\gamma f(z)\,dz = 2\pi i$      ← and in the stepper
  ```

  The Result card and the figure caption both refuse correctly (`figure.ts:108`, `result.ts:124`);
  the third and fourth surfaces do not. This is exactly M5.1's claimed behaviour inverted — CLAUDE.md
  says "switching to the principal window now REFUSES … and prints no `∮` at all", which is true of
  the Result card and false of the Derivation card beside it.
- Confidence: CONFIRMED (reproduced).
- Fix: gate the `solve` line (and `theorem.agrees` statement) on `integralRefusal(integral, ledger)`
  in `buildDerivation` — `DerivationInput` already carries both `integral` and `ledger`.

---

**[BUG] `role = "reproduces"` turns a demonstrably failing argument into "The argument is complete." on one click, with an `=` certificate for a claim nothing checks**

- Where: `apps/contour-integration/src/engine/ledger.ts:1439-1457`; role set through
  `src/engine/contour/edit.ts:994` (`setRole`), offered in the sandbox by
  `src/shell/cards/contour.ts`'s role menu.
- What: the row is minted `exact("the piece reproduces the unknown", "the piece is a constant
  multiple of the target…")` with nothing falsifying it. Measured on `z/(1+z²)` over the upper
  semicircle at `R = 50` — an arc that genuinely does **not** vanish (∫_arc → iπ, and the ML bound is
  a flat 3.143 at every R):

  ```
  BEFORE  closes=false  failedAt=KILL
          KILL failed ⚠ the arc: |∫ f dz| ≤ 3.143e+0 at R = 50, but it does not vanish: deg…
  AFTER (arc role → reproduces)
          closes=true   failedAt=null   value=πi   headline="The argument is complete."
          KILL satisfied = the R→∞ upper semicircle: a constant multiple of the target
  ```

  The app tells the reader a false argument is complete. M7.3 measured "the ledger takes `reproduces`
  on faith" and worked around it in the drill MENU (`edit.ts:822`'s `halfRole` doc records it); the
  sandbox path was never closed, and the consequence — the *headline* asserting completeness — is
  stronger than the recorded finding.
- Confidence: CONFIRMED (reproduced).
- Fix: the evidence is already computed. `integral.pieces[k].value` exists for both the `reproduces`
  piece and the `target` piece, so the row can check `∫_piece ≈ μ·∫_target` numerically (B1's strip
  gives exactly `−λ`) — the posture `engine/splitCheck.ts` already takes for the declared split.
  Failing that, mint `unknown(...)` rather than `exact(...)` so `assembleVerdict` cannot report `=`.

---

**[BUG] `panelPlan(len, Infinity)` returns the MAXIMUM work and a false `capped: true` — an integrand with no singularities is treated as the hardest case instead of the easiest**

- Where: `apps/contour-integration/src/kernel/quadrature.ts:165-167` (and `nodeCount`, line 189),
  consumed by `src/engine/contour/integrate.ts:integratePiece`.
- What: `if (!Number.isFinite(nearestSingularity) || nearestSingularity <= 0)` lumps *no singularity
  at all* in with *a singularity on the contour* and returns `{panels: 16384, capped: true}`. Three
  gallery records are entire (or removable-only) and pay for it on **every recompute**, including
  every frame of a contour drag at full budget:

  | record | nodes | `runFamily` |
  |---|---|---|
  | `wedge-fresnel` | 1,572,864 | **2813 ms** |
  | `gaussian-shift-zero-residue` | 2,097,152 | **2007 ms** |
  | `removable-one-minus-cos` | 1,048,576 | **1083 ms** |
  | (every other record) | 544–5k | 0.8–26 ms |

  And in the sandbox, `z^2` on a semicircle costs **318.8 ms** against **2.3 ms** for `1/(1+z²)` on
  the *same contour* — 139× slower for a polynomial. Measured directly, F2's ray converges at **32
  panels** (`0.54420402538719, 0.63845918931501`) and is bit-stable through 8192: the shipped 16384
  panels is **512×** more than needed.

  It is also a *labelling* defect, not only a speed one. Every piece of those three records reports
  `capped: true` and carries the provenance step
  `✗ "the evaluation budget bound the resolution, so the node-spacing rule was not met"` — which is
  false (no budget bound anything). `converged()` therefore returns false for all of them, so M8 step
  3.2's sweep table withholds their quadrature columns for a stated reason that did not happen.
- Confidence: CONFIRMED (measured, numbers above).
- Fix: split the two cases. `nearestSingularity === Infinity` → the *minimum* plan (`panels: max(1,
  ceil(arcLen/scale))` against some length scale, `capped: false`); only `<= 0` should mean "as fine
  as the budget allows". `nodeCount`'s line 189 has the identical inversion.

---

**[BUG] A house constraint id and a record slug reach the reader through `solveFamily`'s refusal, on a path neither half of the denylist covers**

- Where: `apps/contour-integration/src/families/runFamily.ts:396` →
  `src/shell/state.ts:554` (`note`) → `src/shell/cards/result.ts:313`.
- What: dragging a record's `R` onto a pole is one gesture. Measured:

  ```
  solveFamily(semicircle-order2, geometry {R: 1}).reason =
    "semicircle-order2: LEGALITY refuses — the contour must avoid every singularity of the integrand…"
  ```

  and `result.ts:313` renders it verbatim as *"No value for the target: semicircle-order2: LEGALITY
  refuses — …"*. Both `LEGALITY` (a word M8 step 0.2 forbids on screen) and the internal slug are
  reader-visible. Neither instrument sees it: `test/denylist.test.ts:154` reads string literals from
  `src/shell/**` and `src/engine/**` only — `src/families/**` is not scanned — and the rendered half
  only mounts records in their DEFAULT state, where none refuses.
- Confidence: CONFIRMED (reproduced; also `mellin-keyhole` at `R = 1`).
- Fix: compose the reason from `constraintLabel("LEGALITY")` and the family's display title, and add
  `src/families/**` to the denylist's source sweep (or add one refusing state to the rendered half).

---

**[BUG] The accumulator draws the full partial-sum trail, and its readout reaches the value the Result card is refusing to print**

- Where: `apps/contour-integration/src/engine/contour/accumulate.ts:143-159`
  (`accumulateForIntegral` asks only `integral.value === undefined`).
- What: its own doc says *"Refusing the integral while still showing a partial sum beside it would
  hand the reader the very number the refusal exists to withhold"* — but a LEGALITY refusal leaves
  `integral.value` perfectly defined. Same fixture as finding 1:

  ```
  refused: "the circle |z - a| = R crosses the cut Γ with no side assigned"
  accumulation drawn: true  steps: 240  final partial sum: -5.19e-17, 6.283005874
  ```

  i.e. the strip's readout ends at `6.283005874i` while the Result card shows `⚠ Refused`.
- Confidence: CONFIRMED (reproduced).
- Fix: `accumulateForIntegral` should take the ledger and return `null` on `legalityRefusal`, with
  `shell/strip.ts:184`'s `withheldBecause` gaining that third sentence.

---

**[BUG] Contour closure is judged by an ABSOLUTE 1e-9, so a large-parameter contour is refused for float dust; `setParam` does not clamp to the declared range and the codec does not either**

- Where: `apps/contour-integration/src/kernel/geom.ts:125` (`isClosed`, `tol = 1e-9`),
  `src/engine/contour/edit.ts:303` (`JOIN_TOL`, same absolute value),
  `src/engine/contour/edit.ts:146` (`setParam` — no range check),
  `src/shell/viewState.ts:297` (decode — no range check either).
- What: the semicircle's closure gap is pure `R·sin(π)` dust, `1.2246e-16·R`. Measured:

  ```
  R=1e6  closed=true   gap 1.22e-10
  R=3e6  closed=true   gap 3.67e-10
  R=1e7  closed=false  gap 1.22e-9     ← LEGALITY refuses a closed contour
  R=1e9  closed=false  gap 1.22e-7
  (keyhole: same, true at 1e6, false at 1e7)
  ```

  The threshold is `R ≈ 8.17e6`. The sliders stop at `1e6` (`templates.ts:46,85,139,201,369,420`), so
  the shipped margin is **1.22×** — but `setParam` and the `#vs=` decoder both accept any finite
  number, so a hand-edited or stale link at `R = 1e7` opens on a contour the app declares not closed.
- Confidence: CONFIRMED (measured).
- Fix: make both tolerances relative to the contour's own scale (`max arcLength`, which
  `integrateContour` already computes as `scaleHint` for exactly this reason), and clamp `setParam`
  to `param.range` — the decoder's "a non-finite number refuses" check should be "outside the
  declared range refuses".

---

**[REGRESSION] `applyBranchTheorem` and `applyLogTheorem` have no `integral.closed` guard, where `applyResidueTheorem`, `applyStripTheorem`, `applySummationTheorem` and `applyExteriorTheorem` all do**

- Where: `src/engine/branchTheorem.ts:63`, `src/engine/logTheorem.ts`; contrast
  `residueTheorem.ts:151`, `stripTheorem.ts:62`, `summationTheorem.ts:76`, `exteriorTheorem.ts:137`.
- What: for a tier-D power/log family on an OPEN contour the two produce a confident
  `exactValue` for a theorem that does not apply. The ledger's first LEGALITY row catches it today,
  so the Result card is safe — but combined with finding 1 the Derivation card prints the number, and
  the guard's absence in two of six routes is a structural asymmetry rather than a decision (no
  comment records it).
- Confidence: CONFIRMED (by reading; the other four routes state the check in as many words).
- Fix: add the same `if (!integral.closed) return refuse(...)` to both.

---

**[STALE-DOC] `test/ledger.test.ts:551` calls `legalityRefusal` "the one gate on printing a value at all"; it is one of four surfaces and two of them do not use it**

- Where: `apps/contour-integration/test/ledger.test.ts:551`, `src/engine/ledger.ts:1770`
  ("**Nothing may report a value while this exists**"), and CLAUDE.md's M5.1 paragraph ("prints no
  `∮` at all").
- What: findings 1 and 5 above. The sentence describes the intent and not the code.
- Confidence: CONFIRMED.
- Fix: fix the code (findings 1, 5), not the sentence.

---

**[STALE-DOC] `ledger.ts`'s `value` fallback is unreachable, and would print only the real part if it ever were reached**

- Where: `src/engine/ledger.ts:1712-1717`.
- What: `value` falls back to `{ text: integral.value[0].toPrecision(10), numeric: integral.value }`
  — the REAL part alone as the text of a complex number — but it is handed out as
  `value: closes ? value : undefined` and `closes` already requires `theorem.exactValue !== undefined`
  (line 1707). So the branch cannot execute. This is precisely the dead condition the comment nine
  lines below (`// **No !killFailed here, and the sweep is why.**`) argues must be removed:
  "A condition that cannot be observed is a second statement of a rule, and the two would drift."
- Confidence: CONFIRMED (by reading the two conditions).
- Fix: delete the fallback, or (if a non-exact `∮` is meant to be reportable one day) fix its text to
  carry both components.

---

**[STALE-DOC] `vocabulary.ts`'s "The three headlines that name no constraint" doc block is orphaned above `CardId`**

- Where: `src/engine/vocabulary.ts` — the block sits immediately before the `CardId` doc comment,
  ~50 lines above the `HEADLINES` constant it documents.
- What: a reader (and any doc tooling) attaches it to `CardId`. Cosmetic but in a file whose whole
  premise is that the wording lives in one findable place.
- Confidence: CONFIRMED.
- Fix: move it down onto `HEADLINES`.

---

**[TEST-GAP] Nothing asserts that the Derivation or the Stepper withhold `∮` past a refusal**

- Where: `test/derivation.test.ts`, `test/steps.test.ts` — neither file mentions LEGALITY or a
  refusal at all (only `derivation.test.ts:320` names the stage order).
- What: `test/figure.test.ts:68` has this test for the caption ("The whole reason `integralRefusal`
  was lifted out of the result card") and `test/cards.test.ts:780` has it for the card. The two
  surfaces that lack the gate are also the two that lack the test — the same pairing M6.4 found with
  the nav header.
- Confidence: CONFIRMED.
- Fix: one test per surface, over the `1/(z+3)` + ray fixture `ledger.test.ts` already builds.

---

**[TEST-GAP] `test/denylist.test.ts` cannot see a house id that is INTERPOLATED, and two such strings exist**

- Where: `test/denylist.test.ts:137-150` (`literalsOf` reads `ts.isStringLiteral` / template *parts*,
  so `${lemma}` and `${role}` are invisible); offenders at
  `src/shell/viewState.ts:458` and `:467`, plus `src/families/runFamily.ts:396` (finding 4).
- What: `viewState.ts:467` composes *"this link disposes of piece 0 by **L4** while calling it
  **'reproduces'**"* — a lemma id and a role id, both of which have reader labels (`lemmaLabel`,
  `roleLabel`) declared for exactly this. Line 458 prints the raw role likewise. The rendered half
  never opens a malformed permalink, so neither instrument fires.
- Confidence: CONFIRMED (by reading both halves of the instrument and the two call sites).
- Fix: route both through `lemmaLabel`/`roleLabel`; extend the AST half to flag an interpolation
  whose expression is typed `LemmaId | ConstraintId | PieceRole` (or simply add the two malformed-link
  states to the rendered sweep).

---

**[TEST-GAP] `removable-one-minus-cos`'s `0/0 → NaN` in `accumulate` is still open, as the code says — but nothing in the node gate asserts the current (honest) behaviour either**

- Where: `src/engine/contour/accumulate.ts:96-113` (the known gap, documented at length);
  `src/shell/strip.ts:211` (`readoutAt` prints `"undefined"`).
- What: the slice was deferred ("left as its own slice rather than smuggled into a layout fix") and
  is still deferred — `Accumulation` has no refusal channel, so the trail simply stops being drawn
  mid-walk. The only assertions are in `test/accumulatorInk.browser.test.ts` (not in the node gate)
  and `test/accumulatorFrame.test.ts:183` (the FIT, not the readout). Confirmed reachable: C2 is a
  loaded gallery record.
- Confidence: CONFIRMED.
- Fix: as the comment specifies — steps up to the bad term plus a named refusal; and a node test on
  `readoutAt` returning `"undefined"` meanwhile.

---

**[PERF] `residueTheorem.windingOf` silently returns `0` for a pole with no winding entry**

- Where: `src/engine/residueTheorem.ts:216-228` (`return bestDist < 1e-6 ? best : 0`).
- What: every other route in the engine treats "the geometry said nothing" as a refusal —
  `branchTheorem.ts:110`, `logTheorem.ts:64`, `stripTheorem.ts:69`, `summationTheorem.ts:82` all
  return `{n: 0, decided: false}` and then refuse. The plain route contributes `0` instead, which is
  an answer. It is unreachable today (`integrateContour` weighs exactly the poles in the report), so
  this is a latent asymmetry rather than a live bug — but it is the same shape as the defect the
  cyclotomic route's comment three screens above explicitly guards against ("A missing entry means
  the geometry said nothing, which is `null` (a refusal) rather than 0").
- Confidence: PLAUSIBLE (unreachable on today's call graph; the asymmetry is confirmed by reading).
- Fix: make it refuse, matching the other five.

---

**[IDEA] `sameShape`'s tolerance is absolute (1e-9) while the quantity it compares scales with `R`**

- Where: `src/engine/contour/pen.ts:389,405`; used by `src/shell/viewState.ts:605,662` to verify a
  recipe before minting a link.
- What: the measured round-trip noise it is sized against (1.3e-12) was taken on *drawn* paths, which
  are camera-sized. Applied to a template carrying ops at `R = 1e6`, float64's own relative noise is
  already 2.2e-10 — a 4.5× margin rather than the claimed three orders. Same class as finding 6.
- Confidence: PLAUSIBLE (not reproduced: the ops path plus a large `R` needs the shell).
- Fix: scale `SHAPE_EPS` by the contour's extent, as `integrateContour`'s `scaleHint` does.

---

### Checked and found sound

- `analyse.ts` routes on GEOMETRY as claimed (`enclosesTheCut(resolved, branch)` first, before any
  integrand test), and the four-way route order is exactly as documented; `kernelBand` refuses past
  `MAX_KERNEL_BAND` rather than truncating an infinite pole set.
- `analyse.ts` adds both the kernel's integer poles and the cofactor's to `singular`, so the M5.5b /
  M5.6c hole stays closed.
- Undecided windings: **all six** theorem routes refuse by name (`residueTheorem.ts:230`,
  `branchTheorem.ts:117`, `logTheorem.ts:72`, `stripTheorem.ts:77,106`, `summationTheorem.ts:95,116,149`,
  `exteriorTheorem.ts`).
- A skipped quadrature can NOT render as agreement: `checkAgainstQuadrature` returns `null` on
  `integral.value === undefined`, so `agrees`/`crossCheck` are absent and `derivation.ts:331` never
  emits the cross-check statement. `integrateContour`'s skip branch carries `quadratureSkipped`
  distinctly from `refusal` and `shell/strip.ts:184` distinguishes them.
- `integralRefusal` correctly composes its three reasons and is correctly used by `result.ts` and
  `figure.ts`; `solveFamily` (Pass 5) is correctly gated by `legalityRefusal`.
- `edit.ts` replay: `applyOps`' refusal-by-reference-identity is sound — every op constructs a new
  object on success and returns the input by reference on refusal, with no exceptions among the six.
- `splitPieceAt`'s floor is the single degeneracy rule and it does cover fraction < 0, fraction > 1,
  a zero-length segment and a zero-sweep arc, via the negated `>` (a `NaN` fails both clauses).
- `arcFraction` handles a full turn correctly (reduces mod `2π` before dividing by the sweep) and
  keeps a clockwise arc's fraction positive; `arcDivide` shares `center`/`radius` by reference so
  `ledger.ts`'s `isOriginCentred` bound survives a division bit for bit.
- `halfRole`'s rule (a decided role is inherited, a believed one is not) is right and its `target`
  half is falsifiable through `ledger.ts`'s `targets.length === 1` gate.
- `splitFraction`/`fractionAlong` carry a fraction and not a point, so a division replays correctly
  after a parameter change; the replay order (`params` before `ops` before `shift`) is consistent
  with how the fraction was recorded.
- `reversePiece` refuses anything that is not a closed loop rather than repairing the chain;
  `deletePiece`/`reorderPieces` both go through the one `rejoin`.
- `integrate.ts` checks clearance BEFORE any quadrature and returns no pieces at all on refusal, so
  there is nothing to suppress; `converged()` is the single threshold and `capped` feeds it.
- `derivation.ts` mints only `unknown` certificates (never `exact`/`bound`), and its conclusion,
  `pieceLimits` statements and Pass-5 line are all gated by `ledger.closes`.
- `steps.ts` computes nothing — every line/pole/level is `buildDerivation`'s, so the leak in finding 1
  is inherited rather than introduced.
- `contrast.ts`'s `(constraint, role, ordinal)` key and its one-delta-per-row rule are as documented.
- `vocabulary.ts` is genuinely the single decision point for the four constraint labels, the seven
  stage titles, the five roles, the eight lemma names, the ten template labels and the seven tags.
- `splitCheck.ts` computes the region where the comparison is legitimate rather than assuming it —
  the strongest falsification pattern in the slice, and the model finding 2 should copy.
- `test/crossCheck.test.ts`'s "is the check actually wired in" block breaks the wiring on purpose
  (a getter that answers differently on the second read) — not vacuous.

### Not covered

- `branchEdit.ts` (cut/branch-point editing) read only at the level of its exports; no probe run.
- `substitution.ts` read only at the header level.
- `exteriorTheorem.ts` beyond its guards (`closed`, `enclosesTheCut`, the enclosed-count row) — the
  `Res(f,∞)` arithmetic and the `σ` weighting were not independently re-derived.
- `claims.ts` / `claimsDoc.test.ts` were not audited claim-by-claim against the ledger rows that
  produce them.
- `model.ts`'s `Scalar` arithmetic (`mul` naming a parameter, F1's widening) not re-checked.
- No mutation sweeps (forbidden by the brief), so "outcome without reason" was assessed by reading
  the tests rather than by killing mutants.
