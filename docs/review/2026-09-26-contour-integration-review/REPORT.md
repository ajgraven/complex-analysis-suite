# Contour Integration: review and improvement survey (2026-09-26)

A full review of `apps/contour-integration` at `da1afc4`, six days after the
[2026-09-20 review](../2026-09-20-contour-integration-review/REPORT.md) and its ADR-0045 remediation.

Ten agents ran in parallel:

- **Six reviewers, read-only.** Each worked one slice and preferred a measurement to a reading:
  - the engine and the value gate;
  - a differential fuzz of the exact kernel against mpmath/sympy;
  - the 28 records against their JSONC specifications;
  - the shell's state and interaction logic;
  - a live Playwright pass;
  - the documentation.
- **Four researchers, on the web:**
  - prior-art tools;
  - pedagogy and textbooks;
  - mathematical capability and algorithms;
  - UX, accessibility and performance practice.

Each item is labelled with how it was established:

- **CONFIRMED:** reproduced by a probe, a mounted shell or a browser.
- **REPRODUCED:** the coordinator reran it independently for this report.
- **PLAUSIBLE:** found by reading only.

The probe scripts lived in the session's scratch directory and are not kept, so each item carries its own reproduction inline.

**Baseline.**

- **Gate:** green, **622 files / 7,111 tests**, exactly CLAUDE.md's figure; lint, typecheck and build are silent. The app's own node project is 141 files / 2,854 tests.
- **Console:** no console errors across about 1,100 slider states, all 28 records and every fixture.
- **Old links:** all 228 M6/M7-era permalinks decode. They were minted by encoders rebuilt from `740a54f` and `a929b81`.
- **Earlier fixes:** every fix from 2026-09-20 that was re-checked still holds.

---

## 0. Verdict in one paragraph

ADR-0045 did what it said. `valueRefusal(…, of)` is called with the right `of` on every surface it names:

- the card, caption and strip;
- the accumulator;
- the derivation's ∮ line;
- Pass 5;
- the contrast grid.

The kernel held up under 2,075 fuzz cases:

- **8,209 decided winding numbers**, none wrong;
- **800 `≤` bounds**, none violated;
- **690 exact `∮` values**, every plain-rational and `e^{iaz}` one right to 1e-9.

What remains are **wrong values the engine itself certifies**. No surface gate can catch them, because the argument's own rows are wrong. There are four:

- an indentation that encloses a second pole (§1.1);
- a closed-form _text_ that disagrees with its own number (§1.2);
- a declared `(b − z)` orientation ignored by the residues (§1.3);
- two records whose identity pairs the wrong target with the answer (§1.4).

Behind them is a layer of broken core interactions:

- radius handles that do not drag;
- a "reorder" that changes the curve;
- in-app doors that wipe the reader's sandbox;
- no touch support;
- main-thread hangs.

The mathematics of the 28 records is still right: all 94 golden values were re-verified against mpmath by sweeping every slider.

---

## 1. P0 — a wrong value presented as established

### 1.1 The indentation lemma certifies a wrong answer when a second pole lies inside the ρ-disc (CONFIRMED ×2, REPRODUCED)

**Where:**

- `kernel/bounds/smallArc.ts:94-164` (`smallArcLimit`), called from `engine/ledger.ts:1502-1533`.

**What it checks and misses:**

- It checks the swept angle, a pole at the centre, and that the pole is simple.
- It never checks that `|z − c| ≤ ρ` contains no _other_ singularity.

**Mechanism:**

- CATCH decides windings at the finite ρ, so a pole inside the disc is left out of `∮`.
- KILL then credits the indentation with its ρ → 0 limit, `−iπ·Res`.
- The two halves of the argument therefore describe different contours.

Record C3, `pv-sine-over-x-times-quadratic`, whose true value is `π(1 − e^{−b})/b²`. Reached with its own sliders (b ∈ [0.01, 10], ρ ∈ [1e-6, 1]):

| b     | ρ                | printed, under "The argument is complete." | true              |
| ----- | ---------------- | ------------------------------------------ | ----------------- |
| 0.02  | 0.05 (default ρ) | `2500π` (7854)                             | 155.5             |
| 0.049 | 0.05             | `1000000π/2401` (1308.45)                  | 62.57             |
| 0.3   | 0.5              | `100π/9` (34.9)                            | 9.05              |
| 1     | 1.5              | `π`                                        | `π − π/e` (1.986) |
| 0.051 | 0.05             | correct                                    | —                 |

The same wrong value appears in the Result card, the derivation conclusion, the figure caption and the PNG's `tEXt` verdict, and in the sandbox's `indented` template with `1/(z(z − 0.01))`.

The keyhole and dogbone inner circles already refuse the equivalent case, and the large arc refuses the mirror case. Only L4 is missing the check.

**Fix:**

- Refuse by name when any singularity other than the centre lies in `|z − c| ≤ ρ`; the repair is "take a smaller ρ".
- Add a corpus test that every solved value is **invariant under each limit parameter across its slider range**. That test is what found this.

### 1.2 The summation theorem's closed-form text drops the imaginary part (CONFIRMED, REPRODUCED)

**Where:**

- `engine/summationTheorem.ts:63-68` (`describeCofactorSum`) falls back to a decimal of `ratioToTuple(total)[0]`, the REAL part only.
- `joinSigned` misses the ASCII `-`, so it produces `− -x`.
- The LaTeX path is identical.

**Reproduction:** sandbox, square template N = 1, `pi*cot(pi*z)/(z - i)`.

- The app prints `∮ = 2πi(2i − 0.000000000)`, which reads as −4π.
- The computed number is **7.2467**, and the quadrature agrees.

**Frequency:** 10 of the fuzz's 22 exact kernel results had a wrong text.

**Fix:**

- Carry both components.
- Give the closed-form formatter a property test: parse the text back and compare it to the value. The fuzz harness's `textval.py` did exactly this.

### 1.3 A declared `(b − z)` orientation (sign −1) is ignored by the residues and the drawn cut, but used by the evaluator (CONFIRMED)

**Where:**

- `kernel/branch/declaration.ts:216-217` builds `factor` and `cutFromDetermination` without `sign`.
- The toggle is `shell/cards/cuts.ts:327`.

**Effect:**

- LEGALITY checks the wrong cut.
- The residues read `arg z` where they should read `arg(−z)`.
- The quadrature samples `(−z)^α`.

**Reproduction:** keyhole R = 1, ε = 0.15, `1/(z − 5i)`, α = ½, window [0, 2], sign −1.

- The app prints **`∮ = 0` with "quadrature agrees (0.247)"**; the true value is −0.0288 + 0.2472i.
- With window [1, 3], a legal configuration is refused instead.
- Across 200 sign −1 cases, 11 wrong `=` values were printed ungated.

**Why the cross-check did not catch it:**

- `engine/contour/integrate.ts:154` uses the periodic trapezoid on keyhole and dogbone circles, whose integrand jumps at the cut.
- Its error estimate is therefore about 1, and the 32× tolerance at `residueTheorem.ts:114` cannot catch an O(0.1–1) error.

See §3.4 and §6 B3.

### 1.4 D4 and D5 print false identities on the Target card and on the front door (CONFIRMED)

**Where:**

- `families/latex.ts:96-100` (`identityLatex`) takes `family.targets[0]` but pairs it with `golden.value`, which belongs to the _primary_ target.
- D4 and D5 list T0 first.

**What appears on screen:**

- Front door (`frontDoor.ts:169-179`) and Target card (`cards/target.ts:68`):
  - D4: `∫₀^∞ dx/(1+x²)² = −π/4`; the true value is π/4.
  - D5: `∫₀^∞ dx/(1+x²) = π³/8`; the true value is π/2.
- Off-fixture: D4 at p = 1 shows `∫dx/(1+x²) = 0`.
- E3 and F2 are correct only because their primary target happens to be listed first.

**Fix:**

- Select the target by role.
- Add a test that every rendered identity is numerically true.

---

## 2. P1 — broken core interactions and misleading states

### 2.1 Radius handles cannot be dragged, by mouse or keyboard, in either mode (CONFIRMED in browser, cause REPRODUCED by reading)

**Where:**

- `shell/stageController.ts:748` (pointer) and `:888` (keyboard) call `radiusDragValue(st.contour, …)`.
- In gallery mode `st.contour` is the _parked sandbox curve_, not the drawn record contour. `state.ts:497-510` says so, and `drawnContour` exists for exactly this reason.
- In the sandbox, the result is written to `state.geometry`, which only gallery mode reads.

**What the reader sees:**

- The handle shows `grab`/`grabbing` and its chip.
- An 80 px drag on A6 leaves R = 4; so do ten arrow presses after Enter grabs the handle.
- `test/edit.test.ts` tests `radiusDragValue` in isolation only, so the wiring is untested.

**Fix:**

- Use the drawn contour in gallery mode.
- Route through `setParam` on the sandbox contour and its recipe in the sandbox.
- Add a mounted-shell test that drags a handle and asserts the parameter moved.

### 2.2 "Move earlier/later" is not a reorder: it changes the curve (CONFIRMED)

**Where:**

- `engine/contour/edit.ts:576-588` (`reorderPieces` → `rejoin`) and `:1083-1102`.
- Triggered by `cards/contour.ts:355-382` (the ↑/↓ buttons and Alt+↑/↓).

**Wedge, `1/(1+z³)`:**

- Moving the arc up and then back down inserts joins that retrace whole pieces.
- The winding about `e^{iπ/3}` goes **1 → 2 → 3**, and `∮` triples, all under "complete".

**Keyhole:** 20 moves give 44 pieces and a 1,151-character link.

**Fix:** either reorder by relabelling only, since `∮` over a closed chain does not depend on piece order, or refuse a move that opens a seam.

### 2.3 Contrast rungs and drill tasks destroy the reader's sandbox and clear undo (CONFIRMED)

**Where:**

- `shell/contrastGrid.ts:93-122` and `shell/drill.ts:538-571` build their states from `defaultState`.
- They commit with reason `"link"` (`app.ts:943`, `:296`; `drillPanel.ts:498,643`), which clears both undo stacks (`undo.ts:174`).

**Reproduction:**

1. Keyhole, `z²/(1+z⁴)`, iso on.
2. Open a contrast cell.
3. Go back to the sandbox. It now holds `1/z` on a circle, and there is no undo.

A drill pick also overwrites the cuts, the declaration and the camera.

**Against the plan:** M8-plan §1.11 says only a _link_ clears the stacks.

**Fix:**

- Give in-app doors their own commit reason.
- Build the new state on the current state's sandbox fields, as `frontDoorState` already does.

### 2.4 The headline says "The argument is complete." over a withheld target or a contradicted cross-check (CONFIRMED)

**`closes` is too permissive** (`engine/ledger.ts:1867-1870`, headline at `:2067-2070`). It ignores:

- COVER rows whose status is `unknown`;
- an undefined target;
- the theorem's own quadrature contradiction.

**Reachable states:**

- Semicircle with the arc set to "free": "complete" above a row saying the target's value is not determined.
- `removable-one-minus-cos` and E1 at the R slider's maximum of 1e6: the card shows `⚠ π/2` under "complete", while the caption (`figure.ts:141`, via `assembleVerdict(solved.certificates)`) says `= π/2`.

**A `residue`-role piece is treated as zero** (`ledger.ts:1888` lists only `free`/`reproduces` as undisposed):

- Divide the default circle and mark one half as the target.
- `1/z` then prints `≈ 2iπ` against a true `iπ`, under "complete".

**Fix:**

- Fold the contradiction into `valueRefusal`, or add a failing cross-check row.
- Count an unknown COVER row against "complete".
- Add `residue` to the undisposed list.
- Make the caption use `levelOfSolved`.

### 2.5 Non-rational integrands get no pole search, and noise prints as "≈ 0" (CONFIRMED, REPRODUCED)

**Two sources of dropped poles:**

- `kernel/poles.ts:541-550` does no search for any non-rational integrand without `e^{iaz}`.
- `:367-405` silently drops unpinned poles of `g·e^{iaz}`: 29 of 800 fuzz cases integrated straight through a pole.

**The false CATCH row:** in every such case CATCH mints `= "Ind ≠ 0 at 0 singularities, each decided exactly"`. REPRODUCED for:

- `exp(z)/(z²+1)` on |z| = 2, which encloses two poles;
- `1/sin z` on |z| = π, which has poles _on_ the contour.

**What the Result card shows:**

- `1/sin z` on |z| = π: **≈ 0**. `shell/format.ts:60` prints "0" whenever the error estimate exceeds |value|.
- `exp(z²)/(z−1)` on |z| = 6: `≈ 1.6e15i`; the true value is 2πie ≈ 17.1i. This is catastrophic cancellation that the quadrature neither refines nor flags.

**Fix:**

- The CATCH row must say "singularities not located" rather than "0".
- Refuse or flag a quadrature whose error estimate exceeds its value.
- Add AAA pole candidates (§6 C10).

### 2.6 Main-thread hangs (CONFIRMED, REPRODUCED)

**Sandbox typing** (`findPoles` → `exactPolesOf` → `deflateRationalRoots`, `kernel/algebraic.ts:134-148`, called per keystroke at `app.ts:1210`):

| Integrand     | Time    |
| ------------- | ------- |
| `1/(z^24+1)`  | 0.6 s   |
| `1/(z^40+1)`  | 2.9 s   |
| `1/(z^64−2)`  | 25 s    |
| `1/(z^128+1)` | > 300 s |

`MAX_DEGREE = 256` does not bound this. The printed `∮` is also a 40-term exponential sum that is exactly 0. The residue at infinity gives that in one line, and the cyclotomic-sum machinery already exists for records.

**Permalink bindings are never range-checked** (`viewState.ts:1053-1071`):

- D7 μ = 8000.5 takes 43 s; `powInt` loops over the numerator (`branchResidue.ts:293-312`), which is the "lcm power" item left open on 2026-09-20.
- G2 N = 1000 takes 23 s.
- A3 n = 5000 takes more than 60 s.
- R = −5 on a semicircle prints `∮ = −π/2` labelled `=`.

**Also slow:**

- G2's `N` slider accepts non-integers; 128/181/256 take 1.0/2.9/8.6 s and end in "≈ not a number".
- `analyse.ts:226` reruns `cofactorPoles` every drag frame, 0.7–2.5 s each.
- The indented template at small ρ builds uniform panels of up to 417k nodes (5.9 s).

**Fix:**

- Clamp link bindings and geometry to their declared ranges, and refuse by name outside them.
- Cap `powInt`.
- Cap the rational-root snapping's denominator, or give it a work budget with a numeric fallback.
- Move the solve into a Web Worker (§5).

### 2.7 A quarter of the convergent slider positions refuse (CONFIRMED)

The records agent swept 848 slider stops, 785 of them convergent; **213 of those refuse**. The causes:

| Cause              | Stops    | Detail                                                                                                                                           |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raw binary floats  | 62       | `fromStop` (`cards/parameters.ts:37`) passes values like `0.30000000000000004` into exact arithmetic.                                            |
| D7's μ             | 19 of 41 | The same float problem, as a phase with common denominator 132491501988121845. The stage blanks, the sliders vanish and focus falls to `<body>`. |
| A3's integer `n`   | 30 of 41 | A continuous slider for an integer parameter.                                                                                                    |
| Fixed limit radius | 115      | `limitParams.start` does not follow the family parameters, e.g. B1/C3 with \|b\| > 4 at R = 4.                                                   |

**Consequences on screen:**

- **G2's verdict flips 8 times** across 41 stops below 4.
- The same displayed value can get opposite verdicts from the slider and from a permalink: G2 at a = 0.5095, and A1.
- The float-noise refusal prints `"circle-poisson: … nothing for Pass 5 to solve"`, leaking a record id and a house term (`runFamily.ts:477`).

**Fix:**

- Snap each stop to the simplest rational in its step, with `simplestRational` on |x| (§3.9).
- Make integer sliders discrete.
- Let the limit radius follow the poles, or point the refusal at the limit slider.

### 2.8 Touch and tablets (CONFIRMED)

**The stage canvas has `touch-action: auto`** (`ui/shell.css:200-223`). The inline scrub has `touch-action: none` at `:1225`, with a comment explaining exactly why the stage would need it too.

On a ≥ 900 px touch device, which gets the full app:

- a one-finger drag ends in `pointercancel` after two moves;
- a pinch zooms the whole page (scale 1 → 5) instead of the plane. Zoom is wheel-only.

**Pointer handling:** `stageController.ts:599` checks neither `button` nor `isPrimary`, so a right-click starts a drag.

**Fix:**

- Set `touch-action: none` on the stage.
- Add a pinch handler and bigger touch handles.

### 2.9 Links and layout (CONFIRMED)

- **A record link without a camera opens with the contour off-screen** (F4). This includes the owner's own `browser-pass.md` A6 link. D7's pole at c = 5 is not visible even after _Fit contour_, and Copy link then produces another camera-less link.
- **900–1150 px wide:**
  - At 900 px the stage is 212 px wide and the partial-sum canvas is 0 px.
  - The strip's controls overlap the Derivation.
  - At 1024 px the stage is 336 px.
- **A division drag, or a pen contour after a structural edit, cannot be linked**, and the address bar silently keeps an older, _different_ state:
  - `stageController.ts:725` commits `contourSource: null` on the first move.
  - `app.ts:1305` leaves the hash alone when encoding refuses.
  - The Share card then says the contour "came from neither a template nor the pen" about a pen contour (`errors.ts:130-137`).

---

## 3. P2 — wrong or confusing, not blocking

**Drafts and undo**

1. **The draft budget gets stuck** (`app.ts:1215`) and leaves false "capped" tags on screen. Three paths never settle:
   - the pen is out (`penStop` commits nothing);
   - the strip's position slider;
   - the Parameters slider driven by keyboard.
2. **Undo:**
   - Keyboard slider moves merge into one entry.
   - Ctrl+Z is swallowed on range inputs and selects (`app.ts:1465-1469`), against its own comment at `:1452`.
   - Ctrl+Z inside the front-door dialog undoes the page underneath (`modal.ts:167-179`).
   - Undo in Worked example resets the stepper (`app.ts:1394-1401`).
   - Undo has no button, so a touch reader has no undo at all.

**Focus and a missing notice**

3. **Focus is lost in Chromium on a piece reorder and on several routine buttons.** `dom.ts:225-230` moves the focused node with `insertBefore`. The affected buttons are delete, Step through, All, Declare branch factor and remove branch point.
4. **Without WebGL2, the "why is the stage empty" notice is erased** by the mount's own render (`app.ts:1325-1332`), and the stage's alt text still describes a portrait.

**Numbers and labels**

5. **The cross-check can "agree" at absurd magnitudes** (`residueTheorem.ts:114`, a 32× tolerance on the quadrature's own estimate):
   - `1/(z−1.4999)^12` "agrees to 7.63e43" beside `= 0`;
   - wedge-fresnel at R = 1e6 "agrees to 4.1e4".

   Report "inconclusive" when the estimate exceeds the value's scale.

6. **`reproduces` is still vacuous for templates.** `ledger.ts:917` checks only length and a nonzero target:
   - `exp(iz)/(z²+1)` on the strip, wedge or keyhole "closes" with an `=` row;
   - a mis-declared multiple solves D1 to half its value (reachable through record data only).

   The declared multiples match the measured ratio on all 34 corpus rows to ≤ 1e-13, so a numeric check is affordable. **This is also the prerequisite for practice mode (§6 A2).**

7. **Phantom poles** (`poles.ts:320`). A 1e-6 dedup cannot absorb the ∛ε ≈ 1e-5 split of a triple root:
   - 81 of 800 fuzz cases were affected;
   - `1/((z−1)³(z³−2))` lists 7 poles for degree 6.

   The LEGALITY clearance row is also minted `=` from `≈` locations (`ledger.ts:1005-1019`).

8. **B3's badge mismatch persists:**
   - `derivation.ts:474-487` shows `≈ 1.5442…` under an `=` badge;
   - `stepFocus.ts:145-151` repeats it on the stage chip.
9. **Remaining edge cases:**
   - Fix 1.8 is incomplete: `argument.ts:69,73` and `bar.ts:173` still render at `golden.params`.
   - The Numerics table prints the withheld total on a one-piece contour.
   - `simplestRational(−1e-12)` returns a dyadic.

**Sandbox value display**

10. **The sandbox headline rounds away the number** (F7):
    - `z^0.5/(1+z)` on the circle shows **≈ 0** where the Numerics table says −0.361 + 0.323i;
    - `log z` shows "≈ −9i";
    - `1/0` shows "≈ not a number" as a value.

**Constraints and record data**

11. **Constraint readings** (`families/constraints.ts:95`):
    - A1's `abs(b) < abs(a)` is read as two rays, so b is never clamped.
    - D3 lacks `n > a`.
    - D7 lacks `b < c`.
    - E3's `b >= 0` admits a degenerate b = 0.
12. **False refusal reasons:**
    - E2 refuses ξ ≤ −6.6 saying "the target integrates to 0". `REPRODUCES_TOL` is relative, and the top side is 8e10× the target.
    - F2 refuses n ≥ 7 saying the angle is "not a rational multiple of π". The real cause is the denominator cap of 12.
13. **Latent errors in record data.** The predicate strings are validated for namespace only (`families/index.ts:245-280`):
    - C1/C3 `closedForm.expr` have the wrong sign on `πi·Res`; the docs had it right.
    - D4's lemma uses exponent `2p` where it should be `p`.
    - D2's trap can never fire.
    - Unbound names: `a` in C1/B2, `nu` in D7.
    - B1's winding for a < 0 is +1 where the contour gives −1.
    - `windings`, `orientation` and `closedForm.expr` are read by nothing.

**Reader-facing text**

14. **Rendered prose errors:**
    - A5: "P/Q′ is 0/0" should be 1/0.
    - C2: "principal part i/z" should be −i/z.
    - G1/G3: "kernel's residue IS the summand" should be the product's residue.
    - C1: "−iπRes, a half of 2πiRes" should say minus a half.
    - "The target is Im/2 of the integral" reads as a typo.
15. **Raw TeX and house words reach readers:**
    - 17 of 22 `auxiliary.note`s put TeX outside `$…$` (`describe.ts:67-90` → `argument.ts:75`).
    - "Re e^{ix}" appears in about 20 derivations.
    - The stage and record-button accessible names contain `∫_{−∞}^{∞}`.
    - The card-heading `text-transform: uppercase` reaches into KaTeX: **`∑_K F(Z_K) ΔZ_K`** on every screen.
    - The denylist misses D6's "ADD" because `textContent` concatenation glues it to "Hypotheses". It also misses the two-letter "IS", and still does not scan `src/families/**`.

**Accessibility (WCAG 2.2)**

16. **Failures:**
    - **2.5.3 Label in Name:** 8+ controls; "Fit contour" is named "frame the whole contour", and the three figure buttons are indistinguishable.
    - **2.5.8 Target Size:** stepper dots are 8×8 px; derivation rows are 23 px; rail toggles are 19×18.
    - **2.5.7 Dragging Movements:** five drag-only operations — moving a sandbox contour, moving a branch point or cut, panning, bowing a pen arc, and Shift-drag division.
    - **1.4.4 Resize Text:** at 200% zoom a 1440-wide laptop falls under 900 px, so the whole app is replaced by the phone notice.
    - **Windows high contrast:** the selected state of every segmented control is lost.
17. **Colour vision:** CET-C6 collapses to yellow/blue under deuteranopia. The CET-CBC1/CBC2 option specified in PLAN §7.3 and research 07 was never built.

**P3 (sampled):**

- "0 vertexes".
- Two consecutive steps titled "Residues".
- KaTeX ships all three font formats: 59 files, 1.07 MB, of which only woff2 is ever fetched. It also uses `font-display: block`.
- Step during Play acts as Stop.
- `copyLink` is silent over http.
- `destroy` never calls `stageA11y.destroy()`.
- Dead code: `isPenContour`, `Session.frontDoorOpen`, `declaredReference`, still pinned by a test.
- Stray doc comments in `app.ts`.
- A1's slider rescales its own range mid-drag (non-monotone).
- R sliders run to 1e6.
- The sandbox button promises "keeping the contour parked there" and opens `1/z`.

---

## 4. Documentation (57 stale items; 54 CONFIRMED)

**The worst:**

- **Published launcher card** (`apps/launcher/index.html:229`) still says **"Free-hand contours are still to come."** The pen shipped at M7.2. REPRODUCED.
- **CLAUDE.md** says reduced motion is "deliberately not honoured" and cites zero keyframes and a single rAF (L613-616). All three are now false:
  - `shell.css:1170-1199` has `@keyframes` and the media query;
  - `app.ts:332` queries it;
  - there are 4 rAF call sites.

  REPRODUCED.

- **CLAUDE.md contradicts itself:**
  - 23 CI jsdom specs; there are 25.
  - "four of six" browser configs; there are seven, and five carry the Chromium line.
  - `app.ts` "1,422 lines, re-measured"; it is 1,525, and became so in the same commit.
  - "682 nodes across 20 pages" vs "1,125 across 29".
  - `@cas/export` "by seven apps"; there are eight.
- **The root `test:browser` script omits polynomial-roots.** REPRODUCED.
- **M8/STATUS.md's "Current" header** still says Phase 1 has begun on a dead branch, and the PR is "open". It was merged as #345.
- **The four-layer rule is described as "enforced by eslint"** in the app README and DESIGN. In fact:
  - only `kernel/` and `engine/` have rules;
  - `families/` is uncovered;
  - `worker/` does not exist;
  - there is no DOM-globals ban.

  The code obeys the rule; nothing enforces it.

- **App README:**
  - describes a `Sandbox | Gallery` switch that no longer exists;
  - says "the pen is still to come" and "M6 has begun";
  - its Documentation table omits the M4–M8 plans, the M8 files and both reviews.
- **PLAN.md** is headed "Status: PRELIMINARY … Nothing here is an ADR yet".
- **Stale file references:**
  - `errors.ts:45` and STATUS.md cite `test/parseError.test.ts`, which was never on master.
  - The record-name citation Stein–Shakarchi "Ch. 2 §1" should be **§3** (C2, E3). REPRODUCED: §1 is Goursat's theorem.
  - Marsden–Hoffman "§4" is a chapter, cited that way 13 times; it should be §4.3 or §4.4.
  - The Brown–Churchill edition is not stated; the section numbers match the 8th.
- **`@cas/rigor`'s consumers** omit Complex Dynamics (ARCHITECTURE:198, root README).
- **The gallery spec lost content:** E3's b = 0 fixture, D2's p = q fixture, D5's R = 1/(x²+4) fixtures, and G3's two csc-specific traps, which were replaced by copies of G1's.

**CLAUDE.md as a document.** It is 1,755 lines, about 25k words and ~45k tokens loaded into every session.

- Contour Integration history is **62%** of it, Polynomial Roots another 19%.
- Its milestones run M5.8 → M6 → M7 → M4 → M5.0, with "M6 has begun" and "M5 has begun" reading as live status.
- **Proposal:** trim it to about 400 lines, keeping:
  - the locked decisions;
  - the guardrails;
  - setup and gate, with each count replaced by the command that measures it;
  - an app index table (app · status · packages · ADRs · read-first doc);
  - about 12 one-line "hard-won testing rules";
  - ≤ 10 binding rules per app.
- Move the narrative to `docs/contour-integration/HISTORY.md`, the Polynomial Roots plan, and ARCHITECTURE/LOG.
- The move is lossless: the same findings already appear in 4–5 documents each.

---

## 5. Performance (measured on software GL, a shared 4-core box; ratios reliable, absolute times pessimistic)

| Metric                 | Value                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| JS                     | one chunk of 989,671 B (310 KB gzip), KaTeX included; 381 ms to evaluate                   |
| First contentful paint | 0.77–1.88 s; Result card populated at 440–526 ms                                           |
| Opening a record       | median 406 ms to a painted frame, p90 717 ms, first open 3.0 s; D6 spends 471 ms of script |
| Slider recompute       | median 5–65 ms; D6 281 ms per step; G2 `N` up to 8.6 s                                     |
| Contour drag           | JS handler 5–29 ms median (the frame rate is SwiftShader's)                                |
| Memory                 | no leak over 50 record switches (heap 4.9 → 11.1 → 9.7 MB); 145 long tasks, max 1.7 s      |

**Recommendations:**

- Move the exact solve into a Web Worker. It is pure and DOM-free by design, and `@cas/ui`'s `createComputeClient` already provides coalescing and a sync fallback. INP counts over 200 ms as needing improvement.
- Split KaTeX and the heavy record engines into lazy chunks.
- Ship woff2 only, with `font-display: swap`.
- Memoise the solve on the problem fields, since camera, iso and scrub commits currently rerun it.
- Add a timing guard test for `findPoles`.

---

## 6. Improvement survey (research)

### 6.1 Where the app stands in the field

**Prior art.** The niche of a _certified argument for a real integral_ is still empty:

- Mathematica's `ContourIntegrate` (13.3; named "Hairpin"/"Dumbbell" contours, piecewise answers over parameters) gives the answer with no argument, no bounds and no steps.
- Terence Tao's 1998–2000 Java applets (now running in JavaScript) cover the complex integral, the residue theorem, the argument principle and multi-valued functions, but in plain floats with freehand contours only. <https://teorth.github.io/tao-web/applets.html> (verified).
- carl-plot, Desmos Complex Mode, complex-analysis.com and Wolfram's free _Essentials of Complex Analysis_ eTextbook (Jan 2026) do no integration argument.

**What is unique to this app:** certified bounds, exactly decided winding numbers, a ledger that refuses, cut-aware exact residues, and permalinks checked by verdict.

**Where it lags the field:** assessment (generated practice), portability (LaTeX export, embedding), and the argument principle.

**Pedagogy.** No published study exists on students learning residues, winding numbers, branch cuts or contour choice. The 2020–26 work is about what ∮f dz _means_:

- **Soto & Oehrtman 2022** (JMB 66, 100963): students collapse when coordinating f and Δz; the authors promote reading ∫ as the path locally deformed by multiplication by f. This is exactly the accumulator trail, which the research validates.
- **Hanke 2024** (ZDM; IJMEST 57): the integral as an average.

So the ledger design is an untested hypothesis, and the largest expected gains come from general learning science. The app has excluded or not built several of those pieces:

- **Self-explanation prompts** were excluded (M7 §0), but meta-analysis gives g = .55 (Bisra et al. 2018). Menu-based prompts need no free text (Aleven & Koedinger 2002; Berthold et al. 2009), and rung ii's disposal menu already is one.
- **Interleaving** (Rohrer et al. 2020, d = 0.83; Brunmair & Richter 2019, g = .42) is strongest for similar categories on complex material, which describes contour families exactly. The drill covers 3 of 8 groups, blocked.
- **Erroneous examples** (Alemdag et al. 2025): the records carry **136 authored trap texts that no screen shows**.
- **Expertise reversal** (Tetzlaff et al. 2025, strongest in higher education) and adaptive fading (Salden et al. 2010): the app has no diagnosis step.
- **Prediction helps through surprise** (Brod et al. 2018, 2022): the app asks one prediction, at a low-surprise point.

**Textbooks disagree with the app's vocabulary and with each other:**

- **Jordan's lemma:** Kreyszig, Ahlfors and Stein–Shakarchi never name it; Ahlfors uses a rectangle with independent X₁, X₂, Y.
- **Indentation:** Brown–Churchill indents above the pole, Ahlfors below.
- **Winding numbers:** Brown–Churchill, Kreyszig and Stein–Shakarchi state the residue theorem without them; the app's `Ind_γ` is Rudin's notation, where Ahlfors writes n(γ, a).
- **"Boundary terms"** collides both with ∂D, since every piece is on the boundary, and with integration by parts.

**The one thing no textbook has:** a failing closure, or a measured bound shrinking. That is the app's distinct contribution.

### 6.2 Ranked recommendations

Ranked by value × feasibility within each tier. Sizes: S ≤ days, M 1–2 weeks, L longer.

**A. Pedagogy**

| #   | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Size | Grounds                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------- |
| A1  | **Faded, menu-prompted stepper on all 28 records.** "Try each step" in Worked example, on by default at first visit; each step hides its conclusion behind one forced-choice question graded from data it already has (click the enclosed poles; pick the disposal lemma; pick the reproducing multiple, with traps as distractors); feedback is the ledger row; backward fading on revisits. Reuses `buildSteps`, `Disposal` and the M8 4.3 lemma menu. **Needs the owner to revisit M7 §0's exclusion.** | M    | Atkinson–Renkl–Merrill 2003; Bisra 2018; Aleven–Koedinger 2002 |
| A2  | **Practice mode: randomised parameters, interleaved across groups.** A random in-range binding is already a `ShellState` and a permalink. Items: pick the contour, the half-plane, the lemma, the residue at a named pole, the value. A refusing setting becomes "does this close?". Groups 5–7 wait on a real `reproduces` check (§3.6).                                                                                                                                                                  | M    | Rohrer 2020; Brunmair–Richter 2019; WeBWorK residue sets       |
| A3  | **Traps as "a common wrong step".** A disclosure after each correct step, "which row catches it?", and a _Show me_ that applies the error state where the engine can reproduce it (wrong window, half-plane, strip, sheet). Needs the 136 messages rewritten for readers; many are in developer voice.                                                                                                                                                                                                     | S–M  | Große–Renkl 2007; Alemdag 2025                                 |
| A4  | **About 8 predictions at the gallery's surprise points:** drag across a pole (0 / πi·Res / 2πi·Res?); B1 closed downward; D1 in the principal window; D6 (do ±ia add or cancel?); D7 (is 2πi·Res(f,∞) small?, 26.7 against an answer of 1.216); G1's pole order (3); F2's Cornu spiral; the sheet spinner. The prediction panel exists in `drill.ts`.                                                                                                                                                      | S    | Brod 2021/2022; Crouch–Mazur 2004                              |
| A5  | **Textbook bridge:** fix the citations (§4); state editions; aliases in `vocabulary.ts` (n(γ,a) first, "ML-inequality (estimation lemma)", "dumbbell", "half-residue"); rename "Boundary terms"; a per-record "In your textbook" line (e.g. E1 ↔ S–S Ch. 3 §2 Ex. 2; D4 ↔ B–C §83; F2 ↔ S–S Ch. 2 Ex. 1) with a note where the book takes a different route.                                                                                                                                               | S    | textbook audit                                                 |
| A6  | **Prompted comparison:** ask "which row changed?" before the contrast strip reveals it, plus an advanced "two routes, one number" ladder: B2 Jordan vs Ahlfors's rectangle; C1 indentation above vs below; D3 keyhole vs F1 wedge; E1 strip vs D1 keyhole via x = eᵗ; G2 square vs S–S's circle.                                                                                                                                                                                                           | M    | Rittle-Johnson & Star 2007/2009; Schwartz 2011                 |
| A7  | **Adaptive entry:** an optional 4-item placement, "skip to rung iii", and "try first" for non-novices.                                                                                                                                                                                                                                                                                                                                                                                                     | M    | Kalyuga–Sweller 2004; Tetzlaff 2025                            |
| A8  | **A 6–10-student think-aloud pilot before building more.** Include Soto–Oehrtman's "what is accumulated?" prompt, and run A1's prompts on for half the students and off for the other half.                                                                                                                                                                                                                                                                                                                | S    | the design is untested                                         |
| A9  | **Name the accumulator:** one sentence ("each Δz is rotated by arg f and scaled by \|f\|; ∮ is where the trail ends"), and on circles `(1/2πi)∮ f/(z−a)` = the mean of f.                                                                                                                                                                                                                                                                                                                                  | S    | Soto–Oehrtman 2022; Hanke 2024                                 |
| A10 | **Spaced review:** cleared drill tasks come back due at 1/3/7 days with a new fixture. Evidence for maths is modest.                                                                                                                                                                                                                                                                                                                                                                                       | S    | Murray et al. 2025 (caveat)                                    |

**B. UX, accessibility and utility**

| #   | Recommendation                                                                                                                                                                                                                                       | Size |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | **Touch + WCAG 2.5.7:** `touch-action: none`, pinch-zoom, on-stage pan/zoom buttons, editable complex fields with ± nudges for centres and branch points, a bulge field on arcs, a Split tool, an Undo/Redo button pair.                             | M    |
| B2  | **A stacked or drawer layout below 900 px instead of the notice.** This fixes 1.4.4 at 200% zoom and the 900–1150 px collapse (§2.9).                                                                                                                | M    |
| B3  | **Result card clean-up:** one statement of the answer, not 4–5; labels above values; the ∮ value labelled ∮; move the "not a proved error bound" caveat into the numerics disclosure it belongs to.                                                  | S    |
| B4  | **Typeset, simplified formulas.** No `1·cos θ`, `2·π`, `x²+1²`, `x^{0.3−1}`, `2.08e-18i` noise, or decimal poles beside exact residues; fix the uppercase heading; axis tick labels (at least in Textbook mode).                                     | S    |
| B5  | **Colour-blind-safe phase map (CET-CBC1/CBC2) as a toggle**, and forced-colours styles for the segmented controls.                                                                                                                                   | S    |
| B6  | **Screen-reader maths:** let KaTeX's MathML speak rather than duplicating it with a plain label; strip TeX from accessible names; move the stage's instructions (a 425-character name) into a description; an announced trace along the accumulator. | M    |
| B7  | **Copy the argument as LaTeX, plus TikZ for the contour, and a printable worked sheet**, gated by `valueRefusal`. The derivation lines are already LaTeX.                                                                                            | S–M  |
| B8  | **A verdict map along each parameter:** a strip under each slider coloured by the ledger verdict (=, ≤, ≈, refused), with the closed form plotted against the parameter. Mathematica's `GenerateConditions`, made visible. Run it in a worker.       | M    |
| B9  | **Embed/classroom mode** (`?embed=1`, `postMessage` of drill results), a light theme that follows the system (dark UIs wash out on projectors), and offline support via a service worker.                                                            | M    |
| B10 | **Deformation scrubber:** interpolate contour A into B, shade the swept region, and mark each pole crossing with its exact 2πi·n·Res jump. This makes the contrast ladder's first three rungs one scrub.                                             | M    |

**C. Capability** (from the capability survey; citations below)

| #   | Addition                                                                                                                                                                                                                                                       | Size | Plug-in                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **One circle, four uses:** Laurent series, partial fractions, inverse z-transform, Cauchy's formula. `aₙ = (1/2πi)∮ f(z)(z−c)^{−n−1} dz`; the radius picks the annulus or region of convergence.                                                               | S    | an integer parameter `n`; the exact order-(\|n\|+1) residues already exist; a coefficient card; a contrast cell flipping the region of convergence |
| C2  | **Higher-order poles × `e^{iaz}`**, e.g. `∫cos x/(1+x²)² = π/e`, which today is only ≈.                                                                                                                                                                        | S–M  | convolve the principal part with the Taylor series of `e^{iau}` (research 05 §2.2); also unlocks C4's repeated poles                               |
| C3  | **Trigonometric poles in the sandbox** (`tan`, `cot`, `sec`, `csc`, `tanh`, refused today at `kernel/entire.ts:51`) via `w = e^{iz}`.                                                                                                                          | S–M  | clone `expLattice.ts`; windings decided with π brackets; collisions through `mergedResidue`                                                        |
| C4  | **Bromwich / inverse Laplace (poles only).** Causality falls out of which way the contour closes. The most-used contour integral outside pure mathematics.                                                                                                     | M    | vertical-line template; Jordan's lemma rotated by i; `t` in `ExpSum`; cross-checked on a Talbot / Weideman–Trefethen contour                       |
| C5  | **Residue at infinity and cyclotomic sums in the sandbox**, so `1/(z^40+1)` on a large circle reads `0` by one line rather than as a 40-term sum after 3 s.                                                                                                    | S    | the machinery exists for records                                                                                                                   |
| C6  | **Argument principle and Rouché with exact counts**, plus a phase ribbon of arg f(γ) under the accumulator.                                                                                                                                                    | M    | `f′/f` residues are exact integers; Rouché's inequality checked in exact ℚ; promotes `winding.ts` to a shared package and pays PLAN §6.3           |
| C7  | **Principal value at a nonzero real pole; Hilbert / Kramers–Kronig / Sokhotski–Plemelj.** Indenting above vs below differ by exactly 2πi·Res.                                                                                                                  | S–M  | an indentation centred at a parameter; today LEGALITY refuses any off-origin indent                                                                |
| C8  | **Better, then certified, cross-check quadrature.** Gauss–Jacobi (already in `@cas/conformal`) and tanh–sinh on the lips, fixing §1.3's blindness; then exact-ℚ Bernstein-ellipse and trapezoid error bounds so the cross-check earns `≤` for rational f.      | S–M  | Trefethen–Weideman 2014; Johansson 2018                                                                                                            |
| C9  | **Residue sums beyond one quadratic extension.** Galois-orbit trace `Tr(P·Q′⁻¹ mod g)`, Rothstein–Trager, Smith-disc enclosures, or `RootSum` with its condition printed. Fills the declared-but-unused `"enclosure"`/`"rootSum"` rungs (`schema.ts:632-638`). | M    | after ADR-0047 widens `@cas/exact`                                                                                                                 |
| C10 | **AAA poles and residues (`≈`) for transcendental sandbox input**, with argument-principle subdivision so none are missed. Also feeds guess-then-verify and fixes §2.5's empty pole lists.                                                                     | M    | Nakatsukasa–Sète–Trefethen 2018; Bowhay–Nakatsukasa–Zaid 2025                                                                                      |

**Later:** the Hankel contour (1/Γ, ζ(−1) = −1/12 from G1's Bernoulli code, reflection ≡ D1), the Pochhammer contour, Mellin–Barnes, saddle point / steepest descent (which needs a `~` label and an ADR), Riemann sheets under the keyhole via the planned `@cas/monodromy`, and a 3-D |f| landscape with each arc bound as a visible ceiling.

**New records that need no engine work** (the sandbox already gets them exactly):

- `∫dx/(1+x²)³ = 3π/8`
- `∫cos 2x/(x²+2x+2)`
- `∫sin²x/x²` and `∫(cos ax − cos bx)/x²` (by L5)
- `∫e^{ax}/cosh x`
- `∫x^{2m}/(1+x^{2n})`
- `ζ(4)` (a collision of order 5)
- `Σ(−1)ⁿ/(n²+1)`

**Needing engine work:** `∫x/sinh x` (indented strip), `∫log(1+x²)/(1+x²)` (off-origin log), `Σ1/(n²+2)` (irrational poles), and `∫₀^π log sin θ`, a standard example in Ahlfors and Brown–Churchill.

### 6.3 Selected sources

**Pedagogy and learning science**

- Soto & Oehrtman 2022, _JMB_ 66, 100963 — doi:10.1016/j.jmathb.2022.100963
- Hanke 2024, _ZDM_ — doi:10.1007/s11858-024-01610-x
- Hanke 2024, _IJMEST_ — doi:10.1080/0020739X.2024.2304882
- Oehrtman, Soto-Johnson & Hancock 2019, _IJRUME_ 5 — doi:10.1007/s40753-019-00092-7
- Troup 2018, _IJRUME_ 5
- Bisra et al. 2018, _EPR_ 30 — doi:10.1007/s10648-018-9434-x
- Atkinson, Renkl & Merrill 2003, _JEP_ 95 — doi:10.1037/0022-0663.95.4.774
- Aleven & Koedinger 2002, _Cog Sci_ 26
- Berthold, Eysink & Renkl 2009, _Instr Sci_ 37
- Rohrer et al. 2020, _JEP_ 112 — doi:10.1037/edu0000367
- Brunmair & Richter 2019, _Psych Bull_ 145
- Alemdag, Eichelmann & Narciss 2025, _RER_
- Brod, Hasselhorn & Bunge 2018, _L&I_ 55
- Tetzlaff et al. 2025, _L&I_ 98, 102142
- Van der Kleij et al. 2015, _RER_ 85: elaborated feedback .49 vs right/wrong .05. The ledger-row feedback is the right kind; keep it.

**Tools**

- Tao's applets — <https://teorth.github.io/tao-web/applets.html>
- Mathematica `ContourIntegrate` — <https://reference.wolfram.com/language/ref/ContourIntegrate.html>
- Mathematica `ResidueSum` — <https://reference.wolfram.com/language/ref/ResidueSum.html>
- Kambhamettu et al., "Explorable Theorems" (2026) — arXiv:2604.02598 (verified)
- Chebfun keyhole example — <https://www.chebfun.org/examples/complex/KeyholeAblowitzFokas.html>
- cxroots — <https://github.com/rparini/cxroots>
- Arb `acb_calc` — <https://arblib.org/acb_calc.html>

**Algorithms**

- Weideman & Trefethen, _Math. Comp._ 76 (2007)
- Trefethen & Weideman, _SIAM Rev._ 56 (2014)
- Schmelzer & Trefethen, _SINUM_ 45 (2007)
- Johansson, ICMS 2018 — arXiv:1802.07942
- Nakatsukasa, Sète & Trefethen, _SISC_ 40 (2018)
- Bowhay, Nakatsukasa & Zaid 2025 — arXiv:2509.15936
- Johnson & Tucker, _JCAM_ 228 (2009)
- Smith, _J. ACM_ 17 (1970)
- Lazard & Rioboo, _JSC_ 9 (1990)
- Bronstein, _Symbolic Integration I_ (2005)

**Accessibility and colour**

- WCAG 2.2 Understanding 2.5.7 / 2.5.8 / 2.5.3 / 1.4.4 — <https://www.w3.org/WAI/WCAG22/Understanding/>
- Kovesi, "Colour Maps for the Colour Blind" (2017) — <https://colorcet.com>
- web.dev INP — <https://web.dev/articles/inp>

---

## 7. Suggested order of work

1. **Remediation 2, the P0s and correctness P1s.** Each item gets a test that fails without its fix:
   - §1.1 (plus the limit-invariance corpus test), §1.2 (plus the text-vs-value property test), §1.3, §1.4;
   - §2.4, §2.5's CATCH row, §3.6 (a real `reproduces` check);
   - the permalink range-check and caps of §2.6.
2. **The interactions:**
   - §2.1 radius handles, §2.2 reorder, §2.3 sandbox wipe;
   - §2.7 slider snapping;
   - §2.8 touch;
   - §2.9 camera-less links;
   - the draft/undo/focus items of §3.
3. **The worker plus code-splitting** (§5). It removes the whole class of main-thread hangs and most of the INP cost.
4. **Docs:** the launcher card, CLAUDE.md's false paragraphs and counts, the README and STATUS headers, and the citations. Then the owner's decision on the CLAUDE.md restructure.
5. **Pedagogy:**
   - A5 and A3, which are cheap and content-only.
   - Then **decide M7 §0**, since A1 reverses a recorded exclusion.
   - Then A8, the pilot, before A1, A2 and A4.
6. **Capability:** C1, C2, C3 and C5 need no new number ring. Then C4, then C8. Then C6, C9 and C10 once ADR-0047 lands.

**Decisions for the owner:**

- Whether to lift M7 §0's exclusion of self-explanation prompts. The evidence says to, in menu form.
- Whether practice/assessment (A2) is in scope for the app.
- Whether to support tablets properly (B1 + B2) or keep a desktop-only posture. Today it is neither: tablets ≥ 900 px get the full app and cannot drag.
- The CLAUDE.md restructure.
