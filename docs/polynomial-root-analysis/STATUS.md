# Polynomial Root Analysis — status: read first, update last

Plan: [`PLAN.md`](PLAN.md) · Spec: [`DESIGN.md`](DESIGN.md) · Record: [ADR-0047](../DECISIONS.md#adr-0047) ·
Evidence: [`research/`](research/) · Branch of record for the planning round: `claude/polynomial-galois-suite-7iqcb2`.

**Rule (inherited from M8):** do the step named under _Current_, update this file, commit, push. Never
end a session with unpushed work. A step that cannot be done as written is recorded under _Findings_,
not silently changed.

## Current

**PRA-1 — the two panes** (PLAN §7), awaiting the owner's go-ahead. Start by re-reading the
Findings below that name PRA-1 (the `polishRoots`/`cauchyBound` lift is a factoring-out, not a move;
the Aberth question is decided by measurement there).

## Done

- 2026-09-23 — **PRA-0.** Owner accepted ADR-0047 and the three PLAN §12 decisions. The app
  (`apps/polynomial-root-analysis`, port 5185, `@cas/ui` only) mounts a header, a notice and two empty
  named panes inside `runWithFatalBoundary`; wired into `vitest.workspace.ts`, the test census,
  `APP_NAMES`, the a11y roster + baseline, `.claude/launch.json` (`pra`), the launcher (_Coming soon_),
  README, ARCHITECTURE §8/§11, CLAUDE.md and the ideas file. Gate **623 files / 7116 tests** (622 / 7111
  before: +1 file / 5 tests, `test/scaffold.test.ts`). Sweep **11/11 killed** (role, label, labelling,
  replace-vs-append, notice, landmark containment, `<h1>`, `data-pane`, the missing-host throw, the
  boundary, the mount). `pnpm a11y polynomial-root-analysis launcher --strict`: clean, 14 interactive
  nodes, 0 unnamed; no horizontal scroll at 390 px.

- 2026-09-22 — two rounds of owner questions (answers recorded verbatim below), five research tracks,
  PLAN + DESIGN written, ADR-0047 drafted as _Proposed_ (as ADR-0046 until the collision below), the idea entered in
  `docs/design/future-app-ideas.md` as ▶ 8. No code touched.

## Findings (things learned while executing; each names its step)

- _(PRA-0, re-verifying PLAN against the tree)_ **Aberth lives in
  `apps/polynomial-roots/src/engine/aberth.ts`**, not the `src/engine/roots/` PLAN §6 names.
- _(PRA-0 → PRA-1)_ **`polishRoots` / `cauchyBound` are not exported anywhere.** `@cas/faber`'s
  `roots.ts` inlines both inside `polynomialRoots`; Contour Integration's `kernel/poles.ts` has private
  `cauchyBound` and `polish`. The PRA-1 lift into `@cas/core` is a factoring-out of two copies, each
  source's tests green before and after.
- _(PRA-0 → PRA-4)_ **`families/field.ts` and `families/linear.ts` import Contour Integration's `RatPi`
  and `formatExact`.** The lift into `@cas/exact` splits them: `Field<T>`, `FRAC_FIELD` and the
  elimination move; the ℚ(i)(π) instance stays in the app.
- _(PRA-0)_ PLAN §4.2 says `src/galois/`, DESIGN says `src/engine/galois/`; DESIGN's path is used.
- _(PRA-0)_ **Three §6.1 items are deferred to the step that makes them true, not skipped:**
  `scripts/check-built-artifacts.mjs` covers PUBLISHED apps that spawn a worker, and PRA-0 does
  neither — the row lands with the Galois worker (PRA-4); the root `test:browser` chain gets the app
  when it has a browser suite (PRA-2's shader test); the launcher's three SEO blobs list published tools
  only (Correspondences is not in them), so this app joins them at the publish gate (PRA-5) with the
  deploy `cp`. Separately, the root `test:browser` chain already omits Polynomial Roots'
  browser suite — noted, not this app's to fix.
- _(PRA-0)_ The empty panes are `role="img"` canvases whose names say they are empty: a canvas named
  for roots that draws none would be the page's first unearned claim. They become `application` with
  a keyboard map when PRA-1 wires the drags (PLAN §5.2 rule 10).

- _(planning)_ Quadrature Domains' `app/sym/sym-core.mjs` holds a complete Berlekamp–Zassenhaus
  factoriser, `𝔽ₚ` layer, Sturm isolation and Schur–Cohn counts, unreachable from TypeScript
  (research 05 §1). PLAN §6 ports rather than shims; QD keeps its copy under ADR-0008's exception.
- _(planning)_ The plotter's `src/riemann/` already holds a monodromy tracker, permutation-group code
  and lasso generators (research 05 §9). PLAN §7 PRA-3 extracts them as `@cas/monodromy`.
- _(planning, 2026-09-23)_ **PR #348 landed in parallel** — `apps/polynomial-roots` (ADR-0046, the
  Baez–Christensen–Derbyshire root-cloud renderer), taking ADR-0046, port 5184, the _Polynomial Roots_
  name, and bringing `APP_NAMES` current. Reconciled by merging master: this record is **ADR-0047**,
  the port **5185**, the ensemble overlay dropped (PLAN §1.2), `CET_C6` from `@cas/gpu`, and
  Polynomial Roots' app-local Aberth solver noted as a possible second-consumer extraction at PRA-1.
  Research 04's rows on `APP_NAMES`, the port list and `cetC6.ts` are stale by that PR and say so.
- _(planning)_ Two dev-server ports collide today (5176 plotter/riemann-map, 5177
  argument-principle/contour-integration; research 04 §1). Not this app's to fix.

## Open questions for the owner

None open. (PRA-0's three — ADR-0047, the PRA-5 publish gate, the two `@cas/ui` lifts — were
answered "Approved" on 2026-09-23.)

## Decisions taken during execution (the owner's answers, verbatim)

**PRA-0 (2026-09-23).** On the three PLAN §12 decisions and the roadmap: "Approved. Run PRA-0."

**Round 1 (before research).** 1 audience: "Default is perfect" (a strong undergraduate, a
researcher-usable sandbox). 2 "Sandbox for now, expository argument later." 3 coefficient field:
"Whatever's the largest set of polynomials you expect to be able to consistently compute Galois groups
for systematically. Or, failing that, preset families." 4 degree cap / tiers: "Sounds good for now."
5 real/rational modes: deferred to after research. 6 "Two panes, with a toggle which overlays them on
the same pane (perhaps using domain coloring for the polynomial plot, in addition to labeled roots)."
7 overlays: "Default is good, plus anything else you come across." 8 algebraic and monodromy groups:
"Both." 9 commutators: Arnold's loops, "That's exactly what I meant." 10 Galois correspondence: "I'd
like this as well." 11 proof line: Arnold, "Exactly." 12 contrast with solvable degrees: "Yes,
exactly." 13 hand-offs: "No handoffs for now." 14 references: defaults. 15 scale: "whatever scale is
appropriate for the ultimate size of the app."

**Round 2 (after research).** 1 tiers: default (Sₙ/Aₙ any degree `=`, `=` to degree 7, `≈` 8–15,
8–11 deferred). 2 ring modes ℂ/ℝ/ℚ: "Agree." 3 certified monodromy from the start: "Go with your
recommendation." 4 both loop mechanisms: "Agree." 5 families first-class: default. 6 correspondence
lattice: default (full for degree ≤ 5, derived series always). 7 formulas typed + gallery, Dummit
deferred: default. 8 tables: "Fetching is fine." 9 `@cas/exact` widened + one new package: "This
sounds good." 10 overlay order: "Looks good." 11 degree cap 24: "Sounds good." 12 name: **"Polynomial
Root Analysis"**. 13 ladder without narrative for now: "Yes, but narrative text is essential for the
final product (so should be in the longer term roadmap)." Surfaced ideas: "I like all of these ideas
which surfaced. Please add them to the longer-term roadmap." (PRA-9/PRA-10.)
