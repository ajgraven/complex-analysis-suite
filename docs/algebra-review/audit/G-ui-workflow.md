# Track G — UI Clarity & Workflow (Algebra module)

**Scope:** `apps/quadrature-domains/app/algebra/algebra-ui.mjs` (2671 L),
`algebra/algebra-canvas.mjs` (511 L), the `PROV_UI` / `PROV_STORE` registries
(`algebra-ui.mjs` + `algebra-store.mjs`), plus `ui-strings.mjs`, `HELPTEXT.md`,
`vitest/algebra-provui.test.ts`. **Read-only audit.** All paths absolute-relative to the
repo root; line numbers verified against the files on branch `algebra-maturity-review`.

---

## 1. Summary of the current data → verdict UX

The Algebra tab is a genuinely capable *derivational* workspace — an append-column DAG of
KaTeX equation lanes with branch tracks, undo/redo, lineage highlighting, a rich toolbar of
provenance ops, honest slice-caveat prose, and a verdict card with a one-click boundary-curve
/ QD-plot hand-off. But it is a **workbench, not a pipeline**. There is **no single "prove
existence/uniqueness" orchestrator**. Instead there are *three* overlapping analysis buttons
(`★ Auto-reduce & solve`, `Existence / uniqueness`, `Certify univalence`) that return *three
different numbers* of differing rigor, and the **authoritative** one (`Certify univalence`,
the only path that filters non-univalent solutions and quotients the rotation gauge) is
buried in a collapsed section and does **not** run the reduction chain itself — so on a fresh
seed it usually dead-ends in a positive-dimensional wall. Meanwhile the marquee button
`★ Auto-reduce & solve` prints "Unique quadrature domain" from a **raw algebraic real count**
it never univalence-filtered. Rigor is carried almost entirely by prose inside a single
flat-styled verdict-card text node, so a `⚠ PARTIAL … LOWER BOUND` result and a
`certified (RUR + exact Sturm)` result look identical at a glance. The net effect: a
first-time research-mathematician user can very plausibly read a slice-restricted, un-certified
*algebraic* count as a certified geometric existence/uniqueness theorem.

---

## 2. The ACTUAL click-path a first-time user must follow today

Starting from "I have exact quadrature data" and wanting "a citable existence/uniqueness verdict":

1. **[FRICTION — wrong entry point]** The Algebra tab is *gated on an already-computed numeric
   solve.* `activeEnv` is only set when a **classical bounded QD has been solved on the QD tab**
   (`isClassicalBounded` gate, subscribe at `algebra-ui.mjs:2647-2650`; every op falls back to
   `STR.noSolve = "No classical bounded QD solved yet — solve one on the QD tab first."`,
   `ui-strings.mjs:374`). So the user must **first go to a different tab and run a numeric solve**
   before the "proof" workspace will do anything. The tool that is supposed to *prove* existence
   presupposes you already have a numeric solution. (Two exceptions — `Seed A–S moments`, order-2
   only, and `Shape from moments` — accept data directly but are niche.)

2. Switch to the Algebra tab. It auto-seeds column 0 from the current solve
   (`tab-changed` handler, `algebra-ui.mjs:2634`). Good: no manual "Generate" needed.

3. **[FRICTION — which button?]** The user faces a pinned header whose most prominent, star-marked
   CTA is `★ Auto-reduce & solve` (`algebra-ui.mjs:826`), plus `Generate / re-seed` and
   `Seed A–S moments`. The two *other* verdict buttons (`Existence / uniqueness`,
   `Certify univalence`) live inside the **Analyze** `<details>` section, which is **collapsed by
   default** — only **Assumptions** is `open` (`algebra-ui.mjs:857` vs `:904`). The authoritative
   verdict button is one extra disclosure click away and visually subordinate to a less-rigorous one.

4. The naive path: click `★ Auto-reduce & solve`. It auto-assumes reality (if `h` is real-axis
   symmetric), runs linear propagation to a fixpoint, classifies, and solves for real solutions
   (`doAutoSolve`, `:1542`). It reports e.g. **"Unique quadrature domain (1 real solution)."**
   (`:1576`). **[CRITICAL FRICTION]** This count is a *raw algebraic real-solution count on the
   real slice* — it has **not** been univalence-filtered and the rotation gauge has **not** been
   quotiented. The user reasonably reads "Unique quadrature domain" as the theorem. It is not.

5. The *correct* path additionally requires the user to know to expand **Analyze** and click
   `Certify univalence` (`doCertifyUnivalence`, `:1785`) — the only path that reconstructs each
   φ, tests univalence (Schur–Cohn + boundary double-points), and merges gauge copies
   (`:1858-1890`). Run **after** step 4 it uses the reduced current column and can certify. Run
   **without** step 4 (i.e. as the first thing clicked) it classifies the raw conjugate-model seed
   and typically returns **"Underdetermined: a positive-dimensional family … Fix the rotation
   gauge or pin a forced variable"** (`:1809`) — a dead-end for anyone who doesn't know to reduce first.

6. If tractable, the verdict card shows e.g. "Unique quadrature domain ✓ — 1 genuine QD of 2 real
   solutions (1 gauge/rotation copy merged) · real-solution count + locations certified (RUR + exact
   Sturm)" with optional `Show exact boundary curve` / `View in the QD plot` actions
   (`:1947-1972`). This *is* a citable result — but only reachable via the undocumented
   "Auto-reduce, **then** expand Analyze, **then** Certify" sequence.

**Minimal click-path to an authoritative verdict (best case):** QD-tab solve → open Algebra
(auto-seed) → `★ Auto-reduce & solve` → expand **Analyze** → `Certify univalence`. Two analysis
clicks plus a disclosure, with **no** on-screen cue that the second click is the one that matters
or that the first click's "quadrature domain" label was provisional.

**Where a first-time user gets stuck or misuses an op:**
- Stops at `★ Auto-reduce & solve` and cites an un-certified, non-univalence-filtered count.
- Clicks `Certify univalence` first, hits the positive-dimensional wall, and concludes the tool failed.
- Clicks `Solve (numeric)` expecting solutions on screen and gets "See console for coordinates"
  (`doSolve`, `:2222`).
- Cannot tell `Existence / uniqueness` from `Certify univalence` from `★ Auto-reduce & solve` —
  three buttons, three numbers, no stated ordering of rigor.

---

## 3. Confirmed strengths

- **Honest slice/branch prose exists and is thorough.** `sliceCaveat` (`:1515`), `sliceLabels`
  (`:1505`), the factor-case annotation (`:1651`), and `specializationLedger` (`:1532`) all encode
  the "this is a LOWER BOUND on a specialization" caveat, and it is appended to every relevant
  verdict. The *logic* of honest labeling is present (the gap is *visual*, see G2).
- **The `Certify univalence` verdict is genuinely well-composed** when reached: regime → certified
  real solve → per-solution univalence → gauge quotient → numeric cross-check, with distinct
  "Unique QD ✓" vs "At least k … LOWER BOUND" wording and a cross-check residual (`:1912-1938`).
- **`Existence / uniqueness` (`doClassify`) is the *honest* one:** it explicitly says "N real
  algebraic solutions … — run Certify univalence for the genuine-QD count (gauge copies merged,
  non-univalent ones filtered)" (`:1648`). The vocabulary distinction exists — it is just not
  applied on the marquee button (G3).
- **Positive-dimensional failure IS actionable** in the certify path: it computes
  `spuriousFactors` and offers one-click "Pin z₁ = 0" / "Split … into cases" buttons
  (`:1811-1825`) — an exemplar the other failure paths should copy (G7).
- **Active-hypotheses sidebar strip** (`renderHypotheses`, `:356`) shows real/imag/φ(0)/pinned
  chips and names the active branch — good persistent context.
- **Provenance-op tooltip coverage is strong.** Every constraint-palette button carries a math
  tip (`CONSTRAINT_BUTTONS`, `:53-61`); every analyze/reduce/export button has a `title=`.
- **`PROV_UI` is unit-tested for completeness** (`algebra-provui.test.ts`) — a missing op is a
  loud test failure, and the one intentional omission (`resolvent`) is documented (G-Q6, benign).
- **Auto-detected symmetry suggestions** (`renderSuggestions`, `:252`) surface one-click
  "Assume … real / Identify …" actions the moment an equation forces a relation — genuine guidance.

---

## 4. Findings

### G1 — No single "Prove existence/uniqueness" orchestrator; the authoritative verdict is a separate, collapsed, non-reducing button
**Severity: CRITICAL (workflow dead-end / rigor-misread)**

**Evidence.** Three entry points, three fidelities, no orchestration:
- `★ Auto-reduce & solve` — `doAutoSolve`, `algebra-ui.mjs:1542`. Chains auto-reality (`:1554`) →
  linear propagation ×4 (`:1560`) → `classifyAsync` (`:1568`) → `solveRealAsync` (`:1584`). **Stops
  at the algebraic real count. No `phiFromAlgebraSolution`, no univalence test, no `sameDomain`
  gauge quotient.**
- `Existence / uniqueness` — `doClassify`, `:1625`. Classify only (real count via Hermite).
- `Certify univalence` — `doCertifyUnivalence`, `:1785`. **The only path that filters univalence
  and quotients the gauge** (`:1858-1890`) — but it calls `classifyAsync(null,…)` /
  `solveRealCertifiedAsync` on the **current column as-is** (`:1798`, `:1837`); it does **not**
  auto-assume reality or propagate first. On an unreduced seed it lands in the
  positive-dimensional branch (`:1805-1827`).

The pinned marquee CTA (`class="small heavy-op"`, in `algebra-primary` header, `:825-826`) is the
*least* authoritative; the authoritative button sits in the **Analyze** `<details>` that is
**not** `open` (`:904`, contrast `:857`). Nothing chains reduce→certify; the user must manually
sequence them and must independently know that `Certify univalence` supersedes the other two.

**Why it harms the user.** The whole mission is a "semi-autonomous proof workflow … one
orchestrated pipeline". Today the user must (a) discover that `Certify univalence` is the real
answer, (b) know to reduce before certifying, and (c) do it in a section that is closed by
default. A mathematician who clicks the obvious star button walks away with a non-theorem.

**Fix direction.** Add one primary `Prove existence / uniqueness` action that runs the full
pipeline as a *single* orchestrated job — auto-reality → propagate → (Gröbner/triangular if
needed) → certified real solve → univalence filter → gauge quotient → cross-check — streaming a
live case/branch tree and ending on the composed certify verdict. Demote the three current buttons
to "advanced / step-by-step" affordances. At minimum, make `Certify univalence` internally run the
auto-reduce chain first and hoist it to the pinned header.

---

### G2 — Rigor legibility: the verdict card is one flat plain-text node; `≈` / `⚠ PARTIAL` / `LOWER BOUND` render identically to certified `=`
**Severity: CRITICAL (rigor-misread)**

**Evidence.** In the canvas verdict renderer the *entire* verdict — headline **and** every
caveat — is a single text node:
```
// algebra-canvas.mjs:438
const body = div('algebra-verdict-body'); body.textContent = data.text;
```
styled with the default text colour and no weight/size distinction:
```
/* style.css:798 */  #algebra-graph .algebra-verdict-body { color: var(--c-text, #222); }
```
There is **no `=` / `≤` / `≈` badge element** anywhere on the card. The rigor words are appended
into `data.text` as prose — e.g. the certify partial/undercount notes
`' · ⚠ PARTIAL: the numeric solver separated only … LOWER BOUND'` (`algebra-ui.mjs:1923`),
`' · ⚠ cross-check: …'` (`:1932`), the bifurcation `'⚠ the eliminant did not fully cross-check…'`
(`:2090`), and the whole `sliceCaveat` "[on the real slice only … a LOWER BOUND …]" string
(`:1518`) — all land in the same `body.textContent` as a fully-certified
`'… · real-solution count + locations certified (RUR + exact Sturm)'` (`:1938`).

The **only** visually-distinguished rigor signal is the amber "Computed under:" ledger
(`algebra-canvas.mjs:440-445`, `style.css:801-805`, `strong { color:#b54708 }`) — and it renders
**only** when `data.assumptions` is populated, i.e. for slice / φ(0) / factor specializations
(`specializationLedger`, `:1532`). It does **not** fire for `⚠ PARTIAL` numeric undercounts, for
`⚠ cross-check` residual failures, or for `≈` estimates — those have no visual marker at all.

**Why it harms the user.** Two verdicts that are epistemically worlds apart —
"Unique quadrature domain ✓ … certified (RUR + exact Sturm)" and
"At least 1 genuine quadrature domain … ⚠ PARTIAL … the genuine-QD count is a LOWER BOUND" —
occupy the same green-bordered card with the same body-text colour. At a glance (or in a
screenshot pasted into a paper) they are indistinguishable. This is exactly the "an `≈`/slice
result read as a certified `=`" failure the review exists to prevent.

**Fix direction.** Give the card a first-class **rigor badge** driven by a structured field on the
verdict object (`{ rigor: 'exact' | 'bound' | 'estimate' | 'partial' | 'unknown' }`), not by
substring-sniffing the prose: a coloured `=` / `≤` / `≈` / `⚠` chip in the header, plus a
distinct card border colour per tier. Route every `⚠ PARTIAL` / `⚠ cross-check` / `≈` through it
so no rigor caveat is prose-only.

---

### G3 — `★ Auto-reduce & solve` labels raw algebraic real solutions as "quadrature domains" and drops the "run Certify univalence" pointer
**Severity: HIGH (rigor over-claim on the most prominent button)**

**Evidence.** The marquee button's verdict:
```
// algebra-ui.mjs:1574-1578
else verdict = (cl.realCount == null ? … 
    : (cl.realCount === 0 ? 'No real quadrature domain'
      : cl.realCount === 1 ? 'Unique quadrature domain (1 real solution)'
        : cl.realCount + ' real quadrature domains') …
```
Compare the *honest* `doClassify`, which never calls an un-filtered algebraic solution a
quadrature domain and explicitly redirects:
```
// algebra-ui.mjs:1648
else verdict = r.realCount + ' real algebraic solutions' + tail +
  ' — run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones filtered).';
```
`doAutoSolve` has **no** such pointer, and its button `title` claims it will "determine
existence/uniqueness and the explicit real solutions" (`:826`) — but it never univalence-filters.

**Why it harms the user.** The single most prominent, star-marked button applies the *least*
careful label. "Unique quadrature domain" from a count that includes non-univalent algebraic
solutions and un-merged gauge copies is precisely the balayage-vs-algebra conflation the codebase
elsewhere is scrupulous about.

**Fix direction.** In `doAutoSolve`, say "N real *algebraic* solutions (on the real slice) — click
Certify univalence for the genuine-QD count", matching `doClassify`; and/or make the star button
continue automatically into the univalence certification (see G1).

---

### G4 — Verdict card does not state the CLASS and the EQUIVALENCE the count is modulo
**Severity: HIGH**

**Evidence.** The certify headlines (`:1912-1920`) read "Unique quadrature domain ✓ — 1 genuine QD
of N real solutions" / "D distinct quadrature domains of N real solutions". They never restate the
**class** ("classical *bounded* quadrature domain") and only mention the **equivalence** when
gauge copies were actually merged, as a parenthetical `'… gauge/rotation copies merged'`
(`:1893`) — when `gaugeMerged === 0` the modulus is absent entirely. The card title is the generic
`'Existence / uniqueness'` (`algebra-canvas.mjs:437`).

**Why it harms the user.** The mission requires "*exactly k bounded QDs up to rotation*" — a
uniqueness statement is meaningless without naming the admissible class and the equivalence. A
citable verdict must always read, e.g., "exactly 1 classical bounded quadrature domain with this
data, up to disk rotation", every time — not only when a rotation copy happened to be filtered.

**Fix direction.** Bake the class + equivalence into the verdict template unconditionally
("… classical bounded QD(s) with the given data, up to rotation of 𝔻"), and set a descriptive card
title. Surface the equivalence even when zero copies were merged.

---

### G5 — The "Computed under:" assumption ledger is incomplete
**Severity: HIGH**

**Evidence.** `specializationLedger` (the source of the amber card ledger) includes only real/imag
slices, φ(0)-fixed, and factor-case:
```
// algebra-ui.mjs:1532-1537
function specializationLedger(r) {
  const out = sliceLabels(r).map(…);
  if (store.w0Fixed) out.push('φ(0) fixed (rotation gauge)');
  if (r && r.partialBranch) out.push('Factor case … (branches add up)');
  return out;
}
```
It omits (a) **user-pinned variable values** from `Set values` — `store.knownValues()` minus `w0`,
which the sidebar hypotheses strip *does* show (`renderHypotheses`, `:366`: `pinned.map(…)`) but
the verdict-card ledger does not; and (b) the **formulation** (classical vs Schwarz `(★_S)`), which
changes the polynomial system (`columnLabel` notes it at `:2345` but the ledger never does). If a
user pins a *map* variable (e.g. `z₁ = 0` via Set values), the verdict is computed on a
specialization the card's "Computed under:" line never mentions.

**Why it harms the user.** The ledger is the card's promise that "you are seeing everything that
conditions this number". A pinned map-variable or a Schwarz-formulation choice that silently
narrows the domain, absent from the ledger, reintroduces exactly the hidden-specialization risk
the ledger was built to eliminate.

**Fix direction.** Feed the full active-hypotheses set (the same source as `renderHypotheses`) plus
the formulation into `specializationLedger`, deduping against slices already listed.

---

### G6 — Numeric solutions are dumped to the browser console, not shown in the UI
**Severity: HIGH**

**Evidence.** `doSolve` (the `Solve (numeric)` button) reports only a toast and a `console.table`:
```
// algebra-ui.mjs:2222-2228
toast('Solved: ' + r.solutions.length + ' solution(s)' … + '. See console for coordinates.', …);
try { console.table(r.solutions.map(…)); } catch (e) { … }
```
The tooltip likewise says "Solutions print to the console" (`ui-strings.mjs:309`). The coordinates
never reach the verdict card. (`doAutoSolve` at `:1591` builds a `solutionsText` table *and* also
console-tables, so it is better; the standalone `Solve` is not.)

**Why it harms the user.** A research mathematician will not open DevTools to read the output of a
proof tool. The result is effectively invisible in-app.

**Fix direction.** Render numeric solutions into the verdict card `solutionsText`/`solutionsLatex`
(as `doAutoSolve` already does), with a copy button; keep `console.table` as a convenience only.

---

### G7 — Cap / too-large failures name the CAS export in prose but do not surface it as an action
**Severity: MEDIUM**

**Evidence.** `withGuidance` appends a text hint to every cap/size failure:
```
// algebra-ui.mjs:1439-1442
return /export|cap|exceed|too large|step|basis|degree|terms/i.test(reason || '')
  ? (reason + '  Try: assume variables real …, or use the CAS export.') : reason;
```
This is shown via `showError` for Gröbner (`:1466`), dimension (`:2198`), solve (`:2217`), etc. —
but as **plain text in the error strip**, with no button. To actually run the CAS route the user
must scroll to the **Export** `<details>`, pick a column, pick a dialect, and hand-type the params
field (`copyCAS`, `:1095`). The exemplary pattern already exists in the *positive-dimensional*
certify branch, which offers one-click `Pin …` / `Split …` actions (`:1811-1825`) — but generic
cap failures don't deep-link or pre-fill the export.

**Why it harms the user.** The failure states are informative but not *actionable* in one click.
The mission asks that a failure name "the concrete next step, incl. the exact external-CAS/Maple
export" — right now the export exists but the failure doesn't hand you a pre-filled copy of it.

**Fix direction.** On a cap/size failure, render an inline `Copy Maple RCTD for this system`
(and msolve) button that pre-fills the current column + sensible params, next to the error.

---

### G8 — Three overlapping "existence/uniqueness"-flavoured buttons with no stated fidelity ordering; the authoritative one is the least discoverable
**Severity: MEDIUM (terminology / discoverability)**

**Evidence.** `Existence / uniqueness` (`:907`), `Solve (numeric)` (`:909`), `Certify univalence`
(`:910`), `Dimension / count` (`:908`), and the header `★ Auto-reduce & solve` (`:826`) all bear on
"how many quadrature domains are there", return different numbers, and give the user no cue as to
which supersedes which. `Certify univalence` — the authoritative composition — is visually the
*least* prominent (inside the collapsed **Analyze** section) while the weakest (`★ Auto-reduce &
solve`) is the pinned star CTA (see G1). The literature terms themselves are used consistently and
correctly (Schwarz function, Aharonov–Shapiro, univalence, quadrature data — e.g. `:479`, `:922`,
`ui-strings.mjs:337-349`); the inconsistency is *between panels*, in what each verdict button
*claims to compute*.

**Why it harms the user.** A first-time user cannot form a correct mental model of "which button
gives me the theorem". The labels imply parity where there is a strict hierarchy.

**Fix direction.** Collapse to one primary "Prove existence/uniqueness" (G1) and relabel the
remainder as explicit sub-steps ("Count real solutions (Hermite)", "Dimension", "Numeric solve"),
grouped under an "Advanced / step-by-step" heading, so the rigor ordering is legible from the labels.

---

### G9 — The verdict is transient (hidden on every graph edit); onboarding is a static strip + one wall-of-text help
**Severity: MEDIUM (progressive disclosure)**

**Evidence.** Every full render hides the verdict card:
```
// algebra-canvas.mjs:258 (inside render())
verdict.classList.add('hidden');   // a new render = a changed system; the old verdict is stale
```
So applying one more reduction, forking, or undoing wipes the on-screen verdict; there is no
persistent "current best verdict" surface — the user must re-run an analysis to see it again. The
only always-on guidance is the dismissible 4-label strip
`'① Seed  ② Assume / Set  ③ Reduce  ④ Analyze'` (`:821-824`, static text, not a guided flow) and a
single dense help paragraph (`ui-strings.mjs:356-373`) that lists every feature in one block rather
than a task-oriented "to prove existence, do X→Y→Z". The user is effectively dropped into the raw
node graph with the derivation, not the verdict, foregrounded.

**Why it harms the user.** The mission wants "the verdict-and-its-meaning surfaced FIRST, with
derivation/ideals/provenance on demand". Today the derivation is the permanent object and the
verdict is a fragile pop-over.

**Fix direction.** Make the verdict a persistent panel that survives edits (greyed "stale — re-run"
rather than hidden), and replace the static step strip with a live checklist that reflects what the
orchestrator has actually done.

---

### G10 — The minimap is column-granular and carries no lineage highlighting; limited value at realistic DAG sizes
**Severity: LOW–MEDIUM**

**Evidence.** `updateMinimap` draws one rectangle **per column lane**, not per node
(`algebra-canvas.mjs:355-368`: `track.querySelectorAll('.algebra-column').forEach(...)`). The
lineage highlighting (transitive ancestors/descendants of a selection) is real but lives on the
**main** graph only — nodes/edges get a `.lineage` class (`:123-157`, `:322-323`); it is **not**
reflected into the minimap. So the "lineage-highlighting minimap" is two separate features: the
minimap is purely a horizontal-scroll aid showing lane blocks. Across many forked tracks the
minimap shows only the **active** track's lanes (render filters to `activeTrack`, `:266-267`), so a
multi-branch derivation is never visible at a glance.

**Why it harms the user.** At dozens of nodes across forked tracks the minimap doesn't help locate
a specific node or see cross-branch structure; it mainly indicates scroll position.

**Fix direction.** Render nodes (not just lanes) in the minimap and mirror the `.lineage`
highlight into it; optionally show all tracks dimmed with the active one emphasised.

---

### G11 — PROV_UI / PROV_STORE sync (UI side): effectively complete; the one gap is latent
**Severity: LOW (informational — answers audit Q6)**

**Evidence.** The store's `PROV_STORE` includes a `resolvent` record (`algebra-store.mjs:117`),
which `PROV_UI` intentionally omits — documented in the test:
```
// algebra-provui.test.ts:28-32
// 'resolvent' has no custom UI label — it renders via the default — so it is intentionally not listed
```
Were a `resolvent` node ever added to the DAG, the UI fallbacks would render the **raw op-name**:
`provText` → `prov.op` = "resolvent" (`algebra-ui.mjs:2340`), `columnLabel` → "↳ column N"
(`:2350`), `edgeLabel` → "resolvent" (`:2372`). **In practice this never fires:** `resolventOf`
returns a *display result object* and adds **no** node (`algebra-store.mjs:1834-1852`); the
resolvent readout goes straight to the verdict card (`doResolvent`, `:2049`). So **no live store op
produces a node that PROV_UI cannot label.** The coverage test (`:40-42`) guarantees every
*contract* op has a record. The registry sync is sound; the only exposure is a latent raw-op-name
fallback if a future change starts persisting resolvent nodes.

**Fix direction.** None required now. If resolvent (or any new analysis) ever becomes a DAG node,
add a `PROV_UI.resolvent` record (the coverage test will force it).

---

### G12 — Minor KaTeX-path inconsistency
**Severity: LOW**

**Evidence.** Most math renders through the shared `QD.RiemannLatex.render` / the canvas
`renderKatex` wrapper with a text fallback (`algebra-canvas.mjs:46-52`). But the Shape-from-moments
/ Prony output calls the global `katex.render` directly with an ad-hoc try/catch fallback
(`algebra-ui.mjs:2157`, `:734`, `:784`), and the verdict-card headline is plain Unicode text
(`body.textContent`, `algebra-canvas.mjs:438`) so `φ`, `ζ`, subscripts appear as literal glyphs
rather than typeset math. Functional, but three different rendering paths for equivalent content.

**Fix direction.** Route all in-workspace math through `RiemannLatex.render` for a single fallback
behaviour; leave the plain-text verdict headline as-is (it is prose, not an equation).

---

## 5. Cross-reference to audit questions

| Q | Topic | Verdict | Findings |
|---|---|---|---|
| 1 | Guided workflow gap | **No orchestrator; authoritative verdict is separate + collapsed + non-reducing** | G1, G3, G8 |
| 2 | Rigor legibility | **Flat text; `≈`/`⚠`/slice read as certified `=`; ledger incomplete** | G2, G5 |
| 3 | Verdict completeness/actionability | Class+equivalence missing; failures partly actionable; numeric solve hidden | G4, G6, G7 |
| 4 | Terminology / tooltips | Literature terms consistent; **inter-button** fidelity unclear; tooltips well-covered | G8 (G11 for registry) |
| 5 | Progressive disclosure / DAG | Derivation foregrounded over verdict; verdict transient; minimap lane-only | G9, G10 |
| 6 | PROV_UI/PROV_STORE sync | **Complete in practice**; one documented, latent omission | G11 |

---

## 6. Single highest-leverage UX improvement

**Build the one orchestrated `Prove existence / uniqueness` action (G1) and give its result a
structured, badge-driven rigor tier (G2).** One primary button that internally runs
auto-reality → propagate → certified solve → univalence filter → gauge quotient → cross-check, and
emits a verdict object carrying an explicit `rigor` field the card renders as a coloured
`=`/`≤`/`≈`/`⚠` badge + class-and-equivalence headline. That single change closes the central
workflow gap *and* the central rigor-misread gap simultaneously — every other finding (G3–G9)
becomes either subsumed or a small follow-on.
