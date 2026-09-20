# M8 — shell parity

The old shell's three jsdom specs against the new one, behaviour by behaviour — and, from step
1.12, the review's own list of what the old shell could do.

Started at **step 1.7**, whose gate is exactly this table: *every* behaviour test from
`test/shell.test.ts`, `test/pen.test.ts` and `test/drillShell.test.ts` has a counterpart passing
against `src/shell2/`. It is kept current through step 1.12, where the old shell and its three
specs are deleted — at which point a row with no counterpart is a behaviour about to be lost, and
this file is the only place that would say so.

**What a row means.** A counterpart is not a transcription. The old specs query by card position and
by class, which plan §4's rule from the review forbids; every ported test is re-expressed by role, accessible
name, `data-testid` or `data-card`, and several assert something the old one could not. Where the
behaviour itself moved — a bar button that failed on press becoming a card that refuses before it is
pressed — the notes say so rather than pretending the assertion is the same.

**A gap is a row, not an omission.** Three behaviours could not be expressed against shell2 when this
file was written, each because a surface they drive arrived at a later step. They were listed with
their step, and the step that built the surface re-ported them. All three are now closed: **the
stage's two generated-description rows at step 1.9**, where `describeStage` was ported, and the pen's
at 1.8 — that one by SUBTRACTION rather than by a new test, for the reason its row gives. The §1–§2
sweep below opens four more, each with the step that closes it or the reason there is none.

---

## `test/shell.test.ts` — 35 behaviours

### the argument window

| old (line, name) | new | notes |
|---|---|---|
| 88 `keeps the declared factor when the determination changes` | `shell2State.test.ts` › same name | Driven through the real controls by accessible name rather than `.rail .presets` by position. The old shell's `rational cofactor R(z)` label is shell2's `cofactor R(z)`. |
| 105 `moves the cut, so LEGALITY refuses and no ∮ is printed` | `shell2State.test.ts` › same name | Asserts on `"Refused"`, the Result card's own word — the badge is a separate `<span>` now, so the old `"⚠ Refused"` string no longer exists as one node. |

### applyState(currentState()) is a fixed point

| old (line, name) | new | notes |
|---|---|---|
| 165 `for all 28 gallery records at their primary fixture` | `shell2State.test.ts` › same name | A record is opened with `applyState({mode:"gallery", record, fixture})` rather than the source toggle plus a `<select>`: the front door is step 1.8, and opening a record IS applying a state. |
| 199 `restores a state the app is NOT in — both directions, every field` | `shell2State.test.ts` › same name | M6.1's shape preserved exactly — two unlike states, both directions, every field differing. `workedExample` joins the differing set, since the mode is derived from it. The contour half is re-expressed: see **the parked handle**, below. |
| 293 `and carries the VIEW, which no number may depend on` | `shell2State.test.ts` › same name | Same. |

### the round trip is not vacuous

| old (line, name) | new | notes |
|---|---|---|
| 311 `the declaration decides the integrand, so dropping it changes the answer` | `shell2State.test.ts` › same name | Same, plus an assertion the old test could not make: the box's accessible name goes back to `integrand f(z)`, with the typed source in it. |
| 323 `the sheet decides the value — M5.1d's e^(2πisα), through the shell` | `shell2State.test.ts` › same name | Same. |
| 334 `a family binding decides a record's numbers, so a moved one shows` | `shell2State.test.ts` › same name | Same. |

### the `#vs=` permalink

| old (line, name) | new | notes |
|---|---|---|
| 364 `opens the state a link names, not the app's defaults` | `shell2State.test.ts` › same name | Against the boot read. The refusal element is `.linkRefusal`. |
| 383 `opens a sandbox link carrying a declared factor and a sheet offset` | `shell2State.test.ts` › same name | Same. |
| 397 `SHOWS a refusal and keeps its own starting state` | `shell2State.test.ts` › same name | Same. The banner now lives OUTSIDE `<main>`, so the reason the comparison is on the state rather than the screen is that the box is part of the page rather than part of the rail. |
| 416 `says nothing at all when there is no link` | `shell2State.test.ts` › same name | Same. |
| 421 `writes the address bar on settle, and the result reopens the same state` | `shell2State.test.ts` › same name | Same, plus one `requestAnimationFrame` before reading the reopened app — the strip's draw is coalesced, so two shells in the same state do not agree in the same task. |
| 435 `the URL carries the FRAMED camera, not the one the record replaced` | `shell2State.test.ts` › `the URL carries the camera the state is actually showing` | Renamed, because the old name describes a bug whose CAUSE no longer exists: `commit` is `syncHash`'s only caller and a link deliberately does not refit, so there is no reframe after the write. M6.2's measurement (`halfHeight 1.2` in the bar against 4.8 on screen) is kept in the comment. |
| 453 `uses replaceState, so a session leaves ONE history entry` | `shell2State.test.ts` › same name | Same, including decoding the hash to check the coalesced write landed on the LAST change. |
| 470 `the copy control says WHY when a state cannot be linked to` | `shell2State.test.ts` › `the Share card says WHY a state cannot be linked to, BEFORE the control is pressed` | The BEHAVIOUR moved (step 1.5b): whether a state can be linked to is a property of the state, so the card asks `encodeShell` on every render and disables the control, instead of a bar button that failed on press into a note that emptied itself six seconds later. |
| 482 `but a DRAWN contour does get a link` | `shell2State.test.ts` › same name | The encode → decode → `sameShape` half is unchanged. |
| — | `shell2State.test.ts` › `marks the hash dirty for a VIEW-ONLY change — the three the old shell forgot` | **New.** Scrub, iso and contrast, decoded back out of the address bar. The old shell called `syncHash` from five places and forgot these three; `commit` is the only caller now, so the property is structural. |
| — | `shell2State.test.ts` › `clears the arrival refusal once the reader has acted — by EITHER route` | **New**, from a defect this step found: the banner was written where the field was set, so `applyState` nulled `linkRefusal` and left the sentence on screen. |

### the page's structure

| old (line, name) | new | notes |
|---|---|---|
| 512 `has exactly one <main> and exactly one <h1>` | `shell2.test.ts` › `has exactly one <main> and exactly one <h1> above the cards' <h2>s` | Ported at step 1.1, so it held from the new shell's first commit rather than being fixed at the end of Phase 1. |
| 521 `puts the suite nav BEFORE <main>, so it reads where it draws` | `shell2.test.ts` › same name | Ported at step 1.1. |
| 532 `names every canvas, or hides it explicitly` | `shell2.test.ts` › same name | Ported at step 1.1. |
| 549 `DERIVES both canvas descriptions from the ledger, and keeps them current` | `shell2.test.ts` › `DERIVES the stage's description from the ledger, and keeps it current` (**closed at 1.9**) | The strip's half was already generated (`strip.ts`'s `describe`); the stage's is now `stageView.ts`'s exported `describeStage`, refreshed from `render2` on every recompute. Re-expressed by opening the record through `applyState` rather than through the old shell's source toggle, which shell2 does not have. It gained a clause the old one could not have: the description names **what the backdrop is**, differently in each of the four stage modes — because the old shell's keyboard preamble opened by claiming "the integrand's phase portrait with the contour drawn over it", which on the textbook plate describes a picture nobody is showing. |
| 572 `counts a pole's winding only where it was DECIDED` | `shell2.test.ts` › same name (**closed at 1.9**) | Ported verbatim in substance, including the shift by the circle's OWN radius — a hardcoded 1 merely encloses the pole at any other R and the test passes for the wrong reason, which the old shell measured happening. |
| 597 `reports the accumulator's REAL step count, not a placeholder` | `shell2Page.test.ts` › same name | Same regex. `canvas.accCanvas` → `canvas.acc`, and the read awaits a frame, because the strip's name is written in `drawNow` and `schedule` coalesces. |

### the contrast grid

> **⚠ Re-ported 2026-09-20 against the shipped tests.** This section was written at step 3.1, when
> the ladder was a centred **modal dialog** and its tests were named for one. **Step 3.5 replaced it
> with an inline strip** — `contrasts.ts` renders `<section class="ladder2">` inside `main.shell2`,
> `bar.ts:236` sets `aria-expanded`, and `test/contrasts.test.ts`'s fifteen tests are all named
> `the contrast strip — …`. Six counterpart names the table below claimed (`moves focus INTO the
> dialog on open…`, `draws the five columns and a row for every ledger row`, `gives EVERY header cell
> a non-empty accessible name, the corner included`, `names every status in text, not in a glyph
> alone`, `marks the DECLARED difference apart from a mere rewording`, `closes on Escape`) do not
> exist in any file. The `new` column is corrected below; the `old` column is the pre-M8 shell and is
> left as it was.

| old (line, name) | new | notes |
|---|---|---|
| 622 `is closed at boot, and costs nothing until it is opened` | `shell2Page.test.ts` › `is closed at boot, and costs the stage nothing until it is opened` + `contrasts.test.ts` › `draws NOTHING while the ladder is shut, so the stage keeps its height` + `pays no SOLVE while it is shut, and pays it exactly once when it opens` | STRENGTHENED: the old shell laid a `hidden` `<section>` over the page, so the old test could only say "hidden, and no `<table>` in it". shell2 mounts the dialog's DOM on first open, so the assertion is that no `[role="dialog"]` and no `.contrastBackdrop` exist at all — and the "not built" half is then asserted positively, by a `<table>` appearing on the first open. |
| 631 `opens on the button, and says so to a screen reader` | `bar.test.ts` › `opens the contrasts panel rather than toggling it` + `shell2Page.test.ts` › `is a DISCLOSURE: the same control puts it away again` | **Corrected 2026-09-20.** The note here said *"`aria-expanded` is deliberately gone: the control opens a MODAL"* — step 3.5 made the ladder an inline strip, so `aria-expanded` is back (`bar.ts:236`, from `session.contrastsOpen`) and there is no dialog to move focus into. |
| 641 `draws five columns and every ledger row, each cell named for a screen reader` | `contrasts.test.ts` › `draws one card per cell, in CONTRAST_CELLS order, each addressable by its own id` + `names each card by the cell's SPOKEN twin, never by its LaTeX` + `stamps the case that does NOT close with ⚠ and the constraint it failed at` | **Corrected 2026-09-20.** Step 3.5 replaced the five-column TABLE with five cards, so there are no header cells and no corner cell; the three named table tests do not exist. What survived is the five cells in declared order, each named in speech rather than in LaTeX, and each status in text. |
| 665 `prints C1's ANSWER, π/2 — not the 0 its ∮ evaluates to` | `shell2Page.test.ts` › same name + `contrasts.test.ts` › `prints the record's ANSWER, so the indented case reads π/2 and not the 0 its ∮ evaluates to` | Same five-element array and the same `constraintLabel("KILL")`. The `.cellAnswer` class is gone, so the answer line is read off the card's own shapes. *(Corrected 2026-09-20: this named `columnHead`, which step 3.5 replaced with `caseCard` — `contrasts.ts:96`.)* |
| 678 `marks the declared row as changed, and a rewording as merely reworded` | `contrasts.test.ts` › `names the ONE row that changed and what it did, on each of the three single-row steps` + `declares 0, 1, 1, 1 and 5 rows — the counts as literals, not as whatever `changesAt` returns` + `shell2Page.test.ts` › `marks the row the LAST case names, which is not the row the first one does` | **Corrected 2026-09-20.** The declared/reworded distinction is now stated in WORDS per card rather than as a `td` class, so the cell-attribute assertion has no successor and the named tests do not exist. The literal-counts test is what pins the declaration against `changesAt`. |
| 688 `OPENS a cell into the app, which is the only thing the grid does to the state` | `contrasts.test.ts` › `asks to open the card that was pressed, by id, and asks for nothing else` + `shell2Page.test.ts` › `STAYS UP over the state it applies, and marks the case that is showing` + `does nothing at all for an id that is not a case` | `contrasts.test.ts` asserts which state the button ASKS for against a stub; the page tests assert the app arrives in it, which a stub cannot reach. **Corrected 2026-09-20**: the page-side name was given as `…the only thing the ladder does to the state`, which no file carries — a strip that stays up is a different claim from a modal that closes behind the reader. |
| 702 `opens the WRONG-WAY cell into the sandbox` | `shell2Page.test.ts` › `opens the WRONG-WAY case into the sandbox, since no record can be closed wrongly` | Same three assertions, through the mounted app. |
| 715 `closes on Escape and gives focus back` | `contrasts.test.ts` › `offers a Close that asks the SHELL to shut, rather than removing itself` + `shell2Page.test.ts` › `is a DISCLOSURE: the same control puts it away again` | **Corrected 2026-09-20.** Escape is a MODAL's affordance; step 3.5's strip closes by its own Close or by the bar's disclosure control, and neither named Escape test exists. What survived is the part that mattered — the panel asks the shell to shut rather than removing itself, so the bar and the strip cannot disagree about whether it is up. |
| 725 `leaves M6.4's structure intact — still one <main> and one <h1>` | `shell2Page.test.ts` › `leaves M6.4's structure intact — one <main>, one <h1>, and the ladder INSIDE the landmark` | **Corrected 2026-09-20**, and the added clause is the exact opposite of what this row claimed: step 3.1 mounted the dialog OUTSIDE `main.shell2` because `inert` is not defeasible from CSS, and step 3.5's strip is INSIDE the landmark — a strip makes nothing inert, and content about the argument on screen belongs in the page's main content. |

### the rail's vocabulary

| old (line, name) | new | notes |
|---|---|---|
| 736 `tags a contour piece with its role's NAME` | `shell2Page.test.ts` › same name | Selector `.pieces li .tag` → `[data-card="contour"] .pieces2 > li .tag`. |
| 746 `tags a record's pieces with their roles' names too` | `shell2Page.test.ts` › same name | Same. |
| 757 `heads each ledger row with the group's label` | `shell2Page.test.ts` › same name | Same four-id sweep; `.ledgerRow .constraint` → `.ledgerRow .tag`. |

---

## `test/pen.test.ts` — the 14 behaviours that mount the app

The file's first 24 tests exercise `engine/contour/pen.ts` and `shell/viewState.ts` directly — pure
model and codec, no shell — and are unaffected by the rebuild. Only the mounted half is listed.

| old (line, name) | new | notes |
|---|---|---|
| 484 `offers the pen only in the SANDBOX, since a record's contour is the record's` | `cards.test.ts` › `offers no template picker and no pen under a RECORD` | — |
| 493 `shows the GRAMMAR while drawing` | `shell2Page.test.ts` › same name | Same four grammar phrases and three control names. **This test failed on a real defect** — see below. |
| 508 `counts vertices as they are placed, and Undo removes ONE` | `shell2Page.test.ts` › same name | `shell2.test.ts` covers the session's count; what was unowned is the count the CARD prints and the Undo BUTTON. |
| 522 `will not CLOSE a path that is not one — two vertices is not a contour` | `shell2.test.ts` › `WILL NOT CLOSE on two vertices` + `cards.test.ts` › `shows the PEN's grammar while it is out, and its vertex count` | Split across the controller and the card. |
| 534 `ABANDONS on Cancel, leaving the contour that was there` | `shell2Page.test.ts` › same name | `shell2.test.ts` covers the Escape route; the Cancel BUTTON had no owner. |
| 546 `ADOPTS the drawn path as the contour, with no recipe` | `shell2.test.ts` › `Enter commits a drawn path, and the drawn contour has NO recipe` + `cards.test.ts` › `names a HAND-DRAWN contour as drawn` | — |
| 563 `DRAG BOWS the piece into an arc` | `shell2.test.ts` › `BOWS the piece that ENDS at the new vertex, not the one leaving it` | — |
| 598 `ENTER closes the path, and ESCAPE abandons it` | `shell2.test.ts` › `Enter commits a drawn path…` + `Escape keeps the contour that was already there` | — |
| 621 `does NOT rebuild the card on a move that changes nothing` | `shell2Page.test.ts` › same name | The finding is kept and re-argued: the keyed builder is what makes it true now, rather than a `snapped.why !== penSnap` guard, so the assertion is on FOCUS. At a real 900 × 600 stage the tolerance is 11 screen px rather than 44 world units, and the absence of a snap is asserted rather than assumed. |
| 646 `REFUSES to commit a path of ONE` | `shell2.test.ts` › `will not commit a path of ONE vertex` | — |
| 662 `BACKSPACE removes one vertex, as the button does` | `shell2.test.ts` › `places a vertex per click and Backspace takes one back` | — |
| 672 `is PUT AWAY when the sandbox is left` | `shell2.test.ts` › `is PUT AWAY by applyState — M7.4's defect, at the door` (**closed at 1.8**) | Closed by SUBTRACTION rather than by a second test, which is the honest description. The old test leaves the sandbox by clicking `Gallery` on the source toggle; shell2 has no such control, and `mode: "gallery"` is written in exactly ONE place (`frontDoor.ts:113`), whose `apply` is `applyStateNow` — so leaving the sandbox and applying a state are one door, and that door is what the test drives. What nothing drives is that door with a path half-drawn; the assertion would be the one already written. |
| 700 `and by a RESTORED state, which is the same defect through applyState` | `shell2.test.ts` › `is PUT AWAY by applyState — M7.4's defect, at the door` | — |
| 715 `and the adopted contour gets a LINK` | `shell2Page.test.ts` › same name | The path is drawn and adopted through `app.stage()`, which is `shell2.test.ts`'s idiom; `contourSource === null` is asserted first, so the link is known to be minted from the vertices rather than from a recipe. |

---

## `test/drillShell.test.ts` — 19 behaviours

`drillPanel` = `test/drillPanel.test.ts`, which renders the card against a synthetic context;
`shell2Drill` = `test/shell2Drill.test.ts`, which mounts the app. Where both appear, the first pins
what the card decides and the second that the page acts on it — which is not pedantry here: at the
start of this step `drillMask` was computed and read by nothing, and every card-level assertion
about it passed.

### the drill's own surface

| old (line, name) | new | notes |
|---|---|---|
| 67 `offers the four tasks, each at the rung it has reached` | `shell2Drill.test.ts` › same name | The BEHAVIOUR moved: the old shell raised the list from a button named *practise choosing a contour, with less given each time*; it is the bar's `Drill` segment now, and the list is the drill card's own top slot. One assertion the old test could not make — pressing Drill does NOT enter the drill, because the chooser is `session.drillPicker` and `shellMode` says Drill when a RUNG is open. |
| 78 `opens a task on its RECORD, with the drill card above everything` | `shell2Drill.test.ts` › `…with the drill card FIRST in the right rail` | Renamed: "above everything" described the old full-screen overlay. Opened through the chooser's own `Open` button rather than `applyState`, so the reader's path is what is tested, and "first" is `rail2.right`'s `firstElementChild` — a drill card under the Result card would put the rung's question below its answer. |

### rung ii — the KILL column is MASKED, and comes back

| old (line, name) | new | notes |
|---|---|---|
| 100 `takes the KILL rows off the ledger and hides the derivation` | `shell2Drill.test.ts` › `…and folds the derivation` | The shell-level half `drillPanel` cannot reach. Rows are counted by `constraintLabel`, not by the `KILL` data key; the derivation is a card that says "Masked" rather than a `hidden` section. The return half is asserted on a Check with ANY answers, since `drillMask` reads `drillGraded` and not correctness. |
| 117 `asks one question per piece, and grades it against the LEDGER's row` | `drillPanel` › `asks one question per PIECE, in the ledger's own order` + `does NOT give a constant answer full marks — 5 of 10 across the four tasks` + `clears the rung when every piece is right, and not when one is wrong` | Split into three stronger claims: M7.3's 5-of-10 measurement is asserted, rather than one task's answers being ticked. |
| 140 `marks a wrong answer with the ledger's own claim, and does not clear the rung` | `drillPanel` › `answers a WRONG pick with the ledger's own row, and only there` + `locks the sheet once graded, and 'Try again' unlocks it` + `clears the rung when every piece is right…` | The expected prose AND its LaTeX are derived from `questions[1].row.claim` instead of transcribed, and the feedback is addressed by `data-feedback` rather than by a class. |

### rung iii — the whole argument is masked

| old (line, name) | new | notes |
|---|---|---|
| 175 `masks the ledger, the value AND the contour — the record's contour IS the answer` | `shell2Drill.test.ts` › `masks the ledger, the derivation AND the value` (DOM half) + `shell2.browser.test.ts` › `takes the CONTOUR off at rung iii, and the phase portrait stays` | Split, because jsdom has no canvas. The DOM half is zero ledger rows and a Result card reading "Masked", with the derivation joining it — which the old test asserted one rung earlier only. The CONTOUR half is `stageView`'s empty piece list and belongs to the browser suite; `drillInk.browser.test.ts` made the same claim against `src/shell/` and was expected to go with it — at 1.12 it was ported onto `mountShell2` instead, so the claim is now made twice. Measured: 6384 ink pixels at rung i, 6384 at rung ii — the contour is GIVEN there — and 344 at rung iii, the axes alone, with the phase portrait untouched because the integrand is the question. |
| 195 `a WRONG pick fails by the ledger's own reason, and does not clear the rung` | `drillPanel` › `judges a pick by the LEDGER, and the same template is right in one task and wrong in another` + `clears the rung on a pick that ANSWERS` + `stops masking at rung iii once the reader's OWN contour is on screen` | Strengthened: the same template being right in one task and wrong in another pins that the card reads `menuVerdict` rather than comparing against `task.intended`. |
| 215 `the RIGHT pick says so and clears the rung` | `drillPanel` › the same two | — |
| 223 `the circle CLOSES and is still refused — COVER, not KILL` | `drillPanel` › `says COVER's refusal for the circle, which CLOSES` | — |

### rung iv — a drawn contour

| old (line, name) | new | notes |
|---|---|---|
| 238 `opens the sandbox on the record's integrand, with the pen available` | `shell2Drill.test.ts` › `lands on the record's twin with the pen on offer, and masks nothing` | `drillPanel` › `opens rung iv in the SANDBOX on the record's own integrand` asserts the state the card ASKS for; this asserts the app is IN it — the pen lives in the Contour card, which offers it in the sandbox only, so the two facts meet nowhere else. Plus the mask's fourth case: nothing is hidden at rung iv. |
| 252 `checks the ENCLOSURE against the worked contour's own windings` | `drillPanel` › `refuses a contour that encloses BOTH poles where the task wants one` + `refuses a loop of the wrong SIGN` + `clears the rung only on a check that passes` | The SIGN case is new to the port — a reversed upper semicircle, which the old test never built. |
| 272 `says there is NOTHING to check where there is nothing — C1 encloses no pole` | `drillPanel` › `offers NO check where there is nothing to check, and says why` | — |

### a rung opened by LINK — M7's gate clause 2

| old (line, name) | new | notes |
|---|---|---|
| 300 `opens MASKED, which is the half drill.test.ts cannot see` | `shell2Drill.test.ts` › same name | Both masked rungs in one test: rung ii arriving with the KILL rows already off, rung iii with the Result card masked and no rows at all. Line 318's rung-iii-by-link half folds in here, being the same claim about the arrival render. |
| 318 `opens rung iii masked too, and an UNKNOWN rung refuses without opening the drill` | `shell2Drill.test.ts` › `opens MASKED…` + `REFUSES an unknown rung without opening the drill` | Split, because the old test carried two unrelated claims. The refusal element is `.linkRefusal`, outside `<main>`. One assertion added: the CHOOSER does not take the card's place either — a refusal is not an invitation. |
| 336 `every rung of every task opens without an error` | `shell2Drill.test.ts` › `opens every rung of every task without refusing — the roster the gate names` | Same roster (4 × 4), plus that each card actually says `rung N of 4`: the old test checked only that no refusal appeared, which a card that never rendered would also satisfy. |

### the fade

| old (line, name) | new | notes |
|---|---|---|
| 350 `offers the next rung once one is cleared, and survives a remount` | `shell2Drill.test.ts` › same name | The row is found by its Open button's accessible-name PREFIX rather than by a substring of the card's text: `forced-downward`'s label EXTENDS `oscillatory`'s, so a substring match takes whichever row comes first. Also asserts the button's own name says rung 2 — the half a screen reader is given. |
| 367 `ignores a GARBAGE store rather than un-fading or throwing` | `shell2Drill.test.ts` › same name | Reachable through the chooser now. One assertion added: a rung cleared afterwards REPLACES the payload rather than being written beside it, since `clearRung` reads then writes. |
| 380 `does not carry a GRADING into another rung, however the rung changes` | `shell2Drill.test.ts` › same name | M7.4's finding kept verbatim, re-expressed on the session: `drillGraded` and `drillAnswers` are fields `resetTransient` clears, so the assertion is on `app.session()` as well as on the screen, and the consequence is asserted — the derivation is still masked at rung iii. |
| 409 `LEAVES the drill on request, unmasking everything` | `shell2Drill.test.ts` › same name | Leaving goes through `setMode("explore")`, the card's one exit. "Unmasking everything" is non-vacuous because the test first asserts the page IS masked. Adds that the chooser does not reappear in the card's place. |

---

## `review-inputs/shell-review.md` §1–§2 — the capability sweep

Step 1.12's other half. §1 says what the old shell DOES and which of its parts are worth keeping;
§2 lists the eighteen things it does badly or not at all. A row means here what it means above — the
shell2 code and the test that pins it, a drop with its reason, or a gap with the step that closes it
— except that a §1 row is a capability rather than an assertion, so the middle column names where it
lives now and the test is what would notice its absence.

**Two of the plan's three expected drops are not drops**, checked rather than taken on trust: the
three redundant pole listings are two merged into one card and a third KEPT where the engine puts it,
and of the two full-screen overlays one became a rail card and the other a centred modal dialog. The
phone and tablet layouts are the one real drop, and they have a replacement. All three are below the
tables.

### §1 — what the old shell does, and where it does it now

| capability (§1) | new | notes |
|---|---|---|
| `mountApp` is one closure of 3,886 lines — state, DOM, renderers, gestures, pen, drill, codec glue and figure export inside it | `render(state, resolution, session, actions)` in `render.ts`, a module per card beside it, `app.ts` at 927 lines | `shell2.test.ts` › `re-renders through one door, keeping the card nodes it already built`. The payoff is not the line count: a card is a pure function, so `cards.test.ts`, `bar.test.ts` and `drillPanel.test.ts` render one against a synthetic context, which is the thing one closure made impossible. |
| ~60 module-level `let`s, written by three separate doors (`applyState`, the gesture routes, ~20 inline handlers) | `ShellState` (the shareable half) + `Session` (`session.ts`, the transient half), written by ONE door — `commit(next, why)` | `shell2.test.ts` › `clears what a restored state must not inherit, and keeps the reader's own preferences` + `gives every mount its own session`; `shell2State.test.ts` › `restores a state the app is NOT in — both directions, every field`. Naming the transient half is what makes M7.4's defects answerable rather than remembered: `resetTransient` clears by construction, not by a list. |
| DOM built once, imperatively, through a 10-line `el()`; no keyed or diffed rendering anywhere | `dom.ts`'s `h`/`patch` | `shell2.test.ts` › `the keyed builder`, ten tests — including the two the review's own §2.1 turns on, a focused input keeping its caret and a listener replaced rather than added. |
| Layout skeleton: `<main class="shell">` → bar, stage (two canvases + overlay), rail, strip | one CSS grid, `bar / left / stage / right / strip`, the rails folding to a 38 px labelled strip | `shell2.browser.test.ts` › `has the two rails and the stage as real boxes, not a collapsed grid` + `FILLS the viewport below the fixed nav, rather than collapsing to its content`. jsdom computes no layout, so this capability can only be a browser claim. |
| The rail's ten cards in a fixed order: `linkBox, errorBox, drillCard, recordCard, ledgerCard, derivationCard, resultCard, contourCard, branchCard, poleCard` | `LEFT_CARDS` + `RIGHT_CARDS` (`engine/vocabulary.ts`), with the drill as the right rail's top slot | `shell2.test.ts` › `boots on A6 in Explore, with both rails open and every card titled`; `cards.test.ts` › `gives each card EXACTLY ONE heading` + `renders all 28 records at fixture 0 with no throw and no empty card`. Not a renaming: `recordCard` splits into Target and Integrand, `ledgerCard` folds into Result, `poleCard` becomes Singularities (§2.8), `linkBox`/`errorBox` become the arrival refusal outside `<main>` and the Parse error card, and Share is new. |
| The bar, assembled once: brand, mode toggle, `f(z) =` box, seven presets, Contrasts, Drill, Copy link, Save figure, Copy figure, status note | `bar.ts`: brand, three mode segments, the record button, Sandbox, four stage-mode segments, Contrasts, Fit contour, Copy link, Save figure | `bar.test.ts` › `asks the MATCHING action exactly once, for every control in the bar` — the whole thirteen-entry array in DOM order, with `toEqual` rather than `toContain` so a press that fires a second action fails. The box and its presets are the Integrand card's, Drill is a mode segment, Copy figure is the Share card's; that is §2.13's answer. |
| The contrast and drill panels, `position: fixed` overlays appended to `<main>` | the drill is a rail card; the ladder is an inline strip inside `main.shell2` | §2.15. **Corrected 2026-09-20**: this said "a centred modal mounted on `root`", which step 3.5 replaced. |
| The recompute path: eight render functions, each `replaceChildren`ing its whole card | `commit` → `render` → `patch`, one writer per surface | `shell2.test.ts` › `re-renders through one door…`. The port finding that made the single writer load-bearing is `shell2State.test.ts` › `clears the arrival refusal once the reader has acted — by EITHER route`: the old shell's second copy of the render body is where that defect lived. |
| No teardown — the `resize` listener is never removed and `GLStage.dispose` is never called | `destroy()` takes the key listener, the hash timer, the resize observer, the controller and all four views | `shell2.test.ts` › `LETS GO of the document when the shell is destroyed`; `strip.test.ts` › `is removed by destroy, along with the panel it built`. *(Corrected 2026-09-20: a third citation, `contrasts.test.ts` › `can be closed before it was ever opened, and destroyed after`, names no test in any file — step 3.5's strip has no separate teardown, since it is a child of the rendered page.)* `stageView.destroy` calls `stage.dispose()`, which the old shell had and never used. |
| Drawing coalesced through one rAF: GL stage → `drawContour` → branch handles → pen preview → pole DOM markers | `stageView.drawNow`: GL stage → `drawContour` (pieces, cuts, radius handles) → `drawPoles` on the INK canvas → the textbook plate composited under everything → the overlay's chips | The poles' move is §2.6. **Two of the old layers have no successor** — the next two rows. |
| the branch handles, DRAWN (`app.ts:1531`: a square for a branch point, a diamond for a cut vertex, so the two are told apart without colour) | **gap** | `branchHandles` is computed (`stageView.handles`) and hit-tested (`stageController`'s `nearestBranch`), and a held one gets its chip — but nothing paints the marks, so a reader dragging a branch point or a cut vertex is aiming at something invisible. No plan step claims it; found by this sweep. |
| the pen's preview, DRAWN (`app.ts:1355`: the path so far plus the pending piece, dashed so it reads as not-yet-a-contour) | **gap** | shell2 draws the crosshair cursor and the snap chip and nothing else, so a half-drawn path is invisible until it is committed. The three jsdom specs assert the pen's SESSION, never its ink, which is why 1.7's port could not see it — and `penInk.browser.test.ts`, ported onto `mountShell2` at this step, measures the COMMITTED contour and the snap chip, so it does not see it either. |
| `drawAcc`, separate and not coalesced | `strip.ts`'s own rAF, with the walk cached by value | `strip.test.ts` › `walks the contour ONCE across two draws of equal value`, with its two anti-vacuity halves (a changed integrand and a moved contour both DO recompute). |
| `currentState()` / `applyState()` projecting 17 fields | the same pair, on `app.ts` | `shell2State.test.ts` › `restores a state the app is NOT in — both directions, every field`. M6.1's shape exactly, with `workedExample` and `stageMode` joining the differing set. |
| The DOM-free modules the review says to keep: `state.ts`, `viewState.ts`, `templates.ts`, `presets.ts`, `drill.ts`, `drillProgress.ts`, `contrastGrid.ts`, `figure.ts`, `accumulator.ts`, `ink.ts`, `glStage.ts`, `camera.ts`, `edit.ts`, `branchEdit.ts`, `pen.ts` | all consumed unchanged, `ink.ts`'s theme parameter (1.2) apart | their own suites, unmoved. `drawnContour` is the one addition to `state.ts`, and it is there because `stageView`, `strip` and the hover had each written it out. |
| The module-level helpers the review says should simply move out: `fmt`/`fmtCx`, `fixtureLabel`, `targetText`, `relationText`, `contourIntegrandText`, `channelOf`, `legacyCopy` | `kernel/decimal.ts` and `families/describe.ts`, imported by the cards that need them; `channelOf`'s successor is `withParam` | `cards.test.ts` › `withParam — which field a slider writes to` (a family parameter to the bindings, a limit parameter to the geometry, a derived one refused). `shell2/format.ts` is new beside them: `fmt`'s eight decimals are right for an exact value and wrong for a quadrature. `legacyCopy` goes with the old shell. |
| The pen, entangled: snap, preview geometry, card re-render and draw calls interleaved | `stageController.ts`'s pen half writes `session.pen` and nothing else; the card reads it | the pen rows above, and `shell2.test.ts` › `shows the pen's SNAP by name, beside the pointer`. The preview half of the entanglement is the gap two rows up — untangled and then not drawn. |
| `renderDeclaration`, which writes `declaration`, `branch`, the input's value, its label and its `aria-label`, and calls `applyExpression` from handlers built during render | `cards/cuts.ts`, a card function returning a description | `cards.test.ts` › `the Branch cuts card` (seven tests) + `in shadow mode`. M5.1's shadowed-`branch` becomes unrepresentable rather than caught: a card assigns to nothing. |
| `figureBytes`, reading live canvases, computed style, `encodeShell(currentState())` and the stage | `app.ts`'s `figureBytes`, which draws both views synchronously first and reads its caption, permalink and verdict before the first `await` | `figureInk.browser.test.ts` › `CONTAINS THE PHASE PORTRAIT, and carries its permalink and verdict` — already against `mountShell2`. M6.3's own finding (the caption and the verdict captured either side of an `await`) is what the ordering is for. |
| The gesture machine, "well-factored internally … could be lifted nearly verbatim" | `stageController.ts`, lifted | `shell2.test.ts` › `the stage's gestures` (eighteen tests) + `shell2.browser.test.ts` › `the stage's gestures, aimed at a real layout`, where a hit test can be wrong. |

### §2 — the eighteen gaps and defects, in the review's order

| gap or defect (§2) | new | notes |
|---|---|---|
| 1. Every control in the rail loses focus, and every disclosure snaps shut, on any change | the keyed builder, and the disclosure's open state in the session rather than in the DOM | `shell2.test.ts` › `leaves a FOCUSED input focused, with its caret, across a patch` + `keeps the SAME slider element, and its focus, across ten keyboard presses` (the review's own keyboard case, press by press) + `REMEMBERS an explicit open across a recompute`; `strip.test.ts` › `keeps the SAME input element across a redraw`; `shell2Page.test.ts` › `does NOT rebuild the card on a move that changes nothing`. `cards.test.ts` › `lets an explicit click WIN over the computed default` is the other half: a card that computes a default open state must still lose to the reader. |
| 2. No hover readout of z / f(z); the shell no longer holds an evaluator | `readout.ts`, drawn into the stage overlay from `session.hover` | `readout.test.ts` (nineteen tests) + `shell2.test.ts` › `the hover: one id, three surfaces — M8 step 1.10` + `hover.browser.test.ts` › `SHOWS THE READOUT over the stage and not over the strip`. The evaluator the old shell dropped is the resolution's own `f`, read here rather than recompiled. |
| 3. No undo except the pen's Backspace | `undo.ts`, pushed from `commit`, with Ctrl+Z / Ctrl+Shift+Z on the document | `undo.test.ts` (twenty-two) + `shell2.test.ts` › `undo and redo — M8 step 1.11` (twelve), whose gate is `A DRAG ACROSS A POLE, UNDONE, RESTORES THE VERDICT`. |
| 4. Slider drags run at full quadrature quality, because `budgetNow` drafts only for a stage gesture | `commit`'s budget reads `session.scrubbing` beside `session.gesture` | `shell2.test.ts` › `spends the DRAFT budget while a slider is being scrubbed`, measured off the quadrature's own node count — and it records that the DEFAULT state is too easy for the budget to bite, so the test moves a pole to 1.4 where a reader's drag actually is; `cards.test.ts` › `puts the draft budget on a scrub at pointerdown and takes it off at pointerup`. |
| 5. Parse failure leaves a stale phase portrait | an `empty` resolution clears both layers | `shell2.test.ts` › `is REFUSED by compile, so the app never shows the previous answer beside it`; `shell2.browser.test.ts` › `CLEARS the portrait when the expression stops parsing`. Step 1.10 found the harder half the review did not: `1/(z-q)` PARSES, throws on the first call, and left `1/z`'s answer on screen beside it. |
| 6. Pole markers are not in the exported figure | drawn on the ink canvas, which `figureBytes` composites | `shell2.browser.test.ts` › `draws the POLE on the ink canvas, where the figure export can see it`, with an entire integrand as its control so that "some ink near the middle" is not bought by anything at all. |
| 7. Record picker shows slugs | the front door's cards and the bar's record button both name the record by `family.title` | `frontDoor.test.ts` › `names every card control by its record's TITLE, not by its formula` + `gives every card its identity, its contour phrase, its point and a citation`; `bar.test.ts` › `names itself by the record's TITLE, not by the formula's LaTeX`. |
| 8. The same poles are listed three times in three formats | two merged, the third kept | The Singularities card is one row per pole — where, order, residue, `Ind(γ, z₀)` — so the residue and the coefficient that multiplies it are read together: `cards.test.ts` › `prints the residue AND the winding that multiplies it, in one row`. The Result card's `Winding numbers (exact):` list is gone. **The derivation's per-pole table stays, deliberately**: it is Pass 2's evidence, drawn only in the Residues stage (`cards/derivation.ts`'s `poleTable`), and moving it would put the argument's working somewhere other than the step that did it. |
| 9. Piece list is read-only: no click-to-select, reorder, delete, reverse or add | **gap — steps 4.1 and 4.3** | Phase 1 adds `Reverse orientation` and stops there; `cards/contour.ts` says so in its own first lines. The hover half of the complaint — "hovering a row highlights the piece, but not the reverse" — IS closed, at 1.10: `shell2Page.test.ts` › `lights the LEFT rail's row and the RIGHT rail's derivation line from ONE hover`, one id across three surfaces. |
| 10. Snap feedback appears in the rail while the reader is looking at the pointer; the preview colour is hardcoded; body and handle drags have no snapping and no range feedback | the snap is a chip beside the pointer; the colour is `inkTheme.ts`'s `penPreview`, one per theme; the drags are unchanged | `shell2.test.ts` › `shows the pen's SNAP by name, beside the pointer` + `names the FIRST vertex as the snap that closes the path`. Two halves are carried rather than closed: `radiusDragValue` returning `null` past the parameter's range still stops the handle silently (`stageController.ts:487`, `:604`), and no plan step takes it up; and the preview colour is now a theme field that **nothing draws with**, which is §1's pen-preview gap seen from the other side. |
| 11. No fit / reset-view control, and double-click does nothing | `Fit contour` in the bar's tool cluster, and double-click on the stage | `shell2.test.ts` › `fits the contour into the view, from the TOOLBAR as well as the controller`, opening from a camera 707 away at a half-height of 0.1. The double-click (`stageController.ts:525`) is wired and has no test of its own; the button does. |
| 12. Cursor inconsistency — CSS says `grab`, JS says `default`, and they disagree over a handle in pen mode | one convention, set by the controller and never by CSS | `shell2.browser.test.ts` › `says with the CURSOR what a click would do`: `default` over the empty plane, `grab` over a radius handle, `crosshair` with the pen out INCLUDING over that handle, which is the case the old shell disagreed with itself about. Only a browser can check it. |
| 13. Bar overflow at laptop widths — verify in a browser | the bar is thirteen controls; the `f(z) =` box and its seven presets are the Integrand card's, Copy figure is the Share card's | `bar.test.ts` › `asks the MATCHING action exactly once, for every control in the bar` pins the count and the order. **The width itself is still unmeasured — step 5.1**, whose browser pass at 1440 × 900 and 1280 × 800 is where a clipped cluster would show. The review asked for a browser and has not had one. |
| 14. URL sync is inconsistent for `scrub`, `iso` and `contrast` | `commit` is `syncHash`'s only caller, so every state change marks the hash | `shell2State.test.ts` › `marks the hash dirty for a VIEW-ONLY change — the three the old shell forgot`, decoding all three back out of the address bar. Structural rather than five call sites remembered. |
| 15. Overlay panels are not modal: no `aria-modal`, no focus trap, the app underneath not `inert` | `modal.ts` — `role="dialog"`, `aria-modal`, a focus trap, `inert` on the page, Escape, focus returned — and the drill is not a panel at all | `modal.test.ts` (nine) + `contrasts.test.ts` (twenty-two), including `marks the page inert while open and restores it after`, `RESTORES inert rather than clearing it, when the page already had it` and `cycles Tab within the dialog, in both directions`. The inert test asserts the ATTRIBUTE and says why: jsdom does not implement `inert`, measured in the test itself. Half of this item is a **drop with its reason**: a full-screen overlay for a task that is about the page underneath was the wrong shape, so the drill is the right rail's top card. |
| 16. Keyboard grab cycling has no on-screen state | a chip beside the thing the arrows move | `shell2.test.ts` › `names what is held ON THE STAGE, not only in the live region` — and what the chip says is derived from the state rather than compared with `grabLabel()` alone, which a chip reading "held" would satisfy. |
| 17. Contrast-mode buttons carry no `aria-pressed` | all four carry it, and exactly one is true | `strip.test.ts` › `carry aria-pressed, and exactly the active one is true`, over all four modes. |
| 18. Minor: `Alt suppresses snapping` is Option on macOS and `metaKey` is undocumented; `endGesture` releases pointer capture unconditionally | the release is guarded by `hasPointerCapture` (`stageController.ts:503`); the grammar sentence still says `Alt` | The guard has no test of its own — jsdom has no pointer capture and the controller's stub returns `false`. The macOS wording is CARRIED: `ev.altKey` OR `ev.metaKey` is honoured and the sentence names one of the two. The review filed it as minor and no step takes it up. |

### The plan's three expected drops, checked

- **The phone and tablet layouts — dropped, with a replacement.** `narrowLayout.browser.test.ts` goes
  with the old shell at 1.12. `shell2.css` has no breakpoint below 1024 px and below 900 px the grid
  is swapped for the phone notice, which is not a layout but a sentence and the address as text:
  `phoneNotice.browser.test.ts`, four tests, driven through the media rule the shipped stylesheet
  actually carries — both halves of the swap asserted on it, `.shell2 { display: none }` beside
  `.phoneNotice { display: grid }`, so the hidden half leaves the accessibility tree rather than
  merely going quiet — and the notice adds no second `<h1>`.
- **The three redundant pole listings — two of them, not three.** §2.8: the Result card's list is
  gone, the Poles card is now Singularities, and the derivation's per-pole table is kept where the
  engine put it.
- **The full-screen overlays — both of them.** §2.15 and §1's panels row: the drill's overlay is a
  rail card, and the ladder's is an inline strip (`<section class="ladder2">`) inside the landmark.
  *(Corrected 2026-09-20: this said the ladder "is a centred modal dialog (`max-width: min(92vw,
  68rem)`, `max-height: 88vh`) with the mechanics the review found missing" — true of step 3.1 and
  replaced by step 3.5, which is why the focus-trap and Escape mechanics have no successor tests.)*

---

## What the port found

Twelve defects in shell2, one in a renderer three surfaces share, and one in the browser harness —
all found by writing a counterpart, or by opening a state a test cannot reach, or by measuring a
claim a plan made. None by reading the code.

The first ten are step 1.7's; 11 to 13 were found while building 1.8 and are recorded here because
they were found the same way — and because two of them had been true for several steps with a green
suite over them.

1. **The pen's card was dead in the live app.** `penStart` / `penStop` / `penBack` went through the
   controller, whose `redraw` was `scheduleDraw` — the stage and nothing else. Pressing `Draw` gave a
   crosshair cursor and a canvas that silently accumulated vertices, with no count, no grammar and no
   Close, Undo or Cancel. `penCommit` worked only because it ends in `commit`. Neither the card tests
   (which render against a session with `pen` pre-set) nor the controller tests (which assert the
   session) could see it: it is visible only from the reader's own path.
2. **`drillMask` was computed and read by nothing.** Rung ii showed the full ledger and rung iii drew
   the record's contour — the answer — with the card beside it asking which contour closes the
   integral. Measured after wiring its three readers: ink pixels 6384 at rung i, 6384 at rung ii,
   **344** at rung iii, 7003 after a pick; ledger rows 7 → 5 → 0 → 7.
3. **The drill had no door.** The bar's `Drill` segment refused with *"Choose a drill task from the
   panel"* — about a panel nothing built — so `DRILL_TASKS` was reachable from a permalink and from
   nothing a reader could press. A refusal naming an action the app does not offer is M4.7d's defect
   in the ledger's own repair line.
4. **The parked handle.** In gallery mode the contour on screen is the record's output while
   `state.contour` is the reader's parked sandbox curve, and `handles` / `resolvedPieces` took the
   resolution OPTIONALLY — which three of four call sites, the draw path among them, omitted. A
   record drew and offered as a keyboard stop a radius handle labelled for the sandbox's circle, at a
   point on no curve in view. A no-op drag today only because `paramChannel` sends `R` to `derived`.
5. **The arrival banner outlived its own field**, because it was written where the field was set
   rather than drawn from it, and `commit` held a second copy of `render2`'s body.
6. **The permalink did not exist**, which is not a port finding but is what a port was about to
   assume: the address bar stayed empty through a mode change, a fit and a scrub.
7. **Every left-rail card was crushed under a record.** `.card2` is a flex item, flex items shrink by
   default, and the rail's own `overflow: auto` was therefore never reached: at 1280 × 900 the
   Singularities card stood at 22 px of 114 and the Result card at 166 of 371, its ledger cut off
   mid-row. The cards keep their height and the rail scrolls.
8. **A `serious` axe finding that the roster structurally cannot see.** `overflow-x: auto` computes
   `overflow-y: auto` beside it, so the Singularities card was a scroll box with no focusable
   content — `scrollable-region-focusable`. It appears only once a record is open with poles wider
   than the rail, and `scripts/a11y-audit.mjs` audits each page's DEFAULT state; the sandbox's single
   pole never overflows. Found by running axe by hand over all seven of this step's states, which is
   M7.1's "a panel nothing opens is never audited" met again from the other side. The scroll moved
   to a named, focusable wrapper around the table; all seven states audit at 0 rules, 0 nodes.
9. **The address bar leaks between browser tests**, which is the permalink's own doing and cost three
   green tests. A shell writes `#vs=` 250 ms after its last change and the next one reads
   `window.location.hash` at boot; there is one document and one address bar, so a mount inherits
   whatever the previous test left. The pole test ends by applying `z^2` as its control — an entire
   integrand — so the mount after it had no pole to ring, no contour to stroke and no accumulation to
   trail, and the pole, hover and strip tests each read 0 ink. Each passed alone and in every subset.
   The harness destroys every shell and clears the hash after each test. The first guess was WebGL
   contexts accumulating past Chromium's cap, and measuring refuted it: twenty undestroyed mounts in
   one test, and ten across ten tests, all drew 10,963 ink pixels apiece.
10. **`clampView` bounded the zoom and not where it landed**, which is not a port finding but the
    one that explains 9: `zoomAt` folds a wheel's factor into the CENTRE as well as the half-height,
    so one `deltaY: 100000` left the camera 1e64 from the origin at a perfectly ordinary
    half-height — a sane magnification pointed at nothing. The test firing exactly that event is
    called *a flick cannot lose the plane* and asserted the half-height alone. `syncHash` then
    minted a permalink to that camera, and the next mount in the same document opened it.
11. **The new shell drew NO phase portrait for any gallery record**, and had not since the stage was
    built at step 1.3. `stageView.ts` read `resolution.kind === "plain" ? resolution.ast : null`, so
    `gallery` AND `declared` both fell to `stage.clear()` — all 28 records showed a contour over a
    flat ground, and so did the sandbox whenever a branch factor was declared, which is M5.1c's whole
    point. Measured: a record's canvas carried **1** distinct colour, `15,17,21`, against the
    sandbox's 3,556. **It survived five steps of browser passes because of an assertion in this
    table's own step**: the rung-iii test read the pixel's ALPHA, and a cleared canvas is opaque, so
    `px[3] > 0` was true of a picture of nothing. Found by the read-only measurement for the A6 cold
    start, which went looking for a blast radius and found that *"the app opens on A6"* would have
    shipped a blank backdrop.
12. **`drawContour` took a theme and ignored it for the piece strokes**, reading the module-level
    `PIECE_COLOURS` — `DARK_INK.pieces` — two lines from a `t.refusedInk` that does read the theme.
    On the thumbnails' light ground the stage's hues measure **1.61:1 to 2.27:1**, where the light
    palette's own darkened hues give 5.11:1 to 7.22:1; WCAG AA for graphical objects is 3:1, so the
    old palette failed on all six hues and the new one clears on all six. `inkTheme.ts`'s own comment
    for `LIGHT_INK` said it had been darkened for exactly this reason.
13. **Three functions that say "sandbox" meant "whatever the app boots into"** — the ladder's
    wrong-way cell and the drill's rungs iii and iv all spread `defaultState`. Production behaviour,
    31 of the cold start's 121 failures, and unmentioned by the plan.
