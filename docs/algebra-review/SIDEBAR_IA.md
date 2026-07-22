# Algebra sidebar — information architecture

> Companion to [`WORKSPACE_REVIEW.md`](WORKSPACE_REVIEW.md), which remains the live status table for
> the numbered findings. This document is narrower and deeper: it asks *why* the sidebar is hard to
> read, and proposes a sequence. Where a claim here restates a numbered finding, it cites it.
>
> Anchor on function names, not line numbers — `algebra-ui.mjs` shifts by tens of lines per branch.

## Method

Three parallel surveys — a complete control inventory, an extraction of prior findings (so nothing
settled is re-litigated), and a reading of the *mathematical* task model out of `prove-plan.mjs` and
`algebra-store.mjs` — then direct verification of every load-bearing claim against the running app.

The claim that most of this plan rests on was checked by hand rather than taken on report: see
[§2](#2-the-sidebar-weights-escape-hatches-like-the-main-road).

---

## The diagnosis

The sidebar is not disorganized. It is organized around **the wrong axis**, twice, and it has one
concept that no amount of re-sectioning can fix.

### 1. It is grouped by technique, not by task

Sections are named for *what an operation is* — Assume, Pin values, Edit system, Reduce, Analyze,
Export. That is the taxonomy of the **library**. What a user needs is the taxonomy of the **job**:
where am I in the proof, and what is the next legitimate move?

The job has a canonical shape, and the codebase states it unusually clearly. Four independent proof
routes (`CERTIFY_STAGES`, `MOMENT_STAGES`, `RATIONAL_STAGES`, `TRIANGLE_STAGES` in
`prove-plan.mjs`) declare **the same five stage ids**: `regime → solve-real → filter → gauge →
assemble`. The mathematical task does not vary by route. Above that, `doProveExistenceUniqueness`
runs a fixed, ordered prelude: assume reality → propagate ×4 to fixpoint → saturate.

None of that structure is visible in the sidebar. The ①②③④ strip gestures at it and is inert
(finding **4.5** — four static spans, no handler, no state binding).

### 2. It weights escape hatches like the main road

**Verified directly, not taken on report.** `prove-plan.mjs` contains no reference to `groebner`,
`triangular`, `regularChain`, `minimalPrime`, or `decompose` — only `schurCohn` and
`boundarySimple`. And the orchestrator's own prelude calls exactly `assumeReal`,
`reducePropagate`, `saturateMobius`, then `runCertifyPlan`, escalating via `spuriousFactors` +
`substituteValues`.

So: **Gröbner bases, triangular decomposition, regular chains and minimal primes are never invoked
by `✦ Prove`.** They are manual tractability tools — what you reach for when the certified route
stalls. They are also the most visually prominent block in the panel.

A newcomer cannot tell which buttons constitute the proof and which are things to try when stuck.
That is the single largest legibility gap, and it is not in the existing finding list.

A sharper instance: the **Univalence constraints** palette (7 buttons) plus *Propagate constraints
→ current* is a **parallel legacy route that the certified pipeline bypasses entirely** —
`certifyLeaf` tests univalence with `schurCohnFold` + `boundarySimpleExact`, never by reading
constraint nodes. An entire section is off the certified path and says nothing about it.

### 3. Elimination is a cross-cutting concept filed as a section

**Thirteen operations remove a variable**, spread across seven UI locations:

| Where | Operation |
|---|---|
| Reduce | Eliminate picked variables · Eliminate with gauge · Gröbner with an eliminate list · Triangular (Wu pseudo-elimination) · Pin known quadrature data |
| Assume | Assume real / imaginary (*the single biggest variable-count lever*) · Detect symmetry → identify |
| Pin values | Set values (pins a variable **and its conjugate**) |
| Edit system | Define symbol / Abbreviate repeatedly |
| Analyze | Resolvent (eliminates all variables but one) |
| Node inspector | Sylvester resultant between two selected equations |
| Header checkbox | `fix φ(0)=w₀` — "removes w₀/w̄₀ from the variables" |

No sectioning fixes this, because the concept is orthogonal to the sections. It needs a **lens**,
not a folder — see Tier 4.

Worth stating explicitly, because they sit adjacent and read as though they belonged: **Saturate,
factor, decompose and regular chains are *not* elimination.** They change which points solve the
system, or split it; the variable set is untouched.

---

## New findings (verified, not previously recorded)

| # | Finding | Evidence |
|---|---|---|
| **S1** | *Elimination was a hidden mode of a differently-labelled button.* `doGroebner` read the module-level `elimSel`, switching to a block elimination order iff the picker — two collapsed levels down, inside Advanced inside Reduce — was non-empty. | **Fixed today.** Verified in-app: pick active, plain button now yields `Gröbner · grevlex`, not `Gröbner · elim Ā1,1`. |
| **S2** ✅ | *Neighbouring buttons differ silently in scope.* `Triangular decomp.`, `Saturate` and `Existence / uniqueness` operate on the canvas selection when there is one; `Dimension / count` and `Solve (numeric)` always take the whole column. Same section, no visible difference. | **Fixed** — see below |
| **S3** ✅ | *Labels overstate scope.* "Gröbner basis (**all eqns**)" defaults to `store.currentColumnIds()` — the last column only. "Copy LaTeX" copies **every node in the whole store, all branches**. | direct read of `doGroebner`, `copyLatex` |
| **S4** ❌ | ~~*Silent no-op at 3+ selection.*~~ **Withdrawn — the state is unreachable**: `algebra-canvas` caps the selection at two (`selected.shift()`). Derived from reading the consumer without checking the producer. The cap's *silence* is the real issue, and is now stated. | see Tier 2 |
| **S5** ✅ | *Unguarded exports.* `Download DAG (JSON)` and `Copy LaTeX` have no `store.size` guard and will emit an empty artifact silently, unlike their six guarded siblings. | `exportJson`, `copyLatex` |
| **S6** ✅ | *`fix φ(0)=w₀` re-seeds destructively with no confirmation.* Its `change` handler calls `seedFromCurrent()` whenever `store.size`, discarding the derivation. `confirmReplace` guards the `s` accelerator but **not** this checkbox and **not** the `Generate / re-seed` button click. | sharpens open finding **4.13** with a mechanism |
| **S7** | *Tooltip debt is larger than 4.3 closed.* Against the stated hard rule of ~120 chars: `solveNumeric` 489, `groebner` 433, `algFixW0` 371, `pin-data` 345, `saturate` 327, `bifurc-var` 303. Roughly 20 controls exceed it. Only 6 `data-str-title` hooks exist against ~53 hardcoded titles. | 4.3 fixed the CTA caption only |
| **S9** ✅ | *Basis replacements discard inequality nodes silently.* Gröbner reports `skipped`; `saturateMobius` and `triangularizeNodes` did not. The univalence palette is mostly inequalities, so building constraints and reducing once destroys them — and `✦ Prove` saturates in its prelude. | **Fixed** — reproduced in-browser, see the 1.2 section |
| **S8** | *Two sibling operations are two rows apart.* `Regular chains` is, by its own tooltip, "like Triangular decomp. above, but SATURATED by its initials" — the saturated form of its neighbour, filed in a different group. `doTriangular` even emits the unsaturated caveat that regular chains exists to remove. | `doDecompose`, `hasRegularityConditions` |

---

## What shipped today (Tier 0)

Splitting elimination out of Reduce, per request. Reduce now reads:

```
Reduce
├─ Eliminate variables      (remove unknowns; every consequence in the survivors is kept)
│    [eliminate: pick ▾]  Eliminate picked variables · Eliminate with gauge (all)
│    caption → what it computes, + pointer to the two-node Sylvester resultant
├─ Rewrite the system       (same solutions, better shape)
│    Gröbner basis · Triangular decomp.
├─ Narrow the system        (deliberately changes what solves it)
│    Saturate · Propagate constraints · Pin known quadrature data
└─ Split into cases         (one branch per component; the counts add up)
     Factor / simplify column · Decompose into components · Regular chains
```

Three things beyond the regrouping:

- The `eliminate` picker moved **out of Advanced**, where it was the buried subject of the act
  rather than a tuning knob. Only the monomial order remains there.
- `#alg-groebner` now does exactly one thing (**S1**).
- The two remaining groups are split by *what they do to the solution set*. Filing Saturate, Pin
  known data and Propagate under "same solutions, better shape" would have been a false claim about
  three of five buttons — the class of defect this project treats as a correctness bug.

---

## S2 — operation scope (shipped)

The severity was underestimated when this was first written. Measured in the running app on the
default seeded system: `Existence / uniqueness` over **two selected equations returns dimension 2**;
over the **whole column it returns dimension 1**. Different mathematics, same button, and the only
difference was a selection made on a canvas ~900px away. The narrowed answer arrived badged, with
the assumptions ledger attached, and stored in the results drawer — reading exactly like a verdict
about the whole system.

`doClassify` already *knew*: it skips caching the branch chip when a selection was used. It
disclosed the slice caveat, the factor-branch caveat and the incomplete-decomposition caveat, and
not this one. An omission in an otherwise meticulous pattern — an oversight, not a decision.

Three parts, all keyed off one registry (`SELECTION_SCOPED`) so the warning and the behaviour
cannot drift:

1. **Before the click** — a scope banner at the top of the sections, live only while a selection
   exists, naming the three ops that will narrow and stating that everything else uses the whole
   column. Held at full opacity when the sections recede for the inspector: a warning that fades
   exactly when the condition it warns about holds is worse than none.
2. **On the verdict** — `scopeCaveat` in the `sliceCaveat` idiom. It claims the **bound direction
   only where it holds**: dropping generators enlarges the variety (`V(J) ⊇ V(I)` for `J ⊆ I`), so a
   count over a strict subset of the current column is an *upper bound* on the full system's. A
   selection reaching into earlier columns is not a subset of anything current — it is a different
   system, and gets the scope statement with no bound.
3. **On the mutating ops** — `scopeNote` in the toasts of Saturate (which asserts the count is now
   *exact*) and Triangular decomp. Inconsistency is called out as the one verdict that survives
   narrowing in the strong direction: restoring the dropped equations can only shrink an already
   empty variety, so a subset being inconsistent proves the whole system is.

Not unified to one scope. Classifying a sub-system is genuinely useful — the fix is that it can no
longer happen without being said.

---

## 1.1 — the ①②③④ strip (shipped)

Closes **4.5**. Binding rather than deleting was the right branch of the review's either/or, and it
is right *now* specifically because Phases A–E gave the workspace a real state model to bind to.

The strip is a **readout, not a progress bar** — and the difference is the point. Each step is
`done` / `stale` / `todo`, plus one marked `next`:

| Step | done when | detail shown |
|---|---|---|
| ① Seed | a system exists | `5 eqns` (or `re-seed` when stale) |
| ② Assume | any active hypothesis | how many |
| ③ Reduce | ≥1 reduction column | `col 3` |
| ④ Analyze | a stored result still describes the current system | `✓`, or `stale` |

Every fact comes from the signal the panel *already* displays elsewhere, so the strip cannot
disagree with what it summarizes: hypotheses are the chips `renderHypotheses` builds, `staleSeed`
is exactly what `ensureSeed` refuses on, and ④ reuses the results drawer's own current/stale/branch
decision. **Progress can therefore go backwards** — reduce after analyzing and ④ drops from `✓` to
`stale`, because the verdict no longer describes the system. A progress bar could not say that.

Two behaviours worth recording:

- **A stale seed is the next action even when later steps show work.** `ensureSeed` refuses every
  downstream operation, so pointing at Reduce would point at buttons that will not run.
- **Steps are buttons that open their section**, which fixes the strip's old habit of naming panels
  that are collapsed by default and then not opening them. ✦ Prove is named in the tips: it
  performs all four, so running it lights the whole strip — the clearest available account of what
  it did.

### A latent bug this uncovered

The one pre-existing caller of "open a section" used `details.algebra-section:nth-of-type(2)`. That
meant **Reduce** when written, because *Assumptions* was then a single section. Finding **4.7** split
it into Assume / Pin values / Edit system, pushing Reduce from 2nd to 4th — and the selector went on
silently opening **"Pin values"** while running a decomposition whose controls live in Reduce.
Nothing threw; the wrong panel just unfolded. Confirmed in-browser, then replaced with a by-name
`openSection` helper that both call sites now share.

*Positional selectors over a list a later refactor can reorder are the hazard here* — worth
remembering, since the sidebar's sections are exactly such a list.

---

## 1.2 — certified route vs. manual toolkit (shipped)

Written up as a labeling gap. Investigating it turned up a **silent work-loss defect** underneath.

### S9 — basis replacements discard inequality nodes without saying so

A basis-replacement reduction (Gröbner · saturate · triangular · resultant) emits a fresh set of
**equality** generators, so a `>` or `≠` node in the column is consumed *by omission* — it simply
does not appear in the next one. Gröbner reported that as `skipped`. **`saturateMobius` and
`triangularizeNodes` did not**, and the column diff showed only a bare `−N gone`, which reads
exactly like the ordinary rewrite churn.

It bites hardest on the **Univalence constraints** palette, whose content is mostly inequalities.
Reproduced in-browser on the default system:

```
col 0   (●)₁ … (gauge), convex: Re(1+ζφ″/φ′) > 0, circle: ζζ̄ = 1
        ↓ Saturate
col 1   14 equality generators          ← the convexity condition is simply gone
        diff: "+11 new · 3 carried · −4 gone"   ← the only trace, and it reads as churn
```

And `✦ Prove`'s prelude *saturates*, so proving after building constraints discards them on the way
past — while never having read them anyway. The palette is a parallel route: `certifyLeaf` decides
univalence by an exact Schur–Cohn fold plus a boundary-simplicity test on each reconstructed φ.

**Fix.** `saturateMobius` and `triangularizeNodes` now return `skipped` in the same shape Gröbner
uses, on every exit path including the early-outs. The toast **names** what went (`dropped 1
inequality node (convex: Re(1+ζφ″/φ′) > 0)`), and the count is recorded in provenance so the column
label carries it permanently — `↳ saturate · (1−z̄z) · ⚠ 1 inequality node dropped`. A toast is
gone in seconds; this is the user's own modelling work, and it has to survive into an exported
derivation.

### The labeling half

- **Reduce** opens with what the certified route actually runs: `✦ Prove` does *assume real →
  propagate → saturate* by itself, and Gröbner / triangular / regular chains / minimal primes are
  never run by it.
- **Univalence constraints** says what it is: for your own analysis, not read by `✦ Prove`, and
  dropped by any basis reduction.

---

## The plan

Tiers are ordered by leverage-per-risk. Each is independently shippable.

### Tier 1 — make the canonical path visible *(recommended first)*

**1.1 Bind the ①②③④ strip to real state** — closes **4.5**. ✅ **Shipped** — see below.

**1.2 Separate the certified route from the manual toolkit** — §2 above. ✅ **Shipped** — see below.
It turned out to sit on top of a real defect, not just a labeling gap.

**1.3 Resolve the scope inconsistency** — **S2**. ✅ **Shipped** — see the section above. Landed
first, ahead of 1.1, because it was the one item here that could hand back a materially wrong
answer rather than merely an illegible one.

### Tier 2 — honest labels ✅ *shipped*

**2.1** "Gröbner basis (all eqns)" → "(current column)", which is what `doGroebner(null)` uses (**S3**).
**2.2** "Copy LaTeX" → "Copy all LaTeX", stating it takes every column and branch (**S3**).
**2.3** `exportJson` / `copyLatex` refuse an empty workspace instead of emitting an empty artifact (**S5**).
**2.4** ~~Disable `#alg-eliminate` at 3+ selection~~ — **the finding was wrong; see below** (**S4**).
**2.5** `fix φ(0)=w₀` routes through `confirmReplace`, with the box uncommitted until the re-seed (**S6** / 4.13).

#### S4 was not a defect — the state is unreachable

Filed as "at 3+ selection, `#alg-eliminate` stays enabled and `doEliminate` silently returns". The
inspector does branch on `sel.length`, and `doEliminate` does require exactly 2 — but
`algebra-canvas`'s `toggleSelect` caps the selection:

```js
selected.push(id);
if (selected.length > 2) selected.shift();
```

so the inspector never sees more than two. The finding came from reading `renderInspector` without
checking what the canvas can produce. A guard would have been dead code, shipped with tests
asserting it closed a live defect.

**The real defect is the cap's silence.** Ctrl+clicking a third card drops the oldest with no
indication — observed live, a selection reading `(●)₁ × (●)₁ (conj)` became `(●)₁ (conj) × (★)₁,₁`
with the first equation simply gone. The inspector now states the rule, and a test pins the cap
itself so that lifting it surfaces the inspector's two-node assumption rather than silently
invalidating it.

*Generalisable:* a finding derived from reading a consumer needs the producer checked before it is
called a bug. Two of the eight S-findings came from static reads; this is the one that did not
survive contact.

### Tier 3 — section order and misfiling *(closes 4.4)*

Move **Shape from moments** out of the workflow sequence — it is a *different input modality*, not
a step — and group it with `Seed A–S moments`, currently as far from it as the panel allows, under
a "Start from…" disclosure. Reorder to `Assume → Constraints → Reduce → Analyze → Export`.

⚠ Sequence this **after** Tier 1.2 decides what to say about Univalence constraints. If that
section is off the certified path, where it belongs in the order is a different question from the
one 4.4 was written to answer.

Also here: put `Triangular decomp.` adjacent to `Regular chains` (**S8**).

### Tier 4 — the elimination lens *(the cross-cutting fix; the most interesting)*

§3 says elimination cannot be a section. Two candidate shapes:

- **Variable-centric panel.** "`z̄₁` appears in 4 equations. Remove it by: assume real · pin a value
  · eliminate (Gröbner) · resultant against …" — routes to the existing thirteen operations from
  the question a user actually has, which is about a *variable*, not a technique.
- **A lens/filter** over the sidebar that highlights every control which reduces the variable count.

The first is more work and much more useful; it turns "which of these thirteen buttons do I want?"
into "what do I want to happen to this variable?" I'd prototype it read-only first — show the
variable census and what each option would cost — before wiring any of it to mutations.

### Tier 5 — tooltip debt *(S7)*

Apply the existing three-tier rule to the ~20 over-length tooltips, routing text through
`ui-strings.mjs`. Largely mechanical, and it makes Tier 1's captions consistent rather than a
local exception.

### Tier 6 — deferred infrastructure

**5.9** busy-lock id array (a hand-maintained list of 27 ids; adding today's button to it was a live
demonstration of the drift), **5.2** dark mode (unblocked — 5.1 shipped), **5.5** contrast (`.hint`
at ≈4.48:1, just under AA, and it carries most of the panel's prose), **5.8** export session
identity.

---

## Recommendation

~~**Tier 1 first, and within it, 1.3 before 1.1.**~~ **1.3 is done.** The reasoning held up under
measurement: it was a correctness-shaped bug wearing UI clothing, and the dimension-2-vs-1 split
above is what it looked like in practice.

~~**Next: 1.1 (bind the step strip), then 1.2.**~~ **1.1 is done too.**

**Tier 1 is complete** — 1.1, 1.2 and 1.3 all shipped.

**Next: Tier 2**, the honest-label cleanups. They are small and mechanical, and **2.4** (the
3+-selection silent no-op) is adjacent to the scope work and would reuse `SELECTION_SCOPED`. After
that, **Tier 3** (section order, closing 4.4) is now unblocked: 1.2 answered the question it was
waiting on — Univalence constraints is off the certified path and now says so, which settles where
it belongs in the order.

Worth noting how the three Tier-1 items actually went: each was written up as a legibility problem
and each turned out to sit on a concrete defect — a verdict that could describe a system you did
not ask about (**S2**), a section-opener pointing at the wrong panel since #111 (**1.1**), and
modelling work destroyed without notice (**S9**). *"The gap is almost entirely at the surfacing
layer"* remains true, but the surfacing layer is where the bugs were hiding.

Tier 4 is the item that would most change how the panel feels, and the one I would most want a
design conversation about before building.

---

## Explicitly not proposed

Refused on record in [`WORKSPACE_REVIEW.md`](WORKSPACE_REVIEW.md) — listed so they are not
mistaken for oversights:

- **Copy ▾ grouping** — 2 copy actions out of 9; a dropdown costs a click and saves one row.
- **Roving-tabindex arrow nav in the tablist** — the canvas binds arrows at document level; they
  would fight.
- **Auto-collapsing the φ/h card once a graph exists** — dropped *on measurement*: at 22 nodes it
  covers zero cards, so the mitigation would hide a feature to prevent something that does not
  happen.

And one technique that will not work if reached for: `text-overflow` cannot truncate collapsed
cards, because KaTeX emits atomic inline-block boxes.
