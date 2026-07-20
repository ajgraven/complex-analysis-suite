# QD Algebra module — workspace review

> Five-reviewer pass over the Algebra tab's flow and UI, commissioned to answer: *what would make
> this feel and function like a modern, professional workspace?* Scope covered sidebar IA, the DAG
> canvas, the end-to-end journey, engine-capability-vs-UI surface, and cross-cutting affordances
> (keyboard / undo / persistence / a11y / theming).
>
> **Status legend.** ✅ = independently verified against the running app or the source during this
> review. ▫ = reviewer-reported, plausible from the code, not separately confirmed.
>
> Line references are against `7457988`. `algebra-ui.mjs` shifts by ~46 lines between branches —
> anchor on function names, not line numbers.

## Status — what has already shipped

Findings are written as they were found; this table is the live state. Everything not listed
below is still open.

| Finding | Status |
|---|---|
| 0.1 dead "Split … into cases" | ✅ shipped — [#101](https://github.com/ajgraven/complex-analysis-suite/pull/101) |
| 0.2 forked branch labeled "Original system" | ✅ shipped — #101 (fixed in **three** surfaces: lane header, breadcrumb chip, export column picker) |
| 0.3 `≤` rendered on a `≥` lower-bound proof | ✅ shipped — #101 |
| 0.4 four verdict cards with no rigor pill | ✅ shipped — #101 |
| 0.6 factorization "absence as the answer" | ✅ shipped — [#103](https://github.com/ajgraven/complex-analysis-suite/pull/103) (three-state `factor()`, always-offered action, propagate+factor, column scan) |
| 1.1 no persistence | ✅ shipped — [#102](https://github.com/ajgraven/complex-analysis-suite/pull/102) (autosave + restore offer + beforeunload) |
| 1.2 no Ctrl+Z | ✅ shipped — #102 (bindings + `undoDepth`/`redoDepth` + disabled states) |
| 1.3 750 ms error toasts | ✅ shipped — #102 (8 s, click-dismiss, live-region roles) |

| 3b Tier-6 positive-dim escape hatch | ✅ shipped — [#105](https://github.com/ajgraven/complex-analysis-suite/pull/105) (`minimalPrimes` + `triangularDecomposition`: worker jobs, store queries, `applyComponent`, verdict-card action) |
| 2.2 `onStage` computed and discarded | ✅ shipped — [#106](https://github.com/ajgraven/complex-analysis-suite/pull/106) |
| 4.1 four buttons named "Apply" | ✅ shipped — #106 |
| 4.3 the 543-char CTA tooltip | ✅ shipped — #106 (now visible caption text; tooltip 83 chars) |
| 4.6 status bar blank after first op | ✅ shipped — #106 (`setStatus('')` → standing readout) |
| 3.1 canvas never follows the work | ✅ shipped — #106 — **and uncovered that `scrollToColumn` never worked**: this engine drops `scrollTo({behavior:'smooth'})` entirely, so the function *and the breadcrumb that was its only caller* were a silent no-op |
| 3.2 plain click ADDS to selection | ✅ shipped — #106 |
| 1.4 ✦ Prove re-seeds silently | ✅ shipped — [#107](https://github.com/ajgraven/complex-analysis-suite/pull/107) |
| 0.5 verdict card clips its own badge | ✅ shipped — #107 |
| 2.1 verdict destroyed on re-render | ✅ shipped — #107 (kept + demoted stale; Export-proof survives) |
| 5.1 eight phantom CSS tokens | ✅ shipped — [#108](https://github.com/ajgraven/complex-analysis-suite/pull/108) — **21 disagreeing (token, fallback) pairs**, all 114 fallbacks dropped behind a guard test |
| 3.4 no pan / wheel-zoom / search / context menu | ✅ pan, cursor-anchored zoom, search, keyboard nav — [#109](https://github.com/ajgraven/complex-analysis-suite/pull/109); context menu — [#112](https://github.com/ajgraven/complex-analysis-suite/pull/112) |
| 3.5 "Fit ↔" cannot fit past ~7 columns | ✅ shipped — [#110](https://github.com/ajgraven/complex-analysis-suite/pull/110) (condensed overview; `fitWidth` reports whether it actually fit) |
| 3.8 branches drawn flat; verdict/rail collide | ✅ shipped — #110 (grid chrome, docked verdict, branch tree, minimap draws nodes) |
| 3.9 empty canvas doesn't deselect | ✅ shipped — #109 |
| 3.7 no display cap in the inspector | ✅ shipped — [#111](https://github.com/ajgraven/complex-analysis-suite/pull/111) |
| 4.7 "Assumptions" = 19 unrelated controls | ✅ shipped — #111 (Assume / Pin values / Edit system) |
| 4.8 no true primary CTA | ✅ shipped — #111 (`button.primary` shipped unused across the module) |
| 4.11 disclosure state never persists | ✅ shipped — #111 |
| 3.3 inspector hides the whole workflow | ✅ shipped — #111 (sections recede rather than vanish) |
| 4.9 nine flat inspector buttons, Delete mid-row | ✅ shipped — #112 (`.danger`, moved) |
| 4.10 360px breakages | ✅ shipped — #112 |
| 5.7 `?` overlay's shortcut registry | ✅ shipped — [#115](https://github.com/ajgraven/complex-analysis-suite/pull/115) (`QoL.registerShortcuts(scope, items)`; the overlay composes global + the tab active **at press time**) |
| 5.3 focus management | ✅ shipped — #115 (context menu, variable picker, `?` dialog: focus in, trap, Esc, restore) |
| 5.4 ARIA gaps (tab↔panel) | ◐ partial — #115 wired `aria-controls`/`aria-labelledby`/panel `tabindex`, plus `role=menu(item)` and `aria-expanded`. Roving-tabindex arrow nav **inside the tablist** is deliberately not done: the Algebra canvas binds arrows at document level, so the two would fight |

| 4.2 φ/h reference outranks the workflow | ✅ shipped — [#116](https://github.com/ajgraven/complex-analysis-suite/pull/116) (collapsible canvas card, bottom-left; its `fix φ(0)=w₀` checkbox stayed behind — that is a *generation* choice, not a display option) |
| 3.6 collapsed cards clip with no marker | ✅ shipped — #116 (`text-overflow` cannot help: KaTeX emits atomic inline-block boxes) |
| — focus mode (isolate a lineage) | ✅ shipped — #116 (`computeLineage`'s set finally does something; `applyFilter` is the single writer of `.is-dimmed` so search and focus compose) |
| 2.1 one verdict slot, eleven writers | ✅ shipped — [#117](https://github.com/ajgraven/complex-analysis-suite/pull/117) (results drawer keyed `(track, branchSig)`; `current`/`stale`/`branch`) — **supersedes the #107 row above**, which only stopped a re-render destroying the *current* verdict; #117 keeps all of them |
| — column diff (what a step changed) | ✅ shipped — [#118](https://github.com/ajgraven/complex-analysis-suite/pull/118) (`+15 new · 2 carried · −3 gone` by exact polynomial key; multiset, zero parts omitted) |

**Still open.** From Tier 4: **4.4** (section order / "Shape from moments" misfiled), **4.5**
(the ①②③④ strip is still decoration), **4.12**, **4.13**. From Tier 5: **5.2** dark mode (5.1
was its prerequisite and is done), **5.5** contrast, **5.8**, **5.9**. From Tier 3: the **ghost
stub lane** that would let the fork *edge* render — deferred from #110 because it means drawing a
foreign track's column into the current view, touching `drawEdges`, `relayout`, the minimap, the
search filter and keyboard nav at once. Tier 6 beyond 3b, and Tier 2's 2.3–2.5, are untouched.

**Deliberately not done, with reasons** (so they are not re-proposed as oversights):

- *Copy ▾ grouping* (P4 leftover). `nodeActions` has exactly two copy actions out of nine.
  Grouping 2 of 9 behind a dropdown costs a click to reach either and saves one row.
- *Roving-tabindex arrow nav in the tablist.* The canvas binds arrows at document level; the two
  would fight.
- *Auto-collapsing the φ/h card once a graph exists.* Proposed, then dropped on measurement — see
  below.

**Noted, not fixed.** `doDimension` reports its answer (zero- vs positive-dimensional, solution
count) **only via a transient toast**. It was never one of the eleven verdict sites, so it is not
in the drawer either — the same "the workspace does not keep what it told you" problem, one layer
down.

**The six-PR rework is complete.** P1 (#108) → P2 (#109) → P3 (#110) → P4 (#111, #112) → P5 (#115)
→ P6a (#116) → P6b (#117) → P6c (#118).

**What P6 settled.**

- *The drawer costs no new grid track.* The results index and the verdict are the same concern —
  index above, detail below — so they share the `result` area. The width lives on the children,
  not the column, so with both hidden the column is 0-wide and the canvas gets the whole row.
- *A kept result must say which system it describes.* `(track, branchSig)` → `current` / `stale` /
  `branch`. The stale/branch split is not cosmetic: "the derivation has changed since" is true of
  the first and false of the second, because a cross-branch result has no history on the branch
  being viewed. Anything but `current` is muted with its rigor pill dimmed — a `=` redisplayed
  beside a system it never saw is a false attribution.
- *Measure before mitigating.* The plan had the φ/h card auto-collapse once a graph existed, to
  pre-empt it covering column 0. Measured at 22 nodes, scrolled and unscrolled, it covers **zero**
  cards: it only intersects column 0's x-band, and column 0 is the short *original* system while
  every reduction lands to its right. The mitigation would have hidden the feature to prevent
  something that does not happen.
- *CSS fails silently.* An edit left prose after a comment's `*/` plus a stray second `*/`; the
  parser discarded tokens until it resynced, taking a whole rule with it, and the card rendered
  unstyled. **Every existing test passed** — the file is still "valid CSS" to a regex. There is now
  a comment-balance guard that names the offending line.

**What P5 settled, and why it is shaped that way.** Two things are load-bearing beyond the
feature itself:

- *Accelerators dispatch through the button, never the handler.* `KEY_ACTIONS` maps a key to a
  **selector**, and the handler calls `.click()` on it. Every gate the click path carries —
  `setBusy` disabling it mid-worker, the `confirmReplace` strips added in #107 — is therefore
  inherited for free and stays in one place. Calling `doGroebner()` directly would work and
  would silently bypass the disabled state, letting a keypress start a second worker job mid-solve.
  A guard test pins both halves.
- *A keystroke asks before discarding a derivation, where a click does not.* Clicking a labelled
  button is aimed; brushing a key is not. `s` (re-seed) routes through `confirmReplace` even
  though `#alg-seed`'s own click handler does not — verified in-browser: the strip appears and
  the 22-card graph is untouched until confirmed.

Also folded in: the global default list advertised a Param-slice binding on *every* tab, so the
Algebra workspace listed a key with nothing to act on. It now registers under `param-slice`.
Measured in-browser after the change — QD: 2 rows, Param-slice: 3, Algebra: 16 in 3 groups.

One measurement from #103 worth recording here, because it quantifies 0.6 better than the
finding text does: the new column scan reports **"5 equations scanned — 0 factor, 1 proved
irreducible, 4 undetermined"** on a *freshly seeded* system. Under the old behavior all five
rendered as nothing, i.e. as if irreducible. Four of the five were cases where the engine had
given up.

## The one-sentence finding

**The engine is already a professional instrument; the gap is almost entirely at the surfacing
layer.** Nearly every item below is wiring, labeling, or re-ranking of capability that already
ships — not new mathematics. The recurring failure mode is *computed-then-discarded*: the engine
produces stage transcripts, bound directions, cross-check detail, proof-tree leaves, and N distinct
domains, and the renderer throws them away.

---

## Tier 0 — Defects that mislead the user or silently lose work

These are correctness-of-communication bugs, not polish. Given the project's honest-labeling
guardrail (`=` exact / `≤` bound / `≈` estimate), several sit directly on it. Worth fixing
independent of any redesign.

### 0.1 ✅ "Split … into cases" is a dead button
`spuriousFactors` returns hits shaped `{ index, label, factorCount, factors }`
(`algebra-store.mjs:2804`) — **there is no `nodeId` field**. `renderPositiveDimVerdict` reads
`h.nodeId` twice (`algebra-ui.mjs:2032-2034`):

- `store.applyFactor(undefined, k)` → `get(undefined)` → `{ok:false, reason:'node not found'}`
  (`algebra-store.mjs:2741`), and the caller's `if (r && r.ok)` guard swallows it. **No toast, no
  error, no state change — ever.**
- `seen['split:undefined']` collapses *every* general split across *every* equation into one button.
- The label reads `Split real eqn 1 into cases` — a `currentReimSystem` label, not a workspace node
  label, which is the visible symptom of the shape confusion.

This is the **primary offered action in the positive-dimensional verdict**, which the project's own
notes record as the common outcome for the general conjugate model. The hardest case offers a dead
button as its way forward.

Not a rename: `index` indexes `reim.polys` (the derived *real* system), where one complex node
generally becomes two real polynomials, so there is no 1:1 node mapping. Needs a reim-poly →
source-node back-map, or a reim-side split. Interim: drop the silent guard so the `reason` reaches
`showError`, and key `seen` on `h.index`.

### 0.2 ✅ A forked branch claims to be the original system
`forkTrack` writes the copied nodes at `column: 0` (`algebra-store.mjs:596`); `columnLabel`
short-circuits on `c === 0` and returns `'Original system'` before ever consulting provenance
(`algebra-ui.mjs`, `columnLabel`). Verified live — after forking, the new branch's first lane header
renders:

> **1 · Original system · φ(0) fixed** · current system · 4 eqns · 4 vars · ▸ **assume real: A1_1, C1_1, a1, z1**

The header contradicts itself in one line: it asserts the *original, unassumed* system while
displaying the four inherited reality assumptions. The breadcrumb agrees with the wrong half
(`1 original`). A branch forked five reductions deep will claim to be the starting point.

**Fix:** test for a `provenance.op === 'fork'` node in the column *before* the `c === 0` branch;
return `Forked from <track> · column <n>`. Offset the step badge by the fork column so numbering
stays comparable across branches. Give `PROV_UI.fork` the `column` field it lacks.

### 0.3 ✅ The rigor badge renders the opposite inequality on a lower-bound proof
`runProofTree` labels a truncated walk `bound: '≥'` with verdict prose saying *"the count is a LOWER
BOUND"*, and sets `rigor: 'bound'`. `rigorMeta('bound')` renders **`≤`**, documented in place as
"the algebraic count is an UPPER bound" (`algebra-canvas.mjs:544`). `pr.bound` is written into the
export JSON and read nowhere else.

**Fix:** add a `≥` level to `rigorMeta` and pass `pr.bound` into `setVerdict`. *(Already on the
backlog as review item #2; this is an independent re-confirmation with the precise mechanism.)*

### 0.4 ✅ Four verdict cards carry no rigor badge at all
`setVerdict` renders the pill only when `data.rigor` is truthy. Four of ten call sites pass none:
RCTD (`:1171`), Solve-for-a-variable (`:1282`), resolvent (`:2193`), bifurcation (`:2236`). Those
cards assert exact interval counts and closed-form roots **unbadged**, adjacent to correctly-badged
siblings. In a project whose central guardrail is the badge, the unbadged card is the ambiguous one.

**Fix:** make `rigor` mandatory at every call site (default `'unknown'`), and add it to the existing
`PROV_UI`-style coverage test.

### 0.5 ▫ The verdict card clips its own rigor badge and dismiss button
`.algebra-verdict` has `max-width: 360px` but **no `max-height` and no `overflow`**
(`style.css:788`), anchored `bottom: 12px` inside `#algebra-graph { overflow: hidden }`. A full card
(rigor pill, title, assumptions ledger, body, "Why this rigor", math 200px, solutions 140px, a 176px
plot, actions) comfortably exceeds 700px, grows *upward*, and clips at the top — losing the rigor
badge and the `×` first. Separately the breadcrumb (`z-index: 11`) paints *over* the verdict
(`z-index: 10`) below ~1000px width.

**Fix:** `max-height: calc(100% - 24px)`, flex column, sticky non-shrinking head, scrolling body.
Longer term, stop free-floating four absolutely-positioned overlays — make `#algebra-graph` a grid
with real bottom chrome and dock the verdict as a panel that *reduces* the viewport instead of
covering it.

### 0.6 ✅ Factorization: absence is the answer for four different questions
The control exists (`algebra-ui.mjs:1417`) but renders only when **all four** hold:
`exactly-one-node-selected && rel === '=' && column === maxColumn() && _factorable(id)`.

Verified live: on a freshly seeded system it appears on **0 of 5 nodes** (all seeded equations are
irreducible). Adding `A1_1^2 - 1` makes it appear immediately. Running *Assume real → Auto* (1→2
columns) makes that same provably-factorable node **lose** the button.

Worse, `Sym.factor` returns the *identical* `{ok:false}` for: genuinely irreducible; >300 terms;
degree >12; ≥7 variables; >200 terms with ≥3 vars; max degree >8; no squarefree main variable;
`!complete` from either Hensel path; a perfect power; or any thrown exception. The source is honest
about this — `sym-core.mjs:2307` and `:2325` both note such a polynomial "falls through and is
pushed whole (honest: not certified)" — **and that honesty is destroyed at the UI boundary**, where
`_factorable` collapses it to a boolean and the response to `false` is to render nothing.

The one message that would explain (`'No nontrivial factorization: irreducible by our methods…'`,
`:1180`) is **unreachable dead code**, reachable only from a button that exists only when `.ok` is
already true. Its parenthetical is also stale — it lists methods (1)–(3) and omits the bivariate Gao
and n-variate Hensel paths shipped since.

**Fix (this is the highest-value single change for the owner's stated concern):** make `Sym.factor`
return three-state — `reducible` / `irreducible` / `undetermined` + which cap fired. The information
exists at every `return`; it is discarded at `:2345`. Then **always render the button**:
- reducible → today's chooser
- irreducible → `Irreducible over ℚ(i) ✓` (upgradeable to a real certificate via
  `isAbsolutelyIrreducible`, which ships and is wired to nothing)
- undetermined → `Not factored — 9 variables exceeds the in-browser cap (≤6). Export to
  Singular/Sage.` wired to the existing Copy-CAS path

Also reconcile the README: `:514` describes the factor action, `:542-543` describes the same
inspector with a different, shorter action set.

---

## Tier 1 — Make the workspace safe to invest real work in

### 1.1 ✅ A derivation does not survive a reload
`algebra-store.mjs` has **zero** persistence (no `localStorage` / `sessionStorage` / `indexedDB`).
The tab's only stored state is one boolean (`algStepsHidden`). There is **no `beforeunload` handler
anywhere in the app**. A refresh, a crash, or a stray Ctrl+W destroys an hour of work with no
warning and no recovery — and QD is a **PWA**, so a service-worker update is itself a reload path.

**Fix:** debounced autosave of `store.exportDAG()` (which already round-trips) to IndexedDB on each
`checkpoint()`; "Restore your previous session?" on load; `beforeunload` guard while dirty.

### 1.2 ✅ Ctrl+Z does nothing, and undo is two unlabeled glyphs
The undo *model* is well-built — 26 checkpoint sites, snapshots covering nodes/edges/order/model/
assumptions/tracks. The *surface* is `↶`/`↷` in a floating canvas toolbar with no `aria-label` and
no keyboard binding. **`ctrlKey`/`metaKey` appear nowhere in the entire app** — verified across all
`.mjs`. Users who press Ctrl+Z and see nothing will reasonably conclude there is no undo. This
undercuts 1.1 and 1.4, whose only recovery path *is* undo.

**Fix:** bind Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z inside the existing guarded key handler; label the
buttons from the provenance the breadcrumb already computes; disable when stacks are empty; add an
**Undo** action to every mutating toast.

### 1.3 ✅ Error messages are on screen for 750 ms
`_showToast` defaults to **750 ms** (`qol.mjs:243`). The Algebra tab raises **50** `kind:'error'`
toasts and **not one** passes a `duration`. Several are load-bearing — including a ~300-character
warning that a copied Maple RCTD script will produce a *wrong* quadrature-domain count. Physically
unreadable, not dismissible, no `role`/`aria-live`, no trace once gone. The mechanism already
supports longer: the global error handler passes `duration: 6000` (`qol.mjs:278`).

**Fix:** make `kind:'error'` sticky or ≥8 s; `role="status"` on the container (`assertive` for
errors); route long warnings to the persistent `#alg-error` panel instead of a toast.

### 1.4 ▫ ✦ Prove silently replaces the user's derivation
The C1/C2/C3 routes call `seedFromPolys` and the from-data route `seedFromSystem`; both
`clearGraph()`. Routing is decided from `hData` shape *after* the click, so it can't be anticipated.
It is checkpointed — but there is no warning, no "your derivation was replaced — undo to restore",
and per 1.2 undo is invisible.

**Fix:** when `store.maxColumn() > 0`, either confirm, or better `forkTrack` into a branch labelled
`prove · moment route`. The track machinery exists, and this makes the proof comparable side-by-side
with the manual work.

### 1.5 ▫ Destructive actions have no confirmation and no undo affordance
Deleting a branch is one unguarded click on a `×` chip; "Load DAG (JSON)" replaces the whole graph
without asking; `Delete`/`Backspace` removes a node **and all descendants** with only a toast — and
that binding is absent from the `?` overlay, making it simultaneously undiscoverable and dangerous.
All are undoable in principle, undiscoverable in practice.

**Fix:** an **Undo** action button on these toasts. Cheapest high-value fix in the document — the
store already supports it.

---

## Tier 2 — Give the result a home

### 2.1 ▫ The verdict is destroyed by routine navigation
`render()` hides the verdict unconditionally, and `rerender()` runs on every reduction, branch
switch, suggestion apply, **and tab re-entry**. `Export proof (JSON)`, `Show exact boundary curve`
and `View in the QD plot` exist *only* on that card. So the intended flow — prove (tens of seconds)
→ *View in the QD plot* (which switches tabs) → come back — returns to a workspace with **no verdict
and no way to export the proof** short of re-running everything.

The staleness machinery already exists: `_branchSig` gates branch chips. The verdict card gets none
of it.

**Fix:** hold the last `ProofResult` with its `_branchSig`; on rerender, mark it *stale* rather than
destroying it. Add a persistent `⚑ verdict` chip to the breadcrumb. Move `Export proof (JSON)` into
the sidebar Export section so it is reachable without the card.

### 2.2 ✅ The strategy transcript is computed and thrown away
`CERTIFY_STAGES` / `MOMENT_STAGES` / `RATIONAL_STAGES` / `TRIANGLE_STAGES` carry a `title` and a
`why` per stage — ~20 descriptions — and the engine faithfully emits `ctx.onStage(id)` at each.
**`onStage` has zero occurrences in `algebra-ui.mjs`.** The strings reach the user only inside a
downloaded `qd-proof.json`. During a 30-second prove the entire feedback is one line describing a
sub-step of stage 1 of 5.

**Fix:** supply `onStage` in `buildPlanCtx` and the three route contexts; render `Stage 3/5 —
Univalence filter` plus its `why` in `#alg-status`; list completed stages on the verdict card. Zero
engine work; the cheapest large legibility win available.

### 2.3 ▫ Results are scattered across three surfaces, one being the browser console
`doAutoSolve` writes the full solution set to `console.table` and six rows to the card; `doSolve`
shows eight and says "full set in the console"; `doShapeFromMoments` writes to a sidebar `<div>` and
never touches the card. "Open DevTools" is not a step in a professional workspace.

### 2.4 ▫ Only 1 of N domains is ever shown
Every distinct domain is computed with its full reconstructed map (`distinctPhis`, `genuine`); the
UI plots index `[0]`, captioned "showing 1 of N", with no picker.

**Fix:** a `◀ 1/N ▶` stepper; route the boundary-curve and QD-plot actions through the selection.

### 2.5 ▫ Numeric cross-check detail is attached and never read
`pr.cc = {checked, maxResidual, oracleMatch, oracleAvailable}` is produced and never surfaced, so
"no oracle available" and "the oracle disagrees" are indistinguishable.

---

## Tier 3 — Make the canvas a workspace rather than a rendered document

### 3.1 ▫ The canvas never follows the work
Applying an assumption appends a column at the far right of an already-wide track and **nothing
scrolls there**; the sole feedback is a toast reading `→ column 7`. `scrollToColumn` exists and has
exactly one caller (breadcrumb chips). It also sets only `left`, so jumping into a short lane lands
on blank space and the flash animation plays off-screen.

**Fix:** `render({ focus: columnIndex })`, passed whenever the max column grows and after a fork.
Set `top: 0` in the same call. The movement *is* the message — it replaces the toast.

### 3.2 ✅ A plain click *adds* to the selection instead of replacing it
`toggleSelect` is bound to bare `click` with no modifier check. Click node A then node B and both
are selected; the sidebar silently switches to the two-node "Eliminate" panel and B's own actions
become unreachable. A third click silently evicts the oldest. *(Hit this directly while driving the
app — my first node scan accidentally measured multi-select.)*

**Fix:** plain click replaces; `Ctrl/Cmd/Shift+click` toggles, capped at 2 with an explicit refusal
rather than silent FIFO.

### 3.3 ▫ Selecting a node reveals controls ~900px away in another pane — and hides everything else
`renderInspector` un-hides `#alg-inspector`, **hides the entire `#alg-sections`**, and never scrolls
anything into view (there is no `scrollIntoView` call anywhere in the module). Above the inspector
sit the sticky header, the suggestions block, and the φ/h reference. The user clicks a node and
nothing visibly happens — and loses access to Assumptions/Reduce/Analyze while selected.

**Fix:** (a) scroll the inspector into view; (b) *collapse* the sections rather than hiding them;
(c) put a small selection context bar on the canvas carrying the highest-frequency actions, with
"⋯ more" focusing the sidebar. Nothing in the sidebar currently hints the DAG is interactive at all.

### 3.4 ▫ No pan, no wheel-zoom, no search, no context menu
No `wheel` handler, no drag-to-pan, no `contextmenu` listener anywhere in the canvas module. The
only pointer navigation is the scrollbar or an off-by-default 168px minimap. Ten node actions exist,
all reachable only via the far sidebar. Column headers offer nothing.

**Fix:** drag-pan on background; `Ctrl/Cmd+wheel` zoom anchored at the cursor; `Shift+wheel`
horizontal. A toolbar search matching label / variable / provenance op, dimming non-matches. A
context menu built from the *same* action list `renderInspector` computes (factor it into a shared
`nodeActions(id)`).

### 3.5 ▫ "Fit ↔" cannot fit past ~7 columns and reports a zoom that doesn't fit
`ZMIN = 0.4` against hardcoded 300px lanes; ten columns need 0.27. The button returns 0.4, writes
"40%", and leaves content cut off. And 0.4 isn't readable anyway — the whole track is
`transform: scale`d, so 12px math renders at ~5px *and so do the column headers*: wayfinding
degrades at exactly the same rate as content.

**Fix:** below a threshold, switch to a condensed mode (force-collapse, ~160px lanes, one-line
`deg · terms` chips) with headers at **unscaled** type. Reserve `scale` for the 0.7–1.6 band.

### 3.6 ▫ Collapsed cards clip mid-expression with no truncation marker
Cards are collapsed by default and rely on `text-overflow: ellipsis` over KaTeX output — whose root
is a single `inline-block` span, which `text-overflow` cannot truncate. In practice: a hard clip
with no `…`. For math this is a correctness hazard — `x² + 3y` might be `x² + 3y − 7z + …`.

**Fix:** build the preview from structure (leading terms + `+ 9 more · deg 6`), not by clipping the
full render.

### 3.7 ▫ Long polynomials are unreadable, and the sidebar has no cap
Above `DISPLAY_CAP = 120` terms the card shows `[347 terms — Copy / Export]`, which tells you
nothing (not degree, not surviving variables, not the leading term). Below the cap, a 60-term
polynomial is read through a ~284px window inside a horizontally-scrolling canvas at scaled zoom.
**And the cap is not applied in the inspector** — `renderInspector` typesets `n.poly.toLatex()` with
no size check, so a post-Gröbner node with thousands of terms typesets in display mode on the main
thread. The canvas defends against this; the sidebar does not.

**Fix:** apply `DISPLAY_CAP` in the inspector; add a per-node "Open" full-surface overlay with
wrapped output; make the placeholder informative (`deg 12 · 347 terms · vars … · lead …`).

### 3.8 ▫ Branches are drawn as a flat list, and the fork edge never renders
`render` filters to the active track, so only one branch is ever visible, and `drawEdges` skips any
edge whose endpoint isn't in the DOM — which is exactly the fork edge. The trackbar renders every
branch as a flat sibling despite `parentId`/`forkColumn` being available (spent on a `title`
tooltip). For a tool whose model is a ProofTree of case splits, the tree is the one thing not drawn.

### 3.9 ▫ Clicking empty canvas doesn't deselect
Cards call `stopPropagation()` — implying a background handler was intended — but none was ever
registered. Exits are `Esc` and a "Done" button in the off-screen panel. One line to fix.

---

## Tier 4 — Sidebar information architecture

Census: **~67 interactive controls** in one panel, 53 `title` attributes totalling ~7k characters,
29 inline `style=` attributes, 1 of 7 sections open by default. *(The census is the pre-rework
snapshot. The sidebar now has **8** sections — 4.7 split "Assumptions" into Assume / Pin values /
Edit system — and the open state persists per-section, so "1 of N by default" no longer applies
after the first visit.)*

### 4.1 ✅ Four buttons labeled "Apply"; two labeled "Copy"
`alg-real-apply`, `alg-val-apply`, `alg-def-apply`, `alg-eq-apply` — all labeled exactly **"Apply"**.
`alg-copy-mma`, `alg-copy-cas` — both exactly **"Copy"**. The only disambiguator is an 11px muted
grey label above each, the weakest type in the panel. A screen reader announces "Apply, button" four
times. Separately, "Auto", "Auto-abbreviate" and "★ Auto-reduce & solve" are three unrelated Autos.

**Fix:** verb+object throughout — "Assume real", "Set values", "Define symbol", "Add equation",
"Copy column", "Copy for Maple".

### 4.2 ✅ The φ/h reference is always-visible, non-collapsible, and outranks the workflow
`.algebra-ref-block` is a plain `<div>` (verified: no `<details>` anywhere) between the header and
the sections, body capped at 230px. It is **read-only reference material** occupying the panel's
most permanent high real estate, while every *actionable* step below it sits behind a closed
`<details>`. With no solve loaded it still occupies the block to render a placeholder line.

*(Note: not fixed by the sidebar PR, which addressed only the sticky-header overflow.)*

**Fix:** make it a `<details>`, open on first visit and closed once seeded — or move it onto the
canvas as a corner card, since it is reference for reading the graph.

> **✅ Shipped in [#116](https://github.com/ajgraven/complex-analysis-suite/pull/116)** — the second
> option. It is a collapsible card in the canvas's bottom-left corner slot (`mountReferenceCard` →
> `canvas.corner`), reclaiming ~230px of sidebar. The "closed once seeded" half of the first option
> was *deliberately not* taken: measured at 22 nodes, scrolled and unscrolled, the card covers zero
> cards, so auto-collapsing would have hidden the feature to prevent something that does not happen.
> Its `fix φ(0)=w₀` checkbox stayed in the sidebar — that is a generation choice, not a display one.

### 4.3 ✅ The product documentation lives in native tooltips
~7k characters across 53 `title` attributes; 9 exceed 200 chars; the ✦ Prove tooltip alone is ~540.
A native `title` appears after ~1s, dismisses on pointer move, is unreachable by keyboard, and is
invisible on touch. **The content is good** — it is the substance of the tool — stored in the least
readable affordance the platform offers. Only 6 `data-str-title` hooks exist against 53 hardcoded
ones, bypassing the `ui-strings.mjs` single-source-of-truth policy.

**Fix:** three tiers — one line in `title`; the CTA's pipeline description as persistent caption
text; algorithmic detail into a per-section `?` popover (the `.help-popover` component exists).
Hard rule: nothing over ~120 chars in a `title`.

### 4.4 ▫ Section order contradicts the stated workflow
DOM order is Assumptions → Reduce → Analyze → **Shape from moments** → Univalence constraints →
Export. "Shape from moments" isn't a step in the column workflow at all (paste moments, read a
reconstruction, nothing enters the graph) and is wedged mid-flow — while `Seed A–S moments`, the
*other* moment feature, sits in the primary button row, maximally far away. "Univalence constraints"
is a *modeling* step placed after Analyze. The source comments read 1, 3, 4, 4b, 5, 6 — there is
no 2.

**Fix:** Assumptions → Constraints → Reduce → Analyze → Export; group the two moment features under
a "Start from…" disclosure beside the seed controls.

### 4.5 ▫ The ①②③④ strip is decoration
Four static spans, no click handler, no current-step highlight, no state binding; steps ③ and ④
point at sections collapsed by default; it never mentions ✦ Prove, the path the whole orchestrator
redesign was built to make primary.

**Fix:** bind each chip to its section (open + scroll), highlight from store state, add a trailing
"…or skip to ✦ Prove". ~20 lines converts the panel's weakest element into its state-legibility
backbone. Otherwise delete it — a decorative fake-progress bar is worse than nothing.

### 4.6 ▫ No steady-state answer to "where am I?"
`#alg-status` is the sidebar's only state surface, and `setStatus('')` appears at **23 sites** — on
essentially every completion path. `rerender()` never touches it. After the first successful run the
readout goes empty and stays empty. Everything answering "where am I" lives on the canvas.

**Fix:** make `#alg-status` a persistent state bar maintained by `rerender()` —
`col 3 of 3 · 14 equations · zero-dim · branch t0 · 2 assumptions` — with transient progress
layered over it.

### 4.7 ▫ "Assumptions" is four unrelated tools under one heading
~19 controls: assume-real, set-values, define-substitution, add-equation — the last two of which are
not assumptions but system edits. Separated only by inline `margin-top:8px`.

### 4.8 ▫ Seven undifferentiated primary buttons; two are near-duplicates
✦ Prove and ★ Auto-reduce are strictly ordered in strength (Prove adds saturation, the univalence
filter, the gauge quotient, and tree escalation) but render identically, and the distinction lives
in a 543-char tooltip. `Generate / re-seed` **replaces the whole graph** at equal visual weight
between them. The app ships `button.primary` and `button.danger`; **neither is used anywhere in the
algebra module**.

**Fix:** one true primary (`#alg-prove`, full width, one-line caption). Demote ★ into Analyze or fold
it into Prove as a "skip certification" option. Add "Upgrade to the certified count (✦ Prove)" as an
action on every `classify`-badged card.

### 4.9 ▫ Nine inspector buttons in one flat row, with Delete mid-row
Delete sits between "Show steps" and "Generate conjugate" with identical styling, while
`button.danger` exists unused. At 360px the row wraps to four ragged lines.

### 4.10 ▫ 360px breakages
At the clamp floor there are 328px of content width. Concrete failures: the five-button primary row
wraps to 3 ragged rows; `.algebra-value-row`'s preview at `flex: 1 1 100%` always forces a second
line (two lines per pinned variable); the CAS line needs ~400px and strands its params input; the
constraint palette's hard `1fr 1fr` wraps "Injectivity (global)" to two lines; the resolvent and
bifurcation selects get ~90px — about six characters, less than `A_{1,1}`.

### 4.11 ▫ Disclosure defaults are inverted, and nothing persists
Only Assumptions is open — the section that most deserves collapsing — while the actual loop
(Assume → Reduce → Analyze) costs a click on every reload. No `<details>` state is persisted.

### 4.12 ▫ Batch/single control pairs split across the panel under different names
"Propagate constraints → current" vs "Propagate to current system"; "Gröbner basis (all eqns)" vs
"Gröbner". Also `Detect symmetry` in practice only clears session dismissals, since the suggestions
list already repopulates on every rerender.

### 4.13 ▫ `fix φ(0)=w₀` is a destructive re-seed styled as a display toggle
It sits beside "show values" with identical styling under "φ / h reference", but calls
`seedFromCurrent()` — rebuilding the graph and discarding the derivation.

---

## Tier 5 — Foundation and polish

### 5.1 ✅ Eight CSS custom properties are referenced but never declared
`--c-error`, `--c-error-bg`, `--c-error-text`, `--c-info-bg`, `--c-info-text`, `--c-link`,
`--c-danger`, `--danger` — all used in `var()` position, **none declared in `:root`**. Every one
silently renders its hardcoded fallback, so the Algebra tab's error / info / link / danger colors
bypass the token system and cannot be themed. Visible consequence today: the "real" hypothesis chip
and the "imaginary" chip resolve to two near-identical blues for a semantic distinction that
matters. Most algebra fallbacks are written as `#2b7` (green) while `--c-accent` is `#2d70c8`
(blue) — the fallbacks encode a design intent the app no longer has.

**This is the prerequisite for dark mode**, which is why it is cheap to pair them.

### 5.2 ▫ No dark mode — and the boot overlay flashes dark→light
`:root` is a single light palette. The only `prefers-color-scheme` query in the app is the boot
overlay, and it is **inverted**: dark by default, lightening only when the user prefers *light*. A
dark-mode user gets a dark splash snapping into a fully light app.

### 5.3 ✅ Zero focus management
Not a single `.focus()` call in any `.mjs`. Tab activation leaves focus on the tab button; the
picker dropdown opens without moving focus and isn't arrow-navigable; `#alg-error` appears
unfocused; the `?` overlay has no focus trap, so Tab walks out of it into the page behind.

### 5.4 ▫ ARIA gaps against the app's own pattern
`#alg-status` and `#alg-error` are bare `div`s with no `role`/`aria-live` — while the QD tab does it
correctly (`role="status" aria-live="polite" aria-atomic="true"`). The tab system has roles and
`aria-selected` but no `aria-controls` (zero in the repo) and no arrow-key navigation. The whole
Algebra tab contains exactly one ARIA usage.

### 5.5 ▫ Contrast: the status line is the least legible text in the app
`#controls-algebra .hint` is `font-size: 70%` and `--c-muted` `#777` on white is ≈**4.48:1** — just
under WCAG AA, and worse on the `#f3f4f6` app background. This class carries most of the tab's
explanatory prose *and* `#alg-status`.

### 5.6 ▫ `prefers-reduced-motion` not honored by the column-flash animation
The app gates two other animations correctly; `algebra-col-flash` fires on every breadcrumb jump
ungated.

### 5.7 ▫ The `?` overlay never learns the tab's shortcuts
`openShortcutsOverlay(items)` accepts a custom list; **no caller passes one**, so it always renders
three generic entries. `Esc` and `Delete` are therefore undiscoverable — while `ui-strings.mjs`
actively advertises the `?` key. Also: the intro hint says "press ?" for the full guide, but `?` is
globally bound to this overlay; the real guide is a ~1,390-character unbroken paragraph behind a
22px toggle.

### 5.8 ▫ Exports have no session identity
`exportJson` always writes `qd-algebra-dag.json`, so repeated exports collide and are
indistinguishable. No derivation name, no timestamp, no recent list.

### 5.9 ▫ The busy-lock is a hardcoded id array that will drift
`setBusy` disables 26 controls by string literal; some mutating controls are absent (correctly
relying on `busyGuard()`), producing "half the panel greys out" states.

**Fix:** tag lockable controls with `data-busy-lock` and query for it.

---

## Tier 6 — Engine capability with no UI path

Verified by grep as having **zero** references outside `sym-core.mjs` and tests. Each is a shipped,
tested capability behind no control. `docs/ALGEBRA_EXTENSIONS.md` already flags this class as
*"shipped-but-hidden … exposure, not math"*; this pass confirms it and extends the list.

| Capability | Symbol | Why it matters here |
|---|---|---|
| ~~**Minimal primes / primary decomposition**~~ | `minimalPrimes` | ✅ **Wired in [#105](https://github.com/ajgraven/complex-analysis-suite/pull/105)** — worker job, store query, `applyComponent`, verdict-card action. (The "dead button (0.1)" it referenced also shipped, in #101.) |
| ~~**Regular chains (saturated)**~~ | `triangularDecomposition` | ✅ **Wired in #105**, same route. The saturation warning now has the remedy it was pointing at. |
| **Absolute irreducibility** | `isAbsolutelyIrreducible`, `bivariateAbsFactorCount` | Can positively *certify* irreducibility — the missing counterpart to 0.6 |
| Radical of a zero-dim ideal | `radicalZeroDim` | Direct fix for "N with multiplicity vs N distinct" |
| Ideal membership | `inIdeal` | "Is this equation already implied?" |
| Ideal intersection / quotient | `idealIntersect`, `idealQuotient` | Only the hardcoded Möbius saturation is exposed |
| Parametric Gröbner | `comprehensiveGroebnerSystem` | The in-browser alternative to the Maple-RCTD round-trip |
| Plane-curve genus | `curveGenus` | Boundary-curve invariant |
| Power sums / Newton | `powerSums`, `coordinateMoments`, `charPolyByTraces` | Σzⱼ, Σ\|zⱼ\|² across *all* solutions without solving |
| SOS certificate check | `verifySOS` | The rigorous-bound (`≤`) primitive |
| Padé / rational reconstruction | `padeApproximant`, `rationalReconstruct` | |
| Series calculus | `seriesLog`/`Exp`/`Deriv`/`Integral`/`Compose`/`Inverse` | |
| Signature Gröbner (GVW) | `buchbergerSig` | Opt-in flag, no UI toggle |
| Generic saturation `I : f^∞` | `saturate(I, f)` | Only the hardcoded Möbius variant reaches the UI |
| Standalone univalence oracles | `rationalUnivalence(t,d)`, `triangleUnivalence(c)` | Scalar-in, verdict-out, documented thresholds — textbook slider controls |
| msolve import | `store.importMsolve` | **The return leg of the shipped "Copy msolve (.ms)" export.** RCTD has both legs; msolve has only the outbound one. |

Also: the C1/C2/C3 prove routes are auto-selected first-match-wins from `hData` shape with **no
control, no override, and no indication which route ran** except the verdict prose; tree escalation
is exclusive to ✦ Prove with `maxDepth`/`maxBranches` hardcoded; and the monomial-order select and
elimination picker are **two collapsed levels deep** (Advanced inside Reduce).

---

## Recommended sequence

**First — the four that mislead.** 0.1 (dead split), 0.2 (fork mislabel), 0.3 (inverted badge),
0.4 (missing badges). All small, all sit on the honest-labeling guardrail, none require design
decisions.

**Second — make it safe to invest in.** 1.1 (autosave), 1.2 (Ctrl+Z), 1.3 (readable errors). These
three together change the *character* of the tool more than anything else in this document, and all
three build on machinery that already exists.

**Third — the owner's named concern.** 0.6 (three-state factorization) plus the Tier-6 pairing of
`minimalPrimes` + `triangularDecomposition` as the positive-dim escape hatch. This is where
"simplifying and reducing the various equations" actually lands.

**Fourth — cheap legibility.** 2.2 (`onStage`, zero engine work), 4.1 (name the buttons), 4.3
(tooltips → real UI text), 4.6 (a persistent state bar), 3.1 (canvas follows the work), 3.2 (click
semantics).

**Then the redesign proper.** Tier 3's canvas work and Tier 4's IA restructure are where the
"professional workspace" feel is won or lost, and they are worth doing as a coherent pass rather
than piecemeal. 5.1 → 5.2 (tokens then dark mode) is a natural self-contained project.
