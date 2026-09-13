# M6 — presentation and publish: a staging plan

> Read [`PLAN.md`](PLAN.md) §7 (M6's line and its gate), [`research/02-pedagogy-misconceptions.md`]
> (research/02-pedagogy-misconceptions.md) §6–§8 and [`research/07-ux-explorables.md`]
> (research/07-ux-explorables.md) §6–§7 first.
>
> Same shape as [`M5-plan.md`](M5-plan.md): slices ordered by what each needs, each a shippable
> point, findings written as each lands.

**Scope:** figure & share export; the `#vs=` codec with diff-from-defaults and full re-validation on
restore; an a11y pass; the launcher card live; the `deploy-pages.yml` line.

**Gate (PLAN §7, unchanged):** published, permalinks round-trip, keyboard and screen-reader pass.

> **SPLIT, on §0.3's finding.** PLAN's M6 originally also carried the teaching layer, which its gate
> never mentioned. The teaching layer and the pen tool are now **[M7](M7-plan.md)**, with a gate of
> their own; M6 is exactly the milestone its gate describes. The Pólya work/flux toggle is
> **dropped** — see §3.

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
| a11y, measured | **2 findings, 2 nodes** (`landmark-one-main`, `page-has-heading-one`) — M6.0. `accCanvas` unannounced. |
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

> **DONE — and two of the three resize the slices below.**
>
> **(1) a11y: 2 findings, 2 nodes — and both are structural.** The first run of the audit this app has
> ever had (`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium node scripts/a11y-audit.mjs
> contour-integration`) reports `landmark-one-main` and `page-has-heading-one`, one node each,
> moderate. Confirmed from the DOM: **`main: 0, h1: 0, h2: 7, nav: 1`** — seven card headings starting
> at level 2 with no level 1 above them, and no `<main>`. **No `region` findings at all**, which the
> sibling baselines are dominated by. For scale: riemann-map 6, argument-principle 16, faber-transform
> 19. **This is the healthiest page in the suite bar the five that are clean**, so **M6.4 is `S`, not
> `S–M`**, and its baseline should land at `{}` rather than at a recorded residue.
>
> **(2) The permalink fits, and rounding is most of the headroom.**
>
> | payload | full URL | hash | JSON |
> |---|---|---|---|
> | gallery link (`{mode, record, fixture}`) | **178 B** | 108 B | 51 B |
> | sandbox worst case, floats at 4 dp | **960 B** | 890 B | 637 B |
> | the same, floats unrounded | **1 670 B** | 1 600 B | 1 170 B |
>
> Worst case = a hand-drawn dogbone (4 pieces with `side` tags), a three-factor declared product with
> per-factor windows and a sheet offset, two dragged cuts with midpoints, an off-origin camera and a
> contrast mode. Base64 costs ~1.4×, so research 07 §6's ~2 kB warning is a **~1.4 kB JSON budget**.
> Rounding to displayed precision is **74 % of the headroom** — not cosmetic, and it has to be in the
> schema from the first commit rather than retrofitted after a few drags have widened every float.
>
> **(3) The keyboard walk is healthier than the missing baseline suggested — 43 stops in sandbox, 27
> in gallery, wrapping cleanly with no trap and no dead end.** Every control is reachable: the mode
> toggle, the integrand field, the presets, the templates, the parameter sliders, the scrubber, the
> contrast toggles, both `<select>` pickers and the derivation's `<summary>`. Accessible names are
> real and live — the parameter sliders read `"a = 2"`, `"b = 1"`. *(I had flagged them as unnamed
> from a probe that read `aria-label ?? textContent`; an `<input>` has no text content, so that was
> the probe's bug, not the app's. Checked before it reached this file.)*
>
> **The one substantive gap it did find: two of three canvases carry no accessible name.**
>
> | canvas | role | name | tabindex |
> |---|---|---|---|
> | `ink` | `application` | the full pan/zoom/grab instructions | `0` |
> | `gl` (phase portrait) | — | — | — |
> | `accCanvas` (the accumulator) | — | — | — |
>
> `gl` is defensible — it sits behind `ink`, which `attachCanvasA11y` already names as the interactive
> surface with `render: glCanvas` — but it should say so with `aria-hidden` rather than merely be
> unnamed. **`accCanvas` is not defensible**: the head-to-tail vector sum is research 02 §8's **P0
> item 2**, the panel that document calls the hero, and it is completely unannounced. It is exactly
> the `role="img"` static-view case `@cas/ui`'s `attachCanvasA11y` was written for.
>
> **(4) One thing the walk raised that is NOT M6's.** The app's cold start is the **sandbox**, and
> research 07 §7.2 rule 1 is *"Example-first, sandbox last … the sandbox is reachable but never the
> landing state."* It does open a *solved* preset (`1/z`, `∮ = 2πi`), so it is not the empty-plane
> anti-pattern — but the landing mode is a **gallery-organisation** question, which is
> [M7](M7-plan.md)'s subject, not this milestone's. Recorded here so it is not lost.

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

### M6.4 — a11y to the gate · *S* — sized by M6.0, which found two findings and one real gap

- **`<main>` and one `<h1>`** — the two axe findings, and the whole of them.
- **`accCanvas` gets `attachCanvasA11y` with `role: "img"`**, and `gl` gets `aria-hidden`. The
  accumulator is the one canvas carrying the app's P0 picture and the one with nothing said about it.
- **The stage's text alternative is GENERATED FROM THE LEDGER**, never hand-written: *"a rectangle
  over the phase portrait of `e^{−z²+ibz}`; four pieces; encloses no singularities; the argument
  closes and the integral is `√π·e^{−1/4}`."* Free, because the ledger already says every clause of
  it — and it cannot drift, because it is derived rather than written.
- `prefers-reduced-motion`, currently unhonoured here.
- Baseline to **`{}`** — M6.0 says there is no residue to justify.

**Gate:** `node scripts/a11y-audit.mjs --strict` passes for this page; a keyboard-only walk reaches
every control; the stage announces its verdict.

> **This completes M6's gate.** The teaching layer follows as [M7](M7-plan.md).

---

## 2. Decisions taken

Recorded here rather than left to be re-derived, because §0.5's finding is precisely that a scoping
decision went unrecorded and was then invisible for two milestones.

1. **M6 is split.** The teaching layer (contrasting triads, the faded drill) and the pen tool move to
   **[`M7-plan.md`](M7-plan.md)**, with the gate PLAN never gave them. M6 becomes exactly its own
   gate: published, permalinks round-trip, keyboard and screen-reader pass. §0.3 is the reason — a
   scope item with no completion criterion cannot be finished, only abandoned or shipped on
   judgement.

2. **The pen tool is built, in M7.** It was M1's, deferred; the app README promises it; drill stage
   (iv) — *"you draw freely"* — is thin without it. Research 07 rule 6 supplies the grammar outright.

3. **The Pólya work/flux toggle is DROPPED.** Scoped into M3 ("round 3": *draw the conjugate field
   `f̄` on the Stage and read `∮f dz` as (work along) + i(flux across)*), never built, and never
   mentioned again — §0.5. It is now dropped **deliberately and on the record**, for three reasons:

   - Its stated job was *"it explains **why** the vanishing arcs vanish"*. That is already carried,
     and carried better, by the arc's own KILL row — which shows the certified bound, its exponent,
     and what it does in the limit, as a number rather than as a picture to be read.
   - It is a **second picture of `f`**, and research 02 §8's own anti-pattern list warns that the
     background picture is a textbook seductive detail: *"Do not let GPU domain colouring dominate:
     it is a picture of `f`, not of the integral."* A conjugate-field overlay is more of the same
     surface competing with the accumulator, which is the hero.
   - It would be the app's first visualisation with **no falsifiable claim attached** — nothing in it
     the engine could contradict. Every other surface in this app renders evidence the ledger
     produced.

   Recorded in [`PLAN.md`](PLAN.md) §7's *Deferred* list so it is not silently re-inherited. It is a
   drop, not a deletion of the idea: research 02 §8 P1 item 14 stands, and a future milestone that
   wants it should re-argue it against the three points above.

---

## 3. Risks

| # | risk | mitigation |
|---|---|---|
| R-a | **2,511 untested lines are where three of four workstreams land.** | M6.1 exists to retire this before anything else touches the file, with a proven-no-op refactor rather than a rewrite. |
| R-b | **A permalink that silently drops branch state restores a different integral behind the same picture** (§0.1). | The round trip is checked by verdict across the whole corpus, and restore re-validates through the loader rather than trusting the payload. |
| R-c | **The teaching layer had no falsifiable completion criterion** (§0.3). | Retired: split to [M7](M7-plan.md), which adopts the permalink-addressable-stage gate. M6 is now exactly its own gate. |
| R-d | **The accumulator browser test carries 9 committed screenshots.** | Any export-palette indirection (QD's `_pal`) churns them; change the palette path in its own commit so the churn is reviewable. |
| R-e | ~~`--strict` a11y is not enforced for this page, and its count is unknown.~~ | **Retired by M6.0:** measured at 2 findings / 2 nodes, both structural, with no residue to justify. |
