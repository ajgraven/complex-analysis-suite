# M6 — presentation, the teaching layer, and publish: a staging plan

> Read [`PLAN.md`](PLAN.md) §7 (M6's line and its gate), [`research/02-pedagogy-misconceptions.md`]
> (research/02-pedagogy-misconceptions.md) §6–§8 and [`research/07-ux-explorables.md`]
> (research/07-ux-explorables.md) §6–§7 first.
>
> Same shape as [`M5-plan.md`](M5-plan.md): slices ordered by what each needs, each a shippable
> point, findings written as each lands.

**Scope (PLAN §7):** figure & share export; the `#vs=` codec with diff-from-defaults and full
re-validation on restore; an a11y pass; the launcher card live; the `deploy-pages.yml` line. **Plus
the teaching layer, scoped (round 3): contrasting triads and fading only** — no prose lessons, no
prediction prompts, no self-explanation prompts.

**Gate (PLAN §7):** published, permalinks round-trip, keyboard and screen-reader pass.

---

## 0. The findings that shape this plan

### 0.1 This is the first gate that is not a number — and the permalink is where that bites

Every gate so far was *"these records solve to these values"*, falsifiable by arithmetic. M6's is
*"published, permalinks round-trip, keyboard and screen-reader pass"*: one third already true, one
third checkable by a job that exists, one third genuinely a judgement. The plan's job is to convert
as much as possible into this app's own idiom — **a claim the engine can falsify** — and to be
honest about the remainder.

The sharpest instance is the permalink, and it is not a convenience feature here.

> **In every other app in the suite, a dropped view-state field means a slightly different picture.
> In this one it means the app draws the SAME contour and computes a DIFFERENT integral.**

That is not hypothetical: it is M5.1's own shadowed-`branch` bug, where `renderDeclaration(branch)`
shadowed the module-level `branch` every handler assigns to, so changing the determination moved the
ANSWER while leaving the cut drawn where it was — the two then disagreeing about where the
discontinuity is, which is the one thing "declaring the determination IS declaring the cut" exists to
prevent. TypeScript caught none of it, because assigning to a parameter is legal and both sides have
the same type.

**So the round trip must be verified by VERDICT, not by field equality**: encode → decode → re-run →
the same closed form and the same ledger rows. Field-by-field equality would have passed that bug.

### 0.2 The one file M6 must edit has no tests

`src/shell/app.ts` is **2,511 lines** and is reached by **zero** tests — grep for `mountApp` or
`shell/app` across the app's 90 test files returns nothing. Every sibling app with a permalink has a
`test/viewState.test.ts`; the closest full-shell precedent in the repo is QD's
`vitest/qd-url-state.test.ts` (jsdom, `history.replaceState` spies, hostile-input cases).

Three of M6's four workstreams land in that file. Its state — `mode`, the integrand, the record and
fixture selection, the contrast mode, the `SandboxDeclaration`, the cut system, the contour, the
camera — is currently a set of `let` locals inside `mountApp`'s closure, reachable by nothing.

**So the first slice is not a feature.** It is lifting that state into a `currentState()` /
`applyState()` pair, which is simultaneously what makes a codec possible and what makes the file
testable at all. Everything after it is cheap; without it, everything after it is untestable.

### 0.3 PLAN's M6 gate says nothing about the teaching layer

Read it again: *"published, permalinks round-trip, keyboard and screen-reader pass."* All three
clauses are presentation and publish. The teaching layer is in M6's **scope** paragraph with **no
completion criterion at all** — the one part of this milestone that cannot be finished because
"finished" is undefined for it.

That is the case for splitting (§3, decision 1), and for the gate this plan proposes for it if it
stays.

### 0.4 The contrasting triad is two fixtures of ONE record plus one record — measured

PLAN names the triad as `∫1/(1+x²)`, `∫cos x/(1+x²)`, `∫sin x/x`: *"near-identical integrands, three
different ledger outcomes"*. Run against the corpus, "near-identical" turns out to be an
understatement — the first two are **the same record at two bindings**:

| cell | record @ fixture | the arc's KILL row | CATCH |
|---|---|---|---|
| `∫1/(1+x²)` | **B1** `jordan-cosine-kernel` @ `a=0, b=1` | plain **ML**, `deg Q − deg P = 2 ≥ 2`, bound 8.378e-1 | 1 enclosed |
| `∫cos x/(1+x²)` | **B1** @ `a=1, b=1` | **Jordan**, `(π/\|a\|)·max\|g\|`, bound 2.094e-1, **upper** semicircle | 1 enclosed |
| *(free fourth cell)* | **B1** @ `a=−1, b=1` | Jordan, **lower** semicircle — the half-plane FORCED by the sign of `a` | 1 enclosed |
| `∫sin x/x` | **C1** `indented-sinc` | four KILL rows: `left`, **`indent`** (`iα·Res`, swept `−1π`), `right`, `bigarc` | **0 enclosed** |

Three consequences for the design:

1. **The contrast needs no new data, only a view.** Three of the four cells are one record at three
   parameter values, so *"same integrand, different lemma"* is literal rather than approximate.
2. **It is a two-step ladder, not a flat triad.** B1→B1 differs in **exactly one row** (the arc's,
   and the engine switches lemma because Jordan's constant `π/|a|` is `∞` at `a = 0` and says
   nothing). B1→C1 differs in **two places at once** — the piece list gains an indentation, and
   CATCH drops from **1 enclosed to 0**, the whole answer coming from `iα·Res`. Presenting those as
   one uniform "triad" would flatten the more interesting of the two differences.
3. **The claim is checkable**, which is what makes this belong in this app: a contrast declares
   *which rows differ*, and a test verifies that exactly those differ and the rest agree. An engine
   change that made B1 @ `a=0` cite Jordan would fail it.

And the fifth cell is already paid for: the **M3 gate** pins that closing `∫cos x/(1+x²)` *downward*
makes the bound diverge and names KILL. Research 02 §7's *"let wrong contours fail informatively"*
becomes a cell in the grid rather than a separate mode.

### 0.5 Two items were scoped in earlier milestones and never built — one silently

| item | scoped in | status |
|---|---|---|
| **Pen tool** (free-hand path editing) | **M1** — *"Path model …; pen-tool editor; the piece list"* | Not built. Named as outstanding in the app README, so at least it is visible. |
| **Pólya work/flux toggle** | **M3** — *"**Pólya work/flux toggle** (round 3): draw the conjugate field `f̄` … It belongs here rather than in M1 because it explains *why* the vanishing arcs vanish"* | Not built, and **the M3 gate note does not mention it**. It simply is not there. |

This is the one place the project's documentation has slipped, and the plan should not inherit it
silently. Both are decisions (§3), not assumptions.

### 0.6 What already exists, verified against the repo

| | status |
|---|---|
| `deploy-pages.yml` line | **done** — `cp -r apps/contour-integration/dist _site/contour-integration` |
| Launcher card live | **done** — and a stale duplicate *"Coming soon … not yet part of the published site"* card was still beside it, deleted on the way into this plan |
| `@cas/interchange` view-state transport | **exists** — `encodeViewState`/`decodeViewState`, `#vs=`, forward-compat contract. **8 apps** carry their own schema on it (150–260 lines each, each with a test). Not a dependency of this app. |
| `hashchange` re-hydration | **nothing in the repo does it.** Boot-time read + `history.replaceState` on settle is the house idiom; there is no live re-hydration precedent to copy. |
| `@cas/export` PNG `tEXt` | **exists**, 6 consumers. Convention is two keys: `Software`, and **`cas:state` = the permalink** — so the figure carries its own link, and **the export is blocked on the codec**. |
| `ClipboardItem`, sync-in-gesture | 3 precedents (CD, the plotter, QD). The plotter's is the form PLAN names. |
| `@cas/ui` | **3 of 4** primitives adopted — `runWithFatalBoundary`, `mountNavHeader`, `attachCanvasA11y` (on `inkCanvas`, with a live region and a full key handler). `mountCanvas` unused (canvases hand-rolled); `createComputeClient` unused. |
| a11y audit roster | **the app IS in `scripts/a11y-audit.mjs`'s `PAGES`** … |
| a11y **baseline** | … **and is ABSENT from `scripts/a11y-baseline.json`** (16 page entries, none of them this app). `diff()` treats a missing baseline as `{}`, so **every finding currently reports as a regression** — and **its violation count is unknown, because nothing has ever recorded it**. |
| `prefers-reduced-motion` | **not honoured anywhere in this app.** Argument-Principle and Complex-Dynamics honour it; research 07 rule 7 requires it. |
| The stage | **three** canvases — `glCanvas` (WebGL2 phase), `inkCanvas` (2-D contour), `accCanvas` (accumulator). A figure export must composite them; Riemann-Map's combined-plate export is the precedent. |
| Teaching-layer code | **none.** Attach points are precise: the mode toggle (`setMode`, app.ts:969), the tier-grouped `<optgroup>` record picker (:434–456), the seven rail cards (:473–484), and `DERIVATION_STAGES` — already introspectable data. |

---

## 1. The slices

### M6.0 — measure, before anything is built · *XS*

The arc's own discipline: three numbers this plan should not guess.

- **Record the a11y baseline.** Build, run `node scripts/a11y-audit.mjs`, read the count. M6.4 is
  sized from that number and currently nobody knows it.
- **Measure the worst-case permalink payload** against research 07 §6's ~2 kB warning: the sandbox
  with a declared product, a multi-point dragged cut, a sheet offset and a camera. If it is over,
  the schema changes before it is written, not after.
- **Walk the app by keyboard only** and record where it stops.

**Gate:** the three numbers are in this file.

### M6.1 — the shell gets a state object, and its first test · *M*

The enabling slice, and no user-visible change.

- `currentState()` / `applyState(s)` over `mountApp`'s locals; the closure keeps owning them.
- `test/shell.test.ts` (jsdom), on QD's `qd-url-state.test.ts` model.
- **A proven no-op**, by M5.6b's discipline: dump every record × fixture's rendered result before
  and after and diff byte for byte, rather than inferring it from a green suite.

**Gate:** `applyState(currentState())` is a fixed point for all 28 records and for a sandbox state
carrying a declared branch, a sheet offset and a dragged cut.

### M6.2 — `#vs=`, verified by verdict · *M*

- `src/shell/viewState.ts` on `@cas/interchange`, namespace `"ci"` — the 8-app idiom.
- **Semantics, not samples** (research 07 §6): the contour serialises as its piece list, never as
  sampled points. Resolution-independent, far smaller, and it survives a schema bump.
- **Diff from defaults**: a gallery link is `{record, fixture}` and nothing else.
- **Re-validation on restore**: the restored state goes back through the same loader and `analyse`
  path the app always uses. An unknown record id, or a declaration that fails `splitCheck`, **refuses
  and says so** rather than drawing something plausible.

**Gate:** for all 28 records × every fixture, encode → decode → re-run → **identical closed form and
identical ledger claims** (§0.1: by verdict, not by field). Plus sandbox states with a declared
branch. A truncated or foreign hash refuses by name.

### M6.3 — the figure carries its own permalink · *S–M*

- `@cas/export`'s `injectPngText`: `Software`, and `cas:state` = the permalink (the house
  convention, 6 apps).
- Composite the three canvases (Riemann-Map's combined plate).
- Sync `ClipboardItem` inside the user gesture (the plotter's form).
- **The honest bit:** the metadata carries the **verdict** too, so a figure exported from an argument
  that does not close says so in its own bytes rather than looking like one that does.

**Gate:** a PNG round-trips — `readPngText` → `decodeViewState` → the same verdict as the session it
came from.

### M6.4 — a11y to the gate · *S–M, sized by M6.0*

- `<main>`, landmarks, one `h1` — the sibling baselines say `region` and `landmark-one-main` are what
  axe wants, and this shell builds bars and `section.card` rails with no `<main>`.
- **The stage's text alternative is GENERATED FROM THE LEDGER**, never hand-written: *"a rectangle
  over the phase portrait of `e^{−z²+ibz}`; four pieces; encloses no singularities; the argument
  closes and the integral is `√π·e^{−1/4}`."* Free, because the ledger already says every clause of
  it — and it cannot drift, because it is derived rather than written.
- `prefers-reduced-motion`, currently unhonoured here.
- Baseline to zero, or to a **named residue with a stated reason**.

**Gate:** `node scripts/a11y-audit.mjs --strict` passes for this page; a keyboard-only walk reaches
every control; the stage announces its verdict.

> **This completes PLAN's stated M6 gate.** Recommended ship point.

---

## 2. The teaching layer

Proposed as **M7** (§3, decision 1), with the gate PLAN does not give it.

### M7.1 — the contrast grid · *M*

- The ladder of §0.4, as gallery **organisation**: a second ordering over the same 28 records,
  attaching at the tier-grouped `<optgroup>` picker.
- A declared `contrasts` datum naming, per adjacent pair, **which ledger rows differ** — and a test
  verifying that exactly those differ and the rest agree.
- The fifth cell is the M3 gate's own wrong-way closure: research 02 §7's *"let wrong contours fail
  informatively"* as a cell, not a mode.

**Gate:** every declared contrast's difference set is verified against the engine.

### M7.2 — the faded drill · *M–L*

Four stages over machinery that already exists: (i) contour given + ledger filled — today's app;
(ii) the per-row verdicts masked, the learner asserts each, then reveal and compare; (iii) given a
target, pick a contour from a menu and let the existing ledger pass or fail it diagnostically;
(iv) draw freely — the sandbox. Progress in `localStorage` (Riemann-Map's theme precedent), fading
tied to it (expertise reversal, research 02 §6). **No prose, no prompts** — PLAN's round-3 scope.

**Proposed gate (PLAN gives none):** each stage is **addressable by permalink**, so a teacher can
link a student to stage 2 of a named record — which puts the drill's state inside M6.2's codec and
therefore under M6.2's round-trip test. That is the only formulation I can find that makes the
teaching layer falsifiable in this app's own idiom.

### M7.3 — the pen tool · *M* — if taken (§3, decision 2)

Research 07 rule 6 gives the grammar outright: click = corner, drag = arc, click-the-start = close,
Backspace = drop last, Esc = abort, Ctrl = constrain, with a live preview of the pending segment.
Drill stage (iv) is thin without it.

---

## 3. Decisions I need

1. **Split M6?** Ship M6 = §1 (presentation + publish), which is exactly PLAN's stated gate; move
   the teaching layer to M7 with the gate proposed in §2. **Recommend: yes** — §0.3.
2. **The pen tool** (M1's, deferred; promised in the README; wanted by drill stage iv): build in M7,
   or keep deferred and say so in the README?
3. **The Pólya work/flux toggle** (M3's round-3 scope, never built, never mentioned again): build, or
   formally drop with a recorded reason? **Lean: drop, recorded.** It is a second picture of `f`, and
   research 02 §8's own anti-pattern list warns that the background picture is a textbook seductive
   detail; its stated job — *"it explains why the vanishing arcs vanish"* — is already carried by the
   arc's own KILL row, which shows the certified bound, its exponent and its limit. But it was a
   round-3 decision and reversing one should not be mine.

---

## 4. Risks

| # | risk | mitigation |
|---|---|---|
| R-a | **2,511 untested lines are where three of four workstreams land.** | M6.1 exists to retire this before anything else touches the file, with a proven-no-op refactor rather than a rewrite. |
| R-b | **A permalink that silently drops branch state restores a different integral behind the same picture** (§0.1). | The round trip is checked by verdict across the whole corpus, and restore re-validates through the loader rather than trusting the payload. |
| R-c | **The teaching layer has no falsifiable completion criterion** (§0.3). | Either split it out, or adopt the permalink-addressable-stage gate of §2. Not: ship it on judgement alone. |
| R-d | **Drill scope creep** — four stages × 28 records is a combinatorial temptation. | Scope the drill to the contrast set of §0.4, which is five cells drawn from two records. |
| R-e | **The accumulator browser test carries 9 committed screenshots.** | Any export-palette indirection (QD's `_pal`) churns them; change the palette path in its own commit so the churn is reviewable. |
| R-f | **`--strict` a11y is not currently enforced for this page, and its count is unknown.** | M6.0 measures before M6.4 is sized; the residue is named with reasons, not zeroed by suppression. |
