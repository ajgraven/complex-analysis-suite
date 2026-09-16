# M8 — shell parity

The old shell's three jsdom specs against the new one, behaviour by behaviour.

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

**A gap is a row, not an omission.** Three behaviours cannot be expressed against shell2 yet, each
because a surface they drive arrives at a later step. They are listed with their step, and the step
that builds the surface re-ports them.

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
| 549 `DERIVES both canvas descriptions from the ledger, and keeps them current` | **gap — step 1.9** | The strip's half is generated (`strip.ts`'s `describe`, and its step-count clause is ported below); the STAGE's description is still the static label `app.ts` mounts, and `describeStage` arrives with the stage modes at 1.9. Asserting the strip's half alone under this name would claim "both" for one. |
| 572 `counts a pole's winding only where it was DECIDED` | **gap — step 1.9** | Same cause: it is a clause of the stage's generated description. It is the only assertion that pins `decided`-only counting in the text alternative, so 1.9 re-ports it. |
| 597 `reports the accumulator's REAL step count, not a placeholder` | `shell2Page.test.ts` › same name | Same regex. `canvas.accCanvas` → `canvas.acc`, and the read awaits a frame, because the strip's name is written in `drawNow` and `schedule` coalesces. |

### the contrast grid

| old (line, name) | new | notes |
|---|---|---|
| 622 `is closed at boot, and costs nothing until it is opened` | `shell2Page.test.ts` › same name | STRENGTHENED: the old shell laid a `hidden` `<section>` over the page, so the old test could only say "hidden, and no `<table>` in it". shell2 mounts the dialog's DOM on first open, so the assertion is that no `[role="dialog"]` and no `.contrastBackdrop` exist at all — and the "not built" half is then asserted positively, by a `<table>` appearing on the first open. |
| 631 `opens on the button, and says so to a screen reader` | `bar.test.ts` › `opens the contrasts panel rather than toggling it` + `contrasts.test.ts` › `moves focus INTO the dialog on open and RETURNS it to the opener on close` | `aria-expanded` is deliberately gone: the control opens a MODAL rather than toggling an inline panel, and focus lands on the dialog rather than on `Close` (where the first Space would shut it). |
| 641 `draws five columns and every ledger row, each cell named for a screen reader` | `contrasts.test.ts` › `draws the five columns and a row for every ledger row` + `gives EVERY header cell a non-empty accessible name, the corner included` + `names every status in text, not in a glyph alone` | Three clauses, three tests, each stronger than the old one. |
| 665 `prints C1's ANSWER, π/2 — not the 0 its ∮ evaluates to` | `shell2Page.test.ts` › same name | Same five-element array and the same `constraintLabel("KILL")`. The `.cellAnswer` class is gone, so the answer line is read as the three shapes `columnHead` emits. |
| 678 `marks the declared row as changed, and a rewording as merely reworded` | `contrasts.test.ts` › `marks the DECLARED difference apart from a mere rewording` + `shell2Page.test.ts` › `marks the wrong-way column's FAILED row as the step's own declared change` | The second carries the old test's count of ONE cell where the declared change and a failure coincide, which is that rung's whole content. `td.changed.failed` → `td[data-change="declared"][data-status="failed"]`. |
| 688 `OPENS a cell into the app, which is the only thing the grid does to the state` | `shell2Page.test.ts` › `…the only thing the ladder does to the state` | `contrasts.test.ts` asserts which state the button ASKS for against a stub; this asserts the app arrives in it, which a stub cannot reach. |
| 702 `opens the WRONG-WAY cell into the sandbox` | `shell2Page.test.ts` › same name | Same three assertions, through the mounted app. |
| 715 `closes on Escape and gives focus back` | `contrasts.test.ts` › `closes on Escape` + `moves focus INTO the dialog…` + `shell2Page.test.ts` › `closes on Escape, tells the shell, and gives focus back to the bar` | The live half adds what a stub cannot see: `session.contrastsOpen` goes false, so the bar and the dialog cannot disagree about whether it is up. |
| 725 `leaves M6.4's structure intact — still one <main> and one <h1>` | `shell2Page.test.ts` › `…and the dialog outside both` | One added clause, because shell2 changed the mechanics: the dialog is mounted OUTSIDE `main.shell2`, which is a correctness fact rather than a stylistic one — `inert` is not defeasible from CSS. |

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
| 672 `is PUT AWAY when the sandbox is left` | **gap — step 1.8** (its `applyState` half is `shell2.test.ts` › `is PUT AWAY by applyState — M7.4's defect, at the door`) | The old test leaves the sandbox by clicking `Gallery` on the source toggle; shell2 has no such control, and the record button opens the front door, which 1.8 builds. That is the path that can place a stray vertex, so 1.8 re-ports it. |
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
| 175 `masks the ledger, the value AND the contour — the record's contour IS the answer` | `shell2Drill.test.ts` › `masks the ledger, the derivation AND the value` (DOM half) + `shell2.browser.test.ts` › `takes the CONTOUR off at rung iii, and the phase portrait stays` | Split, because jsdom has no canvas. The DOM half is zero ledger rows and a Result card reading "Masked", with the derivation joining it — which the old test asserted one rung earlier only. The CONTOUR half is `stageView`'s empty piece list and belongs to the browser suite; `drillInk.browser.test.ts` makes the same claim against `src/shell/` and goes with it at step 1.12. Measured: 6384 ink pixels at rung i, 6384 at rung ii — the contour is GIVEN there — and 344 at rung iii, the axes alone, with the phase portrait untouched because the integrand is the question. |
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
