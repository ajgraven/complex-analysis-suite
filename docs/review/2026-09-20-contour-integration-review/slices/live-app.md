# Live browser pass — apps/contour-integration (port 5181, Chromium 141 / SwiftShader, 1440×900 + 390×844)

Driven with Playwright against `vite` on 5181. Screenshots under
the review session's scratch directory (not carried into the repo).
Raw measurements in the same directory (`records.json`, `psweep2.jsonl`, `clip2.json`, `badges.json`,
`perf2.log`, `hang2.log`, `hang3.log`).

### Findings (ordered by severity)

- **[BUG] An uncaught `patch: two children of <section> share the key 'why'` is thrown on every refusing
  gallery state, leaving the Result card showing the PREVIOUS binding's exact answer beside the new
  refusal — and stopping the permalink, the stage redraw and the stage's text alternative**
  - Where: `src/shell/cards/result.ts:147` (the refusal's `key: "why"`) collides with
    `src/shell/cards/result.ts:313` (the *"No value for the target: …"* note's `key: "why"`); both are
    direct children of `card("result", …)` (`result.ts:317`). Thrown from `src/shell/dom.ts:197`, out of
    `render2` and therefore out of `commit` (`src/shell/app.ts:986`).
  - What: reproduced on **12 distinct parameter states across 7 of the 19 records swept**
    (`psweep2.jsonl`): A1 `a = 0` and `b = 32.9`, B1 `b = 0`, C1/C3 `rho → 1e-6`, D1 `eps = 1`,
    D2 `p = −3.04` / `q = −3.04`, D6 `a = 0` and `eta = 1`. Minimal repro: open
    `#vs=eyJ2IjoxLCJhcHAiOiJjaSIsInN0YXRlIjp7Im0iOiJnIiwiciI6ImNpcmNsZS1saW5lYXItY29zIn19`
    (`circle-linear-cos`), drag the `a` slider to 0. Console:
    `Error: patch: two children of <section> share the key 'why'  at http://localhost:5181/src/shell/dom.ts:99:13`.
    Measured consequences (`repro5.mjs`, shot `shots/06-a1-a0-broken.png`): the headline updates to
    *“The argument is incomplete: the residue theorem does not apply.”* while the two `=`-badged values
    **stay at the previous binding's answer** (at `a = 5 → a = 0` the card kept `= π√6/6`), the check list
    reads *“1 of 1 failed — the contour must avoid every singularity”*, and the `#vs=` hash is left at the
    old binding (`…YSI6NX19fQ` for `a = 5`) because `render2` throws before `scheduleDraw()`,
    `stripView.schedule()` and `syncHash()` run. So the app prints an exact `=` answer for a state whose
    own ledger says the residue theorem does not apply, and hands out a link to a different state.
  - Confidence: CONFIRMED (reproduced 12×, screenshotted, before/after values and hash captured)
  - Fix: give the note its own key (e.g. `key: "solveNote"`); it is only ever rendered when `refused !== null`
    is also possible. A regression test must render a REFUSING gallery state through `patch`, not just
    `render` — see the test gap below.

- **[BUG] `dogbone-two-fractional-powers` (D7) freezes the tab permanently when `mu` is dragged just below
  −1.9, and the slider offers that value**
  - Where: `src/families/instantiate.ts:88-92` — every family parameter gets `range: [-span, span]`,
    `span = max(10, |value|*2)`, so D7's declared constraints (`src/families/records/d7-dogbone-two-fractional-powers.ts:75`:
    `mu > 0`, `mu < 1`, `mu not in Z`) are not reflected in the control at all.
  - What: `hang2.log` / `hang3.log` — at slider stop 400 (`mu = −2`) the recompute paints in 54–61 ms; at
    stop 405 (`mu ≈ −1.9`) **no paint arrives within 45 s**, the renderer sits at 100 % CPU, and
    `page.goto("about:blank")` then times out at 30 s: the tab cannot even be navigated away from.
    Two earlier runs accumulated **13 min 32 s and 2 min 13 s of renderer CPU** on this one state without
    finishing. There is no draft-budget escape: this is not slow, it is wedged.
  - Confidence: CONFIRMED (measured twice, with CPU time and a failed navigation)
  - Fix: derive each slider's range from the record's own `constraints` (and refuse-by-name outside them)
    rather than from `max(10, 2|v|)`; separately, whatever loops in the D7 route at `mu < −1` needs an
    iteration cap that refuses instead of spinning.

- **[BUG] Moving a parameter slider changes the answer but not the Target or Integrand card, so the two
  rails describe different functions**
  - Where: `src/shell/cards/integrand.ts:27` (`at: resolution.golden.params`) and
    `src/shell/cards/target.ts:55-56` (`identityLatex(family, golden)` / `at: golden.params`).
    `resolution.golden` is the fixture's golden, never merged with `state.bindings`
    (`src/shell/state.ts:527`).
  - What: measured on `circle-linear-cos`. At `a = 5` the Result card reads `= π√6/6`
    (= 2π/√(25−1), correct for `a = 5`) while INTEGRAND still typesets `1/(2 + 1·cos θ)` and TARGET still
    prints `∫₀^{2π} dθ/(2 + cos θ) = 2π/√3` — the a = 2 fixture. No console error; the only signal is that
    the Parameters card says `a = 5`. The left rail is labelled *“what is being integrated”*.
  - Confidence: CONFIRMED (three bindings captured side by side)
  - Fix: render both cards at `{...golden.params, ...state.bindings}` (or at the run's `contour.params`).

- **[BUG] The Target card (and on B3 the Result and Derivation cards) overflows the rail horizontally, so
  the record's own identity and — on B3 — its answer are cut off**
  - Where: rail card width is 285 px at 1440×900; `.katex-display` is not constrained. Measured in
    `clip2.json`.
  - What: 6 of 28 records overflow. Worst is `jordan-quartic`: target formula 404 px wide in a 285 px card
    (**143 px past the card edge, right edge at x = 425 with the card ending at x = 294**), and its Result
    card's value is 421 px in a 365 px card, right edge at **x = 1528 in a 1440 px window** — the answer
    `(π√2/4 − πi√2/4)·e^{−√2/2+i√2/2} + (π√2/4 + πi√2/4)·e^{…}` is literally unreadable
    (`shots/clip-jordan-quartic.png`). Also over: `dogbone-two-fractional-powers` (+89 px, the target reads
    `… = π/(2·√2) ·` and stops), `circle-poisson` (+38), `circle-cif-taylor` (+38), `keyhole-two-poles`
    (+39), `series-cot-kernel` (+28). `document.documentElement.scrollWidth` is never > `innerWidth`, so no
    page-level overflow test can see this.
  - Confidence: CONFIRMED (per-element bounding boxes vs card content box, all 28 records)
  - Fix: `overflow-x: auto` (with a visible affordance) or `max-width: 100%` + shrink on the rail's
    `.katex-display`, and a gate assertion comparing each card's content box to its formulas'.

- **[BUG] `jordan-quartic`: the Result card and the Derivation's conclusion disagree about the same number —
  `=` with an exact closed form above, `?` with a bare decimal below**
  - Where: `src/engine/derivation.ts:434-437` — `text: solved.text ?? \`≈ ${solved.value}\`` and
    `level: conclusionVerdict.level` where `conclusionVerdict = assembleVerdict(solved.certificates)`;
    against `src/shell/cards/result.ts:319-328` (`levelOfSolved`).
  - What: swept all 28 (`badges.json`): exactly one mismatch. B3's Result card shows badge `=` and the exact
    exponential-basis form; the derivation's last line is
    `<span class="badge" data-level="?">?</span><span>the integral</span> = <span class="num">≈ 1.5442760096181358</span>`.
    So one surface calls it exact and the other undecided, and the exact form (present in `solved.latex`)
    is dropped because only `solved.text` is consulted.
  - Confidence: CONFIRMED (DOM captured for all 28; 1 mismatch, 1 decimal-only conclusion, both B3)
  - Fix: use the same level the Result card derives, and fall back to `solved.latex` before the decimal.

- **[PERF] A contour drag runs at ~10.7 fps under software rendering: 93.6 ms per pointer move, 2 rAF per
  move**
  - Where: `src/shell/app.ts` `repaint()` (stage + strip + `render2`), driven from `stageController`.
  - What: 60 synthesised moves on the sandbox circle = **5,615 ms total, 93.58 ms/move, 120 rAF (2.00/move)**
    at 1440×900 under SwiftShader (`perf2.log`). Recompute cost for a parameter move: sync median
    8.8 ms (F2) / 11.2 ms (A6) / 12.7 ms (D5) / 65.1 ms (A1) / 72.1 ms (G2), sync **max 247 ms** on G2.
    Two rAF per move is the stage draw and the strip draw scheduled separately — each coalesces on its own,
    so they cannot share a frame.
  - Confidence: CONFIRMED (measured; SwiftShader is the worst case, real GPU will be better)
  - Fix: one shared coalescer for the stage and the strip would halve the callbacks; the >60 ms records
    are engine cost, not draw cost.

- **[TEST-GAP] No node test renders a REFUSING gallery state through `patch`, which is why the duplicate-key
  throw shipped**
  - Where: `test/cards.test.ts:930` (*“gives each card EXACTLY ONE heading”*, all records at the default
    binding) and `test/cards.test.ts:950` (*“renders all 28 records at fixture 0 with no throw”*).
  - What: both iterate `RECORD_IDS` at fixture 0 with no `bindings`, i.e. only states where the argument
    closes. The duplicate key is reachable only where `integralRefusal(...) !== null` **and**
    `resolution.note !== null` **and** `solved === null` — a combination no test constructs. The comment at
    `test/cards.test.ts:932` says `patch` refusing a duplicate key is now the guard; the guard exists and
    nothing exercises it on a refusing state.
  - Confidence: CONFIRMED (read + reproduced in the browser)
  - Fix: add the 12 measured `(record, param)` refusing states — or one per constraint class — to the
    `patch`-through test.

- **[IDEA] A refused argument still prints `≈ 6.283i` in the Numerics block, which `result.ts`'s own comment
  says must not happen**
  - Where: `src/shell/cards/result.ts:127` (*“No number. Not a greyed-out number, not a number with a
    warning beside it — none.”*) vs the Numerics disclosure, which opens by default when the value was
    refused (`result.ts:299-305`).
  - What: sandbox keyhole, `z^(−0.5)/(1+z)` declared, determination switched to principal: the card reads
    `⚠ Refused — the R → ∞ circle crosses the cut Γ with no side assigned`, prints no `∮`, and then opens
    Numerics showing `≈ 6.283i` (`shots/s2-win-arg__________.png`). It is badged `≈` and under a heading, so
    it is not dishonest — but it is the number a reader will take away.
  - Confidence: CONFIRMED (screenshot)

- **[IDEA] Escape does nothing on the stage once something is grabbed**
  - Where: `src/shell/stageController.ts:881-901` — `onKeyDown` handles Backspace/Escape/Enter **only while
    the pen is out**; with a handle grabbed the only way back to panning is to press Enter through the whole
    cycle.
  - What: measured — Enter cycles `whole contour → circle handle → pan the view`; Escape after a grab leaves
    the live region still saying *“Arrow keys now move the whole contour.”* The stage's own instructions
    (`STAGE_KEYS`, `app.ts:104`) never say how to let go.
  - Confidence: CONFIRMED

- **[IDEA] A refusal sentence reads ungrammatically: “This link names a fixture that worked example does not have.”**
  - Where: `src/shell/errors.ts` (the `linkRefusal` sentence for an out-of-range fixture).
  - What: reproduced with `#vs=` carrying `f: 99`. The other seven refusals I exercised all read cleanly
    (bad record, truncated, foreign app, unknown template, non-finite view, unknown task, stage 9).
  - Confidence: CONFIRMED

- **[IDEA] `favicon.ico` 404s on every page load** — the one console error in every state I visited
  (`http://localhost:5181/favicon.ico`, 404). `index.html` declares no icon.
  Confidence: CONFIRMED.

- **[IDEA] “0 vertexes” / “4 vertexes”** in the pen card (`src/shell/cards/contour.ts:188`). The app is
  otherwise careful about textbook vocabulary; the usual plural is *vertices*. Confidence: CONFIRMED.

- **[IDEA] Pasting a new `#vs=` into the address bar of an open tab does nothing** — deliberate (`app.ts`:
  *“deliberately not a live `hashchange` listener”*), and correct for the reason given, but from a reader's
  side a pasted link silently shows the old state until they reload. A one-line `hashchange` that offers a
  reload would close it. Confidence: CONFIRMED (every `page.goto(BASE + newHash)` without a document change
  left the previous state on screen — it cost me two rebuilt harnesses).

### Checked and found sound

- All **28 records open from the front door**, all 8 group cards expand, every record's headline reads
  *“The argument is complete.”*, every badge is `=`, and **every permalink round-trips**: reload the
  address-bar hash in a fresh page and the closed form, the badges and the full ledger-row text are
  identical (`records.json`, 28/28 on headline, values, rows and hash).
- Zero uncaught exceptions and zero console warnings in all 28 record loads; the only console error anywhere
  is the favicon 404.
- The **stepper** on every record: dots equal the step count, `next` disables at the last step and `prev` at
  the first, and a full forward-and-back walk leaves the Result card byte-identical.
- **Fixture switching** (2–6 per record) recomputes with no error; the `#vs=` hash follows.
- **Sandbox**: all ten templates build and solve with no error (circle 1 piece, semicircle 2, indented 4,
  rectangle 4, strip 4, wedge 3, square 4, keyhole 4, dogbone 4).
- **M5.1c flow**, live: type `z^(-0.5)/(1+z)` on a keyhole → Declare → switch the determination to
  `arg ∈ [−π, π)` → the card **refuses by name** (*“the `R → ∞` circle crosses the cut `Γ` with no side
  assigned”*, with the repair) and prints **no `∮`**; the split check reports the cofactor mismatch with a
  relative figure. The cut carries its `J = 1/2` jump label on the stage.
- **Drag across a pole**: calibrated from the app's own hover readout, dragging the circle up by 1 takes
  `Ind(γ, +i) = 1, Ind(γ, −i) = 0` and the value from `= 0` to `= π` (`shots/s3-drag.png`) — the browser-pass
  measurement reproduced.
- **The pen**: 4 clicks + click-the-first-vertex closes to 4 pieces and `∮` is established exactly; the
  drawn contour encodes to a 298 B link (no refusal).
- **Piece-list editing**: delete / insert / move / reverse all behave as `engine/contour/edit.ts` specifies
  (a deletion on a closed rectangle rejoins, so 4 pieces stay 4 with a `straight join 1` — correct, not a
  no-op), and **Ctrl+Z / Ctrl+Shift+Z** walk the history correctly (4 undos reach the cold-start circle, redo
  returns the rectangle).
- **Four stage modes**, **modulus contours** and **Show step** all toggle with no error.
- **The drill**, both `rational` and `oscillatory`, all four rungs: rung ii masks the derivation, rung iii
  masks the Result *and* the Contour card, rung iv is the sandbox twin; a deliberately wrong rung-ii answer
  grades *“not all correct; the established statement is shown under each piece”* with the ledger's own row
  as feedback; the grading is cleared on moving to rung iii (M7.4's fix holds). **Every rung round-trips
  through its own permalink** — reloading each of the four hashes reproduces the masked screen exactly.
- **The contrast ladder**: all five cells open, each applies its state with no error, and C1 correctly prints
  the record's answer `π/2` beside `∮ = 0`.
- **Figure export**: all three plates on two records download and parse —
  `1552×2128`, dark 1.55 MB / light 0.96 MB / print 0.11 MB, carrying
  `iTXt:Software`, `tEXt:cas:state` (the full permalink), `tEXt:cas:verdict`, `iTXt:cas:value`,
  `tEXt:cas:theme`. The per-entry `tEXt`/`iTXt` choice is visible in the bytes (the em-dash and `√` payloads
  are `iTXt`). **Copy figure** reports `= Figure copied.`
- **Accessibility tree over CDP** (the instrument, not a DOM walk): landing 33 interactive / **0 unnamed**,
  sandbox 73 / 0, D7 38 / 0, front door 19 / 0, contrast ladder 39 / 0. One `<main>`, one `<h1>`, two named
  complementary landmarks, `h2` per card everywhere.
- **Keyboard**: 43 tab stops from the top, every one named. Focus **survives a recompute** (focused
  *Fit contour*, moved a slider, still focused). A focused slider keeps focus across 10 ArrowRight presses.
  Stage Enter cycles the grab with a named announcement at each stop; arrows and +/− raise no error.
- **Link refusals**: all eight malformed/`#vs=` cases refuse by name in a `role="alert"` box and fall back to
  the starting state (unknown record, truncated, foreign app, out-of-range fixture, unknown template,
  non-finite camera, unknown drill task, out-of-range drill stage).
- **390×844**: no horizontal overflow (`scrollWidth 390 = innerWidth`); `main.shell2` is `display: none` and
  the phone notice shows, carrying the live permalink when one exists (verified: a record link is shown in
  full in the notice's code box).
- **No heap leak**: switching through all 28 records twice through the front door gives 17.44 MB → 15.31 MB
  after GC (−12.2 %).

### Not covered

- The last 9 records of the parameter sweep (`strip-*`, `gaussian-*`, `wedge-*`, `series-*`) — the sweep was
  stopped at `dogbone-two-fractional-powers` because of the D7 freeze. The duplicate-key defect is already
  established on 7 records; the remaining 9 may add more states.
- Real-GPU checks the browser-pass doc reserves for hardware (hue continuity at a branch cut, mode-switch
  frame leaks, drag smoothness at 60 Hz) — SwiftShader only here.
- Safari / Firefox (`ClipboardItem` promise form, WebGL2 fatal boundary) — not installed.
- The limit-step **sweep** controls (Play / Step / the checkpoint table) and the Shift-drag piece division
  were not exercised.
- `axe` was not run; only the accessibility tree and structural invariants.
