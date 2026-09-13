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
