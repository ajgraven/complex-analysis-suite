# M7 — the teaching layer, and the pen tool: a staging plan

> Read [`M6-plan.md`](M6-plan.md) §0 first — its findings §0.3 (this milestone exists because PLAN's
> M6 gate never mentioned the teaching layer) and §0.4 (the contrasting triad, measured) are this
> plan's premises. Then [`research/02-pedagogy-misconceptions.md`]
> (research/02-pedagogy-misconceptions.md) §6–§8 and [`research/07-ux-explorables.md`]
> (research/07-ux-explorables.md) §7.2.

**Scope (PLAN §7's round-3 scoping, unchanged):** contrasting triads and fading **only**. No prose
lessons, no prediction prompts, no self-explanation prompts; everything else stays PhET-style
implicit scaffolding in affordances, defaults and constraints. Plus the **pen tool**, inherited from
M1.

**Gate (new — PLAN gave the teaching layer none):**

1. every declared contrast's difference set is **verified against the engine**;
2. **every drill stage is addressable by permalink**, and therefore travels under M6.2's
   round-trip-by-verdict test;
3. a contour drawn with the pen tool closes, and the ledger reads it as it reads a template's.

> Clause 2 is the load-bearing one. It is the only formulation I could find that makes a teaching
> surface falsifiable in this app's own idiom: a stage that cannot be linked to cannot be tested, and
> a stage that can be linked to is already covered by a test that exists.

**Depends on M6** — specifically M6.1 (the shell has a state object at all) and M6.2 (the codec that
clause 2 rides). Nothing here should start before those land.

---

## 0. What this milestone is not

Research 02 §8 lists eleven P1 teaching requirements. PLAN's round 3 took **two** of them — faded
worked examples (item 11, minus its prompts) and contrasting triads (item 13) — and this plan does
not reopen that. Three exclusions are worth restating because they are the ones most likely to creep
back in:

- **No prediction prompts** (research item 12), and **no self-explanation / principle-identification
  prompts** (part of item 11). The research supports both; round 3 declined both. They are the
  difference between an explorable and a worksheet.
- **No prose lessons.** Guidance lives in affordances, layout and constraints — PhET's implicit
  scaffolding, which is the resolution of "unguided exploration fails" and "narration competes with
  the artefact".
- **No Pólya work/flux toggle.** Dropped in M6 with its reasons recorded ([`M6-plan.md`](M6-plan.md)
  §2 decision 3): its stated job is already carried by the arc's own KILL row, it is a second picture
  of `f` where the research warns the background is a seductive detail, and it would be the app's
  first surface with no falsifiable claim attached.

---

## 1. The slices

### M7.1 — the contrast grid · *M*

The ladder measured in [`M6-plan.md`](M6-plan.md) §0.4, as gallery **organisation** rather than as
lessons — a second ordering over the same 28 records, attaching at the tier-grouped `<optgroup>`
record picker (`src/shell/app.ts:434–456`).

Five cells, drawn from **two** records:

| cell | record @ fixture | differs from the cell above in |
|---|---|---|
| `∫1/(1+x²)` | B1 `jordan-cosine-kernel` @ `a=0, b=1` | — |
| `∫cos x/(1+x²)` | B1 @ `a=1, b=1` | **exactly the arc's KILL row**: plain ML → Jordan |
| *(same, closed the wrong way)* | B1 @ `a=1`, lower closure | the same row, now **diverging** — M3's gate already pins it |
| *(the half-plane is forced)* | B1 @ `a=−1, b=1` | the same row, **lower** semicircle — forced by the sign of `a`, never chosen |
| `∫sin x/x` | C1 `indented-sinc` | **two places at once**: the piece list gains `indent`, and CATCH drops from **1 enclosed to 0** |

- **A `contrasts` datum** declaring, per adjacent pair, *which ledger rows differ* — and a test
  verifying that exactly those differ and the rest agree. That is the whole reason this belongs in
  this app rather than in a slide deck: an engine change that made B1 @ `a=0` cite Jordan fails it.
- **Row alignment is the UI problem.** Two ledgers with 7 rows and one with 9 must line up by
  *constraint and role*, not by index, or the difference the grid exists to show is buried in an
  off-by-two.
- The wrong-way cell is research 02 §7's *"let wrong contours fail informatively"* as a **cell**,
  not a mode — and it costs nothing, because M3's gate computes it already.

**Gate:** every declared contrast's difference set is verified against the engine; the grid is
reachable and readable at one screen width.

> **DONE. Measuring the five cells first changed four things, and each would have been a silent
> defect built to the letter of the table above.**
>
> **(1) The wrong-way cell is not a record and cannot be.** B1's contour derives its closing side
> from `sgnA = if(a < 0, -1, 1)`, and a `derived` parameter is read-only precisely so the geometry
> cannot desync from its own definition — so the record is *incapable* of being closed wrongly. It is
> a SANDBOX state, the one M3's gate already pins. A cell is therefore a `ShellState` and the ladder
> spans both modes, which buys clause 2 outright: a cell is a state, so a cell is a permalink, so
> every cell already travels under M6.2's round-trip-by-verdict test.
>
> **(2) Rows cannot be aligned by `pieceId` — risk S-c, biting on the first pair.** B1 names its
> target piece `realAxis`; the sandbox semicircle names the same row's piece `diameter`. An id-keyed
> pairing reports a removal and an addition where one row changed status. The key is
> `(constraint, role, ordinal)`; the ordinal is needed because `(constraint, role)` is not unique —
> C1 carries two KILL/target rows and two KILL/vanish. The alternative is implemented in the test
> and shown to mis-pair, so the choice is pinned by a failure rather than by a comment.
>
> **(3) The step to C1 moves five things, not two:** CATCH `1 → 0` enclosed, the target row splits
> ×1 → ×2, a new vanish row for the indentation, `pieceLimits` gains it, and the answer changes. The
> last is a UI requirement: **the grid prints the record's ANSWER, not the ledger's value**, because
> C1's `∮` is exactly 0 while the integral it determines is π/2 — the cell's whole lesson.
>
> **(4) Running the ladder found a category this plan had no field for.** Two rows differ in WORDING
> without the argument differing: crossing record→sandbox renames the target piece, and C1's LEGALITY
> row quotes the clearance (`1.00`, then `0.0500`). Widening `rows` would make the grid point at rows
> that did not change; ignoring them would leave a difference nobody watches. They are declared in
> `alsoDiffers` with a reason, kept out of the highlighted set, and the test enforces that **nothing
> filed there is really a status change** — the one loophole that would empty the declaration.
>
> What survives is the ladder's premise, now asserted over the run rather than cell by cell: the
> first three rungs are ONE ROW apart and it is the same row all three times, the arc's.
>
> **Three more findings from building the UI.**
>
> **Contrasts is not a MODE.** A third `mode` would have to represent "showing the grid" as a
> property of a state already in one of the two modes, and every mode check — the codec included —
> would grow a case meaning "none of the above". It is a panel over the app, and opening a cell is
> `applyState(cell.state())`.
>
> **First-appearance row order is wrong, and drawing the table is what showed it.** C1 emits target,
> indentation, target, big arc, COVER; the cells before it emit target, arc, COVER — so taking keys
> as they first appear puts COVER down at cell 1 and leaves C1's extra rows nowhere to go but the
> bottom, BELOW `COVER`, in an order its own argument never had. It is a topological merge instead,
> and the failing alternative is in the test.
>
> **The a11y roster audits pages in their DEFAULT state, so a panel nothing opens is never audited.**
> Run by hand against the open grid, axe found `empty-table-header` on the corner cell — now named
> `ledger row`, and pinned in `shell.test.ts` because the axe job does not block.
>
> One thing measured and deliberately NOT fixed here: the page scrolls horizontally at phone width
> (`scrollWidth` 656 against a 400 client). It is **pre-existing** — identical with the panel open,
> shut, and on the tree before this slice — and `footer.strip` is the sole cause (removing it drops
> 656 → 400; the nav, the rail and the bar change nothing). Recorded rather than absorbed.
>
> Sweep **24/24**, no equivalents. The one first-pass survivor was real and unreachable from the
> ladder: nothing tested that a row DISAPPEARING is reported, because the ladder only ever runs
> forwards. Writing that test then found that `KILL/vanish#1` is C1's big arc rather than its
> indentation — the ordinal counts in piece order, so B1's arc pairs with C1's INDENTATION and C1's
> arc is the extra row. Nothing false follows (both are in the declared set), but the pairing is by
> position within the role, not by what a reader would call the same piece.

### M7.2 — the pen tool · *M*

M1's deferred item, and a prerequisite for M7.3's last stage being more than the sandbox's templates.

Research 07 rule 6 gives the grammar outright, and it is the one every user already knows: **click =
corner, drag = arc, click-the-start = close, Backspace = drop last, Esc = abort, Ctrl = constrain**,
with a live preview of the pending segment. Rule 5 governs snapping: **snap with intent, never
silently** — to poles, axes, radii and existing endpoints, naming the constraint that fired in a
transient badge, with a modifier to suppress it.

Three things this app adds to that grammar, each because the ledger is watching:

- **A drawn piece is a first-class object** with a name, a handle, a term and a badge (rule 2). The
  piece list already works this way for templates; the pen must produce the same objects, not
  anonymous polylines.
- **Degenerate states are named and refused, not computed** (rule 9) — an unclosed path where closure
  is assumed, a vertex on a pole, a piece crossing a declared cut. The engine already refuses all
  three; the pen must not be able to construct something that bypasses them.
- **Undo is object-level** (rule 10): one gesture = one entry, and the URL updates on settle rather
  than per frame — which is M6.2's codec being written to once per gesture, not sixty times a second.

**Gate:** a hand-drawn contour closes and its ledger is indistinguishable in kind from a template's;
a hand-drawn contour round-trips through `#vs=` as its **piece list** (M6.2's semantics-not-samples
rule) and comes back the same contour.

> **DONE (M7.2a–c). Both halves of the gate are met, and the second half is met in a different
> representation than the one written above — measured, not preferred.**
>
> **THE PAYLOAD CHOSE THE WIRE FORM.** A twelve-corner path carried as its piece list is **2,028**
> base64 characters, which is *at* research 07 §6's ~2 kB warning, and twenty corners is 4,635. The
> same path as vertices plus a per-piece kind tag is **292**, and forty corners is 879. It round-trips
> TO the same piece list — that is what the test asserts — but carrying one literally busts the
> budget at a dozen corners, because ids, names, colours and every endpoint shared between
> consecutive pieces are all derivable and a piece list carries each of them twice.
>
> **A BULGE, NOT A CENTRE.** An arc between two clicks needs one more number. The bulge — the apex's
> signed offset from the chord's midpoint — is exactly what the drag measures and *cannot* disagree
> with the endpoints, where a centre is two numbers and can. Zero degrades to a segment continuously,
> so a drag that ends where it began leaves a straight line rather than an arc of absurd radius.
>
> **THE PLAN'S DEGENERACY CLAIM IS TRUE, verified rather than trusted.** On hand-built contours: an
> unclosed path fails LEGALITY with *"the contour does not close"*, a vertex on a pole with *"the
> contour must avoid every singularity of the integrand"*, and a cut crossing is M4.1's existing
> step. A healthy hand-drawn square closes with one enclosed singularity, the same four constraints
> as the circle template's ledger and **the same value** — the gate, asserted by comparing the two.
>
> **THE PATH IS DERIVED FROM THE GEOMETRY, NOT STORED**, and `penNodes` is deliberately not in
> `ShellState`: a half-drawn path is not a state worth restoring, and storing the finished one beside
> the contour it built would be two sources of truth for one fact — the shape of bug `contourSource`
> had to grow a verification step to prevent.
>
> **AND THAT VERIFICATION CANNOT BE A BYTE COMPARISON**, which the first draft discovered by refusing
> a perfectly good arc. The bulge is recovered through `atan2` and rebuilt through `cos`/`sin`:
> bit-identical in three of four measured cases, off by 2.0e-13 in the fourth, moving sampled points
> by at most **1.3e-12**. `sameShape` samples five parameters per piece against a 1e-9 floor, and a
> test pins that it still catches a flipped bulge, a dropped arc and a 1e-6 nudge.
>
> **Contrasts is not a mode and neither is the pen** — but for a different reason. The pen is a third
> top-level state rather than a fourth `grab` kind: `grab` answers "what does a MOVE act on?", and
> click-to-place holds nothing between events. It takes the click BEFORE any grab test, or the tool
> would silently stop working near a radius handle.
>
> **THE DEFECT THAT SHIPPED IN THE FIRST DRAFT, and the correction to why it survived.** The drag
> bowed the piece *leaving* the new vertex, measured against a chord whose far end was still the click
> itself — a zero chord, so nothing happened. It bows the INCOMING piece now, against a chord both of
> whose ends are placed, and `penInk.browser.test.ts` is the guard — with a plain-click control, so
> "one arc" cannot be something the pen does to every path.
>
> This was first recorded as **invisible to jsdom by construction**, a zero-sized rect collapsing
> every screen point to the view centre. **That is false, and measuring it is what said so:**
> `viewport()` guards with `|| 1`, so jsdom MAGNIFIES the geometry by 4 — pixel `p` lands at
> `(p − 0.5)·4` world units and the grab tolerance is 44 of them — the chord in that test is 280 long,
> and the same drag produces a real arc with a bulge of −358. The jsdom test **could** have caught the
> bug and did not, because it asserted the piece COUNT where the defect shows in the KINDS. It asserts
> the kinds now, which moves `pen-bow-bows-outgoing` from a browser kill to a node one; two further
> claims resting on the same false premise (click-to-close "never fires" under jsdom — measured, it
> does; every pixel going "to the view centre") are corrected in place.
>
> Two smaller findings. `bulgeFromApex` is **extracted** because the drag and `penPath` were two
> copies of the same three lines — the second-consumer rule arriving inside a module. And the card
> was **never refreshed after a click**, so the vertex count and the `Close` button stayed stale;
> three assertions failed and all three were that one omission. The card is now rebuilt on a click,
> on Undo, and on a move **only when the snap's NAME changes** — rebuilding per pointer sample would
> be both wasteful and visibly unstable, and the name is the only thing a move can change in it.
>
> Research 07 rule 5 is honoured literally: every snap returns the name of the constraint that fired
> and the card prints it — *"snapped to the real axis"*, *"snapped to the first vertex — click to
> close"*, *"snapped to a pole — the contour may not pass through it"*. Snapping onto a pole is
> allowed and named rather than prevented, because LEGALITY refuses a contour through a singularity
> and a reader who wants to see that refusal has to be able to aim at it. **And the snap PLACES the
> snapped point**, which is a separate claim from naming it and had no test until the sweep asked:
> a badge over a raw position is a hint, not a snap.
>
> **THE HARNESS'S LAYOUT WAS THE DEFECT, and it cost two drafts.** Two measurements, both of the test
> environment rather than the app. Vitest browser mode's viewport defaults to **414 × 896** — a phone
> — in which this app's desktop grid (rail 19rem, strip 16rem) overflows; and mounting the shell
> *without its stylesheets* does not give a plainer layout, it gives a different one, with `.stage` at
> 1200 × 316 and `canvas.ink` at 1200 × **154** — two boxes that in the real app are the same box,
> since the canvases are `position: absolute; inset: 0`. A test aiming at either was aiming at an
> artefact: "vertices" landed outside the drawing surface, and the snap that then never fired read as
> a pen defect until a Playwright probe against the dev server showed the product was fine. The
> browser project now sets a desktop viewport and the file loads the two stylesheets `main.ts` loads;
> measured with both, the stage is 928 × 564 at y = 80. **And the rect is read at call time rather
> than captured**: in the unstyled harness the pen's own controls appearing moved the stage's `top`
> from 349 to 304, so every point after the first click was 45 px out with nothing on screen to say so.
>
> **`sameShape`'s kind check: the test pinned the outcome without pinning the reason**, which
> re-running the sweep against a verified-green tree is what said. It bowed a chord of 2 by 1e-8 and
> asserted "not the same shape" — true, and still true with the kind check DELETED, because the
> samples differ by 1.4e-8. Measured, the check *cannot* be the deciding vote for a chord of ordinary
> size at the default tolerance: an arc exists only above the straightness floor, so its radius is at
> least `h²/2e-9` — 5e8 at `h = 1` — and `pointAt`'s own cancellation there moves the samples by
> **1.1e-7**, two orders above `SHAPE_EPS`, so the samples always disagree first. Where it decides is a
> SHORT chord (`h = 5e-7`, radius 1.25e-5, arithmetic exact, bow inside the tolerance): the samples
> agree to 1.0e-8 and the two are still not the same piece. For the codec's own use the check is
> belt-and-braces, which is now said rather than implied.
>
> **And the encode-side verification had no test at all.** Every path the pen can draw round-trips —
> which is the point of the check and also why nothing exercised it. What it guards is a contour whose
> pieces are **not the chain its vertices describe**: `penPath` reads one vertex per piece START, so a
> broken chain reads back as a path that closes through the gap, and the link would open a shape
> nobody drew. It refuses by name, with its own vertex count.
>
> **The pen's drawing state audits CLEAN** — zero axe rules and zero nodes in all three states
> (default, pen out, two vertices placed with a live snap note) against the built dist with real
> pointer events, and no page errors. Measured by hand, because the a11y roster only ever sees a
> page's default state (M7.1's finding, met again).
>
> **Sweep: 25/25, with five closed on a second pass and no equivalents.** All five survivors were real
> gaps: `isPenContour` needs EVERY piece (it chooses a wire form, so a contour that merely *contains*
> a drawn piece must fall through to the refusal); `sameShape`'s length check is the one difference
> sampling cannot see, because the loop runs over the first contour's pieces and an open path of three
> shares both with the first two of an open path of four; a snapped vertex must LAND on the constraint;
> the card must NOT be rebuilt on a move that changes nothing — whose consequence is not cosmetic,
> since `replaceChildren` destroys the buttons and a reader who has tabbed to `Cancel` loses focus the
> moment the mouse crosses the stage; and `penCommit` must refuse a path of ONE, where the loosened
> guard adopts an **empty** contour (Enter asks for an open commit and `penContour` builds zero pieces
> from a single vertex).

### M7.3 — the faded drill · *M–L*

Four stages over machinery that already exists — the ledger's rows and `DERIVATION_STAGES` are
introspectable data, so the drill masks and checks rather than reimplements.

| stage | what is given | what the learner does |
|---|---|---|
| i | contour **and** ledger | reads — today's app, unchanged |
| ii | contour | asserts each ledger row, then reveals and compares |
| iii | the target integral, and a menu of contours | picks; the existing ledger passes or fails it **diagnostically** |
| iv | the target integral | draws freely (M7.2) |

- **Fading is tied to progress**, not to a preference — Kalyuga's expertise reversal: support that
  does not fade hurts the learners who progress. Progress in `localStorage` (Riemann-Map's theme
  handling is the house precedent).
- **Stage iii needs no new failure machinery.** M3's gate already pins that a wrong contour fails
  visibly and names the failing constraint; the drill supplies the menu and reads the existing
  verdict.
- **Scope the drill to M7.1's contrast set.** Four stages × 28 records is a combinatorial temptation
  with no pedagogical argument behind it; five cells drawn from two records is the set the research
  actually motivates.

**Gate:** each stage is addressable by permalink and round-trips by verdict under M6.2's test; stage
ii's check accepts a correct assertion and rejects a wrong one **for the reason the ledger gives**,
not by string match.

### M7.4 — sweep, docs, gate · *S*

Mutation sweep against a verified-green baseline; browser verification; the doc sweep; the gate.

---

## 2. Risks

| # | risk | mitigation |
|---|---|---|
| S-a | **The drill is the first surface in this app whose correctness is pedagogical rather than mathematical.** Nothing the engine can falsify says a fading schedule is right. | The gate's clause 2 pulls what *can* be checked (addressability, round trip, the ledger's own verdict) under an existing test, and the rest is scoped small enough to change cheaply. |
| S-b | **Scope creep into a worksheet.** Prompts, prose and hints are each one small commit away, and each is excluded by round 3. | §0 restates the exclusions; a prompt of any kind is a scope change requiring the same review this plan got. |
| S-c | **Row alignment silently mis-pairs the grid** and the difference the grid exists to show is invisible or wrong. | Align by constraint and role, never by index; the declared difference set is the test, so a mis-pairing fails rather than misleads. |
| S-d | **The pen tool can construct states the templates never could** — self-intersections, zero-length pieces, a vertex exactly on a pole. | Rule 9: the engine already refuses these; the gate is that the pen cannot produce something that bypasses the refusal, tested with adversarial gestures rather than tidy ones. |
| S-e | **`localStorage` is new to this app** and is per-browser, silent, and easily stale across a schema change. | Version the progress key; treat absence and garbage identically; never let progress state change a *number* the app reports, only what is masked. |
