# Nav-header withdrawal — staged plan (ADR-0044)

Executes [ADR-0044](../../DECISIONS.md#adr-0044-withdraw-the-in-app-suite-navigation-header-the-launcher-is-the-unified-menu):
no in-app suite navigation header, in any app. Six stages, each a small reviewable commit that leaves
the gate green.

> **EXECUTED 2026-09-20, in one session, immediately after the M8 merge (`f318fe8`).** N0–N5 are
> done and N6's discovery half with them; the ADR's action items carry the per-stage detail. Three
> things the plan did not have right, each measured rather than assumed:
>
> 1. **N3's premise was false.** The plan and ADR-0044 §6 both say the new Contour-Integration shell
>    "simply never mounts a nav", so N3 was one STATUS.md line. It does mount one — M8 carried
>    M6.4's ordering fix forward deliberately, host and all — so N3 was real work: the host, the
>    call, six `--cas-nav-h` declarations, `nav.css` in `main.ts` and eleven browser specs, and two
>    structural assertions replaced rather than deleted.
> 2. **The footprint table undercounted the browser specs.** `@cas/ui/nav.css` was imported by
>    eleven of Contour Integration's `*.browser.test.ts` files, none of them listed — they mount the
>    real stylesheets because mounting without one gives not a plainer layout but a different one.
> 3. **N5's re-record was a no-op and is left un-recorded.** Not one rule or node count moved, so
>    `--update-baseline` produced a 44-line reordering that says nothing; it was reverted. The
>    accessibility-tree count is where the removal actually shows: **792 → 682**, exactly 11 nodes
>    (one home link + ten siblings) on each of the ten audited pages that carried the bar.

Total effort: one to two metered sessions.

**The one hard sequencing constraint.** Contour Integration's shell is being rebuilt right now
(ADR-0043 / M8, branch `claude/inspiring-keller-5sizwl`, Phase 0 merged as PR #340, Phase 1 builds
`src/shell2/` beside `src/shell/`). Its nav host is load-bearing — it is what lets the shell be a
`<main>` at all — so that app is **N3**, gated on M8, and never touched on this branch. The other four
apps have no such constraint.

**Order:** N1 (apps) → N2 (package) must run in that order — the dependency direction forbids
removing a package export while five call sites still import it. N4 and N5 follow the code. N3 rides
M8 whenever it lands. N6 is independent and can go any time.

**Footprint, measured.** Five apps, seven pages, 21 source lines and 15 stylesheet declarations (12 of
them in the four N1 apps, three in Contour Integration); three package files deleted and two edited;
one test file; nine documentation locations.

| app                 | pages | TS call sites                                          | CSS offsets                 | stage |
| ------------------- | ----- | ------------------------------------------------------ | --------------------------- | ----- |
| 2D Electrostatics   | 2     | `main.ts:8,9,33`, `main-polygon.ts:15,16,158`          | `main.css:63,114,360,413`   | N1    |
| Hele-Shaw Flow      | 2     | `main-droplet.ts:11,12,200`, `main-twist.ts:11,12,131` | `main.css:63,114,394`       | N1    |
| Potential Theory    | 1     | `main-potential.ts:10,11,265`                          | `main.css:63,116,396`       | N1    |
| 2D Hydrodynamics    | 1     | `main.ts:16,17,275`                                    | `panes.css:4,40,168`        | N1    |
| Contour Integration | 1     | `shell/app.ts:4,474`, `main.ts:8`                      | `app.css:57-64,696-700,944` | N3    |

---

## N0 — the decision · **DONE** · effort S

- [x] `docs/DECISIONS.md` — ADR-0044 appended, TOC row added.
- [x] This plan.
- [x] The CD remediation plan's _Decisions to record_ entry now points here.

**Note for N4:** the DECISIONS.md table of contents is missing rows for **ADR-0037, 0038, 0039, 0041,
0042 and 0043** — a pre-existing maintenance gap, not something this work introduced. I added only
0044's row, because the other six need their anchors derived from headings carrying em-dashes and
`ℚ(i)(π)`, and a guessed anchor is a broken link. Fixing all six is a two-minute job for whoever
verifies the anchors in a rendered preview; it is listed in N4 rather than done blind.

---

## N1 — drop the header from the four non-M8 apps · effort S · six pages

The app-side removal. Nothing in `@cas/ui` changes yet, so the tree stays green at every commit.

**Per page, three edits:**

1. Delete the `import "@cas/ui/nav.css";` line.
2. Drop `mountNavHeader` from the `@cas/ui` import list — **keep** the other named imports
   (`runWithFatalBoundary`, `attachCanvasA11y`, `mountCanvas`), which every one of these pages still
   uses. `@cas/ui` therefore stays a dependency in all four `package.json`s; no dependency-cruiser or
   lockfile change.
3. Delete the `mountNavHeader(app, { current: "…" });` call.

**Per stylesheet, collapse the offsets to their fallback** — do not leave dead `var()` calls. The
declarations already read `var(--cas-nav-h, 0px)`, so with the stylesheet gone they _already_ evaluate
to the right thing; this step makes that explicit rather than accidental:

- `top: var(--cas-nav-h, 0px)` → `top: 0`
- `inset: calc(var(--cas-nav-h, 0px) + 58px) 0 0 0` → `inset: 58px 0 0 0`
- `top: calc(var(--cas-nav-h, 0px) + 58px)` → `top: 58px`
- `top: calc(var(--cas-nav-h, 0px) + 96px)` → `top: 96px` (2D Hydrodynamics)
- `panes.css:4` — the comment explaining where `--cas-nav-h` comes from goes with it.

**Commit shape:** one commit per app (four commits), so a bisect names the app.

**Verify:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then open each of the six built
pages and confirm (a) no bar, (b) the app's own fixed toolbar sits flush at `y = 0` rather than 32 px
down with a gap, (c) no console error. The second check is the one that matters — it is the failure
mode if a `calc()` is missed.

**Risk:** low. The only way to break a page is to miss a `calc()`, which is visible in one screenshot.

---

## N2 — remove the primitive from `@cas/ui` · effort S · after N1

Now that nothing imports it:

- Delete `packages/ui/src/navHeader.ts`, `packages/ui/src/nav.css`, `packages/ui/src/apps.ts`.
- `packages/ui/src/index.ts` — drop the `mountNavHeader`, `NavHeaderOptions`, `NavHeader`,
  `HandoffConfig`, `SUITE_APPS` and `SuiteApp` exports (lines 25–29); the header comment's "four
  primitives … and cross-app navigation" becomes three.
- `packages/ui/package.json` — drop the `"./nav.css"` export entry and strike "and the suite
  navigation header" from `description`.
- Delete `packages/ui/test/navHeader.test.ts` (6 tests). The package keeps four test files; its jsdom
  environment is still exercised by `mountCanvas.test.ts`, so the first-jsdom-package property that
  ADR-0032 records is unaffected.

**The one judgement call, flagged for sign-off.** Deleting `apps.ts` removes `SUITE_APPS`, the suite's
only machine-readable app registry. Verified: after N1 + N2 nothing imports it, and the two places
that _do_ enumerate the apps (`scripts/a11y-audit.mjs`, `.github/workflows/deploy-pages.yml`) carry
their own hard-coded lists and are untouched. ADR-0044 §3 decides to remove it; if you would rather
keep it against a future need, say so and N2 keeps `apps.ts` and its export — the cost is one exported
constant with no consumer, which is exactly what ADR-0007 exists to prevent, and git history holds it
either way.

**Verify:** full gate, plus `pnpm --filter @cas/ui test` (test count drops by 6) and a grep proving
zero remaining references: `grep -rn "mountNavHeader\|cas-nav\|SUITE_APPS\|nav\.css" apps packages
--include=*.ts --include=*.css --include=*.html | grep -v node_modules | grep -v dist` should return
only Contour Integration's lines until N3 lands.

---

## N3 — Contour Integration, through M8 · effort S · gated on M8, not on this branch

This app is different in three ways and each needs a deliberate touch:

1. **The nav host is structural.** `src/shell/app.ts:471-474` builds a `.navHost` and does
   `root.replaceChildren(navHost, shell)` specifically so the shell can be a `<main>` — a landmark
   containing site navigation is not what `<main>` means (M6.4 finding #1). With the nav gone it
   becomes `root.replaceChildren(shell)` and `.navHost` is deleted from `app.css:696-700`.
2. **Two structural tests assert the nav.** `test/shell.test.ts:521-531` ("puts the suite nav BEFORE
   `<main>`") is replaced, not deleted, by the invariant that survives: `.cas-nav` is absent, there is
   exactly one `<main>`, and it is the root's first element. The sibling test at `:511` (one `<main>`,
   one `<h1>`) is unaffected.
3. **Its layout compensates for the bar.** `app.css:57-64` carries a long comment recording that the
   app "adopted the nav without the offset, so the top 32 px of its 48 px bar — the brand, the
   integrand box and five of the seven presets — were covered, and because the nav sits at z-index 6
   it swallowed every click in that band as well". That is the sharpest single piece of evidence for
   ADR-0044, so the comment is not merely deleted: one sentence of it moves to the ADR's record
   (already quoted in §Context) and `margin-top` / `height` collapse to `0` / `100vh`, with
   `app.css:944`'s `min-height: calc(100vh - var(--cas-nav-h, 0px))` becoming `100vh`.

**How it lands.** M8 Phase 1 writes `src/shell2/` from scratch — so the new shell simply never mounts
a nav and never grows a `navHost`, which costs zero extra work if it is decided before that step is
written. The old `src/shell/` and its test go when M8 retires them. **Action now:** add a line to
`docs/contour-integration/M8/STATUS.md` under _Findings_ recording ADR-0044, so the session that
writes step 1.1 does not build a nav host it will have to remove. That one line is the whole of N3's
work on this branch.

---

## N4 — documentation sweep · effort S · after N2

Nine locations, all pure doc edits, one commit:

| file                               | what changes                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md:44-45`                  | locked decision 8 — drop "plus a shared nav header later"; the launcher clause stands                                                                                                         |
| `CLAUDE.md:275`                    | the `@cas/ui` primitive list — four become three                                                                                                                                              |
| `CLAUDE.md:284`                    | strike the "Still open: **U7**" sentence; `@cas/ui` has no open action item after this                                                                                                        |
| `CLAUDE.md:1247-1248`              | ADR-0036 Stage 3 — "adopted the shared nav header … suite-wide rollout to follow" → withdrawn per ADR-0044                                                                                    |
| `docs/ARCHITECTURE.md:22,164`      | the `@cas/ui` blurbs — drop "a nav header" from both primitive lists                                                                                                                          |
| `docs/ARCHITECTURE.md:439,457-458` | §11 item 2 (the whole "shared navigation header (piloted in three apps; suite-wide rollout is the open U7)" item) is replaced by a sentence recording that it was piloted, withdrawn, and why |
| `docs/VISION.md:172-173`           | "a launcher page +, later, a shared navigation header" → the launcher page                                                                                                                    |
| `docs/RISKS.md:146`                | "(launcher + shared nav)" → "(launcher)"                                                                                                                                                      |
| `README.md:122,147`                | the package-tree line and the extraction note — drop the nav header from `@cas/ui`'s description                                                                                              |

Plus the two carry-overs: the **DECISIONS.md TOC rows for 0037–0039 and 0041–0043** (verify each
anchor in a rendered preview before committing), and striking the nav item from the CD review's own
REPORT.md §4 list so the report and the decision agree.

**Verify:** `pnpm format:check`, and
`grep -rni "nav header\|shared nav\|mountNavHeader\|U7" docs CLAUDE.md README.md` returns only
ADR-0044, ADR-0032's own (append-only, historical) text, and this plan.

---

## N5 — rebuild, re-audit, re-baseline · effort S · last

1. `pnpm build` the whole suite (the a11y roster serves the real `apps/*/dist` bytes).
2. `node scripts/a11y-audit.mjs` and diff against `scripts/a11y-baseline.json`.
3. **Explain every delta before recording it.** A `<nav aria-label="Suite navigation">` landmark
   disappears from seven pages, so the `region` rule ("all page content should be contained by
   landmarks") can move in either direction: content that was inside the nav is gone (fewer nodes),
   but a page whose only landmark _was_ the nav could gain findings. The current baseline has
   `region: 1` on 2D Electrostatics (both pages) and Hele-Shaw (both) and `{}` on Potential Theory,
   2D Hydrodynamics and Contour Integration. If any count **rises**, that is a real regression to fix
   with a landmark in the app, not to absorb into the baseline.
4. `node scripts/a11y-audit.mjs --update-baseline`, then `--strict` to confirm clean.
5. Spot-check the six N1 pages in a real browser at 1440×900 and 390×844 — the phone width is where a
   32-px bar was most likely to be masking a layout problem underneath it.

---

## N6 — where the hand-off UX lives now · effort S · independent

ADR-0044 §4 decides that a hand-off belongs in the panel that owns the state, not in a bar. That is
already true in code; this stage makes it _findable_, which is the half of U7's problem that was real.

- **Inventory (verified):** three `window.open` hand-off buttons —
  `apps/complex-dynamics/src/main.ts:6444` ("Riemann Map ↗", inside the Exterior-map panel),
  `apps/complex-function-plotter/src/main.ts:1615`, `apps/riemann-map/src/main.ts:1225` — plus the
  inbound deep links (`#s=` QD → CD, QD → Hele-Shaw) and CD's "Import map…".
- **Make them consistent:** one label convention (`→ <App name>`), one `title` naming what is sent
  ("sends the Laurent coefficients of ∂K as a `map` payload"), and each one sited in the panel that
  produced the payload. No new component, no package change.
- **Make them discoverable:** [`docs/INTERCHANGE.md`](../../INTERCHANGE.md) gains a short table —
  producer app · panel · payload kind · consumer app · where it lands — which is the discovery surface
  U7 was reaching for, in the place a reader actually looks for it.
- CD's end of this (replacing `window.prompt` with a paste dialog) is **already scoped** as WP10 of
  the [remediation plan](REMEDIATION-PLAN.md); do not duplicate it here.

---

## Done when

- `grep -rn "mountNavHeader\|cas-nav\|--cas-nav-h\|SUITE_APPS" apps packages docs CLAUDE.md README.md`
  returns only ADR-0032's historical text, ADR-0044, and this plan.
- The full gate is green and `pnpm --filter @cas/ui test` is green with six fewer tests.
- The a11y baseline is re-recorded with every delta explained, and `--strict` passes.
- All seven pages render with their own toolbar flush at the top of the viewport.
- ADR-0044's six action items are ticked.
